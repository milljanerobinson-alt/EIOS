/**
 * EWO-030: Codex Budget & Cost Controls
 *
 * Governed budget configuration for Codex executions. Pricing is configurable
 * governed metadata — never embedded in routing logic. Unknown or stale pricing
 * is never treated as zero.
 */

import { supabase } from '../supabase';
import type { CodexBudgetConfig, CodexPricingSnapshot, CodexCostEstimate } from './codexTypes';
import { codexAdapter } from './codexAdapter';
import type { CodexExecutionRequest } from './codexTypes';

/**
 * Get the active budget configuration for an environment.
 */
export async function getBudgetConfig(environment: string): Promise<CodexBudgetConfig | null> {
  const { data, error } = await supabase
    .from('codex_budget_config')
    .select('*')
    .eq('environment', environment)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`Failed to retrieve budget config: ${error.message}`);
  if (!data) return null;

  return {
    environment: data.environment,
    per_execution_limit_usd: parseFloat(data.per_execution_limit_usd),
    per_ewo_limit_usd: parseFloat(data.per_ewo_limit_usd),
    daily_limit_usd: parseFloat(data.daily_limit_usd),
    monthly_limit_usd: parseFloat(data.monthly_limit_usd),
    warning_threshold_pct: parseFloat(data.warning_threshold_pct),
    approval_threshold_pct: parseFloat(data.approval_threshold_pct),
    hard_stop_threshold_pct: parseFloat(data.hard_stop_threshold_pct),
    currency: data.currency,
    input_token_price_per_1m: parseFloat(data.input_token_price_per_1m),
    cached_input_token_price_per_1m: parseFloat(data.cached_input_token_price_per_1m),
    output_token_price_per_1m: parseFloat(data.output_token_price_per_1m),
    pricing_effective_date: data.pricing_effective_date,
    pricing_source: data.pricing_source,
    pricing_snapshot: data.pricing_snapshot || {},
    is_active: data.is_active,
  };
}

/**
 * Get the current pricing snapshot from the governed budget config.
 */
export async function getPricingSnapshot(environment: string): Promise<CodexPricingSnapshot | null> {
  const config = await getBudgetConfig(environment);
  if (!config) return null;

  return {
    input_token_price_per_1m: config.input_token_price_per_1m,
    cached_input_token_price_per_1m: config.cached_input_token_price_per_1m,
    output_token_price_per_1m: config.output_token_price_per_1m,
    currency: config.currency,
    effective_date: config.pricing_effective_date,
    source: config.pricing_source,
  };
}

/**
 * Validate that a planned execution is within budget limits.
 * Returns a budget validation result with the budget status.
 */
