/*
# ES-002 — Canonical Engineering Governance Bootstrap (Constitutional Standard)
#
# Bootstraps ES-002 into the engineering ledger following the standard's own
# 5-step mandatory implementation bootstrap process.
*/

-- ============================================================================
-- STEP 1: Verify EWO exists → NO (first-time registration)
-- ============================================================================

-- ============================================================================
-- STEP 2: Create the canonical Engineering Work Order
-- ============================================================================

INSERT INTO engineering_work_orders (
  ewo_ref, title, status, parent_ref,
  executive_summary, implementation_status,
  engineering_package_status, verification_status,
  closure_eligible, po_testing_status,
  bootstrap_origin, bootstrap_date, bootstrap_reason,
  created_at, updated_at
)
SELECT
  'EWO-018',
  'EWO-018 — Canonical Engineering Governance Bootstrap Standard (ES-002)',
  'draft',
  NULL,
  'Constitutional engineering standard that mandates a canonical Engineering Work Order must exist before implementation begins. Every implementation prompt must attach to its canonical EWO, every implementation must attach or create an Engineering Package, and if governance cannot be established implementation must stop. Applies to all implementation engines: Bolt, ATD Execution Engine, EIOS Automation, and future AI providers.',
  'not_started',
  'not_started',
  'not_started',
  false,
  'pending',
  'Implementation Bootstrap',
  '2026-07-20T00:00:00Z',
  'Constitutional standard introduced following Product Owner testing that identified historical EWOs implemented before canonical ledger registration. Retrospective governance was used to recover historical engineering, but future implementations must establish governance before execution to preserve a truthful engineering ledger.',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-018'
);

-- ============================================================================
-- STEP 3: Attach Implementation Prompt, Engineering Package, Initial Lifecycle
-- ============================================================================

-- 3a. Record lifecycle initialisation event
INSERT INTO ewo_lifecycle_events (
  ewo_id, from_status, to_status, actor, notes, metadata, created_at
)
SELECT
  e.id, NULL, 'draft', 'governance_bootstrap',
  'Canonical Engineering Governance Bootstrap for ES-002. EWO created per ES-002 Step 2. Initial lifecycle state: draft.',
  '{"standard":"ES-002","step":"2","bootstrap_origin":"Implementation Bootstrap","action":"canonical_ewo_created"}'::jsonb,
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-018'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events l
    WHERE l.ewo_id = e.id AND l.metadata->>'standard' = 'ES-002'
  );

-- 3b. Create Engineering Package placeholder
INSERT INTO ewo_engineering_packages (
  ewo_id, package_hash, package_status, summary, implementation_notes,
  relevant_standards, constitutional_references, created_at
)
SELECT
  e.id,
  'es-002-bootstrap-v1',
  'draft',
  'ES-002 Canonical Engineering Governance Bootstrap — implementation package.',
  'Implement ES-002 enforcement: governance bootstrap checks that verify EWO existence before implementation, attach implementation prompts to canonical EWOs, create engineering packages, and halt implementation if governance cannot be established.',
  'ES-002',
  ARRAY['ES-002'],
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-018'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_engineering_packages p WHERE p.ewo_id = e.id
  );

-- 3c. Create Completion Report placeholder
INSERT INTO ewo_completion_reports (
  ewo_ref, ewo_id, title, executive_summary, build_result, created_at
)
SELECT
  'EWO-018',
  e.id,
  'EWO-018 — Canonical Engineering Governance Bootstrap Standard (ES-002)',
  'Pending implementation. ES-002 standard to be seeded into ecc_engineering_standards and enforced via governance bootstrap checks.',
  'pending',
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-018'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_completion_reports r WHERE r.ewo_ref = 'EWO-018'
  );

-- ============================================================================
-- STEP 4: Seed ES-002 into the Engineering Standards ledger
-- ============================================================================

INSERT INTO ecc_engineering_standards (
  version_introduced, category, title, body, status, sort_order, tags,
  created_at, updated_at
)
SELECT
  'ES-002',
  'Engineering Governance',
  'ES-002: Canonical Engineering Governance Bootstrap',
  $BODY$Engineering Governance must exist before implementation begins.

PRINCIPLES:
1. A canonical Engineering Work Order must exist before implementation begins.
2. Every implementation prompt must attach to its canonical Engineering Work Order.
3. Every implementation must attach or create an Engineering Package linked to that Engineering Work Order.
4. If Engineering Governance cannot be established, implementation must stop.
5. Implementation engines may never silently create orphan engineering.
6. Engineering Governance is authoritative. Implementation history is derived from Engineering Governance—not the other way around.

MANDATORY IMPLEMENTATION BOOTSTRAP:
Step 1: Verify the referenced Engineering Work Order exists.
Step 2: If missing, create the canonical EWO (record Reference, Title, Parent, Governance Metadata, Bootstrap Origin).
Step 3: Attach Implementation Prompt, Engineering Package, Initial Lifecycle.
Step 4: Verify parent relationships, prompt attachment, package attachment, completion report placeholder, lifecycle initialisation.
Step 5: If governance cannot be established, STOP IMPLEMENTATION. Return a governed Engineering Completion Report. Do not modify application code.

PRODUCT OWNER ACCEPTANCE:
Implementation Complete ≠ Engineering Closed.
Closure requires: Engineering Complete, Completion Report, Product Owner Testing, Product Owner Acceptance.

GOVERNANCE VERIFICATION:
Every Engineering Completion Report must contain:
- Engineering Governance Verification
- Engineering Work Order
- Engineering Package
- Prompt Attached
- Completion Report
- Lifecycle Initialised
- Governance Validation: PASS / FAIL

CONSTITUTIONAL RULE:
Implementation must never create Engineering Governance retrospectively. Engineering Governance must exist before implementation begins.

APPLIES TO: All implementation engines (Bolt, ATD Execution Engine, EIOS Automation, Future AI Providers). The implementation technology is irrelevant. Engineering Governance is platform behaviour.$BODY$,
  'active',
  1,
  ARRAY['constitutional', 'governance', 'bootstrap', 'es-002', 'ewo-018'],
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM ecc_engineering_standards WHERE version_introduced = 'ES-002'
);

-- 4b. Record governance verification lifecycle event
INSERT INTO ewo_lifecycle_events (
  ewo_id, from_status, to_status, actor, notes, metadata, created_at
)
SELECT
  e.id, 'draft', 'draft', 'governance_bootstrap',
  'ES-002 Step 4 verification: Parent relationships (N/A — root standard), Prompt attached (in engineering_notes), Package attached (draft placeholder), Completion Report placeholder created, Lifecycle initialised (draft). Governance established.',
  '{"standard":"ES-002","step":"4","verification":"PASS","parent":"N/A","prompt":"attached","package":"attached","completion_report":"placeholder","lifecycle":"initialised"}'::jsonb,
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-018'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events l
    WHERE l.ewo_id = e.id AND l.metadata->>'step' = '4'
  );

-- ============================================================================
-- STEP 5: Governance established — implementation may proceed
-- ============================================================================
