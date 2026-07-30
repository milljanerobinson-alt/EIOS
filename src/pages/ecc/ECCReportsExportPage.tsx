import { useState } from 'react';
import { FileText, Download, CheckCircle2, AlertCircle, Clock, BookOpen, Layers } from 'lucide-react';
import jsPDF from 'jspdf';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportStatus = 'COMPLETE' | 'CLOSED' | 'INVESTIGATION COMPLETE';
type ReportType = 'EWO' | 'ERC' | 'BUG' | 'BATCH';

interface ReportSection {
  heading: string;
  body: string;
  table?: { label: string; value: string }[];
}

interface CompletionReport {
  ref: string;
  type: ReportType;
  title: string;
  programme: string;
  completionDate: string;
  status: ReportStatus;
  filename: string;
  executiveSummary: string;
  sections: ReportSection[];
}

// ─── Report Definitions ───────────────────────────────────────────────────────

const REPORTS: CompletionReport[] = [
  {
    ref: 'BATCH-A',
    type: 'BATCH',
    title: 'API Secret Resolution Fix — aXcelerate Queue Functions',
    programme: 'LLND Automate Platform',
    completionDate: '2026-07-04',
    status: 'COMPLETE',
    filename: 'BATCH-A - API Secret Resolution Fix.pdf',
    executiveSummary:
      'Fixed aXcelerate and Resend API secret resolution so queue-processing edge functions fall back to settings DB values when Deno environment variables are absent. Three edge functions were updated. All other credential paths were verified correct and unchanged.',
    sections: [
      {
        heading: 'Backlog Items Completed',
        table: [
          { label: 'BL-SECRET-01', value: 'aXcelerate tokens read only from Deno env — never fell back to settings DB. Queue functions silently failed in production.' },
          { label: 'BL-SECRET-02', value: 'Resend API key fallback in send-email, send-admin-otp, on-assessment-complete confirmed already correct. No changes.' },
          { label: 'BL-WORKFLOW-01', value: 'Permanent implementation, testing, and release workflow established for all future batches.' },
          { label: 'BL-TESTRECORD-01', value: 'Permanent internal testing record created in assessment_invitations.' },
        ],
      },
      {
        heading: 'Files Modified',
        table: [
          { label: 'process-axcelerate-queue/index.ts', value: 'Added Promise.all fetching config + both token rows; Deno.env.get() → DB fallback for apiToken and wsToken.' },
          { label: 'axcelerate-sync/index.ts', value: 'Same fallback pattern applied.' },
          { label: 'upload-axcelerate-portfolio/index.ts', value: 'Extended Promise.all to include apiTokenRes and wsTokenRes; same fallback pattern.' },
        ],
      },
      {
        heading: 'Verification',
        table: [
          { label: 'Build', value: 'npm run build — successful (985.89 kB bundle, 0 errors)' },
          { label: 'Deployment', value: 'All 3 edge functions deployed successfully via Supabase MCP' },
          { label: 'Database', value: 'Confirmed settings table stores axcelerate_api_token and axcelerate_ws_token as expected' },
          { label: 'Regression', value: 'axcelerate-bulk-sync and axcelerate-inbound-sync unchanged and verified correct' },
        ],
      },
      {
        heading: 'Known Limitations',
        body: 'Deno environment variables still take priority over DB values — if a stale/incorrect secret is set as a Deno env var it will override the DB value. This is intentional (env = override). No automated test suite for queue integration; verification is manual.',
      },
      {
        heading: 'Environment Status',
        body: 'CLEAN. No temporary test data created during this batch. The permanent internal test record created requires no cleanup.',
      },
    ],
  },

  {
    ref: 'ERC-001',
    type: 'ERC',
    title: 'Engineering Audit Framework Defect Fix Cycle',
    programme: 'LLND Automate Platform — Engineering Audit Module',
    completionDate: '2026-07-06',
    status: 'CLOSED',
    filename: 'ERC-001 - Engineering Audit Framework Defect Fix Cycle.pdf',
    executiveSummary:
      'Six defects identified during Draft/Sandbox validation of the Engineering Audit Framework v1.0 were diagnosed, resolved, and deployed as a single corrective release. All defects were isolated to the generate-platform-audit edge function. Root causes spanned logic errors, AI non-determinism, data quality issues, status string mismatches, and KPI inconsistency. The framework was verified ready for Final Acceptance Testing at HIGH confidence.',
    sections: [
      {
        heading: 'DEF-001 — Comparison Still Uses AUD-001 Instead of AUD-003',
        body: 'Severity: CRITICAL | Classification: Logic Defect\n\nRoot Cause: AUD-003 had is_reference = false and the fallback status filter excluded "ai_generated" status, causing AUD-001 (status "closed") to be selected instead. Fix: AUD-003 designated as Reference Audit via SQL UPDATE. Two-step fallback replaced with status-agnostic find. Recurrence Prevention: Status filter permanently removed.',
      },
      {
        heading: 'DEF-002 — Health Score Non-Deterministic (83→74 with Identical Data)',
        body: 'Severity: CRITICAL | Classification: Architecture Defect\n\nRoot Cause: overall_health_score fully AI-generated with temperature 0.2. LLM sampling at non-zero temperature is inherently stochastic. Fix: temperature set to 0. overall_health_score now computed server-side as mean(category scores). Recurrence Prevention: AI value overwritten unconditionally.',
      },
      {
        heading: 'DEF-003 — Category Scores Regress to Zero',
        body: 'Severity: CRITICAL | Classification: Data Quality Defect\n\nRoot Cause: No score floor defined; AI defaulted to 0 for categories with no explicit evidence. Fix: Pre-computed anchor scores for testing, documentation, features, compliance injected as authoritative values. Hard overrides applied post-parse. Minimum score of 20 enforced for all categories when engineering data exists.',
      },
      {
        heading: 'DEF-004 — Phase Detection Reports 0 Completed Phases',
        body: 'Severity: HIGH | Classification: Data Contract Defect\n\nRoot Cause: COMPLETED_PHASE_STATUSES contained "completed" but DB stores "complete". Fix: Added "complete" to the constants. Both forms now accepted.',
      },
      {
        heading: 'DEF-005 — Executive KPI Regression',
        body: 'Severity: HIGH | Classification: Data Consistency Defect\n\nRoot Cause: executive_kpis generated independently of scores. Fix: Post-parse synchronisation applied — testing_health, documentation_health, compliance_health in executive_kpis set to anchor score values unconditionally.',
      },
      {
        heading: 'DEF-006 — Draft/Production Audit Calculation Parity',
        body: 'Severity: HIGH | Classification: Verification Item\n\nFinding: Draft and production audits share identical pipelines. Differences limited to audit number format, is_draft flag, health history, and register entry. CLOSED — no defect found.',
      },
      {
        heading: 'Engineering Confidence Assessment',
        body: 'CONFIDENCE: HIGH\n\nThe revised architecture enforces clear separation of concerns: the AI is responsible for qualitative reasoning and subjective scores; the server is responsible for all measurable scores, the overall health score, and KPI consistency. The framework is ready for final acceptance testing.',
      },
    ],
  },

  {
    ref: 'ERC-002',
    type: 'ERC',
    title: 'Engineering Review — Audit Module UI Consistency',
    programme: 'LLND Automate Platform — Engineering Audit Module',
    completionDate: '2026-07-07',
    status: 'INVESTIGATION COMPLETE',
    filename: 'ERC-002 - Audit Module UI Consistency Review.pdf',
    executiveSummary:
      'Read-only investigation confirming an architectural split between the Audit Engine\'s authoritative output and independent UI-side computation. Five findings identified across ECCAuditDetail.tsx and ECCAuditPage.tsx. The root cause is two legacy fallback paths not cleaned up as the engine matured. No implementation changes were made; a prioritised remediation plan was produced.',
    sections: [
      {
        heading: 'Finding 1 — CRITICAL: Unauthorized Fallback Scan in HistoricalComparisonSection',
        body: 'File: src/pages/ecc/ECCAuditDetail.tsx, lines 396–404\n\nThe HistoricalComparisonSection has a Path B that — when previous_audit_id is null — independently queries ecc_audits for any earlier record with the same audit_type. This overrides the engine\'s explicit null decision, causing Legacy AUD-001 to appear as a governance baseline. No workspace filter is applied.',
      },
      {
        heading: 'Finding 2 — HIGH: trendMap Re-derives Score Deltas for Audit List',
        body: 'File: src/pages/ecc/ECCAuditPage.tsx, lines 446–464\n\nA useMemo hook manually computes currentScore - previousScore for every audit. The edge function already computes and stores this; the list is re-deriving it from raw records.',
      },
      {
        heading: 'Finding 3 — HIGH: healthTrend Re-computes Platform Health Movement',
        body: 'File: src/pages/ecc/ECCAuditPage.tsx, lines 478–484\n\nA second useMemo hook computes overall platform health trend from first and last production audit. No authoritative stored source in the database.',
      },
      {
        heading: 'Finding 4 — MEDIUM: ExecutiveKPIsSection Fallback Derivation',
        body: 'File: src/pages/ecc/ECCAuditDetail.tsx, lines 340–345\n\nIf executive_kpis JSONB is empty/null on older audits, the component derives KPI values from raw audit scores. Should be guaranteed by the edge function on every generation.',
      },
      {
        heading: 'Finding 5 — MEDIUM: Delta and Regression Labels Computed in Component',
        body: 'File: src/pages/ecc/ECCAuditDetail.tsx, lines 412–436\n\nOnce a prev audit is resolved (via either path), delta, deltaCrit and Improvement/Regression/No Change labels are all computed in the component rather than read from stored score_deltas.',
      },
      {
        heading: 'Finding 6 — POSITIVE: Category Score Deltas Read from Stored Column',
        body: 'File: src/pages/ecc/ECCAuditDetail.tsx, lines 1763–1775\n\nPer-category score delta display correctly reads from audit.score_deltas (JSONB column). This is the correct pattern and demonstrates the architecture is understood in at least one part of the component.',
      },
      {
        heading: 'Recommended Changes',
        table: [
          { label: 'RC-1 (Critical)', value: 'Remove Path B fallback in HistoricalComparisonSection. Render "No prior audit" directly when previous_audit_id is null.' },
          { label: 'RC-2 (High)', value: 'Remove trendMap useMemo. Read stored score_delta column from engine output for each audit card.' },
          { label: 'RC-3 (High)', value: 'Remove healthTrend useMemo. Compute in a dedicated view or function populated by the engine.' },
          { label: 'RC-4 (Medium)', value: 'Remove ExecutiveKPIsSection derivation fallback. Ensure engine always writes executive_kpis.' },
          { label: 'RC-5 (High)', value: 'After RC-1, verify delta/regression labels handle prev === null correctly (renders nothing, not a zero delta).' },
        ],
      },
    ],
  },

  {
    ref: 'EWO-001',
    type: 'EWO',
    title: 'ATD Product Identity — LLND Automate (Constitutional Layer)',
    programme: 'LLND Automate Platform — ATD Engineering Layer',
    completionDate: '2026-07-11',
    status: 'COMPLETE',
    filename: 'EWO-001 - ATD Product Identity LLND Automate.pdf',
    executiveSummary:
      'Established LLND Automate as the canonical product identity within ATD. Updated all internal engineering tooling, ATD system prompts, and ECC references to recognise the managed product. Completed as ENG-001. All ATD-internal references updated. Customer-facing migration deferred to EWO-002.',
    sections: [
      {
        heading: 'Business Objective',
        body: 'Establish the constitutional foundation for LLND Automate as the canonical product name within the ATD engineering layer.',
      },
      {
        heading: 'Engineering Objective',
        body: 'Migrate all ATD/ECC internal references from placeholder names to LLND Automate. Update edge functions, migration comments, and engineering tooling.',
      },
      {
        heading: 'Scope',
        body: 'ATD internal tooling, ECC UI strings, edge function branding, DB migration comments.',
      },
      {
        heading: 'Classification',
        table: [
          { label: 'Priority', value: 'High' },
          { label: 'Risk Level', value: 'Low' },
          { label: 'Estimated Effort', value: '2–4 hours' },
          { label: 'Owner', value: 'ATD' },
          { label: 'Requested By', value: 'Product Owner' },
        ],
      },
      {
        heading: 'Completion Notes',
        body: 'Completed as part of ENG-001. All ATD-internal references updated. Customer-facing migration deferred to EWO-002.',
      },
      {
        heading: 'Business Value',
        body: 'Establishes authentic product identity across all engineering layers. Enables accurate product tracking and engineering intelligence.',
      },
    ],
  },

  {
    ref: 'EWO-002',
    type: 'EWO',
    title: 'Customer-Facing Rebrand — LLND Automate',
    programme: 'LLND Automate Platform',
    completionDate: '2026-07-11',
    status: 'COMPLETE',
    filename: 'EWO-002 - Customer-Facing Rebrand LLND Automate.pdf',
    executiveSummary:
      'Renamed the customer-facing LLND application to LLND Automate across all UI, emails, and reports. Legal entity LLN+D Pty Ltd was preserved. Build clean with 0 remaining LLN+D references in scope. Back-to-website bug fixed. Copyright footer updated per PO change request.',
    sections: [
      {
        heading: 'Business Objective',
        body: 'Deliver a consistent, professional brand identity to customers and RTOs using the platform.',
      },
      {
        heading: 'Engineering Objective',
        body: 'Replace all customer-visible LLN+D references with LLND Automate across 21 source files, 9 edge functions, and the browser title.',
      },
      {
        heading: 'Scope',
        body: '21 source files, 9 customer edge functions. Excludes LLN+D Pty Ltd legal entity and billing plan descriptors.',
      },
      {
        heading: 'Classification',
        table: [
          { label: 'Priority', value: 'High' },
          { label: 'Risk Level', value: 'Low' },
          { label: 'Estimated Effort', value: '3–6 hours' },
          { label: 'Owner', value: 'ATD' },
          { label: 'Requested By', value: 'Product Owner' },
        ],
      },
      {
        heading: 'Completion Notes',
        body: 'Completed as ENG-002. Build clean. 0 remaining LLN+D references in scope. Back-to-website bug fixed. Copyright footer updated per PO Change Request.',
      },
      {
        heading: 'Business Value',
        body: 'Professional brand identity drives trust and conversion. Required before public launch.',
      },
    ],
  },

  {
    ref: 'EWO-007R',
    type: 'EWO',
    title: 'AI Capability Governance & Routing Hardening v1.0',
    programme: 'LLND Automate Platform — ATD Cognitive Engine',
    completionDate: '2026-07-12',
    status: 'COMPLETE',
    filename: 'EWO-007R - AI Capability Governance Routing Hardening.pdf',
    executiveSummary:
      'Extends the ATD Cognitive Engine schema to support governed lifecycle states, immutable plan versioning, durable PO governance decisions, and full provider route traceability. Adds analysing and awaiting_approval states to intent lifecycle; adds awaiting_approval and superseded to plan lifecycle; adds 8 versioning and traceability columns to plans; adds 17 routing and validation metadata columns to capability executions; creates the atd_plan_governance_decisions table with durable governance records. Migration applied and verified.',
    sections: [
      {
        heading: 'Scope Delivered',
        table: [
          { label: 'atd_engineering_intents', value: 'Added analysing and awaiting_approval to status CHECK constraint' },
          { label: 'atd_engineering_plans', value: 'Added awaiting_approval and superseded to status CHECK; added version_number, supersedes_plan_id, superseded_by_plan_id, plan_content_hash, capability_execution_id, generating_provider, generating_model, plan_payload columns' },
          { label: 'atd_capability_executions', value: 'Added 17 routing/traceability columns: requested_provider_config_id, actual_provider_config_id, provider_type, selected_model, routing_strategy, used_default_provider, fallback_occurred, fallback_reason, routing_metadata, routing_timestamp, provider_latency_ms, validation_status, failure_category, result_plan_id, plan_version, retry_of_execution_id, prompt_tokens, completion_tokens, estimated_cost_usd' },
          { label: 'atd_plan_governance_decisions', value: 'New table — durable PO governance decisions with decision_ref, plan_id, intent_id, decision, decided_by, decided_at, rejection_reason, conditions, notes, routing_metadata. Unique partial index on plan_id for final decisions.' },
        ],
      },
      {
        heading: 'Security',
        body: 'RLS enabled on atd_plan_governance_decisions with anon + authenticated CRUD policies. Unique partial index prevents duplicate final decisions per plan. CHECK constraint enforces rejection_reason is present when decision = rejected.',
      },
      {
        heading: 'Build Validation',
        table: [
          { label: 'npm run build', value: 'PASSED — 0 errors' },
          { label: 'vitest run', value: 'PASSED — 38/38 tests' },
        ],
      },
    ],
  },

  {
    ref: 'EWO-007R.1',
    type: 'EWO',
    title: 'Transactional Governance & Tenant Isolation Closeout',
    programme: 'LLND Automate Platform — ATD Cognitive Engine',
    completionDate: '2026-07-12',
    status: 'COMPLETE',
    filename: 'EWO-007R.1 - Transactional Governance Tenant Isolation Closeout.pdf',
    executiveSummary:
      'Constitutional hardening of the ATD Engineering governance layer. Three previously sequential client-side database operations are now replaced by two PostgreSQL SECURITY DEFINER RPC functions executing as a single transaction with FOR UPDATE row locking, idempotency guards, optimistic locking, tenant isolation checks, and a structured governance_response contract. Organisation and workspace tenant columns added to all four ATD Engineering tables. RLS policies hardened from open USING (true) to org-scoped predicates. The atd-reasoning edge function threads organisation_id through all context queries. Approval halts pipeline before implementation — no EWOs auto-created.',
    sections: [
      {
        heading: 'Database Changes',
        table: [
          { label: 'Migration', value: '20260712_ewo007r1_transactional_governance_tenant_isolation' },
          { label: 'New type', value: 'governance_response (composite) — structured RPC return contract' },
          { label: 'New function', value: 'get_caller_org_id() — returns NULL in single-tenant mode; future multi-tenant uses profiles lookup' },
          { label: 'New RPC', value: 'approve_engineering_plan(uuid, uuid, text, text, text, int) — SELECT FOR UPDATE, idempotency guard, optimistic lock, tenant check, atomic governance INSERT + plan UPDATE + intent UPDATE' },
          { label: 'New RPC', value: 'reject_engineering_plan(uuid, uuid, text, text, text, int) — same protections; rejection_reason required server-side' },
          { label: 'New columns', value: 'organisation_id, workspace_id on: atd_engineering_intents, atd_engineering_plans, atd_plan_governance_decisions, atd_capability_executions' },
          { label: 'RLS', value: 'All four ATD tables hardened to USING (organisation_id IS NULL OR organisation_id = get_caller_org_id()). anon INSERT/UPDATE/DELETE removed from governance decisions table.' },
        ],
      },
      {
        heading: 'Files Modified',
        table: [
          { label: 'src/lib/atdGovernanceService.ts', value: 'Rewritten — persistDecision() replaced with supabase.rpc() calls. GovernanceResult carries conflictCode.' },
          { label: 'src/lib/atdCapabilityFramework.ts', value: 'CapabilityExecutionRequest gains organisation_id. recordExecution() insert includes organisation_id.' },
          { label: 'src/lib/aiCapabilityEngine.ts', value: 'CapabilityExecutionOptions gains organisationId. Edge function fetch body sends organisation_id.' },
          { label: 'supabase/functions/atd-reasoning/index.ts', value: 'Accepts organisation_id. All context queries and intent/plan writes scoped by tenant. Deployed.' },
          { label: 'src/tests/ewo007r.test.ts', value: 'Expanded: 4 new describe blocks, 20 new tests (governance_response contract, concurrency, tenancy, pipeline halt). 61/61 total.' },
        ],
      },
      {
        heading: 'Constraints Honoured',
        table: [
          { label: 'No new user features', value: 'Confirmed — no UI or feature additions' },
          { label: 'No redesign', value: 'Confirmed — no UI component changes' },
          { label: 'Approval halts pipeline', value: 'Confirmed — intent/plan set to approved, never implementing' },
          { label: 'No EWOs auto-created', value: 'Confirmed — governance RPC does not create work orders' },
          { label: 'Single-tenant compat', value: 'Confirmed — NULL org_id passes IS NULL OR = NULL for all existing rows' },
          { label: 'Backwards compatible', value: 'Confirmed — p_expected_version = 0 disables optimistic locking' },
        ],
      },
      {
        heading: 'Build Validation',
        table: [
          { label: 'npm run build', value: 'PASSED — 15.02s, 0 errors' },
          { label: 'vitest run', value: 'PASSED — 61/61 tests, 929ms' },
        ],
      },
    ],
  },

  {
    ref: 'BUG-BF-001',
    type: 'BUG',
    title: 'Executive Briefing UI Flicker — Permanent Architectural Fix',
    programme: 'LLND Automate Platform — Executive Intelligence',
    completionDate: '2026-07-12',
    status: 'COMPLETE',
    filename: 'BUG-BF-001 - Executive Briefing UI Flicker Fix.pdf',
    executiveSummary:
      'Permanently eliminated the UI flickering affecting the AI-generated briefing in the Executive Intelligence section of ECCDirectorDashboard. Two root causes identified and resolved: (1) setBriefingLoading(true) called unconditionally on every refresh, showing skeleton over existing content. (2) Startup catch-up effect had volatile dependencies and no one-shot guard, causing unnecessary re-execution. Architectural fix using useRef, one-shot guard pattern, briefingRefreshing state, and corrected render condition. Nine regression scenarios verified with automated tests.',
    sections: [
      {
        heading: 'Root Causes',
        table: [
          { label: 'RC-1 (Critical)', value: 'setBriefingLoading(true) called unconditionally in loadLatestBriefing() — showed full skeleton on every background refresh, causing visible flicker even with existing briefing data.' },
          { label: 'RC-2 (High)', value: 'Startup catch-up effect used volatile deps (briefingLoading, latestBriefing) and had no one-shot guard — re-fired on every render, creating extra loading cycles.' },
          { label: 'RC-3 (Medium)', value: 'Inline arrow functions passed as onView and onViewBriefing props created new function references on every render, causing unnecessary child re-renders.' },
        ],
      },
      {
        heading: 'Architectural Fix Applied',
        table: [
          { label: 'latestBriefingRef', value: 'useRef tracks current briefing synchronously (not in effect) — loadLatestBriefing reads this without creating a dependency loop.' },
          { label: 'briefingRefreshing', value: 'New state — shows subtle Loader2 spinner during background refresh without replacing existing briefing with skeleton.' },
          { label: 'startupCatchUpFiredRef', value: 'useRef(false) one-shot guard — marked true BEFORE async work, prevents double-execution of startup catch-up.' },
          { label: 'Render condition', value: 'Changed from {briefingLoading ? skeleton : card} to {briefingLoading && !latestBriefing ? skeleton : card} — skeleton only on true first load.' },
          { label: 'Stable handlers', value: 'handleViewHistory, handleSelectBriefing, handleViewLatestBriefing all wrapped in useCallback with stable deps — no more inline arrow re-creation.' },
          { label: 'Effect deps', value: 'Startup catch-up effect deps: [scheduleConfig, loadLatestBriefing] — briefingLoading and latestBriefing deliberately excluded.' },
        ],
      },
      {
        heading: 'Files Modified',
        table: [
          { label: 'src/pages/ecc/ECCDirectorDashboard.tsx', value: 'Core architectural fix — loadLatestBriefing(), latestBriefingRef, briefingRefreshing, startupCatchUpFiredRef, render condition, prop stability' },
          { label: 'src/tests/briefing-flicker.test.ts', value: 'Created — 9 describe blocks, 15+ tests covering all regression scenarios (pure state-machine simulation)' },
        ],
      },
      {
        heading: 'Regression Scenarios Tested',
        body: '1. First load — shows skeleton while loading\n2. First load complete — skeleton replaced by card\n3. Background refresh — card stays visible, no skeleton\n4. Schedule config change — catch-up fires once and only once\n5. Double mount — catch-up fires only once (one-shot guard)\n6. Error on first load — loading clears, error surfaced\n7. Error on refresh — existing briefing preserved\n8. Rapid navigation — race conditions handled\n9. Empty schedule — no catch-up triggered',
      },
      {
        heading: 'Build Validation',
        table: [
          { label: 'npm run build', value: 'PASSED — 0 errors' },
          { label: 'vitest run', value: 'PASSED — 56/56 tests' },
        ],
      },
    ],
  },
];

