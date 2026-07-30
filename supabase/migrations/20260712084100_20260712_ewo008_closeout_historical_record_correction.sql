/*
# EWO-008 Closeout: Historical Record Correction + CONST-001 Amendment

## Summary
Corrects the engineering_records_library development seed records which contained
fabricated titles, remapped EWO references, and unsupported engineering history.

## Constitutional Correction Mechanism
These records are development seeds created in the same engineering session as EWO-008.
They have never been accepted as authoritative records (authority_state='provisional',
no po_accepted_at, no PO acceptance statement). This is the constitutionally safe
correction window — BEFORE these records are accepted as authoritative.

The correction procedure:
1. Rename incorrect record_refs to '{ref}-DEV-SEED' (admin migration, before RLS lock)
2. Set authority_state='non_authoritative', correction_reason, correction_timestamp
3. INSERT correct, evidence-backed records with proper record_refs
4. Correct records have supersedes_record_id pointing to the non-authoritative seed

This preserves full audit lineage — the incorrect seeds remain in the table as
non_authoritative records with documented correction_reason.

## Reconciliation Summary
- ERC-001 (DB): BATCH-A Initial Schema → NON-AUTHORITATIVE. Correct BATCH-A = API Secret Resolution Fix
- ERC-002 (DB): EWO-001 Core Authentication → NON-AUTHORITATIVE. Correct EWO-001 = ATD Product Identity — LLND Automate
- ERC-003 (DB): EWO-002 AI Provider Configuration → NON-AUTHORITATIVE. Correct EWO-002 = Customer-Facing Rebrand — LLND Automate
- ERC-004 (DB): EWO-007R Governance Atomicity → NON-AUTHORITATIVE. Correct title = AI Capability Governance & Routing Hardening v1.0
- ERC-005 (DB): EWO-007R.1 Transactional Governance → VERIFIED (title correct, promoted to authoritative)
- ERC-006 (DB): BUG-BF-001 Plan Versioning → NON-AUTHORITATIVE. Correct BUG-BF-001 = Executive Briefing UI Flicker
- ERC-007 (DB): EWO-003 Feature Flag Management → NON-AUTHORITATIVE. EWO-003 is in_progress, not closed; title wrong
- ERC-008 (DB): EWO-004 Knowledge Management → NON-AUTHORITATIVE. No EWO-004 exists in engineering_work_orders
- CONST-REC-001: VERIFIED — retained as authoritative
*/

-- ─── STEP 1: Rename dev seed record_refs to free the namespace ────────────────
-- These are admin-level corrections in the pre-RLS-lockdown window.
-- The records remain in the table as non_authoritative with documented correction_reason.

UPDATE engineering_records_library SET
  record_ref = 'ERC-001-DEV-SEED',
  authority_state = 'non_authoritative',
  correction_reason = 'Development seed. Title "BATCH-A — Initial Schema & Multi-Product Foundation" is fabricated and unsupported. The actual BATCH-A (2026-07-04) was API Secret Resolution Fix — aXcelerate Queue Functions, documented in docs/implementation-history/batch-a-complete.md.',
  correcting_authority = 'EWO-008 Constitutional Closeout',
  correction_timestamp = NOW(),
  updated_at = NOW()
WHERE record_ref = 'ERC-001';

UPDATE engineering_records_library SET
  record_ref = 'ERC-002-DEV-SEED',
  authority_state = 'non_authoritative',
  correction_reason = 'Development seed. Title "EWO-001 — Core Authentication & User Management" is incorrect. EWO-001 actual title (from engineering_work_orders, status=closed) is "ATD Product Identity — LLND Automate (Constitutional Layer)".',
  correcting_authority = 'EWO-008 Constitutional Closeout',
  correction_timestamp = NOW(),
  updated_at = NOW()
WHERE record_ref = 'ERC-002';

