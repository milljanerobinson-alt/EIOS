import { useState, useEffect } from 'react';
import { Fingerprint, ArrowRight, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import {
  type IdentityMapping,
  getIdentityMappings,
} from '../../lib/identityReconciliationService';

const RELATIONSHIP_LABELS: Record<string, string> = {
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

export function EngineeringIdentityPanel({ ewoRef }: { ewoRef: string }) {
  const [mappings, setMappings] = useState<IdentityMapping[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const data = await getIdentityMappings(ewoRef);
      if (!cancelled) {
        setMappings(data);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ewoRef]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-4">
        <Fingerprint className="w-4.5 h-4.5 text-blue-600" />
        <h3 className="text-sm font-semibold text-slate-800">Engineering Identity</h3>
      </div>

      {mappings.length === 0 ? (
        <p className="text-sm text-slate-400">
          No historical identity mappings for this work order. This is the canonical identity: <span className="font-mono font-semibold text-slate-600">{ewoRef}</span>.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Canonical identity */}
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono font-semibold text-slate-800">{ewoRef}</span>
            <span className="text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Canonical Reference</span>
          </div>

          {/* Historical mappings */}
          {mappings.map(m => (
            <div key={m.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-1.5">
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-sm font-mono text-slate-700">{m.historical_reference}</span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${CONFIDENCE_COLOURS[m.confidence]}`}>
                  {m.confidence}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLOURS[m.reconciliation_status]}`}>
                  {m.reconciliation_status}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Relationship: <strong className="text-slate-700">{RELATIONSHIP_LABELS[m.relationship_type] || m.relationship_type}</strong></span>
                <span>·</span>
                <span>{m.historical_type}</span>
              </div>
              {m.provenance && (
                <p className="text-xs text-slate-500 mt-1.5 bg-white rounded px-2.5 py-1.5 border border-slate-100">{m.provenance}</p>
              )}
              {m.accepted_by && (
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {m.reconciliation_status === 'accepted' ? 'Accepted' : m.reconciliation_status === 'rejected' ? 'Rejected' : 'Overridden'} by {m.accepted_by}
                  {m.accepted_at ? ` on ${new Date(m.accepted_at).toLocaleDateString('en-AU')}` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {mappings.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500">
            Historical identities are additive. The canonical reference <span className="font-mono">{ewoRef}</span> never changes. All historical references and aliases are preserved for provenance.
          </p>
        </div>
      )}
    </div>
  );
}
