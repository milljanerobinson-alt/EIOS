-- EWO-032R.3 Security Hardening Phase 3: Switch business-logic RPCs to SECURITY INVOKER
--
-- Strategy:
-- 1. Switch is_staff() and get_caller_org_id() to INVOKER and re-grant EXECUTE.
--    - is_staff() queries profiles WHERE id = auth.uid() — user can read own row via profiles_select_own. No recursion.
--    - get_caller_org_id() just returns NULL::uuid — no table access.
-- 2. Add missing RLS INSERT/UPDATE policies so INVOKER functions can write.
-- 3. Switch all 18 business-logic RPCs to SECURITY INVOKER.
--    RLS policies on each table enforce is_staff() or org-ownership checks.

-- ── 1. Helper functions: switch to INVOKER and re-grant EXECUTE ──
ALTER FUNCTION public.is_staff() SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

ALTER FUNCTION public.get_caller_org_id() SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.get_caller_org_id() TO authenticated;

-- ── 2. Add missing RLS INSERT/UPDATE policies ──

-- atd_plan_governance_decisions: needs INSERT (org-scoped, matching existing SELECT)
CREATE POLICY "auth_insert_governance_decisions"
  ON public.atd_plan_governance_decisions FOR INSERT
  TO authenticated
  WITH CHECK ((organisation_id IS NULL) OR (organisation_id = get_caller_org_id()));

-- ecc_register_sequences: needs UPDATE (is_staff)
CREATE POLICY "anon_update_sequences"
  ON public.ecc_register_sequences FOR UPDATE
  TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- engineering_records_library: needs UPDATE (is_staff)
CREATE POLICY "auth_update_erl"
  ON public.engineering_records_library FOR UPDATE
  TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- po_acceptance_governance_tokens: needs INSERT and UPDATE (is_staff)
CREATE POLICY "anon_insert_po_acceptance_tokens"
  ON public.po_acceptance_governance_tokens FOR INSERT
  TO authenticated
  WITH CHECK (is_staff());

CREATE POLICY "anon_update_po_acceptance_tokens"
  ON public.po_acceptance_governance_tokens FOR UPDATE
  TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- ── 3. Switch all 18 business-logic RPCs to SECURITY INVOKER ──
ALTER FUNCTION public.approve_engineering_plan(
  p_plan_id uuid, p_intent_id uuid, p_decided_by text,
  p_notes text, p_conditions text, p_expected_version integer
) SECURITY INVOKER;

ALTER FUNCTION public.reject_engineering_plan(
  p_plan_id uuid, p_intent_id uuid, p_rejection_reason text,
  p_decided_by text, p_notes text, p_expected_version integer
) SECURITY INVOKER;

ALTER FUNCTION public.approve_ewo_for_execution(
  p_ewo_ref text, p_approved_by text, p_decision text,
  p_approval_statement text, p_provider_preference text
) SECURITY INVOKER;

ALTER FUNCTION public.execute_po_acceptance_closure(
  p_ewo_id uuid, p_accepted_by text,
  p_acceptance_statement text, p_acceptance_notes text
) SECURITY INVOKER;

ALTER FUNCTION public.execute_supervised_pipeline(
  p_ewo_ref text, p_preferred_provider text
) SECURITY INVOKER;

ALTER FUNCTION public.grant_governed_product_owner_acceptance(
  p_ewo_ref text, p_po_identity text, p_po_decision text,
  p_live_test_result_ref text, p_acceptance_command_ref text,
  p_source_conversation_ref text, p_audit_ref text,
  p_acceptance_statement text, p_explicit_lifecycle_change boolean,
  p_unresolved_blockers boolean
) SECURITY INVOKER;

ALTER FUNCTION public.prepare_engineering_analysis(
  p_ewo_ref text, p_prepared_by text
) SECURITY INVOKER;

ALTER FUNCTION public.prepare_engineering_plan(
  p_ewo_ref text, p_prepared_by text
) SECURITY INVOKER;

ALTER FUNCTION public.set_governed_execution_provider_policy(
  p_preferred_provider_id text, p_default_provider_id text,
  p_allowed_provider_ids jsonb, p_fallback_provider_id text,
  p_fallback_permitted boolean, p_updated_by text,
  p_reason text, p_linked_ewo_ref text
) SECURITY INVOKER;

ALTER FUNCTION public.initialize_ewo_verification_gates(
  p_ewo_id uuid
) SECURITY INVOKER;

ALTER FUNCTION public.update_ewo_verification_gate(
  p_ewo_id uuid, p_gate_key text, p_status text,
  p_evidence_summary text, p_failure_reason text,
  p_verified_by text, p_evidence_artefacts jsonb
) SECURITY INVOKER;

ALTER FUNCTION public.auto_transition_verified_ewo(
  p_ewo_id uuid
) SECURITY INVOKER;

ALTER FUNCTION public.calculate_ewo_confidence(
  p_ewo_id uuid
) SECURITY INVOKER;

ALTER FUNCTION public.generate_execution_ref() SECURITY INVOKER;

ALTER FUNCTION public.get_next_register_number(
  p_type text
) SECURITY INVOKER;

ALTER FUNCTION public.inspect_ewo_acceptance_state(
  p_ewo_ref text
) SECURITY INVOKER;

ALTER FUNCTION public.inspect_ewo_execution_state(
  p_ewo_ref text
) SECURITY INVOKER;

ALTER FUNCTION public.inspect_execution_handoff(
  p_ewo_ref text, p_conversation_id text
) SECURITY INVOKER;

ALTER FUNCTION public.inspect_execution_provider_policy(
  p_ewo_ref text
) SECURITY INVOKER;
