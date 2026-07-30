import { supabase } from './supabase';

// ============================================================
// Types
// ============================================================

export interface ReviewType {
  id: string;
  key: string;
  display_name: string;
  description: string;
  domain: string;
  status: 'active' | 'planned' | 'inactive';
  governing_standard: string;
  default_lifecycle: string[];
  allowed_decision_types: string[];
  created_at: string;
  updated_at: string;
}

export type ReviewStatus = 'draft' | 'open' | 'in_review' | 'approved' | 'rejected' | 'deferred' | 'closed';
export type ReviewPriority = 'low' | 'normal' | 'high' | 'critical';
export type ReviewTriggerType = 'manual' | 'automated' | 'policy' | 'atd_recommendation';
export type RecordPurpose = 'production' | 'validation' | 'test';

export interface GovernedReview {
  id: string;
  review_reference: string;
  review_type_key: string | null;
  title: string;
  summary: string;
  subject_object_type: string;
  subject_object_id: string | null;
  subject_reference: string;
  context_type: string;
  project_id: string | null;
  trigger_type: ReviewTriggerType;
  status: ReviewStatus;
  priority: ReviewPriority;
  confidence_score: number | null;
  recommendation: string;
  current_state: Record<string, unknown>;
  proposed_state: Record<string, unknown>;
  decision: string | null;
  decision_rationale: string | null;
  deciding_authority: string | null;
  deferred_until: string | null;
  assigned_reviewer_id: string | null;
  created_by: string;
  opened_at: string | null;
  decided_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  record_purpose: RecordPurpose;
  // joined
  ecr_extension?: EcrExtension | null;
}

export type EvidenceType =
  | 'usage' | 'duplication' | 'stability' | 'coupling'
  | 'business_case' | 'governance' | 'manual' | 'migration' | 'other';

export type EvidenceSourceType = 'manual' | 'automated' | 'imported' | 'atd' | 'system';

export interface ReviewEvidence {
  id: string;
  review_id: string;
  evidence_type: EvidenceType;
  title: string;
  description: string;
  source_type: EvidenceSourceType;
  source_reference: string;
  evidence_payload: Record<string, unknown>;
  added_by: string;
  supersedes_id: string | null;
  created_at: string;
}

export type ParticipantRole = 'reviewer' | 'approver' | 'observer' | 'atd' | 'product_owner';
export type AuthorityType = 'deciding' | 'advisory' | 'observing';
export type ParticipantPosition = 'support' | 'oppose' | 'neutral' | 'abstain' | 'pending';

export interface ReviewParticipant {
  id: string;
  review_id: string;
  participant_ref: string;
  participant_role: ParticipantRole;
  authority_type: AuthorityType;
  position: ParticipantPosition;
  comments: string;
  recorded_at: string | null;
  created_at: string;
}

export type AuditEventType =
  | 'created' | 'updated' | 'opened' | 'evidence_added' | 'participant_added'
  | 'review_started' | 'recommendation_changed' | 'approved' | 'rejected'
  | 'deferred' | 'closed' | 'reopened';

export interface ReviewAuditEvent {
  id: string;
  review_id: string;
  event_type: AuditEventType;
  actor: string;
  event_payload: Record<string, unknown>;
  reason: string;
  created_at: string;
}

