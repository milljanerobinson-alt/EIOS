/*
# EWO-042S.3: Fix Correction RPC — Add Required object_type to Change Log Insert

## Purpose
Fixes the INSERT into engineering_change_log to include the required
`object_type` column (NOT NULL constraint).

## Changes
- The change log INSERT in `correct_canonical_ewo_ref()` now includes
  `object_type = 'engineering_work_order'` and `actor_type = 'product_owner'`.
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

  -- 1. Update the canonical ewo_ref (the only operational table to update in place)
  UPDATE engineering_work_orders
  SET ewo_ref = p_corrected_ref,
      updated_at = now()
  WHERE id = p_ewo_id;

  -- Clear the flag immediately
  PERFORM set_config('app.governed_ref_correction', 'false', false);

  -- 2. Append a NEW change log entry recording the correction
  --    (engineering_change_log is append-only — original entries preserved)
  INSERT INTO engineering_change_log (
    ewo_ref, change_type, object_type, summary, actor_type, actor, metadata
  ) VALUES (
    p_corrected_ref,
    'ref_correction',
    'engineering_work_order',
    'Canonical reference corrected: ' || p_current_ref || ' → ' || p_corrected_ref || '. ' || p_reason,
    'product_owner',
    p_po_identity,
    jsonb_build_object(
      'correction_type', 'canonical_ref_correction',
      'former_ref', p_current_ref,
      'corrected_ref', p_corrected_ref,
      'correlation_id', p_correlation_id
    )
  );

  -- 3. Preserve all append-only audit records:
  --    - engineering_change_log (original entry with ewo_ref = p_current_ref preserved)
  --    - ewo_creation_attempt_log (original entry preserved)
  --    - po_acceptance_governance_log (original entries preserved)
  --    - po_acceptance_governance_tokens (original entries preserved)
  --    The alias table provides forward resolution from former ref → corrected ref.

  -- 4. Create alias record
  INSERT INTO ewo_canonical_ref_aliases (
    ewo_id, former_ref, corrected_ref, correction_reason, corrected_by, correlation_id
  ) VALUES (
    p_ewo_id, p_current_ref, p_corrected_ref, p_reason, p_po_identity, p_correlation_id
  );

  -- 5. Record a lifecycle event noting the correction
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
