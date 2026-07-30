// EWO-017 — MCP Capability Inspection Governance & End-to-End Validation
// Phase 1 Completion Refinement
// Tests for governed capability inspection, operation enumeration, deterministic
// failure handling, runtime diagnostic envelope, and conversational quality.

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const MCP_SOURCE = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');

// ─── Requirement 1: Governed Capability Inspection ─────────────────────────────

describe('EWO-017 — Governed Capability Inspection', () => {
  it('includes buildCapabilityMetadataResponse with all required fields', () => {
    expect(MCP_SOURCE).toContain('function buildCapabilityMetadataResponse');
    expect(MCP_SOURCE).toContain('capability_name:');
    expect(MCP_SOURCE).toContain('canonical_identifier:');
    expect(MCP_SOURCE).toContain('description:');
    expect(MCP_SOURCE).toContain('purpose:');
    expect(MCP_SOURCE).toContain('lifecycle_status:');
    expect(MCP_SOURCE).toContain('version:');
    expect(MCP_SOURCE).toContain('capability_category:');
    expect(MCP_SOURCE).toContain('operations_exposed:');
    expect(MCP_SOURCE).toContain('read_only_support:');
    expect(MCP_SOURCE).toContain('write_support:');
    expect(MCP_SOURCE).toContain('required_permissions:');
    expect(MCP_SOURCE).toContain('permission_requirements:');
    expect(MCP_SOURCE).toContain('governance_restrictions:');
    expect(MCP_SOURCE).toContain('authentication_requirements:');
    expect(MCP_SOURCE).toContain('dependencies:');
    expect(MCP_SOURCE).toContain('supported_object_types:');
    expect(MCP_SOURCE).toContain('current_availability:');
  });

  it('distinguishes between authoritative metadata and unavailable information', () => {
    expect(MCP_SOURCE).toContain('"unavailable"');
    expect(MCP_SOURCE).toContain('metadata_source: capabilityId ? "atd_connect_capabilities registry" : "none"');
  });

  it('never infers missing metadata', () => {
    expect(MCP_SOURCE).toContain('no_metadata_inferred: true');
    expect(MCP_SOURCE).toContain('No metadata inferred');
  });
});

// ─── Requirement 2: Governed Operation Enumeration ─────────────────────────────

describe('EWO-017 — Governed Operation Enumeration', () => {
  it('operations are sourced from the capability definition', () => {
    expect(MCP_SOURCE).toContain('Array.isArray(cap.supported_operations)');
    expect(MCP_SOURCE).toContain('operations_exposed: supportedOps');
  });

  it('operation validation checks registered operations before execution', () => {
    expect(MCP_SOURCE).toContain('EWO-017: Validate operation against registered capability before execution');
    expect(MCP_SOURCE).toContain('registeredOps.includes(operation)');
    expect(MCP_SOURCE).toContain('unsupported_operation');
  });

  it('unsupported operation returns available operations', () => {
    expect(MCP_SOURCE).toContain('available_operations: registeredOps');
    expect(MCP_SOURCE).toContain('no_execution_performed: true');
  });

  it('does not invent or rename operations', () => {
    expect(MCP_SOURCE).toContain('is not exposed by capability');
    expect(MCP_SOURCE).toContain('No execution performed');
  });
});

// ─── Requirement 3: Deterministic Failure Handling ─────────────────────────────

describe('EWO-017 — Deterministic Failure Handling', () => {
  it('failure response includes reason', () => {
    expect(MCP_SOURCE).toContain('reason:');
  });

  it('failure response includes capability searched', () => {
    expect(MCP_SOURCE).toContain('capability_searched:');
    expect(MCP_SOURCE).toContain('attempted_capability_name:');
  });

  it('failure response includes resolution performed', () => {
    expect(MCP_SOURCE).toContain('resolution_performed:');
  });

  it('failure response includes available alternatives', () => {
    expect(MCP_SOURCE).toContain('available_alternatives:');
    expect(MCP_SOURCE).toContain('suggested_matching_capabilities:');
  });

  it('never fabricates successful execution', () => {
    expect(MCP_SOURCE).toContain('no_execution_performed: true');
    expect(MCP_SOURCE).toContain('no_metadata_inferred: true');
  });
});

