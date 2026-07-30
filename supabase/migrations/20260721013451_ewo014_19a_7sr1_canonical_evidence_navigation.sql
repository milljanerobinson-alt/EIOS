/*
# EWO-014.19A.7SR.1 — Engineering Integrity Canonical Evidence Navigation Refinement

## 1. Purpose
Ensures every evidence item and recommended action in the Engineering Integrity
investigation workspace opens the correct canonical engineering object instead
of navigating to placeholder pages.

## 2. Canonical Registration
Creates EWO-014.19A.7SR.1 before implementation begins.
*/

INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  implementation_provider, implementation_status, engineering_package_status,
  engineering_classification, product_owner, created_at, updated_at
)
SELECT 'EWO-014.19A.7SR.1',
  'EWO-014.19A.7SR.1 — Engineering Integrity Canonical Evidence Navigation Refinement',
  'Completes the Engineering Integrity investigation experience by ensuring every evidence item and recommended action opens the correct canonical engineering object instead of navigating to placeholder pages. Implements a reusable canonical navigation service with governed missing-object handling.',
  'in_progress', 'high', 'medium',
  'bolt', 'In Progress', 'Generated',
  'Engineering', 'Millie Robinson', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.19A.7SR.1');

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
SELECT id, null, 'in_progress', 'system',
  'Canonical EWO registered before implementation per EWO-014.19A.7SR.1.',
  jsonb_build_object('source', 'ensure_canonical_creation', 'ewo_ref', 'EWO-014.19A.7SR.1')
FROM engineering_work_orders
WHERE ewo_ref = 'EWO-014.19A.7SR.1'
AND NOT EXISTS (
  SELECT 1 FROM ewo_lifecycle_events ev
  WHERE ev.ewo_id = engineering_work_orders.id
  AND ev.metadata->>'source' = 'ensure_canonical_creation'
);
