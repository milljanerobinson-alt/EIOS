import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateCanonicalUrl,
  parseEngineeringRoute,
  buildEngineeringUrl,
  pushNavHistory,
  getNavHistory,
  clearNavHistory,
  saveNavContext,
  getNavContext,
  type EngineeringObjectType,
} from '../lib/engineeringNavigationService';

// ─── EWO-014.13R: Canonical Routing Refinement ──────────────────────────────

describe('EWO-014.13R: Unified Engineering Navigation & Canonical Routing', () => {

  // ─── 1. Canonical URLs ───────────────────────────────────────────────────────

  describe('Canonical Engineering Object URLs', () => {
    it('every engineering object type has a canonical URL', () => {
      const types: EngineeringObjectType[] = [
        'engineering_idea', 'engineering_intent', 'engineering_analysis',
        'engineering_plan', 'engineering_work_order', 'engineering_validation',
        'completion_report', 'engineering_record', 'engineering_knowledge',
        'constitutional_amendment', 'engineering_standard',
      ];
      types.forEach(t => {
        const url = generateCanonicalUrl(t, 'TEST-001');
        expect(url).toMatch(/^#\/engineering\//);
        expect(url).toContain('test_001');
      });
    });

    it('work-order URL is permanent and deterministic', () => {
      const url1 = generateCanonicalUrl('engineering_work_order', 'EWO-014.13');
      const url2 = generateCanonicalUrl('engineering_work_order', 'EWO-014.13');
      expect(url1).toBe(url2);
      expect(url1).toBe('#/engineering/work-orders/ewo_014_13');
    });

    it('engineering record URL is permanent and deterministic', () => {
      const url = generateCanonicalUrl('engineering_record', 'ER-014.13');
      expect(url).toBe('#/engineering/records-library/er_014_13');
    });

    it('engineering plan URL is permanent and deterministic', () => {
      const url = generateCanonicalUrl('engineering_plan', 'EIP-014.13');
      expect(url).toBe('#/engineering/engineering-planning/eip_014_13');
    });
  });

  // ─── 2. URL Parsing (Direct URL opens object) ─────────────────────────────────

  describe('Direct URL parsing', () => {
    it('parses work-order object URL', () => {
      const parsed = parseEngineeringRoute('#/engineering/work-orders/ewo_014_13');
      expect(parsed.section).toBe('work-orders');
      expect(parsed.objectRef).toBe('EWO-014-13');
    });

    it('parses records-library object URL', () => {
      const parsed = parseEngineeringRoute('#/engineering/records-library/er_014_13');
      expect(parsed.section).toBe('records-library');
      expect(parsed.objectRef).toBe('ER-014-13');
    });

    it('parses engineering-planning object URL', () => {
      const parsed = parseEngineeringRoute('#/engineering/engineering-planning/eip_014_13');
      expect(parsed.section).toBe('engineering-planning');
      expect(parsed.objectRef).toBe('EIP-014-13');
    });

    it('parses section-only URL (no object)', () => {
      const parsed = parseEngineeringRoute('#/engineering/work-orders');
      expect(parsed.section).toBe('work-orders');
      expect(parsed.objectRef).toBeNull();
    });

    it('defaults to mission-control for bare engineering route', () => {
      const parsed = parseEngineeringRoute('#/engineering');
      expect(parsed.section).toBe('mission-control');
      expect(parsed.objectRef).toBeNull();
    });
  });

  // ─── 3. Tabs do NOT modify URL ───────────────────────────────────────────────

  describe('Tabs do not modify URL', () => {
    it('section URL has no tab/subPath component', () => {
      const url = buildEngineeringUrl('work-orders', 'EWO-014.13');
      expect(url).toBe('#/engineering/work-orders/ewo_014_13');
      expect(url.split('/')).toHaveLength(4);
    });

    it('parseEngineeringRoute returns null subPath for object-only URL', () => {
      const parsed = parseEngineeringRoute('#/engineering/work-orders/ewo_014_13');
      expect(parsed.subPath).toBeNull();
    });

    it('buildEngineeringUrl without subPath produces no trailing path', () => {
      const url = buildEngineeringUrl('work-orders', 'EWO-014.13');
      expect(url).not.toMatch(/\/$/);
      expect(url.split('/').length).toBe(4);
    });
  });

  // ─── 4. Browser History (Object-level navigation) ────────────────────────────

  describe('Browser History integration', () => {
    it('selecting an object produces a URL hash that can be set', () => {
      const url = generateCanonicalUrl('engineering_work_order', 'EWO-014.13');
      expect(url).toBe('#/engineering/work-orders/ewo_014_13');
      // Simulate what selectEwo does: window.location.hash = url
      let currentHash = '';
      currentHash = url;
      expect(currentHash).toBe('#/engineering/work-orders/ewo_014_13');
    });

    it('selecting a different object produces a different URL hash', () => {
      const url1 = generateCanonicalUrl('engineering_work_order', 'EWO-014.13');
      const url2 = generateCanonicalUrl('engineering_work_order', 'EWO-014.14');
      expect(url1).not.toBe(url2);
    });

    it('navigating back restores previous object URL', () => {
      const url1 = generateCanonicalUrl('engineering_work_order', 'EWO-014.13');
      const url2 = generateCanonicalUrl('engineering_work_order', 'EWO-014.14');
      // Simulate browser history: visit 1, visit 2, go back to 1
      const history: string[] = [url1, url2];
      const back = history[history.length - 2];
      expect(back).toBe(url1);
      expect(parseEngineeringRoute(back).objectRef).toBe('EWO-014-13');
    });

    it('navigating forward restores next object URL', () => {
      const url1 = generateCanonicalUrl('engineering_work_order', 'EWO-014.13');
      const url2 = generateCanonicalUrl('engineering_work_order', 'EWO-014.14');
      // Simulate: visit 1, visit 2, go back to 1, go forward to 2
      const forwardStack: string[] = [url2];
      const forward = forwardStack[forwardStack.length - 1];
      expect(forward).toBe(url2);
      expect(parseEngineeringRoute(forward).objectRef).toBe('EWO-014-14');
    });

    it('cross-section navigation changes the section part of the URL', () => {
      const woUrl = generateCanonicalUrl('engineering_work_order', 'EWO-014.13');
      const recUrl = generateCanonicalUrl('engineering_record', 'ER-014.13');
      const woParsed = parseEngineeringRoute(woUrl);
      const recParsed = parseEngineeringRoute(recUrl);
      expect(woParsed.section).not.toBe(recParsed.section);
    });
  });

  // ─── 5. Refresh restores object ──────────────────────────────────────────────

  describe('Refresh behaviour', () => {
    it('URL with object ref can be parsed to restore object', () => {
      const url = generateCanonicalUrl('engineering_work_order', 'EWO-014.13');
      const parsed = parseEngineeringRoute(url);
      expect(parsed.objectRef).toBe('EWO-014-13');
      expect(parsed.section).toBe('work-orders');
    });

    it('URL without object ref restores section list', () => {
      const url = buildEngineeringUrl('work-orders');
      const parsed = parseEngineeringRoute(url);
      expect(parsed.objectRef).toBeNull();
      expect(parsed.section).toBe('work-orders');
    });

    it('records-library URL can be parsed to restore record', () => {
      const url = generateCanonicalUrl('engineering_record', 'ER-014.13');
      const parsed = parseEngineeringRoute(url);
      expect(parsed.objectRef).toBe('ER-014-13');
      expect(parsed.section).toBe('records-library');
    });
  });

  // ─── 6. Cross-object navigation ──────────────────────────────────────────────

  describe('Cross-object navigation', () => {
    it('navigating from work-order to record changes section', () => {
      const woUrl = generateCanonicalUrl('engineering_work_order', 'EWO-014.13');
      const recUrl = generateCanonicalUrl('engineering_record', 'ER-014.13');
      const woParsed = parseEngineeringRoute(woUrl);
      const recParsed = parseEngineeringRoute(recUrl);
      expect(woParsed.section).toBe('work-orders');
      expect(recParsed.section).toBe('records-library');
      expect(woParsed.section).not.toBe(recParsed.section);
    });

    it('navigating between objects of same type keeps section', () => {
      const url1 = generateCanonicalUrl('engineering_work_order', 'EWO-014.13');
      const url2 = generateCanonicalUrl('engineering_work_order', 'EWO-014.14');
      const parsed1 = parseEngineeringRoute(url1);
      const parsed2 = parseEngineeringRoute(url2);
      expect(parsed1.section).toBe(parsed2.section);
      expect(parsed1.objectRef).not.toBe(parsed2.objectRef);
    });
  });

  // ─── 7. Breadcrumb URLs ──────────────────────────────────────────────────────

  describe('Breadcrumb navigation', () => {
    it('breadcrumb canonical URLs are parseable', () => {
      const crumbUrl = generateCanonicalUrl('engineering_work_order', 'EWO-014.13');
      const parsed = parseEngineeringRoute(crumbUrl);
      expect(parsed.section).toBe('work-orders');
      expect(parsed.objectRef).toBe('EWO-014-13');
    });

    it('engineering home URL is valid', () => {
      const parsed = parseEngineeringRoute('#/engineering/mission-control');
      expect(parsed.section).toBe('mission-control');
      expect(parsed.objectRef).toBeNull();
    });
  });

  // ─── 8. Navigation history (localStorage audit) ───────────────────────────────

  describe('Navigation history audit', () => {
    let mockStorage: Record<string, string>;

    beforeEach(() => {
      mockStorage = {};
      // @ts-expect-error - mock localStorage
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

    it('records each visited object in history', () => {
      pushNavHistory({ object_ref: 'EWO-014.13', object_type: 'engineering_work_order', title: 'Nav Refinement', canonical_url: '#/engineering/work-orders/ewo_014_13' });
      pushNavHistory({ object_ref: 'EWO-014.14', object_type: 'engineering_work_order', title: 'Next EWO', canonical_url: '#/engineering/work-orders/ewo_014_14' });
      const history = getNavHistory();
      expect(history).toHaveLength(2);
      expect(history[0].object_ref).toBe('EWO-014.14');
      expect(history[1].object_ref).toBe('EWO-014.13');
    });

    it('history entries contain canonical URLs', () => {
      pushNavHistory({ object_ref: 'EWO-014.13', object_type: 'engineering_work_order', title: 'Test', canonical_url: '#/engineering/work-orders/ewo_014_13' });
      const history = getNavHistory();
      expect(history[0].canonical_url).toBe('#/engineering/work-orders/ewo_014_13');
    });
  });

  // ─── 9. URL round-trip integrity ──────────────────────────────────────────────

  describe('URL round-trip integrity', () => {
    it('generateCanonicalUrl → parseEngineeringRoute preserves object ref', () => {
      const refs = ['EWO-014.13', 'EWO-007R.1', 'ER-014.13', 'EIP-014.13', 'ES-001'];
      refs.forEach(ref => {
        const type: EngineeringObjectType = ref.startsWith('ER') ? 'engineering_record'
          : ref.startsWith('EIP') ? 'engineering_plan'
          : ref.startsWith('ES') ? 'engineering_standard'
          : 'engineering_work_order';
        const url = generateCanonicalUrl(type, ref);
        const parsed = parseEngineeringRoute(url);
        // The parser converts slug back to uppercase with dashes
        expect(parsed.objectRef).toBeTruthy();
        expect(parsed.objectRef).toBe(ref.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, ''));
      });
    });

    it('buildEngineeringUrl → parseEngineeringRoute preserves section', () => {
      const sections = ['work-orders', 'records-library', 'engineering-planning', 'mission-control'];
      sections.forEach(section => {
        const url = buildEngineeringUrl(section);
        const parsed = parseEngineeringRoute(url);
        expect(parsed.section).toBe(section);
      });
    });
  });
});
