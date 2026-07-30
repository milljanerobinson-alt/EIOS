/**
 * Pipeline Recommendation Engine — EWO-011.7
 *
 * Config-driven registry that maps each pipeline stage to its recommendation,
 * purpose, expected outputs, and actionability. UI components consume this;
 * no cognitive logic lives here.
 */

import type { PipelineStage } from './atdCognitiveEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StageActionKey =
  | 'run_analysis'
  | 'run_planning'
  | 'prepare_review'
  | 'record_decision'
  | 'begin_engineering'
  | 'record_validation'
  | 'extract_knowledge'
  | 'complete_intelligence'
  | 'none';

export interface StageConfig {
  stage: PipelineStage;
  shortLabel: string;
  purpose: string;
  expectedOutputs: string[];
  prerequisites: string[];
  recommendationTitle: string;
  recommendationBody: string;
  actionLabel: string;
  actionKey: StageActionKey;
}

export interface StageRecommendation {
  stage: PipelineStage;
  title: string;
  body: string;
  actionLabel: string;
  actionKey: StageActionKey;
  isActionable: boolean;
  isCurrent: boolean;
  isComplete: boolean;
  isFuture: boolean;
  purpose: string;
  expectedOutputs: string[];
  prerequisites: string[];
}

// ─── Stage order (duplicated here to avoid circular dep with atdCognitiveEngine) ─

export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  'intent_understanding',
  'engineering_analysis',
  'engineering_planning',
  'review_preparation',
  'approval',
  'implementation_coordination',
  'validation',
  'knowledge_extraction',
  'intelligence_update',
  'complete',
];

// ─── Stage config registry ─────────────────────────────────────────────────────

