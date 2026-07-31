/**
 * EWO-044R1 — Codex-Native ATD Conversation Engine
 *
 * Conversation Gateway (client-side orchestrator).
 *
 * This is the single entry point for all ATD conversations.
 * It orchestrates: governance interception → provider invocation (via adapter) → tool execution loop →
 * response validation → governance enforcement → audit → return ATD response.
 *
 * The gateway does NOT perform engineering reasoning.
 * It is an orchestration layer only.
 *
 * Every provider invocation passes through IExecutionProviderAdapter (server-side, via edge function).
 * Native provider tool/function calling is used — no prompt-based JSON tool simulation.
 */

import { supabase } from '../supabase';
import { interceptGovernanceCommand, governanceCommandToTool } from './governanceInterception';
import { getToolDefinitionsForProvider } from './toolRegistry';
import { executeTool, executeToolsInParallel, type ToolExecutionContext } from './toolServer';
import {
  validateProviderResponse,
  buildFallbackResponse,
  parseProviderResponse,
  type StructuredProviderResponse,
  type ProviderToolCall,
  type ProviderToolResult,
  type ProviderDiagnostics,
  type ProviderResponseType,
} from './providerContract';

function mapResponseTypeToOutcome(rt: ProviderResponseType): string {
  switch (rt) {
    case 'tool_error': return 'error';
    case 'governance_block': return 'governed_refusal';
    default: return 'success';
  }
}

// ─── Server-Side Authority Resolution ───────────────────────────────────────
// EWO-044R6: Never trust client-declared userRole. Resolve role, tenant, and
// project from the server via the canonical edge function.

interface ServerAuthority {
  userId: string;
  role: string;
  tenantId: string | null;
  projectId: string | null;
  ewoRef: string | null;
}

async function resolveServerAuthority(req: GatewayRequest): Promise<Partial<ServerAuthority>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/atd-conversation-gateway`;
    const resp = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: 'resolve_context',
        conversation_id: req.conversationId,
        hint_project_id: req.projectId,
        hint_ewo_ref: req.ewoRef,
      }),
    });
    if (!resp.ok) return {};
    const data = await resp.json() as { context?: { tenant_id?: string; user_id?: string; role?: string; project_id?: string; ewo_ref?: string } };
    return {
      userId: data.context?.user_id,
      role: data.context?.role,
      tenantId: data.context?.tenant_id ?? null,
      projectId: data.context?.project_id ?? null,
      ewoRef: data.context?.ewo_ref ?? null,
    };
  } catch {
    return {};
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GatewayRequest {
  message: string;
  conversationId: string;
  history: ConversationMessage[];
  userId: string;
  userRole: string;
  tenantId: string | null;
  projectId: string | null;
  ewoRef: string | null;
}

export interface GatewayResponse {
  success: boolean;
  response: StructuredProviderResponse;
  auditReference: string;
  conversationId: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_TOOL_LOOPS = 10;
const ATD_SYSTEM_PROMPT = `You are ATD — the Engineering Intelligence assistant for the EIOS platform.

You are the sole engineering intelligence in the conversation. You reason about engineering requests, analyse repositories, create plans, and determine which EIOS tools to invoke.

You have access to EIOS governed tools via native function calling. Use them to retrieve engineering context, inspect repositories, check EWO states, and propose lifecycle actions. Only request tools when you need information — do not call tools unnecessarily.

When the user asks you to create, approve, execute, cancel, or delete something, propose the action in your structured response. EIOS will validate and execute it through governed tools — you never mutate lifecycle directly.

CRITICAL: Your response MUST be a single valid JSON object — no markdown fences, no prose before or after the JSON.
The JSON object MUST conform exactly to this schema:

{
  "response_type": "read_only_answer" | "clarification_request" | "lifecycle_proposal" | "execution_proposal" | "tool_error" | "governance_block",
  "interpreted_request": "string — your understanding of what the user asked",
  "user_facing_message": "string — the message to display to the user",
  "referenced_project": string | null,
  "referenced_repository": string | null,
  "referenced_ewo": string | null,
  "proposed_action": "create_idea" | "create_ewo" | "prepare_execution" | "approve_execution" | "execute_ewo" | "cancel_execution" | "delete_ewo" | "record_acceptance" | "reject_execution" | null,
  "proposed_lifecycle_action": same as proposed_action | null,
  "clarification_required": boolean,
  "clarification_question": string | null,
  "confidence": number (0 to 1),
  "governance_check_required": boolean,
  "approval_required": boolean,
  "execution_required": boolean,
  "requested_tools": [],
  "tool_results": [],
  "warnings": [],
  "provider_diagnostics": {
    "provider": "string",
    "model": "string",
    "provider_version": "string",
    "routing_strategy": "string",
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "duration_ms": 0,
    "tool_calls_made": 0,
    "cache_hit": false
  }
}

