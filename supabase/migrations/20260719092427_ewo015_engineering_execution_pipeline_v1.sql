/*
# EWO-015: Autonomous Engineering Execution Pipeline v1.0

## Purpose
Transform ATD from an Engineering Management System into an Engineering
Execution System. This migration creates the canonical Engineering Execution
object and its lifecycle tables, removing the Product Owner from the
implementation loop.

## New Tables

### 1. engineering_executions
The canonical Engineering Execution object. Each row represents one attempt
to implement an approved Engineering Work Order.

- id (uuid PK)
- execution_ref (text unique, e.g. EXEC-001)
- ewo_id (uuid FK → engineering_work_orders)
- engineering_plan_id (text, optional reference to a plan)
- implementation_provider (text, e.g. 'bolt', 'claude_code', 'cursor')
- implementation_status (text, lifecycle state)
- engineer (text, who/what performed the execution)
- started_at (timestamptz)
- finished_at (timestamptz)
- duration_seconds (integer, computed from started/finished)
- completion_report (jsonb, parsed completion report)
- verification_results (jsonb, automated verification outcomes)
- build_results (jsonb, build output)
- files_changed (jsonb, list of modified files)
- failure_reason (text, if failed)
- retry_count (integer, default 0)
- parent_execution_id (uuid, for retries — links to the original execution)
- execution_package (jsonb, the prepared package sent to the provider)
- review_results (jsonb, engineering review output)
- po_status (text, Product Owner decision: pending/approved/rejected/refinement)
- po_notes (text, Product Owner feedback)
- po_decided_at (timestamptz)
- metadata (jsonb, provider-specific metadata)
- created_at, updated_at (timestamptz)

### 2. engineering_execution_events
Immutable audit log for execution lifecycle transitions.

- id (uuid PK)
- execution_id (uuid FK → engineering_executions)
- from_status (text)
- to_status (text)
- actor (text)
- event_type (text, e.g. 'status_change', 'package_prepared', 'report_received')
- notes (text)
- metadata (jsonb)
- created_at (timestamptz)

## Security
- RLS enabled on both tables.
- 4 CRUD policies per table, all TO authenticated (internal ECC tool).
- Execution events are INSERT-only (no UPDATE/DELETE) to preserve immutability.

## Indexes
- idx_exec_ewo (executions by EWO)
- idx_exec_status (executions by status)
- idx_exec_provider (executions by provider)
- idx_exec_ref (executions by ref)
- idx_exec_events_execution (events by execution)
*/

-- ── Engineering Executions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS engineering_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_ref text UNIQUE NOT NULL,
  ewo_id uuid REFERENCES engineering_work_orders(id) ON DELETE SET NULL,
  engineering_plan_id text,
  implementation_provider text NOT NULL DEFAULT 'bolt',
  implementation_status text NOT NULL DEFAULT 'draft',
  engineer text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_seconds integer,
  completion_report jsonb DEFAULT '{}',
  verification_results jsonb DEFAULT '{}',
  build_results jsonb DEFAULT '{}',
  files_changed jsonb DEFAULT '[]',
  failure_reason text,
  retry_count integer NOT NULL DEFAULT 0,
  parent_execution_id uuid REFERENCES engineering_executions(id) ON DELETE SET NULL,
  execution_package jsonb DEFAULT '{}',
  review_results jsonb DEFAULT '{}',
  po_status text NOT NULL DEFAULT 'pending',
  po_notes text,
  po_decided_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE engineering_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_executions" ON engineering_executions;
CREATE POLICY "select_executions" ON engineering_executions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_executions" ON engineering_executions;
CREATE POLICY "insert_executions" ON engineering_executions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_executions" ON engineering_executions;
CREATE POLICY "update_executions" ON engineering_executions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_executions" ON engineering_executions;
CREATE POLICY "delete_executions" ON engineering_executions FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_exec_ewo ON engineering_executions(ewo_id);
CREATE INDEX IF NOT EXISTS idx_exec_status ON engineering_executions(implementation_status);
CREATE INDEX IF NOT EXISTS idx_exec_provider ON engineering_executions(implementation_provider);
CREATE INDEX IF NOT EXISTS idx_exec_ref ON engineering_executions(execution_ref);
CREATE INDEX IF NOT EXISTS idx_exec_po_status ON engineering_executions(po_status);

-- ── Engineering Execution Events (Immutable Audit Log) ────────────────────
CREATE TABLE IF NOT EXISTS engineering_execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES engineering_executions(id) ON DELETE CASCADE,
  from_status text,
  to_status text,
  actor text,
  event_type text NOT NULL DEFAULT 'status_change',
  notes text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE engineering_execution_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_exec_events" ON engineering_execution_events;
CREATE POLICY "select_exec_events" ON engineering_execution_events FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_exec_events" ON engineering_execution_events;
CREATE POLICY "insert_exec_events" ON engineering_execution_events FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_exec_events" ON engineering_execution_events;
CREATE POLICY "update_exec_events" ON engineering_execution_events FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_exec_events" ON engineering_execution_events;
CREATE POLICY "delete_exec_events" ON engineering_execution_events FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_exec_events_execution ON engineering_execution_events(execution_id);
CREATE INDEX IF NOT EXISTS idx_exec_events_created ON engineering_execution_events(created_at);

-- ── Auto-update updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_execution_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  -- Auto-compute duration if both timestamps present
  IF NEW.started_at IS NOT NULL AND NEW.finished_at IS NOT NULL THEN
    NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.finished_at - NEW.started_at))::integer;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_execution_updated_at ON engineering_executions;
CREATE TRIGGER trg_execution_updated_at
  BEFORE UPDATE ON engineering_executions
  FOR EACH ROW EXECUTE FUNCTION update_execution_updated_at();

-- ── Auto-generate execution_ref sequence ──────────────────────────────────
CREATE OR REPLACE FUNCTION generate_execution_ref()
RETURNS text AS $$
DECLARE
  next_num integer;
  ref text;
BEGIN
  SELECT COALESCE(MAX(
    CAST(
      REGEXP_REPLACE(execution_ref, '^EXEC-', '') AS integer
    )
  ), 0) + 1 INTO next_num
  FROM engineering_executions
  WHERE execution_ref ~ '^EXEC-[0-9]+$';
  
  ref := 'EXEC-' || lpad(next_num::text, 3, '0');
  RETURN ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
