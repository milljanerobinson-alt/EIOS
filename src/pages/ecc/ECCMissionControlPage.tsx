import React, { useState, useEffect } from 'react';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  TrendingUp,
  Users,
  Target,
  GitBranch,
  Bot,
  ArrowRight,
  AlertTriangle,
  CheckCheck,
  BarChart3,
  MessageSquare,
  Gauge,
  Lightbulb,
  Activity,
  Shield,
  Layers,
  Cpu,
  Terminal,
  ShieldCheck,
  Heart,
  ClipboardList,
  Brain,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Scale,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CCAIProductManagerPage } from './CCAIProductManagerPage';

// ─── EPRE types (minimal, for display only) ──────────────────────────────────

interface EpreRec {
  id: string;
  run_ref: string;
  recommended_ewo_ref: string | null;
  recommended_ewo_title: string | null;
  recommended_reason: string | null;
  recommended_score: number | null;
  programme_health_score: number | null;
  programme_velocity: number | null;
  in_progress_count: number | null;
  blocked_count: number | null;
  ready_count: number | null;
  created_at: string;
  scored_programme: Array<{
    ewo_ref: string;
    title: string;
    priority: string;
    status: string;
    estimated_effort: string | null;
    risk_level: string;
    executive_summary: string | null;
    business_value: string | null;
    total_score: number;
    blocked: boolean;
    reasoning: string;
  }> | null;
}

// ─── Tab definition ───────────────────────────────────────────────────────────

type MCTab = 'ai-director' | 'platform-overview';

const MC_TABS: { key: MCTab; label: string; icon: typeof Gauge }[] = [
  { key: 'ai-director',       label: 'AI Technical Director', icon: Bot   },
  { key: 'platform-overview', label: 'Platform Overview',     icon: Gauge },
];

interface Feature {
  id: string;
  feature_id: string;
  name: string;
  category: string;
  lifecycle_stage: string;
  testing_status: string;
  documentation_status: string;
  product_review_status: string;
  priority: string | null;
  compliance_critical: boolean;
  production_ready: boolean;
  created_at: string;
  updated_at: string;
}

interface ReleaseCandidate {
  id: string;
  rc_number: string;
  phase_name: string;
  status: string;
  is_active: boolean;
}

interface DevPhase {
  id: string;
  name: string;
  phase_number: number;
  status: string;
}

interface Goal {
  id: string;
  title: string;
  status: string;
}

interface Milestone {
  id: string;
  name: string;
  status: string;
  target_date: string | null;
}

interface ReviewHistory {
  id: string;
  feature_id: string;
  action: string;
  actor: string;
  created_at: string;
  notes: string | null;
}

interface AIUsageLog {
  id: string;
  estimated_cost_usd: number;
  created_at: string;
  success: boolean;
}

interface LatestAudit {
  id: string;
  audit_number: string;
  name: string;
  status: string;
  overall_health_score: number | null;
  critical_findings_count: number | null;
  high_findings_count: number | null;
  created_at: string;
}

interface GuardianHealth {
  id: string;
  title: string;
  created_at: string;
  engineering_health_score: number | null;
  maintainability_score: number | null;
  technical_debt_score: number | null;
  complexity_score: number | null;
  mc_compliance_score: number | null;
  performance_issues: number | null;
  security_issues: number | null;
  approval_status: string | null;
}

interface PageData {
  features: Feature[];
  releaseCandidates: ReleaseCandidate[];
  devPhases: DevPhase[];
  goals: Goal[];
  milestones: Milestone[];
  reviewHistory: ReviewHistory[];
  aiUsageLog: AIUsageLog[];
  latestAudit: LatestAudit | null;
  guardianHealth: GuardianHealth | null;
}

