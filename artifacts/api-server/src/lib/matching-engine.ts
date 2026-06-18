import { eq, sql, and, or, desc } from "drizzle-orm";
import { db, ordersTable, tradesTable, walletsTable, pairsTable, usersTable, walletLedgerTable, coinsTable } from "@workspace/db";
import { logger } from "./logger";
import { cancelOcoPartners } from "./oco";
import { getRedis, rZadd, rZrem, rSet, rDel, rLpush, rPublish, rGet } from "./redis";
import { getSpotFeeRates } from "../routes/fees";

let engineEnabled = true;
let engineStats = {
  matchesAttempted: 0,
  tradesExecuted: 0,
  totalVolumeQuote: 0,
  lastMatchAt: 0 as number,
  lastError: "" as string,
  perSymbol: {} as Record<string, { trades: number; volume: number; lastTs: number }>,
};

export function setEngineEnabled(on: boolean) { engineEnabled = on; }
export function getEngineStats() {
  return { enabled: engineEnabled, ...engineStats };
}
export function resetEngineStats() {
  engineStats = { matchesAttempted: 0, tradesExecuted: 0, totalVolumeQuote: 0, lastMatchAt: 0, lastError: "", perSymbol: {} };
}

async function bestOpposite(symbol: string, side: "buy" | "sell", limitPrice: number, _isMarket: boolean) {
  const r = getRedis();
  if (!r) return null;
  // Buy taker hits SELL book (lowest ask). Sell taker hits BUY book (highest bid = most-negative score).
  const bookSide = side === "buy" ? "sell" : "buy";
  const key = `orderbook:${symbol}:${bookSide}`;
  const top = await r.zrange(key, 0, 0, "WITHSCORES");
  if (!top || top.length < 2) return null;
  const oppId = Number(top[0]);
  const oppScore = Number(top[1]);
  const oppPrice = bookSide === "sell" ? oppScore : -oppScore;
  // Always honour `limitPrice` as the worst-acceptable price.
  // For LIMIT orders this is the user's chosen price.
  // For MARKET orders the order's `price` column is set at placement to the
  // ±10% slippage cap from the last traded price (see placeSpotOrder), so
  // markets stop sweeping if the book is thin / manipulated past the cap.
  if (side === "buy" && oppPrice > limitPrice) return null;
  if (side === "sell" && oppPrice < limitPrice) return null;
  return { id: oppId, price: oppPrice };
}

async function getOrderForUpdate(tx: any, id: number) {
  const [o] = await tx.select().from(ordersTable).where(eq(ordersTable.id, id)).for("update").limit(1);
  return o;
}

async function ensureWallet(tx: any, userId: number, coinId: number, walletType: string = "spot") {
  const [w] = await tx.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coinId), eq(walletsTable.walletType, walletType)))
    .for("update").limit(1);
  if (w) return w;
  const [c] = await tx.insert(walletsTable).values({ userId, coinId, walletType, balance: "0", locked: "0" }).returning();
  const [locked] = await tx.select().from(walletsTable).where(eq(walletsTable.id, c.id)).for("update").limit(1);
  return locked;
}

/** Returns "inr" for the INR coin (fiat), "spot" for all crypto coins. */
function spotOrInr(symbol: string | undefined) { return symbol === "INR" ? "inr" : "spot"; }

