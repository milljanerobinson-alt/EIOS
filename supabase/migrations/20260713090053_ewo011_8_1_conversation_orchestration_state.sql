/*
# EWO-011.8.1 — Conversation Orchestration State Columns

## Summary
Adds orchestration tracking columns to cc_ai_conversations to support
Conversation-First Engineering Orchestration. The ATD conversation is now
the primary engineering entry point; these columns track the live pipeline
state inline.

## Changes
### Modified Table: cc_ai_conversations
- `orchestration_state` (text) — current pipeline state:
  idle | assessing | duplicate_check | duplicate_found | creating_intent |
  generating_analysis | awaiting_analysis_approval | generating_plan |
  awaiting_plan_approval | complete | error
- `orchestration_intent_id` (uuid, nullable FK → atd_engineering_intents) —
  the Engineering Intent created or linked during this conversation session

## Notes
1. Both columns are nullable — existing conversations are unaffected.
2. orchestration_intent_id carries a FK to atd_engineering_intents for
   referential integrity. ON DELETE SET NULL so deleting an intent does not
   cascade-delete the conversation.
3. No RLS changes — cc_ai_conversations already has appropriate policies.
*/

ALTER TABLE cc_ai_conversations
  ADD COLUMN IF NOT EXISTS orchestration_state text,
  ADD COLUMN IF NOT EXISTS orchestration_intent_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'cc_ai_conversations_orchestration_intent_id_fkey'
      AND table_name = 'cc_ai_conversations'
  ) THEN
    ALTER TABLE cc_ai_conversations
      ADD CONSTRAINT cc_ai_conversations_orchestration_intent_id_fkey
      FOREIGN KEY (orchestration_intent_id)
      REFERENCES atd_engineering_intents(id)
      ON DELETE SET NULL;
  END IF;
END $$;
