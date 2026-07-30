import { supabase } from './supabase';
import {
  getReview,
  listReviewEvidence,
  type GovernedReview,
  type EcrExtension,
  type RecordPurpose,
} from './reviewService';
import {
  getOwnershipMetadataForObject,
  getLineageForObject,
  listSharedPlatformCapabilities,
  resolveOwnershipLabel,
  resolveClassificationLabel,
  type OwnershipMetadata,
  type OwnershipLineageEvent,
  type SharedPlatformCapability,
} from './ownershipService';

// ============================================================
// Types
// ============================================================

export type MigrationPlanStatus = 'draft' | 'ready' | 'frozen' | 'superseded' | 'blocked';
export type RiskScore = 'low' | 'medium' | 'high';

export interface MigrationPlan {
  id: string;
  plan_ref: string;
  review_id: string;
  status: MigrationPlanStatus;
  created_at: string;
  created_by: string;
  constitutional_version: string;
  decision_hash: string | null;
  risk_score: RiskScore;
  estimated_operations: number;
  estimated_duration_seconds: number;
  rollback_available: boolean;
  execution_ready_score: number;
  snapshot_json: PlanSnapshot;
  diff_json: MigrationDiff;
  validation_json: ValidationResult;
  created_from_review_version: string | null;
  closed_at: string | null;
  record_purpose: RecordPurpose;
}

export interface PlanSnapshot {
  current_state: {
    owner: string;
    classification: string;
    registry: string;
    lineage_status: string;
    ownership_metadata: OwnershipMetadata | null;
    lineage_events: OwnershipLineageEvent[];
  };
  target_state: {
    owner: string;
    classification: string;
    registry: string;
    lineage: string;
  };
  migration_operations: MigrationOperation[];
  review: GovernedReview;
  ecr_extension: EcrExtension | null;
  evidence_count: number;
  existing_spcs: SharedPlatformCapability[];
  dependencies: string[];
  migration_flags: {
    migration_review: boolean;
    promotion_review: boolean;
    retirement_review: boolean;
    constitutional_boundary_case: boolean;
    promotion_eligible: boolean;
  };
}

export interface MigrationOperation {
  order: number;
  operation: string;
  description: string;
  reversible: boolean;
}

export interface MigrationDiff {
  fields: DiffEntry[];
}

export interface DiffEntry {
  field: string;
  from: string;
  to: string;
}

export interface ValidationResult {
  evidence_completeness: number;
  review_approved: boolean;
  dependencies_satisfied: boolean;
  missing_references: string[];
  confidence: number;
  outstanding_validation: string[];
  blocking_issues: string[];
  warnings: string[];
  subject_identity_valid: boolean;
  subject_identity_status: string;
  executable: boolean;
}

export interface RollbackPreview {
  steps: string[];
  estimated_rollback_duration_seconds: number;
  rollback_available: boolean;
}

export interface ConstitutionalFingerprint {
  applicable_standards: string[];
  applicable_sections: string[];
  decision_hash: string;
  constitution_version: string;
  engineering_standard_versions: string[];
}

export interface MigrationPlanMetrics {
  draft: number;
  ready: number;
  blocked: number;
  total: number;
  average_readiness: number;
  average_risk: RiskScore | null;
}

// ============================================================
// CRUD
// ============================================================

export async function listMigrationPlans(): Promise<MigrationPlan[]> {
  const { data, error } = await supabase
    .from('ecc_migration_plans')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MigrationPlan[];
}

export async function getMigrationPlan(id: string): Promise<MigrationPlan | null> {
  const { data, error } = await supabase
    .from('ecc_migration_plans')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as MigrationPlan | null;
}

export async function getMigrationPlansByReview(reviewId: string): Promise<MigrationPlan[]> {
  const { data, error } = await supabase
    .from('ecc_migration_plans')
    .select('*')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MigrationPlan[];
}

