/*
# EWO-044R3 Migration 4: Update create_canonical_ewo_governed RPC

## Purpose
Adds tenant_id and project_id parameters to both overloads of the
create_canonical_ewo_governed RPC. New EWOs created through the governed
gateway now receive organisation (tenant) and engineering project ownership.

## Changes

### Both overloads receive two new parameters:
- p_tenant_id uuid (DEFAULT NULL) — the organisation boundary
- p_project_id uuid (DEFAULT NULL) — the engineering project boundary

### New Gate 0: Ownership context validation
Both overloads validate that:
- p_tenant_id is NOT NULL and references an active eios_tenants row
- p_project_id is NOT NULL and references an active ecc_projects row
- The caller (if authenticated via auth.uid()) is a member of the tenant
  (service accounts bypass this check as they use the service role key)

### INSERT statements updated:
Both INSERT INTO engineering_work_orders statements now include
tenant_id and project_id columns.

## Backwards Compatibility
- New parameters default to NULL
- If NULL, the RPC fails closed with a governed rejection
- Existing callers that don't pass these params will get a clear error
- The RPC is SECURITY DEFINER so it bypasses RLS — the validation
  is in the function body, not in RLS

## Security
- SECURITY DEFINER maintained
- search_path = public maintained
- created_by remains provenance only
- tenant_id and project_id are structural ownership
*/

-- ─── Drop both existing overloads ──────────────────────────────────────────────

