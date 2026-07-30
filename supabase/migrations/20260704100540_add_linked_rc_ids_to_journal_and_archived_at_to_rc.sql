
-- Add linked_rc_ids to ecc_ai_journal for bidirectional RC linking
ALTER TABLE ecc_ai_journal
  ADD COLUMN IF NOT EXISTS linked_rc_ids uuid[] DEFAULT '{}';

-- Add archived_at to ecc_release_candidates for archive workflow
ALTER TABLE ecc_release_candidates
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Add owner to ecc_release_candidates
ALTER TABLE ecc_release_candidates
  ADD COLUMN IF NOT EXISTS owner text;
