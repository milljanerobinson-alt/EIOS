import { describe, it, expect } from 'vitest';
import { InteractionChannelAdapter } from '../lib/interactionChannelAdapter';
import { InteractionResumeService } from '../lib/interactionResumeService';
import { InteractionPresentationFilter } from '../lib/interactionPresentationFilter';
import type { EngineeringProposal } from '../lib/proposalEngine';
import type { CompletionPackage } from '../lib/interactionCompletionService';
import type { ExecutionPreparationResult } from '../lib/interactionExecutionService';
import type { NextAction } from '../lib/interactionLifecycleService';

describe('EWO-033R.2: Interaction Channel Adapter', () => {
  it('exports InteractionChannelAdapter with processMessage and resumeInteraction', () => {
    expect(InteractionChannelAdapter).toBeDefined();
    expect(typeof InteractionChannelAdapter.processMessage).toBe('function');
    expect(typeof InteractionChannelAdapter.resumeInteraction).toBe('function');
  });

  it('exports InteractionResumeService with resumeInteraction', () => {
    expect(InteractionResumeService).toBeDefined();
    expect(typeof InteractionResumeService.resumeInteraction).toBe('function');
  });
});

describe('EWO-033R.2: Presentation Filter strips internal terminology', () => {
  const mockProposal: EngineeringProposal = {
    id: 'prop-uuid-123',
    proposalRef: 'PROP-ABC123',
    ideaId: 'idea-uuid-456',
    ideaRef: 'IDEA-XYZ789',
    ewoId: 'ewo-uuid-789',
    ewoRef: 'EWO-042',
    status: 'presented',
    version: 1,
    analysis: {
      summary: 'Add a new dashboard widget',
      approach: 'Incremental implementation',
      affectedComponents: ['dashboard', 'widgets'],
      architecturalNotes: 'No architectural impact',
      productIntelligenceNotes: 'Feature enhancement',
      constitutionalReview: 'Passed',
    },
    plan: {
      executiveSummary: 'Implement dashboard widget',
      engineeringStrategy: 'Incremental',
      recommendedApproach: 'Codex execution',
      estimatedEffort: '2-4 hours',
      filesAffected: [],
      testsRequired: ['Unit tests'],
    },
    scope: {
      inclusions: ['Dashboard widget'],
      exclusions: [],
      assumptions: ['EIOS context applies'],
    },
    risks: [{ description: 'Low risk', severity: 'low', mitigation: 'Standard testing' }],
    dependencies: [{ ref: 'EWO-001', type: 'work_order', description: 'Related work' }],
    similarityResults: [
      { id: '1', object_type: 'engineering_idea', ref: 'IDEA-002', title: 'Similar idea', reason: 'Related', relationship: 'related', status: 'active', score: 0.65 },
    ],
    acceptanceCriteria: ['Widget works', 'Tests pass'],
    constitutionalStatus: {
      guardianValidated: true,
      similarityReviewed: true,
      constitutionalValidationPassed: true,
      eligibilityChecked: false,
    },
    complexity: 'medium',
    impact: 'medium',
    refinementHistory: [],
  };

  it('filters proposal to remove all internal IDs and refs', () => {
    const filtered = InteractionPresentationFilter.filterProposal(mockProposal);
    const json = JSON.stringify(filtered);
    expect(json).not.toContain('PROP-ABC123');
    expect(json).not.toContain('IDEA-XYZ789');
    expect(json).not.toContain('EWO-042');
    expect(json).not.toContain('prop-uuid');
    expect(json).not.toContain('idea-uuid');
    expect(json).not.toContain('ewo-uuid');
  });

  it('filters proposal to use friendly labels for complexity and impact', () => {
    const filtered = InteractionPresentationFilter.filterProposal(mockProposal);
    expect(filtered.complexity).toBe('Medium');
    expect(filtered.impact).toBe('Medium');
  });

  it('synthesises a conversational recommendation from internal analysis', () => {
    const filtered = InteractionPresentationFilter.filterProposal(mockProposal);
    expect(filtered.recommendation).toBeDefined();
    expect(filtered.recommendation.length).toBeGreaterThan(10);
    expect(filtered.recommendation).toContain('recommend');
  });

  it('builds implementation overview from scope inclusions', () => {
    const filtered = InteractionPresentationFilter.filterProposal(mockProposal);
    expect(filtered.implementationOverview).toBeDefined();
    expect(filtered.implementationOverview.length).toBeGreaterThan(0);
    expect(filtered.implementationOverview).toContain('Dashboard widget');
  });

  it('recommendation mentions risks when severity is high', () => {
    const highRiskProposal: EngineeringProposal = {
      ...mockProposal,
      risks: [{ description: 'Critical risk', severity: 'high', mitigation: 'Mitigate' }],
    };
    const filtered = InteractionPresentationFilter.filterProposal(highRiskProposal);
    expect(filtered.recommendation).toContain('risks');
  });

  it('recommendation mentions related work when similarity score is high', () => {
    const highSimilarityProposal: EngineeringProposal = {
      ...mockProposal,
      similarityResults: [
        { id: '1', object_type: 'engineering_idea', ref: 'IDEA-002', title: 'Very similar idea', reason: 'Related', relationship: 'related', status: 'active', score: 0.85 },
      ],
    };
    const filtered = InteractionPresentationFilter.filterProposal(highSimilarityProposal);
    expect(filtered.recommendation).toContain('related');
  });

  it('does not expose mitigation text in risks (simplified format)', () => {
    const filtered = InteractionPresentationFilter.filterProposal(mockProposal);
    const json = JSON.stringify(filtered.risks);
    expect(json).not.toContain('Standard testing');
  });

  it('filters proposal to show similarity review without internal refs', () => {
    const filtered = InteractionPresentationFilter.filterProposal(mockProposal);
    expect(filtered.similarity.reviewed).toBe(true);
    expect(filtered.similarity.matchesFound).toBe(1);
    expect(filtered.similarity.topMatch?.title).toBe('Similar idea');
    expect(filtered.similarity.topMatch?.similarity).toBe('65%');
    const json = JSON.stringify(filtered.similarity);
    expect(json).not.toContain('IDEA-002');
  });

  it('filters execution ready to use friendly provider name', () => {
    const prep: ExecutionPreparationResult = {
      ready: true,
      ewoId: 'ewo-uuid',
      ewoRef: 'EWO-042',
      provider: 'codex',
      estimatedImpact: 'Generated',
      filesAffected: [],
      validation: ['All checks passed'],
      blockingReasons: [],
      lifecycleStage: 'awaiting_execution_approval',
    };
    const filtered = InteractionPresentationFilter.filterExecutionReady(prep);
    expect(filtered.provider).toBe('AI Engineering Agent');
    const json = JSON.stringify(filtered);
    expect(json).not.toContain('EWO-042');
    expect(json).not.toContain('ewo-uuid');
  });

  it('filters completion package to remove internal IDs', () => {
    const pkg: CompletionPackage = {
      executionId: 'exec-uuid-123',
      ewoId: 'ewo-uuid-789',
      ewoRef: 'EWO-042',
      summary: 'Implemented the widget',
      filesChanged: ['src/widget.tsx'],
      tests: [{ name: 'widget test', status: 'passed' }],
      validation: [{ check: 'lint', status: 'passed' }],
      deploymentRecommendation: 'Deploy to staging',
      poTestInstructions: ['Review files'],
      lifecycleStage: 'awaiting_acceptance',
    };
    const filtered = InteractionPresentationFilter.filterCompletion(pkg);
    expect(filtered.summary).toBe('Implemented the widget');
    const json = JSON.stringify(filtered);
    expect(json).not.toContain('exec-uuid');
    expect(json).not.toContain('EWO-042');
    expect(json).not.toContain('ewo-uuid');
  });

  it('filters next action to use friendly stage labels', () => {
    const action: NextAction = {
      currentStage: 'awaiting_proposal_approval',
      completedStages: ['idea_captured', 'preparing_proposal'],
      nextAction: 'Review the proposal',
      blockingReason: null,
      requiredPODecision: 'proposal_approval',
      supportingRecords: { ideaId: 'idea-uuid', ideaRef: 'IDEA-001' },
    };
    const filtered = InteractionPresentationFilter.filterNextAction(action);
    expect(filtered.currentStage).toBe('Awaiting Your Approval');
    expect(filtered.requiredDecision).toBe('Review Proposal');
    const json = JSON.stringify(filtered);
    expect(json).not.toContain('idea-uuid');
    expect(json).not.toContain('IDEA-001');
  });
});

describe('EWO-033R.2: Engineering Interaction Cards (smoke tests)', () => {
  it('ProposalCard component is exported', async () => {
    const mod = await import('../components/EngineeringInteractionCards');
    expect(mod.ProposalCard).toBeDefined();
    expect(mod.ExecutionReadyCard).toBeDefined();
    expect(mod.ExecutionProgressCard).toBeDefined();
    expect(mod.CompletionPackageCard).toBeDefined();
    expect(mod.ClosedCard).toBeDefined();
    expect(mod.BlockedCard).toBeDefined();
    expect(mod.PreparingCard).toBeDefined();
    expect(mod.ExecutionFailedCard).toBeDefined();
  });
});
