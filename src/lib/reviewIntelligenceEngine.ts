/**
 * Engineering Review Intelligence Engine (ERIE)
 *
 * Modular analysis orchestrator for Engineering Reviews.
 * Each module is independently reusable and future-extensible.
 *
 * Engine version — bump when output schema changes to invalidate cached intelligence.
 */

import { supabase } from './supabase';
import type { EigEntity, EigRelationship } from './eigService';
import { generateELPMReport, type ELPMReport } from './elpmEngine';

export const ERIE_VERSION = '1.0';

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface EIGAnalysisResult {
  entities_analysed: number;
  relationships_traversed: number;
  dependency_depth: number;
  connected_systems: string[];
  impact_radius: number;
  graph_confidence: number;  // 0–1
  analysed_at: string;
  entity_type_breakdown: Record<string, number>;
}

export interface DependencyEntry {
  id: string;
  name: string;
  type: string;
  relationship_type: string;
  status: string;
  entity_ref: string | null;
}

export interface DependencyAnalysisResult {
  missions: DependencyEntry[];
  engineering_reviews: DependencyEntry[];
  ewos: DependencyEntry[];
  specifications: DependencyEntry[];
  platform_modules: DependencyEntry[];
  ui_pages: DependencyEntry[];
  components: DependencyEntry[];
  database_tables: DependencyEntry[];
  api_endpoints: DependencyEntry[];
  releases: DependencyEntry[];
  audits: DependencyEntry[];
  benchmarks: DependencyEntry[];
  test_plans: DependencyEntry[];
  risks: DependencyEntry[];
  technical_debt: DependencyEntry[];
  roadmap_items: DependencyEntry[];
  total_dependencies: number;
}

export interface ImpactAnalysisResult {
  affected_systems: string[];
  affected_components: string[];
  affected_ui_pages: string[];
  affected_db_tables: string[];
  affected_api_endpoints: string[];
  affected_test_plans: string[];
  affected_releases: string[];
  affected_docs: string[];
  affected_governance: string[];
  complexity_score: number;        // 1–10
  effort_estimate: string;
  regression_risk: 'low' | 'medium' | 'high' | 'critical';
  governance_impact: string;
  release_impact: string;
}

export interface RiskEntry {
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high' | 'critical';
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string;
  owner: string;
  status: 'open' | 'mitigated' | 'accepted';
}

export interface TraceabilityLink {
  layer: string;
  entity: string | null;
  entity_ref: string | null;
  status: 'present' | 'missing';
}

export interface TraceabilityResult {
  chain: TraceabilityLink[];
  completeness_pct: number;
  missing_links: string[];
}

export interface ImplementationPhase {
  phase: number;
  title: string;
  items: string[];
  depends_on: number[];
  parallel_with: number[];
}

export interface ImplementationPlanResult {
  phases: ImplementationPhase[];
  critical_path: string[];
  blocking_items: string[];
  prerequisites: string[];
  parallel_opportunities: string[];
}

export interface ReleaseReadinessGate {
  gate: string;
  ready: boolean;
  note: string;
}

export interface ReleaseReadinessResult {
  gates: ReleaseReadinessGate[];
  overall_ready: boolean;
  blockers: string[];
  missing_evidence: string[];
  outstanding_risks: string[];
  outstanding_docs: string[];
  outstanding_testing: string[];
}

export interface TestingAssessmentResult {
  existing_plans: string[];
  missing_plans: string[];
  coverage_pct: number;
  regression_required: boolean;
  recommended_activities: string[];
}

export interface DocumentationAssessmentResult {
  existing: string[];
  missing: string[];
  updates_required: string[];
  recommended_specs: string[];
}

export interface AIReasoningResult {
  sources_used: {
    eig_entities: number;
    eig_relationships: number;
    engineering_reviews: number;
    specifications: number;
    releases: number;
    test_plans: number;
    benchmarks: number;
    risks: number;
  };
  reasoning_summary: string;
  confidence_score: number;  // 0–1
  evidence_count: number;
}

export interface QualityBreakdown {
  traceability: number;
  dependency_coverage: number;
  impact_analysis: number;
  risk_assessment: number;
  governance_completeness: number;
  documentation_completeness: number;
  testing_completeness: number;
  ai_reasoning_quality: number;
  executive_clarity: number;
}

export interface ExecutiveBrief {
  why_it_matters: string;
  business_value: string;
  engineering_value: string;
  risks: string[];
  effort_estimate: string;
  timeline: string;
  release_impact: string;
  recommendation: string;
  next_action: string;
}

export interface IntelligenceReport {
  eig_analysis: EIGAnalysisResult;
  dependency_analysis: DependencyAnalysisResult;
  impact_analysis: ImpactAnalysisResult;
  risk_register: RiskEntry[];
  traceability: TraceabilityResult;
  implementation_plan: ImplementationPlanResult;
  release_readiness: ReleaseReadinessResult;
  testing_assessment: TestingAssessmentResult;
  documentation_assessment: DocumentationAssessmentResult;
  ai_reasoning: AIReasoningResult;
  intelligence_quality_score: number;
  intelligence_quality_breakdown: QualityBreakdown;
  executive_brief: ExecutiveBrief;
  intelligence_generated_at: string;
  intelligence_engine_version: string;
}

