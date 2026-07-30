import { useEffect, useState, useCallback } from 'react';
import {
  Brain, Sparkles, Bot, Activity, BarChart3, Clock, DollarSign,
  TrendingUp, Zap, RefreshCw, Loader2, Shield, Settings2,
  FlaskConical, BookOpen, LayoutDashboard, Route, Layers,
  CheckCircle2, XCircle, AlertCircle, GitBranch, Server,
  Info, Cpu, HeartPulse,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ECCAIProvidersSection, PROVIDER_META, fmtCost, fmtTokens } from './ECCAIProvidersSection';
import { ECCAIPlayground } from './ECCAIPlayground';
import { ATDCapabilityFramework } from '../../lib/atdCapabilityFramework';
import type { Capability, CapabilityExecution } from '../../lib/atdCapabilityFramework';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UsageRow {
  provider: string;
  model: string;
  feature: string;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  duration_ms: number;
  success: boolean;
  cache_hit: boolean;
  created_at: string;
}

interface ProviderSummary {
  provider: string;
  display_name: string;
  is_enabled: boolean;
  is_default: boolean;
  model: string;
  has_api_key: boolean;
  health_status: string | null;
  health_latency_ms: number | null;
  health_checked_at: string | null;
}

interface FeatureConfig {
  id: string;
  feature_key: string;
  display_name: string;
  description: string | null;
  provider: string | null;
  model: string | null;
  is_enabled: boolean;
  override_temperature: number | null;
  override_max_tokens: number | null;
}

interface ProviderModel {
  id: string;
  provider: string;
  model_id: string;
  display_name: string;
  model_type: string | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',      label: 'Overview',      icon: LayoutDashboard },
  { key: 'providers',     label: 'Providers',     icon: Brain           },
  { key: 'capabilities',  label: 'Capabilities',  icon: Cpu             },
  { key: 'health',        label: 'Health',        icon: HeartPulse      },
  { key: 'routing',       label: 'Routing',       icon: Route           },
  { key: 'usage',         label: 'Usage & Costs', icon: BarChart3       },
  { key: 'features',      label: 'Features',      icon: Layers          },
  { key: 'models',        label: 'Models',        icon: GitBranch       },
  { key: 'activity',      label: 'Activity',      icon: Activity        },
  { key: 'playground',    label: 'Playground',    icon: FlaskConical    },
] as const;

type TabKey = typeof TABS[number]['key'];