export interface EcrExtension {
  id: string;
  review_id: string;
  ownership_metadata_id: string | null;
  object_classification_key: string | null;
  current_ownership_type_key: string | null;
  proposed_ownership_type_key: string | null;
  current_owner_ref: string | null;
  proposed_owner_ref: string | null;
  reusability_score: number | null;
  promotion_eligible: boolean;
  classification_confidence: number | null;
  migration_review: boolean;
  promotion_review: boolean;
  retirement_review: boolean;
  constitutional_boundary_case: boolean;
  effective_date: string | null;
  lineage_event_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Input types
// ============================================================

export interface CreateReviewInput {
  review_type_key: string;
  title: string;
  summary?: string;
  subject_object_type: string;
  subject_object_id?: string;
  subject_reference?: string;
  context_type?: string;
  project_id?: string;
  trigger_type?: ReviewTriggerType;
  priority?: ReviewPriority;
  confidence_score?: number;
  recommendation?: string;
  current_state?: Record<string, unknown>;
  proposed_state?: Record<string, unknown>;
  created_by?: string;
  record_purpose?: RecordPurpose;
}

export interface UpdateDraftReviewInput {
  title?: string;
  summary?: string;
  subject_object_type?: string;
  subject_object_id?: string;
  subject_reference?: string;
  recommendation?: string;
  confidence_score?: number;
  priority?: ReviewPriority;
  current_state?: Record<string, unknown>;
  proposed_state?: Record<string, unknown>;
  assigned_reviewer_id?: string;
}

export interface AddEvidenceInput {
  review_id: string;
  evidence_type: EvidenceType;
  title: string;
  description?: string;
  source_type?: EvidenceSourceType;
  source_reference?: string;
  evidence_payload?: Record<string, unknown>;
  added_by?: string;
  supersedes_id?: string;
}

export interface AddParticipantInput {
  review_id: string;
  participant_ref: string;
  participant_role?: ParticipantRole;
  authority_type?: AuthorityType;
  position?: ParticipantPosition;
  comments?: string;
}

export interface RecordPositionInput {
  position: ParticipantPosition;
  comments?: string;
}

export interface ApproveReviewInput {
  decision: string;
  decision_rationale: string;
  deciding_authority: string;
  actor?: string;
}

export interface RejectReviewInput {
  decision_rationale: string;
  actor?: string;
}

export interface DeferReviewInput {
  decision_rationale: string;
  deferred_until: string;
  actor?: string;
}

export interface CreateEcrInput {
  review_id: string;
  ownership_metadata_id?: string;
  object_classification_key?: string;
  current_ownership_type_key?: string;
  proposed_ownership_type_key?: string;
  current_owner_ref?: string;
  proposed_owner_ref?: string;
  reusability_score?: number;
  promotion_eligible?: boolean;
  classification_confidence?: number;
  migration_review?: boolean;
  promotion_review?: boolean;
  retirement_review?: boolean;
  constitutional_boundary_case?: boolean;
  effective_date?: string;
}

export interface UpdateDraftEcrInput {
  object_classification_key?: string;
  current_ownership_type_key?: string;
  proposed_ownership_type_key?: string;
  current_owner_ref?: string;
  proposed_owner_ref?: string;
  reusability_score?: number;
  promotion_eligible?: boolean;
  classification_confidence?: number;
  migration_review?: boolean;
  promotion_review?: boolean;
  retirement_review?: boolean;
  constitutional_boundary_case?: boolean;
  effective_date?: string;
}

// Valid lifecycle transitions
const VALID_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  draft: ['open'],
  open: ['in_review', 'draft'],
  in_review: ['approved', 'rejected', 'deferred'],
  approved: ['closed'],
  rejected: ['closed'],
  deferred: ['open', 'closed'],
  closed: [],
};

