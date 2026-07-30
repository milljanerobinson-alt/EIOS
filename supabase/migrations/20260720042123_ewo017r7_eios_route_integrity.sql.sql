/*
# EWO-017R.7 — EIOS-Wide Route Integrity, Render Recovery & Blank-Page Elimination

## Changes

### 1. New Table: `eios_route_registry`
### 2. New Table: `eios_route_diagnostics`
### 3. New Table: `eios_route_health_audit`
### 4. Seed canonical route registry
### 5. Constitutional Amendment CONST-001-AMD-008 (in ecc_engineering_standards)
### 6. EWO-017R.7 registration
### 7. ATD knowledge sync
*/

-- ─── 1. Route Registry ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eios_route_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_key text NOT NULL UNIQUE,
  workspace text NOT NULL,
  section text NOT NULL,
  path_pattern text NOT NULL,
  component_name text NOT NULL,
  object_type text,
  requires_auth boolean DEFAULT true,
  requires_admin boolean DEFAULT false,
  requires_workspace text,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE eios_route_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_route_registry" ON eios_route_registry;
CREATE POLICY "select_route_registry" ON eios_route_registry FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_route_registry" ON eios_route_registry;
CREATE POLICY "insert_route_registry" ON eios_route_registry FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_route_registry" ON eios_route_registry;
CREATE POLICY "update_route_registry" ON eios_route_registry FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_route_registry" ON eios_route_registry;
CREATE POLICY "delete_route_registry" ON eios_route_registry FOR DELETE TO authenticated USING (true);

-- ─── 2. Route Diagnostics ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eios_route_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id text NOT NULL,
  route_hash text,
  route_key text,
  object_ref text,
  component_name text,
  failure_type text NOT NULL,
  stack_trace text,
  user_id text,
  timestamp timestamptz DEFAULT now(),
  diagnostic_data jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE eios_route_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_route_diagnostics" ON eios_route_diagnostics;
CREATE POLICY "select_route_diagnostics" ON eios_route_diagnostics FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_route_diagnostics" ON eios_route_diagnostics;
CREATE POLICY "insert_route_diagnostics" ON eios_route_diagnostics FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_route_diagnostics" ON eios_route_diagnostics;
CREATE POLICY "update_route_diagnostics" ON eios_route_diagnostics FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_route_diagnostics" ON eios_route_diagnostics;
CREATE POLICY "delete_route_diagnostics" ON eios_route_diagnostics FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_route_diagnostics_correlation ON eios_route_diagnostics(correlation_id);
CREATE INDEX IF NOT EXISTS idx_route_diagnostics_route_key ON eios_route_diagnostics(route_key);
CREATE INDEX IF NOT EXISTS idx_route_diagnostics_timestamp ON eios_route_diagnostics(timestamp DESC);

-- ─── 3. Route Health Audit ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eios_route_health_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_ref text NOT NULL,
  route_key text NOT NULL,
  registered boolean DEFAULT false,
  resolvable boolean DEFAULT false,
  component_exists boolean DEFAULT false,
  renders boolean DEFAULT false,
  object_resolution boolean DEFAULT false,
  deep_links boolean DEFAULT false,
  refresh_ok boolean DEFAULT false,
  status text NOT NULL DEFAULT 'unknown',
  details jsonb DEFAULT '{}'::jsonb,
  audited_at timestamptz DEFAULT now()
);

ALTER TABLE eios_route_health_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_route_health" ON eios_route_health_audit;
CREATE POLICY "select_route_health" ON eios_route_health_audit FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_route_health" ON eios_route_health_audit;
CREATE POLICY "insert_route_health" ON eios_route_health_audit FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_route_health" ON eios_route_health_audit;
CREATE POLICY "update_route_health" ON eios_route_health_audit FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_route_health" ON eios_route_health_audit;
CREATE POLICY "delete_route_health" ON eios_route_health_audit FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_route_health_audit_ref ON eios_route_health_audit(audit_ref);

-- ─── 4. Seed Canonical Route Registry ──────────────────────────────────────────