async function computeDecisionHash(review: GovernedReview): Promise<string> {
  const payload = JSON.stringify({
    id: review.id,
    status: review.status,
    decision: review.decision ?? '',
    decision_rationale: review.decision_rationale ?? '',
    decided_at: review.decided_at ?? '',
  });
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(payload));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================
// Plan Generation
// ============================================================

export async function generateMigrationPlan(
  reviewId: string,
  createdBy = 'platform',
): Promise<MigrationPlan> {
  const review = await getReview(reviewId);
  if (!review) throw new Error('Review not found');
  if (review.status !== 'approved') {
    throw new Error(
      `Migration plans can only be generated from APPROVED reviews. This review is currently "${review.status}". ` +
      `Only reviews with status "approved" may generate migration plans. ` +
      `Rejected, Deferred, Draft, Open, and In Review reviews cannot generate plans.`,
    );
  }

  const ecr = review.ecr_extension ?? null;
  const recordPurpose = review.record_purpose ?? 'production';

  const evidence = await listReviewEvidence(reviewId);

  let ownershipMetadata: OwnershipMetadata | null = null;
  if (review.subject_object_id) {
    ownershipMetadata = await getOwnershipMetadataForObject(
      review.subject_object_id,
      review.subject_object_type,
    );
  }

  let lineageEvents: OwnershipLineageEvent[] = [];
  if (review.subject_object_id) {
    lineageEvents = await getLineageForObject(
      review.subject_object_id,
      review.subject_object_type,
    );
  }

  const existingSpcs = await listSharedPlatformCapabilities();

  const currentOwnerLabel = await resolveOwnershipLabel(
    ecr?.current_ownership_type_key ?? ownershipMetadata?.ownership_type ?? null,
  );
  const targetOwnerLabel = await resolveOwnershipLabel(
    ecr?.proposed_ownership_type_key ?? null,
  );
  const currentClassLabel = await resolveClassificationLabel(
    ecr?.object_classification_key ?? ownershipMetadata?.classification_type ?? null,
  );
  const targetClassLabel = await resolveClassificationLabel(
    ecr?.object_classification_key ?? null,
  );

  const currentRegistry = ownershipMetadata ? 'Ownership Metadata' : 'None';
  const targetRegistry = ecr?.proposed_ownership_type_key === 'platform' ? 'SPC' : 'Ownership Metadata';

  const lineageStatus = lineageEvents.length > 0
    ? `${lineageEvents.length} event(s) recorded`
    : 'No lineage';

  const operations = buildMigrationOperations(review, ecr, ownershipMetadata);

  const diff = buildMigrationDiff(
    currentOwnerLabel,
    targetOwnerLabel,
    currentClassLabel,
    targetClassLabel,
    currentRegistry,
    targetRegistry,
    lineageStatus,
  );

  const validation = buildValidationResult(review, evidence, ecr, ownershipMetadata);

  const riskScore = calculateRiskScore(review, ecr, validation, lineageEvents);

  const executionReadyScore = calculateExecutionReadiness(review, evidence, validation, ecr);

  const rollbackAvailable = ownershipMetadata !== null || lineageEvents.length > 0;

  const estimatedDuration = operations.length * 30 + (rollbackAvailable ? 60 : 0);

  let planStatus: MigrationPlanStatus;
  if (recordPurpose !== 'production') {
    planStatus = validation.blocking_issues.length > 0 ? 'blocked' : 'ready';
  } else if (!validation.subject_identity_valid) {
    planStatus = 'blocked';
  } else if (validation.blocking_issues.length > 0) {
    planStatus = 'blocked';
  } else {
    planStatus = 'ready';
  }

  const snapshot: PlanSnapshot = {
    current_state: {
      owner: currentOwnerLabel,
      classification: currentClassLabel,
      registry: currentRegistry,
      lineage_status: lineageStatus,
      ownership_metadata: ownershipMetadata,
      lineage_events: lineageEvents,
    },
    target_state: {
      owner: targetOwnerLabel,
      classification: targetClassLabel,
      registry: targetRegistry,
      lineage: rollbackAvailable ? 'New Event (Append)' : 'New Event',
    },
    migration_operations: operations,
    review,
    ecr_extension: ecr,
    evidence_count: evidence.length,
    existing_spcs: existingSpcs,
    dependencies: extractDependencies(review, ecr),
    migration_flags: {
      migration_review: ecr?.migration_review ?? false,
      promotion_review: ecr?.promotion_review ?? false,
      retirement_review: ecr?.retirement_review ?? false,
      constitutional_boundary_case: ecr?.constitutional_boundary_case ?? false,
      promotion_eligible: ecr?.promotion_eligible ?? false,
    },
  };

  const decisionHash = await computeDecisionHash(review);

  // Supersede previous plans for the same ECR
  if (planStatus === 'ready' || planStatus === 'blocked') {
    await supabase
      .from('ecc_migration_plans')
      .update({ status: 'superseded' })
      .eq('review_id', reviewId)
      .in('status', ['ready', 'blocked', 'draft']);
  }

  const { data, error } = await supabase
    .from('ecc_migration_plans')
    .insert({
      plan_ref: undefined,
      review_id: reviewId,
      status: planStatus,
      created_by: createdBy,
      constitutional_version: 'EOCPS-001 v1.0',
      decision_hash: decisionHash,
      risk_score: riskScore,
      estimated_operations: operations.length,
      estimated_duration_seconds: estimatedDuration,
      rollback_available: rollbackAvailable,
      execution_ready_score: executionReadyScore,
      snapshot_json: snapshot as unknown as Record<string, unknown>,
      diff_json: diff as unknown as Record<string, unknown>,
      validation_json: validation as unknown as Record<string, unknown>,
      created_from_review_version: review.updated_at,
      record_purpose: recordPurpose,
    })
    .select()
    .single();

  if (error) throw error;
  return data as MigrationPlan;
}

