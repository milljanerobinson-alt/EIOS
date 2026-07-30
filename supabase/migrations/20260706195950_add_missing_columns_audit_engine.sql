
-- Add missing columns that the generate-platform-audit edge function requires

-- ecc_backlog_items: is_blocked flag
ALTER TABLE ecc_backlog_items
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- ecc_decisions: reference number and type classification
ALTER TABLE ecc_decisions
  ADD COLUMN IF NOT EXISTS decision_ref text,
  ADD COLUMN IF NOT EXISTS decision_type text;

-- ecc_dev_phases: Engineering OS grade
ALTER TABLE ecc_dev_phases
  ADD COLUMN IF NOT EXISTS eos_grade text;
