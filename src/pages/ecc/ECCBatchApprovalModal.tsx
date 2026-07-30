import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, AlertCircle,
  Package as PackageIcon, Clock, FileText, Database, ArrowRight, X,
} from 'lucide-react';
import {
  governedBatchApproval,
  type BatchApprovalResult,
  type BatchProgressUpdate,
  type BatchItemResult,
  type RecoveryPackage,
  getRecoveryPackages,
} from '../../lib/historicalRecoveryService';

interface Props {
  open: boolean;
  selectedPackages: RecoveryPackage[];
  onClose: () => void;
  onComplete: () => void;
}

type Phase = 'confirm' | 'running' | 'complete';

export function BatchApprovalModal({ open, selectedPackages, onClose, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [progress, setProgress] = useState<BatchProgressUpdate | null>(null);
  const [result, setResult] = useState<BatchApprovalResult | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [perItemProgress, setPerItemProgress] = useState<Record<string, BatchProgressUpdate>>({});

  const reset = useCallback(() => {
    setPhase('confirm');
    setProgress(null);
    setResult(null);
    setExpandedItem(null);
    setPerItemProgress({});
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const handleApprove = async () => {
    setPhase('running');
    setPerItemProgress({});
    const ids = selectedPackages.map(p => p.id);
    const res = await governedBatchApproval(ids, 'Product Owner', 'Batch approval via Recovery Dashboard', (update) => {
      setProgress(update);
      setPerItemProgress(prev => ({ ...prev, [update.packageId]: update }));
    });
    setResult(res);
    setPhase('complete');
  };

  const handleClose = () => {
    if (phase === 'running') return; // Prevent closing during execution
    if (phase === 'complete') {
      onComplete();
    }
    onClose();
    reset();
  };

  if (!open) return null;

  const total = selectedPackages.length;
  const currentIndex = progress?.currentIndex ?? -1;
  const progressPercent = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={() => phase !== 'running' && handleClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {phase === 'complete' ? 'Recovery Complete' : 'Governed Batch Approval'}
              </h3>
              <p className="text-xs text-slate-500">
                {phase === 'confirm' && `Approve ${total} recovery package(s)`}
                {phase === 'running' && `Processing ${currentIndex + 1} of ${total}…`}
                {phase === 'complete' && `Batch ${result?.batchId} complete`}
              </p>
            </div>
          </div>
          {phase !== 'running' && (
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Confirm Phase */}
        {phase === 'confirm' && (
          <div className="p-6">
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-semibold text-blue-900 mb-2">Approve {total} Recovery Packages?</p>
              <p className="text-xs text-blue-700 mb-2">This will:</p>
              <ul className="text-xs text-blue-700 space-y-1 ml-4">
                <li className="flex items-center gap-1.5"><ArrowRight className="w-3 h-3" /> validate every package</li>
                <li className="flex items-center gap-1.5"><ArrowRight className="w-3 h-3" /> import approved Engineering Objects</li>
                <li className="flex items-center gap-1.5"><ArrowRight className="w-3 h-3" /> write Engineering Ledger entries</li>
                <li className="flex items-center gap-1.5"><ArrowRight className="w-3 h-3" /> archive Recovery Package</li>
                <li className="flex items-center gap-1.5"><ArrowRight className="w-3 h-3" /> preserve Recovery History</li>
              </ul>
            </div>

            <div className="mb-4 max-h-48 overflow-y-auto space-y-1">
              {selectedPackages.map(pkg => (
                <div key={pkg.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-slate-50">
                  <PackageIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono text-xs text-slate-600">{pkg.recovery_ref}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-700 truncate">{pkg.title}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
              <button
                onClick={handleApprove}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" /> Approve
              </button>
            </div>
          </div>
        )}

        {/* Running Phase */}
        {phase === 'running' && (
          <div className="p-6">
            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>Processing batch…</span>
                <span>{currentIndex + 1} / {total} ({progressPercent}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Per-package live status */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {selectedPackages.map((pkg, i) => {
                const itemProgress = perItemProgress[pkg.id];
                const stage = itemProgress?.stage;
                const isCurrent = i === currentIndex;
                const isPast = i < currentIndex;
                const isFuture = i > currentIndex;

                return (
                  <div
                    key={pkg.id}
                    className={`flex items-center gap-2 text-sm py-1.5 px-3 rounded-lg ${
                      isCurrent ? 'bg-blue-50 border border-blue-200' : isPast ? 'bg-slate-50' : ''
                    }`}
                  >
                    {stage === 'done' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : stage === 'failed' ? (
                      <XCircle className="w-4 h-4 text-rose-500" />
                    ) : stage === 'skipped' ? (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    ) : isFuture ? (
                      <div className="w-4 h-4 rounded-full border border-slate-200" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-200" />
                    )}
                    <span className="font-mono text-xs text-slate-600">{pkg.recovery_ref}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs text-slate-700 truncate flex-1">{pkg.title}</span>
                    {isCurrent && stage && (
                      <span className="text-xs text-blue-600 font-medium capitalize">{stage}</span>
                    )}
                    {stage === 'done' && <span className="text-xs text-emerald-600 font-medium">Success</span>}
                    {stage === 'failed' && <span className="text-xs text-rose-600 font-medium">Failed</span>}
                    {stage === 'skipped' && <span className="text-xs text-amber-600 font-medium">Skipped</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Complete Phase */}
        {phase === 'complete' && result && (
          <div className="p-6">
            {/* Summary stats */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
              <SummaryStat icon={PackageIcon} label="Processed" value={result.packagesProcessed} colour="text-slate-700 bg-slate-50" />
              <SummaryStat icon={CheckCircle2} label="Approved" value={result.approved} colour="text-emerald-700 bg-emerald-50" />
              <SummaryStat icon={AlertCircle} label="Skipped" value={result.skipped} colour="text-amber-700 bg-amber-50" />
              <SummaryStat icon={XCircle} label="Failed" value={result.failed} colour="text-rose-700 bg-rose-50" />
              <SummaryStat icon={Database} label="Objects Imported" value={result.objectsImported} colour="text-blue-700 bg-blue-50" />
              <SummaryStat icon={Clock} label="Duration" value={`${result.durationSeconds}s`} colour="text-slate-700 bg-slate-50" />
            </div>

            {/* Expandable per-package details */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {result.items.map((item, i) => {
                const displayReason = item.reason?.trim() || 'Unknown processing error';
                const stage = item.pipelineStage || (item.outcome === 'success' ? 'Completed' : 'Unknown');
                return (
                <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedItem(expandedItem === `${i}` ? null : `${i}`)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    {item.outcome === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : item.outcome === 'skipped' ? (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500" />
                    )}
                    <span className="font-mono text-xs text-slate-600">{item.recoveryRef}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs text-slate-700 truncate flex-1 text-left">{item.title}</span>
                    <span className={`text-xs font-medium uppercase ${
                      item.outcome === 'success' ? 'text-emerald-600' :
                      item.outcome === 'skipped' ? 'text-amber-600' : 'text-rose-600'
                    }`}>{item.outcome}</span>
                    {item.outcome === 'success' && item.ewoRef && (
                      <span className="text-xs text-blue-600 font-mono">{item.ewoRef}</span>
                    )}
                  </button>
                  {/* Inline stage + reason — always visible for failures and skips */}
                  {item.outcome !== 'success' && (
                    <div className="px-3 py-2 bg-rose-50/50 border-t border-rose-100 text-xs">
                      <p className="flex items-center gap-1.5 text-slate-700">
                        <span className="font-semibold text-slate-500 uppercase tracking-wide">Stage:</span>
                        <span className="font-medium">{stage}</span>
                      </p>
                      <p className="flex items-start gap-1.5 text-slate-700 mt-1">
                        <span className="font-semibold text-slate-500 uppercase tracking-wide shrink-0">Reason:</span>
                        <span>{displayReason}</span>
                      </p>
                    </div>
                  )}
                  {expandedItem === `${i}` && (
                    <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
                      {item.outcome === 'success' && (
                        <p><span className="font-semibold">Imported:</span> {item.objectsImported} object(s) — EWO {item.ewoRef}</p>
                      )}
                      <p className="text-slate-400 mt-1">Canonical: {item.canonicalReference}</p>
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg"
              >
                Close
              </button>
              <button
                disabled
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed"
                title="Future feature"
              >
                <FileText className="w-4 h-4" /> Export Summary
              </button>
              <button
                onClick={() => { onComplete(); onClose(); reset(); }}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ icon: Icon, label, value, colour }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  colour: string;
}) {
  return (
    <div className={`rounded-lg p-3 ${colour}`}>
      <Icon className="w-4 h-4 mb-1 opacity-70" />
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide font-medium opacity-70">{label}</p>
    </div>
  );
}
