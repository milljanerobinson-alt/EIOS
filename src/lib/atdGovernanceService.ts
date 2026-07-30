import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GovernanceDecision = 'approved' | 'approved_with_conditions' | 'rejected';

export interface ApprovePlanInput {
  planId: string;
  intentId: string;
  decidedBy?: string;
  notes?: string;
}

export interface ApprovePlanWithConditionsInput extends ApprovePlanInput {
  conditions: string;
}

export interface RejectPlanInput {
  planId: string;
  intentId: string;
  rejectionReason: string;
  decidedBy?: string;
  notes?: string;
}

export interface GovernanceDecisionRecord {
  id: string;
  decision_ref: string;
  plan_id: string;
  intent_id: string;
  decision: GovernanceDecision;
  decided_by: string;
  decided_at: string;
  rejection_reason: string | null;
  conditions: string | null;
  notes: string | null;
  previous_plan_status: string | null;
  new_intent_status: string | null;
  organisation_id: string | null;
  created_at: string;
}

export interface GovernanceResult {
  success: boolean;
  decision: GovernanceDecisionRecord | null;
  /** Structured conflict code from the RPC (e.g. duplicate_decision, optimistic_lock_conflict) */
  conflictCode?: string;
  error?: string;
}

// ─── RPC response shape ────────────────────────────────────────────────────────

interface RpcGovernanceResponse {
  success: boolean;
  decision_id: string | null;
  decision_ref: string | null;
  decision: string | null;
  plan_status: string | null;
  intent_status: string | null;
  conflict_code: string | null;
  error_message: string | null;
}

// ─── ATD Governance Service ───────────────────────────────────────────────────

export const ATDGovernanceService = {

  async approvePlan(input: ApprovePlanInput): Promise<GovernanceResult> {
    return callApproveRpc({
      planId: input.planId,
      intentId: input.intentId,
      decidedBy: input.decidedBy ?? 'product_owner',
      notes: input.notes ?? null,
      conditions: null,
    });
  },

  async approvePlanWithConditions(input: ApprovePlanWithConditionsInput): Promise<GovernanceResult> {
    if (!input.conditions?.trim()) {
      return { success: false, decision: null, error: 'Conditions are required for conditional approval.' };
    }
    return callApproveRpc({
      planId: input.planId,
      intentId: input.intentId,
      decidedBy: input.decidedBy ?? 'product_owner',
      notes: input.notes ?? null,
      conditions: input.conditions.trim(),
    });
  },

  async rejectPlan(input: RejectPlanInput): Promise<GovernanceResult> {
    if (!input.rejectionReason?.trim()) {
      return { success: false, decision: null, error: 'Rejection reason is required.' };
    }
    return callRejectRpc({
      planId: input.planId,
      intentId: input.intentId,
      rejectionReason: input.rejectionReason.trim(),
      decidedBy: input.decidedBy ?? 'product_owner',
      notes: input.notes ?? null,
    });
  },

  async getDecisionForPlan(planId: string): Promise<GovernanceDecisionRecord | null> {
    const { data } = await supabase
      .from('atd_plan_governance_decisions')
      .select('*')
      .eq('plan_id', planId)
      .order('created_at', { ascending: false })
      .maybeSingle();
    return data as GovernanceDecisionRecord | null;
  },

  async listDecisionsForIntent(intentId: string): Promise<GovernanceDecisionRecord[]> {
    const { data } = await supabase
      .from('atd_plan_governance_decisions')
      .select('*')
      .eq('intent_id', intentId)
      .order('decided_at', { ascending: false });
    return (data ?? []) as GovernanceDecisionRecord[];
  },
};

// ─── RPC callers ──────────────────────────────────────────────────────────────

interface ApproveRpcInput {
  planId: string;
  intentId: string;
  decidedBy: string;
  notes: string | null;
  conditions: string | null;
}

async function callApproveRpc(input: ApproveRpcInput): Promise<GovernanceResult> {
  try {
    const { data, error } = await supabase.rpc('approve_engineering_plan', {
      p_plan_id: input.planId,
      p_intent_id: input.intentId,
      p_decided_by: input.decidedBy,
      p_notes: input.notes,
      p_conditions: input.conditions,
      p_expected_version: 0,
    });

    if (error) throw error;

    const resp = data as RpcGovernanceResponse;
    if (!resp.success) {
      return {
        success: false,
        decision: null,
        conflictCode: resp.conflict_code ?? undefined,
        error: resp.error_message ?? 'Governance RPC returned failure',
      };
    }

    // Fetch the full decision record for callers that need it
    const record = resp.decision_id
      ? await fetchDecisionById(resp.decision_id)
      : null;

    return { success: true, decision: record };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, decision: null, error: message };
  }
}

interface RejectRpcInput {
  planId: string;
  intentId: string;
  rejectionReason: string;
  decidedBy: string;
  notes: string | null;
}

async function callRejectRpc(input: RejectRpcInput): Promise<GovernanceResult> {
  try {
    const { data, error } = await supabase.rpc('reject_engineering_plan', {
      p_plan_id: input.planId,
      p_intent_id: input.intentId,
      p_rejection_reason: input.rejectionReason,
      p_decided_by: input.decidedBy,
      p_notes: input.notes,
      p_expected_version: 0,
    });

    if (error) throw error;

    const resp = data as RpcGovernanceResponse;
    if (!resp.success) {
      return {
        success: false,
        decision: null,
        conflictCode: resp.conflict_code ?? undefined,
        error: resp.error_message ?? 'Governance RPC returned failure',
      };
    }

    const record = resp.decision_id
      ? await fetchDecisionById(resp.decision_id)
      : null;

    return { success: true, decision: record };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, decision: null, error: message };
  }
}

async function fetchDecisionById(id: string): Promise<GovernanceDecisionRecord | null> {
  const { data } = await supabase
    .from('atd_plan_governance_decisions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data as GovernanceDecisionRecord | null;
}
