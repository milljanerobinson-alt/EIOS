/**
 * EWO-032R.15 Regression Fix — Wizard State Hydration
 *
 * Provides a deep-merge hydration function that ensures resumed Ideas
 * are hydrated into the same complete state shape as newly created Ideas.
 *
 * The root cause of the crash was a shallow merge:
 *   { ...INITIAL_WIZARD_STATE, ...prefill }
 * When prefill = { idea: { title, description } }, this replaces the entire
 * `idea` sub-object, losing `tags`, `category`, `priority`, `products`,
 * `applications`. When IdeaFormPanel renders `idea.tags.map(...)`, it crashes
 * because `idea.tags` is undefined.
 *
 * The fix: deep-merge each nested sub-object so partial prefill data
 * fills in known fields while preserving initialised defaults for
 * any fields the prefill omits.
 */

import { INITIAL_WIZARD_STATE, type WizardState } from '../pages/ecc/ECCIdeaTypes';

export interface HydrationDiagnostics {
  idea_ref: string | null;
  session_id: string | null;
  resumed_step: string;
  hydrated_fields: string[];
  defaulted_optional_collections: string[];
  missing_required_fields: string[];
  review_state_valid: boolean;
  review_render_ready: boolean;
}

const REQUIRED_REVIEW_FIELDS: (keyof WizardState)[] = [
  'intent',
  'objective',
  'strategy',
  'idea',
  'contextRef',
  'agentRef',
];

const OPTIONAL_COLLECTIONS: string[] = [
  'idea.tags',
  'idea.products',
  'idea.applications',
  'objective.success_metrics',
  'strategy.success_criteria',
];

export function hydrateWizardState(prefill: Partial<WizardState> | undefined): {
  state: WizardState;
  diagnostics: HydrationDiagnostics;
} {
  const base: WizardState = INITIAL_WIZARD_STATE;
  const p = prefill ?? {};

  // Deep-merge each nested sub-object
  const state: WizardState = {
    ...base,
    ...p,
    step: p.step ?? base.step,
    intent: { ...base.intent, ...(p.intent ?? {}) },
    objective: { ...base.objective, ...(p.objective ?? {}) },
    strategy: { ...base.strategy, ...(p.strategy ?? {}) },
    idea: { ...base.idea, ...(p.idea ?? {}) },
    contextRef: p.contextRef ?? base.contextRef,
    agentRef: p.agentRef ?? base.agentRef,
    // Preserve optional result fields from prefill
    createdIntentId: p.createdIntentId ?? base.createdIntentId,
    createdObjectiveId: p.createdObjectiveId ?? base.createdObjectiveId,
    createdSessionId: p.createdSessionId ?? base.createdSessionId,
    createdIdeaId: p.createdIdeaId ?? base.createdIdeaId,
    createdIdeaRef: p.createdIdeaRef ?? base.createdIdeaRef,
    createdRecordId: p.createdRecordId ?? base.createdRecordId,
    createdRecordRef: p.createdRecordRef ?? base.createdRecordRef,
    createdEwoId: p.createdEwoId ?? base.createdEwoId,
    createdEwoRef: p.createdEwoRef ?? base.createdEwoRef,
    ewoPromotionStatus: p.ewoPromotionStatus ?? base.ewoPromotionStatus,
    ewoPromotionError: p.ewoPromotionError ?? base.ewoPromotionError,
    executionError: p.executionError ?? base.executionError,
    similarityResults: p.similarityResults ?? base.similarityResults,
    similarityDecision: p.similarityDecision ?? base.similarityDecision,
    similarityLinkedRefs: p.similarityLinkedRefs ?? base.similarityLinkedRefs,
    similaritySearchDone: p.similaritySearchDone ?? base.similaritySearchDone,
  };

  // ── Build diagnostics ──
  const hydratedFields: string[] = [];
  const defaultedCollections: string[] = [];
  const missingRequired: string[] = [];

  if (p.intent) hydratedFields.push('intent');
  if (p.objective) hydratedFields.push('objective');
  if (p.strategy) hydratedFields.push('strategy');
  if (p.idea) hydratedFields.push('idea');
  if (p.contextRef) hydratedFields.push('contextRef');
  if (p.agentRef) hydratedFields.push('agentRef');

  // Check which optional collections were defaulted
  if (p.idea && !p.idea.tags) defaultedCollections.push('idea.tags');
  if (p.idea && !p.idea.products) defaultedCollections.push('idea.products');
  if (p.idea && !p.idea.applications) defaultedCollections.push('idea.applications');
  if (p.objective && !p.objective.success_metrics) defaultedCollections.push('objective.success_metrics');
  if (p.strategy && !p.strategy.success_criteria) defaultedCollections.push('strategy.success_criteria');

  // Check required fields for Review step
  for (const field of REQUIRED_REVIEW_FIELDS) {
    const val = state[field];
    if (val === undefined || val === null) {
      missingRequired.push(String(field));
    }
  }

  // Review step requires intent.title and idea.title
  if (!state.intent.title?.trim()) missingRequired.push('intent.title');
  if (!state.objective.title?.trim()) missingRequired.push('objective.title');
  if (!state.idea.title?.trim()) missingRequired.push('idea.title');

  const reviewStateValid = missingRequired.length === 0;
  const reviewRenderReady =
    Array.isArray(state.idea.tags) &&
    Array.isArray(state.idea.products) &&
    Array.isArray(state.idea.applications) &&
    Array.isArray(state.objective.success_metrics) &&
    Array.isArray(state.strategy.success_criteria);

  const diagnostics: HydrationDiagnostics = {
    idea_ref: p.createdIdeaRef ?? null,
    session_id: p.createdSessionId ?? null,
    resumed_step: state.step,
    hydrated_fields: hydratedFields,
    defaulted_optional_collections: defaultedCollections,
    missing_required_fields: missingRequired,
    review_state_valid: reviewStateValid,
    review_render_ready: reviewRenderReady,
  };

  return { state, diagnostics };
}
