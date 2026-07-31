// EWO-037R.2 / EWO-038 / EWO-040 — Conversation-to-Execution Routing Bridge
// EWO-040: AI-Assisted Contextual Intent Resolution
//
// Architecture:
//   1. Call resolve-conversation-intent edge function (deterministic-first, AI-fallback)
//   2. If intent is deterministic → dispatch to existing edge functions
//   3. If intent is AI-assisted → dispatch based on StructuredIntent
//   4. If clarification required → return clarification card
//
// Governance remains server-side. AI proposes, EIOS authorises.

import { supabase } from './supabase';
import { classifyExecutionIntent, type IntentDiagnostics } from './executionIntentRouter';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExecutionBlockerCategory =
  | 'execution_intent_not_recognised'
  | 'product_owner_authority_missing'
  | 'engineering_work_order_not_found'
  | 'engineering_work_order_ambiguous'
  | 'engineering_work_order_not_executable'
  | 'approval_required'
  | 'approval_invalid'
  | 'provider_not_ready'
  | 'repository_not_ready'
  | 'execution_contract_invalid'
  | 'protected_path_violation'
  | 'execution_already_in_progress'
  | 'clarification_required'
  | 'runtime_error';

export interface ExecutionRoutingCard {
  detected_intent: string;
  routing_decision: string;
  product_owner_authority: 'verified' | 'missing' | 'not_checked';
  ewo_ref: string | null;
  ewo_id?: string | null;
  ewo_title: string | null;
  ewo_status?: string | null;
  created?: boolean;
  duplicate_of?: string | null;
  execution_request_id: string | null;
  lifecycle_state: string;
  provider_selected: string | null;
  provider_policy_version: number | null;
  repository_owner: string | null;
  repository_name: string | null;
  base_branch: string | null;
  proposed_execution_branch: string | null;
  approval_status: 'approved' | 'pending' | 'required' | 'not_applicable';
  readiness_status: 'ready' | 'blocked' | 'not_checked';
  fallback_permitted?: boolean;
  execution_preparation_available?: boolean;
  blockers: ExecutionBlockerDetail[];
  next_governed_action: string;
  audit_reference: string;
  server_authoritative?: boolean;
  codex_mutation_performed?: boolean;
  github_mutation_performed?: boolean;
  // EWO-040: AI-assisted intent resolution diagnostics
  routing_method?: 'deterministic' | 'ai_assisted' | 'clarification' | 'fallback';
  intent_confidence?: number;
  reasoning_summary?: string;
  rejected_proposals?: string[];
  replacement_task?: string | null;
  constraints?: string[];
  clarification_required?: boolean;
}

export interface ExecutionBlockerDetail {
  category: ExecutionBlockerCategory;
  message: string;
}

export interface ConversationExecutionRouteResult {
  routed: boolean;
  is_execution_intent: boolean;
  card: ExecutionRoutingCard | null;
  intent_diagnostics: IntentDiagnostics | null;
  error: string | null;
}

// ─── Structured Intent (from resolve-conversation-intent edge function) ────────

interface StructuredIntent {
  primaryIntent: string;
  referencedObjects: string[];
  requestedActions: string[];
  rejectedProposals: string[];
  replacementTask: string | null;
  constraints: string[];
  executionAuthorised: boolean;
  requiredNextStage: string | null;
  confidence: number;
  clarificationRequired: boolean;
  reasoningSummary: string;
}

interface IntentResolutionResponse {
  routing_method: 'deterministic' | 'ai_assisted' | 'clarification' | 'fallback';
  intent: StructuredIntent;
  ewo_ref: string | null;
  audit_reference: string;
  latency_ms: number;
  provider_used: string | null;
  model_used: string | null;
  error: string | null;
}

// ─── Extract EWO reference from text (client-side, for UX only) ────────────────

function extractEwoRef(text: string): string | null {
  const match = text.match(/(EWO-[\w.-]+)/i);
  return match ? match[1] : null;
}

// ─── Extract title from conversation text (UX only) ────────────────────────────

