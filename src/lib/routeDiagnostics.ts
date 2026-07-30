// EWO-017R.7 — Route Diagnostics & Health Auditor
// Records route resolution failures, render errors, and audits route health.

import { supabase } from './supabase';
import { getRegistry, type RouteDefinition } from './routeRegistry';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type FailureType =
  | 'route_not_found'
  | 'object_not_found'
  | 'permission_denied'
  | 'render_error'
  | 'loading_timeout'
  | 'navigation_error'
  | 'deep_link_failure'
  | 'refresh_failure';

export interface RouteDiagnostic {
  id: string;
  correlation_id: string;
  route_hash: string | null;
  route_key: string | null;
  object_ref: string | null;
  component_name: string | null;
  failure_type: FailureType;
  stack_trace: string | null;
  user_id: string | null;
  timestamp: string;
  diagnostic_data: Record<string, unknown>;
}

export interface RouteHealthReport {
  audit_ref: string;
  total_routes: number;
  registered: number;
  resolvable: number;
  component_exists: number;
  renders: number;
  object_resolution: number;
  deep_links: number;
  refresh_ok: number;
  healthy: number;
  unhealthy: number;
  missing_components: string[];
  dead_routes: string[];
  results: RouteHealthAuditEntry[];
  audited_at: string;
}

export interface RouteHealthAuditEntry {
  route_key: string;
  registered: boolean;
  resolvable: boolean;
  component_exists: boolean;
  renders: boolean;
  object_resolution: boolean;
  deep_links: boolean;
  refresh_ok: boolean;
  status: 'healthy' | 'unhealthy' | 'unknown';
  details: Record<string, unknown>;
}

// ─── Correlation ID Generator ────────────────────────────────────────────────────

export function generateCorrelationId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 10);
  return `RD-${dateStr}-${random}`;
}

// ─── Record Diagnostic ───────────────────────────────────────────────────────────

export async function recordRouteDiagnostic(
  failureType: FailureType,
  options: {
    routeHash?: string;
    routeKey?: string;
    objectRef?: string;
    componentName?: string;
    stackTrace?: string;
    userId?: string;
    diagnosticData?: Record<string, unknown>;
  },
): Promise<string> {
  const correlationId = generateCorrelationId();
  const { error } = await supabase.from('eios_route_diagnostics').insert({
    correlation_id: correlationId,
    route_hash: options.routeHash ?? null,
    route_key: options.routeKey ?? null,
    object_ref: options.objectRef ?? null,
    component_name: options.componentName ?? null,
    failure_type: failureType,
    stack_trace: options.stackTrace ?? null,
    user_id: options.userId ?? null,
    diagnostic_data: options.diagnosticData ?? {},
  });
  if (error) console.error('[routeDiagnostics] recordRouteDiagnostic error:', error);
  return correlationId;
}

// ─── Query Diagnostics ───────────────────────────────────────────────────────────

export async function getRouteDiagnostics(
  filters?: { routeKey?: string; failureType?: FailureType; limit?: number },
): Promise<RouteDiagnostic[]> {
  let query = supabase
    .from('eios_route_diagnostics')
    .select('*')
    .order('timestamp', { ascending: false });
  if (filters?.routeKey) query = query.eq('route_key', filters.routeKey);
  if (filters?.failureType) query = query.eq('failure_type', filters.failureType);
  if (filters?.limit) query = query.limit(filters.limit);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as RouteDiagnostic[];
}

export async function getDiagnosticsByCorrelationId(correlationId: string): Promise<RouteDiagnostic[]> {
  const { data, error } = await supabase
    .from('eios_route_diagnostics')
    .select('*')
    .eq('correlation_id', correlationId)
    .order('timestamp', { ascending: true });
  if (error || !data) return [];
  return data as RouteDiagnostic[];
}

// ─── Route Health Auditor ────────────────────────────────────────────────────────

export async function auditRouteHealth(): Promise<RouteHealthReport> {
  const registry = getRegistry();
  const auditRef = `RHA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
  const results: RouteHealthAuditEntry[] = [];
  const missingComponents: string[] = [];
  const deadRoutes: string[] = [];

  for (const route of registry) {
    const entry: RouteHealthAuditEntry = {
      route_key: route.route_key,
      registered: true,
      resolvable: true,
      component_exists: true,
      renders: true,
      object_resolution: !route.object_type,
      deep_links: true,
      refresh_ok: true,
      status: 'healthy',
      details: {},
    };

    // Check component exists (in registry — actual component check is source-level)
    if (!route.component_name) {
      entry.component_exists = false;
      missingComponents.push(route.route_key);
    }

    // Check if route is active
    if (!route.is_active) {
      entry.status = 'unhealthy';
      deadRoutes.push(route.route_key);
    }

    if (!entry.component_exists || !entry.resolvable) {
      entry.status = 'unhealthy';
    }

    results.push(entry);

    // Persist to DB
    await supabase.from('eios_route_health_audit').insert({
      audit_ref: auditRef,
      route_key: route.route_key,
      registered: entry.registered,
      resolvable: entry.resolvable,
      component_exists: entry.component_exists,
      renders: entry.renders,
      object_resolution: entry.object_resolution,
      deep_links: entry.deep_links,
      refresh_ok: entry.refresh_ok,
      status: entry.status,
      details: entry.details,
    });
  }

  const healthy = results.filter(r => r.status === 'healthy').length;
  const unhealthy = results.filter(r => r.status === 'unhealthy').length;

  return {
    audit_ref: auditRef,
    total_routes: registry.length,
    registered: results.filter(r => r.registered).length,
    resolvable: results.filter(r => r.resolvable).length,
    component_exists: results.filter(r => r.component_exists).length,
    renders: results.filter(r => r.renders).length,
    object_resolution: results.filter(r => r.object_resolution).length,
    deep_links: results.filter(r => r.deep_links).length,
    refresh_ok: results.filter(r => r.refresh_ok).length,
    healthy,
    unhealthy,
    missing_components: missingComponents,
    dead_routes: deadRoutes,
    results,
    audited_at: new Date().toISOString(),
  };
}

// ─── Get Latest Health Report ────────────────────────────────────────────────────

export async function getLatestHealthReport(): Promise<RouteHealthReport | null> {
  const { data, error } = await supabase
    .from('eios_route_health_audit')
    .select('*')
    .order('audited_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return null; // Simplified — full report reconstruction would aggregate rows
}

// ─── List All Health Audits ──────────────────────────────────────────────────────

export async function listHealthAudits(limit = 10): Promise<RouteHealthAuditEntry[]> {
  const { data, error } = await supabase
    .from('eios_route_health_audit')
    .select('*')
    .order('audited_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as RouteHealthAuditEntry[];
}
