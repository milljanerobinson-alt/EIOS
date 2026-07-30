// EWO-017R.2 — Execution Launch Service
//
// Wires the executionOrchestrator to the Product Owner UI. Uses the canonical
// evaluateExecutionEligibility resolver for all eligibility decisions.
// Handles duplicate session prevention, session creation, orchestrator
// invocation, target validation, and governed failure messaging.

import { supabase } from './supabase';
import {
  evaluateExecutionEligibility,
  type EligibilityResult,
} from './executionEligibilityResolver';
import {
  executeWorkOrder,
  type OrchestratorConfig,
  type OrchestratorResult,
} from './executionOrchestrator';
import { createExecution, getExecutions, type EngineeringExecution } from './engineeringExecutionService';
import { guardImplementationEntry } from './ensureEngineeringWorkOrder';
import { buildExecutionContract, validateContractReadiness, type ExecutionContract } from './executionContractService';
import { generateAcceptanceCriteria } from './acceptanceCriteriaService';
import { resolveComponentFromRequest } from './componentResolutionService';

// ─── Types (re-exported for backward compat) ──────────────────────────────────

export type { EligibilityResult } from './executionEligibilityResolver';

export interface LaunchResult {
  success: boolean;
  executionRef: string | null;
  error: string | null;
  eligibility: EligibilityResult | null;
  result: OrchestratorResult | null;
}

// ─── Eligibility (delegates to canonical resolver) ───────────────────────────

export async function checkExecutionEligibility(ewoId: string): Promise<EligibilityResult> {
  return evaluateExecutionEligibility(ewoId);
}

// ─── Active Session Detection ────────────────────────────────────────────────

export async function getActiveSession(ewoId: string): Promise<{
  hasActiveSession: boolean;
  execution: EngineeringExecution | null;
}> {
  const executions = await getExecutions({ ewoId });
  const activeStatuses = ['queued', 'running', 'awaiting_review', 'awaiting_po', 'awaiting_po_testing', 'awaiting_completion', 'prepared', 'submitted', 'completion_received', 'engineering_review', 'automated_verification', 'po_accepted'];
  const active = executions.find(e => activeStatuses.includes(e.implementation_status));
  return {
    hasActiveSession: !!active,
    execution: active ?? null,
  };
}

// ─── Begin Engineering Execution ──────────────────────────────────────────────

