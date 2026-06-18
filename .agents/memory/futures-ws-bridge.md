---
name: Futures WS Bridge Architecture
description: How Go futures orderbook updates reach the frontend via Node API WS (not a direct Go WS connection)
---

# Futures WS Bridge

## Rule
The frontend must NOT connect directly to the Go service WS (`/go-service/ws`).
Instead, the Node API server bridges Go's WS internally and relays updates to clients via the single `/api/ws/prices` market socket.

## How it works
1. `lib/futures-ws-bridge.ts` — singleton that connects to `ws://127.0.0.1:23004/ws` (Go's local port, NOT through the shared proxy)
2. Subscribes to `futures.orderbook:{pairId}` for all futures-enabled pairs (loaded from DB, cached)
3. Translates pairId → symbol via `pairCache` (Map<number, string>)
4. Calls `onFuturesOrderbook(symbol, data)` listeners → each WS client checks `subs.futuresOBSymbols` and `safeSend`s

## Subscription flow
- Frontend: `marketSocket.subscribe({ type: "futures.orderbook", symbol: "BTC/USDT" }, cb)`
- Wire message: `{ action: "SUBSCRIBE", payload: { type: "futures.orderbook", symbol: "BTC/USDT" } }`
- Node WS handler: adds symbol to `subs.futuresOBSymbols`
- Bridge relay: `{ stream: "futures.orderbook:BTC/USDT", data: { bids, asks } }`
- `marketSocket` handleMessage: `stream.startsWith("futures.orderbook:")` → `normalizeOrderbook` → notify

## Why
- Avoids 2 WS connections in the browser (one to Node API, one to Go)
- Go engine stays (best for high-throughput matching), only WS fanout moves to Node
- Consistent with how spot orderbook works (Node WS → Redis → clients)

## Key files
- `artifacts/api-server/src/lib/futures-ws-bridge.ts` — the bridge singleton
- `artifacts/api-server/src/index.ts` — registers per-connection bridge listener, `futures.orderbook` SUBSCRIBE handler
- `artifacts/user-portal/src/lib/marketSocket.ts` — `futures.orderbook` subscription type + stream handler
- `artifacts/user-portal/src/lib/futuresSocket.ts` — `useFuturesOrderbook(symbol, snapshot)` uses marketSocket
- `artifacts/user-portal/src/pages/Futures.tsx` — passes `symbol` (e.g. "BTC/USDT") to `useFuturesOrderbook`

## Go WS internal URL
`ws://127.0.0.1:23004/ws` — Go registers `/ws` at its own port (not just under `/go-service/ws`).
Port comes from `process.env.GO_SERVICE_PORT ?? "23004"`.
