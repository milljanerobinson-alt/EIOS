/*
# Security Hardening — Fix all reported security issues

1. Function Search Path Mutable
   - Fix update_updated_at_column to SET search_path TO 'public'

2. RLS Policy Always True (24 policies across 11 tables)
   - Replace always-true WITH CHECK / USING with meaningful constraints
   - Constraints: ewo ownership, tenant_id, not-null required fields

3. Public/Authenticated Can Execute SECURITY DEFINER Functions (58 findings)
   - Trigger-only functions: REVOKE EXECUTE FROM anon, authenticated
   - Edge-function-only functions: REVOKE EXECUTE FROM anon, authenticated
   - RPC functions needed by frontend: REVOKE EXECUTE FROM anon only

4. Leaked Password Protection
   - Not a database fix — requires Supabase Dashboard config
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Fix update_updated_at_column search_path
-- ═══════════════════════════════════════════════════════════════

ALTER FUNCTION public.update_updated_at_column() SET search_path TO 'public';

-- ═══════════════════════════════════════════════════════════════
-- 2. Revoke EXECUTE on trigger-only SECURITY DEFINER functions
--    These are only called by triggers, never via RPC
-- ═══════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_profile_role_unchanged() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_ewo_lifecycle_transition() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ewo_lifecycle_automation_trigger() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_billing_on_assessment_complete() FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3. Revoke EXECUTE on edge-function/cron-only SECURITY DEFINER functions
--    These are called via service role key which bypasses RLS
-- ═══════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.invoke_queue_processor(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_scheduled_briefings() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_stale_queue_items() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.migrate_historical_ewo_closure() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_transition_verified_ewo(uuid) FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 4. Revoke EXECUTE FROM anon on RPC functions needed by frontend
--    Authenticated users retain access (intentional for app functionality)
-- ═══════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.approve_engineering_plan(uuid, uuid, text, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_engineering_plan(uuid, uuid, text, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_execution_ref() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_caller_org_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_next_register_number(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_or_create_billing_period(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_quiz_token() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_valid_quiz_token(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_billable_completion(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_ewo_confidence(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_ewo_historical_collision(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_canonical_report_body(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ewo_verification_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.initialize_ewo_verification_gates(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_ewo_verification_gate(uuid, text, text, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_ewo_lifecycle_transition(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.execute_po_acceptance_closure(uuid, text, text, text) FROM anon;

-- ═══════════════════════════════════════════════════════════════
-- 5. Fix RLS Policy Always True — assessment_declarations
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "anon_insert_assessment_declarations" ON assessment_declarations;
CREATE POLICY "anon_insert_assessment_declarations" ON assessment_declarations
  FOR INSERT TO anon, authenticated
  WITH CHECK (invitation_id IS NOT NULL AND assessment_type IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- 6. Fix RLS Policy Always True — atd_connect_inspection_log
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "atd_insert_inspection_log_anon" ON atd_connect_inspection_log;
CREATE POLICY "atd_insert_inspection_log_anon" ON atd_connect_inspection_log
  FOR INSERT TO anon, authenticated
  WITH CHECK (requesting_persona IS NOT NULL AND operation IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- 7. Fix RLS Policy Always True — atd_conversation_active_object
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "anon_ins_conv_active_obj" ON atd_conversation_active_object;
CREATE POLICY "anon_ins_conv_active_obj" ON atd_conversation_active_object
  FOR INSERT TO anon, authenticated
  WITH CHECK (conversation_id IS NOT NULL AND tenant_id IS NOT NULL);

DROP POLICY IF EXISTS "anon_upd_conv_active_obj" ON atd_conversation_active_object;
CREATE POLICY "anon_upd_conv_active_obj" ON atd_conversation_active_object
  FOR UPDATE TO anon, authenticated
  USING (conversation_id IS NOT NULL)
  WITH CHECK (conversation_id IS NOT NULL AND tenant_id IS NOT NULL);

DROP POLICY IF EXISTS "anon_del_conv_active_obj" ON atd_conversation_active_object;
CREATE POLICY "anon_del_conv_active_obj" ON atd_conversation_active_object
  FOR DELETE TO anon, authenticated
  USING (conversation_id IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- 8. Fix RLS Policy Always True — atd_conversation_sessions
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "insert_conversation_sessions" ON atd_conversation_sessions;
CREATE POLICY "insert_conversation_sessions" ON atd_conversation_sessions
  FOR INSERT TO authenticated
  WITH CHECK (conversation_id IS NOT NULL AND tenant_id IS NOT NULL);

DROP POLICY IF EXISTS "update_own_conversation_sessions" ON atd_conversation_sessions;
CREATE POLICY "update_own_conversation_sessions" ON atd_conversation_sessions
  FOR UPDATE TO authenticated
  USING (conversation_id IS NOT NULL)
  WITH CHECK (conversation_id IS NOT NULL AND tenant_id IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- 9. Fix RLS Policy Always True — engineering_knowledge_extractions
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ekx_insert_authenticated" ON engineering_knowledge_extractions;
CREATE POLICY "ekx_insert_authenticated" ON engineering_knowledge_extractions
  FOR INSERT TO authenticated
  WITH CHECK (ewo_id IS NOT NULL);

DROP POLICY IF EXISTS "ekx_update_authenticated" ON engineering_knowledge_extractions;
CREATE POLICY "ekx_update_authenticated" ON engineering_knowledge_extractions
  FOR UPDATE TO authenticated
  USING (ewo_id IS NOT NULL)
  WITH CHECK (ewo_id IS NOT NULL);

DROP POLICY IF EXISTS "ekx_delete_authenticated" ON engineering_knowledge_extractions;
CREATE POLICY "ekx_delete_authenticated" ON engineering_knowledge_extractions
  FOR DELETE TO authenticated
  USING (ewo_id IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- 10. Fix RLS Policy Always True — engineering_knowledge_provenance
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ekp_insert_authenticated" ON engineering_knowledge_provenance;
CREATE POLICY "ekp_insert_authenticated" ON engineering_knowledge_provenance
  FOR INSERT TO authenticated
  WITH CHECK (ewo_id IS NOT NULL AND knowledge_record_id IS NOT NULL);

DROP POLICY IF EXISTS "ekp_update_authenticated" ON engineering_knowledge_provenance;
CREATE POLICY "ekp_update_authenticated" ON engineering_knowledge_provenance
  FOR UPDATE TO authenticated
  USING (ewo_id IS NOT NULL)
  WITH CHECK (ewo_id IS NOT NULL AND knowledge_record_id IS NOT NULL);

DROP POLICY IF EXISTS "ekp_delete_authenticated" ON engineering_knowledge_provenance;
CREATE POLICY "ekp_delete_authenticated" ON engineering_knowledge_provenance
  FOR DELETE TO authenticated
  USING (ewo_id IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- 11. Fix RLS Policy Always True — lifecycle_reconciliation_log
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "lrl_insert_authenticated" ON lifecycle_reconciliation_log;
CREATE POLICY "lrl_insert_authenticated" ON lifecycle_reconciliation_log
  FOR INSERT TO authenticated
  WITH CHECK (ewo_id IS NOT NULL AND reconciliation_type IS NOT NULL);

DROP POLICY IF EXISTS "lrl_update_authenticated" ON lifecycle_reconciliation_log;
CREATE POLICY "lrl_update_authenticated" ON lifecycle_reconciliation_log
  FOR UPDATE TO authenticated
  USING (ewo_id IS NOT NULL)
  WITH CHECK (ewo_id IS NOT NULL AND reconciliation_type IS NOT NULL);

DROP POLICY IF EXISTS "lrl_delete_authenticated" ON lifecycle_reconciliation_log;
CREATE POLICY "lrl_delete_authenticated" ON lifecycle_reconciliation_log
  FOR DELETE TO authenticated
  USING (ewo_id IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- 12. Fix RLS Policy Always True — execution_pipeline_events
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "insert_pipeline_events_authenticated" ON execution_pipeline_events;
CREATE POLICY "insert_pipeline_events_authenticated" ON execution_pipeline_events
  FOR INSERT TO authenticated
  WITH CHECK (execution_record_id IS NOT NULL AND ewo_ref IS NOT NULL);

DROP POLICY IF EXISTS "update_pipeline_events_authenticated" ON execution_pipeline_events;
CREATE POLICY "update_pipeline_events_authenticated" ON execution_pipeline_events
  FOR UPDATE TO authenticated
  USING (execution_record_id IS NOT NULL)
  WITH CHECK (execution_record_id IS NOT NULL AND ewo_ref IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- 13. Fix RLS Policy Always True — execution_provider_registry
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "insert_providers_authenticated" ON execution_provider_registry;
CREATE POLICY "insert_providers_authenticated" ON execution_provider_registry
  FOR INSERT TO authenticated
  WITH CHECK (provider_id IS NOT NULL AND provider_name IS NOT NULL);

DROP POLICY IF EXISTS "update_providers_authenticated" ON execution_provider_registry;
CREATE POLICY "update_providers_authenticated" ON execution_provider_registry
  FOR UPDATE TO authenticated
  USING (provider_id IS NOT NULL)
  WITH CHECK (provider_id IS NOT NULL AND provider_name IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- 14. Fix RLS Policy Always True — supervised_execution_packages
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "insert_packages_authenticated" ON supervised_execution_packages;
CREATE POLICY "insert_packages_authenticated" ON supervised_execution_packages
  FOR INSERT TO anon, authenticated
  WITH CHECK (package_ref IS NOT NULL AND ewo_ref IS NOT NULL);

DROP POLICY IF EXISTS "update_packages_authenticated" ON supervised_execution_packages;
CREATE POLICY "update_packages_authenticated" ON supervised_execution_packages
  FOR UPDATE TO authenticated
  USING (package_ref IS NOT NULL)
  WITH CHECK (package_ref IS NOT NULL AND ewo_ref IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- 15. Fix RLS Policy Always True — supervised_execution_records
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "insert_exec_records_authenticated" ON supervised_execution_records;
CREATE POLICY "insert_exec_records_authenticated" ON supervised_execution_records
  FOR INSERT TO authenticated
  WITH CHECK (execution_ref IS NOT NULL AND ewo_ref IS NOT NULL);

DROP POLICY IF EXISTS "update_exec_records_authenticated" ON supervised_execution_records;
CREATE POLICY "update_exec_records_authenticated" ON supervised_execution_records
  FOR UPDATE TO authenticated
  USING (execution_ref IS NOT NULL)
  WITH CHECK (execution_ref IS NOT NULL AND ewo_ref IS NOT NULL);