// `takerInBook` tells the engine that the taker order is already a resting
// member of the Redis ZSET orderbook (true for bot-service paths that match
// already-placed orders, false for placeSpotOrder which manages its own
// post-match Redis reconciliation). When true, the engine maintains the
// taker's ZSET/payload state inside the same FOR-UPDATE-locked transaction
// as the maker update — this prevents a race where a concurrent placement
// hitting the taker as a maker writes the new payload, and a separate post-
// match reconciliation by the original caller then overwrites it with the
// older snapshot.
export async function tryMatch(takerOrderId: number, opts?: { takerVipTier?: number; takerInBook?: boolean; maxFills?: number }): Promise<{ trades: number; remainingQty: number; status: string }> {
  if (!engineEnabled) return { trades: 0, remainingQty: 0, status: "disabled" };
  const r = getRedis();
  if (!r) return { trades: 0, remainingQty: 0, status: "no-redis" };

  let totalTrades = 0;
  let finalStatus = "open";
  let finalRemaining = 0;
  const maxFills = opts?.maxFills ?? 500;

  // Cap iterations to avoid infinite loops on weird data, but keep it
  // generous so a single market or limit order can fully sweep many price
  // levels of bot/maker liquidity in one placement.
  const finishedWithOco: Array<{ id: number; ocoGroupId: string }> = [];
  for (let iter = 0; iter < maxFills; iter++) {
    engineStats.matchesAttempted++;
    let matchExecuted = false;
    let staleRemoved = false;
    let stop = false;
    let symbolForPub = "";

    try {
      await db.transaction(async (tx) => {
        const taker = await getOrderForUpdate(tx, takerOrderId);
        if (!taker) { stop = true; return; }
        if (taker.status !== "open" && taker.status !== "partial") { stop = true; finalStatus = taker.status; return; }
        const remaining = Number(taker.qty) - Number(taker.filledQty ?? 0);
        if (remaining <= 0) { stop = true; finalStatus = "filled"; return; }
        finalRemaining = remaining;

        const [pair] = await tx.select().from(pairsTable).where(eq(pairsTable.id, taker.pairId)).limit(1);
        if (!pair) { stop = true; return; }
        // Determine wallet types: INR is stored as walletType="inr"; all crypto as "spot"
        const pairCoins = await tx.select({ id: coinsTable.id, symbol: coinsTable.symbol })
          .from(coinsTable).where(or(eq(coinsTable.id, pair.baseCoinId), eq(coinsTable.id, pair.quoteCoinId)));
        const quoteWt = spotOrInr(pairCoins.find((c: any) => c.id === pair.quoteCoinId)?.symbol);
        const symbol = pair.symbol; symbolForPub = symbol;
        const isMarket = taker.type === "market";
        const limitPrice = Number(taker.price);

        const opp = await bestOpposite(symbol, taker.side as any, limitPrice, isMarket);
        if (!opp) { stop = true; return; }

        const maker = await getOrderForUpdate(tx, opp.id);
        if (!maker || (maker.status !== "open" && maker.status !== "partial")) {
          // Stale Redis entry — remove it and retry the outer loop so the
          // taker can still match against deeper valid price levels. Setting
          // staleRemoved prevents the loop from exiting on !matchExecuted.
          await rZrem(`orderbook:${symbol}:${maker?.side ?? (taker.side === "buy" ? "sell" : "buy")}`, String(opp.id));
          staleRemoved = true;
          return;
        }
        const takerIsBot2 = (taker.isBot ?? 0) === 1;
        const makerIsBot2 = (maker.isBot ?? 0) === 1;
        if (maker.userId === taker.userId && !(takerIsBot2 && makerIsBot2)) {
          // Self-trade prevention: cancel the resting maker, refund, continue loop.
          // Exception: bot-to-bot matches (both isBot=1) are allowed even when they
          // share the same userId — they provide synthetic liquidity and carry no
          // real funds, so the normal "gaming fee structure" risk does not apply.
          // Bot makers are synthetic and never had funds locked at placement, so
          // skip the wallet refund — otherwise we'd credit ghost balance and
          // push locked negative.
          const makerRem = Number(maker.qty) - Number(maker.filledQty ?? 0);
          if ((maker.isBot ?? 0) !== 1) {
            if (maker.side === "buy") {
              // At placement the buy lock was qty × price × (1 + takerFeeRate).
              // maker.userId === taker.userId (self-trade), so same VIP tier.
              // Look up the actual tier from DB so the refund is exact even
              // when takerVipTier was not passed by the caller (e.g. bot path).
              const [selfUser] = await tx.select({ vipTier: usersTable.vipTier })
                .from(usersTable).where(eq(usersTable.id, maker.userId)).limit(1);
              const selfVipTier = opts?.takerVipTier ?? Number(selfUser?.vipTier ?? 0);
              const stRates = await getSpotFeeRates(selfVipTier);
              const release = makerRem * Number(maker.price) * (1 + stRates.taker);
              const w = await ensureWallet(tx, maker.userId, pair.quoteCoinId, quoteWt);
              await tx.update(walletsTable).set({
                balance: sql`${walletsTable.balance} + ${release}`,
                locked: sql`${walletsTable.locked} - ${release}`,
                updatedAt: new Date(),
              }).where(eq(walletsTable.id, w.id));
            } else {
              const w = await ensureWallet(tx, maker.userId, pair.baseCoinId);
              await tx.update(walletsTable).set({
                balance: sql`${walletsTable.balance} + ${makerRem}`,
                locked: sql`${walletsTable.locked} - ${makerRem}`,
                updatedAt: new Date(),
              }).where(eq(walletsTable.id, w.id));
            }
          }
          await tx.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(ordersTable.id, maker.id));
          await rZrem(`orderbook:${symbol}:${maker.side}`, String(maker.id));
          await rDel(`orderbook:${symbol}:order:${maker.id}`);
          return;
        }

        const makerRem = Number(maker.qty) - Number(maker.filledQty ?? 0);
        const fillQty = Math.min(remaining, makerRem);
        const tradePrice = Number(maker.price); // price-time priority: maker price
        const notional = fillQty * tradePrice;

        // Dust-fill guard: skip fills whose quote notional is too small to
        // produce a meaningful fee or ledger entry. This prevents dust-qty
        // orders (e.g. bot remainder of 1e-10 BTC) from creating near-zero
        // trade records and bloating the trade log. We stop the loop rather
        // than remove the maker, so the maker remains as a resting order.
        const MIN_NOTIONAL = 1e-6;
        if (notional < MIN_NOTIONAL) { stop = true; return; }

        // Load admin-configured fees (with GST baked in) for both taker and maker
        const takerRates = await getSpotFeeRates(opts?.takerVipTier ?? 0);
        const [makerUserRow] = await tx.select({ vipTier: usersTable.vipTier }).from(usersTable).where(eq(usersTable.id, maker.userId)).limit(1);
        const makerVipTier = Number(makerUserRow?.vipTier ?? 0);
        const makerRates = await getSpotFeeRates(makerVipTier);
        const takerFeeRate = takerRates.taker;
        const makerFeeRate = makerRates.maker;
        const tdsRate = takerRates.tds;
        const takerFee = notional * takerFeeRate;
        const makerFee = notional * makerFeeRate;
        const takerTds = taker.side === "sell" ? notional * tdsRate : 0;
        const makerTds = maker.side === "sell" ? notional * tdsRate : 0;

        // Bot orders are synthetic liquidity — they're inserted into the
        // book without locking any funds at placement time. Settling
        // their wallet on a fill would push locked negative and credit
        // ghost balances. Skip wallet ops for both sides if either party
        // is a bot; only real (isBot===0) orders move money.
        const takerIsBot = (taker.isBot ?? 0) === 1;
        const makerIsBot = (maker.isBot ?? 0) === 1;

        // Capture pre-update wallet balances for ledger entries
        let takerBaseBalBefore = 0, takerQuoteBalBefore = 0;
        let makerBaseBalBefore = 0, makerQuoteBalBefore = 0;

        if (taker.side === "buy") {
          // Taker BUY: pays quote, receives base. Locked quote on taker reduces by notional.
          // Maker SELL: locked base reduces by fillQty, receives quote (notional - makerFee).
          // For LIMIT taker, locked = remaining * limitPrice; effective spend = notional. Refund (limitPrice - tradePrice)*fillQty.
          if (!takerIsBot) {
            // Locked-per-fill is uniformly derived from the order's `price`
            // column. For LIMIT this is the user's price; for MARKET we
            // store the +10% slippage cap there at placement, so both
            // paths share the same accounting and any over-lock is refunded
            // immediately on each fill.
            // Both market AND limit locks include a fee buffer (1 + takerFeeRate) at
            // placement time (see placeSpotOrder in routes/orders.ts). Release the
            // same per-fill slice here so locked stays in sync, then credit the
            // difference (price improvement + fee over/under) back to free balance.
            // takerRefund can be slightly negative if the VIP tier changed between
            // placement and fill — always apply the delta so fees are never skipped.
            const takerQuoteLocked = fillQty * limitPrice * (1 + takerFeeRate);
            const takerSpend = notional + takerFee; // what we actually take from locked
            const takerRefund = takerQuoteLocked - takerSpend;
            const tQuote = await ensureWallet(tx, taker.userId, pair.quoteCoinId, quoteWt);
            takerQuoteBalBefore = parseFloat(tQuote.balance ?? "0");
            await tx.update(walletsTable).set({
              locked: sql`${walletsTable.locked} - ${takerQuoteLocked}`,
              balance: takerRefund !== 0 ? sql`${walletsTable.balance} + ${takerRefund}` : walletsTable.balance,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, tQuote.id));
            const tBase = await ensureWallet(tx, taker.userId, pair.baseCoinId);
            takerBaseBalBefore = parseFloat(tBase.balance ?? "0");
            await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} + ${fillQty}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, tBase.id));
          }
          if (!makerIsBot) {
            // Maker sell: release locked base, credit quote
            const mBase = await ensureWallet(tx, maker.userId, pair.baseCoinId);
            makerBaseBalBefore = parseFloat(mBase.balance ?? "0");
            await tx.update(walletsTable).set({
              locked: sql`${walletsTable.locked} - ${fillQty}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, mBase.id));
            const mQuote = await ensureWallet(tx, maker.userId, pair.quoteCoinId, quoteWt);
            makerQuoteBalBefore = parseFloat(mQuote.balance ?? "0");
            await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} + ${notional - makerFee - makerTds}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, mQuote.id));
          }
        } else {
          // Taker SELL: locked base = remaining (qty units). Spend fillQty base, get notional - takerFee quote.
          if (!takerIsBot) {
            const tBase = await ensureWallet(tx, taker.userId, pair.baseCoinId);
            takerBaseBalBefore = parseFloat(tBase.balance ?? "0");
            await tx.update(walletsTable).set({
              locked: sql`${walletsTable.locked} - ${fillQty}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, tBase.id));
            const tQuote = await ensureWallet(tx, taker.userId, pair.quoteCoinId, quoteWt);
            takerQuoteBalBefore = parseFloat(tQuote.balance ?? "0");
            await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} + ${notional - takerFee - takerTds}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, tQuote.id));
          }
          if (!makerIsBot) {
            // BUY maker: at order placement the lock was qty × price × (1 + takerFeeRate)
            // (the placeSpotOrder function always uses the taker rate for the quote lock,
            // even for limit orders, as a conservative buffer).  Release the full per-fill
            // slice (tradePrice × (1 + makerRates.taker)) and credit back the difference
            // between the takerFee buffer and the actual makerFee — mirroring the taker
            // refund path above and ensuring locked never leaks.
            const makerQuoteLocked = fillQty * tradePrice * (1 + makerRates.taker);
            const makerRefund = makerQuoteLocked - notional - makerFee;
            const mQuote = await ensureWallet(tx, maker.userId, pair.quoteCoinId, quoteWt);
            makerQuoteBalBefore = parseFloat(mQuote.balance ?? "0");
            await tx.update(walletsTable).set({
              locked: sql`${walletsTable.locked} - ${makerQuoteLocked}`,
              balance: makerRefund !== 0 ? sql`${walletsTable.balance} + ${makerRefund}` : walletsTable.balance,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, mQuote.id));
            const mBase = await ensureWallet(tx, maker.userId, pair.baseCoinId);
            makerBaseBalBefore = parseFloat(mBase.balance ?? "0");
            await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} + ${fillQty}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, mBase.id));
          }
        }

        // Insert two trade rows — one per side — for per-user accounting.
        // isTaker=1 marks the aggressive (incoming) side; isTaker=0 marks the
        // resting maker. Admin trade tape filters on isTaker=1 so exactly one
        // row per match appears, even when both sides are real users (not bots).
        // counterOrderId cross-references the opposing order so callers can
        // reconstruct the full match without a JOIN.
        // gstPct/tdsPct snapshotted so invoices remain accurate if rates change.
        const [trade] = await tx.insert(tradesTable).values({
          orderId: taker.id, userId: taker.userId, pairId: pair.id,
          side: taker.side, price: String(tradePrice), qty: String(fillQty),
          fee: String(takerFee), tds: String(takerTds), isTaker: 1,
          counterOrderId: maker.id,
          gstPct: String(takerRates.gstPercent),
          tdsPct: String(takerRates.tds * 100),
        }).returning();
        await tx.insert(tradesTable).values({
          orderId: maker.id, userId: maker.userId, pairId: pair.id,
          side: maker.side, price: String(tradePrice), qty: String(fillQty),
          fee: String(makerFee), tds: String(makerTds), isTaker: 0,
          counterOrderId: taker.id,
          gstPct: String(makerRates.gstPercent),
          tdsPct: String(makerRates.tds * 100),
        });

        // Write wallet ledger entries for both sides (real users only, never bots).
        // These power the /ledger page so users can see all trade activity.
        const tradeRefId = String(trade?.id ?? "");
        const tradeNote = `${pair.symbol} @ ${tradePrice}`;
        const ledgerRows: any[] = [];
        if (!takerIsBot) {
          if (taker.side === "buy") {
            // Recompute the per-fill lock slice (same formula used in the wallet
            // settlement above) so we can reconstruct the "pre-lock" balance.
            // Adding it back to takerQuoteBalBefore gives the quote balance as
            // it was BEFORE this fill's slice was frozen at order placement.
            // Ledger balances then cascade correctly and the final balanceAfter
            // equals the actual post-fill wallet balance:
            //   preTrade − notional − takerFee
            //   = takerQuoteBalBefore + takerQuoteLocked − notional − takerFee
            //   = takerQuoteBalBefore + takerRefund  ← actual balance after update ✓
            const takerQuoteLockedLedger = fillQty * limitPrice * (1 + takerFeeRate);
            const preTrade = takerQuoteBalBefore + takerQuoteLockedLedger;
            // Quote: notional cost of the purchase
            ledgerRows.push({
              userId: taker.userId, coinId: pair.quoteCoinId, walletType: quoteWt,
              type: "trade_buy", amount: String(-notional),
              balanceBefore: String(preTrade),
              balanceAfter: String(preTrade - notional),
              refType: "trade", refId: tradeRefId,
              note: `Buy ${tradeNote}`,
            });
            // Quote: trading fee (cascaded from notional entry)
            if (takerFee > 0) ledgerRows.push({
              userId: taker.userId, coinId: pair.quoteCoinId, walletType: quoteWt,
              type: "trade_fee", amount: String(-takerFee),
              balanceBefore: String(preTrade - notional),
              balanceAfter: String(preTrade - notional - takerFee),
              refType: "trade", refId: tradeRefId,
              note: `Fee ${tradeNote}`,
            });
            // Base: coins received
            ledgerRows.push({
              userId: taker.userId, coinId: pair.baseCoinId, walletType: "spot",
              type: "trade_buy", amount: String(fillQty),
              balanceBefore: String(takerBaseBalBefore),
              balanceAfter: String(takerBaseBalBefore + fillQty),
              refType: "trade", refId: tradeRefId,
              note: `Buy ${tradeNote}`,
            });
          } else {
            // Taker sold base coin, received quote.
            // Base debit: at SELL placement balance -= qty and locked += qty.
            // At fill only locked is released; balance column is unchanged.
            // Reconstruct pre-lock balance = takerBaseBalBefore + fillQty.
            const preSellBase = takerBaseBalBefore + fillQty;
            ledgerRows.push({
              userId: taker.userId, coinId: pair.baseCoinId, walletType: "spot",
              type: "trade_sell", amount: String(-fillQty),
              balanceBefore: String(preSellBase),
              balanceAfter: String(takerBaseBalBefore),
              refType: "trade", refId: tradeRefId,
              note: `Sell ${tradeNote}`,
            });
            // Quote: gross proceeds → fee → TDS, cascading so the final
            // balanceAfter = takerQuoteBalBefore + (notional−fee−tds) = actual ✓
            ledgerRows.push({
              userId: taker.userId, coinId: pair.quoteCoinId, walletType: quoteWt,
              type: "trade_sell", amount: String(notional),
              balanceBefore: String(takerQuoteBalBefore),
              balanceAfter: String(takerQuoteBalBefore + notional),
              refType: "trade", refId: tradeRefId,
              note: `Sell ${tradeNote}`,
            });
            if (takerFee > 0) ledgerRows.push({
              userId: taker.userId, coinId: pair.quoteCoinId, walletType: quoteWt,
              type: "trade_fee", amount: String(-takerFee),
              balanceBefore: String(takerQuoteBalBefore + notional),
              balanceAfter: String(takerQuoteBalBefore + notional - takerFee),
              refType: "trade", refId: tradeRefId,
              note: `Fee ${tradeNote}`,
            });
            if (takerTds > 0) ledgerRows.push({
              userId: taker.userId, coinId: pair.quoteCoinId, walletType: quoteWt,
              type: "trade_tds", amount: String(-takerTds),
              balanceBefore: String(takerQuoteBalBefore + notional - takerFee),
              balanceAfter: String(takerQuoteBalBefore + notional - takerFee - takerTds),
              refType: "trade", refId: tradeRefId,
              note: `TDS ${tradeNote}`,
            });
          }
        }
        if (!makerIsBot) {
          if (maker.side === "sell") {
            // Maker sold base coin, received quote. Same split as taker sell:
            // base debit (pre-lock reconstructed) + gross proceeds + fee + TDS.
            const preSellBaseMaker = makerBaseBalBefore + fillQty;
            ledgerRows.push({
              userId: maker.userId, coinId: pair.baseCoinId, walletType: "spot",
              type: "trade_sell", amount: String(-fillQty),
              balanceBefore: String(preSellBaseMaker),
              balanceAfter: String(makerBaseBalBefore),
              refType: "trade", refId: tradeRefId,
              note: `Sell ${tradeNote}`,
            });
            ledgerRows.push({
              userId: maker.userId, coinId: pair.quoteCoinId, walletType: quoteWt,
              type: "trade_sell", amount: String(notional),
              balanceBefore: String(makerQuoteBalBefore),
              balanceAfter: String(makerQuoteBalBefore + notional),
              refType: "trade", refId: tradeRefId,
              note: `Sell ${tradeNote}`,
            });
            if (makerFee > 0) ledgerRows.push({
              userId: maker.userId, coinId: pair.quoteCoinId, walletType: quoteWt,
              type: "trade_fee", amount: String(-makerFee),
              balanceBefore: String(makerQuoteBalBefore + notional),
              balanceAfter: String(makerQuoteBalBefore + notional - makerFee),
              refType: "trade", refId: tradeRefId,
              note: `Fee ${tradeNote}`,
            });
            if (makerTds > 0) ledgerRows.push({
              userId: maker.userId, coinId: pair.quoteCoinId, walletType: quoteWt,
              type: "trade_tds", amount: String(-makerTds),
              balanceBefore: String(makerQuoteBalBefore + notional - makerFee),
              balanceAfter: String(makerQuoteBalBefore + notional - makerFee - makerTds),
              refType: "trade", refId: tradeRefId,
              note: `TDS ${tradeNote}`,
            });
          } else {
            // Maker bought base coin. Mirror the taker-buy approach: reconstruct
            // the pre-lock balance using the fee-buffered lock slice (same formula
            // as the wallet settlement: fillQty × tradePrice × (1 + makerRates.taker)).
            // preTrade − notional − makerFee
            //   = makerQuoteBalBefore + makerQuoteLockedLedger − notional − makerFee
            //   = makerQuoteBalBefore + makerRefund  ← actual balance after update ✓
            const makerQuoteLockedLedger = fillQty * tradePrice * (1 + makerRates.taker);
            const makerPreTrade = makerQuoteBalBefore + makerQuoteLockedLedger;
            // Quote: notional cost of the purchase
            ledgerRows.push({
              userId: maker.userId, coinId: pair.quoteCoinId, walletType: quoteWt,
              type: "trade_buy", amount: String(-notional),
              balanceBefore: String(makerPreTrade),
              balanceAfter: String(makerPreTrade - notional),
              refType: "trade", refId: tradeRefId,
              note: `Buy ${tradeNote}`,
            });
            // Quote: trading fee (cascaded from notional entry)
            if (makerFee > 0) ledgerRows.push({
              userId: maker.userId, coinId: pair.quoteCoinId, walletType: quoteWt,
              type: "trade_fee", amount: String(-makerFee),
              balanceBefore: String(makerPreTrade - notional),
              balanceAfter: String(makerPreTrade - notional - makerFee),
              refType: "trade", refId: tradeRefId,
              note: `Fee ${tradeNote}`,
            });
            // Base: coins received
            ledgerRows.push({
              userId: maker.userId, coinId: pair.baseCoinId, walletType: "spot",
              type: "trade_buy", amount: String(fillQty),
              balanceBefore: String(makerBaseBalBefore),
              balanceAfter: String(makerBaseBalBefore + fillQty),
              refType: "trade", refId: tradeRefId,
              note: `Buy ${tradeNote}`,
            });
          }
        }
        if (ledgerRows.length > 0) {
          await tx.insert(walletLedgerTable).values(ledgerRows);
        }

        // Update orders. avgPrice is the volume-weighted average across
        // all fills, so a buy that sweeps multiple lower-priced sells
        // ends up with a true blended cost basis instead of the last
        // tape print.
        const oldTakerFilled = Number(taker.filledQty ?? 0);
        const oldTakerAvg = Number(taker.avgPrice ?? 0);
        const newTakerFilled = oldTakerFilled + fillQty;
        const newTakerAvg = newTakerFilled > 0
          ? (oldTakerFilled * oldTakerAvg + fillQty * tradePrice) / newTakerFilled
          : tradePrice;
        const takerFinished = newTakerFilled >= Number(taker.qty) - 1e-12;

        const oldMakerFilled = Number(maker.filledQty ?? 0);
        const oldMakerAvg = Number(maker.avgPrice ?? 0);
        const newMakerFilled = oldMakerFilled + fillQty;
        const newMakerAvg = newMakerFilled > 0
          ? (oldMakerFilled * oldMakerAvg + fillQty * tradePrice) / newMakerFilled
          : tradePrice;
        const makerFinished = newMakerFilled >= Number(maker.qty) - 1e-12;
        if (makerFinished && maker.ocoGroupId) {
          finishedWithOco.push({ id: maker.id, ocoGroupId: maker.ocoGroupId });
        }

        await tx.update(ordersTable).set({
          filledQty: String(newTakerFilled),
          avgPrice: String(newTakerAvg.toFixed(8)),
          fee: sql`${ordersTable.fee} + ${takerFee}`,
          tds: sql`${ordersTable.tds} + ${takerTds}`,
          status: takerFinished ? "filled" : "partial",
          updatedAt: new Date(),
        }).where(eq(ordersTable.id, taker.id));
        await tx.update(ordersTable).set({
          filledQty: String(newMakerFilled),
          avgPrice: String(newMakerAvg.toFixed(8)),
          fee: sql`${ordersTable.fee} + ${makerFee}`,
          tds: sql`${ordersTable.tds} + ${makerTds}`,
          status: makerFinished ? "filled" : "partial",
          updatedAt: new Date(),
        }).where(eq(ordersTable.id, maker.id));

        // Update pair lastPrice
        await tx.update(pairsTable).set({
          lastPrice: String(tradePrice),
          volume24h: sql`"volume_24h" + ${String(fillQty)}::numeric`,
          quoteVolume24h: sql`"quote_volume_24h" + ${String(notional)}::numeric`,
        }).where(eq(pairsTable.id, pair.id));

        // Update Redis book — maker
        if (makerFinished) {
          await rZrem(`orderbook:${symbol}:${maker.side}`, String(maker.id));
          await rDel(`orderbook:${symbol}:order:${maker.id}`);
        } else {
          await rSet(`orderbook:${symbol}:order:${maker.id}`, JSON.stringify({
            id: maker.id, userId: maker.userId, side: maker.side, type: maker.type,
            price: Number(maker.price), qty: Number(maker.qty), filledQty: newMakerFilled,
            status: "partial", ts: Date.now(),
          }), 86400);
        }

        // Update Redis book — taker (only when caller indicated the taker
        // is already a resting member of the book). Doing this inside the
        // same FOR-UPDATE-locked transaction as the maker write is what
        // makes it race-free against concurrent placements that hit this
        // taker as a maker — both writers serialize on the row lock.
        if (opts?.takerInBook && taker.type === "limit") {
          if (takerFinished) {
            await rZrem(`orderbook:${symbol}:${taker.side}`, String(taker.id));
            await rDel(`orderbook:${symbol}:order:${taker.id}`);
          } else {
            await rSet(`orderbook:${symbol}:order:${taker.id}`, JSON.stringify({
              id: taker.id, userId: taker.userId, side: taker.side, type: taker.type,
              price: Number(taker.price), qty: Number(taker.qty), filledQty: newTakerFilled,
              status: "partial", ts: Date.now(),
            }), 86400);
          }
        }

        // Publish trade
        const tradePayload = JSON.stringify({
          id: trade.id, pairId: pair.id, side: taker.side,
          price: tradePrice, qty: fillQty, ts: Date.now(),
        });
        const r2 = getRedis();
        await rLpush(`trades:${symbol}`, tradePayload);
        if (r2) await r2.ltrim(`trades:${symbol}`, 0, 499);
        await rLpush(`trades:user:${taker.userId}`, tradePayload);
        if (r2) await r2.ltrim(`trades:user:${taker.userId}`, 0, 499);
        if (maker.userId !== taker.userId) {
          await rLpush(`trades:user:${maker.userId}`, tradePayload);
          if (r2) await r2.ltrim(`trades:user:${maker.userId}`, 0, 499);
        }
        await rPublish(`trades.${symbol}`, JSON.parse(tradePayload));
        await rSet(`pair:${symbol}:lastPrice`, String(tradePrice), 60);

        finalRemaining = remaining - fillQty;
        finalStatus = takerFinished ? "filled" : "partial";
        totalTrades++;
        matchExecuted = true;

        engineStats.tradesExecuted++;
        engineStats.totalVolumeQuote += notional;
        engineStats.lastMatchAt = Date.now();
        const ps = (engineStats.perSymbol[symbol] ||= { trades: 0, volume: 0, lastTs: 0 });
        ps.trades++; ps.volume += notional; ps.lastTs = Date.now();

        if (takerFinished) {
          stop = true;
          if (taker.ocoGroupId) {
            finishedWithOco.push({ id: taker.id, ocoGroupId: taker.ocoGroupId });
          }
        }
      });
    } catch (e: any) {
      engineStats.lastError = e?.message ?? String(e);
      logger.warn({ err: engineStats.lastError, takerOrderId }, "matching iteration failed");
      stop = true;
    }

    if (symbolForPub && matchExecuted) {
      await rPublish(`book.${symbolForPub}`, { type: "match", takerOrderId, ts: Date.now() });
    }
    if (stop) break;
    // Only exit the sweep loop when nothing happened at all.
    // If we just cleaned up a stale Redis entry (staleRemoved=true) we should
    // retry so the taker can still match against the next valid price level.
    if (!matchExecuted && !staleRemoved) break;
  }

  // Cancel OCO partner legs for any order that just fully filled.
  for (const fo of finishedWithOco) {
    void cancelOcoPartners(fo.ocoGroupId, fo.id).catch((err) =>
      logger.warn({ err, orderId: fo.id }, "OCO cancel failed after fill"),
    );
  }

  return { trades: totalTrades, remainingQty: finalRemaining, status: finalStatus };
}

