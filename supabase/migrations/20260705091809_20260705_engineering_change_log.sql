-- Engineering Change Log: permanent record of every engineering action
CREATE SEQUENCE IF NOT EXISTS ecc_change_log_seq START 1;

CREATE TABLE IF NOT EXISTS ecc_engineering_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_id text UNIQUE DEFAULT 'CL-' || LPAD(nextval('ecc_change_log_seq')::text, 4, '0'),
  summary text NOT NULL,
  description text,
  change_type text NOT NULL DEFAULT 'feature' CHECK (change_type IN (
    'feature', 'refactor', 'database', 'api', 'workflow', 'documentation',
    'security', 'performance', 'layout', 'infrastructure', 'release', 'bugfix', 'other'
  )),
  feature_id text,
  release_id uuid,
  phase_id uuid,
  guardian_review_id uuid REFERENCES architecture_guardian_reviews(id) ON DELETE SET NULL,
  files_changed jsonb DEFAULT '[]'::jsonb,
  database_changes text,
  api_changes text,
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  regression_results text,
  approval_status text CHECK (approval_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  implementation_notes text,
  created_by text DEFAULT 'system',
  engineering_health_before int,
  engineering_health_after int,
  guardian_passed boolean,
  documentation_updated boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ecc_engineering_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_change_log" ON ecc_engineering_change_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_change_log" ON ecc_engineering_change_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_change_log" ON ecc_engineering_change_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_change_log" ON ecc_engineering_change_log FOR DELETE TO authenticated USING (true);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_change_log_created ON ecc_engineering_change_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_log_feature ON ecc_engineering_change_log(feature_id);
CREATE INDEX IF NOT EXISTS idx_change_log_type ON ecc_engineering_change_log(change_type);
