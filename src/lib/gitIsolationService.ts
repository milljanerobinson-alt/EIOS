/**
 * EWO-034R.1 — Git/GitHub Branch Isolation Service
 *
 * Implements the Product Owner decision:
 *   - Git/GitHub is the canonical repository
 *   - EIOS governs execution
 *   - GitHub manages branch history, staging, production, deployment, rollback
 *   - ATD must not directly edit production
 *
 * Branch naming policy: ewo/<ewo-ref>-<short-slug>
 *   Example: ewo/EWO-034-button-colour-teal
 *
 * Flow:
 *   approved EWO → isolated branch → Codex changes applied → build → tests →
 *   verification → commit with EWO reference → push to governed remote branch →
 *   completion package → PO acceptance → GitHub-managed staging/promotion
 *
 * Never writes directly to the production branch.
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitBranchConfig {
  branch_name: string;
  base_branch: string;
  ewo_ref: string;
  repository: string;
  remote: string;
}

export interface GitCommitResult {
  success: boolean;
  commit_sha: string | null;
  branch: string;
  files_committed: string[];
  error: string | null;
}

export interface GitPushResult {
  success: boolean;
  branch: string;
  remote_url: string;
  commit_sha: string | null;
  error: string | null;
}

export interface GitRollbackResult {
  success: boolean;
  commit_sha: string | null;
  branch: string;
  error: string | null;
}

// ─── Branch Naming Policy ────────────────────────────────────────────────────

/**
 * Generate a governed branch name for an EWO.
 * Format: ewo/<ewo-ref>-<short-slug>
 * The slug is derived from the EWO title, sanitized for Git branch naming.
 */
