/*
# Security Hardening Part 3: admin_otp_codes RLS

## admin_otp_codes
Table has RLS enabled but no policies. Add owner-scoped policies:
- SELECT: user can only see their own OTP codes
- UPDATE: user can only update their own codes (mark as used)
- INSERT/DELETE: service role only (edge functions) — bypasses RLS, no user-level policy needed
*/

-- ─── admin_otp_codes RLS policies ────────────────────────────────────────────

CREATE POLICY "admin_otp_select_own" ON public.admin_otp_codes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "admin_otp_update_own" ON public.admin_otp_codes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
