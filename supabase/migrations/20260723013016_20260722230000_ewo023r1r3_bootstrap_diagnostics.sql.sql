/*
# EWO-023R.1R.3: Operational Evidence Drill-Down & Actionable Bootstrap Diagnostics
#
# 1. Creates historical_bootstrap_diagnostics table for per-item diagnostic evidence
# 2. Adds bootstrap_run_id to engineering_memory and engineering_record_lineage
#    so drill-down can filter by originating bootstrap run
# 3. Adds skip_reason column to engineering_records_library for skipped records
*/

-- ─── 1. Diagnostics table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS historical_bootstrap_diagnostics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      text NOT NULL,
  phase       text NOT NULL,
  phase_label text,
  severity     text NOT NULL DEFAULT 'warning',
  record_ref  text,
  record_type text,
  user_message text NOT NULL,
  technical_message text,
  resolution_status text DEFAULT 'open',
  related_record_ref text,
  retry_guidance text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hbd_run_id ON historical_bootstrap_diagnostics(run_id);
CREATE INDEX IF NOT EXISTS idx_hbd_phase ON historical_bootstrap_diagnostics(phase);
CREATE INDEX IF NOT EXISTS idx_hbd_severity ON historical_bootstrap_diagnostics(severity);

ALTER TABLE historical_bootstrap_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_diagnostics" ON historical_bootstrap_diagnostics FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_diagnostics" ON historical_bootstrap_diagnostics FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_diagnostics" ON historical_bootstrap_diagnostics FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ─── 2. Tag memory and lineage with bootstrap_run_id ──────────────────────────

ALTER TABLE engineering_memory
  ADD COLUMN IF NOT EXISTS bootstrap_run_id text;

ALTER TABLE engineering_record_lineage
  ADD COLUMN IF NOT EXISTS bootstrap_run_id text;

-- ─── 3. Add skip_reason to engineering_records_library ─────────────────────────

ALTER TABLE engineering_records_library
  ADD COLUMN IF NOT EXISTS skip_reason text;

-- ─── 4. Backfill: tag existing memory entries from the latest completed run ────

UPDATE engineering_memory
SET bootstrap_run_id = (
  SELECT run_id FROM historical_bootstrap_runs
  WHERE status = 'completed'
  ORDER BY started_at DESC LIMIT 1
)
WHERE bootstrap_run_id IS NULL
  AND tags @> ARRAY['historical_bootstrap'];

UPDATE engineering_record_lineage
SET bootstrap_run_id = (
  SELECT run_id FROM historical_bootstrap_runs
  WHERE status = 'completed'
  ORDER BY started_at DESC LIMIT 1
)
WHERE bootstrap_run_id IS NULL
  AND notes LIKE '%historical_bootstrap%';

-- Add notes to lineage entries that don't have them yet
UPDATE engineering_record_lineage
SET notes = 'historical_bootstrap',
    bootstrap_run_id = (
      SELECT run_id FROM historical_bootstrap_runs
      WHERE status = 'completed'
      ORDER BY started_at DESC LIMIT 1
    )
WHERE bootstrap_run_id IS NULL
  AND notes IS NULL
  AND from_record_ref LIKE '%-PROMPT';
