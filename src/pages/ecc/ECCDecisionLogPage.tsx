import { useEffect, useState, useRef } from 'react';
import { Loader2, Plus, ScrollText, X, ChevronDown, ChevronUp, Pencil, Trash2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Decision {
  id: string;
  title: string;
  decision_date: string;
  category: string;
  status: string;
  summary: string;
  context: string;
  alternatives_considered: string;
  pros: string;
  cons: string;
  decision: string;
  reasoning: string;
  consequences: string;
  linked_backlog_items: string[];
  linked_qa_reports: string[];
  linked_releases: string[];
  linked_architecture: string[];
  linked_ai_sessions: string[];
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ['architecture', 'product', 'process', 'infrastructure', 'security', 'ux', 'data', 'integration', 'other'];
const STATUSES = ['proposed', 'accepted', 'superseded', 'deprecated'];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  proposed:   { label: 'Proposed',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  accepted:   { label: 'Accepted',   bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  superseded: { label: 'Superseded', bg: 'bg-slate-100',  text: 'text-slate-500',   border: 'border-slate-200' },
  deprecated: { label: 'Deprecated', bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-200' },
};

const CATEGORY_CONFIG: Record<string, { bg: string; text: string }> = {
  architecture:   { bg: 'bg-blue-50',    text: 'text-blue-700' },
  product:        { bg: 'bg-violet-50',  text: 'text-violet-700' },
  process:        { bg: 'bg-teal-50',    text: 'text-teal-700' },
  infrastructure: { bg: 'bg-orange-50',  text: 'text-orange-700' },
  security:       { bg: 'bg-red-50',     text: 'text-red-700' },
  ux:             { bg: 'bg-pink-50',    text: 'text-pink-700' },
  data:           { bg: 'bg-cyan-50',    text: 'text-cyan-700' },
  integration:    { bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  other:          { bg: 'bg-slate-100',  text: 'text-slate-600' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const BLANK: Omit<Decision, 'id' | 'created_at' | 'updated_at'> = {
  title: '', decision_date: new Date().toISOString().split('T')[0],
  category: 'architecture', status: 'proposed',
  summary: '', context: '', alternatives_considered: '',
  pros: '', cons: '', decision: '', reasoning: '', consequences: '',
  linked_backlog_items: [], linked_qa_reports: [], linked_releases: [],
  linked_architecture: [], linked_ai_sessions: [],
};

// ─── Drawer ───────────────────────────────────────────────────────────────────

function DecisionDrawer({
  initial, onClose, onSaved,
}: {
  initial?: Decision;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<'core' | 'detail' | 'links'>('core');
  const [form, setForm] = useState<typeof BLANK>(
    initial
      ? { ...initial }
      : { ...BLANK }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k: keyof typeof BLANK, v: unknown) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function setLinked(k: keyof Pick<typeof BLANK, 'linked_backlog_items' | 'linked_qa_reports' | 'linked_releases' | 'linked_architecture' | 'linked_ai_sessions'>, raw: string) {
    set(k, raw.split('\n').map(s => s.trim()).filter(Boolean));
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.decision_date) { setError('Date is required.'); return; }
    setSaving(true);
    setError('');
    const payload = { ...form };
    let err;
    if (initial) {
      ({ error: err } = await supabase.from('ecc_decisions').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', initial.id));
    } else {
      ({ error: err } = await supabase.from('ecc_decisions').insert([payload]));
    }
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  }

  const TABS = [
    { key: 'core' as const, label: 'Core' },
    { key: 'detail' as const, label: 'Analysis' },
    { key: 'links' as const, label: 'Links' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <aside className="w-[620px] bg-white flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h3 className="text-sm font-semibold text-slate-900">{initial ? 'Edit Decision' : 'New Decision'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 shrink-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${tab === t.key ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {tab === 'core' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Title <span className="text-red-500">*</span></label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400"
                  placeholder="What was decided?" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Date <span className="text-red-500">*</span></label>
                  <input type="date" value={form.decision_date} onChange={e => set('decision_date', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white capitalize">
                    {STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Category</label>
                <select value={form.category} onChange={e => set('category', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white capitalize">
                  {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Summary</label>
                <textarea value={form.summary} onChange={e => set('summary', e.target.value)} rows={2}
                  placeholder="One or two sentences describing the decision."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 resize-y" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Context</label>
                <textarea value={form.context} onChange={e => set('context', e.target.value)} rows={4}
                  placeholder="What was the situation, constraints, and forces at play?"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 resize-y" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Decision</label>
                <textarea value={form.decision} onChange={e => set('decision', e.target.value)} rows={3}
                  placeholder="What was decided, stated clearly."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 resize-y" />
              </div>
            </>
          )}

          {tab === 'detail' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Alternatives Considered</label>
                <textarea value={form.alternatives_considered} onChange={e => set('alternatives_considered', e.target.value)} rows={3}
                  placeholder="What other options were evaluated?"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 resize-y" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Pros</label>
                  <textarea value={form.pros} onChange={e => set('pros', e.target.value)} rows={4}
                    placeholder="Benefits of this decision."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 resize-y" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Cons</label>
                  <textarea value={form.cons} onChange={e => set('cons', e.target.value)} rows={4}
                    placeholder="Trade-offs and downsides."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 resize-y" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Reasoning</label>
                <textarea value={form.reasoning} onChange={e => set('reasoning', e.target.value)} rows={3}
                  placeholder="Why was this option chosen over the alternatives?"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 resize-y" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Consequences</label>
                <textarea value={form.consequences} onChange={e => set('consequences', e.target.value)} rows={3}
                  placeholder="What will change as a result? What must be watched?"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 resize-y" />
              </div>
            </>
          )}

          {tab === 'links' && (
            <>
              {(
                [
                  { key: 'linked_backlog_items'  as const, label: 'Linked Backlog Items',     ph: 'One item reference per line (e.g. feature title or ID)' },
                  { key: 'linked_qa_reports'     as const, label: 'Linked QA Reports',        ph: 'One report reference per line' },
                  { key: 'linked_releases'       as const, label: 'Linked Releases',          ph: 'e.g. v1.0.0, RC-003' },
                  { key: 'linked_architecture'   as const, label: 'Linked Architecture',      ph: 'Architecture review titles or IDs' },
                  { key: 'linked_ai_sessions'    as const, label: 'Linked AI Sessions',       ph: 'Session titles or IDs' },
                ] as const
              ).map(({ key, label, ph }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
                  <textarea
                    value={(form[key] as string[]).join('\n')}
                    onChange={e => setLinked(key, e.target.value)}
                    rows={3}
                    placeholder={ph}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 resize-y font-mono"
                  />
                </div>
              ))}
            </>
          )}
        </div>

        {error && (
          <div className="px-6 py-2 bg-red-50 border-t border-red-100 shrink-0">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {initial ? 'Save Changes' : 'Create Decision'}
          </button>
        </div>
      </aside>
    </div>
  );
}

// ─── Decision Card ────────────────────────────────────────────────────────────

function DecisionCard({
  decision, onEdit, onDelete,
}: {
  decision: Decision;
  onEdit: (d: Decision) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sCfg = STATUS_CONFIG[decision.status] ?? STATUS_CONFIG.proposed;
  const cCfg = CATEGORY_CONFIG[decision.category] ?? CATEGORY_CONFIG.other;

  const hasDetail = decision.context || decision.alternatives_considered || decision.pros || decision.cons || decision.decision || decision.reasoning || decision.consequences;
  const hasLinks = [
    ...decision.linked_backlog_items,
    ...decision.linked_qa_reports,
    ...decision.linked_releases,
    ...decision.linked_architecture,
    ...decision.linked_ai_sessions,
  ].length > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 transition-all hover:border-slate-300">
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${sCfg.bg} ${sCfg.text} ${sCfg.border} capitalize`}>
                {sCfg.label}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cCfg.bg} ${cCfg.text} capitalize`}>
                {decision.category}
              </span>
              <span className="text-xs text-slate-400">{fmtDate(decision.decision_date)}</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 leading-snug">{decision.title}</h3>
            {decision.summary && (
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">{decision.summary}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onEdit(decision)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(decision.id)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {(hasDetail || hasLinks) && (
              <button onClick={() => setExpanded(e => !e)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors ml-1">
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {decision.context && (
            <Section label="Context" content={decision.context} />
          )}
          {decision.alternatives_considered && (
            <Section label="Alternatives Considered" content={decision.alternatives_considered} />
          )}
          {(decision.pros || decision.cons) && (
            <div className="grid grid-cols-2 gap-4">
              {decision.pros && <Section label="Pros" content={decision.pros} />}
              {decision.cons && <Section label="Cons" content={decision.cons} />}
            </div>
          )}
          {decision.decision && (
            <Section label="Decision" content={decision.decision} highlight />
          )}
          {decision.reasoning && (
            <Section label="Reasoning" content={decision.reasoning} />
          )}
          {decision.consequences && (
            <Section label="Consequences" content={decision.consequences} />
          )}
          {hasLinks && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Linked Items</p>
              <div className="flex flex-wrap gap-1.5">
                {decision.linked_backlog_items.map((l, i) => <LinkChip key={`bl-${i}`} label={l} type="Backlog" />)}
                {decision.linked_qa_reports.map((l, i) => <LinkChip key={`qa-${i}`} label={l} type="QA" />)}
                {decision.linked_releases.map((l, i) => <LinkChip key={`rel-${i}`} label={l} type="Release" />)}
                {decision.linked_architecture.map((l, i) => <LinkChip key={`ar-${i}`} label={l} type="Arch" />)}
                {decision.linked_ai_sessions.map((l, i) => <LinkChip key={`ai-${i}`} label={l} type="AI" />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, content, highlight }: { label: string; content: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      <pre className={`text-xs leading-relaxed whitespace-pre-wrap font-sans ${highlight ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
        {content}
      </pre>
    </div>
  );
}

function LinkChip({ label, type }: { label: string; type: string }) {
  const colors: Record<string, string> = {
    Backlog: 'bg-blue-50 text-blue-700',
    QA:      'bg-emerald-50 text-emerald-700',
    Release: 'bg-amber-50 text-amber-700',
    Arch:    'bg-violet-50 text-violet-700',
    AI:      'bg-teal-50 text-teal-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${colors[type] ?? 'bg-slate-100 text-slate-600'}`}>
      <span className="opacity-60 font-medium">{type}</span>
      <span>{label}</span>
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCDecisionLogPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Decision | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('ecc_decisions').select('*').order('decision_date', { ascending: false });
    setDecisions(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    await supabase.from('ecc_decisions').delete().eq('id', id);
    setDecisions(ds => ds.filter(d => d.id !== id));
    setConfirmDelete(null);
  }

  const filtered = decisions.filter(d => {
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (filterCategory !== 'all' && d.category !== filterCategory) return false;
    if (search && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.summary?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = decisions.filter(d => d.status === s).length;
    return acc;
  }, {});

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Decision Log</h2>
            <p className="text-sm text-slate-500">A permanent record of WHY engineering and product decisions were made.</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(undefined); setDrawerOpen(true); }}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> New Decision
        </button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {STATUSES.map(s => {
          const cfg = STATUS_CONFIG[s];
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
              className={`px-4 py-3 rounded-xl border text-left transition-all ${filterStatus === s ? `${cfg.bg} ${cfg.border}` : 'bg-white border-slate-200 hover:border-slate-300'}`}>
              <p className={`text-xl font-bold ${filterStatus === s ? cfg.text : 'text-slate-900'}`}>{counts[s] ?? 0}</p>
              <p className={`text-xs font-medium mt-0.5 capitalize ${filterStatus === s ? cfg.text : 'text-slate-500'}`}>{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search decisions..."
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400" />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white capitalize">
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
        </select>
        {(filterStatus !== 'all' || filterCategory !== 'all' || search) && (
          <button onClick={() => { setFilterStatus('all'); setFilterCategory('all'); setSearch(''); }}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <ScrollText className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">
            {decisions.length === 0 ? 'No decisions recorded yet.' : 'No decisions match your filters.'}
          </p>
          {decisions.length === 0 && (
            <p className="text-xs text-slate-400 mt-2">
              Capture the WHY behind architectural and product choices before they are forgotten.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => (
            <DecisionCard
              key={d.id}
              decision={d}
              onEdit={d => { setEditing(d); setDrawerOpen(true); }}
              onDelete={id => setConfirmDelete(id)}
            />
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-80">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Delete decision?</h4>
            <p className="text-xs text-slate-500 mb-5">This is permanent and cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDelete)}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {drawerOpen && (
        <DecisionDrawer
          initial={editing}
          onClose={() => { setDrawerOpen(false); setEditing(undefined); }}
          onSaved={load}
        />
      )}
    </div>
  );
}
