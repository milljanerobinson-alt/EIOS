/*
# Create aXcelerate Write-Back Queue

## Purpose
Adds a durable, idempotent queue for all aXcelerate write-back operations. Instead of
synchronous, blocking API calls that can fail silently, every write-back event is first
logged to this queue table. A separate processor then handles the actual API calls with
retries, deduplication, and full traceability.

## 1. New Tables

### axcelerate_writeback_queue
High-level job tracking: one row per event that needs to be written to aXcelerate.
Each job may generate multiple rows in `axcelerate_sync_log` (one per API call).

| Column           | Type         | Description |
|-----------------|--------------|-------------|
| id              | uuid PK      | Unique job ID |
| invitation_id   | uuid FK      | Assessment invitation this write-back relates to |
| event_type      | text         | One of: invitation_sent, assessment_completed, support_plan_generated, intervention_required |
| status          | text         | pending → processing → success / failed / cancelled |
| idempotency_key | text UNIQUE  | Prevents duplicate write-backs for the same event (format: invId:eventType) |
| attempts        | int          | Number of processing attempts |
| last_attempted_at | timestamptz | Timestamp of most recent attempt |
| last_error      | text         | Error from last attempt |
| completed_at    | timestamptz  | When successfully processed |
| extra_data      | jsonb        | Optional context (support plan content, intervention reason, etc.) |
| created_at      | timestamptz  | Row creation time |

## 2. Modified Tables

### axcelerate_sync_log
- Added `writeback_queue_id` (uuid FK to axcelerate_writeback_queue) — links individual
  API call log rows back to the queue job that triggered them.
- Added `event_type` column — mirrors the parent job's event_type for easier filtering.

## 3. Security

### axcelerate_writeback_queue
- RLS enabled. Staff (admin/trainer) can SELECT and INSERT.
- No DELETE — jobs are permanent audit records. Use status = 'cancelled' instead.
- Service role (used by edge functions) bypasses RLS entirely.

## 4. Important Notes

1. IDEMPOTENCY: The `idempotency_key` UNIQUE constraint prevents duplicate write-backs
   for the same event. Use ON CONFLICT DO NOTHING when inserting.

2. RETRIES: Failed jobs are retried up to 3 times by the queue processor. After 3 attempts,
   status stays 'failed' and an admin can trigger a manual retry from the integration log.

3. EVENT TYPES:
   - invitation_sent: Contact search/create + enroll in course + welcome note
   - assessment_completed: Full results note + outcome record + recommendation
   - support_plan_generated: Append support plan summary note to contact
   - intervention_required: Create intervention flag note on contact

4. CANCELLATION: Setting status = 'cancelled' permanently stops a job from being retried.
*/

-- axcelerate_writeback_queue
CREATE TABLE IF NOT EXISTS axcelerate_writeback_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id     uuid NOT NULL REFERENCES assessment_invitations(id) ON DELETE CASCADE,
  event_type        text NOT NULL CHECK (event_type IN (
    'invitation_sent', 'assessment_completed', 'support_plan_generated', 'intervention_required'
  )),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'success', 'failed', 'cancelled'
  )),
  idempotency_key   text NOT NULL,
  attempts          int NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  last_error        text,
  completed_at      timestamptz,
  extra_data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz DEFAULT now(),

  CONSTRAINT ax_writeback_queue_idempotency_unique UNIQUE (idempotency_key)
);

ALTER TABLE axcelerate_writeback_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ax_writeback_status
  ON axcelerate_writeback_queue (status, created_at);

CREATE INDEX IF NOT EXISTS idx_ax_writeback_invitation
  ON axcelerate_writeback_queue (invitation_id);

DROP POLICY IF EXISTS "ax_wb_select_staff" ON axcelerate_writeback_queue;
CREATE POLICY "ax_wb_select_staff" ON axcelerate_writeback_queue FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'trainer')
    )
  );

DROP POLICY IF EXISTS "ax_wb_insert_staff" ON axcelerate_writeback_queue;
CREATE POLICY "ax_wb_insert_staff" ON axcelerate_writeback_queue FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'trainer')
    )
  );

DROP POLICY IF EXISTS "ax_wb_update_staff" ON axcelerate_writeback_queue;
CREATE POLICY "ax_wb_update_staff" ON axcelerate_writeback_queue FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'trainer')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'trainer')
    )
  );

-- Extend axcelerate_sync_log with queue linkage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'axcelerate_sync_log' AND column_name = 'writeback_queue_id'
  ) THEN
    ALTER TABLE axcelerate_sync_log
      ADD COLUMN writeback_queue_id uuid REFERENCES axcelerate_writeback_queue(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'axcelerate_sync_log' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE axcelerate_sync_log ADD COLUMN event_type text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ax_sync_log_queue
  ON axcelerate_sync_log (writeback_queue_id);