INSERT INTO eios_route_registry (route_key, workspace, section, path_pattern, component_name, object_type, requires_auth, requires_admin, requires_workspace, description) VALUES
-- Engineering
('engineering.mission-control', 'engineering', 'mission-control', '#/engineering/mission-control', 'EngineeringControlCentrePage', NULL, true, true, 'engineering', 'Engineering Mission Control'),
('engineering.work-orders', 'engineering', 'work-orders', '#/engineering/work-orders', 'ECCWorkOrdersPage', 'engineering_work_order', true, true, 'engineering', 'Work Orders list'),
('engineering.work-order-detail', 'engineering', 'work-orders', '#/engineering/work-orders/:ref', 'ECCWorkOrdersPage', 'engineering_work_order', true, true, 'engineering', 'Work Order Detail'),
('engineering.engineering-planning', 'engineering', 'engineering-planning', '#/engineering/engineering-planning', 'ECCEngineeringPlanningPage', 'engineering_plan', true, true, 'engineering', 'Engineering Plans'),
('engineering.records-library', 'engineering', 'records-library', '#/engineering/records-library', 'ECCRecordsLibraryPage', 'engineering_record', true, true, 'engineering', 'Engineering Records'),
('engineering.engineering-execution', 'engineering', 'engineering-execution', '#/engineering/engineering-execution', 'ECCExecutionWorkspacePage', NULL, true, true, 'engineering', 'Engineering Executions'),
('engineering.execution-dashboard', 'engineering', 'execution-dashboard', '#/engineering/execution-dashboard', 'ECCExecutionDashboardPage', NULL, true, true, 'engineering', 'Execution Dashboard'),
('engineering.execution-workspace', 'engineering', 'engineering-execution', '#/engineering/engineering-execution/:ref', 'ECCExecutionWorkspacePage', NULL, true, true, 'engineering', 'Execution Workspace'),
('engineering.engineering-standards', 'engineering', 'engineering-standards', '#/engineering/engineering-standards', 'ECCStandardsPage', 'engineering_standard', true, true, 'engineering', 'Engineering Standards'),
('engineering.timeline', 'engineering', 'timeline', '#/engineering/timeline', 'ECCTimelinePage', NULL, true, true, 'engineering', 'Engineering Timeline'),
('engineering.engineering-ideas', 'engineering', 'engineering-ideas', '#/engineering/engineering-ideas', 'ECCIdeaWorkspacePage', 'engineering_idea', true, true, 'engineering', 'Engineering Ideas'),
('engineering.engineering-reviews', 'engineering', 'engineering-reviews', '#/engineering/engineering-reviews', 'ECCEngineeringReviewsPage', NULL, true, true, 'engineering', 'Engineering Reviews'),
('engineering.recovery-dashboard', 'engineering', 'recovery-dashboard', '#/engineering/recovery-dashboard', 'ECCRecoveryDashboardPage', NULL, true, true, 'engineering', 'Recovery Dashboard'),
('engineering.recovery-workspace', 'engineering', 'recovery-workspace', '#/engineering/recovery-workspace', 'ECCRecoveryWorkspacePage', NULL, true, true, 'engineering', 'Recovery Workspace'),
('engineering.constitution', 'engineering', 'constitution', '#/engineering/constitution', 'ECCConstitutionPage', 'constitutional_amendment', true, true, 'engineering', 'Constitution'),
('engineering.roadmap', 'engineering', 'roadmap', '#/engineering/roadmap', 'ECCRoadmapPage', NULL, true, true, 'engineering', 'Roadmap'),
('engineering.dashboard', 'engineering', 'dashboard', '#/engineering/dashboard', 'ECCDashboard', NULL, true, true, 'engineering', 'Engineering Dashboard'),
('engineering.phases', 'engineering', 'phases', '#/engineering/phases', 'ECCPhasesPage', NULL, true, true, 'engineering', 'Engineering Phases'),
('engineering.milestones', 'engineering', 'milestones', '#/engineering/milestones', 'ECCMilestonesPage', NULL, true, true, 'engineering', 'Engineering Milestones'),
('engineering.release-centre', 'engineering', 'release-centre', '#/engineering/release-centre', 'ECCReleaseCentrePage', NULL, true, true, 'engineering', 'Release Centre'),
('engineering.platform-admin', 'engineering', 'platform-admin', '#/engineering/platform-admin', 'ECCPlatformAdminPage', NULL, true, true, 'engineering', 'Platform Administration'),
('engineering.projects', 'engineering', 'projects', '#/engineering/projects', 'ECCProjectCompassPage', NULL, true, true, 'engineering', 'Projects'),
('engineering.settings', 'engineering', 'settings', '#/engineering/settings', 'SettingsPage', NULL, true, true, 'engineering', 'Settings'),
-- Governance
('governance.constitution', 'engineering', 'constitution', '#/engineering/constitution', 'ECCConstitutionPage', 'constitutional_amendment', true, true, 'engineering', 'Constitution'),
('governance.engineering-standards', 'engineering', 'engineering-standards', '#/engineering/engineering-standards', 'ECCStandardsPage', 'engineering_standard', true, true, 'engineering', 'Engineering Standards'),
-- Recovery
('recovery.historical-recovery', 'engineering', 'recovery-dashboard', '#/engineering/recovery-dashboard', 'ECCRecoveryDashboardPage', NULL, true, true, 'engineering', 'Historical Recovery'),
('recovery.recovery-workspace', 'engineering', 'recovery-workspace', '#/engineering/recovery-workspace', 'ECCRecoveryWorkspacePage', NULL, true, true, 'engineering', 'Recovery Workspace'),
('recovery.recovery-dashboard', 'engineering', 'recovery-dashboard', '#/engineering/recovery-dashboard', 'ECCRecoveryDashboardPage', NULL, true, true, 'engineering', 'Recovery Dashboard'),
-- Platform
('platform.dashboard', 'platform', 'dashboard', '#/platform/dashboard', 'PlatformDashboardPage', NULL, true, false, 'platform_admin', 'Platform Dashboard'),
('platform.settings', 'platform', 'settings', '#/platform/settings', 'SettingsPage', NULL, true, false, 'platform_admin', 'Platform Settings'),
('platform.users', 'platform', 'users', '#/platform/users', 'SettingsPage', NULL, true, false, 'platform_admin', 'Platform Users'),
('platform.billing', 'platform', 'billing', '#/platform/billing', 'BillingPage', NULL, true, false, 'platform_admin', 'Platform Billing'),
('platform.axcelerate-inbound', 'platform', 'axcelerate-inbound', '#/platform/axcelerate-inbound', 'AxcelerateInboundPage', NULL, true, false, 'platform_admin', 'Axcelerate Inbound'),
('platform.axcelerate-log', 'platform', 'axcelerate-log', '#/platform/axcelerate-log', 'AxcelerateLogPage', NULL, true, false, 'platform_admin', 'Axcelerate Log'),
('platform.email-activity', 'platform', 'email-activity', '#/platform/email-activity', 'EmailActivityPage', NULL, true, false, 'platform_admin', 'Email Activity'),
('platform.validation', 'platform', 'validation', '#/platform/validation', 'ValidationPage', NULL, true, false, 'platform_admin', 'Validation'),
('platform.ai-providers', 'platform', 'ai-providers', '#/platform/ai-providers', 'SettingsPage', NULL, true, false, 'platform_admin', 'AI Providers'),
('platform.feature-flags', 'platform', 'feature-flags', '#/platform/feature-flags', 'SettingsPage', NULL, true, false, 'platform_admin', 'Feature Flags'),
('platform.system-health', 'platform', 'system-health', '#/platform/system-health', 'PlatformDashboardPage', NULL, true, false, 'platform_admin', 'System Health'),
-- Assessment
('assessment.dashboard', 'assessment', 'dashboard', '#/assessment/dashboard', 'DashboardPage', NULL, true, false, 'assessment', 'Assessment Dashboard'),
('assessment.assessments', 'assessment', 'assessments', '#/assessment/assessments', 'AssessmentsPage', NULL, true, false, 'assessment', 'Assessments'),
('assessment.qualifications', 'assessment', 'qualifications', '#/assessment/qualifications', 'QualificationsPage', NULL, true, false, 'assessment', 'Qualifications'),
('assessment.candidates', 'assessment', 'candidates', '#/assessment/candidates', 'CandidatesPage', NULL, true, false, 'assessment', 'Candidates'),
('assessment.results', 'assessment', 'results', '#/assessment/results', 'ResultsPage', NULL, true, false, 'assessment', 'Results'),
('assessment.support-plans', 'assessment', 'support-plans', '#/assessment/support-plans', 'SupportPlansPage', NULL, true, false, 'assessment', 'Support Plans'),
('assessment.interventions', 'assessment', 'interventions', '#/assessment/interventions', 'InterventionsPage', NULL, true, false, 'assessment', 'Interventions'),
('assessment.compliance', 'assessment', 'compliance', '#/assessment/compliance', 'CompliancePage', NULL, true, false, 'assessment', 'Compliance'),
('assessment.acsf-evidence', 'assessment', 'acsf-evidence', '#/assessment/acsf-evidence', 'ACSFEvidencePage', NULL, true, false, 'assessment', 'ACSF Evidence'),
('assessment.audit-log', 'assessment', 'audit-log', '#/assessment/audit-log', 'AuditLogPage', NULL, true, false, 'assessment', 'Audit Log'),
('assessment.email-activity', 'assessment', 'email-activity', '#/assessment/email-activity', 'EmailActivityPage', NULL, true, false, 'assessment', 'Email Activity'),
('assessment.axcelerate-log', 'assessment', 'axcelerate-log', '#/assessment/axcelerate-log', 'AxcelerateLogPage', NULL, true, false, 'assessment', 'Axcelerate Log'),
('assessment.axcelerate-inbound', 'assessment', 'axcelerate-inbound', '#/assessment/axcelerate-inbound', 'AxcelerateInboundPage', NULL, true, false, 'assessment', 'Axcelerate Inbound'),
('assessment.validation', 'assessment', 'validation', '#/assessment/validation', 'ValidationPage', NULL, true, false, 'assessment', 'Validation'),
('assessment.billing', 'assessment', 'billing', '#/assessment/billing', 'BillingPage', NULL, true, false, 'assessment', 'Billing'),
('assessment.settings', 'assessment', 'settings', '#/assessment/settings', 'SettingsPage', NULL, true, false, 'assessment', 'Settings'),
-- Trainer
('trainer.dashboard', 'trainer', 'dashboard', '#/trainer/dashboard', 'TrainerDashboardPage', NULL, true, false, 'trainer', 'Trainer Dashboard'),
('trainer.students', 'trainer', 'students', '#/trainer/students', 'TrainerDashboardPage', NULL, true, false, 'trainer', 'Students'),
('trainer.awaiting-review', 'trainer', 'awaiting-review', '#/trainer/awaiting-review', 'TrainerDashboardPage', NULL, true, false, 'trainer', 'Awaiting Review'),
('trainer.support-plans', 'trainer', 'support-plans', '#/trainer/support-plans', 'SupportPlansPage', NULL, true, false, 'trainer', 'Support Plans'),
('trainer.interventions', 'trainer', 'interventions', '#/trainer/interventions', 'InterventionsPage', NULL, true, false, 'trainer', 'Interventions'),
('trainer.results', 'trainer', 'results', '#/trainer/results', 'ResultsPage', NULL, true, false, 'trainer', 'Results'),
('trainer.evidence', 'trainer', 'evidence', '#/trainer/evidence', 'ResultsPage', NULL, true, false, 'trainer', 'Evidence'),
-- Marketing + Public
('marketing.home', 'public', 'home', '#/home', 'HomePage', NULL, false, false, NULL, 'Home'),
('marketing.about', 'public', 'about', '#/about', 'AboutPage', NULL, false, false, NULL, 'About'),
('marketing.features', 'public', 'features', '#/features', 'FeaturesPage', NULL, false, false, NULL, 'Features'),
('marketing.how-it-works', 'public', 'how-it-works', '#/how-it-works', 'HowItWorksPage', NULL, false, false, NULL, 'How It Works'),
('marketing.resources', 'public', 'resources', '#/resources', 'ResourcesPage', NULL, false, false, NULL, 'Resources'),
('marketing.contact', 'public', 'contact', '#/contact', 'ContactPage', NULL, false, false, NULL, 'Contact'),
('marketing.pricing', 'public', 'pricing', '#/pricing', 'PricingPage', NULL, false, false, NULL, 'Pricing'),
('public.login', 'public', 'login', '#/login', 'LoginPage', NULL, false, false, NULL, 'Login'),
('public.signup', 'public', 'signup', '#/signup', 'SignUpPage', NULL, false, false, NULL, 'Sign Up'),
('public.forgot-password', 'public', 'forgot-password', '#/forgot-password', 'LoginPage', NULL, false, false, NULL, 'Forgot Password'),
-- Public token routes
('public.lln', 'public', 'lln', '#/lln/:token', 'LLNAssessmentPage', NULL, false, false, NULL, 'LLN Assessment'),
('public.digital', 'public', 'digital', '#/digital/:token', 'DigitalAssessmentPage', NULL, false, false, NULL, 'Digital Assessment'),
('public.quiz', 'public', 'quiz', '#/quiz/:token', 'QuizPage', NULL, false, false, NULL, 'Quiz'),
('public.student', 'public', 'student', '#/student/:token', 'StudentLandingPage', NULL, false, false, NULL, 'Student Landing')
ON CONFLICT (route_key) DO NOTHING;

