/*
# EWO-014.13 — Engineering Object Registry & Navigation Graph

## Purpose
Establish a governed Engineering Graph where every engineering object has a
permanent identity, canonical URL, lifecycle state, and explicit typed
relationships to other engineering objects. This is the foundation for
object-centric navigation (breadcrumbs, related panels, direct linking).

## New Tables

### 1. `engineering_object_registry`
A unified registry of all first-class Engineering Objects. Each row represents
one engineering object (Idea, Intent, Plan, Work Order, Validation, Completion
Report, Record, Knowledge, Constitutional Amendment, Standard) with:
- `object_ref` — permanent human-readable reference (e.g. "EWO-014.7", "ER-014.7")
- `object_type` — the type of engineering object
- `canonical_url` — permanent hash-based URL for direct navigation
- `lifecycle_state` — current state of the object
- `source_table` / `source_id` — link back to the originating table
- `parent_object_ref` — parent in the engineering lineage
- `metadata` — JSONB for extensible properties

### 2. `engineering_object_relationships`
Typed directed edges between engineering objects (the Engineering Graph).
- `from_object_ref` → `to_object_ref`
- `relationship_type` — creates, produces, archives, validates, supersedes, etc.
- Bidirectional queries supported via reverse lookups
- `is_automatic` — true for system-created relationships

## Security
- RLS enabled on both tables
- `TO anon, authenticated` — engineering objects are internal platform data
  accessible to all authenticated engineering users
- Full CRUD for anon+authenticated (engineering governance is application-enforced)

## Important Notes
1. The registry is idempotent — objects can be re-registered safely
2. Relationships are unique per (from, to, type) trio
3. The `canonical_url` is the permanent navigation target
4. `source_table` + `source_id` allow the registry to reference any table
   without hard foreign keys (loose coupling, survives table renames)
*/

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Engineering Object Registry
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS engineering_object_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_ref text NOT NULL,
  object_type text NOT NULL,
  title text NOT NULL,
  canonical_url text NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'active',
  source_table text,
  source_id uuid,
  parent_object_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one registry entry per (object_ref, object_type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_eor_object_ref_type
  ON engineering_object_registry (object_ref, object_type);

-- Index for lookups by canonical URL
CREATE INDEX IF NOT EXISTS idx_eor_canonical_url
  ON engineering_object_registry (canonical_url);

-- Index for lookups by parent
CREATE INDEX IF NOT EXISTS idx_eor_parent
  ON engineering_object_registry (parent_object_ref);

-- Index for lookups by source
CREATE INDEX IF NOT EXISTS idx_eor_source
  ON engineering_object_registry (source_table, source_id);

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_eor_type
  ON engineering_object_registry (object_type);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Engineering Object Relationships (Navigation Graph)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS engineering_object_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_object_ref text NOT NULL,
  to_object_ref text NOT NULL,
  relationship_type text NOT NULL,
  is_automatic boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: no duplicate relationships of the same type
CREATE UNIQUE INDEX IF NOT EXISTS uq_eor_rel_from_to_type
  ON engineering_object_relationships (from_object_ref, to_object_ref, relationship_type);

-- Index for forward lookups (children)
CREATE INDEX IF NOT EXISTS idx_eor_rel_from
  ON engineering_object_relationships (from_object_ref);

-- Index for reverse lookups (parents)
CREATE INDEX IF NOT EXISTS idx_eor_rel_to
  ON engineering_object_relationships (to_object_ref);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Row Level Security
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE engineering_object_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_object_relationships ENABLE ROW LEVEL SECURITY;

-- Registry: full CRUD for anon + authenticated
DROP POLICY IF EXISTS "anon_select_eor" ON engineering_object_registry;
CREATE POLICY "anon_select_eor" ON engineering_object_registry
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_eor" ON engineering_object_registry;
CREATE POLICY "anon_insert_eor" ON engineering_object_registry
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_eor" ON engineering_object_registry;
CREATE POLICY "anon_update_eor" ON engineering_object_registry
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_eor" ON engineering_object_registry;
CREATE POLICY "anon_delete_eor" ON engineering_object_registry
  FOR DELETE TO anon, authenticated USING (true);

-- Relationships: full CRUD for anon + authenticated
DROP POLICY IF EXISTS "anon_select_eorel" ON engineering_object_relationships;
CREATE POLICY "anon_select_eorel" ON engineering_object_relationships
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_eorel" ON engineering_object_relationships;
CREATE POLICY "anon_insert_eorel" ON engineering_object_relationships
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_eorel" ON engineering_object_relationships;
CREATE POLICY "anon_update_eorel" ON engineering_object_relationships
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_eorel" ON engineering_object_relationships;
CREATE POLICY "anon_delete_eorel" ON engineering_object_relationships
  FOR DELETE TO anon, authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Seed: Register existing engineering objects
-- ═══════════════════════════════════════════════════════════════════════

-- Register existing EWOs
INSERT INTO engineering_object_registry (object_ref, object_type, title, canonical_url, lifecycle_state, source_table, source_id, parent_object_ref, metadata)
SELECT
  ewo.ewo_ref,
  'engineering_work_order',
  ewo.title,
  '#/engineering/work-orders/' || lower(replace(ewo.ewo_ref, '-', '_')),
  ewo.status,
  'engineering_work_orders',
  ewo.id,
  NULL,
  jsonb_build_object('priority', ewo.priority, 'owner', ewo.owner)
FROM engineering_work_orders ewo
ON CONFLICT (object_ref, object_type) DO UPDATE SET
  title = EXCLUDED.title,
  canonical_url = EXCLUDED.canonical_url,
  lifecycle_state = EXCLUDED.lifecycle_state,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- Register existing engineering records
INSERT INTO engineering_object_registry (object_ref, object_type, title, canonical_url, lifecycle_state, source_table, source_id, parent_object_ref, metadata)
SELECT
  er.record_ref,
  'engineering_record',
  er.title,
  '#/engineering/records-library/' || lower(replace(er.record_ref, '-', '_')),
  er.status,
  'engineering_records_library',
  er.id,
  er.ewo_ref,
  jsonb_build_object('record_type', er.record_type, 'programme', er.programme)
FROM engineering_records_library er
ON CONFLICT (object_ref, object_type) DO UPDATE SET
  title = EXCLUDED.title,
  canonical_url = EXCLUDED.canonical_url,
  lifecycle_state = EXCLUDED.lifecycle_state,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- Register existing completion reports
INSERT INTO engineering_object_registry (object_ref, object_type, title, canonical_url, lifecycle_state, source_table, source_id, parent_object_ref, metadata)
SELECT
  'CR-' || cr.ewo_ref,
  'completion_report',
  cr.title,
  '#/engineering/work-orders/' || lower(replace(cr.ewo_ref, '-', '_')) || '/report',
  CASE WHEN cr.accepted_at IS NOT NULL THEN 'accepted' ELSE 'generated' END,
  'ewo_completion_reports',
  cr.id,
  cr.ewo_ref,
  jsonb_build_object('accepted', cr.accepted_at IS NOT NULL)
FROM ewo_completion_reports cr
ON CONFLICT (object_ref, object_type) DO UPDATE SET
  title = EXCLUDED.title,
  canonical_url = EXCLUDED.canonical_url,
  lifecycle_state = EXCLUDED.lifecycle_state,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Seed: Engineering relationships
-- ═══════════════════════════════════════════════════════════════════════

-- EWO → Completion Report (produces)
INSERT INTO engineering_object_relationships (from_object_ref, to_object_ref, relationship_type, is_automatic, metadata)
SELECT
  cr.ewo_ref,
  'CR-' || cr.ewo_ref,
  'produces',
  true,
  jsonb_build_object('description', 'Work Order produces Completion Report')
FROM ewo_completion_reports cr
ON CONFLICT (from_object_ref, to_object_ref, relationship_type) DO NOTHING;

-- Completion Report → Engineering Record (archives)
INSERT INTO engineering_object_relationships (from_object_ref, to_object_ref, relationship_type, is_automatic, metadata)
SELECT
  'CR-' || er.ewo_ref,
  er.record_ref,
  'archives',
  true,
  jsonb_build_object('description', 'Completion Report archives to Engineering Record')
FROM engineering_records_library er
WHERE er.ewo_ref IS NOT NULL
ON CONFLICT (from_object_ref, to_object_ref, relationship_type) DO NOTHING;

-- EWO → Engineering Record (produces, if no completion report link exists)
INSERT INTO engineering_object_relationships (from_object_ref, to_object_ref, relationship_type, is_automatic, metadata)
SELECT
  er.ewo_ref,
  er.record_ref,
  'produces',
  true,
  jsonb_build_object('description', 'Work Order produces Engineering Record')
FROM engineering_records_library er
WHERE er.ewo_ref IS NOT NULL
ON CONFLICT (from_object_ref, to_object_ref, relationship_type) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. updated_at trigger
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_eor_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eor_updated ON engineering_object_registry;
CREATE TRIGGER trg_eor_updated
  BEFORE UPDATE ON engineering_object_registry
  FOR EACH ROW EXECUTE FUNCTION update_eor_timestamp();
