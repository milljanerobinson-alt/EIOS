/*
# Builder Hub — Dynamic Columns + Feature Cards

## Changes

### New Table: builder_columns
Stores the Kanban column definitions so columns are user-configurable:
titles are editable and order is preserved per user drag-and-drop.
- `id` — UUID primary key
- `key` — text slug matching builder_features.status values
- `title` — display label (editable by user)
- `position` — sort order of the column on the board
- `created_at` — timestamp

### Modified Table: builder_features
- Drops the old static CHECK constraint on `status` so any column key is valid.
  The `builder_columns` table is now the source of truth for valid statuses.

### Seed Data
- 5 columns seeded: Backlog, In Progress, Roadmap, Shipped, Needs Review
- 18 feature cards representing all current platform features, all under
  the `needs_review` status for the team to triage.

## Security
- builder_columns: authenticated users can read/write (admin tool).
*/

-- ─── builder_columns ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS builder_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  title text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE builder_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_builder_columns" ON builder_columns;
CREATE POLICY "auth_select_builder_columns" ON builder_columns
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_builder_columns" ON builder_columns;
CREATE POLICY "auth_insert_builder_columns" ON builder_columns
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_builder_columns" ON builder_columns;
CREATE POLICY "auth_update_builder_columns" ON builder_columns
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_builder_columns" ON builder_columns;
CREATE POLICY "auth_delete_builder_columns" ON builder_columns
  FOR DELETE TO authenticated USING (true);

-- ─── Drop static CHECK so status can be any column key ──────────────────────
ALTER TABLE builder_features
  DROP CONSTRAINT IF EXISTS builder_features_status_check;

-- ─── Seed columns ────────────────────────────────────────────────────────────
INSERT INTO builder_columns (key, title, position) VALUES
  ('backlog',      'Backlog',      0),
  ('in_progress',  'In Progress',  1),
  ('roadmap',      'Roadmap',      2),
  ('needs_review', 'Needs Review', 3),
  ('shipped',      'Shipped',      4)
ON CONFLICT (key) DO NOTHING;

-- ─── Seed current platform feature cards ─────────────────────────────────────
INSERT INTO builder_features (title, description, status, priority, tags, notes, position) VALUES

('Adaptive LLN Assessment Engine',
 'Computer-adaptive test across 5 ACSF sections (Reading, Numeracy, Writing, Oral Communication, Learning). Adjusts question difficulty based on consecutive correct/incorrect answers using a branching algorithm.',
 'needs_review', 'high',
 '["ACSF", "UX"]',
 'Core product feature. 8 questions max per section, confidence threshold of 2 consecutive. Levels 1–5.',
 0),

('Digital Literacy Assessment',
 'Fixed-sequence assessment across 5 digital domains: Basic Skills, Communication, Information Literacy, Online Safety, Problem Solving.',
 'needs_review', 'high',
 '["ACSF", "UX"]',
 'Domain-scored. Results mapped to ACSF Digital Literacy levels 1–5.',
 1),

('Assessment Declaration Screen',
 'Mandatory pre-assessment declaration that learners must read and accept before starting LLN or Digital assessments. DB-backed versioned templates with audit log.',
 'needs_review', 'high',
 '["Compliance", "UX"]',
 'Uses declaration_templates and assessment_declarations tables. sessionStorage prevents re-accept on refresh.',
 2),

('ACSF Auto-Mapping Engine',
 '4-layer engine: Qualification Library → UoC Direct Lookup → Keyword Inference → Weighted Roll-up. Computes ACSF levels per qualification from UoC codes with confidence scoring.',
 'needs_review', 'high',
 '["ACSF", "Automation"]',
 'compute-acsf-mapping edge function. Core UoCs weighted 70%, Elective 30%. Safety floor: any Core >= L4 sets minimum L3 across all skills.',
 3),

('Qualification Management Board',
 '6-skill ACSF requirement grid per qualification with inline level editing, status badges, search/filter bar, and re-mapping trigger. Auto-applies library mappings on import.',
 'needs_review', 'medium',
 '["ACSF", "UX"]',
 'QualificationsPage.tsx. Status: mapping_required / default_mapping_applied / custom_mapping / review_required.',
 4),

