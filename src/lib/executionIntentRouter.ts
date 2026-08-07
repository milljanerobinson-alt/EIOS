// EWO-031 — Conversation-to-Execution Routing
// Distinguishes advisory requests from governed execution requests.
// Routes approved execution intents into the Supervised Engineering Execution Engine.

import { supabase } from './supabase';
import {
  evaluateGovernanceGate,
  executeSupervisedPipeline,
  getExecutionRecord,
  getExecutionsByEwo,
  type GovernanceGateResult,
  type SupervisedExecutionResult,
  type SupervisedExecutionInput,
} from './supervisedExecutionEngine';
import {
  selectGovernedProvider,
  inspectProviderPolicy,
  type ProviderSelectionDiagnostics,
  type ProviderPolicyInspection,
} from './providerPolicyService';

// ─── Intent Types ────────────────────────────────────────────────────────────

export type ConversationIntent =
  | 'advisory'
  | 'create_ewo'
  | 'prepare_analysis'
  | 'prepare_plan'
  | 'approve_execution'
  | 'approve_plan'
  | 'execute_ewo'
  | 'inspect_execution'
  | 'inspect_handoff'
  | 'accept_ewo'
  | 'inspection'
  | 'unresolved';

export interface IntentDiagnostics {
  detected_intent: ConversationIntent;
  confidence: number;
  routing_decision: string;
  resolved_capability: string | null;
  resolved_operation: string | null;
  resolved_engineering_object_reference: string | null;
  execution_requested: boolean;
  execution_approval_detected: boolean;
  lifecycle_change_requested: boolean;
  confirmation_required: boolean;
  refusal_reason: string | null;
}

export interface ConversationContinuity {
  conversation_identifier: string | null;
  conversation_identifier_source: string;
  active_ewo_reference: string | null;
  object_resolution_method: string;
  conversation_scope_verified: boolean;
  active_object_updated: boolean;
}

export interface ExecutionGateResult {
  passed: boolean;
  blockers: ExecutionBlocker[];
  next_required_action: string | null;
  diagnostics: Record<string, unknown>;
}

export interface ExecutionBlocker {
  gate: string;
  message: string;
  severity: 'critical' | 'warning';
}

export interface ProviderSelectionInfo {
  requested_provider: string | null;
  selected_provider_id: string | null;
  selected_provider_name: string | null;
  selected_provider_version: string | null;
  provider_lifecycle_status: string | null;
  provider_active_status: boolean;
  provider_governed_status: boolean;
  provider_configuration_status: string | null;
  provider_health_status: string | null;
  provider_selection_reason: string;
  fallback_permitted: boolean;
  fallback_performed: boolean;
  rejection_reason: string | null;
  policy_version: number | null;
}

export interface ExecutionDispatchResult {
  execution_status: 'started' | 'blocked' | 'failed' | 'completed' | 'refused';
  execution_request_id: string | null;
  execution_package_id: string | null;
  execution_id: string | null;
  selected_provider: ProviderSelectionInfo | null;
  failed_stage: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  retryable: boolean;
  lifecycle_change_performed: boolean;
  partial_changes_detected: boolean;
  rollback_status: string | null;
  audit_reference: string | null;
  pipeline_result: SupervisedExecutionResult | null;
}

export interface ExecutionRoutingResult {
  intent_diagnostics: IntentDiagnostics;
  conversation_continuity: ConversationContinuity;
  gate_result: ExecutionGateResult | null;
  dispatch_result: ExecutionDispatchResult | null;
  audit_reference: string;
}

// ─── Intent Patterns ──────────────────────────────────────────────────────────

// EWO-031R.3: Negation-aware execution suppression patterns.
// If any of these match, execution intent is suppressed.
const NEGATED_EXECUTION_PATTERNS = [
  /\bdo\s+not\s+execute\b/i,
  /\bdon'?t\s+execute\b/i,
  /\bdo\s+not\s+run\b/i,
  /\bdo\s+not\s+start\b/i,
  /\bdo\s+not\s+dispatch\b/i,
  /\bdo\s+not\s+perform\s+lifecycle\s+changes?\b/i,
  /\binspection\s+only\b/i,
  /\bread-?only\b/i,
  /\bdo\s+not\s+validate\b/i,
  /\bdo\s+not\s+advance\b/i,
];

