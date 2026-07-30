import { useEffect, useState } from 'react';
import { Plus, Search, X, History, Shield, RefreshCw, ChevronRight, CheckCircle2, AlertTriangle, Clock, Tag, Database, GitBranch, User, Cpu, Server, Archive, FileText, GitCommit, Rocket, Undo, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buildGovernedResponse } from '../../lib/governedResponse';
import {
  fetchChangeLog,
  fetchChangeLogCounts,
  backfillHistoricalChangeLog,
  fetchChangeTypes,
  recordChangeLogEvent,
  type ChangeLogEntry as AutoChangeLogEntry,
  type ChangeLogCounts,
  type ChangeType,
  type ActorType,
  type ObjectType,
} from '../../lib/engineeringChangeLogService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChangeLogEntry {
  id: string;
  change_ref: string;
  change_type: string;
  ewo_ref: string | null;
  object_type: string | null;
  object_id: string | null;
  object_ref: string | null;
  summary: string;
  description: string | null;
  actor_type: string;
  actor: string;
  is_reconstructed: boolean;
  reconstructed_from: string | null;
  recording_source: string;
  linked_artefacts: Array<{ artefact_type: string; artefact_ref: string; artefact_id?: string; label?: string }> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CHANGE_TYPES = [
  'feature', 'refactor', 'database', 'api', 'workflow', 'documentation',
  'security', 'performance', 'layout', 'infrastructure', 'release', 'bugfix', 'other',
];

