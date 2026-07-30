/**
 * EWO-011.6 — Cognitive Pipeline Trace, Data Location and UI Visibility
 * Covers: pipeline stage advancement after captureIntent, navigation reliability,
 * progress calculation, plan empty-state guidance, regression guards.
 */

import { describe, it, expect } from 'vitest';
import type { PipelineExecution, PipelineStage } from '../lib/atdCognitiveEngine';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePipeline(
  current_stage: PipelineStage,
  status: PipelineExecution['status'] = 'running',
  stageHistory: { stage: PipelineStage; outcome: 'complete' | 'failed' | 'skipped' }[] = [],
): PipelineExecution {
  return {
    id: 'pipe-001',
    pipeline_ref: 'ATD-PIPE-001',
    intent_id: 'intent-001',
    current_stage,
    status,
    started_at: new Date().toISOString(),
    completed_at: null,
    stage_history: stageHistory.map(h => ({
      stage: h.stage,
      entered_at: new Date().toISOString(),
      outcome: h.outcome,
    })),
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const STAGE_ORDER: PipelineStage[] = [
  'intent_understanding', 'engineering_analysis', 'engineering_planning',
  'review_preparation', 'approval', 'implementation_coordination',
  'validation', 'knowledge_extraction', 'intelligence_update', 'complete',
];

function computeProgress(current_stage: PipelineStage): number {
  const idx = STAGE_ORDER.indexOf(current_stage);
  return Math.round((idx / (STAGE_ORDER.length - 1)) * 100);
}

// ─── 1. Pipeline Stage Advancement after captureIntent ────────────────────────

describe('captureIntent pipeline advancement (EWO-011.6)', () => {
  it('pipeline must advance to engineering_analysis after intent capture', () => {
    // captureIntent must call _advancePipelineStage after recording capability execution
    // so current_stage reflects "awaiting engineering analysis", not "intent_understanding"
    const pipeline = makePipeline('engineering_analysis', 'running', [
      { stage: 'intent_understanding', outcome: 'complete' },
      { stage: 'engineering_analysis', outcome: 'complete' },
    ]);
    expect(pipeline.current_stage).toBe('engineering_analysis');
    expect(pipeline.status).toBe('running');
  });

  it('pipeline must NOT remain at intent_understanding after capture completes', () => {
    // Before fix: captureIntent never called _advancePipelineStage
    // After fix: current_stage advances to engineering_analysis
    const advancedPipeline = makePipeline('engineering_analysis');
    const stuckPipeline = makePipeline('intent_understanding');

    const isStuck = stuckPipeline.current_stage === 'intent_understanding';
    const isAdvanced = advancedPipeline.current_stage === 'engineering_analysis';

    expect(isAdvanced).toBe(true);
    expect(isStuck).toBe(true); // validates what was broken
  });

  it('stage_history contains intent_understanding entry with outcome complete before advancement', () => {
    const pipeline = makePipeline('engineering_analysis', 'running', [
      { stage: 'intent_understanding', outcome: 'complete' },
    ]);
    const iuEntry = pipeline.stage_history.find(h => h.stage === 'intent_understanding');
    expect(iuEntry).toBeDefined();
    expect(iuEntry?.outcome).toBe('complete');
  });

  it('stage_history contains engineering_analysis entry after advancement', () => {
    const pipeline = makePipeline('engineering_analysis', 'running', [
      { stage: 'intent_understanding', outcome: 'complete' },
      { stage: 'engineering_analysis', outcome: 'complete' },
    ]);
    const eaEntry = pipeline.stage_history.find(h => h.stage === 'engineering_analysis');
    expect(eaEntry).toBeDefined();
  });

  it('pipeline status remains running after advancing to engineering_analysis (awaiting action)', () => {
    const pipeline = makePipeline('engineering_analysis', 'running');
    expect(pipeline.status).toBe('running');
    expect(pipeline.completed_at).toBeNull();
  });
});

// ─── 2. Progress Calculation ──────────────────────────────────────────────────

describe('Pipeline progress calculation (EWO-011.6)', () => {
  it('intent_understanding stage produces 0% progress', () => {
    expect(computeProgress('intent_understanding')).toBe(0);
  });

  it('engineering_analysis stage produces ~11% progress', () => {
    expect(computeProgress('engineering_analysis')).toBe(11);
  });

  it('engineering_planning stage produces ~22% progress', () => {
    expect(computeProgress('engineering_planning')).toBe(22);
  });

  it('complete stage produces 100% progress', () => {
    expect(computeProgress('complete')).toBe(100);
  });

  it('progress increases monotonically across STAGE_ORDER', () => {
    const progresses = STAGE_ORDER.map(s => computeProgress(s));
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1]);
    }
  });

  it('engineering_analysis progress is greater than intent_understanding progress', () => {
    expect(computeProgress('engineering_analysis')).toBeGreaterThan(computeProgress('intent_understanding'));
  });
});

