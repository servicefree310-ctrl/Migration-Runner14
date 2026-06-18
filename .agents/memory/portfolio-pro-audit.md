---
name: Portfolio PRO Audit
description: 7 bugs fixed in Portfolio PRO page (PortfolioPro.tsx + portfolio-analytics.ts)
---

## Fixes applied

**CHART-1**: `EquityChart` returned a blank `<div>` when `points.length === 0`. Fixed: overlay `EmptyState` component when no data; chart div stays in DOM (safe for hooks) but set to `opacity-0 pointer-events-none`.

**CHART-2**: History query had no `refetchInterval` — equity curve went stale while page was open. Fixed: added `staleTime: 30_000, refetchInterval: 60_000`. Summary already had 30s refetch; history now matches.

**CHART-3**: `timeScale: { timeVisible: false }` hid x-axis dates on the equity chart. Fixed: set to `true` so users can see dates.

**TAX-1** (portfolio-analytics.ts): TDS for sell trades was always recalculated as `notionalUsd * 0.01` using the CURRENT INR rate, discarding the historically-accurate TDS stored in `tradesTable.tds` (charged at the rate active at trade time). Fixed: use `t.tds` (converted from quote currency) when non-null; fall back to 1%-recalculation for null (pre-TDS trades).

**TAX-2** (portfolio-analytics.ts): FY start date `new Date(req.query.from)` parsed the date string in LOCAL timezone — in IST (UTC+5:30) `"2025-04-01"` resolves to March 31 at 18:30 UTC, excluding April 1 trades entirely. Fixed: append `T00:00:00Z` to force UTC midnight. Also fixed the default FY computation to use `getUTCMonth()` / `getUTCFullYear()`.

**CSV-1**: `a.click()` called on a detached anchor element — downloads work in Chrome but silently fail in Firefox. Fixed: `document.body.appendChild(a)` → `a.click()` → `document.body.removeChild(a)`.

**DEAD-1**: `const inrRate = summary?.inrRate ?? 84` in the outer `PortfolioPro` component — variable was never used there (TaxReportPanel has its own local `rate`). Removed.

## Key invariants
- Always use UTC methods (`getUTCMonth`, `getUTCFullYear`, append `T00:00:00Z`) when parsing or constructing date strings from query params — IST is UTC+5:30, so local parsing always shifts dates backwards.
- `tradesTable.tds` stores TDS in QUOTE currency (same unit as `tradesTable.fee`). Convert with `/ inrRate` for INR pairs, use directly for USDT pairs.
- For CSV downloads, always append the anchor to `document.body` before `.click()` and remove after — required for Firefox compatibility.
