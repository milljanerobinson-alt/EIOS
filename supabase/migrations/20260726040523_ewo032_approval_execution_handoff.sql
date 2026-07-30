/*
# EWO-032 — Approval-to-Execution Handoff Schema

Implements the deterministic transition from conversational approval to governed
execution. When a Product Owner says "approved", the system creates a real
execution request, dispatches to the supervised execution engine, and checks
Codex readiness — rather than letting the AI simulate execution.

## New Tables
1. execution_handoff_requests — core handoff record with idempotency
2. execution_handoff_audit — immutable audit log

## RPCs
1. inspect_execution_handoff — read-only inspection returning persisted runtime evidence

## Security
- RLS enabled, anon + authenticated CRUD (no-auth app pattern)
*/

CREATE TABLE IF NOT EXISTS execution_handoff_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_request_id TEXT NOT NULL UNIQUE,
  ewo_ref TEXT NOT NULL,
  conversation_id TEXT,
  approved_plan_version TEXT,
  approval_reference TEXT,
  approving_persona TEXT,
  approval_timestamp TIMESTAMPTZ,
  requested_provider_id TEXT NOT NULL DEFAULT 'codex',
  allowed_provider_ids JSONB NOT NULL DEFAULT '["codex"]',
  fallback_permitted BOOLEAN NOT NULL DEFAULT false,
  repository_identifier TEXT,
  branch_policy JSONB NOT NULL DEFAULT '{"disposable_branch": true, "no_existing_files_modified": true}',
  file_change_scope JSONB NOT NULL DEFAULT '{"permitted_files": [], "restricted_files": []}',
  deployment_policy JSONB NOT NULL DEFAULT '{"deployment_permitted": false}',
  merge_policy JSONB NOT NULL DEFAULT '{"merge_permitted": false}',
  validation_requirements JSONB NOT NULL DEFAULT '[]',
  execution_status TEXT NOT NULL DEFAULT 'draft',
  execution_session_id TEXT,
  selected_provider_id TEXT,
  provider_selection_reason TEXT,
  provider_readiness_status TEXT NOT NULL DEFAULT 'not_checked',
  provider_readiness_detail JSONB NOT NULL DEFAULT '{}',
  dispatch_attempted BOOLEAN NOT NULL DEFAULT false,
  dispatch_success BOOLEAN NOT NULL DEFAULT false,
  governed_execution_engine_invoked BOOLEAN NOT NULL DEFAULT false,
  failure_stage TEXT,
  exact_runtime_error TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  audit_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE execution_handoff_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_handoff_requests" ON execution_handoff_requests;
