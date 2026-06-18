import { randomBytes } from "crypto";

// In-memory short-lived challenge store for multi-factor auth flows
// (signup OTP verification + login OTP / 2FA verification).
//
// Why in-memory: api-server is a single Node process and challenges live
// only ~5 minutes. Survives normal request lifecycle; lost on restart —
// acceptable for a code that must be re-entered anyway.
//
// Each challenge captures:
//   userId            — which user is being verified
//   purpose           — "login" | "signup"
//   requires          — which factors must be satisfied (email/phone/twofa)
//   recipientEmail    — frozen at issue time, used to bind OTP recipient
//   recipientPhone    — frozen at issue time, used to bind OTP recipient
//   createdAt         — for TTL enforcement
//
// Tokens are 32-byte random hex (64 chars), unguessable.

export type AuthChallengePurpose = "login" | "signup";

export interface AuthChallenge {
  token: string;
  userId: number;
  purpose: AuthChallengePurpose;
  requires: { email: boolean; phone: boolean; twofa: boolean };
  recipientEmail: string | null;
  recipientPhone: string | null;
  createdAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const store = new Map<string, AuthChallenge>();

function purgeExpired(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of store) {
    if (v.createdAt < cutoff) store.delete(k);
  }
}

export function issueChallenge(
  args: Omit<AuthChallenge, "token" | "createdAt">,
): AuthChallenge {
  purgeExpired();
  const token = randomBytes(32).toString("hex");
  const ch: AuthChallenge = { ...args, token, createdAt: Date.now() };
  store.set(token, ch);
  return ch;
}

export function getChallenge(token: string | undefined | null): AuthChallenge | null {
  if (!token) return null;
  const c = store.get(token);
  if (!c) return null;
  if (Date.now() - c.createdAt > TTL_MS) {
    store.delete(token);
    return null;
  }
  return c;
}

export function consumeChallenge(token: string): void {
  store.delete(token);
}

// ─── Masking helpers (UI only — server already knows the real values) ───
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 1) return email;
  const name = email.slice(0, at);
  const domain = email.slice(at);
  if (name.length <= 2) return name[0] + "***" + domain;
  return name[0] + "***" + name[name.length - 1] + domain;
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const tail = digits.slice(-4);
  return "•••• " + tail;
}
