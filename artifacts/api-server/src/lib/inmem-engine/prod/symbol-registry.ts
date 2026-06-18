import { eq } from "drizzle-orm";
import { db, pairsTable, type Pair } from "@workspace/db";

// In-memory cache of `pairsTable`. Pulled into the prod matching engine
// so EVERY placement validates against the live exchange rules:
//
//   - tickSize       — derived from pair.pricePrecision (price must be a
//                      multiple of 10^-pricePrecision)
//   - lotSize        — derived from pair.qtyPrecision (qty must be a
//                      multiple of 10^-qtyPrecision)
//   - minQty/maxQty  — clamps on order size
//   - minNotional    — clamp on price * qty (defaults to 1.0 of quote unit
//                      until the schema grows a column for it)
//   - tradingEnabled — symbol-level kill switch
//
// We do NOT hit Postgres on the placement hot path. Cache is refreshed
// every 30s by a background interval, plus on-demand `refresh()` after
// admin edits the pair.
//
// All numeric guards use a small epsilon (1e-12) so floating-point dust
// from JS arithmetic doesn't reject otherwise-valid orders.

const EPS = 1e-12;
const REFRESH_INTERVAL_MS = 30_000;

export interface SymbolRule {
  pairId: number;
  symbol: string;
  baseCoinId: number;
  quoteCoinId: number;
  tickSize: number;     // 10^-pricePrecision
  lotSize: number;      // 10^-qtyPrecision
  minQty: number;       // 0 means unlimited (no lower bound beyond lotSize)
  maxQty: number;       // 0 means unlimited
  /** Minimum quote-currency value of an order (price * qty). Hard-coded to
   *  1.0 quote-unit because pairsTable doesn't carry it yet. The prod
   *  engine config can override per-symbol. */
  minNotional: number;
  takerFeeRate: number;
  makerFeeRate: number;
  tradingEnabled: boolean;
}

export type ValidationError =
  | { ok: false; code: "unknown_symbol"; message: string }
  | { ok: false; code: "trading_disabled"; message: string }
  | { ok: false; code: "tick_size"; message: string }
  | { ok: false; code: "lot_size"; message: string }
  | { ok: false; code: "min_qty"; message: string }
  | { ok: false; code: "max_qty"; message: string }
  | { ok: false; code: "min_notional"; message: string };

export type ValidationResult = { ok: true; rule: SymbolRule } | ValidationError;

export class SymbolRegistry {
  private bySymbol = new Map<string, SymbolRule>();
  private byPairId = new Map<number, SymbolRule>();
  private overrides = new Map<string, Partial<SymbolRule>>();
  private refreshTimer: NodeJS.Timeout | null = null;
  private loaded = false;

  /** Load (and start the background refresh loop). Idempotent. */
  async start(): Promise<void> {
    await this.refresh();
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      this.refresh().catch(() => { /* logged in caller */ });
    }, REFRESH_INTERVAL_MS);
    // Don't keep the process alive just for this timer.
    this.refreshTimer.unref();
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Force a reload — call after admin edits a pair so changes take effect
   *  before the next 30s tick. */
  async refresh(): Promise<void> {
    const rows = await db.select().from(pairsTable);
    const bySym = new Map<string, SymbolRule>();
    const byPid = new Map<number, SymbolRule>();
    for (const row of rows) {
      const rule = this.rowToRule(row);
      const merged = { ...rule, ...(this.overrides.get(rule.symbol) ?? {}) };
      bySym.set(rule.symbol.toUpperCase(), merged);
      byPid.set(rule.pairId, merged);
    }
    this.bySymbol = bySym;
    this.byPairId = byPid;
    this.loaded = true;
  }

  /** Operator override (e.g. raise minNotional for a volatile symbol).
   *  Persists in-memory only — for permanent changes update pairsTable. */
  setOverride(symbol: string, partial: Partial<SymbolRule>): void {
    const key = symbol.toUpperCase();
    this.overrides.set(key, partial);
    const cur = this.bySymbol.get(key);
    if (cur) this.bySymbol.set(key, { ...cur, ...partial });
  }

  get(symbol: string): SymbolRule | undefined {
    return this.bySymbol.get(symbol.toUpperCase());
  }

  getByPairId(pairId: number): SymbolRule | undefined {
    return this.byPairId.get(pairId);
  }

  isReady(): boolean {
    return this.loaded;
  }

  /** The single validation entry-point. Returns either {ok:true, rule}
   *  or {ok:false, code, message}. Callers attach the message verbatim
   *  to the API error response. */
  validate(symbol: string, price: number, quantity: number, allowZeroPrice = false): ValidationResult {
    const rule = this.get(symbol);
    if (!rule) return { ok: false, code: "unknown_symbol", message: `Unknown symbol: ${symbol}` };
    if (!rule.tradingEnabled) return { ok: false, code: "trading_disabled", message: `Trading is disabled on ${rule.symbol}` };

    if (!allowZeroPrice) {
      if (!isMultipleOf(price, rule.tickSize)) {
        return { ok: false, code: "tick_size", message: `Price must be a multiple of tick size ${rule.tickSize}` };
      }
    }
    if (!isMultipleOf(quantity, rule.lotSize)) {
      return { ok: false, code: "lot_size", message: `Quantity must be a multiple of lot size ${rule.lotSize}` };
    }
    if (rule.minQty > 0 && quantity + EPS < rule.minQty) {
      return { ok: false, code: "min_qty", message: `Minimum order size is ${rule.minQty} ${rule.symbol}` };
    }
    if (rule.maxQty > 0 && quantity > rule.maxQty + EPS) {
      return { ok: false, code: "max_qty", message: `Maximum order size is ${rule.maxQty} ${rule.symbol}` };
    }
    // For market orders (allowZeroPrice=true) we skip minNotional — it's
    // checked by the calling layer once the average fill price is known.
    if (!allowZeroPrice) {
      const notional = price * quantity;
      if (notional + EPS < rule.minNotional) {
        return { ok: false, code: "min_notional", message: `Minimum order value is ${rule.minNotional} (got ${notional.toFixed(8)})` };
      }
    }
    return { ok: true, rule };
  }

  private rowToRule(row: Pair): SymbolRule {
    const tickSize = Math.pow(10, -row.pricePrecision);
    const lotSize = Math.pow(10, -row.qtyPrecision);
    return {
      pairId: row.id,
      symbol: row.symbol.toUpperCase(),
      baseCoinId: row.baseCoinId,
      quoteCoinId: row.quoteCoinId,
      tickSize,
      lotSize,
      minQty: Number(row.minQty ?? 0),
      maxQty: Number(row.maxQty ?? 0),
      minNotional: 1.0,
      takerFeeRate: Number(row.takerFee ?? 0.001),
      makerFeeRate: Number(row.makerFee ?? 0.001),
      tradingEnabled: row.tradingEnabled,
    };
  }
}

/** True if `value` is a non-negative integer multiple of `step`, modulo
 *  floating-point dust. We compare in the multiplied space because pure
 *  modulo on floats is unreliable. */
function isMultipleOf(value: number, step: number): boolean {
  if (step <= 0) return true;
  if (value < 0) return false;
  const ratio = value / step;
  const rounded = Math.round(ratio);
  return Math.abs(ratio - rounded) < 1e-7;
}
