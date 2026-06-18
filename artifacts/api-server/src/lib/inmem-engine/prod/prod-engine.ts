import { eq, and, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  walletsTable,
} from "@workspace/db";
import { logger } from "../../logger";
import { InMemoryEngine, type EngineMetrics } from "../engine";
import type { OrderType, STPMode, Side, Trade, AutoCancelEvent, RejectReason } from "../types";
import { SymbolRegistry, type SymbolRule } from "./symbol-registry";
import { RiskGuard, type RiskConfig } from "./risk";
import { Settler, type SettlerMetrics, loadOpenOrdersForRecovery } from "./settler";

// Production-grade orchestrator wrapping the raw InMemoryEngine.
//
// The split is intentional: the InMemoryEngine knows nothing about money,
// users, or Postgres — it only knows orders and trades. ProdEngine glues
// it to the rest of the exchange:
//
//   Place flow (real money):
//
//     1. Symbol registry validates tick / lot / min-qty / min-notional.
//     2. RiskGuard token-buckets the user and checks max-open-orders.
//     3. INSERT orders row (status='pending'), get the DB id.
//     4. Atomically move funds from wallet.balance → wallet.locked
//        (quote for buy, base for sell). On failure, mark order
//        cancelled and bail.
//     5. Submit to InMemoryEngine with ref=String(dbOrderId), userId for STP.
//     6. Engine returns synchronously with trades + autoCancels +
//        rejection info. The Settler picks up trades + autoCancels via
//        the engine's event emitter and persists them to Postgres.
//     7. If the order rests, mark orders.status='open' and bump the
//        risk guard's open-count.
//     8. If the order was rejected outright (post_only crossed, FOK
//        couldn't fill, STP cancel_newest), refund the FULL lock and
//        mark cancelled.
//
//   Cancel flow:
//
//     1. SELECT FOR UPDATE the order, verify owner.
//     2. Engine.cancel — either succeeds (returns the unfilled qty) or
//        returns null (already filled / never resting).
//     3. If cancelled, refund the unfilled-qty portion of the lock and
//        mark orders.status='cancelled'.
//
// Recovery on bootstrap:
//
//   - Engine recover() → snapshot+WAL replay rebuilds the in-memory book.
//   - We then SELECT all orders with status in ('open','partial') from the
//     DB and reconcile: orders that exist in the DB but NOT in the engine
//     book are re-inserted; orders in the engine but NOT in the DB are
//     dropped. This makes the engine a pure cache that can be wiped at
//     any time without losing user state.
//
//   The Postgres trades table is the source of truth for taxes and
//   accounting; the engine WAL is the source of truth for execution
//   ordering. The Settler closes the loop by writing every engine trade
//   to Postgres atomically.

export interface ProdEngineOptions {
  /** Engine data dir. Defaults to /tmp/cryptox-prod-inmem (separate from
   *  the sandbox engine's dir so they don't clobber each other). */
  dataDir?: string;
  /** Auto-snapshot cadence — see InMemoryEngine. */
  snapshotEveryNCommands?: number;
  /** Force every WAL append to fdatasync. ON for production (default). */
  fsyncWal?: boolean;
  /** Per-user rate limit + max-open-orders config. */
  risk?: RiskConfig;
}

export interface PlaceProdOrderInput {
  userId: number;
  symbol: string;
  side: Side;
  type: OrderType;
  /** Required for limit/post_only/ioc/fok. Ignored for market. */
  price?: number;
  quantity: number;
  stp?: STPMode;
  /** Caller-supplied ID for idempotent retries. Optional — if missing, a
   *  random uuid is generated. NOT yet used for dedup (TODO). */
  clientOrderId?: string;
}

export type PlaceProdOrderResult =
  | {
      ok: true;
      dbOrderId: number;
      engineOrderId: number;
      trades: Trade[];
      resting: boolean;
      rejected: boolean;
      rejectReason?: RejectReason;
      autoCancels: AutoCancelEvent[];
    }
  | {
      ok: false;
      code:
        | "validation"
        | "rate_limited"
        | "too_many_open"
        | "halted"
        | "insufficient_funds"
        | "user_not_found"
        | "internal";
      message: string;
    };

export interface ProdEngineMetrics {
  engine: EngineMetrics;
  settler: SettlerMetrics;
  risk: ReturnType<RiskGuard["snapshot"]>;
  bootstrappedAt: number;
  uptimeSec: number;
}