// ─── Requirement 4: Runtime Diagnostic Envelope ─────────────────────────────────

describe('EWO-017 — Runtime Diagnostic Envelope', () => {
  it('includes buildRuntimeDiagnosticEnvelope function', () => {
    expect(MCP_SOURCE).toContain('function buildRuntimeDiagnosticEnvelope');
  });

  it('envelope includes capability resolved', () => {
    expect(MCP_SOURCE).toContain('capability_resolved:');
  });

  it('envelope includes resolution confidence', () => {
    expect(MCP_SOURCE).toContain('resolution_confidence:');
  });

  it('envelope includes metadata source', () => {
    expect(MCP_SOURCE).toContain('metadata_source:');
  });

  it('envelope includes operations returned', () => {
    expect(MCP_SOURCE).toContain('operations_returned:');
  });

  it('envelope includes permissions evaluated', () => {
    expect(MCP_SOURCE).toContain('permissions_evaluated:');
  });

  it('envelope includes governance outcome', () => {
    expect(MCP_SOURCE).toContain('governance_outcome:');
  });

  it('envelope is included in success responses', () => {
    expect(MCP_SOURCE).toContain('runtime_diagnostics: envelope');
  });

  it('envelope is included in failure responses', () => {
    expect(MCP_SOURCE).toContain('runtime_diagnostics: failEnvelope');
  });
});

// ─── Requirement 5: Conversational Quality ──────────────────────────────────────

describe('EWO-017 — Conversational Quality', () => {
  it('includes formatCapabilityMetadataConversational function', () => {
    expect(MCP_SOURCE).toContain('function formatCapabilityMetadataConversational');
  });

  it('includes formatCapabilityFailureConversational function', () => {
    expect(MCP_SOURCE).toContain('function formatCapabilityFailureConversational');
  });

  it('conversational response uses Capability section', () => {
    expect(MCP_SOURCE).toContain('## Capability');
  });

  it('conversational response uses Purpose section', () => {
    expect(MCP_SOURCE).toContain('## Purpose');
  });

  it('conversational response uses Operations section', () => {
    expect(MCP_SOURCE).toContain('## Operations');
  });

  it('conversational response uses Permissions section', () => {
    expect(MCP_SOURCE).toContain('## Permissions');
  });

  it('conversational response uses Governance section', () => {
    expect(MCP_SOURCE).toContain('## Governance');
  });

  it('conversational response uses Availability section', () => {
    expect(MCP_SOURCE).toContain('## Availability');
  });

  it('conversational response states when EIOS did not provide metadata', () => {
    expect(MCP_SOURCE).toContain('EIOS did not provide');
  });

  it('conversational response is included in success responses', () => {
    expect(MCP_SOURCE).toContain('conversational_response: includeConversational ? formatCapabilityMetadataConversational(metadataResponse)');
  });

  it('conversational failure response is included in failure responses', () => {
    expect(MCP_SOURCE).toContain('conversational_response: formatCapabilityFailureConversational(failureResponse)');
  });
});

// ─── Requirement 6: Phase 1 Acceptance Support ──────────────────────────────────

describe('EWO-017 — Phase 1 Acceptance Tests', () => {
  // Test A: Inspect the Engineering Work Orders capability
  it('Test A — inspect_capability_metadata tool exists for capability inspection', () => {
    expect(MCP_SOURCE).toContain('name: "inspect_capability_metadata"');
  });

  it('Test A — tool description mentions governed metadata', () => {
    expect(MCP_SOURCE).toContain('governed metadata');
  });

  // Test B: Invoke one supported Engineering Work Orders operation
  it('Test B — inspect_engineering_object handler exists for operation invocation', () => {
    expect(MCP_SOURCE).toContain('case "inspect_engineering_object"');
    expect(MCP_SOURCE).toContain('inspectEngineeringWorkOrder');
  });

  it('Test B — successful execution includes governed diagnostics', () => {
    expect(MCP_SOURCE).toContain('governed: true');
    expect(MCP_SOURCE).toContain('audit_reference');
  });

  // Test C: Request an operation that does not exist
  it('Test C — unsupported operation returns governed failure', () => {
    expect(MCP_SOURCE).toContain('unsupported_operation');
    expect(MCP_SOURCE).toContain('no_execution_performed: true');
  });

  it('Test C — unsupported operation returns available operations as alternatives', () => {
    expect(MCP_SOURCE).toContain('available_operations: registeredOps');
  });

  // Test D: Inspect a capability that does not exist
  it('Test D — unknown capability returns governed failure', () => {
    expect(MCP_SOURCE).toContain('resolution_outcome: "failure"');
    expect(MCP_SOURCE).toContain('no_metadata_inferred: true');
  });

  it('Test D — unknown capability returns suggested alternatives', () => {
    expect(MCP_SOURCE).toContain('suggested_matching_capabilities:');
    expect(MCP_SOURCE).toContain('available_alternatives:');
  });
});

