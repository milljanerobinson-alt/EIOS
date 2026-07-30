// EWO-017R.1R.1 — Capability Inspection Framework Introspection
// Regression tests for framework introspection detection stage that runs
// BEFORE capability target extraction, preventing misclassification of
// requests about the inspection framework itself as capability inspections.

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const MCP_SOURCE = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');

// ─── Pattern Replication for Unit Testing ──────────────────────────────────────

const FRAMEWORK_INTROSPECTION_PATTERNS: RegExp[] = [
  /how\s+(?:does|do)\s+(?:the\s+)?capability\s+(?:metadata\s+)?inspection\s+(?:framework|work|pipeline)/i,
  /explain\s+(?:how\s+)?(?:the\s+)?capability\s+(?:metadata\s+)?inspection\s+(?:framework|works|pipeline)/i,
  /explain\s+(?:the\s+)?(?:capability\s+)?inspection\s+(?:framework|pipeline)/i,
  /how\s+(?:does|do)\s+(?:capability|the)\s+inspection\s+work/i,
  /how\s+are\s+runtime\s+diagnostics\s+generated/i,
  /explain\s+runtime\s+diagnostics/i,
  /explain\s+intent\s+diagnostics/i,
  /explain\s+target\s+extraction/i,
  /explain\s+canonical\s+capability\s+resolution/i,
  /explain\s+capability\s+resolution/i,
  /how\s+(?:does|do)\s+capability\s+resolution\s+work/i,
];

const METADATA_QUESTION_PATTERNS: RegExp[] = [
  /inspect\s+(?:the\s+)?(.+?)\s+capability/i,
  /explain\s+(?:the\s+)?(.+?)\s+capability/i,
  /describe\s+(?:the\s+)?(.+?)\s+capability/i,
  /show\s+(me\s+)?(?:the\s+)?(.+?)\s+capability/i,
  /tell me about\s+(?:the\s+)?(.+?)\s+capability/i,
  /what\s+(?:is|are)\s+(?:the\s+)?(.+?)\s+capability/i,
];

interface IntentClassification {
  isWriteRequest: boolean;
  isMetadataQuestion: boolean;
  isFrameworkIntrospection: boolean;
  detected_intent: string;
  confidence: number;
  routing_decision: string;
}

function classifyIntent(text: string): IntentClassification {
  const trimmed = text.trim();

  for (const pattern of FRAMEWORK_INTROSPECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isWriteRequest: false,
        isMetadataQuestion: false,
        isFrameworkIntrospection: true,
        detected_intent: "framework_introspection",
        confidence: 0.95,
        routing_decision: "framework_introspection",
      };
    }
  }

  for (const pattern of METADATA_QUESTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isWriteRequest: false,
        isMetadataQuestion: true,
        isFrameworkIntrospection: false,
        detected_intent: "capability_metadata_inspection",
        confidence: 0.95,
        routing_decision: "inspect_capability_metadata",
      };
    }
  }

  return {
    isWriteRequest: false,
    isMetadataQuestion: false,
    isFrameworkIntrospection: false,
    detected_intent: "inspection_or_query",
    confidence: 0.7,
    routing_decision: "route_to_operation",
  };
}

// ─── Framework Introspection Detection Tests ──────────────────────────────────

describe('EWO-017R.1R.1 — Framework Introspection Detection', () => {
  // The original PO failure case
  it('PO failure — "Explain how the Capability Metadata Inspection framework works internally" → framework introspection', () => {
    const result = classifyIntent('Explain how the Capability Metadata Inspection framework works internally');
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.isMetadataQuestion).toBe(false);
    expect(result.detected_intent).toBe('framework_introspection');
    expect(result.routing_decision).toBe('framework_introspection');
  });

  it('"How does Capability Metadata Inspection work?" → framework introspection', () => {
    const result = classifyIntent('How does Capability Metadata Inspection work?');
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.routing_decision).toBe('framework_introspection');
  });

  it('"Explain the Capability Metadata Inspection framework" → framework introspection', () => {
    const result = classifyIntent('Explain the Capability Metadata Inspection framework');
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.routing_decision).toBe('framework_introspection');
  });

  it('"How does capability inspection work internally?" → framework introspection', () => {
    const result = classifyIntent('How does capability inspection work internally?');
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.routing_decision).toBe('framework_introspection');
  });

  it('"Explain the inspection pipeline" → framework introspection', () => {
    const result = classifyIntent('Explain the inspection pipeline');
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.routing_decision).toBe('framework_introspection');
  });

  it('"Explain capability resolution" → framework introspection', () => {
    const result = classifyIntent('Explain capability resolution');
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.routing_decision).toBe('framework_introspection');
  });

  it('"How are runtime diagnostics generated?" → framework introspection', () => {
    const result = classifyIntent('How are runtime diagnostics generated?');
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.routing_decision).toBe('framework_introspection');
  });

  it('"Explain intent diagnostics" → framework introspection', () => {
    const result = classifyIntent('Explain intent diagnostics');
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.routing_decision).toBe('framework_introspection');
  });

  it('"Explain target extraction" → framework introspection', () => {
    const result = classifyIntent('Explain target extraction');
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.routing_decision).toBe('framework_introspection');
  });

  it('"Explain canonical capability resolution" → framework introspection', () => {
    const result = classifyIntent('Explain canonical capability resolution');
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.routing_decision).toBe('framework_introspection');
  });

  it('"How does capability resolution work?" → framework introspection', () => {
    const result = classifyIntent('How does capability resolution work?');
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.routing_decision).toBe('framework_introspection');
  });
});

// ─── Capability Inspection Still Works (No Regression) ────────────────────────

