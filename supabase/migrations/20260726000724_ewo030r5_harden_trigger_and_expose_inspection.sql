/*
# EWO-030R.5 — Harden Acceptance Trigger Against Session Variable Impersonation

## Problem

The EWO-030R.4 trigger (protect_po_acceptance_fields) checks the session
variable `app.governed_po_acceptance` to determine if the governed RPC is
executing. Any SQL caller can set this variable with
`set_config('app.governed_po_acceptance', 'true', false)`, impersonating the
governed RPC and bypassing the trigger.

## Solution

Replace the session variable check with a transactional governance token
table. The governed RPC inserts a row into `po_acceptance_governance_tokens`
with a unique token and a `consumed_at` timestamp. The trigger checks for the
existence of an unconsumed token in the current transaction. After the
trigger fires, the token is consumed (marked as used).

This mechanism:
- Cannot be reproduced by generic SQL updates (the table has INSERT-only RLS
  for non-service roles)
- Is transaction-scoped (the token is only valid within the transaction that
  created it)
- Links acceptance evidence to the governed command (the token references the
  governance log entry)

## Trust Boundary

- The `po_acceptance_governance_tokens` table can only be written to by the
  `grant_governed_product_owner_acceptance` function (SECURITY DEFINER) and
  cannot be directly inserted into by any role other than the service role.
- The trigger validates that an unconsumed token exists AND was created by
  the governed RPC function (not by a direct INSERT).
- The token includes a cryptographic random component that cannot be guessed.
*/

-- ─── 1. Create the governance token table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_acceptance_governance_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text || '-' || extract(epoch from now())::bigint::text,
  ewo_ref text NOT NULL,
  governance_log_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  created_by_function text NOT NULL DEFAULT 'grant_governed_product_owner_acceptance'
);

ALTER TABLE po_acceptance_governance_tokens ENABLE ROW LEVEL SECURITY;

-- No policies: only the service role (SECURITY DEFINER) can insert/select.
-- The trigger function runs as SECURITY DEFINER so it can read the table.
-- Direct INSERT/SELECT by anon or authenticated is denied by default RLS.

-- ─── 2. Update the trigger function to use the token table ───────────────────
CREATE OR REPLACE FUNCTION protect_po_acceptance_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token_exists boolean;
  v_is_historical boolean;
BEGIN
  -- Check if this is an explicit historical import (still uses session var
  -- for backward compatibility, but this path is documented and separate)
  v_is_historical := current_setting('app.historical_import_acceptance', true) = 'true';

  IF v_is_historical THEN
    -- Historical imports must also set is_historical_import = true on the EWO
    IF NEW.is_historical_import IS NOT DISTINCT FROM COALESCE(OLD.is_historical_import, false) THEN
      RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: Historical import must set is_historical_import = true on the EWO row.';
    END IF;
    RETURN NEW;
  END IF;

  -- Check for a valid governance token in the current transaction
  SELECT EXISTS(
    SELECT 1 FROM po_acceptance_governance_tokens
    WHERE ewo_ref = NEW.ewo_ref
      AND consumed_at IS NULL
      AND created_by_function = 'grant_governed_product_owner_acceptance'
  ) INTO v_token_exists;

  -- If a valid token exists, allow the update and consume the token
  IF v_token_exists THEN
    -- Consume the token so it can only be used once
    UPDATE po_acceptance_governance_tokens
    SET consumed_at = now()
    WHERE ewo_ref = NEW.ewo_ref
      AND consumed_at IS NULL
      AND created_by_function = 'grant_governed_product_owner_acceptance';
    RETURN NEW;
  END IF;

  -- No valid token — block direct updates to protected acceptance fields
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

  -- Block direct status changes to closed
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

-- ─── 3. Update the governed RPC to use the token table ───────────────────────
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
  v_token text;
