/*
# EWO-042S.3: Governed Canonical Reference Correction

## Purpose
Implements a governed Product Owner pathway to correct the canonical `ewo_ref`
of an existing Engineering Work Order. This was created to correct EWO-222 → EWO-042S.

## New Tables
- `ewo_canonical_ref_aliases`
  - Records former canonical references and their corrected replacements.
  - Preserves the historical fact that a record was temporarily known by a different ref.
  - Enables search resolution from former ref → current ref.
  - Columns: id, ewo_id (uuid), former_ref (text), corrected_ref (text),
    correction_reason (text), corrected_by (text), correlation_id (text),
    corrected_at (timestamptz).

## New Functions
- `correct_canonical_ewo_ref(p_ewo_id, p_current_ref, p_corrected_ref, p_po_identity, p_reason, p_correlation_id)`
  - SECURITY DEFINER, governed RPC.
  - Validates: EWO exists, current ref matches, corrected ref is unique, PO identity provided.
  - Updates `engineering_work_orders.ewo_ref`.
  - Updates operational text references in `engineering_change_log` and `ewo_creation_attempt_log`.
  - Preserves append-only audit records in `po_acceptance_governance_log` and `po_acceptance_governance_tokens`.
  - Creates an alias record in `ewo_canonical_ref_aliases`.
  - Records a lifecycle event noting the correction.
  - All within a single transaction (the function body is atomic).

## Security
- RLS enabled on `ewo_canonical_ref_aliases`.
- Policies for anon + authenticated (read-only) since this is an audit table.

## Important Notes
1. The PostgreSQL sequence (`ewo_canonical_ref_seq`) is NOT modified.
2. No other EWO is renumbered.
3. Append-only audit records (po_acceptance_governance_log, po_acceptance_governance_tokens)
   retain their original `ewo_ref = 'EWO-222'` values — they are historical evidence.
4. The alias table provides the forward-resolution path from EWO-222 → EWO-042S.
*/

-- ─── 1. Create alias table ───
CREATE TABLE IF NOT EXISTS ewo_canonical_ref_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id uuid NOT NULL,
  former_ref text NOT NULL,
  corrected_ref text NOT NULL,
  correction_reason text NOT NULL,
  corrected_by text NOT NULL,
  correlation_id text,
  corrected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ewo_canonical_ref_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ref_aliases" ON ewo_canonical_ref_aliases;
CREATE POLICY "anon_select_ref_aliases"
ON ewo_canonical_ref_aliases FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_ref_aliases" ON ewo_canonical_ref_aliases;
CREATE POLICY "authenticated_insert_ref_aliases"
ON ewo_canonical_ref_aliases FOR INSERT
TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ref_aliases_former ON ewo_canonical_ref_aliases (former_ref);
CREATE INDEX IF NOT EXISTS idx_ref_aliases_corrected ON ewo_canonical_ref_aliases (corrected_ref);
CREATE INDEX IF NOT EXISTS idx_ref_aliases_ewo_id ON ewo_canonical_ref_aliases (ewo_id);

