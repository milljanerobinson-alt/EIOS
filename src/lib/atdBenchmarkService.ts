/**
 * AI Technical Director Benchmark Capture Service (ATD-BC)
 *
 * Manages the permanent, immutable evidence repository for ATD benchmark runs.
 * Benchmark runs are append-only governance artefacts — never overwritten.
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BenchmarkDefinition {
  id: string;
  benchmark_id: string;
  benchmark_name: string;
  category: string;
  purpose: string;
  benchmark_prompt: string;
  evaluation_criteria: EvaluationCriterion[];
  is_active: boolean;
  version: string;
  sort_order: number;
  created_at: string;
}

export interface EvaluationCriterion {
  criterion: string;
  description: string;
}

export type RunReviewStatus = 'awaiting_review' | 'under_review' | 'reviewed' | 'accepted';

export type SessionStatus =
  | 'awaiting_review'
  | 'under_review'
  | 'reviewed'
  | 'review_complete'
  | 'awaiting_po_acceptance'
  | 'accepted'
  | 'accepted_with_observations'
  | 'returned_for_improvement';

export type ReviewStatus = RunReviewStatus | SessionStatus;

export type SessionOutcome = 'in_progress' | 'completed' | 'accepted' | 'superseded' | 'cancelled';

export type ValidationEventType =
  | 'prompt_detected'
  | 'mismatch_detected'
  | 'override_selected'
  | 'clean_capture'
  | 'validation_result';

export interface ValidationEvent {
  type: ValidationEventType;
  timestamp: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export type ReviewRating = 'exceptional' | 'strong' | 'adequate' | 'developing' | 'insufficient';
export type ReviewRecommendation = 'accept' | 'accept_with_observations' | 'return_for_improvement';
export type PODecisionValue = 'accepted' | 'accepted_with_observations' | 'returned_for_improvement';
export type ReviewFormStatus = 'draft' | 'submitted' | 'finalised';

export type BenchmarkMilestone =
  | 'baseline'
  | 'major_release'
  | 'architecture_milestone'
  | 'governance_milestone'
  | 'ai_upgrade'
  | 'product_milestone';

export type ObservationFlagType =
  | 'major_improvement'
  | 'regression'
  | 'hallucination'
  | 'commercial_insight'
  | 'architecture_insight'
  | 'governance_insight';

export interface ObservationFlag {
  type: ObservationFlagType;
  note: string;
  severity: 'info' | 'warning' | 'critical';
}

/** 9 engineering capability dimensions scored 0–10. */
export interface CapabilityScores {
  commercial_understanding: number;
  product_understanding: number;
  platform_knowledge: number;
  architecture_quality: number;
  engineering_governance: number;
  roadmap_planning: number;
  risk_assessment: number;
  technical_accuracy: number;
  recommendation_quality: number;
}

export const CAPABILITY_DIMENSIONS: { key: keyof CapabilityScores; label: string; description: string }[] = [
  { key: 'commercial_understanding', label: 'Commercial Understanding', description: 'Depth of commercial awareness and business context' },
  { key: 'product_understanding', label: 'Product Understanding', description: 'Grasp of product vision, goals, and user needs' },
  { key: 'platform_knowledge', label: 'Platform Knowledge', description: 'Technical knowledge of the platform and its systems' },
  { key: 'architecture_quality', label: 'Architecture Quality', description: 'Quality of architectural thinking and system design' },
  { key: 'engineering_governance', label: 'Engineering Governance', description: 'Understanding of governance, standards, and process' },
  { key: 'roadmap_planning', label: 'Roadmap Planning', description: 'Clarity and realism of roadmap and prioritisation' },
  { key: 'risk_assessment', label: 'Risk Assessment', description: 'Identification and handling of technical and commercial risks' },
  { key: 'technical_accuracy', label: 'Technical Accuracy', description: 'Factual accuracy of technical statements' },
  { key: 'recommendation_quality', label: 'Recommendation Quality', description: 'Actionability and value of recommendations' },
];

