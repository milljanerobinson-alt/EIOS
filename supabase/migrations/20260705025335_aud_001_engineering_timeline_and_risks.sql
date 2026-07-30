/*
# Engineering Timeline & Risks — AUD-001 Baseline

## Summary
Seeds the Engineering Timeline with significant historical events derived from verified evidence
(migration timestamps, implementation reports, release candidate records).
Also seeds Engineering Risks extracted from AUD-001 findings.

All dates are derived from verified database migration timestamps and the Batch A Implementation Report.
No dates have been estimated without evidence.

## Contents
1. Engineering timeline events — ecc_engineering_audit (13 events)
2. Engineering risks — ecc_risks (5 risks from AUD-001 high/medium findings)
*/

-- ── Engineering Timeline ─────────────────────────────────────────────────────

INSERT INTO ecc_engineering_audit (
  event_type, event_label, entity_type, entity_id, entity_title, rc_number, metadata, created_at
) VALUES

  -- Platform inception (earliest migration: 2026-06-27)
  ('milestone', 'Platform Inception',
   'platform', NULL, 'LLN+D Assessment Platform — Initial Commit',
   NULL,
   '{"milestone": "Foundation", "note": "First migrations applied: profiles, settings, assessments, qualifications, invitations, support, interventions, audit trail — 2026-06-27"}'::jsonb,
   '2026-06-27T00:00:00Z'),

  -- Core platform features launched (authentication, assessments, billing)
  ('milestone', 'Core Platform Live',
   'platform', NULL, 'Authentication, Assessment Engine, Qualification Management, Billing — Operational',
   NULL,
   '{"note": "Email/password auth, Google OAuth, assessment invitations, LLN+D quiz engine, aXcelerate integration, Stripe billing all implemented. Migration series: 20260627–20260629."}'::jsonb,
   '2026-06-29T00:00:00Z'),

  -- Engineering Control Centre created (2026-07-04 migrations)
  ('milestone', 'Engineering Control Centre Created',
   'platform', NULL, 'ECC Phase 1 Foundation — Engineering Operating System Launched',
   'RC-001',
   '{"note": "First ECC migrations applied 2026-07-04. Backlog, production readiness, release candidates, architecture reviews, decisions, documentation, testing, AI journal, change records all established. Engineering OS v1.0."}'::jsonb,
   '2026-07-04T00:00:00Z'),

  -- Product Feature Registry (86 features)
  ('milestone', 'Product Feature Registry — 86 Features Catalogued',
   'platform', NULL, '86 Features across 14 categories fully documented in ecc_product_features',
   'RC-001',
   '{"feature_count": 86, "categories": 14, "note": "Full feature registry seeded 2026-07-04. All features confirmed implemented and production-ready."}'::jsonb,
   '2026-07-04T15:30:00Z'),

  -- Engineering Standards v1.0
  ('milestone', 'Engineering Standards v1.0 Adopted — 71 Standards',
   'platform', NULL, '71 Engineering Standards across 12 categories formally adopted',
   'RC-001',
   '{"standards_count": 71, "categories": 12, "note": "Standards covering Architecture, Database, Backend, Frontend, Security, Performance, Testing, Documentation, AI Collaboration, Code Quality, Release Management, Operations."}'::jsonb,
   '2026-07-04T08:22:34Z'),

  -- ADR-001 accepted
  ('adr', 'ADR-001 Accepted — Core Architecture Principles',
   'decision', NULL, 'ADR-001: Engineering OS v1.0 Core Architecture',
   'RC-001',
   '{"status": "accepted", "note": "Establishes permanent hierarchy: Product → Vision → Roadmap → Milestone → Phase → RC → Release. Defines EOS governance model and single source of truth."}'::jsonb,
   '2026-07-04T10:43:11Z'),

  -- RC-001 verified
  ('rc_verified', 'RC-001 Verified — Phase 1 Foundation Complete',
   'release_candidate', '65179cc3-1f75-4174-885e-3f7049275124', 'RC-001: Phase 1 — Foundation',
   'RC-001',
   '{"note": "aXcelerate token secret fallback fix deployed. ECC Phase 1 foundation complete. Build: successful. All edge functions deployed.", "verified_at": "2026-07-04T02:12:24Z"}'::jsonb,
   '2026-07-04T02:12:24Z'),

  -- Initial Product Audit
  ('audit', 'Initial Product Audit Performed',
   'audit', NULL, 'Product Audit — 86 Features, Roadmap Gaps, Recommendations Identified',
   'RC-001',
   '{"note": "Manual product audit 2026-07-04. 86 features confirmed. High priority: all 86 features require testing review. Medium: 81 partial docs, legacy builder_features duplication."}'::jsonb,
   '2026-07-04T15:37:00Z'),

  -- AI Technical Director introduced (Phase 3 Engineering OS governance)
  ('milestone', 'AI Technical Director Introduced',
   'platform', NULL, 'AI Technical Director capability operational in Engineering layer',
   'RC-003',
   '{"note": "CCAIProductManagerPage implemented. AI Technical Director available as Engineering OS Layer 3 component. Command Centre AI edge function deployed."}'::jsonb,
   '2026-07-04T20:00:00Z'),

  -- Multi-provider AI registry
  ('milestone', 'Multi-Provider AI Registry Operational',
   'platform', NULL, 'AI Provider Registry — OpenAI, Google Gemini, Anthropic Claude supported',
   'RC-003',
   '{"providers": ["OpenAI", "Google Gemini", "Anthropic Claude"], "note": "Centralised AI provider configuration with health checking, usage logging, and cost tracking."}'::jsonb,
   '2026-07-05T00:07:18Z'),

  -- Engineering Constitution adopted
  ('milestone', 'AI Engineering Constitution Adopted',
   'platform', NULL, 'Engineering Constitution — 4 categories, numbered rules, 3 Engineering Personas defined',
   'RC-003',
   '{"categories": ["Engineering Safety", "Architecture", "Quality", "Engineering Workflow"], "personas": ["Product Owner", "AI Technical Director", "Platform Operations"], "note": "Embedded in Platform Operations → General."}'::jsonb,
   '2026-07-05T00:00:00Z'),

  -- Engineering Audit System implemented
  ('milestone', 'Engineering Audit System Implemented',
   'platform', NULL, 'Engineering Audit System — ecc_audits, ecc_audit_scores, ecc_audit_findings operational',
   'RC-003',
   '{"note": "Full audit lifecycle: Draft → In Progress → Under Review → Approved → Closed → Archived. AI audit generation + manual creation. Export framework. Recommendations as first-class objects."}'::jsonb,
   '2026-07-05T01:03:35Z'),

  -- Engineering Register implemented + AUD-001 baseline
  ('milestone', 'Engineering Register Implemented — AUD-001 Baseline Established',
   'audit', NULL, 'AUD-001 Initial Platform Baseline Audit — Permanent Engineering Baseline',
   'RC-003',
   '{"audit_number": "AUD-001", "overall_health_score": 74, "features": 86, "recommendations": 8, "findings": 12, "note": "Historical Reconstruction audit. Approved. Permanent baseline. All future audits compare against AUD-001."}'::jsonb,
   '2026-07-05T02:37:32Z');

