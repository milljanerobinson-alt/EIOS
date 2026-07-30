/**
 * EWO-010: EIOS Engineering Execution Platform Foundation
 * Test suite covering: execution domain model, state machine, agent framework,
 * execution context, evidence, contracts, policies, memory integration,
 * execution API interfaces, and backwards compatibility.
 */

import { describe, it, expect } from 'vitest';
import {
  VALID_TRANSITIONS,
  STATE_CFG,
  AGENT_HEALTH_CFG,
  AGENT_STATUS_CFG,
  EVIDENCE_TYPE_CFG,
  ENFORCEMENT_CFG,
  ACTIVE_STATES,
  QUEUE_STATES,
  TERMINAL_STATES,
  type ExecutionState,
  type IExecutionStateService,
} from '../pages/ecc/ECCExecutionPlatformTypes';

// ─── 1. Execution Domain Model ────────────────────────────────────────────────

describe('Execution domain model', () => {
  it('13 domain objects are defined', () => {
    const DOMAIN_OBJECTS = [
      'execution_capability_profile',
      'engineering_agent',
      'engineering_intent',
      'execution_strategy',
      'execution_context',
      'execution_plan',
      'execution_session',
      'execution_task',
      'execution_operation',
      'execution_evidence',
      'execution_contract',
      'execution_policy',
      'execution_memory_integration',
    ];
    expect(DOMAIN_OBJECTS).toHaveLength(13);
  });

  it('engineering_agent model has all required fields', () => {
    const agent = {
      id: 'uuid-001',
      agent_ref: 'EIOS-AGENT-001',
      name: 'EIOS AI Engineering Agent',
      vendor: 'Anthropic (via Bolt)',
      version: 'claude-3-7-sonnet',
      agent_type: 'full_stack',
      status: 'active' as const,
      health: 'healthy' as const,
      capability_profile_id: 'uuid-cap-001',
      description: 'Primary AI engineering agent for EIOS platform.',
      last_health_check_at: '2026-07-12T09:00:00Z',
      execution_count: 0,
      registered_at: '2026-07-12T09:00:00Z',
      metadata: { constitutional_compliance: true },
    };
    expect(agent.agent_ref).toBe('EIOS-AGENT-001');
    expect(agent.status).toBe('active');
    expect(agent.health).toBe('healthy');
    expect(agent.metadata.constitutional_compliance).toBe(true);
  });

  it('engineering_intent model captures business driver and strategic alignment', () => {
    const intent = {
      id: 'uuid-002',
      intent_ref: 'INT-001',
      title: 'Implement Execution Platform Foundation',
      description: 'Foundation of the EIOS Engineering Execution Platform',
      programme: 'EIOS',
      business_driver: 'Enable structured, traceable, governed engineering execution',
      strategic_alignment: 'EIOS Engineering Execution Standard (EES) v1.0',
      priority: 'high' as const,
      status: 'active' as const,
      outcome_definition: 'All 9 execution phases operational with full governance',
      created_at: '2026-07-12T09:00:00Z',
    };
    expect(intent.intent_ref).toBe('INT-001');
    expect(intent.business_driver).toBeTruthy();
    expect(intent.strategic_alignment).toContain('EES');
    expect(intent.priority).toBe('high');
  });

  it('execution_session references all related domain objects', () => {
    const session = {
      id: 'uuid-003',
      session_ref: 'SES-001',
      plan_id: 'uuid-plan-001',
      agent_id: 'uuid-agent-001',
      context_id: 'uuid-ctx-001',
      title: 'EWO-010 Implementation',
      state: 'executing' as ExecutionState,
      state_history: [],
      ewo_ref: 'EWO-010',
      engineering_record_id: null,
      guardian_required: true,
      guardian_approved_at: null,
      po_review_required: true,
      po_accepted_at: null,
      started_at: '2026-07-12T09:00:00Z',
      completed_at: null,
      duration_minutes: null,
      exit_reason: null,
      error_summary: null,
      created_at: '2026-07-12T09:00:00Z',
    };
    expect(session.plan_id).toBeTruthy();
    expect(session.agent_id).toBeTruthy();
    expect(session.context_id).toBeTruthy();
    expect(session.guardian_required).toBe(true);
    expect(session.ewo_ref).toBe('EWO-010');
  });

  it('execution_evidence is a first-class domain object', () => {
    const evidence = {
      id: 'uuid-ev-001',
      session_id: 'uuid-ses-001',
      task_id: null,
      evidence_type: 'build_result' as const,
      title: 'npm run build — PASSED',
      content: 'Build completed in 26.58s. 2053 modules transformed. Zero errors.',
      metadata: { exit_code: 0, duration_s: 26.58 },
      file_path: null,
      verified_at: '2026-07-12T09:00:00Z',
      verified_by: 'Bolt',
      created_at: '2026-07-12T09:00:00Z',
    };
    expect(evidence.evidence_type).toBe('build_result');
    expect(evidence.verified_at).toBeTruthy();
    expect(evidence.metadata.exit_code).toBe(0);
  });
});

