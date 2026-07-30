// EWO-024 / EWO-024R.1 — ATD Connect: Governed Inspection DTOs
// Every inspection response contains governed information only.
// Never expose raw database rows.

// ─── Capability Registry Types ────────────────────────────────────────────────

export type CapabilityStatus = 'active' | 'deprecated' | 'planned';
export type ConstitutionalVisibility = 'public' | 'restricted' | 'internal';
export type InspectionOperation =
  | 'discoverCapabilities' | 'inspectCapability'
  | 'listPages' | 'inspectPage'
  | 'listWorkspaces' | 'inspectWorkspace'
  | 'listServices' | 'inspectService'
  | 'listStandards' | 'inspectStandard'
  | 'listConstitution' | 'inspectConstitution'
  | 'listEngineeringRecords' | 'inspectEngineeringRecord'
  | 'listEngineeringWorkOrders' | 'inspectEngineeringWorkOrder'
  | 'listEngineeringPlans' | 'inspectEngineeringPlan'
  | 'listMemory' | 'inspectMemory'
  | 'listKnowledge' | 'inspectKnowledge'
  | 'listLineage' | 'inspectLineage'
  | 'inspectRelationships'
  | 'inspectKnowledgeExtraction'
  | 'listExecutionProviders' | 'inspectExecutionProvider'
  | 'listExecutionRecords' | 'inspectExecutionRecord'
  | 'inspectExecutionPipeline'
  | 'inspectExecutionGovernanceGate'
  | 'inspectExecutionHistory'
  | 'inspectSupervisedExecutionEngine'
  | 'inspectCodexProviderImplementationEvidence'
  | 'inspectEngineeringWorkOrderAcceptanceGovernance';

export interface CapabilityRegistration {
  capability_id: string;
  name: string;
  category: string;
  description: string;
  status?: CapabilityStatus;
  owner?: string;
  constitutional_visibility?: ConstitutionalVisibility;
  inspection_service: string;
  relationships?: string[];
  supported_operations: InspectionOperation[];
  metadata?: Record<string, unknown>;
  // EWO-024R.1 enhanced fields
  capability_version?: string;
  introduced_by_ewo?: string;
  lifecycle_status?: string;
  deprecated?: boolean;
  superseded_by?: string | null;
  replacement_capability?: string | null;
  inspection_contract_version?: string;
  // EWO-017 governed capability inspection fields
  purpose?: string;
  dependencies?: string[];
  supported_object_types?: string[];
  current_availability?: 'available' | 'degraded' | 'unavailable' | 'disabled';
  authentication_requirements?: {
    authentication: string;
    token_type?: string;
    persona?: string;
  };
}

