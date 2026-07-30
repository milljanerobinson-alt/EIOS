/*
# EWO-031 — Conversation-to-Execution Routing (Part 2)

## Purpose
Creates remaining database infrastructure for governed conversation-to-execution routing.
Uses 'draft' status (valid per existing check constraint) for EWO-031 registration.

## New Tables
- atd_conversation_active_objects: conversation_id -> active_ewo_ref mapping
- engineering_plans: analysis and plan documents per EWO
- execution_budget_controls: token/cost budget controls

## Registered EWO
- EWO-031 with status 'draft' (valid per check constraint)

## Governed RPCs
- approve_ewo_for_execution: Records PO execution approval
- prepare_engineering_analysis: Creates analysis document
- prepare_engineering_plan: Creates plan document
- inspect_ewo_execution_state: Returns full execution state
*/

-- ─── 1. Conversation Active Objects ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atd_conversation_active_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL UNIQUE,
  active_ewo_ref text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE atd_conversation_active_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_active_objects" ON atd_conversation_active_objects;
CREATE POLICY "anon_select_active_objects" ON atd_conversation_active_objects FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_active_objects" ON atd_conversation_active_objects;
CREATE POLICY "anon_insert_active_objects" ON atd_conversation_active_objects FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_active_objects" ON atd_conversation_active_objects;
CREATE POLICY "anon_update_active_objects" ON atd_conversation_active_objects FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_active_objects" ON atd_conversation_active_objects;
CREATE POLICY "anon_delete_active_objects" ON atd_conversation_active_objects FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 2. Engineering Plans ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_ref text NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('analysis', 'plan')),
  title text,
  content text,
  status text NOT NULL DEFAULT 'draft',
  created_by text DEFAULT 'system',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engineering_plans_ewo_ref ON engineering_plans(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_engineering_plans_type ON engineering_plans(plan_type);

ALTER TABLE engineering_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_engineering_plans" ON engineering_plans;
CREATE POLICY "anon_select_engineering_plans" ON engineering_plans FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_engineering_plans" ON engineering_plans;
CREATE POLICY "anon_insert_engineering_plans" ON engineering_plans FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_engineering_plans" ON engineering_plans;
CREATE POLICY "anon_update_engineering_plans" ON engineering_plans FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_engineering_plans" ON engineering_plans;
CREATE POLICY "anon_delete_engineering_plans" ON engineering_plans FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 3. Execution Budget Controls ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_budget_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_ref text,
  max_tokens integer NOT NULL DEFAULT 100000,
  used_tokens integer NOT NULL DEFAULT 0,
  max_cost_cents integer NOT NULL DEFAULT 500,
  used_cost_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE execution_budget_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_budget_controls" ON execution_budget_controls;
CREATE POLICY "anon_select_budget_controls" ON execution_budget_controls FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_budget_controls" ON execution_budget_controls;
CREATE POLICY "anon_insert_budget_controls" ON execution_budget_controls FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_budget_controls" ON execution_budget_controls;
CREATE POLICY "anon_update_budget_controls" ON execution_budget_controls FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_budget_controls" ON execution_budget_controls;
CREATE POLICY "anon_delete_budget_controls" ON execution_budget_controls FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 4. Register EWO-031 ────────────────────────────────────────────────────────

INSERT INTO engineering_work_orders (ewo_ref, title, status, scope, validation_requirements, engineering_package_status, implementation_status, created_at)
SELECT 'EWO-031', 'EWO-031 — Native Codex Execution Validation', 'draft',
  'Validate governed conversation-to-execution routing by executing a harmless validation fixture through the Supervised Engineering Execution Engine using Codex.',
  '1. Intent recognition routes execution requests correctly. 2. Execution approval gate blocks without PO approval. 3. Codex-only execution selects Codex. 4. No fallback to Bolt for Codex-only requests. 5. Completion evidence is generated. 6. No PO acceptance recorded. 7. EWO not closed.',
  'Not Generated', 'not_started', now()
WHERE NOT EXISTS (
  SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-031'
);

-- ─── 5. Governed RPCs ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_ewo_for_execution(
  p_ewo_ref text,
  p_approved_by text,
  p_decision text DEFAULT 'approved',
  p_approval_statement text DEFAULT NULL,
  p_provider_preference text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ewo record;
  v_approval_ref text;
BEGIN
  SELECT id, status INTO v_ewo FROM engineering_work_orders WHERE ewo_ref = p_ewo_ref;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'EWO not found');
  END IF;

  v_approval_ref := 'EXEC-APPROVAL-' || p_ewo_ref || '-' || extract(epoch from now())::bigint;

  INSERT INTO ewo_execution_approvals (ewo_id, approval_ref, decision, product_owner, approval_statement, evidence_metadata, is_test)
  VALUES (v_ewo.id, v_approval_ref, p_decision, p_approved_by, p_approval_statement,
    jsonb_build_object('provider_preference', p_provider_preference, 'source', 'conversation_routing'),
    false);

  RETURN jsonb_build_object(
    'success', true,
    'ewo_ref', p_ewo_ref,
    'decision', p_decision,
    'approved_by', p_approved_by,
    'approval_ref', v_approval_ref,
    'approved_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION prepare_engineering_analysis(
  p_ewo_ref text,
  p_prepared_by text DEFAULT 'system'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ewo record;
  v_existing record;
  v_plan_id uuid;
BEGIN
  SELECT id, title, scope INTO v_ewo FROM engineering_work_orders WHERE ewo_ref = p_ewo_ref;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'EWO not found');
  END IF;

  SELECT id INTO v_existing FROM engineering_plans WHERE ewo_ref = p_ewo_ref AND plan_type = 'analysis' LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'ewo_ref', p_ewo_ref, 'plan_type', 'analysis', 'message', 'Analysis already exists', 'plan_id', v_existing.id);
  END IF;

  INSERT INTO engineering_plans (ewo_ref, plan_type, title, content, status, created_by)
  VALUES (p_ewo_ref, 'analysis', 'Engineering Analysis for ' || p_ewo_ref,
    'Analysis of scope: ' || COALESCE(v_ewo.scope, 'Not defined'),
    'ready', p_prepared_by)
  RETURNING id INTO v_plan_id;

  RETURN jsonb_build_object('success', true, 'ewo_ref', p_ewo_ref, 'plan_type', 'analysis', 'plan_id', v_plan_id, 'status', 'ready');
