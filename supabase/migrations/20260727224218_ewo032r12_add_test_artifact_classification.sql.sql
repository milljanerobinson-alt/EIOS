/*
# EWO-032R.12 — Add Test Artefact Classification Fields

## Purpose
Adds explicit persisted classification fields to Engineering Work Orders so that
disposable test artefacts can be identified by a canonical boolean field rather
than by title matching. This enables governed deletion bypass for test EWOs.

1. New Columns on `engineering_work_orders`
- `is_test_artifact` (boolean, NOT NULL, DEFAULT false) — canonical test classification
- `test_artifact_marked_at` (timestamptz, nullable) — when the classification was set
- `test_artifact_marked_by` (text, nullable) — who set the classification
- `test_artifact_reason` (text, nullable) — user-supplied reason for classification

2. Security
- No new RLS policies needed — existing UPDATE policies on engineering_work_orders
  already cover admin users. The new columns inherit the table's existing RLS.

3. Important Notes
- All existing EWOs default to `is_test_artifact = false` — no automatic marking.
- The classification is set only through the governed UI action and canonical service.
- Name-based detection (title containing "Test", ref containing "-TEST-") is used only
  as a UI suggestion, never as an automatic silent bypass.
- Index added on `is_test_artifact` for efficient filtering.
*/

ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS is_test_artifact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_artifact_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_artifact_marked_by text,
  ADD COLUMN IF NOT EXISTS test_artifact_reason text;

CREATE INDEX IF NOT EXISTS idx_engineering_work_orders_is_test_artifact
  ON engineering_work_orders (is_test_artifact)
  WHERE is_test_artifact = true;
