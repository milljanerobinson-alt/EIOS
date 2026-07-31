/**
 * EWO-044 — Codex-Native ATD Conversation Engine
 *
 * EIOS Governed Tool Server.
 * Executes tools requested by the configured provider.
 * All governance checks happen here — the provider cannot execute anything directly.
 */

import { supabase } from '../supabase';
import { getToolDefinition, isGovernedTool, isReadOnlyTool } from './toolRegistry';
import type { ProviderToolResult, ProviderError, GovernanceBlocker } from './providerContract';
import { loadRepositoryConfig, inspectRepository, readFile as readRepoFile, type RepositoryConfig } from '../githubRepositoryService';

// ─── Tool Execution Context ──────────────────────────────────────────────────

export interface ToolExecutionContext {
  conversationId: string;
  userId: string;
  userRole: string;
  tenantId: string | null;
  projectId: string | null;
  ewoRef: string | null;
}

export interface ToolExecutionResult {
  success: boolean;
  result: unknown;
  error: ProviderError | null;
  auditReference: string;
  governed: boolean;
  readOnly: boolean;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

async function recordToolAudit(
  ctx: ToolExecutionContext,
  toolName: string,
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): Promise<string> {
  const auditRef = `EIOS-TOOL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ewoRef = (params.ewo_ref as string) ?? ctx.ewoRef ?? null;
  try {
    await supabase.from('atd_connect_inspection_log').insert({
      request_id: auditRef,
      timestamp: new Date().toISOString(),
      requesting_persona: 'atd',
      operation: toolName,
      inspected_capability: toolName,
      outcome: result.success ? 'success' : 'error',
      request_source: 'conversational',
      original_request: JSON.stringify(params).slice(0, 2000),
      session_id: ctx.conversationId,
      resolved_capability: toolName,
      resolved_operation: toolName,
      resolved_object_reference: ewoRef,
      provider: 'eios_tool_server',
      provider_model: 'deterministic',
      provider_version: '1.0',
      policy_version: '1.0',
      context_version: '1.0',
      lifecycle_decision: result.governed ? toolName : null,
      governance_decision: result.governed ? (result.success ? 'approved' : 'blocked') : 'none',
      requested_tools: [toolName],
      executed_tools: [toolName],
    });
  } catch (auditErr) {
    console.warn('[EIOS] Tool audit insert failed:', auditErr instanceof Error ? auditErr.message : String(auditErr));
  }
  return auditRef;
}

// ─── Governance Checks ────────────────────────────────────────────────────────

function governanceError(blockers: GovernanceBlocker[]): ProviderError {
  return {
    code: 'GOVERNANCE_BLOCKED',
    message: blockers.map((b) => b.message).join('; '),
    category: 'governance_blocked',
    retryable: true,
    governance_blockers: blockers,
  };
}

async function checkPoAuthority(ctx: ToolExecutionContext): Promise<GovernanceBlocker[]> {
  const blockers: GovernanceBlocker[] = [];
  if (!ctx.userId) {
    blockers.push({
      gate: 'po_authority',
      message: 'Authentication required.',
      required_action: 'authenticate',
    });
    return blockers;
  }
  const adminRoles = ['admin', 'product_owner', 'po', 'approver'];
  if (!adminRoles.includes(ctx.userRole)) {
    blockers.push({
      gate: 'po_authority',
      message: `User role "${ctx.userRole}" is not authorised for governed actions.`,
      required_action: 'request_po_authority',
    });
  }
  return blockers;
}

async function checkLifecycleState(ewoRef: string): Promise<{ blockers: GovernanceBlocker[]; ewo: Record<string, unknown> | null }> {
  const { data: ewo } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, status, engineering_package_status, implementation_status')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (!ewo) {
    return {
      blockers: [{
        gate: 'ewo_exists',
        message: `Engineering Work Order ${ewoRef} not found.`,
        required_action: 'create_ewo_first',
      }],
      ewo: null,
    };
  }
  return { blockers: [], ewo };
}

// ─── Tool Executor ───────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const toolDef = getToolDefinition(toolName);
  if (!toolDef) {
    return {
      success: false,
      result: null,
      error: {
        code: 'UNKNOWN_TOOL',
        message: `Tool "${toolName}" is not registered in the EIOS tool registry.`,
        category: 'unknown',
        retryable: false,
      },
      auditReference: '',
      governed: false,
      readOnly: false,
    };
  }

  const governed = isGovernedTool(toolName);
  const readOnly = isReadOnlyTool(toolName);

  // Governance checks for governed tools
  if (governed) {
    if (toolDef.governanceGate === 'po_authority' || toolDef.governanceGate === 'po_approval') {
      const authBlockers = await checkPoAuthority(ctx);
      if (authBlockers.length > 0) {
        const result: ToolExecutionResult = {
          success: false,
          result: null,
          error: governanceError(authBlockers),
          auditReference: '',
          governed: true,
          readOnly: false,
        };
        result.auditReference = await recordToolAudit(ctx, toolName, params, result);
        return result;
      }
    }

    if (toolDef.governanceGate === 'lifecycle_state' || toolDef.governanceGate === 'execution_gate') {
      const ewoRef = (params.ewo_ref as string) ?? ctx.ewoRef;
      if (!ewoRef) {
        const result: ToolExecutionResult = {
          success: false,
          result: null,
          error: {
            code: 'NO_EWO_REFERENCE',
            message: 'An EWO reference is required for this action.',
            category: 'data_not_found',
            retryable: false,
          },
          auditReference: '',
          governed: true,
          readOnly: false,
        };
        result.auditReference = await recordToolAudit(ctx, toolName, params, result);
        return result;
      }
      const { blockers } = await checkLifecycleState(ewoRef);
      if (blockers.length > 0) {
        const result: ToolExecutionResult = {
          success: false,
          result: null,
          error: governanceError(blockers),
          auditReference: '',
          governed: true,
          readOnly: false,
        };
        result.auditReference = await recordToolAudit(ctx, toolName, params, result);
        return result;
      }
    }
  }

  // Execute the tool
  let executionResult: ToolExecutionResult;
  try {
    executionResult = await dispatchTool(toolName, params, ctx);
  } catch (e) {
    executionResult = {
      success: false,
      result: null,
      error: {
        code: 'EXECUTION_ERROR',
        message: e instanceof Error ? e.message : 'Unknown execution error',
        category: 'unknown',
        retryable: true,
      },
      auditReference: '',
      governed,
      readOnly,
    };
  }

  executionResult.auditReference = await recordToolAudit(ctx, toolName, params, executionResult);
  return executionResult;
}

// ─── Tool Dispatch ───────────────────────────────────────────────────────────

async function dispatchTool(
  toolName: string,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  switch (toolName) {
    // ── Read-Only Tools ─────────────────────────────────────────────────────
    case 'eios_get_active_project':
      return await getActiveProject(ctx);
    case 'eios_get_active_ewo':
      return await getActiveEwo(ctx);
    case 'eios_get_ewo_details':
      return await getEwoDetails(params.ewo_ref as string);
    case 'eios_get_repository':
      return await getRepository(ctx, params.ewo_ref as string | undefined);
    case 'eios_retrieve_constitution':
      return await retrieveConstitution(params.limit as number | undefined);
    case 'eios_search_engineering_memory':
      return await searchEngineeringMemory(ctx, params.query as string, params.limit as number | undefined);
    case 'eios_search_engineering_history':
      return await searchEngineeringHistory(params.query as string, params.limit as number | undefined, params.offset as number | undefined);
    case 'eios_retrieve_architecture_decisions':
      return await retrieveArchitectureDecisions(params.limit as number | undefined);
    case 'eios_get_provider_policy':
      return await getProviderPolicy(params.ewo_ref as string | undefined);
    case 'eios_get_execution_state':
      return await getExecutionState(params.ewo_ref as string);
    case 'eios_get_audit_history':
      return await getAuditHistory(params.conversation_id as string | undefined, params.ewo_ref as string | undefined, params.limit as number | undefined);
    case 'eios_search_knowledge_packages':
      return await searchKnowledgePackages(params.query as string, params.limit as number | undefined);
    case 'eios_inspect_execution_package':
      return await inspectExecutionPackage(params.ewo_ref as string);
    case 'eios_get_engineering_ideas':
      return await getEngineeringIdeas(ctx, params.limit as number | undefined);
    case 'eios_list_active_ewos':
      return await listActiveEwos(ctx, params.limit as number | undefined);

    // ── EWO-045: Repository Intelligence Tools ──────────────────────────────
    case 'eios_repo_discover':
      return await repoDiscover(ctx);
    case 'eios_repo_tree':
      return await repoTree(ctx, params.path as string | undefined, params.recursive as boolean | undefined, params.branch as string | undefined);
    case 'eios_repo_search':
      return await repoSearch(ctx, params.query as string, params.limit as number | undefined);
    case 'eios_repo_read_file':
      return await repoReadFile(ctx, params.path as string, params.start_line as number | undefined, params.end_line as number | undefined, params.branch as string | undefined);
    case 'eios_repo_inspect_symbol':
      return await repoInspectSymbol(ctx, params.symbol as string, params.file_path as string | undefined);
    case 'eios_repo_history':
      return await repoHistory(ctx, params.branch as string | undefined, params.limit as number | undefined);
    case 'eios_repo_diff':
      return await repoDiff(ctx, params.base as string | undefined, params.head as string | undefined, params.commit_sha as string | undefined);
    case 'eios_repo_architecture_records':
      return await repoArchitectureRecords(ctx, params.record_type as string | undefined, params.limit as number | undefined);
    case 'eios_repo_cross_reference':
      return await repoCrossReference(ctx, params.query as string, params.search_source as boolean | undefined, params.search_ewos as boolean | undefined, params.search_records as boolean | undefined, params.search_history as boolean | undefined, params.limit as number | undefined);

    // ── Governed Tools ───────────────────────────────────────────────────────
    case 'eios_create_engineering_idea':
      return await createEngineeringIdea(ctx, params.title as string, params.description as string, params.scope as string | undefined);
    case 'eios_create_ewo':
      return await createEwo(ctx, params.title as string, params.scope as string | undefined, params.linked_idea_id as string | undefined);
    case 'eios_prepare_execution':
      return await prepareExecution(ctx, params.ewo_ref as string);
    case 'eios_approve_execution':
      return await approveExecution(ctx, params.ewo_ref as string);
    case 'eios_execute_ewo':
      return await executeEwo(ctx, params.ewo_ref as string, params.requested_provider as string | undefined);
    case 'eios_cancel_execution':
      return await cancelExecution(ctx, params.ewo_ref as string);
    case 'eios_delete_ewo':
      return await deleteEwo(ctx, params.ewo_ref as string);
    case 'eios_record_acceptance':
      return await recordAcceptance(ctx, params.ewo_ref as string);
    case 'eios_reject_execution':
      return await rejectExecution(ctx, params.ewo_ref as string, params.reason as string | undefined);

    // ── Diagnostic Tools ─────────────────────────────────────────────────────
    case 'eios_get_provider_health':
      return await getProviderHealth();
    case 'eios_get_execution_diagnostics':
      return await getExecutionDiagnostics(params.ewo_ref as string);

    // ── Validation Tools ─────────────────────────────────────────────────────
    case 'eios_validate_ewo_reference':
      return await validateEwoReference(params.ewo_ref as string);
    case 'eios_validate_repository':
      return await validateRepository(params.repository as string);

    // ── Context Tools ────────────────────────────────────────────────────────
    case 'eios_bind_conversation_to_ewo':
      return await bindConversationToEwo(ctx, params.ewo_ref as string);

    default:
      return {
        success: false,
        result: null,
        error: {
          code: 'UNIMPLEMENTED_TOOL',
          message: `Tool "${toolName}" is registered but not implemented.`,
          category: 'unknown',
          retryable: false,
        },
        auditReference: '',
        governed: false,
        readOnly: false,
      };
  }
}

// ─── Read-Only Tool Implementations ──────────────────────────────────────────

function okResult(result: unknown): ToolExecutionResult {
  return { success: true, result, error: null, auditReference: '', governed: false, readOnly: true };
}

async function getActiveProject(ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
  if (!ctx.projectId) {
    return okResult({ project: null, message: 'No active project resolved for this conversation.' });
  }
  const { data, error } = await supabase
    .from('ecc_product_hierarchy')
    .select('*')
    .eq('id', ctx.projectId)
    .maybeSingle();
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ project: data });
}

async function getActiveEwo(ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const ewoRef = ctx.ewoRef;
  if (!ewoRef) {
    const { data: assoc } = await supabase
      .from('engineering_conversation_associations')
      .select('ewo_id, ewo_ref')
      .eq('conversation_id', ctx.conversationId)
      .eq('is_canonical', true)
      .maybeSingle();
    if (assoc?.ewo_ref) {
      return await getEwoDetails(assoc.ewo_ref);
    }
    return okResult({ ewo: null, message: 'No active EWO for this conversation.' });
  }
  return await getEwoDetails(ewoRef);
}

async function getEwoDetails(ewoRef: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();
  if (error) return errorResult('DB_ERROR', error.message);
  if (!data) return errorResult('NOT_FOUND', `EWO ${ewoRef} not found.`);
  return okResult({ ewo: data });
}

async function getRepository(ctx: ToolExecutionContext, ewoRef?: string): Promise<ToolExecutionResult> {
  let query = supabase.from('execution_targets').select('*').eq('status', 'active');
  if (ewoRef) query = query.eq('ewo_ref', ewoRef);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) return errorResult('DB_ERROR', error.message);
  if (!data) {
    const { data: repoConfig } = await supabase
      .from('github_repository_config')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    return okResult({ repository: repoConfig ?? null });
  }
  return okResult({ repository: data });
}

async function retrieveConstitution(limit?: number): Promise<ToolExecutionResult> {
  const { data, error } = await supabase
    .from('engineering_constitution')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit ?? 10);
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ constitution: data });
}

async function searchEngineeringMemory(ctx: ToolExecutionContext, query?: string, limit?: number): Promise<ToolExecutionResult> {
  let q = supabase.from('engineering_memory').select('*').order('created_at', { ascending: false }).limit(limit ?? 10);
  if (ctx.projectId) q = q.eq('project_id', ctx.projectId);
  if (query) q = q.ilike('content', `%${query}%`);
  const { data, error } = await q;
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ memory: data });
}

async function searchEngineeringHistory(query?: string, limit?: number, offset?: number): Promise<ToolExecutionResult> {
  let q = supabase.from('engineering_work_orders').select('ewo_ref, title, status, created_at, updated_at').order('created_at', { ascending: false }).limit(limit ?? 10).range(offset ?? 0, (offset ?? 0) + (limit ?? 10) - 1);
  if (query) q = q.ilike('title', `%${query}%`);
  const { data, error } = await q;
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ history: data });
}

async function retrieveArchitectureDecisions(limit?: number): Promise<ToolExecutionResult> {
  const { data, error } = await supabase
    .from('ecc_decisions')
    .select('*')
    .in('status', ['accepted', 'active', 'approved'])
    .order('created_at', { ascending: false })
    .limit(limit ?? 5);
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ decisions: data });
}

async function getProviderPolicy(ewoRef?: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase
    .from('execution_provider_policy')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ policy: data });
}

async function getExecutionState(ewoRef: string): Promise<ToolExecutionResult> {
  const { data: ewo } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, status, engineering_package_status, implementation_status')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();
  if (!ewo) return errorResult('NOT_FOUND', `EWO ${ewoRef} not found.`);
  const { data: approvals } = await supabase
    .from('ewo_execution_approvals')
    .select('decision, approved_by, approved_at')
    .eq('ewo_ref', ewoRef)
    .order('approved_at', { ascending: false })
    .limit(5);
  const { data: executions } = await supabase
    .from('supervised_execution_records')
    .select('id, execution_ref, status, created_at, updated_at')
    .eq('ewo_ref', ewoRef)
    .order('created_at', { ascending: false })
    .limit(5);
  return okResult({ ewo, approvals: approvals ?? [], executions: executions ?? [] });
}

async function getAuditHistory(conversationId?: string, ewoRef?: string, limit?: number): Promise<ToolExecutionResult> {
  let q = supabase.from('atd_connect_inspection_log').select('*').order('timestamp', { ascending: false }).limit(limit ?? 20);
  if (conversationId) q = q.eq('session_id', conversationId);
  if (ewoRef) q = q.eq('resolved_object_reference', ewoRef);
  const { data, error } = await q;
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ audit: data });
}

async function searchKnowledgePackages(query?: string, limit?: number): Promise<ToolExecutionResult> {
  let q = supabase.from('engineering_records_library').select('*').order('created_at', { ascending: false }).limit(limit ?? 10);
  if (query) q = q.ilike('title', `%${query}%`);
  const { data, error } = await q;
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ packages: data });
}

async function inspectExecutionPackage(ewoRef: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase.rpc('inspect_execution_package', { p_ewo_ref: ewoRef });
  if (error) return errorResult('RPC_ERROR', error.message);
  return okResult({ package: data });
}

async function getEngineeringIdeas(ctx: ToolExecutionContext, limit?: number): Promise<ToolExecutionResult> {
  let q = supabase.from('engineering_idea').select('*').order('created_at', { ascending: false }).limit(limit ?? 10);
  if (ctx.projectId) q = q.eq('project_id', ctx.projectId);
  const { data, error } = await q;
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ ideas: data });
}

async function listActiveEwos(ctx: ToolExecutionContext, limit?: number): Promise<ToolExecutionResult> {
  const lim = limit ?? 20;

  let q = supabase
    .from('engineering_work_orders')
    .select('ewo_ref, title, status, implementation_status, owner, requested_by, product_owner, updated_at, tenant_id, project_id')
    .not('status', 'in', '("closed","archived","cancelled","rejected")')
    .order('updated_at', { ascending: false })
    .limit(lim);

  // EWO-044R3: Filter by tenant_id and project_id — never created_by
  if (ctx.tenantId) {
    q = q.eq('tenant_id', ctx.tenantId);
  }
  if (ctx.projectId) {
    q = q.eq('project_id', ctx.projectId);
  }

  const { data, error } = await q;
  if (error) return errorResult('DB_ERROR', error.message);

  const activeEwos = (data ?? []).map((row: Record<string, unknown>) => ({
    ewo_ref: row.ewo_ref,
    title: row.title,
    lifecycle_status: row.status,
    current_stage: row.implementation_status ?? row.status,
    project: ctx.projectId ?? row.project_id ?? null,
    owner: row.owner ?? row.requested_by ?? row.product_owner ?? null,
    updated_at: row.updated_at,
  }));

  return okResult({
    active_ewos: activeEwos,
    count: activeEwos.length,
    scope: {
      tenant_id: ctx.tenantId,
      project_id: ctx.projectId,
      reason: ctx.tenantId && ctx.projectId
        ? 'Scoped to resolved organisation and project'
        : 'No organisation/project scope resolved — returning all active EWOs accessible to the authenticated user',
    },
  });
}

// ─── EWO-045: Repository Intelligence Tool Implementations ─────────────────────

const REPO_EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-operations`;
const REPO_EDGE_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
};

const SECRET_PATTERNS = [
  /(?:sk-|pk-|sk_live_|pk_live_)[a-zA-Z0-9]{20,}/g,
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /github_pat_[a-zA-Z0-9_]{22,}/g,
  /xox[bpoas]-[a-zA-Z0-9-]+/g,
  /[a-zA-Z0-9_-]{32,44}\.[a-zA-Z0-9_-]{32,44}\.[a-zA-Z0-9_-]{32,44}/g,
  /-----BEGIN [A-Z]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z]+ PRIVATE KEY-----/g,
];

