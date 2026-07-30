/**
 * Testing Framework — Permanent Quality System
 *
 * This is the unified hub for all testing activity in the ECC.
 * It does NOT duplicate ECCTestingPage or ECCQAPage — it embeds them
 * alongside a coverage dashboard, release readiness checklist, and
 * a copyable test evidence report.
 *
 * Tabs:
 *  1. Dashboard    — metrics, coverage, defect summary, RC readiness
 *  2. Test Plans   — ECCTestingPage (plans/suites/cases/runs)
 *  3. QA Reports   — ECCQAPage (manual test session reports + library)
 *  4. Defects      — ECCDefectsPanel (full defect lifecycle)
 *  5. RC Readiness — release candidate checklist instances
 *  6. Evidence     — copyable test evidence report builder
 */

import { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical, BarChart3, ClipboardList, Bug, Shield, FileText,
  CheckCircle2, XCircle, AlertTriangle, Clock, Loader2,
  Copy, Check, Package, ChevronRight, Plus, Trash2,
  Activity, History, Map, Tag, ArrowRight,
  Layers, BookOpen, MoreHorizontal, Edit2, Archive, Copy as CopyIcon, Trash,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ECCQAPage } from './ECCQAPage';
import { ECCDefectsPanel } from './ECCDefectsPanel';
import { scoreColor, scoreBarColor } from './ECCAuditPage';
import { useActiveRC } from '../../lib/activeRC';
import { ECCTestPlanDetailPage, type TestPlanRow } from './ECCTestPlanDetailPage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashMetrics {
  totalPlans: number;
  activePlans: number;
  totalCases: number;
  casesPassed: number;
  casesFailed: number;
  casesBlocked: number;
  overallPassRate: number;
  totalReports: number;
  reportsPassed: number;
  totalDefects: number;
  openDefects: number;
  criticalDefects: number;
  avgCoverage: number;
}

interface RcChecklistItem {
  id: string;
  rc_id: string;
  title: string;
  category: string | null;
  item_type: string;
  status: string;
  notes: string | null;
  completed_by: string | null;
  completed_at: string | null;
}

interface RC {
  id: string;
  rc_number: string;
  phase_name: string;
  status: string;
  manual_testing_status: string;
  regression_testing_status: string;
}

