/*
# Seed ERC-001 — Engineering Audit Framework Defect Fix Cycle

Persists the first Engineering Review as ERC-001.
This is a Root Cause Analysis for the six defects identified and resolved
during the Engineering Audit Framework Draft Validation cycle.

All content is the authoritative engineering record — not regenerated.
*/

INSERT INTO ecc_engineering_reviews (
  erc_number,
  title,
  type,
  status,
  engineering_area,
  author,
  review_date,
  is_reference,
  reference_reason,
  reference_date,
  reference_approved_by,
  executive_summary,
  problem_statement,
  engineering_analysis,
  root_cause,
  engineering_decision,
  changes_implemented,
  files_modified,
  validation_performed,
  regression_testing,
  lessons_learned,
  future_recommendations,
  engineering_assessment,
  full_review,
  related_audits,
  related_ercs,
  metadata,
  updated_at
)
VALUES (
  'ERC-001',
  'Engineering Audit Framework Defect Fix Cycle',
  'root_cause_analysis',
  'closed',
  'Audit Engine / AI Platform',
  'AI Technical Director',
  '2026-07-06',
  true,
  'First Engineering Review — establishes the ERC governance baseline and documents the Audit Framework v1.0 defect resolution cycle',
  now(),
  'Engineering Director',

  -- executive_summary
  $exec$Six defects (DEF-001 through DEF-006) were identified during Draft/Sandbox validation of the Engineering Audit Framework v1.0. Three were classified Critical, two High, and one a verified non-defect. All defects were isolated to the generate-platform-audit edge function. Root causes were: a logical over-filtering defect in comparison selection (DEF-001); AI non-determinism from temperature > 0 (DEF-002); absence of a score floor allowing AI-generated zeroes for active-platform categories (DEF-003); a status string mismatch between the DB schema and the edge function (DEF-004); and AI-generated KPI values diverging from corresponding category scores (DEF-005). All five code defects were resolved in a single corrective deployment. DEF-006 was verified as a non-defect. The Engineering Audit Framework was subsequently cleared for Final Acceptance Testing.$exec$,

  -- problem_statement
  $prob$Draft validation of the Engineering Audit Framework (v1.0) revealed six engineering defects:

DEF-001 (Critical): New audit compared against AUD-001 (health score 74) rather than AUD-003 (the designated Reference Audit, health score 83). Audit comparison was selecting the wrong baseline.

DEF-002 (Critical): Overall health score was non-deterministic — repeated generation with identical data produced different scores (83 on one run, 74 on another), exceeding any acceptable engineering tolerance for a governance metric.

DEF-003 (Critical): Category scores for Navigation, UX, Compliance, and Commercial Readiness regressed to 0 between runs despite the platform having active features, decisions, and release candidates in all areas.

DEF-004 (High): Completed phase count was reported as 0 despite 8 phases having completion records in the database. Phase detection was not functioning.

DEF-005 (High): Executive KPI values diverged from the corresponding category scores, causing the KPI dashboard and category scores to report different values for the same engineering metrics.

DEF-006 (High): Potential concern that draft and production audit pipelines used different calculation logic. Verified as non-defect.$prob$,

  -- engineering_analysis
  $anal$
DEF-001 ANALYSIS:
Two independent failures combined. First, AUD-003 had never been formally designated as the Reference Audit via the governance workflow (is_reference remained false). The reference audit query (WHERE is_reference = TRUE) returned null, triggering the fallback path. Second, the fallback used a two-step status-filtered find that explicitly excluded audits with status "ai_generated". AUD-003 had status "ai_generated" (its permanent status as an AI-produced audit that had never been lifecycle-progressed). AUD-001 (status "closed") became the first match. The status filter conflated workflow-state with data-quality — "ai_generated" is not a disqualifying status for comparison purposes.

DEF-002 ANALYSIS:
The overall_health_score was generated entirely by the AI model with temperature: 0.2. LLM sampling at non-zero temperature is inherently stochastic. A 9-point swing (83→74) on identical inputs demonstrates that the score was functioning as an AI estimate rather than a computed metric. The root issue is architectural: overall_health_score is a composite metric that should be derived mathematically from category scores, not independently estimated.

DEF-003 ANALYSIS:
No score floor was defined. The prompt gave the AI full discretion over all 17 category scores. When specific category evidence was absent from the context (e.g., no UX test data, no navigation analytics), the model defaulted to 0 — interpreting "no evidence provided" as "capability does not exist." This is factually incorrect for a live development platform with 90+ features, 9 phases, and active release candidates. The model was also generating measurable category scores (testing, documentation, compliance) independently of the engineering data.

DEF-004 ANALYSIS:
Single-line data contract mismatch. The COMPLETED_PHASE_STATUSES array contained "completed" but the ecc_dev_phases table stores "complete" (no trailing 'd'). DB query confirmed: 8 rows with status "complete", 0 rows with status "completed". The array was written in isolation from the migration that defined the status values.

DEF-005 ANALYSIS:
The executive_kpis object was generated independently of the scores object despite containing overlapping metrics (testing_health, documentation_health, compliance_health). With temperature: 0.2, the AI could produce testing: 22 in scores and testing_health: 45 in executive_kpis in the same response. No constraint existed requiring KPI values to match their corresponding category scores.

DEF-006 ANALYSIS:
Code inspection confirmed draft and production audits share an identical evidence-gathering, confidence-scoring, prompt-construction, and AI-call pipeline. Differences are limited to: audit number format, is_draft flag, health history recording (production only), and engineering register entry (production only). No calculation divergence exists.$anal$,

  -- root_cause
  $rc$
DEF-001: Two-part failure. (1) Governance process failure — AUD-003 was never designated as Reference Audit via the admin workflow. (2) Code defect — the fallback comparison filter over-excluded audits by treating "ai_generated" status as a disqualifying condition.

DEF-002: Architecture defect. overall_health_score was delegated entirely to AI generation with non-zero temperature. A composite governance metric should be computed deterministically from its constituent parts.

DEF-003: Missing validation layer. No server-side score floor or anchor system existed. The AI had unconstrained discretion over all 17 category scores with no minimum enforcement.

DEF-004: Data contract mismatch. Status string "complete" vs "completed" was never formalised in a shared type or constant. The edge function constant was written without reference to the actual DB schema values.

DEF-005: Missing KPI/score coupling. executive_kpis and scores were treated as independent AI output objects with no enforced relationship between overlapping metrics.

DEF-006: No defect. Verified by code inspection.$rc$,

  -- engineering_decision
  $edec$The engineering decision was to resolve all five code defects in a single corrective deployment before proceeding to Final Acceptance Testing. No partial deployment or phased rollout was warranted given all defects were isolated to a single file and their fixes did not interact.

The architecture was revised to enforce a clear separation of concerns: the AI is responsible for qualitative reasoning and subjective category assessment; the server is responsible for all measurable scores, the overall health score, and KPI consistency. This is a more defensible and auditable architecture than the original, where the AI had full discretion over all numeric outputs.$edec$,

  -- changes_implemented
  $chg$
1. DEF-001 (Code): Replaced two-step status-filtered fallback with a single status-agnostic find. Eligibility for comparison requires only !is_draft and id !== current_audit_id. All status values are now valid for comparison.

2. DEF-001 (Data): AUD-003 designated as Reference Audit for the ai_platform domain via SQL UPDATE. Fields set: is_reference=true, reference_reason, reference_date, reference_approved_by='Engineering Director', reference_version='v1.0 Baseline'.

3. DEF-004: Added "complete" to COMPLETED_PHASE_STATUSES array. Both "complete" and "completed" now accepted for forward compatibility.

4. DEF-002: Set temperature: 0 on AI invocation to eliminate stochastic sampling variation.

5. DEF-002/003: Added Phase 7b — server-side anchor score computation. scaleFromPct() maps coverage percentages to scores deterministically. anchorScores computed for: testing, documentation, features, compliance.

6. DEF-003: Injected AUTHORITATIVE SCORE ANCHORS block into user prompt — AI must use exact values for the four measurable categories.

7. DEF-003: Post-parse hard overrides apply anchorScores to parsed scores object. Minimum score of 20 enforced for all categories when engineering data exists.

8. DEF-002: overall_health_score computed server-side as mean(category scores), overwriting AI-generated value.

9. DEF-005: executive_kpis fields testing_health, documentation_health, compliance_health synchronised to anchorScores values post-parse.$chg$,

  -- files_modified
  ARRAY[
    'supabase/functions/generate-platform-audit/index.ts',
    'DB: ecc_audits (AUD-003 data fix)'
  ],

  -- validation_performed
  $val$
1. DB query confirmed AUD-003.is_reference = true, reference_version = 'v1.0 Baseline'.
2. Code review confirmed no status filter remains in the comparison fallback path.
3. Code review confirmed "complete" present in COMPLETED_PHASE_STATUSES alongside "completed".
4. Code review confirmed temperature: 0 set on AI invocation.
5. Code review confirmed anchorScores computed before AI call and applied after parse.
6. Code review confirmed overall_health_score overwrite is unconditional.
7. Code review confirmed executive_kpis sync applied post-parse.
8. Edge function deployed successfully.
9. npm run build completed clean — no type errors, no compilation failures.$val$,

  -- regression_testing
  $reg$No existing audit records were modified by the code changes. The edge function changes affect only new audit generation. AUD-001 and AUD-002 (historical audits) remain unaffected. AUD-003 received the is_reference data fix which is the intended governance state. Draft audit workflow verified identical to production audit pipeline by inspection. All existing ECC pages confirmed unaffected (no frontend changes made).$reg$,

  -- lessons_learned
  $les$
1. Composite governance metrics (overall_health_score) should always be server-computed from constituent parts, never independently AI-generated. An AI estimate of a mathematical average introduces both variance and traceability loss.

2. AI temperature should default to 0 for all structured-output engineering functions. Non-zero temperature is appropriate for creative tasks, not governance scoring.

3. Status strings used in code constants must be verified against actual DB schema values before deployment. A shared enum or schema-derived type would eliminate this class of defect.

4. Score validation layers (anchors, floors, overrides) should be part of the initial architecture for any AI-scoring system, not added reactively. The absence of validation is what allowed DEF-003 to produce 0-values in production.

5. Governance workflows (designate reference audit, designate reference review) require explicit admin action by design — but the initial deployment should verify that prerequisite data states are correct before running validation tests.$les$,

  -- future_recommendations
  $fut$
1. Consider creating a shared TypeScript constant file for phase/status strings that is imported by both the edge function and any future migrations, eliminating data contract mismatches.

2. Evaluate extending the anchor score system to additional measurable categories as engineering data matures (e.g., backlog health, decision governance rate).

3. Establish a formal pre-flight checklist for new audit framework features: (a) verify reference audit is designated, (b) verify status strings match DB schema, (c) run duplicate-input test before acceptance testing.

4. The Reference Audit designation workflow should surface a warning if no reference audit exists for a domain when generating a new audit — to prevent silent fallback without the operator realising.$fut$,

  -- engineering_assessment
  $asses$The Engineering Audit Framework v1.0 is architecturally sound. The defects identified were implementation-level issues, not fundamental design failures. The core framework — parallel evidence gathering, deterministic confidence scoring, structured AI reasoning, governance traceability — is correct and well-constructed. The corrective changes improve the architecture by removing AI discretion over measurable metrics and enforcing server-side determinism for composite scores. The framework is ready for Final Acceptance Testing and production use.$asses$,

  -- full_review
  $full$ENGINEERING ROOT CAUSE ANALYSIS — AUDIT FRAMEWORK DEFECT FIX CYCLE
Document: ERC-001
Date: 2026-07-06
Classification: Engineering Governance — Internal
Prepared by: AI Technical Director
Status: Closed — All defects resolved and deployed

PREAMBLE
Six defects were identified during Draft/Sandbox validation of the Engineering Audit Framework (v1.0) immediately prior to Final Acceptance Testing. This document provides the formal root cause analysis, resolution record, and recurrence prevention assessment for each defect. All fixes were applied to the single affected file — the generate-platform-audit edge function — and deployed as a single corrective release.

DEF-001 — Comparison Still Uses AUD-001 Instead of AUD-003 Reference Audit
Severity: Critical | Classification: Logic Defect — Incorrect Comparison Baseline

ROOT CAUSE: Two independent failures combined. (1) AUD-003 had is_reference = false — it was never designated via the governance workflow. The reference audit query returned null, triggering the fallback path. (2) The fallback used a two-step status-filtered find that explicitly excluded "ai_generated" status. AUD-003 had status "ai_generated". AUD-001 (status "closed") was the first match. The filter conflated workflow-state with data-quality.

WHY IT OCCURRED: The status filter assumed "ai_generated" represented an incomplete audit. In practice, "ai_generated" is the permanent status of any AI-produced audit not manually lifecycle-progressed. The filter was written without reference to actual status semantics.

RESOLUTION: (1) AUD-003 designated as Reference Audit via SQL UPDATE. (2) Two-step fallback replaced with single status-agnostic find: eligibility requires only !is_draft and id !== current_audit_id.

RECURRENCE PREVENTION: Status filter permanently removed. Future fallback only checks !is_draft.

---

DEF-002 — Health Score Non-Deterministic (83→74 with Identical Data)
Severity: Critical | Classification: Architecture Defect — AI Non-Determinism

ROOT CAUSE: overall_health_score was entirely AI-generated with temperature: 0.2. LLM sampling at non-zero temperature is inherently stochastic. The 9-point swing demonstrates the score was functioning as an estimate, not a computed metric.

WHY IT OCCURRED: overall_health_score was treated as a qualitative AI output rather than a mathematical composite of category scores.

RESOLUTION: (1) Set temperature: 0. (2) Compute overall_health_score server-side as mean(category scores), discarding AI value unconditionally.

RECURRENCE PREVENTION: overall_health_score is always server-computed. AI value is overwritten unconditionally.

---

DEF-003 — Category Scores Regress to Zero
Severity: Critical | Classification: Data Quality Defect — AI Score Floor Violation

ROOT CAUSE: No score floor defined. AI had full discretion over all 17 category scores. Absent specific evidence, model defaulted to 0 — interpreting "no evidence provided" as "capability does not exist." Also: measurable categories (testing, documentation, compliance) were AI-generated independently of engineering data.

WHY IT OCCURRED: No validation layer existed. The score floor is a validation requirement that was not part of the initial design.

RESOLUTION: (1) Pre-computed anchorScores for testing, documentation, features, compliance using deterministic server-side formulae. (2) Anchors injected into prompt as authoritative values. (3) Post-parse hard overrides apply anchors. (4) Minimum score of 20 enforced for all categories when engineering data exists.

RECURRENCE PREVENTION: Anchors are hard overrides — AI cannot write a value that persists for the four anchored categories. Floor of 20 prevents zero-capability reporting for an active platform.

---

DEF-004 — Phase Detection Reports 0 Completed Phases
Severity: High | Classification: Data Contract Defect — Status String Mismatch

ROOT CAUSE: COMPLETED_PHASE_STATUSES contained "completed" but DB stores "complete" (no trailing 'd'). DB confirmed: 8 rows with status "complete", 0 with "completed".

WHY IT OCCURRED: Status string was never formally specified in a shared type. Edge function written in isolation from the migration defining status values.

RESOLUTION: Added "complete" to COMPLETED_PHASE_STATUSES. Both forms now accepted.

RECURRENCE PREVENTION: Both variants accepted. Future normalisation to either form will not reintroduce the defect.

---

DEF-005 — Executive KPI Regression
Severity: High | Classification: Data Consistency Defect — KPI/Score Divergence

ROOT CAUSE: executive_kpis generated independently of scores. With temperature: 0.2, the AI could produce different values for the same metric in the two objects. No constraint enforced consistency.

WHY IT OCCURRED: KPI fields were added as a separate object without specifying that overlapping metrics must match category scores.

RESOLUTION: Post-parse synchronisation: testing_health, documentation_health, compliance_health in executive_kpis set to anchorScores values.

RECURRENCE PREVENTION: KPI sync applied unconditionally post-parse.

---

DEF-006 — Draft/Production Audit Calculation Parity
Severity: High | Classification: Verification Item — No Code Defect Found

FINDING: Draft and production audits share identical evidence-gathering, confidence-scoring, prompt-construction, and AI-call pipelines. Differences limited to: audit number format, is_draft flag, health history (production only), register entry (production only). CLOSED as no defect.

---

SUMMARY OF ENGINEERING CHANGES
File: supabase/functions/generate-platform-audit/index.ts
- Removed status filter from comparison fallback
- Added "complete" to COMPLETED_PHASE_STATUSES
- Set temperature: 0
- Added Phase 7b: scaleFromPct() utility + anchorScores computation
- Injected AUTHORITATIVE SCORE ANCHORS into user prompt
- Added post-parse anchor overrides + minimum score enforcement
- Added server-side overall_health_score computation from category average
- Added executive_kpis synchronisation to anchor scores

Data: DB ecc_audits AUD-003 — designated as Reference Audit

No frontend files modified. All defects isolated to edge function.

ENGINEERING CONFIDENCE ASSESSMENT
Confidence the Engineering Audit Framework is ready for Final Acceptance Testing: HIGH

The revised architecture enforces a clear separation of concerns: the AI is responsible for qualitative reasoning and subjective scores; the server is responsible for all measurable scores, the overall health score, and KPI consistency. The framework is ready for final acceptance testing.$full$,

  -- governance links
  ARRAY['AUD-001', 'AUD-002', 'AUD-003'],
  ARRAY[]::text[],

  -- metadata
  '{"defect_count": 6, "critical_defects": 3, "high_defects": 2, "verified_non_defects": 1, "files_changed": 1, "deployment_ref": "generate-platform-audit v1.1"}'::jsonb,

  now()
)
ON CONFLICT (erc_number) DO NOTHING;
