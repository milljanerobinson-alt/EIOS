/**
 * EWO-030: OpenAI Codex Provider Adapter
 *
 * Translates between the canonical EIOS execution request/response and
 * the OpenAI Codex API format. All OpenAI-specific logic is isolated here.
 */

import type {
  CodexExecutionRequest,
  CodexExecutionResult,
  CodexFileChange,
  CodexCommandResult,
  CodexTestResult,
  CodexAcceptanceCriterion,
  CodexCostEstimate,
  CodexActualUsage,
  CodexCostActual,
  CodexPricingSnapshot,
  CodexProviderDiagnostics,
  CodexRuntimeDiagnostics,
  CodexConstitutionalCompliance,
  CodexExecutionAttempt,
} from './codexTypes';
import { codexBudgetService } from './codexBudgetService';
import { supabase } from '../supabase';

const CODEX_API_BASE = 'https://api.openai.com/v1';
const CODEX_DEFAULT_MODEL = 'gpt-4o';

interface CodexApiResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cached_tokens?: number;
  };
}

interface CodexStructuredOutput {
  files_created: CodexFileChange[];
  files_modified: CodexFileChange[];
  files_deleted: string[];
  commands_executed: CodexCommandResult[];
  tests_executed: CodexTestResult[];
  implementation_notes: string;
  deviations_from_plan: string[];
  unresolved_issues: string[];
  acceptance_criteria_status: CodexAcceptanceCriterion[];
}

export class CodexProviderAdapter {
  readonly providerId = 'codex';
  readonly providerName = 'OpenAI Codex Execution Provider';
  readonly providerVersion = '1.0.0';

