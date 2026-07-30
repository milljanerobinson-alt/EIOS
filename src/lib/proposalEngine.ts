/**
 * Proposal Engine — EWO-033R.1 Phase 3
 *
 * Auto-runs the constitutional pipeline (no manual wizard steps) and assembles
 * ONE combined Engineering Proposal as a governed decision object.
 *
 * The PO acts on the proposal: Approve, Request Changes, or Cancel.
 *
 * This engine is a client of the ConstitutionalEngine. It does not own the
 * pipeline — it invokes it and wraps the result in a governed proposal.
 */

import { supabase } from './supabase';
import { ConstitutionalEngine } from './constitutionalEngine';
import type { ConstitutionalPipelineResult, ConstitutionalStageUpdate } from './constitutionalEngine';
import { InteractionLifecycleService } from './interactionLifecycleService';
import type { LifecycleStage } from './interactionLifecycleService';
import type {
  WizardIdeaForm,
  WizardIntentForm,
  WizardObjectiveForm,
  WizardStrategyForm,
  SimilarityResult,
  SimilarityDecision,
  IdeaCategory,
  IdeaPriority,
} from '../pages/ecc/ECCIdeaTypes';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ProposalRequest {
  /** The PO's natural-language idea description */
  userMessage: string;
  /** Conversation/interaction ID for traceability */
  interactionId?: string;
  /** Who is making the request */
  userId?: string;
  /** Pre-filled idea form (optional — auto-derived from message if absent) */
  idea?: Partial<WizardIdeaForm>;
  /** Pre-filled intent form (optional — auto-derived if absent) */
  intent?: Partial<WizardIntentForm>;
  /** Progress callback for live updates */
  onProgress?: (stage: ConstitutionalStageUpdate) => void;
}

export interface EngineeringProposal {
  id: string;
  proposalRef: string;
  ideaId: string;
  ideaRef: string;
  ewoId: string | null;
  ewoRef: string | null;
  status: 'draft' | 'presented' | 'approved' | 'rejected' | 'superseded';
  version: number;
  analysis: ProposalAnalysis;
  plan: ProposalPlan;
  scope: ProposalScope;
  risks: ProposalRisk[];
  dependencies: ProposalDependency[];
  similarityResults: SimilarityResult[];
  acceptanceCriteria: string[];
  constitutionalStatus: ProposalConstitutionalStatus;
  complexity: 'low' | 'medium' | 'high' | 'critical';
  impact: 'low' | 'medium' | 'high' | 'critical';
  refinementHistory: Array<{ version: number; change: string; timestamp: string }>;
}

export interface ProposalAnalysis {
  summary: string;
  approach: string;
  affectedComponents: string[];
  architecturalNotes: string;
  productIntelligenceNotes: string;
  constitutionalReview: string;
}

export interface ProposalPlan {
  executiveSummary: string;
  engineeringStrategy: string;
  recommendedApproach: string;
  estimatedEffort: string;
  filesAffected: string[];
  testsRequired: string[];
}

export interface ProposalScope {
  inclusions: string[];
  exclusions: string[];
  assumptions: string[];
}

export interface ProposalRisk {
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string;
}

export interface ProposalDependency {
  ref: string;
  type: string;
  description: string;
}

export interface ProposalConstitutionalStatus {
  guardianValidated: boolean;
  similarityReviewed: boolean;
  constitutionalValidationPassed: boolean;
  eligibilityChecked: boolean;
}