When you have received tool results in the conversation, use them to answer the user's question. Do NOT call tools again — return your final structured JSON response immediately.

Be concise, helpful, and engineering-focused. You are talking to a Product Owner who wants to get engineering work done.`;

// ─── Gateway ──────────────────────────────────────────────────────────────────

export async function processConversation(req: GatewayRequest): Promise<GatewayResponse> {
  const auditRef = `EIOS-GW-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // EWO-044R6: Resolve authority server-side — never trust client-declared role.
  const serverContext = await resolveServerAuthority(req);
  const ctx: ToolExecutionContext = {
    conversationId: req.conversationId,
    userId: serverContext.userId ?? req.userId,
    userRole: serverContext.role ?? 'user',
    tenantId: serverContext.tenantId ?? req.tenantId,
    projectId: serverContext.projectId ?? req.projectId,
    ewoRef: serverContext.ewoRef ?? req.ewoRef,
  };

  // Phase 1: Deterministic governance interception
  const interception = interceptGovernanceCommand(req.message);
  if (interception.intercepted && interception.command && interception.ewoRef) {
    return await executeGovernanceCommand(interception.command, interception.ewoRef, ctx, auditRef, req);
  }

  // Phase 2: Invoke configured provider via adapter with native tool-calling loop
  const toolDefs = getToolDefinitionsForProvider();
  const messages = [
    ...req.history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: req.message },
  ];

  let toolResults: ProviderToolResult[] = [];
  let loopCount = 0;
  let diagnostics: Partial<ProviderDiagnostics> = {};
  const allRequestedTools: string[] = [];
  const allExecutedTools: string[] = [];

  while (loopCount < MAX_TOOL_LOOPS) {
    loopCount++;

    // Call the edge function which routes through IExecutionProviderAdapter
    const providerResponse = await invokeProviderViaAdapter({
      messages,
      tools: toolDefs,
      systemPrompt: ATD_SYSTEM_PROMPT,
      conversationId: req.conversationId,
      userId: req.userId,
      priorToolResults: toolResults.length > 0 ? toolResults : undefined,
    });

    diagnostics = mergeDiagnostics(diagnostics, providerResponse.diagnostics);

    if (providerResponse.kind === 'tool_calls' && providerResponse.toolCalls && providerResponse.toolCalls.length > 0) {
      // Phase 3: Execute requested tools (native tool calls from provider)
      for (const tc of providerResponse.toolCalls) {
        allRequestedTools.push(tc.tool);
      }
      const results = await executeToolsInParallel(providerResponse.toolCalls, ctx);
      for (const r of results) {
        allExecutedTools.push(r.tool);
      }
      toolResults = [...toolResults, ...results];

      // Add tool results to conversation for next provider iteration
      messages.push({
        role: 'assistant',
        content: JSON.stringify({ tool_calls: providerResponse.toolCalls }),
      });
      messages.push({
        role: 'user',
        content: 'Tool results:\n' + JSON.stringify(results),
      });
      continue;
    }

    // Phase 4: Parse and validate provider response
    if (providerResponse.kind === 'final_response') {
      const parsed = parseProviderResponse(providerResponse.content ?? '');
      if (!parsed) {
        const fallback = buildFallbackResponse(req.message, diagnostics, 'Failed to parse provider response as structured JSON.');
        await recordConversationAudit(req, fallback, auditRef, diagnostics, allRequestedTools, allExecutedTools, false);
        return {
          success: false,
          response: fallback,
          auditReference: auditRef,
          conversationId: req.conversationId,
        };
      }

      const validation = validateProviderResponse(parsed);
      if (!validation.valid) {
        const fallback = buildFallbackResponse(req.message, diagnostics, validation.errors.join('; '));
        await recordConversationAudit(req, fallback, auditRef, diagnostics, allRequestedTools, allExecutedTools, false);
        return {
          success: false,
          response: fallback,
          auditReference: auditRef,
          conversationId: req.conversationId,
        };
      }

      // Phase 5: Governance enforcement for proposed lifecycle actions
      const resp = parsed as StructuredProviderResponse;
      let governanceDecision = 'none';
      if (resp.proposed_lifecycle_action && resp.governance_check_required) {
        const toolName = lifecycleActionToTool(resp.proposed_lifecycle_action);
        if (toolName && resp.referenced_ewo) {
          allRequestedTools.push(toolName);
          const govResult = await executeTool(toolName, { ewo_ref: resp.referenced_ewo, conversation_id: req.conversationId }, ctx);
          allExecutedTools.push(toolName);
          if (!govResult.success && govResult.error) {
            resp.response_type = 'governance_block';
            resp.warnings.push(govResult.error.message);
            governanceDecision = 'blocked';
          } else if (govResult.success) {
            resp.tool_results = [...(resp.tool_results ?? []), {
              tool: toolName,
              success: true,
              result: govResult.result,
              error: null,
            }];
            governanceDecision = 'approved';
          }
        }
      }

      // Merge diagnostics into the response
      resp.provider_diagnostics = finalizeDiagnostics(resp.provider_diagnostics, diagnostics);

      // Phase 6: Audit — populate all governed fields
      await recordConversationAudit(req, resp, auditRef, diagnostics, allRequestedTools, allExecutedTools, true, governanceDecision);

      return {
        success: true,
        response: resp,
        auditReference: auditRef,
        conversationId: req.conversationId,
      };
    }
  }

  // Loop limit exceeded
  const fallback = buildFallbackResponse(req.message, diagnostics, 'Tool call loop limit exceeded.');
  await recordConversationAudit(req, fallback, auditRef, diagnostics, allRequestedTools, allExecutedTools, false);
  return {
    success: false,
    response: fallback,
    auditReference: auditRef,
    conversationId: req.conversationId,
  };
}