// Pairs are stored as BTCUSDT (no slash) in DB; matching engine writes
// orderbook keys with that exact symbol. Normalize incoming "BTC/USDT" to
// "BTCUSDT" so REST/WS callers using either form hit the right ZSET.
function normalizeSymbol(s: string): string {
  return (s || "").replace("/", "").toUpperCase();
}

// Read aggregated depth for a symbol (top N levels)
export async function getDepth(symbol: string, levels = 20) {
  const r = getRedis();
  if (!r) return { bids: [], asks: [] };
  symbol = normalizeSymbol(symbol);
  const [buys, sells] = await Promise.all([
    r.zrange(`orderbook:${symbol}:buy`, 0, 200, "WITHSCORES"),
    r.zrange(`orderbook:${symbol}:sell`, 0, 200, "WITHSCORES"),
  ]);

  // Build order-key arrays for both sides first, then fetch all payloads in
  // two batched mget calls instead of one GET per entry (N+1 → 2 round-trips).
  const buyIds: Array<{ id: string; price: number }> = [];
  for (let i = 0; i < buys.length; i += 2) {
    buyIds.push({ id: buys[i], price: -Number(buys[i + 1]) });
  }
  const sellIds: Array<{ id: string; price: number }> = [];
  for (let i = 0; i < sells.length; i += 2) {
    sellIds.push({ id: sells[i], price: Number(sells[i + 1]) });
  }

  const [buyRaws, sellRaws] = await Promise.all([
    buyIds.length > 0
      ? r.mget(...buyIds.map(b => `orderbook:${symbol}:order:${b.id}`))
      : Promise.resolve([] as (string | null)[]),
    sellIds.length > 0
      ? r.mget(...sellIds.map(s => `orderbook:${symbol}:order:${s.id}`))
      : Promise.resolve([] as (string | null)[]),
  ]);

  const aggBids: Record<string, number> = {};
  for (let i = 0; i < buyIds.length; i++) {
    const raw = buyRaws[i];
    if (!raw) continue;
    const o = JSON.parse(raw);
    const rem = Number(o.qty) - Number(o.filledQty ?? 0);
    if (rem <= 0) continue;
    const k = buyIds[i].price.toString();
    aggBids[k] = (aggBids[k] ?? 0) + rem;
  }
  const aggAsks: Record<string, number> = {};
  for (let i = 0; i < sellIds.length; i++) {
    const raw = sellRaws[i];
    if (!raw) continue;
    const o = JSON.parse(raw);
    const rem = Number(o.qty) - Number(o.filledQty ?? 0);
    if (rem <= 0) continue;
    const k = sellIds[i].price.toString();
    aggAsks[k] = (aggAsks[k] ?? 0) + rem;
  }

  const bids = Object.entries(aggBids).map(([p, q]) => [Number(p), q] as [number, number]).sort((a, b) => b[0] - a[0]).slice(0, levels);
  const asks = Object.entries(aggAsks).map(([p, q]) => [Number(p), q] as [number, number]).sort((a, b) => a[0] - b[0]).slice(0, levels);
  return { bids, asks };
}

