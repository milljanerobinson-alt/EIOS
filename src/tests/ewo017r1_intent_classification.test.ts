// EWO-017R.1 — Conversation Inspection Intent Classification Refinement
// Regression tests for semantic intent classification distinguishing
// metadata questions ABOUT write support from actual write requests.

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const MCP_SOURCE = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');

// ─── Intent Classification Unit Tests ──────────────────────────────────────────

// Replicate the classifyIntent function for unit testing
const METADATA_QUESTION_PATTERNS: RegExp[] = [
  /does\s+.+?\s+support\s+write/i,
  /is\s+.+?\s+read[\s-]?only/i,
  /what\s+permissions\s+(?:are\s+)?(?:required|needed)/i,
  /what\s+operations\s+(?:are\s+|does\s+)?(?:exposed|it\s+expose|support|offer|provide)/i,
  /what\s+(?:is|are)\s+(?:the\s+)?(?:lifecycle|availability|dependencies|governance|authentication)/i,
  /whether\s+it\s+is\s+read[\s-]?only/i,
  /whether\s+it\s+supports\s+write/i,
  /can\s+this\s+capability\s+(?:create|delete|update|modify)/i,
  /inspect\s+(?:the\s+)?(.+?)\s+capability/i,
  /explain\s+(?:the\s+)?(.+?)\s+capability/i,
  /describe\s+(?:the\s+)?(.+?)\s+capability/i,
  /show\s+(me\s+)?(?:the\s+)?(.+?)\s+capability/i,
  /tell me about\s+(?:the\s+)?(.+?)\s+capability/i,
  /what\s+(?:is|are)\s+(?:the\s+)?(.+?)\s+capability/i,
  /what\s+(?:operations|capabilities|services)\s+(?:does|do)\s+(.+?)\s+(?:expose|offer|support|provide)/i,
];

const WRITE_COMMAND_PATTERNS: RegExp[] = [
  /^(?:please\s+)?(?:create|insert|add)\s+/i,
  /^(?:please\s+)?(?:delete|remove)\s+/i,
  /^(?:please\s+)?(?:update|modify|change)\s+/i,
  /^(?:please\s+)?(?:archive|restore)\s+/i,
  /^(?:please\s+)?(?:approve|accept|reject)\s+/i,
  /^(?:please\s+)?(?:close|cancel|stop|start)\s+/i,
  /^(?:please\s+)?(?:deploy|execute|run)\s+/i,
  /^(?:please\s+)?(?:assign|revoke|grant|set|reset)\s+/i,
  /^(?:please\s+)?(?:promote|demote|merge|split|move|replace)\s+/i,
];

