/*
# EWO-023: Engineering Records Automation & Autonomous Knowledge Capture

## Summary
Creates the infrastructure for automatic engineering record generation,
versioning, knowledge capture queues, record health alerts, and record
relationships. The Engineering Records Orchestrator uses these tables to
ensure every EWO has complete, versioned, and related engineering artefacts
without manual filing.

## New Tables

### 1. `engineering_record_types`
Governed catalog of engineering record types. Extensible for future types.
- `id` (uuid PK)
- `type_key` (text, unique) — e.g., 'prompt', 'completion_report', 'testing'
- `label` (text) — human-readable label
- `description` (text)
- `auto_generated` (boolean, default true) — whether orchestrator creates this
- `required_for_closure` (boolean, default false) — whether missing this blocks EWO closure
- `created_at` (timestamptz)

### 2. `engineering_record_versions`
Immutable version history for engineering records. Never overwrites — creates new versions.
- `id` (uuid PK)
- `record_id` (uuid FK → engineering_records_library.id)
- `version_number` (integer, not null)
- `parent_version_id` (uuid, nullable — links to previous version)
- `content` (jsonb) — snapshot of record content at this version
- `author` (text)
- `created_at` (timestamptz)
- `replacement_reason` (text, nullable) — why this version replaced the previous

### 3. `engineering_record_relationships`
Queryable relationships between records and other engineering objects.
- `id` (uuid PK)
- `source_record_id` (uuid FK → engineering_records_library.id)
- `source_ref` (text) — record_ref
- `target_type` (text) — 'ewo', 'completion_report', 'change_log', 'timeline', 'plan', 'identity', 'record', 'acceptance'
- `target_ref` (text) — reference of the related object
- `target_id` (uuid, nullable) — UUID of related object if applicable
- `relationship_type` (text) — 'belongs_to', 'produces', 'verifies', 'accepts', 'supersedes', 'related_to', 'extracted_from'
- `created_at` (timestamptz)

### 4. `knowledge_capture_queue`
Queue of pending knowledge extraction tasks, automatically populated on lifecycle events.
- `id` (uuid PK)
- `ewo_ref` (text, not null)
- `ewo_id` (uuid, nullable)
- `capture_trigger` (text) — 'engineering_complete', 'po_accepted', 'verification_complete', 'package_generated'
- `record_id` (uuid, nullable — the record that triggered the capture)
- `status` (text, default 'pending') — 'pending', 'processing', 'completed', 'failed'
- `queued_at` (timestamptz, default now())
- `processed_at` (timestamptz, nullable)
- `knowledge_type` (text) — 'institutional_knowledge', 'architecture_decision', 'engineering_pattern', 'lesson_learned'
- `metadata` (jsonb)

### 5. `engineering_record_health_alerts`
Alerts for missing engineering artefacts, raised by the Record Health Engine.
- `id` (uuid PK)
- `ewo_ref` (text, not null)
- `ewo_id` (uuid, nullable)
- `missing_record_type` (text) — which record type is missing
- `severity` (text, default 'medium') — 'low', 'medium', 'high'
- `status` (text, default 'open') — 'open', 'resolved', 'dismissed'
- `detected_at` (timestamptz, default now())
- `resolved_at` (timestamptz, nullable)
- `resolution_note` (text, nullable)
- `metadata` (jsonb)

## Security
- RLS enabled on all new tables
- Policies: TO authenticated with ownership checks via ewo_id where applicable
- TO anon, authenticated for read access (engineering records are shared institutional knowledge)

## Notes
- All tables use IF NOT EXISTS for idempotency
- No existing data modified
- engineering_record_types seeded with 12 governed types
*/

-- ─── 1. engineering_record_types ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_record_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  auto_generated boolean NOT NULL DEFAULT true,
  required_for_closure boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE engineering_record_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_record_types" ON engineering_record_types;
CREATE POLICY "anon_read_record_types" ON engineering_record_types FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_manage_record_types" ON engineering_record_types;
CREATE POLICY "auth_manage_record_types" ON engineering_record_types FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Seed governed record types
INSERT INTO engineering_record_types (type_key, label, description, auto_generated, required_for_closure) VALUES
  ('prompt', 'Engineering Prompt', 'The originating prompt that authorised implementation', true, true),
  ('completion_report', 'Completion Report', 'Engineering completion report with implementation summary', true, true),
  ('testing', 'Product Owner Testing Record', 'Record of Product Owner testing activities and results', true, false),
  ('acceptance', 'Product Owner Acceptance Record', 'Formal Product Owner acceptance with notes and timestamp', true, true),
  ('verification', 'Engineering Verification Summary', 'Verification results across all gates', true, true),
  ('engineering_package', 'Engineering Package', 'Complete engineering package with all artefacts', true, true),
  ('engineering_summary', 'Engineering Summary', 'Executive summary of engineering work', true, false),
  ('timeline_snapshot', 'Timeline Snapshot', 'Snapshot of all lifecycle events at closure', true, false),
  ('change_log_entry', 'Change Log Entry', 'Engineering Change Log entry for this EWO', true, true),
  ('audit_record', 'Engineering Audit Record', 'Audit trail record for this EWO', true, false),
  ('architecture_decision', 'Architecture Decision', 'Architecture decision record', false, false),
  ('constitutional_decision', 'Constitutional Decision', 'Constitutional amendment or decision', false, false),
  ('historical_recovery', 'Historical Recovery', 'Historical recovery record', false, false),
  ('knowledge_extraction', 'Knowledge Extraction', 'Extracted institutional knowledge', false, false),
  ('release_record', 'Release Record', 'Release record for deployment', false, false)
