# Zebvix — CryptoX Exchange Platform

A full-stack crypto exchange platform with an admin dashboard, user trading portal, and high-performance matching engine.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `PORT=23744 BASE_PATH=/admin/ pnpm --filter @workspace/admin run dev` — admin panel (proxied at `/admin/`)
- `PORT=23475 BASE_PATH=/user/ pnpm --filter @workspace/user-portal run dev` — user trading portal (proxied at `/user/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080)
- DB: PostgreSQL + Drizzle ORM (migrations in `lib/db/`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle for API server)
- Frontend: React 19, Vite 7, Tailwind CSS 4, Radix UI, React Query

## Where things live

- `artifacts/admin/src/pages/` — all admin panel pages (dashboard, users, KYC, coins, orders, etc.)
- `artifacts/user-portal/src/pages/` — user-facing exchange pages
- `artifacts/api-server/src/routes/` — all API route handlers (~60 route files)
- `artifacts/api-server/src/lib/` — core engines (matching, futures, bots, wallets, etc.)
- `lib/db/src/schema/` — Drizzle ORM schema (source of truth for DB)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod validation schemas

## Architecture decisions

- Contract-first: OpenAPI spec gates both backend validation (Zod schemas) and frontend data fetching (React Query hooks via Orval codegen)
- The in-memory matching engine (`artifacts/api-server/src/lib/inmem-engine/`) handles spot order matching with WAL-based recovery
- Futures matching is separate from spot (`futures-matching-engine.ts`, `futures-engine.ts`)
- DB migrations are tracked in `lib/db/migrations/` and `lib/db/drizzle/`
- Admin panel and user portal are separate Vite artifacts, both consuming the same API server

## Product

- **Admin Panel** (`/admin/`) — Full back-office: user management, KYC review, coin/pair config, order surveillance, wallet management, bots, earn products, P2P admin, announcements, and 50+ more pages
- **User Portal** (`/user/`) — Exchange frontend: spot trading, futures, P2P, earn, copy trading, portfolio analytics, wallet
- **API Server** (`/api`) — REST API + WebSocket server for all exchange operations

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`
- Run `pnpm run typecheck:libs` after changing any `lib/*` package before checking leaf artifacts
- The API server requires `DATABASE_URL` env var; without it, DB-dependent routes will fail on startup
- Admin routes use HMAC-signed API keys (see `artifacts/api-server/src/lib/api-key-crypto.ts`)
- Seed scripts live in `scripts/src/` — run them with `pnpm --filter @workspace/scripts run <script-name>`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Agent memory with detailed notes on specific subsystems: `.agents/memory/`