// ─── PDF generation utility ───────────────────────────────────────────────────

const BRAND = {
  primary:   [15, 23, 42]   as [number, number, number],  // slate-900
  accent:    [37, 99, 235]  as [number, number, number],  // blue-600
  heading:   [30, 41, 59]   as [number, number, number],  // slate-800
  text:      [51, 65, 85]   as [number, number, number],  // slate-700
  muted:     [100, 116, 139] as [number, number, number], // slate-500
  border:    [203, 213, 225] as [number, number, number], // slate-300
  lightBg:   [248, 250, 252] as [number, number, number], // slate-50
  white:     [255, 255, 255] as [number, number, number],
  success:   [21, 128, 61]  as [number, number, number],  // green-700
  warning:   [161, 98, 7]   as [number, number, number],  // yellow-700
};

function statusColor(status: ReportStatus): [number, number, number] {
  if (status === 'COMPLETE') return [21, 128, 61];
  if (status === 'CLOSED') return [37, 99, 235];
  return [100, 116, 139];
}

function typeLabel(type: ReportType): string {
  switch (type) {
    case 'EWO':   return 'Engineering Work Order';
    case 'ERC':   return 'Engineering Review / Root Cause Analysis';
    case 'BUG':   return 'Bug Fix Completion Report';
    case 'BATCH': return 'Batch Implementation Report';
  }
}