export function generateBranchName(ewoRef: string, ewoTitle: string): string {
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
export function validateBranchName(branchName: string): { valid: boolean; reason: string | null } {
  if (!branchName.startsWith('ewo/')) {
    return { valid: false, reason: 'Branch must start with ewo/' };
  }
  if (!/^ewo\/[a-z0-9][a-z0-9-]*$/.test(branchName)) {
    return { valid: false, reason: 'Branch must match pattern ewo/<ref>-<slug>' };
  }
  if (branchName.length > 80) {
    return { valid: false, reason: 'Branch name too long (max 80 chars)' };
  }
  return { valid: true, reason: null };
}

/**
 * Validate that a branch is NOT the production branch.
 */
export function assertNotProductionBranch(branchName: string): { valid: boolean; reason: string | null } {
  const productionBranches = ['main', 'master', 'production', 'prod', 'release'];
  if (productionBranches.includes(branchName.toLowerCase())) {
    return { valid: false, reason: `Cannot write directly to production branch: ${branchName}` };
  }
  return { valid: true, reason: null };
}

// ─── Git Operations (via repository-operations edge function) ─────────────────

const EDGE_FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/repository-operations`;
const EDGE_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
};

/**
 * Create an isolated branch from the base branch.
 * Delegates to the repository-operations edge function.
 */
export async function createIsolatedBranch(config: GitBranchConfig): Promise<{ success: boolean; branch: string; error: string | null }> {
  // Validate branch name
  const nameCheck = validateBranchName(config.branch_name);
  if (!nameCheck.valid) {
    return { success: false, branch: config.branch_name, error: nameCheck.reason };
  }

  // Ensure not production
  const prodCheck = assertNotProductionBranch(config.branch_name);
  if (!prodCheck.valid) {
    return { success: false, branch: config.branch_name, error: prodCheck.reason };
  }

  try {
    const response = await fetch(`${EDGE_FUNCTION_BASE}/git-branch`, {
      method: 'POST',
      headers: EDGE_HEADERS,
      body: JSON.stringify({
        branch_name: config.branch_name,
        base_branch: config.base_branch,
        ewo_ref: config.ewo_ref,
        repository: config.repository,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, branch: config.branch_name, error: `Branch creation failed: ${errText}` };
    }

    // Audit
    await supabase.from('repository_change_audit').insert({
      audit_ref: `GIT-BRANCH-${Date.now()}`,
      execution_id: config.ewo_ref,
      ewo_ref: config.ewo_ref,
      actor: 'git-isolation-service',
      operation: 'git_branch_create',
      file_path: null,
      action: 'create',
      content_size: 0,
      files_applied: [],
      snapshots: { branch: config.branch_name, base: config.base_branch },
      diff_evidence: null,
      build_result: null,
      test_result: null,
      rollback_performed: false,
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    return { success: true, branch: config.branch_name, error: null };
  } catch (err) {
    return { success: false, branch: config.branch_name, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Commit changes to the isolated branch with EWO attribution.
 */
export async function commitToBranch(
  config: GitBranchConfig,
  files: string[],
  commitMessage: string,
): Promise<GitCommitResult> {
  try {
    const response = await fetch(`${EDGE_FUNCTION_BASE}/git-commit`, {
      method: 'POST',
      headers: EDGE_HEADERS,
      body: JSON.stringify({
        branch_name: config.branch_name,
        files,
        commit_message: `${commitMessage}\n\nEWO: ${config.ewo_ref}\nAttribution: EIOS Autonomous Execution Pipeline`,
        ewo_ref: config.ewo_ref,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, commit_sha: null, branch: config.branch_name, files_committed: [], error: errText };
    }

    const result = await response.json();

    // Audit
    await supabase.from('repository_change_audit').insert({
      audit_ref: `GIT-COMMIT-${Date.now()}`,
      execution_id: config.ewo_ref,
      ewo_ref: config.ewo_ref,
      actor: 'git-isolation-service',
      operation: 'git_commit',
      file_path: null,
      action: 'commit',
      content_size: 0,
      files_applied: files,
      snapshots: { commit_sha: result.commit_sha, branch: config.branch_name },
      diff_evidence: null,
      build_result: null,
      test_result: null,
      rollback_performed: false,
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    return {
      success: true,
      commit_sha: result.commit_sha,
      branch: config.branch_name,
      files_committed: files,
      error: null,
    };
  } catch (err) {
    return { success: false, commit_sha: null, branch: config.branch_name, files_committed: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Push the isolated branch to the governed remote.
 */
export async function pushBranch(config: GitBranchConfig, commitSha: string | null): Promise<GitPushResult> {
  try {
    const response = await fetch(`${EDGE_FUNCTION_BASE}/git-push`, {
      method: 'POST',
      headers: EDGE_HEADERS,
      body: JSON.stringify({
        branch_name: config.branch_name,
        remote: config.remote,
        ewo_ref: config.ewo_ref,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, branch: config.branch_name, remote_url: config.remote, commit_sha: commitSha, error: errText };
    }

    const result = await response.json();

    // Audit
    await supabase.from('repository_change_audit').insert({
      audit_ref: `GIT-PUSH-${Date.now()}`,
      execution_id: config.ewo_ref,
      ewo_ref: config.ewo_ref,
      actor: 'git-isolation-service',
      operation: 'git_push',
      file_path: null,
      action: 'push',
      content_size: 0,
      files_applied: [],
      snapshots: { branch: config.branch_name, remote: config.remote, commit_sha: commitSha },
      diff_evidence: null,
      build_result: null,
      test_result: null,
      rollback_performed: false,
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    return {
      success: true,
      branch: config.branch_name,
      remote_url: result.remote_url || config.remote,
      commit_sha: commitSha,
      error: null,
    };
  } catch (err) {
    return { success: false, branch: config.branch_name, remote_url: config.remote, commit_sha: commitSha, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Rollback a branch by deleting it (if it was pushed) or resetting to base.
 * This is the Git-level rollback — GitHub manages deployment rollback.
 */
export async function rollbackBranch(config: GitBranchConfig): Promise<GitRollbackResult> {
  try {
    const response = await fetch(`${EDGE_FUNCTION_BASE}/git-rollback`, {
      method: 'POST',
      headers: EDGE_HEADERS,
      body: JSON.stringify({
        branch_name: config.branch_name,
        base_branch: config.base_branch,
        ewo_ref: config.ewo_ref,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, commit_sha: null, branch: config.branch_name, error: errText };
    }

    const result = await response.json();

    // Audit
    await supabase.from('repository_change_audit').insert({
      audit_ref: `GIT-ROLLBACK-${Date.now()}`,
      execution_id: config.ewo_ref,
      ewo_ref: config.ewo_ref,
      actor: 'git-isolation-service',
      operation: 'git_rollback',
      file_path: null,
      action: 'rollback',
      content_size: 0,
      files_applied: [],
      snapshots: { branch: config.branch_name, base: config.base_branch },
      diff_evidence: null,
      build_result: null,
      test_result: null,
      rollback_performed: true,
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    return {
      success: true,
      commit_sha: result.reset_to || null,
      branch: config.branch_name,
      error: null,
    };
  } catch (err) {
    return { success: false, commit_sha: null, branch: config.branch_name, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Clean up the isolated branch after PO acceptance or rejection.
 * After acceptance, the branch is merged via GitHub's PR process.
 * After rejection, the branch is deleted.
 */
export async function cleanupBranch(
  config: GitBranchConfig,
  accepted: boolean,
): Promise<{ success: boolean; error: string | null }> {
  if (accepted) {
    // Branch is merged via GitHub PR — no cleanup needed here
    // GitHub manages the merge and deployment
    return { success: true, error: null };
  }

  // Rejected — delete the branch
  try {
    const response = await fetch(`${EDGE_FUNCTION_BASE}/git-delete-branch`, {
      method: 'POST',
      headers: EDGE_HEADERS,
      body: JSON.stringify({
        branch_name: config.branch_name,
        ewo_ref: config.ewo_ref,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: errText };
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