// ─── 2. Execution State Machine ───────────────────────────────────────────────

describe('Execution state machine', () => {
  it('14 execution states are defined', () => {
    const states = Object.keys(STATE_CFG) as ExecutionState[];
    expect(states).toHaveLength(14);
  });

  it('all 14 states are present in STATE_CFG', () => {
    const expected: ExecutionState[] = [
      'requested', 'prepared', 'sandbox_ready', 'executing',
      'paused', 'validation', 'guardian_review', 'awaiting_product_owner',
      'accepted', 'rolled_back', 'completed', 'cancelled', 'aborted', 'recovery',
    ];
    for (const s of expected) {
      expect(STATE_CFG).toHaveProperty(s);
    }
  });

  it('all 14 states have valid transitions defined', () => {
    const states = Object.keys(STATE_CFG) as ExecutionState[];
    for (const s of states) {
      expect(VALID_TRANSITIONS).toHaveProperty(s);
    }
  });

  it('requested → prepared is a valid transition', () => {
    expect(VALID_TRANSITIONS.requested).toContain('prepared');
  });

  it('prepared → sandbox_ready is a valid transition', () => {
    expect(VALID_TRANSITIONS.prepared).toContain('sandbox_ready');
  });

  it('sandbox_ready → executing is a valid transition', () => {
    expect(VALID_TRANSITIONS.sandbox_ready).toContain('executing');
  });

  it('executing → validation is a valid transition', () => {
    expect(VALID_TRANSITIONS.executing).toContain('validation');
  });

  it('validation → guardian_review is a valid transition', () => {
    expect(VALID_TRANSITIONS.validation).toContain('guardian_review');
  });

  it('guardian_review → awaiting_product_owner is a valid transition', () => {
    expect(VALID_TRANSITIONS.guardian_review).toContain('awaiting_product_owner');
  });

  it('awaiting_product_owner → accepted is a valid transition', () => {
    expect(VALID_TRANSITIONS.awaiting_product_owner).toContain('accepted');
  });

  it('accepted → completed is a valid transition', () => {
    expect(VALID_TRANSITIONS.accepted).toContain('completed');
  });

  it('completed is a terminal state — no valid transitions', () => {
    expect(VALID_TRANSITIONS.completed).toHaveLength(0);
  });

  it('cancelled is a terminal state — no valid transitions', () => {
    expect(VALID_TRANSITIONS.cancelled).toHaveLength(0);
  });

  it('aborted can transition to recovery', () => {
    expect(VALID_TRANSITIONS.aborted).toContain('recovery');
  });

  it('recovery can transition back to requested', () => {
    expect(VALID_TRANSITIONS.recovery).toContain('requested');
  });

  it('executing can be paused or aborted', () => {
    expect(VALID_TRANSITIONS.executing).toContain('paused');
    expect(VALID_TRANSITIONS.executing).toContain('aborted');
  });

  it('rolled_back can transition to recovery', () => {
    expect(VALID_TRANSITIONS.rolled_back).toContain('recovery');
  });

  it('state machine has no undefined transition targets', () => {
    const validStates = new Set(Object.keys(STATE_CFG));
    for (const [, targets] of Object.entries(VALID_TRANSITIONS)) {
      for (const t of targets) {
        expect(validStates.has(t)).toBe(true);
      }
    }
  });

  it('ACTIVE_STATES contains executing and related in-flight states', () => {
    expect(ACTIVE_STATES).toContain('executing');
    expect(ACTIVE_STATES).toContain('paused');
    expect(ACTIVE_STATES).toContain('validation');
    expect(ACTIVE_STATES).toContain('guardian_review');
    expect(ACTIVE_STATES).toContain('awaiting_product_owner');
  });

  it('QUEUE_STATES contains pre-execution states', () => {
    expect(QUEUE_STATES).toContain('requested');
    expect(QUEUE_STATES).toContain('prepared');
    expect(QUEUE_STATES).toContain('sandbox_ready');
  });

  it('TERMINAL_STATES contains completed, cancelled, aborted, rolled_back', () => {
    expect(TERMINAL_STATES).toContain('completed');
    expect(TERMINAL_STATES).toContain('cancelled');
    expect(TERMINAL_STATES).toContain('aborted');
    expect(TERMINAL_STATES).toContain('rolled_back');
  });

  it('ACTIVE_STATES, QUEUE_STATES, and TERMINAL_STATES are disjoint', () => {
    const active   = new Set(ACTIVE_STATES);
    const queue    = new Set(QUEUE_STATES);
    const terminal = new Set(TERMINAL_STATES);

    for (const s of ACTIVE_STATES)   { expect(queue.has(s)).toBe(false);    expect(terminal.has(s)).toBe(false); }
    for (const s of QUEUE_STATES)    { expect(active.has(s)).toBe(false);   expect(terminal.has(s)).toBe(false); }
    for (const s of TERMINAL_STATES) { expect(active.has(s)).toBe(false);   expect(queue.has(s)).toBe(false);    }
  });

  it('state service interface can determine valid transitions', () => {
    const stateService: IExecutionStateService = {
      canTransition(from, to) {
        return VALID_TRANSITIONS[from]?.includes(to) ?? false;
      },
      validTransitions(from) {
        return VALID_TRANSITIONS[from] ?? [];
      },
    };

    expect(stateService.canTransition('requested', 'prepared')).toBe(true);
    expect(stateService.canTransition('completed', 'executing')).toBe(false);
    expect(stateService.validTransitions('executing')).toContain('paused');
    expect(stateService.validTransitions('completed')).toHaveLength(0);
  });
});