const RISK_CFG: Record<string, { bg: string; text: string }> = {
  low:      { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  medium:   { bg: 'bg-amber-50',   text: 'text-amber-700' },
  high:     { bg: 'bg-orange-50',  text: 'text-orange-700' },
  critical: { bg: 'bg-red-100',    text: 'text-red-700' },
};

const APPROVAL_CFG: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  pending:  { bg: 'bg-slate-100', text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400',    label: 'Pending' },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500',  label: 'Approved' },
  rejected: { bg: 'bg-red-50',    text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500',      label: 'Rejected' },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── New Entry Modal ──────────────────────────────────────────────────────────

function NewEntryModal({ onClose, onSave }: { onClose: () => void; onSave: (entry: AutoChangeLogEntry) => void }) {
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [changeType, setChangeType] = useState<'created' | 'updated' | 'refined' | 'archived'>('created');
  const [ewoRef, setEwoRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!summary.trim()) { setError('Summary is required.'); return; }
    setSaving(true);
    setError(null);
    const entry = await recordChangeLogEvent({
      change_type: changeType,
      object_type: 'other',
      summary: summary.trim(),
      description: description.trim() || undefined,
      ewo_ref: ewoRef.trim() || undefined,
      actor: 'Engineering Team',
      actor_type: 'human',
    });
    setSaving(false);
    if (!entry) { setError('Failed to record change.'); return; }
    onSave(entry);
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">New Engineering Change</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto max-h-[65vh]">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Summary *</label>
            <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="Brief description of the engineering change"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Change Type</label>
              <select value={changeType} onChange={e => setChangeType(e.target.value as 'created' | 'updated' | 'refined' | 'archived')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
                <option value="created">Created</option>
                <option value="updated">Updated</option>
                <option value="refined">Refined</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">EWO Ref (optional)</label>
              <input value={ewoRef} onChange={e => setEwoRef(e.target.value)} placeholder="e.g. EWO-014"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Detailed description of what changed and why"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>

        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={handleSave} disabled={saving || !summary.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
            {saving ? <><RefreshCw className="w-4 h-4 animate-spin" />Saving…</> : <><History className="w-4 h-4" />Record Change</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function ChangeDetail({ entry, onClose }: { entry: AutoChangeLogEntry; onClose: () => void }) {
  const actorCfg = ACTOR_TYPE_CONFIG[entry.actor_type] ?? ACTOR_TYPE_CONFIG.system;
  const ObjectIcon = OBJECT_TYPE_ICONS[entry.object_type] ?? FileText;

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-800">{entry.change_ref}</span>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">{entry.change_type}</span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${actorCfg.color}`}>
            <actorCfg.icon className="w-3 h-3" />{actorCfg.label}
          </span>
          {entry.is_reconstructed ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 uppercase">Historical</span>
          ) : (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-600 uppercase">Live</span>
          )}
        </div>

        <div>
          <p className="text-lg font-semibold text-slate-900 leading-snug">{entry.summary}</p>
          {entry.description && <p className="text-sm text-slate-600 mt-2">{entry.description}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><p className="text-slate-400 mb-0.5">Change Ref</p><p className="font-mono font-semibold text-slate-700">{entry.change_ref}</p></div>
          <div><p className="text-slate-400 mb-0.5">Actor</p><p className="font-semibold text-slate-700">{entry.actor}</p></div>
          <div><p className="text-slate-400 mb-0.5">Object Type</p><p className="font-semibold text-slate-700">{entry.object_type ? entry.object_type.replace(/_/g, ' ') : 'N/A'}</p></div>
          <div><p className="text-slate-400 mb-0.5">Object Ref</p><p className="font-mono text-slate-700">{entry.object_ref ?? 'N/A'}</p></div>
          {entry.ewo_ref && <div><p className="text-slate-400 mb-0.5">EWO Ref</p><p className="font-mono text-slate-700">{entry.ewo_ref}</p></div>}
          <div><p className="text-slate-400 mb-0.5">Date</p><p className="text-slate-700">{formatDate(entry.created_at)}</p></div>
        </div>

        {entry.linked_artefacts && entry.linked_artefacts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Linked Engineering Artefacts</p>
            <div className="space-y-1.5">
              {entry.linked_artefacts.map((artefact, i) => (
                <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <ObjectIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700">{artefact.label ?? (artefact.artefact_type ? artefact.artefact_type.replace(/_/g, ' ') : 'N/A')}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{artefact.artefact_ref}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-xs text-slate-500">Immutable engineering record. This entry is append-only and cannot be modified or deleted.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function ECCChangeLogPage() {
  const [entries, setEntries] = useState<AutoChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterActor, setFilterActor] = useState('');
  const [filterObject, setFilterObject] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchChangeLog({
        search: search || undefined,
        change_type: (filterType || null) as ChangeType | null,
        actor_type: (filterActor || null) as ActorType | null,
        object_type: (filterObject || null) as ObjectType | null,
        is_reconstructed: filterSource === '' ? null : filterSource === 'historical',
        limit: 200,
      });
      setEntries(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load change log.');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [search, filterType, filterActor, filterObject, filterSource]);

  const filtered = entries;
  const selected = selectedId ? entries.find(e => e.id === selectedId) ?? null : null;

  const totalEntries = entries.length;
  const liveEntries = entries.filter(e => !e.is_reconstructed).length;
  const historicalEntries = entries.filter(e => e.is_reconstructed).length;
  const poEvents = entries.filter(e => e.change_type === 'approved' || e.change_type === 'rejected').length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* List panel */}
      <div className={`flex flex-col min-w-0 transition-all ${selected ? 'w-[420px] shrink-0' : 'flex-1'} overflow-hidden border-r border-slate-200 bg-white`}>
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                <h1 className="text-xl font-bold text-slate-900">Engineering Change Log</h1>
              </div>
              <p className="text-sm text-slate-500 mt-1">Permanent record of every engineering change. Single source of truth.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors">
                <Plus className="w-4 h-4" />Record Change
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: 'Total',     value: totalEntries,     color: 'text-slate-700' },
              { label: 'Live',       value: liveEntries,       color: 'text-emerald-600' },
              { label: 'Historical', value: historicalEntries, color: 'text-amber-600' },
              { label: 'PO Events',  value: poEvents,          color: 'text-blue-600' },
            ].map(s => (
              <div key={s.label} className="text-center bg-slate-50 rounded-lg py-2">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search changes…"
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400">
              <option value="">All Types</option>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="closed">Closed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="refined">Refined</option>
              <option value="imported">Imported</option>
              <option value="recovered">Recovered</option>
            </select>
            <select value={filterActor} onChange={e => setFilterActor(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400">
              <option value="">All Actors</option>
              <option value="human">Human</option>
              <option value="ai">AI</option>
              <option value="system">System</option>
            </select>
            <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400">
              <option value="">All Sources</option>
              <option value="live">Live</option>
              <option value="historical">Historical</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-red-600">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <History className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-500 mb-1">No changes recorded yet</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">Record engineering changes to build a permanent audit trail.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(entry => {
                const changeIcon = AUTO_CHANGE_TYPE_ICONS[entry.change_type] ?? History;
                const ChangeIcon = changeIcon;
                const actorCfg = ACTOR_TYPE_CONFIG[entry.actor_type] ?? ACTOR_TYPE_CONFIG.system;
                return (
                  <button key={entry.id} onClick={() => setSelectedId(selectedId === entry.id ? null : entry.id)}
                    className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors group ${selectedId === entry.id ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        <ChangeIcon className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-slate-400">{entry.change_ref}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">{entry.change_type}</span>
                          {entry.is_reconstructed ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 uppercase">Hist</span>
                          ) : (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 uppercase">Live</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 truncate mb-1">{entry.summary}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {entry.ewo_ref && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Tag className="w-2.5 h-2.5" />{entry.ewo_ref}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-[10px] ${actorCfg.color}`}>
                            <actorCfg.icon className="w-2.5 h-2.5" />{actorCfg.label}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-auto">
                            <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                            {formatDate(entry.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="flex-1 overflow-hidden">
          <ChangeDetail entry={selected} onClose={() => setSelectedId(null)} />
        </div>
      )}

      {showModal && (
        <NewEntryModal
          onClose={() => setShowModal(false)}
          onSave={(entry) => {
            setEntries(prev => [entry, ...prev]);
            setShowModal(false);
            setSelectedId(entry.id);
          }}
        />
      )}
    </div>
  );
}

// ─── Automatic Engineering Ledger Section (EWO-019) ───────────────────────────

const AUTO_CHANGE_TYPE_ICONS: Record<string, typeof History> = {
  created: Plus, updated: RefreshCw, reviewed: Search, approved: CheckCircle2,
  rejected: X, tested: Shield, closed: CheckCircle2, reopened: RefreshCw,
  refined: GitBranch, imported: Archive, recovered: Archive, archived: Archive,
  deleted: X, deployed: Rocket, rolled_back: Undo,
};

const ACTOR_TYPE_CONFIG: Record<string, { icon: typeof User; label: string; color: string }> = {
  human: { icon: User, label: 'Human', color: 'text-blue-600' },
  ai: { icon: Cpu, label: 'AI', color: 'text-purple-600' },
  system: { icon: Server, label: 'System', color: 'text-slate-500' },
};

const OBJECT_TYPE_ICONS: Record<string, typeof FileText> = {
  engineering_work_order: History, completion_report: FileText,
  engineering_record: Database, engineering_standard: Shield,
  constitutional_amendment: Shield, recovery_package: Archive,
  historical_package: Archive, product_owner_approval: CheckCircle2,
  product_owner_rejection: X, engineering_plan: FileText,
  prompt_artefact: FileText, repository_commit: GitCommit,
  deployment_record: Rocket, build_record: Server, test_result: Shield, other: FileText,
};

export function ECCAutomaticChangeLogSection() {
  const [entries, setEntries] = useState<AutoChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<ChangeLogCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState<string | null>(null);
  const [countsRefCode, setCountsRefCode] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterChangeType, setFilterChangeType] = useState<string>('');
  const [filterActorType, setFilterActorType] = useState<string>('');
  const [filterObjectType, setFilterObjectType] = useState<string>('');
  const [filterReconstructed, setFilterReconstructed] = useState<string>('');
  const [changeTypes, setChangeTypes] = useState<Array<{ change_type: string; description: string }>>([]);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AutoChangeLogEntry | null>(null);

  async function loadCounts() {
    setCountsLoading(true);
    setCountsError(null);
    setCountsRefCode(null);
    try {
      const c = await fetchChangeLogCounts();
      setCounts(c);
    } catch (err: any) {
      setCountsError(err.message || 'Failed to retrieve ledger counts.');
      setCountsRefCode(buildGovernedResponse('EIOS-CHANGELOG-003').referenceCode);
    } finally {
      setCountsLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    const data = await fetchChangeLog({
      search: search || undefined,
      change_type: (filterChangeType || null) as ChangeType | null,
      actor_type: (filterActorType || null) as ActorType | null,
      object_type: (filterObjectType || null) as ObjectType | null,
      is_reconstructed: filterReconstructed === '' ? null : filterReconstructed === 'true',
      limit: 200,
    });
    setEntries(data);
    setLoading(false);
    loadCounts();
  }

  async function loadChangeTypes() {
    const types = await fetchChangeTypes();
    setChangeTypes(types);
  }

  useEffect(() => { loadChangeTypes(); loadCounts(); }, []);
  useEffect(() => { load(); }, [search, filterChangeType, filterActorType, filterObjectType, filterReconstructed]);

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillResult(null);
    const result = await backfillHistoricalChangeLog();
    setBackfilling(false);
    setBackfillResult(`Reconstructed: ${result.reconstructed} | Skipped: ${result.skipped} | Errors: ${result.errors.length}`);
    load();
  }

  const invariantValid = counts ? counts.total === counts.live + counts.reconstructed : true;
  const actorTypes = ['human', 'ai', 'system'];
  const objectTypes = [
    'engineering_work_order', 'completion_report', 'engineering_record',
    'engineering_standard', 'constitutional_amendment', 'recovery_package',
    'historical_package', 'product_owner_approval', 'product_owner_rejection',
    'engineering_plan', 'repository_commit', 'deployment_record',
  ];

  return (
    <div className="flex h-full overflow-hidden">
      <div className={`flex flex-col min-w-0 transition-all ${selectedEntry ? 'w-[420px] shrink-0' : 'flex-1'} overflow-hidden border-r border-slate-200 bg-white`}>
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                <h1 className="text-xl font-bold text-slate-900">Engineering Change Ledger</h1>
              </div>
              <p className="text-sm text-slate-500 mt-1">Immutable, append-only engineering history. Automatic event recording.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={handleBackfill} disabled={backfilling}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors">
                {backfilling ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Backfilling...</> : <><Archive className="w-3.5 h-3.5" />Backfill History</>}
              </button>
            </div>
          </div>

          {backfillResult && (
            <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              {backfillResult}
            </div>
          )}

          {/* Summary counters — authoritative ledger totals (not based on loaded rows) */}
          {countsError ? (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-red-700">Ledger Count Retrieval Failed</p>
                  <p className="text-xs text-red-600 mt-0.5">{countsError}</p>
                  <p className="text-xs text-red-500 mt-1">Displayed counters may be stale. Click refresh to retry.</p>
                  {countsRefCode && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[10px] font-bold text-red-400 uppercase">Reference Code</span>
                      <span className="text-[10px] font-mono text-red-500 bg-red-100 px-1.5 py-0.5 rounded border border-red-200">{countsRefCode}</span>
                    </div>
                  )}
                </div>
                <button onClick={loadCounts} className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center bg-slate-50 rounded-lg py-2">
                  <p className="text-lg font-bold text-slate-700">
                    {countsLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin inline text-slate-400" /> : (counts?.total ?? 0)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">Total Events</p>
                </div>
                <div className="text-center bg-slate-50 rounded-lg py-2">
                  <p className="text-lg font-bold text-amber-600">
                    {countsLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin inline text-slate-400" /> : (counts?.reconstructed ?? 0)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">Reconstructed</p>
                </div>
                <div className="text-center bg-slate-50 rounded-lg py-2">
                  <p className="text-lg font-bold text-green-600">
                    {countsLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin inline text-slate-400" /> : (counts?.live ?? 0)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">Live Events</p>
                </div>
              </div>
              {!countsLoading && counts && !invariantValid && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700">Count invariant warning: Total does not equal Live + Reconstructed.</p>
                  <span className="text-[10px] font-mono text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 ml-auto">{buildGovernedResponse('EIOS-CHANGELOG-004').referenceCode}</span>
                </div>
              )}
              {!countsLoading && counts && counts.total === 0 && (
                <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <p className="text-xs text-slate-500">The ledger is empty. Engineering events will appear here automatically as they occur.</p>
                </div>
              )}
            </div>
          )}

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search engineering history..."
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select value={filterChangeType} onChange={e => setFilterChangeType(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400">
              <option value="">All Change Types</option>
              {changeTypes.map(t => <option key={t.change_type} value={t.change_type}>{t.change_type}</option>)}
            </select>
            <select value={filterActorType} onChange={e => setFilterActorType(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400">
              <option value="">All Actors</option>
              {actorTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterObjectType} onChange={e => setFilterObjectType(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400">
              <option value="">All Object Types</option>
              {objectTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <select value={filterReconstructed} onChange={e => setFilterReconstructed(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400">
              <option value="">All History</option>
              <option value="false">Live Events Only</option>
              <option value="true">Reconstructed Only</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center">
              <Layers className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-500 mb-1">No engineering events recorded</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">Engineering events will appear here automatically as they occur. Run historical backfill to reconstruct past events.</p>
              <div className="flex items-center gap-1.5 mt-3 justify-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Reference Code</span>
                <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{buildGovernedResponse('EIOS-CHANGELOG-002').referenceCode}</span>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {entries.map(entry => {
                const TypeIcon = AUTO_CHANGE_TYPE_ICONS[entry.change_type] ?? History;
                const actorCfg = ACTOR_TYPE_CONFIG[entry.actor_type] ?? ACTOR_TYPE_CONFIG.system;
                const ObjectIcon = OBJECT_TYPE_ICONS[entry.object_type] ?? FileText;
                return (
                  <button key={entry.id} onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
                    className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors group ${selectedEntry?.id === entry.id ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        <TypeIcon className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-slate-400">{entry.change_ref}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">{entry.change_type}</span>
                          {entry.is_reconstructed ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 uppercase">Historical Reconstruction</span>
                          ) : (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-600 uppercase">Live Event</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 truncate mb-1">{entry.summary}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${actorCfg.color}`}>
                            <actorCfg.icon className="w-2.5 h-2.5" />{actorCfg.label}
                          </span>
                          {entry.ewo_ref && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Tag className="w-2.5 h-2.5" />{entry.ewo_ref}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[10px] text-slate-400">
                            <ObjectIcon className="w-2.5 h-2.5" />{entry.object_type ? entry.object_type.replace(/_/g, ' ') : 'N/A'}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-auto">
                            <Clock className="w-2.5 h-2.5 inline mr-0.5" />{formatDate(entry.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedEntry && (
        <div className="flex-1 overflow-hidden">
          <AutomaticChangeLogDetail entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
        </div>
      )}
    </div>
  );
}

function AutomaticChangeLogDetail({ entry, onClose }: { entry: AutoChangeLogEntry; onClose: () => void }) {
  const TypeIcon = AUTO_CHANGE_TYPE_ICONS[entry.change_type] ?? History;
  const actorCfg = ACTOR_TYPE_CONFIG[entry.actor_type] ?? ACTOR_TYPE_CONFIG.system;

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <TypeIcon className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-800">{entry.change_ref}</span>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">{entry.change_type}</span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${actorCfg.color}`}>
            <actorCfg.icon className="w-3 h-3" />{actorCfg.label}
          </span>
          {entry.is_reconstructed ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-600 uppercase">Historical Reconstruction</span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-green-50 text-green-600 uppercase">Live Event</span>
          )}
        </div>

        <div>
          <p className="text-lg font-semibold text-slate-900 leading-snug">{entry.summary}</p>
          {entry.description && <p className="text-sm text-slate-600 mt-2">{entry.description}</p>}
        </div>

        {entry.is_reconstructed ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-amber-700 mb-1">Historical Reconstruction</p>
            <p className="text-xs text-amber-600">This event was reconstructed from existing engineering records. Timestamp preserved from source: <span className="font-mono">{entry.reconstructed_from}</span></p>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-green-700 mb-1">Live Engineering Event</p>
            <p className="text-xs text-green-600">This event was witnessed by the platform in real time and recorded immediately by the live Engineering Change Log recorder.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><p className="text-slate-400 mb-0.5">Change Ref</p><p className="font-mono font-semibold text-slate-700">{entry.change_ref}</p></div>
          <div><p className="text-slate-400 mb-0.5">Actor</p><p className="font-semibold text-slate-700">{entry.actor}</p></div>
          <div><p className="text-slate-400 mb-0.5">Object Type</p><p className="font-semibold text-slate-700">{entry.object_type ? entry.object_type.replace(/_/g, ' ') : 'N/A'}</p></div>
          <div><p className="text-slate-400 mb-0.5">Object Ref</p><p className="font-mono text-slate-700">{entry.object_ref ?? 'N/A'}</p></div>
          {entry.ewo_ref && <div><p className="text-slate-400 mb-0.5">EWO Ref</p><p className="font-mono text-slate-700">{entry.ewo_ref}</p></div>}
          <div><p className="text-slate-400 mb-0.5">Date</p><p className="text-slate-700">{formatDate(entry.created_at)}</p></div>
        </div>

        {entry.linked_artefacts && entry.linked_artefacts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Linked Engineering Artefacts</p>
            <div className="space-y-1.5">
              {entry.linked_artefacts.map((artefact, i) => {
                const ArtefactIcon = OBJECT_TYPE_ICONS[artefact.artefact_type] ?? FileText;
                return (
                  <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <ArtefactIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700">{artefact.label ?? (artefact.artefact_type ? artefact.artefact_type.replace(/_/g, ' ') : 'N/A')}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{artefact.artefact_ref}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 uppercase">{artefact.artefact_type ? artefact.artefact_type.replace(/_/g, ' ') : 'N/A'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-xs text-slate-500">Immutable engineering record. This entry is append-only and cannot be modified or deleted.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
