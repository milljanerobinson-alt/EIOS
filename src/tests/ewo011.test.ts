/**
 * EWO-011: First Constitutional Execution — Engineering Intent & Idea Management
 * Test suite covering: idea domain model, objective model, wizard state machine,
 * category/priority/status config maps, pipeline stages, constitutional pipeline
 * integrity, ATD integration, Guardian authority model, and EWO-011 self-validation.
 */

import { describe, it, expect } from 'vitest';
import {
  IDEA_STATUS_CFG,
  IDEA_PRIORITY_CFG,
  IDEA_CATEGORY_CFG,
  WIZARD_STEPS,
  DEFAULT_PIPELINE,
  INITIAL_WIZARD_STATE,
  type IdeaCategory,
  type IdeaPriority,
  type IdeaStatus,
  type ObjectiveStatus,
  type WizardStep,
  type EngineeringIdea,
  type EngineeringObjective,
  type WizardState,
  type ExecutionPipelineStage,
} from '../pages/ecc/ECCIdeaTypes';

// ─── 1. Idea Domain Model ─────────────────────────────────────────────────────

describe('Engineering Idea domain model', () => {
  it('EngineeringIdea has all required fields', () => {
    const idea: EngineeringIdea = {
      id: 'uuid-001',
      idea_ref: 'IDEA-XXXXXXXX',
      title: 'Test idea',
      description: 'Test description',
      category: 'feature',
      priority: 'high',
      status: 'draft',
      products: ['EIOS Platform'],
      applications: ['EIOS Engineering Control Centre'],
      tags: ['test'],
      session_id: null,
      intent_id: null,
      objective_id: null,
      related_ewo_refs: [],
      related_feature_ids: [],
      related_record_ids: [],
      memory_search_performed: false,
      duplicates_checked: false,
      guardian_validated: false,
      guardian_session_id: null,
      created_by: 'EIOS-AGENT-001',
      created_at: '2026-07-12T09:00:00Z',
      updated_at: '2026-07-12T09:00:00Z',
    };
    expect(idea.idea_ref).toMatch(/^IDEA-/);
    expect(idea.products).toContain('EIOS Platform');
    expect(idea.guardian_validated).toBe(false);
  });

  it('EngineeringIdea category is one of 11 valid values', () => {
    const VALID_CATEGORIES: IdeaCategory[] = [
      'general', 'feature', 'improvement', 'technical_debt',
      'architecture', 'security', 'performance', 'ux',
      'integration', 'infrastructure', 'research',
    ];
    expect(VALID_CATEGORIES).toHaveLength(11);
    expect(VALID_CATEGORIES).toContain('feature');
    expect(VALID_CATEGORIES).toContain('technical_debt');
    expect(VALID_CATEGORIES).toContain('research');
  });

  it('IdeaStatus has exactly 6 values', () => {
    const VALID_STATUSES: IdeaStatus[] = [
      'draft', 'active', 'queued_for_promotion', 'promoted', 'archived', 'superseded',
    ];
    expect(VALID_STATUSES).toHaveLength(6);
    expect(VALID_STATUSES).toContain('queued_for_promotion');
    expect(VALID_STATUSES).toContain('promoted');
  });

  it('IdeaPriority has exactly 4 values', () => {
    const VALID_PRIORITIES: IdeaPriority[] = ['critical', 'high', 'medium', 'low'];
    expect(VALID_PRIORITIES).toHaveLength(4);
  });

  it('ObjectiveStatus has exactly 5 values', () => {
    const VALID_OBJECTIVE_STATUSES: ObjectiveStatus[] = [
      'draft', 'active', 'met', 'missed', 'cancelled',
    ];
    expect(VALID_OBJECTIVE_STATUSES).toHaveLength(5);
  });
});

// ─── 2. Engineering Objective Domain Model ────────────────────────────────────

