-- Expand architecture_guardian_reviews for Engineering Guardian governance
ALTER TABLE architecture_guardian_reviews
  ADD COLUMN IF NOT EXISTS trigger_source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS findings jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS maintainability_score int,
  ADD COLUMN IF NOT EXISTS technical_debt_score int,
  ADD COLUMN IF NOT EXISTS complexity_score int,
  ADD COLUMN IF NOT EXISTS mc_compliance_score int,
  ADD COLUMN IF NOT EXISTS engineering_health_score int,
  ADD COLUMN IF NOT EXISTS immediate_recommendations jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recommended_improvements jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS future_improvements jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS performance_issues int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS security_issues int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS technical_debt_items int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_components int DEFAULT 0;

-- Release gate configuration table
CREATE TABLE IF NOT EXISTS engineering_guardian_release_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  gate_type text NOT NULL CHECK (gate_type IN (
    'no_critical_findings', 'max_high_risk', 'min_engineering_health',
    'min_mc_compliance', 'no_security_issues', 'no_layout_regressions',
    'max_technical_debt', 'min_maintainability'
  )),
  threshold_value int,
  severity text CHECK (severity IN ('blocking', 'warning')) DEFAULT 'blocking',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE engineering_guardian_release_gates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_release_gates" ON engineering_guardian_release_gates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_release_gates" ON engineering_guardian_release_gates
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_release_gates" ON engineering_guardian_release_gates
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_release_gates" ON engineering_guardian_release_gates
  FOR DELETE TO authenticated USING (true);

-- Seed default release gate rules
INSERT INTO engineering_guardian_release_gates (name, description, gate_type, threshold_value, severity) VALUES
  ('No Critical Findings', 'Block release if any critical engineering findings remain unresolved', 'no_critical_findings', null, 'blocking'),
  ('High Risk Limit', 'Warn if more than 3 high-risk reviews are pending PO approval', 'max_high_risk', 3, 'warning'),
  ('Engineering Health Threshold', 'Warn if average engineering health score falls below 60', 'min_engineering_health', 60, 'warning'),
  ('Mission Control Compliance', 'Warn if MC compliance score falls below 70', 'min_mc_compliance', 70, 'warning'),
  ('Security Issues', 'Block release if any unresolved security findings exist', 'no_security_issues', null, 'blocking'),
  ('No Layout Regressions', 'Warn if high or critical layout violations are pending', 'no_layout_regressions', null, 'warning')
ON CONFLICT DO NOTHING;