// ─── Governance Command Execution ────────────────────────────────────────────

async function executeGovernanceCommand(
  command: string,
  ewoRef: string,
  ctx: ToolExecutionContext,
  auditRef: string,
  req: GatewayRequest,
): Promise<GatewayResponse> {
  const toolName = governanceCommandToTool(command as 'approve_execution');
  const result = await executeTool(toolName, { ewo_ref: ewoRef, conversation_id: ctx.conversationId }, ctx);

  const response: StructuredProviderResponse = {
    response_type: result.success ? 'read_only_answer' : 'governance_block',
    interpreted_request: `${command} ${ewoRef}`,
    user_facing_message: result.success
      ? `Done. ${command.replace(/_/g, ' ')} for ${ewoRef} has been processed.`
      : `I couldn't process that: ${result.error?.message ?? 'Unknown error'}`,
    referenced_project: null,
    referenced_repository: null,
    referenced_ewo: ewoRef,
    proposed_action: null,
    proposed_lifecycle_action: null,
    clarification_required: false,
    clarification_question: null,
    confidence: 1,
    governance_check_required: false,
    approval_required: false,
    execution_required: false,
    requested_tools: [],
    tool_results: [{
      tool: toolName,
      success: result.success,
      result: result.result,
      error: result.error,
    }],
    warnings: result.success ? [] : [result.error?.message ?? 'Unknown error'],
    provider_diagnostics: {
      provider: 'eios_governance',
      model: 'deterministic',
      provider_version: '1.0',
      routing_strategy: 'governance_interception',
      prompt_tokens: 0,
      completion_tokens: 0,
      duration_ms: 0,
      tool_calls_made: 1,
      cache_hit: false,
    },
  };

  const governanceDecision = result.success ? 'approved' : 'blocked';
  await recordConversationAudit(req, response, auditRef, response.provider_diagnostics, [toolName], [toolName], result.success, governanceDecision);

  return {
    success: result.success,
    response,
    auditReference: result.auditReference || auditRef,
    conversationId: ctx.conversationId,
  };
}

// ─── Provider Invocation via IExecutionProviderAdapter (edge function) ─────────

interface ProviderInvokeRequest {
  messages: Array<{ role: string; content: string }>;
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  systemPrompt: string;
  conversationId: string;
  userId: string;
  priorToolResults?: ProviderToolResult[];
}

interface ProviderInvokeResponse {
  kind: 'tool_calls' | 'final_response';
  toolCalls?: ProviderToolCall[];
  content?: string;
  diagnostics: Partial<ProviderDiagnostics>;
}

