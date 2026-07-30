// EWO-021R.6R.1 — Canonical Resolution Discovery & Reconciliation Idempotency
//
// Makes Historical Reconciliation decision-aware so it respects previous
// governed Product Owner resolutions and does not repeatedly recreate
// resolved alerts. Searches the complete governed lineage of an integrity
// condition, not just the retained alert ID.

import { supabase } from './supabase';
import type { IntegrityAlert } from './engineeringIntegrityService';
import { recordChangeLogEvent } from './engineeringChangeLogService';

// ─── REQ-1: Canonical Integrity Condition Identity ──────────────────────────────

export interface CanonicalConditionKey {
  condition_key: string;
  alert_type: string;
  normalised_reference: string;
  object_type: string;
  scope: string;
}

export function buildConditionKey(
  alertType: string,
  normalisedRef: string,
  objectType: string = 'unknown',
  scope: string = 'platform',
): CanonicalConditionKey {
  const key = `${alertType}:${normalisedRef}:${scope}`;
  return {
    condition_key: key,
    alert_type: alertType,
    normalised_reference: normalisedRef,
    object_type: objectType,
    scope,
  };
}

// ─── REQ-6: Evidence Fingerprinting ─────────────────────────────────────────────

export interface EvidenceFingerprint {
  hash: string;
  source_count: number;
  evidence_count: number;
  authoritative_count: number;
  sources: string[];
}

export function computeEvidenceFingerprint(
  evidence: Record<string, unknown>,
  evidenceItems?: Array<{ source_type: string; field_value: string | null; confidence: number }>,
): EvidenceFingerprint {
  const sources = new Set<string>();
  let evidenceCount = 0;
  let authoritativeCount = 0;

  if (evidenceItems && evidenceItems.length > 0) {
    for (const item of evidenceItems) {
      sources.add(item.source_type);
      evidenceCount++;
      if (item.confidence >= 0.9) authoritativeCount++;
    }
  } else {
    const evidenceKeys = Object.keys(evidence).sort();
    for (const key of evidenceKeys) {
      sources.add(key);
      evidenceCount++;
      const val = evidence[key];
      if (typeof val === 'object' && val !== null) {
        const subKeys = Object.keys(val).sort();
        for (const sk of subKeys) {
          sources.add(`${key}.${sk}`);
          evidenceCount++;
        }
      }
    }
  }

  const sourceList = Array.from(sources).sort();
  const hashInput = `${sourceList.join(',')}|${evidenceCount}|${authoritativeCount}`;
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hashStr = Math.abs(hash).toString(16).padStart(8, '0');

  return {
    hash: hashStr,
    source_count: sourceList.length,
    evidence_count: evidenceCount,
    authoritative_count: authoritativeCount,
    sources: sourceList,
  };
}

export function evidenceFingerprintChanged(
  before: EvidenceFingerprint,
  after: EvidenceFingerprint,
): boolean {
  return before.hash !== after.hash;
}

// ─── REQ-5: Material Change Detection ──────────────────────────────────────────

export type MaterialChangeType =
  | 'new_authoritative_evidence'
  | 'new_supporting_evidence'
  | 'new_conflicting_evidence'
  | 'canonical_object_now_exists'
  | 'canonical_object_deleted'
  | 'source_artefact_changed'
  | 'reference_changed'
  | 'object_type_changed'
  | 'relationship_graph_changed'
  | 'resolution_no_longer_valid'
  | 'po_requested_reopening'
  | 'none';

export interface MaterialChangeResult {
  has_material_change: boolean;
  change_type: MaterialChangeType;
  description: string;
  new_fingerprint: EvidenceFingerprint;
  old_fingerprint: EvidenceFingerprint | null;
}

