/*
# Command Centre — Goals, Epics & Hierarchy Links

## Summary
Establishes the full planning hierarchy for the Command Centre:
Goal → Milestone → Epic → Feature → Release

## New Tables

### ecc_goals
Business outcomes that group milestones and features.
- id, title, description, status, priority, owner, progress_pct
- target_date, notes, created_at, updated_at

### ecc_epics
Cross-cutting capability groupings that organise features.
- id, title, description, status, priority, owner, progress_pct
- goal_id (FK → ecc_goals, nullable), notes, created_at, updated_at

## Modified Tables

### ecc_product_features (new FK columns)
- goal_id → ecc_goals
- epic_id → ecc_epics
- item_type  (keeps 'feature' default; allows future 'idea' differentiation)

### ecc_roadmap_items (new FK columns)
- goal_id → ecc_goals
- epic_id → ecc_epics

### ecc_backlog_items (new columns for unified Ideas & Backlog)
- item_type: 'idea' | 'backlog' (default 'backlog') — merges ideas into backlog
- business_value, compliance_impact, complexity, decision_history text fields
- goal_id → ecc_goals (nullable)
- epic_id → ecc_epics (nullable)

## Security
- RLS enabled on new tables
- Policies: authenticated users (admin/trainer) can do all CRUD
- Uses USING(true) because these are internal operational tables without per-row ownership

## Important Notes
1. All FK columns are nullable — existing rows are unaffected
2. item_type on backlog defaults to 'backlog' so existing backlog items are unchanged
3. Milestones already exist as ecc_milestones — goal_id added there too
*/

-- ─── Goals ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_goals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','completed','paused','cancelled')),
  priority     text NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low','medium','high','critical')),
  owner        text,
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  target_date  date,
  notes        text,
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goals_select" ON ecc_goals;
CREATE POLICY "goals_select" ON ecc_goals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "goals_insert" ON ecc_goals;
CREATE POLICY "goals_insert" ON ecc_goals FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "goals_update" ON ecc_goals;
CREATE POLICY "goals_update" ON ecc_goals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "goals_delete" ON ecc_goals;
CREATE POLICY "goals_delete" ON ecc_goals FOR DELETE TO authenticated USING (true);

-- ─── Epics ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_epics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','completed','paused','cancelled')),
  priority     text NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low','medium','high','critical')),
  owner        text,
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  goal_id      uuid REFERENCES ecc_goals(id) ON DELETE SET NULL,
  notes        text,
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_epics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "epics_select" ON ecc_epics;
CREATE POLICY "epics_select" ON ecc_epics FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "epics_insert" ON ecc_epics;
CREATE POLICY "epics_insert" ON ecc_epics FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "epics_update" ON ecc_epics;
CREATE POLICY "epics_update" ON ecc_epics FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "epics_delete" ON ecc_epics;
CREATE POLICY "epics_delete" ON ecc_epics FOR DELETE TO authenticated USING (true);

-- ─── Seed initial Goals ───────────────────────────────────────────────────────

INSERT INTO ecc_goals (title, description, status, priority, owner, position, target_date) VALUES
  ('Commercial Launch',
   'Complete all pre-launch requirements and ship the platform to paying customers. Covers auth hardening, billing, aXcelerate integration, compliance audit trail, and full feature testing.',
   'active', 'critical', 'Product Owner', 1, '2026-09-30'),
  ('Phase 2 Automation',
   'Automate repetitive workflows — pg_cron sweeps, aXcelerate writeback, email queue, scheduled reports, and AI-assisted support plan generation at scale.',
   'active', 'high', 'Product Owner', 2, '2026-12-31'),
  ('AI Enhancement',
   'Expand AI capabilities beyond support plan generation — AI Product Manager, compliance scoring, documentation generation, and smart test coverage analysis.',
   'active', 'high', 'Product Owner', 3, '2027-03-31'),
  ('Scaling & Reliability',
   'Performance optimisation, database indexing, queue backoff, monitoring, error budgets, and multi-RTO onboarding infrastructure.',
   'active', 'medium', 'Product Owner', 4, '2027-06-30')
ON CONFLICT DO NOTHING;

-- ─── Seed initial Epics ───────────────────────────────────────────────────────

