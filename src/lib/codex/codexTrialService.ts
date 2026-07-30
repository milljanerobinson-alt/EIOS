/**
 * EWO-030: Codex Trial Metrics Service
 *
 * Records comparison metrics for every Codex execution and provides
 * a Product Owner-facing trial dashboard summary.
 */

import { supabase } from '../supabase';
import type { CodexTrialMetric } from './codexTypes';

/**
 * Record a trial metric for a Codex execution.
 */
export async function recordTrialMetric(metric: CodexTrialMetric): Promise<void> {
  await supabase.from('codex_trial_metrics').insert({
    execution_ref: metric.execution_ref,
    ewo_ref: metric.ewo_ref,
    task_type: metric.task_type,
    complexity_classification: metric.complexity_classification,
    risk_classification: metric.risk_classification,
    execution_duration_ms: metric.execution_duration_ms,
    estimated_cost_usd: metric.estimated_cost_usd,
    actual_cost_usd: metric.actual_cost_usd,
    input_tokens: metric.input_tokens,
    cached_input_tokens: metric.cached_input_tokens,
    output_tokens: metric.output_tokens,
    files_changed: metric.files_changed,
    files_created: metric.files_created,
    files_modified: metric.files_modified,
    files_deleted: metric.files_deleted,
    tests_passed: metric.tests_passed,
    tests_failed: metric.tests_failed,
    retry_count: metric.retry_count,
    manual_corrections_required: metric.manual_corrections_required,
    governance_interventions: metric.governance_interventions,
    completion_package_quality: metric.completion_package_quality,
    product_owner_result: metric.product_owner_result,
    accepted_or_rejected: metric.accepted_or_rejected,
    bolt_subsequently_required: metric.bolt_subsequently_required,
    rejection_or_escalation_reason: metric.rejection_or_escalation_reason,
  });
}

/**
 * Get trial metrics for a specific execution.
 */
export async function getTrialMetric(executionRef: string): Promise<CodexTrialMetric | null> {
  const { data, error } = await supabase
    .from('codex_trial_metrics')
    .select('*')
    .eq('execution_ref', executionRef)
    .maybeSingle();
  if (error || !data) return null;
  return mapToMetric(data);
}

/**
 * Get all trial metrics for an EWO.
 */
export async function getTrialMetricsByEwo(ewoRef: string): Promise<CodexTrialMetric[]> {
  const { data, error } = await supabase
    .from('codex_trial_metrics')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapToMetric);
}

/**
 * Get all trial metrics for the dashboard.
 */
export async function getAllTrialMetrics(): Promise<CodexTrialMetric[]> {
  const { data, error } = await supabase
    .from('codex_trial_metrics')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapToMetric);
}

/**
 * Get a summary of trial metrics for the Product Owner dashboard.
 */
export async function getTrialDashboardSummary(): Promise<{
  total_executions: number;
  accepted: number;
  rejected: number;
  pending: number;
  bolt_subsequently_required: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_files_changed: number;
  total_tests_passed: number;
  total_tests_failed: number;
  total_retries: number;
  total_governance_interventions: number;
  average_duration_ms: number;
  average_cost_usd: number;
  acceptance_rate: number;
  recent_executions: CodexTrialMetric[];
}> {
  const allMetrics = await getAllTrialMetrics();

  const total = allMetrics.length;
  const accepted = allMetrics.filter(m => m.accepted_or_rejected === 'accepted').length;
  const rejected = allMetrics.filter(m => m.accepted_or_rejected === 'rejected').length;
  const pending = allMetrics.filter(m => m.accepted_or_rejected === 'pending').length;
  const boltRequired = allMetrics.filter(m => m.bolt_subsequently_required).length;
  const totalCost = allMetrics.reduce((sum, m) => sum + m.actual_cost_usd, 0);
  const totalInputTokens = allMetrics.reduce((sum, m) => sum + m.input_tokens, 0);
  const totalOutputTokens = allMetrics.reduce((sum, m) => sum + m.output_tokens, 0);
  const totalFiles = allMetrics.reduce((sum, m) => sum + m.files_changed, 0);
  const totalTestsPassed = allMetrics.reduce((sum, m) => sum + m.tests_passed, 0);
  const totalTestsFailed = allMetrics.reduce((sum, m) => sum + m.tests_failed, 0);
  const totalRetries = allMetrics.reduce((sum, m) => sum + m.retry_count, 0);
  const totalInterventions = allMetrics.reduce((sum, m) => sum + m.governance_interventions, 0);
  const totalDuration = allMetrics.reduce((sum, m) => sum + m.execution_duration_ms, 0);

  return {
    total_executions: total,
    accepted,
    rejected,
    pending,
    bolt_subsequently_required: boltRequired,
    total_cost_usd: Math.round(totalCost * 100) / 100,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    total_files_changed: totalFiles,
    total_tests_passed: totalTestsPassed,
    total_tests_failed: totalTestsFailed,
    total_retries: totalRetries,
    total_governance_interventions: totalInterventions,
    average_duration_ms: total > 0 ? Math.round(totalDuration / total) : 0,
    average_cost_usd: total > 0 ? Math.round((totalCost / total) * 100) / 100 : 0,
    acceptance_rate: total > 0 ? Math.round((accepted / total) * 100) / 100 : 0,
    recent_executions: allMetrics.slice(0, 20),
  };
}

function mapToMetric(data: Record<string, unknown>): CodexTrialMetric {
  return {
    execution_ref: data.execution_ref as string,
    ewo_ref: data.ewo_ref as string,
    task_type: data.task_type as string,
    complexity_classification: data.complexity_classification as string,
    risk_classification: data.risk_classification as string,
    execution_duration_ms: data.execution_duration_ms as number,
    estimated_cost_usd: parseFloat(String(data.estimated_cost_usd || 0)),
    actual_cost_usd: parseFloat(String(data.actual_cost_usd || 0)),
    input_tokens: data.input_tokens as number,
    cached_input_tokens: data.cached_input_tokens as number,
    output_tokens: data.output_tokens as number,
    files_changed: data.files_changed as number,
    files_created: data.files_created as number,
    files_modified: data.files_modified as number,
    files_deleted: data.files_deleted as number,
    tests_passed: data.tests_passed as number,
    tests_failed: data.tests_failed as number,
    retry_count: data.retry_count as number,
    manual_corrections_required: data.manual_corrections_required as number,
    governance_interventions: data.governance_interventions as number,
    completion_package_quality: data.completion_package_quality as string,
    product_owner_result: data.product_owner_result as string,
    accepted_or_rejected: data.accepted_or_rejected as 'accepted' | 'rejected' | 'pending',
    bolt_subsequently_required: data.bolt_subsequently_required as boolean,
    rejection_or_escalation_reason: data.rejection_or_escalation_reason as string | null,
  };
}
