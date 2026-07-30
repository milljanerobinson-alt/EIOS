import { useState, useEffect, useCallback } from 'react';
import {
  Brain, CheckCircle2, AlertTriangle, AlertCircle, Loader2,
  RefreshCw, Plus, Shield, Database, Zap, Activity, Info,
  Package, FileText, BookOpen, Target, ChevronRight, Clock,
  Star, ArrowUpRight, Lock, Unlock, BarChart3, GitBranch,
  Layers, ChevronDown, X, CheckSquare, Cpu, TrendingUp,
  Award, BarChart2, BookMarked, Server,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  assembleSources, validateContext, calculateConfidence, calculateCompleteness,
  deriveValidationStatus, buildExecutiveSummary, generateContextPackage,
  snapshotPlatformState, loadRegisteredSources,
  type EipSource, type SourceAssessment, type ContextPackage, type ValidationIssue, type PlatformState,
} from '../../lib/eipService';
import {
  EngineeringIntelligenceService,
  type EILDashboardStats,
  type ProviderHealthSnapshot,
} from '../../lib/engineeringIntelligenceService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Confidence Ring ──────────────────────────────────────────────────────────

function ConfidenceRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const fill = circ * (score / 100);
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const labelSize = size * 0.22;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={size * 0.08} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={size * 0.08}
        strokeDasharray={`${fill} ${circ - fill}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x={size / 2} y={size / 2 + labelSize * 0.38} textAnchor="middle"
        fontSize={labelSize} fontWeight="900" fill={color}>
        {score}
      </text>
    </svg>
  );
}

// ─── Source Icon ──────────────────────────────────────────────────────────────

const SOURCE_ICONS: Record<string, typeof Brain> = {
  product_vision:      Brain,
  goals_epics:         Target,
  features_registry:   Layers,
  engineering_phases:  GitBranch,
  release_candidates:  Package,
  engineering_reviews: BookOpen,
  platform_audits:     Shield,
  decision_log:        FileText,
  test_plans:          CheckSquare,
  arch_guardian:       GitBranch,
  documentation:       FileText,
  exec_briefings:      Star,
  product_backlog:     BarChart3,
  engineering_changes: Activity,
  risks:               AlertTriangle,
};

function sourceIcon(key: string) {
  return SOURCE_ICONS[key] ?? Database;
}

// ─── Validation Severity Config ───────────────────────────────────────────────

const SEV_CFG = {
  high:   { color: 'text-red-600',    bg: 'bg-red-50 border-red-200',    icon: AlertTriangle, label: 'HIGH' },
  medium: { color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200', icon: AlertCircle,   label: 'MEDIUM' },
  low:    { color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200',   icon: Info,          label: 'LOW' },
  info:   { color: 'text-slate-500',  bg: 'bg-slate-50 border-slate-200', icon: Info,          label: 'INFO' },
};

// ─── Source Card ──────────────────────────────────────────────────────────────

function SourceCard({ source }: { source: SourceAssessment }) {
  const Icon = sourceIcon(source.source_key);
  const isMissing = !source.is_covered || !!source.error;
  return (
    <div className={`bg-white border rounded-xl p-3 transition-all ${
      source.error ? 'border-red-200 opacity-60' :
      source.is_covered ? 'border-slate-200 hover:border-teal-300 hover:shadow-sm' :
      source.is_critical ? 'border-red-200 bg-red-50/30' : 'border-slate-200 opacity-70'
    }`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          source.is_covered ? 'bg-teal-50 border border-teal-200' : 'bg-slate-100 border border-slate-200'
        }`}>
          <Icon className={`w-4 h-4 ${source.is_covered ? 'text-teal-600' : 'text-slate-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs font-bold text-slate-800 truncate">{source.source_name}</p>
            <div className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
              source.error ? 'bg-red-100' : source.is_covered ? 'bg-emerald-100' : source.is_critical ? 'bg-red-100' : 'bg-slate-100'
            }`}>
              {source.error ? <X className="w-2.5 h-2.5 text-red-500" /> :
               source.is_covered ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> :
               <AlertCircle className="w-2.5 h-2.5 text-slate-400" />}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {source.is_covered ? (
              <span className="text-[10px] text-slate-500">
                {source.record_count.toLocaleString()} record{source.record_count !== 1 ? 's' : ''}
                {source.last_updated && <> · {fmtAgo(source.last_updated)}</>}
              </span>
            ) : (
              <span className={`text-[10px] font-semibold ${source.is_critical ? 'text-red-500' : 'text-slate-400'}`}>
                {source.error ? 'Unavailable' : source.is_critical ? 'MISSING — CRITICAL' : 'No data'}
              </span>
            )}
          </div>
          {!isMissing && (
            <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-teal-400 rounded-full" style={{ width: `${Math.min(100, (source.weight / 10) * 100)}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Package Card ─────────────────────────────────────────────────────────────

function PackageCard({
  pkg, expanded, onExpand,
}: {
  pkg: ContextPackage;
  expanded: boolean;
  onExpand: () => void;
}) {
  const statusCfg = {
    valid:      { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
    warnings:   { color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     icon: AlertTriangle },
    incomplete: { color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         icon: AlertCircle },
    invalid:    { color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         icon: X },
  }[pkg.validation_status];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={onExpand}>
        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
          <Database className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-800">{pkg.package_ref}</p>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${statusCfg.bg} ${statusCfg.color} uppercase tracking-wide`}>
              {pkg.validation_status}
            </span>
            <Lock className="w-3 h-3 text-slate-300" title="Immutable package" />
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Generated {fmtDateTime(pkg.generation_timestamp)} · Confidence {pkg.knowledge_confidence_score}/100 · Completeness {pkg.context_completeness_score}%
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 space-y-3 pt-3">
          <p className="text-xs text-slate-600 leading-relaxed">{pkg.executive_summary}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
              <ConfidenceRing score={pkg.knowledge_confidence_score} size={48} />
              <p className="text-[10px] text-slate-500 mt-1">Confidence</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-black text-blue-600 mt-1">{pkg.context_completeness_score}%</p>
              <p className="text-[10px] text-slate-500 mt-1">Completeness</p>
            </div>
            <div className={`${statusCfg.bg} rounded-lg p-2.5 text-center`}>
              <StatusIcon className={`w-6 h-6 ${statusCfg.color} mx-auto mt-1`} />
              <p className={`text-[10px] ${statusCfg.color} mt-1 font-semibold capitalize`}>{pkg.validation_status}</p>
            </div>
          </div>

          {pkg.missing_sources.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Missing Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {pkg.missing_sources.map(s => (
                  <span key={s} className="text-[10px] font-semibold px-2 py-0.5 bg-red-50 border border-red-200 text-red-600 rounded">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {pkg.validation_issues?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Validation Issues ({pkg.validation_issues.length})</p>
              <div className="space-y-1.5">
                {pkg.validation_issues.slice(0, 5).map((issue, i) => {
                  const cfg = SEV_CFG[issue.severity];
                  const IssueIcon = cfg.icon;
                  return (
                    <div key={i} className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border ${cfg.bg}`}>
                      <IssueIcon className={`w-3.5 h-3.5 ${cfg.color} shrink-0 mt-0.5`} />
                      <p className={`text-xs ${cfg.color}`}>{issue.message}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Generate Package Modal ────────────────────────────────────────────────────

function GenerateModal({
  sources, onClose, onGenerated,
}: {
  sources: SourceAssessment[];
  onClose: () => void;
  onGenerated: (pkg: ContextPackage) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState('');
  const [triggerType, setTriggerType] = useState('manual');

  const confidence = calculateConfidence(sources);
  const completeness = calculateCompleteness(sources);
  const issues = validateContext(sources);
  const status = deriveValidationStatus(issues, completeness);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const platformState = await snapshotPlatformState();
      const pkg = await generateContextPackage(sources, platformState.id, triggerType, context || undefined);
      onGenerated(pkg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  const statusCfg = {
    valid:      { color: 'text-emerald-600', label: 'Valid — ready for AI reasoning' },
    warnings:   { color: 'text-amber-600',   label: 'Warnings — proceed with caution' },
    incomplete: { color: 'text-red-600',     label: 'Incomplete — critical sources missing' },
    invalid:    { color: 'text-red-600',     label: 'Invalid — not suitable for AI reasoning' },
  }[status];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-xl">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Generate Engineering Context Package</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Pre-flight summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-700">Pre-flight Assessment</p>
              <ConfidenceRing score={confidence} size={48} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Confidence: </span>
                <span className="font-bold text-slate-800">{confidence}/100</span>
              </div>
              <div>
                <span className="text-slate-500">Completeness: </span>
                <span className="font-bold text-slate-800">{completeness}%</span>
              </div>
              <div>
                <span className="text-slate-500">Sources covered: </span>
                <span className="font-bold text-slate-800">{sources.filter(s => s.is_covered).length}/{sources.length}</span>
              </div>
              <div>
                <span className="text-slate-500">Validation: </span>
                <span className={`font-bold ${statusCfg.color}`}>{statusCfg.label}</span>
              </div>
            </div>
            {issues.filter(i => i.severity === 'high').length > 0 && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs font-semibold text-red-700 mb-1">High-severity issues:</p>
                {issues.filter(i => i.severity === 'high').map((issue, i) => (
                  <p key={i} className="text-xs text-red-600">· {issue.message}</p>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Trigger Type</label>
            <select value={triggerType} onChange={e => setTriggerType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400">
              <option value="manual">Manual — initiated by engineer</option>
              <option value="pre_review">Pre-Engineering Review</option>
              <option value="pre_audit">Pre-Platform Audit</option>
              <option value="pre_release">Pre-Release Review</option>
              <option value="pre_investment">Pre-Investment Review</option>
              <option value="scheduled">Scheduled generation</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Context (optional)</label>
            <input type="text" value={context} onChange={e => setContext(e.target.value)}
              placeholder="e.g. Preparing for RC-004 Engineering Review"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>

          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Lock className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              This package will be <strong>immutable</strong> once created. It records the exact state of engineering knowledge at this moment and can be referenced by future AI workflows.
            </p>
          </div>

          {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
            {generating ? 'Assembling…' : 'Generate Package'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type TabKey = 'intelligence' | 'packages' | 'validation' | 'registry' | 'eil';

export function ECCEngineeringIntelligencePage() {
  const [tab, setTab] = useState<TabKey>('intelligence');
  const [loading, setLoading] = useState(true);
  const [assembling, setAssembling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [registeredSources, setRegisteredSources] = useState<EipSource[]>([]);
  const [assessedSources, setAssessedSources] = useState<SourceAssessment[]>([]);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [packages, setPackages] = useState<ContextPackage[]>([]);
  const [latestState, setLatestState] = useState<PlatformState | null>(null);
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  const [showGenModal, setShowGenModal] = useState(false);

  // EWO-012: EIL dashboard state
  const [eilStats, setEilStats] = useState<EILDashboardStats | null>(null);
  const [eilHealth, setEilHealth] = useState<ProviderHealthSnapshot[]>([]);
  const [eilPrompts, setEilPrompts] = useState<{
    id: string; prompt_key: string; version: string; capability: string;
    title: string; is_active: boolean; is_default: boolean; usage_count: number; last_used_at: string | null;
  }[]>([]);
  const [eilLoading, setEilLoading] = useState(false);

  const confidence = calculateConfidence(assessedSources);
  const completeness = calculateCompleteness(assessedSources);
  const validationStatus = assessedSources.length > 0 ? deriveValidationStatus(validationIssues, completeness) : null;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [srcs, pkgsRes, stateRes] = await Promise.all([
        loadRegisteredSources(),
        supabase.from('eip_context_packages').select('*').order('generation_timestamp', { ascending: false }).limit(20),
        supabase.from('eip_platform_states').select('*').order('generated_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setRegisteredSources(srcs);
      setPackages((pkgsRes.data ?? []) as ContextPackage[]);
      setLatestState((stateRes.data ?? null) as PlatformState | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load EIP data');
    } finally {
      setLoading(false);
    }
  }, []);

  const assembleContext = useCallback(async () => {
    if (registeredSources.length === 0) return;
    setAssembling(true);
    try {
      const sources = await assembleSources(registeredSources);
      setAssessedSources(sources);
      setValidationIssues(validateContext(sources));
    } finally {
      setAssembling(false);
    }
  }, [registeredSources]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (registeredSources.length > 0) assembleContext(); }, [registeredSources, assembleContext]);

  useEffect(() => {
    if (tab !== 'eil') return;
    setEilLoading(true);
    Promise.all([
      EngineeringIntelligenceService.getDashboardStats(),
      EngineeringIntelligenceService.getProviderHealth(),
      EngineeringIntelligenceService.getPromptLibrary(),
    ]).then(([stats, health, prompts]) => {
      setEilStats(stats);
      setEilHealth(health);
      setEilPrompts(prompts as typeof eilPrompts);
    }).catch(() => {}).finally(() => setEilLoading(false));
  }, [tab]);

  const TABS: { key: TabKey; label: string; icon: typeof Brain; badge?: number }[] = [
    { key: 'intelligence', label: 'Platform Intelligence', icon: Brain },
    { key: 'packages', label: 'Context Packages', icon: Database, badge: packages.length > 0 ? packages.length : undefined },
    { key: 'validation', label: 'Validation', icon: Shield, badge: validationIssues.filter(i => i.severity === 'high').length || undefined },
    { key: 'registry', label: 'Source Registry', icon: Layers },
    { key: 'eil', label: 'Intelligence Layer', icon: Cpu },
  ];

  const statusCfg = validationStatus ? {
    valid:      { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2, label: 'Valid' },
    warnings:   { color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     icon: AlertTriangle, label: 'Warnings' },
    incomplete: { color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         icon: AlertCircle,   label: 'Incomplete' },
    invalid:    { color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         icon: X,             label: 'Invalid' },
  }[validationStatus] : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shrink-0">
            <Brain className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">Engineering Intelligence Platform</h2>
            <p className="text-xs text-slate-500">Context assembly · Knowledge validation · AI workflow foundation</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowGenModal(true)}
              disabled={assembling || loading || assessedSources.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              Generate Context Package
            </button>
            <button onClick={() => { loadAll(); assembleContext(); }}
              className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${assembling ? 'animate-spin text-blue-500' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 mt-3 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  tab === t.key ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {t.badge !== undefined && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    tab === t.key ? 'bg-blue-100 text-blue-700' :
                    t.key === 'validation' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                  }`}>{t.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-4xl mx-auto">

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-3" />
              <span className="text-sm text-slate-500">Loading Engineering Intelligence Platform…</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
              <button onClick={loadAll} className="ml-auto underline font-semibold">Retry</button>
            </div>
          ) : (

            <>
              {/* ── INTELLIGENCE TAB ── */}
              {tab === 'intelligence' && (
                <div className="space-y-5">
                  {/* Top row: Platform State + Confidence + Completeness + Validation */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Platform State */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 md:col-span-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-3.5 h-3.5 text-violet-500" />
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Platform State</p>
                      </div>
                      {latestState ? (
                        <>
                          <p className="text-2xl font-black text-slate-900">v{latestState.version}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {fmtAgo(latestState.generated_at)} · {latestState.features_count} features
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-400 italic">No state yet — generate a package</p>
                      )}
                    </div>

                    {/* Confidence */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center">
                      {assembling ? (
                        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                      ) : (
                        <ConfidenceRing score={confidence} size={64} />
                      )}
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Confidence</p>
                    </div>

                    {/* Completeness */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center">
                      <p className={`text-3xl font-black ${
                        completeness >= 70 ? 'text-emerald-600' : completeness >= 50 ? 'text-amber-600' : 'text-red-500'
                      }`}>{assembling ? '…' : `${completeness}%`}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Completeness</p>
                    </div>

                    {/* Validation Status */}
                    <div className={`rounded-xl p-4 flex flex-col items-center justify-center border ${
                      statusCfg ? statusCfg.bg : 'bg-slate-50 border-slate-200'
                    }`}>
                      {statusCfg ? (
                        <>
                          <statusCfg.icon className={`w-7 h-7 ${statusCfg.color}`} />
                          <p className={`text-xs font-black mt-1 ${statusCfg.color}`}>{statusCfg.label}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Validation</p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-400">—</p>
                      )}
                    </div>
                  </div>

                  {/* Source assessment overview */}
                  {assembling ? (
                    <div className="flex items-center gap-3 py-8 justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                      <span className="text-sm text-slate-500">Assembling knowledge context…</span>
                    </div>
                  ) : assessedSources.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Knowledge Sources ({assessedSources.filter(s => s.is_covered).length}/{assessedSources.length} covered)
                        </p>
                        {validationIssues.length > 0 && (
                          <button onClick={() => setTab('validation')} className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-700 font-semibold">
                            {validationIssues.length} issue{validationIssues.length !== 1 ? 's' : ''}
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {assessedSources.map(s => <SourceCard key={s.source_key} source={s} />)}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl">
                      <Brain className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-600">No sources registered</p>
                      <p className="text-xs text-slate-400 mt-1">The Source Registry will be populated on first load.</p>
                    </div>
                  )}

                  {/* Workflow lifecycle diagram */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-bold text-slate-700 mb-3">EIP Workflow Lifecycle</p>
                    <div className="flex items-center gap-1 overflow-x-auto pb-1">
                      {[
                        { label: 'Engineering Request', icon: Target, color: 'text-slate-600 bg-slate-100' },
                        { label: 'Context Assembly', icon: Database, color: 'text-blue-600 bg-blue-50' },
                        { label: 'Validation', icon: Shield, color: 'text-amber-600 bg-amber-50' },
                        { label: 'Confidence Score', icon: BarChart3, color: 'text-violet-600 bg-violet-50' },
                        { label: 'Context Package', icon: Lock, color: 'text-teal-600 bg-teal-50' },
                        { label: 'AI Reasoning', icon: Brain, color: 'text-blue-600 bg-blue-50' },
                        { label: 'Decision', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
                      ].map((step, i) => {
                        const Icon = step.icon;
                        return (
                          <div key={step.label} className="flex items-center gap-1 shrink-0">
                            <div className="flex flex-col items-center">
                              <div className={`w-8 h-8 rounded-lg ${step.color} flex items-center justify-center`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <p className="text-[9px] text-slate-500 mt-1 text-center w-16 leading-tight">{step.label}</p>
                            </div>
                            {i < 6 && <ChevronRight className="w-3 h-3 text-slate-300 shrink-0 mb-3" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── CONTEXT PACKAGES TAB ── */}
              {tab === 'packages' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      {packages.length} package{packages.length !== 1 ? 's' : ''} generated · All packages are immutable once created
                    </p>
                    <button
                      onClick={() => setShowGenModal(true)}
                      disabled={assessedSources.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New Package
                    </button>
                  </div>

                  {packages.length === 0 ? (
                    <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl">
                      <Database className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-600">No context packages yet</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                        Generate your first Engineering Context Package to begin AI-assisted engineering workflows with verified context.
                      </p>
                      <button onClick={() => setShowGenModal(true)} disabled={assessedSources.length === 0}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        Generate First Package
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {packages.map(pkg => (
                        <PackageCard
                          key={pkg.id}
                          pkg={pkg}
                          expanded={expandedPkg === pkg.id}
                          onExpand={() => setExpandedPkg(expandedPkg === pkg.id ? null : pkg.id)}
                        />
                      ))}
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Lock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-blue-800">Package Governance</p>
                        <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                          Context Packages are immutable once created — they capture the exact state of engineering knowledge
                          at a specific moment. Future Engineering Reviews, Audits, and AI workflows should reference the
                          package used during their analysis for complete governance traceability.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── VALIDATION TAB ── */}
              {tab === 'validation' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(['high', 'medium', 'low', 'info'] as const).map(sev => {
                      const count = validationIssues.filter(i => i.severity === sev).length;
                      const cfg = SEV_CFG[sev];
                      return (
                        <div key={sev} className={`rounded-xl p-3 border ${cfg.bg}`}>
                          <p className="text-2xl font-black text-slate-900">{count}</p>
                          <p className={`text-[10px] font-bold ${cfg.color} uppercase tracking-wider`}>{sev}</p>
                        </div>
                      );
                    })}
                  </div>

                  {validationIssues.length === 0 ? (
                    <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl">
                      <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-600">No validation issues</p>
                      <p className="text-xs text-slate-400 mt-1">All registered knowledge sources are populated and valid.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(['high', 'medium', 'low', 'info'] as const).map(sev => {
                        const sevIssues = validationIssues.filter(i => i.severity === sev);
                        if (sevIssues.length === 0) return null;
                        const cfg = SEV_CFG[sev];
                        const SevIcon = cfg.icon;
                        return (
                          <div key={sev}>
                            <p className={`text-[10px] font-bold ${cfg.color} uppercase tracking-wider mb-2`}>
                              {sev} ({sevIssues.length})
                            </p>
                            <div className="space-y-2">
                              {sevIssues.map((issue, i) => (
                                <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${cfg.bg}`}>
                                  <SevIcon className={`w-4 h-4 ${cfg.color} shrink-0 mt-0.5`} />
                                  <div className="flex-1">
                                    <p className={`text-xs font-semibold ${cfg.color}`}>{issue.message}</p>
                                    {issue.detail && <p className="text-xs text-slate-500 mt-0.5">{issue.detail}</p>}
                                    {issue.source_key && (
                                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">source: {issue.source_key}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Validation issues are re-assessed each time the page loads or context is refreshed.
                        Resolving issues (adding data to missing sources) automatically removes them from this list.
                        High-severity issues reduce the Knowledge Confidence Score and block reliable AI reasoning.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SOURCE REGISTRY TAB ── */}
              {tab === 'registry' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      {registeredSources.length} registered sources · {registeredSources.filter(s => s.is_enabled).length} enabled
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <span className="col-span-3">Source</span>
                      <span className="col-span-3">Description</span>
                      <span className="col-span-2">Table</span>
                      <span className="col-span-1 text-center">Weight</span>
                      <span className="col-span-1 text-center">Critical</span>
                      <span className="col-span-1 text-center">Status</span>
                      <span className="col-span-1 text-center">Records</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {registeredSources.map(src => {
                        const assessed = assessedSources.find(a => a.source_key === src.source_key);
                        const Icon = sourceIcon(src.source_key);
                        return (
                          <div key={src.source_key} className="px-4 py-3 grid grid-cols-12 gap-2 items-center text-xs">
                            <div className="col-span-3 flex items-center gap-2">
                              <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-semibold text-slate-700 truncate">{src.source_name}</span>
                            </div>
                            <span className="col-span-3 text-slate-500 truncate text-[10px]">{src.description ?? '—'}</span>
                            <span className="col-span-2 text-slate-400 font-mono text-[9px] truncate">{src.table_name}</span>
                            <span className="col-span-1 text-center font-bold text-slate-600">{src.weight}</span>
                            <span className="col-span-1 text-center">
                              {src.is_critical
                                ? <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
                                : <span className="inline-block w-2 h-2 rounded-full bg-slate-200" />}
                            </span>
                            <span className="col-span-1 text-center">
                              {assessed ? (
                                assessed.is_covered
                                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                                  : <AlertCircle className="w-3.5 h-3.5 text-red-400 mx-auto" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                              )}
                            </span>
                            <span className="col-span-1 text-center font-bold text-slate-700">
                              {assessed ? assessed.record_count.toLocaleString() : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Layers className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-violet-800">Source Registry Extensibility</p>
                        <p className="text-xs text-violet-700 mt-1 leading-relaxed">
                          New knowledge sources can be registered by inserting a row into
                          <code className="mx-1 px-1 py-0.5 bg-violet-200 rounded font-mono text-[10px]">eip_source_registry</code>.
                          The EIP automatically picks up new sources on next assembly — no code changes required.
                          Future phases (Product Knowledge Register, Engineering Knowledge Register) will add sources this way.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── EIL TAB ── */}
              {tab === 'eil' && (
                <div className="space-y-5">
                  {eilLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin mr-2" />
                      <span className="text-sm text-slate-500">Loading Intelligence Layer...</span>
                    </div>
                  ) : (
                    <>
                      {/* Header KPIs */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { label: "Today's Requests", value: eilStats?.todayRequests ?? 0, icon: Zap, color: 'text-blue-600', bg: 'bg-blue-50' },
                          { label: 'Success Rate', value: `${eilStats?.successRate ?? 0}%`, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                          { label: 'Avg Confidence', value: `${eilStats?.avgConfidence ?? 0}`, icon: Award, color: 'text-amber-600', bg: 'bg-amber-50' },
                          { label: 'Acceptance Rate', value: `${eilStats?.acceptanceRate ?? 0}%`, icon: TrendingUp, color: 'text-teal-600', bg: 'bg-teal-50' },
                        ].map((kpi) => {
                          const Icon = kpi.icon;
                          return (
                            <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4">
                              <div className={`w-8 h-8 ${kpi.bg} rounded-lg flex items-center justify-center mb-2`}>
                                <Icon className={`w-4 h-4 ${kpi.color}`} />
                              </div>
                              <p className="text-xl font-black text-slate-800">{kpi.value}</p>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mt-0.5">{kpi.label}</p>
                            </div>
                          );
                        })}
                      </div>

                      {/* Provider Health + Cost row */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Provider Health */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Server className="w-4 h-4 text-slate-500" />
                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Provider Health</p>
                          </div>
                          {eilHealth.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-4">No health data yet — requests will populate this.</p>
                          ) : (
                            <div className="space-y-2">
                              {eilHealth.map((h) => (
                                <div key={h.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${
                                      h.status === 'healthy' ? 'bg-emerald-500' :
                                      h.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'
                                    }`} />
                                    <div>
                                      <p className="text-xs font-semibold text-slate-700 capitalize">{h.provider}</p>
                                      <p className="text-[10px] text-slate-400">{h.model}</p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs font-bold text-slate-700">{h.health_score}/100</p>
                                    {h.latency_ms != null && (
                                      <p className="text-[10px] text-slate-400">{h.latency_ms}ms</p>
                                    )}
                                  </div>
                                  {h.is_recommended && (
                                    <span className="ml-2 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                      RECOMMENDED
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Cost Intelligence */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <BarChart2 className="w-4 h-4 text-slate-500" />
                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Cost Intelligence</p>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                              <span className="text-xs text-slate-600">Today's Cost</span>
                              <span className="text-xs font-bold text-slate-800">${(eilStats?.totalCostUsd ?? 0).toFixed(4)}</span>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                              <span className="text-xs text-slate-600">Avg Latency</span>
                              <span className="text-xs font-bold text-slate-800">{eilStats?.avgLatencyMs ?? 0}ms</span>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                              <span className="text-xs text-slate-600">Human Edit Rate</span>
                              <span className="text-xs font-bold text-slate-800">{eilStats?.humanEditRate ?? 0}%</span>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                              <span className="text-xs text-slate-600">Learning Events</span>
                              <span className="text-xs font-bold text-slate-800">{eilStats?.totalLearningEvents ?? 0}</span>
                            </div>
                          </div>
                          {(eilStats?.providerUsage ?? []).length > 0 && (
                            <div className="mt-3">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">By Provider</p>
                              {(eilStats?.providerUsage ?? []).map((p) => (
                                <div key={p.provider} className="flex items-center gap-2 mb-1.5">
                                  <span className="text-[10px] text-slate-600 w-16 truncate capitalize">{p.provider}</span>
                                  <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                                    <div
                                      className="bg-blue-500 h-1.5 rounded-full"
                                      style={{ width: `${Math.min(100, (p.count / Math.max(1, (eilStats?.todayRequests ?? 1))) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-700 w-8 text-right">{p.count}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Confidence Distribution */}
                      <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <BarChart3 className="w-4 h-4 text-slate-500" />
                          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Confidence Distribution</p>
                        </div>
                        {eilStats && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {[
                              { label: 'High', count: eilStats.confidenceDistribution.high, color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
                              { label: 'Medium', count: eilStats.confidenceDistribution.medium, color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
                              { label: 'Low', count: eilStats.confidenceDistribution.low, color: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
                            ].map((bucket) => {
                              const total = eilStats.confidenceDistribution.high + eilStats.confidenceDistribution.medium + eilStats.confidenceDistribution.low;
                              const pct = total > 0 ? Math.round((bucket.count / total) * 100) : 0;
                              return (
                                <div key={bucket.label} className={`${bucket.bg} rounded-xl p-3 text-center`}>
                                  <p className={`text-2xl font-black ${bucket.text}`}>{bucket.count}</p>
                                  <p className={`text-[10px] font-bold ${bucket.text} uppercase tracking-wide`}>{bucket.label}</p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">{pct}% of results</p>
                                  <div className="w-full bg-white/50 rounded-full h-1 mt-2">
                                    <div className={`${bucket.color} h-1 rounded-full`} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Prompt Library */}
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                          <BookMarked className="w-4 h-4 text-slate-500" />
                          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Prompt Library</p>
                          <span className="ml-auto text-[10px] text-slate-400">{eilPrompts.length} prompts</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {eilPrompts.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-6">No prompts yet — seeded prompts appear after first use.</p>
                          ) : (
                            eilPrompts.map((p) => (
                              <div key={p.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${p.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-800">{p.title}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] font-mono text-slate-400">{p.prompt_key}</span>
                                      <span className="text-[10px] text-slate-300">·</span>
                                      <span className="text-[10px] text-slate-400">v{p.version}</span>
                                      {p.is_default && (
                                        <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1 rounded border border-blue-200">DEFAULT</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 ml-4">
                                  <p className="text-xs font-bold text-slate-700">{p.usage_count} uses</p>
                                  <p className="text-[10px] text-slate-400 capitalize">{p.capability.replace(/_/g, ' ')}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Recent Requests */}
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-slate-500" />
                          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Recent Intelligence Requests</p>
                        </div>
                        {(eilStats?.recentRequests ?? []).length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-6">No requests yet.</p>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {(eilStats?.recentRequests ?? []).map((r) => (
                              <div key={r.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                                    r.status === 'complete' ? 'bg-emerald-500' :
                                    r.status === 'error' ? 'bg-red-500' :
                                    r.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'
                                  }`} />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-800 truncate capitalize">
                                      {r.capability.replace(/_/g, ' ')}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] font-mono text-slate-400">{r.request_ref}</span>
                                      <span className="text-[10px] text-slate-300">·</span>
                                      <span className="text-[10px] text-slate-400 capitalize">{r.provider}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 ml-4 space-y-0.5">
                                  <p className="text-[10px] font-bold text-slate-700">{r.duration_ms}ms</p>
                                  <p className="text-[10px] text-slate-400">{new Date(r.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Architecture Diagram */}
                      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6">
                        <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-4">Engineering Intelligence Architecture</p>
                        <div className="space-y-1 font-mono text-xs text-slate-300">
                          {[
                            { label: 'AI Technical Director', indent: 0, color: 'text-blue-400' },
                            { label: 'Engineering Intelligence Layer (EIOS)', indent: 1, color: 'text-teal-400' },
                            { label: 'Engineering Continuity Engine', indent: 2, color: 'text-emerald-400' },
                            { label: 'Engineering Context Builder', indent: 2, color: 'text-emerald-400' },
                            { label: 'Engineering Intelligence Retrieval', indent: 2, color: 'text-emerald-400' },
                            { label: 'Provider Adapter (OpenAI · Anthropic · Gemini)', indent: 3, color: 'text-amber-400' },
                            { label: 'Engineering Response Validation', indent: 2, color: 'text-emerald-400' },
                            { label: 'Confidence Engine', indent: 2, color: 'text-emerald-400' },
                            { label: 'Engineering Learning', indent: 2, color: 'text-emerald-400' },
                            { label: 'Governed Engineering Objects', indent: 1, color: 'text-teal-400' },
                            { label: 'Engineering Workspace', indent: 0, color: 'text-blue-400' },
                          ].map((line, i) => (
                            <div key={i} className="flex items-center gap-1" style={{ paddingLeft: `${line.indent * 20}px` }}>
                              {line.indent > 0 && <span className="text-slate-600">↓</span>}
                              <span className={`${line.color} font-semibold`}>{line.label}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-4">
                          The intelligence belongs to EIOS. The AI provider performs reasoning using the governed
                          engineering context supplied by EIOS. Provider-specific logic never leaks outside the EIL.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showGenModal && assessedSources.length > 0 && (
        <GenerateModal
          sources={assessedSources}
          onClose={() => setShowGenModal(false)}
          onGenerated={pkg => {
            setShowGenModal(false);
            setPackages(prev => [pkg, ...prev]);
            setTab('packages');
            setExpandedPkg(pkg.id);
            loadAll();
          }}
        />
      )}
    </div>
  );
}