const REDACTED_FILE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /secret/i,
  /credential/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.p12$/i,
  /\.pfx$/i,
];

function redactSecrets(content: string): string {
  let redacted = content;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

function isSensitiveFile(path: string): boolean {
  return REDACTED_FILE_PATTERNS.some(p => p.test(path));
}

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    kt: 'kotlin', swift: 'swift', php: 'php', c: 'c', cpp: 'cpp',
    cs: 'csharp', scss: 'scss', css: 'css', html: 'html', json: 'json',
    md: 'markdown', yml: 'yaml', yaml: 'yaml', sql: 'sql', sh: 'shell',
  };
  return langMap[ext] ?? 'text';
}

async function loadRepoConfig(ctx: ToolExecutionContext): Promise<{ config: RepositoryConfig; error: null } | { config: null; error: string }> {
  if (!ctx.projectId) return { config: null, error: 'No project resolved for repository access.' };
  let config = await loadRepositoryConfig(ctx.projectId);
  // EWO-045: github_repository_config.project_id is text and may still contain
  // the legacy value "default" even though the resolved project_id is now a UUID.
  // Fall back to the legacy key if the UUID lookup returns nothing.
  if (!config) {
    config = await loadRepositoryConfig('default');
  }
  if (!config) return { config: null, error: `No repository configured for project ${ctx.projectId}.` };
  if (config.lifecycle_status !== 'active') return { config: null, error: `Repository is not active (status: ${config.lifecycle_status}).` };
  return { config, error: null };
}

