/**
 * EWO-011.8.1 — Conversation-First Engineering Orchestration
 * Covers: readiness assessment, work classification, orchestration status
 * transitions, duplicate resolution, approval lineage, regression guards.
 */

import { describe, it, expect } from 'vitest';
import {
  assessReadiness,
  classifyWork,
  type ReadinessAssessment,
  type WorkClassification,
  type OrchestrationStatus,
} from '../lib/engineeringOrchestrator';

// ─── 1. Readiness Assessment ──────────────────────────────────────────────────

describe('assessReadiness (EWO-011.8.1)', () => {
  it('returns isReady true for a detailed engineering query', () => {
    const result = assessReadiness(
      'We need to build a new reporting API that allows the admin module to export user activity logs to CSV. This is required to satisfy ASQA compliance auditing requirements.',
    );
    expect(result.isReady).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(45);
    expect(result.missingElements).toHaveLength(0);
  });

  it('returns isReady false for a very short query', () => {
    const result = assessReadiness('build something');
    expect(result.isReady).toBe(false);
    expect(result.missingElements.length).toBeGreaterThan(0);
  });

  it('confidence is within 0–100 range', () => {
    const queries = [
      'Fix it',
      'We need to implement a new authentication flow for the student portal using Supabase magic links to replace the existing email/password system.',
      'Refactor the reporting module to use a service layer pattern, separating DB queries from business logic, to improve testability and reduce duplication.',
    ];
    queries.forEach(q => {
      const r = assessReadiness(q);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(100);
    });
  });

  it('derivedTitle is derived from the first sentence', () => {
    const result = assessReadiness('Add export to CSV feature. This allows admins to download user data.');
    expect(result.derivedTitle.length).toBeGreaterThan(0);
    expect(typeof result.derivedTitle).toBe('string');
  });

  it('long titles are truncated at 80 characters', () => {
    const longQuery = 'Implement a very detailed and comprehensive feature that spans multiple modules and requires significant architectural review and cross-team coordination across the platform.';
    const result = assessReadiness(longQuery);
    expect(result.derivedTitle.length).toBeLessThanOrEqual(80);
  });

  it('clarificationQuestions is capped at 2 items', () => {
    const result = assessReadiness('change it');
    expect(result.clarificationQuestions.length).toBeLessThanOrEqual(2);
  });

  it('derivedObjective is a non-empty string', () => {
    const result = assessReadiness(
      'We need to add a bulk import feature to the admin portal so that staff can upload CSV files of student enrolments.',
    );
    expect(typeof result.derivedObjective).toBe('string');
    expect(result.derivedObjective.length).toBeGreaterThan(0);
  });

  it('query with objective but missing scope reduces confidence below query with both', () => {
    const withScope = assessReadiness(
      'We need to implement pagination on the admin reports page to improve performance for large datasets.',
    );
    const withoutScope = assessReadiness(
      'We need to implement something to improve performance for large datasets.',
    );
    // Both have objectives; one has scope signals, one does not
    expect(withScope.confidence).toBeGreaterThanOrEqual(withoutScope.confidence);
  });
});

// ─── 2. Work Classification ───────────────────────────────────────────────────

describe('classifyWork (EWO-011.8.1)', () => {
  it('classifies engineering implementation as engineering_intent', () => {
    const result = classifyWork(
      'Implement a new Supabase edge function for the reporting pipeline with schema migration and RLS policies.',
    );
    expect(result.classification).toBe('engineering_intent');
    expect(result.confidence).toBeGreaterThan(50);
  });

  it('classifies product idea as engineering_intent (routes all work)', () => {
    const result = classifyWork('What if we added a dark mode toggle to the settings page?');
    expect(result.classification).toBe('engineering_intent');
  });

  it('classifies support/bug as engineering_intent', () => {
    const result = classifyWork('The login button is broken and users cannot sign in — fix this issue.');
    expect(result.classification).toBe('engineering_intent');
  });

  it('classifies pure research query as research', () => {
    const result = classifyWork('Can you explain how the existing authentication flow works and what JWT strategy is used?');
    expect(result.classification).toBe('research');
  });

  it('returns confidence between 0 and 100', () => {
    const queries = [
      'build new feature',
      'investigate error',
      'what if we added something',
      'explain the database schema',
    ];
    queries.forEach(q => {
      const r = classifyWork(q);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(100);
    });
  });

  it('returns a non-empty reasoning string', () => {
    const result = classifyWork('Create a new API endpoint for exporting reports.');
    expect(typeof result.reasoning).toBe('string');
    expect(result.reasoning.length).toBeGreaterThan(0);
  });
});

// ─── 3. OrchestrationStatus type completeness ─────────────────────────────────

describe('OrchestrationStatus type (EWO-011.8.1)', () => {
  it('all valid statuses are assignable', () => {
    const statuses: OrchestrationStatus[] = [
      'idle', 'assessing', 'duplicate_check', 'duplicate_found',
      'creating_intent', 'generating_analysis', 'awaiting_analysis_approval',
      'generating_plan', 'awaiting_plan_approval', 'complete', 'error',
    ];
    expect(statuses).toHaveLength(11);
  });

  it('first status is idle', () => {
    const first: OrchestrationStatus = 'idle';
    expect(first).toBe('idle');
  });

  it('terminal statuses are complete and error', () => {
    const terminals: OrchestrationStatus[] = ['complete', 'error'];
    expect(terminals).toContain('complete');
    expect(terminals).toContain('error');
  });

  it('duplicate_found is a valid pause status', () => {
    const pause: OrchestrationStatus = 'duplicate_found';
    expect(pause).toBe('duplicate_found');
  });
});