  /**
   * Build the OpenAI Codex API request from the canonical EIOS execution request.
   */
  buildApiRequest(
    request: CodexExecutionRequest,
    credentialReference: string,
    model: string,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const systemPrompt = this.buildSystemPrompt(request);
    const userPrompt = this.buildUserPrompt(request);

    const body = JSON.stringify({
      model: model || CODEX_DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: request.token_budget || 16384,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    return {
      url: `${CODEX_API_BASE}/chat/completions`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentialReference}`,
      },
      body,
    };
  }

  /**
   * Translate the OpenAI Codex API response into the canonical EIOS execution result.
   */
  translateResponse(
    apiResponse: CodexApiResponse,
    request: CodexExecutionRequest,
    pricingSnapshot: CodexPricingSnapshot,
    auditRef: string,
  ): CodexExecutionResult {
    const content = apiResponse.choices?.[0]?.message?.content || '{}';
    let structured: CodexStructuredOutput;
    try {
      structured = JSON.parse(content) as CodexStructuredOutput;
    } catch {
      structured = {
        files_created: [],
        files_modified: [],
        files_deleted: [],
        commands_executed: [],
        tests_executed: [],
        implementation_notes: 'Failed to parse structured output from Codex response.',
        deviations_from_plan: ['Malformed structured output from provider'],
        unresolved_issues: ['Provider returned non-JSON response'],
        acceptance_criteria_status: [],
      };
    }

    const actualInputTokens = apiResponse.usage?.prompt_tokens || 0;
    const actualCachedTokens = apiResponse.usage?.cached_tokens || 0;
    const actualOutputTokens = apiResponse.usage?.completion_tokens || 0;

    const actualCostUsd = this.computeCost(
      actualInputTokens,
      actualCachedTokens,
      actualOutputTokens,
      pricingSnapshot,
    );

    const estimatedCost = this.estimateCost(request, pricingSnapshot);

    return {
      execution_id: request.execution_id,
      provider: 'codex',
      provider_version: this.providerVersion,
      model_used: apiResponse.model || CODEX_DEFAULT_MODEL,
      execution_status: 'success',
      files_created: structured.files_created || [],
      files_modified: structured.files_modified || [],
      files_deleted: structured.files_deleted || [],
      commands_executed: structured.commands_executed || [],
      tests_executed: structured.tests_executed || [],
      implementation_notes: structured.implementation_notes || '',
      deviations_from_plan: structured.deviations_from_plan || [],
      unresolved_issues: structured.unresolved_issues || [],
      acceptance_criteria_status: structured.acceptance_criteria_status || [],
      estimated_cost: estimatedCost,
      actual_usage: {
        actual_input_tokens: actualInputTokens,
        actual_cached_input_tokens: actualCachedTokens,
        actual_output_tokens: actualOutputTokens,
      },
      actual_cost: {
        actual_cost_usd: actualCostUsd,
        cost_variance_usd: actualCostUsd - estimatedCost.estimated_cost_usd,
      },
      retry_count: 0,
      provider_diagnostics: {
        provider_id: this.providerId,
        provider_name: this.providerName,
        model_used: apiResponse.model || CODEX_DEFAULT_MODEL,
        api_response_time_ms: null,
        rate_limit_remaining: null,
        rate_limit_reset_at: null,
        provider_health: 'healthy',
        diagnostic_confidence: 1.0,
      },
      runtime_diagnostics: {
        request_id: auditRef,
        detected_intent: 'codex_execution',
        services_invoked: ['openai_codex_api', 'execution_provider_registry', 'codex_budget_config'],
        pipeline_stages_completed: [],
        provider_records_examined: 1,
        unavailable_fields: [],
        diagnostic_confidence: 1.0,
        lifecycle_change_performed: false,
        generated_timestamp: new Date().toISOString(),
        audit_reference: auditRef,
      },
      constitutional_compliance_result: {
        compliant: true,
        amendments_checked: [],
        violations: [],
        warnings: [],
      },
      audit_reference: auditRef,
      completion_package_reference: null,
    };
  }

  /**
   * Compute the cost of a Codex execution based on token usage and pricing.
   */
  computeCost(
    inputTokens: number,
    cachedTokens: number,
    outputTokens: number,
    pricing: CodexPricingSnapshot,
  ): number {
    const inputCost = (inputTokens / 1_000_000) * pricing.input_token_price_per_1m;
    const cachedCost = (cachedTokens / 1_000_000) * pricing.cached_input_token_price_per_1m;
    const outputCost = (outputTokens / 1_000_000) * pricing.output_token_price_per_1m;
    return Math.round((inputCost + cachedCost + outputCost) * 1_000_000) / 1_000_000;
  }

  /**
   * Estimate the cost of a Codex execution before making the API call.
   */
  estimateCost(
    request: CodexExecutionRequest,
    pricing: CodexPricingSnapshot,
  ): CodexCostEstimate {
    const contextSize = this.estimateContextSize(request);
    const estimatedInputTokens = Math.ceil(contextSize * 0.75);
    const estimatedCachedTokens = Math.ceil(estimatedInputTokens * 0.5);
    const estimatedOutputTokens = Math.min(request.token_budget || 16384, 8192);

    const estimatedCostUsd = this.computeCost(
      estimatedInputTokens,
      estimatedCachedTokens,
      estimatedOutputTokens,
      pricing,
    );

    return {
      estimated_input_tokens: estimatedInputTokens,
      estimated_cached_input_tokens: estimatedCachedTokens,
      estimated_output_tokens: estimatedOutputTokens,
      estimated_cost_usd: estimatedCostUsd,
      pricing_snapshot: pricing,
    };
  }

  /**
   * Estimate the context size in tokens from the execution request.
   */
  estimateContextSize(request: CodexExecutionRequest): number {
    const contextStr = JSON.stringify(request.context_package || {});
    const instructionsLen = request.task_objective.length + request.scope.length;
    const constraintsLen = request.acceptance_criteria.join(' ').length +
      request.architectural_constraints.join(' ').length +
      request.governance_constraints.join(' ').length;
    const totalChars = contextStr.length + instructionsLen + constraintsLen;
    return Math.ceil(totalChars / 4);
  }

  /**
   * Build the system prompt for the Codex API call.
   */
  private buildSystemPrompt(request: CodexExecutionRequest): string {
    const parts: string[] = [
      'You are a governed software engineering execution provider operating within EIOS.',
      'You must follow all governance constraints, repository controls, and command restrictions.',
      'You must return your response as a JSON object with the following structure:',
      '{',
      '  "files_created": [{"path": "", "action": "create", "content": "", "diff_summary": "", "lines_added": 0, "lines_removed": 0}],',
      '  "files_modified": [{"path": "", "action": "modify", "content": "", "diff_summary": "", "lines_added": 0, "lines_removed": 0}],',
      '  "files_deleted": [],',
      '  "commands_executed": [{"command": "", "classification": "allowed", "exit_code": 0, "output": "", "was_authorised": true, "execution_status": "executed"}],',
      '  "tests_executed": [{"test_name": "", "test_suite": "", "passed": true, "output": "", "duration_ms": 0}],',
      '  "implementation_notes": "",',
      '  "deviations_from_plan": [],',
      '  "unresolved_issues": [],',
      '  "acceptance_criteria_status": [{"criterion": "", "satisfied": true, "evidence": ""}]',
      '}',
      '',
      'CRITICAL: The "content" field in files_created and files_modified MUST contain the COMPLETE file contents',
      'of the file after your changes are applied. Do not provide diffs or summaries in the content field —',
      'provide the full, ready-to-write file content. The repository application service will write this',
      'content directly to the file system.',
      '',
      `EWO Reference: ${request.ewo_ref}`,
      `Environment: ${request.environment}`,
      `Repository: ${request.repository_ref}`,
      `Branch: ${request.branch_ref}`,
      '',
      'Governance Constraints:',
      ...request.governance_constraints.map(c => `- ${c}`),
      '',
      'Architectural Constraints:',
      ...request.architectural_constraints.map(c => `- ${c}`),
      '',
      'Permitted Files:',
      ...request.permitted_files.map(f => `- ${f}`),
      '',
      'Restricted Files (DO NOT ACCESS):',
      ...request.restricted_files.map(f => `- ${f}`),
      '',
      'Permitted Commands:',
      ...request.permitted_commands.map(c => `- ${c}`),
      '',
      'Restricted Commands (DO NOT EXECUTE):',
      ...request.restricted_commands.map(c => `- ${c}`),
    ];
    return parts.join('\n');
  }

  /**
   * Build the user prompt for the Codex API call.
   */
  private buildUserPrompt(request: CodexExecutionRequest): string {
    const parts: string[] = [
      `Task Objective: ${request.task_objective}`,
      '',
      `Scope: ${request.scope}`,
      '',
      'Acceptance Criteria:',
      ...request.acceptance_criteria.map(c => `- ${c}`),
      '',
      'Context Package:',
      '```json',
      JSON.stringify(request.context_package, null, 2),
      '```',
    ];
    return parts.join('\n');
  }

  /**
   * Classify a failure from the Codex API into a deterministic failure type.
   */
  classifyFailure(
    error: { status?: number; message: string },
  ): CodexExecutionAttempt['attempt_status'] {
    if (error.status === 401 || error.status === 403) return 'auth_failed';
    if (error.status === 429) return 'rate_limited';
    if (error.message?.includes('timeout')) return 'timeout';
    if (error.message?.includes('budget')) return 'budget_exhausted';
    if (error.message?.includes('governance')) return 'governance_rejected';
    if (error.message?.includes('safety')) return 'safety_rejected';
    if (error.message?.includes('contract')) return 'contract_violation';
    return 'failed';
  }
}

export const codexAdapter = new CodexProviderAdapter();
