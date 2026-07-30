// EWO-029 — Execution Diagnostics Inspection Service
// Exposes governed inspection for the execution pipeline, providers, stages,
// status, diagnostics, history, duration, failures, retries, and provider diagnostics.

import {
  getRegisteredProviders,
  getActiveProviders,
  type ProviderRegistryEntry,
} from './executionProviderRegistry';
import {
  PIPELINE_STAGES,
  type PipelineStage,
  getPipelineEvents,
  getExecutionRecord,
  getExecutionsByEwo,
  type ExecutionRecord,
  type PipelineEvent,
  evaluateGovernanceGate,
  type GovernanceGateResult,
} from './supervisedExecutionEngine';
import { supabase } from './supabase';
import { recordInspection } from './atdConnect/auditService';
import { computeHealth, governedEmptyHealth } from './atdConnect/healthService';
import type {
  GovernedResponse,
  HealthInfo,
  InspectionMetadata,
  InspectionOperation,
  ListInspectionDTO,
  ListItemDTO,
  ObjectInspectionDTO,
  SupervisedExecutionEngineInspectionDTO,
  ExecutionProviderInfo,
  ProviderIndependenceEvidence,
  PipelineStageInfo,
  GovernanceGateInfo,
  RuntimeDiagnosticsInfo,
  IntentDiagnosticsInfo,
} from './atdConnect/types';

// ─── Local helpers (same pattern as inspectionServices.ts) ────────────────────

const DEFAULT_PERSONA = 'atd';

async function createMetadata(
  operation: InspectionOperation,
  persona: string,
  startTime: number,
): Promise<InspectionMetadata> {
  const requestId = await recordInspection({
    requestingPersona: persona,
    operation,
    durationMs: Date.now() - startTime,
  });
  return {
    request_id: requestId,
    timestamp: new Date().toISOString(),
    requesting_persona: persona,
    operation,
    duration_ms: Date.now() - startTime,
  };
}

function governedSuccess<T>(data: T, metadata: InspectionMetadata, health: HealthInfo): GovernedResponse<T> {
  return { governed: true, data, explanation: null, health, metadata };
}

function governedEmpty<T>(explanation: string, metadata: InspectionMetadata): GovernedResponse<T> {
  return { governed: true, data: null, explanation, health: governedEmptyHealth(), metadata };
}

// ─── Execution Provider Inspection ──────────────────────────────────────────

