/*
# EWO-014.7 — ATD-Native Work Order Registration v1.0

## Purpose
ATD becomes the constitutional system of record for all Engineering Work Orders.
This migration introduces the registration architecture: implementation provider
tracking, engineering packages, and implementation return workflow.

## Changes

### 1. New columns on `engineering_work_orders`
- `implementation_provider` (text, default 'Bolt') — enum: ATD, Bolt, OpenAI, Anthropic, Gemini, Local, Manual
- `implementation_status` (text, default 'Not Started') — enum: Not Started, Assigned, In Progress, Implementation Complete, Returned, Rejected
- `engineering_package_status` (text, default 'Not Generated') — enum: Not Generated, Generated, Exported, Returned, Archived
- `implementation_reference` (text, nullable) — stores provider reference
- `implementation_started_at` (timestamptz, nullable)
- `implementation_completed_at` (timestamptz, nullable)
- `implementation_summary` (text, nullable) — returned from implementation provider
- `changed_files` (jsonb, default '[]') — list of modified files
- `implementation_notes` (text, nullable)

### 2. New table: `ewo_engineering_packages`
Immutable, versioned implementation packages generated for each EWO.
- `id` (uuid PK)
- `ewo_id` (uuid FK → engineering_work_orders, CASCADE)
- `version` (integer, NOT NULL) — v1, v2, v3 etc.
- `package_status` (text, default 'generated') — generated, exported, returned, archived
- `summary` (text)
- `engineering_objectives` (text)
- `implementation_scope` (text)
- `acceptance_criteria` (text)
- `relevant_standards` (text)
- `implementation_notes` (text)
- `expected_deliverables` (text)
- `verification_requirements` (text)
- `completion_requirements` (text)
- `constitutional_references` (text[])
- `constraints` (text)
- `package_body` (text) — full formatted package text for copy-paste
- `generated_at` (timestamptz, default now())
- `exported_at` (timestamptz, nullable)
- `returned_at` (timestamptz, nullable)
- `archived_at` (timestamptz, nullable)
- `created_at` (timestamptz, default now())

### 3. Security
- RLS enabled on `ewo_engineering_packages` with full CRUD for authenticated users
- Existing EWO policies cover new columns automatically (same table)

### 4. Historical Compatibility
- All new columns have safe defaults — existing EWOs continue working
- No data migration required beyond column defaults
*/

-- ─── New columns on engineering_work_orders ──────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'implementation_provider'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN implementation_provider text NOT NULL DEFAULT 'Bolt';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'implementation_status'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN implementation_status text NOT NULL DEFAULT 'Not Started';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'engineering_package_status'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN engineering_package_status text NOT NULL DEFAULT 'Not Generated';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'implementation_reference'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN implementation_reference text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'implementation_started_at'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN implementation_started_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'implementation_completed_at'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN implementation_completed_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'implementation_summary'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN implementation_summary text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'changed_files'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN changed_files jsonb NOT NULL DEFAULT '[]';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'implementation_notes'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN implementation_notes text;
  END IF;
END $$;

-- ─── Engineering Packages table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ewo_engineering_packages (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id                  uuid NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  version                 integer NOT NULL DEFAULT 1,
  package_status          text NOT NULL DEFAULT 'generated',
  summary                 text,
  engineering_objectives  text,
  implementation_scope    text,
  acceptance_criteria     text,
  relevant_standards      text,
  implementation_notes    text,
  expected_deliverables   text,
  verification_requirements text,
  completion_requirements text,
  constitutional_references text[] NOT NULL DEFAULT '{}',
  constraints             text,
  package_body            text,
  generated_at            timestamptz NOT NULL DEFAULT now(),
  exported_at             timestamptz,
  returned_at             timestamptz,
  archived_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one package per version per EWO
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_ewo_package_version'
  ) THEN
    ALTER TABLE ewo_engineering_packages
      ADD CONSTRAINT uq_ewo_package_version UNIQUE (ewo_id, version);
  END IF;
END $$;

-- Index for querying packages by EWO
CREATE INDEX IF NOT EXISTS idx_ewo_packages_ewo_id ON ewo_engineering_packages(ewo_id);

-- RLS
ALTER TABLE ewo_engineering_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "packages_select_all" ON ewo_engineering_packages;
CREATE POLICY "packages_select_all" ON ewo_engineering_packages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "packages_insert_all" ON ewo_engineering_packages;
CREATE POLICY "packages_insert_all" ON ewo_engineering_packages FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "packages_update_all" ON ewo_engineering_packages;
CREATE POLICY "packages_update_all" ON ewo_engineering_packages FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "packages_delete_all" ON ewo_engineering_packages;
CREATE POLICY "packages_delete_all" ON ewo_engineering_packages FOR DELETE
  TO authenticated USING (true);
