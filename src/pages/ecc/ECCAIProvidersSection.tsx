import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Brain, Sparkles, Bot, CheckCircle2, XCircle, AlertCircle,
  Loader2, Key, Star, Activity, Eye, EyeOff, ChevronDown,
  Settings2, Check, X, Wifi, WifiOff, RefreshCw, ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProviderConfig {
  id: string;
  provider: string;
  display_name: string;
  is_enabled: boolean;
  is_default: boolean;
  model: string;
  has_api_key: boolean;
  api_key: string | null;
  health_status: string | null;
  health_latency_ms: number | null;
  health_message: string | null;
  health_checked_at: string | null;
}

interface ProviderModel {
  model_id: string;
  display_name: string;
  model_type: string | null;
  is_default: boolean;
}

interface TestResult {
  success: boolean;
  provider: string;
  model_id: string | null;
  message: string;
  latency_ms: number;
  tested_at: string;
}

interface ConnectionTest {
  provider: string;
  model_id: string | null;
  status: string;
  error_message: string | null;
  latency_ms: number | null;
  tested_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PROVIDER_META: Record<string, {
  Icon: typeof Brain;
  color: string;
  bg: string;
  border: string;
  accent: string;
  keyPlaceholder: string;
  docsUrl: string;
}> = {
  openai: {
    Icon: Brain,
    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', accent: 'bg-emerald-500',
    keyPlaceholder: 'sk-...', docsUrl: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    Icon: Sparkles,
    color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', accent: 'bg-blue-500',
    keyPlaceholder: 'AIza...', docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  anthropic: {
    Icon: Bot,
    color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', accent: 'bg-amber-500',
    keyPlaceholder: 'sk-ant-...', docsUrl: 'https://console.anthropic.com/settings/keys',
  },
};

export function fmtCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(5)}`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({
  config,
  providerUsage,
  onRefresh,
}: {
  config: ProviderConfig;
  providerUsage: { requests: number; tokens: number; cost: number };
  onRefresh: () => void;
}) {
  const meta = PROVIDER_META[config.provider] ?? PROVIDER_META.openai;
  const { Icon } = meta;

  // Key management
  const [editingKey, setEditingKey] = useState(false);
  const [keyInput, setKeyInput]     = useState('');
  const [showKey, setShowKey]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);

  // Model management
  const [dbModels, setDbModels]         = useState<ProviderModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState(config.model || '');
  const [customModelMode, setCustomModelMode] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');

  // Testing
  const [testing, setTesting]         = useState(false);
  const [testResult, setTestResult]   = useState<TestResult | null>(null);
  const [lastTests, setLastTests]     = useState<ConnectionTest[]>([]);
  const testDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Default
  const [settingDefault, setSettingDefault] = useState(false);

  const isConnected = config.has_api_key && config.is_enabled;

  useEffect(() => {
    supabase.from('ai_provider_models')
      .select('model_id, display_name, model_type, is_default')
      .eq('provider', config.provider).eq('is_active', true).order('sort_order')
      .then(({ data }) => {
        setDbModels(data ?? []);
        if (!selectedModel && data?.length) {
          setSelectedModel((data.find(m => m.is_default) ?? data[0]).model_id);
        }
        setModelsLoading(false);
      });

    supabase.from('ai_provider_test_results')
      .select('provider, model_id, status, error_message, latency_ms, tested_at')
      .eq('provider', config.provider).order('tested_at', { ascending: false }).limit(3)
      .then(({ data }) => setLastTests(data ?? []));
  }, [config.provider]);

  async function saveKey() {
    if (!keyInput.trim()) return;
    setSaving(true); setSaveError(null);
    const { error } = await supabase.from('ai_provider_configs').update({
      api_key: keyInput.trim(), has_api_key: true, is_enabled: true,
      updated_at: new Date().toISOString(),
    }).eq('provider', config.provider);
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setEditingKey(false); setKeyInput('');
    onRefresh();
  }

  async function saveModel(model: string) {
    setSelectedModel(model);
    await supabase.from('ai_provider_configs').update({ model, updated_at: new Date().toISOString() }).eq('provider', config.provider);
    onRefresh();
  }

  async function setAsDefault() {
    setSettingDefault(true);
    await supabase.from('ai_provider_configs').update({ is_default: false }).neq('provider', config.provider);
    await supabase.from('ai_provider_configs').update({ is_default: true, updated_at: new Date().toISOString() }).eq('provider', config.provider);
    setSettingDefault(false);
    onRefresh();
  }

  async function testConnection() {
    if (testing || !isConnected) return;
    if (testDebounce.current) clearTimeout(testDebounce.current);
    testDebounce.current = setTimeout(async () => {
      setTesting(true); setTestResult(null);
      const { data, error } = await supabase.functions.invoke('test-ai-provider-connection', {
        body: { provider: config.provider, model_id: selectedModel || undefined },
      });
      setTesting(false);
      if (error) {
        setTestResult({ success: false, provider: config.provider, model_id: selectedModel, message: error.message, latency_ms: 0, tested_at: new Date().toISOString() });
      } else {
        setTestResult(data as TestResult);
      }
      // Reload last tests
      supabase.from('ai_provider_test_results')
        .select('provider, model_id, status, error_message, latency_ms, tested_at')
        .eq('provider', config.provider).order('tested_at', { ascending: false }).limit(3)
        .then(({ data: d }) => setLastTests(d ?? []));
      onRefresh();
    }, 300);
  }

  const statusLabel = isConnected ? 'Connected' : config.has_api_key ? 'Disabled' : 'Not Configured';
  const statusColor = isConnected ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : config.has_api_key ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-slate-500 bg-slate-100 border-slate-200';
  const statusDot   = isConnected ? 'bg-emerald-500' : config.has_api_key ? 'bg-amber-500' : 'bg-slate-400';

  return (
    <div className={`bg-white rounded-2xl overflow-hidden border-2 transition-all ${config.is_default ? `${meta.border} shadow-sm` : 'border-slate-200'}`}>
      {/* Header */}
      <div className={`px-5 py-4 border-b ${config.is_default ? `${meta.bg} ${meta.border}` : 'bg-slate-50/60 border-slate-200'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.bg} border ${meta.border}`}>
              <Icon className={`w-5 h-5 ${meta.color}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{config.display_name}</h3>
              <p className="text-[11px] text-slate-500 font-mono">{config.provider}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {config.is_default && (
              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>
                <Star className="w-2.5 h-2.5" /> Default
              </span>
            )}
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
              {statusLabel}
            </span>
          </div>
        </div>

