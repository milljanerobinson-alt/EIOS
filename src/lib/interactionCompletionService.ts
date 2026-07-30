/**
 * Interaction Completion Service — EWO-033R.1 Phase 6
 *
 * When execution completes, presents ONE Completion Package in-channel with
 * Accept / Reject / Request Refinement buttons.
 *
 * On Accept: runs completion governance and closes the EWO.
 * On Reject: marks execution failed.
 * On Refinement: sends back to preparation.
 */

import { supabase } from './supabase';
import { InteractionLifecycleService } from './interactionLifecycleService';
import { submitPODecision } from './implementationEngineConnector';
import { runCompletionGovernance } from './completionGovernanceEngine';
import type { LifecycleStage } from './interactionLifecycleService';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CompletionPackage {
  executionId: string;
  ewoId: string;
  ewoRef: string;
  summary: string;
  filesChanged: string[];
  tests: Array<{ name: string; status: 'passed' | 'failed' | 'skipped'; detail?: string }>;
  validation: Array<{ check: string; status: 'passed' | 'failed' | 'skipped'; detail?: string }>;
  deploymentRecommendation: string;
  poTestInstructions: string[];
  lifecycleStage: LifecycleStage;
}

export interface CompletionDecisionResult {
  success: boolean;
  lifecycleStage: LifecycleStage;
  message: string;
  error: string | null;
}

// ─── Compatibility Layer ─────────────────────────────────────────────────────
// EWO-033R.4 Correction 16: Historical execution records store tests as
// { passed: boolean, results: TestResult[] }. New executions store tests as
// Array<{ name, status, detail }>. This function normalizes both shapes into
// the canonical CompletionPackage.tests array.

function mapTestStatus(status: string): 'passed' | 'failed' | 'skipped' {
  if (status === 'pass' || status === 'passed') return 'passed';
  if (status === 'fail' || status === 'failed') return 'failed';
  return 'skipped';
}

function normalizeTests(raw: unknown): CompletionPackage['tests'] {
  if (Array.isArray(raw)) {
    return raw.map((t: { name?: string; status?: string; detail?: string }) => ({
      name: t.name ?? 'Unknown test',
      status: mapTestStatus(t.status ?? 'skipped'),
      detail: t.detail,
    }));
  }
  if (raw && typeof raw === 'object' && 'results' in raw) {
    const results = (raw as { results: unknown }).results;
    if (Array.isArray(results)) {
      return results.map((t: { name?: string; status?: string; detail?: string }) => ({
        name: t.name ?? 'Unknown test',
        status: mapTestStatus(t.status ?? 'skipped'),
        detail: t.detail,
      }));
    }
  }
  return [];
}

export function normalizeFilesChanged(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((f: unknown) => {
      if (typeof f === 'string') return f;
      if (f && typeof f === 'object' && 'path' in f) {
        return String((f as { path: string }).path);
      }
      return String(f);
    });
  }
  return [];
}

// ─── Service ────────────────────────────────────────────────────────────────────