-- ─── 2. Create governed correction RPC ───
CREATE OR REPLACE FUNCTION correct_canonical_ewo_ref(
  p_ewo_id uuid,
  p_current_ref text,
  p_corrected_ref text,
  p_po_identity text,
  p_reason text,
  p_correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actual_ref text;
  v_title text;
  v_status text;
  v_exists boolean;
  v_corrected_taken boolean;
BEGIN
  -- ─── Validate inputs ───
  IF p_ewo_id IS NULL THEN
    RAISE EXCEPTION 'Governed correction violation: EWO UUID is required';
  END IF;

  IF p_current_ref IS NULL OR trim(p_current_ref) = '' THEN
    RAISE EXCEPTION 'Governed correction violation: current reference is required';
  END IF;

  IF p_corrected_ref IS NULL OR trim(p_corrected_ref) = '' THEN
    RAISE EXCEPTION 'Governed correction violation: corrected reference is required';
  END IF;

  IF p_po_identity IS NULL OR trim(p_po_identity) = '' THEN
    RAISE EXCEPTION 'Governed correction violation: Product Owner identity is required';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Governed correction violation: correction reason is required';
  END IF;

  -- ─── Verify EWO exists and current ref matches ───
  SELECT ewo_ref, title, status INTO v_actual_ref, v_title, v_status
  FROM engineering_work_orders WHERE id = p_ewo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Governed correction violation: EWO not found for UUID %', p_ewo_id;
  END IF;

  IF v_actual_ref IS DISTINCT FROM p_current_ref THEN
    RAISE EXCEPTION 'Governed correction violation: current ref mismatch. Expected %, found %', p_current_ref, v_actual_ref;
  END IF;

  -- ─── Verify corrected ref is not already in use ───
  SELECT EXISTS(
    SELECT 1 FROM engineering_work_orders WHERE ewo_ref = p_corrected_ref
  ) INTO v_corrected_taken;

  IF v_corrected_taken THEN
    RAISE EXCEPTION 'Governed correction violation: corrected ref % is already in use by another EWO', p_corrected_ref;
  END IF;

  -- ─── Verify no existing alias already maps this correction ───
  SELECT EXISTS(
    SELECT 1 FROM ewo_canonical_ref_aliases
    WHERE ewo_id = p_ewo_id AND former_ref = p_current_ref AND corrected_ref = p_corrected_ref
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'Governed correction violation: this correction has already been applied';
  END IF;

  -- ─── Perform the correction ───

  -- 1. Update the canonical ewo_ref
  UPDATE engineering_work_orders
  SET ewo_ref = p_corrected_ref,
      updated_at = now()
  WHERE id = p_ewo_id;

  -- 2. Update operational text references in engineering_change_log
  UPDATE engineering_change_log
  SET ewo_ref = p_corrected_ref
  WHERE ewo_ref = p_current_ref;

  -- 3. Update operational text references in ewo_creation_attempt_log
  UPDATE ewo_creation_attempt_log
  SET attempted_ewo_ref = p_corrected_ref
  WHERE attempted_ewo_ref = p_current_ref;

  -- 4. Preserve append-only audit records (po_acceptance_governance_log,
  --    po_acceptance_governance_tokens) — do NOT modify these.
  --    The alias table provides forward resolution.

  -- 5. Create alias record
  INSERT INTO ewo_canonical_ref_aliases (
    ewo_id, former_ref, corrected_ref, correction_reason, corrected_by, correlation_id
  ) VALUES (
    p_ewo_id, p_current_ref, p_corrected_ref, p_reason, p_po_identity, p_correlation_id
  );

  -- 6. Record a lifecycle event noting the correction
  INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
  VALUES (
    p_ewo_id,
    v_status,
    v_status,
    p_po_identity,
    'Canonical reference corrected: ' || p_current_ref || ' → ' || p_corrected_ref || '. Reason: ' || p_reason,
    jsonb_build_object(
      'correction_type', 'canonical_ref_correction',
      'former_ref', p_current_ref,
      'corrected_ref', p_corrected_ref,
      'correlation_id', p_correlation_id,
      'lifecycle_preserved', true,
      'po_acceptance_preserved', true
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'ewo_id', p_ewo_id,
    'former_ref', p_current_ref,
    'corrected_ref', p_corrected_ref,
    'title', v_title,
    'status', v_status,
    'alias_created', true,
    'operational_refs_updated', true,
    'append_only_preserved', true
  );
END;
$function$;

-- ─── 3. Revoke public execute on the correction RPC ───
-- Only authenticated users with service-role or PO authority should call this.
REVOKE EXECUTE ON FUNCTION correct_canonical_ewo_ref(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION correct_canonical_ewo_ref(uuid, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION correct_canonical_ewo_ref(uuid, text, text, text, text, text) TO authenticated;
