/**
 * EWO-034R.2 — GitHub Repository Service
 *
 * Canonical service for interacting with the authoritative GitHub repository
 * through the GitHub REST API, proxied via the github-operations edge function.
 *
 * NEVER uses Deno.cwd(), local file writes, local git commands, or a persistent clone.
 * All operations go through the GitHub API via the edge function proxy.
 *
 * The GitHub token is stored ONLY in server-side edge function secrets.
 * It is NEVER exposed to the browser, NEVER stored in audit payloads.
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepositoryConfig {
  project_id: string;
  repository_owner: string;
  repository_name: string;
  credential_ref: string;
  credential_type: 'github_app' | 'fine_grained_token';
  default_base_branch: string;
  staging_branch: string | null;
  production_branch: string;
  allowed_source_directories: string[];
  protected_paths: string[];
  workflow_file: string;
  lifecycle_status: 'active' | 'paused' | 'retired';
  github_api_base: string;
  installation_id: number | null;
}

export interface GitHubFileContent {
  path: string;
  content: string;
  sha: string;
  encoding: 'base64' | 'utf-8';
  size: number;
}

export interface GitHubBranchInfo {
  name: string;
  commit_sha: string;
  protected: boolean;
  url: string;
}

export interface GitHubCommitResult {
  sha: string;
  url: string;
  message: string;
  files: { filename: string; status: string; additions: number; deletions: number }[];
}

export interface GitHubDiffResult {
  url: string;
  commits: string[];
  files: {
    filename: string;
    status: 'added' | 'modified' | 'removed' | 'renamed';
    additions: number;
    deletions: number;
    patch: string | null;
  }[];
  total_commits: number;
  total_additions: number;
  total_deletions: number;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  html_url: string;
  head_sha: string;
  created_at: string;
  updated_at: string;
  run_attempt: number;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'neutral' | null;
  html_url: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface GitHubPRResult {
  number: number;
  url: string;
  state: 'open' | 'closed' | 'merged';
  title: string;
  head_ref: string;
  base_ref: string;
  mergeable: boolean | null;
}

// ─── Edge Function Proxy ──────────────────────────────────────────────────────

const EDGE_FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-operations`;
const EDGE_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
};

async function githubApiCall(
  operation: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null; error: string | null }> {
  try {
    const response = await fetch(`${EDGE_FUNCTION_BASE}/${operation}`, {
      method: 'POST',
      headers: EDGE_HEADERS,
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data: Record<string, unknown> | null = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      return { ok: false, status: response.status, data, error: (data?.error as string) || text.slice(0, 500) };
    }

    return { ok: true, status: response.status, data, error: null };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ─── Configuration Management ─────────────────────────────────────────────────

/**
 * Load the governed repository configuration for a project.
 */
export async function loadRepositoryConfig(projectId: string): Promise<RepositoryConfig | null> {
  const { data } = await supabase
    .from('github_repository_config')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();

  if (!data) return null;

  return {
    project_id: data.project_id,
    repository_owner: data.repository_owner,
    repository_name: data.repository_name,
    credential_ref: data.credential_ref,
    credential_type: data.credential_type,
    default_base_branch: data.default_base_branch,
    staging_branch: data.staging_branch,
    production_branch: data.production_branch,
    allowed_source_directories: data.allowed_source_directories,
    protected_paths: data.protected_paths,
    workflow_file: data.workflow_file,
    lifecycle_status: data.lifecycle_status,
    github_api_base: data.github_api_base,
    installation_id: data.installation_id,
  };
}

/**
 * Save or update the governed repository configuration.
 */
