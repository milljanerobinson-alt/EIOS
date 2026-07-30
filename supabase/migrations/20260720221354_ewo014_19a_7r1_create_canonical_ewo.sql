/*
# EWO-014.19A.7R.1 — Canonical Engineering Work Order Creation

## Purpose
Creates the canonical engineering_work_orders record for EWO-014.19A.7R.1
(Platform-Wide Canonical Engineering Work Order Reconciliation & Mandatory
Pre-Implementation Creation). This is the mandatory pre-implementation governance
step: the canonical EWO must exist in the ledger BEFORE any engineering work begins.

## Parent
EWO-014.19A.7R — Engineering Integrity Exhaustive Reconciliation & Truthful Scoring

## Record Created
- ewo_ref: EWO-014.19A.7R.1
- title: Platform-Wide Canonical EWO Reconciliation & Mandatory Pre-Implementation Creation
- status: in_progress
- verification_status: not_started
- parent_ref: EWO-014.19A.7R
- priority: high
- risk_level: medium

## Security
No new tables. INSERT only into existing engineering_work_orders table.
*/

INSERT INTO engineering_work_orders (
  ewo_ref,
  title,
  executive_summary,
  business_objective,
  engineering_objective,
  priority,
  risk_level,
  status,
  verification_status,
  parent_ref,
  scope,
  out_of_scope,
  validation_requirements,
  created_at
)
SELECT
  'EWO-014.19A.7R.1',
  'Platform-Wide Canonical EWO Reconciliation & Mandatory Pre-Implementation Creation',
  'Reconcile every implemented Engineering Work Order missing from the canonical ledger and enforce mandatory canonical creation-before-implementation for all future Bolt execution paths.',
  'Eliminate engineering ledger drift by ensuring every implemented EWO has exactly one canonical engineering_work_orders record, searchable and lifecycle-complete.',
  '1. Platform-wide audit of all governed engineering artefacts. 2. Reconcile missing canonical EWO records. 3. Implement ensureEngineeringWorkOrderExists() governance service. 4. Add Completion Report safety net. 5. Add regression tests.',
  'high',
  'medium',
  'in_progress',
  'not_started',
  'EWO-014.19A.7R',
  'Audit all governed artefact tables, reconcile missing EWOs, implement mandatory creation-before-implementation governance service, add Completion Report safety net, add regression tests.',
  'Do not modify existing lifecycle states, verification governance, or Product Owner Acceptance flow.',
  'All reconciled EWOs discoverable by reference, parent, title, and refinement. Build passes. New tests pass. Regression suite passes.',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.19A.7R.1'
);
