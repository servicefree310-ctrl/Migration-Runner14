ALTER TYPE "public"."ledger_type" ADD VALUE 'trade_tds' BEFORE 'trade_buy';--> statement-breakpoint
ALTER TYPE "public"."ledger_type" ADD VALUE 'instruments_margin';--> statement-breakpoint
ALTER TYPE "public"."ledger_type" ADD VALUE 'instruments_pnl';--> statement-breakpoint
CREATE TABLE "company_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"url" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"avatar_url" text DEFAULT '' NOT NULL,
	"linkedin_url" text DEFAULT '' NOT NULL,
	"twitter_url" text DEFAULT '' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "referrals" ALTER COLUMN "commission_rate" SET DEFAULT '30';--> statement-breakpoint
ALTER TABLE "futures_positions" ADD COLUMN "stop_loss" numeric(28, 8);--> statement-breakpoint
ALTER TABLE "futures_positions" ADD COLUMN "take_profit" numeric(28, 8);--> statement-breakpoint
ALTER TABLE "trader_profiles" ADD COLUMN "pnl_all_time_pct" numeric(12, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "trader_profiles" ADD COLUMN "max_drawdown_pct" numeric(8, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_trading_subscriptions" ADD COLUMN "funding_coin_id" integer;--> statement-breakpoint
ALTER TABLE "ai_trading_subscriptions" ADD COLUMN "funding_amount" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_trading_subscriptions" ADD CONSTRAINT "ai_trading_subscriptions_funding_coin_id_coins_id_fk" FOREIGN KEY ("funding_coin_id") REFERENCES "public"."coins"("id") ON DELETE no action ON UPDATE no action;