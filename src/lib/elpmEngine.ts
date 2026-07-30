/**
 * Engineering Learning, Precedent & Memory Engine (ELPM)
 *
 * Runs BEFORE the Engineering Review Intelligence Engine.
 * Searches historical engineering knowledge, calculates similarity,
 * extracts lessons, builds Engineering Memory, and provides historical
 * confidence before any new Engineering Review is generated.
 *
 * Engine version — bump to invalidate cached ELPM reports.
 */

import { supabase } from './supabase';
import {
  loadConversationIntelligenceForELPM,
  type ConversationIntelligenceSummary,
} from './conversationIntelligenceService';

export const ELPM_VERSION = '1.1'; // bump: conversation intelligence integrated

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface SimilarArtefact {
  id: string;
  ref: string;
  title: string;
  artefact_type: 'engineering_review' | 'ewo' | 'specification' | 'test_plan' | 'release' | 'audit' | 'benchmark' | 'risk' | 'roadmap_item' | 'conversation';
  similarity_score: number;      // 0–100
  similarity_reason: string;
  confidence: number;            // 0–1
  outcome: string | null;
  status: string;
  engineering_area: string | null;
  created_at: string;
  reusable_assets: string[];
  lineage_status: 'current_baseline' | 'active' | 'superseded' | 'archived' | 'deprecated';
}

export interface MemoryEntry {
  id: string;
  memory_type: 'governance_standard' | 'architecture_principle' | 'engineering_preference' | 'documentation_standard' | 'testing_standard' | 'review_convention' | 'platform_decision' | 'po_decision';
  title: string;
  content: string;
  weight: number;        // 1–5 (5 = highest authority)
  source_type: string;
  source_ref: string;
  is_superseded: boolean;
  created_at: string;
  applies_to: string[];  // engineering areas / types this applies to
  learning_classification: 'platform' | 'domain' | 'infrastructure' | 'engineering_practice' | 'commercial_platform' | 'future_product';
}

export interface EngineeringLearningSummary {
  previous_approaches: string[];
  previous_decisions: string[];
  previous_po_decisions: string[];
  previous_challenges: string[];
  previous_regressions: string[];
  previous_testing_issues: string[];
  previous_benchmark_outcomes: string[];
  previous_audit_findings: string[];
  previous_release_observations: string[];
  previous_governance_decisions: string[];
  lessons_applied: string[];
  learning_sources: number;
  conversation_decisions: string[];
  conversation_lessons: string[];
  conversation_recommendations: string[];
}

export interface ReusableAsset {
  id: string;
  type: 'implementation_plan' | 'test_plan' | 'specification' | 'benchmark' | 'release_checklist' | 'risk_mitigation' | 'engineering_review' | 'documentation' | 'engineering_pattern';
  title: string;
  ref: string | null;
  confidence: number;
  reuse_recommendation: string;
  source_review_ref: string | null;
}

export interface HistoricalRiskSummary {
  common_implementation_risks: string[];
  common_regression_causes: string[];
  frequently_missing_docs: string[];
  frequently_missing_testing: string[];
  frequently_delayed_approvals: string[];
  repeated_governance_findings: string[];
  frequently_impacted_modules: string[];
  total_historical_risks: number;
}

export interface LineageEntry {
  ref: string;
  title: string;
  status: 'current_baseline' | 'active' | 'superseded' | 'archived' | 'deprecated';
  relationship: 'current' | 'supersedes' | 'superseded_by' | 'replaced_by' | 'related';
  engineering_area: string | null;
  created_at: string;
}

export interface EngineeringLineage {
  current_baseline: SimilarArtefact | null;
  lineage_chain: LineageEntry[];
  revision_count: number;
  evolution_description: string;
}

export interface HistoricalConfidence {
  historical_reviews_found: number;
  similar_work_found: boolean;
  historical_success_rate: number;   // 0–100
  historical_confidence: number;     // 0–1
  ai_confidence: number;             // 0–1 (filled by caller from ERIE)
  combined_confidence: number;       // 0–1
  confidence_basis: string;
  precedent_strength: 'strong' | 'moderate' | 'weak' | 'none';
}

export interface RecommendationEvolution {
  previous_recommendation: string | null;
  previous_review_ref: string | null;
  current_recommendation: string;
  why_changed: string;
  supporting_evidence: string[];
  evolution_maturity: 'first_iteration' | 'evolved' | 'stable' | 'superseded';
}

export interface EngineeringEvolutionSummary {
  has_prior_work: boolean;
  revision_count: number;
  current_baseline_ref: string | null;
  valid_historical_recommendations: string[];
  superseded_recommendations: string[];
  evolution_explanation: string;
  timeline_entries: TimelineEntry[];
}

export interface TimelineEntry {
  date: string;
  ref: string;
  title: string;
  event_type: string;
  significance: string;
  outcome: string | null;
}

export interface HistoricalComparison {
  previous_recommendation: string | null;
  previous_review_ref: string | null;
  current_recommendation: string;
  new_intelligence: string[];
  new_risks: string[];
  new_dependencies: string[];
  po_decisions_applied: string[];
  lessons_reused: string[];
  improvements: string[];
}