-- ── Engineering Risks (from AUD-001 findings) ────────────────────────────────

INSERT INTO ecc_risks (title, description, likelihood, impact, mitigation, owner, status, review_date)
VALUES

  ('Testing Gap — 86 Features Untested Under Formal Methodology',
   'All 86 implemented features are at testing_status = requires_review. No formal test records exist. Risk of undetected regressions during future releases, particularly for compliance_critical and high operational risk features.',
   'medium', 'critical',
   'Initiate formal testing sprint (REC-001). Prioritise: FEAT-101, FEAT-151, FEAT-003, FEAT-073. Create structured test cases and record results for all 86 features.',
   'Engineering Lead', 'open', '2026-08-01'),

  ('Single Production Environment — No Staging Isolation',
   'All testing, migration validation, and batch verification occurs against the production database. No staging environment exists. Schema migrations and edge function testing cannot be validated in isolation.',
   'medium', 'high',
   'Create a separate Supabase project for staging (REC-003). Mirror the production schema. Route all non-production work to staging before applying to production.',
   'Platform Operations', 'open', '2026-08-01'),

  ('aXcelerate Write-Back Queue Failure — ASQA Evidence Gap',
   'FEAT-073 (aXcelerate Write-Back Queue) is high operational risk and compliance_critical. A queue failure could break the chain of evidence required for ASQA compliance, as assessment results would not be written back to the student management system.',
   'low', 'critical',
   'Implement queue monitoring and alerting (REC-004). Add failure notifications. Review queue backoff and stuck recovery configuration (FEAT-102). Ensure queue health is visible in Platform Operations → Monitoring.',
   'Platform Operations', 'open', '2026-07-31'),

  ('Audit Trail Interruption — Compliance Exposure',
   'FEAT-101 (Complete Audit Trail) is critical. Any interruption to audit logging — database failure, edge function error, RLS misconfiguration — creates a gap in the ASQA compliance evidence chain that cannot be retroactively filled.',
   'low', 'critical',
   'Quarterly review of audit trail completeness. Monitor for gaps in audit_trail table entries. Alert on edge function errors for audit-writing operations.',
   'Engineering Lead', 'open', '2026-10-01'),

  ('No Automated Deployment Gate — Regression Risk on Each Release',
   'Without an automated test suite, each release carries unknown regression risk across all 86 features. As the platform grows, manual testing effort scales linearly and may become insufficient to catch all regressions.',
   'medium', 'medium',
   'Implement automated smoke test suite (REC-008) as a deployment gate. Prioritise the 10 most critical user flows. Add to CI/CD pipeline.',
   'Engineering Lead', 'open', '2026-09-01');
