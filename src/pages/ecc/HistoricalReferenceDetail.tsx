import { useState, useEffect } from 'react';
import { X, FileText, Calendar, Search, AlertCircle, Ban } from 'lucide-react';
import { getHistoricalReference, type HistoricalReference } from '../../lib/ensureEngineeringWorkOrder';
import { EngineeringBreadcrumbs } from '../../components/ecc/EngineeringBreadcrumbs';

export function HistoricalReferenceDetail({
  reference,
  onClose,
}: {
  reference: string;
  onClose: () => void;
}) {
  const [ref, setRef] = useState<HistoricalReference | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getHistoricalReference(reference).then(data => {
      setRef(data);
      setLoading(false);
    });
  }, [reference]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="animate-spin w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full" />
      </div>
    );
  }

  if (!ref) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Historical Reference not found.</p>
          <button onClick={onClose} className="mt-4 text-xs text-blue-600 hover:text-blue-700">Back to ledger</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="px-6 py-2.5 bg-white border-b border-slate-200 shrink-0">
        <EngineeringBreadcrumbs objectRef={ref.reference} />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Heading */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                <Ban className="w-3 h-3" /> Historical Reference
              </span>
              <span className="text-xs text-slate-400">Status: Historical — Not Issued</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">REFERENCE NOT ISSUED</h1>
            <p className="text-sm text-slate-500 mt-1">{ref.reference}</p>
          </div>

          {/* Key facts */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
            <div className="grid grid-cols-2 divide-x divide-slate-200">
              <div className="p-5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Reference</p>
                <p className="text-sm font-semibold text-slate-900">{ref.reference}</p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Investigation Date</p>
                <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {new Date(ref.investigation_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="border-t border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Audit Reference</p>
              <p className="text-sm font-semibold text-slate-900">{ref.audit_ref}</p>
            </div>
            <div className="border-t border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Product Owner</p>
              <p className="text-sm font-semibold text-slate-900">{ref.product_owner || 'Millie Robinson'}</p>
              <p className="text-xs text-slate-400 mt-0.5">Responsible for historical governance decision</p>
            </div>
          </div>

          {/* Evidence Summary */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" /> Evidence Summary
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">{ref.evidence_summary}</p>
          </div>

          {/* Audit Conclusion */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" /> Audit Conclusion
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">{ref.conclusion}</p>
          </div>

          {/* Historical Explanation */}
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 mb-6">
            <h2 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" /> Historical Explanation
            </h2>
            <p className="text-sm text-amber-800 leading-relaxed">{ref.historical_explanation}</p>
          </div>

          {/* Not Applicable Section */}
          <div className="bg-slate-100 rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Not Applicable</h2>
            <ul className="space-y-2 text-sm text-slate-500">
              <li className="flex items-center gap-2"><X className="w-3.5 h-3.5 text-slate-400" /> No Engineering Work Order existed.</li>
              <li className="flex items-center gap-2"><X className="w-3.5 h-3.5 text-slate-400" /> No implementation occurred.</li>
              <li className="flex items-center gap-2"><X className="w-3.5 h-3.5 text-slate-400" /> Verification not applicable.</li>
              <li className="flex items-center gap-2"><X className="w-3.5 h-3.5 text-slate-400" /> Completion Report not applicable.</li>
              <li className="flex items-center gap-2"><X className="w-3.5 h-3.5 text-slate-400" /> Product Owner Acceptance not applicable.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Back button */}
      <div className="absolute bottom-6 right-6">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow transition-all"
        >
          <X className="w-3.5 h-3.5" /> Close
        </button>
      </div>
    </div>
  );
}