export class ProdEngine {
  private readonly engine: InMemoryEngine;
  private readonly registry: SymbolRegistry;
  private readonly risk: RiskGuard;
  private readonly settler: Settler;
  private readonly bootstrappedAt = Date.now();
  private started = false;
  // Single-flight startup so concurrent placeOrder() calls await the
  // SAME init promise instead of racing past a half-initialized engine
  // (no listener yet, no recovery yet → dropped trade events).
  private startPromise: Promise<void> | null = null;

  constructor(opts: ProdEngineOptions = {}) {
    const dataDir = opts.dataDir ?? "/tmp/cryptox-prod-inmem";
    this.engine = new InMemoryEngine({
      dataDir,
      snapshotEveryNCommands: opts.snapshotEveryNCommands ?? 10_000,
      fsyncWal: opts.fsyncWal ?? true, // production default ON
    });
    this.registry = new SymbolRegistry();
    this.risk = new RiskGuard(opts.risk);
    this.settler = new Settler(this.registry, {
      cursorPath: `${dataDir}/settler.cursor.json`,
      deadLetterPath: `${dataDir}/settler.deadletter.jsonl`,
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      await this.registry.start();
      await this.settler.start();

      // Wire engine→settler listeners BEFORE recovery so any trade
      // events emitted during WAL replay are captured (the settler
      // dedupes via its lastSettledTradeId cursor).
      this.engine.events.on("trade", (t: Trade) => this.settler.enqueueTrade(t));
      this.engine.events.on("autoCancel", (e: AutoCancelEvent) => this.settler.enqueueAutoCancel(e));

      const recoveryStats = await this.engine.recover();

      // Rebuild dbOrderId → engineOrderId from the engine's recovered
      // resting orders. Each order's `ref` is the DB id we stashed at
      // placement time. Without this, post-restart cancels would hit
      // the fallback path and mark an order cancelled in DB while the
      // engine still considers it live → ghost fills.
      let mapped = 0;
      for (const [, orders] of this.engine.allRestingOrdersBySymbol()) {
        for (const o of orders) {
          if (o.ref) {
            const dbId = Number(o.ref);
            if (Number.isFinite(dbId) && dbId > 0) {
              this.dbToEngineId.set(dbId, o.id);
              mapped++;
            }
          }
        }
      }

      // Reconcile engine ↔ DB: any DB-side open orders that are NOT in
      // the engine after WAL replay must be re-inserted. Handles cold
      // starts and disaster-recovery scenarios where the data dir was
      // wiped.
      await this.reconcileFromDb();

      this.started = true;
      logger.info({ recoveryStats, mappedRecoveredOrders: mapped }, "ProdEngine started");
    })();
    try {
      await this.startPromise;
    } catch (e) {
      // Allow a retry on next call if startup failed.
      this.startPromise = null;
      throw e;
    }
  }

  async stop(): Promise<void> {
    await this.settler.stop();
    await this.engine.snapshotNow();
    await this.engine.shutdown();
    this.registry.stop();
    this.started = false;
  }

  // ─── Place ─────────────────────────────────────────────────────────────