END;
$$;

CREATE OR REPLACE FUNCTION prepare_engineering_plan(
  p_ewo_ref text,
  p_prepared_by text DEFAULT 'system'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ewo record;
  v_analysis record;
  v_plan_id uuid;
BEGIN
  SELECT id, title, scope, validation_requirements INTO v_ewo FROM engineering_work_orders WHERE ewo_ref = p_ewo_ref;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'EWO not found');
  END IF;

  SELECT id INTO v_analysis FROM engineering_plans WHERE ewo_ref = p_ewo_ref AND plan_type = 'analysis' LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Engineering Analysis must be prepared before Plan');
  END IF;

  SELECT id INTO v_plan_id FROM engineering_plans WHERE ewo_ref = p_ewo_ref AND plan_type = 'plan' LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'ewo_ref', p_ewo_ref, 'plan_type', 'plan', 'message', 'Plan already exists', 'plan_id', v_plan_id);
  END IF;

  INSERT INTO engineering_plans (ewo_ref, plan_type, title, content, status, created_by)
  VALUES (p_ewo_ref, 'plan', 'Engineering Plan for ' || p_ewo_ref,
    'Plan based on analysis. Validation: ' || COALESCE(v_ewo.validation_requirements, 'Not defined'),
    'ready', p_prepared_by)
  RETURNING id INTO v_plan_id;

  UPDATE engineering_work_orders SET engineering_package_status = 'Generated' WHERE ewo_ref = p_ewo_ref;

  RETURN jsonb_build_object('success', true, 'ewo_ref', p_ewo_ref, 'plan_type', 'plan', 'plan_id', v_plan_id, 'status', 'ready');
END;
$$;

CREATE OR REPLACE FUNCTION inspect_ewo_execution_state(
  p_ewo_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ewo record;
  v_analysis record;
  v_plan record;
  v_approval record;
  v_target record;
  v_budget record;
  v_executions jsonb;
BEGIN
  SELECT id, status, engineering_package_status, implementation_status, po_accepted_at, scope, validation_requirements
  INTO v_ewo FROM engineering_work_orders WHERE ewo_ref = p_ewo_ref;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'EWO not found');
  END IF;

  SELECT id, status, content INTO v_analysis FROM engineering_plans WHERE ewo_ref = p_ewo_ref AND plan_type = 'analysis' LIMIT 1;
  SELECT id, status, content INTO v_plan FROM engineering_plans WHERE ewo_ref = p_ewo_ref AND plan_type = 'plan' LIMIT 1;

  SELECT approval_ref, decision, product_owner, is_test
    INTO v_approval
  FROM ewo_execution_approvals
  WHERE ewo_id = v_ewo.id
  ORDER BY created_at DESC LIMIT 1;

  SELECT repository, default_branch, is_active
    INTO v_target
  FROM execution_targets
  WHERE is_active = true
  LIMIT 1;

  SELECT max_tokens, used_tokens, status INTO v_budget FROM execution_budget_controls WHERE status = 'active' LIMIT 1;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_executions
  FROM (
    SELECT execution_ref, execution_status, provider, execution_start, execution_finish, build_status, verification_status, audit_reference
    FROM supervised_execution_records WHERE ewo_ref = p_ewo_ref ORDER BY execution_start DESC
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'ewo_ref', p_ewo_ref,
    'ewo_status', v_ewo.status,
    'engineering_package_status', v_ewo.engineering_package_status,
    'implementation_status', v_ewo.implementation_status,
    'analysis', CASE WHEN v_analysis IS NOT NULL THEN jsonb_build_object('exists', true, 'status', v_analysis.status) ELSE jsonb_build_object('exists', false) END,
    'plan', CASE WHEN v_plan IS NOT NULL THEN jsonb_build_object('exists', true, 'status', v_plan.status) ELSE jsonb_build_object('exists', false) END,
    'execution_approval', CASE WHEN v_approval IS NOT NULL THEN jsonb_build_object('exists', true, 'decision', v_approval.decision, 'approved_by', v_approval.product_owner, 'is_test', v_approval.is_test) ELSE jsonb_build_object('exists', false) END,
    'execution_target', CASE WHEN v_target IS NOT NULL THEN jsonb_build_object('exists', true, 'repository', v_target.repository, 'branch', v_target.default_branch) ELSE jsonb_build_object('exists', false) END,
    'budget', CASE WHEN v_budget IS NOT NULL THEN jsonb_build_object('exists', true, 'max_tokens', v_budget.max_tokens, 'used_tokens', v_budget.used_tokens) ELSE jsonb_build_object('exists', false) END,
    'executions', v_executions,
    'execution_eligible',
      v_ewo.status NOT IN ('closed', 'archived')
      AND EXISTS (SELECT 1 FROM engineering_plans WHERE ewo_ref = p_ewo_ref AND plan_type = 'analysis')
      AND EXISTS (SELECT 1 FROM engineering_plans WHERE ewo_ref = p_ewo_ref AND plan_type = 'plan')
      AND EXISTS (SELECT 1 FROM ewo_execution_approvals WHERE ewo_id = v_ewo.id AND decision = 'approved')
  );
END;
$$;
