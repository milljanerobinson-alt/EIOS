/**
 * Proposal Refinement Service — EWO-033R.1 Phase 4
 *
 * Enables continuous refinement of the Engineering Proposal. The PO responds
 * naturally (e.g. "Reduce the scope", "Split into two EWOs", "Use GitHub
 * deployment") and ATD updates the existing proposal while preserving
 * governance and audit history.
 *
 * No regeneration. No restart. The proposal is updated in-place with a new
 * version, and the full refinement history is preserved.
 */

import { supabase } from './supabase';
import { ConstitutionalEngine } from './constitutionalEngine';
import type { EngineeringProposal, ProposalScope, ProposalRisk, ProposalPlan } from './proposalEngine';
import type { SimilarityResult } from '../pages/ecc/ECCIdeaTypes';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RefinementRequest {
  proposalId: string;
  instruction: string;
  userId?: string;
}

export interface RefinementResult {
  proposal: EngineeringProposal;
  changeDescription: string;
}

// ─── Instruction parsing ────────────────────────────────────────────────────────

type RefinementType =
  | 'reduce_scope'
  | 'expand_scope'
  | 'exclude_component'
  | 'include_component'
  | 'change_deployment'
  | 'change_priority'
  | 'change_approach'
  | 'split_ewo'
  | 'general_update';

interface ParsedInstruction {
  type: RefinementType;
  target?: string;
  value?: string;
  rawInstruction: string;
}

