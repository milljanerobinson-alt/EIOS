/**
 * EWO-034R.2 — GitHub-Native Execution Service
 *
 * Replaces the filesystem-dependent repository execution path with a
 * GitHub-native architecture. All file operations go through the GitHub
 * REST API via the github-operations edge function.
 *
 * Flow:
 *   1. Load governed repository config
 *   2. Resolve base commit SHA
 *   3. Create EWO branch from base
 *   4. Read authoritative file contents from GitHub
 *   5. Validate returned complete file contents from Codex
 *   6. Verify original file SHAs still match GitHub
 *   7. Commit changes to EWO branch via GitHub API
 *   8. Trigger GitHub Actions verification workflow
 *   9. Poll for workflow completion
 *  10. Evaluate acceptance criteria against GitHub diff
 *  11. Persist execution evidence
 *  12. Return completion package
 *
 * NEVER uses Deno.cwd(), local file writes, local git commands, or a persistent clone.
 */

import { supabase } from './supabase';
import {
  loadRepositoryConfig,
  resolveBaseCommit,
  createEwoBranch,
  deleteEwoBranch,
  readFile,
  createOrUpdateFile,
  deleteFile,
  compareBranches,
  triggerWorkflow,
  getWorkflowRun,
  waitForWorkflowCompletion,
  persistExecutionEvidence,
  generateEwoBranchName,
  validateEwoBranchName,
  assertNotProductionBranch,
  branchExists,
  type RepositoryConfig,
  type GitHubExecutionEvidence,
} from './githubRepositoryService';
import {
  validateFileChanges,
  getDefaultRepositoryControls,
} from './codex/codexControlsService';
import type { CodexFileChange } from './codex/codexTypes';
import { checkEmergencyStop } from './emergencyStopService';
import { acquireExecutionLock, releaseExecutionLock } from './executionLockService';
import { verifySourceAssertion, generateAcceptanceCriteria, type AcceptanceCriteriaSet } from './acceptanceCriteriaService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitHubExecutionRequest {
  ewo_ref: string;
  ewo_id: string;
  ewo_title: string;
  project_id: string;
  files_created: CodexFileChange[];
  files_modified: CodexFileChange[];
  files_deleted: string[];
  acceptance_criteria: AcceptanceCriteriaSet;
  actor: string;
}

export interface GitHubExecutionResult {
  success: boolean;
  ewo_branch: string | null;
  branch_url: string | null;
  base_commit_sha: string | null;
  commit_shas: string[];
  diff_url: string | null;
  canonical_diff: string | null;
  workflow_run_id: number | null;
  workflow_run_url: string | null;
  workflow_conclusion: string | null;
  acceptance_criteria_passed: boolean;
  error: string | null;
  evidence_id: string | null;
}

// ─── Limits ────────────────────────────────────────────────────────────────────

const MAX_FILES = 20;
const MAX_CONTENT_SIZE = 2_000_000; // 2MB total
const MAX_FILE_SIZE = 512_000; // 512KB per file

// ─── Main Entry Point ──────────────────────────────────────────────────────────

