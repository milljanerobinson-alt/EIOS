import { useEffect, useRef, useState } from 'react';
import {
  Plus, X, ChevronDown, Loader2, Trash2, Check,
  Package, CheckSquare, XCircle, Clock, AlertCircle, ChevronUp,
  Tag, Link2, Activity, FileText, Sparkles, ShieldCheck, Zap, User,
  History, BookOpen, Calendar, Wand2, ClipboardList,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useActiveRC, type ChecklistItem, type HistoricalException } from '../../lib/activeRC';
import {
  computeChecklist, validateForVerification, extractManualStates, extractHistoricalExceptions, rcPct,
  type EvidenceData, type ComputedItem,
} from '../../lib/rcValidation';
import { ECCComplianceChecklist } from './ECCComplianceChecklist';

// ─── Release Candidates ────────────────────────────────────────────────────────

interface RC {
  id: string; rc_number: string; phase_name: string; status: string;
  description?: string; notes?: string; version?: string;
  included_phases: string[]; manual_testing_status: string;
  regression_testing_status: string; deployment_status: string;
  approved_by?: string; rollback_point?: string;
  release_notes?: string; known_issues?: string;
  verified_at?: string; verified_by?: string;
  archived_at?: string;
  is_active?: boolean;
  release_type?: string;
  checklist_items?: ChecklistItem[];
  included_backlog_item_ids?: string[];
  linked_journal_ids?: string[];
  linked_testing_ids?: string[];
  linked_adr_ids?: string[];
  linked_doc_ids?: string[];
  milestone?: string;
  due_date?: string;
  created_at: string;
}

type RCInput = Omit<RC, 'id' | 'created_at'>;

const RELEASE_TYPES: { value: string; label: string }[] = [
  { value: 'standard',            label: 'Standard' },
  { value: 'prototype',           label: 'Prototype' },
  { value: 'hotfix',              label: 'Hotfix' },
  { value: 'emergency',           label: 'Emergency' },
  { value: 'historical_migration',label: 'Historical Migration' },
];

const HISTORICAL_EXCEPTION_DEFAULT_REASON =
  'This requirement was introduced during Phase 3 while the Engineering & Operations Centre itself was under development. ' +
  'The checklist item has been intentionally marked as a Historical Exception to preserve an accurate engineering history.';

const EXCEPTION_ELIGIBLE_TYPES = new Set(['prototype', 'historical_migration']);

// ─── Full Releases ─────────────────────────────────────────────────────────────

interface Release {
  id: string;
  version: string;
  name: string | null;
  scope: string | null;
  status: string;
  release_date: string | null;
  release_notes: string | null;
  known_issues: string | null;
  deployment_notes: string | null;
  rollback_plan: string | null;
  risks: string | null;
  production_status: string | null;
  db_migrations: string[];
  edge_functions: string[];
  ui_changes: string[];
  features: string[];
  bug_fixes: string[];
  included_backlog_ids: string[];
  linked_testing_ids: string[];
  created_at: string;
  updated_at: string;
}

type ReleaseInput = Omit<Release, 'id' | 'created_at' | 'updated_at'>;

// ─── Shared styles ─────────────────────────────────────────────────────────────

const INPUT  = "w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white placeholder-slate-300";
const LABEL  = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";
const SELECT = "w-full appearance-none px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white pr-8";

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }

// ─── RC config ────────────────────────────────────────────────────────────────

