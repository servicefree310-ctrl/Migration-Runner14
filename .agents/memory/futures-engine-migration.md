---
name: Futures Redis engine
description: Go futures matching engine replaced by Redis sorted-set engine in api-server; architectural decisions and key file list.
---

# Futures Matching Engine — Go → Redis Migration

## Rule
The Go futures matching engine (`artifacts/go-service`) has been retired. All futures order matching now runs inside the api-server via a Redis sorted-set engine.

**Why:** Simplified ops (one process instead of two), no inter-service RPC, same Redis already used for spot and cache.

## Key files
- `artifacts/api-server/src/lib/futures-matching-engine.ts` — Redis engine (futurePlaceOrder, futuresCancelOrder, futuresSeedOrderbook, futuresGetOrderbook, getFuturesEngineStats)
- `artifacts/api-server/src/lib/futures-ws-bridge.ts` — Redis pub/sub bridge (psubscribe `futures.orderbook:*`), replaces Go WS connection
- `artifacts/api-server/src/routes/futures.ts` — all order endpoints use futures-matching-engine directly
- `artifacts/api-server/src/lib/futures-bot-service.ts` — bot synthetic liquidity uses futures-matching-engine directly
- `artifacts/api-server/src/routes/admin-system.ts` — system health reports `futuresEngine` (not `goService`)

## Redis key schema
- `fut:ob:{pairId}:buy` — sorted set, score = -price (so ZRANGE returns highest bid first)
- `fut:ob:{pairId}:sell` — sorted set, score = +price (lowest ask first)
- `fut:ob:{pairId}:ord:{id}` — JSON BookOrder, TTL 24 h
- Depth pub/sub channel: `futures.orderbook:{pairId}`

## Go service artifact
`artifacts/go-service/.replit-artifact/artifact.toml` has no `[[services]]` block — workflow is retired. Directory kept for reference.

**How to apply:** Never add goRpc calls or GO_BASE/GO_INTERNAL_SECRET env checks back into the codebase. If futures engine needs scaling, extend futures-matching-engine.ts.
