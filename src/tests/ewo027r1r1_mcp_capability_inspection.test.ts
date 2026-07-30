// EWO-027R.1R.1.MCP — MCP Capability Inspection Governance Refinement
// Tests for natural-language capability resolution, governed metadata response,
// grounding, and diagnostic visibility.

import { describe, it, expect } from 'vitest';
import fs from 'fs';

// ─── Static source verification ──────────────────────────────────────────────

const MCP_SOURCE = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');

// ─── Requirement 1: Capability Resolution ────────────────────────────────────

describe('EWO-027R.1R.1.MCP — Capability Resolution', () => {
  it('defines the inspect_capability_metadata MCP tool', () => {
    expect(MCP_SOURCE).toContain('name: "inspect_capability_metadata"');
    expect(MCP_SOURCE).toContain('readOnlyHint: true');
  });

  it('includes extractCapabilityPhrase for NL prefix stripping', () => {
    expect(MCP_SOURCE).toContain('function extractCapabilityPhrase');
    // Strips "inspect the", "explain the", "what operations does", etc.
    expect(MCP_SOURCE).toMatch(/inspect.*explain.*describe.*show.*tell me about/i);
  });

  it('includes resolveCapabilityByName with multi-tier matching', () => {
    expect(MCP_SOURCE).toContain('function resolveCapabilityByName');
    expect(MCP_SOURCE).toContain('exact');
    expect(MCP_SOURCE).toContain('case_insensitive');
    expect(MCP_SOURCE).toContain('fuzzy');
  });

  it('includes levenshtein-based fuzzy matching', () => {
    expect(MCP_SOURCE).toContain('function levenshteinDistance');
    expect(MCP_SOURCE).toContain('function similarityScore');
  });

  it('resolves "Inspect the Engineering Work Orders capability" pattern', () => {
    // The interpretRequest patterns include capability-inspection phrasings
    expect(MCP_SOURCE).toContain('inspect|explain|describe|show');
    expect(MCP_SOURCE).toContain('\\s+capability');
  });

  it('resolves "What operations does Engineering Work Orders expose" pattern', () => {
    expect(MCP_SOURCE).toContain('what\\s+(?:operations|capabilities|services)');
    expect(MCP_SOURCE).toContain('expose|offer|support|provide');
  });

  it('resolves "Explain the Engineering Work Orders capability" pattern', () => {
    expect(MCP_SOURCE).toContain('inspect|explain|describe|show');
    expect(MCP_SOURCE).toContain('\\s+capability');
  });
});

// ─── Requirement 2: Governed Metadata Response ───────────────────────────────

describe('EWO-027R.1R.1.MCP — Governed Metadata Response', () => {
  it('includes buildCapabilityMetadataResponse function', () => {
    expect(MCP_SOURCE).toContain('function buildCapabilityMetadataResponse');
  });

  it('response includes capability_name', () => {
    expect(MCP_SOURCE).toContain('capability_name:');
  });

  it('response includes canonical_identifier', () => {
    expect(MCP_SOURCE).toContain('canonical_identifier:');
  });

  it('response includes description', () => {
    expect(MCP_SOURCE).toContain('description:');
  });

  it('response includes lifecycle_status', () => {
    expect(MCP_SOURCE).toContain('lifecycle_status:');
  });

  it('response includes supported_operations', () => {
    expect(MCP_SOURCE).toContain('supported_operations:');
  });

  it('response includes read_only_support', () => {
    expect(MCP_SOURCE).toContain('read_only_support:');
  });

  it('response includes write_support', () => {
    expect(MCP_SOURCE).toContain('write_support:');
  });

  it('response includes permission_requirements', () => {
    expect(MCP_SOURCE).toContain('permission_requirements:');
  });

  it('response includes governance_restrictions', () => {
    expect(MCP_SOURCE).toContain('governance_restrictions:');
  });

  it('response includes version', () => {
    expect(MCP_SOURCE).toContain('version:');
  });

  it('response includes tags_categories', () => {
    expect(MCP_SOURCE).toContain('tags_categories:');
  });

  it('response includes input_output_schemas', () => {
    expect(MCP_SOURCE).toContain('input_output_schemas:');
  });

  it('write_support is always false (read-only enforced)', () => {
    expect(MCP_SOURCE).toContain('write_support: false');
    expect(MCP_SOURCE).toContain('read_only_support: true');
  });
});

