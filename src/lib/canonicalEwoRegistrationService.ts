// EWO-022: Automatic Canonical Engineering Work Order Registration & Lifecycle Assurance
//
// Ensures every Engineering Work Order exists as a canonical record in the
// Engineering Ledger from the moment implementation is authorised. Supports
// all implementation sources, refinement hierarchies, PO lifecycle, and
// retrospective registration.

import { supabase } from './supabase';
import { recordChangeLogEvent } from './engineeringChangeLogService';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ImplementationSource =
  | 'conversation'
  | 'chatgpt_refinement'
  | 'atd'
  | 'historical_recovery'
  | 'manual'
  | 'autonomous'
  | 'bolt_refinement';

export type EngineeringCategory =
  | 'Engineering'
  | 'Refinement'
  | 'Historical Migration'
  | 'Historical Recovery'
  | 'Bug'
  | 'Constitutional'
  | 'Audit'
  | 'Historical Reference';

export type LifecycleStage =
  | 'engineering_approved'
  | 'in_progress'
  | 'engineering_complete'
  | 'engineering_verified'
  | 'awaiting_po_testing'
  | 'po_testing'
  | 'awaiting_po_acceptance'
  | 'po_accepted'
  | 'closed';

export const LIFECYCLE_STAGE_ORDER: LifecycleStage[] = [
  'engineering_approved',
  'in_progress',
  'engineering_complete',
  'engineering_verified',
  'awaiting_po_testing',
  'po_testing',
  'awaiting_po_acceptance',
  'po_accepted',
  'closed',
];

export const LIFECYCLE_STAGE_LABELS: Record<LifecycleStage, string> = {
  engineering_approved: 'Engineering Approved',
  in_progress: 'Engineering In Progress',
  engineering_complete: 'Engineering Complete',
  engineering_verified: 'Engineering Verified',
  awaiting_po_testing: 'Awaiting Product Owner Testing',
  po_testing: 'Product Owner Testing',
  awaiting_po_acceptance: 'Awaiting Product Owner Acceptance',
  po_accepted: 'Product Owner Accepted',
  closed: 'Closed',
};

export interface CanonicalEWORegistration {
  ewo_ref: string;
  title: string;
  engineering_category: EngineeringCategory;
  implementation_source: ImplementationSource;
  originating_prompt_ref?: string;
  originating_conversation_ref?: string;
  parent_ewo_ref?: string;
  executive_summary?: string;
  created_by?: string;
  implementation_started_at?: string;
  implementation_completed_at?: string;
  completion_report_ref?: string;
  // Retrospective registration fields
  is_retrospective?: boolean;
  original_created_at?: string;
  original_accepted_at?: string;
  original_closed_at?: string;
  acceptance_notes?: string;
}

export interface RegistrationResult {
  success: boolean;
  ewo_id: string | null;
  ewo_ref: string;
  created: boolean;
  duplicate: boolean;
  error?: string;
}

export interface RefinementHierarchy {
  ewo_ref: string;
  parent_ref: string | null;
  children: string[];
  refinement_chain: string[];
  refinement_depth: number;
  latest_accepted_refinement: string | null;
  superseded_refinements: string[];
}

export interface AcceptanceRecord {
  ewo_ref: string;
  accepted_by: string;
  accepted_at: string;
  acceptance_notes: string;
  accepted_completion_report_id: string | null;
  accepted_refinement_version: string | null;
  accepted_implementation_version: string | null;
}

// ─── REQ-1/2/3: Canonical EWO Registration ──────────────────────────────────

