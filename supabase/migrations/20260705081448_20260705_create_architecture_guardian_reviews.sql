-- Architecture Guardian Reviews
-- Stores all review history, proposals, decisions, and approval records.

CREATE TABLE architecture_guardian_reviews (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_number             text NOT NULL UNIQUE,
  title                     text NOT NULL,
  proposed_change_summary   text NOT NULL,
  change_type               text NOT NULL,
  review_mode               text NOT NULL DEFAULT 'prospective',

  decision                  text,
  confidence_score          integer,
  confidence_reason         text,
  duplicate_risk            text,
  recommended_sot           text,
  recommended_approach      text,
  recommended_nav_location  text,
  data_model_impact         text,
  component_reuse           text,
  performance_impact        text,
  risk_level                text,

  existing_related_areas    jsonb DEFAULT '[]',
  potential_duplicates      jsonb DEFAULT '[]',
  evidence_found            jsonb DEFAULT '[]',
  manual_checks_required    jsonb DEFAULT '[]',
  uncertainty_notes         text,

  markdown_report           text,

  approval_status           text NOT NULL DEFAULT 'pending',
  approved_by               text,
  approved_at               timestamptz,
  po_notes                  text,

  linked_feature_id         uuid REFERENCES ecc_product_features(id) ON DELETE SET NULL,
  linked_rc_id              uuid REFERENCES ecc_release_candidates(id) ON DELETE SET NULL,
  linked_phase_id           uuid,
  linked_audit_id           uuid REFERENCES ecc_audits(id) ON DELETE SET NULL,
  linked_roadmap_item_id    uuid,

  ai_model_used             text,
  ai_provider               text,
  generation_time_ms        integer,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE architecture_guardian_seq START 1;

CREATE OR REPLACE FUNCTION next_agr_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE seq_val int;
BEGIN
  seq_val := nextval('architecture_guardian_seq');
  RETURN 'AGR-' || LPAD(seq_val::text, 3, '0');
END;
$$;

ALTER TABLE architecture_guardian_reviews
  ALTER COLUMN review_number SET DEFAULT next_agr_number();

CREATE OR REPLACE FUNCTION update_agr_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER agr_updated_at
  BEFORE UPDATE ON architecture_guardian_reviews
  FOR EACH ROW EXECUTE FUNCTION update_agr_updated_at();

ALTER TABLE architecture_guardian_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_agr" ON architecture_guardian_reviews
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_agr" ON architecture_guardian_reviews
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "update_agr" ON architecture_guardian_reviews
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "delete_agr" ON architecture_guardian_reviews
  FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_agr_decision     ON architecture_guardian_reviews(decision);
CREATE INDEX idx_agr_approval     ON architecture_guardian_reviews(approval_status);
CREATE INDEX idx_agr_change_type  ON architecture_guardian_reviews(change_type);
CREATE INDEX idx_agr_created_at   ON architecture_guardian_reviews(created_at DESC);
CREATE INDEX idx_agr_feature_id   ON architecture_guardian_reviews(linked_feature_id) WHERE linked_feature_id IS NOT NULL;
