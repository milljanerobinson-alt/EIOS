/*
# EWO-014.19A.7 — Engineering Work Order Integrity & Automatic Lifecycle Governance

## Purpose

Establishes permanent governance ensuring every Engineering Work Order (EWO)
exists as the canonical engineering object before implementation begins, and
that the Engineering Work Order Ledger can never silently fall out of sync.

This migration introduces:

1. **parent_ref column** on `engineering_work_orders` — stores the parent EWO
   reference (e.g. EWO-014.19A is the parent of EWO-014.19A.1) to support
   parent-child hierarchy verification and repair.

2. **engineering_integrity_audits** table — records each full ledger integrity
   audit run with summary counts and a detailed findings JSONB document.

3. **engineering_integrity_alerts** table — persistent, governed alerts raised
   when automatic repair is not possible (ambiguous evidence, conflicting
   references, etc.). The Product Owner resolves these from the dashboard.

## New Tables

### engineering_integrity_audits
- `id` (uuid PK)
- `audit_ref` (text, unique — e.g. "EIA-001")
- `run_at` (timestamptz, default now)
- `run_by` (text — actor who triggered the audit)
- `total_ewos` (int — count of EWOs in the ledger at audit time)
- `missing_ewos_count` (int)
- `duplicate_ewos_count` (int)
- `orphan_ewos_count` (int)
- `completion_reports_without_ewo_count` (int)
- `records_without_ewo_count` (int)
- `prompts_without_ewo_count` (int)
- `parent_child_issues_count` (int)
- `integrity_score` (int — 0-100, percentage of ledger integrity)
- `findings` (jsonb — detailed structured findings)
- `auto_repaired_count` (int — number of issues auto-repaired in this run)
- `alerts_raised_count` (int — number of alerts raised in this run)

### engineering_integrity_alerts
- `id` (uuid PK)
- `alert_ref` (text, unique — e.g. "EIAL-001")
- `audit_id` (uuid, FK → engineering_integrity_audits ON DELETE SET NULL)
- `alert_type` (text — missing_ewo | duplicate_ewo | orphan_ewo | orphan_completion_report | orphan_record | orphan_prompt | parent_child_issue | conflicting_reference)
- `severity` (text — info | warning | error)
- `title` (text)
- `description` (text)
- `evidence` (jsonb — structured evidence supporting the alert)
- `suggested_action` (text — e.g. "create_missing_ewo" | "resolve_duplicate" | "resolve_parent_relationship" | "merge_references" | "review_ambiguous_evidence")
- `status` (text — open | resolved | dismissed, default 'open')
- `resolved_at` (timestamptz, nullable)
- `resolved_by` (text, nullable)
- `resolution_notes` (text, nullable)
- `created_at` (timestamptz, default now)
- `updated_at` (timestamptz, default now)

## Modified Tables

### engineering_work_orders
- Added `parent_ref` (text, nullable) — stores the parent EWO's ewo_ref for
  hierarchy verification. E.g. for EWO-014.19A.1, parent_ref = 'EWO-014.19A'.
- Added `reconciled_at` (timestamptz, nullable) — timestamp when this EWO was
  auto-created or repaired by the integrity audit. Null for manually created EWOs.
- Added `reconciliation_source` (text, nullable) — how this EWO was created:
  'manual' | 'integrity_audit' | 'historical_recovery' | 'prompt_guard'.
  Defaults to 'manual' for existing rows.

## Security

- RLS enabled on both new tables.
- All authenticated users have full CRUD (internal ECC governance tool).
- No anon access (these are admin-only governance tables).

## Important Notes

1. The `parent_ref` column is additive and nullable — existing EWOs are
   unaffected. The integrity audit backfills parent_ref where evidence is
   conclusive.

2. The `reconciliation_source` column defaults to 'manual' so existing EWOs
   are treated as manually created.

3. Both new tables use `TO authenticated` policies because the ECC is an
   internal engineering governance tool requiring sign-in.

4. Indexes are created on alert_type, status, and audit_id for efficient
   dashboard queries.
*/

-- ─── Add parent_ref and reconciliation columns to engineering_work_orders ───

ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS parent_ref text,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_source text DEFAULT 'manual';

-- Index for parent-child lookups
CREATE INDEX IF NOT EXISTS idx_ewo_parent_ref ON engineering_work_orders(parent_ref);

-- ─── Create engineering_integrity_audits table ──────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_integrity_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_ref text UNIQUE NOT NULL,
  run_at timestamptz DEFAULT now(),
  run_by text,
  total_ewos integer DEFAULT 0,
  missing_ewos_count integer DEFAULT 0,
  duplicate_ewos_count integer DEFAULT 0,
  orphan_ewos_count integer DEFAULT 0,
  completion_reports_without_ewo_count integer DEFAULT 0,
  records_without_ewo_count integer DEFAULT 0,
  prompts_without_ewo_count integer DEFAULT 0,
  parent_child_issues_count integer DEFAULT 0,
  integrity_score integer DEFAULT 100,
  findings jsonb DEFAULT '{}'::jsonb,
  auto_repaired_count integer DEFAULT 0,
  alerts_raised_count integer DEFAULT 0
);

ALTER TABLE engineering_integrity_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_integrity_audits" ON engineering_integrity_audits;
CREATE POLICY "select_integrity_audits" ON engineering_integrity_audits FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_integrity_audits" ON engineering_integrity_audits;
CREATE POLICY "insert_integrity_audits" ON engineering_integrity_audits FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_integrity_audits" ON engineering_integrity_audits;
CREATE POLICY "update_integrity_audits" ON engineering_integrity_audits FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_integrity_audits" ON engineering_integrity_audits;
CREATE POLICY "delete_integrity_audits" ON engineering_integrity_audits FOR DELETE
  TO authenticated USING (true);

-- ─── Create engineering_integrity_alerts table ──────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_integrity_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_ref text UNIQUE NOT NULL,
  audit_id uuid REFERENCES engineering_integrity_audits(id) ON DELETE SET NULL,
  alert_type text NOT NULL,
  severity text DEFAULT 'warning',
  title text NOT NULL,
  description text,
  evidence jsonb DEFAULT '{}'::jsonb,
  suggested_action text,
  status text DEFAULT 'open',
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE engineering_integrity_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_integrity_alerts" ON engineering_integrity_alerts;
CREATE POLICY "select_integrity_alerts" ON engineering_integrity_alerts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_integrity_alerts" ON engineering_integrity_alerts;
CREATE POLICY "insert_integrity_alerts" ON engineering_integrity_alerts FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_integrity_alerts" ON engineering_integrity_alerts;
CREATE POLICY "update_integrity_alerts" ON engineering_integrity_alerts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_integrity_alerts" ON engineering_integrity_alerts;
CREATE POLICY "delete_integrity_alerts" ON engineering_integrity_alerts FOR DELETE
  TO authenticated USING (true);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_eial_alert_type ON engineering_integrity_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_eial_status ON engineering_integrity_alerts(status);
CREATE INDEX IF NOT EXISTS idx_eial_audit_id ON engineering_integrity_alerts(audit_id);

-- ─── Backfill parent_ref for existing EWOs where evidence is conclusive ──────
-- EWO-014.19A.x refinements have parent EWO-014.19A

UPDATE engineering_work_orders
SET parent_ref = 'EWO-014.19A'
WHERE ewo_ref LIKE 'EWO-014.19A.%'
  AND parent_ref IS NULL;
