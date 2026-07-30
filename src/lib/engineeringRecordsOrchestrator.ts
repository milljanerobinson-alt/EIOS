// EWO-023: Engineering Records Automation & Autonomous Knowledge Capture
//
// The Engineering Records Orchestrator is the single entry point for engineering
// record creation. Whenever an EWO progresses through its lifecycle, the
// orchestrator determines which artefacts should exist and ensures they are
// created, versioned, and related.

import { supabase } from './supabase';
import { recordChangeLogEvent } from './engineeringChangeLogService';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecordType =
  | 'prompt'
  | 'completion_report'
  | 'testing'
  | 'acceptance'
  | 'verification'
  | 'engineering_package'
  | 'engineering_summary'
  | 'timeline_snapshot'
  | 'change_log_entry'
  | 'audit_record'
  | 'architecture_decision'
  | 'constitutional_decision'
  | 'historical_recovery'
  | 'knowledge_extraction'
  | 'release_record';

export type RecordStatus = 'draft' | 'generated' | 'verified' | 'accepted' | 'archived' | 'superseded';

export type CaptureTrigger =
  | 'engineering_complete'
  | 'po_accepted'
  | 'verification_complete'
  | 'package_generated';

export type KnowledgeType =
  | 'institutional_knowledge'
  | 'architecture_decision'
  | 'engineering_pattern'
  | 'lesson_learned';

export type RelationshipType =
  | 'belongs_to'
  | 'produces'
  | 'verifies'
  | 'accepts'
  | 'supersedes'
  | 'related_to'
  | 'extracted_from';

export type TargetType =
  | 'ewo'
  | 'completion_report'
  | 'change_log'
  | 'timeline'
  | 'plan'
  | 'identity'
  | 'record'
  | 'acceptance'
  | 'package';

export interface GeneratedRecord {
  id: string;
  record_ref: string;
  record_type: RecordType;
  title: string;
  status: RecordStatus;
  orchestrator_status: string | null;
  version_number: number;
  record_version: number | null;
  ewo_ref: string | null;
  ewo_id: string | null;
  content: Record<string, unknown>;
  generated_by: string;
  created_at: string;
  updated_at: string | null;
}

export interface RecordVersion {
  id: string;
  record_id: string;
  version_number: number;
  parent_version_id: string | null;
  content: Record<string, unknown>;
  author: string;
  created_at: string;
  replacement_reason: string | null;
}

export interface RecordRelationship {
  id: string;
  source_record_id: string;
  source_ref: string;
  target_type: TargetType;
  target_ref: string;
  target_id: string | null;
  relationship_type: RelationshipType;
  created_at: string;
}

export interface KnowledgeCaptureTask {
  id: string;
  ewo_ref: string;
  ewo_id: string | null;
  capture_trigger: CaptureTrigger;
  record_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  queued_at: string;
  processed_at: string | null;
  knowledge_type: KnowledgeType | null;
  metadata: Record<string, unknown>;
}

