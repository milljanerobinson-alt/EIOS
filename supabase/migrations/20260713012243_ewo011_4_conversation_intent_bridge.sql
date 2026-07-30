/*
# EWO-011.4 — AI Conversation to ATD Intent Bridge

## Purpose
Persists the relationship between an AI Technical Director conversation decision
and a governed ATD Engineering Intent, enabling idempotency and conversation
continuity across page reloads.

## New Tables
- `atd_intent_conversation_links`
  - `id` — uuid primary key
  - `conversation_id` — text, FK-like reference to cc_ai_conversations.id
  - `decision_snapshot` — jsonb, the EngineeringDecision data at handoff time
  - `intent_id` — uuid FK to atd_engineering_intents
  - `intent_ref` — text, human-readable ref (e.g. ATD-INT-005)
  - `pipeline_execution_id` — uuid FK to atd_pipeline_executions (nullable)
  - `source_message_context` — jsonb, preserves message id + conversation title
  - `created_at` — timestamptz

## Modified Tables
- `atd_engineering_intents`
  - ADD COLUMN `source_conversation_id` text — traces which cc_ai_conversation created this intent

## Security
- RLS enabled on `atd_intent_conversation_links`
- anon + authenticated read/write (internal system, no per-user auth required)

## Notes
- UNIQUE constraint on (conversation_id, intent_id) prevents duplicate links for the same decision
- `decision_snapshot` preserves the exact data used at handoff for audit traceability
- `source_conversation_id` on intents allows the ATD Workspace to surface the origin conversation
*/

-- ── Schema ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atd_intent_conversation_links (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id         text NOT NULL,
  decision_snapshot       jsonb NOT NULL DEFAULT '{}'::jsonb,
  intent_id               uuid NOT NULL REFERENCES atd_engineering_intents(id) ON DELETE CASCADE,
  intent_ref              text NOT NULL,
  pipeline_execution_id   uuid REFERENCES atd_pipeline_executions(id) ON DELETE SET NULL,
  source_message_context  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate links: one conversation → one intent (idempotency key)
CREATE UNIQUE INDEX IF NOT EXISTS atd_intent_conversation_links_unique_conv
  ON atd_intent_conversation_links (conversation_id);

-- Index for reverse lookup: given an intent, find its originating conversation
CREATE INDEX IF NOT EXISTS atd_intent_conversation_links_intent_idx
  ON atd_intent_conversation_links (intent_id);

-- ── Add source_conversation_id to atd_engineering_intents ─────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atd_engineering_intents'
      AND column_name = 'source_conversation_id'
  ) THEN
    ALTER TABLE atd_engineering_intents ADD COLUMN source_conversation_id text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS atd_engineering_intents_source_conv_idx
  ON atd_engineering_intents (source_conversation_id)
  WHERE source_conversation_id IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────────

ALTER TABLE atd_intent_conversation_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_links" ON atd_intent_conversation_links;
CREATE POLICY "anon_select_links" ON atd_intent_conversation_links FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_links" ON atd_intent_conversation_links;
CREATE POLICY "anon_insert_links" ON atd_intent_conversation_links FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_links" ON atd_intent_conversation_links;
CREATE POLICY "anon_update_links" ON atd_intent_conversation_links FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_links" ON atd_intent_conversation_links;
CREATE POLICY "anon_delete_links" ON atd_intent_conversation_links FOR DELETE
  TO anon, authenticated USING (true);
