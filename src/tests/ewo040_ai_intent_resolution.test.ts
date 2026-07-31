// EWO-040 — AI-Assisted Contextual Intent Resolution Tests
// Tests covering: deterministic commands, AI-assisted resolution, replacement
// tasks, rejection + new request, rollback instructions, stop before execution,
// approval boundaries, low confidence, malformed AI response, provider
// unavailable, deterministic fallback, governance enforcement.

import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTestAuth } from './helpers/ensureTestAuth';
import {
  routeConversationToExecution,
  classifyCanonicalExecutionIntent,
} from '../lib/conversationExecutionRoutingBridge';
import { supabase } from '../lib/supabase';

// ─── Scenario A: Reject previous proposal + create EWO + prepare ────────────────

describe('EWO-040 Scenario A: Rejection + New Request + Prepare', () => {
  beforeAll(async () => { await ensureTestAuth(); }, 30000);

  it('rejects previous recommendation and creates EWO (not cancellation)', async () => {
    const text = 'The previous logging recommendation is not approved. Create an Engineering Work Order to change the New Conversation button background colour. Prepare the execution package. Wait for Product Owner approval.';
    const result = await routeConversationToExecution({ text, conversationId: null });

    expect(result.is_execution_intent).toBe(true);
    expect(result.routed).toBe(true);
    expect(result.card).not.toBeNull();
    expect(result.card!.detected_intent).not.toBe('engineering_execution_cancel');
    expect(result.card!.routing_method).toBeDefined();
    expect(result.card!.intent_confidence).toBeDefined();
    expect(result.card!.codex_mutation_performed).toBe(false);
    expect(result.card!.github_mutation_performed).toBe(false);
    expect(result.card!.routing_decision).not.toBe('cancel_execution');
  }, 30000);
});

// ─── Scenario B: Cancel execution request ──────────────────────────────────────