export const STAGE_REGISTRY: Record<PipelineStage, StageConfig> = {
  intent_understanding: {
    stage: 'intent_understanding',
    shortLabel: 'Intent',
    purpose:
      'Records and structures the Engineering Intent for governance, assigning a reference and initiating the cognitive pipeline.',
    expectedOutputs: [
      'Structured intent record (ATD-INT-NNN)',
      'Pipeline execution created',
      'Capability execution logged',
    ],
    prerequisites: [],
    recommendationTitle: 'Intent Understanding complete',
    recommendationBody:
      'The Engineering Intent has been captured and structured. Engineering Analysis is the next step.',
    actionLabel: 'Run Engineering Analysis',
    actionKey: 'run_analysis',
  },

  engineering_analysis: {
    stage: 'engineering_analysis',
    shortLabel: 'Analysis',
    purpose:
      'Reviews the intent against the Engineering Constitution, assesses complexity, identifies risks and dependencies, and prepares the information required for Engineering Planning.',
    expectedOutputs: [
      'Complexity assessment (low / medium / high / critical)',
      'Constitution review notes',
      'Architecture notes',
      'Risk register',
      'Analysis summary',
    ],
    prerequisites: ['Intent Understanding complete'],
    recommendationTitle: 'Run Engineering Analysis',
    recommendationBody:
      'Engineering Analysis will review this intent against the Engineering Constitution, assess complexity, identify risks and dependencies, and prepare the structured information required for Engineering Planning.',
    actionLabel: 'Run Engineering Analysis',
    actionKey: 'run_analysis',
  },

  engineering_planning: {
    stage: 'engineering_planning',
    shortLabel: 'Planning',
    purpose:
      'Transforms the Engineering Analysis into a structured Engineering Plan with phases, effort estimates, recommended approach, and required Engineering Work Orders.',
    expectedOutputs: [
      'Engineering Plan (draft)',
      'Engineering phases with descriptions',
      'Effort estimate',
      'Recommended approach',
      'Required EWO list',
    ],
    prerequisites: ['Engineering Analysis complete'],
    recommendationTitle: 'Generate Engineering Plan',
    recommendationBody:
      'Engineering Analysis is complete. Engineering Planning will transform the analysis into a structured plan with phases, effort estimates, and the Engineering Work Orders required for execution.',
    actionLabel: 'Generate Engineering Plan',
    actionKey: 'run_planning',
  },

  review_preparation: {
    stage: 'review_preparation',
    shortLabel: 'Review Prep',
    purpose:
      'Packages the Engineering Plan into a formal review request and routes it to the designated reviewer.',
    expectedOutputs: [
      'Review request record',
      'Review package',
      'Reviewer assignment',
    ],
    prerequisites: ['Engineering Planning complete'],
    recommendationTitle: 'Prepare Review Package',
    recommendationBody:
      'The Engineering Plan is ready for governance review. Prepare a formal review request to route the plan to the appropriate reviewer.',
    actionLabel: 'Prepare Review',
    actionKey: 'prepare_review',
  },

  approval: {
    stage: 'approval',
    shortLabel: 'Approval',
    purpose:
      'Awaits a governance decision: approve, reject, defer, or request changes. This gate controls whether engineering work proceeds.',
    expectedOutputs: [
      'Governance decision record',
      'Decision rationale',
      'Conditions (if any)',
    ],
    prerequisites: ['Review preparation complete'],
    recommendationTitle: 'Awaiting Governance Decision',
    recommendationBody:
      'The Engineering Plan is under review. Record the governance decision — approve, reject, defer, or request changes — to proceed.',
    actionLabel: 'Record Decision',
    actionKey: 'record_decision',
  },

  implementation_coordination: {
    stage: 'implementation_coordination',
    shortLabel: 'Implementation',
    purpose:
      'Coordinates engineering implementation by creating the Engineering Work Order, generating the Engineering Package, and assigning the implementation provider.',
    expectedOutputs: [
      'Engineering Work Order',
      'Engineering Package v1',
      'Provider assignment',
    ],
    prerequisites: ['Approval received'],
    recommendationTitle: 'Begin Engineering',
    recommendationBody:
      'The plan is approved. Begin Engineering to automatically create the Engineering Work Order, generate Engineering Package v1, and assign the implementation provider.',
    actionLabel: 'Begin Engineering',
    actionKey: 'begin_engineering',
  },

  validation: {
    stage: 'validation',
    shortLabel: 'Validation',
    purpose:
      'Validates that implemented work meets the Engineering Constitution, stated objectives, and quality standards.',
    expectedOutputs: [
      'Validation result record',
      'Findings and observations',
      'Pass / fail / partial verdict',
    ],
    prerequisites: ['Implementation coordination complete'],
    recommendationTitle: 'Record Validation',
    recommendationBody:
      'Implementation is underway. Record validation findings once engineering work is complete to confirm it meets constitutional and quality standards.',
    actionLabel: 'Record Validation',
    actionKey: 'record_validation',
  },

  knowledge_extraction: {
    stage: 'knowledge_extraction',
    shortLabel: 'Knowledge',
    purpose:
      'Extracts reusable patterns, lessons learned, standards improvements, and architectural recommendations from this work for the Engineering Intelligence Platform.',
    expectedOutputs: [
      'Knowledge records (patterns, lessons, standards)',
      'Reusable engineering patterns',
      'Recommendations for future work',
    ],
    prerequisites: ['Validation complete'],
    recommendationTitle: 'Extract Engineering Knowledge',
    recommendationBody:
      'Extract patterns, lessons, and standards improvements from this engineering work. These become reusable intelligence for future Engineering Intents.',
    actionLabel: 'Extract Knowledge',
    actionKey: 'extract_knowledge',
  },

  intelligence_update: {
    stage: 'intelligence_update',
    shortLabel: 'Intelligence',
    purpose:
      'Updates the Engineering Intelligence Graph with the outcomes, knowledge, and patterns from this work, closing the intelligence loop.',
    expectedOutputs: [
      'EIG node updates',
      'Intelligence update record',
      'Pipeline closed',
    ],
    prerequisites: ['Knowledge extraction complete'],
    recommendationTitle: 'Complete Intelligence Update',
    recommendationBody:
      'Complete the intelligence update to close this pipeline and capture all outcomes in the Engineering Intelligence Graph.',
    actionLabel: 'Complete Intelligence Update',
    actionKey: 'complete_intelligence',
  },

  complete: {
    stage: 'complete',
    shortLabel: 'Complete',
    purpose:
      'This pipeline is complete. All engineering intelligence has been captured and the intent has been fully processed.',
    expectedOutputs: ['Complete pipeline record', 'All outputs archived'],
    prerequisites: ['All prior stages complete'],
    recommendationTitle: 'Pipeline Complete',
    recommendationBody:
      'This Engineering Intent has been fully processed through the ATD Cognitive Pipeline. All outputs are available in the sections above.',
    actionLabel: '',
    actionKey: 'none',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the recommendation for a given target stage, relative to the
 * current pipeline state.
 */
export function getStageRecommendation(
  currentStage: PipelineStage,
  targetStage: PipelineStage,
): StageRecommendation {
  const config = STAGE_REGISTRY[targetStage];
  const currentIdx = PIPELINE_STAGE_ORDER.indexOf(currentStage);
  const targetIdx  = PIPELINE_STAGE_ORDER.indexOf(targetStage);

  const isComplete   = targetIdx < currentIdx;
  const isCurrent    = targetStage === currentStage;
  const isFuture     = targetIdx > currentIdx;
  const isActionable = isCurrent && config.actionKey !== 'none';

  return {
    stage:          targetStage,
    title:          config.recommendationTitle,
    body:           config.recommendationBody,
    actionLabel:    config.actionLabel,
    actionKey:      config.actionKey,
    isActionable,
    isCurrent,
    isComplete,
    isFuture,
    purpose:        config.purpose,
    expectedOutputs: config.expectedOutputs,
    prerequisites:  config.prerequisites,
  };
}

/**
 * Returns the next recommended action for the pipeline's current stage.
 */
export function getNextRecommendation(
  currentStage: PipelineStage,
): StageRecommendation {
  return getStageRecommendation(currentStage, currentStage);
}
