import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { Request } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db, sessionsTable, usersTable, type User } from "@workspace/db";

const SESSION_DAYS = 14;
export const SESSION_COOKIE = "cx_session";

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function generateReferralCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function generateUid(): string {
  return "CX" + Date.now().toString(36).toUpperCase() + randomBytes(3).toString("hex").toUpperCase();
}

export async function createSession(userId: number, req: Request): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({
    userId,
    token,
    ip: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null,
    userAgent: req.headers["user-agent"] || null,
    expiresAt,
  });
  return token;
}

export async function getUserBySession(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const now = new Date();
  const [row] = await db
    .select({ user: usersTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
    .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, now)))
    .limit(1);
  return row?.user ?? null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
}

export function readSessionCookie(req: Request): string | undefined {
  // cookie-parser populates req.cookies
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  return cookies?.[SESSION_COOKIE];
}

export function sanitizeUser(u: User) {
  const { passwordHash, ...rest } = u;
  void passwordHash;
  return rest;
}