async function invokeProviderViaAdapter(req: ProviderInvokeRequest): Promise<ProviderInvokeResponse> {
  const { data: session } = await supabase.auth.getSession();
  const accessToken = session?.session?.access_token ?? '';

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/atd-conversation-gateway`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: 'invoke_provider',
        messages: req.messages,
        tools: req.tools,
        system_prompt: req.systemPrompt,
        conversation_id: req.conversationId,
        prior_tool_results: req.priorToolResults,
      }),
    },
  );

  if (!response.ok) {
    let errorText = `Gateway HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errorText = errBody?.error || errBody?.message || errorText;
    } catch { /* response body not JSON */ }
    return {
      kind: 'final_response',
      content: JSON.stringify({
        response_type: 'tool_error',
        interpreted_request: 'Provider invocation failed at the gateway.',
        user_facing_message: 'The conversation gateway is unavailable. Please try again.',
        referenced_project: null,
        referenced_repository: null,
        referenced_ewo: null,
        proposed_action: null,
        proposed_lifecycle_action: null,
        clarification_required: false,
        clarification_question: null,
        confidence: 0,
        governance_check_required: false,
        approval_required: false,
        execution_required: false,
        requested_tools: [],
        tool_results: [],
        warnings: [errorText],
        provider_diagnostics: {
          provider: 'unknown',
          model: 'unknown',
          provider_version: 'unknown',
          routing_strategy: 'error',
          prompt_tokens: 0,
          completion_tokens: 0,
          duration_ms: 0,
          tool_calls_made: 0,
          cache_hit: false,
        },
      }),
      diagnostics: { provider: 'unknown', model: 'unknown', provider_version: 'unknown', routing_strategy: 'error' },
    };
  }

  const data = await response.json();

  if (data.error) {
    return {
      kind: 'final_response',
      content: JSON.stringify({
        response_type: 'tool_error',
        interpreted_request: 'Provider invocation failed at the gateway.',
        user_facing_message: 'The conversation gateway encountered an error. Please try again.',
        referenced_project: null,
        referenced_repository: null,
        referenced_ewo: null,
        proposed_action: null,
        proposed_lifecycle_action: null,
        clarification_required: false,
        clarification_question: null,
        confidence: 0,
        governance_check_required: false,
        approval_required: false,
        execution_required: false,
        requested_tools: [],
        tool_results: [],
        warnings: [data.error],
        provider_diagnostics: {
          provider: 'unknown',
          model: 'unknown',
          provider_version: 'unknown',
          routing_strategy: 'error',
          prompt_tokens: 0,
          completion_tokens: 0,
          duration_ms: 0,
          tool_calls_made: 0,
          cache_hit: false,
        },
      }),
      diagnostics: { provider: 'unknown', model: 'unknown', provider_version: 'unknown', routing_strategy: 'error' },
    };
  }

  if (data.kind === 'tool_calls') {
    return {
      kind: 'tool_calls',
      toolCalls: data.tool_calls as ProviderToolCall[],
      diagnostics: data.diagnostics ?? {},
    };
  }

  return {
    kind: 'final_response',
    content: data.content ?? '',
    diagnostics: data.diagnostics ?? {},
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lifecycleActionToTool(action: string): string | null {
  const map: Record<string, string> = {
    create_idea: 'eios_create_engineering_idea',
    create_ewo: 'eios_create_ewo',
    prepare_execution: 'eios_prepare_execution',
    approve_execution: 'eios_approve_execution',
    execute_ewo: 'eios_execute_ewo',
    cancel_execution: 'eios_cancel_execution',
    delete_ewo: 'eios_delete_ewo',
    record_acceptance: 'eios_record_acceptance',
    reject_execution: 'eios_reject_execution',
  };
  return map[action] ?? null;
}

function mergeDiagnostics(
  base: Partial<ProviderDiagnostics>,
  update: Partial<ProviderDiagnostics>,
): Partial<ProviderDiagnostics> {
  return {
    provider: update.provider ?? base.provider,
    model: update.model ?? base.model,
    provider_version: update.provider_version ?? base.provider_version,
    routing_strategy: update.routing_strategy ?? base.routing_strategy,
    prompt_tokens: (base.prompt_tokens ?? 0) + (update.prompt_tokens ?? 0),
    completion_tokens: (base.completion_tokens ?? 0) + (update.completion_tokens ?? 0),
    duration_ms: (base.duration_ms ?? 0) + (update.duration_ms ?? 0),
    tool_calls_made: (base.tool_calls_made ?? 0) + (update.tool_calls_made ?? 0),
    cache_hit: update.cache_hit ?? base.cache_hit ?? false,
  };
}

function finalizeDiagnostics(
  resp: ProviderDiagnostics,
  accumulated: Partial<ProviderDiagnostics>,
): ProviderDiagnostics {
  return {
    provider: accumulated.provider ?? resp.provider ?? 'unknown',
    model: accumulated.model ?? resp.model ?? 'unknown',
    provider_version: accumulated.provider_version ?? resp.provider_version ?? 'unknown',
    routing_strategy: accumulated.routing_strategy ?? resp.routing_strategy ?? 'adapter',
    prompt_tokens: accumulated.prompt_tokens ?? resp.prompt_tokens ?? 0,
    completion_tokens: accumulated.completion_tokens ?? resp.completion_tokens ?? 0,
    duration_ms: accumulated.duration_ms ?? resp.duration_ms ?? 0,
    tool_calls_made: accumulated.tool_calls_made ?? resp.tool_calls_made ?? 0,
    cache_hit: accumulated.cache_hit ?? resp.cache_hit ?? false,
  };
}

// ─── Audit (populates all governed fields) ────────────────────────────────────

async function recordConversationAudit(
  req: GatewayRequest,
  resp: StructuredProviderResponse,
  auditRef: string,
  diagnostics: Partial<ProviderDiagnostics>,
  requestedTools: string[],
  executedTools: string[],
  success: boolean,
  governanceDecision?: string,
): Promise<void> {
  const provider = diagnostics.provider ?? resp.provider_diagnostics?.provider ?? 'unknown';
  const model = diagnostics.model ?? resp.provider_diagnostics?.model ?? 'unknown';
  const providerVersion = diagnostics.provider_version ?? resp.provider_diagnostics?.provider_version ?? 'unknown';
  const lifecycleDecision = resp.proposed_lifecycle_action ?? null;
  const govDecision = governanceDecision ?? (resp.response_type === 'governance_block' ? 'blocked' : 'none');

  try {
    // Insert into the existing inspection log with new governed columns
    await supabase.from('atd_connect_inspection_log').insert({
      request_id: auditRef,
      timestamp: new Date().toISOString(),
      requesting_persona: 'atd',
      operation: 'conversation_gateway',
      inspected_capability: 'eios_conversation_gateway',
      outcome: mapResponseTypeToOutcome(resp.response_type),
      request_source: 'conversational',
      original_request: req.message.slice(0, 2000),
      session_id: req.conversationId,
      resolved_capability: 'eios_conversation_gateway',
      resolved_operation: resp.proposed_lifecycle_action ?? 'conversation',
      resolved_object_reference: resp.referenced_ewo,
      provider,
      provider_model: model,
      provider_version: providerVersion,
      policy_version: '1.0',
      context_version: '1.0',
      lifecycle_decision: lifecycleDecision,
      governance_decision: govDecision,
      requested_tools: requestedTools,
      executed_tools: executedTools,
    });
  } catch (auditErr) {
    console.warn('[EIOS] Inspection log insert failed:', auditErr instanceof Error ? auditErr.message : String(auditErr));
  }

  try {
    // Insert into the dedicated conversation audit table
    await supabase.from('eios_conversation_audit').insert({
      audit_reference: auditRef,
      conversation_id: req.conversationId,
      user_id: ctx.userId,
      user_role: ctx.userRole,
      project_id: req.projectId,
      ewo_ref: resp.referenced_ewo,
      message: req.message.slice(0, 2000),
      response_type: resp.response_type,
      interpreted_request: resp.interpreted_request?.slice(0, 1000) ?? null,
      proposed_lifecycle_action: resp.proposed_lifecycle_action,
      governance_decision: govDecision,
      provider,
      provider_model: model,
      provider_version: providerVersion,
      policy_version: '1.0',
      context_version: '1.0',
      prompt_tokens: diagnostics.prompt_tokens ?? 0,
      completion_tokens: diagnostics.completion_tokens ?? 0,
      duration_ms: diagnostics.duration_ms ?? 0,
      tool_calls_made: diagnostics.tool_calls_made ?? 0,
      requested_tools: requestedTools,
      executed_tools: executedTools,
      success,
      error_message: success ? null : (resp.warnings.join('; ') || null),
    });
  } catch (auditErr) {
    console.warn('[EIOS] Conversation audit insert failed:', auditErr instanceof Error ? auditErr.message : String(auditErr));
  }
}
