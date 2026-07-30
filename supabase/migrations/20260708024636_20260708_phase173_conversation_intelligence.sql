-- Phase 17.3: Conversation Intelligence Indexing
-- Creates ecc_conversation_intelligence table for structured ATD conversation intelligence

CREATE TABLE IF NOT EXISTS ecc_conversation_intelligence (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id         text NOT NULL,
  conversation_title      text NOT NULL,
  conversation_type       text NOT NULL, -- 13 types: see service
  engineering_area        text,
  summary                 text,
  extracted_decisions     jsonb DEFAULT '[]'::jsonb,
  extracted_risks         jsonb DEFAULT '[]'::jsonb,
  extracted_lessons       jsonb DEFAULT '[]'::jsonb,
  extracted_recommendations jsonb DEFAULT '[]'::jsonb,
  extracted_po_feedback   jsonb DEFAULT '[]'::jsonb,
  related_ercs            text[] DEFAULT '{}',
  related_ewos            text[] DEFAULT '{}',
  related_test_plans      text[] DEFAULT '{}',
  related_audits          text[] DEFAULT '{}',
  related_benchmarks      text[] DEFAULT '{}',
  related_releases        text[] DEFAULT '{}',
  related_modules         text[] DEFAULT '{}',
  lineage_status          text NOT NULL DEFAULT 'active', -- active, superseded, archived
  superseded_by           text,
  confidence_score        numeric(4,3) DEFAULT 0.0,
  indexed_at              timestamptz DEFAULT now(),
  index_version           text NOT NULL DEFAULT '1.0',
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE ecc_conversation_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_conv_intelligence" ON ecc_conversation_intelligence
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "insert_conv_intelligence" ON ecc_conversation_intelligence
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "update_conv_intelligence" ON ecc_conversation_intelligence
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "delete_conv_intelligence" ON ecc_conversation_intelligence
  FOR DELETE TO anon, authenticated USING (true);

-- Index for fast conversation lookup
CREATE INDEX IF NOT EXISTS idx_conv_intelligence_conv_id ON ecc_conversation_intelligence(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_intelligence_type ON ecc_conversation_intelligence(conversation_type);
CREATE INDEX IF NOT EXISTS idx_conv_intelligence_area ON ecc_conversation_intelligence(engineering_area);
CREATE INDEX IF NOT EXISTS idx_conv_intelligence_status ON ecc_conversation_intelligence(lineage_status);
