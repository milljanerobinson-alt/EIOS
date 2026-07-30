/*
# BUG-006: Register BUG-005 and BUG-005R.1 as Engineering Work Orders

## Root Cause
Condition C: BUG-005 and BUG-005R.1 were recorded in the Engineering Change
Ledger and referenced by EA-BUG005R1, but were never registered as
Engineering Work Orders in the engineering_work_orders table.

## Evidence
- ECL-BUG005-EXEC-001: ledger event for BUG-005 execution
- ECL-BUG005R1-EXEC-001: ledger event for BUG-005R.1 execution
- EA-BUG005R1: engineering audit with source_ewo_refs = [BUG-005, BUG-005R.1]
- Migration 20260722025928_20260722050000_bug005r1_lifecycle_reconciliation.sql
- Test files: bug005_ewo_register_audit.test.ts (42 tests)

## Classification
Governed historical recovery — not ordinary new implementation.
No Product Owner Acceptance recorded. No closure. No fabricated timestamps.
*/

-- ─── 1. Register BUG-005 ──────────────────────────────────────────────────────
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, engineering_objective,
  priority, risk_level, status, engineering_classification,
  is_historical_import, import_source, historical_notes,
  verification_status, implementation_status, engineering_package_status,
  parent_ref, bootstrap_origin, bootstrap_reason, bootstrap_date,
  created_at, updated_at
) VALUES (
  'BUG-005',
  'BUG-005 — Engineering Work Order Register Audit',
  'Complete Engineering Work Order register audit covering 73 records (69 EWOs + 4 historical references). Identified 6 Confirmed Engineering Defects, 8 Product Owner Governance Decisions, 16 Lifecycle Issues, and 12 Evidence Issues. Established governance principle: Engineering history is authoritative, numbering is advisory. No historical records fabricated.',
  'Audit the Engineering Work Order register for integrity, completeness, and governance maturity. Produce a governed Engineering Audit record (EA-BUG005R1) with health scores and remediation packages.',
  'high',
  'medium',
  'engineering_complete',
  'Bug',
  true,
  'governed_historical_recovery',
  'BUG-006: Registered as governed historical recovery. BUG-005 activity occurred prior to registration. Evidence: ECL-BUG005-EXEC-001, EA-BUG005R1 audit, migration 20260722025928. No fabricated timestamps, prompts, or acceptance evidence.',
  'not_started',
  'complete',
  'generated',
  NULL,
  'BUG-006-recovery',
  'BUG-005 was referenced in the Engineering Change Ledger and EA-BUG005R1 audit but was never registered as an Engineering Work Order. Registered via governed historical recovery per BUG-006.',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (ewo_ref) DO NOTHING;

-- ─── 2. Register BUG-005R.1 ───────────────────────────────────────────────────
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, engineering_objective,
  priority, risk_level, status, engineering_classification,
  is_historical_import, import_source, historical_notes,
  verification_status, implementation_status, engineering_package_status,
  parent_ref, bootstrap_origin, bootstrap_reason, bootstrap_date,
  created_at, updated_at
) VALUES (
  'BUG-005R.1',
  'BUG-005R.1 — Engineering Register Integrity Audit Refinement',
  'Refinement of BUG-005: Audit validation, lifecycle closeout, and evidence-based remediation refinement. Pre-audit lifecycle reconciliation closed BUG-002 and EWO-014.19A.7SR.6. Produced the Engineering Register Integrity Audit (EA-BUG005R1) with 4 remediation packages.',
  'Validate BUG-005 audit findings, perform lifecycle reconciliation, and produce the governed Engineering Audit record with health scores, findings classification, and remediation packages.',
  'high',
  'medium',
  'engineering_complete',
  'Bug',
  true,
  'governed_historical_recovery',
  'BUG-006: Registered as governed historical recovery. BUG-005R.1 activity occurred prior to registration. Evidence: ECL-BUG005R1-EXEC-001, EA-BUG005R1 audit, migration 20260722025928. No fabricated timestamps, prompts, or acceptance evidence.',
  'not_started',
  'complete',
  'generated',
  'BUG-005',
  'BUG-006-recovery',
  'BUG-005R.1 was referenced in the Engineering Change Ledger and EA-BUG005R1 audit but was never registered as an Engineering Work Order. Registered via governed historical recovery per BUG-006.',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (ewo_ref) DO NOTHING;

-- ─── 3. Verify EA-BUG005R1 source_ewo_refs match canonical records ────────────
-- The audit already has source_ewo_refs = ['BUG-005', 'BUG-005R.1'] which now
-- match actual Work Order records. No correction needed.

-- ─── 4. Register BUG-006 as an Engineering Work Order ─────────────────────────
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, engineering_objective,
  priority, risk_level, status, engineering_classification,
  is_historical_import, import_source, historical_notes,
  verification_status, implementation_status, engineering_package_status,
  parent_ref, bootstrap_origin, bootstrap_reason, bootstrap_date,
  created_at, updated_at
) VALUES (
  'BUG-006',
  'BUG-006 — Missing BUG-005 Work Order Records & Audit Traceability Correction',
  'Root cause: Condition C — BUG-005 and BUG-005R.1 were recorded in the Engineering Change Ledger and referenced by EA-BUG005R1 but were never registered as Engineering Work Orders. Corrected via governed historical recovery. Added bidirectional EWO↔Audit traceability to the Work Order detail UI.',
  'Investigate why BUG-005 and BUG-005R.1 are not discoverable in the Engineering Work Orders register, correct the authoritative record, and complete bidirectional audit traceability.',
  'high',
  'medium',
  'engineering_complete',
  'Bug',
  false,
  NULL,
  NULL,
  'not_started',
  'complete',
  'generated',
  NULL,
  NULL,
  NULL,
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (ewo_ref) DO NOTHING;
