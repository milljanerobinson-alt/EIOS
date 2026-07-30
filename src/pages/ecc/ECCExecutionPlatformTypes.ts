// ─── EWO-010: EIOS Engineering Execution Platform — Shared Types ──────────────

// ─── Execution State Machine ──────────────────────────────────────────────────

export type ExecutionState =
  | 'requested'
  | 'prepared'
  | 'sandbox_ready'
  | 'executing'
  | 'paused'
  | 'validation'
  | 'guardian_review'
  | 'awaiting_product_owner'
  | 'accepted'
  | 'rolled_back'
  | 'completed'
  | 'cancelled'
  | 'aborted'
  | 'recovery';

export type AgentStatus  = 'active' | 'inactive' | 'maintenance' | 'deprecated';
export type AgentHealth  = 'healthy' | 'degraded' | 'unavailable' | 'unknown';
export type TaskState    = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped' | 'blocked';
export type OperationState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type EvidenceType =
  | 'build_result' | 'test_result' | 'log' | 'telemetry'
  | 'guardian_validation' | 'generated_artefact' | 'rollback_evidence'
  | 'screenshot' | 'diff' | 'metric';
export type EnforcementLevel = 'strict' | 'advisory' | 'informational';
export type StrategyType = 'incremental' | 'parallel' | 'phased' | 'spike' | 'iterative' | 'experimental';
export type ExecutionEnvironment = 'development' | 'staging' | 'production' | 'sandbox' | 'test';
export type RiskLevel    = 'low' | 'medium' | 'high' | 'critical';

// ─── Domain Objects ───────────────────────────────────────────────────────────

export interface ExecutionCapabilityProfile {
  id: string;
  profile_name: string;
  capabilities: string[];
  supported_languages: string[];
  supported_frameworks: string[];
  execution_modes: string[];
  max_session_duration_minutes: number;
  supports_rollback: boolean;
  supports_guardian: boolean;
  supports_parallel_tasks: boolean;
  description: string | null;
  created_at: string;
}

export interface EngineeringAgent {
  id: string;
  agent_ref: string;
  name: string;
  vendor: string;
  version: string;
  agent_type: string;
  status: AgentStatus;
  health: AgentHealth;
  capability_profile_id: string | null;
  description: string | null;
  last_health_check_at: string | null;
  execution_count: number;
  registered_at: string;
  metadata: Record<string, unknown>;
  // joined
  capability_profile?: ExecutionCapabilityProfile | null;
}

export interface EngineeringIntent {
  id: string;
  intent_ref: string;
  title: string;
  description: string | null;
  programme: string;
  business_driver: string | null;
  strategic_alignment: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'draft' | 'active' | 'executing' | 'completed' | 'cancelled';
  outcome_definition: string | null;
  created_at: string;
}

export interface ExecutionStrategy {
  id: string;
  intent_id: string | null;
  strategy_type: StrategyType;
  approach: string | null;
  constraints: unknown[];
  risks: unknown[];
  success_criteria: string[];
  rollback_plan: string | null;
  created_at: string;
}

export interface ExecutionContext {
  id: string;
  context_ref: string;
  name: string;
  repository: string | null;
  workspace_id: string | null;
  branch: string | null;
  application: string | null;
  product: string | null;
  environment: ExecutionEnvironment;
  risk_level: RiskLevel;
  budget_hours: number | null;
  memory_snapshot_at: string | null;
  policies: unknown[];
  contracts: unknown[];
  capabilities: unknown[];
  created_at: string;
}

export interface ExecutionPlan {
  id: string;
  plan_ref: string;
  intent_id: string | null;
  strategy_id: string | null;
  context_id: string | null;
  title: string;
  description: string | null;
  phases: unknown[];
  estimated_effort_hours: number | null;
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'cancelled';
  version: number;
  created_at: string;
}

export interface StateHistoryEntry {
  from_state: ExecutionState | null;
  to_state: ExecutionState;
  transitioned_at: string;
  reason?: string;
}

export interface ExecutionSession {
  id: string;
  session_ref: string;
  plan_id: string | null;
  agent_id: string | null;
  context_id: string | null;
  title: string;
  state: ExecutionState;
  state_history: StateHistoryEntry[];
  ewo_ref: string | null;
  engineering_record_id: string | null;
  guardian_required: boolean;
  guardian_approved_at: string | null;
  po_review_required: boolean;
  po_accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  exit_reason: string | null;
  error_summary: string | null;
  created_at: string;
  // joined
  agent?: EngineeringAgent | null;
}