// ─── Context payload passed through the engine ───────────────────────────────

interface EngineContext {
  review: {
    id: string;
    erc_number: string;
    title: string;
    type: string;
    engineering_area: string | null;
    executive_summary: string | null;
    related_audits: string[];
    related_features: string[];
    related_releases: string[];
    related_test_plans: string[];
    related_decisions: string[];
    related_phases: string[];
    metadata: Record<string, unknown> | null;
  };
  entities: EigEntity[];
  relationships: EigRelationship[];
  reviewEntities: EigEntity[];           // EIG entities linked to this review
  connectedEntities: EigEntity[];         // 1-hop neighbours
  connectedRelationships: EigRelationship[];
  existingReviews: Array<{ erc_number: string; title: string; type: string }>;
  testPlans: Array<{ id: string; title: string; status: string }>;
  releases: Array<{ version: string; status: string; release_date: string | null }>;
  docs: Array<{ title: string; doc_type: string; status: string }>;
}

// ─── Module 1: EIG Analysis ───────────────────────────────────────────────────

function runEIGAnalysis(ctx: EngineContext): EIGAnalysisResult {
  const { entities, relationships, reviewEntities, connectedEntities, connectedRelationships } = ctx;

  const entityTypeBreakdown: Record<string, number> = {};
  for (const e of [...reviewEntities, ...connectedEntities]) {
    entityTypeBreakdown[e.entity_type] = (entityTypeBreakdown[e.entity_type] ?? 0) + 1;
  }

  // BFS depth from review entities
  let depth = 0;
  if (reviewEntities.length > 0 && relationships.length > 0) {
    const visited = new Set(reviewEntities.map(e => e.id));
    let frontier = reviewEntities.map(e => e.id);
    while (frontier.length > 0 && depth < 6) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const r of relationships) {
          const neighbour = r.from_entity_id === id ? r.to_entity_id : r.to_entity_id === id ? r.from_entity_id : null;
          if (neighbour && !visited.has(neighbour)) { visited.add(neighbour); next.push(neighbour); }
        }
      }
      if (next.length > 0) depth++;
      frontier = next;
      if (depth >= 3) break; // limit traversal cost
    }
  }

  const connectedSystems = [...new Set(connectedEntities.map(e => e.entity_type))];
  const confidence = entities.length > 0 ? Math.min(1, (reviewEntities.length + connectedEntities.length) / Math.max(entities.length, 1) * 4) : 0;

  return {
    entities_analysed: reviewEntities.length + connectedEntities.length,
    relationships_traversed: connectedRelationships.length,
    dependency_depth: depth,
    connected_systems: connectedSystems,
    impact_radius: connectedEntities.length,
    graph_confidence: Math.round(confidence * 100) / 100,
    analysed_at: new Date().toISOString(),
    entity_type_breakdown: entityTypeBreakdown,
  };
}

// ─── Module 2: Dependency Analysis ───────────────────────────────────────────

function runDependencyAnalysis(ctx: EngineContext): DependencyAnalysisResult {
  const { reviewEntities, connectedEntities, connectedRelationships } = ctx;

  const allRelated = [...reviewEntities, ...connectedEntities];

  function toEntry(e: EigEntity, relType: string): DependencyEntry {
    return { id: e.id, name: e.name, type: e.entity_type, relationship_type: relType, status: e.status, entity_ref: e.entity_ref };
  }

  function relTypeFor(entityId: string): string {
    const rel = connectedRelationships.find(r => r.from_entity_id === entityId || r.to_entity_id === entityId);
    return rel?.relationship_type ?? 'related_to';
  }

  function byType(t: string): DependencyEntry[] {
    return allRelated.filter(e => e.entity_type === t).map(e => toEntry(e, relTypeFor(e.id)));
  }

  const result: DependencyAnalysisResult = {
    missions:           byType('mission'),
    engineering_reviews:byType('engineering_review'),
    ewos:               byType('ewo'),
    specifications:     byType('specification'),
    platform_modules:   byType('platform_module'),
    ui_pages:           byType('ui_page'),
    components:         byType('component'),
    database_tables:    byType('database_table'),
    api_endpoints:      byType('api_endpoint'),
    releases:           byType('release'),
    audits:             byType('audit'),
    benchmarks:         byType('benchmark'),
    test_plans:         byType('test_plan'),
    risks:              byType('risk'),
    technical_debt:     byType('technical_debt'),
    roadmap_items:      byType('roadmap_item'),
    total_dependencies: allRelated.length,
  };

  return result;
}

// ─── Module 3: Impact Analysis ────────────────────────────────────────────────

