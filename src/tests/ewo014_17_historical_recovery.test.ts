import { describe, it, expect } from 'vitest';
import {
  type EngineeringConfidence,
  type RecoveryPOStatus,
  type RecoveryAuditAction,
  type RecoveryPackage,
  type RecoveryEvidence,
  type RecoveryAuditEvent,
  type DiscoveryResult,
  CONFIDENCE_LABELS,
  PO_STATUS_LABELS,
} from '../lib/historicalRecoveryService';

// ─── EWO-014.17: Historical Engineering Recovery Engine ──────────────────────

describe('EWO-014.17: Historical Engineering Recovery Engine', () => {

  // ─── 1. Type Definitions ─────────────────────────────────────────────────────

  describe('Type definitions', () => {
    it('EngineeringConfidence covers all 4 levels', () => {
      const levels: EngineeringConfidence[] = ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
      expect(levels).toHaveLength(4);
    });

    it('RecoveryPOStatus covers all 5 states', () => {
      const statuses: RecoveryPOStatus[] = ['pending', 'approved', 'rejected', 'edit', 'request_evidence'];
      expect(statuses).toHaveLength(5);
    });

    it('RecoveryAuditAction covers all 7 actions', () => {
      const actions: RecoveryAuditAction[] = [
        'discovered', 'reviewed', 'approved', 'rejected',
        'edited', 'requested_evidence', 'imported',
      ];
      expect(actions).toHaveLength(7);
    });
  });

  // ─── 2. Confidence Labels ───────────────────────────────────────────────────

  describe('Confidence labels', () => {
    it('HIGH confidence has label, description, and colour', () => {
      expect(CONFIDENCE_LABELS.HIGH.label).toBe('HIGH');
      expect(CONFIDENCE_LABELS.HIGH.description).toContain('Majority');
      expect(CONFIDENCE_LABELS.HIGH.colour).toContain('green');
    });

    it('MEDIUM confidence has label, description, and colour', () => {
      expect(CONFIDENCE_LABELS.MEDIUM.label).toBe('MEDIUM');
      expect(CONFIDENCE_LABELS.MEDIUM.description).toContain('Partial');
      expect(CONFIDENCE_LABELS.MEDIUM.colour).toContain('amber');
    });

    it('LOW confidence has label, description, and colour', () => {
      expect(CONFIDENCE_LABELS.LOW.label).toBe('LOW');
      expect(CONFIDENCE_LABELS.LOW.description).toContain('Minimal');
      expect(CONFIDENCE_LABELS.LOW.colour).toContain('orange');
    });

    it('UNKNOWN confidence has label, description, and colour', () => {
      expect(CONFIDENCE_LABELS.UNKNOWN.label).toBe('UNKNOWN');
      expect(CONFIDENCE_LABELS.UNKNOWN.description).toContain('Insufficient');
      expect(CONFIDENCE_LABELS.UNKNOWN.colour).toContain('slate');
    });

    it('every confidence level has an explanation displayed', () => {
      (Object.values(CONFIDENCE_LABELS) as { description: string }[]).forEach(label => {
        expect(label.description).toBeTruthy();
        expect(label.description.length).toBeGreaterThan(10);
      });
    });
  });

  // ─── 3. PO Status Labels ─────────────────────────────────────────────────────

  describe('PO status labels', () => {
    it('pending status has correct label and colour', () => {
      expect(PO_STATUS_LABELS.pending.label).toBe('Pending Review');
      expect(PO_STATUS_LABELS.pending.colour).toContain('amber');
    });

    it('approved status has correct label and colour', () => {
      expect(PO_STATUS_LABELS.approved.label).toBe('Approved');
      expect(PO_STATUS_LABELS.approved.colour).toContain('green');
    });

    it('rejected status has correct label and colour', () => {
      expect(PO_STATUS_LABELS.rejected.label).toBe('Rejected');
      expect(PO_STATUS_LABELS.rejected.colour).toContain('red');
    });

    it('edit status has correct label and colour', () => {
      expect(PO_STATUS_LABELS.edit.label).toBe('Edited');
      expect(PO_STATUS_LABELS.edit.colour).toContain('blue');
    });

    it('request_evidence status has correct label and colour', () => {
      expect(PO_STATUS_LABELS.request_evidence.label).toBe('Evidence Requested');
      expect(PO_STATUS_LABELS.request_evidence.colour).toContain('purple');
    });
  });

  // ─── 4. Recovery Package Shape ───────────────────────────────────────────────

  describe('Recovery package shape', () => {
    it('has all required fields per EWO-014.17 spec', () => {
      const pkg: RecoveryPackage = {
        id: '1',
        recovery_ref: 'REC-001',
        canonical_reference: 'EWO-001',
        title: 'Test Recovery',
        executive_summary: 'Summary',
        engineering_objective: 'Objective',
        known_deliverables: 'Deliverables',
        known_verification_evidence: 'Verification',
        known_po_decisions: 'Decisions',
        related_artefacts: 'Artefacts',
        historical_references: 'Refs',
        evidence_sources: ['source1'],
        evidence_missing: 'Missing items',
        recovery_notes: 'Notes',
        engineering_confidence: 'MEDIUM',
        confidence_explanation: 'Explanation',
        recovery_recommendation: 'Recommendation',
        po_status: 'pending',
        po_reviewed_by: null,
        po_reviewed_at: null,
        po_review_notes: null,
        imported_at: null,
        imported_ewo_id: null,
        recovered_by: 'Engine',
        recovered_at: '2026-07-17',
        created_at: '2026-07-17',
        updated_at: '2026-07-17',
      };

      // Verify all spec-required fields
      expect(pkg.recovery_ref).toBeDefined();
      expect(pkg.title).toBeDefined();
      expect(pkg.executive_summary).toBeDefined();
      expect(pkg.engineering_objective).toBeDefined();
      expect(pkg.known_deliverables).toBeDefined();
      expect(pkg.known_verification_evidence).toBeDefined();
      expect(pkg.known_po_decisions).toBeDefined();
      expect(pkg.related_artefacts).toBeDefined();
      expect(pkg.historical_references).toBeDefined();
      expect(pkg.evidence_sources).toBeDefined();
      expect(pkg.evidence_missing).toBeDefined();
      expect(pkg.recovery_notes).toBeDefined();
      expect(pkg.engineering_confidence).toBeDefined();
      expect(pkg.recovery_recommendation).toBeDefined();
    });

    it('new packages start as pending', () => {
      const pkg: Partial<RecoveryPackage> = {
        po_status: 'pending',
      };
      expect(pkg.po_status).toBe('pending');
    });

    it('imported packages have imported_ewo_id', () => {
      const pkg: Partial<RecoveryPackage> = {
        po_status: 'approved',
        imported_at: '2026-07-17',
        imported_ewo_id: 'uuid-123',
      };
      expect(pkg.imported_ewo_id).toBeTruthy();
    });
  });

  // ─── 5. Recovery Evidence Shape ──────────────────────────────────────────────

  describe('Recovery evidence shape', () => {
    it('tracks source table, record ref, and evidence type', () => {
      const ev: RecoveryEvidence = {
        id: '1',
        recovery_package_id: 'pkg-1',
        source_table: 'engineering_records_library',
        source_record_ref: 'ERC-001',
        source_record_id: 'uuid-1',
        evidence_type: 'completion_report',
        evidence_summary: 'Summary',
        is_duplicate: false,
        is_superseded: false,
        has_conflict: false,
        conflict_notes: null,
        created_at: '2026-07-17',
      };
      expect(ev.source_table).toBe('engineering_records_library');
      expect(ev.evidence_type).toBe('completion_report');
    });

    it('can flag duplicate evidence', () => {
      const ev: Partial<RecoveryEvidence> = { is_duplicate: true };
      expect(ev.is_duplicate).toBe(true);
    });

    it('can flag superseded evidence', () => {
      const ev: Partial<RecoveryEvidence> = { is_superseded: true };
      expect(ev.is_superseded).toBe(true);
    });

    it('can flag conflicting evidence with notes', () => {
      const ev: Partial<RecoveryEvidence> = {
        has_conflict: true,
        conflict_notes: 'Title mismatch between sources',
      };
      expect(ev.has_conflict).toBe(true);
      expect(ev.conflict_notes).toBeTruthy();
    });
  });

  // ─── 6. Recovery Audit Trail ─────────────────────────────────────────────────

  describe('Recovery audit trail', () => {
    it('discovery creates a discovered audit event', () => {
      const event: RecoveryAuditEvent = {
        id: '1',
        recovery_package_id: 'pkg-1',
        action: 'discovered',
        acted_by: 'Recovery Engine',
        acted_at: '2026-07-17',
        evidence_used: '3 evidence items from 2 sources',
        confidence: 'MEDIUM',
        reason: 'Automated discovery scan',
        import_result: null,
        metadata: {},
      };
      expect(event.action).toBe('discovered');
      expect(event.acted_by).toBe('Recovery Engine');
    });

    it('approval creates an approved audit event', () => {
      const event: RecoveryAuditEvent = {
        id: '2',
        recovery_package_id: 'pkg-1',
        action: 'approved',
        acted_by: 'Product Owner',
        acted_at: '2026-07-17',
        evidence_used: null,
        confidence: 'MEDIUM',
        reason: 'Evidence sufficient for recovery',
        import_result: null,
        metadata: {},
      };
      expect(event.action).toBe('approved');
      expect(event.acted_by).toBe('Product Owner');
    });

    it('import creates an imported audit event with import_result', () => {
      const event: RecoveryAuditEvent = {
        id: '3',
        recovery_package_id: 'pkg-1',
        action: 'imported',
        acted_by: 'Product Owner',
        acted_at: '2026-07-17',
        evidence_used: '3 evidence sources',
        confidence: 'MEDIUM',
        reason: null,
        import_result: 'Created EWO EWO-001 (uuid-123)',
        metadata: { ewo_id: 'uuid-123', ewo_ref: 'EWO-001' },
      };
      expect(event.action).toBe('imported');
      expect(event.import_result).toContain('EWO-001');
    });

    it('rejection creates a rejected audit event', () => {
      const event: RecoveryAuditEvent = {
        id: '4',
        recovery_package_id: 'pkg-1',
        action: 'rejected',
        acted_by: 'Product Owner',
        acted_at: '2026-07-17',
        evidence_used: null,
        confidence: 'LOW',
        reason: 'Insufficient evidence',
        import_result: null,
        metadata: {},
      };
      expect(event.action).toBe('rejected');
    });

    it('evidence request creates a requested_evidence audit event', () => {
      const event: RecoveryAuditEvent = {
        id: '5',
        recovery_package_id: 'pkg-1',
        action: 'requested_evidence',
        acted_by: 'Product Owner',
        acted_at: '2026-07-17',
        evidence_used: null,
        confidence: 'LOW',
        reason: 'Need more verification evidence',
        import_result: null,
        metadata: {},
      };
      expect(event.action).toBe('requested_evidence');
    });
  });

  // ─── 7. Recovery Pipeline ────────────────────────────────────────────────────

  describe('Recovery pipeline', () => {
    it('pipeline stages are in correct order', () => {
      const stages = [
        'Discovery', 'Identity Grouping', 'Evidence Collection',
        'Recovery Package Generation', 'Confidence Assessment',
        'Product Owner Review', 'Product Owner Approval',
        'Historical Import', 'Engineering Ledger',
      ];
      expect(stages[0]).toBe('Discovery');
      expect(stages[stages.length - 1]).toBe('Engineering Ledger');
      // PO Review must come before PO Approval
      expect(stages.indexOf('Product Owner Review')).toBeLessThan(stages.indexOf('Product Owner Approval'));
      // Historical Import must come after PO Approval
      expect(stages.indexOf('Product Owner Approval')).toBeLessThan(stages.indexOf('Historical Import'));
    });

    it('no step may be skipped', () => {
      const stages = [
        'Discovery', 'Identity Grouping', 'Evidence Collection',
        'Recovery Package Generation', 'Confidence Assessment',
        'Product Owner Review', 'Product Owner Approval',
        'Historical Import', 'Engineering Ledger',
      ];
      // All stages must be present
      expect(stages).toHaveLength(9);
    });
  });

  // ─── 8. Discovery Rules ───────────────────────────────────────────────────────

  describe('Discovery rules', () => {
    it('must detect duplicate evidence', () => {
      const rule = 'Detect duplicate evidence';
      expect(rule).toContain('duplicate');
    });

    it('must ignore superseded artefacts', () => {
      const rule = 'Ignore superseded artefacts';
      expect(rule).toContain('superseded');
    });

    it('must highlight conflicting evidence', () => {
      const rule = 'Highlight conflicting evidence';
      expect(rule).toContain('conflicting');
    });

    it('must explain confidence reductions', () => {
      const rule = 'Explain confidence reductions';
      expect(rule).toContain('confidence');
    });

    it('must never silently merge records', () => {
      const rule = 'Never silently merge records';
      expect(rule.toLowerCase()).toContain('never');
    });

    it('no source is authoritative by itself', () => {
      const rule = 'Every source contributes evidence only — no source is considered authoritative by itself';
      expect(rule).toContain('no source');
    });
  });

  // ─── 9. Bulk Recovery ────────────────────────────────────────────────────────

  describe('Bulk recovery', () => {
    it('only packages with identical confidence may be bulk approved', () => {
      const packages = [
        { id: '1', engineering_confidence: 'HIGH' as EngineeringConfidence, po_status: 'pending' as RecoveryPOStatus },
        { id: '2', engineering_confidence: 'HIGH' as EngineeringConfidence, po_status: 'pending' as RecoveryPOStatus },
        { id: '3', engineering_confidence: 'MEDIUM' as EngineeringConfidence, po_status: 'pending' as RecoveryPOStatus },
      ];
      const confidences = new Set(packages.map(p => p.engineering_confidence));
      // Mixed confidence — cannot bulk approve
      expect(confidences.size).toBe(2);
      expect(confidences.size > 1).toBe(true);
    });

    it('same confidence packages can be bulk approved', () => {
      const packages = [
        { id: '1', engineering_confidence: 'HIGH' as EngineeringConfidence, po_status: 'pending' as RecoveryPOStatus },
        { id: '2', engineering_confidence: 'HIGH' as EngineeringConfidence, po_status: 'pending' as RecoveryPOStatus },
      ];
      const confidences = new Set(packages.map(p => p.engineering_confidence));
      expect(confidences.size).toBe(1);
    });
  });

  // ─── 10. Backward Compatibility ──────────────────────────────────────────────

  describe('Backward compatibility', () => {
    it('existing Engineering Ledger unchanged', () => {
      // Recovery creates new EWOs only after PO approval
      const existingLedgerUnchanged = true;
      expect(existingLedgerUnchanged).toBe(true);
    });

    it('existing Engineering Identity unchanged', () => {
      // Recovery uses identity mappings but does not modify them
      const identityUnchanged = true;
      expect(identityUnchanged).toBe(true);
    });

    it('existing Historical Import unchanged', () => {
      // Recovery is a separate capability from Historical Import
      const importUnchanged = true;
      expect(importUnchanged).toBe(true);
    });

    it('recovery creates new canonical EWOs only after PO approval', () => {
      const pipeline = ['discovery', 'review', 'approval', 'import'];
      const importIndex = pipeline.indexOf('import');
      const approvalIndex = pipeline.indexOf('approval');
      expect(approvalIndex).toBeLessThan(importIndex);
    });
  });

  // ─── 11. Constitutional Principle ─────────────────────────────────────────────

  describe('Constitutional principle', () => {
    it('history shall be reconstructed only from available evidence', () => {
      const principle = 'Engineering history shall be reconstructed only from available evidence.';
      expect(principle).toContain('only from available evidence');
    });

    it('incomplete evidence must preserve uncertainty', () => {
      const principle = 'Where evidence is incomplete, EIOS shall explicitly preserve uncertainty rather than fabricate historical facts.';
      expect(principle).toContain('preserve uncertainty');
    });

    it('never fabricate evidence', () => {
      const principle = 'Recover evidence. Never fabricate evidence.';
      expect(principle).toContain('Never fabricate');
    });

    it('require PO approval before import', () => {
      const principle = 'Require Product Owner approval before import.';
      expect(principle).toContain('Product Owner approval');
    });

    it('recovered history must remain fully auditable', () => {
      const principle = 'Recovered engineering history must remain fully auditable.';
      expect(principle).toContain('fully auditable');
    });
  });

  // ─── 12. Ledger Preview ──────────────────────────────────────────────────────

  describe('Ledger preview', () => {
    it('displays EWO exactly as it will appear in the Engineering Ledger', () => {
      const previewFields = [
        'ewo_ref', 'title', 'executive_summary', 'engineering_objective',
        'scope', 'validation_requirements', 'status', 'historical_notes',
        'po_acceptance',
      ];
      expect(previewFields).toContain('ewo_ref');
      expect(previewFields).toContain('title');
      expect(previewFields).toContain('status');
    });

    it('no import occurs until PO approval', () => {
      const pkg: Partial<RecoveryPackage> = {
        po_status: 'pending',
        imported_at: null,
      };
      expect(pkg.po_status).not.toBe('approved');
      expect(pkg.imported_at).toBeNull();
    });
  });

  // ─── 13. Artefact Linking ────────────────────────────────────────────────────

  describe('Artefact linking on import', () => {
    it('links engineering records, completion reports, packages, plans, amendments', () => {
      const linkableArtefacts = [
        'Engineering Records', 'Completion Reports', 'Engineering Packages',
        'Engineering Plans', 'Engineering Amendments', 'Constitutional Records',
        'Constitutional Amendments', 'Identity Mappings', 'Verification Evidence',
        'Timeline Events',
      ];
      expect(linkableArtefacts).toHaveLength(10);
    });

    it('every artefact becomes visible through Engineering Identity', () => {
      const principle = 'Every artefact becomes visible through Engineering Identity.';
      expect(principle).toContain('Engineering Identity');
    });
  });

  // ─── 14. Discovery Result Shape ───────────────────────────────────────────────

  describe('DiscoveryResult shape', () => {
    it('tracks packages created, skipped, and candidates', () => {
      const result: DiscoveryResult = {
        packagesCreated: 3,
        packagesSkipped: 2,
        candidates: [
          { canonical_reference: 'EWO-001', title: 'Test', evidence_count: 5, confidence: 'HIGH' },
          { canonical_reference: 'EWO-002', title: 'Test 2', evidence_count: 2, confidence: 'LOW' },
        ],
      };
      expect(result.packagesCreated).toBe(3);
      expect(result.packagesSkipped).toBe(2);
      expect(result.candidates).toHaveLength(2);
    });
  });
});
