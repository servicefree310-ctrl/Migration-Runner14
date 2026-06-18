-- Phase 6: CMS tables — admin-managed announcements, news, competitions, broadcast notifications.
-- Site-wide config (brand, footer, features, banner_strip, maintenance) is stored in app_settings as JSON values
-- under namespaced keys (site.brand, site.footer, site.features, site.banner_strip, site.maintenance) — no new
-- table needed for that. Banners + promotions tables already exist (home_banners, home_promotions).
-- Apply: psql "$DATABASE_URL" -f lib/db/migrations/004_cms.sql

CREATE TABLE IF NOT EXISTS announcements (
  id            SERIAL PRIMARY KEY,
  title         TEXT        NOT NULL,
  body          TEXT        NOT NULL DEFAULT '',
  category      TEXT        NOT NULL DEFAULT 'product',  -- product|security|maintenance|promotion|listing
  cta_label     TEXT        NOT NULL DEFAULT '',
  cta_url       TEXT        NOT NULL DEFAULT '',
  is_pinned     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_published  BOOLEAN     NOT NULL DEFAULT TRUE,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  position      INTEGER     NOT NULL DEFAULT 0,
  updated_by    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS announcements_published_idx ON announcements (is_published, is_pinned, published_at DESC);

CREATE TABLE IF NOT EXISTS news_items (
  id              SERIAL PRIMARY KEY,
  slug            TEXT        NOT NULL UNIQUE,
  title           TEXT        NOT NULL,
  excerpt         TEXT        NOT NULL DEFAULT '',
  body            TEXT        NOT NULL DEFAULT '',
  category        TEXT        NOT NULL DEFAULT 'market',  -- market|product|insight|tutorial|press
  cover_image_url TEXT        NOT NULL DEFAULT '',
  source          TEXT        NOT NULL DEFAULT 'Zebvix',
  source_url      TEXT        NOT NULL DEFAULT '',
  published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_published    BOOLEAN     NOT NULL DEFAULT TRUE,
  is_featured     BOOLEAN     NOT NULL DEFAULT FALSE,
  position        INTEGER     NOT NULL DEFAULT 0,
  updated_by      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS news_items_published_idx ON news_items (is_published, is_featured DESC, published_at DESC);

CREATE TABLE IF NOT EXISTS competitions (
  id                 SERIAL PRIMARY KEY,
  title              TEXT        NOT NULL,
  subtitle           TEXT        NOT NULL DEFAULT '',
  description        TEXT        NOT NULL DEFAULT '',
  prize_pool         TEXT        NOT NULL DEFAULT '0',
  prize_unit         TEXT        NOT NULL DEFAULT 'USDT',
  top_prize          TEXT        NOT NULL DEFAULT '0',
  reward_tiers_json  TEXT        NOT NULL DEFAULT '[]',  -- [{rank,label,prize}]
  rules_json         TEXT        NOT NULL DEFAULT '[]',  -- ["...","..."]
  hero_icon          TEXT        NOT NULL DEFAULT 'trophy',
  hero_color         TEXT        NOT NULL DEFAULT '#fcd535',
  join_url           TEXT        NOT NULL DEFAULT '',
  scoring_rule       TEXT        NOT NULL DEFAULT 'roi', -- roi|volume|pnl
  starts_at          TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ,
  status             TEXT        NOT NULL DEFAULT 'upcoming', -- upcoming|active|finished
  is_featured        BOOLEAN     NOT NULL DEFAULT FALSE,
  is_published       BOOLEAN     NOT NULL DEFAULT TRUE,
  position           INTEGER     NOT NULL DEFAULT 0,
  updated_by         INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS competitions_published_idx ON competitions (is_published, is_featured DESC, starts_at DESC);

CREATE TABLE IF NOT EXISTS broadcast_notifications (
  id           SERIAL PRIMARY KEY,
  title        TEXT        NOT NULL,
  body         TEXT        NOT NULL DEFAULT '',
  kind         TEXT        NOT NULL DEFAULT 'info',  -- info|success|warning|danger
  cta_label    TEXT        NOT NULL DEFAULT '',
  cta_url      TEXT        NOT NULL DEFAULT '',
  audience     TEXT        NOT NULL DEFAULT 'all',   -- all|auth|guest
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  starts_at    TIMESTAMPTZ,
  ends_at      TIMESTAMPTZ,
  updated_by   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS broadcast_notifications_active_idx ON broadcast_notifications (is_active, audience, created_at DESC);