function runImpactAnalysis(ctx: EngineContext, deps: DependencyAnalysisResult): ImpactAnalysisResult {
  const { review } = ctx;

  const affectedSystems  = [...new Set([...deps.platform_modules.map(e => e.name), ...deps.engineering_reviews.map(e => e.name)])];
  const affectedComponents = deps.components.map(e => e.name);
  const affectedUIPages  = deps.ui_pages.map(e => e.name);
  const affectedDBTables = deps.database_tables.map(e => e.name);
  const affectedAPIEnds  = deps.api_endpoints.map(e => e.name);
  const affectedTestPlans= deps.test_plans.map(e => e.name);
  const affectedReleases = deps.releases.map(e => e.name);

  // Complexity scoring (heuristic): more affected = more complex
  const touchCount = affectedComponents.length + affectedDBTables.length + affectedAPIEnds.length + affectedUIPages.length;
  const complexity = Math.min(10, Math.max(1, Math.round(touchCount / 2) + (deps.risks.length > 0 ? 2 : 0)));

  const regressionRisk: ImpactAnalysisResult['regression_risk'] =
    touchCount > 12 ? 'critical' : touchCount > 8 ? 'high' : touchCount > 4 ? 'medium' : 'low';

  const effort = touchCount > 12 ? 'High (3–5 days)'
    : touchCount > 6  ? 'Medium (1–3 days)'
    : touchCount > 2  ? 'Low (0.5–1 day)'
    : 'Minimal (< 4 hours)';

  return {
    affected_systems:     affectedSystems.slice(0, 10),
    affected_components:  affectedComponents.slice(0, 12),
    affected_ui_pages:    affectedUIPages.slice(0, 10),
    affected_db_tables:   affectedDBTables.slice(0, 10),
    affected_api_endpoints: affectedAPIEnds.slice(0, 8),
    affected_test_plans:  affectedTestPlans.slice(0, 8),
    affected_releases:    affectedReleases.slice(0, 6),
    affected_docs:        ctx.docs.filter(d => d.status !== 'published').map(d => d.title).slice(0, 8),
    affected_governance:  review.related_audits.slice(0, 6),
    complexity_score:     complexity,
    effort_estimate:      effort,
    regression_risk:      regressionRisk,
    governance_impact:    deps.audits.length > 0 ? `Affects ${deps.audits.length} audit(s). Governance re-review recommended.` : 'No direct audit impact identified.',
    release_impact:       deps.releases.length > 0 ? `Linked to ${deps.releases.map(r=>r.name).join(', ')}.` : 'No active release directly linked.',
  };
}

// ─── Module 4: Risk Register ──────────────────────────────────────────────────

function runRiskRegister(ctx: EngineContext, impact: ImpactAnalysisResult): RiskEntry[] {
  const risks: RiskEntry[] = [];

  // Derive risks from EIG risk entities
  for (const r of ctx.connectedEntities.filter(e => e.entity_type === 'risk')) {
    risks.push({
      description: r.description ?? r.name,
      likelihood:  (r.properties as Record<string,string>)?.likelihood as RiskEntry['likelihood'] ?? 'medium',
      impact:      (r.properties as Record<string,string>)?.impact as RiskEntry['impact'] ?? 'medium',
      severity:    (r.properties as Record<string,string>)?.severity as RiskEntry['severity'] ?? 'medium',
      mitigation:  (r.properties as Record<string,string>)?.mitigation ?? 'No mitigation defined.',
      owner:       r.tags?.[0] ?? 'Engineering',
      status:      r.status === 'deprecated' ? 'mitigated' : 'open',
    });
  }

  // Synthesised risk: regression
  if (impact.regression_risk === 'high' || impact.regression_risk === 'critical') {
    risks.push({
      description: `Regression risk is ${impact.regression_risk} — ${impact.affected_components.length} components affected.`,
      likelihood:  'medium',
      impact:      impact.regression_risk === 'critical' ? 'critical' : 'high',
      severity:    impact.regression_risk,
      mitigation:  'Execute full regression test suite before release. Prioritise affected component tests.',
      owner:       'QA',
      status:      'open',
    });
  }

  // Synthesised risk: documentation gaps
  if (impact.affected_docs.length > 0) {
    risks.push({
      description: `${impact.affected_docs.length} documentation item(s) require update before release.`,
      likelihood:  'high',
      impact:      'medium',
      severity:    'medium',
      mitigation:  'Update all affected documentation before marking review complete.',
      owner:       'Engineering',
      status:      'open',
    });
  }

  // Synthesised risk: no test plans linked
  if (impact.affected_test_plans.length === 0 && ctx.connectedEntities.filter(e => e.entity_type === 'test_plan').length === 0) {
    risks.push({
      description: 'No test plans linked to this engineering review. Testing coverage is unverified.',
      likelihood:  'high',
      impact:      'medium',
      severity:    'medium',
      mitigation:  'Create or link a test plan for all affected components. Define validation criteria.',
      owner:       'Engineering',
      status:      'open',
    });
  }

  return risks.slice(0, 10);
}

