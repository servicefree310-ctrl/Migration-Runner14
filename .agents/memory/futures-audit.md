---
name: Futures engine audit
description: Full audit of futures matching, PnL, margin, liquidation, fee, position lifecycle — June 2026
---

## Bugs found and fixed

### CRITICAL: closeSLTP destroyed user margin (futures-engine.ts)
**Bug:** When stop-loss or take-profit triggered, wallet update was:
  `locked -= margin`, `balance += net` (where net = pnl - fee)
The margin principal was silently destroyed — users lost their collateral on SL/TP.

**Fix:** `balance += margin + net` — margin is returned first, then net PnL is applied.

**Why:** margin lives in `locked` (not balance). Releasing it means moving it to `balance`. The normal close path (via applyFills → releaseMargin + applyPnl) does this correctly in two steps; closeSLTP was missing the margin-return step.

### Taker positionId never set in applyFills (futures.ts)
**Bug:** Logic `match.trades[last] ? undefined : taker.positionId` was backwards — when trades exist (the only case applyFills runs), positionId was set to `null`. The invoice lookup and order→position linkage was broken.

**Fix:** `lastTakerPosId ?? taker.positionId ?? undefined` — uses the last-touched position ID accumulated during the fill loop.

### closeSLTP missing ledger entry (futures-engine.ts)
**Fix:** Added `walletLedgerTable` insert after wallet update, same as the applyPnl path does for normal closes.

## Verified correct
- Matching engine: per-pair async mutex, MAX_FILLS=500, taker-price-improvement, self-trade prevention (except bot↔bot), stale ZSET cleanup.
- applyFills: margin accounting (pre-lock release → re-lock actual position margin → release closed margin → applyPnl).
- Liquidation: equity ≤ maintMargin trigger, remaining=max(0,equity-mm) always 0 (isolated margin fully taken) — by design.
- Funding settlement: atomic claim ("processing" state), deduct from balance first then from marginAmount if insufficient, idempotent via unique (fundingRateId, positionId) constraint.
- Force-close path (no counterparty): correct — market orders not added to Redis book, so no cleanup needed.
- SL/TP direction: long triggers SL when mark≤stopLoss, TP when mark≥takeProfit; short inverted. Correct.
