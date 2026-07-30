import { supabase } from './supabase';
import { ATDCapabilityFramework } from './atdCapabilityFramework';

// ─── Engineering Object Types ─────────────────────────────────────────────────

export type IntentStatus =
  | 'captured' | 'analysed' | 'planned' | 'in_review'
  | 'approved' | 'rejected' | 'implementing' | 'validating'
  | 'extracting_knowledge' | 'intelligence_updated' | 'complete' | 'cancelled';

export type PipelineStage =
  | 'intent_understanding' | 'engineering_analysis' | 'engineering_planning'
  | 'review_preparation' | 'approval' | 'implementation_coordination'
  | 'validation' | 'knowledge_extraction' | 'intelligence_update' | 'complete';

export type PipelineStatus = 'running' | 'paused' | 'waiting_approval' | 'complete' | 'failed' | 'cancelled';

export interface EngineeringIntent {
  id: string;
  intent_ref: string;
  title: string;
  raw_input: string;
  requested_outcome: string | null;
  business_objective: string | null;
  engineering_objective: string | null;
  scope: string | null;
  constraints: string | null;
  status: IntentStatus;
  pipeline_execution_id: string | null;
  notes: string | null;
  source_conversation_id: string | null;
  lifecycle_status: 'active' | 'completed' | 'archived' | 'deleted' | 'purged';
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
  archived_at: string | null;
  restored_at: string | null;
  restored_from_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineExecution {
  id: string;
  pipeline_ref: string;
  intent_id: string;
  current_stage: PipelineStage;
  status: PipelineStatus;
  started_at: string;
  completed_at: string | null;
  stage_history: StageHistoryEntry[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageHistoryEntry {
  stage: PipelineStage;
  entered_at: string;
  exited_at?: string;
  outcome: 'complete' | 'failed' | 'skipped' | 'waiting';
}

export interface PipelineState {
  id: string;
  pipeline_execution_id: string;
  stage: string;
  state_data: Record<string, unknown>;
  entered_at: string;
  exited_at: string | null;
  outcome: 'pending' | 'running' | 'complete' | 'failed' | 'skipped' | 'waiting';
  created_at: string;
}

export interface EngineeringAnalysis {
  id: string;
  analysis_ref: string;
  intent_id: string;
  pipeline_execution_id: string | null;
  constitution_review: string | null;
  standards_reviewed: string[];
  architecture_notes: string | null;
  existing_features_reviewed: unknown[];
  eig_entities_reviewed: string[];
  product_intelligence_notes: string | null;
  roadmap_alignment: string | null;
  dependencies: unknown[];
  risks: unknown[];
  complexity_assessment: 'low' | 'medium' | 'high' | 'critical' | null;
  summary: string | null;
  status: 'draft' | 'complete';
  created_at: string;
  updated_at: string;
}

export interface EngineeringPlan {
  id: string;
  plan_ref: string;
  intent_id: string;
  analysis_id: string | null;
  pipeline_execution_id: string | null;
  executive_summary: string | null;
  engineering_strategy: string | null;
  recommended_approach: string | null;
  dependencies: unknown[];
  risks: unknown[];
  estimated_effort: string | null;
  engineering_phases: EngineeringPhase[];
  required_ewos: string[];
  status: 'draft' | 'submitted_for_review' | 'approved' | 'approved_with_conditions' | 'rejected' | 'implementing' | 'complete';
  lifecycle_status: 'active' | 'completed' | 'archived' | 'deleted' | 'purged';
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
  archived_at: string | null;
  restored_at: string | null;
  restored_from_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface EngineeringPhase {
  phase: number;
  name: string;
  description: string;
  estimated_effort: string;
  capabilities_required: string[];
}

export interface ReviewRequest {
  id: string;
  request_ref: string;
  plan_id: string;
  intent_id: string;
  pipeline_execution_id: string | null;
  reviewer_type: 'architecture' | 'engineering' | 'constitutional' | 'qa' | 'product';
  review_package: Record<string, unknown>;
  status: 'pending' | 'in_review' | 'approved' | 'approved_with_conditions' | 'rejected' | 'request_changes' | 'cancelled';
  submitted_at: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewResponse {
  id: string;
  review_request_id: string;
  decision: 'approved' | 'approved_with_conditions' | 'rejected' | 'request_changes';
  conditions: string | null;
  notes: string | null;
  responded_by: string | null;
  responded_at: string;
  created_at: string;
}

export interface EngineeringDecision {
  id: string;
  decision_ref: string;
  intent_id: string;
  pipeline_execution_id: string | null;
  stage: 'analysis' | 'planning' | 'review' | 'implementation' | 'validation' | 'governance';
  decision_type: 'approve' | 'reject' | 'defer' | 'escalate' | 'request_changes' | 'accept_risk';
  rationale: string;
  made_by: string;
  decided_at: string;
  related_ewo_ref: string | null;
  conditions: string | null;
  created_at: string;
}

export interface ImplementationRequest {
  id: string;
  request_ref: string;
  plan_id: string;
  intent_id: string;
  pipeline_execution_id: string | null;
  ewo_ref: string | null;
  capability_key: string | null;
  implementation_package: Record<string, unknown>;
  status: 'pending' | 'in_progress' | 'complete' | 'failed' | 'cancelled';
  requested_at: string;
  completed_at: string | null;
  result_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface ValidationResult {
  id: string;
  validation_ref: string;
  intent_id: string;
  pipeline_execution_id: string | null;
  validation_type: 'engineering' | 'qa' | 'architecture' | 'constitutional';
  outcome: 'pending' | 'passed' | 'failed' | 'partial' | 'skipped';
  findings: unknown[];
  validated_by: string | null;
  validated_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface KnowledgeRecord {
  id: string;
  record_ref: string;
  intent_id: string | null;
  pipeline_execution_id: string | null;
  knowledge_type: 'pattern' | 'lesson' | 'standard' | 'architecture_improvement' | 'recommendation';
  title: string;
  content: string;
  tags: string[];
  relevance_score: number;
  eig_entity_id: string | null;
  created_at: string;
}

// ─── Ref generators ───────────────────────────────────────────────────────────

async function nextRef(table: string, prefix: string): Promise<string> {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
  const n = ((count ?? 0) + 1).toString().padStart(3, '0');
  return `${prefix}-${n}`;
}

// ─── Cognitive Engine ─────────────────────────────────────────────────────────

export const ATDCognitiveEngine = {

  // ── Stage 1: Intent Understanding ─────────────────────────────────────────

  async captureIntent(input: {
    title: string;
    raw_input: string;
    requested_outcome?: string;
    business_objective?: string;
    engineering_objective?: string;
    scope?: string;
    constraints?: string;
    context_type?: string;
    context_id?: string;
    project_id?: string | null;
  }): Promise<{ intent: EngineeringIntent; pipeline: PipelineExecution }> {
    const intent_ref = await nextRef('atd_engineering_intents', 'ATD-INT');
    const pipeline_ref = await nextRef('atd_pipeline_executions', 'ATD-PIPE');

    const { context_type = 'platform', context_id = 'platform', project_id = null, ...rest } = input;

    // Insert intent first
    const { data: intentData, error: intentErr } = await supabase
      .from('atd_engineering_intents')
      .insert({ intent_ref, ...rest, status: 'captured', context_type, context_id, project_id })
      .select()
      .single();
    if (intentErr) throw intentErr;

    // Create pipeline execution
    const { data: pipelineData, error: pipelineErr } = await supabase
      .from('atd_pipeline_executions')
      .insert({
        pipeline_ref,
        intent_id: intentData.id,
        current_stage: 'intent_understanding',
        status: 'running',
        stage_history: [{
          stage: 'intent_understanding',
          entered_at: new Date().toISOString(),
          outcome: 'complete',
          exited_at: new Date().toISOString(),
        }],
      })
      .select()
      .single();
    if (pipelineErr) throw pipelineErr;

    // Link pipeline back to intent
    await supabase
      .from('atd_engineering_intents')
      .update({ pipeline_execution_id: pipelineData.id })
      .eq('id', intentData.id);

    // Record capability execution
    const exec = await ATDCapabilityFramework.recordExecution({
      capability_key: 'intent_understanding',
      pipeline_execution_id: pipelineData.id,
      intent_id: intentData.id,
      input_payload: { raw_input: input.raw_input },
    });
    await ATDCapabilityFramework.completeExecution(
      exec.id,
      { intent_ref, title: input.title },
      50,
    );

    // Advance pipeline from intent_understanding to engineering_analysis
    await this._advancePipelineStage(pipelineData.id, 'intent_understanding', 'engineering_analysis');

    return {
      intent: { ...intentData, pipeline_execution_id: pipelineData.id } as EngineeringIntent,
      pipeline: pipelineData as PipelineExecution,
    };
  },

  // ── Stage 2: Engineering Analysis ─────────────────────────────────────────

  async runAnalysis(input: {
    intent_id: string;
    pipeline_execution_id: string;
    constitution_review?: string;
    standards_reviewed?: string[];
    architecture_notes?: string;
    product_intelligence_notes?: string;
    roadmap_alignment?: string;
    dependencies?: unknown[];
    risks?: unknown[];
    complexity_assessment?: 'low' | 'medium' | 'high' | 'critical';
    summary?: string;
    // AI draft learning capture
    ai_draft_summary?: string;
    ai_draft_constitution_review?: string;
    ai_draft_architecture_notes?: string;
    ai_draft_product_intelligence_notes?: string;
    ai_draft_complexity_assessment?: string;
    ai_confidence_score?: string;
    ai_confidence_explanation?: string;
    ai_evidence?: unknown[];
    ai_generated_at?: string;
    po_edits_made?: boolean;
    original_ai_draft?: unknown;
    generation_count?: number;
  }): Promise<EngineeringAnalysis> {
    const analysis_ref = await nextRef('atd_engineering_analyses', 'ATD-ANA');

    const exec = await ATDCapabilityFramework.recordExecution({
      capability_key: 'engineering_analysis',
      pipeline_execution_id: input.pipeline_execution_id,
      intent_id: input.intent_id,
      input_payload: { intent_id: input.intent_id },
    });

    const { data, error } = await supabase
      .from('atd_engineering_analyses')
      .insert({
        analysis_ref,
        intent_id: input.intent_id,
        pipeline_execution_id: input.pipeline_execution_id,
        constitution_review: input.constitution_review ?? null,
        standards_reviewed: input.standards_reviewed ?? [],
        architecture_notes: input.architecture_notes ?? null,
        product_intelligence_notes: input.product_intelligence_notes ?? null,
        roadmap_alignment: input.roadmap_alignment ?? null,
        dependencies: input.dependencies ?? [],
        risks: input.risks ?? [],
        complexity_assessment: input.complexity_assessment ?? null,
        summary: input.summary ?? null,
        status: 'complete',
        ai_draft_summary: input.ai_draft_summary ?? null,
        ai_draft_constitution_review: input.ai_draft_constitution_review ?? null,
        ai_draft_architecture_notes: input.ai_draft_architecture_notes ?? null,
        ai_draft_product_intelligence_notes: input.ai_draft_product_intelligence_notes ?? null,
        ai_draft_complexity_assessment: input.ai_draft_complexity_assessment ?? null,
        ai_confidence_score: input.ai_confidence_score ?? null,
        ai_confidence_explanation: input.ai_confidence_explanation ?? null,
        ai_evidence: input.ai_evidence ?? [],
        ai_generated_at: input.ai_generated_at ?? null,
        po_edits_made: input.po_edits_made ?? false,
        original_ai_draft: input.original_ai_draft ?? null,
        generation_count: input.generation_count ?? 0,
      })
      .select()
      .single();
    if (error) throw error;

    await ATDCapabilityFramework.completeExecution(exec.id, { analysis_ref }, 100);

    await supabase
      .from('atd_engineering_intents')
      .update({ status: 'analysed', updated_at: new Date().toISOString() })
      .eq('id', input.intent_id);

    await this._advancePipelineStage(input.pipeline_execution_id, 'engineering_analysis', 'engineering_planning');

    return data as EngineeringAnalysis;
  },

  // ── Stage 3: Engineering Planning ─────────────────────────────────────────

  async generatePlan(input: {
    intent_id: string;
    analysis_id: string;
    pipeline_execution_id: string;
    executive_summary?: string;
    engineering_strategy?: string;
    recommended_approach?: string;
    dependencies?: unknown[];
    risks?: unknown[];
    estimated_effort?: string;
    engineering_phases?: EngineeringPhase[];
    required_ewos?: string[];
    // AI draft learning capture
    ai_draft_executive_summary?: string;
    ai_draft_engineering_strategy?: string;
    ai_draft_recommended_approach?: string;
    ai_draft_estimated_effort?: string;
    ai_confidence_score?: string;
    ai_confidence_explanation?: string;
    ai_evidence?: unknown[];
    ai_generated_at?: string;
    po_edits_made?: boolean;
    original_ai_draft?: unknown;
    generation_count?: number;
  }): Promise<EngineeringPlan> {
    const plan_ref = await nextRef('atd_engineering_plans', 'ATD-PLN');

    const exec = await ATDCapabilityFramework.recordExecution({
      capability_key: 'engineering_planning',
      pipeline_execution_id: input.pipeline_execution_id,
      intent_id: input.intent_id,
      input_payload: { intent_id: input.intent_id, analysis_id: input.analysis_id },
    });

    const { data, error } = await supabase
      .from('atd_engineering_plans')
      .insert({
        plan_ref,
        intent_id: input.intent_id,
        analysis_id: input.analysis_id,
        pipeline_execution_id: input.pipeline_execution_id,
        executive_summary: input.executive_summary ?? null,
        engineering_strategy: input.engineering_strategy ?? null,
        recommended_approach: input.recommended_approach ?? null,
        dependencies: input.dependencies ?? [],
        risks: input.risks ?? [],
        estimated_effort: input.estimated_effort ?? null,
        engineering_phases: input.engineering_phases ?? [],
        required_ewos: input.required_ewos ?? [],
        status: 'draft',
        ai_draft_executive_summary: input.ai_draft_executive_summary ?? null,
        ai_draft_engineering_strategy: input.ai_draft_engineering_strategy ?? null,
        ai_draft_recommended_approach: input.ai_draft_recommended_approach ?? null,
        ai_draft_estimated_effort: input.ai_draft_estimated_effort ?? null,
        ai_confidence_score: input.ai_confidence_score ?? null,
        ai_confidence_explanation: input.ai_confidence_explanation ?? null,
        ai_evidence: input.ai_evidence ?? [],
        ai_generated_at: input.ai_generated_at ?? null,
        po_edits_made: input.po_edits_made ?? false,
        original_ai_draft: input.original_ai_draft ?? null,
        generation_count: input.generation_count ?? 0,
      })
      .select()
      .single();
    if (error) throw error;

    await ATDCapabilityFramework.completeExecution(exec.id, { plan_ref }, 120);

    await supabase
      .from('atd_engineering_intents')
      .update({ status: 'planned', updated_at: new Date().toISOString() })
      .eq('id', input.intent_id);

    await this._advancePipelineStage(input.pipeline_execution_id, 'engineering_planning', 'review_preparation');

    return data as EngineeringPlan;
  },

  // ── Stage 4: Review Preparation ───────────────────────────────────────────

  async prepareReview(input: {
    plan_id: string;
    intent_id: string;
    pipeline_execution_id: string;
    reviewer_type: ReviewRequest['reviewer_type'];
    review_package?: Record<string, unknown>;
  }): Promise<ReviewRequest> {
    const request_ref = await nextRef('atd_review_requests', 'ATD-REV');

    const exec = await ATDCapabilityFramework.recordExecution({
      capability_key: 'review_preparation',
      pipeline_execution_id: input.pipeline_execution_id,
      intent_id: input.intent_id,
      input_payload: { plan_id: input.plan_id, reviewer_type: input.reviewer_type },
    });

    const { data, error } = await supabase
      .from('atd_review_requests')
      .insert({
        request_ref,
        plan_id: input.plan_id,
        intent_id: input.intent_id,
        pipeline_execution_id: input.pipeline_execution_id,
        reviewer_type: input.reviewer_type,
        review_package: input.review_package ?? {},
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;

    await ATDCapabilityFramework.completeExecution(exec.id, { request_ref }, 80);

    await supabase
      .from('atd_engineering_intents')
      .update({ status: 'in_review', updated_at: new Date().toISOString() })
      .eq('id', input.intent_id);

    await supabase
      .from('atd_pipeline_executions')
      .update({ status: 'waiting_approval', updated_at: new Date().toISOString() })
      .eq('id', input.pipeline_execution_id);

    await this._advancePipelineStage(input.pipeline_execution_id, 'review_preparation', 'approval');

    return data as ReviewRequest;
  },

  // ── Stage 5: Record Decision ───────────────────────────────────────────────

  async recordDecision(input: {
    intent_id: string;
    pipeline_execution_id: string;
    stage: EngineeringDecision['stage'];
    decision_type: EngineeringDecision['decision_type'];
    rationale: string;
    made_by?: string;
    related_ewo_ref?: string;
    conditions?: string;
  }): Promise<EngineeringDecision> {
    const decision_ref = await nextRef('atd_engineering_decisions', 'ATD-DEC');

    const { data, error } = await supabase
      .from('atd_engineering_decisions')
      .insert({
        decision_ref,
        intent_id: input.intent_id,
        pipeline_execution_id: input.pipeline_execution_id,
        stage: input.stage,
        decision_type: input.decision_type,
        rationale: input.rationale,
        made_by: input.made_by ?? 'Product Owner',
        related_ewo_ref: input.related_ewo_ref ?? null,
        conditions: input.conditions ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    if (input.decision_type === 'approve') {
      await supabase
        .from('atd_engineering_intents')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', input.intent_id);
      await supabase
        .from('atd_pipeline_executions')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', input.pipeline_execution_id);
      await this._advancePipelineStage(input.pipeline_execution_id, 'approval', 'implementation_coordination');
    } else if (input.decision_type === 'reject') {
      await supabase
        .from('atd_engineering_intents')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', input.intent_id);
      await supabase
        .from('atd_pipeline_executions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', input.pipeline_execution_id);
    } else if (input.decision_type === 'request_changes') {
      await supabase
        .from('atd_engineering_intents')
        .update({ status: 'submitted_for_review', updated_at: new Date().toISOString() })
        .eq('id', input.intent_id);
      await this._advancePipelineStage(input.pipeline_execution_id, 'approval', 'review_preparation');
    }

    return data as EngineeringDecision;
  },

  // ── Stage 6: Create Implementation Request ────────────────────────────────

  async createImplementationRequest(input: {
    plan_id: string;
    intent_id: string;
    pipeline_execution_id: string;
    ewo_ref?: string;
    implementation_package?: Record<string, unknown>;
  }): Promise<ImplementationRequest> {
    const request_ref = await nextRef('atd_implementation_requests', 'ATD-IMP');

    const exec = await ATDCapabilityFramework.recordExecution({
      capability_key: 'implementation_coord',
      pipeline_execution_id: input.pipeline_execution_id,
      intent_id: input.intent_id,
      input_payload: { plan_id: input.plan_id },
    });

    const { data, error } = await supabase
      .from('atd_implementation_requests')
      .insert({
        request_ref,
        plan_id: input.plan_id,
        intent_id: input.intent_id,
        pipeline_execution_id: input.pipeline_execution_id,
        ewo_ref: input.ewo_ref ?? null,
        capability_key: 'implementation_coord',
        implementation_package: input.implementation_package ?? {},
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;

    await ATDCapabilityFramework.completeExecution(exec.id, { request_ref }, 60);

    await supabase
      .from('atd_engineering_intents')
      .update({ status: 'implementing', updated_at: new Date().toISOString() })
      .eq('id', input.intent_id);

    return data as ImplementationRequest;
  },

  // ── Stage 7: Record Validation ────────────────────────────────────────────

  async recordValidation(input: {
    intent_id: string;
    pipeline_execution_id: string;
    validation_type: ValidationResult['validation_type'];
    outcome: ValidationResult['outcome'];
    findings?: unknown[];
    validated_by?: string;
    notes?: string;
  }): Promise<ValidationResult> {
    const validation_ref = await nextRef('atd_validation_results', 'ATD-VAL');

    const { data, error } = await supabase
      .from('atd_validation_results')
      .insert({
        validation_ref,
        intent_id: input.intent_id,
        pipeline_execution_id: input.pipeline_execution_id,
        validation_type: input.validation_type,
        outcome: input.outcome,
        findings: input.findings ?? [],
        validated_by: input.validated_by ?? null,
        validated_at: new Date().toISOString(),
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    if (input.outcome === 'passed') {
      await supabase
        .from('atd_engineering_intents')
        .update({ status: 'validating', updated_at: new Date().toISOString() })
        .eq('id', input.intent_id);
    }

    return data as ValidationResult;
  },

  // ── Stage 8: Extract Knowledge ────────────────────────────────────────────

  async extractKnowledge(input: {
    intent_id: string;
    pipeline_execution_id: string;
    records: Array<{
      knowledge_type: KnowledgeRecord['knowledge_type'];
      title: string;
      content: string;
      tags?: string[];
      relevance_score?: number;
    }>;
  }): Promise<KnowledgeRecord[]> {
    const exec = await ATDCapabilityFramework.recordExecution({
      capability_key: 'knowledge_extraction',
      pipeline_execution_id: input.pipeline_execution_id,
      intent_id: input.intent_id,
      input_payload: { record_count: input.records.length },
    });

    const results: KnowledgeRecord[] = [];

    for (const rec of input.records) {
      const record_ref = await nextRef('atd_knowledge_records', 'ATD-KNW');
      const { data, error } = await supabase
        .from('atd_knowledge_records')
        .insert({
          record_ref,
          intent_id: input.intent_id,
          pipeline_execution_id: input.pipeline_execution_id,
          knowledge_type: rec.knowledge_type,
          title: rec.title,
          content: rec.content,
          tags: rec.tags ?? [],
          relevance_score: rec.relevance_score ?? 70,
        })
        .select()
        .single();
      if (error) throw error;
      results.push(data as KnowledgeRecord);
    }

    await ATDCapabilityFramework.completeExecution(exec.id, { records_created: results.length }, 80);

    await supabase
      .from('atd_engineering_intents')
      .update({ status: 'extracting_knowledge', updated_at: new Date().toISOString() })
      .eq('id', input.intent_id);

    await this._advancePipelineStage(input.pipeline_execution_id, 'knowledge_extraction', 'intelligence_update');

    return results;
  },

  // ── Stage 9: Intelligence Update ──────────────────────────────────────────

  async completeIntelligenceUpdate(intent_id: string, pipeline_execution_id: string): Promise<void> {
    const exec = await ATDCapabilityFramework.recordExecution({
      capability_key: 'intelligence_update',
      pipeline_execution_id,
      intent_id,
      input_payload: { intent_id },
    });

    await supabase
      .from('atd_engineering_intents')
      .update({ status: 'complete', updated_at: new Date().toISOString() })
      .eq('id', intent_id);

    await supabase
      .from('atd_pipeline_executions')
      .update({
        status: 'complete',
        current_stage: 'complete',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pipeline_execution_id);

    await ATDCapabilityFramework.completeExecution(exec.id, { completed: true }, 40);
  },

  // ── Queries ────────────────────────────────────────────────────────────────

  async listIntents(limit = 20, ctx?: { context_type: string; context_id: string }): Promise<EngineeringIntent[]> {
    let q = supabase
      .from('atd_engineering_intents')
      .select('*')
      .neq('lifecycle_status', 'deleted');
    if (ctx) {
      q = q.eq('context_type', ctx.context_type).eq('context_id', ctx.context_id);
    }
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as EngineeringIntent[];
  },

  async getIntentWithPipeline(intentId: string): Promise<{
    intent: EngineeringIntent;
    pipeline: PipelineExecution | null;
    analysis: EngineeringAnalysis | null;
    plan: EngineeringPlan | null;
    decisions: EngineeringDecision[];
    reviews: ReviewRequest[];
    validations: ValidationResult[];
    knowledge: KnowledgeRecord[];
  }> {
    const [intentRes, analysisRes, planRes, decisionsRes, reviewsRes, validationsRes, knowledgeRes] = await Promise.all([
      supabase.from('atd_engineering_intents').select('*').eq('id', intentId).single(),
      supabase.from('atd_engineering_analyses').select('*').eq('intent_id', intentId).order('created_at', { ascending: false }).limit(1),
      supabase.from('atd_engineering_plans').select('*').eq('intent_id', intentId).neq('lifecycle_status', 'deleted').order('created_at', { ascending: false }).limit(1),
      supabase.from('atd_engineering_decisions').select('*').eq('intent_id', intentId).order('decided_at', { ascending: false }),
      supabase.from('atd_review_requests').select('*').eq('intent_id', intentId).order('created_at', { ascending: false }),
      supabase.from('atd_validation_results').select('*').eq('intent_id', intentId).order('created_at', { ascending: false }),
      supabase.from('atd_knowledge_records').select('*').eq('intent_id', intentId).order('created_at', { ascending: false }),
    ]);

    const intent = intentRes.data as EngineeringIntent;
    let pipeline: PipelineExecution | null = null;

    if (intent.pipeline_execution_id) {
      const { data } = await supabase
        .from('atd_pipeline_executions')
        .select('*')
        .eq('id', intent.pipeline_execution_id)
        .maybeSingle();
      pipeline = data as PipelineExecution | null;
    }

    return {
      intent,
      pipeline,
      analysis: (analysisRes.data?.[0] ?? null) as EngineeringAnalysis | null,
      plan: (planRes.data?.[0] ?? null) as EngineeringPlan | null,
      decisions: (decisionsRes.data ?? []) as EngineeringDecision[],
      reviews: (reviewsRes.data ?? []) as ReviewRequest[],
      validations: (validationsRes.data ?? []) as ValidationResult[],
      knowledge: (knowledgeRes.data ?? []) as KnowledgeRecord[],
    };
  },

  async listPipelines(limit = 10, ctx?: { context_type: string; context_id: string }): Promise<PipelineExecution[]> {
    // Fetch pipelines then filter out those whose parent intent is deleted (or out-of-context)
    const { data, error } = await supabase
      .from('atd_pipeline_executions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit * 2); // fetch extra to account for filtered-out deleted
    if (error) throw error;
    const pipelines = (data ?? []) as PipelineExecution[];

    // Get intent IDs referenced in these pipelines
    const intentIds = [...new Set(pipelines.map(p => p.intent_id).filter(Boolean))];
    if (intentIds.length === 0) return [];

    let intentQ = supabase
      .from('atd_engineering_intents')
      .select('id, lifecycle_status, context_type, context_id')
      .in('id', intentIds);

    const { data: intents } = await intentQ;

    const excludedIntentIds = new Set(
      (intents ?? [])
        .filter(i => {
          if (i.lifecycle_status === 'deleted') return true;
          if (ctx && (i.context_type !== ctx.context_type || i.context_id !== ctx.context_id)) return true;
          return false;
        })
        .map(i => i.id)
    );

    return pipelines
      .filter(p => !excludedIntentIds.has(p.intent_id))
      .slice(0, limit);
  },

  async listKnowledge(limit = 20, ctx?: { context_type: string; context_id: string }): Promise<KnowledgeRecord[]> {
    if (ctx) {
      // Resolve intent IDs for this context, then filter knowledge by them
      const { data: intents } = await supabase
        .from('atd_engineering_intents')
        .select('id')
        .eq('context_type', ctx.context_type)
        .eq('context_id', ctx.context_id)
        .neq('lifecycle_status', 'deleted');
      const intentIds = (intents ?? []).map(i => i.id);
      if (intentIds.length === 0) return [];
      const { data, error } = await supabase
        .from('atd_knowledge_records')
        .select('*')
        .in('intent_id', intentIds)
        .order('relevance_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as KnowledgeRecord[];
    }
    const { data, error } = await supabase
      .from('atd_knowledge_records')
      .select('*')
      .order('relevance_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as KnowledgeRecord[];
  },

  async listDecisions(limit = 20, ctx?: { context_type: string; context_id: string }): Promise<EngineeringDecision[]> {
    if (ctx) {
      const { data: intents } = await supabase
        .from('atd_engineering_intents')
        .select('id')
        .eq('context_type', ctx.context_type)
        .eq('context_id', ctx.context_id)
        .neq('lifecycle_status', 'deleted');
      const intentIds = (intents ?? []).map(i => i.id);
      if (intentIds.length === 0) return [];
      const { data, error } = await supabase
        .from('atd_engineering_decisions')
        .select('*')
        .in('intent_id', intentIds)
        .order('decided_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as EngineeringDecision[];
    }
    const { data, error } = await supabase
      .from('atd_engineering_decisions')
      .select('*')
      .order('decided_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as EngineeringDecision[];
  },

  // ── Internal helpers ───────────────────────────────────────────────────────

  async _advancePipelineStage(
    pipelineId: string,
    _fromStage: PipelineStage,
    toStage: PipelineStage,
  ): Promise<void> {
    const { data } = await supabase
      .from('atd_pipeline_executions')
      .select('stage_history')
      .eq('id', pipelineId)
      .maybeSingle();

    const history: StageHistoryEntry[] = (data?.stage_history as StageHistoryEntry[]) ?? [];
    history.push({
      stage: toStage,
      entered_at: new Date().toISOString(),
      outcome: 'complete',
    });

    const isComplete = toStage === 'complete';

    await supabase
      .from('atd_pipeline_executions')
      .update({
        current_stage: toStage,
        stage_history: history,
        status: isComplete ? 'complete' : 'running',
        completed_at: isComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pipelineId);
  },

  // ── Stage labels ───────────────────────────────────────────────────────────

  STAGE_LABELS: {
    intent_understanding:      'Intent Understanding',
    engineering_analysis:      'Engineering Analysis',
    engineering_planning:      'Engineering Planning',
    review_preparation:        'Review Preparation',
    approval:                  'Approval',
    implementation_coordination: 'Implementation Coordination',
    validation:                'Validation',
    knowledge_extraction:      'Knowledge Extraction',
    intelligence_update:       'Intelligence Update',
    complete:                  'Complete',
  } as Record<PipelineStage, string>,

  STAGE_ORDER: [
    'intent_understanding', 'engineering_analysis', 'engineering_planning',
    'review_preparation', 'approval', 'implementation_coordination',
    'validation', 'knowledge_extraction', 'intelligence_update', 'complete',
  ] as PipelineStage[],
};
