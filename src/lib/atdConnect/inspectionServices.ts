// EWO-024 — ATD Connect: Governed Inspection Services
// Inspection services rather than raw table exposure.
// All operations return governed DTOs only.

import { supabase } from '../supabase';
import { recordInspection } from './auditService';
import { computeHealth, governedEmptyHealth } from './healthService';
import { inspectCapability, getCapabilityDefinition } from './capabilityRegistry';
import { resolveEngineeringWorkOrder } from './canonicalReferenceResolver';
import type {
  CapabilityInspectionDTO,
  Capability,
  GovernedResponse,
  HealthInfo,
  InspectionMetadata,
  InspectionOperation,
  ListInspectionDTO,
  ListItemDTO,
  ObjectInspectionDTO,
  RelatedObjectRef,
  RelationshipInspectionDTO,
} from './types';

const DEFAULT_PERSONA = 'atd';

// ─── Metadata helper ────────────────────────────────────────────────────────────

async function createMetadata(
  operation: InspectionOperation,
  persona: string,
  startTime: number,
): Promise<InspectionMetadata> {
  const requestId = await recordInspection({
    requestingPersona: persona,
    operation,
    durationMs: Date.now() - startTime,
  });
  return {
    request_id: requestId,
    timestamp: new Date().toISOString(),
    requesting_persona: persona,
    operation,
    duration_ms: Date.now() - startTime,
  };
}

function governedSuccess<T>(data: T, metadata: InspectionMetadata, health: HealthInfo): GovernedResponse<T> {
  return { governed: true, data, explanation: null, health, metadata };
}

function governedEmpty<T>(explanation: string, metadata: InspectionMetadata): GovernedResponse<T> {
  return { governed: true, data: null, explanation, health: governedEmptyHealth(), metadata };
}

// ─── Capability Inspection ──────────────────────────────────────────────────────

export async function discoverCapabilities(
  persona: string = DEFAULT_PERSONA,
): Promise<GovernedResponse<Capability[]>> {
  const start = Date.now();
  try {
    const { discoverCapabilities: discover } = await import('./capabilityRegistry');
    const capabilities = await discover();
    const health = computeHealth({ available: true, recordCount: capabilities.length });
    const metadata = await createMetadata('discoverCapabilities', persona, start);
    return governedSuccess(capabilities, metadata, health);
  } catch (err) {
    const metadata = await createMetadata('discoverCapabilities', persona, start);
    return governedEmpty('Unable to discover capabilities.', metadata);
  }
}

export async function inspectCapabilityById(
  capabilityId: string,
  persona: string = DEFAULT_PERSONA,
): Promise<GovernedResponse<CapabilityInspectionDTO>> {
  const start = Date.now();
  try {
    const cap = await inspectCapability(capabilityId);
    if (!cap) {
      const metadata = await createMetadata('inspectCapability', persona, start);
      return governedEmpty(`Capability "${capabilityId}" not found in the registry.`, metadata);
    }

    const def = getCapabilityDefinition(capabilityId);
    const relatedObjects: RelatedObjectRef[] = (cap.relationships ?? []).map(rel => ({
      ref: rel,
      type: 'capability',
      relationship: 'related_to',
    }));

    const health = computeHealth({
      available: true,
      recordCount: 1,
      relationshipCount: relatedObjects.length,
    });

    const metadata = await createMetadata('inspectCapability', persona, start);
    const dto: CapabilityInspectionDTO = {
      metadata,
      capability: {
        capability_id: cap.capability_id,
        name: cap.name,
        category: cap.category,
        description: cap.description,
        status: cap.status,
        owner: cap.owner,
        constitutional_visibility: cap.constitutional_visibility,
      },
      summary: cap.description,
      lifecycle: {
        status: cap.status,
        created_at: cap.created_at,
        updated_at: cap.updated_at,
      },
      related_objects: relatedObjects,
      dependencies: def?.relationships ?? cap.relationships ?? [],
      health,
      constitutional_references: [],
      evidence_references: [],
      confidence: health.inspection_confidence,
      last_updated: cap.updated_at,
    };

    return governedSuccess(dto, metadata, health);
  } catch (err) {
    const metadata = await createMetadata('inspectCapability', persona, start);
    return governedEmpty(`Unable to inspect capability "${capabilityId}".`, metadata);
  }
}

// ─── Pages ───────────────────────────────────────────────────────────────────────

