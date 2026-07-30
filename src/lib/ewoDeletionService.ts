// EWO-032R.12 — Governed Engineering Work Order Deletion + Test Artefact Classification
// Canonical service: resilient eligibility check (Promise.allSettled),
// test-artefact bypass, linked-Idea cleanup, audit record, transactional deletion.

import { supabase } from './supabase';

// ─── Auth helper ────────────────────────────────────────────────────────────

async function getCurrentUserUid(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DependencyCheckResult {
  status: 'success' | 'error' | 'not_applicable';
  count: number | null;
  error?: { code?: string; message: string; recoverable: boolean };
}

export interface EwoDeleteEligibility {
  eligible: boolean;
  evaluationSucceeded: boolean;
  isTestArtifact: boolean;
  bypassApplied: boolean;
  bypassReason: string | null;
  bypassedBlockingReasons: string[];
  blockingReasons: string[];
  evaluationErrors: Array<{ dependency: string; code?: string; message: string; recoverable: boolean }>;
  linkedIdeaIds: string[];
  linkedIdeaRefs: string[];
  dependencySummary: Record<string, DependencyCheckResult>;
}

export interface EwoDeleteResult {
  success: boolean;
  deletedEwoRef?: string;
  detachedIdeaRefs?: string[];
  blocked?: boolean;
  blockingReasons?: string[];
  auditRef?: string;
  error?: string;
}

export interface TestClassificationResult {
  success: boolean;
  ewoRef?: string;
  isTestArtifact?: boolean;
  auditRef?: string;
  error?: string;
}

// ─── Dependency check definitions ───────────────────────────────────────────

interface DepCheckDef {
  key: string;
  label: string;
  blockReason: (count: number) => string | null;
  query: (ewoId: string, ewoRef: string) => Promise<{ count: number | null; error?: { code?: string; message: string; recoverable: boolean } }>;
}

const DEP_CHECKS: DepCheckDef[] = [
  {
    key: 'lifecycleEvents',
    label: 'Lifecycle events',
    blockReason: (n) => n > 0 ? `${n} lifecycle event(s) — engineering history must be retained.` : null,
    query: (ewoId) => supabase.from('ewo_lifecycle_events').select('id', { count: 'exact', head: true }).eq('ewo_id', ewoId)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'executionSessions',
    label: 'Execution sessions',
    blockReason: (n) => n > 0 ? `${n} execution session(s) — implementation has begun.` : null,
    query: (ewoId) => supabase.from('execution_sessions').select('id', { count: 'exact', head: true }).eq('ewo_id', ewoId)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'executionHandoffs',
    label: 'Execution handoff requests',
    blockReason: (n) => n > 0 ? `${n} execution handoff request(s) — active governance.` : null,
    query: (_ewoId, ewoRef) => supabase.from('execution_handoff_requests').select('id', { count: 'exact', head: true }).eq('ewo_ref', ewoRef)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'providerRequests',
    label: 'Provider execution requests',
    blockReason: (n) => n > 0 ? `${n} provider execution request(s) — execution activity exists.` : null,
    query: (_ewoId, ewoRef) => supabase.from('execution_handoff_requests').select('id', { count: 'exact', head: true }).eq('ewo_ref', ewoRef).not('selected_provider_id', 'is', null)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'engineeringPackages',
    label: 'Engineering packages',
    blockReason: (n) => n > 0 ? `${n} engineering package(s) — governed artefact.` : null,
    query: (ewoId) => supabase.from('ewo_engineering_packages').select('id', { count: 'exact', head: true }).eq('ewo_id', ewoId)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'engineeringReviews',
    label: 'Approved engineering reviews',
    blockReason: (n) => n > 0 ? `${n} approved engineering review(s) — governed approval.` : null,
    query: (_ewoId, ewoRef) => supabase.from('ecc_engineering_reviews').select('id', { count: 'exact', head: true }).eq('status', 'approved').ilike('metadata->>ewo_ref', ewoRef)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'engineeringRecords',
    label: 'Engineering records',
    blockReason: (n) => n > 0 ? `${n} engineering record(s) — records require retention.` : null,
    query: (_ewoId, ewoRef) => supabase.from('engineering_records_library').select('id', { count: 'exact', head: true }).eq('ewo_ref', ewoRef)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'completionReports',
    label: 'Completion reports',
    blockReason: (n) => n > 0 ? `${n} completion report(s) — governed report.` : null,
    query: (ewoId) => supabase.from('ewo_completion_reports').select('id', { count: 'exact', head: true }).eq('ewo_id', ewoId)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'verificationArtifacts',
    label: 'Verification artefacts',
    blockReason: (n) => n > 0 ? `${n} verification artefact(s) — governed verification.` : null,
    query: (ewoId) => supabase.from('ewo_verification_trace').select('id', { count: 'exact', head: true }).eq('ewo_id', ewoId)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'evidenceRecords',
    label: 'Evidence records',
    blockReason: (n) => n > 0 ? `${n} evidence record(s) — evidence requires retention.` : null,
    query: (_ewoId, ewoRef) => supabase.from('execution_evidence').select('id', { count: 'exact', head: true }).eq('metadata->>ewo_ref', ewoRef)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'auditRecords',
    label: 'Audit trail records',
    blockReason: (n) => n > 0 ? `${n} audit trail record(s) — audit requires retention.` : null,
    query: (_ewoId, ewoRef) => supabase.from('execution_audit_trail').select('id', { count: 'exact', head: true }).eq('ewo_ref', ewoRef)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'changeLogRecords',
    label: 'Change log records',
    blockReason: (n) => n > 0 ? `${n} change log record(s) — change history requires retention.` : null,
    query: (_ewoId, ewoRef) => supabase.from('engineering_change_log').select('id', { count: 'exact', head: true }).eq('ewo_ref', ewoRef)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'childWorkOrders',
    label: 'Dependent child work orders',
    blockReason: (n) => n > 0 ? `${n} dependent child work order(s) — cannot delete a parent.` : null,
    query: (_ewoId, ewoRef) => supabase.from('engineering_work_orders').select('id', { count: 'exact', head: true }).eq('parent_ref', ewoRef)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'provenanceRecords',
    label: 'Provenance records',
    blockReason: (n) => n > 0 ? `${n} provenance record(s) — engineering provenance.` : null,
    query: (ewoId) => supabase.from('ewo_engineering_provenance').select('id', { count: 'exact', head: true }).eq('ewo_id', ewoId)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
  {
    key: 'evidenceEnrichments',
    label: 'Evidence enrichments',
    blockReason: (n) => n > 0 ? `${n} evidence enrichment(s) — governed evidence.` : null,
    query: (ewoId) => supabase.from('ewo_evidence_enrichments').select('id', { count: 'exact', head: true }).eq('ewo_id', ewoId)
      .then(r => ({ count: r.count, error: r.error ? { code: r.error.code, message: r.error.message, recoverable: true } : undefined })),
  },
];

// ─── Eligibility Check ──────────────────────────────────────────────────────

export async function checkEwoDeleteEligibility(
  ewoIdOrRef: string,
): Promise<EwoDeleteEligibility> {
  const evaluationErrors: EwoDeleteEligibility['evaluationErrors'] = [];
  const blockingReasons: string[] = [];
  const bypassedBlockingReasons: string[] = [];
  const dependencySummary: Record<string, DependencyCheckResult> = {};

  // 1. Resolve the EWO
  let ewoId = ewoIdOrRef;
  let ewoRef = ewoIdOrRef;
  let ewoStatus = '';
  let isTestArtifact = false;
  let poApproval = false;

  const isUuid = ewoIdOrRef.length === 36 && ewoIdOrRef.includes('-');
  const resolveQuery = isUuid
    ? supabase.from('engineering_work_orders').select('id, ewo_ref, status, po_accepted_at, po_accepted_by, is_test_artifact').eq('id', ewoIdOrRef).maybeSingle()
    : supabase.from('engineering_work_orders').select('id, ewo_ref, status, po_accepted_at, po_accepted_by, is_test_artifact').eq('ewo_ref', ewoIdOrRef).maybeSingle();

  const { data: ewo, error: resolveErr } = await resolveQuery;

  if (resolveErr || !ewo) {
    return {
      eligible: false,
      evaluationSucceeded: false,
      isTestArtifact: false,
      bypassApplied: false,
      bypassReason: null,
      bypassedBlockingReasons: [],
      blockingReasons: [],
      evaluationErrors: [{
        dependency: 'engineering_work_orders',
        code: resolveErr?.code,
        message: resolveErr?.message ?? 'Work Order not found.',
        recoverable: false,
      }],
      linkedIdeaIds: [],
      linkedIdeaRefs: [],
      dependencySummary: {},
    };
  }

  ewoId = ewo.id;
  ewoRef = ewo.ewo_ref;
  ewoStatus = ewo.status;
  isTestArtifact = ewo.is_test_artifact ?? false;
  if (ewo.po_accepted_at || ewo.po_accepted_by) {
    poApproval = true;
  }

  // 2. Status beyond Ready blocks (non-test only)
  const statusesBeyondReady = [
    'in_progress', 'engineering_validation', 'engineering_complete',
    'engineering_verification', 'verified', 'report_generated',
    'po_acceptance', 'closed',
  ];
  if (statusesBeyondReady.includes(ewoStatus)) {
    blockingReasons.push(`Lifecycle status is "${ewoStatus}" — beyond Ready. Use Archive instead.`);
  }

  if (poApproval) {
    blockingReasons.push('Product Owner approval recorded — cannot hard-delete a PO-approved work order.');
  }

  // 3. Run all dependency checks independently with Promise.allSettled
  const checkPromises = DEP_CHECKS.map(async (check): Promise<{ key: string; label: string; result: DependencyCheckResult; blockReason: string | null }> => {
    try {
      const { count, error } = await check.query(ewoId, ewoRef);
      if (error) {
        return {
          key: check.key,
          label: check.label,
          result: { status: 'error', count: null, error },
          blockReason: null,
        };
      }
      const c = count ?? 0;
      return {
        key: check.key,
        label: check.label,
        result: { status: 'success', count: c },
        blockReason: check.blockReason(c),
      };
    } catch (e) {
      return {
        key: check.key,
        label: check.label,
        result: {
          status: 'error',
          count: null,
          error: { message: e instanceof Error ? e.message : String(e), recoverable: true },
        },
        blockReason: null,
      };
    }
  });

  const settled = await Promise.allSettled(checkPromises);

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      const { key, label, result: depResult, blockReason } = result.value;
      dependencySummary[key] = depResult;
      if (depResult.status === 'error') {
        evaluationErrors.push({
          dependency: key,
          code: depResult.error?.code,
          message: depResult.error?.message ?? `Could not inspect ${label}.`,
          recoverable: depResult.error?.recoverable ?? true,
        });
      } else if (blockReason) {
        blockingReasons.push(blockReason);
      }
    } else {
      // Promise rejected entirely (shouldn't happen since we catch inside, but just in case)
      evaluationErrors.push({
        dependency: 'unknown',
        message: result.reason instanceof Error ? result.reason.message : 'Unknown inspection failure.',
        recoverable: true,
      });
    }
  }

  // 4. Query linked Ideas (separate from dependency checks)
  const linkedIdeaIds: string[] = [];
  const linkedIdeaRefs: string[] = [];
  try {
    const { data: ideas, error: ideasErr } = await supabase
      .from('engineering_idea')
      .select('id, idea_ref, related_ewo_refs')
      .contains('related_ewo_refs', [ewoRef]);

    if (ideasErr) {
      evaluationErrors.push({
        dependency: 'engineering_idea',
        code: ideasErr.code,
        message: ideasErr.message,
        recoverable: true,
      });
    } else {
      for (const row of (ideas ?? []) as Array<{ id: string; idea_ref: string; related_ewo_refs: string[] | null }>) {
        linkedIdeaIds.push(row.id);
        linkedIdeaRefs.push(row.idea_ref);
      }
    }
  } catch (e) {
    evaluationErrors.push({
      dependency: 'engineering_idea',
      message: e instanceof Error ? e.message : 'Failed to query linked Ideas.',
      recoverable: true,
    });
  }

  // 5. Determine outcome
  const evaluationSucceeded = evaluationErrors.length === 0;
  let eligible = false;
  let bypassApplied = false;
  let bypassReason: string | null = null;

  if (!evaluationSucceeded) {
    // Outcome C: evaluation failed — cannot determine eligibility
    eligible = false;
  } else if (isTestArtifact) {
    // Test artefact bypass — override normal blockers
    bypassApplied = true;
    bypassReason = 'Explicit disposable test artefact classification';
    bypassedBlockingReasons.push(...blockingReasons);
    eligible = true;
  } else {
    // Outcome A or B: evaluation succeeded, check blockers
    eligible = blockingReasons.length === 0;
  }

  return {
    eligible,
    evaluationSucceeded,
    isTestArtifact,
    bypassApplied,
    bypassReason,
    bypassedBlockingReasons,
    blockingReasons,
    evaluationErrors,
    linkedIdeaIds,
    linkedIdeaRefs,
    dependencySummary,
  };
}

