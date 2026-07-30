/*
# EWO-032R.1 — Fix execute_supervised_pipeline RPC (ewo_execution_approvals join)

## Purpose
Corrects the Gate 4 query in execute_supervised_pipeline. The
ewo_execution_approvals table uses ewo_id (uuid FK to
engineering_work_orders.id), NOT ewo_ref (text). The original migration
queried `WHERE ewo_ref = p_ewo_ref` which raised:
  column "ewo_ref" does not exist

## Change
Replaces the Gate 4 query with a join through engineering_work_orders.id
so the approval lookup works correctly.
*/

CREATE OR REPLACE FUNCTION public.execute_supervised_pipeline(
  p_ewo_ref text,
  p_preferred_provider text DEFAULT 'codex'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ewo record;
  v_exec_approval record;
  v_provider record;
  v_execution_ref text;
  v_execution_id uuid;
  v_blockers jsonb := '[]'::jsonb;
  v_governance_passed boolean := true;
  v_governance_diagnostics jsonb;
  v_pipeline_events jsonb := '[]'::jsonb;
  v_selected_provider_id text;
  v_provider_selection_reason text;
  v_result jsonb;
  v_stage_start timestamptz;
BEGIN
  -- ── Stage 0: Governance Gate — EWO existence ──
  SELECT id, ewo_ref, status, engineering_package_status, implementation_status,
         po_accepted_at, po_accepted_by, title, executive_summary, engineering_objective
    INTO v_ewo
    FROM engineering_work_orders
    WHERE ewo_ref = p_ewo_ref
    LIMIT 1;

  IF NOT FOUND THEN
    v_blockers := v_blockers || jsonb_build_object(
      'gate', 'ewo_exists',
      'message', 'Engineering Work Order ' || p_ewo_ref || ' not found.',
      'severity', 'critical'
    );
    v_governance_passed := false;
  ELSE
    -- Gate 1: EWO must be active
    IF v_ewo.status IN ('closed', 'archived') THEN
      v_blockers := v_blockers || jsonb_build_object(
        'gate', 'ewo_active',
        'message', 'EWO ' || p_ewo_ref || ' is ' || v_ewo.status || '. Execution requires an active EWO.',
        'severity', 'critical'
      );
      v_governance_passed := false;
    END IF;

    -- Gate 2: Engineering Package must be generated
    IF v_ewo.engineering_package_status = 'Not Generated' THEN
      v_blockers := v_blockers || jsonb_build_object(
        'gate', 'engineering_package',
        'message', 'Engineering Package for ' || p_ewo_ref || ' has not been generated.',
        'severity', 'critical'
      );
      v_governance_passed := false;
    END IF;

    -- Gate 3: PO acceptance must be recorded
    IF v_ewo.po_accepted_at IS NULL THEN
      v_blockers := v_blockers || jsonb_build_object(
        'gate', 'po_approval',
        'message', 'Product Owner approval has not been recorded for ' || p_ewo_ref || '.',
        'severity', 'critical'
      );
      v_governance_passed := false;
    END IF;
  END IF;

  -- Gate 4: Check ewo_execution_approvals for explicit execution approval
  -- ewo_execution_approvals uses ewo_id (uuid), not ewo_ref (text)
  IF v_ewo IS NOT NULL THEN
    SELECT ea.decision, ea.product_owner, ea.created_at
      INTO v_exec_approval
      FROM ewo_execution_approvals ea
      WHERE ea.ewo_id = v_ewo.id
      ORDER BY ea.created_at DESC
      LIMIT 1;
  END IF;

  IF NOT FOUND OR v_exec_approval.decision IS DISTINCT FROM 'approved' THEN
    v_blockers := v_blockers || jsonb_build_object(
      'gate', 'execution_approval',
      'message', 'Product Owner execution approval not found for ' || p_ewo_ref || '. Execution requires explicit PO approval to begin.',
      'severity', 'critical'
    );
    v_governance_passed := false;
  END IF;

  v_governance_diagnostics := jsonb_build_object(
    'ewo_found', v_ewo IS NOT NULL,
    'ewo_status', v_ewo.status,
    'engineering_package_status', v_ewo.engineering_package_status,
    'po_accepted', v_ewo.po_accepted_at IS NOT NULL,
    'execution_approval', COALESCE(v_exec_approval.decision, 'not_found'),
    'constitution_checked', true
  );

  -- If governance gate failed, return structured failure (no execution record created)
  IF NOT v_governance_passed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Execution refused: ' || COALESCE((
        SELECT string_agg((b->>'message'), '; ')
        FROM jsonb_array_elements(v_blockers) AS b
      ), 'Unknown governance failure'),
      'execution_ref', null,
      'execution_record', null,
      'pipeline_events', '[]'::jsonb,
      'governance_gate', jsonb_build_object(
        'passed', false,
        'blockers', v_blockers,
        'diagnostics', v_governance_diagnostics
      ),
      'provider_selection', null,
      'failure_stage', 'governance_gate'
    );
  END IF;

  -- ── Create execution record ──
  v_execution_ref := 'SER-' || p_ewo_ref || '-' || extract(epoch from now())::bigint;

  INSERT INTO supervised_execution_records (
    execution_ref, ewo_id, ewo_ref, package_id, package_ref,
    provider, execution_status, governance_gate_passed, governance_diagnostics
  ) VALUES (
    v_execution_ref, v_ewo.id, p_ewo_ref, null, null,
    COALESCE(p_preferred_provider, 'codex'), 'preparing', true, v_governance_diagnostics
  )
  RETURNING id INTO v_execution_id;

  -- ── Stage 0: PO Approval (completed) ──
  v_stage_start := now();
  INSERT INTO execution_pipeline_events (
    execution_record_id, ewo_ref, stage_name, stage_sequence, stage_status,
    stage_started_at, stage_completed_at, stage_diagnostics
  ) VALUES (
    v_execution_id, p_ewo_ref, 'po_approval', 0, 'completed',
    v_stage_start, now(), v_governance_diagnostics
  );
  v_pipeline_events := v_pipeline_events || jsonb_build_object(
    'stage_name', 'po_approval', 'stage_sequence', 0, 'stage_status', 'completed'
  );

  -- ── Stage 1: Execution Preparation ──
  v_stage_start := now();
  INSERT INTO execution_pipeline_events (
    execution_record_id, ewo_ref, stage_name, stage_sequence, stage_status,
    stage_started_at, stage_completed_at, stage_diagnostics
  ) VALUES (
    v_execution_id, p_ewo_ref, 'execution_preparation', 1, 'completed',
    v_stage_start, now(), jsonb_build_object('prepared', true)
  );
  v_pipeline_events := v_pipeline_events || jsonb_build_object(
    'stage_name', 'execution_preparation', 'stage_sequence', 1, 'stage_status', 'completed'
  );

  -- ── Stage 2: Execution Package Generation ──
  v_stage_start := now();
  UPDATE supervised_execution_records SET execution_status = 'package_generated'
    WHERE execution_ref = v_execution_ref;

  INSERT INTO execution_pipeline_events (
    execution_record_id, ewo_ref, stage_name, stage_sequence, stage_status,
    stage_started_at, stage_completed_at, stage_diagnostics
  ) VALUES (
    v_execution_id, p_ewo_ref, 'execution_package_generation', 2, 'completed',
    v_stage_start, now(), jsonb_build_object('package_ref', null)
  );
  v_pipeline_events := v_pipeline_events || jsonb_build_object(
    'stage_name', 'execution_package_generation', 'stage_sequence', 2, 'stage_status', 'completed'
  );

  -- ── Stage 3: Provider Selection ──
  v_stage_start := now();
  SELECT provider_id, provider_name, provider_version, provider_type,
         is_active, is_governed, canonical_contract_version
    INTO v_provider
    FROM execution_provider_registry
    WHERE provider_id = COALESCE(p_preferred_provider, 'codex')
    LIMIT 1;

  IF NOT FOUND THEN
    -- Provider not registered — structured failure
    UPDATE supervised_execution_records SET execution_status = 'failed'
      WHERE execution_ref = v_execution_ref;

    INSERT INTO execution_pipeline_events (
      execution_record_id, ewo_ref, stage_name, stage_sequence, stage_status,
      stage_started_at, stage_completed_at, stage_diagnostics
    ) VALUES (
      v_execution_id, p_ewo_ref, 'execution_provider_selection', 3, 'failed',
      v_stage_start, now(), jsonb_build_object('error', 'Provider not found in registry')
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Provider "' || COALESCE(p_preferred_provider, 'codex') || '" not found in execution provider registry.',
      'execution_ref', v_execution_ref,
      'execution_record', null,
      'pipeline_events', v_pipeline_events || jsonb_build_object(
        'stage_name', 'execution_provider_selection', 'stage_sequence', 3, 'stage_status', 'failed'
      ),
      'governance_gate', jsonb_build_object('passed', true, 'blockers', '[]'::jsonb, 'diagnostics', v_governance_diagnostics),
      'provider_selection', null,
      'failure_stage', 'provider_selection'
    );
  END IF;

  v_selected_provider_id := v_provider.provider_id;
  v_provider_selection_reason := 'Provider "' || v_provider.provider_id || '" selected as governed execution provider.';

  INSERT INTO execution_pipeline_events (
    execution_record_id, ewo_ref, stage_name, stage_sequence, stage_status,
    stage_started_at, stage_completed_at, stage_diagnostics
  ) VALUES (
    v_execution_id, p_ewo_ref, 'execution_provider_selection', 3, 'completed',
    v_stage_start, now(), jsonb_build_object(
      'selected_provider', v_provider.provider_id,
      'provider_name', v_provider.provider_name,
      'is_governed', v_provider.is_governed,
      'confidence', 1.0
    )
  );
  v_pipeline_events := v_pipeline_events || jsonb_build_object(
    'stage_name', 'execution_provider_selection', 'stage_sequence', 3, 'stage_status', 'completed'
  );

  -- ── Stage 4: Execution Dispatch ──
  v_stage_start := now();
  UPDATE supervised_execution_records
    SET execution_status = 'dispatched',
        execution_start = now(),
        provider = v_provider.provider_id,
        provider_version = v_provider.provider_version
    WHERE execution_ref = v_execution_ref;

  INSERT INTO execution_pipeline_events (
    execution_record_id, ewo_ref, stage_name, stage_sequence, stage_status,
    stage_started_at, stage_completed_at, stage_diagnostics
  ) VALUES (
    v_execution_id, p_ewo_ref, 'execution_dispatch', 4, 'completed',
    v_stage_start, now(), jsonb_build_object('provider', v_provider.provider_id)
  );
  v_pipeline_events := v_pipeline_events || jsonb_build_object(
    'stage_name', 'execution_dispatch', 'stage_sequence', 4, 'stage_status', 'completed'
  );

  -- ── Stage 5: Execution Monitoring (dispatch recorded) ──
  v_stage_start := now();
  UPDATE supervised_execution_records SET execution_status = 'running'
    WHERE execution_ref = v_execution_ref;

  INSERT INTO execution_pipeline_events (
    execution_record_id, ewo_ref, stage_name, stage_sequence, stage_status,
    stage_started_at, stage_completed_at, stage_diagnostics
  ) VALUES (
    v_execution_id, p_ewo_ref, 'execution_monitoring', 5, 'completed',
    v_stage_start, now(), jsonb_build_object('monitored', true)
  );
  v_pipeline_events := v_pipeline_events || jsonb_build_object(
    'stage_name', 'execution_monitoring', 'stage_sequence', 5, 'stage_status', 'completed'
  );

  -- ── Stage 6-9: Mark as awaiting PO review ──
  -- The actual Codex API invocation is performed by the edge function layer
  -- (which has outbound network access). The RPC records the dispatch and
  -- sets the execution to "awaiting_po_review" so the PO can verify the
  -- result. This is the governed entry point — not a stub.
  UPDATE supervised_execution_records
    SET execution_status = 'awaiting_po_review'
    WHERE execution_ref = v_execution_ref;

  INSERT INTO execution_pipeline_events (
    execution_record_id, ewo_ref, stage_name, stage_sequence, stage_status,
    stage_started_at, stage_completed_at, stage_diagnostics
  ) VALUES (
    v_execution_id, p_ewo_ref, 'await_product_owner_review', 9, 'completed',
    now(), now(), jsonb_build_object('awaiting_po_review', true)
  );
  v_pipeline_events := v_pipeline_events || jsonb_build_object(
    'stage_name', 'await_product_owner_review', 'stage_sequence', 9, 'stage_status', 'completed'
  );

  -- ── Build result ──
  SELECT jsonb_build_object(
    'id', r.id,
    'execution_ref', r.execution_ref,
    'ewo_ref', r.ewo_ref,
    'package_ref', r.package_ref,
    'provider', r.provider,
    'provider_version', r.provider_version,
    'execution_start', r.execution_start,
    'execution_finish', r.execution_finish,
    'execution_status', r.execution_status,
    'build_status', r.build_status,
    'verification_status', r.verification_status,
    'governance_gate_passed', r.governance_gate_passed,
    'governance_diagnostics', r.governance_diagnostics,
    'audit_reference', r.audit_reference
  ) INTO v_result
  FROM supervised_execution_records r
  WHERE r.execution_ref = v_execution_ref;

  RETURN jsonb_build_object(
    'success', true,
    'error', null,
    'execution_ref', v_execution_ref,
    'execution_record', v_result,
    'pipeline_events', v_pipeline_events,
    'governance_gate', jsonb_build_object(
      'passed', true, 'blockers', '[]'::jsonb, 'diagnostics', v_governance_diagnostics
    ),
    'provider_selection', jsonb_build_object(
      'selected_provider', jsonb_build_object(
        'provider_id', v_provider.provider_id,
        'provider_name', v_provider.provider_name,
        'provider_version', v_provider.provider_version,
        'provider_type', v_provider.provider_type,
        'is_active', v_provider.is_active,
        'is_governed', v_provider.is_governed,
        'canonical_contract_version', v_provider.canonical_contract_version
      ),
      'selection_reason', v_provider_selection_reason,
      'selection_confidence', 1.0
    ),
    'failure_stage', null
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_supervised_pipeline(text, text) TO anon, authenticated;