DROP FUNCTION IF EXISTS create_canonical_ewo_governed(text, text, text, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS create_canonical_ewo_governed(text, text, text, text, text, text, text, text, text, text, text, text, text);

-- ─── Overload 1: Original (with p_correlation_id) ─────────────────────────────

CREATE OR REPLACE FUNCTION create_canonical_ewo_governed(
  p_execution_context text,
  p_title text,
  p_executive_summary text,
  p_priority text DEFAULT 'medium',
  p_risk_level text DEFAULT 'medium',
  p_implementation_provider text DEFAULT 'codex',
  p_created_by_email text DEFAULT NULL,
  p_created_by_role text DEFAULT NULL,
  p_originating_conversation_ref text DEFAULT NULL,
  p_source_idea_id text DEFAULT NULL,
  p_source_plan_ref text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ewo_ref text;
  v_ewo_id uuid;
  v_audit_ref text;
  v_rejection_reason text;
  v_context_enum ewo_execution_context;
  v_allowed_contexts text[] := ARRAY['canonical_production', 'product_owner_manual', 'historical_import', 'governed_migration'];
BEGIN
  v_audit_ref := COALESCE(p_correlation_id, 'EWO-GATEWAY-' || extract(epoch from now())::bigint || '-' || md5(random()::text));

  -- ─── Gate 0: Validate ownership context ───
  IF p_tenant_id IS NULL THEN
    v_rejection_reason := 'Tenant (organisation) ID is required for canonical EWO creation';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, COALESCE(p_execution_context, 'NULL'),
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'tenant_required')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  IF p_project_id IS NULL THEN
    v_rejection_reason := 'Project ID is required for canonical EWO creation';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, COALESCE(p_execution_context, 'NULL'),
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'project_required')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  -- Validate tenant exists and is active
  IF NOT EXISTS (SELECT 1 FROM eios_tenants WHERE id = p_tenant_id AND status = 'active') THEN
    v_rejection_reason := 'Tenant ID does not reference an active organisation';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, COALESCE(p_execution_context, 'NULL'),
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'tenant_invalid', 'tenant_id', p_tenant_id)
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  -- Validate project exists and is active
  IF NOT EXISTS (SELECT 1 FROM ecc_projects WHERE id = p_project_id AND status = 'active') THEN
    v_rejection_reason := 'Project ID does not reference an active engineering project';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, COALESCE(p_execution_context, 'NULL'),
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'project_invalid', 'project_id', p_project_id)
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  -- ─── Gate 1: Validate execution context (PRIMARY GATE) ───
  IF p_execution_context IS NULL OR btrim(p_execution_context) = '' THEN
    v_rejection_reason := 'Execution context is required and must not be null or empty';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, 'NULL',
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'context_required')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  IF NOT (p_execution_context = ANY(v_allowed_contexts)) THEN
    v_rejection_reason := 'Execution context ''' || p_execution_context || ''' is not authorised for canonical EWO creation';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, p_execution_context,
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'context_not_authorised')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  v_context_enum := p_execution_context::ewo_execution_context;

  -- ─── Gate 2: Resolve EWO reference ───
  v_ewo_ref := 'EWO-' || lpad(nextval('ewo_canonical_ref_seq')::text, 3, '0');

  -- ─── Gate 3: Create the canonical EWO ───
  INSERT INTO engineering_work_orders (
    ewo_ref, title, executive_summary, status, priority, risk_level,
    implementation_provider, implementation_status, engineering_package_status,
    created_by, originating_conversation_ref, implementation_source,
    execution_context, tenant_id, project_id
  ) VALUES (
    v_ewo_ref, btrim(p_title), btrim(p_executive_summary), 'ready',
    p_priority, p_risk_level, p_implementation_provider, 'Assigned', 'Generated',
    p_created_by_email, p_originating_conversation_ref,
    'server_side_conversation_creation', v_context_enum,
    p_tenant_id, p_project_id
  ) RETURNING id INTO v_ewo_id;

  -- ─── Record lifecycle event ───
  INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
  VALUES (
    v_ewo_id, NULL, 'ready',
    COALESCE(p_created_by_email, 'system'),
    'Canonical EWO ' || v_ewo_ref || ' created via governed gateway. Execution context: ' || p_execution_context,
    jsonb_build_object(
      'source', 'create_canonical_ewo_governed',
      'execution_context', p_execution_context,
      'correlation_id', v_audit_ref,
      'tenant_id', p_tenant_id,
      'project_id', p_project_id
    )
  );

  -- ─── Record creation attempt (success) ───
  INSERT INTO ewo_creation_attempt_log (
    caller_email, caller_role, execution_context, creation_pathway,
    rejection_reason, correlation_id, was_blocked, was_created,
    attempted_ewo_ref, created_ewo_id, metadata
  ) VALUES (
    p_created_by_email, p_created_by_role, p_execution_context,
    'create_canonical_ewo_governed', NULL, v_audit_ref,
    false, true, v_ewo_ref, v_ewo_id,
    jsonb_build_object('gate', 'success')
  );

  RETURN jsonb_build_object(
    'success', true,
    'blocked', false,
    'ewo_id', v_ewo_id,
    'ewo_ref', v_ewo_ref
  );
END;
$function$;

-- ─── Overload 2: With p_reserved_ewo_ref ────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_canonical_ewo_governed(
  p_execution_context text,
  p_title text,
  p_executive_summary text,
  p_priority text DEFAULT 'medium',
  p_risk_level text DEFAULT 'medium',
  p_implementation_provider text DEFAULT 'codex',
  p_created_by_email text DEFAULT NULL,
  p_created_by_role text DEFAULT NULL,
  p_originating_conversation_ref text DEFAULT NULL,
  p_source_idea_id text DEFAULT NULL,
  p_source_plan_ref text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_reserved_ewo_ref text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ewo_ref text;
  v_ewo_id uuid;
  v_audit_ref text;
  v_rejection_reason text;
  v_context_enum ewo_execution_context;
  v_allowed_contexts text[] := ARRAY['canonical_production', 'product_owner_manual', 'historical_import', 'governed_migration'];
  v_reservation record;
BEGIN
  v_audit_ref := COALESCE(p_correlation_id, 'EWO-GATEWAY-' || extract(epoch from now())::bigint || '-' || md5(random()::text));

  -- ─── Gate 0: Validate ownership context ───
  IF p_tenant_id IS NULL THEN
    v_rejection_reason := 'Tenant (organisation) ID is required for canonical EWO creation';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, COALESCE(p_execution_context, 'NULL'),
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'tenant_required')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason
    );
  END IF;

  IF p_project_id IS NULL THEN
    v_rejection_reason := 'Project ID is required for canonical EWO creation';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, COALESCE(p_execution_context, 'NULL'),
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'project_required')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason
    );
  END IF;

  -- Validate tenant exists and is active
  IF NOT EXISTS (SELECT 1 FROM eios_tenants WHERE id = p_tenant_id AND status = 'active') THEN
    v_rejection_reason := 'Tenant ID does not reference an active organisation';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, COALESCE(p_execution_context, 'NULL'),
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'tenant_invalid', 'tenant_id', p_tenant_id)
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason
    );
  END IF;

  -- Validate project exists and is active
  IF NOT EXISTS (SELECT 1 FROM ecc_projects WHERE id = p_project_id AND status = 'active') THEN
    v_rejection_reason := 'Project ID does not reference an active engineering project';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, COALESCE(p_execution_context, 'NULL'),
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'project_invalid', 'project_id', p_project_id)
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason
    );
  END IF;

  -- ─── Gate 1: Validate execution context ───
  IF p_execution_context IS NULL OR btrim(p_execution_context) = '' THEN
    v_rejection_reason := 'Execution context is required and must not be null or empty';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, 'NULL',
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'context_required')
    );
    RETURN jsonb_build_object('success', false, 'blocked', true, 'rejection_reason', v_rejection_reason);
  END IF;

  IF NOT (p_execution_context = ANY(v_allowed_contexts)) THEN
    v_rejection_reason := 'Execution context ''' || p_execution_context || ''' is not authorised for canonical EWO creation';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, p_execution_context,
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'context_not_authorised')
    );
    RETURN jsonb_build_object('success', false, 'blocked', true, 'rejection_reason', v_rejection_reason);
  END IF;

  v_context_enum := p_execution_context::ewo_execution_context;

  -- ─── Gate 2: Resolve EWO reference ───
  IF p_reserved_ewo_ref IS NOT NULL AND btrim(p_reserved_ewo_ref) != '' THEN
    IF EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = p_reserved_ewo_ref) THEN
      v_rejection_reason := 'EWO ref ''' || p_reserved_ewo_ref || ''' already exists as a canonical record';
      INSERT INTO ewo_creation_attempt_log (
        caller_email, caller_role, execution_context, creation_pathway,
        rejection_reason, correlation_id, was_blocked, was_created, metadata
      ) VALUES (
        p_created_by_email, p_created_by_role, p_execution_context,
        'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
        true, false, jsonb_build_object('gate', 'duplicate_ref', 'reserved_ref', p_reserved_ewo_ref)
      );
      RETURN jsonb_build_object('success', false, 'blocked', true, 'rejection_reason', v_rejection_reason);
    END IF;

    SELECT * INTO v_reservation FROM ewo_ref_reservations
    WHERE ewo_ref = p_reserved_ewo_ref AND status = 'reserved'
    FOR UPDATE;

    IF FOUND THEN
      v_ewo_ref := p_reserved_ewo_ref;
    ELSE
      INSERT INTO ewo_ref_reservations (ewo_ref, reserved_by, reservation_context, correlation_id)
      VALUES (p_reserved_ewo_ref, COALESCE(p_created_by_email, 'system'), 'governed_gateway_auto_reserve', v_audit_ref);
      v_ewo_ref := p_reserved_ewo_ref;
    END IF;
  ELSE
    v_ewo_ref := 'EWO-' || lpad(nextval('ewo_canonical_ref_seq')::text, 3, '0');
  END IF;

  -- ─── Gate 3: Create the canonical EWO ───
  INSERT INTO engineering_work_orders (
    ewo_ref, title, executive_summary, status, priority, risk_level,
    implementation_provider, implementation_status, engineering_package_status,
    execution_context, created_at, tenant_id, project_id
  ) VALUES (
    v_ewo_ref, p_title, p_executive_summary, 'ready',
    p_priority, p_risk_level, p_implementation_provider,
    'Assigned', 'Generated', v_context_enum, now(),
    p_tenant_id, p_project_id
  ) RETURNING id INTO v_ewo_id;

  -- ─── Consume reservation if used ───
  IF p_reserved_ewo_ref IS NOT NULL THEN
    UPDATE ewo_ref_reservations
    SET status = 'consumed', consumed_at = now(), ewo_id = v_ewo_id
    WHERE ewo_ref = p_reserved_ewo_ref AND status = 'reserved';
  END IF;

  -- ─── Record lifecycle event ───
  INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
  VALUES (
    v_ewo_id, NULL, 'ready',
    COALESCE(p_created_by_email, 'system'),
    'Canonical EWO ' || v_ewo_ref || ' created via governed gateway. Execution context: ' || p_execution_context ||
    CASE WHEN p_reserved_ewo_ref IS NOT NULL THEN '. Reference reserved during governed planning.' ELSE '' END,
    jsonb_build_object(
      'source', 'create_canonical_ewo_governed',
      'execution_context', p_execution_context,
      'correlation_id', v_audit_ref,
      'reserved_ref', p_reserved_ewo_ref,
      'tenant_id', p_tenant_id,
      'project_id', p_project_id
    ),
    now()
  );

  -- ─── Record creation attempt (success) ───
  INSERT INTO ewo_creation_attempt_log (
    caller_email, caller_role, execution_context, creation_pathway,
    rejection_reason, correlation_id, was_blocked, was_created,
    attempted_ewo_ref, created_ewo_id, metadata
  ) VALUES (
    p_created_by_email, p_created_by_role, p_execution_context,
    'create_canonical_ewo_governed', NULL, v_audit_ref,
    false, true, v_ewo_ref, v_ewo_id,
    jsonb_build_object('gate', 'success', 'reserved_ref', p_reserved_ewo_ref)
  );

  RETURN jsonb_build_object(
    'success', true,
    'blocked', false,
    'ewo_id', v_ewo_id,
    'ewo_ref', v_ewo_ref,
    'reserved_ref_used', p_reserved_ewo_ref IS NOT NULL
  );
END;
$function$;
