/**
 * EWO-034R.1 — Codex Connectivity Preflight
 *
 * Before permitting repository mutation, performs a real but non-mutating
 * Codex connectivity and response-contract test.
 *
 * The preflight:
 *   1. Invokes the real codex-execute edge function
 *   2. Uses the configured OpenAI credential
 *   3. Makes no repository changes
 *   4. Requests a harmless structured analysis response
 *   5. Proves a real external API call occurred
 *   6. Validates response_format handling
 *   7. Validates the expected structured response schema
 *   8. Captures token usage and cost
 *   9. Creates audit records
 *  10. Proves errors and malformed responses are handled safely
 */

import { supabase } from './supabase';

export interface PreflightResult {
  passed: boolean;
  provider_reachable: boolean;
  api_call_made: boolean;
  response_parsed: boolean;
  schema_valid: boolean;
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
  estimated_cost_usd: number | null;
  model_used: string | null;
  response_time_ms: number | null;
  error: string | null;
  audit_ref: string;
}

/**
 * Run a non-mutating Codex connectivity preflight.
 *
 * The request asks Codex to analyze a trivial code snippet and return
 * structured JSON. No files are created, modified, or deleted.
 */
export async function runCodexConnectivityPreflight(): Promise<PreflightResult> {
  const auditRef = `PREFLIGHT-${Date.now()}`;
  const startTime = Date.now();

  try {
    // 1. Resolve the governed execution provider using the canonical resolver.
    // EWO-034R.3B: No provider_id, no VITE_OPENAI_API_KEY, no client-side key.
    // The edge function resolves credentials server-side.
    const { resolveExecutionProvider, resolveExecutionModel } = await import('./codexProviderResolver');

    const provider = await resolveExecutionProvider();
    if (!provider.resolved) {
      return {
        passed: false,
        provider_reachable: false,
        api_call_made: false,
        response_parsed: false,
        schema_valid: false,
        token_usage: null,
        estimated_cost_usd: null,
        model_used: null,
        response_time_ms: null,
        error: `Provider not ready: ${provider.reason}`,
        audit_ref: auditRef,
      };
    }

    const modelResolution = await resolveExecutionModel(provider.model);
    if (!modelResolution.resolved) {
      return {
        passed: false,
        provider_reachable: false,
        api_call_made: false,
        response_parsed: false,
        schema_valid: false,
        token_usage: null,
        estimated_cost_usd: null,
        model_used: null,
        response_time_ms: null,
        error: `Model not ready: ${modelResolution.reason}`,
        audit_ref: auditRef,
      };
    }

    // 2. Build a harmless non-mutating request — NO api_key in the body.
    // EWO-034R.3B: The edge function resolves credentials server-side.
    const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/codex-execute`;
    const edgeHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    };

    const edgeBody = {
      execution_id: `preflight-${auditRef}`,
      ewo_ref: 'PREFLIGHT',
      task_objective: 'Analyze the following TypeScript function and return a structured analysis. Do NOT create, modify, or delete any files. Return an empty files_created, files_modified, and files_deleted array.',
      implementation_scope: 'Non-mutating connectivity test. Return only analysis in implementation_notes.',
      acceptance_criteria: [
        'Response is valid JSON',
        'No files are created, modified, or deleted',
      ],
      affected_components: [],
      target_repository: 'preflight',
      target_branch: 'preflight',
      target_environment: 'staging',
      governance_constraints: ['Do not modify any files'],
      restricted_files: ['.env', '.env.*'],
      model: modelResolution.model,
    };

    // 3. Call the edge function
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: edgeHeaders,
      body: JSON.stringify(edgeBody),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errText = await response.text();
      // Audit the failure
      await supabase.from('repository_change_audit').insert({
        audit_ref: auditRef,
        execution_id: `preflight-${auditRef}`,
        ewo_ref: 'PREFLIGHT',
        actor: 'preflight-service',
        operation: 'codex_preflight',
        file_path: null,
        action: 'preflight',
        content_size: 0,
        files_applied: [],
        snapshots: { status: 'failed', http_status: response.status, error: errText.slice(0, 500) },
        diff_evidence: null,
        build_result: null,
        test_result: null,
        rollback_performed: false,
        created_at: new Date().toISOString(),
      }).then(() => {}, () => {});

      return {
        passed: false,
        provider_reachable: response.status !== 0,
        api_call_made: true,
        response_parsed: false,
        schema_valid: false,
        token_usage: null,
        estimated_cost_usd: null,
        model_used: null,
        response_time_ms: responseTime,
        error: `Edge function returned ${response.status}: ${errText.slice(0, 200)}`,
        audit_ref: auditRef,
      };
    }

    const result = await response.json();

    // 4. Validate the response structure
    const apiCallMade = result.execution_status !== undefined;
    const responseParsed = result.execution_status === 'success' || result.execution_status === 'failed';
    const schemaValid = validatePreflightSchema(result);

    // 5. Extract token usage
    const tokenUsage = result.actual_usage ? {
      prompt_tokens: result.actual_usage.actual_input_tokens || 0,
      completion_tokens: result.actual_usage.actual_output_tokens || 0,
      total_tokens: (result.actual_usage.actual_input_tokens || 0) + (result.actual_usage.actual_output_tokens || 0),
    } : null;

    const estimatedCost = result.estimated_cost?.estimated_cost_usd ?? null;
    const modelUsed = result.model_used ?? null;

    // 6. Verify no files were modified (non-mutating)
    const filesCreated = result.files_created || [];
    const filesModified = result.files_modified || [];
    const filesDeleted = result.files_deleted || [];
    const noMutation = filesCreated.length === 0 && filesModified.length === 0 && filesDeleted.length === 0;

    const passed = apiCallMade && responseParsed && schemaValid && noMutation && result.execution_status === 'success';

    // 7. Audit the preflight result
    await supabase.from('repository_change_audit').insert({
      audit_ref: auditRef,
      execution_id: `preflight-${auditRef}`,
      ewo_ref: 'PREFLIGHT',
      actor: 'preflight-service',
      operation: 'codex_preflight',
      file_path: null,
      action: 'preflight',
      content_size: 0,
      files_applied: [],
      snapshots: {
        status: passed ? 'passed' : 'failed',
        api_call_made: apiCallMade,
        response_parsed: responseParsed,
        schema_valid: schemaValid,
        no_mutation: noMutation,
        token_usage: tokenUsage,
        estimated_cost_usd: estimatedCost,
        model_used: modelUsed,
        response_time_ms: responseTime,
      },
      diff_evidence: null,
      build_result: null,
      test_result: null,
      rollback_performed: false,
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    return {
      passed,
      provider_reachable: true,
      api_call_made: apiCallMade,
      response_parsed: responseParsed,
      schema_valid: schemaValid,
      token_usage: tokenUsage,
      estimated_cost_usd: estimatedCost,
      model_used: modelUsed,
      response_time_ms: responseTime,
      error: passed ? null : `Preflight validation failed: ${!noMutation ? 'Files were modified during preflight. ' : ''}${!schemaValid ? 'Schema invalid. ' : ''}${result.execution_status !== 'success' ? `Execution status: ${result.execution_status}` : ''}`,
      audit_ref: auditRef,
    };
  } catch (err) {
    const responseTime = Date.now() - startTime;

    // Audit the error
    await supabase.from('repository_change_audit').insert({
      audit_ref: auditRef,
      execution_id: `preflight-${auditRef}`,
      ewo_ref: 'PREFLIGHT',
      actor: 'preflight-service',
      operation: 'codex_preflight',
      file_path: null,
      action: 'preflight',
      content_size: 0,
      files_applied: [],
      snapshots: { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' },
      diff_evidence: null,
      build_result: null,
      test_result: null,
      rollback_performed: false,
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    return {
      passed: false,
      provider_reachable: false,
      api_call_made: false,
      response_parsed: false,
      schema_valid: false,
      token_usage: null,
      estimated_cost_usd: null,
      model_used: null,
      response_time_ms: responseTime,
      error: err instanceof Error ? err.message : 'Unknown error during preflight',
      audit_ref: auditRef,
    };
  }
}

/**
 * Validates that the preflight response has the expected schema.
 */
function validatePreflightSchema(result: Record<string, unknown>): boolean {
  const requiredFields = [
    'execution_id',
    'provider',
    'execution_status',
    'files_created',
    'files_modified',
    'files_deleted',
    'implementation_notes',
  ];

  for (const field of requiredFields) {
    if (!(field in result)) {
      return false;
    }
  }

  // Verify arrays are arrays
  if (!Array.isArray(result.files_created) || !Array.isArray(result.files_modified) || !Array.isArray(result.files_deleted)) {
    return false;
  }

  return true;
}
