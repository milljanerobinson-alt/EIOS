import { useState, useEffect, useCallback } from 'react';
import {
  Lightbulb, Plus, RefreshCw, Search, Filter,
  CheckCircle2, Clock, ArrowUpRight, Shield, Brain,
  Zap, Tag, Package, Layers, ChevronRight, BarChart3,
  FileText, GitBranch, Circle, Star, Inbox, Archive,
  LayoutGrid, List, Sparkles, Activity, GitMerge, Link2, XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  type EngineeringIdea, type IdeaStatus, type IdeaCategory, type IdeaPriority,
  type WizardState,
  IDEA_STATUS_CFG, IDEA_PRIORITY_CFG, IDEA_CATEGORY_CFG, SIMILARITY_DECISION_CFG,
  type SimilarityDecision,
} from './ECCIdeaTypes';
import { ConstitutionalExecutionWizard } from './ECCConstitutionalExecutionWizard';
import {
  IdeaActionMenu, IdeaDetailDrawer, IdeaDeleteModal, IdeaPromotionModal,
  type IdeaAction, type DeleteEligibility, checkDeleteEligibility, promoteIdeaToEwo,
} from './ECCIdeaActions';

// ─── Sub-types ────────────────────────────────────────────────────────────────

type Tab = 'inbox' | 'drafts' | 'prioritised' | 'queue' | 'archive';
type ViewMode = 'grid' | 'list';

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: IdeaStatus }) {
  const cfg = IDEA_STATUS_CFG[status] ?? { label: status, bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </span>
  );
}

function PriorityDot({ priority }: { priority: IdeaPriority }) {
  const cfg = IDEA_PRIORITY_CFG[priority] ?? { label: priority, dot: 'bg-slate-400', text: 'text-slate-500' };
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${cfg.text}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: IdeaCategory }) {
  const cfg = IDEA_CATEGORY_CFG[category] ?? { label: category, colour: 'slate' };
  const colourMap: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-700',    cyan:    'bg-cyan-50 text-cyan-700',
    amber:  'bg-amber-50 text-amber-700',  indigo:  'bg-indigo-50 text-indigo-700',
    red:    'bg-red-50 text-red-700',      orange:  'bg-orange-50 text-orange-700',
    violet: 'bg-violet-50 text-violet-700',teal:   'bg-teal-50 text-teal-700',
    slate:  'bg-slate-50 text-slate-600',  purple: 'bg-purple-50 text-purple-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colourMap[cfg.colour] ?? colourMap.slate}`}>
      {cfg.label}
    </span>
  );
}

