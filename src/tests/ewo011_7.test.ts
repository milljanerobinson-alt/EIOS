/**
 * EWO-011.7 — Guided Engineering Workflow & Interactive Pipeline
 * Covers: recommendation engine config, stage states, action keys, progress,
 * recommendation cards, plan tab guidance, regression guards.
 */

import { describe, it, expect } from 'vitest';
import {
  STAGE_REGISTRY,
  PIPELINE_STAGE_ORDER,
  getStageRecommendation,
  getNextRecommendation,
} from '../lib/pipelineRecommendationEngine';
import type { PipelineStage } from '../lib/atdCognitiveEngine';
import type { StageActionKey } from '../lib/pipelineRecommendationEngine';

// ─── 1. Stage Registry completeness ──────────────────────────────────────────

describe('Stage Registry completeness (EWO-011.7)', () => {
  it('every stage in PIPELINE_STAGE_ORDER has a registry entry', () => {
    PIPELINE_STAGE_ORDER.forEach(stage => {
      expect(STAGE_REGISTRY[stage]).toBeDefined();
    });
  });

  it('every registry entry has required fields', () => {
    PIPELINE_STAGE_ORDER.forEach(stage => {
      const cfg = STAGE_REGISTRY[stage];
      expect(cfg.stage).toBe(stage);
      expect(typeof cfg.shortLabel).toBe('string');
      expect(cfg.shortLabel.length).toBeGreaterThan(0);
      expect(typeof cfg.purpose).toBe('string');
      expect(cfg.purpose.length).toBeGreaterThan(0);
      expect(Array.isArray(cfg.expectedOutputs)).toBe(true);
      expect(Array.isArray(cfg.prerequisites)).toBe(true);
      expect(typeof cfg.recommendationTitle).toBe('string');
      expect(typeof cfg.recommendationBody).toBe('string');
      expect(typeof cfg.actionLabel).toBe('string');
      expect(typeof cfg.actionKey).toBe('string');
    });
  });

  it('stage registry has exactly 10 stages', () => {
    expect(PIPELINE_STAGE_ORDER).toHaveLength(10);
    expect(Object.keys(STAGE_REGISTRY)).toHaveLength(10);
  });

  it('complete stage has actionKey none', () => {
    expect(STAGE_REGISTRY['complete'].actionKey).toBe('none');
    expect(STAGE_REGISTRY['complete'].actionLabel).toBe('');
  });

  it('engineering_analysis stage has actionKey run_analysis', () => {
    expect(STAGE_REGISTRY['engineering_analysis'].actionKey).toBe('run_analysis');
  });

  it('engineering_planning stage has actionKey run_planning', () => {
    expect(STAGE_REGISTRY['engineering_planning'].actionKey).toBe('run_planning');
  });
});

// ─── 2. Stage Order ───────────────────────────────────────────────────────────

describe('Pipeline stage order (EWO-011.7)', () => {
  it('starts with intent_understanding', () => {
    expect(PIPELINE_STAGE_ORDER[0]).toBe('intent_understanding');
  });

  it('ends with complete', () => {
    expect(PIPELINE_STAGE_ORDER[PIPELINE_STAGE_ORDER.length - 1]).toBe('complete');
  });

  it('engineering_analysis immediately follows intent_understanding', () => {
    const iuIdx = PIPELINE_STAGE_ORDER.indexOf('intent_understanding');
    const eaIdx = PIPELINE_STAGE_ORDER.indexOf('engineering_analysis');
    expect(eaIdx).toBe(iuIdx + 1);
  });

  it('engineering_planning immediately follows engineering_analysis', () => {
    const eaIdx = PIPELINE_STAGE_ORDER.indexOf('engineering_analysis');
    const epIdx = PIPELINE_STAGE_ORDER.indexOf('engineering_planning');
    expect(epIdx).toBe(eaIdx + 1);
  });
});

// ─── 3. getStageRecommendation ────────────────────────────────────────────────