export async function registerCanonicalEWO(
  registration: CanonicalEWORegistration,
): Promise<RegistrationResult> {
  const {
    ewo_ref,
    title,
    engineering_category,
    implementation_source,
    originating_prompt_ref,
    originating_conversation_ref,
    parent_ewo_ref,
    executive_summary,
    created_by,
    implementation_started_at,
    implementation_completed_at,
    completion_report_ref,
    is_retrospective = false,
    original_created_at,
    original_accepted_at,
    original_closed_at,
    acceptance_notes,
  } = registration;

  // REQ-11: Duplicate protection — check if EWO already exists
  const { data: existing } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, status')
    .eq('ewo_ref', ewo_ref)
    .maybeSingle();

  if (existing) {
    return {
      success: true,
      ewo_id: existing.id as string,
      ewo_ref,
      created: false,
      duplicate: true,
    };
  }

  // REQ-4: Build refinement chain from parent
  let refinementChain: string[] = [ewo_ref];
  let refinementDepth = 0;
  if (parent_ewo_ref) {
    const { data: parent } = await supabase
      .from('engineering_work_orders')
      .select('refinement_chain, refinement_depth')
      .eq('ewo_ref', parent_ewo_ref)
      .maybeSingle();

    if (parent) {
      const parentChain = (parent.refinement_chain as string[]) ?? [parent_ewo_ref];
      refinementChain = [...parentChain, ewo_ref];
      refinementDepth = ((parent.refinement_depth as number) ?? 0) + 1;
    } else {
      refinementChain = [parent_ewo_ref, ewo_ref];
      refinementDepth = 1;
    }
  }

  // Determine initial lifecycle stage
  const initialStatus = is_retrospective
    ? (original_closed_at ? 'closed' : original_accepted_at ? 'po_acceptance' : 'ready')
    : 'engineering_approved';

  const createdAt = is_retrospective && original_created_at
    ? original_created_at
    : new Date().toISOString();

  // Insert canonical EWO
  const insertData: Record<string, unknown> = {
    ewo_ref,
    title,
    executive_summary: executive_summary ?? null,
    status: initialStatus,
    engineering_classification: engineering_category,
    implementation_source,
    originating_prompt_ref: originating_prompt_ref ?? null,
    originating_conversation_ref: originating_conversation_ref ?? null,
    parent_ref: parent_ewo_ref ?? null,
    refinement_chain: refinementChain,
    refinement_depth: refinementDepth,
    created_by: created_by ?? 'Engineering Intelligence Authority Engine',
    implementation_status: implementation_started_at ? 'In Progress' : 'Assigned',
    implementation_started_at: implementation_started_at ?? null,
    implementation_completed_at: implementation_completed_at ?? null,
    report_generation_status: completion_report_ref ? 'generated' : 'not_expected',
  };

  if (is_retrospective) {
    insertData.is_historical_import = true;
    insertData.import_source = 'retrospective_registration';
    insertData.imported_at = new Date().toISOString();
    insertData.imported_by = created_by ?? 'Engineering Intelligence Authority Engine';
    insertData.historical_notes = 'Retrospectively registered via EWO-022 governed repair tool';
    if (original_accepted_at) {
      insertData.po_accepted_at = original_accepted_at;
      insertData.po_accepted_by = 'Product Owner';
      insertData.po_acceptance_statement = acceptance_notes ?? 'Retrospectively accepted';
    }
    if (original_closed_at) {
      insertData.closed_at = original_closed_at;
      insertData.closed_by = 'Product Owner';
      insertData.closure_method = 'Product Owner Acceptance';
      insertData.closure_reason = 'Retrospectively closed via EWO-022';
    }
  }

  const { data: newEWO, error } = await supabase
    .from('engineering_work_orders')
    .insert(insertData)
    .select('id, ewo_ref')
    .single();

  if (error || !newEWO) {
    return {
      success: false,
      ewo_id: null,
      ewo_ref,
      created: false,
      duplicate: false,
      error: error?.message ?? 'Failed to create canonical EWO',
    };
  }

  // REQ-12: Record timeline event for registration
  await recordLifecycleEvent(
    newEWO.id as string,
    null,
    is_retrospective ? 'closed' : 'engineering_approved',
    created_by ?? 'Engineering Intelligence Authority Engine',
    is_retrospective
      ? 'Retrospective registration — canonical EWO created with preserved historical timestamps'
      : 'Canonical EWO registered — implementation authorised',
    {
      implementation_source,
      originating_prompt_ref,
      originating_conversation_ref,
      parent_ewo_ref,
      refinement_chain: refinementChain,
      refinement_depth: refinementDepth,
      is_retrospective,
    },
  );

  // Record in change log
  await recordChangeLogEvent({
    change_type: 'created',
    object_type: 'engineering_work_order',
    object_ref: ewo_ref,
    ewo_ref,
    summary: `Canonical EWO registered: ${title}`,
    description: `Implementation source: ${implementation_source}. Category: ${engineering_category}. Parent: ${parent_ewo_ref ?? 'none'}. Refinement depth: ${refinementDepth}.`,
    actor_type: 'system',
    actor: created_by ?? 'Engineering Intelligence Authority Engine',
    linked_artefacts: parent_ewo_ref
      ? [{ artefact_type: 'ewo', artefact_ref: parent_ewo_ref }]
      : [],
    metadata: {
      implementation_source,
      refinement_chain: refinementChain,
      refinement_depth: refinementDepth,
      is_retrospective,
    },
  });

  return {
    success: true,
    ewo_id: newEWO.id as string,
    ewo_ref,
    created: true,
    duplicate: false,
  };
}

