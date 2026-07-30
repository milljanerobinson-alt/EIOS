import { useEffect, useRef, useState } from 'react';
import {
  Plus, X, ChevronDown, Loader2, Trash2, CheckSquare,
  XCircle, Clock, AlertCircle, BookOpen, Check, Copy, Eye,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useActiveRC } from '../../lib/activeRC';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QAReport {
  id: string; title: string; phase?: string; test_date: string; environment: string;
  result: string; summary?: string; objective?: string; tester?: string; version?: string;
  files_modified: string[]; db_migrations: string[]; edge_functions: string[];
  manual_testing_notes?: string; regression_testing_notes?: string;
  performance_testing_notes?: string; security_testing_notes?: string;
  edge_cases?: string; screenshots: string[];
  issues_found?: string; sql_used?: string; deployment_status?: string;
  retest_required: boolean; retest_completed: boolean;
  approved_by?: string;
  linked_release_ids: string[];
  created_at: string;
}

interface TestLibItem {
  id: string; title: string; description?: string; test_type: string; content: string; tags: string[];
}

interface ReleaseOption { id: string; version: string; name: string | null; }

type RptInput = Omit<QAReport, 'id' | 'created_at'>;
type LibInput = Omit<TestLibItem, 'id'>;

// ─── Constants ────────────────────────────────────────────────────────────────