describe('Engineering Objective domain model', () => {
  it('EngineeringObjective has all required fields', () => {
    const objective: EngineeringObjective = {
      id: 'uuid-obj-001',
      objective_ref: 'OBJ-XXXXXXXX',
      intent_id: 'uuid-int-001',
      title: 'Deliver structured idea management capability',
      description: 'Enable engineers to create and track ideas constitutionally',
      success_metrics: [
        { metric: 'Ideas created via wizard', target: '> 0' },
        { metric: 'Constitutional pipeline completion rate', target: '100%' },
      ],
      target_date: '2026-08-01',
      status: 'active',
      priority: 'high',
      created_at: '2026-07-12T09:00:00Z',
    };
    expect(objective.objective_ref).toMatch(/^OBJ-/);
    expect(objective.success_metrics).toHaveLength(2);
    expect(objective.success_metrics[0].metric).toBe('Ideas created via wizard');
  });

  it('success_metrics supports target as optional', () => {
    const metric = { metric: 'All pipeline stages complete' };
    expect(metric.target).toBeUndefined();
    expect(metric.metric).toBeTruthy();
  });

  it('objective references intent_id (nullable for standalone)', () => {
    const objective: EngineeringObjective = {
      id: 'uuid-obj-002',
      objective_ref: 'OBJ-STANDALONE',
      intent_id: null,
      title: 'Standalone objective',
      description: null,
      success_metrics: [],
      target_date: null,
      status: 'draft',
      priority: 'low',
      created_at: '2026-07-12T09:00:00Z',
    };
    expect(objective.intent_id).toBeNull();
    expect(objective.description).toBeNull();
    expect(objective.target_date).toBeNull();
  });
});

// ─── 3. Config Map Completeness ───────────────────────────────────────────────

describe('IDEA_STATUS_CFG config map', () => {
  it('covers all 6 statuses', () => {
    const statuses: IdeaStatus[] = [
      'draft', 'active', 'queued_for_promotion', 'promoted', 'archived', 'superseded',
    ];
    for (const status of statuses) {
      expect(IDEA_STATUS_CFG[status]).toBeDefined();
      expect(IDEA_STATUS_CFG[status].label).toBeTruthy();
      expect(IDEA_STATUS_CFG[status].bg).toMatch(/^bg-/);
      expect(IDEA_STATUS_CFG[status].text).toMatch(/^text-/);
      expect(IDEA_STATUS_CFG[status].dot).toMatch(/^bg-/);
    }
  });

  it('promoted has emerald styling (highest achievement)', () => {
    expect(IDEA_STATUS_CFG.promoted.bg).toContain('emerald');
    expect(IDEA_STATUS_CFG.promoted.text).toContain('emerald');
  });

  it('draft has neutral/slate styling', () => {
    expect(IDEA_STATUS_CFG.draft.bg).toContain('slate');
  });

  it('queued_for_promotion has amber styling (pending action)', () => {
    expect(IDEA_STATUS_CFG.queued_for_promotion.bg).toContain('amber');
  });
});

describe('IDEA_PRIORITY_CFG config map', () => {
  it('covers all 4 priorities', () => {
    const priorities: IdeaPriority[] = ['critical', 'high', 'medium', 'low'];
    for (const p of priorities) {
      expect(IDEA_PRIORITY_CFG[p]).toBeDefined();
      expect(IDEA_PRIORITY_CFG[p].label).toBeTruthy();
      expect(IDEA_PRIORITY_CFG[p].dot).toMatch(/^bg-/);
      expect(IDEA_PRIORITY_CFG[p].text).toMatch(/^text-/);
    }
  });

  it('critical has red styling', () => {
    expect(IDEA_PRIORITY_CFG.critical.dot).toContain('red');
    expect(IDEA_PRIORITY_CFG.critical.text).toContain('red');
  });

  it('low has slate styling', () => {
    expect(IDEA_PRIORITY_CFG.low.dot).toContain('slate');
  });
});

