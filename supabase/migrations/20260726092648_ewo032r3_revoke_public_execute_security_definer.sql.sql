-- EWO-032R.3 Security Hardening: Revoke PUBLIC EXECUTE on SECURITY DEFINER functions
--
-- Supabase grants EXECUTE to PUBLIC by default, which includes the anon role.
-- Revoke from PUBLIC, then grant only to authenticated (and service_role which
-- bypasses grants anyway). Quiz-token helpers are preserved with anon access.

-- ── Business-logic functions: revoke PUBLIC, grant authenticated ──
REVOKE EXECUTE ON FUNCTION public.approve_engineering_plan(uuid, uuid, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_ewo_for_execution(text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_transition_verified_ewo(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_ewo_confidence(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_po_acceptance_closure(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_supervised_pipeline(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_execution_ref() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_next_register_number(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_governed_product_owner_acceptance(text, text, text, text, text, text, text, text, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.initialize_ewo_verification_gates(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inspect_ewo_acceptance_state(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inspect_ewo_execution_state(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inspect_execution_handoff(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inspect_execution_provider_policy(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prepare_engineering_analysis(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prepare_engineering_plan(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_engineering_plan(uuid, uuid, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_governed_execution_provider_policy(text, text, jsonb, text, boolean, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_ewo_verification_gate(uuid, text, text, text, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.approve_engineering_plan(uuid, uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_ewo_for_execution(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_transition_verified_ewo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_ewo_confidence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_po_acceptance_closure(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_supervised_pipeline(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_execution_ref() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_register_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_governed_product_owner_acceptance(text, text, text, text, text, text, text, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_ewo_verification_gates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_ewo_acceptance_state(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_ewo_execution_state(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_execution_handoff(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_execution_provider_policy(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_engineering_analysis(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_engineering_plan(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_engineering_plan(uuid, uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_governed_execution_provider_policy(text, text, jsonb, text, boolean, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ewo_verification_gate(uuid, text, text, text, text, text, jsonb) TO authenticated;

-- ── RLS-helper functions: revoke PUBLIC, grant authenticated ──
-- get_my_role, is_staff, get_caller_org_id are used in admin/trainer RLS policies
-- that anon users should never satisfy. Revoking PUBLIC means anon gets a
-- permission error instead of empty rows — equivalent deny, no data leaked.
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_caller_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_caller_org_id() TO authenticated;

-- ── Quiz-token RLS helpers: keep anon (needed for quiz access via tokens) ──
-- get_quiz_token() and is_valid_quiz_token() are intentionally executable by
-- anon because quiz invitations are accessed without authentication via tokens.
-- No change needed — these are intentional SECURITY DEFINER functions.

-- ── get_ewo_verification_summary: appears unused, revoke from PUBLIC ──
REVOKE EXECUTE ON FUNCTION public.get_ewo_verification_summary(uuid) FROM PUBLIC;
