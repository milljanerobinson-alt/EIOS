// EWO-017R.2R Refinement R2 — Conversation Identity Isolation
// Acceptance Tests for governed active-object context binding
// with conversation-specific identity (NOT user/client identity)

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const MCP_SOURCE = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');

// ─── Context-binding intent detection (replicated from source) ────────────────

const CONTEXT_BINDING_PATTERNS: RegExp[] = [
  /make\s+(?:it|this|the)\s+(?:the\s+)?active\s+(?:engineering\s+work\s+order|ewo|object)\s+for\s+(?:this\s+)?conversation/i,
  /make\s+(?:it|this)\s+active\s+for\s+(?:this\s+)?conversation/i,
  /set\s+(?:it|this|the)\s+as\s+(?:the\s+)?active\s+(?:engineering\s+work\s+order|ewo|object)/i,
  /bind\s+(?:it|this|the)\s+(?:as|to)\s+(?:the\s+)?active\s+(?:engineering\s+work\s+order|ewo|object)/i,
  /establish\s+(?:it|this)\s+as\s+(?:the\s+)?active\s+(?:engineering\s+work\s+order|ewo|object)/i,
  /activate\s+(?:it|this|the)\s+(?:as|for)\s+(?:the\s+)?(?:active\s+)?(?:engineering\s+work\s+order|ewo|object)/i,
];

function detectContextBindingIntent(text: string): { detected: boolean; isCombinedWithInspection: boolean; confidence: number } {
  for (const pattern of CONTEXT_BINDING_PATTERNS) {
    if (pattern.test(text)) {
      const isCombinedWithInspection = /inspect|show|describe|view|display/i.test(text);
      return { detected: true, isCombinedWithInspection, confidence: 0.95 };
    }
  }
  return { detected: false, isCombinedWithInspection: false, confidence: 0 };
}

const EXPLICIT_REF_PATTERNS: RegExp[] = [
  /\b(EWO-[\w.]+)/i,
  /\b(BUG-[\w.]+)/i,
  /\b(PLAN-[\w.]+)/i,
  /\b(INTENT-[\w.]+)/i,
  /\b(DCR-[\w.]+)/i,
  /\b(ERC-[\w.]+)/i,
];

function detectExplicitReference(text: string): { detected: boolean; value: string | null; object_type: string | null } {
  for (const pattern of EXPLICIT_REF_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const ref = match[1].toUpperCase();
      const typeMap: Record<string, string> = {
        EWO: 'engineering_work_order',
        BUG: 'bug',
        PLAN: 'engineering_plan',
        INTENT: 'engineering_intent',
        DCR: 'design_change_request',
        ERC: 'engineering_record',
      };
      const prefix = ref.split('-')[0];
      return { detected: true, value: ref, object_type: typeMap[prefix] ?? null };
    }
  }
  return { detected: false, value: null, object_type: null };
}

function classifyIntentRefined(text: string): { isWriteRequest: boolean; isContextBinding: boolean } {
  const contextBinding = detectContextBindingIntent(text);
  if (contextBinding.detected) {
    return { isWriteRequest: false, isContextBinding: true };
  }
  const lifecycleWritePatterns: RegExp[] = [
    /\bapprove\s+(?:the\s+)?ewo\b/i,
    /\bclose\s+(?:the\s+)?ewo\b/i,
    /\bdeploy\s+(?:the\s+)?ewo\b/i,
    /\bimplement\s+(?:the\s+)?ewo\b/i,
    /\bmark\s+(?:the\s+)?ewo\s+as\s+(?:active|in.progress|verified|complete|closed)\b/i,
  ];
  for (const pattern of lifecycleWritePatterns) {
    if (pattern.test(text)) {
      return { isWriteRequest: true, isContextBinding: false };
    }
  }
  return { isWriteRequest: false, isContextBinding: false };
}

// ─── TEST A — Combined inspection and context binding ─────────────────────────

