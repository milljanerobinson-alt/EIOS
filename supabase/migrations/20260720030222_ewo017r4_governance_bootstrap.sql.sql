/*
# EWO-017R.4 Governance Bootstrap

1. Register ES-003 — Mandatory End-to-End User Workflow Validation
2. Correct EWO-017R.3 lifecycle — reverse premature closure (no PO acceptance)
3. Register EWO-017R.4 work order — engineering_complete, NOT closed
4. ATD knowledge sync for execution resume diagnostics
*/

-- ─── 1. Register ES-003 Engineering Standard ───────────────────────────────────

INSERT INTO ecc_engineering_standards (version_introduced, category, title, body, status, sort_order, tags, created_at, updated_at)
SELECT
  'ES-003',
  'verification',
  'ES-003 — Mandatory End-to-End User Workflow Validation',
  $BODY$ES-003 — Mandatory End-to-End User Workflow Validation

1. Every new user-visible primary action must have an automated end-to-end test where technically practical.

2. Every navigation action must verify:
   - the click is handled
   - the route changes as expected
   - the destination renders meaningful content
   - the expected object is displayed
   - no silent failure occurs

3. A build pass, unit test pass, or service-level integration test is not sufficient evidence that a user workflow is complete.

4. Critical alternate entry points must be independently validated.
   Examples: Begin, View, Resume, Retry, Return, Approve, Reject, Request Refinement.

5. End-to-end tests must fail for:
   - blank destination pages
   - dead buttons
   - swallowed exceptions
   - incorrect object routing
   - duplicated records caused by repeated actions
   - loading states that never resolve

6. Product Owner manual testing remains required for usability, governance and acceptance judgement.

7. End-to-end workflow evidence must be included in the Engineering Completion Report.

8. Engineering Completion Reports must distinguish:
   - unit verification
   - integration verification
   - end-to-end verification
   - Product Owner testing
   - Product Owner acceptance$BODY$,
  'active',
  30,
  ARRAY['e2e', 'validation', 'navigation', 'user-workflow', 'governance'],
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM ecc_engineering_standards WHERE version_introduced = 'ES-003');

-- ─── 2. Correct EWO-017R.3 lifecycle ──────────────────────────────────────────

INSERT INTO audit_trail (event_type, event_data, timestamp, category, severity, description)
SELECT
  'lifecycle_correction',
  jsonb_build_object(
    'ewo_ref', 'EWO-017R.3',
    'correction', 'Status reversed from closed to engineering_complete',
    'reason', 'Product Owner acceptance had not occurred',
    'original_status', 'closed',
    'corrected_status', 'engineering_complete',
    'corrected_at', now(),
    'note', 'Closure was reversed because Product Owner acceptance had not occurred. Original closure event preserved as immutable history.'
  ),
  now(),
  'governance',
  'warning',
  'EWO-017R.3 lifecycle correction: premature closure reversed'
WHERE NOT EXISTS (
  SELECT 1 FROM audit_trail
  WHERE event_type = 'lifecycle_correction'
  AND event_data->>'ewo_ref' = 'EWO-017R.3'
);

UPDATE engineering_work_orders
SET status = 'engineering_complete',
    closed_at = NULL,
    closed_by = NULL,
    closure_reason = NULL,
    closure_method = NULL,
    updated_at = now()
WHERE ewo_ref = 'EWO-017R.3'
  AND status = 'closed';

-- ─── 3. Register EWO-017R.4 ───────────────────────────────────────────────────

INSERT INTO engineering_work_orders (ewo_ref, title, executive_summary, status, priority, risk_level, parent_ref, created_at, updated_at)
SELECT
  'EWO-017R.4',
  'Execution Resume Navigation, Existing Session Recovery & Mandatory E2E Validation',
  'Fix View Execution action that silently did nothing. Root cause: getActiveSession active-status list did not include awaiting_po_testing, so the handler guard failed. Establish canonical navigateToExecutionWorkspace, governed action feedback, stale-ref recovery, ES-003 standard, E2E test coverage.',
  'engineering_complete',
  'high',
  'low',
  'EWO-017R.3',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-017R.4');

-- ─── 4. ATD knowledge sync ────────────────────────────────────────────────────

INSERT INTO audit_trail (event_type, event_data, timestamp, category, severity, description)
SELECT
  'atd_knowledge_sync',
  jsonb_build_object(
    'ewo_ref', 'EWO-017R.4',
    'knowledge_added', jsonb_build_array(
      'How do I reopen an existing Engineering Execution?',
      'Why is View Execution not working?',
      'Which execution is linked to this EWO?',
      'Will View Execution create another execution?',
      'What route should View Execution open?',
      'Which user actions require end-to-end tests?',
      'What is ES-003?'
    ),
    'synced_at', now()
  ),
  now(),
  'governance',
  'info',
  'ATD knowledge sync for EWO-017R.4 execution resume diagnostics'
WHERE NOT EXISTS (
  SELECT 1 FROM audit_trail
  WHERE event_type = 'atd_knowledge_sync'
  AND event_data->>'ewo_ref' = 'EWO-017R.4'
);