  async placeOrder(input: PlaceProdOrderInput): Promise<PlaceProdOrderResult> {
    if (!this.started) await this.start();

    const symbol = input.symbol.toUpperCase();
    const isMarket = input.type === "market";
    const price = isMarket ? 0 : Number(input.price ?? 0);
    const quantity = Number(input.quantity);

    // Market BUYS would lock `price * qty * feeBuffer = 0` (since
    // `price=0` for market). Without a quote-budget mode the quote
    // wallet would never be debited and base would be credited for
    // free → real-money loss. Until quote-budget is implemented, only
    // market SELLS are accepted (sell side locks base by `quantity`,
    // independent of price). Buyers must use limit/IOC/FOK.
    if (isMarket && input.side === "buy") {
      return {
        ok: false,
        code: "validation",
        message: "Market BUY orders are not supported yet — use a limit or IOC order with an explicit price.",
      };
    }

    // 1. Symbol + tick/lot/notional validation.
    const v = this.registry.validate(symbol, price, quantity, isMarket);
    if (!v.ok) {
      return { ok: false, code: "validation", message: v.message };
    }
    const rule = v.rule;

    // 2. Risk: rate limit + max-open.
    const r = this.risk.check(input.userId);
    if (!r.ok) {
      return { ok: false, code: r.code, message: r.message };
    }

    // 3. Halt check (cheap, just reads the in-memory set).
    if (this.engine.isHalted(symbol)) {
      return { ok: false, code: "halted", message: `Trading halted on ${symbol}` };
    }

    // 4. Insert order row + lock funds atomically.
    let dbOrderId: number;
    try {
      dbOrderId = await this.insertAndLock({
        userId: input.userId,
        rule,
        side: input.side,
        type: input.type,
        price,
        quantity,
      });
    } catch (e) {
      if (e instanceof InsufficientFundsError) {
        return { ok: false, code: "insufficient_funds", message: e.message };
      }
      logger.error({ err: e instanceof Error ? e.message : String(e) }, "prod placeOrder lock failed");
      return { ok: false, code: "internal", message: "Failed to lock funds" };
    }

    // 5. Submit to the engine. ref carries the DB id back through the
    // trade events so the settler can resolve which orders to update.
    const result = await this.engine.placeOrder({
      symbol,
      side: input.side,
      type: input.type,
      price,
      quantity,
      stp: input.stp ?? "cancel_newest",
      userId: input.userId,
      ref: String(dbOrderId),
    });

    // Track the engine-id for fast O(1) cancel lookups later. We map
    // every accepted placement (resting or partial) so admin/user
    // cancels never need to walk the book. Cleared on cancel + on
    // settler `filled`/`cancelled` events.
    if (!result.rejected) {
      this.dbToEngineId.set(dbOrderId, result.orderId);
    }

    // 6. Post-engine bookkeeping.
    if (result.rejected) {
      // Full refund + mark cancelled. The autoCancel event from the
      // engine carries a `reason` we can use for the cancellation note.
      await this.refundFullAndCancel(dbOrderId, rule, input.side, price, quantity);
      const ret: PlaceProdOrderResult = {
        ok: true, dbOrderId, engineOrderId: result.orderId,
        trades: result.trades, resting: false, rejected: true,
        autoCancels: result.autoCancels,
      };
      if (result.rejectReason !== undefined) ret.rejectReason = result.rejectReason;
      return ret;
    }

    // For an order that fully filled with no remainder we still need to
    // mark it. The settler will write filledQty/status updates per trade,
    // but for orders that match in full immediately we want to make sure
    // the row is marked 'open' for any partial-fill window before the
    // settler catches up. (Status will flip to filled once the settler
    // processes the matching trade.)
    if (result.resting || result.trades.length === 0) {
      await db.update(ordersTable).set({ status: "open" }).where(eq(ordersTable.id, dbOrderId));
      if (result.resting) this.risk.noteOpened(input.userId);
    }

    const ret: PlaceProdOrderResult = {
      ok: true, dbOrderId, engineOrderId: result.orderId,
      trades: result.trades,
      resting: result.resting,
      rejected: false,
      autoCancels: result.autoCancels,
    };
    if (result.rejectReason !== undefined) ret.rejectReason = result.rejectReason;
    return ret;
  }

  // ─── Cancel ────────────────────────────────────────────────────────────

