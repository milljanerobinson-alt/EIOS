import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, Server, Monitor, Shield, Zap, CheckSquare,
  FileText, Brain, Code2, Package, Activity, Database,
  Search, X, Plus, ChevronRight, BookOpen, GitBranch,
  Clock, Tag, Check, AlertCircle, Loader2, Edit2, ChevronDown,
  History, RefreshCw, Scale, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type StandardStatus = 'active' | 'draft' | 'deprecated';

interface Standard {
  id: string;
  version_introduced: string;
  category: string;
  title: string;
  body: string;
  status: StandardStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface StandardsVersion {
  id: string;
  version_number: string;
  released_at: string;
  summary: string;
  status: 'current' | 'archived' | 'draft';
  created_at: string;
}

interface ChangelogEntry {
  id: string;
  version_number: string;
  change_type: 'added' | 'modified' | 'deprecated' | 'removed';
  description: string;
  affected_category: string | null;
  standard_title: string | null;
  created_at: string;
}

// ─── Reconciliation Diagnostics ──────────────────────────────────────────────

interface ReconciliationResult {
  reconciled: boolean;
  ledger_count: number;
  filtered_count: number;
  rendered_count: number;
  missing_standards: Array<{ id: string; title: string; reason: string }>;
}

// ─── Category Config ──────────────────────────────────────────────────────────

const CATEGORY_CFG: Record<string, {
  bg: string; border: string; text: string; dot: string; Icon: typeof Building2;
}> = {
  'Architecture':         { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    dot: 'bg-blue-500',    Icon: Building2  },
  'Database':             { bg: 'bg-slate-100',  border: 'border-slate-200',   text: 'text-slate-700',   dot: 'bg-slate-500',   Icon: Database   },
  'Backend':              { bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-700',    dot: 'bg-cyan-500',    Icon: Server     },
  'Frontend':             { bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-700',     dot: 'bg-sky-500',     Icon: Monitor    },
  'Security':             { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     dot: 'bg-red-500',     Icon: Shield     },
  'Performance':          { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-500',   Icon: Zap        },
  'Testing':              { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', Icon: CheckSquare },
  'Documentation':        { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',  dot: 'bg-orange-500',  Icon: FileText   },
  'AI Collaboration':     { bg: 'bg-teal-50',    border: 'border-teal-200',    text: 'text-teal-700',    dot: 'bg-teal-500',    Icon: Brain      },
  'Code Quality':         { bg: 'bg-lime-50',    border: 'border-lime-200',    text: 'text-lime-700',    dot: 'bg-lime-500',    Icon: Code2      },
  'Release Management':   { bg: 'bg-green-50',   border: 'border-green-200',   text: 'text-green-700',   dot: 'bg-green-500',   Icon: Package    },
  'Operations':           { bg: 'bg-zinc-100',   border: 'border-zinc-200',    text: 'text-zinc-700',    dot: 'bg-zinc-500',    Icon: Activity   },
  'Engineering Governance': { bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-700',  dot: 'bg-indigo-500',  Icon: Scale      },
  'Governance':           { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  dot: 'bg-violet-500',  Icon: Scale      },
};

const PREDEFINED_CATEGORIES = Object.keys(CATEGORY_CFG);

function getCategoryCfg(category: string) {
  return CATEGORY_CFG[category] ?? {
    bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-700',
    dot: 'bg-slate-500', Icon: BookOpen,
  };
}

const CHANGE_TYPE_CFG: Record<string, { label: string; bg: string; text: string }> = {
  added:      { label: 'Added',      bg: 'bg-emerald-100', text: 'text-emerald-700' },
  modified:   { label: 'Modified',   bg: 'bg-blue-100',    text: 'text-blue-700'    },
  deprecated: { label: 'Deprecated', bg: 'bg-amber-100',   text: 'text-amber-700'   },
  removed:    { label: 'Removed',    bg: 'bg-red-100',     text: 'text-red-700'     },
};

const VERSION_STATUS_CFG: Record<string, { bg: string; text: string; label: string }> = {
  current:  { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Current'  },
  archived: { bg: 'bg-slate-100',   text: 'text-slate-600',   label: 'Archived' },
  draft:    { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Draft'    },
};

const STATUS_CFG: Record<StandardStatus, { bg: string; text: string; label: string }> = {
  active:     { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Active'     },
  draft:      { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Draft'      },
  deprecated: { bg: 'bg-slate-100',   text: 'text-slate-500',   label: 'Deprecated' },
};

// ─── Standard Drawer ──────────────────────────────────────────────────────────

interface DrawerProps {
  standard: Standard | null;
  onClose: () => void;
  onSave: () => void;
  currentVersion: string;
}

function StandardDrawer({ standard, onClose, onSave, currentVersion }: DrawerProps) {
  const [title,    setTitle]    = useState(standard?.title    ?? '');
  const [category, setCategory] = useState(standard?.category ?? PREDEFINED_CATEGORIES[0]);
  const [body,     setBody]     = useState(standard?.body     ?? '');
  const [status,   setStatus]   = useState<StandardStatus>(standard?.status ?? 'draft');
  const [tagInput, setTagInput] = useState('');
  const [tags,     setTags]     = useState<string[]>(standard?.tags ?? []);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const isEdit = !!standard;

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  }

  async function handleSave() {
    if (!title.trim() || !body.trim()) { setError('Title and body are required.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        const { error: err } = await supabase
          .from('ecc_engineering_standards')
          .update({ title: title.trim(), category, body: body.trim(), status, tags })
          .eq('id', standard.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('ecc_engineering_standards')
          .insert({ version_introduced: currentVersion, title: title.trim(), category, body: body.trim(), status, tags });
        if (err) throw err;
      }
      onSave();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[480px] bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{isEdit ? 'Edit Standard' : 'New Standard'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{isEdit ? `Editing ${standard.category} standard` : `Adding to v${currentVersion}`}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Always use parameterised queries"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Category</label>
            <div className="relative">
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 appearance-none bg-white"
              >
                {PREDEFINED_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Status</label>
            <div className="flex gap-2">
              {(['active', 'draft', 'deprecated'] as StandardStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${
                    status === s
                      ? `${STATUS_CFG[s].bg} ${STATUS_CFG[s].text} border-transparent`
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {STATUS_CFG[s].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Standard Body</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={7}
              placeholder="Describe the standard in full..."
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Tags</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-600">
                  <Tag className="w-3 h-3" />
                  {t}
                  <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add a tag..."
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
              <button onClick={addTag} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 transition-colors">
                Add
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Standard'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({
  category, count, onSelect,
}: { category: string; count: number; onSelect: () => void }) {
  const cfg = getCategoryCfg(category);
  const Icon = cfg.Icon;
  return (
    <button
      onClick={onSelect}
      className={`${cfg.bg} ${cfg.border} border rounded-xl p-4 text-left hover:shadow-sm transition-all group`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg}`}>
          <Icon className={`w-4 h-4 ${cfg.text}`} />
        </div>
        <ChevronRight className={`w-4 h-4 ${cfg.text} opacity-0 group-hover:opacity-100 transition-opacity`} />
      </div>
      <p className={`text-sm font-semibold ${cfg.text}`}>{category}</p>
      <p className="text-xs text-slate-500 mt-0.5">{count} standard{count !== 1 ? 's' : ''}</p>
    </button>
  );
}

// ─── Standard Row ─────────────────────────────────────────────────────────────

function StandardRow({
  std, onEdit,
}: { std: Standard; onEdit: (s: Standard) => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg  = getCategoryCfg(std.category);
  const scfg = STATUS_CFG[std.status];

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        <span className="flex-1 text-sm font-medium text-slate-900 truncate">{std.title}</span>
        <span className="text-[10px] font-mono text-slate-400 shrink-0">{std.version_introduced}</span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${scfg.bg} ${scfg.text} shrink-0`}>
          {scfg.label}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onEdit(std); }}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
        >
          <Edit2 className="w-3.5 h-3.5 text-slate-400" />
        </button>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/40">
          <p className="text-sm text-slate-700 leading-relaxed mt-3 whitespace-pre-line">{std.body}</p>
          {std.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {std.tags.map(t => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded text-xs text-slate-500">
                  <Tag className="w-3 h-3" />
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Reconciliation Banner ────────────────────────────────────────────────────

function ReconciliationBanner({ reconciliation }: { reconciliation: ReconciliationResult | null }) {
  if (!reconciliation || reconciliation.reconciled) return null;

  return (
    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-800">
            Reconciliation Warning — {reconciliation.missing_standards.length} standard{reconciliation.missing_standards.length !== 1 ? 's' : ''} missing from rendering
          </p>
          <div className="mt-2 space-y-1">
            <p className="text-xs text-amber-700">
              Ledger: {reconciliation.ledger_count} | Filtered: {reconciliation.filtered_count} | Rendered: {reconciliation.rendered_count}
            </p>
            {reconciliation.missing_standards.map(m => (
              <div key={m.id} className="text-xs text-amber-600 flex items-center gap-2">
                <span className="font-mono">{m.title}</span>
                <span className="text-amber-400">—</span>
                <span>{m.reason}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-600 mt-2">
            Suggested recovery: Check category configuration and filter pipeline. All standards in the ledger must be renderable.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  standards, currentVersion, onSelectCategory, onAdd,
}: {
  standards: Standard[];
  currentVersion: string;
  onSelectCategory: (c: string) => void;
  onAdd: () => void;
}) {
  const total    = standards.length;
  const active   = standards.filter(s => s.status === 'active').length;
  const draft    = standards.filter(s => s.status === 'draft').length;
  const depr     = standards.filter(s => s.status === 'deprecated').length;

  const allCategories = useMemo(() => {
    const set = new Set<string>(PREDEFINED_CATEGORIES);
    standards.forEach(s => set.add(s.category));
    return Array.from(set).sort();
  }, [standards]);

  const countByCategory = allCategories.reduce<Record<string, number>>((acc, c) => {
    acc[c] = standards.filter(s => s.category === c).length;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Standards', value: total,  color: 'text-slate-900' },
          { label: 'Active',          value: active, color: 'text-emerald-600' },
          { label: 'Draft',           value: draft,  color: 'text-amber-600' },
          { label: 'Deprecated',      value: depr,   color: 'text-slate-400' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between bg-slate-900 rounded-xl p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">Engineering Standards v{currentVersion}</p>
            <p className="text-xs text-slate-400 mt-0.5">Current active version — {total} standards across {allCategories.length} categories</p>
          </div>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Standard
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Browse by Category</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {allCategories.map(c => (
            <CategoryCard
              key={c}
              category={c}
              count={countByCategory[c] ?? 0}
              onSelect={() => onSelectCategory(c)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Library Tab ──────────────────────────────────────────────────────────────

function LibraryTab({
  standards, filterCategory, onEdit, onAdd,
}: {
  standards: Standard[];
  filterCategory: string | null;
  onEdit: (s: Standard) => void;
  onAdd: () => void;
}) {
  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState(filterCategory ?? 'All');
  const [statusF,  setStatusF]  = useState<'all' | StandardStatus>('all');

  useEffect(() => { if (filterCategory) setCategory(filterCategory); }, [filterCategory]);

  const filtered = useMemo(() => {
    return standards.filter(s => {
      const matchCat    = category === 'All' || s.category === category;
      const matchStatus = statusF  === 'all' || s.status   === statusF;
      const q           = search.toLowerCase().trim();
      const matchSearch = !q ||
        s.title.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q) ||
        s.version_introduced.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q));
      return matchCat && matchStatus && matchSearch;
    });
  }, [standards, search, category, statusF]);

  // Group by ALL categories present in the filtered set — not just predefined ones
  const grouped = useMemo(() => {
    const groups: Record<string, Standard[]> = {};
    for (const s of filtered) {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    }
    // Sort categories: predefined first (in their defined order), then unknown alphabetically
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const ai = PREDEFINED_CATEGORIES.indexOf(a);
      const bi = PREDEFINED_CATEGORIES.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    const sorted: Record<string, Standard[]> = {};
    for (const k of sortedKeys) sorted[k] = groups[k];
    return sorted;
  }, [filtered]);

  const renderedCount = useMemo(() =>
    Object.values(grouped).reduce((sum, stds) => sum + stds.length, 0),
  [grouped]);

  // Reconciliation: check if filtered count matches rendered count
  const reconciliation: ReconciliationResult = useMemo(() => {
    const missing: Array<{ id: string; title: string; reason: string }> = [];
    for (const s of filtered) {
      const inGroup = Object.values(grouped).some(stds => stds.some(x => x.id === s.id));
      if (!inGroup) {
        missing.push({ id: s.id, title: s.title, reason: `Category "${s.category}" not rendered` });
      }
    }
    return {
      reconciled: missing.length === 0 && filtered.length === renderedCount,
      ledger_count: standards.length,
      filtered_count: filtered.length,
      rendered_count: renderedCount,
      missing_standards: missing,
    };
  }, [filtered, grouped, renderedCount, standards.length]);

  const showEmptyState = renderedCount === 0 && filtered.length === 0;

  return (
    <div className="space-y-5">
      <ReconciliationBanner reconciliation={reconciliation} />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by reference, title, category, or body..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>

        <div className="relative">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none appearance-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          >
            <option value="All">All Categories</option>
            {PREDEFINED_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {(['all', 'active', 'draft', 'deprecated'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusF(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                statusF === s ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Standard
        </button>
      </div>

      {/* Results summary — truthful count: rendered count always equals filtered count */}
      <p className="text-xs text-slate-500">
        {renderedCount} standard{renderedCount !== 1 ? 's' : ''} shown
        {renderedCount !== filtered.length && (
          <span className="text-amber-600 ml-2">(reconciliation: filtered {filtered.length} vs rendered {renderedCount})</span>
        )}
      </p>

      {/* Grouped list */}
      {showEmptyState ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="w-8 h-8 text-slate-200 mb-3" />
          <p className="text-sm font-medium text-slate-500">No standards match your filters</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting the search or category filter</p>
        </div>
      ) : (
        Object.entries(grouped).map(([cat, stds]) => {
          const cfg  = getCategoryCfg(cat);
          const Icon = cfg.Icon;
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${cfg.text}`} />
                </div>
                <span className="text-sm font-semibold text-slate-700">{cat}</span>
                <span className="text-xs text-slate-400">({stds.length})</span>
              </div>
              <div className="space-y-2 pl-8 mb-6">
                {stds.map(s => (
                  <StandardRow key={s.id} std={s} onEdit={onEdit} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Versions Tab ─────────────────────────────────────────────────────────────

function VersionsTab({ versions }: { versions: StandardsVersion[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <History className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">{versions.length} version{versions.length !== 1 ? 's' : ''} tracked</h3>
      </div>

      {versions.map(v => {
        const scfg = VERSION_STATUS_CFG[v.status] ?? VERSION_STATUS_CFG['archived'];
        return (
          <div key={v.id} className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shrink-0">
                  <GitBranch className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">v{v.version_number}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${scfg.bg} ${scfg.text}`}>
                      {scfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-500">{new Date(v.released_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mt-4">{v.summary}</p>
          </div>
        );
      })}

      {versions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <History className="w-8 h-8 text-slate-200 mb-3" />
          <p className="text-sm font-medium text-slate-500">No versions recorded</p>
        </div>
      )}
    </div>
  );
}

// ─── Changelog Tab ────────────────────────────────────────────────────────────

function ChangelogTab({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-6">
        <RefreshCw className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">{entries.length} change{entries.length !== 1 ? 's' : ''} recorded</h3>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <RefreshCw className="w-8 h-8 text-slate-200 mb-3" />
          <p className="text-sm font-medium text-slate-500">No changelog entries yet</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
          <div className="space-y-4">
            {entries.map(e => {
              const tcfg = CHANGE_TYPE_CFG[e.change_type] ?? CHANGE_TYPE_CFG['added'];
              const catcfg = e.affected_category ? getCategoryCfg(e.affected_category) : null;
              return (
                <div key={e.id} className="flex gap-4 pl-10 relative">
                  <div className="absolute left-2.5 top-4 w-3 h-3 rounded-full bg-white border-2 border-slate-300" />
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${tcfg.bg} ${tcfg.text}`}>
                        {tcfg.label}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        v{e.version_number}
                      </span>
                      {catcfg && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${catcfg.bg} ${catcfg.text}`}>
                          {e.affected_category}
                        </span>
                      )}
                    </div>
                    {e.standard_title && (
                      <p className="text-xs font-semibold text-slate-700 mb-1">{e.standard_title}</p>
                    )}
                    <p className="text-sm text-slate-600 leading-relaxed">{e.description}</p>
                    <p className="text-[10px] text-slate-400 mt-2">
                      {new Date(e.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'library' | 'versions' | 'changelog';

const TABS: { key: Tab; label: string; Icon: typeof BookOpen }[] = [
  { key: 'overview',   label: 'Overview',    Icon: BookOpen   },
  { key: 'library',    label: 'Library',     Icon: Scale      },
  { key: 'versions',   label: 'Versions',    Icon: GitBranch  },
  { key: 'changelog',  label: 'Change Log',  Icon: RefreshCw  },
];

export function ECCStandardsPage() {
  const [tab,             setTab]             = useState<Tab>('overview');
  const [standards,       setStandards]       = useState<Standard[]>([]);
  const [versions,        setVersions]        = useState<StandardsVersion[]>([]);
  const [changelog,       setChangelog]       = useState<ChangelogEntry[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [drawerOpen,      setDrawerOpen]      = useState(false);
  const [editTarget,      setEditTarget]      = useState<Standard | null>(null);
  const [filterCategory,  setFilterCategory]  = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const currentVersion = versions.find(v => v.status === 'current')?.version_number ?? '1.0';

  async function load() {
    setLoading(true);
    const [sRes, vRes, cRes] = await Promise.all([
      supabase.from('ecc_engineering_standards').select('*').order('category').order('created_at'),
      supabase.from('ecc_standards_versions').select('*').order('released_at', { ascending: false }),
      supabase.from('ecc_standards_changelog').select('*').order('created_at', { ascending: false }),
    ]);
    if (sRes.data) setStandards(sRes.data as Standard[]);
    if (vRes.data) setVersions(vRes.data as StandardsVersion[]);
    if (cRes.data) setChangelog(cRes.data as ChangelogEntry[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditTarget(null);
    setDrawerOpen(true);
  }

  function openEdit(s: Standard) {
    setEditTarget(s);
    setDrawerOpen(true);
  }

  function handleSelectCategory(c: string) {
    setFilterCategory(c);
    setTab('library');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header — stays accessible */}
      <div className="shrink-0 px-6 lg:px-8 pt-6 pb-4 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                <Scale className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Engineering Standards</h1>
                <p className="text-sm text-slate-500 mt-0.5">v{currentVersion} — shared practices and guidelines for this project</p>
              </div>
            </div>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Standard
            </button>
          </div>

          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            {TABS.map(t => {
              const Icon = t.Icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    tab === t.key
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Scrollable content area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 lg:px-8 py-6">
        <div className="max-w-5xl mx-auto">
          {tab === 'overview' && (
            <OverviewTab
              standards={standards}
              currentVersion={currentVersion}
              onSelectCategory={handleSelectCategory}
              onAdd={openAdd}
            />
          )}
          {tab === 'library' && (
            <LibraryTab
              standards={standards}
              filterCategory={filterCategory}
              onEdit={openEdit}
              onAdd={openAdd}
            />
          )}
          {tab === 'versions' && <VersionsTab versions={versions} />}
          {tab === 'changelog' && <ChangelogTab entries={changelog} />}
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <StandardDrawer
          standard={editTarget}
          onClose={() => setDrawerOpen(false)}
          onSave={() => { setDrawerOpen(false); load(); }}
          currentVersion={currentVersion}
        />
      )}
    </div>
  );
}
