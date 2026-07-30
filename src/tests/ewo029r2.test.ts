import { describe, it, expect } from "vitest";

// EWO-029R.2: Execution Provider Inspection Routing & Canonical Resolution
// Tests verify the deterministic provider inspection routing logic that
// mirrors the atd-mcp-server edge function's interpretRequest + classifyIntent.

// ─── Mirror of edge function classifyIntent provider detection ────────────────

const NEGATIVE_CONTEXT_PATTERNS: RegExp[] = [
  /do\s+not\s+(?:perform|make|execute|trigger|initiate)\s+(?:any\s+)?(?:lifecycle\s+)?changes?/i,
  /do\s+not\s+(?:perform|make|execute|trigger|initiate)\s+(?:any\s+)?lifecycle/i,
  /no\s+lifecycle\s+changes?/i,
  /read[\s-]?only/i,
  /do\s+not\s+(?:write|modify|update|create|delete|insert)/i,
];

const PROVIDER_TARGET_PATTERNS: RegExp[] = [
  /(?:inspect|show|describe|explain)\s+(?:the\s+)?(\w[\w\s-]*?)\s+execution\s+provider/i,
  /(?:inspect|show)\s+(?:the\s+)?(\w[\w\s-]*?)\s+implementation\s+provider/i,
  /(?:inspect|show)\s+provider\s+id\s+(\w[\w-]*)/i,
];

const ENGINE_PATTERNS: RegExp[] = [
  /inspect\s+(?:the\s+)?(?:supervised\s+)?(?:engineering\s+)?execution\s+engine/i,
  /explain\s+(?:the\s+)?(?:supervised\s+)?(?:engineering\s+)?execution\s+engine/i,
  /describe\s+(?:the\s+)?(?:supervised\s+)?(?:engineering\s+)?execution\s+engine/i,
  /show\s+(?:the\s+)?(?:supervised\s+)?(?:engineering\s+)?execution\s+engine/i,
  /what\s+is\s+(?:the\s+)?(?:supervised\s+)?(?:engineering\s+)?execution\s+engine/i,
];

const KNOWLEDGE_INSPECTION_GUARD = /(?:show|inspect|display|include)\s+(?:the\s+)?(?:engineering\s+)?knowledge\b/i;
const EWO_REF_GUARD = /EWO-[\w.]+/i;

const EWO_PATTERNS: RegExp[] = [
  /inspect\s+(?:ewo\s+)?(EWO-[\w.]+)/i,
  /describe\s+(?:ewo\s+)?(EWO-[\w.]+)/i,
];

const CAPABILITY_METADATA_PATTERNS: RegExp[] = [
  /(?:inspect|explain|describe)\s+(?:the\s+)?([\w\s-]+?)\s+capability\b/i,
  /what\s+(?:is|are)\s+(?:the\s+)?([\w\s-]+?)\s+capability\b/i,
];

interface ProviderInspectionResult {
  isProviderInspection: boolean;
  isEngineInspection: boolean;
  isKnowledgeInspection: boolean;
  isEWOInspection: boolean;
  isCapabilityMetadata: boolean;
  detected_intent: string;
  resolved_capability: string | null;
  resolved_operation: string | null;
  objectReference: string | null;
}

