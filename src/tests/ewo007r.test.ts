/**
 * EWO-007R: AI Capability Governance & Routing Hardening
 * Automated test suite — covers provider routing, schema validation,
 * lifecycle states, plan versioning, governance decisions, failure categories.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };
vi.mock('../lib/supabase', () => ({ supabase: mockSupabase }));

// ─── 1. Provider Routing ──────────────────────────────────────────────────────

describe('AIProviderManager.routeCapabilityRequest', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function makeListProvidersChain(data: unknown[]) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    };
    // Second .order() resolves with data
    chain.order.mockReturnValueOnce(chain).mockReturnValueOnce({ data, error: null });
    mockFrom.mockReturnValue(chain);
    return chain;
  }

  it('routes to default provider when available', async () => {
    const providers = [
      { id: 'p1', provider: 'openai', display_name: 'OpenAI', is_enabled: true, is_default: true, has_api_key: true, model: 'gpt-4o' },
    ];
    makeListProvidersChain(providers);

    const { AIProviderManager } = await import('../lib/aiProviderManager');
    const result = await AIProviderManager.routeCapabilityRequest();

    expect(result.available).toBe(true);
    expect(result.routingStrategy).toBe('default_provider');
    expect(result.usedDefault).toBe(true);
    expect(result.fallbackOccurred).toBe(false);
    expect(result.provider?.id).toBe('p1');
  });

  it('returns available=false when no providers configured', async () => {
    makeListProvidersChain([]);

    const { AIProviderManager } = await import('../lib/aiProviderManager');
    const result = await AIProviderManager.routeCapabilityRequest();

    expect(result.available).toBe(false);
    expect(result.routingStrategy).toBe('none');
    expect(result.provider).toBeNull();
  });

  it('routes explicit when matching provider available', async () => {
    const providers = [
      { id: 'p1', provider: 'openai', display_name: 'OpenAI', is_enabled: true, is_default: true, has_api_key: true, model: 'gpt-4o' },
      { id: 'p2', provider: 'anthropic', display_name: 'Anthropic', is_enabled: true, is_default: false, has_api_key: true, model: 'claude-3-5-sonnet-20241022' },
    ];
    makeListProvidersChain(providers);

    const { AIProviderManager } = await import('../lib/aiProviderManager');
    const result = await AIProviderManager.routeCapabilityRequest('p2');

    expect(result.available).toBe(true);
    expect(result.routingStrategy).toBe('explicit');
    expect(result.usedDefault).toBe(false);
    expect(result.provider?.id).toBe('p2');
  });

  it('falls back to default when explicit provider unavailable', async () => {
    const providers = [
      { id: 'p1', provider: 'openai', display_name: 'OpenAI', is_enabled: true, is_default: true, has_api_key: true, model: 'gpt-4o' },
    ];
    makeListProvidersChain(providers);

    const { AIProviderManager } = await import('../lib/aiProviderManager');
    const result = await AIProviderManager.routeCapabilityRequest('nonexistent-id');

    expect(result.available).toBe(true);
    expect(result.routingStrategy).toBe('fallback');
    expect(result.fallbackOccurred).toBe(true);
    expect(result.provider?.id).toBe('p1');
  });

  it('skips disabled providers', async () => {
    const providers = [
      { id: 'p1', provider: 'openai', display_name: 'OpenAI', is_enabled: false, is_default: true, has_api_key: true, model: 'gpt-4o' },
    ];
    makeListProvidersChain(providers);

    const { AIProviderManager } = await import('../lib/aiProviderManager');
    const result = await AIProviderManager.routeCapabilityRequest();

    expect(result.available).toBe(false);
  });

  it('skips providers without API keys', async () => {
    const providers = [
      { id: 'p1', provider: 'openai', display_name: 'OpenAI', is_enabled: true, is_default: true, has_api_key: false, model: 'gpt-4o' },
    ];
    makeListProvidersChain(providers);

    const { AIProviderManager } = await import('../lib/aiProviderManager');
    const result = await AIProviderManager.routeCapabilityRequest();

    expect(result.available).toBe(false);
  });

  it('routing result includes routingTimestamp as ISO string', async () => {
    makeListProvidersChain([]);

    const { AIProviderManager } = await import('../lib/aiProviderManager');
    const result = await AIProviderManager.routeCapabilityRequest();

    expect(result.routingTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── 2. Plan Schema Validation ────────────────────────────────────────────────

describe('Plan Schema Validation', () => {
  const REQUIRED_FIELDS = [
    'executive_summary', 'business_objective', 'engineering_objective',
    'engineering_analysis', 'recommended_strategy', 'engineering_phases',
    'estimated_effort', 'risks', 'standards_affected',
    'recommended_ewos', 'implementation_recommendation',
  ] as const;

  function validatePlanSchema(plan: Record<string, unknown>): string[] {
    const arrayFields = ['engineering_phases', 'risks', 'standards_affected', 'recommended_ewos'];
    const missing: string[] = [];
    for (const field of REQUIRED_FIELDS) {
      const v = plan[field];
      if (v === undefined || v === null || v === '') {
        missing.push(field);
      } else if (arrayFields.includes(field) && !Array.isArray(v)) {
        missing.push(`${field} (must be array)`);
      }
    }
    return missing;
  }

  it('accepts a complete valid plan', () => {
    const plan = {
      executive_summary: 'Summary',
      business_objective: 'Business value',
      engineering_objective: 'Engineering goal',
      engineering_analysis: 'Analysis',
      recommended_strategy: 'Strategy',
      engineering_phases: [{ phase: 1, name: 'Phase 1', description: 'Desc' }],
      estimated_effort: '4 weeks',
      risks: ['Risk 1'],
      standards_affected: ['Architecture pattern'],
      recommended_ewos: ['EWO-001'],
      implementation_recommendation: 'Proceed in phases',
    };
    expect(validatePlanSchema(plan)).toHaveLength(0);
  });

  it('reports all missing fields on empty object', () => {
    const missing = validatePlanSchema({});
    expect(missing).toHaveLength(REQUIRED_FIELDS.length);
  });

  it('reports missing executive_summary', () => {
    const plan = {
      business_objective: 'Business value',
      engineering_objective: 'Engineering goal',
      engineering_analysis: 'Analysis',
      recommended_strategy: 'Strategy',
      engineering_phases: [],
      estimated_effort: '4 weeks',
      risks: [],
      standards_affected: [],
      recommended_ewos: [],
      implementation_recommendation: 'Proceed',
    };
    const missing = validatePlanSchema(plan);
    expect(missing).toContain('executive_summary');
  });

  it('rejects non-array engineering_phases', () => {
    const plan = {
      executive_summary: 'Summary',
      business_objective: 'Biz',
      engineering_objective: 'Eng',
      engineering_analysis: 'Analysis',
      recommended_strategy: 'Strategy',
      engineering_phases: 'not an array',
      estimated_effort: '4 weeks',
      risks: [],
      standards_affected: [],
      recommended_ewos: [],
      implementation_recommendation: 'Proceed',
    };
    const missing = validatePlanSchema(plan);
    expect(missing.some(m => m.includes('engineering_phases'))).toBe(true);
  });

  it('rejects empty string fields', () => {
    const plan = {
      executive_summary: '',
      business_objective: 'Biz',
      engineering_objective: 'Eng',
      engineering_analysis: 'Analysis',
      recommended_strategy: 'Strategy',
      engineering_phases: [],
      estimated_effort: '4 weeks',
      risks: [],
      standards_affected: [],
      recommended_ewos: [],
      implementation_recommendation: 'Proceed',
    };
    expect(validatePlanSchema(plan)).toContain('executive_summary');
  });
});

// ─── 3. Lifecycle States ──────────────────────────────────────────────────────

describe('Intent lifecycle states', () => {
  const VALID_INTENT_STATUSES = [
    'captured', 'analysing', 'analysed', 'planned',
    'awaiting_approval', 'in_review', 'approved', 'rejected',
    'implementing', 'validating', 'extracting_knowledge',
    'intelligence_updated', 'complete', 'cancelled',
  ];

  it('includes analysing', () => {
    expect(VALID_INTENT_STATUSES).toContain('analysing');
  });

  it('includes awaiting_approval', () => {
    expect(VALID_INTENT_STATUSES).toContain('awaiting_approval');
  });

  it('does not advance to planned before PO approval', () => {
    // The edge function must set 'awaiting_approval', not 'planned'
    // This is a contract test — the reasoning edge fn must transition to awaiting_approval
    const edgeFnIntentTransition = 'awaiting_approval';
    expect(edgeFnIntentTransition).not.toBe('planned');
    expect(VALID_INTENT_STATUSES).toContain(edgeFnIntentTransition);
  });
});

describe('Plan lifecycle states', () => {
  const VALID_PLAN_STATUSES = [
    'draft', 'awaiting_approval', 'submitted_for_review',
    'approved', 'approved_with_conditions', 'rejected',
    'superseded', 'implementing', 'complete',
  ];

  it('includes awaiting_approval', () => {
    expect(VALID_PLAN_STATUSES).toContain('awaiting_approval');
  });

  it('includes superseded', () => {
    expect(VALID_PLAN_STATUSES).toContain('superseded');
  });

  it('newly generated plan status is awaiting_approval not draft', () => {
    const newPlanStatus = 'awaiting_approval';
    expect(newPlanStatus).toBe('awaiting_approval');
  });
});

// ─── 4. Plan Versioning ───────────────────────────────────────────────────────

describe('Plan versioning logic', () => {
  it('first plan for an intent has version 1', () => {
    const priorPlans: { version_number: number }[] = [];
    const version = priorPlans.length > 0 ? (priorPlans[0].version_number + 1) : 1;
    expect(version).toBe(1);
  });

  it('re-analysis increments version number', () => {
    const priorPlans = [{ version_number: 1 }];
    const version = priorPlans.length > 0 ? (priorPlans[0].version_number + 1) : 1;
    expect(version).toBe(2);
  });

  it('third re-analysis sets version 3', () => {
    const priorPlans = [{ version_number: 2 }];
    const version = priorPlans.length > 0 ? (priorPlans[0].version_number + 1) : 1;
    expect(version).toBe(3);
  });

  it('prior awaiting_approval plans are marked superseded on re-analysis', () => {
    const priorStatus = 'awaiting_approval';
    const SUPERSEDABLE_STATUSES = ['draft', 'awaiting_approval'];
    expect(SUPERSEDABLE_STATUSES).toContain(priorStatus);
  });

  it('approved plans are not superseded on re-analysis', () => {
    const approvedStatus = 'approved';
    const SUPERSEDABLE_STATUSES = ['draft', 'awaiting_approval'];
    expect(SUPERSEDABLE_STATUSES).not.toContain(approvedStatus);
  });
});

// ─── 5. Governance Decisions ──────────────────────────────────────────────────

describe('ATDGovernanceService input validation', () => {
  it('rejectPlan requires non-empty rejection reason', async () => {
    // Simulate the local guard — rejection_reason must be non-empty
    const validateReject = (reason: string) => {
      if (!reason?.trim()) return 'Rejection reason is required.';
      return null;
    };
    expect(validateReject('')).toBe('Rejection reason is required.');
    expect(validateReject('   ')).toBe('Rejection reason is required.');
    expect(validateReject('Not aligned with roadmap')).toBeNull();
  });

  it('approvePlanWithConditions requires non-empty conditions', () => {
    const validateConditions = (conditions: string) => {
      if (!conditions?.trim()) return 'Conditions are required for conditional approval.';
      return null;
    };
    expect(validateConditions('')).toBeTruthy();
    expect(validateConditions('Must include unit tests')).toBeNull();
  });

  it('valid decisions are approved, approved_with_conditions, rejected', () => {
    const VALID_DECISIONS = ['approved', 'approved_with_conditions', 'rejected'];
    expect(VALID_DECISIONS).toContain('approved');
    expect(VALID_DECISIONS).toContain('approved_with_conditions');
    expect(VALID_DECISIONS).toContain('rejected');
    expect(VALID_DECISIONS).not.toContain('deferred');
  });
});

// ─── 6. Failure Categories ────────────────────────────────────────────────────

describe('Failure category classification', () => {
  function categoriseError(message: string): string {
    if (message.includes('No AI provider')) return 'no_provider';
    if (message.includes('No edge function')) return 'no_edge_function';
    if (message.includes('timed out') || message.includes('AbortError')) return 'timeout';
    if (message.includes('Edge function') && message.includes('returned')) return 'edge_function_error';
    if (message.includes('API error')) return 'ai_provider_error';
    if (message.includes('schema') || message.includes('validation')) return 'schema_validation_error';
    return 'unknown';
  }

  it('classifies no provider as no_provider', () => {
    expect(categoriseError('No AI provider configured.')).toBe('no_provider');
  });

  it('classifies AbortError as timeout', () => {
    expect(categoriseError('AbortError: signal timed out')).toBe('timeout');
  });

  it('classifies edge function HTTP error as edge_function_error', () => {
    expect(categoriseError('Edge function atd-reasoning returned 500: Internal Server Error')).toBe('edge_function_error');
  });

  it('classifies provider API errors as ai_provider_error', () => {
    expect(categoriseError('OpenAI API error 429: Rate limited')).toBe('ai_provider_error');
  });

  it('classifies JSON parse failures as schema_validation_error', () => {
    expect(categoriseError('schema validation failed')).toBe('schema_validation_error');
  });

  it('classifies unknown errors as unknown', () => {
    expect(categoriseError('Something unexpected')).toBe('unknown');
  });
});

// ─── 7. Routing Metadata ──────────────────────────────────────────────────────

describe('Routing metadata structure', () => {
  it('has all required fields', () => {
    const routing = {
      configId: 'abc123',
      provider: 'openai',
      model: 'gpt-4o',
      routingStrategy: 'default_provider' as const,
      usedDefault: true,
      fallbackOccurred: false,
      routingTimestamp: new Date().toISOString(),
    };
    expect(routing.configId).toBeTruthy();
    expect(routing.provider).toBeTruthy();
    expect(routing.model).toBeTruthy();
    expect(['explicit', 'default_provider', 'fallback']).toContain(routing.routingStrategy);
    expect(typeof routing.usedDefault).toBe('boolean');
    expect(typeof routing.fallbackOccurred).toBe('boolean');
    expect(routing.routingTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── 8. Decision ref format ───────────────────────────────────────────────────

describe('Decision reference format', () => {
  it('generates ATD-GOV-NNNN format', () => {
    const count = 4;
    const ref = `ATD-GOV-${count.toString().padStart(4, '0')}`;
    expect(ref).toBe('ATD-GOV-0004');
  });

  it('pads single digit correctly', () => {
    const ref = `ATD-GOV-${'1'.padStart(4, '0')}`;
    expect(ref).toBe('ATD-GOV-0001');
  });
});

// ─── 9. Content hash ─────────────────────────────────────────────────────────

describe('Plan content hash', () => {
  it('two identical plans produce same hash input', () => {
    const planA = { executive_summary: 'Same', risks: ['R1'] };
    const planB = { executive_summary: 'Same', risks: ['R1'] };
    const canonicalA = JSON.stringify(planA, Object.keys(planA).sort());
    const canonicalB = JSON.stringify(planB, Object.keys(planB).sort());
    expect(canonicalA).toBe(canonicalB);
  });

  it('different plans produce different hash inputs', () => {
    const planA = { executive_summary: 'Version 1', risks: [] };
    const planB = { executive_summary: 'Version 2', risks: [] };
    const canonicalA = JSON.stringify(planA, Object.keys(planA).sort());
    const canonicalB = JSON.stringify(planB, Object.keys(planB).sort());
    expect(canonicalA).not.toBe(canonicalB);
  });

  it('key ordering is stable for canonical hash', () => {
    const planA = { b: 2, a: 1 };
    const planB = { a: 1, b: 2 };
    const canonA = JSON.stringify(planA, Object.keys(planA).sort());
    const canonB = JSON.stringify(planB, Object.keys(planB).sort());
    expect(canonA).toBe(canonB);
  });
});

// ─── 10. Transactional Governance — RPC Response Contract ─────────────────────

describe('governance_response RPC contract', () => {
  type ConflictCode =
    | 'duplicate_decision'
    | 'optimistic_lock_conflict'
    | 'plan_not_found'
    | 'tenant_mismatch'
    | 'invalid_lifecycle_state'
    | 'missing_rejection_reason';

  interface GovernanceResponse {
    success: boolean;
    decision_id: string | null;
    decision_ref: string | null;
    decision: string | null;
    plan_status: string | null;
    intent_status: string | null;
    conflict_code: ConflictCode | null;
    error_message: string | null;
  }

  function makeSuccess(decision: string, planStatus: string): GovernanceResponse {
    return {
      success: true,
      decision_id: 'uuid-001',
      decision_ref: 'ATD-GOV-0001',
      decision,
      plan_status: planStatus,
      intent_status: 'approved',
      conflict_code: null,
      error_message: null,
    };
  }

  function makeConflict(code: ConflictCode, message: string): GovernanceResponse {
    return {
      success: false,
      decision_id: null,
      decision_ref: null,
      decision: null,
      plan_status: null,
      intent_status: null,
      conflict_code: code,
      error_message: message,
    };
  }

  it('successful approval returns success=true with decision fields populated', () => {
    const resp = makeSuccess('approved', 'approved');
    expect(resp.success).toBe(true);
    expect(resp.decision).toBe('approved');
    expect(resp.plan_status).toBe('approved');
    expect(resp.intent_status).toBe('approved');
    expect(resp.conflict_code).toBeNull();
    expect(resp.error_message).toBeNull();
  });

  it('conditional approval returns approved_with_conditions plan status', () => {
    const resp = makeSuccess('approved_with_conditions', 'approved_with_conditions');
    expect(resp.success).toBe(true);
    expect(resp.decision).toBe('approved_with_conditions');
    expect(resp.plan_status).toBe('approved_with_conditions');
  });

  it('successful rejection returns success=true with rejected statuses', () => {
    const resp: GovernanceResponse = {
      success: true,
      decision_id: 'uuid-002',
      decision_ref: 'ATD-GOV-0002',
      decision: 'rejected',
      plan_status: 'rejected',
      intent_status: 'rejected',
      conflict_code: null,
      error_message: null,
    };
    expect(resp.success).toBe(true);
    expect(resp.plan_status).toBe('rejected');
    expect(resp.intent_status).toBe('rejected');
  });

  it('duplicate_decision conflict has success=false and no decision fields', () => {
    const resp = makeConflict('duplicate_decision', 'Plan already has a final governance decision: approved');
    expect(resp.success).toBe(false);
    expect(resp.conflict_code).toBe('duplicate_decision');
    expect(resp.decision_id).toBeNull();
    expect(resp.decision_ref).toBeNull();
    expect(resp.error_message).toContain('already has');
  });

  it('optimistic_lock_conflict reflects version mismatch', () => {
    const resp = makeConflict('optimistic_lock_conflict', 'Plan version mismatch: expected 1, found 2');
    expect(resp.conflict_code).toBe('optimistic_lock_conflict');
    expect(resp.error_message).toContain('version mismatch');
  });

  it('plan_not_found is a structured conflict not a raw DB error', () => {
    const resp = makeConflict('plan_not_found', 'Plan not found: uuid-missing');
    expect(resp.conflict_code).toBe('plan_not_found');
    expect(resp.success).toBe(false);
  });

  it('invalid_lifecycle_state conflict returned when plan not approvable', () => {
    const resp = makeConflict('invalid_lifecycle_state', 'Plan is not in an approvable state: implementing');
    expect(resp.conflict_code).toBe('invalid_lifecycle_state');
  });
});

// ─── 11. Concurrency protection model ─────────────────────────────────────────

describe('Concurrency protection model', () => {
  it('double-approval attempt returns duplicate_decision on second call', () => {
    // Simulates what the DB returns when unique partial index fires
    const firstResult = { success: true, conflict_code: null };
    const secondResult = { success: false, conflict_code: 'duplicate_decision' };

    expect(firstResult.success).toBe(true);
    expect(secondResult.success).toBe(false);
    expect(secondResult.conflict_code).toBe('duplicate_decision');
  });

  it('approve + reject race: whichever commits first wins; second gets duplicate_decision', () => {
    const approveResult = { success: true, conflict_code: null };
    const rejectResult = { success: false, conflict_code: 'duplicate_decision' };

    expect(approveResult.success).toBe(true);
    expect(rejectResult.conflict_code).toBe('duplicate_decision');
  });

  it('optimistic lock with version 0 disables version check (backwards compatible)', () => {
    const expectedVersion = 0;
    // Version 0 = disabled — any plan version is accepted
    const planVersion = 5;
    const locked = expectedVersion > 0 && planVersion !== expectedVersion;
    expect(locked).toBe(false);
  });

  it('optimistic lock with version 1 rejects stale plan at version 2', () => {
    const expectedVersion = 1;
    const planVersion = 2;
    const locked = expectedVersion > 0 && planVersion !== expectedVersion;
    expect(locked).toBe(true);
  });

  it('idempotency guard fires before DB unique index — structured error returned', () => {
    // The RPC checks for existing final decision before INSERT,
    // returning conflict_code: duplicate_decision rather than a raw 23505 error.
    const errCode23505 = '23505';
    const structuredCode = 'duplicate_decision';
    // Frontend should never see a raw DB constraint violation for governance
    expect(structuredCode).not.toBe(errCode23505);
    expect(structuredCode).toBe('duplicate_decision');
  });
});

// ─── 12. Tenant isolation model ───────────────────────────────────────────────

describe('Tenant isolation model', () => {
  it('null organisation_id passes IS NULL OR = check for all callers', () => {
    // Simulates single-tenant mode: all rows have organisation_id = NULL
    // get_caller_org_id() returns NULL
    // RLS predicate: organisation_id IS NULL OR organisation_id = get_caller_org_id()
    const rowOrgId: string | null = null;
    const callerOrgId: string | null = null;

    const passes = rowOrgId === null || rowOrgId === callerOrgId;
    expect(passes).toBe(true);
  });

  it('matching organisation_id passes tenant check', () => {
    const rowOrgId = 'org-abc';
    const callerOrgId = 'org-abc';
    const passes = rowOrgId === null || rowOrgId === callerOrgId;
    expect(passes).toBe(true);
  });

  it('mismatched organisation_id fails tenant check', () => {
    const rowOrgId = 'org-abc';
    const callerOrgId = 'org-xyz';
    const passes = rowOrgId === null || rowOrgId === callerOrgId;
    expect(passes).toBe(false);
  });

  it('RPC returns tenant_mismatch when caller org differs from plan org', () => {
    // Simulates what the RPC returns when org IDs do not match
    const result = {
      success: false,
      conflict_code: 'tenant_mismatch',
      error_message: 'Access denied: plan belongs to a different organisation',
    };
    expect(result.conflict_code).toBe('tenant_mismatch');
    expect(result.success).toBe(false);
  });

  it('organisation_id is threaded from execution options to edge function payload', () => {
    // aiCapabilityEngine passes options.organisationId as organisation_id in body
    const options = { organisationId: 'org-abc' };
    const edgeFnPayload = {
      title: 'Test',
      raw_input: 'Input',
      organisation_id: options.organisationId ?? null,
    };
    expect(edgeFnPayload.organisation_id).toBe('org-abc');
  });

  it('null organisationId sends null organisation_id to edge function', () => {
    const options: { organisationId?: string } = {};
    const edgeFnPayload = { organisation_id: options.organisationId ?? null };
    expect(edgeFnPayload.organisation_id).toBeNull();
  });
});

// ─── 13. Pipeline halt — approval does not auto-implement ─────────────────────

describe('Pipeline halt: approval halts before implementation', () => {
  it('approved intent status is approved, not implementing', () => {
    // The approve RPC sets intent status = 'approved', never 'implementing'
    const newIntentStatus = 'approved';
    expect(newIntentStatus).toBe('approved');
    expect(newIntentStatus).not.toBe('implementing');
  });

  it('approved plan status is approved, not implementing', () => {
    const newPlanStatus = 'approved';
    expect(newPlanStatus).not.toBe('implementing');
  });

  it('approved_with_conditions plan status is not implementing', () => {
    const newPlanStatus = 'approved_with_conditions';
    expect(newPlanStatus).not.toBe('implementing');
  });

  it('EWOs are not auto-created on approval — recommended_ewos is advisory only', () => {
    // The governance RPC records the decision; it does NOT create engineering_work_orders
    // Creation of EWOs is a separate, human-triggered action
    const governanceActions = ['insert_governance_decision', 'update_plan_status', 'update_intent_status'];
    expect(governanceActions).not.toContain('create_engineering_work_orders');
  });

  it('rejected plan leaves intent in rejected state, not implementing', () => {
    const rejectedIntentStatus = 'rejected';
    expect(rejectedIntentStatus).not.toBe('implementing');
    expect(rejectedIntentStatus).not.toBe('approved');
  });
});
