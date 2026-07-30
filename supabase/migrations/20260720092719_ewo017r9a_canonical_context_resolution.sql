-- EWO-017R.9A — Canonical Verification Context Resolution
-- Register the work order and preserve the failed verification attempts for audit.

INSERT INTO engineering_work_orders (ewo_ref, title, executive_summary, status, priority, risk_level, parent_ref, created_at, updated_at)
SELECT
  'EWO-017R.9A',
  'Canonical Verification Context Resolution, Individual & Batch Verification Recovery',
  'Fix blocking defect where both Individual Verify and Verify All Eligible reported "Engineering Work Order not found" for a visible EWO. Root cause: loadEwofactState queried the non-existent affected_migrations column, causing a PostgREST error that was misclassified as record-not-found. Fix: removed the column, added canonical VerificationWorkOrderContext type and resolveVerificationWorkOrderContext resolver, pass loaded EWO context from page through performVerification and runVerificationOrchestration, add impossible-state invariant, distinct failure types (invalid_identifier, record_not_found, permission_denied, query_error), and governed error messages.',
  'engineering_complete',
  'critical',
  'high',
  'EWO-017R.9',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-017R.9A');

-- Preserve the Product Owner test failures for audit
INSERT INTO audit_trail (event_type, event_data, timestamp, category, severity, description)
SELECT
  'ewo017r9a_context_resolution_defect',
  jsonb_build_object(
    'ewo_ref', 'EWO-017R.9A',
    'parent_ref', 'EWO-017R.9',
    'root_cause', 'loadEwoArtefactState queried the non-existent affected_migrations column on engineering_work_orders, causing a PostgREST error. The .maybeSingle() call returned {data: null, error: ...} and the code translated ALL null returns to "Engineering Work Order not found", misclassifying query errors as missing records.',
    'affected_workflows', jsonb_build_array('Individual Verify', 'Verify All Eligible', 'Verify Remaining', 'Retry Failed Gates'),
    'fix', 'Removed affected_migrations from query. Added VerificationWorkOrderContext type and resolveVerificationWorkOrderContext canonical resolver. Page passes loaded EWO context through performVerification and runVerificationOrchestration. Added impossible-state invariant, distinct failure types, and governed error messages.',
    'preserved_failures', 'Product Owner testing of EWO-017R.9 observed Individual Verify and Verify All Eligible both reporting "Engineering Work Order not found" for a visible EWO. These failed attempts are preserved for audit.',
    'completed_at', now()
  ),
  now(),
  'governance',
  'critical',
  'EWO-017R.9A — Canonical verification context resolution complete'
WHERE NOT EXISTS (
  SELECT 1 FROM audit_trail WHERE event_type = 'ewo017r9a_context_resolution_defect'
);
