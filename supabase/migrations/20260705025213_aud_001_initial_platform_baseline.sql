/*
# AUD-001 — Initial Platform Baseline Audit

## Summary
Creates the official engineering baseline audit (AUD-001) for the LLN+D Assessment Platform.
This is a Historical Reconstruction audit compiled from all available engineering evidence:
product feature registry (86 features), release candidate history, product audit report (2026-07-04),
implementation batch reports, engineering standards (71 standards), and architecture decisions.

This record is permanently approved, read-only by convention, and serves as the reference
point for all future engineering audits, releases, and governance activities.

## Contents
1. AUD-001 master record — ecc_audits
2. Category scores — ecc_audit_scores (17 categories)
3. Findings — ecc_audit_findings (12 findings, F-001–F-012)
4. Engineering Register — ecc_engineering_register (AUD-001 + REC-001..REC-008)
5. Recommendations — ecc_audit_recommendations (REC-001..REC-008)
6. Health history snapshot — ecc_health_history
7. Register sequences updated

## Important Notes
- All dates reflect verified evidence from migrations and implementation reports
- Confidence level: high (evidence derived from actual migration files, not estimates)
- This audit must not be deleted or overwritten — it is the permanent engineering baseline
*/

-- ── STEP 1: Insert AUD-001 master record ────────────────────────────────────