interface FeatureCoverage {
  id: string;
  feature_id: string;
  name: string;
  category: string;
  testing_status: string;
  test_case_count: number;
  open_defect_count: number;
  last_tested_at: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CHECKLIST_STATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  pending:  { label: 'Pending',  bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400'   },
  pass:     { label: 'Pass',     bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  fail:     { label: 'Fail',     bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500'     },
  blocked:  { label: 'Blocked',  bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  na:       { label: 'N/A',      bg: 'bg-slate-50',    text: 'text-slate-400',   border: 'border-slate-200',   dot: 'bg-slate-300'   },
  deferred: { label: 'Deferred', bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200',  dot: 'bg-orange-400'  },
};

const TESTING_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  not_tested:       { label: 'Not Tested',      color: 'text-slate-500',   bg: 'bg-slate-100'   },
  testing:          { label: 'Testing',          color: 'text-blue-600',    bg: 'bg-blue-50'     },
  passed:           { label: 'Passed',           color: 'text-emerald-700', bg: 'bg-emerald-50'  },
  failed:           { label: 'Failed',           color: 'text-red-700',     bg: 'bg-red-50'      },
  requires_retest:  { label: 'Needs Retest',     color: 'text-amber-700',   bg: 'bg-amber-50'    },
  requires_review:  { label: 'Needs Review',     color: 'text-orange-700',  bg: 'bg-orange-50'   },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChecklistStatusBadge({ status }: { status: string }) {
  const cfg = CHECKLIST_STATUS_CFG[status] ?? CHECKLIST_STATUS_CFG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy Report'}
    </button>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [metrics, setMetrics] = useState<DashMetrics | null>(null);
  const [coverage, setCoverage] = useState<FeatureCoverage[]>([]);
  const [activeRcFull, setActiveRcFull] = useState<RC | null>(null);
  const [loading, setLoading] = useState(true);
  const { activeRC } = useActiveRC();

  const load = useCallback(async () => {
    setLoading(true);

    const [plans, cases, reports, defects, features, rcFull] = await Promise.all([
      supabase.from('ecc_test_plans').select('status, total_cases, cases_passed, cases_failed, coverage_percent'),
      supabase.from('ecc_test_cases').select('status'),
      supabase.from('ecc_testing_reports').select('result'),
      supabase.from('ecc_defects').select('status, severity'),
      supabase.from('ecc_product_features').select('id, feature_id, name, category, testing_status, test_case_count, open_defect_count, last_tested_at').order('category'),
      activeRC?.id
        ? supabase.from('ecc_release_candidates').select('id, rc_number, phase_name, status, manual_testing_status, regression_testing_status').eq('id', activeRC.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const ps = plans.data ?? [];
    const cs = cases.data ?? [];
    const rs = reports.data ?? [];
    const ds = defects.data ?? [];

    const totalCases = cs.length;
    const casesPassed = cs.filter(c => c.status === 'pass').length;
    const casesFailed = cs.filter(c => c.status === 'fail').length;
    const casesBlocked = cs.filter(c => c.status === 'blocked').length;

    const coverageVals = ps.map(p => p.coverage_percent ?? 0).filter(v => v > 0);
    const avgCoverage = coverageVals.length > 0 ? Math.round(coverageVals.reduce((a, b) => a + b, 0) / coverageVals.length) : 0;

    setMetrics({
      totalPlans: ps.length,
      activePlans: ps.filter(p => p.status === 'active' || p.status === 'in_progress').length,
      totalCases,
      casesPassed,
      casesFailed,
      casesBlocked,
      overallPassRate: totalCases > 0 ? Math.round((casesPassed / totalCases) * 100) : 0,
      totalReports: rs.length,
      reportsPassed: rs.filter(r => r.result === 'passed' || r.result === 'passed_with_observations').length,
      totalDefects: ds.length,
      openDefects: ds.filter(d => d.status === 'open' || d.status === 'in_progress').length,
      criticalDefects: ds.filter(d => d.severity === 'critical' && (d.status === 'open' || d.status === 'in_progress')).length,
      avgCoverage,
    });

    setCoverage((features.data ?? []) as FeatureCoverage[]);
    if (rcFull && 'data' in rcFull && rcFull.data) setActiveRcFull(rcFull.data as RC);
    setLoading(false);
  }, [activeRC?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
    </div>
  );

  if (!metrics) return null;

  // Features needing attention
  const needsAttention = coverage.filter(f =>
    f.testing_status === 'failed' || f.testing_status === 'requires_retest' || f.open_defect_count > 0 || f.test_case_count === 0
  ).slice(0, 8);

  const notTested = coverage.filter(f => f.testing_status === 'not_tested' || f.test_case_count === 0).length;
  const tested = coverage.length - notTested;
  const coveragePct = coverage.length > 0 ? Math.round((tested / coverage.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Active RC testing status */}
      {activeRC && activeRcFull && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-blue-800">Active RC: {activeRcFull.rc_number} — {activeRcFull.phase_name}</span>
            </div>
            <button onClick={() => onNavigate('rc-readiness')} className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
              View Readiness <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-6 mt-3">
            <div className="flex items-center gap-1.5">
              {activeRcFull.manual_testing_status === 'passed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Clock className="w-3.5 h-3.5 text-amber-500" />}
              <span className="text-xs text-blue-700">Manual: <strong>{activeRcFull.manual_testing_status}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              {activeRcFull.regression_testing_status === 'passed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Clock className="w-3.5 h-3.5 text-amber-500" />}
              <span className="text-xs text-blue-700">Regression: <strong>{activeRcFull.regression_testing_status}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <StatCard label="Pass Rate" value={`${metrics.overallPassRate}%`} sub={`${metrics.casesPassed}/${metrics.totalCases} cases`} color={scoreColor(metrics.overallPassRate)} />
        <StatCard label="Feature Coverage" value={`${coveragePct}%`} sub={`${tested}/${coverage.length} features`} color={scoreColor(coveragePct)} />
        <StatCard label="Active Plans" value={metrics.activePlans} sub={`${metrics.totalPlans} total plans`} />
        <StatCard label="Open Defects" value={metrics.openDefects} sub={`${metrics.criticalDefects} critical`} color={metrics.criticalDefects > 0 ? 'text-red-600' : metrics.openDefects > 0 ? 'text-amber-600' : 'text-emerald-600'} />
        <StatCard label="QA Reports" value={metrics.reportsPassed} sub={`of ${metrics.totalReports} passed`} color={metrics.totalReports > 0 ? scoreColor(Math.round((metrics.reportsPassed / metrics.totalReports) * 100)) : 'text-slate-400'} />
      </div>

      {/* Progress bars */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Test Case Results</p>
          {[
            { label: 'Pass',    count: metrics.casesPassed,  bar: 'bg-emerald-500' },
            { label: 'Fail',    count: metrics.casesFailed,  bar: 'bg-red-500' },
            { label: 'Blocked', count: metrics.casesBlocked, bar: 'bg-amber-500' },
            { label: 'Pending', count: metrics.totalCases - metrics.casesPassed - metrics.casesFailed - metrics.casesBlocked, bar: 'bg-slate-300' },
          ].map(r => (
            <div key={r.label} className="flex items-center gap-2 mb-1.5">
              <span className="text-xs text-slate-500 w-14 shrink-0">{r.label}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${r.bar}`} style={{ width: metrics.totalCases > 0 ? `${(r.count / metrics.totalCases) * 100}%` : '0%' }} />
              </div>
              <span className="text-xs font-semibold text-slate-600 w-6 text-right">{r.count}</span>
            </div>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Feature Testing Status</p>
          {(['not_tested', 'testing', 'passed', 'failed', 'requires_retest'] as const).map(s => {
            const count = coverage.filter(f => f.testing_status === s).length;
            const cfg = TESTING_STATUS_CFG[s];
            return (
              <div key={s} className="flex items-center gap-2 mb-1.5">
                <span className="text-xs text-slate-500 w-20 shrink-0">{cfg.label}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${scoreBarColor(s === 'passed' ? 100 : s === 'failed' ? 0 : 50)}`} style={{ width: coverage.length > 0 ? `${(count / coverage.length) * 100}%` : '0%' }} />
                </div>
                <span className="text-xs font-semibold text-slate-600 w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Defect Summary</p>
          <div className="space-y-2">
            {metrics.criticalDefects > 0 && (
              <div className="flex items-center justify-between p-2 bg-red-50 border border-red-100 rounded-lg">
                <span className="text-xs font-semibold text-red-700">Critical Open</span>
                <span className="text-sm font-bold text-red-700">{metrics.criticalDefects}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Open Defects</span>
              <span className="text-sm font-bold text-slate-700">{metrics.openDefects}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Total Defects</span>
              <span className="text-sm font-bold text-slate-700">{metrics.totalDefects}</span>
            </div>
            <button onClick={() => onNavigate('defects')} className="w-full mt-2 text-xs text-blue-600 hover:text-blue-700 font-semibold text-left flex items-center gap-1">
              View all defects <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Features needing attention */}
      {needsAttention.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Features Needing Attention ({needsAttention.length})</p>
          </div>
          <div className="divide-y divide-slate-100">
            {needsAttention.map(f => {
              const cfg = TESTING_STATUS_CFG[f.testing_status] ?? TESTING_STATUS_CFG.not_tested;
              return (
                <div key={f.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{f.feature_id}</span>
                    <span className="text-sm text-slate-700 truncate">{f.name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{f.category}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {f.open_defect_count > 0 && (
                      <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{f.open_defect_count} defects</span>
                    )}
                    {f.test_case_count === 0 && (
                      <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">no tests</span>
                    )}
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RC Readiness Tab ─────────────────────────────────────────────────────────

function RCReadinessTab() {
  const { activeRC } = useActiveRC();
  const [rcs, setRcs] = useState<RC[]>([]);
  const [selectedRcId, setSelectedRcId] = useState<string | null>(null);
  const [items, setItems] = useState<RcChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string; template_number: string; items: { id: string; title: string; category: string; item_type: string }[] }[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    supabase.from('ecc_release_candidates').select('id, rc_number, phase_name, status, manual_testing_status, regression_testing_status')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const list = (data ?? []) as RC[];
        setRcs(list);
        const id = activeRC?.id ?? list[0]?.id ?? null;
        setSelectedRcId(id);
        setLoading(false);
      });

    supabase.from('ecc_checklist_templates').select('id, name, template_number').then(({ data: tmplData }) => {
      if (!tmplData) return;
      Promise.all(tmplData.map(async t => {
        const { data: items } = await supabase.from('ecc_checklist_template_items')
          .select('id, title, category, item_type').eq('template_id', t.id).order('sort_order');
        return { ...t, items: items ?? [] };
      })).then(setTemplates);
    });
  }, [activeRC]);

  useEffect(() => {
    if (!selectedRcId) return;
    setLoadingItems(true);
    supabase.from('ecc_rc_checklist_instances').select('*')
      .eq('rc_id', selectedRcId)
      .order('category')
      .then(({ data }) => {
        setItems((data ?? []) as RcChecklistItem[]);
        setLoadingItems(false);
      });
  }, [selectedRcId]);

  async function applyTemplate(templateId: string) {
    if (!selectedRcId) return;
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;
    setSaving('applying');
    const rows = tmpl.items.map(item => ({
      rc_id: selectedRcId,
      template_id: templateId,
      item_id: item.id,
      title: item.title,
      category: item.category,
      item_type: item.item_type,
      status: 'pending',
    }));
    await supabase.from('ecc_rc_checklist_instances').insert(rows);
    setSaving(null);
    // reload
    const { data } = await supabase.from('ecc_rc_checklist_instances').select('*')
      .eq('rc_id', selectedRcId).order('category');
    setItems((data ?? []) as RcChecklistItem[]);
  }

  async function updateItem(id: string, status: string) {
    setSaving(id);
    await supabase.from('ecc_rc_checklist_instances').update({
      status,
      completed_by: status !== 'pending' ? 'Product Owner' : null,
      completed_at: status !== 'pending' ? new Date().toISOString() : null,
    }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, status, completed_by: status !== 'pending' ? 'Product Owner' : null } : i));
    setSaving(null);
  }

  async function clearItems() {
    if (!selectedRcId) return;
    setSaving('clearing');
    await supabase.from('ecc_rc_checklist_instances').delete().eq('rc_id', selectedRcId);
    setItems([]);
    setSaving(null);
  }

  const selectedRc = rcs.find(r => r.id === selectedRcId);
  const passed = items.filter(i => i.status === 'pass').length;
  const failed = items.filter(i => i.status === 'fail').length;
  const blocked = items.filter(i => i.status === 'blocked').length;
  const pct = items.length > 0 ? Math.round((passed / items.length) * 100) : 0;

  const categories = [...new Set(items.map(i => i.category ?? 'General'))];

  // Generate copyable report
  const report = selectedRc ? `# Release Readiness Checklist — ${selectedRc.rc_number} ${selectedRc.phase_name}
Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

## Summary
- Total Items: ${items.length}
- Passed: ${passed}
- Failed: ${failed}
- Blocked: ${blocked}
- Pass Rate: ${pct}%
- Manual Testing: ${selectedRc.manual_testing_status}
- Regression Testing: ${selectedRc.regression_testing_status}

${categories.map(cat => `## ${cat}
${items.filter(i => (i.category ?? 'General') === cat).map(i => `- [${i.status.toUpperCase()}] ${i.title}${i.notes ? `\n  Notes: ${i.notes}` : ''}`).join('\n')}`).join('\n\n')}

${failed > 0 ? `## Failures\n${items.filter(i => i.status === 'fail').map(i => `- ${i.title}${i.notes ? `: ${i.notes}` : ''}`).join('\n')}` : '## No Failures'}

## Decision
${failed === 0 && blocked === 0 ? '✅ READY FOR RELEASE — All checklist items passed.' : `⚠️ NOT READY — ${failed} failure(s), ${blocked} blocked item(s) require resolution.`}
` : '';

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Release Candidate Readiness</h2>
          <p className="text-sm text-slate-500 mt-0.5">Checklist instances applied to specific releases.</p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && report && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer text-xs font-medium text-slate-600 transition-colors"
              onClick={() => navigator.clipboard.writeText(report)}>
              <Copy className="w-3.5 h-3.5" /> Copy Report
            </div>
          )}
          {items.length > 0 && (
            <button onClick={clearItems} disabled={saving === 'clearing'} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* RC selector */}
      <div className="flex items-center gap-3">
        <select value={selectedRcId ?? ''} onChange={e => setSelectedRcId(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
          {rcs.map(r => (
            <option key={r.id} value={r.id}>{r.rc_number} — {r.phase_name} [{r.status}]</option>
          ))}
        </select>
        {selectedRc && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Manual: <strong className={selectedRc.manual_testing_status === 'passed' ? 'text-emerald-600' : 'text-amber-600'}>{selectedRc.manual_testing_status}</strong></span>
            <span className="text-xs text-slate-500">Regression: <strong className={selectedRc.regression_testing_status === 'passed' ? 'text-emerald-600' : 'text-amber-600'}>{selectedRc.regression_testing_status}</strong></span>
          </div>
        )}
      </div>

      {loadingItems ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
      ) : items.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
          <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600 mb-1">No checklist applied</p>
          <p className="text-xs text-slate-400 mb-4">Apply a release readiness template to track this RC's quality gates.</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {templates.map(t => (
              <button key={t.id} onClick={() => applyTemplate(t.id)} disabled={saving === 'applying'}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                {saving === 'applying' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Apply {t.template_number} — {t.name}
              </button>
            ))}
            {templates.length === 0 && (
              <p className="text-xs text-slate-400">No checklist templates found. Add templates in Platform Admin.</p>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Progress summary */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Pass',    value: passed,  color: 'text-emerald-600' },
              { label: 'Fail',    value: failed,  color: 'text-red-600' },
              { label: 'Blocked', value: blocked, color: 'text-amber-600' },
              { label: 'Pending', value: items.filter(i => i.status === 'pending').length, color: 'text-slate-500' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${scoreBarColor(pct)}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-slate-500">{pct}% complete — {passed}/{items.length} items passed</p>

          {/* Checklist grouped by category */}
          {categories.map(cat => (
            <div key={cat} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{cat}</p>
              </div>
              <div className="divide-y divide-slate-100">
                {items.filter(i => (i.category ?? 'General') === cat).map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{item.title}</p>
                      {item.item_type === 'mandatory' && <span className="text-[10px] text-red-500 font-semibold">MANDATORY</span>}
                      {item.completed_by && <p className="text-xs text-slate-400 mt-0.5">by {item.completed_by}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ChecklistStatusBadge status={item.status} />
                      <select
                        value={item.status}
                        onChange={e => updateItem(item.id, e.target.value)}
                        disabled={saving === item.id}
                        className="text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none"
                      >
                        {Object.entries(CHECKLIST_STATUS_CFG).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Release decision */}
          <div className={`rounded-xl p-4 border ${failed === 0 && blocked === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2">
              {failed === 0 && blocked === 0
                ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                : <XCircle className="w-5 h-5 text-red-500" />}
              <p className={`text-sm font-semibold ${failed === 0 && blocked === 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {failed === 0 && blocked === 0
                  ? 'Readiness checklist complete — all items passed'
                  : `Not ready — ${failed} failure(s)${blocked > 0 ? `, ${blocked} blocked` : ''} require resolution`}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Evidence Report Tab ──────────────────────────────────────────────────────

function EvidenceTab() {
  const [plans, setPlans] = useState<{ id: string; plan_number: string; title: string; cases_passed: number; total_cases: number; coverage_percent: number | null; status: string }[]>([]);
  const [reports, setReports] = useState<{ id: string; title: string; result: string; test_date: string; tester: string | null; environment: string }[]>([]);
  const [defects, setDefects] = useState<{ id: string; defect_number: string; title: string; severity: string; status: string }[]>([]);
  const [selectedPlans, setSelectedPlans] = useState<Set<string>>(new Set());
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [reportText, setReportText] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('ecc_test_plans').select('id, plan_number, title, cases_passed, total_cases, coverage_percent, status').order('created_at', { ascending: false }),
      supabase.from('ecc_testing_reports').select('id, title, result, test_date, tester, environment').order('test_date', { ascending: false }),
      supabase.from('ecc_defects').select('id, defect_number, title, severity, status').order('created_at', { ascending: false }).limit(50),
    ]).then(([p, r, d]) => {
      setPlans(p.data ?? []);
      setReports(r.data ?? []);
      setDefects(d.data ?? []);
      setLoading(false);
    });
  }, []);

  function buildReport() {
    const chosenPlans = plans.filter(p => selectedPlans.has(p.id));
    const chosenReports = reports.filter(r => selectedReports.has(r.id));
    const openDefs = defects.filter(d => d.status === 'open' || d.status === 'in_progress');
    const criticalDefs = defects.filter(d => d.severity === 'critical' && (d.status === 'open' || d.status === 'in_progress'));

    const text = `# Test Evidence Report
Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

## Test Plans (${chosenPlans.length} selected)
${chosenPlans.map(p => `### ${p.plan_number ?? 'N/A'} — ${p.title}
- Status: ${p.status}
- Pass Rate: ${p.total_cases > 0 ? Math.round((p.cases_passed / p.total_cases) * 100) : 0}% (${p.cases_passed}/${p.total_cases} cases)
- Coverage: ${p.coverage_percent ?? 0}%`).join('\n\n') || 'No test plans selected.'}

## QA Test Reports (${chosenReports.length} selected)
${chosenReports.map(r => `- ${r.title} | ${r.result.toUpperCase()} | ${r.test_date} | ${r.environment} | Tester: ${r.tester ?? 'N/A'}`).join('\n') || 'No QA reports selected.'}

## Defect Summary
- Total Defects: ${defects.length}
- Open Defects: ${openDefs.length}
- Critical Open: ${criticalDefs.length}
${criticalDefs.length > 0 ? '\n### Critical Open Defects\n' + criticalDefs.map(d => `- ${d.defect_number}: ${d.title}`).join('\n') : ''}

## Overall Assessment
${chosenPlans.length > 0 ? `Average Pass Rate: ${Math.round(chosenPlans.reduce((sum, p) => sum + (p.total_cases > 0 ? (p.cases_passed / p.total_cases) * 100 : 0), 0) / chosenPlans.length)}%` : 'No plans selected.'}
Open Defects: ${openDefs.length} | Critical: ${criticalDefs.length}
QA Reports: ${chosenReports.length} selected | ${chosenReports.filter(r => r.result === 'passed' || r.result === 'passed_with_observations').length} passed

## Sign-off
Prepared for Product Owner review.
`;
    setReportText(text);
  }

  function handleCopy() {
    navigator.clipboard.writeText(reportText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Test Evidence Report Builder</h2>
        <p className="text-sm text-slate-500 mt-0.5">Select test plans and QA reports to include, then generate a copyable evidence report.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Test Plans selector */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Test Plans ({selectedPlans.size} selected)</p>
            <button onClick={() => setSelectedPlans(new Set(plans.map(p => p.id)))} className="text-xs text-blue-600 hover:text-blue-700">Select All</button>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {plans.map(p => (
              <label key={p.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${selectedPlans.has(p.id) ? 'bg-blue-50' : ''}`}>
                <input type="checkbox" checked={selectedPlans.has(p.id)} onChange={e => {
                  const next = new Set(selectedPlans);
                  e.target.checked ? next.add(p.id) : next.delete(p.id);
                  setSelectedPlans(next);
                }} className="rounded" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 truncate">{p.plan_number} — {p.title}</p>
                  <p className="text-xs text-slate-400">{p.status} · {p.total_cases > 0 ? Math.round((p.cases_passed / p.total_cases) * 100) : 0}% pass</p>
                </div>
              </label>
            ))}
            {plans.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">No test plans found.</p>}
          </div>
        </div>

        {/* QA Reports selector */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">QA Reports ({selectedReports.size} selected)</p>
            <button onClick={() => setSelectedReports(new Set(reports.map(r => r.id)))} className="text-xs text-blue-600 hover:text-blue-700">Select All</button>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {reports.map(r => {
              const resultColors: Record<string, string> = { passed: 'text-emerald-600', passed_with_observations: 'text-teal-600', failed: 'text-red-600', blocked: 'text-amber-600', pending: 'text-slate-400' };
              return (
                <label key={r.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${selectedReports.has(r.id) ? 'bg-blue-50' : ''}`}>
                  <input type="checkbox" checked={selectedReports.has(r.id)} onChange={e => {
                    const next = new Set(selectedReports);
                    e.target.checked ? next.add(r.id) : next.delete(r.id);
                    setSelectedReports(next);
                  }} className="rounded" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 truncate">{r.title}</p>
                    <p className="text-xs text-slate-400">{r.test_date} · <span className={resultColors[r.result] ?? 'text-slate-400'}>{r.result}</span></p>
                  </div>
                </label>
              );
            })}
            {reports.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">No QA reports found.</p>}
          </div>
        </div>
      </div>

      <button
        onClick={buildReport}
        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        <FileText className="w-4 h-4" /> Build Evidence Report
      </button>

      {reportText && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Generated Report</p>
            <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Report'}
            </button>
          </div>
          <pre className="text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-xl p-4 font-sans leading-relaxed max-h-96 overflow-y-auto">
            {reportText}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Test Plan Creation & Management ─────────────────────────────────────────

const PLAN_STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  draft:       { label: 'Draft',       color: 'text-slate-600',   bg: 'bg-slate-100',  border: 'border-slate-200',   dot: 'bg-slate-400'   },
  ready:       { label: 'Ready',       color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-500'    },
  active:      { label: 'Active',      color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  deprecated:  { label: 'Deprecated',  color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  archived:    { label: 'Archived',    color: 'text-slate-400',   bg: 'bg-slate-50',   border: 'border-slate-200',   dot: 'bg-slate-300'   },
  in_progress: { label: 'In Progress', color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-500'    },
  completed:   { label: 'Completed',   color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200',  dot: 'bg-violet-500'  },
};

const PLAN_CATEGORIES = [
  'Platform Validation',
  'Release Validation',
  'Regression Testing',
  'Security Testing',
  'Performance Testing',
  'Integration Testing',
  'Disaster Recovery',
  'AI Validation',
  'Database Validation',
  'Custom',
];

const PLAN_STATUSES = ['draft', 'ready', 'active', 'deprecated', 'archived'];

function PlanStatusBadge({ status }: { status: string }) {
  const cfg = PLAN_STATUS_CFG[status] ?? PLAN_STATUS_CFG.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── New Test Plan Wizard ──────────────────────────────────────────────────────

interface NewPlanForm {
  plan_number: string;
  title: string;
  purpose: string;
  description: string;
  owner: string;
  version: string;
  status: string;
  category: string;
  related_platform_area: string;
  linked_specs: string;
  linked_feature_ids: string;
  linked_docs: string;
  notes: string;
}

const EMPTY_FORM: NewPlanForm = {
  plan_number: '',
  title: '',
  purpose: '',
  description: '',
  owner: '',
  version: '1.0',
  status: 'draft',
  category: 'Platform Validation',
  related_platform_area: '',
  linked_specs: '',
  linked_feature_ids: '',
  linked_docs: '',
  notes: '',
};

interface NewTestPlanWizardProps {
  nextNumber: string;
  existingNumbers: string[];
  onClose: () => void;
  onCreated: (plan: TestPlanRow) => void;
}

function NewTestPlanWizard({ nextNumber, existingNumbers, onClose, onCreated }: NewTestPlanWizardProps) {
  const [form, setForm] = useState<NewPlanForm>({ ...EMPTY_FORM, plan_number: nextNumber });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  function set(field: keyof NewPlanForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(null);
  }

  function validateStep1() {
    if (!form.plan_number.trim()) return 'Test Plan ID is required.';
    if (!form.title.trim()) return 'Test Plan Name is required.';
    const idUpper = form.plan_number.trim().toUpperCase();
    if (!/^TP-\d{3,}$/.test(idUpper)) return 'Test Plan ID must follow the format TP-XXX (e.g. TP-002).';
    if (existingNumbers.map(n => n.toUpperCase()).includes(idUpper) && idUpper !== nextNumber.toUpperCase()) {
      return `${idUpper} already exists. Please choose a different ID.`;
    }
    return null;
  }

  async function handleSave() {
    const err = validateStep1();
    if (err) { setError(err); return; }

    setSaving(true);
    setError(null);

    const idUpper = form.plan_number.trim().toUpperCase();

    // Check for duplicate in DB as final guard
    const { data: existing } = await supabase
      .from('ecc_test_plans')
      .select('id')
      .eq('plan_number', idUpper)
      .maybeSingle();

    if (existing) {
      setError(`${idUpper} already exists. Please choose a different ID.`);
      setSaving(false);
      return;
    }

    const insertPayload = {
      plan_number: idUpper,
      title: form.title.trim(),
      description: form.purpose.trim() || form.description.trim() || null,
      notes: [
        form.purpose.trim() ? `Purpose: ${form.purpose.trim()}` : '',
        form.description.trim() ? `Description: ${form.description.trim()}` : '',
        form.notes.trim() ? `Notes: ${form.notes.trim()}` : '',
      ].filter(Boolean).join('\n\n') || null,
      owner: form.owner.trim() || null,
      version: form.version.trim() || '1.0',
      status: form.status,
      category: form.category || null,
      related_platform_area: form.related_platform_area.trim() || null,
      linked_specs: form.linked_specs.trim()
        ? form.linked_specs.split(',').map(s => s.trim()).filter(Boolean)
        : null,
      linked_feature_ids: form.linked_feature_ids.trim()
        ? form.linked_feature_ids.split(',').map(s => s.trim()).filter(Boolean)
        : null,
      linked_docs: form.linked_docs.trim()
        ? form.linked_docs.split(',').map(s => s.trim()).filter(Boolean)
        : null,
      total_suites: 0,
      total_cases: 0,
      cases_passed: 0,
      cases_failed: 0,
    };

    const { data, error: insertError } = await supabase
      .from('ecc_test_plans')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? 'Failed to create test plan.');
      setSaving(false);
      return;
    }

    onCreated(data as TestPlanRow);
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder:text-slate-400 bg-white';
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="shrink-0 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">New Test Plan</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Step {step} of 2 — {step === 1 ? 'Identity & Classification' : 'Traceability & Notes'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="shrink-0 px-6 pt-4 pb-0">
          <div className="flex items-center gap-2">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  s === step ? 'bg-blue-600 text-white' : s < step ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                }`}>{s < step ? '✓' : s}</div>
                {s < 2 && <div className={`flex-1 h-0.5 w-8 rounded ${s < step ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              </div>
            ))}
            <span className="text-xs text-slate-400 ml-2">
              {step === 1 ? 'Identity & Classification' : 'Traceability & Notes'}
            </span>
          </div>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Test Plan ID <span className="text-red-500">*</span></label>
                  <input value={form.plan_number} onChange={e => set('plan_number', e.target.value.toUpperCase())}
                    placeholder="TP-002" className={`${inputCls} font-mono`} />
                  <p className="text-[10px] text-slate-400 mt-1">Format: TP-XXX — auto-suggested, editable</p>
                </div>
                <div>
                  <label className={labelCls}>Version</label>
                  <input value={form.version} onChange={e => set('version', e.target.value)}
                    placeholder="1.0" className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Test Plan Name <span className="text-red-500">*</span></label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  placeholder="e.g. Release Candidate Validation" className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Purpose</label>
                <input value={form.purpose} onChange={e => set('purpose', e.target.value)}
                  placeholder="What is this test plan designed to validate?" className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Optional: additional context, scope, or constraints" rows={3}
                  className={`${inputCls} resize-none`} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Owner</label>
                  <input value={form.owner} onChange={e => set('owner', e.target.value)}
                    placeholder="e.g. Product Owner" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                    {PLAN_STATUSES.map(s => (
                      <option key={s} value={s}>{PLAN_STATUS_CFG[s]?.label ?? s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Category</label>
                  <select value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
                    {PLAN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Related Platform Area</label>
                  <input value={form.related_platform_area} onChange={e => set('related_platform_area', e.target.value)}
                    placeholder="e.g. Authentication, Releases" className={inputCls} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Linked Engineering Specifications</label>
                <textarea value={form.linked_specs} onChange={e => set('linked_specs', e.target.value)}
                  placeholder="Comma-separated spec references (e.g. SPEC-001, SPEC-002)" rows={2}
                  className={`${inputCls} resize-none`} />
                <p className="text-[10px] text-slate-400 mt-1">Separate multiple entries with commas</p>
              </div>

              <div>
                <label className={labelCls}>Linked Features</label>
                <textarea value={form.linked_feature_ids} onChange={e => set('linked_feature_ids', e.target.value)}
                  placeholder="Comma-separated feature IDs or names (e.g. AUTH-001, REL-003)" rows={2}
                  className={`${inputCls} resize-none`} />
              </div>

              <div>
                <label className={labelCls}>Linked Documentation</label>
                <textarea value={form.linked_docs} onChange={e => set('linked_docs', e.target.value)}
                  placeholder="Comma-separated doc references (e.g. Architecture Guide, Release Process)" rows={2}
                  className={`${inputCls} resize-none`} />
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="Any additional notes or context for this test plan" rows={4}
                  className={`${inputCls} resize-none`} />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-700 mb-2">Summary — {form.plan_number}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-800">
                  <span><strong>Name:</strong> {form.title || '—'}</span>
                  <span><strong>Status:</strong> {PLAN_STATUS_CFG[form.status]?.label ?? form.status}</span>
                  <span><strong>Category:</strong> {form.category || '—'}</span>
                  <span><strong>Version:</strong> {form.version || '1.0'}</span>
                  <span><strong>Owner:</strong> {form.owner || '—'}</span>
                  <span><strong>Platform Area:</strong> {form.related_platform_area || '—'}</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 font-medium transition-colors">
                Back
              </button>
            )}
            {step === 1 ? (
              <button
                onClick={() => {
                  const err = validateStep1();
                  if (err) { setError(err); return; }
                  setStep(2);
                }}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {saving ? 'Creating…' : 'Create Test Plan'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Test Plan Modal ─────────────────────────────────────────────────────

interface EditTestPlanModalProps {
  plan: TestPlanRow;
  onClose: () => void;
  onSaved: (plan: TestPlanRow) => void;
}

function EditTestPlanModal({ plan, onClose, onSaved }: EditTestPlanModalProps) {
  const [form, setForm] = useState({
    title: plan.title,
    description: plan.description ?? '',
    owner: plan.owner ?? '',
    version: plan.version ?? '1.0',
    status: plan.status,
    category: plan.category ?? '',
    related_platform_area: plan.related_platform_area ?? '',
    linked_specs: (plan.linked_specs ?? []).join(', '),
    linked_docs: (plan.linked_docs ?? []).join(', '),
    notes: plan.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Test Plan Name is required.'); return; }
    setSaving(true);
    const { data, error: updateError } = await supabase
      .from('ecc_test_plans')
      .update({
        title: form.title.trim(),
        description: form.description.trim() || null,
        owner: form.owner.trim() || null,
        version: form.version.trim() || '1.0',
        status: form.status,
        category: form.category || null,
        related_platform_area: form.related_platform_area.trim() || null,
        linked_specs: form.linked_specs.trim()
          ? form.linked_specs.split(',').map(s => s.trim()).filter(Boolean)
          : null,
        linked_docs: form.linked_docs.trim()
          ? form.linked_docs.split(',').map(s => s.trim()).filter(Boolean)
          : null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plan.id)
      .select()
      .single();

    if (updateError || !data) {
      setError(updateError?.message ?? 'Save failed.');
      setSaving(false);
      return;
    }
    onSaved(data as TestPlanRow);
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white';
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="shrink-0 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Edit {plan.plan_number}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{plan.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className={labelCls}>Test Plan Name <span className="text-red-500">*</span></label>
            <input value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Version</label>
              <input value={form.version} onChange={e => set('version', e.target.value)} placeholder="1.0" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                {PLAN_STATUSES.map(s => <option key={s} value={s}>{PLAN_STATUS_CFG[s]?.label ?? s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {PLAN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Owner</label>
              <input value={form.owner} onChange={e => set('owner', e.target.value)} placeholder="e.g. Product Owner" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Related Platform Area</label>
            <input value={form.related_platform_area} onChange={e => set('related_platform_area', e.target.value)} placeholder="e.g. Authentication, Releases" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Linked Specifications</label>
            <input value={form.linked_specs} onChange={e => set('linked_specs', e.target.value)} placeholder="Comma-separated" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Linked Documentation</label>
            <input value={form.linked_docs} onChange={e => set('linked_docs', e.target.value)} placeholder="Comma-separated" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className={`${inputCls} resize-none`} />
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>
        <div className="shrink-0 px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Test Plans Library Tab ───────────────────────────────────────────────────

const PLAN_STATUS_COLORS: Record<string, string> = {
  active:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  ready:       'bg-blue-50 text-blue-700 border-blue-200',
  draft:       'bg-slate-100 text-slate-600 border-slate-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed:   'bg-violet-50 text-violet-700 border-violet-200',
  archived:    'bg-slate-50 text-slate-400 border-slate-200',
  deprecated:  'bg-amber-50 text-amber-700 border-amber-200',
};

function TestPlansLibraryTab({ onOpenPlan }: { onOpenPlan: (plan: TestPlanRow) => void }) {
  const [plans, setPlans] = useState<TestPlanRow[]>([]);
  const [executions, setExecutions] = useState<Array<{ plan_id: string; pass_rate: number | null; release_recommendation: string | null; completed_at: string | null; execution_number: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TestPlanRow | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TestPlanRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [plansRes, execRes] = await Promise.all([
      supabase.from('ecc_test_plans').select('id, plan_number, title, total_suites, total_cases, cases_passed, cases_failed, status, description, plan_type, priority, owner, version, category, related_platform_area, linked_specs, linked_docs, linked_feature_ids, notes, coverage_percent, updated_at').order('plan_number'),
      supabase.from('ecc_tp001_executions').select('plan_id, pass_rate, release_recommendation, completed_at, execution_number').eq('status', 'completed').order('completed_at', { ascending: false }),
    ]);
    setPlans((plansRes.data ?? []) as TestPlanRow[]);
    setExecutions((execRes.data ?? []) as typeof executions);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    function handler() { setMenuOpenId(null); }
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpenId]);

  const latestForPlan = (planId: string) => executions.find(e => e.plan_id === planId);

  // Next plan number suggestion
  const nextNumber = (() => {
    const nums = plans
      .map(p => { const m = p.plan_number?.match(/^TP-(\d+)$/); return m ? parseInt(m[1]) : 0; })
      .filter(n => n > 0);
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `TP-${String(max + 1).padStart(3, '0')}`;
  })();

  const existingNumbers = plans.map(p => p.plan_number ?? '');

  async function handleDuplicate(plan: TestPlanRow) {
    setMenuOpenId(null);
    const nextNum = (() => {
      const nums = plans.map(p => { const m = p.plan_number?.match(/^TP-(\d+)$/); return m ? parseInt(m[1]) : 0; }).filter(n => n > 0);
      return `TP-${String(Math.max(...nums, 0) + 1).padStart(3, '0')}`;
    })();
    const { data, error } = await supabase.from('ecc_test_plans').insert({
      plan_number: nextNum,
      title: `${plan.title} (Copy)`,
      description: plan.description,
      owner: plan.owner,
      version: '1.0',
      status: 'draft',
      category: plan.category,
      related_platform_area: plan.related_platform_area,
      linked_specs: plan.linked_specs,
      linked_docs: plan.linked_docs,
      notes: plan.notes,
      total_suites: 0,
      total_cases: 0,
      cases_passed: 0,
      cases_failed: 0,
    }).select().single();
    if (error) { setActionError(error.message); return; }
    await load();
    if (data) onOpenPlan(data as TestPlanRow);
  }

  async function handleArchive(plan: TestPlanRow) {
    setMenuOpenId(null);
    await supabase.from('ecc_test_plans').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', plan.id);
    await load();
  }

  async function handleDelete(plan: TestPlanRow) {
    // Check for any runs
    const { count } = await supabase.from('ecc_tp001_executions').select('*', { count: 'exact', head: true }).eq('plan_id', plan.id);
    if ((count ?? 0) > 0) {
      setActionError(`${plan.plan_number} has test runs and cannot be deleted. Archive it instead.`);
      setConfirmDelete(null);
      return;
    }
    await supabase.from('ecc_test_plans').delete().eq('id', plan.id);
    setConfirmDelete(null);
    await load();
  }

  const canRun = (plan: TestPlanRow) => plan.status === 'ready' || plan.status === 'active';
  const isDraft = (plan: TestPlanRow) => plan.status === 'draft';

  const recColors: Record<string, string> = {
    PROCEED: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    WARNING:  'text-amber-700 bg-amber-50 border-amber-200',
    BLOCK:    'text-red-700 bg-red-50 border-red-200',
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Test Plans Library</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {plans.length} plan{plans.length !== 1 ? 's' : ''} · Select a plan to view suites, cases, and execution history
          </p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Test Plan
        </button>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600"><XCircle className="w-4 h-4" /></button>
        </div>
      )}

      {plans.length === 0 ? (
        <div className="text-center py-16">
          <FlaskConical className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <p className="text-sm font-medium text-slate-600 mb-1">No test plans yet</p>
          <p className="text-xs text-slate-400 mb-4">Create your first test plan to get started</p>
          <button onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors">
            <Plus className="w-4 h-4" /> New Test Plan
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {plans.map(plan => {
            const latest = latestForPlan(plan.id);
            const rec = latest?.release_recommendation ?? null;
            const passRate = plan.total_cases > 0
              ? Math.round((plan.cases_passed / plan.total_cases) * 100)
              : latest?.pass_rate
              ? Math.round(latest.pass_rate)
              : null;

            return (
              <div key={plan.id} className="bg-white rounded-xl border border-slate-100 shadow-sm hover:border-blue-100 hover:shadow-md transition-all group">
                <div className="flex items-start gap-4 p-5">
                  {/* Icon */}
                  <div className="p-2.5 bg-blue-50 rounded-xl shrink-0 group-hover:bg-blue-100 transition-colors mt-0.5">
                    <ClipboardList className="w-4 h-4 text-blue-600" />
                  </div>

                  {/* Main info — clickable */}
                  <button className="flex-1 min-w-0 text-left" onClick={() => onOpenPlan(plan)}>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-sm font-bold text-slate-800">{plan.plan_number}</span>
                      <span className="text-sm font-medium text-slate-700">— {plan.title}</span>
                      <PlanStatusBadge status={plan.status} />
                      {rec && <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${recColors[rec] ?? ''}`}>{rec}</span>}
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400 mb-2">
                      {plan.version && <span className="font-mono text-slate-500">v{plan.version}</span>}
                      {plan.category && (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">{plan.category}</span>
                      )}
                      {plan.owner && <span>Owner: <span className="text-slate-600">{plan.owner}</span></span>}
                      {plan.related_platform_area && <span>Area: <span className="text-slate-600">{plan.related_platform_area}</span></span>}
                    </div>

                    {plan.description && (
                      <p className="text-xs text-slate-500 mb-2.5 line-clamp-1">{plan.description}</p>
                    )}

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span><span className="font-semibold text-slate-600">{plan.total_suites}</span> suite{plan.total_suites !== 1 ? 's' : ''}</span>
                      <span><span className="font-semibold text-slate-600">{plan.total_cases}</span> case{plan.total_cases !== 1 ? 's' : ''}</span>
                      {passRate !== null && (
                        <span className={`font-semibold ${passRate >= 80 ? 'text-emerald-600' : passRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                          {passRate}% pass rate
                        </span>
                      )}
                      {latest?.completed_at && (
                        <span>Last run: {new Date(latest.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      )}
                      {plan.updated_at && (
                        <span className="hidden lg:inline">Updated: {new Date(plan.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                      )}
                    </div>
                  </button>

                  {/* Right actions */}
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1.5">
                      {/* Open button */}
                      <button
                        onClick={() => onOpenPlan(plan)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        Open <ArrowRight className="w-3 h-3" />
                      </button>

                      {/* Actions menu */}
                      <div className="relative">
                        <button
                          onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === plan.id ? null : plan.id); }}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuOpenId === plan.id && (
                          <div className="absolute right-0 top-8 z-20 w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                            onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setEditingPlan(plan); setMenuOpenId(null); }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                              <Edit2 className="w-3.5 h-3.5 text-slate-400" /> Edit
                            </button>
                            <button onClick={() => handleDuplicate(plan)}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                              <CopyIcon className="w-3.5 h-3.5 text-slate-400" /> Duplicate
                            </button>
                            {plan.status !== 'archived' && (
                              <button onClick={() => handleArchive(plan)}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                                <Archive className="w-3.5 h-3.5 text-slate-400" /> Archive
                              </button>
                            )}
                            {isDraft(plan) && (
                              <>
                                <div className="border-t border-slate-100" />
                                <button onClick={() => { setConfirmDelete(plan); setMenuOpenId(null); }}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-red-600 hover:bg-red-50 transition-colors">
                                  <Trash className="w-3.5 h-3.5" /> Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Run indicator */}
                    {canRun(plan) ? (
                      <span className="text-[10px] text-emerald-600 font-medium">Ready to run</span>
                    ) : plan.status === 'draft' ? (
                      <span className="text-[10px] text-slate-400">Set to Ready to run</span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-50 rounded-xl"><Trash className="w-5 h-5 text-red-500" /></div>
              <div>
                <p className="text-sm font-bold text-slate-800">Delete {confirmDelete.plan_number}?</p>
                <p className="text-xs text-slate-500">{confirmDelete.title}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-4">This action cannot be undone. The test plan and all associated data will be permanently removed.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 font-medium transition-colors">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">Delete Plan</button>
            </div>
          </div>
        </div>
      )}

      {/* Creation wizard */}
      {showWizard && (
        <NewTestPlanWizard
          nextNumber={nextNumber}
          existingNumbers={existingNumbers}
          onClose={() => setShowWizard(false)}
          onCreated={async (newPlan) => {
            setShowWizard(false);
            await load();
            onOpenPlan(newPlan);
          }}
        />
      )}

      {/* Edit modal */}
      {editingPlan && (
        <EditTestPlanModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSaved={async () => {
            setEditingPlan(null);
            await load();
          }}
        />
      )}
    </div>
  );
}


// ─── Test Runs Tab ─────────────────────────────────────────────────────────────

interface TestRun {
  id: string;
  execution_number: string;
  plan_id: string;
  status: string;
  total_cases: number;
  cases_passed: number;
  cases_failed: number;
  pass_rate: number | null;
  release_recommendation: string | null;
  release_label: string | null;
  platform_version: string | null;
  ecc_version: string | null;
  release_candidate: string | null;
  executed_by: string | null;
  started_at: string;
  completed_at: string | null;
  duration_minutes: number | null;
  report_markdown: string | null;
}

function TestRunsTab() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [plans, setPlans] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<TestRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from('ecc_tp001_executions').select('*').order('started_at', { ascending: false }),
      supabase.from('ecc_test_plans').select('id, plan_number, title'),
    ]).then(([runsRes, plansRes]) => {
      const r = (runsRes.data ?? []) as TestRun[];
      setRuns(r);
      if (r.length) setSelected(r[0]);
      const pm: Record<string, string> = {};
      ((plansRes.data ?? []) as { id: string; plan_number: string; title: string }[]).forEach(p => { pm[p.id] = `${p.plan_number} — ${p.title}`; });
      setPlans(pm);
      setLoading(false);
    });
  }, []);

  const recColors: Record<string, { text: string; bg: string; border: string }> = {
    PROCEED: { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    WARNING:  { text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
    BLOCK:    { text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <div className="flex h-full">
      {/* Run list */}
      <div className="w-72 shrink-0 border-r border-slate-100 overflow-y-auto">
        <div className="p-4 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{runs.length} Test Run{runs.length !== 1 ? 's' : ''}</p>
        </div>
        {runs.length === 0 ? (
          <div className="p-6 text-center text-slate-400"><Clock className="w-6 h-6 mx-auto mb-2 opacity-40" /><p className="text-sm">No test runs yet</p></div>
        ) : runs.map(run => {
          const rec = run.release_recommendation;
          const rcfg = rec ? recColors[rec] : null;
          const isSelected = selected?.id === run.id;
          return (
            <button key={run.id} onClick={() => setSelected(run)}
              className={`w-full text-left p-3.5 border-b border-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono font-semibold text-slate-700">{run.execution_number}</span>
                {rcfg && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${rcfg.bg} ${rcfg.text}`}>{rec}</span>}
              </div>
              <p className="text-xs text-slate-500 truncate">{plans[(run as unknown as { plan_id: string }).plan_id] ?? 'Unknown Plan'}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-slate-400">{new Date(run.started_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <span className={`text-xs font-medium ${run.status === 'completed' ? 'text-emerald-600' : 'text-blue-600'}`}>
                  {run.status === 'completed' ? `${run.pass_rate?.toFixed(0)}%` : run.status}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Run detail */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-slate-400"><p className="text-sm">Select a run</p></div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{selected.execution_number}</h2>
                <p className="text-sm text-slate-500">{plans[(selected as unknown as { plan_id: string }).plan_id] ?? 'Unknown Plan'}</p>
              </div>
              {selected.report_markdown && (
                <button onClick={() => { navigator.clipboard.writeText(selected.report_markdown!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy Report'}
                </button>
              )}
            </div>

            {selected.release_recommendation && (() => {
              const rcfg = recColors[selected.release_recommendation];
              return (
                <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${rcfg.border} ${rcfg.bg}`}>
                  {selected.release_recommendation === 'PROCEED' ? <CheckCircle2 className={`w-5 h-5 ${rcfg.text}`} /> : selected.release_recommendation === 'WARNING' ? <AlertTriangle className={`w-5 h-5 ${rcfg.text}`} /> : <XCircle className={`w-5 h-5 ${rcfg.text}`} />}
                  <span className={`text-sm font-bold ${rcfg.text}`}>{selected.release_recommendation}</span>
                  <span className={`ml-auto text-lg font-bold ${rcfg.text}`}>{selected.pass_rate?.toFixed(1)}%</span>
                </div>
              );
            })()}

            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Passed',  value: selected.cases_passed,  color: 'text-emerald-600' },
                { label: 'Failed',  value: selected.cases_failed,  color: 'text-red-600' },
                { label: 'Total',   value: selected.total_cases,   color: 'text-slate-700' },
                { label: 'Duration', value: selected.duration_minutes ? `${selected.duration_minutes}m` : '—', color: 'text-slate-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Platform Version', value: selected.platform_version },
                { label: 'ECC Version',      value: selected.ecc_version },
                { label: 'Release Candidate', value: selected.release_candidate },
                { label: 'Release Label',    value: selected.release_label },
                { label: 'Executed By',      value: selected.executed_by },
                { label: 'Date',             value: selected.completed_at ? new Date(selected.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
              ].filter(f => f.value).map(f => (
                <div key={f.label} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-0.5">{f.label}</p>
                  <p className="text-sm font-medium text-slate-700">{f.value}</p>
                </div>
              ))}
            </div>

            {selected.report_markdown && (
              <pre className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-4 overflow-auto max-h-80 whitespace-pre-wrap font-mono">{selected.report_markdown}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Coverage Tab ──────────────────────────────────────────────────────────────

const PLATFORM_AREAS = [
  { area: 'Authentication',        suites: ['Authentication', 'Login', 'Session', 'Security'] },
  { area: 'Mission Control',       suites: ['Mission Control', 'Dashboard'] },
  { area: 'Engineering Guardian',  suites: ['Engineering Guardian', 'Guardian'] },
  { area: 'Architecture',          suites: ['Architecture', 'Design'] },
  { area: 'Documentation',         suites: ['Documentation', 'Docs'] },
  { area: 'Testing Framework',     suites: ['Testing', 'Test Plans', 'QA'] },
  { area: 'Releases',              suites: ['Release', 'Deployment', 'RC'] },
  { area: 'Engineering Audits',    suites: ['Audit', 'Engineering Audit'] },
  { area: 'AI Platform',           suites: ['AI Platform', 'AI Provider', 'AI'] },
  { area: 'Integrations',          suites: ['Integration', 'Axcelerate', 'API'] },
  { area: 'Notifications',         suites: ['Notification', 'Email'] },
  { area: 'Feature Management',    suites: ['Feature', 'Product Feature'] },
  { area: 'Roadmap',               suites: ['Roadmap', 'Timeline'] },
  { area: 'Goals & Epics',         suites: ['Goals', 'Epics', 'Vision'] },
  { area: 'Ideas & Backlog',       suites: ['Backlog', 'Ideas'] },
  { area: 'General Settings',      suites: ['Settings', 'Platform Admin', 'Config'] },
  { area: 'Change Management',     suites: ['Change Log', 'Change Management'] },
  { area: 'Dev Programme',         suites: ['Dev Programme', 'Development'] },
  { area: 'Error Handling',        suites: ['Error', 'Error Handling'] },
  { area: 'Performance',           suites: ['Performance', 'Load'] },
];

function CoverageTab() {
  const [suites, setSuites] = useState<{ id: string; title: string }[]>([]);
  const [results, setResults] = useState<{ test_case_id: string; status: string }[]>([]);
  const [cases, setCases] = useState<{ id: string; suite_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from('ecc_test_suites').select('id, title'),
      supabase.from('ecc_test_cases').select('id, suite_id'),
      supabase.from('ecc_tp001_executions').select('id').eq('status', 'completed').order('completed_at', { ascending: false }).limit(1),
    ]).then(async ([suitesRes, casesRes, execRes]) => {
      const suitesData = (suitesRes.data ?? []) as { id: string; title: string }[];
      const casesData = (casesRes.data ?? []) as { id: string; suite_id: string }[];
      setSuites(suitesData);
      setCases(casesData);
      const latestExec = (execRes.data ?? [])[0];
      if (latestExec) {
        const { data: resultsData } = await supabase.from('ecc_tp001_results').select('test_case_id, status').eq('execution_id', latestExec.id);
        setResults((resultsData ?? []) as { test_case_id: string; status: string }[]);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  const areaData = PLATFORM_AREAS.map(({ area, suites: keywords }) => {
    const matchedSuites = suites.filter(s => keywords.some(kw => s.title.toLowerCase().includes(kw.toLowerCase())));
    const suiteIds = matchedSuites.map(s => s.id);
    const areaCases = cases.filter(c => suiteIds.includes(c.suite_id));
    const totalCases = areaCases.length;
    if (totalCases === 0) return { area, status: 'not_covered' as const, passRate: 0, totalCases: 0, suitesCount: suiteIds.length };
    const caseResults = areaCases.map(c => results.find(r => r.test_case_id === c.id));
    const passed = caseResults.filter(r => r?.status === 'pass').length;
    const tested = caseResults.filter(r => r && r.status !== 'pending').length;
    const status = passed === totalCases ? 'covered' as const : tested > 0 ? 'partial' as const : 'not_covered' as const;
    const passRate = totalCases > 0 ? Math.round((passed / totalCases) * 100) : 0;
    return { area, status, passRate, totalCases, suitesCount: suiteIds.length };
  });

  const covered = areaData.filter(a => a.status === 'covered').length;
  const partial = areaData.filter(a => a.status === 'partial').length;
  const notCovered = areaData.filter(a => a.status === 'not_covered').length;
  const overallPct = areaData.length > 0 ? Math.round(((covered + partial * 0.5) / areaData.length) * 100) : 0;

  const statusCfg = {
    covered:     { label: 'Covered',           color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    partial:     { label: 'Partially Covered', color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
    not_covered: { label: 'Not Covered',       color: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200',   dot: 'bg-slate-300'   },
  };

  return (
    <div className="p-6 space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
          <p className={`text-3xl font-bold ${scoreColor(overallPct)}`}>{overallPct}%</p>
          <p className="text-xs text-slate-500 mt-1">Platform Coverage</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-emerald-700">{covered}</p>
          <p className="text-xs text-slate-500 mt-1">Covered</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-amber-700">{partial}</p>
          <p className="text-xs text-slate-500 mt-1">Partial</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-slate-500">{notCovered}</p>
          <p className="text-xs text-slate-500 mt-1">Not Covered</p>
        </div>
      </div>

      {/* Area grid */}
      <div className="grid grid-cols-2 gap-3">
        {areaData.map(({ area, status, passRate, totalCases, suitesCount }) => {
          const cfg = statusCfg[status];
          return (
            <div key={area} className={`bg-white rounded-xl border ${cfg.border} p-4 shadow-sm`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-800">{area}</span>
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${cfg.bg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{suitesCount} suite{suitesCount !== 1 ? 's' : ''} · {totalCases} cases</span>
                {totalCases > 0 && <span className={`font-medium ${cfg.color}`}>{passRate}%</span>}
              </div>
              {totalCases > 0 && (
                <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${status === 'covered' ? 'bg-emerald-400' : status === 'partial' ? 'bg-amber-400' : 'bg-slate-200'}`}
                    style={{ width: `${passRate}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {results.length === 0 && (
        <p className="text-xs text-slate-400 text-center">Coverage updates automatically after each test run. Execute TP-001 to populate coverage data.</p>
      )}
    </div>
  );
}

// ─── ECC Versions Tab ─────────────────────────────────────────────────────────

interface ECCVersion {
  id: string;
  version_number: string;
  release_date: string | null;
  release_notes: string | null;
  status: string;
  platform_version: string | null;
  created_at: string;
}

function ECCVersionsTab() {
  const [versions, setVersions] = useState<ECCVersion[]>([]);
  const [selected, setSelected] = useState<ECCVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ version_number: '', release_date: '', platform_version: '', release_notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('ecc_versions').select('*').order('created_at', { ascending: false });
    const v = (data ?? []) as ECCVersion[];
    setVersions(v);
    if (v.length && !selected) setSelected(v[0]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveVersion() {
    if (!form.version_number.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('ecc_versions').insert({
      version_number: form.version_number.trim(),
      release_date: form.release_date || null,
      platform_version: form.platform_version || null,
      release_notes: form.release_notes || null,
      status: 'draft',
    }).select().single();
    if (!error && data) { await load(); setSelected(data as ECCVersion); setShowForm(false); setForm({ version_number: '', release_date: '', platform_version: '', release_notes: '' }); }
    setSaving(false);
  }

  const statusCfg: Record<string, string> = {
    active:     'bg-emerald-50 text-emerald-700 border-emerald-200',
    draft:      'bg-slate-100 text-slate-600 border-slate-200',
    superseded: 'bg-slate-50 text-slate-400 border-slate-200',
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 border-r border-slate-100 overflow-y-auto">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">ECC Versions</p>
          <button onClick={() => setShowForm(v => !v)} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {showForm && (
          <div className="p-3 border-b border-slate-100 bg-slate-50 space-y-2">
            {[
              { label: 'Version', field: 'version_number', placeholder: 'ECC v1.1.0' },
              { label: 'Platform', field: 'platform_version', placeholder: 'LLND Automate v1.2' },
              { label: 'Date', field: 'release_date', type: 'date' },
            ].map(f => (
              <div key={f.field}>
                <label className="text-xs text-slate-500 block mb-0.5">{f.label}</label>
                <input type={f.type ?? 'text'} value={(form as Record<string, string>)[f.field]} onChange={e => setForm(prev => ({ ...prev, [f.field]: e.target.value }))} placeholder={f.placeholder}
                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-500 block mb-0.5">Notes</label>
              <textarea value={form.release_notes} onChange={e => setForm(prev => ({ ...prev, release_notes: e.target.value }))} rows={2} placeholder="Release notes"
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={saveVersion} disabled={saving || !form.version_number.trim()}
                className="flex-1 py-1 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowForm(false)} className="flex-1 py-1 text-xs text-slate-500 border border-slate-200 rounded hover:bg-slate-100">Cancel</button>
            </div>
          </div>
        )}
        {versions.map(v => (
          <button key={v.id} onClick={() => setSelected(v)}
            className={`w-full text-left px-3 py-3 border-b border-slate-50 transition-colors ${selected?.id === v.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-semibold text-slate-800">{v.version_number}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${statusCfg[v.status] ?? statusCfg.draft}`}>{v.status}</span>
            </div>
            {v.platform_version && <p className="text-xs text-slate-500">{v.platform_version}</p>}
            {v.release_date && <p className="text-xs text-slate-400">{new Date(v.release_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-slate-400"><p className="text-sm">Select a version</p></div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800">{selected.version_number}</h2>
                {selected.platform_version && <p className="text-sm text-slate-500">Platform: {selected.platform_version}</p>}
              </div>
              <span className={`text-sm px-3 py-1 rounded-full border font-medium ${statusCfg[selected.status] ?? statusCfg.draft}`}>{selected.status}</span>
            </div>
            {selected.release_date && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-0.5">Release Date</p>
                <p className="text-sm font-medium text-slate-700">{new Date(selected.release_date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            )}
            {selected.release_notes && (
              <div className="bg-white rounded-xl border border-slate-100 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Release Notes</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selected.release_notes}</p>
              </div>
            )}
            <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-400">
              <p>Created {new Date(selected.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'plans' | 'test-runs' | 'coverage' | 'qa-reports' | 'defects' | 'rc-readiness' | 'evidence' | 'ecc-versions';

const TABS: { key: Tab; label: string; icon: typeof FlaskConical }[] = [
  { key: 'dashboard',    label: 'Dashboard',       icon: BarChart3     },
  { key: 'plans',        label: 'Test Plans',      icon: ClipboardList },
  { key: 'test-runs',    label: 'Test Runs',       icon: History       },
  { key: 'coverage',     label: 'Coverage',        icon: Map           },
  { key: 'qa-reports',   label: 'QA Reports',      icon: FileText      },
  { key: 'defects',      label: 'Defects',         icon: Bug           },
  { key: 'rc-readiness', label: 'RC Readiness',    icon: Shield        },
  { key: 'evidence',     label: 'Evidence Report', icon: BookOpen      },
  { key: 'ecc-versions', label: 'ECC Versions',    icon: Tag           },
];

export function ECCTestingFrameworkPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedPlan, setSelectedPlan] = useState<TestPlanRow | null>(null);

  function handleOpenPlan(plan: TestPlanRow) {
    setSelectedPlan(plan);
  }

  function handleBackFromPlan() {
    setSelectedPlan(null);
  }

  // If a plan is selected (drill-in), show plan detail full screen
  if (selectedPlan && activeTab === 'plans') {
    return (
      <ECCTestPlanDetailPage
        planId={selectedPlan.id}
        onBack={handleBackFromPlan}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-0 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 mb-4">
          <FlaskConical className="w-5 h-5 text-blue-600" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">Testing Framework</h1>
            <p className="text-sm text-slate-500">Enterprise quality system — plans, runs, coverage, defects, and evidence.</p>
          </div>
        </div>
        <div className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); if (t.key !== 'plans') setSelectedPlan(null); }}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors shrink-0 ${
                  activeTab === t.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'dashboard'    && <DashboardTab onNavigate={(tab) => setActiveTab(tab as Tab)} />}
        {activeTab === 'plans'        && <TestPlansLibraryTab onOpenPlan={handleOpenPlan} />}
        {activeTab === 'test-runs'    && <TestRunsTab />}
        {activeTab === 'coverage'     && <CoverageTab />}
        {activeTab === 'qa-reports'   && <ECCQAPage />}
        {activeTab === 'defects'      && <ECCDefectsPanel />}
        {activeTab === 'rc-readiness' && <RCReadinessTab />}
        {activeTab === 'evidence'     && <EvidenceTab />}
        {activeTab === 'ecc-versions' && <ECCVersionsTab />}
      </div>
    </div>
  );
}
