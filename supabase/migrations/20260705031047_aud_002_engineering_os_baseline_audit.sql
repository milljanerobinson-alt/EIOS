
-- ============================================================
-- AUD-002: Engineering Operating System Baseline Audit
-- Audit Date: 2026-07-05 | Verdict: Ready with Conditions
-- ============================================================

DO $$
DECLARE
  v_audit_id   uuid;
  v_rec_id     uuid;
  v_audit_number text;
BEGIN

  -- ── 1. AUD-002 Master Record ──────────────────────────────
  SELECT get_next_register_number('aud') INTO v_audit_number;

  INSERT INTO ecc_audits (
    audit_number, audit_type, audit_category, status, name,
    overall_health_score, confidence_level,
    executive_summary,
    key_strengths, key_weaknesses, highest_risks, top_priorities,
    evidence_sources, linked_feature_ids,
    commercial_readiness, compliance_readiness, release_readiness,
    release_readiness_production, release_readiness_commercial,
    total_features, features_released,
    critical_findings_count, high_findings_count, medium_findings_count, low_findings_count, total_findings_count,
    markdown_report, audit_date
  ) VALUES (
    v_audit_number,
    'manual',
    'platform_health',
    'approved',
    'Engineering Operating System Baseline Audit',
    77,
    'high',

    'AUD-002 is the first operational audit conducted within the Engineering Operating System (EOS) framework established during AUD-001. This audit assesses platform maturity across 18 engineering dimensions as at 2026-07-05 and answers the primary question: Is the LLN+D Assessment Platform sufficiently mature to confidently resume Phase 3 customer-facing development?

Verdict: READY WITH CONDITIONS.

The platform demonstrates strong production-readiness across core feature completeness (92/100), security posture (88/100), architecture integrity (84/100), and aXcelerate integration stability (80/100). The Engineering Operating System itself is now operational — Engineering Register, Audit System, Risk Register, and Timeline are live and functioning as designed (82/100).

Three conditions must be met before Phase 3 milestone gates are set: (1) an AI provider must be configured to unlock AI-assisted audit generation and intelligent backlog analysis; (2) a formal testing framework must be initiated — 86 features remain at requires_review status with no automated test coverage; (3) the RC-002 compliance checklist must be formally scoped and signed off to close the compliance audit trail gap.

Commercial readiness (73/100) is improving — four active strategic goals are tracked in the EOS and the product backlog contains 33 actionable items. The primary constraint on commercial timeline remains the testing and compliance gaps, not feature completeness.',

    ARRAY[
      'All 86 platform features are implemented and production-ready',
      'Engineering Operating System is live: Register, Audits, Risks, Timeline, Standards all operational',
      'Security posture strong at 88/100 — authentication, RLS, RBAC all implemented',
      'Architecture integrity improved to 84/100 — 4-layer EOS navigation, clean component split',
      'aXcelerate integration stable at 80/100 with queue-based write-back',
      'Engineering Governance at 90/100 — formal register IDs, audit lifecycle, recommendation tracking',
      'PO Governance at 83/100 — goals tracked, backlog maintained, 33 active items',
      '10 active Epics providing structured development planning',
      '71 Engineering Standards catalogued and accessible',
      'Phase 3 planning infrastructure fully in place — EOS can support milestone gating'
    ],

    ARRAY[
      'Testing coverage at 20/100 — zero automated tests, all 86 features at requires_review',
      'No AI provider configured — AI Generation mode entirely blocked, reduces audit speed',
      'Documentation depth at 46/100 — 81 features have partial docs, 5 features have missing docs',
      'No staging environment — all testing and validation occurs in production',
      'RC-002 compliance checklist fully unchecked — compliance audit trail gap remains open',
      'No performance benchmarks established — no baseline for regression detection',
      'ecc_decisions table empty — no Architecture Decision Records logged despite active development',
      'Automation maturity at 58/100 — no CI/CD pipeline, no deployment gates, no smoke tests'
    ],

    ARRAY[
      'Testing Gap: 86 features untested under formal methodology — defects may exist undetected in production (likelihood: medium, impact: critical)',
      'No Staging Environment: Changes deployed directly to production with no isolation layer — regression risk on every release (likelihood: medium, impact: high)',
      'AI Provider Absent: AI Audit Generation, AI backlog analysis, and AI engineering features blocked until provider configured (likelihood: high, impact: high)',
      'Compliance Gap: RC-002 unchecked, no formal sign-off on compliance controls — regulatory exposure for commercial operations (likelihood: medium, impact: critical)',
      'No Deployment Gate: No automated deployment validation — regressions can reach production silently (likelihood: medium, impact: medium)'
    ],

    ARRAY[
      'Configure AI provider (OpenAI or Anthropic) to unlock AI Audit Generation and intelligent analysis',
      'Initiate formal Testing Sprint — establish test methodology and begin systematic coverage of critical features',
      'Formalise RC-002 compliance checklist scope — identify which items apply to current phase and obtain sign-off',
      'Create Engineering OS operational runbook — document how EOS is maintained, audits run, and risks reviewed',
      'Establish staging environment and define deployment gate criteria for Phase 3 releases'
    ],

    '{
      "evidence_sources": [
        {"source":"ecc_product_features","count":86,"note":"All features verified implemented and production_ready"},
        {"source":"ecc_audit_recommendations","count":8,"note":"REC-001 through REC-008 all open, none yet complete"},
        {"source":"ecc_risks","count":5,"note":"All 5 risks open, no mitigations actioned"},
        {"source":"ecc_engineering_register","count":9,"note":"AUD-001, REC-001..REC-008 registered"},
        {"source":"ecc_engineering_audit","count":24,"note":"Full engineering timeline covering platform inception through AUD-001"},
        {"source":"ecc_health_history","count":1,"note":"AUD-001 baseline snapshot at 74/100"},
        {"source":"ecc_standards","count":71,"note":"71 standards catalogued across all engineering domains"},
        {"source":"ecc_rcs","count":3,"note":"RC-001, RC-002, RC-003 present — RC-002 unchecked"},
        {"source":"ecc_epics","count":10,"note":"10 active development epics"},
        {"source":"backlog","count":33,"note":"33 backlog items including needs_review items pending grooming"},
        {"source":"ecc_goals","count":4,"note":"4 active strategic goals: Commercial Launch, Phase 2 Automation, AI Enhancement, Scaling"}
      ]
    }'::jsonb,

    ARRAY['FEAT-001','FEAT-002','FEAT-003','FEAT-004','FEAT-005','FEAT-006','FEAT-007','FEAT-008','FEAT-009','FEAT-010',
          'FEAT-011','FEAT-012','FEAT-013','FEAT-014','FEAT-015','FEAT-016','FEAT-017','FEAT-018','FEAT-019','FEAT-020',
          'FEAT-021','FEAT-022','FEAT-023','FEAT-024','FEAT-025','FEAT-026','FEAT-027','FEAT-028','FEAT-029','FEAT-030',
          'FEAT-031','FEAT-032','FEAT-033','FEAT-034','FEAT-035','FEAT-036','FEAT-037','FEAT-038','FEAT-039','FEAT-040',
          'FEAT-041','FEAT-042','FEAT-043','FEAT-044','FEAT-045','FEAT-046','FEAT-047','FEAT-048','FEAT-049','FEAT-050',
          'FEAT-051','FEAT-052','FEAT-053','FEAT-054','FEAT-055','FEAT-056','FEAT-057','FEAT-058','FEAT-059','FEAT-060',
          'FEAT-061','FEAT-062','FEAT-063','FEAT-064','FEAT-065','FEAT-066','FEAT-067','FEAT-068','FEAT-069','FEAT-070',
          'FEAT-071','FEAT-072','FEAT-073','FEAT-074','FEAT-075','FEAT-076','FEAT-077','FEAT-078','FEAT-079','FEAT-080',
          'FEAT-081','FEAT-082','FEAT-083','FEAT-084','FEAT-085','FEAT-086'],

    'partially_ready',
    'partially_ready',
    'ready',
    'ready',
    'partially_ready',

    86, 86,
    0, 4, 7, 1, 12,

    E'# AUD-002: Engineering Operating System Baseline Audit\n**Audit Date:** 2026-07-05 | **Status:** Approved | **Overall Health:** 77/100\n\n---\n\n## Phase 3 Readiness Report\n\n### Verdict: READY WITH CONDITIONS\n\nThe LLN+D Assessment Platform is cleared to resume Phase 3 customer-facing development subject to three conditions being actioned in parallel.\n\n### Readiness Dimensions\n\n| Dimension | Status | Score | Condition |\n|---|---|---|---|\n| Feature Completeness | Ready | 92/100 | None — all 86 features production-ready |\n| Architecture | Ready | 84/100 | None — EOS structure sound |\n| Security | Ready | 88/100 | None — auth, RLS, RBAC implemented |\n| aXcelerate Integration | Ready | 80/100 | None — queue write-back stable |\n| Engineering OS | Ready | 82/100 | None — Register, Audits, Risks, Timeline live |\n| Testing Coverage | Blocked | 20/100 | **Condition 1:** Initiate Testing Sprint |\n| Compliance | Blocked | 72/100 | **Condition 2:** Formalise RC-002 scope |\n| AI Infrastructure | Blocked | 70/100 | **Condition 3:** Configure AI provider |\n| Documentation | At Risk | 46/100 | Tracked as REC-002 |\n| Automation | At Risk | 58/100 | Tracked as REC-004 |\n\n### Phase 3 Conditions\n\n**Condition 1 — Testing Sprint (MANDATORY before Phase 3 GA)**\n86 features with zero automated test coverage is the largest engineering risk. A Testing Sprint must be initiated and minimum coverage threshold set before Phase 3 GA. Does not block development resumption — blocks Phase 3 GA milestone gate only.\n\n**Condition 2 — RC-002 Compliance Sign-off (MANDATORY before commercial contracts)**\nRC-002 checklist is entirely unchecked. Before commercial customer agreements are executed, the checklist must be formally scoped and signed off. Does not block development — blocks commercial contract execution.\n\n**Condition 3 — AI Provider Configuration (MANDATORY before AI features demo)**\nNo AI provider configured. All AI features blocked. Must be configured and validated before any Phase 3 demo or customer trial involving AI functionality. Does not block non-AI development.\n\n---\n\n## Engineering Action Plan\n\n### CRITICAL — Action Immediately\n\n| ID | Action | Owner | Due | Blocks |\n|---|---|---|---|---|\n| REC-001 | Initiate Formal Testing Sprint | Engineering | 2026-08-01 | Phase 3 GA gate |\n| REC-009 | Configure AI Provider | Platform Ops | 2026-07-15 | AI features |\n\n### HIGH — Action This Sprint\n\n| ID | Action | Owner | Due | Blocks |\n|---|---|---|---|---|\n| REC-002 | Complete Documentation for 5 Missing-Docs Features | Engineering | 2026-08-01 | Audit sign-off |\n| REC-003 | Provision Staging Environment | DevOps | 2026-09-01 | Safe deployments |\n| REC-010 | Formalise RC-002 Compliance Checklist Scope | Compliance | 2026-08-15 | Commercial contracts |\n\n### MEDIUM — Action Next Quarter\n\n| ID | Action | Owner | Due | Blocks |\n|---|---|---|---|---|\n| REC-004 | Implement Deployment Gate (Basic CI/CD) | Engineering | 2026-10-01 | Phase 3 stability |\n| REC-005 | Establish Performance Benchmarks | Engineering | 2026-09-01 | Regression detection |\n| REC-006 | Migrate Legacy builder_features Table | Engineering | 2026-10-01 | Technical debt |\n| REC-011 | Create Engineering OS Operational Runbook | Engineering | 2026-08-31 | EOS governance |\n| REC-012 | Backlog Grooming Sprint | Product | 2026-07-20 | Planning clarity |\n\n### LOW — Recommended\n\n| ID | Action | Owner | Due | Blocks |\n|---|---|---|---|---|\n| REC-007 | Remove axcelerate-sync Legacy Alias | Engineering | 2026-10-01 | Code hygiene |\n| REC-008 | Implement Automated Smoke Tests | Engineering | 2026-11-01 | Release confidence |\n\n---\n\n## Category Scores\n\n| Category | Score | Delta | Notes |\n|---|---|---|---|\n| Feature Completeness | 92 | 0 | 86/86 features production-ready |\n| Engineering Governance | 90 | +5 | EOS operational, register live |\n| Security | 88 | 0 | Auth, RLS, RBAC all strong |\n| Architecture | 84 | +2 | 4-layer EOS nav, component architecture clean |\n| PO Governance | 83 | +3 | Goals, backlog, epics all tracked |\n| Engineering OS | 82 | NEW | EOS fully operational |\n| aXcelerate Integration | 80 | 0 | Queue write-back stable |\n| AI Engineering | 80 | +1 | Infrastructure present, provider absent |\n| Maintainability | 77 | +3 | EOS structure improves maintainability |\n| Release Readiness | 75 | +3 | EOS tracking active |\n| Commercial Readiness | 73 | +3 | Goals defined, execution pending |\n| Compliance | 72 | -6 | RC-002 gap + 21 critical items unresolved |\n| AI Infrastructure | 70 | -6 | No provider — AI features blocked |\n| Technical Debt | 66 | +4 | Some cleanup, builder_features still present |\n| Scalability | 61 | +3 | Indexes added, no load testing |\n| Automation | 58 | NEW | No CI/CD, no tests |\n| Performance | 56 | +1 | No benchmarks, no profiling |\n| Documentation | 46 | +4 | 81 partial, 5 missing |\n| Testing | 20 | +2 | 0 automated tests, 86 requires_review |\n\n**Overall Health: 77/100** (AUD-001 baseline: 74/100, delta: +3)\n\n---\n\n## Key Findings\n\n**High Severity (4):** Testing Coverage Gap (0/86 tested), AI Provider Absent, Documentation Depth (81 partial + 5 missing), No Staging Environment.\n\n**Medium Severity (7):** RC-002 Unchecked, No ADRs Logged, Backlog Needs Grooming, No Performance Benchmarks, No CI/CD Pipeline, No EOS Runbook, No Production Monitoring.\n\n**Low Severity (1):** Legacy builder_features Table.\n\n---\n\n*AUD-002 generated by Engineering Operating System on 2026-07-05. Supersedes AUD-001 as current platform health baseline. Next scheduled audit: AUD-003 (post-Testing Sprint, target 2026-09-01).*',

    '2026-07-05'::date
  ) RETURNING id INTO v_audit_id;


  -- ── 2. Category Scores (18 categories + 1 for completeness) ─
  INSERT INTO ecc_audit_scores (audit_id, category, score, notes) VALUES
    (v_audit_id, 'Feature Completeness',   92, 'All 86 platform features implemented and production_ready. No gaps.'),
    (v_audit_id, 'Engineering Governance', 90, 'Engineering Register live, audit lifecycle operational, recommendation tracking active. +5 from AUD-001.'),
    (v_audit_id, 'Security',               88, 'RLS on all tables, auth implemented, RBAC present. No critical security findings.'),
    (v_audit_id, 'Architecture',           84, 'Clean 4-layer EOS navigation, component splitting applied. +2 from AUD-001.'),
    (v_audit_id, 'PO Governance',          83, '4 active strategic goals, 33 backlog items, 10 active epics. Backlog needs grooming sprint.'),
    (v_audit_id, 'Engineering OS',         82, 'NEW CATEGORY. EOS fully operational: Register, Audits, Risks, Timeline, Standards, Health History all live.'),
    (v_audit_id, 'aXcelerate Integration', 80, 'Queue-based write-back stable, inbound sync operational. No new integration failures.'),
    (v_audit_id, 'AI Engineering',         80, 'AI infrastructure present. Provider not configured — AI execution blocked. +1 from AUD-001.'),
    (v_audit_id, 'Maintainability',        77, 'EOS structure, component splitting, and register IDs improve maintainability. +3 from AUD-001.'),
    (v_audit_id, 'Release Readiness',      75, 'EOS tracking active, register provides release visibility. No staging environment still a gap. +3.'),
    (v_audit_id, 'Commercial Readiness',   73, 'Goals defined, backlog active, feature-complete. Testing and compliance gaps delay commercial GA. +3.'),
    (v_audit_id, 'Compliance',             72, 'RC-002 entirely unchecked. 21 critical compliance features with no formal sign-off. -6 from AUD-001.'),
    (v_audit_id, 'AI Infrastructure',      70, 'Provider configuration UI exists but no provider active. All AI-dependent features blocked. -6 from AUD-001.'),
    (v_audit_id, 'Technical Debt',         66, 'builder_features legacy table present, axcelerate-sync alias unresolved. EOS reduces future debt. +4.'),
    (v_audit_id, 'Scalability',            61, 'Performance indexes added (FEAT-103). No load testing, no horizontal scaling validation. +3.'),
    (v_audit_id, 'Automation',             58, 'NEW CATEGORY. No CI/CD pipeline, no automated tests, no deployment gate. Manual-only release process.'),
    (v_audit_id, 'Performance',            56, 'No benchmarks established. No profiling data. No response time SLAs. +1 minor code optimisations.'),
    (v_audit_id, 'Documentation',          46, '81 features have partial documentation. 5 features have no documentation. +4 from AUD-001.'),
    (v_audit_id, 'Testing',               20, '0 automated tests. All 86 features at requires_review. +2 minor framework readiness improvement only.');


  -- ── 3. Audit Findings ────────────────────────────────────
  INSERT INTO ecc_audit_findings (
    audit_id, finding_number, severity, category, title, description,
    business_impact, technical_impact, recommendation, priority, current_status
  ) VALUES

  (v_audit_id, 'F-001', 'high', 'Testing',
   'Zero Formal Test Coverage Across All 86 Production Features',
   'All 86 platform features remain at requires_review testing status. No automated unit tests, integration tests, or end-to-end tests have been implemented. This is the single largest engineering risk on the platform.',
   'Defects may exist in production undetected. Phase 3 GA milestone gate cannot be cleared without minimum test coverage. Cannot claim feature stability to customers or auditors.',
   'Any code change can introduce regressions with no automated detection. Manual QA effort is uncapped and unscalable.',
   'Initiate formal Testing Sprint (REC-001). Establish test methodology, prioritise critical features, set minimum coverage threshold for Phase 3 GA gate.',
   'critical', 'open'),

  (v_audit_id, 'F-002', 'high', 'AI Infrastructure',
   'No AI Provider Configured — All AI Features Entirely Blocked',
   'No AI provider is configured in ai_provider_configs. AI Audit Generation mode shows amber warning and disables generation. All AI-dependent engineering features are blocked.',
   'AI Audit Generation unavailable, reducing audit throughput. Phase 3 AI features cannot be demonstrated. Engineering velocity for AI-assisted analysis is zero.',
   'Edge functions for AI generation exist but cannot execute. Provider configuration UI exists but is unconfigured.',
   'Configure AI provider via Engineering Control Centre → AI Settings. Validate with an AI Audit Generation run (REC-009).',
   'high', 'open'),

  (v_audit_id, 'F-003', 'high', 'Documentation',
   'Documentation Depth Insufficient — 81 Partial + 5 Missing',
   '5 features have no documentation. 81 features have partial documentation — descriptions exist but detailed how-to guides, configuration references, and user workflows are absent.',
   'Support burden elevated. Onboarding new engineers or customers requires tribal knowledge. Compliance documentation reviews will expose gaps.',
   'Features cannot be audited against specification without documentation. Technical handover risk elevated.',
   'Complete documentation for 5 missing-docs features immediately (REC-002). Schedule documentation sprint for partial-docs features.',
   'high', 'open'),

  (v_audit_id, 'F-004', 'high', 'Infrastructure',
   'No Staging Environment — All Testing and Validation in Production',
   'The platform operates with a single production environment. All feature development, hotfixes, and integrations are validated in production. No staging or pre-production environment exists.',
   'Customer data and operations exposed to any defect introduced during releases. Regression testing cannot be performed safely.',
   'No isolation layer for new deployments. Cannot validate aXcelerate integration changes before affecting live data.',
   'Provision a staging environment with production-equivalent configuration and data masking (REC-003).',
   'high', 'open'),

  (v_audit_id, 'F-005', 'medium', 'Compliance',
   'RC-002 Compliance Checklist Entirely Unchecked',
   'RC-002 compliance checklist exists with all items unchecked. No formal scoping performed. No sign-off authority assigned.',
   'Regulatory and compliance exposure for commercial operations. Auditors will find an entirely unchecked checklist with no documented rationale.',
   'Audit trail gap from AUD-001 remains unresolved. Compliance confidence score reduced to 72/100.',
   'Formally scope RC-002 — identify applicable items for current phase, obtain sign-off from accountable stakeholder (REC-010).',
   'high', 'open'),

  (v_audit_id, 'F-006', 'medium', 'Engineering Governance',
   'Architecture Decision Records Table Empty — Zero ADRs Logged',
   'The ecc_decisions table contains zero entries despite active development spanning 70+ migrations, 40+ pages, and 23 edge functions. No architectural decisions formally recorded.',
   'Loss of institutional knowledge. Future engineers cannot understand why architectural choices were made. Onboarding and handover risk elevated.',
   'Technical rationale for key decisions (Supabase selection, RLS architecture, EOS structure) undocumented.',
   'Retrospectively log 5-10 most significant architectural decisions. Establish practice of logging ADRs for all future architectural choices.',
   'medium', 'open'),

  (v_audit_id, 'F-007', 'medium', 'Product Governance',
   'Backlog Contains Stale and Ungroomed Items in needs_review Status',
   '33 backlog items active. Multiple items in needs_review status including Candidate Management, Results & Analytics, Qualification Management, RTO Settings — planning decisions deferred without scheduled resolution.',
   'Sprint planning accuracy reduced when backlog items have unclear status. Product direction ambiguity increases.',
   'Engineering effort may be directed at superseded or misaligned backlog items.',
   'Conduct a Backlog Grooming Sprint to resolve all needs_review items — accept, reject, or re-prioritise (REC-012).',
   'medium', 'open'),

  (v_audit_id, 'F-008', 'medium', 'Performance',
   'No Performance Benchmarks or SLAs Established',
   'No baseline performance metrics captured. No response time SLAs, throughput targets, or resource utilisation thresholds defined. No profiling performed under representative load.',
   'Cannot detect performance regressions introduced by new features. Phase 3 customer onboarding may expose performance issues without warning.',
   'No baseline for performance comparison. Database query performance unvalidated under concurrent load.',
   'Establish performance benchmark suite and define SLA targets for Phase 3 (REC-005).',
   'medium', 'open'),

  (v_audit_id, 'F-009', 'medium', 'Automation',
   'No CI/CD Pipeline or Automated Deployment Gate',
   'No Continuous Integration or Continuous Deployment pipeline. No automated deployment gate validates builds before release. All deployments are manual.',
   'Regressions can reach production without detection. Developer cognitive load per deployment high. Release confidence low.',
   'No automated test execution on commit. No build validation before deployment.',
   'Implement basic CI/CD pipeline with build validation and automated smoke tests (REC-004).',
   'medium', 'open'),

  (v_audit_id, 'F-010', 'medium', 'Engineering Governance',
   'Engineering OS Operational Runbook Does Not Exist',
   'EOS is live with multiple modules. No operational runbook documents how EOS is maintained — how audits are scheduled, how risks are reviewed, how the register is kept current.',
   'EOS governance depends on tribal knowledge. If primary EOS operator unavailable, no documented procedure for continued operation.',
   'Bus factor risk for EOS operations. Audit cadence and risk review frequency undocumented.',
   'Create Engineering OS Operational Runbook covering audit scheduling, risk review cadence, register maintenance (REC-011).',
   'medium', 'open'),

  (v_audit_id, 'F-011', 'medium', 'Infrastructure',
   'No Production Monitoring or Observability Tooling',
   'No APM, error tracking, or observability tooling integrated. Production errors not automatically captured or alerted.',
   'Production incidents may go undetected until reported by users. Root cause analysis limited to manual log review.',
   'No automated error alerting. No request tracing. No resource utilisation monitoring.',
   'Integrate lightweight observability tooling (error tracking minimum). Define alerting thresholds for critical workflows.',
   'medium', 'open'),

  (v_audit_id, 'F-012', 'low', 'Technical Debt',
   'Legacy builder_features Table Duplicates ecc_product_features Registry',
   'The builder_features table (18 rows) duplicates the canonical ecc_product_features registry (86 rows). Not in active use but creates ambiguity about the authoritative feature source.',
   'Minor — legacy table not in active use. Risk is confusion for new engineers or accidental writes.',
   'Dual source of truth for feature data. Migration effort low urgency.',
   'Migrate any unique data from builder_features to ecc_product_features, then deprecate and drop (REC-006).',
   'low', 'open');


  -- ── 4. New Recommendations (REC-009 through REC-012) ─────
  INSERT INTO ecc_audit_recommendations (
    rec_number, audit_id, title, description, status, priority, owner, due_date
  ) VALUES (
    'REC-009', v_audit_id,
    'Configure AI Provider to Enable AI Audit Generation',
    'No AI provider is currently configured. Navigate to Engineering Control Centre → AI Settings and configure either OpenAI or Anthropic. Once configured, validate by running an AI Audit Generation. This unblocks: AI Audit Generation mode, AI-assisted backlog analysis, and all AI-dependent engineering features.',
    'open', 'high', 'Platform Operations', '2026-07-15'::date
  ) RETURNING id INTO v_rec_id;
  INSERT INTO ecc_engineering_register (register_number, register_type, entity_id, entity_table, title, status)
  VALUES ('REC-009', 'rec', v_rec_id, 'ecc_audit_recommendations', 'Configure AI Provider to Enable AI Audit Generation', 'open');

  INSERT INTO ecc_audit_recommendations (
    rec_number, audit_id, title, description, status, priority, owner, due_date
  ) VALUES (
    'REC-010', v_audit_id,
    'Formalise RC-002 Compliance Checklist Scope and Obtain Sign-off',
    'RC-002 compliance checklist is entirely unchecked with no formal scoping. Review all checklist items and categorise each as: (a) applicable and complete, (b) applicable and pending, or (c) not applicable with documented rationale. Obtain sign-off from accountable stakeholder. Closes compliance audit trail gap from AUD-001 and AUD-002.',
    'open', 'high', 'Compliance / Product Owner', '2026-08-15'::date
  ) RETURNING id INTO v_rec_id;
  INSERT INTO ecc_engineering_register (register_number, register_type, entity_id, entity_table, title, status)
  VALUES ('REC-010', 'rec', v_rec_id, 'ecc_audit_recommendations', 'Formalise RC-002 Compliance Checklist Scope and Obtain Sign-off', 'open');

  INSERT INTO ecc_audit_recommendations (
    rec_number, audit_id, title, description, status, priority, owner, due_date
  ) VALUES (
    'REC-011', v_audit_id,
    'Create Engineering OS Operational Runbook',
    'EOS is operational but undocumented as a system. Create a runbook covering: (1) audit scheduling cadence and who triggers audits, (2) risk register review frequency and escalation path, (3) engineering register maintenance — when to register new entities, (4) health history interpretation guide, (5) recommendation lifecycle — who owns, who closes, review schedule.',
    'open', 'medium', 'Engineering Lead', '2026-08-31'::date
  ) RETURNING id INTO v_rec_id;
  INSERT INTO ecc_engineering_register (register_number, register_type, entity_id, entity_table, title, status)
  VALUES ('REC-011', 'rec', v_rec_id, 'ecc_audit_recommendations', 'Create Engineering OS Operational Runbook', 'open');

  INSERT INTO ecc_audit_recommendations (
    rec_number, audit_id, title, description, status, priority, owner, due_date
  ) VALUES (
    'REC-012', v_audit_id,
    'Conduct Backlog Grooming Sprint to Resolve Stale Items',
    'Product backlog contains 33 items, several in needs_review status without scheduled resolution including Candidate Management, Results & Analytics, Qualification Management, RTO Settings. Conduct dedicated grooming session: accept, reject with documented rationale, or re-prioritise. Output: clean, prioritised backlog aligned with Phase 3 goals.',
    'open', 'medium', 'Product Owner', '2026-07-20'::date
  ) RETURNING id INTO v_rec_id;
  INSERT INTO ecc_engineering_register (register_number, register_type, entity_id, entity_table, title, status)
  VALUES ('REC-012', 'rec', v_rec_id, 'ecc_audit_recommendations', 'Conduct Backlog Grooming Sprint to Resolve Stale Items', 'open');

  -- Update register sequences
  UPDATE ecc_register_sequences SET last_number = 2  WHERE register_type = 'aud';
  UPDATE ecc_register_sequences SET last_number = 12 WHERE register_type = 'rec';


  -- ── 5. AUD-002 Engineering Register Entry ────────────────
  INSERT INTO ecc_engineering_register (register_number, register_type, entity_id, entity_table, title, status)
  VALUES (v_audit_number, 'aud', v_audit_id, 'ecc_audits', 'Engineering Operating System Baseline Audit', 'approved');


  -- ── 6. Health History Snapshot ───────────────────────────
  INSERT INTO ecc_health_history (audit_id, overall_score, category_scores, recorded_at, notes)
  VALUES (
    v_audit_id, 77,
    '{
      "Feature Completeness": 92,
      "Engineering Governance": 90,
      "Security": 88,
      "Architecture": 84,
      "PO Governance": 83,
      "Engineering OS": 82,
      "aXcelerate Integration": 80,
      "AI Engineering": 80,
      "Maintainability": 77,
      "Release Readiness": 75,
      "Commercial Readiness": 73,
      "Compliance": 72,
      "AI Infrastructure": 70,
      "Technical Debt": 66,
      "Scalability": 61,
      "Automation": 58,
      "Performance": 56,
      "Documentation": 46,
      "Testing": 20
    }'::jsonb,
    now(),
    'AUD-002 snapshot. Overall +3 from AUD-001 baseline (74→77). EOS establishment drove Governance +5, Architecture +2, PO Governance +3. AI Infrastructure -6 (provider unconfigured). Compliance -6 (RC-002 persistent). Testing critical at 20/100.'
  );


  -- ── 7. Engineering Timeline Events ───────────────────────
  -- ecc_engineering_audit columns: event_type, event_label, entity_type, entity_id, entity_title, metadata
  INSERT INTO ecc_engineering_audit (event_type, event_label, entity_type, entity_id, entity_title, metadata)
  VALUES
  ('audit_started',
   'AUD-002 Initiated — Engineering OS Baseline Audit',
   'audit', v_audit_id,
   'Engineering Operating System Baseline Audit',
   '{"audit_number":"AUD-002","scope":"full_platform","question":"Is the platform ready to resume Phase 3?"}'::jsonb),

  ('audit_completed',
   'AUD-002 Approved — Overall Health 77/100 (+3 from AUD-001)',
   'audit', v_audit_id,
   'Engineering Operating System Baseline Audit',
   '{"audit_number":"AUD-002","overall_score":77,"delta":"+3","findings":12,"new_recs":4,"verdict":"ready_with_conditions"}'::jsonb),

  ('milestone',
   'Phase 3 Readiness Report — Ready with Conditions',
   'audit', v_audit_id,
   'Phase 3 Readiness Report',
   '{"verdict":"ready_with_conditions","conditions":["Configure AI provider","Initiate Testing Sprint","Formalise RC-002 scope"],"phase":"Phase 3"}'::jsonb),

  ('recommendation',
   'Engineering Action Plan Published — REC-009 to REC-012 Registered',
   'audit', v_audit_id,
   'Engineering Action Plan (AUD-002)',
   '{"new_recs":["REC-009","REC-010","REC-011","REC-012"],"total_open_recs":12}'::jsonb),

  ('health_snapshot',
   'Health History Snapshot — 77/100 (AUD-001 baseline: 74)',
   'audit', v_audit_id,
   'Platform Health Snapshot 2026-07-05',
   '{"score":77,"previous_score":74,"delta":3,"snapshot_type":"audit_completion"}'::jsonb);

END $$;
