// EWO-014.19A.7R — Engineering Integrity Exhaustive Reconciliation & Truthful Scoring
//
// Corrects the integrity audit engine so that:
//   1. Historical reconciliation is exhaustive across every authoritative source.
//   2. Audits are repeatable and idempotent.
//   3. The integrity score is always truthful.
//   4. The platform never reports 100% while unresolved artefacts remain.
//
// Two operating phases:
//   Phase A — Historical Reconciliation: discover all references, reconcile
//             the ledger baseline, create missing EWOs only where evidence is
//             conclusive, raise alerts for ambiguous cases, multi-pass until stable.
//   Phase B — Ongoing Integrity Validation: detect drift since baseline,
//             validate new artefacts, never re-create reconciled items.
//
// Score eligibility: 100% requires ALL sources scanned successfully,
// stable reconciliation, zero unresolved issues, zero blocking alerts.

import { supabase } from './supabase';
import { detectPrematureClosures } from './lifecycleEvidenceEngine';
import {
  checkHistoricalReferenceSatisfies,
  discoverCanonicalResolution,
  suppressResolvedCondition,
  createSuccessorInvestigation,
  detectMaterialChange,
  computeEvidenceFingerprint,
  buildConditionKey,
  recordReconciliationEvent,
  normaliseResolutionOutcome,
  isReusableResolution,
  type CanonicalResolutionDiscovery,
  type MaterialChangeResult,
  type ReconciliationResultCounts,
  type ResolutionType,
} from './integritySuppressionService';
import {
  resolveAuthoritativeExistence,
  validateParentChildRelationship,
  batchResolveExistence,
  type ParentChildClassification,
  type AuthoritativeExistenceStatus,
  type ExistenceResolution,
  type IntegrityGovernedCategory,
  GOVERNED_CATEGORY_LABELS,
} from './authoritativeEngineeringExistenceService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditPhase = 'historical_reconciliation' | 'validation' | 'partial' | 'failed';
export type AlertSeverity = 'info' | 'warning' | 'error';
export type AlertStatus = 'open' | 'resolved' | 'dismissed';
export type ObjectType = 'ewo' | 'bug' | 'batch' | 'constitutional' | 'dev_seed' | 'test_fixture' | 'superseded' | 'unknown';