function assertValidTransition(from: ReviewStatus, to: ReviewStatus): void {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid lifecycle transition: ${from} → ${to}`);
  }
}

// ============================================================
// Review Types
// ============================================================

export async function listReviewTypes(): Promise<ReviewType[]> {
  const { data, error } = await supabase
    .from('ecc_review_types')
    .select('*')
    .order('domain', { ascending: true })
    .order('display_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getReviewTypeByKey(key: string): Promise<ReviewType | null> {
  const { data, error } = await supabase
    .from('ecc_review_types')
    .select('*')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ============================================================
// Reviews
// ============================================================

export async function createReview(input: CreateReviewInput): Promise<GovernedReview> {
  const { data, error } = await supabase
    .from('ecc_governed_reviews')
    .insert({
      review_type_key: input.review_type_key,
      title: input.title,
      summary: input.summary ?? '',
      subject_object_type: input.subject_object_type,
      subject_object_id: input.subject_object_id ?? null,
      subject_reference: input.subject_reference ?? '',
      context_type: input.context_type ?? '',
      project_id: input.project_id ?? null,
      trigger_type: input.trigger_type ?? 'manual',
      priority: input.priority ?? 'normal',
      confidence_score: input.confidence_score ?? null,
      recommendation: input.recommendation ?? '',
      current_state: input.current_state ?? {},
      proposed_state: input.proposed_state ?? {},
      created_by: input.created_by ?? 'platform',
      status: 'draft',
      record_purpose: input.record_purpose ?? 'production',
    })
    .select()
    .single();
  if (error) throw error;

  await appendReviewAuditEvent({
    review_id: data.id,
    event_type: 'created',
    actor: input.created_by ?? 'platform',
    event_payload: { review_type_key: input.review_type_key, title: input.title, record_purpose: input.record_purpose ?? 'production' },
  });

  return data;
}

export async function getReview(id: string): Promise<GovernedReview | null> {
  const { data, error } = await supabase
    .from('ecc_governed_reviews')
    .select('*, ecr_extension:ecc_ecr_extensions(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listReviews(opts?: {
  review_type_key?: string;
  status?: ReviewStatus | ReviewStatus[];
  limit?: number;
}): Promise<GovernedReview[]> {
  let query = supabase
    .from('ecc_governed_reviews')
    .select('*, ecr_extension:ecc_ecr_extensions(*)')
    .order('created_at', { ascending: false });

  if (opts?.review_type_key) {
    query = query.eq('review_type_key', opts.review_type_key);
  }
  if (opts?.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    query = query.in('status', statuses);
  }
  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listReviewsByStatus(status: ReviewStatus): Promise<GovernedReview[]> {
  return listReviews({ status });
}

export async function listReviewsByType(reviewTypeKey: string): Promise<GovernedReview[]> {
  return listReviews({ review_type_key: reviewTypeKey });
}

export async function updateDraftReview(
  id: string,
  input: UpdateDraftReviewInput,
  actor = 'platform',
): Promise<GovernedReview> {
  const review = await getReview(id);
  if (!review) throw new Error('Review not found');
  if (review.status !== 'draft') throw new Error('Only draft reviews may be edited');

  const { data, error } = await supabase
    .from('ecc_governed_reviews')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  await appendReviewAuditEvent({
    review_id: id,
    event_type: 'updated',
    actor,
    event_payload: input as Record<string, unknown>,
  });

  return data;
}

export async function assignReviewer(
  id: string,
  reviewerId: string,
  actor = 'platform',
): Promise<void> {
  const { error } = await supabase
    .from('ecc_governed_reviews')
    .update({ assigned_reviewer_id: reviewerId, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;

  await appendReviewAuditEvent({
    review_id: id,
    event_type: 'updated',
    actor,
    event_payload: { assigned_reviewer_id: reviewerId },
    reason: 'Reviewer assigned',
  });
}

export async function transitionReview(
  id: string,
  toStatus: ReviewStatus,
  opts?: {
    actor?: string;
    reason?: string;
    decision?: string;
    decision_rationale?: string;
    deciding_authority?: string;
    deferred_until?: string;
  },
): Promise<GovernedReview> {
  const review = await getReview(id);
  if (!review) throw new Error('Review not found');
  assertValidTransition(review.status, toStatus);

  // Validation rules per target status
  if (toStatus === 'open') {
    if (!review.recommendation?.trim()) throw new Error('A recommendation is required before opening a review');
    if (!review.subject_object_type?.trim()) throw new Error('A subject is required before opening a review');
    const evidence = await listReviewEvidence(id);
    if (evidence.length === 0) throw new Error('At least one evidence record is required before opening a review');
  }
  if (toStatus === 'approved') {
    if (!opts?.decision_rationale?.trim()) throw new Error('Decision rationale is required to approve a review');
    if (!opts?.deciding_authority?.trim()) throw new Error('Deciding authority is required to approve a review');
  }
  if (toStatus === 'rejected') {
    if (!opts?.decision_rationale?.trim()) throw new Error('Decision rationale is required to reject a review');
  }
  if (toStatus === 'deferred') {
    if (!opts?.decision_rationale?.trim()) throw new Error('Rationale is required to defer a review');
    if (!opts?.deferred_until) throw new Error('Future review date is required to defer a review');
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: toStatus,
    updated_at: now,
  };

  if (toStatus === 'open') patch.opened_at = now;
  if (['approved', 'rejected', 'deferred'].includes(toStatus)) {
    patch.decided_at = now;
    if (opts?.decision) patch.decision = opts.decision;
    if (opts?.decision_rationale) patch.decision_rationale = opts.decision_rationale;
    if (opts?.deciding_authority) patch.deciding_authority = opts.deciding_authority;
    if (opts?.deferred_until) patch.deferred_until = opts.deferred_until;
  }
  if (toStatus === 'closed') patch.closed_at = now;

  const { data, error } = await supabase
    .from('ecc_governed_reviews')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  const eventTypeMap: Partial<Record<ReviewStatus, AuditEventType>> = {
    open: 'opened',
    in_review: 'review_started',
    approved: 'approved',
    rejected: 'rejected',
    deferred: 'deferred',
    closed: 'closed',
  };

  await appendReviewAuditEvent({
    review_id: id,
    event_type: eventTypeMap[toStatus] ?? 'updated',
    actor: opts?.actor ?? 'platform',
    reason: opts?.reason ?? opts?.decision_rationale ?? '',
    event_payload: {
      from_status: review.status,
      to_status: toStatus,
      decision: opts?.decision,
      deciding_authority: opts?.deciding_authority,
      deferred_until: opts?.deferred_until,
    },
  });

  return data;
}

// ============================================================
// Evidence
// ============================================================

export async function addReviewEvidence(input: AddEvidenceInput): Promise<ReviewEvidence> {
  const { data, error } = await supabase
    .from('ecc_review_evidence')
    .insert({
      review_id: input.review_id,
      evidence_type: input.evidence_type,
      title: input.title,
      description: input.description ?? '',
      source_type: input.source_type ?? 'manual',
      source_reference: input.source_reference ?? '',
      evidence_payload: input.evidence_payload ?? {},
      added_by: input.added_by ?? 'platform',
      supersedes_id: input.supersedes_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  await appendReviewAuditEvent({
    review_id: input.review_id,
    event_type: 'evidence_added',
    actor: input.added_by ?? 'platform',
    event_payload: { evidence_id: data.id, evidence_type: input.evidence_type, title: input.title },
  });

  return data;
}

export async function listReviewEvidence(reviewId: string): Promise<ReviewEvidence[]> {
  const { data, error } = await supabase
    .from('ecc_review_evidence')
    .select('*')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// Participants
// ============================================================

export async function addReviewParticipant(
  input: AddParticipantInput,
): Promise<ReviewParticipant> {
  const { data, error } = await supabase
    .from('ecc_review_participants')
    .insert({
      review_id: input.review_id,
      participant_ref: input.participant_ref,
      participant_role: input.participant_role ?? 'reviewer',
      authority_type: input.authority_type ?? 'advisory',
      position: input.position ?? 'pending',
      comments: input.comments ?? '',
    })
    .select()
    .single();
  if (error) throw error;

  await appendReviewAuditEvent({
    review_id: input.review_id,
    event_type: 'participant_added',
    actor: input.participant_ref,
    event_payload: { participant_role: input.participant_role, authority_type: input.authority_type },
  });

  return data;
}

export async function recordParticipantPosition(
  participantId: string,
  input: RecordPositionInput,
): Promise<ReviewParticipant> {
  const { data, error } = await supabase
    .from('ecc_review_participants')
    .update({
      position: input.position,
      comments: input.comments ?? '',
      recorded_at: new Date().toISOString(),
    })
    .eq('id', participantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listReviewParticipants(reviewId: string): Promise<ReviewParticipant[]> {
  const { data, error } = await supabase
    .from('ecc_review_participants')
    .select('*')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// Audit
// ============================================================

export async function appendReviewAuditEvent(input: {
  review_id: string;
  event_type: AuditEventType;
  actor?: string;
  event_payload?: Record<string, unknown>;
  reason?: string;
}): Promise<ReviewAuditEvent> {
  const { data, error } = await supabase
    .from('ecc_review_audit_events')
    .insert({
      review_id: input.review_id,
      event_type: input.event_type,
      actor: input.actor ?? 'system',
      event_payload: input.event_payload ?? {},
      reason: input.reason ?? '',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listReviewAuditEvents(reviewId: string): Promise<ReviewAuditEvent[]> {
  const { data, error } = await supabase
    .from('ecc_review_audit_events')
    .select('*')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// ECR Convenience Methods
// ============================================================

export async function createEngineeringClassificationReview(input: {
  title: string;
  summary?: string;
  subject_object_type: string;
  subject_object_id?: string;
  subject_reference?: string;
  created_by?: string;
  priority?: ReviewPriority;
  recommendation?: string;
  confidence_score?: number;
  record_purpose?: RecordPurpose;
  ecr: Omit<CreateEcrInput, 'review_id'>;
}): Promise<GovernedReview> {
  const review = await createReview({
    review_type_key: 'engineering_classification',
    title: input.title,
    summary: input.summary,
    subject_object_type: input.subject_object_type,
    subject_object_id: input.subject_object_id,
    subject_reference: input.subject_reference,
    priority: input.priority,
    recommendation: input.recommendation,
    confidence_score: input.confidence_score,
    created_by: input.created_by,
    trigger_type: 'manual',
    record_purpose: input.record_purpose,
  });

  const { error } = await supabase.from('ecc_ecr_extensions').insert({
    review_id: review.id,
    ownership_metadata_id: input.ecr.ownership_metadata_id ?? null,
    object_classification_key: input.ecr.object_classification_key ?? null,
    current_ownership_type_key: input.ecr.current_ownership_type_key ?? null,
    proposed_ownership_type_key: input.ecr.proposed_ownership_type_key ?? null,
    current_owner_ref: input.ecr.current_owner_ref ?? null,
    proposed_owner_ref: input.ecr.proposed_owner_ref ?? null,
    reusability_score: input.ecr.reusability_score ?? null,
    promotion_eligible: input.ecr.promotion_eligible ?? false,
    classification_confidence: input.ecr.classification_confidence ?? null,
    migration_review: input.ecr.migration_review ?? false,
    promotion_review: input.ecr.promotion_review ?? false,
    retirement_review: input.ecr.retirement_review ?? false,
    constitutional_boundary_case: input.ecr.constitutional_boundary_case ?? false,
    effective_date: input.ecr.effective_date ?? null,
  });
  if (error) throw error;

  return (await getReview(review.id))!;
}

export async function getEngineeringClassificationReview(
  id: string,
): Promise<GovernedReview | null> {
  const { data, error } = await supabase
    .from('ecc_governed_reviews')
    .select('*, ecr_extension:ecc_ecr_extensions(*)')
    .eq('id', id)
    .eq('review_type_key', 'engineering_classification')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listEngineeringClassificationReviews(opts?: {
  status?: ReviewStatus | ReviewStatus[];
  promotion_eligible?: boolean;
  migration_review?: boolean;
}): Promise<GovernedReview[]> {
  let query = supabase
    .from('ecc_governed_reviews')
    .select('*, ecr_extension:ecc_ecr_extensions(*)')
    .eq('review_type_key', 'engineering_classification')
    .order('created_at', { ascending: false });

  if (opts?.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    query = query.in('status', statuses);
  }

  const { data, error } = await query;
  if (error) throw error;

  let results = data ?? [];
  if (opts?.promotion_eligible !== undefined) {
    results = results.filter(
      (r) => (r as GovernedReview & { ecr_extension: EcrExtension | null })
        .ecr_extension?.promotion_eligible === opts.promotion_eligible,
    );
  }
  if (opts?.migration_review !== undefined) {
    results = results.filter(
      (r) => (r as GovernedReview & { ecr_extension: EcrExtension | null })
        .ecr_extension?.migration_review === opts.migration_review,
    );
  }

  return results;
}

export async function updateDraftECRRecommendation(
  reviewId: string,
  ecrInput: UpdateDraftEcrInput,
  actor = 'platform',
): Promise<void> {
  const review = await getReview(reviewId);
  if (!review) throw new Error('Review not found');
  if (review.status !== 'draft') throw new Error('Only draft ECRs may have their recommendation updated');

  const { error } = await supabase
    .from('ecc_ecr_extensions')
    .update({ ...ecrInput, updated_at: new Date().toISOString() })
    .eq('review_id', reviewId);
  if (error) throw error;

  await appendReviewAuditEvent({
    review_id: reviewId,
    event_type: 'recommendation_changed',
    actor,
    event_payload: ecrInput as Record<string, unknown>,
  });
}

export async function approveECR(
  reviewId: string,
  input: ApproveReviewInput,
): Promise<GovernedReview> {
  return transitionReview(reviewId, 'approved', {
    actor: input.actor ?? 'platform',
    decision: input.decision,
    decision_rationale: input.decision_rationale,
    deciding_authority: input.deciding_authority,
  });
}

export async function rejectECR(
  reviewId: string,
  input: RejectReviewInput,
): Promise<GovernedReview> {
  return transitionReview(reviewId, 'rejected', {
    actor: input.actor ?? 'platform',
    decision_rationale: input.decision_rationale,
  });
}

export async function deferECR(
  reviewId: string,
  input: DeferReviewInput,
): Promise<GovernedReview> {
  return transitionReview(reviewId, 'deferred', {
    actor: input.actor ?? 'platform',
    decision_rationale: input.decision_rationale,
    deferred_until: input.deferred_until,
  });
}

// ============================================================
// Governance Overview Metrics
// ============================================================

export interface EcrMetrics {
  draft: number;
  open: number;
  in_review: number;
  approved: number;
  rejected: number;
  deferred: number;
  closed: number;
  total: number;
  high_confidence: number;
  awaiting_decision: number;
  avg_confidence: number | null;
}

export async function getEcrMetrics(): Promise<EcrMetrics> {
  const { data, error } = await supabase
    .from('ecc_governed_reviews')
    .select('status, confidence_score')
    .eq('review_type_key', 'engineering_classification');

  if (error) throw error;
  const rows = data ?? [];

  const counts: Record<string, number> = {};
  let totalConfidence = 0;
  let confidenceCount = 0;
  let highConfidence = 0;

  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    if (row.confidence_score != null) {
      totalConfidence += row.confidence_score;
      confidenceCount++;
      if (row.confidence_score >= 75) highConfidence++;
    }
  }

  return {
    draft: counts.draft ?? 0,
    open: counts.open ?? 0,
    in_review: counts.in_review ?? 0,
    approved: counts.approved ?? 0,
    rejected: counts.rejected ?? 0,
    deferred: counts.deferred ?? 0,
    closed: counts.closed ?? 0,
    total: rows.length,
    high_confidence: highConfidence,
    awaiting_decision: (counts.in_review ?? 0),
    avg_confidence: confidenceCount > 0 ? Math.round(totalConfidence / confidenceCount) : null,
  };
}

// ============================================================
// Subject Identity Resolution
// ============================================================

export interface SubjectIdentityResult {
  resolved: boolean;
  exists: boolean;
  metadata_id: string | null;
}

export async function resolveSubjectIdentity(
  objectId: string,
  objectType: string,
): Promise<SubjectIdentityResult> {
  const { data, error } = await supabase
    .rpc('resolve_subject_identity', {
      p_object_id: objectId,
      p_object_type: objectType,
    });
  if (error) throw error;
  return data as SubjectIdentityResult;
}

export type SubjectIdentityStatus = 'resolved' | 'missing' | 'invalid' | 'test_only';

export function getSubjectIdentityStatus(review: GovernedReview): SubjectIdentityStatus {
  if (review.record_purpose !== 'production') return 'test_only';
  if (!review.subject_object_id) return 'missing';
  return 'resolved';
}

// ============================================================
// Governed Deletion
// ============================================================

export async function deleteReview(reviewId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_review_and_extensions', {
    p_review_id: reviewId,
  });
  if (error) throw error;
}

export async function deleteMigrationPlan(planId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_migration_plan', {
    p_plan_id: planId,
  });
  if (error) throw error;
}

// ============================================================
// Update Review Subject (for linking a draft/test ECR to a real object)
// ============================================================

export async function updateReviewSubject(
  reviewId: string,
  subjectObjectId: string,
  subjectReference?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    subject_object_id: subjectObjectId,
    updated_at: new Date().toISOString(),
  };
  if (subjectReference !== undefined) {
    update.subject_reference = subjectReference;
  }
  const { error } = await supabase
    .from('ecc_governed_reviews')
    .update(update)
    .eq('id', reviewId)
    .in('status', ['draft']);
  if (error) throw error;
}