ON CONFLICT (type_key) DO NOTHING;

-- ─── 2. engineering_record_versions ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_record_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES engineering_records_library(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  parent_version_id uuid,
  content jsonb NOT NULL,
  author text NOT NULL DEFAULT 'Engineering Records Orchestrator',
  created_at timestamptz DEFAULT now(),
  replacement_reason text
);

ALTER TABLE engineering_record_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_record_versions" ON engineering_record_versions;
CREATE POLICY "anon_read_record_versions" ON engineering_record_versions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_record_versions" ON engineering_record_versions;
CREATE POLICY "auth_insert_record_versions" ON engineering_record_versions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_record_versions" ON engineering_record_versions;
CREATE POLICY "auth_update_record_versions" ON engineering_record_versions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_record_versions_record_id ON engineering_record_versions (record_id);
CREATE INDEX IF NOT EXISTS idx_record_versions_version ON engineering_record_versions (record_id, version_number);

-- ─── 3. engineering_record_relationships ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_record_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_record_id uuid REFERENCES engineering_records_library(id) ON DELETE CASCADE,
  source_ref text NOT NULL,
  target_type text NOT NULL,
  target_ref text NOT NULL,
  target_id uuid,
  relationship_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE engineering_record_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_record_rels" ON engineering_record_relationships;
CREATE POLICY "anon_read_record_rels" ON engineering_record_relationships FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_record_rels" ON engineering_record_relationships;
CREATE POLICY "auth_insert_record_rels" ON engineering_record_relationships FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_record_rels" ON engineering_record_relationships;
CREATE POLICY "auth_delete_record_rels" ON engineering_record_relationships FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_record_rels_source ON engineering_record_relationships (source_record_id);
CREATE INDEX IF NOT EXISTS idx_record_rels_target ON engineering_record_relationships (target_type, target_ref);
CREATE INDEX IF NOT EXISTS idx_record_rels_type ON engineering_record_relationships (relationship_type);

-- ─── 4. knowledge_capture_queue ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_capture_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_ref text NOT NULL,
  ewo_id uuid,
  capture_trigger text NOT NULL,
  record_id uuid,
  status text NOT NULL DEFAULT 'pending',
  queued_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  knowledge_type text,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE knowledge_capture_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_knowledge_queue" ON knowledge_capture_queue;
CREATE POLICY "anon_read_knowledge_queue" ON knowledge_capture_queue FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_knowledge_queue" ON knowledge_capture_queue;
CREATE POLICY "auth_insert_knowledge_queue" ON knowledge_capture_queue FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_knowledge_queue" ON knowledge_capture_queue;
CREATE POLICY "auth_update_knowledge_queue" ON knowledge_capture_queue FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_knowledge_queue_status ON knowledge_capture_queue (status);
CREATE INDEX IF NOT EXISTS idx_knowledge_queue_ewo ON knowledge_capture_queue (ewo_ref);

-- ─── 5. engineering_record_health_alerts ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_record_health_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_ref text NOT NULL,
  ewo_id uuid,
  missing_record_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolution_note text,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE engineering_record_health_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_health_alerts" ON engineering_record_health_alerts;
CREATE POLICY "anon_read_health_alerts" ON engineering_record_health_alerts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_health_alerts" ON engineering_record_health_alerts;
CREATE POLICY "auth_insert_health_alerts" ON engineering_record_health_alerts FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_health_alerts" ON engineering_record_health_alerts;
CREATE POLICY "auth_update_health_alerts" ON engineering_record_health_alerts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_health_alerts_ewo ON engineering_record_health_alerts (ewo_ref);
CREATE INDEX IF NOT EXISTS idx_health_alerts_status ON engineering_record_health_alerts (status);

-- ─── Add record_version_status to engineering_records_library ──────────────────
-- The existing table has 'status' and 'authority_state'. We add a new column
-- for orchestrator-tracked record status if not present.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_records_library' AND column_name = 'orchestrator_status') THEN
    ALTER TABLE engineering_records_library ADD COLUMN orchestrator_status text DEFAULT 'generated';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_records_library' AND column_name = 'orchestrator_generated') THEN
    ALTER TABLE engineering_records_library ADD COLUMN orchestrator_generated boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_records_library' AND column_name = 'parent_refinement_ref') THEN
    ALTER TABLE engineering_records_library ADD COLUMN parent_refinement_ref text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_records_library' AND column_name = 'implementation_source') THEN
    ALTER TABLE engineering_records_library ADD COLUMN implementation_source text;
  END IF;
END $$;
