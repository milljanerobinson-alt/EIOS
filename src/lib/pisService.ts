/**
 * Product Intelligence Service (PIS)
 *
 * Assembles, versions, and surfaces product intelligence from authoritative ECC sources.
 * The PIS never owns engineering data — it enriches and relates it.
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VisionItem {
  id: string;
  domain: string;
  title: string;
  content: string;
  sort_order: number;
  is_active: boolean;
}

export interface CustomerSegment {
  id: string;
  segment_key: string;
  segment_name: string;
  description: string | null;
  persona_type: string | null;
  problems: string[];
  desired_outcomes: string[];
  adoption_drivers: string[];
  is_primary: boolean;
}

export interface CommercialItem {
  id: string;
  domain: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
}

export interface CompetitiveAdvantage {
  id: string;
  advantage_type: string;
  title: string;
  description: string | null;
  strength: 'high' | 'medium' | 'low';
  is_active: boolean;
  sort_order: number;
}

export interface ProductConstraint {
  id: string;
  constraint_type: string;
  title: string;
  description: string | null;
  impact: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LaunchBlocker {
  id: string;
  blocker_type: string;
  title: string;
  description: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'resolved';
  feature_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductModule {
  id: string;
  module_key: string;
  module_name: string;
  description: string | null;
  status: string;
  sort_order: number;
  is_core: boolean;
}

export interface CapabilityIntel {
  id: string;
  feature_id: string;
  module_id: string | null;
  launch_criticality: 'launch_critical' | 'important' | 'nice_to_have';
  competitive_significance: 'high' | 'medium' | 'low';
  customer_facing: boolean;
  notes: string | null;
}

export interface ProductRelationship {
  id: string;
  from_entity_type: string;
  from_entity_id: string;
  to_entity_type: string;
  to_entity_id: string;
  relationship_type: string;
  description: string | null;
  created_at: string;
}

export interface PisSnapshot {
  id: string;
  snapshot_ref: string;
  pis_version: string;
  platform_state_id: string | null;
  context_package_id: string | null;
  product_maturity: string;
  launch_readiness_score: number;
  current_strategic_objective: string | null;
  current_commercial_objective: string | null;
  implemented_capabilities: number;
  planned_capabilities: number;
  deferred_capabilities: number;
  customer_segments_count: number;
  competitive_advantages_count: number;
  product_risks_count: number;
  product_constraints_count: number;
  knowledge_confidence: number;
  context_completeness: number;
  snapshot_data: Record<string, unknown>;
  sources_used: unknown[];
  missing_sources: string[];
  validation_status: string;
  generated_by: string | null;
  created_at: string;
}

// Assembled feature with PIS enrichment
export interface EnrichedCapability {
  id: string;
  feature_code: string;
  name: string;
  description: string | null;
  status: string;
  maturity_level: string | null;
  module_id: string | null;
  module_name: string | null;
  launch_criticality: string;
  competitive_significance: string;
  customer_facing: boolean;
  intel_notes: string | null;
}

export interface ProductIntelligence {
  vision: VisionItem[];
  customers: CustomerSegment[];
  commercial: CommercialItem[];
  competitive: CompetitiveAdvantage[];
  constraints: ProductConstraint[];
  launch: LaunchBlocker[];
  modules: ProductModule[];
  capabilities: EnrichedCapability[];
  relationships: ProductRelationship[];
  snapshots: PisSnapshot[];
  launchReadinessScore: number;
  productMaturity: string;
  openBlockers: number;
  criticalBlockers: number;
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

export async function loadVisionIntelligence(): Promise<VisionItem[]> {
  const { data } = await supabase
    .from('pis_vision_intelligence')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []) as VisionItem[];
}

export async function loadCustomerSegments(): Promise<CustomerSegment[]> {
  const { data } = await supabase
    .from('pis_customer_segments')
    .select('*')
    .order('is_primary', { ascending: false });
  if (!data) return [];
  return data.map(r => ({
    ...r,
    problems: Array.isArray(r.problems) ? r.problems : JSON.parse(r.problems ?? '[]'),
    desired_outcomes: Array.isArray(r.desired_outcomes) ? r.desired_outcomes : JSON.parse(r.desired_outcomes ?? '[]'),
    adoption_drivers: Array.isArray(r.adoption_drivers) ? r.adoption_drivers : JSON.parse(r.adoption_drivers ?? '[]'),
  })) as CustomerSegment[];
}

export async function loadCommercialIntelligence(): Promise<CommercialItem[]> {
  const { data } = await supabase
    .from('pis_commercial_intelligence')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []) as CommercialItem[];
}

export async function loadCompetitiveAdvantages(): Promise<CompetitiveAdvantage[]> {
  const { data } = await supabase
    .from('pis_competitive_advantages')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []) as CompetitiveAdvantage[];
}

export async function loadProductConstraints(): Promise<ProductConstraint[]> {
  const { data } = await supabase
    .from('pis_product_constraints')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  return (data ?? []) as ProductConstraint[];
}

export async function loadLaunchBlockers(): Promise<LaunchBlocker[]> {
  const { data } = await supabase
    .from('pis_launch_blockers')
    .select('*')
    .order('severity')
    .order('status');
  return (data ?? []) as LaunchBlocker[];
}

export async function loadModules(): Promise<ProductModule[]> {
  const { data } = await supabase
    .from('pis_modules')
    .select('*')
    .order('sort_order');
  return (data ?? []) as ProductModule[];
}

export async function loadCapabilityIntel(): Promise<CapabilityIntel[]> {
  const { data } = await supabase
    .from('pis_capability_intel')
    .select('*');
  return (data ?? []) as CapabilityIntel[];
}

export async function loadRelationships(): Promise<ProductRelationship[]> {
  const { data } = await supabase
    .from('pis_relationships')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as ProductRelationship[];
}

export async function loadSnapshots(limit = 20): Promise<PisSnapshot[]> {
  const { data } = await supabase
    .from('pis_snapshots')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as PisSnapshot[];
}

// ─── Enriched Capability Assembly ─────────────────────────────────────────────

export async function loadEnrichedCapabilities(): Promise<EnrichedCapability[]> {
  const [featuresRes, intelRes, modulesRes] = await Promise.all([
    supabase.from('ecc_product_features').select('id,feature_code,name,description,status,maturity_level').order('name'),
    supabase.from('pis_capability_intel').select('*'),
    supabase.from('pis_modules').select('id,module_name'),
  ]);

  const features = featuresRes.data ?? [];
  const intel = intelRes.data ?? [];
  const modules = modulesRes.data ?? [];

  const intelMap = new Map(intel.map((i: CapabilityIntel) => [i.feature_id, i]));
  const moduleMap = new Map(modules.map((m: { id: string; module_name: string }) => [m.id, m.module_name]));

  return features.map(f => {
    const i = intelMap.get(f.id);
    return {
      id: f.id,
      feature_code: f.feature_code,
      name: f.name,
      description: f.description ?? null,
      status: f.status ?? 'planned',
      maturity_level: f.maturity_level ?? null,
      module_id: i?.module_id ?? null,
      module_name: i?.module_id ? (moduleMap.get(i.module_id) ?? null) : null,
      launch_criticality: i?.launch_criticality ?? 'nice_to_have',
      competitive_significance: i?.competitive_significance ?? 'low',
      customer_facing: i?.customer_facing ?? true,
      intel_notes: i?.notes ?? null,
    };
  });
}

// ─── Scoring & Maturity ───────────────────────────────────────────────────────

export function calculateLaunchReadiness(blockers: LaunchBlocker[]): number {
  const open = blockers.filter(b => b.status !== 'resolved');
  let score = 100;
  for (const b of open) {
    if (b.severity === 'critical') score -= 30;
    else if (b.severity === 'high') score -= 15;
    else if (b.severity === 'medium') score -= 5;
    else score -= 2;
  }
  return Math.max(0, Math.min(100, score));
}

export function deriveProductMaturity(capabilities: EnrichedCapability[]): string {
  if (capabilities.length === 0) return 'concept';
  const live = capabilities.filter(c => c.status === 'live' || c.status === 'production').length;
  const ratio = live / capabilities.length;
  if (ratio >= 0.75) return 'production_ready';
  if (ratio >= 0.45) return 'maturing';
  if (ratio >= 0.15) return 'developing';
  return 'concept';
}

// ─── Snapshot Generation ─────────────────────────────────────────────────────

export async function generateSnapshot(
  generatedBy = 'PIS Service',
  platformStateId?: string,
  contextPackageId?: string,
): Promise<PisSnapshot> {
  const [blockers, capabilities, customers, competitive, constraints, vision] = await Promise.all([
    loadLaunchBlockers(),
    loadEnrichedCapabilities(),
    loadCustomerSegments(),
    loadCompetitiveAdvantages(),
    loadProductConstraints(),
    loadVisionIntelligence(),
  ]);

  const launchReadinessScore = calculateLaunchReadiness(blockers);
  const productMaturity = deriveProductMaturity(capabilities);

  const implemented = capabilities.filter(c => c.status === 'live' || c.status === 'production' || c.status === 'verified').length;
  const planned = capabilities.filter(c => c.status === 'planned' || c.status === 'in_progress' || c.status === 'in_development').length;
  const deferred = capabilities.filter(c => c.status === 'deferred' || c.status === 'archived').length;

  const strategicObj = vision.find(v => v.domain === 'objective' && v.sort_order === 9);
  const commercialObj = vision.find(v => v.domain === 'objective' && v.sort_order === 10);

  const risks = blockers.filter(b => b.severity === 'critical' || b.severity === 'high').length;

  const { data: snap, error } = await supabase
    .from('pis_snapshots')
    .insert({
      pis_version: '1.0',
      platform_state_id: platformStateId ?? null,
      context_package_id: contextPackageId ?? null,
      product_maturity: productMaturity,
      launch_readiness_score: launchReadinessScore,
      current_strategic_objective: strategicObj?.title ?? null,
      current_commercial_objective: commercialObj?.title ?? null,
      implemented_capabilities: implemented,
      planned_capabilities: planned,
      deferred_capabilities: deferred,
      customer_segments_count: customers.length,
      competitive_advantages_count: competitive.length,
      product_risks_count: risks,
      product_constraints_count: constraints.length,
      knowledge_confidence: Math.round((implemented / Math.max(capabilities.length, 1)) * 100),
      context_completeness: Math.round(((implemented + planned) / Math.max(capabilities.length, 1)) * 100),
      snapshot_data: {
        top_blockers: blockers.filter(b => b.status !== 'resolved').slice(0, 5).map(b => b.title),
        primary_customers: customers.filter(c => c.is_primary).map(c => c.segment_name),
        top_advantages: competitive.filter(c => c.strength === 'high').map(c => c.title),
      },
      sources_used: ['pis_launch_blockers', 'ecc_product_features', 'pis_customer_segments', 'pis_competitive_advantages'],
      missing_sources: [],
      validation_status: launchReadinessScore >= 70 ? 'valid' : launchReadinessScore >= 40 ? 'warnings' : 'incomplete',
      generated_by: generatedBy,
    })
    .select()
    .single();

  if (error || !snap) throw new Error(error?.message ?? 'Failed to create product intelligence snapshot');
  return snap as PisSnapshot;
}

// ─── Product Intelligence API ─────────────────────────────────────────────────

export async function getProductSummary(): Promise<{
  vision: string;
  mission: string;
  purpose: string;
  customerPromise: string;
}> {
  const vision = await loadVisionIntelligence();
  const get = (domain: string) => vision.find(v => v.domain === domain)?.content ?? '';
  return {
    vision: get('vision'),
    mission: get('mission'),
    purpose: get('purpose'),
    customerPromise: get('customer_promise'),
  };
}

export async function getCapabilitySummary(): Promise<{
  total: number;
  implemented: number;
  planned: number;
  deferred: number;
  launchCritical: number;
}> {
  const [caps, intel] = await Promise.all([
    supabase.from('ecc_product_features').select('id,status', { count: 'exact' }),
    supabase.from('pis_capability_intel').select('launch_criticality'),
  ]);
  const features = caps.data ?? [];
  const intelRows = intel.data ?? [];
  return {
    total: caps.count ?? features.length,
    implemented: features.filter(f => ['live', 'production', 'verified'].includes(f.status)).length,
    planned: features.filter(f => ['planned', 'in_progress', 'in_development'].includes(f.status)).length,
    deferred: features.filter(f => ['deferred', 'archived'].includes(f.status)).length,
    launchCritical: intelRows.filter((i: { launch_criticality: string }) => i.launch_criticality === 'launch_critical').length,
  };
}

export async function getLaunchStatus(): Promise<{
  score: number;
  maturity: string;
  openBlockers: number;
  criticalBlockers: number;
  topBlockers: LaunchBlocker[];
}> {
  const [blockers, caps] = await Promise.all([
    loadLaunchBlockers(),
    loadEnrichedCapabilities(),
  ]);
  const open = blockers.filter(b => b.status !== 'resolved');
  return {
    score: calculateLaunchReadiness(blockers),
    maturity: deriveProductMaturity(caps),
    openBlockers: open.length,
    criticalBlockers: open.filter(b => b.severity === 'critical').length,
    topBlockers: open.filter(b => b.severity === 'critical' || b.severity === 'high').slice(0, 5),
  };
}

export async function getCompetitiveSummary(): Promise<{
  advantages: CompetitiveAdvantage[];
  differentiators: number;
  usps: number;
  innovationAreas: number;
  highStrength: number;
}> {
  const advantages = await loadCompetitiveAdvantages();
  return {
    advantages,
    differentiators: advantages.filter(a => a.advantage_type === 'differentiator').length,
    usps: advantages.filter(a => a.advantage_type === 'usp').length,
    innovationAreas: advantages.filter(a => a.advantage_type === 'innovation').length,
    highStrength: advantages.filter(a => a.strength === 'high').length,
  };
}

export async function getRoadmapIntelligence(): Promise<{
  live: number;
  inProgress: number;
  planned: number;
  deferred: number;
  rejected: number;
  total: number;
}> {
  const { data } = await supabase.from('ecc_product_features').select('status');
  const features = data ?? [];
  return {
    live: features.filter(f => f.status === 'live' || f.status === 'production').length,
    inProgress: features.filter(f => f.status === 'in_progress' || f.status === 'in_development').length,
    planned: features.filter(f => f.status === 'planned' || f.status === 'backlog').length,
    deferred: features.filter(f => f.status === 'deferred').length,
    rejected: features.filter(f => f.status === 'rejected' || f.status === 'archived').length,
    total: features.length,
  };
}

// ─── Full Assembly ────────────────────────────────────────────────────────────

export async function assembleProductIntelligence(): Promise<ProductIntelligence> {
  const [vision, customers, commercial, competitive, constraints, launch, modules, capabilities, relationships, snapshots] =
    await Promise.all([
      loadVisionIntelligence(),
      loadCustomerSegments(),
      loadCommercialIntelligence(),
      loadCompetitiveAdvantages(),
      loadProductConstraints(),
      loadLaunchBlockers(),
      loadModules(),
      loadEnrichedCapabilities(),
      loadRelationships(),
      loadSnapshots(10),
    ]);

  const launchReadinessScore = calculateLaunchReadiness(launch);
  const productMaturity = deriveProductMaturity(capabilities);
  const openBlockers = launch.filter(b => b.status !== 'resolved').length;
  const criticalBlockers = launch.filter(b => b.status !== 'resolved' && b.severity === 'critical').length;

  return {
    vision,
    customers,
    commercial,
    competitive,
    constraints,
    launch,
    modules,
    capabilities,
    relationships,
    snapshots,
    launchReadinessScore,
    productMaturity,
    openBlockers,
    criticalBlockers,
  };
}