export interface IntegrityAlert {
  id: string;
  alert_ref: string;
  audit_id: string | null;
  alert_type: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  suggested_action: string;
  status: AlertStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  object_type: ObjectType;
  raw_reference: string | null;
  normalised_reference: string | null;
  confidence: number;
  classification_reason: string | null;
  original_audit_id: string | null;
  re_evaluation_status: string;
  resolution_status: string | null;
  evolved_title: string | null;
  governed_category: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceCompletionRecord {
  source_name: string;
  configured: boolean;
  attempted: boolean;
  succeeded: boolean;
  records_examined: number;
  canonical_references_discovered: number;
  issues_discovered: number;
  repairs_completed: number;
  failure: string | null;
  completed_at: string;
}

export interface SourceCompletionEnvelope {
  sources: SourceCompletionRecord[];
  all_sources_attempted: boolean;
  all_required_sources_succeeded: boolean;
  reconciliation_passes: number;
  stable_result: boolean;
  unresolved_issue_count: number;
  score_eligible: boolean;
  generated_at: string;
}

export interface IntegrityAudit {
  id: string;
  audit_ref: string;
  run_at: string;
  run_by: string | null;
  total_ewos: number;
  missing_ewos_count: number;
  duplicate_ewos_count: number;
  orphan_ewos_count: number;
  completion_reports_without_ewo_count: number;
  records_without_ewo_count: number;
  prompts_without_ewo_count: number;
  parent_child_issues_count: number;
  integrity_score: number;
  findings: Record<string, unknown>;
  auto_repaired_count: number;
  alerts_raised_count: number;
  audit_phase: AuditPhase;
  reconciliation_passes: number;
  stable_result: boolean;
  score_eligible: boolean;
  source_completion_envelope: SourceCompletionEnvelope | Record<string, unknown>;
  all_sources_attempted: boolean;
  all_required_sources_succeeded: boolean;
  unresolved_issue_count: number;
  current_run_repairs: number;
  cumulative_historical_repairs: number;
  baseline_established: boolean;
}

export interface ReferenceClassification {
  raw_reference: string;
  normalised_reference: string;
  inferred_object_type: ObjectType;
  source: string;
  confidence: number;
  evidence: Record<string, unknown>;
  eligible_for_auto_repair: boolean;
  reason: string;
}

export interface AuditResult {
  audit: IntegrityAudit | null;
  sourceEnvelope: SourceCompletionEnvelope;
  classifications: ReferenceClassification[];
  alertsRaised: number;
  autoRepaired: number;
  reconciliationPasses: number;
  stable: boolean;
  alertsUpdated?: number;
  duplicatesPrevented?: number;
  autoResolved?: number;
  // EWO-021R.6: Decision-aware reconciliation counts
  alertsSuppressed?: number;
  alertsReopened?: number;
  decisionsReused?: number;
  lookupInconclusive?: number;
}

// ─── Authoritative Source Registry ────────────────────────────────────────────

interface AuthoritativeSource {
  name: string;
  table: string;
  refColumns: string[];
  textColumns: string[];
  required: boolean;
}

const AUTHORITATIVE_SOURCES: AuthoritativeSource[] = [
  { name: 'engineering_work_orders', table: 'engineering_work_orders', refColumns: ['ewo_ref'], textColumns: ['title', 'executive_summary', 'engineering_notes'], required: true },
  { name: 'engineering_plans', table: 'engineering_plans', refColumns: ['ewo_ref'], textColumns: ['executive_summary', 'title'], required: true },
  { name: 'engineering_records_library', table: 'engineering_records_library', refColumns: ['ewo_ref', 'record_ref'], textColumns: ['title'], required: true },
  { name: 'ewo_completion_reports', table: 'ewo_completion_reports', refColumns: ['ewo_ref'], textColumns: ['title', 'report_body'], required: true },
  { name: 'engineering_recovery_packages', table: 'engineering_recovery_packages', refColumns: ['canonical_reference'], textColumns: ['title'], required: true },
  { name: 'engineering_executions', table: 'engineering_executions', refColumns: ['ewo_ref'], textColumns: ['execution_ref'], required: true },
  { name: 'ewo_lifecycle_events', table: 'ewo_lifecycle_events', refColumns: [], textColumns: ['notes'], required: true },
  { name: 'ewo_engineering_packages', table: 'ewo_engineering_packages', refColumns: ['ewo_ref'], textColumns: ['package_body'], required: true },
  { name: 'engineering_verification_records', table: 'engineering_verification_records', refColumns: ['ewo_ref'], textColumns: ['title'], required: true },
];

const MAX_RECONCILIATION_PASSES = 5;

// ─── Reference Normalisation & Object-Type Classification (Req 9) ────────────

export function classifyReference(rawRef: string, source: string, evidence: Record<string, unknown>): ReferenceClassification {
  // Normalise: trim, uppercase, and strip trailing dots that are sentence punctuation
  let normalised = rawRef.trim().toUpperCase();
  // Strip trailing dots — they are sentence-ending punctuation, not part of the reference
  while (normalised.endsWith('.')) {
    normalised = normalised.slice(0, -1);
  }
  let objectType: ObjectType = 'unknown';
  let confidence = 0.5;
  let eligibleForAutoRepair = false;
  let reason = 'Unclassified reference';

  // EWO pattern: EWO-NNN or EWO-NNN.X or EWO-NNN.X.Y
  if (/^EWO-\d/.test(normalised)) {
    objectType = 'ewo';
    confidence = 0.95;
    reason = 'Matches canonical EWO reference pattern';
    eligibleForAutoRepair = true;
  }
  // Bug pattern: BUG-XXX
  else if (/^BUG-/.test(normalised)) {
    objectType = 'bug';
    confidence = 0.9;
    reason = 'Matches Bug reference pattern';
    eligibleForAutoRepair = false;
  }
  // Batch pattern: BATCH-XXX
  else if (/^BATCH-/.test(normalised)) {
    objectType = 'batch';
    confidence = 0.9;
    reason = 'Matches Batch reference pattern';
    eligibleForAutoRepair = false;
  }
  // Constitutional pattern: CONST-XXX
  else if (/^CONST-/.test(normalised)) {
    objectType = 'constitutional';
    confidence = 0.9;
    reason = 'Matches Constitutional reference pattern';
    eligibleForAutoRepair = false;
  }
  // Development seed: contains DEV-SEED
  else if (/DEV-SEED/.test(normalised)) {
    objectType = 'dev_seed';
    confidence = 0.85;
    reason = 'Development seed identifier — not a production engineering object';
    eligibleForAutoRepair = false;
  }
  // Engineering Record: ERC-XXX
  else if (/^ERC-/.test(normalised)) {
    objectType = 'unknown';
    confidence = 0.6;
    reason = 'Engineering Record reference — may reference any governed object domain';
    eligibleForAutoRepair = false;
  }
  // Engineering Record: ER-XXX
  else if (/^ER-/.test(normalised)) {
    objectType = 'unknown';
    confidence = 0.6;
    reason = 'Engineering Record reference — may reference any governed object domain';
    eligibleForAutoRepair = false;
  }
  // Test fixture
  else if (/TEST|FIXTURE|MOCK/.test(normalised)) {
    objectType = 'test_fixture';
    confidence = 0.8;
    reason = 'Test fixture identifier';
    eligibleForAutoRepair = false;
  }
  // Superseded
  else if (/SUPERSEDED|OLD|DEPRECATED/.test(normalised)) {
    objectType = 'superseded';
    confidence = 0.8;
    reason = 'Superseded or deprecated artefact';
    eligibleForAutoRepair = false;
  }
  // Free-text mention containing EWO but not matching canonical pattern
  else if (/EWO/.test(normalised) && !/^EWO-\d/.test(normalised)) {
    objectType = 'unknown';
    confidence = 0.3;
    reason = 'Contains "EWO" but does not match canonical EWO reference pattern';
    eligibleForAutoRepair = false;
  }

  return {
    raw_reference: rawRef,
    normalised_reference: normalised,
    inferred_object_type: objectType,
    source,
    confidence,
    evidence,
    eligible_for_auto_repair: eligibleForAutoRepair,
    reason,
  };
}

// ─── Source Scanner ────────────────────────────────────────────────────────────

async function scanSource(source: AuthoritativeSource): Promise<{ records: Record<string, unknown>[]; refs: DiscoveredRef[]; failure: string | null }> {
  try {
    const selectColumns = [...source.refColumns, ...source.textColumns].filter((v, i, a) => a.indexOf(v) === i).join(', ');
    const { data, error } = await supabase
      .from(source.table)
      .select(selectColumns);

    if (error) {
      return { records: [], refs: [], failure: error.message };
    }

    const records = (data ?? []) as unknown as Record<string, unknown>[];
    const refs: DiscoveredRef[] = [];
    // Capture references but exclude trailing dots (sentence punctuation)
    const refPattern = /(?:EWO-\d[\dA-Za-z.]*(?<![.])|BATCH-[A-Za-z0-9-]+|BUG-[A-Za-z0-9-]+|CONST-[A-Za-z0-9-]+|ERC-[A-Za-z0-9-]+|ER-[A-Za-z0-9.]+(?<![.]))/g;

    for (const record of records) {
      // Direct reference columns
      for (const col of source.refColumns) {
        const val = record[col];
        if (typeof val === 'string' && val.trim().length > 0) {
          refs.push({ ref: val.trim(), source: source.name, evidence: { column: col, record: record } });
        }
      }
      // Text columns (regex scan)
      for (const col of source.textColumns) {
        const val = record[col];
        if (typeof val === 'string') {
          const matches = val.match(refPattern) ?? [];
          for (const m of matches) {
            refs.push({ ref: m, source: source.name, evidence: { column: col, context: val.substring(0, 200) } });
          }
        }
      }
    }

    return { records, refs, failure: null };
  } catch (err) {
    return { records: [], refs: [], failure: err instanceof Error ? err.message : String(err) };
  }
}

interface DiscoveredRef {
  ref: string;
  source: string;
  evidence: Record<string, unknown>;
}

// ─── Core Audit: Historical Reconciliation (Phase A) ──────────────────────────

export async function runHistoricalReconciliation(runBy: string = 'system'): Promise<AuditResult> {
  return runAudit(runBy, 'historical_reconciliation');
}

// ─── Core Audit: Validation (Phase B) ─────────────────────────────────────────

export async function runValidationAudit(runBy: string = 'system'): Promise<AuditResult> {
  return runAudit(runBy, 'validation');
}

// ─── Core Audit Engine ─────────────────────────────────────────────────────────

async function runAudit(runBy: string, phase: AuditPhase): Promise<AuditResult> {
  let passes = 0;
  let stable = false;
  let lastResult: AuditResult | null = null;

  // Multi-pass reconciliation (Req 3)
  while (passes < MAX_RECONCILIATION_PASSES && !stable) {
    passes++;
    const result = await executeSinglePass(runBy, phase, passes);
    lastResult = result;

    // Stability check: no new repairs, no new issues discovered
    if (phase === 'validation') {
      // Validation audits are single-pass — just check current state
      stable = true;
    } else {
      // Historical reconciliation: stable when no repairs were made and no new issues
      if (result.autoRepaired === 0 && result.alertsRaised === 0) {
        stable = true;
      }
    }
  }

  if (!stable && phase === 'historical_reconciliation') {
    // Reconciliation instability — raise alert
    if (lastResult) {
      await raiseInstabilityAlert(lastResult, passes);
    }
  }

  // Record final audit with complete envelope
  if (lastResult) {
    await recordFinalAudit(lastResult, runBy, phase, passes, stable);
  }

  return lastResult ?? {
    audit: null,
    sourceEnvelope: { sources: [], all_sources_attempted: false, all_required_sources_succeeded: false, reconciliation_passes: 0, stable_result: false, unresolved_issue_count: 0, score_eligible: false, generated_at: new Date().toISOString() },
    classifications: [],
    alertsRaised: 0,
    autoRepaired: 0,
    reconciliationPasses: passes,
    stable,
    alertsUpdated: 0,
    duplicatesPrevented: 0,
    autoResolved: 0,
  };
}

// ─── Single Pass Execution ────────────────────────────────────────────────────

async function executeSinglePass(runBy: string, phase: AuditPhase, passNumber: number): Promise<AuditResult> {
  // 1. Discover — scan ALL authoritative sources (Req 2)
  const sourceEnvelope: SourceCompletionEnvelope = {
    sources: [],
    all_sources_attempted: true,
    all_required_sources_succeeded: true,
    reconciliation_passes: passNumber,
    stable_result: false,
    unresolved_issue_count: 0,
    score_eligible: false,
    generated_at: new Date().toISOString(),
  };

  const allDiscoveredRefs: DiscoveredRef[] = [];
  const allClassifications: ReferenceClassification[] = [];

  for (const source of AUTHORITATIVE_SOURCES) {
    const scanResult = await scanSource(source);
    const sourceRecord: SourceCompletionRecord = {
      source_name: source.name,
      configured: true,
      attempted: true,
      succeeded: scanResult.failure === null,
      records_examined: scanResult.records.length,
      canonical_references_discovered: scanResult.refs.length,
      issues_discovered: 0, // Filled after classification
      repairs_completed: 0, // Filled after repair
      failure: scanResult.failure,
      completed_at: new Date().toISOString(),
    };

    if (scanResult.failure) {
      sourceEnvelope.all_required_sources_succeeded = false;
    }

    allDiscoveredRefs.push(...scanResult.refs);
    sourceEnvelope.sources.push(sourceRecord);
  }

  // 2. Classify all discovered references (Req 9)
  for (const ref of allDiscoveredRefs) {
    const classification = classifyReference(ref.ref, ref.source, ref.evidence);
    allClassifications.push(classification);
  }

  // 3. Get current EWO ledger state — ALL lifecycle states (existence ≠ lifecycle)
  const { data: existingEwos } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, parent_ref');
  const ewoMap = new Map<string, { id: string; title: string; status: string; parent_ref: string | null }>();
  (existingEwos ?? []).forEach((e: { id: string; ewo_ref: string; title: string; status: string; parent_ref: string | null }) => {
    // Normalise the same way classifyReference does: uppercase + strip trailing dots
    let key = e.ewo_ref.toUpperCase();
    while (key.endsWith('.')) key = key.slice(0, -1);
    ewoMap.set(key, { id: e.id, title: e.title, status: e.status, parent_ref: e.parent_ref });
  });

  // 4. Detect issues — only EWO-classified refs that don't exist are "missing EWOs"
  // But first: check which refs are historically satisfied (not genuinely missing)
  const ewoRefs = allClassifications.filter(c => c.inferred_object_type === 'ewo');
  const missingEwosRaw = ewoRefs.filter(c => !ewoMap.has(c.normalised_reference));

  // 4b. Filter out refs that are HISTORICALLY_SATISFIED — they are not genuinely missing
  const missingEwos: typeof missingEwosRaw = [];
  for (const missing of missingEwosRaw) {
    const existence = await resolveAuthoritativeExistence(missing.normalised_reference);
    if (existence.authoritative_status === 'HISTORICALLY_SATISFIED') {
      // Historically satisfied — not missing, skip
      continue;
    }
    missingEwos.push(missing);
  }
  const nonEwoRefs = allClassifications.filter(c => c.inferred_object_type !== 'ewo');

  // 5. Detect orphan records — records referencing EWO refs that don't exist
  // BUT: records referencing non-EWO objects (bugs, batches, constitutional) are NOT orphans
  const { data: recordsWithEwo } = await supabase
    .from('engineering_records_library')
    .select('record_ref, title, ewo_ref')
    .not('ewo_ref', 'is', null);

  const orphanRecords: { record_ref: string; title: string; ewo_ref: string; classification: ReferenceClassification }[] = [];
  for (const rec of (recordsWithEwo ?? [])) {
    const ewoRef = (rec as { ewo_ref: string }).ewo_ref;
    if (!ewoRef) continue;
    const classification = classifyReference(ewoRef, 'engineering_records_library', { record_ref: (rec as { record_ref: string }).record_ref });

    // Only flag as orphan if it's classified as EWO and the EWO doesn't exist
    if (classification.inferred_object_type === 'ewo' && !ewoMap.has(classification.normalised_reference)) {
      orphanRecords.push({
        record_ref: (rec as { record_ref: string }).record_ref,
        title: (rec as { title: string }).title,
        ewo_ref: ewoRef,
        classification,
      });
    }
    // If it's a dev_seed, bug, batch, etc. — NOT an orphan EWO record
  }

  // 6. Detect duplicates
  const refCounts = new Map<string, string[]>();
  (existingEwos ?? []).forEach((e: { id: string; ewo_ref: string }) => {
    const key = e.ewo_ref.toUpperCase();
    const arr = refCounts.get(key) ?? [];
    arr.push(e.id);
    refCounts.set(key, arr);
  });
  const duplicates: { ewo_ref: string; ewo_ids: string[] }[] = [];
  for (const [ref, ids] of refCounts) {
    if (ids.length > 1) duplicates.push({ ewo_ref: ref, ewo_ids: ids });
  }

  // 7. Detect parent-child issues using Authoritative Engineering Existence ──
  // For each EWO with a derived parent, resolve the parent's authoritative existence
  // and classify the relationship precisely (7 classifications, not generic).
  const parentChildIssues: {
    child_ref: string;
    expected_parent: string;
    actual_parent: string | null;
    can_repair: boolean;
    classification: ParentChildClassification;
    existence_resolution: ExistenceResolution;
    repair_needed: boolean;
    auto_repair_safe: boolean;
    resolution_reason: string;
  }[] = [];
  for (const [ref, ewo] of ewoMap) {
    const expectedParent = inferParentRef(ref);
    if (!expectedParent) continue; // Root EWO — no parent expected

    const result = await validateParentChildRelationship(ref, ewo.parent_ref);

    // Only raise an issue if the classification is NOT satisfied
    if (result.classification !== 'CANONICAL_PARENT_SATISFIED' &&
        result.classification !== 'HISTORICAL_PARENT_SATISFIED') {
      parentChildIssues.push({
        child_ref: result.child_ref,
        expected_parent: result.expected_parent,
        actual_parent: result.actual_parent,
        can_repair: result.auto_repair_safe,
        classification: result.classification,
        existence_resolution: result.existence_resolution,
        repair_needed: result.repair_needed,
        auto_repair_safe: result.auto_repair_safe,
        resolution_reason: result.resolution_reason,
      });
    }
  }

  // 8. Plan repairs — only for conclusive evidence (Req 17)
  const repairs: { ewo_ref: string; title: string; parent_ref: string | null }[] = [];
  for (const missing of missingEwos) {
    if (missing.eligible_for_auto_repair && missing.confidence >= 0.9) {
      // Check for conclusive evidence: title from an authoritative source
      const hasTitle = await hasAuthoritativeTitle(missing.normalised_reference);
      if (hasTitle) {
        repairs.push({
          ewo_ref: missing.normalised_reference,
          title: hasTitle,
          parent_ref: inferParentRef(missing.normalised_reference),
        });
      }
    }
  }

  // 9. Apply repairs (Req 8 — snapshot consistency: apply repairs before final scan)
  let autoRepaired = 0;
  for (const repair of repairs) {
    const created = await createMissingEwo(repair.ewo_ref, repair.title, repair.parent_ref, 'integrity_audit');
    if (created) autoRepaired++;
  }

  // Auto-repair parent-child relationships
  for (const issue of parentChildIssues) {
    if (issue.can_repair) {
      const { error } = await supabase
        .from('engineering_work_orders')
        .update({ parent_ref: issue.expected_parent, updated_at: new Date().toISOString() })
        .eq('ewo_ref', issue.child_ref);
      if (!error) autoRepaired++;
    }
  }

  // 10. Re-scan after repairs (Req 8 — calculate from post-repair state)
  const { data: postRepairEwos } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, parent_ref');
  const postRepairMap = new Map<string, { id: string; title: string; status: string; parent_ref: string | null }>();
  (postRepairEwos ?? []).forEach((e: { id: string; ewo_ref: string; title: string; status: string; parent_ref: string | null }) => {
    // Normalise the same way classifyReference does: uppercase + strip trailing dots
    let key = e.ewo_ref.toUpperCase();
    while (key.endsWith('.')) key = key.slice(0, -1);
    postRepairMap.set(key, { id: e.id, title: e.title, status: e.status, parent_ref: e.parent_ref });
  });

  // Recount issues from post-repair state
  const remainingMissing = missingEwos.filter(c => !postRepairMap.has(c.normalised_reference));
  const remainingParentChild = parentChildIssues.filter(i => !i.can_repair || postRepairMap.get(i.child_ref)?.parent_ref?.toUpperCase() !== i.expected_parent.toUpperCase());

  // 11. Calculate truthful score (Req 5)
  const totalIssues = remainingMissing.length + duplicates.length + orphanRecords.length + remainingParentChild.length;
  const allSourcesSucceeded = sourceEnvelope.all_required_sources_succeeded;
  const scoreEligible = allSourcesSucceeded && totalIssues === 0 && (autoRepaired === 0 || phase === 'validation');

  let integrityScore: number;
  if (!allSourcesSucceeded) {
    // Incomplete assessment — never 100%
    integrityScore = Math.min(99, Math.round(100 - (totalIssues + 10)));
  } else {
    const totalEwos = postRepairMap.size;
    integrityScore = totalEwos === 0 && totalIssues === 0
      ? 100
      : Math.max(0, Math.round(100 - (totalIssues / Math.max(totalEwos + totalIssues, 1)) * 100));
    if (!scoreEligible && integrityScore === 100) {
      integrityScore = 99; // Cannot be 100% if not eligible
    }
  }

  // 12. Update source envelope with issue counts
  sourceEnvelope.unresolved_issue_count = totalIssues;
  sourceEnvelope.stable_result = autoRepaired === 0;
  sourceEnvelope.score_eligible = scoreEligible;

  // 13. Raise alerts for unresolved issues — IDEMPOTENT (Req 15 + idempotency)
  // For each issue: check if an open alert already exists for this issue identity.
  // If yes: update it (last_detected, confidence, evidence, occurrence_count).
  // If no: create a new alert.
  let alertsRaised = 0;
  let alertsUpdated = 0;
  let duplicatesPrevented = 0;
  let autoResolved = 0;
  const newAlerts: Omit<IntegrityAlert, 'id' | 'created_at' | 'updated_at'>[] = [];

  // Build a lookup of existing open alerts by (alert_type, normalised_reference)
  const { data: existingOpenAlerts } = await supabase
    .from('engineering_integrity_alerts')
    .select('id, alert_type, normalised_reference, occurrence_count, first_detected, confidence')
    .eq('status', 'open');
  const openAlertMap = new Map<string, { id: string; occurrence_count: number; first_detected: string; confidence: number }>();
  for (const a of (existingOpenAlerts ?? [])) {
    const key = `${a.alert_type}|${a.normalised_reference ?? ''}`;
    // Keep the oldest alert for each key (first one found)
    if (!openAlertMap.has(key)) {
      openAlertMap.set(key, {
        id: a.id,
        occurrence_count: a.occurrence_count ?? 1,
        first_detected: a.first_detected ?? (a as { created_at?: string }).created_at ?? new Date().toISOString(),
        confidence: a.confidence ?? 0,
      });
    }
  }

  // EWO-021R.6R.1: Reconciliation result counts
  let suppressedCount = 0;
  let reopenedCount = 0;
  let decisionsReusedCount = 0;
  let lookupInconclusiveCount = 0;

  // Helper: idempotent alert upsert
  async function upsertAlert(
    alertType: string,
    normalisedRef: string,
    rawRef: string | null,
    severity: 'info' | 'warning' | 'error',
    title: string,
    description: string,
    evidence: Record<string, unknown>,
    suggestedAction: string,
    objectType: ObjectType,
    confidence: number,
    classificationReason: string,
  ): Promise<void> {
    const key = `${alertType}|${normalisedRef}`;
    const existing = openAlertMap.get(key);
    if (existing) {
      // REQ-3: Update existing active alert — idempotent
      const newConfidence = Math.max(existing.confidence, confidence);
      const newOccurrenceCount = existing.occurrence_count + 1;
      await supabase
        .from('engineering_integrity_alerts')
        .update({
          last_detected: new Date().toISOString(),
          confidence: newConfidence,
          evidence: { ...evidence, updated_by_reconciliation: true, previous_occurrence_count: existing.occurrence_count },
          description: description,
          classification_reason: classificationReason,
          occurrence_count: newOccurrenceCount,
          updated_at: new Date().toISOString(),
          re_evaluation_status: 're-evaluated',
          governed_category: classifyAlertGovernedCategory(alertType, (evidence.classification as string) ?? null, evidence, 'open'),
        })
        .eq('id', existing.id);
      alertsUpdated++;
      duplicatesPrevented++;
    } else {
      // EWO-021R.6R.1 REQ-2/3: Canonical resolution discovery across full alert lineage
      const discovery = await discoverCanonicalResolution(alertType, normalisedRef, objectType);

      if (discovery.authoritative_alert) {
        const priorAlert = discovery.authoritative_alert;
        const conditionKey = buildConditionKey(alertType, normalisedRef, objectType);

        // REQ-4/5: If prior resolution is reusable, suppress new alert creation
        if (discovery.is_reusable) {
          const currentEv = priorAlert.evidence ?? {};
          const suppressedOcc = ((currentEv.suppressed_occurrence_count as number) ?? 0) + 1;
          const lastReconciled = new Date().toISOString();
          await supabase
            .from('engineering_integrity_alerts')
            .update({
              evidence: { ...currentEv, ...evidence, suppressed_occurrence_count: suppressedOcc, last_reconciled_at: lastReconciled, suppression_reason: `Prior resolution (${discovery.normalised_resolution.replace(/_/g, ' ')}) remains applicable` },
              last_reconciled_at: lastReconciled,
              updated_at: lastReconciled,
            })
            .eq('id', priorAlert.id);

          await recordReconciliationEvent({
            condition_key: conditionKey.condition_key,
            alert_id: priorAlert.id,
            event_type: 'alert_creation_suppressed',
            reason: `Condition suppressed — prior governed resolution (${discovery.normalised_resolution}) remains applicable. Source: ${discovery.resolution_source}.`,
            decision_id: discovery.authoritative_decision?.id ?? null,
            po_resolution: discovery.normalised_resolution,
            evidence_fingerprint_before: (currentEv.evidence_fingerprint as string) ?? null,
            evidence_fingerprint_after: computeEvidenceFingerprint(evidence).hash,
          });

          suppressedCount++;
          duplicatesPrevented++;
          decisionsReusedCount++;
          return;
        }

        // REQ-9/10: Material change gate — only create successor if material change exists
        const oldFingerprint = discovery.evidence_fingerprint;
        const materialChange = detectMaterialChange(oldFingerprint, evidence);

        if (materialChange.has_material_change) {
          // REQ-7: Create successor investigation linked to prior alert
          const newAlertRef = `EIAL-${Date.now()}-${alertsRaised}`;
          newAlerts.push({
            alert_ref: newAlertRef,
            audit_id: null,
            alert_type: alertType,
            severity,
            title: `REOPENED: ${title}`,
            description: `${description}\n\nReopening reason: ${materialChange.description}`,
            evidence: { ...evidence, reopened_from_alert_id: priorAlert.id, reopening_reason: materialChange.description, material_change_type: materialChange.change_type, evidence_fingerprint_before: materialChange.old_fingerprint?.hash ?? null, evidence_fingerprint_after: materialChange.new_fingerprint.hash },
            suggested_action: suggestedAction,
            status: 'open',
            resolved_at: null,
            resolved_by: null,
            resolution_notes: null,
            object_type: objectType,
            raw_reference: rawRef,
            normalised_reference: normalisedRef,
            confidence,
            classification_reason: `Reopened due to material change: ${materialChange.change_type}`,
            original_audit_id: null,
            re_evaluation_status: 'pending',
            resolution_status: 'detected',
            evolved_title: null,
            governed_category: 'reopened_investigation',
          });
          alertsRaised++;
          reopenedCount++;
          openAlertMap.set(key, { id: `pending-${alertsRaised}`, occurrence_count: 1, first_detected: new Date().toISOString(), confidence });

          await recordReconciliationEvent({
            condition_key: conditionKey.condition_key,
            alert_id: `pending-${alertsRaised}`,
            event_type: 'alert_reopened',
            reason: materialChange.description,
            decision_id: discovery.authoritative_decision?.id ?? null,
            prior_alert_id: priorAlert.id,
            material_change_type: materialChange.change_type,
            evidence_fingerprint_before: materialChange.old_fingerprint?.hash ?? null,
            evidence_fingerprint_after: materialChange.new_fingerprint.hash,
          });
          return;
        } else {
          // REQ-10: Safe failure — no reusable resolution AND no material change
          // Do NOT create a successor. Record lookup failure. Preserve resolved state.
          const currentEv = priorAlert.evidence ?? {};
          const lastReconciled = new Date().toISOString();
          await supabase
            .from('engineering_integrity_alerts')
            .update({
              evidence: { ...currentEv, ...evidence, last_reconciled_at: lastReconciled, lookup_inconclusive: true, lookup_inconclusive_reason: discovery.reuse_reason },
              last_reconciled_at: lastReconciled,
              updated_at: lastReconciled,
            })
            .eq('id', priorAlert.id);

          await recordReconciliationEvent({
            condition_key: conditionKey.condition_key,
            alert_id: priorAlert.id,
            event_type: 'resolution_lookup_inconclusive',
            reason: `Prior alert resolved but no reusable resolution found. No material change detected. Condition preserved in resolved state. Lookup source: ${discovery.resolution_source}. Failures: ${discovery.lookup_failures.join('; ') || 'none'}`,
            decision_id: discovery.authoritative_decision?.id ?? null,
            evidence_fingerprint_before: oldFingerprint?.hash ?? null,
            evidence_fingerprint_after: materialChange.new_fingerprint.hash,
          });

          lookupInconclusiveCount++;
          duplicatesPrevented++;
          return;
        }
      }

      // Create new alert — no prior alert found
      newAlerts.push({
        alert_ref: `EIAL-${Date.now()}-${alertsRaised}`,
        audit_id: null,
        alert_type: alertType,
        severity,
        title,
        description,
        evidence,
        suggested_action: suggestedAction,
        status: 'open',
        resolved_at: null,
        resolved_by: null,
        resolution_notes: null,
        object_type: objectType,
        raw_reference: rawRef,
        normalised_reference: normalisedRef,
        confidence,
        classification_reason: classificationReason,
        original_audit_id: null,
        re_evaluation_status: 'pending',
        resolution_status: 'detected',
        evolved_title: null,
        governed_category: classifyAlertGovernedCategory(alertType, (evidence.classification as string) ?? null, evidence, 'open'),
      });
      alertsRaised++;
      // Add to map so subsequent issues with same key don't create duplicates
      openAlertMap.set(key, { id: `pending-${alertsRaised}`, occurrence_count: 1, first_detected: new Date().toISOString(), confidence });
    }
  }

  for (const missing of remainingMissing) {
    await upsertAlert(
      'missing_ewo',
      missing.normalised_reference,
      missing.raw_reference,
      'error',
      `Missing EWO: ${missing.normalised_reference}`,
      `Reference ${missing.normalised_reference} discovered in ${missing.source} but no canonical EWO exists. Confidence: ${missing.confidence}. Reason: ${missing.reason}`,
      missing.evidence,
      missing.eligible_for_auto_repair ? 'create_missing_ewo' : 'product_owner_review',
      missing.inferred_object_type,
      missing.confidence,
      missing.reason,
    );
  }

  for (const dup of duplicates) {
    await upsertAlert(
      'duplicate_ewo',
      dup.ewo_ref,
      dup.ewo_ref,
      'error',
      `Duplicate EWO: ${dup.ewo_ref}`,
      `${dup.ewo_ids.length} EWOs with the same ewo_ref`,
      { ewo_ref: dup.ewo_ref, ewo_ids: dup.ewo_ids },
      'resolve_duplicate',
      'ewo',
      1.0,
      'Multiple records with same ewo_ref',
    );
  }

  for (const orphan of orphanRecords) {
    await upsertAlert(
      'orphan_record',
      orphan.classification.normalised_reference,
      orphan.ewo_ref,
      'warning',
      `Orphan Engineering Record: ${orphan.record_ref}`,
      `Record ${orphan.record_ref} references EWO ${orphan.ewo_ref} which does not exist. Classification: ${orphan.classification.inferred_object_type}. Confidence: ${orphan.classification.confidence}`,
      { record_ref: orphan.record_ref, ewo_ref: orphan.ewo_ref, classification: orphan.classification },
      'create_missing_ewo',
      orphan.classification.inferred_object_type,
      orphan.classification.confidence,
      orphan.classification.reason,
    );
  }

  for (const issue of remainingParentChild) {
    await upsertAlert(
      'parent_child_issue',
      issue.child_ref,
      issue.child_ref,
      issue.classification === 'PARENT_GENUINELY_MISSING' || issue.classification === 'PARENT_AUTHORITY_CONFLICT' ? 'error' : 'warning',
      `Parent-Child Issue: ${issue.child_ref}`,
      issue.resolution_reason,
      {
        child_ref: issue.child_ref,
        expected_parent: issue.expected_parent,
        actual_parent: issue.actual_parent,
        classification: issue.classification,
        authoritative_status: issue.existence_resolution.authoritative_status,
        authoritative_source_type: issue.existence_resolution.source_object_type,
        authoritative_source_id: issue.existence_resolution.source_object_id,
        lineage_satisfied: issue.existence_resolution.lineage_satisfied,
        execution_permitted: issue.existence_resolution.execution_permitted,
        governing_evidence: issue.existence_resolution.governing_evidence,
        audit_conclusion: issue.existence_resolution.audit_conclusion,
      },
      issue.classification === 'RELATIONSHIP_FIELD_INCOMPLETE' && issue.auto_repair_safe
        ? 'resolve_parent_relationship'
        : issue.classification === 'PARENT_GENUINELY_MISSING'
          ? 'route_to_po_review'
          : issue.classification === 'PARENT_AUTHORITY_CONFLICT'
            ? 'route_to_po_review'
            : 'product_owner_review',
      'ewo',
      issue.existence_resolution.confidence,
      issue.resolution_reason,
    );
    // Also update the alert with precise classification metadata
    const alertKey = `parent_child_issue|${issue.child_ref}`;
    const existingAlert = openAlertMap.get(alertKey);
    if (existingAlert && existingAlert.id.startsWith('pending-') === false) {
      await supabase
        .from('engineering_integrity_alerts')
        .update({
          parent_child_classification: issue.classification,
          authoritative_status: issue.existence_resolution.authoritative_status,
          authoritative_source_type: issue.existence_resolution.source_object_type,
          authoritative_source_id: issue.existence_resolution.source_object_id,
          lineage_satisfied: issue.existence_resolution.lineage_satisfied,
          execution_permitted: issue.existence_resolution.execution_permitted,
        })
        .eq('id', existingAlert.id);
    }
  }

  // EWO-017R: Detect premature closures
  const prematureClosures = await detectPrematureClosures();
  for (const pc of prematureClosures) {
    await upsertAlert(
      'premature_closure',
      pc.ewo_ref,
      pc.ewo_ref,
      'error',
      `Premature Closure: ${pc.ewo_ref}`,
      `EWO ${pc.ewo_ref} has status='closed' but is not closure eligible. Derived lifecycle state: ${pc.derived_state}. Product Owner acceptance is required before closure (EWO-017R Requirement 1).`,
      { ewo_ref: pc.ewo_ref, current_status: pc.status, closure_eligible: pc.closure_eligible, derived_state: pc.derived_state },
      'product_owner_review',
      'ewo',
      1.0,
      'Premature closure — PO acceptance not granted',
    );
  }

  // 13b. AUTO-RESOLVE stale missing_ewo alerts where the EWO now exists ──────
  // Get all open missing_ewo alerts and check if the EWO now exists in the ledger
  const { data: openMissingAlerts } = await supabase
    .from('engineering_integrity_alerts')
    .select('id, normalised_reference, first_detected, occurrence_count')
    .eq('status', 'open')
    .eq('alert_type', 'missing_ewo');
  for (const alert of (openMissingAlerts ?? [])) {
    const ref = alert.normalised_reference as string;
    if (!ref) continue;
    // Check if this EWO now exists in the post-repair ledger
    if (postRepairMap.has(ref)) {
      await supabase
        .from('engineering_integrity_alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: 'historical_reconciliation_auto',
          resolution_notes: `Canonical Engineering Work Order ${ref} now exists in the ledger (status: ${postRepairMap.get(ref)?.status}). Alert automatically resolved by reconciliation.`,
          updated_at: new Date().toISOString(),
          re_evaluation_status: 'auto_resolved',
          last_detected: new Date().toISOString(),
        })
        .eq('id', alert.id);
      autoResolved++;
    }
  }