const WRITE_ACTION_KEYWORDS = ["insert", "update", "delete", "create", "modify", "change", "approve", "accept", "close", "deploy", "execute", "run", "start", "stop", "cancel", "archive", "restore", "reset", "set", "assign", "revoke", "grant", "promote", "demote", "merge", "split", "move", "replace", "remove", "add"];

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
  const lower = trimmed.toLowerCase();

  // Check framework introspection patterns first (EWO-017R.1R.1)
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

  for (const pattern of WRITE_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isWriteRequest: true,
        isMetadataQuestion: false,
        isFrameworkIntrospection: false,
        detected_intent: "write_request",
        confidence: 0.95,
        routing_decision: "refuse_write_request",
      };
    }
  }

  const isQuestion = /\?\s*$/.test(trimmed) || /^(?:does|is|are|what|can|do|will|how|why|when|who|which)\b/i.test(trimmed);

  if (!isQuestion) {
    const firstWord = lower.split(/\s+/)[0];
    const afterPlease = lower.replace(/^please\s+/, '').split(/\s+/)[0];
    if (WRITE_ACTION_KEYWORDS.includes(firstWord) || WRITE_ACTION_KEYWORDS.includes(afterPlease)) {
      return {
        isWriteRequest: true,
        isMetadataQuestion: false,
        isFrameworkIntrospection: false,
        detected_intent: "write_request",
        confidence: 0.85,
        routing_decision: "refuse_write_request",
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

// ─── Product Owner Regression Tests ────────────────────────────────────────────

describe('EWO-017R.1 — Intent Classification Regression Tests', () => {
  // PASS: Inspect the Engineering Work Orders capability.
  it('PASS — "Inspect the Engineering Work Orders capability" → metadata inspection', () => {
    const result = classifyIntent('Inspect the Engineering Work Orders capability');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
    expect(result.routing_decision).toBe('inspect_capability_metadata');
  });

  // PASS: Does Engineering Work Orders support write operations?
  it('PASS — "Does Engineering Work Orders support write operations?" → metadata inspection', () => {
    const result = classifyIntent('Does Engineering Work Orders support write operations?');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
    expect(result.routing_decision).toBe('inspect_capability_metadata');
  });

  // PASS: What permissions are required?
  it('PASS — "What permissions are required?" → metadata inspection', () => {
    const result = classifyIntent('What permissions are required?');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
    expect(result.routing_decision).toBe('inspect_capability_metadata');
  });

  // PASS: What operations are exposed?
  it('PASS — "What operations are exposed?" → metadata inspection', () => {
    const result = classifyIntent('What operations are exposed?');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
    expect(result.routing_decision).toBe('inspect_capability_metadata');
  });

  // FAIL: Create Engineering Work Order.
  it('FAIL — "Create Engineering Work Order" → write request', () => {
    const result = classifyIntent('Create Engineering Work Order');
    expect(result.isWriteRequest).toBe(true);
    expect(result.routing_decision).toBe('refuse_write_request');
  });

  // FAIL: Delete Engineering Work Order.
  it('FAIL — "Delete Engineering Work Order" → write request', () => {
    const result = classifyIntent('Delete Engineering Work Order');
    expect(result.isWriteRequest).toBe(true);
    expect(result.routing_decision).toBe('refuse_write_request');
  });

  // FAIL: Archive Engineering Record.
  it('FAIL — "Archive Engineering Record" → write request', () => {
    const result = classifyIntent('Archive Engineering Record');
    expect(result.isWriteRequest).toBe(true);
    expect(result.routing_decision).toBe('refuse_write_request');
  });
});

// ─── Edge Case Tests ───────────────────────────────────────────────────────────

describe('EWO-017R.1 — Edge Case Intent Classification', () => {
  it('"Is this read only?" → metadata inspection', () => {
    const result = classifyIntent('Is this read only?');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"Is this read-only?" → metadata inspection', () => {
    const result = classifyIntent('Is this read-only?');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"Whether it is read-only" → metadata inspection', () => {
    const result = classifyIntent('Whether it is read-only');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"Whether it supports write operations" → metadata inspection', () => {
    const result = classifyIntent('Whether it supports write operations');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"Can this capability create Engineering Work Orders?" → metadata inspection', () => {
    const result = classifyIntent('Can this capability create Engineering Work Orders?');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"What is the lifecycle status?" → metadata inspection', () => {
    const result = classifyIntent('What is the lifecycle status?');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"What are the dependencies?" → metadata inspection', () => {
    const result = classifyIntent('What are the dependencies?');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"What operations does Engineering Work Orders expose?" → metadata inspection', () => {
    const result = classifyIntent('What operations does Engineering Work Orders expose?');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"Explain the Engineering Work Orders capability" → metadata inspection', () => {
    const result = classifyIntent('Explain the Engineering Work Orders capability');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"Describe the constitution capability" → metadata inspection', () => {
    const result = classifyIntent('Describe the constitution capability');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"Show me the engineering records capability" → metadata inspection', () => {
    const result = classifyIntent('Show me the engineering records capability');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"Tell me about the memory capability" → metadata inspection', () => {
    const result = classifyIntent('Tell me about the memory capability');
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
  });

  it('"Please update Engineering Record" → write request', () => {
    const result = classifyIntent('Please update Engineering Record');
    expect(result.isWriteRequest).toBe(true);
  });

  it('"Please delete EWO-001" → write request', () => {
    const result = classifyIntent('Please delete EWO-001');
    expect(result.isWriteRequest).toBe(true);
  });

  it('"Insert a new engineering record" → write request', () => {
    const result = classifyIntent('Insert a new engineering record');
    expect(result.isWriteRequest).toBe(true);
  });

  it('"Approve the completion report" → write request', () => {
    const result = classifyIntent('Approve the completion report');
    expect(result.isWriteRequest).toBe(true);
  });

  it('"Close engineering work order EWO-024" → write request', () => {
    const result = classifyIntent('Close engineering work order EWO-024');
    expect(result.isWriteRequest).toBe(true);
  });

  it('"Deploy the latest release candidate" → write request', () => {
    const result = classifyIntent('Deploy the latest release candidate');
    expect(result.isWriteRequest).toBe(true);
  });

  // The original PO failure: a complex request containing "supports write operations"
  it('PO failure case — complex inspection request mentioning "supports write operations" → metadata inspection', () => {
    const complexRequest = `Inspect the Engineering Work Orders capability and explain:
- What it does
- The operations it exposes
- Whether it is read-only or supports write operations
- Any governance or permission restrictions
- The capability lifecycle status
- Any dependencies
- Supported object types
- Current availability
- Runtime diagnostics for this inspection`;
    const result = classifyIntent(complexRequest);
    expect(result.isWriteRequest).toBe(false);
    expect(result.isMetadataQuestion).toBe(true);
    expect(result.routing_decision).toBe('inspect_capability_metadata');
  });

  // "run" keyword in non-command context should NOT be a write request
  it('"Runtime diagnostics for this inspection" containing "run" substring → not a write request', () => {
    const result = classifyIntent('Runtime diagnostics for this inspection');
    expect(result.isWriteRequest).toBe(false);
  });
});

// ─── Source Code Verification ──────────────────────────────────────────────────

describe('EWO-017R.1 — Source Code Verification', () => {
  it('replaces old isWriteRequest with classifyIntent', () => {
    expect(MCP_SOURCE).toContain('function classifyIntent');
    expect(MCP_SOURCE).toContain('interface IntentClassification');
  });

  it('old isWriteRequest function is removed', () => {
    expect(MCP_SOURCE).not.toMatch(/function isWriteRequest\(/);
  });

  it('metadata question patterns are defined', () => {
    expect(MCP_SOURCE).toContain('METADATA_QUESTION_PATTERNS');
    expect(MCP_SOURCE).toContain('support\\s+write');
    expect(MCP_SOURCE).toContain('read[\\s-]?only');
  });

  it('write command patterns are defined', () => {
    expect(MCP_SOURCE).toContain('WRITE_COMMAND_PATTERNS');
    expect(MCP_SOURCE).toContain('create|insert|add');
    expect(MCP_SOURCE).toContain('delete|remove');
  });

  it('intent diagnostics are included in responses', () => {
    expect(MCP_SOURCE).toContain('intent_diagnostics');
    expect(MCP_SOURCE).toContain('detected_intent');
    expect(MCP_SOURCE).toContain('routing_decision');
    expect(MCP_SOURCE).toContain('confidence');
  });

  it('metadata questions route before write request check', () => {
    const metadataCheckPos = MCP_SOURCE.indexOf('isMetadataQuestion && intentDiag.routing_decision === "inspect_capability_metadata"');
    const writeCheckPos = MCP_SOURCE.indexOf('if (interpretation.isWriteRequest)');
    expect(metadataCheckPos).toBeGreaterThan(-1);
    expect(writeCheckPos).toBeGreaterThan(-1);
    expect(metadataCheckPos).toBeLessThan(writeCheckPos);
  });

  it('refusal includes refusal_reason', () => {
    expect(MCP_SOURCE).toContain('refusal_reason: "write_request_detected"');
  });

  it('intentClassification is part of InterpretedRequest', () => {
    expect(MCP_SOURCE).toContain('intentClassification: IntentClassification');
  });
});

// ─── Browser Tab Title Verification ────────────────────────────────────────────

describe('EWO-017R.1 — Browser Tab Title', () => {
  it('index.html title is set to EIOS', () => {
    const indexHtml = fs.readFileSync('index.html', 'utf-8');
    expect(indexHtml).toContain('<title>EIOS</title>');
    expect(indexHtml).not.toContain('LLND Automate');
  });
});
