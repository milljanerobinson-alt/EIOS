/*
# EWO-031R.1 — Governed Execution Provider Activation

## Purpose
Implements the canonical governed execution-provider policy that:
1. Sets Codex as the preferred and default provider
2. Makes Codex active for governed selection
3. Deactivates Bolt (retains registration for historical evidence)
4. Disables fallback to Bolt
5. Records the governed policy change with audit evidence

## New Tables
- `execution_provider_policy` — Canonical provider selection policy
  (preferred_provider_id, default_provider_id, allowed_provider_ids,
   fallback_provider_id, fallback_permitted, policy_version, etc.)

## Existing Table Changes
- `execution_provider_registry` — Codex set to is_active=true, Bolt set to is_active=false
  (no columns added, no data deleted)

## New RPCs
- `set_governed_execution_provider_policy` — Governed policy change operation
- `inspect_execution_provider_policy` — Read-only provider policy inspection

## RLS
- execution_provider_policy: anon+authenticated (no-auth app pattern)
*/

-- ─── 1. Execution Provider Policy Table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_provider_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version integer NOT NULL DEFAULT 1,
  preferred_provider_id text NOT NULL,
  default_provider_id text NOT NULL,
  allowed_provider_ids jsonb NOT NULL DEFAULT '["codex"]'::jsonb,
  fallback_provider_id text,
  fallback_permitted boolean NOT NULL DEFAULT false,
  lifecycle_status text NOT NULL DEFAULT 'active',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  previous_preferred_provider_id text,
  previous_default_provider_id text,
  previous_fallback_permitted boolean,
  updated_by text NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  linked_ewo_ref text,
  audit_reference text
);

-- Only one active policy at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_provider_policy_active
  ON execution_provider_policy (lifecycle_status)
  WHERE lifecycle_status = 'active';

ALTER TABLE execution_provider_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_provider_policy" ON execution_provider_policy;
CREATE POLICY "anon_select_provider_policy" ON execution_provider_policy FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_provider_policy" ON execution_provider_policy;
CREATE POLICY "anon_insert_provider_policy" ON execution_provider_policy FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_provider_policy" ON execution_provider_policy;
CREATE POLICY "anon_update_provider_policy" ON execution_provider_policy FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- ─── 2. Activate Codex, Deactivate Bolt ────────────────────────────────────────

UPDATE execution_provider_registry SET is_active = true, updated_at = now()
WHERE provider_id = 'codex';

UPDATE execution_provider_registry SET is_active = false, updated_at = now()
WHERE provider_id = 'bolt';

-- ─── 3. Seed Initial Policy ────────────────────────────────────────────────────

INSERT INTO execution_provider_policy (
  policy_version, preferred_provider_id, default_provider_id,
  allowed_provider_ids, fallback_provider_id, fallback_permitted,
  lifecycle_status, effective_from,
  previous_preferred_provider_id, previous_default_provider_id, previous_fallback_permitted,
  updated_by, reason, audit_reference
)
SELECT
  1, 'codex', 'codex',
  '["codex"]'::jsonb, null, false,
  'active', now(),
  'bolt', 'bolt', true,
  'EWO-031R.1', 'Governed provider activation: Codex set as preferred and default provider. Bolt deactivated. Fallback disabled.',
  'EWO031R1-POLICY-001'
WHERE NOT EXISTS (
  SELECT 1 FROM execution_provider_policy WHERE lifecycle_status = 'active'
);

-- ─── 4. Governed RPC: Set Provider Policy ──────────────────────────────────────

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

  -- Expire current policy
  IF v_current IS NOT NULL THEN
    UPDATE execution_provider_policy
    SET lifecycle_status = 'superseded', effective_until = now()
    WHERE id = v_current.id;
  END IF;

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

-- ─── 5. Governed RPC: Inspect Provider Policy ──────────────────────────────────

CREATE OR REPLACE FUNCTION inspect_execution_provider_policy(
  p_ewo_ref text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_policy record;
  v_providers jsonb;
  v_ewo record;
  v_ewo_provider text;
BEGIN
  -- Get active policy
  SELECT * INTO v_policy FROM execution_provider_policy WHERE lifecycle_status = 'active' LIMIT 1;

  -- Get all registered providers with lifecycle details
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_providers
  FROM (
    SELECT
      provider_id,
      provider_name,
      provider_version,
      provider_type,
      provider_type_detail,
      is_active,
      is_governed,
      configuration_status,
      credential_reference_status,
      provider_health,
      permitted_environments
    FROM execution_provider_registry
    ORDER BY provider_id
  ) t;

  -- Get EWO-specific provider if requested
  IF p_ewo_ref IS NOT NULL THEN
    SELECT implementation_provider, implementation_status INTO v_ewo
    FROM engineering_work_orders WHERE ewo_ref = p_ewo_ref;
    IF FOUND THEN
      v_ewo_provider := COALESCE(v_ewo.implementation_provider, v_policy.default_provider_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'policy_version', v_policy.policy_version,
    'preferred_provider_id', v_policy.preferred_provider_id,
    'default_provider_id', v_policy.default_provider_id,
    'allowed_provider_ids', v_policy.allowed_provider_ids,
    'fallback_provider_id', v_policy.fallback_provider_id,
    'fallback_permitted', v_policy.fallback_permitted,
    'lifecycle_status', v_policy.lifecycle_status,
    'registered_providers', v_providers,
    'ewo_ref', p_ewo_ref,
    'ewo_implementation_provider', v_ewo_provider,
    'ewo_selected_provider', COALESCE(v_ewo_provider, v_policy.default_provider_id),
    'provider_selection_reason',
      CASE
        WHEN p_ewo_ref IS NOT NULL THEN 'EWO provider resolved to: ' || COALESCE(v_ewo_provider, v_policy.default_provider_id) || ' (governed default: ' || v_policy.default_provider_id || ')'
        ELSE 'Default governed provider: ' || v_policy.default_provider_id
      END
  );
END;
$$;
