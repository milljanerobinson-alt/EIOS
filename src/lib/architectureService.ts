/**
 * Architecture Service — TP-018
 * Queries the Module Registry, computes Architecture Compliance Score,
 * Platform Reuse Score, and Commercial Readiness metrics.
 */

import { supabase } from './supabase';

export const ARCH_SERVICE_VERSION = '1.0';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModuleType = 'core_platform' | 'domain_module' | 'infrastructure';
export type ModuleStatus = 'active' | 'deprecated' | 'planned';
export type PlatformLayer = 'core_platform' | 'domain_module' | 'infrastructure' | 'mixed';

export interface ModuleRegistryEntry {
  id: string;
  name: string;
  slug: string;
  module_type: ModuleType;
  layer: number;
  owner: string;
  dependencies: string[];
  status: ModuleStatus;
  version: string;
  domain: string;
  reusable: boolean;
  description: string | null;
  phase_introduced: string | null;
  architecture_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PluginRegistryEntry {
  id: string;
  name: string;
  slug: string;
  plugin_type: 'product_plugin' | 'integration' | 'extension';
  status: 'registered' | 'active' | 'disabled';
  entry_point: string | null;
  permissions: string[];
  loaded_modules: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ArchitectureMetrics {
  total_modules: number;
  core_platform_count: number;
  domain_module_count: number;
  infrastructure_count: number;
  active_count: number;
  planned_count: number;
  deprecated_count: number;
  reusable_count: number;
  compliance_score: number;       // 0–100
  platform_reuse_score: number;   // 0–100
  commercial_readiness_score: number; // 0–100
  dependency_health_score: number;    // 0–100
  layer_separation_score: number;     // 0–100
}

export interface DependencyNode {
  slug: string;
  name: string;
  module_type: ModuleType;
  layer: number;
  status: ModuleStatus;
  dependencies: string[];
  dependents: string[];
}

export interface ArchitectureViolation {
  type: 'circular_dependency' | 'cross_layer_violation' | 'missing_dependency' | 'domain_leakage';
  description: string;
  affected_modules: string[];
  severity: 'low' | 'medium' | 'high';
}

export interface ArchitectureReport {
  metrics: ArchitectureMetrics;
  modules: ModuleRegistryEntry[];
  plugins: PluginRegistryEntry[];
  dependency_graph: DependencyNode[];
  violations: ArchitectureViolation[];
  generated_at: string;
}

// ─── Module Registry Queries ──────────────────────────────────────────────────

export async function loadModuleRegistry(): Promise<ModuleRegistryEntry[]> {
  const { data } = await supabase
    .from('ecc_module_registry')
    .select('*')
    .order('layer', { ascending: true });
  return (data ?? []) as ModuleRegistryEntry[];
}

export async function loadPluginRegistry(): Promise<PluginRegistryEntry[]> {
  const { data } = await supabase
    .from('ecc_plugin_registry')
    .select('*')
    .order('created_at', { ascending: true });
  return (data ?? []) as PluginRegistryEntry[];
}

export async function loadModuleBySlug(slug: string): Promise<ModuleRegistryEntry | null> {
  const { data } = await supabase
    .from('ecc_module_registry')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  return data as ModuleRegistryEntry | null;
}

// ─── Compliance Scoring ───────────────────────────────────────────────────────

export function computeArchitectureMetrics(modules: ModuleRegistryEntry[]): ArchitectureMetrics {
  const active = modules.filter(m => m.status === 'active');
  const planned = modules.filter(m => m.status === 'planned');
  const deprecated = modules.filter(m => m.status === 'deprecated');
  const corePlatform = modules.filter(m => m.module_type === 'core_platform');
  const domainModules = modules.filter(m => m.module_type === 'domain_module');
  const infrastructure = modules.filter(m => m.module_type === 'infrastructure');
  const reusable = modules.filter(m => m.reusable);

  // Architecture Compliance: all active modules are classified + in correct layer
  const allClassified = active.filter(m => m.module_type && m.layer > 0).length;
  const complianceScore = active.length > 0
    ? Math.round((allClassified / active.length) * 100)
    : 100;

  // Platform Reuse: % of core_platform modules that are reusable
  const reusableCore = corePlatform.filter(m => m.reusable && m.status === 'active').length;
  const platformReuseScore = corePlatform.filter(m => m.status === 'active').length > 0
    ? Math.round((reusableCore / corePlatform.filter(m => m.status === 'active').length) * 100)
    : 0;

  // Commercial Readiness: core + infra active + no deprecated + reuse %
  const hasCore = corePlatform.filter(m => m.status === 'active').length >= 5;
  const hasInfra = infrastructure.filter(m => m.status === 'active').length >= 3;
  const lowDeprecation = deprecated.length === 0;
  const goodReuse = platformReuseScore >= 70;
  const commercialPoints = [hasCore, hasInfra, lowDeprecation, goodReuse].filter(Boolean).length;
  const commercialReadinessScore = Math.round((commercialPoints / 4) * 100);

  // Dependency health: % of dependencies that resolve to known slugs
  const allSlugs = new Set(modules.map(m => m.slug));
  let totalDeps = 0;
  let resolvedDeps = 0;
  for (const m of modules) {
    for (const dep of m.dependencies) {
      totalDeps++;
      if (allSlugs.has(dep)) resolvedDeps++;
    }
  }
  const dependencyHealthScore = totalDeps > 0
    ? Math.round((resolvedDeps / totalDeps) * 100)
    : 100;

  // Layer separation: domain modules should not depend on other domain modules
  let layerViolations = 0;
  const domainSlugs = new Set(domainModules.map(m => m.slug));
  for (const dm of domainModules) {
    for (const dep of dm.dependencies) {
      if (domainSlugs.has(dep) && dep !== dm.slug) layerViolations++;
    }
  }
  const layerSeparationScore = domainModules.length > 0
    ? Math.max(0, 100 - (layerViolations * 20))
    : 100;

  return {
    total_modules: modules.length,
    core_platform_count: corePlatform.length,
    domain_module_count: domainModules.length,
    infrastructure_count: infrastructure.length,
    active_count: active.length,
    planned_count: planned.length,
    deprecated_count: deprecated.length,
    reusable_count: reusable.length,
    compliance_score: complianceScore,
    platform_reuse_score: platformReuseScore,
    commercial_readiness_score: commercialReadinessScore,
    dependency_health_score: dependencyHealthScore,
    layer_separation_score: layerSeparationScore,
  };
}

// ─── Dependency Graph ─────────────────────────────────────────────────────────

export function buildDependencyGraph(modules: ModuleRegistryEntry[]): DependencyNode[] {
  const dependentsMap: Record<string, string[]> = {};
  for (const m of modules) {
    if (!dependentsMap[m.slug]) dependentsMap[m.slug] = [];
    for (const dep of m.dependencies) {
      if (!dependentsMap[dep]) dependentsMap[dep] = [];
      dependentsMap[dep].push(m.slug);
    }
  }

  return modules.map(m => ({
    slug: m.slug,
    name: m.name,
    module_type: m.module_type,
    layer: m.layer,
    status: m.status,
    dependencies: m.dependencies,
    dependents: dependentsMap[m.slug] ?? [],
  }));
}

// ─── Violation Detection ──────────────────────────────────────────────────────

export function detectArchitectureViolations(modules: ModuleRegistryEntry[]): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];
  const slugMap = new Map(modules.map(m => [m.slug, m]));
  const domainSlugs = new Set(modules.filter(m => m.module_type === 'domain_module').map(m => m.slug));

