---
name: Wallet Ledger Audit
description: 8 bugs fixed in Wallet Ledger feature (Ledger.tsx + ledger.ts)
---

## Fixes applied

**LED-1** (ledger.ts): `summaryRows` — a full unfiltered `GROUP BY type` scan across all user ledger rows was run on every paginated request (inside the main `/ledger` handler). The result was included in the response as a `summary` field but never consumed by the frontend. Removed the query and the field entirely.

**LED-2** (ledger.ts): `coinId: r.coinId` was included in every entry in the `/ledger` and `/ledger/export` responses — exposing internal DB primary key to the client unnecessarily. Removed.

**LED-3** (Ledger.tsx `TYPE_META`): `trade_tds` type missing — any TDS ledger entry (created when TDS is deducted on sells) rendered with the raw DB enum string `"trade_tds"` as its label, no icon, no color. Added entry: `{ label: "TDS Deducted", icon: ShieldCheck, tone: "text-amber-400", credit: false }`.

**LED-4** (Ledger.tsx `FILTER_TYPES`): `trade_tds` not in the filter dropdown — users couldn't filter to see only TDS entries. Added.

**LED-5** (Ledger.tsx `summaryQ`): No `refetchInterval` on the summary query — Total Credited / Debited / AI Earnings cards went stale while the page was open. Added `staleTime: 20_000, refetchInterval: 30_000`.

**LED-6** (Ledger.tsx PDF): `catch` block used `console.error("PDF generation failed:", err)` — user saw nothing if PDF failed. Replaced with `toast.error(...)`.

**LED-7** (Ledger.tsx CSV): Same silent swallow in CSV catch block; plus `a.click()` without appending to `document.body` (Firefox compat bug). Fixed: `document.body.appendChild(a)` → `a.click()` → `document.body.removeChild(a)`. Added `toast.success("Ledger exported")` on success and `toast.error(...)` on failure.

**LED-8** (Ledger.tsx table): `ledgerQ.isError` was not handled — server errors produced a blank table with no message and no retry option. Added an error row with a `Retry` button that calls `ledgerQ.refetch()`.

## Key invariants
- The `/ledger/summary` endpoint is a separate dedicated endpoint for the dashboard cards — never mix it with the paginated `/ledger` response.
- `LedgerResponse` no longer includes `summary` or `coinId` — do not re-add them.
- Always import `toast` from `"sonner"` before using error/success feedback in async callbacks.