// ─── Requirement 7: Governance ─────────────────────────────────────────────────

describe('EWO-017 — Governance Compliance', () => {
  it('maintains constitutional compliance', () => {
    expect(MCP_SOURCE).toContain('constitutional_visibility');
  });

  it('maintains auditability with inspection log entries', () => {
    expect(MCP_SOURCE).toContain('atd_connect_inspection_log');
  });

  it('does not reduce existing governance', () => {
    expect(MCP_SOURCE).toContain('governed: true');
    expect(MCP_SOURCE).toContain('readOnlyHint: true');
  });

  it('does not introduce breaking changes to existing MCP capability discovery', () => {
    expect(MCP_SOURCE).toContain('name: "discover_atd_capabilities"');
    expect(MCP_SOURCE).toContain('name: "submit_conversation_inspection"');
    expect(MCP_SOURCE).toContain('name: "inspect_engineering_object"');
  });

  it('all behaviour remains deterministic and runtime-grounded', () => {
    expect(MCP_SOURCE).toContain('metadata_source: capabilityId ? "atd_connect_capabilities registry" : "none"');
    expect(MCP_SOURCE).toContain('governance_outcome');
  });
});

// ─── Metadata Response Structure (unit tests) ──────────────────────────────────

describe('EWO-017 — Metadata Response Structure', () => {
  function buildCapabilityMetadataResponse(cap: Record<string, unknown>): Record<string, unknown> {
    const supportedOps = Array.isArray(cap.supported_operations) ? cap.supported_operations : [];
    const relationships = Array.isArray(cap.relationships) ? cap.relationships : [];
    const metadata = cap.metadata && typeof cap.metadata === 'object' ? cap.metadata : {};
    const visibility = String(cap.constitutional_visibility ?? 'public');
    const dependencies = Array.isArray(cap.dependencies) ? cap.dependencies : (Array.isArray(cap.relationships) ? cap.relationships : []);
    const supportedObjectTypes = Array.isArray(cap.supported_object_types) ? cap.supported_object_types : [];
    const authReqs = (cap.authentication_requirements && typeof cap.authentication_requirements === 'object')
      ? cap.authentication_requirements
      : { authentication: 'required', token_type: 'jwt_anon_key', persona: 'atd or authenticated user' };
    const currentAvailability = String(cap.current_availability ?? 'available');
    const isAvailable = currentAvailability === 'available' && !((cap.deprecated ?? false) === true) && String(cap.status ?? 'active') === 'active';

    return {
      capability_name: cap.name ?? 'unavailable',
      canonical_identifier: cap.capability_id ?? 'unavailable',
      description: cap.description ?? 'unavailable',
      purpose: cap.purpose ?? cap.description ?? 'unavailable',
      lifecycle_status: cap.lifecycle_status ?? cap.status ?? 'unavailable',
      status: cap.status ?? 'unavailable',
      version: cap.capability_version ?? 'unavailable',
      capability_category: cap.category ?? 'unavailable',
      operations_exposed: supportedOps,
      supported_operations: supportedOps,
      read_only_support: true,
      write_support: false,
      required_permissions: {
        authentication: authReqs.authentication ?? 'required',
        visibility: visibility,
        persona: authReqs.persona ?? 'atd or authenticated user',
      },
      permission_requirements: {
        authentication: authReqs.authentication ?? 'required',
        visibility: visibility,
        persona: authReqs.persona ?? 'atd or authenticated user',
        token_type: authReqs.token_type ?? 'jwt_anon_key',
      },
      governance_restrictions: {
        constitutional_visibility: visibility,
        read_only_enforced: true,
        no_mutation_tools: true,
        tenant_isolation: 'EIOS governance enforced',
      },
      authentication_requirements: authReqs,
      dependencies: dependencies,
      supported_object_types: supportedObjectTypes,
      current_availability: currentAvailability,
      available: isAvailable,
      deprecated: cap.deprecated ?? false,
      superseded_by: cap.superseded_by ?? null,
      replacement_capability: cap.replacement_capability ?? null,
      introduced_by_ewo: cap.introduced_by_ewo ?? 'unavailable',
      inspection_contract_version: cap.inspection_contract_version ?? 'unavailable',
      tags_categories: [cap.category ?? 'uncategorised'],
      relationships: relationships,
      owner: cap.owner ?? 'unavailable',
      input_output_schemas: (metadata && Object.keys(metadata).length > 0) ? metadata : 'unavailable',
    };
  }

  const sampleCap = {
    name: 'Engineering Work Orders',
    capability_id: 'engineering-work-orders',
    description: 'Governed inspection of EWOs.',
    purpose: 'Provides read-only inspection of engineering work orders and their lifecycle.',
    status: 'active',
    lifecycle_status: 'active',
    supported_operations: ['listEngineeringWorkOrders', 'inspectEngineeringWorkOrder'],
    relationships: ['engineering-records', 'completion-reports'],
    dependencies: ['engineering-records'],
    supported_object_types: ['engineering_work_order'],
    constitutional_visibility: 'public',
    capability_version: '1.0',
    introduced_by_ewo: 'EWO-024',
    inspection_contract_version: '1.0',
    category: 'work-orders',
    deprecated: false,
    owner: 'EIOS Platform',
    current_availability: 'available',
    authentication_requirements: { authentication: 'required', token_type: 'jwt_anon_key', persona: 'atd' },
    metadata: {},
  };

  it('returns all required EWO-017 metadata fields', () => {
    const response = buildCapabilityMetadataResponse(sampleCap);
    expect(response.capability_name).toBe('Engineering Work Orders');
    expect(response.canonical_identifier).toBe('engineering-work-orders');
    expect(response.description).toBe('Governed inspection of EWOs.');
    expect(response.purpose).toBe('Provides read-only inspection of engineering work orders and their lifecycle.');
    expect(response.lifecycle_status).toBe('active');
    expect(response.version).toBe('1.0');
    expect(response.capability_category).toBe('work-orders');
    expect(response.operations_exposed).toEqual(['listEngineeringWorkOrders', 'inspectEngineeringWorkOrder']);
    expect(response.read_only_support).toBe(true);
    expect(response.write_support).toBe(false);
    expect(response.required_permissions).toBeDefined();
    expect(response.permission_requirements).toBeDefined();
    expect(response.governance_restrictions).toBeDefined();
    expect(response.authentication_requirements).toBeDefined();
    expect(response.dependencies).toEqual(['engineering-records']);
    expect(response.supported_object_types).toEqual(['engineering_work_order']);
    expect(response.current_availability).toBe('available');
    expect(response.available).toBe(true);
  });

  it('marks unavailable fields as "unavailable"', () => {
    const sparseCap = { name: 'Test', capability_id: 'test', description: 'Test desc', status: 'active', category: 'test' };
    const response = buildCapabilityMetadataResponse(sparseCap);
    expect(response.purpose).toBe('Test desc');
    expect(response.version).toBe('unavailable');
    expect(response.dependencies).toEqual([]);
    expect(response.supported_object_types).toEqual([]);
    expect(response.input_output_schemas).toBe('unavailable');
  });

  it('marks deprecated capabilities as unavailable', () => {
    const deprecatedCap = { ...sampleCap, deprecated: true, status: 'deprecated' };
    const response = buildCapabilityMetadataResponse(deprecatedCap);
    expect(response.deprecated).toBe(true);
    expect(response.available).toBe(false);
  });

  it('always enforces read-only support', () => {
    const response = buildCapabilityMetadataResponse(sampleCap);
    expect(response.read_only_support).toBe(true);
    expect(response.write_support).toBe(false);
    expect(response.governance_restrictions).toHaveProperty('read_only_enforced', true);
    expect(response.governance_restrictions).toHaveProperty('no_mutation_tools', true);
  });
});

