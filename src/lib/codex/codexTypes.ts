/**
 * EWO-030: OpenAI Codex Execution Provider Types
 *
 * Canonical type definitions for the Codex governed execution provider.
 * These types define the contract between EIOS and the Codex adapter.
 */

// ─── Execution Request Contract ──────────────────────────────────────────────

export interface CodexExecutionRequest {
  execution_id: string;
  ewo_ref: string;
  engineering_intent_ref: string | null;
  engineering_plan_ref: string | null;
  repository_ref: string;
  branch_ref: string;
  environment: 'staging' | 'production';
  task_objective: string;
  scope: string;
  acceptance_criteria: string[];
  architectural_constraints: string[];
  governance_constraints: string[];
  permitted_files: string[];
  restricted_files: string[];
  permitted_commands: string[];
  restricted_commands: string[];
  context_package: Record<string, unknown>;
  token_budget: number | null;
  cost_budget_usd: number | null;
  timeout_seconds: number;
  retry_policy: CodexRetryPolicy;
  po_approval_state: 'approved' | 'pending' | 'refused';
  execution_mode: 'full' | 'dry_run' | 'simulation';
  audit_context: CodexAuditContext;
}

export interface CodexRetryPolicy {
  max_retries: number;
  retry_delay_seconds: number;
  retry_on: CodexRetryableFailure[];
}

export type CodexRetryableFailure =
  | 'provider_timeout'
  | 'rate_limiting'
  | 'provider_outage'
  | 'malformed_output';

export interface CodexAuditContext {
  audit_ref: string;
  session_id: string | null;
  requesting_persona: string;
  governance_version: string;
}

// ─── Execution Result Contract ──────────────────────────────────────────────

export interface CodexExecutionResult {
  execution_id: string;
  provider: 'codex';
  provider_version: string;
  model_used: string;
  execution_status: 'success' | 'failed' | 'partial';
  files_created: CodexFileChange[];
  files_modified: CodexFileChange[];
  files_deleted: string[];
  commands_executed: CodexCommandResult[];
  tests_executed: CodexTestResult[];
  implementation_notes: string;
  deviations_from_plan: string[];
  unresolved_issues: string[];
  acceptance_criteria_status: CodexAcceptanceCriterion[];
  estimated_cost: CodexCostEstimate;
  actual_usage: CodexActualUsage;
  actual_cost: CodexCostActual;
  retry_count: number;
  provider_diagnostics: CodexProviderDiagnostics;
  runtime_diagnostics: CodexRuntimeDiagnostics;
  constitutional_compliance_result: CodexConstitutionalCompliance;
  audit_reference: string;
  completion_package_reference: string | null;
}

export interface CodexFileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  diff_summary: string;
  lines_added: number;
  lines_removed: number;
  /** Complete file content for create/modify actions. Required for the repository application service. */
  content?: string;
  /** SHA-256 hash of the content, for integrity verification. */
  content_hash?: string;
}

export interface CodexCommandResult {
  command: string;
  classification: 'allowed' | 'conditionally_allowed' | 'prohibited' | 'read_only' | 'test' | 'build' | 'migration' | 'deployment' | 'destructive';
  exit_code: number | null;
  output: string;
  was_authorised: boolean;
  execution_status: 'executed' | 'rejected' | 'skipped';
}

export interface CodexTestResult {
  test_name: string;
  test_suite: string;
  passed: boolean;
  output: string;
  duration_ms: number;
}

export interface CodexAcceptanceCriterion {
  criterion: string;
  satisfied: boolean;
  evidence: string;
}

export interface CodexCostEstimate {
  estimated_input_tokens: number;
  estimated_cached_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
  pricing_snapshot: CodexPricingSnapshot;
}

export interface CodexActualUsage {
  actual_input_tokens: number;
  actual_cached_input_tokens: number;
  actual_output_tokens: number;
}

export interface CodexCostActual {
  actual_cost_usd: number;
  cost_variance_usd: number;
}

export interface CodexPricingSnapshot {
  input_token_price_per_1m: number;
  cached_input_token_price_per_1m: number;
  output_token_price_per_1m: number;
  currency: string;
  effective_date: string;
  source: string;
}

export interface CodexProviderDiagnostics {
  provider_id: string;
  provider_name: string;
  model_used: string;
  api_response_time_ms: number | null;
  rate_limit_remaining: number | null;
  rate_limit_reset_at: string | null;
  provider_health: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  diagnostic_confidence: number;
}

