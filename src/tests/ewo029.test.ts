// EWO-029 — Supervised Engineering Execution Engine v1.0 Tests
// Tests the execution provider abstraction, execution packages,
// supervised execution pipeline, governance gate, and diagnostics.

import { describe, it, expect } from 'vitest';
import {
  getRegisteredProviders,
  getProviderById,
  getActiveProviders,
  selectExecutionProvider,
} from '../lib/executionProviderRegistry';
import {
  generateExecutionPackage,
  getExecutionPackage,
  getPackagesByEwo,
} from '../lib/executionPackageService';
import {
  PIPELINE_STAGES,
  evaluateGovernanceGate,
  getExecutionRecord,
  getExecutionsByEwo,
} from '../lib/supervisedExecutionEngine';
import {
  listExecutionProviders,
  inspectExecutionProvider,
  listExecutionRecords,
  inspectExecutionRecord,
  inspectExecutionPipeline,
  inspectExecutionGovernanceGate,
  inspectExecutionHistory,
} from '../lib/executionDiagnosticsService';

describe('EWO-029 — Execution Provider Abstraction', () => {
  it('should have Bolt as a registered governed provider', async () => {
    const providers = await getRegisteredProviders();
    expect(providers.length).toBeGreaterThan(0);
    const bolt = providers.find(p => p.provider_id === 'bolt');
    expect(bolt).toBeDefined();
    expect(bolt!.is_governed).toBe(true);
    // EWO-031R.1: Bolt is now inactive but still registered
    expect(bolt!.is_active).toBe(false);
    expect(bolt!.governance_rules).toContain('constitutional_compliance');
  });

  it('should have native-atd as a registered future provider (inactive)', async () => {
    const native = await getProviderById('native-atd');
    expect(native).toBeDefined();
    expect(native!.is_active).toBe(false);
    expect(native!.provider_type).toBe('native');
  });

  it('should only return active providers from getActiveProviders', async () => {
    const active = await getActiveProviders();
    expect(active.every(p => p.is_active === true)).toBe(true);
    // EWO-031R.1: Codex is now active, Bolt is inactive
    expect(active.some(p => p.provider_id === 'codex')).toBe(true);
    expect(active.some(p => p.provider_id === 'bolt')).toBe(false);
    expect(active.some(p => p.provider_id === 'native-atd')).toBe(false);
  });

  it('should select Codex as default provider (EWO-031R.1 governed policy)', async () => {
    const selection = await selectExecutionProvider('EWO-029');
    // EWO-031R.1: Codex is now the governed default, Bolt is inactive
    expect(selection.selected_provider.provider_id).toBe('codex');
    expect(selection.selection_confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('should select preferred provider when specified (Codex per EWO-031R.1 policy)', async () => {
    const selection = await selectExecutionProvider('EWO-029', 'codex');
    expect(selection.selected_provider.provider_id).toBe('codex');
    expect(selection.selection_reason).toContain('Preferred');
  });

  it('should throw for non-existent preferred provider', async () => {
    await expect(selectExecutionProvider('EWO-029', 'nonexistent')).rejects.toThrow();
  });
});

describe('EWO-029 — Execution Package Generation', () => {
  it('should generate an execution package with all required fields', async () => {
    const pkg = await generateExecutionPackage({
      ewo_ref: 'EWO-029',
      implementation_instructions: 'Build the supervised execution engine',
      constraints: ['read_only_boundary', 'constitutional_compliance'],
      governance_rules: ['audit_trail', 'deterministic_behaviour'],
      completion_criteria: ['build_passes', 'tests_pass'],
      acceptance_criteria: ['po_verification'],
      build_requirements: ['npm_run_build'],
      test_requirements: ['all_tests_pass'],
      execution_provider: 'bolt',
      provider_config: { engine_id: 'bolt' },
    });

    expect(pkg.package_ref).toMatch(/^SEP-EWO-029-/);
    expect(pkg.ewo_ref).toBe('EWO-029');
    expect(pkg.implementation_instructions).toBe('Build the supervised execution engine');
    expect(pkg.constraints).toContain('read_only_boundary');
    expect(pkg.governance_rules).toContain('audit_trail');
    expect(pkg.completion_criteria).toContain('build_passes');
    expect(pkg.acceptance_criteria).toContain('po_verification');
    expect(pkg.build_requirements).toContain('npm_run_build');
    expect(pkg.execution_provider).toBe('bolt');
    expect(pkg.execution_version).toBe('1.0');
    expect(pkg.package_status).toBe('generated');
  });

  it('should retrieve a generated package by ref', async () => {
    const created = await generateExecutionPackage({
      ewo_ref: 'EWO-029',
      implementation_instructions: 'Test package retrieval',
      constraints: [],
      governance_rules: [],
      completion_criteria: [],
      acceptance_criteria: [],
      build_requirements: [],
      test_requirements: [],
      execution_provider: 'bolt',
      provider_config: {},
    });

    const retrieved = await getExecutionPackage(created.package_ref);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.package_ref).toBe(created.package_ref);
  });

  it('should list packages by EWO', async () => {
    const packages = await getPackagesByEwo('EWO-029');
    expect(packages.length).toBeGreaterThan(0);
    expect(packages.every(p => p.ewo_ref === 'EWO-029')).toBe(true);
  });
});

describe('EWO-029 — Supervised Execution Pipeline', () => {
  it('should define all 10 canonical pipeline stages', () => {
    expect(PIPELINE_STAGES.length).toBe(10);
    expect(PIPELINE_STAGES[0]).toBe('po_approval');
    expect(PIPELINE_STAGES[9]).toBe('await_product_owner_review');
  });

  it('should evaluate governance gate for an EWO without PO approval', async () => {
    // EWO-029 has no PO acceptance yet — gate should fail
    const gate = await evaluateGovernanceGate('EWO-029');
    expect(gate.passed).toBe(false);
    expect(gate.blockers.length).toBeGreaterThan(0);
    expect(gate.blockers.some(b => b.gate === 'po_approval')).toBe(true);
  });

  it('should evaluate governance gate for a non-existent EWO', async () => {
    const gate = await evaluateGovernanceGate('EWO-NONEXISTENT');
    expect(gate.passed).toBe(false);
    expect(gate.blockers.some(b => b.gate === 'ewo_exists')).toBe(true);
  });

  it('should evaluate governance gate for a closed EWO', async () => {
    const gate = await evaluateGovernanceGate('EWO-028');
    expect(gate.passed).toBe(false);
    expect(gate.blockers.some(b => b.gate === 'ewo_active')).toBe(true);
  });
});

describe('EWO-029 — Execution Diagnostics Inspection', () => {
  it('should list execution providers via governed inspection', async () => {
    const result = await listExecutionProviders('atd');
    expect(result.governed).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.capability_id).toBe('execution-providers');
    expect(result.data!.total_count).toBeGreaterThan(0);
    expect(result.data!.items.some(i => i.id === 'bolt')).toBe(true);
  });

  it('should inspect a specific execution provider', async () => {
    const result = await inspectExecutionProvider('bolt', 'atd');
    expect(result.governed).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.object_ref).toBe('bolt');
    expect(result.data!.object_type).toBe('execution_provider');
    expect((result.data!.details as Record<string, unknown>).provider_id).toBe('bolt');
    expect((result.data!.details as Record<string, unknown>).is_governed).toBe(true);
  });

  it('should return empty for non-existent provider', async () => {
    const result = await inspectExecutionProvider('nonexistent', 'atd');
    expect(result.governed).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should list execution records', async () => {
    const result = await listExecutionRecords('atd');
    expect(result.governed).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.capability_id).toBe('execution-records');
  });

  it('should inspect execution governance gate', async () => {
    const result = await inspectExecutionGovernanceGate('EWO-029', 'atd');
    expect(result.governed).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.capability_id).toBe('execution-governance');
    expect(result.data!.object_type).toBe('governance_gate');
    expect((result.data!.details as Record<string, unknown>).passed).toBe(false);
  });

  it('should inspect execution history for an EWO', async () => {
    const result = await inspectExecutionHistory('EWO-029', 'atd');
    expect(result.governed).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.capability_id).toBe('execution-history');
  });
});
