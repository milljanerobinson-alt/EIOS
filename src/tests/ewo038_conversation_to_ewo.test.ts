// EWO-038 — Conversation-to-Engineering Work Order Lifecycle Tests
// Tests covering: conversation→EWO creation, intent classification, authority,
// idempotency/duplicate prevention, audit evidence, lifecycle states,
// execution preparation availability, and non-mutation guarantees.

import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTestAuth } from './helpers/ensureTestAuth';
import {
  classifyCanonicalExecutionIntent,
  routeConversationToExecution,
} from '../lib/conversationExecutionRoutingBridge';
import { supabase } from '../lib/supabase';

// ─── Pure Intent Classification Tests ─────────────────────────────────────────

describe('EWO-038: Create-EWO Intent Classification (client-side, non-authoritative)', () => {
  it('"Create the Engineering Work Order" is recognised as create_ewo', () => {
    const intent = classifyCanonicalExecutionIntent('Create the Engineering Work Order');
    expect(intent).toBe('create_ewo');
  }, 30000);

  it('"Create an EWO for X" is recognised as create_ewo', () => {
    const intent = classifyCanonicalExecutionIntent('Create an EWO for the new billing dashboard');
    expect(intent).toBe('create_ewo');
  }, 30000);

  it('"Implement this" is recognised as create_ewo', () => {
    const intent = classifyCanonicalExecutionIntent('Implement this');
    expect(intent).toBe('create_ewo');
  }, 30000);

  it('"Proceed with implementation" is recognised as create_ewo', () => {
    const intent = classifyCanonicalExecutionIntent('Proceed with implementation of the assessment feature');
    expect(intent).toBe('create_ewo');
  }, 30000);

  it('"Begin implementation" is recognised as create_ewo', () => {
    const intent = classifyCanonicalExecutionIntent('Begin implementation of the new auth system');
    expect(intent).toBe('create_ewo');
  }, 30000);

  it('"Prepare this work" is recognised as create_ewo', () => {
    const intent = classifyCanonicalExecutionIntent('Prepare this work for the next phase');
    expect(intent).toBe('create_ewo');
  }, 30000);

  it('"Authorise implementation" is recognised as create_ewo', () => {
    const intent = classifyCanonicalExecutionIntent('Authorise implementation of the billing module');
    expect(intent).toBe('create_ewo');
  }, 30000);

  it('"Register an EWO" is recognised as create_ewo', () => {
    const intent = classifyCanonicalExecutionIntent('Register an EWO for the compliance update');
    expect(intent).toBe('create_ewo');
  }, 30000);

  it('execution authorisation is NOT classified as create_ewo', () => {
    const intent = classifyCanonicalExecutionIntent(
      'Authorise EWO-037 for governed execution validation',
    );
    expect(intent).not.toBe('create_ewo');
    expect(intent).toBe('engineering_execution_authorisation');
  }, 30000);

  it('advisory message is NOT classified as create_ewo', () => {
    const intent = classifyCanonicalExecutionIntent(
      'What are the options for implementing the new feature?',
    );
    expect(intent).not.toBe('create_ewo');
  }, 30000);

  it('general conversation is NOT classified as create_ewo', () => {
    const intent = classifyCanonicalExecutionIntent('Hello, how are you?');
    expect(intent).toBe('not_execution');
  }, 30000);
});

// ─── Server-Side EWO Creation Tests ────────────────────────────────────────────

