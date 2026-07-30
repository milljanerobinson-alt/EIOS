/*
# Extend aXcelerate Contact Note Write-Back Queue

## Purpose
Extends the existing axcelerate_writeback_queue table to support a richer set of
LLN/Digital lifecycle events and improve operational visibility for administrators.

## Changes

### axcelerate_writeback_queue — new columns

| Column        | Type     | Description                                                        |
|---------------|----------|--------------------------------------------------------------------|
| contact_id    | integer  | Resolved aXcelerate contact ID, populated after first resolution   |
| note_body     | text     | The actual note text written to aXcelerate (for audit/debugging)   |
| assessment_id | uuid     | FK to assessments — for per-assessment events (optional)           |

Storing contact_id back on the queue row means the admin queue screen can show
which aXcelerate contact received the note without a separate lookup.

Storing note_body lets operators inspect exactly what was sent to aXcelerate for
each event, which is invaluable when investigating missing or incorrect contact notes.

assessment_id links a queue entry to a specific assessment (e.g. the LLN quiz or
Digital quiz) for events like lln_assessment_completed / digital_assessment_completed,
enabling idempotency keys scoped to a specific quiz rather than just the invitation.

## New supported event_type values (enforced at application layer only)

In addition to the existing event types:
  invitation_sent, assessment_completed, support_plan_generated,
  intervention_required, lln_assessment_opened, digital_assessment_opened

The following new types are now supported:
  lln_assessment_completed    — LLN quiz fully submitted by student
  digital_assessment_completed — Digital quiz fully submitted by student
  quiz_sent                   — Explicit contact note when quiz link is sent (alias for invitation_sent in new flows)
  report_found_no_resend      — Admin marks: existing completed report found, no resend required
  no_lln_required             — Admin marks: no LLN/Digital required due to existing valid result

## Indexes

Adds indexes on contact_id and assessment_id for fast lookups in the admin queue view.

## Security

No RLS policy changes required — existing policies cover the new columns automatically.
*/

-- Add contact_id: stores the resolved aXcelerate contact ID once found
ALTER TABLE axcelerate_writeback_queue
  ADD COLUMN IF NOT EXISTS contact_id INTEGER;

-- Add note_body: stores the exact note text sent to aXcelerate for audit/debugging
ALTER TABLE axcelerate_writeback_queue
  ADD COLUMN IF NOT EXISTS note_body TEXT;

-- Add assessment_id: optional FK for per-assessment events (lln/digital completed etc.)
-- Uses SET NULL on delete so deleting an assessment doesn't remove queue history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'axcelerate_writeback_queue'
      AND column_name = 'assessment_id'
  ) THEN
    ALTER TABLE axcelerate_writeback_queue
      ADD COLUMN assessment_id UUID REFERENCES assessments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for admin UI lookups by contact_id
CREATE INDEX IF NOT EXISTS idx_awq_contact_id
  ON axcelerate_writeback_queue(contact_id)
  WHERE contact_id IS NOT NULL;

-- Index for per-assessment queries
CREATE INDEX IF NOT EXISTS idx_awq_assessment_id
  ON axcelerate_writeback_queue(assessment_id)
  WHERE assessment_id IS NOT NULL;

-- Index for next_attempt_at to speed up the cron-triggered processor's pending query
CREATE INDEX IF NOT EXISTS idx_awq_next_attempt_status
  ON axcelerate_writeback_queue(status, next_attempt_at)
  WHERE status IN ('pending', 'failed');
