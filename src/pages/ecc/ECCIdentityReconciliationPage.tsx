import { useState, useEffect, useCallback } from 'react';
import {
  Fingerprint, Loader2, AlertTriangle, CheckCircle2, XCircle,
  ShieldCheck, ArrowRight, History, Eye, Filter, RefreshCw,
} from 'lucide-react';
import {
  type IdentityMapping,
  type IdentityAuditEvent,
  type IdentityRelationshipType,
  getPendingReconciliations,
  getIdentityMappings,
  acceptReconciliation,
  rejectReconciliation,
  overrideReconciliation,
  getIdentityAuditTrail,
  runReconciliationEngine,
} from '../../lib/identityReconciliationService';

const RELATIONSHIP_LABELS: Record<IdentityRelationshipType, string> = {
  CANONICAL: 'Canonical',
  ALIAS: 'Historical Alias',
  SUPERSEDED: 'Superseded',
  MIGRATED_FROM: 'Migrated From',
  IMPORTED_FROM: 'Imported From',
  DUPLICATE_REFERENCE: 'Duplicate Reference',
  LEGACY_IDENTIFIER: 'Legacy Identifier',
};

const CONFIDENCE_COLOURS: Record<string, string> = {
  HIGH: 'text-green-700 bg-green-50 border-green-200',
  MEDIUM: 'text-amber-700 bg-amber-50 border-amber-200',
  LOW: 'text-slate-600 bg-slate-50 border-slate-200',
};

const STATUS_COLOURS: Record<string, string> = {
  pending: 'text-amber-700 bg-amber-50 border-amber-200',
  accepted: 'text-green-700 bg-green-50 border-green-200',
  rejected: 'text-red-700 bg-red-50 border-red-200',
  overridden: 'text-blue-700 bg-blue-50 border-blue-200',
};

