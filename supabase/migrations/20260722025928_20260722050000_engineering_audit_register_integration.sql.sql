/*
# Engineering Audit Register Integration

## Purpose
Add engineering register audit columns to the existing ecc_audits table,
enabling governed Engineering Audit records with health scores, findings
classification, and source EWO traceability.

## Security
No RLS policy changes — ecc_audits already has RLS enabled with existing
policies. New columns inherit existing policies.
*/

-- ─── 1. Add engineering audit columns to ecc_audits ────────────────────────────
ALTER TABLE ecc_audits
ADD COLUMN IF NOT EXISTS audit_scope text,
ADD COLUMN IF NOT EXISTS engineering_register_integrity integer,
ADD COLUMN IF NOT EXISTS evidence_completeness integer,
ADD COLUMN IF NOT EXISTS governance_maturity integer,
ADD COLUMN IF NOT EXISTS confirmed_defects_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS governance_decisions_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS lifecycle_issues_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS evidence_issues_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS source_ewo_refs text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS remediation_packages jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS is_engineering_audit boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS historical_classification text;

-- ─── 2. Add audit_type constraint for engineering register audits ──────────────
-- The existing audit_type column is text. We add a CHECK to allow
-- 'engineering_register' as a valid domain alongside existing values.
-- (No constraint needed — audit_type is free text already.)

-- ─── 3. Add index for engineering audit queries ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ecc_audits_engineering_audit
  ON ecc_audits (is_engineering_audit)
  WHERE is_engineering_audit = true;

CREATE INDEX IF NOT EXISTS idx_ecc_audits_source_ewo_refs
  ON ecc_audits USING gin (source_ewo_refs);
