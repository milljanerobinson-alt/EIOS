/**
 * Engineering Planning & Recommendation Engine (EPRE) v1.0
 *
 * Analyses the live engineering programme and produces a structured
 * recommendation for the highest-value next Engineering Work Order.
 *
 * Architecture is designed to support future AI-driven analysis,
 * automatic dependency graph traversal, sprint planning, and
 * release optimisation. The v1.0 engine is deterministic.
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EWOStatus =
  | 'draft' | 'architecture_review' | 'engineering_approved' | 'po_approved'
  | 'ready' | 'in_progress' | 'engineering_validation' | 'report_generated'
  | 'po_acceptance' | 'closed' | 'archived';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface EWO {
  id: string;
  ewo_ref: string;
  title: string;
  executive_summary: string | null;
  business_objective: string | null;
  engineering_objective: string | null;
  priority: Priority;
  risk_level: string;
  estimated_effort: string | null;
  owner: string | null;
  status: EWOStatus;
  dependencies: string[];
  related_features: string[];
  related_releases: string[];
  business_value: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface ScoredEWO {
  ewo: EWO;
  score: number;
  isBlocked: boolean;
  blockingDependencies: string[];
  readinessLevel: number;    // 1–5: how close to implementation
  reasoning: string[];
}

export interface DependencyEdge {
  from: string;   // ewo_ref that depends on...
  to: string;     // ewo_ref it depends on
  resolved: boolean;
}

export interface ProgrammeHealth {
  totalEwos: number;
  activeEwos: number;
  inProgressCount: number;
  blockedCount: number;
  completedCount: number;
  archivedCount: number;
  healthScore: number;       // 0–100
  velocity30d: number;       // EWOs closed in last 30 days
  started30d: number;
  criticalCount: number;
  highCount: number;
  completionRate: number;    // % of all EWOs that are closed
}

export interface EpreRecommendation {
  runRef: string;
  recommendedEwo: EWO | null;
  execSummary: string;
  businessValue: string;
  engineeringValue: string;
  strategicAlignment: string;
  estimatedEffort: string;
  estimatedRisk: string;
  reasoning: string;
  recommendedNextAction: string;
  scoredProgramme: ScoredEWO[];
  blockedEwos: ScoredEWO[];
  highPriorityQueue: ScoredEWO[];  // top 5 unblocked EWOs after recommended
  dependencyGraph: Record<string, string[]>;
  dependencyEdges: DependencyEdge[];
  health: ProgrammeHealth;
  analysisNotes: string;
}

// ─── Scoring constants ────────────────────────────────────────────────────────

const PRIORITY_SCORE: Record<Priority, number> = {
  critical: 50,
  high:     35,
  medium:   20,
  low:      8,
};

const STATUS_READINESS: Partial<Record<EWOStatus, number>> = {
  draft:                  1,
  architecture_review:    2,
  engineering_approved:   3,
  po_approved:            4,
  ready:                  5,
};

const STATUS_READINESS_SCORE: Partial<Record<EWOStatus, number>> = {
  draft:                  5,
  architecture_review:    10,
  engineering_approved:   20,
  po_approved:            28,
  ready:                  35,
};

const ACTIVE_STATUSES: EWOStatus[] = [
  'draft', 'architecture_review', 'engineering_approved', 'po_approved',
  'ready', 'in_progress', 'engineering_validation', 'report_generated', 'po_acceptance',
];

const CLOSED_STATUSES: EWOStatus[] = ['closed', 'archived'];

// ─── Core engine ──────────────────────────────────────────────────────────────

function buildDependencyGraph(ewos: EWO[]): {
  graph: Record<string, string[]>;
  edges: DependencyEdge[];
} {
  const graph: Record<string, string[]> = {};
  const edges: DependencyEdge[] = [];
  const closedRefs = new Set(ewos.filter(e => CLOSED_STATUSES.includes(e.status)).map(e => e.ewo_ref));

  for (const ewo of ewos) {
    graph[ewo.ewo_ref] = [];
    for (const dep of ewo.dependencies) {
      const resolved = closedRefs.has(dep);
      graph[ewo.ewo_ref].push(dep);
      edges.push({ from: ewo.ewo_ref, to: dep, resolved });
    }
  }
  return { graph, edges };
}

function scoreEWO(ewo: EWO, allEwos: EWO[]): ScoredEWO {
  const reasoning: string[] = [];
  let score = 0;

  // Only score actionable statuses (pre-in-progress)
  const actionable = STATUS_READINESS[ewo.status] !== undefined;
  if (!actionable) {
    return {
      ewo, score: -999, isBlocked: false,
      blockingDependencies: [], readinessLevel: 0, reasoning: ['Not in a plannable state'],
    };
  }

  // Priority score
  const ps = PRIORITY_SCORE[ewo.priority];
  score += ps;
  reasoning.push(`Priority ${ewo.priority}: +${ps} pts`);

  // Readiness score
  const rs = STATUS_READINESS_SCORE[ewo.status] ?? 0;
  score += rs;
  reasoning.push(`Status "${ewo.status}" readiness: +${rs} pts`);

  // Dependency analysis
  const closedRefs = new Set(allEwos.filter(e => CLOSED_STATUSES.includes(e.status)).map(e => e.ewo_ref));
  const blockingDeps: string[] = [];
  for (const dep of ewo.dependencies) {
    if (!closedRefs.has(dep)) {
      blockingDeps.push(dep);
    }
  }

  const isBlocked = blockingDeps.length > 0;
  if (isBlocked) {
    score -= 60;
    reasoning.push(`BLOCKED by ${blockingDeps.join(', ')}: -60 pts`);
  } else if (ewo.dependencies.length > 0) {
    score += 5;
    reasoning.push(`All ${ewo.dependencies.length} dependencies resolved: +5 pts`);
  }

  // Risk: higher risk slightly reduces score unless it's critical priority
  const riskPenalty: Record<string, number> = { critical: -5, high: -2, medium: 0, low: 0 };
  const rp = riskPenalty[ewo.risk_level] ?? 0;
  if (rp !== 0) {
    score += rp;
    reasoning.push(`Risk level ${ewo.risk_level}: ${rp} pts`);
  }

  // Is something else depending on this? If so, boost (unblocking value)
  const dependents = allEwos.filter(e =>
    ACTIVE_STATUSES.includes(e.status) &&
    e.dependencies.includes(ewo.ewo_ref)
  );
  if (dependents.length > 0) {
    const boost = dependents.length * 8;
    score += boost;
    reasoning.push(`Unblocks ${dependents.length} work order(s): +${boost} pts`);
  }

  return {
    ewo,
    score,
    isBlocked,
    blockingDependencies: blockingDeps,
    readinessLevel: STATUS_READINESS[ewo.status] ?? 0,
    reasoning,
  };
}

function computeHealth(ewos: EWO[]): ProgrammeHealth {
  const now = Date.now();
  const d30 = now - 30 * 24 * 60 * 60 * 1000;

  const active = ewos.filter(e => ACTIVE_STATUSES.includes(e.status));
  const completed = ewos.filter(e => e.status === 'closed');
  const archived = ewos.filter(e => e.status === 'archived');
  const inProgress = ewos.filter(e => ['in_progress', 'engineering_validation', 'report_generated', 'po_acceptance'].includes(e.status));

  const velocity30d = ewos.filter(e =>
    e.status === 'closed' && e.closed_at && new Date(e.closed_at).getTime() > d30
  ).length;

  const started30d = ewos.filter(e =>
    e.started_at && new Date(e.started_at).getTime() > d30
  ).length;

  // Detect blocked
  const closedRefs = new Set(ewos.filter(e => CLOSED_STATUSES.includes(e.status)).map(e => e.ewo_ref));
  const blockedCount = active.filter(e =>
    e.dependencies.some(dep => !closedRefs.has(dep))
  ).length;

  const completionRate = ewos.length > 0 ? Math.round((completed.length / ewos.length) * 100) : 0;

  // Health score formula:
  // Base 60 + velocity bonus + penalise blocked + penalise high ratio of critical/high blocked
  let health = 60;
  if (velocity30d >= 2) health += 20;
  else if (velocity30d === 1) health += 10;
  if (blockedCount === 0 && active.length > 0) health += 10;
  if (blockedCount > 0) health -= Math.min(blockedCount * 5, 20);
  if (inProgress.length > 0) health += 5;
  if (active.filter(e => e.priority === 'critical').length > 3) health -= 10;
  health = Math.max(0, Math.min(100, health));

  return {
    totalEwos: ewos.length,
    activeEwos: active.length,
    inProgressCount: inProgress.length,
    blockedCount,
    completedCount: completed.length,
    archivedCount: archived.length,
    healthScore: health,
    velocity30d,
    started30d,
    criticalCount: ewos.filter(e => e.priority === 'critical' && ACTIVE_STATUSES.includes(e.status)).length,
    highCount: ewos.filter(e => e.priority === 'high' && ACTIVE_STATUSES.includes(e.status)).length,
    completionRate,
  };
}

function buildReasoning(top: ScoredEWO, health: ProgrammeHealth, allScored: ScoredEWO[]): {
  execSummary: string;
  businessValue: string;
  engineeringValue: string;
  strategicAlignment: string;
  estimatedEffort: string;
  estimatedRisk: string;
  reasoning: string;
  recommendedNextAction: string;
} {
  if (!top) {
    return {
      execSummary: 'No actionable work orders found in the current engineering programme.',
      businessValue: 'N/A',
      engineeringValue: 'N/A',
      strategicAlignment: 'N/A',
      estimatedEffort: 'N/A',
      estimatedRisk: 'N/A',
      reasoning: 'The EPRE found no unblocked, actionable Engineering Work Orders. Consider creating new EWOs or resolving blocking dependencies.',
      recommendedNextAction: 'Create a new Engineering Work Order via the EEE.',
    };
  }

  const ewo = top.ewo;
  const blockedNote = health.blockedCount > 0
    ? ` Note: ${health.blockedCount} work order(s) are currently blocked and were excluded from this recommendation.`
    : '';

  const velocityNote = health.velocity30d > 0
    ? ` Engineering velocity is ${health.velocity30d} EWO(s) closed in the last 30 days.`
    : ' No EWOs have been closed in the last 30 days — consider accelerating delivery.';

  const depNote = ewo.dependencies.length > 0
    ? ` All ${ewo.dependencies.length} upstream dependencies (${ewo.dependencies.join(', ')}) are closed.`
    : ' This work order has no upstream dependencies.';

  const unblockingEwos = allScored.filter(s =>
    s.ewo.dependencies.includes(ewo.ewo_ref) &&
    ACTIVE_STATUSES.includes(s.ewo.status)
  );
  const unblockingNote = unblockingEwos.length > 0
    ? ` Completing this EWO will unblock ${unblockingEwos.length} downstream work order(s): ${unblockingEwos.map(s => s.ewo.ewo_ref).join(', ')}.`
    : '';

  const reasoning = [
    `EPRE scored ${allScored.filter(s => s.score > -999).length} actionable work orders.`,
    `${ewo.ewo_ref} achieved the highest composite score (${top.score} pts).`,
    `Score components: ${top.reasoning.join(' | ')}.`,
    depNote,
    unblockingNote,
    blockedNote,
    velocityNote,
  ].filter(Boolean).join(' ');

  const nextActionMap: Partial<Record<EWOStatus, string>> = {
    draft: 'Submit EWO for Architecture Review to advance through the lifecycle.',
    architecture_review: 'Complete the Architecture Review and advance to Engineering Approved.',
    engineering_approved: 'Obtain Product Owner Approval to unlock implementation.',
    po_approved: 'Mark as Ready for Implementation when resourcing is confirmed.',
    ready: 'Start Implementation — this EWO is fully approved and unblocked.',
  };

  return {
    execSummary: ewo.executive_summary || `${ewo.ewo_ref} is the highest-value next Engineering Work Order based on EPRE analysis.`,
    businessValue: ewo.business_value || `Delivers ${ewo.priority} priority business outcome.`,
    engineeringValue: ewo.engineering_objective || 'Advances the engineering programme.',
    strategicAlignment: `Priority: ${ewo.priority.toUpperCase()}. Risk: ${ewo.risk_level.toUpperCase()}. Aligns with current engineering phase.`,
    estimatedEffort: ewo.estimated_effort || 'Not specified',
    estimatedRisk: ewo.risk_level.charAt(0).toUpperCase() + ewo.risk_level.slice(1),
    reasoning,
    recommendedNextAction: nextActionMap[ewo.status] || 'Advance through the lifecycle.',
  };
}

// ─── Main analysis function ───────────────────────────────────────────────────

export async function runProgrammeAnalysis(ewos: EWO[]): Promise<EpreRecommendation> {

  // Score all plannable EWOs
  const plannable = ewos.filter(e =>
    STATUS_READINESS[e.status] !== undefined
  );

  const scored = plannable.map(e => scoreEWO(e, ewos));
  const unblocked = scored.filter(s => !s.isBlocked && s.score > -999);
  const blocked = scored.filter(s => s.isBlocked);

  // Sort by score descending
  const sorted = [...unblocked].sort((a, b) => b.score - a.score);

  const top = sorted[0] ?? null;
  const queue = sorted.slice(1, 6); // next 5 after top

  const { graph, edges } = buildDependencyGraph(ewos);
  const health = computeHealth(ewos);

  const {
    execSummary, businessValue, engineeringValue, strategicAlignment,
    estimatedEffort, estimatedRisk, reasoning, recommendedNextAction,
  } = buildReasoning(top, health, scored);

  // Generate run ref
  const { count } = await supabase
    .from('epre_recommendations')
    .select('*', { count: 'exact', head: true });
  const runRef = `EPRE-RUN-${String((count ?? 0) + 1).padStart(3, '0')}`;

  const analysisNotes = [
    `Analysis run: ${new Date().toLocaleString('en-AU')}`,
    `Engine: EPRE-v1.0 (deterministic)`,
    `Programme size: ${ewos.length} total EWOs`,
    `Plannable: ${plannable.length} | Unblocked: ${unblocked.length} | Blocked: ${blocked.length}`,
    `Health score: ${health.healthScore}/100`,
  ].join(' | ');

  const rec: EpreRecommendation = {
    runRef,
    recommendedEwo: top?.ewo ?? null,
    execSummary,
    businessValue,
    engineeringValue,
    strategicAlignment,
    estimatedEffort,
    estimatedRisk,
    reasoning,
    recommendedNextAction,
    scoredProgramme: scored,
    blockedEwos: blocked,
    highPriorityQueue: queue,
    dependencyGraph: graph,
    dependencyEdges: edges,
    health,
    analysisNotes,
  };

  // Persist recommendation
  await supabase.from('epre_recommendations').insert({
    run_ref: runRef,
    recommended_ewo_ref: top?.ewo.ewo_ref ?? null,
    recommended_ewo_id: top?.ewo.id ?? null,
    recommended_title: top?.ewo.title ?? null,
    exec_summary: execSummary,
    business_value: businessValue,
    engineering_value: engineeringValue,
    strategic_alignment: strategicAlignment,
    estimated_effort: estimatedEffort,
    estimated_risk: estimatedRisk,
    reasoning,
    recommended_next_action: recommendedNextAction,
    scored_programme: scored.map(s => ({
      ewo_ref: s.ewo.ewo_ref,
      title: s.ewo.title,
      score: s.score,
      isBlocked: s.isBlocked,
      blockingDependencies: s.blockingDependencies,
      readinessLevel: s.readinessLevel,
      reasoning: s.reasoning,
    })),
    blocked_ewos: blocked.map(s => s.ewo.ewo_ref),
    dependency_graph: graph,
    high_priority_queue: queue.map(s => s.ewo.ewo_ref),
    total_ewos: health.totalEwos,
    active_ewos: health.activeEwos,
    blocked_count: health.blockedCount,
    completed_count: health.completedCount,
    in_progress_count: health.inProgressCount,
    health_score: health.healthScore,
    ewos_closed_30d: health.velocity30d,
    ewos_started_30d: health.started30d,
    generated_by: 'ATD',
    engine_version: 'EPRE-v1.0',
    analysis_notes: analysisNotes,
  });

  // Save snapshot
  await supabase.from('epre_programme_snapshots').insert({
    snapshot_date: new Date().toISOString().split('T')[0],
    total_ewos: health.totalEwos,
    active_ewos: health.activeEwos,
    blocked_count: health.blockedCount,
    completed_count: health.completedCount,
    in_progress_count: health.inProgressCount,
    health_score: health.healthScore,
    velocity_30d: health.velocity30d,
    notes: analysisNotes,
  });

  return rec;
}

// ─── Load latest recommendation ───────────────────────────────────────────────

export async function loadLatestRecommendation(): Promise<{
  run: Record<string, unknown>;
  ewos: EWO[];
} | null> {
  const [recRes, ewoRes] = await Promise.all([
    supabase
      .from('epre_recommendations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('engineering_work_orders')
      .select('*')
      .order('created_at', { ascending: false }),
  ]);
  if (!recRes.data) return null;
  return { run: recRes.data as Record<string, unknown>, ewos: (ewoRes.data ?? []) as EWO[] };
}
