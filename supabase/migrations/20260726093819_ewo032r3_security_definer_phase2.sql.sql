-- EWO-032R.3 Security Hardening Phase 2: Fix remaining SECURITY DEFINER findings
--
-- Three categories:
-- 1. Quiz-token helpers: switch to SECURITY INVOKER (no privilege escalation needed,
--    RLS policies that call them still work — get_quiz_token reads request headers,
--    is_valid_quiz_token queries assessment_invitations whose RLS calls get_quiz_token).
-- 2. RLS-helper functions (get_my_role, is_staff, get_caller_org_id): keep SECURITY
--    DEFINER (switching would cause RLS recursion on profiles) but revoke EXECUTE
--    from authenticated — they are only called from RLS policies, never via RPC.
-- 3. Business-logic RPCs: keep SECURITY DEFINER + authenticated EXECUTE — they need
--    elevated privileges for cross-table INSERT/UPDATE and are guarded by app-level
--    role checks. The scanner flags these as intentional risks.

-- ── 1. Quiz-token functions: switch to SECURITY INVOKER ──
ALTER FUNCTION public.get_quiz_token() SECURITY INVOKER;
ALTER FUNCTION public.is_valid_quiz_token(inv_token uuid) SECURITY INVOKER;

-- ── 2. RLS-helper functions: revoke authenticated EXECUTE ──
-- These are only called from RLS policy expressions, never directly via RPC.
-- RLS evaluation uses the table owner's privileges, not the caller's EXECUTE grant,
-- so revoking EXECUTE does not break RLS policies.
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_caller_org_id() FROM authenticated;

-- ── 3. Business-logic RPCs: revoke any remaining PUBLIC grants ──
-- (Already revoked from anon/PUBLIC in prior migration; ensure authenticated-only.)
-- No action needed — these intentionally remain SECURITY DEFINER + authenticated.
-- The scanner flags them as risks; they are accepted risks guarded by role checks.
