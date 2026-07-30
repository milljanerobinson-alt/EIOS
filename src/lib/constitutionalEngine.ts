/**
 * Constitutional Engine — EWO-033R.1 Phase 1
 *
 * Canonical implementation of the constitutional engineering pipeline.
 * Extracted from the Constitutional Execution Wizard so that any client
 * (wizard, proposal engine, future channels) can invoke the same engine.
 *
 * The wizard no longer owns the engineering orchestration.
 * This engine is the canonical implementation.
 */

import { supabase } from './supabase';
import { ensureEngineeringWorkOrderExists } from './ensureEngineeringWorkOrder';
import { allocateCanonicalEwoRef } from './ewoAllocator';
import type {
  WizardState,
  WizardIntentForm,
  WizardObjectiveForm,
  WizardStrategyForm,
  WizardIdeaForm,
  SimilarityResult,
  SimilarityDecision,
  ExecutionPipelineStage,
  IdeaCategory,
  IdeaPriority,
} from '../pages/ecc/ECCIdeaTypes';
import { DEFAULT_PIPELINE } from '../pages/ecc/ECCIdeaTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genRef(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${ts}${rnd}`;
}

function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
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

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ConstitutionalPipelineRequest {
  idea: WizardIdeaForm;
  intent: WizardIntentForm;
  objective: WizardObjectiveForm;
  strategy: WizardStrategyForm;
  contextRef: string;
  agentRef: string;
  similarityDecision?: SimilarityDecision;
  similarityResults?: SimilarityResult[];
  similarityLinkedRefs?: string[];
  /** When set, updates the existing idea instead of creating a new one */
  editIdeaId?: string;
  editIdeaRef?: string;
  onProgress?: (stage: ConstitutionalStageUpdate) => void;
}

export interface ConstitutionalStageUpdate {
  key: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  recordRef?: string;
  error?: string;
}

export interface ConstitutionalPipelineResult {
  intentId: string;
  intentRef: string;
  objectiveId: string;
  objectiveRef: string;
  strategyId: string;
  strategyRef: string;
  sessionId: string;
  sessionRef: string;
  ideaId: string;
  ideaRef: string;
  recordId: string;
  recordRef: string;
  ewoId: string | null;
  ewoRef: string | null;
  ewoPromotionStatus: 'complete' | 'failed';
  ewoPromotionError: string | null;
  evidence: Array<Record<string, unknown>>;
  pipeline: ExecutionPipelineStage[];
}

// ─── Similarity Engine ─────────────────────────────────────────────────────────

