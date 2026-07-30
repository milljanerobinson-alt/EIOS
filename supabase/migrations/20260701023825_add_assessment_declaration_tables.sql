/*
# Add Assessment Declaration Tables

## Purpose
Implements mandatory declaration acceptance before LLN and Digital Literacy assessments.
Learners must read and accept a declaration before starting any assessment. Their acceptance
is recorded in the database for compliance/audit purposes.

## New Tables

### declaration_templates
Stores the versioned declaration content that appears on the declaration screen.
Admins can create new versions without code changes; the active version is served at runtime.
- `id` — UUID primary key
- `assessment_type` — 'lln' or 'digital' (which assessment this template applies to)
- `version` — integer version counter (1, 2, 3…)
- `title` — heading shown on the declaration screen
- `purpose_text` — explanatory paragraph about why the assessment is being done
- `statements` — JSONB array of declaration statement strings the learner must agree to
- `active` — only one active template per assessment_type at a time
- `created_at` — timestamp

### assessment_declarations
Audit log of every declaration acceptance. One row per assessment start.
- `id` — UUID primary key
- `invitation_id` — FK to assessment_invitations
- `assessment_type` — 'lln' or 'digital'
- `declaration_version` — which template version was shown
- `accepted` — boolean (always true when inserted, future-proof for declined cases)
- `accepted_at` — timestamp of acceptance
- `ip_address` — client IP if available (text, nullable)
- `user_agent` — browser user agent string (nullable)
- `created_at` — timestamp

## Security
- Both tables use RLS with `TO anon, authenticated` policies because assessment pages
  are accessed via public token URLs (no authenticated session). The anon-key client
  must be able to SELECT templates and INSERT declarations.
- Declarations are INSERT-only for anon (no UPDATE/DELETE) to maintain audit integrity.
- Templates are read-only for anon (admin manages via authenticated session).

## Seed Data
Default declaration templates are seeded for both assessment types.
*/

-- ============================================================
-- declaration_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS declaration_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_type text NOT NULL CHECK (assessment_type IN ('lln', 'digital')),
  version integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  purpose_text text NOT NULL,
  statements jsonb NOT NULL DEFAULT '[]',
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_type, version)
);

ALTER TABLE declaration_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_declaration_templates" ON declaration_templates;
CREATE POLICY "anon_select_declaration_templates" ON declaration_templates
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_declaration_templates" ON declaration_templates;
CREATE POLICY "auth_insert_declaration_templates" ON declaration_templates
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_declaration_templates" ON declaration_templates;
CREATE POLICY "auth_update_declaration_templates" ON declaration_templates
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_declaration_templates" ON declaration_templates;
CREATE POLICY "auth_delete_declaration_templates" ON declaration_templates
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- assessment_declarations
-- ============================================================
CREATE TABLE IF NOT EXISTS assessment_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES assessment_invitations(id) ON DELETE CASCADE,
  assessment_type text NOT NULL CHECK (assessment_type IN ('lln', 'digital')),
  declaration_version integer NOT NULL DEFAULT 1,
  accepted boolean NOT NULL DEFAULT true,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessment_declarations_invitation_id
  ON assessment_declarations(invitation_id);

ALTER TABLE assessment_declarations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_assessment_declarations" ON assessment_declarations;
CREATE POLICY "anon_select_assessment_declarations" ON assessment_declarations
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_assessment_declarations" ON assessment_declarations;
CREATE POLICY "anon_insert_assessment_declarations" ON assessment_declarations
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- No UPDATE or DELETE for anon — declarations are immutable audit records.
DROP POLICY IF EXISTS "auth_update_assessment_declarations" ON assessment_declarations;
CREATE POLICY "auth_update_assessment_declarations" ON assessment_declarations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_assessment_declarations" ON assessment_declarations;
CREATE POLICY "auth_delete_assessment_declarations" ON assessment_declarations
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Seed default declaration templates
-- ============================================================
INSERT INTO declaration_templates (assessment_type, version, title, purpose_text, statements, active)
VALUES (
  'lln',
  1,
  'Before You Begin: LLN Assessment Declaration',
  'This Language, Literacy and Numeracy (LLN) assessment helps your training provider understand your current skill levels in reading, writing, numeracy and oral communication. The results are used to ensure you receive the right level of support throughout your training — they do not affect your enrolment or result in any pass or fail outcome.',
  '[
    "I understand this assessment is used to identify my learning support needs, not to determine my eligibility for training.",
    "I understand that my results will be shared with my trainer and relevant staff at this registered training organisation (RTO) for the purpose of providing appropriate support.",
    "I agree to complete this assessment honestly and to the best of my ability.",
    "I understand I can ask for assistance or reasonable adjustments if I have a disability, injury, or learning difficulty.",
    "I confirm that the information I provide in this assessment is my own work."
  ]',
  true
),
(
  'digital',
  1,
  'Before You Begin: Digital Literacy Assessment Declaration',
  'This Digital Literacy assessment helps your training provider understand your current skills and confidence with digital tools and technology. The results are used to tailor your training experience and identify any additional support you may need — they do not affect your enrolment or result in any pass or fail outcome.',
  '[
    "I understand this assessment is used to identify my digital skill level and any support I may need, not to determine my eligibility for training.",
    "I understand that my results will be shared with my trainer and relevant staff at this registered training organisation (RTO) for the purpose of providing appropriate support.",
    "I agree to complete this assessment honestly and to the best of my ability.",
    "I understand I can ask for assistance or reasonable adjustments if I have a disability, injury, or learning difficulty.",
    "I confirm that the information I provide in this assessment is my own work."
  ]',
  true
)
ON CONFLICT (assessment_type, version) DO NOTHING;
