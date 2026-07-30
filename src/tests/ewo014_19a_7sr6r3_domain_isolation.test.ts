// EWO-014.19A.7SR.6R.3 — Integrity-Domain Isolation & Recommendation Context Fidelity
//
// Regression tests ensuring:
// 1. Parent genuinely missing + child title conflict → Accept Historical Root (metadata rejected)
// 2. Parent genuinely missing + historical evidence → Begin Historical Recovery
// 3. Parent exists but child parent_ref is null → Resolve Parent Linkage
// 4. Metadata-conflict alert → Synchronise Metadata remains valid
// 5. Duplicate-reference alert with metadata conflict → duplicate-domain recommendation primary
// 6. Secondary child metadata issue creates separate finding without overriding primary
// 7. Evolved title matches primary domain
// 8. Governed resolution audit records correct domain and subject

import { describe, it, expect } from 'vitest';
import {
  determinePrimaryDomain,
  isRecommendationValidForDomain,
  buildLineageCanonicalDecision,
  buildDomainDiagnostics,
  DOMAIN_LABELS,
  type IntegrityDomain,
  type SecondaryFinding,
} from '../lib/integrityDomainModel';
import type { IntegrityAlert } from '../lib/engineeringIntegrityService';
import type { EvidencePackage, EvidenceItem, ConflictDetail } from '../lib/evidencePackageService';
import type { ExistenceResolution } from '../lib/authoritativeEngineeringExistenceService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<IntegrityAlert>): IntegrityAlert {
  return {
    id: 'test-alert-1',
    alert_type: 'parent_child_issue',
    normalised_reference: 'EWO-014.3.2B',
    description: 'Parent-Child Issue: EWO-014.3.2B',
    severity: 'high',
    status: 'open',
    detected_at: new Date().toISOString(),
    evidence: { expected_parent: 'EWO-014.3' },
    ...overrides,
  } as IntegrityAlert;
}

function makeEvidencePackage(overrides: Partial<EvidencePackage>): EvidencePackage {
  return {
    evidence_items: [],
    conflicts: [],
    existence_resolution: null,
    classification_explanation: {
      classification: '',
      chosen_reason: '',
      rejected_alternatives: [],
      authoritative_rules_applied: [],
    },
    evidence_graph: { nodes: [], edges: [] },
    canonical_decision: {
      canonical_object_type: null,
      canonical_reference: null,
      canonical_value: null,
      supporting_evidence_count: 0,
      conflicting_evidence_count: 0,
      confidence: 0,
      reasoning: '',
      po_review_required: true,
    },
    runtime_diagnostics: {
      sources_searched: [],
      sources_contributing_evidence: [],
      conflicting_evidence_count: 0,
      supporting_evidence_count: 0,
      authoritative_evidence_count: 0,
      unknown_evidence_count: 0,
      po_decisions_required: 0,
      automatic_repairs_possible: 0,
    },
    alert: makeAlert({}),
    ...overrides,
  } as unknown as EvidencePackage;
}