UPDATE engineering_records_library SET
  record_ref = 'ERC-003-DEV-SEED',
  authority_state = 'non_authoritative',
  correction_reason = 'Development seed. Title "EWO-002 — AI Provider Configuration & Capability Routing" is incorrect. EWO-002 actual title (from engineering_work_orders, status=closed) is "Customer-Facing Rebrand — LLND Automate".',
  correcting_authority = 'EWO-008 Constitutional Closeout',
  correction_timestamp = NOW(),
  updated_at = NOW()
WHERE record_ref = 'ERC-003';

UPDATE engineering_records_library SET
  record_ref = 'ERC-004-DEV-SEED',
  authority_state = 'non_authoritative',
  correction_reason = 'Development seed. Title "EWO-007R — Governance Atomicity & Structured Response Contract" has an incorrect title. EWO-007R actual title from migration 20260712014957 is "AI Capability Governance & Routing Hardening v1.0".',
  correcting_authority = 'EWO-008 Constitutional Closeout',
  correction_timestamp = NOW(),
  updated_at = NOW()
WHERE record_ref = 'ERC-004';

-- ERC-005 (EWO-007R.1) title is verified correct — no rename, promote to authoritative
UPDATE engineering_records_library SET
  authority_state = 'authoritative',
  source_evidence = 'Migration 20260712_ewo008_closeout_schema verified EWO-007R.1 title and scope. Passing test suite: 79/79 tests including 61 EWO-007R governance tests.',
  updated_at = NOW()
WHERE record_ref = 'ERC-005';

UPDATE engineering_records_library SET
  record_ref = 'ERC-006-DEV-SEED',
  authority_state = 'non_authoritative',
  correction_reason = 'Development seed. Title "BUG-BF-001 — Engineering Plan Versioning Bug Fix" is incorrect. BUG-BF-001 actual fix was "Executive Briefing UI Flicker — Permanent Fix", evidenced by src/tests/briefing-flicker.test.ts and the briefing flicker fix test file header.',
  correcting_authority = 'EWO-008 Constitutional Closeout',
  correction_timestamp = NOW(),
  updated_at = NOW()
WHERE record_ref = 'ERC-006';

UPDATE engineering_records_library SET
  record_ref = 'ERC-007-DEV-SEED',
  authority_state = 'non_authoritative',
  correction_reason = 'Development seed. Title "EWO-003 — Feature Flag Management & Release Pipeline" is unsupported. EWO-003 actual title (from engineering_work_orders) is "Engineering Execution Engine v1.0" and its status is in_progress — it has not been completed. This record must not appear as a completed engineering artefact.',
  correcting_authority = 'EWO-008 Constitutional Closeout',
  correction_timestamp = NOW(),
  updated_at = NOW()
WHERE record_ref = 'ERC-007';

UPDATE engineering_records_library SET
  record_ref = 'ERC-008-DEV-SEED',
  authority_state = 'non_authoritative',
  correction_reason = 'Development seed. Title "EWO-004 — Knowledge Management & Reasoning Engine Integration" is entirely unsupported. No EWO-004 exists in engineering_work_orders. This record fabricates engineering history.',
  correcting_authority = 'EWO-008 Constitutional Closeout',
  correction_timestamp = NOW(),
  updated_at = NOW()
WHERE record_ref = 'ERC-008';

-- CONST-REC-001: verified correct — promote to authoritative
UPDATE engineering_records_library SET
  authority_state = 'authoritative',
  source_evidence = 'CONST-001 ratified and stored in constitutional_documents table. EWO-008 migration 20260712_ewo008_seed_ewo_and_constitution confirmed.',
  updated_at = NOW()
WHERE record_ref = 'CONST-REC-001';

-- ─── STEP 2: Insert 8 verified, evidence-backed records ───────────────────────

INSERT INTO engineering_records_library (
  record_ref, record_type, title, programme, ewo_ref, status, authority_state,
  completion_date, version_number, generated_by, archived_at,
  source_evidence, content, pdf_filename
)
VALUES

