import { useEffect, useState, useCallback } from 'react';
import {
  Layers, Cpu, Server, CheckCircle2, AlertTriangle, Clock,
  RefreshCw, ChevronRight, ChevronDown, Shield, Puzzle,
  Network, GitBranch, Package, Info, Search, Filter,
  BarChart3, Loader2, ExternalLink, ArrowRight, Zap,
} from 'lucide-react';
import {
  loadModuleRegistry, loadPluginRegistry, generateArchitectureReport,
  computeArchitectureMetrics,
  type ModuleRegistryEntry, type PluginRegistryEntry, type ArchitectureMetrics,
  type ArchitectureViolation, type DependencyNode,
} from '../../lib/architectureService';

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewTab = 'registry' | 'compliance' | 'dependencies' | 'plugins';
type FilterType = 'all' | 'core_platform' | 'domain_module' | 'infrastructure';
type FilterStatus = 'all' | 'active' | 'planned' | 'deprecated';

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CFG = {
  core_platform:  { label: 'Core Platform',  bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500',   icon: Cpu     },
  domain_module:  { label: 'Domain Module',  bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500',  icon: Package },
  infrastructure: { label: 'Infrastructure', bg: 'bg-slate-50',  border: 'border-slate-200',  text: 'text-slate-600',  dot: 'bg-slate-400',  icon: Server  },
};

const STATUS_CFG = {
  active:     { label: 'Active',      dot: 'bg-emerald-500', text: 'text-emerald-700' },
  planned:    { label: 'Planned',     dot: 'bg-amber-400',   text: 'text-amber-700'  },
  deprecated: { label: 'Deprecated',  dot: 'bg-red-400',     text: 'text-red-600'    },
};

const LAYER_LABELS: Record<number, string> = {
  1: 'L1 — Core Platform',
  2: 'L2 — Domain Modules',
  3: 'L3 — Infrastructure',
  4: 'L4 — Plugins',
};

const SCORE_COLOR = (n: number) =>
  n >= 90 ? 'text-emerald-600' :
  n >= 70 ? 'text-blue-600' :
  n >= 50 ? 'text-amber-600' : 'text-red-600';

const SCORE_BAR = (n: number) =>
  n >= 90 ? '#10b981' :
  n >= 70 ? '#3b82f6' :
  n >= 50 ? '#f59e0b' : '#ef4444';

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ value, label, size = 80 }: { value: number; label: string; size?: number }) {
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = SCORE_BAR(value);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={size * 0.09} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.09}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#0f172a"
          style={{ fontSize: size * 0.21, fontWeight: 700 }}>{value}%</text>
      </svg>
      <p className="text-[10px] font-medium text-slate-500 text-center leading-tight">{label}</p>
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color = 'text-slate-900' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-4">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Module Card ─────────────────────────────────────────────────────────────