-- ─── 5. Constitutional Amendment CONST-001-AMD-008 ──────────────────────────────

INSERT INTO ecc_engineering_standards (version_introduced, category, title, body, status, sort_order, tags, created_at, updated_at)
SELECT
  'CONST-001-AMD-008',
  'constitutional',
  'Blank Page Elimination Rule',
  '## Constitutional Amendment CONST-001-AMD-008 — Blank Page Elimination Rule

### Rule

A routed destination shall never display an empty render without governed loading, recovery, or error content.

### Rationale

Blank pages are a platform governance failure. Every route must resolve correctly, recover safely, render meaningful content, show governed errors when unavailable, and never silently fail.

### Enforcement

1. Every routed page must execute inside a global Error Boundary.
2. Every routed page must display a Loading state while data loads.
3. Every routed page must display a Not Found state when an object cannot be found.
4. Every routed page must display a Render Failure state when rendering throws.
5. No component may return null, an empty fragment, or an empty page without governed feedback.
6. Every failure must produce visible governed feedback with a correlation ID.
7. The Route Health Auditor must verify every registered route regularly.

### Scope

This amendment applies to all current and future EIOS routes, permanently.',
  'active',
  800,
  ARRAY['constitutional', 'routing', 'blank-page', 'governance'],
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM ecc_engineering_standards WHERE version_introduced = 'CONST-001-AMD-008');