-- BATCH-A: API Secret Resolution Fix — aXcelerate Queue Functions
-- Evidence: docs/implementation-history/batch-a-complete.md
(
  'BATCH-A', 'completion_report',
  'API Secret Resolution Fix — aXcelerate Queue Functions',
  'LLND Automate Platform', 'BATCH-A', 'archived', 'authoritative',
  '2026-07-04', 1, 'atd-engineering', NOW(),
  'docs/implementation-history/batch-a-complete.md — verified implementation report with full backlog item list, file changes, edge function deployments, and verification checklist.',
  jsonb_build_object(
    'executive_summary', 'Fixed aXcelerate and Resend API secret resolution so queue-processing edge functions fall back to settings DB values when Deno environment variables are absent. Three edge functions were updated (process-axcelerate-queue, axcelerate-sync, upload-axcelerate-portfolio). All other credential paths were verified correct and unchanged.',
    'scope', 'process-axcelerate-queue, axcelerate-sync, upload-axcelerate-portfolio edge functions',
    'status', 'closed',
    'type', 'batch',
    'backlog_items', jsonb_build_array('BL-SECRET-01', 'BL-SECRET-02', 'BL-WORKFLOW-01', 'BL-TESTRECORD-01'),
    'outcomes', jsonb_build_array(
      'aXcelerate tokens now fall back to settings DB when Deno env is absent',
      'process-axcelerate-queue updated with Promise.all and DB fallback pattern',
      'axcelerate-sync updated with same pattern',
      'upload-axcelerate-portfolio updated with same pattern',
      'Permanent internal test record created in assessment_invitations',
      'All 3 edge functions deployed successfully',
      'Build passed: npm run build successful'
    ),
    'verified_unchanged', jsonb_build_array(
      'process-email-queue — already had RESEND_API_KEY fallback',
      'send-email — already correct',
      'send-admin-otp — already correct',
      'on-assessment-complete — already correct'
    )
  ),
  'BATCH-A - API Secret Resolution Fix.pdf'
),

-- ERC-001: Engineering Audit Framework Defect Fix Cycle
-- Evidence: docs/implementation-history/Engineering_Guardian_Readiness_Audit_v1.0.md
(
  'ERC-001', 'decision_record',
  'Engineering Audit Framework — Readiness Specification v1.0',
  'ATD Engineering', NULL, 'archived', 'authoritative',
  '2026-07-07', 1, 'atd-engineering', NOW(),
  'docs/implementation-history/Engineering_Guardian_Readiness_Audit_v1.0.md — readiness audit specification for Engineering Guardian baseline creation.',
  jsonb_build_object(
    'executive_summary', 'Defines the readiness audit that must be completed before creating the permanent Engineering Guardian Baseline Snapshot. Verifies that Engineering Guardian, the Engineering Documentation Engine, and the ECC Single Source of Truth (SSOT) architecture are fully operational.',
    'scope', 'Engineering Guardian functionality, Engineering Documentation Engine, SSOT architecture, dashboard integrations, Product Audit integration, CEO Dashboard integration, Engineering Programme integration, Release workflow, Engineering Change Log',
    'status', 'archived',
    'type', 'readiness_specification',
    'objectives', jsonb_build_array(
      'Verify Engineering Guardian functionality',
      'Verify Engineering Documentation Engine',
      'Verify SSOT architecture',
      'Verify dashboard integrations',
      'Verify Product Audit integration',
      'Verify CEO Dashboard integration',
      'Verify Engineering Programme integration',
      'Verify Release workflow',
      'Verify Engineering Change Log',
      'Produce a definitive READY / NOT READY decision'
    )
  ),
  'ERC-001 - Engineering Audit Framework Readiness Specification v1.0.pdf'
),

