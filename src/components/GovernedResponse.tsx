// EWO-020 — ES-003: Governed Response UI Components
//
// Reusable UI components for displaying governed responses.
// Four classifications share a consistent visual language:
//   Success (green), Information (blue), Guidance (amber), Failure (red)
//
// Supports: inline, modal, notification banner, empty state, wizard step

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, Info, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, ExternalLink, ArrowRight, Copy, X,
} from 'lucide-react';
import type { GovernedResponse, ResponseClassification } from '../lib/governedResponse';

// ─── Classification Styling ───────────────────────────────────────────────────

const CLASSIFICATION_STYLES: Record<
  ResponseClassification,
  {
    icon: typeof CheckCircle2;
    iconColor: string;
    bgColor: string;
    borderColor: string;
    titleColor: string;
    label: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    iconColor: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    titleColor: 'text-green-800',
    label: 'Success',
    badgeBg: 'bg-green-100',
    badgeText: 'text-green-700',
  },
  information: {
    icon: Info,
    iconColor: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    titleColor: 'text-blue-800',
    label: 'Information',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700',
  },
  guidance: {
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    titleColor: 'text-amber-800',
    label: 'Guidance',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-700',
  },
  failure: {
    icon: XCircle,
    iconColor: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    titleColor: 'text-red-800',
    label: 'Failure',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
  },
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

// ─── GovernedResponseCard ─────────────────────────────────────────────────────
//
// The core inline component. Renders the full governed response with
// title, summary, explanation, cause, recommended action, secondary actions,
// reference code, severity, and collapsible technical context.

export interface GovernedResponseCardProps {
  response: GovernedResponse;
  onAction?: (action: { label: string; href?: string; action?: () => void }) => void;
  onClose?: () => void;
  defaultExpanded?: boolean;
  'aria-label'?: string;
}

