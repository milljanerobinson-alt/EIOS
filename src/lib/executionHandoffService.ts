// EWO-032 — Execution Handoff Service
// Creates governed execution requests after approval, dispatches to the
// supervised execution engine, and checks Codex readiness — returning
// exact runtime state rather than simulated progress.

import { supabase } from './supabase';
import {
  evaluateGovernanceGate,
  executeSupervisedPipeline,
  type SupervisedExecutionResult,
  type SupervisedExecutionInput,
} from './supervisedExecutionEngine';
import {
  selectGovernedProvider,
  type ProviderSelectionDiagnostics,
} from './providerPolicyService';
import {
  computeIdempotencyKey,
  type ApprovalResolutionResult,
} from './approvalResolutionService';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExecutionHandoffRequest {
  execution_request_id: string;
  ewo_ref: string;
  conversation_id: string | null;
  approved_plan_version: string | null;
  approval_reference: string;
  approving_persona: string | null;
  approval_timestamp: string;
  requested_provider_id: string;
  allowed_provider_ids: string[];
  fallback_permitted: boolean;
  repository_identifier: string | null;
  branch_policy: Record<string, unknown>;
  file_change_scope: Record<string, unknown>;
  deployment_policy: Record<string, unknown>;
  merge_policy: Record<string, unknown>;
  validation_requirements: unknown[];
  execution_status: string;
  execution_session_id: string | null;
  selected_provider_id: string | null;
  provider_selection_reason: string | null;
  provider_readiness_status: string;
  provider_readiness_detail: Record<string, unknown>;
  dispatch_attempted: boolean;
  dispatch_success: boolean;
  governed_execution_engine_invoked: boolean;
  failure_stage: string | null;
  exact_runtime_error: string | null;
  idempotency_key: string;
  audit_reference: string;
}

export interface HandoffDispatchResult {
  execution_request_created: boolean;
  execution_request_id: string | null;
  dispatch_attempted: boolean;
  dispatch_success: boolean;
  governed_execution_engine_invoked: boolean;
  execution_session_id: string | null;
  selected_provider_id: string | null;
  provider_selection_reason: string | null;
  provider_readiness_status: string;
  provider_readiness_detail: Record<string, unknown>;
  current_execution_status: string;
  failure_stage: string | null;
  exact_runtime_error: string | null;
  audit_reference: string;
  lifecycle_change_performed: boolean;
  is_duplicate: boolean;
}

// ─── Audit Helper ──────────────────────────────────────────────────────────────

async function recordHandoffAudit(
  handoffId: string,
  ewoRef: string,
  eventType: string,
  eventData: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('execution_handoff_audit').insert({
      handoff_id: handoffId,
      ewo_ref: ewoRef,
      event_type: eventType,
      event_data: eventData,
    });
  } catch {
    // Best-effort audit — do not block execution on audit failure
  }
}

// ─── Execution Request Creation ────────────────────────────────────────────────

