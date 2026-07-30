
-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Engineering & Operations Centre (EOC)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ecc_product_features (
  feature_id, name, category, sub_category, description, purpose,
  status, priority, release_version, implementation_date,
  implementation_source, source_file, developer, testing_status, production_ready,
  database_changes, ui_changes, documentation_status, notes, tags
) VALUES

('FEAT-130', 'Engineering & Operations Centre (EOC)', 'Engineering Control Centre', 'Core',
 'Full Engineering Operating System embedded in the admin portal. Provides: Product hierarchy, Vision, Roadmap, Milestones, Phases, Backlog, Release Candidates, QA, Architecture, Documentation, AI Journal, Decision Register, Standards, Timeline, Engineering Releases.',
 'Act as the single source of truth for all engineering activity on LLN+D — from product strategy through to production releases.',
 'implemented', 'critical', 'v0.3', '2026-07-04 02:00:37+00',
 'Component + Migration', 'src/pages/EngineeringControlCentrePage.tsx', 'AI', 'requires_review', true,
 '20+ ecc_* tables across all phases',
 'EngineeringControlCentrePage — full EOS with sidebar navigation',
 'partial', 'Introduced Phase 1, expanded through Phase 3', ARRAY['ecc', 'eos', 'engineering']),

('FEAT-131', 'EOC Start Phase Wizard', 'Engineering Control Centre', 'Workflow',
 'Guided wizard to start a new engineering phase. Captures: phase name, description, linked backlog items, engineer, optional target date. On confirmation: creates Release Candidate, links backlog items, creates AI Journal entry, sets RC to Active.',
 'Reduce phase setup friction by automating workspace creation.',
 'implemented', 'high', 'v0.3', '2026-07-04 04:37:42+00',
 'Component', 'src/pages/ecc/ECCStartPhaseWizard.tsx', 'AI', 'requires_review', true,
 'ecc_release_candidates (created), ecc_ai_journal (created), ecc_engineering_audit (events)',
 'ECCStartPhaseWizard — modal wizard',
 'partial', NULL, ARRAY['ecc', 'wizard', 'phase', 'automation']),

('FEAT-132', 'EOC Release Centre', 'Engineering Control Centre', 'Releases',
 'Comprehensive release candidate management. Each RC has: checklist with historical exception support, linked backlog items, testing reports, ADRs, documentation, AI journal, verification workflow, evidence-driven validation, archive workflow, and workflow timeline.',
 'Manage and verify each engineering release with full evidence documentation.',
 'implemented', 'critical', 'v0.3', '2026-07-04 02:12:22+00',
 'Component', 'src/pages/ecc/ECCReleaseCentrePage.tsx', 'AI', 'requires_review', true,
 'ecc_release_candidates (checklist_items, linked_*_ids, phase_id), ecc_engineering_audit',
 'ECCReleaseCentrePage — full RC management UI',
 'partial', 'Largest page in the project (~93KB)', ARRAY['ecc', 'release', 'rc', 'checklist']),

('FEAT-133', 'EOC Backlog', 'Engineering Control Centre', 'Planning',
 'Full backlog management with Kanban-style board. Items have: title, description, priority, status, acceptance criteria, regression tests, linked QA/release/decision IDs, notes, tags, dependencies, estimated effort.',
 'Track all engineering work items in a structured, queryable backlog.',
 'implemented', 'high', 'v0.1', '2026-07-04 02:00:37+00',
 'Component', 'src/pages/ecc/ECCBacklogPage.tsx', 'AI', 'requires_review', true,
 'ecc_backlog_items',
 'ECCBacklogPage — Kanban board with drag/drop',
 'partial', NULL, ARRAY['ecc', 'backlog', 'kanban']),

('FEAT-134', 'EOC QA & Testing', 'Engineering Control Centre', 'Quality',
 'Testing report management with suites, test cases, results (passed/failed/observations), and linking to release candidates.',
 'Maintain a formal testing record for each release.',
 'implemented', 'high', 'v0.2', '2026-07-04 02:00:37+00',
 'Component', 'src/pages/ecc/ECCQAPage.tsx', 'AI', 'requires_review', true,
 'ecc_testing_reports, ecc_regression_suites, ecc_test_library',
 'ECCQAPage',
 'partial', NULL, ARRAY['ecc', 'qa', 'testing']),

('FEAT-135', 'EOC Architecture (ADR Register)', 'Engineering Control Centre', 'Architecture',
 'Architecture Decision Record (ADR) register. Each ADR documents: context, decision, rationale, consequences, alternatives, reviewer, status (draft/proposed/accepted/deprecated).',
 'Maintain a permanent, searchable record of all architectural decisions.',
 'implemented', 'high', 'v0.2', '2026-07-04 02:00:37+00',
 'Component', 'src/pages/ecc/ECCArchitecturePage.tsx', 'AI', 'requires_review', true,
 'ecc_architecture_reviews',
 'ECCArchitecturePage — ADR list and detail',
 'partial', 'ADR-001 seeded covering EOC core architecture', ARRAY['ecc', 'adr', 'architecture']),