export function detectMaterialChange(
  oldFingerprint: EvidenceFingerprint | null,
  newEvidence: Record<string, unknown>,
  newEvidenceItems?: Array<{ source_type: string; field_value: string | null; confidence: number }>,
  canonicalObjectNowExists?: boolean,
): MaterialChangeResult {
  const newFingerprint = computeEvidenceFingerprint(newEvidence, newEvidenceItems);

  if (!oldFingerprint) {
    return {
      has_material_change: true,
      change_type: 'new_authoritative_evidence',
      description: 'No prior evidence fingerprint — treating as material change.',
      new_fingerprint: newFingerprint,
      old_fingerprint: null,
    };
  }

  if (canonicalObjectNowExists) {
    return {
      has_material_change: true,
      change_type: 'canonical_object_now_exists',
      description: 'The canonical engineering object now exists where it was previously missing.',
      new_fingerprint: newFingerprint,
      old_fingerprint: oldFingerprint,
    };
  }

  if (!evidenceFingerprintChanged(oldFingerprint, newFingerprint)) {
    return {
      has_material_change: false,
      change_type: 'none',
      description: 'Evidence fingerprint unchanged — no material change detected.',
      new_fingerprint: newFingerprint,
      old_fingerprint: oldFingerprint,
    };
  }

  if (newFingerprint.authoritative_count > oldFingerprint.authoritative_count) {
    return {
      has_material_change: true,
      change_type: 'new_authoritative_evidence',
      description: `Authoritative evidence count increased from ${oldFingerprint.authoritative_count} to ${newFingerprint.authoritative_count}.`,
      new_fingerprint: newFingerprint,
      old_fingerprint: oldFingerprint,
    };
  }

  if (newFingerprint.evidence_count > oldFingerprint.evidence_count) {
    return {
      has_material_change: true,
      change_type: 'new_supporting_evidence',
      description: `Evidence count increased from ${oldFingerprint.evidence_count} to ${newFingerprint.evidence_count}.`,
      new_fingerprint: newFingerprint,
      old_fingerprint: oldFingerprint,
    };
  }

  if (newFingerprint.evidence_count < oldFingerprint.evidence_count) {
    return {
      has_material_change: true,
      change_type: 'canonical_object_deleted',
      description: `Evidence count decreased from ${oldFingerprint.evidence_count} to ${newFingerprint.evidence_count}. Object may have been deleted or archived.`,
      new_fingerprint: newFingerprint,
      old_fingerprint: oldFingerprint,
    };
  }

  const newSources = new Set(newFingerprint.sources);
  const oldSources = new Set(oldFingerprint.sources);
  const hasNew = Array.from(newSources).some(s => !oldSources.has(s));
  const hasRemoved = Array.from(oldSources).some(s => !newSources.has(s));

  if (hasNew && hasRemoved) {
    return {
      has_material_change: true,
      change_type: 'new_conflicting_evidence',
      description: 'Evidence sources changed — new sources discovered and old sources removed.',
      new_fingerprint: newFingerprint,
      old_fingerprint: oldFingerprint,
    };
  }

  return {
    has_material_change: false,
    change_type: 'none',
    description: 'Evidence fingerprint changed but no material difference detected.',
    new_fingerprint: newFingerprint,
    old_fingerprint: oldFingerprint,
  };
}

// ─── REQ-4: Governed Resolution Normalisation ────────────────────────────────────

export type ResolutionType =
  | 'accept_permanent_gap'
  | 'record_historical_reference'
  | 'mark_invalid_obsolete'
  | 'no_action_required'
  | 'defer_and_monitor'
  | 'create_canonical_work_order'
  | 'accept_historical_reference'
  | 'resolve_lineage'
  | 'synchronise_metadata'
  | 'dismiss_false_positive'
  | 'canonical_recovery_completed'
  | 'intentional_legacy_reference'
  | 'reject_invalid_reference'
  | 'invalid_reference'
  | 'false_positive'
  | 'mark_false_positive'
  | 'permanent_gap_accepted'
  | 'accepted_permanent_gap'
  | 'historical_reference_recorded'
  | 'historical_reference_accepted'
  | 'unknown';

const RESOLUTION_ALIASES: Record<string, ResolutionType> = {
  accept_permanent_gap: 'accept_permanent_gap',
  permanent_gap_accepted: 'accept_permanent_gap',
  accepted_permanent_gap: 'accept_permanent_gap',
  no_action_required: 'no_action_required',
  record_historical_reference: 'record_historical_reference',
  historical_reference_recorded: 'record_historical_reference',
  historical_reference_accepted: 'accept_historical_reference',
  accept_historical_reference: 'accept_historical_reference',
  reject_invalid_reference: 'reject_invalid_reference',
  invalid_reference: 'mark_invalid_obsolete',
  mark_invalid_obsolete: 'mark_invalid_obsolete',
  false_positive: 'dismiss_false_positive',
  mark_false_positive: 'dismiss_false_positive',
  dismiss_false_positive: 'dismiss_false_positive',
  intentional_legacy_reference: 'intentional_legacy_reference',
  canonical_recovery_completed: 'canonical_recovery_completed',
  resolve_lineage: 'resolve_lineage',
  synchronise_metadata: 'synchronise_metadata',
  defer_and_monitor: 'defer_and_monitor',
  create_canonical_work_order: 'create_canonical_work_order',
};

const REUSABLE_RESOLUTIONS: ResolutionType[] = [
  'accept_permanent_gap',
  'record_historical_reference',
  'mark_invalid_obsolete',
  'no_action_required',
  'accept_historical_reference',
  'resolve_lineage',
  'synchronise_metadata',
  'dismiss_false_positive',
  'intentional_legacy_reference',
  'canonical_recovery_completed',
  'reject_invalid_reference',
];

export function normaliseResolutionOutcome(rawValue: string | null): ResolutionType {
  if (!rawValue) return 'unknown';
  const lower = rawValue.toLowerCase().trim();
  return RESOLUTION_ALIASES[lower] ?? 'unknown';
}

export function isReusableResolution(resolution: ResolutionType): boolean {
  return REUSABLE_RESOLUTIONS.includes(resolution);
}

// ─── REQ-2/3: Canonical Resolution Discovery ────────────────────────────────────

export interface DiscoveredAlert {
  id: string;
  alert_ref: string;
  status: string;
  resolution_status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  evidence: Record<string, unknown>;
  condition_key: string | null;
  superseded_by_alert_id: string | null;
  created_at: string;
}

export interface DiscoveredDecision {
  id: string;
  alert_id: string;
  decision_type: string;
  po_decision: string | null;
  po_decision_actor: string | null;
  po_decision_at: string | null;
  resolution_status: string;
  decision_version: number;
  superseded_by: string | null;
  recommended_next_action: string | null;
  created_at: string;
}

