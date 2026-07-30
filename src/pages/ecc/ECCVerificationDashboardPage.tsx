import { useEffect, useState } from 'react';
import {
  type VerificationDashboardSummary,
  getVerificationDashboardSummary,
  getPlatformCoverage,
  type PlatformCoverageEntry,
} from '../../lib/verificationFrameworkService';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock, Loader2,
  TrendingUp, Workflow, Activity, Award, BarChart3, Layers, Info,
} from 'lucide-react';

export function ECCVerificationDashboardPage() {
  const [summary, setSummary] = useState<VerificationDashboardSummary | null>(null);
  const [coverage, setCoverage] = useState<PlatformCoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [s, c] = await Promise.all([
        getVerificationDashboardSummary(),
        getPlatformCoverage(),
      ]);
      if (active) {
        setSummary(s);
        setCoverage(c);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  if (loading || !summary) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const confidenceEntries = (Object.entries(summary.confidenceBreakdown) as [string, number][])
    .filter(([, n]) => n > 0);

  const coverageColor = (p: number) =>
    p >= 90 ? 'bg-emerald-500' :
    p >= 75 ? 'bg-blue-500' :
    p >= 50 ? 'bg-amber-500' :
    'bg-red-500';

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Engineering Verification Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Governed by ES-VER-001 and CONST-001-AMD-006 / CONST-001-AMD-007 · EWO-014.18R
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Verification Coverage</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{pct(summary.verificationCoverage)}</p>
          <p className="text-[11px] text-slate-400 mt-1">EWOs with ≥1 matrix row</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Workflow className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Workflow Coverage</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{pct(summary.workflowCoverage)}</p>
          <p className="text-[11px] text-slate-400 mt-1">EWOs with a defined PO workflow</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pending PO Tests</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{summary.pendingPOTests}</p>
          <p className="text-[11px] text-slate-400 mt-1">EWOs awaiting PO verification</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Failed Workflows</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{summary.failedWorkflows}</p>
          <p className="text-[11px] text-slate-400 mt-1">EWOs with a failed PO workflow</p>
        </div>
      </div>

      {/* Platform Verification Coverage */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-800">Platform Verification Coverage</h2>
        </div>
        <div className="space-y-3">
          {coverage.length === 0 ? (
            <p className="text-xs text-slate-400">No platform coverage data available.</p>
          ) : (
            coverage.map(c => (
              <div key={c.id} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">{c.capability}</p>
                    {c.description && <p className="text-[11px] text-slate-400 truncate">{c.description}</p>}
                  </div>
                  <span className="text-sm font-bold text-slate-900 shrink-0">{Number(c.coverage_pct).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${coverageColor(Number(c.coverage_pct))} transition-all duration-500`}
                    style={{ width: `${c.coverage_pct}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Confidence breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-800">Engineering Confidence Breakdown</h2>
        </div>
        <div className="space-y-2.5">
          {confidenceEntries.length === 0 ? (
            <p className="text-xs text-slate-400">No confidence data recorded.</p>
          ) : (
            confidenceEntries.map(([level, count]) => {
              const total = summary.totalEWOs || 1;
              const ratio = count / total;
              const colors: Record<string, string> = {
                unknown: 'bg-slate-300',
                low: 'bg-red-400',
                medium: 'bg-amber-400',
                high: 'bg-blue-400',
                verified: 'bg-emerald-500',
              };
              return (
                <div key={level} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-600 w-20 capitalize">{level}</span>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors[level] ?? 'bg-slate-300'} transition-all duration-500`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-8 text-right">{count}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Recently Verified EWOs */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-800">Recently Verified EWOs</h2>
        </div>
        {summary.recentlyVerified.length === 0 ? (
          <div className="text-center py-6">
            <Activity className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No EWOs have completed Product Owner verification yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {summary.recentlyVerified.map((rv, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{rv.title}</p>
                  <p className="text-[11px] text-slate-400">{rv.ewo_ref}</p>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {rv.verified_at ? new Date(rv.verified_at).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                  }) : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-slate-400">
          Total Engineering Work Orders (non-archived): <span className="font-semibold text-slate-600">{summary.totalEWOs}</span>
        </p>
        <p className="text-[11px] text-slate-400">
          Passing automated tests alone never implies Product Owner verification.
        </p>
      </div>
    </div>
  );
}