export async function validateBudget(
  request: CodexExecutionRequest,
  environment: string,
): Promise<{
  within_limits: boolean;
  budget_status: 'within_limits' | 'warning' | 'approval_required' | 'exceeded';
  estimated_cost_usd: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  per_execution_limit: number;
  per_ewo_limit: number;
  daily_limit: number;
  monthly_limit: number;
  ewo_accumulated_cost: number;
  daily_accumulated_cost: number;
  monthly_accumulated_cost: number;
  warning_threshold: number;
  approval_threshold: number;
  hard_stop_threshold: number;
  rejection_reason: string | null;
}> {
  const config = await getBudgetConfig(environment);

  if (!config) {
    return {
      within_limits: false,
      budget_status: 'exceeded',
      estimated_cost_usd: 0,
      estimated_input_tokens: 0,
      estimated_output_tokens: 0,
      per_execution_limit: 0,
      per_ewo_limit: 0,
      daily_limit: 0,
      monthly_limit: 0,
      ewo_accumulated_cost: 0,
      daily_accumulated_cost: 0,
      monthly_accumulated_cost: 0,
      warning_threshold: 0,
      approval_threshold: 0,
      hard_stop_threshold: 0,
      rejection_reason: 'No budget configuration found for environment',
    };
  }

  const pricing = await getPricingSnapshot(environment);
  if (!pricing) {
    return {
      within_limits: false,
      budget_status: 'exceeded',
      estimated_cost_usd: 0,
      estimated_input_tokens: 0,
      estimated_output_tokens: 0,
      per_execution_limit: config.per_execution_limit_usd,
      per_ewo_limit: config.per_ewo_limit_usd,
      daily_limit: config.daily_limit_usd,
      monthly_limit: config.monthly_limit_usd,
      ewo_accumulated_cost: 0,
      daily_accumulated_cost: 0,
      monthly_accumulated_cost: 0,
      warning_threshold: config.warning_threshold_pct,
      approval_threshold: config.approval_threshold_pct,
      hard_stop_threshold: config.hard_stop_threshold_pct,
      rejection_reason: 'No pricing snapshot available — cannot estimate cost',
    };
  }

  // Estimate cost
  const costEstimate = codexAdapter.estimateCost(request, pricing);

  // Check per-execution limit
  if (costEstimate.estimated_cost_usd > config.per_execution_limit_usd) {
    return {
      within_limits: false,
      budget_status: 'exceeded',
      estimated_cost_usd: costEstimate.estimated_cost_usd,
      estimated_input_tokens: costEstimate.estimated_input_tokens,
      estimated_output_tokens: costEstimate.estimated_output_tokens,
      per_execution_limit: config.per_execution_limit_usd,
      per_ewo_limit: config.per_ewo_limit_usd,
      daily_limit: config.daily_limit_usd,
      monthly_limit: config.monthly_limit_usd,
      ewo_accumulated_cost: 0,
      daily_accumulated_cost: 0,
      monthly_accumulated_cost: 0,
      warning_threshold: config.warning_threshold_pct,
      approval_threshold: config.approval_threshold_pct,
      hard_stop_threshold: config.hard_stop_threshold_pct,
      rejection_reason: `Estimated cost $${costEstimate.estimated_cost_usd} exceeds per-execution limit $${config.per_execution_limit_usd}`,
    };
  }

  // Get accumulated costs from previous attempts
  const ewoAccumulated = await getAccumulatedCostForEwo(request.ewo_ref);
  const dailyAccumulated = await getAccumulatedCostForDay();
  const monthlyAccumulated = await getAccumulatedCostForMonth();

  const totalWithThisExecution = ewoAccumulated + costEstimate.estimated_cost_usd;
  const dailyTotal = dailyAccumulated + costEstimate.estimated_cost_usd;
  const monthlyTotal = monthlyAccumulated + costEstimate.estimated_cost_usd;

  // Check per-EWO limit
  if (totalWithThisExecution > config.per_ewo_limit_usd) {
    return {
      within_limits: false,
      budget_status: 'exceeded',
      estimated_cost_usd: costEstimate.estimated_cost_usd,
      estimated_input_tokens: costEstimate.estimated_input_tokens,
      estimated_output_tokens: costEstimate.estimated_output_tokens,
      per_execution_limit: config.per_execution_limit_usd,
      per_ewo_limit: config.per_ewo_limit_usd,
      daily_limit: config.daily_limit_usd,
      monthly_limit: config.monthly_limit_usd,
      ewo_accumulated_cost: ewoAccumulated,
      daily_accumulated_cost: dailyAccumulated,
      monthly_accumulated_cost: monthlyAccumulated,
      warning_threshold: config.warning_threshold_pct,
      approval_threshold: config.approval_threshold_pct,
      hard_stop_threshold: config.hard_stop_threshold_pct,
      rejection_reason: `EWO accumulated cost $${totalWithThisExecution.toFixed(2)} would exceed per-EWO limit $${config.per_ewo_limit_usd}`,
    };
  }

  // Check daily limit
  if (dailyTotal > config.daily_limit_usd) {
    return {
      within_limits: false,
      budget_status: 'exceeded',
      estimated_cost_usd: costEstimate.estimated_cost_usd,
      estimated_input_tokens: costEstimate.estimated_input_tokens,
      estimated_output_tokens: costEstimate.estimated_output_tokens,
      per_execution_limit: config.per_execution_limit_usd,
      per_ewo_limit: config.per_ewo_limit_usd,
      daily_limit: config.daily_limit_usd,
      monthly_limit: config.monthly_limit_usd,
      ewo_accumulated_cost: ewoAccumulated,
      daily_accumulated_cost: dailyAccumulated,
      monthly_accumulated_cost: monthlyAccumulated,
      warning_threshold: config.warning_threshold_pct,
      approval_threshold: config.approval_threshold_pct,
      hard_stop_threshold: config.hard_stop_threshold_pct,
      rejection_reason: `Daily accumulated cost $${dailyTotal.toFixed(2)} would exceed daily limit $${config.daily_limit_usd}`,
    };
  }

  // Check monthly limit
  if (monthlyTotal > config.monthly_limit_usd) {
    return {
      within_limits: false,
      budget_status: 'exceeded',
      estimated_cost_usd: costEstimate.estimated_cost_usd,
      estimated_input_tokens: costEstimate.estimated_input_tokens,
      estimated_output_tokens: costEstimate.estimated_output_tokens,
      per_execution_limit: config.per_execution_limit_usd,
      per_ewo_limit: config.per_ewo_limit_usd,
      daily_limit: config.daily_limit_usd,
      monthly_limit: config.monthly_limit_usd,
      ewo_accumulated_cost: ewoAccumulated,
      daily_accumulated_cost: dailyAccumulated,
      monthly_accumulated_cost: monthlyAccumulated,
      warning_threshold: config.warning_threshold_pct,
      approval_threshold: config.approval_threshold_pct,
      hard_stop_threshold: config.hard_stop_threshold_pct,
      rejection_reason: `Monthly accumulated cost $${monthlyTotal.toFixed(2)} would exceed monthly limit $${config.monthly_limit_usd}`,
    };
  }

  // Determine budget status based on thresholds
  const executionPct = (costEstimate.estimated_cost_usd / config.per_execution_limit_usd) * 100;
  let budgetStatus: 'within_limits' | 'warning' | 'approval_required' = 'within_limits';

  if (executionPct >= config.hard_stop_threshold_pct) {
    return {
      within_limits: false,
      budget_status: 'exceeded',
      estimated_cost_usd: costEstimate.estimated_cost_usd,
      estimated_input_tokens: costEstimate.estimated_input_tokens,
      estimated_output_tokens: costEstimate.estimated_output_tokens,
      per_execution_limit: config.per_execution_limit_usd,
      per_ewo_limit: config.per_ewo_limit_usd,
      daily_limit: config.daily_limit_usd,
      monthly_limit: config.monthly_limit_usd,
      ewo_accumulated_cost: ewoAccumulated,
      daily_accumulated_cost: dailyAccumulated,
      monthly_accumulated_cost: monthlyAccumulated,
      warning_threshold: config.warning_threshold_pct,
      approval_threshold: config.approval_threshold_pct,
      hard_stop_threshold: config.hard_stop_threshold_pct,
      rejection_reason: `Estimated cost reaches hard-stop threshold (${executionPct.toFixed(1)}% of per-execution limit)`,
    };
  }

  if (executionPct >= config.approval_threshold_pct) {
    budgetStatus = 'approval_required';
  } else if (executionPct >= config.warning_threshold_pct) {
    budgetStatus = 'warning';
  }

  return {
    within_limits: true,
    budget_status: budgetStatus,
    estimated_cost_usd: costEstimate.estimated_cost_usd,
    estimated_input_tokens: costEstimate.estimated_input_tokens,
    estimated_output_tokens: costEstimate.estimated_output_tokens,
    per_execution_limit: config.per_execution_limit_usd,
    per_ewo_limit: config.per_ewo_limit_usd,
    daily_limit: config.daily_limit_usd,
    monthly_limit: config.monthly_limit_usd,
    ewo_accumulated_cost: ewoAccumulated,
    daily_accumulated_cost: dailyAccumulated,
    monthly_accumulated_cost: monthlyAccumulated,
    warning_threshold: config.warning_threshold_pct,
    approval_threshold: config.approval_threshold_pct,
    hard_stop_threshold: config.hard_stop_threshold_pct,
    rejection_reason: null,
  };
}

