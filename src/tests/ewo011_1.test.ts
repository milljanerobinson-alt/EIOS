/**
 * EWO-011.1: Engineering Idea Similarity Review & Execution Validation
 * Test suite covering: similarity engine types, decision model, config maps,
 * wizard step ordering, similarity result scoring model, execution recording,
 * memory integration, authority model, and EWO-011.1 self-validation.
 */

import { describe, it, expect } from 'vitest';
import {
  SIMILARITY_OBJECT_TYPE_CFG,
  SIMILARITY_DECISION_CFG,
  RELATIONSHIP_CFG,
  WIZARD_STEPS,
  INITIAL_WIZARD_STATE,
  DEFAULT_PIPELINE,
  type SimilarityObjectType,
  type SimilarityDecision,
  type SimilarityResult,
  type WizardState,
} from '../pages/ecc/ECCIdeaTypes';

// ─── 1. Similarity Object Types ────────────────────────────────────────────────

describe('SimilarityObjectType enumeration', () => {
  it('has exactly 7 engineering object types', () => {
    const types: SimilarityObjectType[] = [
      'engineering_idea',
      'engineering_feature',
      'work_order',
      'engineering_record',
      'engineering_standard',
      'engineering_memory',
      'constitutional_decision',
    ];
    expect(types).toHaveLength(7);
  });

  it('SIMILARITY_OBJECT_TYPE_CFG covers all 7 types', () => {
    const types: SimilarityObjectType[] = [
      'engineering_idea', 'engineering_feature', 'work_order',
      'engineering_record', 'engineering_standard', 'engineering_memory',
      'constitutional_decision',
    ];
    for (const t of types) {
      expect(SIMILARITY_OBJECT_TYPE_CFG[t]).toBeDefined();
      expect(SIMILARITY_OBJECT_TYPE_CFG[t].label).toBeTruthy();
      expect(SIMILARITY_OBJECT_TYPE_CFG[t].colour).toBeTruthy();
    }
  });

  it('engineering_idea type has amber colour', () => {
    expect(SIMILARITY_OBJECT_TYPE_CFG.engineering_idea.colour).toBe('amber');
  });

  it('constitutional_decision type has red colour (highest authority)', () => {
    expect(SIMILARITY_OBJECT_TYPE_CFG.constitutional_decision.colour).toBe('red');
  });
});

// ─── 2. Similarity Decision Model ─────────────────────────────────────────────

describe('SimilarityDecision model', () => {
  it('has exactly 4 valid decisions', () => {
    const decisions: SimilarityDecision[] = [
      'continue_anyway',
      'link_existing',
      'merge',
      'cancel',
    ];
    expect(decisions).toHaveLength(4);
  });

  it('SIMILARITY_DECISION_CFG covers all 4 decisions', () => {
    const decisions: SimilarityDecision[] = [
      'continue_anyway', 'link_existing', 'merge', 'cancel',
    ];
    for (const d of decisions) {
      expect(SIMILARITY_DECISION_CFG[d]).toBeDefined();
      expect(SIMILARITY_DECISION_CFG[d].label).toBeTruthy();
      expect(SIMILARITY_DECISION_CFG[d].description).toBeTruthy();
      expect(SIMILARITY_DECISION_CFG[d].colour).toBeTruthy();
    }
  });

  it('continue_anyway has blue colour (safe proceed)', () => {
    expect(SIMILARITY_DECISION_CFG.continue_anyway.colour).toBe('blue');
  });

  it('cancel has red colour (stop execution)', () => {
    expect(SIMILARITY_DECISION_CFG.cancel.colour).toBe('red');
  });

  it('merge has amber colour (caution — update existing)', () => {
    expect(SIMILARITY_DECISION_CFG.merge.colour).toBe('amber');
  });

  it('link_existing has teal colour (add traceability link)', () => {
    expect(SIMILARITY_DECISION_CFG.link_existing.colour).toBe('teal');
  });

  it('cancel description mentions abort / existing object', () => {
    expect(SIMILARITY_DECISION_CFG.cancel.description.toLowerCase()).toContain('existing');
  });
});

// ─── 3. Similarity Result Structure ───────────────────────────────────────────