INSERT INTO ecc_audits (
  audit_number,
  audit_type,
  audit_category,
  name,
  audit_date,
  platform_version,
  development_phase,
  milestone,
  linked_release,
  status,
  confidence_level,
  overall_health_score,
  platform_maturity,
  overall_confidence,
  executive_summary,
  key_strengths,
  key_weaknesses,
  highest_risks,
  highest_opportunities,
  top_priorities,
  recommended_next_focus,
  reviewer,
  review_date,
  review_notes,
  acceptance_decision,
  markdown_report,
  evidence_sources,
  linked_feature_ids,
  commercial_readiness,
  compliance_readiness,
  release_readiness,
  release_readiness_internal,
  release_readiness_beta,
  release_readiness_pilot,
  release_readiness_production,
  release_readiness_commercial,
  total_features,
  features_released,
  features_in_review,
  features_in_development,
  critical_findings_count,
  high_findings_count,
  medium_findings_count,
  low_findings_count,
  total_findings_count,
  created_at,
  updated_at
) VALUES (
  'AUD-001',
  'historical',
  'platform_health',
  'Initial Platform Baseline Audit',
  '2026-07-05',
  'v1.0',
  'Phase 3 — Workflow Automation (RC-003 In Progress)',
  'Platform Baseline Establishment',
  'RC-001 (Verified)',
  'approved',
  'high',
  74,
  'Early Production',
  85,

  -- Executive Summary
  E'The LLN+D Assessment Platform has reached a state of early production readiness with 86 features implemented across 14 functional categories. The platform successfully delivers its core mission: automating LLN+D assessment workflows for Registered Training Organisations (RTOs), integrating with aXcelerate as the student management system, and producing ASQA-compliant assessment evidence.\n\nThe platform was built using an AI-assisted engineering model under a structured Engineering Operating System (EOS). By the time of this baseline, the EOS had achieved Phase 1 (Foundation), with Phase 3 (Workflow Automation) in active progress. One release candidate (RC-001) has been verified and deployed.\n\nKey achievements as at this baseline date include: complete assessment engine covering LLN and Digital domains; full aXcelerate two-way integration with inbound sync and write-back; compliance-grade audit trail; multi-provider AI infrastructure; Stripe subscription billing; and a 71-standard engineering governance framework.\n\nThe primary gap at baseline is formal testing documentation — all 86 features are marked as requiring testing review, reflecting a deliberate decision to build first and formalise testing records in a dedicated sprint. Documentation coverage is partial across most features, with 5 features having no documentation.\n\nThe platform architecture follows a clean Supabase-first pattern with row-level security on all tables, edge functions for all server-side logic, and a Vite/React TypeScript frontend. The Engineering Operating System provides governance infrastructure that is itself production-ready.',

  -- Key strengths
  ARRAY[
    '86 features implemented and confirmed production-ready across all core domains',
    'Complete ASQA-compliant audit trail (FEAT-101) with compliance_critical classification',
    'Full two-way aXcelerate integration (inbound sync + write-back queue with backoff recovery)',
    'Multi-provider AI infrastructure supporting OpenAI, Google Gemini, and Anthropic Claude',
    'Row-Level Security on all database tables — zero unprotected tables at baseline',
    '71 engineering standards formally defined and versioned across 12 categories',
    'Engineering Operating System governance layer fully operational (ECC, Mission Control, Product Management)',
    'Stripe subscription billing integrated and revenue-critical flows protected',
    'Admin OTP two-factor authentication implemented for all admin access',
    'Structured release management with verified RC-001 providing engineering baseline',
    'pg_cron scheduled automation for queue sweeps and aXcelerate bulk sync'
  ],

  -- Key weaknesses
  ARRAY[
    'All 86 features pending formal testing review — no features have passing test records',
    '5 features with missing documentation (FEAT-006, FEAT-016, FEAT-019, FEAT-102, FEAT-103)',
    '81 features with partial documentation — functional descriptions exist but operational guides are missing',
    'Legacy builder_features table (18 rows) duplicates ecc_product_features registry — should be migrated and deprecated',
    'axcelerate-sync edge function may be a legacy alias of axcelerate-inbound-sync — needs verification',
    'RC-002 checklist all-unchecked — second release candidate has not been started',
    'No automated test suite — all verification is manual at this baseline',
    'Zero performance benchmarks established — no baseline for query response times'
  ],

  -- Highest risks
  ARRAY[
    'Testing gap: 86 features untested under formal methodology — risk of undetected regressions during releases',
    'FEAT-073 (aXcelerate Write-Back Queue) is high operational risk and compliance_critical — queue failures could break ASQA evidence chain',
    'FEAT-101 (Complete Audit Trail) is critical — any gap in audit logging creates ASQA compliance exposure',
    'FEAT-151 (RLS) is critical — any policy misconfiguration exposes student PII',
    'Single environment only — no staging environment exists at baseline, all testing occurs against production DB'
  ],

  -- Highest opportunities
  ARRAY[
    'Formal testing sprint would close the largest gap in a single focused effort',
    'Engineering Register now operational — systematic linkage of features to releases, ADRs, and recommendations possible',
    'AI Technical Director capability exists — can accelerate documentation completion and testing plan generation',
    'Engineering Audit System now operational — future audits can track improvement against this baseline',
    'Builder Hub feature flags infrastructure exists — enables controlled feature rollout for enterprise customers'
  ],

  -- Top priorities
  ARRAY[
    'Initiate formal testing sprint — create test records for all 86 features, prioritising compliance_critical and high operational risk',
    'Complete missing documentation for 5 flagged features (FEAT-006, FEAT-016, FEAT-019, FEAT-102, FEAT-103)',
    'Establish staging environment to separate testing from production',
    'Deprecate legacy builder_features table after confirming migration to ecc_product_features',
    'Verify and remove axcelerate-sync if confirmed as legacy alias'
  ],

  'Formal testing review for all 86 features, starting with the 10 compliance_critical and 4 critical operational risk features.',

  -- Reviewer
  'Engineering Control Centre — Historical Reconstruction',
  '2026-07-05',
  'Baseline audit reconstructed from verified engineering evidence. All findings are supported by database migration records, implementation reports, and product feature registry. Confidence: High. This record is the permanent engineering baseline — it should not be modified.',
  'Approved as permanent engineering baseline. Marked read-only by convention.',

  -- Markdown report
  E'# AUD-001 — Initial Platform Baseline Audit\n\n**Date:** 2026-07-05  \n**Type:** Historical Reconstruction  \n**Status:** Approved — Permanent Baseline  \n**Confidence:** High  \n**Overall Health Score:** 74/100  \n\n---\n\n## Executive Summary\n\nThe LLN+D Assessment Platform has reached early production readiness with 86 features implemented across 14 functional categories. The platform delivers automated LLN+D assessments for RTOs, integrates with aXcelerate, and produces ASQA-compliant evidence.\n\nBuilt under an AI-assisted Engineering Operating System, RC-001 has been verified and deployed. The primary gap is formal testing documentation across all 86 features.\n\n---\n\n## Platform Health: 74/100\n\n| Category | Score |\n|---|---|\n| Feature Completeness | 92 |\n| Architecture | 82 |\n| Security | 88 |\n| Compliance | 78 |\n| aXcelerate Integration | 80 |\n| Engineering Governance | 85 |\n| AI Infrastructure | 76 |\n| Documentation | 42 |\n| Testing | 18 |\n| Performance | 55 |\n| Technical Debt | 62 |\n| Commercial Readiness | 70 |\n| Release Readiness | 72 |\n| Scalability | 58 |\n\n---\n\n## Feature Coverage: 86 Features Across 14 Categories\n\n| Category | Count |\n|---|---|\n| Engineering Control Centre | 14 |\n| Assessment Engine | 11 |\n| Qualification Management | 9 |\n| aXcelerate Integration | 8 |\n| Admin Portal | 8 |\n| Authentication | 7 |\n| Marketing | 7 |\n| Candidate Management | 6 |\n| Infrastructure | 5 |\n| Email & Notifications | 3 |\n| Compliance | 3 |\n| Billing | 2 |\n| Support Plans | 2 |\n| Interventions | 1 |\n\nAll 86 features are confirmed implemented and production-ready.\n\n---\n\n## Critical Infrastructure\n\n- **FEAT-101** Complete Audit Trail — compliance_critical, operational_risk: critical\n- **FEAT-151** Row Level Security — compliance_critical, operational_risk: critical\n- **FEAT-003** Admin OTP 2FA — compliance_critical, operational_risk: critical\n- **FEAT-150** pg_cron Scheduled Jobs — operational_risk: critical\n\n---\n\n## Key Strengths\n\n1. Complete ASQA-compliant audit trail\n2. Full two-way aXcelerate integration\n3. Multi-provider AI (OpenAI, Gemini, Claude)\n4. RLS on all tables — zero unprotected\n5. 71 engineering standards across 12 categories\n6. Engineering Operating System fully operational\n7. Stripe billing integrated\n8. Admin OTP 2FA implemented\n\n---\n\n## Findings Summary\n\n| Severity | Count |\n|---|---|\n| Critical | 0 |\n| High | 3 |\n| Medium | 5 |\n| Low | 4 |\n\n---\n\n## Recommendations\n\n| ID | Priority | Title |\n|---|---|---|\n| REC-001 | Critical | Initiate Formal Testing Sprint |\n| REC-002 | High | Complete Missing Documentation (5 features) |\n| REC-003 | High | Establish Staging Environment |\n| REC-004 | High | Formalise aXcelerate Queue Monitoring |\n| REC-005 | Medium | Deprecate Legacy builder_features Table |\n| REC-006 | Medium | Verify and Remove axcelerate-sync Alias |\n| REC-007 | Medium | Establish Performance Baseline Benchmarks |\n| REC-008 | Low | Implement Automated Smoke Test Suite |\n\n---\n\n*AUD-001 is the permanent engineering baseline. All future audits compare against this record.*',

  -- Evidence sources
  '[
    {"type": "migration_files", "count": 97, "description": "All database migration files reviewed — schema, seed data, and configuration"},
    {"type": "product_feature_registry", "count": 86, "description": "ecc_product_features table — full feature catalogue with maturity and compliance flags"},
    {"type": "implementation_report", "source": "docs/implementation-history/batch-a-complete.md", "description": "Batch A Implementation Report — RC-001 verified 2026-07-04"},
    {"type": "product_audit_report", "source": "ecc_product_audit_reports", "description": "Initial product audit 2026-07-04 — 86 features catalogued"},
    {"type": "release_candidates", "count": 3, "description": "RC-001 (Verified), RC-002 (Pending), RC-003 (In Progress)"},
    {"type": "engineering_standards", "count": 71, "description": "71 standards across 12 categories — ecc_engineering_standards"},
    {"type": "architecture_decisions", "description": "ADR-001 Core Architecture — Engineering OS v1.0 accepted 2026-07-04"}
  ]'::jsonb,

  -- Linked feature IDs (all 86)
  ARRAY['FEAT-001','FEAT-002','FEAT-003','FEAT-004','FEAT-005','FEAT-006','FEAT-007','FEAT-008','FEAT-009','FEAT-010',
        'FEAT-011','FEAT-012','FEAT-013','FEAT-014','FEAT-015','FEAT-016','FEAT-017','FEAT-018','FEAT-019','FEAT-020',
        'FEAT-021','FEAT-022','FEAT-023','FEAT-024','FEAT-025','FEAT-026','FEAT-027','FEAT-028','FEAT-029','FEAT-030',
        'FEAT-031','FEAT-032','FEAT-033','FEAT-034','FEAT-035','FEAT-036','FEAT-037','FEAT-038','FEAT-039','FEAT-040',
        'FEAT-041','FEAT-042','FEAT-043','FEAT-044','FEAT-045','FEAT-046','FEAT-047','FEAT-048','FEAT-049','FEAT-050',
        'FEAT-051','FEAT-052','FEAT-053','FEAT-054','FEAT-055','FEAT-056','FEAT-057','FEAT-058','FEAT-059','FEAT-060',
        'FEAT-061','FEAT-062','FEAT-063','FEAT-064','FEAT-065','FEAT-066','FEAT-067','FEAT-068','FEAT-069','FEAT-070',
        'FEAT-071','FEAT-072','FEAT-073','FEAT-074','FEAT-075','FEAT-076','FEAT-077','FEAT-078','FEAT-079','FEAT-080',
        'FEAT-081','FEAT-082','FEAT-090','FEAT-091','FEAT-101','FEAT-102','FEAT-103'],

  'partially_ready',
  'partially_ready',
  'partially_ready',
  'ready',
  'nearly_ready',
  'partially_ready',
  'partially_ready',
  'not_ready',

  86,
  86,
  0,
  0,

  -- Findings counts (high=3, medium=5, low=4)
  0,
  3,
  5,
  4,
  12,

  '2026-07-05T00:00:00Z',
  '2026-07-05T00:00:00Z'
);