async function getAccumulatedCostForEwo(ewoRef: string): Promise<number> {
  const { data } = await supabase
    .from('codex_execution_attempts')
    .select('actual_cost_usd')
    .eq('ewo_ref', ewoRef)
    .not('actual_cost_usd', 'is', null);
  return (data || []).reduce((sum, r) => sum + parseFloat(String(r.actual_cost_usd || 0)), 0);
}

async function getAccumulatedCostForDay(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('codex_execution_attempts')
    .select('actual_cost_usd')
    .gte('created_at', `${today}T00:00:00Z`)
    .not('actual_cost_usd', 'is', null);
  return (data || []).reduce((sum, r) => sum + parseFloat(String(r.actual_cost_usd || 0)), 0);
}

async function getAccumulatedCostForMonth(): Promise<number> {
  const monthStart = new Date().toISOString().slice(0, 8) + '01';
  const { data } = await supabase
    .from('codex_execution_attempts')
    .select('actual_cost_usd')
    .gte('created_at', `${monthStart}T00:00:00Z`)
    .not('actual_cost_usd', 'is', null);
  return (data || []).reduce((sum, r) => sum + parseFloat(String(r.actual_cost_usd || 0)), 0);
}

/**
 * Update budget configuration for an environment.
 */
export async function updateBudgetConfig(
  environment: string,
  config: Partial<CodexBudgetConfig>,
  configuredBy: string,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (config.per_execution_limit_usd !== undefined) update.per_execution_limit_usd = config.per_execution_limit_usd;
  if (config.per_ewo_limit_usd !== undefined) update.per_ewo_limit_usd = config.per_ewo_limit_usd;
  if (config.daily_limit_usd !== undefined) update.daily_limit_usd = config.daily_limit_usd;
  if (config.monthly_limit_usd !== undefined) update.monthly_limit_usd = config.monthly_limit_usd;
  if (config.warning_threshold_pct !== undefined) update.warning_threshold_pct = config.warning_threshold_pct;
  if (config.approval_threshold_pct !== undefined) update.approval_threshold_pct = config.approval_threshold_pct;
  if (config.hard_stop_threshold_pct !== undefined) update.hard_stop_threshold_pct = config.hard_stop_threshold_pct;
  if (config.input_token_price_per_1m !== undefined) update.input_token_price_per_1m = config.input_token_price_per_1m;
  if (config.cached_input_token_price_per_1m !== undefined) update.cached_input_token_price_per_1m = config.cached_input_token_price_per_1m;
  if (config.output_token_price_per_1m !== undefined) update.output_token_price_per_1m = config.output_token_price_per_1m;
  if (config.pricing_effective_date !== undefined) update.pricing_effective_date = config.pricing_effective_date;
  if (config.pricing_source !== undefined) update.pricing_source = config.pricing_source;

  // Deactivate existing configs for this environment
  await supabase
    .from('codex_budget_config')
    .update({ is_active: false })
    .eq('environment', environment);

  // Insert new config
  await supabase.from('codex_budget_config').insert({
    environment,
    per_execution_limit_usd: config.per_execution_limit_usd ?? 10,
    per_ewo_limit_usd: config.per_ewo_limit_usd ?? 50,
    daily_limit_usd: config.daily_limit_usd ?? 100,
    monthly_limit_usd: config.monthly_limit_usd ?? 1000,
    warning_threshold_pct: config.warning_threshold_pct ?? 50,
    approval_threshold_pct: config.approval_threshold_pct ?? 80,
    hard_stop_threshold_pct: config.hard_stop_threshold_pct ?? 100,
    currency: config.currency ?? 'USD',
    input_token_price_per_1m: config.input_token_price_per_1m ?? 1.5,
    cached_input_token_price_per_1m: config.cached_input_token_price_per_1m ?? 0.375,
    output_token_price_per_1m: config.output_token_price_per_1m ?? 6.0,
    pricing_effective_date: config.pricing_effective_date ?? new Date().toISOString().slice(0, 10),
    pricing_source: config.pricing_source ?? 'governed_registry',
    is_active: true,
    configured_by: configuredBy,
  });
}

export const codexBudgetService = {
  getBudgetConfig,
  getPricingSnapshot,
  validateBudget,
  updateBudgetConfig,
  getAccumulatedCostForEwo,
  getAccumulatedCostForDay,
  getAccumulatedCostForMonth,
};
