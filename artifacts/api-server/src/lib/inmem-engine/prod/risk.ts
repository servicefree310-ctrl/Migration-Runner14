// Per-user pre-trade risk limits.
//
// Two checks, applied BEFORE the order even reaches the symbol registry /
// matching engine:
//
//   1. Rate limit (token bucket) — caps order placements per user per
//      second so a runaway client can't queue-flood the engine.
//
//   2. Max-open-orders — caps how many resting orders a user may have at
//      once across ALL symbols, so a user can't memory-bomb the engine
//      by parking 100k orders.
//
// State is in-memory only. On a restart the rate-limiter resets (which is
// safe) and the open-order count is rebuilt from the ordersTable in the
// production engine bootstrap. A multi-server deployment would move both
// to Redis with the same key shape — left as a swap point.

export interface RiskConfig {
  /** Sustained orders / second. */
  ordersPerSecond?: number;
  /** Burst tokens — short bursts up to this size are allowed. */
  burstSize?: number;
  /** Maximum simultaneously-open orders per user across all symbols. */
  maxOpenOrders?: number;
}

const DEFAULTS: Required<RiskConfig> = {
  ordersPerSecond: 20,
  burstSize: 50,
  maxOpenOrders: 200,
};

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class RiskGuard {
  private readonly cfg: Required<RiskConfig>;
  private readonly buckets = new Map<number, Bucket>();
  private readonly openCount = new Map<number, number>();

  constructor(cfg: RiskConfig = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
  }

  /** Combined check — if either guard fails the call returns the failure
   *  without consuming any state, so callers can retry safely. */
  check(userId: number): { ok: true } | { ok: false; code: "rate_limited" | "too_many_open"; message: string } {
    if (!this.tryConsume(userId)) {
      return { ok: false, code: "rate_limited", message: `Rate limit: ${this.cfg.ordersPerSecond}/sec sustained, ${this.cfg.burstSize} burst` };
    }
    const open = this.openCount.get(userId) ?? 0;
    if (open >= this.cfg.maxOpenOrders) {
      // We already consumed a token above — refund it so an over-limit
      // caller doesn't get rate-limited twice for the same rejection.
      this.refund(userId);
      return { ok: false, code: "too_many_open", message: `Too many open orders (max ${this.cfg.maxOpenOrders})` };
    }
    return { ok: true };
  }

  /** Called by the prod engine when an order rests in the book. */
  noteOpened(userId: number): void {
    this.openCount.set(userId, (this.openCount.get(userId) ?? 0) + 1);
  }

  /** Called by the prod engine when a resting order is cancelled or fully
   *  filled. Idempotent — never goes below zero. */
  noteClosed(userId: number): void {
    const cur = this.openCount.get(userId) ?? 0;
    if (cur <= 0) return;
    if (cur === 1) this.openCount.delete(userId);
    else this.openCount.set(userId, cur - 1);
  }

  /** Bulk-reset the open counter for a user — used by bootstrap when
   *  rebuilding from ordersTable on engine startup. */
  setOpenCount(userId: number, count: number): void {
    if (count <= 0) this.openCount.delete(userId);
    else this.openCount.set(userId, count);
  }

  snapshot(): { totalUsers: number; totalOpenOrders: number; cfg: Required<RiskConfig> } {
    let total = 0;
    for (const v of this.openCount.values()) total += v;
    return { totalUsers: this.openCount.size, totalOpenOrders: total, cfg: this.cfg };
  }

  // ─── Token bucket ───────────────────────────────────────────────────────

  private tryConsume(userId: number): boolean {
    const now = Date.now();
    let b = this.buckets.get(userId);
    if (!b) {
      b = { tokens: this.cfg.burstSize - 1, lastRefillMs: now };
      this.buckets.set(userId, b);
      return true;
    }
    // Refill: tokens accrue at ordersPerSecond; cap at burstSize.
    const elapsedSec = (now - b.lastRefillMs) / 1000;
    const refill = elapsedSec * this.cfg.ordersPerSecond;
    if (refill > 0) {
      b.tokens = Math.min(this.cfg.burstSize, b.tokens + refill);
      b.lastRefillMs = now;
    }
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  private refund(userId: number): void {
    const b = this.buckets.get(userId);
    if (b) b.tokens = Math.min(this.cfg.burstSize, b.tokens + 1);
  }
}