export interface Capability {
  id: string;
  capability_id: string;
  name: string;
  category: string;
  description: string;
  status: CapabilityStatus;
  owner: string | null;
  constitutional_visibility: ConstitutionalVisibility;
  inspection_service: string;
  relationships: string[];
  supported_operations: InspectionOperation[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // EWO-024R.1 enhanced fields
  capability_version?: string | null;
  introduced_by_ewo?: string | null;
  lifecycle_status?: string | null;
  deprecated?: boolean;
  superseded_by?: string | null;
  replacement_capability?: string | null;
  inspection_contract_version?: string | null;
  // EWO-017 governed capability inspection fields
  purpose?: string | null;
  dependencies?: string[] | null;
  supported_object_types?: string[] | null;
  current_availability?: string | null;
  authentication_requirements?: Record<string, unknown> | null;
}

// ─── Inspection DTOs ────────────────────────────────────────────────────────────

export interface InspectionMetadata {
  request_id: string;
  timestamp: string;
  requesting_persona: string;
  operation: InspectionOperation;
  duration_ms: number;
}

export interface HealthInfo {
  availability: 'available' | 'degraded' | 'unavailable';
  health: 'healthy' | 'warning' | 'critical';
  inspection_confidence: number; // 0-1
  evidence_quality: number; // 0-1
  relationship_completeness: number; // 0-1
  // EWO-024R.1 separated health dimensions (null = unavailable, not inferred)
  operational_health?: 'healthy' | 'warning' | 'critical' | null;
  inspection_availability?: 'available' | 'degraded' | 'unavailable' | null;
  evidence_health?: 'healthy' | 'warning' | 'critical' | null;
  relationship_health?: 'healthy' | 'warning' | 'critical' | null;
  documentation_health?: 'healthy' | 'warning' | 'critical' | null;
  automated_test_health?: 'healthy' | 'warning' | 'critical' | null;
  engineering_confidence?: number | null; // 0-1
}

export interface RelatedObjectRef {
  ref: string;
  type: string;
  relationship: string;
}

export interface ConstitutionalReference {
  amendment_id: string;
  title: string;
  visibility: ConstitutionalVisibility;
}

export interface EvidenceReference {
  ref: string;
  type: string;
  source: string;
}

export interface CapabilityInspectionDTO {
  metadata: InspectionMetadata;
  capability: {
    capability_id: string;
    name: string;
    category: string;
    description: string;
    status: CapabilityStatus;
    owner: string | null;
    constitutional_visibility: ConstitutionalVisibility;
  };
  summary: string;
  lifecycle: {
    status: CapabilityStatus;
    created_at: string;
    updated_at: string;
  };
  related_objects: RelatedObjectRef[];
  dependencies: string[];
  health: HealthInfo;
  constitutional_references: ConstitutionalReference[];
  evidence_references: EvidenceReference[];
  confidence: number;
  last_updated: string;
}

export interface ListItemDTO {
  id: string;
  ref: string;
  name: string;
  type: string;
  status: string;
  summary: string;
  health?: HealthInfo;
}

export interface ListInspectionDTO {
  metadata: InspectionMetadata;
  capability_id: string;
  items: ListItemDTO[];
  total_count: number;
  health: HealthInfo;
}

export interface ObjectInspectionDTO {
  metadata: InspectionMetadata;
  capability_id: string;
  object_ref: string;
  object_type: string;
  summary: string;
  details: Record<string, unknown>;
  lifecycle: {
    status: string;
    created_at: string | null;
    updated_at: string | null;
  };
  related_objects: RelatedObjectRef[];
  dependencies: string[];
  health: HealthInfo;
  constitutional_references: ConstitutionalReference[];
  evidence_references: EvidenceReference[];
  confidence: number;
  last_updated: string | null;
}

export interface RelationshipInspectionDTO {
  metadata: InspectionMetadata;
  object_ref: string;
  object_type: string;
  relationships: RelatedObjectRef[];
  relationship_graph: {
    nodes: Array<{ id: string; type: string; label: string }>;
    edges: Array<{ from: string; to: string; type: string }>;
  };
  health: HealthInfo;
  confidence: number;
}

// ─── EWO-029R.1: Supervised Execution Engine Inspection DTO ──────────────────────

export interface ExecutionProviderInfo {
  provider_id: string;
  provider_name: string;
  provider_version: string;
  provider_type: string;
  is_active: boolean;
  is_governed: boolean;
  governance_rules: string[];
  canonical_contract_version: string;
  lifecycle_status: string;
}

export interface ProviderIndependenceEvidence {
  status: 'confirmed' | 'partial' | 'unavailable';
  evidence: string[];
}

export interface PipelineStageInfo {
  stage: string;
  sequence: number;
}

export interface GovernanceGateInfo {
  gate: string;
  description: string;
  severity: 'critical' | 'warning';
}

export interface RuntimeDiagnosticsInfo {
  request_id: string;
  detected_intent: string;
  extracted_target: string;
  target_resolution_method: string;
  capability_resolution_method: string;
  operation_resolution_method: string;
  routing_rule: string;
  services_invoked: string[];
  registries_inspected: string[];
  provider_records_examined: number;
  package_definitions_inspected: boolean;
  pipeline_definitions_inspected: boolean;
  gate_definitions_inspected: boolean;
  unavailable_fields: string[];
  diagnostic_confidence: number;
  lifecycle_change_performed: boolean;
  generated_timestamp: string;
  audit_reference: string;
}

export interface IntentDiagnosticsInfo {
  detected_intent: string;
  confidence: number;
  routing_decision: string;
  extracted_target: string;
  matched_pattern: string;
  isWriteRequest: boolean;
  isMetadataQuestion: boolean;
  isFrameworkIntrospection: boolean;
  isExecutionInspection: boolean;
  lifecycle_change_requested: boolean;
}

export interface SupervisedExecutionEngineInspectionDTO {
  metadata: InspectionMetadata;
  capability_id: string;
  detected_intent: string;
  routing_decision: string;
  resolved_capability: string;
  resolved_operation: string;
  execution_providers: ExecutionProviderInfo[];
  active_execution_provider: ExecutionProviderInfo | null;
  provider_independence_status: ProviderIndependenceEvidence;
  execution_package_support: {
    supported: boolean;
    description: string;
  };
  execution_pipeline_stages: PipelineStageInfo[];
  execution_diagnostics_support: {
    supported: boolean;
    description: string;
  };
  product_owner_governance_gates: GovernanceGateInfo[];
  runtime_diagnostics: RuntimeDiagnosticsInfo;
  intent_diagnostics: IntentDiagnosticsInfo;
  lifecycle_change_performed: boolean;
  audit_reference: string;
  health: HealthInfo;
}

// ─── Audit Types ────────────────────────────────────────────────────────────────

export type InspectionOutcome = 'success' | 'error' | 'governed_empty' | 'unresolved';
export type RequestSource = 'workspace' | 'conversational' | 'external' | 'mcp_client' | 'mcp_self_test' | 'external_confirmed';

export interface InspectionLogEntry {
  id: string;
  request_id: string;
  timestamp: string;
  requesting_persona: string;
  inspected_capability: string | null;
  inspected_object: string | null;
  operation: InspectionOperation;
  duration_ms: number | null;
  outcome: InspectionOutcome;
  error_message: string | null;
  response_summary: Record<string, unknown> | null;
  created_at: string;
  // EWO-024R.1 enhanced fields
  original_request?: string | null;
  resolved_capability?: string | null;
  resolved_operation?: string | null;
  resolved_object_reference?: string | null;
  client_id?: string | null;
  session_id?: string | null;
  authentication_outcome?: string | null;
  governance_outcome?: string | null;
  pipeline_stages?: string[] | null;
  result_type?: string | null;
  confidence?: number | null;
  evidence_count?: number | null;
  relationship_count?: number | null;
  request_source?: RequestSource | null;
}

// ─── Governed Response ──────────────────────────────────────────────────────────

export interface GovernedResponse<T> {
  governed: true;
  data: T | null;
  explanation: string | null;
  health: HealthInfo;
  metadata: InspectionMetadata;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────────

export interface DiagnosticEntry {
  level: 'info' | 'warning' | 'error';
  message: string;
  source: string;
  timestamp: string;
}

export interface PlatformDiagnosticsDTO {
  metadata: InspectionMetadata;
  total_capabilities: number;
  active_capabilities: number;
  total_inspections: number;
  recent_errors: number;
  health: HealthInfo;
  diagnostics: DiagnosticEntry[];
}

// ─── EWO-024R.1: Conversation Inspection Bridge Contracts ──────────────────────────

export interface InspectionOptions {
  include_relationships?: boolean;
  include_health?: boolean;
  include_evidence_references?: boolean;
  include_constitutional_references?: boolean;
  include_lifecycle?: boolean;
}

export interface AuthenticationContext {
  authenticated: boolean;
  persona?: string;
  client_id?: string;
  session_id?: string;
  token_type?: string;
}

export interface ConversationInspectionRequest {
  request_id: string;
  requesting_persona: string;
  client_id?: string;
  session_id?: string;
  natural_language_request: string;
  requested_capability?: string;
  requested_operation?: string;
  requested_object_reference?: string;
  inspection_options?: InspectionOptions;
  authentication_context?: AuthenticationContext;
  requested_at: string;
}

export interface ConversationInspectionResponse {
  request_id: string;
  governed: boolean;
  interpretation: string;
  resolved_capability: string | null;
  resolved_operation: string | null;
  resolved_object_reference: string | null;
  inspection_result: unknown;
  evidence_references: EvidenceReference[];
  constitutional_references: ConstitutionalReference[];
  health: HealthInfo;
  confidence: number;
  missing_information: string[];
  audit_reference: string;
  completed_at: string;
  result_type: 'success' | 'governed_empty' | 'unresolved' | 'error';
  intent_diagnostics?: IntentDiagnosticsInfo;
}

// ─── EWO-024R.1: Governed Inspection Pipeline ─────────────────────────────────────

export type PipelineStageName =
  | 'request_received'
  | 'authentication_context_established'
  | 'persona_visibility_authorisation'
  | 'constitutional_governance_evaluation'
  | 'capability_resolution'
  | 'operation_validation'
  | 'object_reference_validation'
  | 'governed_inspection_execution'
  | 'optional_relationship_expansion'
  | 'evidence_and_health_assembly'
  | 'governed_dto_creation'
  | 'audit_recording'
  | 'response_returned';

export interface PipelineStageResult {
  stage: PipelineStageName;
  status: 'completed' | 'failed' | 'not_applicable' | 'skipped';
  message?: string;
  duration_ms?: number;
}

export interface PipelineDiagnosticInfo {
  stages: PipelineStageResult[];
  total_duration_ms: number;
  stages_completed: number;
  stages_failed: number;
  stages_not_applicable: number;
}

// ─── EWO-024R.1: Read-Only Boundary ────────────────────────────────────────────────

export interface GovernedRefusal {
  governed: true;
  refused: true;
  reason: string;
  message: string;
  audit_reference: string;
  requested_action?: string;
  no_changes_made?: boolean;
  available_alternatives?: string[];
}

export const READ_ONLY_VIOLATION_KEYWORDS = [
  'insert', 'update', 'delete', 'create', 'modify', 'change',
  'approve', 'accept', 'close', 'deploy', 'execute', 'run',
  'lifecycle', 'transition', 'write', 'set', 'assign',
  'remove', 'drop', 'purge', 'archive', 'restore',
];