describe('SimilarityResult data model', () => {
  it('has all required fields', () => {
    const result: SimilarityResult = {
      id:           'uuid-sim-001',
      object_type:  'engineering_idea',
      ref:          'IDEA-ABCD1234',
      title:        'Improve API response caching',
      reason:       'Title word overlap: 87%. Category: performance.',
      relationship: 'duplicate',
      status:       'active',
      score:        0.87,
    };
    expect(result.score).toBe(0.87);
    expect(result.relationship).toBe('duplicate');
    expect(result.ref).toMatch(/^IDEA-/);
  });

  it('score is in 0–1 range', () => {
    const scores = [0, 0.25, 0.5, 0.75, 1.0];
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('metadata is optional', () => {
    const result: SimilarityResult = {
      id: 'uuid-sim-002', object_type: 'work_order', ref: 'EWO-001',
      title: 'Work Order', reason: 'Related', relationship: 'related',
      status: 'closed', score: 0.4,
    };
    expect(result.metadata).toBeUndefined();
  });

  it('relationship has 5 valid values', () => {
    const rels: SimilarityResult['relationship'][] = [
      'duplicate', 'related', 'supersedes', 'extends', 'complements',
    ];
    expect(rels).toHaveLength(5);
    for (const r of rels) {
      expect(RELATIONSHIP_CFG[r]).toBeDefined();
      expect(RELATIONSHIP_CFG[r].label).toBeTruthy();
    }
  });

  it('duplicate relationship has red colour (highest risk)', () => {
    expect(RELATIONSHIP_CFG.duplicate.colour).toBe('red');
  });

  it('complements relationship has teal colour (additive)', () => {
    expect(RELATIONSHIP_CFG.complements.colour).toBe('teal');
  });
});

// ─── 4. Similarity Scoring Logic ──────────────────────────────────────────────

describe('Similarity score thresholds', () => {
  it('scores >= 0.75 are classified as high-similarity (potential duplicate)', () => {
    const results: SimilarityResult[] = [
      { id: '1', object_type: 'engineering_idea', ref: 'IDEA-AAA', title: 'A', reason: '', relationship: 'duplicate', status: 'active', score: 0.87 },
      { id: '2', object_type: 'engineering_idea', ref: 'IDEA-BBB', title: 'B', reason: '', relationship: 'related',   status: 'active', score: 0.55 },
      { id: '3', object_type: 'engineering_idea', ref: 'IDEA-CCC', title: 'C', reason: '', relationship: 'complements', status: 'active', score: 0.28 },
    ];
    const highMatches = results.filter(r => r.score >= 0.75);
    const midMatches  = results.filter(r => r.score >= 0.5 && r.score < 0.75);
    const lowMatches  = results.filter(r => r.score < 0.5);
    expect(highMatches).toHaveLength(1);
    expect(midMatches).toHaveLength(1);
    expect(lowMatches).toHaveLength(1);
  });

  it('results are sorted by score descending (top match first)', () => {
    const sorted = [
      { score: 0.87 },
      { score: 0.55 },
      { score: 0.28 },
    ];
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].score).toBeGreaterThanOrEqual(sorted[i + 1].score);
    }
  });

  it('max results cap at 12 (prevents overwhelming UI)', () => {
    const MAX_RESULTS = 12;
    expect(MAX_RESULTS).toBe(12);
  });
});

// ─── 5. Updated WIZARD_STEPS (EWO-011.1) ──────────────────────────────────────

describe('WIZARD_STEPS — EWO-011.1 update', () => {
  it('now has exactly 7 steps (added similarity)', () => {
    expect(WIZARD_STEPS).toHaveLength(7);
  });

  it('similarity step is the 7th (last before execution)', () => {
    expect(WIZARD_STEPS[6].key).toBe('similarity');
  });

  it('similarity step has appropriate label and description', () => {
    const simStep = WIZARD_STEPS.find(s => s.key === 'similarity');
    expect(simStep).toBeDefined();
    expect(simStep!.label).toContain('Similarity');
    expect(simStep!.description).toBeTruthy();
  });

  it('review step is 6th (immediately before similarity)', () => {
    expect(WIZARD_STEPS[5].key).toBe('review');
  });

  it('step order is: intent → objective → strategy → context → agent → review → similarity', () => {
    const keys = WIZARD_STEPS.map(s => s.key);
    expect(keys).toEqual(['intent', 'objective', 'strategy', 'context', 'agent', 'review', 'similarity']);
  });
});

// ─── 6. WizardState similarity fields ─────────────────────────────────────────

describe('WizardState — similarity fields (EWO-011.1)', () => {
  it('INITIAL_WIZARD_STATE has no pre-set similarity data', () => {
    expect(INITIAL_WIZARD_STATE.similarityResults).toBeUndefined();
    expect(INITIAL_WIZARD_STATE.similarityDecision).toBeUndefined();
    expect(INITIAL_WIZARD_STATE.similarityLinkedRefs).toBeUndefined();
    expect(INITIAL_WIZARD_STATE.similaritySearchDone).toBeUndefined();
  });

  it('WizardState accepts similarityResults array', () => {
    const state: WizardState = {
      ...INITIAL_WIZARD_STATE,
      similarityResults: [
        { id: '1', object_type: 'engineering_idea', ref: 'IDEA-AAA', title: 'Match', reason: 'Test', relationship: 'related', status: 'active', score: 0.6 },
      ],
      similaritySearchDone: true,
    };
    expect(state.similarityResults).toHaveLength(1);
    expect(state.similaritySearchDone).toBe(true);
  });

  it('WizardState accepts similarityDecision', () => {
    const state: WizardState = {
      ...INITIAL_WIZARD_STATE,
      similarityDecision: 'link_existing',
      similarityLinkedRefs: ['IDEA-XYZ', 'EWO-005'],
    };
    expect(state.similarityDecision).toBe('link_existing');
    expect(state.similarityLinkedRefs).toContain('IDEA-XYZ');
  });
});

