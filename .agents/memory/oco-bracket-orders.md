---
name: OCO Bracket Orders (SL/TP)
description: Design decisions and gotchas for the Stop-Loss + Take-Profit OCO bracket implementation on spot orders.
---

## Rule
After a spot order fills, bracket legs (SL stop_market + PL limit) are placed sharing an `ocoGroupId`. When either leg fills or triggers, `cancelOcoPartners()` kills the other and refunds its lock.

**Why:** Standard exchange bracket/OCO behaviour prevents double-exits. noLock=1 SL orders skip wallet lock at placement because the PL leg already holds the base balance.

## How to apply
- `ocoGroupId` (text) and `noLock` (integer, default 0) are columns on `ordersTable`; always rebuild lib declarations after schema changes (`pnpm run typecheck:libs`).
- `cancelOcoPartners(ocoGroupId, exceptOrderId)` lives in `artifacts/api-server/src/lib/oco.ts`. It does NOT import from orders.ts or matching-engine.ts (no circular deps).
- Matching engine (`matching-engine.ts`): collect `{ id, ocoGroupId }` for fully-filled makers AND takers into `finishedWithOco[]`, then fire `cancelOcoPartners` after the match loop.
- Stop-order engine (`stop-order-engine.ts`): when `noLock=1` SL triggers → cancel PL partner first → lock base from newly-freed balance → then tryMatch.
- Trade.tsx: SL/PL UI is hidden in Simple mode, shown only in Advanced. OCO badge appears when both prices are set.
- `ensureWallet` is private to both orders.ts and matching-engine.ts; oco.ts has its own inline version `ensureWalletTx`.