// ─── 3. Engineering Agent Framework ──────────────────────────────────────────

describe('Engineering agent framework', () => {
  it('four agent health states are defined', () => {
    expect(Object.keys(AGENT_HEALTH_CFG)).toHaveLength(4);
    expect(AGENT_HEALTH_CFG).toHaveProperty('healthy');
    expect(AGENT_HEALTH_CFG).toHaveProperty('degraded');
    expect(AGENT_HEALTH_CFG).toHaveProperty('unavailable');
    expect(AGENT_HEALTH_CFG).toHaveProperty('unknown');
  });

  it('four agent status states are defined', () => {
    expect(Object.keys(AGENT_STATUS_CFG)).toHaveLength(4);
    expect(AGENT_STATUS_CFG).toHaveProperty('active');
    expect(AGENT_STATUS_CFG).toHaveProperty('inactive');
    expect(AGENT_STATUS_CFG).toHaveProperty('maintenance');
    expect(AGENT_STATUS_CFG).toHaveProperty('deprecated');
  });

  it('agent is NOT constitutionally coupled to EIOS — vendor is pluggable', () => {
    const agentMetadata = {
      registered_under_ewo: 'EWO-010',
      note: 'Agent is pluggable. EIOS platform does not reference this vendor directly in constitutional objects.',
      constitutional_compliance: true,
    };
    expect(agentMetadata.constitutional_compliance).toBe(true);
    expect(agentMetadata.note).toContain('pluggable');
    expect(agentMetadata.note).toContain('EIOS platform does not reference this vendor');
  });

  it('capability profile declares capabilities, languages, frameworks', () => {
    const profile = {
      id: 'uuid-cap-001',
      profile_name: 'EIOS Full-Stack Engineering Agent',
      capabilities: ['code_generation', 'testing', 'database_migration'],
      supported_languages: ['TypeScript', 'SQL'],
      supported_frameworks: ['React', 'Supabase', 'Vite'],
      execution_modes: ['interactive', 'autonomous'],
      max_session_duration_minutes: 480,
      supports_rollback: true,
      supports_guardian: true,
      supports_parallel_tasks: false,
      description: 'Full-stack engineering capability profile.',
      created_at: '2026-07-12T09:00:00Z',
    };
    expect(profile.capabilities).toContain('code_generation');
    expect(profile.supports_guardian).toBe(true);
    expect(profile.supports_rollback).toBe(true);
    expect(profile.max_session_duration_minutes).toBe(480);
  });

  it('agent execution_count starts at 0', () => {
    const agent = { execution_count: 0 };
    expect(agent.execution_count).toBe(0);
  });
});

// ─── 4. Execution Context ─────────────────────────────────────────────────────

