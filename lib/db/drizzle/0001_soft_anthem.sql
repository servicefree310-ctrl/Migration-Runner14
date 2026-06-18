CREATE UNIQUE INDEX "kyc_records_user_level_uniq" ON "kyc_records" USING btree ("user_id","level");--> statement-breakpoint
CREATE INDEX "kyc_records_user_status_idx" ON "kyc_records" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "bank_accounts_user_idx" ON "bank_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crypto_withdrawals_user_idx" ON "crypto_withdrawals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crypto_withdrawals_status_idx" ON "crypto_withdrawals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inr_deposits_user_idx" ON "inr_deposits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inr_deposits_status_idx" ON "inr_deposits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inr_withdrawals_user_idx" ON "inr_withdrawals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inr_withdrawals_status_idx" ON "inr_withdrawals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transfers_user_idx" ON "transfers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "otp_codes_recipient_purpose_idx" ON "otp_codes" USING btree ("recipient","purpose");--> statement-breakpoint
CREATE INDEX "earn_positions_user_idx" ON "earn_positions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "earn_positions_product_idx" ON "earn_positions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_idx" ON "chat_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "chat_threads_user_idx" ON "chat_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "referrals_referred_idx" ON "referrals" USING btree ("referred_id");--> statement-breakpoint
CREATE INDEX "funding_payments_user_idx" ON "funding_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "funding_payments_pair_idx" ON "funding_payments" USING btree ("pair_id");--> statement-breakpoint
CREATE INDEX "futures_positions_user_status_idx" ON "futures_positions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "futures_positions_pair_idx" ON "futures_positions" USING btree ("pair_id");--> statement-breakpoint
CREATE INDEX "convert_quotes_user_status_idx" ON "convert_quotes" USING btree ("user_id","status");