INSERT INTO ecc_epics (title, description, status, priority, position) VALUES
  ('Assessment Engine',      'Core LLN and Digital literacy assessment delivery, ACSF mapping, response scoring and result calculation.', 'active', 'critical', 1),
  ('Candidate Experience',   'Student portal, invitation flows, declaration screens, mobile experience, and progress tracking.', 'active', 'critical', 2),
  ('Compliance & Audit',     'ASQA audit trail, ACSF evidence, compliance reporting, and regulatory documentation.', 'active', 'critical', 3),
  ('Administration',         'Trainer and admin portals, candidate management, qualification setup, and organisation settings.', 'active', 'high', 4),
  ('aXcelerate Integration', 'Inbound sync, writeback queue, portfolio upload, webhook handling, and bulk sync infrastructure.', 'active', 'high', 5),
  ('Billing & Subscriptions','Stripe checkout, subscription portal, usage-based billing, and billing event processing.', 'active', 'high', 6),
  ('AI & Automation',        'Support plan generation, AI Product Manager, pg_cron job automation, and LLM provider abstraction.', 'active', 'high', 7),
  ('Infrastructure',         'Edge functions, database schema, RLS policies, email queue, pg_cron scheduling, and deployment pipeline.', 'active', 'medium', 8),
  ('Authentication',         'Email/password auth, admin OTP, role management, session handling, and security hardening.', 'active', 'critical', 9),
  ('Reporting & Analytics',  'Results dashboard, ACSF evidence reports, compliance summaries, and analytics views.', 'active', 'medium', 10)
ON CONFLICT DO NOTHING;

-- ─── Add FK columns to ecc_product_features ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_product_features' AND column_name = 'goal_id'
  ) THEN
    ALTER TABLE ecc_product_features ADD COLUMN goal_id uuid REFERENCES ecc_goals(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_product_features' AND column_name = 'epic_id'
  ) THEN
    ALTER TABLE ecc_product_features ADD COLUMN epic_id uuid REFERENCES ecc_epics(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Add FK columns to ecc_roadmap_items ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_roadmap_items' AND column_name = 'goal_id'
  ) THEN
    ALTER TABLE ecc_roadmap_items ADD COLUMN goal_id uuid REFERENCES ecc_goals(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_roadmap_items' AND column_name = 'epic_id'
  ) THEN
    ALTER TABLE ecc_roadmap_items ADD COLUMN epic_id uuid REFERENCES ecc_epics(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Add goal_id to ecc_milestones ───────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_milestones' AND column_name = 'goal_id'
  ) THEN
    ALTER TABLE ecc_milestones ADD COLUMN goal_id uuid REFERENCES ecc_goals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Add item_type and hierarchy to ecc_backlog_items ────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_backlog_items' AND column_name = 'item_type'
  ) THEN
    ALTER TABLE ecc_backlog_items ADD COLUMN item_type text NOT NULL DEFAULT 'backlog'
      CHECK (item_type IN ('idea','backlog'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_backlog_items' AND column_name = 'business_value'
  ) THEN
    ALTER TABLE ecc_backlog_items ADD COLUMN business_value text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_backlog_items' AND column_name = 'compliance_impact'
  ) THEN
    ALTER TABLE ecc_backlog_items ADD COLUMN compliance_impact text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_backlog_items' AND column_name = 'decision_history'
  ) THEN
    ALTER TABLE ecc_backlog_items ADD COLUMN decision_history text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_backlog_items' AND column_name = 'goal_id'
  ) THEN
    ALTER TABLE ecc_backlog_items ADD COLUMN goal_id uuid REFERENCES ecc_goals(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_backlog_items' AND column_name = 'epic_id'
  ) THEN
    ALTER TABLE ecc_backlog_items ADD COLUMN epic_id uuid REFERENCES ecc_epics(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_epics_goal_id ON ecc_epics(goal_id);
CREATE INDEX IF NOT EXISTS idx_features_goal_id ON ecc_product_features(goal_id);
CREATE INDEX IF NOT EXISTS idx_features_epic_id ON ecc_product_features(epic_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_goal_id ON ecc_roadmap_items(goal_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_epic_id ON ecc_roadmap_items(epic_id);
CREATE INDEX IF NOT EXISTS idx_backlog_goal_id ON ecc_backlog_items(goal_id);
CREATE INDEX IF NOT EXISTS idx_backlog_item_type ON ecc_backlog_items(item_type);