  // 13c. AUTO-RESOLVE parent-child alerts where historical lineage is now satisfied ─
  let parentAlertsAutoResolved = 0;
  let parentRelationshipsReclassified = 0;
  const { data: openParentChildAlerts } = await supabase
    .from('engineering_integrity_alerts')
    .select('id, normalised_reference, parent_child_classification, evidence')
    .eq('status', 'open')
    .eq('alert_type', 'parent_child_issue');
  for (const alert of (openParentChildAlerts ?? [])) {
    const childRef = alert.normalised_reference as string;
    if (!childRef) continue;
    // Re-evaluate the parent-child relationship using authoritative existence
    const result = await validateParentChildRelationship(childRef, null);
    if (result.classification === 'HISTORICAL_PARENT_SATISFIED') {
      // Historical lineage is satisfied — auto-resolve
      await supabase
        .from('engineering_integrity_alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: 'authoritative_existence_resolver',
          resolution_notes: `Historical lineage satisfied: ${result.resolution_reason}`,
          updated_at: new Date().toISOString(),
          re_evaluation_status: 'auto_resolved',
          parent_child_classification: result.classification,
          authoritative_status: result.existence_resolution.authoritative_status,
          authoritative_source_type: result.existence_resolution.source_object_type,
          authoritative_source_id: result.existence_resolution.source_object_id,
          lineage_satisfied: true,
          execution_permitted: false,
          previous_classification: (alert.parent_child_classification as string) ?? 'parent_child_issue',
          reclassification_reason: result.resolution_reason,
        })
        .eq('id', alert.id);
      parentAlertsAutoResolved++;
      autoResolved++;
    } else if (result.classification === 'CANONICAL_PARENT_SATISFIED') {
      // Canonical parent now exists — auto-resolve
      await supabase
        .from('engineering_integrity_alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: 'authoritative_existence_resolver',
          resolution_notes: `Canonical parent now exists and relationship is satisfied: ${result.resolution_reason}`,
          updated_at: new Date().toISOString(),
          re_evaluation_status: 'auto_resolved',
          parent_child_classification: result.classification,
          authoritative_status: result.existence_resolution.authoritative_status,
          lineage_satisfied: true,
          execution_permitted: true,
          previous_classification: (alert.parent_child_classification as string) ?? 'parent_child_issue',
          reclassification_reason: result.resolution_reason,
        })
        .eq('id', alert.id);
      parentAlertsAutoResolved++;
      autoResolved++;
    } else {
      // Reclassify the alert with precise classification
      const newClassification = result.classification;
      const oldClassification = (alert.parent_child_classification as string) ?? 'parent_child_issue';
      if (newClassification !== oldClassification) {
        await supabase
          .from('engineering_integrity_alerts')
          .update({
            parent_child_classification: newClassification,
            authoritative_status: result.existence_resolution.authoritative_status,
            authoritative_source_type: result.existence_resolution.source_object_type,
            authoritative_source_id: result.existence_resolution.source_object_id,
            lineage_satisfied: result.existence_resolution.lineage_satisfied,
            execution_permitted: result.existence_resolution.execution_permitted,
            previous_classification: oldClassification,
            reclassification_reason: result.resolution_reason,
            description: result.resolution_reason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', alert.id);
        parentRelationshipsReclassified++;
      }
    }
  }

  // 14. Record audit
  const auditRef = `EIA-${Date.now()}-${passNumber}`;
  const cumulativeRepairs = await getCumulativeRepairs();

  const auditData = {
    audit_ref: auditRef,
    run_by: runBy,
    total_ewos: postRepairMap.size,
    missing_ewos_count: remainingMissing.length,
    duplicate_ewos_count: duplicates.length,
    orphan_ewos_count: 0,
    completion_reports_without_ewo_count: 0,
    records_without_ewo_count: orphanRecords.length,
    prompts_without_ewo_count: 0,
    parent_child_issues_count: remainingParentChild.length,
    integrity_score: integrityScore,
    findings: { classifications: allClassifications, missing: remainingMissing, duplicates, orphanRecords, parentChild: remainingParentChild },
    auto_repaired_count: autoRepaired,
    alerts_raised_count: alertsRaised,
    audit_phase: phase,
    reconciliation_passes: passNumber,
    stable_result: sourceEnvelope.stable_result,
    score_eligible: scoreEligible,
    source_completion_envelope: sourceEnvelope,
    all_sources_attempted: sourceEnvelope.all_sources_attempted,
    all_required_sources_succeeded: sourceEnvelope.all_required_sources_succeeded,
    unresolved_issue_count: totalIssues,
    current_run_repairs: autoRepaired,
    cumulative_historical_repairs: cumulativeRepairs + autoRepaired,
    baseline_established: sourceEnvelope.stable_result && scoreEligible,
  };

  const { data: auditRow, error: auditError } = await supabase
    .from('engineering_integrity_audits')
    .insert(auditData)
    .select()
    .maybeSingle();

  // 15. Insert alerts with audit_id
  if (auditRow && newAlerts.length > 0) {
    const alertInserts = newAlerts.map(a => ({
      ...a,
      audit_id: auditRow.id,
    }));
    await supabase.from('engineering_integrity_alerts').insert(alertInserts);
  }

  // 16. Record classifications
  if (auditRow && allClassifications.length > 0) {
    const classificationInserts = allClassifications.map(c => ({
      audit_id: auditRow.id,
      raw_reference: c.raw_reference,
      normalised_reference: c.normalised_reference,
      inferred_object_type: c.inferred_object_type,
      source: c.source,
      confidence: c.confidence,
      evidence: c.evidence,
      eligible_for_auto_repair: c.eligible_for_auto_repair,
      reason: c.reason,
    }));
    await supabase.from('integrity_reference_classifications').insert(classificationInserts);
  }

  // 16b. Add reconciliation diagnostics to the audit record ──────────────────
  if (auditRow) {
    await supabase
      .from('engineering_integrity_audits')
      .update({
        findings: {
          ...(auditData.findings as Record<string, unknown>),
          reconciliation_diagnostics: {
            total_issues_detected: totalIssues,
            existing_alerts_updated: alertsUpdated,
            new_alerts_created: alertsRaised,
            duplicate_alerts_prevented: duplicatesPrevented,
            alerts_auto_resolved: autoResolved,
            alerts_suppressed: suppressedCount,
            alerts_reopened: reopenedCount,
            decisions_reused: decisionsReusedCount,
            lookup_inconclusive: lookupInconclusiveCount,
            alerts_remaining_open: (existingOpenAlerts?.length ?? 0) + alertsRaised - autoResolved,
            parent_relationships_reclassified: parentRelationshipsReclassified,
            parent_alerts_auto_resolved: parentAlertsAutoResolved,
            historical_references_searched: true,
          },
        },
      })
      .eq('id', auditRow.id);
  }

  return {
    audit: auditRow as unknown as IntegrityAudit,
    sourceEnvelope,
    classifications: allClassifications,
    alertsRaised,
    autoRepaired,
    reconciliationPasses: passNumber,
    stable: sourceEnvelope.stable_result,
    alertsUpdated,
    duplicatesPrevented,
    autoResolved,
    alertsSuppressed: suppressedCount,
    alertsReopened: reopenedCount,
    decisionsReused: decisionsReusedCount,
    lookupInconclusive: lookupInconclusiveCount,
  };
}