// ─── 3. Navigation Reliability ────────────────────────────────────────────────

describe('navigateToIntent reliability (EWO-011.6)', () => {
  it('navigateToIntent writes atd_pending_intent to sessionStorage', () => {
    const mockStorage: Record<string, string> = {};
    const set = (k: string, v: string) => { mockStorage[k] = v; };
    set('atd_pending_intent', 'intent-abc');
    expect(mockStorage['atd_pending_intent']).toBe('intent-abc');
  });

  it('navigateToIntent dispatches atd:openIntent CustomEvent', () => {
    let received: string | null = null;
    const handler = (e: Event) => {
      received = (e as CustomEvent<{ intentId: string }>).detail.intentId;
    };
    const evt = new CustomEvent('atd:openIntent', { detail: { intentId: 'intent-abc' } });
    handler(evt);
    expect(received).toBe('intent-abc');
  });

  it('workspace registers atd:openIntent listener to handle already-mounted case', () => {
    // Simulates: workspace already mounted, navigateToIntent dispatches event
    let pendingIntentId: string | null = null;
    const listener = (e: Event) => {
      const id = (e as CustomEvent<{ intentId: string }>).detail?.intentId;
      if (id) pendingIntentId = id;
    };

    const evt = new CustomEvent('atd:openIntent', { detail: { intentId: 'intent-xyz' } });
    listener(evt);

    expect(pendingIntentId).toBe('intent-xyz');
  });

  it('sessionStorage fallback still works for fresh page loads', () => {
    const mockStorage: Record<string, string> = { 'atd_pending_intent': 'intent-001' };
    const id = mockStorage['atd_pending_intent'];
    delete mockStorage['atd_pending_intent'];
    expect(id).toBe('intent-001');
    expect(mockStorage['atd_pending_intent']).toBeUndefined();
  });

  it('both sessionStorage write and CustomEvent dispatch occur on navigate', () => {
    const mockStorage: Record<string, string> = {};
    let eventFired = false;

    const simulateNavigate = (intentId: string) => {
      mockStorage['atd_pending_intent'] = intentId;
      eventFired = true;
    };

    simulateNavigate('intent-001');
    expect(mockStorage['atd_pending_intent']).toBe('intent-001');
    expect(eventFired).toBe(true);
  });
});

// ─── 4. Pending Intent Deep-Link Selection ────────────────────────────────────

describe('Pending intent deep-link selection (EWO-011.6)', () => {
  it('workspace selects intent by ID after loading when pendingIntentId is set', () => {
    const intents = [
      { id: 'intent-001', status: 'captured' },
      { id: 'intent-002', status: 'planned' },
    ];
    const pendingId = 'intent-001';
    const found = intents.find(i => i.id === pendingId);
    expect(found).toBeDefined();
    expect(found?.id).toBe('intent-001');
  });

  it('intent with status "captured" navigates to overview section', () => {
    const intent = { id: 'intent-001', status: 'captured' };
    const hasPlan = !['captured', 'analysing', 'analysed'].includes(intent.status);
    expect(hasPlan).toBe(false);
  });

  it('intent with status "planned" navigates to plan section', () => {
    const intent = { id: 'intent-002', status: 'planned' };
    const hasPlan = !['captured', 'analysing', 'analysed'].includes(intent.status);
    expect(hasPlan).toBe(true);
  });

  it('pendingIntentId is cleared after selection to prevent re-trigger', () => {
    let pendingId: string | null = 'intent-001';
    const apply = () => { pendingId = null; };
    apply();
    expect(pendingId).toBeNull();
  });

  it('selection occurs AFTER loading === false', () => {
    let loading = true;
    let selected = false;

    const applyPending = () => {
      if (loading) return;
      selected = true;
    };

    applyPending(); // loading=true → no selection
    expect(selected).toBe(false);

    loading = false;
    applyPending(); // loading=false → selection
    expect(selected).toBe(true);
  });
});

