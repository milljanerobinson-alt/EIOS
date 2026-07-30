import { supabase } from './supabase';
import { ATDCognitiveEngine, type EngineeringIntent, type PipelineExecution } from './atdCognitiveEngine';
import { type ActiveContext } from './activeProjectService';

// ─── Context Mission ──────────────────────────────────────────────────────────

export interface ContextMission {
  id: string;
  context_type: string;
  context_id: string;
  project_id: string | null;
  mission_statement: string;
  set_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function getContextMission(ctx: ActiveContext): Promise<ContextMission | null> {
  const { data } = await supabase
    .from('ecc_context_missions')
    .select('*')
    .eq('context_type', ctx.context_type)
    .eq('context_id', ctx.context_id)
    .maybeSingle();
  return data as ContextMission | null;
}

export async function setContextMission(
  ctx: ActiveContext,
  mission_statement: string,
  set_by?: string,
): Promise<ContextMission> {
  const { data, error } = await supabase
    .from('ecc_context_missions')
    .upsert(
      {
        context_type: ctx.context_type,
        context_id: ctx.context_id,
        project_id: ctx.project_id,
        mission_statement,
        set_by: set_by ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'context_type,context_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data as ContextMission;
}

// ─── Context-scoped Session Queries ──────────────────────────────────────────

export async function listEngineeringSessions(
  ctx: ActiveContext,
  limit = 20,
): Promise<EngineeringIntent[]> {
  return ATDCognitiveEngine.listIntents(limit, { context_type: ctx.context_type, context_id: ctx.context_id });
}

export async function captureEngineeringSession(
  ctx: ActiveContext,
  input: {
    title: string;
    raw_input: string;
    requested_outcome?: string;
    business_objective?: string;
    engineering_objective?: string;
    scope?: string;
    constraints?: string;
  },
): Promise<{ intent: EngineeringIntent; pipeline: PipelineExecution }> {
  return ATDCognitiveEngine.captureIntent({
    ...input,
    context_type: ctx.context_type,
    context_id: ctx.context_id,
    project_id: ctx.project_id,
  });
}

export async function listContextPipelines(ctx: ActiveContext, limit = 10) {
  return ATDCognitiveEngine.listPipelines(limit, { context_type: ctx.context_type, context_id: ctx.context_id });
}

export async function listContextKnowledge(ctx: ActiveContext, limit = 20) {
  return ATDCognitiveEngine.listKnowledge(limit, { context_type: ctx.context_type, context_id: ctx.context_id });
}

export async function listContextDecisions(ctx: ActiveContext, limit = 20) {
  return ATDCognitiveEngine.listDecisions(limit, { context_type: ctx.context_type, context_id: ctx.context_id });
}

// ─── Context-scoped Briefing Query ───────────────────────────────────────────

export async function getLatestContextBriefing(ctx: ActiveContext) {
  const { data } = await supabase
    .from('ecc_ai_briefings')
    .select(
      'id,briefing_data,health_data,engineering_summary,created_at,briefing_ref,ai_model,token_input,token_output,generation_duration_ms,estimated_cost_usd,engineering_phase,platform_version,trigger_type,scheduled_for,template_id,schedule_id',
    )
    .eq('context_type', ctx.context_type)
    .eq('context_id', ctx.context_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
