/*
# Create Email Queue System

## Purpose
Implements a durable, idempotent email queue for automated invitation emails,
scheduled reminders, and completion notifications. Replaces ad-hoc send-on-save
with a reliable queue that supports retries, deduplication, suppression, and
full audit traceability.

## 1. New Tables

### email_queue
Stores every email to be sent — past, present, or future. Acts as the source
of truth for the email lifecycle.

| Column             | Type         | Description |
|--------------------|--------------|-------------|
| id                 | uuid PK      | Unique row identifier |
| invitation_id      | uuid FK      | Assessment invitation this email relates to |
| email_type         | text         | One of: invitation, reminder_1, reminder_2, reminder_3, completion_admin, completion_student |
| recipient_email    | text         | Delivery address |
| recipient_name     | text         | Display name for email greeting |
| scheduled_at       | timestamptz  | When the email becomes eligible to send |
| status             | text         | pending → sending → sent / failed / cancelled / suppressed |
| idempotency_key    | text UNIQUE  | Prevents duplicate emails for the same trigger (format: invitationId:emailType) |
| attempts           | int          | Number of send attempts (max 3) |
| last_attempted_at  | timestamptz  | Timestamp of most recent attempt |
| last_error         | text         | Error message from last failed attempt |
| sent_at            | timestamptz  | Timestamp when successfully sent |
| notification_id    | uuid FK      | Links to notifications row created on successful send |
| extra_data         | jsonb        | Optional payload (quiz links, due date, etc.) |
| created_at         | timestamptz  | Row creation time |

## 2. Modified Tables

### notifications
- Added `email_queue_id` (uuid, nullable FK to email_queue) — links notification log rows back to the queue item that triggered them.

## 3. Security

### email_queue
- RLS enabled.
- Staff (admin/trainer) can SELECT, INSERT, UPDATE their own queue items.
- Service role bypasses RLS and is the only way process-email-queue writes status updates.
- No DELETE policy — queue items are permanent audit records (cancelled status used instead).

## 4. Important Notes

1. IDEMPOTENCY: The `idempotency_key` column has a UNIQUE constraint. Any attempt to insert a
   duplicate reminder for the same invitation is safely ignored via ON CONFLICT DO NOTHING.

2. SUPPRESSION: The process-email-queue function checks invitation status before sending. If the
   invitation is 'completed' or 'cancelled', pending reminder rows are automatically marked
   'suppressed' without sending.

3. RETRIES: Failed sends are retried up to 3 times. After 3 failures, status stays 'failed' and
   an admin can manually trigger a resend via the EmailActivity page.

4. COMPLETION EMAILS: process-email-queue also detects completed invitations that have no
   completion_admin queue row and auto-creates + sends those.

5. SCHEDULING: Reminders are inserted with future scheduled_at dates when the invitation is
   created. The process-email-queue function is designed to be called periodically (e.g. every
   hour via pg_cron or a scheduled call from the EmailActivity page).
*/

-- email_queue table
CREATE TABLE IF NOT EXISTS email_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id     uuid NOT NULL REFERENCES assessment_invitations(id) ON DELETE CASCADE,
  email_type        text NOT NULL CHECK (email_type IN (
    'invitation', 'reminder_1', 'reminder_2', 'reminder_3',
    'completion_admin', 'completion_student'
  )),
  recipient_email   text NOT NULL,
  recipient_name    text,
  scheduled_at      timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sending', 'sent', 'failed', 'cancelled', 'suppressed'
  )),
  idempotency_key   text NOT NULL,
  attempts          int NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  last_error        text,
  sent_at           timestamptz,
  notification_id   uuid REFERENCES notifications(id) ON DELETE SET NULL,
  extra_data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz DEFAULT now(),

  CONSTRAINT email_queue_idempotency_key_unique UNIQUE (idempotency_key)
);

ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- Indexes for the queue processor
CREATE INDEX IF NOT EXISTS idx_email_queue_status_scheduled
  ON email_queue (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_email_queue_invitation
  ON email_queue (invitation_id);

CREATE INDEX IF NOT EXISTS idx_email_queue_idempotency
  ON email_queue (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_email_queue_type
  ON email_queue (email_type);

-- RLS policies — staff can manage the queue
DROP POLICY IF EXISTS "eq_select_staff" ON email_queue;
CREATE POLICY "eq_select_staff" ON email_queue FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'trainer')
    )
  );

DROP POLICY IF EXISTS "eq_insert_staff" ON email_queue;
CREATE POLICY "eq_insert_staff" ON email_queue FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'trainer')
    )
  );

DROP POLICY IF EXISTS "eq_update_staff" ON email_queue;
CREATE POLICY "eq_update_staff" ON email_queue FOR UPDATE
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

-- Extend notifications with queue linkage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'email_queue_id'
  ) THEN
    ALTER TABLE notifications
      ADD COLUMN email_queue_id uuid REFERENCES email_queue(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for the new FK
CREATE INDEX IF NOT EXISTS idx_notifications_queue
  ON notifications (email_queue_id);
