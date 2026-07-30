import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Brain, CheckCircle2, XCircle, AlertCircle, Clock, Loader2,
  ChevronDown, ChevronUp, PlayCircle, RefreshCw, Sparkles,
  BarChart3, Zap, Target, FileText, ChevronRight,
  Plus, Edit2, X, Save, Copy, Check, ArrowRight,
  ShieldCheck, TrendingUp, Activity,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DevPhase {
  id: string;
  phase_number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  confidence: number | null;
  estimated_build_time: string | null;
  estimated_risk: string;
  release_version: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
  objectives: string[];
  implementation_tasks: Array<{ task: string; status?: string }> | string[];
  acceptance_criteria: string[];
  dependencies: number[];
  related_features: string[];
  related_db_objects: string[];
  notes: string | null;
  implementation_prompt: string | null;
  readiness_assessment: ReadinessAssessment | null;
}

interface ReadinessAssessment {
  phase_number: number;
  phase_title: string;
  overall_ready: boolean;
  confidence: number;
  criteria_results: Array<{ criterion: string; status: 'pass' | 'fail' | 'partial'; note?: string }>;
  checklist: Record<string, boolean>;
  remaining_work: string[];
  summary: string;
  recommendation: string;
}

interface TDRecommendation {
  recommended_phase_number: number;
  recommended_phase_title: string;
  confidence: number;
  reasoning: string;
  estimated_effort: string;
  estimated_risk: string;
  business_impact: string;
  technical_impact: string;
  priority_rationale: string;
  prerequisites: string[];
  alternative_phases: Array<{ phase_number: number; reason: string }>;
}

