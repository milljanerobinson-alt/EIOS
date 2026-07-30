import { useEffect, useState } from 'react';
import {
  History, Loader2, Search, Filter, Package, Brain,
  CheckCircle2, FileText, GitBranch, Rocket, Archive,
  AlertCircle, Play, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEvent {
  id: string;
  event_type: string;
  event_label: string;
  entity_type: string | null;
  entity_id:   string | null;
  entity_title: string | null;
  rc_id:       string | null;
  rc_number:   string | null;
  metadata:    Record<string, unknown>;
  created_at:  string;
}

// ─── Event config ─────────────────────────────────────────────────────────────

const EVENT_CFG: Record<string, { Icon: typeof Rocket; dot: string; bg: string; label: string }> = {
  phase_started:          { Icon: Rocket,       dot: 'bg-blue-500',    bg: 'bg-blue-50 border-blue-200',    label: 'Phase Started' },
  phase_completed:        { Icon: Archive,       dot: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-200', label: 'Phase Completed' },
  rc_created:             { Icon: Package,       dot: 'bg-amber-500',   bg: 'bg-amber-50 border-amber-200',  label: 'RC Created' },
  rc_verified:            { Icon: CheckCircle2,  dot: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-200', label: 'RC Verified' },
  rc_archived:            { Icon: Archive,       dot: 'bg-slate-400',   bg: 'bg-slate-50 border-slate-200',  label: 'RC Archived' },
  testing_started:        { Icon: Play,          dot: 'bg-cyan-500',    bg: 'bg-cyan-50 border-cyan-200',    label: 'Testing Started' },
  testing_passed:         { Icon: CheckCircle2,  dot: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-200', label: 'Testing Passed' },
  testing_failed:         { Icon: AlertCircle,   dot: 'bg-red-500',     bg: 'bg-red-50 border-red-200',      label: 'Testing Failed' },
  completion_report_generated: { Icon: FileText, dot: 'bg-teal-500',    bg: 'bg-teal-50 border-teal-200',    label: 'Completion Report' },
  journal_session:        { Icon: Brain,         dot: 'bg-violet-500',  bg: 'bg-violet-50 border-violet-200', label: 'AI Session' },
  adr_created:            { Icon: GitBranch,     dot: 'bg-indigo-500',  bg: 'bg-indigo-50 border-indigo-200', label: 'ADR Created' },
  doc_created:            { Icon: FileText,      dot: 'bg-slate-500',   bg: 'bg-slate-50 border-slate-200',  label: 'Document Created' },
  item_added_to_rc:       { Icon: Package,       dot: 'bg-blue-400',    bg: 'bg-blue-50 border-blue-200',    label: 'Item Added to RC' },
};

const DEFAULT_CFG = { Icon: AlertCircle, dot: 'bg-slate-400', bg: 'bg-slate-50 border-slate-200', label: 'Event' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ECCTimelinePage() {
  const [events, setEvents]     = useState<AuditEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filterType, setFilterType] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('ecc_engineering_audit')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setEvents(data ?? []);
        setLoading(false);
      });
  }, []);

  const eventTypes = ['all', ...Array.from(new Set(events.map(e => e.event_type)))];

  const filtered = events.filter(e => {
    if (filterType !== 'all' && e.event_type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.event_label.toLowerCase().includes(q) ||
        (e.entity_title ?? '').toLowerCase().includes(q) ||
        (e.rc_number ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by date
  const grouped: Record<string, AuditEvent[]> = {};
  for (const e of filtered) {
    const key = fmtDate(e.created_at);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center">
            <History className="w-4.5 h-4.5 text-slate-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Engineering Timeline</h2>
            <p className="text-xs text-slate-500 mt-0.5">{events.length} events recorded</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events, titles, RC numbers..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="pl-9 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer"
          >
            {eventTypes.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All Events' : (EVENT_CFG[t]?.label ?? t)}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <History className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">No events yet</p>
          <p className="text-xs text-slate-400 mt-1">Engineering events will appear here as you work</p>
        </div>
      )}

      {/* Timeline grouped by date */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dayEvents]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{date}</span>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="relative pl-6">
                {/* Vertical line */}
                <div className="absolute left-2.5 top-0 bottom-0 w-px bg-slate-200" />
                <div className="space-y-3">
                  {dayEvents.map(event => {
                    const cfg    = EVENT_CFG[event.event_type] ?? DEFAULT_CFG;
                    const Icon   = cfg.Icon;
                    const expanded = expandedId === event.id;
                    const hasMetadata = Object.keys(event.metadata ?? {}).length > 0;
                    return (
                      <div key={event.id} className="relative">
                        {/* Dot */}
                        <div className={`absolute -left-6 top-3.5 w-3 h-3 rounded-full border-2 border-white ${cfg.dot}`} />
                        <div className={`bg-white rounded-xl border ${cfg.bg} overflow-hidden`}>
                          <button
                            onClick={() => hasMetadata ? setExpandedId(expanded ? null : event.id) : undefined}
                            className={`w-full flex items-start gap-3 p-4 text-left ${hasMetadata ? 'hover:bg-slate-50/60 cursor-pointer' : 'cursor-default'}`}
                          >
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 leading-snug">{event.event_label}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {event.rc_number && (
                                  <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{event.rc_number}</span>
                                )}
                                {event.entity_type && (
                                  <span className="text-xs text-slate-400 capitalize">{event.entity_type.replace(/_/g, ' ')}</span>
                                )}
                                <span className="text-xs text-slate-400">{fmtDateTime(event.created_at)}</span>
                              </div>
                              {event.entity_title && (
                                <p className="text-xs text-slate-500 mt-1 truncate">{event.entity_title}</p>
                              )}
                            </div>
                          </button>
                          {expanded && hasMetadata && (
                            <div className="px-4 pb-4 border-t border-slate-100/80">
                              <div className="mt-3 bg-slate-50 rounded-lg p-3">
                                <p className="text-xs font-semibold text-slate-600 mb-2">Metadata</p>
                                <div className="space-y-1">
                                  {Object.entries(event.metadata).map(([k, v]) => (
                                    <div key={k} className="flex items-start gap-2 text-xs">
                                      <span className="font-medium text-slate-500 shrink-0">{k}:</span>
                                      <span className="text-slate-700 break-all">{String(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