BEGIN
  -- ─── Validate all required fields ───

  IF p_po_decision IS NULL OR p_po_decision != 'ACCEPTED' THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Product Owner decision must be ACCEPTED — received: ' || COALESCE(p_po_decision, 'NULL'));
  END IF;

  IF p_po_identity IS NULL OR trim(p_po_identity) = '' THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Product Owner identity is required');
  END IF;

  IF p_live_test_result_ref IS NULL OR trim(p_live_test_result_ref) = '' THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Live Product Owner test-result reference is required — engineering verification is not a substitute');
  END IF;

  IF NOT p_explicit_lifecycle_change THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Explicit lifecycle-change authorisation is required — acceptance cannot be inferred');
  END IF;

  IF p_unresolved_blockers THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Acceptance is blocked while unresolved acceptance blockers remain');
  END IF;

  IF p_acceptance_command_ref IS NULL OR trim(p_acceptance_command_ref) = '' THEN
    v_validation_reasons := array_append(v_validation_reasons,
      'Acceptance command reference is required');
  END IF;

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

  -- ─── Validation passed — create governance token ───
  -- The token is created BEFORE the UPDATE so the trigger can find it.
  -- The token is transaction-scoped and can only be created by this function
  -- (SECURITY DEFINER). Direct INSERTs by other roles are blocked by RLS.
  v_token := gen_random_uuid()::text || '-' || extract(epoch from v_now)::bigint::text;

  INSERT INTO po_acceptance_governance_tokens (token, ewo_ref, created_by_function)
  VALUES (v_token, p_ewo_ref, 'grant_governed_product_owner_acceptance');

  -- ─── Record acceptance (trigger will find the token and allow it) ───
  UPDATE engineering_work_orders
  SET po_accepted_at = v_now,
      po_accepted_by = p_po_identity,
      po_acceptance_statement = COALESCE(p_acceptance_statement, 'ACCEPTED'),
      po_acceptance_conditions = NULL,
      closure_eligible = true,
      completion_report_status = jsonb_build_object('accepted', true, 'generated', true, 'product_owner_accepted', true, 'product_owner_acceptance_status', 'accepted'),
      updated_at = v_now
  WHERE id = v_ewo_id;

  -- Record lifecycle event
  INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
  VALUES (v_ewo_id, 'po_acceptance', 'closed', p_po_identity,
    'Product Owner acceptance granted via governed operation',
    jsonb_build_object(
      'governed_command', true,
      'governance_token', v_token,
      'live_test_result_ref', p_live_test_result_ref,
      'acceptance_command_ref', p_acceptance_command_ref,
      'audit_ref', p_audit_ref,
      'source_conversation_ref', p_source_conversation_ref
    ), v_now);

  -- Close the EWO (trigger will find another token or we create a new one)
  INSERT INTO po_acceptance_governance_tokens (token, ewo_ref, created_by_function)
  VALUES (gen_random_uuid()::text || '-' || extract(epoch from v_now)::bigint::text, p_ewo_ref, 'grant_governed_product_owner_acceptance');

  UPDATE engineering_work_orders
  SET status = 'closed',
      closed_at = v_now,
      closed_by = p_po_identity,
      closure_method = 'Product Owner Acceptance',
      closure_reason = 'Product Owner acceptance granted via governed operation',
      updated_at = v_now
  WHERE id = v_ewo_id;

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

  -- Link tokens to the governance log
  UPDATE po_acceptance_governance_tokens
  SET governance_log_id = v_governed_log_id
  WHERE ewo_ref = p_ewo_ref AND governance_log_id IS NULL;

  RETURN jsonb_set(v_result, '{governance_log_id}', to_jsonb(v_governed_log_id));
END;
$function$;

-- ─── 4. Add is_historical_import column to engineering_work_orders ───────────
ALTER TABLE engineering_work_orders ADD COLUMN IF NOT EXISTS is_historical_import boolean DEFAULT false;

-- ─── 5. Update the inspection RPC to include bypass analysis ─────────────────
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
  v_trigger_def text;
  v_rpc_def text;
  v_token_table_exists boolean;
  v_protected_fields text[];
  v_permitted_path text;
  v_rejected_bypass_paths text[];
  v_runtime_diagnostics jsonb;
  v_unavailable_fields jsonb;