// ─── REQ-4: Refinement Hierarchy ─────────────────────────────────────────────

export async function getRefinementHierarchy(ewoRef: string): Promise<RefinementHierarchy | null> {
  const { data: ewo, error } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, parent_ref, refinement_chain, refinement_depth, status, po_accepted_at')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (error || !ewo) return null;

  // Get children
  const { data: children } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref, status, po_accepted_at')
    .eq('parent_ref', ewoRef)
    .order('created_at', { ascending: true });

  const childRefs = (children ?? []).map(c => c.ewo_ref as string);

  // Find latest accepted refinement
  const acceptedChildren = (children ?? []).filter(c => c.po_accepted_at);
  const latestAccepted = acceptedChildren.length > 0
    ? acceptedChildren[acceptedChildren.length - 1].ewo_ref as string
    : null;

  // Find superseded refinements (closed but not accepted, or status indicates superseded)
  const superseded = (children ?? [])
    .filter(c => c.status === 'closed' && !c.po_accepted_at)
    .map(c => c.ewo_ref as string);

  return {
    ewo_ref: ewo.ewo_ref as string,
    parent_ref: (ewo.parent_ref as string) ?? null,
    children: childRefs,
    refinement_chain: (ewo.refinement_chain as string[]) ?? [ewoRef],
    refinement_depth: (ewo.refinement_depth as number) ?? 0,
    latest_accepted_refinement: latestAccepted,
    superseded_refinements: superseded,
  };
}

export async function getRefinementTree(rootEwoRef: string): Promise<RefinementHierarchy[]> {
  const root = await getRefinementHierarchy(rootEwoRef);
  if (!root) return [];

  const result: RefinementHierarchy[] = [root];
  const queue = [...root.children];

  while (queue.length > 0) {
    const childRef = queue.shift()!;
    const child = await getRefinementHierarchy(childRef);
    if (child) {
      result.push(child);
      queue.push(...child.children);
    }
  }

  return result;
}

// ─── REQ-6/7/8: PO Lifecycle & Acceptance ────────────────────────────────────

export async function transitionLifecycleStage(
  ewoRef: string,
  toStage: LifecycleStage,
  actor: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: ewo, error } = await supabase
    .from('engineering_work_orders')
    .select('id, status')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (error || !ewo) {
    return { success: false, error: 'EWO not found' };
  }

  const fromStatus = ewo.status as string;
  const updates: Record<string, unknown> = {
    status: toStage,
    updated_at: new Date().toISOString(),
  };

  // Set timestamps based on stage
  switch (toStage) {
    case 'in_progress':
      updates.implementation_started_at = new Date().toISOString();
      updates.implementation_status = 'In Progress';
      break;
    case 'engineering_complete':
      updates.implementation_completed_at = new Date().toISOString();
      updates.implementation_status = 'Complete';
      break;
    case 'engineering_verified':
      updates.verified_at = new Date().toISOString();
      updates.verification_status = 'verified';
      break;
    case 'awaiting_po_testing':
      updates.ready_for_review_at = new Date().toISOString();
      updates.po_testing_status = 'pending';
      break;
    case 'po_testing':
      updates.po_testing_status = 'in_progress';
      break;
    case 'awaiting_po_acceptance':
      updates.po_testing_status = 'completed';
      updates.po_testing_completed_at = new Date().toISOString();
      break;
    case 'closed':
      updates.closed_at = new Date().toISOString();
      updates.closed_by = actor;
      updates.closure_method = 'Product Owner Acceptance';
      break;
  }

  const { error: updateError } = await supabase
    .from('engineering_work_orders')
    .update(updates)
    .eq('id', ewo.id as string);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  await recordLifecycleEvent(
    ewo.id as string,
    fromStatus,
    toStage,
    actor,
    notes ?? `Lifecycle transition: ${fromStatus} → ${toStage}`,
    { to_stage: toStage },
  );

  return { success: true };
}

