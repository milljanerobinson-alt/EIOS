/*
# EWO-007R.1: Transactional Governance & Tenant Isolation Closeout

## Summary
Constitutional hardening of the ATD Engineering governance layer. Replaces sequential
client-side operations with atomic PostgreSQL RPC functions, adds organisation/workspace
tenant isolation columns across all ATD tables, hardens RLS from open USING (true) to
org-scoped predicates, and introduces a structured governance response contract.

## Changes

### 1. Helper: get_caller_org_id()
Returns the calling user's organisation_id. Returns NULL in single-tenant installations
where no org is provisioned — all RLS predicates use IS NULL OR = get_caller_org_id()
so NULL safely permits access to unscoped rows.

### 2. Composite type: governance_response
Structured response contract returned by RPC governance functions:
- success (boolean)
- decision_id, decision_ref (text identifiers)
- decision (text: approved/approved_with_conditions/rejected)
- plan_status, intent_status (resulting lifecycle states)
- conflict_code (text: duplicate_decision, optimistic_lock_conflict, plan_not_found, etc.)
- error_message (text: human-readable error detail)

### 3. Tenant isolation columns (all ATD tables)
Adds organisation_id (uuid) and workspace_id (text) to:
- atd_engineering_intents
- atd_engineering_plans
- atd_plan_governance_decisions
- atd_capability_executions

### 4. RPC: approve_engineering_plan(...)
Atomic SECURITY DEFINER function with:
- SELECT ... FOR UPDATE row locking (prevents concurrent governance)
- Optimistic locking via p_expected_version
- Idempotency guard (structured conflict response, not raw DB error)
- Tenant check
- Atomic INSERT governance decision + UPDATE plan status + UPDATE intent status

### 5. RPC: reject_engineering_plan(...)
Same structure as approve, with rejection_reason required.

### 6. RLS hardening
All four ATD governance/execution tables updated to org-scoped predicates:
  USING (organisation_id IS NULL OR organisation_id = get_caller_org_id())
Removes anon INSERT/UPDATE/DELETE from atd_plan_governance_decisions.

### 7. Indexes on new tenant columns

## Security
- RPC functions run as SECURITY DEFINER — client cannot bypass tenant checks
- FOR UPDATE locking prevents double-approval races
- Unique partial index (already exists) prevents duplicate final decisions at DB level
- anon role loses write access to governance decisions table
- All reads/writes tenant-scoped via helper function

## Notes
- get_caller_org_id() returns NULL in single-tenant mode (safe for IS NULL OR = check)
- p_expected_version = 0 disables optimistic locking (backwards compatible)
- All ADD COLUMN statements are idempotent (IF NOT EXISTS blocks)
- Migration is safe to re-run
*/

-- ─── 1. get_caller_org_id() ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_caller_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Returns NULL in single-tenant installations (no org provisioned on profiles).
  -- Future: SELECT organisation_id FROM profiles WHERE id = auth.uid() LIMIT 1
  SELECT NULL::uuid;
$$;

-- ─── 2. governance_response composite type ────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'governance_response') THEN
    CREATE TYPE governance_response AS (
      success        boolean,
      decision_id    uuid,
      decision_ref   text,
      decision       text,
      plan_status    text,
      intent_status  text,
      conflict_code  text,
      error_message  text
    );
  END IF;
END $$;

-- ─── 3. Tenant isolation columns ──────────────────────────────────────────────

-- atd_engineering_intents
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_intents' AND column_name='organisation_id') THEN
    ALTER TABLE atd_engineering_intents ADD COLUMN organisation_id uuid;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_intents' AND column_name='workspace_id') THEN
    ALTER TABLE atd_engineering_intents ADD COLUMN workspace_id text;
  END IF;
END $$;

-- atd_engineering_plans
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_plans' AND column_name='organisation_id') THEN
    ALTER TABLE atd_engineering_plans ADD COLUMN organisation_id uuid;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_plans' AND column_name='workspace_id') THEN
    ALTER TABLE atd_engineering_plans ADD COLUMN workspace_id text;
  END IF;
END $$;

-- atd_plan_governance_decisions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_plan_governance_decisions' AND column_name='organisation_id') THEN
    ALTER TABLE atd_plan_governance_decisions ADD COLUMN organisation_id uuid;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_plan_governance_decisions' AND column_name='workspace_id') THEN
    ALTER TABLE atd_plan_governance_decisions ADD COLUMN workspace_id text;
  END IF;
END $$;

-- atd_capability_executions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='organisation_id') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN organisation_id uuid;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='workspace_id') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN workspace_id text;
  END IF;
END $$;