  // Missing dependencies
  for (const m of modules) {
    const missing = m.dependencies.filter(dep => !slugMap.has(dep));
    if (missing.length > 0) {
      violations.push({
        type: 'missing_dependency',
        description: `${m.name} declares unresolved dependencies: ${missing.join(', ')}`,
        affected_modules: [m.slug, ...missing],
        severity: 'medium',
      });
    }
  }

  // Domain leakage: domain modules depending on each other
  for (const m of modules.filter(m => m.module_type === 'domain_module')) {
    const crossDomain = m.dependencies.filter(dep => domainSlugs.has(dep));
    if (crossDomain.length > 0) {
      violations.push({
        type: 'domain_leakage',
        description: `Domain module ${m.name} directly depends on another domain module: ${crossDomain.join(', ')}`,
        affected_modules: [m.slug, ...crossDomain],
        severity: 'high',
      });
    }
  }

  // Infrastructure depending on core_platform (reverse dependency)
  const coreSlugs = new Set(modules.filter(m => m.module_type === 'core_platform').map(m => m.slug));
  for (const m of modules.filter(m => m.module_type === 'infrastructure')) {
    const upwardDeps = m.dependencies.filter(dep => coreSlugs.has(dep));
    if (upwardDeps.length > 0) {
      violations.push({
        type: 'cross_layer_violation',
        description: `Infrastructure module ${m.name} depends upward on core platform: ${upwardDeps.join(', ')}`,
        affected_modules: [m.slug, ...upwardDeps],
        severity: 'high',
      });
    }
  }

