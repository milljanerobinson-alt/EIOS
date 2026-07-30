-- Phase X: Audit Workspace Separation
-- Adds workspace classification (production/legacy/sandbox) and audit engine version

ALTER TABLE ecc_audits
  ADD COLUMN IF NOT EXISTS workspace          text NOT NULL DEFAULT 'production'
                                              CHECK (workspace IN ('production', 'legacy', 'sandbox')),
  ADD COLUMN IF NOT EXISTS audit_engine_version text NOT NULL DEFAULT 'Engineering Governance v1.0';

-- Backfill sandbox workspace for all existing draft audits
UPDATE ecc_audits
SET workspace = 'sandbox'
WHERE is_draft = true;

-- Create index for efficient workspace filtering
CREATE INDEX IF NOT EXISTS ecc_audits_workspace_idx ON ecc_audits (workspace);
