// EWO-024 — ATD Connect: Capability Registry
// Self-registering governed registry. No hard-coded capability lists.
// Capabilities register themselves; the registry becomes the authoritative
// discovery mechanism.

import { supabase } from '../supabase';
import type {
  Capability,
  CapabilityRegistration,
  InspectionOperation,
} from './types';

// ─── Capability Definitions (self-registration source) ─────────────────────────
// Each capability declares itself here. On first load, these are inserted
// into the database. After that, the database is the authoritative source.

const CAPABILITY_DEFINITIONS: CapabilityRegistration[] = [
  {
    capability_id: 'engineering-records',
    name: 'Engineering Records',
    category: 'records',
    description: 'Governed inspection of the Engineering Records Library — the canonical store of engineering documentation, specifications, and generated artefacts.',
    inspection_service: 'records',
    owner: 'EIOS Platform',
    constitutional_visibility: 'public',
    relationships: ['engineering-work-orders', 'knowledge', 'lineage'],
    supported_operations: ['listEngineeringRecords', 'inspectEngineeringRecord', 'inspectRelationships'],
  },
  {
    capability_id: 'engineering-work-orders',
    name: 'Engineering Work Orders',
    category: 'work-orders',
    description: 'Governed inspection of Engineering Work Orders (EWOs) — the lifecycle-managed units of engineering work in EIOS.',
    inspection_service: 'work-orders',
    owner: 'EIOS Platform',
    constitutional_visibility: 'public',
    relationships: ['engineering-records', 'completion-reports', 'engineering-packages', 'engineering-plans', 'knowledge'],
    supported_operations: ['listEngineeringWorkOrders', 'inspectEngineeringWorkOrder', 'inspectRelationships', 'inspectKnowledgeExtraction', 'inspectEngineeringWorkOrderAcceptanceGovernance'],
  },
  {
    capability_id: 'completion-reports',
    name: 'Completion Reports',
    category: 'work-orders',
    description: 'Governed inspection of EWO Completion Reports — the closeout evidence for engineering work orders.',
    inspection_service: 'completion-reports',
    owner: 'EIOS Platform',
    constitutional_visibility: 'public',
    relationships: ['engineering-work-orders', 'engineering-packages'],
    supported_operations: ['listEngineeringRecords', 'inspectEngineeringRecord'],
  },
  {
    capability_id: 'engineering-packages',
    name: 'Engineering Packages',
    category: 'packages',
    description: 'Governed inspection of Engineering Packages — assembled bundles of engineering evidence for review and release.',
    inspection_service: 'packages',
    owner: 'EIOS Platform',
    constitutional_visibility: 'public',
    relationships: ['engineering-records', 'engineering-work-orders', 'knowledge'],
    supported_operations: ['listEngineeringRecords', 'inspectEngineeringRecord'],
  },
  {
    capability_id: 'engineering-plans',
    name: 'Engineering Plans',
    category: 'planning',
    description: 'Governed inspection of Engineering Plans — the planning engine recommendations and programme snapshots.',
    inspection_service: 'plans',
    owner: 'EIOS Platform',
    constitutional_visibility: 'public',
    relationships: ['engineering-work-orders'],
    supported_operations: ['listEngineeringPlans', 'inspectEngineeringPlan'],
  },
  {
    capability_id: 'memory',
    name: 'Engineering Memory',
    category: 'memory',
    description: 'Governed inspection of Engineering Memory — the persistent knowledge store for engineering context.',
    inspection_service: 'memory',
    owner: 'EIOS Platform',
    constitutional_visibility: 'public',
    relationships: ['knowledge', 'engineering-records'],
    supported_operations: ['listMemory', 'inspectMemory'],
  },
  {
    capability_id: 'knowledge',
    name: 'Engineering Knowledge',
    category: 'knowledge',
    description: 'Governed inspection of Engineering Knowledge Objects — structured knowledge captured from engineering work.',
    inspection_service: 'knowledge',
    owner: 'EIOS Platform',
    constitutional_visibility: 'public',
    relationships: ['memory', 'engineering-records', 'lineage'],
    supported_operations: ['listKnowledge', 'inspectKnowledge'],
  },
  {
    capability_id: 'lineage',
    name: 'Engineering Lineage',
    category: 'lineage',
    description: 'Governed inspection of Engineering Record Lineage — the relationship graph between engineering artefacts.',
    inspection_service: 'lineage',
    owner: 'EIOS Platform',
    constitutional_visibility: 'public',
    relationships: ['engineering-records', 'knowledge'],
    supported_operations: ['listLineage', 'inspectLineage', 'inspectRelationships'],
  },
  {
    capability_id: 'pages',
    name: 'Platform Pages',
    category: 'platform',
    description: 'Governed inspection of Platform Pages — the UI surfaces and workspaces in EIOS.',
    inspection_service: 'pages',
    owner: 'EIOS Platform',
    constitutional_visibility: 'internal',
    relationships: ['workspaces', 'services'],
    supported_operations: ['listPages', 'inspectPage'],
  },
  {
    capability_id: 'workspaces',
    name: 'Engineering Workspaces',
    category: 'platform',
    description: 'Governed inspection of Engineering Workspaces — the major functional areas of the Engineering Control Centre.',
    inspection_service: 'workspaces',
    owner: 'EIOS Platform',
    constitutional_visibility: 'internal',
    relationships: ['pages', 'services'],
    supported_operations: ['listWorkspaces', 'inspectWorkspace'],
  },
  {
    capability_id: 'services',
    name: 'Platform Services',
    category: 'platform',
    description: 'Governed inspection of Platform Services — the edge functions and background services powering EIOS.',
    inspection_service: 'services',
    owner: 'EIOS Platform',
    constitutional_visibility: 'internal',
    relationships: ['pages', 'workspaces'],
    supported_operations: ['listServices', 'inspectService'],
  },
  {
    capability_id: 'standards',
    name: 'Engineering Standards',
    category: 'governance',
    description: 'Governed inspection of Engineering Standards — the constitutional standards governing engineering work.',
    inspection_service: 'standards',
    owner: 'EIOS Platform',
    constitutional_visibility: 'public',
    relationships: ['constitution'],
    supported_operations: ['listStandards', 'inspectStandard'],
  },
  {
    capability_id: 'constitution',
    name: 'Constitution',
    category: 'governance',
    description: 'Governed inspection of the EIOS Constitution — the constitutional amendments and governance rules.',
    inspection_service: 'constitution',
    owner: 'EIOS Platform',
    constitutional_visibility: 'public',
    relationships: ['standards'],
    supported_operations: ['listConstitution', 'inspectConstitution'],
  },
  {
    capability_id: 'supervised-engineering-execution',
    name: 'Supervised Engineering Execution',
    category: 'execution',
    description: 'Governed inspection of the Supervised Engineering Execution Engine — the provider-independent execution pipeline, provider registry, governance gates, and execution diagnostics.',
    inspection_service: 'execution-diagnostics',
    owner: 'EIOS Platform',
    constitutional_visibility: 'public',
    relationships: ['engineering-work-orders', 'engineering-records'],
    supported_operations: [
      'listExecutionProviders', 'inspectExecutionProvider',
      'listExecutionRecords', 'inspectExecutionRecord',
      'inspectExecutionPipeline', 'inspectExecutionGovernanceGate',
      'inspectExecutionHistory', 'inspectSupervisedExecutionEngine',
      'inspectCodexProviderImplementationEvidence',
    ],
  },
];

