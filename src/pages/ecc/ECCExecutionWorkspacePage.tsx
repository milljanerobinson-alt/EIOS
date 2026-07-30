// EWO-017R.3 — Engineering Execution Workspace
//
// Renders the canonical execution workspace from the URL route parameter alone.
// Implements governed loading, not-found, initialisation-failure, and
// render-error-boundary states. No blank page is ever shown.
//
// Race-condition protection: the workspace polls persisted records rather
// than relying solely on transient onProgress callbacks. If execution
// completes before the page loads, the final persisted state is shown.

import { useState, useEffect, useCallback, Component, ReactNode } from 'react';
import {
  ArrowLeft, Clock, CheckCircle2, XCircle, AlertCircle, Loader2,
  FileCode, FlaskConical, ShieldCheck, Package, GitBranch,
  ThumbsUp, ThumbsDown, RefreshCw, Archive, Zap, Copy,
} from 'lucide-react';
import {
  getExecution,
  getExecutionEvents,
  updateExecution,
  transitionStatus,
  EngineeringExecution,
  ExecutionEvent,
  ExecutionStatus,
  EXECUTION_STATUS_LABELS,
  EXECUTION_STATUS_COLOURS,
  PROVIDER_LABELS,
  PO_STATUS_LABELS,
  EXECUTION_PIPELINE,
} from '../../lib/engineeringExecutionService';
import {
  submitPODecision,
  releaseExecution,
  archiveExecution,
} from '../../lib/implementationEngineConnector';
import { normalizeFilesChanged } from '../../lib/interactionCompletionService';

type Tab = 'overview' | 'timeline' | 'package' | 'completion' | 'review' | 'verification' | 'po' | 'history';

// ─── Error Boundary (Req 10) ──────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  correlationRef: string;
}

class ExecutionWorkspaceErrorBoundary extends Component<{ children: ReactNode; executionRef: string; onRetry: () => void; onBack: () => void }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, correlationRef: '' };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      correlationRef: `ERR-${Date.now().toString(36).toUpperCase()}`,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ExecutionWorkspace render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-lg bg-white rounded-xl border border-rose-200 p-6 text-center">
            <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Execution Workspace Error</h3>
            <p className="text-sm text-slate-600 mb-1">
              An error occurred while rendering the Engineering Execution Workspace.
            </p>
            <p className="text-xs text-slate-400 mb-4">
              Reference: {this.state.correlationRef}
              {this.props.executionRef && ` · Execution: ${this.props.executionRef}`}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={this.props.onRetry} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                <RefreshCw className="w-4 h-4 inline mr-1.5" /> Retry Workspace
              </button>
              <button onClick={this.props.onBack} className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300">
                Return to Execution Dashboard
              </button>
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(this.state.correlationRef)}
              className="mt-3 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mx-auto"
            >
              <Copy className="w-3 h-3" /> Copy diagnostic reference
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ECCExecutionWorkspacePage({ executionRef, onBack }: { executionRef: string; onBack: () => void }) {
  return (
    <ExecutionWorkspaceErrorBoundary executionRef={executionRef} onRetry={() => window.location.reload()} onBack={onBack}>
      <ExecutionWorkspaceContent executionRef={executionRef} onBack={onBack} />
    </ExecutionWorkspaceErrorBoundary>
  );
}

