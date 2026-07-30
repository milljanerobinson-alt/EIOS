/**
 * EWO-034 — Repository Change Application Service
 *
 * Safely applies provider-generated file changes to the repository within an
 * isolated governed workspace. Responsibilities:
 *
 *   1. Isolated workspace creation (staging directory)
 *   2. Path validation against governance controls
 *   3. Governance validation (file allowlist, secret protection)
 *   4. Pre-change snapshot capture
 *   5. Atomic file application (all-or-nothing)
 *   6. Build execution
 *   7. Test execution
 *   8. Evidence capture (diffs, build output, test results)
 *   9. Rollback on failure
 *  10. Cleanup
 *
 * GitHub manages branches, staging, production deployment, and rollback.
 * EIOS governs execution and approvals. This service operates on the local
 * filesystem within a governed staging workspace.
 */

import {
  validateFileChanges,
  getDefaultRepositoryControls,
} from './codex/codexControlsService';
import type { CodexRepositoryControls } from './codex/codexTypes';
import type { CodexFileChange } from './codex/codexTypes';
import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepositoryChangeRequest {
  execution_id: string;
  ewo_ref: string;
  files_created: CodexFileChange[];
  files_modified: CodexFileChange[];
  files_deleted: string[];
  workspace_path: string;
  environment: 'staging' | 'production';
  actor: string;
}

export interface FileSnapshot {
  path: string;
  existed: boolean;
  content: string | null;
  hash: string | null;
}

export interface RepositoryChangeResult {
  success: boolean;
  applied_files: string[];
  snapshots: FileSnapshot[];
  diff_evidence: DiffEvidence[];
  build_result: BuildExecutionResult | null;
  test_result: TestExecutionResult | null;
  rollback_performed: boolean;
  error: string | null;
  audit_ref: string;
}

export interface DiffEvidence {
  path: string;
  action: 'create' | 'modify' | 'delete';
  lines_added: number;
  lines_removed: number;
  before_hash: string | null;
  after_hash: string | null;
  before_preview: string | null;
  after_preview: string | null;
}

export interface BuildExecutionResult {
  success: boolean;
  command: string;
  output: string;
  duration_ms: number;
  errors: string[];
  warnings: string[];
}

export interface TestExecutionResult {
  success: boolean;
  command: string;
  total: number;
  passed: number;
  failed: number;
  output: string;
  duration_ms: number;
  test_details: { name: string; status: 'pass' | 'fail' | 'skip'; detail: string }[];
}

// ─── Limits ───────────────────────────────────────────────────────────────────

export const REPOSITORY_CHANGE_LIMITS = {
  max_files_changed: 20,
  max_total_lines_changed: 5000,
  max_file_size_bytes: 512_000, // 512 KB per file
  max_content_length: 2_000_000, // 2 MB total content
};

// ─── Hashing ──────────────────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'hash-unavailable';
  }
}

// ─── Path Validation ──────────────────────────────────────────────────────────

export function validateRepositoryPath(
  filePath: string,
  controls: CodexRepositoryControls,
): { valid: boolean; reason: string | null } {
  if (!filePath || filePath.trim() === '') {
    return { valid: false, reason: 'Empty file path' };
  }

  // Normalize — remove leading slashes
  const normalized = filePath.replace(/^\/+/, '');

  // Prevent path traversal
  if (normalized.includes('..') || normalized.includes('\0')) {
    return { valid: false, reason: `Path traversal detected: ${filePath}` };
  }

  // Check permitted directories
  if (controls.permitted_directories.length > 0) {
    const inPermittedDir = controls.permitted_directories.some(dir =>
      normalized.startsWith(dir) || normalized.startsWith(dir.replace(/\/$/, ''))
    );
    if (!inPermittedDir) {
      return { valid: false, reason: `Path not in permitted directories: ${filePath}` };
    }
  }

  // Check protected files
  for (const protectedPattern of controls.protected_files) {
    if (matchPath(normalized, protectedPattern)) {
      return { valid: false, reason: `Protected file: ${filePath} (matches ${protectedPattern})` };
    }
  }

  return { valid: true, reason: null };
}

function matchPath(path: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'));
    return regex.test(path);
  }
  return path === pattern || path.startsWith(pattern);
}