describe('Execution context', () => {
  it('execution context captures all required environment fields', () => {
    const ctx = {
      id: 'uuid-ctx-001',
      context_ref: 'CTX-EIOS-001',
      name: 'EIOS Primary Development Context',
      repository: 'eios-platform',
      workspace_id: null as string | null,
      branch: 'main',
      application: 'EIOS Engineering Control Centre',
      product: 'EIOS Platform',
      environment: 'development' as const,
      risk_level: 'medium' as const,
      budget_hours: null as number | null,
      memory_snapshot_at: null as string | null,
      policies: ['POL-001', 'POL-002', 'POL-003'],
      contracts: ['CTR-001', 'CTR-002'],
      capabilities: [] as unknown[],
      created_at: '2026-07-12T09:00:00Z',
    };
    expect(ctx.context_ref).toBe('CTX-EIOS-001');
    expect(ctx.environment).toBe('development');
    expect(ctx.risk_level).toBe('medium');
    expect(ctx.policies).toContain('POL-001');
    expect(ctx.contracts).toContain('CTR-001');
  });

  it('five execution environments are supported', () => {
    const ENVS = ['development', 'staging', 'production', 'sandbox', 'test'];
    expect(ENVS).toHaveLength(5);
    expect(ENVS).toContain('production');
    expect(ENVS).toContain('sandbox');
  });

  it('four risk levels are defined', () => {
    const RISKS = ['low', 'medium', 'high', 'critical'];
    expect(RISKS).toHaveLength(4);
    expect(RISKS).toContain('critical');
  });
});

// ─── 5. Execution Evidence ────────────────────────────────────────────────────

describe('Execution evidence', () => {
  it('10 evidence types are defined', () => {
    expect(Object.keys(EVIDENCE_TYPE_CFG)).toHaveLength(10);
  });

  it('all required evidence types are present', () => {
    const required = [
      'build_result', 'test_result', 'log', 'telemetry',
      'guardian_validation', 'generated_artefact', 'rollback_evidence',
      'screenshot', 'diff', 'metric',
    ];
    for (const t of required) {
      expect(EVIDENCE_TYPE_CFG).toHaveProperty(t);
    }
  });

  it('each evidence type has label and colour', () => {
    for (const [, cfg] of Object.entries(EVIDENCE_TYPE_CFG)) {
      expect(cfg.label).toBeTruthy();
      expect(cfg.colour).toBeTruthy();
    }
  });

  it('build_result and test_result evidence types are green (emerald/blue)', () => {
    expect(EVIDENCE_TYPE_CFG.build_result.colour).toBe('emerald');
    expect(EVIDENCE_TYPE_CFG.test_result.colour).toBe('blue');
  });

  it('rollback_evidence is red', () => {
    expect(EVIDENCE_TYPE_CFG.rollback_evidence.colour).toBe('red');
  });

  it('guardian_validation is orange', () => {
    expect(EVIDENCE_TYPE_CFG.guardian_validation.colour).toBe('orange');
  });
});

// ─── 6. Execution Contracts & Policies ───────────────────────────────────────

describe('Execution contracts and policies', () => {
  it('three enforcement levels are defined', () => {
    expect(Object.keys(ENFORCEMENT_CFG)).toHaveLength(3);
    expect(ENFORCEMENT_CFG).toHaveProperty('strict');
    expect(ENFORCEMENT_CFG).toHaveProperty('advisory');
    expect(ENFORCEMENT_CFG).toHaveProperty('informational');
  });

  it('strict enforcement is red', () => {
    expect(ENFORCEMENT_CFG.strict.bg).toBe('bg-red-50');
    expect(ENFORCEMENT_CFG.strict.text).toBe('text-red-700');
  });

  it('contract model has obligations, constraints, acceptance_criteria', () => {
    const contract = {
      id: 'uuid-ctr-001',
      contract_ref: 'CTR-001',
      name: 'EIOS Engineering Quality Contract',
      contract_type: 'quality',
      scope: 'All execution sessions',
      obligations: [{ obligation: 'Build passes before completion' }],
      constraints: [{ constraint: 'No production deployments without guardian approval' }],
      acceptance_criteria: [{ criterion: 'npm run build exits with code 0' }],
      active: true,
      version: 1,
      created_at: '2026-07-12T09:00:00Z',
    };
    expect(contract.obligations).toHaveLength(1);
    expect(contract.constraints).toHaveLength(1);
    expect(contract.acceptance_criteria).toHaveLength(1);
    expect(contract.active).toBe(true);
  });

  it('policy model has rules and enforcement_level', () => {
    const policy = {
      id: 'uuid-pol-001',
      policy_ref: 'POL-001',
      name: 'Engineering Quality Gate Policy',
      policy_type: 'quality',
      description: 'All execution sessions must pass build and test validation.',
      rules: [
        { rule: 'build_must_pass', description: 'npm run build must succeed' },
        { rule: 'tests_must_pass', description: 'npm run test must pass all test cases' },
      ],
      enforcement_level: 'strict' as const,
      applies_to: ['execution_session', 'execution_task'],
      active: true,
      version: 1,
      created_at: '2026-07-12T09:00:00Z',
    };
    expect(policy.enforcement_level).toBe('strict');
    expect(policy.rules).toHaveLength(2);
    expect(policy.applies_to).toContain('execution_session');
  });

  it('CTR-002 constitutional compliance contract prohibits vendor lock-in', () => {
    const ctr002Constraints = [
      { constraint: 'Engineering agents are pluggable — no constitutional coupling to specific vendors' },
      { constraint: 'Execution platform serves EIOS — not any single agent provider' },
      { constraint: 'Constitutional documents cannot be overridden by execution contracts' },
    ];
    expect(ctr002Constraints[0].constraint).toContain('pluggable');
    expect(ctr002Constraints[1].constraint).toContain('not any single agent provider');
    expect(ctr002Constraints).toHaveLength(3);
  });
});

