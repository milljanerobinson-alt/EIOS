import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, Plus, Loader2, AlertTriangle, Search, ChevronRight,
  ChevronDown, ChevronUp, XCircle, Clock, User, Flag, BarChart3,
  Target, Layers, PlayCircle, RefreshCw, Trash2, Edit3, Check,
  ArrowLeft, FileText, FlaskConical, Activity, TrendingUp,
  Shield, BookOpen, Package, Bug, ClipboardList,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ECCDefectsPanel } from './ECCDefectsPanel';
import { ECCQAPage } from './ECCQAPage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TestPlan {
  id: string;
  plan_number: string | null;
  title: string;
  description: string | null;
  status: string;
  test_type: string;
  priority: string;
  owner: string | null;
  target_release: string | null;
  due_date: string | null;
  total_suites: number;
  total_cases: number;
  cases_passed: number;
  cases_failed: number;
  cases_skipped: number;
  coverage_percent: number | null;
  linked_rec_ids: string[] | null;
  notes: string | null;
  created_at: string;
}

interface TestSuite {
  id: string;
  plan_id: string;
  suite_number: string | null;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  total_cases: number;
  cases_passed: number;
  cases_failed: number;
  created_at: string;
}

interface TestCase {
  id: string;
  suite_id: string;
  plan_id: string;
  case_number: string | null;
  title: string;
  description: string | null;
  steps: string | null;
  expected_result: string | null;
  actual_result: string | null;
  status: string;
  test_type: string;
  severity: string;
  feature_id: string | null;
  run_date: string | null;
  run_by: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PLAN_STATUS_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  draft:       { label: 'Draft',       bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400'   },
  active:      { label: 'Active',      bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  in_progress: { label: 'In Progress', bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  completed:   { label: 'Completed',   bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  archived:    { label: 'Archived',    bg: 'bg-slate-100',  text: 'text-slate-500',   dot: 'bg-slate-300'   },
};

const CASE_STATUS_CFG: Record<string, { label: string; color: string; Icon: typeof Check }> = {
  pending:  { label: 'Pending',  color: 'text-slate-500',   Icon: Clock       },
  pass:     { label: 'Pass',     color: 'text-emerald-600', Icon: Check       },
  fail:     { label: 'Fail',     color: 'text-red-600',     Icon: XCircle     },
  skipped:  { label: 'Skipped',  color: 'text-amber-600',   Icon: ChevronRight},
  blocked:  { label: 'Blocked',  color: 'text-orange-600',  Icon: AlertTriangle },
};

const TEST_TYPES = ['feature', 'integration', 'regression', 'smoke', 'performance', 'security', 'acceptance'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function coverageColor(pct: number) {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 60) return 'text-teal-600';
  if (pct >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function coverageBar(pct: number) {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 60) return 'bg-teal-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function CoverageRing({ pct }: { pct: number }) {
  const r = 22, c = 2 * Math.PI * r;
  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#14b8a6' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="56" height="56">
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" stroke="#e2e8f0" />
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" stroke={color}
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span className="text-xs font-bold text-slate-800">{pct}%</span>
    </div>
  );
}

// ─── Plan Form ────────────────────────────────────────────────────────────────

function PlanForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<TestPlan>;
  onSave: (data: Partial<TestPlan>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title:          initial?.title          ?? '',
    description:    initial?.description    ?? '',
    test_type:      initial?.test_type      ?? 'feature',
    priority:       initial?.priority       ?? 'medium',
    owner:          initial?.owner          ?? '',
    target_release: initial?.target_release ?? '',
    due_date:       initial?.due_date        ?? '',
    notes:          initial?.notes          ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave({
      title:          form.title.trim(),
      description:    form.description.trim() || undefined,
      test_type:      form.test_type,
      priority:       form.priority,
      owner:          form.owner.trim() || undefined,
      target_release: form.target_release.trim() || undefined,
      due_date:       form.due_date || undefined,
      notes:          form.notes.trim() || undefined,
    });
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h4 className="text-sm font-semibold text-slate-800">{initial?.id ? 'Edit Test Plan' : 'New Test Plan'}</h4>
      <div>
        <label className="text-xs font-medium text-slate-600 block mb-1.5">Title <span className="text-red-500">*</span></label>
        <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Authentication Test Plan — Phase 3..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600 block mb-1.5">Description</label>
        <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="What does this plan cover?"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Type</label>
          <select value={form.test_type} onChange={e => setForm(f => ({ ...f, test_type: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none capitalize">
            {TEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Priority</label>
          <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none capitalize">
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Owner</label>
          <input type="text" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
            placeholder="Name or team..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Due Date</label>
          <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors">Cancel</button>
        <button onClick={submit} disabled={!form.title.trim() || saving}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {initial?.id ? 'Save Changes' : 'Create Plan'}
        </button>
      </div>
    </div>
  );
}

// ─── Plan Detail ──────────────────────────────────────────────────────────────

function PlanDetail({ plan, onBack, onUpdated }: { plan: TestPlan; onBack: () => void; onUpdated: () => void }) {
  const [suites, setSuites]         = useState<TestSuite[]>([]);
  const [cases, setCases]           = useState<TestCase[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<'suites' | 'cases' | 'overview'>('overview');
  const [expandedSuites, setExpanded] = useState<Set<string>>(new Set());
  const [addingSuite, setAddingSuite] = useState(false);
  const [addingCase, setAddingCase]  = useState<string | null>(null);
  const [suiteForm, setSuiteForm]    = useState({ title: '', description: '', category: '' });
  const [caseForm, setCaseForm]      = useState({
    title: '', description: '', steps: '', expected_result: '',
    test_type: 'manual', severity: 'medium', feature_id: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from('ecc_test_suites').select('*').eq('plan_id', plan.id).order('created_at'),
      supabase.from('ecc_test_cases').select('*').eq('plan_id', plan.id).order('created_at'),
    ]);
    setSuites(s ?? []);
    setCases(c ?? []);
    setLoading(false);
  }, [plan.id]);

  useEffect(() => { load(); }, [load]);

  async function addSuite() {
    if (!suiteForm.title.trim()) return;
    setSaving(true);
    await supabase.from('ecc_test_suites').insert({
      plan_id: plan.id,
      title: suiteForm.title.trim(),
      description: suiteForm.description.trim() || null,
      category: suiteForm.category.trim() || null,
    });
    setSuiteForm({ title: '', description: '', category: '' });
    setAddingSuite(false);
    setSaving(false);
    load();
    onUpdated();
  }

  async function addCase(suiteId: string) {
    if (!caseForm.title.trim()) return;
    setSaving(true);
    await supabase.from('ecc_test_cases').insert({
      suite_id: suiteId,
      plan_id: plan.id,
      title: caseForm.title.trim(),
      description: caseForm.description.trim() || null,
      steps: caseForm.steps.trim() || null,
      expected_result: caseForm.expected_result.trim() || null,
      test_type: caseForm.test_type,
      severity: caseForm.severity,
      feature_id: caseForm.feature_id.trim() || null,
    });
    setCaseForm({ title: '', description: '', steps: '', expected_result: '', test_type: 'manual', severity: 'medium', feature_id: '' });
    setAddingCase(null);
    setSaving(false);
    load();
    onUpdated();
  }

  async function updateCaseStatus(id: string, status: string) {
    await supabase.from('ecc_test_cases').update({
      status,
      run_date: status !== 'pending' ? new Date().toISOString().split('T')[0] : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    load();
    onUpdated();
  }

  async function deleteCase(id: string) {
    await supabase.from('ecc_test_cases').delete().eq('id', id);
    load();
    onUpdated();
  }

  async function deleteSuite(id: string) {
    await supabase.from('ecc_test_suites').delete().eq('id', id);
    load();
    onUpdated();
  }

  const totalCases  = cases.length;
  const passed      = cases.filter(c => c.status === 'pass').length;
  const failed      = cases.filter(c => c.status === 'fail').length;
  const pending     = cases.filter(c => c.status === 'pending').length;
  const coverage    = totalCases > 0 ? Math.round((passed / totalCases) * 100) : 0;
  const passRate    = (totalCases - pending) > 0 ? Math.round((passed / (totalCases - pending)) * 100) : 0;
  const cfg         = PLAN_STATUS_CFG[plan.status] ?? PLAN_STATUS_CFG.draft;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start gap-3 mb-4">
          <button onClick={onBack} className="p-1.5 mt-0.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {plan.plan_number && <span className="text-xs font-mono text-slate-400">{plan.plan_number}</span>}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
                <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full capitalize">{plan.test_type}</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900">{plan.title}</h2>
            {plan.description && <p className="text-xs text-slate-500 mt-0.5">{plan.description}</p>}
          </div>
        </div>
        <div className="flex gap-1">
          {(['overview', 'suites', 'cases'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-lg capitalize transition-colors ${
                activeTab === t ? 'bg-slate-50 text-slate-900 border border-b-0 border-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <div className="p-6 max-w-3xl space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-center gap-2 col-span-1">
                    <CoverageRing pct={coverage} />
                    <span className="text-xs text-slate-500">Coverage</span>
                  </div>
                  {[
                    { label: 'Total Cases', val: totalCases, color: 'text-slate-800' },
                    { label: 'Passed',      val: passed,     color: 'text-emerald-600' },
                    { label: 'Failed',      val: failed,     color: failed > 0 ? 'text-red-600' : 'text-slate-400' },
                    { label: 'Pass Rate',   val: passRate > 0 ? `${passRate}%` : '—', color: passRate >= 80 ? 'text-emerald-600' : passRate >= 50 ? 'text-amber-600' : 'text-red-600' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                      <p className={`text-xl font-bold ${color}`}>{val}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4">Suite Breakdown</h3>
                  {suites.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">No test suites yet. Go to Suites tab to add one.</p>
                  ) : (
                    <div className="space-y-3">
                      {suites.map(s => {
                        const suiteCases = cases.filter(c => c.suite_id === s.id);
                        const sPassed = suiteCases.filter(c => c.status === 'pass').length;
                        const pct = suiteCases.length > 0 ? Math.round((sPassed / suiteCases.length) * 100) : 0;
                        return (
                          <div key={s.id} className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-700 font-medium">{s.title}</span>
                              <span className={`text-xs font-bold ${coverageColor(pct)}`}>{sPassed}/{suiteCases.length}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${coverageBar(pct)}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {plan.notes && (
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-800 mb-2">Notes</h3>
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{plan.notes}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'suites' && (
              <div className="p-6 max-w-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">{suites.length} suite{suites.length !== 1 ? 's' : ''}</p>
                  {!addingSuite && (
                    <button onClick={() => setAddingSuite(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors">
                      <Plus className="w-3.5 h-3.5" />Add Suite
                    </button>
                  )}
                </div>

                {addingSuite && (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-800">New Test Suite</h4>
                    <input type="text" value={suiteForm.title} onChange={e => setSuiteForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Suite title..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={suiteForm.category} onChange={e => setSuiteForm(f => ({ ...f, category: e.target.value }))}
                        placeholder="Category (e.g. Authentication)..." className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
                      <input type="text" value={suiteForm.description} onChange={e => setSuiteForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Description..." className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setAddingSuite(false)} className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs">Cancel</button>
                      <button onClick={addSuite} disabled={!suiteForm.title.trim() || saving}
                        className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5">
                        {saving && <Loader2 className="w-3 h-3 animate-spin" />}Add Suite
                      </button>
                    </div>
                  </div>
                )}

                {suites.length === 0 && !addingSuite ? (
                  <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center">
                    <Layers className="w-7 h-7 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No suites yet.</p>
                  </div>
                ) : (
                  suites.map(s => {
                    const suiteCases = cases.filter(c => c.suite_id === s.id);
                    const sPassed = suiteCases.filter(c => c.status === 'pass').length;
                    const sFailed = suiteCases.filter(c => c.status === 'fail').length;
                    const open = expandedSuites.has(s.id);
                    return (
                      <div key={s.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <button className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                          onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}>
                          <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                            {s.category && <p className="text-xs text-slate-400 mt-0.5">{s.category}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-emerald-600 font-semibold">{sPassed} pass</span>
                            {sFailed > 0 && <span className="text-xs text-red-600 font-semibold">{sFailed} fail</span>}
                            <span className="text-xs text-slate-400">{suiteCases.length} cases</span>
                            {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                          </div>
                        </button>

                        {open && (
                          <div className="border-t border-slate-100 p-4 space-y-2 bg-slate-50/50">
                            {suiteCases.map(tc => {
                              const cCfg = CASE_STATUS_CFG[tc.status] ?? CASE_STATUS_CFG.pending;
                              const CIcon = cCfg.Icon;
                              return (
                                <div key={tc.id} className="flex items-center gap-3 bg-white rounded-lg border border-slate-100 p-3">
                                  <CIcon className={`w-4 h-4 shrink-0 ${cCfg.color}`} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-800 truncate">{tc.title}</p>
                                    <p className="text-[10px] text-slate-400 capitalize">{tc.test_type} · {tc.severity}</p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {tc.status === 'pending' && (
                                      <>
                                        <button onClick={() => updateCaseStatus(tc.id, 'pass')}
                                          className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[10px] font-semibold">Pass</button>
                                        <button onClick={() => updateCaseStatus(tc.id, 'fail')}
                                          className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[10px] font-semibold">Fail</button>
                                        <button onClick={() => updateCaseStatus(tc.id, 'skipped')}
                                          className="px-2 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded text-[10px]">Skip</button>
                                      </>
                                    )}
                                    {tc.status !== 'pending' && (
                                      <button onClick={() => updateCaseStatus(tc.id, 'pending')}
                                        className="px-2 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded text-[10px]">Reset</button>
                                    )}
                                    <button onClick={() => deleteCase(tc.id)} className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-400 rounded transition-colors">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            {addingCase === s.id ? (
                              <div className="bg-white rounded-lg border border-blue-100 p-3 space-y-2 mt-2">
                                <input type="text" value={caseForm.title} onChange={e => setCaseForm(f => ({ ...f, title: e.target.value }))}
                                  placeholder="Test case title..." className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none" />
                                <div className="grid grid-cols-3 gap-2">
                                  <select value={caseForm.test_type} onChange={e => setCaseForm(f => ({ ...f, test_type: e.target.value }))}
                                    className="px-2 py-1.5 text-xs border border-slate-200 rounded capitalize">
                                    {['manual', 'automated', 'exploratory'].map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                  <select value={caseForm.severity} onChange={e => setCaseForm(f => ({ ...f, severity: e.target.value }))}
                                    className="px-2 py-1.5 text-xs border border-slate-200 rounded capitalize">
                                    {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  <input type="text" value={caseForm.feature_id} onChange={e => setCaseForm(f => ({ ...f, feature_id: e.target.value }))}
                                    placeholder="FEAT-xxx" className="px-2 py-1.5 text-xs border border-slate-200 rounded" />
                                </div>
                                <textarea rows={2} value={caseForm.steps} onChange={e => setCaseForm(f => ({ ...f, steps: e.target.value }))}
                                  placeholder="Test steps..." className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded resize-none focus:outline-none" />
                                <textarea rows={1} value={caseForm.expected_result} onChange={e => setCaseForm(f => ({ ...f, expected_result: e.target.value }))}
                                  placeholder="Expected result..." className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded resize-none focus:outline-none" />
                                <div className="flex gap-2">
                                  <button onClick={() => setAddingCase(null)} className="px-2.5 py-1 border border-slate-200 text-slate-500 rounded text-xs">Cancel</button>
                                  <button onClick={() => addCase(s.id)} disabled={!caseForm.title.trim() || saving}
                                    className="px-2.5 py-1 bg-slate-900 text-white rounded text-xs font-semibold disabled:opacity-50">Add Case</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => { setAddingCase(s.id); setCaseForm({ title:'', description:'', steps:'', expected_result:'', test_type:'manual', severity:'medium', feature_id:'' }); }}
                                className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 rounded-lg text-xs transition-colors">
                                <Plus className="w-3.5 h-3.5" />Add Test Case
                              </button>
                            )}

                            <div className="flex justify-end pt-1">
                              <button onClick={() => deleteSuite(s.id)}
                                className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors">
                                <Trash2 className="w-3 h-3" />Delete Suite
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'cases' && (
              <div className="p-6 max-w-3xl space-y-3">
                <p className="text-xs text-slate-500">{cases.length} total cases across {suites.length} suites</p>
                {cases.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center">
                    <FlaskConical className="w-7 h-7 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No test cases yet. Add them from the Suites tab.</p>
                  </div>
                ) : (
                  cases.map(tc => {
                    const cCfg = CASE_STATUS_CFG[tc.status] ?? CASE_STATUS_CFG.pending;
                    const CIcon = cCfg.Icon;
                    const suite = suites.find(s => s.id === tc.suite_id);
                    return (
                      <div key={tc.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
                        <CIcon className={`w-4 h-4 shrink-0 mt-0.5 ${cCfg.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800">{tc.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{suite?.title ?? '—'} · {tc.test_type} · {tc.severity}</p>
                          {tc.steps && <p className="text-xs text-slate-500 mt-2 whitespace-pre-wrap">{tc.steps}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {tc.status === 'pending' ? (
                            <>
                              <button onClick={() => updateCaseStatus(tc.id, 'pass')} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-semibold">Pass</button>
                              <button onClick={() => updateCaseStatus(tc.id, 'fail')} className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[11px] font-semibold">Fail</button>
                            </>
                          ) : (
                            <button onClick={() => updateCaseStatus(tc.id, 'pending')} className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded text-[11px]">Reset</button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function TestingDashboard({ onSelectPlan }: { onSelectPlan: (p: TestPlan) => void }) {
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [allCases, setAllCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('ecc_test_plans').select('*').order('created_at', { ascending: false }),
      supabase.from('ecc_test_cases').select('id, status, plan_id'),
    ]);
    setPlans(p ?? []);
    setAllCases(c ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createPlan(data: Partial<TestPlan>) {
    const { data: plan } = await supabase
      .from('ecc_test_plans')
      .insert({ ...data, status: 'draft' })
      .select()
      .single();
    setAdding(false);
    if (plan) { await load(); onSelectPlan(plan); }
  }

  async function deletePlan(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this test plan and all its suites and cases?')) return;
    await supabase.from('ecc_test_plans').delete().eq('id', id);
    load();
  }

  const totalCases  = allCases.length;
  const passed      = allCases.filter(c => c.status === 'pass').length;
  const failed      = allCases.filter(c => c.status === 'fail').length;
  const coverage    = totalCases > 0 ? Math.round((passed / totalCases) * 100) : 0;
  const activePlans = plans.filter(p => p.status === 'active' || p.status === 'in_progress').length;

  const filtered = search
    ? plans.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.plan_number?.toLowerCase().includes(search.toLowerCase()))
    : plans;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
              <FlaskConical className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Testing Sprint</h1>
              <p className="text-xs text-slate-400">Test plans, suites, cases &amp; coverage tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={() => setAdding(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors">
              <Plus className="w-4 h-4" />New Plan
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-4xl mx-auto">

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Test Plans', val: plans.length, color: 'text-slate-800', sub: `${activePlans} active` },
              { label: 'Test Cases', val: totalCases, color: 'text-slate-800', sub: `${passed} passed` },
              { label: 'Failed', val: failed, color: failed > 0 ? 'text-red-600' : 'text-slate-400', sub: failed > 0 ? 'Needs attention' : 'None failing' },
              { label: 'Coverage', val: `${coverage}%`, color: coverageColor(coverage), sub: `${passed}/${totalCases} passing` },
            ].map(({ label, val, color, sub }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className={`text-2xl font-bold ${color}`}>{val}</p>
                <p className="text-xs text-slate-400 mt-0.5">{label}</p>
                <p className="text-[10px] text-slate-300 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* REC-001 prompt if no plans */}
          {plans.length === 0 && !adding && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">REC-001: Testing Sprint Required</p>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    AUD-002 identified that 86 production features have zero formal test coverage. This is the critical engineering risk blocking Phase 3 GA.
                    Create your first test plan to begin the Testing Sprint.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Coverage bar */}
          {totalCases > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">Overall Coverage</h3>
                <span className={`text-sm font-bold ${coverageColor(coverage)}`}>{coverage}%</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${coverageBar(coverage)}`} style={{ width: `${coverage}%` }} />
              </div>
              <div className="flex gap-4 mt-3">
                {[
                  { label: 'Passed', count: passed, color: 'text-emerald-600' },
                  { label: 'Failed', count: failed, color: failed > 0 ? 'text-red-600' : 'text-slate-400' },
                  { label: 'Pending', count: allCases.filter(c => c.status === 'pending').length, color: 'text-slate-500' },
                ].map(({ label, count, color }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={`text-sm font-bold ${color}`}>{count}</span>
                    <span className="text-xs text-slate-400">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {adding && (
            <PlanForm
              onSave={createPlan}
              onCancel={() => setAdding(false)}
            />
          )}

          {/* Search */}
          {plans.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search test plans..."
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
          )}

          {/* Plan cards */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : filtered.length === 0 && !adding ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
              <FlaskConical className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-700 mb-1">
                {search ? 'No plans match your search' : 'No test plans yet'}
              </h3>
              <p className="text-sm text-slate-400 max-w-xs mx-auto mb-5">
                {search ? 'Try a different search term.' : 'Start the Testing Sprint by creating your first test plan.'}
              </p>
              {!search && (
                <button onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors">
                  <Plus className="w-4 h-4" />Create First Plan
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map(plan => {
                const planCases = allCases.filter(c => c.plan_id === plan.id);
                const pPassed = planCases.filter(c => c.status === 'pass').length;
                const pct = planCases.length > 0 ? Math.round((pPassed / planCases.length) * 100) : 0;
                const cfg = PLAN_STATUS_CFG[plan.status] ?? PLAN_STATUS_CFG.draft;
                return (
                  <button key={plan.id} onClick={() => onSelectPlan(plan)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-slate-300 hover:shadow-sm transition-all group">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {plan.plan_number && <span className="text-xs font-mono text-slate-400">{plan.plan_number}</span>}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
                          <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full capitalize">{plan.test_type}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-bold ${coverageColor(pct)}`}>{pct}%</span>
                        <button onClick={(e) => deletePlan(plan.id, e)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-400 rounded transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-slate-900 mb-1">{plan.title}</p>
                    {plan.description && <p className="text-xs text-slate-400 truncate">{plan.description}</p>}
                    <div className="mt-3 space-y-1.5">
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${coverageBar(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">{pPassed}/{planCases.length} cases passing</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ECCTestingPage() {
  const [selected, setSelected] = useState<TestPlan | null>(null);
  const [, setRefreshTick] = useState(0);
  const [activeTab, setActiveTab] = useState<'plans' | 'defects' | 'qa-reports'>('plans');

  if (selected) {
    return (
      <div className="h-full flex flex-col">
        <PlanDetail
          plan={selected}
          onBack={() => setSelected(null)}
          onUpdated={() => setRefreshTick(t => t + 1)}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 pt-4">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('plans')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'plans' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <FlaskConical className="w-4 h-4" />Test Plans
          </button>
          <button
            onClick={() => setActiveTab('defects')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'defects' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <Bug className="w-4 h-4" />Defects
          </button>
          <button
            onClick={() => setActiveTab('qa-reports')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'qa-reports' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <ClipboardList className="w-4 h-4" />QA Reports
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'plans'      && <TestingDashboard onSelectPlan={setSelected} />}
        {activeTab === 'defects'    && (
          <div className="h-full overflow-y-auto">
            <ECCDefectsPanel />
          </div>
        )}
        {activeTab === 'qa-reports' && (
          <div className="h-full overflow-y-auto">
            <ECCQAPage />
          </div>
        )}
      </div>
    </div>
  );
}
