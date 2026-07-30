/*
# Engineering Intelligence Graph (EIG) — Core Schema

## Summary
Establishes the three-table foundation of the Engineering Intelligence Graph subsystem.
The EIG stores all engineering artefacts as connected graph entities and tracks
directed relationships between them. It also records Impact Analysis reports generated
when Engineering Reviews or EWOs are created.

## New Tables

### eig_entities
The node registry for the graph. Every engineering artefact is stored here regardless of type.
- id (uuid, PK)
- entity_type (text) — mission | ewo | engineering_review | specification | platform_module |
  ui_page | component | database_table | api_endpoint | release | audit | benchmark |
  test_plan | risk | recommendation | technical_debt | roadmap_item | (extensible)
- entity_ref (text) — human-readable reference e.g. EWO-019, RC-003
- name (text) — display name
- description (text) — optional narrative
- status (text) — active | planned | deprecated | archived
- version (text) — optional version string
- properties (jsonb) — extensible attributes per entity type
- tags (text[]) — searchable tags
- linked_record_id (uuid) — optional foreign key to another table's row
- linked_record_type (text) — which table linked_record_id points to
- created_at, updated_at (timestamptz)

### eig_relationships
The edge registry for the graph. Each row represents a directed relationship from one entity to another.
- id (uuid, PK)
- from_entity_id (uuid, FK → eig_entities.id, CASCADE)
- to_entity_id (uuid, FK → eig_entities.id, CASCADE)
- relationship_type (text) — depends_on | implements | extends | replaces | uses |
  owned_by | validated_by | covered_by | tests | produces | consumes | related_to |
  blocks | supersedes | introduced_in_release | deprecated_by | referenced_by |
  supports | impacts | (extensible)
- strength (numeric 0–1) — relationship weight for graph scoring
- description (text) — optional narrative
- properties (jsonb) — extensible attributes
- is_automatic (boolean) — true if machine-generated
- created_at (timestamptz)
- UNIQUE(from_entity_id, to_entity_id, relationship_type) — no duplicate edges

### eig_impact_analyses
Structured impact analysis reports linked to a trigger entity (EWO, Engineering Review, etc.)
- id (uuid, PK)
- trigger_entity_id (uuid, FK → eig_entities.id, nullable)
- trigger_ref (text) — e.g. EWO-019
- trigger_type (text) — what kind of artefact triggered the analysis
- analysis_status (text) — pending | generating | complete | failed
- summary (text)
- affected_systems, affected_components, dependency_changes, risks (jsonb arrays)
- complexity_score (numeric) — 1–10
- effort_estimate (text)
- implementation_order (jsonb) — ordered list of implementation steps
- testing_requirements (jsonb) — derived test requirements
- release_implications, governance_implications (text)
- confidence_score (numeric 0–1)
- supporting_evidence (jsonb)
- raw_analysis (jsonb) — full AI response if applicable
- generated_at (timestamptz)
- created_at (timestamptz)

## Security
- RLS enabled on all three tables.
- All authenticated users have full CRUD (ECC is an internal engineering tool, no row-level ownership).
- No anon access (requires authenticated session).

## Indexes
- eig_entities: entity_type, status, entity_ref
- eig_relationships: from_entity_id, to_entity_id, relationship_type
- eig_impact_analyses: trigger_entity_id, trigger_ref, analysis_status
*/

