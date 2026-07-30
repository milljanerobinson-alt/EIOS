-- AI provider model registry
CREATE TABLE IF NOT EXISTS ai_provider_models (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL,
  model_id     text NOT NULL,
  display_name text NOT NULL,
  model_type   text,
  is_active    boolean NOT NULL DEFAULT true,
  is_default   boolean NOT NULL DEFAULT false,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model_id)
);

ALTER TABLE ai_provider_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_ai_provider_models" ON ai_provider_models
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon_insert_ai_provider_models" ON ai_provider_models
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anon_update_ai_provider_models" ON ai_provider_models
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_ai_provider_models" ON ai_provider_models
  FOR DELETE TO anon, authenticated USING (true);

-- AI provider connection test results
CREATE TABLE IF NOT EXISTS ai_provider_test_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,
  model_id      text,
  status        text NOT NULL CHECK (status IN ('success', 'failed')),
  error_message text,
  latency_ms    int,
  tested_at     timestamptz NOT NULL DEFAULT now(),
  tested_by     uuid
);

ALTER TABLE ai_provider_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_ai_provider_test_results" ON ai_provider_test_results
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon_insert_ai_provider_test_results" ON ai_provider_test_results
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Seed OpenAI models
INSERT INTO ai_provider_models (provider, model_id, display_name, model_type, is_active, is_default, sort_order) VALUES
  ('openai', 'gpt-4o-mini',   'GPT-4o Mini',   'chat', true,  false, 10),
  ('openai', 'gpt-4o',        'GPT-4o',         'chat', true,  true,  20),
  ('openai', 'o3-mini',       'o3 Mini',         'reasoning', true, false, 30),
  ('openai', 'o3',            'o3',              'reasoning', true, false, 40),
  ('openai', 'gpt-5.4-nano',  'GPT-5.4 Nano',   'chat', true,  false, 50),
  ('openai', 'gpt-5.4-mini',  'GPT-5.4 Mini',   'chat', true,  false, 60),
  ('openai', 'gpt-5.4',       'GPT-5.4',         'chat', true,  false, 70),
  ('openai', 'gpt-5.5',       'GPT-5.5',         'chat', true,  false, 80)
ON CONFLICT (provider, model_id) DO NOTHING;

-- Seed Anthropic models
INSERT INTO ai_provider_models (provider, model_id, display_name, model_type, is_active, is_default, sort_order) VALUES
  ('anthropic', 'claude-3-5-haiku-20241022',  'Claude 3.5 Haiku',  'chat', true, false, 10),
  ('anthropic', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 'chat', true, true,  20),
  ('anthropic', 'claude-3-opus-20240229',     'Claude 3 Opus',     'chat', true, false, 30),
  ('anthropic', 'claude-opus-4-5',            'Claude Opus 4.5',   'chat', true, false, 40)
ON CONFLICT (provider, model_id) DO NOTHING;

-- Seed Gemini models
INSERT INTO ai_provider_models (provider, model_id, display_name, model_type, is_active, is_default, sort_order) VALUES
  ('gemini', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 'chat', true, true,  10),
  ('gemini', 'gemini-2.5-pro',   'Gemini 2.5 Pro',   'chat', true, false, 20),
  ('gemini', 'gemini-1.5-flash', 'Gemini 1.5 Flash', 'chat', true, false, 30),
  ('gemini', 'gemini-1.5-pro',   'Gemini 1.5 Pro',   'chat', true, false, 40)
ON CONFLICT (provider, model_id) DO NOTHING;
