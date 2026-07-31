-- EWO-042S.1: Harden Canonical EWO Creation Safeguards
-- 1. Remove default canonical_production — execution_context is now mandatory
-- 2. Reject staging_validation and local_development contexts
-- 3. Reorder validation: context → pathway → authority → identity → create
-- 4. Make p_execution_context required (no default)

-- Drop and recreate the RPC with hardened validation
DROP FUNCTION IF EXISTS create_canonical_ewo_governed;

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
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ewo_ref text;
  v_ewo_id uuid;
  v_audit_ref text;
  v_rejection_reason text;
  v_context_enum ewo_execution_context;
  v_allowed_contexts text[] := ARRAY['canonical_production', 'product_owner_manual', 'historical_import', 'governed_migration'];
BEGIN
  v_audit_ref := COALESCE(p_correlation_id, 'EWO-GATEWAY-' || extract(epoch from now())::bigint || '-' || md5(random()::text));

  -- ─── Gate 1: Validate execution context (PRIMARY GATE) ───
  -- Missing, null, unknown, or invalid context must fail closed.
  -- No default fallback to canonical_production.
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

  -- Validate context is a known enum value
  IF NOT validate_ewo_execution_context(p_execution_context) THEN
    v_rejection_reason := 'Invalid execution context: ' || p_execution_context;
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, p_execution_context,
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'context_validation')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  -- Reject non-production contexts: automated_test, staging_validation, local_development
  IF NOT (p_execution_context = ANY(v_allowed_contexts)) THEN
    v_rejection_reason := 'Execution context "' || p_execution_context || '" is not permitted to create canonical Engineering Work Orders';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, p_execution_context,
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'context_not_allowed')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  -- ─── Gate 2: Validate governed creation pathway (implicit) ───
  -- This RPC IS the governed pathway. By reaching this point, the caller
  -- is already inside the governed gateway. No additional check needed —
  -- the SECURITY DEFINER property ensures only this function can INSERT.

  -- ─── Gate 3: Validate caller authority ───
  -- Caller email must be provided and must not be a test identity.
  IF p_created_by_email IS NULL OR btrim(p_created_by_email) = '' THEN
    v_rejection_reason := 'Caller identity is required to create a canonical Engineering Work Order';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, p_execution_context,
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'caller_identity_required')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  -- ─── Gate 4: Test identity blocking (SECONDARY — defence-in-depth) ───
  IF is_test_identity(p_created_by_email) THEN
    v_rejection_reason := 'Test identity "' || p_created_by_email || '" is not permitted to create canonical Engineering Work Orders';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, p_execution_context,
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'test_identity_blocked')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  -- ─── Gate 5: Validate required fields ───
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    v_rejection_reason := 'Title is required to create a canonical Engineering Work Order';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, p_execution_context,
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'title_required')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  IF p_executive_summary IS NULL OR btrim(p_executive_summary) = '' THEN
    v_rejection_reason := 'Executive summary is required to create a canonical Engineering Work Order';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, p_execution_context,
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'executive_summary_required')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  -- ─── All gates passed — create the canonical EWO ───
  v_ewo_ref := allocate_canonical_ewo_ref();
  v_context_enum := p_execution_context::ewo_execution_context;

  INSERT INTO engineering_work_orders (
    ewo_ref, title, executive_summary, status, priority, risk_level,
    implementation_provider, implementation_status, engineering_package_status,
    created_by, originating_conversation_ref, implementation_source,
    execution_context
  ) VALUES (
    v_ewo_ref, btrim(p_title), btrim(p_executive_summary), 'ready',
    p_priority, p_risk_level, p_implementation_provider, 'Assigned', 'Generated',
    p_created_by_email, p_originating_conversation_ref,
    'server_side_conversation_creation', v_context_enum
  )
  RETURNING id INTO v_ewo_id;

  -- Record lifecycle event
  INSERT INTO ewo_lifecycle_events (
    ewo_id, from_status, to_status, actor, notes, metadata
  ) VALUES (
    v_ewo_id, NULL, 'ready', p_created_by_email,
    'Canonical EWO ' || v_ewo_ref || ' created via governed gateway. Execution context: ' || p_execution_context,
    jsonb_build_object(
      'source', 'governed_creation_gateway',
      'ewo_ref', v_ewo_ref,
      'execution_context', p_execution_context,
      'conversation_id', p_originating_conversation_ref,
      'audit_ref', v_audit_ref
    )
  );

  -- Record engineering change log
  INSERT INTO engineering_change_log (
    change_ref, change_type, ewo_ref, object_type, object_id,
    summary, description, actor_type, actor, is_reconstructed,
    linked_artefacts, metadata
  ) VALUES (
    v_audit_ref, 'created', v_ewo_ref, 'engineering_work_order', v_ewo_id,
    'EWO ' || v_ewo_ref || ' created via governed gateway: ' || btrim(p_title),
    'Server-side governed EWO creation. Execution context: ' || p_execution_context || ', Provider: ' || p_implementation_provider || ', Priority: ' || p_priority,
    'system', p_created_by_email, false,
    '[]'::jsonb,
    jsonb_build_object(
      'server_authoritative', true,
      'execution_context', p_execution_context,
      'conversation_id', p_originating_conversation_ref,
      'source_idea_id', p_source_idea_id,
      'source_plan_ref', p_source_plan_ref
    )
  );

  -- Log successful creation
  INSERT INTO ewo_creation_attempt_log (
    caller_email, caller_role, execution_context, creation_pathway,
    attempted_ewo_ref, correlation_id, was_blocked, was_created, created_ewo_id, metadata
  ) VALUES (
    p_created_by_email, p_created_by_role, p_execution_context,
    'create_canonical_ewo_governed', v_ewo_ref, v_audit_ref,
    false, true, v_ewo_id,
    jsonb_build_object('gate', 'passed', 'title', btrim(p_title))
  );

  RETURN jsonb_build_object(
    'success', true, 'blocked', false, 'created', true,
    'ewo_ref', v_ewo_ref, 'ewo_id', v_ewo_id,
    'status', 'ready', 'lifecycle_state', 'ready',
    'execution_context', p_execution_context,
    'correlation_id', v_audit_ref,
    'execution_preparation_available', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_canonical_ewo_governed TO authenticated;
GRANT EXECUTE ON FUNCTION create_canonical_ewo_governed TO anon;