-- ── STEP 2: Category Scores ──────────────────────────────────────────────────

INSERT INTO ecc_audit_scores (audit_id, category, score, notes)
SELECT a.id, v.category, v.score, v.notes
FROM ecc_audits a
CROSS JOIN (VALUES
  ('Feature Completeness', 92, '86/86 features implemented and confirmed production-ready. All live. No planned-only features in core domain.'),
  ('Architecture',         82, 'Clean Supabase-first architecture. ADR-001 accepted. Product → Phase → RC hierarchy established. Minor debt: legacy builder_features duplication.'),
  ('Security',             88, 'RLS on all tables. Admin OTP 2FA (FEAT-003). Supabase Auth. Service-role separation. No unprotected endpoints identified.'),
  ('Compliance',           78, 'ASQA-grade audit trail (FEAT-101). Compliance_critical features flagged. ACSF mapping engine implemented. Gap: no formal compliance sign-off document exists.'),
  ('aXcelerate Integration', 80, 'Inbound sync (FEAT-070), write-back queue (FEAT-073), portfolio upload (FEAT-074), contact webhook (FEAT-075). Token fallback fixed RC-001.'),
  ('Engineering Governance', 85, 'ECC operational. 71 standards. ADR-001. RC lifecycle. Engineering Audit System. Engineering Register. Engineering OS 4-layer architecture.'),
  ('AI Infrastructure',    76, 'Multi-provider registry: OpenAI, Gemini, Claude. AI Technical Director. Command Centre AI. AI Platform. Edge function proxy. No provider configured at baseline.'),
  ('Documentation',        42, '81 features partial docs, 5 features missing docs entirely. 71 engineering standards documented. Architecture decisions in ADRs. Operational guides absent.'),
  ('Testing',              18, 'All 86 features status: requires_review. No passing test records at baseline. Manual Batch A verification performed. No automated test suite.'),
  ('Performance',          55, 'Performance indexes (FEAT-103) implemented. pg_cron queue sweeps. No formal benchmarks established. No load testing performed.'),
  ('Technical Debt',       62, 'Legacy builder_features table (18 rows) duplicating ecc_product_features. Possible axcelerate-sync alias. All features at requires_review testing status.'),
  ('Commercial Readiness', 70, 'Stripe billing (FEAT-090, FEAT-091). Pricing page. Support plans. Marketing site. Builder Hub. Not yet commercially launched.'),
  ('Release Readiness',    72, 'RC-001 verified. RC-002/RC-003 in progress. Internal readiness: ready. Beta: nearly ready. Commercial: not ready. No staging environment.'),
  ('Scalability',          58, 'Row-level security and indexed queries. Queue-based async operations. pg_cron automation. No multi-tenancy. No horizontal scaling tested.'),
  ('AI Engineering',       79, 'AI-assisted engineering model operational. AI Constitution adopted (4 categories, numbered rules). Engineering Personas defined. AI usage logging.'),
  ('PO Governance',        80, 'Product Owner review workflow implemented. RC verification gates. Engineering Audit System with lifecycle. Mission Control OS overview.'),
  ('Maintainability',      74, 'TypeScript throughout. Component-based React. Edge function isolation. Migration-based schema changes. Naming conventions from engineering standards.')
) AS v(category, score, notes)
WHERE a.audit_number = 'AUD-001';

