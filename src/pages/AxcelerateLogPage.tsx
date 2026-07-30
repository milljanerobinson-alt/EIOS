import { useEffect, useState, useCallback } from 'react';
import {
  Plug, Loader2, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle,
  ChevronDown, ChevronUp, RotateCcw, Zap
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface QueueEntry {
  id: string;
  invitation_id: string | null;
  assessment_id: string | null;
  contact_id: number | null;
  event_type: string;
  status: string;
  error: string | null;
  note_body: string | null;
  attempts: number;
  last_attempted_at: string | null;
  next_attempt_at: string | null;
  created_at: string;
  assessment_invitations?: {
    candidate_name: string | null;
    candidate_email: string | null;
  } | null;
}

const EVENT_LABELS: Record<string, string> = {
  lln_assessment_opened:      'LLN Quiz Opened',
  digital_assessment_opened:  'Digital Quiz Opened',
  lln_assessment_completed:   'LLN Quiz Completed',
  digital_assessment_completed: 'Digital Quiz Completed',
  quiz_sent:                  'Quiz Sent',
  student_created:            'Student Created',
  report_found_no_resend:     'Report Found — No Resend',
  no_lln_required:            'No LLN/Digital Required',
  lln_opened:                 'LLN Quiz Opened',
  digital_opened:             'Digital Quiz Opened',
  lln_completed:              'LLN Quiz Completed',
  digital_completed:          'Digital Quiz Completed',
};

const EVENT_COLORS: Record<string, string> = {
  lln_assessment_opened:        'bg-blue-50 text-blue-700 border border-blue-200',
  digital_assessment_opened:    'bg-violet-50 text-violet-700 border border-violet-200',
  lln_assessment_completed:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  digital_assessment_completed: 'bg-teal-50 text-teal-700 border border-teal-200',
  quiz_sent:                    'bg-sky-50 text-sky-700 border border-sky-200',
  student_created:              'bg-orange-50 text-orange-700 border border-orange-200',
  report_found_no_resend:       'bg-amber-50 text-amber-700 border border-amber-200',
  no_lln_required:              'bg-slate-100 text-slate-600 border border-slate-200',
};

const STATUS_CFG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  success:    { label: 'Completed',  color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed:     { label: 'Failed',     color: 'bg-red-100 text-red-700',         icon: XCircle      },
  pending:    { label: 'Pending',    color: 'bg-amber-100 text-amber-700',     icon: AlertCircle  },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-700',       icon: RefreshCw    },
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function NotePreview({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = body.split('\n').filter(Boolean);
  const preview = lines.slice(0, 3).join('\n');
  const hasMore = lines.length > 3;

  return (
    <div className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">
      <pre className="whitespace-pre-wrap font-sans text-slate-600 leading-relaxed">
        {expanded ? body : preview}
        {!expanded && hasMore && '…'}
      </pre>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Show less' : `Show ${lines.length - 3} more lines`}
        </button>
      )}
    </div>
  );
}

type FilterState = 'all' | 'pending' | 'failed' | 'success';

export function AxcelerateLogPage() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterState>('all');
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [retryingAll, setRetryingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('axcelerate_writeback_queue')
      .select('*, assessment_invitations(candidate_name, candidate_email)')
      .order('created_at', { ascending: false })
      .limit(300);
    setEntries((data || []) as QueueEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function retryJob(entry: QueueEntry) {
    setRetrying((prev) => new Set(prev).add(entry.id));
    await supabase
      .from('axcelerate_writeback_queue')
      .update({ status: 'pending', attempts: 0, error: null, next_attempt_at: new Date().toISOString() })
      .eq('id', entry.id);

    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-axcelerate-queue`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (_) {}

    await load();
    setRetrying((prev) => { const s = new Set(prev); s.delete(entry.id); return s; });
  }

  async function retryAllFailed() {
    setRetryingAll(true);
    const failed = entries.filter((e) => e.status === 'failed');
    await supabase
      .from('axcelerate_writeback_queue')
      .update({ status: 'pending', attempts: 0, error: null, next_attempt_at: new Date().toISOString() })
      .in('id', failed.map((e) => e.id));

    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-axcelerate-queue`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (_) {}

    await load();
    setRetryingAll(false);
  }

  const counts = {
    all:     entries.length,
    pending: entries.filter((e) => e.status === 'pending' || e.status === 'processing').length,
    failed:  entries.filter((e) => e.status === 'failed').length,
    success: entries.filter((e) => e.status === 'success').length,
  };

  const displayed = filter === 'all'
    ? entries
    : filter === 'pending'
      ? entries.filter((e) => e.status === 'pending' || e.status === 'processing')
      : entries.filter((e) => e.status === filter);

  const statsCards: { key: FilterState; label: string; color: string; activeColor: string }[] = [
    { key: 'all',     label: 'Total',     color: 'text-slate-600',   activeColor: 'bg-slate-900 text-white' },
    { key: 'pending', label: 'Pending',   color: 'text-amber-600',   activeColor: 'bg-amber-500 text-white' },
    { key: 'failed',  label: 'Failed',    color: 'text-red-600',     activeColor: 'bg-red-500 text-white' },
    { key: 'success', label: 'Completed', color: 'text-emerald-600', activeColor: 'bg-emerald-600 text-white' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">aXcelerate Queue</h2>
          <p className="text-sm text-slate-500 mt-1">
            Contact-note write-back queue — lifecycle events synced to aXcelerate.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {counts.failed > 0 && (
            <button
              onClick={retryAllFailed}
              disabled={retryingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {retryingAll
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RotateCcw className="w-3.5 h-3.5" />}
              Retry all failed ({counts.failed})
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statsCards.map(({ key, label, color, activeColor }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-xl border p-4 text-left transition-all ${
              filter === key
                ? `${activeColor} border-transparent shadow-sm`
                : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
            }`}
          >
            <p className={`text-2xl font-bold ${filter === key ? '' : color}`}>
              {counts[key]}
            </p>
            <p className={`text-xs mt-0.5 font-medium ${filter === key ? 'opacity-80' : 'text-slate-500'}`}>
              {label}
            </p>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200">
          <Plug className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 flex-1">
            {filter === 'all' ? 'All Jobs' : statsCards.find((s) => s.key === filter)?.label}
            <span className="ml-2 text-xs font-normal text-slate-400">({displayed.length})</span>
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16">
            <Plug className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No records in this view.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayed.map((entry) => {
              const cfg = STATUS_CFG[entry.status] ?? STATUS_CFG.pending;
              const StatusIcon = cfg.icon;
              const eventLabel = EVENT_LABELS[entry.event_type] ?? entry.event_type;
              const eventColor = EVENT_COLORS[entry.event_type] ?? 'bg-slate-100 text-slate-600 border border-slate-200';
              const candidate = entry.assessment_invitations;
              const isRetrying = retrying.has(entry.id);

              return (
                <div key={entry.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-3">
                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${eventColor}`}>
                          <Zap className="w-2.5 h-2.5" />
                          {eventLabel}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </div>

                      {candidate?.candidate_name && (
                        <p className="text-sm font-medium text-slate-800">{candidate.candidate_name}</p>
                      )}
                      {candidate?.candidate_email && (
                        <p className="text-xs text-slate-500">{candidate.candidate_email}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                        {entry.contact_id && <span>Contact #{entry.contact_id}</span>}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeAgo(entry.last_attempted_at || entry.created_at)}
                          <span className="text-slate-300">·</span>
                          {fmt(entry.created_at)}
                        </span>
                        <span>{entry.attempts} attempt{entry.attempts !== 1 ? 's' : ''}</span>
                        {entry.next_attempt_at && entry.status === 'pending' && (
                          <span>Next: {timeAgo(entry.next_attempt_at)}</span>
                        )}
                      </div>

                      {entry.error && (
                        <p className="mt-1.5 text-xs text-red-500 bg-red-50 border border-red-100 rounded px-2 py-1">
                          {entry.error}
                        </p>
                      )}

                      {entry.note_body && <NotePreview body={entry.note_body} />}
                    </div>

                    {/* Actions */}
                    {(entry.status === 'failed' || entry.status === 'pending') && (
                      <button
                        onClick={() => retryJob(entry)}
                        disabled={isRetrying}
                        title="Retry this job"
                        className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
                      >
                        {isRetrying
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <RotateCcw className="w-3 h-3" />}
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
