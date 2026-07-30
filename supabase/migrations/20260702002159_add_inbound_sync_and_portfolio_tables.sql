-- Add date of birth to assessment_invitations for learner matching
ALTER TABLE assessment_invitations
  ADD COLUMN IF NOT EXISTS candidate_dob DATE;

-- Index for fast DOB+name matching
CREATE INDEX IF NOT EXISTS idx_invitations_dob ON assessment_invitations (candidate_dob)
  WHERE candidate_dob IS NOT NULL;

-- Track each inbound sync operation for idempotency
-- idempotency_key = contact_id:assessment_type:qualification_id (or 'any' if no qual)
CREATE TABLE axcelerate_inbound_sync_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  axcelerate_contact_id  BIGINT   NOT NULL,
  assessment_type     TEXT        NOT NULL CHECK (assessment_type IN ('lln', 'digital', 'both', 'none')),
  qualification_id    UUID        REFERENCES qualifications(id) ON DELETE SET NULL,
  axcelerate_course_id   BIGINT,
  idempotency_key     TEXT        UNIQUE NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'skipped', 'created', 'failed')),
  invitation_id       UUID        REFERENCES assessment_invitations(id) ON DELETE SET NULL,
  lln_invitation_id   UUID        REFERENCES assessment_invitations(id) ON DELETE SET NULL,
  digital_invitation_id UUID      REFERENCES assessment_invitations(id) ON DELETE SET NULL,
  contact_name        TEXT,
  contact_email       TEXT,
  note_text           TEXT,
  note_written        BOOLEAN     DEFAULT false,
  error               TEXT,
  processed_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE axcelerate_inbound_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inbound_sync_log_select_staff" ON axcelerate_inbound_sync_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

CREATE POLICY "inbound_sync_log_insert_staff" ON axcelerate_inbound_sync_log
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

CREATE INDEX idx_inbound_sync_log_contact ON axcelerate_inbound_sync_log (axcelerate_contact_id);
CREATE INDEX idx_inbound_sync_log_invitation ON axcelerate_inbound_sync_log (invitation_id);

-- Track portfolio uploads to prevent duplicates
CREATE TABLE axcelerate_portfolio_uploads (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id       UUID        NOT NULL REFERENCES assessment_invitations(id) ON DELETE CASCADE,
  assessment_type     TEXT        NOT NULL CHECK (assessment_type IN ('lln', 'digital')),
  axcelerate_contact_id  BIGINT   NOT NULL,
  idempotency_key     TEXT        UNIQUE NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'success', 'failed')),
  file_name           TEXT,
  portfolio_type_id   TEXT,
  error               TEXT,
  attempts            INTEGER     DEFAULT 0,
  last_attempted_at   TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE axcelerate_portfolio_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_uploads_select_staff" ON axcelerate_portfolio_uploads
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

CREATE POLICY "portfolio_uploads_insert_staff" ON axcelerate_portfolio_uploads
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

CREATE POLICY "portfolio_uploads_update_staff" ON axcelerate_portfolio_uploads
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

CREATE INDEX idx_portfolio_uploads_invitation ON axcelerate_portfolio_uploads (invitation_id);
CREATE INDEX idx_portfolio_uploads_contact ON axcelerate_portfolio_uploads (axcelerate_contact_id);
