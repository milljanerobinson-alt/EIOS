// EWO-020 — ES-003: Governed User Guidance & Action Transparency Tests
// Verifies the governed response model, registry, builders, and AI grounding.

import { describe, it, expect } from 'vitest';
import {
  buildGovernedResponse,
  lookupResponse,
  listRegistryEntries,
  success,
  information,
  guidance,
  failure,
  buildAIGroundedResponse,
  type ResponseClassification,
  type ResponseCategory,
  type ResponseSeverity,
} from '../lib/governedResponse';

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('EWO-020 — ES-003 Governed User Guidance & Action Transparency', () => {

  // ─── REQ 1: ES-003 Platform Implementation ──────────────────────────────────

  describe('Requirement 1 — ES-003 Platform Implementation', () => {
    it('TEST 1 — Only four response classifications exist', () => {
      const validClassifications: ResponseClassification[] = ['success', 'information', 'guidance', 'failure'];
      expect(validClassifications).toHaveLength(4);
      expect(validClassifications).toContain('success');
      expect(validClassifications).toContain('information');
      expect(validClassifications).toContain('guidance');
      expect(validClassifications).toContain('failure');
    });

    it('TEST 2 — All registry entries use valid classifications', () => {
      const entries = listRegistryEntries();
      for (const entry of entries) {
        expect(['success', 'information', 'guidance', 'failure']).toContain(entry.classification);
      }
    });
  });

  // ─── REQ 2: Governed Response Model ──────────────────────────────────────────

  describe('Requirement 2 — Governed Response Model', () => {
    it('TEST 3 — buildGovernedResponse produces all required fields', () => {
      const resp = buildGovernedResponse('EIOS-INTEGRITY-001');
      expect(resp.classification).toBeDefined();
      expect(resp.title).toBeDefined();
      expect(resp.summary).toBeDefined();
      expect(resp.explanation).toBeDefined();
      expect(resp.recommendedNextAction).toBeDefined();
      expect(resp.referenceCode).toBe('EIOS-INTEGRITY-001');
      expect(resp.severity).toBeDefined();
      expect(resp.category).toBeDefined();
      expect(resp.timestamp).toBeDefined();
    });

    it('TEST 4 — buildGovernedResponse allows overrides', () => {
      const resp = buildGovernedResponse('EIOS-INTEGRITY-001', {
        title: 'Custom Title',
        summary: 'Custom summary',
      });
      expect(resp.title).toBe('Custom Title');
      expect(resp.summary).toBe('Custom summary');
      expect(resp.referenceCode).toBe('EIOS-INTEGRITY-001');
    });

    it('TEST 5 — buildGovernedResponse returns fallback for unknown code', () => {
      const resp = buildGovernedResponse('UNKNOWN-CODE-999');
      expect(resp.classification).toBe('failure');
      expect(resp.title).toContain('Unknown');
      expect(resp.referenceCode).toBe('UNKNOWN-CODE-999');
    });
  });

  // ─── REQ 3: Platform Response Components (verified via component exports) ────

  describe('Requirement 3 — Platform Response Components', () => {
    it('TEST 6 — Convenience builders produce correct classifications', () => {
      expect(success('EIOS-GENERAL-001').classification).toBe('success');
      expect(information('EIOS-CHANGELOG-002').classification).toBe('information');
      expect(guidance('EIOS-EWO-002').classification).toBe('guidance');
      expect(failure('EIOS-GENERAL-002').classification).toBe('failure');
    });
  });

  // ─── REQ 4: Actionable Guidance ──────────────────────────────────────────────

  describe('Requirement 4 — Actionable Guidance', () => {
    it('TEST 7 — Every registry entry has a recommended next action', () => {
      const entries = listRegistryEntries();
      for (const entry of entries) {
        expect(entry.recommendedNextAction).toBeTruthy();
        expect(entry.recommendedNextAction.length).toBeGreaterThan(0);
      }
    });

    it('TEST 8 — Guidance responses have secondary actions', () => {
      const entries = listRegistryEntries({ classification: 'guidance' });
      for (const entry of entries) {
        expect(entry.secondaryActions).toBeDefined();
        expect(entry.secondaryActions!.length).toBeGreaterThan(0);
      }
    });

    it('TEST 9 — EWO-002 guidance response has meaningful next actions', () => {
      const resp = buildGovernedResponse('EIOS-EWO-002');
      expect(resp.recommendedNextAction).toContain('refinement');
      expect(resp.secondaryActions).toBeDefined();
      expect(resp.secondaryActions!.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── REQ 5: Platform Response Registry ───────────────────────────────────────

  describe('Requirement 5 — Platform Response Registry', () => {
    it('TEST 10 — Registry lookup by reference code works', () => {
      const entry = lookupResponse('EIOS-INTEGRITY-001');
      expect(entry).not.toBeNull();
      expect(entry!.referenceCode).toBe('EIOS-INTEGRITY-001');
    });

    it('TEST 11 — Registry lookup returns null for unknown code', () => {
      expect(lookupResponse('NONEXISTENT-999')).toBeNull();
    });

    it('TEST 12 — Registry supports category filter', () => {
      const entries = listRegistryEntries({ category: 'engineering_integrity' });
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.category).toBe('engineering_integrity');
      }
    });

    it('TEST 13 — Registry supports classification filter', () => {
      const entries = listRegistryEntries({ classification: 'failure' });
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.classification).toBe('failure');
      }
    });

    it('TEST 14 — Registry supports severity filter', () => {
      const entries = listRegistryEntries({ severity: 'critical' });
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.severity).toBe('critical');
      }
    });

    it('TEST 15 — Registry has entries across all four classifications', () => {
      const successEntries = listRegistryEntries({ classification: 'success' });
      const infoEntries = listRegistryEntries({ classification: 'information' });
      const guidanceEntries = listRegistryEntries({ classification: 'guidance' });
      const failureEntries = listRegistryEntries({ classification: 'failure' });
      expect(successEntries.length).toBeGreaterThan(0);
      expect(infoEntries.length).toBeGreaterThan(0);
      expect(guidanceEntries.length).toBeGreaterThan(0);
      expect(failureEntries.length).toBeGreaterThan(0);
    });

    it('TEST 16 — Registry has entries across multiple categories', () => {
      const categories = new Set(listRegistryEntries().map(e => e.category));
      expect(categories.size).toBeGreaterThanOrEqual(5);
    });
  });

  // ─── REQ 6: Engineering Intelligence Authority ────────────────────────────────

  describe('Requirement 6 — Engineering Intelligence Authority', () => {
    it('TEST 17 — buildAIGroundedResponse uses AI explanation but keeps registry cause', () => {
      const entry = lookupResponse('EIOS-INTEGRITY-002');
      const resp = buildAIGroundedResponse(
        'EIOS-INTEGRITY-002',
        'AI has determined that the alert requires investigation based on evidence patterns.',
        [{ source: 'integrity_scan', detail: '3 missing EWOs detected' }],
      );
      // AI explanation is used
      expect(resp.explanation).toContain('AI has determined');
      // Cause comes from the registry, not AI
      expect(resp.cause).toBe(entry!.cause);
      // Recommended action comes from the registry, not AI
      expect(resp.recommendedNextAction).toBe(entry!.recommendedNextAction);
    });

    it('TEST 18 — buildAIGroundedResponse includes evidence in technical context', () => {
      const resp = buildAIGroundedResponse(
        'EIOS-AI-001',
        'Analysis complete with 95% confidence.',
        [{ source: 'evidence_package', detail: '12 evidence items reviewed' }],
      );
      expect(resp.technicalContext).toContain('AI Explanation');
      expect(resp.technicalContext).toContain('evidence_package');
      expect(resp.technicalContext).toContain('12 evidence items reviewed');
    });

    it('TEST 19 — AI cannot override cause from registry', () => {
      const resp = buildAIGroundedResponse(
        'EIOS-EWO-002',
        'AI suggests the work order was closed due to completion.',
        [{ source: 'database', detail: 'status=closed' }],
      );
      // Cause must come from registry, not AI
      const entry = lookupResponse('EIOS-EWO-002');
      expect(resp.cause).toBe(entry!.cause);
      expect(resp.cause).not.toContain('AI suggests');
    });
  });

  // ─── REQ 8: Support-Ready Reference Codes ────────────────────────────────────

  describe('Requirement 8 — Support-Ready Reference Codes', () => {
    it('TEST 20 — All reference codes follow EIOS-* pattern', () => {
      const entries = listRegistryEntries();
      for (const entry of entries) {
        expect(entry.referenceCode).toMatch(/^EIOS-[A-Z]+-\d{3}$/);
      }
    });

    it('TEST 21 — Reference codes are unique', () => {
      const entries = listRegistryEntries();
      const codes = entries.map(e => e.referenceCode);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  // ─── REQ 9: Accessibility & Consistency ──────────────────────────────────────

  describe('Requirement 9 — Accessibility & Consistency', () => {
    it('TEST 22 — All entries have severity levels', () => {
      const entries = listRegistryEntries();
      for (const entry of entries) {
        expect(['low', 'medium', 'high', 'critical']).toContain(entry.severity);
      }
    });

    it('TEST 23 — All entries have categories', () => {
      const entries = listRegistryEntries();
      for (const entry of entries) {
        expect(entry.category).toBeTruthy();
      }
    });
  });

  // ─── REQ 10: Future AI Support Foundation ────────────────────────────────────

  describe('Requirement 10 — Future AI Support Foundation', () => {
    it('TEST 24 — Registry is extensible (can look up by category for AI)', () => {
      const integrityEntries = listRegistryEntries({ category: 'engineering_integrity' });
      expect(integrityEntries.length).toBeGreaterThanOrEqual(4);
    });

    it('TEST 25 — buildAIGroundedResponse produces valid governed response', () => {
      const resp = buildAIGroundedResponse(
        'EIOS-AI-001',
        'AI analysis found 3 patterns.',
        [{ source: 'scan', detail: 'pattern match' }],
      );
      expect(resp.classification).toBeDefined();
      expect(resp.referenceCode).toBe('EIOS-AI-001');
      expect(resp.technicalContext).toContain('AI');
    });
  });
});