// ─── Helper: Infer Parent Ref ──────────────────────────────────────────────────

export function inferParentRef(ewoRef: string): string | null {
  const lastDot = ewoRef.lastIndexOf('.');
  if (lastDot > 4) {
    return ewoRef.substring(0, lastDot);
  }
  return null;
}

// ─── Evidence-First Governed Classification (BUG-006R.1) ──────────────────────
//
// Every alert must be classified into one of four governed categories:
// A. Confirmed Engineering Defect — objective evidence proves the register is wrong
// B. Product Owner Governance Decision — evidence insufficient, needs PO decision
// C. Detection Rule Improvement — alert exists due to incorrect detection assumption
// D. Already Resolved — alert has been corrected

export function classifyAlertGovernedCategory(
  alertType: string,
  classification: string | null,
  evidence: Record<string, unknown>,
  status: string,
): IntegrityGovernedCategory {
  if (status === 'resolved' || status === 'archived') {
    return 'already_resolved';
  }

  if (classification === 'NUMBERING_DERIVED_PARENT_NOT_FOUND') {
    return 'detection_rule_improvement';
  }

  if (classification === 'PARENT_REFERENCE_MISMATCH') {
    const actualParent = (evidence.actual_parent as string) ?? null;
    if (actualParent) {
      return 'detection_rule_improvement';
    }
    return 'confirmed_engineering_defect';
  }

  if (classification === 'PARENT_GENUINELY_MISSING') {
    const actualParent = (evidence.actual_parent as string) ?? null;
    if (actualParent) {
      return 'confirmed_engineering_defect';
    }
    return 'product_owner_governance_decision';
  }

  if (classification === 'PARENT_EVIDENCE_ONLY' || classification === 'PARENT_AUTHORITY_CONFLICT') {
    return 'product_owner_governance_decision';
  }

  if (classification === 'RELATIONSHIP_FIELD_INCOMPLETE') {
    return 'confirmed_engineering_defect';
  }

  if (classification === 'CANONICAL_PARENT_SATISFIED' || classification === 'HISTORICAL_PARENT_SATISFIED') {
    return 'already_resolved';
  }

  if (alertType === 'missing_ewo') {
    const sourceTable = (evidence.source_table as string) ?? null;
    if (sourceTable === 'engineering_records_library') {
      return 'product_owner_governance_decision';
    }
    return 'confirmed_engineering_defect';
  }

  if (alertType === 'reconciliation_instability') {
    return 'product_owner_governance_decision';
  }

  if (alertType === 'conflicting_reference') {
    return 'product_owner_governance_decision';
  }

  if (alertType === 'orphan_record') {
    return 'product_owner_governance_decision';
  }

  return 'product_owner_governance_decision';
}

