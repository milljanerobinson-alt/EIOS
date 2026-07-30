/*
# EWO-014.1 — Ownership Data Foundation

## Summary
Creates the foundational data model for the Engineering Ownership & Capability Promotion Standard (EOCPS-001).
This migration establishes the schema required to record, classify, and audit engineering ownership within the EIOS platform.

## New Tables

### 1. ecc_ownership_types
Reference table of ownership classifications (Platform, Project, SPC, External).
- `id` (uuid, PK)
- `key` (text, unique) — machine key e.g. "platform"
- `label` (text) — display label e.g. "Platform"
- `description` (text) — governance definition
- `sort_order` (int) — display ordering
- `is_active` (bool) — soft-disable without deletion
- `created_at`, `updated_at` (timestamptz)
Seeded with 4 canonical types on creation.

### 2. ecc_capability_classifications
Reference table of engineering capability types (Feature, Service, Dashboard, etc.).
- `id` (uuid, PK)
- `key` (text, unique) — machine key e.g. "feature"
- `label` (text) — display label
- `description` (text)
- `sort_order` (int)
- `is_active` (bool)
- `created_at`, `updated_at` (timestamptz)
Seeded with 12 canonical classifications on creation.

### 3. ecc_ownership_metadata
Ownership attribution record for any engineering object (work order, standard, capability, etc.).
- `id` (uuid, PK)
- `object_id` (uuid, NOT NULL) — ID of the governed object
- `object_type` (text, NOT NULL) — discriminator e.g. "work_order", "standard"
- `ownership_type` (text, FK → ecc_ownership_types.key)
- `classification_type` (text, FK → ecc_capability_classifications.key)
- `current_project_id` (uuid, nullable, FK → ecc_projects.id)
- `original_project_id` (uuid, nullable, FK → ecc_projects.id)
- `created_by_ecr` (uuid, nullable) — ECR that authorised original assignment
- `ownership_confidence` (int, 0–100) — confidence scoring
- `ownership_status` (text) — active / under_review / deprecated / retired
- `notes` (text)
- `deleted_at` (timestamptz) — soft delete
- `created_at`, `updated_at` (timestamptz)

### 4. ecc_ownership_lineage
Append-only audit ledger. Every governance event is written once and never modified.
- `id` (uuid, PK)
- `ownership_metadata_id` (uuid, nullable, FK → ecc_ownership_metadata.id)
- `object_id` (uuid, NOT NULL)
- `object_type` (text, NOT NULL)
- `event_type` (text) — created / ownership_changed / capability_promoted / capability_retired / ownership_restored / deviation_granted / deviation_expired
- `from_ownership_type` (text, nullable, FK → ecc_ownership_types.key)
- `to_ownership_type` (text, NOT NULL, FK → ecc_ownership_types.key)
- `from_owner_id` (uuid, nullable)
- `to_owner_id` (uuid, nullable)
- `actor` (text) — who performed the event
- `reason` (text) — governance rationale
- `evidence` (jsonb) — supporting documentation
- `ecr_ref` (text) — ECR reference number if applicable
- `effective_date` (date, DEFAULT CURRENT_DATE)
- `created_at` (timestamptz, DEFAULT now()) — immutable; no updated_at

### 5. ecc_shared_platform_capabilities
Registry of capabilities promoted from Project to Platform under EOCPS-001.
- `id` (uuid, PK)
- `spc_ref` (text, unique) — e.g. "SPC-001"
- `name` (text, NOT NULL)
- `summary` (text)
- `classification_type` (text, FK → ecc_capability_classifications.key)
- `status` (text) — active / deprecated / retired
- `version` (text) — semver string
- `original_project_id` (uuid, nullable, FK → ecc_projects.id)
- `promoted_from_ecr` (text) — ECR reference that authorised promotion
- `promoted_at` (timestamptz)
- `deleted_at` (timestamptz) — soft delete
- `created_at`, `updated_at` (timestamptz)

## Security
- RLS enabled on all 5 tables.
- Single-tenant workspace (no sign-in required) — all policies use `TO anon, authenticated` with `USING (true)`.
- Lineage table has no UPDATE or DELETE policies — append-only by policy enforcement.

## Important Notes
1. EOCPS-001 constitutional model: ownership is a governance decision, not an automatic assignment.
2. ecc_ownership_lineage is intentionally append-only — no UPDATE/DELETE policies are created.
3. ecc_ownership_metadata uses soft-delete (deleted_at) — rows are never hard-deleted.
4. ecc_shared_platform_capabilities requires a future ECR workflow (EWO-014.x) before use in production.
5. Foreign keys to ecc_projects.id are nullable — not all objects are project-scoped.
6. ownership_confidence (0–100) is advisory only; it does not gate any automatic transitions.
*/