-- ─── eig_entities ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eig_entities (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT        NOT NULL,
  entity_ref        TEXT,
  name              TEXT        NOT NULL,
  description       TEXT,
  status            TEXT        NOT NULL DEFAULT 'active',
  version           TEXT,
  properties        JSONB       NOT NULL DEFAULT '{}',
  tags              TEXT[]      NOT NULL DEFAULT '{}',
  linked_record_id  UUID,
  linked_record_type TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eig_entities_type       ON eig_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_eig_entities_status     ON eig_entities(status);
CREATE INDEX IF NOT EXISTS idx_eig_entities_entity_ref ON eig_entities(entity_ref);

ALTER TABLE eig_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eig_entities_select" ON eig_entities;
DROP POLICY IF EXISTS "eig_entities_insert" ON eig_entities;
DROP POLICY IF EXISTS "eig_entities_update" ON eig_entities;
DROP POLICY IF EXISTS "eig_entities_delete" ON eig_entities;

CREATE POLICY "eig_entities_select" ON eig_entities FOR SELECT TO authenticated USING (true);
CREATE POLICY "eig_entities_insert" ON eig_entities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eig_entities_update" ON eig_entities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eig_entities_delete" ON eig_entities FOR DELETE TO authenticated USING (true);

-- ─── eig_relationships ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eig_relationships (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id   UUID        NOT NULL REFERENCES eig_entities(id) ON DELETE CASCADE,
  to_entity_id     UUID        NOT NULL REFERENCES eig_entities(id) ON DELETE CASCADE,
  relationship_type TEXT       NOT NULL,
  strength         NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  description      TEXT,
  properties       JSONB       NOT NULL DEFAULT '{}',
  is_automatic     BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(from_entity_id, to_entity_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_eig_rel_from   ON eig_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_eig_rel_to     ON eig_relationships(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_eig_rel_type   ON eig_relationships(relationship_type);

ALTER TABLE eig_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eig_rel_select" ON eig_relationships;
DROP POLICY IF EXISTS "eig_rel_insert" ON eig_relationships;
DROP POLICY IF EXISTS "eig_rel_update" ON eig_relationships;
DROP POLICY IF EXISTS "eig_rel_delete" ON eig_relationships;

CREATE POLICY "eig_rel_select" ON eig_relationships FOR SELECT TO authenticated USING (true);
CREATE POLICY "eig_rel_insert" ON eig_relationships FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eig_rel_update" ON eig_relationships FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eig_rel_delete" ON eig_relationships FOR DELETE TO authenticated USING (true);

-- ─── eig_impact_analyses ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eig_impact_analyses (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_entity_id     UUID        REFERENCES eig_entities(id) ON DELETE SET NULL,
  trigger_ref           TEXT,
  trigger_type          TEXT        NOT NULL,
  analysis_status       TEXT        NOT NULL DEFAULT 'pending',
  summary               TEXT,
  affected_systems      JSONB       NOT NULL DEFAULT '[]',
  affected_components   JSONB       NOT NULL DEFAULT '[]',
  dependency_changes    JSONB       NOT NULL DEFAULT '[]',
  risks                 JSONB       NOT NULL DEFAULT '[]',
  complexity_score      NUMERIC(4,1),
  effort_estimate       TEXT,
  implementation_order  JSONB       NOT NULL DEFAULT '[]',
  testing_requirements  JSONB       NOT NULL DEFAULT '[]',
  release_implications  TEXT,
  governance_implications TEXT,
  confidence_score      NUMERIC(3,2),
  supporting_evidence   JSONB       NOT NULL DEFAULT '[]',
  raw_analysis          JSONB,
  generated_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eig_impact_trigger  ON eig_impact_analyses(trigger_entity_id);
CREATE INDEX IF NOT EXISTS idx_eig_impact_ref      ON eig_impact_analyses(trigger_ref);
CREATE INDEX IF NOT EXISTS idx_eig_impact_status   ON eig_impact_analyses(analysis_status);

ALTER TABLE eig_impact_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eig_impact_select" ON eig_impact_analyses;
DROP POLICY IF EXISTS "eig_impact_insert" ON eig_impact_analyses;
DROP POLICY IF EXISTS "eig_impact_update" ON eig_impact_analyses;
DROP POLICY IF EXISTS "eig_impact_delete" ON eig_impact_analyses;

CREATE POLICY "eig_impact_select" ON eig_impact_analyses FOR SELECT TO authenticated USING (true);
CREATE POLICY "eig_impact_insert" ON eig_impact_analyses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eig_impact_update" ON eig_impact_analyses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eig_impact_delete" ON eig_impact_analyses FOR DELETE TO authenticated USING (true);
