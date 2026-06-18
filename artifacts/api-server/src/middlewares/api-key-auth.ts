import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, userApiKeysTable, usersTable, type User, type UserApiKey } from "@workspace/db";
import {
  decryptSecret, verifySignature, buildSignaturePayload,
  parsePermissions, parseIpWhitelist, normaliseIp,
  type Permission,
} from "../lib/api-key-crypto";

// Use the global Express namespace form here. The express-serve-static-core
// module-augmentation form (used in lib/auth.ts for req.user) doesn't always
// resolve when re-declared from a second file in the same project; the global
// namespace form sidesteps the module-resolution requirement entirely.
declare global {
  namespace Express {
    interface Request {
      apiKey?: UserApiKey & { perms: Permission[] };
    }
  }
}
export {};

// Anti-replay window. The client clock can drift; ±5 min is the same window
// Binance/Bitfinex use and is plenty for any honest client. Outside this window
// we reject so a captured signed request can't be replayed days later.
const TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

// Header names match the public ApiDocs page (artifacts/user-portal/src/pages/ApiDocs.tsx).
const H_KEY = "x-zbx-apikey";
const H_TS  = "x-zbx-timestamp";
const H_SIG = "x-zbx-sign";

// ───────────────────────────────────────────────────────────────────────────
// Per-key token bucket. The IP-based globalLimiter (10 rps) is too coarse for
// HFT-style API clients but also too generous against an attacker brute-forcing
// signatures from a botnet. We add a SEPARATE per-keyId bucket that runs AFTER
// the cheap header/timestamp/lookup checks but BEFORE the expensive AES decrypt
// + HMAC verify, so a flood of bogus-signature requests can't burn CPU.
// Numbers chosen for an honest trading bot: 30 rps sustained, 60 burst.
// ───────────────────────────────────────────────────────────────────────────
const RPS_REFILL_PER_MS = 30 / 1000; // 30 tokens per second
const BUCKET_CAP        = 60;
type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();
// Cap memory at ~10k unique keys; if we ever blow past that the oldest entry is
// evicted. In practice a single instance won't see anywhere near that many
// distinct API keys per minute.
const BUCKETS_MAX = 10_000;

