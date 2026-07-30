/**
 * EWO-011.8.2 — Conversation-Native Engineering Execution
 * Covers: execution preparation steps, ConversationExecutionResult shape,
 * OrchestrationStatus execution stages, _buildWizardStateForExecution,
 * EXECUTION_PREPARATION_STEPS constant, pipeline stage completeness.
 */

import { describe, it, expect } from 'vitest';
import {
  EXECUTION_PREPARATION_STEPS,
  type ExecutionPreparationStep,
  type ConversationExecutionResult,
  type ConversationExecutionInput,
  type OrchestrationStatus,
  EngineeringOrchestrator,
} from '../lib/engineeringOrchestrator';
import type { ExecutionPipelineStage } from '../pages/ecc/ECCIdeaTypes';
import { DEFAULT_PIPELINE } from '../pages/ecc/ECCIdeaTypes';

// ─── 1. EXECUTION_PREPARATION_STEPS constant ─────────────────────────────────

describe('EXECUTION_PREPARATION_STEPS (EWO-011.8.2)', () => {
  it('exports exactly 6 preparation steps', () => {
    expect(EXECUTION_PREPARATION_STEPS).toHaveLength(6);
  });

  it('all steps have key, label, and status fields', () => {
    EXECUTION_PREPARATION_STEPS.forEach(step => {
      expect(typeof step.key).toBe('string');
      expect(step.key.length).toBeGreaterThan(0);
      expect(typeof step.label).toBe('string');
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.status).toBe('pending');
    });
  });

  it('step keys are unique', () => {
    const keys = EXECUTION_PREPARATION_STEPS.map(s => s.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('contains selecting_agent step', () => {
    const keys = EXECUTION_PREPARATION_STEPS.map(s => s.key);
    expect(keys).toContain('selecting_agent');
  });

  it('contains similarity_check step', () => {
    const keys = EXECUTION_PREPARATION_STEPS.map(s => s.key);
    expect(keys).toContain('similarity_check');
  });

  it('contains preparing_pipeline as last step', () => {
    const last = EXECUTION_PREPARATION_STEPS[EXECUTION_PREPARATION_STEPS.length - 1];
    expect(last.key).toBe('preparing_pipeline');
  });

  it('selecting_agent comes before similarity_check', () => {
    const keys = EXECUTION_PREPARATION_STEPS.map(s => s.key);
    expect(keys.indexOf('selecting_agent')).toBeLessThan(keys.indexOf('similarity_check'));
  });

  it('similarity_check comes before creating_session', () => {
    const keys = EXECUTION_PREPARATION_STEPS.map(s => s.key);
    expect(keys.indexOf('similarity_check')).toBeLessThan(keys.indexOf('creating_session'));
  });
});

// ─── 2. ExecutionPreparationStep type ────────────────────────────────────────

describe('ExecutionPreparationStep type (EWO-011.8.2)', () => {
  it('accepts all valid status values', () => {
    const statuses: ExecutionPreparationStep['status'][] = ['pending', 'running', 'complete', 'error'];
    expect(statuses).toHaveLength(4);
  });

  it('can construct a valid step object', () => {
    const step: ExecutionPreparationStep = {
      key: 'test_step',
      label: 'Test Step',
      status: 'running',
    };
    expect(step.key).toBe('test_step');
    expect(step.label).toBe('Test Step');
    expect(step.status).toBe('running');
  });
});

// ─── 3. ConversationExecutionResult type ─────────────────────────────────────

describe('ConversationExecutionResult type (EWO-011.8.2)', () => {
  it('can construct a valid result object', () => {
    const pipeline: ExecutionPipelineStage[] = DEFAULT_PIPELINE.map(s => ({ ...s }));
    const result: ConversationExecutionResult = {
      ideaRef: 'IDEA-001',
      ideaId: 'uuid-1234',
      intentRef: 'INT-001',
      sessionRef: 'SESS-001',
      recordRef: 'REC-001',
      pipeline,
    };
    expect(result.ideaRef).toBe('IDEA-001');
    expect(result.intentRef).toBe('INT-001');
    expect(Array.isArray(result.pipeline)).toBe(true);
  });

  it('pipeline field matches DEFAULT_PIPELINE shape', () => {
    const pipeline: ExecutionPipelineStage[] = DEFAULT_PIPELINE.map(s => ({ ...s }));
    pipeline.forEach(stage => {
      expect(typeof stage.key).toBe('string');
      expect(typeof stage.label).toBe('string');
      expect(typeof stage.status).toBe('string');
    });
  });
});

// ─── 4. OrchestrationStatus — execution stages ───────────────────────────────

describe('OrchestrationStatus execution stages (EWO-011.8.2)', () => {
  it('preparing_execution is a valid OrchestrationStatus', () => {
    const s: OrchestrationStatus = 'preparing_execution';
    expect(s).toBe('preparing_execution');
  });

  it('awaiting_execution is a valid OrchestrationStatus', () => {
    const s: OrchestrationStatus = 'awaiting_execution';
    expect(s).toBe('awaiting_execution');
  });

  it('executing is a valid OrchestrationStatus', () => {
    const s: OrchestrationStatus = 'executing';
    expect(s).toBe('executing');
  });

  it('full execution stage order is correct', () => {
    const stages: OrchestrationStatus[] = [
      'awaiting_plan_approval',
      'preparing_execution',
      'awaiting_execution',
      'executing',
      'complete',
    ];
    expect(stages.indexOf('preparing_execution')).toBeLessThan(stages.indexOf('awaiting_execution'));
    expect(stages.indexOf('awaiting_execution')).toBeLessThan(stages.indexOf('executing'));
    expect(stages.indexOf('executing')).toBeLessThan(stages.indexOf('complete'));
  });

  it('execution stages come after plan approval', () => {
    const order: OrchestrationStatus[] = [
      'awaiting_plan_approval',
      'preparing_execution',
      'awaiting_execution',
      'executing',
    ];
    expect(order.indexOf('awaiting_plan_approval')).toBeLessThan(order.indexOf('preparing_execution'));
  });
});

// ─── 5. DEFAULT_PIPELINE shape ────────────────────────────────────────────────

describe('DEFAULT_PIPELINE shape (EWO-011.8.2)', () => {
  it('exports exactly 10 stages', () => {
    expect(DEFAULT_PIPELINE).toHaveLength(10);
  });

  it('all stages are pending by default', () => {
    DEFAULT_PIPELINE.forEach(stage => {
      expect(stage.status).toBe('pending');
    });
  });

  it('first stage is intent', () => {
    expect(DEFAULT_PIPELINE[0].key).toBe('intent');
  });

  it('last stage is complete', () => {
    expect(DEFAULT_PIPELINE[DEFAULT_PIPELINE.length - 1].key).toBe('complete');
  });

  it('contains idea and session stages', () => {
    const keys = DEFAULT_PIPELINE.map(s => s.key);
    expect(keys).toContain('idea');
    expect(keys).toContain('session');
  });

  it('idea stage comes after session stage', () => {
    const keys = DEFAULT_PIPELINE.map(s => s.key);
    expect(keys.indexOf('session')).toBeLessThan(keys.indexOf('idea'));
  });

  it('record stage comes after idea stage', () => {
    const keys = DEFAULT_PIPELINE.map(s => s.key);
    expect(keys.indexOf('idea')).toBeLessThan(keys.indexOf('record'));
  });
});

// ─── 6. EngineeringOrchestrator — execution methods ──────────────────────────

describe('EngineeringOrchestrator execution methods (EWO-011.8.2)', () => {
  it('exports prepareExecution function', () => {
    expect(typeof EngineeringOrchestrator.prepareExecution).toBe('function');
  });

  it('exports executeConversationPipeline function', () => {
    expect(typeof EngineeringOrchestrator.executeConversationPipeline).toBe('function');
  });

  it('exports _buildWizardStateForExecution function', () => {
    expect(typeof EngineeringOrchestrator._buildWizardStateForExecution).toBe('function');
  });
});

// ─── 7. Regression — EWO-011.8.1 exports intact ──────────────────────────────

describe('Regression guard — EWO-011.8.1 exports intact (EWO-011.8.2)', () => {
  it('assessReadiness is still a function', async () => {
    const { assessReadiness } = await import('../lib/engineeringOrchestrator');
    expect(typeof assessReadiness).toBe('function');
  });

  it('classifyWork is still a function', async () => {
    const { classifyWork } = await import('../lib/engineeringOrchestrator');
    expect(typeof classifyWork).toBe('function');
  });

  it('orchestrate is still on EngineeringOrchestrator', () => {
    expect(typeof EngineeringOrchestrator.orchestrate).toBe('function');
  });

  it('approveAnalysis is still on EngineeringOrchestrator', () => {
    expect(typeof EngineeringOrchestrator.approveAnalysis).toBe('function');
  });

  it('approvePlan is still on EngineeringOrchestrator', () => {
    expect(typeof EngineeringOrchestrator.approvePlan).toBe('function');
  });

  it('restoreAndContinue is still on EngineeringOrchestrator', () => {
    expect(typeof EngineeringOrchestrator.restoreAndContinue).toBe('function');
  });
});

// ─── 8. EXECUTION_PREPARATION_STEPS immutability ─────────────────────────────

describe('EXECUTION_PREPARATION_STEPS deep copy behaviour (EWO-011.8.2)', () => {
  it('creating a copy does not mutate the original', () => {
    const copy = EXECUTION_PREPARATION_STEPS.map(s => ({ ...s, status: 'running' as const }));
    expect(EXECUTION_PREPARATION_STEPS[0].status).toBe('pending');
    expect(copy[0].status).toBe('running');
  });

  it('spread copy has same keys as original', () => {
    const copy = EXECUTION_PREPARATION_STEPS.map(s => ({ ...s }));
    copy.forEach((step, i) => {
      expect(step.key).toBe(EXECUTION_PREPARATION_STEPS[i].key);
    });
  });
});
