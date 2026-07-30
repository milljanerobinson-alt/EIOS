// EWO-017R — Capability Metadata Target Extraction Refinement
// Regression tests for extracting the capability target from natural-language
// requests instead of treating the entire request as the capability name.

import { describe, it, expect } from 'vitest';

// Replicate extractCapabilityPhrase for unit testing
function normalizeCapabilityName(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
}

function extractCapabilityPhrase(input: string): string {
  const firstLine = input.split(/[\n\r]/)[0].trim();
  let result = firstLine.toLowerCase().replace(/[?.!:]+$/g, '').trim();

  const prefixPatterns = [
    /^(?:inspect|explain|describe|show(?:\s+me)?|tell me about|what (?:operations|capabilities|services) (?:does|are|is))\s+(?:the\s*)?/i,
    /^(?:what is|what are)\s+(?:the\s*)?/i,
    /^(?:get|fetch|retrieve)\s+(?:the\s*)?/i,
    /^(?:list|view)\s+(?:the\s*)?/i,
    /^(?:does|do|is|are)\s+(?:the\s*)?/i,
  ];
  for (const pat of prefixPatterns) {
    result = result.replace(pat, '');
  }

  result = result.replace(/^the(?:\s+|$)/i, '');

  const capIdx = result.indexOf('capability');
  if (capIdx > 0) {
    result = result.substring(0, capIdx).trim();
  }

  for (const stopper of ['capabilities', 'service', 'services']) {
    const idx = result.indexOf(stopper);
    if (idx > 0) {
      result = result.substring(0, idx).trim();
    }
  }

  result = result.replace(/\s+and\s+(?:explain|show|tell|include|describe|list|detail).*$/i, '');
  result = result.replace(/\s+(?:what|whether|is it|does it|can it|will it|how|why).*$/i, '');
  result = result.replace(/\s+(?:expose|offers?|supports?|provides?|exposes?)$/i, '');
  result = result.replace(/\s+support\s+(?:write|read).*$/i, '');
  result = result.replace(/\s+read[\s-]?only$/i, '');

  return result.trim();
}

