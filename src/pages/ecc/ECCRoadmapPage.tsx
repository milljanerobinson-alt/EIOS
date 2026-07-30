import { useEffect, useState } from 'react';
import {
  Map, Plus, Loader2, Pencil, Trash2, X, Check,
  Flag, ArrowRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoadmapItem {
  id: string; name: string; description: string | null; target_quarter: string | null;
  priority: string; status: string; sort_order: number; product_id: string;
  created_at: string; updated_at: string;
}

interface Milestone {
  id: string; name: string; status: string; roadmap_item_id: string | null;
}

type ItemInput = Omit<RoadmapItem, 'id' | 'product_id' | 'created_at' | 'updated_at'>;

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUSES   = ['planned', 'in_progress', 'completed', 'on_hold'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const QUARTERS   = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Q1 2027', 'Q2 2027', 'Q3 2027'];

const STATUS_CFG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  planned:     { label: 'Planned',     dot: 'bg-slate-400',   text: 'text-slate-600',   bg: 'bg-slate-50'   },
  in_progress: { label: 'In Progress', dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50'    },
  completed:   { label: 'Completed',   dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  on_hold:     { label: 'On Hold',     dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50'   },
};

const PRIORITY_CFG: Record<string, { label: string; text: string; bg: string }> = {
  critical: { label: 'Critical', text: 'text-red-700',   bg: 'bg-red-50'    },
  high:     { label: 'High',     text: 'text-amber-700', bg: 'bg-amber-50'  },
  medium:   { label: 'Medium',   text: 'text-blue-700',  bg: 'bg-blue-50'   },
  low:      { label: 'Low',      text: 'text-slate-600', bg: 'bg-slate-100' },
};

const LABEL = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1';
const INPUT = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white';

// ─── Item Drawer ──────────────────────────────────────────────────────────────

function ItemDrawer({ item, productId, onClose, onSave }: {
  item: RoadmapItem | null; productId: string;
  onClose: () => void; onSave: (d: ItemInput) => Promise<void>;
}) {
  const EMPTY: ItemInput = { name: '', description: null, target_quarter: null, priority: 'medium', status: 'planned', sort_order: 0 };
  const [form, setForm] = useState<ItemInput>(item ? {
    name: item.name, description: item.description, target_quarter: item.target_quarter,
    priority: item.priority, status: item.status, sort_order: item.sort_order,
  } : EMPTY);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ItemInput>(k: K, v: ItemInput[K]) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave({ ...form, product_id: productId } as ItemInput);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Map className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-800">{item ? 'Edit Roadmap Item' : 'New Roadmap Item'}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 p-6 space-y-5">
          <div><label className={LABEL}>Name <span className="text-red-400">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Commercial Launch" className={INPUT} />
          </div>
          <div><label className={LABEL}>Description</label>
            <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value || null)} rows={3} className={INPUT + ' resize-none'} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL}>Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className={INPUT}>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_CFG[p]?.label ?? p}</option>)}
              </select>
            </div>
            <div><label className={LABEL}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={INPUT}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>)}
              </select>
            </div>
          </div>
          <div><label className={LABEL}>Target Quarter</label>
            <select value={form.target_quarter ?? ''} onChange={e => set('target_quarter', e.target.value || null)} className={INPUT}>
              <option value="">Select quarter…</option>
              {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!form.name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {item ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ECCRoadmapPage() {
  const [items,      setItems]      = useState<RoadmapItem[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [productId,  setProductId]  = useState<string>('');
  const [loading,    setLoading]    = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing,    setEditing]    = useState<RoadmapItem | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const [pRes, iRes, mRes] = await Promise.all([
      supabase.from('ecc_product').select('id').limit(1).single(),
      supabase.from('ecc_roadmap_items').select('*').order('sort_order'),
      supabase.from('ecc_milestones').select('id,name,status,roadmap_item_id').order('sort_order'),
    ]);
    setProductId(pRes.data?.id ?? '');
    setItems(iRes.data ?? []);
    setMilestones(mRes.data ?? []);
    setLoading(false);
  }

  async function handleSave(data: ItemInput) {
    if (editing) {
      const { data: updated } = await supabase.from('ecc_roadmap_items')
        .update({ ...data, updated_at: new Date().toISOString() }).eq('id', editing.id).select().single();
      if (updated) setItems(is => is.map(i => i.id === updated.id ? updated : i));
    } else {
      const payload = { ...data, product_id: productId, sort_order: items.length };
      const { data: created } = await supabase.from('ecc_roadmap_items').insert(payload).select().single();
      if (created) setItems(is => [...is, created]);
    }
    setDrawerOpen(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this roadmap item? Linked milestones will be unlinked.')) return;
    await supabase.from('ecc_roadmap_items').delete().eq('id', id);
    setItems(is => is.filter(i => i.id !== id));
  }

  function openEdit(i: RoadmapItem) { setEditing(i); setDrawerOpen(true); }
  function openNew()                { setEditing(null); setDrawerOpen(true); }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;

  const quarters = [...new Set(items.map(i => i.target_quarter ?? 'Unscheduled'))];

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Product Roadmap</h1>
          <p className="text-sm text-slate-500 mt-0.5">Strategic objectives that guide milestone and phase planning for LLND Automate.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Item
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <Map className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No roadmap items yet</p>
          <button onClick={openNew} className="mt-3 text-sm text-blue-600 hover:underline">Create the first roadmap item</button>
        </div>
      ) : (
        <div className="space-y-8">
          {quarters.map((q, qi) => {
            const qItems = items.filter(i => (i.target_quarter ?? 'Unscheduled') === q);
            return (
              <div key={q}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full bg-slate-300" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{q}</span>
                  {qi < quarters.length - 1 && <div className="flex-1 h-px bg-slate-100" />}
                </div>
                <div className="space-y-3 ml-5">
                  {qItems.map(item => {
                    const cfg  = STATUS_CFG[item.status]    ?? STATUS_CFG.planned;
                    const pcfg = PRIORITY_CFG[item.priority] ?? PRIORITY_CFG.medium;
                    const linked = milestones.filter(m => m.roadmap_item_id === item.id);

                    return (
                      <div key={item.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="flex items-start gap-3 p-5">
                          <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <h3 className="font-semibold text-slate-800">{item.name}</h3>
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${pcfg.bg} ${pcfg.text}`}>{pcfg.label}</span>
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                                </div>
                                {item.description && <p className="text-sm text-slate-500 leading-relaxed">{item.description}</p>}
                                {linked.length > 0 && (
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <span className="text-xs text-slate-400">Milestones:</span>
                                    {linked.map(m => {
                                      const mCfg = STATUS_CFG[m.status] ?? STATUS_CFG.planned;
                                      return (
                                        <span key={m.id} className={`text-xs px-2 py-0.5 rounded-full ${mCfg.bg} ${mCfg.text} flex items-center gap-1`}>
                                          <Flag className="w-2.5 h-2.5" />{m.name}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDelete(item.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {qi < quarters.length - 1 && (
                  <div className="flex items-center gap-2 mt-4 ml-5">
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                    <span className="text-xs text-slate-300">{quarters[qi + 1]}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {drawerOpen && (
        <ItemDrawer
          item={editing}
          productId={productId}
          onClose={() => { setDrawerOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