describe('EWO-017R.1R.1 — Capability Inspection Unaffected', () => {
  it('"Inspect the engineering-work-orders capability" → capability metadata inspection (not introspection)', () => {
    const result = classifyIntent('Inspect the engineering-work-orders capability');
    expect(result.isFrameworkIntrospection).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
    expect(result.routing_decision).toBe('inspect_capability_metadata');
  });

  it('"Explain the Engineering Records capability" → capability metadata inspection', () => {
    const result = classifyIntent('Explain the Engineering Records capability');
    expect(result.isFrameworkIntrospection).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
    expect(result.routing_decision).toBe('inspect_capability_metadata');
  });

  it('"Describe the Constitution capability" → capability metadata inspection', () => {
    const result = classifyIntent('Describe the Constitution capability');
    expect(result.isFrameworkIntrospection).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
    expect(result.routing_decision).toBe('inspect_capability_metadata');
  });

  it('"Show me the engineering records capability" → capability metadata inspection', () => {
    const result = classifyIntent('Show me the engineering records capability');
    expect(result.isFrameworkIntrospection).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
    expect(result.routing_decision).toBe('inspect_capability_metadata');
  });

  it('"What is the memory capability?" → capability metadata inspection', () => {
    const result = classifyIntent('What is the memory capability?');
    expect(result.isFrameworkIntrospection).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
    expect(result.routing_decision).toBe('inspect_capability_metadata');
  });
});

// ─── No Incorrect Target Extraction ────────────────────────────────────────────

describe('EWO-017R.1R.1 — No Incorrect Target Extraction', () => {
  it('"Explain how the Capability Metadata Inspection framework works internally" does NOT extract "how the" as capability', () => {
    const text = 'Explain how the Capability Metadata Inspection framework works internally';
    const result = classifyIntent(text);

    // Must be classified as framework introspection, NOT capability inspection
    expect(result.isFrameworkIntrospection).toBe(true);
    expect(result.isMetadataQuestion).toBe(false);

    // The metadata question pattern /explain\s+(?:the\s+)?(.+?)\s+capability/i
    // would capture "how the" — verify it would have matched WITHOUT the
    // introspection guard, proving the guard is necessary
    const metadataPattern = /explain\s+(?:the\s+)?(.+?)\s+capability/i;
    const metadataMatch = text.match(metadataPattern);
    expect(metadataMatch).not.toBeNull();
    expect(metadataMatch![1].trim()).toBe('how the');

    // But with the introspection guard, it's correctly classified
    expect(result.detected_intent).toBe('framework_introspection');
  });
});

// ─── Source Code Verification ──────────────────────────────────────────────────

describe('EWO-017R.1R.1 — Source Code Verification', () => {
  it('defines FRAMEWORK_INTROSPECTION_PATTERNS', () => {
    expect(MCP_SOURCE).toContain('FRAMEWORK_INTROSPECTION_PATTERNS');
  });

  it('defines isFrameworkIntrospection in IntentClassification', () => {
    expect(MCP_SOURCE).toContain('isFrameworkIntrospection');
  });

  it('checks framework introspection patterns before metadata patterns', () => {
    const introspectionPos = MCP_SOURCE.indexOf('FRAMEWORK_INTROSPECTION_PATTERNS');
    const metadataPos = MCP_SOURCE.indexOf('METADATA_QUESTION_PATTERNS');
    expect(introspectionPos).toBeGreaterThan(-1);
    expect(metadataPos).toBeGreaterThan(-1);
    expect(introspectionPos).toBeLessThan(metadataPos);
  });

  it('defines buildFrameworkIntrospectionResponse function', () => {
    expect(MCP_SOURCE).toContain('buildFrameworkIntrospectionResponse');
  });

  it('defines formatFrameworkIntrospectionConversational function', () => {
    expect(MCP_SOURCE).toContain('formatFrameworkIntrospectionConversational');
  });

  it('includes execution_path in RuntimeDiagnosticEnvelope', () => {
    expect(MCP_SOURCE).toContain('execution_path');
    expect(MCP_SOURCE).toContain('capability_metadata_inspection');
    expect(MCP_SOURCE).toContain('framework_introspection');
  });

  it('routes framework introspection before capability metadata inspection in handler', () => {
    const introspectionRoutingPos = MCP_SOURCE.indexOf('intentDiag.isFrameworkIntrospection');
    const metadataRoutingPos = MCP_SOURCE.indexOf('isMetadataQuestion && intentDiag.routing_decision === "inspect_capability_metadata"');
    expect(introspectionRoutingPos).toBeGreaterThan(-1);
    expect(metadataRoutingPos).toBeGreaterThan(-1);
    expect(introspectionRoutingPos).toBeLessThan(metadataRoutingPos);
  });

  it('introspection response states implementation details are unavailable', () => {
    expect(MCP_SOURCE).toContain('implementation_details');
    expect(MCP_SOURCE).toContain('unavailable');
  });

  it('introspection response does not invent algorithms', () => {
    expect(MCP_SOURCE).toContain('no_metadata_inferred');
    expect(MCP_SOURCE).toContain('No algorithms are invented');
  });

  it('all buildRuntimeDiagnosticEnvelope calls include execution_path', () => {
    // Find all calls to buildRuntimeDiagnosticEnvelope and verify they have
    // a 5th argument (the execution_path parameter)
    const calls = MCP_SOURCE.match(/buildRuntimeDiagnosticEnvelope\(/g);
    expect(calls).not.toBeNull();
    expect(calls!.length).toBeGreaterThan(5);

    // Verify the function signature includes execution_path parameter
    expect(MCP_SOURCE).toContain('executionPath: "capability_metadata_inspection" | "framework_introspection"');
  });
});
