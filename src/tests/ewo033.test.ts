import { describe, it, expect } from 'vitest';
import { InteractionPresentationFilter } from '../lib/interactionPresentationFilter';
import { InteractionLifecycleService } from '../lib/interactionLifecycleService';
import type { EngineeringProposal } from '../lib/proposalEngine';
import type { NextAction } from '../lib/interactionLifecycleService';
import type { CompletionPackage } from '../lib/interactionCompletionService';
import type { ExecutionPreparationResult } from '../lib/interactionExecutionService';

describe('EWO-033: Constitutional Engine', () => {
  it('exports ConstitutionalEngine with executePipeline, runSimilarityReview, and validateConstitutional', async () => {
    const mod = await import('../lib/constitutionalEngine');
    expect(mod.ConstitutionalEngine).toBeDefined();
    expect(typeof mod.ConstitutionalEngine.executePipeline).toBe('function');
    expect(typeof mod.ConstitutionalEngine.runSimilarityReview).toBe('function');
    expect(typeof mod.ConstitutionalEngine.validateConstitutional).toBe('function');
  });

  it('exports the correct types', async () => {
    const mod = await import('../lib/constitutionalEngine');
    expect(mod.ConstitutionalPipelineRequest).toBeUndefined(); // type-only export
  });
});

describe('EWO-033: Interaction Lifecycle Service', () => {
  it('exports InteractionLifecycleService with resolveNextAction, recordDecision, migrateExistingIdeas', () => {
    expect(InteractionLifecycleService).toBeDefined();
    expect(typeof InteractionLifecycleService.resolveNextAction).toBe('function');
    expect(typeof InteractionLifecycleService.recordDecision).toBe('function');
    expect(typeof InteractionLifecycleService.migrateExistingIdeas).toBe('function');
  });

  it('resolveFromProposal maps proposal statuses correctly', () => {
    const idea = { id: 'idea-1', idea_ref: 'IDEA-001', session_id: null };
    const proposal = { id: 'prop-1', proposal_ref: 'PROP-001', status: 'presented', ewo_id: null };
    const result = InteractionLifecycleService.resolveFromProposal(idea, proposal);
    expect(result.currentStage).toBe('awaiting_proposal_approval');
    expect(result.requiredPODecision).toBe('proposal_approval');
  });

  it('resolveFromProposal maps approved proposal to preparing_execution', () => {
    const idea = { id: 'idea-1', idea_ref: 'IDEA-001', session_id: null };
    const proposal = { id: 'prop-1', proposal_ref: 'PROP-001', status: 'approved', ewo_id: 'ewo-1' };
    const result = InteractionLifecycleService.resolveFromProposal(idea, proposal);
    expect(result.currentStage).toBe('preparing_execution');
    expect(result.requiredPODecision).toBeNull();
  });

  it('resolveFromProposal maps rejected proposal to archived', () => {
    const idea = { id: 'idea-1', idea_ref: 'IDEA-001', session_id: null };
    const proposal = { id: 'prop-1', proposal_ref: 'PROP-001', status: 'rejected', ewo_id: null };
    const result = InteractionLifecycleService.resolveFromProposal(idea, proposal);
    expect(result.currentStage).toBe('archived');
  });
});

describe('EWO-033: Proposal Engine', () => {
  it('exports ProposalEngine with generateProposal, loadProposal, recordProposalDecision', async () => {
    const mod = await import('../lib/proposalEngine');
    expect(mod.ProposalEngine).toBeDefined();
    expect(typeof mod.ProposalEngine.generateProposal).toBe('function');
    expect(typeof mod.ProposalEngine.loadProposal).toBe('function');
    expect(typeof mod.ProposalEngine.recordProposalDecision).toBe('function');
  });
});

describe('EWO-033: Proposal Refinement Service', () => {
  it('exports ProposalRefinementService with refineProposal', async () => {
    const mod = await import('../lib/proposalRefinementService');
    expect(mod.ProposalRefinementService).toBeDefined();
    expect(typeof mod.ProposalRefinementService.refineProposal).toBe('function');
  });
});

describe('EWO-033: Interaction Execution Service', () => {
  it('exports InteractionExecutionService with prepareExecution and launchExecution', async () => {
    const mod = await import('../lib/interactionExecutionService');
    expect(mod.InteractionExecutionService).toBeDefined();
    expect(typeof mod.InteractionExecutionService.prepareExecution).toBe('function');
    expect(typeof mod.InteractionExecutionService.launchExecution).toBe('function');
  });

  it('defines the correct execution progress stages', async () => {
    const mod = await import('../lib/interactionExecutionService');
    expect(mod.EXECUTION_PROGRESS_STAGES).toHaveLength(6);
    expect(mod.EXECUTION_PROGRESS_STAGES[0].stage).toBe('preparing_context');
    expect(mod.EXECUTION_PROGRESS_STAGES[5].stage).toBe('building_completion');
  });
});

