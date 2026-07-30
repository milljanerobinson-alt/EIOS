
-- Add array columns for linked items to ecc_decisions if they don't exist
ALTER TABLE ecc_decisions
  ADD COLUMN IF NOT EXISTS linked_backlog_items text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_qa_reports    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_releases      text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_architecture  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_ai_sessions   text[] NOT NULL DEFAULT '{}';
