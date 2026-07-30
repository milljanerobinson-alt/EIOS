/*
# EWO-017R.5 — Constitutional Verification Classification & Mandatory Verification Evidence Governance

## Purpose
Permanently embeds the four-level verification model into the constitutional governance of EIOS:
1. Unit Verification
2. Integration Verification
3. End-to-End Verification
4. Product Owner Verification

## Changes

### 1. New Table: `ewo_constitutional_verification`
Stores verification evidence separately for each of the four constitutional levels.
- `id` (uuid PK)
- `ewo_id` (uuid FK → engineering_work_orders)
- `verification_level` (text: 'unit' | 'integration' | 'end_to_end' | 'product_owner')
- `status` (text: 'not_run' | 'passed' | 'failed' | 'blocked' | 'not_applicable' | 'pending')
- `evidence` (text — summary of evidence)
- `evidence_artefacts` (jsonb — structured artefact references)
- `verifier` (text — who performed the verification)
- `result` (text — pass/fail/blocked outcome)
- `notes` (text — additional context)
- `verified_at` (timestamptz — when verification was performed)
- `created_at`, `updated_at` (timestamptz)
- UNIQUE constraint on (ewo_id, verification_level) — one row per level per EWO

### 2. New Table: `engineering_execution_issue_detection`
Records which verification level detected each issue during execution.
- `id` (uuid PK)
- `execution_id` (uuid FK → engineering_executions)
- `ewo_id` (uuid FK → engineering_work_orders)
- `issue_ref` (text — issue identifier)
- `detected_by_level` (text: 'unit' | 'integration' | 'end_to_end' | 'product_owner')
- `description` (text)
- `resolved` (boolean, default false)
- `created_at` (timestamptz)

### 3. Columns on `engineering_work_orders`
- `unit_verification_status` (text, default 'not_run')
- `integration_verification_status` (text, default 'not_run')
- `end_to_end_verification_status` (text, default 'not_run')
- `product_owner_verification_status` (text, default 'not_run')
These are summary columns for quick UI display; the canonical evidence is in ewo_constitutional_verification.

### 4. Constitutional Amendment AMD-007
Records the four-level verification model as a constitutional amendment.

### 5. ES-003 Standard Update
Updates ES-003 to reference the constitutional verification model.

### 6. EWO-017R.5 Registration
Registers the work order in engineering_complete state.

### 7. Backfill
Migrates existing completion_report_status.verification → unit_verification_status where appropriate.

## Security
- RLS enabled on both new tables.
- 4 CRUD policies each, scoped to authenticated users.
*/

-- ─── 1. Constitutional Verification Evidence Table ────────────────────────────

CREATE TABLE IF NOT EXISTS ewo_constitutional_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id uuid NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  verification_level text NOT NULL CHECK (verification_level IN ('unit', 'integration', 'end_to_end', 'product_owner')),
  status text NOT NULL DEFAULT 'not_run' CHECK (status IN ('not_run', 'passed', 'failed', 'blocked', 'not_applicable', 'pending')),
  evidence text,
  evidence_artefacts jsonb DEFAULT '[]'::jsonb,
  verifier text,
  result text,
  notes text,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (ewo_id, verification_level)
);

ALTER TABLE ewo_constitutional_verification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_constitutional_verification" ON ewo_constitutional_verification;
CREATE POLICY "select_constitutional_verification" ON ewo_constitutional_verification
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_constitutional_verification" ON ewo_constitutional_verification;
CREATE POLICY "insert_constitutional_verification" ON ewo_constitutional_verification
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_constitutional_verification" ON ewo_constitutional_verification;
CREATE POLICY "update_constitutional_verification" ON ewo_constitutional_verification
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_constitutional_verification" ON ewo_constitutional_verification;
CREATE POLICY "delete_constitutional_verification" ON ewo_constitutional_verification
  FOR DELETE TO authenticated USING (true);

-- ─── 2. Execution Issue Detection Table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_execution_issue_detection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid REFERENCES engineering_executions(id) ON DELETE CASCADE,
  ewo_id uuid REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  issue_ref text,
  detected_by_level text NOT NULL CHECK (detected_by_level IN ('unit', 'integration', 'end_to_end', 'product_owner')),
  description text,
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE engineering_execution_issue_detection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_execution_issue_detection" ON engineering_execution_issue_detection;
CREATE POLICY "select_execution_issue_detection" ON engineering_execution_issue_detection
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_execution_issue_detection" ON engineering_execution_issue_detection;
CREATE POLICY "insert_execution_issue_detection" ON engineering_execution_issue_detection
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_execution_issue_detection" ON engineering_execution_issue_detection;
CREATE POLICY "update_execution_issue_detection" ON engineering_execution_issue_detection
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_execution_issue_detection" ON engineering_execution_issue_detection;
CREATE POLICY "delete_execution_issue_detection" ON engineering_execution_issue_detection
  FOR DELETE TO authenticated USING (true);

