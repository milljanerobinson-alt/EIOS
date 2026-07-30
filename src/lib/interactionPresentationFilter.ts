/**
 * Interaction Presentation Filter — EWO-033R.1 Phase 8
 *
 * Strips internal IDs, constitutional terminology, and provider implementation
 * details from interaction output. The PO should never see internal concepts
 * in their interaction — those belong in diagnostics, audit, and governance.
 *
 * This filter is channel-agnostic — it transforms structured data, not
 * channel-specific markup.
 */

import type { EngineeringProposal } from './proposalEngine';
import type { CompletionPackage } from './interactionCompletionService';
import type { ExecutionPreparationResult } from './interactionExecutionService';
import type { NextAction } from './interactionLifecycleService';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface FilteredProposal {
  title: string;
  summary: string;
  recommendation: string;
  implementationOverview: string[];
  complexity: string;
  risks: Array<{ description: string; severity: string }>;
  // Hidden behind "More Details" — not shown by default
  analysis: {
    summary: string;
    approach: string;
    affectedAreas: string[];
    notes: string;
  };
  plan: {
    summary: string;
    strategy: string;
    approach: string;
    estimatedEffort: string;
  };
  scope: {
    what: string[];
    whatNot: string[];
    assumptions: string[];
  };
  dependencies: Array<{ description: string }>;
  similarity: {
    reviewed: boolean;
    matchesFound: number;
    topMatch?: { title: string; similarity: string };
  };
  acceptanceCriteria: string[];
  impact: string;
  constitutionalStatus: {
    validated: boolean;
    reviewed: boolean;
    passed: boolean;
  };
}

export interface FilteredExecutionReady {
  provider: string;
  estimatedImpact: string;
  filesAffected: string[];
  validation: string[];
  ready: boolean;
  blockingReasons: string[];
}

export interface FilteredCompletion {
  summary: string;
  filesChanged: string[];
  tests: Array<{ name: string; status: string }>;
  validation: Array<{ check: string; status: string }>;
  deploymentRecommendation: string;
  testInstructions: string[];
}

export interface FilteredNextAction {
  currentStage: string;
  nextAction: string;
  blockingReason: string | null;
  requiredDecision: string | null;
  conversationAction: string | null;
  conversationIdentifier: string | null;
  actionAvailable: boolean;
  optionalInspectionLinks: Array<{
    label: string;
    type: string;
    targetRef?: string;
  }>;
}

// ─── Filters ────────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  idea_captured: 'Idea Captured',
  preparing_proposal: 'Preparing Proposal',
  awaiting_proposal_approval: 'Awaiting Your Approval',
  ewo_created: 'Engineering Work Order Created',
  preparing_execution: 'Preparing Execution',
  awaiting_execution_approval: 'Ready for Execution',
  executing: 'Executing',
  validating: 'Validating',
  awaiting_acceptance: 'Awaiting Your Acceptance',
  accepted: 'Accepted',
  closed: 'Closed',
  blocked: 'Blocked',
  failed: 'Failed',
  archived: 'Archived',
};

const COMPLEXITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const IMPACT_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

function synthesiseRecommendation(proposal: EngineeringProposal): string {
  const parts: string[] = [];

  const hasRisks = (proposal.risks ?? []).some(r => r.severity === 'high' || r.severity === 'critical');
  if (hasRisks) {
    parts.push("I recommend proceeding, though we'll need to manage a few risks carefully.");
  } else {
    parts.push("I recommend proceeding with this implementation.");
  }

  const productNotes = proposal.analysis.productIntelligenceNotes ?? '';
  const analysisNotes = proposal.analysis.architecturalNotes ?? '';
  if (productNotes) {
    parts.push(productNotes.charAt(0).toLowerCase() + productNotes.slice(1));
  } else if (analysisNotes) {
    parts.push(analysisNotes.charAt(0).toLowerCase() + analysisNotes.slice(1));
  }

  const matches = proposal.similarityResults ?? [];
  if (matches.length > 0 && matches[0].score > 0.7) {
    parts.push(`I noticed a related existing item ("${matches[0].title}") — I've accounted for the overlap.`);
  }

  const effort = proposal.plan.estimatedEffort ?? '';
  if (effort) {
    parts.push(`Estimated effort: ${effort}.`);
  }

  return parts.join(' ');
}