function extractEwoTitle(text: string): string | null {
  const createMatch = text.match(/\bcreate\s+(?:an?\s+)?ewo\s+(?:for\s+)?(?:to\s+)?(.+?)(?:\.|$)/i);
  if (createMatch) return createMatch[1].trim();

  const implementMatch = text.match(/\bimplement\s+(?:this|the)?\s*(.+?)(?:\.|$)/i);
  if (implementMatch) return implementMatch[1].trim();

  const beginMatch = text.match(/\bbegin\s+implementation\s+of\s+(.+?)(?:\.|$)/i);
  if (beginMatch) return beginMatch[1].trim();

  const proceedMatch = text.match(/\bproceed\s+with\s+implementation\s+of\s+(.+?)(?:\.|$)/i);
  if (proceedMatch) return proceedMatch[1].trim();

  // EWO-040: Extract from replacement task in AI intent
  return null;
}

// ─── Main Routing Bridge ───────────────────────────────────────────────────────
// EWO-040: AI-Assisted Contextual Intent Resolution
//
// Flow:
//   1. Call resolve-conversation-intent edge function
//   2. If deterministic command → dispatch to existing edge functions
//   3. If AI-assisted → dispatch based on StructuredIntent
//   4. If clarification required → return clarification card

export async function routeConversationToExecution(params: {
  text: string;
  conversationId: string | null;
  stopBeforeExecution?: boolean;
}): Promise<ConversationExecutionRouteResult> {
  const { text, conversationId } = params;
  const intentDiagnostics = classifyExecutionIntent(text, null);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const authHeader = `Bearer ${session?.access_token ?? ''}`;
    const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;

    // ── 1. Call resolve-conversation-intent edge function ──────────────────────
    const intentResponse = await fetch(
      `${baseUrl}/functions/v1/resolve-conversation-intent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'apikey': apiKey,
        },
        body: JSON.stringify({
          text,
          conversation_id: conversationId,
        }),
      },
    );

    if (!intentResponse.ok) {
      const errorText = await intentResponse.text();
      return {
        routed: true,
        is_execution_intent: true,
        card: null,
        intent_diagnostics: intentDiagnostics,
        error: `Intent resolution failed: ${intentResponse.status} ${errorText}`,
      };
    }

    const intentResult = await intentResponse.json() as IntentResolutionResponse;
    const intent = intentResult.intent;

    // ── 2. If clarification required, return clarification card ────────────────
    if (intent.clarificationRequired || intent.primaryIntent === 'clarification_required') {
      // If confidence is very low and no engineering objects are referenced,
      // treat as non-execution (advisory/general conversation)
      const isNonEngineering = intent.confidence < 0.5 &&
        intent.referencedObjects.length === 0 &&
        intent.requestedActions.length === 0;
      if (isNonEngineering) {
        return {
          routed: false,
          is_execution_intent: false,
          card: null,
          intent_diagnostics: intentDiagnostics,
          error: null,
        };
      }

      return {
        routed: true,
        is_execution_intent: true,
        card: {
          detected_intent: 'clarification_required',
          routing_decision: 'clarification_required',
          product_owner_authority: 'not_checked',
          ewo_ref: intentResult.ewo_ref,
          ewo_title: null,
          execution_request_id: null,
          lifecycle_state: 'clarification',
          provider_selected: null,
          provider_policy_version: null,
          repository_owner: null,
          repository_name: null,
          base_branch: null,
          proposed_execution_branch: null,
          approval_status: 'not_applicable',
          readiness_status: 'not_checked',
          blockers: [{
            category: 'clarification_required',
            message: `The engineering intent could not be determined with sufficient confidence (${(intent.confidence * 100).toFixed(0)}%). Please clarify: ${intent.reasoningSummary}`,
          }],
          next_governed_action: `Please clarify your request. Confidence was ${(intent.confidence * 100).toFixed(0)}%.`,
          audit_reference: intentResult.audit_reference,
          server_authoritative: true,
          codex_mutation_performed: false,
          github_mutation_performed: false,
          routing_method: intentResult.routing_method,
          intent_confidence: intent.confidence,
          reasoning_summary: intent.reasoningSummary,
          rejected_proposals: intent.rejectedProposals,
          replacement_task: intent.replacementTask,
          constraints: intent.constraints,
          clarification_required: true,
        },
        intent_diagnostics: intentDiagnostics,
        error: null,
      };
    }

    // ── 3. If advisory, return not routed ──────────────────────────────────────
    if (intent.primaryIntent === 'advisory') {
      return {
        routed: false,
        is_execution_intent: false,
        card: null,
        intent_diagnostics: intentDiagnostics,
        error: null,
      };
    }

    // ── 4. Dispatch based on primary intent ────────────────────────────────────
    const ewoRef = intentResult.ewo_ref ?? extractEwoRef(text);
    const stopBefore = params.stopBeforeExecution ??
      (intent.constraints.some(c => /do\s+not\s+execute|stop\s+before|wait\s+for/i.test(c)) ||
        /\bstop\s+before\b/i.test(text) ||
        /\bprepare\b/i.test(text));

    // 4a. Create EWO
    if (intent.primaryIntent === 'create_ewo') {
      const title = intent.replacementTask ?? extractEwoTitle(text) ?? 'Engineering Work Order from Conversation';
      const response = await fetch(
        `${baseUrl}/functions/v1/create-engineering-work-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'apikey': apiKey,
          },
          body: JSON.stringify({
            title,
            executive_summary: title,
            conversation_id: conversationId,
            implementation_provider: 'codex',
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          routed: true,
          is_execution_intent: true,
          card: null,
          intent_diagnostics: intentDiagnostics,
          error: `Server-side EWO creation failed: ${response.status} ${errorText}`,
        };
      }

      const serverResult = await response.json() as ExecutionRoutingCard;
      // Enrich with AI intent diagnostics
      serverResult.routing_method = intentResult.routing_method;
      serverResult.intent_confidence = intent.confidence;
      serverResult.reasoning_summary = intent.reasoningSummary;
      serverResult.rejected_proposals = intent.rejectedProposals;
      serverResult.replacement_task = intent.replacementTask;
      serverResult.constraints = intent.constraints;
      serverResult.clarification_required = false;

      return {
        routed: true,
        is_execution_intent: true,
        card: serverResult,
        intent_diagnostics: intentDiagnostics,
        error: null,
      };
    }

    // 4b. Prepare execution
    if (intent.primaryIntent === 'prepare_execution') {
      const response = await fetch(
        `${baseUrl}/functions/v1/prepare-execution-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'apikey': apiKey,
          },
          body: JSON.stringify({
            ewo_ref: ewoRef,
            conversation_id: conversationId,
            intent: 'engineering_execution_prepare',
            stop_before_execution: stopBefore,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          routed: true,
          is_execution_intent: true,
          card: null,
          intent_diagnostics: intentDiagnostics,
          error: `Server-side preparation failed: ${response.status} ${errorText}`,
        };
      }

      const serverResult = await response.json() as ExecutionRoutingCard;
      serverResult.routing_method = intentResult.routing_method;
      serverResult.intent_confidence = intent.confidence;
      serverResult.reasoning_summary = intent.reasoningSummary;
      serverResult.constraints = intent.constraints;

      return {
        routed: true,
        is_execution_intent: true,
        card: serverResult,
        intent_diagnostics: intentDiagnostics,
        error: null,
      };
    }

    // 4c. Authorise execution
    if (intent.primaryIntent === 'authorise_execution') {
      const response = await fetch(
        `${baseUrl}/functions/v1/prepare-execution-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'apikey': apiKey,
          },
          body: JSON.stringify({
            ewo_ref: ewoRef,
            conversation_id: conversationId,
            intent: 'engineering_execution_authorisation',
            stop_before_execution: false,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          routed: true,
          is_execution_intent: true,
          card: null,
          intent_diagnostics: intentDiagnostics,
          error: `Server-side authorisation failed: ${response.status} ${errorText}`,
        };
      }

      const serverResult = await response.json() as ExecutionRoutingCard;
      serverResult.routing_method = intentResult.routing_method;
      serverResult.intent_confidence = intent.confidence;
      serverResult.reasoning_summary = intent.reasoningSummary;

      return {
        routed: true,
        is_execution_intent: true,
        card: serverResult,
        intent_diagnostics: intentDiagnostics,
        error: null,
      };
    }

    // 4d. Cancel execution
    if (intent.primaryIntent === 'cancel_execution') {
      return {
        routed: true,
        is_execution_intent: true,
        card: {
          detected_intent: 'cancel_execution',
          routing_decision: 'cancel_execution',
          product_owner_authority: 'not_checked',
          ewo_ref: ewoRef,
          ewo_title: null,
          execution_request_id: null,
          lifecycle_state: 'cancel_requested',
          provider_selected: null,
          provider_policy_version: null,
          repository_owner: null,
          repository_name: null,
          base_branch: null,
          proposed_execution_branch: null,
          approval_status: 'not_applicable',
          readiness_status: 'not_checked',
          blockers: [],
          next_governed_action: `Cancellation requested for ${ewoRef ?? 'the execution request'}. Server-side governance validation required.`,
          audit_reference: intentResult.audit_reference,
          server_authoritative: true,
          codex_mutation_performed: false,
          github_mutation_performed: false,
          routing_method: intentResult.routing_method,
          intent_confidence: intent.confidence,
          reasoning_summary: intent.reasoningSummary,
        },
        intent_diagnostics: intentDiagnostics,
        error: null,
      };
    }

    // 4e. EWO-042: Inspect execution package — read-only, no lifecycle change
    if (intent.primaryIntent === 'inspect_execution_package') {
      const { data: inspectResult, error: inspectError } = await supabase.rpc('inspect_execution_package', {
        p_ewo_ref: ewoRef,
      });

      if (inspectError || !inspectResult || !inspectResult.success) {
        return {
          routed: true,
          is_execution_intent: true,
          card: {
            detected_intent: 'inspect_execution_package',
            routing_decision: 'inspection_failed',
            product_owner_authority: 'not_checked',
            ewo_ref: ewoRef,
            ewo_title: null,
            execution_request_id: null,
            lifecycle_state: 'inspection_failed',
            provider_selected: null,
            provider_policy_version: null,
            repository_owner: null,
            repository_name: null,
            base_branch: null,
            proposed_execution_branch: null,
            approval_status: 'not_applicable',
            readiness_status: 'not_checked',
            blockers: [{
              category: 'runtime_error',
              message: `Execution package inspection failed: ${inspectError?.message ?? inspectResult?.error ?? 'unknown'}`,
            }],
            next_governed_action: 'Verify the EWO reference and that an execution package exists.',
            audit_reference: intentResult.audit_reference,
            server_authoritative: true,
            codex_mutation_performed: false,
            github_mutation_performed: false,
            routing_method: intentResult.routing_method,
            intent_confidence: intent.confidence,
            reasoning_summary: intent.reasoningSummary,
          },
          intent_diagnostics: intentDiagnostics,
          error: null,
        };
      }

      return {
        routed: true,
        is_execution_intent: true,
        card: {
          detected_intent: 'inspect_execution_package',
          routing_decision: 'route_to_execution_package_inspection',
          product_owner_authority: 'not_checked',
          ewo_ref: ewoRef,
          ewo_title: inspectResult.execution?.ewo_title ?? null,
          execution_request_id: inspectResult.execution?.execution_request_id ?? null,
          lifecycle_state: inspectResult.execution?.lifecycle_state ?? 'unknown',
          provider_selected: inspectResult.repository?.provider ?? null,
          provider_policy_version: null,
          repository_owner: null,
          repository_name: inspectResult.repository?.repository ?? null,
          base_branch: inspectResult.repository?.base_branch ?? null,
          proposed_execution_branch: inspectResult.repository?.working_branch ?? null,
          approval_status: inspectResult.execution?.approval_status ?? 'not_applicable',
          readiness_status: inspectResult.execution?.execution_readiness === 'package_ready' ? 'ready' : 'not_checked',
          blockers: [],
          next_governed_action: 'Review the execution package details above. No lifecycle changes were made.',
          audit_reference: inspectResult.audit_reference ?? intentResult.audit_reference,
          server_authoritative: true,
          codex_mutation_performed: false,
          github_mutation_performed: false,
          routing_method: intentResult.routing_method,
          intent_confidence: intent.confidence,
          reasoning_summary: intent.reasoningSummary,
          execution_package_inspection: inspectResult,
        },
        intent_diagnostics: intentDiagnostics,
        error: null,
      };
    }

    // 4f. Inspect status / review completion / accept EWO — pass through
    if (['inspect_status', 'review_completion', 'accept_ewo'].includes(intent.primaryIntent)) {
      return {
        routed: true,
        is_execution_intent: true,
        card: {
          detected_intent: intent.primaryIntent,
          routing_decision: intent.primaryIntent,
          product_owner_authority: 'not_checked',
          ewo_ref: ewoRef,
          ewo_title: null,
          execution_request_id: null,
          lifecycle_state: intent.primaryIntent,
          provider_selected: null,
          provider_policy_version: null,
          repository_owner: null,
          repository_name: null,
          base_branch: null,
          proposed_execution_branch: null,
          approval_status: 'not_applicable',
          readiness_status: 'not_checked',
          blockers: [],
          next_governed_action: `${intent.primaryIntent} requested for ${ewoRef ?? 'the EWO'}.`,
          audit_reference: intentResult.audit_reference,
          server_authoritative: true,
          codex_mutation_performed: false,
          github_mutation_performed: false,
          routing_method: intentResult.routing_method,
          intent_confidence: intent.confidence,
          reasoning_summary: intent.reasoningSummary,
        },
        intent_diagnostics: intentDiagnostics,
        error: null,
      };
    }

    // ── 5. Unrecognised intent → clarification ──────────────────────────────────
    return {
      routed: true,
      is_execution_intent: true,
      card: {
        detected_intent: 'unrecognised',
        routing_decision: 'clarification_required',
        product_owner_authority: 'not_checked',
        ewo_ref: ewoRef,
        ewo_title: null,
        execution_request_id: null,
        lifecycle_state: 'unrecognised',
        provider_selected: null,
        provider_policy_version: null,
        repository_owner: null,
        repository_name: null,
        base_branch: null,
        proposed_execution_branch: null,
        approval_status: 'not_applicable',
        readiness_status: 'not_checked',
        blockers: [{
          category: 'execution_intent_not_recognised',
          message: 'The engineering intent could not be determined. Please clarify your request.',
        }],
        next_governed_action: 'Please clarify your request.',
        audit_reference: intentResult.audit_reference,
        server_authoritative: true,
        codex_mutation_performed: false,
        github_mutation_performed: false,
        routing_method: intentResult.routing_method,
        intent_confidence: intent.confidence,
        reasoning_summary: intent.reasoningSummary,
      },
      intent_diagnostics: intentDiagnostics,
      error: null,
    };
  } catch (err) {
    return {
      routed: true,
      is_execution_intent: true,
      card: null,
      intent_diagnostics: intentDiagnostics,
      error: `Failed to call intent resolution: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

// ─── Legacy: Canonical Execution Intent Classification ─────────────────────────
// Preserved for backward compatibility with existing tests that call
// classifyCanonicalExecutionIntent() directly.

export type CanonicalExecutionIntent =
  | 'create_ewo'
  | 'engineering_execution_authorisation'
  | 'engineering_execution_prepare'
  | 'engineering_execution_resume'
  | 'engineering_execution_status'
  | 'engineering_execution_review'
  | 'engineering_execution_cancel'
  | 'not_execution';

const CREATE_EWO_PATTERNS = [
  /\bcreate\s+(?:the\s+|an?\s+)?(?:ewo|engineering\s+work\s+order)\b/i,
  /\bcreate\s+(?:the\s+|an?\s+)?ewo\s+for\s+/i,
  /\bregister\s+(?:the\s+|an?\s+)?(?:ewo|engineering\s+work\s+order)\b/i,
  /\bcreate\s+(?:ewo\s+)?(EWO-[\w.-]+)/i,
  /\bimplement\s+this\b/i,
  /\bproceed\s+with\s+implementation\b/i,
  /\bbegin\s+implementation\b/i,
  /\bprepare\s+this\s+work\b/i,
  /\bauthorise?\s+implementation\b/i,
  /\bauthorize?\s+implementation\b/i,
];

const EXECUTION_AUTHORISATION_PATTERNS = [
  /\bauthorise?\s+(?:this\s+)?(?:engineering\s+work\s+order|ewo)\b/i,
  /\bauthorise?\s+(?:EWO-[\w.-]+)\b/i,
  /\bauthorize?\s+(?:this\s+)?(?:engineering\s+work\s+order|ewo)\b/i,
  /\bauthorize?\s+(?:EWO-[\w.-]+)\b/i,
  /\bbegin\s+governed\s+execution\b/i,
  /\bprepare\s+(?:this\s+)?(?:ewo|engineering\s+work\s+order)\s+for\s+execution\b/i,
  /\bprepare\s+(?:the\s+)?execution\s+request\b/i,
  /\bcreate\s+(?:the\s+)?execution\s+request\b/i,
  /\bexecute\s+(?:the\s+)?approved\s+(?:engineering\s+work\s+order|ewo|plan)\b/i,
  /\bresume\s+(?:the\s+)?governed\s+execution\b/i,
  /\bresume\s+(?:EWO-[\w.-]+)\b/i,
  /\brun\s+(?:EWO-[\w.-]+\s+)?through\s+(?:the\s+)?governed\s+(?:github\s+)?pipeline\b/i,
  /\buse\s+codex\b/i,
  /\bstop\s+before\s+(?:provider\s+execution|merge|github\s+mutation)\b/i,
  /\bdo\s+not\s+deploy\b/i,
  /\bprepare\s+(?:EWO-[\w.-]+)\s+for\s+(?:governed\s+)?execution\b/i,
];

const PREPARE_PATTERNS = [
  /\bprepare\s+/i,
  /\bcreate\s+(?:the\s+)?execution\s+request\b/i,
  /\bstop\s+before\b/i,
];

const RESUME_PATTERNS = [
  /\bresume\s+/i,
  /\bcontinue\s+(?:the\s+)?(?:in-progress\s+)?execution\b/i,
];

const STATUS_PATTERNS = [
  /\b(?:status|state)\s+(?:of\s+)?(?:the\s+)?(?:execution|ewo)\b/i,
  /\bshow\s+(?:me\s+)?(?:the\s+)?execution\s+(?:status|state)\b/i,
  /\binspect\s+(?:the\s+)?execution\b/i,
];

const CANCEL_PATTERNS = [
  /\bstop\s+before\s+merge\b/i,
  /\bdo\s+not\s+merge\b/i,
  /\bcancel\s+(?:the\s+)?execution\b/i,
  /\babort\s+(?:the\s+)?execution\b/i,
];

const REVIEW_PATTERNS = [
  /\breview\s+(?:the\s+)?(?:execution|completion)\b/i,
  /\bshow\s+(?:me\s+)?(?:the\s+)?completion\b/i,
];

export function classifyCanonicalExecutionIntent(text: string): CanonicalExecutionIntent {
  const lower = text.toLowerCase();

  // EWO-038: Check create_ewo intent FIRST (before execution patterns)
  if (CREATE_EWO_PATTERNS.some(p => p.test(text))) {
    if (!/\bauthorise?\s+(?:this\s+)?(?:ewo|engineering\s+work\s+order)\s+for\s+(?:governed\s+)?execution\b/i.test(text) &&
        !/\bauthorize?\s+(?:this\s+)?(?:ewo|engineering\s+work\s+order)\s+for\s+(?:governed\s+)?execution\b/i.test(text)) {
      return 'create_ewo';
    }
  }

  if (CANCEL_PATTERNS.some(p => p.test(text))) return 'engineering_execution_cancel';
  if (RESUME_PATTERNS.some(p => p.test(text))) return 'engineering_execution_resume';
  if (STATUS_PATTERNS.some(p => p.test(text))) return 'engineering_execution_status';
  if (REVIEW_PATTERNS.some(p => p.test(text))) return 'engineering_execution_review';

  if (PREPARE_PATTERNS.some(p => p.test(text)) && !/\bauthorise?\b/i.test(text) && !/\bauthorize?\b/i.test(text)) {
    return 'engineering_execution_prepare';
  }

  if (EXECUTION_AUTHORISATION_PATTERNS.some(p => p.test(text))) {
    if (/\bprepare\b/i.test(lower) || /\bstop\s+before\b/i.test(lower)) {
      return 'engineering_execution_prepare';
    }
    return 'engineering_execution_authorisation';
  }

  const existingDiagnostics = classifyExecutionIntent(text, null);
  if (existingDiagnostics.execution_requested || existingDiagnostics.execution_approval_detected) {
    if (existingDiagnostics.detected_intent === 'approve_plan' || existingDiagnostics.detected_intent === 'approve_execution') {
      return 'engineering_execution_authorisation';
    }
    if (existingDiagnostics.detected_intent === 'execute_ewo') {
      return 'engineering_execution_authorisation';
    }
    if (existingDiagnostics.detected_intent === 'inspect_execution') {
      return 'engineering_execution_status';
    }
  }

  return 'not_execution';
}
