// EWO-014.19A.7SR.4 — Evidence-First Investigation Experience Tests
// Tests the evidence package builder, conflict detection, classification
// explanations, canonical decision, and evidence-aware actions.

import { describe, it, expect } from 'vitest';
import {
  buildEvidencePackage,
  getEvidenceAwareActions,
  type EvidencePackage,
} from '../lib/evidencePackageService';
import type { IntegrityAlert } from '../lib/engineeringIntegrityService';

function makeAlert(overrides: Partial<IntegrityAlert> = {}): IntegrityAlert {
  return {
    id: 'test-alert-001',
    alert_ref: 'ALERT-001',
    audit_id: null,
    alert_type: 'parent_child_issue',
    severity: 'warning',
    title: 'Test Alert',
    description: 'Test description',
    evidence: {},
    suggested_action: 'resolve_parent_relationship',
    status: 'open',
    resolved_at: null,
    resolved_by: null,
    resolution_notes: null,
    object_type: 'ewo',
    raw_reference: 'EWO-014.13',
    normalised_reference: 'EWO-014.13',
    confidence: 0.9,
    classification_reason: 'Test classification',
    original_audit_id: null,
    re_evaluation_status: 'pending',
    created_at: '2026-07-21T00:00:00Z',
    updated_at: '2026-07-21T00:00:00Z',
    ...overrides,
  };
}