export const InteractionPresentationFilter = {
  /**
   * Filter an Engineering Proposal for PO-facing presentation.
   * Strips all internal refs, IDs, and constitutional terminology.
   */
  filterProposal(proposal: EngineeringProposal): FilteredProposal {
    const title = proposal.analysis.summary?.split('\n')[0]?.slice(0, 120) ?? 'Engineering Proposal';
    const inclusions = proposal.scope.inclusions ?? [];
    const complexity = COMPLEXITY_LABELS[proposal.complexity] ?? proposal.complexity;

    // Synthesise a conversational recommendation from internal analysis
    const recommendation = synthesiseRecommendation(proposal);

    // Build implementation overview from scope inclusions
    const implementationOverview = inclusions.length > 0
      ? inclusions
      : [proposal.plan.executiveSummary ?? 'Implement the requested feature'];

    return {
      title,
      summary: title,
      recommendation,
      implementationOverview,
      analysis: {
        summary: proposal.analysis.summary ?? '',
        approach: proposal.analysis.approach ?? '',
        affectedAreas: proposal.analysis.affectedComponents ?? [],
        notes: proposal.analysis.architecturalNotes ?? '',
      },
      plan: {
        summary: proposal.plan.executiveSummary ?? '',
        strategy: proposal.plan.engineeringStrategy ?? '',
        approach: proposal.plan.recommendedApproach ?? '',
        estimatedEffort: proposal.plan.estimatedEffort ?? '',
      },
      scope: {
        what: inclusions,
        whatNot: proposal.scope.exclusions ?? [],
        assumptions: proposal.scope.assumptions ?? [],
      },
      risks: (proposal.risks ?? []).map((r) => ({
        description: r.description,
        severity: SEVERITY_LABELS[r.severity] ?? r.severity,
      })),
      dependencies: (proposal.dependencies ?? []).map((d) => ({
        description: d.description,
      })),
      similarity: {
        reviewed: proposal.constitutionalStatus?.similarityReviewed ?? false,
        matchesFound: proposal.similarityResults?.length ?? 0,
        topMatch: proposal.similarityResults?.[0]
          ? {
              title: proposal.similarityResults[0].title,
              similarity: `${Math.round(proposal.similarityResults[0].score * 100)}%`,
            }
          : undefined,
      },
      acceptanceCriteria: proposal.acceptanceCriteria ?? [],
      complexity,
      impact: IMPACT_LABELS[proposal.impact] ?? proposal.impact,
      constitutionalStatus: {
        validated: proposal.constitutionalStatus?.guardianValidated ?? false,
        reviewed: proposal.constitutionalStatus?.similarityReviewed ?? false,
        passed: proposal.constitutionalStatus?.constitutionalValidationPassed ?? false,
      },
    };
  },

  /**
   * Filter execution preparation for PO-facing presentation.
   */
  filterExecutionReady(prep: ExecutionPreparationResult): FilteredExecutionReady {
    return {
      provider: prep.provider === 'codex' ? 'AI Engineering Agent' : prep.provider,
      estimatedImpact: prep.estimatedImpact,
      filesAffected: prep.filesAffected,
      validation: prep.validation,
      ready: prep.ready,
      blockingReasons: prep.blockingReasons,
    };
  },

  /**
   * Filter completion package for PO-facing presentation.
   */
  filterCompletion(pkg: CompletionPackage): FilteredCompletion {
    return {
      summary: pkg.summary,
      filesChanged: pkg.filesChanged,
      tests: pkg.tests.map((t) => ({ name: t.name, status: t.status })),
      validation: pkg.validation.map((v) => ({ check: v.check, status: v.status })),
      deploymentRecommendation: pkg.deploymentRecommendation,
      testInstructions: pkg.poTestInstructions,
    };
  },

  /**
   * Filter next action for PO-facing presentation.
   */
  filterNextAction(action: NextAction): FilteredNextAction {
    return {
      currentStage: STAGE_LABELS[action.currentStage] ?? action.currentStage,
      nextAction: action.nextAction,
      blockingReason: action.blockingReason,
      requiredDecision: action.requiredPODecision
        ? action.requiredPODecision === 'proposal_approval'
          ? 'Review Proposal'
          : action.requiredPODecision === 'execution_approval'
            ? 'Approve Execution'
            : 'Accept Completion'
        : null,
      conversationAction: action.conversationAction ?? null,
      conversationIdentifier: action.conversationIdentifier ?? null,
      actionAvailable: action.actionAvailable ?? false,
      optionalInspectionLinks: (action.optionalInspectionLinks ?? []).map((link) => ({
        label: link.label,
        type: link.type,
        targetRef: link.targetRef,
      })),
    };
  },
};
