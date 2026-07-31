/**
 * EWO-044 — Codex-Native ATD Conversation Engine
 *
 * Canonical structured provider contract.
 * Every provider response must conform to this schema.
 * EIOS validates every response against this contract before display.
 *
 * This contract is provider-agnostic. Codex, Claude, Gemini, or any future
 * provider must return responses conforming to this structure.
 */

// ─── Provider Response Contract ──────────────────────────────────────────────

export type ProviderResponseType =
  | 'read_only_answer'
  | 'clarification_request'
  | 'lifecycle_proposal'
  | 'execution_proposal'
  | 'tool_error'
  | 'governance_block';

export type ProposedLifecycleAction =
  | 'create_idea'
  | 'create_ewo'
  | 'prepare_execution'
  | 'approve_execution'
  | 'execute_ewo'
  | 'cancel_execution'
  | 'delete_ewo'
  | 'record_acceptance'
  | 'reject_execution';

export interface ProviderToolCall {
  tool: string;
  parameters: Record<string, unknown>;
}

export interface ProviderToolResult {
  tool: string;
  success: boolean;
  result: unknown;
  error: ProviderError | null;
}

export interface ProviderError {
  code: string;
  message: string;
  category: 'data_not_found' | 'governance_blocked' | 'timeout' | 'schema_error' | 'provider_error' | 'unknown';
  retryable: boolean;
  governance_blockers?: GovernanceBlocker[];
}

export interface GovernanceBlocker {
  gate: string;
  message: string;
  required_action: string;
}

export interface ProviderDiagnostics {
  provider: string;
  model: string;
  provider_version: string;
  routing_strategy: string;
  prompt_tokens: number;
  completion_tokens: number;
  duration_ms: number;
  tool_calls_made: number;
  cache_hit: boolean;
}

export interface StructuredProviderResponse {
  response_type: ProviderResponseType;
  interpreted_request: string;
  user_facing_message: string;
  referenced_project: string | null;
  referenced_repository: string | null;
  referenced_ewo: string | null;
  proposed_action: ProposedLifecycleAction | null;
  proposed_lifecycle_action: ProposedLifecycleAction | null;
  clarification_required: boolean;
  clarification_question: string | null;
  confidence: number;
  governance_check_required: boolean;
  approval_required: boolean;
  execution_required: boolean;
  requested_tools: ProviderToolCall[];
  tool_results: ProviderToolResult[];
  warnings: string[];
  provider_diagnostics: ProviderDiagnostics;
}

// ─── Validation ──────────────────────────────────────────────────────────────

const REQUIRED_FIELDS: (keyof StructuredProviderResponse)[] = [
  'response_type',
  'interpreted_request',
  'user_facing_message',
  'referenced_project',
  'referenced_repository',
  'referenced_ewo',
  'proposed_action',
  'proposed_lifecycle_action',
  'clarification_required',
  'confidence',
  'governance_check_required',
  'approval_required',
  'execution_required',
  'requested_tools',
  'tool_results',
  'warnings',
  'provider_diagnostics',
];

const VALID_RESPONSE_TYPES: ProviderResponseType[] = [
  'read_only_answer',
  'clarification_request',
  'lifecycle_proposal',
  'execution_proposal',
  'tool_error',
  'governance_block',
];

const VALID_LIFECYCLE_ACTIONS: ProposedLifecycleAction[] = [
  'create_idea',
  'create_ewo',
  'prepare_execution',
  'approve_execution',
  'execute_ewo',
  'cancel_execution',
  'delete_ewo',
  'record_acceptance',
  'reject_execution',
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateProviderResponse(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Response is not an object'] };
  }

  const obj = raw as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const resp = obj as unknown as StructuredProviderResponse;

  if (!VALID_RESPONSE_TYPES.includes(resp.response_type)) {
    errors.push(`Invalid response_type: ${resp.response_type}`);
  }

  if (resp.proposed_lifecycle_action && !VALID_LIFECYCLE_ACTIONS.includes(resp.proposed_lifecycle_action)) {
    errors.push(`Invalid proposed_lifecycle_action: ${resp.proposed_lifecycle_action}`);
  }

  if (typeof resp.confidence !== 'number' || resp.confidence < 0 || resp.confidence > 1) {
    errors.push('confidence must be a number between 0 and 1');
  }

  if (typeof resp.user_facing_message !== 'string' || resp.user_facing_message.length === 0) {
    errors.push('user_facing_message must be a non-empty string');
  }

  if (resp.clarification_required && !resp.clarification_question) {
    errors.push('clarification_question required when clarification_required is true');
  }

  if (resp.provider_diagnostics) {
    const d = resp.provider_diagnostics;
    if (!d.provider || !d.model) {
      errors.push('provider_diagnostics must include provider and model');
    }
  } else {
    errors.push('provider_diagnostics is required');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Helper: Safe parse from provider text output ────────────────────────────

export function parseProviderResponse(content: string): StructuredProviderResponse | null {
  const jsonStr = extractJson(content);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    const validation = validateProviderResponse(parsed);
    if (validation.valid) {
      return parsed as StructuredProviderResponse;
    }
    return null;
  } catch {
    return null;
  }
}

function extractJson(content: string): string | null {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch && fenceMatch[1]) {
    const inner = fenceMatch[1].trim();
    if (inner.startsWith('{') && inner.endsWith('}')) return inner;
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return null;
}

// ─── Helper: Build fallback response when provider output is invalid ──────────

export function buildFallbackResponse(
  userMessage: string,
  diagnostics: Partial<ProviderDiagnostics>,
  error: string,
): StructuredProviderResponse {
  return {
    response_type: 'tool_error',
    interpreted_request: userMessage,
    user_facing_message:
      'I encountered an issue processing that request. Could you rephrase or try again?',
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
    warnings: [error],
    provider_diagnostics: {
      provider: diagnostics.provider ?? 'unknown',
      model: diagnostics.model ?? 'unknown',
      provider_version: diagnostics.provider_version ?? 'unknown',
      routing_strategy: diagnostics.routing_strategy ?? 'unknown',
      prompt_tokens: diagnostics.prompt_tokens ?? 0,
      completion_tokens: diagnostics.completion_tokens ?? 0,
      duration_ms: diagnostics.duration_ms ?? 0,
      tool_calls_made: 0,
      cache_hit: false,
    },
  };
}
