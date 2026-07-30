/*
# Engineering Audit Framework Refinement — Schema Extensions

## Summary
Adds supporting columns for the Phase X audit framework refinements:
audit type-specific comparison, score deltas, finding evidence, risk trends,
7-level maturity model, structured confidence reasoning, and recommendation
traceability (verified-by-audit, linked work references).

## Modified Tables

### ecc_audits
- `score_deltas` (jsonb): Stores per-category delta vs previous audit
  e.g. {"architecture": {"current": 82, "previous": 78, "delta": 4}}
- `confidence_reasoning` (jsonb): Structured confidence breakdown with pass/fail gates
- `maturity_gates` (jsonb): Gate data used to derive maturity level
- `previous_audit_type_id` (uuid): ID of the same-type previous audit used for comparison

### ecc_audit_findings
- `evidence` (jsonb): Array of evidence strings backing this finding
  e.g. ["86 registered features", "0 tested features", "21 compliance-critical"]
- `risk_trend` (text): Direction vs previous audit — new|improving|worsening|stable|resolved
- `previous_finding_title` (text): Title of the matched previous finding (for comparison)

### ecc_audit_recommendations
- `verified_by_audit_id` (uuid): Audit that verified this recommendation as completed
- `verified_by_audit_number` (text): Human-readable audit number that verified it
- `verified_at` (timestamptz): When it was verified
- `linked_work_ref` (text): Reference to linked existing work (e.g. TP-001, ENG-004)
- `linked_work_type` (text): Type of linked work (test_plan, feature, backlog, spec, rc)
- `linked_work_title` (text): Display title of the linked work item

## Notes
1. All additions are nullable — fully backwards compatible with existing records
2. score_deltas is populated by the generate-platform-audit edge function after AI generation
3. evidence and risk_trend are populated from finding-level AI output
*/

-- ecc_audits additions
ALTER TABLE ecc_audits
  ADD COLUMN IF NOT EXISTS score_deltas         jsonb,
  ADD COLUMN IF NOT EXISTS confidence_reasoning jsonb,
  ADD COLUMN IF NOT EXISTS maturity_gates       jsonb,
  ADD COLUMN IF NOT EXISTS previous_audit_type_id uuid REFERENCES ecc_audits(id) ON DELETE SET NULL;

-- ecc_audit_findings additions
ALTER TABLE ecc_audit_findings
  ADD COLUMN IF NOT EXISTS evidence             jsonb,
  ADD COLUMN IF NOT EXISTS risk_trend           text,
  ADD COLUMN IF NOT EXISTS previous_finding_title text;

-- ecc_audit_recommendations additions
ALTER TABLE ecc_audit_recommendations
  ADD COLUMN IF NOT EXISTS verified_by_audit_id     uuid REFERENCES ecc_audits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_by_audit_number text,
  ADD COLUMN IF NOT EXISTS verified_at              timestamptz,
  ADD COLUMN IF NOT EXISTS linked_work_ref          text,
  ADD COLUMN IF NOT EXISTS linked_work_type         text,
  ADD COLUMN IF NOT EXISTS linked_work_title        text;

CREATE INDEX IF NOT EXISTS idx_ecc_audit_findings_risk_trend ON ecc_audit_findings(risk_trend);
CREATE INDEX IF NOT EXISTS idx_ecc_audit_recs_verified_by ON ecc_audit_recommendations(verified_by_audit_id);
