/*
# EWO-014.3.2E — Verification Lifecycle Diagnostic

## Purpose
Instrument the entire transition path to determine exactly where execution
stops. No workflow changes — diagnostic evidence only.

## Diagnostic Table
A temporary table to capture every step of the RPC execution trace.
*/

CREATE TABLE IF NOT EXISTS ewo_verification_trace (
  id          serial PRIMARY KEY,
  trace_id    text NOT NULL,
  step        integer NOT NULL,
  step_name   text NOT NULL,
  detail      text,
  ewo_id      uuid,
  ewo_status  text,
  gate_key    text,
  gate_status text,
  all_verified boolean,
  error_msg   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ewo_verification_trace ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trace_select" ON ewo_verification_trace;
CREATE POLICY "trace_select" ON ewo_verification_trace FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "trace_insert" ON ewo_verification_trace;
CREATE POLICY "trace_insert" ON ewo_verification_trace FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "trace_delete" ON ewo_verification_trace;
CREATE POLICY "trace_delete" ON ewo_verification_trace FOR DELETE
  TO anon, authenticated USING (true);

-- ─── Instrumented update_ewo_verification_gate ──────────────────────────────
-- Replaces the existing function with an identical version that writes
-- a trace record at every critical step.

CREATE OR REPLACE FUNCTION update_ewo_verification_gate(
  p_ewo_id uuid,
  p_gate_key text,
  p_status text,
  p_evidence_summary text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL,
  p_verified_by text DEFAULT 'platform',
  p_evidence_artefacts jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_all_verified boolean;
  v_gate_locked boolean;
  v_current_status text;
  v_trace_id text := gen_random_uuid()::text;
  v_step integer := 0;
BEGIN
  v_step := v_step + 1;
  INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, gate_key, gate_status)
  VALUES (v_trace_id, v_step, 'RPC_ENTERED', 'update_ewo_verification_gate called', p_ewo_id, p_gate_key, p_status);

  -- Check if gate is locked
  SELECT evidence_locked INTO v_gate_locked
  FROM ewo_verification_gates
  WHERE ewo_id = p_ewo_id AND gate_key = p_gate_key;

  v_step := v_step + 1;
  INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, gate_key, gate_status)
  VALUES (v_trace_id, v_step, 'GATE_LOCK_CHECK', 'evidence_locked = ' || COALESCE(v_gate_locked::text, 'NULL'), p_ewo_id, p_gate_key, p_status);

  IF v_gate_locked THEN
    v_step := v_step + 1;
    INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, gate_key, error_msg)
    VALUES (v_trace_id, v_step, 'GATE_LOCKED_EXCEPTION', 'Gate is locked, raising exception', p_ewo_id, p_gate_key, 'Gate locked');
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

  v_step := v_step + 1;
  INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, gate_key, gate_status)
  VALUES (v_trace_id, v_step, 'GATE_UPDATED', 'Gate status set to ' || p_status, p_ewo_id, p_gate_key, p_status);

  -- Check if all gates are verified
  SELECT bool_and(status = 'verified') INTO v_all_verified
  FROM ewo_verification_gates
  WHERE ewo_id = p_ewo_id;

  v_step := v_step + 1;
  INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, all_verified)
  VALUES (v_trace_id, v_step, 'ALL_VERIFIED_CHECK', 'bool_and = ' || COALESCE(v_all_verified::text, 'NULL'), p_ewo_id, v_all_verified);

  IF v_all_verified THEN
    -- Mark verification as verified
    UPDATE engineering_work_orders
    SET verification_status = 'verified', verified_at = now(), updated_at = now()
    WHERE id = p_ewo_id;

    SELECT status INTO v_current_status FROM engineering_work_orders WHERE id = p_ewo_id;

    v_step := v_step + 1;
    INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, ewo_status)
    VALUES (v_trace_id, v_step, 'VERIFICATION_STATUS_SET', 'verification_status=verified, ewo_status=' || v_current_status, p_ewo_id, v_current_status);

    -- Auto-transition: engineering_verification → verified → report_generated
    v_step := v_step + 1;
    INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, ewo_status)
    VALUES (v_trace_id, v_step, 'CALLING_AUTO_TRANSITION', 'About to call auto_transition_verified_ewo', p_ewo_id, v_current_status);

    PERFORM auto_transition_verified_ewo(p_ewo_id);

    SELECT status INTO v_current_status FROM engineering_work_orders WHERE id = p_ewo_id;

    v_step := v_step + 1;
    INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, ewo_status)
    VALUES (v_trace_id, v_step, 'AUTO_TRANSITION_RETURNED', 'auto_transition finished, ewo_status=' || v_current_status, p_ewo_id, v_current_status);
  ELSE
    -- If any gate failed, mark as not_verified
    IF EXISTS (
      SELECT 1 FROM ewo_verification_gates
      WHERE ewo_id = p_ewo_id AND status = 'failed'
    ) THEN
      UPDATE engineering_work_orders
      SET verification_status = 'not_verified', updated_at = now()
      WHERE id = p_ewo_id;

      v_step := v_step + 1;
      INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id)
      VALUES (v_trace_id, v_step, 'GATE_FAILED', 'Some gate failed, verification_status=not_verified', p_ewo_id);
    ELSE
      UPDATE engineering_work_orders
      SET verification_status = 'in_progress', updated_at = now()
      WHERE id = p_ewo_id AND verification_status != 'verified';

      v_step := v_step + 1;
      INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id)
      VALUES (v_trace_id, v_step, 'GATES_INCOMPLETE', 'Not all gates verified, verification_status=in_progress', p_ewo_id);
    END IF;
  END IF;

  v_step := v_step + 1;
  INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id)
  VALUES (v_trace_id, v_step, 'RPC_EXIT', 'update_ewo_verification_gate completed', p_ewo_id);
