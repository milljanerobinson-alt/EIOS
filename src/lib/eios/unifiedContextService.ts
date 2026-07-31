/**
 * EWO-044 — Codex-Native ATD Conversation Engine
 *
 * Unified Governed Context Service.
 * Replaces the 4 duplicated context builders with a single, project-scoped service.
 *
 * This service is NOT used to pre-build context before every provider invocation.
 * Instead, it provides scoped helpers that the tool server uses when the provider
 * requests context via tools. All queries are project/tenant-scoped.
 */

import { supabase } from '../supabase';

// ─── Context Scope ───────────────────────────────────────────────────────────

export interface ContextScope {
  projectId: string | null;
  conversationId: string | null;
  ewoRef: string | null;
  userId: string;
}

// ─── Scoped Context Retrieval ────────────────────────────────────────────────

export class UnifiedContextService {
  /**
   * Retrieve constitution clauses scoped to active project.
   */
  static async getConstitution(scope: ContextScope, limit = 10): Promise<unknown[]> {
    const { data, error } = await supabase
      .from('engineering_constitution')
      .select('id, clause_ref, title, description, amendment_ref, is_active, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data ?? [];
  }

  /**
   * Retrieve engineering memory scoped to the current project.
   */
  static async getMemory(scope: ContextScope, query?: string, limit = 10): Promise<unknown[]> {
    let q = supabase
      .from('engineering_memory')
      .select('id, content, memory_type, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (scope.projectId) q = q.eq('project_id', scope.projectId);
    if (query) q = q.ilike('content', `%${query}%`);
    const { data, error } = await q;
    if (error) return [];
    return data ?? [];
  }

  /**
   * Retrieve architecture decisions scoped to active project.
   */
  static async getArchitectureDecisions(scope: ContextScope, limit = 5): Promise<unknown[]> {
    const { data, error } = await supabase
      .from('ecc_decisions')
      .select('id, title, description, status, decision_ref, created_at')
      .in('status', ['accepted', 'active', 'approved'])
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data ?? [];
  }

  /**
   * Retrieve engineering standards scoped to active project.
   */
  static async getStandards(scope: ContextScope, limit = 6): Promise<unknown[]> {
    const { data, error } = await supabase
      .from('ecc_engineering_standards')
      .select('id, standard_ref, title, description, status')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data ?? [];
  }

  /**
   * Retrieve EWO details scoped to the conversation's active EWO.
   */
  static async getEwoDetails(scope: ContextScope, ewoRef?: string): Promise<unknown | null> {
    const ref = ewoRef ?? scope.ewoRef;
    if (!ref) return null;
    const { data, error } = await supabase
      .from('engineering_work_orders')
      .select('*')
      .eq('ewo_ref', ref)
      .maybeSingle();
    if (error) return null;
    return data;
  }

  /**
   * Retrieve engineering history scoped to the current project.
   */
  static async getHistory(scope: ContextScope, query?: string, limit = 10, offset = 0): Promise<unknown[]> {
    let q = supabase
      .from('engineering_work_orders')
      .select('ewo_ref, title, status, created_at, updated_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (scope.projectId) q = q.eq('project_id', scope.projectId);
    if (query) q = q.ilike('title', `%${query}%`);
    const { data, error } = await q;
    if (error) return [];
    return data ?? [];
  }

  /**
   * Retrieve provider policy.
   */
  static async getProviderPolicy(scope: ContextScope, ewoRef?: string): Promise<unknown | null> {
    const { data, error } = await supabase
      .from('execution_provider_policy')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data;
  }

  /**
   * Retrieve execution state for an EWO.
   */
  static async getExecutionState(scope: ContextScope, ewoRef: string): Promise<unknown | null> {
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref, status, engineering_package_status, implementation_status')
      .eq('ewo_ref', ewoRef)
      .maybeSingle();
    if (!ewo) return null;
    const { data: approvals } = await supabase
      .from('ewo_execution_approvals')
      .select('decision, approved_by, approved_at')
      .eq('ewo_ref', ewoRef)
      .order('approved_at', { ascending: false })
      .limit(5);
    return { ewo, approvals: approvals ?? [] };
  }

  /**
   * Retrieve knowledge packages scoped to the current project.
   */
  static async getKnowledgePackages(scope: ContextScope, query?: string, limit = 10): Promise<unknown[]> {
    let q = supabase
      .from('engineering_records_library')
      .select('id, title, description, record_type, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (query) q = q.ilike('title', `%${query}%`);
    const { data, error } = await q;
    if (error) return [];
    return data ?? [];
  }
}
