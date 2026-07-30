/*
# Security Hardening Part 1: Views, Function Search Paths, EXECUTE Revocation

## Summary
Fixes three classes of security issues:
1. Security Definer Views — 2 views changed to SECURITY INVOKER
2. Function Search Path Mutable — ~42 functions given explicit search_path
3. Public/Authenticated EXECUTE on SECURITY DEFINER Functions — revoked from anon on all, from authenticated on non-frontend functions

## Changes

### Views
- `v_ewo_historical_collisions` — set security_invoker = true
- `assessment_questions_public` — set security_invoker = true

### Helper Function
- `is_staff()` — SECURITY DEFINER helper that checks whether the current user has role 'admin' or 'trainer' in profiles. Used by RLS policies in Part 2.

### Function Search Path
All ~42 functions listed in the security report are given `SET search_path = public`.

### EXECUTE Revocation
- Revoke EXECUTE from `anon` on ALL SECURITY DEFINER functions (they should never be callable by unauthenticated users via REST).
- Revoke EXECUTE from `authenticated` on functions NOT called from the frontend via RPC (triggers, internal functions, system functions).
- Keep EXECUTE for `authenticated` on functions called from the frontend via RPC.

## Important Notes
1. Functions called from the frontend via supabase.rpc() keep authenticated EXECUTE: approve_engineering_plan, reject_engineering_plan, generate_execution_ref, execute_migration_plan, resolve_subject_identity, delete_review_and_extensions, delete_migration_plan, initialize_ewo_verification_gates, update_ewo_verification_gate, auto_transition_verified_ewo, get_next_register_number, execute_po_acceptance_closure, calculate_ewo_confidence, get_my_role, get_caller_org_id, get_quiz_token, is_valid_quiz_token.
2. Functions only used as triggers or called from edge functions (service role) have EXECUTE revoked from both anon and authenticated.
3. Edge functions use the service role key which bypasses all permission checks, so they are unaffected.
*/

-- ─── Fix Security Definer Views ──────────────────────────────────────────────

ALTER VIEW public.v_ewo_historical_collisions SET (security_invoker = true);
ALTER VIEW public.assessment_questions_public SET (security_invoker = true);

-- ─── Helper Function for RLS Policies ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'trainer')
  );
$$;

-- Grant EXECUTE only to authenticated (not anon)
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- ─── Fix Function Search Path ──────────────────────────────────────────────────

-- Functions with no arguments
ALTER FUNCTION public.update_billing_updated_at() SET search_path = public;
ALTER FUNCTION public.trigger_billing_on_assessment_complete() SET search_path = public;
ALTER FUNCTION public.uoc_acsf_library_sync_mapping() SET search_path = public;
ALTER FUNCTION public.update_builder_features_updated_at() SET search_path = public;
ALTER FUNCTION public.reset_stale_queue_items() SET search_path = public;
ALTER FUNCTION public.next_agr_number() SET search_path = public;
ALTER FUNCTION public.update_agr_updated_at() SET search_path = public;
ALTER FUNCTION public.update_rcchi_updated_at() SET search_path = public;
ALTER FUNCTION public.upd_tp001_exec_ts() SET search_path = public;
ALTER FUNCTION public.update_ecc_versions_updated_at() SET search_path = public;
ALTER FUNCTION public.set_briefing_ref() SET search_path = public;
ALTER FUNCTION public.get_next_erc_number() SET search_path = public;
ALTER FUNCTION public.invoke_scheduled_briefings() SET search_path = public;
ALTER FUNCTION public.generate_ecr_ref() SET search_path = public;
ALTER FUNCTION public.generate_migration_plan_ref() SET search_path = public;
ALTER FUNCTION public.generate_execution_ref() SET search_path = public;
ALTER FUNCTION public.evs002_update_updated_at() SET search_path = public;
ALTER FUNCTION public.update_eor_timestamp() SET search_path = public;
ALTER FUNCTION public.enforce_ewo_lifecycle_transition() SET search_path = public;
ALTER FUNCTION public.migrate_historical_ewo_closure() SET search_path = public;
ALTER FUNCTION public.generate_canonical_report_body(uuid) SET search_path = public;
ALTER FUNCTION public.update_identity_map_updated_at() SET search_path = public;
ALTER FUNCTION public.update_recovery_packages_updated_at() SET search_path = public;
ALTER FUNCTION public.update_execution_updated_at() SET search_path = public;
ALTER FUNCTION public.prevent_change_log_mutation() SET search_path = public;
ALTER FUNCTION public.atd_connect_capabilities_updated_at() SET search_path = public;

