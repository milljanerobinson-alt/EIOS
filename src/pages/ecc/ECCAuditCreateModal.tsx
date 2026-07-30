import { useState, useEffect } from 'react';
import {
  Zap, XCircle, Loader2, AlertCircle, Info, CheckCircle2,
  Plus, Minus, Trash2, PenLine, Wand2, Download, History,
  FlaskConical, Shield,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { AuditError } from './ECCAuditPage';
import { READINESS_CFG, AUDIT_DOMAIN_CFG } from './ECCAuditPage';

// ─── Types ────────────────────────────────────────────────────────────────────

type CreateMode = 'select' | 'production_ai' | 'draft_ai' | 'manual';
type ProgressStep = 'idle' | 'gathering' | 'analysing' | 'saving' | 'done';

const PROGRESS_STEPS: { key: ProgressStep; label: string }[] = [
  { key: 'gathering',  label: 'Gathering platform evidence'         },
  { key: 'analysing',  label: 'Analysing with AI Technical Director' },
  { key: 'saving',     label: 'Saving audit report'                 },
  { key: 'done',       label: 'Audit generated successfully'        },
];

interface CategoryScore { category: string; score: number }

interface ManualFinding {
  severity: string; category: string; title: string;
  description: string; recommendation: string;
}

const READINESS_OPTIONS = [
  { value: '',                label: 'Not assessed'    },
  { value: 'ready',           label: 'Ready'           },
  { value: 'nearly_ready',    label: 'Nearly Ready'    },
  { value: 'partially_ready', label: 'Partially Ready' },
  { value: 'not_ready',       label: 'Not Ready'       },
];

const SEVERITY_OPTIONS    = ['critical', 'high', 'medium', 'low', 'info'];
const FINDING_CATEGORIES  = [
  'Architecture', 'Security', 'Performance', 'Code Quality',
  'Testing', 'Documentation', 'Compliance', 'Infrastructure', 'Other',
];

// ─── Mode Selector ────────────────────────────────────────────────────────────

function ModeSelector({ onSelect }: { onSelect: (mode: CreateMode) => void }) {
  return (
    <div className="p-5 space-y-3">
      <p className="text-xs text-slate-500 mb-4">Choose the type of audit to create:</p>

      {/* Production AI Audit */}
      <button
        onClick={() => onSelect('production_ai')}
        className="w-full flex items-start gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 bg-white text-left transition-all group"
      >
        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
          <Shield className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-slate-900">Production Audit</p>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">AI GENERATED</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Creates a permanent governance record. Receives an official AUD number, contributes
            to trend analysis, engineering health history, and executive reporting.
          </p>
          <p className="text-[11px] text-emerald-600 font-medium mt-1.5">Permanent engineering record — cannot be deleted</p>
        </div>
      </button>

      {/* Draft / Sandbox Audit */}
      <button
        onClick={() => onSelect('draft_ai')}
        className="w-full flex items-start gap-4 p-4 rounded-xl border border-amber-200 hover:border-amber-300 hover:bg-amber-50/40 bg-amber-50/20 text-left transition-all group"
      >
        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
          <FlaskConical className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-slate-900">Draft / Sandbox Audit</p>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">SANDBOX</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Temporary engineering validation. Does not receive an AUD number or contribute to
            governance history. Can be regenerated, deleted, or promoted to a Production Audit.
          </p>
          <p className="text-[11px] text-amber-600 font-medium mt-1.5">Safe for testing — deletable at any time</p>
        </div>
      </button>

      {/* Manual / Historical */}
      <button
        onClick={() => onSelect('manual')}
        className="w-full flex items-start gap-4 p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-left transition-all group"
      >
        <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
          <PenLine className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 mb-0.5">Manual / Historical Audit</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Import or record an existing engineering review. Enter data directly — no AI provider
            required. Used for historical records and external assessments.
          </p>
        </div>
      </button>
    </div>
  );
}

// ─── AI Generation Form ───────────────────────────────────────────────────────

function AIGenerationForm({
  isDraft,
  onGenerated,
  onClose,
}: {
  isDraft: boolean;
  onGenerated: () => void;
  onClose: () => void;
}) {
  const [title, setTitle]           = useState('');
  const [notes, setNotes]           = useState('');
  const [auditType, setAuditType]   = useState('ai_platform');
  const [loading, setLoading]       = useState(false);
  const [step, setStep]             = useState<ProgressStep>('idle');
  const [auditError, setAuditError] = useState<AuditError | null>(null);
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);

  useEffect(() => {
    supabase
      .from('ai_provider_configs')
      .select('id')
      .eq('is_enabled', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setHasProvider(!!data));
  }, []);

  async function handleGenerate() {
    if (!title.trim()) {
      setAuditError({
        error_code: 'missing_title',
        title: 'Audit Title Required',
        message: 'Please enter a title before generating the audit.',
        action: 'Enter a title in the Audit Title field above.',
      });
      return;
    }

    setLoading(true);
    setAuditError(null);
    setStep('gathering');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string);

      setStep('analysing');

      let response: Response;
      try {
        response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-platform-audit`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'ai_generated',
              title: title.trim(),
              notes: notes.trim(),
              audit_type: auditType,
              is_draft: isDraft,
            }),
          },
        );
      } catch {
        setAuditError({
          error_code: 'network_error',
          title: 'Unable to Contact Audit Service',
          message: 'The audit engine could not be reached.',
          action: 'Check your internet connection and try again.',
          action_path: 'pa-system-logs',
        });
        setStep('idle');
        setLoading(false);
        return;
      }

      setStep('saving');

      let result: Record<string, unknown>;
      try {
        result = await response.json();
      } catch {
        setAuditError({
          error_code: 'parse_error',
          title: 'Unexpected Response',
          message: `The audit service returned an unexpected response (HTTP ${response.status}).`,
          action: 'Please try again.',
          action_path: 'pa-system-logs',
        });
        setStep('idle');
        setLoading(false);
        return;
      }

      if (!response.ok || result.error) {
        if (result.error_code) {
          setAuditError(result as unknown as AuditError);
        } else {
          setAuditError({
            error_code: 'request_failed',
            title: response.status === 401 ? 'Authentication Required' :
                   response.status === 403 ? 'Administrator Access Required' : 'Audit Engine Error',
            message: String(result.error ?? `Request failed (HTTP ${response.status})`),
            action: response.status === 401 ? 'Please sign in and try again.' :
                    response.status === 403 ? 'Please sign in with an administrator account.' :
                    'Please try again or check Platform Operations → System Logs.',
          });
        }
        setStep('idle');
        setLoading(false);
        return;
      }

      setStep('done');
      setTimeout(() => { onGenerated(); onClose(); }, 900);
    } catch (err) {
      setAuditError({
        error_code: 'unexpected',
        title: 'Audit Engine Error',
        message: err instanceof Error ? err.message : 'An unexpected error occurred.',
        action: 'Please try again.',
        action_path: 'pa-system-logs',
      });
      setStep('idle');
      setLoading(false);
    }
  }

  const isRunning = loading && step !== 'idle' && step !== 'done';

  if (hasProvider === null) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <>
      <div className="p-5 space-y-4 flex-1 overflow-y-auto">

        {/* Draft sandbox notice */}
        {isDraft && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
            <FlaskConical className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800">Draft / Sandbox Mode</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                This audit will <strong>not</strong> receive an AUD number and will not contribute to engineering
                governance history. It can be deleted or promoted to a Production Audit at any time.
              </p>
            </div>
          </div>
        )}

        {/* No provider warning */}
        {!hasProvider && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No AI Provider Configured</p>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                  AI audit generation requires an active AI provider. Configure one in Platform Operations → AI Providers.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        {!isRunning && step !== 'done' && (
          <>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">
                Audit Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => { setTitle(e.target.value); setAuditError(null); }}
                placeholder={isDraft ? 'e.g. Draft — AI Platform Test Run...' : 'e.g. Q3 Platform Health Review...'}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Audit Domain</label>
              <select
                value={auditType}
                onChange={e => setAuditType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              >
                {Object.entries(AUDIT_DOMAIN_CFG).map(([value, cfg]) => (
                  <option key={value} value={value}>{cfg.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">
                Additional Context <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Specific areas to focus on, recent changes, known issues..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
              />
            </div>
          </>
        )}

        {/* Progress steps */}
        {(isRunning || step === 'done') && (
          <div className="py-2 space-y-2">
            {PROGRESS_STEPS.map(({ key, label }) => {
              const stepIndex = PROGRESS_STEPS.findIndex(s => s.key === step);
              const thisIndex = PROGRESS_STEPS.findIndex(s => s.key === key);
              const isDone    = step === 'done' || thisIndex < stepIndex;
              const isCurrent = key === step;
              return (
                <div key={key} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                  isCurrent ? 'bg-blue-50 border border-blue-200' :
                  isDone    ? 'bg-emerald-50 border border-emerald-100' :
                              'bg-slate-50 border border-slate-100 opacity-40'
                }`}>
                  {isCurrent ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
                  ) : isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
                  )}
                  <span className={`text-xs font-medium ${
                    isCurrent ? 'text-blue-700' : isDone ? 'text-emerald-700' : 'text-slate-400'
                  }`}>{label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Error display */}
        {auditError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">{auditError.title}</p>
                <p className="text-xs text-red-700 mt-1 leading-relaxed">{auditError.message}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 pt-1 border-t border-red-200/60">
              <Info className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 leading-relaxed">{auditError.action}</p>
            </div>
          </div>
        )}
      </div>

      {!isRunning && step !== 'done' && (
        <div className="flex gap-3 px-5 pb-5 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!title.trim() || !hasProvider}
            className={`flex-1 py-2.5 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
              isDraft
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {isDraft ? <FlaskConical className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            {isDraft ? 'Generate Draft Audit' : 'Generate Production Audit'}
          </button>
        </div>
      )}
    </>
  );
}

// ─── Manual Audit Form ────────────────────────────────────────────────────────

function ManualAuditForm({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [step, setStep]     = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const [title, setTitle]               = useState('');
  const [auditDomain, setAuditDomain]   = useState<string>('engineering');
  const [creationMethod, setCreationMethod] = useState<string>('manual');
  const [auditDate, setAuditDate]       = useState('');
  const [notes, setNotes]               = useState('');

  const [execSummary, setExecSummary] = useState('');
  const [healthScore, setHealthScore] = useState<number | ''>('');
  const [commercial, setCommercial]   = useState('');
  const [compliance, setCompliance]   = useState('');
  const [release, setRelease]         = useState('');

  const [scores, setScores]           = useState<CategoryScore[]>([]);
  const [newScoreCat, setNewScoreCat] = useState('');
  const [newScoreVal, setNewScoreVal] = useState<number | ''>(75);

  const [findings, setFindings]           = useState<ManualFinding[]>([]);
  const [addingFinding, setAddingFinding] = useState(false);
  const [findingForm, setFindingForm]     = useState<ManualFinding>({
    severity: 'medium', category: 'Architecture', title: '', description: '', recommendation: '',
  });

  function addScore() {
    if (!newScoreCat.trim() || newScoreVal === '') return;
    setScores(s => [...s, { category: newScoreCat.trim(), score: Number(newScoreVal) }]);
    setNewScoreCat(''); setNewScoreVal(75);
  }

  function addFinding() {
    if (!findingForm.title.trim()) return;
    setFindings(f => [...f, { ...findingForm }]);
    setFindingForm({ severity: 'medium', category: 'Architecture', title: '', description: '', recommendation: '' });
    setAddingFinding(false);
  }

  async function handleSave() {
    if (!title.trim()) { setError('Audit title is required.'); return; }
    setSaving(true); setError(null);

    const { data: audit, error: auditErr } = await supabase
      .from('ecc_audits')
      .insert({
        name:                    title.trim(),
        audit_type:              auditDomain,
        creation_method:         creationMethod,
        status:                  'draft',
        audit_category:          'platform_health',
        workspace:               'production',
        audit_engine_version:    'Engineering Governance v1.0',
        executive_summary:       execSummary.trim() || null,
        overall_health_score:    healthScore !== '' ? Number(healthScore) : null,
        commercial_readiness:    commercial || null,
        compliance_readiness:    compliance || null,
        release_readiness:       release || null,
        review_notes:            notes.trim() || null,
        audit_date:              auditDate || null,
        total_findings_count:    findings.length || null,
        critical_findings_count: findings.filter(f => f.severity === 'critical').length || null,
        high_findings_count:     findings.filter(f => f.severity === 'high').length || null,
        medium_findings_count:   findings.filter(f => f.severity === 'medium').length || null,
        low_findings_count:      findings.filter(f => f.severity === 'low' || f.severity === 'info').length || null,
        is_draft:                false,
      })
      .select()
      .single();

    if (auditErr || !audit) { setError(auditErr?.message ?? 'Failed to create audit.'); setSaving(false); return; }

    if (scores.length > 0) {
      await supabase.from('ecc_audit_scores').insert(
        scores.map(s => ({ audit_id: audit.id, category: s.category, score: s.score }))
      );
    }

    if (findings.length > 0) {
      await supabase.from('ecc_audit_findings').insert(
        findings.map((f, i) => ({
          audit_id:       audit.id,
          finding_number: `F-${String(i + 1).padStart(3, '0')}`,
          severity:       f.severity,
          category:       f.category,
          title:          f.title,
          description:    f.description,
          recommendation: f.recommendation,
          priority:       f.severity === 'critical' || f.severity === 'high' ? 'must_have' : 'should_have',
          current_status: 'open',
        }))
      );
    }

    await supabase.rpc('get_next_register_number', { p_type: 'aud' }).then(({ data: regNum }) => {
      if (regNum) {
        supabase.from('ecc_engineering_register').insert({
          register_number: regNum, register_type: 'aud',
          entity_id: audit.id, entity_table: 'ecc_audits',
          title: title.trim(), status: 'draft',
        });
      }
    });

    setSaving(false); onCreated(); onClose();
  }

  const STEP_LABELS = ['Basic Info', 'Assessment', 'Findings'];

  return (
    <>
      <div className="flex items-center gap-1 px-5 pb-3 border-b border-slate-100">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1; const done = step > n; const active = step === n;
          return (
            <div key={label} className="flex items-center gap-1 flex-1">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${done ? 'bg-emerald-500 text-white' : active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-[11px] font-medium truncate ${active ? 'text-slate-800' : done ? 'text-emerald-600' : 'text-slate-400'}`}>{label}</span>
              {i < STEP_LABELS.length - 1 && <div className={`h-px flex-1 mx-1 ${done ? 'bg-emerald-300' : 'bg-slate-100'}`} />}
            </div>
          );
        })}
      </div>

      <div className="p-5 space-y-4 flex-1 overflow-y-auto">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {step === 1 && (
          <>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Audit Title <span className="text-red-500">*</span></label>
              <input type="text" value={title} onChange={e => { setTitle(e.target.value); setError(null); }}
                placeholder="e.g. Q2 2026 Platform Health Review"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Audit Domain</label>
              <select value={auditDomain} onChange={e => setAuditDomain(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none">
                {Object.entries(AUDIT_DOMAIN_CFG).map(([value, cfg]) => (
                  <option key={value} value={value}>{cfg.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Creation Method</label>
              <div className="space-y-1.5">
                {[
                  { value: 'manual',    label: 'Manual',     Icon: PenLine,  desc: 'Create a new audit with manual data entry' },
                  { value: 'historical',label: 'Historical', Icon: History,  desc: 'Record a past audit with known data'        },
                  { value: 'imported',  label: 'Imported',   Icon: Download, desc: 'Import from an external assessment'        },
                ].map(({ value, label, Icon: MethodIcon, desc }) => (
                  <button key={value} onClick={() => setCreationMethod(value)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                      creationMethod === value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}>
                    <MethodIcon className={`w-4 h-4 shrink-0 ${creationMethod === value ? 'text-blue-400' : 'text-slate-400'}`} />
                    <div>
                      <p className="text-sm font-medium leading-none">{label}</p>
                      <p className={`text-xs mt-0.5 ${creationMethod === value ? 'text-slate-300' : 'text-slate-500'}`}>{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {(creationMethod === 'historical' || creationMethod === 'imported') && (
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Audit Date</label>
                <input type="date" value={auditDate} onChange={e => setAuditDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Notes / Context <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Scope, context, or background notes..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none resize-none" />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Executive Summary</label>
              <textarea rows={5} value={execSummary} onChange={e => setExecSummary(e.target.value)}
                placeholder="Paste or type the executive summary..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none resize-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Overall Health Score <span className="text-slate-400 font-normal">(0–100)</span></label>
              <div className="flex items-center gap-3">
                <input type="number" min={0} max={100} value={healthScore}
                  onChange={e => setHealthScore(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 74" className="w-24 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
                {healthScore !== '' && (
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${Number(healthScore) >= 80 ? 'bg-emerald-500' : Number(healthScore) >= 60 ? 'bg-teal-500' : Number(healthScore) >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${healthScore}%` }} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-2">Readiness Signals</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'commercial', label: 'Commercial', val: commercial, set: setCommercial },
                  { key: 'compliance', label: 'Compliance', val: compliance, set: setCompliance },
                  { key: 'release',    label: 'Release',    val: release,    set: setRelease    },
                ].map(({ key, label, val, set }) => (
                  <div key={key}>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">{label}</label>
                    <select value={val} onChange={e => set(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none">
                      {READINESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-2">Category Scores</label>
              {scores.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {scores.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-xs text-slate-600 flex-1">{s.category}</span>
                      <span className="text-xs font-bold text-slate-800">{s.score}/100</span>
                      <button onClick={() => setScores(sc => sc.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="text" value={newScoreCat} onChange={e => setNewScoreCat(e.target.value)}
                  placeholder="Category name..." onKeyDown={e => e.key === 'Enter' && addScore()}
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none" />
                <input type="number" min={0} max={100} value={newScoreVal}
                  onChange={e => setNewScoreVal(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-16 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none text-center" />
                <button onClick={addScore} disabled={!newScoreCat.trim() || newScoreVal === ''}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg disabled:opacity-40">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">{findings.length} finding{findings.length !== 1 ? 's' : ''} added</p>
              {!addingFinding && (
                <button onClick={() => setAddingFinding(true)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold">
                  <Plus className="w-3 h-3" />Add Finding
                </button>
              )}
            </div>
            {addingFinding && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Severity</label>
                    <select value={findingForm.severity} onChange={e => setFindingForm(f => ({ ...f, severity: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none bg-white">
                      {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Category</label>
                    <select value={findingForm.category} onChange={e => setFindingForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none bg-white">
                      {FINDING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <input type="text" value={findingForm.title} onChange={e => setFindingForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Finding title *"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none bg-white" />
                <textarea rows={2} value={findingForm.description} onChange={e => setFindingForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Description..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none bg-white resize-none" />
                <textarea rows={2} value={findingForm.recommendation} onChange={e => setFindingForm(f => ({ ...f, recommendation: e.target.value }))}
                  placeholder="Recommendation..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none bg-white resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setAddingFinding(false)} className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-white rounded-lg text-xs">Cancel</button>
                  <button onClick={addFinding} disabled={!findingForm.title.trim()}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold disabled:opacity-50">Add</button>
                </div>
              </div>
            )}
            {findings.length > 0 && (
              <div className="space-y-2">
                {findings.map((f, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex items-start gap-3">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 mt-0.5 ${
                      f.severity === 'critical' ? 'bg-red-100 text-red-700' :
                      f.severity === 'high'     ? 'bg-orange-100 text-orange-700' :
                      f.severity === 'medium'   ? 'bg-amber-100 text-amber-700' :
                                                  'bg-slate-100 text-slate-600'
                    }`}>{f.severity}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{f.title}</p>
                      <p className="text-[10px] text-slate-400">{f.category}</p>
                    </div>
                    <button onClick={() => setFindings(fds => fds.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 shrink-0">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {findings.length === 0 && !addingFinding && (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                <p className="text-xs text-slate-400">No findings added yet.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Findings can also be added after creating the audit.</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-3 px-5 pb-5 pt-3 border-t border-slate-100">
        {step === 1 ? (
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-sm font-medium">Cancel</button>
        ) : (
          <button onClick={() => setStep(s => (s > 1 ? (s - 1) as 1|2|3 : s))} className="flex-1 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-sm font-medium">Back</button>
        )}
        {step < 3 ? (
          <button onClick={() => {
            if (step === 1 && !title.trim()) { setError('Please enter an audit title.'); return; }
            setError(null); setStep(s => (s + 1) as 1|2|3);
          }} className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold">Next</button>
        ) : (
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Audit
          </button>
        )}
      </div>
    </>
  );
}

// ─── Create Audit Modal ───────────────────────────────────────────────────────

export function CreateAuditModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [mode, setMode] = useState<CreateMode>('select');

  const headerIcon = mode === 'draft_ai'
    ? <FlaskConical className="w-4 h-4 text-amber-400" />
    : mode === 'production_ai'
    ? <Zap className="w-4 h-4 text-blue-400" />
    : <PenLine className="w-4 h-4 text-white" />;

  const headerBg = mode === 'draft_ai' ? 'bg-amber-500' : 'bg-slate-900';

  const headerTitle =
    mode === 'select'        ? 'New Engineering Audit'   :
    mode === 'production_ai' ? 'Production Audit'        :
    mode === 'draft_ai'      ? 'Draft / Sandbox Audit'   :
                               'Manual / Historical Audit';

  const headerSub =
    mode === 'select'        ? 'Choose audit type'                          :
    mode === 'production_ai' ? 'Permanent governance record'                :
    mode === 'draft_ai'      ? 'Engineering sandbox — not a permanent record' :
                               'Enter audit data manually';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 ${headerBg} rounded-lg flex items-center justify-center`}>
              {headerIcon}
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">{headerTitle}</h3>
              <p className="text-xs text-slate-400">{headerSub}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {mode !== 'select' && (
              <button onClick={() => setMode('select')} className="p-1 text-slate-400 hover:text-slate-600 text-xs font-medium hover:bg-slate-100 rounded-lg px-2">
                Back
              </button>
            )}
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {mode === 'select'        && <ModeSelector onSelect={setMode} />}
        {mode === 'production_ai' && <AIGenerationForm isDraft={false} onGenerated={onCreated} onClose={onClose} />}
        {mode === 'draft_ai'      && <AIGenerationForm isDraft={true}  onGenerated={onCreated} onClose={onClose} />}
        {mode === 'manual'        && <ManualAuditForm onCreated={onCreated} onClose={onClose} />}
      </div>
    </div>
  );
}
