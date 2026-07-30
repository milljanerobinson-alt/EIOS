/*
# Security Hardening: Search Path, RLS Policies, and RPC Execute Permissions

## Summary
This migration addresses three categories of security vulnerabilities identified by
the database security scanner:

1. **Function Search Path Mutable** — 7 functions had role-mutable search_path,
   allowing search_path hijacking attacks. Fixed by setting `search_path = public, extensions`
   on all SECURITY DEFINER functions.

2. **RLS Policy Always True** — 13 tables had DELETE/INSERT/UPDATE policies with
   `USING (true)` or `WITH CHECK (true)`, effectively bypassing row-level security.
   These were replaced with `is_staff()` checks so only staff users can modify
   engineering governance data. SELECT policies remain public (intentional — these
   are shared engineering tables). Edge functions use the service_role key which
   bypasses RLS entirely, so they are unaffected.

3. **Public Can Execute SECURITY DEFINER Functions** — 15 functions that are only
   called by triggers, cron jobs, or internal database logic had EXECUTE permissions
   granted to `anon` and `authenticated`, making them callable via the REST API.
   EXECUTE has been revoked for these internal-only functions. Functions called
   from the frontend or edge functions retain their EXECUTE permissions.

4. **RLS Enabled No Policy** — `po_acceptance_governance_tokens` had RLS enabled
   but no policies. A SELECT policy for staff has been added.

## Tables Modified (RLS Policies)
- atd_conversation_active_objects — write policies tightened to is_staff()
- cc_post_ai_diagnostics — write policies tightened to is_staff()
- codex_budget_config — write policies tightened to is_staff()
- codex_execution_attempts — write policies tightened to is_staff()
- codex_provider_credentials — write policies tightened to is_staff()
- codex_provider_health — write policies tightened to is_staff()
- codex_trial_metrics — write policies tightened to is_staff()
- engineering_plans — write policies tightened to is_staff()
- execution_budget_controls — write policies tightened to is_staff()
- execution_handoff_audit — write policies tightened to is_staff()
- execution_handoff_requests — write policies tightened to is_staff()
- execution_provider_policy — write policies tightened to is_staff()
- po_acceptance_governance_log — insert policy tightened to is_staff()
- po_acceptance_governance_tokens — new SELECT policy added

## Functions Modified (Search Path)
All 40 SECURITY DEFINER functions in the public schema have been updated with
`SET search_path = public, extensions` to prevent search_path manipulation attacks.

## Functions with EXECUTE Revoked (Internal/Trigger Only)
- check_ewo_historical_collision
- check_profile_role_unchanged (trigger)
- enforce_ewo_lifecycle_transition (trigger)
- ewo_lifecycle_automation_trigger (trigger)
- generate_canonical_report_body
- get_or_create_billing_period
- handle_new_user (trigger)
- invoke_queue_processor (cron)
- invoke_scheduled_briefings (cron)
- migrate_historical_ewo_closure
- protect_po_acceptance_fields (trigger)
- record_billable_completion
- reset_stale_queue_items (cron)
- trigger_billing_on_assessment_complete (trigger)
- validate_ewo_lifecycle_transition

## Important Notes
1. Functions called from the frontend (via anon key) or edge functions (via user JWT)
   retain EXECUTE permissions. These include approve_engineering_plan,
   approve_ewo_for_execution, inspect_* functions, etc.
2. RLS helper functions (is_staff, get_my_role, get_caller_org_id, get_quiz_token,
   is_valid_quiz_token) retain EXECUTE permissions because RLS policies call them.
3. SELECT policies on all affected tables remain `USING (true)` — this is intentional
   because these are shared engineering governance tables that staff need to read.
4. The "Leaked Password Protection" finding is a Supabase Auth project setting that
   must be enabled in the Supabase dashboard — it cannot be fixed via SQL migration.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: Fix Function Search Path on ALL SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.approve_engineering_plan(uuid, uuid, text, text, text, integer) SET search_path = public, extensions;
ALTER FUNCTION public.approve_ewo_for_execution(text, text, text, text, text) SET search_path = public, extensions;
ALTER FUNCTION public.auto_transition_verified_ewo(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.calculate_ewo_confidence(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.check_ewo_historical_collision(text) SET search_path = public, extensions;
ALTER FUNCTION public.check_profile_role_unchanged() SET search_path = public, extensions;
ALTER FUNCTION public.enforce_ewo_lifecycle_transition() SET search_path = public, extensions;
ALTER FUNCTION public.ewo_lifecycle_automation_trigger() SET search_path = public, extensions;
ALTER FUNCTION public.execute_po_acceptance_closure(uuid, text, text, text) SET search_path = public, extensions;
ALTER FUNCTION public.execute_supervised_pipeline(text, text) SET search_path = public, extensions;
ALTER FUNCTION public.generate_canonical_report_body(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.generate_execution_ref() SET search_path = public, extensions;
ALTER FUNCTION public.get_caller_org_id() SET search_path = public, extensions;
ALTER FUNCTION public.get_ewo_verification_summary(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.get_my_role() SET search_path = public, extensions;
ALTER FUNCTION public.get_next_register_number(text) SET search_path = public, extensions;
ALTER FUNCTION public.get_or_create_billing_period(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.get_quiz_token() SET search_path = public, extensions;
ALTER FUNCTION public.grant_governed_product_owner_acceptance(text, text, text, text, text, text, text, text, boolean, boolean) SET search_path = public, extensions;
ALTER FUNCTION public.handle_new_user() SET search_path = public, extensions;
ALTER FUNCTION public.initialize_ewo_verification_gates(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.inspect_ewo_acceptance_state(text) SET search_path = public, extensions;
ALTER FUNCTION public.inspect_ewo_execution_state(text) SET search_path = public, extensions;
ALTER FUNCTION public.inspect_execution_handoff(text, text) SET search_path = public, extensions;
ALTER FUNCTION public.inspect_execution_provider_policy(text) SET search_path = public, extensions;
ALTER FUNCTION public.invoke_queue_processor(text) SET search_path = public, extensions;
ALTER FUNCTION public.invoke_scheduled_briefings() SET search_path = public, extensions;
ALTER FUNCTION public.is_staff() SET search_path = public, extensions;
ALTER FUNCTION public.is_valid_quiz_token(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.migrate_historical_ewo_closure() SET search_path = public, extensions;
ALTER FUNCTION public.prepare_engineering_analysis(text, text) SET search_path = public, extensions;
ALTER FUNCTION public.prepare_engineering_plan(text, text) SET search_path = public, extensions;
ALTER FUNCTION public.protect_po_acceptance_fields() SET search_path = public, extensions;
ALTER FUNCTION public.record_billable_completion(uuid, text, text, text) SET search_path = public, extensions;
ALTER FUNCTION public.reject_engineering_plan(uuid, uuid, text, text, text, integer) SET search_path = public, extensions;
ALTER FUNCTION public.reset_stale_queue_items() SET search_path = public, extensions;
ALTER FUNCTION public.set_governed_execution_provider_policy(text, text, jsonb, text, boolean, text, text, text) SET search_path = public, extensions;
ALTER FUNCTION public.trigger_billing_on_assessment_complete() SET search_path = public, extensions;
ALTER FUNCTION public.update_ewo_verification_gate(uuid, text, text, text, text, text, jsonb) SET search_path = public, extensions;
ALTER FUNCTION public.validate_ewo_lifecycle_transition(uuid, text) SET search_path = public, extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: Revoke EXECUTE on internal/trigger-only SECURITY DEFINER functions
-- These are NOT called from the frontend or edge functions via anon/authenticated
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.check_ewo_historical_collision(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_profile_role_unchanged() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_ewo_lifecycle_transition() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ewo_lifecycle_automation_trigger() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_canonical_report_body(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_billing_period(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_queue_processor(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_scheduled_briefings() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.migrate_historical_ewo_closure() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_po_acceptance_fields() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_billable_completion(uuid, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_stale_queue_items() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_billing_on_assessment_complete() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_ewo_lifecycle_transition(uuid, text) FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3: Fix RLS Policies that are Always True
-- Replace USING(true)/WITH CHECK(true) on write policies with is_staff()
-- ═══════════════════════════════════════════════════════════════════════════

-- ── atd_conversation_active_objects ──
DROP POLICY IF EXISTS "anon_delete_active_objects" ON atd_conversation_active_objects;
CREATE POLICY "anon_delete_active_objects" ON atd_conversation_active_objects
  FOR DELETE TO anon, authenticated USING (is_staff());

DROP POLICY IF EXISTS "anon_insert_active_objects" ON atd_conversation_active_objects;
CREATE POLICY "anon_insert_active_objects" ON atd_conversation_active_objects
  FOR INSERT TO anon, authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "anon_update_active_objects" ON atd_conversation_active_objects;
CREATE POLICY "anon_update_active_objects" ON atd_conversation_active_objects
  FOR UPDATE TO anon, authenticated USING (is_staff()) WITH CHECK (is_staff());

-- ── cc_post_ai_diagnostics ──
DROP POLICY IF EXISTS "anon_delete_post_ai_diagnostics" ON cc_post_ai_diagnostics;
CREATE POLICY "anon_delete_post_ai_diagnostics" ON cc_post_ai_diagnostics
  FOR DELETE TO anon, authenticated USING (is_staff());

DROP POLICY IF EXISTS "anon_insert_post_ai_diagnostics" ON cc_post_ai_diagnostics;
CREATE POLICY "anon_insert_post_ai_diagnostics" ON cc_post_ai_diagnostics
  FOR INSERT TO anon, authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "anon_update_post_ai_diagnostics" ON cc_post_ai_diagnostics;
CREATE POLICY "anon_update_post_ai_diagnostics" ON cc_post_ai_diagnostics
  FOR UPDATE TO anon, authenticated USING (is_staff()) WITH CHECK (is_staff());

-- ── codex_budget_config ──
DROP POLICY IF EXISTS "auth_delete_codex_budget" ON codex_budget_config;
CREATE POLICY "auth_delete_codex_budget" ON codex_budget_config
  FOR DELETE TO authenticated USING (is_staff());

DROP POLICY IF EXISTS "auth_insert_codex_budget" ON codex_budget_config;
CREATE POLICY "auth_insert_codex_budget" ON codex_budget_config
  FOR INSERT TO authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_update_codex_budget" ON codex_budget_config;
CREATE POLICY "auth_update_codex_budget" ON codex_budget_config
  FOR UPDATE TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- ── codex_execution_attempts ──
DROP POLICY IF EXISTS "auth_delete_codex_attempts" ON codex_execution_attempts;
CREATE POLICY "auth_delete_codex_attempts" ON codex_execution_attempts
  FOR DELETE TO authenticated USING (is_staff());

DROP POLICY IF EXISTS "auth_insert_codex_attempts" ON codex_execution_attempts;
CREATE POLICY "auth_insert_codex_attempts" ON codex_execution_attempts
  FOR INSERT TO authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_update_codex_attempts" ON codex_execution_attempts;
CREATE POLICY "auth_update_codex_attempts" ON codex_execution_attempts
  FOR UPDATE TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- ── codex_provider_credentials ──
DROP POLICY IF EXISTS "auth_delete_codex_credentials" ON codex_provider_credentials;
CREATE POLICY "auth_delete_codex_credentials" ON codex_provider_credentials
  FOR DELETE TO authenticated USING (is_staff());

DROP POLICY IF EXISTS "auth_insert_codex_credentials" ON codex_provider_credentials;
CREATE POLICY "auth_insert_codex_credentials" ON codex_provider_credentials
  FOR INSERT TO authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_update_codex_credentials" ON codex_provider_credentials;
CREATE POLICY "auth_update_codex_credentials" ON codex_provider_credentials
  FOR UPDATE TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- ── codex_provider_health ──
DROP POLICY IF EXISTS "auth_delete_codex_health" ON codex_provider_health;
CREATE POLICY "auth_delete_codex_health" ON codex_provider_health
  FOR DELETE TO authenticated USING (is_staff());

DROP POLICY IF EXISTS "auth_insert_codex_health" ON codex_provider_health;
CREATE POLICY "auth_insert_codex_health" ON codex_provider_health
  FOR INSERT TO authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_update_codex_health" ON codex_provider_health;
CREATE POLICY "auth_update_codex_health" ON codex_provider_health
  FOR UPDATE TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- ── codex_trial_metrics ──
DROP POLICY IF EXISTS "auth_delete_codex_trial" ON codex_trial_metrics;
CREATE POLICY "auth_delete_codex_trial" ON codex_trial_metrics
  FOR DELETE TO authenticated USING (is_staff());

DROP POLICY IF EXISTS "auth_insert_codex_trial" ON codex_trial_metrics;
CREATE POLICY "auth_insert_codex_trial" ON codex_trial_metrics
  FOR INSERT TO authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "auth_update_codex_trial" ON codex_trial_metrics;
CREATE POLICY "auth_update_codex_trial" ON codex_trial_metrics
  FOR UPDATE TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- ── engineering_plans ──
DROP POLICY IF EXISTS "anon_delete_engineering_plans" ON engineering_plans;
CREATE POLICY "anon_delete_engineering_plans" ON engineering_plans
  FOR DELETE TO anon, authenticated USING (is_staff());

DROP POLICY IF EXISTS "anon_insert_engineering_plans" ON engineering_plans;
CREATE POLICY "anon_insert_engineering_plans" ON engineering_plans
  FOR INSERT TO anon, authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "anon_update_engineering_plans" ON engineering_plans;
CREATE POLICY "anon_update_engineering_plans" ON engineering_plans
  FOR UPDATE TO anon, authenticated USING (is_staff()) WITH CHECK (is_staff());

-- ── execution_budget_controls ──
DROP POLICY IF EXISTS "anon_delete_budget_controls" ON execution_budget_controls;
CREATE POLICY "anon_delete_budget_controls" ON execution_budget_controls
  FOR DELETE TO anon, authenticated USING (is_staff());

DROP POLICY IF EXISTS "anon_insert_budget_controls" ON execution_budget_controls;
CREATE POLICY "anon_insert_budget_controls" ON execution_budget_controls
  FOR INSERT TO anon, authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "anon_update_budget_controls" ON execution_budget_controls;
CREATE POLICY "anon_update_budget_controls" ON execution_budget_controls
  FOR UPDATE TO anon, authenticated USING (is_staff()) WITH CHECK (is_staff());

-- ── execution_handoff_audit ──
DROP POLICY IF EXISTS "anon_delete_handoff_audit" ON execution_handoff_audit;
CREATE POLICY "anon_delete_handoff_audit" ON execution_handoff_audit
  FOR DELETE TO anon, authenticated USING (is_staff());

DROP POLICY IF EXISTS "anon_insert_handoff_audit" ON execution_handoff_audit;
CREATE POLICY "anon_insert_handoff_audit" ON execution_handoff_audit
  FOR INSERT TO anon, authenticated WITH CHECK (is_staff());

-- ── execution_handoff_requests ──
DROP POLICY IF EXISTS "anon_delete_handoff_requests" ON execution_handoff_requests;
CREATE POLICY "anon_delete_handoff_requests" ON execution_handoff_requests
  FOR DELETE TO anon, authenticated USING (is_staff());

DROP POLICY IF EXISTS "anon_insert_handoff_requests" ON execution_handoff_requests;
CREATE POLICY "anon_insert_handoff_requests" ON execution_handoff_requests
  FOR INSERT TO anon, authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "anon_update_handoff_requests" ON execution_handoff_requests;
CREATE POLICY "anon_update_handoff_requests" ON execution_handoff_requests
  FOR UPDATE TO anon, authenticated USING (is_staff()) WITH CHECK (is_staff());

-- ── execution_provider_policy ──
DROP POLICY IF EXISTS "anon_insert_provider_policy" ON execution_provider_policy;
CREATE POLICY "anon_insert_provider_policy" ON execution_provider_policy
  FOR INSERT TO anon, authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "anon_update_provider_policy" ON execution_provider_policy;
CREATE POLICY "anon_update_provider_policy" ON execution_provider_policy
  FOR UPDATE TO anon, authenticated USING (is_staff()) WITH CHECK (is_staff());

-- ── po_acceptance_governance_log ──
DROP POLICY IF EXISTS "anon_insert_po_acceptance_log" ON po_acceptance_governance_log;
CREATE POLICY "anon_insert_po_acceptance_log" ON po_acceptance_governance_log
  FOR INSERT TO anon, authenticated WITH CHECK (is_staff());

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4: Add missing SELECT policy on po_acceptance_governance_tokens
-- RLS was enabled but no policies existed — table was completely inaccessible
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "anon_select_po_acceptance_tokens" ON po_acceptance_governance_tokens;
CREATE POLICY "anon_select_po_acceptance_tokens" ON po_acceptance_governance_tokens
  FOR SELECT TO anon, authenticated USING (is_staff());