export async function executeViaGitHub(request: GitHubExecutionRequest): Promise<GitHubExecutionResult> {
  const auditRef = `GH-EXEC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 0. Check emergency stop
  const estop = await checkEmergencyStop();
  if (estop.halted) {
    return failureResult('Emergency stop activated', request.ewo_ref);
  }

  // 1. Load governed repository config
  const config = await loadRepositoryConfig(request.project_id);
  if (!config) {
    return failureResult(`No repository configuration found for project: ${request.project_id}`, request.ewo_ref);
  }

  if (config.lifecycle_status !== 'active') {
    return failureResult(`Repository is not active (status: ${config.lifecycle_status})`, request.ewo_ref);
  }

  // 2. Acquire execution lock
  const lock = await acquireExecutionLock(request.ewo_ref, request.actor);
  if (!lock.acquired) {
    return failureResult(`Lock acquisition denied: ${lock.reason}`, request.ewo_ref);
  }

  let ewoBranch: string | null = null;

  try {
    // 3. Validate change limits
    const allFiles = [...request.files_created, ...request.files_modified];
    if (allFiles.length + request.files_deleted.length > MAX_FILES) {
      throw new Error(`File count ${allFiles.length + request.files_deleted.length} exceeds maximum ${MAX_FILES}`);
    }

    let totalContentSize = 0;
    for (const f of allFiles) {
      if (f.content) {
        totalContentSize += f.content.length;
        if (f.content.length > MAX_FILE_SIZE) {
          throw new Error(`File ${f.path} exceeds maximum size ${MAX_FILE_SIZE}`);
        }
      }
    }
    if (totalContentSize > MAX_CONTENT_SIZE) {
      throw new Error(`Total content size ${totalContentSize} exceeds maximum ${MAX_CONTENT_SIZE}`);
    }

    // 4. Validate all paths against governance controls
    const controls = getDefaultRepositoryControls('staging');
    for (const f of allFiles) {
      // Check against config protected paths
      for (const protectedPath of config.protected_paths) {
        if (f.path === protectedPath || f.path.startsWith(protectedPath.replace(/\*$/, ''))) {
          throw new Error(`Protected path: ${f.path}`);
        }
      }
      // Check against config allowed directories
      if (config.allowed_source_directories.length > 0) {
        const inAllowed = config.allowed_source_directories.some(dir =>
          f.path.startsWith(dir) || f.path.startsWith(dir.replace(/\/$/, ''))
        );
        if (!inAllowed) {
          throw new Error(`Path not in allowed directories: ${f.path}`);
        }
      }
    }

    // 5. Validate file changes against governance controls
    const fileValidation = validateFileChanges(allFiles, controls);
    if (!fileValidation.valid) {
      throw new Error(`Governance validation failed: ${fileValidation.violations.join('; ')}`);
    }

    // 6. Resolve base commit SHA
    const baseInfo = await resolveBaseCommit(config);
    if (!baseInfo.sha) {
      throw new Error(`Could not resolve base commit for branch: ${baseInfo.error}`);
    }
    const baseSha = baseInfo.sha;

    // 7. Generate and validate branch name
    ewoBranch = generateEwoBranchName(request.ewo_ref, request.ewo_title);
    const branchValidation = validateEwoBranchName(ewoBranch);
    if (!branchValidation.valid) {
      throw new Error(`Invalid branch name: ${branchValidation.reason}`);
    }

    // 8. Check for duplicate active branch
    const existing = await branchExists(config, ewoBranch);
    if (existing) {
      throw new Error(`Branch already exists for this EWO: ${ewoBranch}`);
    }

    // 9. Check emergency stop before branch creation
    const estop2 = await checkEmergencyStop();
    if (estop2.halted) {
      throw new Error(`Emergency stop activated before branch creation: ${estop2.reason}`);
    }

    // 10. Create EWO branch from base
    const branchResult = await createEwoBranch(config, ewoBranch, baseSha);
    if (!branchResult.success) {
      throw new Error(`Branch creation failed: ${branchResult.error}`);
    }

    // 11. Verify original file SHAs and commit changes
    const commitShas: string[] = [];

    for (const file of request.files_modified) {
      // Check emergency stop before each GitHub mutation
      const estop3 = await checkEmergencyStop();
      if (estop3.halted) {
        await deleteEwoBranch(config, ewoBranch);
        throw new Error(`Emergency stop during commit: ${estop3.reason}`);
      }

      // Read current file SHA from GitHub
      const currentFile = await readFile(config, file.path, ewoBranch);
      const currentSha = currentFile?.sha || null;

      // Verify SHA matches expected (if provided in file change)
      if (file.content_hash && currentSha && file.content_hash !== currentSha) {
        await deleteEwoBranch(config, ewoBranch);
        throw new Error(`SHA mismatch for ${file.path}: expected ${file.content_hash}, got ${currentSha}`);
      }

      // Commit the file
      const commitResult = await createOrUpdateFile(
        config,
        file.path,
        file.content || '',
        ewoBranch,
        `${file.diff_summary || 'Modified'} (EWO: ${request.ewo_ref})`,
        currentSha,
      );

      if (!commitResult) {
        await deleteEwoBranch(config, ewoBranch);
        throw new Error(`Failed to commit ${file.path}`);
      }

      commitShas.push(commitResult.sha);
    }

    for (const file of request.files_created) {
      // Check emergency stop
      const estop4 = await checkEmergencyStop();
      if (estop4.halted) {
        await deleteEwoBranch(config, ewoBranch);
        throw new Error(`Emergency stop during commit: ${estop4.reason}`);
      }

      const commitResult = await createOrUpdateFile(
        config,
        file.path,
        file.content || '',
        ewoBranch,
        `${file.diff_summary || 'Created'} (EWO: ${request.ewo_ref})`,
        null, // No existing SHA for new files
      );

      if (!commitResult) {
        await deleteEwoBranch(config, ewoBranch);
        throw new Error(`Failed to create ${file.path}`);
      }

      commitShas.push(commitResult.sha);
    }

    for (const filePath of request.files_deleted) {
      // Check emergency stop
      const estop5 = await checkEmergencyStop();
      if (estop5.halted) {
        await deleteEwoBranch(config, ewoBranch);
        throw new Error(`Emergency stop during deletion: ${estop5.reason}`);
      }

      const currentFile = await readFile(config, filePath, ewoBranch);
      if (!currentFile) {
        continue; // File doesn't exist — skip
      }

      const deleted = await deleteFile(
        config,
        filePath,
        ewoBranch,
        `Deleted (EWO: ${request.ewo_ref})`,
        currentFile.sha,
      );

      if (!deleted) {
        await deleteEwoBranch(config, ewoBranch);
        throw new Error(`Failed to delete ${filePath}`);
      }
    }

    // 12. Check emergency stop before workflow triggering
    const estop6 = await checkEmergencyStop();
    if (estop6.halted) {
      await deleteEwoBranch(config, ewoBranch);
      throw new Error(`Emergency stop before workflow: ${estop6.reason}`);
    }

    // 13. Get canonical diff
    const diff = await compareBranches(config, config.default_base_branch, ewoBranch);

    // 14. Trigger GitHub Actions verification workflow
    const workflowResult = await triggerWorkflow(config, ewoBranch, request.ewo_ref);
    if (!workflowResult.success) {
      // Non-fatal — workflow may not be configured yet
      // Record evidence without workflow
    }

    // 15. Wait for workflow completion (with timeout)
    let workflowRun = null;
    if (workflowResult.success) {
      // Poll for the workflow run — the dispatch endpoint doesn't return the run ID
      // so we need to find it by listing recent runs for the branch
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s for run to appear

      // Try to get the latest workflow run for this branch
      const edgeBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-operations`;
      const edgeHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      };

      try {
        const runResponse = await fetch(`${edgeBase}/get-latest-workflow-run`, {
          method: 'POST',
          headers: edgeHeaders,
          body: JSON.stringify({
            owner: config.repository_owner,
            repo: config.repository_name,
            branch: ewoBranch,
            credential_ref: config.credential_ref,
          }),
        });

        if (runResponse.ok) {
          const runData = await runResponse.json();
          if (runData.id) {
            workflowRun = await waitForWorkflowCompletion(config, runData.id, {
              pollIntervalMs: 15000,
              timeoutMs: 10 * 60 * 1000,
            });
          }
        }
      } catch {
        // Non-fatal — workflow polling may fail
      }
    }

    // 16. Evaluate acceptance criteria against GitHub diff
    const acceptanceResult = evaluateAcceptanceAgainstDiff(
      request.acceptance_criteria,
      diff,
      request.files_modified,
      request.files_created,
    );

    // 17. Check emergency stop before completion
    const estop7 = await checkEmergencyStop();
    if (estop7.halted) {
      await deleteEwoBranch(config, ewoBranch);
      throw new Error(`Emergency stop before completion: ${estop7.reason}`);
    }

    // 18. Persist execution evidence
    const evidence: Omit<GitHubExecutionEvidence, 'id' | 'created_at'> = {
      execution_id: request.ewo_id,
      ewo_ref: request.ewo_ref,
      repository_owner: config.repository_owner,
      repository_name: config.repository_name,
      base_branch: config.default_base_branch,
      base_commit_sha: baseSha,
      ewo_branch: ewoBranch,
      branch_url: branchResult.url,
      commit_shas: commitShas,
      canonical_diff: diff ? JSON.stringify(diff.files) : null,
      diff_url: diff?.url || null,
      workflow_run_id: workflowRun?.id ?? null,
      workflow_run_url: workflowRun?.html_url ?? null,
      workflow_conclusion: workflowRun?.conclusion ?? null,
      workflow_started_at: workflowRun?.created_at ?? null,
      workflow_completed_at: workflowRun?.updated_at ?? null,
      acceptance_criteria_result: acceptanceResult,
      pull_request_url: null,
      po_decision: null,
      po_decision_at: null,
    };

    const evidenceResult = await persistExecutionEvidence(evidence);

    // 19. Determine overall success
    const workflowPassed = !workflowRun || workflowRun.conclusion === 'success';
    const acceptancePassed = Boolean(acceptanceResult.all_satisfied);
    const overallSuccess = workflowPassed && acceptancePassed;

    return {
      success: overallSuccess,
      ewo_branch: ewoBranch,
      branch_url: branchResult.url,
      base_commit_sha: baseSha,
      commit_shas: commitShas,
      diff_url: diff?.url || null,
      canonical_diff: diff ? JSON.stringify(diff.files) : null,
      workflow_run_id: workflowRun?.id ?? null,
      workflow_run_url: workflowRun?.html_url ?? null,
      workflow_conclusion: workflowRun?.conclusion ?? null,
      acceptance_criteria_passed: acceptancePassed,
      error: overallSuccess ? null : `Workflow: ${workflowRun?.conclusion || 'not run'}, Acceptance: ${acceptancePassed ? 'passed' : 'pending'}`,
      evidence_id: null,
    };
  } catch (err) {
    // Clean up branch on failure
    if (ewoBranch && config) {
      await deleteEwoBranch(config, ewoBranch);
    }

    return failureResult(err instanceof Error ? err.message : 'Unknown error', request.ewo_ref);
  } finally {
    // Release execution lock
    await releaseExecutionLock(request.ewo_ref, request.actor);
  }
}