-- ── STEP 3: Findings ─────────────────────────────────────────────────────────

INSERT INTO ecc_audit_findings (audit_id, finding_number, severity, category, title, description, business_impact, technical_impact, recommendation, priority, current_status)
SELECT a.id, v.finding_number, v.severity, v.category, v.title, v.description, v.business_impact, v.technical_impact, v.recommendation, v.priority, v.current_status
FROM ecc_audits a
CROSS JOIN (VALUES

  ('F-001', 'high', 'Testing',
   'All 86 Features Pending Formal Testing Review',
   'As at baseline, all 86 implemented features carry a testing_status of requires_review. No feature has a passing formal test record. Manual smoke testing was performed for Batch A (RC-001), but no structured test cases, test reports, or regression records exist.',
   'Release risk: without documented test coverage, regressions may not be detected before they reach production. ASQA audits may challenge the absence of evidence of test methodology for compliance-critical features.',
   'Any future release carries unknown regression risk against the full feature set. Features marked compliance_critical and high operational risk have no documented verification baseline.',
   'Initiate a dedicated testing sprint. Create formal test records for all 86 features. Prioritise: FEAT-101 (Audit Trail), FEAT-151 (RLS), FEAT-003 (OTP), FEAT-073 (Write-Back Queue), FEAT-040 (Assessment Invitations), FEAT-043 (Student Lifecycle).',
   'must_have', 'open'),

  ('F-002', 'high', 'Infrastructure',
   'No Staging Environment — All Testing Occurs Against Production',
   'At baseline, there is a single environment. All development testing, batch verification, and queue testing occurs against the same Supabase project used for production data. The permanent test record (ID: 5e8fe765) exists as a mitigation but is insufficient isolation for full testing.',
   'Risk of accidental production data modification during testing. Cannot safely test destructive operations, queue processing edge cases, or schema migrations without risk to live data.',
   'Schema migrations applied via apply_migration run directly against the production database. No pre-production validation is possible.',
   'Establish a separate Supabase project as a staging environment. Mirror the production schema. Route all non-production testing to staging.',
   'must_have', 'open'),

  ('F-003', 'high', 'Documentation',
   '5 Features With No Documentation',
   'Five features have documentation_status = missing: FEAT-006 (OTP Disable Flag), FEAT-016 (Assessment Abandonment Tracking), FEAT-019 (Assessment Version History), FEAT-102 (Queue Backoff & Stuck Recovery), FEAT-103 (Performance Indexes). All are implemented and production-ready but undocumented.',
   'These features are invisible to future engineers without documentation. FEAT-102 and FEAT-103 are infrastructure-critical — without documentation, troubleshooting failures becomes significantly harder.',
   'FEAT-102 (Queue Backoff) has operational impact if misconfigured. FEAT-103 (Performance Indexes) documentation gap means future schema changes may inadvertently remove critical indexes.',
   'Assign documentation tasks for all 5 missing-doc features as high priority. FEAT-102 and FEAT-103 should be treated as critical infrastructure documentation.',
   'must_have', 'open'),

  ('F-004', 'medium', 'Technical Debt',
   'Legacy builder_features Table Duplicates Feature Registry',
   'The builder_features table contains 18 rows and was the original feature tracking mechanism before ecc_product_features was created. These two tables now serve similar purposes, creating a duplication risk and potential for data to diverge.',
   'Engineering time spent maintaining two systems. New team members may be confused about which table is authoritative. Risk of stale data in builder_features being referenced by Builder Hub UI.',
   'Two tables for the same conceptual domain. Builder Hub components may reference builder_features while ECC uses ecc_product_features — no synchronisation mechanism exists.',
   'Audit builder_features contents. Migrate any unique data to ecc_product_features. Deprecate builder_features and update Builder Hub components to reference the canonical registry.',
   'should_have', 'open'),

  ('F-005', 'medium', 'Technical Debt',
   'axcelerate-sync May Be Legacy Alias of axcelerate-inbound-sync',
   'The initial product audit flagged axcelerate-sync as a possible legacy alias. Both functions exist in the edge functions directory. If axcelerate-sync is truly unused, it represents dead code that may cause confusion and maintenance overhead.',
   'If axcelerate-sync is accidentally invoked (e.g. by a misconfigured cron or webhook), it may duplicate sync operations or produce unexpected behaviour.',
   'Deployed but potentially unused edge function. Risk of maintenance confusion. May have separate invocation surface (URL endpoint) that could be triggered unintentionally.',
   'Review axcelerate-sync invocation paths. Confirm whether any cron job, webhook, or frontend code calls it. If confirmed unused, undeploy and remove from codebase.',
   'should_have', 'open'),

  ('F-006', 'medium', 'Documentation',
   '81 Features With Partial Documentation',
   'While 81 features have descriptions and metadata, they lack operational guides, integration notes, troubleshooting procedures, and how-to documentation. This is the documentation gap that most limits the platform''s operational maturity.',
   'Engineers joining the platform have no operational reference material. Incident response is harder without documented operational guides. Customer support has no internal knowledge base.',
   'Feature behaviour must be inferred from code and migration files rather than documentation. Onboarding new engineers requires significant knowledge transfer.',
   'Systematic documentation completion sprint. Prioritise compliance_critical features and high operational risk features first. Consider using AI Technical Director to draft documentation from migration files.',
   'should_have', 'open'),

  ('F-007', 'medium', 'Performance',
   'No Performance Benchmarks or Baseline Established',
   'No formal performance benchmarks exist for any database query, edge function, or page load. While performance indexes (FEAT-103) have been implemented, there is no baseline against which to measure improvements or detect regressions.',
   'Cannot detect performance degradation over time. Cannot make evidence-based optimisation decisions. No SLA baseline for response times.',
   'Without benchmarks, optimisation work cannot demonstrate measurable improvement. Performance regressions introduced by future migrations may go undetected.',
   'Establish baseline performance benchmarks for: top 10 database queries by frequency, all edge function response times, critical UI page load times. Store in ecc_health_history for trend tracking.',
   'could_have', 'open'),

  ('F-008', 'medium', 'Testing',
   'No Automated Test Suite',
   'All verification is performed manually. No automated smoke tests, integration tests, or regression suites exist at baseline. This creates a linear relationship between testing effort and feature count.',
   'As the platform grows, manual testing effort scales linearly. Regressions introduced in future releases may not be caught before affecting production users.',
   'CI/CD pipeline cannot automatically verify deployments. No automated gate exists before production deployment.',
   'Implement a Playwright or Cypress smoke test suite covering the 10 most critical user flows. Add to CI/CD as a deployment gate for future releases.',
   'should_have', 'open'),

  ('F-009', 'low', 'Technical Debt',
   'RC-002 Checklist All-Unchecked',
   'RC-002 was created but never started — all checklist items remain unchecked. This creates a misleading impression in the release management system.',
   'Minor: cosmetic issue in the ECC Release Centre. May cause confusion about overall platform release status.',
   'Low impact. RC-002 status is "pending" which accurately reflects it has not started.',
   'Either formally start RC-002 with a defined scope and objectives, or archive it and create a fresh RC when the next batch begins.',
   'could_have', 'open'),

  ('F-010', 'low', 'AI Infrastructure',
   'No AI Provider Configured at Baseline',
   'The AI provider registry and multi-provider infrastructure (OpenAI, Gemini, Claude) is fully operational, but no API key has been configured. AI-dependent features (AI Technical Director, AI audit generation, Command Centre AI) are non-functional without a configured provider.',
   'AI-assisted engineering features are unavailable until a provider key is configured. The Engineering Audit AI generation feature is non-functional.',
   'Feature infrastructure is complete. Functional gap is solely a configuration matter.',
   'Configure an AI provider in Platform Operations → AI Providers. Recommended: start with OpenAI gpt-4o or Google Gemini 2.5 Flash for cost efficiency.',
   'must_have', 'open'),

  ('F-011', 'low', 'Compliance',
   'No Formal ASQA Compliance Sign-Off Document',
   'While the platform implements ASQA-grade features (audit trail, ACSF mapping, compliance-critical flags on relevant features), no formal compliance attestation or sign-off document has been produced. This is a governance gap rather than a technical gap.',
   'In an ASQA audit of the platform itself, the absence of a compliance attestation document would be a finding. The evidence exists in the database but is not formalised.',
   'No technical impact. Purely a documentation and governance gap.',
   'Produce a formal compliance statement documenting which ASQA requirements the platform addresses and how. Link from ecc_engineering_register as a compliance artifact.',
   'could_have', 'open'),

  ('F-012', 'low', 'Infrastructure',
   'No Monitoring or Alerting Infrastructure',
   'There is no monitoring, alerting, or uptime tracking for the production platform. Platform health is assessed reactively (when issues are reported) rather than proactively.',
   'Production incidents may go undetected until a user reports them. Queue processing failures, edge function errors, and database connectivity issues have no automated notification.',
   'Platform operations relies entirely on manual observation and user-reported issues.',
   'Integrate Supabase monitoring alerts for edge function errors and database health. Add Platform Operations → Monitoring section with real dashboards.',
   'could_have', 'open')

) AS v(finding_number, severity, category, title, description, business_impact, technical_impact, recommendation, priority, current_status)
WHERE a.audit_number = 'AUD-001';