const HEALTH_CFG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  healthy: { label: 'Healthy',  dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50'  },
  error:   { label: 'Error',    dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50'      },
  unknown: { label: 'Unknown',  dot: 'bg-slate-400',   text: 'text-slate-500',   bg: 'bg-slate-100'   },
  degraded:{ label: 'Degraded', dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50'    },
};

// ─── StatsBar ─────────────────────────────────────────────────────────────────

function StatsBar({ usage, providers }: { usage: UsageRow[]; providers: ProviderSummary[] }) {
  const totalReqs   = usage.length;
  const totalTokens = usage.reduce((s, r) => s + r.prompt_tokens + r.completion_tokens, 0);
  const totalCost   = usage.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0);
  const avgLatency  = totalReqs > 0
    ? Math.round(usage.reduce((s, r) => s + r.duration_ms, 0) / totalReqs)
    : 0;
  const cacheHits  = usage.filter(r => r.cache_hit).length;
  const cacheRate  = totalReqs > 0 ? Math.round((cacheHits / totalReqs) * 100) : 0;
  const active     = providers.find(p => p.is_default && p.is_enabled);
  const healthOk   = providers.filter(p => p.health_status === 'healthy').length;

  const stats = [
    { label: 'Active Provider',  value: active?.display_name ?? 'None',          icon: Brain,      color: 'text-blue-600'    },
    { label: 'Requests (30d)',   value: totalReqs.toLocaleString(),               icon: BarChart3,  color: 'text-slate-700'   },
    { label: 'Tokens (30d)',     value: fmtTokens(totalTokens),                  icon: Zap,        color: 'text-amber-600'   },
    { label: 'Est. Cost (30d)', value: fmtCost(totalCost),                       icon: DollarSign, color: 'text-emerald-600' },
    { label: 'Avg Latency',     value: avgLatency > 0 ? `${avgLatency}ms` : '—', icon: Clock,      color: 'text-cyan-600'    },
    { label: 'Healthy / Total', value: `${healthOk} / ${providers.length}`,      icon: TrendingUp, color: 'text-violet-600'  },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {stats.map(s => {
        const Icon = s.icon;
        return (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon className={`w-3.5 h-3.5 ${s.color}`} />
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
            </div>
            <p className="text-lg font-bold text-slate-900 leading-none truncate">{s.value}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  usage,
  providers,
  onNavigate,
}: {
  usage: UsageRow[];
  providers: ProviderSummary[];
  onNavigate: (tab: TabKey) => void;
}) {
  const active = providers.find(p => p.is_default && p.is_enabled);

  // Last 7 days activity
  const cutoff7d = new Date();
  cutoff7d.setDate(cutoff7d.getDate() - 7);
  const recent = usage.filter(r => new Date(r.created_at) >= cutoff7d);

  // By feature
  const byFeature: Record<string, number> = {};
  for (const r of recent) {
    byFeature[r.feature] = (byFeature[r.feature] ?? 0) + 1;
  }
  const topFeatures = Object.entries(byFeature)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <StatsBar usage={usage} providers={providers} />

      {/* Provider status grid */}
      <div>
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Provider Status</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {providers.map(p => {
            const meta = PROVIDER_META[p.provider] ?? PROVIDER_META.openai;
            const Icon = meta.Icon;
            const health = HEALTH_CFG[p.health_status ?? 'unknown'] ?? HEALTH_CFG.unknown;
            const provUsage = usage.filter(u => u.provider === p.provider);
            const provCost  = provUsage.reduce((s, u) => s + (u.estimated_cost_usd ?? 0), 0);
            return (
              <div
                key={p.provider}
                className={`bg-white border rounded-xl p-4 ${p.is_default ? `border-2 ${meta.border}` : 'border-slate-200'}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.bg} border ${meta.border}`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{p.display_name}</p>
                      {p.is_default && (
                        <span className={`text-[10px] font-semibold ${meta.color}`}>Default</span>
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${health.bg} ${health.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
                    {health.label}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <p className="text-slate-400 uppercase tracking-wide font-semibold">Model</p>
                    <p className="text-slate-700 font-medium truncate">{p.model || '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 uppercase tracking-wide font-semibold">Cost (30d)</p>
                    <p className="text-slate-700 font-medium">{fmtCost(provCost)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 uppercase tracking-wide font-semibold">API Key</p>
                    <p className={p.has_api_key ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                      {p.has_api_key ? 'Configured' : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 uppercase tracking-wide font-semibold">Latency</p>
                    <p className="text-slate-700 font-medium">{p.health_latency_ms != null ? `${p.health_latency_ms}ms` : '—'}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { tab: 'providers' as TabKey, label: 'Configure Providers', icon: Brain, desc: 'API keys, models, health checks' },
          { tab: 'capabilities' as TabKey, label: 'ATD Capabilities', icon: Cpu, desc: 'Capability registry and execution stats' },
          { tab: 'health' as TabKey, label: 'Provider Health', icon: HeartPulse, desc: 'Live health status and latency' },
          { tab: 'usage' as TabKey, label: 'Usage & Cost', icon: BarChart3, desc: 'Spend analysis and trends' },
        ].map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.tab}
              onClick={() => onNavigate(item.tab)}
              className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-200 hover:bg-blue-50/40 transition-colors group"
            >
              <Icon className="w-5 h-5 text-blue-600 mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-sm font-semibold text-slate-800">{item.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{item.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Top features */}
      {topFeatures.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Top Features by Usage (7d)</p>
          </div>
          <div className="divide-y divide-slate-100">
            {topFeatures.map(([feat, count]) => {
              const maxCount = topFeatures[0][1];
              const pct = Math.round((count / maxCount) * 100);
              return (
                <div key={feat} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-slate-600 font-medium w-40 truncate">{feat || '(unknown)'}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-bold text-slate-700 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Architecture banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <Shield className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Provider Abstraction Layer</p>
          <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
            All AI calls route through <code className="font-mono bg-blue-100 px-1 rounded">_shared/ai-service.ts</code>.
            Features never import provider SDKs directly — switch providers with zero business logic changes.
            Per-feature routing, smart model selection, and response caching are all supported by the architecture.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Cost Dashboard ───────────────────────────────────────────────────────────

function CostDashboard({ usage }: { usage: UsageRow[] }) {
  const [range, setRange] = useState<'today' | '7d' | '30d'>('30d');

  const now = new Date();
  const cutoff = new Date(now);
  if (range === 'today') cutoff.setHours(0, 0, 0, 0);
  else if (range === '7d') cutoff.setDate(now.getDate() - 7);
  else cutoff.setDate(now.getDate() - 30);

  const filtered = usage.filter(r => new Date(r.created_at) >= cutoff);

  const byDate: Record<string, { requests: number; tokens: number; cost: number }> = {};
  for (const r of filtered) {
    const d = r.created_at.slice(0, 10);
    if (!byDate[d]) byDate[d] = { requests: 0, tokens: 0, cost: 0 };
    byDate[d].requests++;
    byDate[d].tokens += r.prompt_tokens + r.completion_tokens;
    byDate[d].cost += r.estimated_cost_usd ?? 0;
  }

  const byProvider: Record<string, { requests: number; tokens: number; cost: number }> = {};
  for (const r of filtered) {
    if (!byProvider[r.provider]) byProvider[r.provider] = { requests: 0, tokens: 0, cost: 0 };
    byProvider[r.provider].requests++;
    byProvider[r.provider].tokens += r.prompt_tokens + r.completion_tokens;
    byProvider[r.provider].cost += r.estimated_cost_usd ?? 0;
  }

  const totalCost   = filtered.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0);
  const totalTokens = filtered.reduce((s, r) => s + r.prompt_tokens + r.completion_tokens, 0);
  const cacheHits   = filtered.filter(r => r.cache_hit).length;

  const sortedDates = Object.keys(byDate).sort().reverse().slice(0, 14);
  const maxCost = Math.max(...Object.values(byDate).map(d => d.cost), 0.0001);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-700">Cost & Usage</h2>
        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
          {(['today', '7d', '30d'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                range === r ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Cost',    value: fmtCost(totalCost),          icon: DollarSign, color: 'text-emerald-600' },
          { label: 'Requests',      value: filtered.length.toLocaleString(), icon: BarChart3,  color: 'text-blue-600'    },
          { label: 'Tokens',        value: fmtTokens(totalTokens),       icon: Zap,        color: 'text-amber-600'   },
          { label: 'Cache Savings', value: `${cacheHits} hits`,          icon: TrendingUp, color: 'text-violet-600'  },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
              </div>
              <p className="text-lg font-bold text-slate-900">{s.value}</p>
            </div>
          );
        })}
      </div>

      {Object.keys(byProvider).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Provider Breakdown</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Provider</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Requests</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Tokens</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byProvider).map(([p, s]) => {
                const meta = PROVIDER_META[p];
                const Icon = meta?.Icon ?? Brain;
                return (
                  <tr key={p} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${meta?.color ?? 'text-slate-500'}`} />
                        <span className="font-medium text-slate-700 capitalize">{p}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{s.requests}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtTokens(s.tokens)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{fmtCost(s.cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sortedDates.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Daily Activity</p>
          </div>
          <div className="px-4 py-4 space-y-2.5">
            {sortedDates.map(d => {
              const day = byDate[d];
              const barPct = Math.max((day.cost / maxCost) * 100, 2);
              return (
                <div key={d} className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400 w-20 shrink-0">{d.slice(5)}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${barPct}%` }} />
                  </div>
                  <span className="text-[11px] font-medium text-slate-600 w-16 text-right">{fmtCost(day.cost)}</span>
                  <span className="text-[11px] text-slate-400 w-16 text-right">{day.requests} req</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <BarChart3 className="w-7 h-7 mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">No usage data for this period.</p>
        </div>
      )}
    </div>
  );
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

function ActivityLog({ usage }: { usage: UsageRow[] }) {
  const recent = [...usage]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);

  if (!recent.length) return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400">
      <Activity className="w-6 h-6 mx-auto mb-2 opacity-40" />
      <p className="text-sm">No AI usage recorded yet.</p>
    </div>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Recent AI Activity</p>
      </div>
      <div className="divide-y divide-slate-100">
        {recent.map((r, i) => {
          const meta = PROVIDER_META[r.provider];
          const Icon = meta?.Icon ?? Brain;
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60 transition-colors">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.success ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <Icon className={`w-3.5 h-3.5 shrink-0 ${meta?.color ?? 'text-slate-400'}`} />
              <span className="text-xs font-medium text-slate-700 flex-1 truncate">{r.feature}</span>
              <span className="text-[11px] text-slate-400 w-32 text-right truncate">{r.model}</span>
              <span className="text-[11px] text-slate-400 w-16 text-right">{fmtTokens(r.prompt_tokens + r.completion_tokens)}</span>
              <span className="text-[11px] font-medium text-slate-600 w-14 text-right">{fmtCost(r.estimated_cost_usd ?? 0)}</span>
              {r.cache_hit && (
                <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-semibold shrink-0">cache</span>
              )}
              <span className="text-[10px] text-slate-400 w-20 text-right shrink-0">
                {new Date(r.created_at).toLocaleTimeString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Features Tab ─────────────────────────────────────────────────────────────

function FeaturesTab() {
  const [features, setFeatures] = useState<FeatureConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ai_feature_configuration')
      .select('*')
      .order('display_name');
    setFeatures(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleFeature(id: string, current: boolean) {
    setSaving(id);
    await supabase.from('ai_feature_configuration').update({ is_enabled: !current }).eq('id', id);
    setFeatures(prev => prev.map(f => f.id === id ? { ...f, is_enabled: !current } : f));
    setSaving(null);
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800 leading-relaxed">
          Feature-level configuration allows each product feature to use a different AI provider and model.
          When a feature has no override, requests fall through to the default provider.
          Per-feature routing is architecturally active but requires the routing layer to be enabled in code.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Feature AI Configuration</p>
          <span className="text-[11px] text-slate-400">{features.filter(f => f.is_enabled).length} of {features.length} enabled</span>
        </div>
        <div className="divide-y divide-slate-100">
          {features.map(f => {
            const meta = f.provider ? PROVIDER_META[f.provider] : null;
            const Icon = meta?.Icon ?? Brain;
            return (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/40 transition-colors">
                <div className={`w-1.5 h-10 rounded-full shrink-0 ${f.is_enabled ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{f.display_name}</p>
                  <p className="text-[11px] text-slate-400 font-mono">{f.feature_key}</p>
                  {f.description && (
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{f.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {f.provider ? (
                    <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${meta?.bg ?? 'bg-slate-100'} ${meta?.color ?? 'text-slate-600'} border ${meta?.border ?? 'border-slate-200'}`}>
                      <Icon className="w-3 h-3" />
                      {f.provider}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 px-2 py-0.5 bg-slate-100 rounded-full">Default</span>
                  )}
                  {f.model && (
                    <span className="text-[11px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded-full truncate max-w-28">
                      {f.model}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {(f.override_temperature != null || f.override_max_tokens != null) && (
                    <div className="text-[10px] text-slate-400 space-y-0.5">
                      {f.override_temperature != null && <p>temp: {f.override_temperature}</p>}
                      {f.override_max_tokens  != null && <p>max: {f.override_max_tokens}</p>}
                    </div>
                  )}
                  <button
                    onClick={() => toggleFeature(f.id, f.is_enabled)}
                    disabled={saving === f.id}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      f.is_enabled ? 'bg-emerald-500' : 'bg-slate-300'
                    } ${saving === f.id ? 'opacity-60' : ''}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      f.is_enabled ? 'translate-x-5' : ''
                    }`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Models Tab ───────────────────────────────────────────────────────────────

function ModelsTab() {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ai_provider_models')
      .select('*')
      .order('provider')
      .order('sort_order');
    setModels(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(id: string, current: boolean) {
    setSavingId(id);
    await supabase.from('ai_provider_models').update({ is_active: !current }).eq('id', id);
    setModels(prev => prev.map(m => m.id === id ? { ...m, is_active: !current } : m));
    setSavingId(null);
  }

  async function setDefault(model: ProviderModel) {
    setSavingId(model.id);
    await supabase.from('ai_provider_models')
      .update({ is_default: false })
      .eq('provider', model.provider);
    await supabase.from('ai_provider_models')
      .update({ is_default: true })
      .eq('id', model.id);
    setModels(prev => prev.map(m => ({
      ...m,
      is_default: m.provider === model.provider ? m.id === model.id : m.is_default,
    })));
    setSavingId(null);
  }

  const providers = ['all', ...Array.from(new Set(models.map(m => m.provider)))];
  const filtered = filter === 'all' ? models : models.filter(m => m.provider === filter);

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide flex-1">Model Registry</p>
        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
          {providers.map(p => (
            <button key={p} onClick={() => setFilter(p)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filter === p ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Model</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Provider</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Type</th>
              <th className="text-center px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Default</th>
              <th className="text-center px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const meta = PROVIDER_META[m.provider];
              const Icon = meta?.Icon ?? Brain;
              return (
                <tr key={m.id} className={`border-b border-slate-100 last:border-0 ${!m.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{m.display_name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{m.model_id}</p>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`flex items-center gap-1 text-[11px] font-medium w-fit px-2 py-0.5 rounded-full ${meta?.bg ?? 'bg-slate-100'} ${meta?.color ?? 'text-slate-600'} border ${meta?.border ?? 'border-slate-200'}`}>
                      <Icon className="w-3 h-3" />
                      {m.provider}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full capitalize">
                      {m.model_type ?? 'chat'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {m.is_default ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                    ) : (
                      <button
                        onClick={() => setDefault(m)}
                        disabled={savingId === m.id || !m.is_active}
                        className="text-[10px] text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-30"
                      >
                        Set
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => toggleActive(m.id, m.is_active)}
                      disabled={savingId === m.id}
                      className={`relative w-9 h-4.5 rounded-full transition-colors ${m.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      style={{ height: '18px', width: '36px' }}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${m.is_active ? 'translate-x-[18px]' : ''}`} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Routing Tab ──────────────────────────────────────────────────────────────

function RoutingTab({ providers }: { providers: ProviderSummary[] }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <Route className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-slate-800">Intelligent Routing Architecture</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            The platform supports per-feature AI provider routing via the <code className="font-mono bg-slate-100 px-1 rounded">ai_feature_configuration</code> table.
            Set a provider override on any feature in the Features tab to activate it.
          </p>
        </div>
      </div>

      {/* Flow diagram */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Request Flow</p>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'Feature Code', sub: 'Calls generate()', icon: Layers, color: 'bg-slate-100 text-slate-700 border-slate-300' },
              { label: 'ai-service.ts', sub: 'Abstraction layer', icon: Shield, color: 'bg-blue-50 text-blue-700 border-blue-300' },
              { label: 'Feature Config', sub: 'Provider override?', icon: Settings2, color: 'bg-amber-50 text-amber-700 border-amber-300' },
              { label: 'Provider Router', sub: 'Select provider', icon: Route, color: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
              { label: 'LLM API', sub: 'OpenAI / Anthropic / Gemini', icon: Sparkles, color: 'bg-violet-50 text-violet-700 border-violet-300' },
            ].map((step, i, arr) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="flex items-center gap-2">
                  <div className={`px-3 py-2 rounded-xl border text-center min-w-28 ${step.color}`}>
                    <Icon className="w-4 h-4 mx-auto mb-1" />
                    <p className="text-xs font-bold">{step.label}</p>
                    <p className="text-[10px] opacity-70">{step.sub}</p>
                  </div>
                  {i < arr.length - 1 && (
                    <span className="text-slate-300 text-lg">→</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Provider status */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Current Routing</p>
        </div>
        <div className="divide-y divide-slate-100">
          {providers.map(p => {
            const meta = PROVIDER_META[p.provider] ?? PROVIDER_META.openai;
            const Icon = meta.Icon;
            const health = HEALTH_CFG[p.health_status ?? 'unknown'] ?? HEALTH_CFG.unknown;
            return (
              <div key={p.provider} className="flex items-center gap-3 px-4 py-3">
                <div className={`flex items-center gap-2 w-40`}>
                  <Icon className={`w-4 h-4 ${meta.color}`} />
                  <span className="text-sm font-medium text-slate-800">{p.display_name}</span>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  {p.is_default && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>
                      Default Route
                    </span>
                  )}
                  {!p.has_api_key && (
                    <span className="flex items-center gap-1 text-[10px] text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full font-semibold">
                      <XCircle className="w-3 h-3" /> No API Key
                    </span>
                  )}
                  {!p.is_enabled && (
                    <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-semibold">Disabled</span>
                  )}
                  {p.is_enabled && p.has_api_key && !p.is_default && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> Available for Feature Override
                    </span>
                  )}
                </div>
                <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${health.bg} ${health.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
                  {health.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Architecture docs */}
      <div className="bg-slate-800 text-slate-300 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-bold text-white">Implementation Reference</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs leading-relaxed">
          <div>
            <p className="font-semibold text-slate-200 mb-1.5">Adding a New Provider</p>
            <ol className="space-y-1 text-slate-400 list-decimal list-inside">
              <li>Add <code className="text-slate-300">callProvider()</code> in <code className="text-slate-300">_shared/ai-service.ts</code></li>
              <li>Add pricing to <code className="text-slate-300">estimateCost()</code> table</li>
              <li>Handle provider key in the <code className="text-slate-300">generate()</code> switch</li>
              <li>Insert row in <code className="text-slate-300">ai_provider_configs</code> via migration</li>
              <li>Set API key via the Providers tab — no further code changes needed</li>
            </ol>
          </div>
          <div>
            <p className="font-semibold text-slate-200 mb-1.5">Secret Management</p>
            <ul className="space-y-1 text-slate-400">
              <li>Keys stored in <code className="text-slate-300">ai_provider_configs.api_key</code></li>
              <li>Never stored in browser localStorage or client state</li>
              <li>Edge functions use service-role key to read them server-side</li>
              <li>Rotate keys at any time — in-flight requests complete before switch</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-200 mb-1.5">Smart Routing</p>
            <p className="text-slate-400">
              The <code className="text-slate-300">ai_feature_configuration</code> table drives per-feature routing.
              Set <code className="text-slate-300">provider</code> and <code className="text-slate-300">model</code> on any feature row to override the default.
              The routing code in <code className="text-slate-300">ai-service.ts</code> reads this at runtime.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-200 mb-1.5">Cost Optimisation</p>
            <p className="text-slate-400">
              Response caching via <code className="text-slate-300">ai_response_cache</code> avoids duplicate LLM calls.
              The 7-day TTL on unit analysis results alone eliminates most repeat requests.
              Cache hit rate is tracked in the usage log and visible in the Usage tab.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Capabilities Tab ─────────────────────────────────────────────────────────

function CapabilitiesTab() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [executions, setExecutions] = useState<CapabilityExecution[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [caps, execs] = await Promise.all([
        ATDCapabilityFramework.listCapabilities(),
        ATDCapabilityFramework.listExecutions({ limit: 100 }),
      ]);
      setCapabilities(caps);
      setExecutions(execs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>;

  const categories = [...new Set(capabilities.map(c => c.category))].sort();

  function execStats(capKey: string) {
    const es = executions.filter(e => e.capability_key === capKey);
    const complete = es.filter(e => e.status === 'complete').length;
    const failed   = es.filter(e => e.status === 'failed').length;
    const avgMs    = es.filter(e => e.duration_ms != null).length > 0
      ? Math.round(es.filter(e => e.duration_ms != null).reduce((s, e) => s + (e.duration_ms ?? 0), 0) / es.filter(e => e.duration_ms != null).length)
      : null;
    return { total: es.length, complete, failed, avgMs };
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <Cpu className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-800">ATD Capability Registry</p>
          <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
            {capabilities.filter(c => c.is_active).length} of {capabilities.length} capabilities active.
            Execution history is tracked per capability and linked to engineering intents.
          </p>
        </div>
      </div>

      {categories.map(cat => {
        const caps = capabilities.filter(c => c.category === cat);
        const colourCls = ATDCapabilityFramework.getCategoryColour(cat as Capability['category']);
        const textColour = colourCls.split(' ').find(c => c.startsWith('text-')) ?? 'text-slate-400';
        const bgColour   = colourCls.split(' ').find(c => c.startsWith('bg-'))   ?? 'bg-slate-500/10';
        const borderColour = colourCls.split(' ').find(c => c.startsWith('border-')) ?? 'border-slate-500/20';

        return (
          <div key={cat}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 capitalize">{cat}</p>
            <div className="grid md:grid-cols-2 gap-3">
              {caps.map(cap => {
                const stats = execStats(cap.capability_key);
                return (
                  <div key={cap.capability_key} className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden`}>
                    <div className={`px-4 py-3 border-b ${bgColour} ${borderColour} border`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold font-mono ${textColour}`}>
                              {cap.capability_key.replace(/_/g, '.')}
                            </span>
                            <span className="text-[9px] text-slate-400">v{cap.version}</span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">{cap.name}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{cap.description}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {cap.is_active
                            ? <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" />Active</span>
                            : <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Inactive</span>}
                        </div>
                      </div>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{stats.total}</p>
                        <p className="text-[10px] text-slate-400">Executions</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-600">{stats.complete}</p>
                        <p className="text-[10px] text-slate-400">Complete</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-red-500">{stats.failed}</p>
                        <p className="text-[10px] text-slate-400">Failed</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">{stats.avgMs != null ? `${stats.avgMs}ms` : '—'}</p>
                        <p className="text-[10px] text-slate-400">Avg Latency</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {capabilities.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Cpu className="w-8 h-8 mx-auto text-slate-200 mb-3" />
          <p className="text-sm font-medium text-slate-500">No capabilities registered yet.</p>
          <p className="text-xs text-slate-400 mt-1">The ATD Cognitive Engine will register capabilities as it initialises.</p>
        </div>
      )}
    </div>
  );
}

// ─── Health Tab ───────────────────────────────────────────────────────────────

function HealthTab({ providers }: { providers: ProviderSummary[] }) {
  const [checking, setChecking] = useState<string | null>(null);

  async function runHealthCheck(providerKey: string) {
    setChecking(providerKey);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-ai-provider-connection`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ provider: providerKey }),
        },
      );
      if (!resp.ok) throw new Error(`Health check failed (${resp.status})`);
    } catch (_) { /* error shown via provider reload */ }
    setChecking(null);
  }

  const overallHealthy = providers.filter(p => p.health_status === 'healthy').length;
  const overallTotal   = providers.length;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{overallTotal}</p>
          <p className="text-xs text-slate-400 mt-1">Total Providers</p>
        </div>
        <div className={`border rounded-xl p-4 text-center ${overallHealthy === overallTotal && overallTotal > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-2xl font-bold ${overallHealthy === overallTotal && overallTotal > 0 ? 'text-emerald-700' : 'text-slate-900'}`}>{overallHealthy}</p>
          <p className="text-xs text-slate-400 mt-1">Healthy</p>
        </div>
        <div className={`border rounded-xl p-4 text-center ${overallTotal - overallHealthy > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-2xl font-bold ${overallTotal - overallHealthy > 0 ? 'text-red-600' : 'text-slate-900'}`}>{overallTotal - overallHealthy}</p>
          <p className="text-xs text-slate-400 mt-1">Degraded / Unknown</p>
        </div>
      </div>

      {/* Provider health cards */}
      <div className="space-y-3">
        {providers.map(p => {
          const meta   = PROVIDER_META[p.provider] ?? PROVIDER_META.openai;
          const Icon   = meta.Icon;
          const health = HEALTH_CFG[p.health_status ?? 'unknown'] ?? HEALTH_CFG.unknown;
          const isChecking = checking === p.provider;

          return (
            <div key={p.provider} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${meta.bg} ${meta.border}`}>
                    <Icon className={`w-5 h-5 ${meta.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{p.display_name}</p>
                    <p className="text-xs text-slate-400 font-mono">{p.model || 'no model set'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {p.health_latency_ms != null && (
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{p.health_latency_ms}ms</p>
                      <p className="text-[10px] text-slate-400">latency</p>
                    </div>
                  )}
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${health.bg} ${health.text}`}>
                    <span className={`w-2 h-2 rounded-full ${health.dot}`} />
                    {health.label}
                  </div>
                  {p.has_api_key && (
                    <button
                      onClick={() => runHealthCheck(p.provider)}
                      disabled={isChecking}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isChecking
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                      {isChecking ? 'Checking...' : 'Check'}
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100 px-5 py-3 grid grid-cols-4 gap-4 bg-slate-50">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">API Key</p>
                  <p className={`text-xs font-semibold mt-0.5 ${p.has_api_key ? 'text-emerald-700' : 'text-red-600'}`}>
                    {p.has_api_key ? 'Configured' : 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Status</p>
                  <p className={`text-xs font-semibold mt-0.5 ${p.is_enabled ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {p.is_enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Default</p>
                  <p className={`text-xs font-semibold mt-0.5 ${p.is_default ? 'text-blue-700' : 'text-slate-400'}`}>
                    {p.is_default ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Last Check</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {p.health_checked_at
                      ? new Date(p.health_checked_at).toLocaleTimeString()
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {providers.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <HeartPulse className="w-8 h-8 mx-auto text-slate-200 mb-3" />
          <p className="text-sm font-medium text-slate-500">No providers configured.</p>
          <p className="text-xs text-slate-400 mt-1">Add a provider in the Providers tab to enable ATD capabilities.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCAIPlatformPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [provRes, usageRes] = await Promise.all([
      supabase.from('ai_provider_configs').select('*').order('provider'),
      supabase.from('ai_usage_log')
        .select('provider, model, feature, prompt_tokens, completion_tokens, estimated_cost_usd, duration_ms, success, cache_hit, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    setProviders(provRes.data ?? []);
    setUsage(usageRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const defaultProvider = providers.find(p => p.is_default && p.is_enabled);
  const healthyCount = providers.filter(p => p.health_status === 'healthy').length;

  function renderTab() {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab usage={usage} providers={providers} onNavigate={setActiveTab} />;
      case 'providers':
        return <ECCAIProvidersSection />;
      case 'capabilities':
        return <CapabilitiesTab />;
      case 'health':
        return <HealthTab providers={providers} />;
      case 'playground':
        return <ECCAIPlayground />;
      case 'features':
        return <FeaturesTab />;
      case 'models':
        return <ModelsTab />;
      case 'usage':
        return <CostDashboard usage={usage} />;
      case 'activity':
        return <ActivityLog usage={usage} />;
      case 'routing':
        return <RoutingTab providers={providers} />;
    }
  }

  const needsDataReload = ['overview', 'usage', 'activity', 'health'].includes(activeTab);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-0 shrink-0">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">AI Infrastructure</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Providers, capabilities, routing, health monitoring, usage, and AI configuration.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {defaultProvider && (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-slate-500">Active:</span>
                <span className="font-semibold text-slate-900">{defaultProvider.display_name}</span>
                <span className="text-slate-400">·</span>
                <span className="font-mono text-slate-600">{defaultProvider.model}</span>
              </div>
            )}
            {providers.length > 0 && (
              <div className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border ${
                healthyCount === providers.length
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : healthyCount === 0
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                {healthyCount === providers.length
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : healthyCount === 0
                  ? <XCircle className="w-3.5 h-3.5" />
                  : <AlertCircle className="w-3.5 h-3.5" />}
                {healthyCount}/{providers.length} Healthy
              </div>
            )}
            {needsDataReload && (
              <button onClick={load} disabled={loading}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 border-b border-slate-200 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {loading && (activeTab === 'overview' || activeTab === 'usage' || activeTab === 'activity') ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : (
          renderTab()
        )}
      </div>
    </div>
  );
}