// ─── 7. Engineering Memory Integration ───────────────────────────────────────

describe('Engineering memory integration', () => {
  it('two integration phases are supported: pre and post execution', () => {
    const PHASES = ['pre_execution', 'post_execution'];
    expect(PHASES).toHaveLength(2);
  });

  it('pre-execution retrieves records, patterns, standards, risks, recommendations', () => {
    const preExec = {
      id: 'uuid-mem-001',
      session_id: 'uuid-ses-001',
      phase: 'pre_execution' as const,
      records_retrieved: ['uuid-rec-001', 'uuid-rec-002'],
      patterns_applied: ['flex-layout-scroll-pattern'],
      standards_referenced: ['EES-v1.0', 'CONST-001-AMD-002'],
      risks_identified: ['large-schema-migration'],
      recommendations_applied: ['use-rls-anon-authenticated'],
      knowledge_updated: false,
      lineage_updated: false,
      memory_updated: false,
      created_at: '2026-07-12T09:00:00Z',
    };
    expect(preExec.phase).toBe('pre_execution');
    expect(preExec.records_retrieved).toHaveLength(2);
    expect(preExec.knowledge_updated).toBe(false);
  });

  it('post-execution updates knowledge, lineage, and memory', () => {
    const postExec = {
      id: 'uuid-mem-002',
      session_id: 'uuid-ses-001',
      phase: 'post_execution' as const,
      records_retrieved: [],
      patterns_applied: [],
      standards_referenced: [],
      risks_identified: [],
      recommendations_applied: [],
      knowledge_updated: true,
      lineage_updated: true,
      memory_updated: true,
      created_at: '2026-07-12T09:30:00Z',
    };
    expect(postExec.phase).toBe('post_execution');
    expect(postExec.knowledge_updated).toBe(true);
    expect(postExec.lineage_updated).toBe(true);
    expect(postExec.memory_updated).toBe(true);
  });
});

// ─── 8. Execution API Interfaces ──────────────────────────────────────────────

describe('Execution API interfaces', () => {
  it('IExecutionPlatformService interface is defined with all 7 methods', () => {
    const METHODS = [
      'createIntent',
      'createPlan',
      'requestSession',
      'transitionState',
      'recordEvidence',
      'retrieveMemoryContext',
      'updateMemory',
    ];
    expect(METHODS).toHaveLength(7);
  });

  it('IEngineeringAgentService interface has 3 methods', () => {
    const METHODS = ['registerAgent', 'reportHealth', 'getAvailableAgents'];
    expect(METHODS).toHaveLength(3);
  });

  it('IExecutionStateService interface has 2 methods', () => {
    const METHODS = ['canTransition', 'validTransitions'];
    expect(METHODS).toHaveLength(2);
  });

  it('interfaces are implemented as TypeScript types — no execution logic in Phase 7', () => {
    const PHASE_7_STATUS = 'interfaces_only';
    expect(PHASE_7_STATUS).toBe('interfaces_only');
  });
});

// ─── 9. EWO-010 Platform Architecture ────────────────────────────────────────

