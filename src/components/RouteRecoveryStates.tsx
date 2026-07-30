// EWO-017R.7 — Universal Route Recovery States
// Loading, Not Found, and Render Failure states for every routed page.
// No route may ever render blank — these states guarantee governed feedback.

import { type ReactNode } from 'react';
import { Loader2, AlertCircle, Search, Home, ArrowLeft, RefreshCw, ExternalLink } from 'lucide-react';

// ─── Universal Loading State ─────────────────────────────────────────────────────

export function RouteLoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6" data-testid="route-loading-state">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
    </div>
  );
}

// ─── Universal Not Found State ───────────────────────────────────────────────────

export interface NotFoundStateProps {
  objectType?: string;
  reference?: string;
  reason?: string;
  recoveryActions?: ReactNode;
}

export function RouteNotFoundState({
  objectType = 'Object',
  reference,
  reason = 'The requested item could not be found.',
  recoveryActions,
}: NotFoundStateProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6" data-testid="route-not-found-state">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-amber-200 shadow-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
            <Search className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Not Found</h2>
            <p className="text-xs text-slate-500">The requested item is unavailable.</p>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex gap-2">
            <span className="font-semibold text-slate-600 w-24 shrink-0">Object type:</span>
            <span className="text-slate-700">{objectType}</span>
          </div>
          {reference && (
            <div className="flex gap-2">
              <span className="font-semibold text-slate-600 w-24 shrink-0">Reference:</span>
              <span className="text-slate-700 font-mono">{reference}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="font-semibold text-slate-600 w-24 shrink-0">Reason:</span>
            <span className="text-slate-700">{reason}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
          {recoveryActions ?? (
            <>
              <button
                onClick={() => window.history.back()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Return to previous page
              </button>
              <button
                onClick={() => { window.location.hash = '#/home'; }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800"
              >
                <Home className="w-3.5 h-3.5" />
                Return to Dashboard
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Universal Render Failure State ──────────────────────────────────────────────

export interface RenderFailureStateProps {
  correlationId: string;
  route?: string;
  component?: string;
  error?: Error | null;
  onRetry?: () => void;
}

export function RouteRenderFailureState({
  correlationId,
  route,
  component,
  error,
  onRetry,
}: RenderFailureStateProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6" data-testid="route-render-failure-state">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-red-200 shadow-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Render Failure</h2>
            <p className="text-xs text-slate-500">This page encountered a rendering error.</p>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex gap-2">
            <span className="font-semibold text-slate-600 w-24 shrink-0">Correlation ID:</span>
            <span className="text-slate-700 font-mono">{correlationId}</span>
          </div>
          {route && (
            <div className="flex gap-2">
              <span className="font-semibold text-slate-600 w-24 shrink-0">Route:</span>
              <span className="text-slate-700">{route}</span>
            </div>
          )}
          {component && (
            <div className="flex gap-2">
              <span className="font-semibold text-slate-600 w-24 shrink-0">Component:</span>
              <span className="text-slate-700">{component}</span>
            </div>
          )}
          {error && (
            <div className="flex gap-2">
              <span className="font-semibold text-slate-600 w-24 shrink-0">Error:</span>
              <span className="text-red-600 font-mono text-[11px]">{error.message}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
          <button
            onClick={() => { window.location.hash = '#/home'; }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800"
          >
            <Home className="w-3.5 h-3.5" />
            Return Home
          </button>
          <button
            onClick={() => {
              const diag = `Correlation: ${correlationId}\nRoute: ${route ?? 'unknown'}\nComponent: ${component ?? 'unknown'}\nError: ${error?.message ?? 'N/A'}\nStack: ${error?.stack ?? 'N/A'}`;
              navigator.clipboard?.writeText(diag).catch(() => {});
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Copy Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hook: useRouteRecovery ──────────────────────────────────────────────────────
// Provides loading, notFound, and error states for routed pages.

export interface RouteRecoveryState {
  loading: boolean;
  notFound: boolean;
  error: Error | null;
  correlationId: string | null;
}

export function routeRecoveryGuard(
  state: RouteRecoveryState,
  content: ReactNode,
  options?: { objectType?: string; reference?: string },
): ReactNode {
  if (state.loading) return <RouteLoadingState />;
  if (state.notFound) return <RouteNotFoundState objectType={options?.objectType} reference={options?.reference} />;
  if (state.error) {
    return (
      <RouteRenderFailureState
        correlationId={state.correlationId ?? 'unknown'}
        error={state.error}
      />
    );
  }
  return content;
}