export interface DiscoveredTimelineEvent {
  id: string;
  decision_id: string;
  alert_id: string;
  event_type: string;
  event_summary: string;
  actor_type: string;
  actor: string;
  created_at: string;
}

export interface CanonicalResolutionDiscovery {
  condition_key: string;
  candidate_alerts: DiscoveredAlert[];
  candidate_decisions: DiscoveredDecision[];
  timeline_events: DiscoveredTimelineEvent[];
  authoritative_alert: DiscoveredAlert | null;
  authoritative_decision: DiscoveredDecision | null;
  normalised_resolution: ResolutionType;
  raw_resolution_value: string | null;
  resolution_source: 'alert_resolved_by' | 'decision_po_decision' | 'timeline_event' | 'historical_reference' | 'none';
  evidence_fingerprint: EvidenceFingerprint | null;
  is_reusable: boolean;
  reuse_reason: string;
  lookup_failures: string[];
  diagnostics: ResolutionDiagnostics;
}

export interface ResolutionDiagnostics {
  condition_key: string;
  candidate_alerts_inspected: number;
  candidate_decisions_inspected: number;
  timeline_events_inspected: number;
  resolution_values_encountered: string[];
  normalised_resolution_outcome: string;
  authoritative_alert_selected: string | null;
  authoritative_decision_selected: string | null;
  evidence_fingerprint_comparison: string;
  material_change_result: string;
  final_decision: string;
  lookup_failures: string[];
}

function emptyDiagnostics(conditionKey: string): ResolutionDiagnostics {
  return {
    condition_key: conditionKey,
    candidate_alerts_inspected: 0,
    candidate_decisions_inspected: 0,
    timeline_events_inspected: 0,
    resolution_values_encountered: [],
    normalised_resolution_outcome: 'unknown',
    authoritative_alert_selected: null,
    authoritative_decision_selected: null,
    evidence_fingerprint_comparison: 'no_prior_fingerprint',
    material_change_result: 'not_checked',
    final_decision: 'pending',
    lookup_failures: [],
  };
}

