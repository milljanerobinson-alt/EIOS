/**
 * Engineering Intelligence Graph (EIG) Service
 *
 * CRUD and query operations for the EIG subsystem:
 *   - eig_entities   — graph nodes (all engineering artefacts)
 *   - eig_relationships — directed edges between nodes
 *   - eig_impact_analyses — structured impact reports
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EntityStatus = 'active' | 'planned' | 'deprecated' | 'archived';

export type EntityType =
  | 'mission' | 'release' | 'ewo' | 'engineering_review' | 'specification'
  | 'platform_module' | 'ui_page' | 'component' | 'database_table'
  | 'api_endpoint' | 'audit' | 'benchmark' | 'test_plan'
  | 'risk' | 'recommendation' | 'technical_debt' | 'roadmap_item';

export type RelationshipType =
  | 'depends_on' | 'implements' | 'extends' | 'replaces' | 'uses'
  | 'owned_by' | 'validated_by' | 'covered_by' | 'tests' | 'produces'
  | 'consumes' | 'related_to' | 'blocks' | 'supersedes'
  | 'introduced_in_release' | 'deprecated_by' | 'referenced_by'
  | 'supports' | 'impacts';

export type AnalysisStatus = 'pending' | 'generating' | 'complete' | 'failed';

export interface EigEntity {
  id: string;
  entity_type: string;
  entity_ref: string | null;
  name: string;
  description: string | null;
  status: string;
  version: string | null;
  properties: Record<string, unknown>;
  tags: string[];
  linked_record_id: string | null;
  linked_record_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface EigRelationship {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  relationship_type: string;
  strength: number;
  description: string | null;
  properties: Record<string, unknown>;
  is_automatic: boolean;
  created_at: string;
}

export interface ImpactAnalysis {
  id: string;
  trigger_entity_id: string | null;
  trigger_ref: string | null;
  trigger_type: string;
  analysis_status: string;
  summary: string | null;
  affected_systems: string[];
  affected_components: string[];
  dependency_changes: string[];
  risks: string[];
  complexity_score: number | null;
  effort_estimate: string | null;
  implementation_order: string[];
  testing_requirements: string[];
  release_implications: string | null;
  governance_implications: string | null;
  confidence_score: number | null;
  supporting_evidence: string[];
  raw_analysis: Record<string, unknown> | null;
  generated_at: string | null;
  created_at: string;
}

export interface GraphData {
  entities: EigEntity[];
  relationships: EigRelationship[];
}

export interface EntityWithRelationships {
  entity: EigEntity;
  outgoing: Array<{ rel: EigRelationship; target: EigEntity }>;
  incoming: Array<{ rel: EigRelationship; source: EigEntity }>;
}

export interface GraphStats {
  totalEntities: number;
  totalRelationships: number;
  byType: Record<string, number>;
  mostConnected: Array<{ entity: EigEntity; connectionCount: number }>;
}

// ─── Entity labels ────────────────────────────────────────────────────────────

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  mission:           'Mission',
  release:           'Release',
  ewo:               'Engineering Work Order',
  engineering_review:'Engineering Review',
  specification:     'Specification',
  platform_module:   'Platform Module',
  ui_page:           'UI Page',
  component:         'Component',
  database_table:    'Database Table',
  api_endpoint:      'API Endpoint',
  audit:             'Audit',
  benchmark:         'Benchmark',
  test_plan:         'Test Plan',
  risk:              'Risk',
  recommendation:    'Recommendation',
  technical_debt:    'Technical Debt',
  roadmap_item:      'Roadmap Item',
};

export const ENTITY_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string; node: string }> = {
  mission:           { bg: 'bg-violet-100', text: 'text-violet-800', dot: 'bg-violet-500', node: '#7c3aed' },
  release:           { bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500', node: '#059669' },
  ewo:               { bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500', node: '#2563eb' },
  engineering_review:{ bg: 'bg-cyan-100', text: 'text-cyan-800', dot: 'bg-cyan-500', node: '#0891b2' },
  specification:     { bg: 'bg-indigo-100', text: 'text-indigo-800', dot: 'bg-indigo-500', node: '#4f46e5' },
  platform_module:   { bg: 'bg-teal-100', text: 'text-teal-800', dot: 'bg-teal-500', node: '#0d9488' },
  ui_page:           { bg: 'bg-sky-100', text: 'text-sky-800', dot: 'bg-sky-500', node: '#0284c7' },
  component:         { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400', node: '#3b82f6' },
  database_table:    { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500', node: '#d97706' },
  api_endpoint:      { bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500', node: '#ea580c' },
  audit:             { bg: 'bg-rose-100', text: 'text-rose-800', dot: 'bg-rose-500', node: '#e11d48' },
  benchmark:         { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', dot: 'bg-fuchsia-500', node: '#a21caf' },
  test_plan:         { bg: 'bg-lime-100', text: 'text-lime-800', dot: 'bg-lime-500', node: '#65a30d' },
  risk:              { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500', node: '#dc2626' },
  recommendation:    { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500', node: '#16a34a' },
  technical_debt:    { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500', node: '#ca8a04' },
  roadmap_item:      { bg: 'bg-pink-100', text: 'text-pink-800', dot: 'bg-pink-500', node: '#db2777' },
};

export const RELATIONSHIP_LABELS: Record<string, string> = {
  depends_on:           'Depends On',
  implements:           'Implements',
  extends:              'Extends',
  replaces:             'Replaces',
  uses:                 'Uses',
  owned_by:             'Owned By',
  validated_by:         'Validated By',
  covered_by:           'Covered By',
  tests:                'Tests',
  produces:             'Produces',
  consumes:             'Consumes',
  related_to:           'Related To',
  blocks:               'Blocks',
  supersedes:           'Supersedes',
  introduced_in_release:'Introduced In Release',
  deprecated_by:        'Deprecated By',
  referenced_by:        'Referenced By',
  supports:             'Supports',
  impacts:              'Impacts',
};

// ─── Entity type tier for layout ──────────────────────────────────────────────

export const ENTITY_TYPE_TIER: Record<string, number> = {
  mission:           0,
  release:           1,
  ewo:               2,
  engineering_review:2,
  specification:     2,
  platform_module:   3,
  audit:             3,
  benchmark:         3,
  test_plan:         3,
  ui_page:           4,
  component:         4,
  database_table:    4,
  api_endpoint:      4,
  risk:              5,
  technical_debt:    5,
  recommendation:    5,
  roadmap_item:      5,
};

// ─── Graph data ───────────────────────────────────────────────────────────────

export async function loadGraphData(): Promise<GraphData> {
  const [entitiesRes, relRes] = await Promise.all([
    supabase.from('eig_entities').select('*').order('entity_type').order('created_at'),
    supabase.from('eig_relationships').select('*').order('created_at'),
  ]);
  return {
    entities: (entitiesRes.data ?? []) as EigEntity[],
    relationships: (relRes.data ?? []) as EigRelationship[],
  };
}

// ─── Entity CRUD ──────────────────────────────────────────────────────────────

export async function loadEntities(filters?: {
  entityType?: string;
  status?: string;
  search?: string;
}): Promise<EigEntity[]> {
  let q = supabase.from('eig_entities').select('*');
  if (filters?.entityType) q = q.eq('entity_type', filters.entityType);
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.search) q = q.ilike('name', `%${filters.search}%`);
  q = q.order('entity_type').order('name');
  const { data } = await q;
  return (data ?? []) as EigEntity[];
}

export async function createEntity(input: {
  entity_type: string;
  name: string;
  entity_ref?: string;
  description?: string;
  status?: string;
  properties?: Record<string, unknown>;
  tags?: string[];
}): Promise<EigEntity | null> {
  const { data } = await supabase
    .from('eig_entities')
    .insert({ ...input, status: input.status ?? 'active' })
    .select()
    .single();
  return data as EigEntity | null;
}

export async function updateEntity(id: string, updates: Partial<Omit<EigEntity, 'id' | 'created_at'>>): Promise<EigEntity | null> {
  const { data } = await supabase
    .from('eig_entities')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return data as EigEntity | null;
}

export async function deleteEntity(id: string): Promise<void> {
  await supabase.from('eig_entities').delete().eq('id', id);
}

/** Retire an entity (soft-archive) rather than physically deleting it. */
export async function retireEntity(id: string): Promise<void> {
  await supabase
    .from('eig_entities')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id);
}

