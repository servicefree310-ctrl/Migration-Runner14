import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const PWD_KEY = "admin_vault_password";
const SCRYPT_N = 16384;

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 64, { N: SCRYPT_N });
}

export async function isVaultPasswordSet(): Promise<boolean> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, PWD_KEY)).limit(1);
  return !!row?.value;
}

export async function setVaultPassword(password: string): Promise<void> {
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
  const salt = randomBytes(16);
  const hash = hashPassword(password, salt);
  const blob = `v1:${salt.toString("base64")}:${hash.toString("base64")}`;
  await db.insert(settingsTable).values({ key: PWD_KEY, value: blob })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: blob, updatedAt: new Date() } });
}

export async function verifyVaultPassword(password: string): Promise<boolean> {
  if (!password) return false;
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, PWD_KEY)).limit(1);
  if (!row?.value) return false;
  const parts = row.value.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const salt = Buffer.from(parts[1], "base64");
  const stored = Buffer.from(parts[2], "base64");
  const candidate = hashPassword(password, salt);
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