export interface PatternMatch {
  pattern_name: string;
  pattern_description: string;
  matched_artefacts: string[];
  confidence: number;
  recommended_workflow: string[];
}

export interface ELPMReport {
  similar_artefacts: SimilarArtefact[];
  top_similar: SimilarArtefact | null;
  learning_summary: EngineeringLearningSummary;
  reusable_assets: ReusableAsset[];
  historical_risk_summary: HistoricalRiskSummary;
  memory_entries: MemoryEntry[];
  engineering_lineage: EngineeringLineage;
  historical_confidence: HistoricalConfidence;
  recommendation_evolution: RecommendationEvolution;
  evolution_summary: EngineeringEvolutionSummary;
  historical_comparison: HistoricalComparison;
  pattern_matches: PatternMatch[];
  conversation_intelligence: ConversationIntelligenceSummary[];
  elpm_generated_at: string;
  elpm_engine_version: string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface ELPMReviewContext {
  id: string;
  erc_number: string;
  title: string;
  type: string;
  engineering_area: string | null;
  executive_summary: string | null;
  related_features: string[];
  related_releases: string[];
  related_test_plans: string[];
  related_audits: string[];
  related_decisions: string[];
  related_ercs: string[];
  metadata: Record<string, unknown> | null;
}

interface ELPMContext {
  review: ELPMReviewContext;
  allReviews: HistoricalReview[];
  memoryEntries: MemoryEntry[];
  testPlans: Array<{ id: string; title: string; status: string; related_reviews?: string[] }>;
  releases: Array<{ id: string; version: string; status: string; title?: string; created_at: string }>;
  audits: Array<{ id: string; title: string; status: string; audit_date: string | null; engineering_area?: string | null }>;
  conversationIntelligence: ConversationIntelligenceSummary[];
}

interface HistoricalReview {
  id: string;
  erc_number: string;
  title: string;
  type: string;
  status: string;
  engineering_area: string | null;
  executive_summary: string | null;
  engineering_decision: string | null;
  lessons_learned: string | null;
  future_recommendations: string | null;
  regression_testing: string | null;
  related_features: string[];
  related_releases: string[];
  related_test_plans: string[];
  related_audits: string[];
  related_ercs: string[];
  is_reference: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

// ─── Similarity Scoring ───────────────────────────────────────────────────────

function scoreSimilarity(
  current: ELPMReviewContext,
  candidate: HistoricalReview,
): { score: number; reason: string } {
  if (candidate.erc_number === current.erc_number) return { score: 0, reason: '' };

  let score = 0;
  const reasons: string[] = [];

  // Same type (25 pts)
  if (candidate.type === current.type) {
    score += 25;
    reasons.push(`same review type (${candidate.type.replace(/_/g, ' ')})`);
  }

  // Same engineering area (20 pts)
  if (current.engineering_area && candidate.engineering_area &&
      current.engineering_area.toLowerCase() === candidate.engineering_area.toLowerCase()) {
    score += 20;
    reasons.push(`same engineering area (${current.engineering_area})`);
  }

  // Shared features (up to 20 pts)
  const sharedFeatures = current.related_features.filter(f => candidate.related_features.includes(f));
  if (sharedFeatures.length > 0) {
    const pts = Math.min(20, sharedFeatures.length * 5);
    score += pts;
    reasons.push(`${sharedFeatures.length} shared feature(s)`);
  }

  // Shared releases (up to 10 pts)
  const sharedReleases = current.related_releases.filter(r => candidate.related_releases.includes(r));
  if (sharedReleases.length > 0) {
    score += Math.min(10, sharedReleases.length * 5);
    reasons.push(`${sharedReleases.length} shared release(s)`);
  }

  // Shared test plans (up to 10 pts)
  const sharedTestPlans = current.related_test_plans.filter(t => candidate.related_test_plans.includes(t));
  if (sharedTestPlans.length > 0) {
    score += Math.min(10, sharedTestPlans.length * 5);
    reasons.push(`${sharedTestPlans.length} shared test plan(s)`);
  }

  // Related ERC references (5 pts)
  if (current.related_ercs.includes(candidate.erc_number) || candidate.related_ercs.includes(current.erc_number)) {
    score += 5;
    reasons.push('directly linked ERCs');
  }

  // Reference review bonus (5 pts)
  if (candidate.is_reference) {
    score += 5;
    reasons.push('reference review');
  }

  // Title keyword overlap (up to 5 pts)
  const currentWords = new Set(current.title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const candidateWords = candidate.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const keywordHits = candidateWords.filter(w => currentWords.has(w)).length;
  if (keywordHits > 0) {
    score += Math.min(5, keywordHits * 2);
    reasons.push(`${keywordHits} keyword(s) in common`);
  }

  return {
    score: Math.min(100, score),
    reason: reasons.length > 0 ? reasons.join('; ') : 'general engineering similarity',
  };
}

// ─── Module 1: Historical Search & Similarity ────────────────────────────────

function runHistoricalSearch(ctx: ELPMContext): SimilarArtefact[] {
  const results: SimilarArtefact[] = [];

  for (const candidate of ctx.allReviews) {
    if (candidate.erc_number === ctx.review.erc_number) continue;

    const { score, reason } = scoreSimilarity(ctx.review, candidate);
    if (score < 10) continue;

    const lineageStatus = determineLineageStatus(candidate, ctx.review);
    const reusable: string[] = [];
    if (candidate.engineering_decision) reusable.push('Engineering decision');
    if (candidate.lessons_learned) reusable.push('Lessons learned');
    if (candidate.future_recommendations) reusable.push('Future recommendations');
    if (candidate.regression_testing) reusable.push('Regression testing notes');
    if (candidate.related_test_plans.length > 0) reusable.push(`${candidate.related_test_plans.length} test plan(s)`);

    results.push({
      id: candidate.id,
      ref: candidate.erc_number,
      title: candidate.title,
      artefact_type: 'engineering_review',
      similarity_score: score,
      similarity_reason: reason,
      confidence: Math.min(1, score / 100),
      outcome: candidate.is_reference ? 'accepted_reference' : candidate.status === 'closed' ? 'closed' : null,
      status: candidate.status,
      engineering_area: candidate.engineering_area,
      created_at: candidate.created_at,
      reusable_assets: reusable,
      lineage_status,
    });
  }

  return results.sort((a, b) => b.similarity_score - a.similarity_score).slice(0, 10);
}

function determineLineageStatus(
  candidate: HistoricalReview,
  current: ELPMReviewContext,
): SimilarArtefact['lineage_status'] {
  if (current.related_ercs.includes(candidate.erc_number)) return 'superseded';
  if (candidate.related_ercs.includes(current.erc_number)) return 'superseded';
  if (candidate.is_reference) return 'current_baseline';
  if (candidate.status === 'closed') return 'active';
  if (candidate.status === 'superseded') return 'superseded';
  return 'active';
}

// ─── Module 2: Engineering Learning Extraction ───────────────────────────────

function runEngineeringLearning(ctx: ELPMContext, similar: SimilarArtefact[]): EngineeringLearningSummary {
  const topSimilar = ctx.allReviews.filter(r =>
    similar.some(s => s.ref === r.erc_number)
  );

  const previousApproaches: string[] = [];
  const previousDecisions: string[] = [];
  const previousChallenges: string[] = [];
  const previousRegressions: string[] = [];
  const previousTestingIssues: string[] = [];
  const previousBenchmarkOutcomes: string[] = [];
  const previousAuditFindings: string[] = [];
  const previousReleaseObs: string[] = [];
  const previousGovernance: string[] = [];
  const lessonsApplied: string[] = [];

  for (const r of topSimilar.slice(0, 5)) {
    if (r.engineering_decision) {
      previousDecisions.push(`${r.erc_number}: ${r.engineering_decision.slice(0, 120)}`);
    }
    if (r.lessons_learned) {
      const lessons = r.lessons_learned.split(/\n|\./).filter(l => l.trim().length > 10).slice(0, 2);
      previousApproaches.push(...lessons.map(l => `${r.erc_number}: ${l.trim()}`));
    }
    if (r.future_recommendations) {
      lessonsApplied.push(`${r.erc_number}: ${r.future_recommendations.slice(0, 100)}`);
    }
    if (r.regression_testing) {
      previousRegressions.push(`${r.erc_number}: ${r.regression_testing.slice(0, 100)}`);
    }
    if (r.related_audits.length > 0) {
      previousAuditFindings.push(`${r.erc_number}: linked to ${r.related_audits.join(', ')}`);
    }
    if (r.related_releases.length > 0) {
      previousReleaseObs.push(`${r.erc_number}: released in ${r.related_releases.join(', ')}`);
    }
    if (r.is_reference) {
      previousGovernance.push(`${r.erc_number} is a Reference Engineering Review — apply its decisions`);
    }
  }

  // PO decisions from memory entries
  const poDecisions = ctx.memoryEntries
    .filter(m => m.memory_type === 'po_decision' && !m.is_superseded)
    .map(m => `${m.source_ref}: ${m.title}`)
    .slice(0, 5);

  // Conversation intelligence: decisions and lessons
  const convDecisions: string[] = [];
  const convLessons: string[] = [];
  const convRecs: string[] = [];
  for (const ci of ctx.conversationIntelligence.slice(0, 5)) {
    for (const d of ci.extracted_decisions.slice(0, 2)) {
      convDecisions.push(`[${ci.conversation_title.slice(0, 40)}] ${d.decision.slice(0, 120)}`);
    }
    for (const l of ci.extracted_lessons.slice(0, 2)) {
      convLessons.push(`[${ci.conversation_title.slice(0, 40)}] ${l.lesson.slice(0, 120)}`);
    }
    for (const r of ci.extracted_recommendations.slice(0, 1)) {
      convRecs.push(`[${ci.conversation_title.slice(0, 40)}] ${r.recommendation.slice(0, 120)}`);
    }
  }

  return {
    previous_approaches:          previousApproaches.slice(0, 6),
    previous_decisions:           previousDecisions.slice(0, 6),
    previous_po_decisions:        poDecisions,
    previous_challenges:          previousChallenges,
    previous_regressions:         previousRegressions.slice(0, 4),
    previous_testing_issues:      previousTestingIssues,
    previous_benchmark_outcomes:  previousBenchmarkOutcomes,
    previous_audit_findings:      previousAuditFindings.slice(0, 4),
    previous_release_observations: previousReleaseObs.slice(0, 4),
    previous_governance_decisions: previousGovernance.slice(0, 4),
    lessons_applied:              lessonsApplied.slice(0, 5),
    learning_sources:             topSimilar.length + ctx.memoryEntries.length + ctx.conversationIntelligence.length,
    conversation_decisions:       convDecisions.slice(0, 5),
    conversation_lessons:         convLessons.slice(0, 5),
    conversation_recommendations: convRecs.slice(0, 4),
  };
}

// ─── Module 3: Reusable Asset Discovery ──────────────────────────────────────

function runReusableAssetDiscovery(ctx: ELPMContext, similar: SimilarArtefact[]): ReusableAsset[] {
  const assets: ReusableAsset[] = [];
  const topSimilar = ctx.allReviews.filter(r => similar.some(s => s.ref === r.erc_number));

  for (const r of topSimilar.slice(0, 5)) {
    if (r.engineering_decision) {
      assets.push({
        id: `${r.id}-decision`,
        type: 'engineering_review',
        title: `Engineering decision from ${r.erc_number}`,
        ref: r.erc_number,
        confidence: Math.min(1, (similar.find(s => s.ref === r.erc_number)?.similarity_score ?? 0) / 100),
        reuse_recommendation: `Reuse the engineering decision: ${r.engineering_decision.slice(0, 80)}`,
        source_review_ref: r.erc_number,
      });
    }
    for (const tp of r.related_test_plans.slice(0, 2)) {
      const found = ctx.testPlans.find(t => t.id === tp || t.title === tp);
      if (found) {
        assets.push({
          id: `${found.id}-tp`,
          type: 'test_plan',
          title: found.title,
          ref: tp,
          confidence: 0.8,
          reuse_recommendation: `Reuse or reference test plan from ${r.erc_number}`,
          source_review_ref: r.erc_number,
        });
      }
    }
    if (r.lessons_learned) {
      assets.push({
        id: `${r.id}-pattern`,
        type: 'engineering_pattern',
        title: `Engineering pattern from ${r.erc_number}: ${r.title.slice(0, 50)}`,
        ref: r.erc_number,
        confidence: 0.75,
        reuse_recommendation: `Apply lessons learned from ${r.erc_number}`,
        source_review_ref: r.erc_number,
      });
    }
  }

  // Memory-based reusable assets (governance + architecture principles)
  for (const m of ctx.memoryEntries.filter(m => !m.is_superseded).slice(0, 5)) {
    assets.push({
      id: `mem-${m.id}`,
      type: 'documentation',
      title: m.title,
      ref: m.source_ref,
      confidence: m.weight / 5,
      reuse_recommendation: `Apply standing ${m.memory_type.replace(/_/g, ' ')}: ${m.content.slice(0, 80)}`,
      source_review_ref: m.source_ref,
    });
  }

  return assets.slice(0, 12);
}

// ─── Module 4: Historical Risk Prediction ────────────────────────────────────

function runHistoricalRiskPrediction(ctx: ELPMContext, similar: SimilarArtefact[]): HistoricalRiskSummary {
  const topSimilar = ctx.allReviews.filter(r => similar.some(s => s.ref === r.erc_number));

  const riskCandidates: string[] = [];
  const regressionCauses: string[] = [];
  const missingDocs: string[] = [];
  const missingTesting: string[] = [];
  const impactedModules: string[] = [];

  for (const r of topSimilar.slice(0, 6)) {
    if (r.regression_testing) regressionCauses.push(`${r.erc_number}: ${r.regression_testing.slice(0, 80)}`);
    if (r.lessons_learned && r.lessons_learned.toLowerCase().includes('test')) missingTesting.push(`${r.erc_number}: testing gap noted`);
    if (r.lessons_learned && r.lessons_learned.toLowerCase().includes('doc')) missingDocs.push(`${r.erc_number}: documentation gap noted`);
    if (r.metadata && typeof r.metadata === 'object') {
      const meta = r.metadata as Record<string, unknown>;
      if (meta.affected_modules && Array.isArray(meta.affected_modules)) {
        impactedModules.push(...(meta.affected_modules as string[]).slice(0, 3));
      }
    }
  }

  // Standard historical risk patterns derived from engineering knowledge
  riskCandidates.push('Implementation scope may exceed initial estimates based on similar reviews');
  if (ctx.review.type === 'root_cause_analysis') {
    riskCandidates.push('Root cause may have secondary dependencies not initially identified');
    regressionCauses.push('RCA-type changes commonly introduce adjacent regressions');
  }
  if (ctx.review.type === 'architecture_review') {
    riskCandidates.push('Architecture changes carry higher cross-system regression risk');
    missingDocs.push('Architecture Decision Record (ADR) commonly missing for architectural changes');
  }
  if (ctx.review.type === 'defect_resolution') {
    riskCandidates.push('Defect fixes may mask underlying systemic issues');
    riskCandidates.push('Targeted defect resolution frequently requires broader test coverage');
  }

  return {
    common_implementation_risks:    riskCandidates.slice(0, 5),
    common_regression_causes:       [...new Set(regressionCauses)].slice(0, 4),
    frequently_missing_docs:        [...new Set(missingDocs)].slice(0, 4),
    frequently_missing_testing:     [...new Set(missingTesting)].slice(0, 4),
    frequently_delayed_approvals:   topSimilar.filter(r => r.status === 'open').length > 1 ? ['Reviews of this type commonly await PO approval'] : [],
    repeated_governance_findings:   ctx.memoryEntries.filter(m => m.memory_type === 'governance_standard' && !m.is_superseded).map(m => m.title).slice(0, 3),
    frequently_impacted_modules:    [...new Set(impactedModules)].slice(0, 5),
    total_historical_risks:         riskCandidates.length + regressionCauses.length,
  };
}

// ─── Module 5: Engineering Lineage ───────────────────────────────────────────

function runEngineeringLineage(ctx: ELPMContext, similar: SimilarArtefact[]): EngineeringLineage {
  const chain: LineageEntry[] = [];

  // Build lineage chain from similar artefacts, sorted by date
  const sorted = [...similar].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  for (const s of sorted) {
    const rel: LineageEntry['relationship'] =
      s.lineage_status === 'superseded' ? 'superseded_by' :
      s.lineage_status === 'current_baseline' ? 'current' : 'related';
    chain.push({
      ref: s.ref,
      title: s.title,
      status: s.lineage_status,
      relationship: rel,
      engineering_area: s.engineering_area,
      created_at: s.created_at,
    });
  }

  // Current review is the latest entry
  chain.push({
    ref: ctx.review.erc_number,
    title: ctx.review.title,
    status: 'active',
    relationship: 'current',
    engineering_area: ctx.review.engineering_area,
    created_at: new Date().toISOString(),
  });

  const baseline = similar.find(s => s.lineage_status === 'current_baseline') ?? similar[0] ?? null;
  const revisions = similar.filter(s => s.similarity_score >= 40).length;

  let evolutionDesc = 'First engineering review in this area.';
  if (revisions > 0) {
    evolutionDesc = `${revisions} prior engineering review(s) found in the same area. ${baseline ? `Most relevant baseline: ${baseline.ref}.` : ''}`;
  }

  return {
    current_baseline: baseline,
    lineage_chain: chain,
    revision_count: revisions,
    evolution_description: evolutionDesc,
  };
}

// ─── Module 6: Historical Confidence ─────────────────────────────────────────

function computeHistoricalConfidence(
  ctx: ELPMContext,
  similar: SimilarArtefact[],
): HistoricalConfidence {
  const highSimilarity = similar.filter(s => s.similarity_score >= 60);
  const closedSuccessfully = similar.filter(s => s.status === 'closed' || s.outcome === 'accepted_reference');
  const successRate = similar.length > 0
    ? Math.round((closedSuccessfully.length / similar.length) * 100)
    : 0;

  const historicalConf = Math.min(1,
    (highSimilarity.length * 0.2) +
    (similar.length > 0 ? 0.3 : 0) +
    (successRate / 100 * 0.3) +
    (ctx.memoryEntries.filter(m => !m.is_superseded).length > 0 ? 0.2 : 0)
  );

  const combinedConf = (historicalConf * 0.4) + (0.6); // ai_confidence filled by caller

  let precedentStrength: HistoricalConfidence['precedent_strength'] =
    highSimilarity.length >= 3 ? 'strong' :
    highSimilarity.length >= 1 ? 'moderate' :
    similar.length > 0 ? 'weak' : 'none';

  let basis = `${similar.length} similar artefact(s) found.`;
  if (precedentStrength === 'strong') basis += ` Strong precedent — ${highSimilarity.length} closely-matched reviews.`;
  else if (precedentStrength === 'moderate') basis += ` Moderate precedent — proceed with reference to prior work.`;
  else if (precedentStrength === 'weak') basis += ` Weak precedent — limited historical basis; standard analysis applies.`;
  else basis += ' No historical precedent found — analysis based entirely on current EIG context.';

  return {
    historical_reviews_found: similar.length,
    similar_work_found: similar.length > 0,
    historical_success_rate: successRate,
    historical_confidence: Math.round(historicalConf * 100) / 100,
    ai_confidence: 0.7, // default; ERIE overwrites this
    combined_confidence: Math.round(combinedConf * 100) / 100,
    confidence_basis: basis,
    precedent_strength,
  };
}

// ─── Module 7: Recommendation Evolution ──────────────────────────────────────

function runRecommendationEvolution(ctx: ELPMContext, similar: SimilarArtefact[]): RecommendationEvolution {
  const closedWithDecision = ctx.allReviews.find(r =>
    similar.some(s => s.ref === r.erc_number) && r.engineering_decision && r.status === 'closed'
  );

  const prevRec = closedWithDecision?.engineering_decision?.slice(0, 200) ?? null;
  const prevRef = closedWithDecision?.erc_number ?? null;

  let currentRec = 'Engineering review in progress — recommendation pending intelligence analysis.';
  let whyChanged = 'No prior recommendation to compare against.';
  let maturity: RecommendationEvolution['evolution_maturity'] = 'first_iteration';
  const evidence: string[] = [];

  if (prevRec) {
    whyChanged = `Building upon ${prevRef}. New EIG analysis and current platform state may alter the approach.`;
    maturity = similar.filter(s => s.similarity_score >= 50).length >= 2 ? 'stable' : 'evolved';
    evidence.push(`Prior decision from ${prevRef}`);
    evidence.push(`${similar.length} similar review(s) found`);
    if (ctx.memoryEntries.filter(m => !m.is_superseded).length > 0) {
      evidence.push(`${ctx.memoryEntries.length} active memory entries applied`);
    }
  }

  return {
    previous_recommendation: prevRec,
    previous_review_ref: prevRef,
    current_recommendation: currentRec,
    why_changed: whyChanged,
    supporting_evidence: evidence,
    evolution_maturity: maturity,
  };
}

// ─── Module 8: Evolution Summary ─────────────────────────────────────────────

function runEvolutionSummary(
  ctx: ELPMContext,
  similar: SimilarArtefact[],
  lineage: EngineeringLineage,
): EngineeringEvolutionSummary {
  const validRecs: string[] = [];
  const supersededRecs: string[] = [];
  const timeline: TimelineEntry[] = [];

  const topReviews = ctx.allReviews.filter(r => similar.some(s => s.ref === r.erc_number));

  for (const r of topReviews.slice(0, 5)) {
    const siml = similar.find(s => s.ref === r.erc_number);
    if (!siml) continue;

    if (siml.lineage_status === 'superseded') {
      if (r.engineering_decision) supersededRecs.push(`${r.erc_number}: ${r.engineering_decision.slice(0, 80)}`);
    } else {
      if (r.engineering_decision) validRecs.push(`${r.erc_number}: ${r.engineering_decision.slice(0, 80)}`);
    }

    timeline.push({
      date: r.created_at,
      ref: r.erc_number,
      title: r.title.slice(0, 60),
      event_type: r.type.replace(/_/g, ' '),
      significance: siml.similarity_score >= 60 ? 'high' : 'moderate',
      outcome: r.status === 'closed' ? 'closed' : r.is_reference ? 'accepted_reference' : r.status,
    });
  }

  // Add current review as latest timeline entry
  timeline.push({
    date: new Date().toISOString(),
    ref: ctx.review.erc_number,
    title: ctx.review.title.slice(0, 60),
    event_type: ctx.review.type.replace(/_/g, ' '),
    significance: 'current',
    outcome: null,
  });

  const evolution = lineage.revision_count === 0
    ? 'This is the first engineering review in this area. No prior evolution to analyse.'
    : `${lineage.revision_count} prior review(s) exist. Engineering knowledge has evolved through ${timeline.length - 1} prior artefact(s). ${supersededRecs.length > 0 ? `${supersededRecs.length} prior recommendation(s) are superseded.` : 'All prior recommendations remain valid.'}`;

  return {
    has_prior_work: similar.length > 0,
    revision_count: lineage.revision_count,
    current_baseline_ref: lineage.current_baseline?.ref ?? null,
    valid_historical_recommendations: validRecs.slice(0, 5),
    superseded_recommendations: supersededRecs.slice(0, 3),
    evolution_explanation: evolution,
    timeline_entries: timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  };
}

// ─── Module 9: Historical Comparison ─────────────────────────────────────────

function runHistoricalComparison(
  ctx: ELPMContext,
  similar: SimilarArtefact[],
  learning: EngineeringLearningSummary,
  evolution: EngineeringEvolutionSummary,
): HistoricalComparison {
  const topPrior = ctx.allReviews.find(r =>
    similar.some(s => s.ref === r.erc_number) && r.status === 'closed'
  );

  const newIntelligence: string[] = [
    'Current Engineering Intelligence Graph data incorporated',
    'All active EIG entities and relationships analysed',
  ];
  if (ctx.releases.length > 0) newIntelligence.push(`${ctx.releases.length} release candidate(s) in context`);
  if (ctx.testPlans.length > 0) newIntelligence.push(`${ctx.testPlans.length} test plan(s) linked`);

  const improvements = evolution.valid_historical_recommendations.length > 0
    ? [`Builds upon ${evolution.valid_historical_recommendations.length} valid prior recommendation(s)`, 'Enhanced with current EIG analysis', 'Historical risk patterns incorporated']
    : ['First iteration — no prior recommendations to improve upon'];

  return {
    previous_recommendation: topPrior?.engineering_decision?.slice(0, 200) ?? null,
    previous_review_ref: topPrior?.erc_number ?? null,
    current_recommendation: 'Pending — generate intelligence to produce current recommendation',
    new_intelligence: newIntelligence.slice(0, 5),
    new_risks: learning.previous_regressions.length > 0 ? learning.previous_regressions.slice(0, 3) : [],
    new_dependencies: [],
    po_decisions_applied: learning.previous_po_decisions.slice(0, 3),
    lessons_reused: learning.lessons_applied.slice(0, 4),
    improvements: improvements.slice(0, 4),
  };
}

// ─── Module 10: Pattern Recognition ──────────────────────────────────────────

function runPatternRecognition(ctx: ELPMContext, similar: SimilarArtefact[]): PatternMatch[] {
  const patterns: PatternMatch[] = [];

  // Pattern: Benchmark → Test Plan → Engineering Review → Release
  if (similar.some(s => s.reusable_assets.some(a => a.includes('test plan')))) {
    patterns.push({
      pattern_name: 'Benchmark → Test → Review → Release',
      pattern_description: 'Standard engineering quality workflow detected from historical reviews',
      matched_artefacts: similar.filter(s => s.reusable_assets.some(a => a.includes('test plan'))).map(s => s.ref),
      confidence: 0.8,
      recommended_workflow: ['Create/link benchmark', 'Create/link test plan', 'Complete engineering review', 'Gate for release'],
    });
  }

  // Pattern: RCA → Defect Resolution → Audit → Release
  if (ctx.review.type === 'root_cause_analysis' || ctx.review.type === 'defect_resolution') {
    patterns.push({
      pattern_name: 'RCA → Resolution → Audit → Release',
      pattern_description: 'Standard defect engineering workflow — follows RCA with audit gate',
      matched_artefacts: similar.filter(s => s.artefact_type === 'engineering_review').map(s => s.ref).slice(0, 3),
      confidence: 0.85,
      recommended_workflow: ['Complete root cause analysis', 'Implement defect resolution', 'Conduct engineering audit', 'Release gate with regression testing'],
    });
  }

  // Pattern: Architecture → Spec → Implementation → Testing → Release
  if (ctx.review.type === 'architecture_review') {
    patterns.push({
      pattern_name: 'Architecture → Spec → Build → Test → Release',
      pattern_description: 'Architecture change workflow — spec-driven implementation with formal testing gate',
      matched_artefacts: [],
      confidence: 0.9,
      recommended_workflow: ['Architecture review', 'Engineering specification', 'Implementation', 'Testing & validation', 'Audit', 'Release'],
    });
  }

  return patterns.slice(0, 3);
}

// ─── Data Loader ──────────────────────────────────────────────────────────────

async function loadELPMContext(review: ELPMReviewContext): Promise<ELPMContext> {
  const [reviewsRes, testPlansRes, releasesRes, auditsRes, memoryRes, conversationIntelligence] = await Promise.all([
    supabase.from('ecc_engineering_reviews')
      .select('id,erc_number,title,type,status,engineering_area,executive_summary,engineering_decision,lessons_learned,future_recommendations,regression_testing,related_features,related_releases,related_test_plans,related_audits,related_ercs,is_reference,created_at,metadata')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('ecc_test_plans')
      .select('id,title,status')
      .limit(20),
    supabase.from('ecc_release_candidates')
      .select('id,rc_number,status,created_at')
      .limit(10),
    supabase.from('ecc_audits')
      .select('id,title,status,audit_date,engineering_area')
      .limit(10),
    supabase.from('ecc_engineering_memory')
      .select('*')
      .eq('is_superseded', false)
      .order('weight', { ascending: false })
      .limit(30),
    loadConversationIntelligenceForELPM({
      type: review.type,
      engineering_area: review.engineering_area,
      related_ercs: review.related_ercs,
      title: review.title,
    }),
  ]);

  const allReviews: HistoricalReview[] = (reviewsRes.data ?? []).map(r => ({
    ...r,
    related_features:  r.related_features  ?? [],
    related_releases:  r.related_releases  ?? [],
    related_test_plans: r.related_test_plans ?? [],
    related_audits:    r.related_audits    ?? [],
    related_ercs:      r.related_ercs      ?? [],
  }));

  const memoryEntries: MemoryEntry[] = (memoryRes.data ?? []).map(m => ({
    id: m.id,
    memory_type: m.memory_type,
    title: m.title,
    content: m.content,
    weight: m.weight ?? 3,
    source_type: m.source_type,
    source_ref: m.source_ref,
    is_superseded: m.is_superseded ?? false,
    created_at: m.created_at,
    applies_to: m.applies_to ?? [],
    learning_classification: (m.learning_classification as MemoryEntry['learning_classification']) ?? 'engineering_practice',
  }));

  return {
    review,
    allReviews,
    memoryEntries,
    testPlans: (testPlansRes.data ?? []).map(t => ({ id: t.id, title: t.title, status: t.status })),
    releases: (releasesRes.data ?? []).map(r => ({ id: r.id, version: r.rc_number, status: r.status, created_at: r.created_at })),
    audits: (auditsRes.data ?? []).map(a => ({ id: a.id, title: a.title, status: a.status, audit_date: a.audit_date, engineering_area: a.engineering_area })),
    conversationIntelligence,
  };
}

// ─── Non-blocking DB Persist ──────────────────────────────────────────────────

function persistELPMReport(reviewId: string, report: ELPMReport): void {
  supabase.from('ecc_engineering_reviews').update({
    elpm_similar_reviews:      report.similar_artefacts,
    elpm_learning_summary:     report.learning_summary,
    elpm_evolution_summary:    report.evolution_summary,
    elpm_historical_comparison: report.historical_comparison,
    elpm_memory_summary: {
      memory_entries:          report.memory_entries.length,
      reusable_assets:         report.reusable_assets.length,
      pattern_matches:         report.pattern_matches,
    },
    elpm_historical_confidence: report.historical_confidence.historical_confidence,
    elpm_generated_at:         report.elpm_generated_at,
    elpm_engine_version:       report.elpm_engine_version,
  }).eq('id', reviewId).then(() => { /* non-blocking */ });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateELPMReport(review: ELPMReviewContext): Promise<ELPMReport> {
  const ctx = await loadELPMContext(review);

  // Run all modules in sequence (each builds on prior results)
  const similar       = runHistoricalSearch(ctx);
  const learning      = runEngineeringLearning(ctx, similar);
  const reusable      = runReusableAssetDiscovery(ctx, similar);
  const historicalRisk = runHistoricalRiskPrediction(ctx, similar);
  const lineage       = runEngineeringLineage(ctx, similar);
  const confidence    = computeHistoricalConfidence(ctx, similar);
  const recEvolution  = runRecommendationEvolution(ctx, similar);
  const evolution     = runEvolutionSummary(ctx, similar, lineage);
  const comparison    = runHistoricalComparison(ctx, similar, learning, evolution);
  const patterns      = runPatternRecognition(ctx, similar);

  const report: ELPMReport = {
    similar_artefacts:     similar,
    top_similar:           similar[0] ?? null,
    learning_summary:      learning,
    reusable_assets:       reusable,
    historical_risk_summary: historicalRisk,
    memory_entries:        ctx.memoryEntries,
    engineering_lineage:   lineage,
    historical_confidence: confidence,
    recommendation_evolution: recEvolution,
    evolution_summary:     evolution,
    historical_comparison: comparison,
    pattern_matches:       patterns,
    conversation_intelligence: ctx.conversationIntelligence,
    elpm_generated_at:     new Date().toISOString(),
    elpm_engine_version:   ELPM_VERSION,
  };

  persistELPMReport(review.id, report);
  return report;
}

export async function loadCachedELPM(reviewId: string): Promise<ELPMReport | null> {
  const { data } = await supabase
    .from('ecc_engineering_reviews')
    .select('elpm_similar_reviews,elpm_learning_summary,elpm_evolution_summary,elpm_historical_comparison,elpm_memory_summary,elpm_historical_confidence,elpm_generated_at,elpm_engine_version')
    .eq('id', reviewId)
    .maybeSingle();

  if (!data || !data.elpm_generated_at || !data.elpm_learning_summary) return null;
  if (data.elpm_engine_version !== ELPM_VERSION) return null;

  const age = Date.now() - new Date(data.elpm_generated_at as string).getTime();
  if (age > 24 * 60 * 60 * 1000) return null;

  // Reconstruct partial report from DB fields
  return {
    similar_artefacts:     (data.elpm_similar_reviews as SimilarArtefact[]) ?? [],
    top_similar:           (data.elpm_similar_reviews as SimilarArtefact[])?.[0] ?? null,
    learning_summary:      data.elpm_learning_summary as EngineeringLearningSummary,
    reusable_assets:       [],
    historical_risk_summary: { common_implementation_risks: [], common_regression_causes: [], frequently_missing_docs: [], frequently_missing_testing: [], frequently_delayed_approvals: [], repeated_governance_findings: [], frequently_impacted_modules: [], total_historical_risks: 0 },
    memory_entries:        [],
    engineering_lineage:   { current_baseline: null, lineage_chain: [], revision_count: 0, evolution_description: '' },
    historical_confidence: {
      historical_reviews_found: 0,
      similar_work_found: false,
      historical_success_rate: 0,
      historical_confidence: (data.elpm_historical_confidence as number) ?? 0,
      ai_confidence: 0.7,
      combined_confidence: 0.7,
      confidence_basis: '',
      precedent_strength: 'none',
    },
    recommendation_evolution: { previous_recommendation: null, previous_review_ref: null, current_recommendation: '', why_changed: '', supporting_evidence: [], evolution_maturity: 'first_iteration' },
    evolution_summary:     data.elpm_evolution_summary as EngineeringEvolutionSummary,
    historical_comparison: data.elpm_historical_comparison as HistoricalComparison,
    pattern_matches:       (data.elpm_memory_summary as Record<string, unknown>)?.pattern_matches as PatternMatch[] ?? [],
    conversation_intelligence: [],
    elpm_generated_at:     data.elpm_generated_at as string,
    elpm_engine_version:   data.elpm_engine_version as string,
  };
}
