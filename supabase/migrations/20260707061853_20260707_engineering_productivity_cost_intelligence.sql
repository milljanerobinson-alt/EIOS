/*
# Engineering Productivity & AI Cost Intelligence Schema

## Purpose
Creates the permanent data infrastructure for the Engineering Productivity & AI Cost Intelligence Dashboard.
This enables lifetime tracking of all engineering costs (AI-assisted and manual), productivity metrics,
ROI calculations, and trend analysis across the entire platform development lifecycle.

## New Tables

### ecc_engineering_cost_records
Tracks every discrete engineering cost event — Bolt sessions, OpenAI API calls logged manually,
other AI provider charges, and any spend not captured by ai_usage_log. This is the ledger for
all engineering investment.
- id, date, provider (bolt/openai/anthropic/gemini/manual/other)
- category (feature/review/audit/release/support-plan/briefing/testing/specification/other)
- amount_usd, description, notes
- Optional FK links: phase_id, release_id, feature_id
- engineer_name for attribution

### ecc_manual_engineering_work
Records manual (non-AI) engineering hours for comparison with AI-assisted work. Allows ROI
calculation by comparing manual cost against AI-assisted cost.
- id, date, engineer_name, hours, hourly_rate_usd, estimated_cost_usd
- task_category, description
- Optional FK links: release_id, phase_id, feature_id

### ecc_productivity_snapshots
Periodic KPI snapshots (daily/weekly/monthly/quarterly/yearly) for time-series trend analysis.
Never overwritten — new snapshot rows are inserted each period. These power the historical
trend charts and forecasting.
- period_type, period_start, period_end
- All cost totals (bolt, openai, other_ai, manual, total)
- Productivity counts (features, releases, reviews, audits, briefings)
- Derived metrics (hours_saved, roi_score, cost_per_feature, etc.)
- snapshot_data jsonb for extensible additional metrics

### ecc_prompt_records
Tracks every engineering prompt submitted to AI coding agents (Bolt etc.) for effectiveness analysis.
- prompt_summary, provider, engineering_phase, success, revisions_needed
- time_to_completion_hours, defects_found, rollback_required
- estimated_cost_usd, outcome_notes

## Modified Tables

### ecc_phases (new cost columns added)
- estimated_bolt_cost_usd — planned Bolt spend for this phase
- actual_bolt_cost_usd — recorded Bolt spend
- estimated_openai_cost_usd — planned OpenAI spend
- actual_openai_cost_usd — recorded OpenAI spend
- estimated_manual_hours — planned manual hours
- actual_manual_hours — recorded manual hours
- estimated_hours_saved — AI time savings estimate
- engineering_value_score — 0–100 value assessment
- business_impact_score — 0–100 business impact
- complexity_score — 0–100 complexity

### ecc_release_candidates (new cost columns added)
- bolt_cost_usd — total Bolt spend for this release
- openai_cost_usd — total OpenAI spend for this release
- manual_hours — manual engineering hours in this release
- estimated_business_value_usd — estimated business value delivered

## Security
All new tables use TO anon, authenticated RLS policies (consistent with ECC pattern — the
Engineering Command Centre is an internal admin tool, not user-isolated data).

## Notes
1. All records are append-only — never delete or overwrite historical analytics.
2. Indexes on date/period columns for efficient time-series queries.
3. FK columns are nullable — cost records can exist independently of phases/releases.
4. The ai_usage_log table (existing) remains the primary source for OpenAI usage; this
   schema adds the manual entry layer and aggregation snapshots on top.
*/

-- ─── ecc_engineering_cost_records ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_engineering_cost_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_date  date NOT NULL DEFAULT CURRENT_DATE,
  provider     text NOT NULL DEFAULT 'bolt',
  category     text NOT NULL DEFAULT 'feature',
  amount_usd   numeric(12, 4) NOT NULL DEFAULT 0,
  description  text NOT NULL DEFAULT '',
  notes        text,
  engineer_name text,
  phase_id     uuid,
  release_id   uuid,
  feature_id   uuid,
  metadata     jsonb DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_engineering_cost_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ecr_date     ON ecc_engineering_cost_records(record_date DESC);
