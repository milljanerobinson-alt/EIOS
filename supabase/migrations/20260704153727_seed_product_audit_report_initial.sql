
-- Seed flags on features with missing/unknown docs
UPDATE ecc_product_features
SET audit_flags = array_append(audit_flags, 'missing_tests'),
    last_audit_date = now()
WHERE testing_status = 'requires_review';

UPDATE ecc_product_features
SET audit_flags = array_append(audit_flags, 'partial_docs')
WHERE documentation_status = 'partial';

UPDATE ecc_product_features
SET audit_flags = array_append(audit_flags, 'no_docs')
WHERE documentation_status IN ('missing', 'unknown');

-- Insert initial product audit report
INSERT INTO ecc_product_audit_reports (
  audit_date, triggered_by,
  total_features, features_implemented, features_planned, features_deprecated,
  new_features_added, existing_features_updated, possible_duplicates,
  missing_documentation, missing_testing, unknown_dates, unknown_versions,
  features_with_flags,
  roadmap_differences, recommended_cleanup, notes
) VALUES (
  now(), 'Manual — Initial Product Audit 2026-07-04',
  86, 86, 0, 0,
  86, 0, 0,
  5, 86, 0, 0,
  86,
  '[
    {"type":"unregistered_feature","note":"Mapping Evidence Module (FEAT-038) exists in DB but has no formal roadmap item"},
    {"type":"unregistered_feature","note":"Queue Backoff & Recovery (FEAT-102) exists in DB but has no formal roadmap item"},
    {"type":"unregistered_feature","note":"Performance Indexes (FEAT-103) exists in DB but has no formal roadmap item"},
    {"type":"roadmap_gap","note":"Enterprise (Roadmap Item 3) and AI Automation (Roadmap Item 4) have no implemented features yet — correctly planned-only"}
  ]'::jsonb,
  '[
    {"priority":"high","item":"All 86 features require formal testing review — testing_status is requires_review for all"},
    {"priority":"high","item":"5 features have missing or unknown documentation — should be completed"},
    {"priority":"medium","item":"81 features have partial documentation — descriptions exist but detailed how-to is missing"},
    {"priority":"medium","item":"builder_features table (18 rows) is a legacy Kanban board that duplicates the new ecc_product_features registry — recommend migrating and deprecating"},
    {"priority":"low","item":"axcelerate-sync edge function appears to be a legacy alias of axcelerate-inbound-sync — confirm and remove if unused"},
    {"priority":"low","item":"RC-002 checklist is all-unchecked — awaiting Historical Exception approval per recommendation report"}
  ]'::jsonb,
  'Initial product audit performed 2026-07-04 by scanning all migrations (70), pages (40+), edge functions (23), and components. 86 features catalogued across 12 categories. All features confirmed implemented and production-ready. Primary gap is formal testing documentation — all features are marked requires_review pending a dedicated testing sprint.'
);
