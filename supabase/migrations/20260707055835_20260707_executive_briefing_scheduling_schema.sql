/*
# Executive Briefing Scheduling & Templates Schema

## Purpose
Introduces a comprehensive, future-proof scheduling framework for AI-generated executive 
intelligence reports. This migration creates the core tables for:
1. Briefing templates (multiple formats: daily executive, release readiness, governance, etc.)
2. Schedule configuration (per-template schedule with full control over time, timezone, days, retention)
3. Columns on ecc_ai_briefings to track template used and how a briefing was triggered

## New Tables

### ecc_briefing_templates
A library of briefing template definitions. Each template has a name, slug, type, description, 
and a system_prompt_template (Handlebars-style placeholder text used by the AI). 
Templates are versioned and can be activated/deactivated without deletion.

Columns:
- id (uuid, pk)
- name (text) — display name, e.g. "Daily Executive Briefing"
- slug (text, unique) — machine key, e.g. "daily-executive"
- description (text) — one-sentence description shown in settings UI
- template_type (text) — category: executive | operations | release_readiness | governance | health | cost | custom
- system_prompt_template (text) — the AI system prompt for this briefing type
- output_sections (jsonb) — list of sections to include in the output JSON
- is_default (boolean) — the template used when no explicit template is selected
- is_active (boolean) — soft-delete / disable without removing
- sort_order (integer) — display order in UI
- created_at (timestamptz)
- updated_at (timestamptz)

### ecc_briefing_schedule_config
A single configurable record (enforced by partial unique index) per template holding 
the schedule for automated generation. Supports flexible time, timezone, day selection, 
catch-up behaviour, retention policy, and per-schedule AI model override.

Columns:
- id (uuid, pk)
- template_id (uuid, fk -> ecc_briefing_templates) — which template this schedule generates
- enabled (boolean) — master on/off switch
- schedule_name (text) — human-readable label for this schedule
- time_of_day (time) — time to generate (in the specified timezone)
- timezone (text) — IANA timezone, e.g. "Australia/Sydney"
- weekdays_only (boolean) — skip Saturday and Sunday if true
- days_of_week (integer[]) — explicit day list (0=Sun..6=Sat), takes priority over weekdays_only
- catch_up_on_startup (boolean) — if today's scheduled briefing was missed, generate on first page load
- retention_days (integer) — how many days to keep generated briefings before expiry (0 = never expire)
- ai_model_override (text) — override the default AI model for this schedule (null = use platform default)
- last_run_at (timestamptz) — when the schedule last successfully ran
- last_run_briefing_id (uuid) — the briefing id produced by the last run
- next_run_at (timestamptz) — computed next run timestamp (for display)
- run_count (integer) — total successful runs
- created_at (timestamptz)
- updated_at (timestamptz)

## Modified Tables

### ecc_ai_briefings
Four new columns added (all nullable, idempotent):
- template_id (uuid) — which template produced this briefing
- trigger_type (text) — 'manual' | 'scheduled' | 'startup_catchup' | 'api'
- scheduled_for (date) — the calendar date this briefing was scheduled for (for dedup)
- schedule_id (uuid) — the schedule config that triggered this briefing

## Security
All tables use RLS with anon + authenticated policies (single-tenant ECC, no per-user isolation needed).

## Notes
1. The partial unique index on ecc_briefing_schedule_config ensures only one schedule per template.
2. scheduled_for on briefings enables "has today's briefing been generated?" queries without 
   scanning timestamps across timezones.
3. The framework is designed so future report types (weekly engineering report, monthly health, etc.)
   only require a new template row + schedule_config row — no schema changes needed.
*/

-- ─── Templates table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_briefing_templates (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text        NOT NULL,
  slug                   text        UNIQUE NOT NULL,
  description            text,
  template_type          text        NOT NULL DEFAULT 'executive',
  system_prompt_template text        NOT NULL DEFAULT '',
  output_sections        jsonb       DEFAULT '[]'::jsonb,
  is_default             boolean     NOT NULL DEFAULT false,
  is_active              boolean     NOT NULL DEFAULT true,
  sort_order             integer     NOT NULL DEFAULT 0,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

ALTER TABLE ecc_briefing_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_briefing_templates" ON ecc_briefing_templates;
CREATE POLICY "select_briefing_templates" ON ecc_briefing_templates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_briefing_templates" ON ecc_briefing_templates;
CREATE POLICY "insert_briefing_templates" ON ecc_briefing_templates FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_briefing_templates" ON ecc_briefing_templates;
CREATE POLICY "update_briefing_templates" ON ecc_briefing_templates FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_briefing_templates" ON ecc_briefing_templates;
CREATE POLICY "delete_briefing_templates" ON ecc_briefing_templates FOR DELETE
  TO anon, authenticated USING (true);

-- ─── Schedule config table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_briefing_schedule_config (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id            uuid        REFERENCES ecc_briefing_templates(id) ON DELETE SET NULL,
  enabled                boolean     NOT NULL DEFAULT true,
  schedule_name          text        NOT NULL DEFAULT 'Daily Executive Briefing',
  time_of_day            time        NOT NULL DEFAULT '08:00:00',
  timezone               text        NOT NULL DEFAULT 'Australia/Sydney',
  weekdays_only          boolean     NOT NULL DEFAULT true,
  days_of_week           integer[]   DEFAULT NULL,
  catch_up_on_startup    boolean     NOT NULL DEFAULT true,
  retention_days         integer     NOT NULL DEFAULT 365,
  ai_model_override      text,
  last_run_at            timestamptz,
  last_run_briefing_id   uuid,
  next_run_at            timestamptz,
  run_count              integer     NOT NULL DEFAULT 0,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

ALTER TABLE ecc_briefing_schedule_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_schedule_config" ON ecc_briefing_schedule_config;
CREATE POLICY "select_schedule_config" ON ecc_briefing_schedule_config FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_schedule_config" ON ecc_briefing_schedule_config;
CREATE POLICY "insert_schedule_config" ON ecc_briefing_schedule_config FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_schedule_config" ON ecc_briefing_schedule_config;
CREATE POLICY "update_schedule_config" ON ecc_briefing_schedule_config FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_schedule_config" ON ecc_briefing_schedule_config;
CREATE POLICY "delete_schedule_config" ON ecc_briefing_schedule_config FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_briefing_schedule_template ON ecc_briefing_schedule_config(template_id);

-- ─── Add columns to ecc_ai_briefings ─────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_ai_briefings' AND column_name='template_id') THEN
    ALTER TABLE ecc_ai_briefings ADD COLUMN template_id uuid REFERENCES ecc_briefing_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_ai_briefings' AND column_name='trigger_type') THEN
    ALTER TABLE ecc_ai_briefings ADD COLUMN trigger_type text DEFAULT 'manual';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_ai_briefings' AND column_name='scheduled_for') THEN
    ALTER TABLE ecc_ai_briefings ADD COLUMN scheduled_for date;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_ai_briefings' AND column_name='schedule_id') THEN
    ALTER TABLE ecc_ai_briefings ADD COLUMN schedule_id uuid REFERENCES ecc_briefing_schedule_config(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for quickly finding today's scheduled briefing
CREATE INDEX IF NOT EXISTS idx_briefings_scheduled_for ON ecc_ai_briefings(scheduled_for, trigger_type);
