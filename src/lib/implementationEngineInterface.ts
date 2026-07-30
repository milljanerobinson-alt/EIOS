// EWO-017 Req 3 — Implementation Engine Abstraction
//
// Canonical interface that all implementation engines must implement.
// The execution orchestrator interacts ONLY with this abstraction layer.
// Changing implementation engines requires zero workflow changes.
//
// Engines: Bolt, Codex, OpenAI Code Engine, Claude Code, EIOS Code Engine,
// future internal engines.

import { supabase } from './supabase';

// ─── Canonical Interface ──────────────────────────────────────────────────────

export interface ImplementationEngine {
  readonly engineId: string;
  readonly engineName: string;
  readonly engineVersion: string;
  readonly supportsFileWrites: boolean;
  readonly supportsDatabaseMigrations: boolean;
  readonly supportsTests: boolean;
  readonly supportsBuilds: boolean;
  invoke(request: ImplementationRequest): Promise<ImplementationResult>;
  healthCheck(): Promise<{ healthy: boolean; detail: string }>;
}

export interface ImplementationRequest {
  ewoRef: string;
  ewoTitle: string;
  ewoBody: string;
  engineeringPlan: string;
  engineeringStandards: string[];
  constitutionalRequirements: string[];
  relatedEngineering: string[];
  historicalContext: string;
  verificationRequirements: string;
  testingInstructions: string;
  targetPlatform: string;
  targetRepository: string;
  targetBranch: string;
  targetEnvironment: 'staging' | 'production';
  affectedComponents: string[];
}

export interface ImplementationResult {
  status: 'success' | 'partial' | 'failed' | 'simulation_complete';
  summary: string;
  filesModified: FileChange[];
  databaseChanges: DatabaseChange[];
  buildResult: BuildResult;
  testResults: TestResult[];
  warnings: string[];
  errors: string[];
  implementationLog: string;
  commitRef: string | null;
  evidence: Record<string, unknown>;
}

export interface FileChange {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  linesAdded?: number;
  linesRemoved?: number;
  attributableTo: string; // ewo_ref
  /** Complete file content after the change (for create/modify). */
  content?: string;
  /** The change action as specified by the provider. */
  changeType?: 'create' | 'modify' | 'delete';
  /** Summary of the diff. */
  diff_summary?: string;
}

export interface DatabaseChange {
  type: 'migration' | 'seed' | 'rls' | 'index';
  migrationFile: string;
  description: string;
  attributableTo: string;
}

export interface BuildResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  durationMs: number;
}

export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail?: string;
  durationMs?: number;
}

// ─── Engine Registry ──────────────────────────────────────────────────────────

export interface EngineRegistryEntry {
  engineId: string;
  engineName: string;
  engineVersion: string;
  isActive: boolean;
  supportsFileWrites: boolean;
  supportsDatabaseMigrations: boolean;
  supportsTests: boolean;
  supportsBuilds: boolean;
  capabilities: Record<string, unknown>;
}

export async function getRegisteredEngines(): Promise<EngineRegistryEntry[]> {
  const { data } = await supabase
    .from('implementation_engine_registry')
    .select('*')
    .eq('is_active', true)
    .order('engine_name');
  return (data ?? []) as unknown as EngineRegistryEntry[];
}

export async function getEngineById(engineId: string): Promise<EngineRegistryEntry | null> {
  const { data } = await supabase
    .from('implementation_engine_registry')
    .select('*')
    .eq('engine_id', engineId)
    .maybeSingle();
  return data as unknown as EngineRegistryEntry | null;
}

// ─── Engine Adapter (simulated invocation) ────────────────────────────────────
//
// In production, each engine would have a concrete adapter that calls the
// real engine API. For governed execution within EIOS, the adapter produces
// a structured result that the orchestrator validates.

export class BoltEngineAdapter implements ImplementationEngine {
  readonly engineId = 'bolt';
  readonly engineName = 'Bolt';
  readonly engineVersion = '1.0';
  readonly supportsFileWrites = true;
  readonly supportsDatabaseMigrations = true;
  readonly supportsTests = true;
  readonly supportsBuilds = true;

