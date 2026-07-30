/*
# EWO-017R.2 — Register work order and record completion

Creates the EWO-017R.2 work order record and lifecycle event for the
canonical execution eligibility correction work.
*/

INSERT INTO engineering_work_orders (
  id, ewo_ref, title, executive_summary, business_objective, engineering_objective,
  priority, risk_level, status, implementation_status, engineering_package_status,
  scope, validation_requirements, engineering_notes, implementation_notes,
  is_historical_import, po_testing_status, closure_eligible
)
SELECT
  'a2222222-0000-0000-0000-000000000001',
  'EWO-017R.2',
  'EWO-017R.2 — Canonical Execution Eligibility & Testable Launch Correction',
  'Corrected execution eligibility to use canonical schema references, created canonical eligibility resolver, governed test execution candidate, and ATD diagnostics.',
  'Enable Product Owner to reliably launch Engineering Execution through the governed UI flow.',
  'Create canonical execution eligibility resolver, remove invalid schema references, provide governed test candidate, and ensure ATD can explain execution eligibility.',
  'high', 'medium', 'engineering_complete', 'complete', 'complete',
  'Created executionEligibilityResolver.ts, fixed executionOrchestrator.ts, updated executionLaunchService.ts, updated ECCWorkOrdersPage.tsx, updated conversationContextRouter.ts, created ewo_execution_approvals table, seeded EWO-TEST-001 with all prerequisites.',
  '162 tests pass, build succeeds, zero new regressions.',
  'EWO-017R.2 implementation complete.',
  'All invalid schema references removed. Canonical resolver governs all entry points.',
  false, 'pending', false
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-017R.2');

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
SELECT
  e.id, NULL, 'engineering_complete', 'bolt_implementation',
  'EWO-017R.2 implementation complete. Created canonical executionEligibilityResolver.ts. Fixed executionOrchestrator.ts to use ewo_engineering_packages instead of non-existent engineering_plans. Fixed ewo_lifecycle_events query (no event_type column). Created ewo_execution_approvals table for canonical PO execution approval. Seeded EWO-TEST-001 with approved package, approved review, PO execution approval, and ET-TEST target. Updated ECCWorkOrdersPage with 9 governed execution states. Updated ATD guidance with 10 query patterns. 162 tests pass, build succeeds, zero new regressions.',
  jsonb_build_object('standard', 'ES-002', 'derived_state', 'engineering_complete', 'closure_eligible', false, 'po_testing', 'pending')
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-017R.2'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events le WHERE le.ewo_id = e.id
  );