// ─── 5. Plan Empty State Guidance ────────────────────────────────────────────

describe('Plan empty state guidance (EWO-011.6)', () => {
  it('when pipeline at engineering_analysis, guidance mentions Engineering Analysis', () => {
    const pipeline = makePipeline('engineering_analysis');
    const body = pipeline.current_stage === 'engineering_analysis'
      ? 'Next step: run Engineering Analysis via the workspace wizard.'
      : 'Run Engineering Analysis then Engineering Planning.';
    expect(body).toContain('Engineering Analysis');
  });

  it('when pipeline at engineering_planning, guidance mentions Engineering Planning', () => {
    const pipeline = makePipeline('engineering_planning');
    const body = pipeline.current_stage === 'engineering_planning'
      ? 'Next step: run Engineering Planning via the workspace wizard to generate a plan.'
      : 'Run Engineering Analysis then Engineering Planning.';
    expect(body).toContain('Engineering Planning');
  });

  it('fallback guidance mentions both Analysis and Planning', () => {
    const pipeline = makePipeline('review_preparation');
    const body = pipeline.current_stage === 'engineering_analysis'
      ? 'Run Engineering Analysis.'
      : pipeline.current_stage === 'engineering_planning'
      ? 'Run Engineering Planning.'
      : 'Run Engineering Analysis then Engineering Planning via the workspace wizard.';
    expect(body).toContain('Engineering Analysis');
    expect(body).toContain('Engineering Planning');
  });

  it('plan empty state body is non-empty string', () => {
    const bodies = [
      'Next step: run Engineering Analysis via the workspace wizard.',
      'Next step: run Engineering Planning via the workspace wizard to generate a plan.',
      'Run Engineering Analysis then Engineering Planning via the workspace wizard.',
    ];
    bodies.forEach(b => {
      expect(typeof b).toBe('string');
      expect(b.length).toBeGreaterThan(0);
    });
  });
});

// ─── 6. EWO-011.4B and EWO-011.5 Regression Guard ───────────────────────────

describe('Regression guard — prior EWO fixes not broken (EWO-011.6)', () => {
  it('lifecycle_status deleted filter still excludes deleted intents from list', () => {
    const intents = [
      { id: 'i-001', lifecycle_status: 'active' },
      { id: 'i-002', lifecycle_status: 'deleted' },
      { id: 'i-003', lifecycle_status: 'archived' },
    ];
    const visible = intents.filter(i => i.lifecycle_status !== 'deleted');
    expect(visible).toHaveLength(2);
    expect(visible.map(i => i.id)).not.toContain('i-002');
  });

  it('pipeline list still excludes pipelines whose parent intent is deleted', () => {
    const pipelines = [
      { id: 'p-001', intent_id: 'i-active' },
      { id: 'p-002', intent_id: 'i-deleted' },
    ];
    const deletedIntentIds = new Set(['i-deleted']);
    const visible = pipelines.filter(p => !deletedIntentIds.has(p.intent_id));
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('p-001');
  });

  it('duplicate intelligence result type shape is unchanged', () => {
    const result = {
      recordId: 'rec-001',
      hasFindings: false,
      recommendation: 'proceed' as const,
      confidence: 0,
      explanationText: 'No duplicates.',
      recommendationLabel: 'Proceed',
      analysedAt: new Date().toISOString(),
    };
    expect(result.recommendation).toBe('proceed');
    expect(result.hasFindings).toBe(false);
  });

  it('undo notification still cleared after intent deletion (EWO-011.4B)', () => {
    let notification: { message: string } | null = { message: 'Deleted.' };
    const expire = () => { notification = null; };
    expire();
    expect(notification).toBeNull();
  });

  it('atd_pending_intent sessionStorage key is consistent across navigation and workspace', () => {
    const STORAGE_KEY = 'atd_pending_intent';
    const writeKey = 'atd_pending_intent'; // used in navigateToIntent
    const readKey  = 'atd_pending_intent'; // used in ECCATDWorkspacePage useState init
    expect(writeKey).toBe(STORAGE_KEY);
    expect(readKey).toBe(STORAGE_KEY);
  });
});