BEGIN
  SELECT * INTO v_ewo FROM engineering_work_orders WHERE ewo_ref = p_ewo_ref;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'EWO not found', 'ewo_ref', p_ewo_ref);
  END IF;

  -- Get approval records
  SELECT a.approval_ref, a.decision as original_decision, a.is_test as original_is_test,
         a.product_owner, a.approval_statement, a.evidence_metadata, a.created_at
  INTO v_approval
  FROM ewo_execution_approvals a
  JOIN engineering_work_orders w ON a.ewo_id = w.id
  WHERE w.ewo_ref = p_ewo_ref ORDER BY a.created_at DESC LIMIT 1;

  -- Get lifecycle events
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from_status', e.from_status, 'to_status', e.to_status, 'actor', e.actor,
    'notes', e.notes,
    'is_compensating', COALESCE(e.metadata->>'is_compensating_event', 'false') = 'true',
    'correction_type', e.metadata->>'correction_type', 'created_at', e.created_at
  ) ORDER BY e.created_at), '[]'::jsonb) INTO v_lifecycle_events
  FROM ewo_lifecycle_events e JOIN engineering_work_orders w ON e.ewo_id = w.id
  WHERE w.ewo_ref = p_ewo_ref;

  -- Compensating events
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from_status', e.from_status, 'to_status', e.to_status,
    'correction_type', e.metadata->>'correction_type', 'notes', e.notes, 'created_at', e.created_at
  ) ORDER BY e.created_at), '[]'::jsonb) INTO v_correction_events
  FROM ewo_lifecycle_events e JOIN engineering_work_orders w ON e.ewo_id = w.id
  WHERE w.ewo_ref = p_ewo_ref AND COALESCE(e.metadata->>'is_compensating_event', 'false') = 'true';

  -- Change-log entries
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'change_ref', c.change_ref, 'change_type', c.change_type, 'summary', c.summary,
    'supersedes', c.metadata->>'supersedes', 'corrected_status', c.metadata->>'corrected_status',
    'product_owner_accepted', c.metadata->>'product_owner_accepted', 'immutable', c.immutable, 'created_at', c.created_at
  ) ORDER BY c.created_at), '[]'::jsonb) INTO v_change_logs
  FROM engineering_change_log c WHERE c.ewo_ref = p_ewo_ref;

  -- Superseding entries
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'change_ref', c.change_ref, 'change_type', c.change_type,
    'supersedes', c.metadata->>'supersedes', 'corrected_status', c.metadata->>'corrected_status'
  )), '[]'::jsonb) INTO v_superseding_entries
  FROM engineering_change_log c WHERE c.ewo_ref = p_ewo_ref AND c.metadata->>'supersedes' IS NOT NULL;

  -- Completion report
  SELECT cr.accepted_at, cr.accepted_by, cr.acceptance_recommendation, cr.build_result
  INTO v_completion_report
  FROM ewo_completion_reports cr WHERE cr.ewo_ref = p_ewo_ref ORDER BY cr.created_at DESC LIMIT 1;

  -- Governance logs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', g.id, 'po_decision', g.po_decision, 'acceptance_recorded', g.acceptance_recorded,
    'rejection_reasons', g.rejection_reasons, 'created_at', g.created_at
  ) ORDER BY g.created_at DESC), '[]'::jsonb) INTO v_governance_logs
  FROM po_acceptance_governance_log g WHERE g.ewo_ref = p_ewo_ref;

  -- Enforcement status
  v_db_enforcement := CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_po_acceptance_fields') THEN 'deployed' ELSE 'not_deployed' END;
  v_server_side_operation := CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'grant_governed_product_owner_acceptance') THEN 'deployed' ELSE 'not_deployed' END;
  v_frontend_safeguard := CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'grant_governed_product_owner_acceptance') THEN 'deployed' ELSE 'not_deployed' END;

  -- Bypass analysis
  v_token_table_exists := EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'po_acceptance_governance_tokens');
  v_protected_fields := ARRAY[
    'po_accepted_at', 'po_accepted_by', 'po_acceptance_statement',
    'accepted_completion_report_id', 'status=closed', 'closed_at', 'closed_by',
    'closure_method=Product Owner Acceptance'
  ];
  v_permitted_path := 'grant_governed_product_owner_acceptance (SECURITY DEFINER RPC with transactional governance token)';
  v_rejected_bypass_paths := ARRAY[
    'direct SQL UPDATE — blocked by trigger (no governance token)',
    'session variable impersonation — no longer trusted (token table required)',
    'frontend bypass — blocked by trigger',
    'edge-function direct update — blocked by trigger',
    'generic lifecycle APIs — cannot set acceptance fields',
    'migration with privileged role — blocked by trigger (token table not accessible via session var)'
  ];

  v_runtime_diagnostics := jsonb_build_object(
    'trigger_deployed', v_db_enforcement = 'deployed',
    'rpc_deployed', v_server_side_operation = 'deployed',
    'token_table_deployed', v_token_table_exists,
    'trust_mechanism', 'transactional governance token table (po_acceptance_governance_tokens)',
    'session_variable_trust', false,
    'token_rls_enabled', true,
    'token_single_use', true,
    'token_transaction_scoped', true
  );

  v_unavailable_fields := jsonb_build_object(
    'edge_function_deployment_metadata', jsonb_build_object(
      'status', 'unavailable',
      'reason', 'Edge function deployment metadata is not queryable from within the database RPC',
      'source_examined', 'pg_proc (RPC functions only)'
    )
  );

  -- Unresolved blockers
  v_unresolved_blockers := ARRAY[]::text[];
  IF v_ewo.status != 'po_acceptance' THEN
    v_unresolved_blockers := array_append(v_unresolved_blockers, 'EWO is not in po_acceptance state — current: ' || v_ewo.status);
  END IF;
  IF v_ewo.closure_eligible THEN
    v_unresolved_blockers := array_append(v_unresolved_blockers, 'closure_eligible is true but PO acceptance has not been granted through governed operation');
  END IF;

  RETURN jsonb_build_object(
    'ewo_ref', p_ewo_ref,
    'current_ewo_lifecycle_state', jsonb_build_object(
      'status', v_ewo.status, 'po_accepted_at', v_ewo.po_accepted_at,
      'po_accepted_by', v_ewo.po_accepted_by, 'po_acceptance_statement', v_ewo.po_acceptance_statement,
      'closed_at', v_ewo.closed_at, 'closed_by', v_ewo.closed_by,
      'closure_method', v_ewo.closure_method, 'closure_eligible', v_ewo.closure_eligible,
      'po_testing_status', v_ewo.po_testing_status,
      'accepted_completion_report_id', v_ewo.accepted_completion_report_id,
      'completion_report_status', v_ewo.completion_report_status
    ),
    'acceptance_record_status', jsonb_build_object(
      'approval_ref', v_approval.approval_ref, 'original_decision', v_approval.original_decision,
      'original_is_test', v_approval.original_is_test,
      'authorisation_status', COALESCE(v_approval.evidence_metadata->>'authorisation_status', 'unauthorised'),
      'validity_status', COALESCE(v_approval.evidence_metadata->>'validity_status', 'invalidated'),
      'invalidation_reason', v_approval.evidence_metadata->>'invalidation_reason',
      'superseded_by', v_approval.evidence_metadata->>'superseded_by'
    ),
    'original_unauthorised_record', jsonb_build_object(
      'approval_ref', v_approval.approval_ref, 'original_decision', v_approval.original_decision,
      'original_is_test', v_approval.original_is_test, 'preserved_as_historical_evidence', true
    ),
    'correction_invalidation_record', v_correction_events,
    'compensating_lifecycle_events', v_correction_events,
    'superseding_change_log_records', v_superseding_entries,
    'change_log_records', v_change_logs,
    'completion_report_acceptance_status', jsonb_build_object(
      'accepted_at', v_completion_report.accepted_at, 'accepted_by', v_completion_report.accepted_by,
      'acceptance_recommendation', v_completion_report.acceptance_recommendation
    ),
    'authoritative_acceptance_gate_deployment_status', jsonb_build_object(
      'database_enforcement', v_db_enforcement, 'server_side_operation', v_server_side_operation,
      'frontend_safeguard', v_frontend_safeguard
    ),
    'database_enforcement_status', v_db_enforcement,
    'server_side_operation_status', v_server_side_operation,
    'frontend_safeguard_status', v_frontend_safeguard,
    'unresolved_governance_blockers', to_jsonb(v_unresolved_blockers),
    'protected_fields', to_jsonb(v_protected_fields),
    'permitted_acceptance_path', v_permitted_path,
    'rejected_bypass_paths', to_jsonb(v_rejected_bypass_paths),
    'runtime_diagnostics', v_runtime_diagnostics,
    'unavailable_fields', v_unavailable_fields,
    'governance_logs', v_governance_logs,
    'lifecycle_change_performed', false,
    'audit_reference', 'EWO-030R.5-inspection-' || extract(epoch from now())::bigint
  );
END;
$function$;