-- ─── 3. Summary Columns on engineering_work_orders ──────────────────────────────

DO $$ BEGIN
  ALTER TABLE engineering_work_orders ADD COLUMN unit_verification_status text NOT NULL DEFAULT 'not_run';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE engineering_work_orders ADD COLUMN integration_verification_status text NOT NULL DEFAULT 'not_run';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE engineering_work_orders ADD COLUMN end_to_end_verification_status text NOT NULL DEFAULT 'not_run';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE engineering_work_orders ADD COLUMN product_owner_verification_status text NOT NULL DEFAULT 'not_run';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ─── 4. Constitutional Amendment AMD-007 ────────────────────────────────────────

INSERT INTO audit_trail (event_type, event_data, timestamp, category, severity, description)
SELECT
  'constitutional_amendment',
  jsonb_build_object(
    'amendment_ref', 'AMD-007',
    'title', 'Constitutional Verification Classification & Mandatory Verification Evidence Governance',
    'summary', 'Verification permanently consists of four constitutional levels: Unit, Integration, End-to-End, and Product Owner. Product Owner Acceptance cannot occur until Unit, Integration, and End-to-End verification have all passed. Each level stores evidence separately. Engineering Completion Reports must distinguish all verification types.',
    'verification_levels', jsonb_build_array('unit', 'integration', 'end_to_end', 'product_owner'),
    'po_acceptance_gate', 'Product Owner Acceptance requires Unit + Integration + End-to-End all passed',
    'enacted_at', now()
  ),
  now(),
  'governance',
  'info',
  'AMD-007: Constitutional Verification Classification enacted'
WHERE NOT EXISTS (
  SELECT 1 FROM audit_trail
  WHERE event_type = 'constitutional_amendment'
  AND event_data->>'amendment_ref' = 'AMD-007'
);

-- ─── 5. ES-003 Standard Update ──────────────────────────────────────────────────

UPDATE ecc_engineering_standards
SET body = replace(
  body,
  'End-to-End testing becomes one mandatory verification stage.',
  'End-to-End testing is one of four mandatory constitutional verification stages: Unit, Integration, End-to-End, and Product Owner. Product Owner Acceptance cannot occur until Unit, Integration, and End-to-End verification have all passed (AMD-007).'
),
  updated_at = now()
WHERE version_introduced = 'ES-003';

-- ─── 6. EWO-017R.5 Registration ─────────────────────────────────────────────────

INSERT INTO engineering_work_orders (ewo_ref, title, executive_summary, status, priority, risk_level, parent_ref, created_at, updated_at)
SELECT
  'EWO-017R.5',
  'Constitutional Verification Classification & Mandatory Verification Evidence Governance',
  'Permanently embed the four-level verification model (Unit, Integration, End-to-End, Product Owner) into constitutional governance. Product Owner Acceptance gate enforces mandatory verification evidence. Completion Reports distinguish verification types. EWO UI exposes verification progress.',
  'engineering_complete',
  'high',
  'low',
  'EWO-017R.4',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-017R.5');

-- ─── 7. Backfill existing verification evidence ─────────────────────────────────

-- Migrate existing verification_status to unit_verification_status where it was 'verified'
UPDATE engineering_work_orders
SET unit_verification_status = 'passed'
WHERE verification_status = 'verified'
  AND unit_verification_status = 'not_run';

-- Migrate existing po_testing_status to product_owner_verification_status
UPDATE engineering_work_orders
SET product_owner_verification_status = CASE
  WHEN po_testing_status = 'completed' THEN 'passed'
  WHEN po_testing_status = 'in_progress' THEN 'pending'
  WHEN po_testing_status = 'failed' THEN 'failed'
  ELSE 'not_run'
END
WHERE po_testing_status IS NOT NULL
  AND product_owner_verification_status = 'not_run';

-- ─── 8. ATD knowledge sync ──────────────────────────────────────────────────────

INSERT INTO audit_trail (event_type, event_data, timestamp, category, severity, description)
SELECT
  'atd_knowledge_sync',
  jsonb_build_object(
    'ewo_ref', 'EWO-017R.5',
    'knowledge_added', jsonb_build_array(
      'What are the four constitutional verification levels?',
      'Can Product Owner Acceptance bypass verification?',
      'How is verification evidence stored?',
      'What does the Engineering Completion Report require?',
      'What is AMD-007?',
      'How does the EWO show verification progress?'
    ),
    'synced_at', now()
  ),
  now(),
  'governance',
  'info',
  'ATD knowledge sync for EWO-017R.5 constitutional verification model'
WHERE NOT EXISTS (
  SELECT 1 FROM audit_trail
  WHERE event_type = 'atd_knowledge_sync'
  AND event_data->>'ewo_ref' = 'EWO-017R.5'
);