export async function beginEngineeringExecution(
  ewoId: string,
  options: {
    targetId?: string;
    engineId?: string;
    actor?: string;
    onProgress?: (update: { stage: string; status: string; detail: string }) => void;
  } = {},
): Promise<LaunchResult> {
  // 1. Guard: ensure canonical EWO registration before execution
  const guard = await guardImplementationEntry(ewoId, 'beginEngineeringExecution');
  if (!guard.success) {
    return {
      success: false,
      executionRef: null,
      error: `Engineering implementation cannot begin because the canonical Engineering Work Order could not be registered. ${guard.error}`,
      eligibility: null,
      result: null,
    };
  }

  // 2. Canonical eligibility evaluation
  const eligibility = await evaluateExecutionEligibility(ewoId);

  // 2. Prevent duplicate executions
  if (eligibility.activeExecutionSession.hasActive) {
    return {
      success: false,
      executionRef: eligibility.activeExecutionSession.executionRef,
      error: `An active execution session already exists: ${eligibility.activeExecutionSession.executionRef}. Use View Execution to monitor or resume.`,
      eligibility,
      result: null,
    };
  }

  // 3. Governed prerequisite validation
  if (!eligibility.eligible) {
    const failed = eligibility.blockingReasons.map(r => `${r.prerequisite}: ${r.detail}`);
    return {
      success: false,
      executionRef: null,
      error: `Prerequisite validation failed. ${failed.join('; ')}`,
      eligibility,
      result: null,
    };
  }

  // 4. Execution target validation (Req 9)
  if (!eligibility.targetAvailable || !eligibility.targetInfo) {
    return {
      success: false,
      executionRef: null,
      error: 'No valid execution target available. Configure an active execution target with a valid repository and branch strategy.',
      eligibility,
      result: null,
    };
  }

  // 5. Build and validate the Execution Contract (EWO-034)
  const { data: ewoRow } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, executive_summary, status')
    .eq('id', ewoId)
    .maybeSingle();

  if (!ewoRow) {
    return {
      success: false,
      executionRef: null,
      error: 'EWO not found for contract generation.',
      eligibility,
      result: null,
    };
  }

  // 5a. Resolve components from the EWO request
  const componentResult = await resolveComponentFromRequest(
    `${ewoRow.title} ${ewoRow.executive_summary ?? ''}`,
  );

  const resolvedComponents = componentResult.resolved && componentResult.selected_candidate
    ? [componentResult.selected_candidate.file_path]
    : [];

  // 5b. Generate acceptance criteria
  const acceptanceCriteria = generateAcceptanceCriteria(
    ewoRow.ewo_ref,
    `${ewoRow.title} ${ewoRow.executive_summary ?? ''}`,
    ewoRow.executive_summary ?? undefined,
  );

  // 5c. Build the execution contract
  const contract = await buildExecutionContract({
    ewoId: ewoId,
    ewoRef: ewoRow.ewo_ref,
    originalRequest: `${ewoRow.title} ${ewoRow.executive_summary ?? ''}`,
    engineeringObjective: ewoRow.executive_summary ?? ewoRow.title,
    resolvedComponents,
    proposedSourceFiles: resolvedComponents,
    acceptanceCriteria,
    executionProvider: options.engineId || 'codex',
    executionMode: 'real',
    targetEnvironment: 'staging',
  });

  // 5d. Validate contract readiness — block execution if not ready
  const readiness = await validateContractReadiness(contract);
  if (!readiness.ready) {
    const blockerMessages = readiness.blockers.map(b => `${b.reason}: ${b.detail}`);
    return {
      success: false,
      executionRef: null,
      error: `Execution contract validation failed. ${blockerMessages.join('; ')}`,
      eligibility,
      result: null,
    };
  }

  // 6. Create execution record
  let execution: EngineeringExecution;
  try {
    execution = await createExecution({
      ewo_id: ewoId,
      implementation_provider: options.engineId || 'codex',
      engineer: options.actor || 'Product Owner',
    });
  } catch (e) {
    return {
      success: false,
      executionRef: null,
      error: `Failed to create execution session: ${e instanceof Error ? e.message : 'Unknown error'}`,
      eligibility,
      result: null,
    };
  }

  // 7. Invoke the orchestrator
  const config: OrchestratorConfig = {
    executionId: execution.id,
    ewoId,
    targetId: eligibility.targetInfo.id,
    engineId: options.engineId || 'codex',
    actor: options.actor || 'Product Owner',
    autoDeployStaging: false,
    autoVerify: true,
  };

  try {
    const result = await executeWorkOrder(config, (stage, status, detail) => {
      options.onProgress?.({ stage, status, detail });
    });

    return {
      success: result.success,
      executionRef: execution.execution_ref,
      error: result.failureReason,
      eligibility,
      result,
    };
  } catch (e) {
    return {
      success: false,
      executionRef: execution.execution_ref,
      error: `Execution pipeline failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
      eligibility,
      result: null,
    };
  }
}

// ─── Governed Failure Message Generator ──────────────────────────────────────

export function generateGovernedFailureMessage(error: string): {
  title: string;
  explanation: string;
  lifecycleState: string;
  recommendedAction: string;
} {
  const lower = error.toLowerCase();

  if (lower.includes('engineering plan') || lower.includes('engineering package')) {
    return {
      title: 'Missing Engineering Plan',
      explanation: 'Execution cannot begin because no approved Engineering Package was found for this work order.',
      lifecycleState: 'The EWO must have an Engineering Package with status "approved" before execution can begin.',
      recommendedAction: 'Create and approve an Engineering Package for this EWO, then retry Begin Engineering Execution.',
    };
  }

  if (lower.includes('engineering review')) {
    return {
      title: 'Missing Engineering Review',
      explanation: 'Execution cannot begin because no approved Engineering Review was found for this work order.',
      lifecycleState: 'The EWO must have an Engineering Review with status "approved" linked via metadata before execution can begin.',
      recommendedAction: 'Complete an Engineering Review with status "approved" for this EWO, then retry.',
    };
  }

  if (lower.includes('product owner') && (lower.includes('approval') || lower.includes('execution'))) {
    return {
      title: 'Missing Product Owner Execution Approval',
      explanation: 'Execution cannot begin because no Product Owner approval to begin engineering execution has been recorded.',
      lifecycleState: 'The EWO must have a recorded PO execution approval (ewo_execution_approvals) before execution can begin. This is distinct from post-verification PO acceptance.',
      recommendedAction: 'Record Product Owner approval to begin engineering execution for this EWO, then retry.',
    };
  }

  if (lower.includes('active execution session') || lower.includes('already exists')) {
    return {
      title: 'Existing Execution Session',
      explanation: 'An active execution session already exists for this Engineering Work Order.',
      lifecycleState: 'Only one active execution session is permitted per EWO at any time.',
      recommendedAction: 'View or resume the existing execution session in the Execution Workspace.',
    };
  }

  if (lower.includes('execution target') || lower.includes('target')) {
    return {
      title: 'Missing Execution Target',
      explanation: 'No valid execution target is available for this work order.',
      lifecycleState: 'An active execution target with a valid repository and branch strategy is required.',
      recommendedAction: 'Configure an active execution target with a valid repository and branch strategy, then retry.',
    };
  }

  if (lower.includes('repository') || lower.includes('unavailable')) {
    return {
      title: 'Repository Unavailable',
      explanation: 'The target repository could not be reached or is unavailable for execution.',
      lifecycleState: 'Execution paused — repository access is required to proceed.',
      recommendedAction: 'Verify repository connectivity and permissions, then retry the execution.',
    };
  }

  if (lower.includes('cancelled')) {
    return {
      title: 'Execution Cancelled',
      explanation: 'The execution was cancelled before completion.',
      lifecycleState: 'The execution session is in a cancelled state.',
      recommendedAction: 'Review the cancellation reason, address any issues, and start a new execution if appropriate.',
    };
  }

  if (lower.includes('closed')) {
    return {
      title: 'Work Order Closed',
      explanation: 'Execution is unavailable because the Engineering Work Order is closed.',
      lifecycleState: 'Closed work orders cannot be executed.',
      recommendedAction: 'Reopen the work order or create a new one if further engineering is required.',
    };
  }

  if (lower.includes('already') && (lower.includes('executed') || lower.includes('completed'))) {
    return {
      title: 'Already Implemented',
      explanation: 'Engineering has already been implemented for this work order.',
      lifecycleState: 'The EWO implementation status indicates completion.',
      recommendedAction: 'View the completed implementation or create a new EWO for additional work.',
    };
  }

  return {
    title: 'Execution Failed',
    explanation: error,
    lifecycleState: 'The execution did not complete successfully.',
    recommendedAction: 'Review the error details and retry the execution after addressing the identified issues.',
  };
}
