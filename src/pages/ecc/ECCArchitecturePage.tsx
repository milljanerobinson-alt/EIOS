import { useEffect, useRef, useState } from 'react';
import {
  GitBranch, Plus, X, Loader2, Trash2, ChevronDown, ChevronUp,
  Check, Pencil, Link2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useActiveRC } from '../../lib/activeRC';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ADR {
  id: string;
  adr_number: string | null;
  title: string;
  review_type: string;
  review_date: string;
  implementation_date: string | null;
  reviewer: string | null;
  status: string;
  context: string | null;
  decision: string | null;
  rationale: string | null;
  alternatives: string | null;
  consequences: string | null;
  summary: string | null;
  recommendations: string | null;
  linked_release_ids: string[];
  backlog_item_ids: string[];
  created_at: string;
  updated_at: string;
}

type ADRInput = Omit<ADR, 'id' | 'created_at' | 'updated_at'>;

interface BacklogOption { id: string; title: string; priority: string; }
interface ReleaseOption { id: string; version: string; name: string | null; }

// ─── Constants ────────────────────────────────────────────────────────────────

const ADR_TYPES = [
  'architecture', 'database', 'api', 'frontend', 'infrastructure',
  'security', 'process', 'integration', 'data-model',
];

const STATUS_CFG: Record<string, { label: string; bg: string; border: string; text: string; dot: string }> = {
  proposed:   { label: 'Proposed',   bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  accepted:   { label: 'Accepted',   bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  superseded: { label: 'Superseded', bg: 'bg-slate-100',  border: 'border-slate-200',   text: 'text-slate-500',   dot: 'bg-slate-400' },
  deprecated: { label: 'Deprecated', bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-600',     dot: 'bg-red-400' },
};

const TYPE_CFG: Record<string, { bg: string; text: string }> = {
  architecture:  { bg: 'bg-blue-50',    text: 'text-blue-700' },
  database:      { bg: 'bg-cyan-50',    text: 'text-cyan-700' },
  api:           { bg: 'bg-violet-50',  text: 'text-violet-700' },
  frontend:      { bg: 'bg-pink-50',    text: 'text-pink-700' },
  infrastructure:{ bg: 'bg-orange-50',  text: 'text-orange-700' },
  security:      { bg: 'bg-red-50',     text: 'text-red-700' },
  process:       { bg: 'bg-teal-50',    text: 'text-teal-700' },
  integration:   { bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  'data-model':  { bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const INPUT  = "w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white placeholder-slate-300";
const LABEL  = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";
const SELECT = "w-full appearance-none px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white pr-8";

// ─── ADR Drawer ───────────────────────────────────────────────────────────────

const EMPTY_ADR = (num: string): ADRInput => ({
  adr_number: num, title: '', review_type: 'architecture',
  review_date: new Date().toISOString().split('T')[0],
  implementation_date: null, reviewer: null, status: 'proposed',
  context: null, decision: null, rationale: null, alternatives: null,
  consequences: null, summary: null, recommendations: null,
  linked_release_ids: [], backlog_item_ids: [],
});

function ADRDrawer({ adr, nextNumber, onClose, onSave, onDelete }: {
  adr: ADR | null;
  nextNumber: string;
  onClose: () => void;
  onSave: (d: ADRInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [form, setForm] = useState<ADRInput>(
    adr ? {
      adr_number: adr.adr_number, title: adr.title, review_type: adr.review_type,
      review_date: adr.review_date, implementation_date: adr.implementation_date,
      reviewer: adr.reviewer, status: adr.status,
      context: adr.context, decision: adr.decision, rationale: adr.rationale,
      alternatives: adr.alternatives, consequences: adr.consequences,
      summary: adr.summary, recommendations: adr.recommendations,
      linked_release_ids: adr.linked_release_ids ?? [],
      backlog_item_ids: adr.backlog_item_ids ?? [],
    } : EMPTY_ADR(nextNumber)
  );
  const [tab, setTab] = useState<'details' | 'decision' | 'links'>('details');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [backlogOpts, setBacklogOpts] = useState<BacklogOption[]>([]);
  const [releaseOpts, setReleaseOpts] = useState<ReleaseOption[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    supabase.from('ecc_backlog_items').select('id,title,priority').order('updated_at', { ascending: false }).limit(100)
      .then(({ data }) => setBacklogOpts(data ?? []));
    supabase.from('ecc_releases').select('id,version,name').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setReleaseOpts(data ?? []));
  }, []);

  function set<K extends keyof ADRInput>(k: K, v: ADRInput[K]) { setForm(f => ({ ...f, [k]: v })); }
  function toggleId(key: 'linked_release_ids' | 'backlog_item_ids', id: string) {
    setForm(f => ({
      ...f,
      [key]: (f[key] as string[]).includes(id)
        ? (f[key] as string[]).filter(x => x !== id)
        : [...(f[key] as string[]), id],
    }));
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave({ ...form, title: form.title.trim() });
    setSaving(false);
  }

  const TABS = [
    { key: 'details'  as const, label: 'Details' },
    { key: 'decision' as const, label: 'Decision' },
    { key: 'links'    as const, label: 'Links' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">{adr ? `Edit ${adr.adr_number ?? 'ADR'}` : 'New ADR'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex border-b border-slate-200 px-6">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-sm font-medium px-1 py-3 mr-5 border-b-2 transition-colors ${tab === t.key ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {tab === 'details' && <>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>ADR Number</label>
                <input value={form.adr_number ?? ''} onChange={e => set('adr_number', e.target.value || null)} placeholder="ADR-001" className={INPUT} />
              </div>
              <div><label className={LABEL}>Status</label>
                <div className="relative">
                  <select value={form.status} onChange={e => set('status', e.target.value)} className={SELECT}>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div><label className={LABEL}>Title <span className="text-red-500">*</span></label>
              <input ref={titleRef} value={form.title} onChange={e => set('title', e.target.value)} placeholder="What decision does this record?" className={INPUT} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Type</label>
                <div className="relative">
                  <select value={form.review_type} onChange={e => set('review_type', e.target.value)} className={SELECT}>
                    {ADR_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div><label className={LABEL}>Reviewer / Author</label>
                <input value={form.reviewer ?? ''} onChange={e => set('reviewer', e.target.value || null)} placeholder="Name" className={INPUT} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Decision Date</label>
                <input type="date" value={form.review_date} onChange={e => set('review_date', e.target.value)} className={INPUT} />
              </div>
              <div><label className={LABEL}>Implementation Date</label>
                <input type="date" value={form.implementation_date ?? ''} onChange={e => set('implementation_date', e.target.value || null)} className={INPUT} />
              </div>
            </div>

            <div><label className={LABEL}>Summary</label>
              <textarea value={form.summary ?? ''} onChange={e => set('summary', e.target.value || null)} rows={3}
                placeholder="One or two sentence overview." className={INPUT + ' resize-none'} />
            </div>
          </>}

          {tab === 'decision' && <>
            <div><label className={LABEL}>Context</label>
              <textarea value={form.context ?? ''} onChange={e => set('context', e.target.value || null)} rows={4}
                placeholder="What was the problem, situation, or constraints that drove this decision?" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Decision</label>
              <textarea value={form.decision ?? ''} onChange={e => set('decision', e.target.value || null)} rows={3}
                placeholder="What was decided, stated clearly." className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Rationale</label>
              <textarea value={form.rationale ?? ''} onChange={e => set('rationale', e.target.value || null)} rows={4}
                placeholder="Why was this option chosen?" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Alternatives Considered</label>
              <textarea value={form.alternatives ?? ''} onChange={e => set('alternatives', e.target.value || null)} rows={4}
                placeholder="Other options that were evaluated and why they were not chosen." className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Consequences</label>
              <textarea value={form.consequences ?? ''} onChange={e => set('consequences', e.target.value || null)} rows={3}
                placeholder="What changes as a result of this decision? What must be monitored?" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Recommendations</label>
              <textarea value={form.recommendations ?? ''} onChange={e => set('recommendations', e.target.value || null)} rows={3}
                placeholder="Guidance for teams implementing this decision." className={INPUT + ' resize-none'} />
            </div>
          </>}

          {tab === 'links' && <>
            <p className="text-xs text-slate-400">Link this ADR to the backlog items and releases it governs.</p>

            <div>
              <label className={LABEL}>Linked Backlog Items</label>
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {backlogOpts.length === 0
                  ? <p className="text-xs text-slate-400 p-3 text-center">No backlog items</p>
                  : backlogOpts.map(b => {
                      const checked = form.backlog_item_ids.includes(b.id);
                      return (
                        <button key={b.id} type="button" onClick={() => toggleId('backlog_item_ids', b.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 transition-colors text-left ${checked ? 'bg-slate-50' : ''}`}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-slate-800 border-slate-800' : 'border-slate-300'}`}>
                            {checked && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className="truncate text-slate-700">{b.title}</span>
                          <span className="ml-auto text-xs text-slate-400 capitalize shrink-0">{b.priority}</span>
                        </button>
                      );
                    })}
              </div>
              {form.backlog_item_ids.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">{form.backlog_item_ids.length} selected</p>
              )}
            </div>

            <div>
              <label className={LABEL}>Linked Releases</label>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {releaseOpts.length === 0
                  ? <p className="text-xs text-slate-400 p-3 text-center">No releases</p>
                  : releaseOpts.map(r => {
                      const checked = form.linked_release_ids.includes(r.id);
                      return (
                        <button key={r.id} type="button" onClick={() => toggleId('linked_release_ids', r.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 transition-colors text-left ${checked ? 'bg-slate-50' : ''}`}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-slate-800 border-slate-800' : 'border-slate-300'}`}>
                            {checked && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className="font-medium text-slate-700">{r.version}</span>
                          {r.name && <span className="text-slate-400">— {r.name}</span>}
                        </button>
                      );
                    })}
              </div>
            </div>
          </>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div>{adr && (confirmDel
            ? <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Delete?</span>
                <button onClick={() => onDelete?.().then(onClose)} className="text-xs font-semibold text-red-600">Confirm</button>
                <button onClick={() => setConfirmDel(false)} className="text-xs text-slate-400">Cancel</button>
              </div>
            : <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />Delete
              </button>
          )}</div>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
            <button onClick={handleSave} disabled={!form.title.trim() || saving}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {adr ? 'Save changes' : 'Create ADR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ADR Card ─────────────────────────────────────────────────────────────────

function ADRCard({ adr, onEdit }: { adr: ADR; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const sCfg = STATUS_CFG[adr.status] ?? STATUS_CFG.proposed;
  const tCfg = TYPE_CFG[adr.review_type] ?? TYPE_CFG.architecture;
  const hasBody = adr.context || adr.decision || adr.rationale || adr.alternatives || adr.consequences || adr.recommendations;
  const linkedCount = (adr.backlog_item_ids?.length ?? 0) + (adr.linked_release_ids?.length ?? 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {adr.adr_number && (
              <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{adr.adr_number}</span>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${sCfg.bg} ${sCfg.border} ${sCfg.text}`}>
              {sCfg.label}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${tCfg.bg} ${tCfg.text}`}>
              {adr.review_type}
            </span>
            <span className="text-xs text-slate-400">{fmtDate(adr.review_date)}</span>
            {adr.reviewer && <span className="text-xs text-slate-400">· {adr.reviewer}</span>}
          </div>
          <h3 className="text-sm font-semibold text-slate-900 leading-snug">{adr.title}</h3>
          {adr.summary && !expanded && (
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">{adr.summary}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {linkedCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-slate-400 mr-1">
              <Link2 className="w-3.5 h-3.5" />{linkedCount}
            </span>
          )}
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {hasBody && (
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {adr.context && <ADRSection label="Context" content={adr.context} />}
          {adr.decision && <ADRSection label="Decision" content={adr.decision} highlight />}
          {adr.rationale && <ADRSection label="Rationale" content={adr.rationale} />}
          {adr.alternatives && <ADRSection label="Alternatives Considered" content={adr.alternatives} />}
          {adr.consequences && <ADRSection label="Consequences" content={adr.consequences} />}
          {adr.recommendations && <ADRSection label="Recommendations" content={adr.recommendations} />}
          {adr.implementation_date && (
            <p className="text-xs text-slate-400">Implemented: <span className="text-slate-600">{fmtDate(adr.implementation_date)}</span></p>
          )}
        </div>
      )}
    </div>
  );
}

function ADRSection({ label, content, highlight }: { label: string; content: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      <pre className={`text-xs leading-relaxed whitespace-pre-wrap font-sans ${highlight ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>{content}</pre>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCArchitecturePage() {
  const [adrs, setAdrs] = useState<ADR[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { activeRC, addToActiveRC, logEvent } = useActiveRC();
  const [editing, setEditing] = useState<ADR | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function load() {
    const { data } = await supabase.from('ecc_architecture_reviews').select('*').order('review_date', { ascending: false });
    setAdrs((data ?? []).map(a => ({
      ...a,
      linked_release_ids: Array.isArray(a.linked_release_ids) ? a.linked_release_ids : [],
      backlog_item_ids: Array.isArray(a.backlog_item_ids) ? a.backlog_item_ids : [],
    })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function nextADRNumber() {
    const nums = adrs
      .map(a => parseInt((a.adr_number ?? '').replace(/[^0-9]/g, ''), 10))
      .filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `ADR-${String(next).padStart(3, '0')}`;
  }

  async function handleSave(data: ADRInput) {
    if (editing) {
      const { data: updated } = await supabase.from('ecc_architecture_reviews').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editing.id).select().single();
      if (updated) setAdrs(as => as.map(a => a.id === updated.id ? normalise(updated) : a));
    } else {
      const { data: created } = await supabase.from('ecc_architecture_reviews').insert(data).select().single();
      if (created) {
        setAdrs(as => [normalise(created), ...as]);
        if (activeRC) {
          await addToActiveRC('adr', created.id);
          await logEvent({ event_type: 'adr_created', event_label: `ADR created: ${created.title}`, entity_type: 'architecture_review', entity_id: created.id, entity_title: created.title });
        }
      }
    }
    setDrawerOpen(false); setEditing(null);
  }

  async function handleDelete() {
    if (!editing) return;
    await supabase.from('ecc_architecture_reviews').delete().eq('id', editing.id);
    setAdrs(as => as.filter(a => a.id !== editing.id));
    setDrawerOpen(false); setEditing(null);
  }

  function normalise(a: ADR): ADR {
    return {
      ...a,
      linked_release_ids: Array.isArray(a.linked_release_ids) ? a.linked_release_ids : [],
      backlog_item_ids: Array.isArray(a.backlog_item_ids) ? a.backlog_item_ids : [],
    };
  }

  const filtered = adrs.filter(a => {
    if (filterStatus && a.status !== filterStatus) return false;
    if (filterType && a.review_type !== filterType) return false;
    if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = Object.keys(STATUS_CFG).reduce<Record<string, number>>((acc, s) => {
    acc[s] = adrs.filter(a => a.status === s).length;
    return acc;
  }, {});

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-slate-300 animate-spin" /></div>;

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Architecture Decision Records</h2>
            <p className="text-sm text-slate-500">Permanent record of significant architectural and technical decisions.</p>
          </div>
        </div>
        <button onClick={() => { setEditing(null); setDrawerOpen(true); }}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> New ADR
        </button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {Object.entries(STATUS_CFG).map(([key, cfg]) => (
          <button key={key} onClick={() => setFilterStatus(filterStatus === key ? null : key)}
            className={`px-4 py-3 rounded-xl border text-left transition-all ${filterStatus === key ? `${cfg.bg} ${cfg.border}` : 'bg-white border-slate-200 hover:border-slate-300'}`}>
            <p className={`text-xl font-bold ${filterStatus === key ? cfg.text : 'text-slate-900'}`}>{counts[key] ?? 0}</p>
            <p className={`text-xs font-medium mt-0.5 ${filterStatus === key ? cfg.text : 'text-slate-500'}`}>{cfg.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ADRs…"
          className="flex-1 min-w-[180px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400" />
        <div className="flex items-center gap-2 flex-wrap">
          {ADR_TYPES.map(t => {
            const cfg = TYPE_CFG[t] ?? { bg: 'bg-slate-100', text: 'text-slate-600' };
            return (
              <button key={t} onClick={() => setFilterType(filterType === t ? null : t)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize transition-all ${filterType === t ? `${cfg.bg} ${cfg.text} ring-1 ring-current/20` : 'bg-white text-slate-400 border border-slate-200 hover:border-slate-300'}`}>
                {t}
              </button>
            );
          })}
        </div>
        {(filterStatus || filterType || search) && (
          <button onClick={() => { setFilterStatus(null); setFilterType(null); setSearch(''); }}
            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <GitBranch className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">
            {adrs.length === 0 ? 'No ADRs yet.' : 'No ADRs match your filters.'}
          </p>
          {adrs.length === 0 && (
            <p className="text-xs text-slate-400 mt-2">Record architectural decisions before they are forgotten.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => (
            <ADRCard key={a.id} adr={a} onEdit={() => { setEditing(a); setDrawerOpen(true); }} />
          ))}
        </div>
      )}

      {drawerOpen && (
        <ADRDrawer
          adr={editing}
          nextNumber={nextADRNumber()}
          onClose={() => { setDrawerOpen(false); setEditing(null); }}
          onSave={handleSave}
          onDelete={editing ? handleDelete : undefined}
        />
      )}
    </div>
  );
}
