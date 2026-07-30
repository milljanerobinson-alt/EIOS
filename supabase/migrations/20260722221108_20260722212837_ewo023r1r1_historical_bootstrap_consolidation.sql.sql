/*
# EWO-023R.1R.1: Historical Bootstrap Architectural Consolidation & Execution Governance

## Summary
1. Adds phase tracking, heartbeat, and failure governance columns to historical_bootstrap_runs
2. Drops the duplicate draft_knowledge_packages table
3. Reconciles existing stuck "running" runs as "failed"

## Changes

### ALTER historical_bootstrap_runs
Add columns for execution governance:
- current_phase, phase_progress, heartbeat_at, failed_phase, failure_reason, diagnostics

### DROP draft_knowledge_packages
Remove the parallel knowledge repository. AI knowledge preparation
will instead use the existing engineering_memory table (EWO-009).

### Reconcile stuck runs
Mark all existing "running" runs as "failed" with diagnostic info.
*/

-- ─── 1. Add execution governance columns ───────────────────────────────────────

ALTER TABLE historical_bootstrap_runs
  ADD COLUMN IF NOT EXISTS current_phase text,
  ADD COLUMN IF NOT EXISTS phase_progress jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_phase text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS diagnostics jsonb DEFAULT '{}'::jsonb;

-- ─── 2. Reconcile existing stuck runs ──────────────────────────────────────────

UPDATE historical_bootstrap_runs
SET status = 'failed',
    failed_phase = 'initialisation',
    failure_reason = 'Run remained in running state with zero progress — reconciled by EWO-023R.1R.1',
    diagnostics = jsonb_build_object(
      'reconciled_by', 'EWO-023R.1R.1',
      'reconciled_at', now()::text,
      'original_status', 'running',
      'artefacts_discovered', artefacts_discovered,
      'artefacts_imported', artefacts_imported
    ),
    completed_at = COALESCE(completed_at, now()),
    runtime_seconds = COALESCE(runtime_seconds, 0)
WHERE status = 'running';

-- ─── 3. Drop duplicate knowledge repository ─────────────────────────────────────

DROP TABLE IF EXISTS draft_knowledge_packages;