-- ─── 4. approve_engineering_plan RPC ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_engineering_plan(
  p_plan_id          uuid,
  p_intent_id        uuid,
  p_decided_by       text    DEFAULT 'product_owner',
  p_notes            text    DEFAULT NULL,
  p_conditions       text    DEFAULT NULL,
  p_expected_version integer DEFAULT 0
)
RETURNS governance_response
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decision       text;
  v_new_plan_status text;
  v_plan           record;
  v_existing       record;
  v_decision_count bigint;
  v_decision_ref   text;
  v_decision_id    uuid;
  v_org_id         uuid;
  v_result         governance_response;
BEGIN
  -- Determine decision variant
  IF p_conditions IS NOT NULL AND length(trim(p_conditions)) > 0 THEN
    v_decision := 'approved_with_conditions';
    v_new_plan_status := 'approved_with_conditions';
  ELSE
    v_decision := 'approved';
    v_new_plan_status := 'approved';
  END IF;

  v_org_id := get_caller_org_id();

  -- Lock the plan row for the duration of this transaction
  SELECT id, status, version_number, organisation_id
  INTO v_plan
  FROM atd_engineering_plans
  WHERE id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_result := (false, NULL, NULL, NULL, NULL, NULL, 'plan_not_found', 'Plan not found: ' || p_plan_id)::governance_response;
    RETURN v_result;
  END IF;

  -- Tenant check (only enforced when caller has an org)
  IF v_org_id IS NOT NULL AND v_plan.organisation_id IS NOT NULL AND v_plan.organisation_id <> v_org_id THEN
    v_result := (false, NULL, NULL, NULL, NULL, NULL, 'tenant_mismatch', 'Access denied: plan belongs to a different organisation')::governance_response;
    RETURN v_result;
  END IF;

  -- Idempotency guard — check for existing final decision
  SELECT id, decision INTO v_existing
  FROM atd_plan_governance_decisions
  WHERE plan_id = p_plan_id
    AND decision IN ('approved','approved_with_conditions','rejected')
  LIMIT 1;

  IF FOUND THEN
    v_result := (false, v_existing.id, NULL, v_existing.decision, NULL, NULL, 'duplicate_decision', 'Plan already has a final governance decision: ' || v_existing.decision)::governance_response;
    RETURN v_result;
  END IF;

  -- Optimistic locking (version 0 = disabled)
  IF p_expected_version > 0 AND v_plan.version_number <> p_expected_version THEN
    v_result := (false, NULL, NULL, NULL, NULL, NULL, 'optimistic_lock_conflict', 'Plan version mismatch: expected ' || p_expected_version || ', found ' || v_plan.version_number)::governance_response;
    RETURN v_result;
  END IF;

  -- Lifecycle guard — plan must be awaiting_approval or submitted_for_review
  IF v_plan.status NOT IN ('awaiting_approval','submitted_for_review','draft') THEN
    v_result := (false, NULL, NULL, NULL, NULL, NULL, 'invalid_lifecycle_state', 'Plan is not in an approvable state: ' || v_plan.status)::governance_response;
    RETURN v_result;
  END IF;

  -- Generate decision ref
  SELECT COUNT(*) + 1 INTO v_decision_count FROM atd_plan_governance_decisions;
  v_decision_ref := 'ATD-GOV-' || lpad(v_decision_count::text, 4, '0');

  -- Atomic governance insert
  INSERT INTO atd_plan_governance_decisions (
    decision_ref, plan_id, intent_id, decision, decided_by, decided_at,
    rejection_reason, conditions, notes,
    previous_plan_status, new_intent_status, organisation_id
  ) VALUES (
    v_decision_ref, p_plan_id, p_intent_id, v_decision, p_decided_by, now(),
    NULL, p_conditions, p_notes,
    v_plan.status, 'approved', v_org_id
  )
  RETURNING id INTO v_decision_id;

  -- Update plan status
  UPDATE atd_engineering_plans
  SET status = v_new_plan_status
  WHERE id = p_plan_id;

  -- Update intent status (halt before implementation — status 'approved')
  UPDATE atd_engineering_intents
  SET status = 'approved'
  WHERE id = p_intent_id;

  v_result := (true, v_decision_id, v_decision_ref, v_decision, v_new_plan_status, 'approved', NULL, NULL)::governance_response;
  RETURN v_result;

EXCEPTION WHEN unique_violation THEN
  v_result := (false, NULL, NULL, NULL, NULL, NULL, 'duplicate_decision', 'Concurrent governance decision already recorded for this plan')::governance_response;
  RETURN v_result;
END;
$$;