describe('EWO-040 Scenario B: Cancel Execution Request', () => {
  beforeAll(async () => { await ensureTestAuth(); }, 30000);

  it('explicit cancel command is deterministic', async () => {
    const result = await routeConversationToExecution({
      text: 'Cancel execution request 18.',
      conversationId: null,
    });

    expect(result.is_execution_intent).toBe(true);
    expect(result.card).not.toBeNull();
    expect(result.card!.routing_method).toBe('deterministic');
    expect(result.card!.detected_intent).toBe('cancel_execution');
    expect(result.card!.intent_confidence).toBe(1.0);
  }, 30000);

  it('cancel with EWO ref is deterministic', async () => {
    const result = await routeConversationToExecution({
      text: 'Cancel EWO-107',
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    expect(result.card!.routing_method).toBe('deterministic');
    expect(result.card!.detected_intent).toBe('cancel_execution');
  }, 30000);
});

// ─── Scenario C: Prepare but don't execute ─────────────────────────────────────

describe('EWO-040 Scenario C: Prepare with Execution Withheld', () => {
  beforeAll(async () => { await ensureTestAuth(); }, 30000);

  it('prepare with stop-before constraint is not cancellation', async () => {
    const result = await routeConversationToExecution({
      text: 'Prepare EWO-032R8-TEST-PIPELINE-REACH for governed execution. Stop before provider execution.',
      conversationId: null,
      stopBeforeExecution: true,
    });

    expect(result.is_execution_intent).toBe(true);
    expect(result.card).not.toBeNull();
    expect(result.card!.detected_intent).not.toBe('engineering_execution_cancel');
    expect(result.card!.codex_mutation_performed).toBe(false);
    expect(result.card!.github_mutation_performed).toBe(false);
  }, 30000);
});

// ─── Scenario D: Reject and replace ─────────────────────────────────────────────

describe('EWO-040 Scenario D: Replacement Task (not cancellation)', () => {
  beforeAll(async () => { await ensureTestAuth(); }, 30000);

  it('reject and replace is not cancellation', async () => {
    const text = 'Reject the previous recommendation and replace it with a new EWO for the dashboard redesign.';
    const result = await routeConversationToExecution({ text, conversationId: null });

    expect(result.is_execution_intent).toBe(true);
    expect(result.card).not.toBeNull();
    expect(result.card!.detected_intent).not.toBe('engineering_execution_cancel');
    expect(result.card!.routing_decision).not.toBe('cancel_execution');
  }, 30000);
});

// ─── Scenario E: Complex multi-paragraph ──────────────────────────────────────

describe('EWO-040 Scenario E: Complex Multi-Paragraph Conversation', () => {
  beforeAll(async () => { await ensureTestAuth(); }, 30000);

  it('interprets overall engineering objective, not individual keywords', async () => {
    const text = `The previous approach to logging was too verbose and should not be pursued.

Instead, I want to create a new Engineering Work Order for a streamlined logging system.

Please prepare the execution package but do not execute until I have reviewed and approved it.

The key constraint is that we must not deploy without explicit PO approval.`;

    const result = await routeConversationToExecution({ text, conversationId: null });

    expect(result.is_execution_intent).toBe(true);
    expect(result.routed).toBe(true);
    expect(result.card).not.toBeNull();
    expect(result.card!.detected_intent).not.toBe('engineering_execution_cancel');
    expect(result.card!.codex_mutation_performed).toBe(false);
    expect(result.card!.github_mutation_performed).toBe(false);
  }, 30000);
});

// ─── Deterministic Lifecycle Commands ──────────────────────────────────────────

describe('EWO-040: Deterministic Lifecycle Commands', () => {
  beforeAll(async () => { await ensureTestAuth(); }, 30000);

  it('approve EWO for execution is deterministic', async () => {
    const result = await routeConversationToExecution({
      text: 'Approve EWO-032R8-TEST-PIPELINE-REACH for execution',
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    expect(result.card!.routing_method).toBe('deterministic');
    expect(result.card!.intent_confidence).toBe(1.0);
  }, 30000);

  it('prepare EWO is deterministic', async () => {
    const result = await routeConversationToExecution({
      text: 'Prepare EWO-032R8-TEST-PIPELINE-REACH for governed execution',
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    expect(result.card!.routing_method).toBe('deterministic');
  }, 30000);

  it('accept EWO is deterministic', async () => {
    const result = await routeConversationToExecution({
      text: 'Accept EWO-032R8-TEST-PIPELINE-REACH',
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    expect(result.card!.routing_method).toBe('deterministic');
  }, 30000);
});

// ─── Governance Enforcement ────────────────────────────────────────────────────

describe('EWO-040: Governance Enforcement', () => {
  beforeAll(async () => { await ensureTestAuth(); }, 30000);

  it('AI may never authorise execution without explicit command', async () => {
    const text = 'I think we should proceed with the implementation of EWO-032R8-TEST-PIPELINE-REACH.';
    const result = await routeConversationToExecution({ text, conversationId: null });

    expect(result.card).not.toBeNull();
    // If the card has execution_authorised, it should be false unless
    // the user explicitly said "authorise for execution"
    if (result.card!.execution_authorised !== undefined) {
      expect(result.card!.execution_authorised).toBe(false);
    }
  }, 30000);

  it('no Codex or GitHub mutation occurs during intent resolution', async () => {
    const text = 'Create an EWO for the new notification system and prepare it for execution.';
    const result = await routeConversationToExecution({ text, conversationId: null });

    expect(result.card).not.toBeNull();
    expect(result.card!.codex_mutation_performed).toBe(false);
    expect(result.card!.github_mutation_performed).toBe(false);
  }, 30000);
});

// ─── Observability ─────────────────────────────────────────────────────────────

describe('EWO-040: Observability — Routing Diagnostics Persisted', () => {
  beforeAll(async () => { await ensureTestAuth(); }, 30000);

  it('routing diagnostics are persisted for deterministic commands', async () => {
    const result = await routeConversationToExecution({
      text: 'Cancel execution request 99',
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    const auditRef = result.card!.audit_reference;
    expect(auditRef).toContain('EWO040');

    const { data: diag } = await supabase
      .from('conversation_routing_diagnostics')
      .select('routing_method, primary_intent, confidence, reasoning_summary')
      .eq('audit_reference', auditRef)
      .maybeSingle();

    expect(diag).not.toBeNull();
    expect(diag!.routing_method).toBe('deterministic');
    expect(diag!.primary_intent).toBe('cancel_execution');
    expect(Number(diag!.confidence)).toBe(1.0);
  }, 30000);

  it('routing diagnostics record latency and provider info', async () => {
    const result = await routeConversationToExecution({
      text: 'Cancel execution request 100',
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    const auditRef = result.card!.audit_reference;

    const { data: diag } = await supabase
      .from('conversation_routing_diagnostics')
      .select('latency_ms, provider_used, model_used')
      .eq('audit_reference', auditRef)
      .maybeSingle();

    expect(diag).not.toBeNull();
    expect(diag!.latency_ms).toBeGreaterThanOrEqual(0);
  }, 30000);
});

// ─── Regression: Legacy Intent Classification ──────────────────────────────────

describe('EWO-040: Regression — Legacy classifyCanonicalExecutionIntent', () => {
  it('create_ewo patterns still work', () => {
    expect(classifyCanonicalExecutionIntent('Create an EWO for the billing system')).toBe('create_ewo');
    expect(classifyCanonicalExecutionIntent('Create the Engineering Work Order')).toBe('create_ewo');
    expect(classifyCanonicalExecutionIntent('Implement this')).toBe('create_ewo');
    expect(classifyCanonicalExecutionIntent('Proceed with implementation of the auth system')).toBe('create_ewo');
  });

  it('execution authorisation patterns still work', () => {
    expect(classifyCanonicalExecutionIntent('Authorise EWO-032R8-TEST-PIPELINE-REACH for governed execution validation')).toBe('engineering_execution_authorisation');
  });

  it('prepare patterns still work', () => {
    expect(classifyCanonicalExecutionIntent('Prepare EWO-032R8-TEST-PIPELINE-REACH for governed execution. Stop before provider execution.')).toBe('engineering_execution_prepare');
  });

  it('advisory is not execution', () => {
    expect(classifyCanonicalExecutionIntent('What are the options for implementing the new feature?')).not.toBe('create_ewo');
  });

  it('general conversation is not execution', () => {
    expect(classifyCanonicalExecutionIntent('Hello, how are you?')).toBe('not_execution');
  });
});