function parseInstruction(instruction: string): ParsedInstruction {
  const lower = instruction.toLowerCase();

  if (/\b(reduce|narrow|trim|cut|smaller)\b.*\b(scope|range|breadth)\b/.test(lower)) {
    return { type: 'reduce_scope', rawInstruction: instruction };
  }

  if (/\b(expand|broaden|extend|wider|add to scope)\b.*\b(scope|range)\b/.test(lower)) {
    return { type: 'expand_scope', rawInstruction: instruction };
  }

  if (/\b(ignore|exclude|skip|don.t (include|touch))\b/.test(lower)) {
    const m = instruction.match(/(?:ignore|exclude|skip|don't (?:include|touch))\s+(.{3,80})/i);
    return { type: 'exclude_component', target: m?.[1]?.trim(), rawInstruction: instruction };
  }

  if (/\b(include|add|also (do|handle|cover))\b/.test(lower)) {
    const m = instruction.match(/(?:include|add|also (?:do|handle|cover))\s+(.{3,80})/i);
    return { type: 'include_component', target: m?.[1]?.trim(), rawInstruction: instruction };
  }

  if (/\b(deploy|deployment|github|gitlab|vercel|netlify)\b/.test(lower)) {
    const m = instruction.match(/(github|gitlab|vercel|netlify|direct|staging)/i);
    return { type: 'change_deployment', value: m?.[1], rawInstruction: instruction };
  }

  if (/\b(priority|urgent|critical|high priority|low priority)\b/.test(lower)) {
    const m = instruction.match(/(critical|high|medium|low)/i);
    return { type: 'change_priority', value: m?.[1]?.toLowerCase(), rawInstruction: instruction };
  }

  if (/\b(approach|strategy|method|technique)\b/.test(lower)) {
    return { type: 'change_approach', rawInstruction: instruction };
  }

  if (/\b(split|separate|two|multiple)\b.*\b(ewo|work order|ticket)\b/.test(lower)) {
    return { type: 'split_ewo', rawInstruction: instruction };
  }

  return { type: 'general_update', rawInstruction: instruction };
}

// ─── Refinement logic ───────────────────────────────────────────────────────────

function applyScopeReduction(scope: ProposalScope, instruction: string): ProposalScope {
  return {
    ...scope,
    inclusions: scope.inclusions.slice(0, Math.max(1, Math.ceil(scope.inclusions.length / 2))),
    exclusions: [...scope.exclusions, 'Scope reduced per Product Owner instruction'],
  };
}

function applyScopeExpansion(scope: ProposalScope, instruction: string): ProposalScope {
  return {
    ...scope,
    inclusions: [...scope.inclusions, 'Additional scope per Product Owner instruction'],
  };
}

function applyExclusion(scope: ProposalScope, target?: string): ProposalScope {
  return {
    ...scope,
    exclusions: [...scope.exclusions, target ?? 'Component excluded by Product Owner'],
  };
}

function applyInclusion(scope: ProposalScope, target?: string): ProposalScope {
  return {
    ...scope,
    inclusions: [...scope.inclusions, target ?? 'Component included by Product Owner'],
  };
}

function applyDeploymentChange(plan: ProposalPlan, value?: string): ProposalPlan {
  return {
    ...plan,
    recommendedApproach: `Execute via constitutional pipeline. Deployment: ${value ?? 'updated per PO instruction'}.`,
  };
}

function applyApproachChange(plan: ProposalPlan, instruction: string): ProposalPlan {
  return {
    ...plan,
    engineeringStrategy: `Updated approach per Product Owner: ${instruction}`,
    recommendedApproach: `Revised: ${instruction}`,
  };
}

function describeChange(parsed: ParsedInstruction): string {
  switch (parsed.type) {
    case 'reduce_scope':
      return 'Reduced scope per Product Owner instruction';
    case 'expand_scope':
      return 'Expanded scope per Product Owner instruction';
    case 'exclude_component':
      return `Excluded: ${parsed.target ?? 'specified component'}`;
    case 'include_component':
      return `Included: ${parsed.target ?? 'specified component'}`;
    case 'change_deployment':
      return `Deployment changed to: ${parsed.value ?? 'new deployment strategy'}`;
    case 'change_priority':
      return `Priority changed to: ${parsed.value ?? 'new priority'}`;
    case 'change_approach':
      return `Approach updated: ${parsed.rawInstruction}`;
    case 'split_ewo':
      return 'EWO split requested — scope adjusted for primary work order';
    default:
      return `Updated per Product Owner: ${parsed.rawInstruction}`;
  }
}

// ─── Service ────────────────────────────────────────────────────────────────────

export const ProposalRefinementService = {
  /**
   * Refine an existing proposal based on a natural-language instruction.
   * Preserves governance and audit history. Does NOT regenerate from scratch.
   */
  async refineProposal(request: RefinementRequest): Promise<RefinementResult> {
    // Load the current proposal
    const { data: current, error: loadErr } = await supabase
      .from('engineering_proposals')
      .select('*')
      .eq('id', request.proposalId)
      .maybeSingle();

    if (loadErr || !current) {
      throw new Error(`Proposal not found: ${request.proposalId}`);
    }

    const parsed = parseInstruction(request.instruction);
    const changeDescription = describeChange(parsed);

    // Apply refinements to the proposal fields
    let scope = (current.scope as ProposalScope) ?? { inclusions: [], exclusions: [], assumptions: [] };
    let plan = (current.plan as ProposalPlan) ?? { executiveSummary: '', engineeringStrategy: '', recommendedApproach: '', estimatedEffort: '', filesAffected: [], testsRequired: [] };
    let risks = (current.risks as ProposalRisk[]) ?? [];
    let acceptanceCriteria = (current.acceptance_criteria as string[]) ?? [];
    let similarityResults = (current.similarity_results as SimilarityResult[]) ?? [];

    switch (parsed.type) {
      case 'reduce_scope':
        scope = applyScopeReduction(scope, request.instruction);
        break;
      case 'expand_scope':
        scope = applyScopeExpansion(scope, request.instruction);
        break;
      case 'exclude_component':
        scope = applyExclusion(scope, parsed.target);
        break;
      case 'include_component':
        scope = applyInclusion(scope, parsed.target);
        break;
      case 'change_deployment':
        plan = applyDeploymentChange(plan, parsed.value);
        break;
      case 'change_approach':
        plan = applyApproachChange(plan, request.instruction);
        break;
      case 'split_ewo':
        scope = {
          ...scope,
          inclusions: scope.inclusions.slice(0, Math.ceil(scope.inclusions.length / 2)),
          exclusions: [...scope.exclusions, 'Split: secondary scope moved to a separate work order'],
        };
        break;
      case 'change_priority':
        // Priority is on the idea, not the proposal directly — but we note it
        acceptanceCriteria = [...acceptanceCriteria, `Priority adjusted to: ${parsed.value}`];
        break;
      default:
        // General update — append to scope assumptions
        scope = {
          ...scope,
          assumptions: [...scope.assumptions, `PO instruction: ${request.instruction}`],
        };
        break;
    }

    // If scope changed significantly, re-run similarity review
    if (['reduce_scope', 'expand_scope', 'exclude_component', 'include_component', 'split_ewo'].includes(parsed.type)) {
      try {
        const ideaTitle = current.analysis?.summary ?? current.proposal_ref;
        similarityResults = await ConstitutionalEngine.runSimilarityReview(
          scope.inclusions.join(' '),
          current.analysis?.summary ?? '',
          ideaTitle,
          request.instruction,
          [],
        );
      } catch {
        // Similarity re-run is best-effort — don't fail the refinement
      }
    }

    // Build the refinement history entry
    const newVersion = (current.version ?? 1) + 1;
    const historyEntry = {
      version: newVersion,
      change: changeDescription,
      timestamp: new Date().toISOString(),
      source: request.userId ?? 'po',
    };
    const refinementHistory = [
      ...((current.refinement_history as unknown[]) ?? []),
      historyEntry,
    ];

    // Update the proposal in place — same proposal_ref, new version
    const { data: updated, error: updateErr } = await supabase
      .from('engineering_proposals')
      .update({
        scope: scope as unknown as Record<string, unknown>,
        plan: plan as unknown as Record<string, unknown>,
        risks: risks as unknown as Record<string, unknown>[],
        acceptance_criteria: acceptanceCriteria,
        similarity_results: similarityResults as unknown as Record<string, unknown>[],
        version: newVersion,
        refinement_history: refinementHistory,
        status: 'presented', // Re-present after refinement
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.proposalId)
      .select('*')
      .single();

    if (updateErr) throw new Error(`Failed to update proposal: ${updateErr.message}`);

    const proposal: EngineeringProposal = {
      id: updated.id,
      proposalRef: updated.proposal_ref,
      ideaId: updated.idea_id,
      ideaRef: updated.idea_ref ?? '',
      ewoId: updated.ewo_id,
      ewoRef: updated.ewo_ref,
      status: updated.status,
      version: updated.version,
      analysis: updated.analysis as EngineeringProposal['analysis'],
      plan: updated.plan as ProposalPlan,
      scope: updated.scope as ProposalScope,
      risks: (updated.risks as ProposalRisk[]) ?? [],
      dependencies: (updated.dependencies as EngineeringProposal['dependencies']) ?? [],
      similarityResults: (updated.similarity_results as SimilarityResult[]) ?? [],
      acceptanceCriteria: (updated.acceptance_criteria as string[]) ?? [],
      constitutionalStatus: updated.constitutional_status as EngineeringProposal['constitutionalStatus'],
      complexity: updated.complexity,
      impact: updated.impact,
      refinementHistory: (updated.refinement_history as EngineeringProposal['refinementHistory']) ?? [],
    };

    return { proposal, changeDescription };
  },
};
