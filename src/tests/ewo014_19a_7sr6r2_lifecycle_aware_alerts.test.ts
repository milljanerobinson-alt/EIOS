// EWO-014.19A.7SR.6R.2 — Lifecycle-Aware Integrity Alert Lists, Counts & Resolved History
// Tests canonical lifecycle predicates and query functions.

import { describe, it, expect } from 'vitest';
import {
  isActiveIntegrityAlert,
  isHistoricalIntegrityAlert,
  type IntegrityAlert,
} from '../lib/engineeringIntegrityService';

function makeAlert(overrides: Partial<IntegrityAlert> = {}): IntegrityAlert {
  return {
    id: 'test-id',
    alert_type: 'missing_ewo',
    raw_reference: 'EWO-007',
    normalised_reference: 'EWO-007',
    status: 'open',
    classification: 'Missing Work Order',
    description: 'Test alert',
    evidence: {},
    created_at: new Date().toISOString(),
    ...overrides,
  } as unknown as IntegrityAlert;
}

describe('EWO-014.19A.7SR.6R.2 — Lifecycle-Aware Integrity Alert Lists', () => {

  // ─── REQ 1: Active alert lists must exclude terminal states ─────────────────

  describe('Requirement 1 — Active alerts exclude terminal states', () => {
    it('TEST 1 — isActiveIntegrityAlert returns true for open alert with no resolution_status', () => {
      const alert = makeAlert({ status: 'open', resolution_status: undefined });
      expect(isActiveIntegrityAlert(alert)).toBe(true);
    });

    it('TEST 2 — isActiveIntegrityAlert returns false for resolved resolution_status', () => {
      const alert = makeAlert({ status: 'open', resolution_status: 'resolved' });
      expect(isActiveIntegrityAlert(alert)).toBe(false);
    });

    it('TEST 3 — isActiveIntegrityAlert returns false for archived resolution_status', () => {
      const alert = makeAlert({ status: 'open', resolution_status: 'archived' });
      expect(isActiveIntegrityAlert(alert)).toBe(false);
    });

    it('TEST 4 — isActiveIntegrityAlert returns false for status=resolved', () => {
      const alert = makeAlert({ status: 'resolved' });
      expect(isActiveIntegrityAlert(alert)).toBe(false);
    });

    it('TEST 5 — isActiveIntegrityAlert returns false for status=dismissed', () => {
      const alert = makeAlert({ status: 'dismissed' });
      expect(isActiveIntegrityAlert(alert)).toBe(false);
    });

    it('TEST 6 — isActiveIntegrityAlert returns true for investigating resolution_status', () => {
      const alert = makeAlert({ status: 'open', resolution_status: 'investigating' });
      expect(isActiveIntegrityAlert(alert)).toBe(true);
    });

    it('TEST 7 — isActiveIntegrityAlert returns true for decision_produced resolution_status', () => {
      const alert = makeAlert({ status: 'open', resolution_status: 'decision_produced' });
      expect(isActiveIntegrityAlert(alert)).toBe(true);
    });

    it('TEST 8 — isActiveIntegrityAlert returns true for repair_executed resolution_status', () => {
      const alert = makeAlert({ status: 'open', resolution_status: 'repair_executed' });
      expect(isActiveIntegrityAlert(alert)).toBe(true);
    });
  });

  // ─── REQ 4: Resolved history access ──────────────────────────────────────────

  describe('Requirement 4 — Resolved history access', () => {
    it('TEST 9 — isHistoricalIntegrityAlert returns true for resolved resolution_status', () => {
      const alert = makeAlert({ status: 'resolved', resolution_status: 'resolved' });
      expect(isHistoricalIntegrityAlert(alert)).toBe(true);
    });

    it('TEST 10 — isHistoricalIntegrityAlert returns true for archived resolution_status', () => {
      const alert = makeAlert({ status: 'resolved', resolution_status: 'archived' });
      expect(isHistoricalIntegrityAlert(alert)).toBe(true);
    });

    it('TEST 11 — isHistoricalIntegrityAlert returns true for status=resolved', () => {
      const alert = makeAlert({ status: 'resolved' });
      expect(isHistoricalIntegrityAlert(alert)).toBe(true);
    });

    it('TEST 12 — isHistoricalIntegrityAlert returns true for status=dismissed', () => {
      const alert = makeAlert({ status: 'dismissed' });
      expect(isHistoricalIntegrityAlert(alert)).toBe(true);
    });

    it('TEST 13 — isHistoricalIntegrityAlert returns false for active alert', () => {
      const alert = makeAlert({ status: 'open', resolution_status: 'investigating' });
      expect(isHistoricalIntegrityAlert(alert)).toBe(false);
    });
  });

  // ─── REQ 6: Canonical lifecycle filter consistency ────────────────────────────

  describe('Requirement 6 — Canonical lifecycle filter consistency', () => {
    it('TEST 14 — isActiveIntegrityAlert and isHistoricalIntegrityAlert are mutually exclusive for resolved', () => {
      const alert = makeAlert({ status: 'resolved', resolution_status: 'resolved' });
      expect(isActiveIntegrityAlert(alert)).toBe(false);
      expect(isHistoricalIntegrityAlert(alert)).toBe(true);
    });

    it('TEST 15 — isActiveIntegrityAlert and isHistoricalIntegrityAlert are mutually exclusive for active', () => {
      const alert = makeAlert({ status: 'open', resolution_status: 'investigating' });
      expect(isActiveIntegrityAlert(alert)).toBe(true);
      expect(isHistoricalIntegrityAlert(alert)).toBe(false);
    });

    it('TEST 16 — A resolved alert cannot be both active and historical', () => {
      const scenarios = [
        makeAlert({ status: 'resolved', resolution_status: 'resolved' }),
        makeAlert({ status: 'resolved', resolution_status: 'archived' }),
        makeAlert({ status: 'dismissed' }),
      ];
      for (const alert of scenarios) {
        expect(isActiveIntegrityAlert(alert) && isHistoricalIntegrityAlert(alert)).toBe(false);
      }
    });
  });

  // ─── REQ 5: Clear active vs historical labelling ──────────────────────────────

  describe('Requirement 5 — Clear active vs historical labelling', () => {
    it('TEST 17 — Active alerts have open status and non-terminal resolution_status', () => {
      const activeStatuses = ['detected', 'investigating', 'decision_produced', 'repair_executed'];
      for (const rs of activeStatuses) {
        const alert = makeAlert({ status: 'open', resolution_status: rs as IntegrityAlert['resolution_status'] });
        expect(isActiveIntegrityAlert(alert)).toBe(true);
      }
    });

    it('TEST 18 — Historical alerts have terminal resolution_status or non-open status', () => {
      const historicalScenarios = [
        makeAlert({ status: 'resolved', resolution_status: 'resolved' }),
        makeAlert({ status: 'resolved', resolution_status: 'archived' }),
        makeAlert({ status: 'dismissed', resolution_status: undefined }),
      ];
      for (const alert of historicalScenarios) {
        expect(isHistoricalIntegrityAlert(alert)).toBe(true);
      }
    });
  });
});