CREATE INDEX IF NOT EXISTS idx_ecr_provider ON ecc_engineering_cost_records(provider);
CREATE INDEX IF NOT EXISTS idx_ecr_category ON ecc_engineering_cost_records(category);

DROP POLICY IF EXISTS "ecr_select" ON ecc_engineering_cost_records;
CREATE POLICY "ecr_select" ON ecc_engineering_cost_records FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ecr_insert" ON ecc_engineering_cost_records;
CREATE POLICY "ecr_insert" ON ecc_engineering_cost_records FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ecr_update" ON ecc_engineering_cost_records;
CREATE POLICY "ecr_update" ON ecc_engineering_cost_records FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ecr_delete" ON ecc_engineering_cost_records;
CREATE POLICY "ecr_delete" ON ecc_engineering_cost_records FOR DELETE
  TO anon, authenticated USING (true);

-- ─── ecc_manual_engineering_work ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_manual_engineering_work (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date          date NOT NULL DEFAULT CURRENT_DATE,
  engineer_name      text NOT NULL DEFAULT '',
  hours              numeric(6, 2) NOT NULL DEFAULT 0,
  hourly_rate_usd    numeric(8, 2) NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10, 2) GENERATED ALWAYS AS (hours * hourly_rate_usd) STORED,
  task_category      text NOT NULL DEFAULT 'development',
  description        text NOT NULL DEFAULT '',
  release_id         uuid,
  phase_id           uuid,
  feature_id         uuid,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_manual_engineering_work ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_emew_date ON ecc_manual_engineering_work(work_date DESC);

DROP POLICY IF EXISTS "emew_select" ON ecc_manual_engineering_work;
CREATE POLICY "emew_select" ON ecc_manual_engineering_work FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "emew_insert" ON ecc_manual_engineering_work;
CREATE POLICY "emew_insert" ON ecc_manual_engineering_work FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "emew_update" ON ecc_manual_engineering_work;
CREATE POLICY "emew_update" ON ecc_manual_engineering_work FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "emew_delete" ON ecc_manual_engineering_work;
CREATE POLICY "emew_delete" ON ecc_manual_engineering_work FOR DELETE
  TO anon, authenticated USING (true);