// ─── Helper: Check for Authoritative Title ─────────────────────────────────────

async function hasAuthoritativeTitle(ewoRef: string): Promise<string | null> {
  // Check engineering_records_library for a title
  const { data: rec } = await supabase
    .from('engineering_records_library')
    .select('title')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();
  if (rec?.title) return rec.title as string;

  // Check engineering_plans
  const { data: plan } = await supabase
    .from('engineering_plans')
    .select('title')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();
  if (plan?.title) return plan.title as string;

  // Check completion reports
  const { data: report } = await supabase
    .from('ewo_completion_reports')
    .select('title')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();
  if (report?.title) return report.title as string;

  return null;
}

// ─── Helper: Create Missing EWO ─────────────────────────────────────────────────

async function createMissingEwo(ewoRef: string, title: string, parentRef: string | null, source: string): Promise<boolean> {
  // Guard: use the canonical registration gateway instead of direct insert
  const { guardImplementationEntry } = await import('./ensureEngineeringWorkOrder');
  const guard = await guardImplementationEntry(ewoRef, 'createMissingEwo', {
    title,
    executiveSummary: `Auto-created by Engineering Integrity Audit from authoritative evidence. Source: ${source}.`,
  });
  return guard.success;
}

// ─── Helper: Get Cumulative Repairs ────────────────────────────────────────────

