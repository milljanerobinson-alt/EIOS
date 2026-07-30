
-- ─────────────────────────────────────────────────────────────────────────────
-- Seed feature relationships (key dependencies in the platform)
-- ─────────────────────────────────────────────────────────────────────────────

-- Auth underpins almost everything in admin portal
INSERT INTO ecc_feature_relationships (from_feature_id, to_feature_id, relationship_type, notes) VALUES
('FEAT-001', 'FEAT-005', 'related',    'Email/password login relies on RBAC to determine portal access'),
('FEAT-003', 'FEAT-001', 'depends_on', 'OTP MFA triggers after successful email/password login'),
('FEAT-003', 'FEAT-007', 'depends_on', 'OTP state (30-day TTL) managed via AuthContext'),
('FEAT-005', 'FEAT-007', 'depends_on', 'RBAC enforced via useAuth() hook throughout the app'),
('FEAT-005', 'FEAT-151', 'depends_on', 'Role-Based Access Control backed by DB-level RLS policies'),

-- Assessment engine dependencies
('FEAT-013', 'FEAT-010', 'depends_on', 'LLN portal loads questions from database-driven engine'),
('FEAT-013', 'FEAT-011', 'depends_on', 'LLN portal uses the 75-question LLN bank'),
('FEAT-013', 'FEAT-015', 'depends_on', 'Declaration must be accepted before quiz begins'),
('FEAT-013', 'FEAT-040', 'depends_on', 'Invitation token gates portal access'),
('FEAT-014', 'FEAT-010', 'depends_on', 'Digital portal uses database-driven engine'),
('FEAT-014', 'FEAT-012', 'depends_on', 'Digital portal uses the 21-question Digital bank'),
('FEAT-014', 'FEAT-015', 'depends_on', 'Declaration required before digital assessment'),
('FEAT-014', 'FEAT-040', 'depends_on', 'Token-gated via invitation system'),
('FEAT-017', 'FEAT-013', 'depends_on', 'Completion handler fires after LLN assessment finishes'),
('FEAT-017', 'FEAT-014', 'depends_on', 'Completion handler fires after Digital assessment finishes'),
('FEAT-017', 'FEAT-044', 'depends_on', 'Completion handler computes course recommendation'),
('FEAT-017', 'FEAT-050', 'depends_on', 'Completion handler calls support plan generator'),
('FEAT-017', 'FEAT-073', 'depends_on', 'Completion handler queues aXcelerate write-back'),
('FEAT-017', 'FEAT-080', 'depends_on', 'Completion handler queues admin notification email'),
('FEAT-018', 'FEAT-040', 'depends_on', 'Student landing page loads via invitation token'),

-- Qualification → ACSF chain
('FEAT-030', 'FEAT-031', 'depends_on', 'Qualification management uses the 45-qual ACSF library for defaults'),
('FEAT-030', 'FEAT-032', 'depends_on', 'Qualification management triggers UoC auto-mapping engine'),
('FEAT-032', 'FEAT-033', 'depends_on', 'UoC mapping engine queries the 100+ UoC library'),
('FEAT-032', 'FEAT-034', 'depends_on', 'UoC engine can call LLM API to extract skills from novel units'),
('FEAT-036', 'FEAT-035', 'depends_on', 'EAEE analysis engine matches against ACSF indicator library'),
('FEAT-037', 'FEAT-032', 'depends_on', 'ACSF evidence page shows output from the mapping engine'),
('FEAT-044', 'FEAT-030', 'depends_on', 'Course recommendation compares outcomes against qual requirements'),

-- Candidate & invitation chain
('FEAT-040', 'FEAT-005', 'depends_on', 'Invitation management requires authenticated trainer/admin'),
('FEAT-041', 'FEAT-043', 'depends_on', 'Activity timeline reads from lifecycle state machine'),
('FEAT-042', 'FEAT-040', 'depends_on', 'Email reminders are linked to invitation records'),
('FEAT-042', 'FEAT-080', 'depends_on', 'Reminder system uses the email queue infrastructure'),
('FEAT-043', 'FEAT-070', 'depends_on', 'Lifecycle state machine is populated by inbound sync engine'),
('FEAT-045', 'FEAT-044', 'related',    'Trainer override supersedes the automated recommendation'),

-- Support & Intervention
('FEAT-050', 'FEAT-017', 'depends_on', 'Support plan generated inside the assessment completion handler'),
('FEAT-051', 'FEAT-050', 'depends_on', 'Support plan editor loads plans created by FEAT-050'),
('FEAT-060', 'FEAT-044', 'depends_on', 'Interventions opened when recommendation is Not Yet Suitable'),