// ============================================================
// Plan Generation Helpers
// ============================================================

function buildMigrationOperations(
  review: GovernedReview,
  ecr: EcrExtension | null,
  ownershipMetadata: OwnershipMetadata | null,
): MigrationOperation[] {
  const ops: MigrationOperation[] = [];
  let order = 1;

  if (ownershipMetadata) {
    ops.push({
      order: order++,
      operation: 'Update ownership metadata',
      description: `Update ownership_type from "${ecr?.current_ownership_type_key ?? 'current'}" to "${ecr?.proposed_ownership_type_key ?? 'target'}" for ${review.subject_object_type}`,
      reversible: true,
    });
  } else {
    ops.push({
      order: order++,
      operation: 'Create ownership metadata',
      description: `Create new ownership metadata record for ${review.subject_object_type} with ownership_type "${ecr?.proposed_ownership_type_key ?? 'target'}"`,
      reversible: true,
    });
  }

  if (ecr?.proposed_ownership_type_key === 'platform' && ecr?.promotion_eligible) {
    ops.push({
      order: order++,
      operation: 'Create SPC',
      description: `Register new Shared Platform Capability in the SPC Registry`,
      reversible: true,
    });

    ops.push({
      order: order++,
      operation: 'Register capability',
      description: `Register the capability in the Capability Registry with classification "${ecr?.object_classification_key ?? 'unclassified'}"`,
      reversible: true,
    });
  }

  ops.push({
    order: order++,
    operation: 'Append lineage',
    description: `Append a new lineage event recording the ownership change from "${ecr?.current_ownership_type_key ?? 'none'}" to "${ecr?.proposed_ownership_type_key ?? 'target'}"`,
    reversible: false,
  });

  if (ownershipMetadata && ecr?.current_ownership_type_key && ecr?.proposed_ownership_type_key !== ecr?.current_ownership_type_key) {
    ops.push({
      order: order++,
      operation: 'Archive previous owner',
      description: `Mark previous ownership type "${ecr?.current_ownership_type_key}" as superseded in the lineage ledger`,
      reversible: false,
    });
  }

  return ops;
}

