// EWO-014.19A.7SR.1 — Governed Missing Object Dialog
//
// Displays governed guidance when navigation cannot be completed because the
// referenced object does not exist. Never silently fails. Never navigates to
// an empty placeholder.

import { X, AlertCircle, ArrowRight, ShieldAlert } from 'lucide-react';
import type { NavigationFailure } from './engineeringNavigationService';
import { getObjectTypeLabel } from './engineeringNavigationService';

interface Props {
  failure: NavigationFailure;
  onClose: () => void;
  onCreateMissing?: (objectType: string, reference: string) => void;
}

export function GovernedNavigationDialog({ failure, onClose, onCreateMissing }: Props) {
  const isCreateAction = failure.recommendedAction.startsWith('Create Missing');
  const objectTypeLabel = getObjectTypeLabel(failure.objectType);

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
            <h2 className="text-base font-semibold text-slate-800">Engineering object unavailable</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reference</p>
            <p className="text-sm font-mono text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">{failure.reference}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Object Type</p>
            <p className="text-sm text-slate-600">{objectTypeLabel}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reason</p>
            <p className="text-sm text-slate-600 leading-relaxed">{failure.reason}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Next action</p>
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-blue-500 shrink-0" />
              <p className="text-sm text-blue-700 font-medium">{failure.recommendedAction}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reference Code</p>
            <p className="text-xs font-mono text-slate-400">{failure.referenceCode}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg transition-colors"
          >
            Close
          </button>
          {isCreateAction && onCreateMissing && (
            <button
              onClick={() => onCreateMissing(failure.objectType, failure.reference)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              {failure.recommendedAction}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
