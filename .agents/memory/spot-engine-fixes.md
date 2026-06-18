---
name: Spot matching engine fixes
description: All gaps fixed in the spot matching engine and order placement flow
---

## What was done

### Schema changes
- `ordersTable`: added `stop_price` (numeric, nullable) — used by stop_limit/stop_market
- `pairsTable`: added `market_slippage_pct` (numeric, default 0.10) — configurable per-pair slippage cap replacing the old hardcoded 10%

### Matching engine (`matching-engine.ts`)
- `maxFills`: 200 → 500 (market orders now sweep up to 500 price levels in one placement)
- **Min-notional dust guard**: fills where `fillQty × price < 1e-6` are skipped — stops near-zero trade records from bloating the log
- **takerInBook flag**: now correctly set `true` for limit/post_only orders (already in Redis ZSET before tryMatch), `false` for market/IOC/FOK

### New order types (`orders.ts` + `stop-order-engine.ts`)
- **IOC** (Immediate-or-Cancel): places against the book immediately; any unfilled remainder is cancelled and refunded (same path as market order leftover)
- **FOK** (Fill-or-Kill): pre-checks Redis ZSET for sufficient liquidity before entering the engine; rejects (refund + cancel) if not enough; any post-match remainder cancelled
- **post_only**: checks `wouldCrossBook()` before Redis push; rejected if order would immediately match; only rests as maker
- **stop_limit / stop_market**: stored with `status=pending_trigger`; never pushed to Redis at placement; triggered by the stop-order engine

### Stop-order engine (`stop-order-engine.ts`)
- Polls DB every 2 s, leader-gated
- Trigger: sell-stop fires when `lastPrice <= stopPrice`; buy-stop fires when `lastPrice >= stopPrice`
- stop_limit: activates and pushes to Redis ZSET; calls tryMatch
- stop_market: recalculates slippage cap at trigger time, updates price, calls tryMatch
- Concurrent trigger safety: uses `WHERE status = 'pending_trigger'` in the UPDATE so only one instance triggers each order

### Other fixes
- **Market dust refund threshold**: `1e-12 → 1e-8` (more practical, avoids balance traps on sub-cent coins)
- **cancelSpotOrderById / adminCancelSpotOrderById**: now accepts `pending_trigger` status for cancellation
- **pushOrderToRedis**: `action=new` now also handles `post_only` type (previously only `limit`)

**Why:** Real exchange parity — traders expect IOC/FOK/Post-Only for algorithmic strategies; stop orders for risk management; correct takerInBook prevents Redis state race conditions.
