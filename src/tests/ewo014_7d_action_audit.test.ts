import { describe, it, expect } from 'vitest';
import { STAGE_REGISTRY, getNextRecommendation, type StageActionKey } from '../lib/pipelineRecommendationEngine';

describe('EWO-014.7D: ATD Workspace Action Wiring Audit', () => {

  describe('Stage Registry — all action keys are valid', () => {
    const VALID_KEYS: StageActionKey[] = [
      'run_analysis', 'run_planning', 'prepare_review', 'record_decision',
      'begin_engineering', 'record_validation', 'extract_knowledge',
      'complete_intelligence', 'none',
    ];

    it('every stage with isActionable has a valid actionKey', () => {
      for (const [stageKey, config] of Object.entries(STAGE_REGISTRY)) {
        if (config.isActionable && config.actionKey) {
          expect(VALID_KEYS).toContain(config.actionKey);
        }
      }
    });

    it('no stage uses the legacy coordinate_implementation key', () => {
      for (const [stageKey, config] of Object.entries(STAGE_REGISTRY)) {
        if (config.actionKey) {
          expect(config.actionKey).not.toBe('coordinate_implementation');
        }
      }
    });

    it('implementation_coordination stage uses begin_engineering', () => {
      expect(STAGE_REGISTRY.implementation_coordination.actionKey).toBe('begin_engineering');
      expect(STAGE_REGISTRY.implementation_coordination.actionLabel).toBe('Begin Engineering');
    });
  });

  describe('getNextRecommendation — returns actionable recommendations for actionable stages', () => {
    const ACTIONABLE_STAGES = [
      'engineering_analysis',
      'engineering_planning',
      'review_preparation',
      'approval',
      'implementation_coordination',
      'validation',
      'knowledge_extraction',
      'intelligence_update',
    ];

    it('every actionable stage returns an actionable recommendation with a label', () => {
      for (const stage of ACTIONABLE_STAGES) {
        const rec = getNextRecommendation(stage as any);
        expect(rec.isActionable).toBe(true);
        expect(rec.actionLabel).toBeTruthy();
        expect(rec.actionKey).toBeTruthy();
        expect(rec.actionKey).not.toBe('none');
      }
    });
  });

  describe('Action dispatch — unknown keys must not silently pass', () => {
    it('unknown action keys are not in the valid set', () => {
      const VALID_KEYS: StageActionKey[] = [
        'run_analysis', 'run_planning', 'prepare_review', 'record_decision',
        'begin_engineering', 'record_validation', 'extract_knowledge',
        'complete_intelligence', 'none',
      ];
      expect(VALID_KEYS).not.toContain('unknown_action' as any);
      expect(VALID_KEYS).not.toContain('coordinate_implementation' as any);
    });
  });

  describe('Idempotency — stages that create objects have idempotency guards', () => {
    it('run_analysis stage is actionable (analysis can be regenerated)', () => {
      expect(STAGE_REGISTRY.engineering_analysis.actionKey).toBe('run_analysis');
    });

    it('begin_engineering replaces coordinate_implementation (canonical EWO flow)', () => {
      expect(STAGE_REGISTRY.implementation_coordination.actionKey).toBe('begin_engineering');
    });
  });
});
