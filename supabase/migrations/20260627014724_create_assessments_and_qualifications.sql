/*
# Create assessments, questions, qualifications, and validation tables

1. New Tables
- `qualifications`: RTO qualifications (code, name, aXcelerate course link). e.g. CHC33021 Certificate III in Individual Support.
- `qualification_lln_requirements`: Per-qualification minimum ACSF levels by domain/skill. e.g. Reading ACSF 3, Writing ACSF 3, Numeracy 2.
- `assessments`: LLN and Digital assessments with ACSF level mapping, versioning, and status.
- `assessment_questions`: Questions tagged by domain, ACSF skill, ACSF level, mapping rationale, and version.
- `assessment_validation`: Validation documentation per assessment (dates, reviewer, industry consultation notes, review due dates).
- `assessment_version_history`: Snapshots of assessment at each version for audit trail.

2. Security
- RLS enabled on all tables.
- Staff (admin/trainer) have full CRUD; candidates have no direct access (they interact via invitations).
*/

-- Qualifications
CREATE TABLE IF NOT EXISTS qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  axcelerate_course_id numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE qualifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qualifications_select_staff" ON qualifications;
CREATE POLICY "qualifications_select_staff" ON qualifications FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "qualifications_insert_staff" ON qualifications;
CREATE POLICY "qualifications_insert_staff" ON qualifications FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "qualifications_update_staff" ON qualifications;
CREATE POLICY "qualifications_update_staff" ON qualifications FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "qualifications_delete_staff" ON qualifications;
CREATE POLICY "qualifications_delete_staff" ON qualifications FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Qualification LLN requirements
CREATE TABLE IF NOT EXISTS qualification_lln_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qualification_id uuid NOT NULL REFERENCES qualifications(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN ('language', 'literacy', 'numeracy', 'digital')),
  acsf_skill text NOT NULL,
  minimum_acsf_level integer NOT NULL CHECK (minimum_acsf_level BETWEEN 1 AND 5),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE qualification_lln_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lln_req_select_staff" ON qualification_lln_requirements;
CREATE POLICY "lln_req_select_staff" ON qualification_lln_requirements FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "lln_req_insert_staff" ON qualification_lln_requirements;
CREATE POLICY "lln_req_insert_staff" ON qualification_lln_requirements FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "lln_req_update_staff" ON qualification_lln_requirements;
CREATE POLICY "lln_req_update_staff" ON qualification_lln_requirements FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "lln_req_delete_staff" ON qualification_lln_requirements;
CREATE POLICY "lln_req_delete_staff" ON qualification_lln_requirements FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Assessments
CREATE TABLE IF NOT EXISTS assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('lln', 'digital')),
  title text NOT NULL,
  description text,
  total_questions integer NOT NULL DEFAULT 0,
  pass_threshold integer NOT NULL DEFAULT 50,
  acsf_level_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  version text NOT NULL DEFAULT '1.0.0',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  axcelerate_course_id numeric
);

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assessments_select_staff" ON assessments;
CREATE POLICY "assessments_select_staff" ON assessments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "assessments_insert_staff" ON assessments;
CREATE POLICY "assessments_insert_staff" ON assessments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "assessments_update_staff" ON assessments;
CREATE POLICY "assessments_update_staff" ON assessments FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "assessments_delete_staff" ON assessments;
CREATE POLICY "assessments_delete_staff" ON assessments FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Assessment questions
CREATE TABLE IF NOT EXISTS assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  domain text NOT NULL CHECK (domain IN ('language', 'literacy', 'numeracy', 'digital')),
  acsf_skill text NOT NULL,
  acsf_level_target integer CHECK (acsf_level_target BETWEEN 1 AND 5),
  question_type text NOT NULL DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'short_answer', 'scale')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_answer jsonb,
  order_index integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 1,
  mapping_rationale text,
  version text NOT NULL DEFAULT '1.0.0',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE assessment_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "questions_select_staff" ON assessment_questions;
CREATE POLICY "questions_select_staff" ON assessment_questions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "questions_insert_staff" ON assessment_questions;
CREATE POLICY "questions_insert_staff" ON assessment_questions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "questions_update_staff" ON assessment_questions;
CREATE POLICY "questions_update_staff" ON assessment_questions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "questions_delete_staff" ON assessment_questions;
CREATE POLICY "questions_delete_staff" ON assessment_questions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Assessment validation
CREATE TABLE IF NOT EXISTS assessment_validation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  validation_date date NOT NULL,
  reviewer text NOT NULL,
  validation_status text NOT NULL CHECK (validation_status IN ('validated', 'needs_revision')),
  industry_consultation_notes text,
  review_due_date date,
  validation_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE assessment_validation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "validation_select_staff" ON assessment_validation;
CREATE POLICY "validation_select_staff" ON assessment_validation FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "validation_insert_staff" ON assessment_validation;
CREATE POLICY "validation_insert_staff" ON assessment_validation FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "validation_update_staff" ON assessment_validation;
CREATE POLICY "validation_update_staff" ON assessment_validation FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "validation_delete_staff" ON assessment_validation;
CREATE POLICY "validation_delete_staff" ON assessment_validation FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Assessment version history
CREATE TABLE IF NOT EXISTS assessment_version_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  version text NOT NULL,
  change_summary text,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now(),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE assessment_version_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "version_history_select_staff" ON assessment_version_history;
CREATE POLICY "version_history_select_staff" ON assessment_version_history FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "version_history_insert_staff" ON assessment_version_history;
CREATE POLICY "version_history_insert_staff" ON assessment_version_history FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );