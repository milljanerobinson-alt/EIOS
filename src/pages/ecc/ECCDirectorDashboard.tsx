import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Brain, Loader2, RefreshCw, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, Minus, Zap, Shield, TestTube2,
  FileText, Rocket, Target, Layers, Clock, ArrowRight,
  ChevronDown, ChevronUp, Sparkles, XCircle, BellOff,
  MessageSquare, Package, GitBranch, Database, BarChart3,
  Activity, Info, Star, Flag, PlayCircle, Calendar,
  CheckSquare, AlertOctagon, History, ArrowUpRight,
  LayoutDashboard, Inbox, Cpu, DollarSign, Timer,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { loadConversationIntelligenceStats } from '../../lib/conversationIntelligenceService';
import { loadModuleRegistry, computeArchitectureMetrics, type ArchitectureMetrics } from '../../lib/architectureService';
import { ActiveProjectService } from '../../lib/activeProjectService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BriefingData {
  greeting: { salutation: string; headline: string; context: string };
  primary_recommendation: {
    title: string; what: string; why: string; why_now: string;
    priority_score: number; business_value: number; engineering_value: number;
    engineering_risk: string; estimated_effort: string;
    suggested_phase: string; suggested_release: string; call_to_action: string;
  };
  next_action: { title: string; reason: string; type: string; prompt: string };
  inbox_items: InboxItemData[];
}

export interface HealthData {
  engineering_health: number; platform_confidence: number;
  testing_health: number; documentation_health: number;
  roadmap_health: number; architecture_health: number;
  release_readiness: number; audit_readiness: number;
  engineering_debt: number; critical_issues: number;
  features_live: number; features_total: number;
  testing_passed: number; testing_total: number;
  docs_complete: number; docs_total: number;
  backlog_open: number; backlog_blocked: number;
  compliance_critical_untested: number;
}

export interface EngineeringSummary {
  current_phase: string; current_release: string; active_rc_status: string;
  goals_active: number; goals_complete: number;
  epics_active: number; epics_complete: number;
  avg_goal_progress: number; avg_epic_progress: number;
  recent_decisions: number;
}

export interface InboxItemData {
  id?: string;
  type: 'recommendation' | 'warning' | 'opportunity' | 'blocker';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  confidence: number;
  estimated_effort: string;
  reasoning: string;
  status?: 'pending' | 'approved' | 'dismissed' | 'snoozed';
  artefact_plan?: unknown[];
  created_at?: string;
  ai_role?: string;
}

