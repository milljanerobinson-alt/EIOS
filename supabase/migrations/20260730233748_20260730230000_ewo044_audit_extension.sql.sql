-- EWO-044: Audit Extension for Codex-Native ATD Conversation Engine
-- Extends audit records to capture provider identity, policy version, and governance decisions.

-- Add provider identity columns to atd_connect_inspection_log
ALTER TABLE atd_connect_inspection_log
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS provider_model TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS provider_version TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS policy_version TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS context_version TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_decision TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS governance_decision TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS requested_tools TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS executed_tools TEXT[] DEFAULT NULL;

-- Create conversation gateway audit table for per-turn audit
CREATE TABLE IF NOT EXISTS eios_conversation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_reference TEXT UNIQUE NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  user_role TEXT,
  project_id TEXT,
  ewo_ref TEXT,
  message TEXT NOT NULL,
  response_type TEXT NOT NULL,
  interpreted_request TEXT,
  proposed_lifecycle_action TEXT,
  governance_decision TEXT,
  provider TEXT,
  provider_model TEXT,
  provider_version TEXT,
  policy_version TEXT,
  context_version TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  tool_calls_made INTEGER DEFAULT 0,
  requested_tools TEXT[] DEFAULT ARRAY[]::TEXT[],
  executed_tools TEXT[] DEFAULT ARRAY[]::TEXT[],
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS on conversation audit
ALTER TABLE eios_conversation_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_conversation_audit" ON eios_conversation_audit
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_conversation_audit" ON eios_conversation_audit
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Index for conversation lookups
CREATE INDEX IF NOT EXISTS idx_eios_conversation_audit_conv_id
  ON eios_conversation_audit(conversation_id);

CREATE INDEX IF NOT EXISTS idx_eios_conversation_audit_user_id
  ON eios_conversation_audit(user_id);

CREATE INDEX IF NOT EXISTS idx_eios_conversation_audit_ewo_ref
  ON eios_conversation_audit(ewo_ref);