const INTENT_PATTERNS: Array<{
  intent: ConversationIntent;
  patterns: RegExp[];
  capability: string;
  operation: string;
  objectPattern?: RegExp;
}> = [
  // Advisory — must be checked first for negative context
  {
    intent: 'advisory',
    patterns: [
      /explain\s+how\s+(?:we\s+)?could\s+implement/i,
      /what\s+(?:would|should)\s+we\s+do/i,
      /describe\s+(?:the\s+)?approach/i,
      /how\s+(?:would|could|should)\s+(?:we|you)/i,
      /what\s+are\s+the\s+(?:options|steps)/i,
      /can\s+you\s+(?:explain|describe|suggest)/i,
    ],
    capability: 'advisory',
    operation: 'provideAdvice',
  },

  // Create EWO
  {
    intent: 'create_ewo',
    patterns: [
      /create\s+(?:an?\s+)?(?:ewo\s+|engineering\s+work\s+order\s+)?(EWO-[\w.-]+)\b/i,
      /create\s+(?:an?\s+)?ewo\s+(?:for\s+)?(.+)/i,
      /register\s+(?:an?\s+)?(?:ewo\s+|engineering\s+work\s+order\s+)?(EWO-[\w.-]+)\b/i,
      /create\s+(?:ewo\s+)?(EWO-[\w.-]+)/i,
    ],
    capability: 'engineering-work-orders',
    operation: 'createEngineeringWorkOrderFromConversation',
    objectPattern: /(EWO-[\w.-]+)/i,
  },

  // Prepare analysis
  {
    intent: 'prepare_analysis',
    patterns: [
      /prepare\s+(?:the\s+)?(?:engineering\s+)?analysis\s+(?:for\s+)?(EWO-[\w.-]+)\b/i,
      /prepare\s+(?:its|the)\s+(?:engineering\s+)?analysis/i,
      /generate\s+(?:the\s+)?analysis\s+(?:for\s+)?(EWO-[\w.-]+)\b/i,
    ],
    capability: 'engineering-work-orders',
    operation: 'prepareEngineeringAnalysis',
    objectPattern: /(EWO-[\w.-]+)/i,
  },

  // Prepare plan
  {
    intent: 'prepare_plan',
    patterns: [
      /prepare\s+(?:the\s+)?(?:engineering\s+)?plan\s+(?:for\s+)?(EWO-[\w.-]+)\b/i,
      /prepare\s+(?:its|the)\s+(?:engineering\s+)?plan/i,
      /generate\s+(?:the\s+)?plan\s+(?:for\s+)?(EWO-[\w.-]+)\b/i,
    ],
    capability: 'engineering-work-orders',
    operation: 'prepareEngineeringPlan',
    objectPattern: /(EWO-[\w.-]+)/i,
  },

  // Approve execution
  {
    intent: 'approve_execution',
    patterns: [
      /approve\s+(EWO-[\w.-]+)\s+for\s+execution/i,
      /approve\s+(?:it|this)\s+for\s+execution/i,
      /grant\s+execution\s+approval\s+(?:for\s+)?(EWO-[\w.-]+)\b/i,
      /approve\s+execution\s+(?:for\s+|of\s+)?(EWO-[\w.-]+)\b/i,
    ],
    capability: 'engineering-work-orders',
    operation: 'approveEngineeringWorkOrderForExecution',
    objectPattern: /(EWO-[\w.-]+)/i,
  },

  // Execute EWO
  {
    intent: 'execute_ewo',
    patterns: [
      /execute\s+(EWO-[\w.-]+)\s+(?:using\s+)?codex/i,
      /execute\s+(?:it|this)\s+using\s+codex/i,
      /execute\s+(EWO-[\w.-]+)\b/i,
      /run\s+(EWO-[\w.-]+)\s+(?:using\s+)?codex/i,
      /execute\s+(?:it|this)\s+through\s+(?:the\s+)?(?:supervised\s+)?execution/i,
      /start\s+execution\s+(?:of\s+|for\s+)?(EWO-[\w.-]+)\b/i,
    ],
    capability: 'supervised-engineering-execution',
    operation: 'executeEngineeringWorkOrder',
    objectPattern: /(EWO-[\w.-]+)/i,
  },

  // Inspect execution
  {
    intent: 'inspect_execution',
    patterns: [
      /inspect\s+(?:the\s+)?(?:execution\s+state|execution\s+status|latest\s+execution)\s+(?:of\s+|for\s+)?(EWO-[\w.-]+)\b/i,
      /inspect\s+(?:the\s+)?execution\s+(?:of\s+|for\s+)?(EWO-[\w.-]+)\b/i,
      /show\s+(?:me\s+)?(?:the\s+)?execution\s+(?:status|state|results)\s+(?:of\s+|for\s+)?(EWO-[\w.-]+)\b/i,
      /inspect\s+(?:the\s+)?latest\s+execution\s+for\s+(EWO-[\w.-]+)\b/i,
    ],
    capability: 'supervised-engineering-execution',
    operation: 'inspectEngineeringExecution',
    objectPattern: /(EWO-[\w.-]+)/i,
  },

  // Accept EWO (Product Owner Acceptance)
  {
    intent: 'accept_ewo',
    patterns: [
      /record\s+product\s+owner\s+acceptance\s+(?:for\s+)?(EWO-[\w.-]+)\b/i,
      /accept\s+(EWO-[\w.-]+)\b/i,
    ],
    capability: 'engineering-work-orders',
    operation: 'acceptEngineeringWorkOrder',
    objectPattern: /(EWO-[\w.-]+)/i,
  },

  // Inspect provider policy (EWO-031R.1, EWO-031R.2)
  {
    intent: 'inspection',
    patterns: [
      /inspect\s+(?:the\s+)?(?:supervised\s+)?execution\s+engine\s+and\s+provider\s+selection\s+(?:for\s+)?(EWO-[\w.-]+?)\b/i,
      /inspect\s+(?:the\s+)?(?:supervised\s+)?execution\s+engine\s+and\s+provider\s+selection/i,
      /inspect\s+(?:the\s+)?provider\s+(?:policy|selection)\s+(?:for\s+)?(EWO-[\w.-]+?)\b/i,
      /inspect\s+(?:the\s+)?provider\s+(?:policy|selection)/i,
      /inspect\s+(?:the\s+)?(?:preferred|default|allowed)\s+providers?(?:\s+for\s+(EWO-[\w.-]+?))?\b/i,
      /inspect\s+(?:the\s+)?fallback\s+(?:provider\s+)?policy/i,
      /invoke\s+inspect_execution_provider_policy\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
      /invoke\s+inspect_execution_provider_policy\s+directly/i,
      /invoke\s+inspectexecutionproviderpolicy\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
      /invoke\s+inspectexecutionproviderpolicy\s+directly/i,
      /return\s+(?:the\s+)?(?:live\s+)?execution\s+provider\s+policy/i,
      /inspect\s+(?:the\s+)?execution\s+provider\s+policy/i,
    ],
    capability: 'supervised-engineering-execution',
    operation: 'inspectExecutionProviderPolicy',
    objectPattern: /(EWO-[\w.-]+?)\b/i,
  },

  // EWO-032: Inspect execution handoff — read-only inspection of the handoff state
  {
    intent: 'inspect_handoff',
    patterns: [
      /inspect\s+(?:the\s+)?execution\s+handoff\s+(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
      /inspect\s+(?:the\s+)?execution\s+handoff/i,
      /invoke\s+inspect_execution_handoff\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
      /invoke\s+inspect_execution_handoff\s+directly/i,
      /invoke\s+inspectexecutionhandoff\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
      /invoke\s+inspectexecutionhandoff\s+directly/i,
      /return\s+(?:the\s+)?execution\s+handoff\s+(?:state|status)/i,
      /inspect\s+(?:the\s+)?handoff\s+(?:state|status)/i,
    ],
    capability: 'supervised-engineering-execution',
    operation: 'inspectExecutionHandoff',
    objectPattern: /(EWO-[\w.-]+?)\b/i,
  },

  // EWO-032: Conversational plan approval — "approved", "proceed", "confirm execution"
  {
    intent: 'approve_plan',
    patterns: [
      /^\s*approved\s*$/i,
      /^\s*approve\s*$/i,
      /^\s*proceed\s*$/i,
      /^\s*proceed\s+with\s+execution\s*$/i,
      /^\s*approved\s*,\s*execute\s*$/i,
      /^\s*confirm\s+execution\s*$/i,
      /^\s*yes\s*,\s*execute\s+the\s+approved\s+plan\s*$/i,
      /\bapproved\s+for\s+execution\b/i,
      /\bproceed\s+with\s+the\s+approved\s+plan\b/i,
      /\bconfirm\s+the\s+approved\s+plan\b/i,
      /\byes\s*,?\s*proceed\b/i,
      /\bexecute\s+the\s+approved\s+plan\b/i,
    ],
    capability: 'supervised-engineering-execution',
    operation: 'approveAndHandoffExecution',
  },
];

// ─── Intent Classification ────────────────────────────────────────────────────

export function classifyExecutionIntent(
  text: string,
  activeEwoRef?: string | null
): IntentDiagnostics {
  const lower = text.toLowerCase();

  // EWO-031R.3: Negation-aware execution suppression.
  // If the request contains negated execution phrases, execution intent is suppressed.
  const hasNegatedExecution = NEGATED_EXECUTION_PATTERNS.some(p => p.test(text));

  // Check for advisory negative context first
  const isAdvisory = INTENT_PATTERNS[0].patterns.some(p => p.test(text));
  if (isAdvisory) {
    return {
      detected_intent: 'advisory',
      confidence: 0.95,
      routing_decision: 'route_to_advisory',
      resolved_capability: 'advisory',
      resolved_operation: 'provideAdvice',
      resolved_engineering_object_reference: extractEwoRef(text) ?? activeEwoRef ?? null,
      execution_requested: false,
      execution_approval_detected: false,
      lifecycle_change_requested: false,
      confirmation_required: false,
      refusal_reason: null,
    };
  }

  // Check execution-specific patterns (skip advisory at index 0)
  for (let i = 1; i < INTENT_PATTERNS.length; i++) {
    const entry = INTENT_PATTERNS[i];
    // EWO-031R.3: Skip execution patterns when negation is detected
    if (hasNegatedExecution && (entry.intent === 'execute_ewo' || entry.intent === 'approve_execution' || entry.intent === 'accept_ewo')) {
      continue;
    }
    for (const pattern of entry.patterns) {
      const match = text.match(pattern);
      if (match) {
        let objectRef = activeEwoRef ?? null;
        if (entry.objectPattern) {
          const objMatch = text.match(entry.objectPattern);
          if (objMatch) objectRef = objMatch[1];
        }

        const executionRequested = entry.intent === 'execute_ewo';
        const approvalDetected = entry.intent === 'approve_execution';
        const lifecycleChange = ['create_ewo', 'prepare_analysis', 'prepare_plan', 'approve_execution', 'execute_ewo', 'accept_ewo'].includes(entry.intent);
        const confirmationRequired = ['approve_execution', 'execute_ewo', 'accept_ewo'].includes(entry.intent);

        let routingDecision = `route_to_${entry.operation}`;
        if (entry.intent === 'execute_ewo') {
          routingDecision = 'route_to_execution_pipeline';
        } else if (entry.intent === 'inspect_execution') {
          routingDecision = 'route_to_execution_inspection';
        } else if (entry.intent === 'advisory') {
          routingDecision = 'route_to_advisory';
        }

        return {
          detected_intent: entry.intent,
          confidence: 0.9,
          routing_decision: routingDecision,
          resolved_capability: entry.capability,
          resolved_operation: entry.operation,
          resolved_engineering_object_reference: objectRef,
          execution_requested: executionRequested,
          execution_approval_detected: approvalDetected,
          lifecycle_change_requested: lifecycleChange,
          confirmation_required: confirmationRequired,
          refusal_reason: null,
        };
      }
    }
  }

  // Check if text mentions execution keywords but didn't match specific patterns
  const executionKeywords = /\b(?:execute|run|approve|start)\b/i;
  const ewoRef = extractEwoRef(text);
  if (executionKeywords.test(text) && ewoRef) {
    return {
      detected_intent: 'unresolved',
      confidence: 0.5,
      routing_decision: 'unresolved_execution_request',
      resolved_capability: null,
      resolved_operation: null,
      resolved_engineering_object_reference: ewoRef,
      execution_requested: /\bexecute\b/i.test(text),
      execution_approval_detected: /\bapprove\b/i.test(text),
      lifecycle_change_requested: true,
      confirmation_required: true,
      refusal_reason: 'Execution-related request detected but could not resolve to a specific governed operation. Please specify the EWO reference and action (e.g., "Execute EWO-031 using Codex").',
    };
  }

  return {
    detected_intent: 'unresolved',
    confidence: 0.3,
    routing_decision: 'unresolved',
    resolved_capability: null,
    resolved_operation: null,
    resolved_engineering_object_reference: ewoRef ?? activeEwoRef ?? null,
    execution_requested: false,
    execution_approval_detected: false,
    lifecycle_change_requested: false,
    confirmation_required: false,
    refusal_reason: null,
  };
}

function extractEwoRef(text: string): string | null {
  const match = text.match(/(EWO-[\w.-]+)/i);
  return match ? match[1] : null;
}

// ─── Conversation Continuity ───────────────────────────────────────────────────

export async function resolveConversationContinuity(
  conversationId: string | null,
  text: string,
  intent: IntentDiagnostics
): Promise<ConversationContinuity> {
  const explicitRef = intent.resolved_engineering_object_reference;
  let activeEwoRef: string | null = explicitRef;

  // If no explicit EWO ref in text, try to resolve from conversation context
  if (!activeEwoRef && conversationId) {
    const { data } = await supabase
      .from('atd_conversation_active_objects')
      .select('active_ewo_ref')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (data?.active_ewo_ref) {
      activeEwoRef = data.active_ewo_ref;
    }
  }

  const objectResolutionMethod = explicitRef
    ? 'explicit_reference_in_request'
    : activeEwoRef
    ? 'conversation_context'
    : 'unresolved';

  // Update active object if we have a new explicit reference
  let activeObjectUpdated = false;
  if (explicitRef && conversationId) {
    const { error } = await supabase
      .from('atd_conversation_active_objects')
      .upsert(
        { conversation_id: conversationId, active_ewo_ref: explicitRef, updated_at: new Date().toISOString() },
        { onConflict: 'conversation_id' }
      );
    if (!error) activeObjectUpdated = true;
  }

  return {
    conversation_identifier: conversationId,
    conversation_identifier_source: conversationId ? 'mcp_session' : 'none',
    active_ewo_reference: activeEwoRef,
    object_resolution_method: objectResolutionMethod,
    conversation_scope_verified: !!conversationId,
    active_object_updated: activeObjectUpdated,
  };
}

// ─── Execution Approval Gate ───────────────────────────────────────────────────

export async function evaluateExecutionGate(
  ewoRef: string,
  requestedProvider?: string | null
): Promise<ExecutionGateResult> {
  const blockers: ExecutionBlocker[] = [];
  const diagnostics: Record<string, unknown> = {};

  // 1. EWO exists
  const { data: ewo, error: ewoError } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, status, engineering_package_status, implementation_status, po_accepted_at, scope, validation_requirements')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (ewoError || !ewo) {
    blockers.push({ gate: 'ewo_exists', message: `Engineering Work Order ${ewoRef} not found.`, severity: 'critical' });
    return { passed: false, blockers, next_required_action: 'Create the Engineering Work Order first.', diagnostics: { ewo_found: false } };
  }
  diagnostics.ewo_status = ewo.status;

  // 2. EWO is in execution-eligible lifecycle state
  const eligibleStatuses = ['in_progress', 'engineering_complete', 'verified', 'po_acceptance', 'approved'];
  if (!eligibleStatuses.includes(ewo.status)) {
    blockers.push({
      gate: 'ewo_lifecycle_state',
      message: `EWO ${ewoRef} is in status "${ewo.status}". Execution requires one of: ${eligibleStatuses.join(', ')}.`,
      severity: 'critical',
    });
  }

  // 3. Engineering Analysis exists
  const { data: analysis } = await supabase
    .from('engineering_plans')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .eq('plan_type', 'analysis')
    .limit(1)
    .maybeSingle();

  if (!analysis) {
    blockers.push({
      gate: 'engineering_analysis',
      message: `No Engineering Analysis found for ${ewoRef}.`,
      severity: 'critical',
    });
  }

  // 4. Engineering Plan exists
  const { data: plan } = await supabase
    .from('engineering_plans')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .eq('plan_type', 'plan')
    .limit(1)
    .maybeSingle();

  if (!plan) {
    blockers.push({
      gate: 'engineering_plan',
      message: `No Engineering Plan found for ${ewoRef}.`,
      severity: 'critical',
    });
  }

  // 5. Product Owner execution approval is explicit
  const { data: execApproval } = await supabase
    .from('ewo_execution_approvals')
    .select('decision, product_owner, created_at')
    .eq('ewo_id', ewo.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!execApproval || execApproval.decision !== 'approved') {
    blockers.push({
      gate: 'po_execution_approval',
      message: `Product Owner execution approval not found for ${ewoRef}. Execution requires explicit PO approval to begin.`,
      severity: 'critical',
    });
  }
  diagnostics.execution_approval = execApproval?.decision || 'not_found';

  // 6. Repository target is resolved
  const { data: target } = await supabase
    .from('execution_targets')
    .select('id, repository, branch, status')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!target) {
    blockers.push({
      gate: 'repository_target',
      message: 'No active execution target with a valid repository and branch strategy.',
      severity: 'critical',
    });
  }
  diagnostics.repository = target?.repository || 'not_found';

  // 7. Execution provider is available — use canonical governed provider policy
  const providerDiagnostics = await selectGovernedProvider(ewoRef, requestedProvider);

  if (!providerDiagnostics.selected_provider_id || providerDiagnostics.rejection_reason) {
    blockers.push({
      gate: providerDiagnostics.rejection_reason ?? 'provider_available',
      message: providerDiagnostics.provider_selection_reason,
      severity: 'critical',
    });
  } else {
    diagnostics.provider = providerDiagnostics.selected_provider_name;
    diagnostics.provider_status = providerDiagnostics.provider_lifecycle_status;
    diagnostics.provider_configuration = providerDiagnostics.provider_configuration_status;
    diagnostics.provider_health = providerDiagnostics.provider_health_status;
    diagnostics.policy_version = providerDiagnostics.policy_version;

    // 8. Provider is governed and active
    if (!providerDiagnostics.provider_active_status) {
      blockers.push({
        gate: 'provider_governed',
        message: `Provider "${providerDiagnostics.selected_provider_name}" is not active.`,
        severity: 'critical',
      });
    }

    // 9. Codex-only: no fallback — policy already enforces this, but check explicitly
    if (requestedProvider?.toLowerCase() === 'codex' && providerDiagnostics.selected_provider_id?.toLowerCase() !== 'codex') {
      blockers.push({
        gate: 'provider_selection',
        message: `Codex-only execution requested but Codex is not the selected provider. Fallback is not permitted for Codex-only requests.`,
        severity: 'critical',
      });
    }

    // 10. Credential configuration check
    if (providerDiagnostics.provider_configuration_status === 'not_configured') {
      blockers.push({
        gate: 'provider_credentials',
        message: `Provider "${providerDiagnostics.selected_provider_name}" is not configured. Credentials are unavailable.`,
        severity: 'critical',
      });
    }

    // 11. Health check
    if (providerDiagnostics.provider_health_status && providerDiagnostics.provider_health_status !== 'healthy') {
      blockers.push({
        gate: 'provider_health',
        message: `Provider "${providerDiagnostics.selected_provider_name}" health: ${providerDiagnostics.provider_health_status}.`,
        severity: 'critical',
      });
    }
  }

  // 10. Budget and token controls
  const { data: budget } = await supabase
    .from('execution_budget_controls')
    .select('max_tokens, used_tokens, status')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (budget && budget.max_tokens > 0) {
    const remaining = budget.max_tokens - (budget.used_tokens || 0);
    if (remaining <= 0) {
      blockers.push({
        gate: 'budget_control',
        message: `Execution budget exhausted. Used ${budget.used_tokens} of ${budget.max_tokens} tokens.`,
        severity: 'critical',
      });
    }
    diagnostics.budget_remaining = remaining;
  }

  // 11. No unresolved governance blocker
  const governanceGate = await evaluateGovernanceGate(ewoRef);
  for (const b of governanceGate.blockers) {
    if (b.severity === 'critical' && !blockers.some(existing => existing.gate === b.gate)) {
      blockers.push({ gate: b.gate, message: b.message, severity: b.severity as 'critical' | 'warning' });
    }
  }

  const passed = blockers.filter(b => b.severity === 'critical').length === 0;
  const criticalBlockers = blockers.filter(b => b.severity === 'critical');

  return {
    passed,
    blockers,
    next_required_action: passed ? null : criticalBlockers[0]?.message ?? 'Resolve all blocking gates.',
    diagnostics,
  };
}