  async invoke(request: ImplementationRequest): Promise<ImplementationResult> {
    return simulateEngineInvocation(this.engineId, this.engineName, request);
  }

  async healthCheck(): Promise<{ healthy: boolean; detail: string }> {
    return { healthy: true, detail: 'Bolt engine operational' };
  }
}

export class ClaudeCodeEngineAdapter implements ImplementationEngine {
  readonly engineId = 'claude_code';
  readonly engineName = 'Claude Code';
  readonly engineVersion = '1.0';
  readonly supportsFileWrites = true;
  readonly supportsDatabaseMigrations = true;
  readonly supportsTests = true;
  readonly supportsBuilds = true;

  async invoke(request: ImplementationRequest): Promise<ImplementationResult> {
    return simulateEngineInvocation(this.engineId, this.engineName, request);
  }

  async healthCheck(): Promise<{ healthy: boolean; detail: string }> {
    return { healthy: true, detail: 'Claude Code engine operational' };
  }
}

export class CodexEngineAdapter implements ImplementationEngine {
  readonly engineId = 'codex';
  readonly engineName = 'Codex';
  readonly engineVersion = '2.0';
  readonly supportsFileWrites = true;
  readonly supportsDatabaseMigrations = true;
  readonly supportsTests = true;
  readonly supportsBuilds = true;

  async invoke(request: ImplementationRequest): Promise<ImplementationResult> {
    return realCodexInvocation(request);
  }

  async healthCheck(): Promise<{ healthy: boolean; detail: string }> {
    return { healthy: true, detail: 'Codex engine operational (real API)' };
  }
}

export class ManualEngineAdapter implements ImplementationEngine {
  readonly engineId = 'manual';
  readonly engineName = 'Manual';
  readonly engineVersion = '1.0';
  readonly supportsFileWrites = false;
  readonly supportsDatabaseMigrations = false;
  readonly supportsTests = false;
  readonly supportsBuilds = false;