  return violations;
}

// ─── Full Architecture Report ─────────────────────────────────────────────────

export async function generateArchitectureReport(): Promise<ArchitectureReport> {
  const [modules, plugins] = await Promise.all([
    loadModuleRegistry(),
    loadPluginRegistry(),
  ]);

  const metrics = computeArchitectureMetrics(modules);
  const dependencyGraph = buildDependencyGraph(modules);
  const violations = detectArchitectureViolations(modules);

  return {
    metrics,
    modules,
    plugins,
    dependency_graph: dependencyGraph,
    violations,
    generated_at: new Date().toISOString(),
  };
}

// ─── Platform Layer Detector (for CIS) ───────────────────────────────────────

const PLATFORM_SIGNALS: Record<PlatformLayer, string[]> = {
  core_platform:  ['elpm', 'eig', 'memory', 'review engine', 'erc', 'governance', 'audit engine',
                   'workflow engine', 'benchmark', 'briefing', 'error intelligence', 'conversation intelligence',
                   'module registry', 'plugin', 'decision intelligence', 'atd core'],
  domain_module:  ['lln', 'assessment', 'digital literacy', 'axcelerate', 'learner', 'scoring',
                   'test item', 'enrolment', 'course', 'qualification', 'stripe', 'payment'],
  infrastructure: ['database', 'postgres', 'migration', 'supabase', 'auth', 'edge function',
                   'api layer', 'openai', 'anthropic', 'storage', 'rls', 'secret'],
  mixed:          [],
};

export function detectPlatformLayer(
  title: string,
  content: string,
): PlatformLayer {
  const text = `${title} ${content}`.toLowerCase();
  const scores: Partial<Record<PlatformLayer, number>> = {};

  for (const [layer, signals] of Object.entries(PLATFORM_SIGNALS) as [PlatformLayer, string[]][]) {
    if (signals.length === 0) continue;
    scores[layer] = signals.filter(s => text.includes(s)).length;
  }

  const sorted = Object.entries(scores)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) return 'core_platform';

  // If top two scores are close, classify as mixed
  if (sorted.length >= 2 && sorted[0][1] > 0 && sorted[1][1] > 0 &&
      sorted[0][1] - sorted[1][1] <= 1) {
    return 'mixed';
  }

  return sorted[0][0] as PlatformLayer;
}

export function detectAffectedModules(content: string, modules: string[]): string[] {
  const text = content.toLowerCase();
  return modules.filter(slug => text.includes(slug.replace(/-/g, ' ')) || text.includes(slug));
}

export function assessFuturePlatformValue(
  title: string,
  content: string,
  layer: PlatformLayer,
): 'low' | 'medium' | 'high' {
  const text = `${title} ${content}`.toLowerCase();
  if (layer === 'domain_module') return 'low';

  const highValueSignals = ['architecture', 'pattern', 'standard', 'framework', 'principle',
                             'reusable', 'platform', 'modular', 'plugin', 'generic'];
  const mediumSignals = ['decision', 'approach', 'recommendation', 'lesson', 'best practice'];

  const highCount = highValueSignals.filter(s => text.includes(s)).length;
  const medCount = mediumSignals.filter(s => text.includes(s)).length;

  if (highCount >= 2 || (highCount >= 1 && layer === 'core_platform')) return 'high';
  if (medCount >= 2 || highCount >= 1) return 'medium';
  return 'low';
}
