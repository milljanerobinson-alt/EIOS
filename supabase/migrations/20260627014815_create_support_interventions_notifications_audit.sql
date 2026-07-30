/*
# Create support plans, intervention tables, notifications, audit trail, and aXcelerate sync log

1. New Tables
- `support_plans`: AI-generated and trainer-edited support plans based on learner performance.
- `intervention_cases`: Opened when a learner does not meet qualification requirements.
- `intervention_notes`: Trainer notes within an intervention case.
- `intervention_evidence`: File uploads as evidence within an intervention case.
- `intervention_support_strategies`: Support strategies recorded by the trainer.
- `intervention_reassessments`: Scheduled reassessments within an intervention case.
- `notifications`: Log of all email notifications sent.
- `audit_trail`: Complete digital audit trail of every meaningful event for ASQA compliance.
- `axcelerate_sync_log`: Log of all aXcelerate API calls for debugging and audit.

2. Security
- RLS enabled on all tables. Staff (admin/trainer) have full CRUD.
- Support plans and audit_trail: public can SELECT/INSERT for the quiz flow.
- Notifications, axcelerate_sync_log: staff-only.
*/

-- Support plans
CREATE TABLE IF NOT EXISTS support_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES assessment_invitations(id) ON DELETE CASCADE,
  generated_by text NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai', 'trainer')),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  trainer_id uuid REFERENCES auth.users(id),
  trainer_comments text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  approved_at timestamptz
);

ALTER TABLE support_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_plans_select_staff" ON support_plans;
CREATE POLICY "support_plans_select_staff" ON support_plans FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "support_plans_select_public" ON support_plans;
CREATE POLICY "support_plans_select_public" ON support_plans FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "support_plans_insert_staff" ON support_plans;
CREATE POLICY "support_plans_insert_staff" ON support_plans FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "support_plans_update_staff" ON support_plans;
CREATE POLICY "support_plans_update_staff" ON support_plans FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "support_plans_delete_staff" ON support_plans;
CREATE POLICY "support_plans_delete_staff" ON support_plans FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Intervention cases
CREATE TABLE IF NOT EXISTS intervention_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES assessment_invitations(id) ON DELETE CASCADE,
  qualification_id uuid REFERENCES qualifications(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'scheduled_reassessment', 'closed')),
  trigger_reason text,
  closing_summary text,
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  opened_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE intervention_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intervention_cases_select_staff" ON intervention_cases;
CREATE POLICY "intervention_cases_select_staff" ON intervention_cases FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "intervention_cases_insert_staff" ON intervention_cases;
CREATE POLICY "intervention_cases_insert_staff" ON intervention_cases FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "intervention_cases_update_staff" ON intervention_cases;
CREATE POLICY "intervention_cases_update_staff" ON intervention_cases FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "intervention_cases_delete_staff" ON intervention_cases;
CREATE POLICY "intervention_cases_delete_staff" ON intervention_cases FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Intervention notes
CREATE TABLE IF NOT EXISTS intervention_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_case_id uuid NOT NULL REFERENCES intervention_cases(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id),
  note_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE intervention_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "int_notes_select_staff" ON intervention_notes;
CREATE POLICY "int_notes_select_staff" ON intervention_notes FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "int_notes_insert_staff" ON intervention_notes;
CREATE POLICY "int_notes_insert_staff" ON intervention_notes FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "int_notes_update_staff" ON intervention_notes;
CREATE POLICY "int_notes_update_staff" ON intervention_notes FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "int_notes_delete_staff" ON intervention_notes;
CREATE POLICY "int_notes_delete_staff" ON intervention_notes FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Intervention evidence
CREATE TABLE IF NOT EXISTS intervention_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_case_id uuid NOT NULL REFERENCES intervention_cases(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz DEFAULT now(),
  description text
);