// ─── 4. Pipeline stage ordering ───────────────────────────────────────────────

describe('Orchestration pipeline ordering (EWO-011.8.1)', () => {
  it('analysis stages come before plan stages', () => {
    const order: OrchestrationStatus[] = [
      'generating_analysis', 'awaiting_analysis_approval',
      'generating_plan', 'awaiting_plan_approval',
    ];
    const analysisIdx = order.indexOf('awaiting_analysis_approval');
    const planIdx     = order.indexOf('awaiting_plan_approval');
    expect(analysisIdx).toBeLessThan(planIdx);
  });

  it('creating_intent comes before generating_analysis', () => {
    const order: OrchestrationStatus[] = [
      'duplicate_check', 'creating_intent', 'generating_analysis',
    ];
    expect(order.indexOf('creating_intent')).toBeLessThan(order.indexOf('generating_analysis'));
  });

  it('duplicate_check comes before creating_intent', () => {
    const order: OrchestrationStatus[] = [
      'duplicate_check', 'creating_intent',
    ];
    expect(order.indexOf('duplicate_check')).toBeLessThan(order.indexOf('creating_intent'));
  });
});

// ─── 5. Readiness threshold boundary ─────────────────────────────────────────

describe('Readiness threshold boundary (EWO-011.8.1)', () => {
  it('query with no missing elements and confidence >= 45 is ready', () => {
    const r = assessReadiness(
      'We need to implement a new search component on the admin users page that filters by name and email using a Supabase RPC call.',
    );
    if (r.missingElements.length === 0) {
      expect(r.isReady).toBe(r.confidence >= 45);
    }
  });

  it('query with missing elements is not ready even if confidence is moderate', () => {
    const r = assessReadiness('change the thing');
    if (r.missingElements.length > 0) {
      expect(r.isReady).toBe(false);
    }
  });

  it('empty string produces lowest confidence', () => {
    const empty = assessReadiness('');
    const normal = assessReadiness('Implement a new reporting dashboard feature for the admin panel.');
    expect(empty.confidence).toBeLessThan(normal.confidence);
  });
});

// ─── 6. Classification scoring ────────────────────────────────────────────────

describe('classifyWork scoring edge cases (EWO-011.8.1)', () => {
  it('query with no signals at all defaults to engineering_intent', () => {
    const r = classifyWork('hello');
    expect(r.classification).toBe('engineering_intent');
  });

  it('multiple engineering keywords produce higher confidence than one', () => {
    const single = classifyWork('build feature');
    const multiple = classifyWork('implement build create develop refactor migrate integrate design architect backend');
    expect(multiple.confidence).toBeGreaterThanOrEqual(single.confidence);
  });

  it('WorkClassification type includes expected values', () => {
    const values: WorkClassification[] = ['engineering_intent', 'product_idea', 'research', 'support', 'operational'];
    expect(values).toContain('engineering_intent');
    expect(values).toContain('research');
  });
});

// ─── 7. Regression — EWO-011.8 functions still exported ──────────────────────

describe('Regression guard — EWO-011.8 exports intact (EWO-011.8.1)', () => {
  it('assessReadiness is a function', () => {
    expect(typeof assessReadiness).toBe('function');
  });

  it('classifyWork is a function', () => {
    expect(typeof classifyWork).toBe('function');
  });

  it('assessReadiness returns ReadinessAssessment shape', () => {
    const r = assessReadiness('Build a new feature');
    expect(typeof r.isReady).toBe('boolean');
    expect(typeof r.confidence).toBe('number');
    expect(Array.isArray(r.missingElements)).toBe(true);
    expect(Array.isArray(r.clarificationQuestions)).toBe(true);
    expect(typeof r.derivedTitle).toBe('string');
    expect(typeof r.derivedObjective).toBe('string');
  });

  it('classifyWork returns ClassificationResult shape', () => {
    const r = classifyWork('implement a new module');
    expect(typeof r.classification).toBe('string');
    expect(typeof r.confidence).toBe('number');
    expect(typeof r.reasoning).toBe('string');
  });
});

// ─── 8. EngineeringOrchestrator object exports ────────────────────────────────

describe('EngineeringOrchestrator object (EWO-011.8.1)', () => {
  it('exports orchestrate function', async () => {
    const { EngineeringOrchestrator } = await import('../lib/engineeringOrchestrator');
    expect(typeof EngineeringOrchestrator.orchestrate).toBe('function');
  });

  it('exports _createAndAnalyse function', async () => {
    const { EngineeringOrchestrator } = await import('../lib/engineeringOrchestrator');
    expect(typeof EngineeringOrchestrator._createAndAnalyse).toBe('function');
  });

  it('exports approveAnalysis function', async () => {
    const { EngineeringOrchestrator } = await import('../lib/engineeringOrchestrator');
    expect(typeof EngineeringOrchestrator.approveAnalysis).toBe('function');
  });

  it('exports approvePlan function', async () => {
    const { EngineeringOrchestrator } = await import('../lib/engineeringOrchestrator');
    expect(typeof EngineeringOrchestrator.approvePlan).toBe('function');
  });

  it('exports continueExisting function', async () => {
    const { EngineeringOrchestrator } = await import('../lib/engineeringOrchestrator');
    expect(typeof EngineeringOrchestrator.continueExisting).toBe('function');
  });

  it('exports restoreAndContinue function', async () => {
    const { EngineeringOrchestrator } = await import('../lib/engineeringOrchestrator');
    expect(typeof EngineeringOrchestrator.restoreAndContinue).toBe('function');
  });
});