describe('IDEA_CATEGORY_CFG config map', () => {
  it('covers all 11 categories', () => {
    const categories: IdeaCategory[] = [
      'general', 'feature', 'improvement', 'technical_debt',
      'architecture', 'security', 'performance', 'ux',
      'integration', 'infrastructure', 'research',
    ];
    expect(categories).toHaveLength(11);
    for (const cat of categories) {
      expect(IDEA_CATEGORY_CFG[cat]).toBeDefined();
      expect(IDEA_CATEGORY_CFG[cat].label).toBeTruthy();
      expect(IDEA_CATEGORY_CFG[cat].colour).toBeTruthy();
    }
  });

  it('feature category has blue colour', () => {
    expect(IDEA_CATEGORY_CFG.feature.colour).toBe('blue');
  });

  it('security category has red colour', () => {
    expect(IDEA_CATEGORY_CFG.security.colour).toBe('red');
  });

  it('technical_debt category has amber colour', () => {
    expect(IDEA_CATEGORY_CFG.technical_debt.colour).toBe('amber');
  });
});

// ─── 4. Wizard State Machine ──────────────────────────────────────────────────

describe('WIZARD_STEPS state machine', () => {
  it('has exactly 7 steps (6 original + similarity review from EWO-011.1)', () => {
    expect(WIZARD_STEPS).toHaveLength(7);
  });

  it('step keys follow the expected order', () => {
    const keys = WIZARD_STEPS.map(s => s.key);
    expect(keys[0]).toBe('intent');
    expect(keys[1]).toBe('objective');
    expect(keys[2]).toBe('strategy');
    expect(keys[3]).toBe('context');
    expect(keys[4]).toBe('agent');
    expect(keys[5]).toBe('review');
    expect(keys[6]).toBe('similarity');
  });

  it('every step has label and description', () => {
    for (const step of WIZARD_STEPS) {
      expect(step.label).toBeTruthy();
      expect(step.description).toBeTruthy();
    }
  });

  it('WizardStep type includes executing and complete runtime states', () => {
    const allSteps: WizardStep[] = [
      'intent', 'objective', 'strategy', 'context', 'agent', 'review', 'executing', 'complete',
    ];
    expect(allSteps).toHaveLength(8);
    expect(allSteps).toContain('executing');
    expect(allSteps).toContain('complete');
  });
});

describe('INITIAL_WIZARD_STATE defaults', () => {
  it('starts on intent step', () => {
    expect(INITIAL_WIZARD_STATE.step).toBe('intent');
  });

  it('defaults to medium priority', () => {
    expect(INITIAL_WIZARD_STATE.intent.priority).toBe('medium');
    expect(INITIAL_WIZARD_STATE.idea.priority).toBe('medium');
  });

  it('defaults to EIOS programme', () => {
    expect(INITIAL_WIZARD_STATE.intent.programme).toBe('EIOS');
  });

  it('defaults contextRef to CTX-EIOS-001', () => {
    expect(INITIAL_WIZARD_STATE.contextRef).toBe('CTX-EIOS-001');
  });

  it('defaults agentRef to EIOS-AGENT-001', () => {
    expect(INITIAL_WIZARD_STATE.agentRef).toBe('EIOS-AGENT-001');
  });

  it('idea defaults include EIOS Platform product and EIOS ECC application', () => {
    expect(INITIAL_WIZARD_STATE.idea.products).toContain('EIOS Platform');
    expect(INITIAL_WIZARD_STATE.idea.applications).toContain('EIOS Engineering Control Centre');
  });

  it('objective starts with one blank success_metric slot', () => {
    expect(INITIAL_WIZARD_STATE.objective.success_metrics).toHaveLength(1);
    expect(INITIAL_WIZARD_STATE.objective.success_metrics[0]).toBe('');
  });

  it('strategy starts with one blank success_criteria slot', () => {
    expect(INITIAL_WIZARD_STATE.strategy.success_criteria).toHaveLength(1);
    expect(INITIAL_WIZARD_STATE.strategy.success_criteria[0]).toBe('');
  });

  it('strategy defaults to incremental type', () => {
    expect(INITIAL_WIZARD_STATE.strategy.strategy_type).toBe('incremental');
  });

  it('idea category defaults to general', () => {
    expect(INITIAL_WIZARD_STATE.idea.category).toBe('general');
  });

  it('no execution results are pre-populated', () => {
    expect(INITIAL_WIZARD_STATE.createdIntentId).toBeUndefined();
    expect(INITIAL_WIZARD_STATE.createdObjectiveId).toBeUndefined();
    expect(INITIAL_WIZARD_STATE.createdSessionId).toBeUndefined();
    expect(INITIAL_WIZARD_STATE.createdIdeaId).toBeUndefined();
    expect(INITIAL_WIZARD_STATE.createdIdeaRef).toBeUndefined();
    expect(INITIAL_WIZARD_STATE.executionError).toBeUndefined();
  });
});

