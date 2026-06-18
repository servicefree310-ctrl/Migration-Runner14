-- Phase 9: per-user login OTP preferences (email/phone OTP at every login).
-- Combined with admin policy (auth.login_email_otp / auth.login_phone_otp settings)
-- to compute the effective set of factors required at sign-in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_email_otp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_phone_otp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