        {/* 30-day mini stats */}
        {isConnected && (
          <div className="flex gap-4 mt-3">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Requests (30d)</p>
              <p className="text-sm font-bold text-slate-700">{providerUsage.requests}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Tokens (30d)</p>
              <p className="text-sm font-bold text-slate-700">{fmtTokens(providerUsage.tokens)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cost (30d)</p>
              <p className="text-sm font-bold text-slate-700">{fmtCost(providerUsage.cost)}</p>
            </div>
            {config.health_latency_ms != null && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Latency</p>
                <p className="text-sm font-bold text-slate-700">{config.health_latency_ms}ms</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {/* Model selector */}
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Model</label>
          {customModelMode ? (
            <div className="flex gap-2">
              <input
                value={customModelInput}
                onChange={e => setCustomModelInput(e.target.value)}
                placeholder="e.g. gpt-4o-mini"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button onClick={() => { saveModel(customModelInput); setCustomModelMode(false); }}
                className="px-2.5 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setCustomModelMode(false)}
                className="px-2.5 py-1.5 border border-slate-200 text-slate-500 text-xs rounded-lg">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                {modelsLoading ? (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading models…
                  </div>
                ) : (
                  <select
                    value={selectedModel}
                    onChange={e => saveModel(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none pr-7"
                  >
                    {dbModels.map(m => (
                      <option key={m.model_id} value={m.model_id}>
                        {m.display_name}{m.model_type ? ` (${m.model_type})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
              <button onClick={() => { setCustomModelInput(selectedModel); setCustomModelMode(true); }}
                title="Enter custom model ID"
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* API Key */}
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">API Key</label>
          {editingKey ? (
            <div className="space-y-2">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  placeholder={meta.keyPlaceholder}
                  className="w-full text-sm border border-blue-300 rounded-lg px-2.5 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                  onKeyDown={e => e.key === 'Enter' && saveKey()}
                />
                <button onClick={() => setShowKey(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {saveError && (
                <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {saveError}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={saveKey} disabled={saving || !keyInput.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                </button>
                <button onClick={() => { setEditingKey(false); setKeyInput(''); setSaveError(null); }}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
                  Cancel
                </button>
                <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                  <ExternalLink className="w-3 h-3" /> Get key
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 flex-1 px-2.5 py-1.5 rounded-lg border text-sm ${
                config.has_api_key ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-red-50 border-red-200 text-red-500'
              }`}>
                <Key className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono text-xs">{config.has_api_key ? '••••••••••••••••' : 'No key configured'}</span>
              </div>
              <button onClick={() => setEditingKey(true)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                {config.has_api_key ? 'Change' : 'Set Key'}
              </button>
            </div>
          )}
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs ${
            testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {testResult.success
              ? <Wifi className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              : <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <p className="font-semibold">
                {testResult.success ? 'Connection successful' : 'Connection failed'}
                {testResult.success && testResult.latency_ms > 0 ? ` · ${testResult.latency_ms}ms` : ''}
              </p>
              {!testResult.success && <p className="opacity-80 mt-0.5">{testResult.message}</p>}
              {testResult.model_id && <p className="opacity-60 font-mono mt-0.5">{testResult.model_id}</p>}
            </div>
          </div>
        )}

        {/* Last test history (compact) */}
        {!testResult && lastTests.length > 0 && (
          <div className="text-[11px] text-slate-400">
            Last test: {lastTests[0].status === 'success'
              ? <span className="text-emerald-600 font-medium">Connected</span>
              : <span className="text-red-600 font-medium">Failed</span>
            } · {new Date(lastTests[0].tested_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={testConnection}
          disabled={testing || !isConnected}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
          {testing ? 'Testing…' : 'Test Connection'}
        </button>

        {!config.is_default && isConnected && (
          <button
            onClick={setAsDefault}
            disabled={settingDefault}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${meta.bg} ${meta.color} border ${meta.border} hover:opacity-80`}
          >
            {settingDefault ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
            Set as Default
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Connection History ───────────────────────────────────────────────────────

function ConnectionHistory() {
  const [tests, setTests]   = useState<ConnectionTest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    supabase.from('ai_provider_test_results')
      .select('*').order('tested_at', { ascending: false }).limit(30)
      .then(({ data }) => { setTests(data ?? []); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;
  if (!tests.length) return (
    <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
      <Activity className="w-6 h-6 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No connection tests yet. Use the Test Connection button on a provider card.</p>
    </div>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Connection Test History</p>
        <button onClick={load} className="p-1 text-slate-400 hover:text-slate-600 rounded"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Provider</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Model</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Status</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Latency</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Time</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Details</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((t, i) => {
              const meta = PROVIDER_META[t.provider];
              const ProvIcon = meta?.Icon ?? Bot;
              return (
                <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <ProvIcon className={`w-3.5 h-3.5 ${meta?.color ?? 'text-slate-400'}`} />
                      <span className="font-medium text-slate-700 capitalize">{t.provider}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{t.model_id ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {t.status === 'success'
                      ? <span className="flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 className="w-3 h-3" /> Success</span>
                      : <span className="flex items-center gap-1 text-red-600 font-semibold"><XCircle className="w-3 h-3" /> Failed</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{t.latency_ms != null ? `${t.latency_ms}ms` : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {new Date(t.tested_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 max-w-[200px] truncate">{t.error_message ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ECCAIProvidersSection() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [usage, setUsage] = useState<Array<{ provider: string; prompt_tokens: number; completion_tokens: number; estimated_cost_usd: number }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [provRes, usageRes] = await Promise.all([
      supabase.from('ai_provider_configs').select('*').order('provider'),
      supabase.from('ai_usage_log')
        .select('provider, prompt_tokens, completion_tokens, estimated_cost_usd')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .limit(500),
    ]);
    setProviders(provRes.data ?? []);
    setUsage(usageRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function getProviderUsage(prov: string) {
    const rows = usage.filter(r => r.provider === prov);
    return {
      requests: rows.length,
      tokens: rows.reduce((s, r) => s + r.prompt_tokens + r.completion_tokens, 0),
      cost: rows.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
    };
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {providers.map(p => (
          <ProviderCard
            key={p.provider}
            config={p}
            providerUsage={getProviderUsage(p.provider)}
            onRefresh={load}
          />
        ))}
      </div>

      <ConnectionHistory />

      {/* Architecture note */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <Activity className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Provider Abstraction Layer</p>
          <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
            All AI requests route through the central <code className="font-mono bg-blue-100 px-1 rounded">ai-service.ts</code> module.
            No feature code imports provider SDKs directly. Switching providers requires only changing the default here — no code changes.
          </p>
        </div>
      </div>
    </div>
  );
}
