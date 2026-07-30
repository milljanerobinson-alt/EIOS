/**
 * EWO-034R.4 / EWO-035R.2 — Governed GitHub Repository Configuration Page
 *
 * Allows the Product Owner to configure the GitHub repository that the
 * autonomous execution pipeline targets. Validates all fields before
 * saving and provides a readiness check that verifies the repository
 * is accessible via the github-operations edge function.
 *
 * EWO-035R.2 changes:
 * - Separates token detection from repository accessibility
 * - Adds empty-repository state representation
 * - Adds error categories for precise diagnostics
 * - Adds remote workflow file existence check
 * - Does not falsely report token missing when repo is empty or branch is absent
 */

import { useState, useEffect, useCallback } from 'react';
import {
  loadRepositoryConfig,
  saveRepositoryConfig,
  inspectRepository,
  resolveBaseCommit,
  checkFileExistsRemote,
  type RepositoryConfig,
  type InspectRepositoryResult,
  type RepositoryErrorCategory,
} from '../../lib/githubRepositoryService';
import { resolveExecutionProvider } from '../../lib/codexProviderResolver';
import {
  GitBranch, Shield, CheckCircle2, XCircle, Loader2, AlertCircle,
  Save, RefreshCw, ExternalLink, Lock, GitCommit, AlertTriangle, Info,
} from 'lucide-react';

const DEFAULT_CONFIG: RepositoryConfig = {
  project_id: 'default',
  repository_owner: '',
  repository_name: '',
  credential_ref: 'github_token',
  credential_type: 'fine_grained_token',
  default_base_branch: 'main',
  staging_branch: 'staging',
  production_branch: 'main',
  allowed_source_directories: ['src/', 'supabase/functions/', 'public/'],
  protected_paths: ['.env', '.env.*', '.gitignore', 'package-lock.json', 'supabase/migrations/'],
  workflow_file: '.github/workflows/ewo-verify.yml',
  lifecycle_status: 'active',
  github_api_base: 'https://api.github.com',
  installation_id: null,
};

interface ReadinessResult {
  openai_provider: boolean;
  configuration_saved: boolean;
  token_detected: boolean;
  repository_accessible: boolean;
  repository_empty: boolean;
  base_branch_resolves: boolean;
  workflow_path_configured: boolean;
  workflow_file_present_remotely: boolean;
  readiness_error: string | null;
  readiness_error_category: RepositoryErrorCategory | null;
}

const ERROR_CATEGORY_LABELS: Record<RepositoryErrorCategory, string> = {
  token_missing: 'GitHub token not configured or not found',
  token_unauthorised: 'GitHub token is not authorised for this repository',
  repository_not_found: 'Repository not found — check owner and name',
  repository_inaccessible: 'Repository is not accessible — network or API error',
  repository_empty: 'Repository exists but has no commits yet',
  operation_unsupported: 'Edge function does not support this operation',
  branch_missing: 'Base branch does not exist yet (expected for empty repositories)',
  workflow_missing: 'Workflow file does not exist in the repository',
  runtime_error: 'Unexpected runtime error during inspection',
};

function createEmptyReadiness(): ReadinessResult {
  return {
    openai_provider: false,
    configuration_saved: false,
    token_detected: false,
    repository_accessible: false,
    repository_empty: false,
    base_branch_resolves: false,
    workflow_path_configured: false,
    workflow_file_present_remotely: false,
    readiness_error: null,
    readiness_error_category: null,
  };
}

