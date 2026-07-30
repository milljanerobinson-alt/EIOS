import { supabase } from './supabase';

// ─── Capability Types ─────────────────────────────────────────────────────────

export type CapabilityCategory =
  | 'reasoning' | 'analysis' | 'planning' | 'architecture'
  | 'implementation' | 'review' | 'validation' | 'knowledge'
  | 'intelligence' | 'guardian' | 'documentation' | 'reporting' | 'roadmap';

export type ProviderType =
  | 'internal' | 'reasoning_provider' | 'implementation_provider'
  | 'review_provider' | 'validation_provider' | 'documentation_provider'
  | 'knowledge_provider' | 'guardian_provider' | 'human';

export type ExecutionStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';

export interface Capability {
  capability_key: string;
  name: string;
  description: string;
  category: CapabilityCategory;
  version: string;
  provider_type: ProviderType;
  is_active: boolean;
  configuration: Record<string, unknown>;
}

export interface CapabilityExecution {
  id: string;
  execution_ref: string;
  capability_key: string;
  pipeline_execution_id: string | null;
  intent_id: string | null;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  status: ExecutionStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  provider_used: string | null;
  error_message: string | null;
  created_at: string;
}

export interface CapabilityExecutionRequest {
  capability_key: string;
  pipeline_execution_id?: string;
  intent_id?: string;
  input_payload?: Record<string, unknown>;
  provider_used?: string;
  organisation_id?: string;
}

// ─── Ref generation ───────────────────────────────────────────────────────────

async function nextExecRef(): Promise<string> {
  const { count } = await supabase
    .from('atd_capability_executions')
    .select('*', { count: 'exact', head: true });
  const n = ((count ?? 0) + 1).toString().padStart(3, '0');
  return `ATD-EXEC-${n}`;
}

// ─── Capability Framework ─────────────────────────────────────────────────────

export const ATDCapabilityFramework = {

  async listCapabilities(): Promise<Capability[]> {
    const { data, error } = await supabase
      .from('atd_capabilities')
      .select('*')
      .order('category')
      .order('name');
    if (error) throw error;
    return (data ?? []) as Capability[];
  },

  async getCapability(key: string): Promise<Capability | null> {
    const { data, error } = await supabase
      .from('atd_capabilities')
      .select('*')
      .eq('capability_key', key)
      .maybeSingle();
    if (error) throw error;
    return data as Capability | null;
  },

  async recordExecution(req: CapabilityExecutionRequest): Promise<CapabilityExecution> {
    const execution_ref = await nextExecRef();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('atd_capability_executions')
      .insert({
        execution_ref,
        capability_key: req.capability_key,
        pipeline_execution_id: req.pipeline_execution_id ?? null,
        intent_id: req.intent_id ?? null,
        input_payload: req.input_payload ?? {},
        output_payload: {},
        status: 'running',
        started_at: now,
        provider_used: req.provider_used ?? 'internal',
        organisation_id: req.organisation_id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as CapabilityExecution;
  },

  async completeExecution(
    id: string,
    output: Record<string, unknown>,
    durationMs: number,
  ): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('atd_capability_executions')
      .update({
        status: 'complete',
        output_payload: output,
        completed_at: now,
        duration_ms: durationMs,
      })
      .eq('id', id);
    if (error) throw error;
  },

  async failExecution(id: string, errorMessage: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('atd_capability_executions')
      .update({ status: 'failed', error_message: errorMessage, completed_at: now })
      .eq('id', id);
    if (error) throw error;
  },

  async listExecutions(options?: {
    pipeline_execution_id?: string;
    intent_id?: string;
    limit?: number;
  }): Promise<CapabilityExecution[]> {
    let q = supabase
      .from('atd_capability_executions')
      .select('*')
      .order('created_at', { ascending: false });

    if (options?.pipeline_execution_id) {
      q = q.eq('pipeline_execution_id', options.pipeline_execution_id);
    }
    if (options?.intent_id) {
      q = q.eq('intent_id', options.intent_id);
    }
    if (options?.limit) {
      q = q.limit(options.limit);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as CapabilityExecution[];
  },

  getCategoryColour(category: CapabilityCategory): string {
    const map: Record<CapabilityCategory, string> = {
      reasoning:       'text-blue-400 bg-blue-500/10 border-blue-500/20',
      analysis:        'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
      planning:        'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      architecture:    'text-amber-400 bg-amber-500/10 border-amber-500/20',
      implementation:  'text-orange-400 bg-orange-500/10 border-orange-500/20',
      review:          'text-purple-400 bg-purple-500/10 border-purple-500/20',
      validation:      'text-teal-400 bg-teal-500/10 border-teal-500/20',
      knowledge:       'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
      intelligence:    'text-sky-400 bg-sky-500/10 border-sky-500/20',
      guardian:        'text-rose-400 bg-rose-500/10 border-rose-500/20',
      documentation:   'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      reporting:       'text-slate-300 bg-slate-500/10 border-slate-500/20',
      roadmap:         'text-lime-400 bg-lime-500/10 border-lime-500/20',
    };
    return map[category] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  },

  getProviderLabel(type: ProviderType): string {
    const map: Record<ProviderType, string> = {
      internal:                'Internal',
      reasoning_provider:      'Reasoning Provider',
      implementation_provider: 'Implementation Provider',
      review_provider:         'Review Provider',
      validation_provider:     'Validation Provider',
      documentation_provider:  'Documentation Provider',
      knowledge_provider:      'Knowledge Provider',
      guardian_provider:       'Guardian Provider',
      human:                   'Human',
    };
    return map[type] ?? type;
  },
};