export async function discoverCanonicalResolution(
  alertType: string,
  normalisedRef: string,
  objectType: string = 'unknown',
): Promise<CanonicalResolutionDiscovery> {
  const conditionKey = buildConditionKey(alertType, normalisedRef, objectType);
  const diagnostics = emptyDiagnostics(conditionKey.condition_key);
  const lookupFailures: string[] = [];

  // REQ-2: Search ALL alerts for this condition (active, resolved, archived, superseded)
  const { data: allAlerts, error: alertsError } = await supabase
    .from('engineering_integrity_alerts')
    .select('id, alert_ref, status, resolution_status, resolved_at, resolved_by, resolution_notes, evidence, condition_key, superseded_by_alert_id, created_at')
    .eq('alert_type', alertType)
    .eq('normalised_reference', normalisedRef)
    .order('created_at', { ascending: true });

  if (alertsError) {
    lookupFailures.push(`Alert lookup failed: ${alertsError.message}`);
  }

  const candidateAlerts: DiscoveredAlert[] = (allAlerts ?? []).map(a => ({
    id: a.id as string,
    alert_ref: a.alert_ref as string,
    status: a.status as string,
    resolution_status: a.resolution_status as string,
    resolved_at: a.resolved_at as string | null,
    resolved_by: a.resolved_by as string | null,
    resolution_notes: a.resolution_notes as string | null,
    evidence: (a.evidence as Record<string, unknown>) ?? {},
    condition_key: a.condition_key as string | null,
    superseded_by_alert_id: a.superseded_by_alert_id as string | null,
    created_at: a.created_at as string,
  }));
  diagnostics.candidate_alerts_inspected = candidateAlerts.length;

  if (candidateAlerts.length === 0) {
    return {
      condition_key: conditionKey.condition_key,
      candidate_alerts: [],
      candidate_decisions: [],
      timeline_events: [],
      authoritative_alert: null,
      authoritative_decision: null,
      normalised_resolution: 'unknown',
      raw_resolution_value: null,
      resolution_source: 'none',
      evidence_fingerprint: null,
      is_reusable: false,
      reuse_reason: 'No existing alerts found for this condition.',
      lookup_failures: lookupFailures,
      diagnostics: { ...diagnostics, final_decision: 'should_create_new' },
    };
  }

  // REQ-3: Search decisions for ALL alert IDs (not just the retained one)
  const allAlertIds = candidateAlerts.map(a => a.id);
  const { data: allDecisions, error: decisionsError } = await supabase
    .from('ecc_engineering_decisions')
    .select('id, alert_id, decision_type, po_decision, po_decision_actor, po_decision_at, resolution_status, decision_version, superseded_by, recommended_next_action, created_at')
    .in('alert_id', allAlertIds)
    .order('created_at', { ascending: false });

  if (decisionsError) {
    lookupFailures.push(`Decision lookup failed: ${decisionsError.message}`);
  }

  const candidateDecisions: DiscoveredDecision[] = (allDecisions ?? []).map(d => ({
    id: d.id as string,
    alert_id: d.alert_id as string,
    decision_type: d.decision_type as string,
    po_decision: d.po_decision as string | null,
    po_decision_actor: d.po_decision_actor as string | null,
    po_decision_at: d.po_decision_at as string | null,
    resolution_status: d.resolution_status as string,
    decision_version: d.decision_version as number,
    superseded_by: d.superseded_by as string | null,
    recommended_next_action: d.recommended_next_action as string | null,
    created_at: d.created_at as string,
  }));
  diagnostics.candidate_decisions_inspected = candidateDecisions.length;

  // REQ-8: Search timeline events for ALL alert IDs
  const { data: allTimeline, error: timelineError } = await supabase
    .from('ecc_engineering_decision_timeline')
    .select('id, decision_id, alert_id, event_type, event_summary, actor_type, actor, created_at')
    .in('alert_id', allAlertIds)
    .order('created_at', { ascending: false });

  if (timelineError) {
    lookupFailures.push(`Timeline lookup failed: ${timelineError.message}`);
  }

  const timelineEvents: DiscoveredTimelineEvent[] = (allTimeline ?? []).map(t => ({
    id: t.id as string,
    decision_id: t.decision_id as string,
    alert_id: t.alert_id as string,
    event_type: t.event_type as string,
    event_summary: t.event_summary as string,
    actor_type: t.actor_type as string,
    actor: t.actor as string,
    created_at: t.created_at as string,
  }));
  diagnostics.timeline_events_inspected = timelineEvents.length;

  // REQ-6: Select authoritative alert using governed rules
  const authoritativeAlert = selectAuthoritativeAlert(candidateAlerts, candidateDecisions);
  diagnostics.authoritative_alert_selected = authoritativeAlert?.id ?? null;

  // REQ-4/8: Discover resolution from multiple sources
  let authoritativeDecision: DiscoveredDecision | null = null;
  let normalisedResolution: ResolutionType = 'unknown';
  let rawResolutionValue: string | null = null;
  let resolutionSource: CanonicalResolutionDiscovery['resolution_source'] = 'none';

  const resolutionValuesEncountered: string[] = [];

  // Source 1: Check decisions with po_decision set (across ALL alerts)
  for (const d of candidateDecisions) {
    if (d.po_decision) {
      resolutionValuesEncountered.push(d.po_decision);
      const normalised = normaliseResolutionOutcome(d.po_decision);
      if (isReusableResolution(normalised)) {
        authoritativeDecision = d;
        normalisedResolution = normalised;
        rawResolutionValue = d.po_decision;
        resolutionSource = 'decision_po_decision';
        break;
      }
    }
  }

  // Source 2: Check alert resolved_by for governed resolution markers
  if (normalisedResolution === 'unknown' && authoritativeAlert) {
    const resolvedBy = authoritativeAlert.resolved_by;
    if (resolvedBy) {
      resolutionValuesEncountered.push(resolvedBy);
      // Map common resolved_by values to resolution types
      const resolvedByMap: Record<string, ResolutionType> = {
        governed_resolution: 'accept_permanent_gap',
        historical_reconciliation_auto: 'accept_permanent_gap',
        authoritative_existence_resolver: 'resolve_lineage',
        governed_deduplication: 'no_action_required',
      };
      const mapped = resolvedByMap[resolvedBy];
      if (mapped && isReusableResolution(mapped)) {
        normalisedResolution = mapped;
        rawResolutionValue = resolvedBy;
        resolutionSource = 'alert_resolved_by';
      }
    }
  }

  // Source 3: Check timeline events for po_decision or resolution events
  if (normalisedResolution === 'unknown') {
    for (const t of timelineEvents) {
      if (t.event_type === 'po_decision' || t.event_type === 'resolution' || t.event_type === 'governed_closure') {
        resolutionValuesEncountered.push(t.event_summary);
        const normalised = normaliseResolutionOutcome(t.event_summary);
        if (isReusableResolution(normalised)) {
          normalisedResolution = normalised;
          rawResolutionValue = t.event_summary;
          resolutionSource = 'timeline_event';
          break;
        }
      }
    }
  }

  // Source 4: Check Historical References
  if (normalisedResolution === 'unknown' && alertType === 'missing_ewo') {
    const histRefSatisfied = await checkHistoricalReferenceSatisfies(normalisedRef);
    if (histRefSatisfied) {
      normalisedResolution = 'record_historical_reference';
      rawResolutionValue = 'historical_reference_satisfies';
      resolutionSource = 'historical_reference';
    }
  }

  diagnostics.resolution_values_encountered = resolutionValuesEncountered;
  diagnostics.normalised_resolution_outcome = normalisedResolution;
  diagnostics.authoritative_decision_selected = authoritativeDecision?.id ?? null;

  // Compute evidence fingerprint from authoritative alert
  let evidenceFingerprint: EvidenceFingerprint | null = null;
  if (authoritativeAlert) {
    evidenceFingerprint = computeEvidenceFingerprint(authoritativeAlert.evidence);
  }

  // Determine reusability (REQ-5)
  const isReusable = normalisedResolution !== 'unknown' && isReusableResolution(normalisedResolution);
  let reuseReason: string;

  if (isReusable) {
    reuseReason = `Prior governed resolution (${normalisedResolution.replace(/_/g, ' ')}) remains applicable. Suppressing new alert.`;
    diagnostics.final_decision = 'should_reuse';
  } else if (authoritativeAlert && authoritativeAlert.resolution_status === 'resolved') {
    reuseReason = `Prior alert resolved but no reusable resolution found. Resolution source: ${resolutionSource}.`;
    diagnostics.final_decision = 'lookup_inconclusive';
  } else {
    reuseReason = 'No prior reusable resolution found for this condition.';
    diagnostics.final_decision = 'should_create_new';
  }

  return {
    condition_key: conditionKey.condition_key,
    candidate_alerts: candidateAlerts,
    candidate_decisions: candidateDecisions,
    timeline_events: timelineEvents,
    authoritative_alert: authoritativeAlert,
    authoritative_decision: authoritativeDecision,
    normalised_resolution: normalisedResolution,
    raw_resolution_value: rawResolutionValue,
    resolution_source: resolutionSource,
    evidence_fingerprint: evidenceFingerprint,
    is_reusable: isReusable,
    reuse_reason: reuseReason,
    lookup_failures: lookupFailures,
    diagnostics: { ...diagnostics, lookup_failures: lookupFailures },
  };
}

