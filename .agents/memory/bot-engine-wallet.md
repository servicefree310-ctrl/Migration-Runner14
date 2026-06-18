---
name: Bot engine wallet fix
description: User trading bot (Grid/DCA) trades now atomically debit/credit real spot wallets and write ledger entries; balance check added on bot START.
---

## Root cause
`bot-engine.ts` comment said "wallet is adjusted via bot_trades accounting" but the code never actually touched `walletsTable`. `runGridTick` and `runDcaTick` only inserted `bot_trades` rows — no debit/credit happened.

## Fix applied

### bot-engine.ts
- Added `applyBotWalletOps(userId, baseSymbol, quoteSymbol, side, qty, priceQuote, note)` helper:
  - Opens a DB transaction
  - BUY: FOR UPDATE locks quote wallet, checks `balance - locked >= notionalQuote` (where `notionalQuote = qty * priceQuote`), debits quote, credits base, writes two `walletLedgerTable` entries (`trade_buy` type)
  - SELL: FOR UPDATE locks base wallet, checks `balance - locked >= qty`, debits base, credits quote, writes two ledger entries (`trade_sell` type)
  - Returns `false` (logs warning) on `insufficient_balance`; rethrows other errors
- Added coin ID cache (`coinIdCache: Map<string, number>`) to avoid repeated DB lookups per tick
- Both `runGridTick` (BUY and SELL branches) and `runDcaTick` (BUY) call `applyBotWalletOps` BEFORE inserting `bot_trades` — if wallet op fails, trade is skipped entirely (no orphan trade record)

### bots.ts — `POST /bots/:id/start`
- Added `requiredQuoteAmount(bot)` helper that converts `totalAmountUsd` (GRID) / `totalCapUsd` (DCA) to the bot's quote currency using live price (`getRawTick`)
- Before setting `status = "running"`, checks user's quote wallet balance >= required amount
- Returns HTTP 402 with clear message: "Need X USDT, have Y USDT available" if insufficient

**Why:** Without this fix, every bot trade silently passed (no wallet change) while the UI showed accumulated PnL with no real balance impact — misleading and financially incorrect.

**How to apply:** Any future bot strategy (e.g. scalping, momentum) must call `applyBotWalletOps` before recording a `bot_trade` row.