type PdfState = {
  doc: jsPDF;
  y: number;
  pageW: number;
  pageH: number;
  margin: number;
  contentW: number;
};

function newPdf(): PdfState {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  return { doc, y: margin, pageW, pageH, margin, contentW: pageW - margin * 2 };
}

function checkPage(s: PdfState, needed = 20) {
  if (s.y + needed > s.pageH - 20) {
    s.doc.addPage();
    s.y = 20;
    drawPageHeader(s, true);
  }
}

function drawPageHeader(s: PdfState, continuation: boolean) {
  const { doc, pageW, margin } = s;
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, pageW, 10, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND.muted);
  if (continuation) {
    doc.setTextColor(200, 200, 200);
    doc.text('LLND Automate — Engineering Command Centre', margin, 7);
    doc.text('CONFIDENTIAL  ·  INTERNAL USE ONLY', pageW - margin, 7, { align: 'right' });
  }
  s.y = 16;
}

function drawCoverPage(s: PdfState, report: CompletionReport) {
  const { doc, pageW, pageH, margin } = s;

  // Full-height navy header block
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, pageW, 85, 'F');

  // Accent bar
  doc.setFillColor(...BRAND.accent);
  doc.rect(0, 82, pageW, 3, 'F');

  // Programme label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('LLND AUTOMATE  ·  ENGINEERING COMMAND CENTRE', margin, 18);

  // Type badge
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(typeLabel(report.type).toUpperCase(), margin, 26);

  // Reference number — large
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.setTextColor(...BRAND.white);
  doc.text(report.ref, margin, 48);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...BRAND.white);
  const titleLines = doc.splitTextToSize(report.title, pageW - margin * 2 - 10) as string[];
  doc.text(titleLines, margin, 58);

  // Programme
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(report.programme, margin, 78);

  // Meta block
  s.y = 100;
  const metaItems = [
    { label: 'Completion Date', value: report.completionDate },
    { label: 'Status', value: report.status },
    { label: 'Type', value: typeLabel(report.type) },
  ];

  for (const item of metaItems) {
    doc.setFillColor(...BRAND.lightBg);
    doc.roundedRect(margin, s.y, s.contentW, 12, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(item.label.toUpperCase(), margin + 4, s.y + 7.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    if (item.label === 'Status') {
      doc.setTextColor(...statusColor(report.status));
    } else {
      doc.setTextColor(...BRAND.heading);
    }
    doc.text(item.value, margin + s.contentW - 4, s.y + 7.5, { align: 'right' });
    s.y += 15;
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.muted);
  doc.text('CONFIDENTIAL  ·  INTERNAL USE ONLY', pageW / 2, pageH - 12, { align: 'center' });
  doc.setTextColor(...BRAND.border);
  doc.line(margin, pageH - 16, pageW - margin, pageH - 16);
  doc.setTextColor(...BRAND.muted);
  doc.text(`Generated ${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}  ·  LLND Automate Engineering Command Centre`, pageW / 2, pageH - 8, { align: 'center' });

  // Start content on next page
  doc.addPage();
  drawPageHeader(s, true);
}

function drawSectionHeading(s: PdfState, text: string) {
  checkPage(s, 18);
  const { doc, margin, contentW } = s;
  s.y += 4;
  doc.setFillColor(...BRAND.accent);
  doc.rect(margin, s.y, 3, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.heading);
  doc.text(text, margin + 6, s.y + 6);
  s.y += 12;
  doc.setDrawColor(...BRAND.border);
  doc.setLineWidth(0.3);
  doc.line(margin, s.y, margin + contentW, s.y);
  s.y += 4;
}

function drawBodyText(s: PdfState, text: string) {
  const { doc, margin, contentW } = s;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.text);
  const lines = doc.splitTextToSize(text, contentW) as string[];
  for (const line of lines) {
    checkPage(s, 6);
    doc.text(line, margin, s.y);
    s.y += 5.5;
  }
  s.y += 3;
}

