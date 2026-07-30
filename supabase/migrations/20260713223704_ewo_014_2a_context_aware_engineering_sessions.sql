/*
# EWO-014.2A — Context-Aware Engineering Sessions

## Summary
Adds Engineering Context isolation to the ATD session and briefing infrastructure.
Every Engineering Session (atd_engineering_intents) and Executive Briefing (ecc_ai_briefings)
is now stamped with the context it belongs to. A new ecc_context_missions table holds the
per-context Current Mission statement.

## Changes

### 1. atd_engineering_intents — New Columns
- `context_type` (text, NOT NULL DEFAULT 'platform') — 'platform' or 'project'
- `context_id` (text, NOT NULL DEFAULT 'platform') — 'platform' or the project UUID
- `project_id` (text) — nullable; equals context_id for project contexts, NULL for platform
- `context_migration_status` (text) — 'baseline_assigned' for rows migrated from global state; NULL for new rows

### 2. ecc_ai_briefings — New Columns
- `context_type` (text, NOT NULL DEFAULT 'platform')
- `context_id` (text, NOT NULL DEFAULT 'platform')
- `project_id` (text)
- `context_migration_status` (text)

### 3. New Table: ecc_context_missions
Stores the Current Mission statement per Engineering Context. Each context has at most
one active mission row (enforced via UNIQUE on context_type + context_id).
- `id` (uuid, primary key)
- `context_type` (text, NOT NULL) — 'platform' or 'project'
- `context_id` (text, NOT NULL) — 'platform' or project UUID
- `project_id` (text) — NULL for platform
- `mission_statement` (text, NOT NULL)
- `set_by` (text) — free-text label (user / session reference)
- `created_at` / `updated_at` (timestamptz)

### 4. Data Migration
All pre-existing rows in atd_engineering_intents and ecc_ai_briefings are assigned to the
Platform context with context_migration_status = 'baseline_assigned'.

### 5. Indexes
- (context_type, context_id) on both modified tables and ecc_context_missions for fast filtering.

### 6. Security
Single-tenant, no-auth app. All policies use TO anon, authenticated with USING (true).
*/

-- =========================================================================
-- 1. Extend atd_engineering_intents
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atd_engineering_intents' AND column_name = 'context_type'
  ) THEN
    ALTER TABLE atd_engineering_intents
      ADD COLUMN context_type text NOT NULL DEFAULT 'platform',
      ADD COLUMN context_id text NOT NULL DEFAULT 'platform',
      ADD COLUMN project_id text,
      ADD COLUMN context_migration_status text;
  END IF;
END $$;

-- Backfill existing rows
UPDATE atd_engineering_intents
SET
  context_type = 'platform',
  context_id = 'platform',
  project_id = NULL,
  context_migration_status = 'baseline_assigned'
WHERE context_migration_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_atd_engineering_intents_context
  ON atd_engineering_intents (context_type, context_id);

-- =========================================================================
-- 2. Extend ecc_ai_briefings
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_ai_briefings' AND column_name = 'context_type'
  ) THEN
    ALTER TABLE ecc_ai_briefings
      ADD COLUMN context_type text NOT NULL DEFAULT 'platform',
      ADD COLUMN context_id text NOT NULL DEFAULT 'platform',
      ADD COLUMN project_id text,
      ADD COLUMN context_migration_status text;
  END IF;
END $$;

UPDATE ecc_ai_briefings
SET
  context_type = 'platform',
  context_id = 'platform',
  project_id = NULL,
  context_migration_status = 'baseline_assigned'
WHERE context_migration_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_ecc_ai_briefings_context
  ON ecc_ai_briefings (context_type, context_id);

-- =========================================================================
-- 3. Create ecc_context_missions
-- =========================================================================
CREATE TABLE IF NOT EXISTS ecc_context_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type text NOT NULL,
  context_id text NOT NULL,
  project_id text,
  mission_statement text NOT NULL,
  set_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (context_type, context_id)
);

ALTER TABLE ecc_context_missions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ecc_context_missions_context
  ON ecc_context_missions (context_type, context_id);

DROP POLICY IF EXISTS "anon_select_context_missions" ON ecc_context_missions;
CREATE POLICY "anon_select_context_missions" ON ecc_context_missions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_context_missions" ON ecc_context_missions;
CREATE POLICY "anon_insert_context_missions" ON ecc_context_missions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_context_missions" ON ecc_context_missions;
CREATE POLICY "anon_update_context_missions" ON ecc_context_missions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_context_missions" ON ecc_context_missions;
CREATE POLICY "anon_delete_context_missions" ON ecc_context_missions FOR DELETE
  TO anon, authenticated USING (true);
