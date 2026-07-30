-- Extend axcelerate_writeback_queue to allow quiz-started event types
-- and permit anon (quiz token) clients to insert them.

-- 1. Drop the old CHECK constraint and replace with an expanded one
ALTER TABLE axcelerate_writeback_queue
  DROP CONSTRAINT IF EXISTS axcelerate_writeback_queue_event_type_check;

ALTER TABLE axcelerate_writeback_queue
  ADD CONSTRAINT axcelerate_writeback_queue_event_type_check
  CHECK (event_type IN (
    'invitation_sent',
    'assessment_completed',
    'support_plan_generated',
    'intervention_required',
    'lln_assessment_opened',
    'digital_assessment_opened'
  ));

-- 2. Allow anon quiz-token clients to INSERT rows that belong to their invitation
DROP POLICY IF EXISTS "ax_wb_insert_anon_quiz" ON axcelerate_writeback_queue;
CREATE POLICY "ax_wb_insert_anon_quiz" ON axcelerate_writeback_queue
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assessment_invitations inv
      WHERE inv.id = axcelerate_writeback_queue.invitation_id
      AND (
        inv.unique_token::text  = get_quiz_token()
        OR (inv.lln_token     IS NOT NULL AND inv.lln_token::text     = get_quiz_token())
        OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = get_quiz_token())
      )
    )
  );