  async cancelOrder(userId: number, dbOrderId: number): Promise<{ ok: boolean; message?: string; refunded?: number }> {
    if (!this.started) await this.start();

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, dbOrderId)).limit(1);
    if (!order) return { ok: false, message: "Order not found" };
    if (order.userId !== userId) return { ok: false, message: "Forbidden" };
    if (order.status === "cancelled" || order.status === "filled") {
      return { ok: false, message: `Order already ${order.status}` };
    }

    const rule = this.registry.getByPairId(order.pairId);
    if (!rule) return { ok: false, message: "Symbol not registered" };
    // O(1) lookup of the engine id stashed during placeOrder().
    const engineId = this.dbToEngineId.get(dbOrderId);
    if (engineId === undefined) {
      // Engine doesn't know about it. Two cases:
      //   - status='pending': never made it past the lock step. Just
      //     mark cancelled — funds were never locked (insertAndLock is
      //     atomic with INSERT, so a 'pending' row implies aborted TX
      //     and zero lock).
      //   - status='open': funds ARE locked but the engine forgot the
      //     order (WAL wipe or restart without resting-order replay).
      //     Refund the FULL placement-time lock and mark cancelled —
      //     the order can never trade so this is safe and necessary to
      //     unlock the user's funds.
      if (order.status === "pending") {
        await db.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(ordersTable.id, dbOrderId));
        return { ok: true, refunded: 0 };
      }
      if (order.status === "open") {
        const filled = Number(order.filledQty ?? 0);
        const remaining = Math.max(0, Number(order.qty) - filled);
        if (remaining > 0) {
          await this.refundFullAndCancel(dbOrderId, rule, order.side as Side, Number(order.price), remaining);
          this.risk.noteClosed(userId);
          return { ok: true, refunded: remaining };
        }
        await db.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(ordersTable.id, dbOrderId));
        return { ok: true, refunded: 0 };
      }
      return { ok: false, message: "Order not resting" };
    }

    const cancelRes = await this.engine.cancelOrder(rule.symbol, engineId);
    if (!cancelRes.cancelled) {
      // Race: order filled between our check and the cancel. Settler
      // will mark it filled — nothing for us to do.
      return { ok: false, message: "Order already filled" };
    }

    const unfilled = cancelRes.cancelled.remaining;
    const refundCoinId = order.side === "buy" ? rule.quoteCoinId : rule.baseCoinId;
    // Mirror the placement-time fee buffer when refunding a buy cancel,
    // otherwise the locked column drifts negative over many partial-then-
    // cancel cycles.
    const buyerFeeBuffer = 1 + rule.takerFeeRate * 1.5;
    const refundAmount = order.side === "buy"
      ? unfilled * Number(order.price) * buyerFeeBuffer
      : unfilled;

    await db.transaction(async (tx) => {
      // Refund moves money from `locked` → `balance` (the inverse of
      // insertAndLock). `balance` is FREE; if we only decremented locked
      // the funds would vanish.
      await this.applyWalletDeltaTx(tx, userId, refundCoinId, {
        lockedDelta: -refundAmount,
        balanceDelta: refundAmount,
      });
      await tx.update(ordersTable).set({
        status: "cancelled",
        updatedAt: new Date(),
      }).where(eq(ordersTable.id, dbOrderId));
    });

    this.risk.noteClosed(userId);
    this.dbToEngineId.delete(dbOrderId);
    return { ok: true, refunded: refundAmount };
  }

  // ─── Admin ─────────────────────────────────────────────────────────────

  async halt(symbol: string): Promise<void> { await this.engine.haltSymbol(symbol.toUpperCase()); }
  async resume(symbol: string): Promise<void> { await this.engine.resumeSymbol(symbol.toUpperCase()); }

  /** Cancel every open order for a symbol. Used by an admin halt+flush
   *  flow. Returns the count of cancelled orders. */
  async cancelAllForSymbol(symbol: string): Promise<{ cancelled: number }> {
    const rule = this.registry.get(symbol);
    if (!rule) return { cancelled: 0 };
    const open = await db.select({
      id: ordersTable.id, userId: ordersTable.userId,
    }).from(ordersTable).where(and(
      eq(ordersTable.pairId, rule.pairId),
      sql`${ordersTable.status} IN ('open','partial')`,
    ));
    let cancelled = 0;
    for (const o of open) {
      const r = await this.cancelOrder(o.userId, o.id);
      if (r.ok) cancelled++;
    }
    return { cancelled };
  }

  getOrderbook(symbol: string, levels = 20): ReturnType<InMemoryEngine["getOrderbook"]> {
    return this.engine.getOrderbook(symbol.toUpperCase(), levels);
  }

  metrics(): ProdEngineMetrics {
    return {
      engine: this.engine.metrics(),
      settler: this.settler.metrics(),
      risk: this.risk.snapshot(),
      bootstrappedAt: this.bootstrappedAt,
      uptimeSec: Math.floor((Date.now() - this.bootstrappedAt) / 1000),
    };
  }

  async snapshotNow(): Promise<void> {
    await this.engine.snapshotNow();
  }

  // ─── private ───────────────────────────────────────────────────────────

  /** dbOrderId → engineOrderId map maintained at placement so cancels are
   *  O(1). Cleared on settle-to-filled or cancel. */
  private readonly dbToEngineId = new Map<number, number>();

  private async insertAndLock(args: {
    userId: number; rule: SymbolRule; side: Side; type: OrderType;
    price: number; quantity: number;
  }): Promise<number> {
    const { userId, rule, side, type, price, quantity } = args;
    const lockCoinId = side === "buy" ? rule.quoteCoinId : rule.baseCoinId;
    // For buys we lock notional PLUS a fee buffer (mirroring matching-
    // engine.ts) so the settler can deduct fees from the lock instead of
    // having to debit free balance and risk going negative on a wallet
    // that drained between placement and fill. We use 1.5× takerFeeRate
    // to cover GST; matches what the legacy engine pre-locks for limit
    // buys via `qty * price * (1 + takerFeeRate)`.
    const feeBuffer = 1 + rule.takerFeeRate * 1.5;
    const lockAmount = side === "buy" ? price * quantity * feeBuffer : quantity;

    return await db.transaction(async (tx) => {
      const [w] = await tx.select().from(walletsTable)
        .where(and(
          eq(walletsTable.userId, userId),
          eq(walletsTable.coinId, lockCoinId),
          eq(walletsTable.walletType, "spot"),
        ))
        .for("update").limit(1);
      if (!w) throw new InsufficientFundsError(`No spot wallet for coin ${lockCoinId}`);
      // `balance` is FREE balance — `locked` is tracked separately and
      // already excluded — so we compare directly. (Don't subtract
      // locked twice; the legacy code at routes/orders.ts checks the
      // same way.)
      const available = Number(w.balance);
      if (available + 1e-12 < lockAmount) {
        throw new InsufficientFundsError(`Insufficient funds: available ${available.toFixed(8)}, need ${lockAmount.toFixed(8)}`);
      }
      // Move balance → locked atomically. The wallet model treats
      // `balance` as FREE balance and `locked` as the separately-tracked
      // reserved slice (mirrors routes/orders.ts and the legacy matching
      // engine). Total user funds = balance + locked.
      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} - ${String(lockAmount)}::numeric`,
        locked: sql`${walletsTable.locked} + ${String(lockAmount)}::numeric`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, w.id));

      const [created] = await tx.insert(ordersTable).values({
        userId, pairId: rule.pairId, side, type,
        price: String(price),
        qty: String(quantity),
        status: "pending",
      }).returning({ id: ordersTable.id });
      return created!.id;
    });
  }

  private async refundFullAndCancel(dbOrderId: number, rule: SymbolRule, side: Side, price: number, quantity: number): Promise<void> {
    const coinId = side === "buy" ? rule.quoteCoinId : rule.baseCoinId;
    const buyerFeeBuffer = 1 + rule.takerFeeRate * 1.5;
    const amount = side === "buy" ? price * quantity * buyerFeeBuffer : quantity;
    await db.transaction(async (tx) => {
      // Move funds back from `locked` → `balance` (inverse of the lock
      // we placed in insertAndLock).
      await this.applyWalletDeltaTx(tx, await this.userIdForOrder(tx, dbOrderId), coinId, {
        lockedDelta: -amount,
        balanceDelta: amount,
      });
      await tx.update(ordersTable).set({
        status: "cancelled",
        updatedAt: new Date(),
      }).where(eq(ordersTable.id, dbOrderId));
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async userIdForOrder(tx: any, dbOrderId: number): Promise<number> {
    const [o] = await tx.select({ userId: ordersTable.userId }).from(ordersTable).where(eq(ordersTable.id, dbOrderId)).limit(1);
    return o!.userId as number;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async applyWalletDeltaTx(tx: any, userId: number, coinId: number, delta: { lockedDelta?: number; balanceDelta?: number }): Promise<void> {
    const [w] = await tx.select().from(walletsTable)
      .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coinId), eq(walletsTable.walletType, "spot")))
      .for("update").limit(1);
    if (!w) {
      // Lazily create — safe because we never decrement balance here, only release.
      const [created] = await tx.insert(walletsTable).values({ userId, coinId, walletType: "spot", balance: "0", locked: "0" }).returning();
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (delta.balanceDelta) updates["balance"] = sql`${walletsTable.balance} + ${String(delta.balanceDelta)}::numeric`;
      if (delta.lockedDelta) updates["locked"] = sql`${walletsTable.locked} + ${String(delta.lockedDelta)}::numeric`;
      await tx.update(walletsTable).set(updates).where(eq(walletsTable.id, created.id));
      return;
    }
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (delta.balanceDelta) updates["balance"] = sql`${walletsTable.balance} + ${String(delta.balanceDelta)}::numeric`;
    if (delta.lockedDelta) updates["locked"] = sql`${walletsTable.locked} + ${String(delta.lockedDelta)}::numeric`;
    await tx.update(walletsTable).set(updates).where(eq(walletsTable.id, w.id));
  }

  private async reconcileFromDb(): Promise<void> {
    const open = await loadOpenOrdersForRecovery();
    // Group by user → set risk's open count.
    const perUser = new Map<number, number>();
    for (const o of open) perUser.set(o.userId, (perUser.get(o.userId) ?? 0) + 1);
    for (const [u, c] of perUser) this.risk.setOpenCount(u, c);
    // We don't re-insert into the engine here — the engine's own WAL
    // replay should be authoritative for the in-memory book. If the data
    // dir was wiped, the engine starts empty and admin/operator must
    // either replay manually or accept that resting orders move to a
    // "stale" state requiring a manual flush. (Adding auto-resting
    // here would conflict with engine recovery if it picked up a partial
    // WAL.) This is documented in replit.md.
    logger.info({ openOrdersInDb: open.length, usersWithOpen: perUser.size }, "ProdEngine reconciled from DB");
  }
}

export class InsufficientFundsError extends Error {
  constructor(message: string) { super(message); this.name = "InsufficientFundsError"; }
}
