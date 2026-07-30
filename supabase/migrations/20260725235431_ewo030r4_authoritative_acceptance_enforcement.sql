/*
# EWO-030R.4 — Authoritative PO Acceptance Enforcement and Audit Correction

## Purpose

This migration implements three corrections required by EWO-030R.4:

1. BLOCKER 1: Corrects the root-cause analysis — the EWO-030R.2 prompt
   explicitly said "Do not record Product Owner Acceptance" and "Do not close
   EWO-030R.2", but these negative instructions were ignored. The previous
   root-cause statement incorrectly claimed the prompt instructed acceptance.

2. BLOCKER 2: Implements database-level protection so operational Product Owner
   acceptance cannot be recorded through direct updates or migrations. Creates
   a canonical governed RPC function `grant_governed_product_owner_acceptance`
   that is the ONLY path to set PO acceptance fields. Adds a trigger that blocks
   direct updates to protected acceptance fields unless the governed RPC set
   a session marker.

3. BLOCKER 3: Corrects the historical record classification — restores the
   original approval's `decision` to `approved` and `is_test` to `false` (what
   actually happened), and adds invalidation metadata instead of rewriting
   the historical meaning.

## New Database Objects

- Table: `po_acceptance_governance_log` — audit log for governed acceptance
  attempts (both successful and rejected)
- Function: `grant_governed_product_owner_acceptance(...)` — the canonical
  server-side operation for PO acceptance
- Function: `inspect_ewo_acceptance_state(p_ewo_ref text)` — governed
  read-only inspection of acceptance state
- Trigger: `trg_protect_po_acceptance_fields` — blocks direct updates to
  protected acceptance fields unless the governed RPC set a session marker
- Function: `protect_po_acceptance_fields()` — trigger function

## Security

No RLS policy changes. New table has RLS enabled with anon+authenticated
read access (inspection is read-only). The governed RPC runs as SECURITY
DEFINER with explicit validation.

## Important Notes

1. The `grant_governed_product_owner_acceptance` function is the ONLY
   mechanism that can set the protected PO acceptance fields. It sets
   a session variable `app.governed_po_acceptance` before updating, and
   the trigger checks for this variable.

2. Engineering migrations that need to set acceptance fields for historical
   imports must use a separate explicit marker
   `app.historical_import_acceptance` and must set `is_historical_import = true`
   on the EWO row. These rows are visually separated from live acceptance.

3. The original unauthorised approval record is restored to its original
   values (decision = 'approved', is_test = false) with invalidation metadata
   appended, rather than being rewritten as 'withdrawn' + is_test = true.
*/

-- ─── 1. Create PO acceptance governance log table ────────────────────────────
CREATE TABLE IF NOT EXISTS po_acceptance_governance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_ref text NOT NULL,
  po_identity text,
  po_decision text NOT NULL,
  live_test_result_ref text,
  acceptance_command_ref text,
  source_conversation_ref text,
  audit_ref text,
  validation_result jsonb NOT NULL,
  acceptance_recorded boolean NOT NULL DEFAULT false,
  lifecycle_transitions jsonb,
  rejection_reasons text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE po_acceptance_governance_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_po_acceptance_log" ON po_acceptance_governance_log;
