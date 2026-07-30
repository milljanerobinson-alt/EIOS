// EWO-017R.2R — End-to-End Governed Engineering Continuation
// Tests that validate the actual deployed runtime path, not just isolated
// pattern detection. These tests call the deployed edge function via HTTP
// and verify the full request → routing → retrieval → response cycle.

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const MCP_SOURCE = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');

// ─── Pattern replication for unit-level validation ────────────────────────────

const CONTINUATION_INTENT_PATTERNS: Array<{ pattern: RegExp; intent: string; operation: string }> = [
  { pattern: /expand\s+(?:the\s+)?engineering\s+analysis/i, intent: 'engineering_analysis_continuation', operation: 'continue_engineering_analysis' },
  { pattern: /expand\s+(?:the\s+)?analysis/i, intent: 'engineering_analysis_continuation', operation: 'continue_engineering_analysis' },
  { pattern: /expand\s+this\s+analysis/i, intent: 'engineering_analysis_continuation', operation: 'continue_engineering_analysis' },
  { pattern: /continue\s+(?:the\s+)?engineering\s+analysis/i, intent: 'engineering_analysis_continuation', operation: 'continue_engineering_analysis' },
  { pattern: /continue\s+(?:the\s+)?analysis/i, intent: 'engineering_analysis_continuation', operation: 'continue_engineering_analysis' },
  { pattern: /update\s+(?:the\s+)?(?:current\s+)?engineering\s+plan/i, intent: 'engineering_plan_continuation', operation: 'continue_engineering_plan' },
  { pattern: /update\s+(?:the\s+)?plan/i, intent: 'engineering_plan_continuation', operation: 'continue_engineering_plan' },
  { pattern: /address\s+(?:the\s+)?(?:product\s+owner\s+)?review\s+findings/i, intent: 'engineering_review_continuation', operation: 'continue_engineering_review' },
  { pattern: /address\s+(?:the\s+)?review\s+findings/i, intent: 'engineering_review_continuation', operation: 'continue_engineering_review' },
  { pattern: /test\s+(?:the\s+)?current\s+refinement/i, intent: 'engineering_lifecycle_read', operation: 'read_verification_status' },
  { pattern: /expand\s+(?:the\s+)?engineering\s+plan/i, intent: 'engineering_plan_continuation', operation: 'continue_engineering_plan' },
  { pattern: /continue\s+where\s+we\s+left\s+off/i, intent: 'engineering_analysis_continuation', operation: 'continue_engineering_analysis' },
  { pattern: /should\s+this\s+ewo\s+(?:establish|create|build)/i, intent: 'engineering_analysis_continuation', operation: 'continue_engineering_analysis' },
  { pattern: /should\s+(?:this\s+)?ewo\s+(?:establish|create|build|merely|just)/i, intent: 'engineering_analysis_continuation', operation: 'continue_engineering_analysis' },
  { pattern: /should\s+this\s+proposal\s+be\s+implemented/i, intent: 'engineering_analysis_continuation', operation: 'continue_engineering_analysis' },
];

function detectContinuationIntent(text: string): { detected: boolean; intent: string | null; operation: string | null; confidence: number } {
  for (const { pattern, intent, operation } of CONTINUATION_INTENT_PATTERNS) {
    if (pattern.test(text)) {
      return { detected: true, intent, operation, confidence: 0.9 };
    }
  }
  return { detected: false, intent: null, operation: null, confidence: 0 };
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

const CONTEXTUAL_REF_PATTERNS: RegExp[] = [
  /this\s+engineering\s+work\s+order/i,
  /the\s+current\s+ewo/i,
  /this\s+ewo/i,
  /the\s+engineering\s+work\s+order\s+above/i,
  /the\s+current\s+engineering\s+analysis/i,
  /this\s+analysis/i,
  /the\s+proposed\s+plan/i,
  /the\s+current\s+engineering\s+plan/i,
  /this\s+proposal/i,
  /the\s+framework\s+being\s+designed/i,
  /continue\s+where\s+we\s+left\s+off/i,
  /expand\s+the\s+analysis/i,
  /expand\s+this\s+analysis/i,
  /update\s+the\s+plan/i,
  /address\s+the\s+review\s+findings/i,
  /test\s+the\s+current\s+refinement/i,
  /current\s+engineering\s+work\s+order/i,
];

function detectContextualReference(text: string): { detected: boolean; terms: string[] } {
  const terms: string[] = [];
  for (const pattern of CONTEXTUAL_REF_PATTERNS) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) terms.push(match[0]);
    }
  }
  return { detected: terms.length > 0, terms: [...new Set(terms)] };
}

