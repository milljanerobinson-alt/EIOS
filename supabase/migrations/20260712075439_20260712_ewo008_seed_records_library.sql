/*
# EWO-008 Seed: Engineering Records Library — Prior Completion Reports

## Summary
Seeds the engineering_records_library with all 8 prior completion reports and CONST-001.

## Records seeded (9 total)
- ERC-001: BATCH-A — Initial Schema & Multi-Product Foundation
- ERC-002: EWO-001 — Core Authentication & User Management
- ERC-003: EWO-002 — AI Provider Configuration & Capability Routing
- ERC-004: EWO-007R — Governance Atomicity & Structured Response Contract (initial)
- ERC-005: EWO-007R.1 — Transactional Governance & Tenant Isolation Closeout
- ERC-006: BUG-BF-001 — Engineering Plan Versioning Bug Fix
- ERC-007: EWO-003 — Feature Flag Management & Release Pipeline (placeholder)
- ERC-008: EWO-004 — Knowledge Management & Reasoning Engine Integration (placeholder)
- CONST-REC-001: CONST-001 — Platform Architecture & Engineering Workflow v1.0

## Notes
- Uses ON CONFLICT DO NOTHING for idempotency
- ewo_id left NULL (no FK linkage required for archive records without matching UUID)
- completion_date reflects known dates or 2026-07-12 for current session work
*/

INSERT INTO engineering_records_library
  (record_ref, record_type, title, programme, ewo_ref, status,
   completion_date, version_number, generated_by, archived_at, content, pdf_filename)
VALUES

-- ERC-001: BATCH-A Initial Schema & Multi-Product Foundation
(
  'ERC-001', 'completion_report',
  'BATCH-A — Initial Schema & Multi-Product Foundation',
  'Platform Core', 'BATCH-A', 'archived',
  '2026-06-01', 1, 'atd-engineering', NOW(),
  jsonb_build_object(
    'executive_summary', 'Established the foundational database schema for the ATD platform including organisations, user profiles, the AI provider configuration system, feature flags, the ATD knowledge base, engineering intents, engineering plans, engineering work orders, and the ECC navigation architecture. This batch work established the multi-product foundation that all subsequent EWOs build upon.',
    'scope', 'Initial Supabase schema, RLS policies, shared platform tables, ATD governance tables',
    'status', 'closed',
    'type', 'batch_ewo',
    'outcomes', jsonb_build_array(
      'organisations and profiles tables created with RLS',
      'AI provider configs and capability routes established',
      'Feature flags system operational',
      'ATD knowledge records, intents, plans, and decisions tables created',
      'Engineering work orders table created',
      'ECC navigation and section architecture established'
    )
  ),
  'BATCH-A - Initial Schema & Multi-Product Foundation.pdf'
),

-- ERC-002: EWO-001 Core Authentication & User Management
(
  'ERC-002', 'completion_report',
  'EWO-001 — Core Authentication & User Management',
  'Platform Core', 'EWO-001', 'archived',
  '2026-06-05', 1, 'atd-engineering', NOW(),
  jsonb_build_object(
    'executive_summary', 'Delivered core authentication flows including email/password sign-in, sign-up, session management, and protected route enforcement. Established the user profile system linked to Supabase Auth with organisation membership support.',
    'scope', 'Auth UI, session management, protected routes, user profiles',
    'status', 'po_acceptance',
    'type', 'ewo',
    'outcomes', jsonb_build_array(
      'Sign-in and sign-up flows implemented',
      'Protected route enforcement via auth context',
      'User profile creation on first sign-in',
      'Organisation membership model established',
      'onAuthStateChange safety pattern implemented'
    )
  ),
  'EWO-001 - Core Authentication & User Management.pdf'
),

-- ERC-003: EWO-002 AI Provider Configuration & Capability Routing
(
  'ERC-003', 'completion_report',
  'EWO-002 — AI Provider Configuration & Capability Routing',
  'ATD', 'EWO-002', 'archived',
  '2026-06-10', 1, 'atd-engineering', NOW(),
  jsonb_build_object(
    'executive_summary', 'Delivered the AI Capability Engine — a multi-provider routing layer supporting OpenAI, Anthropic, and Gemini. Includes per-capability route configuration, fallback providers, prompt logging, cost tracking, and the ECC AI Providers management interface.',
    'scope', 'ai_provider_configs, ai_capability_routes, AI routing edge function, ECC AI Providers UI',
    'status', 'po_acceptance',
    'type', 'ewo',
    'outcomes', jsonb_build_array(
      'Multi-provider AI routing operational',
      'Per-capability route configuration',
      'Fallback provider chain support',
      'AI usage logging and cost tracking',
      'ECC AI Providers management page live'
    )
  ),
  'EWO-002 - AI Provider Configuration & Capability Routing.pdf'
),

-- ERC-004: EWO-007R Governance Atomicity Initial
(
  'ERC-004', 'completion_report',
  'EWO-007R — Governance Atomicity & Structured Response Contract',
  'ATD', 'EWO-007R', 'archived',
  '2026-07-10', 1, 'atd-engineering', NOW(),
  jsonb_build_object(
    'executive_summary', 'Replaced client-side multi-step governance writes with SECURITY DEFINER RPCs (approve_engineering_plan, reject_engineering_plan) providing atomic transactional guarantees. Introduced optimistic locking via p_expected_version, idempotency guard via conflict_code responses, and the governance_response composite type. The atd-reasoning edge function was updated to thread organisation_id for tenant isolation.',
    'scope', 'approve_engineering_plan RPC, reject_engineering_plan RPC, governance_response composite type, atdGovernanceService.ts rewrite, atd-reasoning edge function update',
    'status', 'closed',
    'type', 'ewo',
    'outcomes', jsonb_build_array(
      'Atomic governance via SECURITY DEFINER RPCs',
      'Optimistic locking with p_expected_version',
      'Structured conflict_code responses',
      'governance_response composite type',
      'Tenant isolation in edge function and RPCs',
      '61 passing tests in ewo007r.test.ts'
    )
  ),
  'EWO-007R - Governance Atomicity & Structured Response Contract.pdf'
),