export async function recordProductOwnerAcceptance(
  ewoRef: string,
  acceptance: {
    accepted_by: string;
    acceptance_notes: string;
    accepted_completion_report_id?: string | null;
    accepted_refinement_version?: string | null;
    accepted_implementation_version?: string | null;
  },
): Promise<{ success: boolean; error?: string }> {
  const { data: ewo, error } = await supabase
    .from('engineering_work_orders')
    .select('id, status, ewo_ref')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (error || !ewo) {
    return { success: false, error: 'EWO not found' };
  }

  const acceptedAt = new Date().toISOString();

  // REQ-8: Automatic closure after acceptance
  const { error: updateError } = await supabase
    .from('engineering_work_orders')
    .update({
      status: 'closed',
      po_accepted_at: acceptedAt,
      po_accepted_by: acceptance.accepted_by,
      po_acceptance_statement: acceptance.acceptance_notes,
      po_acceptance_notes: acceptance.acceptance_notes,
      accepted_completion_report_id: acceptance.accepted_completion_report_id ?? null,
      accepted_refinement_version: acceptance.accepted_refinement_version ?? null,
      accepted_implementation_version: acceptance.accepted_implementation_version ?? null,
      closed_at: acceptedAt,
      closed_by: acceptance.accepted_by,
      closure_method: 'Product Owner Acceptance',
      closure_reason: 'Product Owner accepted the Engineering Work Order',
      updated_at: acceptedAt,
    })
    .eq('id', ewo.id as string);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // REQ-7: Record timeline events
  await recordLifecycleEvent(
    ewo.id as string,
    'awaiting_po_acceptance',
    'po_accepted',
    acceptance.accepted_by,
    `Product Owner Acceptance recorded: ${acceptance.acceptance_notes}`,
    {
      accepted_completion_report_id: acceptance.accepted_completion_report_id,
      accepted_refinement_version: acceptance.accepted_refinement_version,
      accepted_implementation_version: acceptance.accepted_implementation_version,
    },
  );

  await recordLifecycleEvent(
    ewo.id as string,
    'po_accepted',
    'closed',
    acceptance.accepted_by,
    'Automatic closure after Product Owner Acceptance',
    { closure_method: 'Product Owner Acceptance' },
  );

  // Record in change log
  await recordChangeLogEvent({
    change_type: 'updated',
    object_type: 'engineering_work_order',
    object_ref: ewoRef,
    ewo_ref: ewoRef,
    summary: `Product Owner Acceptance recorded for ${ewoRef}`,
    description: `Accepted by ${acceptance.accepted_by}. Notes: ${acceptance.acceptance_notes}. EWO automatically closed.`,
    actor_type: 'human',
    actor: acceptance.accepted_by,
    linked_artefacts: acceptance.accepted_completion_report_id
      ? [{ artefact_type: 'completion_report', artefact_ref: acceptance.accepted_completion_report_id }]
      : [],
    metadata: {
      accepted_at: acceptedAt,
      accepted_refinement_version: acceptance.accepted_refinement_version,
      accepted_implementation_version: acceptance.accepted_implementation_version,
    },
  });

  return { success: true };
}

// ─── REQ-5: Completion Report Linkage ────────────────────────────────────────

export async function linkCompletionReport(
  ewoRef: string,
  reportId: string,
  reportType: string = 'completion',
): Promise<{ success: boolean; error?: string }> {
  const { data: ewo, error } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (error || !ewo) {
    return { success: false, error: 'EWO not found' };
  }

  // Update the completion report to link back to the EWO
  const { error: reportError } = await supabase
    .from('ewo_completion_reports')
    .update({ ewo_id: ewo.id as string })
    .eq('id', reportId);

  if (reportError) {
    return { success: false, error: reportError.message };
  }

  // Update EWO to reference the report
  const { error: ewoError } = await supabase
    .from('engineering_work_orders')
    .update({
      report_generation_status: 'generated',
      completion_report_status: { report_id: reportId, type: reportType },
      updated_at: new Date().toISOString(),
    })
    .eq('id', ewo.id as string);

  if (ewoError) {
    return { success: false, error: ewoError.message };
  }

  await recordLifecycleEvent(
    ewo.id as string,
    null,
    'report_generated' as LifecycleStage,
    'system',
    `Completion report linked: ${reportId} (type: ${reportType})`,
    { report_id: reportId, report_type: reportType },
  );

  return { success: true };
}