-- ─── ecc_productivity_snapshots ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_productivity_snapshots (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type            text NOT NULL DEFAULT 'monthly',
  period_start           date NOT NULL,
  period_end             date NOT NULL,
  -- Cost totals
  bolt_cost_usd          numeric(12, 4) NOT NULL DEFAULT 0,
  openai_cost_usd        numeric(12, 4) NOT NULL DEFAULT 0,
  other_ai_cost_usd      numeric(12, 4) NOT NULL DEFAULT 0,
  manual_cost_usd        numeric(12, 4) NOT NULL DEFAULT 0,
  total_cost_usd         numeric(12, 4) NOT NULL DEFAULT 0,
  -- Productivity counts
  features_delivered     integer NOT NULL DEFAULT 0,
  releases_shipped       integer NOT NULL DEFAULT 0,
  reviews_completed      integer NOT NULL DEFAULT 0,
  audits_completed       integer NOT NULL DEFAULT 0,
  briefings_generated    integer NOT NULL DEFAULT 0,
  ai_prompts_submitted   integer NOT NULL DEFAULT 0,
  -- Derived metrics
  estimated_hours_saved  numeric(8, 2) NOT NULL DEFAULT 0,
  roi_score              numeric(6, 2),
  cost_per_feature       numeric(10, 4),
  cost_per_release       numeric(10, 4),
  cost_per_review        numeric(10, 4),
  -- Extensible
  snapshot_data          jsonb DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_productivity_snapshots ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_eps_period ON ecc_productivity_snapshots(period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_eps_start ON ecc_productivity_snapshots(period_start DESC);

DROP POLICY IF EXISTS "eps_select" ON ecc_productivity_snapshots;
CREATE POLICY "eps_select" ON ecc_productivity_snapshots FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "eps_insert" ON ecc_productivity_snapshots;
CREATE POLICY "eps_insert" ON ecc_productivity_snapshots FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eps_update" ON ecc_productivity_snapshots;
CREATE POLICY "eps_update" ON ecc_productivity_snapshots FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "eps_delete" ON ecc_productivity_snapshots;
CREATE POLICY "eps_delete" ON ecc_productivity_snapshots FOR DELETE
  TO anon, authenticated USING (true);

-- ─── ecc_prompt_records ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_prompt_records (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_date           date NOT NULL DEFAULT CURRENT_DATE,
  prompt_summary            text NOT NULL DEFAULT '',
  provider                  text NOT NULL DEFAULT 'bolt',
  engineering_phase         text,
  feature_area              text,
  success                   boolean NOT NULL DEFAULT true,
  revisions_needed          integer NOT NULL DEFAULT 0,
  time_to_completion_hours  numeric(6, 2),
  defects_found             integer NOT NULL DEFAULT 0,
  rollback_required         boolean NOT NULL DEFAULT false,
  estimated_cost_usd        numeric(10, 4),
  outcome_notes             text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_prompt_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_epr_date ON ecc_prompt_records(submission_date DESC);

DROP POLICY IF EXISTS "epr_select" ON ecc_prompt_records;
CREATE POLICY "epr_select" ON ecc_prompt_records FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "epr_insert" ON ecc_prompt_records;
CREATE POLICY "epr_insert" ON ecc_prompt_records FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "epr_update" ON ecc_prompt_records;
CREATE POLICY "epr_update" ON ecc_prompt_records FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "epr_delete" ON ecc_prompt_records;
CREATE POLICY "epr_delete" ON ecc_prompt_records FOR DELETE
  TO anon, authenticated USING (true);

-- ─── Add cost columns to ecc_phases ───────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_phases' AND column_name='estimated_bolt_cost_usd') THEN
    ALTER TABLE ecc_phases ADD COLUMN estimated_bolt_cost_usd numeric(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_phases' AND column_name='actual_bolt_cost_usd') THEN
    ALTER TABLE ecc_phases ADD COLUMN actual_bolt_cost_usd numeric(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_phases' AND column_name='estimated_openai_cost_usd') THEN
    ALTER TABLE ecc_phases ADD COLUMN estimated_openai_cost_usd numeric(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_phases' AND column_name='actual_openai_cost_usd') THEN
    ALTER TABLE ecc_phases ADD COLUMN actual_openai_cost_usd numeric(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_phases' AND column_name='estimated_manual_hours') THEN
    ALTER TABLE ecc_phases ADD COLUMN estimated_manual_hours numeric(8,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_phases' AND column_name='actual_manual_hours') THEN
    ALTER TABLE ecc_phases ADD COLUMN actual_manual_hours numeric(8,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_phases' AND column_name='estimated_hours_saved') THEN
    ALTER TABLE ecc_phases ADD COLUMN estimated_hours_saved numeric(8,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_phases' AND column_name='engineering_value_score') THEN
    ALTER TABLE ecc_phases ADD COLUMN engineering_value_score integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_phases' AND column_name='business_impact_score') THEN
    ALTER TABLE ecc_phases ADD COLUMN business_impact_score integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_phases' AND column_name='complexity_score') THEN
    ALTER TABLE ecc_phases ADD COLUMN complexity_score integer;
  END IF;
END $$;

-- ─── Add cost columns to ecc_release_candidates ───────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_release_candidates' AND column_name='bolt_cost_usd') THEN
    ALTER TABLE ecc_release_candidates ADD COLUMN bolt_cost_usd numeric(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_release_candidates' AND column_name='openai_cost_usd') THEN
    ALTER TABLE ecc_release_candidates ADD COLUMN openai_cost_usd numeric(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_release_candidates' AND column_name='manual_hours') THEN
    ALTER TABLE ecc_release_candidates ADD COLUMN manual_hours numeric(8,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_release_candidates' AND column_name='estimated_business_value_usd') THEN
    ALTER TABLE ecc_release_candidates ADD COLUMN estimated_business_value_usd numeric(10,2);
  END IF;
END $$;
