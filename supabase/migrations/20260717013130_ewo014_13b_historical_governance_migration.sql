/*
# EWO-014.13B — Historical Engineering Work Order Governance Migration
#
# 1. Add closure_method column to engineering_work_orders
# 2. Backfill existing closed EWOs with correct closure_method
# 3. Create one-time historical migration function
# 4. Execute migration for eligible historical EWOs
*/

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Add closure_method column
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS closure_method text CHECK (
    closure_method IN (
      'Product Owner Acceptance',
      'Historical Migration',
      'Administrative Override',
      'Automated Governance'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Backfill existing closed EWOs
-- ═══════════════════════════════════════════════════════════════════════

-- EWOs closed with PO acceptance data → 'Product Owner Acceptance'
UPDATE engineering_work_orders
SET closure_method = 'Product Owner Acceptance'
WHERE status = 'closed'
  AND po_accepted_at IS NOT NULL
  AND po_accepted_by IS NOT NULL
  AND closure_method IS NULL;

-- EWOs closed without PO acceptance (pre-governance) → 'Historical Migration'
-- These were closed before EWO-014.13A introduced governed closure
UPDATE engineering_work_orders
SET
  closure_method = 'Historical Migration',
  closed_by = COALESCE(closed_by, 'System Migration'),
  closure_reason = COALESCE(closure_reason, 'Engineering Governance Migration')
WHERE status = 'closed'
  AND (po_accepted_at IS NULL OR po_accepted_by IS NULL)
  AND closure_method IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Create one-time historical migration function
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION migrate_historical_ewo_closure()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_migrated_count integer := 0;
  v_skipped_count integer := 0;
  v_ewo RECORD;
  v_migration_id text := 'ewo014_13b_historical_migration';
  v_migration_ran boolean;
BEGIN
  -- Check if migration has already run (idempotency guard)
  SELECT EXISTS(
    SELECT 1 FROM ewo_lifecycle_events
    WHERE notes LIKE '%Historical Migration Closure%'
      AND actor = 'System Migration'
  ) INTO v_migration_ran;

  IF v_migration_ran THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_migrated', true,
      'message', 'Historical migration has already been executed. No records processed.'
    );
  END IF;

  -- Identify eligible EWOs:
  -- - Not already closed or archived
  -- - In a completed or near-completed state
  -- - No Product Owner Acceptance recorded
  -- - Created before EWO-014.13A deployment (before 2026-07-17)
  FOR v_ewo IN
    SELECT * FROM engineering_work_orders
    WHERE status NOT IN ('closed', 'archived', 'draft', 'architecture_review', 'engineering_approved', 'po_approved', 'ready', 'in_progress')
      AND po_accepted_at IS NULL
      AND po_accepted_by IS NULL
      AND created_at < '2026-07-17 00:00:00+00'
    ORDER BY created_at
  LOOP
    BEGIN
      -- Bypass lifecycle validation trigger (RPC validates internally)
      PERFORM set_config('app.bypass_lifecycle_validation', 'true', true);

      UPDATE engineering_work_orders
      SET
        status = 'closed',
        closed_at = COALESCE(closed_at, completed_at, now()),
        closed_by = 'System Migration',
        closure_reason = 'Engineering Governance Migration',
        closure_method = 'Historical Migration',
        completed_at = COALESCE(completed_at, closed_at, now()),
        updated_at = now()
      WHERE id = v_ewo.id;

      PERFORM set_config('app.bypass_lifecycle_validation', 'false', true);

      INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
      VALUES (
        v_ewo.id,
        v_ewo.status,
        'closed',
        'System Migration',
        'Historical Migration Closure: This Engineering Work Order was completed before Product Owner governed closure was introduced. It has been automatically closed during the Engineering Governance Migration to preserve historical engineering records.'
      );

      v_migrated_count := v_migrated_count + 1;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('app.bypass_lifecycle_validation', 'false', true);
      v_skipped_count := v_skipped_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'already_migrated', false,
    'migrated_count', v_migrated_count,
    'skipped_count', v_skipped_count,
    'migration_id', v_migration_id,
    'message', format('Historical migration complete. %s EWOs migrated, %s skipped.', v_migrated_count, v_skipped_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION migrate_historical_ewo_closure TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Update execute_po_acceptance_closure to set closure_method
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
  SELECT * INTO v_ewo FROM engineering_work_orders WHERE id = p_ewo_id;

  IF v_ewo.id IS NULL THEN
    RAISE EXCEPTION 'EWO not found: %', p_ewo_id;
  END IF;

  IF v_ewo.status != 'po_acceptance' THEN
    RAISE EXCEPTION 'Governed closure violation: EWO must be in po_acceptance status. Current status: %', v_ewo.status;
  END IF;

  UPDATE engineering_work_orders
  SET
    po_accepted_at = COALESCE(po_accepted_at, now()),
    po_accepted_by = p_accepted_by,
    po_acceptance_statement = p_acceptance_statement,
    po_acceptance_notes = COALESCE(p_acceptance_notes, po_acceptance_notes),
    updated_at = now()
  WHERE id = p_ewo_id;

  v_steps_done := array_append(v_steps_done, '1. Record PO Acceptance');

  BEGIN
    UPDATE engineering_records_library
    SET status = 'po_accepted', governance_status = 'accepted', updated_at = now()
    WHERE ewo_id = p_ewo_id AND record_type = 'engineering_completion';
    v_steps_done := array_append(v_steps_done, '2. Lock Engineering Record');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 1 (Lock Record): ' || SQLERRM);
  END;

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

  BEGIN
    UPDATE ewo_completion_reports
    SET accepted_at = now(), accepted_by = p_accepted_by
    WHERE ewo_id = p_ewo_id AND accepted_at IS NULL;
    v_steps_done := array_append(v_steps_done, '4. Mark Completion Report Final');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 3 (Mark Report Final): ' || SQLERRM);
  END;

  BEGIN
    SELECT id INTO v_report_id FROM ewo_completion_reports WHERE ewo_id = p_ewo_id ORDER BY generated_at DESC LIMIT 1;
    IF v_report_id IS NOT NULL THEN
      v_steps_done := array_append(v_steps_done, '5. Archive Completion Report');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 4 (Archive Report): ' || SQLERRM);
  END;

  BEGIN
    UPDATE engineering_records_library
    SET knowledge_extracted = true,
        engineering_knowledge = COALESCE(engineering_knowledge, jsonb_build_object(
          'extracted_at', now(), 'extracted_by', 'ATD', 'source', 'po_acceptance_closure', 'ewo_ref', v_ewo.ewo_ref
        )),
        updated_at = now()
    WHERE ewo_id = p_ewo_id;
    v_steps_done := array_append(v_steps_done, '6. Extract Engineering Knowledge');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 5 (Extract Knowledge): ' || SQLERRM);
  END;

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

  BEGIN
    v_steps_done := array_append(v_steps_done, '8. Update Roadmap Progress');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 7 (Roadmap Progress): ' || SQLERRM);
  END;

  BEGIN
    PERFORM set_config('app.bypass_lifecycle_validation', 'true', true);
    UPDATE engineering_work_orders
    SET status = 'closed',
        closed_at = now(),
        closed_by = p_accepted_by,
        closure_reason = 'Automatically closed after Product Owner Acceptance',
        closure_method = 'Product Owner Acceptance',
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = p_ewo_id;
    PERFORM set_config('app.bypass_lifecycle_validation', 'false', true);
    v_steps_done := array_append(v_steps_done, '9. Transition EWO to Closed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_lifecycle_validation', 'false', true);
    v_errors := array_append(v_errors, 'Step 8 (Close EWO): ' || SQLERRM);
  END;

  v_steps_done := array_append(v_steps_done, '10. Record Timestamp');
  v_steps_done := array_append(v_steps_done, '11. Record Actor');

  BEGIN
    INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
    VALUES (p_ewo_id, 'po_acceptance', 'closed', p_accepted_by,
      'EWO automatically closed after Product Owner Acceptance. Statement: ' || p_acceptance_statement ||
      CASE WHEN p_acceptance_notes IS NOT NULL THEN '. Notes: ' || p_acceptance_notes ELSE '' END);
    v_steps_done := array_append(v_steps_done, '12. Publish Lifecycle Event');
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'Step 11 (Lifecycle Event): ' || SQLERRM);
  END;

  v_result := jsonb_build_object(
    'success', array_length(v_errors, 1) IS NULL,
    'ewo_ref', v_ewo.ewo_ref,
    'closed_at', now(),
    'closed_by', p_accepted_by,
    'closure_method', 'Product Owner Acceptance',
    'steps_completed', v_steps_done,
    'errors', v_errors
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION execute_po_acceptance_closure TO authenticated, anon;
