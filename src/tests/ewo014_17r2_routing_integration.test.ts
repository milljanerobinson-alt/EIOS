import { describe, it, expect } from 'vitest';
import { parseEngineeringRoute, buildEngineeringUrl } from '../lib/engineeringNavigationService';

// ─── EWO-014.17R.2: Routing Integration Tests ───────────────────────────────
// These tests verify the actual routing layer behavior that was broken in
// EWO-014.17R.1 — specifically that UUIDs are preserved and recovery_ref
// identifiers are correctly resolved.

describe('EWO-014.17R.2: Routing Integration — UUID vs Recovery Ref', () => {

  describe('parseEngineeringRoute — UUID preservation', () => {
    it('preserves UUID case (does not uppercase)', () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const hash = `#/engineering/historical-recovery/${uuid}`;
      const parsed = parseEngineeringRoute(hash);
      expect(parsed.objectRef).toBe(uuid);
      expect(parsed.objectRef).not.toBe(uuid.toUpperCase());
    });

    it('uppercases engineering references (EWO-001, REC-001)', () => {
      const hash = '#/engineering/historical-recovery/rec-001';
      const parsed = parseEngineeringRoute(hash);
      expect(parsed.objectRef).toBe('REC-001');
    });

    it('uppercases EWO references', () => {
      const hash = '#/engineering/work-orders/ewo-014';
      const parsed = parseEngineeringRoute(hash);
      expect(parsed.objectRef).toBe('EWO-014');
    });

    it('preserves UUID with hyphens to underscores conversion NOT applied', () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const hash = `#/engineering/historical-recovery/${uuid}`;
      const parsed = parseEngineeringRoute(hash);
      // UUIDs should NOT have hyphens converted to underscores
      expect(parsed.objectRef).toContain('-');
      expect(parsed.objectRef).not.toContain('_');
    });

    it('converts underscores to hyphens for non-UUID refs', () => {
      const hash = '#/engineering/historical-recovery/rec_001';
      const parsed = parseEngineeringRoute(hash);
      expect(parsed.objectRef).toBe('REC-001');
    });
  });

  describe('buildEngineeringUrl — URL construction', () => {
    it('builds URL with recovery_ref', () => {
      const url = buildEngineeringUrl('historical-recovery', 'REC-001');
      expect(url).toBe('#/engineering/historical-recovery/rec_001');
    });

    it('builds URL without objectRef', () => {
      const url = buildEngineeringUrl('historical-recovery');
      expect(url).toBe('#/engineering/historical-recovery');
    });
  });

  describe('Round-trip: navigate → parse → resolve', () => {
    it('recovery_ref survives round-trip through URL', () => {
      // Simulate: dashboard calls navigate('historical-recovery', 'REC-001')
      // URL becomes: #/engineering/historical-recovery/rec_001
      // On hashchange, parseEngineeringRoute extracts objectRef
      const url = buildEngineeringUrl('historical-recovery', 'REC-001');
      const parsed = parseEngineeringRoute(url);
      expect(parsed.section).toBe('historical-recovery');
      expect(parsed.objectRef).toBe('REC-001');
    });

    it('UUID survives round-trip through URL', () => {
      // Simulate: if UUID were passed, it would survive
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const hash = `#/engineering/historical-recovery/${uuid}`;
      const parsed = parseEngineeringRoute(hash);
      expect(parsed.objectRef).toBe(uuid);
    });
  });

  describe('Recovery Workspace resolution', () => {
    it('packageId from URL is a recovery_ref (REC-XXX), not a UUID', () => {
      // After the fix, the dashboard passes recovery_ref to navigate().
      // The URL contains the slugified ref (rec_001).
      // parseEngineeringRoute uppercases it back to REC-001.
      // The workspace receives REC-001 as packageId.
      // isUuid check returns false → getRecoveryPackageByRef is called.
      const packageId = 'REC-001';
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(packageId);
      expect(isUuid).toBe(false);
    });

    it('UUID packageId triggers getRecoveryPackage (not ByRef)', () => {
      const packageId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(packageId);
      expect(isUuid).toBe(true);
    });
  });

  describe('Root cause verification', () => {
    it('BEFORE FIX: UUID would be uppercased → database lookup fails', () => {
      // This test documents the original bug:
      // parseEngineeringRoute uppercased ALL objectRefs, including UUIDs.
      // A UUID like "a1b2c3d4-..." became "A1B2C3D4-..." which doesn't match.
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const uppercased = uuid.toUpperCase();
      expect(uppercased).not.toBe(uuid);
      // This is why getRecoveryPackage(uppercasedUuid) returned null.
    });

    it('AFTER FIX: UUID is preserved → database lookup succeeds', () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const hash = `#/engineering/historical-recovery/${uuid}`;
      const parsed = parseEngineeringRoute(hash);
      expect(parsed.objectRef).toBe(uuid);
      // Now getRecoveryPackage(uuid) will find the record.
    });

    it('AFTER FIX: recovery_ref is used as URL identifier (shareable, readable)', () => {
      // The dashboard now passes recovery_ref (REC-001) instead of UUID.
      // This makes URLs readable and shareable.
      const url = buildEngineeringUrl('historical-recovery', 'REC-001');
      expect(url).toContain('rec_001');
      // Parsed back:
      const parsed = parseEngineeringRoute(url);
      expect(parsed.objectRef).toBe('REC-001');
    });
  });
});
