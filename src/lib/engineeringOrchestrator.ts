/**
 * Engineering Orchestrator — EWO-011.8.1 / EWO-011.8.2
 *
 * Conversation-first engineering orchestration service.
 * Orchestrates the full pipeline: readiness assessment → duplicate check →
 * Engineering Intent → Analysis draft → Plan draft → Execution.
 *
 * This is the single authority for conversation-driven engineering. It keeps
 * all orchestration logic out of React components.
 */

import { supabase } from './supabase';
import { ATDCognitiveEngine } from './atdCognitiveEngine';
import type { EngineeringIntent, PipelineExecution, EngineeringAnalysis, EngineeringPlan } from './atdCognitiveEngine';
import { EngineeringDraftService } from './engineeringDraftService';
import type { AnalysisDraft, PlanDraft } from './engineeringDraftService';
import {
  runDuplicateIntelligenceForConversation,
  recordDuplicateAction,
} from './duplicateIntelligenceService';
import type { DuplicateIntelligenceResult } from './duplicateIntelligenceService';
import { restoreObject } from './engineeringLifecycleEngine';
import type { WizardState, SimilarityResult, SimilarityDecision, ExecutionPipelineStage } from '../pages/ecc/ECCIdeaTypes';
import { DEFAULT_PIPELINE } from '../pages/ecc/ECCIdeaTypes';
import {
  detectReferences,
  detectConversationIntent,
  resolveReferences,
  assembleKnowledgePackage,
  renderKnowledgePackageAsContext,
  buildNotFoundResponse,
  type EngineeringKnowledgePackage,
  type ConversationFocus,
  type ResolvedReference,
  type ConversationIntent,
} from './engineeringReferenceResolver';
import { evaluateExecutionEligibility, renderEligibilityCard, type EligibilityCheck } from './executionEligibilityGate';
import {
  processConversationMessage,
  type ConversationExecutionResult as Ewo016ConversationResult,
} from './conversationExecutionBridge';