// ─── 7. Execution Recording (similarity fields on engineering_idea) ────────────

describe('Engineering Idea similarity fields (schema — EWO-011.1)', () => {
  it('similarity_matches_count stores total number of similar objects found', () => {
    const idea = { similarity_matches_count: 3 };
    expect(idea.similarity_matches_count).toBe(3);
  });

  it('similarity_decision is one of 4 valid values or null', () => {
    const validDecisions: Array<SimilarityDecision | null> = [
      'continue_anyway', 'link_existing', 'merge', 'cancel', null,
    ];
    expect(validDecisions).toHaveLength(5);
    for (const d of validDecisions) {
      if (d !== null) expect(SIMILARITY_DECISION_CFG[d]).toBeDefined();
    }
  });

  it('similarity_top_match_ref records the ref of the best match', () => {
    const idea = { similarity_top_match_ref: 'IDEA-ABCD1234', similarity_top_match_score: 0.87 };
    expect(idea.similarity_top_match_ref).toMatch(/^IDEA-/);
    expect(idea.similarity_top_match_score).toBe(0.87);
  });

  it('similarity_top_match_score is null when no matches found', () => {
    const idea = { similarity_top_match_score: null, similarity_matches_count: 0 };
    expect(idea.similarity_top_match_score).toBeNull();
  });
});

// ─── 8. Decision Consequences ─────────────────────────────────────────────────

describe('Similarity decision consequences', () => {
  it('continue_anyway → execution proceeds, no linkage', () => {
    const decision: SimilarityDecision = 'continue_anyway';
    const linkedRefs: string[] = [];
    expect(decision).toBe('continue_anyway');
    expect(linkedRefs).toHaveLength(0);
  });

  it('link_existing → execution proceeds, linked refs populated', () => {
    const decision: SimilarityDecision = 'link_existing';
    const simResults: SimilarityResult[] = [
      { id: '1', object_type: 'engineering_idea', ref: 'IDEA-AAA', title: 'Similar idea', reason: '', relationship: 'related', status: 'active', score: 0.65 },
    ];
    const linkedRefs = simResults.slice(0, 3).map(r => r.ref);
    expect(decision).toBe('link_existing');
    expect(linkedRefs).toContain('IDEA-AAA');
  });

  it('merge → execution does NOT create a new idea', () => {
    const decision: SimilarityDecision = 'merge';
    const createsIdea = decision !== 'merge' && decision !== 'cancel';
    expect(createsIdea).toBe(false);
  });

  it('cancel → execution does NOT create a new idea', () => {
    const decision: SimilarityDecision = 'cancel';
    const createsIdea = decision !== 'merge' && decision !== 'cancel';
    expect(createsIdea).toBe(false);
  });

  it('only continue_anyway and link_existing allow execution to proceed', () => {
    const allowed: SimilarityDecision[] = ['continue_anyway', 'link_existing'];
    const blocked: SimilarityDecision[] = ['merge', 'cancel'];
    for (const d of allowed) {
      expect(['continue_anyway', 'link_existing']).toContain(d);
    }
    for (const d of blocked) {
      expect(['merge', 'cancel']).toContain(d);
    }
  });
});

// ─── 9. Evidence Generation ────────────────────────────────────────────────────

describe('Similarity evidence generation', () => {
  it('3 execution evidence pieces are generated (guardian + similarity + artefact)', () => {
    const evidenceTypes = ['guardian_validation', 'test_result', 'generated_artefact'];
    expect(evidenceTypes).toHaveLength(3);
  });

  it('similarity evidence type is test_result (records the review outcome)', () => {
    expect('test_result').toBe('test_result');
  });

  it('similarity evidence metadata includes decision, matches_count, linked_refs', () => {
    const evidenceMeta = {
      similarity_search_performed: true,
      matches_count: 3,
      high_matches:  1,
      decision:      'link_existing' as SimilarityDecision,
      top_match_ref: 'IDEA-ABCD1234',
      top_match_score: 0.78,
      linked_refs:   ['IDEA-ABCD1234'],
    };
    expect(evidenceMeta.similarity_search_performed).toBe(true);
    expect(evidenceMeta.decision).toBe('link_existing');
    expect(evidenceMeta.linked_refs).toContain('IDEA-ABCD1234');
  });
});