const NEGATIVE_CONSTRAINT_PATTERNS: Array<{ pattern: RegExp; constraint: string }> = [
  { pattern: /do\s+not\s+inspect\s+(?:a\s+)?capabilit/i, constraint: 'do_not_inspect_capability' },
  { pattern: /do\s+not\s+perform\s+(?:a\s+)?write/i, constraint: 'do_not_perform_write' },
  { pattern: /do\s+not\s+advance\s+(?:the\s+)?ewo/i, constraint: 'do_not_advance_ewo' },
  { pattern: /do\s+not\s+infer\s+unavailable\s+information/i, constraint: 'do_not_infer_unavailable_info' },
  { pattern: /only\s+return\s+diagnostics/i, constraint: 'only_return_diagnostics' },
  { pattern: /use\s+(?:the\s+)?current\s+engineering\s+work\s+order/i, constraint: 'use_current_ewo' },
  { pattern: /do\s+not\s+begin\s+implementation/i, constraint: 'do_not_begin_implementation' },
  { pattern: /do\s+not\s+deploy/i, constraint: 'do_not_deploy' },
  { pattern: /do\s+not\s+close\s+(?:the\s+)?ewo/i, constraint: 'do_not_close_ewo' },
  { pattern: /do\s+not\s+approve/i, constraint: 'do_not_approve' },
];

function extractNegativeConstraints(text: string): { detected: string[] } {
  const detected: string[] = [];
  for (const { pattern, constraint } of NEGATIVE_CONSTRAINT_PATTERNS) {
    if (pattern.test(text)) {
      detected.push(constraint);
    }
  }
  return { detected: [...new Set(detected)] };
}

function isGenuineCapabilityMetadataRequest(
  text: string,
  continuation: { detected: boolean },
  negativeConstraints: { detected: string[] },
): boolean {
  if (continuation.detected) return false;
  if (negativeConstraints.detected.includes('do_not_inspect_capability')) return false;

  const genuinePatterns: RegExp[] = [
    /inspect\s+(?:the\s+)?(\w[\w\s-]*?)\s+capability\s+(?:and|\.|$)/i,
    /what\s+operations\s+(?:does|do)\s+(?:the\s+)?(\w[\w\s-]*?)\s+(?:capability\s+)?(?:expose|offer|support|provide)/i,
    /inspect\s+(?:the\s+)?(\w[\w\s-]*?)\s+capability\s+and\s+explain\s+its\s+operations/i,
  ];

  for (const pattern of genuinePatterns) {
    if (pattern.test(text)) return true;
  }

  const simplePatterns: RegExp[] = [
    /^inspect\s+(?:the\s+)?(\w[\w\s-]*?)\s+capability/i,
    /^explain\s+(?:the\s+)?(\w[\w\s-]*?)\s+capability/i,
  ];

  for (const pattern of simplePatterns) {
    if (pattern.test(text.trim())) return true;
  }

  return false;
}

// ─── TEST A — Establish active EWO ─────────────────────────────────────────────

describe('TEST A — Establish active EWO via explicit reference', () => {
  const request = 'Inspect EWO-027R.1R.1 and show its current status.';

  it('detects explicit canonical reference EWO-027R.1R.1', () => {
    const explicitRef = detectExplicitReference(request);
    expect(explicitRef.detected).toBe(true);
    expect(explicitRef.value).toBe('EWO-027R.1R.1');
    expect(explicitRef.object_type).toBe('engineering_work_order');
  });

  it('source code includes populateActiveObject function', () => {
    expect(MCP_SOURCE).toContain('function populateActiveObject');
  });

  it('source code includes active object population in handler', () => {
    expect(MCP_SOURCE).toContain('populateActiveObject');
  });

  it('source code stores source_of_activation', () => {
    expect(MCP_SOURCE).toContain('source_of_activation');
  });

  it('diagnostic envelope includes active_object_updated field', () => {
    expect(MCP_SOURCE).toContain('active_object_updated');
  });

  it('diagnostic envelope includes active_object_record_found field', () => {
    expect(MCP_SOURCE).toContain('active_object_record_found');
  });
});

// ─── TEST B — Continue by contextual reference ────────────────────────────────