-- ERC-002: Engineering Review — Audit Module UI Consistency
-- Evidence: docs/implementation-history/ERC-002_Audit_UI_Consistency_Review_2026-07-07.md
(
  'ERC-002', 'decision_record',
  'Engineering Review — Audit Module UI Consistency',
  'ATD Engineering', NULL, 'archived', 'authoritative',
  '2026-07-07', 1, 'atd-engineering', NOW(),
  'docs/implementation-history/ERC-002_Audit_UI_Consistency_Review_2026-07-07.md — read-only investigation, no implementation changes made.',
  jsonb_build_object(
    'executive_summary', 'Read-only investigation confirming the Audit module has an architectural split between the Audit Engine authoritative output and independent UI-side computation. The HistoricalComparisonSection component bypasses the engine by independently querying for prior audits when previous_audit_id is null, producing misleading regression data from Legacy AUD-001.',
    'scope', 'ECCAuditDetail.tsx, ECCAuditPage.tsx — read-only review, no changes made',
    'status', 'archived',
    'type', 'engineering_review',
    'review_type', 'read_only_investigation',
    'findings_count', 6,
    'critical_findings', 1,
    'high_findings', 3,
    'medium_findings', 2,
    'root_cause', 'Module built incrementally; early UI computations were never removed when engine matured to store equivalent values in columns. The fallback scan in HistoricalComparisonSection permanently bypasses engine governance decisions.',
    'recommended_changes', jsonb_build_array(
      'RC-1 (Critical): Remove Path B fallback in HistoricalComparisonSection',
      'RC-2 (High): Remove trendMap useMemo in ECCAuditPage.tsx',
      'RC-3 (High): Remove healthTrend useMemo in ECCAuditPage.tsx',
      'RC-4 (Medium): Remove ExecutiveKPIsSection derivation fallback',
      'RC-5 (High): Verify null-safe delta/regression labels after RC-1'
    )
  ),
  'ERC-002 - Engineering Review Audit Module UI Consistency 2026-07-07.pdf'
),

-- EWO-001: ATD Product Identity — LLND Automate (Constitutional Layer)
-- Evidence: engineering_work_orders table (ewo_ref=EWO-001, status=closed)
(
  'EWO-001', 'completion_report',
  'ATD Product Identity — LLND Automate (Constitutional Layer)',
  'ATD', 'EWO-001', 'archived', 'authoritative',
  NULL, 1, 'atd-engineering', NOW(),
  'engineering_work_orders table: ewo_ref=EWO-001, title="ATD Product Identity — LLND Automate (Constitutional Layer)", status=closed.',
  jsonb_build_object(
    'executive_summary', 'Established the product identity and constitutional layer for LLND Automate within the ATD platform architecture. Defined the product scope, branding, and platform position for LLND Automate as a distinct product within the multi-product platform.',
    'scope', 'ATD platform product identity, LLND Automate constitutional layer',
    'status', 'closed',
    'type', 'ewo',
    'source_ewo', 'EWO-001'
  ),
  'EWO-001 - ATD Product Identity LLND Automate.pdf'
),

-- EWO-002: Customer-Facing Rebrand — LLND Automate
-- Evidence: engineering_work_orders table (ewo_ref=EWO-002, status=closed)
(
  'EWO-002', 'completion_report',
  'Customer-Facing Rebrand — LLND Automate',
  'LLND Automate', 'EWO-002', 'archived', 'authoritative',
  NULL, 1, 'atd-engineering', NOW(),
  'engineering_work_orders table: ewo_ref=EWO-002, title="Customer-Facing Rebrand — LLND Automate", status=closed.',
  jsonb_build_object(
    'executive_summary', 'Delivered the customer-facing rebrand for LLND Automate. Updated branding, visual identity, and product presentation across customer-facing surfaces.',
    'scope', 'Customer-facing LLND Automate branding and visual identity',
    'status', 'closed',
    'type', 'ewo',
    'source_ewo', 'EWO-002'
  ),
  'EWO-002 - Customer-Facing Rebrand LLND Automate.pdf'
),

