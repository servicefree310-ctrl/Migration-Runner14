---
name: API v1 HMAC system
description: HMAC API key auth — CSRF bypass requirement and permission model for /api/v1/ endpoints.
---

## CSRF bypass rule

The `originGuard` middleware in `artifacts/api-server/src/app.ts` blocks POST/PUT/DELETE/PATCH that lack Origin/Referer headers. HMAC-signed API key requests must bypass this check — add early-return when both `X-ZBX-APIKEY` **and** `X-ZBX-SIGN` headers are present. Without this, write endpoints return 403 "Missing Origin/Referer" before ever reaching the route handler.

**Why:** HMAC signature is itself CSRF protection — a cross-site attacker cannot forge the correct signature without the secret.

**How to apply:** The bypass is already in place in `originGuard()` in app.ts. If CSRF middleware is ever refactored, preserve this bypass.

## Permission model

9 permissions: `read`, `spot_trade`, `futures_trade`, `withdraw`, `transfer`, `ai_plan`, `invest`, `referral`, `trade` (legacy alias for both spot+futures).

- `read` is always on (forced in UI, required by all authenticated endpoints).
- `withdraw` requires 2FA at key creation time (enforced in account-api-keys.ts).
- `hasTradePerm(perms, "spot"|"futures")` helper in v1.ts checks both the specific perm and legacy `trade` alias.

## Endpoint map (`/api/v1/`)

| Perm | Endpoints |
|------|-----------|
| (public) | GET /system/time |
| read | GET /account/me, /balances, /deposit-address, /orders, /trades, /futures/positions, /futures/orders, /transfers |
| spot_trade | POST /account/order, DELETE /account/order/:id |
| futures_trade | DELETE /account/futures/order/:id |
| transfer | POST /account/transfer |
| ai_plan | GET /account/ai-plans, /ai-subscriptions; DELETE /account/ai-subscriptions/:id |
| invest | GET /account/auto-invest |
| referral | GET /account/referral |
