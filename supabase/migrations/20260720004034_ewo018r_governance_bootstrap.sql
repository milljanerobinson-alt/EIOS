-- EWO-018R — Engineering Standards Library Reconciliation, Visibility & Workspace UX Refinement
-- Child of EWO-018 per ES-002 governance bootstrap

INSERT INTO engineering_work_orders (
  ewo_ref, title, status, parent_ref,
  executive_summary, implementation_status,
  engineering_package_status, verification_status,
  closure_eligible, po_testing_status,
  bootstrap_origin, bootstrap_date, bootstrap_reason,
  created_at, updated_at
)
SELECT
  'EWO-018R',
  'EWO-018R — Engineering Standards Library Reconciliation, Visibility & Workspace UX Refinement',
  'draft',
  'EWO-018',
  'Fix reconciliation failure in the Engineering Standards Library where standards exist in the ledger but are not rendered. Fix workspace scrolling. Add automatic reconciliation diagnostics. Ensure truthful counts, search, filtering, and empty-state messaging.',
  'not_started',
  'not_started',
  'not_started',
  false,
  'pending',
  'Implementation Bootstrap',
  '2026-07-20T00:00:00Z',
  'Product Owner testing of EWO-018 identified that the Standards Library reported 1 matching standard while displaying an empty-state message. Standards exist in the ledger but are not rendered. The workspace is also not fully scrollable.',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-018R');

-- Attach engineering package
INSERT INTO ewo_engineering_packages (
  ewo_id, package_hash, package_status, summary, implementation_notes,
  relevant_standards, constitutional_references, created_at
)
SELECT e.id, 'ewo-018r-bootstrap-v1', 'draft',
  'EWO-018R — Engineering Standards Library Reconciliation & UX Refinement',
  'Fix standards rendering pipeline, add reconciliation diagnostics, fix workspace scrolling, ensure truthful counts and empty-state messaging.',
  'ES-002', ARRAY['ES-002'], now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-018R'
  AND NOT EXISTS (SELECT 1 FROM ewo_engineering_packages p WHERE p.ewo_id = e.id);

-- Completion report placeholder
INSERT INTO ewo_completion_reports (
  ewo_ref, ewo_id, title, executive_summary, build_result, created_at
)
SELECT 'EWO-018R', e.id,
  'EWO-018R — Engineering Standards Library Reconciliation, Visibility & Workspace UX Refinement',
  'Pending implementation.', 'pending', now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-018R'
  AND NOT EXISTS (SELECT 1 FROM ewo_completion_reports r WHERE r.ewo_ref = 'EWO-018R');

-- Lifecycle event
INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
SELECT e.id, NULL, 'draft', 'governance_bootstrap',
  'EWO-018R created per ES-002 governance bootstrap. Parent: EWO-018.',
  '{"standard":"ES-002","step":"2","bootstrap_origin":"Implementation Bootstrap","parent":"EWO-018"}'::jsonb,
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-018R'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events l WHERE l.ewo_id = e.id AND l.metadata->>'standard' = 'ES-002'
  );