export interface RecordHealthAlert {
  id: string;
  ewo_ref: string;
  ewo_id: string | null;
  missing_record_type: RecordType;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'dismissed';
  detected_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface RecordHealthReport {
  ewo_ref: string;
  complete: boolean;
  missing: RecordType[];
  present: RecordType[];
  alerts: RecordHealthAlert[];
}

// ─── REQ-1/2: Engineering Records Orchestrator ────────────────────────────────

/**
 * The main orchestrator entry point. Called whenever an EWO transitions
 * through its lifecycle. Determines which records should exist, generates
 * missing ones, creates relationships, and queues knowledge capture.
 */
export async function orchestrateRecords(
  ewoRef: string,
  lifecycleStage: string,
): Promise<{ generated: string[]; queued: string[]; alerts: RecordHealthAlert[] }> {
  const generated: string[] = [];
  const queued: string[] = [];

  // Fetch EWO
  const { data: ewo, error } = await supabase
    .from('engineering_work_orders')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (error || !ewo) {
    return { generated, queued, alerts: [] };
  }

  const ewoId = ewo.id as string;
  const ewoData = ewo as Record<string, unknown>;

  // Determine which records should exist based on lifecycle stage
  const expectedTypes = getExpectedRecordTypes(lifecycleStage);

  for (const recordType of expectedTypes) {
    const existing = await findRecord(ewoRef, recordType);
    if (!existing) {
      const record = await generateRecord(ewoId, ewoRef, recordType, ewoData);
      if (record) {
        generated.push(record.record_ref);

        // REQ-3: Create relationships
        await createRecordRelationships(record.id, record.record_ref, ewoRef, ewoData);
      }
    }
  }

  // REQ-7: Queue knowledge capture based on lifecycle stage
  const captureTasks = await queueKnowledgeCapture(ewoRef, ewoId, lifecycleStage);
  queued.push(...captureTasks);

  // REQ-11: Run record health check
  const healthReport = await checkRecordHealth(ewoRef, ewoId);

  return { generated, queued, alerts: healthReport.alerts };
}

/**
 * Determine which record types should exist based on lifecycle stage.
 */
function getExpectedRecordTypes(lifecycleStage: string): RecordType[] {
  const base: RecordType[] = ['prompt', 'change_log_entry'];

  switch (lifecycleStage) {
    case 'engineering_approved':
    case 'in_progress':
      return [...base];

    case 'engineering_complete':
      return [...base, 'completion_report', 'engineering_summary', 'engineering_package'];

    case 'engineering_verified':
      return [...base, 'completion_report', 'engineering_summary', 'engineering_package', 'verification'];

    case 'awaiting_po_testing':
    case 'po_testing':
      return [...base, 'completion_report', 'engineering_summary', 'engineering_package', 'verification', 'testing'];

    case 'awaiting_po_acceptance':
      return [...base, 'completion_report', 'engineering_summary', 'engineering_package', 'verification', 'testing'];

    case 'po_accepted':
    case 'closed':
      return [...base, 'completion_report', 'engineering_summary', 'engineering_package', 'verification', 'testing', 'acceptance', 'timeline_snapshot', 'audit_record'];

    default:
      return base;
  }
}

/**
 * Generate a single engineering record.
 */
async function generateRecord(
  ewoId: string,
  ewoRef: string,
  recordType: RecordType,
  ewoData: Record<string, unknown>,
): Promise<GeneratedRecord | null> {
  const { title, content } = buildRecordContent(recordType, ewoRef, ewoData);
  const recordRef = `${ewoRef}-${recordType.toUpperCase().replace(/-/g, '_')}`;

  // Check if record already exists (idempotent)
  const { data: existing } = await supabase
    .from('engineering_records_library')
    .select('id, record_ref')
    .eq('record_ref', recordRef)
    .maybeSingle();

  if (existing) {
    return existing as unknown as GeneratedRecord;
  }

  const insertData = {
    record_ref: recordRef,
    record_type: recordType,
    title,
    ewo_id: ewoId,
    ewo_ref: ewoRef,
    status: 'generated',
    orchestrator_status: 'generated',
    orchestrator_generated: true,
    content: content,
    version_number: 1,
    record_version: 1,
    generated_by: 'Engineering Records Orchestrator',
    governance_status: 'complete',
    knowledge_extracted: false,
    lineage_established: false,
    exports_generated: false,
    is_backfill: false,
    linked_releases: (ewoData.related_releases as string[]) ?? [],
    linked_standards: (ewoData.related_standards as string[]) ?? [],
    implementation_source: (ewoData.implementation_source as string) ?? null,
    parent_refinement_ref: (ewoData.parent_ref as string) ?? null,
  };

  const { data, error } = await supabase
    .from('engineering_records_library')
    .insert(insertData)
    .select('id, record_ref, record_type, title, status, version_number, ewo_ref, ewo_id, content, generated_by, created_at')
    .single();

  if (error || !data) {
    console.error(`[EWO-023] Failed to generate ${recordType} for ${ewoRef}:`, error?.message);
    return null;
  }

  // Record the first version
  await supabase.from('engineering_record_versions').insert({
    record_id: (data as Record<string, unknown>).id as string,
    version_number: 1,
    content: content,
    author: 'Engineering Records Orchestrator',
  });

  // Record change log entry
  await recordChangeLogEvent({
    change_type: 'created',
    object_type: 'engineering_record',
    object_ref: recordRef,
    ewo_ref: ewoRef,
    summary: `Engineering record generated: ${title}`,
    description: `Record type: ${recordType}. Auto-generated by Engineering Records Orchestrator.`,
    actor_type: 'system',
    actor: 'Engineering Records Orchestrator',
    metadata: { record_type: recordType, ewo_ref: ewoRef, auto_generated: true },
  });

  return data as unknown as GeneratedRecord;
}

/**
 * Build the content for a record based on its type and EWO data.
 */
function buildRecordContent(
  recordType: RecordType,
  ewoRef: string,
  ewoData: Record<string, unknown>,
): { title: string; content: Record<string, unknown> } {
  const title = (ewoData.title as string) ?? ewoRef;

  switch (recordType) {
    case 'prompt':
      return {
        title: `Engineering Prompt — ${ewoRef}`,
        content: {
          ewo_ref: ewoRef,
          prompt_ref: (ewoData.originating_prompt_ref as string) ?? `${ewoRef}-prompt`,
          implementation_source: (ewoData.implementation_source as string) ?? 'unknown',
          originating_conversation: (ewoData.originating_conversation_ref as string) ?? null,
          executive_summary: (ewoData.executive_summary as string) ?? '',
        },
      };

    case 'completion_report':
      return {
        title: `Completion Report — ${ewoRef}`,
        content: {
          ewo_ref: ewoRef,
          title,
          executive_summary: (ewoData.executive_summary as string) ?? '',
          implementation_status: (ewoData.implementation_status as string) ?? '',
          implementation_summary: (ewoData.implementation_summary as string) ?? '',
          changed_files: (ewoData.changed_files as unknown[]) ?? [],
          build_result: 'pending',
          test_result: 'pending',
          risks: '',
          po_decisions: '',
        },
      };

    case 'testing':
      return {
        title: `Product Owner Testing Record — ${ewoRef}`,
        content: {
          ewo_ref: ewoRef,
          testing_status: (ewoData.po_testing_status as string) ?? 'pending',
          testing_started_at: null,
          testing_completed_at: (ewoData.po_testing_completed_at as string) ?? null,
          test_results: [],
          notes: '',
        },
      };

    case 'acceptance':
      return {
        title: `Product Owner Acceptance Record — ${ewoRef}`,
        content: {
          ewo_ref: ewoRef,
          accepted_by: (ewoData.po_accepted_by as string) ?? null,
          accepted_at: (ewoData.po_accepted_at as string) ?? null,
          acceptance_statement: (ewoData.po_acceptance_statement as string) ?? null,
          accepted_completion_report_id: (ewoData.accepted_completion_report_id as string) ?? null,
          accepted_refinement_version: (ewoData.accepted_refinement_version as string) ?? null,
        },
      };

    case 'verification':
      return {
        title: `Engineering Verification Summary — ${ewoRef}`,
        content: {
          ewo_ref: ewoRef,
          verification_status: (ewoData.verification_status as string) ?? 'not_started',
          verified_at: (ewoData.verified_at as string) ?? null,
          unit_verification: (ewoData.unit_verification_status as string) ?? 'not_run',
          integration_verification: (ewoData.integration_verification_status as string) ?? 'not_run',
          end_to_end_verification: (ewoData.end_to_end_verification_status as string) ?? 'not_run',
          product_owner_verification: (ewoData.product_owner_verification_status as string) ?? 'not_run',
        },
      };

    case 'engineering_package':
      return {
        title: `Engineering Package — ${ewoRef}`,
        content: {
          ewo_ref: ewoRef,
          title,
          engineering_objectives: (ewoData.engineering_objective as string) ?? '',
          implementation_scope: (ewoData.scope as string) ?? '',
          acceptance_criteria: (ewoData.validation_requirements as string) ?? '',
          implementation_notes: (ewoData.implementation_notes as string) ?? '',
          constitutional_references: (ewoData.related_standards as string[]) ?? [],
        },
      };

    case 'engineering_summary':
      return {
        title: `Engineering Summary — ${ewoRef}`,
        content: {
          ewo_ref: ewoRef,
          title,
          executive_summary: (ewoData.executive_summary as string) ?? '',
          business_objective: (ewoData.business_objective as string) ?? '',
          engineering_objective: (ewoData.engineering_objective as string) ?? '',
          implementation_status: (ewoData.implementation_status as string) ?? '',
        },
      };

    case 'timeline_snapshot':
      return {
        title: `Timeline Snapshot — ${ewoRef}`,
        content: {
          ewo_ref: ewoRef,
          snapshot_at: new Date().toISOString(),
          lifecycle_events: [],
        },
      };

    case 'change_log_entry':
      return {
        title: `Change Log Entry — ${ewoRef}`,
        content: {
          ewo_ref: ewoRef,
          change_type: 'created',
          summary: `Engineering records orchestrated for ${ewoRef}`,
          description: `Auto-generated change log entry by Engineering Records Orchestrator`,
        },
      };

    case 'audit_record':
      return {
        title: `Engineering Audit Record — ${ewoRef}`,
        content: {
          ewo_ref: ewoRef,
          audit_type: 'records_orchestration',
          audited_at: new Date().toISOString(),
          records_generated: [],
          records_missing: [],
        },
      };

    default:
      return {
        title: `${recordType} — ${ewoRef}`,
        content: { ewo_ref: ewoRef, title },
      };
  }
}

// ─── REQ-3: Record Relationships ──────────────────────────────────────────────

async function createRecordRelationships(
  recordId: string,
  recordRef: string,
  ewoRef: string,
  ewoData: Record<string, unknown>,
): Promise<void> {
  const relationships: Array<{ target_type: TargetType; target_ref: string; relationship_type: RelationshipType }> = [
    { target_type: 'ewo', target_ref: ewoRef, relationship_type: 'belongs_to' },
    { target_type: 'change_log', target_ref: ewoRef, relationship_type: 'related_to' },
    { target_type: 'timeline', target_ref: ewoRef, relationship_type: 'related_to' },
  ];

  // Add parent refinement relationship if applicable
  const parentRef = (ewoData.parent_ref as string) ?? null;
  if (parentRef) {
    relationships.push({ target_type: 'ewo', target_ref: parentRef, relationship_type: 'related_to' });
  }

  // Add completion report relationship
  relationships.push({ target_type: 'completion_report', target_ref: ewoRef, relationship_type: 'related_to' });

  for (const rel of relationships) {
    await supabase.from('engineering_record_relationships').insert({
      source_record_id: recordId,
      source_ref: recordRef,
      target_type: rel.target_type,
      target_ref: rel.target_ref,
      relationship_type: rel.relationship_type,
    });
  }
}

// ─── REQ-5: Record Versioning ─────────────────────────────────────────────────

export async function createRecordVersion(
  recordId: string,
  newContent: Record<string, unknown>,
  author: string,
  replacementReason: string,
): Promise<RecordVersion | null> {
  // Get current version number
  const { data: current } = await supabase
    .from('engineering_records_library')
    .select('id, version_number, record_version, content')
    .eq('id', recordId)
    .maybeSingle();

  if (!current) return null;

  const currentVersion = (current as Record<string, unknown>).record_version as number ?? 1;
  const newVersion = currentVersion + 1;

  // Create version snapshot of the OLD content (immutable history)
  await supabase.from('engineering_record_versions').insert({
    record_id: recordId,
    version_number: currentVersion,
    content: (current as Record<string, unknown>).content as Record<string, unknown>,
    author: author,
    replacement_reason: replacementReason,
  });

  // Update the record with new content and version
  const { error } = await supabase
    .from('engineering_records_library')
    .update({
      content: newContent,
      record_version: newVersion,
      version_number: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recordId);

  if (error) {
    console.error('[EWO-023] Failed to create new version:', error.message);
    return null;
  }

  return {
    id: '',
    record_id: recordId,
    version_number: newVersion,
    parent_version_id: null,
    content: newContent,
    author,
    created_at: new Date().toISOString(),
    replacement_reason: replacementReason,
  };
}

export async function getRecordVersions(recordId: string): Promise<RecordVersion[]> {
  const { data, error } = await supabase
    .from('engineering_record_versions')
    .select('*')
    .eq('record_id', recordId)
    .order('version_number', { ascending: false });

  if (error || !data) return [];
  return data as unknown as RecordVersion[];
}

// ─── REQ-6: Record Status ─────────────────────────────────────────────────────

export async function updateRecordStatus(
  recordId: string,
  status: RecordStatus,
): Promise<{ success: boolean; error?: string }> {
  const updates: Record<string, unknown> = {
    orchestrator_status: status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'archived') {
    updates.archived_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('engineering_records_library')
    .update(updates)
    .eq('id', recordId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── REQ-7: Knowledge Capture Events ──────────────────────────────────────────

export async function queueKnowledgeCapture(
  ewoRef: string,
  ewoId: string,
  lifecycleStage: string,
): Promise<string[]> {
  const queued: string[] = [];

  let trigger: CaptureTrigger | null = null;
  let knowledgeType: KnowledgeType | null = null;

  switch (lifecycleStage) {
    case 'engineering_complete':
      trigger = 'engineering_complete';
      knowledgeType = 'institutional_knowledge';
      break;
    case 'po_accepted':
    case 'closed':
      trigger = 'po_accepted';
      knowledgeType = 'institutional_knowledge';
      break;
    case 'engineering_verified':
      trigger = 'verification_complete';
      knowledgeType = 'engineering_pattern';
      break;
    default:
      return queued;
  }

  if (!trigger) return queued;

  // Check if already queued (idempotent)
  const { data: existing } = await supabase
    .from('knowledge_capture_queue')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .eq('capture_trigger', trigger)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    queued.push((existing as Record<string, unknown>).id as string);
    return queued;
  }

  const { data, error } = await supabase
    .from('knowledge_capture_queue')
    .insert({
      ewo_ref: ewoRef,
      ewo_id: ewoId,
      capture_trigger: trigger,
      status: 'pending',
      knowledge_type: knowledgeType,
      metadata: { lifecycle_stage: lifecycleStage, queued_by: 'Engineering Records Orchestrator' },
    })
    .select('id')
    .single();

  if (!error && data) {
    queued.push((data as Record<string, unknown>).id as string);
  }

  return queued;
}

export async function getPendingKnowledgeCaptures(): Promise<KnowledgeCaptureTask[]> {
  const { data, error } = await supabase
    .from('knowledge_capture_queue')
    .select('*')
    .eq('status', 'pending')
    .order('queued_at', { ascending: true });

  if (error || !data) return [];
  return data as unknown as KnowledgeCaptureTask[];
}

export async function completeKnowledgeCapture(
  taskId: string,
  extractedKnowledge: Record<string, unknown>,
): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from('knowledge_capture_queue')
    .update({
      status: 'completed',
      processed_at: new Date().toISOString(),
      metadata: { extracted: extractedKnowledge },
    })
    .eq('id', taskId);

  return { success: !error };
}

// ─── REQ-8/9: Records Library & Search ────────────────────────────────────────

export async function getRecordsForEwo(ewoRef: string): Promise<GeneratedRecord[]> {
  const { data, error } = await supabase
    .from('engineering_records_library')
    .select('id, record_ref, record_type, title, status, orchestrator_status, version_number, record_version, ewo_ref, ewo_id, content, generated_by, created_at, updated_at')
    .eq('ewo_ref', ewoRef)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as unknown as GeneratedRecord[];
}

export async function searchEngineeringRecords(
  query: string,
): Promise<Array<{
  id: string;
  record_ref: string;
  record_type: string;
  title: string;
  ewo_ref: string | null;
  status: string;
  version_number: number;
  created_at: string;
}>> {
  const { data, error } = await supabase
    .from('engineering_records_library')
    .select('id, record_ref, record_type, title, ewo_ref, status, version_number, created_at')
    .or(`record_ref.ilike.%${query}%,title.ilike.%${query}%,ewo_ref.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return data as Array<{
    id: string;
    record_ref: string;
    record_type: string;
    title: string;
    ewo_ref: string | null;
    status: string;
    version_number: number;
    created_at: string;
  }>;
}

export async function getRecordRelationships(recordRef: string): Promise<RecordRelationship[]> {
  const { data, error } = await supabase
    .from('engineering_record_relationships')
    .select('*')
    .eq('source_ref', recordRef)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as unknown as RecordRelationship[];
}

export async function getRelatedRecords(ewoRef: string): Promise<RecordRelationship[]> {
  const { data, error } = await supabase
    .from('engineering_record_relationships')
    .select('*')
    .eq('target_ref', ewoRef)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as unknown as RecordRelationship[];
}

// ─── REQ-10: Engineering Package Automation ───────────────────────────────────

export async function assembleEngineeringPackage(ewoRef: string): Promise<{
  success: boolean;
  package_ref: string | null;
  error?: string;
}> {
  const records = await getRecordsForEwo(ewoRef);
  if (records.length === 0) {
    return { success: false, package_ref: null, error: 'No records found for EWO' };
  }

  const packageRef = `${ewoRef}-PACKAGE`;
  const packageContent = {
    ewo_ref: ewoRef,
    assembled_at: new Date().toISOString(),
    prompt: records.find(r => r.record_type === 'prompt')?.content ?? null,
    completion_report: records.find(r => r.record_type === 'completion_report')?.content ?? null,
    testing_summary: records.find(r => r.record_type === 'testing')?.content ?? null,
    verification: records.find(r => r.record_type === 'verification')?.content ?? null,
    acceptance: records.find(r => r.record_type === 'acceptance')?.content ?? null,
    engineering_summary: records.find(r => r.record_type === 'engineering_summary')?.content ?? null,
    timeline_snapshot: records.find(r => r.record_type === 'timeline_snapshot')?.content ?? null,
    audit_record: records.find(r => r.record_type === 'audit_record')?.content ?? null,
  };

  // Check if package record already exists
  const { data: existing } = await supabase
    .from('engineering_records_library')
    .select('id')
    .eq('record_ref', packageRef)
    .maybeSingle();

  if (existing) {
    // Update existing package
    const { error } = await supabase
      .from('engineering_records_library')
      .update({
        content: packageContent,
        updated_at: new Date().toISOString(),
      })
      .eq('record_ref', packageRef);

    if (error) return { success: false, package_ref: packageRef, error: error.message };
    return { success: true, package_ref: packageRef };
  }

  // Create new package record
  const { data: ewo } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  const { error } = await supabase
    .from('engineering_records_library')
    .insert({
      record_ref: packageRef,
      record_type: 'engineering_package',
      title: `Engineering Package — ${ewoRef}`,
      ewo_id: (ewo as Record<string, unknown>)?.id as string ?? null,
      ewo_ref: ewoRef,
      status: 'generated',
      orchestrator_status: 'generated',
      orchestrator_generated: true,
      content: packageContent,
      version_number: 1,
      record_version: 1,
      generated_by: 'Engineering Records Orchestrator',
      governance_status: 'complete',
      knowledge_extracted: false,
      lineage_established: false,
      exports_generated: false,
      is_backfill: false,
      linked_releases: [],
      linked_standards: [],
    });

  if (error) return { success: false, package_ref: null, error: error.message };
  return { success: true, package_ref: packageRef };
}

// ─── REQ-11: Record Health Engine ─────────────────────────────────────────────

export async function checkRecordHealth(
  ewoRef: string,
  ewoId: string,
): Promise<RecordHealthReport> {
  // Get all records for this EWO
  const records = await getRecordsForEwo(ewoRef);
  const presentTypes = new Set(records.map(r => r.record_type as RecordType));

  // Determine expected types based on EWO status
  const { data: ewo } = await supabase
    .from('engineering_work_orders')
    .select('status')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  const ewoStatus = ((ewo as Record<string, unknown>)?.status as string) ?? 'draft';
  const expectedTypes = getExpectedRecordTypes(ewoStatus);

  const missing: RecordType[] = [];
  const present: RecordType[] = [];

  for (const type of expectedTypes) {
    if (presentTypes.has(type)) {
      present.push(type);
    } else {
      missing.push(type);
    }
  }

  // Create/update alerts for missing records
  const alerts: RecordHealthAlert[] = [];
  for (const missingType of missing) {
    // Check if alert already exists
    const { data: existingAlert } = await supabase
      .from('engineering_record_health_alerts')
      .select('*')
      .eq('ewo_ref', ewoRef)
      .eq('missing_record_type', missingType)
      .eq('status', 'open')
      .maybeSingle();

    if (existingAlert) {
      alerts.push(existingAlert as unknown as RecordHealthAlert);
      continue;
    }

    // Determine severity
    const severity: 'low' | 'medium' | 'high' = isRequiredForClosure(missingType) ? 'high' : 'medium';

    const { data: alert } = await supabase
      .from('engineering_record_health_alerts')
      .insert({
        ewo_ref: ewoRef,
        ewo_id: ewoId,
        missing_record_type: missingType,
        severity,
        status: 'open',
        metadata: { ewo_status: ewoStatus, detected_by: 'Record Health Engine' },
      })
      .select('*')
      .single();

    if (alert) {
      alerts.push(alert as unknown as RecordHealthAlert);
    }
  }

  // Resolve alerts for records that are now present
  for (const presentType of present) {
    const { data: openAlert } = await supabase
      .from('engineering_record_health_alerts')
      .select('*')
      .eq('ewo_ref', ewoRef)
      .eq('missing_record_type', presentType)
      .eq('status', 'open')
      .maybeSingle();

    if (openAlert) {
      await supabase
        .from('engineering_record_health_alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_note: 'Record now present',
        })
        .eq('id', (openAlert as Record<string, unknown>).id as string);
    }
  }

  return {
    ewo_ref: ewoRef,
    complete: missing.length === 0,
    missing,
    present,
    alerts,
  };
}

export async function getHealthAlerts(ewoRef: string): Promise<RecordHealthAlert[]> {
  const { data, error } = await supabase
    .from('engineering_record_health_alerts')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .order('detected_at', { ascending: false });

  if (error || !data) return [];
  return data as unknown as RecordHealthAlert[];
}

function isRequiredForClosure(recordType: RecordType): boolean {
  const required: RecordType[] = ['prompt', 'completion_report', 'acceptance', 'verification', 'engineering_package', 'change_log_entry'];
  return required.includes(recordType);
}

// ─── REQ-4: Record Types ──────────────────────────────────────────────────────

export async function getRecordTypes(): Promise<Array<{
  type_key: string;
  label: string;
  description: string | null;
  auto_generated: boolean;
  required_for_closure: boolean;
}>> {
  const { data, error } = await supabase
    .from('engineering_record_types')
    .select('type_key, label, description, auto_generated, required_for_closure')
    .order('type_key');

  if (error || !data) return [];
  return data as Array<{
    type_key: string;
    label: string;
    description: string | null;
    auto_generated: boolean;
    required_for_closure: boolean;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findRecord(ewoRef: string, recordType: RecordType): Promise<GeneratedRecord | null> {
  const { data, error } = await supabase
    .from('engineering_records_library')
    .select('id, record_ref, record_type, title, status, version_number, ewo_ref, ewo_id, content, generated_by, created_at')
    .eq('ewo_ref', ewoRef)
    .eq('record_type', recordType)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as GeneratedRecord;
}

// ─── REQ-12: Future Knowledge Ready ────────────────────────────────────────────

/**
 * Extract knowledge-ready metadata from an EWO and its records.
 * Designed for EWO-024 Knowledge Extraction to consume without schema redesign.
 */
export async function extractKnowledgeMetadata(ewoRef: string): Promise<{
  ewo_ref: string;
  architecture_decisions: string[];
  engineering_patterns: string[];
  constitutional_decisions: string[];
  reusable_techniques: string[];
  lessons_learned: string[];
  engineering_domains: string[];
  subsystems: string[];
  technologies: string[];
}> {
  const records = await getRecordsForEwo(ewoRef);

  const architecture_decisions: string[] = [];
  const engineering_patterns: string[] = [];
  const constitutional_decisions: string[] = [];
  const reusable_techniques: string[] = [];
  const lessons_learned: string[] = [];
  const engineering_domains: string[] = [];
  const subsystems: string[] = [];
  const technologies: string[] = [];

  for (const record of records) {
    const content = record.content as Record<string, unknown>;
    const knowledge = content.engineering_knowledge as Record<string, unknown> | undefined;

    if (knowledge) {
      if (Array.isArray(knowledge.architectural_decisions)) {
        architecture_decisions.push(...knowledge.architectural_decisions as string[]);
      }
      if (Array.isArray(knowledge.engineering_patterns)) {
        engineering_patterns.push(...knowledge.engineering_patterns as string[]);
      }
      if (Array.isArray(knowledge.lessons_learned)) {
        lessons_learned.push(...knowledge.lessons_learned as string[]);
      }
      if (Array.isArray(knowledge.reusable_components)) {
        reusable_techniques.push(...knowledge.reusable_components as string[]);
      }
    }

    const semantic = content.semantic_metadata as Record<string, unknown> | undefined;
    if (semantic) {
      if (Array.isArray(semantic.engineering_domains)) {
        engineering_domains.push(...semantic.engineering_domains as string[]);
      }
      if (Array.isArray(semantic.subsystems)) {
        subsystems.push(...semantic.subsystems as string[]);
      }
      if (Array.isArray(semantic.technologies)) {
        technologies.push(...semantic.technologies as string[]);
      }
    }
  }

  return {
    ewo_ref: ewoRef,
    architecture_decisions: [...new Set(architecture_decisions)],
    engineering_patterns: [...new Set(engineering_patterns)],
    constitutional_decisions: [...new Set(constitutional_decisions)],
    reusable_techniques: [...new Set(reusable_techniques)],
    lessons_learned: [...new Set(lessons_learned)],
    engineering_domains: [...new Set(engineering_domains)],
    subsystems: [...new Set(subsystems)],
    technologies: [...new Set(technologies)],
  };
}