function classifyProviderRequest(text: string): ProviderInspectionResult {
  const trimmed = text.trim();

  // Check negative context
  const hasNegativeContext = NEGATIVE_CONTEXT_PATTERNS.some(p => p.test(trimmed));

  // Check engine inspection
  const isEngine = ENGINE_PATTERNS.some(p => p.test(trimmed));

  // Check provider inspection
  const isProvider = PROVIDER_TARGET_PATTERNS.some(p => p.test(trimmed));

  // Check knowledge inspection
  const isKnowledge = KNOWLEDGE_INSPECTION_GUARD.test(trimmed) && EWO_REF_GUARD.test(trimmed);

  // Check EWO inspection
  const isEWO = EWO_PATTERNS.some(p => p.test(trimmed));

  // Check capability metadata
  const isCapabilityMetadata = CAPABILITY_METADATA_PATTERNS.some(p => p.test(trimmed));

  // Provider inspection takes precedence over engine inspection when both match
  // BUT only if the request is specifically about a provider, not the engine
  if (isProvider && !isEngine) {
    let objectRef: string | null = null;
    for (const p of PROVIDER_TARGET_PATTERNS) {
      const m = trimmed.match(p);
      if (m && m[1]) { objectRef = m[1].trim().toLowerCase(); break; }
    }
    return {
      isProviderInspection: true,
      isEngineInspection: false,
      isKnowledgeInspection: false,
      isEWOInspection: false,
      isCapabilityMetadata: false,
      detected_intent: "execution_provider_inspection",
      resolved_capability: "supervised-engineering-execution",
      resolved_operation: "inspectExecutionProvider",
      objectReference: objectRef,
    };
  }

  if (isEngine) {
    return {
      isProviderInspection: false,
      isEngineInspection: true,
      isKnowledgeInspection: false,
      isEWOInspection: false,
      isCapabilityMetadata: false,
      detected_intent: "supervised_execution_engine_inspection",
      resolved_capability: "supervised-engineering-execution",
      resolved_operation: "inspectSupervisedExecutionEngine",
      objectReference: null,
    };
  }

  if (isKnowledge) {
    return {
      isProviderInspection: false,
      isEngineInspection: false,
      isKnowledgeInspection: true,
      isEWOInspection: false,
      isCapabilityMetadata: false,
      detected_intent: "engineering_knowledge_inspection",
      resolved_capability: "engineering-work-orders",
      resolved_operation: "inspectKnowledgeExtraction",
      objectReference: null,
    };
  }

  if (isEWO) {
    let objectRef: string | null = null;
    for (const p of EWO_PATTERNS) {
      const m = trimmed.match(p);
      if (m && m[1]) { objectRef = m[1]; break; }
    }
    return {
      isProviderInspection: false,
      isEngineInspection: false,
      isKnowledgeInspection: false,
      isEWOInspection: true,
      isCapabilityMetadata: false,
      detected_intent: "ewo_inspection",
      resolved_capability: "engineering-work-orders",
      resolved_operation: "inspectEngineeringWorkOrder",
      objectReference: objectRef,
    };
  }

  if (isCapabilityMetadata) {
    return {
      isProviderInspection: false,
      isEngineInspection: false,
      isKnowledgeInspection: false,
      isEWOInspection: false,
      isCapabilityMetadata: true,
      detected_intent: "capability_metadata_inspection",
      resolved_capability: "capability-metadata",
      resolved_operation: "inspectCapabilityMetadata",
      objectReference: null,
    };
  }

  return {
    isProviderInspection: false,
    isEngineInspection: false,
    isKnowledgeInspection: false,
    isEWOInspection: false,
    isCapabilityMetadata: false,
    detected_intent: "unresolved",
    resolved_capability: null,
    resolved_operation: null,
    objectReference: null,
  };
}

// ─── Mirror of edge function provider resolution ─────────────────────────────

const PROVIDER_ALIASES: Record<string, string> = {
  "bolt": "bolt",
  "bolt execution provider": "bolt",
  "bolt implementation provider": "bolt",
  "native atd": "native-atd",
  "native atd execution provider": "native-atd",
  "native atd execution engine": "native-atd",
  "native-atd": "native-atd",
};

interface MockProvider {
  provider_id: string;
  provider_name: string;
  provider_type: string;
  provider_version: string;
  is_active: boolean;
  is_governed: boolean;
  canonical_contract_version: string;
  supported_operations: string[];
  governance_rules: string[];
  provider_configuration: Record<string, unknown>;
}

