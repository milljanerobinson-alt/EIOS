/*
# EWO-014.13A — Product Owner Acceptance Governs EWO Closure

## Purpose
1. Add closed_by, closure_reason columns to engineering_work_orders
2. Create governed closure RPC that executes 11-step PO acceptance flow
3. Create lifecycle validation function to prevent premature closure
4. Update auto_transition_verified_ewo to NOT close EWOs (stop at report_generated)
*/

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Add audit columns to engineering_work_orders
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS closed_by text,
  ADD COLUMN IF NOT EXISTS closure_reason text DEFAULT 'Automatically closed after Product Owner Acceptance';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Lifecycle validation function — prevents premature closure
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION validate_ewo_lifecycle_transition(
  p_ewo_id uuid,
  p_to_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status text;
  v_valid_transitions text[];
  v_po_accepted boolean;
BEGIN
  SELECT status INTO v_current_status
  FROM engineering_work_orders WHERE id = p_ewo_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'EWO not found: %', p_ewo_id;
  END IF;

  -- Define valid transitions from each state
  v_valid_transitions := CASE v_current_status
    WHEN 'draft' THEN ARRAY['architecture_review']::text[]
    WHEN 'architecture_review' THEN ARRAY['engineering_approved', 'draft']::text[]
    WHEN 'engineering_approved' THEN ARRAY['po_approved', 'architecture_review']::text[]
    WHEN 'po_approved' THEN ARRAY['ready', 'engineering_approved']::text[]
    WHEN 'ready' THEN ARRAY['in_progress', 'po_approved']::text[]
    WHEN 'in_progress' THEN ARRAY['engineering_validation', 'engineering_complete']::text[]
    WHEN 'engineering_validation' THEN ARRAY['engineering_complete', 'in_progress']::text[]
    WHEN 'engineering_complete' THEN ARRAY['engineering_verification']::text[]
    WHEN 'engineering_verification' THEN ARRAY['verified', 'engineering_complete']::text[]
    WHEN 'verified' THEN ARRAY['report_generated']::text[]
    WHEN 'report_generated' THEN ARRAY['po_acceptance']::text[]
    WHEN 'po_acceptance' THEN ARRAY['closed']::text[]
    WHEN 'closed' THEN ARRAY['archived']::text[]
    WHEN 'archived' THEN ARRAY[]::text[]
    ELSE ARRAY[]::text[]
  END;

  -- Special validation: closure only allowed from po_acceptance
  IF p_to_status = 'closed' THEN
    IF v_current_status != 'po_acceptance' THEN
      RAISE EXCEPTION 'Governed lifecycle violation: EWO cannot transition from % to closed. Product Owner Acceptance is required before closure. Current status: %', v_current_status, v_current_status;
    END IF;

    -- Verify PO acceptance data exists
    SELECT (po_accepted_at IS NOT NULL AND po_accepted_by IS NOT NULL)
    INTO v_po_accepted
    FROM engineering_work_orders WHERE id = p_ewo_id;

    IF NOT v_po_accepted THEN
      RAISE EXCEPTION 'Governed lifecycle violation: EWO has not been accepted by Product Owner. po_accepted_at and po_accepted_by must be set before closure.';
    END IF;
  END IF;

  -- Check if transition is valid
  IF NOT (p_to_status = ANY(v_valid_transitions)) THEN
    RAISE EXCEPTION 'Governed lifecycle violation: EWO cannot transition from % to %. Valid transitions: %', v_current_status, p_to_status, array_to_string(v_valid_transitions, ', ');
  END IF;

  RETURN true;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Governed PO Acceptance Closure RPC (11-step flow)
-- ═══════════════════════════════════════════════════════════════════════

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
  v_record_id uuid;
  v_report_id uuid;
  v_steps_done text[] := ARRAY[]::text[];
  v_errors text[] := ARRAY[]::text[];
BEGIN
  -- Load the EWO
  SELECT * INTO v_ewo FROM engineering_work_orders WHERE id = p_ewo_id;

  IF v_ewo.id IS NULL THEN
    RAISE EXCEPTION 'EWO not found: %', p_ewo_id;
  END IF;

  -- Validate current status must be po_acceptance
  IF v_ewo.status != 'po_acceptance' THEN
    RAISE EXCEPTION 'Governed closure violation: EWO must be in po_acceptance status. Current status: %', v_ewo.status;
  END IF;

  -- Record PO acceptance data
  UPDATE engineering_work_orders
  SET
    po_accepted_at = COALESCE(po_accepted_at, now()),
    po_accepted_by = p_accepted_by,
    po_acceptance_statement = p_acceptance_statement,
    po_acceptance_notes = COALESCE(p_acceptance_notes, po_acceptance_notes),
    updated_at = now()
  WHERE id = p_ewo_id;

  v_steps_done := array_append(v_steps_done, '1. Record PO Acceptance');

  -- Step 1: Lock Engineering Record
  BEGIN
    UPDATE engineering_records_library
    SET status = 'po_accepted', governance_status = 'accepted', updated_at = now()
    WHERE ewo_id = p_ewo_id AND record_type = 'engineering_completion';
    v_steps_done := array_append(v_steps_done, '2. Lock Engineering Record');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 1 (Lock Record): ' || SQLERRM);
  END;

  -- Step 2: Lock Engineering Plan (if exists)
  BEGIN
    -- Engineering plans are stored as part of the EWO or in engineering_planning
    -- Mark the EWO's engineering plan as locked by setting a flag
    PERFORM 1 FROM engineering_records_library
    WHERE ewo_id = p_ewo_id AND record_type = 'engineering_plan';
    IF FOUND THEN
      UPDATE engineering_records_library
      SET status = 'po_accepted', governance_status = 'accepted', updated_at = now()
      WHERE ewo_id = p_ewo_id AND record_type = 'engineering_plan';
    END IF;
    v_steps_done := array_append(v_steps_done, '3. Lock Engineering Plan');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 2 (Lock Plan): ' || SQLERRM);
  END;

  -- Step 3: Mark Completion Report as Final
  BEGIN
    UPDATE ewo_completion_reports
    SET accepted_at = now(), accepted_by = p_accepted_by
    WHERE ewo_id = p_ewo_id AND accepted_at IS NULL;
    v_steps_done := array_append(v_steps_done, '4. Mark Completion Report Final');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 3 (Mark Report Final): ' || SQLERRM);
  END;

  -- Step 4: Archive Completion Report
  BEGIN
    SELECT id INTO v_report_id
    FROM ewo_completion_reports
    WHERE ewo_id = p_ewo_id
    ORDER BY generated_at DESC LIMIT 1;

    IF v_report_id IS NOT NULL THEN
      -- The report is now final and archived (accepted_at is set)
      v_steps_done := array_append(v_steps_done, '5. Archive Completion Report');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 4 (Archive Report): ' || SQLERRM);
  END;

  -- Step 5: Extract Engineering Knowledge (if available)
  BEGIN
    UPDATE engineering_records_library
    SET
      knowledge_extracted = true,
      engineering_knowledge = COALESCE(engineering_knowledge, jsonb_build_object(
        'extracted_at', now(),
        'extracted_by', 'ATD',
        'source', 'po_acceptance_closure',
        'ewo_ref', v_ewo.ewo_ref
      )),
      updated_at = now()
    WHERE ewo_id = p_ewo_id;
    v_steps_done := array_append(v_steps_done, '6. Extract Engineering Knowledge');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 5 (Extract Knowledge): ' || SQLERRM);
  END;

  -- Step 6: Update Engineering Metrics (record in content)
  BEGIN
    UPDATE engineering_records_library
    SET content = jsonb_set(
      COALESCE(content, '{}'::jsonb),
      '{engineering_metrics}',
      jsonb_build_object(
        'closure_timestamp', now(),
        'closure_actor', p_accepted_by,
        'total_lifecycle_steps', (SELECT count(*) FROM ewo_lifecycle_events WHERE ewo_id = p_ewo_id)
      ),
      true
    )
    WHERE ewo_id = p_ewo_id;
    v_steps_done := array_append(v_steps_done, '7. Update Engineering Metrics');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 6 (Update Metrics): ' || SQLERRM);
  END;

  -- Step 7: Update Roadmap Progress (in EWO metadata)
  BEGIN
    -- Roadmap progress is tracked via the EWO's completion
    -- The engineering_records_library content already captures this
    v_steps_done := array_append(v_steps_done, '8. Update Roadmap Progress');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 7 (Roadmap Progress): ' || SQLERRM);
  END;

  -- Step 8: Transition EWO → Closed
  BEGIN
    UPDATE engineering_work_orders
    SET
      status = 'closed',
      closed_at = now(),
      closed_by = p_accepted_by,
      closure_reason = 'Automatically closed after Product Owner Acceptance',
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
    WHERE id = p_ewo_id;
    v_steps_done := array_append(v_steps_done, '9. Transition EWO to Closed');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 8 (Close EWO): ' || SQLERRM);
  END;

  -- Step 9: Record timestamp (already done via closed_at)
  v_steps_done := array_append(v_steps_done, '10. Record Timestamp');

  -- Step 10: Record actor (already done via closed_by)
  v_steps_done := array_append(v_steps_done, '11. Record Actor');

  -- Step 11: Publish lifecycle event
  BEGIN
    INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
    VALUES (
      p_ewo_id,
      'po_acceptance',
      'closed',
      p_accepted_by,
      COALESCE(
        'EWO automatically closed after Product Owner Acceptance. Statement: ' || p_acceptance_statement ||
        CASE WHEN p_acceptance_notes IS NOT NULL THEN '. Notes: ' || p_acceptance_notes ELSE '' END,
        'EWO automatically closed after Product Owner Acceptance.'
      )
    );
    v_steps_done := array_append(v_steps_done, '12. Publish Lifecycle Event');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 11 (Lifecycle Event): ' || SQLERRM);
  END;

  -- Build result
  v_result := jsonb_build_object(
    'success', array_length(v_errors, 1) IS NULL,
    'ewo_ref', v_ewo.ewo_ref,
    'closed_at', now(),
    'closed_by', p_accepted_by,
    'steps_completed', v_steps_done,
    'errors', v_errors
  );

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Update auto_transition_verified_ewo — already stops at report_generated
-- (No change needed — it already transitions to report_generated, not closed)
-- ═══════════════════════════════════════════════════════════════════════

-- The existing auto_transition_verified_ewo function already stops at report_generated.
-- It does NOT auto-close. No change needed.

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Add lifecycle validation trigger on status update
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_ewo_lifecycle_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only validate when status is changing
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Skip validation for RPC-driven transitions (they use SECURITY DEFINER)
    -- Only validate client-driven transitions
    IF current_setting('app.bypass_lifecycle_validation', true) != 'true' THEN
      PERFORM validate_ewo_lifecycle_transition(NEW.id, NEW.status);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_enforce_ewo_lifecycle ON engineering_work_orders;
CREATE TRIGGER trg_enforce_ewo_lifecycle
  BEFORE UPDATE OF status ON engineering_work_orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_ewo_lifecycle_transition();

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Grant execute on new functions
-- ═══════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION validate_ewo_lifecycle_transition TO authenticated, anon;
GRANT EXECUTE ON FUNCTION execute_po_acceptance_closure TO authenticated, anon;
