/*
# EWO-014.13C — Verification Auto-Transition Reliability
#
# Root Cause: The lifecycle validation trigger (trg_enforce_ewo_lifecycle)
# added in EWO-014.13A blocks auto_transition_verified_ewo from updating
# the EWO status because the function doesn't set app.bypass_lifecycle_validation.
#
# Fix: Update auto_transition_verified_ewo to:
#   1. Set bypass_lifecycle_validation before status updates
#   2. Return jsonb with success/failure details
#   3. Record lifecycle events for each transition step
#   4. Handle errors gracefully with rollback
#
# Also update update_ewo_verification_gate to propagate errors from auto_transition.
*/

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Drop and recreate auto_transition_verified_ewo with jsonb return
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS auto_transition_verified_ewo(uuid);

CREATE OR REPLACE FUNCTION auto_transition_verified_ewo(p_ewo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status text;
  v_all_verified boolean;
  v_steps_done text[] := ARRAY[]::text[];
  v_errors text[] := ARRAY[]::text[];
  v_events_before integer;
  v_events_after integer;
BEGIN
  SELECT status INTO v_current_status
  FROM engineering_work_orders WHERE id = p_ewo_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'EWO not found');
  END IF;

  -- Already at report_generated — idempotent return
  IF v_current_status = 'report_generated' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_done', true,
      'ewo_status', v_current_status,
      'message', 'Already at report_generated'
    );
  END IF;

  -- Check all gates verified
  SELECT bool_and(status = 'verified') INTO v_all_verified
  FROM ewo_verification_gates WHERE ewo_id = p_ewo_id;

  IF NOT v_all_verified THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not all verification gates are verified',
      'ewo_status', v_current_status
    );
  END IF;

  -- Lock all evidence (idempotent)
  UPDATE ewo_verification_gates
  SET evidence_locked = true, updated_at = now()
  WHERE ewo_id = p_ewo_id AND evidence_locked = false;

  v_steps_done := array_append(v_steps_done, '1. Evidence Locked');

  -- Bypass lifecycle validation for RPC-driven transitions
  PERFORM set_config('app.bypass_lifecycle_validation', 'true', true);

  -- Step 1: engineering_verification → verified
  IF v_current_status = 'engineering_verification' THEN
    BEGIN
      UPDATE engineering_work_orders
      SET status = 'verified', verification_status = 'verified',
          verified_at = COALESCE(verified_at, now()), updated_at = now()
      WHERE id = p_ewo_id;

      INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
      VALUES (p_ewo_id, 'engineering_verification', 'verified', 'platform',
              'All 5 verification gates passed. Auto-transitioned to Verified.');

      v_steps_done := array_append(v_steps_done, '2. Transitioned to Verified');
      v_current_status := 'verified';
    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, 'Step 1 (engineering_verification to verified): ' || SQLERRM);
    END;
  END IF;

  -- Step 2: verified → report_generated
  IF v_current_status = 'verified' THEN
    BEGIN
      UPDATE engineering_work_orders
      SET status = 'report_generated', updated_at = now()
      WHERE id = p_ewo_id;

      INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
      VALUES (p_ewo_id, 'verified', 'report_generated', 'platform',
              'Auto-transitioned to Report Ready. Completion report can now be generated.');

      v_steps_done := array_append(v_steps_done, '3. Transitioned to Report Ready');
      v_current_status := 'report_generated';
    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, 'Step 2 (verified to report_generated): ' || SQLERRM);
    END;
  END IF;

  -- Reset bypass flag
  PERFORM set_config('app.bypass_lifecycle_validation', 'false', true);

  -- Return result
  RETURN jsonb_build_object(
    'success', array_length(v_errors, 1) IS NULL,
    'ewo_status', v_current_status,
    'steps_completed', v_steps_done,
    'errors', v_errors,
    'lifecycle_events_added', array_length(v_steps_done, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_transition_verified_ewo TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Drop and recreate update_ewo_verification_gate with jsonb return
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS update_ewo_verification_gate(uuid, text, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION update_ewo_verification_gate(
  p_ewo_id uuid,
  p_gate_key text,
  p_status text,
  p_evidence_summary text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL,
  p_verified_by text DEFAULT 'platform',
  p_evidence_artefacts jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_all_verified boolean;
  v_gate_locked boolean;
  v_current_status text;
  v_auto_result jsonb;
BEGIN
  -- Check if gate is locked
  SELECT evidence_locked INTO v_gate_locked
  FROM ewo_verification_gates
  WHERE ewo_id = p_ewo_id AND gate_key = p_gate_key;

  IF v_gate_locked THEN
    RAISE EXCEPTION 'Gate % is locked. Evidence is immutable after Report Ready.', p_gate_key;
  END IF;

  -- Update the gate
  UPDATE ewo_verification_gates
  SET
    status = p_status,
    evidence_summary = COALESCE(p_evidence_summary, evidence_summary),
    failure_reason = p_failure_reason,
    verified_by = CASE WHEN p_status = 'verified' THEN p_verified_by ELSE verified_by END,
    verified_at = CASE WHEN p_status = 'verified' THEN now() ELSE verified_at END,
    evidence_artefacts = CASE WHEN p_evidence_artefacts IS NOT NULL THEN p_evidence_artefacts ELSE evidence_artefacts END,
    updated_at = now()
  WHERE ewo_id = p_ewo_id AND gate_key = p_gate_key;

  -- Check if all gates are verified
  SELECT bool_and(status = 'verified') INTO v_all_verified
  FROM ewo_verification_gates WHERE ewo_id = p_ewo_id;

  IF v_all_verified THEN
    -- Mark verification as verified
    UPDATE engineering_work_orders
    SET verification_status = 'verified', verified_at = COALESCE(verified_at, now()), updated_at = now()
    WHERE id = p_ewo_id;

    SELECT status INTO v_current_status FROM engineering_work_orders WHERE id = p_ewo_id;

    -- Auto-transition: engineering_verification → verified → report_generated
    IF v_current_status IN ('engineering_verification', 'verified') THEN
      v_auto_result := auto_transition_verified_ewo(p_ewo_id);

      IF NOT (v_auto_result->>'success')::boolean THEN
        -- Auto-transition failed — return error so frontend can show retry
        RETURN jsonb_build_object(
          'success', false,
          'gate_updated', true,
          'all_verified', true,
          'auto_transition_failed', true,
          'auto_transition_error', v_auto_result->>'error',
          'auto_transition_errors', v_auto_result->'errors',
          'ewo_status', v_current_status
        );
      END IF;
    END IF;

    SELECT status INTO v_current_status FROM engineering_work_orders WHERE id = p_ewo_id;

    RETURN jsonb_build_object(
      'success', true,
      'gate_updated', true,
      'all_verified', true,
      'auto_transitioned', true,
      'ewo_status', v_current_status
    );
  ELSE
    -- If any gate failed, mark as not_verified
    IF EXISTS (
      SELECT 1 FROM ewo_verification_gates
      WHERE ewo_id = p_ewo_id AND status = 'failed'
    ) THEN
      UPDATE engineering_work_orders
      SET verification_status = 'not_verified', updated_at = now()
      WHERE id = p_ewo_id;

      RETURN jsonb_build_object(
        'success', true,
        'gate_updated', true,
        'all_verified', false,
        'verification_status', 'not_verified'
      );
    ELSE
      UPDATE engineering_work_orders
      SET verification_status = 'in_progress', updated_at = now()
      WHERE id = p_ewo_id AND verification_status != 'verified';

      RETURN jsonb_build_object(
        'success', true,
        'gate_updated', true,
        'all_verified', false,
        'verification_status', 'in_progress'
      );
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_ewo_verification_gate TO authenticated, anon;
