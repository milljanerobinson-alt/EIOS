/*
# Testing Framework Phase X — Execution Workflow Enhancement

## Summary
Extends the test execution system to support TR-XXXX global run IDs,
pause/resume workflow, per-case evidence notes, and adds a dedicated
RLS policy for the paused status.

## Changes

### 1. ecc_tp001_executions
- run_number (text, unique) — global TR-XXXX identifier across all plans
- paused_at (timestamptz) — set when a run is paused
- spec_register_version (text) — Specification Register version captured at run time
- guardian_version (text) — Engineering Guardian review version/date at run time
- Backfill existing executions with TR-XXXX numbers ordered by created_at

### 2. ecc_tp001_results
- evidence_notes (text) — free-text evidence / observations per case
- screenshot_ref (text) — optional screenshot reference or URL label

### Notes
- run_number is globally unique; execution_number remains plan-scoped
- Pause/resume uses status = 'paused' and clears paused_at on resume
- All column additions are idempotent (IF NOT EXISTS)
*/

-- ── Extend ecc_tp001_executions ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='run_number') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN run_number text UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='paused_at') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN paused_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='spec_register_version') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN spec_register_version text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='guardian_version') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN guardian_version text;
  END IF;
END $$;

-- Backfill TR-XXXX for any existing executions that don't have one
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM ecc_tp001_executions
  WHERE run_number IS NULL
)
UPDATE ecc_tp001_executions e
SET run_number = 'TR-' || LPAD(n.rn::text, 4, '0')
FROM numbered n
WHERE e.id = n.id;

-- ── Extend ecc_tp001_results ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_results' AND column_name='evidence_notes') THEN
    ALTER TABLE ecc_tp001_results ADD COLUMN evidence_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_results' AND column_name='screenshot_ref') THEN
    ALTER TABLE ecc_tp001_results ADD COLUMN screenshot_ref text;
  END IF;
END $$;