/** Retire all entities linked to a specific record (by linked_record_id + linked_record_type). */
export async function retireEntitiesForRecord(
  linkedRecordId: string,
  linkedRecordType: string,
): Promise<void> {
  const { data: entities } = await supabase
    .from('eig_entities')
    .select('id')
    .eq('linked_record_id', linkedRecordId)
    .eq('linked_record_type', linkedRecordType);

  const ids = (entities ?? []).map(e => e.id);
  if (ids.length === 0) return;

  await supabase
    .from('eig_entities')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .in('id', ids);

  await Promise.all([
    supabase.from('eig_relationships').delete().in('from_entity_id', ids),
    supabase.from('eig_relationships').delete().in('to_entity_id', ids),
  ]);
}

/** Restore previously archived entities for a record. */
export async function restoreEntitiesForRecord(
  linkedRecordId: string,
  linkedRecordType: string,
): Promise<void> {
  await supabase
    .from('eig_entities')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('linked_record_id', linkedRecordId)
    .eq('linked_record_type', linkedRecordType)
    .eq('status', 'archived');
}

export async function getEntityWithRelationships(id: string): Promise<EntityWithRelationships | null> {
  const [entityRes, outRes, inRes] = await Promise.all([
    supabase.from('eig_entities').select('*').eq('id', id).maybeSingle(),
    supabase.from('eig_relationships').select('*').eq('from_entity_id', id),
    supabase.from('eig_relationships').select('*').eq('to_entity_id', id),
  ]);
  if (!entityRes.data) return null;

  const outgoing = outRes.data ?? [];
  const incoming = inRes.data ?? [];
  const targetIds = outgoing.map(r => r.to_entity_id);
  const sourceIds = incoming.map(r => r.from_entity_id);
  const allIds = [...new Set([...targetIds, ...sourceIds])];

  let relatedEntities: EigEntity[] = [];
  if (allIds.length > 0) {
    const { data } = await supabase.from('eig_entities').select('*').in('id', allIds);
    relatedEntities = (data ?? []) as EigEntity[];
  }

  const entityById = Object.fromEntries(relatedEntities.map(e => [e.id, e]));

  return {
    entity: entityRes.data as EigEntity,
    outgoing: outgoing.map(rel => ({ rel: rel as EigRelationship, target: entityById[rel.to_entity_id] })).filter(x => x.target),
    incoming: incoming.map(rel => ({ rel: rel as EigRelationship, source: entityById[rel.from_entity_id] })).filter(x => x.source),
  };
}

