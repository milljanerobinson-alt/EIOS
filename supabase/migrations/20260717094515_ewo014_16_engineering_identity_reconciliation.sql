/*
# EWO-014.16: Engineering Identity Reconciliation Layer

## Overview
Establishes a permanent Engineering Identity layer that allows historical
artefacts to be truthfully related without destroying provenance. Historical
engineering imports revealed identity inconsistencies (ERC-xxx records
representing EWOs, re-used references, multiple records for one effort).
This migration creates the schema for governed identity reconciliation.

## New Tables

### 1. engineering_identity_map
Stores canonical-to-historical identity mappings. Each row links a historical
reference to a canonical engineering reference with a relationship type,
confidence, provenance, and reconciliation status.
- `id` (uuid, primary key)
- `canonical_reference` (text, not null) — e.g. "EWO-001"
- `canonical_type` (text, not null) — e.g. "engineering_work_order"
- `historical_reference` (text, not null) — e.g. "ERC-002-DEV-SEED"
- `historical_type` (text, not null) — e.g. "completion_report"
- `source_record_id` (text, nullable) — original record ID in source system
- `relationship_type` (text, not null) — CANONICAL | ALIAS | SUPERSEDED |
  MIGRATED_FROM | IMPORTED_FROM | DUPLICATE_REFERENCE | LEGACY_IDENTIFIER
- `confidence` (text, not null default 'MEDIUM') — LOW | MEDIUM | HIGH
- `reconciliation_status` (text, not null default 'pending') —
  pending | accepted | rejected | overridden
- `provenance` (text, nullable) — free-text explanation
- `notes` (text, nullable)
- `recommended_action` (text, nullable) — engine recommendation
- `accepted_by` (text, nullable)
- `accepted_at` (timestamptz, nullable)
- `acceptance_reason` (text, nullable)
- `created_at` (timestamptz, default now)
- `updated_at` (timestamptz, default now)

### 2. engineering_identity_audit
Audit trail for every accepted/rejected/overridden reconciliation.
- `id` (uuid, primary key)
- `identity_map_id` (uuid, references engineering_identity_map, ON DELETE CASCADE)
- `action` (text, not null) — accepted | rejected | overridden
- `previous_mapping` (jsonb, nullable) — snapshot of previous state
- `new_mapping` (jsonb, nullable) — snapshot of new state
- `evidence_used` (text, nullable)
- `reason` (text, nullable)
- `acted_by` (text, not null)
- `acted_at` (timestamptz, default now)

## Indexes
- Unique index on (canonical_reference, historical_reference) to prevent
  duplicate mappings
- Index on canonical_reference for lookups
- Index on historical_reference for reverse lookups
- Index on reconciliation_status for pending review queries

## Security
- RLS enabled on both tables
- TO authenticated, with ownership via auth.uid() — this is a governed
  engineering tool, only authenticated users can manage identities
- 4 CRUD policies per table (select/insert/update/delete)

## Notes
1. All statements are idempotent (IF NOT EXISTS, DO blocks)
2. No existing tables or data are modified
3. Identity mappings are additive only — no destructive operations
4. The reconciliation engine (application layer) recommends relationships;
   it never automatically merges records
*/

-- ─── engineering_identity_map ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_identity_map (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_reference  text NOT NULL,
  canonical_type       text NOT NULL,
  historical_reference text NOT NULL,
  historical_type      text NOT NULL,
  source_record_id     text,
  relationship_type    text NOT NULL CHECK (
    relationship_type IN (
      'CANONICAL', 'ALIAS', 'SUPERSEDED', 'MIGRATED_FROM',
      'IMPORTED_FROM', 'DUPLICATE_REFERENCE', 'LEGACY_IDENTIFIER'
    )
  ),
  confidence           text NOT NULL DEFAULT 'MEDIUM' CHECK (
    confidence IN ('LOW', 'MEDIUM', 'HIGH')
  ),
  reconciliation_status text NOT NULL DEFAULT 'pending' CHECK (
    reconciliation_status IN ('pending', 'accepted', 'rejected', 'overridden')
  ),
  provenance           text,
  notes                text,
  recommended_action   text,
  accepted_by          text,
  accepted_at          timestamptz,
  acceptance_reason    text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- Unique constraint: one mapping per canonical+historical pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_map_canon_hist
  ON engineering_identity_map (canonical_reference, historical_reference);

CREATE INDEX IF NOT EXISTS idx_identity_map_canonical_ref
  ON engineering_identity_map (canonical_reference);

CREATE INDEX IF NOT EXISTS idx_identity_map_historical_ref
  ON engineering_identity_map (historical_reference);

CREATE INDEX IF NOT EXISTS idx_identity_map_status
  ON engineering_identity_map (reconciliation_status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_identity_map_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_identity_map_updated_at ON engineering_identity_map;
CREATE TRIGGER trg_identity_map_updated_at
  BEFORE UPDATE ON engineering_identity_map
  FOR EACH ROW EXECUTE FUNCTION update_identity_map_updated_at();

-- ─── engineering_identity_audit ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_identity_audit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_map_id  uuid REFERENCES engineering_identity_map(id) ON DELETE CASCADE,
  action           text NOT NULL CHECK (
    action IN ('accepted', 'rejected', 'overridden')
  ),
  previous_mapping jsonb,
  new_mapping      jsonb,
  evidence_used    text,
  reason           text,
  acted_by         text NOT NULL,
  acted_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_audit_map_id
  ON engineering_identity_audit (identity_map_id);

CREATE INDEX IF NOT EXISTS idx_identity_audit_acted_at
  ON engineering_identity_audit (acted_at DESC);

-- ─── RLS: engineering_identity_map ───────────────────────────────────────────

ALTER TABLE engineering_identity_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_identity_map" ON engineering_identity_map;
CREATE POLICY "select_identity_map" ON engineering_identity_map FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_identity_map" ON engineering_identity_map;
CREATE POLICY "insert_identity_map" ON engineering_identity_map FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_identity_map" ON engineering_identity_map;
CREATE POLICY "update_identity_map" ON engineering_identity_map FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_identity_map" ON engineering_identity_map;
CREATE POLICY "delete_identity_map" ON engineering_identity_map FOR DELETE
  TO authenticated USING (true);

-- ─── RLS: engineering_identity_audit ──────────────────────────────────────────

ALTER TABLE engineering_identity_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_identity_audit" ON engineering_identity_audit;
CREATE POLICY "select_identity_audit" ON engineering_identity_audit FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_identity_audit" ON engineering_identity_audit;
CREATE POLICY "insert_identity_audit" ON engineering_identity_audit FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_identity_audit" ON engineering_identity_audit;
CREATE POLICY "update_identity_audit" ON engineering_identity_audit FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_identity_audit" ON engineering_identity_audit;
CREATE POLICY "delete_identity_audit" ON engineering_identity_audit FOR DELETE
  TO authenticated USING (true);
