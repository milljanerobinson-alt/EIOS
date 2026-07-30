import { useState, useEffect, useCallback } from 'react';
import {
  Bug, Plus, Search, Loader2, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, XCircle, ChevronDown, ChevronUp, User, Calendar, Link2,
  FlaskConical, Tag, Edit3, Check, X, Trash2, Shield, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Defect {
  id: string;
  defect_number: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  priority: string;
  environment_found: string | null;
  reproducibility: string | null;
  steps_to_reproduce: string | null;
  expected_behaviour: string | null;
  actual_behaviour: string | null;
  root_cause: string | null;
  fix_description: string | null;
  workaround: string | null;
  test_case_id: string | null;
  feature_id: string | null;
  linked_release: string | null;
  linked_audit: string | null;
  linked_rec_id: string | null;
  reported_by: string | null;
  reported_date: string | null;
  assigned_to: string | null;
  target_fix_date: string | null;
  fixed_date: string | null;
  verified_by: string | null;
  verified_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SEVERITY_CFG: Record<string, { label: string; dot: string; text: string; bg: string; border: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
  high:     { label: 'High',     dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  medium:   { label: 'Medium',   dot: 'bg-amber-500',  text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
  low:      { label: 'Low',      dot: 'bg-slate-400',  text: 'text-slate-600',  bg: 'bg-slate-100', border: 'border-slate-200'  },
};

const STATUS_CFG: Record<string, { label: string; dot: string; text: string; bg: string; icon: typeof Clock }> = {
  open:        { label: 'Open',          dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    icon: AlertTriangle  },
  in_progress: { label: 'In Progress',   dot: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50',   icon: Clock          },
  fixed:       { label: 'Fixed',         dot: 'bg-violet-500', text: 'text-violet-700', bg: 'bg-violet-50', icon: CheckCircle2   },
  verified:    { label: 'Verified',      dot: 'bg-emerald-500',text: 'text-emerald-700',bg: 'bg-emerald-50',icon: CheckCircle2   },
  closed:      { label: 'Closed',        dot: 'bg-slate-400',  text: 'text-slate-500',  bg: 'bg-slate-100', icon: XCircle        },
  deferred:    { label: 'Deferred',      dot: 'bg-amber-500',  text: 'text-amber-700',  bg: 'bg-amber-50',  icon: Clock          },
  wont_fix:    { label: "Won't Fix",     dot: 'bg-slate-400',  text: 'text-slate-500',  bg: 'bg-slate-100', icon: XCircle        },
};

const SEVERITY_OPTS = ['critical', 'high', 'medium', 'low'];
const STATUS_OPTS   = ['open', 'in_progress', 'fixed', 'verified', 'closed', 'deferred', 'wont_fix'];
const ENV_OPTS      = ['production', 'staging', 'development'];
const REPRO_OPTS    = ['consistent', 'intermittent', 'unable_to_reproduce'];

const EMPTY_FORM = {
  title: '', description: '', severity: 'medium', status: 'open', priority: 'medium',
  environment_found: 'production', reproducibility: 'consistent',
  steps_to_reproduce: '', expected_behaviour: '', actual_behaviour: '',
  root_cause: '', fix_description: '', workaround: '',
  feature_id: '', linked_release: '', linked_rec_id: '', linked_audit: '',
  reported_by: '', assigned_to: '', target_fix_date: '', notes: '',
};

// ─── Defect Form ──────────────────────────────────────────────────────────────

function DefectForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Defect>;
  onSave: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'details' | 'repro' | 'links'>('details');

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  const sevCfg = SEVERITY_CFG[form.severity] ?? SEVERITY_CFG.medium;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-200">
        <Bug className="w-4 h-4 text-slate-600" />
        <h3 className="text-sm font-bold text-slate-800">{initial?.id ? 'Edit Defect' : 'Log New Defect'}</h3>
        <div className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${sevCfg.bg} ${sevCfg.text}`}>
          {sevCfg.label}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {([['details', 'Details'], ['repro', 'Reproduction'], ['links', 'Links']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 ${
              tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {l}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-4">
        {tab === 'details' && (
          <>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Title *</label>
              <input value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="Short defect summary…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Description</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                rows={2} placeholder="Describe the defect…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Severity</label>
                <select value={form.severity} onChange={e => set('severity', e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  {SEVERITY_OPTS.map(s => <option key={s} value={s}>{SEVERITY_CFG[s]?.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Environment</label>
                <select value={form.environment_found ?? 'production'} onChange={e => set('environment_found', e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  {ENV_OPTS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Reported By</label>
                <input value={form.reported_by} onChange={e => set('reported_by', e.target.value)}
                  placeholder="Name…"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Assigned To</label>
                <input value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}
                  placeholder="Name…"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Notes</label>
              <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)}
                rows={2} placeholder="Additional notes…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
            </div>
          </>
        )}

        {tab === 'repro' && (
          <>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Reproducibility</label>
              <select value={form.reproducibility ?? 'consistent'} onChange={e => set('reproducibility', e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                {REPRO_OPTS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Steps to Reproduce</label>
              <textarea value={form.steps_to_reproduce ?? ''} onChange={e => set('steps_to_reproduce', e.target.value)}
                rows={3} placeholder="1. Navigate to…&#10;2. Click…&#10;3. Observe…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Expected Behaviour</label>
              <textarea value={form.expected_behaviour ?? ''} onChange={e => set('expected_behaviour', e.target.value)}
                rows={2} placeholder="What should happen…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Actual Behaviour</label>
              <textarea value={form.actual_behaviour ?? ''} onChange={e => set('actual_behaviour', e.target.value)}
                rows={2} placeholder="What actually happens…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Root Cause (if known)</label>
              <textarea value={form.root_cause ?? ''} onChange={e => set('root_cause', e.target.value)}
                rows={2} placeholder="Root cause analysis…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
            </div>
            {(form.status === 'fixed' || form.status === 'verified' || form.status === 'closed') && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Fix Description</label>
                <textarea value={form.fix_description ?? ''} onChange={e => set('fix_description', e.target.value)}
                  rows={2} placeholder="What was done to fix this…"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Workaround</label>
              <textarea value={form.workaround ?? ''} onChange={e => set('workaround', e.target.value)}
                rows={2} placeholder="Temporary workaround if available…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
            </div>
          </>
        )}

        {tab === 'links' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Link this defect to other engineering records.</p>
            {[
              { k: 'feature_id', label: 'Feature ID', placeholder: 'FEAT-nnn' },
              { k: 'linked_release', label: 'Release', placeholder: 'RC-nnn' },
              { k: 'linked_audit', label: 'Audit', placeholder: 'AUD-nnn' },
              { k: 'linked_rec_id', label: 'Recommendation', placeholder: 'REC-nnn' },
            ].map(({ k, label, placeholder }) => (
              <div key={k} className="flex items-center gap-3">
                <label className="text-xs text-slate-500 w-28 shrink-0">{label}</label>
                <input
                  value={(form as Record<string, string>)[k] ?? ''}
                  onChange={e => set(k, e.target.value)}
                  placeholder={placeholder}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-5 flex items-center gap-2">
        <button onClick={handleSave} disabled={saving || !form.title.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {initial?.id ? 'Save Changes' : 'Log Defect'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Defect Card ──────────────────────────────────────────────────────────────

function DefectCard({ defect, onEdit, onDelete, onStatusChange }: {
  defect: Defect;
  onEdit: (d: Defect) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_CFG[defect.severity] ?? SEVERITY_CFG.medium;
  const sta = STATUS_CFG[defect.status] ?? STATUS_CFG.open;
  const StaIcon = sta.icon;

  const isOpen = defect.status === 'open' || defect.status === 'in_progress';

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-sm ${
      defect.severity === 'critical' ? 'border-red-200' :
      defect.severity === 'high' ? 'border-orange-200' : 'border-slate-200'
    }`}>
      {/* Card header */}
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Severity indicator */}
        <div className={`w-1 h-10 rounded-full shrink-0 mt-0.5 ${sev.dot}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-[11px] font-mono text-slate-400">{defect.defect_number}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sev.bg} ${sev.text}`}>{sev.label}</span>
            <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${sta.bg} ${sta.text}`}>
              <StaIcon className="w-2.5 h-2.5" />{sta.label}
            </span>
            {defect.environment_found && (
              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded capitalize">{defect.environment_found}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-800 truncate">{defect.title}</p>
          {defect.description && !expanded && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{defect.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isOpen && (
            <select
              value={defect.status}
              onChange={e => onStatusChange(defect.id, e.target.value)}
              onClick={e => e.stopPropagation()}
              className="text-xs border border-slate-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none"
            >
              {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label}</option>)}
            </select>
          )}
          <button onClick={() => onEdit(defect)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(defect.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(e => !e)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          {defect.description && (
            <p className="text-xs text-slate-600 leading-relaxed">{defect.description}</p>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {defect.assigned_to && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <User className="w-3 h-3" /> <span>Assigned: {defect.assigned_to}</span>
              </div>
            )}
            {defect.reported_by && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <User className="w-3 h-3" /> <span>Reported: {defect.reported_by}</span>
              </div>
            )}
            {defect.reported_date && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <Calendar className="w-3 h-3" /> <span>Date: {defect.reported_date}</span>
              </div>
            )}
            {defect.target_fix_date && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <Calendar className="w-3 h-3" /> <span>Target: {defect.target_fix_date}</span>
              </div>
            )}
            {defect.feature_id && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <Link2 className="w-3 h-3" /> <span>Feature: {defect.feature_id}</span>
              </div>
            )}
            {defect.linked_release && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <Tag className="w-3 h-3" /> <span>Release: {defect.linked_release}</span>
              </div>
            )}
            {defect.linked_rec_id && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <Link2 className="w-3 h-3" /> <span>Rec: {defect.linked_rec_id}</span>
              </div>
            )}
          </div>
          {defect.steps_to_reproduce && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Steps to Reproduce</p>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{defect.steps_to_reproduce}</p>
            </div>
          )}
          {defect.expected_behaviour && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Expected</p>
                <p className="text-xs text-slate-600">{defect.expected_behaviour}</p>
              </div>
              {defect.actual_behaviour && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Actual</p>
                  <p className="text-xs text-slate-600">{defect.actual_behaviour}</p>
                </div>
              )}
            </div>
          )}
          {defect.fix_description && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1">Fix Applied</p>
              <p className="text-xs text-emerald-800">{defect.fix_description}</p>
            </div>
          )}
          {defect.workaround && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1">Workaround</p>
              <p className="text-xs text-amber-800">{defect.workaround}</p>
            </div>
          )}
          {defect.notes && (
            <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-2">{defect.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function ECCDefectsPanel({ featureId, testCaseId }: {
  featureId?: string;
  testCaseId?: string;
}) {
  const [defects, setDefects]   = useState<Defect[]>([]);
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState(false);
  const [editing, setEditing]   = useState<Defect | null>(null);
  const [search, setSearch]     = useState('');
  const [filterSev, setFilterSev] = useState('all');
  const [filterSta, setFilterSta] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('ecc_defects').select('*').order('created_at', { ascending: false });
    if (featureId) q = q.eq('feature_id', featureId);
    if (testCaseId) q = q.eq('test_case_id', testCaseId);
    const { data } = await q;
    setDefects(data ?? []);
    setLoading(false);
  }, [featureId, testCaseId]);

  useEffect(() => { load(); }, [load]);

  async function getNextDefectNumber(): Promise<string> {
    const { data } = await supabase.rpc('get_next_register_number', { p_type: 'def' });
    return data ?? `DEF-${Date.now()}`;
  }

  async function handleSave(form: typeof EMPTY_FORM) {
    if (editing) {
      await supabase.from('ecc_defects').update({
        ...form, updated_at: new Date().toISOString(),
      }).eq('id', editing.id);
      setEditing(null);
    } else {
      const defect_number = await getNextDefectNumber();
      await supabase.from('ecc_defects').insert({
        ...form, defect_number,
        test_case_id: testCaseId ?? null,
        feature_id: (featureId ?? form.feature_id) || null,
      });
      setAdding(false);
    }
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this defect?')) return;
    await supabase.from('ecc_defects').delete().eq('id', id);
    load();
  }

  async function handleStatusChange(id: string, status: string) {
    await supabase.from('ecc_defects').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    setDefects(ds => ds.map(d => d.id === id ? { ...d, status } : d));
  }

  const filtered = defects.filter(d => {
    if (filterSev !== 'all' && d.severity !== filterSev) return false;
    if (filterSta !== 'all' && d.status !== filterSta) return false;
    if (search && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.defect_number.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openCount      = defects.filter(d => d.status === 'open').length;
  const criticalCount  = defects.filter(d => d.severity === 'critical' && d.status === 'open').length;
  const highCount      = defects.filter(d => d.severity === 'high' && d.status === 'open').length;
  const resolvedCount  = defects.filter(d => ['fixed', 'verified', 'closed'].includes(d.status)).length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {defects.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total', val: defects.length, color: 'text-slate-700' },
            { label: 'Open', val: openCount, color: openCount > 0 ? 'text-red-600' : 'text-slate-400' },
            { label: 'Critical / High', val: `${criticalCount} / ${highCount}`, color: (criticalCount + highCount) > 0 ? 'text-orange-600' : 'text-slate-400' },
            { label: 'Resolved', val: resolvedCount, color: 'text-emerald-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-[10px] text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Critical/High alert */}
      {(criticalCount + highCount) > 0 && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-800">
            <span className="font-bold">{criticalCount + highCount} open Critical/High defect{criticalCount + highCount !== 1 ? 's' : ''}.</span>
            {' '}These block release verification per CHK-001 Release Readiness Checklist.
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search defects…"
            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
        </div>
        <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none">
          <option value="all">All Severity</option>
          {SEVERITY_OPTS.map(s => <option key={s} value={s}>{SEVERITY_CFG[s]?.label}</option>)}
        </select>
        <select value={filterSta} onChange={e => setFilterSta(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none">
          <option value="all">All Status</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label}</option>)}
        </select>
        <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => { setAdding(true); setEditing(null); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors">
          <Plus className="w-3.5 h-3.5" /> Log Defect
        </button>
      </div>

      {/* Form */}
      {(adding || editing) && (
        <DefectForm
          initial={editing ?? undefined}
          onSave={handleSave}
          onCancel={() => { setAdding(false); setEditing(null); }}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
          <Bug className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">
            {defects.length === 0 ? 'No defects logged' : 'No defects match your filters'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {defects.length === 0 ? 'Log defects found during testing.' : 'Try adjusting filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(d => (
            <DefectCard
              key={d.id}
              defect={d}
              onEdit={setEditing}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Summary (for Testing Dashboard) ────────────────────────────────

export function DefectSummaryBadge({ count, label }: { count: number; label: string }) {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
      <Bug className="w-2.5 h-2.5" />
      {count} {label}
    </span>
  );
}