export interface CodexRuntimeDiagnostics {
  request_id: string;
  detected_intent: string;
  services_invoked: string[];
  pipeline_stages_completed: string[];
  provider_records_examined: number;
  unavailable_fields: string[];
  diagnostic_confidence: number;
  lifecycle_change_performed: boolean;
  generated_timestamp: string;
  audit_reference: string;
}

export interface CodexConstitutionalCompliance {
  compliant: boolean;
  amendments_checked: string[];
  violations: string[];
  warnings: string[];
}

// ─── Provider Registry Metadata ──────────────────────────────────────────────

export interface CodexProviderMetadata {
  provider_id: string;
  provider_name: string;
  provider_type: string;
  provider_version: string;
  lifecycle_status: 'active' | 'inactive' | 'suspended' | 'retired';
  active_status: 'active' | 'inactive';
  governed_status: 'governed' | 'ungoverned';
  execution_contract_version: string;
  supported_operations: string[];
  governance_rules: string[];
  provider_configuration: Record<string, unknown>;
  configuration_status: 'configured' | 'not_configured' | 'partially_configured';
  credential_reference_status: 'configured' | 'valid' | 'invalid' | 'expired' | 'unavailable' | 'revoked' | 'not_required';
  provider_health: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  last_successful_health_check: string | null;
  last_failed_health_check: string | null;
  pricing_metadata: Record<string, unknown>;
  pricing_effective_date: string | null;
  configured_budget_limits: Record<string, unknown>;
  permitted_environments: string[];
}

// ─── Credential Handling ─────────────────────────────────────────────────────

export interface CodexCredentialRecord {
  credential_ref: string;
  environment: string;
  credential_reference: string;
  credential_status: 'configured' | 'valid' | 'invalid' | 'expired' | 'unavailable' | 'revoked';
  configured_by: string | null;
  configured_at: string;
  validated_at: string | null;
  last_validation_status: string | null;
  last_validation_detail: string | null;
  is_current: boolean;
}

// ─── Budget Configuration ───────────────────────────────────────────────────

export interface CodexBudgetConfig {
  environment: string;
  per_execution_limit_usd: number;
  per_ewo_limit_usd: number;
  daily_limit_usd: number;
  monthly_limit_usd: number;
  warning_threshold_pct: number;
  approval_threshold_pct: number;
  hard_stop_threshold_pct: number;
  currency: string;
  input_token_price_per_1m: number;
  cached_input_token_price_per_1m: number;
  output_token_price_per_1m: number;
  pricing_effective_date: string;
  pricing_source: string;
  pricing_snapshot: Record<string, unknown>;
  is_active: boolean;
}

// ─── Health Check ────────────────────────────────────────────────────────────

export interface CodexHealthCheckResult {
  check_ref: string;
  environment: string;
  configuration_status: 'ok' | 'not_configured' | 'partial';
  secret_availability_status: 'available' | 'unavailable' | 'revoked' | 'expired';
  authentication_status: 'authenticated' | 'failed' | 'not_checked';
  api_accessibility_status: 'reachable' | 'unreachable' | 'not_checked';
  model_availability_status: 'available' | 'unavailable' | 'not_checked';
  contract_compatibility_status: 'compatible' | 'incompatible' | 'not_checked';
  rate_limit_status: string | null;
  is_healthy: boolean;
  diagnostics: Record<string, unknown>;
  checked_at: string;
}

// ─── Dry-Run Simulation ──────────────────────────────────────────────────────

export interface CodexDryRunResult {
  execution_package_valid: boolean;
  governance_valid: boolean;
  provider_eligible: boolean;
  credential_status: 'configured' | 'valid' | 'invalid' | 'unavailable';
  selected_model: string;
  supported_operations: string[];
  estimated_context_size: number;
  estimated_input_tokens: number;
  estimated_cached_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
  budget_status: 'within_limits' | 'warning' | 'approval_required' | 'exceeded';
  approval_requirements: string[];
  prohibited_actions_detected: string[];
  execution_diagnostics: Record<string, unknown>;
  paid_tokens_consumed: 0;
}

// ─── Trial Metrics ──────────────────────────────────────────────────────────