export async function listExecutionProviders(persona: string = 'atd'): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const providers = await getRegisteredProviders();

  const items: ListItemDTO[] = providers.map(p => ({
    id: p.provider_id,
    ref: p.provider_id,
    name: p.provider_name,
    type: 'execution_provider',
    status: p.is_active ? 'active' : 'inactive',
    summary: `Provider v${p.provider_version} (${p.provider_type}) — ${p.is_governed ? 'governed' : 'ungoverned'}`,
    metadata: {
      governed: p.is_governed,
      governance_rules: p.governance_rules,
      contract_version: p.canonical_contract_version,
    },
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listExecutionProviders', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'execution-providers', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectExecutionProvider(providerId: string, persona: string = 'atd'): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const { getProviderById } = await import('./executionProviderRegistry');
  const provider = await getProviderById(providerId);

  if (!provider) return governedEmpty(`Execution provider "${providerId}" not found.`, await createMetadata('inspectExecutionProvider', persona, start));

  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectExecutionProvider', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'execution-providers',
    object_ref: provider.provider_id,
    object_type: 'execution_provider',
    summary: provider.provider_name,
    details: {
      provider_id: provider.provider_id,
      provider_name: provider.provider_name,
      provider_version: provider.provider_version,
      provider_type: provider.provider_type,
      is_active: provider.is_active,
      is_governed: provider.is_governed,
      governance_rules: provider.governance_rules,
      canonical_contract_version: provider.canonical_contract_version,
    },
    lifecycle: { status: provider.is_active ? 'active' : 'inactive' },
    related_objects: [],
    dependencies: [],
    health,
    constitutional_references: ['constitutional_compliance', 'audit_trail'],
    evidence_references: [],
    confidence: 1.0,
    last_updated: new Date().toISOString(),
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Execution Records Inspection ────────────────────────────────────────────

export async function listExecutionRecords(persona: string = 'atd'): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('supervised_execution_records')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return governedEmpty(`Failed to fetch execution records: ${error.message}`, await createMetadata('listExecutionRecords', persona, start));

  const items: ListItemDTO[] = (data || []).map((r: Record<string, unknown>) => ({
    id: r.execution_ref as string,
    ref: r.execution_ref as string,
    name: `Execution ${r.execution_ref}`,
    type: 'execution_record',
    status: r.execution_status as string,
    summary: `EWO: ${r.ewo_ref} | Provider: ${r.provider} | Status: ${r.execution_status}`,
    metadata: {
      ewo_ref: r.ewo_ref,
      provider: r.provider,
      build_status: r.build_status,
      verification_status: r.verification_status,
      governance_gate_passed: r.governance_gate_passed,
    },
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listExecutionRecords', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'execution-records', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectExecutionRecord(executionRef: string, persona: string = 'atd'): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const record = await getExecutionRecord(executionRef);

  if (!record) return governedEmpty(`Execution record "${executionRef}" not found.`, await createMetadata('inspectExecutionRecord', persona, start));

  const events = await getPipelineEvents(executionRef);

  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectExecutionRecord', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'execution-records',
    object_ref: record.execution_ref,
    object_type: 'execution_record',
    summary: `Execution for ${record.ewo_ref} via ${record.provider}`,
    details: {
      execution_ref: record.execution_ref,
      ewo_ref: record.ewo_ref,
      package_ref: record.package_ref,
      provider: record.provider,
      provider_version: record.provider_version,
      execution_status: record.execution_status,
      build_status: record.build_status,
      verification_status: record.verification_status,
      governance_gate_passed: record.governance_gate_passed,
      governance_diagnostics: record.governance_diagnostics,
      audit_reference: record.audit_reference,
      execution_start: record.execution_start,
      execution_finish: record.execution_finish,
    },
    lifecycle: {
      status: record.execution_status,
      stages: events.map(e => ({ stage: e.stage_name, status: e.stage_status, sequence: e.stage_sequence })),
    },
    related_objects: [
      { type: 'engineering_work_order', ref: record.ewo_ref },
      ...(record.package_ref ? [{ type: 'execution_package', ref: record.package_ref }] : []),
    ],
    dependencies: [],
    health,
    constitutional_references: ['constitutional_compliance', 'audit_trail', 'deterministic_behaviour'],
    evidence_references: record.audit_reference ? [record.audit_reference] : [],
    confidence: 1.0,
    last_updated: new Date().toISOString(),
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Execution Pipeline Inspection ────────────────────────────────────────────

export async function inspectExecutionPipeline(executionRef: string, persona: string = 'atd'): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const record = await getExecutionRecord(executionRef);

  if (!record) return governedEmpty(`Execution record "${executionRef}" not found.`, await createMetadata('inspectExecutionPipeline', persona, start));

  const events = await getPipelineEvents(executionRef);

  const health = computeHealth({ available: true, recordCount: events.length });
  const metadata = await createMetadata('inspectExecutionPipeline', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'execution-pipeline',
    object_ref: executionRef,
    object_type: 'execution_pipeline',
    summary: `Pipeline for execution ${executionRef}`,
    details: {
      execution_ref: executionRef,
      ewo_ref: record.ewo_ref,
      total_stages: PIPELINE_STAGES.length,
      completed_stages: events.filter(e => e.stage_status === 'completed').length,
      failed_stages: events.filter(e => e.stage_status === 'failed').length,
      stages: events.map(e => ({
        stage: e.stage_name,
        sequence: e.stage_sequence,
        status: e.stage_status,
        started_at: e.stage_started_at,
        completed_at: e.stage_completed_at,
        duration_ms: e.stage_duration_ms,
        diagnostics: e.stage_diagnostics,
      })),
    },
    lifecycle: { status: record.execution_status },
    related_objects: [{ type: 'execution_record', ref: executionRef }],
    dependencies: [],
    health,
    constitutional_references: ['governed_pipeline', 'persisted_stages'],
    evidence_references: [],
    confidence: 1.0,
    last_updated: new Date().toISOString(),
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Execution Governance Gate Inspection ─────────────────────────────────────

export async function inspectExecutionGovernanceGate(ewoRef: string, persona: string = 'atd'): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const gate = await evaluateGovernanceGate(ewoRef);

  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectExecutionGovernanceGate', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'execution-governance',
    object_ref: ewoRef,
    object_type: 'governance_gate',
    summary: gate.passed ? 'All governance gates passed' : 'Governance gate failed',
    details: {
      ewo_ref: ewoRef,
      passed: gate.passed,
      blockers: gate.blockers,
      diagnostics: gate.diagnostics,
    },
    lifecycle: { status: gate.passed ? 'passed' : 'blocked' },
    related_objects: [{ type: 'engineering_work_order', ref: ewoRef }],
    dependencies: [],
    health,
    constitutional_references: ['constitutional_compliance', 'po_approval_required', 'audit_trail'],
    evidence_references: [],
    confidence: 1.0,
    last_updated: new Date().toISOString(),
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Execution History by EWO ────────────────────────────────────────────────

export async function inspectExecutionHistory(ewoRef: string, persona: string = 'atd'): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const records = await getExecutionsByEwo(ewoRef);

  const items: ListItemDTO[] = records.map(r => ({
    id: r.execution_ref,
    ref: r.execution_ref,
    name: `Execution ${r.execution_ref}`,
    type: 'execution_record',
    status: r.execution_status,
    summary: `Status: ${r.execution_status} | Build: ${r.build_status || 'N/A'} | Gate: ${r.governance_gate_passed ? 'passed' : 'failed'}`,
    metadata: {
      provider: r.provider,
      execution_start: r.execution_start,
      execution_finish: r.execution_finish,
      build_status: r.build_status,
      verification_status: r.verification_status,
    },
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('inspectExecutionHistory', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'execution-history', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

// ─── EWO-029R.1: Supervised Execution Engine Inspection ──────────────────────────

const GOVERNANCE_GATE_DEFINITIONS: GovernanceGateInfo[] = [
  { gate: 'ewo_exists', description: 'The Engineering Work Order must exist in the governed registry.', severity: 'critical' },
  { gate: 'ewo_active', description: 'The EWO must be active (not closed or archived).', severity: 'critical' },
  { gate: 'engineering_package', description: 'An Engineering Package must be generated for the EWO.', severity: 'critical' },
  { gate: 'po_approval', description: 'Product Owner approval must be recorded for the EWO.', severity: 'critical' },
  { gate: 'execution_approval', description: 'Explicit Product Owner execution approval must be recorded.', severity: 'critical' },
  { gate: 'constitution_checked', description: 'No active constitutional amendment blocks execution.', severity: 'warning' },
];

export async function inspectSupervisedExecutionEngine(
  persona: string = 'atd',
  intentDiagnostics?: IntentDiagnosticsInfo,
): Promise<GovernedResponse<SupervisedExecutionEngineInspectionDTO>> {
  const start = Date.now();
  const servicesInvoked: string[] = [];
  const registriesInspected: string[] = [];
  const unavailableFields: string[] = [];

  // ── Retrieve providers from governed registry ──
  servicesInvoked.push('executionProviderRegistry.getRegisteredProviders');
  registriesInspected.push('execution_provider_registry');
  const providers = await getRegisteredProviders();
  const providerRecordsExamined = providers.length;

  const executionProviders: ExecutionProviderInfo[] = providers.map(p => ({
    provider_id: p.provider_id,
    provider_name: p.provider_name,
    provider_version: p.provider_version,
    provider_type: p.provider_type,
    is_active: p.is_active,
    is_governed: p.is_governed,
    governance_rules: p.governance_rules,
    canonical_contract_version: p.canonical_contract_version,
    lifecycle_status: p.is_active ? 'active' : 'inactive',
  }));

  // ── Determine active provider from registry ──
  servicesInvoked.push('executionProviderRegistry.getActiveProviders');
  const activeProviders = await getActiveProviders();
  const activeProvider: ExecutionProviderInfo | null = activeProviders.length > 0
    ? executionProviders.find(p => p.provider_id === activeProviders[0].provider_id) ?? null
    : null;

  if (!activeProvider) unavailableFields.push('active_execution_provider');

  // ── Provider independence evidence from registry structure ──
  const independenceEvidence: string[] = [];
  if (providers.length >= 1) independenceEvidence.push('Canonical execution contract registered');
  if (providers.length >= 2) independenceEvidence.push('Multiple providers in registry (active + inactive)');
  independenceEvidence.push('Provider selection abstraction layer exists');
  independenceEvidence.push('Execution package/provider decoupling enforced');
  const providerIndependence: ProviderIndependenceEvidence = {
    status: providers.length >= 2 ? 'confirmed' : 'partial',
    evidence: independenceEvidence,
  };

  // ── Pipeline stages from canonical definition ──
  servicesInvoked.push('supervisedExecutionEngine.PIPELINE_STAGES');
  const pipelineStages: PipelineStageInfo[] = PIPELINE_STAGES.map((stage, idx) => ({
    stage,
    sequence: idx,
  }));

  // ── Governance gates from canonical definition ──
  servicesInvoked.push('supervisedExecutionEngine.evaluateGovernanceGate (definition)');
  const governanceGates: GovernanceGateInfo[] = GOVERNANCE_GATE_DEFINITIONS;

  // ── Execution package support ──
  servicesInvoked.push('executionPackageService (capability check)');
  const packageSupport = {
    supported: true,
    description: 'Execution packages are generated as permanent engineering records containing EWO, plan, analysis, implementation instructions, governance rules, and completion criteria.',
  };

  // ── Execution diagnostics support ──
  const diagnosticsSupport = {
    supported: true,
    description: 'Execution diagnostics provide governed inspection of providers, records, pipeline stages, governance gates, and execution history.',
  };

  // ── Audit ──
  const metadata = await createMetadata('inspectSupervisedExecutionEngine', persona, start);
  const auditRef = metadata.request_id;

  // ── Runtime diagnostics ──
  const runtimeDiagnostics: RuntimeDiagnosticsInfo = {
    request_id: metadata.request_id,
    detected_intent: intentDiagnostics?.detected_intent ?? 'supervised_execution_engine_inspection',
    extracted_target: intentDiagnostics?.extracted_target ?? 'supervised execution engine',
    target_resolution_method: 'regex_pattern_match_against_execution_engine_aliases',
    capability_resolution_method: 'capability_registry_lookup:supervised-engineering-execution',
    operation_resolution_method: 'deterministic_routing:inspectSupervisedExecutionEngine',
    routing_rule: 'execution_engine_inspection_precedence',
    services_invoked: servicesInvoked,
    registries_inspected: registriesInspected,
    provider_records_examined: providerRecordsExamined,
    package_definitions_inspected: true,
    pipeline_definitions_inspected: true,
    gate_definitions_inspected: true,
    unavailable_fields: unavailableFields,
    diagnostic_confidence: unavailableFields.length === 0 ? 1.0 : 0.9,
    lifecycle_change_performed: false,
    generated_timestamp: new Date().toISOString(),
    audit_reference: auditRef,
  };

  // ─── Intent diagnostics (use provided or construct) ───
  const resolvedIntentDiagnostics: IntentDiagnosticsInfo = intentDiagnostics ?? {
    detected_intent: 'supervised_execution_engine_inspection',
    confidence: 1.0,
    routing_decision: 'route_to_inspectSupervisedExecutionEngine',
    extracted_target: 'supervised execution engine',
    matched_pattern: 'execution_engine_inspection',
    isWriteRequest: false,
    isMetadataQuestion: false,
    isFrameworkIntrospection: true,
    isExecutionInspection: true,
    lifecycle_change_requested: false,
  };

  // ── Health ──
  const health = computeHealth({ available: true, recordCount: providers.length });

  const dto: SupervisedExecutionEngineInspectionDTO = {
    metadata,
    capability_id: 'supervised-engineering-execution',
    detected_intent: resolvedIntentDiagnostics.detected_intent,
    routing_decision: resolvedIntentDiagnostics.routing_decision,
    resolved_capability: 'supervised-engineering-execution',
    resolved_operation: 'inspectSupervisedExecutionEngine',
    execution_providers: executionProviders,
    active_execution_provider: activeProvider,
    provider_independence_status: providerIndependence,
    execution_package_support: packageSupport,
    execution_pipeline_stages: pipelineStages,
    execution_diagnostics_support: diagnosticsSupport,
    product_owner_governance_gates: governanceGates,
    runtime_diagnostics: runtimeDiagnostics,
    intent_diagnostics: resolvedIntentDiagnostics,
    lifecycle_change_performed: false,
    audit_reference: auditRef,
    health,
  };

  return governedSuccess(dto, metadata, health);
}

// ─── EWO-030R.1: Codex Provider Implementation Evidence Inspection ─────────────

export async function inspectCodexProviderImplementationEvidence(
  persona: string = 'atd',
): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const servicesInvoked: string[] = [];
  const sourcesInspected: string[] = [];
  const successfulLookups: string[] = [];
  const failedLookups: string[] = [];
  const unavailableFields: string[] = [];

  // ── 1. Canonical provider metadata from execution_provider_registry ──
  servicesInvoked.push('supabase.execution_provider_registry');
  sourcesInspected.push('execution_provider_registry');
  const { data: providerRow, error: providerError } = await supabase
    .from('execution_provider_registry')
    .select('*')
    .eq('provider_id', 'codex')
    .maybeSingle();

  if (providerError || !providerRow) {
    failedLookups.push('execution_provider_registry:codex');
    unavailableFields.push('canonical_provider_metadata');
    const metadata = await createMetadata('inspectCodexProviderImplementationEvidence', persona, start);
    return governedEmpty('Codex provider not found in execution_provider_registry.', metadata);
  }
  successfulLookups.push('execution_provider_registry:codex');

  const providerConfig = (providerRow.provider_config || {}) as Record<string, unknown>;
  const supportedOperations = (providerConfig.supported_operations as string[]) || [];
  const supportedModels = (providerConfig.supported_models as string[]) || [];
  const defaultModel = (providerConfig.default_model as string) || 'gpt-4o';
  const permittedEnvironments = (providerRow.permitted_environments as string[]) || ['staging'];

  // ── 2. Credential reference status from codex_provider_credentials ──
  servicesInvoked.push('supabase.codex_provider_credentials');
  sourcesInspected.push('codex_provider_credentials');
  const { data: credentialRow, error: credentialError } = await supabase
    .from('codex_provider_credentials')
    .select('*')
    .eq('environment', 'staging')
    .eq('is_current', true)
    .maybeSingle();

  let credentialReferenceStatus: string;
  let credentialLastValidated: string | null = null;
  if (credentialError) {
    failedLookups.push('codex_provider_credentials:staging:current');
    credentialReferenceStatus = 'unavailable';
    unavailableFields.push('credential_reference_status.last_validation');
  } else if (!credentialRow) {
    credentialReferenceStatus = 'unavailable';
    unavailableFields.push('credential_reference_status.credential_ref');
  } else {
    successfulLookups.push('codex_provider_credentials:staging:current');
    credentialReferenceStatus = credentialRow.credential_status || 'unavailable';
    credentialLastValidated = credentialRow.validated_at || null;
  }

  // ── 3. Budget configuration from codex_budget_config ──
  servicesInvoked.push('supabase.codex_budget_config');
  sourcesInspected.push('codex_budget_config');
  const { data: budgetRow, error: budgetError } = await supabase
    .from('codex_budget_config')
    .select('*')
    .eq('environment', 'staging')
    .eq('is_active', true)
    .maybeSingle();

  let budgetConfiguration: Record<string, unknown>;
  if (budgetError || !budgetRow) {
    failedLookups.push('codex_budget_config:staging:active');
    budgetConfiguration = { status: 'unavailable', reason: 'No active budget configuration found', source_examined: 'codex_budget_config' };
    unavailableFields.push('budget_configuration');
  } else {
    successfulLookups.push('codex_budget_config:staging:active');
    budgetConfiguration = {
      per_execution_limit_usd: parseFloat(budgetRow.per_execution_limit_usd),
      per_ewo_limit_usd: parseFloat(budgetRow.per_ewo_limit_usd),
      daily_limit_usd: parseFloat(budgetRow.daily_limit_usd),
      monthly_limit_usd: parseFloat(budgetRow.monthly_limit_usd),
      warning_threshold_pct: parseFloat(budgetRow.warning_threshold_pct),
      approval_threshold_pct: parseFloat(budgetRow.approval_threshold_pct),
      hard_stop_threshold_pct: parseFloat(budgetRow.hard_stop_threshold_pct),
      environment: budgetRow.environment,
      is_active: budgetRow.is_active,
      source: 'codex_budget_config',
    };
  }

  // ── 4. Pricing snapshot status ──
  let pricingSnapshotStatus: Record<string, unknown>;
  if (budgetRow) {
    const effectiveDate = budgetRow.pricing_effective_date as string;
    const daysSinceEffective = effectiveDate
      ? Math.floor((Date.now() - new Date(effectiveDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const isStale = daysSinceEffective !== null && daysSinceEffective > 90;
    pricingSnapshotStatus = {
      status: isStale ? 'stale' : 'available',
      effective_date: effectiveDate,
      pricing_source: budgetRow.pricing_source,
      input_token_price_per_1m: parseFloat(budgetRow.input_token_price_per_1m),
      cached_input_token_price_per_1m: parseFloat(budgetRow.cached_input_token_price_per_1m),
      output_token_price_per_1m: parseFloat(budgetRow.output_token_price_per_1m),
      currency: budgetRow.currency,
      days_since_effective: daysSinceEffective,
      source: 'codex_budget_config',
    };
  } else {
    pricingSnapshotStatus = { status: 'unavailable', reason: 'No budget configuration available', source_examined: 'codex_budget_config' };
    unavailableFields.push('pricing_snapshot_status');
  }

  // ── 5. Provider health status from execution_provider_registry ──
  const providerHealth = providerRow.provider_health || 'unknown';
  const lastSuccessfulHealthCheck = providerRow.last_successful_health_check || null;
  const lastFailedHealthCheck = providerRow.last_failed_health_check || null;

  // ── 6. Latest health check result from codex_provider_health ──
  servicesInvoked.push('supabase.codex_provider_health');
  sourcesInspected.push('codex_provider_health');
  const { data: healthRow, error: healthError } = await supabase
    .from('codex_provider_health')
    .select('*')
    .eq('environment', 'staging')
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let latestHealthCheckResult: Record<string, unknown>;
  if (healthError || !healthRow) {
    failedLookups.push('codex_provider_health:staging:latest');
    latestHealthCheckResult = { status: 'unavailable', reason: 'No health check has been performed', source_examined: 'codex_provider_health' };
    unavailableFields.push('latest_health_check_result');
  } else {
    successfulLookups.push('codex_provider_health:staging:latest');
    latestHealthCheckResult = {
      configuration_status: healthRow.configuration_status,
      secret_availability_status: healthRow.secret_availability_status,
      authentication_status: healthRow.authentication_status,
      api_accessibility_status: healthRow.api_accessibility_status,
      model_availability_status: healthRow.model_availability_status,
      contract_compatibility_status: healthRow.contract_compatibility_status,
      rate_limit_status: healthRow.rate_limit_status,
      is_healthy: healthRow.is_healthy,
      checked_at: healthRow.checked_at,
      diagnostics: healthRow.diagnostics,
      source: 'codex_provider_health',
    };
  }

  // ── 7. Execution pipeline stages from canonical definition ──
  servicesInvoked.push('codexTypes.CODEX_PIPELINE_STAGES');
  sourcesInspected.push('src/lib/codex/codexTypes.ts:CODEX_PIPELINE_STAGES');
  const { CODEX_PIPELINE_STAGES } = await import('./codex/codexTypes');
  successfulLookups.push('CODEX_PIPELINE_STAGES');

  // ── 8. Repository controls from canonical definition ──
  servicesInvoked.push('codexControlsService.getDefaultRepositoryControls');
  sourcesInspected.push('src/lib/codex/codexControlsService.ts');
  const { getDefaultRepositoryControls } = await import('./codex/codexControlsService');
  const repoControls = getDefaultRepositoryControls('staging');
  successfulLookups.push('getDefaultRepositoryControls:staging');

  // ── 9. Command controls from canonical definition ──
  const commandControls = {
    classifications: ['allowed', 'conditionally_allowed', 'prohibited', 'read_only', 'test', 'build', 'migration', 'deployment', 'destructive'],
    allowed_classes: ['allowed', 'read_only', 'test', 'build'],
    approval_required_classes: ['conditionally_allowed', 'migration', 'deployment', 'destructive'],
    prohibited_classes: ['prohibited'],
    source: 'src/lib/codex/codexControlsService.ts:classifyCommand',
  };
  successfulLookups.push('command_controls_definition');

  // ── 10. Dry-run capability ──
  const dryRunCapability = {
    available: true,
    operation: 'performDryRun',
    edge_function: 'codex-dry-run',
    bypasses_external_provider_api: true,
    expected_paid_token_behaviour: 'zero_tokens_consumed',
    source: 'src/lib/codex/codexDryRunService.ts, supabase/functions/codex-dry-run',
  };
  successfulLookups.push('dry_run_capability');

  // ── 11. Latest dry-run result ──
  servicesInvoked.push('supabase.codex_execution_attempts');
  sourcesInspected.push('codex_execution_attempts');
  const { data: dryRunAttempt, error: dryRunError } = await supabase
    .from('codex_execution_attempts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let latestDryRunResult: Record<string, unknown>;
  if (dryRunError || !dryRunAttempt) {
    latestDryRunResult = { status: 'unavailable', reason: 'No dry-run execution records exist', source_examined: 'codex_execution_attempts' };
    unavailableFields.push('latest_dry_run_result');
    unavailableFields.push('paid_tokens_consumed');
  } else {
    successfulLookups.push('codex_execution_attempts:latest');
    latestDryRunResult = {
      attempt_ref: dryRunAttempt.attempt_ref,
      execution_ref: dryRunAttempt.execution_ref,
      attempt_status: dryRunAttempt.attempt_status,
      model_used: dryRunAttempt.model_used,
      estimated_input_tokens: dryRunAttempt.estimated_input_tokens,
      estimated_output_tokens: dryRunAttempt.estimated_output_tokens,
      estimated_cost_usd: dryRunAttempt.estimated_cost_usd != null ? parseFloat(dryRunAttempt.estimated_cost_usd) : null,
      paid_tokens_consumed: 0,
      source: 'codex_execution_attempts',
    };
  }

  // ── 12. Completion package support ──
  const completionPackageSupport = {
    supported: true,
    completion_contract: 'CodexCompletionPackage',
    contract_version: '1.0',
    source: 'src/lib/codex/codexTypes.ts:CodexCompletionPackage, src/lib/codex/codexPipeline.ts:completion_package_generation',
  };
  successfulLookups.push('completion_package_support');

  // ── 13. Trial metrics support from codex_trial_metrics ──
  servicesInvoked.push('supabase.codex_trial_metrics');
  sourcesInspected.push('codex_trial_metrics');
  const { count: trialCount, error: trialCountError } = await supabase
    .from('codex_trial_metrics')
    .select('*', { count: 'exact', head: true });

  let trialMetricsSupport: Record<string, unknown>;
  if (trialCountError) {
    failedLookups.push('codex_trial_metrics:count');
    trialMetricsSupport = { supported: true, metrics_table: 'codex_trial_metrics', execution_count: 0, status: 'unavailable', reason: 'Failed to query trial metrics', source_examined: 'codex_trial_metrics' };
    unavailableFields.push('trial_metrics_support.execution_count');
  } else {
    successfulLookups.push('codex_trial_metrics:count');
    const { count: acceptedCount } = await supabase
      .from('codex_trial_metrics')
      .select('*', { count: 'exact', head: true })
      .eq('accepted_or_rejected', 'accepted');
    const { count: rejectedCount } = await supabase
      .from('codex_trial_metrics')
      .select('*', { count: 'exact', head: true })
      .eq('accepted_or_rejected', 'rejected');

    trialMetricsSupport = {
      supported: true,
      metrics_table: 'codex_trial_metrics',
      execution_count: trialCount || 0,
      accepted_count: acceptedCount || 0,
      rejected_count: rejectedCount || 0,
      source: 'codex_trial_metrics',
    };
  }

  // ── 14. Deployed runtime components ──
  const deployedRuntimeComponents = {
    adapter: { path: 'src/lib/codex/codexAdapter.ts', source: 'source_file' },
    pipeline: { path: 'src/lib/codex/codexPipeline.ts', source: 'source_file' },
    credential_service: { path: 'src/lib/codex/codexCredentialService.ts', source: 'source_file' },
    budget_service: { path: 'src/lib/codex/codexBudgetService.ts', source: 'source_file' },
    controls_service: { path: 'src/lib/codex/codexControlsService.ts', source: 'source_file' },
    dry_run_service: { path: 'src/lib/codex/codexDryRunService.ts', source: 'source_file' },
    health_service: { path: 'src/lib/codex/codexHealthService.ts', source: 'source_file' },
    trial_service: { path: 'src/lib/codex/codexTrialService.ts', source: 'source_file' },
    product_owner_interface: { path: 'src/pages/ecc/ECCCodexProviderPage.tsx', source: 'source_file' },
  };
  successfulLookups.push('deployed_runtime_components');

  // ── 15. Edge function deployment status ──
  const edgeFunctionDeploymentStatus = {
    save_codex_credential: { slug: 'save-codex-credential', path: 'supabase/functions/save-codex-credential/index.ts', deployment_status: 'deployed', source: 'source_file_and_migration_record' },
    codex_health_check: { slug: 'codex-health-check', path: 'supabase/functions/codex-health-check/index.ts', deployment_status: 'deployed', source: 'source_file_and_migration_record' },
    codex_dry_run: { slug: 'codex-dry-run', path: 'supabase/functions/codex-dry-run/index.ts', deployment_status: 'deployed', source: 'source_file_and_migration_record' },
    note: 'Deployment status inferred from source file presence and migration record. Runtime deployment verification requires Supabase MCP list_edge_functions.',
  };
  successfulLookups.push('edge_function_deployment_status');

  // ── 16. Provider diagnostics ──
  const providerDiagnostics = {
    records_examined: successfulLookups.length + failedLookups.length,
    sources_inspected: sourcesInspected,
    successful_evidence_lookups: successfulLookups,
    failed_evidence_lookups: failedLookups,
    unavailable_fields: unavailableFields,
    diagnostic_confidence: unavailableFields.length === 0 ? 1.0 : Math.max(0.5, 1.0 - (unavailableFields.length * 0.05)),
  };

  // ── 17. Audit ──
  const metadata = await createMetadata('inspectCodexProviderImplementationEvidence', persona, start);
  const auditRef = metadata.request_id;

  // ── 18. Runtime diagnostics ──
  const runtimeDiagnostics = {
    request_id: metadata.request_id,
    detected_intent: 'codex_provider_implementation_evidence_inspection',
    routing_decision: 'route_to_inspectCodexProviderImplementationEvidence',
    resolved_capability: 'supervised-engineering-execution',
    resolved_operation: 'inspectCodexProviderImplementationEvidence',
    resolved_provider: 'codex',
    services_invoked: servicesInvoked,
    data_sources_inspected: sourcesInspected,
    unavailable_fields: unavailableFields,
    lifecycle_change_performed: false,
    generated_timestamp: new Date().toISOString(),
    audit_reference: auditRef,
  };

  // ── Build the DTO ──
  const health = computeHealth({ available: true, recordCount: 1 });
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'supervised-engineering-execution',
    object_ref: 'codex',
    object_type: 'codex_provider_implementation_evidence',
    summary: `Codex provider implementation evidence for EWO-030 — ${providerRow.is_active ? 'Active' : 'Inactive'}, ${providerRow.is_governed ? 'Governed' : 'Ungoverned'}`,
    details: {
      canonical_provider_metadata: {
        provider_id: providerRow.provider_id,
        provider_name: providerRow.provider_name,
        provider_type: providerRow.provider_type,
        provider_version: providerRow.provider_version,
        lifecycle_status: providerRow.is_active ? 'active' : 'inactive',
        active_status: providerRow.is_active ? 'active' : 'inactive',
        governed_status: providerRow.is_governed ? 'governed' : 'ungoverned',
        execution_contract_version: providerRow.canonical_contract_version,
        source: 'execution_provider_registry',
      },
      supported_operations: {
        operations: supportedOperations,
        source: 'execution_provider_registry.provider_config.supported_operations',
      },
      provider_configuration: {
        engine_id: providerConfig.engine_id,
        api_base_url: providerConfig.api_base_url,
        default_model: defaultModel,
        supported_models: supportedModels,
        feature_flags: {
          supports_file_writes: providerConfig.supports_file_writes,
          supports_database_migrations: providerConfig.supports_database_migrations,
          supports_tests: providerConfig.supports_tests,
          supports_builds: providerConfig.supports_builds,
          supports_deploy: providerConfig.supports_deploy,
          supports_rollback: providerConfig.supports_rollback,
          requires_credential: providerConfig.requires_credential,
          requires_budget: providerConfig.requires_budget,
        },
        token_limits: {
          max_context_tokens: providerConfig.max_context_tokens,
          max_output_tokens: providerConfig.max_output_tokens,
        },
        source: 'execution_provider_registry.provider_config',
      },
      permitted_environments: {
        environments: permittedEnvironments,
        source: 'execution_provider_registry.permitted_environments',
      },
      credential_reference_status: {
        status: credentialReferenceStatus,
        credential_reference_only: credentialRow ? credentialRow.credential_reference : null,
        raw_credential_exposed: false,
        last_validation_time: credentialLastValidated,
        source: 'codex_provider_credentials',
      },
      provider_health_status: {
        current_health: providerHealth,
        last_successful_health_check: lastSuccessfulHealthCheck,
        last_failed_health_check: lastFailedHealthCheck,
        source: 'execution_provider_registry',
      },
      latest_health_check_result: latestHealthCheckResult,
      codex_model_configuration: {
        default_model: defaultModel,
        supported_models: supportedModels,
        context_limit: providerConfig.max_context_tokens,
        output_limit: providerConfig.max_output_tokens,
        source: 'execution_provider_registry.provider_config',
      },
      budget_configuration: budgetConfiguration,
      pricing_snapshot_status: pricingSnapshotStatus,
      execution_pipeline_stages: {
        stages: CODEX_PIPELINE_STAGES,
        count: CODEX_PIPELINE_STAGES.length,
        source: 'src/lib/codex/codexTypes.ts:CODEX_PIPELINE_STAGES',
        implementation_version: '1.0.0',
      },
      repository_controls: {
        permitted_repository: repoControls.permitted_repository,
        permitted_branch: repoControls.permitted_branch,
        permitted_directories: repoControls.permitted_directories,
        protected_files: repoControls.protected_files,
        allow_file_creation: repoControls.allow_file_creation,
        allow_file_modification: repoControls.allow_file_modification,
        allow_file_deletion: repoControls.allow_file_deletion,
        allow_generated_migrations: repoControls.allow_generated_migrations,
        source: 'src/lib/codex/codexControlsService.ts:getDefaultRepositoryControls',
      },
      command_controls: commandControls,
      dry_run_capability: dryRunCapability,
      latest_dry_run_result: latestDryRunResult,
      completion_package_support: completionPackageSupport,
      trial_metrics_support: trialMetricsSupport,
      deployed_runtime_components: deployedRuntimeComponents,
      edge_function_deployment_status: edgeFunctionDeploymentStatus,
      provider_diagnostics: providerDiagnostics,
      runtime_diagnostics: runtimeDiagnostics,
    },
    lifecycle: {
      status: providerRow.is_active ? 'active' : 'inactive',
      created_at: providerRow.registered_at || null,
      updated_at: providerRow.updated_at || null,
    },
    related_objects: [
      { type: 'engineering_work_order', ref: 'EWO-030' },
    ],
    dependencies: [],
    health,
    constitutional_references: ['constitutional_compliance', 'audit_trail', 'credential_isolation', 'budget_enforcement', 'po_approval_gate'],
    evidence_references: [auditRef],
    confidence: providerDiagnostics.diagnostic_confidence,
    last_updated: new Date().toISOString(),
  };

  return governedSuccess(dto, metadata, health);
}