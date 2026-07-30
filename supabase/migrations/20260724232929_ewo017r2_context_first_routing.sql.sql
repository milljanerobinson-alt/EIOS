CREATE TABLE IF NOT EXISTS atd_conversation_active_object (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  active_object_reference text NOT NULL,
  active_object_type text NOT NULL,
  active_object_title text,
  lifecycle_stage text,
  last_governed_operation text,
  linked_analysis_ref text,
  linked_plan_ref text,
  context_timestamp timestamptz NOT NULL DEFAULT now(),
  source_of_activation text NOT NULL DEFAULT 'governed_operation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_active_obj_conv ON atd_conversation_active_object (conversation_id);

ALTER TABLE atd_conversation_active_object ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_sel_conv_active_obj" ON atd_conversation_active_object;
CREATE POLICY "anon_sel_conv_active_obj" ON atd_conversation_active_object FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_ins_conv_active_obj" ON atd_conversation_active_object;
CREATE POLICY "anon_ins_conv_active_obj" ON atd_conversation_active_object FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_upd_conv_active_obj" ON atd_conversation_active_object;
CREATE POLICY "anon_upd_conv_active_obj" ON atd_conversation_active_object FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_del_conv_active_obj" ON atd_conversation_active_object;
CREATE POLICY "anon_del_conv_active_obj" ON atd_conversation_active_object FOR DELETE TO anon, authenticated USING (true);