function resolveRepoConfig(repoCtx: { config: RepositoryConfig; error: null } | { config: null; error: string }): RepositoryConfig {
  return repoCtx.config as RepositoryConfig;
}

async function repoApiCall(operation: string, payload: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> | null; error: string | null }> {
  try {
    const response = await fetch(`${REPO_EDGE_BASE}/${operation}`, {
      method: 'POST',
      headers: REPO_EDGE_HEADERS,
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let data: Record<string, unknown> | null = null;
    try { data = JSON.parse(text); } catch { /* non-JSON */ }
    if (!response.ok) return { ok: false, data, error: (data?.error as string) || text.slice(0, 500) };
    return { ok: true, data, error: null };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

async function recordRepoAudit(ctx: ToolExecutionContext, config: RepositoryConfig, tool: string, path: string | null, args: Record<string, unknown>, resultSize: number, durationMs: number, decision: string): Promise<void> {
  try {
    await supabase.from('atd_connect_inspection_log').insert({
      request_id: `REPO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      requesting_persona: 'atd',
      operation: 'repository_intelligence',
      inspected_capability: tool,
      outcome: decision,
      request_source: 'conversational',
      original_request: JSON.stringify({ tool, path, args }).slice(0, 2000),
      session_id: ctx.conversationId,
      resolved_capability: tool,
      resolved_operation: 'repository_read',
      resolved_object_reference: path ? `${config.repository_owner}/${config.repository_name}:${path}` : `${config.repository_owner}/${config.repository_name}`,
      provider: 'eios_repository',
      provider_model: 'governed',
      provider_version: '1.0',
      policy_version: '1.0',
      context_version: '1.0',
      lifecycle_decision: null,
      governance_decision: decision,
      requested_tools: [tool],
      executed_tools: [tool],
    });
  } catch { /* audit failure is non-fatal */ }
}

async function repoDiscover(ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const start = Date.now();
  const repoCtx = await loadRepoConfig(ctx);
  if (repoCtx.error) return errorResult('REPO_NOT_CONFIGURED', repoCtx.error);
  const config = resolveRepoConfig(repoCtx);

  const inspect = await inspectRepository(config);
  const durationMs = Date.now() - start;
  const decision = inspect.accessible ? 'approved' : 'denied';
  await recordRepoAudit(ctx, config, 'eios_repo_discover', null, {}, inspect.size ?? 0, durationMs, decision);

  if (!inspect.accessible) return errorResult('REPO_INACCESSIBLE', inspect.error ?? 'Repository not accessible');

  return okResult({
    repository: config.repository_name,
    owner: config.repository_owner,
    default_branch: inspect.default_branch ?? config.default_base_branch,
    provider: 'github',
    visibility: inspect.private ? 'private' : 'public',
    repository_identifier: `${config.repository_owner}/${config.repository_name}`,
    size: inspect.size,
  });
}

async function repoTree(ctx: ToolExecutionContext, path: string | undefined, recursive: boolean | undefined, branch: string | undefined): Promise<ToolExecutionResult> {
  const start = Date.now();
  const repoCtx = await loadRepoConfig(ctx);
  if (repoCtx.error) return errorResult('REPO_NOT_CONFIGURED', repoCtx.error);
  const config = resolveRepoConfig(repoCtx);

  const ref = branch ?? config.default_base_branch;
  const useRecursive = recursive ?? false;

  if (useRecursive) {
    const result = await repoApiCall('git-tree', {
      owner: config.repository_owner, repo: config.repository_name, ref, recursive: true,
    });
    const durationMs = Date.now() - start;
    await recordRepoAudit(ctx, config, 'eios_repo_tree', path ?? '/', { recursive: true, branch: ref }, result.data ? JSON.stringify(result.data).length : 0, durationMs, result.ok ? 'approved' : 'denied');
    if (!result.ok) return errorResult('REPO_TREE_FAILED', result.error ?? 'Failed to list tree');
    const entries = (result.data!.entries as Array<Record<string, unknown>>) ?? [];
    const filtered = path ? entries.filter((e) => (e.path as string).startsWith(path.endsWith('/') ? path : path + '/')) : entries;
    return okResult({ entries: filtered, truncated: result.data!.truncated ?? false, branch: ref });
  }

  const result = await repoApiCall('list-tree', {
    owner: config.repository_owner, repo: config.repository_name, path: path ?? '', ref: branch,
  });
  const durationMs = Date.now() - start;
  await recordRepoAudit(ctx, config, 'eios_repo_tree', path ?? '/', { recursive: false, branch: ref }, result.data ? JSON.stringify(result.data).length : 0, durationMs, result.ok ? 'approved' : 'denied');
  if (!result.ok) return errorResult('REPO_TREE_FAILED', result.error ?? 'Failed to list directory');
  return okResult({ entries: (result.data!.entries as Array<Record<string, unknown>>) ?? [], branch: ref });
}

async function repoSearch(ctx: ToolExecutionContext, query: string, limit: number | undefined): Promise<ToolExecutionResult> {
  const start = Date.now();
  const repoCtx = await loadRepoConfig(ctx);
  if (repoCtx.error) return errorResult('REPO_NOT_CONFIGURED', repoCtx.error);
  const config = resolveRepoConfig(repoCtx);

  const result = await repoApiCall('search-code', {
    owner: config.repository_owner, repo: config.repository_name, query, per_page: limit ?? 30,
  });
  const durationMs = Date.now() - start;
  await recordRepoAudit(ctx, config, 'eios_repo_search', null, { query, limit: limit ?? 30 }, result.data ? JSON.stringify(result.data).length : 0, durationMs, result.ok ? 'approved' : 'denied');
  if (!result.ok) return errorResult('REPO_SEARCH_FAILED', result.error ?? 'Code search failed');
  return okResult({
    total_count: result.data!.total_count,
    items: (result.data!.items as Array<Record<string, unknown>>) ?? [],
  });
}

async function repoReadFile(ctx: ToolExecutionContext, path: string, startLine: number | undefined, endLine: number | undefined, branch: string | undefined): Promise<ToolExecutionResult> {
  const start = Date.now();
  const repoCtx = await loadRepoConfig(ctx);
  if (repoCtx.error) return errorResult('REPO_NOT_CONFIGURED', repoCtx.error);
  const config = resolveRepoConfig(repoCtx);

  if (isSensitiveFile(path)) {
    const durationMs = Date.now() - start;
    await recordRepoAudit(ctx, config, 'eios_repo_read_file', path, { redacted: true }, 0, durationMs, 'denied');
    return errorResult('REPO_FILE_REDACTED', `File '${path}' is redacted for security. Secrets and environment files are not accessible.`);
  }

  const ref = branch ?? config.default_base_branch;
  const file = await readRepoFile(config, path, ref);
  const durationMs = Date.now() - start;

  if (!file) {
    await recordRepoAudit(ctx, config, 'eios_repo_read_file', path, { branch: ref }, 0, durationMs, 'denied');
    return errorResult('REPO_FILE_NOT_FOUND', `File '${path}' not found on branch '${ref}'.`);
  }

  let content = file.content;
  let truncated = false;
  const MAX_FILE_SIZE = 100_000;
  if (content.length > MAX_FILE_SIZE) {
    content = content.slice(0, MAX_FILE_SIZE);
    truncated = true;
  }

  const sLine = startLine ?? 1;
  const eLine = endLine ?? 0;
  if (sLine > 1 || eLine > 0) {
    const lines = content.split('\n');
    const startIdx = Math.max(0, sLine - 1);
    const endIdx = eLine > 0 ? Math.min(lines.length, eLine) : lines.length;
    content = lines.slice(startIdx, endIdx).join('\n');
  }

  content = redactSecrets(content);
  await recordRepoAudit(ctx, config, 'eios_repo_read_file', path, { branch: ref, start_line: sLine, end_line: eLine }, content.length, durationMs, 'approved');

  return okResult({
    path,
    content,
    language: detectLanguage(path),
    size: file.size,
    sha: file.sha,
    branch: ref,
    truncated,
    start_line: sLine,
    end_line: eLine > 0 ? eLine : (content.split('\n').length + sLine - 1),
  });
}

async function repoInspectSymbol(ctx: ToolExecutionContext, symbol: string, filePath: string | undefined): Promise<ToolExecutionResult> {
  const start = Date.now();
  const repoCtx = await loadRepoConfig(ctx);
  if (repoCtx.error) return errorResult('REPO_NOT_CONFIGURED', repoCtx.error);
  const config = resolveRepoConfig(repoCtx);

  // Search for the symbol using GitHub code search
  const searchQuery = filePath ? `"${symbol}" path:${filePath}` : `"${symbol}"`;
  const result = await repoApiCall('search-code', {
    owner: config.repository_owner, repo: config.repository_name, query: searchQuery, per_page: 20,
  });
  const durationMs = Date.now() - start;
  await recordRepoAudit(ctx, config, 'eios_repo_inspect_symbol', null, { symbol, file_path: filePath }, result.data ? JSON.stringify(result.data).length : 0, durationMs, result.ok ? 'approved' : 'denied');
  if (!result.ok) return errorResult('REPO_SYMBOL_SEARCH_FAILED', result.error ?? 'Symbol search failed');

  const items = (result.data!.items as Array<Record<string, unknown>>) ?? [];
  // Categorize results by likely symbol type based on file extension
  const definitions = items.map((item) => ({
    file: item.path,
    name: item.name,
    url: item.url,
    score: item.score ?? null,
  }));

  return okResult({
    symbol,
    definitions,
    total_matches: result.data!.total_count,
    note: 'Symbol inspection uses code search. For exact line numbers, use eios_repo_read_file on the matched file.',
  });
}

async function repoHistory(ctx: ToolExecutionContext, branch: string | undefined, limit: number | undefined): Promise<ToolExecutionResult> {
  const start = Date.now();
  const repoCtx = await loadRepoConfig(ctx);
  if (repoCtx.error) return errorResult('REPO_NOT_CONFIGURED', repoCtx.error);
  const config = resolveRepoConfig(repoCtx);

  const ref = branch ?? config.default_base_branch;
  const result = await repoApiCall('list-commits', {
    owner: config.repository_owner, repo: config.repository_name, ref, per_page: limit ?? 30,
  });
  const durationMs = Date.now() - start;
  await recordRepoAudit(ctx, config, 'eios_repo_history', null, { branch: ref, limit: limit ?? 30 }, result.data ? JSON.stringify(result.data).length : 0, durationMs, result.ok ? 'approved' : 'denied');
  if (!result.ok) return errorResult('REPO_HISTORY_FAILED', result.error ?? 'Failed to list commits');
  return okResult({
    commits: (result.data!.commits as Array<Record<string, unknown>>) ?? [],
    branch: ref,
  });
}

async function repoDiff(ctx: ToolExecutionContext, base: string | undefined, head: string | undefined, commitSha: string | undefined): Promise<ToolExecutionResult> {
  const start = Date.now();
  const repoCtx = await loadRepoConfig(ctx);
  if (repoCtx.error) return errorResult('REPO_NOT_CONFIGURED', repoCtx.error);
  const config = resolveRepoConfig(repoCtx);

  if (commitSha) {
    const result = await repoApiCall('get-commit', {
      owner: config.repository_owner, repo: config.repository_name, sha: commitSha,
    });
    const durationMs = Date.now() - start;
    await recordRepoAudit(ctx, config, 'eios_repo_diff', null, { commit_sha: commitSha }, result.data ? JSON.stringify(result.data).length : 0, durationMs, result.ok ? 'approved' : 'denied');
    if (!result.ok) return errorResult('REPO_DIFF_FAILED', result.error ?? 'Commit not found');
    return okResult({ commit: result.data });
  }

  const baseRef = base ?? config.default_base_branch;
  const headRef = head ?? config.default_base_branch;
  if (baseRef === headRef) return errorResult('REPO_DIFF_INVALID', 'Base and head must differ for comparison.');

  const result = await repoApiCall('compare', {
    owner: config.repository_owner, repo: config.repository_name, base: baseRef, head: headRef,
  });
  const durationMs = Date.now() - start;
  await recordRepoAudit(ctx, config, 'eios_repo_diff', null, { base: baseRef, head: headRef }, result.data ? JSON.stringify(result.data).length : 0, durationMs, result.ok ? 'approved' : 'denied');
  if (!result.ok) return errorResult('REPO_DIFF_FAILED', result.error ?? 'Comparison failed');
  return okResult(result.data);
}

async function repoArchitectureRecords(ctx: ToolExecutionContext, recordType: string | undefined, limit: number | undefined): Promise<ToolExecutionResult> {
  const start = Date.now();
  const repoCtx = await loadRepoConfig(ctx);
  if (repoCtx.error) return errorResult('REPO_NOT_CONFIGURED', repoCtx.error);
  const config = resolveRepoConfig(repoCtx);

  const rType = recordType ?? 'all';
  const max = limit ?? 10;

  // Search for architecture records in the docs directory using code search
  const searchQueries: Record<string, string> = {
    adr: 'ADR path:docs',
    completion_report: 'completion path:docs',
    constitutional: 'constitutional path:docs',
    engineering_record: 'engineering path:docs',
    all: 'path:docs extension:md',
  };

  const query = searchQueries[rType] ?? searchQueries.all;
  const result = await repoApiCall('search-code', {
    owner: config.repository_owner, repo: config.repository_name, query, per_page: max,
  });
  const durationMs = Date.now() - start;
  await recordRepoAudit(ctx, config, 'eios_repo_architecture_records', null, { record_type: rType, limit: max }, result.data ? JSON.stringify(result.data).length : 0, durationMs, result.ok ? 'approved' : 'denied');
  if (!result.ok) return errorResult('REPO_RECORDS_FAILED', result.error ?? 'Architecture record search failed');
  return okResult({
    record_type: rType,
    records: (result.data!.items as Array<Record<string, unknown>>) ?? [],
    total_count: result.data!.total_count,
  });
}

async function repoCrossReference(ctx: ToolExecutionContext, query: string, searchSource: boolean | undefined, searchEwos: boolean | undefined, searchRecords: boolean | undefined, searchHistory: boolean | undefined, limit: number | undefined): Promise<ToolExecutionResult> {
  const start = Date.now();
  const repoCtx = await loadRepoConfig(ctx);
  if (repoCtx.error) return errorResult('REPO_NOT_CONFIGURED', repoCtx.error);
  const config = resolveRepoConfig(repoCtx);

  const max = limit ?? 5;
  const doSource = searchSource ?? true;
  const doEwos = searchEwos ?? true;
  const doRecords = searchRecords ?? true;
  const doHistory = searchHistory ?? false;

  const results: Record<string, unknown> = { query };

  // Source code search
  if (doSource) {
    const sourceResult = await repoApiCall('search-code', {
      owner: config.repository_owner, repo: config.repository_name, query, per_page: max,
    });
    results.source_code = sourceResult.ok ? {
      total_count: sourceResult.data!.total_count,
      items: (sourceResult.data!.items as Array<Record<string, unknown>>) ?? [],
    } : { error: sourceResult.error };
  }

  // EWO search
  if (doEwos) {
    const { data: ewoData } = await supabase
      .from('engineering_work_orders')
      .select('ewo_ref, title, status, project_id')
      .or(`title.ilike.%${query}%,ewo_ref.ilike.%${query}%`)
      .limit(max);
    results.engineering_work_orders = ewoData ?? [];
  }

  // Engineering records search
  if (doRecords) {
    const recordsResult = await repoApiCall('search-code', {
      owner: config.repository_owner, repo: config.repository_name, query: `${query} path:docs`, per_page: max,
    });
    results.engineering_records = recordsResult.ok ? {
      total_count: recordsResult.data!.total_count,
      items: (recordsResult.data!.items as Array<Record<string, unknown>>) ?? [],
    } : { error: recordsResult.error };
  }

  // Repository history search
  if (doHistory) {
    const historyResult = await repoApiCall('list-commits', {
      owner: config.repository_owner, repo: config.repository_name, ref: config.default_base_branch, per_page: max,
    });
    if (historyResult.ok) {
      const commits = (historyResult.data!.commits as Array<Record<string, unknown>>) ?? [];
      results.repository_history = commits.filter((c) =>
        (c.message as string)?.toLowerCase().includes(query.toLowerCase()),
      );
    }
  }

  const durationMs = Date.now() - start;
  await recordRepoAudit(ctx, config, 'eios_repo_cross_reference', null, { query, limit: max }, JSON.stringify(results).length, durationMs, 'approved');

  return okResult(results);
}

// ─── Governed Tool Implementations ───────────────────────────────────────────

function governedOkResult(result: unknown): ToolExecutionResult {
  return { success: true, result, error: null, auditReference: '', governed: true, readOnly: false };
}

async function createEngineeringIdea(ctx: ToolExecutionContext, title: string, description: string, scope?: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase.from('engineering_idea').insert({
    title,
    description,
    scope: scope ?? null,
    created_by: ctx.userId,
    project_id: ctx.projectId,
    status: 'draft',
  }).select().single();
  if (error) return errorResult('DB_ERROR', error.message);
  return governedOkResult({ idea: data });
}

async function createEwo(ctx: ToolExecutionContext, title: string, scope?: string, linkedIdeaId?: string): Promise<ToolExecutionResult> {
  const { data: refData, error: refError } = await supabase.rpc('reserve_ewo_ref_governed');
  if (refError || !refData) return errorResult('RPC_ERROR', 'Failed to reserve EWO reference.');
  const ewoRef = refData as string;
  const { data, error } = await supabase.rpc('create_canonical_ewo_governed', {
    p_ewo_ref: ewoRef,
    p_title: title,
    p_scope: scope ?? null,
    p_created_by: ctx.userId,
    p_linked_idea_id: linkedIdeaId ?? null,
  });
  if (error) return errorResult('RPC_ERROR', error.message);
  return governedOkResult({ ewo_ref: ewoRef, ewo: data });
}

async function prepareExecution(ctx: ToolExecutionContext, ewoRef: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase.rpc('prepare_execution_package_governed', {
    p_ewo_ref: ewoRef,
    p_requested_by: ctx.userId,
  });
  if (error) return errorResult('RPC_ERROR', error.message);
  return governedOkResult({ preparation: data });
}

async function approveExecution(ctx: ToolExecutionContext, ewoRef: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase.from('ewo_execution_approvals').insert({
    ewo_ref: ewoRef,
    decision: 'approved',
    approved_by: ctx.userId,
    approved_at: new Date().toISOString(),
  }).select().single();
  if (error) return errorResult('DB_ERROR', error.message);
  return governedOkResult({ approval: data });
}

async function executeEwo(ctx: ToolExecutionContext, ewoRef: string, requestedProvider?: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase.rpc('dispatch_execution_governed', {
    p_ewo_ref: ewoRef,
    p_requested_by: ctx.userId,
    p_requested_provider: requestedProvider ?? null,
    p_conversation_id: ctx.conversationId,
  });
  if (error) return errorResult('RPC_ERROR', error.message);
  return governedOkResult({ execution: data });
}

async function cancelExecution(ctx: ToolExecutionContext, ewoRef: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase.from('supervised_execution_records')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('ewo_ref', ewoRef)
    .in('status', ['pending', 'running'])
    .select();
  if (error) return errorResult('DB_ERROR', error.message);
  return governedOkResult({ cancelled: data });
}

async function deleteEwo(ctx: ToolExecutionContext, ewoRef: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase.rpc('delete_ewo_governed', {
    p_ewo_ref: ewoRef,
    p_deleted_by: ctx.userId,
  });
  if (error) return errorResult('RPC_ERROR', error.message);
  return governedOkResult({ deletion: data });
}

async function recordAcceptance(ctx: ToolExecutionContext, ewoRef: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase.from('engineering_work_orders')
    .update({ po_accepted_at: new Date().toISOString(), status: 'closed' })
    .eq('ewo_ref', ewoRef)
    .select();
  if (error) return errorResult('DB_ERROR', error.message);
  return governedOkResult({ acceptance: data });
}

async function rejectExecution(ctx: ToolExecutionContext, ewoRef: string, reason?: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase.from('ewo_execution_approvals').insert({
    ewo_ref: ewoRef,
    decision: 'rejected',
    approved_by: ctx.userId,
    approved_at: new Date().toISOString(),
    notes: reason ?? null,
  }).select().single();
  if (error) return errorResult('DB_ERROR', error.message);
  return governedOkResult({ rejection: data });
}

// ─── Diagnostic Tool Implementations ─────────────────────────────────────────

async function getProviderHealth(): Promise<ToolExecutionResult> {
  const { data, error } = await supabase
    .from('ai_provider_configs')
    .select('id, provider, model, is_enabled, has_api_key')
    .eq('is_enabled', true)
    .eq('has_api_key', true)
    .limit(1)
    .maybeSingle();
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({
    healthy: !!data,
    provider: data?.provider ?? null,
    model: data?.model ?? null,
  });
}

async function getExecutionDiagnostics(ewoRef: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase
    .from('supervised_execution_records')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ diagnostics: data });
}

// ─── Validation Tool Implementations ─────────────────────────────────────────

async function validateEwoReference(ewoRef: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref, title, status')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ valid: !!data, ewo: data ?? null });
}

async function validateRepository(repository: string): Promise<ToolExecutionResult> {
  const { data, error } = await supabase
    .from('github_repository_config')
    .select('*')
    .or(`repository_name.ilike.%${repository}%,full_name.ilike.%${repository}%`)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ valid: !!data, repository: data ?? null });
}

// ─── Context Tool Implementations ─────────────────────────────────────────────

async function bindConversationToEwo(ctx: ToolExecutionContext, ewoRef: string): Promise<ToolExecutionResult> {
  const { error } = await supabase.from('engineering_conversation_associations').upsert({
    conversation_id: ctx.conversationId,
    ewo_ref: ewoRef,
    is_canonical: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'conversation_id' });
  if (error) return errorResult('DB_ERROR', error.message);
  return okResult({ bound: true, ewo_ref: ewoRef });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errorResult(code: string, message: string): ToolExecutionResult {
  return {
    success: false,
    result: null,
    error: {
      code,
      message,
      category: code.startsWith('NOT_FOUND') ? 'data_not_found' : 'provider_error',
      retryable: !code.startsWith('NOT_FOUND'),
    },
    auditReference: '',
    governed: false,
    readOnly: false,
  };
}

// ─── Batch Execution (for parallel tool calls) ────────────────────────────────

export async function executeToolsInParallel(
  calls: Array<{ tool: string; parameters: Record<string, unknown> }>,
  ctx: ToolExecutionContext,
): Promise<ProviderToolResult[]> {
  const results = await Promise.all(
    calls.map(async (call) => {
      const result = await executeTool(call.tool, call.parameters, ctx);
      return {
        tool: call.tool,
        success: result.success,
        result: result.result,
        error: result.error,
      };
    }),
  );
  return results;
}