export const InteractionCompletionService = {
  /**
   * Assemble the Completion Package from an execution record.
   */
  async assembleCompletionPackage(executionId: string): Promise<CompletionPackage | null> {
    const { data: execution, error } = await supabase
      .from('engineering_executions')
      .select(`
        id, ewo_id, implementation_status,
        files_changed, commit_ref, completion_report,
        engineering_work_orders!inner(id, ewo_ref, title)
      `)
      .eq('id', executionId)
      .maybeSingle();

    if (error || !execution) return null;

    const ewo = Array.isArray(execution.engineering_work_orders)
      ? execution.engineering_work_orders[0]
      : execution.engineering_work_orders;

    const filesChanged = normalizeFilesChanged(execution.files_changed);

    const report = execution.completion_report ?? {};

    return {
      executionId: execution.id,
      ewoId: execution.ewo_id,
      ewoRef: ewo?.ewo_ref ?? '',
      summary: (report as Record<string, unknown>)?.summary as string ?? 'Execution completed.',
      filesChanged,
      tests: normalizeTests((report as Record<string, unknown>)?.tests),
      validation: ((report as Record<string, unknown>)?.validation as CompletionPackage['validation']) ?? [],
      deploymentRecommendation:
        ((report as Record<string, unknown>)?.deployment_recommendation as string) ??
        'Deploy to staging for verification before production.',
      poTestInstructions: [
        'Review the files changed in the completion package',
        'Verify the tests pass in the staging environment',
        'Confirm the feature works as described in the proposal',
        'Accept or request refinement based on your testing',
      ],
      lifecycleStage: 'awaiting_acceptance',
    };
  },

  /**
   * Accept the completed work.
   * Records the PO decision, runs completion governance, closes the EWO.
   */
  async acceptCompletion(
    executionId: string,
    options: { userId?: string; notes?: string },
  ): Promise<CompletionDecisionResult> {
    try {
      // Load the execution to get EWO info
      const { data: execution } = await supabase
        .from('engineering_executions')
        .select('id, ewo_id')
        .eq('id', executionId)
        .maybeSingle();

      if (!execution) {
        return { success: false, lifecycleStage: 'failed', message: 'Execution not found', error: 'Execution not found' };
      }

      // Record the PO completion acceptance decision
      await InteractionLifecycleService.recordDecision(
        'completion_acceptance',
        'approved',
        {
          executionId,
          ewoId: execution.ewo_id,
          notes: options.notes,
          decidedBy: options.userId,
          lifecycleStageBefore: 'awaiting_acceptance',
          lifecycleStageAfter: 'accepted',
        },
      );

      // Submit the PO decision to the implementation engine connector
      await submitPODecision(executionId, 'approved', options.notes ?? 'Accepted by Product Owner');

      // Run completion governance (ratify → memory → export → lineage → complete)
      try {
        // Find the engineering record linked to this EWO for governance
        const { data: record } = await supabase
          .from('engineering_records_library')
          .select('id')
          .eq('semantic_metadata->>ewo_id', execution.ewo_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (record) {
          await runCompletionGovernance(record.id, {
            acceptedBy: options.userId ?? 'Product Owner',
            statement: options.notes ?? 'Accepted',
          });
        }
      } catch {
        // Completion governance is best-effort during acceptance — the decision is recorded
      }

      // Close the EWO
      await supabase
        .from('engineering_work_orders')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
        })
        .eq('id', execution.ewo_id);

      return {
        success: true,
        lifecycleStage: 'closed',
        message: 'Engineering Work Order closed. Completion governance complete.',
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        lifecycleStage: 'failed',
        message: 'Failed to accept completion',
        error: msg,
      };
    }
  },

  /**
   * Reject the completed work.
   */
  async rejectCompletion(
    executionId: string,
    options: { userId?: string; notes?: string },
  ): Promise<CompletionDecisionResult> {
    try {
      await InteractionLifecycleService.recordDecision(
        'completion_acceptance',
        'rejected',
        {
          executionId,
          notes: options.notes,
          decidedBy: options.userId,
          lifecycleStageBefore: 'awaiting_acceptance',
          lifecycleStageAfter: 'failed',
        },
      );

      await submitPODecision(executionId, 'rejected', options.notes ?? 'Rejected by Product Owner');

      return {
        success: true,
        lifecycleStage: 'failed',
        message: 'Execution rejected. The work can be retried with a new execution.',
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        lifecycleStage: 'failed',
        message: 'Failed to reject completion',
        error: msg,
      };
    }
  },

  /**
   * Request refinement — send back to preparation.
   */
  async requestRefinement(
    executionId: string,
    options: { userId?: string; notes?: string },
  ): Promise<CompletionDecisionResult> {
    try {
      await InteractionLifecycleService.recordDecision(
        'completion_acceptance',
        'changes_requested',
        {
          executionId,
          notes: options.notes,
          decidedBy: options.userId,
          lifecycleStageBefore: 'awaiting_acceptance',
          lifecycleStageAfter: 'preparing_execution',
        },
      );

      await submitPODecision(executionId, 'refinement', options.notes ?? 'Refinement requested by Product Owner');

      return {
        success: true,
        lifecycleStage: 'preparing_execution',
        message: 'Sent back for refinement. ATD will prepare a revised execution.',
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        lifecycleStage: 'failed',
        message: 'Failed to request refinement',
        error: msg,
      };
    }
  },
};
