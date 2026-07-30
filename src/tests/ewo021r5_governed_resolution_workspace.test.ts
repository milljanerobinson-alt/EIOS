import { describe, it, expect } from 'vitest';
import {
  generateDynamicActions,
  buildInvestigationOutcome,
  getNavigationDestination,
  canTransitionTo,
  getNextLifecycleState,
  EXTENDED_RESOLUTION_LIFECYCLE,
} from '../lib/integrityResolutionEngine';
import type { EngineeringRecommendation } from '../lib/engineeringRecommendationEngine';
import type { IntegrityAlert } from '../lib/engineeringIntelligenceService';

function makeAlert(overrides: Partial<IntegrityAlert> = {}): IntegrityAlert {
  return {
    id: 'alert-1',
    alert_ref: 'EIA-001',
    title: 'Missing Work Order',
    description: 'Reference not found',
    severity: 'warning',
    object_type: 'engineering_work_order',
    alert_type: 'missing_ewo',
    normalised_reference: 'EWO-014.7E',
    confidence: 0.95,
    created_at: new Date().toISOString(),
    ...overrides,
  } as unknown as IntegrityAlert;
}

function makeRecommendation(overrides: Partial<EngineeringRecommendation> = {}): EngineeringRecommendation {
  return {
    recommendation_ref: 'REC-1',
    alert_id: 'alert-1',
    ewo_ref: 'EWO-014.7E',
    recommendation_type: 'unverified_reference_recovery_candidate',
    recommended_action: 'Unverified Reference Recovery Candidate',
    engineering_reasoning: 'No evidence',
    summary: 'Reference detected. No evidence.',
    evidence_confidence: 0,
    recommendation_confidence: 0.1,
    repair_confidence: 0.3,
    risk_level: 'low',
    risk_reason: 'No action recommended',
    auto_repair_suitability: 'not_suitable',
    auto_repair_reason: 'No evidence',
    po_review_required: true,
    expected_impact: 'No objects created',
    alternative_actions: [],
    known_limitations: [],
    evidence_used: [],
    po_decision_options: [],
    primary_integrity_domain: 'missing_work_order',
    secondary_findings: [],
    rejected_cross_domain_recommendations: [],
    domain_match: true,
    reference_classification_confidence: 0.95,
    decision_confidence: 0.1,
    recovery_justification: 'blocked_pending_evidence',
    recovery_justification_reason: 'No evidence',
    investigation_stage: 'reference_detected',
    ...overrides,
  } as unknown as EngineeringRecommendation;
}