interface TDPlan {
  phase_number: number;
  phase_title: string;
  estimated_build_time: string;
  estimated_risk: string;
  confidence: number;
  db_migrations: string[];
  edge_functions: string[];
  frontend_pages: string[];
  frontend_components: string[];
  test_cases: string[];
  rollback_steps: string[];
  documentation_updates: string[];
  implementation_prompt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  complete:    { label: 'Complete',    bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  in_progress: { label: 'In Progress', bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'   },
  review:      { label: 'In Review',   bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  planned:     { label: 'Planned',     bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'  },
  backlog:     { label: 'Backlog',     bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400'  },
  archived:    { label: 'Archived',    bg: 'bg-slate-100',   text: 'text-slate-400',   dot: 'bg-slate-300'  },
  skipped:     { label: 'Skipped',     bg: 'bg-slate-100',   text: 'text-slate-400',   dot: 'bg-slate-300'  },
};

const PRIORITY_CFG: Record<string, string> = {
  critical: 'text-red-600 bg-red-50 border-red-200',
  high:     'text-orange-600 bg-orange-50 border-orange-200',
  medium:   'text-amber-600 bg-amber-50 border-amber-200',
  low:      'text-slate-500 bg-slate-50 border-slate-200',
};

const RISK_CFG: Record<string, string> = {
  critical: 'text-red-600',
  high:     'text-orange-500',
  medium:   'text-amber-500',
  low:      'text-emerald-600',
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
  };
}

async function callTD(payload: Record<string, unknown>): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/technical-director`,
    { method: 'POST', headers, body: JSON.stringify(payload) },
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.backlog;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Checklist item ─────────────────────────────────────────────────────────────

function CheckItem({ label, status }: { label: string; status: 'pass' | 'fail' | 'partial' }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {status === 'pass'
        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        : status === 'partial'
          ? <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
      <span className={`text-sm ${status === 'fail' ? 'text-red-700' : status === 'partial' ? 'text-amber-700' : 'text-slate-700'}`}>
        {label}
      </span>
    </div>
  );
}

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ── Confidence ring ────────────────────────────────────────────────────────────

function ConfidenceRing({ value, size = 56 }: { value: number; size?: number }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - value / 100);
  const color = value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={fill} strokeLinecap="round" />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fontSize="11" fontWeight="700" fill={color} style={{ transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}>
        {value}%
      </text>
    </svg>
  );
}

// ── Expandable section ─────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 transition-colors">
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 py-3 bg-white">{children}</div>}
    </div>
  );
}

// ── Phase edit modal ───────────────────────────────────────────────────────────

function PhaseEditModal({ phase, onSave, onClose }: {
  phase: Partial<DevPhase> | null;
  onSave: (data: Partial<DevPhase>) => Promise<void>;
  onClose: () => void;
}) {
  const isNew = !phase?.id;
  const [form, setForm] = useState({
    phase_number: phase?.phase_number ?? 0,
    title: phase?.title ?? '',
    description: phase?.description ?? '',
    status: phase?.status ?? 'planned',
    priority: phase?.priority ?? 'medium',
    estimated_risk: phase?.estimated_risk ?? 'medium',
    estimated_build_time: phase?.estimated_build_time ?? '',
    release_version: phase?.release_version ?? '',
    notes: phase?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try { await onSave(form as Partial<DevPhase>); onClose(); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">{isNew ? 'New Phase' : `Edit Phase ${form.phase_number}`}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Phase Number</label>
              <input type="number" className="input" value={form.phase_number}
                onChange={(e) => setForm(f => ({ ...f, phase_number: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="label">Release Version</label>
              <input type="text" className="input" value={form.release_version}
                onChange={(e) => setForm(f => ({ ...f, release_version: e.target.value }))}
                placeholder="e.g. 1.5.0" />
            </div>
          </div>
          <div>
            <label className="label">Title</label>
            <input type="text" className="input" value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input min-h-[80px]" value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}>
                {Object.keys(STATUS_CFG).map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}>
                {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Risk</label>
              <select className="input" value={form.estimated_risk} onChange={(e) => setForm(f => ({ ...f, estimated_risk: e.target.value }))}>
                {['low','medium','high','critical'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Estimated Build Time</label>
            <input type="text" className="input" value={form.estimated_build_time}
              onChange={(e) => setForm(f => ({ ...f, estimated_build_time: e.target.value }))}
              placeholder="e.g. 2-3 days" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-[60px]" value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.title} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isNew ? 'Create Phase' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function ECCDevProgrammePage() {
  const [phases, setPhases] = useState<DevPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhase, setSelectedPhase] = useState<DevPhase | null>(null);
  const [editModal, setEditModal] = useState<Partial<DevPhase> | null | false>(false);

  // TD state
  const [tdMode, setTdMode] = useState<'idle' | 'assessing' | 'recommending' | 'planning' | 'done'>('idle');
  const [assessment, setAssessment] = useState<ReadinessAssessment | null>(null);
  const [recommendation, setRecommendation] = useState<TDRecommendation | null>(null);
  const [plan, setPlan] = useState<TDPlan | null>(null);
  const [tdReply, setTdReply] = useState('');
  const [tdError, setTdError] = useState('');
  const [activeTdTab, setActiveTdTab] = useState<'assess' | 'recommend' | 'plan'>('assess');
  const [planTargetPhase, setPlanTargetPhase] = useState<number | null>(null);

  const loadPhases = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ecc_dev_phases')
      .select('*,implementation_prompt:bolt_prompt')
      .order('phase_number');
    const list = (data ?? []) as DevPhase[];
    setPhases(list);
    if (!selectedPhase && list.length > 0) {
      const inProgress = list.find(p => p.status === 'in_progress') ?? list[0];
      setSelectedPhase(inProgress);
    } else if (selectedPhase) {
      const refreshed = list.find(p => p.id === selectedPhase.id);
      if (refreshed) setSelectedPhase(refreshed);
    }
    setLoading(false);
  }, [selectedPhase]);

  useEffect(() => { loadPhases(); }, []);

  // ── TD actions ─────────────────────────────────────────────────────────────

  async function runAssess(phaseNumber?: number) {
    setTdError('');
    setTdMode('assessing');
    setActiveTdTab('assess');
    try {
      const resp = await callTD({ mode: 'assess', phase_number: phaseNumber });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message ?? data.error ?? 'Assessment failed');
      setAssessment(data.assessment ?? null);
      setTdReply(data.reply ?? '');
      await loadPhases();
      setTdMode('done');
    } catch (e) {
      setTdError(e instanceof Error ? e.message : 'Assessment failed');
      setTdMode('idle');
    }
  }

  async function runRecommend() {
    setTdError('');
    setTdMode('recommending');
    setActiveTdTab('recommend');
    try {
      const resp = await callTD({ mode: 'recommend' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message ?? data.error ?? 'Recommendation failed');
      setRecommendation(data.recommendation ?? null);
      setTdReply(data.reply ?? '');
      setTdMode('done');
    } catch (e) {
      setTdError(e instanceof Error ? e.message : 'Recommendation failed');
      setTdMode('idle');
    }
  }

  async function runPlan(phaseNumber: number) {
    setTdError('');
    setTdMode('planning');
    setActiveTdTab('plan');
    setPlanTargetPhase(phaseNumber);
    try {
      const resp = await callTD({ mode: 'plan', phase_number: phaseNumber });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message ?? data.error ?? 'Plan generation failed');
      setPlan(data.plan ?? null);
      setTdReply(data.reply ?? '');
      await loadPhases();
      setTdMode('done');
    } catch (e) {
      setTdError(e instanceof Error ? e.message : 'Plan generation failed');
      setTdMode('idle');
    }
  }

  async function markPhaseStatus(phaseId: string, status: string) {
    const update: Record<string, unknown> = { status };
    if (status === 'complete') update.completed_at = new Date().toISOString();
    await supabase.from('ecc_dev_phases').update(update).eq('id', phaseId);
    await loadPhases();
  }

  async function savePhase(data: Partial<DevPhase>) {
    if (editModal && (editModal as DevPhase).id) {
      await supabase.from('ecc_dev_phases').update(data).eq('id', (editModal as DevPhase).id);
    } else {
      await supabase.from('ecc_dev_phases').insert({
        ...data,
        objectives: [],
        implementation_tasks: [],
        acceptance_criteria: [],
        dependencies: [],
      });
    }
    await loadPhases();
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = {
    total:       phases.length,
    complete:    phases.filter(p => p.status === 'complete').length,
    in_progress: phases.filter(p => p.status === 'in_progress').length,
    planned:     phases.filter(p => p.status === 'planned').length,
    backlog:     phases.filter(p => p.status === 'backlog').length,
  };

  const currentPhase = phases.find(p => p.status === 'in_progress');
  const nextPlanned  = phases.find(p => p.status === 'planned');

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading Development Programme…
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Development Programme</h2>
          <p className="text-sm text-slate-500 mt-1">
            Structured development phases managed by the AI Technical Director.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadPhases} className="btn-secondary text-sm flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
          <button onClick={() => setEditModal({})} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" />New Phase
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',       value: stats.total,       color: 'text-slate-700' },
          { label: 'Complete',    value: stats.complete,    color: 'text-emerald-600' },
          { label: 'In Progress', value: stats.in_progress, color: 'text-blue-600' },
          { label: 'Planned',     value: stats.planned,     color: 'text-amber-600' },
          { label: 'Backlog',     value: stats.backlog,     color: 'text-slate-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* ── Phase list (left) ───────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-2">
          {phases.map(phase => {
            const cfg = STATUS_CFG[phase.status] ?? STATUS_CFG.backlog;
            const isSelected = selectedPhase?.id === phase.id;
            return (
              <button
                key={phase.id}
                onClick={() => setSelectedPhase(phase)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-slate-400 w-8">P{phase.phase_number}</span>
                  <StatusBadge status={phase.status} />
                  {phase.priority === 'critical' && (
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${PRIORITY_CFG.critical}`}>
                      Critical
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">{phase.release_version}</span>
                </div>
                <p className={`text-sm font-semibold pl-8 ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                  {phase.title}
                </p>
                {phase.readiness_assessment && (
                  <div className="pl-8 mt-1 flex items-center gap-2">
                    {phase.readiness_assessment.overall_ready
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      : <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                    <span className="text-xs text-slate-500">
                      Last assessed · {phase.readiness_assessment.confidence}% confidence
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        <div className="xl:col-span-3 space-y-4">
          {selectedPhase ? (
            <>
              {/* Phase header */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold text-slate-400">Phase {selectedPhase.phase_number}</span>
                      <StatusBadge status={selectedPhase.status} />
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${PRIORITY_CFG[selectedPhase.priority] ?? PRIORITY_CFG.medium}`}>
                        {selectedPhase.priority}
                      </span>
                      <span className={`text-xs font-medium ${RISK_CFG[selectedPhase.estimated_risk] ?? ''}`}>
                        {selectedPhase.estimated_risk} risk
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{selectedPhase.title}</h3>
                    {selectedPhase.description && (
                      <p className="text-sm text-slate-600 mt-1">{selectedPhase.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => setEditModal(selectedPhase)} className="btn-ghost text-xs flex items-center gap-1">
                      <Edit2 className="w-3.5 h-3.5" />Edit
                    </button>
                  </div>
                </div>

                {/* Quick meta */}
                <div className="flex flex-wrap gap-4 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  {selectedPhase.release_version && (
                    <span><strong className="text-slate-700">Version:</strong> {selectedPhase.release_version}</span>
                  )}
                  {selectedPhase.estimated_build_time && (
                    <span><strong className="text-slate-700">Est. time:</strong> {selectedPhase.estimated_build_time}</span>
                  )}
                  {selectedPhase.completed_at && (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="w-3 h-3" />
                      Completed {new Date(selectedPhase.completed_at).toLocaleDateString('en-AU')}
                    </span>
                  )}
                  {selectedPhase.reviewed_at && (
                    <span className="flex items-center gap-1">
                      <Brain className="w-3 h-3" />
                      TD reviewed {new Date(selectedPhase.reviewed_at).toLocaleDateString('en-AU')}
                    </span>
                  )}
                </div>

                {/* Quick status actions */}
                {selectedPhase.status !== 'complete' && selectedPhase.status !== 'archived' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                    {selectedPhase.status === 'planned' && (
                      <button
                        onClick={() => markPhaseStatus(selectedPhase.id, 'in_progress')}
                        className="btn-primary text-xs flex items-center gap-1.5"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />Start Phase
                      </button>
                    )}
                    {selectedPhase.status === 'in_progress' && (
                      <button
                        onClick={() => markPhaseStatus(selectedPhase.id, 'review')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                      >
                        <Target className="w-3.5 h-3.5" />Mark for Review
                      </button>
                    )}
                    {selectedPhase.status === 'review' && (
                      <button
                        onClick={() => markPhaseStatus(selectedPhase.id, 'complete')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />Mark Complete
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Phase details */}
              <div className="space-y-3">
                {selectedPhase.objectives?.length > 0 && (
                  <Section title="Objectives" defaultOpen>
                    <ul className="space-y-1.5">
                      {(selectedPhase.objectives as string[]).map((obj, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                          {obj}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {selectedPhase.acceptance_criteria?.length > 0 && (
                  <Section title={`Acceptance Criteria (${(selectedPhase.acceptance_criteria as string[]).length})`} defaultOpen={selectedPhase.status !== 'complete'}>
                    <ul className="space-y-1.5">
                      {(selectedPhase.acceptance_criteria as string[]).map((ac, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${selectedPhase.status === 'complete' ? 'text-emerald-500' : 'text-slate-300'}`} />
                          {ac}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {selectedPhase.related_db_objects?.length > 0 && (
                  <Section title="Database Objects">
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPhase.related_db_objects.map((obj, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-mono">
                          {obj}
                        </span>
                      ))}
                    </div>
                  </Section>
                )}

                {selectedPhase.related_features?.length > 0 && (
                  <Section title="Related Features">
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPhase.related_features.map((f, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200">
                          {f}
                        </span>
                      ))}
                    </div>
                  </Section>
                )}

                {selectedPhase.notes && (
                  <Section title="Notes">
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedPhase.notes}</p>
                  </Section>
                )}

                {selectedPhase.implementation_prompt && (
                  <Section title="Implementation Prompt">
                    <div className="flex justify-end mb-2">
                      <CopyButton text={selectedPhase.implementation_prompt} label="Copy Prompt" />
                    </div>
                    <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 max-h-64 overflow-y-auto font-sans leading-relaxed">
                      {selectedPhase.implementation_prompt}
                    </pre>
                  </Section>
                )}
              </div>

              {/* Last readiness assessment */}
              {selectedPhase.readiness_assessment && (
                <ReadinessPanel assessment={selectedPhase.readiness_assessment} />
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center text-slate-400">
              <Brain className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a phase to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* ── AI Technical Director Panel ─────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-700/60">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                <Brain className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">AI Technical Director</h3>
                <p className="text-xs text-slate-400">Reviews platform state · Assesses readiness · Plans next phase</p>
              </div>
            </div>

            {/* Tab buttons */}
            <div className="flex rounded-lg overflow-hidden border border-slate-700 text-sm">
              {(['assess', 'recommend', 'plan'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTdTab(tab)}
                  className={`px-4 py-1.5 font-medium transition-colors ${
                    activeTdTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {tdError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/40 border border-red-700/50 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {tdError}
            </div>
          )}

          {/* ── ASSESS TAB ─────────────────────────────────────────────────── */}
          {activeTdTab === 'assess' && (
            <div className="space-y-4">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 mb-3">
                    The Technical Director will review the current in-progress phase against its acceptance criteria, check testing, documentation, and architecture, then produce a readiness score.
                  </p>
                  {currentPhase && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                      <Activity className="w-3.5 h-3.5" />
                      Current phase: <span className="text-white font-medium">Phase {currentPhase.phase_number} — {currentPhase.title}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => runAssess(currentPhase?.phase_number)}
                  disabled={tdMode === 'assessing'}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
                >
                  {tdMode === 'assessing'
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Assessing…</>
                    : <><ShieldCheck className="w-4 h-4" />Assess Current Phase</>}
                </button>
                {selectedPhase && selectedPhase.id !== currentPhase?.id && (
                  <button
                    onClick={() => runAssess(selectedPhase.phase_number)}
                    disabled={tdMode === 'assessing'}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    Assess Phase {selectedPhase.phase_number}
                  </button>
                )}
              </div>

              {tdMode === 'done' && assessment && activeTdTab === 'assess' && (
                <AssessmentResult assessment={assessment} />
              )}

              {tdReply && tdMode === 'done' && activeTdTab === 'assess' && (
                <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2">Technical Director Analysis</p>
                  <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{tdReply}</div>
                </div>
              )}
            </div>
          )}

          {/* ── RECOMMEND TAB ──────────────────────────────────────────────── */}
          {activeTdTab === 'recommend' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                The Technical Director reviews all planned and backlog phases, considers dependencies, business impact, compliance requirements, and current platform maturity to recommend the optimal next phase.
              </p>

              <button
                onClick={runRecommend}
                disabled={tdMode === 'recommending'}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
              >
                {tdMode === 'recommending'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Analysing…</>
                  : <><TrendingUp className="w-4 h-4" />Recommend Next Phase</>}
              </button>

              {tdMode === 'done' && recommendation && activeTdTab === 'recommend' && (
                <RecommendationResult
                  recommendation={recommendation}
                  phases={phases}
                  onPlan={(n) => { setActiveTdTab('plan'); runPlan(n); }}
                />
              )}

              {tdReply && tdMode === 'done' && activeTdTab === 'recommend' && (
                <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2">Technical Director Reasoning</p>
                  <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{tdReply}</div>
                </div>
              )}
            </div>
          )}

          {/* ── PLAN TAB ───────────────────────────────────────────────────── */}
          {activeTdTab === 'plan' && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-300 mb-3">
                  Select a phase and the Technical Director will generate a complete, implementation-ready engineering plan with database migrations, edge functions, frontend changes, testing plan, and rollback instructions.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="flex-1 max-w-xs rounded-lg bg-slate-800 border border-slate-600 text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500"
                    value={planTargetPhase ?? ''}
                    onChange={(e) => setPlanTargetPhase(parseInt(e.target.value) || null)}
                  >
                    <option value="">Select phase to plan…</option>
                    {phases.filter(p => p.status !== 'complete' && p.status !== 'archived').map(p => (
                      <option key={p.id} value={p.phase_number}>
                        Phase {p.phase_number}: {p.title}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => planTargetPhase && runPlan(planTargetPhase)}
                    disabled={!planTargetPhase || tdMode === 'planning'}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
                  >
                    {tdMode === 'planning'
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Planning…</>
                      : <><Sparkles className="w-4 h-4" />Generate Plan</>}
                  </button>
                </div>
              </div>

              {tdMode === 'done' && plan && activeTdTab === 'plan' && (
                <PlanResult plan={plan} />
              )}

              {tdReply && tdMode === 'done' && activeTdTab === 'plan' && (
                <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2">Implementation Plan</p>
                  <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{tdReply}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editModal !== false && (
        <PhaseEditModal
          phase={editModal}
          onSave={savePhase}
          onClose={() => setEditModal(false)}
        />
      )}
    </div>
  );
}

// ── Assessment result panel ────────────────────────────────────────────────────

function ReadinessPanel({ assessment }: { assessment: ReadinessAssessment }) {
  const passed = Object.values(assessment.checklist ?? {}).filter(Boolean).length;
  const total  = Object.values(assessment.checklist ?? {}).length;
  return (
    <div className={`rounded-xl border p-4 ${assessment.overall_ready ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-center gap-3 mb-3">
        {assessment.overall_ready
          ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          : <AlertCircle className="w-5 h-5 text-amber-600" />}
        <div className="flex-1">
          <p className={`text-sm font-bold ${assessment.overall_ready ? 'text-emerald-800' : 'text-amber-800'}`}>
            {assessment.overall_ready ? 'Phase Ready' : 'Phase Not Ready'} — {assessment.confidence}% confidence
          </p>
          <p className="text-xs text-slate-500">{passed}/{total} checks passed</p>
        </div>
      </div>
      <p className="text-sm text-slate-700 mb-2">{assessment.summary}</p>
      {assessment.remaining_work?.length > 0 && (
        <ul className="space-y-1">
          {assessment.remaining_work.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />{w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssessmentResult({ assessment }: { assessment: ReadinessAssessment }) {
  const checkEntries = Object.entries(assessment.checklist ?? {});
  const passed = checkEntries.filter(([, v]) => v).length;

  return (
    <div className={`rounded-xl border p-5 ${assessment.overall_ready ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-amber-900/20 border-amber-700/40'}`}>
      <div className="flex items-center gap-4 mb-4">
        <ConfidenceRing value={assessment.confidence} size={64} />
        <div>
          <div className="flex items-center gap-2 mb-1">
            {assessment.overall_ready
              ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              : <AlertCircle className="w-5 h-5 text-amber-400" />}
            <p className={`font-bold text-base ${assessment.overall_ready ? 'text-emerald-300' : 'text-amber-300'}`}>
              {assessment.overall_ready ? 'Phase Ready for Advancement' : 'Phase Not Yet Ready'}
            </p>
          </div>
          <p className="text-sm text-slate-400">
            Phase {assessment.phase_number}: {assessment.phase_title} · {passed}/{checkEntries.length} checks passed
          </p>
        </div>
      </div>

      <p className="text-sm text-slate-300 mb-4">{assessment.summary}</p>

      {/* Checklist */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mb-4">
        {checkEntries.map(([key, val]) => (
          <div key={key} className="flex items-center gap-2 py-0.5">
            {val
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
            <span className={`text-xs ${val ? 'text-slate-300' : 'text-red-300'}`}>
              {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </span>
          </div>
        ))}
      </div>

      {/* Criteria results */}
      {assessment.criteria_results?.length > 0 && (
        <div className="space-y-1 mb-4">
          {assessment.criteria_results.map((cr, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5">
              {cr.status === 'pass'
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                : cr.status === 'partial'
                  ? <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />}
              <div>
                <span className={`text-xs ${cr.status === 'pass' ? 'text-slate-300' : cr.status === 'partial' ? 'text-amber-300' : 'text-red-300'}`}>
                  {cr.criterion}
                </span>
                {cr.note && <span className="text-xs text-slate-500 ml-1">— {cr.note}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {assessment.remaining_work?.length > 0 && (
        <div className="bg-amber-900/30 border border-amber-700/40 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-400 mb-1.5">Remaining Work</p>
          <ul className="space-y-1">
            {assessment.remaining_work.map((w, i) => (
              <li key={i} className="text-xs text-amber-300 flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />{w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {assessment.recommendation && (
        <p className="text-sm text-slate-300 mt-3 pt-3 border-t border-slate-700/40">
          <span className="font-semibold text-white">Recommendation:</span> {assessment.recommendation}
        </p>
      )}
    </div>
  );
}

// ── Recommendation result ─────────────────────────────────────────────────────

function RecommendationResult({
  recommendation, phases, onPlan,
}: {
  recommendation: TDRecommendation;
  phases: DevPhase[];
  onPlan: (n: number) => void;
}) {
  const targetPhase = phases.find(p => p.phase_number === recommendation.recommended_phase_number);
  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5 space-y-4">
      <div className="flex items-center gap-4">
        <ConfidenceRing value={recommendation.confidence} size={64} />
        <div>
          <p className="text-xs text-slate-400 mb-1">Recommended Next Phase</p>
          <p className="text-lg font-bold text-white">
            Phase {recommendation.recommended_phase_number}: {recommendation.recommended_phase_title}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            <span>Est. effort: <strong className="text-white">{recommendation.estimated_effort}</strong></span>
            <span className={`${RISK_CFG[recommendation.estimated_risk] ?? ''}`}>
              {recommendation.estimated_risk} risk
            </span>
            {recommendation.dependencies_satisfied
              ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Dependencies met</span>
              : <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" />Dependencies unmet</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {recommendation.business_impact && (
          <div className="bg-slate-900/40 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-400 mb-1">Business Impact</p>
            <p className="text-xs text-slate-300">{recommendation.business_impact}</p>
          </div>
        )}
        {recommendation.technical_impact && (
          <div className="bg-slate-900/40 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-400 mb-1">Technical Impact</p>
            <p className="text-xs text-slate-300">{recommendation.technical_impact}</p>
          </div>
        )}
      </div>

      {recommendation.prerequisites?.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-400 mb-1">Prerequisites</p>
          {recommendation.prerequisites.map((p, i) => (
            <p key={i} className="text-xs text-amber-300 flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />{p}
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-slate-700">
        <button
          onClick={() => onPlan(recommendation.recommended_phase_number)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-amber-600 hover:bg-amber-500 text-white transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Generate Implementation Plan for Phase {recommendation.recommended_phase_number}
        </button>
        {targetPhase?.status === 'planned' && (
          <span className="text-xs text-slate-400">Ready to plan</span>
        )}
      </div>
    </div>
  );
}

// ── Plan result ───────────────────────────────────────────────────────────────

function PlanResult({ plan }: { plan: TDPlan }) {
  const sections: Array<{ key: keyof TDPlan; label: string; icon: typeof FileText }> = [
    { key: 'db_migrations',       label: 'Database Migrations',    icon: Activity },
    { key: 'edge_functions',      label: 'Edge Functions',          icon: Zap },
    { key: 'frontend_pages',      label: 'Frontend Pages',          icon: BarChart3 },
    { key: 'frontend_components', label: 'Frontend Components',     icon: Target },
    { key: 'test_cases',          label: 'Test Cases',              icon: CheckCircle2 },
    { key: 'rollback_steps',      label: 'Rollback Plan',           icon: ArrowRight },
    { key: 'documentation_updates', label: 'Documentation Updates', icon: FileText },
  ];

  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <ConfidenceRing value={plan.confidence} size={64} />
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Implementation Plan Generated</p>
          <p className="text-base font-bold text-white">Phase {plan.phase_number}: {plan.phase_title}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            <span><Clock className="w-3 h-3 inline mr-1" />{plan.estimated_build_time}</span>
            <span className={RISK_CFG[plan.estimated_risk] ?? ''}>{plan.estimated_risk} risk</span>
          </div>
        </div>
      </div>

      {/* Summary sections */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {sections.slice(0, 4).map(({ key, label, icon: Icon }) => {
          const items = plan[key] as string[];
          return (
            <div key={key} className="bg-slate-900/40 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3 h-3 text-slate-500" />
                <span className="text-xs text-slate-500">{label}</span>
              </div>
              <p className="text-lg font-bold text-white">{Array.isArray(items) ? items.length : 0}</p>
            </div>
          );
        })}
      </div>

      {/* Detail lists */}
      {sections.map(({ key, label }) => {
        const items = plan[key] as string[];
        if (!Array.isArray(items) || items.length === 0) return null;
        return (
          <div key={key}>
            <p className="text-xs font-semibold text-slate-400 mb-1.5">{label}</p>
            <ul className="space-y-1">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <ChevronRight className="w-3 h-3 text-slate-500 mt-0.5 flex-shrink-0" />{item}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {/* Implementation prompt */}
      {plan.implementation_prompt && (
        <div className="pt-3 border-t border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Implementation Prompt
            </p>
            <CopyButton text={plan.implementation_prompt} label="Copy Prompt" />
          </div>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap bg-slate-900/60 rounded-lg p-4 max-h-80 overflow-y-auto font-sans leading-relaxed border border-slate-700">
            {plan.implementation_prompt}
          </pre>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            This prompt has been saved to the phase record and can be copied any time.
          </p>
        </div>
      )}
    </div>
  );
}
