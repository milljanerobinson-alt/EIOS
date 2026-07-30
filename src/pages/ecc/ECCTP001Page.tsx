import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ClipboardList, Play, ChevronRight, ChevronDown, CheckCircle2, XCircle,
  MinusCircle, AlertCircle, Copy, Check, RefreshCw, BarChart2, Clock,
  TrendingUp, TrendingDown, Minus, Shield, ChevronLeft, FileText,
  Filter, ArrowUpDown, BookOpen, Layers, Activity
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type CaseStatus = 'pending' | 'pass' | 'fail' | 'blocked' | 'na';
type Recommendation = 'PROCEED' | 'WARNING' | 'BLOCK';

interface TestPlan {
  id: string;
  plan_number: string;
  title: string;
  total_suites: number;
  total_cases: number;
}

interface TestSuite {
  id: string;
  suite_number: string;
  title: string;
  description: string | null;
}

interface TestCase {
  id: string;
  case_number: string;
  title: string;
  description: string | null;
  steps: string | null;
  expected_result: string | null;
  severity: string | null;
  suite_id: string;
}

interface Execution {
  id: string;
  execution_number: string;
  release_label: string | null;
  executed_by: string | null;
  status: string;
  total_cases: number;
  cases_passed: number;
  cases_failed: number;
  cases_blocked: number;
  cases_na: number;
  pass_rate: number | null;
  confidence_score: number | null;
  release_recommendation: string | null;
  notes: string | null;
  report_markdown: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

interface CaseResult {
  id: string;
  execution_id: string;
  test_case_id: string;
  case_number: string;
  status: CaseStatus;
  notes: string | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<CaseStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending',  color: 'text-slate-500', bg: 'bg-slate-100',  icon: Clock },
  pass:     { label: 'Pass',     color: 'text-emerald-700', bg: 'bg-emerald-50', icon: CheckCircle2 },
  fail:     { label: 'Fail',     color: 'text-red-700',     bg: 'bg-red-50',     icon: XCircle },
  blocked:  { label: 'Blocked',  color: 'text-amber-700',   bg: 'bg-amber-50',   icon: AlertCircle },
  na:       { label: 'N/A',      color: 'text-slate-400',   bg: 'bg-slate-50',   icon: MinusCircle },
};

const REC_CFG: Record<Recommendation, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  PROCEED: { label: 'Proceed to Release',   color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
  WARNING: { label: 'Proceed with Caution', color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   icon: AlertCircle },
  BLOCK:   { label: 'Block Release',        color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     icon: XCircle },
};

function deriveRecommendation(passRate: number): Recommendation {
  if (passRate >= 90) return 'PROCEED';
  if (passRate >= 80) return 'WARNING';
  return 'BLOCK';
}

function deriveConfidence(results: CaseResult[]): number {
  if (!results.length) return 0;
  const executed = results.filter(r => r.status !== 'pending' && r.status !== 'na').length;
  return Math.round((executed / results.length) * 100);
}

// ── Report Generation ─────────────────────────────────────────────────────────

function generateReport(
  exec: Omit<Execution, 'id' | 'created_at' | 'report_markdown'>,
  suites: TestSuite[],
  cases: TestCase[],
  results: CaseResult[]
): string {
  const rec = deriveRecommendation(exec.pass_rate ?? 0);
  const recCfg = REC_CFG[rec];
  const now = new Date().toISOString();

  const suiteLines = suites.map(suite => {
    const suiteCases = cases.filter(c => c.suite_id === suite.id);
    const suiteResults = results.filter(r => suiteCases.some(c => c.id === r.test_case_id));
    const passed = suiteResults.filter(r => r.status === 'pass').length;
    const failed = suiteResults.filter(r => r.status === 'fail').length;
    const blocked = suiteResults.filter(r => r.status === 'blocked').length;
    const na = suiteResults.filter(r => r.status === 'na').length;
    const total = suiteCases.length;
    const rate = total > 0 ? Math.round((passed / (total - na)) * 100) : 0;

    const caseLines = suiteCases.map(tc => {
      const res = results.find(r => r.test_case_id === tc.id);
      const s = res?.status ?? 'pending';
      const icon = s === 'pass' ? '✅' : s === 'fail' ? '❌' : s === 'blocked' ? '⚠️' : s === 'na' ? '➖' : '⏳';
      return `  | ${tc.case_number} | ${tc.title} | ${icon} ${STATUS_CFG[s as CaseStatus].label} |${res?.notes ? ` ${res.notes}` : ''}`;
    }).join('\n');

    return `### ${suite.suite_number} — ${suite.title}
Pass: ${passed} / Fail: ${failed} / Blocked: ${blocked} / N/A: ${na} | Rate: ${rate}%

| Case | Title | Result |
|------|-------|--------|
${caseLines}`;
  }).join('\n\n');

  return `# TP-001 Platform Release Validation Suite
## Execution Report: ${exec.execution_number}

**Release:** ${exec.release_label ?? 'Unspecified'}
**Executed By:** ${exec.executed_by ?? 'Unknown'}
**Date:** ${now.split('T')[0]}
**Status:** ${exec.status.toUpperCase()}
**Recommendation:** ${recCfg.label.toUpperCase()}

---

## Summary

| Metric | Value |
|--------|-------|
| Total Cases | ${exec.total_cases} |
| Passed | ${exec.cases_passed} |
| Failed | ${exec.cases_failed} |
| Blocked | ${exec.cases_blocked} |
| N/A | ${exec.cases_na} |
| Pass Rate | ${exec.pass_rate?.toFixed(1) ?? 0}% |
| Confidence Score | ${exec.confidence_score ?? 0}% |

**Release Recommendation: ${rec} — ${recCfg.label}**

${exec.notes ? `**Notes:** ${exec.notes}` : ''}

---

## Test Suite Results

${suiteLines}

---

*Generated by TP-001 Platform Release Validation Suite*
`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy Report'}
    </button>
  );
}