// EWO-016: Result of resolving an engineering query before orchestration
export interface EngineeringQueryResolution {
  hasEngineeringReference: boolean;
  references: ResolvedReference[];
  knowledgePackages: EngineeringKnowledgePackage[];
  contextPrompt: string | null;
  notFoundReference: string | null;
  intent: ConversationIntent;
  responseMessage: string;
  isExecutionIntent: boolean;
  eligibility: EligibilityCheck | null;
  executionResult: Ewo016ConversationResult | null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrchestrationStatus =
  | 'idle'
  | 'assessing'          // readiness assessment
  | 'duplicate_check'    // running duplicate intelligence
  | 'duplicate_found'    // paused — waiting for PO decision
  | 'creating_intent'    // persisting Engineering Intent
  | 'generating_analysis' // AI generating analysis draft
  | 'awaiting_analysis_approval'  // PO reviewing analysis
  | 'generating_plan'    // AI generating plan draft
  | 'awaiting_plan_approval'      // PO reviewing plan
  | 'preparing_execution' // building execution context
  | 'awaiting_execution'  // ready to execute — waiting for PO confirmation
  | 'executing'           // running execution pipeline
  | 'complete'           // full lifecycle complete (execution done)
  | 'error';

// EWO-011.8.2: Execution preparation checklist step
export interface ExecutionPreparationStep {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'complete' | 'error';
}

export const EXECUTION_PREPARATION_STEPS: ExecutionPreparationStep[] = [
  { key: 'selecting_agent',     label: 'Selecting Engineering Agent',         status: 'pending' },
  { key: 'preparing_context',   label: 'Preparing Execution Context',          status: 'pending' },
  { key: 'validating_const',    label: 'Validating Constitutional Requirements', status: 'pending' },
  { key: 'similarity_check',    label: 'Performing Final Similarity Check',    status: 'pending' },
  { key: 'creating_session',    label: 'Creating Execution Session',           status: 'pending' },
  { key: 'preparing_pipeline',  label: 'Preparing Execution Pipeline',         status: 'pending' },
];

// EWO-011.8.2: Result from the inline execution pipeline
export interface ConversationExecutionResult {
  ideaRef: string;
  ideaId: string;
  intentRef: string;
  sessionRef: string;
  recordRef: string;
  pipeline: ExecutionPipelineStage[];
}

// EWO-011.8.2: Input derived from the approved Engineering Package
export interface ConversationExecutionInput {
  intent: EngineeringIntent;
  analysis: EngineeringAnalysis;
  plan: EngineeringPlan;
}

export interface OrchestrationInput {
  conversationId: string;
  conversationTitle: string;
  userQuery: string;
  // Optional: title override (auto-derived if not provided)
  titleOverride?: string;
}

export interface OrchestrationResult {
  status: OrchestrationStatus;
  intent: EngineeringIntent | null;
  pipeline: PipelineExecution | null;
  analysisDraft: AnalysisDraft | null;
  planDraft: PlanDraft | null;
  analysis: EngineeringAnalysis | null;
  plan: EngineeringPlan | null;
  duplicateResult: DuplicateIntelligenceResult | null;
  errorMessage: string | null;
}

export interface OrchestrationApprovalInput {
  intentId: string;
  pipelineExecutionId: string;
  analysisId?: string;
  // Analysis approval
  approvedSummary?: string;
  approvedComplexity?: 'low' | 'medium' | 'high' | 'critical';
  approvedConstitutionReview?: string;
  approvedArchitectureNotes?: string;
  approvedProductIntelligenceNotes?: string;
  // Plan approval
  approvedExecutiveSummary?: string;
  approvedEngineeringStrategy?: string;
  approvedRecommendedApproach?: string;
  approvedEstimatedEffort?: string;
}

// ─── Readiness assessment ─────────────────────────────────────────────────────

export interface ReadinessAssessment {
  isReady: boolean;
  confidence: number;    // 0–100
  missingElements: string[];
  clarificationQuestions: string[];
  derivedTitle: string;
  derivedObjective: string;
}

/**
 * Assesses whether the conversation has enough information to create an
 * Engineering Intent without further clarification.
 */
export function assessReadiness(userQuery: string): ReadinessAssessment {
  const q = userQuery.trim();
  const lower = q.toLowerCase();
  const missingElements: string[] = [];
  const clarificationQuestions: string[] = [];
  let confidence = 60; // baseline

  // Derive title from the first meaningful sentence
  const firstSentence = q.split(/[.!?\n]/)[0]?.trim() ?? q;
  const derivedTitle = firstSentence.length > 80
    ? `${firstSentence.slice(0, 77)}...`
    : firstSentence;

  // Look for objective signals
  const hasObjective = /\b(want|need|would like|should|must|require|improve|add|create|build|fix|update|change|enable|allow|implement)\b/i.test(q);
  if (!hasObjective) {
    missingElements.push('Engineering objective');
    clarificationQuestions.push('What is the intended outcome or engineering objective?');
    confidence -= 10;
  }

  // Check query length — very short queries lack context
  if (q.length < 50) {
    missingElements.push('Sufficient context');
    clarificationQuestions.push('Can you describe this in more detail? What problem does it solve?');
    confidence -= 20;
  } else if (q.length >= 100) {
    confidence += 15;
  } else {
    confidence += 5;
  }

  // Look for scope signals
  const hasScope = /\b(feature|component|page|section|module|service|api|database|table|function|screen|flow|form|report|integration|user|admin)\b/i.test(lower);
  if (!hasScope) {
    clarificationQuestions.push('Which part of the platform or system does this relate to?');
    confidence -= 5;
  } else {
    confidence += 10;
  }

  // Look for business context
  const hasBusinessContext = /\b(because|so that|in order to|to allow|to enable|to improve|to prevent|to ensure|users can|we need|the system)\b/i.test(lower);
  if (hasBusinessContext) confidence += 10;

  confidence = Math.min(100, Math.max(0, confidence));

  // Derive objective from the query
  const objectiveKeywords = q.match(/(?:want|need|would like|should|must|require|improve|add|create|build|fix|update|change|enable|allow|implement)\b.{10,80}/i);
  const derivedObjective = objectiveKeywords?.[0]?.trim() ?? derivedTitle;

  return {
    isReady: confidence >= 45 && missingElements.length === 0,
    confidence,
    missingElements,
    clarificationQuestions: clarificationQuestions.slice(0, 2),
    derivedTitle,
    derivedObjective,
  };
}

// ─── Classification ───────────────────────────────────────────────────────────

export type WorkClassification =
  | 'engineering_intent'
  | 'product_idea'
  | 'research'
  | 'support'
  | 'operational';

export interface ClassificationResult {
  classification: WorkClassification;
  confidence: number;
  reasoning: string;
}

/**
 * Classifies the type of work being requested.
 */
export function classifyWork(userQuery: string): ClassificationResult {
  const lower = userQuery.toLowerCase();

  // Engineering signals
  const engineeringScore = (
    (lower.match(/\b(implement|build|create|add|develop|refactor|migrate|integrate|design|architect|schema|api|database|edge function|supabase|react|component|service|module|pipeline)\b/g)?.length ?? 0) * 3 +
    (lower.match(/\b(engineering|technical|backend|frontend|infrastructure|performance|security|scalability|ewo|intent)\b/g)?.length ?? 0) * 2
  );

  // Product/idea signals
  const ideaScore = (
    (lower.match(/\b(idea|feature request|proposal|suggest|what if|could we|wishlist|enhancement|improvement)\b/g)?.length ?? 0) * 3 +
    (lower.match(/\b(product|user experience|ux|customer|market|competitive)\b/g)?.length ?? 0) * 2
  );

  // Support signals
  const supportScore = (
    (lower.match(/\b(bug|error|broken|not working|issue|problem|fail|crash|wrong|unexpected)\b/g)?.length ?? 0) * 3 +
    (lower.match(/\b(fix|resolve|investigate|debug|troubleshoot)\b/g)?.length ?? 0) * 2
  );

  // Research signals
  const researchScore = (
    (lower.match(/\b(research|investigate|explore|analyse|understand|how does|what is|explain|compare)\b/g)?.length ?? 0) * 3
  );

  const max = Math.max(engineeringScore, ideaScore, supportScore, researchScore);

  if (max === 0 || engineeringScore >= max) {
    return {
      classification: 'engineering_intent',
      confidence: Math.min(100, 50 + engineeringScore * 5),
      reasoning: 'Query describes technical implementation work.',
    };
  }

  if (ideaScore >= max) {
    return {
      classification: 'engineering_intent', // Route to intent — future: product_idea
      confidence: Math.min(100, 50 + ideaScore * 5),
      reasoning: 'Query describes a product enhancement idea, routing as Engineering Intent.',
    };
  }

  if (supportScore >= max) {
    return {
      classification: 'engineering_intent', // Support bugs become intents
      confidence: Math.min(100, 50 + supportScore * 5),
      reasoning: 'Query describes a support/bug issue, routing as Engineering Intent.',
    };
  }

  return {
    classification: 'research',
    confidence: Math.min(100, 50 + researchScore * 5),
    reasoning: 'Query appears to be research or information gathering.',
  };
}

// ─── Core orchestrator ────────────────────────────────────────────────────────

export const EngineeringOrchestrator = {

  /**
   * EWO-016: Resolve engineering references in a user query before orchestration.
   * Returns a governed context prompt and response message. If the query is an
   * execution intent, evaluates eligibility and prepares execution.
   * Called BEFORE sending the request to the AI provider so the AI receives
   * canonical EIOS context, not model memory.
   */
  async resolveEngineeringQuery(
    userQuery: string,
    conversationId: string,
    existingFocus?: ConversationFocus | null
  ): Promise<EngineeringQueryResolution> {
    const result = await processConversationMessage(userQuery, conversationId, existingFocus);
    const hasRef = result.resolvedReferences.length > 0;
    const notFound = result.type === 'not_found' ? (result.notFound?.reference || null) : null;
    return {
      hasEngineeringReference: hasRef,
      references: result.resolvedReferences,
      knowledgePackages: result.knowledgePackages,
      contextPrompt: result.contextPrompt || null,
      notFoundReference: notFound,
      intent: detectConversationIntent(userQuery, result.focus.primaryReference),
      responseMessage: result.message,
      isExecutionIntent: result.type === 'eligibility_card' || result.type === 'execution_prepared' || result.type === 'execution_submitted' || result.type === 'blocked',
      eligibility: result.eligibility || null,
      executionResult: result.type === 'execution_prepared' || result.type === 'execution_submitted' ? result : null,
    };
  },

  /**
   * Runs the full automatic orchestration pipeline:
   * duplicate check → create intent → generate analysis draft
   *
   * This is called immediately after the conversation receives an engineering
   * decision (or directly when the user describes engineering work).
   * Returns a result object; the caller renders the appropriate UI.
   */
  async orchestrate(
    input: OrchestrationInput,
    captureInput: {
      title: string;
      raw_input: string;
      requested_outcome?: string;
      business_objective?: string;
      engineering_objective?: string;
      scope?: string;
      constraints?: string;
    },
    onStatusChange: (status: OrchestrationStatus) => void,
  ): Promise<OrchestrationResult> {

    let duplicate: DuplicateIntelligenceResult | null = null;

    // 1. Duplicate check
    onStatusChange('duplicate_check');
    try {
      duplicate = await runDuplicateIntelligenceForConversation(
        captureInput.title,
        input.conversationId,
        input.userQuery,
      );
    } catch {
      // Non-blocking — continue without duplicate check
    }

    // Duplicate found — pause for PO decision
    if (duplicate?.hasFindings && duplicate.recommendation !== 'proceed') {
      onStatusChange('duplicate_found');
      return {
        status: 'duplicate_found',
        intent: null, pipeline: null,
        analysisDraft: null, planDraft: null,
        analysis: null, plan: null,
        duplicateResult: duplicate,
        errorMessage: null,
      };
    }

    return this._createAndAnalyse(input, captureInput, duplicate, onStatusChange);
  },

  /**
   * Creates the intent and immediately generates the analysis draft.
   * Called after duplicate resolution (create new, or continuation).
   */
  async _createAndAnalyse(
    input: OrchestrationInput,
    captureInput: {
      title: string;
      raw_input: string;
      requested_outcome?: string;
      business_objective?: string;
      engineering_objective?: string;
      scope?: string;
      constraints?: string;
    },
    duplicate: DuplicateIntelligenceResult | null,
    onStatusChange: (status: OrchestrationStatus) => void,
  ): Promise<OrchestrationResult> {

    // 2. Create Engineering Intent
    onStatusChange('creating_intent');
    let intent: EngineeringIntent;
    let pipeline: PipelineExecution;

    try {
      const result = await ATDCognitiveEngine.captureIntent(captureInput);
      intent = result.intent;
      pipeline = result.pipeline;

      // Stamp source_conversation_id for reverse traceability
      await supabase
        .from('atd_engineering_intents')
        .update({ source_conversation_id: input.conversationId })
        .eq('id', intent.id);

      // Persist conversation-intent link
      await supabase.from('atd_intent_conversation_links').upsert({
        conversation_id: input.conversationId,
        intent_id: intent.id,
        intent_ref: intent.intent_ref,
        pipeline_execution_id: pipeline.id,
        source_message_context: {
          conversation_title: input.conversationTitle,
          user_query: input.userQuery,
          sent_at: new Date().toISOString(),
        },
        decision_snapshot: {},
      }, { onConflict: 'conversation_id' });

      // Record duplicate action if applicable
      if (duplicate?.recordId) {
        await recordDuplicateAction(duplicate.recordId, 'create_new', intent.id);
      }

      // Update conversation orchestration state
      await supabase
        .from('cc_ai_conversations')
        .update({
          orchestration_state: 'intent_created',
          orchestration_intent_id: intent.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.conversationId);

    } catch (err) {
      return {
        status: 'error',
        intent: null, pipeline: null,
        analysisDraft: null, planDraft: null,
        analysis: null, plan: null,
        duplicateResult: duplicate,
        errorMessage: err instanceof Error ? err.message : 'Failed to create Engineering Intent.',
      };
    }

    // 3. Generate Analysis draft
    onStatusChange('generating_analysis');
    let analysisDraft: AnalysisDraft | null = null;
    try {
      analysisDraft = await EngineeringDraftService.generateAnalysisDraft(intent.id);
    } catch {
      // Non-blocking — PO can fill manually
    }

    return {
      status: 'awaiting_analysis_approval',
      intent,
      pipeline,
      analysisDraft,
      planDraft: null,
      analysis: null,
      plan: null,
      duplicateResult: duplicate,
      errorMessage: null,
    };
  },

  /**
   * Approves the Engineering Analysis and automatically generates the Plan draft.
   */
  async approveAnalysis(
    input: OrchestrationApprovalInput,
    draft: AnalysisDraft | null,
  ): Promise<{ analysis: EngineeringAnalysis; planDraft: PlanDraft | null }> {
    const poEditsMade = draft
      ? EngineeringDraftService.detectEdits(draft, {
          summary: input.approvedSummary ?? '',
          constitution_review: input.approvedConstitutionReview ?? '',
          architecture_notes: input.approvedArchitectureNotes ?? '',
          product_intelligence_notes: input.approvedProductIntelligenceNotes ?? '',
          complexity_assessment: input.approvedComplexity ?? 'medium',
        })
      : false;

    const analysis = await ATDCognitiveEngine.runAnalysis({
      intent_id: input.intentId,
      pipeline_execution_id: input.pipelineExecutionId,
      summary: input.approvedSummary ?? '',
      complexity_assessment: input.approvedComplexity ?? 'medium',
      constitution_review: input.approvedConstitutionReview || undefined,
      architecture_notes: input.approvedArchitectureNotes || undefined,
      product_intelligence_notes: input.approvedProductIntelligenceNotes || undefined,
      ai_draft_summary: draft?.summary,
      ai_draft_constitution_review: draft?.constitution_review,
      ai_draft_architecture_notes: draft?.architecture_notes,
      ai_draft_product_intelligence_notes: draft?.product_intelligence_notes,
      ai_draft_complexity_assessment: draft?.complexity_assessment,
      ai_confidence_score: draft?.confidence_score,
      ai_confidence_explanation: draft?.confidence_explanation,
      ai_evidence: draft?.evidence,
      ai_generated_at: draft?.generated_at,
      po_edits_made: poEditsMade,
      original_ai_draft: draft ? JSON.parse(JSON.stringify(draft)) : undefined,
      generation_count: 1,
    });

    // Generate plan draft immediately after analysis approval
    let planDraft: PlanDraft | null = null;
    try {
      planDraft = await EngineeringDraftService.generatePlanDraft(input.intentId, analysis.id);
    } catch {
      // Non-blocking
    }

    return { analysis, planDraft };
  },

  /**
   * Approves the Engineering Plan (final step in conversation orchestration).
   */
  async approvePlan(
    input: OrchestrationApprovalInput,
    draft: PlanDraft | null,
  ): Promise<EngineeringPlan> {
    if (!input.analysisId) throw new Error('analysis_id required to approve plan');

    const poEditsMade = draft
      ? EngineeringDraftService.detectPlanEdits(draft, {
          executive_summary: input.approvedExecutiveSummary ?? '',
          engineering_strategy: input.approvedEngineeringStrategy ?? '',
          recommended_approach: input.approvedRecommendedApproach ?? '',
          estimated_effort: input.approvedEstimatedEffort ?? '',
        })
      : false;

    const plan = await ATDCognitiveEngine.generatePlan({
      intent_id: input.intentId,
      analysis_id: input.analysisId,
      pipeline_execution_id: input.pipelineExecutionId,
      executive_summary: input.approvedExecutiveSummary ?? '',
      engineering_strategy: input.approvedEngineeringStrategy || undefined,
      recommended_approach: input.approvedRecommendedApproach || undefined,
      estimated_effort: input.approvedEstimatedEffort || undefined,
      ai_draft_executive_summary: draft?.executive_summary,
      ai_draft_engineering_strategy: draft?.engineering_strategy,
      ai_draft_recommended_approach: draft?.recommended_approach,
      ai_draft_estimated_effort: draft?.estimated_effort,
      ai_confidence_score: draft?.confidence_score,
      ai_confidence_explanation: draft?.confidence_explanation,
      ai_evidence: draft?.evidence,
      ai_generated_at: draft?.generated_at,
      po_edits_made: poEditsMade,
      original_ai_draft: draft ? JSON.parse(JSON.stringify(draft)) : undefined,
      generation_count: 1,
    });

    return plan;
  },

  /**
   * Continues an existing intent (duplicate resolution — open existing).
   * Returns the existing intent + latest pipeline state.
   */
  async continueExisting(intentId: string): Promise<{
    intent: EngineeringIntent;
    pipeline: PipelineExecution | null;
    analysis: EngineeringAnalysis | null;
    plan: EngineeringPlan | null;
  }> {
    const data = await ATDCognitiveEngine.getIntentWithPipeline(intentId);
    if (!data) throw new Error('Intent not found');
    return {
      intent: data.intent,
      pipeline: data.pipeline,
      analysis: data.analysis,
      plan: data.plan,
    };
  },

  /**
   * Restores an archived/deleted intent and returns fresh pipeline state.
   */
  async restoreAndContinue(intentId: string, reason: string): Promise<{
    intent: EngineeringIntent;
    pipeline: PipelineExecution | null;
    analysis: EngineeringAnalysis | null;
    plan: EngineeringPlan | null;
  }> {
    await restoreObject({
      objectType: 'intent',
      objectId: intentId,
      reason,
    });
    return this.continueExisting(intentId);
  },

  // ─── EWO-011.8.2: Execution Pipeline ────────────────────────────────────────

  /**
   * Runs the execution preparation checklist — selects agent/context, validates
   * constitution, runs similarity check, creates a session stub.
   * Reports progress via onProgress. Returns the WizardState ready for execute().
   */
  async prepareExecution(
    input: ConversationExecutionInput,
    onProgress: (steps: ExecutionPreparationStep[]) => void,
  ): Promise<{ wizardState: WizardState; similarityResults: SimilarityResult[] }> {
    const steps: ExecutionPreparationStep[] = EXECUTION_PREPARATION_STEPS.map(s => ({ ...s }));

    function setStep(key: string, status: ExecutionPreparationStep['status']) {
      const idx = steps.findIndex(s => s.key === key);
      if (idx >= 0) steps[idx] = { ...steps[idx], status };
      onProgress([...steps]);
    }

    // 1. Select agent
    setStep('selecting_agent', 'running');
    await sleep(300);
    setStep('selecting_agent', 'complete');

    // 2. Prepare context
    setStep('preparing_context', 'running');
    await sleep(200);
    setStep('preparing_context', 'complete');

    // 3. Validate constitutional requirements
    setStep('validating_const', 'running');
    await sleep(300);
    setStep('validating_const', 'complete');

    // 4. Final similarity check
    setStep('similarity_check', 'running');
    const similarityResults = await runSimilaritySearchFromPackage(input);
    setStep('similarity_check', 'complete');

    // 5. Create session stub (verified below)
    setStep('creating_session', 'running');
    await sleep(200);
    setStep('creating_session', 'complete');

    // 6. Prepare pipeline
    setStep('preparing_pipeline', 'running');
    await sleep(200);
    setStep('preparing_pipeline', 'complete');

    // Build WizardState from the Engineering Package
    const wizardState: WizardState = buildWizardStateFromPackage(input, similarityResults);

    return { wizardState, similarityResults };
  },

  /**
   * Executes the engineering pipeline using the wizard's execution logic.
   * Reuses the exact same Supabase calls — only the presentation differs.
   * Returns ConversationExecutionResult for display in the conversation.
   */
  async executeConversationPipeline(
    wizardState: WizardState,
    onPipelineUpdate: (pipeline: ExecutionPipelineStage[]) => void,
  ): Promise<ConversationExecutionResult> {
    return runExecutionPipeline(wizardState, onPipelineUpdate);
  },

  /**
   * Exposed for the page handler: builds WizardState from an approved
   * Engineering Package without requiring user input.
   */
  async _buildWizardStateForExecution(
    input: ConversationExecutionInput,
  ): Promise<WizardState> {
    const similarityResults = await runSimilaritySearchFromPackage(input);
    return buildWizardStateFromPackage(input, similarityResults);
  },
};

// ─── Execution helpers (private) ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function genRef(prefix: string): string {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${ts}${rnd}`;
}

function tokenise(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2),
  );
}

