import { useState, useEffect } from 'react';
import {
  BookOpen, ChevronRight, Shield, Layers, Navigation, Lock,
  Settings, Cpu, GitBranch, Zap, Archive, AlertTriangle,
  Lightbulb, Map, CheckCircle2, FileText, Building2, Clock,
  ArrowRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConstitutionalSection {
  order: number;
  title: string;
  content: string;
  [key: string]: unknown;
}

interface ConstitutionalDocument {
  id: string;
  document_ref: string;
  title: string;
  document_type: string;
  version: string;
  status: string;
  programme: string;
  effective_from: string;
  authored_by: string;
  sections: Record<string, ConstitutionalSection>;
  metadata: Record<string, unknown>;
}

// ─── Section Icon Map ─────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, React.ElementType> = {
  executive_summary: BookOpen,
  product_hierarchy: Layers,
  workspace_architecture: Building2,
  navigation_architecture: Navigation,
  access_architecture: Lock,
  settings_ownership: Settings,
  shared_platform_services: Cpu,
  engineering_lifecycle: GitBranch,
  engineering_automation: Zap,
  records_library_architecture: Archive,
  event_automation_framework: ArrowRight,
  constitutional_decisions: Shield,
  risks: AlertTriangle,
  recommendations: Lightbulb,
  implementation_roadmap: Map,
};

const SECTION_COLOURS: Record<string, string> = {
  executive_summary: 'blue',
  product_hierarchy: 'indigo',
  workspace_architecture: 'violet',
  navigation_architecture: 'purple',
  access_architecture: 'red',
  settings_ownership: 'orange',
  shared_platform_services: 'cyan',
  engineering_lifecycle: 'emerald',
  engineering_automation: 'yellow',
  records_library_architecture: 'slate',
  event_automation_framework: 'teal',
  constitutional_decisions: 'rose',
  risks: 'amber',
  recommendations: 'green',
  implementation_roadmap: 'sky',
};

function colourClass(colour: string, variant: 'bg' | 'text' | 'border', shade: number): string {
  return `${variant}-${colour}-${shade}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    ratified: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    draft: 'bg-amber-100 text-amber-700 border-amber-200',
    superseded: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg[status] ?? cfg.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function DecisionCard({ d }: { d: Record<string, string> }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 text-xs font-mono font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded px-2 py-0.5 mt-0.5">
          {d.id}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-800">{d.decision}</p>
          <p className="text-xs text-slate-500 mt-1">{d.rationale}</p>
        </div>
      </div>
    </div>
  );
}

function RiskCard({ r }: { r: Record<string, string> }) {
  const sev: Record<string, string> = {
    high: 'bg-red-50 border-red-200 text-red-700',
    medium: 'bg-amber-50 border-amber-200 text-amber-700',
    low: 'bg-blue-50 border-blue-200 text-blue-700',
  };
  return (
    <div className={`border rounded-lg p-4 ${sev[r.severity] ?? sev.medium}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs font-mono font-bold">{r.id}</span>
        <span className="text-xs font-semibold capitalize px-2 py-0.5 rounded-full bg-white/60 border">
          {r.severity}
        </span>
      </div>
      <p className="text-sm font-semibold">{r.risk}</p>
      <p className="text-xs mt-1 opacity-80">{r.mitigation}</p>
    </div>
  );
}

