import { useEffect, useState } from 'react';
import {
  Layers, Plus, Loader2, Pencil, Trash2, X, Check, ChevronDown, ChevronUp,
  Package, Calendar, Link2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Phase {
  id: string; milestone_id: string | null; name: string; description: string | null;
  target_version: string | null; owner: string | null; due_date: string | null;
  status: string; sort_order: number; created_at: string; updated_at: string;
}

interface Milestone { id: string; name: string; }
interface RCRow {
  id: string; rc_number: string; phase_name: string; status: string;
  phase_id: string | null; checklist_items: { required?: boolean; checked?: boolean }[] | null;
}

type PhaseInput = Omit<Phase, 'id' | 'created_at' | 'updated_at'>;

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = ['planned', 'in_progress', 'completed', 'on_hold'];

const STATUS_CFG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  planned:     { label: 'Planned',     dot: 'bg-slate-400',   text: 'text-slate-600',   bg: 'bg-slate-50'   },
  in_progress: { label: 'In Progress', dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50'    },
  completed:   { label: 'Completed',   dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  on_hold:     { label: 'On Hold',     dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50'   },
};

const RC_STATUS_CFG: Record<string, { label: string; dot: string; text: string }> = {
  verified:    { label: 'Verified',    dot: 'bg-emerald-500', text: 'text-emerald-700' },
  pending:     { label: 'Pending',     dot: 'bg-amber-400',   text: 'text-amber-700'   },
  in_progress: { label: 'In Progress', dot: 'bg-blue-500',    text: 'text-blue-700'    },
  failed:      { label: 'Failed',      dot: 'bg-red-500',     text: 'text-red-700'     },
  deferred:    { label: 'Deferred',    dot: 'bg-slate-400',   text: 'text-slate-500'   },
};

const LABEL = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1';
const INPUT = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white';

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

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Phase Drawer ─────────────────────────────────────────────────────────────

function PhaseDrawer({ phase, milestones, onClose, onSave }: {
  phase: Phase | null; milestones: Milestone[];
  onClose: () => void; onSave: (d: PhaseInput) => Promise<void>;
}) {
  const EMPTY: PhaseInput = {
    name: '', description: null, milestone_id: null, target_version: null,
    owner: '', due_date: null, status: 'planned', sort_order: 0,
  };
  const [form, setForm] = useState<PhaseInput>(phase ? {
    name: phase.name, description: phase.description, milestone_id: phase.milestone_id,
    target_version: phase.target_version, owner: phase.owner, due_date: phase.due_date,
    status: phase.status, sort_order: phase.sort_order,
  } : EMPTY);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof PhaseInput>(k: K, v: PhaseInput[K]) {
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
            <Layers className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-800">{phase ? 'Edit Phase' : 'New Phase'}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 p-6 space-y-5">
          <div><label className={LABEL}>Name <span className="text-red-400">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Phase 4 — Public Launch" className={INPUT} />
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
            <div><label className={LABEL}>Target Version</label>
              <input value={form.target_version ?? ''} onChange={e => set('target_version', e.target.value || null)} placeholder="v0.4" className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL}>Owner</label>
              <input value={form.owner ?? ''} onChange={e => set('owner', e.target.value || null)} placeholder="Engineering" className={INPUT} />
            </div>
            <div><label className={LABEL}>Due Date</label>
              <input type="date" value={form.due_date ?? ''} onChange={e => set('due_date', e.target.value || null)} className={INPUT} />
            </div>
          </div>
          <div><label className={LABEL}>Linked Milestone</label>
            <select value={form.milestone_id ?? ''} onChange={e => set('milestone_id', e.target.value || null)} className={INPUT}>
              <option value="">None</option>
              {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!form.name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {phase ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ECCPhasesPage() {
  const [phases,     setPhases]     = useState<Phase[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [rcs,        setRCs]        = useState<RCRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing,    setEditing]    = useState<Phase | null>(null);
  const [expanded,   setExpanded]   = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    const [phRes, mRes, rcRes] = await Promise.all([
      supabase.from('ecc_phases').select('*').order('sort_order'),
      supabase.from('ecc_milestones').select('id,name').order('sort_order'),
      supabase.from('ecc_release_candidates').select('id,rc_number,phase_name,status,phase_id,checklist_items').order('rc_number'),
    ]);
    setPhases(phRes.data ?? []);
    setMilestones(mRes.data ?? []);
    setRCs((rcRes.data ?? []) as RCRow[]);
    setLoading(false);
  }

  async function handleSave(data: PhaseInput) {
    if (editing) {
      const { data: updated } = await supabase.from('ecc_phases')
        .update({ ...data, updated_at: new Date().toISOString() }).eq('id', editing.id).select().single();
      if (updated) setPhases(ps => ps.map(p => p.id === updated.id ? updated : p));
    } else {
      const { data: created } = await supabase.from('ecc_phases')
        .insert({ ...data, sort_order: phases.length }).select().single();
      if (created) setPhases(ps => [...ps, created]);
    }
    setDrawerOpen(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this phase? Linked Release Candidates will be unlinked.')) return;
    await supabase.from('ecc_phases').delete().eq('id', id);
    setPhases(ps => ps.filter(p => p.id !== id));
  }

  function openEdit(p: Phase)    { setEditing(p); setDrawerOpen(true); }
  function openNew()             { setEditing(null); setDrawerOpen(true); }
  function toggleExpand(id: string) { setExpanded(e => ({ ...e, [id]: !e[id] })); }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Phases</h1>
          <p className="text-sm text-slate-500 mt-0.5">Engineering work packages. Each phase links to a milestone and contains one or more Release Candidates.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Phase
        </button>
      </div>

      {phases.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <Layers className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No phases yet</p>
          <button onClick={openNew} className="mt-3 text-sm text-blue-600 hover:underline">Create the first phase</button>
        </div>
      ) : (
        <div className="space-y-3">
          {phases.map(ph => {
            const cfg = STATUS_CFG[ph.status] ?? STATUS_CFG.planned;
            const phRCs = rcs.filter(r => r.phase_id === ph.id);
            const pct = phaseProgress(ph.id, rcs);
            const milestone = milestones.find(m => m.id === ph.milestone_id);
            const isOpen = expanded[ph.id];

            return (
              <div key={ph.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-start gap-3 p-5">
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-slate-800">{ph.name}</h3>
                          {ph.target_version && (
                            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{ph.target_version}</span>
                          )}
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                          {milestone && (
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Link2 className="w-2.5 h-2.5" />{milestone.name}
                            </span>
                          )}
                        </div>
                        {ph.description && <p className="text-sm text-slate-500 mb-2">{ph.description}</p>}
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          {ph.owner && <span>{ph.owner}</span>}
                          {ph.due_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(ph.due_date)}</span>}
                          <span className="flex items-center gap-1"><Package className="w-3 h-3" />{phRCs.length} Release Candidate{phRCs.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(ph)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(ph.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        {phRCs.length > 0 && (
                          <button onClick={() => toggleExpand(ph.id)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        )}
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

                {isOpen && phRCs.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50/60">
                    {phRCs.map(rc => {
                      const rcCfg = RC_STATUS_CFG[rc.status] ?? RC_STATUS_CFG.pending;
                      const rcPct = rcProgress(rc);
                      return (
                        <div key={rc.id} className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 last:border-0">
                          <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-slate-700">{rc.rc_number}</span>
                              <span className="text-sm text-slate-500 truncate">{rc.phase_name}</span>
                              <span className={`text-xs flex items-center gap-1 ${rcCfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${rcCfg.dot}`} />{rcCfg.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${rcPct === 100 ? 'bg-emerald-500' : 'bg-blue-400'}`} style={{ width: `${rcPct}%` }} />
                              </div>
                              <span className="text-xs text-slate-400 w-8 text-right">{rcPct}%</span>
                            </div>
                          </div>
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
        <PhaseDrawer
          phase={editing}
          milestones={milestones}
          onClose={() => { setDrawerOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