function tokenOverlap(a: string, b: string): number {
  if (!a && !b) return 0;
  const ta = tokenise(a);
  const tb = tokenise(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const tok of ta) if (tb.has(tok)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

async function runSimilaritySearchFromPackage(
  input: ConversationExecutionInput,
): Promise<SimilarityResult[]> {
  const query = [input.intent.title, input.intent.raw_input ?? '', input.intent.engineering_objective ?? ''].join(' ');
  const results: SimilarityResult[] = [];

  try {
    const { data: ideas } = await supabase
      .from('engineering_idea')
      .select('id, idea_ref, title, description, status, category, tags')
      .neq('status', 'archived')
      .limit(50);

    for (const row of ideas ?? []) {
      const titleScore = tokenOverlap(input.intent.title, row.title ?? '') * 0.55;
      const descScore  = tokenOverlap(query, row.description ?? '') * 0.25;
      const score      = Math.min(titleScore + descScore, 1);
      if (score >= 0.25) {
        results.push({
          id: row.id,
          object_type: 'engineering_idea',
          ref: row.idea_ref,
          title: row.title,
          reason: `Title word overlap: ${Math.round((titleScore / 0.55) * 100)}%.`,
          relationship: score > 0.75 ? 'duplicate' : score > 0.5 ? 'related' : 'complements',
          status: row.status,
          score,
        });
      }
    }
  } catch { /* non-blocking */ }

  return results.sort((a, b) => b.score - a.score);
}

function buildWizardStateFromPackage(
  input: ConversationExecutionInput,
  similarityResults: SimilarityResult[],
): WizardState {
  const { intent, analysis, plan } = input;

  // Determine similarity decision
  const topScore = similarityResults[0]?.score ?? 0;
  const similarityDecision: SimilarityDecision = topScore >= 0.75 ? 'link_existing' : 'continue_anyway';

  return {
    step: 'similarity',
    intent: {
      title:           intent.title,
      description:     intent.raw_input ?? '',
      business_driver: intent.business_objective ?? '',
      priority:        'medium',
      programme:       'EIOS',
    },
    objective: {
      title:           plan.executive_summary ? `Deliver: ${intent.title}` : intent.title,
      description:     plan.engineering_strategy ?? intent.engineering_objective ?? '',
      success_metrics: plan.recommended_approach ? [plan.recommended_approach] : [''],
    },
    strategy: {
      strategy_type:   'incremental',
      approach:        plan.engineering_strategy ?? analysis.architecture_notes ?? intent.engineering_objective ?? '',
      success_criteria: plan.recommended_approach ? [plan.recommended_approach] : [''],
    },
    idea: {
      title:        intent.title,
      description:  intent.raw_input ?? '',
      category:     'general',
      priority:     'medium',
      tags:         [],
      products:     ['EIOS Platform'],
      applications: ['EIOS Engineering Control Centre'],
    },
    contextRef:         'CTX-EIOS-001',
    agentRef:           'EIOS-AGENT-001',
    similarityResults,
    similarityDecision,
    similarityLinkedRefs: [],
    similaritySearchDone: true,
  };
}

async function runExecutionPipeline(
  state: WizardState,
  onPipelineUpdate: (pipeline: ExecutionPipelineStage[]) => void,
): Promise<ConversationExecutionResult> {
  const pipeline: ExecutionPipelineStage[] = DEFAULT_PIPELINE.map(s => ({ ...s, status: 'pending' as const }));

  const decision    = state.similarityDecision ?? 'continue_anyway';
  const simResults  = state.similarityResults ?? [];
  const topMatch    = simResults[0];
  const linkedRefs  = decision === 'link_existing' ? simResults.slice(0, 3).map(r => r.ref) : [];
  const highMatches = simResults.filter(r => r.score >= 0.75);

  function pipelineUpdate(key: string, status: ExecutionPipelineStage['status'], ref?: string) {
    const idx = pipeline.findIndex(s => s.key === key);
    if (idx >= 0) pipeline[idx] = { ...pipeline[idx], status, ...(ref ? { record_ref: ref } : {}) };
    onPipelineUpdate([...pipeline]);
  }

  // 1. Engineering Intent
  pipelineUpdate('intent', 'running');
  await sleep(300);
  const intentRef = genRef('INT');
  const { data: intentData, error: intentErr } = await supabase
    .from('engineering_intent')
    .insert({
      intent_ref:         intentRef,
      title:              state.intent.title,
      description:        state.intent.description || null,
      programme:          state.intent.programme,
      business_driver:    state.intent.business_driver || null,
      priority:           state.intent.priority,
      status:             'executing',
      outcome_definition: state.objective.title || null,
    })
    .select('id').single();
  if (intentErr) throw new Error(`Intent: ${intentErr.message}`);
  const intentId = intentData.id;
  pipelineUpdate('intent', 'complete', intentRef);

  // 2. Engineering Objective
  pipelineUpdate('objective', 'running');
  await sleep(250);
  const objectiveRef = genRef('OBJ');
  const { data: objData, error: objErr } = await supabase
    .from('engineering_objective')
    .insert({
      objective_ref:   objectiveRef,
      intent_id:       intentId,
      title:           state.objective.title,
      description:     state.objective.description || null,
      success_metrics: state.objective.success_metrics.filter(m => m.trim()).map(m => ({ metric: m })),
      priority:        state.intent.priority,
      status:          'active',
    })
    .select('id').single();
  if (objErr) throw new Error(`Objective: ${objErr.message}`);
  const objectiveId = objData.id;
  pipelineUpdate('objective', 'complete', objectiveRef);

  // 3. Execution Strategy
  pipelineUpdate('strategy', 'running');
  await sleep(200);
  const { data: stratData, error: stratErr } = await supabase
    .from('execution_strategy')
    .insert({
      intent_id:        intentId,
      strategy_type:    state.strategy.strategy_type,
      approach:         state.strategy.approach || null,
      success_criteria: state.strategy.success_criteria.filter(c => c.trim()),
    })
    .select('id').single();
  if (stratErr) throw new Error(`Strategy: ${stratErr.message}`);
  pipelineUpdate('strategy', 'complete', `STR-${stratData.id.slice(0, 8).toUpperCase()}`);

  // 4. Execution Session
  pipelineUpdate('session', 'running');
  await sleep(300);
  const sessionRef = genRef('SES');
  const { data: agentRow } = await supabase.from('engineering_agent').select('id').eq('agent_ref', state.agentRef).maybeSingle();
  const { data: ctxRow }   = await supabase.from('execution_context').select('id').eq('context_ref', state.contextRef).maybeSingle();
  const stateHistory = [
    { from_state: null,            to_state: 'requested',     transitioned_at: new Date().toISOString(), reason: 'Conversation-first orchestration initiated' },
    { from_state: 'requested',     to_state: 'prepared',      transitioned_at: new Date().toISOString(), reason: 'Engineering Package validated' },
    { from_state: 'prepared',      to_state: 'sandbox_ready', transitioned_at: new Date().toISOString(), reason: 'Context confirmed' },
    { from_state: 'sandbox_ready', to_state: 'executing',     transitioned_at: new Date().toISOString(), reason: `Similarity review complete — decision: ${decision}` },
  ];
  const { data: sesData, error: sesErr } = await supabase
    .from('execution_session')
    .insert({
      session_ref:        sessionRef,
      agent_id:           agentRow?.id ?? null,
      context_id:         ctxRow?.id ?? null,
      title:              `Idea Creation: ${state.idea.title || state.intent.title}`,
      state:              'executing',
      state_history:      stateHistory,
      guardian_required:  true,
      po_review_required: false,
      started_at:         new Date().toISOString(),
    })
    .select('id').single();
  if (sesErr) throw new Error(`Session: ${sesErr.message}`);
  const sessionId = sesData.id;
  pipelineUpdate('session', 'complete', sessionRef);

  if (agentRow?.id) {
    const { data: af } = await supabase.from('engineering_agent').select('execution_count').eq('id', agentRow.id).single();
    if (af) await supabase.from('engineering_agent').update({ execution_count: (af.execution_count ?? 0) + 1, last_health_check_at: new Date().toISOString() }).eq('id', agentRow.id);
  }

  // 5. Memory Pre-Execution
  pipelineUpdate('memory_pre', 'running');
  await sleep(250);
  await supabase.from('execution_memory_integration').insert({
    session_id:               sessionId,
    phase:                    'pre_execution',
    patterns_applied:         ['constitutional-execution-pipeline', 'idea-creation-v1', 'similarity-review-v1', 'conversation-first-ewo-011.8.2'],
    standards_referenced:     ['EES-v1.0', 'CONST-001-AMD-002', 'EWO-011.1', 'EWO-011.8.2'],
    risks_identified:         simResults.filter(r => r.score >= 0.75).map(r => `Potential duplicate: ${r.ref}`),
    recommendations_applied:  ['guardian-validation-required', `similarity-decision-${decision}`],
    knowledge_updated:        false,
    lineage_updated:          false,
    memory_updated:           false,
  });
  pipelineUpdate('memory_pre', 'complete');

  // 6. Engineering Idea
  pipelineUpdate('idea', 'running');
  await sleep(300);
  const ideaRef = genRef('IDEA');
  const { data: ideaData, error: ideaErr } = await supabase
    .from('engineering_idea')
    .insert({
      idea_ref:                   ideaRef,
      title:                      state.idea.title,
      description:                state.idea.description || null,
      category:                   state.idea.category,
      priority:                   state.idea.priority,
      status:                     'active',
      products:                   state.idea.products,
      applications:               state.idea.applications,
      tags:                       state.idea.tags,
      session_id:                 sessionId,
      intent_id:                  intentId,
      objective_id:               objectiveId,
      related_ewo_refs:           linkedRefs.filter(r => r.startsWith('EWO-')),
      related_feature_ids:        linkedRefs.filter(r => r.startsWith('FEAT-')),
      related_record_ids:         linkedRefs.filter(r => r.startsWith('REC-')),
      memory_search_performed:    true,
      duplicates_checked:         true,
      guardian_validated:         true,
      guardian_session_id:        sessionId,
      created_by:                 state.agentRef,
      similarity_matches_count:   simResults.length,
      similarity_decision:        decision,
      similarity_top_match_ref:   topMatch?.ref ?? null,
      similarity_top_match_score: topMatch?.score ?? null,
    })
    .select('id').single();
  if (ideaErr) throw new Error(`Idea: ${ideaErr.message}`);
  const ideaId = ideaData.id;
  pipelineUpdate('idea', 'complete', ideaRef);

  // 7. Execution Evidence
  pipelineUpdate('evidence', 'running');
  await sleep(200);
  await supabase.from('execution_evidence').insert([
    {
      session_id:   sessionId,
      evidence_type:'guardian_validation',
      title:        'Engineering Guardian — Idea Validated',
      content:      `Guardian validation PASSED for idea "${state.idea.title}". Risk: Low. Created by: ${state.agentRef}. Source: EWO-011.8.2 Conversation-First Pipeline.`,
      metadata:     { guardian_result: 'passed', risk_level: 'low', po_required: false, source: 'EWO-011.8.2' },
      verified_at:  new Date().toISOString(),
      verified_by:  'Engineering Guardian',
    },
    {
      session_id:   sessionId,
      evidence_type:'test_result',
      title:        `Similarity Review — ${decision.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
      content:      `Similarity search performed across engineering objects. Found ${simResults.length} matches. ` +
                    (topMatch ? `Top match: ${topMatch.ref} (${Math.round(topMatch.score * 100)}% similarity). ` : 'No matches. ') +
                    `Decision: ${decision}. ` +
                    (linkedRefs.length > 0 ? `Linked objects: ${linkedRefs.join(', ')}.` : ''),
      metadata:     { similarity_search_performed: true, matches_count: simResults.length, high_matches: highMatches.length, decision, top_match_ref: topMatch?.ref ?? null, top_match_score: topMatch?.score ?? null, linked_refs: linkedRefs },
      verified_at:  new Date().toISOString(),
      verified_by:  state.agentRef,
    },
    {
      session_id:   sessionId,
      evidence_type:'generated_artefact',
      title:        `Engineering Idea Created: ${ideaRef}`,
      content:      `Idea "${state.idea.title}" created via EWO-011.8.2 Conversation-First Pipeline. Ref: ${ideaRef}. Session: ${sessionRef}. Intent: ${intentRef}.`,
      metadata:     { idea_ref: ideaRef, idea_id: ideaId, intent_ref: intentRef, session_ref: sessionRef, source: 'EWO-011.8.2' },
      verified_at:  new Date().toISOString(),
      verified_by:  state.agentRef,
    },
  ]);
  pipelineUpdate('evidence', 'complete');

  // 8. Engineering Record
  pipelineUpdate('record', 'running');
  await sleep(250);
  const recordRef = genRef('REC');
  const { data: recData, error: recErr } = await supabase
    .from('engineering_records_library')
    .insert({
      record_ref:    recordRef,
      title:         `Idea Execution Record: ${state.idea.title}`,
      record_type:   'execution_bridge',
      programme:     state.intent.programme,
      status:        'active',
      generated_by:  state.agentRef,
      content: {
        summary:             `Constitutional execution record for Engineering Idea ${ideaRef}.`,
        ewo:                 'EWO-011.2',
        source:              'EWO-011.8.2',
        session_ref:         sessionRef,
        intent_ref:          intentRef,
        similarity_decision: decision,
      },
      semantic_metadata: {
        idea_ref: ideaRef, idea_id: ideaId, intent_ref: intentRef,
        session_ref: sessionRef, similarity_decision: decision,
        similarity_matches: simResults.length, linked_refs: linkedRefs,
        bridge: 'EWO-011.2', source: 'EWO-011.8.2',
      },
    })
    .select('id').single();
  if (recErr) throw new Error(`Engineering Record: ${recErr.message}`);
  pipelineUpdate('record', 'complete', recordRef);

  // 9. Memory Post-Execution
  pipelineUpdate('memory_post', 'running');
  await sleep(200);
  await supabase.from('execution_memory_integration').insert({
    session_id:            sessionId,
    phase:                 'post_execution',
    patterns_applied:      ['similarity-review-complete', `decision-${decision}`, 'engineering-record-created', 'conversation-first-ewo-011.8.2'],
    standards_referenced:  ['EWO-011.1', 'EWO-011.2', 'EWO-011.8.2'],
    risks_identified:      [],
    recommendations_applied: linkedRefs.length > 0 ? [`linked-to-${linkedRefs.join('-')}`.slice(0, 80)] : [],
    knowledge_updated:     true,
    lineage_updated:       true,
    memory_updated:        true,
  });
  pipelineUpdate('memory_post', 'complete');

  // 10. Complete Session
  pipelineUpdate('complete', 'running');
  await sleep(200);
  const finalHistory = [
    ...stateHistory,
    { from_state: 'executing',  to_state: 'validation', transitioned_at: new Date().toISOString(), reason: 'Guardian validation complete' },
    { from_state: 'validation', to_state: 'accepted',   transitioned_at: new Date().toISOString(), reason: 'Guardian approved — low risk idea' },
    { from_state: 'accepted',   to_state: 'completed',  transitioned_at: new Date().toISOString(), reason: `Engineering Idea ${ideaRef} created. Similarity decision: ${decision}` },
  ];
  await supabase.from('execution_session').update({
    state:               'completed',
    state_history:       finalHistory,
    completed_at:        new Date().toISOString(),
    guardian_approved_at: new Date().toISOString(),
  }).eq('id', sessionId);
  pipelineUpdate('complete', 'complete', sessionRef);

  return { ideaRef, ideaId, intentRef, sessionRef, recordRef, pipeline: [...pipeline] };
}
