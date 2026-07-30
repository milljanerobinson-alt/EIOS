/*
# EWO-016 — Conversation-Native Engineering Context Resolution

1. Purpose
   Establishes the canonical data structures for conversation-native engineering
   context resolution. Records all conversation-native execution actions for
   audit and traceability.

2. New Tables
   - `ecc_conversation_engineering_actions`
     Records governed conversation actions: user instruction, resolved object,
     resolution confidence, knowledge package version, eligibility outcome,
     execution created/submitted, provider selected, failures.
     This is an INSERT-only audit table (no UPDATE/DELETE from the app).

3. Engineering Standard
   - Seeds `ecc_engineering_standards` with ES-CONVERSATION-CONTEXT-001:
     "Conversation-Native Engineering Context Resolution"

4. Constitutional Amendment
   - Seeds `constitutional_documents` with AMD-006:
     "EIOS engineering intelligence must be grounded in canonical Engineering
     records before acting upon a referenced Engineering object."

5. Security
   - RLS enabled on `ecc_conversation_engineering_actions`.
   - Policies: authenticated users can INSERT and SELECT (audit table).
   - No UPDATE or DELETE policies — records are immutable from the app.

6. Important Notes
   - This table is append-only by design. Conversation actions are auditable.
   - Private model reasoning is never stored — only governed actions, evidence,
     outputs, and decisions.
*/

-- ─── Conversation Engineering Actions Table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ecc_conversation_engineering_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  user_instruction text NOT NULL,
  resolved_object text,
  resolution_confidence numeric DEFAULT 1.0,
  knowledge_package_version text,
  eligibility_outcome text,
  execution_created boolean DEFAULT false,
  execution_submitted boolean DEFAULT false,
  provider_selected text,
  failure_or_cancellation text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ecc_conversation_engineering_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_conversation_actions" ON ecc_conversation_engineering_actions;
CREATE POLICY "select_conversation_actions"
  ON ecc_conversation_engineering_actions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_conversation_actions" ON ecc_conversation_engineering_actions;
CREATE POLICY "insert_conversation_actions"
  ON ecc_conversation_engineering_actions FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_conversation_actions_conversation_id
  ON ecc_conversation_engineering_actions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_actions_created_at
  ON ecc_conversation_engineering_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_actions_resolved_object
  ON ecc_conversation_engineering_actions(resolved_object);

-- ─── Engineering Standard: Conversation-Native Context Resolution ────────────
INSERT INTO ecc_engineering_standards (version_introduced, category, title, body, status, sort_order)
SELECT '1.0', 'governance', 'Conversation-Native Engineering Context Resolution',
  'ATD resolves canonical Engineering objects before answering object-specific questions. Product Owners are never required to manually repeat canonical information already stored by EIOS. Engineering actions initiated through conversation use canonical service layers rather than generated text alone. Language models receive governed Engineering Knowledge Packages. Canonical records override model memory and historical conversation text. Unresolved references produce governed errors, not guesses. Execution progress is derived from canonical execution state. Automated AI review does not constitute Product Owner Verification or Acceptance.',
  'active', 100
WHERE NOT EXISTS (
  SELECT 1 FROM ecc_engineering_standards WHERE title = 'Conversation-Native Engineering Context Resolution'
);

-- ─── Constitutional Amendment AMD-006 ────────────────────────────────────────
INSERT INTO constitutional_documents (document_ref, title, document_type, version, status, sections, metadata)
SELECT 'AMD-006', 'Canonical Engineering Grounding', 'amendment', '1', 'active',
  jsonb_build_object(
    'principle', 'EIOS engineering intelligence must be grounded in canonical Engineering records before acting upon a referenced Engineering object.',
    'rules', jsonb_build_array(
      'No AI response may claim an Engineering object is missing when it exists in the canonical EIOS database.',
      'No AI response may ask the Product Owner to provide information already stored by EIOS.',
      'Conversation-native execution must invoke canonical service layers, not generate text that simulates engineering action.'
    )
  ),
  jsonb_build_object('ewo', 'EWO-016', 'amendment_number', 6)
WHERE NOT EXISTS (
  SELECT 1 FROM constitutional_documents WHERE document_ref = 'AMD-006'
);
