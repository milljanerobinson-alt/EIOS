/*
# Add Unique Constraint: atd_benchmark_runs(session_id, benchmark_definition_id)

## Purpose
Prevents duplicate benchmark captures when resuming an incomplete session.
Without this constraint, a resume could accidentally insert a second run for a
benchmark already captured in the same session.

## Changes
- Adds a UNIQUE constraint on (session_id, benchmark_definition_id) in
  atd_benchmark_runs so each benchmark definition can only appear once per session.

## Notes
- Uses an idempotent DO block — safe to re-run.
- Does NOT affect existing data (EIB-001/ATMR-0001 has only one row per benchmark).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'atd_benchmark_runs_session_benchmark_unique'
      AND conrelid = 'atd_benchmark_runs'::regclass
  ) THEN
    ALTER TABLE atd_benchmark_runs
      ADD CONSTRAINT atd_benchmark_runs_session_benchmark_unique
      UNIQUE (session_id, benchmark_definition_id);
  END IF;
END $$;