export interface ExecutionTask {
  id: string;
  session_id: string;
  title: string;
  description: string | null;
  sequence_number: number;
  task_type: string;
  state: TaskState;
  assigned_agent_id: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface ExecutionOperation {
  id: string;
  task_id: string;
  operation_type: string;
  description: string | null;
  state: OperationState;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  duration_ms: number | null;
  error_message: string | null;
  error_code: string | null;
  retry_count: number;
  created_at: string;
}

export interface ExecutionEvidence {
  id: string;
  session_id: string;
  task_id: string | null;
  evidence_type: EvidenceType;
  title: string;
  content: string | null;
  metadata: Record<string, unknown>;
  file_path: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
}

export interface ExecutionContract {
  id: string;
  contract_ref: string;
  name: string;
  contract_type: string;
  scope: string | null;
  obligations: unknown[];
  constraints: unknown[];
  acceptance_criteria: unknown[];
  active: boolean;
  version: number;
  created_at: string;
}

export interface ExecutionPolicy {
  id: string;
  policy_ref: string;
  name: string;
  policy_type: string;
  description: string | null;
  rules: unknown[];
  enforcement_level: EnforcementLevel;
  applies_to: string[];
  active: boolean;
  version: number;
  created_at: string;
}

export interface ExecutionMemoryIntegration {
  id: string;
  session_id: string;
  phase: 'pre_execution' | 'post_execution';
  records_retrieved: string[];
  patterns_applied: string[];
  standards_referenced: string[];
  risks_identified: string[];
  recommendations_applied: string[];
  knowledge_updated: boolean;
  lineage_updated: boolean;
  memory_updated: boolean;
  created_at: string;
}

// ─── Execution API Interfaces (Phase 7 — interfaces only) ─────────────────────

export interface IExecutionPlatformService {
  /** Register a new engineering intent */
  createIntent(intent: Omit<EngineeringIntent, 'id' | 'created_at'>): Promise<EngineeringIntent>;
  /** Create an execution plan from intent + strategy + context */
  createPlan(plan: Omit<ExecutionPlan, 'id' | 'created_at'>): Promise<ExecutionPlan>;
  /** Request a new execution session */
  requestSession(sessionData: Omit<ExecutionSession, 'id' | 'created_at' | 'state' | 'state_history'>): Promise<ExecutionSession>;
  /** Transition session state — validated, deterministic */
  transitionState(sessionId: string, toState: ExecutionState, reason?: string): Promise<ExecutionSession>;
  /** Record execution evidence */
  recordEvidence(evidence: Omit<ExecutionEvidence, 'id' | 'created_at'>): Promise<ExecutionEvidence>;
  /** Retrieve engineering memory snapshot for pre-execution context */
  retrieveMemoryContext(sessionId: string): Promise<ExecutionMemoryIntegration>;
  /** Update engineering memory after execution */
  updateMemory(sessionId: string): Promise<ExecutionMemoryIntegration>;
}

export interface IEngineeringAgentService {
  /** Register a new agent */
  registerAgent(agent: Omit<EngineeringAgent, 'id' | 'registered_at' | 'execution_count'>): Promise<EngineeringAgent>;
  /** Report agent health */
  reportHealth(agentId: string, health: AgentHealth): Promise<void>;
  /** Get available agents for a capability */
  getAvailableAgents(capability: string): Promise<EngineeringAgent[]>;
}

export interface IExecutionStateService {
  /** Validate whether a state transition is allowed */
  canTransition(from: ExecutionState, to: ExecutionState): boolean;
  /** Get all valid next states from current state */
  validTransitions(from: ExecutionState): ExecutionState[];
}

// ─── State Machine Definition ─────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
  requested:               ['prepared', 'cancelled'],
  prepared:                ['sandbox_ready', 'cancelled'],
  sandbox_ready:           ['executing', 'cancelled'],
  executing:               ['paused', 'validation', 'aborted', 'recovery'],
  paused:                  ['executing', 'cancelled', 'aborted'],
  validation:              ['guardian_review', 'awaiting_product_owner', 'rolled_back', 'completed'],
  guardian_review:         ['awaiting_product_owner', 'rolled_back'],
  awaiting_product_owner:  ['accepted', 'rolled_back'],
  accepted:                ['completed'],
  rolled_back:             ['recovery', 'cancelled'],
  completed:               [],
  cancelled:               [],
  aborted:                 ['recovery'],
  recovery:                ['requested', 'cancelled'],
};

// ─── Config maps ──────────────────────────────────────────────────────────────

