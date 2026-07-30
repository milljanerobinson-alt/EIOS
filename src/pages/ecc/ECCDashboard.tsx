import { useEffect, useState } from 'react';
import {
  Brain, GitBranch, FileText, CheckCircle2, CheckSquare,
  XCircle, Clock, AlertCircle, Package, Activity, Loader2,
  ChevronRight, Plus, ScrollText, BarChart3, Rocket,
  ArrowRight, Sparkles, History,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useActiveRC } from '../../lib/activeRC';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BacklogItem   { id: string; title: string; priority: string; status: string; updated_at: string; }
interface TestReport    { id: string; title: string; result: string; test_date: string; feature?: string; phase?: string; }
interface AiSession     { id: string; title: string; session_date: string; outcome?: string; ai_platform: string; }
interface ArchReview    { id: string; title: string; review_date: string; review_type: string; }
interface DocEntry      { id: string; title: string; doc_type: string; updated_at: string; }
interface Decision      { id: string; title: string; decision_date: string; category?: string; status: string; }
interface ActiveWork    { current_phase?: string; current_sprint?: string; }
interface RCRow         { id: string; rc_number: string; phase_name: string; status: string; description?: string; is_active?: boolean; }
interface Release       { id: string; version: string; release_date?: string; status: string; }
interface ReadinessSnap { readiness_pct: number; critical_backlog_pct: number; high_priority_pct: number; architecture_review_pct: number; security_review_pct: number; performance_review_pct: number; manual_testing_pct: number; regression_testing_pct: number; release_docs_pct: number; launch_blockers_pct: number; }

export type Section =
  | 'mission-control' | 'dashboard' | 'products' | 'features' | 'vision' | 'roadmap' | 'milestones' | 'phases'
  | 'backlog' | 'active-work'
  | 'qa-testing' | 'release-centre' | 'architecture' | 'documentation'
  | 'ai-journal' | 'decisions' | 'risks' | 'production-readiness' | 'metrics'
  | 'settings' | 'timeline' | 'engineering-standards' | 'product-audit'
  | 'ai-product-manager' | 'ai-platform' | 'technical-debt' | 'analytics' | 'ideas'
  | 'dev-programme' | 'audits' | 'arch-guardian' | 'change-log' | 'workflow-engine' | 'error-intelligence' | 'engineering-reviews'
  | 'pa-general' | 'pa-ai-providers' | 'pa-integrations' | 'pa-security'
  | 'pa-environments' | 'pa-feature-flags' | 'pa-automation' | 'pa-monitoring'
  | 'pa-audit-settings' | 'pa-release-settings' | 'pa-system-logs'
  | 'pa-cost-monitoring' | 'pa-platform-analytics' | 'pa-briefing-settings'
  | 'eip' | 'pis' | 'benchmarking' | 'eig-graph' | 'module-registry'
  | 'work-orders' | 'engineering-planning' | 'atd-workspace' | 'atd-connect' | 'reports-export'
  | 'constitution' | 'records-library' | 'execution-platform' | 'engineering-ideas'
  | 'proj-dashboard' | 'proj-records'
  | 'governance-overview' | 'ecr-reviews' | 'capability-registry' | 'spc-registry'
  | 'ownership-lineage' | 'governance-health' | 'migration-plans'
  | 'identity-reconciliation'
  | 'historical-recovery'
  | 'historical-bootstrap'
  | 'engineering-execution'
  | 'engineering-integrity'
  | 'codex-provider'
  | 'repository-config';

// ─── RC Status config ─────────────────────────────────────────────────────────