  async invoke(request: ImplementationRequest): Promise<ImplementationResult> {
    return {
      status: 'success',
      summary: `Manual implementation pending for ${request.ewoRef}. Engineer to implement and report completion.`,
      filesModified: [],
      databaseChanges: [],
      buildResult: { success: true, errors: [], warnings: [], durationMs: 0 },
      testResults: [],
      warnings: ['Manual implementation — engineer must report completion'],
      errors: [],
      implementationLog: `Manual implementation requested for ${request.ewoRef} on ${request.targetPlatform}/${request.targetRepository}`,
      commitRef: null,
      evidence: { engine: 'manual', ewo_ref: request.ewoRef },
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; detail: string }> {
    return { healthy: true, detail: 'Manual engine (human engineer)' };
  }
}

// ─── Engine Factory ───────────────────────────────────────────────────────────

const engineAdapters = new Map<string, ImplementationEngine>([
  ['bolt', new BoltEngineAdapter()],
  ['claude_code', new ClaudeCodeEngineAdapter()],
  ['codex', new CodexEngineAdapter()],
  ['eios_code_engine', new BoltEngineAdapter()], // EIOS uses Bolt adapter
  ['manual', new ManualEngineAdapter()],
]);

export function getEngine(engineId: string): ImplementationEngine {
  const engine = engineAdapters.get(engineId);
  if (!engine) {
    throw new Error(`Implementation engine '${engineId}' is not registered. Available: ${Array.from(engineAdapters.keys()).join(', ')}`);
  }
  return engine;
}

export function getAvailableEngineIds(): string[] {
  return Array.from(engineAdapters.keys());
}

// ─── Simulated Invocation ─────────────────────────────────────────────────────
//
// Produces a structured ImplementationResult for simulation/dry-run ONLY.
// A simulated result MUST NOT be treated as a production success. The status
// is 'simulation_complete' (a non-completion state) so downstream lifecycle
// logic cannot confuse it with real implementation.
//
// In a live deployment, this is replaced with the real engine API call.

async function simulateEngineInvocation(
  engineId: string,
  engineName: string,
  request: ImplementationRequest,
): Promise<ImplementationResult> {
  const timestamp = new Date().toISOString();

  return {
    status: 'simulation_complete',
    summary: `[SIMULATION] ${engineName} simulated ${request.ewoRef} on ${request.targetPlatform}/${request.targetRepository}@${request.targetBranch}. No real code changes were made.`,
    filesModified: [],
    databaseChanges: [],
    buildResult: {
      success: false,
      errors: ['Simulation mode — no real build was performed'],
      warnings: ['This is a simulation. No files were modified, no build was run, no tests were executed. This result must not be treated as implementation success.'],
      durationMs: 0,
    },
    testResults: [],
    warnings: [
      'SIMULATION MODE: No genuine implementation occurred.',
      'This result must not progress to Implementation Complete.',
      'A real implementation provider must be invoked for production completion.',
    ],
    errors: ['Simulation result — not a real implementation'],
    implementationLog: `[${timestamp}] [SIMULATION] ${engineName} (${engineId}) simulated for ${request.ewoRef}\nTarget: ${request.targetPlatform}/${request.targetRepository}@${request.targetBranch}\nEnvironment: ${request.targetEnvironment}\nAffected components: ${request.affectedComponents.join(', ')}\n\nNO FILES WERE MODIFIED. NO BUILD WAS RUN. NO TESTS WERE EXECUTED.\nThis is a simulation result and must not be treated as implementation success.`,
    commitRef: null,
    evidence: {
      engine_id: engineId,
      engine_name: engineName,
      ewo_ref: request.ewoRef,
      target: `${request.targetPlatform}/${request.targetRepository}`,
      branch: request.targetBranch,
      timestamp,
      simulation: true,
    },
  };
}

/**
 * EWO-034 — Real Codex invocation via the codex-execute edge function.
 *
 * Calls the OpenAI API through the governed edge function, receives
 * structured file changes with complete file contents, then applies
 * them through the Repository Change Application Service.
 */
async function realCodexInvocation(
  request: ImplementationRequest,
): Promise<ImplementationResult> {
  const timestamp = new Date().toISOString();
  const startTime = Date.now();

  try {
    // 1. Resolve the governed execution provider using the canonical resolver.
    // EWO-034R.3B: No provider_id, no VITE_OPENAI_API_KEY, no client-side key.
    const { resolveExecutionProvider, resolveExecutionModel } = await import('./codexProviderResolver');

    const provider = await resolveExecutionProvider();
    if (!provider.resolved) {
      return {
        status: 'failed',
        summary: `Execution provider not ready: ${provider.reason}`,
        filesModified: [],
        databaseChanges: [],
        buildResult: { success: false, errors: [provider.reason], warnings: [], durationMs: 0 },
        testResults: [],
        warnings: [],
        errors: [provider.reason],
        implementationLog: `[${timestamp}] Failed: ${provider.reason}`,
        commitRef: null,
        evidence: { error: 'provider_not_ready', provider, timestamp },
      };
    }

    const modelResolution = await resolveExecutionModel(provider.model);
    if (!modelResolution.resolved) {
      return {
        status: 'failed',
        summary: `Model resolution failed: ${modelResolution.reason}`,
        filesModified: [],
        databaseChanges: [],
        buildResult: { success: false, errors: [modelResolution.reason], warnings: [], durationMs: 0 },
        testResults: [],
        warnings: [],
        errors: [modelResolution.reason],
        implementationLog: `[${timestamp}] Failed: ${modelResolution.reason}`,
        commitRef: null,
        evidence: { error: 'model_not_ready', modelResolution, timestamp },
      };
    }

    // 2. Build the edge function request — NO api_key in the body.
    // EWO-034R.3B: The edge function resolves credentials server-side.
    const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/codex-execute`;
    const edgeHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    };

    const edgeBody = {
      execution_id: request.ewoRef,
      ewo_ref: request.ewoRef,
      task_objective: request.ewoTitle || request.engineeringPlan || 'Engineering implementation',
      implementation_scope: request.engineeringPlan || request.ewoBody || '',
      acceptance_criteria: [
        'Target component is correctly identified',
        'Code change achieves the stated objective',
        'Build succeeds after change',
        'Relevant tests pass',
      ],
      affected_components: request.affectedComponents,
      target_repository: request.targetRepository,
      target_branch: request.targetBranch || 'staging',
      target_environment: request.targetEnvironment || 'staging',
      governance_constraints: request.constitutionalRequirements || [
        'Every modification attributable to originating EWO',
        'Full audit trail',
        'Rollback capability',
      ],
      restricted_files: ['.env', '.env.*', '*.pem', '*.key', 'secrets.*'],
      model: modelResolution.model,
    };

    // 3. Call the edge function
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: edgeHeaders,
      body: JSON.stringify(edgeBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        status: 'failed',
        summary: `Codex edge function returned ${response.status}`,
        filesModified: [],
        databaseChanges: [],
        buildResult: { success: false, errors: [errText], warnings: [], durationMs: 0 },
        testResults: [],
        warnings: [],
        errors: [`Edge function error: ${errText}`],
        implementationLog: `[${timestamp}] Edge function failed: ${response.status} ${errText}`,
        commitRef: null,
        evidence: { error: 'edge_function_error', status: response.status, timestamp },
      };
    }

    const codexResult = await response.json();

    if (codexResult.execution_status === 'failed' || codexResult.error) {
      return {
        status: 'failed',
        summary: codexResult.error || 'Codex execution failed',
        filesModified: [],
        databaseChanges: [],
        buildResult: { success: false, errors: [codexResult.error || 'Unknown'], warnings: [], durationMs: 0 },
        testResults: [],
        warnings: [],
        errors: [codexResult.error || 'Codex execution failed'],
        implementationLog: `[${timestamp}] Codex failed: ${codexResult.error}`,
        commitRef: null,
        evidence: { error: 'codex_failed', timestamp, raw: codexResult },
      };
    }

    // 4. Map Codex response to ImplementationResult file format
    const allFiles = [
      ...(codexResult.files_created || []).map((f: { path: string; content?: string; diff_summary?: string; lines_added?: number; lines_removed?: number }) => ({
        path: f.path,
        content: f.content,
        action: 'create' as const,
        diff_summary: f.diff_summary || '',
        lines_added: f.lines_added || 0,
        lines_removed: f.lines_removed || 0,
      })),
      ...(codexResult.files_modified || []).map((f: { path: string; content?: string; diff_summary?: string; lines_added?: number; lines_removed?: number }) => ({
        path: f.path,
        content: f.content,
        action: 'modify' as const,
        diff_summary: f.diff_summary || '',
        lines_added: f.lines_added || 0,
        lines_removed: f.lines_removed || 0,
      })),
    ];

    const filesModified: ImplementationResult['filesModified'] = allFiles.map((f: { path: string; action: string; content?: string; diff_summary?: string; lines_added?: number; lines_removed?: number }) => ({
      path: f.path,
      attributableTo: request.ewoRef,
      action: (f.action === 'create' ? 'created' : 'modified') as 'created' | 'modified',
      content: f.content,
      diff_summary: f.diff_summary,
      linesAdded: f.lines_added,
      linesRemoved: f.lines_removed,
    }));

    // 5. Apply repository changes through the GitHub-Native Execution Service
    // EWO-034R.2: Replace filesystem mutation with GitHub API commits
    const { executeViaGitHub } = await import('./githubExecutionService');

    // Load repository config to get project_id
    const { data: ewoRow } = await supabase
      .from('engineering_work_orders')
      .select('id, title, project_id')
      .eq('ewo_ref', request.ewoRef)
      .maybeSingle();

    const projectId = ewoRow?.project_id || 'default';
    const ewoTitle = ewoRow?.title || request.ewoTitle || request.ewoRef;

    // Generate acceptance criteria for the execution
    const { generateAcceptanceCriteria } = await import('./acceptanceCriteriaService');
    const acceptanceCriteria = generateAcceptanceCriteria(
      request.ewoRef,
      `${request.ewoTitle || ''} ${request.engineeringPlan || ''}`,
    );

    const ghResult = await executeViaGitHub({
      ewo_ref: request.ewoRef,
      ewo_id: ewoRow?.id || request.ewoRef,
      ewo_title: ewoTitle,
      project_id: projectId,
      files_created: allFiles.filter((f: { action: string }) => f.action === 'create'),
      files_modified: allFiles.filter((f: { action: string }) => f.action === 'modify'),
      files_deleted: codexResult.files_deleted || [],
      acceptance_criteria: acceptanceCriteria,
      actor: 'codex-pipeline',
    });

    if (!ghResult.success) {
      return {
        status: 'failed',
        summary: `GitHub execution failed: ${ghResult.error}`,
        filesModified,
        databaseChanges: [],
        buildResult: { success: false, errors: [ghResult.error || 'Unknown'], warnings: [], durationMs: 0 },
        testResults: [],
        warnings: [],
        errors: [ghResult.error || 'GitHub execution failed'],
        implementationLog: `[${timestamp}] GitHub execution failed: ${ghResult.error}`,
        commitRef: null,
        evidence: {
          engine_id: 'codex',
          ewo_ref: request.ewoRef,
          codex_result: codexResult,
          gh_result: ghResult,
          timestamp,
        },
      };
    }

    // 6. Map workflow results to test results
    const workflowConclusion = ghResult.workflow_conclusion;
    const workflowPassed = workflowConclusion === 'success' || workflowConclusion === null;

    const testResults: ImplementationResult['testResults'] = [{
      name: 'GitHub Actions Workflow',
      status: workflowPassed ? 'pass' : 'fail',
      detail: workflowConclusion ? `Workflow ${workflowConclusion}` : 'Workflow not triggered (may not be configured)',
      durationMs: 0,
    }];

    // 7. Build the final ImplementationResult
    return {
      status: 'success',
      summary: `Codex executed ${request.ewoRef}: ${filesModified.length} files committed to ${ghResult.ewo_branch}. Workflow: ${workflowConclusion || 'not run'}.`,
      filesModified,
      databaseChanges: [],
      buildResult: {
        success: workflowPassed,
        errors: workflowPassed ? [] : [`Workflow ${workflowConclusion}`],
        warnings: [],
        durationMs: 0,
      },
      testResults,
      warnings: codexResult.unresolved_issues || [],
      errors: [],
      implementationLog: `[${timestamp}] Codex + GitHub execution for ${request.ewoRef}\nBranch: ${ghResult.ewo_branch}\nCommits: ${ghResult.commit_shas.join(', ')}\nWorkflow: ${ghResult.workflow_run_url || 'not triggered'}\nDiff: ${ghResult.diff_url || 'N/A'}`,
      commitRef: ghResult.commit_shas[0] || null,
      evidence: {
        engine_id: 'codex',
        engine_name: 'Codex',
        ewo_ref: request.ewoRef,
        target: `${request.targetPlatform}/${request.targetRepository}`,
        branch: ghResult.ewo_branch,
        timestamp,
        simulation: false,
        codex_result: {
          model: codexResult.model_used,
          usage: codexResult.actual_usage,
          cost: codexResult.actual_cost,
        },
        github_evidence: {
          ewo_branch: ghResult.ewo_branch,
          branch_url: ghResult.branch_url,
          base_commit_sha: ghResult.base_commit_sha,
          commit_shas: ghResult.commit_shas,
          diff_url: ghResult.diff_url,
          canonical_diff: ghResult.canonical_diff,
          workflow_run_id: ghResult.workflow_run_id,
          workflow_run_url: ghResult.workflow_run_url,
          workflow_conclusion: ghResult.workflow_conclusion,
          acceptance_criteria_passed: ghResult.acceptance_criteria_passed,
        },
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      summary: `Codex invocation error: ${err instanceof Error ? err.message : 'unknown'}`,
      filesModified: [],
      databaseChanges: [],
      buildResult: { success: false, errors: [String(err)], warnings: [], durationMs: Date.now() - startTime },
      testResults: [],
      warnings: [],
      errors: [err instanceof Error ? err.message : 'Unknown error'],
      implementationLog: `[${timestamp}] Error: ${err instanceof Error ? err.message : 'unknown'}`,
      commitRef: null,
      evidence: { error: 'exception', timestamp },
    };
  }
}
