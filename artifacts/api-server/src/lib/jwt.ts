import { createHmac, randomBytes, createHash } from "node:crypto";

const SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET (or SESSION_SECRET) must be set in production");
  }
  // In development we keep a stable fallback so dev tokens survive restarts,
  // but log loudly so the operator notices.
  // eslint-disable-next-line no-console
  console.warn("[jwt] WARNING: JWT_SECRET unset, using insecure dev fallback. Do NOT use in production.");
}
const KEY = SECRET || "dev-bicrypto-jwt-secret-DO-NOT-USE-IN-PROD";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export type JwtSub = { id: string; role: number | string; email?: string };

export function signJwt(sub: JwtSub, ttlSeconds = 14 * 24 * 60 * 60): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub, iat: now, exp: now + ttlSeconds };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", KEY).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}

export function verifyJwt(token: string): { sub: JwtSub; iat: number; exp: number } | null {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const expect = b64url(createHmac("sha256", KEY).update(`${h}.${p}`).digest());
    if (expect !== s) return null;
    const payload = JSON.parse(b64urlDecode(p).toString("utf8")) as { sub: JwtSub; iat: number; exp: number };
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export function newCsrfToken(): string {
  return randomBytes(24).toString("hex");
}

export function newSessionId(): string {
  return randomBytes(20).toString("hex");
}

export function powHash(challenge: string, nonce: string | number): string {
  return createHash("sha256").update(`${challenge}:${nonce}`).digest("hex");
}
