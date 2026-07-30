/*
# EWO-033 — Governed Administrative Closeout Function

The protect_po_acceptance_fields() trigger blocks direct updates to status='closed'.
The grant_governed_product_owner_acceptance() RPC is for PO acceptance only and
requires the EWO to be in 'po_acceptance' status.

This migration creates a new governed function for administrative closeout that:
1. Creates a governance token (same mechanism as PO acceptance)
2. Validates the closeout is legitimate (invalid allocation, test record, historical)
3. Updates the EWO to closed/archived status
4. Records an audit trail

This does NOT bypass PO acceptance — it is a separate governed path for
administrative lifecycle corrections that do not involve PO acceptance.
*/

CREATE OR REPLACE FUNCTION governed_administrative_closeout(
  p_ewo_ref text,
  p_closeout_type text,
  p_reason text,
  p_actor text DEFAULT 'governed_lifecycle_audit'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_ewo_id uuid;
  v_current_status text;
  v_target_status text;
  v_closure_method text;
  v_token text;
  v_now timestamptz := now();
BEGIN
  -- Validate closeout type
  IF p_closeout_type NOT IN ('invalid_allocation', 'test_record', 'historical_import', 'superseded', 'abandoned') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid closeout type. Must be one of: invalid_allocation, test_record, historical_import, superseded, abandoned');
  END IF;

  -- Get EWO
  SELECT id, status INTO v_ewo_id, v_current_status
  FROM engineering_work_orders WHERE ewo_ref = p_ewo_ref;

  IF v_ewo_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'EWO not found: ' || p_ewo_ref);
  END IF;

  -- Already terminal?
  IF v_current_status IN ('closed', 'archived') THEN
    RETURN jsonb_build_object('success', false, 'error', 'EWO already in terminal state: ' || v_current_status);
  END IF;

  -- Determine target status and closure method
  IF p_closeout_type = 'test_record' THEN
    v_target_status := 'archived';
    v_closure_method := 'Administrative Override';
  ELSE
    v_target_status := 'closed';
    v_closure_method := CASE p_closeout_type
      WHEN 'invalid_allocation' THEN 'Administrative Override'
      WHEN 'historical_import' THEN 'Historical Migration'
      WHEN 'superseded' THEN 'Administrative Override'
      WHEN 'abandoned' THEN 'Administrative Override'
    END;
  END IF;

  -- Create governance token
  v_token := gen_random_uuid()::text || '-' || extract(epoch from v_now)::bigint::text;
  INSERT INTO po_acceptance_governance_tokens (token, ewo_ref, created_by_function)
  VALUES (v_token, p_ewo_ref, 'governed_administrative_closeout');

  -- Update the EWO
  UPDATE engineering_work_orders
  SET status = v_target_status,
      closed_at = v_now,
      closed_by = p_actor,
      closure_method = v_closure_method,
      closure_reason = p_reason,
      updated_at = v_now
  WHERE id = v_ewo_id;

  -- Consume the token
  UPDATE po_acceptance_governance_tokens
  SET consumed_at = v_now
  WHERE ewo_ref = p_ewo_ref
    AND consumed_at IS NULL
    AND created_by_function = 'governed_administrative_closeout';

  -- Record lifecycle event
  INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
  VALUES (v_ewo_id, v_current_status, v_target_status, p_actor,
    'Governed administrative closeout: ' || p_closeout_type,
    jsonb_build_object(
      'closeout_type', p_closeout_type,
      'reason', p_reason,
      'governed_token', v_token,
      'audit_source', 'EWO-033_lifecycle_audit'
    ), v_now);

  RETURN jsonb_build_object(
    'success', true,
    'ewo_ref', p_ewo_ref,
    'from_status', v_current_status,
    'to_status', v_target_status,
    'closeout_type', p_closeout_type,
    'closed_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION governed_administrative_closeout(text, text, text, text) TO anon, authenticated;
