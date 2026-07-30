/**
 * EWO-014.19A.4 — Governed Approval Note Generator
 * Unit tests for context-aware default approval note generation.
 */

import { describe, it, expect } from 'vitest';
import {
  generateApprovalNote,
  generateMinimalApprovalNote,
  type ApprovalContextType,
} from '../lib/approvalNoteGenerator';

describe('EWO-014.19A.4 — Governed Approval Note Generator', () => {

  // ─── 1. Minimal Default (Graceful Behaviour) ─────────────────────────────────
  describe('1. Minimal Default (Graceful Behaviour)', () => {
    it('returns a governed minimal default when no context is available', () => {
      const result = generateApprovalNote({ type: 'historical_recovery' });
      expect(result.contextual).toBe(false);
      expect(result.note).toContain('Product Owner Acceptance granted.');
      expect(result.note).toContain('Recovery evidence reviewed.');
      expect(result.note).toContain('Approved for Engineering Ledger migration.');
      expect(result.factsUsed).toEqual([]);
    });

    it('returns a governed minimal default for each approval type', () => {
      const types: ApprovalContextType[] = [
        'historical_recovery',
        'engineering_plan',
        'engineering_review',
        'product_owner_acceptance',
        'constitutional_approval',
        'administrative_approval',
      ];
      for (const type of types) {
        const minimal = generateMinimalApprovalNote(type);
        expect(minimal).toBeTruthy();
        expect(minimal.length).toBeGreaterThan(20);
      }
    });

    it('uses Administrative header for administrative_approval', () => {
      const result = generateApprovalNote({ type: 'administrative_approval' });
      expect(result.note).toContain('Administrative approval granted.');
    });
  });

  // ─── 2. Context-Aware Generation ─────────────────────────────────────────────
  describe('2. Context-Aware Generation', () => {
    it('includes recovery package reference when provided', () => {
      const result = generateApprovalNote({
        type: 'historical_recovery',
        objectRef: 'REC-005',
        objectTitle: 'Engineering Record Model',
      });
      expect(result.contextual).toBe(true);
      expect(result.note).toContain('REC-005');
    });

    it('includes engineering confidence level when provided', () => {
      const result = generateApprovalNote({
        type: 'historical_recovery',
        engineeringConfidence: 'LOW',
      });
      expect(result.contextual).toBe(true);
      expect(result.note).toContain('Engineering confidence: LOW.');
    });

    it('includes evidence counts when both artefact and source counts are provided', () => {
      const result = generateApprovalNote({
        type: 'historical_recovery',
        evidenceArtefactCount: 4,
        evidenceSourceCount: 1,
      });
      expect(result.contextual).toBe(true);
      expect(result.note).toContain('Evidence reviewed from 4 artefacts across 1 source.');
    });

    it('uses singular form for 1 artefact and 1 source', () => {
      const result = generateApprovalNote({
        type: 'historical_recovery',
        evidenceArtefactCount: 1,
        evidenceSourceCount: 1,
      });
      expect(result.note).toContain('Evidence reviewed from 1 artefact across 1 source.');
    });

    it('uses plural form for multiple artefacts and sources', () => {
      const result = generateApprovalNote({
        type: 'historical_recovery',
        evidenceArtefactCount: 7,
        evidenceSourceCount: 3,
      });
      expect(result.note).toContain('Evidence reviewed from 7 artefacts across 3 sources.');
    });

    it('includes testing summary when testing was completed', () => {
      const result = generateApprovalNote({
        type: 'historical_recovery',
        testingCompleted: true,
        testingSummary: 'Product Owner testing completed: 3 of 3 checks passed.',
      });
      expect(result.contextual).toBe(true);
      expect(result.note).toContain('Product Owner testing completed: 3 of 3 checks passed.');
    });

    it('does not invent testing summary when testing was not completed', () => {
      const result = generateApprovalNote({
        type: 'historical_recovery',
        testingCompleted: false,
        testingSummary: 'Product Owner testing completed.',
      });
      expect(result.note).not.toContain('Product Owner testing completed.');
    });

    it('does not invent information that is unavailable', () => {
      const result = generateApprovalNote({
        type: 'historical_recovery',
        objectRef: 'REC-005',
      });
      expect(result.note).not.toContain('Engineering confidence');
      expect(result.note).not.toContain('Evidence reviewed from');
      expect(result.note).not.toContain('Product Owner testing');
    });
  });

  // ─── 3. Full Contextual Note Example ───────────────────────────────────────
  describe('3. Full Contextual Note Example', () => {
    it('matches the specification example format', () => {
      const result = generateApprovalNote({
        type: 'historical_recovery',
        objectRef: 'REC-005',
        objectTitle: 'Engineering Record Model — Schema Enrichment',
        engineeringConfidence: 'LOW',
        evidenceArtefactCount: 4,
        evidenceSourceCount: 1,
      });
      expect(result.note).toContain('Product Owner Acceptance granted.');
      expect(result.note).toContain('Recovery package reviewed: REC-005.');
      expect(result.note).toContain('Engineering confidence: LOW.');
      expect(result.note).toContain('Evidence reviewed from 4 artefacts across 1 source.');
      expect(result.note).toContain('Approved for Engineering Ledger migration.');
      expect(result.contextual).toBe(true);
      expect(result.factsUsed.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── 4. Reusable Infrastructure (Future Governance Pattern) ─────────────────
  describe('4. Reusable Infrastructure', () => {
    it('supports engineering_plan approval type', () => {
      const result = generateApprovalNote({
        type: 'engineering_plan',
        objectRef: 'EWO-015',
        objectTitle: 'Engineering Execution Pipeline v1',
      });
      expect(result.note).toContain('Product Owner Acceptance granted.');
      expect(result.note).toContain('Object reviewed: EWO-015.');
    });

    it('supports engineering_review approval type', () => {
      const result = generateApprovalNote({
        type: 'engineering_review',
        objectRef: 'ER-001',
      });
      expect(result.note).toContain('Product Owner Acceptance granted.');
    });

    it('supports product_owner_acceptance approval type', () => {
      const result = generateApprovalNote({
        type: 'product_owner_acceptance',
        objectRef: 'EWO-014.19A',
      });
      expect(result.note).toContain('Product Owner Acceptance granted.');
    });

    it('supports constitutional_approval approval type', () => {
      const result = generateApprovalNote({
        type: 'constitutional_approval',
        objectRef: 'AMD-006',
      });
      expect(result.note).toContain('Product Owner Acceptance granted.');
      expect(result.note).toContain('Constitutional amendment reviewed.');
    });

    it('supports administrative_approval approval type', () => {
      const result = generateApprovalNote({
        type: 'administrative_approval',
        objectRef: 'ADMIN-001',
      });
      expect(result.note).toContain('Administrative approval granted.');
    });

    it('uses additionalFacts for generic approval types', () => {
      const result = generateApprovalNote({
        type: 'engineering_plan',
        additionalFacts: ['Risk level: LOW.', 'Dependencies: none.'],
      });
      expect(result.note).toContain('Risk level: LOW.');
      expect(result.note).toContain('Dependencies: none.');
    });
  });

  // ─── 5. Audit Quality ───────────────────────────────────────────────────────
  describe('5. Audit Quality', () => {
    it('exposes factsUsed for audit trail preservation', () => {
      const result = generateApprovalNote({
        type: 'historical_recovery',
        objectRef: 'REC-005',
        engineeringConfidence: 'LOW',
      });
      expect(result.factsUsed).toContain('Recovery package reviewed: REC-005.');
      expect(result.factsUsed).toContain('Engineering confidence: LOW.');
    });

    it('contextual flag distinguishes generated vs minimal default', () => {
      const minimal = generateApprovalNote({ type: 'historical_recovery' });
      const contextual = generateApprovalNote({
        type: 'historical_recovery',
        objectRef: 'REC-005',
      });
      expect(minimal.contextual).toBe(false);
      expect(contextual.contextual).toBe(true);
    });
  });

  // ─── 6. No Blank Notes ───────────────────────────────────────────────────────
  describe('6. No Blank Notes', () => {
    it('never returns an empty string', () => {
      const types: ApprovalContextType[] = [
        'historical_recovery',
        'engineering_plan',
        'engineering_review',
        'product_owner_acceptance',
        'constitutional_approval',
        'administrative_approval',
      ];
      for (const type of types) {
        const result = generateApprovalNote({ type });
        expect(result.note.length).toBeGreaterThan(20);
        expect(result.note.trim()).toBe(result.note.replace(/^\n+|\n+$/g, ''));
      }
    });
  });
});
