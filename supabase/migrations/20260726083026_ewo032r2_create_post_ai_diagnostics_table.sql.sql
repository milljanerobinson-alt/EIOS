/*
# EWO-032R.2 — Post-AI Processing Diagnostics Table

1. New Tables
- `cc_post_ai_diagnostics` — per-stage diagnostic records for every post-AI
  processing step in the command-centre-ai edge function. Each row records one
  stage's start, completion, and any error details (PostgREST code, details,
  hint, status, stack trace). Used to identify the exact first failing
  statement when the edge function returns HTTP 500 after a successful AI
  provider response.

2. Columns
- `id` uuid PK
- `diagnostic_ref` text NOT NULL UNIQUE — human-readable reference (DIAG-XXXXXXXX)
- `request_id` text NOT NULL — the runtime request ID from the edge function
- `conversation_id` uuid NULL — conversation ID if available
- `message_id` uuid NULL — message ID if the stage produced one
- `stage_name` text NOT NULL — e.g. "metadata_serialization", "cc_ai_messages_insert"
- `started_at` timestamptz NOT NULL
- `completed_at` timestamptz NULL
- `success` boolean NOT NULL DEFAULT false
- `error_message` text NULL
- `error_code` text NULL — PostgREST error code
- `error_details` text NULL — PostgREST error details
- `error_hint` text NULL — PostgREST error hint
- `error_status` integer NULL — PostgREST HTTP status
- `stack_trace` text NULL
- `created_at` timestamptz NOT NULL DEFAULT now()

3. Security
- Enable RLS on `cc_post_ai_diagnostics`.
- Allow anon + authenticated full CRUD — this is a diagnostic table written
  by the edge function (service role) and read by the frontend for debugging.

4. Indexes
- Index on `request_id` for lookup by request.
- Index on `conversation_id` for lookup by conversation.
- Index on `diagnostic_ref` for direct reference lookup.
*/

CREATE TABLE IF NOT EXISTS cc_post_ai_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnostic_ref text NOT NULL UNIQUE,
  request_id text NOT NULL,
  conversation_id uuid NULL,
  message_id uuid NULL,
  stage_name text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  success boolean NOT NULL DEFAULT false,
  error_message text NULL,
  error_code text NULL,
  error_details text NULL,
  error_hint text NULL,
  error_status integer NULL,
  stack_trace text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cc_post_ai_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_post_ai_diagnostics" ON cc_post_ai_diagnostics;
CREATE POLICY "anon_select_post_ai_diagnostics" ON cc_post_ai_diagnostics FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_post_ai_diagnostics" ON cc_post_ai_diagnostics;
CREATE POLICY "anon_insert_post_ai_diagnostics" ON cc_post_ai_diagnostics FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_post_ai_diagnostics" ON cc_post_ai_diagnostics;
CREATE POLICY "anon_update_post_ai_diagnostics" ON cc_post_ai_diagnostics FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_post_ai_diagnostics" ON cc_post_ai_diagnostics;
CREATE POLICY "anon_delete_post_ai_diagnostics" ON cc_post_ai_diagnostics FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cc_post_ai_diagnostics_request_id ON cc_post_ai_diagnostics (request_id);
CREATE INDEX IF NOT EXISTS idx_cc_post_ai_diagnostics_conversation_id ON cc_post_ai_diagnostics (conversation_id);
CREATE INDEX IF NOT EXISTS idx_cc_post_ai_diagnostics_ref ON cc_post_ai_diagnostics (diagnostic_ref);