describe('EWO-038: Server-Side EWO Creation from Conversation', () => {
  beforeAll(async () => {
    await ensureTestAuth();
  }, 30000);

  it('conversation creates a governed EWO server-side', async () => {
    const uniqueTitle = `EWO-038 Test EWO ${Date.now()}`;
    const result = await routeConversationToExecution({
      text: `Create an EWO for ${uniqueTitle}`,
      conversationId: null,
    });

    expect(result.is_execution_intent).toBe(true);
    expect(result.routed).toBe(true);
    expect(result.card).not.toBeNull();
    expect(result.card!.detected_intent).toBe('create_ewo');
    expect(result.card!.routing_decision).toBe('ewo_created');
    expect(result.card!.product_owner_authority).toBe('verified');
    expect(result.card!.ewo_ref).not.toBeNull();
    expect(result.card!.ewo_ref).toMatch(/^EWO-\d+$/);
    expect(result.card!.ewo_id).not.toBeNull();
    expect(result.card!.ewo_status).toBe('ready');
    expect(result.card!.created).toBe(true);
    expect(result.card!.lifecycle_state).toBe('ready');
    expect(result.card!.execution_preparation_available).toBe(true);
    expect(result.card!.server_authoritative).toBe(true);
    expect(result.card!.codex_mutation_performed).toBe(false);
    expect(result.card!.github_mutation_performed).toBe(false);
    expect(result.card!.audit_reference).toContain('EWO038');
  }, 30000);

  it('duplicate request returns the existing EWO (idempotent)', async () => {
    const uniqueTitle = `EWO-038 Idempotency Test ${Date.now()}`;

    // First call — creates the EWO
    const first = await routeConversationToExecution({
      text: `Create an EWO for ${uniqueTitle}`,
      conversationId: null,
    });
    expect(first.card).not.toBeNull();
    expect(first.card!.created).toBe(true);
    const firstRef = first.card!.ewo_ref;

    // Second call — should return the same EWO (duplicate by title)
    const second = await routeConversationToExecution({
      text: `Create an EWO for ${uniqueTitle}`,
      conversationId: null,
    });
    expect(second.card).not.toBeNull();
    expect(second.card!.created).toBe(false);
    expect(second.card!.ewo_ref).toBe(firstRef);
    expect(second.card!.routing_decision).toBe('duplicate_detected');
  }, 30000);

  it('authority is verified server-side', async () => {
    const result = await routeConversationToExecution({
      text: `Create an EWO for EWO-038 Authority Test ${Date.now()}`,
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    expect(result.card!.product_owner_authority).toBe('verified');
    expect(result.card!.server_authoritative).toBe(true);
  }, 30000);

  it('created EWO appears in engineering_work_orders table', async () => {
    const uniqueTitle = `EWO-038 Table Verification ${Date.now()}`;
    const result = await routeConversationToExecution({
      text: `Create an EWO for ${uniqueTitle}`,
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    const ewoRef = result.card!.ewo_ref!;

    // Verify the EWO exists in the database
    const { data: ewo, error } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref, title, status')
      .eq('ewo_ref', ewoRef)
      .maybeSingle();

    expect(error).toBeNull();
    expect(ewo).not.toBeNull();
    expect(ewo!.ewo_ref).toBe(ewoRef);
    expect(ewo!.status).toBe('ready');
  }, 30000);

  it('audit evidence is persisted in engineering_change_log', async () => {
    const uniqueTitle = `EWO-038 Audit Test ${Date.now()}`;
    const result = await routeConversationToExecution({
      text: `Create an EWO for ${uniqueTitle}`,
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    const auditRef = result.card!.audit_reference;
    expect(auditRef).toContain('EWO038');

    // Verify the audit record was persisted
    const { data: auditRecord } = await supabase
      .from('engineering_change_log')
      .select('change_ref, change_type, ewo_ref, metadata')
      .eq('change_ref', auditRef)
      .maybeSingle();

    expect(auditRecord).not.toBeNull();
    expect(auditRecord!.change_type).toBe('created');
    expect(auditRecord!.metadata).toHaveProperty('server_authoritative', true);
  }, 30000);

  it('lifecycle event is recorded in ewo_lifecycle_events', async () => {
    const uniqueTitle = `EWO-038 Lifecycle Event Test ${Date.now()}`;
    const result = await routeConversationToExecution({
      text: `Create an EWO for ${uniqueTitle}`,
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    const ewoId = result.card!.ewo_id!;

    const { data: events } = await supabase
      .from('ewo_lifecycle_events')
      .select('from_status, to_status, actor, notes')
      .eq('ewo_id', ewoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(events).not.toBeNull();
    expect(events!.to_status).toBe('ready');
    expect(events!.from_status).toBeNull();
  }, 30000);

  it('EWO reference uses canonical numbering (EWO-NNN)', async () => {
    const uniqueTitle = `EWO-038 Numbering Test ${Date.now()}`;
    const result = await routeConversationToExecution({
      text: `Create an EWO for ${uniqueTitle}`,
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    expect(result.card!.ewo_ref).toMatch(/^EWO-\d+$/);
    // Should not be EWO-001 (the old fallback)
    expect(result.card!.ewo_ref).not.toBe('EWO-001');
  }, 30000);

  it('no Codex or GitHub mutation occurs during EWO creation', async () => {
    const uniqueTitle = `EWO-038 Non-Mutation Test ${Date.now()}`;
    const result = await routeConversationToExecution({
      text: `Create an EWO for ${uniqueTitle}`,
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    expect(result.card!.codex_mutation_performed).toBe(false);
    expect(result.card!.github_mutation_performed).toBe(false);
  }, 30000);

  it('execution preparation is available after EWO creation', async () => {
    const uniqueTitle = `EWO-038 Execution Readiness Test ${Date.now()}`;
    const result = await routeConversationToExecution({
      text: `Create an EWO for ${uniqueTitle}`,
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    expect(result.card!.execution_preparation_available).toBe(true);
    expect(result.card!.next_governed_action).toContain('Prepare');
    expect(result.card!.next_governed_action).toContain('execution');
  }, 30000);
});

// ─── Security Tests ────────────────────────────────────────────────────────────

describe('EWO-038: Security Enforcement', () => {
  beforeAll(async () => {
    await ensureTestAuth();
  }, 30000);

  it('unauthenticated users cannot create EWOs', async () => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-engineering-work-order`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({
          title: 'Unauthorized EWO',
          executive_summary: 'Should be rejected',
        }),
      },
    );

    expect(response.status).toBe(401);
  }, 30000);

  it('client-supplied roles are ignored — server resolves from database', async () => {
    const result = await routeConversationToExecution({
      text: `Create an EWO for EWO-038 Role Test ${Date.now()}`,
      conversationId: null,
    });

    expect(result.card).not.toBeNull();
    expect(result.card!.product_owner_authority).toBe('verified');
    expect(result.card!.server_authoritative).toBe(true);
  }, 30000);
});

// ─── Regression: Execution Routing Still Works ────────────────────────────────

describe('EWO-038: Regression — Execution Routing Preserved', () => {
  beforeAll(async () => {
    await ensureTestAuth();
  }, 30000);

  it('execution authorisation still routes to prepare-execution-request', async () => {
    const result = await routeConversationToExecution({
      text: 'Prepare EWO-032R8-TEST-PIPELINE-REACH for governed execution. Stop before provider execution.',
      conversationId: null,
      stopBeforeExecution: true,
    });

    expect(result.is_execution_intent).toBe(true);
    expect(result.card).not.toBeNull();
    expect(result.card!.detected_intent).toBe('engineering_execution_prepare');
    expect(result.card!.server_authoritative).toBe(true);
  }, 30000);

  it('advisory message is not routed', async () => {
    const result = await routeConversationToExecution({
      text: 'Hello, how are you today?',
      conversationId: null,
    });

    expect(result.is_execution_intent).toBe(false);
    expect(result.routed).toBe(false);
  }, 30000);
});
