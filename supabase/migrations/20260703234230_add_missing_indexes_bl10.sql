-- BL-10: Add confirmed missing database indexes
-- All use IF NOT EXISTS to be safe on re-run

-- Queue pick query: filters by status+attempts, ordered by created_at
-- Partial index covers only the rows the cron processor actually reads
CREATE INDEX IF NOT EXISTS idx_axcelerate_writeback_queue_pending
  ON axcelerate_writeback_queue (status, attempts, created_at)
  WHERE status IN ('pending', 'failed');

-- Compliance and audit trail queries filter by invitation_id + event_type, sorted by timestamp
CREATE INDEX IF NOT EXISTS idx_audit_trail_invitation_event_time
  ON audit_trail (invitation_id, event_type, timestamp DESC);

-- Support plan lookups filter by invitation_id and status together
CREATE INDEX IF NOT EXISTS idx_support_plans_invitation_status
  ON support_plans (invitation_id, status);

-- ACSF requirement lookups scan the full table on every assessment completion
CREATE INDEX IF NOT EXISTS idx_qualification_lln_requirements_qualification_id
  ON qualification_lln_requirements (qualification_id);

-- Individual response lookups by question_id
CREATE INDEX IF NOT EXISTS idx_assessment_responses_question_id
  ON assessment_responses (question_id);
