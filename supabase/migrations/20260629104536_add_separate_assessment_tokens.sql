-- Add separate LLN and Digital tokens plus tracking columns to assessment_invitations
ALTER TABLE assessment_invitations
  ADD COLUMN lln_token UUID UNIQUE,
  ADD COLUMN lln_status TEXT DEFAULT 'pending' CHECK (lln_status IN ('pending', 'in_progress', 'completed')),
  ADD COLUMN lln_acsf_outcomes JSONB DEFAULT '{}',
  ADD COLUMN lln_completed_at TIMESTAMPTZ,
  ADD COLUMN digital_token UUID UNIQUE,
  ADD COLUMN digital_status TEXT DEFAULT 'pending' CHECK (digital_status IN ('pending', 'in_progress', 'completed')),
  ADD COLUMN digital_score INTEGER,
  ADD COLUMN digital_completed_at TIMESTAMPTZ,
  ADD COLUMN rto_name TEXT;

-- Table for storing adaptive assessment responses (new student assessment system)
CREATE TABLE student_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID NOT NULL REFERENCES assessment_invitations(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('lln', 'digital')),
  question_id TEXT NOT NULL,
  section TEXT,
  acsf_level_attempted INTEGER,
  answer TEXT NOT NULL,
  is_correct BOOLEAN,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE student_responses ENABLE ROW LEVEL SECURITY;

-- Policies for student_responses: access via any of the three token types
CREATE POLICY "student_responses_select_by_token" ON student_responses
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assessment_invitations inv
      WHERE inv.id = student_responses.invitation_id
      AND (
        inv.unique_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), '')
        OR (inv.lln_token IS NOT NULL AND inv.lln_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
        OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
      )
    )
  );

CREATE POLICY "student_responses_insert_by_token" ON student_responses
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assessment_invitations inv
      WHERE inv.id = student_responses.invitation_id
      AND (
        inv.unique_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), '')
        OR (inv.lln_token IS NOT NULL AND inv.lln_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
        OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
      )
    )
  );

-- Staff can see all student_responses
CREATE POLICY "student_responses_select_staff" ON student_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Update assessment_invitations SELECT policy to also match lln_token and digital_token
DROP POLICY IF EXISTS "invitations_select_by_token_scoped" ON assessment_invitations;
CREATE POLICY "invitations_select_by_token_scoped" ON assessment_invitations
  FOR SELECT TO anon, authenticated
  USING (
    unique_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), '')
    OR (lln_token IS NOT NULL AND lln_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
    OR (digital_token IS NOT NULL AND digital_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
  );

-- Update assessment_invitations UPDATE policy
DROP POLICY IF EXISTS "invitations_update_by_token_scoped" ON assessment_invitations;
CREATE POLICY "invitations_update_by_token_scoped" ON assessment_invitations
  FOR UPDATE TO anon, authenticated
  USING (
    unique_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), '')
    OR (lln_token IS NOT NULL AND lln_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
    OR (digital_token IS NOT NULL AND digital_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
  )
  WITH CHECK (
    unique_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), '')
    OR (lln_token IS NOT NULL AND lln_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
    OR (digital_token IS NOT NULL AND digital_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
  );
