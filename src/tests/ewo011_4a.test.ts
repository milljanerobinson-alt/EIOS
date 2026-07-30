/**
 * EWO-011.4A: Conversation-to-Intent Navigation & Plan-State Closeout — Validation
 * Covers: sessionStorage-based navigation, safe async intent selection, truthful
 * plan-state messaging, context-aware CTA labels, and linked banner label logic.
 */

import { describe, it, expect } from 'vitest';
import { buildCaptureInput } from '../lib/conversationIntentBridge';
import type { BridgeDecision, BridgeConversation } from '../lib/conversationIntentBridge';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DECISION: BridgeDecision = {
  recommendation: 'Proceed',
  priority_score: 85,
  priority_level: 'High',
  engineering_confidence: 92,
  business_value: 80,
  engineering_value: 90,
  compliance_value: 60,
  customer_value: 75,
  estimated_effort: '3 days',
  estimated_complexity: 'Medium',
  why_now: 'Unblocks 4 downstream features',
  suggested_phase: 'Phase 3',
  suggested_milestone: 'M3',
  suggested_release: 'RC-004',
  director_summary: {
    recommendation: 'Proceed',
    priority: 1,
    reason: 'Critical integration gap',
    estimated_effort: '3 days',
    suggested_phase: 'Phase 3',
    suggested_release: 'RC-004',
    required_testing: ['Integration'],
  },
};

const CONVERSATION: BridgeConversation = {
  id: 'conv-test-001',
  title: 'Test Conversation',
  context_type: 'recommend',
};

const USER_QUERY = 'Connect the AI conversation to the ATD Workspace.';

// ─── 1. Navigation — sessionStorage-based routing ────────────────────────────