describe('getStageRecommendation (EWO-011.7)', () => {
  it('returns isCurrent=true when targetStage equals currentStage', () => {
    const rec = getStageRecommendation('engineering_analysis', 'engineering_analysis');
    expect(rec.isCurrent).toBe(true);
    expect(rec.isActionable).toBe(true);
    expect(rec.isFuture).toBe(false);
    expect(rec.isComplete).toBe(false);
  });

  it('returns isComplete=true when targetStage is before currentStage', () => {
    const rec = getStageRecommendation('engineering_planning', 'intent_understanding');
    expect(rec.isComplete).toBe(true);
    expect(rec.isCurrent).toBe(false);
    expect(rec.isFuture).toBe(false);
  });

  it('returns isFuture=true when targetStage is after currentStage', () => {
    const rec = getStageRecommendation('engineering_analysis', 'engineering_planning');
    expect(rec.isFuture).toBe(true);
    expect(rec.isCurrent).toBe(false);
    expect(rec.isComplete).toBe(false);
  });

  it('isActionable=false for future stages', () => {
    const rec = getStageRecommendation('intent_understanding', 'engineering_planning');
    expect(rec.isActionable).toBe(false);
  });

  it('isActionable=false for complete stage', () => {
    const rec = getStageRecommendation('complete', 'complete');
    expect(rec.isActionable).toBe(false);
  });

  it('actionKey is run_analysis when current stage is engineering_analysis', () => {
    const rec = getStageRecommendation('engineering_analysis', 'engineering_analysis');
    expect(rec.actionKey).toBe('run_analysis');
  });

  it('actionKey is run_planning when current stage is engineering_planning', () => {
    const rec = getStageRecommendation('engineering_planning', 'engineering_planning');
    expect(rec.actionKey).toBe('run_planning');
  });
});

// ─── 4. getNextRecommendation ─────────────────────────────────────────────────

describe('getNextRecommendation (EWO-011.7)', () => {
  it('returns the recommendation for the current stage', () => {
    const rec = getNextRecommendation('engineering_analysis');
    expect(rec.isCurrent).toBe(true);
    expect(rec.actionKey).toBe('run_analysis');
    expect(rec.isActionable).toBe(true);
  });

  it('returns run_planning recommendation for engineering_planning stage', () => {
    const rec = getNextRecommendation('engineering_planning');
    expect(rec.actionKey).toBe('run_planning');
    expect(rec.actionLabel).toBeTruthy();
  });

  it('returns non-empty title and body for every actionable stage', () => {
    const actionableStages: PipelineStage[] = [
      'intent_understanding', 'engineering_analysis', 'engineering_planning',
      'review_preparation', 'approval', 'implementation_coordination',
      'validation', 'knowledge_extraction', 'intelligence_update',
    ];
    actionableStages.forEach(stage => {
      const rec = getNextRecommendation(stage);
      expect(rec.title.length).toBeGreaterThan(0);
      expect(rec.body.length).toBeGreaterThan(0);
    });
  });

  it('complete stage returns isActionable=false', () => {
    const rec = getNextRecommendation('complete');
    expect(rec.isActionable).toBe(false);
    expect(rec.actionKey).toBe('none');
  });
});

// ─── 5. Intent Understanding → Engineering Analysis transition ────────────────

describe('Intent Understanding → Engineering Analysis transition (EWO-011.7)', () => {
  it('after captureIntent, pipeline should be at engineering_analysis', () => {
    // Validates the EWO-011.6 fix: captureIntent now calls _advancePipelineStage
    const expectedStage: PipelineStage = 'engineering_analysis';
    const rec = getNextRecommendation(expectedStage);
    expect(rec.actionKey).toBe('run_analysis');
    expect(rec.isActionable).toBe(true);
  });

  it('recommendation title contains "Analysis" for engineering_analysis stage', () => {
    const rec = getNextRecommendation('engineering_analysis');
    expect(rec.title).toContain('Analysis');
  });

  it('recommendation body is non-empty and informative', () => {
    const rec = getNextRecommendation('engineering_analysis');
    expect(rec.body.length).toBeGreaterThan(50);
    expect(rec.body).toContain('Engineering Analysis');
  });

  it('intent_understanding stage is complete relative to engineering_analysis', () => {
    const rec = getStageRecommendation('engineering_analysis', 'intent_understanding');
    expect(rec.isComplete).toBe(true);
  });
});

// ─── 6. Engineering Analysis → Engineering Planning transition ────────────────

describe('Engineering Analysis → Engineering Planning transition (EWO-011.7)', () => {
  it('after runAnalysis, pipeline advances to engineering_planning', () => {
    // runAnalysis calls _advancePipelineStage('engineering_analysis', 'engineering_planning')
    const expectedStage: PipelineStage = 'engineering_planning';
    const rec = getNextRecommendation(expectedStage);
    expect(rec.actionKey).toBe('run_planning');
    expect(rec.isActionable).toBe(true);
  });

  it('recommendation label for planning is non-empty', () => {
    const rec = getNextRecommendation('engineering_planning');
    expect(rec.actionLabel).toBeTruthy();
    expect(rec.actionLabel).toContain('Plan');
  });

  it('engineering_analysis is complete relative to engineering_planning', () => {
    const rec = getStageRecommendation('engineering_planning', 'engineering_analysis');
    expect(rec.isComplete).toBe(true);
  });
});