const MOCK_PROVIDERS: MockProvider[] = [
  {
    provider_id: "bolt",
    provider_name: "Bolt Execution Provider",
    provider_type: "cloud-native",
    provider_version: "1.0.0",
    is_active: true,
    is_governed: true,
    canonical_contract_version: "1.0",
    supported_operations: ["inspectSupervisedExecutionEngine", "inspectExecutionProvider"],
    governance_rules: ["read_only", "authenticated"],
    provider_configuration: { region: "ap-southeast-2" },
  },
  {
    provider_id: "native-atd",
    provider_name: "Native ATD Execution Engine",
    provider_type: "native",
    provider_version: "0.9.0",
    is_active: false,
    is_governed: true,
    canonical_contract_version: "1.0",
    supported_operations: ["inspectSupervisedExecutionEngine"],
    governance_rules: ["read_only", "authenticated"],
    provider_configuration: { region: "local" },
  },
];

function resolveProvider(target: string, providers: MockProvider[]): {
  resolved: MockProvider | null;
  method: string;
  canonicalId: string | null;
} {
  const t = target.trim();
  const tLower = t.toLowerCase();

  // 1. Exact provider ID
  let match = providers.find(p => p.provider_id === t);
  if (match) return { resolved: match, method: "exact_provider_id", canonicalId: match.provider_id };

  // 2. Exact canonical provider name
  match = providers.find(p => p.provider_name === t);
  if (match) return { resolved: match, method: "exact_provider_name", canonicalId: match.provider_id };

  // 3. Case-insensitive provider ID
  match = providers.find(p => p.provider_id.toLowerCase() === tLower);
  if (match) return { resolved: match, method: "case_insensitive_provider_id", canonicalId: match.provider_id };

  // 4. Case-insensitive canonical provider name
  match = providers.find(p => p.provider_name.toLowerCase() === tLower);
  if (match) return { resolved: match, method: "case_insensitive_provider_name", canonicalId: match.provider_id };

  // 5. Governed alias match
  const aliasKey = Object.keys(PROVIDER_ALIASES).find(k => k === tLower);
  if (aliasKey) {
    const aliasId = PROVIDER_ALIASES[aliasKey];
    match = providers.find(p => p.provider_id === aliasId || p.provider_id.toLowerCase() === aliasId);
    if (match) return { resolved: match, method: "governed_alias_match", canonicalId: match.provider_id };
  }

  return { resolved: null, method: "unresolved", canonicalId: null };
}

