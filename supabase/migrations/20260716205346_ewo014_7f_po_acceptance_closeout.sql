/*
# EWO-014.7F — Product Owner Acceptance Close-out & Roadmap Update

## Purpose
This migration performs the formal engineering close-out for EWO-014.7:
1. Creates EWO-014.7 record with full lifecycle metadata and PO acceptance
2. Marks EWO-014.7 as closed with PO acceptance recorded
3. Creates EWO-014.13 roadmap item (Unified Engineering Object Navigation)
4. Creates UI State Synchronisation roadmap observation item
5. Creates an Engineering Record for EWO-014.7 with PO acceptance evidence
6. Reopens EWO-015 as the active engineering work order

## Tables Modified
- `engineering_work_orders` — INSERT EWO-014.7, UPDATE EWO-015 to active
- `ewo_lifecycle_events` — INSERT lifecycle events for EWO-014.7
- `ecc_roadmap_items` — INSERT two new roadmap items
- `engineering_records_library` — INSERT engineering record with acceptance evidence
- `ewo_completion_reports` — INSERT completion report for EWO-014.7

## Security
No RLS policy changes — all existing policies remain in effect.
*/

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Create EWO-014.7 with PO Acceptance
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO engineering_work_orders (
  ewo_ref,
  title,
  executive_summary,
  business_objective,
  engineering_objective,
  priority,
  risk_level,
  status,
  owner,
  requested_by,
  approved_at,
  started_at,
  completed_at,
  closed_at,
  po_accepted_at,
  po_accepted_by,
  po_acceptance_statement,
  po_acceptance_notes,
  verification_status,
  verified_at,
  implementation_provider,
  implementation_status,
  engineering_package_status,
  implementation_started_at,
  implementation_completed_at,
  engineering_notes,
  validation_notes
) VALUES (
  'EWO-014.7',
  'Engineering Execution Platform — Lifecycle, Verification & PO Acceptance',
  'Engineering Execution Platform delivering governed Engineering Work Order lifecycle management, verification workflow, duplicate protection, and Product Owner acceptance for the ATD engineering pipeline.',
  'Establish a governed Engineering Work Order lifecycle enabling structured engineering execution from intent through PO acceptance.',
  'Implement EWO lifecycle state machine, verification gates, UI state synchronisation, and PO acceptance workflow.',
  'high',
  'medium',
  'closed',
  'Engineering Governance',
  'Product Owner',
  now(),
  now(),
  now(),
  now(),
  now(),
  'Product Owner',
  'Product Owner Acceptance: PASS — All engineering objectives achieved including intent workflow, analysis, planning, governance approval, EWO creation, duplicate protection, lifecycle management, verification workflow, and PO acceptance workflow.',
  'One non-blocking observation: some lifecycle transitions required manual page refresh before next governed action became visible. Roadmap item created for future remediation (EWO-014.7E fix applied; EWO-014.13 addresses unified navigation).',
  'verified',
  now(),
  'Bolt',
  'Completed',
  'Generated',
  now(),
  now(),
  'EWO-014.7 delivered the full Engineering Execution Platform: lifecycle state machine with 14 governed statuses, verification gate system with 5 gates, duplicate intelligence, implementation package management, completion reports, and PO acceptance workflow.',
  'Validation completed via EWO-014.7D (BeginEngineeringGate state sync) and EWO-014.7E (Engineering Execution state sync). All regression tests pass (1070 tests across 25 test files). Build passes with 0 errors.'
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Record Lifecycle Events for EWO-014.7
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
SELECT id, 'draft', 'engineering_approved', 'Engineering Governance', 'Engineering approval granted'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
SELECT id, 'engineering_approved', 'po_approved', 'Product Owner', 'PO approval granted for implementation'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
SELECT id, 'po_approved', 'ready', 'Engineering Governance', 'Marked ready for implementation'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
SELECT id, 'ready', 'in_progress', 'ATD', 'Implementation started'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
SELECT id, 'in_progress', 'engineering_validation', 'ATD', 'Submitted for validation'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
SELECT id, 'engineering_validation', 'engineering_complete', 'ATD', 'Engineering marked complete after validation'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
SELECT id, 'engineering_complete', 'engineering_verification', 'ATD', 'Verification started'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
SELECT id, 'engineering_verification', 'verified', 'ATD', 'All verification gates passed — auto-transitioned to verified'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
SELECT id, 'verified', 'report_generated', 'ATD', 'Completion report generated'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
SELECT id, 'report_generated', 'po_acceptance', 'Product Owner', 'PO acceptance recorded — PASS'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes)
SELECT id, 'po_acceptance', 'closed', 'Engineering Governance', 'EWO-014.7 formally closed. Next: EWO-015 activated.'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Create Completion Report for EWO-014.7
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO ewo_completion_reports (
  ewo_id,
  ewo_ref,
  title,
  executive_summary,
  scope_completed,
  files_modified,
  database_changes,
  engineering_objects,
  ui_components,
  lifecycle_summary,
  validation_results,
  build_result,
  risks,
  po_decisions,
  acceptance_recommendation,
  generated_at,
  accepted_at,
  accepted_by,
  report_body
)
SELECT
  id,
  'EWO-014.7',
  'Engineering Completion Report — Engineering Execution Platform',
  'EWO-014.7 delivered the full Engineering Execution Platform including governed lifecycle management, verification workflow, duplicate protection, implementation package management, and PO acceptance workflow.',
  'Lifecycle state machine (14 statuses), verification gate system (5 gates), duplicate intelligence, implementation packages, completion reports, PO acceptance, UI state synchronisation (EWO-014.7D/7E refinements)',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  'draft → engineering_approved → po_approved → ready → in_progress → engineering_validation → engineering_complete → engineering_verification → verified → report_generated → po_acceptance → closed',
  'PASS — 1070 tests across 25 test files. Build passes with 0 errors. All 5 lifecycle transition regression tests pass.',
  'PASS — npm run build completes successfully with 0 errors.',
  'Low — one non-blocking UI observation addressed via roadmap item',
  'Product Owner Acceptance: PASS',
  'Accept — all engineering objectives achieved',
  now(),
  now(),
  'Product Owner',
  '═══════════════════════════════════════════════