('FEAT-136', 'EOC Documentation', 'Engineering Control Centre', 'Documentation',
 'Documentation management for engineering records. Stores: EOC Phase Completion Reports, technical specs, design documents. Linked to release candidates for traceability.',
 'Maintain a permanent, structured engineering documentation archive.',
 'implemented', 'high', 'v0.2', '2026-07-04 02:00:37+00',
 'Component', 'src/pages/ecc/ECCDocumentationPage.tsx', 'AI', 'requires_review', true,
 'ecc_documentation',
 'ECCDocumentationPage — document list and editor',
 'partial',
 'Phase 1, 2, 3 completion reports already seeded', ARRAY['ecc', 'documentation', 'reports']),

('FEAT-137', 'EOC AI Collaboration Journal', 'Engineering Control Centre', 'Journal',
 'Session-based AI collaboration log. Each entry records: session date, AI platform, objective, summary, outcome, files modified, decisions made, follow-up actions, lessons learned, DB migrations, edge functions. Linked to release candidates.',
 'Preserve the history of AI-assisted engineering decisions for knowledge management and audit.',
 'implemented', 'high', 'v0.2', '2026-07-04 02:00:37+00',
 'Component', 'src/pages/ecc/ECCAIJournalPage.tsx', 'AI', 'requires_review', true,
 'ecc_ai_journal',
 'ECCAIJournalPage — journal entries with rich fields',
 'partial', NULL, ARRAY['ecc', 'journal', 'ai']),

('FEAT-138', 'EOC Decision Register', 'Engineering Control Centre', 'Governance',
 'Decision log for engineering choices. Each decision has: title, category, date, decision, rationale, linked ADRs, linked RCs, status, reviewer.',
 'Capture the reasoning behind significant engineering and product decisions.',
 'implemented', 'medium', 'v0.2', '2026-07-04 02:00:37+00',
 'Component', 'src/pages/ecc/ECCDecisionLogPage.tsx', 'AI', 'requires_review', true,
 'ecc_decisions',
 'ECCDecisionLogPage',
 'partial', NULL, ARRAY['ecc', 'decisions', 'governance']),

('FEAT-139', 'EOC Engineering Standards', 'Engineering Control Centre', 'Standards',
 '15 codified engineering standards covering code quality, testing, documentation, security, performance, etc. Each standard has: code, title, description, category, version, status, content, examples.',
 'Provide an authoritative reference for engineering best practices applied to LLN+D.',
 'implemented', 'high', 'v0.3', '2026-07-04 08:21:07+00',
 'Migration + Component', 'src/pages/ecc/ECCStandardsPage.tsx', 'AI', 'requires_review', true,
 'ecc_engineering_standards (15 standards seeded)',
 'ECCStandardsPage — standards catalogue',
 'partial', NULL, ARRAY['ecc', 'standards', 'engineering']),

('FEAT-140', 'EOC Timeline', 'Engineering Control Centre', 'History',
 'Chronological engineering workflow timeline for each release candidate. Shows: RC Created, Backlog Linked, Journal Started, Testing Added, ADR Added, Report Generated, Verified, Archived. Includes date, time, actor.',
 'Provide a clean visual history of every engineering event in chronological order.',
 'implemented', 'medium', 'v0.3', '2026-07-04 04:37:42+00',
 'Component', 'src/pages/ecc/ECCTimelinePage.tsx', 'AI', 'requires_review', true,
 'ecc_engineering_audit',
 'ECCTimelinePage',
 'partial', NULL, ARRAY['ecc', 'timeline', 'history']),

('FEAT-141', 'EOC Project Vision (Compass)', 'Engineering Control Centre', 'Vision',
 'Product Vision board for LLN+D. Captures: mission statement, vision statement, core values, strategic goals, target market, success metrics.',
 'Maintain a permanent record of the product vision to guide all engineering decisions.',
 'implemented', 'medium', 'v0.1', '2026-07-01 09:08:00+00',
 'Component + Migration', 'src/pages/ecc/ECCProjectCompassPage.tsx', 'AI', 'requires_review', true,
 'ecc_project_compass, builder_settings (vision_card)',
 'ECCProjectCompassPage',
 'partial', NULL, ARRAY['ecc', 'vision', 'compass']),