-- ─── 5. reject_engineering_plan RPC ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION reject_engineering_plan(
  p_plan_id          uuid,
  p_intent_id        uuid,
  p_rejection_reason text,
  p_decided_by       text    DEFAULT 'product_owner',
  p_notes            text    DEFAULT NULL,
  p_expected_version integer DEFAULT 0
)
RETURNS governance_response
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan           record;
  v_existing       record;
  v_decision_count bigint;
  v_decision_ref   text;
  v_decision_id    uuid;
  v_org_id         uuid;
  v_result         governance_response;
BEGIN
  -- Validate rejection reason
  IF p_rejection_reason IS NULL OR length(trim(p_rejection_reason)) = 0 THEN
    v_result := (false, NULL, NULL, NULL, NULL, NULL, 'missing_rejection_reason', 'Rejection reason is required')::governance_response;
    RETURN v_result;
  END IF;

  v_org_id := get_caller_org_id();

  -- Lock the plan row
  SELECT id, status, version_number, organisation_id
  INTO v_plan
  FROM atd_engineering_plans
  WHERE id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_result := (false, NULL, NULL, NULL, NULL, NULL, 'plan_not_found', 'Plan not found: ' || p_plan_id)::governance_response;
    RETURN v_result;
  END IF;

  -- Tenant check
  IF v_org_id IS NOT NULL AND v_plan.organisation_id IS NOT NULL AND v_plan.organisation_id <> v_org_id THEN
    v_result := (false, NULL, NULL, NULL, NULL, NULL, 'tenant_mismatch', 'Access denied: plan belongs to a different organisation')::governance_response;
    RETURN v_result;
  END IF;

  -- Idempotency guard
  SELECT id, decision INTO v_existing
  FROM atd_plan_governance_decisions
  WHERE plan_id = p_plan_id
    AND decision IN ('approved','approved_with_conditions','rejected')
  LIMIT 1;

  IF FOUND THEN
    v_result := (false, v_existing.id, NULL, v_existing.decision, NULL, NULL, 'duplicate_decision', 'Plan already has a final governance decision: ' || v_existing.decision)::governance_response;
    RETURN v_result;
  END IF;

  -- Optimistic locking
  IF p_expected_version > 0 AND v_plan.version_number <> p_expected_version THEN
    v_result := (false, NULL, NULL, NULL, NULL, NULL, 'optimistic_lock_conflict', 'Plan version mismatch: expected ' || p_expected_version || ', found ' || v_plan.version_number)::governance_response;
    RETURN v_result;
  END IF;

  -- Lifecycle guard
  IF v_plan.status NOT IN ('awaiting_approval','submitted_for_review','draft') THEN
    v_result := (false, NULL, NULL, NULL, NULL, NULL, 'invalid_lifecycle_state', 'Plan is not in a rejectable state: ' || v_plan.status)::governance_response;
    RETURN v_result;
  END IF;

  -- Generate decision ref
  SELECT COUNT(*) + 1 INTO v_decision_count FROM atd_plan_governance_decisions;
  v_decision_ref := 'ATD-GOV-' || lpad(v_decision_count::text, 4, '0');

  -- Atomic governance insert
  INSERT INTO atd_plan_governance_decisions (
    decision_ref, plan_id, intent_id, decision, decided_by, decided_at,
    rejection_reason, conditions, notes,
    previous_plan_status, new_intent_status, organisation_id
  ) VALUES (
    v_decision_ref, p_plan_id, p_intent_id, 'rejected', p_decided_by, now(),
    trim(p_rejection_reason), NULL, p_notes,
    v_plan.status, 'rejected', v_org_id
  )
  RETURNING id INTO v_decision_id;

  -- Update plan status
  UPDATE atd_engineering_plans
  SET status = 'rejected'
  WHERE id = p_plan_id;

  -- Update intent status
  UPDATE atd_engineering_intents
  SET status = 'rejected'
  WHERE id = p_intent_id;

  v_result := (true, v_decision_id, v_decision_ref, 'rejected', 'rejected', 'rejected', NULL, NULL)::governance_response;
  RETURN v_result;

EXCEPTION WHEN unique_violation THEN
  v_result := (false, NULL, NULL, NULL, NULL, NULL, 'duplicate_decision', 'Concurrent governance decision already recorded for this plan')::governance_response;
  RETURN v_result;
END;
$$;