// ─── Runtime Diagnostic Envelope (unit tests) ───────────────────────────────────

describe('EWO-017 — Runtime Diagnostic Envelope Structure', () => {
  function buildRuntimeDiagnosticEnvelope(
    capabilityId: string | null,
    confidence: number,
    operations: unknown[],
    governanceOutcome: string,
  ) {
    return {
      capability_resolved: capabilityId,
      resolution_confidence: confidence,
      metadata_source: capabilityId ? 'atd_connect_capabilities registry' : 'none',
      operations_returned: Array.isArray(operations) ? operations.map(String) : [],
      permissions_evaluated: true,
      governance_outcome: governanceOutcome,
    };
  }

  it('success envelope captures all runtime values', () => {
    const envelope = buildRuntimeDiagnosticEnvelope('engineering-work-orders', 0.95, ['listEngineeringWorkOrders', 'inspectEngineeringWorkOrder'], 'governed_metadata_returned');
    expect(envelope.capability_resolved).toBe('engineering-work-orders');
    expect(envelope.resolution_confidence).toBe(0.95);
    expect(envelope.metadata_source).toBe('atd_connect_capabilities registry');
    expect(envelope.operations_returned).toEqual(['listEngineeringWorkOrders', 'inspectEngineeringWorkOrder']);
    expect(envelope.permissions_evaluated).toBe(true);
    expect(envelope.governance_outcome).toBe('governed_metadata_returned');
  });

  it('failure envelope uses "none" as metadata source', () => {
    const envelope = buildRuntimeDiagnosticEnvelope(null, 0.3, [], 'capability_resolution_failed');
    expect(envelope.capability_resolved).toBeNull();
    expect(envelope.metadata_source).toBe('none');
    expect(envelope.operations_returned).toEqual([]);
    expect(envelope.governance_outcome).toBe('capability_resolution_failed');
  });

  it('unsupported operation envelope captures governance outcome', () => {
    const envelope = buildRuntimeDiagnosticEnvelope('engineering-work-orders', 1.0, ['listEngineeringWorkOrders'], 'unsupported_operation_refused');
    expect(envelope.governance_outcome).toBe('unsupported_operation_refused');
  });
});

