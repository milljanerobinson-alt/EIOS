/**
 * EWO-032R.15 — Engineering Lifecycle Progress Resolver
 *
 * Read-only resolver that inspects persisted governed records to determine
 * the current lifecycle stage of an Engineering Idea.
 *
 * No governed objects are created, changed, or deleted by this resolver.
 * All stage completion is derived from persisted database records only.
 * Wizard progress is ephemeral (not persisted in the database) — only the
 * resulting governed objects (intent, objective, session, idea, EWO) are persisted.
 */

import { supabase } from '../lib/supabase';
import type { EngineeringIdea } from '../pages/ecc/ECCIdeaTypes';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type LifecycleStageId =
  | 'idea_captured'
  | 'guardian_validation'
  | 'similarity_review'
  | 'intent_created'
  | 'objective_created'
  | 'engineering_analysis'
  | 'engineering_plan'
  | 'po_approval'
  | 'ewo_created'
  | 'execution_preparation'
  | 'execution_ready'
  | 'executing'
  | 'validation'
  | 'completion'
  | 'accepted'
  | 'closed';

export type StageStatus = 'completed' | 'current' | 'pending' | 'not_implemented';

export interface LifecycleStage {
  id: LifecycleStageId;
  label: string;
  status: StageStatus;
  evidenceSource: string | null;
  evidenceRef: string | null;
}

export interface LifecycleDiagnostics {
  idea_ref: string;
  resolved_current_stage: LifecycleStageId;
  completed_stages: LifecycleStageId[];
  next_action: string;
  next_action_available: boolean;
  next_action_route: string | null;
  resolution_sources: string[];
  missing_expected_records: string[];
  execution_preparation_implemented: boolean;
  execution_readiness_implemented: boolean;
  execute_action_implemented: boolean;
  execution_runtime_connected: boolean;
}