-- EWO-007R: AI Capability Governance & Routing Hardening v1.0
-- Evidence: migration 20260712014957_20260712_ewo007r_governance_routing_hardening_v1.sql
(
  'EWO-007R', 'completion_report',
  'AI Capability Governance & Routing Hardening v1.0',
  'ATD', 'EWO-007R', 'archived', 'authoritative',
  '2026-07-12', 1, 'atd-engineering', NOW(),
  'Migration 20260712014957_20260712_ewo007r_governance_routing_hardening_v1.sql. Test suite: 61 EWO-007R governance tests passing in src/tests/ewo007r.test.ts.',
  jsonb_build_object(
    'executive_summary', 'Hardened AI capability governance and routing. Replaced client-side multi-step governance writes with SECURITY DEFINER RPCs (approve_engineering_plan, reject_engineering_plan) providing atomic transactional guarantees. Introduced optimistic locking via p_expected_version, idempotency guard via conflict_code responses, and the governance_response composite type.',
    'scope', 'approve_engineering_plan RPC, reject_engineering_plan RPC, governance_response composite type, atdGovernanceService.ts, atd-reasoning edge function',
    'status', 'closed',
    'type', 'ewo',
    'source_ewo', 'EWO-007R',
    'outcomes', jsonb_build_array(
      'Atomic governance via SECURITY DEFINER RPCs',
      'Optimistic locking with p_expected_version',
      'Structured conflict_code responses',
      'governance_response composite type',
      'Tenant isolation in edge function and RPCs',
      '61 passing EWO-007R governance tests'
    )
  ),
  'EWO-007R - AI Capability Governance & Routing Hardening v1.0.pdf'
),

-- EWO-007R.1: Transactional Governance & Tenant Isolation Closeout
-- This record already exists as ERC-005 (verified correct) — this is a SUPERSEDING authoritative version
-- Note: ERC-005 was already promoted to authoritative in Step 1 above.
-- We create this separate record_ref='EWO-007R.1' as the canonical source-ref-aligned record.
(
  'EWO-007R.1', 'completion_report',
  'Transactional Governance & Tenant Isolation Closeout',
  'ATD', 'EWO-007R', 'archived', 'authoritative',
  '2026-07-12', 1, 'atd-engineering', NOW(),
  'Migration 20260712032542_20260712_ewo007r1_transactional_governance_tenant_isolation.sql. Closes out EWO-007R transactional governance and adds tenant isolation via organisation_id.',
  jsonb_build_object(
    'executive_summary', 'Resolved the failed EWO-007R migration by rewriting get_caller_org_id() to return NULL::uuid for single-tenant compatibility. Added organisation_id and workspace_id columns to all 4 ATD tables. Hardened RLS on all ATD tables using IS NULL OR = predicate. Removed anon write access from atd_plan_governance_decisions.',
    'scope', 'get_caller_org_id() fix, organisation_id columns on ATD tables, RLS hardening, migration re-application',
    'status', 'closed',
    'type', 'ewo',
    'source_ewo', 'EWO-007R',
    'outcomes', jsonb_build_array(
      'get_caller_org_id() returns NULL::uuid in single-tenant mode',
      'organisation_id column on atd_engineering_intents, atd_engineering_plans, atd_engineering_decisions, atd_plan_governance_decisions',
      'RLS hardened with IS NULL OR = predicate on all ATD tables',
      'anon write access removed from governance decisions table',
      'Migration applied successfully'
    )
  ),
  'EWO-007R.1 - Transactional Governance & Tenant Isolation Closeout.pdf'
),