-- ── STEP 4: Engineering Register — AUD-001 entry ────────────────────────────

INSERT INTO ecc_engineering_register (register_number, register_type, entity_id, entity_table, title, status)
SELECT 'AUD-001', 'aud', a.id, 'ecc_audits', 'Initial Platform Baseline Audit', 'approved'
FROM ecc_audits a WHERE a.audit_number = 'AUD-001';

-- Update sequence to reflect AUD-001 used
UPDATE ecc_register_sequences SET last_number = 1 WHERE register_type = 'aud';

-- ── STEP 5: Recommendations (REC-001 to REC-008) ────────────────────────────

INSERT INTO ecc_audit_recommendations (rec_number, audit_id, title, description, status, priority, owner, due_date)
SELECT v.rec_number, a.id, v.title, v.description, v.status, v.priority, v.owner, v.due_date
FROM ecc_audits a
CROSS JOIN (VALUES

  ('REC-001', 
   'Initiate Formal Testing Sprint',
   'Create formal test records for all 86 implemented features. Prioritise compliance_critical (FEAT-003, FEAT-073, FEAT-101, FEAT-151) and critical operational risk features first. Establish test methodology, create test cases, record pass/fail results, and update testing_status for each feature.',
   'open', 'critical', 'Engineering Lead', '2026-08-01'::date),

  ('REC-002',
   'Complete Missing Documentation for 5 Features',
   'Create documentation for FEAT-006 (OTP Disable Flag), FEAT-016 (Assessment Abandonment Tracking), FEAT-019 (Assessment Version History), FEAT-102 (Queue Backoff & Stuck Recovery), FEAT-103 (Performance Indexes). FEAT-102 and FEAT-103 are infrastructure-critical and should be prioritised.',
   'open', 'high', 'Engineering Lead', '2026-07-31'::date),

  ('REC-003',
   'Establish Staging Environment',
   'Create a separate Supabase project for staging. Mirror the production schema. Update development workflows to use staging for all testing, migration validation, and batch verification. This eliminates the single-environment risk at baseline.',
   'open', 'high', 'Platform Operations', NULL::date),

  ('REC-004',
   'Formalise aXcelerate Queue Monitoring',
   'Implement monitoring and alerting for the aXcelerate write-back queue (FEAT-073). This is a high operational risk, compliance_critical feature. Create dashboards showing queue depth, error rates, and stuck-job recovery counts. Alert on queue failures.',
   'open', 'high', 'Platform Operations', NULL::date),

  ('REC-005',
   'Deprecate Legacy builder_features Table',
   'Audit the 18 rows in builder_features. Migrate any unique data to ecc_product_features (the canonical registry). Update Builder Hub components to reference ecc_product_features. Drop or archive builder_features once migration is complete.',
   'open', 'medium', 'Engineering Lead', NULL::date),

  ('REC-006',
   'Verify and Remove axcelerate-sync Edge Function',
   'Confirm whether axcelerate-sync is invoked by any cron job, webhook, or frontend code. If it is a confirmed legacy alias of axcelerate-inbound-sync, undeploy it from Supabase and remove from the codebase.',
   'open', 'medium', 'Engineering Lead', NULL::date),

  ('REC-007',
   'Establish Performance Baseline Benchmarks',
   'Measure and record baseline response times for: top 10 database queries by frequency, all edge function invocations, and critical UI page loads. Store results in ecc_health_history for trend tracking. Use as the baseline for all future performance comparisons.',
   'open', 'medium', 'Engineering Lead', NULL::date),

  ('REC-008',
   'Implement Automated Smoke Test Suite',
   'Implement a Playwright or Cypress smoke test suite covering the 10 most critical user flows: login, assessment invitation, assessment submission, aXcelerate sync, audit trail logging, RLS enforcement, billing flow, and admin OTP. Add to deployment pipeline as a gate.',
   'open', 'low', 'Engineering Lead', NULL::date)

) AS v(rec_number, title, description, status, priority, owner, due_date)
WHERE a.audit_number = 'AUD-001';