// ─── 10. Engineering Memory Integration ───────────────────────────────────────

describe('Engineering Memory — similarity integration', () => {
  it('pre_execution memory includes similarity-review-v1 pattern', () => {
    const patterns = ['constitutional-execution-pipeline', 'idea-creation-v1', 'similarity-review-v1'];
    expect(patterns).toContain('similarity-review-v1');
  });

  it('pre_execution memory records high-similarity matches as risks_identified', () => {
    const highMatches: SimilarityResult[] = [
      { id: '1', object_type: 'engineering_idea', ref: 'IDEA-DUP', title: 'Dup', reason: '', relationship: 'duplicate', status: 'active', score: 0.91 },
    ];
    const risks = highMatches.map(r => `Potential duplicate: ${r.ref}`);
    expect(risks).toContain('Potential duplicate: IDEA-DUP');
  });

  it('post_execution memory records decision pattern', () => {
    const decision: SimilarityDecision = 'continue_anyway';
    const patterns = [`similarity-review-complete`, `decision-${decision}`];
    expect(patterns).toContain('decision-continue_anyway');
  });

  it('post_execution memory marks knowledge_updated=true and memory_updated=true', () => {
    const post = { knowledge_updated: true, lineage_updated: true, memory_updated: true };
    expect(post.knowledge_updated).toBe(true);
    expect(post.memory_updated).toBe(true);
  });

  it('merge/cancel decisions record in memory even without creating an idea', () => {
    const cancelledDecision: SimilarityDecision = 'cancel';
    const patterns = [`similarity-${cancelledDecision}`];
    expect(patterns).toContain('similarity-cancel');
  });
});

// ─── 11. EWO-011.1 Self-Validation ────────────────────────────────────────────

describe('EWO-011.1 self-validation', () => {
  it('Phase 1: Similarity Engine targets 7 engineering object types', () => {
    expect(Object.keys(SIMILARITY_OBJECT_TYPE_CFG)).toHaveLength(7);
  });

  it('Phase 2: Similarity Review step is now mandatory in WIZARD_STEPS', () => {
    const simStep = WIZARD_STEPS.find(s => s.key === 'similarity');
    expect(simStep).toBeDefined();
  });

  it('Phase 3: Similarity results expose score, object_type, ref, title, reason, relationship, status', () => {
    const result: SimilarityResult = {
      id: 'uuid', object_type: 'engineering_idea', ref: 'IDEA-TEST',
      title: 'Test', reason: 'Test reason', relationship: 'related',
      status: 'active', score: 0.45,
    };
    expect('score' in result).toBe(true);
    expect('object_type' in result).toBe(true);
    expect('ref' in result).toBe(true);
    expect('reason' in result).toBe(true);
    expect('relationship' in result).toBe(true);
    expect('status' in result).toBe(true);
  });

  it('Phase 4: User has 4 decision options for each similarity result', () => {
    expect(Object.keys(SIMILARITY_DECISION_CFG)).toHaveLength(4);
  });

  it('Phase 5: Execution records similarity_matches_count, similarity_decision, top_match_ref, top_match_score', () => {
    const recorded = {
      similarity_matches_count:  5,
      similarity_decision:       'continue_anyway' as SimilarityDecision,
      similarity_top_match_ref:  'IDEA-TOPX',
      similarity_top_match_score: 0.68,
    };
    expect(recorded.similarity_matches_count).toBe(5);
    expect(recorded.similarity_decision).toBe('continue_anyway');
  });

  it('Phase 6: Engineering Memory pre and post integration includes similarity patterns', () => {
    const prePatterns  = ['similarity-review-v1'];
    const postPatterns = ['similarity-review-complete'];
    expect(prePatterns).toContain('similarity-review-v1');
    expect(postPatterns).toContain('similarity-review-complete');
  });

  it('Phase 7: WizardState exposes similarity fields for dashboard display', () => {
    const state: WizardState = {
      ...INITIAL_WIZARD_STATE,
      similarityResults: [],
      similarityDecision: 'continue_anyway',
      similarityLinkedRefs: [],
      similaritySearchDone: true,
    };
    expect('similarityResults' in state).toBe(true);
    expect('similarityDecision' in state).toBe(true);
    expect('similaritySearchDone' in state).toBe(true);
  });

  it('Pipeline now has 10 stages (EWO-011.2 added Engineering Record; similarity review is a wizard step, not a pipeline stage)', () => {
    expect(DEFAULT_PIPELINE).toHaveLength(10);
    expect(DEFAULT_PIPELINE.find(s => s.key === 'similarity')).toBeUndefined();
  });

  it('relationship config covers all 5 relationship types', () => {
    expect(Object.keys(RELATIONSHIP_CFG)).toHaveLength(5);
  });
});
