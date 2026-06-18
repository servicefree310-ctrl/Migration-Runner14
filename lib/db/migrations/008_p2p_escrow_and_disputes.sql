-- P2P Trading: full schema bootstrap.
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- so this migration is safe to re-apply on environments where some of the
-- tables were already created via `drizzle push` during development.

-- Per-wallet P2P escrow pocket (kept separate from wallets.locked which
-- is shared with futures margin and withdrawal holds).
ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS p2p_locked NUMERIC(28, 8) NOT NULL DEFAULT 0;

-- Per-user payment rails the merchant exposes on offers (UPI/IMPS/etc).
CREATE TABLE IF NOT EXISTS p2p_payment_methods (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL,
  method        TEXT NOT NULL,
  label         TEXT NOT NULL,
  account       TEXT NOT NULL,
  ifsc          TEXT,
  holder_name   TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p2p_pm_user_idx ON p2p_payment_methods (user_id);

-- Merchant ads (offers).
CREATE TABLE IF NOT EXISTS p2p_offers (
  id              SERIAL PRIMARY KEY,
  uid             VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id         INTEGER NOT NULL,
  side            TEXT NOT NULL,
  coin_id         INTEGER NOT NULL,
  fiat            TEXT NOT NULL DEFAULT 'INR',
  price           NUMERIC(28, 8) NOT NULL,
  total_qty       NUMERIC(28, 8) NOT NULL,
  available_qty   NUMERIC(28, 8) NOT NULL,
  min_fiat        NUMERIC(28, 2) NOT NULL,
  max_fiat        NUMERIC(28, 2) NOT NULL,
  payment_methods TEXT NOT NULL,
  pay_window_mins INTEGER NOT NULL DEFAULT 15,
  terms           TEXT,
  status          TEXT NOT NULL DEFAULT 'online',
  min_kyc_level   INTEGER NOT NULL DEFAULT 1,
  min_trades      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p2p_offer_user_idx       ON p2p_offers (user_id);
CREATE INDEX IF NOT EXISTS p2p_offer_coin_side_idx  ON p2p_offers (coin_id, side, status);

-- Active deals opened against an offer.
CREATE TABLE IF NOT EXISTS p2p_orders (
  id                     SERIAL PRIMARY KEY,
  uid                    VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  offer_id               INTEGER NOT NULL,
  buyer_id               INTEGER NOT NULL,
  seller_id              INTEGER NOT NULL,
  coin_id                INTEGER NOT NULL,
  fiat                   TEXT NOT NULL DEFAULT 'INR',
  price                  NUMERIC(28, 8) NOT NULL,
  qty                    NUMERIC(28, 8) NOT NULL,
  fiat_amount            NUMERIC(28, 2) NOT NULL,
  payment_method         TEXT NOT NULL,
  payment_account        TEXT NOT NULL,
  payment_label          TEXT NOT NULL,
  payment_ifsc           TEXT,
  payment_holder_name    TEXT,
  payment_utr            TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending',
  paid_at                TIMESTAMPTZ,
  released_at            TIMESTAMPTZ,
  cancelled_at           TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ NOT NULL,
  dispute_opened_by      INTEGER,
  dispute_reason         TEXT,
  dispute_opened_at      TIMESTAMPTZ,
  dispute_resolution     TEXT,
  dispute_resolved_by    INTEGER,
  dispute_resolved_at    TIMESTAMPTZ,
  dispute_notes          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p2p_order_buyer_idx  ON p2p_orders (buyer_id, status);
CREATE INDEX IF NOT EXISTS p2p_order_seller_idx ON p2p_orders (seller_id, status);
CREATE INDEX IF NOT EXISTS p2p_order_offer_idx  ON p2p_orders (offer_id);
CREATE INDEX IF NOT EXISTS p2p_order_status_idx ON p2p_orders (status);

-- Inline chat between buyer/seller (and admin during disputes).
CREATE TABLE IF NOT EXISTS p2p_messages (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL,
  sender_id    INTEGER NOT NULL,
  sender_role  TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p2p_msg_order_idx ON p2p_messages (order_id, created_at);

-- Dedicated dispute table (1-to-1 with p2p_orders).
CREATE TABLE IF NOT EXISTS p2p_disputes (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER NOT NULL UNIQUE,
  opened_by       INTEGER NOT NULL,
  buyer_id        INTEGER NOT NULL,
  seller_id       INTEGER NOT NULL,
  reason          TEXT NOT NULL,
  evidence_url    TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  resolution      TEXT,
  resolved_by     INTEGER,
  resolved_at     TIMESTAMPTZ,
  notes           TEXT,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p2p_dispute_status_idx ON p2p_disputes (status, opened_at);
CREATE INDEX IF NOT EXISTS p2p_dispute_buyer_idx  ON p2p_disputes (buyer_id);
CREATE INDEX IF NOT EXISTS p2p_dispute_seller_idx ON p2p_disputes (seller_id);

-- ─── Backfill p2p_locked from in-flight P2P orders ──────────────────────
-- Sum the qty of every still-open order per (seller_id, coin_id) and
-- carve that out of the seller's existing `wallets.locked` into the new
-- p2p_locked pocket. This preserves ledger invariants for any orders
-- that were opened against the previous shared-locked code path.
WITH inflight AS (
  SELECT seller_id, coin_id, SUM(qty)::NUMERIC(28, 8) AS qty
  FROM p2p_orders
  WHERE status IN ('pending', 'paid', 'disputed')
  GROUP BY seller_id, coin_id
)
UPDATE wallets w
SET p2p_locked = w.p2p_locked + inflight.qty,
    locked     = GREATEST(w.locked - inflight.qty, 0::NUMERIC(28, 8)),
    updated_at = NOW()
FROM inflight
WHERE w.user_id = inflight.seller_id
  AND w.coin_id = inflight.coin_id
  AND w.wallet_type = 'spot'
  AND w.p2p_locked = 0;  -- only first-time backfill; safe to re-run.

-- ─── Backfill p2p_disputes from any existing disputed orders ────────────
INSERT INTO p2p_disputes (
  order_id, opened_by, buyer_id, seller_id, reason, status,
  resolution, resolved_by, resolved_at, notes, opened_at, updated_at
)
SELECT
  o.id, COALESCE(o.dispute_opened_by, o.buyer_id),
  o.buyer_id, o.seller_id,
  COALESCE(o.dispute_reason, 'legacy dispute'),
  CASE WHEN o.dispute_resolution IS NOT NULL THEN 'resolved'
       WHEN o.status = 'disputed' THEN 'open'
       ELSE 'resolved' END,
  o.dispute_resolution,
  o.dispute_resolved_by,
  o.dispute_resolved_at,
  o.dispute_notes,
  COALESCE(o.dispute_opened_at, o.created_at),
  o.updated_at
FROM p2p_orders o
WHERE (o.dispute_opened_at IS NOT NULL OR o.status = 'disputed')
ON CONFLICT (order_id) DO NOTHING;