// ─── Provider Selection ────────────────────────────────────────────────────────

export async function resolveProviderSelection(
  ewoRef: string,
  requestedProvider?: string | null
): Promise<ProviderSelectionInfo> {
  const diagnostics = await selectGovernedProvider(ewoRef, requestedProvider);

  return {
    requested_provider: diagnostics.requested_provider,
    selected_provider_id: diagnostics.selected_provider_id,
    selected_provider_name: diagnostics.selected_provider_name,
    selected_provider_version: diagnostics.selected_provider_version,
    provider_lifecycle_status: diagnostics.provider_lifecycle_status,
    provider_active_status: diagnostics.provider_active_status,
    provider_governed_status: diagnostics.provider_governed_status,
    provider_configuration_status: diagnostics.provider_configuration_status,
    provider_health_status: diagnostics.provider_health_status,
    provider_selection_reason: diagnostics.provider_selection_reason,
    fallback_permitted: diagnostics.fallback_permitted,
    fallback_performed: diagnostics.fallback_performed,
    rejection_reason: diagnostics.rejection_reason,
    policy_version: diagnostics.policy_version,
  };
}

// ─── Execution Dispatch ────────────────────────────────────────────────────────

export async function dispatchExecution(
  ewoRef: string,
  conversationId: string | null,
  requestedProvider?: string | null,
  actor?: string
): Promise<ExecutionDispatchResult> {
  const auditRef = `EWO031-${Date.now()}`;

  // 1. Evaluate gate
  const gateResult = await evaluateExecutionGate(ewoRef, requestedProvider);

  if (!gateResult.passed) {
    const failedGate = gateResult.blockers.find(b => b.severity === 'critical');
    return {
      execution_status: 'blocked',
      execution_request_id: null,
      execution_package_id: null,
      execution_id: null,
      selected_provider: null,
      failed_stage: failedGate?.gate ?? 'unknown',
      failure_code: 'gate_failed',
      failure_reason: failedGate?.message ?? 'Execution gate failed',
      retryable: true,
      lifecycle_change_performed: false,
      partial_changes_detected: false,
      rollback_status: null,
      audit_reference: auditRef,
      pipeline_result: null,
    };
  }

  // 2. Resolve provider
  const providerInfo = await resolveProviderSelection(ewoRef, requestedProvider);

  if (!providerInfo.selected_provider_id) {
    return {
      execution_status: 'refused',
      execution_request_id: null,
      execution_package_id: null,
      execution_id: null,
      selected_provider: providerInfo,
      failed_stage: 'provider_selection',
      failure_code: 'no_provider',
      failure_reason: `No eligible execution provider available${requestedProvider ? ` for "${requestedProvider}"` : ''}.`,
      retryable: false,
      lifecycle_change_performed: false,
      partial_changes_detected: false,
      rollback_status: null,
      audit_reference: auditRef,
      pipeline_result: null,
    };
  }

  // Codex-only: refuse if fallback would occur
  if (requestedProvider?.toLowerCase() === 'codex' && providerInfo.selected_provider_name?.toLowerCase() !== 'codex') {
    return {
      execution_status: 'refused',
      execution_request_id: null,
      execution_package_id: null,
      execution_id: null,
      selected_provider: providerInfo,
      failed_stage: 'provider_selection',
      failure_code: 'codex_fallback_refused',
      failure_reason: 'Codex-only execution requested but Codex is not available. Fallback is not permitted.',
      retryable: false,
      lifecycle_change_performed: false,
      partial_changes_detected: false,
      rollback_status: null,
      audit_reference: auditRef,
      pipeline_result: null,
    };
  }

  // 3. Dispatch to supervised execution pipeline
  try {
    const input: SupervisedExecutionInput = {
      ewo_ref: ewoRef,
      preferred_provider: requestedProvider || undefined,
    };

    const pipelineResult = await executeSupervisedPipeline(input);

    return {
      execution_status: pipelineResult.success ? 'completed' : 'failed',
      execution_request_id: pipelineResult.execution_record?.execution_ref ?? null,
      execution_package_id: pipelineResult.package?.package_ref ?? null,
      execution_id: pipelineResult.execution_record?.id ?? null,
      selected_provider: providerInfo,
      failed_stage: pipelineResult.error ? 'execution_dispatch' : null,
      failure_code: pipelineResult.error ? 'pipeline_error' : null,
      failure_reason: pipelineResult.error,
      retryable: !pipelineResult.error?.includes('budget'),
      lifecycle_change_performed: pipelineResult.success,
      partial_changes_detected: false,
      rollback_status: pipelineResult.success ? null : 'not_required',
      audit_reference: pipelineResult.execution_record?.audit_reference ?? auditRef,
      pipeline_result: pipelineResult,
    };
  } catch (e) {
    return {
      execution_status: 'failed',
      execution_request_id: null,
      execution_package_id: null,
      execution_id: null,
      selected_provider: providerInfo,
      failed_stage: 'execution_dispatch',
      failure_code: 'exception',
      failure_reason: e instanceof Error ? e.message : 'Unknown error',
      retryable: true,
      lifecycle_change_performed: false,
      partial_changes_detected: false,
      rollback_status: 'not_required',
      audit_reference: auditRef,
      pipeline_result: null,
    };
  }
}