export async function saveRepositoryConfig(config: RepositoryConfig): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase
    .from('github_repository_config')
    .upsert({
      project_id: config.project_id,
      repository_owner: config.repository_owner,
      repository_name: config.repository_name,
      credential_ref: config.credential_ref,
      credential_type: config.credential_type,
      default_base_branch: config.default_base_branch,
      staging_branch: config.staging_branch,
      production_branch: config.production_branch,
      allowed_source_directories: config.allowed_source_directories,
      protected_paths: config.protected_paths,
      workflow_file: config.workflow_file,
      lifecycle_status: config.lifecycle_status,
      github_api_base: config.github_api_base,
      installation_id: config.installation_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' });

  return { success: !error, error: error?.message ?? null };
}

// ─── Repository Inspection ────────────────────────────────────────────────────

/**
 * Inspect the repository — confirm it exists and is accessible.
 */
export interface InspectRepositoryResult {
  accessible: boolean;
  exists: boolean | null;
  empty: boolean | null;
  size: number | null;
  default_branch: string | null;
  private: boolean | null;
  full_name: string | null;
  html_url: string | null;
  error: string | null;
  error_category: RepositoryErrorCategory | null;
}

export type RepositoryErrorCategory =
  | 'token_missing'
  | 'token_unauthorised'
  | 'repository_not_found'
  | 'repository_inaccessible'
  | 'repository_empty'
  | 'operation_unsupported'
  | 'branch_missing'
  | 'workflow_missing'
  | 'runtime_error';

function classifyInspectError(status: number, error: string | null): RepositoryErrorCategory {
  if (error && error.startsWith('Unknown operation:')) return 'operation_unsupported';
  if (status === 401 || status === 403) return 'token_unauthorised';
  if (status === 404) return 'repository_not_found';
  if (status === 0 && error === 'Network error') return 'repository_inaccessible';
  return 'runtime_error';
}

export async function inspectRepository(config: RepositoryConfig): Promise<InspectRepositoryResult> {
  const result = await githubApiCall('inspect-repo', {
    owner: config.repository_owner,
    repo: config.repository_name,
    credential_ref: config.credential_ref,
  });

  if (!result.ok || !result.data) {
    return {
      accessible: false,
      exists: null,
      empty: null,
      size: null,
      default_branch: null,
      private: null,
      full_name: null,
      html_url: null,
      error: result.error,
      error_category: classifyInspectError(result.status, result.error),
    };
  }

  const repoSize = (result.data.size as number) ?? 0;
  return {
    accessible: true,
    exists: (result.data.exists as boolean) ?? true,
    empty: (result.data.empty as boolean) ?? repoSize === 0,
    size: repoSize,
    default_branch: (result.data.default_branch as string) || null,
    private: (result.data.private as boolean) ?? null,
    full_name: (result.data.full_name as string) || null,
    html_url: (result.data.html_url as string) || null,
    error: null,
    error_category: null,
  };
}

/**
 * Confirm the base branch exists and resolve its commit SHA.
 */
export async function resolveBaseCommit(config: RepositoryConfig, branch?: string): Promise<{
  sha: string | null;
  branch: string | null;
  error: string | null;
  error_category: RepositoryErrorCategory | null;
}> {
  const branchName = branch || config.default_base_branch;
  const result = await githubApiCall('get-branch', {
    owner: config.repository_owner,
    repo: config.repository_name,
    branch: branchName,
    credential_ref: config.credential_ref,
  });

  if (!result.ok || !result.data) {
    const category: RepositoryErrorCategory = result.status === 404 ? 'branch_missing' : classifyInspectError(result.status, result.error);
    return { sha: null, branch: null, error: result.error || `Branch ${branchName} not found`, error_category: category };
  }

  const sha = (result.data.commit_sha as string) || ((result.data.commit as Record<string, unknown>)?.sha as string);
  return { sha: sha || null, branch: branchName, error: null, error_category: null };
}

export async function checkFileExistsRemote(
  config: RepositoryConfig,
  filePath: string,
  branch: string,
): Promise<{ exists: boolean; error: string | null }> {
  const result = await githubApiCall('read-file', {
    owner: config.repository_owner,
    repo: config.repository_name,
    path: filePath,
    ref: branch,
    credential_ref: config.credential_ref,
  });
  return { exists: result.ok, error: result.ok ? null : (result.error || null) };
}

// ─── Branch Management ────────────────────────────────────────────────────────

const PRODUCTION_BRANCHES = ['main', 'master', 'production', 'prod', 'release'];

/**
 * Create an isolated EWO branch from the base branch.
 */
export async function createEwoBranch(
  config: RepositoryConfig,
  branchName: string,
  baseSha: string,
): Promise<{ success: boolean; branch: string; url: string | null; error: string | null }> {
  // Validate branch name
  if (!branchName.startsWith('ewo/')) {
    return { success: false, branch: branchName, url: null, error: 'Branch must start with ewo/' };
  }

  // Never allow writing to production branches
  if (PRODUCTION_BRANCHES.includes(branchName.toLowerCase())) {
    return { success: false, branch: branchName, url: null, error: `Cannot create production branch: ${branchName}` };
  }

  const result = await githubApiCall('create-branch', {
    owner: config.repository_owner,
    repo: config.repository_name,
    branch: branchName,
    base_sha: baseSha,
    credential_ref: config.credential_ref,
  });

  if (!result.ok || !result.data) {
    return { success: false, branch: branchName, url: null, error: result.error };
  }

  return {
    success: true,
    branch: branchName,
    url: (result.data.branch_url as string) || null,
    error: null,
  };
}

/**
 * Delete a rejected EWO branch.
 */
export async function deleteEwoBranch(
  config: RepositoryConfig,
  branchName: string,
): Promise<{ success: boolean; error: string | null }> {
  if (PRODUCTION_BRANCHES.includes(branchName.toLowerCase())) {
    return { success: false, error: 'Cannot delete production branch' };
  }

  const result = await githubApiCall('delete-branch', {
    owner: config.repository_owner,
    repo: config.repository_name,
    branch: branchName,
    credential_ref: config.credential_ref,
  });

  return { success: result.ok, error: result.error };
}

/**
 * Check if a branch already exists.
 */
export async function branchExists(
  config: RepositoryConfig,
  branchName: string,
): Promise<boolean> {
  const result = await githubApiCall('get-branch', {
    owner: config.repository_owner,
    repo: config.repository_name,
    branch: branchName,
    credential_ref: config.credential_ref,
  });
  return result.ok;
}

// ─── File Operations ──────────────────────────────────────────────────────────

/**
 * Read file content and SHA from GitHub.
 */
export async function readFile(
  config: RepositoryConfig,
  filePath: string,
  branch: string,
): Promise<GitHubFileContent | null> {
  const result = await githubApiCall('read-file', {
    owner: config.repository_owner,
    repo: config.repository_name,
    path: filePath,
    ref: branch,
    credential_ref: config.credential_ref,
  });

  if (!result.ok || !result.data) return null;

  const content = (result.data.content as string) || '';
  const encoding = (result.data.encoding as string) || 'base64';

  return {
    path: filePath,
    content: encoding === 'base64' ? atob(content) : content,
    sha: (result.data.sha as string) || '',
    encoding: encoding as 'base64' | 'utf-8',
    size: (result.data.size as number) || 0,
  };
}

/**
 * Create or update a file on a branch via the GitHub API.
 */
export async function createOrUpdateFile(
  config: RepositoryConfig,
  filePath: string,
  content: string,
  branch: string,
  commitMessage: string,
  existingSha: string | null,
): Promise<GitHubCommitResult | null> {
  const result = await githubApiCall('commit-file', {
    owner: config.repository_owner,
    repo: config.repository_name,
    path: filePath,
    content: btoa(content),
    branch,
    commit_message: commitMessage,
    sha: existingSha,
    credential_ref: config.credential_ref,
  });

  if (!result.ok || !result.data) return null;

  return {
    sha: (result.data.commit_sha as string) || '',
    url: (result.data.commit_url as string) || '',
    message: commitMessage,
    files: [{ filename: filePath, status: existingSha ? 'modified' : 'added', additions: 0, deletions: 0 }],
  };
}

/**
 * Delete a file from a branch (only when explicitly permitted).
 */
export async function deleteFile(
  config: RepositoryConfig,
  filePath: string,
  branch: string,
  commitMessage: string,
  existingSha: string,
): Promise<boolean> {
  const result = await githubApiCall('delete-file', {
    owner: config.repository_owner,
    repo: config.repository_name,
    path: filePath,
    branch,
    commit_message: commitMessage,
    sha: existingSha,
    credential_ref: config.credential_ref,
  });

  return result.ok;
}

// ─── Diff and Comparison ──────────────────────────────────────────────────────

/**
 * Compare the EWO branch against the base branch and return the canonical diff.
 */
export async function compareBranches(
  config: RepositoryConfig,
  baseBranch: string,
  ewoBranch: string,
): Promise<GitHubDiffResult | null> {
  const result = await githubApiCall('compare-branches', {
    owner: config.repository_owner,
    repo: config.repository_name,
    base: baseBranch,
    head: ewoBranch,
    credential_ref: config.credential_ref,
  });

  if (!result.ok || !result.data) return null;

  return {
    url: (result.data.html_url as string) || '',
    commits: (result.data.commits as string[]) || [],
    files: ((result.data.files as Record<string, unknown>[]) || []).map(f => ({
      filename: f.filename as string,
      status: f.status as 'added' | 'modified' | 'removed' | 'renamed',
      additions: f.additions as number,
      deletions: f.deletions as number,
      patch: (f.patch as string) || null,
    })),
    total_commits: (result.data.total_commits as number) || 0,
    total_additions: (result.data.total_additions as number) || 0,
    total_deletions: (result.data.total_deletions as number) || 0,
  };
}

// ─── GitHub Actions Verification ──────────────────────────────────────────────

/**
 * Trigger the GitHub Actions verification workflow for an EWO branch.
 */
export async function triggerWorkflow(
  config: RepositoryConfig,
  branch: string,
  ewoRef: string,
): Promise<{ success: boolean; workflow_run_id: number | null; error: string | null }> {
  const result = await githubApiCall('trigger-workflow', {
    owner: config.repository_owner,
    repo: config.repository_name,
    workflow_file: config.workflow_file,
    ref: branch,
    inputs: { ewo_ref: ewoRef },
    credential_ref: config.credential_ref,
  });

  if (!result.ok || !result.data) {
    return { success: false, workflow_run_id: null, error: result.error };
  }

  return {
    success: true,
    workflow_run_id: (result.data.workflow_run_id as number) || null,
    error: null,
  };
}

/**
 * Poll workflow run status.
 */
export async function getWorkflowRun(
  config: RepositoryConfig,
  runId: number,
): Promise<GitHubWorkflowRun | null> {
  const result = await githubApiCall('get-workflow-run', {
    owner: config.repository_owner,
    repo: config.repository_name,
    run_id: runId,
    credential_ref: config.credential_ref,
  });

  if (!result.ok || !result.data) return null;

  return {
    id: (result.data.id as number) || runId,
    name: (result.data.name as string) || '',
    status: (result.data.status as 'queued' | 'in_progress' | 'completed') || 'queued',
    conclusion: (result.data.conclusion as GitHubWorkflowRun['conclusion']) || null,
    html_url: (result.data.html_url as string) || '',
    head_sha: (result.data.head_sha as string) || '',
    created_at: (result.data.created_at as string) || '',
    updated_at: (result.data.updated_at as string) || '',
    run_attempt: (result.data.run_attempt as number) || 1,
  };
}

/**
 * Get check runs for a specific commit SHA.
 */
export async function getCheckRuns(
  config: RepositoryConfig,
  commitSha: string,
): Promise<GitHubCheckRun[]> {
  const result = await githubApiCall('get-check-runs', {
    owner: config.repository_owner,
    repo: config.repository_name,
    ref: commitSha,
    credential_ref: config.credential_ref,
  });

  if (!result.ok || !result.data) return [];

  const runs = (result.data.check_runs as Record<string, unknown>[]) || [];
  return runs.map(r => ({
    id: r.id as number,
    name: r.name as string,
    status: r.status as 'queued' | 'in_progress' | 'completed',
    conclusion: r.conclusion as GitHubCheckRun['conclusion'] || null,
    html_url: r.html_url as string,
    started_at: (r.started_at as string) || null,
    completed_at: (r.completed_at as string) || null,
  }));
}

/**
 * Wait for a workflow run to complete, polling at intervals.
 * Returns the final workflow run state.
 */
export async function waitForWorkflowCompletion(
  config: RepositoryConfig,
  runId: number,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<GitHubWorkflowRun | null> {
  const pollInterval = options.pollIntervalMs ?? 15000; // 15 seconds
  const timeout = options.timeoutMs ?? 10 * 60 * 1000; // 10 minutes
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const run = await getWorkflowRun(config, runId);
    if (run && run.status === 'completed') {
      return run;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Timed out — return the last known state
  return await getWorkflowRun(config, runId);
}

// ─── Pull Request Management ─────────────────────────────────────────────────

/**
 * Create a pull request for the EWO branch.
 */
export async function createPullRequest(
  config: RepositoryConfig,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<GitHubPRResult | null> {
  const result = await githubApiCall('create-pr', {
    owner: config.repository_owner,
    repo: config.repository_name,
    head,
    base,
    title,
    body,
    credential_ref: config.credential_ref,
  });

  if (!result.ok || !result.data) return null;

  return {
    number: (result.data.number as number) || 0,
    url: (result.data.html_url as string) || '',
    state: (result.data.state as 'open' | 'closed' | 'merged') || 'open',
    title,
    head_ref: head,
    base_ref: base,
    mergeable: (result.data.mergeable as boolean | null) ?? null,
  };
}

// ─── Evidence Persistence ─────────────────────────────────────────────────────

/**
 * Persist execution evidence to the github_execution_evidence table.
 */
export async function persistExecutionEvidence(
  evidence: Omit<GitHubExecutionEvidence, 'id' | 'created_at'>,
): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase
    .from('github_execution_evidence')
    .upsert({
      execution_id: evidence.execution_id,
      ewo_ref: evidence.ewo_ref,
      repository_owner: evidence.repository_owner,
      repository_name: evidence.repository_name,
      base_branch: evidence.base_branch,
      base_commit_sha: evidence.base_commit_sha,
      ewo_branch: evidence.ewo_branch,
      branch_url: evidence.branch_url,
      commit_shas: evidence.commit_shas,
      canonical_diff: evidence.canonical_diff,
      diff_url: evidence.diff_url,
      workflow_run_id: evidence.workflow_run_id,
      workflow_run_url: evidence.workflow_run_url,
      workflow_conclusion: evidence.workflow_conclusion,
      workflow_started_at: evidence.workflow_started_at,
      workflow_completed_at: evidence.workflow_completed_at,
      acceptance_criteria_result: evidence.acceptance_criteria_result,
      pull_request_url: evidence.pull_request_url,
      po_decision: evidence.po_decision,
      po_decision_at: evidence.po_decision_at,
    }, { onConflict: 'ewo_ref' });

  return { success: !error, error: error?.message ?? null };
}

/**
 * Load execution evidence for an EWO.
 */
export async function loadExecutionEvidence(ewoRef: string): Promise<GitHubExecutionEvidence | null> {
  const { data } = await supabase
    .from('github_execution_evidence')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    execution_id: data.execution_id,
    ewo_ref: data.ewo_ref,
    repository_owner: data.repository_owner,
    repository_name: data.repository_name,
    base_branch: data.base_branch,
    base_commit_sha: data.base_commit_sha,
    ewo_branch: data.ewo_branch,
    branch_url: data.branch_url,
    commit_shas: data.commit_shas || [],
    canonical_diff: data.canonical_diff,
    diff_url: data.diff_url,
    workflow_run_id: data.workflow_run_id,
    workflow_run_url: data.workflow_run_url,
    workflow_conclusion: data.workflow_conclusion,
    workflow_started_at: data.workflow_started_at,
    workflow_completed_at: data.workflow_completed_at,
    acceptance_criteria_result: data.acceptance_criteria_result,
    pull_request_url: data.pull_request_url,
    po_decision: data.po_decision,
    po_decision_at: data.po_decision_at,
    created_at: data.created_at,
  };
}

export interface GitHubExecutionEvidence {
  id?: string;
  execution_id: string;
  ewo_ref: string;
  repository_owner: string;
  repository_name: string;
  base_branch: string;
  base_commit_sha: string | null;
  ewo_branch: string;
  branch_url: string | null;
  commit_shas: string[];
  canonical_diff: string | null;
  diff_url: string | null;
  workflow_run_id: number | null;
  workflow_run_url: string | null;
  workflow_conclusion: string | null;
  workflow_started_at: string | null;
  workflow_completed_at: string | null;
  acceptance_criteria_result: Record<string, unknown> | null;
  pull_request_url: string | null;
  po_decision: string | null;
  po_decision_at: string | null;
  created_at?: string;
}

// ─── Branch Naming ────────────────────────────────────────────────────────────

/**
 * Generate a governed branch name for an EWO.
 * Format: ewo/<canonical-ewo-reference>-<short-slug>
 */
export function generateEwoBranchName(ewoRef: string, ewoTitle: string): string {
  const slug = ewoTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `ewo/${ewoRef.toLowerCase()}-${slug}`;
}

/**
 * Validate that a branch name follows the governed naming policy.
 */
export function validateEwoBranchName(branchName: string): { valid: boolean; reason: string | null } {
  if (!branchName.startsWith('ewo/')) {
    return { valid: false, reason: 'Branch must start with ewo/' };
  }
  if (!/^ewo\/[a-z0-9][a-z0-9-]*$/.test(branchName)) {
    return { valid: false, reason: 'Branch must match pattern ewo/<ref>-<slug>' };
  }
  if (branchName.length > 80) {
    return { valid: false, reason: 'Branch name too long (max 80 chars)' };
  }
  if (PRODUCTION_BRANCHES.includes(branchName.toLowerCase())) {
    return { valid: false, reason: 'Cannot use a production branch name' };
  }
  return { valid: true, reason: null };
}

/**
 * Assert that a branch is NOT a production branch.
 */
export function assertNotProductionBranch(branchName: string): { valid: boolean; reason: string | null } {
  if (PRODUCTION_BRANCHES.includes(branchName.toLowerCase())) {
    return { valid: false, reason: `Cannot write directly to production branch: ${branchName}` };
  }
  return { valid: true, reason: null };
}