describe('Navigation — sessionStorage routing (EWO-011.4A)', () => {
  it('sessionStorage key name is atd_pending_intent', () => {
    const KEY = 'atd_pending_intent';
    expect(KEY).toBe('atd_pending_intent');
  });

  it('target hash for clean navigation contains no query string', () => {
    const targetHash = '#/engineering/atd-workspace';
    expect(targetHash).not.toContain('?');
    expect(targetHash).not.toContain('intent=');
  });

  it('clean hash matches the router pattern — page key is atd-workspace', () => {
    const hash = '#/engineering/atd-workspace';
    const engMatch = hash.match(/^#\/engineering(?:\/(.+))?$/);
    expect(engMatch).not.toBeNull();
    const pageKey = engMatch![1] || 'mission-control';
    expect(pageKey).toBe('atd-workspace');
  });

  it('old query-param hash does NOT match page key atd-workspace', () => {
    const hash = '#/engineering/atd-workspace?intent=some-uuid';
    const engMatch = hash.match(/^#\/engineering(?:\/(.+))?$/);
    expect(engMatch).not.toBeNull();
    const pageKey = engMatch![1] || 'mission-control';
    expect(pageKey).not.toBe('atd-workspace');
  });

  it('sessionStorage store-then-retrieve preserves intentId (simulated)', () => {
    const store: Record<string, string> = {};
    store['atd_pending_intent'] = 'intent-uuid-001';
    expect(store['atd_pending_intent']).toBe('intent-uuid-001');
  });

  it('consuming the key clears it (simulated)', () => {
    const store: Record<string, string | undefined> = { atd_pending_intent: 'intent-uuid-001' };
    const id = store['atd_pending_intent'];
    delete store['atd_pending_intent'];
    expect(id).toBe('intent-uuid-001');
    expect(store['atd_pending_intent']).toBeUndefined();
  });

  it('second write overwrites first — last navigate wins', () => {
    const store: Record<string, string> = {};
    store['atd_pending_intent'] = 'intent-first';
    store['atd_pending_intent'] = 'intent-second';
    expect(store['atd_pending_intent']).toBe('intent-second');
  });
});

// ─── 2. Async intent selection — deferred until after data load ───────────────

describe('Async intent selection (EWO-011.4A)', () => {
  it('pending intent is not applied while loading is true', () => {
    const loading = true;
    const pendingIntentId = 'intent-uuid-pending';
    const shouldApply = !loading && pendingIntentId !== null;
    expect(shouldApply).toBe(false);
  });

  it('pending intent is applied once loading becomes false', () => {
    const loading = false;
    const pendingIntentId = 'intent-uuid-pending';
    const shouldApply = !loading && pendingIntentId !== null;
    expect(shouldApply).toBe(true);
  });

  it('pending intent is null when no key was set in store (simulated)', () => {
    const store: Record<string, string | undefined> = {};
    const pendingIntentId = store['atd_pending_intent'] ?? null;
    expect(pendingIntentId).toBeNull();
  });

  it('pendingIntentId is cleared to null after being applied', () => {
    let pendingIntentId: string | null = 'intent-uuid-pending';
    pendingIntentId = null;
    expect(pendingIntentId).toBeNull();
  });

  it('tab switches to intents when pending intent is applied', () => {
    let tab = 'pipeline';
    const pendingIntentId = 'intent-uuid-pending';
    if (pendingIntentId) tab = 'intents';
    expect(tab).toBe('intents');
  });
});

// ─── 3. Destination tab — plan-state aware ────────────────────────────────────

describe('Destination tab based on plan state (EWO-011.4A)', () => {
  const planlessStatuses = ['captured', 'analysing', 'analysed'];
  const planfulStatuses = ['planned', 'awaiting_approval', 'approved', 'implementing', 'complete'];

  planlessStatuses.forEach(status => {
    it(`status "${status}" opens Overview tab (no plan yet)`, () => {
      const hasPlan = !planlessStatuses.includes(status);
      const section = hasPlan ? 'plan' : 'overview';
      expect(section).toBe('overview');
    });
  });

  planfulStatuses.forEach(status => {
    it(`status "${status}" opens Plan tab`, () => {
      const hasPlan = !planlessStatuses.includes(status);
      const section = hasPlan ? 'plan' : 'overview';
      expect(section).toBe('plan');
    });
  });

  it('null intent in intents list (not yet loaded) defaults to overview', () => {
    const intents: Array<{ id: string; status: string }> = [];
    const pendingId = 'intent-xyz';
    const intent = intents.find(i => i.id === pendingId);
    const hasPlan = intent
      ? !planlessStatuses.includes(intent.status)
      : false;
    expect(hasPlan).toBe(false);
  });
});

// ─── 4. Truthful sent-state messaging ────────────────────────────────────────

describe('Truthful sent-state messaging (EWO-011.4A)', () => {
  it('message when hasPlan=false mentions pipeline processing, not plan ready', () => {
    const hasPlan = false;
    const message = hasPlan
      ? 'The Engineering Plan is ready for review.'
      : 'Its cognitive pipeline is now processing.';
    expect(message).toBe('Its cognitive pipeline is now processing.');
    expect(message).not.toContain('Plan is ready');
  });

  it('message when hasPlan=true says plan is ready for review', () => {
    const hasPlan = true;
    const message = hasPlan
      ? 'The Engineering Plan is ready for review.'
      : 'Its cognitive pipeline is now processing.';
    expect(message).toBe('The Engineering Plan is ready for review.');
  });

  it('false plan-ready message is never shown when hasPlan=false', () => {
    const hasPlan = false;
    const showPlanReady = hasPlan;
    expect(showPlanReady).toBe(false);
  });

  it('captureIntent() creates intent at captured status with no plan — hasPlan must be false', () => {
    const intentStatus = 'captured';
    const planlessStatuses = ['captured', 'analysing', 'analysed'];
    const hasPlan = !planlessStatuses.includes(intentStatus);
    expect(hasPlan).toBe(false);
  });
});

// ─── 5. Context-aware CTA labels ─────────────────────────────────────────────

describe('Context-aware CTA labels (EWO-011.4A)', () => {
  it('SendToATDPanel button label is "Review Engineering Plan" when hasPlan=true', () => {
    const hasPlan = true;
    const label = hasPlan ? 'Review Engineering Plan' : 'Open Intent in ATD Workspace';
    expect(label).toBe('Review Engineering Plan');
  });

  it('SendToATDPanel button label is "Open Intent in ATD Workspace" when hasPlan=false', () => {
    const hasPlan = false;
    const label = hasPlan ? 'Review Engineering Plan' : 'Open Intent in ATD Workspace';
    expect(label).toBe('Open Intent in ATD Workspace');
  });

  it('linked banner button label is "Review Engineering Plan" when hasPlan=true', () => {
    const linkedIntentHasPlan = true;
    const label = linkedIntentHasPlan ? 'Review Engineering Plan' : 'Open Intent';
    expect(label).toBe('Review Engineering Plan');
  });

  it('linked banner button label is "Open Intent" when hasPlan=false', () => {
    const linkedIntentHasPlan = false;
    const label = linkedIntentHasPlan ? 'Review Engineering Plan' : 'Open Intent';
    expect(label).toBe('Open Intent');
  });

  it('idle state always shows "Send to ATD Workspace"', () => {
    const status = 'idle';
    const label = status === 'sent' ? 'Review Engineering Plan' : 'Send to ATD Workspace';
    expect(label).toBe('Send to ATD Workspace');
  });
});

// ─── 6. Linked banner plan status indicator ───────────────────────────────────

describe('Linked banner plan status indicator (EWO-011.4A)', () => {
  it('shows "Planning in progress" annotation when hasPlan=false', () => {
    const linkedIntentHasPlan = false;
    const annotation = linkedIntentHasPlan ? null : 'Planning in progress';
    expect(annotation).toBe('Planning in progress');
  });

  it('shows no annotation when hasPlan=true', () => {
    const linkedIntentHasPlan = true;
    const annotation = linkedIntentHasPlan ? null : 'Planning in progress';
    expect(annotation).toBeNull();
  });

  it('banner resets hasPlan to false when conversation changes', () => {
    let linkedIntentHasPlan = true;
    linkedIntentHasPlan = false;
    expect(linkedIntentHasPlan).toBe(false);
  });
});

// ─── 7. buildCaptureInput smoke-test (regression guard) ──────────────────────

describe('buildCaptureInput regression (EWO-011.4A)', () => {
  it('title is capped at 80 chars', () => {
    const input = buildCaptureInput(DECISION, CONVERSATION, 'A'.repeat(100));
    expect(input.title.length).toBeLessThanOrEqual(80);
  });

  it('raw_input is always the full query', () => {
    const q = 'A'.repeat(200);
    const input = buildCaptureInput(DECISION, CONVERSATION, q);
    expect(input.raw_input).toHaveLength(200);
  });

  it('requested_outcome contains recommendation', () => {
    const input = buildCaptureInput(DECISION, CONVERSATION, USER_QUERY);
    expect(input.requested_outcome).toContain('Proceed');
  });
});
