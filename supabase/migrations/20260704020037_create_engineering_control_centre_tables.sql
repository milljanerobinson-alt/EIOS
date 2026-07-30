
-- =========================================================
-- Engineering Control Centre (ECC) — Phase 1 Foundation
-- =========================================================

-- Production Readiness snapshots
CREATE TABLE ecc_production_readiness (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  readiness_pct integer NOT NULL DEFAULT 0,
  critical_backlog_pct integer NOT NULL DEFAULT 0,
  high_priority_pct integer NOT NULL DEFAULT 0,
  architecture_review_pct integer NOT NULL DEFAULT 0,
  security_review_pct integer NOT NULL DEFAULT 0,
  performance_review_pct integer NOT NULL DEFAULT 0,
  manual_testing_pct integer NOT NULL DEFAULT 0,
  regression_testing_pct integer NOT NULL DEFAULT 0,
  release_docs_pct integer NOT NULL DEFAULT 0,
  launch_blockers_pct integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_production_readiness ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_pready_select" ON ecc_production_readiness FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_pready_insert" ON ecc_production_readiness FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_pready_update" ON ecc_production_readiness FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_pready_delete" ON ecc_production_readiness FOR DELETE TO authenticated USING (true);

-- Backlog Items
CREATE TABLE ecc_backlog_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  risk text CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'awaiting_review', 'completed', 'deferred', 'cancelled')),
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  dependencies text[] DEFAULT '{}',
  estimated_effort text,
  actual_effort text,
  release_target text,
  testing_status text DEFAULT 'pending' CHECK (testing_status IN ('pending', 'in_progress', 'passed', 'failed', 'skipped')),
  documentation_complete boolean NOT NULL DEFAULT false,
  architecture_reviewed boolean NOT NULL DEFAULT false,
  acceptance_criteria text,
  regression_tests text,
  implementation_notes text,
  batch text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_backlog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_backlog_select" ON ecc_backlog_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_backlog_insert" ON ecc_backlog_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_backlog_update" ON ecc_backlog_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_backlog_delete" ON ecc_backlog_items FOR DELETE TO authenticated USING (true);

-- Active Work Sessions
CREATE TABLE ecc_active_work (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  current_batch text,
  current_sprint text,
  current_prompt text,
  files_modified text[] DEFAULT '{}',
  estimated_completion text,
  blockers text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_active_work ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_active_select" ON ecc_active_work FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_active_insert" ON ecc_active_work FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_active_update" ON ecc_active_work FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_active_delete" ON ecc_active_work FOR DELETE TO authenticated USING (true);

-- QA Testing Reports
CREATE TABLE ecc_testing_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  test_date date NOT NULL DEFAULT CURRENT_DATE,
  version text,
  build text,
  environment text DEFAULT 'production',
  tester text,
  feature text,
  test_type text NOT NULL DEFAULT 'manual' CHECK (test_type IN ('manual', 'regression', 'integration', 'performance', 'security', 'uat')),
  result text NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'passed', 'failed', 'blocked')),
  summary text,
  checklist jsonb NOT NULL DEFAULT '[]',
  sql_used text,
  evidence jsonb NOT NULL DEFAULT '[]',
  issues_found text,
  backlog_item_ids uuid[] DEFAULT '{}',
  retest_required boolean NOT NULL DEFAULT false,
  retest_completed boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_testing_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_testing_select" ON ecc_testing_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_testing_insert" ON ecc_testing_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_testing_update" ON ecc_testing_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_testing_delete" ON ecc_testing_reports FOR DELETE TO authenticated USING (true);

-- Test Library
CREATE TABLE ecc_test_library (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  test_type text NOT NULL DEFAULT 'manual' CHECK (test_type IN ('sql', 'regression', 'smoke', 'api', 'e2e', 'manual')),
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_test_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_testlib_select" ON ecc_test_library FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_testlib_insert" ON ecc_test_library FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_testlib_update" ON ecc_test_library FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_testlib_delete" ON ecc_test_library FOR DELETE TO authenticated USING (true);

-- Regression Test Suites
CREATE TABLE ecc_regression_suites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  steps jsonb NOT NULL DEFAULT '[]',
  tags text[] NOT NULL DEFAULT '{}',
  last_run_at timestamptz,
  last_result text CHECK (last_result IN ('passed', 'failed', 'partial')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_regression_suites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_regsuites_select" ON ecc_regression_suites FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_regsuites_insert" ON ecc_regression_suites FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_regsuites_update" ON ecc_regression_suites FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_regsuites_delete" ON ecc_regression_suites FOR DELETE TO authenticated USING (true);

-- Releases
CREATE TABLE ecc_releases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version text NOT NULL,
  release_date date,
  environment text DEFAULT 'production',
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'released', 'rolled_back')),
  release_notes text,
  features text[] DEFAULT '{}',
  bug_fixes text[] DEFAULT '{}',
  breaking_changes text,
  db_migrations text[] DEFAULT '{}',
  rollback_plan text,
  approval_checklist jsonb NOT NULL DEFAULT '{}',
  deployment_notes text,
  known_issues text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_releases_select" ON ecc_releases FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_releases_insert" ON ecc_releases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_releases_update" ON ecc_releases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_releases_delete" ON ecc_releases FOR DELETE TO authenticated USING (true);