const RC_STATUS: Record<string, { label: string; dot: string; bg: string; border: string; text: string }> = {
  verified:    { label: 'Verified',    dot: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  pending:     { label: 'Pending',     dot: 'bg-amber-400',   bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700' },
  in_progress: { label: 'In Progress', dot: 'bg-blue-500',    bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700' },
  failed:      { label: 'Failed',      dot: 'bg-red-500',     bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700' },
  deferred:    { label: 'Deferred',    dot: 'bg-slate-400',   bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-500' },
};

const QA_STATUS: Record<string, { Icon: typeof Clock; color: string }> = {
  passed:  { Icon: CheckSquare, color: 'text-emerald-600' },
  failed:  { Icon: XCircle,     color: 'text-red-600' },
  pending: { Icon: Clock,       color: 'text-slate-400' },
  skipped: { Icon: AlertCircle, color: 'text-slate-400' },
};

function qaCfg(s: string) { return QA_STATUS[s] ?? QA_STATUS.pending; }

// ─── Release status config ────────────────────────────────────────────────────

const REL_STATUS: Record<string, { label: string; dot: string; bg: string; border: string; text: string }> = {
  draft:    { label: 'Draft',    dot: 'bg-slate-400',    bg: 'bg-slate-50',    border: 'border-slate-200',   text: 'text-slate-600' },
  testing:  { label: 'Testing',  dot: 'bg-blue-500',     bg: 'bg-blue-50',     border: 'border-blue-200',    text: 'text-blue-700' },
  ready:    { label: 'Ready',    dot: 'bg-amber-500',    bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700' },
  released: { label: 'Released', dot: 'bg-emerald-500',  bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-700' },
  hotfix:   { label: 'Hotfix',   dot: 'bg-red-500',      bg: 'bg-red-50',      border: 'border-red-200',     text: 'text-red-700' },
  planned:  { label: 'Planned',  dot: 'bg-slate-400',    bg: 'bg-slate-50',    border: 'border-slate-200',   text: 'text-slate-600' },
};

function relCfg(s: string) { return REL_STATUS[s] ?? REL_STATUS.draft; }

// ─── RC Drawer ─────────────────────────────────────────────────────────────────

const EMPTY_RC = (num: string): RCInput => ({
  rc_number: num, phase_name: '', status: 'pending', description: '', notes: '', version: '',
  release_type: 'standard',
  included_phases: [], manual_testing_status: 'pending', regression_testing_status: 'pending',
  deployment_status: 'pending', approved_by: '', rollback_point: '', release_notes: '', known_issues: '',
  verified_at: undefined, verified_by: undefined,
});

function phaseName(rc: RC) { return rc.phase_name; }

function RCDrawer({ rc, nextNumber, onClose, onSave, onDelete }: {
  rc: RC | null; nextNumber: string; onClose: () => void;
  onSave: (d: RCInput) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [form, setForm] = useState<RCInput>(rc ? {
    rc_number: rc.rc_number, phase_name: rc.phase_name, status: rc.status,
    description: rc.description ?? '', notes: rc.notes ?? '', version: rc.version ?? '',
    release_type: rc.release_type ?? 'standard',
    included_phases: rc.included_phases ?? [],
    manual_testing_status: rc.manual_testing_status ?? 'pending',
    regression_testing_status: rc.regression_testing_status ?? 'pending',
    deployment_status: rc.deployment_status ?? 'pending',
    approved_by: rc.approved_by ?? '', rollback_point: rc.rollback_point ?? '',
    release_notes: rc.release_notes ?? '', known_issues: rc.known_issues ?? '',
    verified_at: rc.verified_at, verified_by: rc.verified_by,
  } : EMPTY_RC(nextNumber));
  const [tab, setTab] = useState<'details' | 'quality' | 'release'>('details');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  function set<K extends keyof RCInput>(k: K, v: RCInput[K]) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.rc_number.trim() || !form.phase_name.trim()) return;
    setSaving(true);
    if (form.status === 'verified' && !form.verified_at) set('verified_at', new Date().toISOString());
    await onSave(form); setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">{rc ? `Edit ${rc.rc_number}` : 'New Release Candidate'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex border-b border-slate-200 px-6">
          {(['details','quality','release'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm font-medium px-1 py-3 mr-5 border-b-2 transition-colors capitalize ${tab === t ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t === 'quality' ? 'Quality Gates' : t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {tab === 'details' && <>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>RC Number</label><input ref={ref} value={form.rc_number} onChange={e => set('rc_number', e.target.value)} placeholder="RC-003" className={INPUT} /></div>
              <div><label className={LABEL}>Version</label><input value={form.version ?? ''} onChange={e => set('version', e.target.value)} placeholder="1.0.0" className={INPUT} /></div>
            </div>
            <div><label className={LABEL}>Development Stage <span className="text-red-400">*</span></label><input value={form.phase_name} onChange={e => set('phase_name', e.target.value)} placeholder="Phase 3 — Workflow Automation" className={INPUT} /></div>
            <div><label className={LABEL}>Status</label>
              <div className="relative"><select value={form.status} onChange={e => set('status', e.target.value)} className={SELECT}>
                {Object.entries(RC_STATUS).filter(([k]) => k !== 'verified').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div>
              <p className="text-[10px] text-slate-400 mt-1">Use the Verify RC button to mark a release candidate as Verified — evidence must be complete.</p>
            </div>
            <div><label className={LABEL}>Release Type</label>
              <div className="relative"><select value={form.release_type ?? 'standard'} onChange={e => set('release_type', e.target.value)} className={SELECT}>
                {RELEASE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div>
              <p className="text-[10px] text-slate-400 mt-1">Informational only. Set to Prototype for early EOC phases; Historical Migration for retroactive documentation projects.</p>
            </div>
            <div><label className={LABEL}>Description</label><textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)} rows={3} className={INPUT + ' resize-none'} /></div>
            <div><label className={LABEL}>Included Development Stages <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={(form.included_phases ?? []).join('\n')} onChange={e => set('included_phases', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} rows={3} className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>Approved By</label><input value={form.approved_by ?? ''} onChange={e => set('approved_by', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Rollback Point</label><input value={form.rollback_point ?? ''} onChange={e => set('rollback_point', e.target.value)} placeholder="Commit or snapshot reference" className={INPUT} /></div>
          </>}
          {tab === 'quality' && <>
            {(['manual_testing_status','regression_testing_status','deployment_status'] as const).map(k => {
              const labels: Record<typeof k, string> = { manual_testing_status: 'Manual Testing', regression_testing_status: 'Regression Testing', deployment_status: 'Deployment' };
              return (
                <div key={k}><label className={LABEL}>{labels[k]}</label>
                  <div className="relative"><select value={form[k] ?? 'pending'} onChange={e => set(k, e.target.value)} className={SELECT}>
                    {['pending','in_progress','passed','failed','skipped','deployed'].map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                  </select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div>
                </div>
              );
            })}
            <div><label className={LABEL}>Notes</label><textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={6} className={INPUT + ' resize-none'} /></div>
          </>}
          {tab === 'release' && <>
            <div><label className={LABEL}>Release Notes</label><textarea value={form.release_notes ?? ''} onChange={e => set('release_notes', e.target.value)} rows={8} className={INPUT + ' resize-none'} /></div>
            <div><label className={LABEL}>Known Issues</label><textarea value={form.known_issues ?? ''} onChange={e => set('known_issues', e.target.value)} rows={5} className={INPUT + ' resize-none'} /></div>
          </>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div>{rc && (confirmDel
            ? <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Delete?</span>
                <button onClick={() => onDelete?.().then(onClose)} className="text-xs font-semibold text-red-600">Confirm</button>
                <button onClick={() => setConfirmDel(false)} className="text-xs text-slate-400">Cancel</button>
              </div>
            : <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" />Delete</button>
          )}</div>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
            <button onClick={handleSave} disabled={!form.rc_number.trim() || !form.phase_name.trim() || saving}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {rc ? 'Save changes' : 'Create RC'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Release Drawer ────────────────────────────────────────────────────────────

const EMPTY_RELEASE: () => ReleaseInput = () => ({
  version: '', name: null, scope: null, status: 'draft',
  release_date: null, release_notes: null, known_issues: null,
  deployment_notes: null, rollback_plan: null, risks: null, production_status: 'pending',
  db_migrations: [], edge_functions: [], ui_changes: [],
  features: [], bug_fixes: [],
  included_backlog_ids: [], linked_testing_ids: [],
});

interface BacklogOption { id: string; title: string; priority: string; status: string; }
interface QAOption      { id: string; title: string; result: string; }

function ReleaseDrawer({ release, onClose, onSave, onDelete }: {
  release: Release | null; onClose: () => void;
  onSave: (d: ReleaseInput) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [form, setForm] = useState<ReleaseInput>(release ? {
    version: release.version, name: release.name, scope: release.scope,
    status: release.status, release_date: release.release_date,
    release_notes: release.release_notes, known_issues: release.known_issues,
    deployment_notes: release.deployment_notes, rollback_plan: release.rollback_plan,
    risks: release.risks, production_status: release.production_status,
    db_migrations: release.db_migrations ?? [],
    edge_functions: release.edge_functions ?? [],
    ui_changes: release.ui_changes ?? [],
    features: release.features ?? [],
    bug_fixes: release.bug_fixes ?? [],
    included_backlog_ids: release.included_backlog_ids ?? [],
    linked_testing_ids: release.linked_testing_ids ?? [],
  } : EMPTY_RELEASE());
  const [tab, setTab] = useState<'overview' | 'scope' | 'deployment' | 'links'>('overview');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [backlogOptions, setBacklogOptions] = useState<BacklogOption[]>([]);
  const [qaOptions, setQaOptions] = useState<QAOption[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    supabase.from('ecc_backlog_items').select('id,title,priority,status').order('updated_at', { ascending: false }).limit(100)
      .then(({ data }) => setBacklogOptions(data ?? []));
    supabase.from('ecc_testing_reports').select('id,title,result').order('test_date', { ascending: false }).limit(50)
      .then(({ data }) => setQaOptions(data ?? []));
  }, []);

  function set<K extends keyof ReleaseInput>(k: K, v: ReleaseInput[K]) { setForm(f => ({ ...f, [k]: v })); }
  function setLines(key: 'db_migrations' | 'edge_functions' | 'ui_changes' | 'features' | 'bug_fixes', val: string) {
    set(key, val.split('\n').map(s => s.trim()).filter(Boolean));
  }
  function toggleBacklog(id: string) {
    setForm(f => ({
      ...f,
      included_backlog_ids: f.included_backlog_ids.includes(id)
        ? f.included_backlog_ids.filter(x => x !== id)
        : [...f.included_backlog_ids, id],
    }));
  }
  function toggleQA(id: string) {
    setForm(f => ({
      ...f,
      linked_testing_ids: f.linked_testing_ids.includes(id)
        ? f.linked_testing_ids.filter(x => x !== id)
        : [...f.linked_testing_ids, id],
    }));
  }

  async function handleSave() {
    if (!form.version.trim()) return;
    setSaving(true); await onSave(form); setSaving(false);
  }

  const TABS = [
    { key: 'overview'   as const, label: 'Overview' },
    { key: 'scope'      as const, label: 'Scope' },
    { key: 'deployment' as const, label: 'Deployment' },
    { key: 'links'      as const, label: 'Links' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">{release ? `Edit ${release.version}` : 'New Release'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex border-b border-slate-200 px-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-sm font-medium px-3 py-3 mr-1 border-b-2 transition-colors ${tab === t.key ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {tab === 'overview' && <>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Version <span className="text-red-500">*</span></label>
                <input ref={ref} value={form.version} onChange={e => set('version', e.target.value)} placeholder="v1.0.0" className={INPUT} />
              </div>
              <div><label className={LABEL}>Status</label>
                <div className="relative">
                  <select value={form.status} onChange={e => set('status', e.target.value)} className={SELECT}>
                    {['draft','testing','ready','released','hotfix'].map(s => (
                      <option key={s} value={s}>{REL_STATUS[s]?.label ?? s}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div><label className={LABEL}>Name</label><input value={form.name ?? ''} onChange={e => set('name', e.target.value || null)} placeholder="Initial launch" className={INPUT} /></div>
            <div><label className={LABEL}>Release Date</label><input type="date" value={form.release_date ?? ''} onChange={e => set('release_date', e.target.value || null)} className={INPUT} /></div>
            <div><label className={LABEL}>Scope</label><textarea value={form.scope ?? ''} onChange={e => set('scope', e.target.value || null)} rows={3} placeholder="What does this release cover?" className={INPUT + ' resize-none'} /></div>
            <div><label className={LABEL}>Release Notes</label><textarea value={form.release_notes ?? ''} onChange={e => set('release_notes', e.target.value || null)} rows={5} className={INPUT + ' resize-none'} /></div>
            <div><label className={LABEL}>Known Issues</label><textarea value={form.known_issues ?? ''} onChange={e => set('known_issues', e.target.value || null)} rows={3} className={INPUT + ' resize-none'} /></div>
            <div><label className={LABEL}>Risks</label><textarea value={form.risks ?? ''} onChange={e => set('risks', e.target.value || null)} rows={3} placeholder="Potential failure points or concerns" className={INPUT + ' resize-none'} /></div>
          </>}

          {tab === 'scope' && <>
            <div><label className={LABEL}>Included Backlog Items <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.features.join('\n')} onChange={e => setLines('features', e.target.value)} rows={5}
                placeholder="Feature or fix title…" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Bug Fixes <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.bug_fixes.join('\n')} onChange={e => setLines('bug_fixes', e.target.value)} rows={4}
                placeholder="Bug description…" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>UI Changes <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.ui_changes.join('\n')} onChange={e => setLines('ui_changes', e.target.value)} rows={4}
                placeholder="Component or page change…" className={INPUT + ' resize-none'} />
            </div>
          </>}

          {tab === 'deployment' && <>
            <div><label className={LABEL}>Database Migrations <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.db_migrations.join('\n')} onChange={e => setLines('db_migrations', e.target.value)} rows={4}
                placeholder="20260704_migration_name" className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>Edge Functions <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.edge_functions.join('\n')} onChange={e => setLines('edge_functions', e.target.value)} rows={3}
                placeholder="function-name" className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>Deployment Notes</label>
              <textarea value={form.deployment_notes ?? ''} onChange={e => set('deployment_notes', e.target.value || null)} rows={4}
                placeholder="Steps, order of operations, manual steps…" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Rollback Notes</label>
              <textarea value={form.rollback_plan ?? ''} onChange={e => set('rollback_plan', e.target.value || null)} rows={3}
                placeholder="How to undo this release…" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Production Status</label>
              <input value={form.production_status ?? ''} onChange={e => set('production_status', e.target.value || null)} placeholder="pending / deployed / rolled back" className={INPUT} />
            </div>
          </>}

          {tab === 'links' && <>
            <p className="text-xs text-slate-400 mb-2">Link the backlog items and test reports included in this release.</p>

            <div>
              <label className={LABEL}>Included Backlog Items</label>
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {backlogOptions.length === 0
                  ? <p className="text-xs text-slate-400 p-3 text-center">No backlog items</p>
                  : backlogOptions.map(b => {
                      const checked = form.included_backlog_ids.includes(b.id);
                      return (
                        <button key={b.id} type="button" onClick={() => toggleBacklog(b.id)}
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
              {form.included_backlog_ids.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">{form.included_backlog_ids.length} item{form.included_backlog_ids.length > 1 ? 's' : ''} selected</p>
              )}
            </div>

            <div>
              <label className={LABEL}>Testing Reports</label>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {qaOptions.length === 0
                  ? <p className="text-xs text-slate-400 p-3 text-center">No testing reports</p>
                  : qaOptions.map(q => {
                      const checked = form.linked_testing_ids.includes(q.id);
                      return (
                        <button key={q.id} type="button" onClick={() => toggleQA(q.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 transition-colors text-left ${checked ? 'bg-slate-50' : ''}`}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-slate-800 border-slate-800' : 'border-slate-300'}`}>
                            {checked && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className="truncate text-slate-700">{q.title}</span>
                          <span className="ml-auto text-xs capitalize text-slate-400 shrink-0">{q.result}</span>
                        </button>
                      );
                    })}
              </div>
            </div>
          </>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div>{release && (confirmDel
            ? <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Delete?</span>
                <button onClick={() => onDelete?.().then(onClose)} className="text-xs font-semibold text-red-600">Confirm</button>
                <button onClick={() => setConfirmDel(false)} className="text-xs text-slate-400">Cancel</button>
              </div>
            : <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" />Delete</button>
          )}</div>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
            <button onClick={handleSave} disabled={!form.version.trim() || saving}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {release ? 'Save changes' : 'Create release'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Releases Tab ──────────────────────────────────────────────────────────────

function ReleasesTab() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Release | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('ecc_releases').select('*').order('created_at', { ascending: false })
      .then(({ data }) => {
        setReleases((data ?? []).map(r => ({
          ...r,
          db_migrations: r.db_migrations ?? [],
          edge_functions: r.edge_functions ?? [],
          ui_changes: r.ui_changes ?? [],
          features: r.features ?? [],
          bug_fixes: r.bug_fixes ?? [],
          included_backlog_ids: r.included_backlog_ids ?? [],
          linked_testing_ids: r.linked_testing_ids ?? [],
        })));
        setLoading(false);
      });
  }, []);

  async function handleSave(data: ReleaseInput) {
    if (editing) {
      const { data: updated } = await supabase.from('ecc_releases').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editing.id).select().single();
      if (updated) setReleases(rs => rs.map(r => r.id === updated.id ? normalise(updated) : r));
    } else {
      const { data: created } = await supabase.from('ecc_releases').insert(data).select().single();
      if (created) setReleases(rs => [normalise(created), ...rs]);
    }
    setDrawerOpen(false); setEditing(null);
  }

  async function handleDelete() {
    if (!editing) return;
    await supabase.from('ecc_releases').delete().eq('id', editing.id);
    setReleases(rs => rs.filter(r => r.id !== editing.id));
    setDrawerOpen(false); setEditing(null);
  }

  function normalise(r: Release): Release {
    return {
      ...r,
      db_migrations: r.db_migrations ?? [],
      edge_functions: r.edge_functions ?? [],
      ui_changes: r.ui_changes ?? [],
      features: r.features ?? [],
      bug_fixes: r.bug_fixes ?? [],
      included_backlog_ids: r.included_backlog_ids ?? [],
      linked_testing_ids: r.linked_testing_ids ?? [],
    };
  }

  const displayed = filterStatus ? releases.filter(r => r.status === filterStatus) : releases;

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-slate-300 animate-spin" /></div>;

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          {(['draft','testing','ready','released','hotfix'] as const).map(s => {
            const cfg = REL_STATUS[s];
            return (
              <button key={s} onClick={() => setFilterStatus(filterStatus === s ? null : s)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${filterStatus === s ? `${cfg.bg} ${cfg.border} ${cfg.text}` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
              </button>
            );
          })}
          {filterStatus && <button onClick={() => setFilterStatus(null)} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>}
        </div>
        <button onClick={() => { setEditing(null); setDrawerOpen(true); }}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors shrink-0">
          <Plus className="w-4 h-4" /> New Release
        </button>
      </div>

      {displayed.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <Package className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No releases yet. Create one to track what ships.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(rel => {
            const cfg = relCfg(rel.status);
            const isOpen = expanded === rel.id;
            const linkedCount = (rel.included_backlog_ids?.length ?? 0) + (rel.linked_testing_ids?.length ?? 0);
            return (
              <div key={rel.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold shrink-0 ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    {rel.version}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {rel.name && <p className="text-sm font-semibold text-slate-800">{rel.name}</p>}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
                      {rel.release_date && <span className="text-xs text-slate-400">{fmtDate(rel.release_date)}</span>}
                    </div>
                    {rel.scope && <p className="text-xs text-slate-400 mt-0.5 truncate">{rel.scope}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {linkedCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Link2 className="w-3.5 h-3.5" />{linkedCount}
                      </span>
                    )}
                    <button onClick={() => { setEditing(rel); setDrawerOpen(true); }}
                      className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded hover:bg-slate-50 transition-colors">Edit</button>
                    <button onClick={() => setExpanded(isOpen ? null : rel.id)} className="text-slate-400 hover:text-slate-600">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
                    {rel.features.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Scope</p>
                        <ul className="space-y-1">
                          {rel.features.map((f, i) => <li key={i} className="text-xs text-slate-600 flex gap-2"><span className="text-slate-300">—</span>{f}</li>)}
                        </ul>
                      </div>
                    )}
                    {rel.bug_fixes.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Bug Fixes</p>
                        <ul className="space-y-1">
                          {rel.bug_fixes.map((f, i) => <li key={i} className="text-xs text-slate-600 flex gap-2"><span className="text-slate-300">—</span>{f}</li>)}
                        </ul>
                      </div>
                    )}
                    {(rel.db_migrations.length > 0 || rel.edge_functions.length > 0 || rel.ui_changes.length > 0) && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Deployment</p>
                        <div className="grid grid-cols-3 gap-3">
                          {rel.db_migrations.length > 0 && (
                            <div>
                              <p className="text-xs text-slate-400 mb-1">Migrations</p>
                              {rel.db_migrations.map((m, i) => <p key={i} className="text-xs font-mono text-slate-600 truncate">{m}</p>)}
                            </div>
                          )}
                          {rel.edge_functions.length > 0 && (
                            <div>
                              <p className="text-xs text-slate-400 mb-1">Edge Functions</p>
                              {rel.edge_functions.map((f, i) => <p key={i} className="text-xs font-mono text-slate-600">{f}</p>)}
                            </div>
                          )}
                          {rel.ui_changes.length > 0 && (
                            <div>
                              <p className="text-xs text-slate-400 mb-1">UI Changes</p>
                              {rel.ui_changes.map((u, i) => <p key={i} className="text-xs text-slate-600">{u}</p>)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {rel.risks && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Risks</p>
                        <pre className="text-xs text-amber-700 whitespace-pre-wrap font-sans leading-relaxed bg-amber-50 p-2.5 rounded-lg">{rel.risks}</pre>
                      </div>
                    )}
                    {rel.release_notes && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Release Notes</p>
                        <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">{rel.release_notes}</pre>
                      </div>
                    )}
                    {rel.known_issues && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Known Issues</p>
                        <pre className="text-xs text-red-700 whitespace-pre-wrap font-sans leading-relaxed bg-red-50 p-2.5 rounded-lg">{rel.known_issues}</pre>
                      </div>
                    )}
                    {rel.rollback_plan && (
                      <p className="text-xs text-slate-400">Rollback: <span className="font-mono text-slate-600">{rel.rollback_plan}</span></p>
                    )}
                    {(rel.included_backlog_ids.length > 0 || rel.linked_testing_ids.length > 0) && (
                      <div className="flex items-center gap-4 pt-1 border-t border-slate-100">
                        {rel.included_backlog_ids.length > 0 && (
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Tag className="w-3.5 h-3.5" />
                            {rel.included_backlog_ids.length} backlog item{rel.included_backlog_ids.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {rel.linked_testing_ids.length > 0 && (
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <CheckSquare className="w-3.5 h-3.5" />
                            {rel.linked_testing_ids.length} test report{rel.linked_testing_ids.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {drawerOpen && (
        <ReleaseDrawer
          release={editing}
          onClose={() => { setDrawerOpen(false); setEditing(null); }}
          onSave={handleSave}
          onDelete={editing ? handleDelete : undefined}
        />
      )}
    </>
  );
}

// ─── Release Candidates Tab ────────────────────────────────────────────────────

function ChecklistPanel({ rc, computedItems, loading, onToggleManual, onLaunchWizard }: {
  rc: RC;
  computedItems: ComputedItem[] | null;
  loading: boolean;
  onToggleManual: (id: string) => void;
  onLaunchWizard: () => void;
}) {
  const isVerified  = rc.status === 'verified';
  const isEligible  = EXCEPTION_ELIGIBLE_TYPES.has(rc.release_type ?? 'standard');

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Computing evidence…
      </div>
    );
  }
  if (!computedItems) return null;

  const required    = computedItems.filter(c => c.required);
  const optional    = computedItems.filter(c => !c.required);
  const completed   = required.filter(c => c.checked).length;
  const exceptions  = required.filter(c => !!c.historical_exception).length;
  const outstanding = required.filter(c => !c.checked && !c.historical_exception).length;
  const pct         = rcPct(computedItems);
  const isHistorical = isVerified && exceptions > 0;

  // Items eligible for the wizard: verified, eligible release type, incomplete required, no exception yet
  const wizardCandidates = isVerified && isEligible
    ? required.filter(c => !c.checked && !c.historical_exception)
    : [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Release Readiness Checklist</p>
          {isVerified && (
            <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              isHistorical
                ? 'text-slate-600 bg-slate-50 border-slate-200'
                : 'text-emerald-700 bg-emerald-50 border-emerald-200'
            }`}>
              <ShieldCheck className="w-3 h-3" />
              {isHistorical ? 'Verified (Historical)' : 'Verified'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct < 40 ? '#f59e0b' : pct < 75 ? '#3b82f6' : '#10b981' }} />
          </div>
          <span className="text-xs font-semibold text-slate-600">{pct}%</span>
        </div>
      </div>

      {/* Rich summary row */}
      <div className="flex items-center gap-4 mb-3 px-1">
        <span className="flex items-center gap-1 text-[10px] text-emerald-700">
          <span className="font-bold text-sm leading-none">{completed}</span>
          <span className="text-slate-400">completed</span>
        </span>
        {exceptions > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <History className="w-3 h-3 text-slate-400" />
            <span className="font-bold text-sm leading-none">{exceptions}</span>
            <span className="text-slate-400">historical</span>
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <span className={`font-bold text-sm leading-none ${outstanding > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{outstanding}</span>
          <span className="text-slate-400">outstanding</span>
        </span>
      </div>

      {/* Required items */}
      <div className="space-y-1">
        {required.map(item => (
          <ChecklistRow key={item.id} item={item} isVerified={isVerified} onToggle={onToggleManual} />
        ))}
      </div>

      {/* Optional items */}
      {optional.length > 0 && (
        <>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-3 mb-1 px-1">Optional</p>
          <div className="space-y-1">
            {optional.map(item => (
              <ChecklistRow key={item.id} item={item} isVerified={isVerified} onToggle={onToggleManual} />
            ))}
          </div>
        </>
      )}

      {/* Migration Wizard prompt — for eligible verified RCs with outstanding items */}
      {wizardCandidates.length > 0 && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-slate-700">Historical record — evidence incomplete</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {wizardCandidates.length} required item{wizardCandidates.length > 1 ? 's' : ''} cannot be satisfied because this workflow did not exist when this phase was completed.
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Use the Migration Wizard to formally document these as Historical Exceptions. Engineer approval is required for each item.
                </p>
              </div>
            </div>
            <button
              onClick={onLaunchWizard}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors shrink-0"
            >
              <Wand2 className="w-3 h-3" /> Wizard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ item, isVerified, onToggle }: {
  item: ComputedItem;
  isVerified: boolean;
  onToggle: (id: string) => void;
}) {
  const isException = !!item.historical_exception;
  const isClickable = !isVerified && !item.automatic && !isException;

  // Historical Exception rendering
  if (isException) {
    const ex = item.historical_exception!;
    return (
      <div className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
        <div className="w-4 h-4 rounded-full border-2 border-slate-300 bg-white flex items-center justify-center shrink-0 mt-0.5">
          <History className="w-2.5 h-2.5 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500">{item.label}</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
              <History className="w-2.5 h-2.5" /> Historical Exception
            </span>
          </div>
          <div className="mt-1.5 space-y-0.5">
            <p className="text-[10px] text-slate-600">
              <span className="font-semibold text-slate-500">Reason: </span>{ex.reason}
            </p>
            <p className="text-[10px] text-slate-400">
              <span className="font-semibold">Approved by: </span>{ex.approved_by}
              {' · '}
              <span className="font-semibold">Date: </span>{fmtDate(ex.date_approved)}
            </p>
            {ex.notes && (
              <p className="text-[10px] text-slate-400">
                <span className="font-semibold">Notes: </span>{ex.notes}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => isClickable && onToggle(item.id)}
      disabled={!isClickable}
      className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors
        ${item.checked ? 'bg-emerald-50' : isClickable ? 'hover:bg-slate-50' : 'bg-white cursor-default'}
      `}
    >
      {/* Checkbox */}
      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all
        ${item.checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
        {item.checked && <Check className="w-2.5 h-2.5 text-white" />}
      </div>

      {/* Label + evidence note */}
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-medium ${item.checked ? 'text-emerald-700' : 'text-slate-700'}`}>
          {item.label}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          {item.automatic ? (
            <Zap className="w-2.5 h-2.5 text-blue-400 shrink-0" />
          ) : (
            <User className="w-2.5 h-2.5 text-amber-500 shrink-0" />
          )}
          <span className={`text-[10px] ${item.checked ? 'text-emerald-600' : 'text-slate-400'}`}>
            {item.automatic ? 'Automatic' : 'Manual approval'}
            {' · '}
            {item.evidenceNote}
          </span>
        </div>
      </div>

      {/* Required badge */}
      {item.required && !item.checked && !isVerified && (
        <span className="text-[10px] font-semibold text-red-500 shrink-0 mt-0.5">required</span>
      )}
    </button>
  );
}

// ─── Historical Migration Wizard ──────────────────────────────────────────────

interface WizardItemState {
  itemId: string;
  label: string;
  selected: boolean;
  reason: string;
  approvedBy: string;
  dateApproved: string;
  notes: string;
}

function HistoricalMigrationWizard({ rc, computedItems, onClose, onApply }: {
  rc: RC;
  computedItems: ComputedItem[];
  onClose: () => void;
  onApply: (approvals: { itemId: string; exception: HistoricalException }[]) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const eligibleItems = computedItems.filter(i => i.required && !i.checked && !i.historical_exception);

  const [items, setItems] = useState<WizardItemState[]>(() =>
    eligibleItems.map(i => ({
      itemId: i.id,
      label: i.label,
      selected: true,
      reason: HISTORICAL_EXCEPTION_DEFAULT_REASON,
      approvedBy: '',
      dateApproved: today,
      notes: '',
    }))
  );
  const [applying, setApplying] = useState(false);

  function updateItem(itemId: string, patch: Partial<WizardItemState>) {
    setItems(prev => prev.map(i => i.itemId === itemId ? { ...i, ...patch } : i));
  }

  async function handleApply() {
    const selected = items.filter(i => i.selected);
    if (selected.some(i => !i.approvedBy.trim())) return;
    setApplying(true);
    const approvals = selected.map(i => ({
      itemId: i.itemId,
      exception: {
        reason: i.reason.trim(),
        approved_by: i.approvedBy.trim(),
        date_approved: i.dateApproved,
        notes: i.notes.trim() || null,
      } as HistoricalException,
    }));
    await onApply(approvals);
    setApplying(false);
  }

  const selectedCount = items.filter(i => i.selected).length;
  const canApply = selectedCount > 0 && items.filter(i => i.selected).every(i => i.approvedBy.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-slate-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Historical Migration Wizard</h2>
              <p className="text-xs text-slate-500">{rc.rc_number} — {phaseName(rc)}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Policy notice */}
        <div className="px-6 pt-5 pb-0">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-5">
            <p className="text-xs font-semibold text-blue-800 mb-1">Engineering Policy — Historical Exceptions</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              Historical Exceptions exist to preserve the integrity of engineering history, not to bypass workflow.
              They may only be used for early prototype phases or explicitly approved historical migration projects.
              Each exception requires explicit engineer approval and is permanently recorded in the audit trail.
            </p>
          </div>

          {eligibleItems.length === 0 ? (
            <div className="text-center py-8">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600 font-medium">No items require exceptions</p>
              <p className="text-xs text-slate-400 mt-1">All required items are either completed or already have Historical Exceptions.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mb-4">
              The following {eligibleItems.length} required item{eligibleItems.length > 1 ? 's' : ''} cannot be satisfied
              because this Engineering & Operations Centre workflow did not exist when {phaseName(rc)} was completed.
              Review each recommendation and approve those you wish to apply. <span className="font-semibold text-slate-700">Your approval is required for each item.</span>
            </p>
          )}
        </div>

        {/* Items list */}
        {eligibleItems.length > 0 && (
          <div className="overflow-y-auto flex-1 px-6 pb-2 space-y-4">
            {items.map(item => (
              <div key={item.itemId} className={`border rounded-xl p-4 transition-colors ${item.selected ? 'border-slate-300 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                {/* Item header */}
                <label className="flex items-start gap-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={e => updateItem(item.itemId, { selected: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-slate-800"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{item.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Select to include in this migration</p>
                  </div>
                </label>

                {item.selected && (
                  <div className="space-y-3 ml-7">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Reason</label>
                      <textarea
                        value={item.reason}
                        onChange={e => updateItem(item.itemId, { reason: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white resize-none leading-relaxed"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                          Approved By <span className="text-red-500">*</span>
                        </label>
                        <input
                          value={item.approvedBy}
                          onChange={e => updateItem(item.itemId, { approvedBy: e.target.value })}
                          placeholder="Engineer name"
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                          <Calendar className="inline w-2.5 h-2.5 mr-1" />Date Approved
                        </label>
                        <input
                          type="date"
                          value={item.dateApproved}
                          onChange={e => updateItem(item.itemId, { dateApproved: e.target.value })}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes <span className="font-normal normal-case">(optional)</span></label>
                      <input
                        value={item.notes}
                        onChange={e => updateItem(item.itemId, { notes: e.target.value })}
                        placeholder="Additional context…"
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {selectedCount > 0
              ? `${selectedCount} exception${selectedCount > 1 ? 's' : ''} selected — approval required`
              : 'Select items to apply'
            }
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2 hover:text-slate-700 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!canApply || applying}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {applying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Apply {selectedCount > 0 ? `${selectedCount} ` : ''}Exception{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReleaseCandidatesTab() {
  const [rcs, setRcs] = useState<RC[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RC | null>(null);
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);
  const [evidenceByRcId, setEvidenceByRcId] = useState<Record<string, EvidenceData>>({});
  const [evidenceLoading, setEvidenceLoading] = useState<Set<string>>(new Set());
  const [verifyErrors, setVerifyErrors] = useState<Record<string, string[]>>({});
  const [verifying, setVerifying] = useState<string | null>(null);
  const [wizardRcId, setWizardRcId] = useState<string | null>(null);
  const { refresh: refreshActiveRC, logEvent } = useActiveRC();

  useEffect(() => {
    supabase.from('ecc_release_candidates').select('*').order('rc_number', { ascending: true })
      .then(({ data }) => { setRcs(data ?? []); setLoading(false); });
  }, []);

  // Fetch evidence whenever a new RC is expanded
  useEffect(() => {
    if (!expanded) return;
    const rc = rcs.find(r => r.id === expanded);
    if (!rc || evidenceByRcId[expanded] || evidenceLoading.has(expanded)) return;

    setEvidenceLoading(s => new Set(s).add(expanded));
    Promise.all([
      rc.included_backlog_item_ids?.length
        ? supabase.from('ecc_backlog_items').select('id,status').in('id', rc.included_backlog_item_ids)
        : Promise.resolve({ data: [] }),
      rc.linked_testing_ids?.length
        ? supabase.from('ecc_testing_reports').select('id,result,regression_testing_notes,edge_cases,sql_used').in('id', rc.linked_testing_ids)
        : Promise.resolve({ data: [] }),
      rc.linked_doc_ids?.length
        ? supabase.from('ecc_documentation').select('id,tags').in('id', rc.linked_doc_ids)
        : Promise.resolve({ data: [] }),
      rc.linked_journal_ids?.length
        ? supabase.from('ecc_ai_journal').select('id').in('id', rc.linked_journal_ids)
        : Promise.resolve({ data: [] }),
    ]).then(([backlogRes, testRes, docRes, journalRes]) => {
      const ev: EvidenceData = {
        backlogItems:   (backlogRes.data ?? []) as EvidenceData['backlogItems'],
        testingReports: (testRes.data   ?? []) as EvidenceData['testingReports'],
        docs:           (docRes.data    ?? []) as EvidenceData['docs'],
        journalEntries: (journalRes.data ?? []) as EvidenceData['journalEntries'],
      };
      setEvidenceByRcId(prev => ({ ...prev, [expanded]: ev }));
      setEvidenceLoading(s => { const n = new Set(s); n.delete(expanded); return n; });
    });
  }, [expanded, rcs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eagerly fetch evidence for all RCs on initial load so collapsed-row pct is evidence-based
  useEffect(() => {
    if (rcs.length === 0) return;
    rcs.forEach(rc => {
      if (evidenceByRcId[rc.id] || evidenceLoading.has(rc.id)) return;
      setEvidenceLoading(s => new Set(s).add(rc.id));
      Promise.all([
        rc.included_backlog_item_ids?.length
          ? supabase.from('ecc_backlog_items').select('id,status').in('id', rc.included_backlog_item_ids)
          : Promise.resolve({ data: [] }),
        rc.linked_testing_ids?.length
          ? supabase.from('ecc_testing_reports').select('id,result,regression_testing_notes,edge_cases,sql_used').in('id', rc.linked_testing_ids)
          : Promise.resolve({ data: [] }),
        rc.linked_doc_ids?.length
          ? supabase.from('ecc_documentation').select('id,tags').in('id', rc.linked_doc_ids)
          : Promise.resolve({ data: [] }),
        rc.linked_journal_ids?.length
          ? supabase.from('ecc_ai_journal').select('id').in('id', rc.linked_journal_ids)
          : Promise.resolve({ data: [] }),
      ]).then(([backlogRes, testRes, docRes, journalRes]) => {
        const ev: EvidenceData = {
          backlogItems:   (backlogRes.data ?? []) as EvidenceData['backlogItems'],
          testingReports: (testRes.data   ?? []) as EvidenceData['testingReports'],
          docs:           (docRes.data    ?? []) as EvidenceData['docs'],
          journalEntries: (journalRes.data ?? []) as EvidenceData['journalEntries'],
        };
        setEvidenceByRcId(prev => ({ ...prev, [rc.id]: ev }));
        setEvidenceLoading(s => { const n = new Set(s); n.delete(rc.id); return n; });
      });
    });
  }, [rcs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Invalidate cached evidence when a link changes so it refetches on next expand
  function invalidateEvidence(rcId: string) {
    setEvidenceByRcId(prev => { const next = { ...prev }; delete next[rcId]; return next; });
  }

  function nextRCNumber() {
    const nums = rcs.map(r => parseInt(r.rc_number.replace('RC-', ''), 10)).filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `RC-${String(next).padStart(3, '0')}`;
  }

  async function handleSave(data: RCInput) {
    if (editing) {
      const { data: updated } = await supabase.from('ecc_release_candidates').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editing.id).select().single();
      if (updated) {
        setRcs(rs => rs.map(r => r.id === updated.id ? updated : r));
        if (data.status !== editing.status) {
          await logEvent({ event_type: `rc_${data.status}`, event_label: `${editing.rc_number} moved to ${data.status}`, entity_type: 'release_candidate', entity_id: editing.id, entity_title: editing.rc_number });
        }
      }
    } else {
      const { data: created } = await supabase.from('ecc_release_candidates').insert(data).select().single();
      if (created) {
        setRcs(rs => [...rs, created].sort((a, b) => a.rc_number.localeCompare(b.rc_number)));
        await logEvent({ event_type: 'rc_created', event_label: `RC created: ${created.rc_number}`, entity_type: 'release_candidate', entity_id: created.id, entity_title: created.rc_number });
      }
    }
    setDrawerOpen(false); setEditing(null);
  }

  async function handleDelete() {
    if (!editing) return;
    await supabase.from('ecc_release_candidates').delete().eq('id', editing.id);
    setRcs(rs => rs.filter(r => r.id !== editing.id));
    setDrawerOpen(false); setEditing(null);
  }

  async function toggleActive(rc: RC) {
    const newActive = !rc.is_active;
    if (newActive) {
      await supabase.from('ecc_release_candidates').update({ is_active: false }).neq('id', rc.id);
    }
    await supabase.from('ecc_release_candidates').update({ is_active: newActive, updated_at: new Date().toISOString() }).eq('id', rc.id);
    setRcs(rs => rs.map(r => ({ ...r, is_active: r.id === rc.id ? newActive : (newActive ? false : r.is_active) })));
    await refreshActiveRC();
    await logEvent({ event_type: newActive ? 'rc_activated' : 'rc_deactivated', event_label: `${rc.rc_number} ${newActive ? 'set as active' : 'deactivated'}`, entity_type: 'release_candidate', entity_id: rc.id, entity_title: rc.rc_number });
  }

  async function handleToggleManual(rc: RC, itemId: string) {
    const existing = rc.checklist_items ?? [];
    const updated  = existing.map(c => c.id === itemId ? { ...c, checked: !c.checked } : c);
    await supabase.from('ecc_release_candidates').update({ checklist_items: updated, updated_at: new Date().toISOString() }).eq('id', rc.id);
    setRcs(rs => rs.map(r => r.id === rc.id ? { ...r, checklist_items: updated } : r));
  }

  async function handleVerifyRC(rc: RC) {
    const ev = evidenceByRcId[rc.id];
    if (!ev) return;
    const exceptions = extractHistoricalExceptions(rc.checklist_items ?? []);
    const items = computeChecklist(ev, extractManualStates(rc.checklist_items ?? []), exceptions);
    const { canVerify, missing } = validateForVerification(items);
    if (!canVerify) {
      setVerifyErrors(prev => ({ ...prev, [rc.id]: missing }));
      return;
    }
    setVerifyErrors(prev => { const next = { ...prev }; delete next[rc.id]; return next; });
    setVerifying(rc.id);
    // Preserve actual evidence state + exceptions — do not force all to checked:true
    const finalItems: ChecklistItem[] = items.map(i => ({
      id: i.id, label: i.label, required: i.required, checked: i.checked,
      ...(i.historical_exception ? { historical_exception: i.historical_exception } : {}),
    }));
    const now = new Date().toISOString();
    const { data: updated } = await supabase.from('ecc_release_candidates')
      .update({ status: 'verified', verified_at: now, checklist_items: finalItems, updated_at: now })
      .eq('id', rc.id).select().single();
    if (updated) {
      setRcs(rs => rs.map(r => r.id === updated.id ? updated : r));
      await logEvent({ event_type: 'rc_verified', event_label: `${rc.rc_number} verified`, entity_type: 'release_candidate', entity_id: rc.id, entity_title: rc.rc_number });
    }
    setVerifying(null);
  }

  async function handleArchiveRC(rc: RC) {
    const now = new Date().toISOString();
    const { data: updated } = await supabase
      .from('ecc_release_candidates')
      .update({ is_active: false, archived_at: now, updated_at: now })
      .eq('id', rc.id)
      .select()
      .single();
    if (updated) {
      setRcs(rs => rs.map(r => r.id === updated.id ? updated : r));
      await refreshActiveRC();
      await logEvent({
        event_type:   'rc_archived',
        event_label:  `${rc.rc_number} archived`,
        entity_type:  'release_candidate',
        entity_id:    rc.id,
        entity_title: rc.rc_number,
      });
    }
  }

  async function handleApplyExceptions(
    rcId: string,
    approvals: { itemId: string; exception: HistoricalException }[],
  ) {
    const rc = rcs.find(r => r.id === rcId);
    if (!rc || approvals.length === 0) return;
    let updated = [...(rc.checklist_items ?? [])];
    for (const { itemId, exception } of approvals) {
      updated = updated.map(c => c.id === itemId ? { ...c, historical_exception: exception } : c);
    }
    await supabase.from('ecc_release_candidates')
      .update({ checklist_items: updated, updated_at: new Date().toISOString() })
      .eq('id', rcId);
    setRcs(rs => rs.map(r => r.id === rcId ? { ...r, checklist_items: updated } : r));
    invalidateEvidence(rcId);
    for (const { itemId, exception } of approvals) {
      await logEvent({
        event_type: 'rc_historical_exception_applied',
        event_label: `Historical exception applied to ${itemId} on ${rc.rc_number}`,
        entity_type: 'release_candidate', entity_id: rcId, entity_title: rc.rc_number,
        metadata: { item_id: itemId, approved_by: exception.approved_by, date_approved: exception.date_approved },
      });
    }
  }

  async function generateCompletionReport(rc: RC) {
    setGeneratingReport(rc.id);
    try {
      const [journalRes, testRes, backlogRes] = await Promise.all([
        rc.linked_journal_ids?.length
          ? supabase.from('ecc_ai_journal').select('title,session_date,summary,outcome,lessons_learned').in('id', rc.linked_journal_ids)
          : Promise.resolve({ data: [] }),
        rc.linked_testing_ids?.length
          ? supabase.from('ecc_testing_reports').select('title,result,summary,issues_found,manual_testing_notes').in('id', rc.linked_testing_ids)
          : Promise.resolve({ data: [] }),
        rc.included_backlog_item_ids?.length
          ? supabase.from('ecc_backlog_items').select('title,priority,status').in('id', rc.included_backlog_item_ids)
          : Promise.resolve({ data: [] }),
      ]);

      const journals  = (journalRes.data ?? []) as { title: string; session_date: string; summary?: string; outcome?: string; lessons_learned?: string }[];
      const tests     = (testRes.data ?? []) as { title: string; result: string; summary?: string; issues_found?: string; manual_testing_notes?: string }[];
      const blItems   = (backlogRes.data ?? []) as { title: string; priority: string; status: string }[];

      const reportTitle = `EOC Phase Completion Report — ${phaseName(rc)}${rc.version ? ` (${rc.version})` : ''}`;

      const content = [
        `# ${reportTitle}`,
        '',
        '## Overview',
        '',
        `**Phase:** ${phaseName(rc)}`,
        `**RC Number:** ${rc.rc_number}`,
        `**Version:** ${rc.version || 'TBD'}`,
        `**Milestone:** ${rc.milestone || 'TBD'}`,
        `**Status:** ${rc.status}`,
        '',
        '---',
        '',
        '## Backlog Items Completed',
        '',
        blItems.length > 0
          ? blItems.map(i => `- [${i.status === 'released' || i.status === 'verified' || i.status === 'completed' ? 'x' : ' '}] ${i.title} (${i.priority})`).join('\n')
          : '_No backlog items linked._',
        '',
        '## Testing Summary',
        '',
        tests.length > 0
          ? tests.map(t => `### ${t.title}\n**Result:** ${t.result}\n${t.summary ? `**Summary:** ${t.summary}` : ''}${t.issues_found ? `\n**Issues Found:** ${t.issues_found}` : ''}`).join('\n\n')
          : '_No test reports linked._',
        '',
        '## AI Collaboration Summary',
        '',
        journals.length > 0
          ? journals.map(j => `### ${j.title} (${j.session_date})\n${j.summary ? j.summary : ''}${j.lessons_learned ? `\n**Lessons:** ${j.lessons_learned}` : ''}`).join('\n\n')
          : '_No AI journal sessions linked._',
        '',
        '## Release Notes',
        '',
        rc.release_notes || '_To be completed._',
        '',
        '## Known Issues',
        '',
        rc.known_issues || '_None recorded._',
        '',
        '## Lessons Learned',
        '',
        '_To be completed at close of phase._',
      ].join('\n');

      const { data: doc } = await supabase.from('ecc_documentation').insert({
        title:    reportTitle,
        doc_type: 'operations',
        status:   'draft',
        content,
        tags:     ['build-history', 'completion-report', rc.rc_number.toLowerCase()],
        author:   'Engineering',
        version:  rc.version || null,
      }).select('id').single();

      if (doc) {
        const existingDocs = rc.linked_doc_ids ?? [];
        await supabase.from('ecc_release_candidates').update({ linked_doc_ids: [...existingDocs, doc.id], updated_at: new Date().toISOString() }).eq('id', rc.id);
        setRcs(rs => rs.map(r => r.id === rc.id ? { ...r, linked_doc_ids: [...existingDocs, doc.id] } : r));
        invalidateEvidence(rc.id);
        await logEvent({ event_type: 'completion_report_generated', event_label: `Completion report generated for ${rc.rc_number}`, entity_type: 'documentation', entity_id: doc.id, entity_title: reportTitle });
      }
    } finally {
      setGeneratingReport(null);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-slate-300 animate-spin" /></div>;

  return (
    <>
      <div className="flex justify-end mb-5">
        <button onClick={() => { setEditing(null); setDrawerOpen(true); }}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> New RC
        </button>
      </div>

      {rcs.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <Package className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No release candidates yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rcs.map(rc => {
            const cfg    = RC_STATUS[rc.status] ?? RC_STATUS.pending;
            const isOpen = expanded === rc.id;

            // Always compute pct from evidence. Fall back to 0 while evidence is loading.
            const ev             = evidenceByRcId[rc.id];
            const exceptions     = extractHistoricalExceptions(rc.checklist_items ?? []);
            const computedItems  = ev ? computeChecklist(ev, extractManualStates(rc.checklist_items ?? []), exceptions) : null;
            const pct            = computedItems ? rcPct(computedItems) : 0;

            const isVerified = rc.status === 'verified';
            const gates  = [
              { label: 'Manual Testing',   val: rc.manual_testing_status },
              { label: 'Regression Tests', val: rc.regression_testing_status },
              { label: 'Deployment',       val: rc.deployment_status },
            ];
            const hasChecklist = (rc.checklist_items ?? []).length > 0;

            return (
              <div key={rc.id} className={`bg-white rounded-xl border overflow-hidden ${rc.is_active ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200'}`}>
                <div className="flex items-start gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    {/* Phase name — primary title */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phase</span>
                      <p className="text-sm font-semibold text-slate-900">{phaseName(rc)}</p>
                      {rc.is_active && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                          <Activity className="w-2.5 h-2.5" /> ACTIVE
                        </span>
                      )}
                    </div>
                    {/* RC Number · Version · Status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {rc.rc_number}
                      </span>
                      {rc.version && <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">{rc.version}</span>}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
                      {rc.release_type && rc.release_type !== 'standard' && (
                        <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full capitalize">
                          {RELEASE_TYPES.find(t => t.value === rc.release_type)?.label ?? rc.release_type}
                        </span>
                      )}
                    </div>
                    {rc.description && <p className="text-xs text-slate-400 mt-1.5 truncate">{rc.description}</p>}
                    {hasChecklist && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct < 40 ? '#f59e0b' : pct < 75 ? '#3b82f6' : '#10b981' }} />
                        </div>
                        <span className="text-[10px] text-slate-400">{pct}% ready</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {rc.verified_at && <span className="text-xs text-slate-400 hidden md:block">Verified {fmtDate(rc.verified_at)}</span>}
                    <button
                      onClick={() => toggleActive(rc)}
                      title={rc.is_active ? 'Deactivate RC' : 'Set as Active RC'}
                      className={`p-1.5 rounded-lg transition-colors ${rc.is_active ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
                    >
                      <Activity className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { setEditing(rc); setDrawerOpen(true); }}
                      className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded hover:bg-slate-50 transition-colors">Edit</button>
                    <button onClick={() => setExpanded(isOpen ? null : rc.id)} className="text-slate-400 hover:text-slate-600 p-1.5">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-5">

                    {/* Evidence-driven checklist */}
                    {hasChecklist && (
                      <ChecklistPanel
                        rc={rc}
                        computedItems={computedItems}
                        loading={evidenceLoading.has(rc.id)}
                        onToggleManual={id => handleToggleManual(rc, id)}
                        onLaunchWizard={() => setWizardRcId(rc.id)}
                      />
                    )}

                    {/* Verification error panel */}
                    {verifyErrors[rc.id] && verifyErrors[rc.id].length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-red-800 mb-1.5">Release cannot be verified. Missing evidence:</p>
                        <ul className="space-y-0.5">
                          {verifyErrors[rc.id].map(m => (
                            <li key={m} className="flex items-center gap-1.5 text-xs text-red-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />{m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Action bar */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Generate report */}
                      <button
                        onClick={() => generateCompletionReport(rc)}
                        disabled={!!generatingReport}
                        className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                      >
                        {generatingReport === rc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Generate Completion Report
                      </button>

                      {/* Verify RC button — only for non-verified active phases */}
                      {!isVerified && ['in_progress', 'pending'].includes(rc.status) && (
                        <button
                          onClick={() => handleVerifyRC(rc)}
                          disabled={verifying === rc.id || evidenceLoading.has(rc.id)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >
                          {verifying === rc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          Verify RC
                        </button>
                      )}

                      {isVerified && (
                        <div className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border ${
                          computedItems && computedItems.some(i => !!i.historical_exception)
                            ? 'text-slate-600 bg-slate-50 border-slate-200'
                            : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        }`}>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {computedItems && computedItems.some(i => !!i.historical_exception)
                            ? `Verified (Historical) — ${rc.verified_at ? fmtDate(rc.verified_at) : 'complete'}`
                            : `All evidence verified — ${rc.verified_at ? fmtDate(rc.verified_at) : 'complete'}`
                          }
                        </div>
                      )}

                      {isVerified && !rc.archived_at && (
                        <button
                          onClick={() => handleArchiveRC(rc)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          <History className="w-3.5 h-3.5" />
                          Archive RC
                        </button>
                      )}

                      {rc.archived_at && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
                          <History className="w-3.5 h-3.5" />
                          Archived {fmtDate(rc.archived_at)}
                        </div>
                      )}

                      {(rc.linked_doc_ids?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <FileText className="w-3.5 h-3.5" />
                          {rc.linked_doc_ids!.length} doc{rc.linked_doc_ids!.length > 1 ? 's' : ''} linked
                        </div>
                      )}
                    </div>

                    {/* Quality gates */}
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Quality Gates</p>
                      <div className="flex flex-wrap gap-3">
                        {gates.map(g => {
                          const { Icon, color } = qaCfg(g.val);
                          return (
                            <div key={g.label} className="flex items-center gap-1.5 text-xs text-slate-600">
                              <Icon className={`w-4 h-4 ${color}`} />
                              <span className="font-medium">{g.label}</span>
                              <span className="text-slate-400 capitalize">{g.val}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {rc.included_phases?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Included Development Stages</p>
                        <div className="flex flex-wrap gap-1.5">
                          {rc.included_phases.map(b => <span key={b} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{b}</span>)}
                        </div>
                      </div>
                    )}

                    {/* Link counts */}
                    <div className="flex flex-wrap gap-4 text-xs text-slate-400 pt-1 border-t border-slate-100">
                      {(rc.included_backlog_item_ids?.length ?? 0) > 0 && (
                        <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" />{rc.included_backlog_item_ids!.length} backlog items</span>
                      )}
                      {(rc.linked_testing_ids?.length ?? 0) > 0 && (
                        <span className="flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5" />{rc.linked_testing_ids!.length} test reports</span>
                      )}
                      {(rc.linked_journal_ids?.length ?? 0) > 0 && (
                        <span className="flex items-center gap-1"><Link2 className="w-3.5 h-3.5" />{rc.linked_journal_ids!.length} journal sessions</span>
                      )}
                    </div>

                    {rc.release_notes && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Release Notes</p>
                        <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">{rc.release_notes}</pre>
                      </div>
                    )}
                    {rc.known_issues && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Known Issues</p>
                        <pre className="text-xs text-amber-700 whitespace-pre-wrap font-sans leading-relaxed bg-amber-50 p-2.5 rounded-lg">{rc.known_issues}</pre>
                      </div>
                    )}
                    {rc.rollback_point && <p className="text-xs text-slate-400">Rollback: <span className="font-mono text-slate-600">{rc.rollback_point}</span></p>}
                    {rc.approved_by && <p className="text-xs text-slate-400">Approved by: <span className="text-slate-600">{rc.approved_by}</span></p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {drawerOpen && (
        <RCDrawer rc={editing} nextNumber={nextRCNumber()} onClose={() => { setDrawerOpen(false); setEditing(null); }} onSave={handleSave} onDelete={editing ? handleDelete : undefined} />
      )}

      {wizardRcId && (() => {
        const rc = rcs.find(r => r.id === wizardRcId);
        const ev = rc ? evidenceByRcId[rc.id] : undefined;
        if (!rc || !ev) return null;
        const exceptions = extractHistoricalExceptions(rc.checklist_items ?? []);
        const items = computeChecklist(ev, extractManualStates(rc.checklist_items ?? []), exceptions);
        return (
          <HistoricalMigrationWizard
            rc={rc}
            computedItems={items}
            onClose={() => setWizardRcId(null)}
            onApply={async (approvals) => {
              await handleApplyExceptions(wizardRcId, approvals);
              setWizardRcId(null);
            }}
          />
        );
      })()}
    </>
  );
}

// ─── Engineering Gate Tab ──────────────────────────────────────────────────────

interface ReleaseGate {
  id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  gate_type: string;
  threshold_value: number | null;
  severity: string;
}

function EngineeringGateTab() {
  const [gates, setGates] = useState<ReleaseGate[]>([]);
  const [stats, setStats] = useState<{ critical: number; highRisk: number; securityIssues: number; layoutIssues: number; avgHealth: number | null; tp001PassRate: number | null; tp001Rec: string | null }>({
    critical: 0, highRisk: 0, securityIssues: 0, layoutIssues: 0, avgHealth: null, tp001PassRate: null, tp001Rec: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from('engineering_guardian_release_gates').select('*').order('gate_type'),
      supabase.from('architecture_guardian_reviews').select('risk_level, security_issues, layout_severity, engineering_health_score, approval_status'),
      supabase.from('ecc_tp001_executions').select('pass_rate, release_recommendation').eq('status', 'completed').order('completed_at', { ascending: false }).limit(1),
    ]).then(([gatesRes, reviewsRes, tp001Res]) => {
      setGates(gatesRes.data ?? []);
      const reviews = reviewsRes.data ?? [];
      const pending = reviews.filter((r: { approval_status: string }) => r.approval_status !== 'approved');
      const tp001Latest = (tp001Res.data ?? [])[0] as { pass_rate: number | null; release_recommendation: string | null } | undefined;
      setStats({
        critical: pending.filter((r: { risk_level: string }) => r.risk_level === 'critical').length,
        highRisk: pending.filter((r: { risk_level: string }) => r.risk_level === 'high').length,
        securityIssues: pending.reduce((s: number, r: { security_issues?: number }) => s + (r.security_issues ?? 0), 0),
        layoutIssues: pending.filter((r: { layout_severity: string | null }) => r.layout_severity && !['none', null].includes(r.layout_severity)).length,
        avgHealth: reviews.filter((r: { engineering_health_score: number | null }) => r.engineering_health_score != null).length
          ? Math.round(reviews.reduce((s: number, r: { engineering_health_score: number | null }) => s + (r.engineering_health_score ?? 0), 0) / reviews.filter((r: { engineering_health_score: number | null }) => r.engineering_health_score != null).length)
          : null,
        tp001PassRate: tp001Latest?.pass_rate ?? null,
        tp001Rec: tp001Latest?.release_recommendation ?? null,
      });
      setLoading(false);
    });
  }, []);

  async function toggleGate(id: string, enabled: boolean) {
    setSaving(id);
    await supabase.from('engineering_guardian_release_gates').update({ is_enabled: !enabled }).eq('id', id);
    setGates(prev => prev.map(g => g.id === id ? { ...g, is_enabled: !enabled } : g));
    setSaving(null);
  }

  function evaluateGate(gate: ReleaseGate): { status: 'pass' | 'warn' | 'fail' | 'skip'; message: string } {
    if (!gate.is_enabled) return { status: 'skip', message: 'Gate disabled' };
    switch (gate.gate_type) {
      case 'no_critical_findings':   return stats.critical > 0 ? { status: gate.severity === 'blocking' ? 'fail' : 'warn', message: `${stats.critical} critical findings pending PO review` } : { status: 'pass', message: 'No critical findings' };
      case 'max_high_risk':          return stats.highRisk > (gate.threshold_value ?? 3) ? { status: gate.severity === 'blocking' ? 'fail' : 'warn', message: `${stats.highRisk} high-risk reviews exceed threshold of ${gate.threshold_value}` } : { status: 'pass', message: `${stats.highRisk} high-risk reviews (within threshold)` };
      case 'min_engineering_health': return stats.avgHealth != null && stats.avgHealth < (gate.threshold_value ?? 60) ? { status: gate.severity === 'blocking' ? 'fail' : 'warn', message: `Avg health ${stats.avgHealth} below threshold of ${gate.threshold_value}` } : { status: 'pass', message: stats.avgHealth != null ? `Avg engineering health: ${stats.avgHealth}` : 'No health data yet' };
      case 'no_security_issues':     return stats.securityIssues > 0 ? { status: gate.severity === 'blocking' ? 'fail' : 'warn', message: `${stats.securityIssues} unresolved security issues` } : { status: 'pass', message: 'No security issues' };
      case 'no_layout_regressions':  return stats.layoutIssues > 0 ? { status: gate.severity === 'blocking' ? 'fail' : 'warn', message: `${stats.layoutIssues} pending layout violations` } : { status: 'pass', message: 'No layout violations' };
      case 'tp001_pass': {
        if (stats.tp001PassRate == null) return { status: gate.severity === 'blocking' ? 'fail' : 'warn', message: 'No TP-001 execution found' };
        const threshold = gate.threshold_value ?? 85;
        if (stats.tp001PassRate < threshold) return { status: gate.severity === 'blocking' ? 'fail' : 'warn', message: `TP-001 pass rate ${stats.tp001PassRate.toFixed(1)}% below threshold of ${threshold}%` };
        return { status: 'pass', message: `TP-001 pass rate ${stats.tp001PassRate.toFixed(1)}% (${stats.tp001Rec ?? 'PROCEED'})` };
      }
      default: return { status: 'pass', message: 'Gate evaluated' };
    }
  }

  if (loading) return <div className="text-sm text-slate-400 py-8 text-center">Loading gate status…</div>;

  const results = gates.map(g => ({ gate: g, result: evaluateGate(g) }));
  const blocking = results.filter(r => r.result.status === 'fail').length;
  const warnings = results.filter(r => r.result.status === 'warn').length;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Overall gate status */}
      <div className={`flex items-center gap-4 p-4 rounded-xl border ${blocking > 0 ? 'bg-red-50 border-red-200' : warnings > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <ShieldCheck className={`w-8 h-8 shrink-0 ${blocking > 0 ? 'text-red-500' : warnings > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
        <div>
          <p className={`text-base font-bold ${blocking > 0 ? 'text-red-800' : warnings > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
            {blocking > 0 ? `Release Blocked — ${blocking} blocking gate${blocking > 1 ? 's' : ''} failing` : warnings > 0 ? `Release Warning — ${warnings} gate${warnings > 1 ? 's' : ''} require attention` : 'Release Gate: All Clear'}
          </p>
          <p className={`text-xs mt-0.5 ${blocking > 0 ? 'text-red-600' : warnings > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {results.filter(r => r.result.status === 'pass').length}/{results.filter(r => r.gate.is_enabled).length} gates passing
          </p>
        </div>
      </div>

      {/* Gate rules */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Configured Gate Rules</p>
        <div className="space-y-2">
          {results.map(({ gate, result }) => (
            <div key={gate.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {result.status === 'pass' && <CheckSquare className="w-4 h-4 text-emerald-500" />}
                  {result.status === 'fail' && <XCircle className="w-4 h-4 text-red-500" />}
                  {result.status === 'warn' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                  {result.status === 'skip' && <Clock className="w-4 h-4 text-slate-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-sm font-semibold text-slate-800">{gate.name}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${gate.severity === 'blocking' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                      {gate.severity}
                    </span>
                    {!gate.is_enabled && <span className="text-[10px] text-slate-400 italic">disabled</span>}
                  </div>
                  {gate.description && <p className="text-xs text-slate-500 mb-1">{gate.description}</p>}
                  <p className={`text-xs font-medium ${result.status === 'pass' ? 'text-emerald-600' : result.status === 'fail' ? 'text-red-600' : result.status === 'warn' ? 'text-amber-600' : 'text-slate-400'}`}>
                    {result.message}
                  </p>
                </div>
                <button
                  onClick={() => toggleGate(gate.id, gate.is_enabled)}
                  disabled={saving === gate.id}
                  className={`shrink-0 text-xs px-2 py-1 rounded-lg border transition-colors ${gate.is_enabled ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200' : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'}`}
                >
                  {saving === gate.id ? '…' : gate.is_enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function ECCReleaseCentrePage() {
  const [activeTab, setActiveTab] = useState<'releases' | 'candidates' | 'checklist' | 'gate'>('releases');
  const [guardianWarnings, setGuardianWarnings] = useState<number>(0);

  useEffect(() => {
    supabase
      .from('architecture_guardian_reviews')
      .select('id', { count: 'exact', head: true })
      .in('decision', ['REJECT_DUPLICATE', 'NEEDS_PRODUCT_OWNER_REVIEW'])
      .neq('approval_status', 'approved')
      .then(({ count }) => setGuardianWarnings(count ?? 0));
  }, []);

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center gap-3 mb-6">
        <Package className="w-5 h-5 text-slate-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Release Centre</h2>
          <p className="text-sm text-slate-500">Manage versioned releases and release candidates.</p>
        </div>
        {guardianWarnings > 0 && (
          <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700">{guardianWarnings} Engineering Guardian warning{guardianWarnings > 1 ? 's' : ''} require PO review</span>
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6 w-fit">
        {([
          { key: 'releases' as const,   label: 'Releases' },
          { key: 'candidates' as const, label: 'Release Candidates' },
          { key: 'checklist' as const,  label: 'Release Readiness' },
          { key: 'gate' as const,       label: 'Engineering Gate' },
        ]).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'releases'   && <ReleasesTab />}
      {activeTab === 'candidates' && <ReleaseCandidatesTab />}
      {activeTab === 'checklist'  && <ECCComplianceChecklist />}
      {activeTab === 'gate'       && <EngineeringGateTab />}
    </div>
  );
}
