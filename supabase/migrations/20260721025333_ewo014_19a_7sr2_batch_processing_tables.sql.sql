/*
# EWO-014.19A.7SR.2 — Batch Processing Tables for One-Off Integrity Cleanup

## Purpose
Creates tables for Product Owner controlled batch processing of integrity alerts.
This is a one-off historical cleanup tool, NOT a permanent recovery engine.

## New Tables
1. engineering_integrity_batch_runs — one row per batch execution
2. engineering_integrity_batch_items — one row per alert processed in a batch

## Security
- RLS enabled on both tables with authenticated access
*/

CREATE TABLE IF NOT EXISTS engineering_integrity_batch_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_ref text UNIQUE NOT NULL,
  alert_type text NOT NULL,
  requested_batch_size int NOT NULL,
  attempted_count int NOT NULL DEFAULT 0,
  initiated_by text NOT NULL,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  summary jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE engineering_integrity_batch_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_batch_runs" ON engineering_integrity_batch_runs;
CREATE POLICY "select_batch_runs" ON engineering_integrity_batch_runs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_batch_runs" ON engineering_integrity_batch_runs;
CREATE POLICY "insert_batch_runs" ON engineering_integrity_batch_runs
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_batch_runs" ON engineering_integrity_batch_runs;
CREATE POLICY "update_batch_runs" ON engineering_integrity_batch_runs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS engineering_integrity_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_run_id uuid REFERENCES engineering_integrity_batch_runs(id) ON DELETE CASCADE,
  alert_id uuid,
  ewo_ref text,
  outcome text NOT NULL,
  reason text,
  evidence_searched jsonb DEFAULT '[]'::jsonb,
  evidence_used jsonb DEFAULT '[]'::jsonb,
  fields_reconstructed jsonb DEFAULT '{}'::jsonb,
  missing_fields jsonb DEFAULT '[]'::jsonb,
  confidence real DEFAULT 0,
  canonical_work_order_id uuid,
  transaction_details jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engineering_integrity_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_batch_items" ON engineering_integrity_batch_items;
CREATE POLICY "select_batch_items" ON engineering_integrity_batch_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_batch_items" ON engineering_integrity_batch_items;
CREATE POLICY "insert_batch_items" ON engineering_integrity_batch_items
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_batch_items" ON engineering_integrity_batch_items;
CREATE POLICY "update_batch_items" ON engineering_integrity_batch_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_batch_runs_ref ON engineering_integrity_batch_runs(batch_ref);
CREATE INDEX IF NOT EXISTS idx_batch_items_run_id ON engineering_integrity_batch_items(batch_run_id);
CREATE INDEX IF NOT EXISTS idx_batch_items_alert_id ON engineering_integrity_batch_items(alert_id);
CREATE INDEX IF NOT EXISTS idx_batch_items_ewo_ref ON engineering_integrity_batch_items(ewo_ref);