-- Functions with arguments
ALTER FUNCTION public.get_or_create_billing_period(uuid) SET search_path = public;
ALTER FUNCTION public.record_billable_completion(uuid, text, text, text) SET search_path = public;
ALTER FUNCTION public.invoke_queue_processor(text) SET search_path = public;
ALTER FUNCTION public.get_next_register_number(text) SET search_path = public;
ALTER FUNCTION public.execute_migration_plan(uuid, text) SET search_path = public;
ALTER FUNCTION public.resolve_subject_identity(uuid, text) SET search_path = public;
ALTER FUNCTION public.delete_review_and_extensions(uuid) SET search_path = public;
ALTER FUNCTION public.delete_migration_plan(uuid) SET search_path = public;
ALTER FUNCTION public.initialize_ewo_verification_gates(uuid) SET search_path = public;
ALTER FUNCTION public.get_ewo_verification_summary(uuid) SET search_path = public;
ALTER FUNCTION public.validate_ewo_lifecycle_transition(uuid, text) SET search_path = public;
ALTER FUNCTION public.execute_po_acceptance_closure(uuid, text, text, text) SET search_path = public;
ALTER FUNCTION public.auto_transition_verified_ewo(uuid) SET search_path = public;
ALTER FUNCTION public.update_ewo_verification_gate(uuid, text, text, text, text, text, jsonb) SET search_path = public;
ALTER FUNCTION public.calculate_ewo_confidence(uuid) SET search_path = public;
ALTER FUNCTION public.check_ewo_historical_collision(text) SET search_path = public;

-- Also fix SECURITY DEFINER functions that already had search_path but are in the report
ALTER FUNCTION public.check_profile_role_unchanged() SET search_path = public;
ALTER FUNCTION public.ewo_lifecycle_automation_trigger() SET search_path = public;
ALTER FUNCTION public.get_caller_org_id() SET search_path = public;
ALTER FUNCTION public.get_my_role() SET search_path = public;
ALTER FUNCTION public.get_quiz_token() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.is_valid_quiz_token(uuid) SET search_path = public;
ALTER FUNCTION public.approve_engineering_plan(uuid, uuid, text, text, text, integer) SET search_path = public;
ALTER FUNCTION public.reject_engineering_plan(uuid, uuid, text, text, text, integer) SET search_path = public;

-- ─── Revoke EXECUTE from anon on ALL SECURITY DEFINER functions ────────────────

REVOKE EXECUTE ON FUNCTION public.approve_engineering_plan(uuid, uuid, text, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_transition_verified_ewo(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_ewo_confidence(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_ewo_historical_collision(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_profile_role_unchanged() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_ewo_lifecycle_transition() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ewo_lifecycle_automation_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.execute_po_acceptance_closure(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_canonical_report_body(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_execution_ref() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_caller_org_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ewo_verification_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_next_register_number(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_or_create_billing_period(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_quiz_token() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.initialize_ewo_verification_gates(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.invoke_queue_processor(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.invoke_scheduled_briefings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_valid_quiz_token(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.migrate_historical_ewo_closure() FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_billable_completion(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_engineering_plan(uuid, uuid, text, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_stale_queue_items() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_billing_on_assessment_complete() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_ewo_verification_gate(uuid, text, text, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_ewo_lifecycle_transition(uuid, text) FROM anon;

-- ─── Revoke EXECUTE from authenticated on non-frontend functions ──────────────
-- These are only used as triggers or called from edge functions (service role)

REVOKE EXECUTE ON FUNCTION public.check_profile_role_unchanged() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_ewo_lifecycle_transition() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ewo_lifecycle_automation_trigger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_canonical_report_body(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ewo_verification_summary(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_queue_processor(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_scheduled_briefings() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.migrate_historical_ewo_closure() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_billable_completion(uuid, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_stale_queue_items() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_billing_on_assessment_complete() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_ewo_lifecycle_transition(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_ewo_historical_collision(text) FROM authenticated;
