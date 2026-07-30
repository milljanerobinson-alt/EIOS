/**
 * Engineering Lifecycle Engine — EWO-011.4B
 *
 * Reusable governed lifecycle management for all Engineering Objects in EIOS.
 * Current consumers: Engineering Intents, Engineering Plans.
 * Future consumers: Goals, Epics, Ideas, EWOs, Releases, Standards, Decisions, Risks, etc.
 *
 * Lifecycle model:
 *   active → completed → archived → deleted (soft) → restored → purged (future)
 *
 * Design principles:
 * - Generic: object type + table name registration, no per-object business logic here.
 * - Immutable audit: every transition writes to engineering_lifecycle_events.
 * - Soft delete only: no physical row removal.
 * - Dependency validation: callers pass a resolver; cascades run as one governed operation.
 * - Graph integration: caller-supplied EIG retire hook.
 */

import { supabase } from './supabase';
import * as EIGService from './eigService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LifecycleStatus = 'active' | 'completed' | 'archived' | 'deleted' | 'purged';
export type LifecycleTransition = 'delete' | 'restore' | 'archive' | 'complete' | 'purge';

export interface LifecycleEvent {
  id: string;
  event_ref: string;
  object_type: string;
  object_id: string;
  object_ref: string | null;
  from_status: LifecycleStatus;
  to_status: LifecycleStatus;
  transition: LifecycleTransition;
  actor: string;
  reason: string | null;
  source_interface: string | null;
  linked_objects: LinkedObject[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LinkedObject {
  object_type: string;
  object_id: string;
  object_ref: string | null;
  transition: LifecycleTransition;
}

/** Registered configuration for each lifecycle-managed Engineering Object type. */
export interface ObjectTypeConfig {
  /** Supabase table name */
  table: string;
  /** Human-readable label for UI and audit messages */
  label: string;
  /** Field that holds the display ref (e.g. 'intent_ref', 'plan_ref') */
  refField: string;
  /** Field containing the object's own FK to its parent (used for dependency lookups) */
  parentFkField?: string;
  /** EIG entity_type value linked to this object (for graph retirement) */
  eigEntityType?: string;
  /** Field on eig_entities that links to this object's ID */
  eigLinkedRecordType?: string;
}

export interface DependencyInfo {
  dependents: Array<{
    objectType: string;
    objectId: string;
    objectRef: string | null;
    label: string;
  }>;
  count: number;
}

export interface DeleteInput {
  objectType: string;
  objectId: string;
  reason: string;
  actor?: string;
  sourceInterface?: string;
  /** If true, cascade-delete all resolved dependents in one governed operation. */
  cascade?: boolean;
  /** Resolved dependents to cascade. Must be pre-validated by caller (via resolveDependencies). */
  cascadeDependents?: Array<{ objectType: string; objectId: string }>;
}

export interface RestoreInput {
  objectType: string;
  objectId: string;
  reason: string;
  actor?: string;
  sourceInterface?: string;
}

export interface LifecycleResult {
  success: boolean;
  event: LifecycleEvent | null;
  cascadeEvents: LifecycleEvent[];
  error?: string;
}

export interface DuplicateCheckResult {
  status: 'none' | 'active_duplicate' | 'archived_duplicate' | 'deleted_duplicate';
  existingId?: string;
  existingRef?: string;
  existingLifecycleStatus?: LifecycleStatus;
}

// ─── Object Type Registry ─────────────────────────────────────────────────────

const REGISTRY: Record<string, ObjectTypeConfig> = {
  intent: {
    table:                'atd_engineering_intents',
    label:                'Engineering Intent',
    refField:             'intent_ref',
    eigEntityType:        'engineering_intent',
    eigLinkedRecordType:  'intent',
  },
  plan: {
    table:                'atd_engineering_plans',
    label:                'Engineering Plan',
    refField:             'plan_ref',
    parentFkField:        'intent_id',
    eigEntityType:        'engineering_plan',
    eigLinkedRecordType:  'plan',
  },
};

/** Register a new Engineering Object type with the lifecycle engine. */
export function registerObjectType(key: string, config: ObjectTypeConfig): void {
  REGISTRY[key] = config;
}

export function getObjectConfig(objectType: string): ObjectTypeConfig {
  const cfg = REGISTRY[objectType];
  if (!cfg) throw new Error(`No lifecycle configuration registered for object type: ${objectType}`);
  return cfg;
}

// ─── Event ref generator ──────────────────────────────────────────────────────

async function nextEventRef(): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { count } = await supabase
    .from('engineering_lifecycle_events')
    .select('*', { count: 'exact', head: true });
  const n = ((count ?? 0) + 1).toString().padStart(3, '0');
  return `LCE-${date}-${n}`;
}

// ─── Core: fetch current state ────────────────────────────────────────────────

async function fetchObject(objectType: string, objectId: string): Promise<{
  id: string;
  lifecycle_status: LifecycleStatus;
  refValue: string | null;
} | null> {
  const cfg = getObjectConfig(objectType);
  const { data } = await supabase
    .from(cfg.table)
    .select(`id, lifecycle_status, ${cfg.refField}`)
    .eq('id', objectId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    lifecycle_status: (data.lifecycle_status ?? 'active') as LifecycleStatus,
    refValue: data[cfg.refField] ?? null,
  };
}

// ─── Audit event writer ───────────────────────────────────────────────────────

async function writeLifecycleEvent(input: {
  objectType: string;
  objectId: string;
  objectRef: string | null;
  fromStatus: LifecycleStatus;
  toStatus: LifecycleStatus;
  transition: LifecycleTransition;
  actor: string;
  reason: string | null;
  sourceInterface: string | null;
  linkedObjects: LinkedObject[];
  metadata?: Record<string, unknown>;
}): Promise<LifecycleEvent> {
  const event_ref = await nextEventRef();
  const { data, error } = await supabase
    .from('engineering_lifecycle_events')
    .insert({
      event_ref,
      object_type: input.objectType,
      object_id: input.objectId,
      object_ref: input.objectRef,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      transition: input.transition,
      actor: input.actor,
      reason: input.reason,
      source_interface: input.sourceInterface,
      linked_objects: input.linkedObjects,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return data as LifecycleEvent;
}

// ─── Graph lifecycle integration ──────────────────────────────────────────────

async function retireGraphNodes(objectType: string, objectId: string): Promise<void> {
  const cfg = getObjectConfig(objectType);
  if (!cfg.eigLinkedRecordType) return;

  const { data: entities } = await supabase
    .from('eig_entities')
    .select('id')
    .eq('linked_record_id', objectId)
    .eq('linked_record_type', cfg.eigLinkedRecordType)
    .neq('status', 'archived');

  if (!entities?.length) return;

  const entityIds = entities.map(e => e.id);

  // Retire all linked nodes
  await supabase
    .from('eig_entities')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .in('id', entityIds);

  // Retire all edges that connect to/from those nodes
  if (entityIds.length > 0) {
    await Promise.all([
      supabase
        .from('eig_relationships')
        .delete()
        .in('from_entity_id', entityIds),
      supabase
        .from('eig_relationships')
        .delete()
        .in('to_entity_id', entityIds),
    ]);
  }
}

async function restoreGraphNodes(objectType: string, objectId: string): Promise<void> {
  const cfg = getObjectConfig(objectType);
  if (!cfg.eigLinkedRecordType) return;

  await supabase
    .from('eig_entities')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('linked_record_id', objectId)
    .eq('linked_record_type', cfg.eigLinkedRecordType)
    .eq('status', 'archived');
}

// ─── Dependency resolution ────────────────────────────────────────────────────

/**
 * Resolve direct dependents of an object that will need to be cascade-deleted.
 * Currently supports: intent → plans.
 */
export async function resolveDependencies(
  objectType: string,
  objectId: string,
): Promise<DependencyInfo> {
  const dependents: DependencyInfo['dependents'] = [];

  if (objectType === 'intent') {
    const { data: plans } = await supabase
      .from('atd_engineering_plans')
      .select('id, plan_ref, lifecycle_status')
      .eq('intent_id', objectId)
      .neq('lifecycle_status', 'deleted');

    for (const p of plans ?? []) {
      dependents.push({
        objectType: 'plan',
        objectId: p.id,
        objectRef: p.plan_ref ?? null,
        label: getObjectConfig('plan').label,
      });
    }
  }

  return { dependents, count: dependents.length };
}

// ─── Lifecycle-aware duplicate detection ──────────────────────────────────────

/**
 * Check whether a similar object already exists, inspecting its lifecycle state.
 * `titleField` is queried with case-insensitive matching.
 */
export async function checkForDuplicate(
  objectType: string,
  titleOrRef: string,
  titleField: string = 'title',
): Promise<DuplicateCheckResult> {
  const cfg = getObjectConfig(objectType);
  const { data } = await supabase
    .from(cfg.table)
    .select(`id, ${cfg.refField}, lifecycle_status`)
    .ilike(titleField, titleOrRef.trim())
    .order('created_at', { ascending: false })
    .limit(1);

  if (!data?.length) return { status: 'none' };

  const existing = data[0];
  const ls = (existing.lifecycle_status ?? 'active') as LifecycleStatus;

  if (ls === 'active' || ls === 'completed') {
    return {
      status: 'active_duplicate',
      existingId: existing.id,
      existingRef: existing[cfg.refField],
      existingLifecycleStatus: ls,
    };
  }
  if (ls === 'archived') {
    return {
      status: 'archived_duplicate',
      existingId: existing.id,
      existingRef: existing[cfg.refField],
      existingLifecycleStatus: ls,
    };
  }
  if (ls === 'deleted') {
    return {
      status: 'deleted_duplicate',
      existingId: existing.id,
      existingRef: existing[cfg.refField],
      existingLifecycleStatus: ls,
    };
  }

  return { status: 'none' };
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export async function deleteObject(input: DeleteInput): Promise<LifecycleResult> {
  const {
    objectType, objectId, reason,
    actor = 'Product Owner',
    sourceInterface = 'ATD Workspace',
    cascade = false,
    cascadeDependents = [],
  } = input;

  const cfg = getObjectConfig(objectType);
  const obj = await fetchObject(objectType, objectId);
  if (!obj) return { success: false, event: null, cascadeEvents: [], error: 'Object not found.' };
  if (obj.lifecycle_status === 'deleted') {
    return { success: false, event: null, cascadeEvents: [], error: 'Object is already deleted.' };
  }

  const fromStatus = obj.lifecycle_status;
  const now = new Date().toISOString();

  // Build linked_objects for the audit event
  const linkedObjects: LinkedObject[] = cascadeDependents.map(d => ({
    objectType: d.objectType,
    objectId: d.objectId,
    objectRef: null,
    transition: 'delete' as LifecycleTransition,
  }));

  // Write audit event first (before mutations, so lineage is always captured)
  const event = await writeLifecycleEvent({
    objectType,
    objectId,
    objectRef: obj.refValue,
    fromStatus,
    toStatus: 'deleted',
    transition: 'delete',
    actor,
    reason,
    sourceInterface,
    linkedObjects,
  });

  // Soft-delete the primary object
  await supabase
    .from(cfg.table)
    .update({
      lifecycle_status: 'deleted',
      deleted_at: now,
      deleted_by: actor,
      deletion_reason: reason,
      updated_at: now,
    })
    .eq('id', objectId);

  // Retire graph nodes
  await retireGraphNodes(objectType, objectId).catch(() => {});

  // Cascade-delete dependents
  const cascadeEvents: LifecycleEvent[] = [];
  if (cascade && cascadeDependents.length > 0) {
    for (const dep of cascadeDependents) {
      const result = await deleteObject({
        objectType: dep.objectType,
        objectId: dep.objectId,
        reason: `Cascade delete: parent ${cfg.label} ${obj.refValue ?? objectId} was deleted.`,
        actor,
        sourceInterface,
      });
      if (result.event) cascadeEvents.push(result.event);
    }
  }

  return { success: true, event, cascadeEvents };
}

// ─── Restore ─────────────────────────────────────────────────────────────────

export async function restoreObject(input: RestoreInput): Promise<LifecycleResult> {
  const {
    objectType, objectId, reason,
    actor = 'Product Owner',
    sourceInterface = 'ATD Workspace',
  } = input;

  const cfg = getObjectConfig(objectType);
  const obj = await fetchObject(objectType, objectId);
  if (!obj) return { success: false, event: null, cascadeEvents: [], error: 'Object not found.' };
  if (obj.lifecycle_status !== 'deleted' && obj.lifecycle_status !== 'archived') {
    return { success: false, event: null, cascadeEvents: [], error: 'Object is not in a restorable state.' };
  }

  const fromStatus = obj.lifecycle_status;
  const now = new Date().toISOString();

  const event = await writeLifecycleEvent({
    objectType,
    objectId,
    objectRef: obj.refValue,
    fromStatus,
    toStatus: 'active',
    transition: 'restore',
    actor,
    reason,
    sourceInterface,
    linkedObjects: [],
  });

  await supabase
    .from(cfg.table)
    .update({
      lifecycle_status: 'active',
      restored_at: now,
      restored_from_status: fromStatus,
      deleted_at: null,
      updated_at: now,
    })
    .eq('id', objectId);

  await restoreGraphNodes(objectType, objectId).catch(() => {});

  return { success: true, event, cascadeEvents: [] };
}

// ─── Archive ──────────────────────────────────────────────────────────────────

export async function archiveObject(
  objectType: string,
  objectId: string,
  reason: string,
  actor = 'Product Owner',
  sourceInterface = 'ATD Workspace',
): Promise<LifecycleResult> {
  const cfg = getObjectConfig(objectType);
  const obj = await fetchObject(objectType, objectId);
  if (!obj) return { success: false, event: null, cascadeEvents: [], error: 'Object not found.' };
  if (obj.lifecycle_status !== 'active' && obj.lifecycle_status !== 'completed') {
    return { success: false, event: null, cascadeEvents: [], error: 'Only active or completed objects can be archived.' };
  }

  const fromStatus = obj.lifecycle_status;
  const now = new Date().toISOString();

  const event = await writeLifecycleEvent({
    objectType,
    objectId,
    objectRef: obj.refValue,
    fromStatus,
    toStatus: 'archived',
    transition: 'archive',
    actor,
    reason,
    sourceInterface,
    linkedObjects: [],
  });

  await supabase
    .from(cfg.table)
    .update({
      lifecycle_status: 'archived',
      archived_at: now,
      updated_at: now,
    })
    .eq('id', objectId);

  return { success: true, event, cascadeEvents: [] };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/** Get lifecycle event history for an object, newest first. */
export async function getLifecycleHistory(
  objectType: string,
  objectId: string,
): Promise<LifecycleEvent[]> {
  const { data } = await supabase
    .from('engineering_lifecycle_events')
    .select('*')
    .eq('object_type', objectType)
    .eq('object_id', objectId)
    .order('created_at', { ascending: false });
  return (data ?? []) as LifecycleEvent[];
}

/** Get all lifecycle events for the given transition type, newest first. */
export async function getLifecycleEventsByTransition(
  transition: LifecycleTransition,
  limit = 50,
): Promise<LifecycleEvent[]> {
  const { data } = await supabase
    .from('engineering_lifecycle_events')
    .select('*')
    .eq('transition', transition)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as LifecycleEvent[];
}
