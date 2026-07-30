/*
# EWO-014.17: Historical Engineering Recovery Engine

## Overview
Builds the schema for the Historical Engineering Recovery Engine. The engine
scans all engineering repositories, groups historical artefacts by Engineering
Identity, and produces Recovery Packages — draft Engineering Work Orders
reconstructed from available evidence. History must never be invented.
Unknown information must remain unknown.

## New Tables

### 1. engineering_recovery_packages
Each row is a draft recovered EWO, grouped from evidence across all
engineering sources. Includes recovery package fields, confidence assessment,
evidence summary, missing evidence, and PO review status.
- `id` (uuid, PK)
- `recovery_ref` (text, unique) — e.g. "REC-001"
- `canonical_reference` (text) — the EWO ref this recovery targets
- `title` (text)
- `executive_summary` (text)
- `engineering_objective` (text)
- `known_deliverables` (text)
- `known_verification_evidence` (text)
- `known_po_decisions` (text)
- `related_artefacts` (text)
- `historical_references` (text)
- `evidence_sources` (jsonb) — array of source descriptions
- `evidence_missing` (text)
- `recovery_notes` (text)
- `engineering_confidence` (text) — HIGH | MEDIUM | LOW | UNKNOWN
- `confidence_explanation` (text)
- `recovery_recommendation` (text)
- `po_status` (text) — pending | approved | rejected | edit | request_evidence
- `po_reviewed_by` (text)
- `po_reviewed_at` (timestamptz)
- `po_review_notes` (text)
- `imported_at` (timestamptz)
- `imported_ewo_id` (uuid) — FK to engineering_work_orders after import
- `recovered_by` (text)
- `recovered_at` (timestamptz, default now)
- `created_at` (timestamptz, default now)
- `updated_at` (timestamptz, default now)

### 2. engineering_recovery_evidence
Individual evidence items linked to a recovery package. Each evidence row
records which source it came from, the source table, the source record ref,
and a summary of what the evidence contributes.
- `id` (uuid, PK)
- `recovery_package_id` (uuid, FK to recovery packages, ON DELETE CASCADE)
- `source_table` (text)
- `source_record_ref` (text)
- `source_record_id` (text)
- `evidence_type` (text) — e.g. "completion_report", "engineering_plan", etc.
- `evidence_summary` (text)
- `is_duplicate` (boolean, default false)
- `is_superseded` (boolean, default false)
- `has_conflict` (boolean, default false)
- `conflict_notes` (text)
- `created_at` (timestamptz, default now)

### 3. engineering_recovery_audit
Audit trail for every recovery action (discovery, review, approval, rejection,
import).
- `id` (uuid, PK)
- `recovery_package_id` (uuid, FK, ON DELETE CASCADE)
- `action` (text) — discovered | reviewed | approved | rejected | edited |
  requested_evidence | imported
- `acted_by` (text)
- `acted_at` (timestamptz, default now)
- `evidence_used` (text)
- `confidence` (text)
- `reason` (text)
- `import_result` (text)
- `metadata` (jsonb)

## Indexes
- Unique on recovery_ref
- Index on canonical_reference
- Index on po_status
- Index on engineering_confidence
- Index on recovery_evidence recovery_package_id
- Index on recovery_audit recovery_package_id

## RLS
- All 3 tables: RLS enabled, TO authenticated, 4 CRUD policies each
*/

