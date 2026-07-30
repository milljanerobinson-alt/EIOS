/*
# Add computed count columns to ecc_audits

1. Changes to ecc_audits
   - critical_findings_count (int) — populated by edge function after findings insert
   - high_findings_count (int)
   - medium_findings_count (int)
   - low_findings_count (int)
   - total_findings_count (int)
   - total_features (int) — platform feature snapshot at time of audit
   - features_released (int)
   - features_in_review (int)
   - features_in_development (int)
   - release_readiness (text) — convenience alias for release_readiness_production

2. No destructive operations — all ADD COLUMN IF NOT EXISTS
*/

ALTER TABLE ecc_audits
  ADD COLUMN IF NOT EXISTS critical_findings_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_findings_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medium_findings_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_findings_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_findings_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_features int,
  ADD COLUMN IF NOT EXISTS features_released int,
  ADD COLUMN IF NOT EXISTS features_in_review int,
  ADD COLUMN IF NOT EXISTS features_in_development int,
  ADD COLUMN IF NOT EXISTS release_readiness text;