export interface LifecycleResolution {
  stages: LifecycleStage[];
  currentStage: LifecycleStage;
  nextAction: string;
  nextActionAvailable: boolean;
  nextActionRoute: string | null;
  diagnostics: LifecycleDiagnostics;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve the lifecycle progress of an Engineering Idea from persisted records.
 *
 * Evidence sources (all read-only):
 * - engineering_idea (root record)
 * - engineering_intent (linked via intent_id)
 * - engineering_objective (linked via objective_id)
 * - execution_session (linked via session_id)
 * - guardian_validated flag on the idea
 * - similarity_decision / similarity_matches_count on the idea
 * - related_ewo_refs on the idea → engineering_work_orders
 * - ewo_engineering_packages (package_status = 'approved' → engineering plan)
 * - ecc_engineering_reviews (status = 'approved' → engineering analysis)
 * - ewo_execution_approvals (decision = 'approved' → PO approval)
 * - engineering_executions (execution state)
 *
 * Architectural facts discovered during investigation:
 * - "Prepare Execution" IS implemented (ATDConversationPackage + conversationExecutionBridge)
 * - "Execution Readiness" IS implemented (executionEligibilityResolver)
 * - "Execute" button IS implemented (ECCWorkOrdersPage "Begin Engineering Execution")
 * - Backend execution runtime IS connected (executionLaunchService → executionOrchestrator)
 * - However, these are NOT accessible from the Idea detail view — they live on
 *   the Work Orders page. The lifecycle component must be honest about this.
 */
export async function resolveIdeaLifecycle(idea: EngineeringIdea): Promise<LifecycleResolution> {
  const sources: string[] = [];
  const missing: string[] = [];
  const completed: LifecycleStageId[] = [];

  // ── 1. Idea Captured ──
  // Evidence: the idea record itself exists (we have it as a parameter)
  sources.push('engineering_idea.id');
  completed.push('idea_captured');

  // ── 2. Guardian Validation ──
  // Evidence: guardian_validated flag on the idea
  const guardianValidated = idea.guardian_validated;
  sources.push(`engineering_idea.guardian_validated = ${guardianValidated}`);
  if (guardianValidated) {
    completed.push('guardian_validation');
  }

  // ── 3. Similarity Review ──
  // Evidence: similarity_decision is set OR similarity_matches_count > 0
  const similarityDone = idea.similarity_decision !== null || (idea.similarity_matches_count ?? 0) > 0;
  sources.push(`engineering_idea.similarity_decision = ${idea.similarity_decision ?? 'null'}`);
  sources.push(`engineering_idea.similarity_matches_count = ${idea.similarity_matches_count ?? 0}`);
  if (similarityDone) {
    completed.push('similarity_review');
  }

  // ── 4. Intent Created ──
  // Evidence: intent_id is non-null AND a record exists in engineering_intent
  let intentExists = false;
  if (idea.intent_id) {
    const { data: intentRow } = await supabase
      .from('engineering_intent')
      .select('id, intent_ref, status')
      .eq('id', idea.intent_id)
      .maybeSingle();
    if (intentRow) {
      intentExists = true;
      sources.push(`engineering_intent.id = ${idea.intent_id} (status: ${intentRow.status})`);
      completed.push('intent_created');
    } else {
      missing.push(`engineering_intent record not found for intent_id = ${idea.intent_id}`);
    }
  } else {
    missing.push('engineering_idea.intent_id is null');
  }

  // ── 5. Objective Created ──
  // Evidence: objective_id is non-null AND a record exists in engineering_objective
  let objectiveExists = false;
  if (idea.objective_id) {
    const { data: objRow } = await supabase
      .from('engineering_objective')
      .select('id, objective_ref, status')
      .eq('id', idea.objective_id)
      .maybeSingle();
    if (objRow) {
      objectiveExists = true;
      sources.push(`engineering_objective.id = ${idea.objective_id} (status: ${objRow.status})`);
      completed.push('objective_created');
    } else {
      missing.push(`engineering_objective record not found for objective_id = ${idea.objective_id}`);
    }
  } else {
    missing.push('engineering_idea.objective_id is null');
  }

  // ── 6. Engineering Analysis ──
  // Evidence: an approved engineering review linked to this idea's EWOs
  // The ecc_engineering_reviews table has metadata->>'ewo_ref' linking to EWOs.
  // This is NOT a governed completion state in the completionGovernanceEngine,
  // but an approved review serves as evidence of analysis completion.
  let analysisComplete = false;
  const ewoRefs = idea.related_ewo_refs ?? [];
  if (ewoRefs.length > 0) {
    const { data: reviews } = await supabase
      .from('ecc_engineering_reviews')
      .select('id, status, metadata')
      .in('metadata->>ewo_ref', ewoRefs);
    if (reviews && reviews.length > 0) {
      const approved = reviews.some((r: { status: string }) => r.status === 'approved');
      sources.push(`ecc_engineering_reviews: ${reviews.length} review(s), approved=${approved}`);
      if (approved) {
        analysisComplete = true;
        completed.push('engineering_analysis');
      }
    }
  }

  // ── 7. Engineering Plan ──
  // Evidence: ewo_engineering_packages with package_status = 'approved'
  // linked to the idea's EWOs via ewo_id.
  let planComplete = false;
  if (ewoRefs.length > 0) {
    // First get EWO IDs from refs
    const { data: ewos } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref')
      .in('ewo_ref', ewoRefs);
    if (ewos && ewos.length > 0) {
      const ewoIds = ewos.map((e: { id: string }) => e.id);
      const { data: packages } = await supabase
        .from('ewo_engineering_packages')
        .select('id, package_status, ewo_id')
        .in('ewo_id', ewoIds);
      if (packages && packages.length > 0) {
        const approved = packages.some((p: { package_status: string }) => p.package_status === 'approved');
        sources.push(`ewo_engineering_packages: ${packages.length} package(s), approved=${approved}`);
        if (approved) {
          planComplete = true;
          completed.push('engineering_plan');
        }
      }
    }
  }

  // ── 8. Product Owner Approval ──
  // Evidence: ewo_execution_approvals with decision = 'approved' for the idea's EWOs
  let poApproved = false;
  if (ewoRefs.length > 0) {
    const { data: ewos } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref')
      .in('ewo_ref', ewoRefs);
    if (ewos && ewos.length > 0) {
      const ewoIds = ewos.map((e: { id: string }) => e.id);
      const { data: approvals } = await supabase
        .from('ewo_execution_approvals')
        .select('id, decision, product_owner')
        .in('ewo_id', ewoIds)
        .eq('decision', 'approved');
      if (approvals && approvals.length > 0) {
        poApproved = true;
        sources.push(`ewo_execution_approvals: ${approvals.length} approved`);
        completed.push('po_approval');
      }
    }
  }

  // ── 9. EWO Created ──
  // Evidence: related_ewo_refs is non-empty AND EWO records exist
  let ewoCreated = false;
  let ewoStatus: string | null = null;
  if (ewoRefs.length > 0) {
    const { data: ewos } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref, status, lifecycle_state')
      .in('ewo_ref', ewoRefs);
    if (ewos && ewos.length > 0) {
      ewoCreated = true;
      ewoStatus = (ewos[0] as { lifecycle_state?: string }).lifecycle_state ?? (ewos[0] as { status: string }).status;
      sources.push(`engineering_work_orders: ${ewos.length} EWO(s), status=${ewoStatus}`);
      completed.push('ewo_created');
    } else {
      missing.push(`engineering_work_orders records not found for refs: ${ewoRefs.join(', ')}`);
    }
  } else {
    // No EWO refs — check if idea status indicates promotion
    if (idea.status === 'promoted' || idea.status === 'queued_for_promotion') {
      sources.push(`engineering_idea.status = ${idea.status} (promotion expected but no ewo_refs)`);
      missing.push('Idea status indicates promotion but related_ewo_refs is empty');
    }
  }

  // ── 10-16. Execution stages ──
  // These stages are implemented in the product but NOT accessible from the
  // Idea detail view. They live on the Work Orders page.
  //
  // Architectural facts:
  // - "Prepare Execution" IS implemented (ATDConversationPackage, conversationExecutionBridge)
  // - "Execution Readiness" IS implemented (executionEligibilityResolver)
  // - "Execute" button IS implemented (ECCWorkOrdersPage "Begin Engineering Execution")
  // - Backend execution runtime IS connected (executionLaunchService → executionOrchestrator)
  //
  // However, from the Idea detail view, the user cannot directly trigger
  // execution. They must navigate to the Work Orders page first.

  const executionPreparationImplemented = true; // in ATDConversationPackage
  const executionReadinessImplemented = true;   // in executionEligibilityResolver
  const executeActionImplemented = true;         // in ECCWorkOrdersPage
  const executionRuntimeConnected = true;        // executionLaunchService → executionOrchestrator

  // Check if there are actual execution records
  let hasExecution = false;
  let executionState: string | null = null;
  if (ewoCreated) {
    const { data: ewos } = await supabase
      .from('engineering_work_orders')
      .select('id')
      .in('ewo_ref', ewoRefs);
    if (ewos && ewos.length > 0) {
      const ewoIds = ewos.map((e: { id: string }) => e.id);
      const { data: executions } = await supabase
        .from('engineering_executions')
        .select('id, execution_state, ewo_id')
        .in('ewo_id', ewoIds)
        .order('created_at', { ascending: false })
        .limit(1);
      if (executions && executions.length > 0) {
        hasExecution = true;
        executionState = (executions[0] as { execution_state: string }).execution_state;
        sources.push(`engineering_executions: state=${executionState}`);
      }
    }
  }

  // Check EWO lifecycle state for completion/acceptance
  let isCompleted = false;
  let isAccepted = false;
  let isClosed = false;
  if (ewoStatus) {
    // EWO lifecycle states: not_started, in_progress, engineering_complete, ready_for_review, closed
    if (ewoStatus === 'engineering_complete' || ewoStatus === 'ready_for_review') {
      isCompleted = true;
      completed.push('completion');
    }
    // Check PO acceptance on EWO
    if (ewoRefs.length > 0) {
      const { data: ewos } = await supabase
        .from('engineering_work_orders')
        .select('id, po_testing_status, po_acceptance_notes')
        .in('ewo_ref', ewoRefs);
      if (ewos && ewos.length > 0) {
        const ewo = ewos[0] as { po_testing_status?: string; po_acceptance_notes?: string };
        if (ewo.po_testing_status === 'accepted' || ewo.po_acceptance_notes) {
          isAccepted = true;
          completed.push('accepted');
        }
      }
    }
    if (ewoStatus === 'closed') {
      isClosed = true;
      completed.push('closed');
    }
  }

  // ── Determine current stage ──
  const allStages: LifecycleStageId[] = [
    'idea_captured',
    'guardian_validation',
    'similarity_review',
    'intent_created',
    'objective_created',
    'engineering_analysis',
    'engineering_plan',
    'po_approval',
    'ewo_created',
    'execution_preparation',
    'execution_ready',
    'executing',
    'validation',
    'completion',
    'accepted',
    'closed',
  ];

  let currentStageId: LifecycleStageId = 'idea_captured';
  for (const stage of allStages) {
    if (!completed.includes(stage)) {
      currentStageId = stage;
      break;
    }
  }
  // If all completed stages are done, current is the last one
  if (completed.length > 0 && currentStageId === 'idea_captured' && completed.includes('idea_captured')) {
    // Find first non-completed
    const firstIncomplete = allStages.find(s => !completed.includes(s));
    currentStageId = firstIncomplete ?? 'closed';
  }

  // ── Determine next action ──
  let nextAction = '';
  let nextActionAvailable = false;
  let nextActionRoute: string | null = null;

  switch (currentStageId) {
    case 'idea_captured':
      nextAction = 'Preparing engineering proposal — ATD is analysing your request';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'guardian_validation':
      nextAction = 'Similarity review in progress';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'similarity_review':
      if (!intentExists || !objectiveExists) {
        nextAction = 'Preparing intent and objective';
        nextActionAvailable = false;
        nextActionRoute = null;
      } else {
        nextAction = 'Promoting to Engineering Work Order';
        nextActionAvailable = false;
        nextActionRoute = null;
      }
      break;
    case 'intent_created':
    case 'objective_created':
      nextAction = 'Completing remaining creation steps';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'engineering_analysis':
      nextAction = 'Engineering analysis in progress';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'engineering_plan':
      nextAction = 'Engineering plan in progress';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'po_approval':
      nextAction = 'Awaiting Product Owner Approval for execution';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'ewo_created':
      nextAction = 'Engineering Work Order created';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'execution_preparation':
      nextAction = 'Preparing execution';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'execution_ready':
      nextAction = 'Ready for execution';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'executing':
      nextAction = 'Execution in progress';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'validation':
      nextAction = 'Awaiting validation results';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'completion':
      nextAction = 'Awaiting Product Owner acceptance';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'accepted':
      nextAction = 'Awaiting closure';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
    case 'closed':
      nextAction = 'Lifecycle complete';
      nextActionAvailable = false;
      nextActionRoute = null;
      break;
  }

  // ── Build stage list ──
  const stageLabels: Record<LifecycleStageId, string> = {
    idea_captured: 'Idea Captured',
    guardian_validation: 'Guardian Validation',
    similarity_review: 'Similarity Review',
    intent_created: 'Intent Created',
    objective_created: 'Objective Created',
    engineering_analysis: 'Engineering Analysis',
    engineering_plan: 'Engineering Plan',
    po_approval: 'Product Owner Approval',
    ewo_created: 'Engineering Work Order',
    execution_preparation: 'Execution Preparation',
    execution_ready: 'Execution Ready',
    executing: 'Executing',
    validation: 'Validation',
    completion: 'Completion',
    accepted: 'Accepted',
    closed: 'Closed',
  };

  const stages: LifecycleStage[] = allStages.map(id => {
    const isCompleted = completed.includes(id);
    const isCurrent = id === currentStageId;
    // Stages after EWO creation that are not yet implemented from the Idea view
    const isAfterEwo = allStages.indexOf(id) > allStages.indexOf('ewo_created');
    const hasNoEvidence = isAfterEwo && !isCompleted;

    let status: StageStatus;
    if (isCompleted) {
      status = 'completed';
    } else if (isCurrent) {
      status = 'current';
    } else if (hasNoEvidence && !hasExecution && id !== 'execution_preparation' && id !== 'execution_ready') {
      // These stages exist in the product but are not yet reachable from this view
      status = 'pending';
    } else {
      status = 'pending';
    }

    return {
      id,
      label: stageLabels[id],
      status,
      evidenceSource: isCompleted ? sources.find(s => s.startsWith(getEvidenceTable(id))) ?? 'persisted record' : null,
      evidenceRef: null,
    };
  });

  const currentStage = stages.find(s => s.id === currentStageId)!;

  const diagnostics: LifecycleDiagnostics = {
    idea_ref: idea.idea_ref,
    resolved_current_stage: currentStageId,
    completed_stages: completed,
    next_action: nextAction,
    next_action_available: nextActionAvailable,
    next_action_route: nextActionRoute,
    resolution_sources: sources,
    missing_expected_records: missing,
    execution_preparation_implemented: executionPreparationImplemented,
    execution_readiness_implemented: executionReadinessImplemented,
    execute_action_implemented: executeActionImplemented,
    execution_runtime_connected: executionRuntimeConnected,
  };

  return {
    stages,
    currentStage,
    nextAction,
    nextActionAvailable,
    nextActionRoute,
    diagnostics,
  };
}

function getEvidenceTable(stage: LifecycleStageId): string {
  switch (stage) {
    case 'idea_captured': return 'engineering_idea';
    case 'guardian_validation': return 'engineering_idea.guardian';
    case 'similarity_review': return 'engineering_idea.similarity';
    case 'intent_created': return 'engineering_intent';
    case 'objective_created': return 'engineering_objective';
    case 'engineering_analysis': return 'ecc_engineering_reviews';
    case 'engineering_plan': return 'ewo_engineering_packages';
    case 'po_approval': return 'ewo_execution_approvals';
    case 'ewo_created': return 'engineering_work_orders';
    case 'executing': return 'engineering_executions';
    case 'completion': return 'engineering_work_orders';
    case 'accepted': return 'engineering_work_orders';
    case 'closed': return 'engineering_work_orders';
    default: return '';
  }
}