async function createExecutionRequest(
  approval: ApprovalResolutionResult,
  auditRef: string
): Promise<{ record: ExecutionHandoffRequest | null; error: string | null; isDuplicate: boolean }> {
  const ewoRef = approval.resolved_ewo_ref!;
  const conversationId = approval.conversation_id!;
  const planVersion = approval.resolved_plan_version || 'unknown';
  const approvalReference = `APPR-${ewoRef}-${Date.now()}`;
  const idempotencyKey = computeIdempotencyKey(conversationId, ewoRef, planVersion, approvalReference);

  // Idempotency check — return existing request if one exists for this key
  const { data: existing } = await supabase
    .from('execution_handoff_requests')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existing) {
    return { record: mapDbToHandoff(existing), error: null, isDuplicate: true };
  }

  // Also check for any existing handoff for the same EWO + conversation that's not cancelled
  const { data: existingActive } = await supabase
    .from('execution_handoff_requests')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .eq('conversation_id', conversationId)
    .not('execution_status', 'eq', 'cancelled')
    .not('execution_status', 'eq', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingActive) {
    return { record: mapDbToHandoff(existingActive), error: null, isDuplicate: true };
  }

  // Resolve repository target
  const { data: target } = await supabase
    .from('execution_targets')
    .select('repository')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const executionRequestId = `EHR-${String(Date.now()).slice(-8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const { data: approvalEwo, error: approvalEwoError } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .single();
  if (approvalEwoError || !approvalEwo) {
    return { record: null, error: `Failed to resolve EWO for approval: ${approvalEwoError?.message || 'EWO not found'}`, isDuplicate: false };
  }

  // Approval must be durably persisted before any execution handoff exists.
  const { data: persistedApproval, error: approvalError } = await supabase.rpc('approve_ewo_for_execution', {
    p_ewo_ref: ewoRef,
    p_approved_by: approval.approving_persona || 'product_owner',
    p_decision: 'approved',
    p_approval_statement: 'Conversational approval for execution handoff.',
    p_provider_preference: 'codex',
  });

  if (approvalError) {
    return { record: null, error: `Failed to persist execution approval: ${approvalError.message}`, isDuplicate: false };
  }
  if (!persistedApproval || (typeof persistedApproval === 'object' && 'success' in persistedApproval && persistedApproval.success !== true)) {
    return { record: null, error: 'Failed to persist execution approval: persistence was not confirmed.', isDuplicate: false };
  }

  const { data: approvalReadback, error: approvalReadbackError } = await supabase
    .from('ewo_execution_approvals')
    .select('approval_ref, decision, product_owner, created_at')
    .eq('ewo_id', approvalEwo.id)
    .eq('decision', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (approvalReadbackError || !approvalReadback) {
    return { record: null, error: `Failed to verify execution approval: ${approvalReadbackError?.message || 'approval not found after persistence'}`, isDuplicate: false };
  }

  const insertData = {
    execution_request_id: executionRequestId,
    ewo_ref: ewoRef,
    conversation_id: conversationId,
    approved_plan_version: planVersion,
    approval_reference: approvalReference,
    approving_persona: approval.approving_persona,
    approval_timestamp: new Date().toISOString(),
    requested_provider_id: 'codex',
    allowed_provider_ids: ['codex'],
    fallback_permitted: false,
    repository_identifier: target?.repository || null,
    branch_policy: { disposable_branch: true, no_existing_files_modified: true },
    file_change_scope: { permitted_files: [], restricted_files: [] },
    deployment_policy: { deployment_permitted: false },
    merge_policy: { merge_permitted: false },
    validation_requirements: [],
    execution_status: 'approved',
    provider_readiness_status: 'not_checked',
    dispatch_attempted: false,
    dispatch_success: false,
    governed_execution_engine_invoked: false,
    idempotency_key: idempotencyKey,
    audit_reference: auditRef,
  };

  const { data, error } = await supabase
    .from('execution_handoff_requests')
    .insert(insertData)
    .select('*')
    .single();

  if (error) {
    return { record: null, error: `Failed to create execution request: ${error.message}`, isDuplicate: false };
  }

  const record = mapDbToHandoff(data);

  await recordHandoffAudit(data.id, ewoRef, 'approval_received', {
    raw_message: approval.raw_message,
    conversation_id: conversationId,
    approving_persona: approval.approving_persona,
  });

  await recordHandoffAudit(data.id, ewoRef, 'approval_validated', {
    ewo_ref: ewoRef,
    plan_version: planVersion,
    approval_reference: approvalReference,
  });

  await recordHandoffAudit(data.id, ewoRef, 'request_created', {
    execution_request_id: executionRequestId,
    idempotency_key: idempotencyKey,
  });

  return { record, error: null, isDuplicate: false };
}

// ─── Provider Readiness Gate ────────────────────────────────────────────────────

export interface ProviderReadinessResult {
  status: 'passed' | 'failed';
  detail: Record<string, unknown>;
  exact_error: string | null;
}

export async function checkProviderReadiness(
  ewoRef: string,
  requestedProvider: string
): Promise<ProviderReadinessResult> {
  const detail: Record<string, unknown> = {};

  // 1. Provider is registered
  const { data: provider, error: providerError } = await supabase
    .from('execution_provider_registry')
    .select('provider_id, provider_name, is_active, is_governed, configuration_status, credential_reference_status, provider_health, canonical_contract_version')
    .eq('provider_id', requestedProvider)
    .maybeSingle();

  if (providerError || !provider) {
    return {
      status: 'failed',
      detail: { ...detail, provider_registered: false },
      exact_error: `Provider "${requestedProvider}" is not registered in the execution provider registry.`,
    };
  }
  detail.provider_registered = true;
  detail.provider_name = provider.provider_name;

  // 2. Provider is active
  if (!provider.is_active) {
    return {
      status: 'failed',
      detail: { ...detail, provider_active: false },
      exact_error: `Provider "${provider.provider_name}" is not active.`,
    };
  }
  detail.provider_active = true;

  // 3. Provider is governed
  if (!provider.is_governed) {
    return {
      status: 'failed',
      detail: { ...detail, provider_governed: false },
      exact_error: `Provider "${provider.provider_name}" is not governed.`,
    };
  }
  detail.provider_governed = true;

  // 4. Provider is allowed by policy
  const { data: policy } = await supabase
    .from('execution_provider_policy')
    .select('allowed_provider_ids, fallback_permitted, policy_version')
    .eq('lifecycle_status', 'active')
    .maybeSingle();

  if (!policy) {
    return {
      status: 'failed',
      detail: { ...detail, policy_found: false },
      exact_error: 'No active execution provider policy found.',
    };
  }
  detail.policy_found = true;
  detail.policy_version = policy.policy_version;

  const allowedIds: string[] = Array.isArray(policy.allowed_provider_ids) ? policy.allowed_provider_ids : [];
  if (!allowedIds.includes(requestedProvider)) {
    return {
      status: 'failed',
      detail: { ...detail, provider_allowed: false, allowed_providers: allowedIds },
      exact_error: `Provider "${requestedProvider}" is not in the allowed provider list: [${allowedIds.join(', ')}].`,
    };
  }
  detail.provider_allowed = true;

  // 5. Configuration is complete
  if (provider.configuration_status === 'not_configured') {
    return {
      status: 'failed',
      detail: { ...detail, configuration_status: provider.configuration_status },
      exact_error: `Provider "${provider.provider_name}" configuration is not complete. Credentials are unavailable.`,
    };
  }
  detail.configuration_status = provider.configuration_status;

  // 6. Credentials are available
  if (provider.credential_reference_status === 'unavailable' || provider.credential_reference_status === 'revoked') {
    return {
      status: 'failed',
      detail: { ...detail, credential_status: provider.credential_reference_status },
      exact_error: `Provider "${provider.provider_name}" credentials are ${provider.credential_reference_status}.`,
    };
  }
  detail.credential_status = provider.credential_reference_status;

  // 7. Provider health is operational
  if (provider.provider_health && provider.provider_health !== 'healthy') {
    return {
      status: 'failed',
      detail: { ...detail, provider_health: provider.provider_health },
      exact_error: `Provider "${provider.provider_name}" health is ${provider.provider_health}.`,
    };
  }
  detail.provider_health = provider.provider_health || 'unknown';

  // 8. No fallback is permitted
  if (policy.fallback_permitted) {
    return {
      status: 'failed',
      detail: { ...detail, fallback_permitted: true },
      exact_error: 'Provider policy permits fallback. Codex-only execution requires fallback to be disabled.',
    };
  }
  detail.fallback_permitted = false;

  // 9. Contract compatibility
  if (provider.canonical_contract_version !== '1.0') {
    return {
      status: 'failed',
      detail: { ...detail, contract_version: provider.canonical_contract_version },
      exact_error: `Provider contract version ${provider.canonical_contract_version} is incompatible. Expected 1.0.`,
    };
  }
  detail.contract_version = provider.canonical_contract_version;

  return { status: 'passed', detail, exact_error: null };
}

// ─── Full Handoff Dispatch ──────────────────────────────────────────────────────

export async function performExecutionHandoff(
  approval: ApprovalResolutionResult,
  actor?: string
): Promise<HandoffDispatchResult> {
  const auditRef = `EWO032-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Create execution request (idempotent)
  const { record, error: createError, isDuplicate } = await createExecutionRequest(approval, auditRef);

  if (createError || !record) {
    return {
      execution_request_created: false,
      execution_request_id: null,
      dispatch_attempted: false,
      dispatch_success: false,
      governed_execution_engine_invoked: false,
      execution_session_id: null,
      selected_provider_id: null,
      provider_selection_reason: null,
      provider_readiness_status: 'not_checked',
      provider_readiness_detail: {},
      current_execution_status: 'failed',
      failure_stage: 'request_creation',
      exact_runtime_error: createError || 'Unknown error creating execution request.',
      audit_reference: auditRef,
      lifecycle_change_performed: false,
      is_duplicate: false,
    };
  }

  // If duplicate (already exists), return existing state
  if (isDuplicate) {
    return {
      execution_request_created: true,
      execution_request_id: record.execution_request_id,
      dispatch_attempted: record.dispatch_attempted,
      dispatch_success: record.dispatch_success,
      governed_execution_engine_invoked: record.governed_execution_engine_invoked,
      execution_session_id: record.execution_session_id,
      selected_provider_id: record.selected_provider_id,
      provider_selection_reason: record.provider_selection_reason,
      provider_readiness_status: record.provider_readiness_status,
      provider_readiness_detail: record.provider_readiness_detail,
      current_execution_status: record.execution_status,
      failure_stage: record.failure_stage,
      exact_runtime_error: record.exact_runtime_error,
      audit_reference: record.audit_reference,
      lifecycle_change_performed: false,
      is_duplicate: true,
    };
  }

  // 2. Resolve provider selection
  const providerDiagnostics: ProviderSelectionDiagnostics = await selectGovernedProvider(
    record.ewo_ref,
    record.requested_provider_id
  );

  const selectedProviderId = providerDiagnostics.selected_provider_id;
  const selectedProviderName = providerDiagnostics.selected_provider_name;
  const providerSelectionReason = providerDiagnostics.provider_selection_reason;

  // Update handoff record with provider selection
  await supabase
    .from('execution_handoff_requests')
    .update({
      selected_provider_id: selectedProviderId,
      provider_selection_reason: providerSelectionReason,
    })
    .eq('execution_request_id', record.execution_request_id);

  // 3. Provider readiness gate
  const readiness = await checkProviderReadiness(record.ewo_ref, record.requested_provider_id);

  await supabase
    .from('execution_handoff_requests')
    .update({
      provider_readiness_status: readiness.status,
      provider_readiness_detail: readiness.detail,
    })
    .eq('execution_request_id', record.execution_request_id);

  await recordHandoffAudit(record.id || '', record.ewo_ref, 'provider_readiness', {
    status: readiness.status,
    detail: readiness.detail,
  });

  if (readiness.status === 'failed') {
    await supabase
      .from('execution_handoff_requests')
      .update({
        execution_status: 'failed',
        failure_stage: 'provider_readiness',
        exact_runtime_error: readiness.exact_error,
      })
      .eq('execution_request_id', record.execution_request_id);

    return {
      execution_request_created: true,
      execution_request_id: record.execution_request_id,
      dispatch_attempted: false,
      dispatch_success: false,
      governed_execution_engine_invoked: false,
      execution_session_id: null,
      selected_provider_id: selectedProviderId,
      provider_selection_reason: providerSelectionReason,
      provider_readiness_status: 'failed',
      provider_readiness_detail: readiness.detail,
      current_execution_status: 'failed',
      failure_stage: 'provider_readiness',
      exact_runtime_error: readiness.exact_error,
      audit_reference: auditRef,
      lifecycle_change_performed: false,
      is_duplicate: false,
    };
  }

  // 4. Dispatch to supervised execution engine
  await supabase
    .from('execution_handoff_requests')
    .update({
      dispatch_attempted: true,
      governed_execution_engine_invoked: true,
      execution_status: 'dispatched',
    })
    .eq('execution_request_id', record.execution_request_id);

  await recordHandoffAudit(record.id || '', record.ewo_ref, 'dispatch_attempted', {
    selected_provider: selectedProviderId,
    provider_name: selectedProviderName,
  });

  let pipelineResult: SupervisedExecutionResult | null = null;
  let dispatchError: string | null = null;

  try {
    const input: SupervisedExecutionInput = {
      ewo_ref: record.ewo_ref,
      preferred_provider: record.requested_provider_id,
    };
    pipelineResult = await executeSupervisedPipeline(input);
  } catch (e) {
    dispatchError = e instanceof Error ? e.message : 'Unknown execution error';
  }

  const dispatchSuccess = pipelineResult?.success ?? false;
  const executionSessionId = pipelineResult?.execution_record?.execution_ref ?? null;

  if (dispatchError || (pipelineResult && !pipelineResult.success)) {
    const errorMsg = dispatchError || pipelineResult?.error || 'Execution pipeline failed';

    await supabase
      .from('execution_handoff_requests')
      .update({
        dispatch_success: false,
        execution_status: 'failed',
        execution_session_id: executionSessionId,
        failure_stage: 'execution',
        exact_runtime_error: errorMsg,
      })
      .eq('execution_request_id', record.execution_request_id);

    await recordHandoffAudit(record.id || '', record.ewo_ref, 'failure', {
      failure_stage: 'execution',
      error: errorMsg,
    });

    return {
      execution_request_created: true,
      execution_request_id: record.execution_request_id,
      dispatch_attempted: true,
      dispatch_success: false,
      governed_execution_engine_invoked: true,
      execution_session_id: executionSessionId,
      selected_provider_id: selectedProviderId,
      provider_selection_reason: providerSelectionReason,
      provider_readiness_status: 'passed',
      provider_readiness_detail: readiness.detail,
      current_execution_status: 'failed',
      failure_stage: 'execution',
      exact_runtime_error: errorMsg,
      audit_reference: auditRef,
      lifecycle_change_performed: false,
      is_duplicate: false,
    };
  }

  // 5. Success
  await supabase
    .from('execution_handoff_requests')
    .update({
      dispatch_success: true,
      execution_status: 'executing',
      execution_session_id: executionSessionId,
    })
    .eq('execution_request_id', record.execution_request_id);

  await recordHandoffAudit(record.id || '', record.ewo_ref, 'dispatch_result', {
    dispatch_success: true,
    execution_session_id: executionSessionId,
  });

  return {
    execution_request_created: true,
    execution_request_id: record.execution_request_id,
    dispatch_attempted: true,
    dispatch_success: true,
    governed_execution_engine_invoked: true,
    execution_session_id: executionSessionId,
    selected_provider_id: selectedProviderId,
    provider_selection_reason: providerSelectionReason,
    provider_readiness_status: 'passed',
    provider_readiness_detail: readiness.detail,
    current_execution_status: 'executing',
    failure_stage: null,
    exact_runtime_error: null,
    audit_reference: auditRef,
    lifecycle_change_performed: false,
    is_duplicate: false,
  };
}