const RC_STATUS: Record<string, { label: string; bg: string; border: string; text: string; dot: string }> = {
  verified:    { label: 'Verified',    bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  pending:     { label: 'Pending',     bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-400'  },
  in_progress: { label: 'In Progress', bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    dot: 'bg-blue-500'   },
  failed:      { label: 'Failed',      bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     dot: 'bg-red-500'    },
  deferred:    { label: 'Deferred',    bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-500',   dot: 'bg-slate-400'  },
};

const RESULT_CFG: Record<string, { label: string; color: string; Icon: typeof Clock }> = {
  passed:                 { label: 'Pass',     color: 'text-emerald-600', Icon: CheckSquare },
  passed_with_observations: { label: 'Pass*',  color: 'text-teal-600',   Icon: CheckSquare },
  failed:                 { label: 'Fail',     color: 'text-red-600',     Icon: XCircle },
  blocked:                { label: 'Blocked',  color: 'text-amber-600',   Icon: AlertCircle },
  pending:                { label: 'Pending',  color: 'text-slate-400',   Icon: Clock },
};

const DECISION_STATUS_CFG: Record<string, { dot: string; text: string }> = {
  proposed:   { dot: 'bg-amber-400',   text: 'text-amber-700' },
  accepted:   { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  superseded: { dot: 'bg-slate-400',   text: 'text-slate-500' },
  deprecated: { dot: 'bg-red-400',     text: 'text-red-600' },
};

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-amber-500', medium: 'bg-blue-500', low: 'bg-slate-400',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function fmtRelative(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

// ─── Sub-widgets ──────────────────────────────────────────────────────────────

function StatCard({ label, value, color = 'text-slate-900', onClick }: {
  label: string; value: string | number; color?: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 px-4 py-4 text-left w-full transition-all ${onClick ? 'hover:border-slate-300 hover:shadow-sm cursor-pointer' : 'cursor-default'}`}
    >
      <p className="text-xs font-medium text-slate-500 mb-1.5">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </button>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" />{label}
    </p>
  );
}

function EmptyCard({ label }: { label: string }) {
  return <p className="text-xs text-slate-400 italic py-4 text-center">{label}</p>;
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const r = 56, circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const stroke = pct < 25 ? '#ef4444' : pct < 50 ? '#f59e0b' : pct < 75 ? '#3b82f6' : '#10b981';
  return (
    <svg width="136" height="136" viewBox="0 0 136 136">
      <circle cx="68" cy="68" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
      <circle cx="68" cy="68" r={r} fill="none" stroke={stroke} strokeWidth="10"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        transform="rotate(-90 68 68)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      <text x="68" y="62" textAnchor="middle" fill="#0f172a" style={{ fontSize: '22px', fontWeight: 700 }}>{pct}%</text>
      <text x="68" y="80" textAnchor="middle" fill="#94a3b8" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>READY</text>
    </svg>
  );
}

// ─── Active RC Health Card ─────────────────────────────────────────────────────

function ActiveRCHealthCard({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const { activeRC } = useActiveRC();
  if (!activeRC) return null;

  const checklist = activeRC.checklist_items ?? [];
  const required  = checklist.filter(c => c.required);
  const optional  = checklist.filter(c => !c.required);
  const reqDone   = required.filter(c => c.checked).length;
  const optDone   = optional.filter(c => c.checked).length;
  const pct       = required.length > 0 ? Math.round((reqDone / required.length) * 100) : 0;

  const HEALTH_ITEMS = [
    { id: 'bl',      label: 'Backlog',         ok: (activeRC.included_backlog_item_ids ?? []).length > 0 },
    { id: 'testing', label: 'Testing',          ok: (activeRC.linked_testing_ids ?? []).length > 0 },
    { id: 'journal', label: 'AI Journal',       ok: (activeRC.linked_journal_ids ?? []).length > 0 },
    { id: 'report',  label: 'Completion Report', ok: (activeRC.linked_doc_ids ?? []).length > 0 },
    { id: 'adr',     label: 'ADR',              ok: (activeRC.linked_adr_ids ?? []).length > 0 },
  ];

  const cfg = RC_STATUS[activeRC.status] ?? RC_STATUS.pending;

  return (
    <button
      onClick={() => onNavigate('release-centre')}
      className="bg-white rounded-xl border border-blue-200 p-5 w-full text-left hover:border-blue-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
            </span>
            <span className="text-xs font-bold text-slate-700">{activeRC.rc_number}</span>
          </div>
          <p className="text-sm font-semibold text-slate-800">{activeRC.phase_name}</p>
          {activeRC.milestone && <p className="text-xs text-slate-400 mt-0.5">{activeRC.milestone}</p>}
        </div>
        <div className="text-right shrink-0 ml-4">
          <p className="text-2xl font-bold text-blue-700">{pct}%</p>
          <p className="text-[10px] text-slate-400">Checklist complete</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: pct < 40 ? '#f59e0b' : pct < 70 ? '#3b82f6' : '#10b981' }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-slate-400">{reqDone}/{required.length} required · {optDone}/{optional.length} optional</span>
          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
            View RC <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </div>

      {/* Health items */}
      <div className="flex flex-wrap gap-1.5">
        {HEALTH_ITEMS.map(item => (
          <span key={item.id} className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
            item.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
          }`}>
            {item.ok
              ? <CheckCircle2 className="w-3 h-3" />
              : <div className="w-3 h-3 rounded-full border border-slate-300" />
            }
            {item.label}
          </span>
        ))}
      </div>
    </button>
  );
}

