/*
# Create admin_otp_codes table

Stores time-limited one-time password codes for admin two-factor authentication.

1. New Tables
   - `admin_otp_codes`
     - `id` (uuid, primary key)
     - `user_id` (uuid, FK to auth.users) — which admin the code belongs to
     - `code_hash` (text) — SHA-256 hash of the 6-digit code, never stored plain
     - `expires_at` (timestamptz) — codes expire after 10 minutes
     - `used` (boolean, default false) — prevents replay attacks
     - `created_at` (timestamptz)

2. Security
   - RLS enabled with NO client-accessible policies.
   - All reads and writes go through edge functions using the service role key.
   - No anon or authenticated client can ever read or write OTP codes directly.

3. Notes
   - Codes are invalidated (used = true) immediately after successful verification.
   - Each new code request also invalidates all previous unused codes for the user.
*/

CREATE TABLE IF NOT EXISTS admin_otp_codes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash  text        NOT NULL,
  expires_at timestamptz NOT NULL,
  used       boolean     NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_otp_user_id ON admin_otp_codes(user_id);

ALTER TABLE admin_otp_codes ENABLE ROW LEVEL SECURITY;
