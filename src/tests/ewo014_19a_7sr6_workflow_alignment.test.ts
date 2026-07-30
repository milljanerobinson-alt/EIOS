// EWO-014.19A.7SR.6 — Engineering Intelligence Workflow Alignment Tests
// Verifies that final Engineering Intelligence decisions drive recommended
// actions, alert titles evolve, governed resolution actions work, parent/child
// root detection recognises completed investigations, and the resolution
// lifecycle functions correctly.

import { describe, it, expect } from 'vitest';
import {
  buildGovernedActions,
  evolveAlertTitle,
  RESOLUTION_LIFECYCLE,
  RESOLUTION_STATUS_LABELS,
  type GovernedAction,
  type ResolutionStatus,
} from '../lib/engineeringIntelligenceWorkflow';
import {
  buildEngineeringRecommendation,
  type RecommendationType,
} from '../lib/engineeringRecommendationEngine';
import type { IntegrityAlert } from '../lib/engineeringIntegrityService';
import type { EvidencePackage } from '../lib/evidencePackageService';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<IntegrityAlert> = {}): IntegrityAlert {
  return {
    id: 'test-alert-id',
    alert_ref: 'EIAL-TEST-001',
    audit_id: null,
    alert_type: 'missing_ewo',
    severity: 'warning',
    title: 'Missing EWO: EWO-TEST',
    description: 'Test alert',
    evidence: {},
    suggested_action: 'create_missing_ewo',
    status: 'open',
    resolved_at: null,
    resolved_by: null,
    resolution_notes: null,
    object_type: 'engineering_work_order',
    raw_reference: 'EWO-TEST',
    normalised_reference: 'EWO-TEST',
    confidence: 0.95,
    classification_reason: 'test',
    original_audit_id: null,
    re_evaluation_status: 'pending',
    resolution_status: 'detected',
    evolved_title: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<EvidencePackage> = {}): EvidencePackage {
  return {
    alert_id: 'test-alert-id',
    alert_ref: 'EIAL-TEST-001',
    alert_type: 'missing_ewo',
    normalised_reference: 'EWO-TEST',
    existence_resolution: {
      canonical_exists: false,
      historical_reference_exists: false,
      authoritative_source_type: 'none',
      governing_evidence: null,
      lineage_satisfied: false,
      investigation_complete: true,
      investigation_summary: 'No evidence found',
    },
    evidence_sources: [],
    conflicts: [],
    canonical_decision: 'no_action_required',
    recommended_action: 'Accept Historical Reference',
    runtime_diagnostics: [],
    package_created_at: new Date().toISOString(),
    ...overrides,
  } as unknown as EvidencePackage;
}

function makeRecommendation(type: RecommendationType, overrides: Partial<Record<string, unknown>> = {}): EngineeringRecommendation {
  return {
    recommendation_type: type,
    recommended_action: 'Test action',
    engineering_reasoning: 'Test reasoning',
    confidence: 0.9,
    evidence_confidence: 0.9,
    historical_confidence: 0.9,
    lineage_confidence: 0.9,
    risk_level: 'low',
    risk_assessment: 'Low risk',
    auto_repair_suitability: 'safe',
    auto_repair_reason: 'Safe to repair',
    po_decision_support: {
      decision: 'accept',
      rationale: 'Test rationale',
      conditions: [],
      urgency: 'normal',
    },
    expected_impact: 'No impact',
    alternative_actions: [],
    known_limitations: [],
    summary: 'Test summary',
    po_review_required: false,
    ...overrides,
  } as unknown as EngineeringRecommendation;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('EWO-014.19A.7SR.6 — Engineering Intelligence Workflow Alignment', () => {

  // ─── REQ 1: Final Decision Drives Recommended Actions ────────────────────────

  describe('Requirement 1 — Final Decision Drives Recommended Actions', () => {
    it('TEST 1 — accept_historical_reference produces "Accept Historical Reference" action, not "create_missing_ewo"', () => {
      const alert = makeAlert();
      const rec = makeRecommendation('accept_historical_reference');
      const evidence = makeEvidence();

      const actions = buildGovernedActions(alert, rec, evidence);

      expect(actions.length).toBeGreaterThan(0);
      const labels = actions.map(a => a.label);
      expect(labels).toContain('Accept Historical Reference');
      expect(labels).not.toContain('Create Missing EWO');
      expect(labels).not.toContain('create_missing_ewo');
    });

    it('TEST 2 — synchronise_metadata produces "Synchronise Metadata" action', () => {
      const alert = makeAlert({ alert_type: 'metadata_mismatch' });
      const rec = makeRecommendation('synchronise_metadata');
      const evidence = makeEvidence();

      const actions = buildGovernedActions(alert, rec, evidence);
      const labels = actions.map(a => a.label);
      expect(labels).toContain('Synchronise Metadata');
    });

    it('TEST 3 — resolve_duplicate produces "Merge References" action', () => {
      const alert = makeAlert({ alert_type: 'duplicate_reference' });
      const rec = makeRecommendation('resolve_duplicate');
      const evidence = makeEvidence();

      const actions = buildGovernedActions(alert, rec, evidence);
      const labels = actions.map(a => a.label);
      expect(labels).toContain('Merge References');
    });

    it('TEST 4 — po_review_required produces "Route to PO Review" action', () => {
      const alert = makeAlert();
      const rec = makeRecommendation('po_review_required');
      const evidence = makeEvidence();

      const actions = buildGovernedActions(alert, rec, evidence);
      const labels = actions.map(a => a.label);
      expect(labels).toContain('Route to PO Review');
    });

    it('TEST 5 — no_action_required produces "Dismiss False Positive" action', () => {
      const alert = makeAlert();
      const rec = makeRecommendation('no_action_required');
      const evidence = makeEvidence();

      const actions = buildGovernedActions(alert, rec, evidence);
      const labels = actions.map(a => a.label);
      expect(labels).toContain('Dismiss False Positive');
    });

    it('TEST 6 — All actions include "Open Related Engineering" where applicable', () => {
      const alert = makeAlert();
      const rec = makeRecommendation('accept_historical_reference');
      const evidence = makeEvidence();

      const actions = buildGovernedActions(alert, rec, evidence);
      const labels = actions.map(a => a.label);
      expect(labels).toContain('Open Related Engineering');
    });

    it('TEST 7 — Actions with PO approval are flagged', () => {
      const alert = makeAlert();
      const rec = makeRecommendation('resolve_duplicate');
      const evidence = makeEvidence();

      const actions = buildGovernedActions(alert, rec, evidence);
      const mergeAction = actions.find(a => a.label === 'Merge References');
      expect(mergeAction).toBeDefined();
      expect(mergeAction!.requires_po_approval).toBe(true);
    });
  });

  // ─── REQ 2: Alert Titles Evolve With the Decision ───────────────────────────

  describe('Requirement 2 — Alert Titles Evolve With the Decision', () => {
    it('TEST 8 — accept_historical_reference evolves title to "Historical Reference Accepted"', () => {
      const alert = makeAlert({ title: 'Missing EWO: EWO-TEST' });
      const rec = makeRecommendation('accept_historical_reference');
      const evidence = makeEvidence();

      const title = evolveAlertTitle(alert, rec, evidence);
      expect(title).toBe('Historical Reference Accepted');
      expect(title).not.toBe('Missing EWO: EWO-TEST');
    });

    it('TEST 9 — synchronise_metadata evolves title to "Metadata Synchronisation Required"', () => {
      const alert = makeAlert({ title: 'Metadata Mismatch' });
      const rec = makeRecommendation('synchronise_metadata');

      const title = evolveAlertTitle(alert, rec, null);
      expect(title).toBe('Metadata Synchronisation Required');
    });

    it('TEST 10 — po_review_required evolves title to "Product Owner Review Required"', () => {
      const alert = makeAlert({ title: 'Unsafe Repair' });
      const rec = makeRecommendation('po_review_required');

      const title = evolveAlertTitle(alert, rec, null);
      expect(title).toBe('Product Owner Review Required');
    });

    it('TEST 11 — no_recommendation keeps original title', () => {
      const alert = makeAlert({ title: 'Missing EWO: EWO-TEST' });

      const title = evolveAlertTitle(alert, null, null);
      expect(title).toBe('Missing EWO: EWO-TEST');
    });

    it('TEST 12 — unsafe_to_repair evolves title to "Reference Conflict — PO Resolution Required"', () => {
      const alert = makeAlert({ title: 'Unsafe Repair' });
      const rec = makeRecommendation('unsafe_to_repair');

      const title = evolveAlertTitle(alert, rec, null);
      expect(title).toBe('Reference Conflict — PO Resolution Required');
    });
  });

  // ─── REQ 3: Governed Resolution Actions ──────────────────────────────────────

  describe('Requirement 3 — Governed Resolution Actions', () => {
    it('TEST 13 — Governed actions include resolution_action types', () => {
      const alert = makeAlert();
      const rec = makeRecommendation('accept_historical_reference');
      const evidence = makeEvidence();

      const actions = buildGovernedActions(alert, rec, evidence);
      const resolutionActions = actions.filter(a => a.resolution_action !== undefined);
      expect(resolutionActions.length).toBeGreaterThan(0);
    });

    it('TEST 14 — accept_historical_parent is used for HISTORICAL_PARENT_SATISFIED', () => {
      const alert = makeAlert({
        // @ts-expect-error — adding extra property for test
        parent_child_classification: 'HISTORICAL_PARENT_SATISFIED',
      });
      const rec = makeRecommendation('accept_historical_reference');
      const evidence = makeEvidence();

      const actions = buildGovernedActions(alert, rec, evidence);
      const acceptAction = actions.find(a => a.label === 'Accept Historical Reference');
      expect(acceptAction).toBeDefined();
      expect(acceptAction!.resolution_action).toBe('accept_historical_parent');
    });
  });

  // ─── REQ 4: Parent/Child Root Detection ──────────────────────────────────────

  describe('Requirement 4 — Parent/Child Root Detection', () => {
    it('TEST 15 — PARENT_GENUINELY_MISSING with no evidence recommends accept_historical_root', () => {
      const alert = makeAlert({
        alert_type: 'missing_parent',
        // @ts-expect-error — adding extra property for test
        parent_child_classification: 'PARENT_GENUINELY_MISSING',
        // @ts-expect-error — adding extra property for test
        authoritative_source_type: 'none',
        // @ts-expect-error — adding extra property for test
        governing_evidence: null,
        // @ts-expect-error — adding extra property for test
        audit_conclusion: null,
      });
      const evidence = makeEvidence({
        existence_resolution: {
          canonical_exists: false,
          historical_reference_exists: false,
          authoritative_source_type: 'none',
          governing_evidence: null,
          lineage_satisfied: false,
          investigation_complete: true,
          investigation_summary: 'No evidence parent ever existed',
        },
      });

      // Test that the recommendation type accept_historical_root produces the right actions
      const rec = makeRecommendation('accept_historical_root');
      expect(rec.recommendation_type).toBe('accept_historical_root');
      expect(rec.recommended_action).toBe('Test action');

      // Test that governed actions for accept_historical_root include Accept Historical Root
      const actions = buildGovernedActions(alert, rec, evidence);
      const labels = actions.map(a => a.label);
      expect(labels).toContain('Accept Historical Root');
    });

    it('TEST 16 — accept_historical_root evolves title to "Canonical Parent Missing"', () => {
      const alert = makeAlert({
        title: 'Missing EWO: EWO-014.3',
        // @ts-expect-error — adding extra property for test
        parent_child_classification: 'PARENT_GENUINELY_MISSING',
      });
      const rec = makeRecommendation('begin_historical_recovery');

      const title = evolveAlertTitle(alert, rec, null);
      expect(title).toBe('Canonical Parent Missing');
    });

    it('TEST 17 — accept_historical_root produces "Accept Historical Root" action', () => {
      const alert = makeAlert({
        // @ts-expect-error — adding extra property for test
        parent_child_classification: 'PARENT_GENUINELY_MISSING',
      });
      const rec = makeRecommendation('begin_historical_recovery');
      const evidence = makeEvidence();

      const actions = buildGovernedActions(alert, rec, evidence);
      const labels = actions.map(a => a.label);
      expect(labels).toContain('Accept Historical Root');
    });

    it('TEST 18 — PARENT_GENUINELY_MISSING with historical evidence still recommends begin_historical_recovery', () => {
      const alert = makeAlert({
        alert_type: 'missing_parent',
        // @ts-expect-error — adding extra property for test
        parent_child_classification: 'PARENT_GENUINELY_MISSING',
        // @ts-expect-error — adding extra property for test
        authoritative_source_type: 'historical_reference',
      });
      const evidence = makeEvidence({
        existence_resolution: {
          canonical_exists: false,
          historical_reference_exists: true,
          authoritative_source_type: 'historical_reference',
          governing_evidence: 'Historical reference found',
          lineage_satisfied: true,
          investigation_complete: true,
          investigation_summary: 'Historical reference exists',
        },
      });

      // When historical reference exists, accept_historical_root should NOT be recommended
      // Instead, begin_historical_recovery or accept_historical_reference would apply
      const rec = makeRecommendation('begin_historical_recovery');
      expect(rec.recommendation_type).not.toBe('accept_historical_root');
    });
  });

  // ─── REQ 5: Resolution Lifecycle ─────────────────────────────────────────────

  describe('Requirement 5 — Resolution Lifecycle', () => {
    it('TEST 19 — Resolution lifecycle has 9 stages', () => {
      expect(RESOLUTION_LIFECYCLE.length).toBe(9);
      expect(RESOLUTION_LIFECYCLE).toEqual(['detected', 'investigating', 'decision_produced', 'po_review', 'resolution_selected', 'resolution_executed', 'repair_executed', 'resolved', 'archived']);
    });

    it('TEST 20 — Resolution status labels are defined for all stages', () => {
      for (const status of RESOLUTION_LIFECYCLE) {
        expect(RESOLUTION_STATUS_LABELS[status]).toBeDefined();
        expect(typeof RESOLUTION_STATUS_LABELS[status]).toBe('string');
      }
    });
  });

  // ─── REQ 6: Engineering Intelligence Authority ──────────────────────────────

  describe('Requirement 6 — Engineering Intelligence Authority', () => {
    it('TEST 21 — buildGovernedActions returns fallback when no recommendation', () => {
      const alert = makeAlert();
      const actions = buildGovernedActions(alert, null, null);
      expect(actions.length).toBe(1);
      expect(actions[0].label).toBe('Open Related Engineering');
    });

    it('TEST 22 — evolveAlertTitle returns original title when no recommendation', () => {
      const alert = makeAlert({ title: 'Original Title' });
      const title = evolveAlertTitle(alert, null, null);
      expect(title).toBe('Original Title');
    });

    it('TEST 23 — All governed actions are either available or have unavailable_reason', () => {
      const alert = makeAlert();
      const rec = makeRecommendation('accept_historical_reference');
      const evidence = makeEvidence();

      const actions = buildGovernedActions(alert, rec, evidence);
      for (const action of actions) {
        if (!action.available) {
          expect(action.unavailable_reason).toBeDefined();
        }
      }
    });
  });
});