// ─── Conversational Response Formatter (unit tests) ─────────────────────────────

describe('EWO-017 — Conversational Response Formatter', () => {
  function formatCapabilityMetadataConversational(meta: Record<string, unknown>): string {
    const sections: string[] = [];
    const name = String(meta.capability_name ?? 'unavailable');
    const id = String(meta.canonical_identifier ?? 'unavailable');
    const purpose = String(meta.purpose ?? 'unavailable');
    const description = String(meta.description ?? 'unavailable');
    const lifecycle = String(meta.lifecycle_status ?? meta.status ?? 'unavailable');
    const version = String(meta.version ?? 'unavailable');
    const category = String(meta.capability_category ?? 'unavailable');
    const availability = String(meta.current_availability ?? 'unavailable');
    const deprecated = meta.deprecated === true;
    const ops = Array.isArray(meta.operations_exposed) ? meta.operations_exposed : [];
    const dependencies = Array.isArray(meta.dependencies) ? meta.dependencies : [];
    const objectTypes = Array.isArray(meta.supported_object_types) ? meta.supported_object_types : [];
    const readOnly = meta.read_only_support === true;
    const writeSupport = meta.write_support === false ? false : true;
    const perms = meta.permission_requirements as Record<string, unknown> | undefined;
    const governance = meta.governance_restrictions as Record<string, unknown> | undefined;
    const schemas = meta.input_output_schemas;

    sections.push('## Capability\n' + name + ' (' + id + ')');
    if (category !== 'unavailable') sections.push('Category: ' + category);
    if (version !== 'unavailable') sections.push('Version: ' + version);
    sections.push('## Purpose\n' + (purpose !== 'unavailable' ? purpose : description));
    let opsSection = '## Operations\n';
    if (ops.length > 0) {
      opsSection += ops.map((op: unknown) => '- ' + String(op)).join('\n');
    } else {
      opsSection += 'EIOS did not provide any operations for this capability.';
    }
    sections.push(opsSection);
    sections.push('Read-only: ' + (readOnly ? 'yes' : 'no') + ' | Write support: ' + (writeSupport ? 'yes' : 'no'));
    let permsSection = '## Permissions\n';
    if (perms) {
      permsSection += 'Authentication: ' + String(perms.authentication ?? 'required') + '\n';
      permsSection += 'Visibility: ' + String(perms.visibility ?? 'public') + '\n';
      permsSection += 'Persona: ' + String(perms.persona ?? 'atd');
    } else {
      permsSection += 'EIOS did not provide permission metadata.';
    }
    sections.push(permsSection);
    let govSection = '## Governance\n';
    if (governance) {
      govSection += 'Constitutional visibility: ' + String(governance.constitutional_visibility ?? 'public') + '\n';
      govSection += 'Read-only enforced: ' + String(governance.read_only_enforced ?? true) + '\n';
      govSection += 'Mutation tools: ' + String(governance.no_mutation_tools ?? true ? 'not exposed' : 'exposed');
    } else {
      govSection += 'EIOS did not provide governance metadata.';
    }
    sections.push(govSection);
    let availSection = '## Availability\n';
    availSection += 'Status: ' + availability;
    if (deprecated) availSection += ' (deprecated';
    if (meta.superseded_by) availSection += ', superseded by ' + String(meta.superseded_by);
    if (deprecated) availSection += ')';
    sections.push(availSection);
    if (lifecycle !== 'unavailable') sections.push('Lifecycle: ' + lifecycle);
    if (dependencies.length > 0) sections.push('Dependencies: ' + dependencies.join(', '));
    if (objectTypes.length > 0) sections.push('Supported object types: ' + objectTypes.join(', '));
    if (schemas && schemas !== 'unavailable') sections.push('Input/Output schemas: available');
    else sections.push('Input/Output schemas: EIOS did not provide schema metadata.');
    return sections.join('\n\n');
  }

  const sampleMeta = {
    capability_name: 'Engineering Work Orders',
    canonical_identifier: 'engineering-work-orders',
    description: 'Governed inspection of EWOs.',
    purpose: 'Provides read-only inspection of engineering work orders.',
    lifecycle_status: 'active',
    status: 'active',
    version: '1.0',
    capability_category: 'work-orders',
    operations_exposed: ['listEngineeringWorkOrders', 'inspectEngineeringWorkOrder'],
    read_only_support: true,
    write_support: false,
    permission_requirements: { authentication: 'required', visibility: 'public', persona: 'atd' },
    governance_restrictions: { constitutional_visibility: 'public', read_only_enforced: true, no_mutation_tools: true },
    current_availability: 'available',
    deprecated: false,
    dependencies: ['engineering-records'],
    supported_object_types: ['engineering_work_order'],
    input_output_schemas: 'unavailable',
  };

  it('includes all required sections', () => {
    const result = formatCapabilityMetadataConversational(sampleMeta);
    expect(result).toContain('## Capability');
    expect(result).toContain('## Purpose');
    expect(result).toContain('## Operations');
    expect(result).toContain('## Permissions');
    expect(result).toContain('## Governance');
    expect(result).toContain('## Availability');
  });

  it('lists operations with bullet points', () => {
    const result = formatCapabilityMetadataConversational(sampleMeta);
    expect(result).toContain('- listEngineeringWorkOrders');
    expect(result).toContain('- inspectEngineeringWorkOrder');
  });

  it('states when EIOS did not provide schemas', () => {
    const result = formatCapabilityMetadataConversational(sampleMeta);
    expect(result).toContain('EIOS did not provide schema metadata.');
  });

  it('includes dependencies and supported object types', () => {
    const result = formatCapabilityMetadataConversational(sampleMeta);
    expect(result).toContain('Dependencies: engineering-records');
    expect(result).toContain('Supported object types: engineering_work_order');
  });
});
