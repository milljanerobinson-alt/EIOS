import { useEffect, useState } from 'react';
import {
  Target, Layers, Plus, Loader2, ChevronDown, ChevronUp,
  CheckCircle2, Circle, PauseCircle, XCircle, Pencil, X, Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  owner: string | null;
  progress_pct: number;
  target_date: string | null;
  notes: string | null;
  position: number;
  created_at: string;
}

interface Epic {
  id: string;
  title: string;
  description: string | null;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  owner: string | null;
  progress_pct: number;
  goal_id: string | null;
  notes: string | null;
  position: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  active:    { label: 'Active',    icon: Circle,        color: 'text-blue-600 bg-blue-50' },
  completed: { label: 'Completed', icon: CheckCircle2,  color: 'text-emerald-600 bg-emerald-50' },
  paused:    { label: 'Paused',    icon: PauseCircle,   color: 'text-amber-600 bg-amber-50' },
  cancelled: { label: 'Cancelled', icon: XCircle,       color: 'text-slate-400 bg-slate-100' },
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-slate-100 text-slate-600',
};

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─── Inline edit field ────────────────────────────────────────────────────────

function InlineField({
  label, value, onSave, textarea = false,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  textarea?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() { onSave(draft); setEditing(false); }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">{label}</span>
        {textarea ? (
          <textarea
            autoFocus
            className="text-sm border border-blue-400 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
            rows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
        ) : (
          <input
            autoFocus
            className="text-sm border border-blue-400 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
        )}
        <div className="flex gap-1">
          <button onClick={commit} className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            <Check className="w-3 h-3" />
          </button>
          <button onClick={() => { setDraft(value); setEditing(false); }} className="p-1.5 text-slate-500 hover:text-slate-700">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group cursor-pointer"
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      <div className="text-xs text-slate-400 mb-0.5">{label}</div>
      <div className="text-sm text-slate-700 group-hover:text-blue-600 transition-colors">
        {value || <span className="italic text-slate-400">Click to add…</span>}
        <Pencil className="w-3 h-3 ml-1 inline opacity-0 group-hover:opacity-100 transition-opacity text-blue-500" />
      </div>
    </div>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────

function GoalCard({ goal, epics, onUpdate }: {
  goal: Goal;
  epics: Epic[];
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = STATUS_CONFIG[goal.status]?.icon ?? Circle;
  const linkedEpics = epics.filter(e => e.goal_id === goal.id);

  async function updateField(field: string, value: unknown) {
    await supabase.from('ecc_goals').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', goal.id);
    onUpdate();
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
            <Target className="w-4.5 h-4.5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="font-semibold text-slate-900 text-base">{goal.title}</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[goal.status]?.color}`}>
                <StatusIcon className="w-3 h-3" />
                {STATUS_CONFIG[goal.status]?.label}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_COLOR[goal.priority]}`}>
                {goal.priority}
              </span>
            </div>
            {goal.description && (
              <p className="text-sm text-slate-500 mb-3 leading-relaxed">{goal.description}</p>
            )}
            <ProgressBar pct={goal.progress_pct} />
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 text-slate-400 hover:text-slate-600 shrink-0"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {goal.target_date && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
            <span>Target: <strong className="text-slate-700">{new Date(goal.target_date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}</strong></span>
            {goal.owner && <span>Owner: <strong className="text-slate-700">{goal.owner}</strong></span>}
            {linkedEpics.length > 0 && (
              <span>{linkedEpics.length} epic{linkedEpics.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InlineField label="Owner" value={goal.owner ?? ''} onSave={v => updateField('owner', v)} />
          <InlineField label="Target Date" value={goal.target_date ?? ''} onSave={v => updateField('target_date', v || null)} />
          <InlineField label="Progress (%)" value={String(goal.progress_pct)} onSave={v => updateField('progress_pct', Math.min(100, Math.max(0, parseInt(v) || 0)))} />
          <div>
            <div className="text-xs text-slate-400 mb-1">Status</div>
            <select
              value={goal.status}
              onChange={e => updateField('status', e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {['active','completed','paused','cancelled'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <InlineField label="Notes" value={goal.notes ?? ''} onSave={v => updateField('notes', v)} textarea />
          </div>
          {linkedEpics.length > 0 && (
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-400 mb-2">Linked Epics</div>
              <div className="flex flex-wrap gap-2">
                {linkedEpics.map(e => (
                  <span key={e.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700">
                    <Layers className="w-3 h-3 text-slate-400" />
                    {e.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Epic Card ────────────────────────────────────────────────────────────────

function EpicCard({ epic, goals, onUpdate }: {
  epic: Epic;
  goals: Goal[];
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = STATUS_CONFIG[epic.status]?.icon ?? Circle;
  const linkedGoal = goals.find(g => g.id === epic.goal_id);

  async function updateField(field: string, value: unknown) {
    await supabase.from('ecc_epics').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', epic.id);
    onUpdate();
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
            <Layers className="w-4 h-4 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h4 className="font-semibold text-slate-900 text-sm">{epic.title}</h4>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_CONFIG[epic.status]?.color}`}>
                <StatusIcon className="w-2.5 h-2.5" />
                {STATUS_CONFIG[epic.status]?.label}
              </span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${PRIORITY_COLOR[epic.priority]}`}>
                {epic.priority}
              </span>
            </div>
            {epic.description && (
              <p className="text-xs text-slate-500 leading-relaxed mb-2">{epic.description}</p>
            )}
            <ProgressBar pct={epic.progress_pct} />
            {linkedGoal && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <Target className="w-3 h-3" />
                <span className="truncate">{linkedGoal.title}</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InlineField label="Owner" value={epic.owner ?? ''} onSave={v => updateField('owner', v)} />
          <InlineField label="Progress (%)" value={String(epic.progress_pct)} onSave={v => updateField('progress_pct', Math.min(100, Math.max(0, parseInt(v) || 0)))} />
          <div>
            <div className="text-xs text-slate-400 mb-1">Status</div>
            <select
              value={epic.status}
              onChange={e => updateField('status', e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {['active','completed','paused','cancelled'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Linked Goal</div>
            <select
              value={epic.goal_id ?? ''}
              onChange={e => updateField('goal_id', e.target.value || null)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">— none —</option>
              {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <InlineField label="Notes" value={epic.notes ?? ''} onSave={v => updateField('notes', v)} textarea />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Goal Modal ───────────────────────────────────────────────────────────

function AddGoalModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low'|'medium'|'high'|'critical'>('high');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    await supabase.from('ecc_goals').insert({
      title: title.trim(), description: description.trim() || null,
      priority, target_date: targetDate || null,
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-900 text-lg">New Goal</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Title *</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="e.g. Commercial Launch" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
              placeholder="What does this goal achieve?" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as typeof priority)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-200">
                {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Target Date</label>
              <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={save} disabled={!title.trim() || saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Goal
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ViewTab = 'goals' | 'epics';

export function CCGoalsEpicsPage() {
  const [tab, setTab] = useState<ViewTab>('goals');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddGoal, setShowAddGoal] = useState(false);

  async function load() {
    const [g, e] = await Promise.all([
      supabase.from('ecc_goals').select('*').order('position').order('created_at'),
      supabase.from('ecc_epics').select('*').order('position').order('created_at'),
    ]);
    setGoals(g.data ?? []);
    setEpics(e.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Goals & Epics</h2>
          <p className="text-sm text-slate-500 mt-0.5">Planning hierarchy: Goals → Epics → Features</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {(['goals', 'epics'] as ViewTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'goals' ? `Goals (${goals.length})` : `Epics (${epics.length})`}
              </button>
            ))}
          </div>
          {tab === 'goals' && (
            <button
              onClick={() => setShowAddGoal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Goal
            </button>
          )}
        </div>
      </div>

      {tab === 'goals' && (
        <div className="space-y-4">
          {goals.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Target className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No goals yet.</p>
            </div>
          ) : (
            goals.map(g => <GoalCard key={g.id} goal={g} epics={epics} onUpdate={load} />)
          )}
        </div>
      )}

      {tab === 'epics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {epics.length === 0 ? (
            <div className="col-span-2 text-center py-16 text-slate-400">
              <Layers className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No epics yet.</p>
            </div>
          ) : (
            epics.map(e => <EpicCard key={e.id} epic={e} goals={goals} onUpdate={load} />)
          )}
        </div>
      )}

      {showAddGoal && <AddGoalModal onClose={() => setShowAddGoal(false)} onSaved={load} />}
    </div>
  );
}