-- ─── engineering_recovery_packages ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_recovery_packages (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_ref                text NOT NULL,
  canonical_reference         text NOT NULL,
  title                       text NOT NULL DEFAULT '',
  executive_summary           text,
  engineering_objective       text,
  known_deliverables           text,
  known_verification_evidence  text,
  known_po_decisions           text,
  related_artefacts            text,
  historical_references       text,
  evidence_sources             jsonb DEFAULT '[]'::jsonb,
  evidence_missing            text,
  recovery_notes              text,
  engineering_confidence      text NOT NULL DEFAULT 'UNKNOWN' CHECK (
    engineering_confidence IN ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN')
  ),
  confidence_explanation      text,
  recovery_recommendation     text,
  po_status                   text NOT NULL DEFAULT 'pending' CHECK (
    po_status IN ('pending', 'approved', 'rejected', 'edit', 'request_evidence')
  ),
  po_reviewed_by              text,
  po_reviewed_at              timestamptz,
  po_review_notes             text,
  imported_at                 timestamptz,
  imported_ewo_id             uuid REFERENCES engineering_work_orders(id) ON DELETE SET NULL,
  recovered_by                text,
  recovered_at                timestamptz DEFAULT now(),
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_packages_ref
  ON engineering_recovery_packages (recovery_ref);

CREATE INDEX IF NOT EXISTS idx_recovery_packages_canonical
  ON engineering_recovery_packages (canonical_reference);

CREATE INDEX IF NOT EXISTS idx_recovery_packages_po_status
  ON engineering_recovery_packages (po_status);

CREATE INDEX IF NOT EXISTS idx_recovery_packages_confidence
  ON engineering_recovery_packages (engineering_confidence);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_recovery_packages_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recovery_packages_updated_at ON engineering_recovery_packages;
CREATE TRIGGER trg_recovery_packages_updated_at
  BEFORE UPDATE ON engineering_recovery_packages
  FOR EACH ROW EXECUTE FUNCTION update_recovery_packages_updated_at();

-- ─── engineering_recovery_evidence ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_recovery_evidence (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_package_id   uuid NOT NULL REFERENCES engineering_recovery_packages(id) ON DELETE CASCADE,
  source_table          text NOT NULL,
  source_record_ref     text,
  source_record_id      text,
  evidence_type         text NOT NULL,
  evidence_summary      text,
  is_duplicate          boolean DEFAULT false,
  is_superseded         boolean DEFAULT false,
  has_conflict          boolean DEFAULT false,
  conflict_notes        text,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_evidence_pkg
  ON engineering_recovery_evidence (recovery_package_id);

CREATE INDEX IF NOT EXISTS idx_recovery_evidence_type
  ON engineering_recovery_evidence (evidence_type);

-- ─── engineering_recovery_audit ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_recovery_audit (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_package_id   uuid NOT NULL REFERENCES engineering_recovery_packages(id) ON DELETE CASCADE,
  action                text NOT NULL CHECK (
    action IN ('discovered', 'reviewed', 'approved', 'rejected', 'edited',
               'requested_evidence', 'imported')
  ),
  acted_by              text NOT NULL,
  acted_at              timestamptz DEFAULT now(),
  evidence_used         text,
  confidence            text,
  reason                text,
  import_result         text,
  metadata              jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recovery_audit_pkg
  ON engineering_recovery_audit (recovery_package_id);

CREATE INDEX IF NOT EXISTS idx_recovery_audit_acted_at
  ON engineering_recovery_audit (acted_at DESC);

-- ─── RLS: engineering_recovery_packages ──────────────────────────────────────

ALTER TABLE engineering_recovery_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_recovery_packages" ON engineering_recovery_packages;
CREATE POLICY "select_recovery_packages" ON engineering_recovery_packages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_recovery_packages" ON engineering_recovery_packages;
CREATE POLICY "insert_recovery_packages" ON engineering_recovery_packages FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_recovery_packages" ON engineering_recovery_packages;
CREATE POLICY "update_recovery_packages" ON engineering_recovery_packages FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_recovery_packages" ON engineering_recovery_packages;
CREATE POLICY "delete_recovery_packages" ON engineering_recovery_packages FOR DELETE
  TO authenticated USING (true);

-- ─── RLS: engineering_recovery_evidence ───────────────────────────────────────

ALTER TABLE engineering_recovery_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_recovery_evidence" ON engineering_recovery_evidence;
CREATE POLICY "select_recovery_evidence" ON engineering_recovery_evidence FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_recovery_evidence" ON engineering_recovery_evidence;
CREATE POLICY "insert_recovery_evidence" ON engineering_recovery_evidence FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_recovery_evidence" ON engineering_recovery_evidence;
CREATE POLICY "update_recovery_evidence" ON engineering_recovery_evidence FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_recovery_evidence" ON engineering_recovery_evidence;
CREATE POLICY "delete_recovery_evidence" ON engineering_recovery_evidence FOR DELETE
  TO authenticated USING (true);

-- ─── RLS: engineering_recovery_audit ──────────────────────────────────────────

ALTER TABLE engineering_recovery_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_recovery_audit" ON engineering_recovery_audit;
CREATE POLICY "select_recovery_audit" ON engineering_recovery_audit FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_recovery_audit" ON engineering_recovery_audit;
CREATE POLICY "insert_recovery_audit" ON engineering_recovery_audit FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_recovery_audit" ON engineering_recovery_audit;
CREATE POLICY "update_recovery_audit" ON engineering_recovery_audit FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_recovery_audit" ON engineering_recovery_audit;
CREATE POLICY "delete_recovery_audit" ON engineering_recovery_audit FOR DELETE
  TO authenticated USING (true);
