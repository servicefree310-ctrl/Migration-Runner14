---
name: Trading Bots Audit
description: 8 bugs fixed in Trading Bots feature (Bots.tsx, bots.ts, bot-engine.ts)
---

## Fixes applied

**BOT-1** (Bots.tsx): SuccessModal received `res?.id` but API returns `{ bot: row }` — `id` was always `undefined`. Fixed: use `res?.bot?.id`.

**BOT-2** (Bots.tsx): Start (▶) button only rendered for `status === "stopped"`. Paused bots showed no action button — users were permanently stuck unless they deleted the bot. Fixed: condition changed to `bot.status === "stopped" || bot.status === "paused"`.

**BOT-3** (Bots.tsx): `startMut` and `stopMut` had no `onError` handler. Network errors or server 4xx/5xx responses were silently swallowed. Fixed: added `onError: (e) => toast.error(...)` to both.

**BOT-4** (Bots.tsx): Trade detail dialog showed price and notional hardcoded as "USDT". For INR-quoted bots (BTC/INR etc) this was wrong. Fixed: use `bot?.quoteSymbol ?? "USDT"` as the currency label. (PnL in the last column intentionally stays USDT since stored values are always in USD after BOT-5/6 fix.)

**BOT-5** (bot-engine.ts): `qty = perGridUsd(USD) / price(INR)` for INR pairs — dividing USD by an INR price gave wildly wrong base quantities (e.g. 100 USD / 7,000,000 INR = 0.0000143 BTC instead of ~0.001 BTC). Fixed: introduced `getLivePriceUsd()` (always returns USDT price) and `getLivePriceQuote()` (returns price in bot's quote currency). Qty/notional always use USD price; trigger comparisons use quote-currency price.

**BOT-6** (bot-engine.ts): `pnlUsd`, `realizedPnlUsd`, and `unrealizedPnlUsd` were computed in quote currency (INR for INR pairs) but stored in USD-named columns. For INR pairs this meant displayed PnL was ~84× too high. Fixed: all PnL computations use USD prices so stored values are always in USD.

**BOT-7** (bot-engine.ts): `totalTrades` and `successfulTrades` incremented from stale in-memory bot object read at tick start — concurrent ticks (e.g. after server restart) could produce duplicate increments from the same baseline, losing counts. Fixed: use Drizzle `sql` template literals for atomic DB-side increments (`sql\`field + 1\``).

**BOT-8** (bots.ts /start endpoint): Start handler called `db.update(...)` unconditionally — double-clicking Start overwrote `startedAt` with the second click's timestamp, erasing the original start time. Fixed: fetch bot first; if `status === "running"`, return current row idempotently without any update.

## Key invariants
- Bot engine: ALWAYS use `getLivePriceUsd(base)` for qty/notional/PnL stored in DB; use `getLivePriceQuote(base, quoteSymbol)` only for trigger conditions (range check, floor/ceil).
- All `botTrades` notional and all `tradingBots` PnL columns store values in USD, not in the pair's quote currency.
- SQL-side increments (`sql\`col + 1\``) are required for any counter that multiple concurrent ticks might touch.
