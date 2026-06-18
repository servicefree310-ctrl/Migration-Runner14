import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { logger } from "./logger";

// ---------- Master key (AES-256-GCM data-encryption key) ----------
//
// User API key secrets are encrypted at rest. We need a stable 32-byte master
// key. Resolution order:
//   1. process.env.API_KEY_MASTER_SECRET — if it's a 64-char hex string, use it
//      directly; otherwise derive a 32-byte key via scrypt with a fixed app salt.
//   2. .local/api-key-master.key — auto-generated 32-byte key persisted on first
//      run. Lives outside the repo (.local is gitignored) so it survives restarts
//      but is never committed.
//
// In production set API_KEY_MASTER_SECRET via env-secrets so the key isn't
// dependent on a single container's filesystem.
const KEY_FILE = resolve(process.cwd(), ".local", "api-key-master.key");
const APP_SALT = "zebvix.api-key-master.v1";

function loadMasterKey(): Buffer {
  const env = process.env.API_KEY_MASTER_SECRET?.trim();
  if (env) {
    if (/^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, "hex");
    return scryptSync(env, APP_SALT, 32);
  }
  if (existsSync(KEY_FILE)) {
    const raw = readFileSync(KEY_FILE);
    if (raw.length === 32) return raw;
    logger.warn({ size: raw.length }, "api-key master key file has wrong size; regenerating");
  }
  const fresh = randomBytes(32);
  try {
    mkdirSync(dirname(KEY_FILE), { recursive: true });
    writeFileSync(KEY_FILE, fresh, { mode: 0o600 });
    logger.info({ path: KEY_FILE }, "auto-generated API key master secret (set API_KEY_MASTER_SECRET to override)");
  } catch (err) {
    logger.error({ err }, "failed to persist auto-generated master key — keys created this session won't decrypt after restart");
  }
  return fresh;
}

let MASTER_KEY: Buffer | null = null;
function masterKey(): Buffer {
  if (!MASTER_KEY) MASTER_KEY = loadMasterKey();
  return MASTER_KEY;
}

// ---------- Key + secret generation ----------
//
// keyId format: "zbx_" + 24 hex chars (12 bytes random) → ~96 bits, collision-safe.
// secret format: 48 url-safe base64 chars (36 bytes random) → ~288 bits.
const KEY_ID_PREFIX = "zbx_";
export function generateKeyId(): string {
  return KEY_ID_PREFIX + randomBytes(12).toString("hex");
}
export function generateSecret(): string {
  return randomBytes(36).toString("base64url");
}

// ---------- AES-256-GCM encrypt/decrypt ----------
//
// Output format: base64( iv(12) || authTag(16) || ciphertext ). Single string
// stored in DB so there's no schema change needed if we rotate algorithms later
// (we'd add a version prefix at that point).
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < 12 + 16 + 1) throw new Error("ciphertext too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  // authTagLength: 16 explicitly enforces the full 128-bit GCM authentication
  // tag so a truncated/forged tag is rejected before decryption begins.
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// ---------- HMAC signing ----------
//
// Canonical message: timestamp + method + path + body
//   - timestamp: the X-ZBX-TIMESTAMP header value, raw string (don't reformat)
//   - method:    uppercase HTTP verb ("GET", "POST", ...)
//   - path:      request path including query string, NO host (e.g. "/api/v1/account/me?x=1")
//   - body:      raw request body string (empty string for GETs)
//
// This matches the public ApiDocs example.
export function buildSignaturePayload(timestamp: string, method: string, path: string, body: string): string {
  return timestamp + method.toUpperCase() + path + body;
}

export function computeSignature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifySignature(secret: string, payload: string, signatureHex: string): boolean {
  if (!/^[0-9a-fA-F]+$/.test(signatureHex)) return false;
  const expected = computeSignature(secret, payload);
  if (expected.length !== signatureHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

// ---------- Permissions ----------
// "trade" kept for backward-compat with existing keys (implies spot_trade + futures_trade).
export const VALID_PERMISSIONS = [
  "read",         // view balances, orders, history, deposit address
  "spot_trade",   // place / cancel spot orders
  "futures_trade",// place / cancel futures orders
  "withdraw",     // initiate crypto / INR withdrawals (requires 2FA at key creation)
  "transfer",     // move funds between wallets (spot ↔ futures ↔ earn)
  "ai_plan",      // subscribe / manage AI trading plans
  "invest",       // manage auto-invest
  "referral",     // view referral stats and tree
  "trade",        // legacy alias — allows both spot_trade + futures_trade
] as const;
export type Permission = (typeof VALID_PERMISSIONS)[number];

export function parsePermissions(raw: string): Permission[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is Permission => typeof x === "string" && (VALID_PERMISSIONS as readonly string[]).includes(x));
  } catch {
    return [];
  }
}

export function parseIpWhitelist(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Normalise IPv4-mapped IPv6 (::ffff:1.2.3.4 → 1.2.3.4) so users can whitelist
// the plain IPv4 they see in their dashboard.
export function normaliseIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}
