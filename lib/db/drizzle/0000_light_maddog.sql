CREATE TYPE "public"."ai_sub_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high', 'ultra');--> statement-breakpoint
CREATE TYPE "public"."inr_method" AS ENUM('upi', 'bank_transfer', 'neft', 'rtgs', 'imps');--> statement-breakpoint
CREATE TYPE "public"."inr_tx_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."inr_tx_type" AS ENUM('deposit', 'withdrawal');--> statement-breakpoint
CREATE TYPE "public"."msg_sender_type" AS ENUM('user', 'admin', 'bot');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('general', 'kyc', 'deposit', 'withdrawal', 'trading', 'technical', 'account');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('new_user', 'kyc_submitted', 'kyc_approved', 'kyc_rejected', 'large_withdrawal', 'large_trade', 'pair_added', 'user_suspended', 'balance_adjust', '2fa_enabled', '2fa_disabled', 'backup_code_used', 'email_verified', 'phone_verified', 'password_reset', 'settings_changed', 'withdrawal_approved', 'withdrawal_rejected');--> statement-breakpoint
CREATE TYPE "public"."ledger_type" AS ENUM('deposit_inr', 'deposit_crypto', 'withdrawal_inr', 'withdrawal_crypto', 'ai_earning', 'ai_principal_lock', 'ai_principal_return', 'transfer_in', 'transfer_out', 'trade_fee', 'trade_buy', 'trade_sell', 'earn_deposit', 'earn_withdrawal', 'earn_interest', 'p2p_credit', 'p2p_debit', 'referral_bonus', 'admin_credit', 'admin_debit', 'convert', 'options_pnl', 'futures_pnl');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"kyc_level" integer DEFAULT 0 NOT NULL,
	"vip_tier" integer DEFAULT 0 NOT NULL,
	"referral_code" text NOT NULL,
	"referred_by" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"two_fa_enabled" boolean DEFAULT false NOT NULL,
	"login_email_otp_enabled" boolean DEFAULT false NOT NULL,
	"login_phone_otp_enabled" boolean DEFAULT false NOT NULL,
	"uid" text NOT NULL,
	"avatar_url" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code"),
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"payload" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"email" text,
	"ip" text,
	"user_agent" text,
	"success" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "kyc_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"level" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"full_name" text,
	"dob" text,
	"address" text,
	"pan_number" text,
	"aadhaar_number" text,
	"pan_doc_url" text,
	"aadhaar_doc_url" text,
	"selfie_url" text,
	"extra" text DEFAULT '{}' NOT NULL,
	"reject_reason" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_settings" (
	"level" integer PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"deposit_limit" text NOT NULL,
	"withdraw_limit" text NOT NULL,
	"trade_limit" text NOT NULL,
	"features" text DEFAULT '[]' NOT NULL,
	"fields" text DEFAULT '[]' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"ifsc" text NOT NULL,
	"holder_name" text NOT NULL,
	"status" text DEFAULT 'under_review' NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"reject_reason" text,
	"verified_at" timestamp with time zone,
	"reviewed_by" integer,
	"edit_count" integer DEFAULT 0 NOT NULL,
	"name_match" text,
	"name_match_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coins" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'crypto' NOT NULL,
	"decimals" integer DEFAULT 8 NOT NULL,
	"logo_url" text,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_listed" boolean DEFAULT true NOT NULL,
	"listing_at" timestamp with time zone,
	"market_cap_rank" integer,
	"current_price" numeric(24, 8) DEFAULT '0' NOT NULL,
	"change_24h" numeric(10, 4) DEFAULT '0' NOT NULL,
	"binance_symbol" text,
	"price_source" text DEFAULT 'binance' NOT NULL,
	"manual_price" numeric(24, 8),
	"info_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coins_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "networks" (
	"id" serial PRIMARY KEY NOT NULL,
	"coin_id" integer NOT NULL,
	"name" text NOT NULL,
	"chain" text NOT NULL,
	"contract_address" text,
	"min_deposit" numeric(24, 8) DEFAULT '0' NOT NULL,
	"min_withdraw" numeric(24, 8) DEFAULT '0' NOT NULL,
	"withdraw_fee" numeric(24, 8) DEFAULT '0' NOT NULL,
	"withdraw_fee_percent" numeric(8, 4) DEFAULT '0' NOT NULL,
	"withdraw_fee_min" numeric(24, 8) DEFAULT '0' NOT NULL,
	"confirmations" integer DEFAULT 12 NOT NULL,
	"deposit_enabled" boolean DEFAULT true NOT NULL,
	"withdraw_enabled" boolean DEFAULT true NOT NULL,
	"node_address" text,
	"node_status" text DEFAULT 'unknown' NOT NULL,
	"last_node_check_at" timestamp with time zone,
	"memo_required" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"provider_type" text DEFAULT 'custom' NOT NULL,
	"rpc_api_key" text,
	"hot_wallet_address" text,
	"hot_wallet_private_key_enc" text,
	"auto_sweep_enabled" boolean DEFAULT false NOT NULL,
	"auto_withdraw_enabled" boolean DEFAULT false NOT NULL,
	"token_decimals" integer,
	"explorer_url" text,
	"last_block_height" integer,
	"last_block_scanned" integer,
	"block_height_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairs" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"base_coin_id" integer NOT NULL,
	"quote_coin_id" integer NOT NULL,
	"min_qty" numeric(24, 8) DEFAULT '0' NOT NULL,
	"max_qty" numeric(24, 8) DEFAULT '0' NOT NULL,
	"price_precision" integer DEFAULT 2 NOT NULL,
	"qty_precision" integer DEFAULT 4 NOT NULL,
	"taker_fee" numeric(6, 4) DEFAULT '0.001' NOT NULL,
	"maker_fee" numeric(6, 4) DEFAULT '0.001' NOT NULL,
	"trading_enabled" boolean DEFAULT true NOT NULL,
	"futures_enabled" boolean DEFAULT false NOT NULL,
	"trading_start_at" timestamp with time zone,
	"futures_start_at" timestamp with time zone,
	"last_price" numeric(28, 8) DEFAULT '0' NOT NULL,
	"volume_24h" numeric(28, 8) DEFAULT '0' NOT NULL,
	"quote_volume_24h" numeric(28, 8) DEFAULT '0' NOT NULL,
	"high_24h" numeric(28, 8) DEFAULT '0' NOT NULL,
	"low_24h" numeric(28, 8) DEFAULT '0' NOT NULL,
	"change_24h" numeric(10, 4) DEFAULT '0' NOT NULL,
	"trades_24h" integer DEFAULT 0 NOT NULL,
	"stats_override" boolean DEFAULT false NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"max_leverage" integer DEFAULT 100 NOT NULL,
	"mm_rate" numeric(8, 6) DEFAULT '0.005' NOT NULL,
	"funding_interval_hours" integer DEFAULT 8 NOT NULL,
	"base_funding_rate" numeric(10, 6) DEFAULT '0.0001' NOT NULL,
	"funding_auto_create" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pairs_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "custom_apis" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'webhook' NOT NULL,
	"endpoint_url" text NOT NULL,
	"method" text DEFAULT 'POST' NOT NULL,
	"auth_type" text DEFAULT 'none' NOT NULL,
	"auth_value" text,
	"headers" text DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"last_called_at" timestamp with time zone,
	"last_status" text DEFAULT 'untested',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'smtp' NOT NULL,
	"smtp_host" text,
	"smtp_port" integer DEFAULT 587,
	"smtp_secure" boolean DEFAULT false,
	"username" text,
	"password" text,
	"from_email" text,
	"from_name" text,
	"api_key" text,
	"domain" text,
	"region" text DEFAULT 'us-east-1',
	"is_active" boolean DEFAULT false NOT NULL,
	"test_status" text DEFAULT 'untested' NOT NULL,
	"last_tested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateways" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"direction" text NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"min_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"max_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"fee_flat" numeric(18, 2) DEFAULT '0' NOT NULL,
	"fee_percent" numeric(6, 4) DEFAULT '0' NOT NULL,
	"processing_time" text DEFAULT 'Instant' NOT NULL,
	"is_auto" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"api_key" text,
	"api_secret" text,
	"webhook_secret" text,
	"test_mode" boolean DEFAULT true NOT NULL,
	"logo_url" text,
	"config" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateways_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "otp_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"provider" text NOT NULL,
	"api_key" text,
	"api_secret" text,
	"sender_id" text,
	"template" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"coin_id" integer NOT NULL,
	"network_id" integer NOT NULL,
	"address" text NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_type" text NOT NULL,
	"coin_id" integer NOT NULL,
	"balance" numeric(28, 8) DEFAULT '0' NOT NULL,
	"locked" numeric(28, 8) DEFAULT '0' NOT NULL,
	"p2p_locked" numeric(28, 8) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"user_id" integer NOT NULL,
	"coin_id" integer NOT NULL,
	"network_id" integer NOT NULL,
	"amount" numeric(28, 8) NOT NULL,
	"address" text NOT NULL,
	"from_address" text,
	"tx_hash" text,
	"block_number" integer,
	"log_index" integer,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"required_confirmations" integer DEFAULT 12 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"detected_by" text DEFAULT 'manual' NOT NULL,
	"sweep_status" text,
	"sweep_tx_hash" text,
	"swept_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "crypto_deposits_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "crypto_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"user_id" integer NOT NULL,
	"coin_id" integer NOT NULL,
	"network_id" integer NOT NULL,
	"amount" numeric(28, 8) NOT NULL,
	"fee" numeric(28, 8) DEFAULT '0' NOT NULL,
	"to_address" text NOT NULL,
	"memo" text,
	"tx_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"reviewed_by" integer,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"broadcasted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "crypto_withdrawals_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "inr_deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"user_id" integer NOT NULL,
	"gateway_id" integer NOT NULL,
	"bank_id" integer,
	"amount" numeric(18, 2) NOT NULL,
	"fee" numeric(18, 2) DEFAULT '0' NOT NULL,
	"ref_id" text NOT NULL,
	"utr" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"reviewed_by" integer,
	"gateway_order_id" text,
	"gateway_payment_id" text,
	"gateway_method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "inr_deposits_uid_unique" UNIQUE("uid"),
	CONSTRAINT "inr_deposits_ref_id_unique" UNIQUE("ref_id")
);
--> statement-breakpoint
CREATE TABLE "inr_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"user_id" integer NOT NULL,
	"bank_id" integer NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"fee" numeric(18, 2) DEFAULT '0' NOT NULL,
	"ref_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"reviewed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "inr_withdrawals_uid_unique" UNIQUE("uid"),
	CONSTRAINT "inr_withdrawals_ref_id_unique" UNIQUE("ref_id")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"from_wallet" text NOT NULL,
	"to_wallet" text NOT NULL,
	"coin_id" integer NOT NULL,
	"amount" numeric(28, 8) NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"channel" text NOT NULL,
	"purpose" text NOT NULL,
	"recipient" text NOT NULL,
	"code" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"user_id" integer NOT NULL,
	"pair_id" integer NOT NULL,
	"side" text NOT NULL,
	"type" text DEFAULT 'limit' NOT NULL,
	"price" numeric(28, 8) DEFAULT '0' NOT NULL,
	"qty" numeric(28, 8) NOT NULL,
	"filled_qty" numeric(28, 8) DEFAULT '0' NOT NULL,
	"avg_price" numeric(28, 8) DEFAULT '0' NOT NULL,
	"fee" numeric(28, 8) DEFAULT '0' NOT NULL,
	"tds" numeric(28, 8) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"is_bot" integer DEFAULT 0 NOT NULL,
	"bot_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"order_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"pair_id" integer NOT NULL,
	"side" text NOT NULL,
	"price" numeric(28, 8) NOT NULL,
	"qty" numeric(28, 8) NOT NULL,
	"fee" numeric(28, 8) DEFAULT '0' NOT NULL,
	"tds" numeric(28, 8) DEFAULT '0' NOT NULL,
	"is_taker" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "earn_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"amount" numeric(28, 8) NOT NULL,
	"total_earned" numeric(28, 8) DEFAULT '0' NOT NULL,
	"auto_maturity" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"matured_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "earn_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"coin_id" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"duration_days" integer DEFAULT 0 NOT NULL,
	"apy" numeric(6, 2) NOT NULL,
	"min_amount" numeric(28, 8) DEFAULT '0' NOT NULL,
	"max_amount" numeric(28, 8) DEFAULT '0' NOT NULL,
	"total_cap" numeric(28, 8) DEFAULT '0' NOT NULL,
	"current_subscribed" numeric(28, 8) DEFAULT '0' NOT NULL,
	"payout_interval" text DEFAULT 'daily' NOT NULL,
	"compounding" boolean DEFAULT false NOT NULL,
	"early_redemption" boolean DEFAULT false NOT NULL,
	"early_redemption_penalty_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"min_vip_tier" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"sale_start_at" timestamp with time zone,
	"sale_end_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'product' NOT NULL,
	"cta_label" text DEFAULT '' NOT NULL,
	"cta_url" text DEFAULT '' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_banners" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"bg_color" text DEFAULT '#fcd535' NOT NULL,
	"fg_color" text DEFAULT '#000000' NOT NULL,
	"icon" text DEFAULT 'shield' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"cta_label" text DEFAULT '' NOT NULL,
	"cta_url" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"show_on_mobile" boolean DEFAULT true NOT NULL,
	"show_on_web" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'info' NOT NULL,
	"cta_label" text DEFAULT '' NOT NULL,
	"cta_url" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache_configs" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'misc' NOT NULL,
	"ttl_sec" integer DEFAULT 60 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cache_on_server" boolean DEFAULT true NOT NULL,
	"cache_on_mobile" boolean DEFAULT true NOT NULL,
	"cache_on_web" boolean DEFAULT true NOT NULL,
	"pattern" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_role" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"subject" text DEFAULT 'Support' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_id" integer,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"prize_pool" text DEFAULT '0' NOT NULL,
	"prize_unit" text DEFAULT 'USDT' NOT NULL,
	"top_prize" text DEFAULT '0' NOT NULL,
	"reward_tiers_json" text DEFAULT '[]' NOT NULL,
	"rules_json" text DEFAULT '[]' NOT NULL,
	"hero_icon" text DEFAULT 'trophy' NOT NULL,
	"hero_color" text DEFAULT '#fcd535' NOT NULL,
	"join_url" text DEFAULT '' NOT NULL,
	"scoring_rule" text DEFAULT 'roi' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_pages" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'market' NOT NULL,
	"cover_image_url" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'Zebvix' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_items_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "home_promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'event' NOT NULL,
	"tag" text DEFAULT 'EVENT' NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#a06af5' NOT NULL,
	"icon" text DEFAULT 'award' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"cta_label" text DEFAULT 'Learn more' NOT NULL,
	"cta_url" text DEFAULT '' NOT NULL,
	"prize_pool" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"show_on_mobile" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_id" integer NOT NULL,
	"referred_id" integer NOT NULL,
	"commission_rate" text DEFAULT '20' NOT NULL,
	"total_earned" text DEFAULT '0' NOT NULL,
	"bonus_credited" boolean DEFAULT false NOT NULL,
	"bonus_amount" text DEFAULT '0',
	"level" integer DEFAULT 1 NOT NULL,
	"source_type" text DEFAULT 'registration' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposit_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"coin_id" integer NOT NULL,
	"network_id" integer NOT NULL,
	"address" text NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"network_id" integer NOT NULL,
	"address" text NOT NULL,
	"memo" text,
	"private_key_enc" text,
	"derivation_path" text,
	"derivation_index" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"api_key" text DEFAULT '' NOT NULL,
	"api_secret" text DEFAULT '' NOT NULL,
	"base_url" text,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"pair_id" integer NOT NULL,
	"rate" numeric(10, 6) DEFAULT '0' NOT NULL,
	"interval_hours" integer DEFAULT 8 NOT NULL,
	"funding_time" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL,
	"settled" text DEFAULT 'false' NOT NULL,
	"settled_at" timestamp with time zone,
	"positions_affected" integer DEFAULT 0 NOT NULL,
	"total_paid" numeric(28, 8) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_bots" (
	"id" serial PRIMARY KEY NOT NULL,
	"pair_id" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"spread_bps" integer DEFAULT 20 NOT NULL,
	"levels" integer DEFAULT 5 NOT NULL,
	"price_step_bps" integer DEFAULT 10 NOT NULL,
	"order_size" numeric(28, 8) DEFAULT '0.01' NOT NULL,
	"refresh_sec" integer DEFAULT 8 NOT NULL,
	"max_order_age_sec" integer DEFAULT 60 NOT NULL,
	"fill_on_cross" boolean DEFAULT true NOT NULL,
	"spot_enabled" boolean DEFAULT true NOT NULL,
	"futures_enabled" boolean DEFAULT false NOT NULL,
	"top_of_book_boost_pct" integer DEFAULT 50 NOT NULL,
	"market_taker_enabled" boolean DEFAULT false NOT NULL,
	"market_taker_size_mult" numeric(8, 2) DEFAULT '2.00' NOT NULL,
	"price_move_trigger_bps" integer DEFAULT 30 NOT NULL,
	"big_order_trigger_qty" numeric(28, 8) DEFAULT '0' NOT NULL,
	"big_order_absorb_mult" numeric(8, 2) DEFAULT '1.50' NOT NULL,
	"market_taker_cooldown_sec" integer DEFAULT 30 NOT NULL,
	"last_market_order_at" timestamp with time zone,
	"last_mid_price" numeric(28, 8),
	"start_at" timestamp with time zone,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"pair_id" integer NOT NULL,
	"funding_rate_id" integer NOT NULL,
	"rate" numeric(10, 6) NOT NULL,
	"position_value" numeric(28, 8) NOT NULL,
	"payment" numeric(28, 8) NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "futures_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"user_id" integer NOT NULL,
	"pair_id" integer NOT NULL,
	"side" text NOT NULL,
	"type" text DEFAULT 'limit' NOT NULL,
	"price" numeric(28, 8),
	"qty" numeric(28, 8) NOT NULL,
	"filled_qty" numeric(28, 8) DEFAULT '0' NOT NULL,
	"avg_fill_price" numeric(28, 8) DEFAULT '0' NOT NULL,
	"leverage" integer DEFAULT 10 NOT NULL,
	"margin_type" text DEFAULT 'isolated' NOT NULL,
	"margin_locked" numeric(28, 8) DEFAULT '0' NOT NULL,
	"reduce_only" boolean DEFAULT false NOT NULL,
	"stop_loss" numeric(28, 8),
	"take_profit" numeric(28, 8),
	"status" text DEFAULT 'OPEN' NOT NULL,
	"fee" numeric(28, 8) DEFAULT '0' NOT NULL,
	"position_id" integer,
	"is_bot" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "futures_orders_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "futures_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"user_id" integer NOT NULL,
	"pair_id" integer NOT NULL,
	"side" text NOT NULL,
	"leverage" integer DEFAULT 10 NOT NULL,
	"qty" numeric(28, 8) NOT NULL,
	"entry_price" numeric(28, 8) NOT NULL,
	"mark_price" numeric(28, 8) DEFAULT '0' NOT NULL,
	"margin_amount" numeric(28, 8) NOT NULL,
	"margin_type" text DEFAULT 'isolated' NOT NULL,
	"unrealized_pnl" numeric(28, 8) DEFAULT '0' NOT NULL,
	"liquidation_price" numeric(28, 8) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"realized_pnl" numeric(28, 8) DEFAULT '0' NOT NULL,
	CONSTRAINT "futures_positions_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "futures_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"pair_id" integer NOT NULL,
	"taker_order_id" integer NOT NULL,
	"maker_order_id" integer NOT NULL,
	"taker_user_id" integer NOT NULL,
	"maker_user_id" integer NOT NULL,
	"taker_side" text NOT NULL,
	"price" numeric(28, 8) NOT NULL,
	"qty" numeric(28, 8) NOT NULL,
	"taker_fee" numeric(28, 8) DEFAULT '0' NOT NULL,
	"maker_fee" numeric(28, 8) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "futures_trades_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "user_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"key_id" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"secret_preview" text NOT NULL,
	"permissions" text DEFAULT '["read"]' NOT NULL,
	"ip_whitelist" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_used_ip" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_api_keys_key_id_unique" UNIQUE("key_id")
);
--> statement-breakpoint
CREATE TABLE "option_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"underlying_coin_id" integer NOT NULL,
	"quote_coin_symbol" text DEFAULT 'USDT' NOT NULL,
	"option_type" text NOT NULL,
	"strike_price" numeric(28, 8) NOT NULL,
	"expiry_at" timestamp with time zone NOT NULL,
	"iv_bps" integer DEFAULT 8000 NOT NULL,
	"risk_free_rate_bps" integer DEFAULT 500 NOT NULL,
	"contract_size" numeric(28, 8) DEFAULT '1' NOT NULL,
	"min_qty" numeric(28, 8) DEFAULT '0.01' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"settlement_price" numeric(28, 8),
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "option_contracts_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "option_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"contract_id" integer NOT NULL,
	"side" text NOT NULL,
	"qty" numeric(28, 8) NOT NULL,
	"premium" numeric(28, 8) NOT NULL,
	"mark_price_at_fill" numeric(28, 8) NOT NULL,
	"fee" numeric(28, 8) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'FILLED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"contract_id" integer NOT NULL,
	"side" text NOT NULL,
	"qty" numeric(28, 8) NOT NULL,
	"avg_entry_premium" numeric(28, 8) NOT NULL,
	"margin_locked" numeric(28, 8) DEFAULT '0' NOT NULL,
	"realized_pnl" numeric(28, 8) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text
);
--> statement-breakpoint
CREATE TABLE "web3_bridges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"from_network_id" integer NOT NULL,
	"to_network_id" integer NOT NULL,
	"token_symbol" text NOT NULL,
	"from_amount" numeric(36, 18) NOT NULL,
	"to_amount" numeric(36, 18) NOT NULL,
	"fee_usd" numeric(18, 6) DEFAULT '0' NOT NULL,
	"src_tx_hash" text,
	"dst_tx_hash" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "web3_networks" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_key" text NOT NULL,
	"display_name" text NOT NULL,
	"chain_id" integer DEFAULT 0 NOT NULL,
	"native_symbol" text NOT NULL,
	"rpc_url" text NOT NULL,
	"explorer_url" text NOT NULL,
	"logo_url" text,
	"family" text DEFAULT 'evm' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"bridge_fee_bps" integer DEFAULT 15 NOT NULL,
	"swap_fee_bps" integer DEFAULT 30 NOT NULL,
	"est_gas_usd" numeric(12, 4) DEFAULT '0.50' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web3_networks_chain_key_unique" UNIQUE("chain_key")
);
--> statement-breakpoint
CREATE TABLE "web3_swaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"network_id" integer NOT NULL,
	"from_token_id" integer NOT NULL,
	"to_token_id" integer NOT NULL,
	"from_amount" numeric(36, 18) NOT NULL,
	"to_amount" numeric(36, 18) NOT NULL,
	"rate" numeric(36, 18) NOT NULL,
	"slippage_bps" integer DEFAULT 50 NOT NULL,
	"fee_usd" numeric(18, 6) DEFAULT '0' NOT NULL,
	"gas_usd" numeric(18, 6) DEFAULT '0' NOT NULL,
	"tx_hash" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web3_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"contract_address" text,
	"decimals" integer DEFAULT 18 NOT NULL,
	"is_native" boolean DEFAULT false NOT NULL,
	"price_coin_symbol" text NOT NULL,
	"logo_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_stablecoin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web3_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"network_id" integer NOT NULL,
	"address" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'watch' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"chain" text,
	"contract_address" text,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"price_usd" numeric(24, 8) DEFAULT '0' NOT NULL,
	"market_cap_usd" numeric(24, 2) DEFAULT '0' NOT NULL,
	"volume_24h_usd" numeric(24, 2) DEFAULT '0' NOT NULL,
	"liquidity_usd" numeric(24, 2) DEFAULT '0' NOT NULL,
	"price_change_24h" numeric(12, 4) DEFAULT '0' NOT NULL,
	"age_days" integer DEFAULT 0 NOT NULL,
	"risk_score" integer DEFAULT 50 NOT NULL,
	"risk_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_data" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"rule_id" integer,
	"decided_by" integer,
	"decided_at" timestamp,
	"decision_note" text,
	"listed_coin_id" integer,
	"listed_token_id" integer,
	"listed_network_id" integer,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'manual' NOT NULL,
	"scope" text DEFAULT 'both' NOT NULL,
	"min_volume_24h_usd" numeric(24, 2) DEFAULT '100000' NOT NULL,
	"min_market_cap_usd" numeric(24, 2) DEFAULT '1000000' NOT NULL,
	"min_liquidity_usd" numeric(24, 2) DEFAULT '50000' NOT NULL,
	"min_age_days" integer DEFAULT 7 NOT NULL,
	"chains_allowed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_filter" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_create_pair" boolean DEFAULT true NOT NULL,
	"quote_symbol" text DEFAULT 'USDT' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"endpoint" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sync_interval_min" integer DEFAULT 15 NOT NULL,
	"max_items_per_sync" integer DEFAULT 50 NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"coin_symbol" text NOT NULL,
	"condition" text NOT NULL,
	"target_price" numeric(28, 8) NOT NULL,
	"trigger_once" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"triggered_at" timestamp with time zone,
	"triggered_price" numeric(28, 8),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"category" text DEFAULT 'system' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"cta_label" text,
	"cta_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"side" text NOT NULL,
	"price" numeric(28, 8) NOT NULL,
	"qty" numeric(28, 8) NOT NULL,
	"notional" numeric(28, 8) NOT NULL,
	"pnl_usd" numeric(28, 8) DEFAULT '0' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_bots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"bot_type" text NOT NULL,
	"symbol" text NOT NULL,
	"base_symbol" text NOT NULL,
	"quote_symbol" text NOT NULL,
	"status" text DEFAULT 'stopped' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_invested_usd" numeric(28, 8) DEFAULT '0' NOT NULL,
	"realized_pnl_usd" numeric(28, 8) DEFAULT '0' NOT NULL,
	"unrealized_pnl_usd" numeric(28, 8) DEFAULT '0' NOT NULL,
	"total_trades" integer DEFAULT 0 NOT NULL,
	"successful_trades" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"follower_id" integer NOT NULL,
	"trader_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"allocation_usd" numeric(28, 8) NOT NULL,
	"copy_ratio" numeric(8, 4) DEFAULT '1' NOT NULL,
	"max_risk_per_trade_pct" numeric(6, 2) DEFAULT '5' NOT NULL,
	"total_copied_trades" integer DEFAULT 0 NOT NULL,
	"total_pnl_usd" numeric(28, 8) DEFAULT '0' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trader_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"display_name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"performance_fee_bps" integer DEFAULT 1000 NOT NULL,
	"total_pnl_usd" numeric(28, 8) DEFAULT '0' NOT NULL,
	"pnl_30d_pct" numeric(12, 4) DEFAULT '0' NOT NULL,
	"pnl_90d_pct" numeric(12, 4) DEFAULT '0' NOT NULL,
	"win_rate_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"total_trades" integer DEFAULT 0 NOT NULL,
	"followers_count" integer DEFAULT 0 NOT NULL,
	"aum_usd" numeric(28, 8) DEFAULT '0' NOT NULL,
	"risk_score" integer DEFAULT 50 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trader_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "dashboard_layouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"is_default" integer DEFAULT 0 NOT NULL,
	"layout" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text DEFAULT 'My Watchlist' NOT NULL,
	"symbols" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "p2p_disputes" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"opened_by" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"reason" text NOT NULL,
	"evidence_url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" integer,
	"resolved_at" timestamp with time zone,
	"notes" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "p2p_disputes_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "p2p_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "p2p_offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"user_id" integer NOT NULL,
	"side" text NOT NULL,
	"coin_id" integer NOT NULL,
	"fiat" text DEFAULT 'INR' NOT NULL,
	"price" numeric(28, 8) NOT NULL,
	"total_qty" numeric(28, 8) NOT NULL,
	"available_qty" numeric(28, 8) NOT NULL,
	"min_fiat" numeric(28, 2) NOT NULL,
	"max_fiat" numeric(28, 2) NOT NULL,
	"payment_methods" text NOT NULL,
	"pay_window_mins" integer DEFAULT 15 NOT NULL,
	"terms" text,
	"status" text DEFAULT 'online' NOT NULL,
	"min_kyc_level" integer DEFAULT 1 NOT NULL,
	"min_trades" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "p2p_offers_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "p2p_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"offer_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"coin_id" integer NOT NULL,
	"fiat" text DEFAULT 'INR' NOT NULL,
	"price" numeric(28, 8) NOT NULL,
	"qty" numeric(28, 8) NOT NULL,
	"fiat_amount" numeric(28, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"payment_account" text NOT NULL,
	"payment_label" text NOT NULL,
	"payment_ifsc" text,
	"payment_holder_name" text,
	"payment_utr" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"dispute_opened_by" integer,
	"dispute_reason" text,
	"dispute_opened_at" timestamp with time zone,
	"dispute_resolution" text,
	"dispute_resolved_by" integer,
	"dispute_resolved_at" timestamp with time zone,
	"dispute_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "p2p_orders_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "p2p_payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"method" text NOT NULL,
	"label" text NOT NULL,
	"account" text NOT NULL,
	"ifsc" text,
	"holder_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "convert_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(32) DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"user_id" integer NOT NULL,
	"from_coin_id" integer NOT NULL,
	"to_coin_id" integer NOT NULL,
	"from_amount" numeric(28, 8) NOT NULL,
	"to_amount" numeric(28, 8) NOT NULL,
	"rate" numeric(28, 8) NOT NULL,
	"fee_amount" numeric(28, 8) DEFAULT '0' NOT NULL,
	"fee_bps" integer DEFAULT 0 NOT NULL,
	"vip_tier" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convert_quotes_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "broker_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"broker" text DEFAULT 'angelone' NOT NULL,
	"api_key" text,
	"client_id" text,
	"totp_secret" text,
	"api_secret_enc" text,
	"jwt_token" text,
	"jwt_expires_at" timestamp with time zone,
	"refresh_token" text,
	"feed_token" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"sandbox_mode" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instrument_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"side" text NOT NULL,
	"type" text DEFAULT 'market' NOT NULL,
	"qty" numeric(18, 4) NOT NULL,
	"price" numeric(24, 8),
	"stop_price" numeric(24, 8),
	"filled_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"avg_fill_price" numeric(24, 8),
	"status" text DEFAULT 'pending' NOT NULL,
	"broker_order_id" text,
	"broker_status" text,
	"leverage" integer DEFAULT 1 NOT NULL,
	"margin_used" numeric(24, 8) DEFAULT '0' NOT NULL,
	"fee" numeric(24, 8) DEFAULT '0' NOT NULL,
	"pnl" numeric(24, 8) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instrument_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"side" text NOT NULL,
	"qty" numeric(18, 4) NOT NULL,
	"avg_entry_price" numeric(24, 8) NOT NULL,
	"current_price" numeric(24, 8) DEFAULT '0' NOT NULL,
	"unrealized_pnl" numeric(24, 8) DEFAULT '0' NOT NULL,
	"realized_pnl" numeric(24, 8) DEFAULT '0' NOT NULL,
	"margin_used" numeric(24, 8) DEFAULT '0' NOT NULL,
	"leverage" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"asset_class" text NOT NULL,
	"exchange" text DEFAULT 'NSE' NOT NULL,
	"broker_symbol" text,
	"broker_token" text,
	"lot_size" numeric(18, 4) DEFAULT '1' NOT NULL,
	"tick_size" numeric(18, 8) DEFAULT '0.01' NOT NULL,
	"price_precision" integer DEFAULT 2 NOT NULL,
	"qty_precision" integer DEFAULT 4 NOT NULL,
	"min_qty" numeric(18, 4) DEFAULT '1' NOT NULL,
	"max_qty" numeric(18, 4) DEFAULT '10000' NOT NULL,
	"margin_required" numeric(8, 4) DEFAULT '0.10' NOT NULL,
	"max_leverage" integer DEFAULT 10 NOT NULL,
	"taker_fee" numeric(8, 6) DEFAULT '0.0003' NOT NULL,
	"maker_fee" numeric(8, 6) DEFAULT '0.0002' NOT NULL,
	"quote_currency" text DEFAULT 'INR' NOT NULL,
	"current_price" numeric(24, 8) DEFAULT '0' NOT NULL,
	"previous_close" numeric(24, 8) DEFAULT '0' NOT NULL,
	"change_24h" numeric(10, 4) DEFAULT '0' NOT NULL,
	"high_24h" numeric(24, 8) DEFAULT '0' NOT NULL,
	"low_24h" numeric(24, 8) DEFAULT '0' NOT NULL,
	"volume_24h" numeric(28, 4) DEFAULT '0' NOT NULL,
	"trading_enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"logo_url" text,
	"sector" text,
	"isin" text,
	"country_code" text DEFAULT 'IN' NOT NULL,
	"price_source" text DEFAULT 'broker' NOT NULL,
	"manual_price" numeric(24, 8),
	"price_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "broker_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"angel_client_id" text,
	"angel_demat" text,
	"angel_trading_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"full_name" text,
	"dob" text,
	"gender" text,
	"father_name" text,
	"mother_name" text,
	"marital_status" text,
	"annual_income" text,
	"occupation" text,
	"mobile" text,
	"email" text,
	"address" text,
	"city" text,
	"state" text,
	"pincode" text,
	"pan_number" text,
	"aadhar_number" text,
	"bank_account_no" text,
	"bank_ifsc" text,
	"bank_name" text,
	"bank_account_type" text,
	"segment_equity" boolean DEFAULT true,
	"segment_fno" boolean DEFAULT false,
	"segment_commodity" boolean DEFAULT false,
	"segment_currency" boolean DEFAULT false,
	"nominee_name" text,
	"nominee_relation" text,
	"nominee_dob" text,
	"jwt_token" text,
	"jwt_expires_at" timestamp,
	"refresh_token" text,
	"feed_token" text,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_kyc_docs" (
	"id" serial PRIMARY KEY NOT NULL,
	"broker_account_id" integer NOT NULL,
	"doc_type" text NOT NULL,
	"file_url" text,
	"file_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_note" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "broker_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"broker_account_id" integer,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"asset_class" text NOT NULL,
	"order_type" text NOT NULL,
	"side" text NOT NULL,
	"qty" numeric(18, 4) NOT NULL,
	"price" numeric(18, 6),
	"trigger_price" numeric(18, 6),
	"status" text DEFAULT 'pending' NOT NULL,
	"angel_order_id" text,
	"executed_qty" numeric(18, 4) DEFAULT '0',
	"executed_price" numeric(18, 6),
	"pnl" numeric(18, 6),
	"brokerage" numeric(18, 6),
	"simulated" boolean DEFAULT true NOT NULL,
	"error_msg" text,
	"placed_at" timestamp,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_portfolio" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"broker_account_id" integer,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"asset_class" text NOT NULL,
	"holding_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"avg_buy_price" numeric(18, 6) DEFAULT '0' NOT NULL,
	"current_price" numeric(18, 6),
	"unrealized_pnl" numeric(18, 6),
	"realized_pnl" numeric(18, 6) DEFAULT '0',
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mt5_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"server" text NOT NULL,
	"login" text NOT NULL,
	"password_hash" text,
	"name" text,
	"currency" text DEFAULT 'USD',
	"leverage" integer,
	"balance" numeric(18, 2) DEFAULT '0',
	"equity" numeric(18, 2) DEFAULT '0',
	"margin" numeric(18, 2) DEFAULT '0',
	"free_margin" numeric(18, 2) DEFAULT '0',
	"status" text DEFAULT 'disconnected' NOT NULL,
	"is_demo" boolean DEFAULT true NOT NULL,
	"connection_type" text DEFAULT 'investor',
	"last_error" text,
	"last_connected_at" timestamp,
	"session_token" text,
	"session_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mt5_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"mt5_account_id" integer,
	"symbol" text NOT NULL,
	"order_type" text NOT NULL,
	"side" text NOT NULL,
	"volume" numeric(18, 4) NOT NULL,
	"open_price" numeric(18, 6),
	"close_price" numeric(18, 6),
	"stop_loss" numeric(18, 6),
	"take_profit" numeric(18, 6),
	"profit" numeric(18, 4),
	"commission" numeric(18, 4),
	"swap" numeric(18, 4),
	"mt5_ticket" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL,
	"comment" text,
	"opened_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smartapi_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_code" text NOT NULL,
	"api_key" text NOT NULL,
	"jwt_token" text,
	"refresh_token" text,
	"feed_token" text,
	"jwt_expires_at" timestamp,
	"name" text,
	"email" text,
	"mobile" text,
	"pan" text,
	"broker_name" text DEFAULT 'Angel One',
	"available_cash" numeric(18, 2),
	"total_pnl" numeric(18, 2),
	"status" text DEFAULT 'disconnected' NOT NULL,
	"last_error" text,
	"last_connected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_trading_earnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"subscription_id" integer NOT NULL,
	"plan_name" text NOT NULL,
	"amount_usdt" numeric(20, 8) NOT NULL,
	"credited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_trading_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"daily_return_percent" numeric(10, 4) NOT NULL,
	"min_investment" numeric(20, 8) NOT NULL,
	"max_investment" numeric(20, 8) NOT NULL,
	"duration_days" integer NOT NULL,
	"risk_level" "risk_level" DEFAULT 'medium' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_trading_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"invested_amount" numeric(20, 8) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "ai_sub_status" DEFAULT 'active' NOT NULL,
	"total_earned" numeric(20, 8) DEFAULT '0' NOT NULL,
	"last_credited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inr_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" "inr_tx_type" NOT NULL,
	"amount_inr" numeric(20, 2) NOT NULL,
	"usd_amount" numeric(20, 8),
	"method" "inr_method" NOT NULL,
	"upi_id" text,
	"bank_name" text,
	"account_number" text,
	"ifsc_code" text,
	"account_holder" text,
	"utr_number" text,
	"reference_number" text,
	"status" "inr_tx_status" DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"coin" text NOT NULL,
	"network" text NOT NULL,
	"label" text NOT NULL,
	"deposit_address" text,
	"xpub_key" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"subject" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"category" "ticket_category" DEFAULT 'general' NOT NULL,
	"agent_id" integer,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"sender_id" integer,
	"sender_type" "msg_sender_type" DEFAULT 'user' NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"default_maker_fee" numeric(10, 6) DEFAULT '0.001' NOT NULL,
	"default_taker_fee" numeric(10, 6) DEFAULT '0.001' NOT NULL,
	"withdrawal_fee_percent" numeric(10, 6) DEFAULT '0.001' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "activity_type" NOT NULL,
	"description" text NOT NULL,
	"user_id" integer,
	"username" text,
	"amount" numeric(20, 8),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"coin_id" integer NOT NULL,
	"wallet_type" text DEFAULT 'spot' NOT NULL,
	"type" "ledger_type" NOT NULL,
	"amount" numeric(28, 8) NOT NULL,
	"balance_before" numeric(28, 8) DEFAULT '0' NOT NULL,
	"balance_after" numeric(28, 8) DEFAULT '0' NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_candidates" ADD CONSTRAINT "listing_candidates_rule_id_listing_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."listing_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_candidates" ADD CONSTRAINT "listing_candidates_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_candidates" ADD CONSTRAINT "listing_candidates_listed_coin_id_coins_id_fk" FOREIGN KEY ("listed_coin_id") REFERENCES "public"."coins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_candidates" ADD CONSTRAINT "listing_candidates_listed_token_id_web3_tokens_id_fk" FOREIGN KEY ("listed_token_id") REFERENCES "public"."web3_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_candidates" ADD CONSTRAINT "listing_candidates_listed_network_id_web3_networks_id_fk" FOREIGN KEY ("listed_network_id") REFERENCES "public"."web3_networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_accounts" ADD CONSTRAINT "broker_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_kyc_docs" ADD CONSTRAINT "broker_kyc_docs_broker_account_id_broker_accounts_id_fk" FOREIGN KEY ("broker_account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_orders" ADD CONSTRAINT "broker_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_orders" ADD CONSTRAINT "broker_orders_broker_account_id_broker_accounts_id_fk" FOREIGN KEY ("broker_account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_portfolio" ADD CONSTRAINT "broker_portfolio_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_portfolio" ADD CONSTRAINT "broker_portfolio_broker_account_id_broker_accounts_id_fk" FOREIGN KEY ("broker_account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mt5_accounts" ADD CONSTRAINT "mt5_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mt5_orders" ADD CONSTRAINT "mt5_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mt5_orders" ADD CONSTRAINT "mt5_orders_mt5_account_id_mt5_accounts_id_fk" FOREIGN KEY ("mt5_account_id") REFERENCES "public"."mt5_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smartapi_accounts" ADD CONSTRAINT "smartapi_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_trading_earnings" ADD CONSTRAINT "ai_trading_earnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_trading_earnings" ADD CONSTRAINT "ai_trading_earnings_subscription_id_ai_trading_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."ai_trading_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_trading_subscriptions" ADD CONSTRAINT "ai_trading_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_trading_subscriptions" ADD CONSTRAINT "ai_trading_subscriptions_plan_id_ai_trading_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."ai_trading_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inr_transactions" ADD CONSTRAINT "inr_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_user_type_coin_idx" ON "wallets" USING btree ("user_id","wallet_type","coin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crypto_deposits_tx_log_uniq" ON "crypto_deposits" USING btree ("network_id","tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_pair_id_idx" ON "orders" USING btree ("pair_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_user_status_idx" ON "orders" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "orders_pair_status_idx" ON "orders" USING btree ("pair_id","status");--> statement-breakpoint
CREATE INDEX "trades_user_id_idx" ON "trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trades_pair_id_idx" ON "trades" USING btree ("pair_id");--> statement-breakpoint
CREATE INDEX "trades_order_id_idx" ON "trades" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "trades_created_at_idx" ON "trades" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_addresses_uniq" ON "deposit_addresses" USING btree ("user_id","coin_id","network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_addresses_user_network_uniq" ON "wallet_addresses" USING btree ("user_id","network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_bots_pair_unique" ON "market_bots" USING btree ("pair_id");--> statement-breakpoint
CREATE UNIQUE INDEX "funding_payments_rate_pos_idx" ON "funding_payments" USING btree ("funding_rate_id","position_id");--> statement-breakpoint
CREATE INDEX "futures_orders_pair_status_idx" ON "futures_orders" USING btree ("pair_id","status");--> statement-breakpoint
CREATE INDEX "futures_orders_user_created_idx" ON "futures_orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "futures_trades_pair_created_idx" ON "futures_trades" USING btree ("pair_id","created_at");--> statement-breakpoint
CREATE INDEX "futures_trades_taker_user_idx" ON "futures_trades" USING btree ("taker_user_id","created_at");--> statement-breakpoint
CREATE INDEX "futures_trades_maker_user_idx" ON "futures_trades" USING btree ("maker_user_id","created_at");--> statement-breakpoint
CREATE INDEX "option_contracts_status_expiry_idx" ON "option_contracts" USING btree ("status","expiry_at");--> statement-breakpoint
CREATE INDEX "option_contracts_underlying_idx" ON "option_contracts" USING btree ("underlying_coin_id","expiry_at");--> statement-breakpoint
CREATE INDEX "option_orders_user_idx" ON "option_orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "option_orders_contract_idx" ON "option_orders" USING btree ("contract_id","created_at");--> statement-breakpoint
CREATE INDEX "option_positions_user_idx" ON "option_positions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "option_positions_open_uniq_idx" ON "option_positions" USING btree ("user_id","contract_id","side","status");--> statement-breakpoint
CREATE INDEX "web3_bridges_user_idx" ON "web3_bridges" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "web3_swaps_user_idx" ON "web3_swaps" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "web3_tokens_network_symbol_idx" ON "web3_tokens" USING btree ("network_id","symbol");--> statement-breakpoint
CREATE INDEX "web3_tokens_network_idx" ON "web3_tokens" USING btree ("network_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "web3_wallets_user_addr_idx" ON "web3_wallets" USING btree ("user_id","network_id","address");--> statement-breakpoint
CREATE INDEX "web3_wallets_user_idx" ON "web3_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_candidates_uniq_idx" ON "listing_candidates" USING btree ("source","source_ref");--> statement-breakpoint
CREATE INDEX "listing_candidates_status_idx" ON "listing_candidates" USING btree ("status","discovered_at");--> statement-breakpoint
CREATE INDEX "listing_candidates_symbol_idx" ON "listing_candidates" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "listing_rules_active_priority_idx" ON "listing_rules" USING btree ("is_active","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_sources_uniq_idx" ON "listing_sources" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "price_alerts_user_status_idx" ON "price_alerts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "price_alerts_symbol_status_idx" ON "price_alerts" USING btree ("coin_symbol","status");--> statement-breakpoint
CREATE INDEX "user_notif_user_created_idx" ON "user_notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_notif_user_unread_idx" ON "user_notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "bot_trades_bot_idx" ON "bot_trades" USING btree ("bot_id","created_at");--> statement-breakpoint
CREATE INDEX "bots_user_status_idx" ON "trading_bots" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "bots_status_idx" ON "trading_bots" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "copy_rel_follower_trader_idx" ON "copy_relations" USING btree ("follower_id","trader_id");--> statement-breakpoint
CREATE INDEX "copy_rel_trader_status_idx" ON "copy_relations" USING btree ("trader_id","status");--> statement-breakpoint
CREATE INDEX "trader_profiles_active_pnl_idx" ON "trader_profiles" USING btree ("is_active","pnl_30d_pct");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_layouts_user_name_idx" ON "dashboard_layouts" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_user_name_idx" ON "watchlists" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "p2p_dispute_status_idx" ON "p2p_disputes" USING btree ("status","opened_at");--> statement-breakpoint
CREATE INDEX "p2p_dispute_buyer_idx" ON "p2p_disputes" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "p2p_dispute_seller_idx" ON "p2p_disputes" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "p2p_msg_order_idx" ON "p2p_messages" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "p2p_offer_user_idx" ON "p2p_offers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "p2p_offer_coin_side_idx" ON "p2p_offers" USING btree ("coin_id","side","status");--> statement-breakpoint
CREATE INDEX "p2p_order_buyer_idx" ON "p2p_orders" USING btree ("buyer_id","status");--> statement-breakpoint
CREATE INDEX "p2p_order_seller_idx" ON "p2p_orders" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "p2p_order_offer_idx" ON "p2p_orders" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "p2p_order_status_idx" ON "p2p_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "p2p_pm_user_idx" ON "p2p_payment_methods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_ledger_user_idx" ON "wallet_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_ledger_coin_idx" ON "wallet_ledger" USING btree ("coin_id");--> statement-breakpoint
CREATE INDEX "wallet_ledger_type_idx" ON "wallet_ledger" USING btree ("type");--> statement-breakpoint
CREATE INDEX "wallet_ledger_created_idx" ON "wallet_ledger" USING btree ("created_at");