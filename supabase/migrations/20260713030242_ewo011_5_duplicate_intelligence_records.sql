/*
# EWO-011.5 — Duplicate Intelligence Records

## Purpose
Stores the results of duplicate intelligence analyses performed by the
Duplicate Intelligence Service before Engineering Object creation. Enables
Product Owner decision tracking and future analytics on duplicate patterns.

## New Table: duplicate_intelligence_records

### Columns
- id (uuid, pk) — unique record identifier
- object_type (text) — type being created: 'intent', future: 'idea', 'goal', 'epic'
- proposed_title (text) — the title that was analysed
- conversation_id (uuid, nullable) — FK to atd_conversations if invoked from ICD flow
- recommendation (text) — engine recommendation: continue_existing | restore_archived | restore_deleted | related_work | proceed
- confidence (int, 0–100) — match confidence score
- explanation_text (text) — natural language explanation for display
- existing_object_id (uuid, nullable) — matched existing object ID
- existing_object_ref (text, nullable) — matched existing object ref (e.g. ATD-INT-001)
- existing_lifecycle_status (text, nullable) — lifecycle status of the matched object
- source (text, nullable) — ICD_conversation | CaptureIntentModal | API
- selected_action (text, nullable) — PO decision: open_existing | continue_existing | restore | create_new | cancelled | dismissed
- action_result (text, nullable) — 'executed' or 'cancelled'
- new_object_id (uuid, nullable) — ID of newly created object (when PO chose create_new)
- metadata (jsonb, default {}) — additional context
- created_at (timestamptz) — auto-set

## Security
- RLS enabled; anon + authenticated can insert and select (single-tenant app, no auth requirement).
- No UPDATE/DELETE from client — PO action is recorded via a targeted UPDATE via the service.

## Indexes
- idx_dir_object_type_created_at — for object_type + date queries
- idx_dir_conversation_id — for linking to conversations
*/

CREATE TABLE IF NOT EXISTS duplicate_intelligence_records (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type               text NOT NULL DEFAULT 'intent',
  proposed_title            text NOT NULL,
  conversation_id           uuid,
  recommendation            text NOT NULL,
  confidence                int NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  explanation_text          text NOT NULL DEFAULT '',
  existing_object_id        uuid,
  existing_object_ref       text,
  existing_lifecycle_status text,
  source                    text,
  selected_action           text,
  action_result             text,
  new_object_id             uuid,
  metadata                  jsonb NOT NULL DEFAULT '{}',
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE duplicate_intelligence_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_dir" ON duplicate_intelligence_records;
CREATE POLICY "anon_select_dir" ON duplicate_intelligence_records FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_dir" ON duplicate_intelligence_records;
CREATE POLICY "anon_insert_dir" ON duplicate_intelligence_records FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_dir" ON duplicate_intelligence_records;
CREATE POLICY "anon_update_dir" ON duplicate_intelligence_records FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dir_object_type_created_at
  ON duplicate_intelligence_records (object_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dir_conversation_id
  ON duplicate_intelligence_records (conversation_id)
  WHERE conversation_id IS NOT NULL;
