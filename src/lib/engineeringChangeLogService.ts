// EWO-019 — Automatic Engineering Change Log & Lifecycle Governance
//
// The authoritative, immutable, append-only engineering ledger.
// Every engineering event automatically generates a governed Change Log entry.
// This becomes the permanent engineering ledger and the foundation for
// future autonomous engineering, repository changes, build verification,
// deployments and rollback history.

import { supabase } from './supabase';

// ─── Types ─────────────────────────────────────────────────────────────────

export type ChangeType =
  | 'created' | 'updated' | 'reviewed' | 'approved' | 'rejected'
  | 'tested' | 'closed' | 'reopened' | 'refined' | 'imported'
  | 'recovered' | 'archived' | 'deleted' | 'deployed' | 'rolled_back';

export type ActorType = 'human' | 'ai' | 'system';
export type ObjectType =
  | 'engineering_work_order' | 'completion_report' | 'engineering_record'
  | 'engineering_standard' | 'constitutional_amendment' | 'recovery_package'
  | 'historical_package' | 'product_owner_approval' | 'product_owner_rejection'
  | 'engineering_plan' | 'prompt_artefact' | 'repository_commit'
  | 'deployment_record' | 'build_record' | 'test_result' | 'historical_bootstrap' | 'other';

export interface LinkedArtefact {
  artefact_type: string;
  artefact_ref: string;
  artefact_id?: string;
  label?: string;
}

export type RecordingSource = 'live' | 'historical';

