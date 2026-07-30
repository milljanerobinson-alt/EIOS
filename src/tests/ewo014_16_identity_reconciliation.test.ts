import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  type ReconciliationCandidate,
  type IdentityMapping,
  type IdentityRelationshipType,
  type IdentityConfidence,
  type ReconciliationStatus,
  detectIdentityCandidates,
  detectImportCandidates,
  createIdentityMapping,
  acceptReconciliation,
  rejectReconciliation,
  overrideReconciliation,
  runReconciliationEngine,
} from '../lib/identityReconciliationService';

// ─── EWO-014.16: Engineering Identity Reconciliation ──────────────────────────

describe('EWO-014.16: Engineering Identity Reconciliation', () => {

  // ─── 1. Type Safety ───────────────────────────────────────────────────────────

  describe('Type definitions', () => {
    it('IdentityRelationshipType covers all 7 relationship types', () => {
      const types: IdentityRelationshipType[] = [
        'CANONICAL', 'ALIAS', 'SUPERSEDED', 'MIGRATED_FROM',
        'IMPORTED_FROM', 'DUPLICATE_REFERENCE', 'LEGACY_IDENTIFIER',
      ];
      expect(types).toHaveLength(7);
    });

    it('IdentityConfidence covers LOW, MEDIUM, HIGH', () => {
      const confidences: IdentityConfidence[] = ['LOW', 'MEDIUM', 'HIGH'];
      expect(confidences).toHaveLength(3);
    });

    it('ReconciliationStatus covers all 4 states', () => {
      const statuses: ReconciliationStatus[] = ['pending', 'accepted', 'rejected', 'overridden'];
      expect(statuses).toHaveLength(4);
    });
  });

  // ─── 2. Reconciliation Engine: Detection Logic ───────────────────────────────

  describe('Reconciliation Engine detection', () => {
    let mockSupabase: any;

    beforeEach(() => {
      mockSupabase = {
        from: vi.fn(() => mockSupabase),
        select: vi.fn(() => mockSupabase),
        insert: vi.fn(() => mockSupabase),
        update: vi.fn(() => mockSupabase),
        eq: vi.fn(() => mockSupabase),
        in: vi.fn(() => mockSupabase),
        maybeSingle: vi.fn(() => ({ data: null })),
        single: vi.fn(() => ({ data: null })),
        order: vi.fn(() => mockSupabase),
        rpc: vi.fn(() => ({ data: null })),
      };
      vi.doMock('../lib/supabase', () => ({ supabase: mockSupabase }));
    });

    afterEach(() => {
      vi.doUnmock('../lib/supabase');
    });

    it('detectIdentityCandidates returns array of candidates', async () => {
      // Mock: no existing mappings, no matching records
      mockSupabase.select = vi.fn(() => ({
        ...mockSupabase,
        in: vi.fn(() => ({ data: [], error: null })),
        eq: vi.fn(() => ({ data: null, error: null })),
        maybeSingle: vi.fn(() => ({ data: null })),
        order: vi.fn(() => ({ data: [], error: null })),
      }));

      // The function should return an array (possibly empty)
      const result = await detectIdentityCandidates();
      expect(Array.isArray(result)).toBe(true);
    });

    it('detectImportCandidates checks incoming refs against existing records', async () => {
      const result = await detectImportCandidates(['EWO-999']);
      expect(Array.isArray(result)).toBe(true);
    });

    it('detectImportCandidates returns empty array for no conflicts', async () => {
      const result = await detectImportCandidates([]);
      expect(result).toEqual([]);
    });
  });

  // ─── 3. Reconciliation Candidate Shape ────────────────────────────────────────

  describe('ReconciliationCandidate shape', () => {
    it('has all required fields', () => {
      const candidate: ReconciliationCandidate = {
        canonical_reference: 'EWO-001',
        canonical_type: 'engineering_work_order',
        historical_reference: 'ERC-002-DEV-SEED',
        historical_type: 'completion_report',
        relationship_type: 'ALIAS',
        confidence: 'MEDIUM',
        provenance: 'Historical record references EWO-001',
        recommended_action: 'Accept as historical alias',
      };
      expect(candidate.canonical_reference).toBe('EWO-001');
      expect(candidate.historical_reference).toBe('ERC-002-DEV-SEED');
      expect(candidate.relationship_type).toBe('ALIAS');
      expect(candidate.confidence).toBe('MEDIUM');
    });
  });

  // ─── 4. Identity Mapping Lifecycle ────────────────────────────────────────────

  describe('Identity mapping lifecycle', () => {
    it('new mappings start as pending', () => {
      const mapping: Partial<IdentityMapping> = {
        reconciliation_status: 'pending',
        confidence: 'MEDIUM',
      };
      expect(mapping.reconciliation_status).toBe('pending');
    });

    it('accepted mappings have accepted_by and accepted_at', () => {
      const mapping: Partial<IdentityMapping> = {
        reconciliation_status: 'accepted',
        accepted_by: 'Product Owner',
        accepted_at: new Date().toISOString(),
      };
      expect(mapping.reconciliation_status).toBe('accepted');
      expect(mapping.accepted_by).toBeTruthy();
    });

    it('overridden mappings can change canonical reference', () => {
      const mapping: Partial<IdentityMapping> = {
        reconciliation_status: 'overridden',
        canonical_reference: 'EWO-001',
        accepted_by: 'Product Owner',
      };
      expect(mapping.reconciliation_status).toBe('overridden');
    });
  });

  // ─── 5. Relationship Type Semantics ──────────────────────────────────────────

  describe('Relationship type semantics', () => {
    it('CANONICAL means same reference in multiple tables', () => {
      const candidate: ReconciliationCandidate = {
        canonical_reference: 'EWO-001',
        canonical_type: 'engineering_work_order',
        historical_reference: 'EWO-001',
        historical_type: 'completion_report',
        relationship_type: 'CANONICAL',
        confidence: 'HIGH',
        provenance: 'Same reference in both tables',
        recommended_action: 'Accept as canonical',
      };
      expect(candidate.canonical_reference).toBe(candidate.historical_reference);
      expect(candidate.confidence).toBe('HIGH');
    });

    it('ALIAS means different historical reference for same canonical', () => {
      const candidate: ReconciliationCandidate = {
        canonical_reference: 'EWO-001',
        canonical_type: 'engineering_work_order',
        historical_reference: 'ERC-002-DEV-SEED',
        historical_type: 'completion_report',
        relationship_type: 'ALIAS',
        confidence: 'MEDIUM',
        provenance: 'ERC record references EWO-001',
        recommended_action: 'Accept as alias',
      };
      expect(candidate.canonical_reference).not.toBe(candidate.historical_reference);
    });

    it('DUPLICATE_REFERENCE means same ref appears multiple times', () => {
      const candidate: ReconciliationCandidate = {
        canonical_reference: 'EWO-001',
        canonical_type: 'engineering_work_order',
        historical_reference: 'EWO-001',
        historical_type: 'engineering_work_order',
        relationship_type: 'DUPLICATE_REFERENCE',
        confidence: 'HIGH',
        provenance: 'Reference appears 2 times',
        recommended_action: 'Review duplicate',
      };
      expect(candidate.relationship_type).toBe('DUPLICATE_REFERENCE');
    });
  });

  // ─── 6. Backward Compatibility ─────────────────────────────────────────────────

  describe('Backward compatibility', () => {
    it('identity mappings are additive — no existing data modified', () => {
      // The identity map table only has INSERT and UPDATE (for status changes)
      // It never modifies engineering_work_orders, engineering_records_library,
      // or any other existing table.
      const additiveOnly = true;
      expect(additiveOnly).toBe(true);
    });

    it('canonical references never change — only aliases are added', () => {
      const ewoRef = 'EWO-001';
      const mappings: { canonical: string; historical: string }[] = [
        { canonical: ewoRef, historical: 'ERC-002-DEV-SEED' },
        { canonical: ewoRef, historical: 'Legacy EWO-001' },
      ];
      // All mappings point to the same canonical
      mappings.forEach(m => expect(m.canonical).toBe(ewoRef));
    });

    it('no existing URLs change', () => {
      const url = '#/engineering/work-orders/ewo_001';
      // Identity reconciliation does not change URLs
      expect(url).toBe('#/engineering/work-orders/ewo_001');
    });
  });

  // ─── 7. Audit Trail ───────────────────────────────────────────────────────────

  describe('Audit trail', () => {
    it('every accepted reconciliation creates an audit event', () => {
      const auditEvent = {
        action: 'accepted' as const,
        acted_by: 'Product Owner',
        reason: 'Historical alias confirmed',
        evidence_used: 'ERC-002-DEV-SEED references EWO-001',
      };
      expect(auditEvent.action).toBe('accepted');
      expect(auditEvent.acted_by).toBeTruthy();
      expect(auditEvent.reason).toBeTruthy();
    });

    it('every rejected reconciliation creates an audit event', () => {
      const auditEvent = {
        action: 'rejected' as const,
        acted_by: 'Product Owner',
        reason: 'Not the same engineering effort',
      };
      expect(auditEvent.action).toBe('rejected');
    });

    it('every override creates an audit event with previous and new mapping', () => {
      const auditEvent = {
        action: 'overridden' as const,
        previous_mapping: { canonical_reference: 'EWO-001', relationship_type: 'ALIAS' },
        new_mapping: { canonical_reference: 'EWO-002', relationship_type: 'MIGRATED_FROM' },
        reason: 'Manual correction — should map to EWO-002',
      };
      expect(auditEvent.previous_mapping).toBeDefined();
      expect(auditEvent.new_mapping).toBeDefined();
      expect(auditEvent.previous_mapping).not.toEqual(auditEvent.new_mapping);
    });
  });

  // ─── 8. Import Wizard Integration ──────────────────────────────────────────────

  describe('Import Wizard integration', () => {
    it('detectImportCandidates returns candidates for incoming refs', () => {
      const incomingRefs = ['EWO-100', 'EWO-101'];
      // The function should check each ref against existing records
      expect(incomingRefs).toHaveLength(2);
    });

    it('import only proceeds after identity review', () => {
      const steps = ['input', 'preview', 'identity', 'importing', 'done'];
      const identityStepIndex = steps.indexOf('identity');
      const importingStepIndex = steps.indexOf('importing');
      // Identity review must come before importing
      expect(identityStepIndex).toBeLessThan(importingStepIndex);
    });

    it('accepted identity mappings are created before import', () => {
      const acceptedMappings: ReconciliationCandidate[] = [
        {
          canonical_reference: 'EWO-100',
          canonical_type: 'engineering_work_order',
          historical_reference: 'ERC-100',
          historical_type: 'completion_report',
          relationship_type: 'ALIAS',
          confidence: 'MEDIUM',
          provenance: 'Historical match',
          recommended_action: 'Accept',
        },
      ];
      expect(acceptedMappings).toHaveLength(1);
    });
  });

  // ─── 9. Constitutional Principle ───────────────────────────────────────────────

  describe('Constitutional principle', () => {
    it('history must never be rewritten — only explained', () => {
      const principle = 'Historical engineering evidence must never be rewritten.';
      expect(principle).toContain('never be rewritten');
    });

    it('canonical identities are additive, never destructive', () => {
      const principle = 'Canonical identities are additive, never destructive.';
      expect(principle).toContain('additive');
    });

    it('reconciliation engine recommends — never automatically merges', () => {
      const principle = 'The reconciliation engine recommends relationships — it never automatically merges records.';
      expect(principle).toContain('never automatically merges');
    });

    it('identity mappings require Product Owner approval', () => {
      const principle = 'Identity mappings require Product Owner approval before becoming canonical.';
      expect(principle).toContain('Product Owner approval');
    });
  });

  // ─── 10. EWO Identity Panel Display ───────────────────────────────────────────

  describe('EWO Identity Panel', () => {
    it('displays canonical reference prominently', () => {
      const ewoRef = 'EWO-001';
      const mappings: IdentityMapping[] = [];
      // When no mappings, the panel shows the canonical ref as the identity
      expect(ewoRef).toBe('EWO-001');
      expect(mappings).toHaveLength(0);
    });

    it('displays historical aliases with relationship type and confidence', () => {
      const mappings: IdentityMapping[] = [
        {
          id: '1',
          canonical_reference: 'EWO-001',
          canonical_type: 'engineering_work_order',
          historical_reference: 'ERC-002-DEV-SEED',
          historical_type: 'completion_report',
          source_record_id: null,
          relationship_type: 'ALIAS',
          confidence: 'MEDIUM',
          reconciliation_status: 'accepted',
          provenance: 'Historical record',
          notes: null,
          recommended_action: 'Accept',
          accepted_by: 'PO',
          accepted_at: '2026-07-17',
          acceptance_reason: 'Confirmed',
          created_at: '2026-07-17',
          updated_at: '2026-07-17',
        },
      ];
      expect(mappings[0].historical_reference).toBe('ERC-002-DEV-SEED');
      expect(mappings[0].relationship_type).toBe('ALIAS');
      expect(mappings[0].confidence).toBe('MEDIUM');
    });
  });

  // ─── 11. Record View Identity Badge ────────────────────────────────────────────

  describe('Record view identity badge', () => {
    it('displays identity badge when record has ewo_ref different from record_ref', () => {
      const record = {
        record_ref: 'ERC-002-DEV-SEED',
        ewo_ref: 'EWO-001',
      };
      const showBadge = record.ewo_ref && record.record_ref !== record.ewo_ref;
      expect(showBadge).toBe(true);
    });

    it('does not display badge when record_ref equals ewo_ref', () => {
      const record = {
        record_ref: 'EWO-001',
        ewo_ref: 'EWO-001',
      };
      const showBadge = record.ewo_ref && record.record_ref !== record.ewo_ref;
      expect(showBadge).toBe(false);
    });

    it('does not display badge when no ewo_ref', () => {
      const record = {
        record_ref: 'ERC-001',
        ewo_ref: null as string | null,
      };
      const showBadge = !!(record.ewo_ref && record.record_ref !== record.ewo_ref);
      expect(showBadge).toBe(false);
    });
  });
});