// ─── Registry Functions ────────────────────────────────────────────────────────

let registrationPromise: Promise<void> | null = null;

async function ensureRegistered(): Promise<void> {
  if (registrationPromise) return registrationPromise;
  registrationPromise = doRegistration();
  return registrationPromise;
}

async function doRegistration(): Promise<void> {
  for (const def of CAPABILITY_DEFINITIONS) {
    const { error } = await supabase
      .from('atd_connect_capabilities')
      .upsert({
        capability_id: def.capability_id,
        name: def.name,
        category: def.category,
        description: def.description,
        status: def.status ?? 'active',
        owner: def.owner ?? null,
        constitutional_visibility: def.constitutional_visibility ?? 'public',
        inspection_service: def.inspection_service,
        relationships: def.relationships ?? [],
        supported_operations: def.supported_operations,
        metadata: def.metadata ?? {},
        capability_version: def.capability_version ?? '1.0',
        introduced_by_ewo: def.introduced_by_ewo ?? 'EWO-024',
        lifecycle_status: def.lifecycle_status ?? 'active',
        deprecated: def.deprecated ?? false,
        superseded_by: def.superseded_by ?? null,
        replacement_capability: def.replacement_capability ?? null,
        inspection_contract_version: def.inspection_contract_version ?? '1.0',
        purpose: def.purpose ?? def.description,
        dependencies: def.dependencies ?? def.relationships ?? [],
        supported_object_types: def.supported_object_types ?? [],
        current_availability: def.current_availability ?? 'available',
        authentication_requirements: def.authentication_requirements ?? { authentication: 'required', token_type: 'jwt_anon_key', persona: 'atd or authenticated user' },
      }, { onConflict: 'capability_id' });
    if (error) {
      console.error('[ATD Connect] Failed to register capability:', def.capability_id, error.message);
    }
  }
}

export async function discoverCapabilities(): Promise<Capability[]> {
  await ensureRegistered();
  const { data, error } = await supabase
    .from('atd_connect_capabilities')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Capability[];
}

export async function inspectCapability(capabilityId: string): Promise<Capability | null> {
  await ensureRegistered();
  const { data, error } = await supabase
    .from('atd_connect_capabilities')
    .select('*')
    .eq('capability_id', capabilityId)
    .maybeSingle();

  if (error) throw error;
  return data as Capability | null;
}

export async function getCapabilitiesByCategory(category: string): Promise<Capability[]> {
  await ensureRegistered();
  const { data, error } = await supabase
    .from('atd_connect_capabilities')
    .select('*')
    .eq('category', category)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Capability[];
}

export async function getCapabilityCategories(): Promise<string[]> {
  const caps = await discoverCapabilities();
  return [...new Set(caps.map(c => c.category))].sort();
}

export function getRegisteredCapabilityIds(): string[] {
  return CAPABILITY_DEFINITIONS.map(d => d.capability_id);
}

export function getCapabilityDefinition(id: string): CapabilityRegistration | undefined {
  return CAPABILITY_DEFINITIONS.find(d => d.capability_id === id);
}

export function getSupportedOperations(capabilityId: string): InspectionOperation[] {
  const def = CAPABILITY_DEFINITIONS.find(d => d.capability_id === capabilityId);
  return def?.supported_operations ?? [];
}
