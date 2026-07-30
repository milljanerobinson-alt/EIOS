
-- Rename batch-related columns to phase terminology

-- ecc_active_work: current_batch → current_phase
ALTER TABLE ecc_active_work
  RENAME COLUMN current_batch TO current_phase;

-- ecc_backlog_items: target_batch → target_phase, batch → phase
ALTER TABLE ecc_backlog_items
  RENAME COLUMN target_batch TO target_phase;

ALTER TABLE ecc_backlog_items
  RENAME COLUMN batch TO phase;

-- ecc_release_candidates: included_batches → included_phases
-- Migrate the "Batch A" value to "Phase 1 — Foundations"
ALTER TABLE ecc_release_candidates
  RENAME COLUMN included_batches TO included_phases;

UPDATE ecc_release_candidates
SET included_phases = (
  SELECT array_agg(
    CASE
      WHEN val = 'Batch A' THEN 'Phase 1 — Foundations'
      WHEN val ILIKE 'Batch B%' THEN 'Phase 2 — MVP Completion'
      ELSE val
    END
  )
  FROM unnest(included_phases) AS val
)
WHERE included_phases IS NOT NULL AND array_length(included_phases, 1) > 0;

-- ecc_testing_reports: batch → phase
ALTER TABLE ecc_testing_reports
  RENAME COLUMN batch TO phase;