/** EIS = weighted mean of 9 capability scores × 10 → 0–100 */
export function calculateEIS(scores: CapabilityScores): number {
  const weights: Record<keyof CapabilityScores, number> = {
    commercial_understanding: 1.0,
    product_understanding: 1.0,
    platform_knowledge: 1.0,
    architecture_quality: 1.2,
    engineering_governance: 1.0,
    roadmap_planning: 1.0,
    risk_assessment: 1.0,
    technical_accuracy: 1.2,
    recommendation_quality: 1.1,
  };
  let weightedSum = 0;
  let totalWeight = 0;
  for (const dim of CAPABILITY_DIMENSIONS) {
    const w = weights[dim.key];
    weightedSum += scores[dim.key] * w;
    totalWeight += w;
  }
  return Math.round((weightedSum / totalWeight) * 10 * 10) / 10;
}

export interface CapabilityDeltaEntry {
  previous: number;
  current: number;
  delta: number;
}

export type CapabilityDelta = Record<keyof CapabilityScores, CapabilityDeltaEntry>;

export interface BenchmarkReview {
  id: string;
  review_ref: string;
  session_id: string;
  review_date: string | null;
  reviewer: string | null;
  overall_rating: ReviewRating | null;
  overall_recommendation: ReviewRecommendation | null;
  // v2.1 — single authoritative document
  review_title: string | null;
  review_content: string | null;
  // Structured fields (retained for backwards compat and structured data)
  executive_summary: string | null;
  engineering_strengths: string | null;
  engineering_weaknesses: string | null;
  product_assessment: string | null;
  architecture_assessment: string | null;
  commercial_assessment: string | null;
  governance_assessment: string | null;
  risks_identified: string | null;
  opportunities_for_improvement: string | null;
  recommendations: string | null;
  comparison_notes: string | null;
  // v2.0 fields
  capability_scores: CapabilityScores | null;
  eis_score: number | null;
  hallucinations: string | null;
  overall_verdict: string | null;
  lessons_learned: string | null;
  observation_flags: ObservationFlag[];
  compared_session_id: string | null;
  capability_delta: CapabilityDelta | null;
  evolution_summary: string | null;
  review_status: ReviewFormStatus;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface PODecision {
  id: string;
  decision_ref: string;
  session_id: string;
  review_id: string | null;
  decision_date: string;
  decision: PODecisionValue;
  product_owner: string | null;
  comments: string | null;
  // v2.0 fields
  reason: string | null;
  decision_summary: string | null;
  future_recommendations: string | null;
  po_notes: string | null;
  locked_at: string | null;
  is_locked: boolean;
  created_at: string;
}

export interface SaveReviewInput {
  session_id: string;
  reviewer?: string;
  review_date?: string;
  overall_rating?: ReviewRating;
  overall_recommendation?: ReviewRecommendation;
  // v2.1 — single authoritative document
  review_title?: string;
  review_content?: string;
  // Structured fields
  executive_summary?: string;
  engineering_strengths?: string;
  engineering_weaknesses?: string;
  product_assessment?: string;
  architecture_assessment?: string;
  commercial_assessment?: string;
  governance_assessment?: string;
  risks_identified?: string;
  opportunities_for_improvement?: string;
  recommendations?: string;
  comparison_notes?: string;
  // v2.0 fields
  capability_scores?: CapabilityScores;
  eis_score?: number;
  hallucinations?: string;
  overall_verdict?: string;
  lessons_learned?: string;
  observation_flags?: ObservationFlag[];
  compared_session_id?: string;
  capability_delta?: CapabilityDelta;
  evolution_summary?: string;
}

export interface RecordPODecisionInput {
  session_id: string;
  review_id?: string;
  decision: PODecisionValue;
  product_owner?: string;
  comments?: string;
  // v2.0 fields
  reason?: string;
  decision_summary?: string;
  future_recommendations?: string;
  po_notes?: string;
  lock_decision?: boolean;
}

export interface BenchmarkSession {
  id: string;
  session_ref: string;
  session_name: string;
  notes: string | null;
  platform_state_id: string | null;
  pis_snapshot_id: string | null;
  context_package_id: string | null;
  benchmark_version: string;
  atd_version: string | null;
  ecc_version: string | null;
  overall_review_status: SessionStatus;
  is_baseline: boolean;
  comparison_session_id: string | null;
  improvement_notes: string | null;
  reviewer_notes: string | null;
  benchmarks_count: number;
  review_id: string | null;
  po_decision_id: string | null;
  overall_rating: ReviewRating | null;
  benchmark_outcome: string | null;
  session_outcome: SessionOutcome;
  supersedes_session_id: string | null;
  superseded_by_session_id: string | null;
  supersession_reason: string | null;
  supersession_date: string | null;
  supersession_notes: string | null;
  // v2.0 fields
  benchmark_milestone: BenchmarkMilestone | null;
  eis_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface BenchmarkRun {
  id: string;
  run_ref: string;
  session_id: string;
  benchmark_definition_id: string;
  benchmark_version: string;
  execution_timestamp: string;
  platform_state_id: string | null;
  pis_snapshot_id: string | null;
  context_package_id: string | null;
  benchmark_prompt: string;
  ai_response: string;
  response_length: number;
  model_used: string | null;
  provider_used: string | null;
  execution_notes: string | null;
  review_status: ReviewStatus;
  reviewer_notes: string | null;
  is_locked: boolean;
  validation_events: ValidationEvent[] | null;
  created_at: string;
  // Joined
  benchmark_name?: string;
  benchmark_id_code?: string;
  session_ref?: string;
}

export interface CreateSessionInput {
  session_name: string;
  notes?: string;
  platform_state_id?: string;
  pis_snapshot_id?: string;
  context_package_id?: string;
  atd_version?: string;
  ecc_version?: string;
  is_baseline?: boolean;
  supersedes_session_id?: string;
}

export interface AddRunInput {
  session_id: string;
  benchmark_definition_id: string;
  benchmark_prompt: string;
  ai_response: string;
  model_used?: string;
  provider_used?: string;
  execution_notes?: string;
  platform_state_id?: string;
  pis_snapshot_id?: string;
  context_package_id?: string;
  validation_events?: ValidationEvent[];
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

export async function loadBenchmarkDefinitions(): Promise<BenchmarkDefinition[]> {
  const { data, error } = await supabase
    .from('atd_benchmark_definitions')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map(d => ({
    ...d,
    evaluation_criteria: Array.isArray(d.evaluation_criteria)
      ? d.evaluation_criteria
      : JSON.parse(d.evaluation_criteria ?? '[]'),
  })) as BenchmarkDefinition[];
}

export async function loadBenchmarkSessions(): Promise<BenchmarkSession[]> {
  const { data, error } = await supabase
    .from('atd_benchmark_sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BenchmarkSession[];
}

export async function loadBenchmarkRuns(sessionId?: string): Promise<BenchmarkRun[]> {
  let q = supabase
    .from('atd_benchmark_runs')
    .select(`
      *,
      atd_benchmark_definitions(benchmark_id, benchmark_name),
      atd_benchmark_sessions(session_ref)
    `)
    .order('execution_timestamp', { ascending: false });

  if (sessionId) q = q.eq('session_id', sessionId);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r: Record<string, unknown>) => {
    const defn = r.atd_benchmark_definitions as { benchmark_id: string; benchmark_name: string } | null;
    const sess = r.atd_benchmark_sessions as { session_ref: string } | null;
    return {
      ...r,
      benchmark_name: defn?.benchmark_name ?? null,
      benchmark_id_code: defn?.benchmark_id ?? null,
      session_ref: sess?.session_ref ?? null,
      atd_benchmark_definitions: undefined,
      atd_benchmark_sessions: undefined,
    };
  }) as BenchmarkRun[];
}

export async function loadSession(id: string): Promise<BenchmarkSession | null> {
  const { data } = await supabase
    .from('atd_benchmark_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data as BenchmarkSession | null;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createSession(input: CreateSessionInput): Promise<BenchmarkSession> {
  const { data, error } = await supabase
    .from('atd_benchmark_sessions')
    .insert({
      session_name: input.session_name,
      notes: input.notes ?? null,
      platform_state_id: input.platform_state_id ?? null,
      pis_snapshot_id: input.pis_snapshot_id ?? null,
      context_package_id: input.context_package_id ?? null,
      atd_version: input.atd_version ?? null,
      ecc_version: input.ecc_version ?? null,
      is_baseline: input.is_baseline ?? false,
      overall_review_status: 'awaiting_review',
      benchmarks_count: 0,
      session_outcome: 'in_progress',
      supersedes_session_id: input.supersedes_session_id ?? null,
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create session');

  // If this replaces another session, record the backlink
  if (input.supersedes_session_id) {
    await supabase
      .from('atd_benchmark_sessions')
      .update({ superseded_by_session_id: data.id, updated_at: new Date().toISOString() })
      .eq('id', input.supersedes_session_id);
  }

  return data as BenchmarkSession;
}

export async function addBenchmarkRun(input: AddRunInput): Promise<BenchmarkRun> {
  const { data: defn } = await supabase
    .from('atd_benchmark_definitions')
    .select('version')
    .eq('id', input.benchmark_definition_id)
    .maybeSingle();

  const { data: run, error } = await supabase
    .from('atd_benchmark_runs')
    .insert({
      session_id: input.session_id,
      benchmark_definition_id: input.benchmark_definition_id,
      benchmark_version: defn?.version ?? '1.0',
      benchmark_prompt: input.benchmark_prompt,
      ai_response: input.ai_response,
      model_used: input.model_used ?? null,
      provider_used: input.provider_used ?? null,
      execution_notes: input.execution_notes ?? null,
      platform_state_id: input.platform_state_id ?? null,
      pis_snapshot_id: input.pis_snapshot_id ?? null,
      context_package_id: input.context_package_id ?? null,
      review_status: 'awaiting_review',
      is_locked: true,
      validation_events: input.validation_events ? JSON.stringify(input.validation_events) : null,
    })
    .select()
    .single();

  if (error || !run) throw new Error(error?.message ?? 'Failed to add benchmark run');

  // Update session run count
  const { data: sess } = await supabase
    .from('atd_benchmark_sessions')
    .select('benchmarks_count')
    .eq('id', input.session_id)
    .maybeSingle();
  if (sess) {
    await supabase
      .from('atd_benchmark_sessions')
      .update({ benchmarks_count: (sess.benchmarks_count ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', input.session_id);
  }

  return run as BenchmarkRun;
}

export async function updateRunReviewStatus(
  runId: string,
  status: ReviewStatus,
  reviewerNotes?: string,
): Promise<void> {
  const update: Record<string, unknown> = { review_status: status };
  if (reviewerNotes !== undefined) update.reviewer_notes = reviewerNotes;
  const { error } = await supabase
    .from('atd_benchmark_runs')
    .update(update)
    .eq('id', runId);
  if (error) throw error;
}

export async function updateSessionReviewStatus(
  sessionId: string,
  status: ReviewStatus,
  options?: { reviewerNotes?: string; improvementNotes?: string },
): Promise<void> {
  const update: Record<string, unknown> = {
    overall_review_status: status,
    updated_at: new Date().toISOString(),
  };
  if (options?.reviewerNotes !== undefined) update.reviewer_notes = options.reviewerNotes;
  if (options?.improvementNotes !== undefined) update.improvement_notes = options.improvementNotes;
  const { error } = await supabase
    .from('atd_benchmark_sessions')
    .update(update)
    .eq('id', sessionId);
  if (error) throw error;
}

export async function markSessionAsBaseline(sessionId: string): Promise<void> {
  // Unset any existing baseline first
  await supabase
    .from('atd_benchmark_sessions')
    .update({ is_baseline: false, updated_at: new Date().toISOString() })
    .eq('is_baseline', true);
  await supabase
    .from('atd_benchmark_sessions')
    .update({ is_baseline: true, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
}

export async function completeSession(sessionId: string, summary: string): Promise<void> {
  const { error } = await supabase
    .from('atd_benchmark_sessions')
    .update({
      overall_review_status: 'awaiting_review',
      session_outcome: 'completed',
      notes: summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
  if (error) throw error;
}

export interface SupersedeSessionInput {
  reason: string;
  date: string;
  notes?: string;
}

export async function supersedeBenchmarkSession(
  sessionId: string,
  input: SupersedeSessionInput,
): Promise<void> {
  const { error } = await supabase
    .from('atd_benchmark_sessions')
    .update({
      session_outcome: 'superseded',
      supersession_reason: input.reason,
      supersession_date: input.date,
      supersession_notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
  if (error) throw error;
}

// ─── Version Helpers ──────────────────────────────────────────────────────────

export async function getLatestVersionRefs(): Promise<{
  platformStateId: string | null;
  platformStateVersion: string | null;
  pisSnapshotId: string | null;
  pisVersion: string | null;
  contextPackageId: string | null;
  contextPackageRef: string | null;
}> {
  const [stateRes, snapRes, pkgRes] = await Promise.all([
    supabase.from('eip_platform_states').select('id,version').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('pis_snapshots').select('id,pis_version,snapshot_ref').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('eip_context_packages').select('id,package_ref').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    platformStateId: stateRes.data?.id ?? null,
    platformStateVersion: stateRes.data?.version ?? null,
    pisSnapshotId: snapRes.data?.id ?? null,
    pisVersion: snapRes.data?.pis_version ?? null,
    contextPackageId: pkgRes.data?.id ?? null,
    contextPackageRef: pkgRes.data?.package_ref ?? null,
  };
}

export async function loadIncompleteSession(): Promise<BenchmarkSession | null> {
  const { data } = await supabase
    .from('atd_benchmark_sessions')
    .select('*')
    .eq('overall_review_status', 'awaiting_review')
    .eq('session_outcome', 'in_progress')
    .gt('benchmarks_count', 0)
    .lt('benchmarks_count', 3)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as BenchmarkSession | null;
}

// ─── Review Functions ─────────────────────────────────────────────────────────

export async function loadReviewForSession(sessionId: string): Promise<BenchmarkReview | null> {
  const { data } = await supabase
    .from('atd_benchmark_reviews')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as BenchmarkReview | null;
}

/** Load the most recent accepted session review that has capability scores. */
export async function loadLatestAcceptedReview(): Promise<{ session: BenchmarkSession; review: BenchmarkReview } | null> {
  const { data: sessions } = await supabase
    .from('atd_benchmark_sessions')
    .select('*')
    .in('overall_review_status', ['accepted', 'accepted_with_observations'])
    .neq('session_outcome', 'superseded')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!sessions?.length) return null;

  for (const session of sessions) {
    const { data: review } = await supabase
      .from('atd_benchmark_reviews')
      .select('*')
      .eq('session_id', session.id)
      .not('capability_scores', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (review) return { session: session as BenchmarkSession, review: review as BenchmarkReview };
  }
  return null;
}

export async function saveReview(
  existingId: string | null,
  input: SaveReviewInput,
): Promise<BenchmarkReview> {
  const payload: Record<string, unknown> = {
    session_id: input.session_id,
    reviewer: input.reviewer ?? null,
    review_date: input.review_date ?? null,
    overall_rating: input.overall_rating ?? null,
    overall_recommendation: input.overall_recommendation ?? null,
    // v2.1
    review_title: input.review_title ?? null,
    review_content: input.review_content ?? null,
    // structured fields
    executive_summary: input.executive_summary ?? null,
    engineering_strengths: input.engineering_strengths ?? null,
    engineering_weaknesses: input.engineering_weaknesses ?? null,
    product_assessment: input.product_assessment ?? null,
    architecture_assessment: input.architecture_assessment ?? null,
    commercial_assessment: input.commercial_assessment ?? null,
    governance_assessment: input.governance_assessment ?? null,
    risks_identified: input.risks_identified ?? null,
    opportunities_for_improvement: input.opportunities_for_improvement ?? null,
    recommendations: input.recommendations ?? null,
    comparison_notes: input.comparison_notes ?? null,
    // v2.0 fields
    capability_scores: input.capability_scores ? JSON.stringify(input.capability_scores) : null,
    eis_score: input.eis_score ?? null,
    hallucinations: input.hallucinations ?? null,
    overall_verdict: input.overall_verdict ?? null,
    lessons_learned: input.lessons_learned ?? null,
    observation_flags: input.observation_flags ? JSON.stringify(input.observation_flags) : '[]',
    compared_session_id: input.compared_session_id ?? null,
    capability_delta: input.capability_delta ? JSON.stringify(input.capability_delta) : null,
    evolution_summary: input.evolution_summary ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existingId) {
    const { data, error } = await supabase
      .from('atd_benchmark_reviews')
      .update(payload)
      .eq('id', existingId)
      .eq('is_locked', false)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Failed to update review');
    return data as BenchmarkReview;
  } else {
    const { data, error } = await supabase
      .from('atd_benchmark_reviews')
      .insert(payload)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Failed to create review');
    return data as BenchmarkReview;
  }
}

export async function submitReview(reviewId: string, sessionId: string): Promise<void> {
  const { error: reviewError } = await supabase
    .from('atd_benchmark_reviews')
    .update({ review_status: 'submitted', updated_at: new Date().toISOString() })
    .eq('id', reviewId);
  if (reviewError) throw reviewError;

  const { error: sessionError } = await supabase
    .from('atd_benchmark_sessions')
    .update({
      overall_review_status: 'awaiting_po_acceptance',
      review_id: reviewId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
  if (sessionError) throw sessionError;
}

// ─── PO Decision Functions ────────────────────────────────────────────────────

export async function loadPODecisionForSession(sessionId: string): Promise<PODecision | null> {
  const { data } = await supabase
    .from('atd_benchmark_po_decisions')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as PODecision | null;
}

export async function recordPODecision(input: RecordPODecisionInput): Promise<PODecision> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('atd_benchmark_po_decisions')
    .insert({
      session_id: input.session_id,
      review_id: input.review_id ?? null,
      decision: input.decision,
      product_owner: input.product_owner ?? null,
      comments: input.comments ?? null,
      decision_date: now,
      is_locked: true,
      // v2.0 fields
      reason: input.reason ?? null,
      decision_summary: input.decision_summary ?? null,
      future_recommendations: input.future_recommendations ?? null,
      po_notes: input.po_notes ?? null,
      locked_at: input.lock_decision ? now : null,
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to record PO decision');

  const po = data as PODecision;

  let sessionStatus: SessionStatus;
  if (input.decision === 'accepted') sessionStatus = 'accepted';
  else if (input.decision === 'accepted_with_observations') sessionStatus = 'accepted_with_observations';
  else sessionStatus = 'returned_for_improvement';

  await supabase
    .from('atd_benchmark_sessions')
    .update({
      overall_review_status: sessionStatus,
      po_decision_id: po.id,
      benchmark_outcome: input.decision,
      updated_at: now,
    })
    .eq('id', input.session_id);

  return po;
}

export async function updateSessionMilestone(
  sessionId: string,
  milestone: BenchmarkMilestone | null,
): Promise<void> {
  const { error } = await supabase
    .from('atd_benchmark_sessions')
    .update({ benchmark_milestone: milestone, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

/**
 * Loads the most recent accepted session (excluding `currentSessionId`) and
 * computes the capability delta relative to `currentScores`.
 * Returns null if no accepted baseline exists or if it has no capability scores.
 */
export async function loadCapabilityDelta(
  currentSessionId: string,
  currentScores: CapabilityScores,
): Promise<{ session: BenchmarkSession; review: BenchmarkReview; delta: CapabilityDelta } | null> {
  // Find the most recent accepted session that is not the current one
  const { data: sessions } = await supabase
    .from('atd_benchmark_sessions')
    .select('*')
    .in('overall_review_status', ['accepted', 'accepted_with_observations'])
    .neq('id', currentSessionId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!sessions?.length) return null;

  // Find one that has a review with capability scores
  for (const session of sessions) {
    const { data: review } = await supabase
      .from('atd_benchmark_reviews')
      .select('*')
      .eq('session_id', session.id)
      .not('capability_scores', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (review?.capability_scores) {
      const prevScores = (
        typeof review.capability_scores === 'string'
          ? JSON.parse(review.capability_scores)
          : review.capability_scores
      ) as CapabilityScores;

      const delta: Partial<CapabilityDelta> = {};
      for (const dim of CAPABILITY_DIMENSIONS) {
        delta[dim.key] = {
          previous: prevScores[dim.key] ?? 0,
          current: currentScores[dim.key],
          delta: currentScores[dim.key] - (prevScores[dim.key] ?? 0),
        };
      }

      return {
        session: session as BenchmarkSession,
        review: review as BenchmarkReview,
        delta: delta as CapabilityDelta,
      };
    }
  }

  return null;
}