// ─── Module 5: Traceability ───────────────────────────────────────────────────

function runTraceability(ctx: EngineContext, deps: DependencyAnalysisResult): TraceabilityResult {
  const { review } = ctx;

  const chain: TraceabilityLink[] = [
    { layer: 'Mission',              entity: deps.missions[0]?.name ?? null,              entity_ref: deps.missions[0]?.entity_ref ?? null,             status: deps.missions.length > 0 ? 'present' : 'missing' },
    { layer: 'Engineering Review',   entity: review.title,                                entity_ref: review.erc_number,                                 status: 'present' },
    { layer: 'Engineering Work Order',entity: deps.ewos[0]?.name ?? null,                entity_ref: deps.ewos[0]?.entity_ref ?? null,                  status: deps.ewos.length > 0 ? 'present' : 'missing' },
    { layer: 'Specification',        entity: deps.specifications[0]?.name ?? null,        entity_ref: deps.specifications[0]?.entity_ref ?? null,        status: deps.specifications.length > 0 ? 'present' : 'missing' },
    { layer: 'Implementation',       entity: deps.components.length > 0 ? `${deps.components.length} component(s)` : null, entity_ref: null,            status: deps.components.length > 0 || deps.platform_modules.length > 0 ? 'present' : 'missing' },
    { layer: 'Test Plan',            entity: deps.test_plans[0]?.name ?? ctx.testPlans[0]?.title ?? null, entity_ref: null,                             status: deps.test_plans.length > 0 || ctx.testPlans.length > 0 ? 'present' : 'missing' },
    { layer: 'Benchmark',            entity: deps.benchmarks[0]?.name ?? null,            entity_ref: deps.benchmarks[0]?.entity_ref ?? null,            status: deps.benchmarks.length > 0 ? 'present' : 'missing' },
    { layer: 'Audit',                entity: deps.audits[0]?.name ?? (review.related_audits[0] ?? null), entity_ref: null,                              status: deps.audits.length > 0 || review.related_audits.length > 0 ? 'present' : 'missing' },
    { layer: 'Release',              entity: deps.releases[0]?.name ?? ctx.releases[0]?.version ?? null, entity_ref: null,                              status: deps.releases.length > 0 || review.related_releases.length > 0 ? 'present' : 'missing' },
  ];

  const presentCount = chain.filter(l => l.status === 'present').length;
  const missingLinks = chain.filter(l => l.status === 'missing').map(l => l.layer);

  return {
    chain,
    completeness_pct: Math.round((presentCount / chain.length) * 100),
    missing_links: missingLinks,
  };
}

// ─── Module 6: Implementation Plan ───────────────────────────────────────────

function runImplementationPlan(ctx: EngineContext, deps: DependencyAnalysisResult, impact: ImpactAnalysisResult): ImplementationPlanResult {
  const phases: ImplementationPhase[] = [];

  if (deps.database_tables.length > 0) {
    phases.push({ phase: 1, title: 'Database & Schema', items: deps.database_tables.map(e => `Update/create: ${e.name}`), depends_on: [], parallel_with: [] });
  }
  if (deps.api_endpoints.length > 0) {
    phases.push({ phase: 2, title: 'API & Edge Functions', items: deps.api_endpoints.map(e => `Update: ${e.name}`), depends_on: [1], parallel_with: [] });
  }
  const compAndUI = [...deps.components.map(e => e.name), ...deps.ui_pages.map(e => e.name)];
  if (compAndUI.length > 0) {
    phases.push({ phase: 3, title: 'Frontend Components & Pages', items: compAndUI, depends_on: [1, 2], parallel_with: [] });
  }
  if (deps.test_plans.length > 0 || impact.regression_risk !== 'low') {
    phases.push({ phase: 4, title: 'Testing & Validation', items: [...deps.test_plans.map(e => `Execute: ${e.name}`), 'Regression test suite', ...impact.affected_components.slice(0, 4).map(c => `Component test: ${c}`)], depends_on: [3], parallel_with: [] });
  }
  if (deps.audits.length > 0 || deps.audits.length === 0) {
    phases.push({ phase: phases.length + 1, title: 'Documentation & Governance', items: ['Update Engineering Review record', ...impact.affected_docs.slice(0, 4), 'Update EIG with new entities/relationships'], depends_on: [Math.max(1, phases.length)], parallel_with: [] });
  }

  const criticalPath = phases.map(p => `Phase ${p.phase}: ${p.title}`);
  const blocking = deps.risks.filter(r => r.status === 'open').map(r => `Risk: ${r.name}`);
  const prereqs  = deps.specifications.map(s => `Specification: ${s.name}`);

  return {
    phases,
    critical_path:          criticalPath,
    blocking_items:         blocking.slice(0, 5),
    prerequisites:          prereqs.slice(0, 5),
    parallel_opportunities: phases.filter(p => p.parallel_with.length > 0).map(p => `Phase ${p.phase}: ${p.title}`),
  };
}