// ─── Governed Deletion ───────────────────────────────────────────────────────

export async function deleteEngineeringWorkOrderGoverned(
  ewoId: string,
  options: {
    reason: string;
    requestedBy?: string;
  },
): Promise<EwoDeleteResult> {
  const correlationId = `EWO-DEL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestedBy = options.requestedBy ?? 'system';
  const reason = options.reason.trim();

  if (!reason) {
    return { success: false, blocked: true, error: 'A deletion reason is required.' };
  }

  // 1. Resolve EWO
  const { data: ewo, error: resolveErr } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, is_test_artifact')
    .eq('id', ewoId)
    .maybeSingle();

  if (resolveErr || !ewo) {
    return { success: false, error: `Work Order not found: ${resolveErr?.message ?? 'not found'}` };
  }

  // 2. Check eligibility
  const eligibility = await checkEwoDeleteEligibility(ewoId);

  // Non-bypassable: evaluation failure
  if (!eligibility.evaluationSucceeded) {
    return {
      success: false,
      blocked: true,
      blockingReasons: eligibility.evaluationErrors.map(e => `${e.dependency}: ${e.message}`),
      error: 'Deletion eligibility could not be evaluated — one or more dependency inspections failed.',
    };
  }

  // Non-bypassable: blocked and no test bypass
  if (!eligibility.eligible) {
    return {
      success: false,
      blocked: true,
      blockingReasons: eligibility.blockingReasons,
      error: 'Deletion blocked by governed dependencies.',
    };
  }

  // 3. Write immutable audit record BEFORE deletion
  const auditRef = `EWO-DEL-AUDIT-${correlationId}`;
  const userUid = await getCurrentUserUid();
  const auditPayload = {
    audit_ref: auditRef,
    correlation_id: correlationId,
    deleted_ewo_ref: ewo.ewo_ref,
    deleted_ewo_id: ewo.id,
    deleted_ewo_title: ewo.title,
    previous_status: ewo.status,
    deletion_reason: reason,
    requested_by: requestedBy,
    requested_by_uid: userUid,
    deleted_at: new Date().toISOString(),
    eligibility_result: {
      eligible: true,
      evaluation_succeeded: true,
      is_test_artifact: eligibility.isTestArtifact,
      bypass_applied: eligibility.bypassApplied,
      bypass_reason: eligibility.bypassReason,
      bypassed_blocking_reasons: eligibility.bypassedBlockingReasons,
      blocking_reasons: eligibility.blockingReasons,
      linked_idea_ids: eligibility.linkedIdeaIds,
      linked_idea_refs: eligibility.linkedIdeaRefs,
    },
    dependency_counts: eligibility.dependencySummary,
    detached_idea_refs: [] as string[],
    bypass_applied: eligibility.bypassApplied,
  };

  const { error: auditErr } = await supabase.from('ewo_deletion_audit').insert(auditPayload);

  if (auditErr) {
    // Non-bypassable: audit write failure
    return { success: false, error: `Failed to write deletion audit record: ${auditErr.message}` };
  }

  // 4. Unlink from Engineering Ideas
  const detachedIdeaRefs: string[] = [];

  for (const ideaId of eligibility.linkedIdeaIds) {
    const { data: idea, error: ideaErr } = await supabase
      .from('engineering_idea')
      .select('id, idea_ref, related_ewo_refs')
      .eq('id', ideaId)
      .maybeSingle();

    if (ideaErr || !idea) continue;

    const currentRefs: string[] = idea.related_ewo_refs ?? [];
    const updatedRefs = currentRefs.filter(r => r !== ewo.ewo_ref);

    // If the Idea's last EWO reference is being removed, revert its status from
    // 'promoted' to 'active' so the action menu exposes Delete again.
    const statusReset = updatedRefs.length === 0 ? { status: 'active' } : {};

    const { error: updateErr } = await supabase
      .from('engineering_idea')
      .update({ related_ewo_refs: updatedRefs, updated_at: new Date().toISOString(), ...statusReset })
      .eq('id', ideaId);

    if (updateErr) {
      // Non-bypassable: unlink failure — abort, no orphaned references
      return {
        success: false,
        error: `Failed to unlink Engineering Idea ${idea.idea_ref}: ${updateErr.message}. Deletion aborted — no orphaned references created.`,
      };
    }

    detachedIdeaRefs.push(idea.idea_ref);
  }

  // 5. Update audit record with detached Ideas
  if (detachedIdeaRefs.length > 0) {
    await supabase.from('ewo_deletion_audit').update({ detached_idea_refs: detachedIdeaRefs }).eq('audit_ref', auditRef);
  }

  // 6. Delete the EWO row
  const { error: deleteErr } = await supabase
    .from('engineering_work_orders')
    .delete()
    .eq('id', ewoId);

  if (deleteErr) {
    // Rollback: re-add the EWO ref to unlinked Ideas
    for (const ideaId of eligibility.linkedIdeaIds) {
      const { data: idea } = await supabase.from('engineering_idea').select('related_ewo_refs').eq('id', ideaId).maybeSingle();
      if (idea) {
        const currentRefs: string[] = idea.related_ewo_refs ?? [];
        if (!currentRefs.includes(ewo.ewo_ref)) {
          await supabase.from('engineering_idea').update({ related_ewo_refs: [...currentRefs, ewo.ewo_ref] }).eq('id', ideaId);
        }
      }
    }
    return { success: false, error: `Failed to delete work order: ${deleteErr.message}. Linked Ideas have been restored.` };
  }

  return { success: true, deletedEwoRef: ewo.ewo_ref, detachedIdeaRefs, auditRef };
}

// ─── Test Artefact Classification Service ────────────────────────────────────

export async function markEngineeringWorkOrderAsTest(
  ewoId: string,
  options: { reason: string; requestedBy?: string },
): Promise<TestClassificationResult> {
  const correlationId = `EWO-TEST-MARK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestedBy = options.requestedBy ?? 'system';
  const reason = options.reason.trim();

  if (!reason) {
    return { success: false, error: 'A classification reason is required.' };
  }

  // 1. Resolve EWO
  const { data: ewo, error: resolveErr } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, is_test_artifact')
    .eq('id', ewoId)
    .maybeSingle();

  if (resolveErr || !ewo) {
    return { success: false, error: `Work Order not found: ${resolveErr?.message ?? 'not found'}` };
  }

  if (ewo.is_test_artifact) {
    return { success: false, ewoRef: ewo.ewo_ref, error: 'Work Order is already classified as a test artefact.' };
  }

  // 2. Persist classification
  const { error: updateErr } = await supabase
    .from('engineering_work_orders')
    .update({
      is_test_artifact: true,
      test_artifact_marked_at: new Date().toISOString(),
      test_artifact_marked_by: requestedBy,
      test_artifact_reason: reason,
    })
    .eq('id', ewoId);

  if (updateErr) {
    return { success: false, error: `Failed to mark as test: ${updateErr.message}` };
  }

  // 3. Write audit record
  const auditRef = `EWO-TEST-MARK-AUDIT-${correlationId}`;
  const userUid = await getCurrentUserUid();
  const { error: auditErr } = await supabase.from('ewo_deletion_audit').insert({
    audit_ref: auditRef,
    correlation_id: correlationId,
    deleted_ewo_ref: ewo.ewo_ref,
    deleted_ewo_id: ewo.id,
    deleted_ewo_title: ewo.title,
    previous_status: ewo.status,
    deletion_reason: `TEST CLASSIFICATION: ${reason}`,
    requested_by: requestedBy,
    requested_by_uid: userUid,
    deleted_at: new Date().toISOString(),
    eligibility_result: { action: 'mark_as_test', reason, previous_test_state: false },
    dependency_counts: {},
    detached_idea_refs: [],
    bypass_applied: false,
  });

  // Fallback to execution_audit_trail if ewo_deletion_audit fails
  if (auditErr) {
    await supabase.from('execution_audit_trail').insert({
      audit_ref: auditRef,
      ewo_ref: ewo.ewo_ref,
      implementation_engine: 'governed-classification',
      evidence_summary: { action: 'mark_as_test', reason, requested_by: requestedBy },
    });
  }

  return { success: true, ewoRef: ewo.ewo_ref, isTestArtifact: true, auditRef };
}

