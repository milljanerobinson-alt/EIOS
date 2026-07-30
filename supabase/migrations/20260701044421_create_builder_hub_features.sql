/*
# Create Builder Hub Features Table

## Purpose
Powers the internal LLN+D Builder Hub — a lightweight Kanban-style product management
board for tracking feature development. Built for solo-founder use with minimal overhead.

## New Tables

### builder_features
Stores every product feature card on the Kanban board.
- `id` — UUID primary key
- `title` — Short feature title shown on the card (required)
- `description` — Longer explanation of the feature
- `status` — Kanban column: 'backlog' | 'in_progress' | 'shipped' | 'roadmap'
- `priority` — 'low' | 'medium' | 'high' | 'critical'
- `tags` — JSONB array of tag strings (Compliance, ACSF, aXcelerate integration, etc.)
- `notes` — Freeform internal notes
- `implementation_notes` — Technical notes: Bolt AI prompts, DB changes, API integrations
- `position` — Integer for ordering cards within a column (lower = higher up)
- `created_at` — Timestamp of creation
- `updated_at` — Timestamp of last edit (auto-updated via trigger)

## Security
- Internal admin-only tool: policies scoped to `TO authenticated`.
- No anon access needed — only signed-in users can read/write.

## Notes
- `position` allows manual reordering within each column; drag-and-drop updates this value.
- `tags` stored as JSONB for flexible multi-tag support without a join table.
- Trigger auto-updates `updated_at` on every row change.
*/

CREATE TABLE IF NOT EXISTS builder_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'backlog'
    CHECK (status IN ('backlog', 'in_progress', 'shipped', 'roadmap')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  tags jsonb NOT NULL DEFAULT '[]',
  notes text,
  implementation_notes text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_features_status ON builder_features(status, position);

ALTER TABLE builder_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_builder_features" ON builder_features;
CREATE POLICY "auth_select_builder_features" ON builder_features
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_builder_features" ON builder_features;
CREATE POLICY "auth_insert_builder_features" ON builder_features
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_builder_features" ON builder_features;
CREATE POLICY "auth_update_builder_features" ON builder_features
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_builder_features" ON builder_features;
CREATE POLICY "auth_delete_builder_features" ON builder_features
  FOR DELETE TO authenticated USING (true);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_builder_features_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_builder_features_updated_at ON builder_features;
CREATE TRIGGER trg_builder_features_updated_at
  BEFORE UPDATE ON builder_features
  FOR EACH ROW EXECUTE FUNCTION update_builder_features_updated_at();
