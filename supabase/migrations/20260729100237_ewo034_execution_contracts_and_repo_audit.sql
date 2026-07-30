/*
# EWO-034: Execution Contracts and Repository Change Audit

## Purpose
Persists execution contracts and repository change audit records so that
every governed execution has a durable, queryable audit trail.

## New Tables

### execution_contracts
Stores the full execution contract generated before each provider invocation.
- contract_ref: unique reference (EC-XXXX)
- ewo_uuid: FK to engineering_work_orders
- ewo_ref: human-readable EWO reference
- original_po_request: the original Product Owner request text
- engineering_objective: derived objective
- implementation_scope: scoped implementation description
- excluded_scope: what is explicitly out of scope
- resolved_components: array of resolved component file paths
- proposed_source_files: array of proposed source file paths
- acceptance_criteria: JSONB — the full AcceptanceCriteriaSet
- execution_provider: provider ID (codex, bolt, etc.)
- execution_mode: real | simulation | dry_run
- target_environment: staging | production
- verification_plan: text describing verification approach
- unresolved_risks: array of risk strings
- clarification_requirements: array of clarification strings
- readiness_result: JSONB — the ContractReadinessResult
- status: draft | validated | rejected | superseded
- created_at: timestamp

### repository_change_audit
Audit trail for every repository file operation performed by the
Repository Change Application Service.
- audit_ref: unique reference (REPO-XXXX)
- execution_id: the execution session ID
- ewo_ref: the EWO reference
- actor: who initiated the change
- environment: staging | production
- operation: write | delete | build | test | rollback
- file_path: the file affected (for write/delete operations)
- action: create | modify | delete | restore
- content_size: bytes written
- files_applied: array of file paths applied
- snapshots: JSONB — pre-change snapshots
- diff_evidence: JSONB — diff evidence
- build_result: JSONB — build execution result
- test_result: JSONB — test execution result
- rollback_performed: boolean
- created_at: timestamp

## Security
- Both tables have RLS enabled
- Policies allow authenticated users to read and insert
- Updates are restricted to authenticated users
*/

CREATE TABLE IF NOT EXISTS execution_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_ref text UNIQUE NOT NULL,
  ewo_uuid uuid REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  ewo_ref text NOT NULL,
  original_po_request text,
  engineering_objective text,
  implementation_scope text,
  excluded_scope text DEFAULT 'No scope exclusions defined',
  resolved_components text[] DEFAULT '{}',
  proposed_source_files text[] DEFAULT '{}',
  acceptance_criteria jsonb,
  execution_provider text DEFAULT 'codex',
  execution_mode text DEFAULT 'real',
  target_environment text DEFAULT 'staging',
  verification_plan text,
  unresolved_risks text[] DEFAULT '{}',
  clarification_requirements text[] DEFAULT '{}',
  readiness_result jsonb,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE execution_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_execution_contracts" ON execution_contracts;
CREATE POLICY "select_execution_contracts"
  ON execution_contracts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_execution_contracts" ON execution_contracts;
CREATE POLICY "insert_execution_contracts"
  ON execution_contracts FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_execution_contracts" ON execution_contracts;
CREATE POLICY "update_execution_contracts"
  ON execution_contracts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS repository_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_ref text UNIQUE NOT NULL,
  execution_id text,
  ewo_ref text,
  actor text,
  environment text,
  operation text,
  file_path text,
  action text,
  content_size integer,
  files_applied text[] DEFAULT '{}',
  snapshots jsonb,
  diff_evidence jsonb,
  build_result jsonb,
  test_result jsonb,
  rollback_performed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE repository_change_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_repository_change_audit" ON repository_change_audit;
CREATE POLICY "select_repository_change_audit"
  ON repository_change_audit FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_repository_change_audit" ON repository_change_audit;
CREATE POLICY "insert_repository_change_audit"
  ON repository_change_audit FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_repository_change_audit" ON repository_change_audit;
CREATE POLICY "update_repository_change_audit"
  ON repository_change_audit FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Emergency stop flag for the execution pipeline
CREATE TABLE IF NOT EXISTS execution_emergency_stop (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean DEFAULT false,
  reason text,
  activated_by text,
  activated_at timestamptz,
  deactivated_at timestamptz
);

ALTER TABLE execution_emergency_stop ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_execution_emergency_stop" ON execution_emergency_stop;
CREATE POLICY "select_execution_emergency_stop"
  ON execution_emergency_stop FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_execution_emergency_stop" ON execution_emergency_stop;
CREATE POLICY "insert_execution_emergency_stop"
  ON execution_emergency_stop FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_execution_emergency_stop" ON execution_emergency_stop;
CREATE POLICY "update_execution_emergency_stop"
  ON execution_emergency_stop FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Concurrent execution lock table
CREATE TABLE IF NOT EXISTS execution_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_ref text UNIQUE NOT NULL,
  locked_by text NOT NULL,
  locked_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

ALTER TABLE execution_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_execution_locks" ON execution_locks;
CREATE POLICY "select_execution_locks"
  ON execution_locks FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_execution_locks" ON execution_locks;
CREATE POLICY "insert_execution_locks"
  ON execution_locks FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_execution_locks" ON execution_locks;
CREATE POLICY "delete_execution_locks"
  ON execution_locks FOR DELETE
  TO authenticated USING (true);