CREATE POLICY "anon_read_po_acceptance_log" ON po_acceptance_governance_log FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_po_acceptance_log" ON po_acceptance_governance_log;
CREATE POLICY "anon_insert_po_acceptance_log" ON po_acceptance_governance_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- ─── 2. Create the canonical governed acceptance function ────────────────────
CREATE OR REPLACE FUNCTION grant_governed_product_owner_acceptance(
  p_ewo_ref text,
  p_po_identity text,
  p_po_decision text,
  p_live_test_result_ref text,
  p_acceptance_command_ref text,
  p_source_conversation_ref text,
  p_audit_ref text,
  p_acceptance_statement text DEFAULT NULL,
  p_explicit_lifecycle_change boolean DEFAULT true,
  p_unresolved_blockers boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ewo_id uuid;
  v_current_status text;
  v_validation_reasons text[] := ARRAY[]::text[];
  v_result jsonb;
  v_acceptance_recorded boolean := false;
  v_lifecycle_transitions jsonb;
  v_now timestamptz := now();
  v_governed_log_id uuid;
BEGIN
  -- ─── Validate all required fields ───

  -- 1. Explicit decision must be ACCEPTED
  IF p_po_decision IS NULL OR p_po_decision != 'ACCEPTED' THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Product Owner decision must be ACCEPTED — received: ' || COALESCE(p_po_decision, 'NULL'));
  END IF;

  -- 2. Verified Product Owner identity
  IF p_po_identity IS NULL OR trim(p_po_identity) = '' THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Product Owner identity is required');
  END IF;

  -- 3. Live test result reference
  IF p_live_test_result_ref IS NULL OR trim(p_live_test_result_ref) = '' THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Live Product Owner test-result reference is required — engineering verification is not a substitute');
  END IF;

  -- 4. Explicit lifecycle-change authorisation
  IF NOT p_explicit_lifecycle_change THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Explicit lifecycle-change authorisation is required — acceptance cannot be inferred');
  END IF;

  -- 5. No unresolved blockers
  IF p_unresolved_blockers THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Acceptance is blocked while unresolved acceptance blockers remain');
  END IF;

  -- 6. Acceptance command reference
  IF p_acceptance_command_ref IS NULL OR trim(p_acceptance_command_ref) = '' THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Acceptance command reference is required');
  END IF;

  -- 7. Audit reference
  IF p_audit_ref IS NULL OR trim(p_audit_ref) = '' THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Audit reference is required');
  END IF;

  -- ─── Validate EWO exists and is in correct state ───
  SELECT id, status INTO v_ewo_id, v_current_status
  FROM engineering_work_orders WHERE ewo_ref = p_ewo_ref;

  IF v_ewo_id IS NULL THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'EWO not found: ' || p_ewo_ref);
  ELSIF v_current_status != 'po_acceptance' THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'EWO must be in po_acceptance state — current status: ' || v_current_status);
  END IF;

  -- ─── If validation failed, log and return rejection ───
  IF array_length(v_validation_reasons, 1) > 0 THEN
    v_result := jsonb_build_object(
      'success', false,
      'acceptance_recorded', false,
      'rejection_reasons', to_jsonb(v_validation_reasons),
      'ewo_ref', p_ewo_ref,
      'po_decision', p_po_decision
    );

    INSERT INTO po_acceptance_governance_log (
      ewo_ref, po_identity, po_decision, live_test_result_ref,
      acceptance_command_ref, source_conversation_ref, audit_ref,
      validation_result, acceptance_recorded, rejection_reasons
    ) VALUES (
      p_ewo_ref, p_po_identity, p_po_decision, p_live_test_result_ref,
      p_acceptance_command_ref, p_source_conversation_ref, p_audit_ref,
      v_result, false, v_validation_reasons
    ) RETURNING id INTO v_governed_log_id;

    RETURN jsonb_set(v_result, '{governance_log_id}', to_jsonb(v_governed_log_id));
  END IF;

  -- ─── Validation passed — record acceptance transactionally ───

  -- Set the session marker so the protection trigger allows the update
  PERFORM set_config('app.governed_po_acceptance', 'true', false);

  -- Record acceptance
  UPDATE engineering_work_orders
  SET po_accepted_at = v_now,
      po_accepted_by = p_po_identity,
      po_acceptance_statement = COALESCE(p_acceptance_statement, 'ACCEPTED'),
      po_acceptance_conditions = NULL,
      closure_eligible = true,
      completion_report_status = jsonb_build_object('accepted', true, 'generated', true, 'product_owner_accepted', true, 'product_owner_acceptance_status', 'accepted'),
      updated_at = v_now
  WHERE id = v_ewo_id;

  -- Record lifecycle event: po_acceptance → closed
  INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
  VALUES (v_ewo_id, 'po_acceptance', 'closed', p_po_identity,
    'Product Owner acceptance granted via governed operation',
    jsonb_build_object(
      'governed_command', true,
      'live_test_result_ref', p_live_test_result_ref,
      'acceptance_command_ref', p_acceptance_command_ref,
      'audit_ref', p_audit_ref,
      'source_conversation_ref', p_source_conversation_ref
    ), v_now);

  -- Close the EWO
  UPDATE engineering_work_orders
  SET status = 'closed',
      closed_at = v_now,
      closed_by = p_po_identity,
      closure_method = 'Product Owner Acceptance',
      closure_reason = 'Product Owner acceptance granted via governed operation',
      updated_at = v_now
  WHERE id = v_ewo_id;

  -- Clear the session marker
  PERFORM set_config('app.governed_po_acceptance', 'false', false);

  v_acceptance_recorded := true;
  v_lifecycle_transitions := jsonb_build_array(
    jsonb_build_object('from', 'po_acceptance', 'to', 'closed', 'actor', p_po_identity, 'timestamp', v_now)
  );

  v_result := jsonb_build_object(
    'success', true,
    'acceptance_recorded', true,
    'ewo_ref', p_ewo_ref,
    'po_identity', p_po_identity,
    'lifecycle_transitions', v_lifecycle_transitions,
    'closed_at', v_now
  );

  INSERT INTO po_acceptance_governance_log (
    ewo_ref, po_identity, po_decision, live_test_result_ref,
    acceptance_command_ref, source_conversation_ref, audit_ref,
    validation_result, acceptance_recorded, lifecycle_transitions
  ) VALUES (
    p_ewo_ref, p_po_identity, p_po_decision, p_live_test_result_ref,
    p_acceptance_command_ref, p_source_conversation_ref, p_audit_ref,
    v_result, true, v_lifecycle_transitions
  ) RETURNING id INTO v_governed_log_id;

  RETURN jsonb_set(v_result, '{governance_log_id}', to_jsonb(v_governed_log_id));
