/*
# Extend ecc_test_plans for Test Plan Management

## Summary
Adds new columns to `ecc_test_plans` to support the full Test Plan creation
wizard, categorisation, versioning, and traceability to specs and docs.

## New Columns on ecc_test_plans
- `version` (text) — plan version string (e.g. "1.0", "1.1")
- `category` (text) — organisational category (Platform Validation, Release Validation, etc.)
- `plan_type` already exists as `test_type` — we add a dedicated `plan_type` alias column for clarity
- `linked_specs` (text[]) — free-text references to linked engineering specifications
- `linked_docs` (text[]) — free-text references to linked documentation pages
- `related_platform_area` (text) — which platform area this plan validates

## Notes
- All columns are nullable with safe defaults
- No existing data is modified
- TP-001 is untouched
- Migration is idempotent via DO $$ IF NOT EXISTS $$ blocks
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_test_plans' AND column_name = 'version'
  ) THEN
    ALTER TABLE ecc_test_plans ADD COLUMN version text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_test_plans' AND column_name = 'category'
  ) THEN
    ALTER TABLE ecc_test_plans ADD COLUMN category text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_test_plans' AND column_name = 'plan_type'
  ) THEN
    ALTER TABLE ecc_test_plans ADD COLUMN plan_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_test_plans' AND column_name = 'linked_specs'
  ) THEN
    ALTER TABLE ecc_test_plans ADD COLUMN linked_specs text[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_test_plans' AND column_name = 'linked_docs'
  ) THEN
    ALTER TABLE ecc_test_plans ADD COLUMN linked_docs text[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_test_plans' AND column_name = 'related_platform_area'
  ) THEN
    ALTER TABLE ecc_test_plans ADD COLUMN related_platform_area text;
  END IF;
END $$;

-- Seed TP-001 with sensible defaults for the new columns
UPDATE ecc_test_plans
SET
  version = COALESCE(version, '1.0'),
  category = COALESCE(category, 'Platform Validation'),
  plan_type = COALESCE(plan_type, 'Validation'),
  related_platform_area = COALESCE(related_platform_area, 'Core Platform')
WHERE plan_number = 'TP-001';
