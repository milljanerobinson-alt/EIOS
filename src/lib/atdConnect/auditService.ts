// EWO-024 — ATD Connect: Inspection Audit Service
// Every inspection request is recorded. Inspection history is available for review.

import { supabase } from '../supabase';
import type {
  InspectionLogEntry,
  InspectionOperation,
  InspectionOutcome,
} from './types';

function generateRequestId(): string {
  return `ATD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function recordInspection(params: {
  requestingPersona: string;
  operation: InspectionOperation;
  inspectedCapability?: string | null;
  inspectedObject?: string | null;
  durationMs?: number;
  outcome?: InspectionOutcome;
  errorMessage?: string | null;
  responseSummary?: Record<string, unknown> | null;
  requestSource?: string | null;
  clientId?: string | null;
  toolName?: string | null;
  mcpRequestId?: string | null;
}): Promise<string> {
  const requestId = generateRequestId();
  const { error } = await supabase
    .from('atd_connect_inspection_log')
    .insert({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      requesting_persona: params.requestingPersona,
      inspected_capability: params.inspectedCapability ?? null,
      inspected_object: params.inspectedObject ?? null,
      operation: params.operation,
      duration_ms: params.durationMs ?? null,
      outcome: params.outcome ?? 'success',
      error_message: params.errorMessage ?? null,
      response_summary: params.responseSummary ?? null,
      request_source: params.requestSource ?? 'workspace',
      client_id: params.clientId ?? null,
      tool_name: params.toolName ?? null,
      mcp_request_id: params.mcpRequestId ?? null,
    });

  if (error) {
    console.error('[ATD Connect] Failed to record inspection audit:', error.message);
  }

  return requestId;
}

export async function getInspectionHistory(limit = 50): Promise<InspectionLogEntry[]> {
  const { data, error } = await supabase
    .from('atd_connect_inspection_log')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as InspectionLogEntry[];
}

export async function getInspectionHistoryByPersona(persona: string, limit = 50): Promise<InspectionLogEntry[]> {
  const { data, error } = await supabase
    .from('atd_connect_inspection_log')
    .select('*')
    .eq('requesting_persona', persona)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as InspectionLogEntry[];
}

export async function getInspectionStats(): Promise<{
  total: number;
  successCount: number;
  errorCount: number;
  governedEmptyCount: number;
  governedRefusalCount: number;
  unresolvedCount: number;
  reconciles: boolean;
}> {
  // Fetch all rows to compute counts atomically from the same query boundary
  const { data: allRows, error: fetchErr } = await supabase
    .from('atd_connect_inspection_log')
    .select('outcome')
    .order('timestamp', { ascending: false });

  if (fetchErr) throw fetchErr;

  const rows = allRows ?? [];
  const total = rows.length;
  const successCount = rows.filter((r: Record<string, unknown>) => r.outcome === 'success').length;
  const errorCount = rows.filter((r: Record<string, unknown>) => r.outcome === 'error').length;
  const governedEmptyCount = rows.filter((r: Record<string, unknown>) => r.outcome === 'governed_empty').length;
  const governedRefusalCount = rows.filter((r: Record<string, unknown>) => r.outcome === 'governed_refusal').length;
  const unresolvedCount = rows.filter((r: Record<string, unknown>) => r.outcome === 'unresolved').length;

  // Invariant: total = success + error + governed_empty + governed_refusal + unresolved
  const sumOfCategories = successCount + errorCount + governedEmptyCount + governedRefusalCount + unresolvedCount;
  const reconciles = total === sumOfCategories;

  return {
    total,
    successCount,
    errorCount,
    governedEmptyCount,
    governedRefusalCount,
    unresolvedCount,
    reconciles,
  };
}