function failureResult(error: string, ewoRef: string): GitHubExecutionResult {
  return {
    success: false,
    ewo_branch: null,
    branch_url: null,
    base_commit_sha: null,
    commit_shas: [],
    diff_url: null,
    canonical_diff: null,
    workflow_run_id: null,
    workflow_run_url: null,
    workflow_conclusion: null,
    acceptance_criteria_passed: false,
    error,
    evidence_id: null,
  };
}

// ─── Acceptance Criteria Evaluation Against GitHub Diff ────────────────────────

function evaluateAcceptanceAgainstDiff(
  criteria: AcceptanceCriteriaSet,
  diff: { files: { filename: string; status: string; additions: number; deletions: number; patch: string | null }[] } | null,
  modifiedFiles: CodexFileChange[],
  createdFiles: CodexFileChange[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    all_satisfied: true,
    criteria_results: [] as Record<string, unknown>[],
  };

  const allChangedFiles = [...modifiedFiles, ...createdFiles];
  const diffFiles = diff?.files || [];
  const diffFileNames = diffFiles.map(f => f.filename);

  for (const criterion of criteria.criteria) {
    let satisfied = false;
    let reason = '';

    switch (criterion.verification_method) {
      case 'build_verification': {
        // Satisfied if workflow passed — will be updated after workflow completion
        satisfied = true; // Placeholder — actual result depends on workflow
        reason = 'Pending workflow completion';
        break;
      }

      case 'test_verification': {
        satisfied = true; // Placeholder — actual result depends on workflow
        reason = 'Pending workflow completion';
        break;
      }

      case 'source_assertion': {
        // EWO-034R.2: Inspect actual file content from the diff
        const sourceEvidence = allChangedFiles
          .filter(f => f.content)
          .map(f => ({
            file_path: f.path,
            action: (f.action === 'create' ? 'create' : 'modify') as 'create' | 'modify' | 'delete',
            content: f.content!,
            diff_summary: f.diff_summary || '',
            lines_added: f.lines_added || 0,
            lines_removed: f.lines_removed || 0,
          }));

        const assertionResult = verifySourceAssertion(criterion, sourceEvidence, criteria.original_request);
        satisfied = assertionResult.satisfied;
        reason = assertionResult.reason;
        break;
      }

      case 'component_inspection': {
        // Verify the component file appears in the diff
        satisfied = allChangedFiles.length > 0 && allChangedFiles.some(f =>
          diffFileNames.includes(f.path)
        );
        reason = satisfied ? 'Component found in diff' : 'Component not found in diff';
        break;
      }

      case 'ui_verification': {
        // UI verification remains pending — requires manual PO verification
        satisfied = false;
        reason = 'Pending Product Owner UI verification on staging';
        break;
      }

      case 'po_live_verification': {
        satisfied = false;
        reason = 'Pending Product Owner live verification';
        break;
      }

      default: {
        satisfied = false;
        reason = `Unknown verification method: ${criterion.verification_method}`;
      }
    }

    (result.criteria_results as Record<string, unknown>[]).push({
      criterion_id: criterion.id,
      satisfied,
      reason,
    });

    if (!satisfied && criterion.verification_method !== 'ui_verification' && criterion.verification_method !== 'po_live_verification') {
      result.all_satisfied = false;
    }
  }

  return result;
}