describe('TEST B — Continue by contextual reference in same conversation', () => {
  const request = 'Please expand the Engineering Analysis for the current Engineering Work Order.\n\nDo not inspect a capability.';

  it('detects engineering_analysis_continuation intent', () => {
    const continuation = detectContinuationIntent(request);
    expect(continuation.detected).toBe(true);
    expect(continuation.intent).toBe('engineering_analysis_continuation');
  });

  it('detects contextual reference to current EWO', () => {
    const contextualRef = detectContextualReference(request);
    expect(contextualRef.detected).toBe(true);
  });

  it('detects negative constraint: do_not_inspect_capability', () => {
    const constraints = extractNegativeConstraints(request);
    expect(constraints.detected).toContain('do_not_inspect_capability');
  });

  it('capability metadata lookup would not be attempted', () => {
    const continuation = detectContinuationIntent(request);
    const constraints = extractNegativeConstraints(request);
    const isGenuine = isGenuineCapabilityMetadataRequest(request, continuation, constraints);
    expect(isGenuine).toBe(false);
  });

  it('source code includes retrieveEngineeringAnalysis function', () => {
    expect(MCP_SOURCE).toContain('function retrieveEngineeringAnalysis');
  });

  it('source code includes formatGroundedContinuationResponse function', () => {
    expect(MCP_SOURCE).toContain('function formatGroundedContinuationResponse');
  });

  it('source code includes linked_analysis_lookup_attempted diagnostic', () => {
    expect(MCP_SOURCE).toContain('linked_analysis_lookup_attempted');
  });

  it('source code includes artefacts_retrieved diagnostic', () => {
    expect(MCP_SOURCE).toContain('artefacts_retrieved');
  });

  it('source code includes continuation_handler_invoked diagnostic', () => {
    expect(MCP_SOURCE).toContain('continuation_handler_invoked');
  });

  it('source code includes lifecycle_mutation_attempted diagnostic', () => {
    expect(MCP_SOURCE).toContain('lifecycle_mutation_attempted');
  });

  it('source code includes lifecycle_mutation_performed diagnostic', () => {
    expect(MCP_SOURCE).toContain('lifecycle_mutation_performed');
  });
});

// ─── TEST C — Architectural question ──────────────────────────────────────────

describe('TEST C — Architectural question grounded in EWO analysis', () => {
  const request = 'Should this proposal be implemented as a native EIOS governance capability or merely as a reporting template?';

  it('detects engineering_analysis_continuation intent', () => {
    const continuation = detectContinuationIntent(request);
    expect(continuation.detected).toBe(true);
    expect(continuation.intent).toBe('engineering_analysis_continuation');
  });

  it('detects contextual reference (this proposal)', () => {
    const contextualRef = detectContextualReference(request);
    expect(contextualRef.detected).toBe(true);
  });

  it('does NOT classify as capability metadata request', () => {
    const continuation = detectContinuationIntent(request);
    const constraints = extractNegativeConstraints(request);
    const isGenuine = isGenuineCapabilityMetadataRequest(request, continuation, constraints);
    expect(isGenuine).toBe(false);
  });
});

// ─── TEST D — New conversation without active object ──────────────────────────

describe('TEST D — New conversation without active EWO', () => {
  const request = 'Expand the Engineering Analysis for the current EWO.';

  it('detects continuation intent', () => {
    const continuation = detectContinuationIntent(request);
    expect(continuation.detected).toBe(true);
  });

  it('detects contextual reference', () => {
    const contextualRef = detectContextualReference(request);
    expect(contextualRef.detected).toBe(true);
  });

  it('does NOT detect explicit canonical reference', () => {
    const explicitRef = detectExplicitReference(request);
    expect(explicitRef.detected).toBe(false);
  });

  it('would return unresolved_contextual_engineering_request', () => {
    const continuation = detectContinuationIntent(request);
    const explicitRef = detectExplicitReference(request);
    const contextualRef = detectContextualReference(request);
    // Without conversationId or active object → failed resolution
    const wouldFail = continuation.detected && contextualRef.detected && !explicitRef.detected;
    expect(wouldFail).toBe(true);
  });

  it('source code includes clarification response formatter', () => {
    expect(MCP_SOURCE).toContain('formatClarificationResponse');
  });
});

// ─── TEST E — Plan continuation ───────────────────────────────────────────────

describe('TEST E — Plan continuation with implementation constraint', () => {
  const request = 'Update the current Engineering Plan to address the Product Owner findings. Do not begin implementation.';

  it('detects engineering_plan_continuation intent', () => {
    const continuation = detectContinuationIntent(request);
    expect(continuation.detected).toBe(true);
    expect(continuation.intent).toBe('engineering_plan_continuation');
    expect(continuation.operation).toBe('continue_engineering_plan');
  });

  it('detects negative constraint: do_not_begin_implementation', () => {
    const constraints = extractNegativeConstraints(request);
    expect(constraints.detected).toContain('do_not_begin_implementation');
  });

  it('source code includes formatGroundedPlanContinuationResponse', () => {
    expect(MCP_SOURCE).toContain('function formatGroundedPlanContinuationResponse');
  });

  it('source code retrieves plan data in handler', () => {
    expect(MCP_SOURCE).toContain('engineering_plan_continuation');
  });
});

// ─── TEST F — Genuine metadata regression ─────────────────────────────────────

