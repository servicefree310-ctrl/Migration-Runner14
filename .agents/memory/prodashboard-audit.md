---
name: ProDashboard Audit
description: 4 bugs found and fixed in artifacts/user-portal/src/pages/ProDashboard.tsx
---

## Fixes applied

**NAV-1**: `window.location.href = "/user/orders"` used for Open Orders card click — wrong path (`/user/orders` causes a 404 in the SPA) and a full page reload. Fixed: added `useLocation` from wouter, use `navigate("/orders")`.

**DASH-1**: `coins` useMemo filter was `.endsWith("/USDT")` — INR pairs completely invisible in Top Movers and Top Markets. Fixed: filter changed to `/\/(USDT|INR)$/`. Added `pairSymbol` and `quoteCcy` fields to `Coin` type.

**DASH-2**: Movers/markets trade links hardcoded `c.symbol + "/USDT"` — a BTC/INR mover would send user to BTC/USDT. Fixed: links now use `c.pairSymbol` (the actual pair string from the market API).

**DASH-3**: `MIN_LIQUID_VOL` was a single `5_000` constant compared against INR volumes (which are ~80x USD). Fixed: converted to a per-currency record `{ USDT: 5_000, INR: 400_000 }`.

**DASH-4**: Alert target prices labeled "USDT" even for INR-pair alerts. Fixed: label now reads `a.quoteCurrency ?? a.quoteCcy ?? a.pair?.split("/")?.[1] ?? ""` — graceful fallback.

**FUT-TS**: TypeScript TS2367 — after early return guard for `trailing_stop`, TypeScript narrowed `type` to `"limit"|"market"`, making downstream comparisons to `"trailing_stop"` dead code. Removed those dead branches from the `orderMutation.mutate` call.

## Key invariants
- Wouter `Link` and `useLocation().navigate` both use paths relative to the router's base (e.g. `/orders`, not `/user/orders`).
- `/finance/currency` returns `{ currency: "BTC", name: "Bitcoin", icon: "..." }` — use `c.currency` as the map key for `coinMeta`.
- Market symbols are full pair strings like "BTC/USDT" or "BTC/INR". Always parse `symbol.split("/")` to get base + quote separately.
