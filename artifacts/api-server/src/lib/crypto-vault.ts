import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SALT = "cryptox-vault-v1";
const KEY = scryptSync(process.env.SESSION_SECRET || "dev-secret-change-me", SALT, 32);

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(blob: string | null | undefined): string {
  if (!blob) return "";
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return "";
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");
  // authTagLength: 16 explicitly enforces the full 128-bit GCM authentication
  // tag so a truncated/forged tag is rejected before decryption begins.
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

export function maskSecret(blob: string | null | undefined): string {
  if (!blob) return "";
  try {
    const dec = decryptSecret(blob);
    if (!dec) return "";
    if (dec.length <= 8) return "••••";
    return `${dec.slice(0, 4)}••••${dec.slice(-4)}`;
  } catch { return "•••• (decrypt failed)"; }
}