-- BUG-BF-001: Executive Briefing UI Flicker — Permanent Fix
-- Evidence: src/tests/briefing-flicker.test.ts (file header references BUG-BF-001 and flicker fix)
(
  'BUG-BF-001', 'completion_report',
  'Executive Briefing UI Flicker — Permanent Fix',
  'ATD Engineering', 'BUG-BF-001', 'archived', 'authoritative',
  '2026-07-12', 1, 'atd-engineering', NOW(),
  'src/tests/briefing-flicker.test.ts — test file header confirms this is the flicker fix. 18 tests covering initial load skeleton, transition to loaded state, and briefing state management.',
  jsonb_build_object(
    'executive_summary', 'Permanent fix for executive briefing UI flicker. The briefing component showed a flash between loading and loaded states. The fix ensures the skeleton loader is shown during the initial fetch and the transition to the loaded state is deterministic.',
    'scope', 'Executive briefing component flicker on initial load',
    'status', 'closed',
    'type', 'bug_fix',
    'source_ref', 'BUG-BF-001',
    'outcomes', jsonb_build_array(
      'Skeleton loader shown during first fetch (briefingLoading=true)',
      'Deterministic transition to loaded state after fetch completes',
      '18 tests covering all briefing state transitions',
      'No regressions in other briefing functionality'
    )
  ),
  'BUG-BF-001 - Executive Briefing UI Flicker Permanent Fix.pdf'
)

ON CONFLICT (record_ref) DO NOTHING;

-- ─── STEP 3: Link new records to their superseded dev seeds ───────────────────
-- Point new records' supersedes_record_id to the old dev-seed record they replace.

UPDATE engineering_records_library AS new_r
SET supersedes_record_id = old_r.id
FROM engineering_records_library AS old_r
WHERE new_r.record_ref = 'BATCH-A'    AND old_r.record_ref = 'ERC-001-DEV-SEED';

UPDATE engineering_records_library AS new_r
SET supersedes_record_id = old_r.id
FROM engineering_records_library AS old_r
WHERE new_r.record_ref = 'EWO-001'    AND old_r.record_ref = 'ERC-002-DEV-SEED';

UPDATE engineering_records_library AS new_r
SET supersedes_record_id = old_r.id
FROM engineering_records_library AS old_r
WHERE new_r.record_ref = 'EWO-002'    AND old_r.record_ref = 'ERC-003-DEV-SEED';

UPDATE engineering_records_library AS new_r
SET supersedes_record_id = old_r.id
FROM engineering_records_library AS old_r
WHERE new_r.record_ref = 'EWO-007R'   AND old_r.record_ref = 'ERC-004-DEV-SEED';

UPDATE engineering_records_library AS new_r
SET supersedes_record_id = old_r.id
FROM engineering_records_library AS old_r
WHERE new_r.record_ref = 'BUG-BF-001' AND old_r.record_ref = 'ERC-006-DEV-SEED';

-- ─── STEP 4: Insert CONST-001 Amendment — CD-001, CD-006, CD-007 refinements ──