async function getCumulativeRepairs(): Promise<number> {
  const { data } = await supabase
    .from('engineering_integrity_audits')
    .select('current_run_repairs')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { current_run_repairs?: number } | null)?.current_run_repairs ?? 0;
}

// ─── Helper: Raise Instability Alert ───────────────────────────────────────────

async function raiseInstabilityAlert(result: AuditResult, passes: number): Promise<void> {
  await supabase.from('engineering_integrity_alerts').insert({
    alert_ref: `EIAL-INSTAB-${Date.now()}`,
    alert_type: 'reconciliation_instability',
    severity: 'error',
    title: 'Reconciliation Instability',
    description: `Historical reconciliation did not reach stability after ${passes} passes. Product Owner review required.`,
    evidence: { passes, result },
    suggested_action: 'product_owner_review',
    status: 'open',
    object_type: 'unknown',
    confidence: 1.0,
    classification_reason: 'Reconciliation did not converge',
    re_evaluation_status: 'pending',
  });
}

// ─── Helper: Record Final Audit ────────────────────────────────────────────────

async function recordFinalAudit(result: AuditResult, runBy: string, phase: AuditPhase, passes: number, stable: boolean): Promise<void> {
  // The final audit was already recorded in executeSinglePass.
  // Update it with final stability info if needed.
  if (result.audit) {
    await supabase
      .from('engineering_integrity_audits')
      .update({
        reconciliation_passes: passes,
        stable_result: stable,
        audit_phase: phase,
      })
      .eq('id', result.audit.id);
  }
}