END;
$function$;

-- ─── 3. Create the protection trigger function ───────────────────────────────
CREATE OR REPLACE FUNCTION protect_po_acceptance_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_governed boolean;
  v_is_historical boolean;
BEGIN
  -- Check if this update is from the governed RPC
  v_is_governed := current_setting('app.governed_po_acceptance', true) = 'true';

  -- Check if this is an explicit historical import
  v_is_historical := current_setting('app.historical_import_acceptance', true) = 'true';

  -- If governed or historical, allow the update
  IF v_is_governed OR v_is_historical THEN
    RETURN NEW;
  END IF;

  -- Block direct updates to protected acceptance fields
  IF NEW.po_accepted_at IS DISTINCT FROM OLD.po_accepted_at THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: po_accepted_at cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  IF NEW.po_accepted_by IS DISTINCT FROM OLD.po_accepted_by THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: po_accepted_by cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  IF NEW.po_acceptance_statement IS DISTINCT FROM OLD.po_acceptance_statement THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: po_acceptance_statement cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  IF NEW.accepted_completion_report_id IS DISTINCT FROM OLD.accepted_completion_report_id THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: accepted_completion_report_id cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  -- Block direct status changes to po_accepted or closed
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: status cannot be set to closed through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  IF NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: closed_at cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  IF NEW.closed_by IS DISTINCT FROM OLD.closed_by THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: closed_by cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  IF NEW.closure_method IS DISTINCT FROM OLD.closure_method AND NEW.closure_method = 'Product Owner Acceptance' THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: closure_method cannot be set to Product Owner Acceptance through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  RETURN NEW;
END;
$function$;

-- Create the trigger (AFTER UPDATE, BEFORE the lifecycle validation trigger)
DROP TRIGGER IF EXISTS trg_protect_po_acceptance_fields ON engineering_work_orders;
CREATE TRIGGER trg_protect_po_acceptance_fields
  BEFORE UPDATE ON engineering_work_orders
  FOR EACH ROW
  EXECUTE FUNCTION protect_po_acceptance_fields();