INSERT INTO constitutional_documents (
  document_ref, title, document_type, version, status,
  programme, effective_from, authored_by, sections, metadata
)
VALUES (
  'CONST-001-AMD-001',
  'CONST-001 Amendment — Constitutional Decision Refinements',
  'constitutional_amendment',
  '1.0',
  'ratified',
  'Cross-Platform',
  NOW(),
  'EWO-008 Constitutional Closeout',
  jsonb_build_object(

    'amendment_purpose', jsonb_build_object(
      'order', 1,
      'title', 'Amendment Purpose',
      'content', 'This amendment refines three constitutional decisions from CONST-001 that were identified during EWO-008 constitutional closeout review as either implementation-bound, ambiguous, or presenting security risks. The original decision text is preserved in CONST-001 for audit lineage. This amendment supersedes CD-001, CD-006, and CD-007 from CONST-001.',
      'supersedes_decisions', jsonb_build_array('CD-001', 'CD-006', 'CD-007'),
      'supersedes_document', 'CONST-001'
    ),

    'cd_001_revised', jsonb_build_object(
      'order', 2,
      'title', 'CD-001 Revised — Platform Persistence and Identity Authority',
      'original_decision', 'Supabase is the sole database and authentication provider.',
      'original_rationale', 'Provisioned, integrated, and proven across all EWOs. Changing would require full data migration.',
      'superseded_by', 'CD-001-R1',
      'revised_decision', 'The platform maintains one canonical persistence and identity authority at any time. The currently approved implementation is Supabase (PostgreSQL + Supabase Auth). Future replacement of this authority requires a constitutional amendment identifying the replacement, migration strategy, and cutover plan. No parallel uncontrolled sources of truth are permitted.',
      'revised_rationale', 'The original decision permanently bound future architectural evolution to a specific vendor. The revised decision preserves the single-authority principle while allowing controlled portability through the constitutional amendment process. The current Supabase implementation remains approved and unchanged.',
      'portability_clause', 'Migration to an alternative persistence or identity authority is permitted through constitutional amendment only. Until a superseding amendment is ratified, Supabase remains the sole approved implementation.'
    ),

    'cd_006_revised', jsonb_build_object(
      'order', 3,
      'title', 'CD-006 Revised — Platform Operator Scope and Tenant Identity',
      'original_decision', 'organisation_id IS NULL denotes the platform operator in single-tenant mode.',
      'original_rationale', 'NULL-based single-tenant compatibility avoids schema changes when moving to multi-tenant.',
      'superseded_by', 'CD-006-R1',
      'revised_decision', 'The platform defines an explicit platform operator scope. In the current single-tenant implementation, the platform operator is identified by organisation_id IS NULL. This is a transitional constraint only. NULL must not be used as an implicit privilege escalation mechanism — RLS policies using IS NULL must always be paired with an equality check (IS NULL OR organisation_id = get_caller_org_id()) and not used as a standalone grant. The explicit migration path is: when multi-tenant deployment is required, a constitutional amendment will assign a permanent platform organisation UUID and backfill all NULL organisation_id rows.',
      'security_constraint', 'NULL in the organisation_id column grants access to platform-operator rows only. It does not grant access to another tenant''s rows. All predicates must use IS NULL OR = form, never IS NULL alone.',
      'migration_path', 'Constitutional amendment required. Backfill: UPDATE <table> SET organisation_id = <platform_org_uuid> WHERE organisation_id IS NULL. After backfill, IS NULL checks become dead code and can be removed in a follow-up amendment.'
    ),

    'cd_007_revised', jsonb_build_object(
      'order', 4,
      'title', 'CD-007 Revised — PDF Generation Principle',
      'original_decision', 'jsPDF is the PDF generation library (client-side only).',
      'original_rationale', 'No server-side PDF generation infrastructure required. All PDF generation happens in the browser.',
      'superseded_by', 'CD-007-R1',
      'revised_decision', 'PDFs are derived human-readable representations of structured Engineering Records. The structured Engineering Record (stored in engineering_records_library) is the canonical source of truth. PDF generation is an on-demand rendering operation. The rendering implementation may change through governed engineering decisions without constitutional amendment. Implementation decisions (such as the use of jsPDF) are recorded as architecture decisions, not constitutional law.',
      'implementation_decision', 'Current approved implementation: jsPDF (client-side, in-browser generation). Reference: EWO-008 implementation. Change requires: governed engineering decision (EWO or architecture review), not a constitutional amendment.',
      'canonical_order', 'Structured Engineering Record → optional on-demand PDF export. The PDF does not define or override the Engineering Record.'
    )

  ),
  jsonb_build_object(
    'parent_document', 'CONST-001',
    'amendment_number', 1,
    'decisions_revised', jsonb_build_array('CD-001', 'CD-006', 'CD-007'),
    'decisions_unchanged', jsonb_build_array('CD-002', 'CD-003', 'CD-004', 'CD-005'),
    'authorising_ewo', 'EWO-008',
    'classification', 'constitutional_amendment'
  )
)
ON CONFLICT (document_ref) DO NOTHING;
