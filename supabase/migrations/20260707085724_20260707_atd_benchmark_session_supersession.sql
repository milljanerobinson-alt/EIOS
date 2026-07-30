/*
# ATD Benchmark Session — Supersession & Outcome Tracking

## Purpose
Extends benchmark sessions with formal lifecycle outcome tracking and bidirectional
supersession traceability. Enables sessions to be formally superseded (e.g. when
incorrect responses were captured) without deleting any history.

## Changes

### atd_benchmark_sessions
- `session_outcome` (text, check constraint): operational state of the session.
  Values: 'in_progress' | 'completed' | 'accepted' | 'superseded' | 'cancelled'
  Defaults to 'in_progress'. Set to 'completed' when all benchmarks captured, 
  'accepted' when PO accepts, 'superseded' when formally superseded.
- `supersedes_session_id` (uuid, nullable FK): the session this one replaces.
- `superseded_by_session_id` (uuid, nullable FK): the session that replaced this one.
- `supersession_reason` (text, nullable): formal reason for supersession.
- `supersession_date` (date, nullable): date supersession was recorded.
- `supersession_notes` (text, nullable): additional context.

## Security
- Existing RLS policies on atd_benchmark_sessions cover new columns automatically.

## Notes
- Supersession does NOT delete data. Sessions become read-only but remain queryable.
- Bidirectional FK pattern: both sides nullable, safe in PostgreSQL.
- The unique constraint on runs already prevents duplicate captures on resume.
*/

DO $$
BEGIN
  -- session_outcome
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atd_benchmark_sessions' AND column_name = 'session_outcome'
  ) THEN
    ALTER TABLE atd_benchmark_sessions
      ADD COLUMN session_outcome text NOT NULL DEFAULT 'in_progress'
      CHECK (session_outcome IN ('in_progress', 'completed', 'accepted', 'superseded', 'cancelled'));
  END IF;

  -- supersedes_session_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atd_benchmark_sessions' AND column_name = 'supersedes_session_id'
  ) THEN
    ALTER TABLE atd_benchmark_sessions
      ADD COLUMN supersedes_session_id uuid REFERENCES atd_benchmark_sessions(id) ON DELETE SET NULL;
  END IF;

  -- superseded_by_session_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atd_benchmark_sessions' AND column_name = 'superseded_by_session_id'
  ) THEN
    ALTER TABLE atd_benchmark_sessions
      ADD COLUMN superseded_by_session_id uuid REFERENCES atd_benchmark_sessions(id) ON DELETE SET NULL;
  END IF;

  -- supersession_reason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atd_benchmark_sessions' AND column_name = 'supersession_reason'
  ) THEN
    ALTER TABLE atd_benchmark_sessions ADD COLUMN supersession_reason text;
  END IF;

  -- supersession_date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atd_benchmark_sessions' AND column_name = 'supersession_date'
  ) THEN
    ALTER TABLE atd_benchmark_sessions ADD COLUMN supersession_date date;
  END IF;

  -- supersession_notes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atd_benchmark_sessions' AND column_name = 'supersession_notes'
  ) THEN
    ALTER TABLE atd_benchmark_sessions ADD COLUMN supersession_notes text;
  END IF;
END $$;

-- Back-fill: any session with benchmarks_count = 3 and overall_review_status != 'awaiting_review'
-- (i.e. already through the review lifecycle) gets session_outcome = 'accepted'.
-- Sessions with benchmarks_count = 3 and status awaiting_review get 'completed'.
-- Sessions with benchmarks_count < 3 keep 'in_progress'.
UPDATE atd_benchmark_sessions
SET session_outcome = CASE
  WHEN overall_review_status IN ('accepted', 'accepted_with_observations') THEN 'accepted'
  WHEN overall_review_status = 'returned_for_improvement' THEN 'completed'
  WHEN benchmarks_count >= 3 THEN 'completed'
  ELSE 'in_progress'
END
WHERE session_outcome = 'in_progress';