// ── Execution Wizard ──────────────────────────────────────────────────────────

interface WizardProps {
  plan: TestPlan;
  suites: TestSuite[];
  cases: TestCase[];
  executions: Execution[];
  onClose: () => void;
  onComplete: () => void;
}

function ExecutionWizard({ plan, suites, cases, executions, onClose, onComplete }: WizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [releaseLabel, setReleaseLabel] = useState('');
  const [executedBy, setExecutedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [activeSuiteIdx, setActiveSuiteIdx] = useState(0);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [results, setResults] = useState<Record<string, CaseResult>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalReport, setFinalReport] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Derive next execution number
  const nextNumber = (() => {
    const nums = executions.map(e => parseInt(e.execution_number.split('-').pop() ?? '0', 10));
    const max = nums.length ? Math.max(...nums) : 0;
    return `TP-001-${String(max + 1).padStart(4, '0')}`;
  })();

  async function startExecution() {
    setSaving(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('ecc_tp001_executions')
        .insert({
          plan_id: plan.id,
          execution_number: nextNumber,
          release_label: releaseLabel || null,
          executed_by: executedBy || null,
          status: 'in_progress',
          total_cases: plan.total_cases,
          cases_passed: 0,
          cases_failed: 0,
          cases_blocked: 0,
          cases_na: 0,
          notes: notes || null,
        })
        .select()
        .single();
      if (err) throw err;
      const exec = data as Execution;
      setExecution(exec);

      // Seed result rows (one per case)
      const rows = cases.map(tc => ({
        execution_id: exec.id,
        test_case_id: tc.id,
        case_number: tc.case_number,
        status: 'pending' as CaseStatus,
        notes: null,
      }));
      const { data: inserted, error: err2 } = await supabase
        .from('ecc_tp001_results')
        .insert(rows)
        .select();
      if (err2) throw err2;
      const map: Record<string, CaseResult> = {};
      (inserted as CaseResult[]).forEach(r => { map[r.test_case_id] = r; });
      setResults(map);
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start execution');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(caseId: string, status: CaseStatus, resultNotes?: string) {
    if (!execution) return;
    const current = results[caseId];
    if (!current) return;
    const { data, error: err } = await supabase
      .from('ecc_tp001_results')
      .update({ status, notes: resultNotes ?? current.notes })
      .eq('id', current.id)
      .select()
      .single();
    if (!err && data) {
      setResults(prev => ({ ...prev, [caseId]: data as CaseResult }));
    }
  }

  async function completeExecution() {
    if (!execution) return;
    setSubmitting(true);
    setError(null);
    try {
      const allResults = Object.values(results);
      const passed = allResults.filter(r => r.status === 'pass').length;
      const failed = allResults.filter(r => r.status === 'fail').length;
      const blocked = allResults.filter(r => r.status === 'blocked').length;
      const na = allResults.filter(r => r.status === 'na').length;
      const eligible = execution.total_cases - na;
      const passRate = eligible > 0 ? Math.round((passed / eligible) * 1000) / 10 : 0;
      const confidence = deriveConfidence(allResults);
      const rec = deriveRecommendation(passRate);

      const execData = {
        ...execution,
        cases_passed: passed,
        cases_failed: failed,
        cases_blocked: blocked,
        cases_na: na,
        pass_rate: passRate,
        confidence_score: confidence,
        release_recommendation: rec,
      };
      const md = generateReport(execData, suites, cases, allResults);
      setFinalReport(md);

      const { error: err } = await supabase
        .from('ecc_tp001_executions')
        .update({
          status: 'completed',
          cases_passed: passed,
          cases_failed: failed,
          cases_blocked: blocked,
          cases_na: na,
          pass_rate: passRate,
          confidence_score: confidence,
          release_recommendation: rec,
          report_markdown: md,
          completed_at: new Date().toISOString(),
        })
        .eq('id', execution.id);
      if (err) throw err;
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to complete execution');
    } finally {
      setSubmitting(false);
    }
  }

  const currentSuite = suites[activeSuiteIdx];
  const suiteCases = cases.filter(c => c.suite_id === currentSuite?.id);
  const allResults = Object.values(results);
  const passCount = allResults.filter(r => r.status === 'pass').length;
  const failCount = allResults.filter(r => r.status === 'fail').length;
  const blockedCount = allResults.filter(r => r.status === 'blocked').length;
  const naCount = allResults.filter(r => r.status === 'na').length;
  const testedCount = allResults.filter(r => r.status !== 'pending').length;
  const totalCases = execution?.total_cases ?? plan.total_cases;
  const progressPct = totalCases > 0 ? Math.round((testedCount / totalCases) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Wizard Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">TP-001 Execution</h2>
              <p className="text-xs text-slate-500">{nextNumber}</p>
            </div>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(s => (
              <React.Fragment key={s}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {step > s ? <Check className="w-3.5 h-3.5" /> : s}
                </div>
                {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              </React.Fragment>
            ))}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1 — Config */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Configure Execution</h3>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}
            <div className="space-y-4 max-w-lg">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Release Label</label>
                <input
                  type="text"
                  value={releaseLabel}
                  onChange={e => setReleaseLabel(e.target.value)}
                  placeholder="e.g. v2.4.1 RC1"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Executed By</label>
                <input
                  type="text"
                  value={executedBy}
                  onChange={e => setExecutedBy(e.target.value)}
                  placeholder="Name or team"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any context or scope notes"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                />
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1">
                <p className="font-medium text-slate-700">Plan: {plan.plan_number} — {plan.title}</p>
                <p className="text-slate-500">{plan.total_suites} suites · {plan.total_cases} test cases</p>
                <p className="text-slate-500">Pass threshold: <span className="font-medium text-slate-700">85%</span> (blocking gate)</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Run cases */}
        {step === 2 && (
          <div className="flex-1 flex overflow-hidden">
            {/* Suite list sidebar */}
            <div className="w-56 shrink-0 border-r border-slate-100 overflow-y-auto">
              <div className="p-3 border-b border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-600">Progress</span>
                  <span className="text-xs font-bold text-blue-600">{progressPct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="text-xs text-emerald-600">{passCount}P</span>
                  <span className="text-xs text-red-600">{failCount}F</span>
                  <span className="text-xs text-amber-600">{blockedCount}B</span>
                  <span className="text-xs text-slate-400">{naCount}N</span>
                </div>
              </div>
              {suites.map((suite, idx) => {
                const sc = cases.filter(c => c.suite_id === suite.id);
                const sr = sc.map(c => results[c.id]).filter(Boolean);
                const done = sr.filter(r => r?.status !== 'pending').length;
                const hasFail = sr.some(r => r?.status === 'fail');
                return (
                  <button
                    key={suite.id}
                    onClick={() => setActiveSuiteIdx(idx)}
                    className={`w-full text-left px-3 py-2.5 border-b border-slate-50 transition-colors ${activeSuiteIdx === idx ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    <p className={`text-xs font-medium truncate ${activeSuiteIdx === idx ? 'text-blue-700' : 'text-slate-700'}`}>{suite.suite_number}</p>
                    <p className="text-xs text-slate-400 truncate">{suite.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`text-xs ${done === sc.length ? 'text-emerald-500' : 'text-slate-400'}`}>{done}/{sc.length}</span>
                      {hasFail && <span className="text-xs text-red-500">!</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Case runner */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="shrink-0 px-5 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-sm font-semibold text-slate-700">{currentSuite?.suite_number} — {currentSuite?.title}</p>
                <p className="text-xs text-slate-500">{currentSuite?.description}</p>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                {suiteCases.map(tc => {
                  const res = results[tc.id];
                  const status = res?.status ?? 'pending';
                  const cfg = STATUS_CFG[status];
                  const Icon = cfg.icon;
                  return (
                    <div key={tc.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-mono text-slate-400">{tc.case_number}</span>
                            {tc.severity && (
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${tc.severity === 'critical' ? 'bg-red-50 text-red-600' : tc.severity === 'high' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                                {tc.severity}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-800">{tc.title}</p>
                          {tc.description && <p className="text-xs text-slate-500 mt-0.5">{tc.description}</p>}
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${cfg.bg}`}>
                          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                          <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                        </div>
                      </div>
                      {tc.steps && (
                        <div className="text-xs text-slate-500 bg-slate-50 rounded p-2 mb-2 whitespace-pre-wrap">{tc.steps}</div>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(['pass', 'fail', 'blocked', 'na'] as CaseStatus[]).map(s => (
                          <button
                            key={s}
                            onClick={() => setStatus(tc.id, s)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                              status === s
                                ? `${STATUS_CFG[s].bg} ${STATUS_CFG[s].color} border-current`
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {STATUS_CFG[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Suite navigation */}
              <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-white">
                <button
                  onClick={() => setActiveSuiteIdx(i => Math.max(0, i - 1))}
                  disabled={activeSuiteIdx === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <span className="text-xs text-slate-400">{activeSuiteIdx + 1} / {suites.length}</span>
                {activeSuiteIdx < suites.length - 1 ? (
                  <button
                    onClick={() => setActiveSuiteIdx(i => Math.min(suites.length - 1, i + 1))}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={completeExecution}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Complete
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Complete */}
        {step === 3 && (() => {
          const allResults2 = Object.values(results);
          const passed = allResults2.filter(r => r.status === 'pass').length;
          const failed = allResults2.filter(r => r.status === 'fail').length;
          const blocked = allResults2.filter(r => r.status === 'blocked').length;
          const na = allResults2.filter(r => r.status === 'na').length;
          const eligible = totalCases - na;
          const passRate = eligible > 0 ? Math.round((passed / eligible) * 1000) / 10 : 0;
          const rec = deriveRecommendation(passRate);
          const cfg = REC_CFG[rec];
          const RecIcon = cfg.icon;
          return (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${cfg.border} ${cfg.bg}`}>
                <RecIcon className={`w-6 h-6 ${cfg.color} shrink-0`} />
                <div>
                  <p className={`text-base font-bold ${cfg.color}`}>{rec}</p>
                  <p className={`text-sm ${cfg.color} opacity-80`}>{cfg.label}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className={`text-2xl font-bold ${cfg.color}`}>{passRate.toFixed(1)}%</p>
                  <p className="text-xs text-slate-500">pass rate</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="Passed" value={passed} color="text-emerald-700" />
                <StatCard label="Failed" value={failed} color="text-red-700" />
                <StatCard label="Blocked" value={blocked} color="text-amber-700" />
                <StatCard label="N/A" value={na} color="text-slate-400" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Report</h4>
                  <CopyButton text={finalReport} />
                </div>
                <pre className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-4 overflow-auto max-h-64 whitespace-pre-wrap font-mono">{finalReport}</pre>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => { onComplete(); onClose(); }}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          );
        })()}

        {error && step !== 1 && (
          <div className="shrink-0 px-6 py-2 bg-red-50 border-t border-red-100">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Step 1 footer */}
        {step === 1 && (
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={startExecution}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Execution
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ plan, executions }: { plan: TestPlan | null; executions: Execution[] }) {
  const latest = executions.find(e => e.status === 'completed');
  const lastFive = executions.filter(e => e.status === 'completed').slice(0, 5).reverse();

  if (!plan) return (
    <div className="flex items-center justify-center h-40">
      <p className="text-sm text-slate-400">No TP-001 test plan found.</p>
    </div>
  );

  const rec = latest?.release_recommendation as Recommendation | undefined;
  const recCfg = rec ? REC_CFG[rec] : null;

  return (
    <div className="space-y-6">
      {/* Release Readiness */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Release Readiness</h3>
        {latest && recCfg ? (
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border ${recCfg.border} ${recCfg.bg} flex-1`}>
              {React.createElement(recCfg.icon, { className: `w-5 h-5 ${recCfg.color}` })}
              <div>
                <p className={`text-base font-bold ${recCfg.color}`}>{latest.release_recommendation}</p>
                <p className={`text-xs ${recCfg.color} opacity-80`}>{recCfg.label}</p>
              </div>
              <div className="ml-auto text-right">
                <p className={`text-xl font-bold ${recCfg.color}`}>{latest.pass_rate?.toFixed(1)}%</p>
                <p className="text-xs text-slate-500">pass rate</p>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p className="font-medium text-slate-700">{latest.execution_number}</p>
              <p>{latest.release_label ?? '—'}</p>
              <p>{new Date(latest.completed_at ?? latest.started_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No completed executions yet</p>
            <p className="text-xs mt-1">Run a TP-001 execution to get a release recommendation</p>
          </div>
        )}
      </div>

      {/* Stats row */}
      {latest && (
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="Total Cases" value={latest.total_cases} />
          <StatCard label="Passed" value={latest.cases_passed} color="text-emerald-600" />
          <StatCard label="Failed" value={latest.cases_failed} color="text-red-600" />
          <StatCard label="Blocked" value={latest.cases_blocked} color="text-amber-600" />
          <StatCard label="Confidence" value={`${latest.confidence_score ?? 0}%`} color="text-blue-600" />
        </div>
      )}

      {/* Trend */}
      {lastFive.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Pass Rate Trend</h3>
          <div className="flex items-end gap-3 h-24">
            {lastFive.map((exec, i) => {
              const rate = exec.pass_rate ?? 0;
              const pct = Math.max(4, rate);
              const rec2 = exec.release_recommendation as Recommendation;
              const color = rec2 === 'PROCEED' ? 'bg-emerald-400' : rec2 === 'WARNING' ? 'bg-amber-400' : 'bg-red-400';
              const prev = i > 0 ? (lastFive[i - 1].pass_rate ?? 0) : rate;
              const TrendIcon = rate > prev ? TrendingUp : rate < prev ? TrendingDown : Minus;
              return (
                <div key={exec.id} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-slate-500">{rate.toFixed(0)}%</span>
                  <div className="w-full relative">
                    <div className={`w-full rounded-t ${color}`} style={{ height: `${pct * 0.8}px` }} />
                  </div>
                  <TrendIcon className={`w-3 h-3 ${rate > prev ? 'text-emerald-500' : rate < prev ? 'text-red-400' : 'text-slate-400'}`} />
                  <span className="text-xs text-slate-400 truncate max-w-full text-center">{exec.execution_number.split('-').pop()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Plan info */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Plan Details</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><span className="text-xs text-slate-500">Plan</span><p className="font-medium text-slate-800">{plan.plan_number}</p></div>
          <div><span className="text-xs text-slate-500">Suites</span><p className="font-medium text-slate-800">{plan.total_suites}</p></div>
          <div><span className="text-xs text-slate-500">Cases</span><p className="font-medium text-slate-800">{plan.total_cases}</p></div>
        </div>
      </div>
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab({ executions, onRefresh }: { executions: Execution[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<Execution | null>(null);

  useEffect(() => {
    if (!selected && executions.length) setSelected(executions[0]);
  }, [executions]);

  return (
    <div className="flex gap-4 h-full min-h-[500px]">
      {/* List */}
      <div className="w-72 shrink-0 flex flex-col gap-1">
        {executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <Clock className="w-6 h-6 mb-2 opacity-40" />
            <p className="text-sm">No executions yet</p>
          </div>
        ) : executions.map(exec => {
          const rec = exec.release_recommendation as Recommendation | undefined;
          const cfg = rec ? REC_CFG[rec] : null;
          const isSelected = selected?.id === exec.id;
          return (
            <button
              key={exec.id}
              onClick={() => setSelected(exec)}
              className={`text-left w-full p-3 rounded-xl border transition-colors ${isSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-white hover:bg-slate-50'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono font-semibold text-slate-700">{exec.execution_number}</span>
                {cfg && (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.bg} ${cfg.color}`}>{exec.release_recommendation}</span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate">{exec.release_label ?? 'No label'}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-slate-400">{new Date(exec.started_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                <span className={`text-xs font-medium ${exec.status === 'completed' ? 'text-emerald-600' : exec.status === 'in_progress' ? 'text-blue-600' : 'text-slate-400'}`}>
                  {exec.status === 'completed' ? `${exec.pass_rate?.toFixed(0)}%` : exec.status}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <p className="text-sm">Select an execution to view</p>
          </div>
        ) : (
          <>
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">{selected.execution_number}</h3>
                <p className="text-xs text-slate-500">{selected.release_label ?? 'No label'} · {selected.executed_by ?? 'Unknown'}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.report_markdown && <CopyButton text={selected.report_markdown} />}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {selected.release_recommendation && (
                <div className={`flex items-center gap-3 p-3 rounded-xl border mb-4 ${REC_CFG[selected.release_recommendation as Recommendation].border} ${REC_CFG[selected.release_recommendation as Recommendation].bg}`}>
                  {React.createElement(REC_CFG[selected.release_recommendation as Recommendation].icon, { className: `w-4 h-4 ${REC_CFG[selected.release_recommendation as Recommendation].color}` })}
                  <span className={`text-sm font-semibold ${REC_CFG[selected.release_recommendation as Recommendation].color}`}>
                    {selected.release_recommendation} — {REC_CFG[selected.release_recommendation as Recommendation].label}
                  </span>
                  <span className={`ml-auto text-sm font-bold ${REC_CFG[selected.release_recommendation as Recommendation].color}`}>
                    {selected.pass_rate?.toFixed(1)}%
                  </span>
                </div>
              )}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <StatCard label="Passed" value={selected.cases_passed} color="text-emerald-600" />
                <StatCard label="Failed" value={selected.cases_failed} color="text-red-600" />
                <StatCard label="Blocked" value={selected.cases_blocked} color="text-amber-600" />
                <StatCard label="N/A" value={selected.cases_na} color="text-slate-400" />
              </div>
              {selected.report_markdown && (
                <pre className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-4 overflow-auto max-h-96 whitespace-pre-wrap font-mono">
                  {selected.report_markdown}
                </pre>
              )}
              {selected.notes && (
                <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs font-medium text-slate-600 mb-1">Notes</p>
                  <p className="text-xs text-slate-500">{selected.notes}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Library Tab ───────────────────────────────────────────────────────────────

function LibraryTab({ suites, cases }: { suites: TestSuite[]; cases: TestCase[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const filtered = search
    ? suites.filter(s =>
        s.suite_number.toLowerCase().includes(search.toLowerCase()) ||
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        cases.some(c => c.suite_id === s.id && (c.case_number.toLowerCase().includes(search.toLowerCase()) || c.title.toLowerCase().includes(search.toLowerCase())))
      )
    : suites;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter suites or cases…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
        <span className="text-xs text-slate-500">{filtered.length} suite{filtered.length !== 1 ? 's' : ''}</span>
        <div className="flex gap-1.5">
          <button onClick={() => setExpanded(new Set(suites.map(s => s.id)))} className="text-xs text-blue-600 hover:text-blue-800 transition-colors">Expand all</button>
          <span className="text-slate-300">·</span>
          <button onClick={() => setExpanded(new Set())} className="text-xs text-slate-500 hover:text-slate-700 transition-colors">Collapse all</button>
        </div>
      </div>

      {filtered.map(suite => {
        const suiteCases = cases.filter(c => c.suite_id === suite.id);
        const isOpen = expanded.has(suite.id);
        return (
          <div key={suite.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <button
              onClick={() => toggle(suite.id)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-800">{suite.suite_number} — {suite.title}</p>
                  {suite.description && <p className="text-xs text-slate-500">{suite.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-slate-400">{suiteCases.length} cases</span>
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-slate-50 divide-y divide-slate-50">
                {suiteCases.map(tc => (
                  <div key={tc.id} className="px-5 py-3 pl-14">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono text-slate-400">{tc.case_number}</span>
                          {tc.severity && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${tc.severity === 'critical' ? 'bg-red-50 text-red-600' : tc.severity === 'high' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                              {tc.severity}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-700">{tc.title}</p>
                        {tc.description && <p className="text-xs text-slate-500 mt-0.5">{tc.description}</p>}
                        {tc.expected_result && (
                          <p className="text-xs text-slate-400 mt-1"><span className="font-medium">Expected:</span> {tc.expected_result}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ECCTP001Page() {
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'library'>('overview');
  const [plan, setPlan] = useState<TestPlan | null>(null);
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [planRes, execRes] = await Promise.all([
        supabase.from('ecc_test_plans').select('id, plan_number, title, total_suites, total_cases').eq('plan_number', 'TP-001').maybeSingle(),
        supabase.from('ecc_tp001_executions').select('*').order('started_at', { ascending: false }),
      ]);

      const foundPlan = planRes.data as TestPlan | null;
      setPlan(foundPlan);
      setExecutions((execRes.data ?? []) as Execution[]);

      if (foundPlan) {
        const [suitesRes, casesRes] = await Promise.all([
          supabase.from('ecc_test_suites').select('id, suite_number, title, description').eq('plan_id', foundPlan.id).order('suite_number'),
          supabase.from('ecc_test_cases').select('id, case_number, title, description, steps, expected_result, severity, suite_id').eq('plan_id', foundPlan.id).order('case_number'),
        ]);
        setSuites((suitesRes.data ?? []) as TestSuite[]);
        setCases((casesRes.data ?? []) as TestCase[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const latestCompleted = executions.find(e => e.status === 'completed');
  const latestRec = latestCompleted?.release_recommendation as Recommendation | undefined;

  const TABS = [
    { key: 'overview' as const, label: 'Overview', icon: Activity },
    { key: 'history' as const, label: 'History', icon: Clock },
    { key: 'library' as const, label: 'Library', icon: BookOpen },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-100">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-xl">
                <ClipboardList className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-slate-800">TP-001</h1>
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">Platform Release Validation Suite</span>
                  {latestRec && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REC_CFG[latestRec].bg} ${REC_CFG[latestRec].color}`}>
                      {latestRec}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Permanent mandatory release quality gate · 34 suites · 102 test cases</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadAll}
                disabled={loading}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {plan && (
                <button
                  onClick={() => setShowWizard(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Play className="w-4 h-4" />
                  New Execution
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'overview' && <OverviewTab plan={plan} executions={executions} />}
            {activeTab === 'history' && <HistoryTab executions={executions} onRefresh={loadAll} />}
            {activeTab === 'library' && <LibraryTab suites={suites} cases={cases} />}
          </>
        )}
      </div>

      {/* Wizard */}
      {showWizard && plan && (
        <ExecutionWizard
          plan={plan}
          suites={suites}
          cases={cases}
          executions={executions}
          onClose={() => setShowWizard(false)}
          onComplete={loadAll}
        />
      )}
    </div>
  );
}
