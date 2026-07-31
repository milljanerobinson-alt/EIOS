/*
# EWO-043R: Update create_canonical_ewo_governed to handle unreserved refs

## Purpose
When p_reserved_ewo_ref is provided but NOT found in ewo_ref_reservations
(e.g. guardImplementationEntry passes an already-known ref that was never
reserved), the function should create a reservation on-the-fly and use it,
rather than rejecting. This ensures all creation goes through the governed
gateway even when the ref wasn't pre-reserved.

This eliminates the need for any direct INSERT fallback.
*/

CREATE OR REPLACE FUNCTION public.create_canonical_ewo_governed(
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
  p_reserved_ewo_ref text DEFAULT NULL
) RETURNS jsonb
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
    -- Check for duplicate canonical record first
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

    -- Check if the ref was pre-reserved
    SELECT * INTO v_reservation FROM ewo_ref_reservations
    WHERE ewo_ref = p_reserved_ewo_ref AND status = 'reserved'
    FOR UPDATE;

    IF FOUND THEN
      -- Use the pre-reserved ref
      v_ewo_ref := p_reserved_ewo_ref;
    ELSE
      -- Ref not reserved but not a duplicate either — create a reservation on-the-fly
      -- This handles guardImplementationEntry which passes refs that weren't pre-reserved
      INSERT INTO ewo_ref_reservations (ewo_ref, reserved_by, reservation_context, correlation_id)
      VALUES (p_reserved_ewo_ref, COALESCE(p_created_by_email, 'system'), 'governed_gateway_auto_reserve', v_audit_ref);
      v_ewo_ref := p_reserved_ewo_ref;
    END IF;
  ELSE
    -- Allocate a new ref from the sequence
    v_ewo_ref := 'EWO-' || lpad(nextval('ewo_canonical_ref_seq')::text, 3, '0');
  END IF;

  -- ─── Gate 3: Create the canonical EWO ───
  INSERT INTO engineering_work_orders (
    ewo_ref, title, executive_summary, status, priority, risk_level,
    implementation_provider, implementation_status, engineering_package_status,
    execution_context, created_at
  ) VALUES (
    v_ewo_ref, p_title, p_executive_summary, 'ready',
    p_priority, p_risk_level, p_implementation_provider,
    'Assigned', 'Generated', v_context_enum, now()
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
      'reserved_ref', p_reserved_ewo_ref
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

REVOKE EXECUTE ON FUNCTION create_canonical_ewo_governed(text, text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_canonical_ewo_governed(text, text, text, text, text, text, text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION create_canonical_ewo_governed(text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;