// ─── REQ-6: Authoritative Alert Selection ────────────────────────────────────────

function selectAuthoritativeAlert(
  alerts: DiscoveredAlert[],
  decisions: DiscoveredDecision[],
): DiscoveredAlert | null {
  if (alerts.length === 0) return null;
  if (alerts.length === 1) return alerts[0];

  // Priority 1: Alert with a linked decision that has po_decision set
  const alertsWithPoDecision = new Set(
    decisions.filter(d => d.po_decision).map(d => d.alert_id),
  );
  if (alertsWithPoDecision.size > 0) {
    const found = alerts.find(a => alertsWithPoDecision.has(a.id));
    if (found) return found;
  }

  // Priority 2: Resolved alert with governed resolution marker
  const resolvedWithGoverned = alerts.find(a =>
    (a.resolution_status === 'resolved' || a.status === 'resolved') &&
    a.resolved_by !== null &&
    a.resolved_by !== 'governed_deduplication',
  );
  if (resolvedWithGoverned) return resolvedWithGoverned;

  // Priority 3: Any resolved alert
  const resolved = alerts.find(a =>
    a.resolution_status === 'resolved' || a.status === 'resolved',
  );
  if (resolved) return resolved;

  // Priority 4: Alert with a linked decision (any)
  const alertsWithDecision = new Set(decisions.map(d => d.alert_id));
  if (alertsWithDecision.size > 0) {
    const found = alerts.find(a => alertsWithDecision.has(a.id));
    if (found) return found;
  }

  // Priority 5: Oldest alert (first created, most historical context)
  return alerts[0];
}

// ─── REQ-2: Pre-Creation Decision Lookup (backward-compatible wrapper) ────────────

export interface PriorResolutionLookup {
  condition_key: string;
  active_alert: IntegrityAlert | null;
  resolved_alert: IntegrityAlert | null;
  archived_alert: IntegrityAlert | null;
  latest_decision_id: string | null;
  latest_decision_type: string | null;
  po_resolution: string | null;
  resolution_type: ResolutionType | null;
  evidence_fingerprint: EvidenceFingerprint | null;
  suppressed_occurrence_count: number;
  last_reconciled_at: string | null;
  should_create_new: boolean;
  should_reuse: boolean;
  should_reopen: boolean;
  reuse_reason: string;
  discovery: CanonicalResolutionDiscovery | null;
}

export async function lookupPriorResolution(
  alertType: string,
  normalisedRef: string,
  objectType: string = 'unknown',
): Promise<PriorResolutionLookup> {
  const discovery = await discoverCanonicalResolution(alertType, normalisedRef, objectType);

  // Categorize alerts for backward compatibility
  const activeAlert = discovery.candidate_alerts.find(a =>
    a.status === 'open' &&
    a.resolution_status !== 'resolved' &&
    a.resolution_status !== 'archived' &&
    a.resolution_status !== 'superseded' &&
    a.resolution_status !== 'permanently_suppressed',
  ) ?? null;

  const resolvedAlert = discovery.candidate_alerts.find(a =>
    a.resolution_status === 'resolved' || a.status === 'resolved',
  ) ?? null;

  const archivedAlert = discovery.candidate_alerts.find(a => a.resolution_status === 'archived') ?? null;

  // Get suppression metadata
  const suppressedCount = discovery.candidate_alerts.reduce((sum, a) => {
    const ev = a.evidence;
    return sum + ((ev.suppressed_occurrence_count as number) ?? 0);
  }, 0);

  const lastReconciled = discovery.candidate_alerts.reduce((latest: string | null, a) => {
    const ts = a.evidence.last_reconciled_at as string | undefined;
    if (ts && (!latest || ts > latest)) return ts;
    return latest;
  }, null);

  const shouldReuse = discovery.is_reusable;
  const shouldCreateNew = !activeAlert && !shouldReuse && !resolvedAlert;
  const shouldReopen = false; // REQ-9/10: Never auto-reopen without material change

  return {
    condition_key: discovery.condition_key,
    active_alert: activeAlert as unknown as IntegrityAlert | null,
    resolved_alert: resolvedAlert as unknown as IntegrityAlert | null,
    archived_alert: archivedAlert as unknown as IntegrityAlert | null,
    latest_decision_id: discovery.authoritative_decision?.id ?? null,
    latest_decision_type: discovery.authoritative_decision?.decision_type ?? null,
    po_resolution: discovery.raw_resolution_value,
    resolution_type: discovery.normalised_resolution === 'unknown' ? null : discovery.normalised_resolution,
    evidence_fingerprint: discovery.evidence_fingerprint,
    suppressed_occurrence_count: suppressedCount,
    last_reconciled_at: lastReconciled,
    should_create_new: shouldCreateNew,
    should_reuse: shouldReuse,
    should_reopen: shouldReopen,
    reuse_reason: discovery.reuse_reason,
    discovery,
  };
}

