/*
# EWO-033R.4 — Conversation Boundary Governance

## Purpose
Establishes conversation-complete engineering as a governed architectural
requirement. Creates a canonical conversation association table that links
engineering interactions to their active conversation, enabling resume after
browser refresh, sign-out, network failure, and provider failure.

## New Tables
- `engineering_conversation_associations` — canonical link between an
  engineering interaction (idea/EWO/proposal/execution) and a conversation.
  Tracks lifecycle stage, pending decision, and conversation identifier so
  the correct interaction card can be restored on resume.
  Columns: id, conversation_id, user_id, idea_id, ewo_id, proposal_id,
  execution_id, idea_ref, ewo_ref, proposal_ref, lifecycle_stage,
  pending_decision, last_interaction_card, execution_state, completion_state,
  is_canonical, superseded_by, created_at, updated_at.

## Security
- RLS enabled on the new table.
- Owner-scoped CRUD for authenticated users (user_id defaults to auth.uid()).
*/

CREATE TABLE IF NOT EXISTS engineering_conversation_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  idea_id uuid,
  ewo_id uuid,
  proposal_id uuid,
  execution_id uuid,
  idea_ref text,
  ewo_ref text,
  proposal_ref text,
  lifecycle_stage text NOT NULL DEFAULT 'idea_captured',
  pending_decision text,
  last_interaction_card jsonb,
  execution_state jsonb,
  completion_state jsonb,
  is_canonical boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES engineering_conversation_associations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_convo_assoc_conversation_id
  ON engineering_conversation_associations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_convo_assoc_idea_id
  ON engineering_conversation_associations(idea_id);
CREATE INDEX IF NOT EXISTS idx_convo_assoc_ewo_id
  ON engineering_conversation_associations(ewo_id);
CREATE INDEX IF NOT EXISTS idx_convo_assoc_canonical
  ON engineering_conversation_associations(is_canonical)
  WHERE is_canonical = true;

ALTER TABLE engineering_conversation_associations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_conversation_associations" ON engineering_conversation_associations;
CREATE POLICY "select_own_conversation_associations"
  ON engineering_conversation_associations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_conversation_associations" ON engineering_conversation_associations;
CREATE POLICY "insert_own_conversation_associations"
  ON engineering_conversation_associations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_conversation_associations" ON engineering_conversation_associations;
CREATE POLICY "update_own_conversation_associations"
  ON engineering_conversation_associations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_conversation_associations" ON engineering_conversation_associations;
CREATE POLICY "delete_own_conversation_associations"
  ON engineering_conversation_associations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
