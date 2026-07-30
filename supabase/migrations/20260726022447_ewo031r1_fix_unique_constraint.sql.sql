/*
# EWO-031R.1 — Fix unique constraint on provider policy

The partial unique index on lifecycle_status='active' prevents the RPC
from superseding the old policy and inserting a new one in the same
transaction. Replace it with a regular index and enforce singularity
in the RPC itself.
*/

DROP INDEX IF EXISTS idx_execution_provider_policy_active;

CREATE INDEX IF NOT EXISTS idx_execution_provider_policy_status
  ON execution_provider_policy (lifecycle_status);

CREATE OR REPLACE FUNCTION set_governed_execution_provider_policy(
  p_preferred_provider_id text,
  p_default_provider_id text,
  p_allowed_provider_ids jsonb DEFAULT NULL,
  p_fallback_provider_id text DEFAULT NULL,
  p_fallback_permitted boolean DEFAULT false,
  p_updated_by text DEFAULT 'system',
  p_reason text DEFAULT NULL,
  p_linked_ewo_ref text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current record;
  v_new_version integer;
  v_audit_ref text;
  v_allowed jsonb;
BEGIN
  -- Validate providers are registered
  IF NOT EXISTS (SELECT 1 FROM execution_provider_registry WHERE provider_id = p_preferred_provider_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Preferred provider not registered', 'provider_id', p_preferred_provider_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM execution_provider_registry WHERE provider_id = p_default_provider_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Default provider not registered', 'provider_id', p_default_provider_id);
  END IF;

  -- Validate default provider is active
  IF NOT EXISTS (SELECT 1 FROM execution_provider_registry WHERE provider_id = p_default_provider_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Default provider must be active', 'provider_id', p_default_provider_id);
  END IF;

  -- Validate preferred provider is in allowed list
  v_allowed := COALESCE(p_allowed_provider_ids, jsonb_build_array(p_preferred_provider_id));
  IF NOT v_allowed ? p_preferred_provider_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Preferred provider must be in allowed providers list');
  END IF;

  -- Validate fallback constraint
  IF p_fallback_permitted = false AND p_fallback_provider_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fallback cannot be set when fallback_permitted is false');
  END IF;

  -- Get current policy
  SELECT * INTO v_current FROM execution_provider_policy WHERE lifecycle_status = 'active' LIMIT 1;
  v_new_version := COALESCE(v_current.policy_version, 0) + 1;
  v_audit_ref := 'EWO031R1-POLICY-' || v_new_version;

  -- Expire ALL existing active policies first
  UPDATE execution_provider_policy
  SET lifecycle_status = 'superseded', effective_until = now()
  WHERE lifecycle_status = 'active';

  -- Insert new policy
  INSERT INTO execution_provider_policy (
    policy_version, preferred_provider_id, default_provider_id,
    allowed_provider_ids, fallback_provider_id, fallback_permitted,
    lifecycle_status, effective_from,
    previous_preferred_provider_id, previous_default_provider_id, previous_fallback_permitted,
    updated_by, reason, linked_ewo_ref, audit_reference
  ) VALUES (
    v_new_version, p_preferred_provider_id, p_default_provider_id,
    v_allowed, p_fallback_provider_id, p_fallback_permitted,
    'active', now(),
    v_current.preferred_provider_id, v_current.default_provider_id, v_current.fallback_permitted,
    p_updated_by, p_reason, p_linked_ewo_ref, v_audit_ref
  );

  RETURN jsonb_build_object(
    'success', true,
    'policy_version', v_new_version,
    'preferred_provider_id', p_preferred_provider_id,
    'default_provider_id', p_default_provider_id,
    'allowed_provider_ids', v_allowed,
    'fallback_provider_id', p_fallback_provider_id,
    'fallback_permitted', p_fallback_permitted,
    'previous_preferred_provider_id', v_current.preferred_provider_id,
    'previous_default_provider_id', v_current.default_provider_id,
    'previous_fallback_permitted', v_current.fallback_permitted,
    'audit_reference', v_audit_ref
  );
END;
$$;