export const STATE_CFG: Record<ExecutionState, { label: string; bg: string; text: string; border: string; dot: string }> = {
  requested:              { label: 'Requested',            bg: 'bg-slate-50',    text: 'text-slate-600',   border: 'border-slate-200',  dot: 'bg-slate-400'    },
  prepared:               { label: 'Prepared',             bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',   dot: 'bg-blue-500'     },
  sandbox_ready:          { label: 'Sandbox Ready',        bg: 'bg-cyan-50',     text: 'text-cyan-700',    border: 'border-cyan-200',   dot: 'bg-cyan-500'     },
  executing:              { label: 'Executing',            bg: 'bg-indigo-50',   text: 'text-indigo-700',  border: 'border-indigo-200', dot: 'bg-indigo-500'   },
  paused:                 { label: 'Paused',               bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',  dot: 'bg-amber-500'    },
  validation:             { label: 'Validation',           bg: 'bg-violet-50',   text: 'text-violet-700',  border: 'border-violet-200', dot: 'bg-violet-500'   },
  guardian_review:        { label: 'Guardian Review',      bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200', dot: 'bg-orange-500'   },
  awaiting_product_owner: { label: 'Awaiting PO',         bg: 'bg-yellow-50',   text: 'text-yellow-700',  border: 'border-yellow-200', dot: 'bg-yellow-500'   },
  accepted:               { label: 'Accepted',             bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200',dot: 'bg-emerald-500'  },
  rolled_back:            { label: 'Rolled Back',          bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',    dot: 'bg-red-500'      },
  completed:              { label: 'Completed',            bg: 'bg-emerald-50',  text: 'text-emerald-800', border: 'border-emerald-300',dot: 'bg-emerald-600'  },
  cancelled:              { label: 'Cancelled',            bg: 'bg-slate-100',   text: 'text-slate-500',   border: 'border-slate-200',  dot: 'bg-slate-400'    },
  aborted:                { label: 'Aborted',              bg: 'bg-red-50',      text: 'text-red-600',     border: 'border-red-200',    dot: 'bg-red-500'      },
  recovery:               { label: 'Recovery',             bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',  dot: 'bg-amber-500'    },
};

export const AGENT_HEALTH_CFG: Record<AgentHealth, { label: string; dot: string; text: string }> = {
  healthy:     { label: 'Healthy',     dot: 'bg-emerald-500', text: 'text-emerald-700' },
  degraded:    { label: 'Degraded',    dot: 'bg-amber-500',   text: 'text-amber-700'   },
  unavailable: { label: 'Unavailable', dot: 'bg-red-500',     text: 'text-red-700'     },
  unknown:     { label: 'Unknown',     dot: 'bg-slate-400',   text: 'text-slate-500'   },
};

export const AGENT_STATUS_CFG: Record<AgentStatus, { label: string; text: string }> = {
  active:      { label: 'Active',      text: 'text-emerald-700' },
  inactive:    { label: 'Inactive',    text: 'text-slate-500'   },
  maintenance: { label: 'Maintenance', text: 'text-amber-700'   },
  deprecated:  { label: 'Deprecated',  text: 'text-red-600'     },
};

export const EVIDENCE_TYPE_CFG: Record<EvidenceType, { label: string; colour: string }> = {
  build_result:        { label: 'Build Result',        colour: 'emerald' },
  test_result:         { label: 'Test Result',         colour: 'blue'    },
  log:                 { label: 'Log',                 colour: 'slate'   },
  telemetry:           { label: 'Telemetry',           colour: 'cyan'    },
  guardian_validation: { label: 'Guardian Validation', colour: 'orange'  },
  generated_artefact:  { label: 'Generated Artefact',  colour: 'violet'  },
  rollback_evidence:   { label: 'Rollback Evidence',   colour: 'red'     },
  screenshot:          { label: 'Screenshot',          colour: 'teal'    },
  diff:                { label: 'Diff',                colour: 'amber'   },
  metric:              { label: 'Metric',              colour: 'indigo'  },
};

export const ENFORCEMENT_CFG: Record<EnforcementLevel, { label: string; bg: string; text: string }> = {
  strict:        { label: 'Strict',        bg: 'bg-red-50',    text: 'text-red-700'     },
  advisory:      { label: 'Advisory',      bg: 'bg-amber-50',  text: 'text-amber-700'   },
  informational: { label: 'Informational', bg: 'bg-blue-50',   text: 'text-blue-700'    },
};

// Active execution states (session is in-flight)
export const ACTIVE_STATES: ExecutionState[] = [
  'executing', 'paused', 'validation', 'guardian_review', 'awaiting_product_owner', 'recovery',
];

// Queue states (session is pending start)
export const QUEUE_STATES: ExecutionState[] = ['requested', 'prepared', 'sandbox_ready'];

// Terminal states (session is done)
export const TERMINAL_STATES: ExecutionState[] = ['completed', 'cancelled', 'aborted', 'rolled_back'];