// ─── REQ-3: Active Alert Deduplication ───────────────────────────────────────────

export async function updateExistingAlert(
  alertId: string,
  evidence: Record<string, unknown>,
  confidence: number,
): Promise<void> {
  const { data: existing } = await supabase
    .from('engineering_integrity_alerts')
    .select('occurrence_count, confidence, evidence')
    .eq('id', alertId)
    .maybeSingle();

  if (!existing) return;

  const newCount = (existing.occurrence_count as number ?? 1) + 1;
  const newConfidence = Math.max(existing.confidence as number ?? 0, confidence);

  await supabase
    .from('engineering_integrity_alerts')
    .update({
      last_detected: new Date().toISOString(),
      occurrence_count: newCount,
      confidence: newConfidence,
      evidence: { ...evidence, updated_by_reconciliation: true, previous_occurrence_count: existing.occurrence_count },
      updated_at: new Date().toISOString(),
      re_evaluation_status: 're-evaluated',
    })
    .eq('id', alertId);
}

// ─── REQ-4: Resolved Decision Reuse / Suppression ────────────────────────────────

export interface SuppressionResult {
  condition_key: string;
  alert_id: string;
  suppressed: boolean;
  reason: string;
  prior_alert_id: string;
  prior_decision_id: string | null;
  prior_resolution: string | null;
  occurrence_count: number;
}

export async function suppressResolvedCondition(
  priorAlert: IntegrityAlert,
  conditionKey: CanonicalConditionKey,
  newEvidence: Record<string, unknown>,
  decisionId: string | null,
  resolutionType: ResolutionType,
): Promise<SuppressionResult> {
  const currentEvidence = priorAlert.evidence as Record<string, unknown>;
  const suppressedCount = (currentEvidence.suppressed_occurrence_count as number ?? 0) + 1;
  const lastReconciled = new Date().toISOString();

  await supabase
    .from('engineering_integrity_alerts')
    .update({
      evidence: {
        ...currentEvidence,
        ...newEvidence,
        suppressed_occurrence_count: suppressedCount,
        last_reconciled_at: lastReconciled,
        suppression_reason: `Prior resolution (${resolutionType.replace(/_/g, ' ')}) remains applicable`,
        last_suppression_timestamp: lastReconciled,
      },
      last_reconciled_at: lastReconciled,
      updated_at: lastReconciled,
    })
    .eq('id', priorAlert.id);

  await recordReconciliationEvent({
    condition_key: conditionKey.condition_key,
    alert_id: priorAlert.id,
    event_type: 'alert_creation_suppressed',
    reason: `Condition suppressed — prior governed resolution (${resolutionType}) remains applicable. No material evidence change.`,
    decision_id: decisionId,
    po_resolution: resolutionType,
    evidence_fingerprint_before: (currentEvidence.evidence_fingerprint as string) ?? null,
    evidence_fingerprint_after: computeEvidenceFingerprint(newEvidence).hash,
  });

  return {
    condition_key: conditionKey.condition_key,
    alert_id: priorAlert.id,
    suppressed: true,
    reason: `Prior resolution (${resolutionType.replace(/_/g, ' ')}) remains applicable. Alert suppressed.`,
    prior_alert_id: priorAlert.id,
    prior_decision_id: decisionId,
    prior_resolution: resolutionType,
    occurrence_count: suppressedCount,
  };
}

// ─── REQ-7: Governed Reopening ──────────────────────────────────────────────────

export interface ReopeningResult {
  condition_key: string;
  new_alert_id: string;
  prior_alert_id: string;
  prior_decision_id: string | null;
  reopening_reason: string;
  material_change_type: MaterialChangeType;
  evidence_fingerprint_before: string | null;
  evidence_fingerprint_after: string;
}

