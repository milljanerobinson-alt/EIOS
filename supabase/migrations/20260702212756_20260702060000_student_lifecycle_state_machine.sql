/*
# Student Lifecycle State Machine Data Model

Introduces Students, Enrolments, and Student Lifecycle Events as first-class entities.
Assessment invitations become Assessment Attempts linked to a student and enrolment.
Expands status and event_type check constraints. Adds quiz-token INSERT policies
so the public quiz flow can queue aXcelerate write-backs directly.

1. New Tables
   - students: one record per learner (axcelerate_contact_id, name, DOB, email, current_status)
   - enrolments: multiple per student (qualification, aXcelerate enrolment reference)
   - student_lifecycle_events: chronological activity timeline per student

2. Modified Tables
   - assessment_invitations: student_id, enrolment_id FKs + 4 note-written flags + expanded status constraint
   - axcelerate_writeback_queue: expanded event_type constraint + quiz-token INSERT policy

3. Security
   - RLS on all new tables (staff full CRUD)
   - Quiz-token anon INSERT on writeback_queue and lifecycle_events for their own invitation
*/

-- ─── students ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  axcelerate_contact_id numeric UNIQUE,
  first_name            text NOT NULL,
  last_name             text NOT NULL,
  date_of_birth         date,
  email                 text,
  phone                 text,
  current_status        text NOT NULL DEFAULT 'lln_required' CHECK (current_status IN (
    'lln_required','invitation_sent','lln_opened','digital_invitation_sent',
    'digital_opened','awaiting_submission','lln_complete','digital_complete',
    'support_generated','closed'
  )),
  latest_invitation_id  uuid,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_select_staff" ON students;
CREATE POLICY "students_select_staff" ON students FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

DROP POLICY IF EXISTS "students_insert_staff" ON students;
CREATE POLICY "students_insert_staff" ON students FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

DROP POLICY IF EXISTS "students_update_staff" ON students;
CREATE POLICY "students_update_staff" ON students FOR UPDATE TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

DROP POLICY IF EXISTS "students_delete_staff" ON students;
CREATE POLICY "students_delete_staff" ON students FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

-- ─── enrolments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrolments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  axcelerate_enrolment_id text,
  axcelerate_course_id    numeric,
  qualification_id        uuid REFERENCES qualifications(id) ON DELETE SET NULL,
  qualification_name      text,
  enrolment_status        text,
  commencement_date       date,
  completion_date         date,
  is_current              boolean NOT NULL DEFAULT true,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enrolments_select_staff" ON enrolments;
CREATE POLICY "enrolments_select_staff" ON enrolments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

DROP POLICY IF EXISTS "enrolments_insert_staff" ON enrolments;
CREATE POLICY "enrolments_insert_staff" ON enrolments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

DROP POLICY IF EXISTS "enrolments_update_staff" ON enrolments;
CREATE POLICY "enrolments_update_staff" ON enrolments FOR UPDATE TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

DROP POLICY IF EXISTS "enrolments_delete_staff" ON enrolments;
CREATE POLICY "enrolments_delete_staff" ON enrolments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

CREATE INDEX IF NOT EXISTS idx_enrolments_student ON enrolments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_current ON enrolments(student_id) WHERE is_current = true;

-- ─── student_lifecycle_events ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_lifecycle_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  invitation_id uuid REFERENCES assessment_invitations(id) ON DELETE SET NULL,
  event_type    text NOT NULL,
  description   text NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE student_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lifecycle_select_staff" ON student_lifecycle_events;
CREATE POLICY "lifecycle_select_staff" ON student_lifecycle_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

DROP POLICY IF EXISTS "lifecycle_insert_staff" ON student_lifecycle_events;
CREATE POLICY "lifecycle_insert_staff" ON student_lifecycle_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

DROP POLICY IF EXISTS "lifecycle_delete_staff" ON student_lifecycle_events;
CREATE POLICY "lifecycle_delete_staff" ON student_lifecycle_events FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));

