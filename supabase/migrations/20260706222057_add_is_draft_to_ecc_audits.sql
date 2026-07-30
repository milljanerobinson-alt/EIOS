-- Add draft/sandbox mode to engineering audits
ALTER TABLE ecc_audits
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for quick filtering of production vs draft audits
CREATE INDEX IF NOT EXISTS idx_ecc_audits_is_draft ON ecc_audits (is_draft);

COMMENT ON COLUMN ecc_audits.is_draft IS
  'When true this audit is a sandbox/draft record. It does not receive an official AUD number, '
  'does not contribute to trend analysis or health history, and can be deleted. '
  'Draft audits can be promoted to production via the Promote action.';
