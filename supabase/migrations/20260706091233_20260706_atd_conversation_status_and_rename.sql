/*
# ATD Conversation Status, Rename & Completion Workflow

## Summary
Extends cc_ai_conversations with a status lifecycle and lifecycle timestamps to
support the Active / Completed conversation model in the AI Technical Director workspace.

## Changes

### Modified Table: cc_ai_conversations
- `status` (text, NOT NULL, default 'active') — lifecycle state: 'active' | 'completed'
- `completed_at` (timestamptz, nullable) — set when marked completed
- `reopened_at` (timestamptz, nullable) — set when reopened from completed → active

## Existing rows
All existing rows default to status = 'active', with NULL completed_at and reopened_at.

## Security
No RLS policy changes required — existing policies cover the new columns.
*/

ALTER TABLE cc_ai_conversations
  ADD COLUMN IF NOT EXISTS status       text        NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at  timestamptz;

-- Backfill: all existing rows are active
UPDATE cc_ai_conversations SET status = 'active' WHERE status IS NULL;

-- Index for efficient status-filtered list queries
CREATE INDEX IF NOT EXISTS idx_cc_ai_conversations_status
  ON cc_ai_conversations(status, updated_at DESC);
