import { describe, it, expect } from 'vitest';
import {
  generateCanonicalUrl,
  parseEngineeringRoute,
  buildEngineeringUrl,
  pushNavHistory,
  getNavHistory,
  clearNavHistory,
  saveNavContext,
  getNavContext,
  OBJECT_TYPE_LABELS,
  RELATIONSHIP_LABELS,
  type EngineeringObjectType,
} from '../lib/engineeringNavigationService';

// ─── Canonical URL Generation ─────────────────────────────────────────────────

describe('EWO-014.13: Engineering Navigation Service', () => {
  describe('generateCanonicalUrl', () => {
    it('generates work-order URL with slugified ref', () => {
      const url = generateCanonicalUrl('engineering_work_order', 'EWO-014.7');
      expect(url).toBe('#/engineering/work-orders/ewo_014_7');
    });

    it('generates engineering record URL', () => {
      const url = generateCanonicalUrl('engineering_record', 'ER-014.7');
      expect(url).toBe('#/engineering/records-library/er_014_7');
    });

    it('generates completion report URL', () => {
      const url = generateCanonicalUrl('completion_report', 'CR-EWO-014.7');
      expect(url).toBe('#/engineering/work-orders/cr_ewo_014_7');
    });

    it('generates engineering standard URL', () => {
      const url = generateCanonicalUrl('engineering_standard', 'ES-001');
      expect(url).toBe('#/engineering/engineering-standards/es_001');
    });

    it('generates constitutional amendment URL', () => {
      const url = generateCanonicalUrl('constitutional_amendment', 'AMD-002');
      expect(url).toBe('#/engineering/constitution/amd_002');
    });

    it('generates engineering idea URL', () => {
      const url = generateCanonicalUrl('engineering_idea', 'IDEA-001');
      expect(url).toBe('#/engineering/engineering-ideas/idea_001');
    });

    it('handles special characters in ref', () => {
      const url = generateCanonicalUrl('engineering_work_order', 'EWO-007R.1');
      expect(url).toBe('#/engineering/work-orders/ewo_007r_1');
    });

    it('handles lowercase refs', () => {
      const url = generateCanonicalUrl('engineering_work_order', 'ewo-001');
      expect(url).toBe('#/engineering/work-orders/ewo_001');
    });
  });

  // ─── Route Parsing ──────────────────────────────────────────────────────────

  describe('parseEngineeringRoute', () => {
    it('parses section-only route', () => {
      const result = parseEngineeringRoute('#/engineering/work-orders');
      expect(result.section).toBe('work-orders');
      expect(result.objectRef).toBeNull();
      expect(result.subPath).toBeNull();
    });

    it('parses section + object ref', () => {
      const result = parseEngineeringRoute('#/engineering/work-orders/ewo_014_7');
      expect(result.section).toBe('work-orders');
      expect(result.objectRef).toBe('EWO-014-7');
      expect(result.subPath).toBeNull();
    });

    it('parses section + object ref + sub-path', () => {
      const result = parseEngineeringRoute('#/engineering/work-orders/ewo_014_7/report');
      expect(result.section).toBe('work-orders');
      expect(result.objectRef).toBe('EWO-014-7');
      expect(result.subPath).toBe('report');
    });

    it('defaults to mission-control for bare engineering route', () => {
      const result = parseEngineeringRoute('#/engineering');
      expect(result.section).toBe('mission-control');
      expect(result.objectRef).toBeNull();
    });

    it('defaults to mission-control for empty hash', () => {
      const result = parseEngineeringRoute('');
      expect(result.section).toBe('mission-control');
    });

    it('handles records-library route with object ref', () => {
      const result = parseEngineeringRoute('#/engineering/records-library/er_014_7');
      expect(result.section).toBe('records-library');
      expect(result.objectRef).toBe('ER-014-7');
    });
  });

  // ─── URL Building ────────────────────────────────────────────────────────────

  describe('buildEngineeringUrl', () => {
    it('builds section-only URL', () => {
      expect(buildEngineeringUrl('work-orders')).toBe('#/engineering/work-orders');
    });

    it('builds URL with object ref', () => {
      expect(buildEngineeringUrl('work-orders', 'EWO-014.7')).toBe('#/engineering/work-orders/ewo_014_7');
    });

    it('builds URL with object ref and sub-path', () => {
      expect(buildEngineeringUrl('work-orders', 'EWO-014.7', 'report')).toBe('#/engineering/work-orders/ewo_014_7/report');
    });
  });

  // ─── Navigation History ─────────────────────────────────────────────────────

  describe('Navigation History', () => {
    let mockStorage: Record<string, string>;

    beforeEach(() => {
      mockStorage = {};
      // @ts-expect-error - mock localStorage for node environment
      globalThis.localStorage = {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, val: string) => { mockStorage[key] = val; },
        removeItem: (key: string) => { delete mockStorage[key]; },
        clear: () => { mockStorage = {}; },
      };
    });

    afterEach(() => {
      // @ts-expect-error - cleanup
      delete globalThis.localStorage;
    });

    it('pushes and retrieves history entries', () => {
      pushNavHistory({
        object_ref: 'EWO-014.7',
        object_type: 'engineering_work_order',
        title: 'Test EWO',
        canonical_url: '#/engineering/work-orders/ewo_014_7',
      });
      const history = getNavHistory();
      expect(history).toHaveLength(1);
      expect(history[0].object_ref).toBe('EWO-014.7');
      expect(history[0].title).toBe('Test EWO');
      expect(history[0].visited_at).toBeTruthy();
    });

    it('deduplicates by object_ref', () => {
      pushNavHistory({ object_ref: 'EWO-001', object_type: 'engineering_work_order', title: 'First', canonical_url: '#/engineering/work-orders/ewo_001' });
      pushNavHistory({ object_ref: 'EWO-002', object_type: 'engineering_work_order', title: 'Second', canonical_url: '#/engineering/work-orders/ewo_002' });
      pushNavHistory({ object_ref: 'EWO-001', object_type: 'engineering_work_order', title: 'First Again', canonical_url: '#/engineering/work-orders/ewo_001' });
      const history = getNavHistory();
      expect(history).toHaveLength(2);
      expect(history[0].object_ref).toBe('EWO-001');
      expect(history[0].title).toBe('First Again');
    });

    it('caps history at 20 entries', () => {
      for (let i = 0; i < 25; i++) {
        pushNavHistory({ object_ref: `EWO-${i}`, object_type: 'engineering_work_order', title: `EWO ${i}`, canonical_url: `#/engineering/work-orders/ewo_${i}` });
      }
      const history = getNavHistory();
      expect(history).toHaveLength(20);
      expect(history[0].object_ref).toBe('EWO-24');
    });

    it('clears history', () => {
      pushNavHistory({ object_ref: 'EWO-001', object_type: 'engineering_work_order', title: 'Test', canonical_url: '#/engineering/work-orders/ewo_001' });
      clearNavHistory();
      expect(getNavHistory()).toHaveLength(0);
    });
  });

  // ─── Context Restoration ────────────────────────────────────────────────────

  describe('Context Restoration', () => {
    let mockStorage: Record<string, string>;

    beforeEach(() => {
      mockStorage = {};
      // @ts-expect-error - mock localStorage for node environment
      globalThis.localStorage = {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, val: string) => { mockStorage[key] = val; },
        removeItem: (key: string) => { delete mockStorage[key]; },
        clear: () => { mockStorage = {}; },
      };
    });

    afterEach(() => {
      // @ts-expect-error - cleanup
      delete globalThis.localStorage;
    });

    it('saves and retrieves nav context', () => {
      saveNavContext({ object_ref: 'EWO-014.7', object_type: 'engineering_work_order', section: 'work-orders' });
      const ctx = getNavContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.object_ref).toBe('EWO-014.7');
      expect(ctx!.section).toBe('work-orders');
      expect(ctx!.visited_at).toBeTruthy();
    });
  });

  // ─── Object Type Labels ──────────────────────────────────────────────────────

  describe('Object Type Labels', () => {
    it('has labels for all engineering object types', () => {
      const types: EngineeringObjectType[] = [
        'engineering_idea', 'engineering_intent', 'engineering_analysis',
        'engineering_plan', 'engineering_work_order', 'engineering_validation',
        'completion_report', 'engineering_record', 'engineering_knowledge',
        'constitutional_amendment', 'engineering_standard',
      ];
      types.forEach(t => {
        expect(OBJECT_TYPE_LABELS[t]).toBeTruthy();
        expect(typeof OBJECT_TYPE_LABELS[t]).toBe('string');
      });
    });
  });

  // ─── Relationship Labels ─────────────────────────────────────────────────────

  describe('Relationship Labels', () => {
    it('has labels for key relationship types', () => {
      expect(RELATIONSHIP_LABELS.creates).toBe('Creates');
      expect(RELATIONSHIP_LABELS.produces).toBe('Produces');
      expect(RELATIONSHIP_LABELS.archives).toBe('Archives');
      expect(RELATIONSHIP_LABELS.validates).toBe('Validates');
      expect(RELATIONSHIP_LABELS.supersedes).toBe('Supersedes');
    });
  });

  // ─── Round-trip: URL generation + parsing ───────────────────────────────────

  describe('URL round-trip', () => {
    it('generateCanonicalUrl output can be parsed back to the object ref', () => {
      const url = generateCanonicalUrl('engineering_work_order', 'EWO-014.7');
      const parsed = parseEngineeringRoute(url);
      expect(parsed.section).toBe('work-orders');
      expect(parsed.objectRef).toBe('EWO-014-7');
    });

    it('buildEngineeringUrl output can be parsed back', () => {
      const url = buildEngineeringUrl('records-library', 'ER-014.7');
      const parsed = parseEngineeringRoute(url);
      expect(parsed.section).toBe('records-library');
      expect(parsed.objectRef).toBe('ER-014-7');
    });
  });
});
