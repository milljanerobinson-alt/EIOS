-- Reference Audit capability
-- Adds reference status fields to ecc_audits.
-- One reference per domain enforced at application layer (allows atomic swap).

ALTER TABLE ecc_audits
  ADD COLUMN IF NOT EXISTS is_reference         BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reference_reason     TEXT,
  ADD COLUMN IF NOT EXISTS reference_date       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reference_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS reference_version    TEXT,
  ADD COLUMN IF NOT EXISTS referenced_by_count  INTEGER      NOT NULL DEFAULT 0;

-- Partial index so queries for the active reference per domain are O(log n)
CREATE INDEX IF NOT EXISTS idx_ecc_audits_reference
  ON ecc_audits (audit_type)
  WHERE is_reference = TRUE AND is_draft = FALSE;

COMMENT ON COLUMN ecc_audits.is_reference          IS 'True if this audit is the active Reference Audit for its domain. Only one per domain.';
COMMENT ON COLUMN ecc_audits.reference_reason      IS 'Why this audit was designated as the Reference Audit.';
COMMENT ON COLUMN ecc_audits.reference_date        IS 'When reference status was granted.';
COMMENT ON COLUMN ecc_audits.reference_approved_by IS 'Name or email of the person who approved reference status.';
COMMENT ON COLUMN ecc_audits.reference_version     IS 'Optional version tag for this reference (e.g. v1.0, Phase 3 Baseline).';
COMMENT ON COLUMN ecc_audits.referenced_by_count   IS 'Counter incremented when governance tools cite this audit as their reference baseline.';