('aXcelerate Qualifications Import',
 'Edge function that syncs qualifications from aXcelerate API. Auto-applies ACSF mapping from qualification_mapping_library on import. Library has 70+ qualifications seeded.',
 'needs_review', 'high',
 '["aXcelerate", "Automation"]',
 'import-axcelerate-qualifications edge function. Skips custom mappings on re-import.',
 5),

('aXcelerate Candidate Sync',
 'Syncs enrolled candidates and their qualification enrolments from aXcelerate. Creates assessment invitations with unique LLN + Digital tokens.',
 'needs_review', 'high',
 '["aXcelerate", "Automation"]',
 'axcelerate-sync edge function.',
 6),

('Candidate Management',
 'Lists all candidates with enrolment data, assessment status, and quick-access to send or resend assessment invitations.',
 'needs_review', 'medium',
 '["UX"]',
 'CandidatesPage.tsx.',
 7),

('Results & Analytics',
 'Per-candidate ACSF level results across all 6 domains. Trainer-facing view with domain breakdown, flagged gaps, and comparison against qualification requirements.',
 'needs_review', 'medium',
 '["ACSF", "Reporting"]',
 'ResultsPage.tsx.',
 8),

('AI-Generated Support Plans',
 'OpenAI-powered support plan generator. Produces personalised learning recommendations based on ACSF gaps between assessment results and qualification requirements.',
 'needs_review', 'medium',
 '["Automation", "Reporting"]',
 'generate-support-plan edge function. Uses LLM secret stored in Supabase.',
 9),

('Interventions Tracker',
 'Tracks support interventions assigned to candidates. Records type, date, outcome, and links to the triggering assessment result.',
 'needs_review', 'low',
 '["Compliance", "Reporting"]',
 'InterventionsPage.tsx.',
 10),

('Compliance Reporting',
 'Generates compliance summary reports for RTOs. Tracks declaration acceptance rates, assessment completion, and support intervention coverage.',
 'needs_review', 'medium',
 '["Compliance", "Reporting"]',
 'CompliancePage.tsx.',
 11),

('Billing & Stripe Integration',
 'Stripe Checkout + Customer Portal integration. Subscription management with plan tiers. Webhook handler for subscription lifecycle events.',
 'needs_review', 'medium',
 '["Billing"]',
 'stripe-checkout, stripe-portal, stripe-webhook edge functions.',
 12),

('Email Notification System',
 'Transactional email via configurable SMTP. Sends assessment invitations, reminders, and support plan notifications. Email secret stored securely.',
 'needs_review', 'medium',
 '["Automation"]',
 'send-email edge function. Secrets managed via save-email-secret.',
 13),

('Admin OTP Authentication',
 '2-factor authentication for admin users via one-time passcode sent to email. Required after password login before accessing the admin portal.',
 'needs_review', 'high',
 '["Compliance", "Auth"]',
 'send-admin-otp + verify-admin-otp edge functions. OTP codes table with expiry.',
 14),

('Student Landing Page',
 'Public-facing page for learners arriving via invitation link. Shows assessment overview, RTO branding, and entry points to LLN and Digital assessments.',
 'needs_review', 'medium',
 '["UX"]',
 'StudentLandingPage.tsx. Token-scoped access.',
 15),

('Validation Tools',
 'Internal tooling to validate assessment question quality, ACSF level calibration, and mapping accuracy before publishing.',
 'needs_review', 'low',
 '["ACSF", "Compliance"]',
 'ValidationPage.tsx.',
 16),

('RTO Settings & Configuration',
 'Per-RTO settings including aXcelerate API credentials, LLM API key, email config, and branding. All secrets stored server-side via edge functions.',
 'needs_review', 'medium',
 '["aXcelerate", "API"]',
 'SettingsPage.tsx. Secrets: save-axcelerate-secrets, save-llm-secret, save-email-secret.',
 17)

ON CONFLICT DO NOTHING;
