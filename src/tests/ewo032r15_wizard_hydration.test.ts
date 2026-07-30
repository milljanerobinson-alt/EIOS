/**
 * EWO-032R.15 Regression Fix — Wizard State Hydration Tests
 *
 * Tests the deep-merge hydration function that prevents the
 * "Cannot read properties of undefined (reading 'map')" crash
 * when resuming an existing Engineering Idea in the wizard.
 */

import { describe, it, expect } from 'vitest';
import { hydrateWizardState } from '../lib/wizardStateHydration';
import { INITIAL_WIZARD_STATE, type WizardState } from '../pages/ecc/ECCIdeaTypes';

describe('wizardStateHydration', () => {
  // ── 1. New Idea creation (no prefill) ──────────────────────────────────────

  it('returns INITIAL_WIZARD_STATE when prefill is empty', () => {
    const { state, diagnostics } = hydrateWizardState(undefined);
    expect(state.step).toBe('intent');
    expect(state.idea.tags).toEqual([]);
    expect(state.idea.products).toEqual(['EIOS Platform']);
    expect(state.idea.applications).toEqual(['EIOS Engineering Control Centre']);
    expect(diagnostics.review_render_ready).toBe(true);
  });

  it('returns INITIAL_WIZARD_STATE when prefill is {}', () => {
    const { state } = hydrateWizardState({});
    expect(state.idea.tags).toEqual([]);
    expect(state.objective.success_metrics).toEqual(['']);
    expect(state.strategy.success_criteria).toEqual(['']);
  });

  // ── 2. Resumed Idea with partial prefill (the bug scenario) ─────────────────

  it('preserves title and description from prefill', () => {
    const { state } = hydrateWizardState({
      idea: { title: 'My Idea', description: 'A description' },
    });
    expect(state.idea.title).toBe('My Idea');
    expect(state.idea.description).toBe('A description');
  });

  it('defaults idea.tags to [] when prefill omits it (the crash root cause)', () => {
    const { state } = hydrateWizardState({
      idea: { title: 'My Idea', description: 'desc' },
    });
    expect(state.idea.tags).toEqual([]);
    expect(Array.isArray(state.idea.tags)).toBe(true);
  });

  it('defaults idea.products to initial default when prefill omits it', () => {
    const { state } = hydrateWizardState({
      idea: { title: 'My Idea', description: 'desc' },
    });
    expect(state.idea.products).toEqual(['EIOS Platform']);
    expect(Array.isArray(state.idea.products)).toBe(true);
  });

  it('defaults idea.applications to initial default when prefill omits it', () => {
    const { state } = hydrateWizardState({
      idea: { title: 'My Idea', description: 'desc' },
    });
    expect(state.idea.applications).toEqual(['EIOS Engineering Control Centre']);
    expect(Array.isArray(state.idea.applications)).toBe(true);
  });

  it('defaults idea.category to "general" when prefill omits it', () => {
    const { state } = hydrateWizardState({
      idea: { title: 'My Idea', description: 'desc' },
    });
    expect(state.idea.category).toBe('general');
  });

  it('defaults idea.priority to "medium" when prefill omits it', () => {
    const { state } = hydrateWizardState({
      idea: { title: 'My Idea', description: 'desc' },
    });
    expect(state.idea.priority).toBe('medium');
  });

  // ── 3. Resumed Idea with full prefill ───────────────────────────────────────

  it('preserves all fields when prefill provides full idea object', () => {
    const { state } = hydrateWizardState({
      idea: {
        title: 'Full Idea',
        description: 'Full desc',
        category: 'security',
        priority: 'high',
        tags: ['security', 'auth'],
        products: ['Product A'],
        applications: ['App B'],
      },
    });
    expect(state.idea.category).toBe('security');
    expect(state.idea.priority).toBe('high');
    expect(state.idea.tags).toEqual(['security', 'auth']);
    expect(state.idea.products).toEqual(['Product A']);
    expect(state.idea.applications).toEqual(['App B']);
  });

  it('preserves intent fields when prefill provides intent', () => {
    const { state } = hydrateWizardState({
      intent: { title: 'My Intent', description: 'desc', business_driver: 'driver', priority: 'critical', programme: 'EIOS' },
    });
    expect(state.intent.title).toBe('My Intent');
    expect(state.intent.priority).toBe('critical');
  });

  it('preserves objective fields when prefill provides objective', () => {
    const { state } = hydrateWizardState({
      objective: { title: 'My Objective', description: 'desc', success_metrics: ['metric1', 'metric2'] },
    });
    expect(state.objective.title).toBe('My Objective');
    expect(state.objective.success_metrics).toEqual(['metric1', 'metric2']);
  });

  it('preserves strategy fields when prefill provides strategy', () => {
    const { state } = hydrateWizardState({
      strategy: { strategy_type: 'phased', approach: 'approach', success_criteria: ['criterion1'] },
    });
    expect(state.strategy.strategy_type).toBe('phased');
    expect(state.strategy.success_criteria).toEqual(['criterion1']);
  });

  it('preserves contextRef and agentRef from prefill', () => {
    const { state } = hydrateWizardState({
      contextRef: 'CTX-CUSTOM-001',
      agentRef: 'AGENT-CUSTOM-001',
    });
    expect(state.contextRef).toBe('CTX-CUSTOM-001');
    expect(state.agentRef).toBe('AGENT-CUSTOM-001');
  });

  // ── 4. Resumed Idea with empty optional collections ─────────────────────────

  it('handles empty arrays in prefill correctly', () => {
    const { state } = hydrateWizardState({
      idea: { title: 'Idea', description: 'desc', tags: [], products: [], applications: [] },
      objective: { title: 'Obj', description: 'desc', success_metrics: [] },
      strategy: { strategy_type: 'incremental', approach: '', success_criteria: [] },
    });
    expect(state.idea.tags).toEqual([]);
    expect(state.idea.products).toEqual([]);
    expect(state.idea.applications).toEqual([]);
    expect(state.objective.success_metrics).toEqual([]);
    expect(state.strategy.success_criteria).toEqual([]);
  });

  // ── 5. Diagnostics ──────────────────────────────────────────────────────────

  it('diagnostics report idea_ref from prefill', () => {
    const { diagnostics } = hydrateWizardState({
      createdIdeaRef: 'IDEA-TEST-001',
    });
    expect(diagnostics.idea_ref).toBe('IDEA-TEST-001');
  });

  it('diagnostics report session_id from prefill', () => {
    const { diagnostics } = hydrateWizardState({
      createdSessionId: 'session-123',
    });
    expect(diagnostics.session_id).toBe('session-123');
  });

  it('diagnostics report resumed_step', () => {
    const { diagnostics } = hydrateWizardState({ step: 'review' });
    expect(diagnostics.resumed_step).toBe('review');
  });

  it('diagnostics report hydrated_fields', () => {
    const { diagnostics } = hydrateWizardState({
      idea: { title: 'T', description: 'D' },
      intent: { title: 'I', description: '', business_driver: '', priority: 'low', programme: 'EIOS' },
    });
    expect(diagnostics.hydrated_fields).toContain('idea');
    expect(diagnostics.hydrated_fields).toContain('intent');
  });

  it('diagnostics report defaulted_optional_collections when prefill omits them', () => {
    const { diagnostics } = hydrateWizardState({
      idea: { title: 'T', description: 'D' },
    });
    expect(diagnostics.defaulted_optional_collections).toContain('idea.tags');
    expect(diagnostics.defaulted_optional_collections).toContain('idea.products');
    expect(diagnostics.defaulted_optional_collections).toContain('idea.applications');
  });

  it('diagnostics report missing_required_fields when title is empty', () => {
    const { diagnostics } = hydrateWizardState({});
    expect(diagnostics.missing_required_fields).toContain('intent.title');
    expect(diagnostics.missing_required_fields).toContain('objective.title');
    expect(diagnostics.missing_required_fields).toContain('idea.title');
  });

  it('diagnostics report review_state_valid as false when required fields missing', () => {
    const { diagnostics } = hydrateWizardState({});
    expect(diagnostics.review_state_valid).toBe(false);
  });

  it('diagnostics report review_state_valid as true when required fields present', () => {
    const { diagnostics } = hydrateWizardState({
      intent: { title: 'I', description: '', business_driver: '', priority: 'low', programme: 'EIOS' },
      objective: { title: 'O', description: '', success_metrics: [] },
      idea: { title: 'T', description: '', category: 'general', priority: 'low', tags: [], products: [], applications: [] },
      strategy: { strategy_type: 'incremental', approach: '', success_criteria: [] },
      contextRef: 'CTX-001',
      agentRef: 'AGENT-001',
    });
    expect(diagnostics.review_state_valid).toBe(true);
  });

  it('diagnostics report review_render_ready as true after hydration', () => {
    const { diagnostics } = hydrateWizardState({
      idea: { title: 'T', description: 'D' },
    });
    expect(diagnostics.review_render_ready).toBe(true);
  });

  // ── 6. No mutation of input ──────────────────────────────────────────────────

  it('does not mutate the prefill object', () => {
    const prefill = { idea: { title: 'T', description: 'D' } };
    const prefillCopy = JSON.parse(JSON.stringify(prefill));
    hydrateWizardState(prefill);
    expect(prefill).toEqual(prefillCopy);
  });

  it('does not mutate INITIAL_WIZARD_STATE', () => {
    const initialCopy = JSON.parse(JSON.stringify(INITIAL_WIZARD_STATE));
    hydrateWizardState({ idea: { title: 'T', description: 'D' } });
    expect(INITIAL_WIZARD_STATE).toEqual(initialCopy);
  });

  // ── 7. All .map()-rendered collections are arrays ────────────────────────────

  it('ensures all collections that Review step renders via .map() are arrays', () => {
    const { state } = hydrateWizardState({
      idea: { title: 'T', description: 'D' },
    });
    // These are the exact collections rendered via .map() in the wizard:
    // idea.tags (line 986)
    expect(Array.isArray(state.idea.tags)).toBe(true);
    // objective.success_metrics (line 408)
    expect(Array.isArray(state.objective.success_metrics)).toBe(true);
    // strategy.success_criteria (line 481)
    expect(Array.isArray(state.strategy.success_criteria)).toBe(true);
    // idea.products (used in summary)
    expect(Array.isArray(state.idea.products)).toBe(true);
    // idea.applications (used in summary)
    expect(Array.isArray(state.idea.applications)).toBe(true);
  });
});