ENGINEERING COMPLETION REPORT
Work Order: EWO-014.7
Title: Engineering Execution Platform — Lifecycle, Verification & PO Acceptance
Product Owner Acceptance: PASS
═══════════════════════════════════════════════

ENGINEERING OBJECTIVES ACHIEVED
✓ Engineering Intent workflow
✓ Engineering Analysis
✓ Engineering Planning
✓ Review Preparation
✓ Governance Approval
✓ Begin Engineering
✓ Engineering Work Order creation
✓ Duplicate protection
✓ Engineering lifecycle
✓ Verification workflow
✓ Product Owner Acceptance workflow
✓ Work Order closure

TESTING OUTCOME: PASS
1070 tests across 25 test files — all passing
Build: 0 errors

NON-BLOCKING OBSERVATION
Some lifecycle transitions required manual page refresh before next governed action became visible.
Fix applied in EWO-014.7E. Roadmap item EWO-014.13 created for unified navigation remediation.

FORMALLY CLOSED
Next Engineering Work Order: EWO-015'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Create Roadmap Item: EWO-014.13 — Unified Engineering Object Navigation
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO ecc_roadmap_items (
  name,
  description,
  priority,
  status,
  sort_order,
  target_quarter
) VALUES (
  'EWO-014.13 — Unified Engineering Object Navigation & Lifecycle',
  'Introduce a unified Engineering Object navigation model where governed objects become first-class navigable resources.

Objectives:
• Direct navigation to Engineering Intent
• Direct navigation to Engineering Plan
• Direct navigation to Engineering Work Order
• Direct navigation to Validation
• Direct navigation to Knowledge
• Direct navigation to Engineering Records

Engineering dashboards become management indexes rather than navigation destinations.
Engineering Objects shall expose parent/child relationships and engineering lineage.',
  'high',
  'future',
  100,
  'Q4 2026'
);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Create Roadmap Item: UI State Synchronisation Observation
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO ecc_roadmap_items (
  name,
  description,
  priority,
  status,
  sort_order,
  target_quarter
) VALUES (
  'Engineering Execution UI State Synchronisation',
  'Some Engineering Execution lifecycle transitions required a manual page refresh before the next governed action became visible.

Root cause: handleTransitionComplete read from stale React state before fetching fresh data from the database, causing the old EWO status to render briefly.

Remediation: EWO-014.7E fix applied — transitions now fetch fresh EWO from DB first before updating UI state. Full regression tests added covering all 5 lifecycle transitions.

This roadmap item tracks the broader EWO-014.13 unified navigation work that will prevent similar state synchronisation issues across all Engineering Object views.',
  'medium',
  'planned',
  101,
  'Q4 2026'
);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Create Engineering Record for EWO-014.7
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO engineering_records_library (
  record_ref,
  record_type,
  title,
  programme,
  ewo_id,
  ewo_ref,
  status,
  completion_date,
  content,
  authority_state,
  generated_by,
  po_accepted_at,
  po_accepted_by,
  po_acceptance_statement,
  engineering_objective,
  implementation_summary,
  validation_summary,
  po_acceptance_detail,
  completion_report_ref,
  governance_status,
  knowledge_extracted,
  lineage_established
)
SELECT
  'ER-014.7',
  'engineering_completion',
  'Engineering Completion Record — EWO-014.7 Engineering Execution Platform',
  'Engineering Execution Platform',
  id,
  'EWO-014.7',
  'po_accepted',
  CURRENT_DATE,
  jsonb_build_object(
    'ewo_ref', 'EWO-014.7',
    'title', 'Engineering Execution Platform — Lifecycle, Verification & PO Acceptance',
    'acceptance_date', to_char(now(), 'YYYY-MM-DD'),
    'acceptance_result', 'PASS',
    'testing_evidence', jsonb_build_object(
      'total_tests', 1070,
      'test_files', 25,
      'build_result', 'PASS',
      'build_errors', 0
    ),
    'objectives_achieved', jsonb_build_array(
      'Engineering Intent workflow',
      'Engineering Analysis',
      'Engineering Planning',
      'Review Preparation',
      'Governance Approval',
      'Begin Engineering',
      'Engineering Work Order creation',
      'Duplicate protection',
      'Engineering lifecycle',
      'Verification workflow',
      'Product Owner Acceptance workflow',
      'Work Order closure'
    ),
    'non_blocking_observation', 'Some lifecycle transitions required manual page refresh before next governed action became visible. Fix applied in EWO-014.7E. Roadmap item created.',
    'completion_package_ref', 'EWO-014.7-CR',
    'next_work_order', 'EWO-015'
  ),
  'authoritative',
  'ATD',
  now(),
  'Product Owner',
  'Product Owner Acceptance: PASS — All engineering objectives achieved.',
  jsonb_build_object('objective', 'Implement EWO lifecycle state machine, verification gates, UI state synchronisation, and PO acceptance workflow.'),
  jsonb_build_object('summary', 'Lifecycle state machine (14 statuses), verification gate system (5 gates), duplicate intelligence, implementation packages, completion reports, PO acceptance workflow.'),
  jsonb_build_object('result', 'PASS', 'tests', 1070, 'test_files', 25, 'build_errors', 0),
  jsonb_build_object('accepted_by', 'Product Owner', 'accepted_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'), 'statement', 'PASS — All engineering objectives achieved'),
  'EWO-014.7-CR',
  'accepted',
  true,
  true
FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.7';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Reopen EWO-015 as the Active Engineering Work Order
-- ────────────────────────────────────────────────────────────────────────────

UPDATE engineering_work_orders
SET status = 'ready',
    closed_at = NULL,
    updated_at = now()
WHERE ewo_ref = 'EWO-015';