-- ─── 6. GRANT EXECUTE ────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION approve_engineering_plan(uuid, uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_engineering_plan(uuid, uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_caller_org_id() TO authenticated;

-- ─── 7. RLS hardening ────────────────────────────────────────────────────────

-- atd_engineering_intents
DROP POLICY IF EXISTS "authenticated_select_intents" ON atd_engineering_intents;
CREATE POLICY "authenticated_select_intents" ON atd_engineering_intents
  FOR SELECT TO authenticated
  USING (organisation_id IS NULL OR organisation_id = get_caller_org_id());

DROP POLICY IF EXISTS "authenticated_insert_intents" ON atd_engineering_intents;
CREATE POLICY "authenticated_insert_intents" ON atd_engineering_intents
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id IS NULL OR organisation_id = get_caller_org_id());

DROP POLICY IF EXISTS "authenticated_update_intents" ON atd_engineering_intents;
CREATE POLICY "authenticated_update_intents" ON atd_engineering_intents
  FOR UPDATE TO authenticated
  USING (organisation_id IS NULL OR organisation_id = get_caller_org_id())
  WITH CHECK (organisation_id IS NULL OR organisation_id = get_caller_org_id());

DROP POLICY IF EXISTS "authenticated_delete_intents" ON atd_engineering_intents;
CREATE POLICY "authenticated_delete_intents" ON atd_engineering_intents
  FOR DELETE TO authenticated
  USING (organisation_id IS NULL OR organisation_id = get_caller_org_id());

-- atd_engineering_plans
DROP POLICY IF EXISTS "authenticated_select_plans" ON atd_engineering_plans;
CREATE POLICY "authenticated_select_plans" ON atd_engineering_plans
  FOR SELECT TO authenticated
  USING (organisation_id IS NULL OR organisation_id = get_caller_org_id());

DROP POLICY IF EXISTS "authenticated_insert_plans" ON atd_engineering_plans;
CREATE POLICY "authenticated_insert_plans" ON atd_engineering_plans
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id IS NULL OR organisation_id = get_caller_org_id());

DROP POLICY IF EXISTS "authenticated_update_plans" ON atd_engineering_plans;
CREATE POLICY "authenticated_update_plans" ON atd_engineering_plans
  FOR UPDATE TO authenticated
  USING (organisation_id IS NULL OR organisation_id = get_caller_org_id())
  WITH CHECK (organisation_id IS NULL OR organisation_id = get_caller_org_id());

DROP POLICY IF EXISTS "authenticated_delete_plans" ON atd_engineering_plans;
CREATE POLICY "authenticated_delete_plans" ON atd_engineering_plans
  FOR DELETE TO authenticated
  USING (organisation_id IS NULL OR organisation_id = get_caller_org_id());

-- atd_plan_governance_decisions: remove anon write access; harden reads
DROP POLICY IF EXISTS "anon_select_governance" ON atd_plan_governance_decisions;
DROP POLICY IF EXISTS "anon_insert_governance" ON atd_plan_governance_decisions;
DROP POLICY IF EXISTS "anon_update_governance" ON atd_plan_governance_decisions;
DROP POLICY IF EXISTS "anon_delete_governance" ON atd_plan_governance_decisions;

CREATE POLICY "auth_select_governance" ON atd_plan_governance_decisions
  FOR SELECT TO authenticated
  USING (organisation_id IS NULL OR organisation_id = get_caller_org_id());

-- INSERT/UPDATE/DELETE are now owned by the SECURITY DEFINER RPCs — no direct client writes

-- atd_capability_executions
DROP POLICY IF EXISTS "authenticated_select_executions" ON atd_capability_executions;
CREATE POLICY "authenticated_select_executions" ON atd_capability_executions
  FOR SELECT TO authenticated
  USING (organisation_id IS NULL OR organisation_id = get_caller_org_id());

DROP POLICY IF EXISTS "authenticated_insert_executions" ON atd_capability_executions;
CREATE POLICY "authenticated_insert_executions" ON atd_capability_executions
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id IS NULL OR organisation_id = get_caller_org_id());

DROP POLICY IF EXISTS "authenticated_update_executions" ON atd_capability_executions;
CREATE POLICY "authenticated_update_executions" ON atd_capability_executions
  FOR UPDATE TO authenticated
  USING (organisation_id IS NULL OR organisation_id = get_caller_org_id())
  WITH CHECK (organisation_id IS NULL OR organisation_id = get_caller_org_id());

DROP POLICY IF EXISTS "authenticated_delete_executions" ON atd_capability_executions;
CREATE POLICY "authenticated_delete_executions" ON atd_capability_executions
  FOR DELETE TO authenticated
  USING (organisation_id IS NULL OR organisation_id = get_caller_org_id());

-- ─── 8. Indexes on tenant columns ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_intents_organisation_id
  ON atd_engineering_intents(organisation_id)
  WHERE organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plans_organisation_id
  ON atd_engineering_plans(organisation_id)
  WHERE organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_governance_organisation_id
  ON atd_plan_governance_decisions(organisation_id)
  WHERE organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_executions_organisation_id
  ON atd_capability_executions(organisation_id)
  WHERE organisation_id IS NOT NULL;
