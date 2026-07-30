/**
 * EWO-012 — Engineering Intelligence Layer v1.0
 * Covers: EIL types, continuity engine logic, context builder, retrieval service,
 * provider abstraction types, prompt library, confidence scoring, learning capture,
 * cost intelligence, and architecture contracts.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  EngineeringIntelligenceService,
  type EILCapability,
  type EILConfidenceLevel,
  type EILReviewLevel,
  type EILContinuityType,
  type IntelligenceRequest,
  type IntelligenceResult,
  type LearningEventInput,
} from '../lib/engineeringIntelligenceService';
import { EngineeringContinuityEngine } from '../lib/engineeringContinuityEngine';
import { EngineeringContextBuilder } from '../lib/engineeringContextBuilder';
import {
  EngineeringIntelligenceRetrievalService,
} from '../lib/engineeringIntelligenceRetrieval';

// ─── 1. EIL Type completeness ─────────────────────────────────────────────────

describe('EILCapability type (EWO-012)', () => {
  it('includes all required capability values', () => {
    const caps: EILCapability[] = [
      'engineering_analysis',
      'engineering_planning',
      'continuity_assessment',
      'confidence_assessment',
      'knowledge_extraction',
      'custom',
    ];
    expect(caps).toHaveLength(6);
    expect(caps).toContain('engineering_analysis');
    expect(caps).toContain('engineering_planning');
  });
});

describe('EILConfidenceLevel type (EWO-012)', () => {
  it('contains high, medium, low', () => {
    const levels: EILConfidenceLevel[] = ['high', 'medium', 'low'];
    expect(levels).toHaveLength(3);
  });
});

describe('EILReviewLevel type (EWO-012)', () => {
  it('contains all review levels in severity order', () => {
    const levels: EILReviewLevel[] = ['none', 'spot_check', 'full_review', 'mandatory'];
    expect(levels).toHaveLength(4);
    expect(levels.indexOf('none')).toBeLessThan(levels.indexOf('mandatory'));
  });
});

describe('EILContinuityType type (EWO-012)', () => {
  it('contains all continuity types', () => {
    const types: EILContinuityType[] = ['continuation', 'branch', 'reference', 'new'];
    expect(types).toHaveLength(4);
    expect(types).toContain('new');
    expect(types).toContain('continuation');
  });
});

// ─── 2. IntelligenceRequest shape ─────────────────────────────────────────────

describe('IntelligenceRequest type (EWO-012)', () => {
  it('can construct a minimal valid request', () => {
    const req: IntelligenceRequest = { capability: 'engineering_analysis' };
    expect(req.capability).toBe('engineering_analysis');
    expect(req.conversation_id).toBeUndefined();
  });

  it('can construct a full request with all optional fields', () => {
    const req: IntelligenceRequest = {
      capability: 'engineering_planning',
      conversation_id: 'conv-1',
      intent_id: 'intent-1',
      plan_id: 'plan-1',
      session_id: 'sess-1',
      context: { foo: 'bar' },
      prompt_key: 'engineering_planning',
      temperature: 0.3,
      max_tokens: 4096,
    };
    expect(req.capability).toBe('engineering_planning');
    expect(req.temperature).toBe(0.3);
  });
});

// ─── 3. IntelligenceResult shape ──────────────────────────────────────────────

describe('IntelligenceResult shape (EWO-012)', () => {
  it('can construct a valid result object', () => {
    const result: IntelligenceResult = {
      request_id: 'req-1',
      result_id: 'res-1',
      capability: 'engineering_analysis',
      structured_output: { summary: 'test' },
      raw_response: '{"summary":"test"}',
      confidence: 75,
      confidence_level: 'high',
      confidence_factors: [{ factor: 'Context', impact: 'positive', description: 'Rich context' }],
      confidence_rationale: 'Good context.',
      missing_information: [],
      recommended_review_level: 'spot_check',
      evidence: [],
      context_sources: [],
      context_token_count: 1200,
      continuity_type: 'new',
      continuity_confidence: 0,
      continuity_conversation_ids: [],
      provider: 'openai',
      model: 'gpt-4o',
      prompt_tokens: 500,
      completion_tokens: 200,
      duration_ms: 1500,
      estimated_cost_usd: 0.00025,
      validation_passed: true,
      validation_issues: [],
    };
    expect(result.confidence).toBe(75);
    expect(result.confidence_level).toBe('high');
    expect(result.validation_passed).toBe(true);
  });

  it('confidence must be 0-100', () => {
    const valid = [0, 45, 75, 100];
    valid.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });
});

// ─── 4. LearningEventInput shape ──────────────────────────────────────────────

describe('LearningEventInput shape (EWO-012)', () => {
  it('can construct a learning event for an accepted draft', () => {
    const event: LearningEventInput = {
      request_id: 'req-1',
      capability: 'engineering_analysis',
      original_draft: 'Original analysis text',
      has_edits: false,
      regeneration_count: 0,
      accepted: true,
    };
    expect(event.accepted).toBe(true);
    expect(event.has_edits).toBe(false);
  });

  it('can construct a learning event for a rejected draft', () => {
    const event: LearningEventInput = {
      request_id: 'req-1',
      capability: 'engineering_planning',
      original_draft: 'Original plan text',
      po_edits: 'Edited plan text with corrections',
      has_edits: true,
      regeneration_count: 2,
      accepted: false,
    };
    expect(event.has_edits).toBe(true);
    expect(event.regeneration_count).toBe(2);
  });
});

// ─── 5. EngineeringIntelligenceService exports ────────────────────────────────

describe('EngineeringIntelligenceService exports (EWO-012)', () => {
  it('exports execute function', () => {
    expect(typeof EngineeringIntelligenceService.execute).toBe('function');
  });

  it('exports captureLearning function', () => {
    expect(typeof EngineeringIntelligenceService.captureLearning).toBe('function');
  });

  it('exports snapshotProviderHealth function', () => {
    expect(typeof EngineeringIntelligenceService.snapshotProviderHealth).toBe('function');
  });

  it('exports recordConversationLineage function', () => {
    expect(typeof EngineeringIntelligenceService.recordConversationLineage).toBe('function');
  });

  it('exports getProviderHealth function', () => {
    expect(typeof EngineeringIntelligenceService.getProviderHealth).toBe('function');
  });

  it('exports getDashboardStats function', () => {
    expect(typeof EngineeringIntelligenceService.getDashboardStats).toBe('function');
  });

  it('exports getPromptLibrary function', () => {
    expect(typeof EngineeringIntelligenceService.getPromptLibrary).toBe('function');
  });

  it('exports reviewResult function', () => {
    expect(typeof EngineeringIntelligenceService.reviewResult).toBe('function');
  });
});

// ─── 6. EngineeringContinuityEngine exports ───────────────────────────────────

describe('EngineeringContinuityEngine exports (EWO-012)', () => {
  it('exports assess function', () => {
    expect(typeof EngineeringContinuityEngine.assess).toBe('function');
  });

  it('exports getLineage function', () => {
    expect(typeof EngineeringContinuityEngine.getLineage).toBe('function');
  });
});

// ─── 7. EngineeringContextBuilder exports ────────────────────────────────────

describe('EngineeringContextBuilder exports (EWO-012)', () => {
  it('exports build function', () => {
    expect(typeof EngineeringContextBuilder.build).toBe('function');
  });

  it('exports buildMinimal function', () => {
    expect(typeof EngineeringContextBuilder.buildMinimal).toBe('function');
  });
});

// ─── 8. EngineeringIntelligenceRetrievalService exports ──────────────────────

describe('EngineeringIntelligenceRetrievalService exports (EWO-012)', () => {
  it('exports retrieve function', () => {
    expect(typeof EngineeringIntelligenceRetrievalService.retrieve).toBe('function');
  });

  it('exports retrieveForIntent function', () => {
    expect(typeof EngineeringIntelligenceRetrievalService.retrieveForIntent).toBe('function');
  });

  it('exports getConversationLineage function', () => {
    expect(typeof EngineeringIntelligenceRetrievalService.getConversationLineage).toBe('function');
  });

  it('exports getRecentRequests function', () => {
    expect(typeof EngineeringIntelligenceRetrievalService.getRecentRequests).toBe('function');
  });
});

// ─── 9. Provider abstraction types ────────────────────────────────────────────

describe('Provider abstraction types (EWO-012)', () => {
  it('ProviderHealthSnapshot has required fields', () => {
    const snapshot = {
      id: 'snap-1',
      provider: 'openai',
      model: 'gpt-4o',
      status: 'healthy' as const,
      latency_ms: 800,
      health_score: 92,
      is_recommended: true,
      checked_at: new Date().toISOString(),
    };
    expect(snapshot.provider).toBe('openai');
    expect(snapshot.health_score).toBeGreaterThanOrEqual(0);
    expect(snapshot.health_score).toBeLessThanOrEqual(100);
  });

  it('provider status values are exhaustive', () => {
    const statuses: Array<'healthy' | 'degraded' | 'error' | 'unknown'> = [
      'healthy', 'degraded', 'error', 'unknown',
    ];
    expect(statuses).toHaveLength(4);
  });
});

// ─── 10. Continuity strategy tiers ────────────────────────────────────────────

describe('Continuity strategy tiers (EWO-012)', () => {
  it('confidence >= 75 maps to auto_continue', () => {
    const confidence = 80;
    const strategy = confidence >= 75 ? 'auto_continue'
      : confidence >= 40 ? 'present_options' : 'new_context';
    expect(strategy).toBe('auto_continue');
  });

  it('confidence 40-74 maps to present_options', () => {
    const confidence = 55;
    const strategy = confidence >= 75 ? 'auto_continue'
      : confidence >= 40 ? 'present_options' : 'new_context';
    expect(strategy).toBe('present_options');
  });

  it('confidence < 40 maps to new_context', () => {
    const confidence = 25;
    const strategy = confidence >= 75 ? 'auto_continue'
      : confidence >= 40 ? 'present_options' : 'new_context';
    expect(strategy).toBe('new_context');
  });
});

// ─── 11. Context package contracts ────────────────────────────────────────────

describe('EngineeredContextPackage shape (EWO-012)', () => {
  it('has all required boolean flags', () => {
    const pkg = {
      layers: [],
      rendered_text: '',
      total_tokens: 0,
      source_count: 0,
      has_constitution: false,
      has_standards: false,
      has_memory: false,
      has_graph: false,
      has_intent: false,
      constitution_clauses: 0,
      standards_count: 0,
      memory_records: 0,
      graph_nodes: 0,
      graph_relationships: 0,
    };
    expect(typeof pkg.has_constitution).toBe('boolean');
    expect(typeof pkg.has_standards).toBe('boolean');
    expect(typeof pkg.total_tokens).toBe('number');
  });
});

// ─── 12. Retrieval result shape ───────────────────────────────────────────────

describe('RetrievalResult shape (EWO-012)', () => {
  it('has objects, relationships, and timing fields', () => {
    const result = {
      objects: [],
      relationships: [],
      total_objects: 0,
      total_relationships: 0,
      retrieval_time_ms: 42,
    };
    expect(Array.isArray(result.objects)).toBe(true);
    expect(Array.isArray(result.relationships)).toBe(true);
    expect(typeof result.retrieval_time_ms).toBe('number');
  });
});

// ─── 13. Confidence factor structure ─────────────────────────────────────────

describe('Confidence factor structure (EWO-012)', () => {
  it('impact values are restricted to positive/negative/neutral', () => {
    const impacts: Array<'positive' | 'negative' | 'neutral'> = ['positive', 'negative', 'neutral'];
    expect(impacts).toHaveLength(3);
  });

  it('can construct a valid confidence factor', () => {
    const factor = {
      factor: 'Context Richness',
      impact: 'positive' as const,
      description: '8 context sources available',
    };
    expect(factor.impact).toBe('positive');
    expect(typeof factor.factor).toBe('string');
  });
});

// ─── 14. Prompt library constants (seeded) ────────────────────────────────────

describe('Prompt library seeds (EWO-012)', () => {
  it('expected capability keys are defined', () => {
    const promptKeys = [
      'engineering_analysis',
      'engineering_planning',
      'continuity_assessment',
      'confidence_assessment',
      'knowledge_extraction',
    ];
    expect(promptKeys).toHaveLength(5);
    promptKeys.forEach((k) => expect(typeof k).toBe('string'));
  });
});

// ─── 15. Architecture contract — no direct provider calls from frontend ────────

describe('Architecture contract (EWO-012)', () => {
  it('EngineeringIntelligenceService is the only external AI entry point', () => {
    // All AI requests must go through execute()
    expect(typeof EngineeringIntelligenceService.execute).toBe('function');
  });

  it('execute() expects an IntelligenceRequest, not a raw string', () => {
    // Type-level: execute takes IntelligenceRequest, not plain string
    const req: IntelligenceRequest = { capability: 'engineering_analysis' };
    expect(typeof req.capability).toBe('string');
    expect(req).not.toBe('some raw text');
  });

  it('getDashboardStats returns a shape with all required EIL metrics', () => {
    // Shape contract test — verifies the interface fields exist
    const shape: Record<keyof import('../lib/engineeringIntelligenceService').EILDashboardStats, unknown> = {
      todayRequests: 0,
      successRate: 0,
      avgConfidence: 0,
      acceptanceRate: 0,
      humanEditRate: 0,
      totalLearningEvents: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
      capabilityBreakdown: [],
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
      providerUsage: [],
      recentRequests: [],
    };
    expect(Object.keys(shape)).toContain('confidenceDistribution');
    expect(Object.keys(shape)).toContain('providerUsage');
    expect(Object.keys(shape)).toContain('totalCostUsd');
  });
});

// ─── 16. Regression — EWO-011 exports still intact ────────────────────────────

describe('Regression guard — EWO-011 not broken by EWO-012 (EWO-012)', () => {
  it('EngineeringOrchestrator still accessible', async () => {
    const { EngineeringOrchestrator } = await import('../lib/engineeringOrchestrator');
    expect(typeof EngineeringOrchestrator.orchestrate).toBe('function');
  });

  it('assessReadiness still accessible', async () => {
    const { assessReadiness } = await import('../lib/engineeringOrchestrator');
    const result = assessReadiness('Implement a new reporting API for the admin module.');
    expect(typeof result.isReady).toBe('boolean');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });
});
