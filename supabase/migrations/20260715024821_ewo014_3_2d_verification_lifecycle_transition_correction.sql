/*
# EWO-014.3.2D — Verification Lifecycle Transition Correction

## Root Cause
The original `update_ewo_verification_gate` function (6 parameters, without
`p_evidence_artefacts` and without the `auto_transition_verified_ewo` call)
was never dropped when the 7-parameter version was introduced in EWO-014.3.2C.
`CREATE OR REPLACE` cannot replace a function with a different signature, so
both overloads coexisted. PostgREST resolved RPC calls to the old 6-parameter
overload, which never called `auto_transition_verified_ewo()`.

## Fix
1. Drop the old 6-parameter overload explicitly.
2. Recreate the 7-parameter version as the sole function.
3. Add a defensive wrapper: if called with 6 args (no p_evidence_artefacts),
   it still works because the 7-param version has a DEFAULT of NULL for that
   parameter — PostgREST will now resolve to the single surviving function.
4. Also fix `auto_transition_verified_ewo` to handle the case where the EWO
   is already `verified` (idempotent re-entry safety).
*/

-- ─── 1. Drop the old 6-parameter overload ───────────────────────────────────

DROP FUNCTION IF EXISTS update_ewo_verification_gate(uuid, text, text, text, text, text);

-- ─── 2. Recreate the 7-parameter version as the sole function ────────────────

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
  FROM ewo_verification_gates
  WHERE ewo_id = p_ewo_id;

  IF v_all_verified THEN
    -- Mark verification as verified
    UPDATE engineering_work_orders
    SET verification_status = 'verified', verified_at = now(), updated_at = now()
    WHERE id = p_ewo_id;

    -- Auto-transition: engineering_verification → verified → report_generated
    PERFORM auto_transition_verified_ewo(p_ewo_id);
  ELSE
    -- If any gate failed, mark as not_verified
    IF EXISTS (
      SELECT 1 FROM ewo_verification_gates
      WHERE ewo_id = p_ewo_id AND status = 'failed'
    ) THEN
      UPDATE engineering_work_orders
      SET verification_status = 'not_verified', updated_at = now()
      WHERE id = p_ewo_id;
    ELSE
      UPDATE engineering_work_orders
      SET verification_status = 'in_progress', updated_at = now()
      WHERE id = p_ewo_id AND verification_status != 'verified';
    END IF;
  END IF;
END;
$$;

-- ─── 3. Fix auto_transition_verified_ewo for idempotent re-entry ─────────────

CREATE OR REPLACE FUNCTION auto_transition_verified_ewo(p_ewo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status text;
  v_all_verified boolean;
BEGIN
  SELECT status INTO v_current_status
  FROM engineering_work_orders WHERE id = p_ewo_id;

  SELECT bool_and(status = 'verified') INTO v_all_verified
  FROM ewo_verification_gates WHERE ewo_id = p_ewo_id;

  IF NOT v_all_verified THEN
    RETURN;
  END IF;

  -- Lock all evidence (idempotent)
  UPDATE ewo_verification_gates
  SET evidence_locked = true, updated_at = now()
  WHERE ewo_id = p_ewo_id AND evidence_locked = false;

  -- Step 1: engineering_verification → verified
  IF v_current_status = 'engineering_verification' THEN
    UPDATE engineering_work_orders
    SET status = 'verified', verification_status = 'verified',
        verified_at = now(), updated_at = now()
    WHERE id = p_ewo_id;

    INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
    VALUES (p_ewo_id, 'engineering_verification', 'verified', 'platform',
            'All 5 verification gates passed. Auto-transitioned to Verified.');

    v_current_status := 'verified';
  END IF;

  -- Step 2: verified → report_generated
  IF v_current_status = 'verified' THEN
    UPDATE engineering_work_orders
    SET status = 'report_generated', updated_at = now()
    WHERE id = p_ewo_id;

    INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
    VALUES (p_ewo_id, 'verified', 'report_generated', 'platform',
            'Auto-transitioned to Report Ready. Completion report can now be generated.');
  END IF;

  -- Step 3: if already report_generated, nothing to do (idempotent)
  IF v_current_status = 'report_generated' THEN
    RETURN;
  END IF;
END;
$$;