const KNOWN_PAGES = [
  { id: 'mission-control', name: 'Mission Control', type: 'dashboard', status: 'active' },
  { id: 'work-orders', name: 'Work Orders', type: 'list', status: 'active' },
  { id: 'engineering-planning', name: 'Engineering Planning', type: 'planning', status: 'active' },
  { id: 'records-library', name: 'Records Library', type: 'library', status: 'active' },
  { id: 'historical-bootstrap', name: 'Historical Bootstrap', type: 'tool', status: 'active' },
  { id: 'constitution', name: 'Constitution', type: 'governance', status: 'active' },
  { id: 'engineering-standards', name: 'Engineering Standards', type: 'governance', status: 'active' },
  { id: 'engineering-reviews', name: 'Engineering Reviews', type: 'review', status: 'active' },
  { id: 'change-log', name: 'Change Log', type: 'log', status: 'active' },
  { id: 'eig-graph', name: 'Engineering Intelligence Graph', type: 'graph', status: 'active' },
  { id: 'engineering-intelligence', name: 'Engineering Intelligence', type: 'intelligence', status: 'active' },
  { id: 'engineering-integrity', name: 'Engineering Integrity', type: 'integrity', status: 'active' },
  { id: 'verification-dashboard', name: 'Verification Dashboard', type: 'verification', status: 'active' },
  { id: 'atd-connect', name: 'ATD Connect', type: 'platform', status: 'active' },
];