const RESULT_CFG: Record<string, { label: string; color: string; bg: string; border: string; Icon: typeof Clock }> = {
  passed:                  { label: 'Pass',                   color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', Icon: CheckSquare },
  passed_with_observations:{ label: 'Pass w/ Observations',  color: 'text-teal-700',    bg: 'bg-teal-50',    border: 'border-teal-200',    Icon: Eye },
  failed:                  { label: 'Failed',                 color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     Icon: XCircle },
  blocked:                 { label: 'Blocked',                color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   Icon: AlertCircle },
  pending:                 { label: 'Pending',                color: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200',   Icon: Clock },
};

const EMPTY_RPT: () => RptInput = () => ({
  title: '', phase: '', test_date: new Date().toISOString().slice(0, 10), environment: 'production',
  result: 'pending', summary: '', objective: '', tester: '', version: '',
  files_modified: [], db_migrations: [], edge_functions: [],
  manual_testing_notes: '', regression_testing_notes: '',
  performance_testing_notes: '', security_testing_notes: '',
  edge_cases: '', screenshots: [],
  issues_found: '', sql_used: '', deployment_status: '',
  retest_required: false, retest_completed: false, approved_by: '',
  linked_release_ids: [],
});

const SELECT = "w-full appearance-none px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white pr-8";
const INPUT  = "w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white placeholder-slate-300";
const LABEL  = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }

// ─── Report Drawer ────────────────────────────────────────────────────────────

function ReportDrawer({ report, onClose, onSave, onDelete }: {
  report: QAReport | null; onClose: () => void;
  onSave: (d: RptInput) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [form, setForm] = useState<RptInput>(report ? {
    title: report.title, phase: report.phase ?? '', test_date: report.test_date,
    environment: report.environment, result: report.result,
    objective: report.objective ?? '', summary: report.summary ?? '',
    tester: report.tester ?? '', version: report.version ?? '',
    files_modified: report.files_modified ?? [], db_migrations: report.db_migrations ?? [],
    edge_functions: report.edge_functions ?? [],
    manual_testing_notes: report.manual_testing_notes ?? '',
    regression_testing_notes: report.regression_testing_notes ?? '',
    performance_testing_notes: report.performance_testing_notes ?? '',
    security_testing_notes: report.security_testing_notes ?? '',
    edge_cases: report.edge_cases ?? '',
    screenshots: report.screenshots ?? [],
    issues_found: report.issues_found ?? '', sql_used: report.sql_used ?? '',
    deployment_status: report.deployment_status ?? '',
    retest_required: report.retest_required, retest_completed: report.retest_completed,
    approved_by: report.approved_by ?? '',
    linked_release_ids: report.linked_release_ids ?? [],
  } : EMPTY_RPT());

  const [tab, setTab] = useState<'overview' | 'testing' | 'evidence' | 'links'>('overview');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [releaseOptions, setReleaseOptions] = useState<ReleaseOption[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    supabase.from('ecc_releases').select('id,version,name').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setReleaseOptions(data ?? []));
  }, []);

  function set<K extends keyof RptInput>(k: K, v: RptInput[K]) { setForm(f => ({ ...f, [k]: v })); }
  function setLines(key: 'files_modified' | 'db_migrations' | 'edge_functions' | 'screenshots', val: string) {
    set(key, val.split('\n').map(s => s.trim()).filter(Boolean));
  }
  function toggleRelease(id: string) {
    setForm(f => ({
      ...f,
      linked_release_ids: f.linked_release_ids.includes(id)
        ? f.linked_release_ids.filter(x => x !== id)
        : [...f.linked_release_ids, id],
    }));
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true); await onSave({ ...form, title: form.title.trim() }); setSaving(false);
  }

  const TABS = [
    { key: 'overview'  as const, label: 'Overview' },
    { key: 'testing'   as const, label: 'Testing' },
    { key: 'evidence'  as const, label: 'Evidence' },
    { key: 'links'     as const, label: 'Links' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">{report ? 'Edit Report' : 'New Testing Report'}</h2>
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

          {tab === 'overview' && <>
            <div><label className={LABEL}>Title</label><input ref={titleRef} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Test session title…" className={INPUT} /></div>

            <div><label className={LABEL}>Objective</label>
              <textarea value={form.objective ?? ''} onChange={e => set('objective', e.target.value)} rows={2}
                placeholder="What is this test session trying to verify?" className={INPUT + ' resize-none'} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Development Stage</label><input value={form.phase ?? ''} onChange={e => set('phase', e.target.value)} placeholder="Phase 3" className={INPUT} /></div>
              <div><label className={LABEL}>Date</label><input type="date" value={form.test_date} onChange={e => set('test_date', e.target.value)} className={INPUT} /></div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div><label className={LABEL}>Outcome</label>
                <div className="relative">
                  <select value={form.result} onChange={e => set('result', e.target.value)} className={SELECT}>
                    {Object.entries(RESULT_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div><label className={LABEL}>Environment</label>
                <div className="relative">
                  <select value={form.environment} onChange={e => set('environment', e.target.value)} className={SELECT}>
                    {['development','staging','production'].map(e => <option key={e} value={e} className="capitalize">{e.charAt(0).toUpperCase()+e.slice(1)}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div><label className={LABEL}>Version</label><input value={form.version ?? ''} onChange={e => set('version', e.target.value)} placeholder="1.0.0" className={INPUT} /></div>
            </div>

            <div><label className={LABEL}>Tester</label><input value={form.tester ?? ''} onChange={e => set('tester', e.target.value)} placeholder="Name" className={INPUT} /></div>
            <div><label className={LABEL}>Summary</label><textarea value={form.summary ?? ''} onChange={e => set('summary', e.target.value)} rows={3} className={INPUT + ' resize-none'} /></div>
            <div><label className={LABEL}>Bugs Found</label><textarea value={form.issues_found ?? ''} onChange={e => set('issues_found', e.target.value)} rows={3} className={INPUT + ' resize-none'} /></div>

            <div className="flex items-center gap-6">
              {(['retest_required','retest_completed'] as const).map(k => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-slate-800" />
                  <span className="text-sm text-slate-600">{k === 'retest_required' ? 'Retest Required' : 'Retest Completed'}</span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Deployment Status</label><input value={form.deployment_status ?? ''} onChange={e => set('deployment_status', e.target.value)} placeholder="Deployed / Pending" className={INPUT} /></div>
              <div><label className={LABEL}>Approved By</label><input value={form.approved_by ?? ''} onChange={e => set('approved_by', e.target.value)} className={INPUT} /></div>
            </div>
          </>}

          {tab === 'testing' && <>
            <div><label className={LABEL}>Manual Checklist</label>
              <textarea value={form.manual_testing_notes ?? ''} onChange={e => set('manual_testing_notes', e.target.value)} rows={6}
                placeholder="- [ ] Login flow&#10;- [ ] Registration&#10;- [ ] Password reset" className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>Regression Checklist</label>
              <textarea value={form.regression_testing_notes ?? ''} onChange={e => set('regression_testing_notes', e.target.value)} rows={6}
                placeholder="- [ ] Existing auth still works&#10;- [ ] Assessments unaffected" className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>Edge Cases</label>
              <textarea value={form.edge_cases ?? ''} onChange={e => set('edge_cases', e.target.value)} rows={4}
                placeholder="- Empty state handling&#10;- Concurrent session&#10;- Mobile viewport" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Performance Testing</label><textarea value={form.performance_testing_notes ?? ''} onChange={e => set('performance_testing_notes', e.target.value)} rows={3} className={INPUT + ' resize-none'} /></div>
            <div><label className={LABEL}>Security Testing</label><textarea value={form.security_testing_notes ?? ''} onChange={e => set('security_testing_notes', e.target.value)} rows={3} className={INPUT + ' resize-none'} /></div>
          </>}

          {tab === 'evidence' && <>
            <div><label className={LABEL}>Files Modified <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.files_modified.join('\n')} onChange={e => setLines('files_modified', e.target.value)} rows={4} placeholder="src/pages/..." className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>Database Migrations <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.db_migrations.join('\n')} onChange={e => setLines('db_migrations', e.target.value)} rows={3} placeholder="20260704_..." className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>Edge Functions <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.edge_functions.join('\n')} onChange={e => setLines('edge_functions', e.target.value)} rows={3} className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>SQL Validation</label>
              <textarea value={form.sql_used ?? ''} onChange={e => set('sql_used', e.target.value)} rows={6} placeholder="SELECT ..." className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>Screenshots <span className="font-normal normal-case">(one URL or path per line)</span></label>
              <textarea value={form.screenshots.join('\n')} onChange={e => setLines('screenshots', e.target.value)} rows={3} placeholder="https://..." className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
          </>}

          {tab === 'links' && <>
            <p className="text-xs text-slate-400">Link this test report to the releases it covers.</p>
            <div>
              <label className={LABEL}>Linked Releases</label>
              <div className="space-y-1.5">
                {releaseOptions.length === 0
                  ? <p className="text-xs text-slate-400 py-2">No releases available — create one in Release Centre first.</p>
                  : releaseOptions.map(r => {
                      const checked = form.linked_release_ids.includes(r.id);
                      return (
                        <button key={r.id} type="button" onClick={() => toggleRelease(r.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${checked ? 'border-slate-300 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
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
          <div>{report && (confirmDel
            ? <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Delete?</span>
                <button onClick={() => onDelete?.().then(onClose)} className="text-xs font-semibold text-red-600">Confirm</button>
                <button onClick={() => setConfirmDel(false)} className="text-xs text-slate-400">Cancel</button>
              </div>
            : <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" />Delete</button>
          )}</div>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
            <button onClick={handleSave} disabled={!form.title.trim() || saving}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {report ? 'Save changes' : 'Create report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Test Library ─────────────────────────────────────────────────────────────

function TestLibraryTab() {
  const [items, setItems] = useState<TestLibItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<LibInput>({ title: '', description: '', test_type: 'manual', content: '', tags: [] });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('ecc_test_library').select('*').order('created_at', { ascending: false }).then(({ data }) => { setItems(data ?? []); setLoading(false); });
  }, []);

  async function handleCreate() {
    if (!form.title.trim()) return;
    setSaving(true);
    const { data } = await supabase.from('ecc_test_library').insert({ ...form, title: form.title.trim() }).select().single();
    if (data) setItems(i => [data, ...i]);
    setCreating(false); setForm({ title: '', description: '', test_type: 'manual', content: '', tags: [] }); setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from('ecc_test_library').delete().eq('id', id);
    setItems(i => i.filter(x => x.id !== id)); setOpen(null);
  }

  function copyContent(item: TestLibItem) {
    navigator.clipboard.writeText(item.content).then(() => { setCopied(item.id); setTimeout(() => setCopied(null), 2000); });
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-slate-300 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add script
        </button>
      </div>

      {creating && (
        <div className="bg-white rounded-xl border border-slate-300 p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className={LABEL}>Title</label><input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} autoFocus className={INPUT} /></div>
            <div><label className={LABEL}>Type</label>
              <div className="relative"><select value={form.test_type} onChange={e => setForm(f => ({...f, test_type: e.target.value}))} className={SELECT}>
                {['sql','regression','smoke','api','e2e','manual'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div>
            </div>
          </div>
          <div><label className={LABEL}>Description</label><input value={form.description ?? ''} onChange={e => setForm(f => ({...f, description: e.target.value}))} className={INPUT} /></div>
          <div><label className={LABEL}>Content</label><textarea value={form.content} onChange={e => setForm(f => ({...f, content: e.target.value}))} rows={8} className={INPUT + ' resize-none font-mono text-xs'} /></div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setCreating(false)} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
            <button onClick={handleCreate} disabled={!form.title.trim() || saving}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && !creating && (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <BookOpen className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No scripts in the library yet.</p>
        </div>
      )}

      {items.map(item => (
        <div key={item.id} className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setOpen(open === item.id ? null : item.id)}>
            <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase shrink-0">{item.test_type}</span>
            <p className="text-sm font-semibold text-slate-800 flex-1">{item.title}</p>
            {item.description && <p className="text-xs text-slate-400 hidden sm:block truncate max-w-xs">{item.description}</p>}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={e => { e.stopPropagation(); copyContent(item); }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors">
                {copied === item.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === item.id ? 'Copied' : 'Copy'}
              </button>
              <button onClick={e => { e.stopPropagation(); handleDelete(item.id); }} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          {open === item.id && (
            <div className="px-5 pb-4 border-t border-slate-100">
              <pre className="mt-3 text-xs text-slate-700 bg-slate-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">{item.content}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main QA Page ─────────────────────────────────────────────────────────────

export function ECCQAPage() {
  const [tab, setTab] = useState<'reports' | 'library'>('reports');
  const [reports, setReports] = useState<QAReport[]>([]);
  const [loading, setLoading] = useState(true);
  const { activeRC, addToActiveRC, logEvent } = useActiveRC();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<QAReport | null>(null);
  const [filterResult, setFilterResult] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('ecc_testing_reports').select('*').order('test_date', { ascending: false })
      .then(({ data }) => {
        setReports((data ?? []).map(r => ({
          ...r,
          screenshots: Array.isArray(r.screenshots) ? r.screenshots : [],
          linked_release_ids: Array.isArray(r.linked_release_ids) ? r.linked_release_ids : [],
        })));
        setLoading(false);
      });
  }, []);

  function openNew() { setEditing(null); setDrawerOpen(true); }
  function openEdit(r: QAReport) { setEditing(r); setDrawerOpen(true); }

  async function handleSave(data: RptInput) {
    const safe = { ...data, screenshots: data.screenshots, linked_release_ids: data.linked_release_ids };
    if (editing) {
      const { data: updated } = await supabase.from('ecc_testing_reports').update({ ...safe, updated_at: new Date().toISOString() }).eq('id', editing.id).select().single();
      if (updated) setReports(rs => rs.map(r => r.id === updated.id ? { ...updated, screenshots: updated.screenshots ?? [], linked_release_ids: updated.linked_release_ids ?? [] } : r));
    } else {
      const { data: created } = await supabase.from('ecc_testing_reports').insert(safe).select().single();
      if (created) {
        setReports(rs => [{ ...created, screenshots: created.screenshots ?? [], linked_release_ids: created.linked_release_ids ?? [] }, ...rs]);
        if (activeRC) {
          await addToActiveRC('testing', created.id);
          await logEvent({ event_type: 'testing_started', event_label: `Testing report created: ${created.title}`, entity_type: 'testing_report', entity_id: created.id, entity_title: created.title });
        }
      }
    }
    setDrawerOpen(false); setEditing(null);
  }

  async function handleDelete() {
    if (!editing) return;
    await supabase.from('ecc_testing_reports').delete().eq('id', editing.id);
    setReports(rs => rs.filter(r => r.id !== editing.id));
    setDrawerOpen(false); setEditing(null);
  }

  const displayed = reports.filter(r => !filterResult || r.result === filterResult);

  const FILTER_RESULTS = ['passed', 'passed_with_observations', 'failed', 'blocked', 'pending'] as const;

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(['reports','library'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t === 'library' ? 'Test Library' : 'Reports'}
            </button>
          ))}
        </div>
        {tab === 'reports' && (
          <button onClick={openNew} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> New report
          </button>
        )}
      </div>

      {tab === 'reports' && (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {FILTER_RESULTS.map(r => {
              const cfg = RESULT_CFG[r];
              return (
                <button key={r} onClick={() => setFilterResult(filterResult === r ? null : r)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${filterResult === r ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                  {cfg.label}
                </button>
              );
            })}
            {filterResult && <button onClick={() => setFilterResult(null)} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>}
          </div>

          {loading ? <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-slate-300 animate-spin" /></div>
          : displayed.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
              <CheckSquare className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No test reports yet. Create one to start tracking QA.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayed.map(r => {
                const cfg = RESULT_CFG[r.result] ?? RESULT_CFG.pending;
                const Icon = cfg.Icon;
                return (
                  <button key={r.id} onClick={() => openEdit(r)}
                    className="w-full bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4 hover:border-slate-300 hover:shadow-sm transition-all text-left">
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border shrink-0 ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                      <Icon className="w-3.5 h-3.5" />{cfg.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{r.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{r.phase ? `${r.phase} · ` : ''}{r.environment} · {fmtDate(r.test_date)}{r.tester ? ` · ${r.tester}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.retest_required && !r.retest_completed && (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">Retest needed</span>
                      )}
                      {r.issues_found && <span className="text-xs text-red-500 bg-red-50 border border-red-200 px-2 py-1 rounded">Issues</span>}
                      {(r.linked_release_ids?.length ?? 0) > 0 && (
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">{r.linked_release_ids.length} release{r.linked_release_ids.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'library' && <TestLibraryTab />}

      {drawerOpen && (
        <ReportDrawer report={editing} onClose={() => { setDrawerOpen(false); setEditing(null); }} onSave={handleSave} onDelete={editing ? handleDelete : undefined} />
      )}
    </div>
  );
}