END;
$$;

-- ─── Instrumented auto_transition_verified_ewo ──────────────────────────────

CREATE OR REPLACE FUNCTION auto_transition_verified_ewo(p_ewo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status text;
  v_all_verified boolean;
  v_trace_id text := gen_random_uuid()::text;
  v_step integer := 0;
  v_events_before integer;
  v_events_after integer;
BEGIN
  v_step := v_step + 1;
  INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id)
  VALUES (v_trace_id, v_step, 'AUTO_TRANS_ENTERED', 'auto_transition_verified_ewo called', p_ewo_id);

  SELECT status INTO v_current_status
  FROM engineering_work_orders WHERE id = p_ewo_id;

  v_step := v_step + 1;
  INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, ewo_status)
  VALUES (v_trace_id, v_step, 'CURRENT_STATUS', 'EWO status on entry: ' || COALESCE(v_current_status, 'NULL'), p_ewo_id, v_current_status);

  SELECT bool_and(status = 'verified') INTO v_all_verified
  FROM ewo_verification_gates WHERE ewo_id = p_ewo_id;

  v_step := v_step + 1;
  INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, all_verified)
  VALUES (v_trace_id, v_step, 'ALL_GATES_VERIFIED', 'bool_and = ' || COALESCE(v_all_verified::text, 'NULL'), p_ewo_id, v_all_verified);

  IF NOT v_all_verified THEN
    v_step := v_step + 1;
    INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, all_verified)
    VALUES (v_trace_id, v_step, 'EARLY_RETURN', 'Not all gates verified, returning early', p_ewo_id, v_all_verified);
    RETURN;
  END IF;

  -- Lock all evidence (idempotent)
  UPDATE ewo_verification_gates
  SET evidence_locked = true, updated_at = now()
  WHERE ewo_id = p_ewo_id AND evidence_locked = false;

  v_step := v_step + 1;
  INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id)
  VALUES (v_trace_id, v_step, 'EVIDENCE_LOCKED', 'All gate evidence locked', p_ewo_id);

  -- Step 1: engineering_verification → verified
  IF v_current_status = 'engineering_verification' THEN
    UPDATE engineering_work_orders
    SET status = 'verified', verification_status = 'verified',
        verified_at = now(), updated_at = now()
    WHERE id = p_ewo_id;

    SELECT status INTO v_current_status FROM engineering_work_orders WHERE id = p_ewo_id;

    v_step := v_step + 1;
    INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, ewo_status)
    VALUES (v_trace_id, v_step, 'STEP1_UPDATE', 'Updated to verified, status now: ' || v_current_status, p_ewo_id, v_current_status);

    SELECT count(*) INTO v_events_before FROM ewo_lifecycle_events WHERE ewo_id = p_ewo_id;

    INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
    VALUES (p_ewo_id, 'engineering_verification', 'verified', 'platform',
            'All 5 verification gates passed. Auto-transitioned to Verified.');

    SELECT count(*) INTO v_events_after FROM ewo_lifecycle_events WHERE ewo_id = p_ewo_id;

    v_step := v_step + 1;
    INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, ewo_status)
    VALUES (v_trace_id, v_step, 'STEP1_LIFECYCLE_EVENT', 'Inserted event, events before=' || v_events_before || ' after=' || v_events_after, p_ewo_id, v_current_status);

    v_current_status := 'verified';
  END IF;

  -- Step 2: verified → report_generated
  IF v_current_status = 'verified' THEN
    UPDATE engineering_work_orders
    SET status = 'report_generated', updated_at = now()
    WHERE id = p_ewo_id;

    SELECT status INTO v_current_status FROM engineering_work_orders WHERE id = p_ewo_id;

    v_step := v_step + 1;
    INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, ewo_status)
    VALUES (v_trace_id, v_step, 'STEP2_UPDATE', 'Updated to report_generated, status now: ' || v_current_status, p_ewo_id, v_current_status);

    SELECT count(*) INTO v_events_before FROM ewo_lifecycle_events WHERE ewo_id = p_ewo_id;

    INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
    VALUES (p_ewo_id, 'verified', 'report_generated', 'platform',
            'Auto-transitioned to Report Ready. Completion report can now be generated.');

    SELECT count(*) INTO v_events_after FROM ewo_lifecycle_events WHERE ewo_id = p_ewo_id;

    v_step := v_step + 1;
    INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, ewo_status)
    VALUES (v_trace_id, v_step, 'STEP2_LIFECYCLE_EVENT', 'Inserted event, events before=' || v_events_before || ' after=' || v_events_after, p_ewo_id, v_current_status);
  END IF;

  -- Step 3: if already report_generated, nothing to do (idempotent)
  IF v_current_status = 'report_generated' THEN
    v_step := v_step + 1;
    INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, ewo_status)
    VALUES (v_trace_id, v_step, 'ALREADY_REPORT_GENERATED', 'Already at report_generated, idempotent return', p_ewo_id, v_current_status);
  END IF;

  v_step := v_step + 1;
  INSERT INTO ewo_verification_trace (trace_id, step, step_name, detail, ewo_id, ewo_status)
  VALUES (v_trace_id, v_step, 'AUTO_TRANS_EXIT', 'auto_transition_verified_ewo completed', p_ewo_id, v_current_status);
END;
$$;