-- Architecture Reviews
CREATE TABLE ecc_architecture_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  review_type text NOT NULL DEFAULT 'architecture' CHECK (review_type IN ('architecture', 'security', 'performance', 'resilience', 'scalability', 'database', 'api')),
  review_date date NOT NULL DEFAULT CURRENT_DATE,
  reviewer text,
  summary text,
  recommendations text,
  completed_items text[] DEFAULT '{}',
  outstanding_items text[] DEFAULT '{}',
  backlog_item_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_architecture_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_arch_select" ON ecc_architecture_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_arch_insert" ON ecc_architecture_reviews FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_arch_update" ON ecc_architecture_reviews FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_arch_delete" ON ecc_architecture_reviews FOR DELETE TO authenticated USING (true);

-- Technical Documentation
CREATE TABLE ecc_documentation (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  doc_type text NOT NULL DEFAULT 'general',
  content text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_documentation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_docs_select" ON ecc_documentation FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_docs_insert" ON ecc_documentation FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_docs_update" ON ecc_documentation FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_docs_delete" ON ecc_documentation FOR DELETE TO authenticated USING (true);

-- AI Collaboration Journal
CREATE TABLE ecc_ai_journal (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  ai_platform text DEFAULT 'Claude',
  title text NOT NULL,
  objective text,
  prompt_used text,
  summary text,
  outcome text,
  files_modified text[] DEFAULT '{}',
  backlog_items_created text[] DEFAULT '{}',
  decisions_made text[] DEFAULT '{}',
  follow_up_actions text[] DEFAULT '{}',
  related_links text[] DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_ai_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_journal_select" ON ecc_ai_journal FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_journal_insert" ON ecc_ai_journal FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_journal_update" ON ecc_ai_journal FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_journal_delete" ON ecc_ai_journal FOR DELETE TO authenticated USING (true);

-- Decisions Log
CREATE TABLE ecc_decisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  context text,
  options_considered text,
  decision text,
  reasoning text,
  decision_date date NOT NULL DEFAULT CURRENT_DATE,
  impact text,
  linked_documents text[] DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_decisions_select" ON ecc_decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_decisions_insert" ON ecc_decisions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_decisions_update" ON ecc_decisions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_decisions_delete" ON ecc_decisions FOR DELETE TO authenticated USING (true);

-- Risk Register
CREATE TABLE ecc_risks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  likelihood text NOT NULL DEFAULT 'medium' CHECK (likelihood IN ('low', 'medium', 'high', 'critical')),
  impact text NOT NULL DEFAULT 'medium' CHECK (impact IN ('low', 'medium', 'high', 'critical')),
  mitigation text,
  owner text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigated', 'accepted', 'closed')),
  review_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ecc_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_risks_select" ON ecc_risks FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_risks_insert" ON ecc_risks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_risks_update" ON ecc_risks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_risks_delete" ON ecc_risks FOR DELETE TO authenticated USING (true);

-- Indexes for common query patterns
CREATE INDEX idx_ecc_backlog_priority ON ecc_backlog_items (priority);
CREATE INDEX idx_ecc_backlog_status ON ecc_backlog_items (status);
CREATE INDEX idx_ecc_testing_result ON ecc_testing_reports (result);
CREATE INDEX idx_ecc_testing_date ON ecc_testing_reports (test_date DESC);
CREATE INDEX idx_ecc_releases_status ON ecc_releases (status);
CREATE INDEX idx_ecc_journal_date ON ecc_ai_journal (session_date DESC);
CREATE INDEX idx_ecc_pready_date ON ecc_production_readiness (snapshot_date DESC);
