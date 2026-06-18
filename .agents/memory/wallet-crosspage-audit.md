---
name: Wallet + cross-page audit findings
description: 17 bugs fixed across Wallet.tsx and 9 other files — clipboard, raw fetch, Firefox download, INR rate, initial state.
---

## Wallet.tsx (WAL-1 to WAL-6)
- WAL-1: `Math.max(activeNet.fee, activeNet.fee)` tautology → `activeNet.fee`
- WAL-2: QR code download `a.click()` without DOM attachment (Firefox silent failure) → `appendChild/click/removeChild`
- WAL-3: `serverInrRate ?? 83` fallback inconsistent with site-wide `84` → changed to `84`
- WAL-4: `copy()` using `navigator.clipboard.writeText` without `await`/`.catch` → async + `toast.error` on failure
- WAL-5: `delMut` using raw `fetch()` with manual headers instead of `del()` api helper → `del()`
- WAL-6: `WithdrawDialog` initial `network` state hardcoded `"TRC20"` → `""` (avoids wrong default when user has no TRC20 address)

## Cross-page clipboard bugs (pattern: missing .catch on clipboard writes)
- INRPayments.tsx: `copyField` not awaiting clipboard → async + `toast.error`
- Profile.tsx: `copyRef` missing `.catch()` → added `.catch(() => toast.error(...))`
- Referrals.tsx: `copyText` missing `.catch()` → added `.catch(() => toast.error(...))`
- SupportChatWidget.tsx: `copyMsg` missing `.catch()` → added `.catch(() => toast.error(...))` + `import { toast } from "sonner"`
- KoinXTab.tsx: `CopyButton.handle` not awaiting clipboard at all → full async/try-catch pattern

## Cross-page raw fetch bugs (pattern: raw fetch() instead of api helper)
- PriceAlerts.tsx: `disableMut` raw fetch PATCH → `patch()` helper
- Support.tsx: `closeTicket` raw fetch PATCH → `patch()` helper
- SupportTickets.tsx: `closeMut` raw fetch PATCH → `patch()` helper
- P2P.tsx: rating submit raw fetch POST → `post()` helper

## What was clean (no bugs found)
- Trade.tsx, Futures.tsx, Orders.tsx, CopyTrading.tsx, AITrading.tsx, Bots.tsx, Notifications.tsx, Convert.tsx, Earn.tsx, Banks.tsx, Settings.tsx, Kyc.tsx
- P2P.tsx MerchantStats useEffect fetch: uses `.catch(() => setErr(true))` — intentional, correct

**Why:** `navigator.clipboard.writeText` rejects in non-secure contexts and Firefox extensions — always needs `.catch()`. Raw `fetch()` bypasses `api.ts` error normalization (ApiError, 401 redirect) — always use api helpers.
