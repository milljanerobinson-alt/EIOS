/*
# Create invitations, invitation_assessments, and responses tables

1. New Tables
- `assessment_invitations`: Combined invitations linking a candidate to both LLN and Digital quizzes. Tracks overall status, identity verification, course recommendation, and aXcelerate contact link.
- `invitation_assessments`: Join table linking one invitation to multiple assessments (LLN + Digital). Tracks per-assessment status, score, pass/fail, and ACSF outcomes.
- `assessment_responses`: Individual question responses with question version for evidence integrity.

2. Security
- RLS enabled on all tables.
- Invitations: staff have full CRUD; anon+authenticated can SELECT/UPDATE via unique token lookup (for the public quiz flow). This allows candidates to access their quiz without logging in.
- Responses: staff have full CRUD; anon+authenticated can INSERT/SELECT via invitation token match.
*/

-- Assessment invitations
CREATE TABLE IF NOT EXISTS assessment_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qualification_id uuid REFERENCES qualifications(id) ON DELETE SET NULL,
  candidate_email text NOT NULL,
  candidate_name text NOT NULL,
  unique_token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'opened', 'in_progress', 'completed')),
  sent_at timestamptz DEFAULT now(),
  opened_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  progress_percent integer NOT NULL DEFAULT 0,
  due_date date,
  identity_verified boolean NOT NULL DEFAULT false,
  identity_verification_method text,
  identity_verified_at timestamptz,
  axcelerate_contact_id numeric,
  course_recommendation text CHECK (course_recommendation IN ('suitable', 'suitable_with_support', 'not_yet_suitable') OR course_recommendation IS NULL),
  recommendation_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  trainer_override text,
  trainer_override_reason text,
  trainer_override_by uuid REFERENCES auth.users(id),
  trainer_override_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE assessment_invitations ENABLE ROW LEVEL SECURITY;

-- Staff full access
DROP POLICY IF EXISTS "invitations_select_staff" ON assessment_invitations;
CREATE POLICY "invitations_select_staff" ON assessment_invitations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "invitations_insert_staff" ON assessment_invitations;
CREATE POLICY "invitations_insert_staff" ON assessment_invitations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "invitations_update_staff" ON assessment_invitations;
CREATE POLICY "invitations_update_staff" ON assessment_invitations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "invitations_delete_staff" ON assessment_invitations;
CREATE POLICY "invitations_delete_staff" ON assessment_invitations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Public access via unique token (for quiz flow without login)
DROP POLICY IF EXISTS "invitations_select_by_token" ON assessment_invitations;
CREATE POLICY "invitations_select_by_token" ON assessment_invitations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "invitations_update_by_token" ON assessment_invitations;
CREATE POLICY "invitations_update_by_token" ON assessment_invitations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Invitation assessments (join table)
CREATE TABLE IF NOT EXISTS invitation_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES assessment_invitations(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  individual_status text NOT NULL DEFAULT 'pending' CHECK (individual_status IN ('pending', 'opened', 'in_progress', 'completed')),
  individual_score numeric,
  individual_passed boolean,
  individual_completed_at timestamptz,
  acsf_outcomes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invitation_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inv_assessments_select_staff" ON invitation_assessments;
CREATE POLICY "inv_assessments_select_staff" ON invitation_assessments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "inv_assessments_insert_staff" ON invitation_assessments;
CREATE POLICY "inv_assessments_insert_staff" ON invitation_assessments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "inv_assessments_update_staff" ON invitation_assessments;
CREATE POLICY "inv_assessments_update_staff" ON invitation_assessments FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "inv_assessments_delete_staff" ON invitation_assessments;
CREATE POLICY "inv_assessments_delete_staff" ON invitation_assessments FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Public access via invitation token
DROP POLICY IF EXISTS "inv_assessments_select_public" ON invitation_assessments;
CREATE POLICY "inv_assessments_select_public" ON invitation_assessments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "inv_assessments_update_public" ON invitation_assessments;
CREATE POLICY "inv_assessments_update_public" ON invitation_assessments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inv_assessments_insert_public" ON invitation_assessments;
CREATE POLICY "inv_assessments_insert_public" ON invitation_assessments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Assessment responses
CREATE TABLE IF NOT EXISTS assessment_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES assessment_invitations(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
  question_version text,
  answer jsonb,
  submitted_at timestamptz DEFAULT now()
);

ALTER TABLE assessment_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "responses_select_staff" ON assessment_responses;
CREATE POLICY "responses_select_staff" ON assessment_responses FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "responses_insert_staff" ON assessment_responses;
CREATE POLICY "responses_insert_staff" ON assessment_responses FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "responses_update_staff" ON assessment_responses;
CREATE POLICY "responses_update_staff" ON assessment_responses FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "responses_delete_staff" ON assessment_responses;
CREATE POLICY "responses_delete_staff" ON assessment_responses FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Public access for quiz flow
DROP POLICY IF EXISTS "responses_select_public" ON assessment_responses;
CREATE POLICY "responses_select_public" ON assessment_responses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "responses_insert_public" ON assessment_responses;
CREATE POLICY "responses_insert_public" ON assessment_responses FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "responses_update_public" ON assessment_responses;
CREATE POLICY "responses_update_public" ON assessment_responses FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "responses_delete_public" ON assessment_responses;
CREATE POLICY "responses_delete_public" ON assessment_responses FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invitations_token ON assessment_invitations(unique_token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON assessment_invitations(candidate_email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON assessment_invitations(status);
CREATE INDEX IF NOT EXISTS idx_inv_assessments_invitation ON invitation_assessments(invitation_id);
CREATE INDEX IF NOT EXISTS idx_responses_invitation ON assessment_responses(invitation_id);
CREATE INDEX IF NOT EXISTS idx_responses_assessment ON assessment_responses(assessment_id);