function drawTable(s: PdfState, rows: { label: string; value: string }[]) {
  const { doc, margin, contentW } = s;
  const labelW = contentW * 0.34;
  const valueW = contentW * 0.62;
  const rowH = 9;

  for (let i = 0; i < rows.length; i++) {
    checkPage(s, rowH + 2);
    const bg = i % 2 === 0 ? BRAND.lightBg : BRAND.white;
    doc.setFillColor(...bg);
    doc.rect(margin, s.y, contentW, rowH, 'F');

    doc.setDrawColor(...BRAND.border);
    doc.setLineWidth(0.2);
    doc.rect(margin, s.y, contentW, rowH, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.accent);
    const labelLines = doc.splitTextToSize(rows[i].label, labelW - 4) as string[];
    doc.text(labelLines[0], margin + 3, s.y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.text);
    const valLines = doc.splitTextToSize(rows[i].value, valueW) as string[];
    const lineSpacing = 4.5;
    const extraRows = valLines.length - 1;

    if (extraRows > 0) {
      // Re-draw the row taller
      const tallH = rowH + extraRows * lineSpacing;
      doc.setFillColor(...bg);
      doc.rect(margin, s.y, contentW, tallH, 'F');
      doc.setDrawColor(...BRAND.border);
      doc.rect(margin, s.y, contentW, tallH, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...BRAND.accent);
      doc.text(labelLines[0], margin + 3, s.y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...BRAND.text);
      for (let v = 0; v < valLines.length; v++) {
        doc.text(valLines[v], margin + labelW + 3, s.y + 6 + v * lineSpacing);
      }
      s.y += tallH;
    } else {
      doc.text(valLines[0] ?? '', margin + labelW + 3, s.y + 6);
      s.y += rowH;
    }
  }
  s.y += 5;
}

