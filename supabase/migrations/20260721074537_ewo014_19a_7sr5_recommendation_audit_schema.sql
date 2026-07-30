/*
# EWO-014.19A.7SR.5 — Engineering Recommendation Audit Schema
#
# Persists every generated engineering recommendation for auditability.
# Never overwrites previous recommendations — each is a new row.
*/

CREATE TABLE IF NOT EXISTS engineering_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_ref text UNIQUE NOT NULL,
  alert_id uuid NOT NULL REFERENCES engineering_integrity_alerts(id) ON DELETE CASCADE,
  ewo_ref text,

  -- Recommendation details
  recommendation_type text NOT NULL,
  recommended_action text NOT NULL,
  engineering_reasoning text NOT NULL,
  summary text NOT NULL,

  -- Confidence (three separate concepts)
  evidence_confidence double precision NOT NULL DEFAULT 0,
  recommendation_confidence double precision NOT NULL DEFAULT 0,
  repair_confidence double precision NOT NULL DEFAULT 0,

  -- Risk
  risk_level text NOT NULL DEFAULT 'low',
  risk_reason text NOT NULL DEFAULT '',

  -- Automatic repair
  auto_repair_suitability text NOT NULL DEFAULT 'blocked',
  auto_repair_reason text NOT NULL DEFAULT '',

  -- PO decision support
  po_review_required boolean NOT NULL DEFAULT true,
  po_decision text,
  po_decision_notes text,
  po_decided_at timestamptz,
  po_decided_by text,

  -- Impact and alternatives
  expected_impact text NOT NULL DEFAULT '',
  alternative_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  known_limitations jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Evidence used
  evidence_used jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Never overwrite — superseded recommendations are marked, not deleted
  superseded_by uuid REFERENCES engineering_recommendations(id)
);

CREATE INDEX IF NOT EXISTS idx_rec_alert_id ON engineering_recommendations(alert_id);
CREATE INDEX IF NOT EXISTS idx_rec_ewo_ref ON engineering_recommendations(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_rec_type ON engineering_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_rec_po_review ON engineering_recommendations(po_review_required) WHERE po_review_required = true;

ALTER TABLE engineering_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_recommendations_authenticated" ON engineering_recommendations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_recommendations_authenticated" ON engineering_recommendations
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_recommendations_authenticated" ON engineering_recommendations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_recommendations_authenticated" ON engineering_recommendations
  FOR DELETE TO authenticated USING (true);
