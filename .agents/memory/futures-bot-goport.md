---
name: Futures Bot & Go Port Bug
description: Critical bug where GO_BASE defaulted to wrong port; futures bot created for synthetic liquidity on all futures pairs.
---

## The Go Port Bug

`routes/futures.ts` had `GO_BASE = process.env.GO_SERVICE_URL || "http://127.0.0.1:8090"` but Go runs on port **23004** (set via `PORT=23004` in the workflow). Port 8090 is not listening. This silently broke:
- All `goRpc` calls from HTTP order placement routes (limit orders saved in DB but never sent to Go engine)
- The `restoreBooksOnBoot` seed on startup
- The orderbook snapshot endpoint

**Fix:** Changed default from 8090 → 23004 in `routes/futures.ts` line 74.

**Why:** Go service reads `PORT` env var for its HTTP server. The workflow sets `PORT=23004`. `GO_SERVICE_URL` is never set in dev, so the fallback was the only operative value.

**How to apply:** If Go service ever changes port, set `GO_SERVICE_URL=http://127.0.0.1:<port>` in the environment rather than editing the fallback.

## Futures Bot Service

`lib/futures-bot-service.ts` — leader-gated market maker for futures pairs.

- Runs every 8s, ticks all bots with `futures_enabled=true AND enabled=true`
- Uses lowest-id admin/superadmin as bot user (same pattern as spot `bot-service.ts`)
- Places limit orders directly into `futuresOrdersTable` with `isBot=1, marginLocked=0`
- Registers each order with Go engine via `goRpc("/internal/futures/place", {...})`
- Cancels stale (>60s) and wrong-side (price crossed mid) orders each tick
- `applyFillToPosition` in `routes/futures.ts` already skips wallet ops for `isBot=1` orders

## Bot Config

Market bot rows with `futures_enabled=true` drive futures bot behaviour (same rows as spot bots — one row per pair, reuses `order_size`, `spread_bps`, `price_step_bps`, `levels`, `max_order_age_sec`).

## INTERNAL_SECRET

`INTERNAL_SECRET` IS set in the Node environment (from Replit secrets). The Go engine requires it as `X-Internal-Secret` header on `/internal/*` routes. Direct curl to Go without the header returns 401.
