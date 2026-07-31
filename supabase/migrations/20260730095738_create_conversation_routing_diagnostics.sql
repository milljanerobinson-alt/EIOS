-- EWO-040: Conversation Routing Diagnostics
-- Audit-safe observability for AI-assisted intent resolution.
-- Records routing method, confidence, selected intent, requested actions,
-- clarification status, referenced governed objects, and latency.
-- Does NOT log prompts, secrets, or chain-of-thought.

CREATE TABLE IF NOT EXISTS conversation_routing_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_reference text UNIQUE NOT NULL,
  conversation_id uuid,
  routing_method text NOT NULL CHECK (routing_method IN ('deterministic', 'ai_assisted', 'clarification', 'fallback')),
  primary_intent text NOT NULL,
  referenced_objects text[] DEFAULT '{}',
  requested_actions text[] DEFAULT '{}',
  rejected_proposals text[] DEFAULT '{}',
  replacement_task text,
  constraints text[] DEFAULT '{}',
  execution_authorised boolean DEFAULT false,
  required_next_stage text,
  confidence numeric(3,2) DEFAULT 0,
  clarification_required boolean DEFAULT false,
  reasoning_summary text,
  ewo_ref text,
  latency_ms integer,
  provider_used text,
  model_used text,
  error text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE conversation_routing_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_routing_diagnostics_staff"
  ON conversation_routing_diagnostics FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'product_owner', 'po', 'approver', 'trainer'))
  );

CREATE POLICY "insert_routing_diagnostics_authenticated"
  ON conversation_routing_diagnostics FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX idx_routing_diagnostics_conversation ON conversation_routing_diagnostics(conversation_id);
CREATE INDEX idx_routing_diagnostics_audit ON conversation_routing_diagnostics(audit_reference);
CREATE INDEX idx_routing_diagnostics_intent ON conversation_routing_diagnostics(primary_intent);