export async function createSuccessorInvestigation(
  priorAlert: IntegrityAlert,
  conditionKey: CanonicalConditionKey,
  materialChange: MaterialChangeResult,
  newEvidence: Record<string, unknown>,
  decisionId: string | null,
): Promise<ReopeningResult> {
  const newAlertRef = `EIAL-${Date.now()}-REOPEN`;

  const { data: newAlert, error } = await supabase
    .from('engineering_integrity_alerts')
    .insert({
      alert_ref: newAlertRef,
      audit_id: null,
      alert_type: priorAlert.alert_type,
      severity: priorAlert.severity,
      title: `REOPENED: ${priorAlert.title}`,
      description: `${priorAlert.description}\n\nReopening reason: ${materialChange.description}`,
      evidence: {
        ...newEvidence,
        reopened_from_alert_id: priorAlert.id,
        reopened_from_alert_ref: priorAlert.alert_ref,
        reopening_reason: materialChange.description,
        material_change_type: materialChange.change_type,
        evidence_fingerprint_before: materialChange.old_fingerprint?.hash ?? null,
        evidence_fingerprint_after: materialChange.new_fingerprint.hash,
      },
      suggested_action: priorAlert.suggested_action,
      status: 'open',
      object_type: priorAlert.object_type,
      raw_reference: priorAlert.raw_reference,
      normalised_reference: priorAlert.normalised_reference,
      confidence: priorAlert.confidence,
      classification_reason: `Reopened due to material change: ${materialChange.change_type}`,
      re_evaluation_status: 'pending',
      resolution_status: 'detected',
      governed_category: 'reopened_investigation',
      condition_key: conditionKey.condition_key,
      superseded_by_alert_id: null,
    })
    .select()
    .single();

  if (error || !newAlert) {
    return {
      condition_key: conditionKey.condition_key,
      new_alert_id: '',
      prior_alert_id: priorAlert.id,
      prior_decision_id: decisionId,
      reopening_reason: `Failed to create successor: ${error?.message ?? 'unknown error'}`,
      material_change_type: materialChange.change_type,
      evidence_fingerprint_before: materialChange.old_fingerprint?.hash ?? null,
      evidence_fingerprint_after: materialChange.new_fingerprint.hash,
    };
  }

  await supabase
    .from('engineering_integrity_alerts')
    .update({ superseded_by_alert_id: newAlert.id })
    .eq('id', priorAlert.id);

  await recordReconciliationEvent({
    condition_key: conditionKey.condition_key,
    alert_id: newAlert.id,
    event_type: 'alert_reopened',
    reason: materialChange.description,
    decision_id: decisionId,
    prior_alert_id: priorAlert.id,
    material_change_type: materialChange.change_type,
    evidence_fingerprint_before: materialChange.old_fingerprint?.hash ?? null,
    evidence_fingerprint_after: materialChange.new_fingerprint.hash,
  });

  await recordChangeLogEvent({
    change_type: 'updated',
    object_type: 'other',
    object_ref: priorAlert.normalised_reference ?? '',
    ewo_ref: priorAlert.normalised_reference ?? '',
    summary: `Integrity alert reopened: ${priorAlert.title}`,
    description: `Material change detected (${materialChange.change_type}). Successor investigation created. Prior alert: ${priorAlert.alert_ref}.`,
    actor_type: 'system',
    actor: 'Intelligence Reconciliation Engine',
    linked_artefacts: [
      { artefact_type: 'engineering_audit', artefact_ref: priorAlert.alert_ref },
    ],
    metadata: {
      condition_key: conditionKey.condition_key,
      prior_alert_id: priorAlert.id,
      new_alert_id: newAlert.id,
      material_change_type: materialChange.change_type,
    },
  });

  return {
    condition_key: conditionKey.condition_key,
    new_alert_id: newAlert.id,
    prior_alert_id: priorAlert.id,
    prior_decision_id: decisionId,
    reopening_reason: materialChange.description,
    material_change_type: materialChange.change_type,
    evidence_fingerprint_before: materialChange.old_fingerprint?.hash ?? null,
    evidence_fingerprint_after: materialChange.new_fingerprint.hash,
  };
}

// ─── REQ-9: Historical Reference Recognition ──────────────────────────────────────

export async function checkHistoricalReferenceSatisfies(
  normalisedRef: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('engineering_historical_references')
    .select('id, status')
    .eq('reference', normalisedRef)
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;

  const satisfyingStatuses = [
    'historical_not_issued',
    'intentionally_reserved',
    'numbering_preserved',
    'historical_placeholder',
    'governed_historical_reference',
    'superseded_historical_identity',
    'historical',
  ];

  return satisfyingStatuses.includes(data.status as string);
}

// ─── REQ-12: Reconciliation Result Counts ─────────────────────────────────────────

export interface ReconciliationResultCounts {
  new_alerts_created: number;
  existing_active_alerts_updated: number;
  resolved_decisions_reused: number;
  alerts_suppressed: number;
  alerts_reopened: number;
  successor_investigations_created: number;
  unchanged_conditions_detected: number;
  evidence_changes_detected: number;
  reconciliation_failures: number;
  lookup_inconclusive: number;
}

export function createReconciliationResultCounts(): ReconciliationResultCounts {
  return {
    new_alerts_created: 0,
    existing_active_alerts_updated: 0,
    resolved_decisions_reused: 0,
    alerts_suppressed: 0,
    alerts_reopened: 0,
    successor_investigations_created: 0,
    unchanged_conditions_detected: 0,
    evidence_changes_detected: 0,
    reconciliation_failures: 0,
    lookup_inconclusive: 0,
  };
}

// ─── REQ-13: Audit Timeline ──────────────────────────────────────────────────────

