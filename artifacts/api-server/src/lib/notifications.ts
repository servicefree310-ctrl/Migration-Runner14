/**
 * Notifications helpers.
 *
 * Use `notify()` to push a row into `user_notifications` from any business
 * route (order fills, deposits, KYC events, etc.). The bell icon + /notifications
 * page poll the public endpoints in routes/notifications.ts.
 *
 * Errors are swallowed (try/catch + log warn) so a notification failure can
 * never break the originating business operation.
 */
import { db, userNotificationsTable, priceAlertsTable, coinsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";
import { isLeader } from "./leader";
import { getRawTick } from "./price-service";

export type NotifKind = "info" | "success" | "warning" | "danger" | "promo";
export type NotifCategory = "system" | "trade" | "wallet" | "security" | "alert" | "promo";

export type NotifyOpts = {
  userId: number;
  kind: NotifKind;
  category?: NotifCategory;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  metadata?: Record<string, unknown>;
};

export async function notify(opts: NotifyOpts): Promise<void> {
  try {
    await db.insert(userNotificationsTable).values({
      userId: opts.userId,
      kind: opts.kind,
      category: opts.category ?? "system",
      title: opts.title.slice(0, 200),
      body: (opts.body ?? "").slice(0, 1000),
      ctaLabel: opts.ctaLabel?.slice(0, 50) ?? null,
      ctaUrl: opts.ctaUrl?.slice(0, 500) ?? null,
      metadata: opts.metadata ?? {},
    });
  } catch (err) {
    logger.warn({ err, userId: opts.userId, title: opts.title }, "notification.insert_failed");
  }
}

// ─── Price Alert Worker ─────────────────────────────────────────────────────
// Leader-gated. Polls active alerts every 30s, compares against live prices,
// fires a notification + flips status to 'triggered' when condition is met.

const ALERT_INTERVAL_MS = 30_000;
let alertTimer: NodeJS.Timeout | null = null;

async function checkAlertsTick(): Promise<void> {
  if (!isLeader()) return;
  try {
    const active = await db.select().from(priceAlertsTable).where(eq(priceAlertsTable.status, "active")).limit(500);
    if (!active.length) return;
    const triggered: typeof active = [];
    for (const a of active) {
      const sym = a.coinSymbol.toUpperCase().replace(/USDT$/, "");
      const live = getRawTick(sym);
      const livePrice = live?.usdt ?? 0;
      if (!livePrice) continue;
      const target = Number(a.targetPrice);
      const fired = a.condition === "above" ? livePrice >= target : livePrice <= target;
      if (!fired) continue;
      triggered.push(a);
      await notify({
        userId: a.userId,
        kind: "info",
        category: "alert",
        title: `${a.coinSymbol} price alert triggered`,
        body: `${a.coinSymbol} ${a.condition === "above" ? "crossed above" : "fell below"} $${target.toLocaleString()} (now $${livePrice.toLocaleString()})`,
        ctaLabel: "View market",
        ctaUrl: `/trade/${a.coinSymbol}USDT`,
        metadata: { alertId: a.id, target, livePrice, condition: a.condition },
      });
      if (a.triggerOnce) {
        await db.update(priceAlertsTable).set({
          status: "triggered",
          triggeredAt: new Date(),
          triggeredPrice: String(livePrice),
        }).where(eq(priceAlertsTable.id, a.id));
      }
    }
    if (triggered.length) logger.info({ count: triggered.length }, "price-alerts.fired");
  } catch (err) {
    logger.warn({ err }, "price-alerts.tick_failed");
  }
}

export function startPriceAlertWorker(intervalMs: number = ALERT_INTERVAL_MS): void {
  if (alertTimer) return;
  logger.info({ intervalMs }, "price-alerts.starting");
  alertTimer = setInterval(checkAlertsTick, intervalMs);
  setTimeout(checkAlertsTick, 5_000).unref();
  alertTimer.unref();
}

export function stopPriceAlertWorker(): void {
  if (alertTimer) { clearInterval(alertTimer); alertTimer = null; }
}

// Helper for callers that want unread count
export async function getUnreadCount(userId: number): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(userNotificationsTable)
    .where(and(eq(userNotificationsTable.userId, userId), sql`${userNotificationsTable.readAt} IS NULL`));
  return row?.n ?? 0;
}