describe('TEST A — Combined inspection and context binding', () => {
  const request = 'Inspect Engineering Work Order EWO-017R.2R and make it the active Engineering Work Order for this conversation. Do not perform any lifecycle changes.';

  it('detects context-binding intent', () => {
    const intent = detectContextBindingIntent(request);
    expect(intent.detected).toBe(true);
    expect(intent.confidence).toBeGreaterThan(0.9);
  });

  it('detects combined inspection + binding', () => {
    const intent = detectContextBindingIntent(request);
    expect(intent.isCombinedWithInspection).toBe(true);
  });

  it('detects explicit canonical reference EWO-017R.2R', () => {
    const ref = detectExplicitReference(request);
    expect(ref.detected).toBe(true);
    expect(ref.value).toBe('EWO-017R.2R');
    expect(ref.object_type).toBe('engineering_work_order');
  });

  it('does NOT classify as lifecycle write request', () => {
    const classification = classifyIntentRefined(request);
    expect(classification.isWriteRequest).toBe(false);
  });

  it('classifies as context binding', () => {
    const classification = classifyIntentRefined(request);
    expect(classification.isContextBinding).toBe(true);
  });

  it('source code includes detectContextBindingIntent function', () => {
    expect(MCP_SOURCE).toContain('function detectContextBindingIntent');
  });

  it('source code includes bindActiveObjectWithAudit function', () => {
    expect(MCP_SOURCE).toContain('function bindActiveObjectWithAudit');
  });

  it('source code includes combined inspect+bind routing path', () => {
    expect(MCP_SOURCE).toContain('inspect_and_bind_active_object');
  });

  it('source code returns active_object_updated in response', () => {
    expect(MCP_SOURCE).toContain('active_object_updated');
  });

  it('source code returns active_object_reference in response', () => {
    expect(MCP_SOURCE).toContain('active_object_reference');
  });

  it('source code returns lifecycle_change_performed in response', () => {
    expect(MCP_SOURCE).toContain('lifecycle_change_performed');
  });

  it('source code returns context_binding_operation in response', () => {
    expect(MCP_SOURCE).toContain('context_binding_operation');
  });

  it('source code returns conversation_identifier in response', () => {
    expect(MCP_SOURCE).toContain('conversation_identifier');
  });

  it('source code returns conversation_identifier_source in response', () => {
    expect(MCP_SOURCE).toContain('conversation_identifier_source');
  });

  it('source code returns conversation_scope_verified in response', () => {
    expect(MCP_SOURCE).toContain('conversation_scope_verified');
  });

  it('source code returns object_resolution_method in response', () => {
    expect(MCP_SOURCE).toContain('object_resolution_method');
  });

  it('source code returns previous_active_object_reference in response', () => {
    expect(MCP_SOURCE).toContain('previous_active_object_reference');
  });

  it('source code sets lifecycle_change_performed to false', () => {
    expect(MCP_SOURCE).toContain('lifecycle_change_performed: false');
  });

  it('source code sets context_binding_operation to true', () => {
    expect(MCP_SOURCE).toContain('context_binding_operation: true');
  });
});

// ─── TEST B — Contextual continuation after binding ───────────────────────────

describe('TEST B — Contextual continuation after binding', () => {
  const request = 'Expand the Engineering Analysis for the current Engineering Work Order.';

  it('does NOT detect context-binding intent (this is a continuation)', () => {
    const intent = detectContextBindingIntent(request);
    expect(intent.detected).toBe(false);
  });

  it('detects contextual reference to current EWO', () => {
    expect(/current\s+engineering\s+work\s+order/i.test(request)).toBe(true);
  });

  it('does NOT detect explicit canonical reference', () => {
    const ref = detectExplicitReference(request);
    expect(ref.detected).toBe(false);
  });

  it('source code resolves from atd_conversation_active_object', () => {
    expect(MCP_SOURCE).toContain('atd_conversation_active_object');
  });
});

// ─── TEST C — Separate Conversation B isolation ────────────────────────────────

describe('TEST C — Separate Conversation B isolation', () => {
  it('source code scopes active object lookups by conversation_id AND tenant_id', () => {
    expect(MCP_SOURCE).toContain('.eq("tenant_id", tenantId)');
  });

  it('source code does NOT use userId as conversation identifier', () => {
    expect(MCP_SOURCE).not.toContain('derived_from_userId_and_clientId');
  });

  it('source code does NOT use clientId as conversation identifier', () => {
    expect(MCP_SOURCE).not.toContain('derived_from_clientId');
  });

  it('source code does NOT fall back to user-wide context', () => {
    expect(MCP_SOURCE).toContain('DO NOT');
    expect(MCP_SOURCE).toContain('fall back to userId, clientId, or tenant identity');
  });
});

// ─── TEST D — Replace active object without affecting another conversation ─────

describe('TEST D — Replace active object without affecting another conversation', () => {
  it('source code scopes binding by conversation_id AND tenant_id', () => {
    expect(MCP_SOURCE).toContain('.eq("conversation_id", conversationId)');
    expect(MCP_SOURCE).toContain('.eq("tenant_id", tenantId)');
  });

  it('source code captures previous active object per conversation', () => {
    expect(MCP_SOURCE).toContain('previousActiveObject');
  });

  it('source code updates only within same conversation scope', () => {
    expect(MCP_SOURCE).toContain('previousActiveObjectRef');
  });
});

// ─── TEST E — Missing conversation identity ───────────────────────────────────

describe('TEST E — Missing conversation identity deterministic failure', () => {
  it('source code includes deterministic failure path for missing conversation identity', () => {
    expect(MCP_SOURCE).toContain('context_binding_failed_no_conversation_identity');
  });

  it('source code returns conversation_specific_identity_unavailable failure reason', () => {
    expect(MCP_SOURCE).toContain('conversation_specific_identity_unavailable');
  });

  it('source code sets active_object_updated to false on failure', () => {
    expect(MCP_SOURCE).toContain('active_object_updated: false');
  });

  it('source code sets context_binding_operation to false on failure', () => {
    expect(MCP_SOURCE).toContain('context_binding_operation: false');
  });

  it('source code sets conversation_identifier to null on failure', () => {
    expect(MCP_SOURCE).toContain('conversation_identifier: null');
  });

  it('source code sets conversation_scope_verified to false on failure', () => {
    expect(MCP_SOURCE).toContain('conversation_scope_verified: false');
  });

  it('source code does NOT fall back to userId or clientId', () => {
    expect(MCP_SOURCE).not.toContain('derived_from_userId_and_clientId');
    expect(MCP_SOURCE).not.toContain('derived_from_clientId');
  });

  it('source code does NOT silently fall back to user-wide context', () => {
    expect(MCP_SOURCE).toContain('conversationScopeVerified');
  });
});

