-- EWO-017R.1 — Product Owner Execution Launch, Orchestrator UI Wiring & Engineering Knowledge Synchronisation
-- Child of EWO-017 per ES-002 governance bootstrap

INSERT INTO engineering_work_orders (
  ewo_ref, title, status, parent_ref,
  executive_summary, implementation_status,
  engineering_package_status, verification_status,
  closure_eligible, po_testing_status,
  bootstrap_origin, bootstrap_date, bootstrap_reason,
  created_at, updated_at
)
SELECT
  'EWO-017R.1',
  'EWO-017R.1 — Product Owner Execution Launch, Orchestrator UI Wiring & Engineering Knowledge Synchronisation',
  'draft',
  'EWO-017',
  'Wire the executionOrchestrator to a Product Owner UI entry point on the Engineering Workspace. Add governed Begin Engineering Execution action with eligibility checks, prerequisite validation, session creation, live workspace, dashboard integration, duplicate prevention, and failure messaging. Synchronise Engineering Knowledge system to accurately explain the implemented execution platform.',
  'not_started',
  'not_started',
  'not_started',
  false,
  'pending',
  'Implementation Bootstrap',
  '2026-07-20T00:00:00Z',
  'EWO-017 implemented executionOrchestrator.ts but no UI entry point exists to invoke it. Product Owner cannot begin an Engineering Execution from the UI. ATD returns generic engineering guidance instead of explaining the implemented platform.',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-017R.1');

-- Attach engineering package
INSERT INTO ewo_engineering_packages (
  ewo_id, package_hash, package_status, summary, implementation_notes,
  relevant_standards, constitutional_references, created_at
)
SELECT e.id, 'ewo-017r1-bootstrap-v1', 'draft',
  'EWO-017R.1 — Product Owner Execution Launch & Knowledge Sync',
  'Wire executionOrchestrator to UI. Add Begin Engineering Execution button with eligibility, validation, session creation, live workspace, dashboard. Sync Engineering Knowledge to explain implemented platform.',
  'ES-002', ARRAY['ES-002'], now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-017R.1'
  AND NOT EXISTS (SELECT 1 FROM ewo_engineering_packages p WHERE p.ewo_id = e.id);

-- Completion report placeholder
INSERT INTO ewo_completion_reports (
  ewo_ref, ewo_id, title, executive_summary, build_result, created_at
)
SELECT 'EWO-017R.1', e.id,
  'EWO-017R.1 — Product Owner Execution Launch & Knowledge Sync',
  'Pending implementation.', 'pending', now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-017R.1'
  AND NOT EXISTS (SELECT 1 FROM ewo_completion_reports r WHERE r.ewo_ref = 'EWO-017R.1');

-- Lifecycle event
INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
SELECT e.id, NULL, 'draft', 'governance_bootstrap',
  'EWO-017R.1 created per ES-002 governance bootstrap. Parent: EWO-017.',
  '{"standard":"ES-002","step":"2","bootstrap_origin":"Implementation Bootstrap","parent":"EWO-017"}'::jsonb,
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-017R.1'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events l WHERE l.ewo_id = e.id AND l.metadata->>'standard' = 'ES-002'
  );