describe('EWO-033: Interaction Completion Service', () => {
  it('exports InteractionCompletionService with accept, reject, requestRefinement', async () => {
    const mod = await import('../lib/interactionCompletionService');
    expect(mod.InteractionCompletionService).toBeDefined();
    expect(typeof mod.InteractionCompletionService.assembleCompletionPackage).toBe('function');
    expect(typeof mod.InteractionCompletionService.acceptCompletion).toBe('function');
    expect(typeof mod.InteractionCompletionService.rejectCompletion).toBe('function');
    expect(typeof mod.InteractionCompletionService.requestRefinement).toBe('function');
  });
});

describe('EWO-033: Interaction Resume Service', () => {
  it('exports InteractionResumeService with resumeInteraction', async () => {
    const mod = await import('../lib/interactionResumeService');
    expect(mod.InteractionResumeService).toBeDefined();
    expect(typeof mod.InteractionResumeService.resumeInteraction).toBe('function');
  });
});

describe('EWO-033: Interaction Presentation Filter', () => {
  const mockProposal: EngineeringProposal = {
    id: 'prop-1',
    proposalRef: 'PROP-001',
    ideaId: 'idea-1',
    ideaRef: 'IDEA-001',
    ewoId: null,
    ewoRef: null,
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
    risks: [
      { description: 'Low risk', severity: 'low', mitigation: 'Standard testing' },
    ],
    dependencies: [
      { ref: 'EWO-001', type: 'work_order', description: 'Related work' },
    ],
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

  it('filters proposal to remove internal refs and IDs', () => {
    const filtered = InteractionPresentationFilter.filterProposal(mockProposal);
    expect(filtered.title).toBe('Add a new dashboard widget');
    expect(filtered.complexity).toBe('Medium');
    expect(filtered.impact).toBe('Medium');
    expect(filtered.similarity.matchesFound).toBe(1);
    expect(filtered.similarity.topMatch?.title).toBe('Similar idea');
    expect(filtered.similarity.topMatch?.similarity).toBe('65%');
    expect(filtered.constitutionalStatus.validated).toBe(true);
    // No internal refs should appear
    expect(JSON.stringify(filtered)).not.toContain('PROP-001');
    expect(JSON.stringify(filtered)).not.toContain('IDEA-001');
  });

  it('filters execution ready to use friendly provider name', () => {
    const prep: ExecutionPreparationResult = {
      ready: true,
      ewoId: 'ewo-1',
      ewoRef: 'EWO-001',
      provider: 'codex',
      estimatedImpact: 'Generated',
      filesAffected: [],
      validation: ['All checks passed'],
      blockingReasons: [],
      lifecycleStage: 'awaiting_execution_approval',
    };
    const filtered = InteractionPresentationFilter.filterExecutionReady(prep);
    expect(filtered.provider).toBe('AI Engineering Agent');
    expect(filtered.ready).toBe(true);
  });

  it('filters completion package to remove internal details', () => {
    const pkg: CompletionPackage = {
      executionId: 'exec-1',
      ewoId: 'ewo-1',
      ewoRef: 'EWO-001',
      summary: 'Implemented the widget',
      filesChanged: ['src/widget.tsx'],
      tests: [{ name: 'widget test', status: 'passed', detail: 'ok' }],
      validation: [{ check: 'lint', status: 'passed' }],
      deploymentRecommendation: 'Deploy to staging',
      poTestInstructions: ['Review files'],
      lifecycleStage: 'awaiting_acceptance',
    };
    const filtered = InteractionPresentationFilter.filterCompletion(pkg);
    expect(filtered.summary).toBe('Implemented the widget');
    expect(filtered.filesChanged).toHaveLength(1);
    expect(filtered.tests[0].status).toBe('passed');
    // No internal IDs
    expect(JSON.stringify(filtered)).not.toContain('exec-1');
    expect(JSON.stringify(filtered)).not.toContain('EWO-001');
  });

  it('filters next action to use friendly stage labels', () => {
    const action: NextAction = {
      currentStage: 'awaiting_proposal_approval',
      completedStages: ['idea_captured', 'preparing_proposal'],
      nextAction: 'Review the proposal',
      blockingReason: null,
      requiredPODecision: 'proposal_approval',
      supportingRecords: { ideaId: 'idea-1', ideaRef: 'IDEA-001' },
    };
    const filtered = InteractionPresentationFilter.filterNextAction(action);
    expect(filtered.currentStage).toBe('Awaiting Your Approval');
    expect(filtered.requiredDecision).toBe('Review Proposal');
    // No internal refs
    expect(JSON.stringify(filtered)).not.toContain('idea-1');
    expect(JSON.stringify(filtered)).not.toContain('IDEA-001');
  });
});

describe('EWO-033: Interaction Channel Adapter', () => {
  it('exports InteractionChannelAdapter with processMessage and resumeInteraction', async () => {
    const mod = await import('../lib/interactionChannelAdapter');
    expect(mod.InteractionChannelAdapter).toBeDefined();
    expect(typeof mod.InteractionChannelAdapter.processMessage).toBe('function');
    expect(typeof mod.InteractionChannelAdapter.resumeInteraction).toBe('function');
  });
});