-- ============================================================
-- TABLE 1: ecc_ownership_types (reference, seeded)
-- ============================================================
CREATE TABLE IF NOT EXISTS ecc_ownership_types (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        UNIQUE NOT NULL,
  label       text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_ownership_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecc_ownership_types" ON ecc_ownership_types;
CREATE POLICY "anon_select_ecc_ownership_types" ON ecc_ownership_types
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ecc_ownership_types" ON ecc_ownership_types;
CREATE POLICY "anon_insert_ecc_ownership_types" ON ecc_ownership_types
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ecc_ownership_types" ON ecc_ownership_types;
CREATE POLICY "anon_update_ecc_ownership_types" ON ecc_ownership_types
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ecc_ownership_types" ON ecc_ownership_types;
CREATE POLICY "anon_delete_ecc_ownership_types" ON ecc_ownership_types
  FOR DELETE TO anon, authenticated USING (true);

-- Seed ownership types (idempotent)
INSERT INTO ecc_ownership_types (key, label, description, sort_order) VALUES
  ('platform',  'Platform',                    'Governed and maintained by the Platform Engineering team. Available for inheritance by all Projects.', 1),
  ('project',   'Project',                     'Owned and maintained by a specific Project team. Scoped to that project unless promoted.', 2),
  ('spc',       'Shared Platform Capability',  'Capability promoted from Project to Platform via a governed ECR process. Carries inheritance rights.', 3),
  ('external',  'External',                    'Owned by a third party or external dependency. Not subject to internal governance transitions.', 4)
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- TABLE 2: ecc_capability_classifications (reference, seeded)
-- ============================================================
CREATE TABLE IF NOT EXISTS ecc_capability_classifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        UNIQUE NOT NULL,
  label       text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_capability_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecc_capability_classifications" ON ecc_capability_classifications;
CREATE POLICY "anon_select_ecc_capability_classifications" ON ecc_capability_classifications
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ecc_capability_classifications" ON ecc_capability_classifications;
CREATE POLICY "anon_insert_ecc_capability_classifications" ON ecc_capability_classifications
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ecc_capability_classifications" ON ecc_capability_classifications;
CREATE POLICY "anon_update_ecc_capability_classifications" ON ecc_capability_classifications
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ecc_capability_classifications" ON ecc_capability_classifications;
CREATE POLICY "anon_delete_ecc_capability_classifications" ON ecc_capability_classifications
  FOR DELETE TO anon, authenticated USING (true);

-- Seed capability classifications (idempotent)
INSERT INTO ecc_capability_classifications (key, label, description, sort_order) VALUES
  ('feature',         'Feature',         'User-facing product feature delivered as part of a sprint or project.', 1),
  ('service',         'Service',         'Backend or platform service providing discrete functionality.', 2),
  ('dashboard',       'Dashboard',       'Monitoring, analytics, or reporting view.', 3),
  ('workflow',        'Workflow',        'Structured process or automation sequence.', 4),
  ('documentation',   'Documentation',   'Engineering documentation, guides, or reference material.', 5),
  ('architecture',    'Architecture',    'Structural design, patterns, or system topology.', 6),
  ('integration',     'Integration',     'Connector, adapter, or third-party integration.', 7),
  ('infrastructure',  'Infrastructure',  'Infrastructure-as-code, environment configuration, or deployment tooling.', 8),
  ('ai_component',    'AI Component',    'Machine learning model, AI agent, or AI-assisted capability.', 9),
  ('data_model',      'Data Model',      'Database schema, entity design, or data architecture.', 10),
  ('standard',        'Standard',        'Engineering standard, policy, or constitutional definition.', 11),
  ('other',           'Other',           'Classification not covered by the above categories.', 12)
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- TABLE 3: ecc_ownership_metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS ecc_ownership_metadata (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id             uuid        NOT NULL,
  object_type           text        NOT NULL,
  ownership_type        text        REFERENCES ecc_ownership_types(key) ON UPDATE CASCADE,
  classification_type   text        REFERENCES ecc_capability_classifications(key) ON UPDATE CASCADE,
  current_project_id    uuid        REFERENCES ecc_projects(id) ON DELETE SET NULL,
  original_project_id   uuid        REFERENCES ecc_projects(id) ON DELETE SET NULL,
  created_by_ecr        uuid,
  ownership_confidence  int         CHECK (ownership_confidence >= 0 AND ownership_confidence <= 100),
  ownership_status      text        NOT NULL DEFAULT 'active'
                                    CHECK (ownership_status IN ('active', 'under_review', 'deprecated', 'retired')),
  notes                 text        NOT NULL DEFAULT '',
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_ownership_metadata_object
  ON ecc_ownership_metadata (object_id, object_type);
CREATE INDEX IF NOT EXISTS idx_ecc_ownership_metadata_ownership_type
  ON ecc_ownership_metadata (ownership_type);
CREATE INDEX IF NOT EXISTS idx_ecc_ownership_metadata_status
  ON ecc_ownership_metadata (ownership_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ecc_ownership_metadata_project
  ON ecc_ownership_metadata (current_project_id) WHERE current_project_id IS NOT NULL;

ALTER TABLE ecc_ownership_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecc_ownership_metadata" ON ecc_ownership_metadata;
CREATE POLICY "anon_select_ecc_ownership_metadata" ON ecc_ownership_metadata
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ecc_ownership_metadata" ON ecc_ownership_metadata;
CREATE POLICY "anon_insert_ecc_ownership_metadata" ON ecc_ownership_metadata
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ecc_ownership_metadata" ON ecc_ownership_metadata;
CREATE POLICY "anon_update_ecc_ownership_metadata" ON ecc_ownership_metadata
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ecc_ownership_metadata" ON ecc_ownership_metadata;
CREATE POLICY "anon_delete_ecc_ownership_metadata" ON ecc_ownership_metadata
  FOR DELETE TO anon, authenticated USING (true);


-- ============================================================
-- TABLE 4: ecc_ownership_lineage (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS ecc_ownership_lineage (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_metadata_id uuid        REFERENCES ecc_ownership_metadata(id) ON DELETE SET NULL,
  object_id             uuid        NOT NULL,
  object_type           text        NOT NULL,
  event_type            text        NOT NULL
                                    CHECK (event_type IN (
                                      'created',
                                      'ownership_changed',
                                      'capability_promoted',
                                      'capability_retired',
                                      'ownership_restored',
                                      'deviation_granted',
                                      'deviation_expired'
                                    )),
  from_ownership_type   text        REFERENCES ecc_ownership_types(key) ON UPDATE CASCADE,
  to_ownership_type     text        NOT NULL REFERENCES ecc_ownership_types(key) ON UPDATE CASCADE,
  from_owner_id         uuid,
  to_owner_id           uuid,
  actor                 text        NOT NULL DEFAULT 'system',
  reason                text        NOT NULL DEFAULT '',
  evidence              jsonb       NOT NULL DEFAULT '{}',
  ecr_ref               text,
  effective_date        date        NOT NULL DEFAULT CURRENT_DATE,
  created_at            timestamptz NOT NULL DEFAULT now()
  -- No updated_at: this table is append-only
);

CREATE INDEX IF NOT EXISTS idx_ecc_ownership_lineage_object
  ON ecc_ownership_lineage (object_id, object_type);
CREATE INDEX IF NOT EXISTS idx_ecc_ownership_lineage_metadata
  ON ecc_ownership_lineage (ownership_metadata_id) WHERE ownership_metadata_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ecc_ownership_lineage_event_type
  ON ecc_ownership_lineage (event_type);
CREATE INDEX IF NOT EXISTS idx_ecc_ownership_lineage_effective_date
  ON ecc_ownership_lineage (effective_date DESC);

ALTER TABLE ecc_ownership_lineage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecc_ownership_lineage" ON ecc_ownership_lineage;
CREATE POLICY "anon_select_ecc_ownership_lineage" ON ecc_ownership_lineage
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ecc_ownership_lineage" ON ecc_ownership_lineage;
CREATE POLICY "anon_insert_ecc_ownership_lineage" ON ecc_ownership_lineage
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Intentionally NO UPDATE or DELETE policies: append-only by policy enforcement.


-- ============================================================
-- TABLE 5: ecc_shared_platform_capabilities
-- ============================================================
CREATE TABLE IF NOT EXISTS ecc_shared_platform_capabilities (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  spc_ref             text        UNIQUE NOT NULL,
  name                text        NOT NULL,
  summary             text        NOT NULL DEFAULT '',
  classification_type text        REFERENCES ecc_capability_classifications(key) ON UPDATE CASCADE,
  status              text        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'deprecated', 'retired')),
  version             text        NOT NULL DEFAULT '1.0.0',
  original_project_id uuid        REFERENCES ecc_projects(id) ON DELETE SET NULL,
  promoted_from_ecr   text,
  promoted_at         timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_spc_status
  ON ecc_shared_platform_capabilities (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ecc_spc_classification
  ON ecc_shared_platform_capabilities (classification_type);

ALTER TABLE ecc_shared_platform_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecc_spc" ON ecc_shared_platform_capabilities;
CREATE POLICY "anon_select_ecc_spc" ON ecc_shared_platform_capabilities
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ecc_spc" ON ecc_shared_platform_capabilities;
CREATE POLICY "anon_insert_ecc_spc" ON ecc_shared_platform_capabilities
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ecc_spc" ON ecc_shared_platform_capabilities;
CREATE POLICY "anon_update_ecc_spc" ON ecc_shared_platform_capabilities
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ecc_spc" ON ecc_shared_platform_capabilities;
CREATE POLICY "anon_delete_ecc_spc" ON ecc_shared_platform_capabilities
  FOR DELETE TO anon, authenticated USING (true);