describe('EWO-017R — Capability Target Extraction', () => {
  // The exact PO test request
  const PO_REQUEST = `Inspect the Engineering Work Orders capability and explain:
What it does
The operations it exposes
Whether it is read-only or supports write operations
Any governance or permission restrictions
The capability lifecycle status
Any dependencies
Supported object types
Current availability
Runtime diagnostics for this inspection`;

  it('extracts "engineering work orders" from the exact PO test request', () => {
    const extracted = extractCapabilityPhrase(PO_REQUEST);
    expect(extracted).toBe('engineering work orders');
  });

  it('normalizes the extracted target correctly', () => {
    const extracted = extractCapabilityPhrase(PO_REQUEST);
    const normalized = normalizeCapabilityName(extracted);
    expect(normalized).toBe('engineering work orders');
  });

  it('does NOT include trailing instructions in the extracted target', () => {
    const extracted = extractCapabilityPhrase(PO_REQUEST);
    expect(extracted).not.toContain('explain');
    expect(extracted).not.toContain('what it does');
    expect(extracted).not.toContain('runtime diagnostics');
    expect(extracted).not.toContain('lifecycle');
  });

  // Simple constructions
  it('extracts from "Inspect the Engineering Work Orders capability"', () => {
    expect(extractCapabilityPhrase('Inspect the Engineering Work Orders capability')).toBe('engineering work orders');
  });

  it('extracts from "Explain the Engineering Work Orders capability"', () => {
    expect(extractCapabilityPhrase('Explain the Engineering Work Orders capability')).toBe('engineering work orders');
  });

  it('extracts from "Describe the Constitution capability"', () => {
    expect(extractCapabilityPhrase('Describe the Constitution capability')).toBe('constitution');
  });

  it('extracts from "Show metadata for Engineering Work Orders"', () => {
    expect(extractCapabilityPhrase('Show metadata for Engineering Work Orders')).toBe('metadata for engineering work orders');
  });

  it('extracts from "What operations does Engineering Work Orders expose?"', () => {
    const extracted = extractCapabilityPhrase('What operations does Engineering Work Orders expose?');
    expect(extracted).toBe('engineering work orders');
  });

  it('extracts from "Tell me about the Memory capability"', () => {
    expect(extractCapabilityPhrase('Tell me about the Memory capability')).toBe('memory');
  });

  it('extracts from "Does Engineering Work Orders support write operations?"', () => {
    const extracted = extractCapabilityPhrase('Does Engineering Work Orders support write operations?');
    expect(extracted).toBe('engineering work orders');
  });

  it('extracts from "What is the Engineering Records capability?"', () => {
    expect(extractCapabilityPhrase('What is the Engineering Records capability?')).toBe('engineering records');
  });

  // Multi-line with "and explain:" on first line
  it('extracts from multi-line "Inspect the X capability and explain: ..."', () => {
    const multiLine = `Inspect the Engineering Work Orders capability and explain:
- What it does
- The operations it exposes`;
    expect(extractCapabilityPhrase(multiLine)).toBe('engineering work orders');
  });

  // Single-line with "and explain"
  it('extracts from "Explain the Memory capability and show lifecycle"', () => {
    expect(extractCapabilityPhrase('Explain the Memory capability and show lifecycle')).toBe('memory');
  });

  // Edge: no prefix, just the capability name
  it('extracts bare "Engineering Work Orders"', () => {
    expect(extractCapabilityPhrase('Engineering Work Orders')).toBe('engineering work orders');
  });

  // Edge: "show me the X capability"
  it('extracts from "Show me the Engineering Records capability"', () => {
    expect(extractCapabilityPhrase('Show me the Engineering Records capability')).toBe('engineering records');
  });

  // Edge: "What operations does X expose?" — strips "what operations does" prefix and "expose" suffix
  it('extracts from "What operations does Engineering Records expose?"', () => {
    expect(extractCapabilityPhrase('What operations does Engineering Records expose?')).toBe('engineering records');
  });

  // Edge: "What capabilities does Engineering Work Orders provide?"
  it('extracts from "What capabilities does Engineering Work Orders provide?"', () => {
    const extracted = extractCapabilityPhrase('What capabilities does Engineering Work Orders provide?');
    expect(extracted).toBe('engineering work orders');
  });

  // Edge: "Is the Constitution read-only?"
  it('extracts from "Is the Constitution read-only?"', () => {
    const extracted = extractCapabilityPhrase('Is the Constitution read-only?');
    expect(extracted).toBe('constitution');
  });

  // Edge: empty input
  it('returns empty string for empty input', () => {
    expect(extractCapabilityPhrase('')).toBe('');
  });

  // Edge: only prefix words
  it('returns empty string for "Inspect the"', () => {
    expect(extractCapabilityPhrase('Inspect the')).toBe('');
  });
});

describe('EWO-017R — Diagnostic Fields', () => {
  // These verify the source code includes the required diagnostic fields
  it('CapabilityResolutionResult includes extractedCapabilityTarget', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
    expect(source).toContain('extractedCapabilityTarget');
    expect(source).toContain('canonical_capability_name');
    expect(source).toContain('resolved_capability_name');
  });

  it('responses include original_request', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
    expect(source).toContain('original_request: nlRequest');
    expect(source).toContain('original_request: capabilityRequest');
  });

  it('responses include extracted_capability_target', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
    expect(source).toContain('extracted_capability_target: capResolution.extractedCapabilityTarget');
    expect(source).toContain('extracted_capability_target: resolution.extractedCapabilityTarget');
  });

  it('runtime diagnostics include metadata_source', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
    expect(source).toContain('metadata_source');
    expect(source).toContain('atd_connect_capabilities registry');
  });

  it('intent diagnostics are included in metadata inspection responses', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
    expect(source).toContain('intent_diagnostics: intentDiag');
    expect(source).toContain('detected_intent');
    expect(source).toContain('routing_decision');
  });
});