function SimilarityBadge({ decision, count }: { decision: SimilarityDecision | null; count: number }) {
  if (!decision && count === 0) return null;
  const ICONS: Record<SimilarityDecision, typeof Search> = {
    continue_anyway: Search,
    link_existing:   Link2,
    merge:           GitMerge,
    cancel:          XCircle,
  };
  const COLOURS: Record<SimilarityDecision, string> = {
    continue_anyway: 'bg-blue-50 text-blue-600',
    link_existing:   'bg-teal-50 text-teal-700',
    merge:           'bg-amber-50 text-amber-700',
    cancel:          'bg-red-50 text-red-700',
  };
  if (!decision) {
    return (
      <span className="flex items-center gap-1 text-xs bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded-full" title={`Similarity: ${count} matches`}>
        <Search className="w-2.5 h-2.5" />{count}
      </span>
    );
  }
  const Icon = ICONS[decision];
  const cfg  = SIMILARITY_DECISION_CFG[decision];
  return (
    <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${COLOURS[decision]}`} title={`Similarity: ${cfg.label} · ${count} match${count !== 1 ? 'es' : ''}`}>
      <Icon className="w-2.5 h-2.5" />
    </span>
  );
}

// ─── Idea Card (grid view) ────────────────────────────────────────────────────

function IdeaCard({ idea, onAction }: { idea: EngineeringIdea; onAction: (action: IdeaAction, idea: EngineeringIdea) => void }) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all group cursor-pointer"
      onClick={() => onAction('open', idea)}
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <p className="text-sm font-semibold text-slate-800 leading-tight group-hover:text-amber-700 transition-colors">{idea.title}</p>
            <IdeaActionMenu idea={idea} onAction={onAction} />
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{idea.idea_ref}</p>
        </div>
      </div>
      {idea.description && (
        <p className="text-xs text-slate-500 mb-2 line-clamp-2">{idea.description}</p>
      )}
      <div className="flex flex-wrap gap-1 mb-2">
        <CategoryBadge category={idea.category} />
        <StatusBadge status={idea.status} />
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
        <PriorityDot priority={idea.priority} />
        <div className="flex items-center gap-1.5">
          {idea.guardian_validated && (
            <span title="Guardian Validated">
              <Shield className="w-3 h-3 text-orange-500" />
            </span>
          )}
          {idea.session_id && (
            <span title="Created via execution session">
              <Zap className="w-3 h-3 text-blue-400" />
            </span>
          )}
          {idea.memory_search_performed && (
            <span title="Memory search performed">
              <Brain className="w-3 h-3 text-violet-400" />
            </span>
          )}
          <SimilarityBadge
            decision={(idea.similarity_decision as SimilarityDecision | null) ?? null}
            count={idea.similarity_matches_count ?? 0}
          />
          <span className="text-xs text-slate-400">{new Date(idea.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      {idea.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-50">
          {idea.tags.slice(0, 3).map(t => (
            <span key={t} className="text-xs bg-slate-50 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">#{t}</span>
          ))}
          {idea.tags.length > 3 && <span className="text-xs text-slate-400">+{idea.tags.length - 3}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Idea Row (list view) ─────────────────────────────────────────────────────

function IdeaRow({ idea, onAction }: { idea: EngineeringIdea; onAction: (action: IdeaAction, idea: EngineeringIdea) => void }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer"
      onClick={() => onAction('open', idea)}
    >
      <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-800 truncate group-hover:text-amber-700 transition-colors">{idea.title}</p>
          <CategoryBadge category={idea.category} />
          <StatusBadge status={idea.status} />
        </div>
        <p className="text-xs text-slate-400 mt-0.5 font-mono">{idea.idea_ref}</p>
      </div>
      <PriorityDot priority={idea.priority} />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {idea.guardian_validated && <Shield className="w-3 h-3 text-orange-400" title="Guardian Validated" />}
        {idea.session_id && <Zap className="w-3 h-3 text-blue-400" title="Execution Session" />}
        <SimilarityBadge
          decision={(idea.similarity_decision as SimilarityDecision | null) ?? null}
          count={idea.similarity_matches_count ?? 0}
        />
      </div>
      <span className="text-xs text-slate-400 flex-shrink-0">{new Date(idea.created_at).toLocaleDateString()}</span>
      <IdeaActionMenu idea={idea} onAction={onAction} />
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, sub, action }: {
  icon: typeof Lightbulb; title: string; sub: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-slate-300" />
      </div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="text-xs text-slate-400 mt-1 mb-3">{sub}</p>
      {action}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatBar({ ideas }: { ideas: EngineeringIdea[] }) {
  const total      = ideas.length;
  const active     = ideas.filter(i => i.status === 'active').length;
  const promoted   = ideas.filter(i => i.status === 'promoted').length;
  const queue      = ideas.filter(i => i.status === 'queued_for_promotion').length;
  const guardian   = ideas.filter(i => i.guardian_validated).length;
  const withSess   = ideas.filter(i => i.session_id).length;
  const simReviewed = ideas.filter(i => (i.similarity_matches_count ?? 0) > 0 || i.similarity_decision !== null).length;
  const linked     = ideas.filter(i => i.similarity_decision === 'link_existing').length;

  return (
    <div className="flex flex-wrap gap-3">
      {[
        { label: 'Total Ideas',        value: total,       colour: 'slate'   },
        { label: 'Active',             value: active,      colour: 'blue'    },
        { label: 'Queued — Promote',   value: queue,       colour: 'amber'   },
        { label: 'Promoted to EWO',    value: promoted,    colour: 'emerald' },
        { label: 'Guardian Validated', value: guardian,    colour: 'orange'  },
        { label: 'Via Execution',      value: withSess,    colour: 'violet'  },
        { label: 'Similarity Reviewed',value: simReviewed, colour: 'cyan'    },
        { label: 'Linked Objects',     value: linked,      colour: 'teal'    },
      ].map(({ label, value, colour }) => {
        const colourClass: Record<string, string> = {
          slate:   'text-slate-700 bg-slate-50 border-slate-200',
          blue:    'text-blue-700 bg-blue-50 border-blue-200',
          amber:   'text-amber-700 bg-amber-50 border-amber-200',
          emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
          orange:  'text-orange-700 bg-orange-50 border-orange-200',
          violet:  'text-violet-700 bg-violet-50 border-violet-200',
          cyan:    'text-cyan-700 bg-cyan-50 border-cyan-200',
          teal:    'text-teal-700 bg-teal-50 border-teal-200',
        };
        return (
          <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${colourClass[colour]}`}>
            <span className="font-bold text-base leading-none">{value}</span>
            <span className="font-medium">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── ATD Idea Capture Panel ───────────────────────────────────────────────────

function ATDCapture({ onLaunch }: { onLaunch: (prefill: { idea: { title: string; description: string } }) => void }) {
  const [input, setInput] = useState('');

  function handle() {
    if (!input.trim()) return;
    // ATD parses the idea text and pre-fills the wizard
    onLaunch({ idea: { title: input.trim(), description: '' } });
    setInput('');
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-slate-200">ATD Idea Capture</h3>
        <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full ml-auto">Phase 4</span>
      </div>
      <p className="text-xs text-slate-400 mb-3">Tell ATD your engineering idea. It will automatically populate the Constitutional Execution Wizard.</p>
      <div className="flex gap-2">
        <input
          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          placeholder="I've got an idea: …"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handle(); }}
        />
        <button
          onClick={handle}
          disabled={!input.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" /> Capture
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-2">ATD populates: Intent, Objective, Strategy, Context, Agent. You confirm and execute.</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ECCIdeaWorkspacePage() {
  const [ideas,         setIdeas]         = useState<EngineeringIdea[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState<Tab>('inbox');
  const [viewMode,      setViewMode]      = useState<ViewMode>('grid');
  const [search,        setSearch]        = useState('');
  const [showWizard,    setShowWizard]    = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<Partial<WizardState>>({});
  const [wizardEditIdea, setWizardEditIdea] = useState<EngineeringIdea | null>(null);
  const [lastCreated,   setLastCreated]   = useState<string | null>(null);
  const [drawerIdea,    setDrawerIdea]    = useState<EngineeringIdea | null>(null);
  const [deleteIdea,   setDeleteIdea]     = useState<EngineeringIdea | null>(null);
  const [promoteIdea,  setPromoteIdea]    = useState<EngineeringIdea | null>(null);
  const [toast,        setToast]          = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('engineering_idea')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setIdeas(data as EngineeringIdea[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleComplete(ideaRef: string, ideaId: string, ewoRef?: string) {
    setLastCreated(ideaRef);
    setShowWizard(false);
    setWizardEditIdea(null);
    load();
    if (ewoRef) setToast({ msg: `Idea ${ideaRef} promoted to ${ewoRef}`, kind: 'ok' });
  }

  function navigateToEwo(ewoRef: string) {
    window.location.hash = `#/engineering/work-orders/${ewoRef}`;
  }

  function navigateToIdea(ideaRef: string, _ideaId: string) {
    const idea = ideas.find(i => i.idea_ref === ideaRef);
    if (idea) setDrawerIdea(idea);
  }

  function navigateToConversation(ideaId: string) {
    window.location.hash = `#/engineering/mission-control?resumeIdea=${ideaId}`;
  }

  async function handleAction(action: IdeaAction, idea: EngineeringIdea) {
    switch (action) {
      case 'open':
        // EWO-033R.2: "View in Conversation" is now the primary action.
        // If the idea has been through the pipeline (has a proposal or EWO),
        // resume in conversation. Otherwise open the drawer for inspection.
        if (idea.status === 'promoted' || idea.status === 'queued_for_promotion') {
          navigateToConversation(idea.id);
        } else {
          setDrawerIdea(idea);
        }
        break;
      case 'continue': {
        setWizardEditIdea(idea);
        setWizardPrefill({
          idea: {
            title: idea.title,
            description: idea.description ?? '',
            category: idea.category,
            priority: idea.priority,
            tags: idea.tags ?? [],
            products: idea.products ?? [],
            applications: idea.applications ?? [],
          },
        });
        setShowWizard(true);
        break;
      }
      case 'queue': {
        const { error } = await supabase.from('engineering_idea').update({ status: 'queued_for_promotion' }).eq('id', idea.id);
        if (error) setToast({ msg: `Queue failed: ${error.message}`, kind: 'err' });
        else { setToast({ msg: `${idea.idea_ref} queued for promotion`, kind: 'ok' }); load(); }
        break;
      }
      case 'promote':
        setPromoteIdea(idea);
        break;
      case 'archive': {
        const { error } = await supabase.from('engineering_idea').update({ status: 'archived' }).eq('id', idea.id);
        if (error) setToast({ msg: `Archive failed: ${error.message}`, kind: 'err' });
        else { setToast({ msg: `${idea.idea_ref} archived`, kind: 'ok' }); load(); }
        break;
      }
      case 'restore': {
        const { error } = await supabase.from('engineering_idea').update({ status: 'active' }).eq('id', idea.id);
        if (error) setToast({ msg: `Restore failed: ${error.message}`, kind: 'err' });
        else { setToast({ msg: `${idea.idea_ref} restored`, kind: 'ok' }); load(); }
        break;
      }
      case 'delete':
        setDeleteIdea(idea);
        break;
      case 'view-ewo':
        if (idea.related_ewo_refs.length > 0) navigateToEwo(idea.related_ewo_refs[0]);
        break;
    }
  }

  async function handleDeleteConfirmed(reason: string, eligibility: DeleteEligibility) {
    if (!deleteIdea) return;
    if (eligibility.cascadeAvailable) {
      const { data, error } = await supabase.rpc('delete_engineering_graph_governed', {
        p_root_type: 'engineering_idea',
        p_root_id: deleteIdea.id,
        p_reason: reason,
      });
      if (error) throw new Error(error.message);
      const result = data as { success: boolean; error?: string; root_object_ref?: string; deleted_count?: number } | null;
      if (!result || !result.success) {
        throw new Error(result?.error ?? 'Governed cascade deletion failed for an unknown reason.');
      }
      setToast({ msg: `${deleteIdea.idea_ref} cascade deleted (${result.deleted_count ?? 0} objects)`, kind: 'ok' });
    } else {
      const { data, error } = await supabase.rpc('delete_engineering_idea_governed', {
        p_idea_id: deleteIdea.id,
        p_reason: reason,
      });
      if (error) throw new Error(error.message);
      const result = data as { success: boolean; error?: string; idea_ref?: string } | null;
      if (!result || !result.success) {
        throw new Error(result?.error ?? 'Governed deletion failed for an unknown reason.');
      }
      setToast({ msg: `${deleteIdea.idea_ref} deleted`, kind: 'ok' });
    }
    setDeleteIdea(null);
    load();
  }

  function launchWizard(prefill?: Partial<WizardState>) {
    setWizardPrefill(prefill ?? {});
    setShowWizard(true);
  }

  // Filter helpers
  const filtered = ideas.filter(idea => {
    const matchSearch = !search || idea.title.toLowerCase().includes(search.toLowerCase()) ||
      idea.description?.toLowerCase().includes(search.toLowerCase()) ||
      idea.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    return matchSearch;
  });

  const BY_TAB: Record<Tab, EngineeringIdea[]> = {
    inbox:       filtered,
    drafts:      filtered.filter(i => i.status === 'draft'),
    prioritised: [...filtered].sort((a, b) => {
      const ORDER: IdeaPriority[] = ['critical','high','medium','low'];
      return ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority);
    }),
    queue:       filtered.filter(i => i.status === 'queued_for_promotion'),
    archive:     filtered.filter(i => i.status === 'archived' || i.status === 'superseded'),
  };

  const displayed = BY_TAB[activeTab];

  const TABS: { key: Tab; label: string; icon: typeof Lightbulb; count?: number }[] = [
    { key: 'inbox',       label: 'Inbox',           icon: Inbox,     count: filtered.length },
    { key: 'drafts',      label: 'Drafts',          icon: FileText,  count: BY_TAB.drafts.length },
    { key: 'prioritised', label: 'Prioritised',      icon: Star,      count: filtered.length },
    { key: 'queue',       label: 'Queue — Promote',  icon: ArrowUpRight, count: BY_TAB.queue.length },
    { key: 'archive',     label: 'Archive',          icon: Archive,   count: BY_TAB.archive.length },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200">
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-lg font-bold text-slate-800">Engineering Ideas</h1>
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">EWO-011</span>
              </div>
              <p className="text-xs text-slate-500">First-class constitutional engineering objects — every idea created via execution pipeline.</p>
            </div>
            <div className="flex items-center gap-2 pb-3">
              <button
                onClick={load}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => launchWizard()}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Create Idea
              </button>
            </div>
          </div>

          {/* Last created banner */}
          {lastCreated && (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-emerald-700 font-medium">Idea created: <span className="font-mono font-bold">{lastCreated}</span></span>
              </div>
              <button onClick={() => setLastCreated(null)} className="text-emerald-500 hover:text-emerald-700 text-xs">dismiss</button>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex gap-0 -mb-px">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === t.key
                    ? 'border-amber-500 text-amber-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="ml-0.5 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-5">
          {/* ATD Capture */}
          <ATDCapture onLaunch={prefill => launchWizard({ idea: prefill.idea })} />

          {/* Stats */}
          {ideas.length > 0 && <StatBar ideas={ideas} />}

          {/* Search + view toggle */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
                placeholder="Search ideas…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Ideas grid / list */}
          {loading && ideas.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading ideas…
              </div>
            </div>
          ) : displayed.length === 0 ? (
            <EmptyState
              icon={Lightbulb}
              title={activeTab === 'inbox' ? 'No engineering ideas yet' : 'Nothing in this view'}
              sub={activeTab === 'inbox'
                ? 'Create the first engineering idea using the Constitutional Execution Wizard.'
                : 'Ideas will appear here as their status changes.'}
              action={activeTab === 'inbox' ? (
                <button
                  onClick={() => launchWizard()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Create First Idea
                </button>
              ) : undefined}
            />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayed.map(idea => <IdeaCard key={idea.id} idea={idea} onAction={handleAction} />)}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-50">
              {displayed.map(idea => <IdeaRow key={idea.id} idea={idea} onAction={handleAction} />)}
            </div>
          )}

          {/* Architecture Map */}
          <div className="bg-slate-900 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-200">EWO-011.1 Constitutional Execution Flow</h3>
              <span className="text-xs text-slate-500 ml-auto">With mandatory Similarity Review</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { label: 'Intent',           colour: 'blue'    },
                { label: '→',               colour: 'none'    },
                { label: 'Objective',         colour: 'cyan'    },
                { label: '→',               colour: 'none'    },
                { label: 'Strategy',          colour: 'violet'  },
                { label: '→',               colour: 'none'    },
                { label: 'Review',            colour: 'indigo'  },
                { label: '→',               colour: 'none'    },
                { label: 'Similarity Review', colour: 'rose'    },
                { label: '→',               colour: 'none'    },
                { label: 'Session',           colour: 'indigo'  },
                { label: '→',               colour: 'none'    },
                { label: 'Memory (Pre)',       colour: 'teal'    },
                { label: '→',               colour: 'none'    },
                { label: 'Idea',              colour: 'amber'   },
                { label: '→',               colour: 'none'    },
                { label: 'Evidence',          colour: 'emerald' },
                { label: '→',               colour: 'none'    },
                { label: 'Memory (Post)',      colour: 'teal'    },
              ].map(({ label, colour }, i) => {
                if (colour === 'none') return <span key={i} className="text-slate-600 text-xs">→</span>;
                const bgMap: Record<string, string> = {
                  blue:    'bg-blue-500/15 text-blue-300',    cyan:    'bg-cyan-500/15 text-cyan-300',
                  violet:  'bg-violet-500/15 text-violet-300',indigo:  'bg-indigo-500/15 text-indigo-300',
                  teal:    'bg-teal-500/15 text-teal-300',    amber:   'bg-amber-500/15 text-amber-300',
                  emerald: 'bg-emerald-500/15 text-emerald-300',slate: 'bg-slate-700 text-slate-300',
                  rose:    'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30',
                };
                return (
                  <span key={i} className={`text-xs px-2 py-0.5 rounded font-medium ${bgMap[colour] ?? bgMap.slate}`}>
                    {label}
                  </span>
                );
              })}
            </div>
            <div className="grid grid-cols-4 gap-3 mt-4">
              {[
                { label: 'Guardian Authority',    value: 'Agent → Guardian',    sub: 'No PO required for ideas',     ok: true },
                { label: 'Memory Integration',    value: 'Pre + Post',           sub: 'Records + Knowledge updated',  ok: true },
                { label: 'Similarity Review',     value: '7 Object Types',       sub: 'Duplicate prevention gate',    ok: true },
                { label: 'Evidence Generated',    value: 'Guardian + Sim + Art', sub: '3 pieces per execution',       ok: true },
              ].map(({ label, value, sub, ok }) => (
                <div key={label} className="bg-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-slate-400">{label}</p>
                    <span className={`text-xs font-bold ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>{ok ? 'LIVE' : 'PENDING'}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-200">{value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Wizard Modal */}
      {showWizard && (
        <ConstitutionalExecutionWizard
          onClose={() => { setShowWizard(false); setWizardEditIdea(null); }}
          onComplete={handleComplete}
          prefill={wizardPrefill as Parameters<typeof ConstitutionalExecutionWizard>[0]['prefill']}
          onNavigateToIdea={navigateToIdea}
          editIdeaId={wizardEditIdea?.id}
          editIdeaRef={wizardEditIdea?.idea_ref}
        />
      )}

      {/* Detail Drawer */}
      <IdeaDetailDrawer
        idea={drawerIdea}
        onClose={() => setDrawerIdea(null)}
        onNavigateToEwo={navigateToEwo}
        onContinueWizard={() => {
          if (drawerIdea) {
            setWizardEditIdea(drawerIdea);
            setWizardPrefill({
              idea: {
                title: drawerIdea.title,
                description: drawerIdea.description ?? '',
                category: drawerIdea.category,
                priority: drawerIdea.priority,
                tags: drawerIdea.tags ?? [],
                products: drawerIdea.products ?? [],
                applications: drawerIdea.applications ?? [],
              },
            });
            setShowWizard(true);
            setDrawerIdea(null);
          }
        }}
        onPromote={() => {
          if (drawerIdea) {
            setPromoteIdea(drawerIdea);
            setDrawerIdea(null);
          }
        }}
      />

      {/* Delete Confirmation */}
      {deleteIdea && (
        <IdeaDeleteModal
          idea={deleteIdea}
          onClose={() => setDeleteIdea(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}

      {/* Promotion Progress */}
      <IdeaPromotionModal
        idea={promoteIdea}
        onClose={() => setPromoteIdea(null)}
        onComplete={() => load()}
      />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl ${toast.kind === 'ok' ? 'bg-emerald-600' : 'bg-red-600'} text-white text-xs font-medium`}>
          {toast.kind === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">dismiss</button>
        </div>
      )}
    </div>
  );
}