ALTER TABLE intervention_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "int_evidence_select_staff" ON intervention_evidence;
CREATE POLICY "int_evidence_select_staff" ON intervention_evidence FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "int_evidence_insert_staff" ON intervention_evidence;
CREATE POLICY "int_evidence_insert_staff" ON intervention_evidence FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "int_evidence_delete_staff" ON intervention_evidence;
CREATE POLICY "int_evidence_delete_staff" ON intervention_evidence FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Intervention support strategies
CREATE TABLE IF NOT EXISTS intervention_support_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_case_id uuid NOT NULL REFERENCES intervention_cases(id) ON DELETE CASCADE,
  strategy_text text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE intervention_support_strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "int_strategies_select_staff" ON intervention_support_strategies;
CREATE POLICY "int_strategies_select_staff" ON intervention_support_strategies FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "int_strategies_insert_staff" ON intervention_support_strategies;
CREATE POLICY "int_strategies_insert_staff" ON intervention_support_strategies FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "int_strategies_update_staff" ON intervention_support_strategies;
CREATE POLICY "int_strategies_update_staff" ON intervention_support_strategies FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "int_strategies_delete_staff" ON intervention_support_strategies;
CREATE POLICY "int_strategies_delete_staff" ON intervention_support_strategies FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Intervention reassessments
CREATE TABLE IF NOT EXISTS intervention_reassessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_case_id uuid NOT NULL REFERENCES intervention_cases(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'no_show')),
  new_invitation_id uuid REFERENCES assessment_invitations(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE intervention_reassessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "int_reassessments_select_staff" ON intervention_reassessments;
CREATE POLICY "int_reassessments_select_staff" ON intervention_reassessments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "int_reassessments_insert_staff" ON intervention_reassessments;
CREATE POLICY "int_reassessments_insert_staff" ON intervention_reassessments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "int_reassessments_update_staff" ON intervention_reassessments;
CREATE POLICY "int_reassessments_update_staff" ON intervention_reassessments FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Notifications log
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid REFERENCES assessment_invitations(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('sent', 'reminder', 'completed', 'overdue', 'trainer_review', 'intervention', 'support_plan')),
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  body text,
  sent_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending'))
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_staff" ON notifications;
CREATE POLICY "notifications_select_staff" ON notifications FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "notifications_insert_staff" ON notifications;
CREATE POLICY "notifications_insert_staff" ON notifications FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Audit trail
CREATE TABLE IF NOT EXISTS audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid REFERENCES assessment_invitations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text NOT NULL DEFAULT 'system' CHECK (actor IN ('system', 'trainer', 'candidate', 'admin')),
  actor_id uuid REFERENCES auth.users(id),
  timestamp timestamptz DEFAULT now(),
  ip_address text
);

ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_trail_select_staff" ON audit_trail;
CREATE POLICY "audit_trail_select_staff" ON audit_trail FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "audit_trail_insert_staff" ON audit_trail;
CREATE POLICY "audit_trail_insert_staff" ON audit_trail FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "audit_trail_insert_public" ON audit_trail;
CREATE POLICY "audit_trail_insert_public" ON audit_trail FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- aXcelerate sync log
CREATE TABLE IF NOT EXISTS axcelerate_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid REFERENCES assessment_invitations(id) ON DELETE SET NULL,
  sync_type text NOT NULL CHECK (sync_type IN ('contact_search', 'contact_create', 'enrol', 'note', 'outcome')),
  request_payload jsonb,
  response_payload jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error text,
  synced_at timestamptz DEFAULT now()
);

ALTER TABLE axcelerate_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "axcelerate_log_select_staff" ON axcelerate_sync_log;
CREATE POLICY "axcelerate_log_select_staff" ON axcelerate_sync_log FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "axcelerate_log_insert_staff" ON axcelerate_sync_log;
CREATE POLICY "axcelerate_log_insert_staff" ON axcelerate_sync_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_plans_invitation ON support_plans(invitation_id);
CREATE INDEX IF NOT EXISTS idx_intervention_cases_invitation ON intervention_cases(invitation_id);
CREATE INDEX IF NOT EXISTS idx_intervention_cases_status ON intervention_cases(status);
CREATE INDEX IF NOT EXISTS idx_notifications_invitation ON notifications(invitation_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_invitation ON audit_trail(invitation_id);
CREATE INDEX IF NOT EXISTS idx_axcelerate_log_invitation ON axcelerate_sync_log(invitation_id);