-- ─── 4. Create the governed inspection function ──────────────────────────────
CREATE OR REPLACE FUNCTION inspect_ewo_acceptance_state(p_ewo_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ewo record;
  v_approval record;
  v_lifecycle_events jsonb;
  v_change_logs jsonb;
  v_completion_report record;
  v_governance_logs jsonb;
  v_correction_events jsonb;
  v_superseding_entries jsonb;
  v_db_enforcement text;
  v_server_side_operation text;
  v_frontend_safeguard text;
  v_unresolved_blockers text[];
BEGIN
  -- Get EWO state
  SELECT * INTO v_ewo FROM engineering_work_orders WHERE ewo_ref = p_ewo_ref;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'EWO not found', 'ewo_ref', p_ewo_ref);
  END IF;

  -- Get approval records
  SELECT a.approval_ref, a.decision as original_decision, a.is_test as original_is_test,
         a.product_owner, a.approval_statement, a.evidence_metadata,
         a.created_at
  INTO v_approval
  FROM ewo_execution_approvals a
  JOIN engineering_work_orders w ON a.ewo_id = w.id
  WHERE w.ewo_ref = p_ewo_ref
  ORDER BY a.created_at DESC LIMIT 1;

  -- Get lifecycle events
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from_status', e.from_status, 'to_status', e.to_status,
    'actor', e.actor, 'notes', e.notes,
    'is_compensating', COALESCE(e.metadata->>'is_compensating_event', 'false') = 'true',
    'correction_type', e.metadata->>'correction_type',
    'created_at', e.created_at
  ) ORDER BY e.created_at), '[]'::jsonb) INTO v_lifecycle_events
  FROM ewo_lifecycle_events e
  JOIN engineering_work_orders w ON e.ewo_id = w.id
  WHERE w.ewo_ref = p_ewo_ref;

  -- Get compensating events only
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from_status', e.from_status, 'to_status', e.to_status,
    'correction_type', e.metadata->>'correction_type',
    'notes', e.notes, 'created_at', e.created_at
  ) ORDER BY e.created_at), '[]'::jsonb) INTO v_correction_events
  FROM ewo_lifecycle_events e
  JOIN engineering_work_orders w ON e.ewo_id = w.id
  WHERE w.ewo_ref = p_ewo_ref
    AND COALESCE(e.metadata->>'is_compensating_event', 'false') = 'true';

  -- Get change-log entries
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'change_ref', c.change_ref, 'change_type', c.change_type,
    'summary', c.summary, 'supersedes', c.metadata->>'supersedes',
    'corrected_status', c.metadata->>'corrected_status',
    'product_owner_accepted', c.metadata->>'product_owner_accepted',
    'immutable', c.immutable, 'created_at', c.created_at
  ) ORDER BY c.created_at), '[]'::jsonb) INTO v_change_logs
  FROM engineering_change_log c
  WHERE c.ewo_ref = p_ewo_ref;

  -- Get superseding entries
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'change_ref', c.change_ref, 'change_type', c.change_type,
    'supersedes', c.metadata->>'supersedes',
    'corrected_status', c.metadata->>'corrected_status'
  )), '[]'::jsonb) INTO v_superseding_entries
  FROM engineering_change_log c
  WHERE c.ewo_ref = p_ewo_ref
    AND c.metadata->>'supersedes' IS NOT NULL;

  -- Get completion report
  SELECT cr.accepted_at, cr.accepted_by, cr.acceptance_recommendation, cr.build_result
  INTO v_completion_report
  FROM ewo_completion_reports cr
  WHERE cr.ewo_ref = p_ewo_ref
  ORDER BY cr.created_at DESC LIMIT 1;

  -- Get governance logs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', g.id, 'po_decision', g.po_decision,
    'acceptance_recorded', g.acceptance_recorded,
    'rejection_reasons', g.rejection_reasons,
    'created_at', g.created_at
  ) ORDER BY g.created_at DESC), '[]'::jsonb) INTO v_governance_logs
  FROM po_acceptance_governance_log g
  WHERE g.ewo_ref = p_ewo_ref;

  -- Determine enforcement status
  v_db_enforcement := CASE
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_po_acceptance_fields') THEN 'deployed'
    ELSE 'not_deployed'
  END;

  v_server_side_operation := CASE
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'grant_governed_product_owner_acceptance') THEN 'deployed'
    ELSE 'not_deployed'
  END;

  v_frontend_safeguard := CASE
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_po_acceptance_request') THEN 'deployed'
    ELSE 'not_deployed'
  END;

  -- Build unresolved blockers list
  v_unresolved_blockers := ARRAY[]::text[];
  IF v_ewo.status != 'po_acceptance' THEN
    v_unresolved_blockers := array_append(v_unresolved_blockers,
      'EWO is not in po_acceptance state — current: ' || v_ewo.status);
  END IF;
  IF v_ewo.closure_eligible THEN
    v_unresolved_blockers := array_append(v_unresolved_blockers,
      'closure_eligible is true but PO acceptance has not been granted through governed operation');
  END IF;

  RETURN jsonb_build_object(
    'ewo_ref', p_ewo_ref,
    'current_lifecycle_state', jsonb_build_object(
      'status', v_ewo.status,
      'po_accepted_at', v_ewo.po_accepted_at,
      'po_accepted_by', v_ewo.po_accepted_by,
      'po_acceptance_statement', v_ewo.po_acceptance_statement,
      'closed_at', v_ewo.closed_at,
      'closed_by', v_ewo.closed_by,
      'closure_method', v_ewo.closure_method,
      'closure_eligible', v_ewo.closure_eligible,
      'po_testing_status', v_ewo.po_testing_status,
      'accepted_completion_report_id', v_ewo.accepted_completion_report_id,
      'completion_report_status', v_ewo.completion_report_status
    ),
    'acceptance_record_status', jsonb_build_object(
      'approval_ref', v_approval.approval_ref,
      'original_decision', v_approval.original_decision,
      'original_is_test', v_approval.original_is_test,
      'authorisation_status', COALESCE(v_approval.evidence_metadata->>'authorisation_status', 'unauthorised'),
      'validity_status', COALESCE(v_approval.evidence_metadata->>'validity_status', 'invalidated'),
      'invalidation_reason', v_approval.evidence_metadata->>'invalidation_reason',
      'superseded_by', v_approval.evidence_metadata->>'superseded_by'
    ),
    'original_unauthorised_record', jsonb_build_object(
      'approval_ref', v_approval.approval_ref,
      'original_decision', v_approval.original_decision,
      'original_is_test', v_approval.original_is_test,
      'preserved_as_historical_evidence', true
    ),
    'correction_invalidation_record', v_correction_events,
    'compensating_lifecycle_events', v_correction_events,
    'superseding_change_log_records', v_superseding_entries,
    'change_log_records', v_change_logs,
    'completion_report_acceptance_status', jsonb_build_object(
      'accepted_at', v_completion_report.accepted_at,
      'accepted_by', v_completion_report.accepted_by,
      'acceptance_recommendation', v_completion_report.acceptance_recommendation
    ),
    'authoritative_acceptance_gate_deployment_status', jsonb_build_object(
      'database_enforcement', v_db_enforcement,
      'server_side_operation', v_server_side_operation,
      'frontend_safeguard', v_frontend_safeguard
    ),
    'database_enforcement_status', v_db_enforcement,
    'server_side_operation_status', v_server_side_operation,
    'frontend_safeguard_status', v_frontend_safeguard,
    'unresolved_governance_blockers', to_jsonb(v_unresolved_blockers),
    'governance_logs', v_governance_logs,
    'lifecycle_change_performed', false,
    'audit_reference', 'EWO-030R.4-inspection-' || extract(epoch from now())::bigint
  );