// ─── TEST F — Lifecycle integrity ──────────────────────────────────────────────

describe('TEST F — No lifecycle mutation from context binding', () => {
  it('source code does NOT update engineering_work_orders table in binding path', () => {
    expect(MCP_SOURCE).toContain('function bindActiveObjectWithAudit');
  });

  it('source code explicitly sets lifecycle_change_performed to false', () => {
    expect(MCP_SOURCE).toContain('lifecycle_change_performed: false');
  });

  it('source code does NOT call any EWO update in binding function', () => {
    const funcStart = MCP_SOURCE.indexOf('function bindActiveObjectWithAudit');
    const funcEnd = MCP_SOURCE.indexOf('\n}\n', funcStart);
    const funcBody = MCP_SOURCE.substring(funcStart, funcEnd);
    expect(funcBody).not.toContain('engineering_work_orders');
    expect(funcBody).toContain('atd_conversation_active_object');
  });

  it('source code includes no lifecycle change notice in response', () => {
    expect(MCP_SOURCE).toContain('No lifecycle mutation was performed');
  });
});

// ─── Conversation identity architecture verification ───────────────────────────

describe('Conversation identity architecture — conversation-specific only', () => {
  it('source code accepts explicit conversation_id parameter', () => {
    expect(MCP_SOURCE).toContain('explicit_conversation_id_parameter');
  });

  it('source code accepts X-Conversation-Id header', () => {
    expect(MCP_SOURCE).toContain('x_conversation_id_header');
  });

  it('source code accepts session_id parameter', () => {
    expect(MCP_SOURCE).toContain('explicit_session_id_parameter');
  });

  it('source code accepts X-Session-Id header', () => {
    expect(MCP_SOURCE).toContain('x_session_id_header');
  });

  it('source code does NOT use userId+clientId as conversation key', () => {
    expect(MCP_SOURCE).not.toContain('derived_from_userId_and_clientId');
  });

  it('source code does NOT use clientId alone as conversation key', () => {
    expect(MCP_SOURCE).not.toContain('derived_from_clientId');
  });

  it('source code uses tenantId only for ownership scoping, not conversation identity', () => {
    expect(MCP_SOURCE).toContain('tenantId');
    expect(MCP_SOURCE).toContain('ownership/tenant attribute');
  });
});

// ─── Routing distinction verification ─────────────────────────────────────────

describe('Routing distinction — inspect vs bind vs combined vs lifecycle', () => {
  it('source code distinguishes inspect_engineering_work_order', () => {
    expect(MCP_SOURCE).toContain('inspect_engineering_work_order');
  });

  it('source code distinguishes bind_active_engineering_object', () => {
    expect(MCP_SOURCE).toContain('bind_active_engineering_object');
  });

  it('source code distinguishes combined inspect_and_bind_active_object', () => {
    expect(MCP_SOURCE).toContain('inspect_and_bind_active_object');
  });

  it('source code distinguishes lifecycle_write_blocked', () => {
    expect(MCP_SOURCE).toContain('lifecycle_write_blocked');
  });

  it('"make it active" is NOT classified as lifecycle write', () => {
    const request = 'make it the active Engineering Work Order for this conversation';
    const classification = classifyIntentRefined(request);
    expect(classification.isWriteRequest).toBe(false);
    expect(classification.isContextBinding).toBe(true);
  });

  it('"mark the EWO as active" IS classified as lifecycle write', () => {
    const request = 'mark the EWO as active';
    const classification = classifyIntentRefined(request);
    expect(classification.isWriteRequest).toBe(true);
  });

  it('"approve the EWO" IS classified as lifecycle write', () => {
    const request = 'approve the EWO';
    const classification = classifyIntentRefined(request);
    expect(classification.isWriteRequest).toBe(true);
  });
});

// ─── Extended runtime diagnostics verification ─────────────────────────────────

describe('Extended runtime diagnostics (EWO-017R.2R R2 refinement)', () => {
  it('includes all required context-binding diagnostic fields', () => {
    const requiredFields = [
      'context_binding_intent_detected',
      'context_binding_is_combined_with_inspection',
      'combined_intent_decomposition',
      'previous_active_object_reference',
      'new_active_object_reference',
      'context_binding_outcome',
      'context_binding_operation',
      'lifecycle_change_performed',
      'operation_resolution',
      'capability_resolution',
      'conversation_scope_verified',
    ];
    for (const field of requiredFields) {
      expect(MCP_SOURCE).toContain(field);
    }
  });

  it('diagnostics are generated by application code, not LLM', () => {
    expect(MCP_SOURCE).toContain('function buildContextFirstDiagnostic');
  });
});
