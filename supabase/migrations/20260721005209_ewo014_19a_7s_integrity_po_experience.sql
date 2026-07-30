/*
# EWO-014.19A.7S — Engineering Integrity Product Owner Experience & Platform Maturity Refinement

## 1. Purpose
Transforms Engineering Integrity from a diagnostic dashboard into a governed
investigation workspace with platform maturity awareness, clickable evidence,
and governed recommended actions.

## 2. Canonical Registration
Creates EWO-014.19A.7S before implementation begins.
*/

INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  implementation_provider, implementation_status, engineering_package_status,
  engineering_classification, product_owner, created_at, updated_at
)
SELECT 'EWO-014.19A.7S',
  'EWO-014.19A.7S — Engineering Integrity Product Owner Experience & Platform Maturity Refinement',
  'Transforms Engineering Integrity from a diagnostic dashboard into a governed investigation workspace with platform maturity awareness, clickable evidence, governed recommended actions, and metric reconciliation. Distinguishes engineering issues from platform maturity, unavailable capabilities, and runtime failures.',
  'in_progress', 'high', 'medium',
  'bolt', 'In Progress', 'Generated',
  'Engineering', 'Millie Robinson', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.19A.7S');

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
SELECT id, null, 'in_progress', 'system',
  'Canonical EWO registered before implementation per EWO-014.19A.7S.',
  jsonb_build_object('source', 'ensure_canonical_creation', 'ewo_ref', 'EWO-014.19A.7S')
FROM engineering_work_orders
WHERE ewo_ref = 'EWO-014.19A.7S'
AND NOT EXISTS (
  SELECT 1 FROM ewo_lifecycle_events ev
  WHERE ev.ewo_id = engineering_work_orders.id
  AND ev.metadata->>'source' = 'ensure_canonical_creation'
);
