-- EWO-017R.9 — Verification Evidence Simplification & Artefact-Derived Verification
-- Updates ES-003 to add the artefact-derived verification principle.

-- ─── 1. Update ES-003 Engineering Standard ──────────────────────────────────────

UPDATE ecc_engineering_standards
SET body = body || E'

### Artefact-Derived Verification Principle (EWO-017R.9)

Verification shall be derived from canonical engineering artefacts.
Engineering governance shall never require duplicate manual evidence where
the required evidence already exists within governed engineering records.

Applied to verification:
- performVerification() inspects canonical artefacts (build results,
  completion report, PO testing status, migration status, EWO lifecycle
  state) to determine eligibility — not manual evidence summaries.
- The "Evidence Required" blocking state is replaced with "Verification
  Requirements Not Met" which explains which canonical artefacts are
  missing.
- No verification path may require duplicate manual evidence entry.
- The Product Owner verifies the work itself, not documentation of evidence
  already contained elsewhere in EIOS.',
  updated_at = now()
WHERE version_introduced = 'ES-003';

-- ─── 2. Register EWO-017R.9 ─────────────────────────────────────────────────────

INSERT INTO engineering_work_orders (ewo_ref, title, executive_summary, status, priority, risk_level, parent_ref, created_at, updated_at)
SELECT
  'EWO-017R.9',
  'Verification Evidence Simplification & Artefact-Derived Verification',
  'Remove the mandatory manual evidence summary requirement from the verification workflow. Verification eligibility is now derived from canonical engineering artefacts (build results, completion report, PO testing, migration status, EWO lifecycle state) rather than requiring duplicate manual evidence entry. The "Evidence Required" blocking state is replaced with "Verification Requirements Not Met" explaining which artefacts are missing. A persistent governed verification result panel replaces the transient toast. ES-003 updated with artefact-derived verification principle.',
  'engineering_complete',
  'high',
  'medium',
  'EWO-017R.8',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-017R.9');

-- ─── 3. Audit trail ─────────────────────────────────────────────────────────────

INSERT INTO audit_trail (event_type, event_data, timestamp, category, severity, description)
SELECT
  'ewo017r9_artefact_derived_verification',
  jsonb_build_object(
    'ewo_ref', 'EWO-017R.9',
    'root_cause', 'The verification engine blocked verification unless a manual evidence summary or artefact was recorded. However, the EWO already contains canonical evidence (build results, completion report, test results, engineering package, verification matrix, PO testing, audit trail, lifecycle history). Requiring another evidence summary duplicates existing information without improving governance.',
    'correction', 'Replaced evaluateEvidence() with getArtefactEligibility() which inspects canonical engineering artefacts. Removed evidence_required blocking state, replaced with artefacts_required. Both Individual Verify and Verify All delegate to the same canonical performVerification() engine. Added persistent governed verification result panel.',
    'es003_update', 'Added artefact-derived verification principle to ES-003.',
    'completed_at', now()
  ),
  now(),
  'governance',
  'info',
  'EWO-017R.9 — Artefact-derived verification complete'
WHERE NOT EXISTS (
  SELECT 1 FROM audit_trail
  WHERE event_type = 'ewo017r9_artefact_derived_verification'
);