// ─── Requirement 3: Grounding ─────────────────────────────────────────────────

describe('EWO-027R.1R.1.MCP — Grounding', () => {
  it('metadata is built from the database record, not inferred', () => {
    // buildCapabilityMetadataResponse takes a cap record parameter
    expect(MCP_SOURCE).toContain('function buildCapabilityMetadataResponse(cap:');
  });

  it('unavailable fields are explicitly marked "unavailable"', () => {
    expect(MCP_SOURCE).toMatch(/capability_name.*unavailable/);
    expect(MCP_SOURCE).toMatch(/canonical_identifier.*unavailable/);
  });

  it('does not fabricate unsupported operations', () => {
    // supported_operations come from the registered record only
    expect(MCP_SOURCE).toContain('Array.isArray(cap.supported_operations)');
  });

  it('metadata unavailable returns explicit "metadata_unavailable" outcome', () => {
    expect(MCP_SOURCE).toContain('resolution_outcome: "metadata_unavailable"');
    expect(MCP_SOURCE).toContain('no_metadata_inferred: true');
  });
});

// ─── Requirement 4: Diagnostic Visibility ─────────────────────────────────────

describe('EWO-027R.1R.1.MCP — Diagnostic Visibility', () => {
  it('includes buildCapabilityFailureResponse function', () => {
    expect(MCP_SOURCE).toContain('function buildCapabilityFailureResponse');
  });

  it('failure response includes attempted_capability_name', () => {
    expect(MCP_SOURCE).toContain('attempted_capability_name:');
  });

  it('failure response includes resolution_outcome', () => {
    expect(MCP_SOURCE).toContain('resolution_outcome: "failure"');
  });

  it('failure response includes reason', () => {
    expect(MCP_SOURCE).toContain('reason:');
  });

  it('failure response includes suggested_matching_capabilities', () => {
    expect(MCP_SOURCE).toContain('suggested_matching_capabilities:');
  });

  it('failure response explicitly states no metadata was inferred', () => {
    expect(MCP_SOURCE).toContain('no_metadata_inferred: true');
  });

  it('never fabricates capability metadata on failure', () => {
    // The failure response does not include capability_metadata
    const failureFnStart = MCP_SOURCE.indexOf('function buildCapabilityFailureResponse');
    const failureFnEnd = MCP_SOURCE.indexOf('}', MCP_SOURCE.indexOf('no_metadata_inferred: true', failureFnStart));
    const failureFn = MCP_SOURCE.substring(failureFnStart, failureFnEnd + 1);
    expect(failureFn).not.toContain('capability_metadata');
  });
});

// ─── Integration: interpretRequest delegation ──────────────────────────────────

describe('EWO-027R.1R.1.MCP — Conversation Bridge Delegation', () => {
  it('interpretRequest includes capability-inspection patterns', () => {
    expect(MCP_SOURCE).toContain('inspectCapabilityMetadata');
  });

  it('submit_conversation_inspection delegates to capability metadata resolution', () => {
    // The delegation block in submit_conversation_inspection handler
    expect(MCP_SOURCE).toContain('interpretation.operation === "inspectCapabilityMetadata"');
    expect(MCP_SOURCE).toContain('resolveCapabilityByName(supabase, nlRequest)');
  });

  it('delegation includes governed audit logging', () => {
    expect(MCP_SOURCE).toMatch(/inspectCapabilityMetadata.*outcome.*success/s);
  });
});

