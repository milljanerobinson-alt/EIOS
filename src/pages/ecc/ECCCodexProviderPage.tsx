import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, Activity, KeyRound, DollarSign, FlaskConical, PlayCircle, Power, FileCheck, TrendingUp, AlertCircle, CheckCircle2, XCircle, Loader2, Link2, ExternalLink } from 'lucide-react';
import type { CodexProviderMetadata, CodexHealthCheckResult, CodexDryRunResult } from '../../lib/codex/codexTypes';
import { resolveSharedCredential, SHARED_OPENAI_CREDENTIAL_REFERENCE } from '../../lib/codex/codexCredentialService';
import type { SharedCredentialDescriptor } from '../../lib/codex/codexCredentialService';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export default function ECCCodexProviderPage() {
  const [provider, setProvider] = useState<CodexProviderMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharedCredential, setSharedCredential] = useState<SharedCredentialDescriptor | null>(null);
  const [healthResult, setHealthResult] = useState<CodexHealthCheckResult | null>(null);
  const [dryRunResult, setDryRunResult] = useState<CodexDryRunResult & Record<string, unknown> | null>(null);
  const [environment, setEnvironment] = useState('staging');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [trialSummary, setTrialSummary] = useState<Record<string, unknown> | null>(null);

  const fetchProviderData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: providerData } = await supabase
        .from('execution_provider_registry')
        .select('*')
        .eq('provider_id', 'codex')
        .maybeSingle();

      if (providerData) {
        setProvider({
          provider_id: providerData.provider_id,
          provider_name: providerData.provider_name,
          provider_type: providerData.provider_type,
          provider_version: providerData.provider_version,
          lifecycle_status: providerData.is_active ? 'active' : 'inactive',
          active_status: providerData.is_active ? 'active' : 'inactive',
          governed_status: providerData.is_governed ? 'governed' : 'ungoverned',
          execution_contract_version: providerData.canonical_contract_version,
          supported_operations: (providerData.provider_config as { supported_operations?: string[] })?.supported_operations || [],
          governance_rules: providerData.governance_rules || [],
          provider_configuration: providerData.provider_config || {},
          configuration_status: providerData.configuration_status || 'not_configured',
          credential_reference_status: providerData.credential_reference_status || 'unavailable',
          provider_health: providerData.provider_health || 'unknown',
          last_successful_health_check: providerData.last_successful_health_check,
          last_failed_health_check: providerData.last_failed_health_check,
          pricing_metadata: providerData.pricing_metadata || {},
          pricing_effective_date: providerData.pricing_effective_date,
          configured_budget_limits: providerData.configured_budget_limits || {},
          permitted_environments: providerData.permitted_environments || ['staging'],
        });
      }

      // Resolve the shared OpenAI credential descriptor (never returns the raw key)
      const shared = await resolveSharedCredential(environment);
      setSharedCredential(shared);

      // Fetch trial summary
      const { data: trialData } = await supabase
        .from('codex_trial_metrics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (trialData && trialData.length > 0) {
        const total = trialData.length;
        const accepted = trialData.filter((m: { accepted_or_rejected: string }) => m.accepted_or_rejected === 'accepted').length;
        const rejected = trialData.filter((m: { accepted_or_rejected: string }) => m.accepted_or_rejected === 'rejected').length;
        const totalCost = trialData.reduce((s: number, m: { actual_cost_usd: number }) => s + parseFloat(String(m.actual_cost_usd || 0)), 0);
        setTrialSummary({
          total_executions: total,
          accepted,
          rejected,
          pending: total - accepted - rejected,
          total_cost_usd: Math.round(totalCost * 100) / 100,
          acceptance_rate: total > 0 ? Math.round((accepted / total) * 100) / 100 : 0,
        });
      } else {
        setTrialSummary({ total_executions: 0, accepted: 0, rejected: 0, pending: 0, total_cost_usd: 0, acceptance_rate: 0 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provider data');
    } finally {
      setLoading(false);
    }
  }, [environment]);

  useEffect(() => {
    fetchProviderData();
  }, [fetchProviderData]);

  async function handleHealthCheck() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    setHealthResult(null);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/codex-health-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ environment, skipApiCheck: false }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errBody.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setHealthResult(data);
      setSuccess(data.is_healthy ? 'Health check succeeded using shared OpenAI credential' : 'Health check completed — provider is not healthy');
      await fetchProviderData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDryRun() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    setDryRunResult(null);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/codex-dry-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          environment,
          skipApiCheck: false,
          request: {
            execution_id: `DRY-RUN-${Date.now()}`,
            ewo_ref: 'EWO-DRY-RUN',
            engineering_intent_ref: null,
            engineering_plan_ref: null,
            repository_ref: 'eios-staging',
            branch_ref: 'staging',
            environment,
            task_objective: 'Dry run validation',
            scope: 'Validate execution package without paid tokens',
            acceptance_criteria: ['Package is valid'],
            architectural_constraints: ['No external calls'],
            governance_constraints: ['Read-only', 'No lifecycle changes'],
            permitted_files: ['src/'],
            restricted_files: ['.env', 'secrets.*'],
            permitted_commands: ['npm test'],
            restricted_commands: ['rm -rf'],
            context_package: {},
            token_budget: 16384,
            cost_budget_usd: 10,
            timeout_seconds: 300,
            retry_policy: { max_retries: 2, retry_delay_seconds: 5, retry_on: ['provider_timeout'] },
            po_approval_state: 'approved',
            execution_mode: 'dry_run',
            audit_context: { audit_ref: `DRY-${Date.now()}`, session_id: null, requesting_persona: 'product_owner', governance_version: '1.0' },
          },
        }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errBody.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setDryRunResult(data);
      setSuccess(data.credential_verified ? 'Dry run succeeded using shared OpenAI credential — no paid tokens consumed' : 'Dry run completed — credential verification failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dry run failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActivation() {
    if (!provider) return;
    const newActive = !provider.active_status;
    if (newActive && (!sharedCredential || !sharedCredential.available)) {
      setError('Cannot activate Codex without a valid shared OpenAI credential');
      return;
    }
    if (newActive && environment === 'production') {
      setError('Production activation requires separate governed approval');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('execution_provider_registry')
        .update({ is_active: newActive, updated_at: new Date().toISOString() })
        .eq('provider_id', 'codex');
      if (updateError) throw updateError;
      setSuccess(newActive ? 'Codex activated in staging' : 'Codex deactivated');
      await fetchProviderData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle activation');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const credentialAvailable = sharedCredential?.available ?? false;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="w-7 h-7 text-blue-600" />
        <h1 className="text-2xl font-bold text-slate-900">OpenAI Codex Execution Provider</h1>
      </div>
      <p className="text-sm text-slate-500 -mt-2">
        Governed execution provider for EIOS. Codex reuses the existing OpenAI credential configured in AI Infrastructure — no separate key is required.
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

      {/* Provider Status Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            Provider Status
          </h2>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${provider?.active_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
              {provider?.active_status === 'active' ? 'Active' : 'Inactive'}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${provider?.governed_status === 'governed' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
              {provider?.governed_status}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-slate-400 text-xs mb-1">Provider ID</div>
            <div className="font-mono text-slate-700">{provider?.provider_id}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Version</div>
            <div className="text-slate-700">{provider?.provider_version}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Type</div>
            <div className="text-slate-700">{provider?.provider_type}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Contract Version</div>
            <div className="text-slate-700">{provider?.execution_contract_version}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Configuration</div>
            <div className="text-slate-700">{provider?.configuration_status}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Credential</div>
            <div className="text-slate-700">{sharedCredential?.validation_status || 'unknown'}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Health</div>
            <div className="text-slate-700">{provider?.provider_health}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Environments</div>
            <div className="text-slate-700">{provider?.permitted_environments.join(', ')}</div>
          </div>
        </div>
      </div>

      {/* Shared Credential Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
          <Link2 className="w-5 h-5 text-emerald-500" />
          Shared Credential
        </h2>
        {credentialAvailable ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-emerald-800">Using shared OpenAI provider credential</p>
                <p className="text-emerald-700 mt-1">{sharedCredential?.reason}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-slate-400 text-xs mb-1">Credential Reference</div>
                <div className="font-mono text-slate-700 text-xs">{SHARED_OPENAI_CREDENTIAL_REFERENCE}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs mb-1">Source Provider</div>
                <div className="text-slate-700">{sharedCredential?.source_provider}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs mb-1">OpenAI Enabled</div>
                <div className="text-slate-700">{sharedCredential?.openai_enabled ? 'Yes' : 'No'}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs mb-1">OpenAI Health</div>
                <div className="text-slate-700">{sharedCredential?.openai_health || 'unknown'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500 flex-1">
                Credential rotation is managed through the AI Infrastructure provider page. Codex automatically resolves the active key.
              </p>
              <a href="/admin/ai-platform" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                Manage OpenAI credential <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-800">No shared OpenAI credential available</p>
                <p className="text-amber-700 mt-1">{sharedCredential?.reason || 'The OpenAI provider is not configured in AI Infrastructure.'}</p>
              </div>
            </div>
            <a href="/admin/ai-platform" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
              Configure OpenAI in AI Infrastructure <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <button
          onClick={handleHealthCheck}
          disabled={busy}
          className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow text-left disabled:opacity-50"
        >
          <Activity className="w-5 h-5 text-green-500 mb-2" />
          <div className="font-medium text-slate-800 text-sm">Health Check</div>
          <div className="text-xs text-slate-400 mt-1">Validate the shared OpenAI credential against the real API</div>
        </button>

        <button
          onClick={handleDryRun}
          disabled={busy}
          className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow text-left disabled:opacity-50"
        >
          <FlaskConical className="w-5 h-5 text-purple-500 mb-2" />
          <div className="font-medium text-slate-800 text-sm">Dry Run</div>
          <div className="text-xs text-slate-400 mt-1">Verify credential resolution and request construction without paid tokens</div>
        </button>

        <button
          onClick={handleToggleActivation}
          disabled={busy}
          className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow text-left disabled:opacity-50"
        >
          <Power className="w-5 h-5 text-amber-500 mb-2" />
          <div className="font-medium text-slate-800 text-sm">
            {provider?.active_status === 'active' ? 'Deactivate' : 'Activate'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {provider?.active_status === 'active' ? 'Deactivate Codex provider' : 'Activate Codex in staging (requires shared credential)'}
          </div>
        </button>
      </div>

      {/* Health Check Result */}
      {healthResult && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            {healthResult.is_healthy ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
            Health Check Result
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <StatusItem label="Configuration" value={healthResult.configuration_status} />
            <StatusItem label="Secret" value={healthResult.secret_availability_status} />
            <StatusItem label="Authentication" value={healthResult.authentication_status} />
            <StatusItem label="API" value={healthResult.api_accessibility_status} />
            <StatusItem label="Model" value={healthResult.model_availability_status} />
            <StatusItem label="Contract" value={healthResult.contract_compatibility_status} />
          </div>
        </div>
      )}

      {/* Dry Run Result */}
      {dryRunResult && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-purple-500" />
            Dry Run Result
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <StatusItem label="Package Valid" value={dryRunResult.execution_package_valid ? 'Yes' : 'No'} />
            <StatusItem label="Governance Valid" value={dryRunResult.governance_valid ? 'Yes' : 'No'} />
            <StatusItem label="Provider Eligible" value={dryRunResult.provider_eligible ? 'Yes' : 'No'} />
            <StatusItem label="Credential" value={String(dryRunResult.credential_status)} />
            <StatusItem label="Credential Verified" value={dryRunResult.credential_verified ? 'Yes' : 'No'} />
            <StatusItem label="Model" value={dryRunResult.selected_model} />
            <StatusItem label="Budget" value={dryRunResult.budget_status} />
            <div>
              <div className="text-slate-400 text-xs mb-1">Est. Cost</div>
              <div className="font-mono text-slate-700">${dryRunResult.estimated_cost_usd.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs mb-1">Est. Tokens (in/out)</div>
              <div className="font-mono text-slate-700">{dryRunResult.estimated_input_tokens} / {dryRunResult.estimated_output_tokens}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs mb-1">Paid Tokens</div>
              <div className="font-mono text-green-600">{dryRunResult.paid_tokens_consumed}</div>
            </div>
          </div>
          {dryRunResult.prohibited_actions_detected.length > 0 && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
              <strong>Prohibited actions:</strong> {dryRunResult.prohibited_actions_detected.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Supported Operations */}
      {provider && provider.supported_operations.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-blue-500" />
            Supported Operations
          </h3>
          <div className="flex flex-wrap gap-2">
            {provider.supported_operations.map((op) => (
              <span key={op} className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-mono text-slate-700">
                {op}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Trial Metrics Dashboard */}
      {trialSummary && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            Codex Trial Metrics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <MetricItem label="Total Executions" value={String(trialSummary.total_executions || 0)} />
            <MetricItem label="Accepted" value={String(trialSummary.accepted || 0)} color="text-green-600" />
            <MetricItem label="Rejected" value={String(trialSummary.rejected || 0)} color="text-red-600" />
            <MetricItem label="Pending" value={String(trialSummary.pending || 0)} color="text-amber-600" />
            <MetricItem label="Total Cost" value={`$${trialSummary.total_cost_usd || 0}`} />
            <MetricItem label="Acceptance Rate" value={`${Math.round((trialSummary.acceptance_rate as number || 0) * 100)}%`} />
            <MetricItem label="Bolt Required" value={String(trialSummary.bolt_subsequently_required || 0)} color="text-orange-600" />
          </div>
        </div>
      )}

      {/* Governance Rules */}
      {provider && provider.governance_rules.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-500" />
            Governance Rules
          </h3>
          <div className="flex flex-wrap gap-2">
            {provider.governance_rules.map((rule) => (
              <span key={rule} className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-700">
                {rule}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  const isOk = value === 'ok' || value === 'available' || value === 'authenticated' || value === 'reachable' || value === 'compatible' || value === 'Yes' || value === 'valid' || value === 'configured';
  const isBad = value === 'not_configured' || value === 'unavailable' || value === 'failed' || value === 'unreachable' || value === 'No' || value === 'invalid' || value === 'expired' || value === 'revoked' || value === 'disabled';
  return (
    <div>
      <div className="text-slate-400 text-xs mb-1">{label}</div>
      <div className={`font-medium ${isOk ? 'text-green-600' : isBad ? 'text-red-600' : 'text-slate-700'}`}>{value}</div>
    </div>
  );
}

function MetricItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-slate-400 text-xs mb-1">{label}</div>
      <div className={`text-lg font-semibold ${color || 'text-slate-800'}`}>{value}</div>
    </div>
  );
}