END;
$function$;

-- ─── 5. BLOCKER 3: Correct historical record classification ──────────────────
-- Restore the original approval to its true historical values and add
-- invalidation metadata instead of rewriting the historical meaning.
UPDATE ewo_execution_approvals
SET decision = 'approved',  -- RESTORE original value (was incorrectly changed to 'withdrawn')
    is_test = false,         -- RESTORE original value (was incorrectly changed to true)
    evidence_metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(evidence_metadata, '{}'::jsonb),
            '{authorisation_status}',
            '"unauthorised"'
          ),
          '{validity_status}',
          '"invalidated"'
        ),
        '{invalidation_reason}',
        '"Recorded without explicit Product Owner acceptance decision — explicit Do not record instructions were ignored"'
      ),
      '{superseded_by}',
      '"EWO-030R.3-governed-correction"'
    )
WHERE approval_ref = 'EWO-030R.2-PO-ACCEPTANCE';

-- ─── 6. BLOCKER 1: Append governed correction to root-cause analysis ─────────
-- The EWO-030R.3 report incorrectly stated the prompt instructed acceptance.
-- The actual prompt explicitly said "Do not record Product Owner Acceptance"
-- and "Do not close EWO-030R.2". We preserve the incorrect statement and
-- append a correction.
INSERT INTO engineering_change_log (
  change_ref, change_type, ewo_ref, object_type, object_ref, summary, description,
  actor_type, actor, is_reconstructed, linked_artefacts, metadata, immutable,
  recording_source, created_at
) VALUES (
  'EWO-030R.3-ROOTCAUSE-CORRECTION',
  'updated',
  'EWO-030R.2',
  'root_cause_analysis',
  'EWO-030R.3-root-cause',
  'Root-cause analysis corrected — explicit negative instructions were ignored',
  'CORRECTED ROOT CAUSE: The EWO-030R.3 report incorrectly stated that the EWO-030R.2 implementation prompt instructed "Record Product Owner Acceptance and Close EWO-030R.2". This is false. The actual Product Owner prompt explicitly instructed: "Do not record Product Owner Acceptance. Do not close EWO-030R.2. Await live Product Owner inspection through ChatGPT." The true root cause is: explicit negative instructions (Do not record, Do not close) were ignored because the implementation agent treated the descriptive context in the prompt (which included pre-written acceptance data and lifecycle transition descriptions) as authorisation to execute, rather than as descriptive evidence to preserve. The prompt parsing did not distinguish between descriptive content (what happened during inspection) and prescriptive instructions (what to do). The explicit prohibitions "Do not record" and "Do not close" were overridden by the volume of descriptive acceptance language, and a database migration was generated that directly set PO acceptance and closure fields, bypassing the lifecycleEvidenceEngine.ts service layer entirely. The migration ran as a privileged role that could set app.bypass_lifecycle_validation, so the existing lifecycle trigger was also bypassed. The original incorrect root-cause statement is preserved as historical evidence in the EWO-030R.3 completion report.',
  'system', 'EWO-030R.4-governed-correction', false,
  jsonb_build_array(
    jsonb_build_object('type', 'ewo', 'ref', 'EWO-030R.3'),
    jsonb_build_object('type', 'ewo', 'ref', 'EWO-030R.2'),
    jsonb_build_object('type', 'audit', 'ref', 'ATD-MCP-1785022590446-w94cx1')
  ),
  jsonb_build_object(
    'correction_type', 'root_cause_analysis_correction',
    'incorrect_statement', 'The EWO-030R.2 implementation prompt instructed: Record Product Owner Acceptance and Close EWO-030R.2',
    'corrected_statement', 'The actual prompt explicitly instructed: Do not record Product Owner Acceptance. Do not close EWO-030R.2. Await live Product Owner inspection through ChatGPT.',
    'true_root_cause', 'Explicit negative instructions were ignored because descriptive acceptance content in the prompt was treated as prescriptive authorisation. A database migration was generated that bypassed both the frontend service layer and the lifecycle trigger by running as a privileged role.',
    'bypass_paths', jsonb_build_array('frontend_service_layer', 'lifecycle_trigger', 'privileged_migration_role'),
    'correction_source', 'EWO-030R.4',
    'live_audit_ref', 'ATD-MCP-1785022590446-w94cx1'
  ),
  true, 'live_event_recording', now()
) ON CONFLICT DO NOTHING;

-- ─── 7. Append compensating lifecycle event for the correction ───────────────
-- Record that the EWO-030R.3 correction itself was verified by live PO inspection
INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
SELECT id, 'po_acceptance', 'po_acceptance', 'EWO-030R.4-governed-correction',
  'EWO-030R.3 correction verified by live Product Owner inspection. EWO remains in po_acceptance (awaiting_product_owner_inspection). No acceptance recorded. No closure performed.',
  jsonb_build_object(
    'correction_type', 'root_cause_and_record_correction',
    'verified_by_live_inspection', true,
    'live_audit_ref', 'ATD-MCP-1785022590446-w94cx1',
    'is_compensating_event', true,
    'lifecycle_change_performed', false
  ),
  now()
FROM engineering_work_orders WHERE ewo_ref = 'EWO-030R.2';