// ─── Module 7: Release Readiness ─────────────────────────────────────────────

function runReleaseReadiness(ctx: EngineContext, impact: ImpactAnalysisResult, risks: RiskEntry[], testing: TestingAssessmentResult, docs: DocumentationAssessmentResult): ReleaseReadinessResult {
  const criticalRisks = risks.filter(r => r.severity === 'critical' && r.status === 'open');
  const highRisks     = risks.filter(r => r.severity === 'high'     && r.status === 'open');

  const gates: ReleaseReadinessGate[] = [
    { gate: 'Ready for Engineering Review',  ready: true,                                            note: 'Engineering Review record exists.' },
    { gate: 'Ready for PO Approval',         ready: criticalRisks.length === 0,                      note: criticalRisks.length > 0 ? `${criticalRisks.length} critical risk(s) unresolved.` : 'No critical risks blocking approval.' },
    { gate: 'Ready for Implementation',      ready: docs.missing.length < 3,                         note: docs.missing.length > 0 ? `${docs.missing.length} documentation item(s) missing.` : 'Documentation sufficient.' },
    { gate: 'Ready for Testing',             ready: testing.existing_plans.length > 0 || testing.coverage_pct > 30,  note: testing.existing_plans.length === 0 ? 'No test plans found.' : `${testing.existing_plans.length} test plan(s) found.` },
    { gate: 'Ready for Release',             ready: criticalRisks.length === 0 && highRisks.length < 2 && testing.coverage_pct > 50, note: criticalRisks.length > 0 ? 'Critical risks must be resolved first.' : highRisks.length >= 2 ? `${highRisks.length} high-severity risks outstanding.` : 'Release criteria approaching met.' },
  ];

  return {
    gates,
    overall_ready:      gates.every(g => g.ready),
    blockers:           criticalRisks.map(r => r.description).slice(0, 5),
    missing_evidence:   docs.missing.slice(0, 5),
    outstanding_risks:  [...criticalRisks, ...highRisks].map(r => r.description).slice(0, 6),
    outstanding_docs:   docs.missing.slice(0, 6),
    outstanding_testing: testing.missing_plans.slice(0, 5),
  };
}

// ─── Module 8: Testing Assessment ────────────────────────────────────────────