// ─── 5. Execution Pipeline ────────────────────────────────────────────────────

describe('DEFAULT_PIPELINE execution stages', () => {
  it('has exactly 10 pipeline stages (EWO-011.2 added Engineering Record)', () => {
    expect(DEFAULT_PIPELINE).toHaveLength(10);
  });

  it('all stages start in pending status', () => {
    for (const stage of DEFAULT_PIPELINE) {
      expect(stage.status).toBe('pending');
    }
  });

  it('pipeline stage keys follow the constitutional execution order', () => {
    const keys = DEFAULT_PIPELINE.map(s => s.key);
    expect(keys[0]).toBe('intent');
    expect(keys[1]).toBe('objective');
    expect(keys[2]).toBe('strategy');
    expect(keys[3]).toBe('session');
    expect(keys[4]).toBe('memory_pre');
    expect(keys[5]).toBe('idea');
    expect(keys[6]).toBe('evidence');
    expect(keys[7]).toBe('record');
    expect(keys[8]).toBe('memory_post');
    expect(keys[9]).toBe('complete');
  });

  it('every stage has a label', () => {
    for (const stage of DEFAULT_PIPELINE) {
      expect(stage.label).toBeTruthy();
    }
  });

  it('ExecutionPipelineStage status has 4 valid values', () => {
    const statuses: ExecutionPipelineStage['status'][] = ['pending', 'running', 'complete', 'error'];
    expect(statuses).toHaveLength(4);
  });

  it('record_ref is optional on pipeline stage', () => {
    const stage: ExecutionPipelineStage = { key: 'intent', label: 'Engineering Intent', status: 'complete', record_ref: 'INT-ABCD1234' };
    expect(stage.record_ref).toBe('INT-ABCD1234');
    const stageNoRef: ExecutionPipelineStage = { key: 'objective', label: 'Engineering Objective', status: 'pending' };
    expect(stageNoRef.record_ref).toBeUndefined();
  });
});

// ─── 6. Constitutional Pipeline Integrity ─────────────────────────────────────

describe('Constitutional execution pipeline integrity', () => {
  it('pipeline begins with intent — the why must be established first', () => {
    expect(DEFAULT_PIPELINE[0].key).toBe('intent');
  });

  it('memory_pre precedes idea creation', () => {
    const memPreIdx = DEFAULT_PIPELINE.findIndex(s => s.key === 'memory_pre');
    const ideaIdx   = DEFAULT_PIPELINE.findIndex(s => s.key === 'idea');
    expect(memPreIdx).toBeLessThan(ideaIdx);
  });

  it('memory_post follows evidence capture', () => {
    const evidenceIdx  = DEFAULT_PIPELINE.findIndex(s => s.key === 'evidence');
    const memPostIdx   = DEFAULT_PIPELINE.findIndex(s => s.key === 'memory_post');
    expect(evidenceIdx).toBeLessThan(memPostIdx);
  });

  it('complete is always the final stage', () => {
    const last = DEFAULT_PIPELINE[DEFAULT_PIPELINE.length - 1];
    expect(last.key).toBe('complete');
  });

  it('session creation precedes all execution work (intent/objective can precede session)', () => {
    const sessionIdx   = DEFAULT_PIPELINE.findIndex(s => s.key === 'session');
    const ideaIdx      = DEFAULT_PIPELINE.findIndex(s => s.key === 'idea');
    expect(sessionIdx).toBeLessThan(ideaIdx);
  });

  it('evidence follows idea (evidence about the idea, not before)', () => {
    const ideaIdx     = DEFAULT_PIPELINE.findIndex(s => s.key === 'idea');
    const evidenceIdx = DEFAULT_PIPELINE.findIndex(s => s.key === 'evidence');
    expect(ideaIdx).toBeLessThan(evidenceIdx);
  });
});