export interface ChangeLogEntry {
  id: string;
  change_ref: string;
  change_type: ChangeType;
  ewo_ref: string | null;
  object_type: ObjectType;
  object_id: string | null;
  object_ref: string | null;
  summary: string;
  description: string | null;
  actor_type: ActorType;
  actor: string;
  is_reconstructed: boolean;
  reconstructed_from: string | null;
  recording_source: RecordingSource;
  linked_artefacts: LinkedArtefact[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChangeLogFilters {
  search?: string;
  change_type?: ChangeType | null;
  actor_type?: ActorType | null;
  object_type?: ObjectType | null;
  ewo_ref?: string | null;
  is_reconstructed?: boolean | null;
  limit?: number;
  offset?: number;
}

export interface TimelineEvent {
  change_ref: string;
  change_type: ChangeType;
  object_type: ObjectType;
  object_ref: string | null;
  summary: string;
  description: string | null;
  actor_type: ActorType;
  actor: string;
  is_reconstructed: boolean;
  linked_artefacts: LinkedArtefact[];
  created_at: string;
  stage_label: string;
}

// ─── Automatic Event Recording ──────────────────────────────────────────────

export async function recordChangeLogEvent(params: {
  change_type: ChangeType;
  object_type: ObjectType;
  object_id?: string | null;
  object_ref?: string | null;
  ewo_ref?: string | null;
  summary: string;
  description?: string;
  actor_type?: ActorType;
  actor?: string;
  linked_artefacts?: LinkedArtefact[];
  metadata?: Record<string, unknown>;
}): Promise<ChangeLogEntry | null> {
  const {
    change_type,
    object_type,
    object_id = null,
    object_ref = null,
    ewo_ref = null,
    summary,
    description = null,
    actor_type = 'system',
    actor = 'system',
    linked_artefacts = [],
    metadata = {},
  } = params;

  try {
    const { data, error } = await supabase
      .from('engineering_change_log')
      .insert({
        change_type,
        object_type,
        object_id,
        object_ref,
        ewo_ref,
        summary,
        description,
        actor_type,
        actor,
        is_reconstructed: false,
        recording_source: 'live',
        linked_artefacts,
        metadata,
      })
      .select()
      .single();

    if (error) {
      console.error('[ChangeLog] Failed to record event:', error.message);
      return null;
    }

    return data as unknown as ChangeLogEntry;
  } catch (err) {
    console.error('[ChangeLog] Exception recording event:', err);
    return null;
  }
}

// ─── Historical Backfill ────────────────────────────────────────────────────

export async function backfillHistoricalChangeLog(): Promise<{
  reconstructed: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let reconstructed = 0;
  let skipped = 0;

  // EWO-019R.1: Determine the live recorder cutoff — the timestamp of the
  // earliest live (non-reconstructed) change log entry. Events after this
  // point must NEVER be reconstructed; they should have been captured by the
  // live recorder. If no live entries exist yet, use the EWO-019 migration
  // date as the cutoff.
  const { data: earliestLive } = await supabase
    .from('engineering_change_log')
    .select('created_at')
    .eq('is_reconstructed', false)
    .order('created_at', { ascending: true })
    .limit(1);

  const LIVE_RECORDER_CUTOFF = earliestLive?.[0]?.created_at ?? '2026-07-21T08:26:05Z';

  // 1. Backfill from engineering_work_orders
  try {
    const { data: ewos, error } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref, title, status, created_at, updated_at, closed_at, po_accepted_at, po_acceptance_notes')
      .order('created_at', { ascending: true });

    if (error) {
      errors.push(`Failed to fetch EWOs: ${error.message}`);
    } else if (ewos) {
      for (const ewo of ewos) {
        // Check if any entry already exists (live or reconstructed)
        const { data: existing } = await supabase
          .from('engineering_change_log')
          .select('id, recording_source')
          .eq('ewo_ref', ewo.ewo_ref)
          .eq('change_type', 'created')
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        // EWO-019R.1: Skip reconstruction for events after the live recorder cutoff.
        // These events should have been captured by the live recorder. Reconstructing
        // them would misclassify a live event as historical.
        if (ewo.created_at >= LIVE_RECORDER_CUTOFF) {
          skipped++;
          continue;
        }

        // Reconstruct 'created' event
        await reconstructEntry({
          change_type: 'created',
          object_type: 'engineering_work_order',
          object_id: ewo.id,
          object_ref: ewo.ewo_ref,
          ewo_ref: ewo.ewo_ref,
          summary: `Engineering Work Order ${ewo.ewo_ref} created`,
          description: ewo.title,
          created_at: ewo.created_at,
          reconstructed_from: 'engineering_work_orders.created_at',
          linked_artefacts: [
            { artefact_type: 'engineering_work_order', artefact_ref: ewo.ewo_ref, artefact_id: ewo.id, label: ewo.title },
          ],
        });
        reconstructed++;

        // Reconstruct 'closed' event if applicable
        if (ewo.status === 'closed' && ewo.closed_at) {
          // EWO-019R.1: Skip if event occurred after live recorder cutoff
          if (ewo.closed_at < LIVE_RECORDER_CUTOFF) {
            await reconstructEntry({
              change_type: 'closed',
              object_type: 'engineering_work_order',
              object_id: ewo.id,
              object_ref: ewo.ewo_ref,
              ewo_ref: ewo.ewo_ref,
              summary: `Engineering Work Order ${ewo.ewo_ref} closed`,
              description: ewo.po_acceptance_notes ?? 'Closed',
              created_at: ewo.closed_at,
              reconstructed_from: 'engineering_work_orders.closed_at',
              linked_artefacts: [
                { artefact_type: 'engineering_work_order', artefact_ref: ewo.ewo_ref, artefact_id: ewo.id },
              ],
              metadata: ewo.po_accepted_at ? { po_accepted: true, po_accepted_at: ewo.po_accepted_at } : {},
            });
            reconstructed++;
          } else {
            skipped++;
          }
        }

        // Reconstruct 'approved' event if PO accepted
        if (ewo.po_accepted_at) {
          // EWO-019R.1: Skip if event occurred after live recorder cutoff
          if (ewo.po_accepted_at < LIVE_RECORDER_CUTOFF) {
            await reconstructEntry({
              change_type: 'approved',
              object_type: 'product_owner_approval',
              object_id: ewo.id,
              object_ref: ewo.ewo_ref,
              ewo_ref: ewo.ewo_ref,
              summary: `Product Owner Acceptance recorded for ${ewo.ewo_ref}`,
              description: 'Product Owner Acceptance: PASS',
              actor_type: 'human',
              actor: 'Product Owner',
              created_at: ewo.po_accepted_at,
              reconstructed_from: 'engineering_work_orders.po_accepted_at',
              linked_artefacts: [
                { artefact_type: 'engineering_work_order', artefact_ref: ewo.ewo_ref, artefact_id: ewo.id },
                { artefact_type: 'product_owner_approval', artefact_ref: ewo.ewo_ref },
              ],
            });
            reconstructed++;
          } else {
            skipped++;
          }
        }
      }
    }
  } catch (err) {
    errors.push(`EWO backfill exception: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Backfill from ewo_completion_reports
  try {
    const { data: reports, error } = await supabase
      .from('ewo_completion_reports')
      .select('id, ewo_ref, title, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      errors.push(`Failed to fetch completion reports: ${error.message}`);
    } else if (reports) {
      for (const report of reports) {
        const { data: existing } = await supabase
          .from('engineering_change_log')
          .select('id')
          .eq('object_type', 'completion_report')
          .eq('object_id', report.id)
          .eq('change_type', 'created')
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        // EWO-019R.1: Skip reconstruction for events after the live recorder cutoff
        if (report.created_at >= LIVE_RECORDER_CUTOFF) {
          skipped++;
          continue;
        }

        await reconstructEntry({
          change_type: 'created',
          object_type: 'completion_report',
          object_id: report.id,
          object_ref: report.ewo_ref,
          ewo_ref: report.ewo_ref,
          summary: `Completion Report received for ${report.ewo_ref}`,
          description: report.title,
          created_at: report.created_at,
          reconstructed_from: 'ewo_completion_reports.created_at',
          linked_artefacts: [
            { artefact_type: 'completion_report', artefact_ref: report.ewo_ref, artefact_id: report.id, label: report.title },
            { artefact_type: 'engineering_work_order', artefact_ref: report.ewo_ref },
          ],
        });
        reconstructed++;
      }
    }
  } catch (err) {
    errors.push(`Completion report backfill exception: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Backfill from engineering_recovery_packages
  try {
    const { data: packages, error } = await supabase
      .from('engineering_recovery_packages')
      .select('id, canonical_reference, title, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      errors.push(`Failed to fetch recovery packages: ${error.message}`);
    } else if (packages) {
      for (const pkg of packages) {
        const { data: existing } = await supabase
          .from('engineering_change_log')
          .select('id')
          .eq('object_type', 'recovery_package')
          .eq('object_id', pkg.id)
          .eq('change_type', 'recovered')
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        // EWO-019R.1: Skip reconstruction for events after the live recorder cutoff
        if (pkg.created_at >= LIVE_RECORDER_CUTOFF) {
          skipped++;
          continue;
        }

        await reconstructEntry({
          change_type: 'recovered',
          object_type: 'recovery_package',
          object_id: pkg.id,
          object_ref: pkg.canonical_reference,
          ewo_ref: pkg.canonical_reference,
          summary: `Recovery Package approved for ${pkg.canonical_reference}`,
          description: pkg.title,
          created_at: pkg.created_at,
          reconstructed_from: 'engineering_recovery_packages.created_at',
          linked_artefacts: [
            { artefact_type: 'recovery_package', artefact_ref: pkg.canonical_reference, artefact_id: pkg.id, label: pkg.title },
          ],
        });
        reconstructed++;
      }
    }
  } catch (err) {
    errors.push(`Recovery package backfill exception: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { reconstructed, skipped, errors };
}

async function reconstructEntry(params: {
  change_type: ChangeType;
  object_type: ObjectType;
  object_id?: string | null;
  object_ref?: string | null;
  ewo_ref?: string | null;
  summary: string;
  description?: string;
  actor_type?: ActorType;
  actor?: string;
  created_at: string;
  reconstructed_from: string;
  linked_artefacts?: LinkedArtefact[];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabase.from('engineering_change_log').insert({
      change_type: params.change_type,
      object_type: params.object_type,
      object_id: params.object_id ?? null,
      object_ref: params.object_ref ?? null,
      ewo_ref: params.ewo_ref ?? null,
      summary: params.summary,
      description: params.description ?? null,
      actor_type: params.actor_type ?? 'system',
      actor: params.actor ?? 'system',
      is_reconstructed: true,
      recording_source: 'historical',
      reconstructed_from: params.reconstructed_from,
      linked_artefacts: params.linked_artefacts ?? [],
      metadata: { ...params.metadata, reconstructed: true },
      created_at: params.created_at,
    });
  } catch (err) {
    // Silently skip — backfill is best-effort
  }
}

// ─── Query & Filter ──────────────────────────────────────────────────────────

export interface ChangeLogCounts {
  total: number;
  live: number;
  reconstructed: number;
}

export async function fetchChangeLogCounts(): Promise<ChangeLogCounts> {
  const { count: total, error: totalErr } = await supabase
    .from('engineering_change_log')
    .select('*', { count: 'exact', head: true });

  if (totalErr) {
    console.error('[ChangeLog] Failed to fetch total count:', totalErr.message);
    throw totalErr;
  }

  const { count: live, error: liveErr } = await supabase
    .from('engineering_change_log')
    .select('*', { count: 'exact', head: true })
    .eq('is_reconstructed', false);

  if (liveErr) {
    console.error('[ChangeLog] Failed to fetch live count:', liveErr.message);
    throw liveErr;
  }

  const { count: reconstructed, error: reconErr } = await supabase
    .from('engineering_change_log')
    .select('*', { count: 'exact', head: true })
    .eq('is_reconstructed', true);

  if (reconErr) {
    console.error('[ChangeLog] Failed to fetch reconstructed count:', reconErr.message);
    throw reconErr;
  }

  return {
    total: total ?? 0,
    live: live ?? 0,
    reconstructed: reconstructed ?? 0,
  };
}

export async function fetchChangeLog(filters: ChangeLogFilters = {}): Promise<ChangeLogEntry[]> {
  let query = supabase
    .from('engineering_change_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100)
    .range(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 100) - 1);

  if (filters.search) {
    query = query.or(`summary.ilike.%${filters.search}%,description.ilike.%${filters.search}%,ewo_ref.ilike.%${filters.search}%`);
  }
  if (filters.change_type) {
    query = query.eq('change_type', filters.change_type);
  }
  if (filters.actor_type) {
    query = query.eq('actor_type', filters.actor_type);
  }
  if (filters.object_type) {
    query = query.eq('object_type', filters.object_type);
  }
  if (filters.ewo_ref) {
    query = query.eq('ewo_ref', filters.ewo_ref);
  }
  if (filters.is_reconstructed !== null && filters.is_reconstructed !== undefined) {
    query = query.eq('is_reconstructed', filters.is_reconstructed);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[ChangeLog] Failed to fetch:', error.message);
    return [];
  }

  return (data ?? []) as unknown as ChangeLogEntry[];
}

// ─── Lifecycle Timeline ─────────────────────────────────────────────────────

const STAGE_LABELS: Record<ChangeType, string> = {
  created: 'Created',
  updated: 'Updated',
  reviewed: 'Reviewed',
  approved: 'Product Owner Accepted',
  rejected: 'Product Owner Rejected',
  tested: 'Product Owner Testing',
  closed: 'Closed',
  reopened: 'Reopened',
  refined: 'Refined',
  imported: 'Imported',
  recovered: 'Recovered',
  archived: 'Archived',
  deleted: 'Deleted',
  deployed: 'Deployed',
  rolled_back: 'Rolled Back',
};

export async function fetchEWOTimeline(ewoRef: string): Promise<TimelineEvent[]> {
  const { data, error } = await supabase
    .from('engineering_change_log')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[ChangeLog] Failed to fetch timeline:', error.message);
    return [];
  }

  return (data ?? []).map((entry: Record<string, unknown>) => {
    const changeType = entry.change_type as ChangeType;
    return {
      change_ref: entry.change_ref as string,
      change_type: changeType,
      object_type: entry.object_type as ObjectType,
      object_ref: entry.object_ref as string | null,
      summary: entry.summary as string,
      description: entry.description as string | null,
      actor_type: entry.actor_type as ActorType,
      actor: entry.actor as string,
      is_reconstructed: entry.is_reconstructed as boolean,
      recording_source: (entry.recording_source as RecordingSource) ?? (entry.is_reconstructed ? 'historical' : 'live'),
      linked_artefacts: (entry.linked_artefacts ?? []) as LinkedArtefact[],
      created_at: entry.created_at as string,
      stage_label: STAGE_LABELS[changeType] ?? changeType,
    };
  });
}

// ─── Canonical Change Types ──────────────────────────────────────────────────

export async function fetchChangeTypes(): Promise<Array<{ change_type: string; description: string; category: string }>> {
  const { data, error } = await supabase
    .from('engineering_change_types')
    .select('change_type, description, category')
    .order('change_type');

  if (error) return [];
  return (data ?? []) as Array<{ change_type: string; description: string; category: string }>;
}

// ─── Convenience: Record EWO lifecycle events ────────────────────────────────

export async function recordEWOCreated(ewoRef: string, title: string, ewoId: string, actor: string = 'system', actorType: ActorType = 'system'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'created',
    object_type: 'engineering_work_order',
    object_id: ewoId,
    object_ref: ewoRef,
    ewo_ref: ewoRef,
    summary: `Engineering Work Order ${ewoRef} created`,
    description: title,
    actor_type: actorType,
    actor,
    linked_artefacts: [
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef, artefact_id: ewoId, label: title },
    ],
  });
}

export async function recordEWOClosed(ewoRef: string, ewoId: string, actor: string = 'Product Owner', actorType: ActorType = 'human'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'closed',
    object_type: 'engineering_work_order',
    object_id: ewoId,
    object_ref: ewoRef,
    ewo_ref: ewoRef,
    summary: `Engineering Work Order ${ewoRef} closed`,
    description: 'Engineering Work Order closed after Product Owner Acceptance',
    actor_type: actorType,
    actor,
    linked_artefacts: [
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef, artefact_id: ewoId },
    ],
  });
}

export async function recordPOAcceptance(ewoRef: string, ewoId: string, acceptanceNotes: string, actor: string = 'Product Owner'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'approved',
    object_type: 'product_owner_approval',
    object_id: ewoId,
    object_ref: ewoRef,
    ewo_ref: ewoRef,
    summary: `Product Owner Acceptance recorded for ${ewoRef}`,
    description: acceptanceNotes,
    actor_type: 'human',
    actor,
    linked_artefacts: [
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef, artefact_id: ewoId },
      { artefact_type: 'product_owner_approval', artefact_ref: ewoRef },
    ],
  });
}

export async function recordPORejection(ewoRef: string, ewoId: string, rejectionNotes: string, actor: string = 'Product Owner'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'rejected',
    object_type: 'product_owner_rejection',
    object_id: ewoId,
    object_ref: ewoRef,
    ewo_ref: ewoRef,
    summary: `Product Owner Rejection recorded for ${ewoRef}`,
    description: rejectionNotes,
    actor_type: 'human',
    actor,
    linked_artefacts: [
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef, artefact_id: ewoId },
    ],
  });
}

export async function recordEWOUpdated(ewoRef: string, ewoId: string, updateSummary: string, actor: string = 'system', actorType: ActorType = 'system'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'updated',
    object_type: 'engineering_work_order',
    object_id: ewoId,
    object_ref: ewoRef,
    ewo_ref: ewoRef,
    summary: `${ewoRef}: ${updateSummary}`,
    actor_type: actorType,
    actor,
    linked_artefacts: [
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef, artefact_id: ewoId },
    ],
  });
}

export async function recordEWORefined(ewoRef: string, ewoId: string, refinementSummary: string, actor: string = 'system', actorType: ActorType = 'system'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'refined',
    object_type: 'engineering_work_order',
    object_id: ewoId,
    object_ref: ewoRef,
    ewo_ref: ewoRef,
    summary: `${ewoRef}: ${refinementSummary}`,
    actor_type: actorType,
    actor,
    linked_artefacts: [
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef, artefact_id: ewoId },
    ],
  });
}

export async function recordEWOReopened(ewoRef: string, ewoId: string, reason: string, actor: string = 'system', actorType: ActorType = 'system'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'reopened',
    object_type: 'engineering_work_order',
    object_id: ewoId,
    object_ref: ewoRef,
    ewo_ref: ewoRef,
    summary: `Engineering Work Order ${ewoRef} reopened`,
    description: reason,
    actor_type: actorType,
    actor,
    linked_artefacts: [
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef, artefact_id: ewoId },
    ],
  });
}

export async function recordCompletionReportReceived(ewoRef: string, reportId: string, title: string): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'created',
    object_type: 'completion_report',
    object_id: reportId,
    object_ref: ewoRef,
    ewo_ref: ewoRef,
    summary: `Completion Report received for ${ewoRef}`,
    description: title,
    linked_artefacts: [
      { artefact_type: 'completion_report', artefact_ref: ewoRef, artefact_id: reportId, label: title },
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef },
    ],
  });
}

export async function recordPOTestingCompleted(ewoRef: string, ewoId: string, result: 'passed' | 'failed'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'tested',
    object_type: 'engineering_work_order',
    object_id: ewoId,
    object_ref: ewoRef,
    ewo_ref: ewoRef,
    summary: `Product Owner Testing ${result} for ${ewoRef}`,
    actor_type: 'human',
    actor: 'Product Owner',
    linked_artefacts: [
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef, artefact_id: ewoId },
    ],
  });
}

export async function recordStandardCreated(standardRef: string, standardId: string, title: string, actor: string = 'system'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'created',
    object_type: 'engineering_standard',
    object_id: standardId,
    object_ref: standardRef,
    summary: `Engineering Standard ${standardRef} created`,
    description: title,
    actor,
    linked_artefacts: [
      { artefact_type: 'engineering_standard', artefact_ref: standardRef, artefact_id: standardId, label: title },
    ],
  });
}

export async function recordStandardUpdated(standardRef: string, standardId: string, updateSummary: string, actor: string = 'system'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'updated',
    object_type: 'engineering_standard',
    object_id: standardId,
    object_ref: standardRef,
    summary: `Engineering Standard ${standardRef} updated: ${updateSummary}`,
    actor,
    linked_artefacts: [
      { artefact_type: 'engineering_standard', artefact_ref: standardRef, artefact_id: standardId },
    ],
  });
}

export async function recordConstitutionalAmendment(amendmentRef: string, amendmentId: string, title: string, actor: string = 'Product Owner'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'approved',
    object_type: 'constitutional_amendment',
    object_id: amendmentId,
    object_ref: amendmentRef,
    summary: `Constitutional Amendment ${amendmentRef} approved`,
    description: title,
    actor_type: 'human',
    actor,
    linked_artefacts: [
      { artefact_type: 'constitutional_amendment', artefact_ref: amendmentRef, artefact_id: amendmentId, label: title },
    ],
  });
}

export async function recordRecoveryPackageApproved(canonicalRef: string, packageId: string, title: string): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'recovered',
    object_type: 'recovery_package',
    object_id: packageId,
    object_ref: canonicalRef,
    ewo_ref: canonicalRef,
    summary: `Recovery Package approved for ${canonicalRef}`,
    description: title,
    linked_artefacts: [
      { artefact_type: 'recovery_package', artefact_ref: canonicalRef, artefact_id: packageId, label: title },
    ],
  });
}

export async function recordHistoricalPackageImported(canonicalRef: string, packageId: string, title: string): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'imported',
    object_type: 'historical_package',
    object_id: packageId,
    object_ref: canonicalRef,
    ewo_ref: canonicalRef,
    summary: `Historical Package imported for ${canonicalRef}`,
    description: title,
    linked_artefacts: [
      { artefact_type: 'historical_package', artefact_ref: canonicalRef, artefact_id: packageId, label: title },
    ],
  });
}

// ─── Future-Ready: Autonomous Engineering Events ────────────────────────────
// These functions are designed but not yet called. They will be used when
// autonomous engineering execution is introduced.

export async function recordRepositoryCommit(ewoRef: string, commitSha: string, branch: string, message: string, actor: string = 'ai'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'updated',
    object_type: 'repository_commit',
    object_id: commitSha,
    object_ref: commitSha,
    ewo_ref: ewoRef,
    summary: `Repository commit ${commitSha.substring(0, 7)} on ${branch}`,
    description: message,
    actor_type: 'ai',
    actor,
    linked_artefacts: [
      { artefact_type: 'repository_commit', artefact_ref: commitSha, label: `${branch}: ${message}` },
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef },
    ],
  });
}

export async function recordDeployment(ewoRef: string, environment: string, buildNumber: string, actor: string = 'system'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'deployed',
    object_type: 'deployment_record',
    object_id: buildNumber,
    object_ref: buildNumber,
    ewo_ref: ewoRef,
    summary: `Deployed to ${environment} (build ${buildNumber})`,
    actor,
    linked_artefacts: [
      { artefact_type: 'deployment_record', artefact_ref: buildNumber, label: `${environment}: ${buildNumber}` },
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef },
    ],
  });
}

export async function recordRollback(ewoRef: string, environment: string, fromBuild: string, toBuild: string, actor: string = 'system'): Promise<void> {
  await recordChangeLogEvent({
    change_type: 'rolled_back',
    object_type: 'deployment_record',
    object_id: toBuild,
    object_ref: toBuild,
    ewo_ref: ewoRef,
    summary: `Rolled back ${environment} from ${fromBuild} to ${toBuild}`,
    actor,
    linked_artefacts: [
      { artefact_type: 'deployment_record', artefact_ref: toBuild, label: `${environment}: ${toBuild}` },
      { artefact_type: 'engineering_work_order', artefact_ref: ewoRef },
    ],
  });
}