function drawExecutiveSummary(s: PdfState, summary: string) {
  const { doc, margin, contentW } = s;
  checkPage(s, 30);
  doc.setFillColor(239, 246, 255); // blue-50
  doc.setDrawColor(...BRAND.accent);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, s.y, contentW, 0, 1.5, 1.5); // placeholder height
  const lines = doc.splitTextToSize(summary, contentW - 16) as string[];
  const boxH = lines.length * 5.5 + 16;
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin, s.y, contentW, boxH, 1.5, 1.5, 'F');
  doc.setDrawColor(...BRAND.accent);
  doc.roundedRect(margin, s.y, contentW, boxH, 1.5, 1.5, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.accent);
  doc.text('EXECUTIVE SUMMARY', margin + 8, s.y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.text);
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i], margin + 8, s.y + 16 + i * 5.5);
  }
  s.y += boxH + 8;
}

function generateReportPdf(report: CompletionReport): void {
  const s = newPdf();
  s.contentW = s.pageW - s.margin * 2;

  drawCoverPage(s, report);
  drawExecutiveSummary(s, report.executiveSummary);

  for (const section of report.sections) {
    drawSectionHeading(s, section.heading);
    if (section.body) {
      drawBodyText(s, section.body);
    }
    if (section.table) {
      drawTable(s, section.table);
    }
  }

  // Page numbers
  const pageCount = s.doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    s.doc.setPage(p);
    s.doc.setFont('helvetica', 'normal');
    s.doc.setFontSize(7);
    s.doc.setTextColor(...BRAND.muted);
    s.doc.text(`Page ${p} of ${pageCount}`, s.pageW - s.margin, s.pageH - 5, { align: 'right' });
  }

  s.doc.save(report.filename);
}