function buildMigrationDiff(
  currentOwner: string,
  targetOwner: string,
  currentClass: string,
  targetClass: string,
  currentRegistry: string,
  targetRegistry: string,
  currentLineage: string,
): MigrationDiff {
  const fields: DiffEntry[] = [
    { field: 'Owner', from: currentOwner, to: targetOwner },
    { field: 'Classification', from: currentClass, to: targetClass },
    { field: 'Registry', from: currentRegistry, to: targetRegistry },
    { field: 'Lineage', from: currentLineage, to: 'New Event' },
  ];
  return { fields };
}

function buildValidationResult(
  review: GovernedReview,
  evidence: { id: string }[],
  ecr: EcrExtension | null,
  ownershipMetadata: OwnershipMetadata | null,
): ValidationResult {
  const missingReferences: string[] = [];
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const outstandingValidation: string[] = [];

  const evidenceCompleteness = Math.min(100, evidence.length * 25);
  const reviewApproved = review.status === 'approved';
  const confidence = review.confidence_score ?? 0;

  // Subject identity validation
  let subjectIdentityValid = true;
  let subjectIdentityStatus = 'resolved';

  if ((review.record_purpose ?? 'production') === 'production') {
    if (!review.subject_object_id) {
      subjectIdentityValid = false;
      subjectIdentityStatus = 'missing';
      blockingIssues.push(
        'Subject Engineering Object Not Resolved: The originating ECR contains reference "' +
        (review.subject_reference || '—') + '" but no canonical engineering object ID. ' +
        'Link the ECR to an existing engineering object and regenerate the Migration Plan.',
      );
    } else if (!ownershipMetadata) {
      subjectIdentityStatus = 'resolved';
    }
  } else {
    subjectIdentityStatus = 'test_only';
  }

  if (!review.subject_object_id) {
    missingReferences.push('Subject object ID is not set');
  }
  if (ecr && !ecr.proposed_ownership_type_key) {
    missingReferences.push('Proposed ownership type is not specified');
    blockingIssues.push('Invalid target owner: proposed ownership type is not specified');
  }
  if (ecr && !ecr.object_classification_key) {
    missingReferences.push('Object classification is not specified');
    blockingIssues.push('Missing classification: object classification is not specified');
  }

  if (!reviewApproved) {
    blockingIssues.push('Review is not in approved status');
  }
  if (evidence.length === 0) {
    blockingIssues.push('No evidence records attached to review');
  }

  if (ecr?.constitutional_boundary_case) {
    warnings.push('Constitutional boundary case — requires additional scrutiny');
  }
  if (confidence > 0 && confidence < 50) {
    warnings.push('Low confidence score on review');
  }

  if (ecr && !ecr.promotion_eligible && ecr.proposed_ownership_type_key === 'platform') {
    outstandingValidation.push('Promotion to Platform ownership requires promotion eligibility');
  }

  const executable = subjectIdentityValid && blockingIssues.length === 0 && (review.record_purpose ?? 'production') === 'production';

  return {
    evidence_completeness: evidenceCompleteness,
    review_approved: reviewApproved,
    dependencies_satisfied: true,
    missing_references: missingReferences,
    confidence,
    outstanding_validation: outstandingValidation,
    blocking_issues: blockingIssues,
    warnings,
    subject_identity_valid: subjectIdentityValid,
    subject_identity_status: subjectIdentityStatus,
    executable,
  };
}

function calculateRiskScore(
  review: GovernedReview,
  ecr: EcrExtension | null,
  validation: ValidationResult,
  lineageEvents: OwnershipLineageEvent[],
): RiskScore {
  let risk = 0;

  if (lineageEvents.length > 2) risk += 2;
  if (lineageEvents.length > 5) risk += 1;
  if (ecr?.constitutional_boundary_case) risk += 2;
  risk += validation.missing_references.length;
  risk += validation.blocking_issues.length * 2;
  if ((review.confidence_score ?? 100) < 50) risk += 2;
  if ((review.confidence_score ?? 100) < 25) risk += 1;
  if (ecr?.proposed_ownership_type_key === 'platform') risk += 1;

  if (risk >= 5) return 'high';
  if (risk >= 2) return 'medium';
  return 'low';
}