export async function getRecentTrades(symbol: string, limit = 50) {
  const r = getRedis();
  symbol = normalizeSymbol(symbol);

  // ── 1. Try Redis first (fastest path) ─────────────────────────────────
  if (r) {
    const raws = await r.lrange(`trades:${symbol}`, 0, limit - 1);
    const parsed = raws
      .map(s => { try { return JSON.parse(s); } catch { return null; } })
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }

  // ── 2. Redis empty / unavailable — fall back to DB (taker rows only) ──
  // This covers the server-restart case where the in-memory Redis list
  // hasn't been warm yet but the DB already holds historical fills.
  const [pair] = await db.select({ id: pairsTable.id })
    .from(pairsTable)
    .where(sql`upper(replace(${pairsTable.symbol}, '/', '')) = ${symbol}`)
    .limit(1);
  if (!pair) return [];

  const rows = await db.select({
    id: tradesTable.id,
    pairId: tradesTable.pairId,
    side: tradesTable.side,
    price: tradesTable.price,
    qty: tradesTable.qty,
    createdAt: tradesTable.createdAt,
  }).from(tradesTable)
    .where(and(eq(tradesTable.pairId, pair.id), eq(tradesTable.isTaker, 1)))
    .orderBy(desc(tradesTable.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // ── 3. Warm Redis from DB so next call is served from cache ────────────
  if (r) {
    try {
      // Push oldest-first so newest ends up at the head of the list
      const payloads = [...rows].reverse().map(row => JSON.stringify({
        id: row.id, pairId: row.pairId, side: row.side,
        price: Number(row.price), qty: Number(row.qty),
        ts: new Date(row.createdAt as any).getTime(),
      }));
      if (payloads.length > 0) {
        await r.lpush(`trades:${symbol}`, ...payloads);
        await r.ltrim(`trades:${symbol}`, 0, 199);
      }
    } catch { /* non-fatal */ }
  }

  return rows.map(row => ({
    id: row.id, pairId: row.pairId, side: row.side,
    price: Number(row.price), qty: Number(row.qty),
    ts: new Date(row.createdAt as any).getTime(),
  }));
}