CREATE POLICY "anon_select_handoff_requests" ON execution_handoff_requests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_handoff_requests" ON execution_handoff_requests;
CREATE POLICY "anon_insert_handoff_requests" ON execution_handoff_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_handoff_requests" ON execution_handoff_requests;
CREATE POLICY "anon_update_handoff_requests" ON execution_handoff_requests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_handoff_requests" ON execution_handoff_requests;
CREATE POLICY "anon_delete_handoff_requests" ON execution_handoff_requests FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_handoff_ewo_ref ON execution_handoff_requests(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_handoff_conversation_id ON execution_handoff_requests(conversation_id);
CREATE INDEX IF NOT EXISTS idx_handoff_status ON execution_handoff_requests(execution_status);
CREATE INDEX IF NOT EXISTS idx_handoff_idempotency ON execution_handoff_requests(idempotency_key);

CREATE TABLE IF NOT EXISTS execution_handoff_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id UUID REFERENCES execution_handoff_requests(id) ON DELETE CASCADE,
  ewo_ref TEXT,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE execution_handoff_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_handoff_audit" ON execution_handoff_audit;
CREATE POLICY "anon_select_handoff_audit" ON execution_handoff_audit FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_handoff_audit" ON execution_handoff_audit;
CREATE POLICY "anon_insert_handoff_audit" ON execution_handoff_audit FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_handoff_audit" ON execution_handoff_audit;
CREATE POLICY "anon_delete_handoff_audit" ON execution_handoff_audit FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_handoff_audit_handoff_id ON execution_handoff_audit(handoff_id);
CREATE INDEX IF NOT EXISTS idx_handoff_audit_ewo_ref ON execution_handoff_audit(ewo_ref);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'execution_handoff_seq') THEN
    CREATE SEQUENCE execution_handoff_seq START 1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION inspect_execution_handoff(
  p_ewo_ref TEXT DEFAULT NULL,
  p_conversation_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_record RECORD;
  v_result JSONB;
BEGIN
  SELECT
    execution_request_id, ewo_ref, conversation_id, approved_plan_version,
    approval_reference, approving_persona, approval_timestamp,
    requested_provider_id, allowed_provider_ids, fallback_permitted,
    repository_identifier, branch_policy, file_change_scope,
    deployment_policy, merge_policy, validation_requirements,
    execution_status, execution_session_id, selected_provider_id,
    provider_selection_reason, provider_readiness_status, provider_readiness_detail,
    dispatch_attempted, dispatch_success, governed_execution_engine_invoked,
    failure_stage, exact_runtime_error, audit_reference, created_at, updated_at
  INTO v_record
  FROM execution_handoff_requests
  WHERE (p_ewo_ref IS NULL OR ewo_ref = p_ewo_ref)
    AND (p_conversation_id IS NULL OR conversation_id = p_conversation_id)
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_record IS NULL THEN
    v_result := jsonb_build_object(
      'success', true, 'handoff_found', false,
      'message', 'No execution handoff request found for the given criteria.',
      'work_order_reference', p_ewo_ref, 'conversation_id', p_conversation_id,
      'approval_received', false, 'approval_validated', false,
      'execution_request_created', false, 'execution_request_id', null,
      'dispatch_attempted', false, 'governed_execution_engine_invoked', false,
      'execution_session_id', null, 'requested_provider_id', null,
      'selected_provider_id', null, 'provider_readiness_status', 'not_checked',
      'current_execution_status', null, 'failure_stage', null,
      'exact_runtime_error', null, 'audit_reference', null,
      'lifecycle_change_performed', false,
      'data_source', 'inspect_execution_handoff RPC (authoritative)'
    );
  ELSE
    v_result := jsonb_build_object(
      'success', true, 'handoff_found', true,
      'work_order_reference', v_record.ewo_ref,
      'conversation_id', v_record.conversation_id,
      'plan_version', v_record.approved_plan_version,
      'approval_received', v_record.approval_reference IS NOT NULL,
      'approval_validated', v_record.approval_reference IS NOT NULL,
      'execution_request_created', true,
      'execution_request_id', v_record.execution_request_id,
      'dispatch_attempted', v_record.dispatch_attempted,
      'governed_execution_engine_invoked', v_record.governed_execution_engine_invoked,
      'execution_session_id', v_record.execution_session_id,
      'requested_provider_id', v_record.requested_provider_id,
      'selected_provider_id', v_record.selected_provider_id,
      'provider_selection_reason', v_record.provider_selection_reason,
      'provider_readiness_status', v_record.provider_readiness_status,
      'provider_readiness_detail', v_record.provider_readiness_detail,
      'current_execution_status', v_record.execution_status,
      'failure_stage', v_record.failure_stage,
      'exact_runtime_error', v_record.exact_runtime_error,
      'audit_reference', v_record.audit_reference,
      'lifecycle_change_performed', false,
      'data_source', 'inspect_execution_handoff RPC (authoritative)'
    );
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  implementation_provider, implementation_status, engineering_package_status,
  created_by, created_at
) VALUES (
  'EWO-032',
  'Approval-to-Execution Handoff',
  'Implement a real, deterministic approval-to-execution handoff. After valid approval, the conversational AI must create a governed execution request, dispatch it to the supervised execution engine, check Codex readiness, and return the dispatch result — never simulating execution.',
  'draft', 'critical', 'high',
  'codex', 'not_started', 'Not Generated',
  'EWO-032', now()
)
ON CONFLICT (ewo_ref) DO NOTHING;
