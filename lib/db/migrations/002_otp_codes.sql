-- Phase 5: OTP codes table for SMS/Email verification (signup, login, withdraw, kyc, 2fa)
CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  channel TEXT NOT NULL,           -- 'sms' | 'email'
  purpose TEXT NOT NULL,           -- 'signup' | 'login' | 'withdraw' | 'kyc' | '2fa' | 'reset'
  recipient TEXT NOT NULL,         -- phone or email
  code TEXT NOT NULL,              -- 6-digit
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_codes_recipient_purpose ON otp_codes(recipient, purpose, created_at DESC);