export async function listPages(persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const items: ListItemDTO[] = KNOWN_PAGES.map(p => ({
    id: p.id,
    ref: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
    summary: `${p.name} — ${p.type} page in the Engineering Control Centre.`,
  }));
  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listPages', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'pages', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectPage(pageId: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const page = KNOWN_PAGES.find(p => p.id === pageId || p.id === pageId.toLowerCase());
  if (!page) {
    const metadata = await createMetadata('inspectPage', persona, start);
    return governedEmpty(`Page "${pageId}" not found.`, metadata);
  }
  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectPage', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'pages',
    object_ref: page.id,
    object_type: 'page',
    summary: `${page.name} — ${page.type} page in the Engineering Control Centre.`,
    details: { name: page.name, type: page.type, status: page.status },
    lifecycle: { status: page.status, created_at: null, updated_at: null },
    related_objects: [],
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: null,
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Workspaces ─────────────────────────────────────────────────────────────────

const KNOWN_WORKSPACES = [
  { id: 'engineering', name: 'Engineering Control Centre', type: 'workspace', status: 'active', description: 'The primary engineering workspace for EIOS governance and execution.' },
  { id: 'assessment', name: 'Assessment Workspace', type: 'workspace', status: 'active', description: 'Assessment management and candidate evaluation workspace.' },
  { id: 'trainer', name: 'Trainer Workspace', type: 'workspace', status: 'active', description: 'Trainer dashboard and student management workspace.' },
  { id: 'platform', name: 'Platform Admin', type: 'workspace', status: 'active', description: 'Platform administration and configuration workspace.' },
];

export async function listWorkspaces(persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const items: ListItemDTO[] = KNOWN_WORKSPACES.map(w => ({
    id: w.id,
    ref: w.id,
    name: w.name,
    type: w.type,
    status: w.status,
    summary: w.description,
  }));
  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listWorkspaces', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'workspaces', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectWorkspace(workspaceId: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const ws = KNOWN_WORKSPACES.find(w => w.id === workspaceId || w.id === workspaceId.toLowerCase());
  if (!ws) {
    const metadata = await createMetadata('inspectWorkspace', persona, start);
    return governedEmpty(`Workspace "${workspaceId}" not found.`, metadata);
  }
  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectWorkspace', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'workspaces',
    object_ref: ws.id,
    object_type: 'workspace',
    summary: ws.description,
    details: { name: ws.name, type: ws.type, status: ws.status },
    lifecycle: { status: ws.status, created_at: null, updated_at: null },
    related_objects: [],
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: null,
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Services ───────────────────────────────────────────────────────────────────

export async function listServices(persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('ecc_module_registry')
    .select('module_key, name, description, status')
    .order('name');

  if (error) {
    const metadata = await createMetadata('listServices', persona, start);
    return governedEmpty('Unable to retrieve platform services.', metadata);
  }

  const items: ListItemDTO[] = (data ?? []).map((s: Record<string, unknown>) => ({
    id: String(s.module_key ?? ''),
    ref: String(s.module_key ?? ''),
    name: String(s.name ?? 'Unknown'),
    type: 'service',
    status: String(s.status ?? 'unknown'),
    summary: String(s.description ?? ''),
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listServices', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'services', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectService(serviceId: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('ecc_module_registry')
    .select('*')
    .eq('module_key', serviceId)
    .maybeSingle();

  if (error || !data) {
    const metadata = await createMetadata('inspectService', persona, start);
    return governedEmpty(`Service "${serviceId}" not found.`, metadata);
  }

  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectService', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'services',
    object_ref: String(data.module_key ?? serviceId),
    object_type: 'service',
    summary: String(data.description ?? data.name ?? serviceId),
    details: data as Record<string, unknown>,
    lifecycle: { status: String(data.status ?? 'unknown'), created_at: null, updated_at: null },
    related_objects: [],
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: null,
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Standards ───────────────────────────────────────────────────────────────────

export async function listStandards(persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('ecc_engineering_standards')
    .select('id, standard_code, title, description, status')
    .order('standard_code');

  if (error) {
    const metadata = await createMetadata('listStandards', persona, start);
    return governedEmpty('Unable to retrieve engineering standards.', metadata);
  }

  const items: ListItemDTO[] = (data ?? []).map((s: Record<string, unknown>) => ({
    id: String(s.id ?? ''),
    ref: String(s.standard_code ?? ''),
    name: String(s.title ?? 'Unknown'),
    type: 'standard',
    status: String(s.status ?? 'unknown'),
    summary: String(s.description ?? ''),
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listStandards', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'standards', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectStandard(standardRef: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('ecc_engineering_standards')
    .select('*')
    .or(`standard_code.eq.${standardRef},id.eq.${standardRef}`)
    .maybeSingle();

  if (error || !data) {
    const metadata = await createMetadata('inspectStandard', persona, start);
    return governedEmpty(`Standard "${standardRef}" not found.`, metadata);
  }

  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectStandard', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'standards',
    object_ref: String(data.standard_code ?? standardRef),
    object_type: 'standard',
    summary: String(data.description ?? data.title ?? standardRef),
    details: data as Record<string, unknown>,
    lifecycle: { status: String(data.status ?? 'unknown'), created_at: null, updated_at: null },
    related_objects: [],
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: null,
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Constitution ────────────────────────────────────────────────────────────────

export async function listConstitution(persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('constitutional_documents')
    .select('id, amendment_id, title, status, description')
    .order('amendment_id');

  if (error) {
    const metadata = await createMetadata('listConstitution', persona, start);
    return governedEmpty('Unable to retrieve constitutional documents.', metadata);
  }

  const items: ListItemDTO[] = (data ?? []).map((c: Record<string, unknown>) => ({
    id: String(c.id ?? ''),
    ref: String(c.amendment_id ?? ''),
    name: String(c.title ?? 'Unknown'),
    type: 'constitutional_amendment',
    status: String(c.status ?? 'unknown'),
    summary: String(c.description ?? ''),
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listConstitution', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'constitution', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectConstitution(amendmentId: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('constitutional_documents')
    .select('*')
    .or(`amendment_id.eq.${amendmentId},id.eq.${amendmentId}`)
    .maybeSingle();

  if (error || !data) {
    const metadata = await createMetadata('inspectConstitution', persona, start);
    return governedEmpty(`Constitutional amendment "${amendmentId}" not found.`, metadata);
  }

  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectConstitution', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'constitution',
    object_ref: String(data.amendment_id ?? amendmentId),
    object_type: 'constitutional_amendment',
    summary: String(data.description ?? data.title ?? amendmentId),
    details: data as Record<string, unknown>,
    lifecycle: { status: String(data.status ?? 'unknown'), created_at: null, updated_at: null },
    related_objects: [],
    dependencies: [],
    health,
    constitutional_references: [{
      amendment_id: String(data.amendment_id ?? ''),
      title: String(data.title ?? ''),
      visibility: 'public',
    }],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: null,
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Engineering Records ─────────────────────────────────────────────────────────

export async function listEngineeringRecords(persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('engineering_records_library')
    .select('id, record_ref, record_type, title, status, ewo_ref, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    const metadata = await createMetadata('listEngineeringRecords', persona, start);
    return governedEmpty('Unable to retrieve engineering records.', metadata);
  }

  const items: ListItemDTO[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id ?? ''),
    ref: String(r.record_ref ?? ''),
    name: String(r.title ?? 'Untitled'),
    type: String(r.record_type ?? 'unknown'),
    status: String(r.status ?? 'unknown'),
    summary: `${r.record_type ?? 'record'} — ${r.title ?? 'Untitled'} (${r.ewo_ref ?? 'no EWO'})`,
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listEngineeringRecords', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'engineering-records', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectEngineeringRecord(recordRef: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('engineering_records_library')
    .select('*')
    .eq('record_ref', recordRef)
    .maybeSingle();

  if (error || !data) {
    const metadata = await createMetadata('inspectEngineeringRecord', persona, start);
    return governedEmpty(`Engineering record "${recordRef}" not found.`, metadata);
  }

  const { data: lineageData } = await supabase
    .from('engineering_record_lineage')
    .select('from_record_ref, to_ref, relationship_type')
    .or(`from_record_ref.eq.${recordRef},to_ref.eq.${recordRef}`)
    .limit(20);

  const relatedObjects: RelatedObjectRef[] = (lineageData ?? []).map((l: Record<string, unknown>) => ({
    ref: String(l.to_ref ?? l.from_record_ref ?? ''),
    type: 'record',
    relationship: String(l.relationship_type ?? 'related_to'),
  }));

  const health = computeHealth({ available: true, recordCount: 1, relationshipCount: relatedObjects.length });
  const metadata = await createMetadata('inspectEngineeringRecord', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'engineering-records',
    object_ref: String(data.record_ref ?? recordRef),
    object_type: String(data.record_type ?? 'record'),
    summary: String(data.title ?? recordRef),
    details: data as Record<string, unknown>,
    lifecycle: {
      status: String(data.status ?? 'unknown'),
      created_at: data.created_at ?? null,
      updated_at: data.updated_at ?? null,
    },
    related_objects: relatedObjects,
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: data.updated_at ?? data.created_at ?? null,
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Engineering Work Orders ─────────────────────────────────────────────────────

export async function listEngineeringWorkOrders(persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, lifecycle_state, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    const metadata = await createMetadata('listEngineeringWorkOrders', persona, start);
    return governedEmpty('Unable to retrieve engineering work orders.', metadata);
  }

  const items: ListItemDTO[] = (data ?? []).map((w: Record<string, unknown>) => ({
    id: String(w.id ?? ''),
    ref: String(w.ewo_ref ?? ''),
    name: String(w.title ?? 'Untitled'),
    type: 'engineering_work_order',
    status: String(w.lifecycle_state ?? w.status ?? 'unknown'),
    summary: `${w.ewo_ref ?? ''} — ${w.title ?? 'Untitled'}`,
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listEngineeringWorkOrders', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'engineering-work-orders', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectEngineeringWorkOrder(ewoRef: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();

  // Canonical reference resolution: exact match preferred, then normalisation
  const resolution = await resolveEngineeringWorkOrder(ewoRef);

  if (!resolution.resolved || !resolution.canonical_ref) {
    const metadata = await createMetadata('inspectEngineeringWorkOrder', persona, start);
    if (resolution.ambiguous) {
      return governedEmpty(`Ambiguous reference "${ewoRef}". Multiple matches: ${resolution.candidates.join(', ')}.`, metadata);
    }
    return governedEmpty(`Engineering work order "${ewoRef}" not found. ${resolution.explanation}`, metadata);
  }

  const canonicalRef = resolution.canonical_ref;
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('*')
    .eq('ewo_ref', canonicalRef)
    .maybeSingle();

  if (error || !data) {
    const metadata = await createMetadata('inspectEngineeringWorkOrder', persona, start);
    return governedEmpty(`Engineering work order "${ewoRef}" not found after resolution to "${canonicalRef}".`, metadata);
  }

  const { data: records } = await supabase
    .from('engineering_records_library')
    .select('record_ref, record_type, title')
    .eq('ewo_ref', canonicalRef)
    .limit(20);

  const relatedObjects: RelatedObjectRef[] = (records ?? []).map((r: Record<string, unknown>) => ({
    ref: String(r.record_ref ?? ''),
    type: String(r.record_type ?? 'record'),
    relationship: 'produces',
  }));

  // EWO-028R.1: Include knowledge extraction summary
  let knowledgeExtractionSummary: Record<string, unknown> | null = null;
  const { data: keExtraction } = await supabase
    .from('engineering_knowledge_extractions')
    .select('id, extraction_status, knowledge_records_created, knowledge_records_merged, knowledge_records_skipped, extracted_at')
    .eq('ewo_id', data.id)
    .maybeSingle();
  if (keExtraction) {
    const { count: provCount } = await supabase
      .from('engineering_knowledge_provenance')
      .select('*', { count: 'exact', head: true })
      .eq('ewo_id', data.id);
    knowledgeExtractionSummary = {
      extraction_status: keExtraction.extraction_status,
      knowledge_count: keExtraction.knowledge_records_created + keExtraction.knowledge_records_merged,
      knowledge_records_created: keExtraction.knowledge_records_created,
      knowledge_records_merged: keExtraction.knowledge_records_merged,
      knowledge_records_skipped: keExtraction.knowledge_records_skipped,
      extracted_at: keExtraction.extracted_at,
      provenance_records: provCount || 0,
      extraction_id: keExtraction.id,
      completion_report_linked: !!data.accepted_completion_report_id,
    };
  } else {
    knowledgeExtractionSummary = {
      extraction_status: data.knowledge_extraction_status || 'not_extracted',
      knowledge_count: 0,
      provenance_records: 0,
      completion_report_linked: !!data.accepted_completion_report_id,
    };
  }

  const enrichedDetails = {
    ...data,
    knowledge_extraction: knowledgeExtractionSummary,
  };

  // Add knowledge relationships to related objects
  if (knowledgeExtractionSummary && (knowledgeExtractionSummary.provenance_records as number) > 0) {
    relatedObjects.push({ ref: `knowledge:${canonicalRef}`, type: 'knowledge', relationship: 'extracted_knowledge' });
  }

  const health = computeHealth({ available: true, recordCount: 1, relationshipCount: relatedObjects.length });
  const metadata = await createMetadata('inspectEngineeringWorkOrder', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'engineering-work-orders',
    object_ref: String(data.ewo_ref ?? ewoRef),
    object_type: 'engineering_work_order',
    summary: String(data.title ?? ewoRef),
    details: enrichedDetails as Record<string, unknown>,
    lifecycle: {
      status: String(data.lifecycle_state ?? data.status ?? 'unknown'),
      created_at: data.created_at ?? null,
      updated_at: data.updated_at ?? null,
    },
    related_objects: relatedObjects,
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: data.updated_at ?? data.created_at ?? null,
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Acceptance Governance Inspection (EWO-030R.5) ────────────────────────────────

export async function inspectEngineeringWorkOrderAcceptanceGovernance(
  ewoRef: string,
  persona: string = DEFAULT_PERSONA,
): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();

  const resolution = await resolveEngineeringWorkOrder(ewoRef);
  if (!resolution.resolved || !resolution.canonical_ref) {
    const metadata = await createMetadata('inspectEngineeringWorkOrderAcceptanceGovernance', persona, start);
    return governedEmpty(`Engineering work order "${ewoRef}" not found. ${resolution.explanation}`, metadata);
  }

  const canonicalRef = resolution.canonical_ref;

  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('inspect_ewo_acceptance_state', { p_ewo_ref: canonicalRef });

  if (rpcError || !rpcResult) {
    const metadata = await createMetadata('inspectEngineeringWorkOrderAcceptanceGovernance', persona, start);
    return governedEmpty(`Unable to inspect acceptance governance for "${canonicalRef}": ${rpcError?.message ?? 'RPC returned no data'}`, metadata);
  }

  const state = rpcResult as Record<string, unknown>;

  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectEngineeringWorkOrderAcceptanceGovernance', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'engineering-work-orders',
    object_ref: canonicalRef,
    object_type: 'acceptance_governance',
    summary: `Acceptance governance state for ${canonicalRef}`,
    details: state,
    lifecycle: {
      status: String((state.current_lifecycle_state as Record<string, unknown>)?.status ?? 'unknown'),
      created_at: null,
      updated_at: null,
    },
    related_objects: [],
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: null,
  };

  return governedSuccess(dto, metadata, health);
}

// ─── Engineering Plans ───────────────────────────────────────────────────────────

export async function listEngineeringPlans(persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('epre_recommendations')
    .select('id, ewo_ref, recommendation_type, status, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    const metadata = await createMetadata('listEngineeringPlans', persona, start);
    return governedEmpty('Unable to retrieve engineering plans.', metadata);
  }

  const items: ListItemDTO[] = (data ?? []).map((p: Record<string, unknown>) => ({
    id: String(p.id ?? ''),
    ref: String(p.ewo_ref ?? p.id ?? ''),
    name: String(p.recommendation_type ?? 'Plan'),
    type: 'engineering_plan',
    status: String(p.status ?? 'unknown'),
    summary: String(p.summary ?? ''),
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listEngineeringPlans', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'engineering-plans', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectEngineeringPlan(planId: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('epre_recommendations')
    .select('*')
    .or(`id.eq.${planId},ewo_ref.eq.${planId}`)
    .maybeSingle();

  if (error || !data) {
    const metadata = await createMetadata('inspectEngineeringPlan', persona, start);
    return governedEmpty(`Engineering plan "${planId}" not found.`, metadata);
  }

  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectEngineeringPlan', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'engineering-plans',
    object_ref: String(data.ewo_ref ?? data.id ?? planId),
    object_type: 'engineering_plan',
    summary: String(data.summary ?? ''),
    details: data as Record<string, unknown>,
    lifecycle: {
      status: String(data.status ?? 'unknown'),
      created_at: data.created_at ?? null,
      updated_at: null,
    },
    related_objects: [],
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: data.created_at ?? null,
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Memory ──────────────────────────────────────────────────────────────────────

export async function listMemory(persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('engineering_memory')
    .select('id, record_ref, title, knowledge_category, authority_state, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    const metadata = await createMetadata('listMemory', persona, start);
    return governedEmpty('Unable to retrieve engineering memory.', metadata);
  }

  const items: ListItemDTO[] = (data ?? []).map((m: Record<string, unknown>) => ({
    id: String(m.id ?? ''),
    ref: String(m.record_ref ?? ''),
    name: String(m.title ?? 'Untitled'),
    type: 'memory',
    status: String(m.authority_state ?? 'unknown'),
    summary: `${m.knowledge_category ?? 'memory'} — ${m.title ?? 'Untitled'}`,
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listMemory', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'memory', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectMemory(memoryId: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('engineering_memory')
    .select('*')
    .or(`id.eq.${memoryId},record_ref.eq.${memoryId}`)
    .maybeSingle();

  if (error || !data) {
    const metadata = await createMetadata('inspectMemory', persona, start);
    return governedEmpty(`Memory entry "${memoryId}" not found.`, metadata);
  }

  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectMemory', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'memory',
    object_ref: String(data.record_ref ?? data.id ?? memoryId),
    object_type: 'memory',
    summary: String(data.title ?? ''),
    details: data as Record<string, unknown>,
    lifecycle: {
      status: String(data.authority_state ?? 'unknown'),
      created_at: data.created_at ?? null,
      updated_at: null,
    },
    related_objects: [],
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: data.created_at ?? null,
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Knowledge ────────────────────────────────────────────────────────────────────

export async function listKnowledge(persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('ecc_knowledge_objects')
    .select('id, title, knowledge_type, status, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    const metadata = await createMetadata('listKnowledge', persona, start);
    return governedEmpty('Unable to retrieve engineering knowledge.', metadata);
  }

  const items: ListItemDTO[] = (data ?? []).map((k: Record<string, unknown>) => ({
    id: String(k.id ?? ''),
    ref: String(k.id ?? ''),
    name: String(k.title ?? 'Untitled'),
    type: String(k.knowledge_type ?? 'knowledge'),
    status: String(k.status ?? 'unknown'),
    summary: String(k.summary ?? ''),
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listKnowledge', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'knowledge', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectKnowledge(knowledgeId: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('ecc_knowledge_objects')
    .select('*')
    .eq('id', knowledgeId)
    .maybeSingle();

  if (error || !data) {
    const metadata = await createMetadata('inspectKnowledge', persona, start);
    return governedEmpty(`Knowledge object "${knowledgeId}" not found.`, metadata);
  }

  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectKnowledge', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'knowledge',
    object_ref: String(data.id ?? knowledgeId),
    object_type: String(data.knowledge_type ?? 'knowledge'),
    summary: String(data.summary ?? data.title ?? ''),
    details: data as Record<string, unknown>,
    lifecycle: {
      status: String(data.status ?? 'unknown'),
      created_at: data.created_at ?? null,
      updated_at: null,
    },
    related_objects: [],
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: data.created_at ?? null,
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Lineage ──────────────────────────────────────────────────────────────────────

export async function listLineage(persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ListInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('engineering_record_lineage')
    .select('id, from_record_ref, to_ref, relationship_type, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    const metadata = await createMetadata('listLineage', persona, start);
    return governedEmpty('Unable to retrieve engineering lineage.', metadata);
  }

  const items: ListItemDTO[] = (data ?? []).map((l: Record<string, unknown>) => ({
    id: String(l.id ?? ''),
    ref: String(l.id ?? ''),
    name: `${l.from_record_ref ?? ''} → ${l.to_ref ?? ''}`,
    type: 'lineage',
    status: String(l.relationship_type ?? 'related_to'),
    summary: `${l.from_record_ref ?? ''} ${l.relationship_type ?? '→'} ${l.to_ref ?? ''}`,
  }));

  const health = computeHealth({ available: true, recordCount: items.length });
  const metadata = await createMetadata('listLineage', persona, start);
  const dto: ListInspectionDTO = { metadata, capability_id: 'lineage', items, total_count: items.length, health };
  return governedSuccess(dto, metadata, health);
}

export async function inspectLineage(lineageId: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('engineering_record_lineage')
    .select('*')
    .eq('id', lineageId)
    .maybeSingle();

  if (error || !data) {
    const metadata = await createMetadata('inspectLineage', persona, start);
    return governedEmpty(`Lineage entry "${lineageId}" not found.`, metadata);
  }

  const health = computeHealth({ available: true, recordCount: 1 });
  const metadata = await createMetadata('inspectLineage', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'lineage',
    object_ref: String(data.id ?? lineageId),
    object_type: 'lineage',
    summary: `${data.from_record_ref ?? ''} ${data.relationship_type ?? '→'} ${data.to_ref ?? ''}`,
    details: data as Record<string, unknown>,
    lifecycle: { status: 'active', created_at: data.created_at ?? null, updated_at: null },
    related_objects: [
      { ref: String(data.from_record_ref ?? ''), type: 'record', relationship: 'from' },
      { ref: String(data.to_ref ?? ''), type: 'record', relationship: 'to' },
    ],
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: data.created_at ?? null,
  };
  return governedSuccess(dto, metadata, health);
}

// ─── Relationship Navigation ──────────────────────────────────────────────────────

export async function inspectRelationships(objectRef: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<RelationshipInspectionDTO>> {
  const start = Date.now();

  const { data: lineageData, error } = await supabase
    .from('engineering_record_lineage')
    .select('id, from_record_ref, to_ref, relationship_type')
    .or(`from_record_ref.eq.${objectRef},to_ref.eq.${objectRef}`)
    .limit(50);

  if (error) {
    const metadata = await createMetadata('inspectRelationships', persona, start);
    return governedEmpty(`Unable to inspect relationships for "${objectRef}".`, metadata);
  }

  const relationships: RelatedObjectRef[] = (lineageData ?? []).map((l: Record<string, unknown>) => ({
    ref: String(l.from_record_ref === objectRef ? l.to_ref : l.from_record_ref),
    type: 'record',
    relationship: String(l.relationship_type ?? 'related_to'),
  }));

  // EWO-028R.1: Include engineering knowledge relationships
  let knowledgeRelationships: RelatedObjectRef[] = [];
  if (objectRef.startsWith('EWO-')) {
    const { data: keProv } = await supabase
      .from('engineering_knowledge_provenance')
      .select('knowledge_record_id')
      .eq('ewo_ref', objectRef);
    if (keProv && keProv.length > 0) {
      const recordIds = keProv.map((p: { knowledge_record_id: string }) => p.knowledge_record_id);
      const { data: keMemories } = await supabase
        .from('engineering_memory')
        .select('id, knowledge_category, title')
        .in('id', recordIds);
      knowledgeRelationships = (keMemories || []).map((m: Record<string, unknown>) => ({
        ref: `knowledge:${m.id}`,
        type: 'knowledge',
        relationship: 'extracted_knowledge',
      }));
    }
  }

  const allRelationships = [...relationships, ...knowledgeRelationships];
  const nodeIds = new Set<string>([objectRef, ...allRelationships.map(r => r.ref)]);
  const nodes = Array.from(nodeIds).map(id => ({ id, type: 'record', label: id }));
  const edges = (lineageData ?? []).map((l: Record<string, unknown>) => ({
    from: String(l.from_record_ref ?? ''),
    to: String(l.to_ref ?? ''),
    type: String(l.relationship_type ?? 'related_to'),
  }));
  // Add knowledge edges
  for (const kr of knowledgeRelationships) {
    edges.push({ from: objectRef, to: kr.ref, type: 'extracted_knowledge' });
  }

  const health = computeHealth({
    available: true,
    recordCount: allRelationships.length,
    relationshipCount: allRelationships.length,
    hasWarnings: allRelationships.length === 0,
  });

  const metadata = await createMetadata('inspectRelationships', persona, start);
  const dto: RelationshipInspectionDTO = {
    metadata,
    object_ref: objectRef,
    object_type: 'record',
    relationships: allRelationships,
    relationship_graph: { nodes, edges },
    health,
    confidence: health.inspection_confidence,
  };

  return governedSuccess(dto, metadata, health);
}

// ─── Knowledge Extraction Inspection (EWO-028R.1) ─────────────────────────────────

export async function inspectKnowledgeExtraction(ewoRef: string, persona: string = DEFAULT_PERSONA): Promise<GovernedResponse<ObjectInspectionDTO>> {
  const start = Date.now();

  const resolution = await resolveEngineeringWorkOrder(ewoRef);
  if (!resolution.resolved || !resolution.canonical_ref) {
    const metadata = await createMetadata('inspectKnowledgeExtraction', persona, start);
    return governedEmpty(`Engineering work order "${ewoRef}" not found. ${resolution.explanation}`, metadata);
  }

  const canonicalRef = resolution.canonical_ref;
  const { data: ewo, error: ewoErr } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, knowledge_extraction_status, accepted_completion_report_id, report_generation_status, implementation_status, engineering_package_status, po_accepted_at, po_accepted_by')
    .eq('ewo_ref', canonicalRef)
    .maybeSingle();

  if (ewoErr || !ewo) {
    const metadata = await createMetadata('inspectKnowledgeExtraction', persona, start);
    return governedEmpty(`Engineering work order "${ewoRef}" not found after resolution to "${canonicalRef}".`, metadata);
  }

  // Extraction record
  const { data: extraction } = await supabase
    .from('engineering_knowledge_extractions')
    .select('*')
    .eq('ewo_id', ewo.id)
    .maybeSingle();

  // Completion report
  let completionReport: Record<string, unknown> | null = null;
  if (ewo.accepted_completion_report_id) {
    const { data: cr } = await supabase
      .from('ewo_completion_reports')
      .select('id, title, executive_summary, generated_at, accepted_at, accepted_by')
      .eq('id', ewo.accepted_completion_report_id)
      .maybeSingle();
    completionReport = cr as Record<string, unknown> | null;
  }

  // Provenance + knowledge records
  const { data: provenance } = await supabase
    .from('engineering_knowledge_provenance')
    .select('knowledge_record_id, ewo_ref, implementation_version, completion_report_id, acceptance_audit_reference, extraction_id, extraction_timestamp')
    .eq('ewo_id', ewo.id);

  let knowledgeRecords: Record<string, unknown>[] = [];
  const knowledgeCategories: string[] = [];
  if (provenance && provenance.length > 0) {
    const recordIds = provenance.map((p: { knowledge_record_id: string }) => p.knowledge_record_id);
    const { data: memories } = await supabase
      .from('engineering_memory')
      .select('id, knowledge_category, title, content, tags, source_section, authority_state, created_at')
      .in('id', recordIds);
    knowledgeRecords = (memories || []).map((m: Record<string, unknown>) => {
      const prov = provenance.find((p: { knowledge_record_id: string }) => p.knowledge_record_id === m.id);
      return { ...m, provenance: prov };
    });
    const catSet = new Set<string>();
    for (const r of knowledgeRecords) {
      if (r.knowledge_category) catSet.add(String(r.knowledge_category));
    }
    knowledgeCategories.push(...catSet);
  }

  // Reconciliation history
  const { data: reconHistory } = await supabase
    .from('lifecycle_reconciliation_log')
    .select('*')
    .eq('ewo_id', ewo.id)
    .order('reconciled_at', { ascending: false });

  // Linkage integrity
  const linkageIntegrity = {
    completion_report_linked: !!completionReport,
    completion_report_id: ewo.accepted_completion_report_id || null,
    extraction_recorded: !!extraction,
    extraction_status: extraction?.extraction_status || ewo.knowledge_extraction_status || 'not_extracted',
    provenance_records: provenance?.length || 0,
  };

  // Dedup/merge/skip stats
  const dedupStats = {
    records_created: extraction?.knowledge_records_created ?? 0,
    records_merged: extraction?.knowledge_records_merged ?? 0,
    records_skipped: extraction?.knowledge_records_skipped ?? 0,
  };

  const details: Record<string, unknown> = {
    ewo_ref: canonicalRef,
    ewo_title: ewo.title,
    ewo_status: ewo.status,
    knowledge_extraction_status: ewo.knowledge_extraction_status || 'not_extracted',
    extraction_timestamp: extraction?.extracted_at || null,
    extraction_id: extraction?.id || null,
    completion_report_linkage: {
      linked: !!completionReport,
      completion_report_id: ewo.accepted_completion_report_id || null,
      report_storage_location: completionReport ? 'ewo_completion_reports' : null,
    },
    knowledge_record_count: knowledgeRecords.length,
    knowledge_categories: knowledgeCategories,
    knowledge_records: knowledgeRecords,
    provenance_records: provenance || [],
    deduplication_statistics: dedupStats,
    merge_statistics: { records_merged: dedupStats.records_merged },
    skipped_statistics: { records_skipped: dedupStats.records_skipped },
    linkage_integrity: linkageIntegrity,
    extraction_diagnostics: extraction?.extraction_diagnostics || null,
    lifecycle_reconciliation_status: (reconHistory && reconHistory.length > 0) ? 'reconciled' : 'not_reconciled',
    lifecycle_reconciliation_history: reconHistory || [],
    runtime_diagnostics: {
      extraction_method: extraction?.extraction_method || 'unavailable',
      implementation_version: provenance?.[0]?.implementation_version || 'unavailable',
      acceptance_verified: !!ewo.po_accepted_at,
      governed: true,
    },
  };

  const relatedObjects: RelatedObjectRef[] = [];
  if (completionReport) {
    relatedObjects.push({ ref: String(ewo.accepted_completion_report_id), type: 'completion_report', relationship: 'linked' });
  }
  for (const r of knowledgeRecords) {
    relatedObjects.push({ ref: `knowledge:${r.id}`, type: 'knowledge', relationship: 'extracted_knowledge' });
  }

  const health = computeHealth({
    available: true,
    recordCount: 1 + knowledgeRecords.length,
    relationshipCount: relatedObjects.length,
  });
  const metadata = await createMetadata('inspectKnowledgeExtraction', persona, start);
  const dto: ObjectInspectionDTO = {
    metadata,
    capability_id: 'engineering-work-orders',
    object_ref: canonicalRef,
    object_type: 'knowledge_extraction',
    summary: `Knowledge extraction for ${canonicalRef} — ${ewo.knowledge_extraction_status || 'not extracted'}`,
    details,
    lifecycle: {
      status: ewo.knowledge_extraction_status || 'not_extracted',
      created_at: extraction?.created_at ?? null,
      updated_at: extraction?.extracted_at ?? null,
    },
    related_objects: relatedObjects,
    dependencies: [],
    health,
    constitutional_references: [],
    evidence_references: [],
    confidence: health.inspection_confidence,
    last_updated: extraction?.extracted_at ?? null,
  };

  return governedSuccess(dto, metadata, health);
}