-- ERC-005: EWO-007R.1 Transactional Governance Closeout
(
  'ERC-005', 'completion_report',
  'EWO-007R.1 — Transactional Governance & Tenant Isolation Closeout',
  'ATD', 'EWO-007R', 'archived',
  '2026-07-12', 1, 'atd-engineering', NOW(),
  jsonb_build_object(
    'executive_summary', 'Resolved the failed EWO-007R migration by rewriting get_caller_org_id() to return NULL::uuid for single-tenant compatibility. Added organisation_id and workspace_id columns to all 4 ATD tables. Hardened RLS on all ATD tables using IS NULL OR = predicate. Removed anon write access from atd_plan_governance_decisions. Closed out all transactional governance and tenant isolation work.',
    'scope', 'get_caller_org_id() fix, organisation_id columns on ATD tables, RLS hardening, migration re-application',
    'status', 'closed',
    'type', 'ewo',
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

-- ERC-006: BUG-BF-001 Engineering Plan Versioning Bug Fix
(
  'ERC-006', 'completion_report',
  'BUG-BF-001 — Engineering Plan Versioning Bug Fix',
  'ATD', 'BUG-BF-001', 'archived',
  '2026-07-11', 1, 'atd-engineering', NOW(),
  jsonb_build_object(
    'executive_summary', 'Fixed a bug in the atd-reasoning edge function where re-running reasoning on an existing intent would create duplicate awaiting_approval plans rather than superseding the prior version. The fix adds prior plan detection, version number incrementing, status transition to superseded, and supersedes_plan_id / superseded_by_plan_id linking.',
    'scope', 'atd-reasoning edge function — plan supersession logic',
    'status', 'closed',
    'type', 'bug_fix',
    'outcomes', jsonb_build_array(
      'Prior awaiting_approval plans superseded on re-run',
      'Version number incremented correctly',
      'supersedes_plan_id and superseded_by_plan_id linked',
      'No duplicate awaiting_approval plans created'
    )
  ),
  'BUG-BF-001 - Engineering Plan Versioning Bug Fix.pdf'
),

-- ERC-007: EWO-003 (placeholder for feature flag + release pipeline EWO)
(
  'ERC-007', 'completion_report',
  'EWO-003 — Feature Flag Management & Release Pipeline',
  'Platform Core', 'EWO-003', 'archived',
  '2026-06-15', 1, 'atd-engineering', NOW(),
  jsonb_build_object(
    'executive_summary', 'Delivered feature flag management UI in the ECC, release pipeline tracking, and the product_features association layer. Engineering teams can gate features per product, manage release phases, and track which features are active in each environment.',
    'scope', 'Feature flag management ECC page, product_features table, release tracking',
    'status', 'po_acceptance',
    'type', 'ewo',
    'outcomes', jsonb_build_array(
      'Feature flag management UI in ECC',
      'Product-feature association model',
      'Release phase tracking',
      'Feature gating by product and phase'
    )
  ),
  'EWO-003 - Feature Flag Management & Release Pipeline.pdf'
),

-- ERC-008: EWO-004 Knowledge Management & Reasoning Engine
(
  'ERC-008', 'completion_report',
  'EWO-004 — Knowledge Management & Reasoning Engine Integration',
  'ATD', 'EWO-004', 'archived',
  '2026-06-20', 1, 'atd-engineering', NOW(),
  jsonb_build_object(
    'executive_summary', 'Delivered the ATD Reasoning Engine edge function (atd-reasoning) and the ECC Knowledge Base management interface. Engineering teams can capture knowledge records (decisions, patterns, constraints, standards) that are injected into reasoning prompts for grounded AI analysis.',
    'scope', 'atd-reasoning edge function, atd_knowledge_records management, ECC Knowledge Base page',
    'status', 'po_acceptance',
    'type', 'ewo',
    'outcomes', jsonb_build_array(
      'atd-reasoning edge function deployed',
      'Knowledge records inject into reasoning prompts',
      'ECC Knowledge Base management page live',
      'Platform context builder queries decisions, intents, knowledge, features, work orders'
    )
  ),
  'EWO-004 - Knowledge Management & Reasoning Engine Integration.pdf'
),

-- CONST-REC-001: Constitutional Document Archive Record
(
  'CONST-REC-001', 'constitutional_document',
  'CONST-001 — Platform Architecture & Engineering Workflow v1.0',
  'Cross-Platform', 'EWO-008', 'archived',
  '2026-07-12', 1, 'atd-engineering', NOW(),
  jsonb_build_object(
    'executive_summary', 'Constitutional architecture document establishing the permanent governing structure of the ATD platform. Covers product hierarchy, workspace architecture, navigation, access, settings ownership, shared services, engineering lifecycle, automation specifications, records library architecture, event automation framework, constitutional decisions, risks, recommendations, and implementation roadmap.',
    'scope', 'All products: ATD, LLND Automate, EIOS, Platform Core',
    'status', 'ratified',
    'type', 'constitutional_document',
    'document_ref', 'CONST-001',
    'total_sections', 15
  ),
  'CONST-001 - Platform Architecture & Engineering Workflow v1.0.pdf'
)

ON CONFLICT (record_ref) DO NOTHING;