// ─── Inspection ─────────────────────────────────────────────────────────────────

export async function inspectExecutionHandoff(
  ewoRef?: string | null,
  conversationId?: string | null
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('inspect_execution_handoff', {
    p_ewo_ref: ewoRef ?? null,
    p_conversation_id: conversationId ?? null,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
      data_source: 'inspect_execution_handoff RPC (authoritative)',
    };
  }

  const result = typeof data === 'string' ? JSON.parse(data) : data;
  return result as Record<string, unknown>;
}

// ─── DB Mapper ─────────────────────────────────────────────────────────────────

function mapDbToHandoff(row: Record<string, unknown>): ExecutionHandoffRequest {
  return {
    execution_request_id: row.execution_request_id as string,
    ewo_ref: row.ewo_ref as string,
    conversation_id: (row.conversation_id as string) || null,
    approved_plan_version: (row.approved_plan_version as string) || null,
    approval_reference: (row.approval_reference as string) || '',
    approving_persona: (row.approving_persona as string) || null,
    approval_timestamp: (row.approval_timestamp as string) || new Date().toISOString(),
    requested_provider_id: row.requested_provider_id as string,
    allowed_provider_ids: Array.isArray(row.allowed_provider_ids) ? row.allowed_provider_ids as string[] : ['codex'],
    fallback_permitted: row.fallback_permitted as boolean,
    repository_identifier: (row.repository_identifier as string) || null,
    branch_policy: (row.branch_policy as Record<string, unknown>) || {},
    file_change_scope: (row.file_change_scope as Record<string, unknown>) || {},
    deployment_policy: (row.deployment_policy as Record<string, unknown>) || {},
    merge_policy: (row.merge_policy as Record<string, unknown>) || {},
    validation_requirements: Array.isArray(row.validation_requirements) ? row.validation_requirements : [],
    execution_status: row.execution_status as string,
    execution_session_id: (row.execution_session_id as string) || null,
    selected_provider_id: (row.selected_provider_id as string) || null,
    provider_selection_reason: (row.provider_selection_reason as string) || null,
    provider_readiness_status: row.provider_readiness_status as string,
    provider_readiness_detail: (row.provider_readiness_detail as Record<string, unknown>) || {},
    dispatch_attempted: row.dispatch_attempted as boolean,
    dispatch_success: row.dispatch_success as boolean,
    governed_execution_engine_invoked: row.governed_execution_engine_invoked as boolean,
    failure_stage: (row.failure_stage as string) || null,
    exact_runtime_error: (row.exact_runtime_error as string) || null,
    idempotency_key: row.idempotency_key as string,
    audit_reference: (row.audit_reference as string) || '',
  };
}