export async function recordReconciliationEvent(params: {
  condition_key: string;
  alert_id: string;
  event_type: string;
  reason: string;
  decision_id?: string | null;
  prior_alert_id?: string | null;
  po_resolution?: string | null;
  material_change_type?: string | null;
  evidence_fingerprint_before?: string | null;
  evidence_fingerprint_after?: string | null;
  reconciliation_run_id?: string;
}): Promise<void> {
  try {
    await supabase.from('engineering_integrity_reconciliation_events').insert({
      condition_key: params.condition_key,
      alert_id: params.alert_id,
      event_type: params.event_type,
      reason: params.reason,
      decision_id: params.decision_id ?? null,
      prior_alert_id: params.prior_alert_id ?? null,
      po_resolution: params.po_resolution ?? null,
      material_change_type: params.material_change_type ?? null,
      evidence_fingerprint_before: params.evidence_fingerprint_before ?? null,
      evidence_fingerprint_after: params.evidence_fingerprint_after ?? null,
      actor: 'Intelligence Reconciliation Engine',
      actor_type: 'system',
      reconciliation_run_id: params.reconciliation_run_id ?? null,
    });
  } catch (err) {
    console.error('[Reconciliation] Failed to record event:', err);
  }
}

// ─── REQ-15: Existing Duplicate Cleanup ──────────────────────────────────────────

export interface DuplicateCleanupResult {
  condition_key: string;
  authoritative_alert_id: string;
  duplicate_alert_ids: string[];
  duplicates_superseded: number;
  errors: string[];
}

export async function cleanupDuplicateAlerts(
  alertType: string,
  normalisedRef: string,
): Promise<DuplicateCleanupResult> {
  const conditionKey = buildConditionKey(alertType, normalisedRef);
  const errors: string[] = [];

  const { data: alerts, error } = await supabase
    .from('engineering_integrity_alerts')
    .select('*')
    .eq('alert_type', alertType)
    .eq('normalised_reference', normalisedRef)
    .order('created_at', { ascending: true });

  if (error || !alerts) {
    return {
      condition_key: conditionKey.condition_key,
      authoritative_alert_id: '',
      duplicate_alert_ids: [],
      duplicates_superseded: 0,
      errors: [`Failed to fetch alerts: ${error?.message ?? 'no data'}`],
    };
  }

  if (alerts.length <= 1) {
    return {
      condition_key: conditionKey.condition_key,
      authoritative_alert_id: alerts[0]?.id ?? '',
      duplicate_alert_ids: [],
      duplicates_superseded: 0,
      errors: [],
    };
  }

  // REQ-6: Use governed selection rules (same as discoverCanonicalResolution)
  const candidateAlerts: DiscoveredAlert[] = alerts.map(a => ({
    id: a.id as string,
    alert_ref: a.alert_ref as string,
    status: a.status as string,
    resolution_status: a.resolution_status as string,
    resolved_at: a.resolved_at as string | null,
    resolved_by: a.resolved_by as string | null,
    resolution_notes: a.resolution_notes as string | null,
    evidence: (a.evidence as Record<string, unknown>) ?? {},
    condition_key: a.condition_key as string | null,
    superseded_by_alert_id: a.superseded_by_alert_id as string | null,
    created_at: a.created_at as string,
  }));

  // Get decisions for authoritative selection
  const allAlertIds = candidateAlerts.map(a => a.id);
  const { data: decisions } = await supabase
    .from('ecc_engineering_decisions')
    .select('id, alert_id, po_decision, decision_version')
    .in('alert_id', allAlertIds)
    .order('decision_version', { ascending: false });

  const candidateDecisions: DiscoveredDecision[] = (decisions ?? []).map(d => ({
    id: d.id as string,
    alert_id: d.alert_id as string,
    decision_type: '',
    po_decision: d.po_decision as string | null,
    po_decision_actor: null,
    po_decision_at: null,
    resolution_status: '',
    decision_version: d.decision_version as number,
    superseded_by: null,
    recommended_next_action: null,
    created_at: '',
  }));

  const authoritative = selectAuthoritativeAlert(candidateAlerts, candidateDecisions);
  const duplicates = alerts.filter(a => a.id !== authoritative?.id);

  // REQ-7: Preserve linkage when marking duplicates as superseded
  for (const dup of duplicates) {
    const dupData = dup as Record<string, unknown>;
    const { error: updateError } = await supabase
      .from('engineering_integrity_alerts')
      .update({
        status: 'resolved',
        resolution_status: 'superseded',
        superseded_by_alert_id: authoritative?.id ?? null,
        resolution_notes: `Marked as duplicate of ${authoritative?.alert_ref ?? ''} during EWO-021R.6R.1 cleanup.`,
        condition_key: conditionKey.condition_key,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dupData.id as string);

    if (updateError) {
      errors.push(`Failed to supersede ${dupData.alert_ref as string}: ${updateError.message}`);
    }
  }

  // Set condition_key on authoritative alert if missing
  if (authoritative && !authoritative.condition_key) {
    await supabase
      .from('engineering_integrity_alerts')
      .update({ condition_key: conditionKey.condition_key })
      .eq('id', authoritative.id);
  }

  await recordReconciliationEvent({
    condition_key: conditionKey.condition_key,
    alert_id: authoritative?.id ?? '',
    event_type: 'duplicate_cleanup',
    reason: `${duplicates.length} duplicate alert(s) superseded during EWO-021R.6R.1 cleanup.`,
  });

  return {
    condition_key: conditionKey.condition_key,
    authoritative_alert_id: authoritative?.id ?? '',
    duplicate_alert_ids: duplicates.map(d => (d as Record<string, unknown>).id as string),
    duplicates_superseded: duplicates.length - errors.length,
    errors,
  };
}
