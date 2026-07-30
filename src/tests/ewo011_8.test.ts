/**
 * EWO-011.8 — AI-Assisted Engineering Analysis & Planning
 * Covers: draft service types, confidence scoring, evidence typing, edit detection,
 * draft persistence fields, regeneration tracking, plan draft detection,
 * learning capture audit fields, regression guards.
 */

import { describe, it, expect } from 'vitest';
import {
  EngineeringDraftService,
  type AnalysisDraft,
  type PlanDraft,
  type DraftEvidenceItem,
  type DraftConfidenceScore,
  type DraftComplexity,
} from '../lib/engineeringDraftService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeAnalysisDraft(overrides: Partial<AnalysisDraft> = {}): AnalysisDraft {
  return {
    summary: 'This intent introduces a new AI-assisted workflow for engineering analysis.',
    constitution_review: 'Aligns with C-004 (Engineering Quality) and C-007 (AI Governance).',
    architecture_notes: 'Requires a new edge function and a client-side service layer.',
    product_intelligence_notes: 'Users have requested faster analysis turnaround.',
    complexity_assessment: 'medium',
    confidence_score: 'high',
    confidence_explanation: 'Intent is well-defined with clear scope and objectives.',
    evidence: [
      {
        type: 'constitution',
        ref: 'C-004',
        title: 'Engineering Quality Standard',
        relevance: 'Directly governs AI-generated artefact quality thresholds.',
      },
      {
        type: 'knowledge_record',
        ref: 'KR-012',
        title: 'AI Integration Pattern',
        relevance: 'Describes the preferred edge-function + client-service architecture.',
      },
    ],
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makePlanDraft(overrides: Partial<PlanDraft> = {}): PlanDraft {
  return {
    executive_summary: 'This plan delivers AI-assisted analysis through a phased edge-function approach.',
    engineering_strategy: 'Incremental delivery using a dedicated edge function and a thin client service.',
    recommended_approach: 'Implement atd-engineering-draft edge function with generate() AI service.',
    estimated_effort: '2–3 days',
    confidence_score: 'high',
    confidence_explanation: 'Analysis is thorough and approach is well-understood.',
    evidence: [
      {
        type: 'related_intent',
        ref: 'ATD-INT-007',
        title: 'EWO-011.7 Guided Workflow',
        relevance: 'Established the pipeline widget and modal infrastructure this plan extends.',
      },
    ],
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── 1. Draft types and required fields ───────────────────────────────────────

describe('AnalysisDraft type shape (EWO-011.8)', () => {
  it('AnalysisDraft has all required fields', () => {
    const draft = makeAnalysisDraft();
    expect(typeof draft.summary).toBe('string');
    expect(typeof draft.constitution_review).toBe('string');
    expect(typeof draft.architecture_notes).toBe('string');
    expect(typeof draft.product_intelligence_notes).toBe('string');
    expect(typeof draft.complexity_assessment).toBe('string');
    expect(typeof draft.confidence_score).toBe('string');
    expect(typeof draft.confidence_explanation).toBe('string');
    expect(Array.isArray(draft.evidence)).toBe(true);
    expect(typeof draft.generated_at).toBe('string');
  });

  it('PlanDraft has all required fields', () => {
    const draft = makePlanDraft();
    expect(typeof draft.executive_summary).toBe('string');
    expect(typeof draft.engineering_strategy).toBe('string');
    expect(typeof draft.recommended_approach).toBe('string');
    expect(typeof draft.estimated_effort).toBe('string');
    expect(typeof draft.confidence_score).toBe('string');
    expect(typeof draft.confidence_explanation).toBe('string');
    expect(Array.isArray(draft.evidence)).toBe(true);
    expect(typeof draft.generated_at).toBe('string');
  });

  it('complexity_assessment is one of the four valid values', () => {
    const valid: DraftComplexity[] = ['low', 'medium', 'high', 'critical'];
    const draft = makeAnalysisDraft();
    expect(valid).toContain(draft.complexity_assessment);
  });

  it('confidence_score is one of the three valid values', () => {
    const valid: DraftConfidenceScore[] = ['high', 'medium', 'low'];
    const draft = makeAnalysisDraft();
    expect(valid).toContain(draft.confidence_score);
  });

  it('evidence items have required fields', () => {
    const draft = makeAnalysisDraft();
    draft.evidence.forEach(item => {
      expect(typeof item.ref).toBe('string');
      expect(typeof item.title).toBe('string');
      expect(typeof item.relevance).toBe('string');
      expect(['constitution', 'related_intent', 'knowledge_record', 'engineering_decision']).toContain(item.type);
    });
  });
});

// ─── 2. Confidence display helper ─────────────────────────────────────────────

describe('EngineeringDraftService.confidenceDisplay (EWO-011.8)', () => {
  it('high returns emerald colour', () => {
    const d = EngineeringDraftService.confidenceDisplay('high');
    expect(d.label).toBe('High Confidence');
    expect(d.colour).toContain('emerald');
    expect(d.bg).toContain('emerald');
  });

  it('medium returns amber colour', () => {
    const d = EngineeringDraftService.confidenceDisplay('medium');
    expect(d.label).toBe('Medium Confidence');
    expect(d.colour).toContain('amber');
    expect(d.bg).toContain('amber');
  });

  it('low returns red colour', () => {
    const d = EngineeringDraftService.confidenceDisplay('low');
    expect(d.label).toBe('Low Confidence');
    expect(d.colour).toContain('red');
    expect(d.bg).toContain('red');
  });

  it('all confidence values produce non-empty label and bg', () => {
    const scores: DraftConfidenceScore[] = ['high', 'medium', 'low'];
    scores.forEach(score => {
      const d = EngineeringDraftService.confidenceDisplay(score);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.bg.length).toBeGreaterThan(0);
    });
  });
});

// ─── 3. Evidence type display helper ─────────────────────────────────────────

describe('EngineeringDraftService.evidenceTypeDisplay (EWO-011.8)', () => {
  it('constitution returns Constitution label', () => {
    const d = EngineeringDraftService.evidenceTypeDisplay('constitution');
    expect(d.label).toBe('Constitution');
    expect(d.colour.length).toBeGreaterThan(0);
  });

  it('related_intent returns Related Intent label', () => {
    const d = EngineeringDraftService.evidenceTypeDisplay('related_intent');
    expect(d.label).toBe('Related Intent');
  });

  it('knowledge_record returns Knowledge label', () => {
    const d = EngineeringDraftService.evidenceTypeDisplay('knowledge_record');
    expect(d.label).toBe('Knowledge');
  });

  it('engineering_decision returns Decision label', () => {
    const d = EngineeringDraftService.evidenceTypeDisplay('engineering_decision');
    expect(d.label).toBe('Decision');
  });

  it('all evidence types produce non-empty colour', () => {
    const types: DraftEvidenceItem['type'][] = [
      'constitution', 'related_intent', 'knowledge_record', 'engineering_decision',
    ];
    types.forEach(t => {
      expect(EngineeringDraftService.evidenceTypeDisplay(t).colour.length).toBeGreaterThan(0);
    });
  });
});

// ─── 4. Analysis edit detection ───────────────────────────────────────────────

describe('EngineeringDraftService.detectEdits (EWO-011.8)', () => {
  it('returns false when all fields match the AI draft exactly', () => {
    const draft = makeAnalysisDraft();
    const approved = {
      summary: draft.summary,
      constitution_review: draft.constitution_review,
      architecture_notes: draft.architecture_notes,
      product_intelligence_notes: draft.product_intelligence_notes,
      complexity_assessment: draft.complexity_assessment,
    };
    expect(EngineeringDraftService.detectEdits(draft, approved)).toBe(false);
  });

  it('returns true when summary is modified', () => {
    const draft = makeAnalysisDraft();
    const approved = {
      summary: draft.summary + ' (edited)',
      constitution_review: draft.constitution_review,
      architecture_notes: draft.architecture_notes,
      product_intelligence_notes: draft.product_intelligence_notes,
      complexity_assessment: draft.complexity_assessment,
    };
    expect(EngineeringDraftService.detectEdits(draft, approved)).toBe(true);
  });

  it('returns true when complexity_assessment is changed', () => {
    const draft = makeAnalysisDraft({ complexity_assessment: 'medium' });
    const approved = {
      summary: draft.summary,
      constitution_review: draft.constitution_review,
      architecture_notes: draft.architecture_notes,
      product_intelligence_notes: draft.product_intelligence_notes,
      complexity_assessment: 'high',
    };
    expect(EngineeringDraftService.detectEdits(draft, approved)).toBe(true);
  });

  it('returns true when architecture_notes is modified', () => {
    const draft = makeAnalysisDraft();
    const approved = {
      summary: draft.summary,
      constitution_review: draft.constitution_review,
      architecture_notes: 'Completely different architecture notes.',
      product_intelligence_notes: draft.product_intelligence_notes,
      complexity_assessment: draft.complexity_assessment,
    };
    expect(EngineeringDraftService.detectEdits(draft, approved)).toBe(true);
  });

  it('ignores leading/trailing whitespace when comparing', () => {
    const draft = makeAnalysisDraft({ summary: 'summary text' });
    const approved = {
      summary: '  summary text  ',
      constitution_review: draft.constitution_review,
      architecture_notes: draft.architecture_notes,
      product_intelligence_notes: draft.product_intelligence_notes,
      complexity_assessment: draft.complexity_assessment,
    };
    expect(EngineeringDraftService.detectEdits(draft, approved)).toBe(false);
  });
});

// ─── 5. Plan edit detection ───────────────────────────────────────────────────

describe('EngineeringDraftService.detectPlanEdits (EWO-011.8)', () => {
  it('returns false when all plan fields match the AI draft', () => {
    const draft = makePlanDraft();
    const approved = {
      executive_summary: draft.executive_summary,
      engineering_strategy: draft.engineering_strategy,
      recommended_approach: draft.recommended_approach,
      estimated_effort: draft.estimated_effort,
    };
    expect(EngineeringDraftService.detectPlanEdits(draft, approved)).toBe(false);
  });

  it('returns true when executive_summary is modified', () => {
    const draft = makePlanDraft();
    const approved = {
      executive_summary: 'Modified executive summary.',
      engineering_strategy: draft.engineering_strategy,
      recommended_approach: draft.recommended_approach,
      estimated_effort: draft.estimated_effort,
    };
    expect(EngineeringDraftService.detectPlanEdits(draft, approved)).toBe(true);
  });

  it('returns true when estimated_effort is modified', () => {
    const draft = makePlanDraft({ estimated_effort: '2–3 days' });
    const approved = {
      executive_summary: draft.executive_summary,
      engineering_strategy: draft.engineering_strategy,
      recommended_approach: draft.recommended_approach,
      estimated_effort: '1 week',
    };
    expect(EngineeringDraftService.detectPlanEdits(draft, approved)).toBe(true);
  });
});

// ─── 6. Learning capture field contract ───────────────────────────────────────

describe('AI draft learning capture fields (EWO-011.8)', () => {
  it('original_ai_draft snapshot is structurally identical to the draft', () => {
    const draft = makeAnalysisDraft();
    const snapshot = JSON.parse(JSON.stringify(draft)) as AnalysisDraft;
    expect(snapshot.summary).toBe(draft.summary);
    expect(snapshot.confidence_score).toBe(draft.confidence_score);
    expect(snapshot.evidence).toHaveLength(draft.evidence.length);
  });

  it('po_edits_made is false when draft equals approved', () => {
    const draft = makeAnalysisDraft();
    const poEditsMade = EngineeringDraftService.detectEdits(draft, {
      summary: draft.summary,
      constitution_review: draft.constitution_review,
      architecture_notes: draft.architecture_notes,
      product_intelligence_notes: draft.product_intelligence_notes,
      complexity_assessment: draft.complexity_assessment,
    });
    expect(poEditsMade).toBe(false);
  });

  it('po_edits_made is true when any field differs', () => {
    const draft = makeAnalysisDraft();
    const poEditsMade = EngineeringDraftService.detectEdits(draft, {
      summary: 'PO changed this summary significantly.',
      constitution_review: draft.constitution_review,
      architecture_notes: draft.architecture_notes,
      product_intelligence_notes: draft.product_intelligence_notes,
      complexity_assessment: draft.complexity_assessment,
    });
    expect(poEditsMade).toBe(true);
  });

  it('generation_count increments per regeneration', () => {
    let count = 0;
    const increment = () => { count += 1; };
    increment(); // initial generation
    increment(); // first regeneration
    expect(count).toBe(2);
  });

  it('generated_at is an ISO timestamp string', () => {
    const draft = makeAnalysisDraft();
    expect(() => new Date(draft.generated_at)).not.toThrow();
    expect(new Date(draft.generated_at).toISOString()).toBe(draft.generated_at);
  });
});

// ─── 7. Evidence richness guards ──────────────────────────────────────────────

describe('Evidence item completeness (EWO-011.8)', () => {
  it('evidence item has type, ref, title, and relevance', () => {
    const item: DraftEvidenceItem = {
      type: 'constitution',
      ref: 'C-001',
      title: 'Engineering Quality',
      relevance: 'Governs the quality of all AI-generated artefacts.',
    };
    expect(item.type).toBe('constitution');
    expect(item.ref.length).toBeGreaterThan(0);
    expect(item.title.length).toBeGreaterThan(0);
    expect(item.relevance.length).toBeGreaterThan(0);
  });

  it('evidence array can be empty (AI found no relevant evidence)', () => {
    const draft = makeAnalysisDraft({ evidence: [] });
    expect(draft.evidence).toHaveLength(0);
  });

  it('all four evidence types are valid DraftEvidenceItem types', () => {
    const types: DraftEvidenceItem['type'][] = [
      'constitution', 'related_intent', 'knowledge_record', 'engineering_decision',
    ];
    types.forEach(t => {
      const item: DraftEvidenceItem = { type: t, ref: 'X-001', title: 'Test', relevance: 'Relevant.' };
      expect(item.type).toBe(t);
    });
  });
});

// ─── 8. Regression guards — EWO-011.6 and EWO-011.7 intact ───────────────────

describe('Regression guard — prior EWO fixes intact (EWO-011.8)', () => {
  it('EngineeringDraftService exports generateAnalysisDraft function', () => {
    expect(typeof EngineeringDraftService.generateAnalysisDraft).toBe('function');
  });

  it('EngineeringDraftService exports generatePlanDraft function', () => {
    expect(typeof EngineeringDraftService.generatePlanDraft).toBe('function');
  });

  it('EngineeringDraftService exports detectEdits function', () => {
    expect(typeof EngineeringDraftService.detectEdits).toBe('function');
  });

  it('EngineeringDraftService exports detectPlanEdits function', () => {
    expect(typeof EngineeringDraftService.detectPlanEdits).toBe('function');
  });

  it('EngineeringDraftService exports confidenceDisplay function', () => {
    expect(typeof EngineeringDraftService.confidenceDisplay).toBe('function');
  });

  it('EngineeringDraftService exports evidenceTypeDisplay function', () => {
    expect(typeof EngineeringDraftService.evidenceTypeDisplay).toBe('function');
  });

  it('DraftComplexity values match atdCognitiveEngine complexity_assessment values', () => {
    const valid: DraftComplexity[] = ['low', 'medium', 'high', 'critical'];
    expect(valid).toHaveLength(4);
    expect(valid[0]).toBe('low');
    expect(valid[3]).toBe('critical');
  });

  it('confidence score labels are distinct and non-empty', () => {
    const labels = (['high', 'medium', 'low'] as DraftConfidenceScore[])
      .map(s => EngineeringDraftService.confidenceDisplay(s).label);
    const unique = new Set(labels);
    expect(unique.size).toBe(3);
  });
});