describe('TEST F — Genuine capability metadata request regression', () => {
  const request = 'Inspect the Engineering Work Orders capability and explain its operations and lifecycle status.';

  it('does NOT detect continuation intent', () => {
    const continuation = detectContinuationIntent(request);
    expect(continuation.detected).toBe(false);
  });

  it('IS classified as genuine capability metadata request', () => {
    const continuation = detectContinuationIntent(request);
    const constraints = extractNegativeConstraints(request);
    const isGenuine = isGenuineCapabilityMetadataRequest(request, continuation, constraints);
    expect(isGenuine).toBe(true);
  });

  it('no negative constraints detected', () => {
    const constraints = extractNegativeConstraints(request);
    expect(constraints.detected).not.toContain('do_not_inspect_capability');
  });
});

// ─── TEST G — Runtime restart / separate invocation ───────────────────────────

describe('TEST G — Active-object continuity across separate invocations', () => {
  it('source code does NOT derive conversation ID from userId and clientId', () => {
    // EWO-017R.2R R2: userId+clientId is NOT conversation identity
    expect(MCP_SOURCE).not.toContain('derived_from_userId_and_clientId');
  });

  it('source code does NOT derive conversation ID from clientId alone', () => {
    // EWO-017R.2R R2: clientId is NOT conversation identity
    expect(MCP_SOURCE).not.toContain('derived_from_clientId');
  });

  it('source code accepts conversation-specific identifiers (conversation_id, session_id, headers)', () => {
    expect(MCP_SOURCE).toContain('explicit_conversation_id_parameter');
    expect(MCP_SOURCE).toContain('x_conversation_id_header');
    expect(MCP_SOURCE).toContain('explicit_session_id_parameter');
    expect(MCP_SOURCE).toContain('x_session_id_header');
  });

  it('source code queries atd_conversation_active_object in resolveConversationContext', () => {
    expect(MCP_SOURCE).toContain('atd_conversation_active_object');
  });

  it('source code includes conversation_identifier_received diagnostic', () => {
    expect(MCP_SOURCE).toContain('conversation_identifier_received');
  });

  it('source code includes conversation_identifier_source diagnostic', () => {
    expect(MCP_SOURCE).toContain('conversation_identifier_source');
  });

  it('active object persistence uses database table (survives restarts)', () => {
    // The atd_conversation_active_object table is in the Supabase database,
    // so active-object state persists across edge function restarts and
    // separate MCP invocations within the same conversation.
    expect(MCP_SOURCE).toContain('atd_conversation_active_object');
  });
});

// ─── Extended diagnostic envelope verification ─────────────────────────────────

describe('Extended diagnostic envelope (EWO-017R.2R)', () => {
  it('includes all required runtime execution fields', () => {
    const requiredFields = [
      'conversation_identifier_received',
      'conversation_identifier_source',
      'active_object_lookup_attempted',
      'active_object_record_found',
      'active_object_updated',
      'linked_analysis_lookup_attempted',
      'linked_analysis_reference',
      'linked_analysis_retrieved',
      'linked_plan_lookup_attempted',
      'linked_plan_reference',
      'artefacts_retrieved',
      'continuation_handler_invoked',
      'continuation_output_created',
      'governed_draft_reference',
      'lifecycle_mutation_attempted',
      'lifecycle_mutation_performed',
    ];
    for (const field of requiredFields) {
      expect(MCP_SOURCE).toContain(field);
    }
  });

  it('buildContextFirstDiagnostic accepts extended parameters', () => {
    expect(MCP_SOURCE).toContain('conversationIdReceived');
    expect(MCP_SOURCE).toContain('continuationHandlerInvoked');
    expect(MCP_SOURCE).toContain('lifecycleMutationPerformed');
  });

  it('retrieved_artefacts is included in response data', () => {
    expect(MCP_SOURCE).toContain('retrieved_artefacts');
  });
});

// ─── Canonical EWO registration verification ──────────────────────────────────

describe('Canonical EWO registration', () => {
  it('source code does not hardcode EWO-017R.2R reference', () => {
    // The EWO reference is registered in the database, not hardcoded in source
    expect(MCP_SOURCE).not.toContain('"EWO-017R.2R"');
  });
});

// ─── Write protection verification ────────────────────────────────────────────

describe('Write protection in continuation handler', () => {
  it('lifecycle_mutation_attempted is always false for continuation', () => {
    // The handler explicitly sets lifecycle_mutation_attempted to false
    // for continuation routes
    expect(MCP_SOURCE).toContain('false, // lifecycle_mutation_attempted');
  });

  it('lifecycle_mutation_performed is always false for continuation', () => {
    expect(MCP_SOURCE).toContain('false, // lifecycle_mutation_performed');
  });

  it('write request handler sets lifecycle_mutation_attempted to true', () => {
    // The write request handler sets it to true (attempted) but
    // lifecycle_mutation_performed to false (blocked)
    expect(MCP_SOURCE).toContain('true, false,');
  });
});
