// EWO-017 Req 14 — Execution Dashboard
// Live dashboard showing execution metrics and throughput.

import { useState, useEffect, useCallback } from 'react';
import {
  Zap, Clock, CheckCircle2, XCircle, AlertCircle, Loader2,
  TrendingUp, RotateCcw, Activity, Layers, Timer, Gauge,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buildExecutionWorkspaceRoute, navigateToExecutionWorkspace } from '../../lib/engineeringNavigationService';

interface DashboardStats {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  avgDuration: number;
  verificationSuccessRate: number;
  deploymentSuccessRate: number;
  rollbackEvents: number;
  throughput: number;
  totalExecutions: number;
}

interface SessionRow {
  id: string;
  session_ref: string;
  execution_ref: string | null;
  current_stage: string;
  stage_status: string;
  started_at: string;
  completed_at: string | null;
  failure_reason: string | null;
}

export function ECCExecutionDashboardPage({ onSelectExecution }: { onSelectExecution?: (ref: string) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [execData, sessionData, deployData] = await Promise.all([
        supabase.from('engineering_executions').select('implementation_status, duration_seconds, verification_results, created_at'),
        supabase.from('execution_sessions').select('id, session_ref, execution_id, current_stage, stage_status, started_at, completed_at, failure_reason, engineering_executions!inner(execution_ref)').order('created_at', { ascending: false }).limit(20),
        supabase.from('execution_deployments').select('status, environment'),
      ]);

      const rows = execData.data ?? [];
      const total = rows.length;

      const queued = rows.filter((r: { implementation_status: string }) => ['draft', 'prepared', 'submitted'].includes(r.implementation_status)).length;
      const running = rows.filter((r: { implementation_status: string }) => r.implementation_status === 'running').length;
      const completed = rows.filter((r: { implementation_status: string }) => ['po_accepted', 'released', 'archived'].includes(r.implementation_status)).length;
      const failed = rows.filter((r: { implementation_status: string }) => ['failed', 'cancelled'].includes(r.implementation_status)).length;

      const durations = rows.filter((r: { duration_seconds: number | null }) => r.duration_seconds).map((r: { duration_seconds: number | null }) => r.duration_seconds!);
      const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length) : 0;

      const verified = rows.filter((r: { verification_results: Record<string, unknown> | null }) => r.verification_results);
      const verPassed = verified.filter((r: { verification_results: { build_verified?: boolean; constitutional_verified?: boolean } | null }) => r.verification_results?.constitutional_verified).length;
      const verificationSuccessRate = verified.length > 0 ? Math.round((verPassed / verified.length) * 100) : 100;

      const deploys = deployData.data ?? [];
      const healthyDeploys = deploys.filter((d: { status: string }) => d.status === 'healthy').length;
      const deploymentSuccessRate = deploys.length > 0 ? Math.round((healthyDeploys / deploys.length) * 100) : 100;
      const rollbackEvents = deploys.filter((d: { status: string }) => d.status === 'rolled_back').length;

      // Throughput: completed in last 24h
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recentCompleted = rows.filter((r: { implementation_status: string; created_at: string }) =>
        ['po_accepted', 'released', 'archived'].includes(r.implementation_status) && r.created_at > oneDayAgo
      ).length;

      setStats({
        queued, running, completed, failed, avgDuration,
        verificationSuccessRate, deploymentSuccessRate, rollbackEvents,
        throughput: recentCompleted, totalExecutions: total,
      });
      setSessions((sessionData.data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        session_ref: r.session_ref as string,
        execution_ref: (r.engineering_executions as { execution_ref: string } | null)?.execution_ref ?? null,
        current_stage: r.current_stage as string,
        stage_status: r.stage_status as string,
        started_at: r.started_at as string,
        completed_at: r.completed_at as string | null,
        failure_reason: r.failure_reason as string | null,
      })) as SessionRow[]);
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); const interval = setInterval(load, 30000); return () => clearInterval(interval); }, [load]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Zap className="w-7 h-7 text-primary-600" />
            Execution Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">Live engineering execution metrics and throughput</p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard icon={Clock} label="Queued" value={stats.queued} colour="text-blue-700 bg-blue-50" />
          <MetricCard icon={Loader2} label="Running" value={stats.running} colour="text-amber-700 bg-amber-50" />
          <MetricCard icon={CheckCircle2} label="Completed" value={stats.completed} colour="text-emerald-700 bg-emerald-50" />
          <MetricCard icon={XCircle} label="Failed" value={stats.failed} colour="text-red-700 bg-red-50" />
          <MetricCard icon={Layers} label="Total" value={stats.totalExecutions} colour="text-slate-700 bg-slate-50" />
        </div>
      )}

      {/* Success Rates & Throughput */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <RateCard icon={Gauge} label="Verification Success Rate" value={`${stats.verificationSuccessRate}%`} colour={stats.verificationSuccessRate === 100 ? 'text-emerald-600' : 'text-amber-600'} />
          <RateCard icon={TrendingUp} label="Deployment Success Rate" value={`${stats.deploymentSuccessRate}%`} colour={stats.deploymentSuccessRate === 100 ? 'text-emerald-600' : 'text-amber-600'} />
          <RateCard icon={RotateCcw} label="Rollback Events" value={stats.rollbackEvents.toString()} colour={stats.rollbackEvents === 0 ? 'text-emerald-600' : 'text-red-600'} />
          <RateCard icon={Activity} label="Throughput (24h)" value={`${stats.throughput} execs`} colour="text-primary-600" />
        </div>
      )}

      {stats && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Timer className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Average Execution Duration</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.avgDuration > 0 ? `${stats.avgDuration}s` : '—'}</p>
        </div>
      )}

      {/* Recent Sessions */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-400" />
            Recent Execution Sessions
          </h2>
        </div>
        {sessions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No execution sessions yet. Run an EWO through the orchestrator to see activity here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-2 font-semibold">Session</th>
                  <th className="text-left px-4 py-2 font-semibold">Stage</th>
                  <th className="text-left px-4 py-2 font-semibold">Status</th>
                  <th className="text-left px-4 py-2 font-semibold">Started</th>
                  <th className="text-left px-4 py-2 font-semibold">Completed</th>
                  <th className="text-left px-4 py-2 font-semibold">Failure</th>
                  <th className="text-left px-4 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => {
                    if (s.execution_ref) navigateToExecutionWorkspace(s.execution_ref);
                  }}>
                    <td className="px-6 py-2 text-xs font-mono text-slate-600">{s.session_ref}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">{s.current_stage?.replace(/_/g, ' ') ?? '—'}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={s.stage_status} />
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{new Date(s.started_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{s.completed_at ? new Date(s.completed_at).toLocaleString() : '—'}</td>
                    <td className="px-4 py-2 text-xs text-red-500 max-w-xs truncate">{s.failure_reason ?? '—'}</td>
                    <td className="px-4 py-2">
                      {s.execution_ref && (
                        <button
                          onClick={(e) => { e.stopPropagation(); if (s.execution_ref) navigateToExecutionWorkspace(s.execution_ref); }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >View</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, colour }: { icon: typeof Clock; label: string; value: number; colour: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${colour} mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function RateCard({ icon: Icon, label, value, colour }: { icon: typeof Clock; label: string; value: string; colour: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-slate-400" />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${colour}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600',
    running: 'bg-amber-100 text-amber-700',
    complete: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    skipped: 'bg-slate-100 text-slate-400',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colours[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}
