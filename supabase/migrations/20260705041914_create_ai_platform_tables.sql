-- AI Feature Configuration: per-feature provider/model routing
CREATE TABLE IF NOT EXISTS ai_feature_configuration (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key  text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description  text,
  category     text,
  provider     text,
  model        text,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_feature_configuration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_ai_feature_configuration" ON ai_feature_configuration FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_ai_feature_configuration" ON ai_feature_configuration FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_ai_feature_configuration" ON ai_feature_configuration FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_ai_feature_configuration" ON ai_feature_configuration FOR DELETE TO anon, authenticated USING (true);

INSERT INTO ai_feature_configuration (feature_key, display_name, description, category, enabled) VALUES
  ('support_plan_generator',   'Support Plan Generator',   'Generates personalised learner support plans',           'Assessment',    true),
  ('course_page_generator',    'Course Page Generator',    'Creates course description and page content',            'Content',       true),
  ('qualification_summary',    'Qualification Summary',    'Summarises qualification requirements and outcomes',     'Content',       true),
  ('compliance_assistant',     'Compliance Assistant',     'Assists with compliance documentation and evidence',     'Compliance',    true),
  ('audit_evidence_generator', 'Audit Evidence Generator', 'Generates evidence summaries for platform audits',      'Engineering',   true),
  ('engineering_assistant',    'Engineering Assistant',    'AI Technical Director for platform development',        'Engineering',   true),
  ('documentation_assistant',  'Documentation Assistant',  'Generates and maintains technical documentation',       'Engineering',   true),
  ('release_notes_generator',  'Release Notes Generator',  'Generates release notes from backlog and commits',      'Engineering',   true)
ON CONFLICT (feature_key) DO NOTHING;

-- Prompt library with version history
CREATE TABLE IF NOT EXISTS ai_prompt_library (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  category      text NOT NULL DEFAULT 'General Testing',
  system_prompt text NOT NULL DEFAULT '',
  user_prompt   text NOT NULL DEFAULT '',
  provider      text,
  model         text,
  temperature   numeric NOT NULL DEFAULT 0.7,
  max_tokens    int NOT NULL DEFAULT 1000,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  version       int NOT NULL DEFAULT 1,
  parent_id     uuid REFERENCES ai_prompt_library(id),
  tags          text[],
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_prompt_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_ai_prompt_library" ON ai_prompt_library FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_ai_prompt_library" ON ai_prompt_library FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_ai_prompt_library" ON ai_prompt_library FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_ai_prompt_library" ON ai_prompt_library FOR DELETE TO anon, authenticated USING (true);

-- Playground execution history
CREATE TABLE IF NOT EXISTS ai_playground_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL,
  model            text NOT NULL,
  prompt_name      text,
  system_prompt    text,
  user_prompt      text NOT NULL,
  response         text,
  input_tokens     int,
  output_tokens    int,
  total_tokens     int,
  estimated_cost   numeric,
  execution_time_ms int,
  success          boolean NOT NULL DEFAULT true,
  error_message    text,
  temperature      numeric,
  max_tokens       int,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_playground_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_ai_playground_history" ON ai_playground_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_ai_playground_history" ON ai_playground_history FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_delete_ai_playground_history" ON ai_playground_history FOR DELETE TO anon, authenticated USING (true);