-- aXcelerate chain
('FEAT-070', 'FEAT-077', 'depends_on', 'Inbound sync needs aXcelerate credentials in settings'),
('FEAT-071', 'FEAT-070', 'depends_on', 'Bulk sync calls the inbound sync engine per contact'),
('FEAT-071', 'FEAT-150', 'depends_on', 'Bulk sync triggered by pg_cron scheduled job'),
('FEAT-072', 'FEAT-070', 'depends_on', 'Webhook triggers the same inbound sync engine'),
('FEAT-073', 'FEAT-102', 'depends_on', 'Write-back queue uses exponential backoff recovery'),
('FEAT-073', 'FEAT-150', 'depends_on', 'Write-back queue swept by pg_cron'),
('FEAT-074', 'FEAT-073', 'depends_on', 'Portfolio upload is a write-back queue event type'),
('FEAT-075', 'FEAT-077', 'depends_on', 'Qualification import needs aXcelerate credentials'),
('FEAT-076', 'FEAT-077', 'depends_on', 'Connection test validates stored credentials'),

-- Email chain
('FEAT-080', 'FEAT-081', 'depends_on', 'Email queue uses Resend API key stored in settings'),
('FEAT-080', 'FEAT-150', 'depends_on', 'Email queue swept by pg_cron scheduled job'),
('FEAT-080', 'FEAT-102', 'depends_on', 'Email queue uses backoff and stuck-recovery logic'),

-- Billing
('FEAT-091', 'FEAT-090', 'depends_on', 'Usage tracking is part of Stripe subscription billing'),

-- Compliance
('FEAT-100', 'FEAT-101', 'depends_on', 'Compliance reports include audit trail events'),
('FEAT-100', 'FEAT-044', 'depends_on', 'Compliance report includes course recommendation'),
('FEAT-100', 'FEAT-050', 'depends_on', 'Compliance report includes support plans'),
('FEAT-100', 'FEAT-060', 'depends_on', 'Compliance report includes intervention cases'),
('FEAT-101', 'FEAT-151', 'depends_on', 'Audit trail protected by Row Level Security'),

-- Infrastructure
('FEAT-151', 'FEAT-005', 'depends_on', 'RLS policies use get_my_role() which reads the profiles table'),
('FEAT-150', 'FEAT-080', 'used_by',    'pg_cron sweeps the email queue'),
('FEAT-150', 'FEAT-073', 'used_by',    'pg_cron sweeps the aXcelerate write-back queue'),

-- EOC
('FEAT-132', 'FEAT-143', 'depends_on', 'Release centre uses the RC validation engine'),
('FEAT-131', 'FEAT-132', 'related',    'Start Phase Wizard creates the Release Candidate'),
('FEAT-133', 'FEAT-132', 'related',    'Backlog items are linked to Release Candidates'),
('FEAT-134', 'FEAT-132', 'related',    'Test reports linked to Release Candidates'),
('FEAT-135', 'FEAT-132', 'related',    'ADRs linked to Release Candidates'),
('FEAT-136', 'FEAT-132', 'related',    'Documentation linked to Release Candidates'),
('FEAT-137', 'FEAT-132', 'related',    'AI Journal entries linked to Release Candidates'),
('FEAT-140', 'FEAT-143', 'depends_on', 'Timeline reads from engineering_audit log, written by RC validation engine'),
('FEAT-142', 'FEAT-132', 'parent',     'Product hierarchy (Product→Roadmap→Milestones→Phases) contains Release Candidates'),
('FEAT-130', 'FEAT-131', 'parent',     'EOC umbrella contains the Start Phase Wizard'),
('FEAT-130', 'FEAT-132', 'parent',     'EOC umbrella contains the Release Centre'),
('FEAT-130', 'FEAT-133', 'parent',     'EOC umbrella contains the Backlog'),
('FEAT-130', 'FEAT-142', 'parent',     'EOC umbrella contains Product Hierarchy')

ON CONFLICT (from_feature_id, to_feature_id, relationship_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: feature timeline events derived from known implementation dates
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ecc_feature_timeline (feature_id, event_type, event_label, description, actor, event_date)
SELECT
  feature_id,
  'created',
  'Feature Implemented',
  'Initial implementation and deployment to production.',
  'AI (Claude)',
  implementation_date
FROM ecc_product_features
WHERE implementation_date IS NOT NULL
  AND status = 'implemented';

INSERT INTO ecc_feature_timeline (feature_id, event_type, event_label, description, actor, event_date)
SELECT
  feature_id,
  'docs_updated',
  'Product Audit Registered',
  'Feature catalogued in the EOC Product Audit registry.',
  'AI (Claude)',
  '2026-07-04 15:30:00+00'
FROM ecc_product_features
WHERE status = 'implemented';