// ─── Prompt Generation Guard (Req 18 — preserved from EWO-014.19A.7) ──────────

export async function ensureEwoExists(ewoRef: string, title?: string, parentRef?: string | null): Promise<{ ewoId: string; created: boolean }> {
  const { data: existing } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (existing) {
    return { ewoId: existing.id, created: false };
  }

  const now = new Date().toISOString();
  const { data: created, error } = await supabase
    .from('engineering_work_orders')
    .insert({
      ewo_ref: ewoRef,
      title: title || ewoRef,
      status: 'draft',
      parent_ref: parentRef ?? inferParentRef(ewoRef),
      reconciled_at: now,
      reconciliation_source: 'prompt_guard',
      executive_summary: `Auto-created by Prompt Generation Guard. The canonical EWO must exist before implementation begins.`,
    })
    .select()
    .maybeSingle();

  if (error || !created) {
    throw new Error(`Failed to create canonical EWO ${ewoRef}: ${error?.message ?? 'unknown error'}`);
  }

  return { ewoId: created.id, created: true };
}

// ─── Lifecycle Synchronisation (Req 18 — preserved) ──────────────────────────

export type LifecycleSyncEvent =
  | 'plan_approved'
  | 'completion_report_created'
  | 'record_archived'
  | 'historical_recovery_imported'
  | 'prompt_generated'
  | 'verification_completed'
  | 'acceptance_recorded';

export async function syncLifecycle(event: LifecycleSyncEvent, ewoRef: string, metadata?: Record<string, unknown>): Promise<{ ewoExists: boolean; created: boolean; alertRaised: boolean }> {
  const { data: existing } = await supabase
    .from('engineering_work_orders')
    .select('id, status')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (existing) {
    return { ewoExists: true, created: false, alertRaised: false };
  }

  try {
    const result = await ensureEwoExists(ewoRef, metadata?.title as string);
    return { ewoExists: true, created: true, alertRaised: false };
  } catch {
    await supabase.from('engineering_integrity_alerts').insert({
      alert_ref: `EIAL-SYNC-${Date.now()}`,
      alert_type: 'missing_ewo',
      severity: 'error',
      title: `Lifecycle Sync Alert: Missing EWO ${ewoRef}`,
      description: `Event '${event}' occurred for ${ewoRef} but no canonical EWO exists and auto-creation failed.`,
      evidence: { event, ewo_ref: ewoRef, metadata },
      suggested_action: 'create_missing_ewo',
      status: 'open',
      object_type: 'ewo',
      confidence: 0.8,
      classification_reason: 'Lifecycle sync could not find or create EWO',
      re_evaluation_status: 'pending',
    });
    return { ewoExists: false, created: false, alertRaised: true };
  }
}

// ─── Completion Report Safety Net (EWO-014.19A.7R.1 Req 7) ─────────────────────
//
// When a Completion Report arrives, the canonical EWO must already exist.
// If it does, attach the report. If it doesn't, raise a Governance Violation
// and initiate governed historical reconciliation. This is a safety net only —
// it must never replace creation-before-implementation (Req 5).

export interface CompletionReportSafetyNetResult {
  ewoFound: boolean;
  ewoId: string | null;
  governanceViolation: boolean;
  reconciliationInitiated: boolean;
  error: string | null;
}

export async function validateCompletionReportHasEwo(ewoRef: string, ewoId?: string | null): Promise<CompletionReportSafetyNetResult> {
  // Try by ewo_id first (preferred), then by ewo_ref
  if (ewoId) {
    const { data } = await supabase
      .from('engineering_work_orders')
      .select('id')
      .eq('id', ewoId)
      .maybeSingle();
    if (data) {
      return { ewoFound: true, ewoId: data.id, governanceViolation: false, reconciliationInitiated: false, error: null };
    }
  }

  const { data: byRef } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (byRef) {
    return { ewoFound: true, ewoId: byRef.id, governanceViolation: false, reconciliationInitiated: false, error: null };
  }

  // EWO not found — raise Governance Violation
  await supabase.from('engineering_integrity_alerts').insert({
    alert_ref: `EIAL-CR-${Date.now()}`,
    alert_type: 'completion_report_without_ewo',
    severity: 'error',
    title: `Governance Violation: Completion Report without EWO ${ewoRef}`,
    description: `A Completion Report was submitted for ${ewoRef} but no canonical Engineering Work Order exists. This violates engineering governance. Governed historical reconciliation has been initiated.`,
    evidence: { ewo_ref: ewoRef, ewo_id: ewoId },
    suggested_action: 'create_missing_ewo',
    status: 'open',
    object_type: 'ewo',
    confidence: 1.0,
    classification_reason: 'Completion Report submitted without canonical EWO',
    re_evaluation_status: 'pending',
  });

  // Initiate governed historical reconciliation
  try {
    await runHistoricalReconciliation('completion_report_safety_net');
  } catch {
    // Reconciliation failure is non-blocking — the alert is the governance record
  }

  return { ewoFound: false, ewoId: null, governanceViolation: true, reconciliationInitiated: true, error: `No canonical EWO found for ${ewoRef}` };
}

// ─── Canonical Pre-Implementation Creation (EWO-014.19A.7R.1 Req 5) ────────────
//
// Every Bolt implementation path must call this BEFORE implementation begins.
// It validates the EWO reference, searches the canonical ledger, creates the
// canonical EWO if absent, persists it, and returns the ewoId.
// If creation fails, implementation MUST NOT continue (Req 6).

export interface EnsureEwoResult {
  ewoId: string;
  created: boolean;
  error: string | null;
}

export async function ensureEngineeringWorkOrderExists(ewoRef: string, title?: string, parentRef?: string | null): Promise<EnsureEwoResult> {
  // Step 1: Validate Engineering reference
  if (!ewoRef || ewoRef.trim().length === 0) {
    return { ewoId: '', created: false, error: 'Invalid EWO reference: empty or null' };
  }

  const normalisedRef = ewoRef.trim();

  // Step 2: Search canonical ledger (all lifecycle states — unique constraint enforces)
  const { data: existing } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', normalisedRef)
    .maybeSingle();

  if (existing) {
    return { ewoId: existing.id, created: false, error: null };
  }

  // Step 3: Create canonical Engineering Work Order if absent
  const now = new Date().toISOString();
  const { data: created, error } = await supabase
    .from('engineering_work_orders')
    .insert({
      ewo_ref: normalisedRef,
      title: title || normalisedRef,
      status: 'draft',
      parent_ref: parentRef ?? inferParentRef(normalisedRef),
      reconciled_at: now,
      reconciliation_source: 'ensure_engineering_work_order_exists',
      executive_summary: 'Auto-created by canonical pre-implementation governance service. The canonical EWO must exist before implementation begins.',
    })
    .select()
    .maybeSingle();

  // Step 4: Persist (verify the insert succeeded)
  if (error || !created) {
    return { ewoId: '', created: false, error: `Failed to create canonical EWO ${normalisedRef}: ${error?.message ?? 'unknown error'}` };
  }

  return { ewoId: created.id, created: true, error: null };
}

