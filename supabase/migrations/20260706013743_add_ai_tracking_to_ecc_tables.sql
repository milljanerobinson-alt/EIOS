/*
# Add AI Technical Director Tracking to ECC Tables

## Purpose
Enables bidirectional traceability between AI conversations and the ECC artefacts they create.
Every record created by the AI Technical Director will carry a reference back to the conversation
that produced it, the AI's reasoning, and a confidence score.

## Changes

### Columns added to existing tables (all nullable, safe to add with IF NOT EXISTS guard)
All six target tables receive:
- `source_conversation_id` (uuid) — FK to cc_ai_conversations; identifies which conversation created this record
- `ai_reasoning` (text) — plain-English explanation from the AI for why this artefact was created

### ecc_documentation — missing columns added
The context builder already queries `version`, `status`, and `author` on this table but they do not exist yet:
- `version` (text, default '0.1')
- `status` (text, default 'draft')
- `author` (text)

### New table: ecc_ai_artefact_log
Full audit log of every ECC artefact created by the AI Technical Director.
- `id` (uuid, PK)
- `conversation_id` (uuid, FK cc_ai_conversations) — source conversation
- `change_record_id` (uuid, FK ecc_change_records nullable) — approval change record if applicable
- `artefact_type` (text) — e.g. 'backlog_item', 'goal', 'epic', 'decision', 'documentation', 'feature'
- `artefact_id` (uuid) — ID of the created record in the target table
- `artefact_title` (text) — human-readable title snapshot at creation time
- `confidence_score` (numeric 0-100)
- `reasoning` (text) — AI reasoning for this specific artefact
- `approved_by` (text) — user identifier who clicked approve
- `created_at` (timestamptz)

## Security
- RLS enabled on ecc_ai_artefact_log
- anon + authenticated can read/insert (single-tenant app, no sign-in requirement)
- No update/delete (append-only audit log)

## Notes
1. All column additions use DO blocks with IF NOT EXISTS checks — migration is idempotent.
2. FK constraints added where the referenced table is guaranteed to exist.
3. ecc_documentation status/version/author additions make the context builder queries valid.
*/

-- ── ecc_backlog_items ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_backlog_items' AND column_name = 'source_conversation_id'
  ) THEN
    ALTER TABLE ecc_backlog_items ADD COLUMN source_conversation_id uuid REFERENCES cc_ai_conversations(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_backlog_items' AND column_name = 'ai_reasoning'
  ) THEN
    ALTER TABLE ecc_backlog_items ADD COLUMN ai_reasoning text;
  END IF;
END $$;

-- ── ecc_goals ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_goals' AND column_name = 'source_conversation_id'
  ) THEN
    ALTER TABLE ecc_goals ADD COLUMN source_conversation_id uuid REFERENCES cc_ai_conversations(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_goals' AND column_name = 'ai_reasoning'
  ) THEN
    ALTER TABLE ecc_goals ADD COLUMN ai_reasoning text;
  END IF;
END $$;

-- ── ecc_epics ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_epics' AND column_name = 'source_conversation_id'
  ) THEN
    ALTER TABLE ecc_epics ADD COLUMN source_conversation_id uuid REFERENCES cc_ai_conversations(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_epics' AND column_name = 'ai_reasoning'
  ) THEN
    ALTER TABLE ecc_epics ADD COLUMN ai_reasoning text;
  END IF;
END $$;

-- ── ecc_decisions ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_decisions' AND column_name = 'source_conversation_id'
  ) THEN
    ALTER TABLE ecc_decisions ADD COLUMN source_conversation_id uuid REFERENCES cc_ai_conversations(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_decisions' AND column_name = 'ai_reasoning'
  ) THEN
    ALTER TABLE ecc_decisions ADD COLUMN ai_reasoning text;
  END IF;
END $$;

-- ── ecc_documentation ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_documentation' AND column_name = 'source_conversation_id'
  ) THEN
    ALTER TABLE ecc_documentation ADD COLUMN source_conversation_id uuid REFERENCES cc_ai_conversations(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_documentation' AND column_name = 'ai_reasoning'
  ) THEN
    ALTER TABLE ecc_documentation ADD COLUMN ai_reasoning text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_documentation' AND column_name = 'version'
  ) THEN
    ALTER TABLE ecc_documentation ADD COLUMN version text DEFAULT '0.1';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_documentation' AND column_name = 'status'
  ) THEN
    ALTER TABLE ecc_documentation ADD COLUMN status text DEFAULT 'draft';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_documentation' AND column_name = 'author'
  ) THEN
    ALTER TABLE ecc_documentation ADD COLUMN author text;
  END IF;
END $$;

-- ── ecc_product_features ────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_product_features' AND column_name = 'source_conversation_id'
  ) THEN
    ALTER TABLE ecc_product_features ADD COLUMN source_conversation_id uuid REFERENCES cc_ai_conversations(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_product_features' AND column_name = 'ai_reasoning'
  ) THEN
    ALTER TABLE ecc_product_features ADD COLUMN ai_reasoning text;
  END IF;
END $$;

-- ── ecc_ai_artefact_log (new) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecc_ai_artefact_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid REFERENCES cc_ai_conversations(id) ON DELETE SET NULL,
  change_record_id   uuid REFERENCES ecc_change_records(id) ON DELETE SET NULL,
  artefact_type      text NOT NULL,
  artefact_id        uuid NOT NULL,
  artefact_title     text,
  confidence_score   numeric(5,2),
  reasoning          text,
  approved_by        text,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE ecc_ai_artefact_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_artefact_log" ON ecc_ai_artefact_log;
CREATE POLICY "anon_select_artefact_log" ON ecc_ai_artefact_log FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_artefact_log" ON ecc_ai_artefact_log;
CREATE POLICY "anon_insert_artefact_log" ON ecc_ai_artefact_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);
