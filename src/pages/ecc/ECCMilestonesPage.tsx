import { useEffect, useState } from 'react';
import {
  Flag, Plus, Loader2, Pencil, Trash2, X, Check, ChevronDown, ChevronUp,
  Layers, Package, Calendar,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Milestone {
  id: string; name: string; description: string | null; owner: string | null;
  target_date: string | null; status: string; sort_order: number;
  roadmap_item_id: string | null; created_at: string; updated_at: string;
}

interface RoadmapItem { id: string; name: string; }
interface Phase { id: string; milestone_id: string | null; name: string; status: string; target_version: string | null; }
interface RCRow  { id: string; rc_number: string; status: string; phase_id: string | null; checklist_items: { required?: boolean; checked?: boolean }[] | null; }

type MilestoneInput = Omit<Milestone, 'id' | 'created_at' | 'updated_at'>;

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = ['planned', 'in_progress', 'completed', 'on_hold'];

const STATUS_CFG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  planned:     { label: 'Planned',     dot: 'bg-slate-400',   text: 'text-slate-600',   bg: 'bg-slate-50'   },
  in_progress: { label: 'In Progress', dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50'    },
  completed:   { label: 'Completed',   dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  on_hold:     { label: 'On Hold',     dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50'   },
};

const LABEL  = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1';
const INPUT  = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rcProgress(rc: RCRow): number {
  if (rc.status === 'verified') return 100;
  const items = rc.checklist_items ?? [];
  const req = items.filter(c => c.required);
  if (req.length === 0) return rc.status === 'in_progress' ? 40 : 0;
  return Math.round((req.filter(c => c.checked).length / req.length) * 100);
}

function phaseProgress(phaseId: string, rcs: RCRow[]): number {
  const linked = rcs.filter(r => r.phase_id === phaseId);
  if (linked.length === 0) return 0;
  return Math.round(linked.reduce((s, r) => s + rcProgress(r), 0) / linked.length);
}

function milestoneProgress(milestoneId: string, phases: Phase[], rcs: RCRow[]): number {
  const linked = phases.filter(p => p.milestone_id === milestoneId);
  if (linked.length === 0) return 0;
  return Math.round(linked.reduce((s, p) => s + phaseProgress(p.id, rcs), 0) / linked.length);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Milestone Drawer ─────────────────────────────────────────────────────────

function MilestoneDrawer({ milestone, roadmapItems, onClose, onSave }: {
  milestone: Milestone | null; roadmapItems: RoadmapItem[];
  onClose: () => void; onSave: (d: MilestoneInput) => Promise<void>;
}) {
  const EMPTY: MilestoneInput = {
    name: '', description: null, owner: '', target_date: null, status: 'planned',
    sort_order: 0, roadmap_item_id: null,
  };
  const [form, setForm] = useState<MilestoneInput>(milestone ? {
    name: milestone.name, description: milestone.description, owner: milestone.owner,
    target_date: milestone.target_date, status: milestone.status,
    sort_order: milestone.sort_order, roadmap_item_id: milestone.roadmap_item_id,
  } : EMPTY);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof MilestoneInput>(k: K, v: MilestoneInput[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-800">{milestone ? 'Edit Milestone' : 'New Milestone'}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 p-6 space-y-5">
          <div><label className={LABEL}>Name <span className="text-red-400">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Foundation" className={INPUT} />
          </div>
          <div><label className={LABEL}>Description</label>
            <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value || null)} rows={3} className={INPUT + ' resize-none'} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={INPUT}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>)}
              </select>
            </div>
            <div><label className={LABEL}>Owner</label>
              <input value={form.owner ?? ''} onChange={e => set('owner', e.target.value || null)} placeholder="Engineering" className={INPUT} />
            </div>
          </div>
          <div><label className={LABEL}>Target Date</label>
            <input type="date" value={form.target_date ?? ''} onChange={e => set('target_date', e.target.value || null)} className={INPUT} />
          </div>
          <div><label className={LABEL}>Linked Roadmap Item</label>
            <select value={form.roadmap_item_id ?? ''} onChange={e => set('roadmap_item_id', e.target.value || null)} className={INPUT}>
              <option value="">None</option>
              {roadmapItems.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!form.name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {milestone ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ECCMilestonesPage() {
  const [milestones,   setMilestones]   = useState<Milestone[]>([]);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
  const [phases,       setPhases]       = useState<Phase[]>([]);
  const [rcs,          setRCs]          = useState<RCRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [editing,      setEditing]      = useState<Milestone | null>(null);
  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    const [mRes, rRes, phRes, rcRes] = await Promise.all([
      supabase.from('ecc_milestones').select('*').order('sort_order'),
      supabase.from('ecc_roadmap_items').select('id,name').order('sort_order'),
      supabase.from('ecc_phases').select('id,milestone_id,name,status,target_version').order('sort_order'),
      supabase.from('ecc_release_candidates').select('id,rc_number,status,phase_id,checklist_items'),
    ]);
    setMilestones(mRes.data ?? []);
    setRoadmapItems(rRes.data ?? []);
    setPhases(phRes.data ?? []);
    setRCs((rcRes.data ?? []) as RCRow[]);
    setLoading(false);
  }

  async function handleSave(data: MilestoneInput) {
    if (editing) {
      const { data: updated } = await supabase.from('ecc_milestones')
        .update({ ...data, updated_at: new Date().toISOString() }).eq('id', editing.id).select().single();
      if (updated) setMilestones(ms => ms.map(m => m.id === updated.id ? updated : m));
    } else {
      const { data: created } = await supabase.from('ecc_milestones')
        .insert({ ...data, sort_order: milestones.length }).select().single();
      if (created) setMilestones(ms => [...ms, created]);
    }
    setDrawerOpen(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this milestone? Linked phases will be unlinked.')) return;
    await supabase.from('ecc_milestones').delete().eq('id', id);
    setMilestones(ms => ms.filter(m => m.id !== id));
  }

  function openEdit(m: Milestone) { setEditing(m); setDrawerOpen(true); }
  function openNew()              { setEditing(null); setDrawerOpen(true); }
  function toggleExpand(id: string) { setExpanded(e => ({ ...e, [id]: !e[id] })); }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Milestones</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track major engineering milestones within each product roadmap item.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Milestone
        </button>
      </div>

      {milestones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <Flag className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No milestones yet</p>
          <button onClick={openNew} className="mt-3 text-sm text-blue-600 hover:underline">Create the first milestone</button>
        </div>
      ) : (
        <div className="space-y-3">
          {milestones.map(ms => {
            const cfg = STATUS_CFG[ms.status] ?? STATUS_CFG.planned;
            const msPhases = phases.filter(p => p.milestone_id === ms.id);
            const pct = milestoneProgress(ms.id, phases, rcs);
            const roadmapItem = roadmapItems.find(r => r.id === ms.roadmap_item_id);
            const isOpen = expanded[ms.id];

            return (
              <div key={ms.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-start gap-3 p-5">
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-slate-800">{ms.name}</h3>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                          {roadmapItem && (
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{roadmapItem.name}</span>
                          )}
                        </div>
                        {ms.description && <p className="text-sm text-slate-500 mb-2">{ms.description}</p>}
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          {ms.owner && <span>{ms.owner}</span>}
                          {ms.target_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(ms.target_date)}</span>}
                          <span>{msPhases.length} phase{msPhases.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(ms)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(ms.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => toggleExpand(ms.id)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-500">{pct}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/60">
                    {msPhases.length === 0 ? (
                      <p className="text-xs text-slate-400 italic px-6 py-3">No phases linked to this milestone.</p>
                    ) : msPhases.map(ph => {
                      const phCfg = STATUS_CFG[ph.status] ?? STATUS_CFG.planned;
                      const phRCs = rcs.filter(r => r.phase_id === ph.id);
                      const phPct = phaseProgress(ph.id, rcs);
                      return (
                        <div key={ph.id} className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 last:border-0">
                          <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-slate-700">{ph.name}</span>
                              {ph.target_version && <span className="text-xs text-slate-400 font-mono">{ph.target_version}</span>}
                              <span className={`text-xs px-1.5 py-0.5 rounded ${phCfg.bg} ${phCfg.text}`}>{phCfg.label}</span>
                              <span className="text-xs text-slate-400">{phRCs.length} RC{phRCs.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${phPct === 100 ? 'bg-emerald-500' : 'bg-blue-400'}`} style={{ width: `${phPct}%` }} />
                              </div>
                              <span className="text-xs text-slate-400">{phPct}%</span>
                            </div>
                          </div>
                          <Package className="w-3.5 h-3.5 text-slate-300" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {drawerOpen && (
        <MilestoneDrawer
          milestone={editing}
          roadmapItems={roadmapItems}
          onClose={() => { setDrawerOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