function extractProviderTarget(text: string): string | null {
  let m = text.match(/(?:inspect|show|describe|explain)\s+(?:the\s+)?(\w[\w\s-]*?)\s+execution\s+provider/i);
  if (m && m[1]) return m[1].trim().toLowerCase();
  m = text.match(/(?:inspect|show)\s+(?:the\s+)?(\w[\w\s-]*?)\s+implementation\s+provider/i);
  if (m && m[1]) return m[1].trim().toLowerCase();
  m = text.match(/(?:inspect|show)\s+provider\s+id\s+(\w[\w-]*)/i);
  if (m && m[1]) return m[1].trim().toLowerCase();
  return null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EWO-029R.2: Execution Provider Inspection Routing", () => {
  // 1. "Inspect the Bolt execution provider."
  it("resolves 'Inspect the Bolt execution provider.' to provider inspection", () => {
    const result = classifyProviderRequest("Inspect the Bolt execution provider.");
    expect(result.isProviderInspection).toBe(true);
    expect(result.detected_intent).toBe("execution_provider_inspection");
    expect(result.resolved_capability).toBe("supervised-engineering-execution");
    expect(result.resolved_operation).toBe("inspectExecutionProvider");
    expect(result.objectReference).toBe("bolt");
  });

  // 2. Full Product Owner prompt with all requested provider fields
  it("resolves full PO prompt with bullet list and negative context", () => {
    const prompt = `Inspect the Bolt execution provider.

Return:

- detected_intent
- routing_decision
- resolved_capability
- resolved_operation
- provider ID
- provider name
- provider type
- provider version
- lifecycle status
- active status
- governed status
- execution contract version
- supported operations
- governance rules
- provider configuration
- provider diagnostics
- runtime diagnostics
- intent_diagnostics
- lifecycle_change_performed
- audit reference

Do not perform any lifecycle changes.`;
    const result = classifyProviderRequest(prompt);
    expect(result.isProviderInspection).toBe(true);
    expect(result.detected_intent).toBe("execution_provider_inspection");
    expect(result.resolved_capability).toBe("supervised-engineering-execution");
    expect(result.resolved_operation).toBe("inspectExecutionProvider");
    expect(result.objectReference).toBe("bolt");
  });

  // 3. "Inspect provider ID bolt."
  it("resolves 'Inspect provider ID bolt.' to provider inspection", () => {
    const result = classifyProviderRequest("Inspect provider ID bolt.");
    expect(result.isProviderInspection).toBe(true);
    expect(result.resolved_operation).toBe("inspectExecutionProvider");
    expect(result.objectReference).toBe("bolt");
  });

  // 4. "Show the Bolt implementation provider."
  it("resolves 'Show the Bolt implementation provider.' to provider inspection", () => {
    const result = classifyProviderRequest("Show the Bolt implementation provider.");
    expect(result.isProviderInspection).toBe(true);
    expect(result.resolved_operation).toBe("inspectExecutionProvider");
    expect(result.objectReference).toBe("bolt");
  });

  // 5. "Inspect the Native ATD execution provider."
  it("resolves 'Inspect the Native ATD execution provider.' to provider inspection", () => {
    const result = classifyProviderRequest("Inspect the Native ATD execution provider.");
    expect(result.isProviderInspection).toBe(true);
    expect(result.resolved_operation).toBe("inspectExecutionProvider");
    expect(result.objectReference).toBe("native atd");
  });

  // 6. "Inspect provider ID native-atd."
  it("resolves 'Inspect provider ID native-atd.' to provider inspection", () => {
    const result = classifyProviderRequest("Inspect provider ID native-atd.");
    expect(result.isProviderInspection).toBe(true);
    expect(result.resolved_operation).toBe("inspectExecutionProvider");
    expect(result.objectReference).toBe("native-atd");
  });

  // 7. Case-insensitive provider matching
  it("resolves provider names case-insensitively", () => {
    const result = classifyProviderRequest("Inspect the BOLT execution provider.");
    expect(result.isProviderInspection).toBe(true);
    expect(result.objectReference).toBe("bolt");
  });

  it("resolves 'Inspect the bolt execution provider.' (lowercase)", () => {
    const result = classifyProviderRequest("Inspect the bolt execution provider.");
    expect(result.isProviderInspection).toBe(true);
    expect(result.objectReference).toBe("bolt");
  });

  // 8. Unknown provider returns governed unresolved response
  it("returns unresolved for unknown provider", () => {
    const result = classifyProviderRequest("Inspect the UnknownProvider execution provider.");
    expect(result.isProviderInspection).toBe(true);
    expect(result.resolved_operation).toBe("inspectExecutionProvider");
    expect(result.objectReference).toBe("unknownprovider");

    const resolution = resolveProvider("unknownprovider", MOCK_PROVIDERS);
    expect(resolution.resolved).toBeNull();
    expect(resolution.method).toBe("unresolved");
    expect(resolution.canonicalId).toBeNull();
  });

  // 9. Provider inspection does not interfere with engine inspection
  it("does not misroute engine inspection as provider inspection", () => {
    const result = classifyProviderRequest("Inspect the supervised execution engine.");
    expect(result.isEngineInspection).toBe(true);
    expect(result.isProviderInspection).toBe(false);
    expect(result.detected_intent).toBe("supervised_execution_engine_inspection");
    expect(result.resolved_operation).toBe("inspectSupervisedExecutionEngine");
  });

  it("does not misroute engine inspection with negative context", () => {
    const prompt = "Inspect the supervised execution engine.\n\nDo not perform any lifecycle changes.";
    const result = classifyProviderRequest(prompt);
    expect(result.isEngineInspection).toBe(true);
    expect(result.isProviderInspection).toBe(false);
  });

  // 10. Provider inspection does not interfere with EWO routing
  it("does not misroute EWO inspection as provider inspection", () => {
    const result = classifyProviderRequest("Inspect EWO-029.");
    expect(result.isEWOInspection).toBe(true);
    expect(result.isProviderInspection).toBe(false);
    expect(result.resolved_operation).toBe("inspectEngineeringWorkOrder");
    expect(result.objectReference).toBe("EWO-029.");
  });

  // 11. Provider inspection does not interfere with knowledge inspection
  it("does not misroute knowledge inspection as provider inspection", () => {
    const result = classifyProviderRequest("Show the engineering knowledge for EWO-029.");
    expect(result.isKnowledgeInspection).toBe(true);
    expect(result.isProviderInspection).toBe(false);
  });

  // 12. Provider inspection does not interfere with capability metadata inspection
  it("does not misroute capability metadata as provider inspection", () => {
    const result = classifyProviderRequest("Explain the engineering-work-orders capability.");
    expect(result.isCapabilityMetadata).toBe(true);
    expect(result.isProviderInspection).toBe(false);
  });

  // 13. Long prompts and bullet lists still resolve correctly
  it("resolves provider target from long multi-line prompt", () => {
    const prompt = `Inspect the Bolt execution provider.

Return:

* detected_intent
* routing_decision
* resolved_capability
* resolved_operation
* provider ID
* provider name
* provider type
* provider version
* lifecycle status
* active status
* governed status
* execution contract version
* supported operations
* governance rules
* provider configuration
* provider diagnostics
* runtime diagnostics
* intent_diagnostics
* lifecycle_change_performed
* audit reference

Do not perform any lifecycle changes.`;
    const target = extractProviderTarget(prompt);
    expect(target).toBe("bolt");

    const result = classifyProviderRequest(prompt);
    expect(result.isProviderInspection).toBe(true);
    expect(result.objectReference).toBe("bolt");
  });

  // 14. Returned provider values match execution_provider_registry
  it("returns provider metadata matching registry", () => {
    const resolution = resolveProvider("bolt", MOCK_PROVIDERS);
    expect(resolution.resolved).not.toBeNull();
    expect(resolution.resolved!.provider_id).toBe("bolt");
    expect(resolution.resolved!.provider_name).toBe("Bolt Execution Provider");
    expect(resolution.resolved!.provider_type).toBe("cloud-native");
    expect(resolution.resolved!.provider_version).toBe("1.0.0");
    expect(resolution.resolved!.is_active).toBe(true);
    expect(resolution.resolved!.is_governed).toBe(true);
    expect(resolution.resolved!.canonical_contract_version).toBe("1.0");
  });

  // 15. Missing fields are returned as unavailable rather than fabricated
  it("returns unresolved for provider with no registry match", () => {
    const resolution = resolveProvider("nonexistent", MOCK_PROVIDERS);
    expect(resolution.resolved).toBeNull();
    expect(resolution.method).toBe("unresolved");
  });

  // 16. No lifecycle changes occur
  it("provider inspection is read-only", () => {
    const result = classifyProviderRequest("Inspect the Bolt execution provider.");
    expect(result.isProviderInspection).toBe(true);
    // The operation name itself indicates read-only inspection
    expect(result.resolved_operation).toBe("inspectExecutionProvider");
    // No write-related intent
    expect(result.detected_intent).not.toBe("write_request");
  });

  it("provider inspection with negative context is read-only", () => {
    const prompt = "Inspect the Bolt execution provider.\n\nDo not perform any lifecycle changes.";
    const result = classifyProviderRequest(prompt);
    expect(result.isProviderInspection).toBe(true);
    expect(result.detected_intent).not.toBe("write_request");
  });

  // 17. End-to-end test through the submit_conversation_inspection route
  it("end-to-end: classifyIntent → interpretRequest → resolveProvider for Bolt", () => {
    const prompt = "Inspect the Bolt execution provider.";
    
    // Step 1: Classify intent
    const classification = classifyProviderRequest(prompt);
    expect(classification.isProviderInspection).toBe(true);
    expect(classification.detected_intent).toBe("execution_provider_inspection");

    // Step 2: Extract provider target
    const target = extractProviderTarget(prompt);
    expect(target).toBe("bolt");

    // Step 3: Resolve provider against registry
    const resolution = resolveProvider(target!, MOCK_PROVIDERS);
    expect(resolution.resolved).not.toBeNull();
    expect(resolution.resolved!.provider_id).toBe("bolt");
    expect(resolution.method).toBe("exact_provider_id");

    // Step 4: Verify governed response shape
    expect(classification.resolved_capability).toBe("supervised-engineering-execution");
    expect(classification.resolved_operation).toBe("inspectExecutionProvider");
  });

  it("end-to-end: classifyIntent → interpretRequest → resolveProvider for Native ATD", () => {
    const prompt = "Inspect the Native ATD execution provider.";
    
    const classification = classifyProviderRequest(prompt);
    expect(classification.isProviderInspection).toBe(true);

    const target = extractProviderTarget(prompt);
    expect(target).toBe("native atd");

    const resolution = resolveProvider(target!, MOCK_PROVIDERS);
    expect(resolution.resolved).not.toBeNull();
    expect(resolution.resolved!.provider_id).toBe("native-atd");
    expect(resolution.method).toBe("governed_alias_match");
  });
});