-- Quiz-token anon can INSERT lifecycle events linked to their own invitation
DROP POLICY IF EXISTS "lifecycle_insert_quiz_token" ON student_lifecycle_events;
CREATE POLICY "lifecycle_insert_quiz_token" ON student_lifecycle_events FOR INSERT
  TO anon, authenticated WITH CHECK (
    invitation_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM assessment_invitations inv
      WHERE inv.id = student_lifecycle_events.invitation_id
      AND (
        inv.unique_token::text  = coalesce(current_setting('request.headers.x-quiz-token', true), '')
        OR (inv.lln_token     IS NOT NULL AND inv.lln_token::text     = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
        OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_lifecycle_student ON student_lifecycle_events(student_id, created_at DESC);

-- ─── students.latest_invitation_id FK (after assessment_invitations exists) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='students' AND constraint_name='students_latest_invitation_id_fkey'
  ) THEN
    ALTER TABLE students ADD CONSTRAINT students_latest_invitation_id_fkey
      FOREIGN KEY (latest_invitation_id) REFERENCES assessment_invitations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── assessment_invitations — new columns ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='assessment_invitations' AND column_name='student_id') THEN
    ALTER TABLE assessment_invitations ADD COLUMN student_id uuid REFERENCES students(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='assessment_invitations' AND column_name='enrolment_id') THEN
    ALTER TABLE assessment_invitations ADD COLUMN enrolment_id uuid REFERENCES enrolments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='assessment_invitations' AND column_name='lln_note_written') THEN
    ALTER TABLE assessment_invitations ADD COLUMN lln_note_written boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='assessment_invitations' AND column_name='lln_complete_note_written') THEN
    ALTER TABLE assessment_invitations ADD COLUMN lln_complete_note_written boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='assessment_invitations' AND column_name='digital_note_written') THEN
    ALTER TABLE assessment_invitations ADD COLUMN digital_note_written boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='assessment_invitations' AND column_name='digital_complete_note_written') THEN
    ALTER TABLE assessment_invitations ADD COLUMN digital_complete_note_written boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invitations_student ON assessment_invitations(student_id);

-- Expand status check constraint (drop exact name, re-add with new values)
ALTER TABLE assessment_invitations DROP CONSTRAINT IF EXISTS assessment_invitations_status_check;
ALTER TABLE assessment_invitations ADD CONSTRAINT assessment_invitations_status_check CHECK (status IN (
  'lln_required','invitation_sent','lln_opened','digital_invitation_sent',
  'digital_opened','awaiting_submission','lln_complete','digital_complete',
  'support_generated','closed',
  -- Legacy
  'sent','opened','in_progress','completed'
));

-- ─── axcelerate_writeback_queue — expand event_type + quiz-token INSERT ──────
ALTER TABLE axcelerate_writeback_queue DROP CONSTRAINT IF EXISTS axcelerate_writeback_queue_event_type_check;
ALTER TABLE axcelerate_writeback_queue ADD CONSTRAINT axcelerate_writeback_queue_event_type_check CHECK (event_type IN (
  'invitation_sent','assessment_completed','support_plan_generated','intervention_required',
  'lln_assessment_opened','digital_assessment_opened'
));

DROP POLICY IF EXISTS "ax_wb_insert_quiz_token" ON axcelerate_writeback_queue;
CREATE POLICY "ax_wb_insert_quiz_token" ON axcelerate_writeback_queue FOR INSERT
  TO anon, authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM assessment_invitations inv
      WHERE inv.id = axcelerate_writeback_queue.invitation_id
      AND (
        inv.unique_token::text  = coalesce(current_setting('request.headers.x-quiz-token', true), '')
        OR (inv.lln_token     IS NOT NULL AND inv.lln_token::text     = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
        OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = coalesce(current_setting('request.headers.x-quiz-token', true), ''))
      )
    )
  );