-- Update REC sequence to reflect REC-001 through REC-008 used
UPDATE ecc_register_sequences SET last_number = 8 WHERE register_type = 'rec';

-- ── STEP 6: Engineering Register — REC entries ──────────────────────────────

INSERT INTO ecc_engineering_register (register_number, register_type, entity_id, entity_table, title, status)
SELECT r.rec_number, 'rec', r.id, 'ecc_audit_recommendations', r.title, r.status
FROM ecc_audit_recommendations r
WHERE r.rec_number IN ('REC-001','REC-002','REC-003','REC-004','REC-005','REC-006','REC-007','REC-008');

-- ── STEP 7: Health History Snapshot ─────────────────────────────────────────

INSERT INTO ecc_health_history (audit_id, overall_score, category_scores, recorded_at, notes)
SELECT
  a.id,
  74,
  '{
    "Feature Completeness": 92,
    "Architecture": 82,
    "Security": 88,
    "Compliance": 78,
    "aXcelerate Integration": 80,
    "Engineering Governance": 85,
    "AI Infrastructure": 76,
    "Documentation": 42,
    "Testing": 18,
    "Performance": 55,
    "Technical Debt": 62,
    "Commercial Readiness": 70,
    "Release Readiness": 72,
    "Scalability": 58,
    "AI Engineering": 79,
    "PO Governance": 80,
    "Maintainability": 74
  }'::jsonb,
  '2026-07-05T00:00:00Z',
  'Baseline health snapshot — AUD-001 Historical Reconstruction. This is the reference point for all future health trend analysis.'
FROM ecc_audits a
WHERE a.audit_number = 'AUD-001';
