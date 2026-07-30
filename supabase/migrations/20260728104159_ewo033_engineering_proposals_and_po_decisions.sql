/*
# EWO-033R.1: Engineering Proposals and PO Decision Tables

## Purpose
Introduces the governed Engineering Proposal decision object and first-class
Product Owner decision records. These tables support the conversation-first
engineering operating system where the PO makes exactly three decisions:
Proposal Approval, Execution Approval, and Completion Acceptance.

## New Tables

### 1. engineering_proposals
The Engineering Proposal is a governed decision object — not just a document.
It contains the full analysis, plan, scope, risks, dependencies, similarity
results, acceptance criteria, constitutional status, complexity, and impact.
The PO acts on it (approve / request changes / cancel). Each refinement creates
a new version linked to the parent, preserving full audit history.

- id (uuid, PK)
- proposal_ref (text, unique — e.g. PROP-001)
- idea_id (uuid, FK → engineering_idea)
- ewo_id (uuid, FK → engineering_work_orders, nullable)
- status (text — draft, presented, approved, rejected, superseded)
- analysis (jsonb — Engineering Analysis)
- plan (jsonb — Engineering Plan)
- scope (jsonb — Scope boundaries)
- risks (jsonb — Identified risks)
- dependencies (jsonb — Dependencies)
- similarity_results (jsonb — Similarity review)
- acceptance_criteria (jsonb — Acceptance criteria)
- constitutional_status (jsonb — Constitutional validation state)
- complexity (text — Estimated complexity)
- impact (text — Expected impact)
- po_decision (text — approved, rejected, changes_requested, null)
- po_decision_at, po_decision_by, po_decision_notes
- version (integer, default 1)
- parent_proposal_id (uuid, self-ref, nullable)
- refinement_history (jsonb, default [])
- created_at, updated_at, created_by

### 2. po_decisions
First-class governed records for the three canonical Product Owner decisions.
Each decision records the type, what it applies to, the decision value, notes,
who decided, when, the lifecycle stage before and after, and constitutional
validation at decision time.

- id (uuid, PK)
- decision_type (text — proposal_approval, execution_approval, completion_acceptance)
- decision_ref (text, unique — e.g. DEC-001)
- proposal_id (uuid, FK → engineering_proposals, nullable)
- ewo_id (uuid, FK → engineering_work_orders, nullable)
- execution_id (uuid, FK → engineering_executions, nullable)
- decision (text — approved, rejected, changes_requested)
- notes (text)
- decided_by (uuid)
- decided_at (timestamptz)
- lifecycle_stage_before (text)
- lifecycle_stage_after (text)
- constitutional_validation (jsonb)
- audit_trail_id (uuid, nullable)

## Security
- RLS enabled on both tables.
- Policies scoped to authenticated users (the app has a sign-in screen).
- Full CRUD for authenticated users on both tables.

## Important Notes
1. Both tables use gen_random_uuid() for IDs.
2. engineering_proposals references engineering_idea and engineering_work_orders.
3. po_decisions references engineering_proposals, engineering_work_orders, and engineering_executions.
4. Refinement history is tracked via parent_proposal_id self-reference + version field.
5. These tables do not modify any existing tables — purely additive.
*/

-- ─── Engineering Proposals ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_ref text UNIQUE NOT NULL,
  idea_id uuid REFERENCES engineering_idea(id) ON DELETE SET NULL,
  ewo_id uuid REFERENCES engineering_work_orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  analysis jsonb DEFAULT '{}',
  plan jsonb DEFAULT '{}',
  scope jsonb DEFAULT '{}',
  risks jsonb DEFAULT '[]',
  dependencies jsonb DEFAULT '[]',
  similarity_results jsonb DEFAULT '[]',
  acceptance_criteria jsonb DEFAULT '[]',
  constitutional_status jsonb DEFAULT '{}',
  complexity text,
  impact text,
  po_decision text,
  po_decision_at timestamptz,
  po_decision_by uuid,
  po_decision_notes text,
  version integer NOT NULL DEFAULT 1,
  parent_proposal_id uuid REFERENCES engineering_proposals(id) ON DELETE SET NULL,
  refinement_history jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid
);

ALTER TABLE engineering_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_engineering_proposals" ON engineering_proposals;
CREATE POLICY "select_engineering_proposals"
  ON engineering_proposals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_engineering_proposals" ON engineering_proposals;
CREATE POLICY "insert_engineering_proposals"
  ON engineering_proposals FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_engineering_proposals" ON engineering_proposals;
CREATE POLICY "update_engineering_proposals"
  ON engineering_proposals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_engineering_proposals" ON engineering_proposals;
CREATE POLICY "delete_engineering_proposals"
  ON engineering_proposals FOR DELETE TO authenticated USING (true);

-- ─── Product Owner Decisions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS po_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_type text NOT NULL,
  decision_ref text UNIQUE NOT NULL,
  proposal_id uuid REFERENCES engineering_proposals(id) ON DELETE SET NULL,
  ewo_id uuid REFERENCES engineering_work_orders(id) ON DELETE SET NULL,
  execution_id uuid REFERENCES engineering_executions(id) ON DELETE SET NULL,
  decision text NOT NULL,
  notes text,
  decided_by uuid,
  decided_at timestamptz DEFAULT now(),
  lifecycle_stage_before text,
  lifecycle_stage_after text,
  constitutional_validation jsonb DEFAULT '{}',
  audit_trail_id uuid
);

ALTER TABLE po_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_po_decisions" ON po_decisions;
CREATE POLICY "select_po_decisions"
  ON po_decisions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_po_decisions" ON po_decisions;
CREATE POLICY "insert_po_decisions"
  ON po_decisions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_po_decisions" ON po_decisions;
CREATE POLICY "update_po_decisions"
  ON po_decisions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_po_decisions" ON po_decisions;
CREATE POLICY "delete_po_decisions"
  ON po_decisions FOR DELETE TO authenticated USING (true);

-- ─── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_eng_proposals_idea_id ON engineering_proposals(idea_id);
CREATE INDEX IF NOT EXISTS idx_eng_proposals_ewo_id ON engineering_proposals(ewo_id);
CREATE INDEX IF NOT EXISTS idx_eng_proposals_status ON engineering_proposals(status);
CREATE INDEX IF NOT EXISTS idx_po_decisions_proposal_id ON po_decisions(proposal_id);
CREATE INDEX IF NOT EXISTS idx_po_decisions_ewo_id ON po_decisions(ewo_id);
CREATE INDEX IF NOT EXISTS idx_po_decisions_type ON po_decisions(decision_type);
