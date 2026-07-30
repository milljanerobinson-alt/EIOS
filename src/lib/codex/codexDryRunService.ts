/**
 * EWO-030: Codex Dry-Run Simulation
 *
 * Read-only execution simulation that validates the execution package,
 * governance, provider eligibility, credentials, and budget — without
 * calling Codex or consuming paid API tokens.
 */

import { supabase } from '../supabase';
import { validateCredential } from './codexCredentialService';
import { getBudgetConfig, getPricingSnapshot, validateBudget } from './codexBudgetService';
import { classifyCommand, getDefaultRepositoryControls, validateFileChanges } from './codexControlsService';
import { codexAdapter } from './codexAdapter';
import type { CodexExecutionRequest, CodexDryRunResult } from './codexTypes';

/**
 * Perform a dry-run simulation of a Codex execution.
 * This does NOT call the Codex API and consumes zero paid tokens.
 */
export async function performDryRun(
  request: CodexExecutionRequest,
  environment: string,
): Promise<CodexDryRunResult> {
  // 1. Validate execution package
  const packageErrors = validateExecutionPackage(request);
  const executionPackageValid = packageErrors.length === 0;

  // 2. Validate governance
  const governanceErrors = validateGovernance(request);
  const governanceValid = governanceErrors.length === 0;

  // 3. Check provider eligibility
  const { data: provider } = await supabase
    .from('execution_provider_registry')
    .select('*')
    .eq('provider_id', 'codex')
    .maybeSingle();
  const providerEligible = provider !== null && provider.is_governed === true;

  // 4. Check credential status
  const credentialValidation = await validateCredential(environment);
  const credentialStatus = credentialValidation.valid ? 'valid' : credentialValidation.status as 'configured' | 'invalid' | 'unavailable';

  // 5. Get selected model — EWO-034R.3B: standardised model resolution
  const { resolveExecutionModel } = await import('../codexProviderResolver');
  const modelResolution = await resolveExecutionModel();
  const selectedModel = modelResolution.resolved ? modelResolution.model : 'gpt-4o';
  const modelSupported = modelResolution.resolved;

  // 6. Get supported operations
  const supportedOperations = (provider?.provider_config as { supported_operations?: string[] })?.supported_operations || [];

  // 7. Estimate context size and tokens
  const contextSize = codexAdapter.estimateContextSize(request);
  const estimatedInputTokens = Math.ceil(contextSize * 0.75);
  const estimatedCachedTokens = Math.ceil(estimatedInputTokens * 0.5);
  const estimatedOutputTokens = Math.min(request.token_budget || 16384, 8192);

  // 8. Get pricing and estimate cost
  const pricing = await getPricingSnapshot(environment);
  let estimatedCostUsd = 0;
  if (pricing) {
    estimatedCostUsd = codexAdapter.computeCost(estimatedInputTokens, estimatedCachedTokens, estimatedOutputTokens, pricing);
  }

  // 9. Validate budget
  const budgetValidation = await validateBudget(request, environment);
  const budgetStatus = budgetValidation.budget_status;

  // 10. Check for prohibited actions
  const prohibitedActionsDetected: string[] = [];
  const controls = getDefaultRepositoryControls(environment as 'staging' | 'production');

  // Check if any restricted files are in the request
  for (const restricted of request.restricted_files) {
    if (request.permitted_files.includes(restricted)) {
      prohibitedActionsDetected.push(`Restricted file in permitted list: ${restricted}`);
    }
  }

  // Check commands
  for (const cmd of request.permitted_commands) {
    const governance = classifyCommand(cmd, request.permitted_commands, request.restricted_commands);
    if (governance.classification === 'prohibited' || governance.classification === 'destructive' || governance.classification === 'deployment') {
      prohibitedActionsDetected.push(`Prohibited command in permitted list: ${cmd} (${governance.rejection_reason})`);
    }
  }

  // 11. Determine approval requirements
  const approvalRequirements: string[] = [];
  if (budgetStatus === 'approval_required') {
    approvalRequirements.push('Budget approval required (estimated cost exceeds approval threshold)');
  }
  if (request.po_approval_state !== 'approved') {
    approvalRequirements.push('Product Owner approval required');
  }
  if (environment === 'production') {
    approvalRequirements.push('Production environment approval required');
  }

  return {
    execution_package_valid: executionPackageValid,
    governance_valid: governanceValid,
    provider_eligible: providerEligible,
    credential_status: credentialStatus as 'configured' | 'valid' | 'invalid' | 'unavailable',
    selected_model: selectedModel,
    supported_operations: supportedOperations,
    estimated_context_size: contextSize,
    estimated_input_tokens: estimatedInputTokens,
    estimated_cached_input_tokens: estimatedCachedTokens,
    estimated_output_tokens: estimatedOutputTokens,
    estimated_cost_usd: estimatedCostUsd,
    budget_status: budgetStatus,
    approval_requirements: approvalRequirements,
    prohibited_actions_detected: prohibitedActionsDetected,
    execution_diagnostics: {
      package_errors: packageErrors,
      governance_errors: governanceErrors,
      budget_validation: {
        within_limits: budgetValidation.within_limits,
        per_execution_limit: budgetValidation.per_execution_limit,
        per_ewo_limit: budgetValidation.per_ewo_limit,
        ewo_accumulated_cost: budgetValidation.ewo_accumulated_cost,
      },
      credential_detail: credentialValidation.detail,
      pricing_available: pricing !== null,
      provider_active: provider?.is_active || false,
    },
    paid_tokens_consumed: 0,
  };
}

function validateExecutionPackage(request: CodexExecutionRequest): string[] {
  const errors: string[] = [];
  if (!request.execution_id) errors.push('Missing execution_id');
  if (!request.ewo_ref) errors.push('Missing ewo_ref');
  if (!request.repository_ref) errors.push('Missing repository_ref');
  if (!request.branch_ref) errors.push('Missing branch_ref');
  if (!request.task_objective) errors.push('Missing task_objective');
  if (!request.scope) errors.push('Missing scope');
  if (request.acceptance_criteria.length === 0) errors.push('Missing acceptance_criteria');
  if (request.po_approval_state !== 'approved') errors.push('PO approval state is not approved');
  return errors;
}

function validateGovernance(request: CodexExecutionRequest): string[] {
  const errors: string[] = [];
  if (request.governance_constraints.length === 0) errors.push('No governance constraints specified');
  if (request.restricted_files.length === 0) errors.push('No restricted files specified (all files are unrestricted)');
  return errors;
}