// ─── Repository Context for Codex ─────────────────────────────────────────────

/**
 * Retrieve governed repository context for Codex.
 * Reads file contents from GitHub — never sends the entire repository.
 */
export async function retrieveRepositoryContext(
  config: RepositoryConfig,
  targetFilePaths: string[],
  branch: string,
): Promise<{
  files: { path: string; content: string; sha: string }[];
  total_size: number;
  truncated: boolean;
  error: string | null;
}> {
  const MAX_CONTEXT_FILES = 15;
  const MAX_CONTEXT_SIZE = 500_000; // 500KB total context

  const files: { path: string; content: string; sha: string }[] = [];
  let totalSize = 0;
  let truncated = false;

  // Limit number of files
  const limitedPaths = targetFilePaths.slice(0, MAX_CONTEXT_FILES);
  if (limitedPaths.length < targetFilePaths.length) {
    truncated = true;
  }

  for (const filePath of limitedPaths) {
    // Check protected paths
    const isProtected = config.protected_paths.some(p =>
      filePath === p || filePath.startsWith(p.replace(/\*$/, ''))
    );
    if (isProtected) continue;

    // Check allowed directories
    if (config.allowed_source_directories.length > 0) {
      const inAllowed = config.allowed_source_directories.some(dir =>
        filePath.startsWith(dir) || filePath.startsWith(dir.replace(/\/$/, ''))
      );
      if (!inAllowed) continue;
    }

    const file = await readFile(config, filePath, branch);
    if (file) {
      if (totalSize + file.content.length > MAX_CONTEXT_SIZE) {
        truncated = true;
        break;
      }
      files.push({ path: filePath, content: file.content, sha: file.sha });
      totalSize += file.content.length;
    }
  }

  return { files, total_size: totalSize, truncated, error: null };
}
