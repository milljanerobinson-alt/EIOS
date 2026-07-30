
-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Admin Portal & Settings
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ecc_product_features (
  feature_id, name, category, sub_category, description, purpose,
  status, priority, release_version, implementation_date,
  implementation_source, source_file, developer, testing_status, production_ready,
  database_changes, api_changes, ui_changes, compliance_impact, audit_impact, security_impact,
  documentation_status, notes, tags
) VALUES

('FEAT-110', 'Admin Dashboard', 'Admin Portal', 'Dashboard',
 'Real-time admin dashboard with 9 metric cards (Total Candidates, Sent, Opened, In Progress, Completed, Overdue, Support Plans, Open Interventions, Average Score), assessment funnel, live connection status, and real-time Supabase subscriptions.',
 'Give administrators an at-a-glance view of all assessment activity.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/DashboardPage.tsx', 'AI', 'requires_review', true,
 'assessment_invitations, support_plans, intervention_cases (real-time subscriptions)',
 NULL, 'DashboardPage — full real-time dashboard',
 NULL, NULL, NULL, 'partial', NULL, ARRAY['admin', 'dashboard', 'realtime']),

('FEAT-111', 'Admin Layout & Navigation', 'Admin Portal', 'Navigation',
 'Sticky sidebar navigation with 16 menu items, hamburger menu for mobile, user profile section with avatar and sign-out. Responsive across all viewport sizes.',
 'Provide a consistent, navigable admin interface.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/components/AdminLayout.tsx', 'AI', 'requires_review', true,
 NULL, NULL, 'AdminLayout.tsx — wraps all admin pages',
 NULL, NULL, NULL, 'partial', NULL, ARRAY['admin', 'layout', 'navigation']),

('FEAT-112', 'RTO Settings & Configuration', 'Admin Portal', 'Settings',
 'Organization settings including: RTO name, logo URL, primary/secondary colors, contact email, support phone, RTO number. Stored in settings KV table. Displayed on candidate-facing pages and compliance reports.',
 'Allow RTOs to brand the platform and configure organisation-wide defaults.',
 'implemented', 'medium', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/SettingsPage.tsx', 'AI', 'requires_review', true,
 'settings table (rto_name, logo_url, primary_color, rto_number, etc.)', NULL,
 'SettingsPage — full configuration UI',
 NULL, NULL, NULL, 'partial', NULL, ARRAY['settings', 'rto', 'branding', 'configuration']),

('FEAT-113', 'Results & Analytics Page', 'Admin Portal', 'Results',
 'View all completed assessments with search, filter by recommendation, and drill-down to full response detail. Shows all question responses, ACSF domain breakdowns, individual assessment scores, and recommendation logic.',
 'Allow trainers to review detailed assessment results and make informed decisions.',
 'implemented', 'high', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/ResultsPage.tsx', 'AI', 'requires_review', true,
 'assessment_invitations, invitation_assessments, assessment_responses, assessment_questions',
 NULL, 'ResultsPage — search, filter, drill-down, override',
 'ASQA: Results must be accessible for review', NULL, NULL,
 'partial', NULL, ARRAY['results', 'analytics', 'admin']),

('FEAT-114', 'Audit Log Viewer', 'Admin Portal', 'Audit',
 'Searchable, filterable viewer for the complete system audit trail. Filter by category, date range, event type, actor. Displays event type, description, timestamp, actor, severity.',
 'Allow administrators to review and investigate the full system audit history.',
 'implemented', 'high', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/AuditLogPage.tsx', 'AI', 'requires_review', true,
 'audit_trail', NULL, 'AuditLogPage — full viewer',
 'ASQA: Access to audit trail required', NULL, NULL,
 'partial', NULL, ARRAY['audit', 'admin', 'compliance']),

('FEAT-115', 'Email Activity Viewer', 'Admin Portal', 'Email',
 'View email queue status: queued, sending, sent, failed. Filter by invitation or email type. Manual resend capability for failed emails.',
 'Allow administrators to monitor and manage email delivery.',
 'implemented', 'medium', 'v0.1', '2026-07-01 10:27:51+00',
 'Component', 'src/pages/EmailActivityPage.tsx', 'AI', 'requires_review', true,
 'email_queue', NULL, 'EmailActivityPage',
 NULL, NULL, NULL, 'partial', NULL, ARRAY['email', 'admin', 'monitoring']),