-- ─── 6. EWO-017R.7 registration ────────────────────────────────────────────────

INSERT INTO engineering_work_orders (ewo_ref, title, executive_summary, status, priority, risk_level, parent_ref, created_at, updated_at)
SELECT
  'EWO-017R.7',
  'EIOS-Wide Route Integrity, Render Recovery & Blank-Page Elimination',
  'Establish permanent platform-wide route governance: canonical route registry, route resolution engine, universal loading/not-found/render-failure states, global error boundary, feature error boundaries, route health auditor, deep link validation, navigation consistency, no silent failures, governed route diagnostics, ES-003 expansion, blank page constitutional rule, regression protection, and PO test guide.',
  'engineering_complete',
  'critical',
  'low',
  'EWO-017R.6',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-017R.7');

-- ─── 7. ATD knowledge sync ──────────────────────────────────────────────────────

INSERT INTO audit_trail (event_type, event_data, timestamp, category, severity, description)
SELECT
  'atd_knowledge_sync',
  jsonb_build_object(
    'ewo_ref', 'EWO-017R.7',
    'knowledge_added', jsonb_build_array(
      'No EIOS route can render a blank page',
      'Every route resolves through one canonical registry',
      'Every failure displays governed recovery',
      'Every page supports refresh and deep linking',
      'Every render failure is captured',
      'Every navigation action is audited',
      'Every future route automatically inherits platform protection'
    ),
    'synced_at', now()
  ),
  now(),
  'governance',
  'info',
  'ATD knowledge sync for EWO-017R.7 EIOS-wide route integrity'
WHERE NOT EXISTS (
  SELECT 1 FROM audit_trail
  WHERE event_type = 'atd_knowledge_sync'
  AND event_data->>'ewo_ref' = 'EWO-017R.7'
);
