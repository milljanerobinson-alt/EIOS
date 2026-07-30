// EWO-032 — Approval Resolution Service
// Deterministic recognition of conversational approval for execution handoff.
// Distinguishes real approval from generic agreement, cancellation, and modification.

// ─── Approval Patterns ────────────────────────────────────────────────────────

const APPROVAL_PATTERNS: RegExp[] = [
  /^\s*approved\s*$/i,
  /^\s*approve\s*$/i,
  /^\s*proceed\s*$/i,
  /^\s*proceed\s+with\s+execution\s*$/i,
  /^\s*approved\s*,\s*execute\s*$/i,
  /^\s*confirm\s+execution\s*$/i,
  /^\s*yes\s*,\s*execute\s+the\s+approved\s+plan\s*$/i,
  /^\s*approved\s*$/i,
  /\bapproved\s+for\s+execution\b/i,
  /\bproceed\s+with\s+the\s+approved\s+plan\b/i,
  /\bconfirm\s+the\s+approved\s+plan\b/i,
  /\byes\s*,?\s*proceed\b/i,
  /\bexecute\s+the\s+approved\s+plan\b/i,
];

const CANCELLATION_PATTERNS: RegExp[] = [
  /\bdo\s+not\s+execute\b/i,
  /\bdon'?t\s+execute\b/i,
  /\bcancel\b/i,
  /\bstop\b/i,
  /\bhold\s+execution\b/i,
  /\babort\b/i,
  /\bdo\s+not\s+proceed\b/i,
];

const MODIFICATION_PATTERNS: RegExp[] = [
  /\bmodify\s+(?:the\s+)?plan\b/i,
  /\bchange\s+(?:the\s+)?requirements?\b/i,
  /\bchange\s+(?:the\s+)?plan\b/i,
  /\bupdate\s+(?:the\s+)?plan\b/i,
  /\brevise\s+(?:the\s+)?plan\b/i,
  /\bhold\s+(?:execution\s+)?until\b/i,
  /\bwait\s+(?:until|before)\b/i,
];

const AMBIGUOUS_APPROVAL_WITH_CANCELLATION: RegExp[] = [
  /approved\s*,?\s*but\s+do\s+not\s+execute\b/i,
  /approved\s*,?\s*but\s+(?:do\s+not\s+)?(?:execute|run|proceed)\s+(?:yet|now)\b/i,
  /proceed\s+(?:after|once)\s+(?:changing|updating|modifying)\b/i,
  /yes\s*,?\s*cancel\s+(?:it|this)\b/i,
];

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ApprovalResolutionResult {
  approval_detected: boolean;
  approval_validated: boolean;
  is_cancellation: boolean;
  is_modification: boolean;
  cancellation_overrides_approval: boolean;
  refusal_reason: string | null;
  raw_message: string;
  resolved_ewo_ref: string | null;
  resolved_plan_version: string | null;
  approving_persona: string | null;
  conversation_id: string | null;
}

export interface ApprovalValidationContext {
  conversation_id: string | null;
  active_ewo_ref: string | null;
  persona: string;
}

// ─── Approval Recognition ─────────────────────────────────────────────────────

export function recognizeApproval(text: string): {
  is_approval: boolean;
  is_cancellation: boolean;
  is_modification: boolean;
  cancellation_overrides: boolean;
} {
  const isCancellation = CANCELLATION_PATTERNS.some(p => p.test(text));
  const isModification = MODIFICATION_PATTERNS.some(p => p.test(text));
  const isAmbiguousCancel = AMBIGUOUS_APPROVAL_WITH_CANCELLATION.some(p => p.test(text));
  const isApproval = APPROVAL_PATTERNS.some(p => p.test(text));

  const cancellationOverrides = isCancellation || isModification || isAmbiguousCancel;

  return {
    is_approval: isApproval && !cancellationOverrides,
    is_cancellation: isCancellation || isAmbiguousCancel,
    is_modification: isModification,
    cancellation_overrides: cancellationOverrides,
  };
}

// ─── Approval Validation ──────────────────────────────────────────────────────