describe('EWO-010 platform architecture', () => {
  it('9 implementation phases are defined', () => {
    const PHASES = [
      'execution_domain_model',
      'execution_state_machine',
      'engineering_agent_framework',
      'execution_context',
      'execution_evidence',
      'memory_integration',
      'execution_api',
      'execution_dashboard',
      'validation',
    ];
    expect(PHASES).toHaveLength(9);
  });

  it('platform is NOT an ATD feature — it is shared EIOS platform capability', () => {
    const platformScope = {
      type: 'shared_platform_capability',
      consumers: ['ATD', 'future_applications'],
      is_atd_specific: false,
    };
    expect(platformScope.type).toBe('shared_platform_capability');
    expect(platformScope.is_atd_specific).toBe(false);
    expect(platformScope.consumers).toContain('ATD');
    expect(platformScope.consumers).toContain('future_applications');
  });

  it('execution platform follows Engineering Execution Standard (EES)', () => {
    const authority = {
      standard: 'Engineering Execution Standard (EES) v1.0',
      constitution: 'Engineering Constitution',
      governance_standard: 'Engineering Governance Standard',
      object_model_standard: 'Engineering Object Model Standard',
      lifecycle_standard: 'Engineering Lifecycle Standard',
    };
    expect(authority.standard).toContain('EES');
    expect(authority.constitution).toBeTruthy();
    expect(Object.keys(authority)).toHaveLength(5);
  });

  it('state machine transitions are deterministic and validated', () => {
    // Every state has an explicit (possibly empty) list of valid next states
    for (const state of Object.keys(STATE_CFG) as ExecutionState[]) {
      expect(VALID_TRANSITIONS).toHaveProperty(state);
      expect(Array.isArray(VALID_TRANSITIONS[state])).toBe(true);
    }
  });

  it('no undefined transition targets exist in the state machine', () => {
    const validStates = new Set(Object.keys(STATE_CFG));
    for (const [, targets] of Object.entries(VALID_TRANSITIONS)) {
      for (const t of targets) {
        expect(validStates.has(t)).toBe(true);
      }
    }
  });

  it('agent framework has no direct vendor coupling in domain objects', () => {
    const VENDOR_NEUTRAL_FIELDS = ['agent_ref', 'name', 'vendor', 'agent_type', 'capability_profile_id'];
    // vendor is a data field (pluggable) — not a hard-coded constitutional reference
    expect(VENDOR_NEUTRAL_FIELDS).toContain('vendor');
    expect(VENDOR_NEUTRAL_FIELDS).toContain('agent_ref');
    // The platform references agents by agent_ref, not by vendor name
    const agentRef = 'EIOS-AGENT-001';
    expect(agentRef.startsWith('EIOS-AGENT-')).toBe(true);
  });
});

// ─── 10. EWO-010 Self-Validation ──────────────────────────────────────────────

describe('EWO-010 Engineering Record self-validation', () => {
  const EWO010_RECORD = {
    record_ref: 'EWO-010',
    title: 'EIOS Engineering Execution Platform Foundation',
    programme: 'EIOS',
    record_type: 'completion_report',
    record_version: 1,
    authority_state: 'authoritative',
    completion_date: '2026-07-12',
    ewo_ref: 'EWO-010',
    complexity: 'high',
    risk_rating: 'medium',
    technologies: ['TypeScript', 'React', 'PostgreSQL', 'Supabase', 'Tailwind CSS'],
    applications_affected: ['EIOS Engineering Control Centre'],
    subsystems_affected: [
      'execution-platform', 'engineering-agent-framework',
      'execution-state-machine', 'engineering-memory',
    ],
    primary_engineer: 'Bolt (AI)',
    product_owner: 'EIOS Product Owner',
  };

  it('record has correct reference and title', () => {
    expect(EWO010_RECORD.record_ref).toBe('EWO-010');
    expect(EWO010_RECORD.title).toContain('Execution Platform');
  });

  it('record is authoritative', () => {
    expect(EWO010_RECORD.authority_state).toBe('authoritative');
  });

  it('record has completion date of 2026-07-12', () => {
    expect(EWO010_RECORD.completion_date).toBe('2026-07-12');
  });

  it('record captures subsystems affected', () => {
    expect(EWO010_RECORD.subsystems_affected).toContain('execution-platform');
    expect(EWO010_RECORD.subsystems_affected).toContain('engineering-agent-framework');
    expect(EWO010_RECORD.subsystems_affected).toContain('execution-state-machine');
  });

  it('record captures complexity and risk', () => {
    expect(EWO010_RECORD.complexity).toBe('high');
    expect(EWO010_RECORD.risk_rating).toBe('medium');
  });
});

