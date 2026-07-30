-- Extend audit_trail with full compliance fields
ALTER TABLE audit_trail
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS qualification_id uuid REFERENCES qualifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assessment_id uuid REFERENCES assessments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system' CHECK (source IN ('system', 'student', 'trainer', 'admin', 'api')),
  ADD COLUMN IF NOT EXISTS previous_values jsonb,
  ADD COLUMN IF NOT EXISTS new_values jsonb,
  ADD COLUMN IF NOT EXISTS user_agent text;

-- Rename actor column values to align with new source field
-- (actor column kept for backward compat, source is the canonical field)

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_audit_trail_event_type ON audit_trail(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_trail_category ON audit_trail(category);
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON audit_trail(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_invitation ON audit_trail(invitation_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_qualification ON audit_trail(qualification_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_assessment ON audit_trail(assessment_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_actor_id ON audit_trail(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_severity ON audit_trail(severity);

-- Allow anon INSERT for student-side events (quiz flow uses anon client)
-- These policies are additive — staff SELECT/INSERT already exist
DROP POLICY IF EXISTS "audit_trail_insert_anon" ON audit_trail;
CREATE POLICY "audit_trail_insert_anon" ON audit_trail FOR INSERT
  TO anon WITH CHECK (true);

-- Prevent UPDATE/DELETE on audit records (immutability)
DROP POLICY IF EXISTS "audit_trail_no_update" ON audit_trail;
DROP POLICY IF EXISTS "audit_trail_no_delete" ON audit_trail;
-- No UPDATE or DELETE policies = immutable (Postgres denies by default when RLS is enabled and no policy matches)