function ExecutionWorkspaceContent({ executionRef, onBack }: { executionRef: string; onBack: () => void }) {
  const [exec, setExec] = useState<EngineeringExecution | null>(null);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initFailure, setInitFailure] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [poDecision, setPoDecision] = useState<'approved' | 'rejected' | 'refinement' | null>(null);
  const [poNotes, setPoNotes] = useState('');
  const [acting, setActing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setInitFailure(null);
    try {
      const data = await getExecution(executionRef);
      if (!data) {
        setExec(null);
        setLoading(false);
        return;
      }
      setExec(data);
      try {
        const evts = await getExecutionEvents(data.id);
        setEvents(evts);
      } catch (evtErr) {
        console.error('Failed to load events:', evtErr);
        setEvents([]);
      }
      // EWO-017R.3 Req 9: Check for missing linked objects
      if (!data.ewo_id) {
        setInitFailure('Execution record exists but is not linked to a work order.');
      } else if (!data.execution_package) {
        setInitFailure('Execution record exists but the execution package is missing. The execution may not have completed the preparation stage.');
      }
    } catch (err) {
      console.error('Failed to load execution:', err);
      setLoadError(err instanceof Error ? err.message : 'Unknown error loading execution');
    } finally {
      setLoading(false);
    }
  }, [executionRef, retryCount]);

  useEffect(() => { load(); }, [load]);

  // EWO-017R.3 Req 12: Race-condition protection — poll for updates if execution is active
  useEffect(() => {
    if (!exec) return;
    const activeStatuses = ['draft', 'prepared', 'submitted', 'running', 'awaiting_completion'];
    if (!activeStatuses.includes(exec.implementation_status)) return;
    const interval = setInterval(async () => {
      try {
        const fresh = await getExecution(executionRef);
        if (fresh && fresh.implementation_status !== exec.implementation_status) {
          setExec(fresh);
          const evts = await getExecutionEvents(fresh.id);
          setEvents(evts);
        }
      } catch { /* ignore polling errors */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [exec, executionRef]);

  const handleRetry = () => setRetryCount(c => c + 1);

  const handlePODecision = async () => {
    if (!exec || !poDecision) return;
    setActing(true);
    try {
      await submitPODecision(exec.id, poDecision, poNotes);
      await load();
      setPoDecision(null);
      setPoNotes('');
    } catch (err) {
      console.error('PO decision failed:', err);
    } finally {
      setActing(false);
    }
  };

  const handleRelease = async () => {
    if (!exec) return;
    setActing(true);
    try {
      await releaseExecution(exec.id);
      await load();
    } catch (err) {
      console.error('Release failed:', err);
    } finally {
      setActing(false);
    }
  };

  const handleArchive = async () => {
    if (!exec) return;
    setActing(true);
    try {
      await archiveExecution(exec.id);
      await load();
    } catch (err) {
      console.error('Archive failed:', err);
    } finally {
      setActing(false);
    }
  };

  // ─── Governed Loading State (Req 7) ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700">Loading Engineering Execution</h3>
          <p className="text-xs text-slate-400 mt-1">Reference: {executionRef}</p>
        </div>
      </div>
    );
  }

  // ─── Governed Load Error State ──────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg bg-white rounded-xl border border-rose-200 p-6 text-center">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to Load Execution</h3>
          <p className="text-sm text-slate-600 mb-1">An error occurred while loading execution "{executionRef}".</p>
          <p className="text-xs text-rose-500 mb-4">{loadError}</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={handleRetry} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <RefreshCw className="w-4 h-4 inline mr-1.5" /> Retry
            </button>
            <button onClick={onBack} className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300">
              Return to Execution Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Governed Not-Found State (Req 8) ────────────────────────────────────────
  if (!exec) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg bg-white rounded-xl border border-amber-200 p-6 text-center">
          <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Execution Not Found</h3>
          <p className="text-sm text-slate-600 mb-2">
            Execution "{executionRef}" could not be found.
          </p>
          <p className="text-xs text-slate-400 mb-4">
            Possible causes: the execution reference may be incorrect, the execution may have been
            archived, or you may not have permission to view it.
          </p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={handleRetry} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <RefreshCw className="w-4 h-4 inline mr-1.5" /> Retry
            </button>
            <button onClick={onBack} className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300">
              Return to Execution Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Governed Initialisation Failure State (Req 9) ────────────────────────────
  if (initFailure) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg bg-white rounded-xl border border-orange-200 p-6 text-center">
          <AlertCircle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Execution Initialisation Incomplete</h3>
          <p className="text-sm text-slate-600 mb-2">{initFailure}</p>
          <p className="text-xs text-slate-400 mb-1">Execution reference: {exec.execution_ref}</p>
          <p className="text-xs text-slate-400 mb-4">Current status: {EXECUTION_STATUS_LABELS[exec.implementation_status as ExecutionStatus] || exec.implementation_status}</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={handleRetry} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <RefreshCw className="w-4 h-4 inline mr-1.5" /> Retry
            </button>
            <button onClick={onBack} className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300">
              Return to Execution Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const status = exec.implementation_status as ExecutionStatus;
  const currentStepIndex = EXECUTION_PIPELINE.indexOf(status);
  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'overview', label: 'Overview', icon: Zap },
    { key: 'timeline', label: 'Timeline', icon: Clock },
    { key: 'package', label: 'Execution Package', icon: Package },
    { key: 'completion', label: 'Completion Report', icon: FileCode },
    { key: 'review', label: 'Engineering Review', icon: ShieldCheck },
    { key: 'verification', label: 'Verification', icon: FlaskConical },
    { key: 'po', label: 'Product Owner', icon: CheckCircle2 },
    { key: 'history', label: 'History', icon: GitBranch },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to Executions
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-slate-900">{exec.execution_ref}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${EXECUTION_STATUS_COLOURS[status] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                {EXECUTION_STATUS_LABELS[status] || status}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">{PROVIDER_LABELS[exec.implementation_provider] || exec.implementation_provider}</span>
            </div>
            <p className="text-sm text-slate-600">{exec.execution_package?.ewo_title || 'Engineering Execution'}</p>
          </div>
          <div className="flex items-center gap-2">
            {status === 'po_accepted' && (
              <button onClick={handleRelease} disabled={acting} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                <Archive className="w-4 h-4" /> Release
              </button>
            )}
            {status === 'released' && (
              <button onClick={handleArchive} disabled={acting} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50">
                <Archive className="w-4 h-4" /> Archive
              </button>
            )}
          </div>
        </div>

        {/* Pipeline Progress Bar */}
        <div className="mt-4 flex items-center gap-1">
          {EXECUTION_PIPELINE.map((step, i) => (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i < currentStepIndex ? 'bg-emerald-500 text-white' : i === currentStepIndex ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                {i < currentStepIndex ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {i < EXECUTION_PIPELINE.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 rounded-full ${i < currentStepIndex ? 'bg-emerald-400' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 flex items-center gap-1 border-b border-slate-200 bg-white">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {tab === 'overview' && <OverviewTab exec={exec} events={events} />}
        {tab === 'timeline' && <TimelineTab events={events} />}
        {tab === 'package' && <PackageTab exec={exec} />}
        {tab === 'completion' && <CompletionTab exec={exec} />}
        {tab === 'review' && <ReviewTab exec={exec} />}
        {tab === 'verification' && <VerificationTab exec={exec} />}
        {tab === 'po' && <POTab exec={exec} poDecision={poDecision} setPoDecision={setPoDecision} poNotes={poNotes} setPoNotes={setPoNotes} onSubmit={handlePODecision} acting={acting} />}
        {tab === 'history' && <HistoryTab exec={exec} events={events} />}
      </div>
    </div>
  );
}

// ── Tab Components ──────────────────────────────────────────────────────────

function OverviewTab({ exec, events }: { exec: EngineeringExecution; events: ExecutionEvent[] }) {
  const report = exec.completion_report;
  const review = exec.review_results;
  const verification = exec.verification_results;
  const files = exec.files_changed || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard icon={Clock} label="Duration" value={exec.duration_seconds ? `${exec.duration_seconds}s` : '—'} />
        <InfoCard icon={GitBranch} label="Provider" value={PROVIDER_LABELS[exec.implementation_provider] || exec.implementation_provider} />
        <InfoCard icon={RefreshCw} label="Retry Count" value={String(exec.retry_count ?? 0)} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Execution Summary</h3>
        <dl className="space-y-2 text-sm">
          <Row label="Execution Reference" value={exec.execution_ref} />
          <Row label="Status" value={EXECUTION_STATUS_LABELS[exec.implementation_status as ExecutionStatus] || exec.implementation_status} />
          <Row label="Provider" value={PROVIDER_LABELS[exec.implementation_provider] || exec.implementation_provider} />
          <Row label="Started" value={exec.started_at ? new Date(exec.started_at).toLocaleString() : '—'} />
          <Row label="Finished" value={exec.finished_at ? new Date(exec.finished_at).toLocaleString() : '—'} />
          <Row label="Files Changed" value={String(files.length)} />
          {exec.failure_reason && <Row label="Failure Reason" value={exec.failure_reason} />}
        </dl>
      </div>

      {report && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Completion Report Summary</h3>
          <div className="flex items-center gap-3 mb-3">
            {report.build?.success ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-rose-500" />}
            <span className="text-sm font-medium text-slate-700">Build {report.build?.success ? 'Passed' : 'Failed'}</span>
            <span className="text-slate-300">·</span>
            {report.verification?.passed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-rose-500" />}
            <span className="text-sm font-medium text-slate-700">Verification {report.verification?.passed ? 'Passed' : 'Failed'}</span>
          </div>
          <p className="text-sm text-slate-600">{report.summary || 'No summary available.'}</p>
        </div>
      )}

      {review && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Engineering Review</h3>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${review.overall_verdict === 'pass' ? 'bg-emerald-100 text-emerald-700' : review.overall_verdict === 'conditional_pass' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{review.overall_verdict?.replace('_', ' ').toUpperCase() || 'PENDING'}</span>
            <span className="text-sm text-slate-500">Architecture Score: {review.architecture_score ?? '—'}/10</span>
          </div>
          <p className="text-sm text-slate-600">{review.summary || 'No review summary.'}</p>
        </div>
      )}

      {verification && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Verification Gates</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            {Object.entries(verification.details || {}).map(([gate, passed]) => (
              <div key={gate} className="flex items-center gap-2 text-sm">
                {passed ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-500" />}
                <span className="text-slate-600 capitalize">{gate}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineTab({ events }: { events: ExecutionEvent[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Execution Timeline</h3>
      {events.length === 0 ? (
        <p className="text-sm text-slate-400">No events recorded.</p>
      ) : (
        <div className="space-y-3">
          {events.map(evt => (
            <div key={evt.id} className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">{evt.event_type?.replace(/_/g, ' ') || 'event'}</span>
                  <span className="text-xs text-slate-400">{new Date(evt.created_at).toLocaleString()}</span>
                </div>
                {evt.notes && <p className="text-xs text-slate-500 mt-0.5">{evt.notes}</p>}
                <div className="flex items-center gap-2 mt-0.5">
                  {evt.from_status && <span className="text-xs text-slate-400">{evt.from_status}</span>}
                  {evt.from_status && <span className="text-xs text-slate-300">→</span>}
                  <span className="text-xs text-slate-400">{evt.to_status}</span>
                  <span className="text-xs text-slate-300">·</span>
                  <span className="text-xs text-slate-400">{evt.actor}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PackageTab({ exec }: { exec: EngineeringExecution }) {
  const pkg = exec.execution_package;
  if (!pkg) return <EmptyState label="No execution package prepared yet" />;
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Engineering Work Order</h3>
        <dl className="space-y-2 text-sm">
          <Row label="EWO Reference" value={pkg.ewo_ref || '—'} />
          <Row label="Title" value={pkg.ewo_title || '—'} />
          <Row label="Summary" value={pkg.ewo_body || '—'} />
        </dl>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Engineering Plan</h3>
        <p className="text-sm text-slate-600">{pkg.engineering_plan || 'No plan available.'}</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Engineering Standards</h3>
        <ul className="space-y-1">
          {(pkg.engineering_standards || []).map((s, i) => <li key={i} className="text-sm text-slate-600 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {s}</li>)}
        </ul>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Constitutional Requirements</h3>
        <ul className="space-y-1">
          {(pkg.constitutional_requirements || []).map((r, i) => <li key={i} className="text-sm text-slate-600 flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-blue-500" /> {r}</li>)}
        </ul>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Verification Requirements</h3>
        <p className="text-sm text-slate-600">{pkg.verification_requirements || 'No verification requirements specified.'}</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Testing Instructions</h3>
        <p className="text-sm text-slate-600">{pkg.testing_instructions || 'No testing instructions specified.'}</p>
      </div>
    </div>
  );
}

function CompletionTab({ exec }: { exec: EngineeringExecution }) {
  const report = exec.completion_report;
  if (!report) return <EmptyState label="No completion report received yet" />;
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          {report.status === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
          <h3 className="text-sm font-semibold text-slate-700">Status: {report.status || 'unknown'}</h3>
        </div>
        <p className="text-sm text-slate-600 mb-4">{report.summary || 'No summary available.'}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Build Results</h3>
        <div className="flex items-center gap-2 mb-2">
          {report.build?.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-500" />}
          <span className="text-sm text-slate-600">{report.build?.success ? 'Build succeeded' : 'Build failed'}</span>
        </div>
        {report.build?.errors?.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-medium text-rose-600 mb-1">Errors:</p>
            <ul className="space-y-0.5">{report.build.errors.map((e, i) => <li key={i} className="text-xs text-rose-600 font-mono">{e}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Files Changed ({normalizeFilesChanged(report.files).length})</h3>
        <div className="space-y-1">
          {normalizeFilesChanged(report.files).map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-slate-600 font-mono text-xs">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {report.recommendations?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Recommendations</h3>
          <ul className="space-y-1">{report.recommendations.map((r, i) => <li key={i} className="text-sm text-slate-600 flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5" /> {r}</li>)}</ul>
        </div>
      )}

      {report.risks?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Risks</h3>
          <ul className="space-y-1">{report.risks.map((r, i) => <li key={i} className="text-sm text-amber-700 flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5" /> {r}</li>)}</ul>
        </div>
      )}

      {report.report_body && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Full Report</h3>
          <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono">{report.report_body}</pre>
        </div>
      )}
    </div>
  );
}

function ReviewTab({ exec }: { exec: EngineeringExecution }) {
  const review = exec.review_results;
  if (!review) return <EmptyState label="No engineering review conducted yet" />;
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${review.overall_verdict === 'pass' ? 'bg-emerald-100 text-emerald-700' : review.overall_verdict === 'conditional_pass' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{review.overall_verdict?.replace(/_/g, ' ').toUpperCase() || 'PENDING'}</span>
          <span className="text-sm text-slate-500">by {review.reviewer || 'unknown'}</span>
        </div>
        <p className="text-sm text-slate-600">{review.summary || 'No review summary.'}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Review Checks</h3>
          <div className="space-y-2 text-sm">
            <CheckRow label="Requirements Satisfied" passed={review.requirements_satisfied} />
            <CheckRow label="Standards Compliance" passed={review.standards_compliance} />
            <CheckRow label="Governance Compliance" passed={review.governance_compliance} />
            <div className="flex items-center justify-between"><span className="text-slate-600">Architecture Score</span><span className="font-medium text-slate-900">{review.architecture_score ?? '—'}/10</span></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Risks & Missing Requirements</h3>
          <div className="space-y-1 text-sm">
            {(review.risks || []).map((r, i) => <p key={i} className="text-amber-700 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {r}</p>)}
            {(review.missing_requirements || []).map((r, i) => <p key={`m${i}`} className="text-rose-700 flex items-start gap-1.5"><XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {r}</p>)}
          </div>
        </div>
      </div>
      {review.recommendations?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Recommendations</h3>
          <ul className="space-y-1">{review.recommendations.map((r, i) => <li key={i} className="text-sm text-slate-600 flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5" /> {r}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function VerificationTab({ exec }: { exec: EngineeringExecution }) {
  const v = exec.verification_results;
  if (!v) return <EmptyState label="No verification results yet" />;
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Verification Gates</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {Object.entries(v.details || {}).map(([gate, passed]) => (
            <div key={gate} className="flex flex-col items-center p-3 rounded-lg border border-slate-200">
              {passed ? <CheckCircle2 className="w-6 h-6 text-emerald-500 mb-1" /> : <XCircle className="w-6 h-6 text-rose-500 mb-1" />}
              <span className="text-xs font-medium text-slate-600 capitalize">{gate}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Timestamp</h3>
        <p className="text-sm text-slate-500">{v.timestamp ? new Date(v.timestamp).toLocaleString() : '—'}</p>
      </div>
    </div>
  );
}

function POTab({ exec, poDecision, setPoDecision, poNotes, setPoNotes, onSubmit, acting }: {
  exec: EngineeringExecution;
  poDecision: 'approved' | 'rejected' | 'refinement' | null;
  setPoDecision: (d: 'approved' | 'rejected' | 'refinement' | null) => void;
  poNotes: string;
  setPoNotes: (n: string) => void;
  onSubmit: () => void;
  acting: boolean;
}) {
  const canDecide = exec.implementation_status === 'awaiting_po_testing';
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Product Owner Decision</h3>
        {exec.po_status && exec.po_status !== 'pending' ? (
          <div className="flex items-center gap-2">
            {exec.po_status === 'approved' && <ThumbsUp className="w-5 h-5 text-emerald-500" />}
            {exec.po_status === 'rejected' && <ThumbsDown className="w-5 h-5 text-rose-500" />}
            {exec.po_status === 'refinement' && <RefreshCw className="w-5 h-5 text-amber-500" />}
            <span className="text-sm font-medium text-slate-700">{PO_STATUS_LABELS[exec.po_status as keyof typeof PO_STATUS_LABELS] || exec.po_status}</span>
            {exec.po_decided_at && <span className="text-xs text-slate-400">· {new Date(exec.po_decided_at).toLocaleString()}</span>}
          </div>
        ) : canDecide ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Review the implementation summary, engineering review, verification results, and risks, then make a decision.</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPoDecision('approved')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border-2 transition-colors ${poDecision === 'approved' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                <ThumbsUp className="w-4 h-4" /> Approve
              </button>
              <button onClick={() => setPoDecision('rejected')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border-2 transition-colors ${poDecision === 'rejected' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                <ThumbsDown className="w-4 h-4" /> Reject
              </button>
              <button onClick={() => setPoDecision('refinement')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border-2 transition-colors ${poDecision === 'refinement' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                <RefreshCw className="w-4 h-4" /> Request Refinement
              </button>
            </div>
            {poDecision && (
              <>
                <textarea value={poNotes} onChange={e => setPoNotes(e.target.value)} placeholder="Add notes for your decision..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300" rows={3} />
                <button onClick={onSubmit} disabled={acting} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Decision'}
                </button>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Product Owner decision is not yet available. The execution must complete engineering review and automated verification first.</p>
        )}
      </div>
      {exec.po_notes && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">PO Notes</h3>
          <p className="text-sm text-slate-600">{exec.po_notes}</p>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ exec, events }: { exec: EngineeringExecution; events: ExecutionEvent[] }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Execution History</h3>
        <dl className="space-y-2 text-sm">
          <Row label="Execution Number" value={exec.execution_ref} />
          <Row label="Provider" value={PROVIDER_LABELS[exec.implementation_provider] || exec.implementation_provider} />
          <Row label="Duration" value={exec.duration_seconds ? `${exec.duration_seconds}s` : '—'} />
          <Row label="Outcome" value={EXECUTION_STATUS_LABELS[exec.implementation_status as ExecutionStatus] || exec.implementation_status} />
          <Row label="Retry Count" value={String(exec.retry_count ?? 0)} />
          {exec.parent_execution_id && <Row label="Parent Execution" value={exec.parent_execution_id} />}
        </dl>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Event Log ({events.length})</h3>
        <div className="space-y-2">
          {events.map(evt => (
            <div key={evt.id} className="flex items-start gap-2 text-sm border-b border-slate-100 pb-2">
              <span className="text-xs text-slate-400 w-32 flex-shrink-0">{new Date(evt.created_at).toLocaleString()}</span>
              <div className="flex-1">
                <span className="text-slate-700 font-medium">{evt.event_type?.replace(/_/g, ' ') || 'event'}</span>
                {evt.notes && <p className="text-xs text-slate-500 mt-0.5">{evt.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function InfoCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-slate-400" />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500 flex-shrink-0">{label}</dt>
      <dd className="text-slate-900 font-medium text-right">{value}</dd>
    </div>
  );
}

function CheckRow({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      {passed ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-500" />}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12">
      <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}