('FEAT-142', 'EOC Product Hierarchy (Product/Roadmap/Milestones/Phases)', 'Engineering Control Centre', 'Product Hierarchy',
 'Full product hierarchy: Product → Roadmap Items → Milestones → Phases → Release Candidates. Each level displays progress rolled up from linked RCs. CRUD for all levels. Progress bars computed from linked RC checklist states.',
 'Provide a strategic product management layer above individual release candidates.',
 'implemented', 'high', 'v0.3', '2026-07-04 11:03:34+00',
 'Migration + Component', 'src/pages/ecc/ECCProductPage.tsx', 'AI', 'requires_review', true,
 'ecc_product, ecc_roadmap_items, ecc_milestones, ecc_phases; ecc_release_candidates.phase_id FK',
 'ECCProductPage, ECCRoadmapPage, ECCMilestonesPage, ECCPhasesPage',
 'partial', 'Added in Phase 3 architecture refactor', ARRAY['ecc', 'product', 'roadmap', 'milestones', 'phases']),

('FEAT-143', 'EOC RC Validation Engine', 'Engineering Control Centre', 'Validation',
 'Evidence-driven validation engine for Release Candidates. Computes checklist state from linked evidence (backlog items, testing reports, docs, journal, ADRs). Blocks RC verification until all required evidence is present. Supports Historical Exceptions.',
 'Ensure every release is backed by sufficient evidence before being marked verified.',
 'implemented', 'critical', 'v0.3', '2026-07-04 04:37:42+00',
 'Library', 'src/lib/rcValidation.ts', 'AI', 'requires_review', true,
 NULL,
 'Used by ECCReleaseCentrePage to compute live checklist',
 'partial', 'Historical Exceptions approved by Millie Robinson for RC-001', ARRAY['ecc', 'validation', 'rc', 'evidence'])

ON CONFLICT (feature_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Infrastructure
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ecc_product_features (
  feature_id, name, category, sub_category, description, purpose,
  status, priority, release_version, implementation_date,
  implementation_source, source_file, developer, testing_status, production_ready,
  database_changes, documentation_status, notes, tags
) VALUES

('FEAT-150', 'pg_cron Scheduled Jobs', 'Infrastructure', 'Scheduling',
 'Two pg_cron jobs: email queue sweep (hourly at :05) and aXcelerate write-back queue sweep (hourly at :10). Both call edge functions with a cron secret header for authentication.',
 'Ensure queued emails and aXcelerate write-backs are processed automatically without manual intervention.',
 'implemented', 'critical', 'v0.2', '2026-07-01 20:07:35+00',
 'Scheduled Job', 'supabase/migrations/20260701200735_enable_pg_cron_and_schedule_queue_sweeps.sql', 'AI', 'requires_review', true,
 'pg_cron, pg_net extensions enabled; cron jobs registered',
 'partial', 'Fixed in 20260701201005 to use CRON_SECRET env var', ARRAY['cron', 'scheduling', 'infrastructure']),

('FEAT-151', 'Supabase Row Level Security (RLS)', 'Infrastructure', 'Security',
 'RLS enabled on every user-facing table. Four patterns: staff full CRUD, token-scoped quiz access (x-quiz-token header), anon read for public data, admin-only. get_my_role() SECURITY DEFINER function prevents RLS recursion.',
 'Enforce data access boundaries at the database level — no frontend code can bypass these rules.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Migration', 'supabase/migrations/20260628082236_fix_rls_security_policies.sql', 'AI', 'requires_review', true,
 'RLS on all tables; get_my_role() function; prevent_role_escalation() trigger',
 'partial', 'RLS recursion fixed in 20260629100049', ARRAY['security', 'rls', 'database', 'infrastructure']),

('FEAT-152', 'React + Vite + TypeScript Stack', 'Infrastructure', 'Frontend',
 'Frontend built with React 18, Vite 5, TypeScript 5, Tailwind CSS 3, Lucide React icons. Hash-based client-side routing (no router library). All rendering client-side.',
 'Fast, type-safe, maintainable frontend with zero runtime dependencies.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Configuration', 'package.json, vite.config.ts, tailwind.config.js', 'AI', 'requires_review', true,
 NULL,
 'partial', 'Bundle warning: chunk > 500KB (normal for SPA)', ARRAY['frontend', 'react', 'vite', 'typescript', 'tailwind']),

('FEAT-153', 'Supabase Backend (DB + Auth + Edge Functions)', 'Infrastructure', 'Backend',
 'Supabase provides: PostgreSQL database, Supabase Auth (email/password + OAuth), Deno Edge Functions, real-time subscriptions, Row Level Security. All backend logic lives in edge functions or DB triggers.',
 'Provide a fully managed, scalable backend with zero server management.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Configuration', '.env, supabase/functions/', 'AI', 'requires_review', true,
 NULL,
 'partial', NULL, ARRAY['supabase', 'backend', 'database', 'infrastructure'])

ON CONFLICT (feature_id) DO NOTHING;