// ─── Full Routing ──────────────────────────────────────────────────────────────

export async function routeConversationToExecution(
  text: string,
  conversationId: string | null,
  activeEwoRef?: string | null,
  actor?: string
): Promise<ExecutionRoutingResult> {
  const auditRef = `EWO031-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Classify intent
  const intentDiagnostics = classifyExecutionIntent(text, activeEwoRef);

  // 2. Resolve conversation continuity
  const continuity = await resolveConversationContinuity(conversationId, text, intentDiagnostics);

  // 3. Route based on intent
  let gateResult: ExecutionGateResult | null = null;
  let dispatchResult: ExecutionDispatchResult | null = null;

  if (intentDiagnostics.detected_intent === 'execute_ewo') {
    const ewoRef = intentDiagnostics.resolved_engineering_object_reference ?? continuity.active_ewo_reference;
    if (ewoRef) {
      gateResult = await evaluateExecutionGate(ewoRef, /codex/i.test(text) ? 'codex' : null);
      if (gateResult.passed) {
        dispatchResult = await dispatchExecution(ewoRef, conversationId, /codex/i.test(text) ? 'codex' : null, actor);
      } else {
        dispatchResult = {
          execution_status: 'blocked',
          execution_request_id: null,
          execution_package_id: null,
          execution_id: null,
          selected_provider: null,
          failed_stage: gateResult.blockers.find(b => b.severity === 'critical')?.gate ?? 'unknown',
          failure_code: 'gate_failed',
          failure_reason: gateResult.next_required_action,
          retryable: true,
          lifecycle_change_performed: false,
          partial_changes_detected: false,
          rollback_status: null,
          audit_reference: auditRef,
          pipeline_result: null,
        };
      }
    }
  } else if (intentDiagnostics.detected_intent === 'inspect_execution') {
    // Inspection is read-only — no gate or dispatch needed
    intentDiagnostics.routing_decision = 'route_to_execution_inspection';
  } else if (intentDiagnostics.detected_intent === 'inspection' && intentDiagnostics.resolved_operation === 'inspectExecutionProviderPolicy') {
    // Provider policy inspection — read-only, returns authoritative policy data
    intentDiagnostics.routing_decision = 'route_to_provider_policy_inspection';
  } else if (intentDiagnostics.detected_intent === 'inspect_handoff') {
    // EWO-032: Handoff inspection — read-only, returns persisted runtime evidence
    intentDiagnostics.routing_decision = 'route_to_handoff_inspection';
  } else if (intentDiagnostics.detected_intent === 'approve_plan') {
    // EWO-032: Conversational plan approval — create execution request and dispatch
    const ewoRef = intentDiagnostics.resolved_engineering_object_reference ?? continuity.active_ewo_reference;
    if (ewoRef) {
      intentDiagnostics.routing_decision = 'route_to_approval_handoff';
      intentDiagnostics.execution_approval_detected = true;
      intentDiagnostics.confirmation_required = true;
    } else {
      intentDiagnostics.routing_decision = 'route_to_approval_refused';
      intentDiagnostics.refusal_reason = 'No pending governed engineering work order found for approval.';
    }
  } else if (intentDiagnostics.detected_intent === 'approve_execution') {
    const ewoRef = intentDiagnostics.resolved_engineering_object_reference ?? continuity.active_ewo_reference;
    if (ewoRef) {
      gateResult = await evaluateExecutionGate(ewoRef, /codex/i.test(text) ? 'codex' : null);
    }
  }

  // 4. Audit log
  await supabase.from('atd_connect_inspection_log').insert({
    request_id: auditRef,
    timestamp: new Date().toISOString(),
    requesting_persona: actor || 'product_owner',
    operation: intentDiagnostics.resolved_operation || 'unresolved',
    inspected_capability: intentDiagnostics.resolved_capability,
    outcome: dispatchResult?.execution_status === 'completed' ? 'success' : dispatchResult?.execution_status ?? 'info',
    request_source: 'mcp_client',
    original_request: text,
    session_id: conversationId,
    resolved_capability: intentDiagnostics.resolved_capability,
    resolved_operation: intentDiagnostics.resolved_operation,
    resolved_object_reference: intentDiagnostics.resolved_engineering_object_reference,
  });

  return {
    intent_diagnostics: intentDiagnostics,
    conversation_continuity: continuity,
    gate_result: gateResult,
    dispatch_result: dispatchResult,
    audit_reference: auditRef,
  };
}

// ─── Operation Mapping ─────────────────────────────────────────────────────────

export interface OperationMapping {
  intent: ConversationIntent;
  capability: string;
  operation: string;
  required_lifecycle_state: string;
  required_approval: string;
  permitted_next_lifecycle_state: string;
}

export const EXECUTION_OPERATION_MAPPINGS: OperationMapping[] = [
  {
    intent: 'create_ewo',
    capability: 'engineering-work-orders',
    operation: 'createEngineeringWorkOrderFromConversation',
    required_lifecycle_state: 'none',
    required_approval: 'none',
    permitted_next_lifecycle_state: 'registered',
  },
  {
    intent: 'prepare_analysis',
    capability: 'engineering-work-orders',
    operation: 'prepareEngineeringAnalysis',
    required_lifecycle_state: 'registered',
    required_approval: 'none',
    permitted_next_lifecycle_state: 'analysis_ready',
  },
  {
    intent: 'prepare_plan',
    capability: 'engineering-work-orders',
    operation: 'prepareEngineeringPlan',
    required_lifecycle_state: 'analysis_ready',
    required_approval: 'none',
    permitted_next_lifecycle_state: 'plan_ready',
  },
  {
    intent: 'approve_execution',
    capability: 'engineering-work-orders',
    operation: 'approveEngineeringWorkOrderForExecution',
    required_lifecycle_state: 'plan_ready',
    required_approval: 'product_owner_execution_approval',
    permitted_next_lifecycle_state: 'execution_approved',
  },
  {
    intent: 'execute_ewo',
    capability: 'supervised-engineering-execution',
    operation: 'executeEngineeringWorkOrder',
    required_lifecycle_state: 'execution_approved',
    required_approval: 'product_owner_execution_approval',
    permitted_next_lifecycle_state: 'executing',
  },
  {
    intent: 'inspect_execution',
    capability: 'supervised-engineering-execution',
    operation: 'inspectEngineeringExecution',
    required_lifecycle_state: 'any',
    required_approval: 'none',
    permitted_next_lifecycle_state: 'unchanged',
  },
  {
    intent: 'accept_ewo',
    capability: 'engineering-work-orders',
    operation: 'acceptEngineeringWorkOrder',
    required_lifecycle_state: 'engineering_complete',
    required_approval: 'product_owner_acceptance',
    permitted_next_lifecycle_state: 'closed',
  },
  {
    intent: 'inspection',
    capability: 'supervised-engineering-execution',
    operation: 'inspectExecutionProviderPolicy',
    required_lifecycle_state: 'any',
    required_approval: 'none',
    permitted_next_lifecycle_state: 'unchanged',
  },
  {
    intent: 'inspect_handoff',
    capability: 'supervised-engineering-execution',
    operation: 'inspectExecutionHandoff',
    required_lifecycle_state: 'any',
    required_approval: 'none',
    permitted_next_lifecycle_state: 'unchanged',
  },
  {
    intent: 'approve_plan',
    capability: 'supervised-engineering-execution',
    operation: 'approveAndHandoffExecution',
    required_lifecycle_state: 'plan_ready',
    required_approval: 'product_owner_execution_approval',
    permitted_next_lifecycle_state: 'execution_requested',
  },
];