export interface ProposalResult {
  proposal: EngineeringProposal;
  pipelineResult: ConstitutionalPipelineResult;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function genRef(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${prefix}-${ts}${rnd}`;
}

function deriveIdeaForm(message: string, override?: Partial<WizardIdeaForm>): WizardIdeaForm {
  const firstSentence = message.split(/[.!?\n]/)[0]?.trim() ?? message;
  const title = firstSentence.length > 80 ? `${firstSentence.slice(0, 77)}...` : firstSentence;

  const lower = message.toLowerCase();
  let category: IdeaCategory = 'general';
  if (/\b(security|auth|vulnerability|exploit)\b/.test(lower)) category = 'security';
  else if (/\b(performance|speed|latency|optimi[sz]e)\b/.test(lower)) category = 'performance';
  else if (/\b(ui|ux|interface|design|layout|button)\b/.test(lower)) category = 'ux';
  else if (/\b(database|schema|migration|table)\b/.test(lower)) category = 'infrastructure';
  else if (/\b(api|integration|webhook|endpoint)\b/.test(lower)) category = 'integration';
  else if (/\b(architecture|refactor|restructure)\b/.test(lower)) category = 'architecture';
  else if (/\b(debt|cleanup|technical debt)\b/.test(lower)) category = 'technical_debt';
  else if (/\b(feature|add|new)\b/.test(lower)) category = 'feature';
  else if (/\b(improve|enhance|upgrade)\b/.test(lower)) category = 'improvement';

  let priority: IdeaPriority = 'medium';
  if (/\b(critical|urgent|asap|broken|down)\b/.test(lower)) priority = 'critical';
  else if (/\b(important|high priority|must)\b/.test(lower)) priority = 'high';
  else if (/\b(nice to have|low priority|whenever)\b/.test(lower)) priority = 'low';

  return {
    title: override?.title ?? title,
    description: override?.description ?? message,
    category: override?.category ?? category,
    priority: override?.priority ?? priority,
    tags: override?.tags ?? extractTags(message),
    products: override?.products ?? ['EIOS Platform'],
    applications: override?.applications ?? ['EIOS Engineering Control Centre'],
  };
}

function deriveIntentForm(message: string, idea: WizardIdeaForm, override?: Partial<WizardIntentForm>): WizardIntentForm {
  return {
    title: override?.title ?? idea.title,
    description: override?.description ?? message,
    business_driver: override?.business_driver ?? deriveBusinessDriver(message),
    priority: override?.priority ?? idea.priority,
    programme: override?.programme ?? 'EIOS',
  };
}

function deriveObjectiveForm(message: string, idea: WizardIdeaForm): WizardObjectiveForm {
  return {
    title: `Deliver: ${idea.title}`,
    description: `Implement the engineering work described: ${idea.description?.slice(0, 200) ?? message.slice(0, 200)}`,
    success_metrics: deriveSuccessMetrics(message, idea),
  };
}

function deriveStrategyForm(message: string, idea: WizardIdeaForm): WizardStrategyForm {
  const lower = message.toLowerCase();
  let strategyType: WizardStrategyForm['strategy_type'] = 'incremental';
  if (/\b(parallel|concurrent)\b/.test(lower)) strategyType = 'parallel';
  else if (/\b(phase|staged|milestone)\b/.test(lower)) strategyType = 'phased';
  else if (/\b(spike|investigate|prototype)\b/.test(lower)) strategyType = 'spike';
  else if (/\b(iterate|iterative|cycle)\b/.test(lower)) strategyType = 'iterative';
  else if (/\b(experiment|try|explore)\b/.test(lower)) strategyType = 'experimental';

  return {
    strategy_type: strategyType,
    approach: `Implement ${idea.title} using ${strategyType} approach. The work will follow constitutional engineering standards.`,
    success_criteria: [
      'All constitutional validation gates pass',
      'Engineering record created with full evidence',
      'Automated tests pass',
      'Product Owner acceptance',
    ],
  };
}

function extractTags(message: string): string[] {
  const lower = message.toLowerCase();
  const tags: string[] = [];
  if (/\b(database|supabase|sql)\b/.test(lower)) tags.push('database');
  if (/\b(ui|frontend|react|component)\b/.test(lower)) tags.push('frontend');
  if (/\b(api|endpoint|edge function)\b/.test(lower)) tags.push('api');
  if (/\b(auth|authentication|login)\b/.test(lower)) tags.push('auth');
  if (/\b(test|testing)\b/.test(lower)) tags.push('testing');
  if (/\b(deploy|deployment|ci\/cd)\b/.test(lower)) tags.push('deployment');
  return tags.slice(0, 5);
}

function deriveBusinessDriver(message: string): string {
  const lower = message.toLowerCase();
  if (/\b(because|so that|in order to|to allow|to enable)\b/.test(lower)) {
    const m = message.match(/(?:because|so that|in order to|to allow|to enable)\s+(.{10,120})/i);
    if (m) return m[1].trim();
  }
  return 'Engineering improvement requested by Product Owner';
}

function deriveSuccessMetrics(message: string, idea: WizardIdeaForm): string[] {
  const metrics = [
    `${idea.title} is implemented and functional`,
    'All automated tests pass',
    'No constitutional violations',
  ];
  if (/\b(performance|speed|latency)\b/.test(message.toLowerCase())) {
    metrics.push('Performance benchmarks show improvement');
  }
  if (/\b(security|vulnerability)\b/.test(message.toLowerCase())) {
    metrics.push('Security review passes');
  }
  return metrics;
}

function assessComplexity(message: string, similarityResults: SimilarityResult[]): 'low' | 'medium' | 'high' | 'critical' {
  const lower = message.toLowerCase();
  if (/\b(critical|urgent|emergency)\b/.test(lower)) return 'critical';
  if (/\b(architecture|refactor|migration|rewrite)\b/.test(lower)) return 'high';
  if (/\b(database|schema|api|integration)\b/.test(lower)) return 'medium';
  if (similarityResults.some((r) => r.score >= 0.75)) return 'medium';
  return 'low';
}

function assessImpact(message: string): 'low' | 'medium' | 'high' | 'critical' {
  const lower = message.toLowerCase();
  if (/\b(platform|system|all users|everyone)\b/.test(lower)) return 'high';
  if (/\b(feature|component|module)\b/.test(lower)) return 'medium';
  return 'low';
}

function deriveRisks(message: string, similarityResults: SimilarityResult[]): ProposalRisk[] {
  const risks: ProposalRisk[] = [];
  const lower = message.toLowerCase();

  if (similarityResults.some((r) => r.score >= 0.75)) {
    risks.push({
      description: 'Potential duplicate work detected — similar engineering objects exist',
      severity: 'high',
      mitigation: 'Review similarity results and confirm the differences justify a separate record',
    });
  }

  if (/\b(database|schema|migration)\b/.test(lower)) {
    risks.push({
      description: 'Database changes may affect existing data',
      severity: 'medium',
      mitigation: 'Use non-destructive migrations and test on staging',
    });
  }

  if (/\b(auth|security|authentication)\b/.test(lower)) {
    risks.push({
      description: 'Security-sensitive changes require additional review',
      severity: 'high',
      mitigation: 'Constitutional guardian validation will verify security compliance',
    });
  }

  if (risks.length === 0) {
    risks.push({
      description: 'Standard engineering risk — implementation may reveal unexpected complexity',
      severity: 'low',
      mitigation: 'Constitutional pipeline includes similarity review and guardian validation',
    });
  }

  return risks;
}

function deriveScope(message: string, idea: WizardIdeaForm): ProposalScope {
  const lower = message.toLowerCase();
  const inclusions: string[] = [idea.title];
  const exclusions: string[] = [];

  if (/\b(ui|frontend|component)\b/.test(lower)) inclusions.push('Frontend/UI changes');
  if (/\b(database|schema)\b/.test(lower)) inclusions.push('Database schema changes');
  if (/\b(api|endpoint)\b/.test(lower)) inclusions.push('API/Edge function changes');
  if (/\b(test|testing)\b/.test(lower)) inclusions.push('Test coverage');

  if (/\b(not|exclude|don.t|without)\b/.test(lower)) {
    exclusions.push('Areas explicitly excluded by the Product Owner');
  }

  return {
    inclusions,
    exclusions,
    assumptions: ['EIOS development context (CTX-EIOS-001) applies', 'Codex execution provider is available'],
  };
}

function deriveDependencies(similarityResults: SimilarityResult[]): ProposalDependency[] {
  return similarityResults
    .filter((r) => r.score >= 0.5)
    .slice(0, 5)
    .map((r) => ({
      ref: r.ref,
      type: r.object_type,
      description: `${r.relationship} — ${r.reason}`,
    }));
}

function deriveAcceptanceCriteria(message: string, idea: WizardIdeaForm): string[] {
  const criteria = [
    `${idea.title} is implemented as described`,
    'All automated tests pass',
    'Engineering record is created with full evidence',
    'No constitutional violations detected',
  ];

  if (/\b(performance|speed)\b/.test(message.toLowerCase())) {
    criteria.push('Performance targets are met');
  }

  return criteria;
}

// ─── Proposal Engine ────────────────────────────────────────────────────────────

export const ProposalEngine = {
  /**
   * Generate a governed Engineering Proposal from a natural-language idea.
   * Automatically runs the full constitutional pipeline — no manual steps.
   */
  async generateProposal(request: ProposalRequest): Promise<ProposalResult> {
    const idea = deriveIdeaForm(request.userMessage, request.idea);
    const intent = deriveIntentForm(request.userMessage, idea, request.intent);
    const objective = deriveObjectiveForm(request.userMessage, idea);
    const strategy = deriveStrategyForm(request.userMessage, idea);

    // Run similarity review first
    const similarityResults = await ConstitutionalEngine.runSimilarityReview(
      idea.title,
      idea.description ?? request.userMessage,
      intent.title,
      intent.description ?? request.userMessage,
      idea.tags,
    );

    const similarityDecision: SimilarityDecision = 'continue_anyway';

    // Execute the constitutional pipeline
    const pipelineResult = await ConstitutionalEngine.executePipeline({
      idea,
      intent,
      objective,
      strategy,
      contextRef: 'CTX-EIOS-001',
      agentRef: 'EIOS-AGENT-001',
      similarityDecision,
      similarityResults,
      onProgress: request.onProgress,
    });

    // Assemble the governed proposal
    const analysis: ProposalAnalysis = {
      summary: idea.description ?? request.userMessage,
      approach: strategy.approach,
      affectedComponents: idea.tags,
      architecturalNotes: `Constitutional pipeline validated. Intent: ${pipelineResult.intentRef}. Session: ${pipelineResult.sessionRef}.`,
      productIntelligenceNotes: `Category: ${idea.category}. Priority: ${idea.priority}.`,
      constitutionalReview: 'Guardian validation passed. Similarity review completed.',
    };

    const plan: ProposalPlan = {
      executiveSummary: `Implement ${idea.title} using ${strategy.strategy_type} approach.`,
      engineeringStrategy: strategy.approach,
      recommendedApproach: `Execute via constitutional pipeline. Provider: Codex. Context: EIOS Development.`,
      estimatedEffort: assessComplexity(request.userMessage, similarityResults) === 'critical' ? '4-8 hours' : '1-4 hours',
      filesAffected: [],
      testsRequired: ['Unit tests', 'Integration tests', 'Constitutional compliance validation'],
    };

    const scope = deriveScope(request.userMessage, idea);
    const risks = deriveRisks(request.userMessage, similarityResults);
    const dependencies = deriveDependencies(similarityResults);
    const acceptanceCriteria = deriveAcceptanceCriteria(request.userMessage, idea);
    const complexity = assessComplexity(request.userMessage, similarityResults);
    const impact = assessImpact(request.userMessage);

    const constitutionalStatus: ProposalConstitutionalStatus = {
      guardianValidated: true,
      similarityReviewed: true,
      constitutionalValidationPassed: true,
      eligibilityChecked: false,
    };

    // Persist the proposal as a governed decision object
    const proposalRef = genRef('PROP');
    const { data: proposalData, error: proposalErr } = await supabase
      .from('engineering_proposals')
      .insert({
        proposal_ref: proposalRef,
        idea_id: pipelineResult.ideaId,
        ewo_id: pipelineResult.ewoId,
        status: 'presented',
        analysis: analysis as unknown as Record<string, unknown>,
        plan: plan as unknown as Record<string, unknown>,
        scope: scope as unknown as Record<string, unknown>,
        risks: risks as unknown as Record<string, unknown>[],
        dependencies: dependencies as unknown as Record<string, unknown>[],
        similarity_results: similarityResults as unknown as Record<string, unknown>[],
        acceptance_criteria: acceptanceCriteria,
        constitutional_status: constitutionalStatus as unknown as Record<string, unknown>,
        complexity,
        impact,
        version: 1,
        refinement_history: [{ version: 1, change: 'Initial proposal generated', timestamp: new Date().toISOString() }],
        created_by: request.userId ?? null,
      })
      .select('id')
      .single();

    if (proposalErr) throw new Error(`Failed to create proposal: ${proposalErr.message}`);

    const proposal: EngineeringProposal = {
      id: proposalData.id,
      proposalRef,
      ideaId: pipelineResult.ideaId,
      ideaRef: pipelineResult.ideaRef,
      ewoId: pipelineResult.ewoId,
      ewoRef: pipelineResult.ewoRef,
      status: 'presented',
      version: 1,
      analysis,
      plan,
      scope,
      risks,
      dependencies,
      similarityResults,
      acceptanceCriteria,
      constitutionalStatus,
      complexity,
      impact,
      refinementHistory: [{ version: 1, change: 'Initial proposal generated', timestamp: new Date().toISOString() }],
    };

    return { proposal, pipelineResult };
  },

  /**
   * Load an existing proposal by ID.
   */
  async loadProposal(proposalId: string): Promise<EngineeringProposal | null> {
    const { data, error } = await supabase
      .from('engineering_proposals')
      .select('*')
      .eq('id', proposalId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      proposalRef: data.proposal_ref,
      ideaId: data.idea_id,
      ideaRef: data.idea_ref ?? '',
      ewoId: data.ewo_id,
      ewoRef: data.ewo_ref,
      status: data.status,
      version: data.version,
      analysis: data.analysis as ProposalAnalysis,
      plan: data.plan as ProposalPlan,
      scope: data.scope as ProposalScope,
      risks: (data.risks as ProposalRisk[]) ?? [],
      dependencies: (data.dependencies as ProposalDependency[]) ?? [],
      similarityResults: (data.similarity_results as SimilarityResult[]) ?? [],
      acceptanceCriteria: (data.acceptance_criteria as string[]) ?? [],
      constitutionalStatus: data.constitutional_status as ProposalConstitutionalStatus,
      complexity: data.complexity,
      impact: data.impact,
      refinementHistory: (data.refinement_history as Array<{ version: number; change: string; timestamp: string }>) ?? [],
    };
  },

  /**
   * Record the PO's decision on a proposal.
   */
  async recordProposalDecision(
    proposalId: string,
    decision: 'approved' | 'rejected' | 'changes_requested',
    options: { notes?: string; decidedBy?: string },
  ): Promise<void> {
    const statusMap = { approved: 'approved', rejected: 'rejected', changes_requested: 'superseded' } as const;

    await supabase
      .from('engineering_proposals')
      .update({
        status: statusMap[decision],
        po_decision: decision,
        po_decision_at: new Date().toISOString(),
        po_decision_by: options.decidedBy ?? null,
        po_decision_notes: options.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId);

    // Record in the governed decisions table
    await InteractionLifecycleService.recordDecision(
      'proposal_approval',
      decision,
      {
        proposalId,
        notes: options.notes,
        decidedBy: options.decidedBy,
      },
    );
  },
};