function generateIndexPdf(reports: CompletionReport[]): void {
  const s = newPdf();
  s.contentW = s.pageW - s.margin * 2;
  const { doc, margin, pageW, pageH } = s;

  // Cover
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, pageW, 85, 'F');
  doc.setFillColor(...BRAND.accent);
  doc.rect(0, 82, pageW, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('LLND AUTOMATE  ·  ENGINEERING COMMAND CENTRE', margin, 18);

  doc.setFontSize(28);
  doc.setTextColor(...BRAND.white);
  doc.text('ENGINEERING', margin, 45);
  doc.text('COMPLETION REPORT', margin, 58);
  doc.text('INDEX', margin, 71);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated ${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin, 79);

  // Summary stats box
  s.y = 100;
  const completed = reports.filter(r => r.status === 'COMPLETE' || r.status === 'CLOSED').length;
  doc.setFillColor(...BRAND.lightBg);
  doc.roundedRect(margin, s.y, s.contentW, 20, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...BRAND.accent);
  doc.text(String(reports.length), margin + 8, s.y + 14);
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  doc.text('TOTAL REPORTS', margin + 8, s.y + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...BRAND.success);
  doc.text(String(completed), margin + 55, s.y + 14);
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  doc.text('COMPLETE / CLOSED', margin + 55, s.y + 20);

  s.y += 32;

  // Column headers
  const colW = [28, 68, 32, 38];
  const headers = ['REFERENCE', 'TITLE', 'DATE', 'STATUS'];
  doc.setFillColor(...BRAND.primary);
  doc.rect(margin, s.y, s.contentW, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.white);
  let cx = margin + 3;
  for (let h = 0; h < headers.length; h++) {
    doc.text(headers[h], cx, s.y + 6.5);
    cx += colW[h];
  }
  s.y += 9;

  // Rows
  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    checkPage(s, 14);
    const rowH = 13;
    doc.setFillColor(...(i % 2 === 0 ? BRAND.lightBg : BRAND.white));
    doc.rect(margin, s.y, s.contentW, rowH, 'F');
    doc.setDrawColor(...BRAND.border);
    doc.setLineWidth(0.2);
    doc.line(margin, s.y + rowH, margin + s.contentW, s.y + rowH);

    cx = margin + 3;

    // Ref
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.accent);
    doc.text(r.ref, cx, s.y + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(typeLabel(r.type).substring(0, 20), cx, s.y + 10);
    cx += colW[0];

    // Title
    const titleShort = doc.splitTextToSize(r.title, colW[1] - 4) as string[];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.text);
    doc.text(titleShort[0], cx, s.y + 5.5);
    if (titleShort[1]) {
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.muted);
      doc.text(titleShort[1], cx, s.y + 10);
    }
    cx += colW[1];

    // Date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.text);
    doc.text(r.completionDate, cx, s.y + 7.5);
    cx += colW[2];

    // Status
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...statusColor(r.status));
    doc.text(r.status, cx, s.y + 7.5);

    s.y += rowH;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.muted);
    doc.text('CONFIDENTIAL  ·  INTERNAL USE ONLY', pageW / 2, pageH - 8, { align: 'center' });
    doc.text(`Page ${p} of ${pageCount}`, pageW - margin, pageH - 5, { align: 'right' });
  }

  doc.save('Engineering Completion Report Index.pdf');
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