function ModuleCard({
  module, expanded, onToggle,
}: {
  module: ModuleRegistryEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tCfg = TYPE_CFG[module.module_type];
  const sCfg = STATUS_CFG[module.status];
  const TypeIcon = tCfg.icon;

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all duration-200 ${expanded ? 'border-blue-200 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        {/* Type icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tCfg.bg} ${tCfg.border} border`}>
          <TypeIcon className={`w-4 h-4 ${tCfg.text}`} />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900">{module.name}</p>
            <span className="text-[10px] font-mono text-slate-400">{module.slug}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`flex items-center gap-1 text-[10px] font-medium ${sCfg.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sCfg.dot}`} />{sCfg.label}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tCfg.bg} ${tCfg.text}`}>
              {tCfg.label}
            </span>
            {module.phase_introduced && (
              <span className="text-[10px] text-slate-400">{module.phase_introduced}</span>
            )}
            <span className="text-[10px] text-slate-400">v{module.version}</span>
          </div>
        </div>

        {/* Reusable badge */}
        {module.reusable && (
          <span className="hidden sm:flex items-center gap-1 text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full shrink-0">
            <Zap className="w-2.5 h-2.5" /> Reusable
          </span>
        )}

        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          {module.description && (
            <p className="text-xs text-slate-600 leading-relaxed">{module.description}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Owner</p>
              <p className="text-xs text-slate-700">{module.owner}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Domain</p>
              <p className="text-xs text-slate-700 capitalize">{module.domain.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Layer</p>
              <p className="text-xs text-slate-700">{LAYER_LABELS[module.layer] ?? `L${module.layer}`}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Reusable</p>
              <p className={`text-xs font-semibold ${module.reusable ? 'text-teal-600' : 'text-slate-400'}`}>
                {module.reusable ? 'Yes' : 'No'}
              </p>
            </div>
          </div>

          {module.dependencies.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Dependencies</p>
              <div className="flex flex-wrap gap-1.5">
                {module.dependencies.map(dep => (
                  <span key={dep} className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {module.architecture_notes && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex gap-2">
              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700 leading-relaxed">{module.architecture_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Compliance Tab ───────────────────────────────────────────────────────────

function ComplianceTab({
  metrics, violations,
}: {
  metrics: ArchitectureMetrics;
  violations: ArchitectureViolation[];
}) {
  const SCORES = [
    { key: 'compliance_score',           label: 'Architecture\nCompliance'   },
    { key: 'platform_reuse_score',       label: 'Platform\nReuse'            },
    { key: 'commercial_readiness_score', label: 'Commercial\nReadiness'      },
    { key: 'dependency_health_score',    label: 'Dependency\nHealth'         },
    { key: 'layer_separation_score',     label: 'Layer\nSeparation'          },
  ] as const;

  const SEV_CFG: Record<ArchitectureViolation['severity'], { bg: string; border: string; text: string; icon: typeof CheckCircle2 }> = {
    high:   { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    icon: AlertTriangle },
    medium: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  icon: AlertTriangle },
    low:    { bg: 'bg-slate-50',  border: 'border-slate-200',  text: 'text-slate-600',  icon: Info          },
  };

  const overallScore = Math.round(
    SCORES.reduce((acc, s) => acc + metrics[s.key], 0) / SCORES.length
  );

  return (
    <div className="space-y-6">
      {/* Overall score */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Platform Architecture Score</h3>
            <p className="text-xs text-slate-400 mt-0.5">Composite across 5 compliance dimensions</p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold ${SCORE_COLOR(overallScore)}`}>{overallScore}%</p>
            <p className="text-xs text-slate-400">Overall</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-around gap-4">
          {SCORES.map(s => (
            <ScoreRing key={s.key} value={metrics[s.key]} label={s.label.replace('\n', ' ')} size={90} />
          ))}
        </div>
      </div>

      {/* Score breakdown bars */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Score Breakdown</h3>
        <div className="space-y-3">
          {SCORES.map(s => (
            <div key={s.key}>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-slate-600">{s.label.replace('\n', ' ')}</span>
                <span className={`text-xs font-bold ${SCORE_COLOR(metrics[s.key])}`}>{metrics[s.key]}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${metrics[s.key]}%`, backgroundColor: SCORE_BAR(metrics[s.key]) }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Violations */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Architecture Violations</h3>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            violations.length === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {violations.length === 0 ? 'Clean' : `${violations.length} found`}
          </span>
        </div>
        {violations.length === 0 ? (
          <div className="flex items-center gap-2 py-4 justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <p className="text-sm text-emerald-600 font-medium">No architecture violations detected</p>
          </div>
        ) : (
          <div className="space-y-3">
            {violations.map((v, i) => {
              const cfg = SEV_CFG[v.severity];
              const Icon = cfg.icon;
              return (
                <div key={i} className={`rounded-lg border p-3 ${cfg.bg} ${cfg.border}`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${cfg.text}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${cfg.text} capitalize`}>
                        {v.type.replace(/_/g, ' ')} — {v.severity} severity
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">{v.description}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {v.affected_modules.map(m => (
                          <span key={m} className="text-[10px] font-mono bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dependencies Tab ─────────────────────────────────────────────────────────

function DependenciesTab({ graph }: { graph: DependencyNode[] }) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const selected = selectedSlug ? graph.find(n => n.slug === selectedSlug) : null;

  const sorted = [...graph].sort((a, b) => {
    if (a.layer !== b.layer) return a.layer - b.layer;
    return b.dependents.length - a.dependents.length;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Node list */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Dependency Graph</p>
        </div>
        <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
          {sorted.map(node => {
            const tCfg = TYPE_CFG[node.module_type];
            const TypeIcon = tCfg.icon;
            const isSelected = selectedSlug === node.slug;
            return (
              <button
                key={node.slug}
                onClick={() => setSelectedSlug(isSelected ? null : node.slug)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tCfg.bg} ${tCfg.border} border`}>
                  <TypeIcon className={`w-3.5 h-3.5 ${tCfg.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-800 truncate">{node.name}</p>
                    <span className="text-[9px] font-mono text-slate-400 shrink-0 hidden sm:block">{node.slug}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-slate-400">
                      {node.dependencies.length} dep{node.dependencies.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {node.dependents.length} used by
                    </span>
                    <span className={`text-[10px] font-medium ${tCfg.text}`}>{tCfg.label}</span>
                  </div>
                </div>
                {node.dependents.length >= 3 && (
                  <span className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0 hidden sm:block">
                    High Usage
                  </span>
                )}
                <ChevronRight className={`w-3.5 h-3.5 text-slate-300 shrink-0 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        {selected ? (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TYPE_CFG[selected.module_type].bg} ${TYPE_CFG[selected.module_type].text}`}>
                  {TYPE_CFG[selected.module_type].label}
                </span>
                <span className={`text-[10px] font-medium ${STATUS_CFG[selected.status].text}`}>
                  {STATUS_CFG[selected.status].label}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-900">{selected.name}</p>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">{selected.slug}</p>
            </div>

            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Depends On ({selected.dependencies.length})
              </p>
              {selected.dependencies.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No dependencies</p>
              ) : (
                <div className="space-y-1">
                  {selected.dependencies.map(dep => {
                    const node = graph.find(n => n.slug === dep);
                    return (
                      <button
                        key={dep}
                        onClick={() => setSelectedSlug(dep)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                      >
                        <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 truncate">{node?.name ?? dep}</p>
                          {node && <p className={`text-[9px] ${TYPE_CFG[node.module_type].text}`}>{TYPE_CFG[node.module_type].label}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Used By ({selected.dependents.length})
              </p>
              {selected.dependents.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No dependents</p>
              ) : (
                <div className="space-y-1">
                  {selected.dependents.map(dep => {
                    const node = graph.find(n => n.slug === dep);
                    return (
                      <button
                        key={dep}
                        onClick={() => setSelectedSlug(dep)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                      >
                        <ArrowRight className="w-3 h-3 text-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 truncate">{node?.name ?? dep}</p>
                          {node && <p className={`text-[9px] ${TYPE_CFG[node.module_type].text}`}>{TYPE_CFG[node.module_type].label}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Network className="w-8 h-8 text-slate-200 mb-2" />
            <p className="text-xs text-slate-400">Select a module to inspect its dependencies</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Plugins Tab ──────────────────────────────────────────────────────────────

function PluginsTab({ plugins }: { plugins: PluginRegistryEntry[] }) {
  const PTYPE_CFG = {
    product_plugin: { label: 'Product Plugin', bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700'  },
    integration:    { label: 'Integration',    bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-700'    },
    extension:      { label: 'Extension',      bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700'   },
  };
  const PSTATUS_CFG = {
    registered: { label: 'Registered', dot: 'bg-amber-400',   text: 'text-amber-700'  },
    active:     { label: 'Active',     dot: 'bg-emerald-500', text: 'text-emerald-700'},
    disabled:   { label: 'Disabled',   dot: 'bg-red-400',     text: 'text-red-600'    },
  };

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-blue-800">Plugin Framework — TP-018 Skeleton</p>
          <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
            The Plugin Manager skeleton is active. Full dynamic loading requires the Plugin SDK (planned in a future phase).
            Domain modules and future products register here to declare their module consumption and permissions.
          </p>
        </div>
      </div>

      {plugins.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center">
          <Puzzle className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">No plugins registered</p>
          <p className="text-xs text-slate-400 mt-1">Domain modules and future products will register here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plugins.map(plugin => {
            const ptCfg = PTYPE_CFG[plugin.plugin_type];
            const psCfg = PSTATUS_CFG[plugin.status];
            const meta = plugin.metadata as Record<string, string>;
            return (
              <div key={plugin.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ptCfg.bg} ${ptCfg.border} border`}>
                    <Puzzle className={`w-4.5 h-4.5 ${ptCfg.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900">{plugin.name}</p>
                      <span className="text-[10px] font-mono text-slate-400">{plugin.slug}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`flex items-center gap-1 text-[10px] font-medium ${psCfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${psCfg.dot}`} />{psCfg.label}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ptCfg.bg} ${ptCfg.text}`}>
                        {ptCfg.label}
                      </span>
                      {meta.version && <span className="text-[10px] text-slate-400">v{meta.version}</span>}
                    </div>
                    {meta.description && (
                      <p className="text-xs text-slate-500 mt-1.5">{meta.description}</p>
                    )}
                    {plugin.entry_point && (
                      <p className="text-[10px] font-mono text-slate-400 mt-1">{plugin.entry_point}</p>
                    )}
                  </div>
                </div>

                {(plugin.loaded_modules.length > 0 || plugin.permissions.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                    {plugin.loaded_modules.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Loaded Modules</p>
                        <div className="flex flex-wrap gap-1">
                          {plugin.loaded_modules.map(m => (
                            <span key={m} className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {plugin.permissions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Permissions</p>
                        <div className="flex flex-wrap gap-1">
                          {plugin.permissions.map(p => (
                            <span key={p} className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCModuleRegistryPage() {
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<ModuleRegistryEntry[]>([]);
  const [plugins, setPlugins] = useState<PluginRegistryEntry[]>([]);
  const [metrics, setMetrics] = useState<ArchitectureMetrics | null>(null);
  const [violations, setViolations] = useState<ArchitectureViolation[]>([]);
  const [depGraph, setDepGraph] = useState<DependencyNode[]>([]);

  const [activeTab, setActiveTab] = useState<ViewTab>('registry');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const report = await generateArchitectureReport();
    setModules(report.modules);
    setPlugins(report.plugins);
    setMetrics(report.metrics);
    setViolations(report.violations);
    setDepGraph(report.dependency_graph);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleRefresh() {
    setRefreshing(true);
    load();
  }

  function toggleExpanded(slug: string) {
    setExpandedSlugs(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const filteredModules = modules.filter(m => {
    if (filterType !== 'all' && m.module_type !== filterType) return false;
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.name.toLowerCase().includes(q) ||
             m.slug.toLowerCase().includes(q) ||
             (m.description ?? '').toLowerCase().includes(q) ||
             (m.phase_introduced ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  // Group by layer
  const byLayer = [1, 2, 3].map(layer => ({
    layer,
    label: LAYER_LABELS[layer] ?? `L${layer}`,
    items: filteredModules.filter(m => m.layer === layer),
  })).filter(g => g.items.length > 0);

  const TABS: { key: ViewTab; label: string; icon: typeof Layers }[] = [
    { key: 'registry',     label: 'Module Registry',    icon: Layers      },
    { key: 'compliance',   label: 'Architecture Score',  icon: BarChart3   },
    { key: 'dependencies', label: 'Dependency Graph',    icon: Network     },
    { key: 'plugins',      label: 'Plugin Framework',    icon: Puzzle      },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
          <p className="text-sm text-slate-400">Loading Module Registry…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900">ATD Module Registry</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                TP-018 — Platform Architecture & Modularisation Framework
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {metrics && (
              <div className="hidden sm:flex items-center gap-3 mr-2">
                <div className="text-right">
                  <p className={`text-lg font-bold ${SCORE_COLOR(metrics.compliance_score)}`}>
                    {metrics.compliance_score}%
                  </p>
                  <p className="text-[10px] text-slate-400">Compliance</p>
                </div>
                <div className="h-8 border-l border-slate-200" />
                <div className="text-right">
                  <p className={`text-lg font-bold ${SCORE_COLOR(metrics.commercial_readiness_score)}`}>
                    {metrics.commercial_readiness_score}%
                  </p>
                  <p className="text-[10px] text-slate-400">Commercial Ready</p>
                </div>
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI Row */}
        {metrics && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4">
            <MetricCard label="Total Modules" value={metrics.total_modules} />
            <MetricCard label="Core Platform" value={metrics.core_platform_count} color="text-blue-600" />
            <MetricCard label="Domain Modules" value={metrics.domain_module_count} color="text-amber-600" />
            <MetricCard label="Infrastructure" value={metrics.infrastructure_count} color="text-slate-600" />
            <MetricCard label="Reusable" value={metrics.reusable_count} sub="extractable" color="text-teal-600" />
            <MetricCard label="Violations" value={violations.length} color={violations.length === 0 ? 'text-emerald-600' : 'text-red-600'} sub={violations.length === 0 ? 'Clean' : 'Found'} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4 border-b border-slate-200 -mb-4 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-all ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'registry' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search modules…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                {(['all', 'core_platform', 'domain_module', 'infrastructure'] as FilterType[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterType(f)}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
                      filterType === f
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {f === 'all' ? 'All Types' : TYPE_CFG[f].label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                {(['all', 'active', 'planned', 'deprecated'] as FilterStatus[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterStatus(f)}
                    className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
                      filterStatus === f
                        ? 'bg-slate-700 text-white'
                        : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              <p className="text-xs text-slate-400 ml-auto">
                {filteredModules.length} of {modules.length} modules
              </p>
            </div>

            {/* Grouped module list */}
            {byLayer.map(group => (
              <div key={group.layer}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">
                    {group.label}
                  </span>
                  <span className="text-[10px] text-slate-400">{group.items.length} module{group.items.length !== 1 ? 's' : ''}</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="space-y-2">
                  {group.items.map(m => (
                    <ModuleCard
                      key={m.slug}
                      module={m}
                      expanded={expandedSlugs.has(m.slug)}
                      onToggle={() => toggleExpanded(m.slug)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {filteredModules.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center">
                <Search className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No modules match your filters</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'compliance' && metrics && (
          <ComplianceTab metrics={metrics} violations={violations} />
        )}

        {activeTab === 'dependencies' && (
          <DependenciesTab graph={depGraph} />
        )}

        {activeTab === 'plugins' && (
          <PluginsTab plugins={plugins} />
        )}
      </div>
    </div>
  );
}