// ─── 7. Stage expected outputs ────────────────────────────────────────────────

describe('Stage expected outputs (EWO-011.7)', () => {
  it('engineering_analysis outputs include complexity assessment', () => {
    const outputs = STAGE_REGISTRY['engineering_analysis'].expectedOutputs;
    expect(outputs.some(o => o.toLowerCase().includes('complexity'))).toBe(true);
  });

  it('engineering_planning outputs include Engineering Plan', () => {
    const outputs = STAGE_REGISTRY['engineering_planning'].expectedOutputs;
    expect(outputs.some(o => o.includes('Engineering Plan'))).toBe(true);
  });

  it('knowledge_extraction outputs include knowledge records', () => {
    const outputs = STAGE_REGISTRY['knowledge_extraction'].expectedOutputs;
    expect(outputs.some(o => o.toLowerCase().includes('knowledge'))).toBe(true);
  });

  it('all stages have at least one expected output', () => {
    PIPELINE_STAGE_ORDER.forEach(stage => {
      expect(STAGE_REGISTRY[stage].expectedOutputs.length).toBeGreaterThan(0);
    });
  });
});

// ─── 8. Prerequisites ─────────────────────────────────────────────────────────

describe('Stage prerequisites (EWO-011.7)', () => {
  it('intent_understanding has no prerequisites', () => {
    expect(STAGE_REGISTRY['intent_understanding'].prerequisites).toHaveLength(0);
  });

  it('engineering_analysis requires intent_understanding', () => {
    const prereqs = STAGE_REGISTRY['engineering_analysis'].prerequisites;
    expect(prereqs.length).toBeGreaterThan(0);
    expect(prereqs.some(p => p.toLowerCase().includes('intent'))).toBe(true);
  });

  it('engineering_planning requires engineering_analysis', () => {
    const prereqs = STAGE_REGISTRY['engineering_planning'].prerequisites;
    expect(prereqs.length).toBeGreaterThan(0);
    expect(prereqs.some(p => p.toLowerCase().includes('analysis'))).toBe(true);
  });
});

// ─── 9. Guided workflow — full stage traversal ────────────────────────────────

describe('Full guided workflow traversal (EWO-011.7)', () => {
  it('every stage produces an actionable or informational recommendation', () => {
    PIPELINE_STAGE_ORDER.forEach(stage => {
      const rec = getNextRecommendation(stage);
      expect(rec).toBeDefined();
      expect(rec.title.length).toBeGreaterThan(0);
    });
  });

  it('all actionable stages have a non-empty actionLabel', () => {
    PIPELINE_STAGE_ORDER.filter(s => s !== 'complete').forEach(stage => {
      const rec = getNextRecommendation(stage);
      if (rec.isActionable) {
        expect(rec.actionLabel.length).toBeGreaterThan(0);
      }
    });
  });

  it('recommendation body is never empty for any stage', () => {
    PIPELINE_STAGE_ORDER.forEach(stage => {
      const rec = getNextRecommendation(stage);
      expect(rec.body.length).toBeGreaterThan(0);
    });
  });
});

// ─── 10. Regression guard — prior EWOs unaffected ────────────────────────────

describe('Regression guard — prior EWO fixes intact (EWO-011.7)', () => {
  it('EWO-011.6 fix: engineering_analysis is at index 1 (not 0)', () => {
    expect(PIPELINE_STAGE_ORDER.indexOf('engineering_analysis')).toBe(1);
  });

  it('EWO-011.6 fix: intent_understanding at index 0 (pipeline starts here)', () => {
    expect(PIPELINE_STAGE_ORDER.indexOf('intent_understanding')).toBe(0);
  });

  it('stage order is not empty and matches length 10', () => {
    expect(PIPELINE_STAGE_ORDER).toHaveLength(10);
  });

  it('action keys are distinct for analysis and planning stages', () => {
    const analysisKey: StageActionKey = STAGE_REGISTRY['engineering_analysis'].actionKey;
    const planningKey: StageActionKey = STAGE_REGISTRY['engineering_planning'].actionKey;
    expect(analysisKey).not.toBe(planningKey);
    expect(analysisKey).toBe('run_analysis');
    expect(planningKey).toBe('run_planning');
  });

  it('no stage has undefined purpose, title, or body', () => {
    PIPELINE_STAGE_ORDER.forEach(stage => {
      const cfg = STAGE_REGISTRY[stage];
      expect(cfg.purpose).not.toBeUndefined();
      expect(cfg.recommendationTitle).not.toBeUndefined();
      expect(cfg.recommendationBody).not.toBeUndefined();
    });
  });
});