export function GovernedResponseCard({
  response,
  onAction,
  onClose,
  defaultExpanded = false,
  ...ariaProps
}: GovernedResponseCardProps) {
  const [showTechnical, setShowTechnical] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const style = CLASSIFICATION_STYLES[response.classification];
  const Icon = style.icon;

  const handleCopyRef = useCallback(() => {
    navigator.clipboard?.writeText(response.referenceCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [response.referenceCode]);

  const handleActionClick = (action: { label: string; href?: string; action?: () => void }) => {
    if (action.action) action.action();
    onAction?.(action);
  };

  return (
    <div
      className={`rounded-lg border ${style.borderColor} ${style.bgColor} p-4`}
      role="region"
      aria-label={ariaProps['aria-label'] ?? `${style.label}: ${response.title}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${style.iconColor} shrink-0 mt-0.5`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-sm font-semibold ${style.titleColor}`}>{response.title}</h3>
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${style.badgeBg} ${style.badgeText}`}>
              {style.label}
            </span>
            <span className="text-[10px] font-medium text-slate-500 uppercase">
              {SEVERITY_LABELS[response.severity] ?? response.severity}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">{response.summary}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            aria-label="Close response"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Explanation */}
      <div className="mt-3 ml-8">
        <p className="text-xs text-slate-700 leading-relaxed">{response.explanation}</p>
      </div>

      {/* Cause */}
      {response.cause && (
        <div className="mt-2 ml-8">
          <p className="text-xs text-slate-500">
            <span className="font-semibold">Cause:</span> {response.cause}
          </p>
        </div>
      )}

      {/* Recommended Next Action */}
      <div className="mt-3 ml-8">
        <div className="flex items-start gap-1.5">
          <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold text-slate-700">{response.recommendedNextAction}</p>
          </div>
        </div>
      </div>

      {/* Secondary Actions */}
      {response.secondaryActions && response.secondaryActions.length > 0 && (
        <div className="mt-2 ml-8 flex flex-wrap gap-2">
          {response.secondaryActions.map((action, i) => (
            <button
              key={i}
              onClick={() => handleActionClick(action)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-white/60 px-2 py-1 rounded transition-colors"
            >
              {action.href && <ExternalLink className="w-3 h-3" aria-hidden="true" />}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Reference Code + Technical Context toggle */}
      <div className="mt-3 ml-8 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Reference Code</span>
          <button
            onClick={handleCopyRef}
            className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-600 hover:text-slate-800 bg-white/50 px-1.5 py-0.5 rounded border border-slate-200 transition-colors"
            aria-label={`Copy reference code ${response.referenceCode}`}
          >
            <Copy className="w-3 h-3" aria-hidden="true" />
            {copied ? 'Copied!' : response.referenceCode}
          </button>
        </div>
        {response.technicalContext && (
          <button
            onClick={() => setShowTechnical(!showTechnical)}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
            aria-expanded={showTechnical}
            aria-controls="technical-context"
          >
            {showTechnical ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Technical Details
          </button>
        )}
      </div>

      {/* Technical Context (collapsible) */}
      {showTechnical && response.technicalContext && (
        <div id="technical-context" className="mt-2 ml-8">
          <pre className="text-[10px] font-mono text-slate-600 bg-white/50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
            {response.technicalContext}
          </pre>
        </div>
      )}

      {/* Related Engineering */}
      {response.relatedEngineering && response.relatedEngineering.length > 0 && (
        <div className="mt-2 ml-8 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Related:</span>
          {response.relatedEngineering.map((ref, i) => (
            <span key={i} className="text-[10px] font-mono text-slate-600 bg-white/40 px-1.5 py-0.5 rounded">
              {ref.label ? `${ref.label} (${ref.ref})` : ref.ref}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GovernedResponseBanner ───────────────────────────────────────────────────
//
// Compact notification banner for top-of-page or top-of-section display.
// Auto-dismisses after a configurable timeout (default 5s for success/info).

export interface GovernedResponseBannerProps {
  response: GovernedResponse;
  onDismiss?: () => void;
  autoDismissMs?: number | null;
  onAction?: (action: { label: string; href?: string; action?: () => void }) => void;
}

export function GovernedResponseBanner({
  response,
  onDismiss,
  autoDismissMs,
  onAction,
}: GovernedResponseBannerProps) {
  const [visible, setVisible] = useState(true);
  const style = CLASSIFICATION_STYLES[response.classification];
  const Icon = style.icon;

  const effectiveTimeout = autoDismissMs ?? (
    response.classification === 'success' || response.classification === 'information' ? 5000 : null
  );

  useEffect(() => {
    if (effectiveTimeout === null) return;
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, effectiveTimeout);
    return () => clearTimeout(timer);
  }, [effectiveTimeout, onDismiss]);

  if (!visible) return null;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border ${style.borderColor} ${style.bgColor} px-4 py-3`}
      role="alert"
      aria-live={response.classification === 'failure' ? 'assertive' : 'polite'}
    >
      <Icon className={`w-4 h-4 ${style.iconColor} shrink-0`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-700">{response.summary}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] font-bold text-slate-500 uppercase">Ref</span>
        <span className="text-[10px] font-mono text-slate-600">{response.referenceCode}</span>
      </div>
      {onDismiss && (
        <button
          onClick={() => { setVisible(false); onDismiss(); }}
          className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── GovernedResponseModal ─────────────────────────────────────────────────────
//
// Full modal dialog for blocking responses that require user attention.

export interface GovernedResponseModalProps {
  response: GovernedResponse | null;
  onClose: () => void;
  onAction?: (action: { label: string; href?: string; action?: () => void }) => void;
}

export function GovernedResponseModal({ response, onClose, onAction }: GovernedResponseModalProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  useEffect(() => {
    if (response) {
      setShowTechnical(false);
    }
  }, [response]);

  if (!response) return null;
  const style = CLASSIFICATION_STYLES[response.classification];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="governed-response-modal-title"
      onClick={onClose}
    >
      <div
        className={`max-w-lg w-full mx-4 rounded-xl border ${style.borderColor} bg-white shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 ${style.bgColor} border-b ${style.borderColor}`}>
          <div className="flex items-center gap-2.5">
            <style.icon className={`w-5 h-5 ${style.iconColor}`} aria-hidden="true" />
            <h2 id="governed-response-modal-title" className={`text-sm font-semibold ${style.titleColor}`}>
              {response.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">What Happened</p>
            <p className="text-sm text-slate-700">{response.summary}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Why It Happened</p>
            <p className="text-sm text-slate-700">{response.explanation}</p>
          </div>

          {response.cause && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Cause</p>
              <p className="text-sm text-slate-600">{response.cause}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">What You Can Do Next</p>
            <p className="text-sm font-medium text-slate-800">{response.recommendedNextAction}</p>
          </div>

          {response.secondaryActions && response.secondaryActions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {response.secondaryActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (action.action) action.action();
                    onAction?.(action);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-300 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {action.href && <ExternalLink className="w-3 h-3" />}
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {response.technicalContext && (
            <div>
              <button
                onClick={() => setShowTechnical(!showTechnical)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                aria-expanded={showTechnical}
              >
                {showTechnical ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Technical Details
              </button>
              {showTechnical && (
                <pre className="mt-2 text-[10px] font-mono text-slate-600 bg-slate-50 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                  {response.technicalContext}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Reference Code</span>
            <span className="text-[10px] font-mono text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">{response.referenceCode}</span>
          </div>
          <span className="text-[10px] font-medium text-slate-400 uppercase">
            {SEVERITY_LABELS[response.severity] ?? response.severity}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── GovernedResponseEmptyState ────────────────────────────────────────────────
//
// Empty state component for views with no data.

export function GovernedResponseEmptyState({ response }: { response: GovernedResponse }) {
  const style = CLASSIFICATION_STYLES[response.classification];
  const Icon = style.icon;

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center" role="status">
      <Icon className={`w-10 h-10 ${style.iconColor} opacity-60 mb-3`} aria-hidden="true" />
      <h3 className="text-sm font-semibold text-slate-700">{response.title}</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-sm">{response.summary}</p>
      <p className="text-xs text-slate-600 mt-3 max-w-sm">{response.recommendedNextAction}</p>
      <div className="flex items-center gap-1.5 mt-4">
        <span className="text-[10px] font-bold text-slate-400 uppercase">Reference Code</span>
        <span className="text-[10px] font-mono text-slate-500 bg-white/60 px-1.5 py-0.5 rounded border border-slate-200">{response.referenceCode}</span>
      </div>
    </div>
  );
}

// ─── useGovernedResponse Hook ─────────────────────────────────────────────────
//
// React hook for managing governed response state in components.

import { useRef } from 'react';

export function useGovernedResponse() {
  const [response, setResponse] = useState<GovernedResponse | null>(null);
  const [bannerResponse, setBannerResponse] = useState<GovernedResponse | null>(null);
  const [modalResponse, setModalResponse] = useState<GovernedResponse | null>(null);
  const idRef = useRef(0);

  const showInline = useCallback((resp: GovernedResponse) => {
    setResponse(resp);
  }, []);

  const showBanner = useCallback((resp: GovernedResponse) => {
    setBannerResponse(resp);
  }, []);

  const showModal = useCallback((resp: GovernedResponse) => {
    setModalResponse(resp);
  }, []);

  const dismissInline = useCallback(() => setResponse(null), []);
  const dismissBanner = useCallback(() => setBannerResponse(null), []);
  const dismissModal = useCallback(() => setModalResponse(null), []);

  return {
    response,
    bannerResponse,
    modalResponse,
    showInline,
    showBanner,
    showModal,
    dismissInline,
    dismissBanner,
    dismissModal,
  };
}