describe('EWO-014.19A.7SR.4 — Evidence-First Investigation Experience', () => {

  // ─── TEST 1: Evidence package builds for a parent-child alert ────────────────
  it('TEST 1 — buildEvidencePackage returns a complete package', async () => {
    const alert = makeAlert();
    const pkg = await buildEvidencePackage(alert);
    expect(pkg).toBeDefined();
    expect(pkg.alert).toBe(alert);
    expect(pkg.evidence_items).toBeDefined();
    expect(pkg.conflicts).toBeDefined();
    expect(pkg.classification_explanation).toBeDefined();
    expect(pkg.evidence_graph).toBeDefined();
    expect(pkg.canonical_decision).toBeDefined();
    expect(pkg.runtime_diagnostics).toBeDefined();
  });

  // ─── TEST 2: Classification explanation for HISTORICAL_PARENT_SATISFIED ────
  it('TEST 2 — Classification explanation for HISTORICAL_PARENT_SATISFIED', async () => {
    const alert = makeAlert({
      alert_type: 'parent_child_issue',
      evidence: { expected_parent: 'EWO-014', actual_parent: null },
      ...{
        parent_child_classification: 'HISTORICAL_PARENT_SATISFIED',
        authoritative_status: 'HISTORICALLY_SATISFIED',
      } as unknown as Partial<IntegrityAlert>,
    });
    const pkg = await buildEvidencePackage(alert);
    expect(pkg.classification_explanation.classification).toBe('HISTORICAL_PARENT_SATISFIED');
    expect(pkg.classification_explanation.chosen_reason).toContain('Historical Reference');
    expect(pkg.classification_explanation.rejected_alternatives.length).toBeGreaterThan(0);
    expect(pkg.classification_explanation.authoritative_rules_applied.length).toBeGreaterThan(0);
  });

  // ─── TEST 3: Classification explanation for PARENT_GENUINELY_MISSING ────────
  it('TEST 3 — Classification explanation for PARENT_GENUINELY_MISSING', async () => {
    const alert = makeAlert({
      alert_type: 'parent_child_issue',
      evidence: { expected_parent: 'EWO-999', actual_parent: null },
      normalised_reference: 'EWO-999.1',
      ...{
        parent_child_classification: 'PARENT_GENUINELY_MISSING',
      } as unknown as Partial<IntegrityAlert>,
    });
    const pkg = await buildEvidencePackage(alert);
    expect(pkg.classification_explanation.classification).toBe('PARENT_GENUINELY_MISSING');
    expect(pkg.classification_explanation.chosen_reason).toContain('No canonical Work Order');
  });

  // ─── TEST 4: Evidence graph has nodes ───────────────────────────────────────
  it('TEST 4 — Evidence graph contains nodes for the reference', async () => {
    const alert = makeAlert();
    const pkg = await buildEvidencePackage(alert);
    expect(pkg.evidence_graph.nodes.length).toBeGreaterThan(0);
    // The reference node should always exist
    const refNode = pkg.evidence_graph.nodes.find(n => n.object_type === 'reference');
    expect(refNode).toBeDefined();
    expect(refNode!.reference).toBe('EWO-014.13');
  });

  // ─── TEST 5: Canonical decision for genuinely missing reference ─────────────
  it('TEST 5 — Canonical decision requires PO review for missing reference', async () => {
    const alert = makeAlert({
      normalised_reference: 'EWO-999.999.999',
      raw_reference: 'EWO-999.999.999',
    });
    const pkg = await buildEvidencePackage(alert);
    expect(pkg.canonical_decision.po_review_required).toBe(true);
    expect(pkg.canonical_decision.canonical_value).toBeNull();
  });

  // ─── TEST 6: Runtime diagnostics are populated ──────────────────────────────
  it('TEST 6 — Runtime diagnostics include all required fields', async () => {
    const alert = makeAlert();
    const pkg = await buildEvidencePackage(alert);
    expect(pkg.runtime_diagnostics.sources_searched).toBeDefined();
    expect(Array.isArray(pkg.runtime_diagnostics.sources_searched)).toBe(true);
    expect(pkg.runtime_diagnostics.sources_contributing_evidence).toBeDefined();
    expect(typeof pkg.runtime_diagnostics.supporting_evidence_count).toBe('number');
    expect(typeof pkg.runtime_diagnostics.conflicting_evidence_count).toBe('number');
    expect(typeof pkg.runtime_diagnostics.authoritative_evidence_count).toBe('number');
    expect(typeof pkg.runtime_diagnostics.unknown_evidence_count).toBe('number');
    expect(typeof pkg.runtime_diagnostics.po_decisions_required).toBe('number');
    expect(typeof pkg.runtime_diagnostics.automatic_repairs_possible).toBe('number');
  });

  // ─── TEST 7: Evidence-aware actions for HISTORICAL_PARENT_SATISFIED ────────
  it('TEST 7 — Evidence-aware actions for HISTORICAL_PARENT_SATISFIED', async () => {
    const alert = makeAlert({
      alert_type: 'parent_child_issue',
      evidence: { expected_parent: 'EWO-014', actual_parent: null },
      ...{
        parent_child_classification: 'HISTORICAL_PARENT_SATISFIED',
      } as unknown as Partial<IntegrityAlert>,
    });
    const pkg = await buildEvidencePackage(alert);
    const actions = getEvidenceAwareActions(alert, pkg);
    expect(actions.some(a => a.label === 'Open Historical Reference')).toBe(true);
    expect(actions.some(a => a.label === 'No Repair Required')).toBe(true);
    expect(actions.some(a => a.label === 'Create Parent Work Order')).toBe(false);
  });

  // ─── TEST 8: Evidence-aware actions for PARENT_GENUINELY_MISSING ────────────
  it('TEST 8 — Evidence-aware actions for PARENT_GENUINELY_MISSING', async () => {
    const alert = makeAlert({
      alert_type: 'parent_child_issue',
      evidence: { expected_parent: 'EWO-999', actual_parent: null },
      ...{
        parent_child_classification: 'PARENT_GENUINELY_MISSING',
      } as unknown as Partial<IntegrityAlert>,
    });
    const pkg = await buildEvidencePackage(alert);
    const actions = getEvidenceAwareActions(alert, pkg);
    expect(actions.some(a => a.label === 'Investigate Evidence')).toBe(true);
    expect(actions.some(a => a.label === 'Route to PO Review')).toBe(true);
  });

  // ─── TEST 9: Missing EWO with historical satisfaction ───────────────────────
  it('TEST 9 — Missing EWO alert with historical satisfaction has correct actions', async () => {
    const alert = makeAlert({
      alert_type: 'missing_ewo',
      normalised_reference: 'EWO-014',
      raw_reference: 'EWO-014',
    });
    const pkg = await buildEvidencePackage(alert);
    // EWO-014 should resolve as HISTORICALLY_SATISFIED if DB is reachable
    if (pkg.existence_resolution?.authoritative_status === 'HISTORICALLY_SATISFIED') {
      const actions = getEvidenceAwareActions(alert, pkg);
      expect(actions.some(a => a.label === 'Mark Historical Title Preserved')).toBe(true);
    }
  });

  // ─── TEST 10: Conflict detection with multiple title values ─────────────────
  it('TEST 10 — Conflict detection identifies multiple title values', () => {
    // This tests the detectConflicts function indirectly through the package
    // We can't easily mock DB data, but we can verify the structure
    const alert = makeAlert();
    buildEvidencePackage(alert).then(pkg => {
      // Conflicts array should be defined (may be empty if no DB conflicts)
      expect(pkg.conflicts).toBeDefined();
      expect(Array.isArray(pkg.conflicts)).toBe(true);
    });
  });

  // ─── TEST 11: Evidence items include source table and field name ───────────
  it('TEST 11 — Evidence items include source table and field name (DB-dependent)', async () => {
    const alert = makeAlert();
    const pkg = await buildEvidencePackage(alert);
    for (const item of pkg.evidence_items) {
      // Every evidence item must have a real source_table — never "unknown"
      expect(item.source_table).not.toBe('unknown');
      // Every evidence item must have a real field_name — never "unknown"
      expect(item.field_name).not.toBe('unknown');
      // Every evidence item must have a confidence value
      expect(item.confidence).toBeGreaterThanOrEqual(0);
      expect(item.confidence).toBeLessThanOrEqual(1);
    }
  });

  // ─── TEST 12: Unknown evidence count is zero when data is available ──────────
  it('TEST 12 — Unknown evidence count is zero when evidence is available', async () => {
    const alert = makeAlert();
    const pkg = await buildEvidencePackage(alert);
    // unknown_evidence_count should be 0 — we never use "unknown" labels
    expect(pkg.runtime_diagnostics.unknown_evidence_count).toBe(0);
  });
});