interface StoredBriefing {
  id: string;
  briefing_data: BriefingData;
  health_data: HealthData;
  engineering_summary: EngineeringSummary;
  created_at: string;
  briefing_ref: string | null;
  ai_model: string | null;
  token_input: number | null;
  token_output: number | null;
  generation_duration_ms: number | null;
  estimated_cost_usd: number | null;
  engineering_phase: string | null;
  platform_version: string | null;
  trigger_type: string | null;
  scheduled_for: string | null;
  template_id: string | null;
  schedule_id: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const INBOX_TYPE_CFG = {
  blocker:        { icon: AlertOctagon,  color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-800' },
  warning:        { icon: AlertTriangle, color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-800' },
  recommendation: { icon: Sparkles,      color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-800' },
  opportunity:    { icon: TrendingUp,    color: 'text-emerald-600',bg: 'bg-emerald-50',border: 'border-emerald-200',badge: 'bg-emerald-100 text-emerald-800' },
};

const PRIORITY_CFG = {
  critical: { label: 'Critical', dot: 'bg-red-500',    text: 'text-red-700',    ring: 'ring-red-200' },
  high:     { label: 'High',     dot: 'bg-orange-500', text: 'text-orange-700', ring: 'ring-orange-200' },
  medium:   { label: 'Medium',   dot: 'bg-amber-500',  text: 'text-amber-600',  ring: 'ring-amber-200' },
  low:      { label: 'Low',      dot: 'bg-slate-400',  text: 'text-slate-500',  ring: 'ring-slate-200' },
};

const HEALTH_METRICS = [
  { key: 'engineering_health',    label: 'Engineering Health',   icon: Activity,     thresholds: [70, 85] as [number,number] },
  { key: 'platform_confidence',   label: 'Platform Confidence',  icon: TrendingUp,   thresholds: [60, 80] as [number,number] },
  { key: 'testing_health',        label: 'Testing Health',       icon: TestTube2,    thresholds: [65, 80] as [number,number] },
  { key: 'documentation_health',  label: 'Documentation',        icon: FileText,     thresholds: [50, 75] as [number,number] },
  { key: 'roadmap_health',        label: 'Roadmap Progress',     icon: Target,       thresholds: [50, 70] as [number,number] },
  { key: 'architecture_health',   label: 'Architecture Health',  icon: GitBranch,    thresholds: [75, 90] as [number,number] },
  { key: 'release_readiness',     label: 'Release Readiness',    icon: Rocket,       thresholds: [60, 80] as [number,number] },
  { key: 'audit_readiness',       label: 'Audit Readiness',      icon: Shield,       thresholds: [70, 85] as [number,number] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function healthColor(score: number, thresholds: [number, number]): string {
  if (score >= thresholds[1]) return 'text-emerald-600';
  if (score >= thresholds[0]) return 'text-amber-600';
  return 'text-red-600';
}

function healthBarColor(score: number, thresholds: [number, number]): string {
  if (score >= thresholds[1]) return 'bg-emerald-500';
  if (score >= thresholds[0]) return 'bg-amber-500';
  return 'bg-red-500';
}

function riskColor(risk: string): string {
  switch (risk?.toLowerCase()) {
    case 'low': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'medium': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'high': return 'text-red-700 bg-red-50 border-red-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'yesterday';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getPersonalisedGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getTrendIcon(delta: number) {
  if (delta > 2) return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (delta < -2) return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-slate-400" />;
}

function getTrendText(delta: number): string {
  if (delta > 2) return `+${delta}%`;
  if (delta < -2) return `${delta}%`;
  return 'Stable';
}

function getTrendColor(delta: number): string {
  if (delta > 2) return 'text-emerald-600';
  if (delta < -2) return 'text-red-500';
  return 'text-slate-400';
}

function getLastVisitDelta(): number | null {
  const last = localStorage.getItem('ecc_last_visit');
  if (!last) return null;
  const diffMs = Date.now() - parseInt(last, 10);
  return Math.floor(diffMs / (1000 * 60 * 60));
}

// ─── Client-side health computation (mirrors edge function logic) ─────────────

interface RawFeature { lifecycle_stage: string; testing_status: string | null; documentation_status: string | null; compliance_critical: boolean; operational_risk: string; }
interface RawGoal { status: string; progress_pct: number; }
interface RawEpic { status: string; progress_pct: number; }
interface RawBacklog { status: string; priority: string; }
interface RawRC { is_active: boolean; status: string; manual_testing_status: string; regression_testing_status: string; rc_number: string; }
interface RawPhase { status: string; name: string; }
interface RawDecision { decision_date: string; }

function computeHealthFromRaw(
  features: RawFeature[],
  goals: RawGoal[],
  epics: RawEpic[],
  backlog: RawBacklog[],
  releases: RawRC[],
  phases: RawPhase[],
  decisions: RawDecision[],
): { health: HealthData; summary: EngineeringSummary } {
  const f = features;
  const fTotal = f.length;
  const fLive = f.filter(x => ['live', 'production_ready'].includes(x.lifecycle_stage)).length;
  const fTested = f.filter(x => x.testing_status === 'passed').length;
  const fTestedTotal = f.filter(x => x.testing_status !== null && x.testing_status !== 'not_tested').length;
  const fDocsComplete = f.filter(x => x.documentation_status === 'complete').length;
  const fCriticalUntested = f.filter(x => x.compliance_critical && x.testing_status !== 'passed').length;
  const fCriticalRisk = f.filter(x => x.operational_risk === 'critical').length;

  const bBlocked = backlog.filter(x => x.status === 'blocked').length;
  const bOpen = backlog.filter(x => ['open', 'in_progress'].includes(x.status)).length;

  const activeRC = releases.find(x => x.is_active) ?? null;
  const currentRelease = activeRC?.rc_number ?? releases[0]?.rc_number ?? 'None';
  const currentPhase = phases.find(x => x.status === 'active')?.name ?? phases[0]?.name ?? 'No active phase';

  const gActive = goals.filter(x => x.status === 'active').length;
  const gComplete = goals.filter(x => x.status === 'completed').length;
  const eActive = epics.filter(x => x.status === 'active').length;
  const eComplete = epics.filter(x => x.status === 'completed').length;
  const avgGoalPct = goals.length > 0
    ? Math.round(goals.reduce((s, x) => s + (x.progress_pct || 0), 0) / goals.length) : 0;
  const avgEpicPct = epics.length > 0
    ? Math.round(epics.reduce((s, x) => s + (x.progress_pct || 0), 0) / epics.length) : 0;

  const platformConfidence  = fTotal > 0 ? Math.round((fLive / fTotal) * 100) : 0;
  const testingHealth       = fTestedTotal > 0 ? Math.round((fTested / fTestedTotal) * 100) : 0;
  const documentationHealth = fTotal > 0 ? Math.round((fDocsComplete / fTotal) * 100) : 0;
  const roadmapHealth       = goals.length > 0 ? Math.round((avgGoalPct + avgEpicPct) / 2) : 50;
  const archHealth          = fCriticalRisk > 0 ? Math.max(40, 95 - fCriticalRisk * 10) : 95;
  const engineeringDebt     = fTotal > 0 ? Math.round(((fTotal - fLive) / fTotal) * 100) : 0;
  const auditReadiness      = fCriticalUntested === 0 ? 92 : Math.max(40, 90 - fCriticalUntested * 15);
  const releaseReadiness    = activeRC
    ? (activeRC.regression_testing_status === 'passed' && activeRC.manual_testing_status === 'passed' ? 90
      : activeRC.regression_testing_status === 'passed' ? 65
      : activeRC.manual_testing_status === 'passed' ? 55 : 35)
    : 50;
  const engineeringHealth   = Math.round((platformConfidence + testingHealth + documentationHealth + roadmapHealth) / 4);
  const criticalIssues      = (bBlocked > 2 ? 1 : 0) + (fCriticalRisk > 0 ? 1 : 0) + (fCriticalUntested > 3 ? 1 : 0);

  const recentDecisions = decisions.filter(x => {
    const dt = new Date(x.decision_date);
    return (Date.now() - dt.getTime()) < 7 * 24 * 60 * 60 * 1000;
  }).length;

  const health: HealthData = {
    engineering_health: engineeringHealth,
    platform_confidence: platformConfidence,
    testing_health: testingHealth,
    documentation_health: documentationHealth,
    roadmap_health: roadmapHealth,
    architecture_health: archHealth,
    release_readiness: releaseReadiness,
    audit_readiness: auditReadiness,
    engineering_debt: engineeringDebt,
    critical_issues: criticalIssues,
    features_live: fLive,
    features_total: fTotal,
    testing_passed: fTested,
    testing_total: fTestedTotal,
    docs_complete: fDocsComplete,
    docs_total: fTotal,
    backlog_open: bOpen,
    backlog_blocked: bBlocked,
    compliance_critical_untested: fCriticalUntested,
  };

  const summary: EngineeringSummary = {
    current_phase: currentPhase,
    current_release: currentRelease,
    active_rc_status: activeRC ? activeRC.status : 'none',
    goals_active: gActive,
    goals_complete: gComplete,
    epics_active: eActive,
    epics_complete: eComplete,
    avg_goal_progress: avgGoalPct,
    avg_epic_progress: avgEpicPct,
    recent_decisions: recentDecisions,
  };

  return { health, summary };
}

// ─── Freshness detection ──────────────────────────────────────────────────────

type FreshnessStatus = 'up-to-date' | 'refresh-recommended' | 'out-of-date';

function computeFreshness(
  briefingCreatedAt: string | null,
  activitySinceBriefing: number,
  ageHours: number,
): FreshnessStatus {
  if (!briefingCreatedAt) return 'out-of-date';
  if (ageHours > 168) return 'out-of-date'; // older than 1 week
  if (activitySinceBriefing >= 5 || ageHours > 48) return 'refresh-recommended';
  return 'up-to-date';
}

const FRESHNESS_CFG: Record<FreshnessStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  'up-to-date':          { label: 'Up to Date',          color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  'refresh-recommended': { label: 'Refresh Recommended', color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  'out-of-date':         { label: 'Out of Date',          color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500' },
};

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function WidgetSkeleton({ lines = 3, height = 'h-4' }: { lines?: number; height?: string }) {
  return (
    <div className="space-y-2 animate-pulse p-4">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`${height} bg-slate-100 rounded`} style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-40 bg-gradient-to-r from-slate-200 to-slate-100 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 bg-slate-100 rounded-2xl" />
        <div className="h-24 bg-slate-100 rounded-2xl" />
      </div>
      <div className="h-32 bg-slate-100 rounded-2xl" />
      <div className="h-56 bg-slate-100 rounded-2xl" />
    </div>
  );
}

// ─── Scheduled Changes Banner ────────────────────────────────────────────────

function ScheduledChangesBanner({
  activitySince,
  scheduledBriefingTime,
  generating,
  onViewBriefing,
  onGenerate,
}: {
  activitySince: number;
  scheduledBriefingTime: string | null;
  generating: boolean;
  onViewBriefing: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
          <Activity className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-900">Platform changes detected since today's Executive Briefing</p>
          <p className="text-xs text-amber-700 mt-0.5">
            <span className="font-semibold">{activitySince} change{activitySince !== 1 ? 's' : ''}</span> recorded
            {scheduledBriefingTime && <> since the briefing generated at {scheduledBriefingTime}</>}.
            The stored briefing may no longer reflect the current programme state.
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <button
              onClick={onViewBriefing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-amber-800 hover:bg-amber-50 transition-all"
            >
              <FileText className="w-3 h-3" />
              View Today's Briefing
            </button>
            <button
              onClick={onGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {generating ? 'Generating...' : 'Generate Updated Briefing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ExecBriefingStatusCard ───────────────────────────────────────────────────

function ExecBriefingStatusCard({
  latestBriefing,
  freshness,
  activitySince,
  generating,
  refreshing,
  onGenerate,
  onView,
  onHistory,
}: {
  latestBriefing: StoredBriefing | null;
  freshness: FreshnessStatus;
  activitySince: number;
  generating: boolean;
  refreshing?: boolean;
  onGenerate: () => void;
  onView: () => void;
  onHistory: () => void;
}) {
  const cfg = FRESHNESS_CFG[freshness];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Brain className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-800">Executive Intelligence</h3>
        {refreshing && (
          <Loader2 className="w-3 h-3 animate-spin text-slate-400 ml-1" title="Refreshing in background" />
        )}
        <span className={`ml-auto flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      <div className="px-4 py-3">
        {latestBriefing ? (
          <div className="space-y-2 mb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  Last generated <span className="font-semibold text-slate-700">{fmtTime(latestBriefing.created_at)}</span>
                  {latestBriefing.briefing_ref && (
                    <span className="ml-2 font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      {latestBriefing.briefing_ref}
                    </span>
                  )}
                </p>
                {latestBriefing.engineering_phase && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {latestBriefing.engineering_phase}
                    {latestBriefing.platform_version && ` · ${latestBriefing.platform_version}`}
                  </p>
                )}
              </div>
            </div>

            {/* AI metadata row */}
            {(latestBriefing.ai_model || latestBriefing.generation_duration_ms || latestBriefing.estimated_cost_usd != null) && (
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                {latestBriefing.ai_model && (
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    {latestBriefing.ai_model}
                  </span>
                )}
                {latestBriefing.token_input != null && latestBriefing.token_output != null && (
                  <span className="flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    {latestBriefing.token_input.toLocaleString()} → {latestBriefing.token_output.toLocaleString()} tokens
                  </span>
                )}
                {latestBriefing.generation_duration_ms != null && (
                  <span className="flex items-center gap-1">
                    <Timer className="w-3 h-3" />
                    {(latestBriefing.generation_duration_ms / 1000).toFixed(1)}s
                  </span>
                )}
                {latestBriefing.estimated_cost_usd != null && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    ${Number(latestBriefing.estimated_cost_usd).toFixed(4)}
                  </span>
                )}
              </div>
            )}

            {activitySince > 0 && freshness !== 'up-to-date' && (
              <p className="text-[10px] text-slate-500">
                <span className="font-semibold text-amber-600">{activitySince} changes</span> since last briefing
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 mb-3">No briefing has been generated yet. Generate one to see AI-powered insights.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {latestBriefing && (
            <button
              onClick={onView}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all"
            >
              <FileText className="w-3 h-3" />
              View Latest Briefing
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {generating ? 'Generating...' : 'Generate New Briefing'}
          </button>
          <button
            onClick={onHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all"
          >
            <History className="w-3 h-3" />
            History
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Briefing history panel ───────────────────────────────────────────────────

function BriefingHistoryPanel({
  briefings,
  loading,
  onSelect,
}: {
  briefings: StoredBriefing[];
  loading: boolean;
  onSelect: (b: StoredBriefing) => void;
}) {
  if (loading) return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-800">Briefing History</h3>
      </div>
      <WidgetSkeleton lines={4} />
    </div>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-800">Briefing History</h3>
        <span className="text-[10px] font-bold text-white bg-slate-500 px-1.5 py-0.5 rounded-full">{briefings.length}</span>
        <p className="ml-auto text-[10px] text-slate-400 hidden sm:block">All past briefings are permanent artefacts</p>
      </div>
      {briefings.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Brain className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No briefings generated yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {briefings.map((b) => {
            const ageH = (Date.now() - new Date(b.created_at).getTime()) / (1000 * 60 * 60);
            return (
              <button
                key={b.id}
                onClick={() => onSelect(b)}
                className="w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-teal-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    {b.briefing_ref && (
                      <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {b.briefing_ref}
                      </span>
                    )}
                    {b.engineering_phase && (
                      <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100">
                        {b.engineering_phase}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-700 transition-colors truncate">
                    {(b.briefing_data as BriefingData)?.greeting?.headline ?? 'Briefing'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{fmtDateTime(b.created_at)}</span>
                    {b.ai_model && <span>· {b.ai_model}</span>}
                    {b.estimated_cost_usd != null && <span>· ${Number(b.estimated_cost_usd).toFixed(4)}</span>}
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 shrink-0 mt-1 transition-colors" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Stored briefing viewer ───────────────────────────────────────────────────

function StoredBriefingViewer({
  briefing: stored,
  onBack,
  onStartConversation,
}: {
  briefing: StoredBriefing;
  onBack: () => void;
  onStartConversation: (prompt?: string) => void;
}) {
  const bd = stored.briefing_data as BriefingData;
  const health = stored.health_data as HealthData | null;
  const summary = stored.engineering_summary as EngineeringSummary | null;
  const overallScore = health ? Math.round(
    (health.engineering_health + health.platform_confidence + health.testing_health +
     health.documentation_health + health.release_readiness + health.audit_readiness) / 6
  ) : null;

  return (
    <div className="space-y-4">
      {/* Back + meta bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5 rotate-[-90deg]" />
          Back
        </button>
        {stored.briefing_ref && (
          <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
            {stored.briefing_ref}
          </span>
        )}
        <span className="text-[10px] text-slate-400">{fmtDateTime(stored.created_at)}</span>
        <span className="ml-auto text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">Stored artefact</span>
      </div>

      {/* Header card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl overflow-hidden border border-slate-700">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center shrink-0 shadow-lg">
                <Brain className="w-[22px] h-[22px] text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-300">{bd?.greeting?.salutation}</p>
                <h2 className="text-base font-black text-white leading-tight mt-0.5 max-w-md">
                  {bd?.greeting?.headline}
                </h2>
              </div>
            </div>
            {overallScore !== null && (
              <div className="shrink-0 text-right">
                <div className={`text-3xl font-black leading-none ${overallScore >= 80 ? 'text-emerald-400' : overallScore >= 65 ? 'text-amber-400' : 'text-red-400'}`}>
                  {overallScore}
                </div>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Overall</p>
              </div>
            )}
          </div>
          {bd?.greeting?.context && (
            <p className="text-xs text-slate-400 mt-3 leading-relaxed max-w-xl">{bd.greeting.context}</p>
          )}
        </div>

        {summary && (
          <div className="px-5 pb-4">
            <div className="flex flex-wrap gap-2">
              {summary.current_phase && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-blue-500/20 border border-blue-500/30 text-blue-300 px-2.5 py-1 rounded-full">
                  <Layers className="w-3 h-3" />{summary.current_phase}
                </span>
              )}
              {summary.current_release && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-teal-500/20 border border-teal-500/30 text-teal-300 px-2.5 py-1 rounded-full">
                  <Rocket className="w-3 h-3" />{summary.current_release}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="px-5 py-2.5 border-t border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-slate-500 flex-wrap">
            {stored.ai_model && <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{stored.ai_model}</span>}
            {stored.generation_duration_ms != null && <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{(stored.generation_duration_ms / 1000).toFixed(1)}s</span>}
            {stored.estimated_cost_usd != null && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${Number(stored.estimated_cost_usd).toFixed(4)}</span>}
          </div>
        </div>
      </div>

      {/* Primary recommendation */}
      {bd?.primary_recommendation && (
        <PrimaryRecommendation rec={bd.primary_recommendation} onAction={onStartConversation} />
      )}

      {/* Next action */}
      {bd?.next_action && (
        <NextActionCard action={bd.next_action} onAction={onStartConversation} />
      )}

      {/* Inbox items from briefing */}
      {Array.isArray(bd?.inbox_items) && bd.inbox_items.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">Briefing Inbox Items</h3>
            <span className="text-[10px] font-bold text-white bg-blue-500 px-1.5 py-0.5 rounded-full">{bd.inbox_items.length}</span>
          </div>
          <div className="p-3 space-y-2">
            {bd.inbox_items.map((item, i) => (
              <InboxItemCard
                key={i}
                item={item}
                onDiscuss={(it) => onStartConversation(`${it.title}: ${it.description}`)}
                onDismiss={() => {}}
                onSnooze={() => {}}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {/* Health scorecard snapshot */}
      {health && <EngineeringScorecard health={health} />}
    </div>
  );
}

// ─── Executive Greeting Header ────────────────────────────────────────────────

function ExecutiveHeader({
  briefing, health, summary, briefingRef, generatedAt,
}: {
  briefing: BriefingData;
  health: HealthData | null;
  summary: EngineeringSummary | null;
  briefingRef: string | null;
  generatedAt: string | null;
}) {
  const deltaHours = getLastVisitDelta();
  const overallScore = health ? Math.round(
    (health.engineering_health + health.platform_confidence + health.testing_health +
     health.documentation_health + health.release_readiness + health.audit_readiness) / 6
  ) : null;

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl overflow-hidden border border-slate-700">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center shrink-0 shadow-lg">
              <Brain className="w-[22px] h-[22px] text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">
                {briefing.greeting.salutation}
                {deltaHours !== null && deltaHours < 72 && (
                  <span className="ml-2 text-[10px] text-slate-500 font-normal">
                    · {deltaHours < 1 ? 'session active' : `last visit ${deltaHours}h ago`}
                  </span>
                )}
              </p>
              <h2 className="text-base font-black text-white leading-tight mt-0.5 max-w-md">
                {briefing.greeting.headline}
              </h2>
            </div>
          </div>
          {overallScore !== null && (
            <div className="shrink-0 text-right">
              <div className={`text-3xl font-black leading-none ${overallScore >= 80 ? 'text-emerald-400' : overallScore >= 65 ? 'text-amber-400' : 'text-red-400'}`}>
                {overallScore}
              </div>
              <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Overall</p>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-3 leading-relaxed max-w-xl">{briefing.greeting.context}</p>
      </div>

      {summary && (
        <div className="px-5 pb-4">
          <div className="flex flex-wrap gap-2">
            {summary.current_phase && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-blue-500/20 border border-blue-500/30 text-blue-300 px-2.5 py-1 rounded-full">
                <Layers className="w-3 h-3" />{summary.current_phase}
              </span>
            )}
            {summary.current_release && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-teal-500/20 border border-teal-500/30 text-teal-300 px-2.5 py-1 rounded-full">
                <Rocket className="w-3 h-3" />{summary.current_release}
              </span>
            )}
            {summary.active_rc_status && summary.active_rc_status !== 'None' && summary.active_rc_status !== 'none' && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-amber-500/20 border border-amber-500/30 text-amber-300 px-2.5 py-1 rounded-full">
                <Zap className="w-3 h-3" />{summary.active_rc_status}
              </span>
            )}
            {summary.recent_decisions > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-slate-600/60 border border-slate-600 text-slate-300 px-2.5 py-1 rounded-full">
                <CheckSquare className="w-3 h-3" />{summary.recent_decisions} recent decision{summary.recent_decisions !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-slate-700/60 flex items-center gap-2 text-[10px] text-slate-500">
        {briefingRef && (
          <span className="font-mono font-bold text-slate-400 bg-slate-700/60 px-1.5 py-0.5 rounded border border-slate-600">
            {briefingRef}
          </span>
        )}
        {generatedAt && (
          <span>Generated {fmtTime(generatedAt)}</span>
        )}
      </div>
    </div>
  );
}

// ─── Engineering Scorecard ────────────────────────────────────────────────────

function EngineeringScorecard({ health }: { health: HealthData }) {
  const [expanded, setExpanded] = useState(false);
  const preview = HEALTH_METRICS.slice(0, 4);
  const rest = HEALTH_METRICS.slice(4);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-800">Engineering Scorecard</h3>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Strong</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Fair</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Needs work</span>
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 gap-3">
        {(expanded ? HEALTH_METRICS : preview).map(m => {
          const score = health[m.key as keyof HealthData] as number;
          const Icon = m.icon;
          const color = healthColor(score, m.thresholds);
          const barColor = healthBarColor(score, m.thresholds);
          const delta = Math.round((score - 72) / 3);
          return (
            <div key={m.key} className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-slate-500 truncate">{m.label}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    {getTrendIcon(delta)}
                    <span className={`text-[11px] font-black ${color}`}>{score}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setExpanded(s => !s)}
            className="w-full flex items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-400 hover:text-blue-600 transition-colors py-1.5 border border-dashed border-slate-200 rounded-xl hover:border-blue-300"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Show less' : `${rest.length} more metrics`}
          </button>
        </div>
      )}

      <div className="px-4 pb-4 grid grid-cols-3 gap-2">
        {[
          { label: 'Features',   v: `${health.features_live}/${health.features_total}`,  icon: Package,   color: 'text-blue-600' },
          { label: 'Tests',      v: `${health.testing_passed}/${health.testing_total}`,  icon: TestTube2, color: 'text-cyan-600' },
          { label: 'Documented', v: `${health.docs_complete}/${health.docs_total}`,      icon: FileText,  color: 'text-emerald-600' },
        ].map(({ label, v, icon: Icon, color }) => (
          <div key={label} className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
            <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${color}`} />
            <p className={`text-sm font-black ${color}`}>{v}</p>
            <p className="text-[9px] text-slate-400 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Decisions Waiting ────────────────────────────────────────────────────────

function DecisionsWaiting({ items, onDiscuss }: {
  items: InboxItemData[];
  onDiscuss: (item: InboxItemData) => void;
}) {
  const decisions = items.filter(i => i.type === 'blocker' || i.type === 'warning' || i.priority === 'critical' || i.priority === 'high');
  if (decisions.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-bold text-slate-800">Decisions Waiting</h3>
        <span className="ml-1 text-[10px] font-bold text-white bg-amber-500 px-1.5 py-0.5 rounded-full">{decisions.length}</span>
        <p className="ml-2 text-[10px] text-slate-400 hidden sm:block">Requires your input before engineering can proceed</p>
      </div>
      <div className="divide-y divide-slate-50">
        {decisions.slice(0, 4).map((item, i) => {
          const typeCfg = INBOX_TYPE_CFG[item.type] ?? INBOX_TYPE_CFG.recommendation;
          const priorityCfg = PRIORITY_CFG[item.priority] ?? PRIORITY_CFG.medium;
          const Icon = typeCfg.icon;
          return (
            <div key={item.id ?? i} className="px-4 py-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeCfg.bg} border ${typeCfg.border}`}>
                <Icon className={`w-4 h-4 ${typeCfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityCfg.dot}`} />
                  <p className="text-xs font-semibold text-slate-800 truncate">{item.title}</p>
                </div>
                <p className="text-[10px] text-slate-500 truncate">{item.description}</p>
              </div>
              <button
                onClick={() => onDiscuss(item)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all"
              >
                <MessageSquare className="w-3 h-3" />
                Review
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Primary Recommendation ───────────────────────────────────────────────────

function PrimaryRecommendation({ rec, onAction }: {
  rec: BriefingData['primary_recommendation'];
  onAction: (prompt: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-700">
      <div className="px-5 py-4 border-b border-slate-700/50">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Star className="w-[18px] h-[18px] text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">If I were your Technical Director...</p>
            <h3 className="text-base font-black text-white leading-tight">{rec.title}</h3>
            <p className="text-sm text-slate-300 mt-1 leading-relaxed">{rec.what}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${riskColor(rec.engineering_risk)}`}>
              {rec.engineering_risk} Risk
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <p className={`text-2xl font-black ${rec.priority_score >= 80 ? 'text-emerald-400' : rec.priority_score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
              {rec.priority_score}
            </p>
            <p className="text-[9px] text-slate-400 uppercase tracking-wide">Priority</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-blue-400">{rec.business_value}</p>
            <p className="text-[9px] text-slate-400 uppercase tracking-wide">Biz Value</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-300 mt-1">{rec.estimated_effort}</p>
            <p className="text-[9px] text-slate-400 uppercase tracking-wide">Est. Effort</p>
          </div>
        </div>

        <div className="bg-slate-800/60 rounded-xl p-3 mb-4">
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-1">Why Now</p>
          <p className="text-xs text-slate-300 leading-relaxed">{rec.why_now}</p>
        </div>

        {expanded && (
          <div className="bg-slate-800/40 rounded-xl p-3 mb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Reasoning</p>
            <p className="text-xs text-slate-300 leading-relaxed">{rec.why}</p>
            {(rec.suggested_phase || rec.suggested_release) && (
              <div className="flex gap-2 mt-2">
                {rec.suggested_phase && (
                  <span className="text-[9px] bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Layers className="w-2.5 h-2.5" /> {rec.suggested_phase}
                  </span>
                )}
                {rec.suggested_release && (
                  <span className="text-[9px] bg-teal-900/60 text-teal-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Rocket className="w-2.5 h-2.5" /> {rec.suggested_release}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onAction(`${rec.call_to_action || rec.title} — ${rec.what}`)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold rounded-xl transition-colors"
          >
            <PlayCircle className="w-4 h-4" />
            {rec.call_to_action || 'Discuss with AI Director'}
          </button>
          <button
            onClick={() => setExpanded(s => !s)}
            className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-xl transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inbox Item ───────────────────────────────────────────────────────────────

function InboxItemCard({ item, onDiscuss, onDismiss, onSnooze, compact = false }: {
  item: InboxItemData;
  onDiscuss: (item: InboxItemData) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeCfg = INBOX_TYPE_CFG[item.type] ?? INBOX_TYPE_CFG.recommendation;
  const priorityCfg = PRIORITY_CFG[item.priority] ?? PRIORITY_CFG.medium;
  const Icon = typeCfg.icon;

  return (
    <div className={`rounded-xl border ${typeCfg.border} ${typeCfg.bg} overflow-hidden`}>
      <div className={`${compact ? 'px-3 py-2.5' : 'px-3.5 py-3'} flex items-start gap-3`}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-white/70">
          <Icon className={`w-3.5 h-3.5 ${typeCfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap mb-1">
            <div className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${typeCfg.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
              {priorityCfg.label}
            </div>
            {item.confidence && (
              <span className="text-[9px] text-slate-500 bg-white/60 px-1.5 py-0.5 rounded">{item.confidence}% confidence</span>
            )}
            {item.ai_role && (
              <span className="text-[9px] text-slate-400 bg-white/50 px-1.5 py-0.5 rounded capitalize border border-white/80">
                {item.ai_role.replace('_', ' ')}
              </span>
            )}
            {item.estimated_effort && (
              <span className="text-[9px] text-slate-500 flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" /> {item.estimated_effort}
              </span>
            )}
          </div>
          <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-slate-800 leading-tight`}>{item.title}</p>
          <p className={`text-xs text-slate-600 mt-1 leading-relaxed ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>{item.description}</p>

          {!compact && expanded && (
            <div className="mt-2 space-y-2">
              {item.impact && (
                <div className="bg-white/60 rounded-lg p-2 border border-white/80">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">Impact if Ignored</p>
                  <p className="text-xs text-slate-700">{item.impact}</p>
                </div>
              )}
              {item.reasoning && (
                <div className="bg-white/60 rounded-lg p-2 border border-white/80">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">AI Reasoning</p>
                  <p className="text-xs text-slate-600 italic">{item.reasoning}</p>
                </div>
              )}
            </div>
          )}
        </div>
        {!compact && (
          <button onClick={() => setExpanded(s => !s)} className="shrink-0 p-1 text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      <div className={`${compact ? 'px-3 pb-2.5' : 'px-3.5 pb-3'} flex gap-2`}>
        <button
          onClick={() => onDiscuss(item)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all"
        >
          <MessageSquare className="w-3 h-3" /> Discuss
        </button>
        {item.id && (
          <>
            <button
              onClick={() => onDismiss(item.id!)}
              className="flex items-center gap-1 px-2 py-1.5 text-slate-400 hover:text-red-500 transition-colors rounded-lg text-xs"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onSnooze(item.id!)}
              className="flex items-center gap-1 px-2 py-1.5 text-slate-400 hover:text-amber-500 transition-colors rounded-lg text-xs"
            >
              <BellOff className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Grouped Inbox ────────────────────────────────────────────────────────────

type InboxGroup = 'today' | 'week' | 'future';

function groupInboxItem(item: InboxItemData): InboxGroup {
  if (!item.created_at) return 'today';
  const diffH = (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60);
  if (diffH <= 24) return 'today';
  if (diffH <= 168) return 'week';
  return 'future';
}

function EngineeringInbox({ items, onDiscuss, onDismiss, onSnooze }: {
  items: InboxItemData[];
  onDiscuss: (item: InboxItemData) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
}) {
  const [activeGroup, setActiveGroup] = useState<InboxGroup>('today');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'critical' | 'high'>('all');

  const today  = items.filter(i => groupInboxItem(i) === 'today');
  const week   = items.filter(i => groupInboxItem(i) === 'week');
  const future = items.filter(i => groupInboxItem(i) === 'future');
  const groupMap: Record<InboxGroup, InboxItemData[]> = { today, week, future };
  const groupLabels: Record<InboxGroup, string> = { today: 'Today', week: 'This Week', future: 'Earlier' };

  const activeItems = groupMap[activeGroup].filter(i =>
    inboxFilter === 'all' || i.priority === inboxFilter
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
        <Inbox className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-800">Engineering Inbox</h3>
        <span className="text-[10px] font-bold text-white bg-blue-500 px-1.5 py-0.5 rounded-full">{items.length}</span>
        {items.filter(i => i.priority === 'critical').length > 0 && (
          <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">
            {items.filter(i => i.priority === 'critical').length} critical
          </span>
        )}
      </div>

      <div className="px-4 pt-2.5 pb-0 flex gap-1 border-b border-slate-100 overflow-x-auto">
        {(['today', 'week', 'future'] as InboxGroup[]).map(g => (
          <button
            key={g}
            onClick={() => setActiveGroup(g)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeGroup === g
                ? 'text-blue-700 border-blue-500 bg-blue-50/50'
                : 'text-slate-500 border-transparent hover:text-slate-700'
            }`}
          >
            {groupLabels[g]}
            {groupMap[g].length > 0 && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                activeGroup === g ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {groupMap[g].length}
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto flex gap-1 pb-1">
          {(['all', 'critical', 'high'] as const).map(f => (
            <button
              key={f}
              onClick={() => setInboxFilter(f)}
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all capitalize whitespace-nowrap ${
                inboxFilter === f ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
        {activeItems.map((item, i) => (
          <InboxItemCard
            key={item.id ?? i}
            item={item}
            onDiscuss={onDiscuss}
            onDismiss={onDismiss}
            onSnooze={onSnooze}
            compact
          />
        ))}
        {activeItems.length === 0 && (
          <div className="text-center py-6">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
            <p className="text-xs text-slate-400">All clear for {groupLabels[activeGroup].toLowerCase()}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Next Action ──────────────────────────────────────────────────────────────

function NextActionCard({ action, onAction }: {
  action: BriefingData['next_action'];
  onAction: (prompt: string) => void;
}) {
  const typeIcon: Record<string, typeof Brain> = {
    testing: TestTube2, planning: Target, documentation: FileText,
    review: GitBranch, build: Package, release: Rocket,
  };
  const Icon = typeIcon[action.type] ?? Sparkles;

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-start gap-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all group cursor-pointer"
      onClick={() => onAction(action.prompt)}
    >
      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Suggested Next Action</p>
        <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{action.title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{action.reason}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 shrink-0 transition-colors mt-1" />
    </div>
  );
}

// ─── Mission Progress ─────────────────────────────────────────────────────────

function MissionProgress({ summary }: { summary: EngineeringSummary }) {
  const goalProgress = summary.goals_active + summary.goals_complete > 0
    ? Math.round((summary.goals_complete / (summary.goals_active + summary.goals_complete)) * 100) : 0;
  const epicProgress = summary.epics_active + summary.epics_complete > 0
    ? Math.round((summary.epics_complete / (summary.epics_active + summary.epics_complete)) * 100) : 0;
  const avg = Math.round((goalProgress + epicProgress) / 2);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Target className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-800">Current Mission</h3>
        <div className="ml-auto">
          <span className={`text-xs font-black ${avg >= 70 ? 'text-emerald-600' : avg >= 40 ? 'text-amber-600' : 'text-slate-500'}`}>
            {avg}% complete
          </span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-600 font-medium">Goals</span>
            <span className="text-xs text-slate-500">{summary.goals_complete} of {summary.goals_active + summary.goals_complete} complete</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${goalProgress >= 70 ? 'bg-emerald-500' : goalProgress >= 40 ? 'bg-amber-500' : 'bg-blue-500'}`}
              style={{ width: `${goalProgress}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-600 font-medium">Epics</span>
            <span className="text-xs text-slate-500">{summary.epics_complete} of {summary.epics_active + summary.epics_complete} complete</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${epicProgress >= 70 ? 'bg-emerald-500' : epicProgress >= 40 ? 'bg-amber-500' : 'bg-blue-500'}`}
              style={{ width: `${epicProgress}%` }} />
          </div>
        </div>
        {summary.avg_goal_progress > 0 && (
          <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400">
            <Activity className="w-3 h-3" />
            Avg goal progress: <span className="font-semibold text-slate-600">{Math.round(summary.avg_goal_progress)}%</span>
            <span className="mx-1">·</span>
            Avg epic progress: <span className="font-semibold text-slate-600">{Math.round(summary.avg_epic_progress)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── What Needs Attention ─────────────────────────────────────────────────────

function WhatNeedsAttention({ health }: { health: HealthData }) {
  const changes = [
    health.critical_issues > 0 && {
      label: `${health.critical_issues} critical issue${health.critical_issues !== 1 ? 's' : ''} active`,
      type: 'alert' as const,
      detail: 'Requires immediate attention',
    },
    health.backlog_blocked > 0 && {
      label: `${health.backlog_blocked} backlog item${health.backlog_blocked !== 1 ? 's' : ''} blocked`,
      type: 'warning' as const,
      detail: 'Dependency or decision required',
    },
    health.compliance_critical_untested > 0 && {
      label: `${health.compliance_critical_untested} compliance gap${health.compliance_critical_untested !== 1 ? 's' : ''} untested`,
      type: 'alert' as const,
      detail: 'ASQA risk exposure',
    },
    health.engineering_debt > 50 && {
      label: `Engineering debt at ${health.engineering_debt}%`,
      type: 'warning' as const,
      detail: 'Above acceptable threshold',
    },
    health.features_live > 0 && {
      label: `${health.features_live} of ${health.features_total} features live`,
      type: 'info' as const,
      detail: `${Math.round((health.features_live / health.features_total) * 100)}% platform deployed`,
    },
  ].filter(Boolean) as { label: string; type: 'alert' | 'warning' | 'info'; detail: string }[];

  if (changes.length === 0) return null;

  const typeCfg = {
    alert:   { icon: AlertOctagon,  color: 'text-red-500',   bg: 'bg-red-50',   border: 'border-red-200' },
    warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
    info:    { icon: Info,          color: 'text-blue-500',  bg: 'bg-blue-50',  border: 'border-blue-200' },
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-800">What Needs Attention</h3>
      </div>
      <div className="p-3 space-y-2">
        {changes.map((c, i) => {
          const cfg = typeCfg[c.type];
          const Icon = cfg.icon;
          return (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${cfg.bg} ${cfg.border}`}>
              <Icon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800">{c.label}</p>
                <p className="text-[10px] text-slate-500">{c.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Quick Stats Strip ────────────────────────────────────────────────────────

function QuickStatsStrip({ health, summary }: { health: HealthData; summary: EngineeringSummary | null }) {
  const stats = [
    {
      label: 'Eng Health',
      value: `${health.engineering_health}%`,
      delta: health.engineering_health - 72,
      icon: Activity,
      color: health.engineering_health >= 85 ? 'text-emerald-600' : health.engineering_health >= 70 ? 'text-amber-600' : 'text-red-600',
    },
    {
      label: 'Test Coverage',
      value: health.testing_total > 0 ? `${Math.round((health.testing_passed / health.testing_total) * 100)}%` : '—',
      icon: TestTube2,
      color: 'text-cyan-600',
    },
    {
      label: 'Active Phase',
      value: summary?.current_phase ?? '—',
      icon: Layers,
      color: 'text-blue-600',
    },
    {
      label: 'Release',
      value: summary?.current_release ?? '—',
      icon: Rocket,
      color: 'text-teal-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {stats.map(s => {
        const Icon = s.icon;
        return (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Icon className={`w-4 h-4 shrink-0 ${s.color}`} />
            <div className="min-w-0">
              <p className={`text-sm font-black leading-tight truncate ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-slate-400 truncate">{s.label}</p>
            </div>
            {'delta' in s && (s as { delta: number }).delta !== undefined && (
              <div className="ml-auto shrink-0 flex items-center gap-0.5">
                {getTrendIcon((s as { delta: number }).delta)}
                <span className={`text-[9px] font-semibold ${getTrendColor((s as { delta: number }).delta)}`}>
                  {getTrendText((s as { delta: number }).delta)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Architecture Metrics Widget ──────────────────────────────────────────────

function ArchitectureMetricsWidget({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [metrics, setMetrics] = useState<ArchitectureMetrics | null>(null);

  useEffect(() => {
    loadModuleRegistry().then(modules => {
      if (modules.length > 0) setMetrics(computeArchitectureMetrics(modules));
    });
  }, []);

  if (!metrics) return null;

  const scoreColor = (n: number) =>
    n >= 90 ? 'text-emerald-600' : n >= 70 ? 'text-blue-600' : n >= 50 ? 'text-amber-600' : 'text-red-600';
  const scoreBg = (n: number) =>
    n >= 90 ? 'bg-emerald-50 border-emerald-200' : n >= 70 ? 'bg-blue-50 border-blue-200' : n >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  const overallScore = Math.round(
    (metrics.compliance_score + metrics.platform_reuse_score +
     metrics.commercial_readiness_score + metrics.dependency_health_score +
     metrics.layer_separation_score) / 5
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div
        className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => onNavigate?.('module-registry')}
      >
        <Layers className="w-4 h-4 text-blue-500" />
        <h3 className="text-sm font-bold text-slate-800 flex-1">Platform Architecture</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${scoreBg(overallScore)} ${scoreColor(overallScore)}`}>
          {overallScore}% Compliant
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
      </div>
      <div className="p-4">
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: 'Core Platform', value: metrics.core_platform_count, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Domain',        value: metrics.domain_module_count,  color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Infrastructure',value: metrics.infrastructure_count, color: 'text-slate-600', bg: 'bg-slate-50' },
          ].map(k => (
            <div key={k.label} className={`rounded-lg px-3 py-2 text-center ${k.bg}`}>
              <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
              <p className="text-[10px] text-slate-500 leading-tight">{k.label}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[
            { label: 'Compliance',          value: metrics.compliance_score },
            { label: 'Platform Reuse',      value: metrics.platform_reuse_score },
            { label: 'Commercial Readiness',value: metrics.commercial_readiness_score },
          ].map(row => {
            const barColor = row.value >= 90 ? '#10b981' : row.value >= 70 ? '#3b82f6' : row.value >= 50 ? '#f59e0b' : '#ef4444';
            return (
              <div key={row.label}>
                <div className="flex justify-between mb-0.5">
                  <span className="text-[10px] text-slate-500">{row.label}</span>
                  <span className={`text-[10px] font-bold ${scoreColor(row.value)}`}>{row.value}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${row.value}%`, backgroundColor: barColor }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
          <span className="text-[10px] text-slate-400">{metrics.reusable_count} reusable · {metrics.total_modules} total modules</span>
          <button
            onClick={() => onNavigate?.('module-registry')}
            className="text-[10px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
          >
            View Registry <ArrowRight className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Engineering Learning & Memory Widget ─────────────────────────────────────

function EngineeringLearningWidget({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [stats, setStats] = useState<{
    total_reviews: number;
    reviews_with_elpm: number;
    reviews_with_intelligence: number;
    memory_entries: number;
    avg_confidence: number;
    strong_precedent: number;
    conversations_indexed: number;
    decisions_extracted: number;
    lessons_extracted: number;
  } | null>(null);

  useEffect(() => {
    async function load() {
      const [reviewsRes, memoryRes, convStats] = await Promise.all([
        supabase.from('ecc_engineering_reviews')
          .select('id,elpm_generated_at,elpm_historical_confidence,intelligence_generated_at,intelligence_quality_score'),
        supabase.from('ecc_engineering_memory')
          .select('id,weight')
          .eq('is_superseded', false),
        loadConversationIntelligenceStats(),
      ]);

      const reviews = reviewsRes.data ?? [];
      const memory  = memoryRes.data ?? [];

      const withElpm  = reviews.filter(r => r.elpm_generated_at);
      const withIntel = reviews.filter(r => r.intelligence_generated_at);
      const confs     = withElpm.map(r => (r.elpm_historical_confidence as number) ?? 0);
      const avgConf   = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
      const strong    = withElpm.filter(r => (r.elpm_historical_confidence as number) >= 0.6).length;

      setStats({
        total_reviews:             reviews.length,
        reviews_with_elpm:         withElpm.length,
        reviews_with_intelligence: withIntel.length,
        memory_entries:            memory.length,
        avg_confidence:            Math.round(avgConf * 100),
        strong_precedent:          strong,
        conversations_indexed:     convStats.total_indexed,
        decisions_extracted:       convStats.decisions_extracted,
        lessons_extracted:         convStats.lessons_extracted,
      });
    }
    load();
  }, []);

  const coveragePct = stats && stats.total_reviews > 0
    ? Math.round((stats.reviews_with_elpm / stats.total_reviews) * 100)
    : 0;

  return (
    <div
      className={`bg-white border border-slate-200 rounded-2xl overflow-hidden ${onNavigate ? 'cursor-pointer hover:border-emerald-300 hover:shadow-sm transition-all group' : ''}`}
      onClick={() => onNavigate?.('engineering-reviews')}
    >
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Engineering Learning & Memory</h3>
        {onNavigate && <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500 ml-auto transition-colors" />}
      </div>

      {!stats ? (
        <div className="p-4 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-slate-300 animate-spin" />
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {/* Reviews KPI row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Reviews Analysed', value: `${stats.reviews_with_elpm}/${stats.total_reviews}`, color: 'text-emerald-600' },
              { label: 'Memory Entries', value: stats.memory_entries, color: 'text-amber-600' },
              { label: 'Strong Precedent', value: stats.strong_precedent, color: 'text-blue-600' },
            ].map(k => (
              <div key={k.label} className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center">
                <p className={`text-base font-black ${k.color}`}>{k.value}</p>
                <p className="text-[9px] text-slate-500 leading-tight mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Conversation Intelligence KPI row */}
          {stats.conversations_indexed > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Convs Indexed', value: stats.conversations_indexed, color: 'text-teal-600' },
                { label: 'Decisions',     value: stats.decisions_extracted,   color: 'text-blue-600' },
                { label: 'Lessons',       value: stats.lessons_extracted,     color: 'text-violet-600' },
              ].map(k => (
                <div key={k.label} className="bg-teal-50 border border-teal-100 rounded-xl p-2.5 text-center">
                  <p className={`text-base font-black ${k.color}`}>{k.value}</p>
                  <p className="text-[9px] text-teal-500 leading-tight mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Learning Coverage Bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-slate-500">Learning Coverage</span>
              <span className="text-[10px] font-bold text-emerald-600">{coveragePct}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${coveragePct >= 75 ? 'bg-emerald-500' : coveragePct >= 40 ? 'bg-amber-500' : 'bg-slate-300'}`}
                style={{ width: `${coveragePct}%` }}
              />
            </div>
          </div>

          {/* Intelligence Health */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${stats.avg_confidence >= 60 ? 'bg-emerald-400' : stats.avg_confidence >= 30 ? 'bg-amber-400' : 'bg-slate-300'}`} />
            <p className="text-[11px] text-slate-500">
              Avg historical confidence: <span className="font-semibold text-slate-700">{stats.avg_confidence}%</span>
              {stats.reviews_with_intelligence > 0 && (
                <> &middot; <span className="font-semibold text-blue-600">{stats.reviews_with_intelligence}</span> with full intelligence</>
              )}
            </p>
          </div>

          {stats.memory_entries === 0 && stats.conversations_indexed === 0 && (
            <p className="text-[10px] text-slate-400 italic">No engineering memory or conversation intelligence yet. Run ELPM or index an ATD conversation to begin learning.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Director Dashboard ──────────────────────────────────────────────────

type ActiveView = 'dashboard' | 'inbox' | 'scorecard' | 'briefing' | 'briefing-history';

interface ECCDirectorDashboardProps {
  onStartConversation: (prompt?: string) => void;
  onContextStats: (stats: Record<string, number>) => void;
  onNavigate?: (section: string) => void;
}

export function ECCDirectorDashboard({ onStartConversation, onContextStats, onNavigate }: ECCDirectorDashboardProps) {
  // ── Layer 1: Operational data (loads on mount, no AI) ──
  const [opsLoading,   setOpsLoading]   = useState(true);
  const [health,       setHealth]       = useState<HealthData | null>(null);
  const [summary,      setSummary]      = useState<EngineeringSummary | null>(null);
  const [inboxItems,   setInboxItems]   = useState<InboxItemData[]>([]);
  const [opsError,     setOpsError]     = useState<string | null>(null);

  // ── Layer 2: Executive intelligence (latest stored briefing) ──
  const [briefingLoading,    setBriefingLoading]    = useState(true);
  // briefingRefreshing is true during background refreshes when content already exists.
  // It never replaces existing content with a skeleton — it only shows a subtle indicator.
  const [briefingRefreshing, setBriefingRefreshing] = useState(false);
  const [latestBriefing,     setLatestBriefing]     = useState<StoredBriefing | null>(null);
  const [briefingHistory,    setBriefingHistory]    = useState<StoredBriefing[]>([]);
  const [historyLoading,     setHistoryLoading]     = useState(false);
  const [generating,         setGenerating]         = useState(false);
  const [generateError,      setGenerateError]      = useState<string | null>(null);
  const [viewedBriefing,     setViewedBriefing]     = useState<StoredBriefing | null>(null);

  const [activeView,    setActiveView]    = useState<ActiveView>('dashboard');
  const [activitySince, setActivitySince] = useState(0);

  const [scheduleConfig, setScheduleConfig] = useState<{
    id: string; catch_up_on_startup: boolean; enabled: boolean;
  } | null>(null);

  const onContextStatsRef = useRef(onContextStats);
  onContextStatsRef.current = onContextStats;

  // Ref tracks the current briefing value for use inside effects without
  // adding latestBriefing to effect dependency arrays (which causes re-fire loops).
  const latestBriefingRef = useRef<StoredBriefing | null>(null);
  latestBriefingRef.current = latestBriefing;

  // One-shot guard: startup catch-up must only fire once per mount.
  const startupCatchUpFiredRef = useRef(false);

  // ── Load operational data from DB (instant, no AI) ──
  const loadOperationalData = useCallback(async () => {
    setOpsLoading(true);
    setOpsError(null);
    try {
      const [features, goals, epics, backlog, releases, phases, decisions, inboxRes] = await Promise.all([
        supabase.from('ecc_product_features').select('lifecycle_stage,testing_status,documentation_status,compliance_critical,operational_risk'),
        supabase.from('ecc_goals').select('status,progress_pct').order('position'),
        supabase.from('ecc_epics').select('status,progress_pct').order('position'),
        supabase.from('ecc_backlog_items').select('status,priority').order('created_at', { ascending: false }).limit(50),
        supabase.from('ecc_release_candidates').select('is_active,status,manual_testing_status,regression_testing_status,rc_number').order('created_at', { ascending: false }).limit(10),
        supabase.from('ecc_phases').select('name,status').order('sort_order').limit(5),
        supabase.from('ecc_decisions').select('decision_date').order('decision_date', { ascending: false }).limit(10),
        supabase.from('ecc_ai_inbox').select('*').in('status', ['pending']).or(`snoozed_until.is.null,snoozed_until.lt.${new Date().toISOString()}`).order('created_at', { ascending: false }).limit(20),
      ]);

      const { health: h, summary: s } = computeHealthFromRaw(
        (features.data ?? []) as RawFeature[],
        (goals.data ?? []) as RawGoal[],
        (epics.data ?? []) as RawEpic[],
        (backlog.data ?? []) as RawBacklog[],
        (releases.data ?? []) as RawRC[],
        (phases.data ?? []) as RawPhase[],
        (decisions.data ?? []) as RawDecision[],
      );

      setHealth(h);
      setSummary(s);
      setInboxItems((inboxRes.data ?? []) as InboxItemData[]);

      onContextStatsRef.current({
        total: h.features_total,
        live: h.features_live,
        notTested: h.testing_total - h.testing_passed,
        goals: s.goals_active,
        epics: s.epics_active,
        backlogTotal: h.backlog_open,
        relationships: 0,
      });

      localStorage.setItem('ecc_last_visit', String(Date.now()));
    } catch (err) {
      setOpsError(err instanceof Error ? err.message : 'Failed to load operational data');
    } finally {
      setOpsLoading(false);
    }
  }, []);

  // ── Load latest stored briefing (no AI call) ──
  const loadLatestBriefing = useCallback(async () => {
    // Only show the full skeleton when there is no existing briefing to display.
    // Background refreshes must not replace visible content with a skeleton.
    if (!latestBriefingRef.current) {
      setBriefingLoading(true);
    } else {
      setBriefingRefreshing(true);
    }
    try {
      // Scope briefing to the active engineering context
      const ctx = await ActiveProjectService.resolveActiveContext();
      const { data: latest } = await supabase
        .from('ecc_ai_briefings')
        .select('id,briefing_data,health_data,engineering_summary,created_at,briefing_ref,ai_model,token_input,token_output,generation_duration_ms,estimated_cost_usd,engineering_phase,platform_version,trigger_type,scheduled_for,template_id,schedule_id')
        .eq('context_type', ctx.context_type)
        .eq('context_id', ctx.context_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setLatestBriefing(latest as StoredBriefing | null);
    } catch {
      // Briefing unavailable — not fatal, operational data still shows
    } finally {
      setBriefingLoading(false);
      setBriefingRefreshing(false);
    }
  }, []); // stable — reads latestBriefing via ref to avoid dependency issues

  useEffect(() => {
    loadOperationalData();
    loadLatestBriefing();
  }, [loadOperationalData, loadLatestBriefing]);

  // Compute activity since last briefing
  useEffect(() => {
    if (!latestBriefing || !health) return;
    const since = new Date(latestBriefing.created_at);
    supabase
      .from('ecc_backlog_items')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since.toISOString())
      .then(({ count }) => setActivitySince(count ?? 0));
  }, [latestBriefing, health]);

  // Load default schedule config for startup catch-up
  useEffect(() => {
    supabase
      .from('ecc_briefing_schedule_config')
      .select('id,catch_up_on_startup,enabled')
      .eq('enabled', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setScheduleConfig(data as typeof scheduleConfig); });
  }, []);

  // Startup catch-up: if today has no scheduled briefing and catch_up_on_startup is on, trigger.
  // The one-shot guard (startupCatchUpFiredRef) prevents this from re-firing when latestBriefing
  // or briefingLoading change, which previously created a re-render loop causing visible flickering.
  useEffect(() => {
    if (!scheduleConfig?.catch_up_on_startup || !scheduleConfig.enabled) return;
    if (startupCatchUpFiredRef.current) return;

    // Read latestBriefing via ref — not adding it to deps prevents re-fire on briefing change
    const today = new Date().toISOString().slice(0, 10);
    const todayHasScheduled = latestBriefingRef.current?.scheduled_for === today
      && latestBriefingRef.current?.trigger_type !== 'manual';
    if (todayHasScheduled) return;

    // Mark as fired BEFORE the async work to prevent concurrent duplicate requests
    startupCatchUpFiredRef.current = true;

    (async () => {
      try {
        const { data: secret } = await supabase.from('settings').select('value').eq('key', 'cron_secret').maybeSingle();
        const cronSecret = secret?.value ? String(secret.value).replace(/^"|"$/g, '') : null;
        if (!cronSecret) return;
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scheduled-briefing-runner`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Cron-Secret': cronSecret,
            },
            body: JSON.stringify({ startup_catchup: true }),
          }
        );
        // Reload briefing — this is now a background refresh (won't show skeleton)
        await loadLatestBriefing();
      } catch {
        // Non-fatal — dashboard still works without scheduled briefing
      }
    })();
  // scheduleConfig: the only external trigger for startup logic
  // loadLatestBriefing: stable useCallback with empty deps
  // Deliberately excluded: briefingLoading, latestBriefing — reading via refs prevents loop
  }, [scheduleConfig, loadLatestBriefing]);

  const freshness = (() => {
    if (!latestBriefing) return 'out-of-date' as FreshnessStatus;
    const ageH = (Date.now() - new Date(latestBriefing.created_at).getTime()) / (1000 * 60 * 60);
    return computeFreshness(latestBriefing.created_at, activitySince, ageH);
  })();

  // ── Generate new briefing on demand ──
  async function generateNewBriefing() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-engineering-briefing`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ generate_new: true }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      // loadLatestBriefing will use briefingRefreshing (not skeleton) since content now exists
      await loadLatestBriefing();
      setActiveView('dashboard');
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  // ── Load full briefing history ──
  async function loadBriefingHistory() {
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('ecc_ai_briefings')
        .select('id,briefing_data,health_data,engineering_summary,created_at,briefing_ref,ai_model,token_input,token_output,generation_duration_ms,estimated_cost_usd,engineering_phase,platform_version,trigger_type,scheduled_for,template_id,schedule_id')
        .order('created_at', { ascending: false })
        .limit(50);
      setBriefingHistory((data ?? []) as StoredBriefing[]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function dismissItem(id: string) {
    await supabase.from('ecc_ai_inbox').update({ status: 'dismissed', actioned_at: new Date().toISOString() }).eq('id', id);
    setInboxItems(prev => prev.filter(i => i.id !== id));
  }

  async function snoozeItem(id: string) {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('ecc_ai_inbox').update({ status: 'snoozed', snoozed_until: until, actioned_at: new Date().toISOString() }).eq('id', id);
    setInboxItems(prev => prev.filter(i => i.id !== id));
  }

  function handleInboxDiscuss(item: InboxItemData) {
    onStartConversation(`${item.title}: ${item.description}`);
  }

  const handleViewHistory = useCallback(() => {
    loadBriefingHistory();
    setActiveView('briefing-history');
  }, []);

  const handleSelectBriefing = useCallback((b: StoredBriefing) => {
    setViewedBriefing(b);
    setActiveView('briefing');
  }, []);

  const handleViewLatestBriefing = useCallback(() => {
    setViewedBriefing(latestBriefing);
    setActiveView('briefing');
  }, [latestBriefing]);

  // ── Loading state — only shows while operational data is loading ──
  if (opsLoading) {
    return (
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Loading Engineering Dashboard...</p>
              <p className="text-xs text-slate-400">Reading live programme data</p>
            </div>
            <Loader2 className="w-4 h-4 animate-spin text-blue-500 ml-auto" />
          </div>
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  // ── Ops error ──
  if (opsError) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-2">Dashboard Unavailable</h3>
          <p className="text-sm text-slate-500 mb-4">{opsError}</p>
          <button onClick={loadOperationalData} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const highPriorityItems = inboxItems.filter(i => i.priority === 'critical' || i.priority === 'high');
  const decisionsWaiting = inboxItems.filter(i => i.type === 'blocker' || i.priority === 'critical').length;
  const criticalCount = inboxItems.filter(i => i.priority === 'critical').length;

  // The briefing content shown in 'dashboard' and 'briefing' views
  const activeBriefingData = viewedBriefing ?? latestBriefing;
  const activeBriefing = activeBriefingData?.briefing_data as BriefingData | null;
  const activeBriefingHealth = activeBriefingData?.health_data as HealthData | null;
  const activeBriefingSummary = activeBriefingData?.engineering_summary as EngineeringSummary | null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* View tabs */}
      <div className="shrink-0 px-4 md:px-6 py-2 bg-white border-b border-slate-100 flex items-center gap-1 overflow-x-auto">
        {([
          { key: 'dashboard' as ActiveView,        label: 'Dashboard',          icon: LayoutDashboard },
          { key: 'inbox' as ActiveView,             label: 'Inbox',              icon: Inbox, badge: inboxItems.length > 0 ? inboxItems.length : undefined },
          { key: 'scorecard' as ActiveView,         label: 'Scorecard',          icon: BarChart3 },
          { key: 'briefing-history' as ActiveView,  label: 'Briefing History',   icon: History },
        ] as { key: ActiveView; label: string; icon: typeof Brain; badge?: number }[]).map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => {
                if (tab.key === 'briefing-history') handleViewHistory();
                else { setActiveView(tab.key); setViewedBriefing(null); }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeView === tab.key
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.badge !== undefined && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeView === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {decisionsWaiting > 0 && (
            <button
              onClick={() => setActiveView('inbox')}
              className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-full hover:bg-red-100 transition-colors whitespace-nowrap"
            >
              <AlertTriangle className="w-3 h-3" />
              {decisionsWaiting} waiting
            </button>
          )}
          {criticalCount > 0 && (
            <span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">
              {criticalCount} critical
            </span>
          )}
          <button
            onClick={loadOperationalData}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors"
            title="Refresh operational data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* ─── DASHBOARD VIEW ─── */}
          {activeView === 'dashboard' && (
            <>
              {/* Quick Stats — from live DB */}
              {health && summary && <QuickStatsStrip health={health} summary={summary} />}

              {/* Executive Intelligence card — on-demand AI */}
              {/* Show skeleton ONLY on the true first load (no previous briefing exists).
                  Background refreshes use briefingRefreshing which shows a subtle indicator
                  inside the card — the existing content stays visible throughout. */}
              {briefingLoading && !latestBriefing ? (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-slate-400 animate-pulse" />
                    <h3 className="text-sm font-bold text-slate-800">Executive Intelligence</h3>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 ml-auto" />
                  </div>
                  <WidgetSkeleton lines={3} />
                </div>
              ) : (
                <ExecBriefingStatusCard
                  latestBriefing={latestBriefing}
                  freshness={freshness}
                  activitySince={activitySince}
                  generating={generating}
                  refreshing={briefingRefreshing}
                  onGenerate={generateNewBriefing}
                  onView={handleViewLatestBriefing}
                  onHistory={handleViewHistory}
                />
              )}

              {/* Scheduled changes banner — shown when post-scheduled activity detected */}
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const isScheduledToday = latestBriefing?.trigger_type !== 'manual' && latestBriefing?.scheduled_for === today;
                return isScheduledToday && activitySince >= 3 && !briefingLoading ? (
                  <ScheduledChangesBanner
                    activitySince={activitySince}
                    scheduledBriefingTime={latestBriefing ? fmtTime(latestBriefing.created_at) : null}
                    generating={generating}
                    onViewBriefing={handleViewLatestBriefing}
                    onGenerate={generateNewBriefing}
                  />
                ) : null;
              })()}

              {/* Generation error */}
              {generateError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {generateError === 'NO_API_KEY'
                    ? 'No AI key configured. Add one in Settings → AI Configuration.'
                    : generateError}
                </div>
              )}

              {/* Decisions Waiting */}
              {highPriorityItems.length > 0 && (
                <DecisionsWaiting items={highPriorityItems} onDiscuss={handleInboxDiscuss} />
              )}

              {/* Mission Progress — from live DB */}
              {summary && <MissionProgress summary={summary} />}

              {/* What Needs Attention — from live DB */}
              {health && <WhatNeedsAttention health={health} />}

              {/* Briefing content — from stored artefact, shown if available */}
              {activeBriefing?.primary_recommendation && (
                <PrimaryRecommendation
                  rec={activeBriefing.primary_recommendation}
                  onAction={onStartConversation}
                />
              )}
              {activeBriefing?.next_action && (
                <NextActionCard action={activeBriefing.next_action} onAction={onStartConversation} />
              )}

              {/* Scorecard teaser */}
              {health && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-bold text-slate-800">Engineering Scorecard</h3>
                    <button
                      onClick={() => setActiveView('scorecard')}
                      className="ml-auto flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-semibold transition-colors"
                    >
                      Full scorecard <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-3">
                    {HEALTH_METRICS.slice(0, 4).map(m => {
                      const score = health[m.key as keyof HealthData] as number;
                      const Icon = m.icon;
                      const color = healthColor(score, m.thresholds);
                      const barColor = healthBarColor(score, m.thresholds);
                      return (
                        <div key={m.key} className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                            <Icon className={`w-3.5 h-3.5 ${color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] text-slate-500 truncate">{m.label}</span>
                              <span className={`text-[11px] font-black shrink-0 ml-1 ${color}`}>{score}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Talk to AI Director */}
              {onNavigate && (
                <div
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all group"
                  onClick={() => onNavigate('analytics')}
                >
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-slate-500 group-hover:text-blue-600 transition-colors" />
                    <h3 className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors">Engineering Productivity & Cost Intelligence</h3>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 ml-auto transition-colors" />
                  </div>
                  <div className="px-4 py-3 grid grid-cols-3 gap-3">
                    {[
                      { label: 'AI Spend', icon: DollarSign, color: 'text-blue-600' },
                      { label: 'ROI Analytics', icon: TrendingUp, color: 'text-emerald-600' },
                      { label: 'Productivity', icon: Activity, color: 'text-amber-600' },
                    ].map(m => {
                      const Icon = m.icon;
                      return (
                        <div key={m.label} className="flex flex-col items-center gap-1 py-2">
                          <Icon className={`w-5 h-5 ${m.color}`} />
                          <span className="text-[10px] text-slate-500 text-center">{m.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Engineering Learning & Memory Widget */}
              <EngineeringLearningWidget onNavigate={onNavigate} />

              {/* Architecture Metrics Widget */}
              <ArchitectureMetricsWidget onNavigate={onNavigate} />

              {/* Talk to AI Director */}
              <div
                className="bg-gradient-to-r from-blue-50 to-teal-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:from-blue-100 hover:to-teal-100 transition-all group"
                onClick={() => onStartConversation()}
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors">Talk to the AI Technical Director</p>
                  <p className="text-xs text-slate-500">Ask anything · Plan features · Analyse impact · Prepare implementation prompts</p>
                </div>
                <ArrowRight className="w-4 h-4 text-blue-400 group-hover:text-blue-600 shrink-0 transition-colors" />
              </div>

              {/* Engineering Workspaces */}
              {onNavigate && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-bold text-slate-800">Engineering Workspaces</h3>
                    <p className="ml-2 text-[10px] text-slate-400 hidden sm:block">Navigate to a workspace to execute work</p>
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2">
                    {[
                      { label: 'Dev Programme',        section: 'dev-programme',  icon: Target,    color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',    desc: 'Plan & execute phases' },
                      { label: 'Testing Framework',    section: 'qa-testing',     icon: TestTube2, color: 'text-cyan-600',    bg: 'bg-cyan-50',    border: 'border-cyan-200',    desc: 'Run TP-001 & test plans' },
                      { label: 'Architecture',         section: 'architecture',   icon: GitBranch, color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200',   desc: 'Technical decisions & specs' },
                      { label: 'Documentation',        section: 'documentation',  icon: FileText,  color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', desc: 'Knowledge & specifications' },
                      { label: 'Releases',             section: 'release-centre', icon: Rocket,    color: 'text-teal-600',    bg: 'bg-teal-50',    border: 'border-teal-200',    desc: 'RC management & deployment' },
                      { label: 'Engineering Guardian', section: 'arch-guardian',  icon: Shield,    color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',   desc: 'Governance & standards' },
                    ].map(ws => {
                      const Icon = ws.icon;
                      return (
                        <button
                          key={ws.section}
                          onClick={() => onNavigate(ws.section)}
                          className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${ws.border} ${ws.bg} hover:opacity-90 transition-all text-left group`}
                        >
                          <div className="w-7 h-7 rounded-lg bg-white/70 flex items-center justify-center shrink-0 mt-0.5">
                            <Icon className={`w-3.5 h-3.5 ${ws.color}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-semibold ${ws.color} group-hover:opacity-80`}>{ws.label}</p>
                            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{ws.desc}</p>
                          </div>
                          <ArrowRight className={`w-3 h-3 shrink-0 mt-1 ${ws.color} opacity-40 group-hover:opacity-100 transition-opacity`} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── STORED BRIEFING VIEWER ─── */}
          {activeView === 'briefing' && viewedBriefing && (
            <StoredBriefingViewer
              briefing={viewedBriefing}
              onBack={() => setActiveView('dashboard')}
              onStartConversation={onStartConversation}
            />
          )}

          {/* ─── INBOX VIEW ─── */}
          {activeView === 'inbox' && (
            inboxItems.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800 mb-1">Engineering inbox is clear</h3>
                <p className="text-sm text-slate-500">No pending recommendations or blockers.</p>
              </div>
            ) : (
              <EngineeringInbox
                items={inboxItems}
                onDiscuss={handleInboxDiscuss}
                onDismiss={dismissItem}
                onSnooze={snoozeItem}
              />
            )
          )}

          {/* ─── SCORECARD VIEW ─── */}
          {activeView === 'scorecard' && health && (
            <>
              <EngineeringScorecard health={health} />
              {summary && <MissionProgress summary={summary} />}
              <WhatNeedsAttention health={health} />
            </>
          )}

          {/* ─── BRIEFING HISTORY VIEW ─── */}
          {activeView === 'briefing-history' && (
            <BriefingHistoryPanel
              briefings={briefingHistory}
              loading={historyLoading}
              onSelect={handleSelectBriefing}
            />
          )}

        </div>
      </div>
    </div>
  );
}
