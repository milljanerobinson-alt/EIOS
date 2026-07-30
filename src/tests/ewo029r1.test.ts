import { describe, it, expect } from 'vitest';
import { interpretRequest, processConversationInspection } from '../lib/atdConnect/conversationBridge';
import { inspectSupervisedExecutionEngine } from '../lib/executionDiagnosticsService';
import { getRegisteredProviders, getActiveProviders } from '../lib/executionProviderRegistry';
import { PIPELINE_STAGES } from '../lib/supervisedExecutionEngine';
import type { ConversationInspectionRequest } from '../lib/atdConnect/types';

const PERSONA = 'atd-test';

function makeRequest(text: string): ConversationInspectionRequest {
  return {
    request_id: `test-${Date.now()}`,
    natural_language_request: text,
    requesting_persona: PERSONA,
    conversation_id: 'test-conv-029r1',
    client_id: 'test-client',
  };
}

describe('EWO-029R.1 — Supervised Execution Engine Inspection Routing', () => {

  // ─── Test 1: Exact request ────────────────────────────────────────────────
  it('Test 1: resolves "Inspect the supervised execution engine." to engine inspection', () => {
    const result = interpretRequest('Inspect the supervised execution engine.');
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('supervised-engineering-execution');
    expect(result.operation).toBe('inspectSupervisedExecutionEngine');
    expect(result.isExecutionInspection).toBe(true);
    expect(result.intentLabel).toBe('supervised_execution_engine_inspection');
  });

  // ─── Test 2: Full PO prompt with return-field list ─────────────────────────
  it('Test 2: full PO prompt with field list resolves to engine inspection, not write', () => {
    const poPrompt = `Inspect the supervised execution engine.

Return:

* detected_intent
* routing_decision
* resolved_capability
* resolved_operation
* execution providers
* active execution provider
* provider independence status
* execution package support
* execution pipeline stages
* execution diagnostics support
* Product Owner governance gates
* runtime diagnostics
* intent_diagnostics
* lifecycle_change_performed
* audit reference

Do not perform any lifecycle changes.`;

    const result = interpretRequest(poPrompt);
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('supervised-engineering-execution');
    expect(result.operation).toBe('inspectSupervisedExecutionEngine');
    expect(result.intentLabel).toBe('supervised_execution_engine_inspection');
  });

  // ─── Test 3: Alternative phrasing ──────────────────────────────────────────
  it('Test 3: resolves "Explain the supervised engineering execution engine."', () => {
    const result = interpretRequest('Explain the supervised engineering execution engine.');
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('supervised-engineering-execution');
    expect(result.operation).toBe('inspectSupervisedExecutionEngine');
  });

  // ─── Test 4: Provider + pipeline request ────────────────────────────────────
  it('Test 4: resolves "Show the engineering execution providers and pipeline."', () => {
    const result = interpretRequest('Show the engineering execution providers and pipeline.');
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('supervised-engineering-execution');
    expect(result.operation).toBe('inspectSupervisedExecutionEngine');
  });

  // ─── Test 5: Governance gates question ─────────────────────────────────────
  it('Test 5: resolves "What governance gates prevent ATD from executing?"', () => {
    const result = interpretRequest('What governance gates prevent ATD from executing?');
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('supervised-engineering-execution');
    expect(result.operation).toBe('inspectSupervisedExecutionEngine');
  });

  // ─── Test 6: Provider-specific request ─────────────────────────────────────
  it('Test 6: resolves "Inspect the Bolt execution provider." to provider inspection', () => {
    const result = interpretRequest('Inspect the Bolt execution provider.');
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('execution-providers');
    expect(result.operation).toBe('inspectExecutionProvider');
    expect(result.objectReference).toBe('Bolt');
  });

  // ─── Test 7: Pipeline-specific request ──────────────────────────────────────
  it('Test 7: resolves "Inspect the execution pipeline for SER-..." to pipeline inspection', () => {
    const result = interpretRequest('Inspect the execution pipeline for SER-EWO-029-12345.');
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('execution-pipeline');
    expect(result.operation).toBe('inspectExecutionPipeline');
  });

  // ─── Test 8: Execution package support request ───────────────────────────────
  it('Test 8: resolves "Inspect execution package support." to engine inspection', () => {
    const result = interpretRequest('Inspect execution package support.');
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('supervised-engineering-execution');
    expect(result.operation).toBe('inspectSupervisedExecutionEngine');
  });

  // ─── Test 9: Generic non-execution inspection unaffected ────────────────────
  it('Test 9: generic inspection "List every engineering capability" unaffected', () => {
    const result = interpretRequest('List every engineering capability');
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('atd-connect');
    expect(result.operation).toBe('discoverCapabilities');
    expect(result.isExecutionInspection).toBe(false);
  });

  // ─── Test 10: Knowledge routing unaffected ─────────────────────────────────
  it('Test 10: knowledge routing "Show all knowledge" unaffected', () => {
    const result = interpretRequest('Show all knowledge');
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('knowledge');
    expect(result.operation).toBe('listKnowledge');
  });

  // ─── Test 11: EWO routing unaffected ────────────────────────────────────────
  it('Test 11: EWO routing "Inspect EWO-024" unaffected', () => {
    const result = interpretRequest('Inspect EWO-024');
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('engineering-work-orders');
    expect(result.operation).toBe('inspectEngineeringWorkOrder');
  });

  // ─── Test 12: Capability metadata inspection unaffected ────────────────────
  it('Test 12: capability metadata "Show capabilities" unaffected', () => {
    const result = interpretRequest('Show capabilities');
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('atd-connect');
    expect(result.operation).toBe('discoverCapabilities');
  });

  // ─── Test 13: Unknown execution target → governed unresolved ───────────────
  it('Test 13: unknown execution target returns governed unresolved', () => {
    const result = interpretRequest('Inspect the flux capacitor execution widget.');
    expect(result.capability).toBeNull();
    expect(result.operation).toBeNull();
    expect(result.ambiguous).toBe(true);
  });

  // ─── Test 14: Inspection performs no lifecycle changes ──────────────────────
  it('Test 14: engine inspection is read-only (lifecycle_change_performed = false)', async () => {
    const result = await inspectSupervisedExecutionEngine(PERSONA);
    expect(result.governed).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.lifecycle_change_performed).toBe(false);
    expect(result.data!.runtime_diagnostics.lifecycle_change_performed).toBe(false);
    expect(result.data!.intent_diagnostics.lifecycle_change_requested).toBe(false);
    expect(result.data!.intent_diagnostics.isWriteRequest).toBe(false);
  });

  // ─── Test 15: Long prompts and bullet lists don't prevent target extraction ─
  it('Test 15: long prompt with bullet list resolves correctly', () => {
    const longPrompt = `
@EIOS

Inspect the supervised execution engine.

Return:

* detected_intent
* routing_decision
* resolved_capability
* resolved_operation
* execution providers
* active execution provider
* provider independence status
* execution package support
* execution pipeline stages
* execution diagnostics support
* Product Owner governance gates
* runtime diagnostics
* intent_diagnostics
* lifecycle_change_performed
* audit reference

Do not perform any lifecycle changes.
`;
    const result = interpretRequest(longPrompt);
    expect(result.isWriteRequest).toBe(false);
    expect(result.capability).toBe('supervised-engineering-execution');
    expect(result.operation).toBe('inspectSupervisedExecutionEngine');
  });

  // ─── Test 16: Returned providers, stages, gates match canonical sources ─────
  it('Test 16: returned providers match governed registry', async () => {
    const result = await inspectSupervisedExecutionEngine(PERSONA);
    expect(result.data).toBeDefined();

    const registryProviders = await getRegisteredProviders();
    expect(result.data!.execution_providers).toHaveLength(registryProviders.length);

    for (const p of result.data!.execution_providers) {
      expect(p.provider_id).toBeDefined();
      expect(p.provider_name).toBeDefined();
      expect(p.is_governed).toBeDefined();
      expect(p.lifecycle_status).toMatch(/^(active|inactive)$/);
    }
  });

  it('Test 16b: returned pipeline stages match canonical PIPELINE_STAGES', async () => {
    const result = await inspectSupervisedExecutionEngine(PERSONA);
    expect(result.data).toBeDefined();
    expect(result.data!.execution_pipeline_stages).toHaveLength(PIPELINE_STAGES.length);
    for (let i = 0; i < PIPELINE_STAGES.length; i++) {
      expect(result.data!.execution_pipeline_stages[i].stage).toBe(PIPELINE_STAGES[i]);
      expect(result.data!.execution_pipeline_stages[i].sequence).toBe(i);
    }
  });

  it('Test 16c: returned governance gates match canonical definitions', async () => {
    const result = await inspectSupervisedExecutionEngine(PERSONA);
    expect(result.data).toBeDefined();
    const gates = result.data!.product_owner_governance_gates;
    expect(gates.length).toBeGreaterThanOrEqual(5);
    expect(gates.some(g => g.gate === 'po_approval')).toBe(true);
    expect(gates.some(g => g.gate === 'execution_approval')).toBe(true);
    expect(gates.some(g => g.gate === 'ewo_active')).toBe(true);
    expect(gates.some(g => g.gate === 'engineering_package')).toBe(true);
  });

  // ─── Test 17: Missing metadata marked unavailable, not fabricated ──────────
  it('Test 17: missing metadata marked unavailable', async () => {
    const result = await inspectSupervisedExecutionEngine(PERSONA);
    expect(result.data).toBeDefined();

    // If no active provider, it should be null and listed in unavailable_fields
    const activeProviders = await getActiveProviders();
    if (activeProviders.length === 0) {
      expect(result.data!.active_execution_provider).toBeNull();
      expect(result.data!.runtime_diagnostics.unavailable_fields).toContain('active_execution_provider');
    } else {
      expect(result.data!.active_execution_provider).not.toBeNull();
    }

    // All fields should be grounded — no null where data is expected
    expect(result.data!.resolved_capability).toBe('supervised-engineering-execution');
    expect(result.data!.resolved_operation).toBe('inspectSupervisedExecutionEngine');
    expect(result.data!.capability_id).toBe('supervised-engineering-execution');
  });

  // ─── Test 18: Runtime diagnostics report sources attempted and inspected ────
  it('Test 18: runtime diagnostics report sources and services', async () => {
    const result = await inspectSupervisedExecutionEngine(PERSONA);
    expect(result.data).toBeDefined();
    const rd = result.data!.runtime_diagnostics;

    expect(rd.request_id).toBeDefined();
    expect(rd.detected_intent).toBe('supervised_execution_engine_inspection');
    expect(rd.extracted_target).toBeDefined();
    expect(rd.target_resolution_method).toContain('pattern_match');
    expect(rd.capability_resolution_method).toContain('capability_registry_lookup');
    expect(rd.operation_resolution_method).toContain('deterministic_routing');
    expect(rd.routing_rule).toBe('execution_engine_inspection_precedence');
    expect(rd.services_invoked.length).toBeGreaterThan(0);
    expect(rd.registries_inspected).toContain('execution_provider_registry');
    expect(rd.provider_records_examined).toBeGreaterThan(0);
    expect(rd.package_definitions_inspected).toBe(true);
    expect(rd.pipeline_definitions_inspected).toBe(true);
    expect(rd.gate_definitions_inspected).toBe(true);
    expect(rd.diagnostic_confidence).toBeGreaterThan(0);
    expect(rd.lifecycle_change_performed).toBe(false);
    expect(rd.generated_timestamp).toBeDefined();
    expect(rd.audit_reference).toBeDefined();
  });

  // ─── Test 18b: Intent diagnostics in response ───────────────────────────────
  it('Test 18b: intent diagnostics returned in response', async () => {
    const result = await inspectSupervisedExecutionEngine(PERSONA);
    expect(result.data).toBeDefined();
    const id = result.data!.intent_diagnostics;

    expect(id.detected_intent).toBe('supervised_execution_engine_inspection');
    expect(id.confidence).toBeGreaterThan(0);
    expect(id.routing_decision).toBe('route_to_inspectSupervisedExecutionEngine');
    expect(id.extracted_target).toBe('supervised execution engine');
    expect(id.matched_pattern).toBe('execution_engine_inspection');
    expect(id.isWriteRequest).toBe(false);
    expect(id.isFrameworkIntrospection).toBe(true);
    expect(id.isExecutionInspection).toBe(true);
    expect(id.lifecycle_change_requested).toBe(false);
  });

  // ─── Test 19: Provider independence evidence is structured, not narrative ───
  it('Test 19: provider independence is structured evidence', async () => {
    const result = await inspectSupervisedExecutionEngine(PERSONA);
    expect(result.data).toBeDefined();
    const pi = result.data!.provider_independence_status;

    expect(pi.status).toMatch(/^(confirmed|partial|unavailable)$/);
    expect(Array.isArray(pi.evidence)).toBe(true);
    expect(pi.evidence.length).toBeGreaterThan(0);
    // Evidence should be machine-produced, not narrative opinion
    expect(pi.evidence.some(e => e.includes('contract'))).toBe(true);
  });

  // ─── Test 20: Active provider from canonical config ─────────────────────────
  it('Test 20: active provider determined from registry, not assumed', async () => {
    const result = await inspectSupervisedExecutionEngine(PERSONA);
    expect(result.data).toBeDefined();

    const activeProviders = await getActiveProviders();
    if (activeProviders.length > 0) {
      expect(result.data!.active_execution_provider).not.toBeNull();
      expect(result.data!.active_execution_provider!.provider_id).toBe(activeProviders[0].provider_id);
    }
  });

  // ─── Test 21: End-to-end via processConversationInspection ──────────────────
  it('Test 21: processConversationInspection resolves full PO prompt end-to-end', async () => {
    const poPrompt = `Inspect the supervised execution engine.

Return:

* detected_intent
* routing_decision
* resolved_capability
* resolved_operation
* execution providers
* active execution provider
* provider independence status
* execution package support
* execution pipeline stages
* execution diagnostics support
* Product Owner governance gates
* runtime diagnostics
* intent_diagnostics
* lifecycle_change_performed
* audit reference

Do not perform any lifecycle changes.`;

    const result = await processConversationInspection(makeRequest(poPrompt));
    expect(result.governed).toBe(true);
    expect(result.resolved_capability).toBe('supervised-engineering-execution');
    expect(result.resolved_operation).toBe('inspectSupervisedExecutionEngine');
    expect(result.result_type).toBe('success');
    expect(result.intent_diagnostics).toBeDefined();
    expect(result.intent_diagnostics!.detected_intent).toBe('supervised_execution_engine_inspection');
    expect(result.intent_diagnostics!.isExecutionInspection).toBe(true);
    expect(result.intent_diagnostics!.isWriteRequest).toBe(false);
  });

  // ─── Test 22: Exact short request end-to-end ────────────────────────────────
  it('Test 22: processConversationInspection resolves exact short request', async () => {
    const result = await processConversationInspection(makeRequest('Inspect the supervised execution engine.'));
    expect(result.governed).toBe(true);
    expect(result.resolved_capability).toBe('supervised-engineering-execution');
    expect(result.resolved_operation).toBe('inspectSupervisedExecutionEngine');
    expect(result.result_type).toBe('success');
  });
});
