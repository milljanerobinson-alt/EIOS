/*
# EWO-011.4B Corrections — Deleted-Object Browsing Index

## Purpose
Adds a dedicated partial index on `lifecycle_status = 'deleted'` for both
atd_engineering_intents and atd_engineering_plans to optimise queries that
list or browse soft-deleted objects (audit review, restore workflows, duplicate
detection scanning deleted records).

## Changes
- New index: idx_intents_deleted on atd_engineering_intents WHERE lifecycle_status = 'deleted'
- New index: idx_plans_deleted on atd_engineering_plans WHERE lifecycle_status = 'deleted'
- Also adds idx_lifecycle_events_object_type to accelerate audit queries by object_type

## Notes
- All statements are idempotent (CREATE INDEX IF NOT EXISTS).
- No data changes; no RLS changes; no table structure changes.
*/

CREATE INDEX IF NOT EXISTS idx_intents_deleted
  ON atd_engineering_intents (deleted_at DESC)
  WHERE lifecycle_status = 'deleted';

CREATE INDEX IF NOT EXISTS idx_plans_deleted
  ON atd_engineering_plans (deleted_at DESC)
  WHERE lifecycle_status = 'deleted';

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_object_type
  ON engineering_lifecycle_events (object_type, created_at DESC);
