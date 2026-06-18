/**
 * Push notification service via FCM (Firebase Cloud Messaging).
 * Uses FCM Legacy HTTP API — configure server key in Admin → Settings → push.fcmKey
 * Also manages device_tokens table (registered via /api/push/register-token).
 */
import { db } from "@workspace/db";
import { sql, eq, and } from "drizzle-orm";
import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { logger } from "./logger";

const FCM_ENDPOINT = "https://fcm.googleapis.com/fcm/send";

// Inline table definition — device_tokens is created via raw migration (push setup),
// not yet in the shared @workspace/db schema. Using a local pgTable avoids sql.raw.
const deviceTokensTable = pgTable("device_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  platform: text("platform").notNull().default("web"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  clickAction?: string;
};

async function getFcmKey(): Promise<string | null> {
  try {
    const rows = await db.execute(sql`SELECT value FROM settings WHERE key = 'push.fcmKey' LIMIT 1`);
    const row = (rows as any).rows?.[0] ?? (rows as any)[0];
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** Send push to a single FCM token */
export async function sendPushToToken(token: string, payload: PushPayload): Promise<{ ok: boolean; error?: string }> {
  const fcmKey = await getFcmKey();
  if (!fcmKey) return { ok: false, error: "FCM server key not configured. Set push.fcmKey in Admin → Settings." };
  try {
    const body: Record<string, any> = {
      to: token,
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.imageUrl ? { image: payload.imageUrl } : {}),
        ...(payload.clickAction ? { click_action: payload.clickAction } : {}),
        sound: "default",
        badge: 1,
      },
    };
    if (payload.data) body.data = payload.data;
    const r = await fetch(FCM_ENDPOINT, {
      method: "POST",
      headers: { "Authorization": `key=${fcmKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const json: any = await r.json();
    if (json.failure > 0) {
      const err = json.results?.[0]?.error;
      // Remove invalid/unregistered tokens
      if (err === "NotRegistered" || err === "InvalidRegistration") {
        await db.update(deviceTokensTable)
          .set({ isActive: false })
          .where(eq(deviceTokensTable.token, token));
      }
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/** Send push to all active tokens for a user */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const rows = await db.select({ token: deviceTokensTable.token })
    .from(deviceTokensTable)
    .where(and(eq(deviceTokensTable.userId, userId), eq(deviceTokensTable.isActive, true)))
    .limit(10);
  let sent = 0, failed = 0;
  for (const row of rows) {
    const r = await sendPushToToken(row.token, payload);
    if (r.ok) sent++; else failed++;
  }
  return { sent, failed };
}

/** Broadcast push to all registered active devices (or by platform) */
export async function broadcastPush(payload: PushPayload, opts?: { platform?: string; audienceUserIds?: number[] }): Promise<{ sent: number; failed: number; total: number }> {
  const fcmKey = await getFcmKey();
  if (!fcmKey) return { sent: 0, failed: 0, total: 0 };

  // Build WHERE conditions using Drizzle ORM (no sql.raw — eliminates SQL injection risk).
  const ALLOWED_PLATFORMS = ["web", "android", "ios"] as const;
  const conds: any[] = [eq(deviceTokensTable.isActive, true)];
  if (opts?.platform) {
    const plat = opts.platform as typeof ALLOWED_PLATFORMS[number];
    if (ALLOWED_PLATFORMS.includes(plat)) {
      conds.push(eq(deviceTokensTable.platform, plat));
    }
  }

  const rows = await db.select({ token: deviceTokensTable.token })
    .from(deviceTokensTable)
    .where(and(...conds))
    .limit(1000);
  const total = rows.length;

  // FCM supports up to 1000 tokens per multicast request
  const allTokens = rows.map((r) => r.token);
  const chunks: string[][] = [];
  for (let i = 0; i < allTokens.length; i += 1000) {
    chunks.push(allTokens.slice(i, i + 1000));
  }

  let sent = 0, failed = 0;
  for (const chunk of chunks) {
    try {
      const body: Record<string, any> = {
        registration_ids: chunk,
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.imageUrl ? { image: payload.imageUrl } : {}),
          sound: "default",
          badge: 1,
        },
      };
      if (payload.data) body.data = payload.data;
      const r = await fetch(FCM_ENDPOINT, {
        method: "POST",
        headers: { "Authorization": `key=${fcmKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const json: any = await r.json();
      sent += json.success ?? 0;
      failed += json.failure ?? 0;
      // Invalidate bad tokens
      if (json.results && Array.isArray(json.results)) {
        for (let i = 0; i < json.results.length; i++) {
          const e = json.results[i]?.error;
          if (e === "NotRegistered" || e === "InvalidRegistration") {
            await db.update(deviceTokensTable)
              .set({ isActive: false })
              .where(eq(deviceTokensTable.token, chunk[i]));
          }
        }
      }
    } catch (e: any) {
      failed += chunk.length;
      logger.error({ err: e.message }, "FCM broadcast chunk failed");
    }
  }
  logger.info({ sent, failed, total }, "FCM broadcast completed");
  return { sent, failed, total };
}

/** Register or refresh a device token */
export async function registerDeviceToken(userId: number, token: string, platform: "web" | "android" | "ios"): Promise<void> {
  await db.execute(sql`
    INSERT INTO device_tokens (user_id, token, platform, is_active, created_at, last_seen_at)
    VALUES (${userId}, ${token}, ${platform}, true, NOW(), NOW())
    ON CONFLICT (user_id, token) DO UPDATE SET is_active = true, last_seen_at = NOW(), platform = ${platform}
  `);
}

/** Deregister a device token (logout) */
export async function deregisterDeviceToken(userId: number, token: string): Promise<void> {
  await db.update(deviceTokensTable)
    .set({ isActive: false })
    .where(and(eq(deviceTokensTable.userId, userId), eq(deviceTokensTable.token, token)));
}