// ─── Relationship CRUD ────────────────────────────────────────────────────────

export async function createRelationship(input: {
  from_entity_id: string;
  to_entity_id: string;
  relationship_type: string;
  strength?: number;
  description?: string;
  is_automatic?: boolean;
}): Promise<EigRelationship | null> {
  const { data } = await supabase
    .from('eig_relationships')
    .insert({ strength: 1.0, is_automatic: false, ...input })
    .select()
    .single();
  return data as EigRelationship | null;
}

export async function deleteRelationship(id: string): Promise<void> {
  await supabase.from('eig_relationships').delete().eq('id', id);
}

// ─── Impact Analysis CRUD ─────────────────────────────────────────────────────

export async function loadImpactAnalyses(): Promise<ImpactAnalysis[]> {
  const { data } = await supabase
    .from('eig_impact_analyses')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as ImpactAnalysis[];
}

export async function createImpactAnalysis(input: Partial<ImpactAnalysis>): Promise<ImpactAnalysis | null> {
  const { data } = await supabase
    .from('eig_impact_analyses')
    .insert({ analysis_status: 'pending', ...input })
    .select()
    .single();
  return data as ImpactAnalysis | null;
}

export async function updateImpactAnalysis(id: string, updates: Partial<ImpactAnalysis>): Promise<ImpactAnalysis | null> {
  const { data } = await supabase
    .from('eig_impact_analyses')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return data as ImpactAnalysis | null;
}

// ─── Graph statistics ─────────────────────────────────────────────────────────

export function computeGraphStats(entities: EigEntity[], relationships: EigRelationship[]): GraphStats {
  const byType: Record<string, number> = {};
  for (const e of entities) {
    byType[e.entity_type] = (byType[e.entity_type] ?? 0) + 1;
  }

  const connectionCount: Record<string, number> = {};
  for (const r of relationships) {
    connectionCount[r.from_entity_id] = (connectionCount[r.from_entity_id] ?? 0) + 1;
    connectionCount[r.to_entity_id]   = (connectionCount[r.to_entity_id]   ?? 0) + 1;
  }

  const mostConnected = entities
    .map(e => ({ entity: e, connectionCount: connectionCount[e.id] ?? 0 }))
    .sort((a, b) => b.connectionCount - a.connectionCount)
    .slice(0, 8);

  return { totalEntities: entities.length, totalRelationships: relationships.length, byType, mostConnected };
}

// ─── Graph layout ─────────────────────────────────────────────────────────────

export interface NodePosition { x: number; y: number }

const TIER_Y: Record<number, number> = {
  0: 80,
  1: 210,
  2: 340,
  3: 470,
  4: 600,
  5: 730,
};

const CANVAS_WIDTH = 2200;
const NODE_H_SPACING = 160;

export function computeInitialLayout(entities: EigEntity[]): Record<string, NodePosition> {
  // Group by tier
  const tiers: Record<number, EigEntity[]> = {};
  for (const e of entities) {
    const tier = ENTITY_TYPE_TIER[e.entity_type] ?? 5;
    if (!tiers[tier]) tiers[tier] = [];
    tiers[tier].push(e);
  }

  const positions: Record<string, NodePosition> = {};
  for (const [tierStr, nodes] of Object.entries(tiers)) {
    const tier = Number(tierStr);
    const y = TIER_Y[tier] ?? 730 + (tier - 5) * 130;
    const totalWidth = (nodes.length - 1) * NODE_H_SPACING;
    const startX = Math.max(80, (CANVAS_WIDTH - totalWidth) / 2);
    nodes.forEach((node, i) => {
      positions[node.id] = { x: startX + i * NODE_H_SPACING, y };
    });
  }
  return positions;
}