// ─── Smart Prompts ─────────────────────────────────────────────────────────────

function SmartPrompts({
  backlog, tests, activeRC: arc, onNavigate,
}: {
  backlog: BacklogItem[];
  tests: TestReport[];
  activeRC: ReturnType<typeof useActiveRC>['activeRC'];
  onNavigate: (s: Section) => void;
}) {
  if (!arc) return null;

  const allCompleted   = backlog.length > 0 && backlog.every(i => ['verified','released','archived','completed'].includes(i.status));
  const allTestsPassed = tests.length > 0 && tests.every(t => ['passed','passed_with_observations'].includes(t.result));
  const hasReport      = (arc.linked_doc_ids ?? []).length > 0;
  const isVerified     = arc.status === 'verified';
  const checklist      = arc.checklist_items ?? [];
  const requiredDone   = checklist.filter(c => c.required && c.checked).length;
  const requiredTotal  = checklist.filter(c => c.required).length;
  const allRequiredDone = requiredDone === requiredTotal && requiredTotal > 0;

  interface Prompt { label: string; action: string; section: Section; color: string; }
  const prompts: Prompt[] = [];

  if (arc.status === 'in_progress' && allCompleted && !allTestsPassed) {
    prompts.push({ label: 'All backlog items complete', action: 'Move to Testing?', section: 'qa-testing', color: 'bg-blue-50 border-blue-200 text-blue-700' });
  }
  if (allTestsPassed && !hasReport) {
    prompts.push({ label: 'Testing has passed', action: 'Generate Completion Report?', section: 'release-centre', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' });
  }
  if (hasReport && allRequiredDone && arc.status === 'in_progress') {
    prompts.push({ label: 'All required items complete', action: 'Mark RC as Verified?', section: 'release-centre', color: 'bg-teal-50 border-teal-200 text-teal-700' });
  }
  if (isVerified) {
    prompts.push({ label: 'RC is verified', action: 'Archive and Release?', section: 'release-centre', color: 'bg-amber-50 border-amber-200 text-amber-700' });
  }

  if (prompts.length === 0) return null;

  return (
    <div className="space-y-2">
      {prompts.map((p, i) => (
        <button
          key={i}
          onClick={() => onNavigate(p.section)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all hover:shadow-sm ${p.color}`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500">{p.label}</p>
            <p className="text-sm font-semibold">{p.action}</p>
          </div>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function QuickActions({ onNavigate, onStartPhase }: { onNavigate: (s: Section) => void; onStartPhase: () => void }) {
  const { activeRC } = useActiveRC();
  const actions: { label: string; section?: Section; color: string; onClick?: () => void }[] = [
    { label: activeRC ? 'New Phase'      : 'Start Phase',    color: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50',     onClick: onStartPhase },
    { label: 'Backlog Item',                                  color: 'border-slate-200 hover:border-slate-400 hover:bg-slate-50',  section: 'backlog' },
    { label: 'QA Report',                                     color: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50', section: 'qa-testing' },
    { label: 'Decision',                                      color: 'border-violet-200 hover:border-violet-400 hover:bg-violet-50', section: 'decisions' },
  ];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <SectionHeader icon={Plus} label="Quick Actions" />
      <div className="grid grid-cols-2 gap-2">
        {actions.map((a, i) => (
          <button key={i}
            onClick={a.onClick ?? (() => a.section && onNavigate(a.section))}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium text-slate-600 transition-all ${a.color}`}>
            <Plus className="w-3.5 h-3.5 shrink-0" />{a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── RC Strip ─────────────────────────────────────────────────────────────────

export function RCStatusStrip({ candidates, onNavigate }: { candidates: RCRow[]; onNavigate?: (s: Section) => void }) {
  if (candidates.length === 0) return null;
  return (
    <button onClick={() => onNavigate?.('release-centre')}
      className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 w-full text-left hover:border-slate-300 transition-all">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">Release Candidates</span>
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {candidates.map(rc => {
            const cfg = RC_STATUS[rc.status] ?? RC_STATUS.pending;
            return (
              <span key={rc.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${cfg.bg} ${cfg.border} ${cfg.text} ${rc.is_active ? 'ring-1 ring-blue-400' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {rc.rc_number} — {rc.phase_name} · {cfg.label}
                {rc.is_active && <span className="ml-1 text-[9px] font-bold text-blue-600 bg-blue-100 px-1 rounded">ACTIVE</span>}
              </span>
            );
          })}
        </div>
      </div>
    </button>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function ECCDashboard({ onNavigate, onStartPhase }: {
  onNavigate: (s: Section) => void;
  onStartPhase?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rcs, setRcs] = useState<RCRow[]>([]);
  const [readiness, setReadiness] = useState<ReadinessSnap | null>(null);
  const [backlog, setBacklog] = useState<BacklogItem[]>([]);
  const [activeWork, setActiveWork] = useState<ActiveWork | null>(null);
  const [tests, setTests] = useState<TestReport[]>([]);
  const [upcomingRelease, setUpcomingRelease] = useState<Release | null>(null);
  const [latestAi, setLatestAi] = useState<AiSession | null>(null);
  const [latestArch, setLatestArch] = useState<ArchReview | null>(null);
  const [recentDocs, setRecentDocs] = useState<DocEntry[]>([]);
  const [latestDecision, setLatestDecision] = useState<Decision | null>(null);
  const { activeRC } = useActiveRC();

  useEffect(() => {
    (async () => {
      const [readyRes, backlogRes, awRes, testRes, relRes, aiRes, archRes, docsRes, rcRes, decRes] =
        await Promise.all([
          supabase.from('ecc_production_readiness').select('*').order('snapshot_date', { ascending: false }).limit(1),
          supabase.from('ecc_backlog_items').select('id,title,priority,status,updated_at').order('updated_at', { ascending: false }),
          supabase.from('ecc_active_work').select('current_phase,current_sprint').eq('status', 'active').order('created_at', { ascending: false }).limit(1),
          supabase.from('ecc_testing_reports').select('id,title,result,test_date,feature,phase').order('test_date', { ascending: false }).limit(6),
          supabase.from('ecc_releases').select('id,version,release_date,status').eq('status', 'planned').order('release_date', { ascending: true }).limit(1),
          supabase.from('ecc_ai_journal').select('id,title,session_date,outcome,ai_platform').order('session_date', { ascending: false }).limit(1),
          supabase.from('ecc_architecture_reviews').select('id,title,review_date,review_type').order('review_date', { ascending: false }).limit(1),
          supabase.from('ecc_documentation').select('id,title,doc_type,updated_at').order('updated_at', { ascending: false }).limit(3),
          supabase.from('ecc_release_candidates').select('id,rc_number,phase_name,status,description,is_active').order('rc_number', { ascending: true }),
          supabase.from('ecc_decisions').select('id,title,decision_date,category,status').order('decision_date', { ascending: false }).limit(1),
        ]);
      setReadiness(readyRes.data?.[0] ?? null);
      setBacklog(backlogRes.data ?? []);
      setActiveWork(awRes.data?.[0] ?? null);
      setTests(testRes.data ?? []);
      setUpcomingRelease(relRes.data?.[0] ?? null);
      setLatestAi(aiRes.data?.[0] ?? null);
      setLatestArch(archRes.data?.[0] ?? null);
      setRecentDocs(docsRes.data ?? []);
      setRcs(rcRes.data ?? []);
      setLatestDecision(decRes.data?.[0] ?? null);
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
    </div>
  );

  const critical   = backlog.filter(i => i.priority === 'critical' && !['verified','released','archived'].includes(i.status)).length;
  const high       = backlog.filter(i => i.priority === 'high'     && !['verified','released','archived'].includes(i.status)).length;
  const inProgress = backlog.filter(i => i.status === 'in_progress').length;
  const awaiting   = backlog.filter(i => i.status === 'needs_review').length;
  const readyTest  = backlog.filter(i => i.status === 'testing').length;
  const completed  = backlog.filter(i => ['verified','released'].includes(i.status)).slice(0, 5);
  const upcoming   = backlog.filter(i => ['ideas','needs_investigation','ready'].includes(i.status)).slice(0, 5);
  const readinessPct = readiness?.readiness_pct ?? 0;
  void upcomingRelease;

  const READINESS_ROWS = [
    { label: 'Critical Backlog',    pct: readiness?.critical_backlog_pct ?? 0 },
    { label: 'High Priority',       pct: readiness?.high_priority_pct ?? 0 },
    { label: 'Engineering Review', pct: readiness?.architecture_review_pct ?? 0 },
    { label: 'Security Review',     pct: readiness?.security_review_pct ?? 0 },
    { label: 'Manual Testing',      pct: readiness?.manual_testing_pct ?? 0 },
    { label: 'Regression Testing',  pct: readiness?.regression_testing_pct ?? 0 },
    { label: 'Release Docs',        pct: readiness?.release_docs_pct ?? 0 },
    { label: 'Launch Blockers',     pct: readiness?.launch_blockers_pct ?? 0 },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Engineering Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeWork && (
            <div className="text-right">
              {activeWork.current_phase && <p className="text-sm font-semibold text-slate-800">{activeWork.current_phase}</p>}
              {activeWork.current_sprint && <p className="text-xs text-slate-400">{activeWork.current_sprint}</p>}
            </div>
          )}
          {!activeRC && (
            <button
              onClick={onStartPhase}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Rocket className="w-3.5 h-3.5" /> Start Phase
            </button>
          )}
        </div>
      </div>

      {/* Active RC health card */}
      {activeRC && (
        <ActiveRCHealthCard onNavigate={onNavigate} />
      )}

      {/* Smart prompts */}
      <SmartPrompts
        backlog={backlog}
        tests={tests}
        activeRC={activeRC}
        onNavigate={onNavigate}
      />

      {/* RC Strip */}
      <RCStatusStrip candidates={rcs} onNavigate={onNavigate} />

      {/* No active phase CTA */}
      {!activeRC && rcs.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-blue-200 p-8 text-center">
          <Rocket className="w-8 h-8 text-blue-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">No active phase</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Start a phase to begin tracking your engineering work</p>
          <button
            onClick={onStartPhase}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Rocket className="w-4 h-4" /> Start First Phase
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Critical Items"   value={critical}   color={critical   > 0 ? 'text-red-600'    : 'text-slate-900'} onClick={() => onNavigate('backlog')} />
        <StatCard label="High Priority"    value={high}       color={high       > 0 ? 'text-amber-600'  : 'text-slate-900'} onClick={() => onNavigate('backlog')} />
        <StatCard label="In Progress"      value={inProgress} color={inProgress > 0 ? 'text-blue-600'   : 'text-slate-900'} onClick={() => onNavigate('backlog')} />
        <StatCard label="Needs Review"     value={awaiting}   color={awaiting   > 0 ? 'text-violet-600' : 'text-slate-900'} onClick={() => onNavigate('backlog')} />
        <StatCard label="Ready for Testing"value={readyTest}  color={readyTest  > 0 ? 'text-cyan-600'   : 'text-slate-900'} onClick={() => onNavigate('qa-testing')} />
      </div>

      {/* Production Readiness + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Production Readiness</h3>
              <p className="text-xs text-slate-400 mt-0.5">Weighted quality gate progress</p>
            </div>
            <button onClick={() => onNavigate('production-readiness')} className="text-xs text-slate-400 hover:text-slate-600">
              <BarChart3 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-6">
            <div className="shrink-0"><ProgressRing pct={readinessPct} /></div>
            <div className="flex-1 space-y-2">
              {READINESS_ROWS.map(r => (
                <div key={r.label}>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-xs text-slate-500">{r.label}</span>
                    <span className="text-xs font-semibold text-slate-700">{r.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${r.pct}%`, backgroundColor: r.pct < 50 ? '#f59e0b' : r.pct < 80 ? '#3b82f6' : '#10b981', transition: 'width 0.7s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">Current Sprint</p>
            {activeWork
              ? <>
                  {activeWork.current_phase && <p className="text-sm font-semibold text-slate-800">{activeWork.current_phase}</p>}
                  {activeWork.current_sprint && <p className="text-xs text-slate-400 mt-0.5">{activeWork.current_sprint}</p>}
                </>
              : <p className="text-sm text-slate-400 italic">No active sprint</p>
            }
          </div>
          <div className={`rounded-xl border px-4 py-3 ${critical > 0 ? 'bg-red-50 border-red-200' : high > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center gap-2">
              <Activity className={`w-4 h-4 ${critical > 0 ? 'text-red-500' : high > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
              <span className="text-xs font-semibold text-slate-700">Engineering Health</span>
            </div>
            <p className={`text-sm font-bold mt-1 ${critical > 0 ? 'text-red-700' : high > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {critical > 0 ? 'Critical Issues' : high > 0 ? 'High Priority Items' : 'All Clear'}
            </p>
          </div>
          <QuickActions onNavigate={onNavigate} onStartPhase={onStartPhase ?? (() => {})} />
        </div>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <SectionHeader icon={CheckCircle2} label="Latest QA Reports" />
          {tests.length > 0 ? (
            <ul className="space-y-2">
              {tests.map(t => {
                const cfg = RESULT_CFG[t.result] ?? RESULT_CFG.pending;
                const Icon = cfg.Icon;
                return (
                  <li key={t.id} className="flex items-center gap-2.5">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{t.title}</p>
                      <p className="text-xs text-slate-400">{t.phase ? `${t.phase} · ` : ''}{fmtDate(t.test_date)}</p>
                    </div>
                    <span className={`text-xs font-semibold shrink-0 ${cfg.color}`}>{cfg.label}</span>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyCard label="No test reports yet" />}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <SectionHeader icon={ScrollText} label="Latest Decision" />
          {latestDecision ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                {latestDecision.category && (
                  <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full capitalize">{latestDecision.category}</span>
                )}
                {(() => {
                  const c = DECISION_STATUS_CFG[latestDecision.status] ?? DECISION_STATUS_CFG.proposed;
                  return <span className={`flex items-center gap-1 text-xs font-medium ${c.text}`}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{latestDecision.status}</span>;
                })()}
              </div>
              <p className="text-sm font-semibold text-slate-800 leading-snug">{latestDecision.title}</p>
              <p className="text-xs text-slate-400 mt-1">{fmtDate(latestDecision.decision_date)}</p>
            </>
          ) : <EmptyCard label="No decisions recorded yet" />}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <SectionHeader icon={Brain} label="Latest AI Session" />
          {latestAi ? (
            <>
              <p className="text-sm font-semibold text-slate-800 leading-snug">{latestAi.title}</p>
              <p className="text-xs text-slate-400 mt-1">{latestAi.ai_platform} · {fmtDate(latestAi.session_date)}</p>
              {latestAi.outcome && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{latestAi.outcome}</p>}
            </>
          ) : <EmptyCard label="No sessions recorded yet" />}
        </div>
      </div>

      {/* Third row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <SectionHeader icon={Clock} label="Upcoming Priorities" />
          {upcoming.length > 0 ? (
            <ul className="space-y-2">
              {upcoming.map(item => (
                <li key={item.id} className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[item.priority] ?? 'bg-slate-400'}`} />
                  <p className="text-xs text-slate-700 truncate flex-1">{item.title}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyCard label="Backlog is empty" />}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <SectionHeader icon={CheckSquare} label="Recently Completed" />
          {completed.length > 0 ? (
            <ul className="space-y-2">
              {completed.map(item => (
                <li key={item.id} className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[item.priority] ?? 'bg-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                    <p className="text-xs text-slate-400">{fmtRelative(item.updated_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyCard label="No completed items yet" />}
        </div>

        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <SectionHeader icon={GitBranch} label="Engineering Review" />
            {latestArch ? (
              <>
                <p className="text-sm font-semibold text-slate-800 leading-snug">{latestArch.title}</p>
                <p className="text-xs text-slate-400 mt-1 capitalize">{latestArch.review_type} · {fmtDate(latestArch.review_date)}</p>
              </>
            ) : <EmptyCard label="No reviews yet" />}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader icon={FileText} label="Recent Docs" />
              <button onClick={() => onNavigate('timeline')} className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5 -mt-3">
                <History className="w-3 h-3" /> Timeline
              </button>
            </div>
            {recentDocs.length > 0 ? (
              <ul className="space-y-1.5">
                {recentDocs.map(d => (
                  <li key={d.id} className="flex items-center gap-1.5">
                    <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                    <p className="text-xs text-slate-600 truncate">{d.title}</p>
                  </li>
                ))}
              </ul>
            ) : <EmptyCard label="No docs yet" />}
          </div>
        </div>
      </div>
    </div>
  );
}
