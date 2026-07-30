import React, { useEffect, useState, useCallback } from 'react';
import {
  ClipboardList, Play, ChevronRight, ChevronDown, CheckCircle2, XCircle,
  MinusCircle, AlertCircle, Copy, Check, RefreshCw, Clock,
  TrendingUp, TrendingDown, Minus, BookOpen, Layers, Filter,
  ChevronLeft, Activity, ArrowLeft, AlertTriangle, Pause,
  FileText, Camera, Link2, SkipForward, RotateCcw, Flag,
  MessageSquare, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

export type CaseStatus = 'pending' | 'pass' | 'fail' | 'blocked' | 'na' | 'skipped';
type Recommendation = 'PROCEED' | 'WARNING' | 'BLOCK';
type RunStatus = 'in_progress' | 'paused' | 'completed' | 'cancelled';

export interface TestPlanRow {
  id: string;
  plan_number: string;
  title: string;
  total_suites: number;
  total_cases: number;
  cases_passed: number;
  cases_failed: number;
  status: string;
  description: string | null;
  plan_type: string | null;
  priority: string | null;
  owner: string | null;
  version: string | null;
  category: string | null;
  related_platform_area: string | null;
  linked_specs: string[] | null;
  linked_docs: string[] | null;
  linked_feature_ids: string[] | null;
  notes: string | null;
  coverage_percent: number | null;
  updated_at: string | null;
}

export interface TestSuite {
  id: string;
  suite_number: string;
  title: string;
  description: string | null;
}

export interface TestCase {
  id: string;
  case_number: string;
  title: string;
  description: string | null;
  steps: string | null;
  expected_result: string | null;
  severity: string | null;
  suite_id: string;
}

export interface Execution {
  id: string;
  plan_id: string;
  run_number: string | null;
  execution_number: string;
  release_label: string | null;
  executed_by: string | null;
  status: RunStatus;
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
  paused_at: string | null;
  platform_version: string | null;
  ecc_version: string | null;
  spec_version: string | null;
  spec_register_version: string | null;
  guardian_version: string | null;
  release_candidate: string | null;
  linked_release: string | null;
  duration_minutes: number | null;
  created_at: string;
}

interface CaseResult {
  id: string;
  execution_id: string;
  test_case_id: string;
  case_number: string;
  status: CaseStatus;
  notes: string | null;
  evidence_notes: string | null;
  screenshot_ref: string | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

export const STATUS_CFG: Record<CaseStatus, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending',  color: 'text-slate-500',   bg: 'bg-slate-50',    border: 'border-slate-200',   icon: Clock },
  pass:     { label: 'Pass',     color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-300', icon: CheckCircle2 },
  fail:     { label: 'Fail',     color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-300',     icon: XCircle },
  blocked:  { label: 'Blocked',  color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-300',   icon: AlertCircle },
  na:       { label: 'N/A',      color: 'text-slate-400',   bg: 'bg-slate-50',    border: 'border-slate-200',   icon: MinusCircle },
  skipped:  { label: 'Skipped',  color: 'text-violet-600',  bg: 'bg-violet-50',   border: 'border-violet-200',  icon: SkipForward },
};

export const REC_CFG: Record<Recommendation, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  PROCEED: { label: 'Proceed to Release',   color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
  WARNING: { label: 'Proceed with Caution', color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   icon: AlertCircle },
  BLOCK:   { label: 'Block Release',        color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     icon: XCircle },
};

const RUN_STATUS_CFG: Record<RunStatus, { label: string; color: string; bg: string; dot: string }> = {
  in_progress: { label: 'Running',    color: 'text-blue-700',    bg: 'bg-blue-50',    dot: 'bg-blue-500'    },
  paused:      { label: 'Paused',     color: 'text-amber-700',   bg: 'bg-amber-50',   dot: 'bg-amber-500'   },
  completed:   { label: 'Completed',  color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  cancelled:   { label: 'Cancelled',  color: 'text-slate-500',   bg: 'bg-slate-100',  dot: 'bg-slate-400'   },
};

export function deriveRecommendation(passRate: number): Recommendation {
  if (passRate >= 90) return 'PROCEED';
  if (passRate >= 80) return 'WARNING';
  return 'BLOCK';
}

function deriveConfidence(results: CaseResult[]): number {
  if (!results.length) return 0;
  const executed = results.filter(r => r.status !== 'pending').length;
  return Math.round((executed / results.length) * 100);
}

// ── Report Generator ──────────────────────────────────────────────────────────

function generateReport(plan: TestPlanRow, exec: Execution, suites: TestSuite[], cases: TestCase[], results: CaseResult[]): string {
  const rec = deriveRecommendation(exec.pass_rate ?? 0);
  const now = exec.completed_at ?? new Date().toISOString();

  const suiteLines = suites.map(suite => {
    const sc = cases.filter(c => c.suite_id === suite.id);
    const sr = results.filter(r => sc.some(c => c.id === r.test_case_id));
    const passed = sr.filter(r => r.status === 'pass').length;
    const failed = sr.filter(r => r.status === 'fail').length;
    const blocked = sr.filter(r => r.status === 'blocked').length;
    const skipped = sr.filter(r => r.status === 'skipped').length;
    const na = sr.filter(r => r.status === 'na').length;
    const eligible = sc.length - na - skipped;
    const rate = eligible > 0 ? Math.round((passed / eligible) * 100) : 0;
    const caseLines = sc.map(tc => {
      const res = results.find(r => r.test_case_id === tc.id);
      const s = (res?.status ?? 'pending') as CaseStatus;
      const icon = s === 'pass' ? '✅' : s === 'fail' ? '❌' : s === 'blocked' ? '⚠️' : s === 'na' ? '➖' : s === 'skipped' ? '⏭️' : '⏳';
      const noteStr = res?.evidence_notes ? ` — ${res.evidence_notes}` : res?.notes ? ` — ${res.notes}` : '';
      return `  | ${tc.case_number} | ${tc.title} | ${icon} ${STATUS_CFG[s].label}${noteStr} |`;
    }).join('\n');
    return `### ${suite.suite_number} — ${suite.title}\nPass: ${passed} / Fail: ${failed} / Blocked: ${blocked} / Skipped: ${skipped} / N/A: ${na} | Rate: ${rate}%\n\n| Case | Title | Result |\n|------|-------|--------|\n${caseLines}`;
  }).join('\n\n');

  return `# ${plan.plan_number} — ${plan.title}
## Test Run Report: ${exec.run_number ?? exec.execution_number}

**Run ID:** ${exec.run_number ?? exec.execution_number}
**Release:** ${exec.release_label ?? exec.linked_release ?? 'Unspecified'}
**Release Candidate:** ${exec.release_candidate ?? '—'}
**Platform Version:** ${exec.platform_version ?? '—'}
**ECC Version:** ${exec.ecc_version ?? '—'}
**Spec Register Version:** ${exec.spec_register_version ?? '—'}
**Engineering Guardian:** ${exec.guardian_version ?? '—'}
**Executed By:** ${exec.executed_by ?? 'Unknown'}
**Date:** ${now.split('T')[0]}
**Duration:** ${exec.duration_minutes ? `${exec.duration_minutes} min` : '—'}
**Recommendation:** ${REC_CFG[rec].label.toUpperCase()}

---

## Summary

| Metric | Value |
|--------|-------|
| Total Cases | ${exec.total_cases} |
| Passed | ${exec.cases_passed} |
| Failed | ${exec.cases_failed} |
| Blocked | ${exec.cases_blocked} |
| N/A | ${exec.cases_na} |
| Pass Rate | ${(exec.pass_rate ?? 0).toFixed(1)}% |
| Confidence Score | ${exec.confidence_score ?? 0}% |

**Release Recommendation: ${rec} — ${REC_CFG[rec].label}**

${exec.notes ? `**Notes:** ${exec.notes}` : ''}

---

## Test Suite Results

${suiteLines}

---

*Test Run ${exec.run_number ?? exec.execution_number} — ${plan.plan_number} ${plan.title}*
`;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

function CopyButton({ text, label = 'Copy Report' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const cfg = RUN_STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === 'in_progress' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

// ── Execution Wizard ──────────────────────────────────────────────────────────

interface WizardProps {
  plan: TestPlanRow;
  suites: TestSuite[];
  cases: TestCase[];
  executions: Execution[];
  onClose: () => void;
  onComplete: () => void;
  resumeExecution?: Execution;
}

export function ExecutionWizard({ plan, suites, cases, executions, onClose, onComplete, resumeExecution }: WizardProps) {
  const isResuming = !!resumeExecution;
  const [step, setStep] = useState<1 | 2 | 3>(isResuming ? 2 : 1);
  const [releaseLabel, setReleaseLabel] = useState(resumeExecution?.release_label ?? '');
  const [executedBy, setExecutedBy] = useState(resumeExecution?.executed_by ?? '');
  const [rcLabel, setRcLabel] = useState(resumeExecution?.release_candidate ?? '');
  const [platformVersion, setPlatformVersion] = useState(resumeExecution?.platform_version ?? '');
  const [eccVersion, setEccVersion] = useState(resumeExecution?.ecc_version ?? '');
  const [specVersion, setSpecVersion] = useState(resumeExecution?.spec_register_version ?? '');
  const [guardianVersion, setGuardianVersion] = useState(resumeExecution?.guardian_version ?? '');
  const [notes, setNotes] = useState(resumeExecution?.notes ?? '');
  const [activeSuiteIdx, setActiveSuiteIdx] = useState(0);
  const [execution, setExecution] = useState<Execution | null>(resumeExecution ?? null);
  const [results, setResults] = useState<Record<string, CaseResult>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalReport, setFinalReport] = useState('');
  const [startedAt] = useState(new Date());
  const [activeNotesCaseId, setActiveNotesCaseId] = useState<string | null>(null);
  const [caseDraftNotes, setCaseDraftNotes] = useState<Record<string, string>>({});

  // Load existing results if resuming
  useEffect(() => {
    if (resumeExecution) {
      supabase.from('ecc_tp001_results').select('*').eq('execution_id', resumeExecution.id).then(({ data }) => {
        const map: Record<string, CaseResult> = {};
        (data ?? []).forEach((r: CaseResult) => { map[r.test_case_id] = r; });
        setResults(map);
        // Jump to first incomplete suite
        const firstIncomplete = suites.findIndex(suite => {
          const sc = cases.filter(c => c.suite_id === suite.id);
          return sc.some(c => !map[c.id] || map[c.id].status === 'pending');
        });
        if (firstIncomplete >= 0) setActiveSuiteIdx(firstIncomplete);
      });
    }
  }, [resumeExecution]);

  // Generate next run number
  const [nextRunNumber, setNextRunNumber] = useState<string>('TR-????');
  useEffect(() => {
    if (!isResuming) {
      supabase.from('ecc_tp001_executions').select('*', { count: 'exact', head: true }).then(({ count }) => {
        setNextRunNumber(`TR-${String((count ?? 0) + 1).padStart(4, '0')}`);
      });
    } else {
      setNextRunNumber(resumeExecution?.run_number ?? resumeExecution?.execution_number ?? 'TR-????');
    }
  }, [isResuming]);

  async function startExecution() {
    setSaving(true); setError(null);
    try {
      const { data, error: err } = await supabase
        .from('ecc_tp001_executions')
        .insert({
          plan_id: plan.id,
          run_number: nextRunNumber,
          execution_number: (() => {
            const nums = executions.map(e => parseInt(e.execution_number.split('-').pop() ?? '0', 10));
            const max = nums.length ? Math.max(...nums) : 0;
            return `${plan.plan_number}-${String(max + 1).padStart(4, '0')}`;
          })(),
          release_label: releaseLabel || null,
          executed_by: executedBy || null,
          release_candidate: rcLabel || null,
          platform_version: platformVersion || null,
          ecc_version: eccVersion || null,
          spec_register_version: specVersion || null,
          guardian_version: guardianVersion || null,
          status: 'in_progress',
          total_cases: plan.total_cases,
          cases_passed: 0, cases_failed: 0, cases_blocked: 0, cases_na: 0,
          notes: notes || null,
        })
        .select().single();
      if (err) throw err;
      const exec = data as Execution;
      setExecution(exec);
      const rows = cases.map(tc => ({ execution_id: exec.id, test_case_id: tc.id, case_number: tc.case_number, status: 'pending' as CaseStatus }));
      const { data: inserted, error: err2 } = await supabase.from('ecc_tp001_results').insert(rows).select();
      if (err2) throw err2;
      const map: Record<string, CaseResult> = {};
      (inserted as CaseResult[]).forEach(r => { map[r.test_case_id] = r; });
      setResults(map);
      setStep(2);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to start'); }
    finally { setSaving(false); }
  }

  async function updateCaseStatus(caseId: string, status: CaseStatus) {
    if (!execution) return;
    const current = results[caseId];
    if (!current) return;
    const notes = caseDraftNotes[caseId] ?? current.notes;
    const { data, error: err } = await supabase.from('ecc_tp001_results')
      .update({ status, notes: notes || null })
      .eq('id', current.id).select().single();
    if (!err && data) setResults(prev => ({ ...prev, [caseId]: data as CaseResult }));
  }

  async function saveNotes(caseId: string) {
    const current = results[caseId];
    if (!current) return;
    const noteText = caseDraftNotes[caseId] ?? '';
    const { data } = await supabase.from('ecc_tp001_results').update({ notes: noteText || null, evidence_notes: noteText || null }).eq('id', current.id).select().single();
    if (data) { setResults(prev => ({ ...prev, [caseId]: data as CaseResult })); setActiveNotesCaseId(null); }
  }

  async function pauseExecution() {
    if (!execution) return;
    setSaving(true);
    await supabase.from('ecc_tp001_executions').update({ status: 'paused', paused_at: new Date().toISOString() }).eq('id', execution.id);
    setSaving(false);
    onComplete();
    onClose();
  }

  async function cancelExecution() {
    if (!execution) return;
    setSaving(true);
    await supabase.from('ecc_tp001_executions').update({ status: 'cancelled' }).eq('id', execution.id);
    setSaving(false);
    onComplete();
    onClose();
  }

  async function completeExecution() {
    if (!execution) return;
    setSubmitting(true); setError(null);
    try {
      const allResults = Object.values(results);
      const passed = allResults.filter(r => r.status === 'pass').length;
      const failed = allResults.filter(r => r.status === 'fail').length;
      const blocked = allResults.filter(r => r.status === 'blocked').length;
      const skipped = allResults.filter(r => r.status === 'skipped').length;
      const na = allResults.filter(r => r.status === 'na').length;
      const eligible = execution.total_cases - na - skipped;
      const passRate = eligible > 0 ? Math.round((passed / eligible) * 1000) / 10 : 0;
      const confidence = deriveConfidence(allResults);
      const rec = deriveRecommendation(passRate);
      const completedAt = new Date();
      const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);
      const updatedExec: Execution = { ...execution, cases_passed: passed, cases_failed: failed, cases_blocked: blocked, cases_na: na + skipped, pass_rate: passRate, confidence_score: confidence, release_recommendation: rec, completed_at: completedAt.toISOString() };
      const md = generateReport(plan, updatedExec, suites, cases, allResults);
      setFinalReport(md);
      await supabase.from('ecc_tp001_executions').update({
        status: 'completed', cases_passed: passed, cases_failed: failed, cases_blocked: blocked, cases_na: na + skipped,
        pass_rate: passRate, confidence_score: confidence, release_recommendation: rec,
        report_markdown: md, completed_at: completedAt.toISOString(), duration_minutes: durationMinutes, paused_at: null,
      }).eq('id', execution.id);
      setExecution(updatedExec);
      setStep(3);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to complete'); }
    finally { setSubmitting(false); }
  }

  const currentSuite = suites[activeSuiteIdx];
  const suiteCases = cases.filter(c => c.suite_id === currentSuite?.id);
  const allResults = Object.values(results);
  const passCount = allResults.filter(r => r.status === 'pass').length;
  const failCount = allResults.filter(r => r.status === 'fail').length;
  const blockedCount = allResults.filter(r => r.status === 'blocked').length;
  const skippedCount = allResults.filter(r => r.status === 'skipped').length;
  const testedCount = allResults.filter(r => r.status !== 'pending').length;
  const totalCases = execution?.total_cases ?? plan.total_cases;
  const progressPct = totalCases > 0 ? Math.round((testedCount / totalCases) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><ClipboardList className="w-5 h-5 text-blue-600" /></div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-800">
                  {isResuming ? 'Resume Test Run' : 'New Test Run'}
                </h2>
                <span className="text-sm font-mono font-bold text-blue-700">{nextRunNumber}</span>
                {execution && <RunStatusBadge status={execution.status} />}
              </div>
              <p className="text-xs text-slate-500">{plan.plan_number} — {plan.title}</p>
            </div>
          </div>
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
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        {/* Step 1 — Configure */}
        {step === 1 && (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Configure Test Run</h3>
              <p className="text-xs text-slate-500 mb-5">Capture version metadata before execution begins. This data is permanently recorded with the run.</p>
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

              <div className="grid grid-cols-2 gap-4 max-w-2xl mb-4">
                {[
                  { label: 'Release Label',             key: 'releaseLabel',     value: releaseLabel,     set: setReleaseLabel,     placeholder: 'e.g. v2.4.1 Release' },
                  { label: 'Executed By',               key: 'executedBy',       value: executedBy,       set: setExecutedBy,       placeholder: 'Engineer name' },
                  { label: 'Release Candidate',         key: 'rcLabel',          value: rcLabel,          set: setRcLabel,          placeholder: 'e.g. RC-003' },
                  { label: 'Platform Version',          key: 'platformVersion',  value: platformVersion,  set: setPlatformVersion,  placeholder: 'e.g. LLND Automate v1.2.0' },
                  { label: 'ECC Version',               key: 'eccVersion',       value: eccVersion,       set: setEccVersion,       placeholder: 'e.g. ECC v1.0.0' },
                  { label: 'Spec Register Version',     key: 'specVersion',      value: specVersion,      set: setSpecVersion,      placeholder: 'e.g. SPEC-v1.0' },
                  { label: 'Engineering Guardian',      key: 'guardianVersion',  value: guardianVersion,  set: setGuardianVersion,  placeholder: 'e.g. Review #4 — 2026-07-05' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-medium text-slate-600 block mb-1">{f.label}</label>
                    <input type="text" value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-600 block mb-1">Execution Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Scope, context, or constraints for this run"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none" />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 max-w-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardList className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">{plan.plan_number} — {plan.title}</span>
                  <span className="ml-auto text-sm font-bold text-blue-700 font-mono">{nextRunNumber}</span>
                </div>
                <div className="flex gap-4 text-xs text-blue-600">
                  <span>{plan.total_suites} suites</span>
                  <span>{plan.total_cases} test cases</span>
                  <span>Pass threshold: 85%</span>
                </div>
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button onClick={startExecution} disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start Test Run
              </button>
            </div>
          </>
        )}

        {/* Step 2 — Execute */}
        {step === 2 && (
          <div className="flex-1 flex overflow-hidden">
            {/* Suite sidebar */}
            <div className="w-56 shrink-0 border-r border-slate-100 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-100 shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-600">Progress</span>
                  <span className="text-xs font-bold text-blue-600">{progressPct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                  <span className="text-emerald-600 font-medium">✓ {passCount} pass</span>
                  <span className="text-red-600 font-medium">✗ {failCount} fail</span>
                  <span className="text-amber-600 font-medium">⚠ {blockedCount} blocked</span>
                  <span className="text-violet-600 font-medium">⏭ {skippedCount} skip</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {suites.map((suite, idx) => {
                  const sc = cases.filter(c => c.suite_id === suite.id);
                  const sr = sc.map(c => results[c.id]).filter(Boolean);
                  const done = sr.filter(r => r?.status !== 'pending').length;
                  const allDone = done === sc.length;
                  const hasFail = sr.some(r => r?.status === 'fail');
                  return (
                    <button key={suite.id} onClick={() => setActiveSuiteIdx(idx)}
                      className={`w-full text-left px-3 py-2.5 border-b border-slate-50 transition-colors ${activeSuiteIdx === idx ? 'bg-blue-50 border-l-2 border-l-blue-400' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center justify-between">
                        <p className={`text-xs font-medium truncate ${activeSuiteIdx === idx ? 'text-blue-700' : 'text-slate-700'}`}>{suite.suite_number}</p>
                        {allDone ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" /> : hasFail ? <XCircle className="w-3 h-3 text-red-400 shrink-0" /> : null}
                      </div>
                      <p className="text-xs text-slate-400 truncate">{suite.title}</p>
                      <div className="mt-0.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${hasFail ? 'bg-red-300' : allDone ? 'bg-emerald-400' : 'bg-blue-300'}`}
                          style={{ width: sc.length > 0 ? `${(done / sc.length) * 100}%` : '0%' }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{done}/{sc.length}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Case runner */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="shrink-0 px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{currentSuite?.suite_number} — {currentSuite?.title}</p>
                  <p className="text-xs text-slate-500">{currentSuite?.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={pauseExecution} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
                    <Pause className="w-3.5 h-3.5" /> Save & Pause
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                {suiteCases.map(tc => {
                  const res = results[tc.id];
                  const status = (res?.status ?? 'pending') as CaseStatus;
                  const cfg = STATUS_CFG[status];
                  const Icon = cfg.icon;
                  const isNotesOpen = activeNotesCaseId === tc.id;
                  return (
                    <div key={tc.id} className={`px-5 py-4 transition-colors ${status === 'fail' ? 'bg-red-50/30' : status === 'pass' ? 'bg-emerald-50/20' : ''}`}>
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-xs font-mono text-slate-400">{tc.case_number}</span>
                            {tc.severity && (
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${tc.severity === 'critical' ? 'bg-red-50 text-red-600' : tc.severity === 'high' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>{tc.severity}</span>
                            )}
                            {(res?.notes || res?.evidence_notes) && <span className="text-xs text-slate-400 flex items-center gap-0.5"><MessageSquare className="w-3 h-3" /> Notes</span>}
                          </div>
                          <p className="text-sm font-medium text-slate-800">{tc.title}</p>
                          {tc.description && <p className="text-xs text-slate-500 mt-0.5">{tc.description}</p>}
                        </div>
                        <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                        </div>
                      </div>
                      {tc.steps && <div className="text-xs text-slate-500 bg-white border border-slate-100 rounded-lg p-2.5 mb-2 whitespace-pre-wrap">{tc.steps}</div>}

                      {/* Status buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(['pass', 'fail', 'blocked', 'skipped', 'na'] as CaseStatus[]).map(s => (
                          <button key={s} onClick={() => { updateCaseStatus(tc.id, s); if (s === 'fail' || s === 'blocked') setActiveNotesCaseId(tc.id); }}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${status === s ? `${STATUS_CFG[s].bg} ${STATUS_CFG[s].color} ${STATUS_CFG[s].border} shadow-sm` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                            {STATUS_CFG[s].label}
                          </button>
                        ))}
                        <button onClick={() => setActiveNotesCaseId(isNotesOpen ? null : tc.id)}
                          className="ml-1 flex items-center gap-1 px-2 py-1 text-xs text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">
                          <MessageSquare className="w-3 h-3" /> Notes
                        </button>
                        {status === 'fail' && (
                          <button className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors">
                            <Flag className="w-3 h-3" /> Create Issue
                          </button>
                        )}
                      </div>

                      {/* Notes input */}
                      {isNotesOpen && (
                        <div className="mt-2 flex gap-2">
                          <textarea
                            value={caseDraftNotes[tc.id] ?? res?.evidence_notes ?? res?.notes ?? ''}
                            onChange={e => setCaseDraftNotes(prev => ({ ...prev, [tc.id]: e.target.value }))}
                            rows={2} placeholder="Evidence, observations, or defect details…"
                            className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                            autoFocus
                          />
                          <button onClick={() => saveNotes(tc.id)} className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer navigation */}
              <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-white">
                <button onClick={() => setActiveSuiteIdx(i => Math.max(0, i - 1))} disabled={activeSuiteIdx === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{activeSuiteIdx + 1} / {suites.length} suites</span>
                  <button onClick={cancelExecution} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 hover:bg-slate-50 rounded transition-colors">Cancel Run</button>
                </div>
                {activeSuiteIdx < suites.length - 1 ? (
                  <button onClick={() => setActiveSuiteIdx(i => Math.min(suites.length - 1, i + 1))}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button onClick={completeExecution} disabled={submitting}
                    className="flex items-center gap-1.5 px-5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60 shadow-sm">
                    {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Complete Run
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Completion summary */}
        {step === 3 && execution && (() => {
          const allR = Object.values(results);
          const passed = allR.filter(r => r.status === 'pass').length;
          const failed = allR.filter(r => r.status === 'fail').length;
          const blocked = allR.filter(r => r.status === 'blocked').length;
          const skipped = allR.filter(r => r.status === 'skipped').length;
          const na = allR.filter(r => r.status === 'na').length;
          const eligible = totalCases - na - skipped;
          const passRate = eligible > 0 ? Math.round((passed / eligible) * 1000) / 10 : 0;
          const rec = deriveRecommendation(passRate);
          const cfg = REC_CFG[rec];
          const RecIcon = cfg.icon;
          const confidence = deriveConfidence(allR);
          return (
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Run complete header */}
              <div className="text-center py-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h3 className="text-lg font-bold text-slate-800">Test Run Complete</h3>
                <p className="text-sm text-slate-500 font-mono">{execution.run_number}</p>
              </div>

              {/* Recommendation */}
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${cfg.border} ${cfg.bg}`}>
                <RecIcon className={`w-6 h-6 ${cfg.color} shrink-0`} />
                <div><p className={`text-base font-bold ${cfg.color}`}>{rec}</p><p className={`text-sm ${cfg.color} opacity-80`}>{cfg.label}</p></div>
                <div className="ml-auto text-right"><p className={`text-3xl font-bold ${cfg.color}`}>{passRate.toFixed(1)}%</p><p className="text-xs text-slate-500">pass rate</p></div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-5 gap-3">
                <StatCard label="Passed"  value={passed}    color="text-emerald-700" />
                <StatCard label="Failed"  value={failed}    color="text-red-700" />
                <StatCard label="Blocked" value={blocked}   color="text-amber-700" />
                <StatCard label="Skipped" value={skipped}   color="text-violet-600" />
                <StatCard label="N/A"     value={na}        color="text-slate-400" />
              </div>

              {/* Run metadata */}
              <div className="bg-white rounded-xl border border-slate-100 p-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Run Details</h4>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  {[
                    { label: 'Run ID',             value: execution.run_number },
                    { label: 'Confidence',         value: `${confidence}%` },
                    { label: 'Duration',           value: execution.duration_minutes ? `${execution.duration_minutes} min` : '—' },
                    { label: 'Platform Version',   value: execution.platform_version },
                    { label: 'ECC Version',        value: execution.ecc_version },
                    { label: 'Release Candidate',  value: execution.release_candidate },
                    { label: 'Spec Register',      value: execution.spec_register_version },
                    { label: 'Engineering Guardian', value: execution.guardian_version },
                    { label: 'Executed By',        value: execution.executed_by },
                  ].filter(f => f.value).map(f => (
                    <div key={f.label} className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-xs text-slate-500 mb-0.5">{f.label}</p>
                      <p className="text-sm font-medium text-slate-700">{f.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Report */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Report</h4>
                  <CopyButton text={finalReport} />
                </div>
                <pre className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-4 overflow-auto max-h-48 whitespace-pre-wrap font-mono">{finalReport}</pre>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 flex-wrap justify-end pt-2 border-t border-slate-100">
                {failed > 0 && (
                  <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-700 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                    <Flag className="w-4 h-4" /> Review {failed} Failure{failed !== 1 ? 's' : ''}
                  </button>
                )}
                <button onClick={() => { onComplete(); onClose(); }}
                  className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                  <Activity className="w-4 h-4" /> Return to Dashboard
                </button>
              </div>
            </div>
          );
        })()}

        {error && step !== 1 && (
          <div className="shrink-0 px-6 py-2 bg-red-50 border-t border-red-100"><p className="text-xs text-red-600">{error}</p></div>
        )}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ plan, executions, onRun }: { plan: TestPlanRow; executions: Execution[]; onRun: () => void }) {
  const latest = executions.find(e => e.status === 'completed');
  const paused = executions.filter(e => e.status === 'paused');
  const rec = latest?.release_recommendation as Recommendation | undefined;
  const recCfg = rec ? REC_CFG[rec] : null;
  const lastFive = executions.filter(e => e.status === 'completed').slice(0, 5).reverse();

  return (
    <div className="space-y-5">
      {/* Paused runs alert */}
      {paused.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <Pause className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">{paused.length} Paused Run{paused.length > 1 ? 's' : ''}</p>
            <p className="text-xs text-amber-600">{paused[0].run_number} — {paused[0].executed_by ?? 'Unknown'}</p>
          </div>
          <button onClick={onRun} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors">
            <Play className="w-4 h-4" /> Resume
          </button>
        </div>
      )}

      {/* Release readiness */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Release Readiness</h3>
        {latest && recCfg ? (
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border ${recCfg.border} ${recCfg.bg} flex-1`}>
              {React.createElement(recCfg.icon, { className: `w-5 h-5 ${recCfg.color}` })}
              <div><p className={`text-base font-bold ${recCfg.color}`}>{latest.release_recommendation}</p><p className={`text-xs ${recCfg.color} opacity-80`}>{recCfg.label}</p></div>
              <div className="ml-auto text-right"><p className={`text-xl font-bold ${recCfg.color}`}>{latest.pass_rate?.toFixed(1)}%</p><p className="text-xs text-slate-500">pass rate</p></div>
            </div>
            <div className="text-right text-xs text-slate-500 shrink-0">
              <p className="font-mono font-semibold text-slate-700">{latest.run_number ?? latest.execution_number}</p>
              <p>{latest.platform_version ?? latest.release_label ?? '—'}</p>
              <p>{latest.completed_at ? new Date(latest.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No completed runs — execute this plan to get a release recommendation</p>
          </div>
        )}
      </div>

      {/* Stats */}
      {latest && (
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="Total"      value={latest.total_cases} />
          <StatCard label="Passed"     value={latest.cases_passed}  color="text-emerald-600" />
          <StatCard label="Failed"     value={latest.cases_failed}  color="text-red-600" />
          <StatCard label="Blocked"    value={latest.cases_blocked} color="text-amber-600" />
          <StatCard label="Confidence" value={`${latest.confidence_score ?? 0}%`} color="text-blue-600" />
        </div>
      )}

      {/* Trend */}
      {lastFive.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Pass Rate Trend</h3>
          <div className="flex items-end gap-3 h-20">
            {lastFive.map((exec, i) => {
              const rate = exec.pass_rate ?? 0;
              const rec2 = exec.release_recommendation as Recommendation;
              const color = rec2 === 'PROCEED' ? 'bg-emerald-400' : rec2 === 'WARNING' ? 'bg-amber-400' : 'bg-red-400';
              const prev = i > 0 ? (lastFive[i - 1].pass_rate ?? 0) : rate;
              const TrendIcon = rate > prev ? TrendingUp : rate < prev ? TrendingDown : Minus;
              return (
                <div key={exec.id} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-slate-500">{rate.toFixed(0)}%</span>
                  <div className={`w-full rounded-t ${color}`} style={{ height: `${Math.max(4, rate * 0.6)}px` }} />
                  <TrendIcon className={`w-3 h-3 ${rate > prev ? 'text-emerald-500' : rate < prev ? 'text-red-400' : 'text-slate-400'}`} />
                  <span className="text-xs text-slate-400 font-mono">{exec.run_number?.replace('TR-', '') ?? '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Plan metadata */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Plan Details</h3>
        <div className="grid grid-cols-4 gap-4 text-sm mb-3">
          <div><p className="text-xs text-slate-500">Plan Number</p><p className="font-medium text-slate-800">{plan.plan_number}</p></div>
          <div><p className="text-xs text-slate-500">Suites</p><p className="font-medium text-slate-800">{plan.total_suites}</p></div>
          <div><p className="text-xs text-slate-500">Cases</p><p className="font-medium text-slate-800">{plan.total_cases}</p></div>
          <div><p className="text-xs text-slate-500">Total Runs</p><p className="font-medium text-slate-800">{executions.length}</p></div>
          {plan.status && <div><p className="text-xs text-slate-500">Status</p><p className="font-medium text-slate-800 capitalize">{plan.status}</p></div>}
          {plan.plan_type && <div><p className="text-xs text-slate-500">Type</p><p className="font-medium text-slate-800">{plan.plan_type}</p></div>}
          {plan.priority && <div><p className="text-xs text-slate-500">Priority</p><p className="font-medium text-slate-800 capitalize">{plan.priority}</p></div>}
          {plan.owner && <div><p className="text-xs text-slate-500">Owner</p><p className="font-medium text-slate-800">{plan.owner}</p></div>}
          {latest?.platform_version && <div><p className="text-xs text-slate-500">Last Platform</p><p className="font-medium text-slate-800">{latest.platform_version}</p></div>}
          {latest?.ecc_version && <div><p className="text-xs text-slate-500">Last ECC</p><p className="font-medium text-slate-800">{latest.ecc_version}</p></div>}
          {latest?.executed_by && <div><p className="text-xs text-slate-500">Last Executor</p><p className="font-medium text-slate-800">{latest.executed_by}</p></div>}
          {latest?.duration_minutes && <div><p className="text-xs text-slate-500">Avg Duration</p><p className="font-medium text-slate-800">{latest.duration_minutes} min</p></div>}
        </div>
        {plan.description && <p className="text-xs text-slate-500 border-t border-slate-50 pt-3">{plan.description}</p>}
      </div>
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab({ executions }: { executions: Execution[] }) {
  const [selected, setSelected] = useState<Execution | null>(null);
  useEffect(() => { if (!selected && executions.length) setSelected(executions[0]); }, [executions]);

  return (
    <div className="flex gap-4 min-h-[500px]">
      <div className="w-72 shrink-0 flex flex-col gap-1">
        {executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <Clock className="w-6 h-6 mb-2 opacity-40" /><p className="text-sm">No runs yet</p>
          </div>
        ) : executions.map(exec => {
          const rec = exec.release_recommendation as Recommendation | undefined;
          const cfg = rec ? REC_CFG[rec] : null;
          const isSelected = selected?.id === exec.id;
          const runStatusCfg = RUN_STATUS_CFG[exec.status];
          return (
            <button key={exec.id} onClick={() => setSelected(exec)}
              className={`text-left w-full p-3 rounded-xl border transition-colors ${isSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-white hover:bg-slate-50'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono font-bold text-slate-700">{exec.run_number ?? exec.execution_number}</span>
                {cfg && exec.status === 'completed' ? <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.bg} ${cfg.color}`}>{exec.release_recommendation}</span>
                  : <RunStatusBadge status={exec.status} />}
              </div>
              <p className="text-xs text-slate-500 truncate">{exec.release_label ?? exec.platform_version ?? 'No label'}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-slate-400">{new Date(exec.started_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                <span className={`text-xs font-medium ${exec.status === 'completed' ? 'text-emerald-600' : exec.status === 'paused' ? 'text-amber-600' : 'text-blue-600'}`}>
                  {exec.status === 'completed' ? `${exec.pass_rate?.toFixed(0)}%` : exec.status}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col">
        {!selected ? <div className="flex items-center justify-center h-full text-slate-400"><p className="text-sm">Select a run</p></div> : (
          <>
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800 font-mono">{selected.run_number ?? selected.execution_number}</h3>
                  <RunStatusBadge status={selected.status} />
                </div>
                <p className="text-xs text-slate-500">{[selected.release_label, selected.platform_version, selected.ecc_version, selected.executed_by].filter(Boolean).join(' · ')}</p>
              </div>
              {selected.report_markdown && <CopyButton text={selected.report_markdown} />}
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {selected.release_recommendation && selected.status === 'completed' && (() => {
                const rec2 = selected.release_recommendation as Recommendation;
                const cfg2 = REC_CFG[rec2];
                return (
                  <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${cfg2.border} ${cfg2.bg}`}>
                    {React.createElement(cfg2.icon, { className: `w-4 h-4 ${cfg2.color}` })}
                    <span className={`text-sm font-semibold ${cfg2.color}`}>{selected.release_recommendation} — {cfg2.label}</span>
                    <span className={`ml-auto text-lg font-bold ${cfg2.color}`}>{selected.pass_rate?.toFixed(1)}%</span>
                  </div>
                );
              })()}
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="Passed"  value={selected.cases_passed}  color="text-emerald-600" />
                <StatCard label="Failed"  value={selected.cases_failed}  color="text-red-600" />
                <StatCard label="Blocked" value={selected.cases_blocked} color="text-amber-600" />
                <StatCard label="N/A"     value={selected.cases_na}      color="text-slate-400" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Run ID',              value: selected.run_number },
                  { label: 'Platform Version',    value: selected.platform_version },
                  { label: 'ECC Version',         value: selected.ecc_version },
                  { label: 'Release Candidate',   value: selected.release_candidate },
                  { label: 'Spec Register',       value: selected.spec_register_version },
                  { label: 'Engineering Guardian',value: selected.guardian_version },
                  { label: 'Duration',            value: selected.duration_minutes ? `${selected.duration_minutes} min` : null },
                  { label: 'Confidence',          value: selected.confidence_score != null ? `${selected.confidence_score}%` : null },
                  { label: 'Executed By',         value: selected.executed_by },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-xs text-slate-500 mb-0.5">{f.label}</p>
                    <p className="text-sm font-medium text-slate-700">{f.value}</p>
                  </div>
                ))}
              </div>
              {selected.report_markdown && (
                <pre className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-4 overflow-auto max-h-72 whitespace-pre-wrap font-mono">{selected.report_markdown}</pre>
              )}
              {selected.notes && <div className="p-3 bg-slate-50 rounded-lg"><p className="text-xs font-medium text-slate-600 mb-1">Notes</p><p className="text-xs text-slate-500">{selected.notes}</p></div>}
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
    setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  const filtered = search
    ? suites.filter(s => s.suite_number.toLowerCase().includes(search.toLowerCase()) || s.title.toLowerCase().includes(search.toLowerCase()) || cases.some(c => c.suite_id === s.id && (c.case_number.toLowerCase().includes(search.toLowerCase()) || c.title.toLowerCase().includes(search.toLowerCase()))))
    : suites;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter suites or cases…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
        </div>
        <span className="text-xs text-slate-500">{filtered.length} suites · {cases.length} cases</span>
        <div className="flex gap-1.5">
          <button onClick={() => setExpanded(new Set(suites.map(s => s.id)))} className="text-xs text-blue-600 hover:text-blue-800">Expand all</button>
          <span className="text-slate-300">·</span>
          <button onClick={() => setExpanded(new Set())} className="text-xs text-slate-500 hover:text-slate-700">Collapse all</button>
        </div>
      </div>
      {filtered.map(suite => {
        const sc = cases.filter(c => c.suite_id === suite.id);
        const isOpen = expanded.has(suite.id);
        return (
          <div key={suite.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <button onClick={() => toggle(suite.id)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center shrink-0"><Layers className="w-3.5 h-3.5 text-blue-600" /></div>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-800">{suite.suite_number} — {suite.title}</p>
                  {suite.description && <p className="text-xs text-slate-500">{suite.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-slate-400">{sc.length} cases</span>
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-slate-50 divide-y divide-slate-50">
                {sc.map(tc => (
                  <div key={tc.id} className="px-5 py-3 pl-14">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono text-slate-400">{tc.case_number}</span>
                      {tc.severity && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${tc.severity === 'critical' ? 'bg-red-50 text-red-600' : tc.severity === 'high' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>{tc.severity}</span>}
                    </div>
                    <p className="text-sm font-medium text-slate-700">{tc.title}</p>
                    {tc.description && <p className="text-xs text-slate-500 mt-0.5">{tc.description}</p>}
                    {tc.expected_result && <p className="text-xs text-slate-400 mt-1"><span className="font-medium">Expected:</span> {tc.expected_result}</p>}
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

// ── Main Export ───────────────────────────────────────────────────────────────

interface ECCTestPlanDetailPageProps {
  planId?: string;
  planNumber?: string;
  onBack?: () => void;
  autoStartRun?: boolean;
}

export function ECCTestPlanDetailPage({ planId, planNumber = 'TP-001', onBack, autoStartRun }: ECCTestPlanDetailPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'library'>('overview');
  const [plan, setPlan] = useState<TestPlanRow | null>(null);
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<Execution | undefined>(undefined);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const planQuery = planId
        ? supabase.from('ecc_test_plans').select('id, plan_number, title, total_suites, total_cases, status, description, plan_type, priority, owner').eq('id', planId).maybeSingle()
        : supabase.from('ecc_test_plans').select('id, plan_number, title, total_suites, total_cases, status, description, plan_type, priority, owner').eq('plan_number', planNumber).maybeSingle();
      const [planRes] = await Promise.all([planQuery]);
      const foundPlan = planRes.data as TestPlanRow | null;
      setPlan(foundPlan);
      if (foundPlan) {
        const [execRes, suitesRes, casesRes] = await Promise.all([
          supabase.from('ecc_tp001_executions').select('*').eq('plan_id', foundPlan.id).order('started_at', { ascending: false }),
          supabase.from('ecc_test_suites').select('id, suite_number, title, description').eq('plan_id', foundPlan.id).order('suite_number'),
          supabase.from('ecc_test_cases').select('id, case_number, title, description, steps, expected_result, severity, suite_id').eq('plan_id', foundPlan.id).order('case_number'),
        ]);
        setExecutions((execRes.data ?? []) as Execution[]);
        setSuites((suitesRes.data ?? []) as TestSuite[]);
        setCases((casesRes.data ?? []) as TestCase[]);
      }
    } finally {
      setLoading(false);
    }
  }, [planId, planNumber]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (autoStartRun && plan && !loading) { setShowWizard(true); } }, [autoStartRun, plan, loading]);

  const latestCompleted = executions.find(e => e.status === 'completed');
  const pausedRuns = executions.filter(e => e.status === 'paused');
  const latestRec = latestCompleted?.release_recommendation as Recommendation | undefined;

  function handleRun() {
    if (pausedRuns.length > 0) {
      setResumeTarget(pausedRuns[0]);
    } else {
      setResumeTarget(undefined);
    }
    setShowWizard(true);
  }

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
              {onBack && (
                <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> Test Plans
                </button>
              )}
              <div className="p-2 bg-blue-50 rounded-xl"><ClipboardList className="w-5 h-5 text-blue-600" /></div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-slate-800">{plan?.plan_number ?? planNumber}</h1>
                  {plan && <span className="text-sm text-slate-600 font-medium">— {plan.title}</span>}
                  {latestRec && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REC_CFG[latestRec].bg} ${REC_CFG[latestRec].color}`}>{latestRec}</span>}
                  {pausedRuns.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">{pausedRuns.length} paused</span>}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{plan ? `${plan.total_suites} suites · ${plan.total_cases} cases · ${executions.length} runs` : 'Loading…'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadAll} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {plan && (
                <button onClick={handleRun}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-200">
                  {pausedRuns.length > 0 ? <><RotateCcw className="w-4 h-4" /> Resume Run</> : <><Play className="w-4 h-4" /> Run Test Plan</>}
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                  <Icon className="w-3.5 h-3.5" />{tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40"><RefreshCw className="w-5 h-5 text-slate-400 animate-spin" /></div>
        ) : !plan ? (
          <div className="flex items-center justify-center h-40 text-slate-400"><p className="text-sm">Test plan not found</p></div>
        ) : (
          <>
            {activeTab === 'overview' && <OverviewTab plan={plan} executions={executions} onRun={handleRun} />}
            {activeTab === 'history'  && <HistoryTab executions={executions} />}
            {activeTab === 'library'  && <LibraryTab suites={suites} cases={cases} />}
          </>
        )}
      </div>

      {showWizard && plan && (
        <ExecutionWizard
          plan={plan}
          suites={suites}
          cases={cases}
          executions={executions}
          resumeExecution={resumeTarget}
          onClose={() => { setShowWizard(false); setResumeTarget(undefined); }}
          onComplete={loadAll}
        />
      )}
    </div>
  );
}
