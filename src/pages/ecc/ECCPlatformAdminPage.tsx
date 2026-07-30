import { useState, useEffect, useRef } from 'react';
import {
  Settings, Zap, Puzzle, Lock, Server, ToggleLeft, Bot,
  Activity, ClipboardList, GitMerge, ScrollText, CheckCircle2,
  AlertCircle, Loader2, RefreshCw, ExternalLink, Circle,
  ChevronRight, Database, Clock, BarChart3, TrendingUp, Shield,
  DollarSign, LineChart, BookOpen, ChevronDown, ChevronUp,
  Layers, Terminal, Users, Cpu, Eye, EyeOff, KeyRound, X, Save, Edit3,
  Wifi, WifiOff, Zap as ZapIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Section } from './ECCDashboard';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubSection =
  | 'pa-general' | 'pa-ai-providers' | 'pa-integrations' | 'pa-security'
  | 'pa-environments' | 'pa-feature-flags' | 'pa-automation' | 'pa-monitoring'
  | 'pa-audit-settings' | 'pa-release-settings' | 'pa-system-logs'
  | 'pa-cost-monitoring' | 'pa-platform-analytics' | 'pa-briefing-settings';

interface AIProvider {
  id: string;
  provider: string;
  display_name: string;
  model: string;
  is_default: boolean;
  is_enabled: boolean;
  has_api_key: boolean;
  api_key: string | null;
  health_status: string | null;
  health_message: string | null;
  health_latency_ms: number | null;
  health_checked_at: string | null;
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

interface TestResult {
  success: boolean;
  provider: string;
  model_id: string | null;
  message: string;
  error_type: string | null;
  latency_ms: number;
  tested_at: string;
}

interface AIUsageLog {
  id: string;
  feature: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  duration_ms: number;
  success: boolean;
  cache_hit: boolean;
  created_at: string;
  error_message: string | null;
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_ITEMS: { key: SubSection; label: string; Icon: typeof Settings; description: string }[] = [
  { key: 'pa-general',            label: 'General',            Icon: Settings,     description: 'Platform identity and environment' },
  { key: 'pa-ai-providers',       label: 'AI Providers',       Icon: Bot,          description: 'Provider configuration and API keys' },
  { key: 'pa-integrations',       label: 'Integrations',       Icon: Puzzle,       description: 'External platform connections' },
  { key: 'pa-security',           label: 'Security',           Icon: Lock,         description: 'Secrets and access control' },
  { key: 'pa-environments',       label: 'Environments',       Icon: Server,       description: 'Dev, staging and production' },
  { key: 'pa-feature-flags',      label: 'Feature Flags',      Icon: ToggleLeft,   description: 'Platform capability toggles' },
  { key: 'pa-automation',         label: 'Automation',         Icon: Zap,          description: 'Queues, schedules and triggers' },
  { key: 'pa-monitoring',         label: 'Monitoring',         Icon: Activity,     description: 'Health, uptime and AI usage' },
  { key: 'pa-cost-monitoring',    label: 'Cost Monitoring',    Icon: DollarSign,   description: 'AI and infrastructure costs' },
  { key: 'pa-platform-analytics', label: 'Platform Analytics', Icon: LineChart,    description: 'Usage and performance analytics' },
  { key: 'pa-audit-settings',     label: 'Audit Settings',     Icon: ClipboardList,description: 'Audit schedule and thresholds' },
  { key: 'pa-release-settings',   label: 'Release Settings',   Icon: GitMerge,     description: 'Release workflow configuration' },
  { key: 'pa-system-logs',        label: 'System Logs',        Icon: ScrollText,   description: 'AI usage and platform events' },
  { key: 'pa-briefing-settings', label: 'Briefing Schedules', Icon: Bot,          description: 'Scheduled briefings and templates' },
];

// ─── Shared components ────────────────────────────────────────────────────────

function SectionHeader({ label, description }: { label: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-slate-900">{label}</h2>
      <p className="text-sm text-slate-500 mt-0.5">{description}</p>
    </div>
  );
}

function PlaceholderPanel({
  label,
  description,
  items,
  Icon,
}: {
  label: string;
  description: string;
  items: string[];
  Icon: typeof Settings;
}) {
  return (
    <div className="max-w-2xl space-y-5">
      <SectionHeader label={label} description={description} />
      <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8">
        <div className="flex flex-col items-center text-center max-w-sm mx-auto">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
            <Icon className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">Configuration coming soon</p>
          <p className="text-xs text-slate-400 leading-relaxed mb-5">
            This section will manage {description.toLowerCase()}.
          </p>
          <div className="w-full text-left space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                <Circle className="w-1.5 h-1.5 text-slate-300 shrink-0 fill-slate-300" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI Constitution (static governance document) ────────────────────────────

const CONSTITUTION_PRINCIPLES = [
  {
    category: 'Engineering Safety',
    icon: Shield,
    rules: [
      'Never deploy directly to production — all changes require PO approval.',
      'Never mark work as Live automatically — lifecycle progression is deliberate.',
      'Prefer safe, incremental improvements over risky, large-scale changes.',
      'Always recommend a rollback strategy for significant changes.',
    ],
  },
  {
    category: 'Architecture',
    icon: Layers,
    rules: [
      'Reuse existing components before creating new ones.',
      'Avoid duplication — prefer composition over repetition.',
      'Maintain a consistent architecture aligned with the four Engineering OS layers.',
      'Preserve backwards compatibility whenever practical.',
      'Keep solutions simple unless additional complexity provides measurable value.',
      'Design for scalability rather than only today\'s requirements.',
    ],
  },
  {
    category: 'Quality',
    icon: CheckCircle2,
    rules: [
      'Assess impact before implementation — identify dependencies and risks.',
      'Recommend a testing strategy alongside every implementation.',
      'Generate or update documentation alongside implementation.',
      'Consider long-term maintainability before optimising for speed.',
      'Highlight technical debt risks before they are introduced.',
    ],
  },
  {
    category: 'Engineering Workflow',
    icon: Terminal,
    rules: [
      'Before recommending implementation, identify what layer and persona owns the work.',
      'Confirm the work belongs inside ECC or Assessment Platform — never mix them.',
      'Check whether existing functionality can be extended before adding new functionality.',
      'Identify what documentation should be updated as part of the change.',
      'Determine which tests should be created or updated.',
      'Assess whether the implementation could introduce technical debt.',
      'Recommend whether implementation should proceed now or be deferred.',
    ],
  },
] as const;

const PERSONA_DEFINITIONS = [
  {
    name: 'Product Owner',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    responsibilities: [
      'Product Strategy & Roadmap',
      'Goals, Epics & Priorities',
      'Product Audit & Platform Audits',
      'Executive Decisions & Commercial Direction',
      'Release Approval & Final Production Approval',
    ],
    workspace: 'Mission Control',
  },
  {
    name: 'AI Technical Director',
    icon: Bot,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    responsibilities: [
      'Architecture, Technical Planning & Feature Implementation',
      'Code Generation, Refactoring & Documentation',
      'Testing, Dependency Analysis & Technical Debt',
      'Bug Investigation & Technical Recommendations',
    ],
    workspace: 'Engineering Layer',
    note: 'All completed work moves to Ready for PO Review — never directly to Live.',
  },
  {
    name: 'Platform Operations',
    icon: Cpu,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    responsibilities: [
      'AI Providers, Security & Secrets',
      'Integrations, Monitoring & Automation',
      'Deployments, Environment Configuration & Platform Health',
      'Cost Monitoring, Scheduled Audits & Feature Flags',
    ],
    workspace: 'Platform Operations Layer',
  },
] as const;

// ─── General section ──────────────────────────────────────────────────────────

function GeneralSection() {
  const [activeRC, setActiveRC] = useState<{ rc_number: string; phase_name: string } | null>(null);
  const [constitutionOpen, setConstitutionOpen] = useState<number | null>(null);
  const [personasOpen, setPersonasOpen] = useState(false);

  useEffect(() => {
    supabase.from('ecc_release_candidates').select('rc_number, phase_name').eq('is_active', true).maybeSingle()
      .then(({ data }) => setActiveRC(data));
  }, []);

  const env = import.meta.env.MODE === 'production' ? 'Production' : 'Development';

  const rows = [
    { label: 'Platform Name',       value: 'LLND Automate'  },
    { label: 'Engineering OS',      value: 'Engineering Command Centre v2.0' },
    { label: 'Product Version',     value: activeRC?.rc_number ?? '—'   },
    { label: 'Current Phase',       value: activeRC?.phase_name ?? '—'  },
    { label: 'Environment',         value: env                           },
    { label: 'Build Mode',          value: import.meta.env.MODE          },
    { label: 'Supabase Project',    value: import.meta.env.VITE_SUPABASE_URL?.split('.')?.[0]?.replace('https://', '') ?? '—' },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <SectionHeader label="General" description="Platform identity, Engineering OS architecture, and governance" />

      {/* Platform info */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {rows.map(({ label, value }, i) => (
          <div key={label} className={`flex items-center justify-between px-5 py-3.5 ${i < rows.length - 1 ? 'border-b border-slate-100' : ''}`}>
            <span className="text-sm text-slate-600">{label}</span>
            <span className="text-sm font-medium text-slate-900 font-mono">{value}</span>
          </div>
        ))}
      </div>

      {/* Engineering OS layers */}
      <div className="bg-slate-900 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Engineering OS Architecture</h3>
        </div>
        <div className="space-y-2">
          {[
            { layer: 1, label: 'Mission Control',      desc: 'Executive oversight, approvals, and platform health',   color: 'border-blue-500/40 bg-blue-500/10' },
            { layer: 2, label: 'Product Management',   desc: 'Decide what should be built — goals, roadmap, backlog',  color: 'border-emerald-500/40 bg-emerald-500/10' },
            { layer: 3, label: 'Engineering',          desc: 'Design, build, verify and release software',            color: 'border-amber-500/40 bg-amber-500/10' },
            { layer: 4, label: 'Platform Operations',  desc: 'Operate the SaaS platform infrastructure',              color: 'border-orange-500/40 bg-orange-500/10' },
          ].map(({ layer, label, desc, color }) => (
            <div key={layer} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${color}`}>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded tracking-wider shrink-0 mt-0.5">L{layer}</span>
              <div>
                <p className="text-xs font-semibold text-slate-200">{label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Engineering Personas */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setPersonasOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">Engineering Personas</span>
          </div>
          {personasOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {personasOpen && (
          <div className="border-t border-slate-100 divide-y divide-slate-100">
            {PERSONA_DEFINITIONS.map(p => {
              const Icon = p.icon;
              return (
                <div key={p.name} className="px-5 py-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${p.bg} border ${p.border}`}>
                      <Icon className={`w-3.5 h-3.5 ${p.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                      <p className="text-[11px] text-slate-500">Primary: {p.workspace}</p>
                    </div>
                  </div>
                  <ul className="space-y-1 pl-9">
                    {p.responsibilities.map((r, i) => (
                      <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                        <Circle className="w-1.5 h-1.5 fill-slate-300 text-slate-300 shrink-0 mt-1" />
                        {r}
                      </li>
                    ))}
                  </ul>
                  {('note' in p) && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 mt-2 ml-9">{p.note}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Constitution */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Engineering Constitution</h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          The AI Technical Director references these principles before preparing implementation plans. They govern all future engineering decisions.
        </p>
        <div className="space-y-2">
          {CONSTITUTION_PRINCIPLES.map((section, idx) => {
            const Icon = section.icon;
            const open = constitutionOpen === idx;
            return (
              <div key={section.category} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setConstitutionOpen(open ? null : idx)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">{section.category}</span>
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{section.rules.length}</span>
                  </div>
                  {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {open && (
                  <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/60">
                    <ul className="space-y-2">
                      {section.rules.map((rule, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs text-slate-600">
                          <span className="text-[9px] font-bold text-slate-400 bg-slate-200 px-1 py-0.5 rounded shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-xs text-amber-700 leading-relaxed">
          <strong>Platform Operations</strong> manages the SaaS engineering platform.
          Customer organisation settings are managed separately in the Assessment Platform admin area.
        </p>
      </div>
    </div>
  );
}

// ─── AI Providers section ─────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { label: string; keyPlaceholder: string; docsUrl: string }> = {
  openai:    { label: 'OpenAI',        keyPlaceholder: 'sk-...',     docsUrl: 'https://platform.openai.com/api-keys' },
  anthropic: { label: 'Anthropic',     keyPlaceholder: 'sk-ant-...', docsUrl: 'https://console.anthropic.com/settings/keys' },
  gemini:    { label: 'Google Gemini', keyPlaceholder: 'AIza...',    docsUrl: 'https://aistudio.google.com/app/apikey' },
};

function TestResultBadge({ result }: { result: TestResult | null }) {
  if (!result) return null;
  const ago = (() => {
    const diff = Date.now() - new Date(result.tested_at).getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return new Date(result.tested_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  })();
  if (result.success) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
        <Wifi className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">Connected</span>
        <span className="text-emerald-400">·</span>
        <span className="text-emerald-600 font-mono">{result.model_id}</span>
        <span className="text-emerald-400">·</span>
        <span>{result.latency_ms}ms</span>
        <span className="text-emerald-400">·</span>
        <span>{ago}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
      <WifiOff className="w-3.5 h-3.5 shrink-0 mt-px" />
      <div>
        <span className="font-medium">Failed</span>
        <span className="text-red-400 mx-1">·</span>
        <span>{result.message}</span>
      </div>
    </div>
  );
}

function ProviderCard({ provider: p, onUpdated }: { provider: AIProvider; onUpdated: () => void }) {
  const meta = PROVIDER_META[p.provider] ?? { label: p.provider, keyPlaceholder: 'API key...', docsUrl: '' };
  const [editing, setEditing]       = useState(false);
  const [keyValue, setKeyValue]     = useState('');
  const [model, setModel]           = useState(p.model || '');
  const [isDefault, setIsDefault]   = useState(p.is_default);
  const [showKey, setShowKey]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dbModels, setDbModels]     = useState<ProviderModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const testDebounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasKey = p.has_api_key && !!p.api_key;

  useEffect(() => {
    supabase.from('ai_provider_models')
      .select('*').eq('provider', p.provider).eq('is_active', true).order('sort_order')
      .then(({ data }) => {
        const models = data ?? [];
        setDbModels(models);
        if (!model && models.length > 0) {
          setModel((models.find(m => m.is_default) ?? models[0]).model_id);
        }
        setModelsLoading(false);
      });
    supabase.from('ai_provider_test_results')
      .select('*').eq('provider', p.provider).order('tested_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) setTestResult({ success: data.status === 'success', provider: data.provider, model_id: data.model_id, message: data.status === 'success' ? 'Connection successful' : (data.error_message ?? 'Test failed'), error_type: null, latency_ms: data.latency_ms ?? 0, tested_at: data.tested_at });
      });
  }, [p.provider]);

  async function save() {
    if (!keyValue.trim() && !hasKey) { setSaveError('Please enter an API key.'); return; }
    setSaving(true); setSaveError(null); setSaveSuccess(false);
    const updates: Record<string, unknown> = { model, updated_at: new Date().toISOString() };
    if (keyValue.trim()) { updates.api_key = keyValue.trim(); updates.has_api_key = true; updates.is_enabled = true; }
    if (isDefault) {
      await supabase.from('ai_provider_configs').update({ is_default: false }).neq('provider', p.provider);
      updates.is_default = true;
    } else {
      updates.is_default = false;
    }
    const { error } = await supabase.from('ai_provider_configs').update(updates).eq('provider', p.provider);
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setSaveSuccess(true); setKeyValue(''); setEditing(false);
    setTimeout(() => setSaveSuccess(false), 3000);
    onUpdated();
  }

  async function testConnection() {
    if (testing) return;
    if (testDebounceRef.current) clearTimeout(testDebounceRef.current);
    testDebounceRef.current = setTimeout(async () => {
      setTesting(true); setTestResult(null);
      const { data, error } = await supabase.functions.invoke('test-ai-provider-connection', {
        body: { provider: p.provider, model_id: model || undefined },
      });
      setTesting(false);
      setTestResult(error
        ? { success: false, provider: p.provider, model_id: model, message: error.message, error_type: 'network_error', latency_ms: 0, tested_at: new Date().toISOString() }
        : data as TestResult
      );
      onUpdated();
    }, 300);
  }

  function cancel() {
    setEditing(false); setKeyValue(''); setSaveError(null);
    setModel(p.model || dbModels.find(m => m.is_default)?.model_id || dbModels[0]?.model_id || '');
    setIsDefault(p.is_default);
  }

  const statusColor = p.is_enabled && hasKey ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500';
  const statusDot   = p.is_enabled && hasKey ? 'bg-emerald-500' : 'bg-slate-400';
  const statusLabel = p.is_enabled && hasKey ? 'Active' : hasKey ? 'Disabled' : 'No API Key';

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all ${editing ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200'}`}>
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${p.is_enabled && hasKey ? 'bg-slate-900' : 'bg-slate-100'}`}>
              <Bot className={`w-4 h-4 ${p.is_enabled && hasKey ? 'text-blue-400' : 'text-slate-400'}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-800">{p.display_name || meta.label}</p>
                {p.is_default && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Default</span>}
                {saveSuccess && <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Saved</span>}
              </div>
              <p className="text-xs text-slate-400 font-mono truncate">{model || p.model || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
              {statusLabel}
            </span>
            <button
              onClick={testConnection}
              disabled={testing || !hasKey}
              title={!hasKey ? 'Add an API key first' : 'Test connection'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ZapIcon className="w-3.5 h-3.5" />}
              {testing ? 'Testing…' : 'Test'}
            </button>
            <button
              onClick={() => editing ? cancel() : setEditing(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${editing ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-slate-900 text-white hover:bg-slate-700'}`}
            >
              {editing ? <><X className="w-3.5 h-3.5" /> Cancel</> : <><KeyRound className="w-3.5 h-3.5" /> {hasKey ? 'Update' : 'Add Key'}</>}
            </button>
          </div>
        </div>
        {testResult && !testing && (
          <div className="mt-3"><TestResultBadge result={testResult} /></div>
        )}
      </div>

      {editing && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              API Key {hasKey && <span className="text-slate-400 font-normal">(leave blank to keep existing key)</span>}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyValue}
                onChange={e => setKeyValue(e.target.value)}
                placeholder={hasKey ? '••••••••••••  (already set)' : meta.keyPlaceholder}
                className="w-full pr-10 pl-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono placeholder:font-sans placeholder:text-slate-400"
              />
              <button type="button" onClick={() => setShowKey(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {meta.docsUrl && (
              <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-1">
                <ExternalLink className="w-3 h-3" /> Get your {meta.label} API key
              </a>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">Default Model</label>
              {modelsLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            </div>
            {dbModels.length > 0 ? (
              <select value={model} onChange={e => setModel(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {dbModels.map(m => <option key={m.model_id} value={m.model_id}>{m.display_name}{m.model_type ? ` (${m.model_type})` : ''}</option>)}
              </select>
            ) : (
              <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. gpt-4o" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <div onClick={() => setIsDefault(v => !v)} className={`w-9 h-5 rounded-full transition-colors flex items-center ${isDefault ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <span className={`w-3.5 h-3.5 bg-white rounded-full shadow transition-transform mx-0.5 ${isDefault ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            <span className="text-xs text-slate-700">Set as default provider</span>
          </label>

          {saveError && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {saveError}
            </div>
          )}

          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      )}
    </div>
  );
}

function AIProvidersSection() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading]     = useState(true);

  const load = () => {
    supabase.from('ai_provider_configs').select('*').order('provider')
      .then(({ data }) => { setProviders(data ?? []); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start justify-between">
        <SectionHeader label="AI Providers" description="Configure AI providers, models and API keys" />
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors shrink-0">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : providers.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <Bot className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No providers found in database.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map(p => <ProviderCard key={p.id} provider={p} onUpdated={load} />)}
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          API keys are stored in the database and used by edge functions at runtime — they are never sent to the browser.
          Model lists are managed in the <code className="bg-slate-200 px-1 rounded text-[11px]">ai_provider_models</code> table and can be updated without code changes.
          Only one provider can be marked as default at a time.
        </p>
      </div>
    </div>
  );
}

// ─── Security section ─────────────────────────────────────────────────────────

const KNOWN_SECRETS = [
  { name: 'SUPABASE_URL',              description: 'Supabase project URL',          category: 'Infrastructure' },
  { name: 'SUPABASE_ANON_KEY',         description: 'Supabase anonymous key',        category: 'Infrastructure' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', description: 'Supabase service role key',     category: 'Infrastructure' },
  { name: 'SUPABASE_DB_URL',           description: 'Direct database connection URL',category: 'Infrastructure' },
  { name: 'OPENAI_API_KEY',            description: 'OpenAI API key',                category: 'AI' },
  { name: 'ANTHROPIC_API_KEY',         description: 'Anthropic API key',             category: 'AI' },
  { name: 'GEMINI_API_KEY',            description: 'Google Gemini API key',         category: 'AI' },
  { name: 'STRIPE_SECRET_KEY',         description: 'Stripe secret key',             category: 'Billing' },
  { name: 'STRIPE_WEBHOOK_SECRET',     description: 'Stripe webhook signing secret', category: 'Billing' },
  { name: 'RESEND_API_KEY',            description: 'Resend email API key',          category: 'Email' },
  { name: 'AXCELERATE_API_KEY',        description: 'aXcelerate API key',            category: 'Integration' },
];

function SecuritySection() {
  const [configured, setConfigured] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check which keys are stored in the settings table
    supabase.from('settings').select('key, value')
      .in('key', ['llm_api_key', 'stripe_secret_key', 'resend_api_key', 'axcelerate_api_key', 'openai_api_key', 'anthropic_api_key', 'gemini_api_key'])
      .then(({ data }) => {
        const present = new Set<string>();
        // Infrastructure keys are always present (provisioned by platform)
        ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL'].forEach(k => present.add(k));
        for (const row of data ?? []) {
          if (row.value) {
            if (row.key === 'llm_api_key' || row.key === 'openai_api_key') present.add('OPENAI_API_KEY');
            if (row.key === 'anthropic_api_key') present.add('ANTHROPIC_API_KEY');
            if (row.key === 'gemini_api_key') present.add('GEMINI_API_KEY');
            if (row.key === 'stripe_secret_key') present.add('STRIPE_SECRET_KEY');
            if (row.key === 'resend_api_key') present.add('RESEND_API_KEY');
            if (row.key === 'axcelerate_api_key') present.add('AXCELERATE_API_KEY');
          }
        }
        setConfigured(present);
        setLoading(false);
      });
  }, []);

  const categories = [...new Set(KNOWN_SECRETS.map(s => s.category))];

  return (
    <div className="max-w-2xl space-y-5">
      <SectionHeader label="Security" description="Platform secrets, API keys, and access control" />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : (
        categories.map(cat => (
          <div key={cat} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{cat}</span>
            </div>
            {KNOWN_SECRETS.filter(s => s.category === cat).map((secret, i, arr) => (
              <div key={secret.name} className={`flex items-center justify-between px-4 py-3 ${i < arr.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div>
                  <p className="text-xs font-mono font-medium text-slate-800">{secret.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{secret.description}</p>
                </div>
                {configured.has(secret.name) ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    <AlertCircle className="w-3 h-3" /> Not Set
                  </span>
                )}
              </div>
            ))}
          </div>
        ))
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          Secrets are stored encrypted in Supabase and accessed only by edge functions via environment injection.
          They are never exposed in client-side code.
        </p>
      </div>
    </div>
  );
}

// ─── Monitoring section ───────────────────────────────────────────────────────

function MonitoringSection() {
  const [stats, setStats] = useState<{
    totalCalls: number;
    successRate: number;
    totalCost: number;
    avgLatency: number;
    todayCalls: number;
    todayCost: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('ai_usage_log').select('success, estimated_cost_usd, duration_ms, created_at')
      .then(({ data }) => {
        if (!data) { setLoading(false); return; }
        const today = new Date().toISOString().split('T')[0];
        const todayRows = data.filter(r => r.created_at.startsWith(today));
        setStats({
          totalCalls:   data.length,
          successRate:  data.length > 0 ? Math.round((data.filter(r => r.success).length / data.length) * 100) : 100,
          totalCost:    data.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
          avgLatency:   data.length > 0 ? Math.round(data.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / data.length) : 0,
          todayCalls:   todayRows.length,
          todayCost:    todayRows.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
        });
        setLoading(false);
      });
  }, []);

  const metricCards = stats ? [
    { label: 'Total AI Calls',    value: stats.totalCalls.toLocaleString(), Icon: BarChart3,   color: 'text-blue-600'    },
    { label: 'Success Rate',      value: `${stats.successRate}%`,           Icon: TrendingUp,  color: 'text-emerald-600' },
    { label: 'Total AI Cost',     value: `$${stats.totalCost.toFixed(4)}`,  Icon: Database,    color: 'text-slate-700'   },
    { label: 'Avg Latency',       value: `${stats.avgLatency}ms`,           Icon: Clock,       color: 'text-amber-600'   },
    { label: "Today's Calls",     value: stats.todayCalls.toLocaleString(), Icon: Activity,    color: 'text-blue-600'    },
    { label: "Today's Cost",      value: `$${stats.todayCost.toFixed(4)}`,  Icon: TrendingUp,  color: 'text-slate-700'   },
  ] : [];

  return (
    <div className="max-w-2xl space-y-5">
      <SectionHeader label="Monitoring" description="Platform health, AI usage and performance metrics" />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {metricCards.map(({ label, value, Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-slate-500">{label}</span>
              </div>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-dashed border-slate-200 p-6 text-center">
        <Activity className="w-7 h-7 text-slate-200 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-600 mb-1">Real-time Monitoring</p>
        <p className="text-xs text-slate-400">Uptime tracking, error alerting, and queue health dashboards coming in a future phase.</p>
      </div>
    </div>
  );
}

// ─── Cost Monitoring section ──────────────────────────────────────────────────

function CostMonitoringSection() {
  const [stats, setStats] = useState<{
    totalCost: number;
    todayCost: number;
    weekCost: number;
    monthCost: number;
    byProvider: Record<string, number>;
    byFeature: { feature: string; cost: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('ai_usage_log')
      .select('estimated_cost_usd, provider, feature, created_at')
      .then(({ data }) => {
        if (!data) { setLoading(false); return; }
        const now   = new Date();
        const today = now.toISOString().split('T')[0];
        const weekAgo  = new Date(now.getTime() - 7  * 86400000).toISOString();
        const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

        const byProvider: Record<string, number> = {};
        const featureCosts: Record<string, number> = {};

        for (const row of data) {
          const cost = row.estimated_cost_usd ?? 0;
          byProvider[row.provider] = (byProvider[row.provider] ?? 0) + cost;
          featureCosts[row.feature] = (featureCosts[row.feature] ?? 0) + cost;
        }

        const byFeature = Object.entries(featureCosts)
          .map(([feature, cost]) => ({ feature, cost }))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, 8);

        setStats({
          totalCost: data.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
          todayCost: data.filter(r => r.created_at.startsWith(today)).reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
          weekCost:  data.filter(r => r.created_at >= weekAgo).reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
          monthCost: data.filter(r => r.created_at >= monthAgo).reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
          byProvider,
          byFeature,
        });
        setLoading(false);
      });
  }, []);

  return (
    <div className="max-w-2xl space-y-5">
      <SectionHeader label="Cost Monitoring" description="AI and platform infrastructure cost tracking" />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : !stats ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <DollarSign className="w-7 h-7 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No cost data available yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'All Time',    value: stats.totalCost, bold: false },
              { label: 'This Month',  value: stats.monthCost, bold: false },
              { label: 'This Week',   value: stats.weekCost,  bold: false },
              { label: 'Today',       value: stats.todayCost, bold: true  },
            ].map(({ label, value, bold }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-xl font-bold ${bold ? 'text-blue-600' : 'text-slate-800'}`}>
                  ${value.toFixed(4)}
                </p>
              </div>
            ))}
          </div>

          {Object.keys(stats.byProvider).length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Cost by Provider</h4>
              <div className="space-y-2">
                {Object.entries(stats.byProvider).map(([provider, cost]) => {
                  const pct = stats.totalCost > 0 ? (cost / stats.totalCost) * 100 : 0;
                  return (
                    <div key={provider} className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-600 capitalize">{provider}</span>
                        <span className="text-xs font-semibold text-slate-700">${cost.toFixed(4)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stats.byFeature.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Top Cost by Feature</span>
              </div>
              {stats.byFeature.map((f, i) => (
                <div key={f.feature} className={`flex items-center justify-between px-4 py-2.5 ${i < stats.byFeature.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <span className="text-xs text-slate-600 truncate max-w-[200px]">{f.feature}</span>
                  <span className="text-xs font-semibold text-slate-700">${f.cost.toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">
              Costs are estimated based on provider token pricing. Actual billed amounts may differ slightly.
              Budget alerts and spend limits will be available in a future platform phase.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Platform Analytics section ───────────────────────────────────────────────

function PlatformAnalyticsSection() {
  return (
    <PlaceholderPanel
      label="Platform Analytics"
      description="Platform usage, engagement and performance analytics"
      Icon={LineChart}
      items={[
        'Assessment completion rates and trends',
        'Feature adoption and usage frequency',
        'User journey and drop-off analysis',
        'API call volume and latency trends',
        'AI feature utilisation metrics',
        'Queue health and throughput over time',
        'Release velocity and cycle time tracking',
        'Error rates by component and feature',
      ]}
    />
  );
}

// ─── System Logs section ──────────────────────────────────────────────────────

function SystemLogsSection() {
  const [logs,    setLogs]    = useState<AIUsageLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    supabase.from('ai_usage_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setLogs(data ?? []); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader label="System Logs" description="AI usage history and platform events" />
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <ScrollText className="w-7 h-7 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No log entries yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Feature</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Provider</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Model</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Tokens</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Cost</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Latency</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id} className={`${i < logs.length - 1 ? 'border-b border-slate-100' : ''} hover:bg-slate-50/50`}>
                    <td className="px-4 py-2.5 font-medium text-slate-700 max-w-[160px] truncate">{log.feature}</td>
                    <td className="px-4 py-2.5 text-slate-500 capitalize">{log.provider}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono">{log.model?.slice(0, 16)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{((log.prompt_tokens ?? 0) + (log.completion_tokens ?? 0)).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">${(log.estimated_cost_usd ?? 0).toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                    <td className="px-4 py-2.5">
                      {log.success
                        ? <span className="text-emerald-600 font-semibold">OK</span>
                        : <span className="text-red-500 font-semibold">Error</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">
                      {new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Environments Section ─────────────────────────────────────────────────────

interface Environment {
  id: string;
  env_key: string;
  name: string;
  description: string | null;
  url: string | null;
  is_active: boolean;
  is_production: boolean;
  requires_approval: boolean;
  last_deployment_at: string | null;
  last_deployment_rc: string | null;
  deployment_count: number;
  created_at: string;
}

const ENV_CFG: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  production: { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500'    },
  staging:    { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500'  },
  development:{ bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500'   },
};

function EnvironmentsSection() {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Partial<Environment>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('ecc_environments').select('*').order('created_at');
    setEnvs(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  async function toggleActive(env: Environment) {
    if (env.is_production && !env.is_active) {
      if (!confirm('Enable the Production environment? This allows deployments to production.')) return;
    }
    setSaving(env.id);
    await supabase.from('ecc_environments').update({ is_active: !env.is_active }).eq('id', env.id);
    setSaving(null);
    load();
  }

  function startEdit(env: Environment) {
    setEditing(env.id);
    setDrafts({ url: env.url, description: env.description });
  }

  async function saveEdit(env: Environment) {
    setSaving(env.id);
    await supabase.from('ecc_environments').update(drafts).eq('id', env.id);
    setEditing(null);
    setSaving(null);
    load();
  }

  const fmtDt = (d: string | null) => d
    ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Never';

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader label="Environments" description="Development, staging and production configuration" />
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          Environment activation is controlled here. The production environment requires approval before deployments.
          Never disable production without a tested rollback plan.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : (
        <div className="space-y-3">
          {envs.map(env => {
            const cfg = ENV_CFG[env.env_key] ?? ENV_CFG.development;
            const isEditing = editing === env.id;
            return (
              <div key={env.id} className={`bg-white rounded-xl border ${env.is_production ? 'border-red-200' : 'border-slate-200'} overflow-hidden`}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${env.is_active ? cfg.dot : 'bg-slate-300'}`} />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{env.name}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            {env.env_key}
                          </span>
                          {env.is_production && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                              Production
                            </span>
                          )}
                          {env.requires_approval && (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              Requires Approval
                            </span>
                          )}
                        </div>
                        {env.description && !isEditing && (
                          <p className="text-xs text-slate-400 mt-0.5">{env.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => isEditing ? setEditing(null) : startEdit(env)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={saving === env.id}
                        onClick={() => toggleActive(env)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          env.is_active ? (env.is_production ? 'bg-red-500' : 'bg-emerald-500') : 'bg-slate-200'
                        } ${saving === env.id ? 'opacity-50' : ''}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${env.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                      <span className={`text-xs font-semibold ${env.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {env.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">URL</label>
                        <input
                          value={drafts.url ?? ''}
                          onChange={e => setDrafts(d => ({ ...d, url: e.target.value || null }))}
                          placeholder="https://your-env.example.com"
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Description</label>
                        <textarea
                          rows={2}
                          value={drafts.description ?? ''}
                          onChange={e => setDrafts(d => ({ ...d, description: e.target.value || null }))}
                          placeholder="Environment description…"
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(env)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors">
                          {saving === env.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          Save
                        </button>
                        <button onClick={() => setEditing(null)}
                          className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`px-4 py-2.5 border-t ${env.is_production ? 'bg-red-50/40 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex items-center gap-6 text-xs text-slate-400">
                    {env.url && (
                      <a href={env.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-500 hover:text-blue-600 transition-colors">
                        <ExternalLink className="w-3 h-3" />{env.url}
                      </a>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />Last deploy: {fmtDt(env.last_deployment_at)}
                    </span>
                    {env.last_deployment_rc && (
                      <span className="font-mono">{env.last_deployment_rc}</span>
                    )}
                    <span>{env.deployment_count} deployment{env.deployment_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs text-slate-500">
          Environment promotion workflow: Development → Staging → Production.
          Production deployments require explicit approval and a verified staging pass.
        </p>
      </div>
    </div>
  );
}

// ─── Section router ───────────────────────────────────────────────────────────

function renderSection(sub: SubSection) {
  switch (sub) {
    case 'pa-general':      return <GeneralSection />;
    case 'pa-ai-providers': return <AIProvidersSection />;
    case 'pa-security':     return <SecuritySection />;
    case 'pa-monitoring':        return <MonitoringSection />;
    case 'pa-cost-monitoring':    return <CostMonitoringSection />;
    case 'pa-platform-analytics': return <PlatformAnalyticsSection />;
    case 'pa-system-logs':        return <SystemLogsSection />;

    case 'pa-integrations':
      return <PlaceholderPanel label="Integrations" description="External platform connections and webhooks" Icon={Puzzle} items={['aXcelerate LMS connection', 'Email provider (Resend)', 'Stripe billing', 'Webhook endpoints', 'OAuth providers']} />;

    case 'pa-environments':
      return <EnvironmentsSection />;

    case 'pa-feature-flags':
      return <PlaceholderPanel label="Feature Flags" description="Platform-level capability toggles" Icon={ToggleLeft} items={['Enable / disable platform features', 'Staged rollout controls', 'Customer-segment overrides', 'A/B testing framework', 'Emergency kill switches']} />;

    case 'pa-automation':
      return <PlaceholderPanel label="Automation" description="Scheduled tasks, queues and triggers" Icon={Zap} items={['Queue sweep schedules (pg_cron)', 'Automated audit generation', 'Email queue processing', 'aXcelerate sync frequency', 'Webhook retry policies']} />;

    case 'pa-audit-settings':
      return <PlaceholderPanel label="Audit Settings" description="Platform audit schedule and thresholds" Icon={ClipboardList} items={['Audit generation frequency', 'Auto-audit on release', 'Finding severity thresholds', 'Score baseline targets', 'Audit retention policy']} />;

    case 'pa-release-settings':
      return <PlaceholderPanel label="Release Settings" description="Release workflow and version configuration" Icon={GitMerge} items={['Version numbering format', 'Release checklist templates', 'Required approvals', 'Deployment gate conditions', 'Rollback policies']} />;

    default:
      return null;
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCPlatformAdminPage({ activeSection }: { activeSection: Section }) {
  const activeSub = activeSection as SubSection;

  const currentItem = NAV_ITEMS.find(n => n.key === activeSub) ?? NAV_ITEMS[0];

  return (
    <div className="flex h-full overflow-hidden">

      {/* Internal sidebar */}
      <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Platform Ops</span>
          </div>
        </div>
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map(({ key, label, Icon }) => {
            const active = activeSub === key;
            return (
              <div key={key} className={`flex items-center gap-2.5 px-4 py-2.5 transition-colors ${active ? 'bg-slate-100 text-slate-900' : 'text-slate-500'}`}>
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-slate-700' : 'text-slate-400'}`} />
                <span className="text-xs font-medium truncate">{label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-auto shrink-0" />}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6 lg:p-8">
        {renderSection(activeSub)}
      </main>
    </div>
  );
}