// ─── Query Helpers for Dashboard ──────────────────────────────────────────────

export async function getLatestAudit(): Promise<IntegrityAudit | null> {
  const { data } = await supabase
    .from('engineering_integrity_audits')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as unknown as IntegrityAudit | null;
}

export async function getLatestBaselineAudit(): Promise<IntegrityAudit | null> {
  const { data } = await supabase
    .from('engineering_integrity_audits')
    .select('*')
    .eq('baseline_established', true)
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as unknown as IntegrityAudit | null;
}

export async function getAuditHistory(limit = 20): Promise<IntegrityAudit[]> {
  const { data } = await supabase
    .from('engineering_integrity_audits')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as IntegrityAudit[];
}

export async function getAuditById(auditId: string): Promise<IntegrityAudit | null> {
  const { data } = await supabase
    .from('engineering_integrity_audits')
    .select('*')
    .eq('id', auditId)
    .maybeSingle();
  return data as unknown as IntegrityAudit | null;
}

export async function getAuditClassifications(auditId: string): Promise<ReferenceClassification[]> {
  const { data } = await supabase
    .from('integrity_reference_classifications')
    .select('*')
    .eq('audit_id', auditId)
    .order('inferred_object_type, normalised_reference');
  return (data ?? []) as unknown as ReferenceClassification[];
}

export async function getOpenAlerts(): Promise<IntegrityAlert[]> {
  const { data } = await supabase
    .from('engineering_integrity_alerts')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as IntegrityAlert[];
}

// ─── Canonical Lifecycle Predicates (EWO-014.19A.7SR.6R.2) ──────────────────────
//
// Single source of truth for active vs historical alert classification.
// All alert lists, counts, filters, and summary metrics must use these.

export function isActiveIntegrityAlert(alert: IntegrityAlert): boolean {
  // Terminal states: resolved, archived, superseded, permanently_suppressed
  if (alert.resolution_status === 'resolved' || alert.resolution_status === 'archived') {
    return false;
  }
  if (alert.resolution_status === 'superseded' || alert.resolution_status === 'permanently_suppressed') {
    return false;
  }
  if (alert.status !== 'open') {
    return false;
  }
  return true;
}

export function isHistoricalIntegrityAlert(alert: IntegrityAlert): boolean {
  return alert.resolution_status === 'resolved' || alert.resolution_status === 'archived' || alert.status === 'resolved' || alert.status === 'dismissed';
}

// ─── Lifecycle-Aware Query Functions ──────────────────────────────────────────

export async function getActiveAlerts(): Promise<IntegrityAlert[]> {
  // REQ-11: Only return alerts whose authoritative lifecycle is active.
  // Exclude resolved, archived, superseded, and permanently_suppressed.
  const { data } = await supabase
    .from('engineering_integrity_alerts')
    .select('*')
    .eq('status', 'open')
    .not('resolution_status', 'in', '("resolved","archived","superseded","permanently_suppressed")')
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as IntegrityAlert[];
}

export async function getResolvedAlerts(limit = 100): Promise<IntegrityAlert[]> {
  const { data } = await supabase
    .from('engineering_integrity_alerts')
    .select('*')
    .or('resolution_status.eq.resolved,resolution_status.eq.archived,status.eq.resolved,status.eq.dismissed')
    .order('resolved_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as unknown as IntegrityAlert[];
}

export async function getAllAlerts(limit = 100): Promise<IntegrityAlert[]> {
  const { data } = await supabase
    .from('engineering_integrity_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as IntegrityAlert[];
}

export async function resolveAlert(alertId: string, resolvedBy: string, notes: string): Promise<void> {
  await supabase
    .from('engineering_integrity_alerts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution_notes: notes,
      updated_at: new Date().toISOString(),
      re_evaluation_status: 'resolved',
      resolution_status: 'resolved',
    })
    .eq('id', alertId);
}

export async function dismissAlert(alertId: string, resolvedBy: string, notes: string): Promise<void> {
  await supabase
    .from('engineering_integrity_alerts')
    .update({
      status: 'dismissed',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution_notes: notes,
      updated_at: new Date().toISOString(),
      re_evaluation_status: 'dismissed',
      resolution_status: 'resolved',
    })
    .eq('id', alertId);
}

export async function getEwoCount(): Promise<number> {
  const { count } = await supabase
    .from('engineering_work_orders')
    .select('*', { count: 'exact', head: true });
  return count ?? 0;
}

// ─── Backward-compatible runIntegrityAudit ────────────────────────────────────
//
// The dashboard calls this. It now runs a validation audit by default,
// or historical reconciliation if no baseline exists yet.

export async function runIntegrityAudit(runBy: string = 'system', autoRepair = true): Promise<AuditResult> {
  // Check if baseline exists
  const baseline = await getLatestBaselineAudit();
  if (!baseline) {
    return runHistoricalReconciliation(runBy);
  }
  return runValidationAudit(runBy);
}

// ─── Governed Historical Alert Deduplication (Part 4 & 5) ──────────────────
//
// Identifies duplicate open alerts representing the same underlying integrity
// issue, groups them by (alert_type, normalised_reference), retains the oldest
// as canonical, and marks the rest as SUPERSEDED_BY_ALERT. Never deletes alerts.

export interface DeduplicationResult {
  duplicateGroups: number;
  alertsSuperseded: number;
  canonicalAlertsRetained: number;
  details: Array<{
    alertType: string;
    normalisedReference: string;
    canonicalAlertId: string;
    supersededCount: number;
  }>;
}

export async function deduplicateAlerts(): Promise<DeduplicationResult> {
  // Get all open alerts that are not already superseded
  const { data: openAlerts, error } = await supabase
    .from('engineering_integrity_alerts')
    .select('id, alert_type, normalised_reference, created_at, first_detected, confidence, occurrence_count')
    .eq('status', 'open')
    .is('superseded_by_alert_id', null)
    .order('created_at', { ascending: true });

  if (error || !openAlerts) {
    return { duplicateGroups: 0, alertsSuperseded: 0, canonicalAlertsRetained: 0, details: [] };
  }

  // Group by (alert_type, normalised_reference)
  const groups = new Map<string, typeof openAlerts>();
  for (const alert of openAlerts) {
    const key = `${alert.alert_type}|${alert.normalised_reference ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(alert);
  }

  const details: DeduplicationResult['details'] = [];
  let duplicateGroups = 0;
  let alertsSuperseded = 0;
  let canonicalAlertsRetained = 0;

  for (const [key, group] of groups) {
    if (group.length <= 1) continue; // No duplicates

    duplicateGroups++;
    // Sort by created_at ascending — oldest is canonical
    group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const canonical = group[0];
    const duplicates = group.slice(1);

    // Merge metadata into canonical: highest confidence, earliest first_detected, sum occurrence counts
    const maxConfidence = Math.max(...group.map(a => a.confidence ?? 0));
    const minFirstDetected = group
      .map(a => a.first_detected ?? a.created_at)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
    const totalOccurrences = group.reduce((sum, a) => sum + (a.occurrence_count ?? 1), 0);

    await supabase
      .from('engineering_integrity_alerts')
      .update({
        confidence: maxConfidence,
        first_detected: minFirstDetected,
        occurrence_count: totalOccurrences,
        last_detected: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', canonical.id);

    canonicalAlertsRetained++;

    // Mark duplicates as superseded
    for (const dup of duplicates) {
      await supabase
        .from('engineering_integrity_alerts')
        .update({
          superseded_by_alert_id: canonical.id,
          status: 'superseded',
          updated_at: new Date().toISOString(),
          resolution_notes: `Superseded by canonical alert ${canonical.id} during governed deduplication. Original status: open.`,
          resolved_at: new Date().toISOString(),
          resolved_by: 'governed_deduplication',
        })
        .eq('id', dup.id);
      alertsSuperseded++;
    }

    const [alertType, normalisedRef] = key.split('|');
    details.push({
      alertType,
      normalisedReference: normalisedRef,
      canonicalAlertId: canonical.id,
      supersededCount: duplicates.length,
    });
  }

  return { duplicateGroups, alertsSuperseded, canonicalAlertsRetained, details };
}

