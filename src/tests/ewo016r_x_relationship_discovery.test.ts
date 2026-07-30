/**
 * EWO-016R.X — Engineering Relationship Discovery Intent Classification
 * Verifies relationship queries are classified as relationship_discovery,
 * NOT routed to Engineering Impact Analysis.
 */

import { describe, it, expect } from 'vitest';
import {
  detectReferences,
  detectIntent,
  routeConversation,
} from '../lib/conversationContextRouter';

describe('EWO-016R.X — Relationship Discovery Intent', () => {

  // ─── A. Relationship Discovery Intent Detection ────────────────────────────
  describe('A. Relationship Discovery Intent Detection', () => {

    const relationshipQueries = [
      'What engineering records are related to EWO-014.19A?',
      'Show everything related to EWO-014.19A',
      'Show linked engineering for EWO-014.19A',
      'What artefacts belong to EWO-014.19A?',
      'Show engineering traceability for EWO-014.19A',
      'Show engineering history for EWO-014.19A',
      'What is related to EWO-014.19A?',
      'Related engineering records for EWO-014.19A',
      'Engineering relationships for EWO-014.19A',
    ];

    for (const query of relationshipQueries) {
      it(`classifies "${query}" as relationship_discovery`, () => {
        const refs = detectReferences(query);
        const intent = detectIntent(query, refs);
        expect(intent).toBe('relationship_discovery');
      });
    }
  });

  // ─── B. No Cross-Routing to Impact Analysis ─────────────────────────────────
  describe('B. No Cross-Routing to Impact Analysis', () => {

    it('relationship query does NOT classify as impact/feature query', () => {
      const query = 'What engineering records are related to EWO-014.19A?';
      const refs = detectReferences(query);
      const intent = detectIntent(query, refs);
      expect(intent).toBe('relationship_discovery');
      expect(intent).not.toBe('summarise');
      expect(intent).not.toBe('general');
    });

    it('impact-style queries still classify separately', () => {
      const impactQueries = [
        'What features are affected by EWO-014.19A?',
        'What APIs are impacted by EWO-014.19A?',
        'What tests are required for EWO-014.19A?',
        'Which releases are affected by EWO-014.19A?',
      ];
      for (const q of impactQueries) {
        const refs = detectReferences(q);
        const intent = detectIntent(q, refs);
        // Impact queries should NOT be relationship_discovery
        expect(intent).not.toBe('relationship_discovery');
      }
    });
  });

  // ─── C. Routing to EIOS Engineering ─────────────────────────────────────────
  describe('C. Routing to EIOS Engineering', () => {

    it('relationship query with EWO ref routes to eios-engineering', () => {
      const query = 'What engineering records are related to EWO-014.19A?';
      const refs = detectReferences(query);
      const { domain } = routeConversation(query, refs, 'LLND Automate');
      expect(domain).toBe('eios-engineering');
    });

    it('relationship query without ref but with engineering intent routes to eios-engineering', () => {
      const query = 'Show engineering traceability for the latest EWO';
      const refs = detectReferences(query);
      const { domain } = routeConversation(query, refs, 'LLND Automate');
      expect(domain).toBe('eios-engineering');
    });
  });

  // ─── D. No Regressions on Existing Intents ───────────────────────────────────
  describe('D. No Regressions on Existing Intents', () => {

    it('summarise intent still works for "What is EWO-015?"', () => {
      const refs = detectReferences('What is EWO-015?');
      expect(detectIntent('What is EWO-015?', refs)).toBe('summarise');
    });

    it('execute intent still works', () => {
      const refs = detectReferences('Execute EWO-015');
      expect(detectIntent('Execute EWO-015', refs)).toBe('execute');
    });

    it('show_verification intent still works', () => {
      const refs = detectReferences('Show me its verification');
      expect(detectIntent('Show me its verification', refs)).toBe('show_verification');
    });

    it('show_plan intent still works', () => {
      const refs = detectReferences('Show me its plan');
      expect(detectIntent('Show me its plan', refs)).toBe('show_plan');
    });

    it('show_completion intent still works', () => {
      const refs = detectReferences('Show the completion report');
      expect(detectIntent('Show the completion report', refs)).toBe('show_completion');
    });

    it('compare intent still works', () => {
      const refs = detectReferences('Compare EWO-015 and EWO-016');
      expect(detectIntent('Compare EWO-015 and EWO-016', refs)).toBe('compare');
    });

    it('general intent still works', () => {
      const refs = detectReferences('Hello');
      expect(detectIntent('Hello', refs)).toBe('general');
    });
  });

  // ─── E. Relationship Discovery vs Summarise Disambiguation ──────────────────
  describe('E. Relationship Discovery vs Summarise Disambiguation', () => {

    it('"What is EWO-014.19A?" is summarise, NOT relationship_discovery', () => {
      const refs = detectReferences('What is EWO-014.19A?');
      expect(detectIntent('What is EWO-014.19A?', refs)).toBe('summarise');
    });

    it('"What is related to EWO-014.19A?" is relationship_discovery, NOT summarise', () => {
      const refs = detectReferences('What is related to EWO-014.19A?');
      expect(detectIntent('What is related to EWO-014.19A?', refs)).toBe('relationship_discovery');
    });

    it('"What engineering records are related to EWO-014.19A?" is relationship_discovery', () => {
      const refs = detectReferences('What engineering records are related to EWO-014.19A?');
      expect(detectIntent('What engineering records are related to EWO-014.19A?', refs)).toBe('relationship_discovery');
    });
  });
});
