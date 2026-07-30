/*
# Engineering Verification Lifecycle Completion — EWO-014.3.2C

## Purpose
Completes the Engineering Verification workflow so that the EWO lifecycle
automatically progresses through the constitutional verification stages and
report generation becomes available only when the workflow has been fully
satisfied.

## Changes

### 1. New lifecycle state: `engineering_verification`
The CHECK constraint on `engineering_work_orders.status` is updated to include
`engineering_verification`. Also includes `ready_for_review` which exists in
legacy data.

New lifecycle flow:
  engineering_validation → engineering_complete → engineering_verification → verified → report_generated

### 2. New column: `evidence_locked` on `ewo_verification_gates`
Boolean column. When true, prevents further modification of gate evidence/status.
Evidence becomes immutable once the EWO reaches Report Ready.

### 3. Updated RPCs
- `initialize_ewo_verification_gates`: Transitions EWO from engineering_complete → engineering_verification
- `update_ewo_verification_gate`: Accepts evidence_artefacts, auto-transitions when all gates pass
- `auto_transition_verified_ewo`: Transitions engineering_verification → verified → report_generated

## Security
- No new tables; existing RLS policies remain in effect.
- All RPCs are SECURITY DEFINER.
*/

-- ============================================================
-- 1. Add evidence_locked column to ewo_verification_gates
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ewo_verification_gates' AND column_name = 'evidence_locked'
  ) THEN
    ALTER TABLE ewo_verification_gates
      ADD COLUMN evidence_locked boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 2. Update CHECK constraint on engineering_work_orders.status
--    to include 'engineering_verification' and 'ready_for_review'
-- ============================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'engineering_work_orders' AND constraint_name = 'engineering_work_orders_status_check'
  ) THEN
    ALTER TABLE engineering_work_orders DROP CONSTRAINT engineering_work_orders_status_check;
  END IF;
  ALTER TABLE engineering_work_orders
    ADD CONSTRAINT engineering_work_orders_status_check
    CHECK (status IN (
      'draft', 'architecture_review', 'engineering_approved', 'po_approved',
      'ready', 'in_progress', 'engineering_validation', 'engineering_complete',
      'engineering_verification', 'verified', 'report_generated',
      'po_acceptance', 'closed', 'archived', 'ready_for_review'
    ));
END $$;

-- ============================================================
-- 3. Updated RPC: initialize_ewo_verification_gates
-- ============================================================

CREATE OR REPLACE FUNCTION initialize_ewo_verification_gates(p_ewo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO ewo_verification_gates (ewo_id, gate_key, gate_label, gate_order, status)
  VALUES
    (p_ewo_id, 'build',          'Build Verification',          1, 'not_started'),
    (p_ewo_id, 'functional',     'Functional Verification',     2, 'not_started'),
    (p_ewo_id, 'ui',             'UI Verification',             3, 'not_started'),
    (p_ewo_id, 'data',           'Data Verification',            4, 'not_started'),
    (p_ewo_id, 'constitutional', 'Constitutional Verification', 5, 'not_started')
  ON CONFLICT (ewo_id, gate_key) DO NOTHING;

  UPDATE engineering_work_orders
  SET verification_status = 'in_progress', updated_at = now()
  WHERE id = p_ewo_id AND verification_status = 'not_started';

  UPDATE engineering_work_orders
  SET status = 'engineering_verification', updated_at = now()
  WHERE id = p_ewo_id AND status = 'engineering_complete';

  INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
  SELECT p_ewo_id, 'engineering_complete', 'engineering_verification', 'platform',
         'Engineering verification workflow started'
  WHERE EXISTS (
    SELECT 1 FROM engineering_work_orders
    WHERE id = p_ewo_id AND status = 'engineering_verification'
  )
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events
    WHERE ewo_id = p_ewo_id AND to_status = 'engineering_verification'
  );
END;
$$;

-- ============================================================
-- 4. New RPC: auto_transition_verified_ewo
-- ============================================================

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

  -- Lock all evidence
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
END;
$$;

-- ============================================================
-- 5. Updated RPC: update_ewo_verification_gate
-- ============================================================

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
BEGIN
  SELECT evidence_locked INTO v_gate_locked
  FROM ewo_verification_gates
  WHERE ewo_id = p_ewo_id AND gate_key = p_gate_key;

  IF v_gate_locked THEN
    RAISE EXCEPTION 'Gate % is locked. Evidence is immutable after Report Ready.', p_gate_key;
  END IF;

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

  SELECT bool_and(status = 'verified') INTO v_all_verified
  FROM ewo_verification_gates
  WHERE ewo_id = p_ewo_id;

  IF v_all_verified THEN
    UPDATE engineering_work_orders
    SET verification_status = 'verified', verified_at = now(), updated_at = now()
    WHERE id = p_ewo_id;

    PERFORM auto_transition_verified_ewo(p_ewo_id);
  ELSE
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
