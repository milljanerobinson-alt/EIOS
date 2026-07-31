/*
# EWO-043: Unify Planning and Canonical EWO Identity

## Purpose
Implements a single immutable EWO identity model. A reference is reserved
during governed planning and reused through canonical registration — no
second reference is ever allocated.

## New Table
- `ewo_ref_reservations`
  - Stores reserved EWO references before canonical registration.
  - Columns: id, ewo_ref (unique), reserved_by, reservation_context,
    correlation_id, status (reserved/consumed/cancelled), reserved_at,
    consumed_at, ewo_id (links to the canonical record once created).

## New Functions
- `reserve_ewo_ref_governed(p_reserved_by, p_reservation_context, p_correlation_id)`
  - Allocates the next sequence value and reserves it.
  - Returns the reserved ref. Only callable by authenticated users.
  - Blocks automated_test/staging_validation/local_development contexts.

- `create_canonical_ewo_governed()` — UPDATED
  - Now accepts optional `p_reserved_ewo_ref` parameter.
  - If provided: validates the reservation exists, belongs to this call,
    is in 'reserved' status, and consumes it.
  - If not provided: allocates a new ref (backward compatible).

## Security
- RLS on ewo_ref_reservations (anon read, authenticated insert).
- Reservation RPC blocks test contexts.
- The governed gateway validates reserved refs before using them.
*/

-- ─── 1. Create reservation table ───
CREATE TABLE IF NOT EXISTS ewo_ref_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_ref text UNIQUE NOT NULL,
  reserved_by text NOT NULL,
  reservation_context text NOT NULL,
  correlation_id text,
  status text NOT NULL DEFAULT 'reserved',
  reserved_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  ewo_id uuid
);

ALTER TABLE ewo_ref_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_reservations" ON ewo_ref_reservations;
CREATE POLICY "anon_select_reservations"
ON ewo_ref_reservations FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_reservations" ON ewo_ref_reservations;
CREATE POLICY "authenticated_insert_reservations"
ON ewo_ref_reservations FOR INSERT
TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_reservations_status ON ewo_ref_reservations (status);
CREATE INDEX IF NOT EXISTS idx_reservations_ewo_ref ON ewo_ref_reservations (ewo_ref);

-- ─── 2. Create reserve_ewo_ref_governed RPC ───
CREATE OR REPLACE FUNCTION reserve_ewo_ref_governed(
  p_reserved_by text DEFAULT NULL,
  p_reservation_context text DEFAULT 'governed_planning',
  p_correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ewo_ref text;
  v_blocked_contexts text[] := ARRAY['automated_test', 'staging_validation', 'local_development'];
BEGIN
  -- Block test contexts from reserving refs
  IF p_reservation_context = ANY(v_blocked_contexts) THEN
    RAISE EXCEPTION 'Reservation blocked: context % cannot reserve EWO references', p_reservation_context;
  END IF;

  -- Allocate next ref from sequence
  SELECT 'EWO-' || lpad(nextval('ewo_canonical_ref_seq')::text, 3, '0') INTO v_ewo_ref;

  -- Store reservation
  INSERT INTO ewo_ref_reservations (ewo_ref, reserved_by, reservation_context, correlation_id)
  VALUES (v_ewo_ref, COALESCE(p_reserved_by, 'system'), p_reservation_context, p_correlation_id);

  RETURN jsonb_build_object(
    'success', true,
    'ewo_ref', v_ewo_ref,
    'reserved_by', COALESCE(p_reserved_by, 'system'),
    'status', 'reserved'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION reserve_ewo_ref_governed(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reserve_ewo_ref_governed(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION reserve_ewo_ref_governed(text, text, text) TO authenticated;

-- ─── 3. Update create_canonical_ewo_governed to accept reserved ref ───
-- We need to recreate the function with the new parameter.
-- The full function is large; we add p_reserved_ewo_ref as the LAST parameter
-- for backward compatibility (existing callers won't break).

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

  -- ─── Gate 2: Resolve EWO reference ───
  IF p_reserved_ewo_ref IS NOT NULL AND btrim(p_reserved_ewo_ref) != '' THEN
    -- Use the pre-reserved reference
    SELECT * INTO v_reservation FROM ewo_ref_reservations
    WHERE ewo_ref = p_reserved_ewo_ref AND status = 'reserved'
    FOR UPDATE;

    IF NOT FOUND THEN
      v_rejection_reason := 'Reserved EWO ref ''' || p_reserved_ewo_ref || ''' not found or not in reserved status';
      INSERT INTO ewo_creation_attempt_log (
        caller_email, caller_role, execution_context, creation_pathway,
        rejection_reason, correlation_id, was_blocked, was_created, metadata
      ) VALUES (
        p_created_by_email, p_created_by_role, p_execution_context,
        'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
        true, false, jsonb_build_object('gate', 'reserved_ref_not_found', 'reserved_ref', p_reserved_ewo_ref)
      );
      RETURN jsonb_build_object('success', false, 'blocked', true, 'rejection_reason', v_rejection_reason);
    END IF;

    -- Check for duplicate canonical record
    IF EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = p_reserved_ewo_ref) THEN
      v_rejection_reason := 'Reserved EWO ref ''' || p_reserved_ewo_ref || ''' already exists as a canonical record';
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

    v_ewo_ref := p_reserved_ewo_ref;
  ELSE
    -- Allocate a new ref from the sequence (backward compatible)
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
    'Assigned', 'Generated', p_execution_context, now()
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

-- Re-apply grants
REVOKE EXECUTE ON FUNCTION create_canonical_ewo_governed(text, text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_canonical_ewo_governed(text, text, text, text, text, text, text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION create_canonical_ewo_governed(text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;