function TP001MissionWidget() {
  const [exec, setExec] = useState<{ pass_rate: number | null; release_recommendation: string | null; execution_number: string; cases_passed: number; cases_failed: number; total_cases: number; completed_at: string | null } | null>(null);

  useEffect(() => {
    supabase
      .from('ecc_tp001_executions')
      .select('execution_number, pass_rate, release_recommendation, cases_passed, cases_failed, total_cases, completed_at')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setExec(data));
  }, []);

  if (!exec) {
    return (
      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-8 text-center">
        <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-600 mb-1">No TP-001 execution yet</p>
        <p className="text-xs text-slate-400">Run a Platform Release Validation to see results here.</p>
      </div>
    );
  }

  const rec = exec.release_recommendation;
  const recColors: Record<string, { bg: string; border: string; text: string }> = {
    PROCEED: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
    WARNING:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700'  },
    BLOCK:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700'    },
  };
  const cfg = rec ? (recColors[rec] ?? { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' }) : { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' };

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-4 p-4 rounded-xl border ${cfg.border} ${cfg.bg}`}>
        <ClipboardList className={`w-5 h-5 ${cfg.text} shrink-0`} />
        <div>
          <p className={`text-base font-bold ${cfg.text}`}>{rec ?? '—'}</p>
          <p className={`text-xs ${cfg.text} opacity-70`}>{exec.execution_number}</p>
        </div>
        <div className="ml-auto text-right">
          <p className={`text-2xl font-bold ${cfg.text}`}>{exec.pass_rate?.toFixed(1) ?? '—'}%</p>
          <p className="text-xs text-slate-500">pass rate</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-emerald-700">{exec.cases_passed}</p>
          <p className="text-xs text-slate-500">Passed</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-red-600">{exec.cases_failed}</p>
          <p className="text-xs text-slate-500">Failed</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-slate-700">{exec.total_cases}</p>
          <p className="text-xs text-slate-500">Total</p>
        </div>
      </div>
      {exec.completed_at && (
        <p className="text-xs text-slate-400">Completed {new Date(exec.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
      )}
    </div>
  );
}

export function ECCMissionControlPage({ onNavigate }: { onNavigate: (section: string) => void }) {
  const [tab, setTab] = useState<MCTab>('ai-director');
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [epreRec, setEpreRec] = useState<EpreRec | null>(null);
  const [epreLoading, setEpreLoading] = useState(true);
  const [epreStale, setEpreStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEpreLoading(true);
    supabase
      .from('epre_recommendations')
      .select('id, run_ref, recommended_ewo_ref, recommended_ewo_title, recommended_reason, recommended_score, programme_health_score, programme_velocity, in_progress_count, blocked_count, ready_count, created_at, scored_programme')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setEpreRec(prev => {
            if (data !== null) return data as EpreRec;
            return prev;
          });
          setEpreLoading(false);
          setEpreStale(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [features, rcs, phases, goals, milestones, history, aiUsage, latestAuditRes, guardianRes] = await Promise.all([
          supabase.from('ecc_product_features').select('*'),
          supabase.from('ecc_release_candidates').select('*'),
          supabase.from('ecc_dev_phases').select('*'),
          supabase.from('ecc_goals').select('*'),
          supabase.from('ecc_milestones').select('*'),
          supabase.from('ecc_feature_review_history').select('*').order('created_at', { ascending: false }).limit(15),
          supabase.from('ai_usage_log').select('*'),
          supabase.from('ecc_audits').select('id, audit_number, name, status, overall_health_score, critical_findings_count, high_findings_count, created_at').order('created_at', { ascending: false }).limit(1),
          supabase.from('architecture_guardian_reviews').select('id, title, created_at, engineering_health_score, maintainability_score, technical_debt_score, complexity_score, mc_compliance_score, performance_issues, security_issues, approval_status').order('created_at', { ascending: false }).limit(1),
        ]);

        if (features.error) throw features.error;
        if (rcs.error) throw rcs.error;
        if (phases.error) throw phases.error;
        if (goals.error) throw goals.error;
        if (milestones.error) throw milestones.error;
        if (history.error) throw history.error;
        if (aiUsage.error) throw aiUsage.error;

        setData({
          features: features.data || [],
          releaseCandidates: rcs.data || [],
          devPhases: phases.data || [],
          goals: goals.data || [],
          milestones: milestones.data || [],
          reviewHistory: history.data || [],
          aiUsageLog: aiUsage.data || [],
          latestAudit: latestAuditRes.data?.[0] ?? null,
          guardianHealth: guardianRes.data?.[0] ?? null,
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <MCTabBar tab={tab} onTab={setTab} />
        {tab === 'ai-director' ? (
          <div className="flex-1 overflow-hidden">
            <CCAIProductManagerPage />
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* EPRE panel renders immediately from its own state — no spinner here */}
              <ExecutiveIntelligencePanel epreRec={epreRec} epreLoading={epreLoading} epreStale={epreStale} onNavigate={onNavigate} />
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-full">
        <MCTabBar tab={tab} onTab={setTab} />
        {tab === 'ai-director' ? (
          <div className="flex-1 overflow-hidden">
            <CCAIProductManagerPage />
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <ExecutiveIntelligencePanel epreRec={epreRec} epreLoading={epreLoading} epreStale={epreStale} onNavigate={onNavigate} />
              <div className="bg-white rounded-lg shadow-lg p-6 max-w-md">
                <AlertCircle className="w-12 h-12 text-red-600 mb-4" />
                <h2 className="text-xl font-bold text-slate-900 mb-2">Error Loading Platform Overview</h2>
                <p className="text-slate-600">{error || 'Unknown error occurred'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Calculations
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const platformStatus = (() => {
    const tested = data.features.filter(f => f.testing_status === 'passed').length;
    const documented = data.features.filter(f => f.documentation_status === 'documented').length;
    const testedPct = data.features.length > 0 ? (tested / data.features.length) * 100 : 0;
    const docPct = data.features.length > 0 ? (documented / data.features.length) * 100 : 0;
    return testedPct > 70 && docPct > 50 ? 'Healthy' : 'Needs Attention';
  })();

  const reviewQueueFeatures = data.features.filter(
    f => ['requested', 'in_review'].includes(f.product_review_status) ||
          ['awaiting_product_review', 'product_review'].includes(f.lifecycle_stage)
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const aiUsageToday = data.aiUsageLog.filter(log => log.created_at.startsWith(todayStr));
  const aiCostToday = aiUsageToday.reduce((sum, log) => sum + (log.estimated_cost_usd || 0), 0);

  const metrics = {
    totalFeatures: data.features.length,
    liveReleased: data.features.filter(f => ['live', 'released', 'ready_for_release'].includes(f.lifecycle_stage)).length,
    inDevelopment: data.features.filter(f => ['in_development', 'ai_development', 'approved_to_build'].includes(f.lifecycle_stage)).length,
    testing: data.features.filter(f => ['testing', 'development_complete'].includes(f.lifecycle_stage)).length,
    awaitingReview: reviewQueueFeatures.length,
    poAccepted: data.features.filter(f => f.product_review_status === 'approved').length,
    docCoverage: data.features.length > 0 ? Math.round((data.features.filter(f => f.documentation_status === 'documented').length / data.features.length) * 100) : 0,
    testCoverage: data.features.length > 0 ? Math.round((data.features.filter(f => f.testing_status === 'passed').length / data.features.length) * 100) : 0,
    complianceFeatures: data.features.filter(f => f.compliance_critical).length,
    productionReady: data.features.filter(f => f.production_ready).length,
    aiUsageToday: aiUsageToday.length,
    aiCostToday: aiCostToday.toFixed(2),
    activeRelease: data.releaseCandidates.find(rc => rc.is_active),
    currentPhase: data.devPhases.find(p => p.status === 'in_progress'),
  };

  const alerts = [];
  if (metrics.awaitingReview > 0) {
    alerts.push({ type: 'warning', text: `${metrics.awaitingReview} features awaiting product review` });
  }
  if (metrics.docCoverage < 60) {
    alerts.push({ type: 'warning', text: `Documentation coverage at ${metrics.docCoverage}% (below 60%)` });
  }
  const blockedFeatures = data.features.filter(f => f.testing_status === 'blocked');
  if (blockedFeatures.length > 0) {
    alerts.push({ type: 'critical', text: `${blockedFeatures.length} features blocked` });
  }
  if (alerts.length === 0) {
    alerts.push({ type: 'success', text: 'Platform is healthy' });
  }

  const handleQuickApprove = async (featureId: string) => {
    setApproving(featureId);
    try {
      const { error } = await supabase
        .from('ecc_product_features')
        .update({ product_review_status: 'approved' })
        .eq('id', featureId);
      if (error) throw error;
      setData(prev => prev ? {
        ...prev,
        features: prev.features.map(f => f.id === featureId ? { ...f, product_review_status: 'approved' } : f)
      } : null);
    } catch (err) {
      console.error('Failed to approve feature:', err);
    } finally {
      setApproving(null);
    }
  };

  const recommendations = [];
  if (metrics.awaitingReview > 0) {
    recommendations.push('Review Product Acceptance Queue');
  }
  if (metrics.docCoverage < 60) {
    recommendations.push('Improve Documentation Coverage');
  }
  if (data.features.some(f => f.testing_status === 'blocked')) {
    recommendations.push('Resolve Blocked Features');
  }
  if (recommendations.length === 0) {
    recommendations.push('Maintain momentum on active development');
  }

  const platformObservations = [];
  const undocumentedCount = data.features.filter(f => f.documentation_status !== 'complete').length;
  if (undocumentedCount > 0) platformObservations.push(`${undocumentedCount} features lack documentation`);
  const untested = data.features.filter(f => f.testing_status !== 'passed');
  if (untested.length > 0) platformObservations.push(`${untested.length} features have not been tested`);
  const complianceNotReady = data.features.filter(f => f.compliance_critical && !f.production_ready);
  if (complianceNotReady.length > 0) platformObservations.push(`${complianceNotReady.length} compliance features not production-ready`);

  const risksDetected = [];
  if (blockedFeatures.length > 0) {
    risksDetected.push(`${blockedFeatures.length} features are blocked`);
  }
  if (complianceNotReady.length > 0) {
    risksDetected.push(`${complianceNotReady.length} compliance-critical features not ready`);
  }

  const longestAwaitingReview = reviewQueueFeatures.sort((a, b) => {
    const aDate = new Date(a.updated_at || a.created_at).getTime();
    const bDate = new Date(b.updated_at || b.created_at).getTime();
    return aDate - bDate;
  })[0];

  const undocumentedByCategory = data.features
    .filter(f => f.documentation_status !== 'complete')
    .reduce((acc, f) => {
      acc[f.category] = (acc[f.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  const topUndocumentedCategory = Object.entries(undocumentedByCategory).sort((a, b) => b[1] - a[1])[0];

  const complianceCoverage = metrics.complianceFeatures > 0
    ? Math.round((data.features.filter(f => f.compliance_critical && f.production_ready).length / metrics.complianceFeatures) * 100)
    : 0;

  const recentlyUpdated = [...data.features].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 10);
  const mostActiveCategory = recentlyUpdated.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topActiveCategory = Object.entries(mostActiveCategory).sort((a, b) => b[1] - a[1])[0];

  const getMissingTestingCount = () => data.features.filter(f => !['passed', 'skipped'].includes(f.testing_status)).length;

  const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays}d ago`;
  };

  return (
    <div className="flex flex-col h-full">
      <MCTabBar tab={tab} onTab={setTab} />
      {tab === 'ai-director' && (
        <div className="flex-1 overflow-hidden">
          <CCAIProductManagerPage onNavigate={onNavigate} />
        </div>
      )}
      {tab === 'platform-overview' && (
        <div className="flex-1 overflow-auto bg-slate-50 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
        {/* Section 1: Executive Welcome Bar */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-600">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{getGreeting()}, Engineering Lead</h1>
              <p className="text-slate-600 mt-1">Platform Overview — {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div className="text-right">
              <div className="flex gap-3 justify-end mb-2">
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${platformStatus === 'Healthy' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {platformStatus}
                </span>
              </div>
              <p className="text-sm text-slate-600">Today's Priority:</p>
              <p className="text-sm font-semibold text-blue-600">{recommendations[0]}</p>
            </div>
          </div>
        </div>

        {/* Section 1b: Executive Intelligence — EPRE Recommendation */}
        <ExecutiveIntelligencePanel epreRec={epreRec} epreLoading={epreLoading} epreStale={epreStale} onNavigate={onNavigate} />

        {/* Section 2: Smart Notification Banner */}
        <div className="flex flex-wrap gap-2">
          {alerts.map((alert, idx) => {
            const bgColor = alert.type === 'critical' ? 'bg-red-100' : alert.type === 'warning' ? 'bg-amber-100' : 'bg-emerald-100';
            const textColor = alert.type === 'critical' ? 'text-red-800' : alert.type === 'warning' ? 'text-amber-800' : 'text-emerald-800';
            const Icon = alert.type === 'critical' ? AlertTriangle : alert.type === 'warning' ? AlertCircle : CheckCircle2;
            return (
              <div key={idx} className={`${bgColor} ${textColor} px-3 py-2 rounded-full text-sm font-medium flex items-center gap-2`}>
                <Icon className="w-4 h-4" />
                {alert.text}
              </div>
            );
          })}
        </div>

        {/* Section 3: Executive Health Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard icon={Target} label="Total Features" value={metrics.totalFeatures} color="blue" />
          <HealthCard icon={TrendingUp} label="Live / Released" value={metrics.liveReleased} color="emerald" />
          <HealthCard icon={Zap} label="In Development" value={metrics.inDevelopment} color="blue" />
          <HealthCard icon={Clock} label="Testing" value={metrics.testing} color="amber" />
          <HealthCard icon={Users} label="Awaiting PO Review" value={metrics.awaitingReview} color="amber" />
          <HealthCard icon={CheckCheck} label="PO Accepted" value={metrics.poAccepted} color="emerald" />
          <HealthCard icon={MessageSquare} label="Docs Coverage" value={`${metrics.docCoverage}%`} color="blue" />
          <HealthCard icon={BarChart3} label="Test Coverage" value={`${metrics.testCoverage}%`} color="emerald" />
          <HealthCard icon={AlertTriangle} label="Compliance Features" value={metrics.complianceFeatures} color="red" />
          <HealthCard icon={CheckCircle2} label="Production Ready" value={metrics.productionReady} color="emerald" />
          <HealthCard icon={Zap} label="AI Usage Today" value={metrics.aiUsageToday} color="purple" />
          <HealthCard icon={Gauge} label="AI Cost Today" value={`$${metrics.aiCostToday}`} color="slate" />
        </div>

        {/* Section 4: Product Review Queue */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Product Owner Review Queue — Your Daily Work Queue</h2>
          {reviewQueueFeatures.length === 0 ? (
            <div className="text-center py-12 bg-emerald-50 rounded-lg border-2 border-emerald-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
              <p className="text-emerald-800 font-semibold">Review queue is clear — all features are up to date.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Feature ID</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Priority</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Days Waiting</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Testing</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Docs</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewQueueFeatures.map(f => {
                    const daysWaiting = Math.floor((Date.now() - new Date(f.updated_at || f.created_at).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={f.id} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600">{f.feature_id}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{f.name}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-semibold ${f.priority === 'critical' ? 'bg-red-100 text-red-800' : f.priority === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'}`}>{f.priority || '—'}</span></td>
                        <td className="px-4 py-3 text-slate-600">{daysWaiting}d</td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-semibold ${f.testing_status === 'passed' ? 'bg-emerald-100 text-emerald-800' : f.testing_status === 'blocked' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{f.testing_status}</span></td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-semibold ${f.documentation_status === 'complete' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{f.documentation_status}</span></td>
                        <td className="px-4 py-3 flex gap-2">
                          <button onClick={() => onNavigate('features')} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700">Open</button>
                          <button onClick={() => handleQuickApprove(f.id)} disabled={approving === f.id} className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">{approving === f.id ? 'Approving...' : 'Approve'}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 5: AI Technical Director Panel */}
        <div className="bg-slate-900 rounded-lg shadow p-6 border-l-4 border-purple-500">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-bold text-white">AI Technical Director</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-purple-300 uppercase mb-3">Platform Observations</h3>
              <ul className="space-y-2">
                {platformObservations.length === 0 ? (
                  <li className="text-emerald-400 text-sm">All systems nominal</li>
                ) : (
                  platformObservations.map((obs, idx) => <li key={idx} className="text-slate-300 text-sm">• {obs}</li>)
                )}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-purple-300 uppercase mb-3">Current Priorities</h3>
              <ul className="space-y-2">
                {recommendations.slice(0, 3).map((rec, idx) => <li key={idx} className="text-slate-300 text-sm">• {rec}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-purple-300 uppercase mb-3">Risks Detected</h3>
              <ul className="space-y-2">
                {risksDetected.length === 0 ? (
                  <li className="text-emerald-400 text-sm">No critical risks</li>
                ) : (
                  risksDetected.map((risk, idx) => <li key={idx} className="text-red-400 text-sm">⚠ {risk}</li>)
                )}
              </ul>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-sm text-slate-400"><span className="font-semibold text-slate-300">Suggested Next Task:</span> {longestAwaitingReview ? `Review "${longestAwaitingReview.name}" (awaiting ${Math.floor((Date.now() - new Date(longestAwaitingReview.updated_at).getTime()) / (1000 * 60 * 60 * 24))}+ days)` : 'Monitor platform health and continue active development'}</p>
            <p className="text-xs text-slate-500 mt-2">Advisory only — AI Technical Director never makes changes automatically.</p>
          </div>
        </div>

        {/* Section 6: Activity Timeline */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {data.reviewHistory.length === 0 ? (
              <p className="text-slate-600">No recent activity</p>
            ) : (
              data.reviewHistory.map((event, idx) => (
                <div key={event.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <Activity className="w-5 h-5 text-blue-600" />
                    {idx < data.reviewHistory.length - 1 && <div className="w-0.5 h-8 bg-slate-200 mt-2" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">{event.action}</p>
                    <p className="text-xs text-slate-600">{event.actor} • {getRelativeTime(event.created_at)}</p>
                    {event.notes && <p className="text-xs text-slate-700 mt-1">{event.notes}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section 7: Platform Intelligence Insights */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Platform Intelligence Insights</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InsightCard icon={Lightbulb} label="Documentation Gap" value={topUndocumentedCategory ? `${topUndocumentedCategory[0]} (${topUndocumentedCategory[1]} items)` : '—'} color="amber" />
            <InsightCard icon={Clock} label="Features Missing Testing" value={getMissingTestingCount()} color="amber" />
            <InsightCard icon={AlertCircle} label="Longest Awaiting Review" value={longestAwaitingReview ? `${Math.floor((Date.now() - new Date(longestAwaitingReview.updated_at).getTime()) / (1000 * 60 * 60 * 24))}d` : '—'} color="red" />
            <InsightCard icon={AlertTriangle} label="Highest Priority Untested" value={data.features.filter(f => f.priority === 'critical' && f.testing_status !== 'passed').length} color="red" />
            <InsightCard icon={CheckCircle2} label="Compliance Coverage" value={`${complianceCoverage}%`} color="emerald" />
            <InsightCard icon={TrendingUp} label="Most Active Category" value={topActiveCategory ? topActiveCategory[0] : '—'} color="blue" />
          </div>
        </div>

        {/* Section 8: Engineering OS Overview */}
        <div className="bg-slate-900 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Engineering Operating System</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { layer: 1, label: 'Mission Control',    desc: 'Executive oversight',                icon: Gauge,  color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   active: true  },
              { layer: 2, label: 'Product Management', desc: 'Decide what to build',               icon: Layers, color: 'text-emerald-400', bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',active: false },
              { layer: 3, label: 'Engineering',        desc: 'Build, verify, release',             icon: GitBranch, color: 'text-amber-400', bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  active: false },
              { layer: 4, label: 'Platform Operations',desc: 'Operate the SaaS platform',         icon: Cpu,    color: 'text-orange-400',  bg: 'bg-orange-500/10', border: 'border-orange-500/30', active: false },
            ].map(({ layer, label, desc, icon: Icon, color, bg, border, active }) => (
              <div key={layer} className={`rounded-lg border px-3 py-2.5 ${bg} ${border} ${active ? 'ring-1 ring-blue-400/40' : ''}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] font-bold text-slate-500 bg-slate-800 px-1 rounded">L{layer}</span>
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                </div>
                <p className={`text-xs font-semibold ${active ? 'text-white' : 'text-slate-300'}`}>{label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { name: 'Product Owner',       icon: Users,   color: 'text-blue-400',   desc: 'Strategy, approvals, releases' },
              { name: 'AI Technical Director',icon: Bot,    color: 'text-emerald-400', desc: 'Architecture, build, documentation' },
              { name: 'Platform Operations', icon: Cpu,     color: 'text-orange-400',  desc: 'Infrastructure, AI providers, monitoring' },
            ].map(({ name, icon: Icon, color, desc }) => (
              <div key={name} className="bg-slate-800/60 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`w-3 h-3 ${color}`} />
                  <p className="text-[11px] font-semibold text-slate-300">{name}</p>
                </div>
                <p className="text-[10px] text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Section 9: Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            <ActionButton icon={ArrowRight} label="Engineering Workspace" onClick={() => onNavigate('features')} />
            <ActionButton icon={MessageSquare} label="Documentation" onClick={() => onNavigate('documentation')} />
            <ActionButton icon={GitBranch} label="Create Release" onClick={() => onNavigate('release-centre')} />
            <ActionButton icon={Bot} label="AI Technical Director" onClick={() => setTab('ai-director')} />
            <ActionButton icon={Target} label="Dev Programme" onClick={() => onNavigate('dev-programme')} />
            <ActionButton icon={Zap} label="AI Platform" onClick={() => onNavigate('ai-platform')} />
            <ActionButton icon={Lightbulb} label="Goals & Epics" onClick={() => onNavigate('ideas')} />
            <ActionButton icon={Shield} label="Platform Audits" onClick={() => onNavigate('audits')} />
            <ActionButton icon={Shield} label="Engineering Guardian" onClick={() => onNavigate('arch-guardian')} />
            <ActionButton icon={FlaskConical} label="Work Orders" onClick={() => onNavigate('work-orders')} />
            <ActionButton icon={Brain} label="Engineering Planning" onClick={() => onNavigate('engineering-planning')} />
          </div>
        </div>

        {/* Section 10: Roadmap Progress */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-3">Active Release Candidate</h3>
            {metrics.activeRelease ? (
              <div>
                <p className="text-2xl font-bold text-slate-900">{metrics.activeRelease.rc_number}</p>
                <p className="text-sm text-slate-600 mt-1">{metrics.activeRelease.phase_name}</p>
                <div className="mt-4 w-full bg-slate-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: '65%' }} />
                </div>
              </div>
            ) : (
              <p className="text-slate-600">No active release</p>
            )}
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-3">Current Dev Phase</h3>
            {metrics.currentPhase ? (
              <div>
                <p className="text-2xl font-bold text-slate-900">Phase {metrics.currentPhase.phase_number}</p>
                <p className="text-sm text-slate-600 mt-1">{metrics.currentPhase.name}</p>
                <div className="mt-4 w-full bg-slate-200 rounded-full h-2">
                  <div className="bg-emerald-600 h-2 rounded-full" style={{ width: '50%' }} />
                </div>
              </div>
            ) : (
              <p className="text-slate-600">No current phase</p>
            )}
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-3">Goal Progress</h3>
            <p className="text-2xl font-bold text-slate-900">{data.goals.filter(g => g.status === 'completed').length} / {data.goals.length}</p>
            <p className="text-sm text-slate-600 mt-1">Goals completed</p>
            <div className="mt-4 w-full bg-slate-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: data.goals.length > 0 ? `${(data.goals.filter(g => g.status === 'completed').length / data.goals.length) * 100}%` : '0%' }} />
            </div>
          </div>
        </div>

        {/* Section 11: Latest Platform Audit */}
        <div className="bg-white rounded-lg shadow p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-slate-600" />
              <h2 className="text-xl font-bold text-slate-900">Latest Platform Audit</h2>
            </div>
            <button
              onClick={() => onNavigate('audits')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              View All Audits
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {data.latestAudit ? (
            <div className="grid md:grid-cols-3 gap-4">
              {/* Audit summary card */}
              <div className="md:col-span-2 bg-slate-50 rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs font-mono text-slate-400 mb-1">{data.latestAudit.audit_number}</p>
                    <p className="text-base font-semibold text-slate-800">{data.latestAudit.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{new Date(data.latestAudit.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  {data.latestAudit.overall_health_score !== null && (
                    <div className="text-center shrink-0">
                      <p className={`text-3xl font-bold ${data.latestAudit.overall_health_score >= 80 ? 'text-emerald-600' : data.latestAudit.overall_health_score >= 60 ? 'text-teal-600' : data.latestAudit.overall_health_score >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                        {data.latestAudit.overall_health_score}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">/ 100</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    data.latestAudit.status === 'closed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    data.latestAudit.status === 'reviewed' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    data.latestAudit.status === 'actions_in_progress' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                    'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      data.latestAudit.status === 'closed' ? 'bg-emerald-500' :
                      data.latestAudit.status === 'reviewed' ? 'bg-blue-500' :
                      data.latestAudit.status === 'actions_in_progress' ? 'bg-orange-400' :
                      'bg-slate-400'
                    }`} />
                    {data.latestAudit.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                </div>
              </div>

              {/* Findings badge */}
              <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 flex flex-col justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Critical + High</p>
                {(data.latestAudit.critical_findings_count ?? 0) + (data.latestAudit.high_findings_count ?? 0) > 0 ? (
                  <>
                    <p className="text-4xl font-bold text-red-600">
                      {(data.latestAudit.critical_findings_count ?? 0) + (data.latestAudit.high_findings_count ?? 0)}
                    </p>
                    <p className="text-xs text-red-600 font-medium mt-1">findings requiring attention</p>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 my-1" />
                    <p className="text-xs text-emerald-700 font-medium">No critical or high findings</p>
                  </>
                )}
                <button
                  onClick={() => onNavigate('audits')}
                  className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                >
                  Open Audit <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-8 text-center">
              <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600 mb-1">No audits generated yet</p>
              <p className="text-xs text-slate-400 mb-4">Generate your first platform audit to see a comprehensive health assessment here.</p>
              <button
                onClick={() => onNavigate('audits')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                Generate First Audit
              </button>
            </div>
          )}
        </div>

        {/* Section 12: Engineering Health */}
        <div className="bg-white rounded-lg shadow p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-slate-600" />
              <h2 className="text-xl font-bold text-slate-900">Engineering Health</h2>
              <span className="text-xs text-slate-400 font-normal">— Latest Guardian Review</span>
            </div>
            <button
              onClick={() => onNavigate('arch-guardian')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Open Engineering Guardian
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {data.guardianHealth ? (() => {
            const gh = data.guardianHealth;
            const score = gh.engineering_health_score ?? 0;
            const scoreColor = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-teal-600' : score >= 40 ? 'text-amber-600' : 'text-red-600';
            const scoreBg = score >= 80 ? 'bg-emerald-50 border-emerald-200' : score >= 60 ? 'bg-teal-50 border-teal-200' : score >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
            const statusColor = gh.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-800' : gh.approval_status === 'approved_with_warnings' ? 'bg-amber-100 text-amber-800' : gh.approval_status === 'blocked' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700';
            const scores = [
              { label: 'Maintainability', value: gh.maintainability_score },
              { label: 'Tech Debt',       value: gh.technical_debt_score  },
              { label: 'Complexity',      value: gh.complexity_score      },
              { label: 'MC Compliance',   value: gh.mc_compliance_score   },
            ];
            return (
              <div className="grid md:grid-cols-3 gap-4">
                {/* Health score */}
                <div className={`rounded-lg border p-5 flex flex-col items-center justify-center ${scoreBg}`}>
                  <Heart className={`w-6 h-6 ${scoreColor} mb-2`} />
                  <p className={`text-5xl font-bold ${scoreColor}`}>{score}</p>
                  <p className="text-xs text-slate-500 mt-1 font-medium">Engineering Health / 100</p>
                  {gh.approval_status && (
                    <span className={`mt-3 px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor}`}>
                      {gh.approval_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                  )}
                  <p className="text-[10px] text-slate-400 mt-2">{new Date(gh.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>

                {/* Score breakdown */}
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Score Breakdown</p>
                  <div className="space-y-2.5">
                    {scores.map(({ label, value }) => {
                      const v = value ?? 0;
                      const barColor = v >= 80 ? 'bg-emerald-500' : v >= 60 ? 'bg-teal-500' : v >= 40 ? 'bg-amber-500' : 'bg-red-500';
                      return (
                        <div key={label}>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs text-slate-600">{label}</span>
                            <span className="text-xs font-semibold text-slate-800">{value !== null ? value : '—'}</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5">
                            <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${v}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Issues */}
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 flex flex-col justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Open Issues</p>
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Security</span>
                      <span className={`text-lg font-bold ${(gh.security_issues ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{gh.security_issues ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Performance</span>
                      <span className={`text-lg font-bold ${(gh.performance_issues ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{gh.performance_issues ?? 0}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate('arch-guardian')}
                    className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                  >
                    View Full Review <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })() : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-8 text-center">
              <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600 mb-1">No guardian review yet</p>
              <p className="text-xs text-slate-400 mb-4">Run your first Engineering Guardian review to see engineering health metrics here.</p>
              <button
                onClick={() => onNavigate('arch-guardian')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Open Engineering Guardian
              </button>
            </div>
          )}
        </div>

        {/* TP-001 Release Validation */}
        <div className="bg-white rounded-lg shadow p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-slate-600" />
              <h2 className="text-xl font-bold text-slate-900">TP-001 — Core Platform Validation</h2>
              <span className="text-xs text-slate-400 font-normal">— Latest Execution</span>
            </div>
            <button
              onClick={() => onNavigate('qa-testing')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Open TP-001
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <TP001MissionWidget />
        </div>

        {/* Section 13: Platform Governance */}
        <div className="bg-white rounded-lg shadow p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-slate-600" />
              <h2 className="text-xl font-bold text-slate-900">Platform Governance</h2>
              <span className="text-xs text-slate-400 font-normal">— EOCPS-001</span>
            </div>
            <button
              onClick={() => onNavigate('governance-overview')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Open Governance
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Engineering Standards', route: 'engineering-standards', live: true  },
              { label: 'Constitution',           route: 'constitution',          live: true  },
              { label: 'Classification Reviews', route: 'ecr-reviews',           live: false },
              { label: 'Capability Registry',    route: 'capability-registry',   live: false },
              { label: 'SPC Registry',           route: 'spc-registry',          live: false },
              { label: 'Ownership Lineage',      route: 'ownership-lineage',     live: false },
            ].map(({ label, route, live }) => (
              <button
                key={route}
                onClick={() => onNavigate(route)}
                className="flex items-center justify-between gap-2 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-left hover:border-slate-300 hover:bg-white transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{live ? 'Live' : 'EWO-014'}</p>
                </div>
                {live
                  ? <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  : <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                }
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <FlaskConical className="w-4 h-4 text-slate-400 shrink-0" />
            <p className="text-xs text-slate-500">
              <strong className="text-slate-700">Governance metrics</strong> — ownership coverage, ECR velocity, and SPC adoption — will be available after EWO-014.
            </p>
          </div>
        </div>

      </div>
        </div>
      )}
    </div>
  );
}

// ─── Executive Intelligence Panel ────────────────────────────────────────────

function ExecutiveIntelligencePanel({ epreRec, epreLoading, epreStale, onNavigate }: { epreRec: EpreRec | null; epreLoading: boolean; epreStale: boolean; onNavigate: (s: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  if (epreLoading && !epreRec) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Executive Intelligence</h2>
            <p className="text-xs text-slate-400">Engineering Planning & Recommendation Engine</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-400">Loading...</span>
          </div>
        </div>
        <div className="space-y-3 animate-pulse">
          <div className="h-16 bg-slate-800/80 rounded-lg" />
          <div className="grid grid-cols-4 gap-0">
            {[0,1,2,3].map(i => <div key={i} className="h-14 bg-slate-800/60 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!epreLoading && !epreRec) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Executive Intelligence</h2>
            <p className="text-xs text-slate-400">Engineering Planning & Recommendation Engine</p>
          </div>
          <div className="ml-auto">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-400">No Analysis Yet</span>
          </div>
        </div>
        <div className="bg-slate-800/60 rounded-lg border border-dashed border-slate-600 p-6 text-center">
          <Sparkles className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-400 mb-1">No recommendation available</p>
          <p className="text-xs text-slate-500 mb-4">Run the Engineering Planning & Recommendation Engine to see your next recommended work order here.</p>
          <button
            onClick={() => onNavigate('engineering-planning')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <Brain className="w-3.5 h-3.5" />
            Open Engineering Planning
          </button>
        </div>
      </div>
    );
  }

  const rec = epreRec;
  const topEwo = rec.scored_programme?.[0] ?? null;
  const priority = topEwo?.priority ?? 'medium';

  const priorityCfg: Record<string, { pill: string; badge: string; glow: string; accent: string }> = {
    critical: { pill: 'bg-red-500/20 text-red-300 border-red-500/30', badge: 'bg-red-500 text-white', glow: 'shadow-red-500/10', accent: 'border-l-red-500' },
    high:     { pill: 'bg-amber-500/20 text-amber-300 border-amber-500/30', badge: 'bg-amber-500 text-white', glow: 'shadow-amber-500/10', accent: 'border-l-amber-500' },
    medium:   { pill: 'bg-blue-500/20 text-blue-300 border-blue-500/30', badge: 'bg-blue-500 text-white', glow: 'shadow-blue-500/10', accent: 'border-l-blue-500' },
    low:      { pill: 'bg-slate-500/20 text-slate-300 border-slate-500/30', badge: 'bg-slate-500 text-white', glow: 'shadow-slate-500/10', accent: 'border-l-slate-400' },
  };
  const cfg = priorityCfg[priority] ?? priorityCfg.medium;

  const healthScore = rec.programme_health_score ?? 0;
  const healthColor = healthScore >= 80 ? 'text-emerald-400' : healthScore >= 60 ? 'text-teal-400' : healthScore >= 40 ? 'text-amber-400' : 'text-red-400';
  const healthBg = healthScore >= 80 ? 'bg-emerald-500/10' : healthScore >= 60 ? 'bg-teal-500/10' : healthScore >= 40 ? 'bg-amber-500/10' : 'bg-red-500/10';
  const healthBorder = healthScore >= 80 ? 'border-emerald-500/20' : healthScore >= 60 ? 'border-teal-500/20' : healthScore >= 40 ? 'border-amber-500/20' : 'border-red-500/20';

  const runAt = new Date(rec.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl border border-slate-700 shadow-2xl ${cfg.glow} overflow-hidden`}>
      {/* Header */}
      <div className={`border-l-4 ${cfg.accent} px-6 pt-5 pb-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
              <Brain className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-lg font-bold text-white">Executive Intelligence</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">EPRE</span>
              </div>
              <p className="text-xs text-slate-400">Engineering Planning & Recommendation Engine · Run {rec.run_ref} · {runAt}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {epreStale && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-700 text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Updating...
              </span>
            )}
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.pill} capitalize`}>{priority}</span>
            <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg border ${healthBg} ${healthBorder}`}>
              <span className={`text-lg font-bold leading-none ${healthColor}`}>{healthScore}</span>
              <span className="text-[9px] text-slate-500 font-medium mt-0.5">HEALTH</span>
            </div>
          </div>
        </div>
      </div>

      {/* What should I do next? */}
      <div className="px-6 py-4 border-b border-slate-700/60">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">What should I do next?</p>
        {rec.recommended_ewo_ref ? (
          <div className="flex items-start gap-3">
            <div className={`shrink-0 px-2 py-1 rounded text-xs font-bold ${cfg.badge} font-mono`}>{rec.recommended_ewo_ref}</div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-white leading-tight">{rec.recommended_ewo_title ?? '—'}</p>
              {topEwo?.executive_summary && (
                <p className="text-sm text-slate-300 mt-1 leading-relaxed">{topEwo.executive_summary}</p>
              )}
            </div>
            {rec.recommended_score !== null && (
              <div className="shrink-0 text-right">
                <p className="text-2xl font-bold text-white">{rec.recommended_score}</p>
                <p className="text-[10px] text-slate-500">score</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-slate-400 text-sm">No actionable EWO identified at this time.</p>
        )}
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-slate-700/60 border-b border-slate-700/60">
        {[
          { label: 'Effort', value: topEwo?.estimated_effort ?? '—', icon: Clock },
          { label: 'Risk', value: topEwo?.risk_level ?? '—', icon: AlertTriangle },
          { label: 'Velocity', value: rec.programme_velocity !== null ? `${rec.programme_velocity}/mo` : '—', icon: TrendingUp },
          { label: 'Blocked', value: rec.blocked_count ?? 0, icon: AlertCircle },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="px-4 py-3 flex items-center gap-2.5">
            <Icon className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-500 font-medium uppercase">{label}</p>
              <p className="text-sm font-bold text-slate-200 capitalize">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Reasoning (expandable) */}
      {(rec.recommended_reason || topEwo?.reasoning) && (
        <div className="px-6 py-3 border-b border-slate-700/60">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors w-full text-left"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            Recommendation Reasoning
            {expanded ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
          </button>
          {expanded && (
            <div className="mt-3 bg-slate-800/60 rounded-lg border border-slate-700 p-4">
              <p className="text-sm text-slate-300 leading-relaxed">{rec.recommended_reason ?? topEwo?.reasoning}</p>
              {topEwo?.business_value && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Business Value</p>
                  <p className="text-sm text-slate-300">{topEwo.business_value}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Programme summary row */}
      <div className="px-6 py-3 border-b border-slate-700/60">
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'In Progress', value: rec.in_progress_count ?? 0, color: 'text-blue-400' },
            { label: 'Ready to Start', value: rec.ready_count ?? 0, color: 'text-emerald-400' },
            { label: 'Blocked', value: rec.blocked_count ?? 0, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`text-sm font-bold ${color}`}>{value}</span>
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
          <div className="h-4 w-px bg-slate-700 self-center" />
          <p className="text-xs text-slate-500">Run {rec.run_ref}</p>
        </div>
      </div>

      {/* Executive actions */}
      <div className="px-6 py-4 flex flex-wrap gap-2">
        <button
          onClick={() => onNavigate('engineering-planning')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          <Brain className="w-3.5 h-3.5" />
          View Planning Analysis
        </button>
        <button
          onClick={() => onNavigate('work-orders')}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          View Work Orders
        </button>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
          <Sparkles className="w-3.5 h-3.5 text-slate-600" />
          Advisory only — executive must approve
        </div>
      </div>
    </div>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

function MCTabBar({ tab, onTab }: { tab: MCTab; onTab: (t: MCTab) => void }) {
  return (
    <div className="shrink-0 bg-white border-b border-slate-200 px-6">
      <div className="flex gap-1">
        {MC_TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HealthCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; color: string }) {
  const colorClasses = {
    blue: 'border-blue-200 bg-blue-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
    red: 'border-red-200 bg-red-50',
    purple: 'border-purple-200 bg-purple-50',
    slate: 'border-slate-200 bg-slate-50',
  };
  const iconClasses = {
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    purple: 'text-purple-600',
    slate: 'text-slate-600',
  };
  return (
    <div className={`rounded-lg p-4 border-2 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <Icon className={`w-8 h-8 ${iconClasses[color as keyof typeof iconClasses]}`} />
      </div>
    </div>
  );
}

function InsightCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; color: string }) {
  const colorClasses = {
    blue: 'border-blue-200 bg-blue-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
    red: 'border-red-200 bg-red-50',
    purple: 'border-purple-200 bg-purple-50',
    slate: 'border-slate-200 bg-slate-50',
  };
  const iconClasses = {
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    purple: 'text-purple-600',
    slate: 'text-slate-600',
  };
  return (
    <div className={`rounded-lg p-4 border-2 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-slate-600 font-medium">{label}</p>
          <p className="text-lg font-bold text-slate-900 mt-2">{value}</p>
        </div>
        <Icon className={`w-6 h-6 ${iconClasses[color as keyof typeof iconClasses]} flex-shrink-0`} />
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, disabled, badge }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; disabled?: boolean; badge?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 p-3 rounded-lg font-semibold text-sm transition ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      {badge && <span className="text-xs bg-slate-300 text-slate-700 px-2 py-0.5 rounded ml-1">{badge}</span>}
    </button>
  );
}
