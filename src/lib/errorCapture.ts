/**
 * Engineering Error Intelligence Framework — Error Capture Utility
 *
 * Captures frontend errors (runtime exceptions, unhandled rejections, manual logs)
 * and persists them to ecc_error_records via the Supabase client.
 *
 * Call initErrorCapture() once at app startup (e.g. main.tsx).
 * Call logError() anywhere to manually log a known error.
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ErrorType =
  | 'runtime'
  | 'network'
  | 'ui'
  | 'edge_function'
  | 'database'
  | 'auth'
  | 'validation'
  | 'unknown';

export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ErrorContext {
  componentPath?: string;
  errorType?: ErrorType;
  severity?: ErrorSeverity;
  requestContext?: Record<string, unknown>;
  responseContext?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  tags?: string[];
}

// ─── Core log function ────────────────────────────────────────────────────────

export async function logError(
  error: Error | unknown,
  context: ErrorContext = {},
): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const title = deriveTitle(err.message);
    const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

    const browserInfo = typeof window !== 'undefined'
      ? {
          browser: getBrowserName(userAgent),
          viewport: { width: window.innerWidth, height: window.innerHeight },
          platform: navigator.platform ?? '',
        }
      : null;

    const fingerprint = buildFingerprint(err.message, err.stack ?? '', context.componentPath);

    // Try upsert based on fingerprint stored in extra_context — if same error seen again,
    // increment occurrence_count and update last_seen_at instead of inserting a new row.
    const { data: existing } = await supabase
      .from('ecc_error_records')
      .select('id, occurrence_count')
      .eq('extra_context->>fingerprint', fingerprint)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('ecc_error_records')
        .update({
          occurrence_count: (existing.occurrence_count ?? 1) + 1,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      return;
    }

    const payload = {
      title,
      error_type:       context.errorType ?? classifyError(err),
      severity:         context.severity  ?? inferSeverity(err),
      message:          err.message,
      stack_trace:      err.stack ?? null,
      component_path:   context.componentPath ?? null,
      page_url:         pageUrl || null,
      user_agent:       userAgent || null,
      browser_info:     browserInfo,
      request_context:  context.requestContext  ?? null,
      response_context: context.responseContext ?? null,
      extra_context:    { ...(context.extra ?? {}), fingerprint },
      tags:             context.tags ?? [],
      first_seen_at:    new Date().toISOString(),
      last_seen_at:     new Date().toISOString(),
    };

    await supabase.from('ecc_error_records').insert(payload);
  } catch {
    // Never let error logging itself throw — that would cause infinite loops
  }
}

// ─── Global handler registration ─────────────────────────────────────────────

let _initialized = false;

export function initErrorCapture(): void {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    const err = event.error instanceof Error
      ? event.error
      : new Error(event.message || 'Script error');
    logError(err, {
      errorType: 'runtime',
      componentPath: event.filename ?? undefined,
      extra: { lineno: event.lineno, colno: event.colno },
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logError(err, { errorType: classifyError(err) });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveTitle(message: string): string {
  const clean = message
    .replace(/^(Error|TypeError|RangeError|ReferenceError|SyntaxError):\s*/i, '')
    .split('\n')[0]
    .trim();
  return clean.length > 120 ? clean.slice(0, 117) + '...' : clean || 'Unknown Error';
}

function classifyError(err: Error): ErrorType {
  const msg = (err.message + ' ' + (err.stack ?? '')).toLowerCase();
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('cors')) return 'network';
  if (msg.includes('supabase') || msg.includes('database') || msg.includes('postgres')) return 'database';
  if (msg.includes('auth') || msg.includes('unauthorized') || msg.includes('403')) return 'auth';
  if (msg.includes('edge function') || msg.includes('/functions/v1/')) return 'edge_function';
  if (msg.includes('render') || msg.includes('react') || msg.includes('component')) return 'ui';
  return 'runtime';
}

function inferSeverity(err: Error): ErrorSeverity {
  const msg = err.message.toLowerCase();
  if (msg.includes('crash') || msg.includes('fatal') || msg.includes('uncaught')) return 'critical';
  if (err instanceof TypeError || err instanceof ReferenceError) return 'high';
  if (msg.includes('timeout') || msg.includes('network')) return 'medium';
  return 'low';
}

function getBrowserName(ua: string): string {
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'Unknown';
}

function buildFingerprint(message: string, stack: string, component?: string): string {
  const stackFirst = stack.split('\n').slice(0, 3).join('|');
  const raw = `${message}|${stackFirst}|${component ?? ''}`;
  return btoa(raw.slice(0, 256)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
}