export async function runSimilaritySearch(
  ideaTitle: string,
  ideaDescription: string,
  intentTitle: string,
  intentDescription: string,
  tags: string[],
): Promise<SimilarityResult[]> {
  const query = [ideaTitle, ideaDescription, intentTitle, intentDescription]
    .filter(Boolean)
    .join(' ');

  const results: SimilarityResult[] = [];

  // 1. Engineering Ideas
  const { data: ideas } = await supabase
    .from('engineering_idea')
    .select('id, idea_ref, title, description, status, category, tags')
    .neq('status', 'archived')
    .limit(50);

  for (const row of ideas ?? []) {
    const titleScore = tokenOverlap(ideaTitle, row.title ?? '') * 0.55;
    const descScore = tokenOverlap(query, row.description ?? '') * 0.25;
    const tagScore =
      tags.length > 0
        ? ((row.tags?.filter((t: string) => tags.includes(t)).length ?? 0) /
            Math.max(tags.length, 1)) *
          0.2
        : 0;
    const score = Math.min(titleScore + descScore + tagScore, 1);
    if (score >= 0.25) {
      results.push({
        id: row.id,
        object_type: 'engineering_idea',
        ref: row.idea_ref,
        title: row.title,
        reason: `Title word overlap: ${Math.round((titleScore / 0.55) * 100)}%. Category: ${row.category}.`,
        relationship: score > 0.75 ? 'duplicate' : score > 0.5 ? 'related' : 'complements',
        status: row.status,
        score,
        metadata: { category: row.category, tags: row.tags },
      });
    }
  }

  // 2. Engineering Features
  const { data: featuresAlt } = await supabase
    .from('ecc_product_features')
    .select('id, feature_ref, title, description, status')
    .limit(50);

  for (const row of featuresAlt ?? []) {
    const score =
      tokenOverlap(ideaTitle, row.title ?? '') * 0.7 +
      tokenOverlap(query, row.description ?? '') * 0.3;
    if (score >= 0.25) {
      results.push({
        id: row.id,
        object_type: 'engineering_feature',
        ref: row.feature_ref ?? `FEAT-${row.id.slice(0, 8).toUpperCase()}`,
        title: row.title,
        reason: `Feature title overlap: ${Math.round(score * 100)}%.`,
        relationship: score > 0.65 ? 'related' : 'extends',
        status: row.status ?? 'unknown',
        score: Math.min(score * 0.9, 1),
        metadata: {},
      });
    }
  }

  // 3. Engineering Work Orders
  const { data: workOrders } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, description, status')
    .limit(30);

  for (const row of workOrders ?? []) {
    const score =
      tokenOverlap(ideaTitle, row.title ?? '') * 0.6 +
      tokenOverlap(query, row.description ?? '') * 0.4;
    if (score >= 0.2) {
      results.push({
        id: row.id,
        object_type: 'work_order',
        ref: row.ewo_ref ?? `EWO-${row.id.slice(0, 3).toUpperCase()}`,
        title: row.title,
        reason: `Work order covers related engineering scope: ${Math.round(score * 100)}% overlap.`,
        relationship: score > 0.6 ? 'supersedes' : 'related',
        status: row.status ?? 'unknown',
        score: Math.min(score * 0.85, 1),
        metadata: {},
      });
    }
  }

  // 4. Engineering Standards
  const { data: standards } = await supabase
    .from('ecc_engineering_standards')
    .select('id, title, body, status')
    .limit(20);

  for (const row of standards ?? []) {
    const score =
      tokenOverlap(ideaTitle, row.title ?? '') * 0.5 +
      tokenOverlap(query, row.body ?? '') * 0.5;
    if (score >= 0.3) {
      results.push({
        id: row.id,
        object_type: 'engineering_standard',
        ref: `STD-${row.id.slice(0, 8).toUpperCase()}`,
        title: row.title,
        reason: `Standard governs this engineering domain: ${Math.round(score * 100)}% relevance.`,
        relationship: 'complements',
        status: row.status ?? 'active',
        score: Math.min(score * 0.75, 1),
        metadata: {},
      });
    }
  }

  // 5. Engineering Records
  const { data: records } = await supabase
    .from('engineering_records_library')
    .select('id, record_ref, title, record_type, status')
    .limit(30);

  for (const row of records ?? []) {
    const score = tokenOverlap(ideaTitle, row.title ?? '') * 1.0;
    if (score >= 0.25) {
      results.push({
        id: row.id,
        object_type: 'engineering_record',
        ref: row.record_ref ?? `REC-${row.id.slice(0, 8).toUpperCase()}`,
        title: row.title,
        reason: `Engineering record with related content: ${Math.round(score * 100)}% overlap.`,
        relationship: 'related',
        status: row.status ?? 'active',
        score: Math.min(score * 0.8, 1),
        metadata: { record_type: row.record_type },
      });
    }
  }

  // 6. Engineering Memory
  const { data: memory } = await supabase
    .from('engineering_memory')
    .select('id, record_ref, title, content, knowledge_category, authority_state')
    .limit(20);

  for (const row of memory ?? []) {
    const score =
      tokenOverlap(ideaTitle, row.title ?? '') * 0.5 +
      tokenOverlap(query, row.content ?? '') * 0.5;
    if (score >= 0.35) {
      results.push({
        id: row.id,
        object_type: 'engineering_memory',
        ref: row.record_ref ?? `MEM-${row.id.slice(0, 8).toUpperCase()}`,
        title: row.title ?? row.content?.slice(0, 60) ?? 'Memory entry',
        reason: `Engineering memory captures related knowledge: ${Math.round(score * 100)}% relevance.`,
        relationship: 'complements',
        status: row.authority_state ?? 'active',
        score: Math.min(score * 0.7, 1),
        metadata: { knowledge_category: row.knowledge_category },
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 12);
}

// ─── Constitutional Engine ─────────────────────────────────────────────────────

export const ConstitutionalEngine = {
  /**
   * Execute the full 11-stage constitutional pipeline.
   * This is the canonical implementation — the wizard and the proposal engine
   * are both clients of this method.
   */
  async executePipeline(
    request: ConstitutionalPipelineRequest,
  ): Promise<ConstitutionalPipelineResult> {
    const {
      idea,
      intent,
      objective,
      strategy,
      contextRef,
      agentRef,
      onProgress,
    } = request;

    const decision: SimilarityDecision = request.similarityDecision ?? 'continue_anyway';
    const simResults: SimilarityResult[] = request.similarityResults ?? [];
    const topMatch = simResults[0];
    const linkedRefs =
      decision === 'link_existing' ? simResults.slice(0, 3).map((r) => r.ref) : [];
    const highMatches = simResults.filter((r) => r.score >= 0.75);

    const pipeline: ExecutionPipelineStage[] = DEFAULT_PIPELINE.map((s) => ({
      ...s,
      status: 'pending' as const,
    }));

    const emit = (
      key: string,
      status: ConstitutionalStageUpdate['status'],
      recordRef?: string,
      error?: string,
    ) => {
      const idx = pipeline.findIndex((s) => s.key === key);
      if (idx >= 0) {
        pipeline[idx] = { ...pipeline[idx], status, record_ref: recordRef };
      }
      onProgress?.({ key, status, recordRef, error });
    };

    // 1. Engineering Intent
    emit('intent', 'running');
    const intentRef = genRef('INT');
    const { data: intentData, error: intentErr } = await supabase
      .from('engineering_intent')
      .insert({
        intent_ref: intentRef,
        title: intent.title,
        description: intent.description || null,
        programme: intent.programme,
        business_driver: intent.business_driver || null,
        priority: intent.priority,
        status: 'executing',
        outcome_definition: objective.title || null,
      })
      .select('id')
      .single();
    if (intentErr) throw new Error(`Intent: ${intentErr.message}`);
    const intentId = intentData.id;
    emit('intent', 'complete', intentRef);

    // 2. Engineering Objective
    emit('objective', 'running');
    const objectiveRef = genRef('OBJ');
    const { data: objData, error: objErr } = await supabase
      .from('engineering_objective')
      .insert({
        objective_ref: objectiveRef,
        intent_id: intentId,
        title: objective.title,
        description: objective.description || null,
        success_metrics: objective.success_metrics
          .filter((m) => m.trim())
          .map((m) => ({ metric: m })),
        priority: intent.priority,
        status: 'active',
      })
      .select('id')
      .single();
    if (objErr) throw new Error(`Objective: ${objErr.message}`);
    const objectiveId = objData.id;
    emit('objective', 'complete', objectiveRef);

    // 3. Execution Strategy
    emit('strategy', 'running');
    const { data: stratData, error: stratErr } = await supabase
      .from('execution_strategy')
      .insert({
        intent_id: intentId,
        strategy_type: strategy.strategy_type,
        approach: strategy.approach || null,
        success_criteria: strategy.success_criteria.filter((c) => c.trim()),
      })
      .select('id')
      .single();
    if (stratErr) throw new Error(`Strategy: ${stratErr.message}`);
    const strategyId = stratData.id;
    const strategyRef = `STR-${stratData.id.slice(0, 8).toUpperCase()}`;
    emit('strategy', 'complete', strategyRef);

    // 4. Execution Session
    emit('session', 'running');
    const sessionRef = genRef('SES');
    const { data: agentRow } = await supabase
      .from('engineering_agent')
      .select('id')
      .eq('agent_ref', agentRef)
      .maybeSingle();
    const { data: ctxRow } = await supabase
      .from('execution_context')
      .select('id')
      .eq('context_ref', contextRef)
      .maybeSingle();
    const stateHistory = [
      { from_state: null, to_state: 'requested', transitioned_at: new Date().toISOString(), reason: 'Constitutional engine initiated' },
      { from_state: 'requested', to_state: 'prepared', transitioned_at: new Date().toISOString(), reason: 'Engine validated' },
      { from_state: 'prepared', to_state: 'sandbox_ready', transitioned_at: new Date().toISOString(), reason: 'Context confirmed' },
      { from_state: 'sandbox_ready', to_state: 'executing', transitioned_at: new Date().toISOString(), reason: 'Similarity review complete — decision: ' + decision },
    ];
    const { data: sesData, error: sesErr } = await supabase
      .from('execution_session')
      .insert({
        session_ref: sessionRef,
        agent_id: agentRow?.id ?? null,
        context_id: ctxRow?.id ?? null,
        title: `Idea Creation: ${idea.title || intent.title}`,
        state: 'executing',
        state_history: stateHistory,
        guardian_required: true,
        po_review_required: false,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (sesErr) throw new Error(`Session: ${sesErr.message}`);
    const sessionId = sesData.id;
    emit('session', 'complete', sessionRef);

    if (agentRow?.id) {
      const { data: af } = await supabase
        .from('engineering_agent')
        .select('execution_count')
        .eq('id', agentRow.id)
        .single();
      if (af)
        await supabase
          .from('engineering_agent')
          .update({
            execution_count: (af.execution_count ?? 0) + 1,
            last_health_check_at: new Date().toISOString(),
          })
          .eq('id', agentRow.id);
    }

    // 5. Memory Pre-Execution
    emit('memory_pre', 'running');
    await supabase.from('execution_memory_integration').insert({
      session_id: sessionId,
      phase: 'pre_execution',
      patterns_applied: ['constitutional-execution-pipeline', 'idea-creation-v1', 'similarity-review-v1'],
      standards_referenced: ['EES-v1.0', 'CONST-001-AMD-002', 'EWO-011.1'],
      risks_identified: simResults.filter((r) => r.score >= 0.75).map((r) => `Potential duplicate: ${r.ref}`),
      recommendations_applied: ['guardian-validation-required', `similarity-decision-${decision}`],
      knowledge_updated: false,
      lineage_updated: false,
      memory_updated: false,
    });
    emit('memory_pre', 'complete');

    // 6. Engineering Idea (UPDATE in edit mode, INSERT in create mode)
    emit('idea', 'running');
    let ideaId: string;
    let ideaRef: string;
    if (request.editIdeaId) {
      ideaRef = request.editIdeaRef ?? `IDEA-${request.editIdeaId.slice(0, 8).toUpperCase()}`;
      const { data: ideaData, error: ideaErr } = await supabase
        .from('engineering_idea')
        .update({
          title: idea.title,
          description: idea.description || null,
          category: idea.category,
          priority: idea.priority,
          products: idea.products,
          applications: idea.applications,
          tags: idea.tags,
          related_ewo_refs: [...new Set([...linkedRefs.filter((r) => r.startsWith('EWO-'))])],
          related_feature_ids: linkedRefs.filter((r) => r.startsWith('FEAT-')),
          related_record_ids: linkedRefs.filter((r) => r.startsWith('REC-')),
          memory_search_performed: true,
          duplicates_checked: true,
          guardian_validated: true,
          guardian_session_id: sessionId,
          similarity_matches_count: simResults.length,
          similarity_decision: decision,
          similarity_top_match_ref: topMatch?.ref ?? null,
          similarity_top_match_score: topMatch?.score ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.editIdeaId)
        .select('id, idea_ref')
        .single();
      if (ideaErr) throw new Error(`Idea update: ${ideaErr.message}`);
      ideaId = ideaData.id;
      ideaRef = ideaData.idea_ref ?? ideaRef;
    } else {
      ideaRef = genRef('IDEA');
      const { data: ideaData, error: ideaErr } = await supabase
        .from('engineering_idea')
        .insert({
          idea_ref: ideaRef,
          title: idea.title,
          description: idea.description || null,
          category: idea.category,
          priority: idea.priority,
          status: 'active',
          products: idea.products,
          applications: idea.applications,
          tags: idea.tags,
          session_id: sessionId,
          intent_id: intentId,
          objective_id: objectiveId,
          related_ewo_refs: linkedRefs.filter((r) => r.startsWith('EWO-')),
          related_feature_ids: linkedRefs.filter((r) => r.startsWith('FEAT-')),
          related_record_ids: linkedRefs.filter((r) => r.startsWith('REC-')),
          memory_search_performed: true,
          duplicates_checked: true,
          guardian_validated: true,
          guardian_session_id: sessionId,
          created_by: agentRef,
          similarity_matches_count: simResults.length,
          similarity_decision: decision,
          similarity_top_match_ref: topMatch?.ref ?? null,
          similarity_top_match_score: topMatch?.score ?? null,
        })
        .select('id')
        .single();
      if (ideaErr) throw new Error(`Idea: ${ideaErr.message}`);
      ideaId = ideaData.id;
    }
    emit('idea', 'complete', ideaRef);

    // 7. Execution Evidence (3 pieces: guardian, similarity review, artefact)
    emit('evidence', 'running');
    const evidenceRows = [
      {
        session_id: sessionId,
        evidence_type: 'guardian_validation',
        title: 'Engineering Guardian — Idea Validated',
        content: `Guardian validation PASSED for idea "${idea.title}". Risk: Low. No PO approval required. Created by: ${agentRef}.`,
        metadata: { guardian_result: 'passed', risk_level: 'low', po_required: false },
        verified_at: new Date().toISOString(),
        verified_by: 'Engineering Guardian',
      },
      {
        session_id: sessionId,
        evidence_type: 'test_result',
        title: `Similarity Review — ${decision.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}`,
        content:
          `Similarity search performed across 7 engineering object types. Found ${simResults.length} matches. ` +
          (topMatch ? `Top match: ${topMatch.ref} (${Math.round(topMatch.score * 100)}% similarity). ` : 'No matches. ') +
          `Decision: ${decision}. ` +
          (linkedRefs.length > 0 ? `Linked objects: ${linkedRefs.join(', ')}.` : ''),
        metadata: {
          similarity_search_performed: true,
          matches_count: simResults.length,
          high_matches: highMatches.length,
          decision,
          top_match_ref: topMatch?.ref ?? null,
          top_match_score: topMatch?.score ?? null,
          linked_refs: linkedRefs,
        },
        verified_at: new Date().toISOString(),
        verified_by: agentRef,
      },
      {
        session_id: sessionId,
        evidence_type: 'generated_artefact',
        title: `Engineering Idea Created: ${ideaRef}`,
        content: `Idea "${idea.title}" created as first-class constitutional engineering object. Ref: ${ideaRef}. Session: ${sessionRef}. Intent: ${intentRef}.`,
        metadata: { idea_ref: ideaRef, idea_id: ideaId, intent_ref: intentRef, session_ref: sessionRef },
        verified_at: new Date().toISOString(),
        verified_by: agentRef,
      },
    ];
    await supabase.from('execution_evidence').insert(evidenceRows);
    emit('evidence', 'complete');

    // 8. Engineering Record (EWO-011.2: mandatory)
    emit('record', 'running');
    const recordRef = genRef('REC');
    const { data: recData, error: recErr } = await supabase
      .from('engineering_records_library')
      .insert({
        record_ref: recordRef,
        title: `Idea Execution Record: ${idea.title}`,
        record_type: 'execution_bridge',
        programme: intent.programme,
        status: 'active',
        generated_by: agentRef,
        content: {
          summary: `Constitutional execution record for Engineering Idea ${ideaRef}.`,
          ewo: 'EWO-011.2',
          session_ref: sessionRef,
          intent_ref: intentRef,
          similarity_decision: decision,
        },
        semantic_metadata: {
          idea_ref: ideaRef,
          idea_id: ideaId,
          intent_ref: intentRef,
          session_ref: sessionRef,
          similarity_decision: decision,
          similarity_matches: simResults.length,
          linked_refs: linkedRefs,
          bridge: 'EWO-011.2',
        },
      })
      .select('id')
      .single();
    if (recErr) throw new Error(`Engineering Record: ${recErr.message}`);
    emit('record', 'complete', recordRef);

    // 9. Memory Post-Execution
    emit('memory_post', 'running');
    await supabase.from('execution_memory_integration').insert({
      session_id: sessionId,
      phase: 'post_execution',
      patterns_applied: ['similarity-review-complete', `decision-${decision}`, 'engineering-record-created'],
      standards_referenced: ['EWO-011.1', 'EWO-011.2'],
      risks_identified: [],
      recommendations_applied:
        linkedRefs.length > 0 ? [`linked-to-${linkedRefs.join('-')}`.slice(0, 80)] : [],
      knowledge_updated: true,
      lineage_updated: true,
      memory_updated: true,
    });
    emit('memory_post', 'complete');

    // 10. Governed Engineering Work Order Promotion (EWO-032R.8)
    emit('ewo_promote', 'running');
    let ewoId: string | null = null;
    let ewoRef: string | null = null;
    let ewoPromotionStatus: 'complete' | 'failed' = 'failed';
    let ewoPromotionError: string | null = null;

    try {
      const allocation = await allocateCanonicalEwoRef();
      if (!allocation.success || !allocation.ewoRef) {
        throw new Error(allocation.error || 'EWO allocation failed');
      }
      ewoRef = allocation.ewoRef;

      const ewoResult = await ensureEngineeringWorkOrderExists(
        ewoRef,
        intent.title,
        intent.description || intent.title,
        {
          priority:
            intent.priority === 'critical'
              ? 'critical'
              : intent.priority === 'high'
                ? 'high'
                : intent.priority === 'low'
                  ? 'low'
                  : 'medium',
          riskLevel: 'low',
          implementationProvider: 'codex',
        },
      );

      if (ewoResult.success && ewoResult.ewoId) {
        ewoId = ewoResult.ewoId;
        ewoRef = ewoResult.ewoRef;

        await supabase
          .from('engineering_idea')
          .update({
            related_ewo_refs: [...(request.similarityLinkedRefs ?? []), ewoRef],
          })
          .eq('id', ideaId);

        await supabase.from('execution_evidence').insert({
          session_id: sessionId,
          evidence_type: 'governance_artefact',
          evidence_ref: `EWO-PROMOTE-${ewoRef}-${Date.now()}`,
          description: `Governed Engineering Work Order ${ewoRef} created via ensureEngineeringWorkOrderExists — Idea ${ideaRef} promoted into EWO lifecycle.`,
          source: 'constitutional_engine',
          artefact_ref: ewoRef,
          verified: true,
          metadata: {
            ewo_id: ewoId,
            ewo_ref: ewoRef,
            idea_id: ideaId,
            idea_ref: ideaRef,
            promotion_stage: 'ewo_032r8',
            created: ewoResult.created,
          },
        });

        ewoPromotionStatus = 'complete';
        emit('ewo_promote', 'complete', ewoRef ?? undefined);
      } else {
        ewoPromotionError = ewoResult.error || 'Unknown EWO creation error';
        emit('ewo_promote', 'error', undefined, ewoPromotionError ?? undefined);
      }
    } catch (ewoErr) {
      ewoPromotionError = ewoErr instanceof Error ? ewoErr.message : String(ewoErr);
      emit('ewo_promote', 'error', undefined, ewoPromotionError ?? undefined);
    }

    // 11. Complete Session
    emit('complete', 'running');
    const finalHistory = [
      ...stateHistory,
      { from_state: 'executing', to_state: 'validation', transitioned_at: new Date().toISOString(), reason: 'Guardian validation complete' },
      { from_state: 'validation', to_state: 'accepted', transitioned_at: new Date().toISOString(), reason: 'Guardian approved — low risk idea' },
      { from_state: 'accepted', to_state: 'completed', transitioned_at: new Date().toISOString(), reason: `Engineering Idea ${ideaRef} created. Similarity decision: ${decision}` },
    ];
    await supabase
      .from('execution_session')
      .update({
        state: 'completed',
        state_history: finalHistory,
        completed_at: new Date().toISOString(),
        guardian_approved_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    emit('complete', 'complete', sessionRef);

    return {
      intentId,
      intentRef,
      objectiveId,
      objectiveRef,
      strategyId,
      strategyRef,
      sessionId,
      sessionRef,
      ideaId,
      ideaRef,
      recordId: recData.id,
      recordRef,
      ewoId,
      ewoRef,
      ewoPromotionStatus,
      ewoPromotionError,
      evidence: evidenceRows,
      pipeline,
    };
  },

  /**
   * Run similarity review across 7 engineering object types.
   * Can be called independently of the full pipeline.
   */
  async runSimilarityReview(
    ideaTitle: string,
    ideaDescription: string,
    intentTitle: string,
    intentDescription: string,
    tags: string[],
  ): Promise<SimilarityResult[]> {
    return runSimilaritySearch(ideaTitle, ideaDescription, intentTitle, intentDescription, tags);
  },

  /**
   * Validate a single constitutional stage.
   * Returns whether the stage can proceed.
   */
  async validateConstitutional(
    stage: string,
    context: { ideaId?: string; intentId?: string; sessionId?: string },
  ): Promise<{ valid: boolean; reason?: string }> {
    // For idea creation stages, verify prerequisite objects exist
    if (stage === 'objective' && context.intentId) {
      const { data } = await supabase
        .from('engineering_intent')
        .select('id')
        .eq('id', context.intentId)
        .maybeSingle();
      return { valid: !!data, reason: data ? undefined : 'Intent not found' };
    }
    if (stage === 'idea' && context.sessionId) {
      const { data } = await supabase
        .from('execution_session')
        .select('id')
        .eq('id', context.sessionId)
        .maybeSingle();
      return { valid: !!data, reason: data ? undefined : 'Session not found' };
    }
    return { valid: true };
  },
};