function takeToken(keyId: string): boolean {
  const now = Date.now();
  let b = buckets.get(keyId);
  if (!b) {
    if (buckets.size >= BUCKETS_MAX) {
      const firstKey = buckets.keys().next().value;
      if (firstKey !== undefined) buckets.delete(firstKey);
    }
    b = { tokens: BUCKET_CAP, updatedAt: now };
    buckets.set(keyId, b);
  } else {
    const refill = (now - b.updatedAt) * RPS_REFILL_PER_MS;
    b.tokens = Math.min(BUCKET_CAP, b.tokens + refill);
    b.updatedAt = now;
  }
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// lastUsedAt debounce. A bot doing 50 rps would otherwise hammer the same row
// 50 times/sec; we only need ~minute resolution for the UI's "Last used" cell.
// In-memory map of keyId → ms-of-last-flush; 60s minimum between writes.
// ───────────────────────────────────────────────────────────────────────────
const LAST_USED_FLUSH_MS = 60 * 1000;
const lastUsedFlushedAt = new Map<string, number>();

function reject(res: Response, code: number, error: string, hint?: string): void {
  res.status(code).json(hint ? { error, hint } : { error });
}

/**
 * Authenticate an HMAC-SHA256 signed request and (optionally) gate it on a
 * per-key permission. Mounts behave like requireAuth — sets req.user — and
 * additionally exposes req.apiKey for permission/audit logic downstream.
 *
 * Required headers:
 *   X-ZBX-APIKEY:    <keyId>
 *   X-ZBX-TIMESTAMP: <unix-millis>
 *   X-ZBX-SIGN:      hex(HMAC-SHA256(secret, timestamp + METHOD + path + rawBody))
 *
 * Failure modes (all return JSON {error, hint?} so SDKs can surface a useful message):
 *   401 missing_headers / invalid_timestamp / unknown_key / bad_signature / key_disabled / key_expired
 *   403 ip_not_whitelisted / missing_permission / account_suspended
 */
export function requireApiKey(...needed: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const keyId = String(req.headers[H_KEY] ?? "").trim();
    const tsRaw = String(req.headers[H_TS]  ?? "").trim();
    const sigHex = String(req.headers[H_SIG] ?? "").trim();

    if (!keyId || !tsRaw || !sigHex) {
      return reject(res, 401, "missing_headers", `Provide ${H_KEY.toUpperCase()}, ${H_TS.toUpperCase()}, ${H_SIG.toUpperCase()}.`);
    }

    const ts = Number(tsRaw);
    if (!Number.isFinite(ts)) return reject(res, 401, "invalid_timestamp", "Timestamp header must be unix millis.");
    const drift = Math.abs(Date.now() - ts);
    if (drift > TIMESTAMP_SKEW_MS) {
      return reject(res, 401, "invalid_timestamp", `Clock skew ${Math.round(drift / 1000)}s exceeds ±${TIMESTAMP_SKEW_MS / 1000}s window.`);
    }

    // Look up the key + its owning user in one round-trip.
    const [row] = await db
      .select({ key: userApiKeysTable, user: usersTable })
      .from(userApiKeysTable)
      .innerJoin(usersTable, eq(usersTable.id, userApiKeysTable.userId))
      .where(eq(userApiKeysTable.keyId, keyId))
      .limit(1);

    if (!row) return reject(res, 401, "unknown_key", "API key not found.");
    const { key, user } = row;

    if (key.status !== "active")             return reject(res, 401, "key_disabled", "This API key has been disabled.");
    if (key.expiresAt && key.expiresAt < new Date()) return reject(res, 401, "key_expired", "This API key has expired.");
    if (user.status !== "active")            return reject(res, 403, "account_suspended", "Owning account is not active.");

    // Per-key token bucket — runs BEFORE the expensive AES-GCM decrypt and
    // HMAC verify so an attacker spamming bogus signatures can't burn CPU.
    if (!takeToken(key.keyId)) {
      return reject(res, 429, "rate_limited", "API key request rate exceeded (30 rps sustained, 60 burst).");
    }

    // Trust-proxy is set to 1 in app.ts so req.ip is the real client (the
    // Replit edge already strips/canonicalises forwarded headers). Using req.ip
    // means the user can't spoof their own X-Forwarded-For to bypass IP gates.
    const callerIp = normaliseIp(req.ip || req.socket.remoteAddress || "");

    // IP whitelist (optional). We compare the de-mapped IPv4 form so users can
    // whitelist "1.2.3.4" without worrying about ::ffff: prefixes.
    const allow = parseIpWhitelist(key.ipWhitelist);
    if (allow.length > 0) {
      if (!callerIp || !allow.map(normaliseIp).includes(callerIp)) {
        return reject(res, 403, "ip_not_whitelisted", `Calling IP ${callerIp || "unknown"} is not in this key's whitelist.`);
      }
    }

    // Permission gate.
    const perms = parsePermissions(key.permissions);
    for (const p of needed) {
      if (!perms.includes(p)) {
        return reject(res, 403, "missing_permission", `This key needs the "${p}" permission.`);
      }
    }

    // Verify signature against the EXACT bytes received. `path` includes the
    // query string so signed paginated GETs aren't trivially forgeable.
    let secret: string;
    try {
      secret = decryptSecret(key.secretEncrypted);
    } catch (err) {
      req.log?.error({ err, keyId: key.keyId }, "failed to decrypt api key secret — master key drift?");
      return reject(res, 500, "key_decrypt_failed", "Server cannot decrypt this key. Contact support.");
    }
    const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? "";
    const payload = buildSignaturePayload(tsRaw, req.method, req.originalUrl, rawBody);
    if (!verifySignature(secret, payload, sigHex)) {
      return reject(res, 401, "bad_signature", "HMAC signature did not match.");
    }

    // Update last-used metadata async — debounced to once per minute per key
    // so a 50-rps trading bot doesn't hammer the row 50× per second.
    const now = Date.now();
    const lastFlush = lastUsedFlushedAt.get(key.keyId) ?? 0;
    if (now - lastFlush >= LAST_USED_FLUSH_MS) {
      lastUsedFlushedAt.set(key.keyId, now);
      db.update(userApiKeysTable)
        .set({ lastUsedAt: new Date(), lastUsedIp: callerIp || null })
        .where(eq(userApiKeysTable.id, key.id))
        .catch((err) => req.log?.warn({ err, keyId: key.keyId }, "api key last-used update failed"));
    }

    req.user = user as User;
    req.apiKey = { ...key, perms };
    next();
  };
}