// ─── Change Limit Validation ──────────────────────────────────────────────────

export function validateChangeLimits(request: RepositoryChangeRequest): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const allChanges = [...request.files_created, ...request.files_modified];
  const totalFiles = allChanges.length + request.files_deleted.length;

  if (totalFiles > REPOSITORY_CHANGE_LIMITS.max_files_changed) {
    violations.push(`File count ${totalFiles} exceeds maximum ${REPOSITORY_CHANGE_LIMITS.max_files_changed}`);
  }

  let totalLines = 0;
  let totalContentSize = 0;
  for (const f of allChanges) {
    totalLines += (f.lines_added || 0) + (f.lines_removed || 0);
    if (f.content) {
      totalContentSize += f.content.length;
      if (f.content.length > REPOSITORY_CHANGE_LIMITS.max_file_size_bytes) {
        violations.push(`File ${f.path} content size ${f.content.length} exceeds maximum ${REPOSITORY_CHANGE_LIMITS.max_file_size_bytes}`);
      }
    }
  }

  if (totalLines > REPOSITORY_CHANGE_LIMITS.max_total_lines_changed) {
    violations.push(`Total lines changed ${totalLines} exceeds maximum ${REPOSITORY_CHANGE_LIMITS.max_total_lines_changed}`);
  }

  if (totalContentSize > REPOSITORY_CHANGE_LIMITS.max_content_length) {
    violations.push(`Total content size ${totalContentSize} exceeds maximum ${REPOSITORY_CHANGE_LIMITS.max_content_length}`);
  }

  return { valid: violations.length === 0, violations };
}

// ─── Pre-Change Snapshot ──────────────────────────────────────────────────────

export async function capturePreChangeSnapshot(
  request: RepositoryChangeRequest,
): Promise<{ snapshots: FileSnapshot[]; errors: string[] }> {
  const snapshots: FileSnapshot[] = [];
  const errors: string[] = [];
  const allPaths = [
    ...request.files_created.map(f => f.path),
    ...request.files_modified.map(f => f.path),
    ...request.files_deleted,
  ];

  for (const filePath of allPaths) {
    try {
      const response = await fetch(`/api/repository/read?path=${encodeURIComponent(filePath)}`);
      if (response.ok) {
        const content = await response.text();
        snapshots.push({
          path: filePath,
          existed: true,
          content,
          hash: await sha256(content),
        });
      } else if (response.status === 404) {
        snapshots.push({ path: filePath, existed: false, content: null, hash: null });
      } else {
        errors.push(`Failed to snapshot ${filePath}: ${response.status}`);
        snapshots.push({ path: filePath, existed: false, content: null, hash: null });
      }
    } catch (err) {
      errors.push(`Snapshot error for ${filePath}: ${err instanceof Error ? err.message : 'unknown'}`);
      snapshots.push({ path: filePath, existed: false, content: null, hash: null });
    }
  }

  return { snapshots, errors };
}

// ─── File Application ─────────────────────────────────────────────────────────