// ─── REQ-9: Retrospective Registration ───────────────────────────────────────

export async function retrospectivelyRegisterEWO(
  registration: CanonicalEWORegistration & {
    original_created_at: string;
    original_accepted_at?: string;
    original_closed_at?: string;
    acceptance_notes?: string;
    completion_report_body?: string;
  },
): Promise<RegistrationResult> {
  const result = await registerCanonicalEWO({
    ...registration,
    is_retrospective: true,
  });

  if (result.success && result.ewo_id && registration.completion_report_body) {
    // Create completion report for retrospective EWO
    await supabase.from('ewo_completion_reports').insert({
      ewo_id: result.ewo_id,
      ewo_ref: registration.ewo_ref,
      title: registration.title,
      executive_summary: registration.executive_summary ?? '',
      report_body: registration.completion_report_body,
      generated_at: registration.original_created_at,
      accepted_at: registration.original_accepted_at ?? null,
      accepted_by: registration.original_accepted_at ? 'Product Owner' : null,
    });
  }

  return result;
}

// ─── REQ-10: Current Repair — Register EWO-021R.5/.5R.1/.6/.6R.1 ──────────────

export async function registerEwo021Refinements(): Promise<RegistrationResult[]> {
  const results: RegistrationResult[] = [];

  const refinements: Array<CanonicalEWORegistration & {
    original_created_at: string;
    original_accepted_at?: string;
    original_closed_at?: string;
    acceptance_notes?: string;
    completion_report_body?: string;
  }> = [
    {
      ewo_ref: 'EWO-021R.5',
      title: 'EWO-021R.5 — Governed Resolution Workspace & Investigation Schema',
      engineering_category: 'Refinement',
      implementation_source: 'chatgpt_refinement',
      originating_prompt_ref: 'EWO-021R.5-prompt',
      parent_ewo_ref: 'EWO-021',
      executive_summary: 'Governed resolution workspace for integrity investigations with canonical schema, PDF rendering, and AI context packages.',
      created_by: 'Engineering Intelligence Authority Engine',
      original_created_at: '2026-07-22T05:00:00Z',
      original_accepted_at: '2026-07-22T12:00:00Z',
      original_closed_at: '2026-07-22T12:00:00Z',
      acceptance_notes: 'EWO-021R.5 accepted. Governed resolution workspace operational.',
      completion_report_body: 'EWO-021R.5: Governed Resolution Workspace & Investigation Schema. Implemented canonical investigation schema, PDF rendering with AI context, and governed resolution workspace UI.',
    },
    {
      ewo_ref: 'EWO-021R.5R.1',
      title: 'EWO-021R.5R.1 — Resolution Execution & Decision Linkage',
      engineering_category: 'Refinement',
      implementation_source: 'chatgpt_refinement',
      originating_prompt_ref: 'EWO-021R.5R.1-prompt',
      parent_ewo_ref: 'EWO-021R.5',
      executive_summary: 'Resolution execution service with decision linkage, ensuring governed resolution actions are linked to authoritative decisions.',
      created_by: 'Engineering Intelligence Authority Engine',
      original_created_at: '2026-07-22T06:00:00Z',
      original_accepted_at: '2026-07-22T12:00:00Z',
      original_closed_at: '2026-07-22T12:00:00Z',
      acceptance_notes: 'EWO-021R.5R.1 accepted. Resolution execution and decision linkage operational.',
      completion_report_body: 'EWO-021R.5R.1: Resolution Execution & Decision Linkage. Implemented resolution execution service linking governed actions to authoritative decisions.',
    },
    {
      ewo_ref: 'EWO-021R.6',
      title: 'EWO-021R.6 — Governed Decision Reuse & Alert Suppression',
      engineering_category: 'Refinement',
      implementation_source: 'chatgpt_refinement',
      originating_prompt_ref: 'EWO-021R.6-prompt',
      parent_ewo_ref: 'EWO-021R.5',
      executive_summary: 'Governed decision reuse and alert suppression for integrity reconciliation. Prevents duplicate alerts for resolved conditions.',
      created_by: 'Engineering Intelligence Authority Engine',
      original_created_at: '2026-07-22T09:00:00Z',
      original_accepted_at: '2026-07-22T12:00:00Z',
      original_closed_at: '2026-07-22T12:00:00Z',
      acceptance_notes: 'EWO-021R.6 accepted. Governed decision reuse and alert suppression operational. Product Owner Test 1 passed.',
      completion_report_body: 'EWO-021R.6: Governed Decision Reuse & Alert Suppression. Implemented canonical condition identity, evidence fingerprinting, material change detection, resolved decision reuse, permanent-gap suppression, and duplicate alert prevention.',
    },
    {
      ewo_ref: 'EWO-021R.6R.1',
      title: 'EWO-021R.6R.1 — Reusable Resolution Discovery & Reconciliation Idempotency Correction',
      engineering_category: 'Refinement',
      implementation_source: 'chatgpt_refinement',
      originating_prompt_ref: 'EWO-021R.6R.1-prompt',
      parent_ewo_ref: 'EWO-021R.6',
      executive_summary: 'Canonical resolution discovery across full alert lineage. Material change gate prevents false successor investigations. Safe failure behaviour preserves resolved state.',
      created_by: 'Engineering Intelligence Authority Engine',
      original_created_at: '2026-07-22T09:30:00Z',
      original_accepted_at: '2026-07-22T12:00:00Z',
      original_closed_at: '2026-07-22T12:00:00Z',
      acceptance_notes: 'EWO-021R.6R.1 accepted. Reusable resolution discovery operational across full alert lineage. EWO-014.7E repaired. Repeated reconciliation idempotent.',
      completion_report_body: 'EWO-021R.6R.1: Reusable Resolution Discovery & Reconciliation Idempotency Correction. Implemented canonical resolution discovery service traversing full alert lineage, resolution value normalisation, authoritative alert selection, material change gate, safe failure behaviour, and EWO-014.7E lineage repair.',
    },
  ];

  for (const ref of refinements) {
    const result = await retrospectivelyRegisterEWO(ref);
    results.push(result);
  }

  return results;
}