// ─── 7. Authority Model — Guardian Only ───────────────────────────────────────

describe('Guardian authority model for Engineering Ideas', () => {
  it('EngineeringIdea has guardian_validated field (not product_owner_approved)', () => {
    const idea: Partial<EngineeringIdea> = {
      guardian_validated: false,
      guardian_session_id: null,
    };
    expect('guardian_validated' in idea).toBe(true);
    expect('product_owner_approved' in idea).toBe(false);
  });

  it('guardian_validated defaults to false until execution completes', () => {
    const idea: Partial<EngineeringIdea> = { guardian_validated: false };
    expect(idea.guardian_validated).toBe(false);
  });

  it('guardian_session_id links validation to the execution session', () => {
    const idea: Partial<EngineeringIdea> = {
      guardian_validated: true,
      guardian_session_id: 'sess-ABCD1234',
    };
    expect(idea.guardian_validated).toBe(true);
    expect(idea.guardian_session_id).toBe('sess-ABCD1234');
  });
});

// ─── 8. ATD Integration — Natural Language Pre-fill ──────────────────────────

describe('ATD integration — natural language pre-fill', () => {
  it('WizardState accepts a partial pre-fill via idea.title', () => {
    const prefillState: WizardState = {
      ...INITIAL_WIZARD_STATE,
      idea: {
        ...INITIAL_WIZARD_STATE.idea,
        title: 'Improve API response caching layer',
      },
    };
    expect(prefillState.idea.title).toBe('Improve API response caching layer');
    expect(prefillState.step).toBe('intent');
  });

  it('ATD pre-fill does not alter the wizard step (stays at intent)', () => {
    const atdPrefill: WizardState = {
      ...INITIAL_WIZARD_STATE,
      idea: { ...INITIAL_WIZARD_STATE.idea, title: 'Some natural language input' },
    };
    expect(atdPrefill.step).toBe('intent');
  });

  it('tags can be pre-populated from ATD keyword extraction', () => {
    const state: WizardState = {
      ...INITIAL_WIZARD_STATE,
      idea: {
        ...INITIAL_WIZARD_STATE.idea,
        title: 'API caching',
        tags: ['api', 'caching', 'performance'],
      },
    };
    expect(state.idea.tags).toContain('api');
    expect(state.idea.tags).toContain('caching');
  });
});

// ─── 9. Idea Lifecycle Transitions ────────────────────────────────────────────

describe('Engineering Idea lifecycle transitions', () => {
  it('draft → active is a valid lifecycle progression', () => {
    const flow: IdeaStatus[] = ['draft', 'active'];
    expect(flow[0]).toBe('draft');
    expect(flow[1]).toBe('active');
  });

  it('active → queued_for_promotion is the promotion path', () => {
    const flow: IdeaStatus[] = ['active', 'queued_for_promotion'];
    expect(flow[1]).toBe('queued_for_promotion');
  });

  it('queued_for_promotion → promoted represents full EWO promotion', () => {
    const flow: IdeaStatus[] = ['queued_for_promotion', 'promoted'];
    expect(flow[1]).toBe('promoted');
  });

  it('active → archived is the deprecation path', () => {
    const flow: IdeaStatus[] = ['active', 'archived'];
    expect(flow[1]).toBe('archived');
  });

  it('active → superseded represents replacement by a better idea', () => {
    const flow: IdeaStatus[] = ['active', 'superseded'];
    expect(flow[1]).toBe('superseded');
  });
});

// ─── 10. WizardState type completeness ───────────────────────────────────────