function PhaseRow({ p }: { p: Record<string, unknown> }) {
  const status = p.status as string;
  const statusCfg: Record<string, { dot: string; label: string }> = {
    complete: { dot: 'bg-emerald-500', label: 'text-emerald-700' },
    planned: { dot: 'bg-amber-400', label: 'text-amber-700' },
    in_progress: { dot: 'bg-blue-500', label: 'text-blue-700' },
  };
  const cfg = statusCfg[status] ?? statusCfg.planned;
  const deliverables = p.deliverables as string[] ?? [];
  return (
    <div className="flex gap-4 py-4 border-b border-slate-100 last:border-0">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
        {p.phase as number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-800">{p.name as string}</span>
          <span className={`flex items-center gap-1 text-xs font-medium ${cfg.label}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {status.replace('_', ' ')}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {deliverables.map((d, i) => (
            <span key={i} className="text-xs bg-slate-100 text-slate-600 rounded px-2 py-0.5">{d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductCard({ p }: { p: Record<string, string> }) {
  const colours: Record<string, string> = {
    'PLATFORM-CORE': 'bg-slate-50 border-slate-200',
    'ATD': 'bg-blue-50 border-blue-200',
    'LLND': 'bg-emerald-50 border-emerald-200',
    'EIOS': 'bg-violet-50 border-violet-200',
  };
  return (
    <div className={`border rounded-lg p-4 ${colours[p.ref] ?? 'bg-slate-50 border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-mono font-bold text-slate-500">{p.ref}</span>
      </div>
      <p className="text-sm font-semibold text-slate-800 mb-1">{p.name}</p>
      <p className="text-xs text-slate-500">{p.description}</p>
      <p className="text-xs text-slate-400 mt-2">Owner: {p.owner}</p>
    </div>
  );
}

// ─── Section Renderer ─────────────────────────────────────────────────────────

function SectionContent({ sectionKey, section }: { sectionKey: string; section: ConstitutionalSection }) {
  const colour = SECTION_COLOURS[sectionKey] ?? 'slate';

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700 leading-relaxed">{section.content}</p>

      {/* key_principles */}
      {Array.isArray(section.key_principles) && (
        <div className={`bg-${colour}-50 border border-${colour}-100 rounded-lg p-4`}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Key Principles</p>
          <ul className="space-y-2">
            {(section.key_principles as string[]).map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <CheckCircle2 size={14} className={`text-${colour}-500 flex-shrink-0 mt-0.5`} />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* products */}
      {Array.isArray(section.products) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(section.products as Record<string, string>[]).map((p, i) => <ProductCard key={i} p={p} />)}
        </div>
      )}

      {/* isolation_model */}
      {section.isolation_model && typeof section.isolation_model === 'object' && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          {Object.entries(section.isolation_model as Record<string, string>).map(([k, v]) => (
            <div key={k} className="flex border-b border-slate-100 last:border-0">
              <div className="w-48 flex-shrink-0 px-4 py-3 bg-slate-50 border-r border-slate-100">
                <span className="text-xs font-mono text-slate-500">{k}</span>
              </div>
              <div className="px-4 py-3">
                <span className="text-xs text-slate-700 font-mono">{v}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* rpc_security_model */}
      {section.rpc_security_model && typeof section.rpc_security_model === 'object' && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          {Object.entries(section.rpc_security_model as Record<string, string>).map(([k, v]) => (
            <div key={k} className="flex border-b border-slate-100 last:border-0">
              <div className="w-40 flex-shrink-0 px-4 py-3 bg-rose-50 border-r border-slate-100">
                <span className="text-xs font-semibold text-rose-700">{k.replace(/_/g, ' ')}</span>
              </div>
              <div className="px-4 py-3">
                <span className="text-xs text-slate-700">{v}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ownership_scopes */}
      {Array.isArray(section.ownership_scopes) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(section.ownership_scopes as Record<string, string>[]).map((s, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{s.scope}</p>
              <p className="text-sm font-semibold text-slate-800 mb-1">{s.owner}</p>
              <p className="text-xs text-slate-500">{s.location}</p>
            </div>
          ))}
        </div>
      )}

      {/* services list */}
      {Array.isArray(section.services) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(section.services as string[]).map((s, i) => (
            <div key={i} className="flex items-center gap-2 bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2.5">
              <Cpu size={13} className="text-cyan-500 flex-shrink-0" />
              <span className="text-xs font-medium text-slate-700">{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* lifecycle statuses */}
      {(section.intent_statuses || section.plan_statuses || section.ewo_statuses) && (
        <div className="space-y-3">
          {section.intent_statuses && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Intent Statuses</p>
              <div className="flex flex-wrap gap-1.5">
                {(section.intent_statuses as string[]).map((s, i) => (
                  <span key={i} className="text-xs bg-blue-100 text-blue-700 rounded-full px-3 py-1 font-mono">{s}</span>
                ))}
              </div>
            </div>
          )}
          {section.plan_statuses && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Plan Statuses</p>
              <div className="flex flex-wrap gap-1.5">
                {(section.plan_statuses as string[]).map((s, i) => (
                  <span key={i} className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 font-mono">{s}</span>
                ))}
              </div>
            </div>
          )}
          {section.ewo_statuses && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">EWO Statuses</p>
              <div className="flex flex-wrap gap-1.5">
                {(section.ewo_statuses as string[]).map((s, i) => (
                  <span key={i} className="text-xs bg-amber-100 text-amber-700 rounded-full px-3 py-1 font-mono">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* trigger_events / action_types / pipeline_stages */}
      {(section.trigger_events || section.action_types || section.pipeline_stages) && (
        <div className="space-y-3">
          {section.trigger_events && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Trigger Events</p>
              <div className="flex flex-wrap gap-1.5">
                {(section.trigger_events as string[]).map((e, i) => (
                  <span key={i} className="text-xs bg-yellow-100 text-yellow-800 rounded-full px-3 py-1 font-mono">{e}</span>
                ))}
              </div>
            </div>
          )}
          {section.action_types && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Action Types</p>
              <div className="flex flex-wrap gap-1.5">
                {(section.action_types as string[]).map((a, i) => (
                  <span key={i} className="text-xs bg-teal-100 text-teal-700 rounded-full px-3 py-1 font-mono">{a}</span>
                ))}
              </div>
            </div>
          )}
          {section.pipeline_stages && (
            <div className="flex flex-wrap items-center gap-1">
              {(section.pipeline_stages as string[]).map((s, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-xs bg-teal-100 text-teal-700 rounded-full px-3 py-1 font-mono">{s}</span>
                  {i < arr.length - 1 && <ArrowRight size={12} className="text-slate-400" />}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* record_types + immutability */}
      {section.record_types && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(section.record_types as string[]).map((r, i) => (
              <span key={i} className="text-xs bg-slate-100 text-slate-600 rounded-full px-3 py-1 font-mono">{r}</span>
            ))}
          </div>
          {section.immutability_guarantee && (
            <div className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs font-mono">
              {section.immutability_guarantee as string}
            </div>
          )}
        </div>
      )}

      {/* ecc_sections */}
      {Array.isArray(section.ecc_sections) && (
        <div className="flex flex-wrap gap-1.5">
          {(section.ecc_sections as string[]).map((s, i) => (
            <span key={i} className="text-xs bg-purple-100 text-purple-700 rounded-full px-3 py-1 font-mono">{s}</span>
          ))}
        </div>
      )}

      {/* constitutional decisions */}
      {Array.isArray(section.decisions) && (
        <div className="space-y-2">
          {(section.decisions as Record<string, string>[]).map((d, i) => <DecisionCard key={i} d={d} />)}
        </div>
      )}

      {/* risks */}
      {Array.isArray(section.risks) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(section.risks as Record<string, string>[]).map((r, i) => <RiskCard key={i} r={r} />)}
        </div>
      )}

      {/* recommendations list */}
      {Array.isArray(section.recommendations) && (
        <ul className="space-y-2">
          {(section.recommendations as string[]).map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <Lightbulb size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
              {r}
            </li>
          ))}
        </ul>
      )}

      {/* implementation phases */}
      {Array.isArray(section.phases) && (
        <div className="divide-y divide-slate-100">
          {(section.phases as Record<string, unknown>[]).map((p, i) => <PhaseRow key={i} p={p} />)}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ECCConstitutionPage() {
  const [document, setDocument] = useState<ConstitutionalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('executive_summary');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ executive_summary: true });

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from('constitutional_documents')
        .select('*')
        .eq('document_ref', 'CONST-001')
        .maybeSingle();
      if (err) { setError(err.message); }
      else if (data) { setDocument(data as ConstitutionalDocument); }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading constitutional document…</p>
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <FileText size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">Constitutional document not found</p>
          <p className="text-xs text-slate-400 mt-1">{error ?? 'CONST-001 has not been loaded yet.'}</p>
        </div>
      </div>
    );
  }

  const sections = document.sections ?? {};
  const orderedKeys = Object.keys(sections).sort(
    (a, b) => (sections[a]?.order ?? 0) - (sections[b]?.order ?? 0)
  );

  function toggleSection(key: string) {
    setActiveSection(key);
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Sidebar nav ── */}
      <div className="w-64 flex-shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto">
        {/* Document header */}
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-rose-600 flex items-center justify-center">
              <Shield size={14} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-mono font-bold text-rose-600">CONST-001</p>
              <StatusBadge status={document.status} />
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-700 leading-tight mt-2">{document.title}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
            <Clock size={11} />
            <span>v{document.version} · {new Date(document.effective_from).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Section list */}
        <nav className="p-2">
          {orderedKeys.map(key => {
            const sec = sections[key];
            const Icon = SECTION_ICONS[key] ?? FileText;
            const isActive = activeSection === key;
            return (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all mb-0.5 ${
                  isActive
                    ? 'bg-white shadow-sm border border-slate-200 text-slate-900'
                    : 'text-slate-600 hover:bg-white hover:text-slate-800'
                }`}
              >
                <Icon size={13} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                <span className="text-xs font-medium truncate">{sec.title}</span>
                {isActive && <ChevronRight size={11} className="ml-auto text-blue-400 flex-shrink-0" />}
              </button>
            );
          })}
        </nav>

        {/* Metadata footer */}
        <div className="p-4 border-t border-slate-200 mt-2">
          <div className="space-y-2 text-xs text-slate-500">
            <div className="flex justify-between">
              <span>Programme</span>
              <span className="font-medium text-slate-700">{document.programme}</span>
            </div>
            <div className="flex justify-between">
              <span>Authored by</span>
              <span className="font-medium text-slate-700">{document.authored_by}</span>
            </div>
            <div className="flex justify-between">
              <span>Sections</span>
              <span className="font-medium text-slate-700">{orderedKeys.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto">
        {/* Page header */}
        <div className="border-b border-slate-200 bg-white px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-slate-400">{document.document_ref}</span>
                <span className="text-slate-300">·</span>
                <StatusBadge status={document.status} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">{document.title}</h1>
              <p className="text-sm text-slate-500 mt-1">
                Constitutional architecture document governing all ATD platform products
              </p>
            </div>
            <div className="text-right text-xs text-slate-400">
              <p>Effective {new Date(document.effective_from).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p className="mt-0.5">Version {document.version}</p>
            </div>
          </div>

          {/* Governed products */}
          {Array.isArray(document.metadata?.governed_products) && (
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs text-slate-400">Governs:</span>
              {(document.metadata.governed_products as string[]).map((p, i) => (
                <span key={i} className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 font-medium">{p}</span>
              ))}
            </div>
          )}
        </div>

        {/* Section content */}
        <div className="px-8 py-6 space-y-4">
          {orderedKeys.map(key => {
            const sec = sections[key];
            const Icon = SECTION_ICONS[key] ?? FileText;
            const isActive = activeSection === key;
            const isOpen = expanded[key] ?? isActive;

            return (
              <div
                key={key}
                id={`section-${key}`}
                className={`border rounded-xl overflow-hidden transition-all ${
                  isActive ? 'border-blue-200 shadow-sm' : 'border-slate-200'
                }`}
              >
                <button
                  className={`w-full flex items-center gap-3 px-6 py-4 text-left transition-colors ${
                    isActive ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => toggleSection(key)}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isActive ? 'bg-blue-600' : 'bg-slate-100'
                  }`}>
                    <Icon size={15} className={isActive ? 'text-white' : 'text-slate-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">{sec.order.toString().padStart(2, '0')}</span>
                      <span className={`text-sm font-semibold ${isActive ? 'text-blue-900' : 'text-slate-800'}`}>
                        {sec.title}
                      </span>
                    </div>
                  </div>
                  {isOpen
                    ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0" />
                    : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
                  }
                </button>

                {isOpen && (
                  <div className="px-6 py-5 bg-white border-t border-slate-100">
                    <SectionContent sectionKey={key} section={sec} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Amendment notice */}
        <div className="mx-8 mb-8 bg-rose-50 border border-rose-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Shield size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-rose-800">Constitutional Amendment Procedure</p>
              <p className="text-xs text-rose-700 mt-1">
                {document.metadata?.amendment_procedure as string ??
                  'Requires a new CONST document superseding this one, ratified via the engineering governance process.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