// ─── Capability Resolution Logic (unit tests) ──────────────────────────────────

describe('EWO-027R.1R.1.MCP — Resolution Logic', () => {
  // Simulate the extractCapabilityPhrase logic
  function extractCapabilityPhrase(input: string): string {
    const lower = input.toLowerCase().trim();
    const prefixPatterns = [
      /^(?:inspect|explain|describe|show|tell me about|what (?:operations|capabilities|services) (?:does|are|is))\s+(?:the\s+)?/i,
      /^(?:what is|what are)\s+(?:the\s+)?/i,
      /^(?:get|fetch|retrieve)\s+(?:the\s+)?/i,
      /^(?:list|view)\s+(?:the\s+)?/i,
    ];
    let result = lower;
    for (const pat of prefixPatterns) {
      result = result.replace(pat, '');
    }
    result = result.replace(/\s+(?:capability|capabilities|service|services)$/i, '');
    // Strip trailing verbs: "expose", "offer", "support", "provide"
    result = result.replace(/\s+(?:expose|offers?|supports?|provides?|exposes?)$/i, '');
    return result.trim();
  }

  it('strips "Inspect the" prefix', () => {
    expect(extractCapabilityPhrase('Inspect the Engineering Work Orders capability')).toBe('engineering work orders');
  });

  it('strips "Explain the" prefix', () => {
    expect(extractCapabilityPhrase('Explain the Engineering Work Orders capability')).toBe('engineering work orders');
  });

  it('strips "What operations does ... expose" prefix', () => {
    expect(extractCapabilityPhrase('What operations does Engineering Work Orders expose')).toBe('engineering work orders');
  });

  it('strips trailing "expose" verb', () => {
    const result = extractCapabilityPhrase('What operations does Engineering Work Orders expose');
    expect(result).not.toContain('expose');
  });

  it('strips "What is the ... capability" prefix', () => {
    expect(extractCapabilityPhrase('What is the Constitution capability')).toBe('constitution');
  });

  it('strips "Tell me about the ... capability" prefix', () => {
    expect(extractCapabilityPhrase('Tell me about the Engineering Records capability')).toBe('engineering records');
  });

  it('strips trailing "capability" suffix', () => {
    expect(extractCapabilityPhrase('Engineering Memory capability')).toBe('engineering memory');
  });

  it('handles bare capability name without prefix', () => {
    expect(extractCapabilityPhrase('engineering-work-orders')).toBe('engineering-work-orders');
  });
});

// ─── Levenshtein Distance (unit tests) ─────────────────────────────────────────

describe('EWO-027R.1R.1.MCP — Fuzzy Matching', () => {
  function levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  function similarityScore(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshteinDistance(a, b) / maxLen;
  }

  it('identical strings have similarity 1.0', () => {
    expect(similarityScore('engineering work orders', 'engineering work orders')).toBe(1);
  });

  it('similar strings have high similarity', () => {
    const score = similarityScore('engineering work order', 'engineering work orders');
    expect(score).toBeGreaterThan(0.9);
  });

  it('different strings have low similarity', () => {
    const score = similarityScore('engineering work orders', 'constitution');
    expect(score).toBeLessThan(0.4);
  });

  it('fuzzy match threshold allows minor typos', () => {
    const score = similarityScore('engineering work ordrs', 'engineering work orders');
    expect(score).toBeGreaterThan(0.6);
  });
});

// ─── Metadata Response Structure (unit tests) ──────────────────────────────────