// ─── REQ-11: Duplicate Protection ─────────────────────────────────────────────

export async function checkDuplicateEWO(
  ewoRef: string,
  parentEwoRef?: string,
): Promise<{ is_duplicate: boolean; existing_id: string | null }> {
  const { data: existing } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (existing) {
    return { is_duplicate: true, existing_id: existing.id as string };
  }

  return { is_duplicate: false, existing_id: null };
}

// ─── REQ-12: Timeline Events ──────────────────────────────────────────────────

async function recordLifecycleEvent(
  ewoId: string,
  fromStatus: string | null,
  toStatus: string,
  actor: string,
  notes: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('ewo_lifecycle_events').insert({
      ewo_id: ewoId,
      from_status: fromStatus,
      to_status: toStatus,
      actor,
      notes,
      metadata: metadata ?? {},
    });
  } catch (err) {
    console.error('[EWO-022] Failed to record lifecycle event:', err);
  }
}

// ─── Search & Query Helpers ───────────────────────────────────────────────────

export async function searchEngineeringLedger(
  query: string,
): Promise<Array<{
  id: string;
  ewo_ref: string;
  title: string;
  status: string;
  engineering_classification: string | null;
  implementation_source: string | null;
  parent_ref: string | null;
  refinement_depth: number;
  po_accepted_at: string | null;
  closed_at: string | null;
  created_at: string;
}>> {
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, engineering_classification, implementation_source, parent_ref, refinement_depth, po_accepted_at, closed_at, created_at')
    .or(`ewo_ref.ilike.%${query}%,title.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data as Array<{
    id: string;
    ewo_ref: string;
    title: string;
    status: string;
    engineering_classification: string | null;
    implementation_source: string | null;
    parent_ref: string | null;
    refinement_depth: number;
    po_accepted_at: string | null;
    closed_at: string | null;
    created_at: string;
  }>;
}

export async function getEwoByRef(ewoRef: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (error || !data) return null;
  return data as Record<string, unknown>;
}

export async function getEwoLifecycleEvents(ewoId: string): Promise<Array<{
  id: string;
  from_status: string | null;
  to_status: string;
  actor: string;
  notes: string;
  metadata: Record<string, unknown>;
  created_at: string;
}>> {
  const { data, error } = await supabase
    .from('ewo_lifecycle_events')
    .select('id, from_status, to_status, actor, notes, metadata, created_at')
    .eq('ewo_id', ewoId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data as Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    actor: string;
    notes: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
}