const TYPE_META: Record<ReportType, { color: string; bg: string; icon: typeof FileText }> = {
  EWO:   { color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',   icon: Layers    },
  ERC:   { color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', icon: BookOpen },
  BUG:   { color: 'text-rose-700',   bg: 'bg-rose-50 border-rose-200',   icon: AlertCircle },
  BATCH: { color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200',   icon: CheckCircle2 },
};

const STATUS_META: Record<ReportStatus, { badge: string; dot: string }> = {
  'COMPLETE':               { badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
  'CLOSED':                 { badge: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-500' },
  'INVESTIGATION COMPLETE': { badge: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-500' },
};

function ReportCard({
  report,
  downloading,
  onDownload,
}: {
  report: CompletionReport;
  downloading: boolean;
  onDownload: () => void;
}) {
  const tm = TYPE_META[report.type];
  const sm = STATUS_META[report.status];
  const Icon = tm.icon;

  return (
    <div className="group bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all duration-200">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`mt-0.5 p-2 rounded-lg border shrink-0 ${tm.bg}`}>
              <Icon className={`w-4 h-4 ${tm.color}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold tracking-wide ${tm.color}`}>{report.ref}</span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${sm.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                  {report.status}
                </span>
              </div>
              <h3 className="mt-1 text-sm font-semibold text-slate-800 leading-tight">{report.title}</h3>
              <p className="mt-0.5 text-xs text-slate-500 truncate">{report.programme}</p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="w-3 h-3" />
            <span>{report.completionDate}</span>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-600 leading-relaxed line-clamp-3">{report.executiveSummary}</p>

        <div className="mt-4 flex items-center justify-between">
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${tm.bg} ${tm.color}`}>
            {typeLabel(report.type)}
          </span>
          <button
            onClick={onDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
          >
            {downloading ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Download className="w-3 h-3" />
                Download PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function ECCReportsExportPage() {
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [indexDownloading, setIndexDownloading] = useState(false);

  function handleDownload(report: CompletionReport) {
    setDownloading(prev => ({ ...prev, [report.ref]: true }));
    setTimeout(() => {
      try {
        generateReportPdf(report);
      } finally {
        setDownloading(prev => ({ ...prev, [report.ref]: false }));
      }
    }, 50);
  }

  function handleDownloadAll() {
    REPORTS.forEach((r, i) => {
      setTimeout(() => {
        try { generateReportPdf(r); } catch { /* non-fatal */ }
      }, i * 400);
    });
  }

  function handleDownloadIndex() {
    setIndexDownloading(true);
    setTimeout(() => {
      try {
        generateIndexPdf(REPORTS);
      } finally {
        setIndexDownloading(false);
      }
    }, 50);
  }

  const completed = REPORTS.filter(r => r.status === 'COMPLETE' || r.status === 'CLOSED').length;
  const ewos = REPORTS.filter(r => r.type === 'EWO').length;
  const ercs = REPORTS.filter(r => r.type === 'ERC').length;
  const bugs = REPORTS.filter(r => r.type === 'BUG' || r.type === 'BATCH').length;

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-5 h-5 text-slate-400" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Engineering Command Centre</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Completion Report Archive</h1>
            <p className="mt-1 text-sm text-slate-500">
              All completed Engineering Work Orders, Root Cause Analyses, and Bug Fix reports. Download individually or export the full index.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownloadIndex}
              disabled={indexDownloading}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
            >
              {indexDownloading ? (
                <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              Export Index PDF
            </button>
            <button
              onClick={handleDownloadAll}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download All
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Total Reports', value: REPORTS.length, color: 'text-slate-800' },
            { label: 'Complete / Closed', value: completed, color: 'text-emerald-700' },
            { label: 'Work Orders (EWO)', value: ewos, color: 'text-blue-700' },
            { label: 'Reviews & Bug Fixes', value: ercs + bugs, color: 'text-violet-700' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Reports grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {REPORTS.map(report => (
            <ReportCard
              key={report.ref}
              report={report}
              downloading={!!downloading[report.ref]}
              onDownload={() => handleDownload(report)}
            />
          ))}
        </div>

        {/* Index description */}
        <div className="mt-8 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 p-2 bg-slate-100 rounded-lg shrink-0">
              <FileText className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Engineering Completion Report Index</h3>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                The index PDF lists every report in this archive with reference, title, completion date, and current status. Use it as the cover document when submitting a complete evidence pack for engineering governance review.
              </p>
              <button
                onClick={handleDownloadIndex}
                disabled={indexDownloading}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download className="w-3 h-3" />
                Download Index PDF
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
