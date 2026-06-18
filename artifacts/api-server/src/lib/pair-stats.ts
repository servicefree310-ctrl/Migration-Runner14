import { db, pairsTable, tradesTable, futuresTradesTable, coinsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { logger } from "./logger";

// In-memory snapshot of authoritative pair stats keyed by display symbol
// ("BTC/USDT", "SOL/INR"). Updated each pair-stats recompute. WS frames
// + Redis cache + ticker routes overlay this so the same numbers reach
// every consumer without re-querying the DB on the price-tick hot path.
export type PairStatsCacheEntry = {
  symbol: string;          // "SOL/INR"
  pairId: number;
  trades24h: number;
  baseVolume: number;      // pairs.volume_24h
  quoteVolume: number;     // pairs.quote_volume_24h
  change24h: number;       // percent
  high24h: number;
  low24h: number;
  lastPrice: number;
  ts: number;
};
const pairStatsCache = new Map<string, PairStatsCacheEntry>();
export function getPairStats(displaySymbol: string): PairStatsCacheEntry | undefined {
  return pairStatsCache.get(displaySymbol);
}
export function getAllPairStats(): PairStatsCacheEntry[] {
  return Array.from(pairStatsCache.values());
}

export async function recomputePairStats(): Promise<void> {
  const pairs = await db.select().from(pairsTable);
  const coins = await db.select().from(coinsTable);
  const coinById = new Map(coins.map((c) => [c.id, c]));
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const p of pairs) {
    if (p.statsOverride) continue;
    try {
      // Spot trades aggregation
      const [agg] = await db
        .select({
          high: sql<string>`COALESCE(MAX(${tradesTable.price})::text, '0')`,
          low: sql<string>`COALESCE(MIN(${tradesTable.price})::text, '0')`,
          vol: sql<string>`COALESCE(SUM(${tradesTable.qty})::text, '0')`,
          quoteVol: sql<string>`COALESCE(SUM(${tradesTable.qty} * ${tradesTable.price})::text, '0')`,
          cnt: sql<number>`COUNT(*)::int`,
          firstPrice: sql<string>`COALESCE((array_agg(${tradesTable.price} ORDER BY ${tradesTable.createdAt} ASC))[1]::text, '0')`,
          lastPrice: sql<string>`COALESCE((array_agg(${tradesTable.price} ORDER BY ${tradesTable.createdAt} DESC))[1]::text, '0')`,
        })
        .from(tradesTable)
        .where(sql`${tradesTable.pairId} = ${p.id} AND ${tradesTable.createdAt} >= ${since}`);

      // Futures trades aggregation (for futures-enabled pairs)
      let ftAgg: { high: string; low: string; vol: string; quoteVol: string; cnt: number; firstPrice: string; lastPrice: string } | null = null;
      if (p.futuresEnabled) {
        const [fa] = await db
          .select({
            high: sql<string>`COALESCE(MAX(${futuresTradesTable.price})::text, '0')`,
            low: sql<string>`COALESCE(MIN(${futuresTradesTable.price})::text, '0')`,
            vol: sql<string>`COALESCE(SUM(${futuresTradesTable.qty})::text, '0')`,
            quoteVol: sql<string>`COALESCE(SUM(${futuresTradesTable.qty} * ${futuresTradesTable.price})::text, '0')`,
            cnt: sql<number>`COUNT(*)::int`,
            firstPrice: sql<string>`COALESCE((array_agg(${futuresTradesTable.price} ORDER BY ${futuresTradesTable.createdAt} ASC))[1]::text, '0')`,
            lastPrice: sql<string>`COALESCE((array_agg(${futuresTradesTable.price} ORDER BY ${futuresTradesTable.createdAt} DESC))[1]::text, '0')`,
          })
          .from(futuresTradesTable)
          .where(sql`${futuresTradesTable.pairId} = ${p.id} AND ${futuresTradesTable.createdAt} >= ${since}`);
        if (fa) ftAgg = fa;
      }

      // Merge spot + futures aggregates
      const spotCnt = Number(agg?.cnt ?? 0);
      const ftCnt = Number(ftAgg?.cnt ?? 0);
      const totalCnt = spotCnt + ftCnt;

      // Combined high/low/vol/quoteVol
      const spotHigh = Number(agg?.high ?? 0);
      const spotLow = Number(agg?.low ?? 0);
      const ftHigh = Number(ftAgg?.high ?? 0);
      const ftLow = Number(ftAgg?.low ?? 0);
      const combinedHigh = (spotHigh > 0 && ftHigh > 0) ? Math.max(spotHigh, ftHigh) : Math.max(spotHigh, ftHigh);
      const combinedLow = (spotLow > 0 && ftLow > 0) ? Math.min(spotLow, ftLow) : Math.max(spotLow, ftLow);
      const combinedVol = (Number(agg?.vol ?? 0) + Number(ftAgg?.vol ?? 0)).toFixed(8);
      const combinedQVol = (Number(agg?.quoteVol ?? 0) + Number(ftAgg?.quoteVol ?? 0)).toFixed(8);

      // lastPrice: prefer whichever source had the most recent trade
      // (use futures last if futures has data for a futures-enabled pair, otherwise spot)
      let combinedFirst = Number(agg?.firstPrice ?? 0);
      let combinedLast = Number(agg?.lastPrice ?? 0);
      if (ftCnt > 0) {
        if (spotCnt === 0) {
          combinedFirst = Number(ftAgg!.firstPrice);
          combinedLast = Number(ftAgg!.lastPrice);
        } else {
          // Both have data — use spot first for open, futures last for close
          // (both share the same price as the underlying is the same market)
          combinedLast = Number(ftAgg!.lastPrice);
        }
      }

      // Merge into the original `agg` shape expected by the code below
      const mergedAgg = {
        high: combinedHigh.toFixed(8),
        low: combinedLow > 0 ? combinedLow.toFixed(8) : "0",
        vol: combinedVol,
        quoteVol: combinedQVol,
        cnt: totalCnt,
        firstPrice: combinedFirst > 0 ? combinedFirst.toFixed(8) : "0",
        lastPrice: combinedLast > 0 ? combinedLast.toFixed(8) : "0",
      };

      // Use mergedAgg (spot + futures combined) for all downstream consumers
      const first = Number(mergedAgg.firstPrice);
      const last  = Number(mergedAgg.lastPrice);
      const change = first > 0 ? ((last - first) / first) * 100 : 0;
      const cnt = mergedAgg.cnt;

      // Use raw SQL update so we don't depend on Drizzle's column-name
      // mapping (which has previously dropped volume_24h silently when
      // routed through .set({ volume24h })). Stats include bot fills and
      // futures fills — all trade sources land in the merged aggregate.
      if (cnt > 0) {
        const high = mergedAgg.high;
        const low  = mergedAgg.low;
        const vol  = mergedAgg.vol;
        const qvol = mergedAgg.quoteVol;
        const chg  = change.toFixed(4);
        if (last > 0) {
          await db.execute(sql`
            UPDATE pairs SET trades_24h = ${cnt},
              high_24h = ${high}, low_24h = ${low},
              volume_24h = ${vol}, quote_volume_24h = ${qvol},
              change_24h = ${chg}, last_price = ${String(last)}
            WHERE id = ${p.id}`);
        } else {
          await db.execute(sql`
            UPDATE pairs SET trades_24h = ${cnt},
              high_24h = ${high}, low_24h = ${low},
              volume_24h = ${vol}, quote_volume_24h = ${qvol},
              change_24h = ${chg}
            WHERE id = ${p.id}`);
        }
      } else {
        await db.execute(sql`UPDATE pairs SET trades_24h = 0 WHERE id = ${p.id}`);
      }

      // Refresh in-memory cache so WS frames + Redis writers can overlay
      // these values on the next price tick (no extra DB round-trip).
      const baseSym = coinById.get(p.baseCoinId)?.symbol;
      const quoteSym = coinById.get(p.quoteCoinId)?.symbol;
      if (baseSym && quoteSym) {
        const display = `${baseSym}/${quoteSym}`;
        pairStatsCache.set(display, {
          symbol: display,
          pairId: p.id,
          trades24h: cnt,
          baseVolume:  cnt > 0 ? Number(mergedAgg.vol)      : 0,
          quoteVolume: cnt > 0 ? Number(mergedAgg.quoteVol) : 0,
          change24h:   cnt > 0 ? change : 0,
          high24h:     cnt > 0 ? Number(mergedAgg.high) : 0,
          low24h:      cnt > 0 ? Number(mergedAgg.low)  : 0,
          lastPrice:   cnt > 0 && last > 0 ? last : Number(p.lastPrice ?? 0),
          ts: Date.now(),
        });
      }
    } catch (e: any) {
      logger.warn({ err: e?.message, pairId: p.id }, "pair stats recompute failed");
    }
  }
}

let timer: NodeJS.Timeout | null = null;
export function startPairStatsService(intervalMs = 30_000): void {
  if (timer) return;
  // Multi-server safety: only the leader recomputes pair stats. Followers
  // read the resulting Redis cache (`pair-stats:*`) when serving WS frames.
  const guarded = async () => {
    const { isLeader } = await import("./leader");
    if (!isLeader()) return;
    try {
      await recomputePairStats();
    } catch (e: any) {
      logger.warn({ err: e?.message }, "pair stats recompute failed");
    }
  };
  void guarded();
  timer = setInterval(() => { void guarded(); }, intervalMs);
  logger.info({ intervalMs }, "Pair stats service started (leader-gated)");
}

export function stopPairStatsService(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