export async function removeEngineeringWorkOrderTestClassification(
  ewoId: string,
  options: { reason: string; requestedBy?: string },
): Promise<TestClassificationResult> {
  const correlationId = `EWO-TEST-REMOVE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestedBy = options.requestedBy ?? 'system';
  const reason = options.reason.trim();

  if (!reason) {
    return { success: false, error: 'A reason is required to remove test classification.' };
  }

  // 1. Resolve EWO
  const { data: ewo, error: resolveErr } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, is_test_artifact, test_artifact_marked_at, test_artifact_marked_by, test_artifact_reason')
    .eq('id', ewoId)
    .maybeSingle();

  if (resolveErr || !ewo) {
    return { success: false, error: `Work Order not found: ${resolveErr?.message ?? 'not found'}` };
  }

  if (!ewo.is_test_artifact) {
    return { success: false, ewoRef: ewo.ewo_ref, error: 'Work Order is not classified as a test artefact.' };
  }

  // 2. Persist removal
  const { error: updateErr } = await supabase
    .from('engineering_work_orders')
    .update({
      is_test_artifact: false,
      test_artifact_marked_at: null,
      test_artifact_marked_by: null,
      test_artifact_reason: null,
    })
    .eq('id', ewoId);

  if (updateErr) {
    return { success: false, error: `Failed to remove test classification: ${updateErr.message}` };
  }

  // 3. Write audit record
  const auditRef = `EWO-TEST-REMOVE-AUDIT-${correlationId}`;
  const userUid = await getCurrentUserUid();
  const { error: auditErr } = await supabase.from('ewo_deletion_audit').insert({
    audit_ref: auditRef,
    correlation_id: correlationId,
    deleted_ewo_ref: ewo.ewo_ref,
    deleted_ewo_id: ewo.id,
    deleted_ewo_title: ewo.title,
    previous_status: ewo.status,
    deletion_reason: `TEST CLASSIFICATION REMOVED: ${reason}`,
    requested_by: requestedBy,
    requested_by_uid: userUid,
    deleted_at: new Date().toISOString(),
    eligibility_result: {
      action: 'remove_test_classification',
      reason,
      previous_test_state: true,
      previous_marked_at: ewo.test_artifact_marked_at,
      previous_marked_by: ewo.test_artifact_marked_by,
      previous_reason: ewo.test_artifact_reason,
    },
    dependency_counts: {},
    detached_idea_refs: [],
    bypass_applied: false,
  });

  if (auditErr) {
    await supabase.from('execution_audit_trail').insert({
      audit_ref: auditRef,
      ewo_ref: ewo.ewo_ref,
      implementation_engine: 'governed-classification',
      evidence_summary: { action: 'remove_test_classification', reason, requested_by: requestedBy },
    });
  }

  return { success: true, ewoRef: ewo.ewo_ref, isTestArtifact: false, auditRef };
}

// ─── Suggestion helper (UI only, never automatic) ────────────────────────────

export function suggestsTestArtefact(ewoRef: string, title: string): boolean {
  return ewoRef.includes('-TEST-') || /^test[:\s]/i.test(title) || /\btest\b/i.test(title);
}
