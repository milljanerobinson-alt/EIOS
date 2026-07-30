// EWO-033 — Execution Contract Service
//
// The governed Execution Contract sits between Product Owner approval and
// execution. It captures the full execution intent and validates readiness
// before any provider is invoked.
//
// Flow: PO Approval → Allocate EWO → Create EWO → Generate Package →
//       Resolve Components → Generate Acceptance Criteria →
//       Display & Validate Execution Contract → Prepare → Execute

import { supabase } from './supabase';
import type { AcceptanceCriteriaSet } from './acceptanceCriteriaService';

export type ExecutionMode = 'real' | 'simulation' | 'dry_run';

export interface ExecutionContract {
  contract_ref: string;
  ewo_uuid: string;
  ewo_ref: string;
  original_po_request: string;
  engineering_objective: string;
  implementation_scope: string;
  excluded_scope: string;
  resolved_components: string[];
  proposed_source_files: string[];
  acceptance_criteria: AcceptanceCriteriaSet;
  execution_provider: string;
  execution_mode: ExecutionMode;
  target_environment: string;
  verification_plan: string;
  unresolved_risks: string[];
  clarification_requirements: string[];
  readiness_result: ContractReadinessResult;
  created_at: string;
}

export interface ContractReadinessResult {
  ready: boolean;
  blockers: ContractBlocker[];
  warnings: string[];
}

export interface ContractBlocker {
  reason: string;
  detail: string;
  recovery_action: string;
}

/**
 * Builds an Execution Contract from the EWO and resolved components.
 */
export async function buildExecutionContract(params: {
  ewoId: string;
  ewoRef: string;
  originalRequest: string;
  engineeringObjective: string;
  implementationScope?: string;
  excludedScope?: string;
  resolvedComponents: string[];
  proposedSourceFiles: string[];
  acceptanceCriteria: AcceptanceCriteriaSet;
  executionProvider: string;
  executionMode?: ExecutionMode;
  targetEnvironment?: string;
}): Promise<ExecutionContract> {
  const contractRef = `EC-${Date.now().toString(36).toUpperCase()}`;
  const ts = new Date().toISOString();

  return {
    contract_ref: contractRef,
    ewo_uuid: params.ewoId,
    ewo_ref: params.ewoRef,
    original_po_request: params.originalRequest,
    engineering_objective: params.engineeringObjective,
    implementation_scope: params.implementationScope || params.engineeringObjective,
    excluded_scope: params.excludedScope || 'No scope exclusions defined',
    resolved_components: params.resolvedComponents,
    proposed_source_files: params.proposedSourceFiles,
    acceptance_criteria: params.acceptanceCriteria,
    execution_provider: params.executionProvider,
    execution_mode: params.executionMode || 'real',
    target_environment: params.targetEnvironment || 'production',
    verification_plan: `Verify against ${params.acceptanceCriteria.criteria.length} acceptance criteria. UI changes require source assertion + build + render verification. Generic build success does not satisfy outcome-specific criteria.`,
    unresolved_risks: [],
    clarification_requirements: [],
    readiness_result: { ready: false, blockers: [], warnings: [] },
    created_at: ts,
  };
}

/**
 * Validates execution contract readiness. Blocks execution when any
 * required condition is not met.
 */
export async function validateContractReadiness(contract: ExecutionContract): Promise<ContractReadinessResult> {
  const blockers: ContractBlocker[] = [];
  const warnings: string[] = [];

  // 1. EWO must exist and be non-terminal
  const { data: ewo } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, status, title, executive_summary')
    .eq('id', contract.ewo_uuid)
    .maybeSingle();

  if (!ewo) {
    blockers.push({
      reason: 'EWO not found',
      detail: `No engineering_work_orders record with id = ${contract.ewo_uuid}`,
      recovery_action: 'Create the EWO before building the contract.',
    });
  } else {
    // Check intent preservation: original request must match EWO
    if (contract.original_po_request && ewo.title && !ewo.title.toLowerCase().includes(contract.original_po_request.slice(0, 20).toLowerCase())) {
      // Only warn if the EWO title doesn't contain the beginning of the request
      // The title may be a summarized version, so this is a warning not a blocker
      warnings.push(`EWO title "${ewo.title}" may not fully preserve the original request. Verify intent is captured in executive_summary.`);
    }

    // Check terminal states
    const terminalStates = ['closed', 'archived', 'cancelled', 'superseded'];
    if (terminalStates.includes(ewo.status)) {
      blockers.push({
        reason: 'EWO is in a terminal state',
        detail: `EWO ${contract.ewo_ref} has status "${ewo.status}" — terminal EWOs cannot be executed.`,
        recovery_action: 'Create a new EWO if further engineering is required.',
      });
    }
  }

  // 2. EWO reference must be valid (canonical numeric format)
  if (!contract.ewo_ref || !contract.ewo_ref.match(/^EWO-\d+$/)) {
    blockers.push({
      reason: 'Invalid EWO reference',
      detail: `EWO reference "${contract.ewo_ref}" is not in canonical numeric format (EWO-NNN).`,
      recovery_action: 'Allocate a canonical EWO reference using the atomic allocator.',
    });
  }

  // 3. Engineering Package must exist
  const { data: pkg } = await supabase
    .from('ewo_engineering_packages')
    .select('id, package_status')
    .eq('ewo_id', contract.ewo_uuid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pkg) {
    blockers.push({
      reason: 'Engineering Package missing',
      detail: 'No engineering package found for this EWO.',
      recovery_action: 'Generate and approve an Engineering Package before execution.',
    });
  } else if (pkg.package_status !== 'approved') {
    warnings.push(`Engineering package status is "${pkg.package_status}" — should be "approved" before execution.`);
  }

  // 4. At least one component must be resolved
  if (contract.resolved_components.length === 0) {
    blockers.push({
      reason: 'No components resolved',
      detail: 'Component resolution did not identify any target source files.',
      recovery_action: 'Provide explicit file paths or clarify the target component.',
    });
  }

  // 5. Execution mode must not be simulation-only
  if (contract.execution_mode === 'simulation') {
    blockers.push({
      reason: 'Simulation-only execution',
      detail: 'Execution mode is "simulation" — simulated execution cannot produce real implementation.',
      recovery_action: 'Set execution mode to "real" and configure a real implementation provider.',
    });
  }

  // 6. Acceptance criteria must be present
  if (!contract.acceptance_criteria || contract.acceptance_criteria.criteria.length === 0) {
    blockers.push({
      reason: 'Acceptance criteria missing',
      detail: 'No acceptance criteria have been generated for this execution.',
      recovery_action: 'Generate acceptance criteria from the approved Product Owner request before execution.',
    });
  }

  // 7. Verification methods must be defined
  const hasVerification = contract.acceptance_criteria?.criteria.some(c => c.verification_method !== undefined);
  if (!hasVerification) {
    blockers.push({
      reason: 'Verification methods missing',
      detail: 'Acceptance criteria lack verification methods.',
      recovery_action: 'Ensure each acceptance criterion has a defined verification method.',
    });
  }

  // 8. Target environment must be available
  if (!contract.target_environment) {
    blockers.push({
      reason: 'Target environment unavailable',
      detail: 'No target environment specified.',
      recovery_action: 'Configure a target environment for execution.',
    });
  }

  // 9. No other EWO should have entered the interaction context
  // (Checked at the orchestrator level — this is a contract-level validation)

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
  };
}