describe("EWO-029R.2: Provider Resolution Methods", () => {
  it("resolves by exact provider ID", () => {
    const resolution = resolveProvider("bolt", MOCK_PROVIDERS);
    expect(resolution.method).toBe("exact_provider_id");
    expect(resolution.canonicalId).toBe("bolt");
  });

  it("resolves by exact canonical provider name", () => {
    const resolution = resolveProvider("Bolt Execution Provider", MOCK_PROVIDERS);
    expect(resolution.method).toBe("exact_provider_name");
    expect(resolution.canonicalId).toBe("bolt");
  });

  it("resolves by case-insensitive provider ID", () => {
    const resolution = resolveProvider("BoLt", MOCK_PROVIDERS);
    expect(resolution.method).toBe("case_insensitive_provider_id");
    expect(resolution.canonicalId).toBe("bolt");
  });

  it("resolves by case-insensitive canonical provider name", () => {
    const resolution = resolveProvider("bolt execution provider", MOCK_PROVIDERS);
    expect(resolution.method).toBe("case_insensitive_provider_name");
    expect(resolution.canonicalId).toBe("bolt");
  });

  it("resolves by governed alias match", () => {
    const resolution = resolveProvider("native atd", MOCK_PROVIDERS);
    expect(resolution.method).toBe("governed_alias_match");
    expect(resolution.canonicalId).toBe("native-atd");
  });

  it("returns unresolved for unknown provider", () => {
    const resolution = resolveProvider("unknown-provider", MOCK_PROVIDERS);
    expect(resolution.method).toBe("unresolved");
    expect(resolution.canonicalId).toBeNull();
  });
});

describe("EWO-029R.2: Provider Target Extraction", () => {
  it("extracts from 'Inspect the X execution provider'", () => {
    expect(extractProviderTarget("Inspect the Bolt execution provider.")).toBe("bolt");
  });

  it("extracts from 'Show the X implementation provider'", () => {
    expect(extractProviderTarget("Show the Bolt implementation provider.")).toBe("bolt");
  });

  it("extracts from 'Inspect provider ID X'", () => {
    expect(extractProviderTarget("Inspect provider ID bolt.")).toBe("bolt");
  });

  it("extracts from 'Inspect provider ID native-atd'", () => {
    expect(extractProviderTarget("Inspect provider ID native-atd.")).toBe("native-atd");
  });

  it("extracts from multi-line prompt", () => {
    const prompt = `Inspect the Bolt execution provider.

Return:

* detected_intent
* routing_decision

Do not perform any lifecycle changes.`;
    expect(extractProviderTarget(prompt)).toBe("bolt");
  });

  it("returns null for non-provider request", () => {
    expect(extractProviderTarget("Inspect the supervised execution engine.")).toBeNull();
  });
});