export default function ECCRepositoryConfigPage() {
  const [config, setConfig] = useState<RepositoryConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [inspectResult, setInspectResult] = useState<InspectRepositoryResult | null>(null);
  const [branchResult, setBranchResult] = useState<{
    sha: string | null; branch: string | null; error: string | null; error_category: RepositoryErrorCategory | null;
  } | null>(null);
  const [workflowFileResult, setWorkflowFileResult] = useState<{ exists: boolean; error: string | null } | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const existing = await loadRepositoryConfig('default');
      if (existing) {
        setConfig(existing);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (!config.repository_owner.trim()) {
      setError('Repository owner is required');
      setSaving(false);
      return;
    }
    if (!config.repository_name.trim()) {
      setError('Repository name is required');
      setSaving(false);
      return;
    }
    if (!config.default_base_branch.trim()) {
      setError('Default base branch is required');
      setSaving(false);
      return;
    }
    if (!config.production_branch.trim()) {
      setError('Production branch is required');
      setSaving(false);
      return;
    }
    if (!config.workflow_file.trim()) {
      setError('Workflow file path is required');
      setSaving(false);
      return;
    }

    try {
      const result = await saveRepositoryConfig({
        ...config,
        project_id: 'default',
      });
      if (!result.success) {
        throw new Error(result.error || 'Save failed');
      }
      setSuccess('Repository configuration saved successfully');
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleReadinessCheck() {
    setChecking(true);
    setError(null);
    setSuccess(null);
    setInspectResult(null);
    setBranchResult(null);
    setWorkflowFileResult(null);

    const result = createEmptyReadiness();

    try {
      // 1. Check OpenAI provider
      const provider = await resolveExecutionProvider();
      result.openai_provider = provider.resolved;

      // 2. Check repository config exists
      const savedConfig = await loadRepositoryConfig('default');
      result.configuration_saved = savedConfig !== null;

      if (!savedConfig) {
        result.readiness_error = 'Repository configuration not saved';
        result.readiness_error_category = 'runtime_error';
        setReadiness(result);
        setChecking(false);
        return;
      }

      // 3. Inspect repository — this verifies BOTH token validity AND repository accessibility
      const inspect = await inspectRepository(savedConfig);
      setInspectResult(inspect);

      if (inspect.accessible) {
        // Token is valid AND repository is accessible
        result.token_detected = true;
        result.repository_accessible = true;
        result.repository_empty = inspect.empty ?? false;
      } else {
        // Distinguish token failure from repository-not-found
        const category = inspect.error_category;
        if (category === 'token_unauthorised') {
          result.token_detected = false;
          result.repository_accessible = false;
          result.readiness_error = ERROR_CATEGORY_LABELS.token_unauthorised;
          result.readiness_error_category = 'token_unauthorised';
        } else if (category === 'repository_not_found') {
          // Token might be valid but repo doesn't exist — we can't tell for sure
          // Mark token as unknown (false) and repo as not accessible
          result.token_detected = false;
          result.repository_accessible = false;
          result.readiness_error = ERROR_CATEGORY_LABELS.repository_not_found;
          result.readiness_error_category = 'repository_not_found';
        } else if (category === 'operation_unsupported') {
          result.token_detected = false;
          result.repository_accessible = false;
          result.readiness_error = ERROR_CATEGORY_LABELS.operation_unsupported;
          result.readiness_error_category = 'operation_unsupported';
        } else {
          result.token_detected = false;
          result.repository_accessible = false;
          result.readiness_error = inspect.error || ERROR_CATEGORY_LABELS.runtime_error;
          result.readiness_error_category = category || 'runtime_error';
        }
        setReadiness(result);
        setChecking(false);
        return;
      }

      // 4. Check base branch resolves — only if repo is not empty
      // For empty repos, base branch is expected to be absent
      if (result.repository_empty) {
        result.base_branch_resolves = false;
        // Don't set an error — this is expected for empty repos
      } else {
        const branch = await resolveBaseCommit(savedConfig);
        setBranchResult(branch);
        result.base_branch_resolves = branch.sha !== null;
        if (!branch.sha && branch.error_category === 'branch_missing') {
          // Branch missing in a non-empty repo is a real issue
          result.readiness_error = ERROR_CATEGORY_LABELS.branch_missing;
          result.readiness_error_category = 'branch_missing';
        }
      }

      // 5. Check workflow path is configured (local config check)
      result.workflow_path_configured = savedConfig.workflow_file.trim().length > 0;

      // 6. Check workflow file exists remotely — only if repo is not empty
      if (result.repository_empty) {
        // No files exist in an empty repo — this is expected
        result.workflow_file_present_remotely = false;
      } else if (result.base_branch_resolves) {
        const wfResult = await checkFileExistsRemote(
          savedConfig,
          savedConfig.workflow_file,
          savedConfig.default_base_branch,
        );
        setWorkflowFileResult(wfResult);
        result.workflow_file_present_remotely = wfResult.exists;
        if (!wfResult.exists) {
          result.readiness_error = ERROR_CATEGORY_LABELS.workflow_missing;
          result.readiness_error_category = 'workflow_missing';
        }
      } else {
        // Can't check workflow file if base branch doesn't resolve
        result.workflow_file_present_remotely = false;
      }

      setReadiness(result);

      // Determine overall status
      const coreChecks = [
        result.openai_provider,
        result.configuration_saved,
        result.token_detected,
        result.repository_accessible,
        result.workflow_path_configured,
      ];
      const allCorePassed = coreChecks.every(Boolean);

      if (result.repository_empty) {
        setSuccess(
          'Repository is accessible but empty. Bootstrap is required before governed execution can proceed.',
        );
      } else if (allCorePassed && result.base_branch_resolves && result.workflow_file_present_remotely) {
        setSuccess('All readiness checks passed — execution pipeline is ready');
      } else {
        const failed: string[] = [];
        if (!result.openai_provider) failed.push('OpenAI provider');
        if (!result.token_detected) failed.push('GitHub token');
        if (!result.repository_accessible) failed.push('Repository accessible');
        if (!result.base_branch_resolves) failed.push('Base branch');
        if (!result.workflow_file_present_remotely) failed.push('Workflow file remote');
        setError(`Readiness checks failed: ${failed.join(', ')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Readiness check failed');
      setReadiness(result);
    } finally {
      setChecking(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <GitBranch className="w-7 h-7 text-blue-600" />
        <h1 className="text-2xl font-bold text-slate-900">GitHub Repository Configuration</h1>
      </div>
      <p className="text-sm text-slate-500 -mt-2">
        Configure the GitHub repository that the autonomous execution pipeline targets.
        This is required before any governed execution can proceed.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-500" />
          Repository Settings
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Repository Owner" required>
            <input
              type="text"
              value={config.repository_owner}
              onChange={e => setConfig({ ...config, repository_owner: e.target.value })}
              placeholder="e.g. my-organization"
              className="input-base"
            />
          </Field>
          <Field label="Repository Name" required>
            <input
              type="text"
              value={config.repository_name}
              onChange={e => setConfig({ ...config, repository_name: e.target.value })}
              placeholder="e.g. eios-platform"
              className="input-base"
            />
          </Field>
          <Field label="Default Base Branch" required>
            <input
              type="text"
              value={config.default_base_branch}
              onChange={e => setConfig({ ...config, default_base_branch: e.target.value })}
              placeholder="main"
              className="input-base"
            />
          </Field>
          <Field label="Staging Branch">
            <input
              type="text"
              value={config.staging_branch || ''}
              onChange={e => setConfig({ ...config, staging_branch: e.target.value })}
              placeholder="staging"
              className="input-base"
            />
          </Field>
          <Field label="Production Branch" required>
            <input
              type="text"
              value={config.production_branch}
              onChange={e => setConfig({ ...config, production_branch: e.target.value })}
              placeholder="main"
              className="input-base"
            />
          </Field>
          <Field label="Workflow File" required>
            <input
              type="text"
              value={config.workflow_file}
              onChange={e => setConfig({ ...config, workflow_file: e.target.value })}
              placeholder=".github/workflows/ewo-verify.yml"
              className="input-base"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Credential Reference">
            <input
              type="text"
              value={config.credential_ref}
              onChange={e => setConfig({ ...config, credential_ref: e.target.value })}
              placeholder="github_token"
              className="input-base font-mono text-xs"
            />
            <p className="text-xs text-slate-400 mt-1">
              The edge function secret name that holds the GitHub token.
            </p>
          </Field>
          <Field label="Credential Type">
            <select
              value={config.credential_type}
              onChange={e => setConfig({ ...config, credential_type: e.target.value as 'github_app' | 'fine_grained_token' })}
              className="input-base"
            >
              <option value="fine_grained_token">Fine-Grained Token</option>
              <option value="github_app">GitHub App</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Allowed Source Directories">
            <textarea
              value={config.allowed_source_directories.join('\n')}
              onChange={e => setConfig({ ...config, allowed_source_directories: e.target.value.split('\n').filter(Boolean) })}
              placeholder="src/&#10;supabase/functions/&#10;public/"
              className="input-base font-mono text-xs"
              rows={4}
            />
            <p className="text-xs text-slate-400 mt-1">One directory per line. Only files in these directories can be modified.</p>
          </Field>
          <Field label="Protected Paths">
            <textarea
              value={config.protected_paths.join('\n')}
              onChange={e => setConfig({ ...config, protected_paths: e.target.value.split('\n').filter(Boolean) })}
              placeholder=".env&#10;.env.*&#10;package-lock.json"
              className="input-base font-mono text-xs"
              rows={4}
            />
            <p className="text-xs text-slate-400 mt-1">One path per line. These files can never be modified by the execution pipeline.</p>
          </Field>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          <button
            onClick={fetchConfig}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
        </div>
      </div>

      {/* Readiness Check */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <GitCommit className="w-5 h-5 text-emerald-500" />
          Execution Readiness Check
        </h2>
        <p className="text-sm text-slate-500">
          Verifies that the execution pipeline can reach GitHub, resolve the base branch,
          and that the OpenAI provider is configured. Does not perform any mutations.
        </p>

        <button
          onClick={handleReadinessCheck}
          disabled={checking}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
          {checking ? 'Checking...' : 'Run Readiness Check'}
        </button>

        {readiness && (
          <div className="space-y-2">
            <ReadinessItem label="OpenAI Provider Configured" passed={readiness.openai_provider} />
            <ReadinessItem label="Repository Configuration Saved" passed={readiness.configuration_saved} />
            <ReadinessItem label="GitHub Token Detected" passed={readiness.token_detected} />
            <ReadinessItem label="Repository Accessible" passed={readiness.repository_accessible} />
            <ReadinessItem
              label="Repository Initialised"
              passed={!readiness.repository_empty}
              pending={readiness.repository_accessible && readiness.repository_empty}
              pendingLabel="Empty — bootstrap required"
            />
            <ReadinessItem
              label="Base Branch Resolves"
              passed={readiness.base_branch_resolves}
              pending={readiness.repository_accessible && readiness.repository_empty && !readiness.base_branch_resolves}
              pendingLabel="Pending — no commits yet"
            />
            <ReadinessItem label="Workflow Path Configured" passed={readiness.workflow_path_configured} />
            <ReadinessItem
              label="Workflow File Present Remotely"
              passed={readiness.workflow_file_present_remotely}
              pending={readiness.repository_accessible && readiness.repository_empty && !readiness.workflow_file_present_remotely}
              pendingLabel="Pending — no files yet"
            />
          </div>
        )}

        {/* Error category banner */}
        {readiness?.readiness_error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">{readiness.readiness_error}</p>
              {readiness.readiness_error_category && (
                <p className="text-xs mt-0.5 text-amber-600">
                  Category: {readiness.readiness_error_category}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Empty repository info banner */}
        {readiness?.repository_accessible && readiness?.repository_empty && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Repository is empty — bootstrap required</p>
              <p className="text-xs mt-0.5 text-blue-600">
                The repository exists and is accessible, but has no commits or branches yet.
                Run the repository bootstrap to initialise the base branch and workflow file.
                This is expected for a new repository and is not an error.
              </p>
            </div>
          </div>
        )}

        {/* Inspect details */}
        {inspectResult && inspectResult.accessible && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm space-y-1">
            <div className="flex items-center gap-2 text-slate-600">
              <Lock className="w-3.5 h-3.5" />
              <span className="text-xs">Private: {inspectResult.private ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <GitBranch className="w-3.5 h-3.5" />
              <span className="text-xs">Default branch: {inspectResult.default_branch}</span>
            </div>
            {inspectResult.full_name && (
              <div className="flex items-center gap-2 text-slate-600">
                <GitCommit className="w-3.5 h-3.5" />
                <span className="text-xs font-mono">{inspectResult.full_name}</span>
              </div>
            )}
            {inspectResult.size !== null && (
              <div className="flex items-center gap-2 text-slate-600">
                <Info className="w-3.5 h-3.5" />
                <span className="text-xs">Size: {inspectResult.size} KB {inspectResult.empty ? '(empty)' : ''}</span>
              </div>
            )}
            {config.repository_owner && config.repository_name && (
              <a
                href={`https://github.com/${config.repository_owner}/${config.repository_name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                View on GitHub <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Branch details */}
        {branchResult && branchResult.sha && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <GitCommit className="w-3.5 h-3.5" />
              <span className="text-xs font-mono">Base SHA: {branchResult.sha.slice(0, 12)}</span>
            </div>
          </div>
        )}

        {/* Workflow file details */}
        {workflowFileResult && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              {workflowFileResult.exists ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className="text-xs">
                Workflow file {config.workflow_file}: {workflowFileResult.exists ? 'present' : 'absent'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function ReadinessItem({
  label,
  passed,
  pending,
  pendingLabel,
}: {
  label: string;
  passed: boolean;
  pending?: boolean;
  pendingLabel?: string;
}) {
  if (pending) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-amber-600">{label}</span>
        {pendingLabel && <span className="text-xs text-amber-400">({pendingLabel})</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      {passed ? (
        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
      )}
      <span className={passed ? 'text-slate-700' : 'text-red-600'}>{label}</span>
    </div>
  );
}
