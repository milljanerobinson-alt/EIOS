/*
# Engineering Change Records

Stores a permanent, auditable record of every AI-approved engineering change.

## New Tables

### ecc_change_records
Captures every implementation that passes through the AI engineering workflow (Analyse → Prepare → Approve → Apply).

Columns:
- id: UUID primary key
- change_ref: Human-readable reference (CR-XXXXXXXX)
- conversation_id: Links back to the AI conversation that produced this change
- requested_by: The authenticated admin who approved the change
- task_name: Short name for the change
- original_request: The user's original request text
- root_cause: Root cause identified during analysis (for bug fixes)
- implementation_summary: Plain-English summary of what was implemented
- confidence_score: AI confidence 0-100
- confidence_reason: Plain-English explanation of confidence level
- risk_level: low | medium | high | critical
- estimated_time: Human-readable time estimate
- target_environment: staging | production
- rollback_available: Whether rollback artifacts were prepared
- rollback_instructions: Step-by-step rollback instructions
- evidence_used: Evidence relied on during analysis
- affected_features: Array of FEAT-XXX identifiers
- affected_components: React components changed
- affected_edge_functions: Edge functions changed
- affected_db_tables: Database tables affected
- affected_migrations: Migration filenames applied
- changes: JSON counts (react_components, edge_functions, db_migrations, documentation, regression_tests)
- approved_at: Timestamp when user clicked Approve
- status: approved | rolled_back | superseded
- notes: Any additional notes

## Security
- RLS enabled, admin-scoped (authenticated users only).
- Admins can read all change records.
- Only the system can insert (via service role in edge function).
*/

CREATE TABLE IF NOT EXISTS ecc_change_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_ref text NOT NULL DEFAULT ('CR-' || upper(substring(gen_random_uuid()::text, 1, 8))),
  conversation_id uuid REFERENCES cc_ai_conversations(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  task_name text NOT NULL DEFAULT '',
  original_request text,
  root_cause text,
  implementation_summary text,
  confidence_score integer CHECK (confidence_score BETWEEN 0 AND 100),
  confidence_reason text,
  risk_level text DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  estimated_time text,
  target_environment text DEFAULT 'staging',
  rollback_available boolean DEFAULT false,
  rollback_instructions text,
  evidence_used text,
  affected_features text[] DEFAULT '{}',
  affected_components text[] DEFAULT '{}',
  affected_edge_functions text[] DEFAULT '{}',
  affected_db_tables text[] DEFAULT '{}',
  affected_migrations text[] DEFAULT '{}',
  changes jsonb DEFAULT '{}',
  approved_at timestamptz DEFAULT now(),
  status text DEFAULT 'approved' CHECK (status IN ('approved', 'rolled_back', 'superseded')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_change_records_conversation ON ecc_change_records(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ecc_change_records_requested_by ON ecc_change_records(requested_by);
CREATE INDEX IF NOT EXISTS idx_ecc_change_records_created_at ON ecc_change_records(created_at DESC);

ALTER TABLE ecc_change_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_change_records" ON ecc_change_records;
CREATE POLICY "admins_select_change_records" ON ecc_change_records
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admins_insert_change_records" ON ecc_change_records;
CREATE POLICY "admins_insert_change_records" ON ecc_change_records
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admins_update_change_records" ON ecc_change_records;
CREATE POLICY "admins_update_change_records" ON ecc_change_records
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
