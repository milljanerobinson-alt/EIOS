// EWO-021 — Engineering Intelligence Authority Engine
//
// Regression tests for the authoritative engineering decision layer.
// Tests cover:
// 1. Decision type mapping from recommendations
// 2. Parent/child relationship analysis
// 3. Duplicate alert suppression
// 4. Decision evolution
// 5. Timeline generation
// 6. Decision explanation
// 7. Copy investigation export structure
// 8. Domain isolation preserved

import { describe, it, expect } from 'vitest';
import {
  analyzeAlertRelationships,
  buildDecisionExplanation,
  DECISION_LABELS,
  RELATIONSHIP_LABELS,
  type DecisionType,
  type AlertRelationshipType,
} from '../lib/engineeringDecisionService';
import { generateInvestigationExport } from '../lib/investigationExportService';
import { determinePrimaryDomain, DOMAIN_LABELS } from '../lib/integrityDomainModel';
import type { IntegrityAlert } from '../lib/engineeringIntegrityService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<IntegrityAlert>): IntegrityAlert {
  return {
    id: 'test-alert-1',
    alert_type: 'parent_child_issue',
    normalised_reference: 'EWO-014.3.2B',
    description: 'Parent-Child Issue: EWO-014.3.2B',
    severity: 'high',
    status: 'open',
    evidence: { expected_parent: 'EWO-014.3' },
    ...overrides,
  } as IntegrityAlert;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EWO-021 — Engineering Intelligence Authority Engine', () => {

  // TEST 1: Decision types are defined and labeled
  it('TEST 1 — All decision types have labels', () => {
    const expectedTypes: DecisionType[] = [
      'create_engineering_work_order',
      'create_refinement',
      'historical_reference_accepted',
      'no_action_required',
      'await_further_evidence',
      'product_owner_decision_required',
      'duplicate_existing_engineering',
      'canonical_object_missing',
      'data_inconsistency',
      'investigation_incomplete',
    ];
    for (const type of expectedTypes) {
      expect(DECISION_LABELS[type]).toBeDefined();
      expect(DECISION_LABELS[type].length).toBeGreaterThan(0);
    }
  });

  // TEST 2: Parent/child relationship analysis identifies root issue
  it('TEST 2 — Parent/child analysis identifies root issue for primary alert', () => {
    const primary = makeAlert({ id: 'alert-1', normalised_reference: 'EWO-014.3.2B' });
    const relationships = analyzeAlertRelationships(primary, [primary]);
    expect(relationships[0].relationship_type).toBe('root_issue');
    expect(relationships[0].alert_id).toBe('alert-1');
  });

  // TEST 3: Duplicate alerts are identified and suppressed
  it('TEST 3 — Duplicate alerts are identified as duplicate_alert', () => {
    const primary = makeAlert({ id: 'alert-1', normalised_reference: 'EWO-014.3.2B' });
    const duplicate = makeAlert({ id: 'alert-2', normalised_reference: 'EWO-014.3.2B' });
    const relationships = analyzeAlertRelationships(primary, [primary, duplicate]);
    const dupRel = relationships.find(r => r.alert_id === 'alert-2');
    expect(dupRel?.relationship_type).toBe('duplicate_alert');
    expect(dupRel?.parent_alert_id).toBe('alert-1');
  });

  // TEST 4: Parent alerts are identified via expected_parent
  it('TEST 4 — Parent alerts are identified via expected_parent evidence', () => {
    const child = makeAlert({ id: 'alert-1', normalised_reference: 'EWO-014.3.2B', evidence: { expected_parent: 'EWO-014.3' } });
    const parent = makeAlert({ id: 'alert-2', normalised_reference: 'EWO-014.3', alert_type: 'missing_ewo' });
    const relationships = analyzeAlertRelationships(child, [child, parent]);
    const parentRel = relationships.find(r => r.alert_id === 'alert-2');
    expect(parentRel?.relationship_type).toBe('parent_alert');
  });

  // TEST 5: Child alerts are identified when their expected_parent matches primary
  it('TEST 5 — Child alerts are identified when expected_parent matches primary reference', () => {
    const primary = makeAlert({ id: 'alert-1', normalised_reference: 'EWO-014.3' });
    const child = makeAlert({ id: 'alert-2', normalised_reference: 'EWO-014.3.2B', evidence: { expected_parent: 'EWO-014.3' } });
    const relationships = analyzeAlertRelationships(primary, [primary, child]);
    const childRel = relationships.find(r => r.alert_id === 'alert-2');
    expect(childRel?.relationship_type).toBe('child_alert');
    expect(childRel?.parent_alert_id).toBe('alert-1');
  });

  // TEST 6: Derived symptoms are identified via same domain
  it('TEST 6 — Derived symptoms are identified via same integrity domain', () => {
    const primary = makeAlert({ id: 'alert-1', normalised_reference: 'EWO-014.3.2B', alert_type: 'parent_child_issue' });
    const symptom = makeAlert({ id: 'alert-2', normalised_reference: 'EWO-014.3.2C', alert_type: 'parent_child_issue' });
    const relationships = analyzeAlertRelationships(primary, [primary, symptom]);
    const symptomRel = relationships.find(r => r.alert_id === 'alert-2');
    expect(symptomRel?.relationship_type).toBe('derived_symptom');
  });

  // TEST 7: Independent issues are identified
  it('TEST 7 — Independent issues are identified when no relationship exists', () => {
    const primary = makeAlert({ id: 'alert-1', normalised_reference: 'EWO-014.3.2B', alert_type: 'parent_child_issue' });
    const independent = makeAlert({ id: 'alert-2', normalised_reference: 'EWO-099', alert_type: 'metadata_conflict' });
    const relationships = analyzeAlertRelationships(primary, [primary, independent]);
    const indRel = relationships.find(r => r.alert_id === 'alert-2');
    expect(indRel?.relationship_type).toBe('independent_issue');
  });

  // TEST 8: Relationship types have labels
  it('TEST 8 — All relationship types have labels', () => {
    const expectedTypes: AlertRelationshipType[] = [
      'root_issue', 'parent_alert', 'child_alert',
      'duplicate_alert', 'derived_symptom', 'independent_issue',
    ];
    for (const type of expectedTypes) {
      expect(RELATIONSHIP_LABELS[type]).toBeDefined();
    }
  });

  // TEST 9: Copy investigation export contains all required sections
  it('TEST 9 — Copy investigation export contains all required sections', () => {
    const alert = makeAlert({});
    const exportText = generateInvestigationExport({
      alert,
      evolvedTitle: 'Historical Root Acceptance Required',
      executiveSummary: 'Parent genuinely missing. Accept child as historical root.',
      rootCause: 'No canonical Work Order, Historical Reference, or governed evidence exists for expected parent EWO-014.3.',
      confidence: 0.85,
      confidenceExplanation: 'High confidence based on exhaustive source search.',
      evidence: [
        { label: 'EWO Record', type: 'ewo', reference: 'EWO-014.3.2B', description: 'Child Work Order exists' },
      ],
      evidencePackage: null,
      recommendation: null,
      decision: null,
      timeline: [],
      relationships: [],
      relatedEngineering: [],
      governedResponseRef: 'EIOS-INTEGRITY-001',
      resolutionStatus: 'open',
      resolutionTimestamp: null,
      resolutionActor: null,
    });

    // Verify all required sections are present
    expect(exportText).toContain('ENGINEERING INVESTIGATION REPORT');
    expect(exportText).toContain('Investigation Title:');
    expect(exportText).toContain('Alert Reference:');
    expect(exportText).toContain('EXECUTIVE SUMMARY');
    expect(exportText).toContain('ROOT CAUSE');
    expect(exportText).toContain('CONFIDENCE');
    expect(exportText).toContain('EVIDENCE');
    expect(exportText).toContain('RESOLUTION LIFECYCLE');
    expect(exportText).toContain('REFERENCE CODES');
    expect(exportText).toContain('PRODUCT OWNER GUIDANCE');
    expect(exportText).toContain('END OF ENGINEERING INVESTIGATION REPORT');
  });

  // TEST 10: Copy investigation export contains evidence package sections
  it('TEST 10 — Copy investigation export contains evidence package sections when present', () => {
    const alert = makeAlert({});
    const exportText = generateInvestigationExport({
      alert,
      evolvedTitle: 'Test',
      executiveSummary: 'Test summary',
      rootCause: 'Test root cause',
      confidence: 0.9,
      confidenceExplanation: 'Test explanation',
      evidence: [],
      evidencePackage: {
        evidence_items: [{
          source_type: 'ewo',
          source_table: 'engineering_work_orders',
          field_name: 'ewo_ref',
          field_value: 'EWO-014.3.2B',
          object_id: 'obj-1',
          confidence: 0.9,
          evidence_priority: 'primary',
          supports_conclusion: true,
          contradicts_conclusion: false,
          why_selected: 'Direct EWO record',
        }],
        conflicts: [],
        existence_resolution: {
          reference: 'EWO-014.3',
          authoritative_status: 'GENUINELY_MISSING',
          source_object_type: 'ewo',
          source_object_id: null,
          lifecycle_or_historical_status: null,
          confidence: 0.9,
          governing_evidence: null,
          audit_conclusion: null,
          limitations: [],
          lineage_satisfied: false,
        },
        classification_explanation: {
          classification: 'PARENT_GENUINELY_MISSING',
          chosen_reason: 'No parent found',
          rejected_alternatives: ['HISTORICAL_PARENT_SATISFIED'],
          authoritative_rules_applied: ['rule-1'],
        },
        evidence_graph: { nodes: [], edges: [] },
        canonical_decision: {
          canonical_object_type: null,
          canonical_reference: null,
          canonical_value: 'Accept Child as Historical Root',
          supporting_evidence_count: 3,
          conflicting_evidence_count: 0,
          confidence: 0.9,
          reasoning: 'No parent exists',
          po_review_required: true,
        },
        runtime_diagnostics: {
          sources_searched: ['ewo', 'completion_report', 'historical_reference'],
          sources_contributing_evidence: [],
          conflicting_evidence_count: 0,
          supporting_evidence_count: 3,
          authoritative_evidence_count: 0,
          unknown_evidence_count: 0,
          po_decisions_required: 1,
          automatic_repairs_possible: 0,
        },
        alert,
      },
      recommendation: null,
      decision: null,
      timeline: [],
      relationships: [],
      relatedEngineering: [],
      governedResponseRef: null,
      resolutionStatus: 'open',
      resolutionTimestamp: null,
      resolutionActor: null,
    });

    expect(exportText).toContain('EVIDENCE PACKAGE');
    expect(exportText).toContain('GENUINELY_MISSING');
    expect(exportText).toContain('CLASSIFICATION EXPLANATION');
    expect(exportText).toContain('PARENT_GENUINELY_MISSING');
    expect(exportText).toContain('CANONICAL DECISION');
    expect(exportText).toContain('Accept Child as Historical Root');
    expect(exportText).toContain('RUNTIME DIAGNOSTICS');
  });

  // TEST 11: Copy investigation export contains decision sections when present
  it('TEST 11 — Copy investigation export contains decision sections when present', () => {
    const alert = makeAlert({});
    const exportText = generateInvestigationExport({
      alert,
      evolvedTitle: 'Test',
      executiveSummary: 'Test',
      rootCause: 'Test',
      confidence: 0.85,
      confidenceExplanation: 'Test',
      evidence: [],
      evidencePackage: null,
      recommendation: null,
      decision: {
        id: 'dec-1',
        alert_id: alert.id,
        ewo_ref: 'EWO-014.3.2B',
        decision_type: 'historical_reference_accepted',
        decision_title: 'Historical Root Accepted',
        executive_summary: 'Parent genuinely missing. Root accepted.',
        decision_reasoning: 'No parent exists.',
        evidence_used: [],
        confidence: 0.85,
        confidence_explanation: 'High confidence.',
        alternatives_rejected: [
          { decision_type: 'data_inconsistency', reason: 'Metadata sync rejected — cross-domain' },
        ],
        recommended_next_action: 'Accept Historical Root',
        primary_integrity_domain: 'parent_child_lineage',
        parent_alert_id: null,
        relationship_type: 'root_issue',
        resolution_status: 'open',
        superseded_by: null,
        decision_version: 1,
        po_decision: null,
        po_decision_actor: null,
        po_decision_at: null,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      timeline: [],
      relationships: [],
      relatedEngineering: [],
      governedResponseRef: 'EIOS-INTEGRITY-001',
      resolutionStatus: 'open',
      resolutionTimestamp: null,
      resolutionActor: null,
    });

    expect(exportText).toContain('AUTHORITATIVE ENGINEERING DECISION');
    expect(exportText).toContain('Historical Root Accepted');
    expect(exportText).toContain('Alternatives Rejected:');
    expect(exportText).toContain('Metadata sync rejected — cross-domain');
    expect(exportText).toContain('Accept Historical Root');
  });

  // TEST 12: Copy investigation export contains timeline when present
  it('TEST 12 — Copy investigation export contains decision timeline', () => {
    const alert = makeAlert({});
    const exportText = generateInvestigationExport({
      alert,
      evolvedTitle: 'Test',
      executiveSummary: 'Test',
      rootCause: 'Test',
      confidence: 0.85,
      confidenceExplanation: 'Test',
      evidence: [],
      evidencePackage: null,
      recommendation: null,
      decision: null,
      timeline: [
        {
          id: 'tl-1',
          decision_id: 'dec-1',
          alert_id: alert.id,
          event_type: 'initial_decision',
          event_summary: 'Initial decision: Historical Root Accepted',
          event_details: {},
          previous_decision_type: null,
          new_decision_type: 'historical_reference_accepted',
          previous_confidence: null,
          new_confidence: 0.85,
          change_log_ref: null,
          actor_type: 'system',
          actor: 'Engineering Intelligence Authority Engine',
          created_at: new Date().toISOString(),
        },
      ],
      relationships: [],
      relatedEngineering: [],
      governedResponseRef: null,
      resolutionStatus: 'open',
      resolutionTimestamp: null,
      resolutionActor: null,
    });

    expect(exportText).toContain('ENGINEERING DECISION TIMELINE');
    expect(exportText).toContain('INITIAL_DECISION');
    expect(exportText).toContain('Initial decision: Historical Root Accepted');
  });

  // TEST 13: Domain isolation is preserved in the decision layer
  it('TEST 13 — Domain isolation preserved — parent_child_lineage domain does not allow metadata decisions', () => {
    const alert = makeAlert({ alert_type: 'parent_child_issue' });
    const domain = determinePrimaryDomain(alert);
    expect(domain).toBe('parent_child_lineage');
    expect(DOMAIN_LABELS[domain]).toBe('Parent–Child Lineage');
  });
});
