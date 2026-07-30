-- EWO-017R.8 — Canonical Verification Behaviour Unification
-- Updates ES-003 to add the canonical delegation principle.

-- ─── 1. Update ES-003 Engineering Standard ──────────────────────────────────────

UPDATE ecc_engineering_standards
SET body = body || E'

### Canonical Delegation Principle (EWO-017R.8)

Alternative user workflows performing the same governed operation shall
delegate to a single canonical implementation and shall never produce
different governance outcomes.

Applied to verification:
- Individual Verify, Verify All Eligible, Verify Remaining, and Retry
  Failed Gates all delegate to performVerification().
- No duplicate verification logic may exist outside the canonical engine.
- Eligibility decisions, evidence behaviour, lifecycle progression, and
  audit records are always identical for the same EWO state regardless
  of which workflow initiated the verification.',
  updated_at = now()
WHERE version_introduced = 'ES-003';

-- ─── 2. Register EWO-017R.8 ─────────────────────────────────────────────────────

INSERT INTO engineering_work_orders (ewo_ref, title, executive_summary, status, priority, risk_level, parent_ref, created_at, updated_at)
SELECT
  'EWO-017R.8',
  'Canonical Verification Behaviour Unification',
  'Eliminate the governance inconsistency between Individual Verification and Verify All Eligible. Both workflows now delegate to a single canonical performVerification() engine, ensuring identical eligibility decisions, evidence behaviour, lifecycle progression, audit records, and outcomes. ES-003 updated with canonical delegation principle.',
  'engineering_complete',
  'high',
  'medium',
  'EWO-017R.7B',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-017R.8');

-- ─── 3. Audit trail ─────────────────────────────────────────────────────────────

INSERT INTO audit_trail (event_type, event_data, timestamp, category, severity, description)
SELECT
  'ewo017r8_canonical_verification_unification',
  jsonb_build_object(
    'ewo_ref', 'EWO-017R.8',
    'root_cause', 'Individual Verify called updateVerificationGate directly (no evidence check); Verify All called evaluateEvidence first (blocked if no evidence). Two separate verification paths produced different outcomes for the same EWO state.',
    'correction', 'Introduced canonical performVerification() in verificationOrchestrator.ts. Both Individual Verify and Verify All Eligible delegate to it. No duplicate verification logic remains.',
    'es003_update', 'Added canonical delegation principle to ES-003.',
    'completed_at', now()
  ),
  now(),
  'governance',
  'info',
  'EWO-017R.8 — Canonical verification behaviour unification complete'
WHERE NOT EXISTS (
  SELECT 1 FROM audit_trail
  WHERE event_type = 'ewo017r8_canonical_verification_unification'
);
