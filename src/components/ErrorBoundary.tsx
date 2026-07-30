// EWO-017R.7 — Global & Feature Error Boundaries
// Every routed page executes inside a global Error Boundary.
// High-value workspaces get local feature boundaries.

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { recordRouteDiagnostic, generateCorrelationId } from '../lib/routeDiagnostics';

// ─── Global Error Boundary ──────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  routeKey?: string;
  componentName?: string;
  routeHash?: string;
  fallback?: (error: Error, correlationId: string, retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  correlationId: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, correlationId: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const correlationId = generateCorrelationId();
    return { hasError: true, error, correlationId };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const correlationId = this.state.correlationId ?? generateCorrelationId();
    recordRouteDiagnostic('render_error', {
      routeKey: this.props.routeKey,
      componentName: this.props.componentName,
      routeHash: this.props.routeHash,
      stackTrace: error.stack ?? errorInfo.componentStack ?? String(error),
      diagnosticData: { errorInfo },
    }).catch(() => {});
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, correlationId: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.correlationId ?? 'unknown', this.handleRetry);
      }
      return (
        <DefaultRenderFailure
          error={this.state.error}
          correlationId={this.state.correlationId ?? 'unknown'}
          onRetry={this.handleRetry}
          routeKey={this.props.routeKey}
          componentName={this.props.componentName}
        />
      );
    }
    return this.props.children;
  }
}

// ─── Default Render Failure UI ───────────────────────────────────────────────────

function DefaultRenderFailure({
  error,
  correlationId,
  onRetry,
  routeKey,
  componentName,
}: {
  error: Error;
  correlationId: string;
  onRetry: () => void;
  routeKey?: string;
  componentName?: string;
}) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-red-200 shadow-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <span className="text-red-600 text-xl">!</span>
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
          {routeKey && (
            <div className="flex gap-2">
              <span className="font-semibold text-slate-600 w-24 shrink-0">Route:</span>
              <span className="text-slate-700">{routeKey}</span>
            </div>
          )}
          {componentName && (
            <div className="flex gap-2">
              <span className="font-semibold text-slate-600 w-24 shrink-0">Component:</span>
              <span className="text-slate-700">{componentName}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="font-semibold text-slate-600 w-24 shrink-0">Error:</span>
            <span className="text-red-600 font-mono text-[11px]">{error.message}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Retry
          </button>
          <button
            onClick={() => { window.location.hash = '#/home'; }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800"
          >
            Return Home
          </button>
          <button
            onClick={() => {
              const diag = `Correlation: ${correlationId}\nRoute: ${routeKey ?? 'unknown'}\nComponent: ${componentName ?? 'unknown'}\nError: ${error.message}\nStack: ${error.stack ?? 'N/A'}`;
              navigator.clipboard?.writeText(diag).catch(() => {});
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Copy Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Feature Error Boundary (for high-value workspaces) ──────────────────────────

interface FeatureBoundaryProps {
  children: ReactNode;
  featureName: string;
  routeKey?: string;
}

export function FeatureErrorBoundary({ children, featureName, routeKey }: FeatureBoundaryProps) {
  return (
    <ErrorBoundary
      routeKey={routeKey}
      componentName={featureName}
      fallback={(error, correlationId, retry) => (
        <div className="p-6 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-red-600 text-lg">!</span>
              <h3 className="text-sm font-bold text-red-800">{featureName} — Render Failure</h3>
            </div>
            <p className="text-xs text-red-600">
              This feature encountered a rendering error. Other features remain available.
            </p>
            <div className="text-xs text-slate-600 space-y-1">
              <p><strong>Correlation ID:</strong> <span className="font-mono">{correlationId}</span></p>
              <p><strong>Error:</strong> <span className="font-mono">{error.message}</span></p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={retry}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Retry
              </button>
              <button
                onClick={() => { window.location.hash = '#/engineering/mission-control'; }}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                Return to Mission Control
              </button>
            </div>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

// ─── Feature boundaries for high-value workspaces ────────────────────────────────

export const ENGINEERING_BOUNDARY = 'Engineering';
export const RECOVERY_BOUNDARY = 'Historical Recovery';
export const EXECUTION_BOUNDARY = 'Execution Workspace';
export const ATD_BOUNDARY = 'ATD Workspace';
export const STANDARDS_BOUNDARY = 'Engineering Standards';
export const ROADMAP_BOUNDARY = 'Roadmap';
export const CONSTITUTION_BOUNDARY = 'Constitution';
export const DASHBOARD_BOUNDARY = 'Dashboard';
