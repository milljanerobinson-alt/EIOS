CREATE TABLE IF NOT EXISTS builder_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE builder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_builder_settings" ON builder_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "anon_select_builder_settings" ON builder_settings
  FOR SELECT TO anon USING (true);

CREATE POLICY "auth_insert_builder_settings" ON builder_settings
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_builder_settings" ON builder_settings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_delete_builder_settings" ON builder_settings
  FOR DELETE TO authenticated USING (true);

INSERT INTO builder_settings (key, value) VALUES (
  'vision_card',
  jsonb_build_object(
    'title', 'Product Vision & MVP Scope',
    'description', $$Customer lands on website
        ↓
Signs up
        ↓
Chooses a subscription
        ↓
Organisation dashboard created
        ↓
Set up aXcelerate integration
        ↓
Import qualifications
        ↓
System automatically imports ACSF mappings
        ↓
Student enrols in aXcelerate which creates student in LLN portal
        ↓
Student receives secure assessment link
        ↓
Student verifies identity
        ↓
Student completes:
    • LLN Assessment
    • Digital Assessment
        ↓
AI marks assessment
        ↓
AI compares results against qualification ACSF requirements
        ↓
AI determines if intervention is required
        ↓
Admin reviews recommendations
        ↓
Admin records intervention (if required)
        ↓
Final compliance report generated
        ↓
Audit-ready PDF$$
  )
) ON CONFLICT (key) DO NOTHING;