('FEAT-116', 'aXcelerate Sync Log Viewer', 'Admin Portal', 'aXcelerate',
 'View all aXcelerate write-back queue events: status (pending/processing/success/failed), event type, attempts, last error. Monitor integration health.',
 'Give administrators visibility into aXcelerate integration status.',
 'implemented', 'medium', 'v0.1', '2026-07-01 10:39:21+00',
 'Component', 'src/pages/AxcelerateLogPage.tsx', 'AI', 'requires_review', true,
 'axcelerate_writeback_queue', NULL, 'AxcelerateLogPage',
 NULL, NULL, NULL, 'partial', NULL, ARRAY['axcelerate', 'admin', 'monitoring']),

('FEAT-117', 'aXcelerate Inbound Sync Viewer', 'Admin Portal', 'aXcelerate',
 'View all inbound sync log entries from aXcelerate: contact synced, invitation created, status, errors. Monitor bulk sync health.',
 'Give administrators visibility into which aXcelerate contacts have been processed.',
 'implemented', 'medium', 'v0.2', '2026-07-02 00:21:59+00',
 'Component', 'src/pages/AxcelerateInboundPage.tsx', 'AI', 'requires_review', true,
 'axcelerate_inbound_sync_log', NULL, 'AxcelerateInboundPage',
 NULL, NULL, NULL, 'partial', NULL, ARRAY['axcelerate', 'admin', 'inbound', 'monitoring'])

ON CONFLICT (feature_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Marketing Site
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ecc_product_features (
  feature_id, name, category, sub_category, description, purpose,
  status, priority, release_version, implementation_date,
  implementation_source, source_file, developer, testing_status, production_ready,
  documentation_status, notes, tags
) VALUES

('FEAT-120', 'Marketing Home Page', 'Marketing', 'Pages',
 'Public landing page with hero section, feature highlights, pricing tiers, use-case blocks, FAQ, testimonials, and call-to-action sections.',
 'Attract and convert prospective RTO customers.',
 'implemented', 'high', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/marketing/HomePage.tsx', 'AI', 'requires_review', true,
 'partial', NULL, ARRAY['marketing', 'homepage']),

('FEAT-121', 'Marketing Features Page', 'Marketing', 'Pages',
 'Detailed feature overview page for the LLN+D platform.',
 'Showcase product capabilities to prospective customers.',
 'implemented', 'medium', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/marketing/FeaturesPage.tsx', 'AI', 'requires_review', true,
 'partial', NULL, ARRAY['marketing', 'features']),

('FEAT-122', 'Marketing Pricing Page', 'Marketing', 'Pages',
 'Public pricing page showing subscription tiers and feature comparison.',
 'Convert prospects by clearly communicating pricing options.',
 'implemented', 'high', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/marketing/PricingPage.tsx', 'AI', 'requires_review', true,
 'partial', NULL, ARRAY['marketing', 'pricing']),

('FEAT-123', 'Marketing How It Works Page', 'Marketing', 'Pages',
 'Step-by-step explanation of the assessment process for RTOs.',
 'Reduce sales friction by explaining the workflow clearly.',
 'implemented', 'medium', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/marketing/HowItWorksPage.tsx', 'AI', 'requires_review', true,
 'partial', NULL, ARRAY['marketing', 'how-it-works']),

('FEAT-124', 'Marketing About Page', 'Marketing', 'Pages',
 'Company about page for LLN+D.',
 'Build trust with prospective customers.',
 'implemented', 'low', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/marketing/AboutPage.tsx', 'AI', 'requires_review', true,
 'partial', NULL, ARRAY['marketing', 'about']),

('FEAT-125', 'Marketing Contact Page', 'Marketing', 'Pages',
 'Contact form and details page for LLN+D.',
 'Provide a contact route for prospects and customers.',
 'implemented', 'medium', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/marketing/ContactPage.tsx', 'AI', 'requires_review', true,
 'partial', NULL, ARRAY['marketing', 'contact']),

('FEAT-126', 'Marketing Resources Page', 'Marketing', 'Pages',
 'Resources and documentation page for LLN+D users.',
 'Provide self-service resources to reduce support load.',
 'implemented', 'low', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/marketing/ResourcesPage.tsx', 'AI', 'requires_review', true,
 'partial', NULL, ARRAY['marketing', 'resources'])

ON CONFLICT (feature_id) DO NOTHING;