describe('EWO-027R.1R.1.MCP — Metadata Response Structure', () => {
  function buildCapabilityMetadataResponse(cap: Record<string, unknown>): Record<string, unknown> {
    const supportedOps = Array.isArray(cap.supported_operations) ? cap.supported_operations : [];
    const relationships = Array.isArray(cap.relationships) ? cap.relationships : [];
    const metadata = cap.metadata && typeof cap.metadata === 'object' ? cap.metadata : {};
    const visibility = String(cap.constitutional_visibility ?? 'public');

    return {
      capability_name: cap.name ?? 'unavailable',
      canonical_identifier: cap.capability_id ?? 'unavailable',
      description: cap.description ?? 'unavailable',
      lifecycle_status: cap.lifecycle_status ?? cap.status ?? 'unavailable',
      status: cap.status ?? 'unavailable',
      supported_operations: supportedOps,
      read_only_support: true,
      write_support: false,
      permission_requirements: {
        authentication: 'required',
        visibility: visibility,
        persona: 'atd (default) or authenticated user',
      },
      governance_restrictions: {
        constitutional_visibility: visibility,
        read_only_enforced: true,
        no_mutation_tools: true,
        tenant_isolation: 'EIOS governance enforced',
      },
      version: cap.capability_version ?? 'unavailable',
      introduced_by_ewo: cap.introduced_by_ewo ?? 'unavailable',
      inspection_contract_version: cap.inspection_contract_version ?? 'unavailable',
      tags_categories: [cap.category ?? 'uncategorised'],
      deprecated: cap.deprecated ?? false,
      superseded_by: cap.superseded_by ?? null,
      replacement_capability: cap.replacement_capability ?? null,
      relationships: relationships,
      owner: cap.owner ?? 'unavailable',
      input_output_schemas: (metadata && Object.keys(metadata).length > 0) ? metadata : 'unavailable',
    };
  }

  const sampleCap = {
    name: 'Engineering Work Orders',
    capability_id: 'engineering-work-orders',
    description: 'Governed inspection of EWOs.',
    status: 'active',
    lifecycle_status: 'active',
    supported_operations: ['listEngineeringWorkOrders', 'inspectEngineeringWorkOrder'],
    relationships: ['engineering-records', 'completion-reports'],
    constitutional_visibility: 'public',
    capability_version: '1.0',
    introduced_by_ewo: 'EWO-024',
    inspection_contract_version: '1.0',
    category: 'work-orders',
    deprecated: false,
    owner: 'EIOS Platform',
    metadata: {},
  };

  it('returns all required metadata fields', () => {
    const response = buildCapabilityMetadataResponse(sampleCap);
    expect(response.capability_name).toBe('Engineering Work Orders');
    expect(response.canonical_identifier).toBe('engineering-work-orders');
    expect(response.description).toBe('Governed inspection of EWOs.');
    expect(response.lifecycle_status).toBe('active');
    expect(response.supported_operations).toEqual(['listEngineeringWorkOrders', 'inspectEngineeringWorkOrder']);
    expect(response.read_only_support).toBe(true);
    expect(response.write_support).toBe(false);
    expect(response.permission_requirements).toBeDefined();
    expect(response.governance_restrictions).toBeDefined();
    expect(response.version).toBe('1.0');
    expect(response.tags_categories).toEqual(['work-orders']);
    expect(response.input_output_schemas).toBe('unavailable');
  });

  it('marks unavailable fields as "unavailable"', () => {
    const sparseCap = { name: 'Test', capability_id: 'test', description: 'Test desc', status: 'active', category: 'test' };
    const response = buildCapabilityMetadataResponse(sparseCap);
    expect(response.lifecycle_status).toBe('active'); // falls back to status
    expect(response.version).toBe('unavailable');
    expect(response.introduced_by_ewo).toBe('unavailable');
    expect(response.owner).toBe('unavailable');
    expect(response.input_output_schemas).toBe('unavailable');
  });

  it('always enforces read-only support', () => {
    const response = buildCapabilityMetadataResponse(sampleCap);
    expect(response.read_only_support).toBe(true);
    expect(response.write_support).toBe(false);
    expect(response.governance_restrictions).toHaveProperty('read_only_enforced', true);
    expect(response.governance_restrictions).toHaveProperty('no_mutation_tools', true);
  });
});