export function ECCIdentityReconciliationPage() {
  const [mappings, setMappings] = useState<IdentityMapping[]>([]);
  const [auditTrail, setAuditTrail] = useState<IdentityAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected' | 'overridden'>('pending');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ found: number; created: number } | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<IdentityMapping | null>(null);
  const [actionMode, setActionMode] = useState<'accept' | 'reject' | 'override' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [overrideCanonical, setOverrideCanonical] = useState('');
  const [overrideRelType, setOverrideRelType] = useState<IdentityRelationshipType>('ALIAS');
  const [acting, setActing] = useState(false);
  const [view, setView] = useState<'review' | 'audit'>('review');

  const load = useCallback(async () => {
    setLoading(true);
    let data: IdentityMapping[];
    if (filter === 'all') {
      data = await getIdentityMappings();
    } else if (filter === 'pending') {
      data = await getPendingReconciliations();
    } else {
      const all = await getIdentityMappings();
      data = all.filter(m => m.reconciliation_status === filter);
    }
    setMappings(data);
    const audit = await getIdentityAuditTrail();
    setAuditTrail(audit);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function handleRunEngine() {
    setRunning(true);
    setRunResult(null);
    const result = await runReconciliationEngine();
    setRunResult({ found: result.candidatesFound, created: result.mappingsCreated });
    setRunning(false);
    await load();
  }

  async function handleAction() {
    if (!selectedMapping || !actionMode) return;
    setActing(true);
    const actor = 'Product Owner';
    if (actionMode === 'accept') {
      await acceptReconciliation(selectedMapping.id, actor, actionReason);
    } else if (actionMode === 'reject') {
      await rejectReconciliation(selectedMapping.id, actor, actionReason);
    } else if (actionMode === 'override') {
      await overrideReconciliation(selectedMapping.id, actor, overrideCanonical, overrideRelType, actionReason);
    }
    setActing(false);
    setActionMode(null);
    setActionReason('');
    setOverrideCanonical('');
    setSelectedMapping(null);
    await load();
  }

  const pendingCount = mappings.filter(m => m.reconciliation_status === 'pending').length;

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="px-8 py-6 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Fingerprint className="w-5.5 h-5.5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Engineering Identity Reconciliation</h1>
              <p className="text-sm text-slate-500">Governed reconciliation of historical engineering identities. History is never rewritten — only explained.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setView('review')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === 'review' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                Review ({pendingCount} pending)
              </button>
              <button
                onClick={() => setView('audit')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === 'audit' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                Audit Trail ({auditTrail.length})
              </button>
            </div>
            <button
              onClick={handleRunEngine}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Run Reconciliation Engine
            </button>
          </div>
        </div>

        {runResult && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-sm text-blue-800">
            <CheckCircle2 className="w-4 h-4" />
            <span>Engine found <strong>{runResult.found}</strong> candidate(s) and created <strong>{runResult.created}</strong> new pending mapping(s).</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : view === 'review' ? (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-slate-400" />
              {(['pending', 'accepted', 'rejected', 'overridden', 'all'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors capitalize ${filter === f ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {mappings.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-slate-400">
                <Fingerprint className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No identity mappings to review. Run the reconciliation engine to detect candidates.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {mappings.map(m => (
                  <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-mono font-semibold text-slate-800">{m.canonical_reference}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-sm font-mono text-slate-600">{m.historical_reference}</span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${CONFIDENCE_COLOURS[m.confidence]}`}>
                            {m.confidence}
                          </span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLOURS[m.reconciliation_status]}`}>
                            {m.reconciliation_status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                          <span>Relationship: <strong className="text-slate-700">{RELATIONSHIP_LABELS[m.relationship_type] || m.relationship_type}</strong></span>
                          <span>·</span>
                          <span>Canonical type: {m.canonical_type}</span>
                          <span>·</span>
                          <span>Historical type: {m.historical_type}</span>
                        </div>
                        {m.provenance && (
                          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 mb-2">{m.provenance}</p>
                        )}
                        {m.recommended_action && (
                          <div className="flex items-center gap-1.5 text-xs text-blue-700">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Recommended: {m.recommended_action}</span>
                          </div>
                        )}
                        {m.accepted_by && (
                          <p className="text-[10px] text-slate-400 mt-2">
                            {m.reconciliation_status === 'accepted' ? 'Accepted' : m.reconciliation_status === 'rejected' ? 'Rejected' : 'Overridden'} by {m.accepted_by} on {m.accepted_at ? new Date(m.accepted_at).toLocaleString('en-AU') : '—'}
                          </p>
                        )}
                      </div>
                      {m.reconciliation_status === 'pending' && (
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button
                            onClick={() => { setSelectedMapping(m); setActionMode('accept'); setActionReason(m.recommended_action || ''); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                          </button>
                          <button
                            onClick={() => { setSelectedMapping(m); setActionMode('reject'); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors border border-red-200"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                          <button
                            onClick={() => { setSelectedMapping(m); setActionMode('override'); setOverrideCanonical(m.canonical_reference); setOverrideRelType(m.relationship_type); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                          >
                            <Eye className="w-3.5 h-3.5" /> Override
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action modal */}
            {selectedMapping && actionMode && (
              <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={() => { setSelectedMapping(null); setActionMode(null); }}>
                <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
                  <h3 className="text-base font-semibold text-slate-900 mb-1">
                    {actionMode === 'accept' ? 'Accept Reconciliation' : actionMode === 'reject' ? 'Reject Reconciliation' : 'Manual Override'}
                  </h3>
                  <p className="text-sm text-slate-500 mb-4">
                    {selectedMapping.canonical_reference} → {selectedMapping.historical_reference} ({RELATIONSHIP_LABELS[selectedMapping.relationship_type]})
                  </p>
                  {actionMode === 'override' && (
                    <div className="space-y-3 mb-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Canonical Reference</label>
                        <input className="input text-sm" value={overrideCanonical} onChange={e => setOverrideCanonical(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Relationship Type</label>
                        <select className="input text-sm" value={overrideRelType} onChange={e => setOverrideRelType(e.target.value as IdentityRelationshipType)}>
                          {Object.entries(RELATIONSHIP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Reason / Evidence</label>
                    <textarea className="input text-sm resize-none" rows={3} value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Explain the decision and evidence used…" />
                  </div>
                  <div className="flex justify-end gap-2 mt-5">
                    <button onClick={() => { setSelectedMapping(null); setActionMode(null); }} className="px-4 py-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
                    <button
                      onClick={handleAction}
                      disabled={acting || !actionReason.trim()}
                      className={`flex items-center gap-1.5 px-4 py-1.5 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors ${actionMode === 'reject' ? 'bg-red-600 hover:bg-red-700' : actionMode === 'override' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                      {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {actionMode === 'accept' ? 'Accept' : actionMode === 'reject' ? 'Reject' : 'Apply Override'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Audit Trail view */
          <div>
            {auditTrail.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-slate-400">
                <History className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No audit events yet. Accept or reject reconciliations to create an audit trail.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {auditTrail.map(a => (
                  <div key={a.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.action === 'accepted' ? 'bg-green-50 text-green-600' : a.action === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                      {a.action === 'accepted' ? <CheckCircle2 className="w-4 h-4" /> : a.action === 'rejected' ? <XCircle className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-slate-800 capitalize">{a.action}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{a.acted_by}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-xs text-slate-400">{new Date(a.acted_at).toLocaleString('en-AU')}</span>
                      </div>
                      {a.reason && <p className="text-xs text-slate-600 mt-1">{a.reason}</p>}
                      {a.evidence_used && <p className="text-[10px] text-slate-400 mt-1">Evidence: {a.evidence_used}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