function makeConflict(field: string, canonical?: string): ConflictDetail {
  return {
    conflicting_field: field,
    canonical_candidate: canonical ?? null,
    canonical_reason: 'Canonical title from Work Order',
    po_review_required: false,
    sources: [
      { source: 'ewo', field_name: field, field_value: 'Title A', confidence: 0.9 },
      { source: 'completion_report', field_name: field, field_value: 'Title B', confidence: 0.8 },
    ],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EWO-014.19A.7SR.6R.3 — Integrity-Domain Isolation', () => {

  // TEST 1: Parent genuinely missing + child title conflict → Accept Historical Root, metadata rejected
  it('TEST 1 — PARENT_GENUINELY_MISSING with child title conflict produces Accept Historical Root, not Synchronise Metadata', () => {
    const alert = makeAlert({
      alert_type: 'parent_child_issue',
      parent_child_classification: 'PARENT_GENUINELY_MISSING',
      authoritative_source_type: null,
      governing_evidence: null,
      audit_conclusion: null,
    } as unknown as Partial<IntegrityAlert>);

    const domain = determinePrimaryDomain(alert);
    expect(domain).toBe('parent_child_lineage');

    // Metadata sync is NOT valid for parent_child_lineage
    expect(isRecommendationValidForDomain('synchronise_metadata', domain)).toBe(false);
    // Accept historical root IS valid
    expect(isRecommendationValidForDomain('accept_historical_root', domain)).toBe(true);

    // Canonical decision must address parent, not child title
    const pkg = makeEvidencePackage({
      conflicts: [makeConflict('title', 'Engineering Verification Standard (EVS) v1.0')],
    });
    const decision = buildLineageCanonicalDecision(alert, pkg);
    expect(decision.canonical_value).toBe('Accept Child as Historical Root');
    expect(decision.reasoning).toContain('EWO-014.3');
    expect(decision.reasoning).not.toContain('EVS');
  });

  // TEST 2: Parent genuinely missing + historical evidence → Begin Historical Recovery
  it('TEST 2 — PARENT_GENUINELY_MISSING with historical evidence produces Begin Historical Recovery', () => {
    const alert = makeAlert({
      alert_type: 'parent_child_issue',
      parent_child_classification: 'PARENT_GENUINELY_MISSING',
      authoritative_source_type: 'historical_reference',
      governing_evidence: 'Historical Reference EWO-014.3-HR',
    } as unknown as Partial<IntegrityAlert>);

    const domain = determinePrimaryDomain(alert);
    expect(isRecommendationValidForDomain('begin_historical_recovery', domain)).toBe(true);

    const pkg = makeEvidencePackage({});
    const decision = buildLineageCanonicalDecision(alert, pkg);
    expect(decision.canonical_value).toBe('Parent Recovery Required');
    expect(decision.reasoning).toContain('EWO-014.3');
  });

  // TEST 3: Parent exists but child parent_ref is null → Resolve Parent Linkage
  it('TEST 3 — RELATIONSHIP_FIELD_INCOMPLETE produces Resolve Parent Linkage', () => {
    const alert = makeAlert({
      alert_type: 'parent_child_issue',
      parent_child_classification: 'RELATIONSHIP_FIELD_INCOMPLETE',
    } as unknown as Partial<IntegrityAlert>);

    const domain = determinePrimaryDomain(alert);
    expect(isRecommendationValidForDomain('repair_relationship', domain)).toBe(true);

    const pkg = makeEvidencePackage({});
    const decision = buildLineageCanonicalDecision(alert, pkg);
    expect(decision.canonical_value).toBe('Parent Exists');
  });

  // TEST 4: Metadata-conflict alert → Synchronise Metadata remains valid
  it('TEST 4 — metadata_conflict alert allows Synchronise Metadata', () => {
    const alert = makeAlert({
      alert_type: 'metadata_conflict',
      normalised_reference: 'EWO-015',
    });

    const domain = determinePrimaryDomain(alert);
    expect(domain).toBe('metadata_conflict');
    expect(isRecommendationValidForDomain('synchronise_metadata', domain)).toBe(true);
  });

  // TEST 5: Duplicate-reference alert with metadata conflict → duplicate-domain recommendation primary
  it('TEST 5 — duplicate_reference alert with metadata conflict keeps duplicate-domain primary', () => {
    const alert = makeAlert({
      alert_type: 'duplicate_ewo',
      normalised_reference: 'EWO-016',
    });

    const domain = determinePrimaryDomain(alert);
    expect(domain).toBe('duplicate_reference');
    expect(isRecommendationValidForDomain('resolve_duplicate', domain)).toBe(true);
    // Metadata sync is NOT valid for duplicate_reference
    expect(isRecommendationValidForDomain('synchronise_metadata', domain)).toBe(false);
  });

  // TEST 6: Secondary child metadata issue creates finding without overriding primary
  it('TEST 6 — Secondary metadata finding is preserved without overriding primary lineage recommendation', () => {
    const alert = makeAlert({
      alert_type: 'parent_child_issue',
      parent_child_classification: 'PARENT_GENUINELY_MISSING',
    } as unknown as Partial<IntegrityAlert>);

    const pkg = makeEvidencePackage({
      conflicts: [makeConflict('title', 'Engineering Verification Standard (EVS) v1.0')],
    });

    const diagnostics = buildDomainDiagnostics(alert, pkg, 'accept_historical_root', []);
    expect(diagnostics.primary_integrity_domain).toBe('parent_child_lineage');
    expect(diagnostics.secondary_findings_count).toBe(1);
    expect(diagnostics.secondary_findings[0].domain).toBe('metadata_conflict');
    expect(diagnostics.secondary_findings[0].rejected).toBe(true);
    expect(diagnostics.domain_match).toBe(true);
  });

  // TEST 7: Evolved title matches primary domain
  it('TEST 7 — Domain labels are lineage-specific for parent_child_lineage', () => {
    const domain = determinePrimaryDomain(makeAlert({ alert_type: 'parent_child_issue' }));
    expect(DOMAIN_LABELS[domain]).toBe('Parent–Child Lineage');
    expect(DOMAIN_LABELS[domain]).not.toContain('Metadata');
  });

  // TEST 8: Domain diagnostics record correct domain and subject
  it('TEST 8 — Domain diagnostics record correct domain, subject, and relationship reference', () => {
    const alert = makeAlert({
      alert_type: 'parent_child_issue',
      normalised_reference: 'EWO-014.3.2B',
      evidence: { expected_parent: 'EWO-014.3' },
    });

    const pkg = makeEvidencePackage({});
    const diagnostics = buildDomainDiagnostics(alert, pkg, 'accept_historical_root', []);

    expect(diagnostics.primary_integrity_domain).toBe('parent_child_lineage');
    expect(diagnostics.primary_subject_reference).toBe('EWO-014.3.2B');
    expect(diagnostics.relationship_subject_reference).toBe('EWO-014.3');
    expect(diagnostics.recommendation_domain).toBe('parent_child_lineage');
    expect(diagnostics.domain_match).toBe(true);
  });

  // TEST 9: Cross-domain recommendation is rejected and recorded
  it('TEST 9 — Cross-domain metadata recommendation is rejected and recorded in diagnostics', () => {
    const alert = makeAlert({
      alert_type: 'parent_child_issue',
      parent_child_classification: 'PARENT_GENUINELY_MISSING',
    } as unknown as Partial<IntegrityAlert>);

    const pkg = makeEvidencePackage({
      conflicts: [makeConflict('title', 'EVS v1.0')],
    });

    // Simulate a cross-domain recommendation (synchronise_metadata) being rejected
    const rejectedFinding: SecondaryFinding = {
      domain: 'metadata_conflict',
      reference: 'EWO-014.3.2B',
      field: 'title',
      description: 'Cross-domain recommendation "Synchronise Metadata" rejected for parent_child_lineage alert',
      recommendation_type: 'synchronise_metadata',
      recommendation_label: 'Synchronise Metadata to Canonical Title',
      rejected: true,
      rejection_reason: 'Primary domain is parent_child_lineage; recommendation synchronise_metadata belongs to a different domain',
    };

    const diagnostics = buildDomainDiagnostics(alert, pkg, 'accept_historical_root', [rejectedFinding]);
    expect(diagnostics.rejected_cross_domain_recommendations.length).toBe(1);
    expect(diagnostics.rejected_cross_domain_recommendations[0].recommendation_type).toBe('synchronise_metadata');
    expect(diagnostics.domain_match).toBe(true);
  });

  // TEST 10: All domain types can be determined
  it('TEST 10 — All alert types map to correct domains', () => {
    expect(determinePrimaryDomain(makeAlert({ alert_type: 'parent_child_issue' }))).toBe('parent_child_lineage');
    expect(determinePrimaryDomain(makeAlert({ alert_type: 'missing_ewo' }))).toBe('missing_work_order');
    expect(determinePrimaryDomain(makeAlert({ alert_type: 'duplicate_ewo' }))).toBe('duplicate_reference');
    expect(determinePrimaryDomain(makeAlert({ alert_type: 'orphaned_artifact' }))).toBe('orphaned_artifact');
    expect(determinePrimaryDomain(makeAlert({ alert_type: 'metadata_conflict' }))).toBe('metadata_conflict');
    expect(determinePrimaryDomain(makeAlert({ alert_type: 'reconciliation_instability' }))).toBe('reconciliation_instability');
    expect(determinePrimaryDomain(makeAlert({ alert_type: 'historical_reference' }))).toBe('historical_reference');
  });
});