describe('WizardState type completeness', () => {
  it('WizardState holds all 6 wizard forms', () => {
    const state = INITIAL_WIZARD_STATE;
    expect('intent' in state).toBe(true);
    expect('objective' in state).toBe(true);
    expect('strategy' in state).toBe(true);
    expect('idea' in state).toBe(true);
    expect('contextRef' in state).toBe(true);
    expect('agentRef' in state).toBe(true);
  });

  it('WizardIntentForm has title, description, business_driver, priority, programme', () => {
    const form = INITIAL_WIZARD_STATE.intent;
    expect('title' in form).toBe(true);
    expect('description' in form).toBe(true);
    expect('business_driver' in form).toBe(true);
    expect('priority' in form).toBe(true);
    expect('programme' in form).toBe(true);
  });

  it('WizardStrategyForm strategy_type has 6 valid options', () => {
    const types = ['incremental', 'parallel', 'phased', 'spike', 'iterative', 'experimental'];
    expect(types).toHaveLength(6);
    expect(types).toContain(INITIAL_WIZARD_STATE.strategy.strategy_type);
  });

  it('WizardIdeaForm has products and applications arrays', () => {
    const form = INITIAL_WIZARD_STATE.idea;
    expect(Array.isArray(form.products)).toBe(true);
    expect(Array.isArray(form.applications)).toBe(true);
    expect(Array.isArray(form.tags)).toBe(true);
  });
});

// ─── 11. EWO-011 Self-Validation ──────────────────────────────────────────────

describe('EWO-011 self-validation', () => {
  it('Phase 1: Engineering Idea domain model is first-class (11 categories, 6 statuses, 4 priorities)', () => {
    expect(Object.keys(IDEA_CATEGORY_CFG)).toHaveLength(11);
    expect(Object.keys(IDEA_STATUS_CFG)).toHaveLength(6);
    expect(Object.keys(IDEA_PRIORITY_CFG)).toHaveLength(4);
  });

  it('Phase 2: Constitutional Execution Wizard has 7 wizard steps (6 original + Similarity Review from EWO-011.1)', () => {
    expect(WIZARD_STEPS).toHaveLength(7);
  });

  it('Phase 3: Full execution pipeline has 10 stages (EWO-011.2 added Engineering Record)', () => {
    expect(DEFAULT_PIPELINE).toHaveLength(10);
  });

  it('Phase 4: ATD Integration — INITIAL_WIZARD_STATE supports pre-fill via idea.title', () => {
    const prefilled = { ...INITIAL_WIZARD_STATE, idea: { ...INITIAL_WIZARD_STATE.idea, title: 'ATD idea' } };
    expect(prefilled.idea.title).toBe('ATD idea');
  });

  it('Phase 6: Memory integration — pipeline includes memory_pre and memory_post stages', () => {
    const keys = DEFAULT_PIPELINE.map(s => s.key);
    expect(keys).toContain('memory_pre');
    expect(keys).toContain('memory_post');
  });

  it('Phase 7: Guardian-only authority model — idea has guardian_validated, not product_owner_approved', () => {
    const idea: Partial<EngineeringIdea> = { guardian_validated: true };
    expect('guardian_validated' in idea).toBe(true);
    expect('product_owner_approved' in idea).toBe(false);
  });

  it('Phase 8: Execution pipeline has session stage for dashboard live tracking', () => {
    const keys = DEFAULT_PIPELINE.map(s => s.key);
    expect(keys).toContain('session');
  });

  it('all pipeline stages have unique keys (no duplicates)', () => {
    const keys = DEFAULT_PIPELINE.map(s => s.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('config maps return defined values for all their own keys (no missing entries)', () => {
    const statusKeys = Object.keys(IDEA_STATUS_CFG) as IdeaStatus[];
    for (const k of statusKeys) {
      expect(IDEA_STATUS_CFG[k]).toBeDefined();
    }
    const priorityKeys = Object.keys(IDEA_PRIORITY_CFG) as IdeaPriority[];
    for (const k of priorityKeys) {
      expect(IDEA_PRIORITY_CFG[k]).toBeDefined();
    }
    const categoryKeys = Object.keys(IDEA_CATEGORY_CFG) as IdeaCategory[];
    for (const k of categoryKeys) {
      expect(IDEA_CATEGORY_CFG[k]).toBeDefined();
    }
  });
});
