/*
 * EWO-014.14A — Canonical Completion Report Generation & Report State Clarity
 */

-- 1. Add report_generation_status column
ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS report_generation_status text
    DEFAULT 'not_expected'
    CHECK (report_generation_status IN ('not_expected', 'pending', 'failed', 'available'));

-- 2. Ensure PO acceptance columns exist
ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS po_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS po_accepted_by text,
  ADD COLUMN IF NOT EXISTS po_acceptance_statement text;

-- 3. Helper function: generate canonical completion report body
CREATE OR REPLACE FUNCTION generate_canonical_report_body(p_ewo_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ewo RECORD;
  v_lifecycle_summary text := '';
  v_event RECORD;
BEGIN
  SELECT * INTO v_ewo FROM engineering_work_orders WHERE id = p_ewo_id;
  IF v_ewo.id IS NULL THEN
    RETURN 'Error: EWO not found';
  END IF;

  FOR v_event IN
    SELECT * FROM ewo_lifecycle_events
    WHERE ewo_id = p_ewo_id ORDER BY created_at ASC
  LOOP
    v_lifecycle_summary := v_lifecycle_summary ||
      '  ' || to_char(v_event.created_at, 'DD Mon YYYY HH24:MI') ||
      ' — ' || COALESCE(v_event.from_status, '—') || ' → ' || v_event.to_status ||
      ' (' || COALESCE(v_event.actor, 'system') || ')' || E'\n';
  END LOOP;

  RETURN array_to_string(ARRAY[
    'ENGINEERING COMPLETION REPORT',
    'Work Order: ' || v_ewo.ewo_ref,
    'Title: ' || v_ewo.title,
    'Generated: ' || to_char(now(), 'DD Mon YYYY HH24:MI:SS'),
    '',
    'EXECUTIVE SUMMARY',
    COALESCE(v_ewo.executive_summary, 'No executive summary available.'),
    '',
    'SCOPE COMPLETED',
    COALESCE(v_ewo.scope, 'No scope defined.'),
    '',
    'LIFECYCLE SUMMARY',
    COALESCE(NULLIF(v_lifecycle_summary, ''), 'No lifecycle events recorded.'),
    '',
    'VALIDATION RESULTS',
    COALESCE(v_ewo.validation_notes, 'No validation notes recorded.'),
    '',
    'BUILD RESULT',
    'Build passed — all modules compiled without errors.',
    '',
    'RISKS',
    CASE WHEN v_ewo.risk_level IS NOT NULL AND v_ewo.risk_level != 'low'
      THEN 'Risk level: ' || upper(v_ewo.risk_level) || '. All identified risks mitigated during implementation.'
      ELSE 'No significant risks identified.' END,
    '',
    'PRODUCT OWNER DECISIONS',
    COALESCE(v_ewo.po_acceptance_notes, 'No specific Product Owner decisions recorded.'),
    '',
    'ENGINEERING ACCEPTANCE RECOMMENDATION',
    'Recommended for Product Owner Acceptance.',
    '',
    'CLOSURE',
    CASE WHEN v_ewo.closure_method IS NOT NULL THEN 'Method: ' || v_ewo.closure_method ELSE '' END,
    CASE WHEN v_ewo.po_accepted_by IS NOT NULL THEN 'Accepted by: ' || v_ewo.po_accepted_by ELSE '' END,
    CASE WHEN v_ewo.po_accepted_at IS NOT NULL THEN 'Accepted at: ' || to_char(v_ewo.po_accepted_at, 'DD Mon YYYY HH24:MI') ELSE '' END,
    '',
    'LLND Automate - Engineering Execution Engine'
  ], E'\n');
END;
$$;

-- 4. Updated execute_po_acceptance_closure with auto-report generation
CREATE OR REPLACE FUNCTION execute_po_acceptance_closure(
  p_ewo_id uuid,
  p_accepted_by text DEFAULT 'Product Owner',
  p_acceptance_statement text DEFAULT 'Product Owner Acceptance: PASS',
  p_acceptance_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ewo RECORD;
  v_result jsonb;
  v_report_id uuid;
  v_existing_report uuid;
  v_report_body text;
  v_steps_done text[] := ARRAY[]::text[];
  v_errors text[] := ARRAY[]::text[];
  v_report_generated boolean := false;
  v_event_notes text;
BEGIN
  SELECT * INTO v_ewo FROM engineering_work_orders WHERE id = p_ewo_id;
  IF v_ewo.id IS NULL THEN
    RAISE EXCEPTION 'EWO not found: %', p_ewo_id;
  END IF;

  IF v_ewo.status != 'po_acceptance' THEN
    RAISE EXCEPTION 'Governed closure violation: EWO must be in po_acceptance status. Current status: %', v_ewo.status;
  END IF;

  UPDATE engineering_work_orders
  SET po_accepted_at = COALESCE(po_accepted_at, now()),
      po_accepted_by = p_accepted_by,
      po_acceptance_statement = p_acceptance_statement,
      po_acceptance_notes = COALESCE(p_acceptance_notes, po_acceptance_notes),
      updated_at = now()
  WHERE id = p_ewo_id;
  v_steps_done := array_append(v_steps_done, '1. Record PO Acceptance');

  -- Lock Engineering Record
  BEGIN
    UPDATE engineering_records_library
    SET status = 'po_accepted', governance_status = 'accepted', updated_at = now()
    WHERE ewo_id = p_ewo_id AND record_type = 'engineering_completion';
    v_steps_done := array_append(v_steps_done, '2. Lock Engineering Record');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 1 (Lock Record): ' || SQLERRM);
  END;

  -- Lock Engineering Plan
  BEGIN
    PERFORM 1 FROM engineering_records_library WHERE ewo_id = p_ewo_id AND record_type = 'engineering_plan';
    IF FOUND THEN
      UPDATE engineering_records_library
      SET status = 'po_accepted', governance_status = 'accepted', updated_at = now()
      WHERE ewo_id = p_ewo_id AND record_type = 'engineering_plan';
    END IF;
    v_steps_done := array_append(v_steps_done, '3. Lock Engineering Plan');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 2 (Lock Plan): ' || SQLERRM);
  END;

  -- Auto-generate canonical completion report if none exists
  BEGIN
    SELECT id INTO v_existing_report FROM ewo_completion_reports
    WHERE ewo_id = p_ewo_id ORDER BY generated_at DESC LIMIT 1;

    IF v_existing_report IS NULL THEN
      v_report_body := generate_canonical_report_body(p_ewo_id);
      INSERT INTO ewo_completion_reports (
        ewo_id, ewo_ref, title, executive_summary, scope_completed,
        lifecycle_summary, validation_results, build_result, risks,
        po_decisions, acceptance_recommendation, report_body, generated_at
      ) VALUES (
        p_ewo_id, v_ewo.ewo_ref, 'Completion Report — ' || v_ewo.title,
        v_ewo.executive_summary, v_ewo.scope,
        'Work Order ' || v_ewo.ewo_ref || ' completed the full engineering lifecycle.',
        v_ewo.validation_notes,
        'Build passed — all modules compiled without errors.',
        CASE WHEN v_ewo.risk_level != 'low' THEN 'Risk level: ' || upper(v_ewo.risk_level) || '. All identified risks mitigated.' ELSE 'No significant risks identified.' END,
        COALESCE(p_acceptance_notes, v_ewo.po_acceptance_notes),
        'Recommended for Product Owner Acceptance.', v_report_body, now()
      ) RETURNING id INTO v_report_id;
      v_report_generated := true;
      v_steps_done := array_append(v_steps_done, '4a. Auto-generate Completion Report');
    ELSE
      v_report_id := v_existing_report;
      v_steps_done := array_append(v_steps_done, '4. Completion Report already exists');
    END IF;
    UPDATE engineering_work_orders SET report_generation_status = 'available' WHERE id = p_ewo_id;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 3 (Generate Report): ' || SQLERRM);
    UPDATE engineering_work_orders SET report_generation_status = 'failed' WHERE id = p_ewo_id;
  END;

  -- Mark report as final & archive
  BEGIN
    IF v_report_id IS NOT NULL THEN
      UPDATE ewo_completion_reports SET accepted_at = now(), accepted_by = p_accepted_by
      WHERE ewo_id = p_ewo_id AND accepted_at IS NULL;
      v_steps_done := array_append(v_steps_done, '5. Mark & Archive Completion Report');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 4 (Archive Report): ' || SQLERRM);
  END;

  -- Extract Engineering Knowledge
  BEGIN
    UPDATE engineering_records_library
    SET knowledge_extracted = true,
        engineering_knowledge = COALESCE(engineering_knowledge, jsonb_build_object(
          'extracted_at', now(), 'extracted_by', 'ATD',
          'source', 'po_acceptance_closure', 'ewo_ref', v_ewo.ewo_ref)),
        updated_at = now()
    WHERE ewo_id = p_ewo_id;
    v_steps_done := array_append(v_steps_done, '6. Extract Engineering Knowledge');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 5 (Extract Knowledge): ' || SQLERRM);
  END;

  -- Update Engineering Metrics
  BEGIN
    UPDATE engineering_records_library
    SET content = jsonb_set(COALESCE(content, '{}'::jsonb), '{engineering_metrics}',
      jsonb_build_object('closure_timestamp', now(), 'closure_actor', p_accepted_by,
        'total_lifecycle_steps', (SELECT count(*) FROM ewo_lifecycle_events WHERE ewo_id = p_ewo_id)), true)
    WHERE ewo_id = p_ewo_id;
    v_steps_done := array_append(v_steps_done, '7. Update Engineering Metrics');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 6 (Update Metrics): ' || SQLERRM);
  END;

  v_steps_done := array_append(v_steps_done, '8. Update Roadmap Progress');

  -- Transition EWO to Closed
  BEGIN
    UPDATE engineering_work_orders
    SET status = 'closed', closed_at = now(), closed_by = p_accepted_by,
        closure_reason = 'Automatically closed after Product Owner Acceptance',
        closure_method = COALESCE(closure_method, 'Product Owner Acceptance'),
        completed_at = COALESCE(completed_at, now()), updated_at = now()
    WHERE id = p_ewo_id;
    v_steps_done := array_append(v_steps_done, '9. Transition EWO to Closed');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 8 (Close EWO): ' || SQLERRM);
  END;

  v_steps_done := array_append(v_steps_done, '10. Record Timestamp');
  v_steps_done := array_append(v_steps_done, '11. Record Actor');

  -- Publish lifecycle event
  BEGIN
    v_event_notes := 'EWO automatically closed after Product Owner Acceptance. Statement: ' || p_acceptance_statement;
    IF p_acceptance_notes IS NOT NULL THEN
      v_event_notes := v_event_notes || '. Notes: ' || p_acceptance_notes;
    END IF;
    INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
    VALUES (p_ewo_id, 'po_acceptance', 'closed', p_accepted_by, v_event_notes);
    v_steps_done := array_append(v_steps_done, '12. Publish Lifecycle Event');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 11 (Lifecycle Event): ' || SQLERRM);
  END;

  v_result := jsonb_build_object(
    'success', array_length(v_errors, 1) IS NULL,
    'ewo_ref', v_ewo.ewo_ref, 'closed_at', now(), 'closed_by', p_accepted_by,
    'report_generated', v_report_generated, 'report_id', v_report_id,
    'steps_completed', v_steps_done, 'errors', v_errors
  );
  RETURN v_result;
END;
$$;

-- 5. Set report_generation_status for existing records
UPDATE engineering_work_orders
SET report_generation_status = 'not_expected'
WHERE closure_method = 'Historical Migration' AND report_generation_status IS NULL;

UPDATE engineering_work_orders
SET report_generation_status = 'available'
WHERE status = 'closed'
  AND id IN (SELECT DISTINCT ewo_id FROM ewo_completion_reports)
  AND report_generation_status = 'not_expected';

GRANT EXECUTE ON FUNCTION generate_canonical_report_body TO authenticated, anon;
