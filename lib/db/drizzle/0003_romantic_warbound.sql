ALTER TABLE "referrals" ADD COLUMN "source_ref_id" varchar(64);--> statement-breakpoint
CREATE INDEX "referrals_source_ref_idx" ON "referrals" USING btree ("referrer_id","source_ref_id","level");