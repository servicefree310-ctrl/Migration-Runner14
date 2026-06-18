---
name: Spot + Futures Deep Audit
description: 10 bugs found and fixed in the exchange engine (matching-engine.ts, orders.ts, Trade.tsx, Futures.tsx)
---

## Fixes applied

**SPOT-1** (Trade.tsx): `type === "stop" ? "limit" : type` → just `type`. Server (`bicrypto.ts:2419`) already maps stop → stop_limit.

**SPOT-2** (matching-engine.ts): Self-trade refund used `opts?.takerVipTier ?? 0`. Fixed to query actual vipTier from DB inside the tx: `tx.select({vipTier}).from(usersTable).where(eq(id, maker.userId))`.

**SPOT-3** (orders.ts `placeBracketOrder`): Hardcoded `getSpotFeeRates(0)` — added `vipTier?: number` to opts and passed through from both call sites in `placeSpotOrder`.

**SPOT-4** (orders.ts IOC path): IOC partial fills wrote status `"partial"` — fixed to `"partial_cancelled"` (correct terminal status for IOC partial).

**SPOT-5** (orders.ts `/orders` merged endpoint): Futures orders in merged list had no status filter, so closed futures orders appeared in the "Open Orders" panel. Added uppercase status mapping (OPEN/PARTIAL → open, FILLED → filled, CANCELLED/REJECTED → cancelled).

**SPOT-6** (orders.ts `/orders/:id/fills`): `db.select().from(coinsTable)` fetched ALL coins. Fixed to `WHERE id IN (baseCoinId, quoteCoinId)` using already-imported `inArray`.

**FUT-1** (Futures.tsx `handleOrder`): `trailing_stop` type silently submitted to server (unimplemented). Added early return with `toast.error("Trailing stop coming soon")`.

**FUT-2** (Futures.tsx `closeLimitMutation`): On success only invalidated `["futures"]` queries. Added `qc.invalidateQueries({ queryKey: ["wallet"] })` so balance refreshes after a limit-close.

**FUT-3** (Futures.tsx `historyRows`): History endpoint returns all orders (no status param sent). Client-side filter added: exclude rows where `status ∈ ["OPEN","PARTIAL"]`.

**UI-1** (Trade.tsx): Fee estimate used hardcoded `FEE_TAKER=0.001`/`FEE_MAKER=0.0008`. Added `useQuery` for `/fees/my` (enabled when logged in); uses `currentTier.spotTaker/100` and `currentTier.spotMaker/100` as rates. Falls back to `FEE_TAKER_DEFAULT`/`FEE_MAKER_DEFAULT` when guest.

## Key invariants
- Futures order statuses are UPPERCASE (OPEN, PARTIAL, FILLED, CANCELLED, REJECTED). Spot uses lowercase.
- `getSpotFeeRates(vipTier)` returns GST-inclusive rates as fractions. VIP tier's `spotTaker`/`spotMaker` fields are percentages (0.1 = 0.1%), so divide by 100 to get decimal.
- `/fees/my` response: `{ currentTier: { spotTaker, spotMaker, ... }, ... }` — tier fields are pre-GST percentages.
