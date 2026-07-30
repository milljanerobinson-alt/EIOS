/*
# EWO-017R.2R Refinement — Governed Conversation Identity & Context Binding

## Purpose
1. Creates atd_conversation_sessions table for governed conversation identity persistence
2. Enables deterministic conversation identity resolution for context binding

## Tables
- atd_conversation_sessions: Stores generated governed conversation identifiers
  so that subsequent requests in the same conversation can recover the identity
*/

CREATE TABLE IF NOT EXISTS atd_conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  identity_source TEXT NOT NULL DEFAULT 'generated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE atd_conversation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_conversation_sessions" ON atd_conversation_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_conversation_sessions" ON atd_conversation_sessions
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_own_conversation_sessions" ON atd_conversation_sessions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_conversation_sessions_client_id ON atd_conversation_sessions(client_id);