function runTestingAssessment(ctx: EngineContext, deps: DependencyAnalysisResult, impact: ImpactAnalysisResult): TestingAssessmentResult {
  const existingPlans = [
    ...deps.test_plans.map(e => e.name),
    ...ctx.testPlans.map(t => t.title),
    ...ctx.review.related_test_plans,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const missing: string[] = [];
  if (impact.affected_components.length > 0 && existingPlans.length === 0) {
    missing.push(`Component integration test for: ${impact.affected_components.slice(0, 3).join(', ')}`);
  }
  if (impact.affected_db_tables.length > 0) {
    missing.push(`Database migration test plan for: ${impact.affected_db_tables.slice(0, 2).join(', ')}`);
  }
  if (impact.regression_risk !== 'low') {
    missing.push('Full regression test suite execution');
  }

  const coverage = existingPlans.length > 0
    ? Math.min(100, Math.round((existingPlans.length / Math.max(impact.affected_components.length + 1, 1)) * 100))
    : 0;

  return {
    existing_plans:          existingPlans.slice(0, 8),
    missing_plans:           missing.slice(0, 6),
    coverage_pct:            coverage,
    regression_required:     impact.regression_risk !== 'low',
    recommended_activities:  [
      impact.affected_db_tables.length > 0 ? 'Test all database migrations in staging environment' : null,
      impact.affected_api_endpoints.length > 0 ? 'Execute API contract tests' : null,
      impact.affected_ui_pages.length > 0 ? 'Execute UI smoke tests on affected pages' : null,
      impact.regression_risk !== 'low' ? 'Run full regression suite' : null,
      'Validate EIG relationships post-implementation',
    ].filter(Boolean) as string[],
  };
}

// ─── Module 9: Documentation Assessment ─────────────────────────────────────

function runDocumentationAssessment(ctx: EngineContext, deps: DependencyAnalysisResult, impact: ImpactAnalysisResult): DocumentationAssessmentResult {
  const existing = ctx.docs.filter(d => d.status === 'published').map(d => d.title);
  const missing: string[] = [];
  const updates: string[] = [];

  if (deps.specifications.length === 0 && (deps.ewos.length > 0 || deps.components.length > 0)) {
    missing.push('Engineering Specification for this change');
  }
  if (ctx.docs.filter(d => d.status === 'draft').length > 0) {
    updates.push(...ctx.docs.filter(d => d.status === 'draft').map(d => `Publish draft: ${d.title}`).slice(0, 4));
  }
  if (impact.affected_db_tables.length > 0) {
    updates.push('Update database schema documentation');
  }
  if (impact.affected_api_endpoints.length > 0) {
    updates.push('Update API documentation');
  }

  const recommendedSpecs = deps.ewos.map(e => `Engineering Specification for ${e.name}`).slice(0, 3);

  return {
    existing:          existing.slice(0, 8),
    missing:           missing.slice(0, 6),
    updates_required:  updates.slice(0, 6),
    recommended_specs: recommendedSpecs,
  };
}

// ─── Module 10: AI Reasoning ──────────────────────────────────────────────────

function runAIReasoning(ctx: EngineContext, eig: EIGAnalysisResult, traceability: TraceabilityResult, elpm?: ELPMReport): AIReasoningResult {
  const evidenceCount =
    eig.entities_analysed +
    eig.relationships_traversed +
    ctx.existingReviews.length +
    ctx.testPlans.length +
    ctx.releases.length +
    (elpm ? elpm.learning_summary.learning_sources : 0);

  const historicalBoost = elpm ? (elpm.historical_confidence.historical_confidence * 0.2) : 0;
  const confidence = Math.min(1, (
    (eig.graph_confidence * 0.35) +
    (traceability.completeness_pct / 100 * 0.25) +
    (Math.min(evidenceCount, 30) / 30 * 0.2) +
    historicalBoost + 0.2
  ));

  const summaryParts: string[] = [];
  summaryParts.push(`Analysis based on ${eig.entities_analysed} EIG entities and ${eig.relationships_traversed} relationships.`);
  if (ctx.existingReviews.length > 0) summaryParts.push(`${ctx.existingReviews.length} prior Engineering Review(s) referenced.`);
  if (elpm) {
    if (elpm.similar_artefacts.length > 0) summaryParts.push(`ELPM identified ${elpm.similar_artefacts.length} similar historical artefact(s) — precedent strength: ${elpm.historical_confidence.precedent_strength}.`);
    if (elpm.learning_summary.previous_po_decisions.length > 0) summaryParts.push(`${elpm.learning_summary.previous_po_decisions.length} Product Owner decision(s) applied from Engineering Memory.`);
    if (elpm.pattern_matches.length > 0) summaryParts.push(`${elpm.pattern_matches.length} engineering pattern(s) detected from historical analysis.`);
  }
  if (traceability.missing_links.length > 0) summaryParts.push(`Traceability gaps at: ${traceability.missing_links.join(', ')}.`);
  summaryParts.push(`Combined intelligence confidence: ${Math.round(confidence * 100)}%.`);

  return {
    sources_used: {
      eig_entities:         eig.entities_analysed,
      eig_relationships:    eig.relationships_traversed,
      engineering_reviews:  ctx.existingReviews.length + (elpm?.similar_artefacts.length ?? 0),
      specifications:       ctx.connectedEntities.filter(e => e.entity_type === 'specification').length,
      releases:             ctx.releases.length,
      test_plans:           ctx.testPlans.length,
      benchmarks:           ctx.connectedEntities.filter(e => e.entity_type === 'benchmark').length,
      risks:                ctx.connectedEntities.filter(e => e.entity_type === 'risk').length,
    },
    reasoning_summary: summaryParts.join(' '),
    confidence_score:  Math.round(confidence * 100) / 100,
    evidence_count:    evidenceCount,
  };
}

// ─── Module 11: Quality Score ─────────────────────────────────────────────────

function computeQualityScore(
  eig: EIGAnalysisResult,
  deps: DependencyAnalysisResult,
  impact: ImpactAnalysisResult,
  risks: RiskEntry[],
  traceability: TraceabilityResult,
  readiness: ReleaseReadinessResult,
  testing: TestingAssessmentResult,
  docs: DocumentationAssessmentResult,
  reasoning: AIReasoningResult,
  brief: ExecutiveBrief,
): { score: number; breakdown: QualityBreakdown } {
  const breakdown: QualityBreakdown = {
    traceability:             traceability.completeness_pct,
    dependency_coverage:      Math.min(100, deps.total_dependencies > 0 ? Math.round((deps.total_dependencies / 5) * 100) : 30),
    impact_analysis:          impact.affected_systems.length > 0 ? Math.min(100, 60 + impact.affected_systems.length * 4) : 40,
    risk_assessment:          risks.length > 0 ? Math.min(100, 50 + risks.length * 10) : 30,
    governance_completeness:  Math.round(readiness.gates.filter(g => g.ready).length / readiness.gates.length * 100),
    documentation_completeness: docs.missing.length === 0 ? 100 : Math.max(20, 100 - docs.missing.length * 15),
    testing_completeness:     testing.coverage_pct > 0 ? testing.coverage_pct : 20,
    ai_reasoning_quality:     Math.round(reasoning.confidence_score * 100),
    executive_clarity:        brief.recommendation.length > 0 ? 90 : 50,
  };

  const score = Math.round(Object.values(breakdown).reduce((a, b) => a + b, 0) / Object.keys(breakdown).length);
  return { score, breakdown };
}

// ─── Module 12: Executive Brief ───────────────────────────────────────────────

function buildExecutiveBrief(
  ctx: EngineContext,
  impact: ImpactAnalysisResult,
  risks: RiskEntry[],
  readiness: ReleaseReadinessResult,
  traceability: TraceabilityResult,
): ExecutiveBrief {
  const { review } = ctx;

  const criticalRisks = risks.filter(r => r.severity === 'critical' && r.status === 'open');
  const highRisks = risks.filter(r => r.severity === 'high' && r.status === 'open');

  const whyItMatters = `${review.title} addresses engineering changes in ${review.engineering_area ?? 'the platform'} with ${impact.complexity_score}/10 complexity. Traceability is ${traceability.completeness_pct}% complete.`;

  const businessValue = `Improves platform engineering quality across ${impact.affected_systems.length} system(s) and ${impact.affected_components.length} component(s). Supports ongoing platform evolution and compliance posture.`;

  const engineeringValue = `Provides structured analysis of ${impact.affected_db_tables.length} DB table(s), ${impact.affected_api_endpoints.length} API endpoint(s), and ${impact.affected_ui_pages.length} UI page(s). Implementation effort estimated: ${impact.effort_estimate}.`;

  const riskSummary = criticalRisks.length > 0
    ? criticalRisks.map(r => r.description)
    : highRisks.length > 0
      ? highRisks.map(r => r.description)
      : ['No critical or high-severity risks identified.'];

  const recommendation = readiness.overall_ready
    ? 'Engineering Review analysis is complete. Proceed to Product Owner review.'
    : `Review is not yet release-ready. Address ${readiness.blockers.length > 0 ? 'identified blockers' : 'outstanding items'} before proceeding.`;

  const nextAction = readiness.blockers.length > 0
    ? `Resolve: ${readiness.blockers[0]}`
    : readiness.outstanding_testing.length > 0
      ? `Complete testing: ${readiness.outstanding_testing[0]}`
      : readiness.outstanding_docs.length > 0
        ? `Update documentation: ${readiness.outstanding_docs[0]}`
        : 'Submit for Product Owner approval.';

  return {
    why_it_matters:   whyItMatters,
    business_value:   businessValue,
    engineering_value: engineeringValue,
    risks:            riskSummary.slice(0, 4),
    effort_estimate:  impact.effort_estimate,
    timeline:         impact.complexity_score <= 3 ? 'Same sprint' : impact.complexity_score <= 6 ? '1–2 sprints' : '2–4 sprints',
    release_impact:   impact.release_impact,
    recommendation,
    next_action:      nextAction,
  };
}

// ─── Data Loader ──────────────────────────────────────────────────────────────

async function loadContext(
  review: EngineContext['review'],
  entities: EigEntity[],
  relationships: EigRelationship[],
): Promise<EngineContext> {
  // Find EIG entities linked to this review by matching entity_ref or linked_record_id
  const reviewEntities = entities.filter(e =>
    e.entity_type === 'engineering_review' &&
    (e.entity_ref === review.erc_number || e.linked_record_id === review.id)
  );

  // Also look for EWOs, audits, or specs linked to this review via the review's metadata
  const reviewRelatedRefs = new Set([
    review.erc_number,
    ...review.related_audits,
    ...review.related_phases.map(p => `phase-${p}`),
  ]);

  const additionalEntities = entities.filter(e =>
    e.entity_ref && reviewRelatedRefs.has(e.entity_ref)
  );

  const seedIds = new Set([...reviewEntities.map(e => e.id), ...additionalEntities.map(e => e.id)]);
  if (seedIds.size === 0) {
    // Fall back: treat all active entities as context for breadth
    entities.slice(0, 5).forEach(e => seedIds.add(e.id));
  }

  // 1-hop BFS
  const connectedRelationships = relationships.filter(r => seedIds.has(r.from_entity_id) || seedIds.has(r.to_entity_id));
  const neighbourIds = new Set<string>();
  for (const r of connectedRelationships) {
    if (seedIds.has(r.from_entity_id)) neighbourIds.add(r.to_entity_id);
    if (seedIds.has(r.to_entity_id))   neighbourIds.add(r.from_entity_id);
  }
  // Remove seeds from neighbours to avoid duplication
  for (const id of seedIds) neighbourIds.delete(id);

  const connectedEntities = entities.filter(e => neighbourIds.has(e.id));

  // Side-load reviews, test plans, releases, docs for assessment context
  const [reviewsRes, testPlansRes, releasesRes, docsRes] = await Promise.all([
    supabase.from('ecc_engineering_reviews').select('erc_number,title,type').order('review_date', { ascending: false }).limit(10),
    supabase.from('ecc_test_plans').select('id,title,status').limit(10),
    supabase.from('ecc_release_candidates').select('version:rc_number,status,description').limit(5),
    supabase.from('ecc_documentation').select('title,doc_type,status').limit(15),
  ]);

  return {
    review,
    entities,
    relationships,
    reviewEntities: [...reviewEntities, ...additionalEntities],
    connectedEntities,
    connectedRelationships,
    existingReviews: (reviewsRes.data ?? []) as EngineContext['existingReviews'],
    testPlans:       (testPlansRes.data ?? []).map((t: Record<string, unknown>) => ({ id: String(t.id), title: String(t.title), status: String(t.status) })),
    releases:        (releasesRes.data ?? []).map((r: Record<string, unknown>) => ({ version: String(r.version), status: String(r.status), release_date: null })),
    docs:            (docsRes.data ?? []).map((d: Record<string, unknown>) => ({ title: String(d.title), doc_type: String(d.doc_type), status: String(d.status) })),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the full intelligence engine pipeline for a single Engineering Review.
 * Returns a complete IntelligenceReport. Also persists the report to the DB.
 */
export async function generateIntelligenceReport(
  review: EngineContext['review'],
  entities: EigEntity[],
  relationships: EigRelationship[],
): Promise<IntelligenceReport> {
  const ctx = await loadContext(review, entities, relationships);

  // Run ELPM first — historical search enriches AI reasoning confidence
  let elpm: ELPMReport | undefined;
  try {
    elpm = await generateELPMReport({
      id: review.id,
      erc_number: review.erc_number,
      title: review.title,
      type: review.type,
      engineering_area: review.engineering_area,
      executive_summary: review.executive_summary,
      related_features: review.related_features,
      related_releases: review.related_releases,
      related_test_plans: review.related_test_plans,
      related_audits: review.related_audits,
      related_decisions: review.related_decisions,
      related_ercs: review.related_ercs ?? [],
      metadata: review.metadata,
    });
  } catch {
    // ELPM failure must never block ERIE
  }

  // Run all ERIE modules in dependency order
  const eig        = runEIGAnalysis(ctx);
  const deps       = runDependencyAnalysis(ctx);
  const impact     = runImpactAnalysis(ctx, deps);
  const risks      = runRiskRegister(ctx, impact);
  const traceability = runTraceability(ctx, deps);
  const implPlan   = runImplementationPlan(ctx, deps, impact);
  const testing    = runTestingAssessment(ctx, deps, impact);
  const docs       = runDocumentationAssessment(ctx, deps, impact);
  const readiness  = runReleaseReadiness(ctx, impact, risks, testing, docs);
  const reasoning  = runAIReasoning(ctx, eig, traceability, elpm);
  const brief      = buildExecutiveBrief(ctx, impact, risks, readiness, traceability);
  const { score, breakdown } = computeQualityScore(eig, deps, impact, risks, traceability, readiness, testing, docs, reasoning, brief);

  const report: IntelligenceReport = {
    eig_analysis:                  eig,
    dependency_analysis:           deps,
    impact_analysis:               impact,
    risk_register:                 risks,
    traceability,
    implementation_plan:           implPlan,
    release_readiness:             readiness,
    testing_assessment:            testing,
    documentation_assessment:      docs,
    ai_reasoning:                  reasoning,
    intelligence_quality_score:    score,
    intelligence_quality_breakdown: breakdown,
    executive_brief:               brief,
    intelligence_generated_at:     new Date().toISOString(),
    intelligence_engine_version:   ERIE_VERSION,
  };

  // Persist to DB (non-blocking)
  supabase.from('ecc_engineering_reviews').update({
    eig_analysis:                    report.eig_analysis,
    dependency_analysis:             report.dependency_analysis,
    impact_analysis:                 report.impact_analysis,
    risk_register:                   report.risk_register,
    traceability:                    report.traceability,
    implementation_plan:             report.implementation_plan,
    release_readiness:               report.release_readiness,
    testing_assessment:              report.testing_assessment,
    documentation_assessment:        report.documentation_assessment,
    ai_reasoning:                    report.ai_reasoning,
    intelligence_quality_score:      report.intelligence_quality_score,
    intelligence_quality_breakdown:  report.intelligence_quality_breakdown,
    executive_brief:                 report.executive_brief,
    intelligence_generated_at:       report.intelligence_generated_at,
    intelligence_engine_version:     report.intelligence_engine_version,
  }).eq('id', review.id).then();

  return report;
}

/**
 * Load a cached intelligence report from the DB. Returns null if stale or absent.
 */
export async function loadCachedIntelligence(reviewId: string): Promise<IntelligenceReport | null> {
  const { data } = await supabase
    .from('ecc_engineering_reviews')
    .select('eig_analysis,dependency_analysis,impact_analysis,risk_register,traceability,implementation_plan,release_readiness,testing_assessment,documentation_assessment,ai_reasoning,intelligence_quality_score,intelligence_quality_breakdown,executive_brief,intelligence_generated_at,intelligence_engine_version')
    .eq('id', reviewId)
    .maybeSingle();

  if (!data?.intelligence_generated_at) return null;
  if (data.intelligence_engine_version !== ERIE_VERSION) return null;

  // Stale if older than 24 hours
  const age = Date.now() - new Date(data.intelligence_generated_at as string).getTime();
  if (age > 1000 * 60 * 60 * 24) return null;

  return data as unknown as IntelligenceReport;
}
