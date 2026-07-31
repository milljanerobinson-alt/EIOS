/*
# EWO-042S: Canonical Engineering Work Order Creation Safeguard

## Purpose
Permanently prevent automated testing from creating canonical Engineering Work Orders
while allowing genuine governed engineering to continue creating them.

## Changes

### 1. New Types
- `ewo_execution_context` enum: strongly validated execution context values

### 2. New Columns
- `engineering_work_orders.execution_context` — validated execution context

### 3. New Tables
- `ewo_creation_attempt_log` — records ALL creation attempts including rejected ones

### 4. New Functions
- `create_canonical_ewo_governed(...)` — the SINGLE canonical creation gateway RPC
- `is_test_identity(p_email text)` — checks if an email matches known test identities
- `validate_ewo_execution_context(p_context text)` — validates execution context value

### 5. RLS Changes
- INSERT policy on engineering_work_orders REMOVED entirely
  → direct INSERT from anon/authenticated is now impossible
  → only the SECURITY DEFINER RPC can create EWOs (runs as postgres, bypasses RLS)

### 6. Important Notes
- The edge function must call create_canonical_ewo_governed() RPC
- Historical imports use execution_context = 'historical_import'
- Governed migrations use execution_context = 'governed_migration'
- Automated test context is always rejected
- Test identities are always rejected
*/

-- ─── 1. Execution Context Enum ──────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE ewo_execution_context AS ENUM (
    'canonical_production',
    'product_owner_manual',
    'historical_import',
    'governed_migration',
    'staging_validation',
    'automated_test',
    'local_development'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. Add execution_context column ─────────────────────────────────────────

ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS execution_context ewo_execution_context
  NOT NULL DEFAULT 'canonical_production';

UPDATE engineering_work_orders
SET execution_context = 'historical_import'
WHERE is_historical_import = true;

UPDATE engineering_work_orders
SET execution_context = 'governed_migration'
WHERE bootstrap_origin IS NOT NULL;

-- ─── 3. Creation Attempt Log Table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ewo_creation_attempt_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  caller_email text,
  caller_role text,
  execution_context text NOT NULL,
  creation_pathway text NOT NULL,
  attempted_ewo_ref text,
  rejection_reason text,
  correlation_id text,
  was_blocked boolean NOT NULL DEFAULT false,
  was_created boolean NOT NULL DEFAULT false,
  created_ewo_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE ewo_creation_attempt_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ewo_attempt_log_select" ON ewo_creation_attempt_log;
CREATE POLICY "ewo_attempt_log_select" ON ewo_creation_attempt_log
  FOR SELECT TO authenticated USING (is_staff());

-- ─── 4. Helper Functions ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_test_identity(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_email IS NULL THEN false
    WHEN p_email ILIKE '%engineering.test@%' THEN true
    WHEN p_email ILIKE '%test@eios.local' THEN true
    WHEN p_email ILIKE '%.test@%' THEN true
    WHEN p_email ILIKE '%test_user%' THEN true
    WHEN p_email ILIKE '%ci-bot%' THEN true
    WHEN p_email ILIKE '%browser-test%' THEN true
    WHEN p_email ILIKE '%playwright%' THEN true
    WHEN p_email ILIKE '%puppeteer%' THEN true
    WHEN p_email ILIKE '%selenium%' THEN true
    WHEN p_email ILIKE '%cypress%' THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION validate_ewo_execution_context(p_context text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_context IS NOT NULL
    AND p_context IN (
      'canonical_production',
      'product_owner_manual',
      'historical_import',
      'governed_migration',
      'staging_validation',
      'automated_test',
      'local_development'
    );
$$;

-- ─── 5. Canonical Creation Gateway RPC ──────────────────────────────────────

CREATE OR REPLACE FUNCTION create_canonical_ewo_governed(
  p_execution_context text DEFAULT 'canonical_production',
  p_title text DEFAULT NULL,
  p_executive_summary text DEFAULT NULL,
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
  v_is_test boolean;
  v_context_enum ewo_execution_context;
BEGIN
  v_audit_ref := COALESCE(p_correlation_id, 'EWO-GATEWAY-' || extract(epoch from now())::bigint || '-' || md5(random()::text));

  -- Gate 1: Validate execution context
  IF NOT validate_ewo_execution_context(p_execution_context) THEN
    v_rejection_reason := 'Invalid execution context: ' || COALESCE(p_execution_context, 'NULL');
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, COALESCE(p_execution_context, 'NULL'),
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'context_validation')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  -- Gate 2: Block automated_test context
  IF p_execution_context = 'automated_test' THEN
    v_rejection_reason := 'Automated test context is not permitted to create canonical Engineering Work Orders';
    INSERT INTO ewo_creation_attempt_log (
      caller_email, caller_role, execution_context, creation_pathway,
      rejection_reason, correlation_id, was_blocked, was_created, metadata
    ) VALUES (
      p_created_by_email, p_created_by_role, p_execution_context,
      'create_canonical_ewo_governed', v_rejection_reason, v_audit_ref,
      true, false, jsonb_build_object('gate', 'automated_test_context_blocked')
    );
    RETURN jsonb_build_object(
      'success', false, 'blocked', true, 'rejection_reason', v_rejection_reason,
      'correlation_id', v_audit_ref, 'ewo_ref', null, 'ewo_id', null
    );
  END IF;

  -- Gate 3: Block test identities
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

  -- Gate 4: Validate required fields
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

  -- All gates passed — create the canonical EWO
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
    v_ewo_id, NULL, 'ready', COALESCE(p_created_by_email, 'system'),
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
    'system', COALESCE(p_created_by_email, 'system'), false,
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

-- ─── 6. Lock Down RLS INSERT Policy ──────────────────────────────────────────

-- Remove the INSERT policy entirely. With no INSERT policy, anon and
-- authenticated roles cannot INSERT. The SECURITY DEFINER RPC bypasses
-- RLS because it runs as the function owner (postgres).
DROP POLICY IF EXISTS "ewo_insert" ON engineering_work_orders;

-- ─── 7. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ewo_execution_context
  ON engineering_work_orders (execution_context);

CREATE INDEX IF NOT EXISTS idx_ewo_attempt_log_blocked
  ON ewo_creation_attempt_log (was_blocked, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_ewo_attempt_log_context
  ON ewo_creation_attempt_log (execution_context, attempted_at DESC);