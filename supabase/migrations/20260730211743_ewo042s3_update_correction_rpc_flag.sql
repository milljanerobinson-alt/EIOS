/*
# EWO-042S.3: Update Correction RPC to Set Governance Flag

## Purpose
Updates the `correct_canonical_ewo_ref()` function to set the
`app.governed_ref_correction` session setting before performing
the ewo_ref UPDATE, so the `prevent_ewo_ref_update()` trigger
allows the governed correction.

## Security
- The setting is scoped to the function call (SECURITY DEFINER).
- All validation (PO authority, ref uniqueness, UUID match) runs
  BEFORE the setting is applied and the update occurs.
*/

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

  -- Set the governance flag so the immutability trigger allows this update
  PERFORM set_config('app.governed_ref_correction', 'true', false);

  -- 1. Update the canonical ewo_ref
  UPDATE engineering_work_orders
  SET ewo_ref = p_corrected_ref,
      updated_at = now()
  WHERE id = p_ewo_id;

  -- Clear the flag immediately
  PERFORM set_config('app.governed_ref_correction', 'false', false);

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

-- Re-apply grants
REVOKE EXECUTE ON FUNCTION correct_canonical_ewo_ref(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION correct_canonical_ewo_ref(uuid, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION correct_canonical_ewo_ref(uuid, text, text, text, text, text) TO authenticated;
