/*
# EWO-011.4B — Governed Lifecycle Management Engine v1.0

## Summary
Implements the first version of the reusable Engineering Object Lifecycle Engine.

## Changes

### New Tables
- `engineering_lifecycle_events` — immutable audit log of every lifecycle transition for any
  governed Engineering Object (intent, plan, idea, goal, epic, EWO, etc.)

### Modified Tables
- `atd_engineering_intents` — adds lifecycle fields: `lifecycle_status`, `deleted_at`,
  `deleted_by`, `deletion_reason`, `archived_at`, `restored_at`, `restored_from_status`
- `atd_engineering_plans` — same lifecycle fields as intents

### Index Changes
- Partial unique index on `atd_engineering_intents(intent_ref)` WHERE NOT deleted, replacing the
  unconditional unique so soft-deleted intents do not permanently block recreation of same-ref records.
- Same partial unique on `atd_engineering_plans(plan_ref)`.

### Security
- RLS enabled on `engineering_lifecycle_events` with anon + authenticated CRUD
  (same pattern as the rest of this single-tenant workspace).

## Notes
1. Soft delete never physically removes rows. `lifecycle_status = 'deleted'` is the canonical
   deletion state. Physical purge is reserved for future administrator-only tooling.
2. All existing records default to lifecycle_status = 'active' via the column default.
3. The `engineering_lifecycle_events` table is append-only by convention (no UPDATE policy).
4. Future Engineering Objects only need the same lifecycle columns to participate in the engine.
*/

-- ─── Add lifecycle columns to atd_engineering_intents ────────────────────────

ALTER TABLE atd_engineering_intents
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'completed', 'archived', 'deleted', 'purged')),
  ADD COLUMN IF NOT EXISTS deleted_at       timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by       text,
  ADD COLUMN IF NOT EXISTS deletion_reason  text,
  ADD COLUMN IF NOT EXISTS archived_at      timestamptz,
  ADD COLUMN IF NOT EXISTS restored_at      timestamptz,
  ADD COLUMN IF NOT EXISTS restored_from_status text;

-- ─── Add lifecycle columns to atd_engineering_plans ──────────────────────────

ALTER TABLE atd_engineering_plans
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'completed', 'archived', 'deleted', 'purged')),
  ADD COLUMN IF NOT EXISTS deleted_at       timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by       text,
  ADD COLUMN IF NOT EXISTS deletion_reason  text,
  ADD COLUMN IF NOT EXISTS archived_at      timestamptz,
  ADD COLUMN IF NOT EXISTS restored_at      timestamptz,
  ADD COLUMN IF NOT EXISTS restored_from_status text;

-- ─── Lifecycle-aware indexes for intents ─────────────────────────────────────

-- Performance: fast filter of active intents (the common query path)
CREATE INDEX IF NOT EXISTS idx_atd_intents_lifecycle
  ON atd_engineering_intents (lifecycle_status)
  WHERE lifecycle_status = 'active';

-- Performance: fast filter of active plans
CREATE INDEX IF NOT EXISTS idx_atd_plans_lifecycle
  ON atd_engineering_plans (lifecycle_status)
  WHERE lifecycle_status = 'active';

-- ─── engineering_lifecycle_events ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_lifecycle_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_ref       text NOT NULL,
  object_type     text NOT NULL,  -- 'intent' | 'plan' | 'idea' | etc.
  object_id       uuid NOT NULL,
  object_ref      text,
  from_status     text NOT NULL,  -- lifecycle_status before transition
  to_status       text NOT NULL,  -- lifecycle_status after transition
  transition      text NOT NULL,  -- 'delete' | 'restore' | 'archive' | 'purge'
  actor           text NOT NULL DEFAULT 'Product Owner',
  reason          text,
  source_interface text,
  linked_objects  jsonb NOT NULL DEFAULT '[]',  -- cascade info
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engineering_lifecycle_events ENABLE ROW LEVEL SECURITY;

-- event_ref sequence helper — stored as YYYYMMDD-NNN
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_object
  ON engineering_lifecycle_events (object_type, object_id);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_created
  ON engineering_lifecycle_events (created_at DESC);

-- RLS: single-tenant workspace — anon + authenticated can read/insert
DROP POLICY IF EXISTS "lifecycle_events_select" ON engineering_lifecycle_events;
CREATE POLICY "lifecycle_events_select" ON engineering_lifecycle_events
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "lifecycle_events_insert" ON engineering_lifecycle_events;
CREATE POLICY "lifecycle_events_insert" ON engineering_lifecycle_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- No UPDATE/DELETE policies — lifecycle events are immutable audit records
