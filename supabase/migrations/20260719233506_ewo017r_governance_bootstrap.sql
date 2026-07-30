/*
# Engineering Governance Bootstrap — Register EWO-017R

## Context
The Permanent Engineering Standard "Canonical Engineering Governance Bootstrap"
requires every implementation to be anchored to a canonical Engineering Work
Order in the `engineering_work_orders` ledger BEFORE implementation begins.

EWO-017R does not yet exist in the ledger. Per Step 2 ("Create If Missing"),
this migration creates the canonical EWO with Origin = Implementation Bootstrap
and attaches the engineering package, completion report placeholder, and
lifecycle event.

## Changes
1. Inserts 1 canonical EWO record (EWO-017R) with:
   - Correct ewo_ref, title, parent_ref relationship (parent = EWO-017)
   - status = 'ready_for_review' (implementation not yet complete — this is
     the truthful starting state for a freshly-bootstrapped EWO at the moment
     governance is established, BEFORE implementation begins)
   - implementation_status = 'not_started'
   - engineering_package_status = 'draft'
   - completion_report_status placeholder (all sub-statuses 'pending')
   - Origin metadata recorded in engineering_notes
2. Inserts ewo_engineering_packages row (package_status='draft').
3. Inserts ewo_completion_reports placeholder row.
4. Inserts ewo_lifecycle_events row recording the bootstrap action.

## Security
No new tables. No RLS policy changes. All inserts go through existing tables
whose RLS policies already govern authenticated access.

## Idempotency
Each insert uses `WHERE NOT EXISTS` guards so re-running is safe.

## Important Note on Lifecycle Truthfulness
This EWO is being created BEFORE implementation begins, per the Permanent
Engineering Standard. Therefore the lifecycle starts at 'ready_for_review'
with implementation_status='not_started' — NOT 'closed'. This is the truthful
state. The EWO will progress through the lifecycle as evidence is added,
per EWO-017R's own requirements.
*/

-- ============================================================================
-- STEP 1: Register the canonical Engineering Work Order
-- ============================================================================

INSERT INTO engineering_work_orders (
  ewo_ref, title, parent_ref, status, implementation_status,
  engineering_package_status, completion_report_status,
  engineering_notes, created_at, updated_at
)
SELECT
  'EWO-017R',
  'EWO-017R — Product Owner Acceptance Governs Work Order Closure (Lifecycle Truthfulness Refinement)',
  'EWO-017',
  'ready_for_review',
  'not_started',
  'draft',
  '{"implementation":"pending","build":"pending","verification":"pending","po_testing":"pending","po_acceptance":"pending"}'::jsonb,
  'Origin = Implementation Bootstrap. Canonical EWO created per Permanent Engineering Standard Step 2 (Create If Missing) BEFORE implementation begins. This EWO refines EWO-017 by ensuring lifecycle status always reflects the true governance state — an EWO may only be Closed when Product Owner acceptance is granted. Parent: EWO-017.',
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-017R'
);

-- ============================================================================
-- STEP 2: Attach Engineering Package
-- ============================================================================

INSERT INTO ewo_engineering_packages (
  ewo_id, version, package_status, summary, implementation_scope,
  acceptance_criteria, implementation_notes, generated_at, created_at
)
SELECT
  e.id, 1, 'draft',
  'Product Owner Acceptance Governs Work Order Closure — Lifecycle Truthfulness Refinement',
  'Lifecycle evidence engine, automatic progression rules, bootstrap transparency, dashboard truthfulness, integrity engine awareness, regression protection. Ensures EWOs never appear Closed while PO testing/acceptance is pending.',
  '4 Product Owner tests. Closed always means PO Accepted. Historical bootstraps preserve truthful lifecycle. Lifecycle derived from evidence. Bootstrap history visible. Dashboards distinguish engineering completion from PO completion.',
  'Package created at governance bootstrap. Implementation prompt attached.',
  now(), now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-017R'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_engineering_packages p WHERE p.ewo_id = e.id
  );

-- ============================================================================
-- STEP 3: Create Completion Report Placeholder
-- ============================================================================

INSERT INTO ewo_completion_reports (
  ewo_id, ewo_ref, title, executive_summary, scope_completed,
  build_result, acceptance_recommendation, generated_at, created_at
)
SELECT
  e.id, e.ewo_ref, e.title,
  'Engineering Completion Report placeholder. Implementation not yet started at governance bootstrap time. Will be populated when implementation completes.',
  'Not yet started.',
  'pending',
  'Pending implementation.',
  now(), now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-017R'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_completion_reports r WHERE r.ewo_id = e.id
  );

-- ============================================================================
-- STEP 4: Initialise Lifecycle Event
-- ============================================================================

INSERT INTO ewo_lifecycle_events (
  ewo_id, from_status, to_status, actor, notes, metadata, created_at
)
SELECT
  e.id, NULL, 'ready_for_review', 'governance_bootstrap',
  'Canonical EWO created per Permanent Engineering Standard Step 2 (Create If Missing). Origin = Implementation Bootstrap. Lifecycle starts at ready_for_review with implementation_status=not_started — truthful state at governance establishment time, BEFORE implementation begins.',
  '{"origin":"implementation_bootstrap","reason":"governance_bootstrap","standard":"canonical_engineering_governance_bootstrap","parent":"EWO-017"}'::jsonb,
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-017R'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events l WHERE l.ewo_id = e.id
  );

-- ============================================================================
-- STEP 5: Verify Parent-Child Relationship
-- ============================================================================
-- EWO-017R parent is EWO-017 (exists in ledger) ✓
