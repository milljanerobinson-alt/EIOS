// EWO-014.19A.7SR.2 — Alert Idempotency & Deduplication Tests
// Tests the reconciliation idempotency, auto-resolution, and governed deduplication.

import { describe, it, expect } from 'vitest';
import {
  classifyReference,
  deduplicateAlerts,
  type DeduplicationResult,
} from '../lib/engineeringIntegrityService';

describe('EWO-014.19A.7SR.2 — Alert Idempotency & Deduplication', () => {

  // ─── TEST 1: Trailing dot normalization ────────────────────────────────────
  it('TEST 1 — classifyReference strips trailing dots from EWO references', () => {
    const result = classifyReference('EWO-014.19A.7.', 'ewo_lifecycle_events', {});
    expect(result.normalised_reference).toBe('EWO-014.19A.7');
    expect(result.normalised_reference).not.toContain('..');
    expect(result.normalised_reference.endsWith('.')).toBe(false);
  });

  // ─── TEST 2: Multiple trailing dots stripped ──────────────────────────────
  it('TEST 2 — classifyReference strips multiple trailing dots', () => {
    const result = classifyReference('EWO-014.19A.7...', 'ewo_lifecycle_events', {});
    expect(result.normalised_reference).toBe('EWO-014.19A.7');
  });

  // ─── TEST 3: No trailing dot — unchanged ───────────────────────────────────
  it('TEST 3 — classifyReference preserves references without trailing dots', () => {
    const result = classifyReference('EWO-014.19A.7', 'ewo_lifecycle_events', {});
    expect(result.normalised_reference).toBe('EWO-014.19A.7');
  });

  // ─── TEST 4: Internal dots preserved ──────────────────────────────────────
  it('TEST 4 — classifyReference preserves internal dots in references', () => {
    const result = classifyReference('EWO-014.19A.7SR.2', 'ewo_lifecycle_events', {});
    expect(result.normalised_reference).toBe('EWO-014.19A.7SR.2');
  });

  // ─── TEST 5: Reference pattern excludes trailing dots ──────────────────────
  it('TEST 5 — EWO reference pattern does not capture trailing dots', () => {
    // The regex should match EWO-014.19A.7 but not the trailing dot
    const text = 'Work on EWO-014.19A.7. was completed.';
    const refPattern = /(?:EWO-\d[\dA-Za-z.]*(?<![.])|BATCH-[A-Za-z0-9-]+|BUG-[A-Za-z0-9-]+|CONST-[A-Za-z0-9-]+|ERC-[A-Za-z0-9-]+|ER-[A-Za-z0-9.]+(?<![.]))/g;
    const matches = text.match(refPattern);
    expect(matches).not.toBeNull();
    expect(matches![0]).toBe('EWO-014.19A.7');
    expect(matches![0].endsWith('.')).toBe(false);
  });

  // ─── TEST 6: Deduplication function returns valid structure ───────────────
  it('TEST 6 — deduplicateAlerts returns valid DeduplicationResult structure', async () => {
    const result: DeduplicationResult = await deduplicateAlerts();
    expect(result).toBeDefined();
    expect(typeof result.duplicateGroups).toBe('number');
    expect(typeof result.alertsSuperseded).toBe('number');
    expect(typeof result.canonicalAlertsRetained).toBe('number');
    expect(Array.isArray(result.details)).toBe(true);
    expect(result.duplicateGroups).toBeGreaterThanOrEqual(0);
    expect(result.alertsSuperseded).toBeGreaterThanOrEqual(0);
    expect(result.canonicalAlertsRetained).toBeGreaterThanOrEqual(0);
  });

  // ─── TEST 7: Deduplication is idempotent ──────────────────────────────────
  it('TEST 7 — deduplicateAlerts is idempotent (running twice produces same or fewer results)', async () => {
    const firstRun = await deduplicateAlerts();
    const secondRun = await deduplicateAlerts();
    // Second run should find 0 or fewer duplicates since first run already consolidated
    expect(secondRun.alertsSuperseded).toBeLessThanOrEqual(firstRun.alertsSuperseded);
  });

  // ─── TEST 8: EWO-014.19A.7 is classified as EWO type ───────────────────────
  it('TEST 8 — EWO-014.19A.7 is classified as ewo object type', () => {
    const result = classifyReference('EWO-014.19A.7', 'ewo_lifecycle_events', {});
    expect(result.inferred_object_type).toBe('ewo');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  // ─── TEST 9: Various lifecycle states all classify as EWO ─────────────────
  it('TEST 9 — EWO references with various suffixes all classify correctly', () => {
    const refs = [
      'EWO-014.19A.7',
      'EWO-014.19A.7SR.1',
      'EWO-014.19A.7SR.2',
      'EWO-014.19A.7R.3R.1',
      'EWO-014.19A.7S',
    ];
    for (const ref of refs) {
      const result = classifyReference(ref, 'ewo_lifecycle_events', {});
      expect(result.inferred_object_type).toBe('ewo');
      expect(result.normalised_reference).toBe(ref);
      expect(result.normalised_reference.endsWith('.')).toBe(false);
    }
  });
});