export interface CodexTrialMetric {
  execution_ref: string;
  ewo_ref: string;
  task_type: string;
  complexity_classification: string;
  risk_classification: string;
  execution_duration_ms: number;
  estimated_cost_usd: number;
  actual_cost_usd: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  files_changed: number;
  files_created: number;
  files_modified: number;
  files_deleted: number;
  tests_passed: number;
  tests_failed: number;
  retry_count: number;
  manual_corrections_required: number;
  governance_interventions: number;
  completion_package_quality: string;
  product_owner_result: string;
  accepted_or_rejected: 'accepted' | 'rejected' | 'pending';
  bolt_subsequently_required: boolean;
  rejection_or_escalation_reason: string | null;
}

// ─── Execution Attempt ───────────────────────────────────────────────────────

export interface CodexExecutionAttempt {
  attempt_ref: string;
  execution_ref: string;
  ewo_ref: string;
  attempt_number: number;
  attempt_status: 'pending' | 'running' | 'success' | 'failed' | 'timeout' | 'rate_limited' | 'auth_failed' | 'contract_violation' | 'budget_exhausted' | 'governance_rejected' | 'safety_rejected';
  failure_reason: string | null;
  model_used: string | null;
  estimated_input_tokens: number | null;
  estimated_cached_input_tokens: number | null;
  estimated_output_tokens: number | null;
  actual_input_tokens: number | null;
  actual_cached_input_tokens: number | null;
  actual_output_tokens: number | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  cost_variance_usd: number | null;
  attempt_start: string | null;
  attempt_finish: string | null;
  duration_ms: number | null;
  provider_diagnostics: Record<string, unknown>;
  response_contract_valid: boolean | null;
}

// ─── Repository & Command Controls ──────────────────────────────────────────

export interface CodexRepositoryControls {
  permitted_repository: string;
  permitted_branch: string;
  permitted_directories: string[];
  permitted_files: string[];
  protected_files: string[];
  allow_file_creation: boolean;
  allow_file_modification: boolean;
  allow_file_deletion: boolean;
  allow_generated_migrations: boolean;
  allow_dependency_changes: boolean;
  allow_env_config_changes: boolean;
  allow_secret_bearing_files: boolean;
}

export type CodexCommandClassification =
  | 'allowed'
  | 'conditionally_allowed'
  | 'prohibited'
  | 'read_only'
  | 'test'
  | 'build'
  | 'migration'
  | 'deployment'
  | 'destructive';

export interface CodexCommandGovernance {
  classification: CodexCommandClassification;
  is_authorised: boolean;
  requires_po_approval: boolean;
  requires_environment_approval: boolean;
  rejection_reason: string | null;
}

// ─── Completion Package ─────────────────────────────────────────────────────

export interface CodexCompletionPackage {
  execution_summary: string;
  ewo_ref: string;
  provider_id: string;
  provider_name: string;
  model_used: string;
  files_created: CodexFileChange[];
  files_modified: CodexFileChange[];
  files_deleted: string[];
  commands_executed: CodexCommandResult[];
  tests_executed: CodexTestResult[];
  implementation_notes: string;
  deviations_from_plan: string[];
  unresolved_issues: string[];
  acceptance_criteria_status: CodexAcceptanceCriterion[];
  estimated_cost: CodexCostEstimate;
  actual_usage: CodexActualUsage;
  actual_cost: CodexCostActual;
  retry_count: number;
  provider_diagnostics: CodexProviderDiagnostics;
  runtime_diagnostics: CodexRuntimeDiagnostics;
  constitutional_compliance_result: CodexConstitutionalCompliance;
  audit_reference: string;
}

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

export const CODEX_PIPELINE_STAGES = [
  'execution_package_validation',
  'governance_validation',
  'po_gate_validation',
  'provider_eligibility_validation',
  'credential_validation',
  'provider_health_validation',
  'budget_validation',
  'cost_estimation',
  'codex_request_preparation',
  'supervised_execution',
  'response_contract_validation',
  'file_change_inspection',
  'command_test_result_inspection',
  'constitutional_compliance_validation',
  'completion_package_generation',
  'po_review_gate',
  'audit_recording',
] as const;

export type CodexPipelineStage = (typeof CODEX_PIPELINE_STAGES)[number];

export interface CodexPipelineStageResult {
  stage_name: CodexPipelineStage;
  stage_sequence: number;
  stage_status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  stage_diagnostics: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface CodexGovernedExecutionResult {
  execution_id: string;
  pipeline_stages: CodexPipelineStageResult[];
  execution_result: CodexExecutionResult | null;
  completion_package: CodexCompletionPackage | null;
  trial_metric: CodexTrialMetric | null;
  success: boolean;
  error: string | null;
  lifecycle_change_performed: boolean;
  audit_reference: string;
}