function calculateExecutionReadiness(
  review: GovernedReview,
  evidence: { id: string }[],
  validation: ValidationResult,
  ecr: EcrExtension | null,
): number {
  let score = 0;

  score += Math.min(25, evidence.length * 6);
  if (review.status === 'approved') score += 25;
  if (validation.dependencies_satisfied) score += 15;
  if (validation.missing_references.length === 0) {
    score += 15;
  } else {
    score += Math.max(0, 15 - validation.missing_references.length * 5);
  }
  score += Math.min(10, Math.round((review.confidence_score ?? 0) / 10));
  if (validation.outstanding_validation.length === 0) {
    score += 10;
  } else {
    score += Math.max(0, 10 - validation.outstanding_validation.length * 3);
  }

  return Math.min(100, score);
}

function extractDependencies(
  review: GovernedReview,
  ecr: EcrExtension | null,
): string[] {
  const deps: string[] = [];
  if (ecr?.proposed_ownership_type_key === 'platform') {
    deps.push('SPC Registry must be available');
    deps.push('Capability Registry must be available');
  }
  if (ecr?.constitutional_boundary_case) {
    deps.push('Constitutional review required');
  }
  deps.push(`Subject object: ${review.subject_object_type}`);
  return deps;
}

// ============================================================
// Rollback Preview
// ============================================================

export function getRollbackPreview(plan: MigrationPlan): RollbackPreview {
  const snapshot = plan.snapshot_json;
  const steps: string[] = [];

  if (snapshot.current_state.ownership_metadata) {
    steps.push('Restore ownership metadata to previous state');
  }
  steps.push(`Restore registry from "${snapshot.target_state.registry}" to "${snapshot.current_state.registry}"`);
  steps.push('Restore lineage by appending a rollback event');

  const estimatedDuration = steps.length * 30;

  return {
    steps,
    estimated_rollback_duration_seconds: estimatedDuration,
    rollback_available: plan.rollback_available,
  };
}

// ============================================================
// Constitutional Fingerprint
// ============================================================

export function getConstitutionalFingerprint(plan: MigrationPlan): ConstitutionalFingerprint {
  return {
    applicable_standards: ['EOCPS-001'],
    applicable_sections: [
      '§ 2 — Engineering Classification Model',
      '§ 3 — Ownership Model',
      '§ 4 — Capability Promotion Model',
      '§ 6 — Ownership Lineage Specification',
    ],
    decision_hash: plan.decision_hash ?? '',
    constitution_version: plan.constitutional_version,
    engineering_standard_versions: ['EOCPS-001 v1.0'],
  };
}

// ============================================================
// Metrics
// ============================================================

export async function getMigrationPlanMetrics(): Promise<MigrationPlanMetrics> {
  const { data, error } = await supabase
    .from('ecc_migration_plans')
    .select('status, execution_ready_score, risk_score');

  if (error) throw error;
  const rows = (data ?? []) as { status: string; execution_ready_score: number; risk_score: string }[];

  const counts: Record<string, number> = {};
  let totalReadiness = 0;
  const riskCounts: Record<string, number> = { low: 0, medium: 0, high: 0 };

  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    totalReadiness += row.execution_ready_score;
    if (row.risk_score in riskCounts) riskCounts[row.risk_score]++;
  }

  const blocked = (counts['blocked'] ?? 0) + (counts['draft'] ?? 0) + (counts['superseded'] ?? 0);

  let averageRisk: RiskScore | null = null;
  if (rows.length > 0) {
    if (riskCounts.high > 0) averageRisk = 'high';
    else if (riskCounts.medium > 0) averageRisk = 'medium';
    else averageRisk = 'low';
  }

  return {
    draft: counts['draft'] ?? 0,
    ready: counts['ready'] ?? 0,
    blocked,
    total: rows.length,
    average_readiness: rows.length > 0 ? Math.round(totalReadiness / rows.length) : 0,
    average_risk: averageRisk,
  };
}