export async function validateApproval(
  text: string,
  context: ApprovalValidationContext
): Promise<ApprovalResolutionResult> {
  const recognition = recognizeApproval(text);

  // Cancellation/modification takes precedence
  if (recognition.cancellation_overrides) {
    return {
      approval_detected: recognition.is_approval,
      approval_validated: false,
      is_cancellation: recognition.is_cancellation,
      is_modification: recognition.is_modification,
      cancellation_overrides_approval: true,
      refusal_reason: recognition.is_cancellation
        ? 'Cancellation or stop request detected. Execution will not proceed.'
        : 'Plan modification request detected. Execution will not proceed until the plan is updated and re-approved.',
      raw_message: text,
      resolved_ewo_ref: context.active_ewo_ref,
      resolved_plan_version: null,
      approving_persona: context.persona,
      conversation_id: context.conversation_id,
    };
  }

  if (!recognition.is_approval) {
    return {
      approval_detected: false,
      approval_validated: false,
      is_cancellation: false,
      is_modification: false,
      cancellation_overrides_approval: false,
      refusal_reason: null,
      raw_message: text,
      resolved_ewo_ref: context.active_ewo_ref,
      resolved_plan_version: null,
      approving_persona: context.persona,
      conversation_id: context.conversation_id,
    };
  }

  // Approval detected — validate preconditions
  const { supabase } = await import('./supabase');
  const ewoRef = context.active_ewo_ref;

  // 1. Must have an active conversation
  if (!context.conversation_id) {
    return {
      approval_detected: true,
      approval_validated: false,
      is_cancellation: false,
      is_modification: false,
      cancellation_overrides_approval: false,
      refusal_reason: 'No active conversation context. Approval requires an active conversation.',
      raw_message: text,
      resolved_ewo_ref: ewoRef,
      resolved_plan_version: null,
      approving_persona: context.persona,
      conversation_id: context.conversation_id,
    };
  }

  // 2. Must have a pending governed EWO
  if (!ewoRef) {
    return {
      approval_detected: true,
      approval_validated: false,
      is_cancellation: false,
      is_modification: false,
      cancellation_overrides_approval: false,
      refusal_reason: 'No pending governed engineering work order found in conversation context.',
      raw_message: text,
      resolved_ewo_ref: null,
      resolved_plan_version: null,
      approving_persona: context.persona,
      conversation_id: context.conversation_id,
    };
  }

  const { data: ewo, error: ewoError } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, status, engineering_package_status, implementation_status')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (ewoError || !ewo) {
    return {
      approval_detected: true,
      approval_validated: false,
      is_cancellation: false,
      is_modification: false,
      cancellation_overrides_approval: false,
      refusal_reason: `Engineering Work Order ${ewoRef} not found.`,
      raw_message: text,
      resolved_ewo_ref: ewoRef,
      resolved_plan_version: null,
      approving_persona: context.persona,
      conversation_id: context.conversation_id,
    };
  }

  // 3. Must have a finalised execution plan
  const { data: plan } = await supabase
    .from('engineering_plans')
    .select('id, status, updated_at')
    .eq('ewo_ref', ewoRef)
    .eq('plan_type', 'plan')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return {
      approval_detected: true,
      approval_validated: false,
      is_cancellation: false,
      is_modification: false,
      cancellation_overrides_approval: false,
      refusal_reason: `No finalised execution plan found for ${ewoRef}. Prepare the engineering plan first.`,
      raw_message: text,
      resolved_ewo_ref: ewoRef,
      resolved_plan_version: null,
      approving_persona: context.persona,
      conversation_id: context.conversation_id,
    };
  }

  // 4. EWO must be in approval-required lifecycle state
  const approvalRequiredStates = ['draft', 'in_progress', 'approved', 'engineering_complete', 'verified', 'po_acceptance'];
  if (!approvalRequiredStates.includes(ewo.status)) {
    if (ewo.status === 'closed' || ewo.status === 'archived') {
      return {
        approval_detected: true,
        approval_validated: false,
        is_cancellation: false,
        is_modification: false,
        cancellation_overrides_approval: false,
        refusal_reason: `EWO ${ewoRef} is ${ewo.status}. Approval requires an active EWO.`,
        raw_message: text,
        resolved_ewo_ref: ewoRef,
        resolved_plan_version: null,
        approving_persona: context.persona,
        conversation_id: context.conversation_id,
      };
    }
  }

  // 5. Stale plan check — if a newer plan exists that hasn't been approved
  const { data: analysis } = await supabase
    .from('engineering_plans')
    .select('id, updated_at')
    .eq('ewo_ref', ewoRef)
    .eq('plan_type', 'analysis')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (analysis && plan && new Date(analysis.updated_at) > new Date(plan.updated_at)) {
    return {
      approval_detected: true,
      approval_validated: false,
      is_cancellation: false,
      is_modification: false,
      cancellation_overrides_approval: false,
      refusal_reason: `Stale plan detected for ${ewoRef}. The analysis was updated after the plan. Prepare a new plan before approving.`,
      raw_message: text,
      resolved_ewo_ref: ewoRef,
      resolved_plan_version: plan.id,
      approving_persona: context.persona,
      conversation_id: context.conversation_id,
    };
  }

  // All preconditions met
  return {
    approval_detected: true,
    approval_validated: true,
    is_cancellation: false,
    is_modification: false,
    cancellation_overrides_approval: false,
    refusal_reason: null,
    raw_message: text,
    resolved_ewo_ref: ewoRef,
    resolved_plan_version: plan.id,
    approving_persona: context.persona,
    conversation_id: context.conversation_id,
  };
}

// ─── Idempotency Key ───────────────────────────────────────────────────────────

export function computeIdempotencyKey(
  conversationId: string,
  ewoRef: string,
  planVersion: string,
  approvalReference: string
): string {
  return `${conversationId}+${ewoRef}+${planVersion}+${approvalReference}`;
}