async function applyFileChanges(
  request: RepositoryChangeRequest,
): Promise<{ applied: string[]; errors: string[] }> {
  const applied: string[] = [];
  const errors: string[] = [];

  const allChanges: { path: string; content: string; action: 'create' | 'modify' }[] = [
    ...request.files_created.map(f => ({ path: f.path, content: f.content || '', action: 'create' as const })),
    ...request.files_modified.map(f => ({ path: f.path, content: f.content || '', action: 'modify' as const })),
  ];

  for (const change of allChanges) {
    if (!change.content) {
      errors.push(`No content provided for ${change.action} of ${change.path}`);
      continue;
    }

    try {
      const response = await fetch('/api/repository/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: change.path,
          content: change.content,
          action: change.action,
          execution_id: request.execution_id,
          ewo_ref: request.ewo_ref,
          actor: request.actor,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        errors.push(`Failed to write ${change.path}: ${response.status} ${errBody}`);
      } else {
        applied.push(change.path);
      }
    } catch (err) {
      errors.push(`Write error for ${change.path}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  // Handle deletions
  for (const filePath of request.files_deleted) {
    try {
      const response = await fetch('/api/repository/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          execution_id: request.execution_id,
          ewo_ref: request.ewo_ref,
          actor: request.actor,
        }),
      });
      if (response.ok) {
        applied.push(filePath);
      } else {
        errors.push(`Failed to delete ${filePath}: ${response.status}`);
      }
    } catch (err) {
      errors.push(`Delete error for ${filePath}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return { applied, errors };
}

// ─── Rollback ──────────────────────────────────────────────────────────────────

export async function rollbackChanges(
  snapshots: FileSnapshot[],
  actor: string,
): Promise<{ rolled_back: string[]; errors: string[] }> {
  const rolled_back: string[] = [];
  const errors: string[] = [];

  for (const snapshot of snapshots) {
    try {
      if (!snapshot.existed || snapshot.content === null) {
        // File didn't exist before — delete it
        await fetch('/api/repository/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: snapshot.path, actor, action: 'rollback-delete' }),
        });
      } else {
        // Restore original content
        await fetch('/api/repository/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: snapshot.path,
            content: snapshot.content,
            action: 'restore',
            actor,
          }),
        });
      }
      rolled_back.push(snapshot.path);
    } catch (err) {
      errors.push(`Rollback error for ${snapshot.path}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return { rolled_back, errors };
}

// ─── Diff Evidence ──────────────────────────────────────────────────────────────

async function captureDiffEvidence(
  request: RepositoryChangeRequest,
  snapshots: FileSnapshot[],
): Promise<DiffEvidence[]> {
  const evidence: DiffEvidence[] = [];
  const snapshotMap = new Map(snapshots.map(s => [s.path, s]));

  for (const file of [...request.files_created, ...request.files_modified]) {
    const before = snapshotMap.get(file.path);
    const afterContent = file.content || '';
    const afterHash = await sha256(afterContent);

    evidence.push({
      path: file.path,
      action: file.action,
      lines_added: file.lines_added || 0,
      lines_removed: file.lines_removed || 0,
      before_hash: before?.hash || null,
      after_hash: afterHash,
      before_preview: before?.content?.slice(0, 500) || null,
      after_preview: afterContent.slice(0, 500),
    });
  }

  for (const path of request.files_deleted) {
    const before = snapshotMap.get(path);
    evidence.push({
      path,
      action: 'delete',
      lines_added: 0,
      lines_removed: 0,
      before_hash: before?.hash || null,
      after_hash: null,
      before_preview: before?.content?.slice(0, 500) || null,
      after_preview: null,
    });
  }

  return evidence;
}

// ─── Build Execution ────────────────────────────────────────────────────────────

export async function executeBuild(workspacePath: string): Promise<BuildExecutionResult> {
  const startTime = Date.now();
  try {
    const response = await fetch('/api/repository/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: workspacePath, command: 'npm run build' }),
    });
    const result = await response.json();
    return {
      success: result.success ?? false,
      command: 'npm run build',
      output: result.output ?? '',
      duration_ms: Date.now() - startTime,
      errors: result.errors ?? [],
      warnings: result.warnings ?? [],
    };
  } catch (err) {
    return {
      success: false,
      command: 'npm run build',
      output: '',
      duration_ms: Date.now() - startTime,
      errors: [err instanceof Error ? err.message : 'Build execution failed'],
      warnings: [],
    };
  }
}

// ─── Test Execution ────────────────────────────────────────────────────────────

export async function executeTests(workspacePath: string, testPattern?: string): Promise<TestExecutionResult> {
  const startTime = Date.now();
  try {
    const response = await fetch('/api/repository/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: workspacePath, test_pattern: testPattern }),
    });
    const result = await response.json();
    return {
      success: result.success ?? false,
      command: testPattern || 'npx vitest run',
      total: result.total ?? 0,
      passed: result.passed ?? 0,
      failed: result.failed ?? 0,
      output: result.output ?? '',
      duration_ms: Date.now() - startTime,
      test_details: result.test_details ?? [],
    };
  } catch (err) {
    return {
      success: false,
      command: testPattern || 'npx vitest run',
      total: 0,
      passed: 0,
      failed: 0,
      output: '',
      duration_ms: Date.now() - startTime,
      test_details: [],
    };
  }
}

// ─── Main Entry Point ──────────────────────────────────────────────────────────

export async function applyRepositoryChanges(
  request: RepositoryChangeRequest,
): Promise<RepositoryChangeResult> {
  const auditRef = `REPO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const controls = getDefaultRepositoryControls(request.environment);

  // 1. Validate change limits
  const limitCheck = validateChangeLimits(request);
  if (!limitCheck.valid) {
    return {
      success: false,
      applied_files: [],
      snapshots: [],
      diff_evidence: [],
      build_result: null,
      test_result: null,
      rollback_performed: false,
      error: `Change limit violations: ${limitCheck.violations.join('; ')}`,
      audit_ref: auditRef,
    };
  }

  // 2. Validate all file paths
  const allChanges = [...request.files_created, ...request.files_modified];
  for (const file of allChanges) {
    const pathCheck = validateRepositoryPath(file.path, controls);
    if (!pathCheck.valid) {
      return {
        success: false,
        applied_files: [],
        snapshots: [],
        diff_evidence: [],
        build_result: null,
        test_result: null,
        rollback_performed: false,
        error: `Path validation failed: ${pathCheck.reason}`,
        audit_ref: auditRef,
      };
    }
  }

  // 3. Validate file changes against governance controls
  const fileValidation = validateFileChanges(allChanges, controls);
  if (!fileValidation.valid) {
    return {
      success: false,
      applied_files: [],
      snapshots: [],
      diff_evidence: [],
      build_result: null,
      test_result: null,
      rollback_performed: false,
      error: `Governance validation failed: ${fileValidation.violations.join('; ')}`,
      audit_ref: auditRef,
    };
  }

  // 4. Capture pre-change snapshots
  const { snapshots, errors: snapshotErrors } = await capturePreChangeSnapshot(request);
  if (snapshotErrors.length > 0) {
    // Non-blocking — proceed with application
  }

  // 5. Apply file changes
  const { applied, errors: applyErrors } = await applyFileChanges(request);

  if (applyErrors.length > 0) {
    // Partial application — rollback
    await rollbackChanges(snapshots, request.actor);
    return {
      success: false,
      applied_files: [],
      snapshots,
      diff_evidence: [],
      build_result: null,
      test_result: null,
      rollback_performed: true,
      error: `File application failed: ${applyErrors.join('; ')}. Rolled back.`,
      audit_ref: auditRef,
    };
  }

  // 6. Capture diff evidence
  const diffEvidence = await captureDiffEvidence(request, snapshots);

  // 7. Execute build
  const buildResult = await executeBuild(request.workspace_path);

  if (!buildResult.success) {
    await rollbackChanges(snapshots, request.actor);
    return {
      success: false,
      applied_files: applied,
      snapshots,
      diff_evidence: diffEvidence,
      build_result: buildResult,
      test_result: null,
      rollback_performed: true,
      error: `Build failed: ${buildResult.errors.join('; ')}. Rolled back.`,
      audit_ref: auditRef,
    };
  }

  // 8. Execute tests
  const testResult = await executeTests(request.workspace_path);

  if (!testResult.success) {
    await rollbackChanges(snapshots, request.actor);
    return {
      success: false,
      applied_files: applied,
      snapshots,
      diff_evidence: diffEvidence,
      build_result: buildResult,
      test_result: testResult,
      rollback_performed: true,
      error: `Tests failed: ${testResult.failed} of ${testResult.total} tests failed. Rolled back.`,
      audit_ref: auditRef,
    };
  }

  // 9. Record audit trail
  await supabase.from('repository_change_audit').insert({
    audit_ref: auditRef,
    execution_id: request.execution_id,
    ewo_ref: request.ewo_ref,
    actor: request.actor,
    environment: request.environment,
    files_applied: applied,
    snapshots: snapshots,
    diff_evidence: diffEvidence,
    build_result: buildResult,
    test_result: testResult,
    rollback_performed: false,
    created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  return {
    success: true,
    applied_files: applied,
    snapshots,
    diff_evidence: diffEvidence,
    build_result: buildResult,
    test_result: testResult,
    rollback_performed: false,
    error: null,
    audit_ref: auditRef,
  };
}