describe('EWO-021R.5 — Governed Integrity Resolution Workspace', () => {

  // ─── REQ-1: Governed Resolution Workspace ────────────────────────────────────

  describe('REQ-1 — Governed Resolution Workspace', () => {
    it('generates dynamic actions for unverified reference recovery candidate', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some(a => a.label === 'Search Additional Evidence')).toBe(true);
      expect(actions.some(a => a.label === 'Accept Permanent Gap')).toBe(true);
      expect(actions.some(a => a.label === 'Record Historical Reference')).toBe(true);
      expect(actions.some(a => a.label === 'Mark Invalid / Obsolete')).toBe(true);
      expect(actions.some(a => a.label === 'Defer and Monitor')).toBe(true);
    });

    it('does not generate actions for resolved alerts (read-only)', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'resolved',
      });
      expect(actions).toEqual([]);
    });
  });

  // ─── REQ-2: Decision-Driven Navigation ──────────────────────────────────────

  describe('REQ-2 — Decision-Driven Navigation', () => {
    it('routes unverified_reference_recovery_candidate to resolution workspace', () => {
      const dest = getNavigationDestination('unverified_reference_recovery_candidate', 'blocked_pending_evidence', false);
      expect(dest).toBe('integrity_resolution_workspace');
    });

    it('routes begin_historical_recovery with justified to recovery workflow', () => {
      const dest = getNavigationDestination('begin_historical_recovery', 'justified', false);
      expect(dest).toBe('recovery_workflow');
    });

    it('routes begin_historical_recovery with blocked to resolution workspace', () => {
      const dest = getNavigationDestination('begin_historical_recovery', 'blocked_pending_evidence', false);
      expect(dest).toBe('integrity_resolution_workspace');
    });

    it('routes accept_historical_reference to historical reference workflow', () => {
      const dest = getNavigationDestination('accept_historical_reference', 'not_justified', true);
      expect(dest).toBe('historical_reference_workflow');
    });

    it('routes engineering_investigation_required to evidence investigation', () => {
      const dest = getNavigationDestination('engineering_investigation_required', 'blocked_pending_evidence', false);
      expect(dest).toBe('evidence_investigation');
    });

    it('routes no_action_required with existing object to open engineering', () => {
      const dest = getNavigationDestination('no_action_required', 'not_justified', true);
      expect(dest).toBe('open_engineering_object');
    });

    it('routes no_action_required without object to resolution workspace', () => {
      const dest = getNavigationDestination('no_action_required', 'not_justified', false);
      expect(dest).toBe('integrity_resolution_workspace');
    });
  });

  // ─── REQ-3: Product Owner Decision Panel ─────────────────────────────────────

  describe('REQ-3 — Product Owner Decision Panel', () => {
    it('shows investigation outcome with 4 steps', () => {
      const rec = makeRecommendation();
      const steps = buildInvestigationOutcome(rec);
      expect(steps.length).toBe(4);
      expect(steps[0].label).toBe('Reference detected');
      expect(steps[0].completed).toBe(true);
      expect(steps[1].label).toBe('Investigation completed');
      expect(steps[1].completed).toBe(true);
      expect(steps[2].label).toBe('Authoritative evidence found');
      expect(steps[2].completed).toBe(false);
      expect(steps[3].label).toBe('Recovery justified');
      expect(steps[3].completed).toBe(false);
    });

    it('shows evidence found when evidence confidence > 0.3', () => {
      const rec = makeRecommendation({ evidence_confidence: 0.8, recovery_justification: 'blocked_pending_po_decision' });
      const steps = buildInvestigationOutcome(rec);
      expect(steps[2].completed).toBe(true);
    });

    it('shows recovery justified when recovery_justification is justified', () => {
      const rec = makeRecommendation({ recovery_justification: 'justified', evidence_confidence: 0.8 });
      const steps = buildInvestigationOutcome(rec);
      expect(steps[3].completed).toBe(true);
    });
  });

  // ─── REQ-4: Decision Execution ───────────────────────────────────────────────

  describe('REQ-4 — Decision Execution', () => {
    it('search_additional_evidence does not close alert', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const searchAction = actions.find(a => a.action_type === 'search_additional_evidence');
      expect(searchAction).toBeDefined();
      expect(searchAction!.closes_alert).toBe(false);
      expect(searchAction!.creates_engineering_object).toBe(false);
    });

    it('accept_permanent_gap closes alert without creating objects', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const gapAction = actions.find(a => a.action_type === 'accept_permanent_gap');
      expect(gapAction).toBeDefined();
      expect(gapAction!.closes_alert).toBe(true);
      expect(gapAction!.creates_engineering_object).toBe(false);
    });

    it('record_historical_reference closes alert without creating canonical work order', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const histAction = actions.find(a => a.action_type === 'record_historical_reference');
      expect(histAction).toBeDefined();
      expect(histAction!.closes_alert).toBe(true);
      expect(histAction!.creates_engineering_object).toBe(false);
    });

    it('mark_invalid_obsolete closes alert without creating objects', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const invalidAction = actions.find(a => a.action_type === 'mark_invalid_obsolete');
      expect(invalidAction).toBeDefined();
      expect(invalidAction!.closes_alert).toBe(true);
      expect(invalidAction!.creates_engineering_object).toBe(false);
    });

    it('defer_and_monitor does not close alert', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const deferAction = actions.find(a => a.action_type === 'defer_and_monitor');
      expect(deferAction).toBeDefined();
      expect(deferAction!.closes_alert).toBe(false);
    });
  });

  // ─── REQ-5: Dynamic Next Actions ──────────────────────────────────────────────

  describe('REQ-5 — Dynamic Recommended Actions', () => {
    it('Create Canonical Work Order is unavailable when recovery is blocked', () => {
      const alert = makeAlert();
      const rec = makeRecommendation({ recovery_justification: 'blocked_pending_evidence' });
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const createAction = actions.find(a => a.action_type === 'create_canonical_work_order');
      expect(createAction).toBeDefined();
      expect(createAction!.available).toBe(false);
      expect(createAction!.unavailable_reason).toContain('not justified');
    });

    it('Create Canonical Work Order is available when recovery is justified', () => {
      const alert = makeAlert();
      const rec = makeRecommendation({
        recovery_justification: 'justified',
        recommendation_type: 'unverified_reference_recovery_candidate',
      });
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const createAction = actions.find(a => a.action_type === 'create_canonical_work_order');
      expect(createAction).toBeDefined();
      expect(createAction!.available).toBe(true);
    });

    it('Create Canonical Work Order creates engineering object', () => {
      const alert = makeAlert();
      const rec = makeRecommendation({ recovery_justification: 'justified' });
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const createAction = actions.find(a => a.action_type === 'create_canonical_work_order');
      expect(createAction!.creates_engineering_object).toBe(true);
      expect(createAction!.closes_alert).toBe(true);
    });

    it('actions are generated from decision type, not object type', () => {
      const alert = makeAlert({ alert_type: 'missing_ewo' });
      const rec = makeRecommendation({ recommendation_type: 'accept_historical_reference' });
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      // accept_historical_reference has a specific action, not the unverified candidate actions
      expect(actions.some(a => a.action_type === 'accept_historical_reference')).toBe(true);
      expect(actions.some(a => a.action_type === 'accept_permanent_gap')).toBe(false);
    });
  });

  // ─── REQ-7: Alert Closure ─────────────────────────────────────────────────────

  describe('REQ-7 — Alert Closure Without Object Creation', () => {
    it('accept_permanent_gap closes alert and does not create objects', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const gapAction = actions.find(a => a.action_type === 'accept_permanent_gap');
      expect(gapAction!.closes_alert).toBe(true);
      expect(gapAction!.creates_engineering_object).toBe(false);
    });

    it('record_historical_reference closes alert and does not create canonical work order', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const histAction = actions.find(a => a.action_type === 'record_historical_reference');
      expect(histAction!.closes_alert).toBe(true);
      expect(histAction!.creates_engineering_object).toBe(false);
    });

    it('mark_invalid_obsolete closes alert and does not create objects', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const invalidAction = actions.find(a => a.action_type === 'mark_invalid_obsolete');
      expect(invalidAction!.closes_alert).toBe(true);
      expect(invalidAction!.creates_engineering_object).toBe(false);
    });
  });

  // ─── REQ-8: Resolution Lifecycle ──────────────────────────────────────────────

  describe('REQ-8 — Resolution Lifecycle', () => {
    it('extended lifecycle includes all 8 stages', () => {
      expect(EXTENDED_RESOLUTION_LIFECYCLE).toEqual([
        'detected',
        'investigating',
        'decision_produced',
        'po_review',
        'resolution_selected',
        'resolution_executed',
        'resolved',
        'archived',
      ]);
    });

    it('canTransitionTo allows forward transitions', () => {
      expect(canTransitionTo('detected', 'investigating')).toBe(true);
      expect(canTransitionTo('investigating', 'decision_produced')).toBe(true);
      expect(canTransitionTo('decision_produced', 'po_review')).toBe(true);
      expect(canTransitionTo('po_review', 'resolution_selected')).toBe(true);
      expect(canTransitionTo('resolution_selected', 'resolution_executed')).toBe(true);
      expect(canTransitionTo('resolution_executed', 'resolved')).toBe(true);
      expect(canTransitionTo('resolved', 'archived')).toBe(true);
    });

    it('canTransitionTo rejects backward transitions', () => {
      expect(canTransitionTo('resolved', 'detected')).toBe(false);
      expect(canTransitionTo('po_review', 'detected')).toBe(false);
    });

    it('getNextLifecycleState returns investigating for search_additional_evidence', () => {
      expect(getNextLifecycleState('search_additional_evidence', false)).toBe('investigating');
    });

    it('getNextLifecycleState returns resolved for closing actions', () => {
      expect(getNextLifecycleState('accept_permanent_gap', true)).toBe('resolved');
      expect(getNextLifecycleState('mark_invalid_obsolete', true)).toBe('resolved');
    });

    it('getNextLifecycleState returns decision_produced for defer_and_monitor', () => {
      expect(getNextLifecycleState('defer_and_monitor', false)).toBe('decision_produced');
    });

    it('getNextLifecycleState returns po_review for non-closing actions', () => {
      expect(getNextLifecycleState('escalate_to_po', false)).toBe('po_review');
    });
  });

  // ─── REQ-9: Related Engineering ──────────────────────────────────────────────

  describe('REQ-9 — Related Engineering Navigation', () => {
    it('unverified reference recovery candidate navigates to resolution workspace, not create', () => {
      const dest = getNavigationDestination('unverified_reference_recovery_candidate', 'blocked_pending_evidence', false);
      expect(dest).toBe('integrity_resolution_workspace');
      expect(dest).not.toBe('recovery_workflow');
    });

    it('begin_historical_recovery with blocked evidence navigates to resolution workspace', () => {
      const dest = getNavigationDestination('begin_historical_recovery', 'blocked_pending_evidence', false);
      expect(dest).toBe('integrity_resolution_workspace');
    });

    it('no_action_required with existing object opens the object', () => {
      const dest = getNavigationDestination('no_action_required', 'not_justified', true);
      expect(dest).toBe('open_engineering_object');
    });
  });

  // ─── REQ-11: No Regression ───────────────────────────────────────────────────

  describe('REQ-11 — No Regression', () => {
    it('does not regress accept_historical_reference actions', () => {
      const alert = makeAlert();
      const rec = makeRecommendation({ recommendation_type: 'accept_historical_reference' });
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      expect(actions.some(a => a.action_type === 'accept_historical_reference')).toBe(true);
    });

    it('does not regress repair_relationship actions', () => {
      const alert = makeAlert({ alert_type: 'parent_child_issue' });
      const rec = makeRecommendation({ recommendation_type: 'repair_relationship' });
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      expect(actions.some(a => a.action_type === 'resolve_lineage')).toBe(true);
    });

    it('does not regress synchronise_metadata actions', () => {
      const alert = makeAlert({ alert_type: 'metadata_conflict' });
      const rec = makeRecommendation({ recommendation_type: 'synchronise_metadata' });
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      expect(actions.some(a => a.action_type === 'synchronise_metadata')).toBe(true);
    });

    it('preserves recovery justification model from BUG-006R.3', () => {
      const alert = makeAlert();
      const rec = makeRecommendation({
        recovery_justification: 'blocked_pending_evidence',
        reference_classification_confidence: 0.95,
        evidence_confidence: 0,
        decision_confidence: 0.1,
      });
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const createAction = actions.find(a => a.action_type === 'create_canonical_work_order');
      expect(createAction!.available).toBe(false);
    });
  });

  // ─── Product Owner Testing ─────────────────────────────────────────────────────

  describe('Product Owner Testing', () => {
    it('PO-TEST-1 — Open Related Engineering opens Resolution Workspace for unverified candidates', () => {
      const dest = getNavigationDestination('unverified_reference_recovery_candidate', 'blocked_pending_evidence', false);
      expect(dest).toBe('integrity_resolution_workspace');
    });

    it('PO-TEST-2 — All 5 PO actions are available for unverified candidates', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const labels = actions.map(a => a.label);
      expect(labels).toContain('Search Additional Evidence');
      expect(labels).toContain('Accept Permanent Gap');
      expect(labels).toContain('Record Historical Reference');
      expect(labels).toContain('Mark Invalid / Obsolete');
      expect(labels).toContain('Defer and Monitor');
    });

    it('PO-TEST-3 — Create Canonical Work Order is unavailable while recovery is blocked', () => {
      const alert = makeAlert();
      const rec = makeRecommendation({ recovery_justification: 'blocked_pending_evidence' });
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const createAction = actions.find(a => a.action_type === 'create_canonical_work_order');
      expect(createAction!.available).toBe(false);
      expect(createAction!.unavailable_reason).toContain('not justified');
    });

    it('PO-TEST-4 — Accept Permanent Gap closes alert without creating objects', () => {
      const alert = makeAlert();
      const rec = makeRecommendation();
      const actions = generateDynamicActions(alert, rec, null, {
        isProductOwner: true,
        currentLifecycleState: 'decision_produced',
      });
      const gapAction = actions.find(a => a.action_type === 'accept_permanent_gap');
      expect(gapAction!.closes_alert).toBe(true);
      expect(gapAction!.creates_engineering_object).toBe(false);
    });

    it('PO-TEST-5 — Lifecycle includes all 8 stages', () => {
      expect(EXTENDED_RESOLUTION_LIFECYCLE.length).toBe(8);
      expect(EXTENDED_RESOLUTION_LIFECYCLE[3]).toBe('po_review');
      expect(EXTENDED_RESOLUTION_LIFECYCLE[4]).toBe('resolution_selected');
      expect(EXTENDED_RESOLUTION_LIFECYCLE[5]).toBe('resolution_executed');
    });

    it('PO-TEST-6 — No navigation path bypasses PO governance', () => {
      // All non-justified recommendations route to resolution workspace
      const dest = getNavigationDestination('unverified_reference_recovery_candidate', 'blocked_pending_evidence', false);
      expect(dest).toBe('integrity_resolution_workspace');

      const dest2 = getNavigationDestination('begin_historical_recovery', 'blocked_pending_evidence', false);
      expect(dest2).toBe('integrity_resolution_workspace');

      const dest3 = getNavigationDestination('po_review_required', 'blocked_pending_evidence', false);
      expect(dest3).toBe('integrity_resolution_workspace');
    });
  });
});
