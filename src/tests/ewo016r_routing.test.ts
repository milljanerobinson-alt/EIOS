/**
 * EWO-016R — Conversation Context Routing & EIOS Engineering Priority
 * Unit tests for the Conversation Context Router
 */

import { describe, it, expect } from 'vitest';
import {
  detectReferences,
  detectIntent,
  routeConversation,
  type CanonicalDomain,
} from '../lib/conversationContextRouter';

describe('EWO-016R — Conversation Context Router', () => {

  // ─── A. Reference Detection ────────────────────────────────────────────────
  describe('A. Reference Detection', () => {

    it('detects EWO-015', () => {
      const refs = detectReferences('What is EWO-015?');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('EWO');
      expect(refs[0].canonical).toBe('EWO-015');
    });

    it('detects ewo-015 (lowercase)', () => {
      const refs = detectReferences('What is ewo-015?');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('EWO');
      expect(refs[0].canonical).toBe('EWO-015');
    });

    it('detects Ewo-015 (mixed case)', () => {
      const refs = detectReferences('What is Ewo-015?');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('EWO');
      expect(refs[0].canonical).toBe('EWO-015');
    });

    it('detects EWO-014.19A.3 (compound ref)', () => {
      const refs = detectReferences('Review EWO-014.19A.3');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('EWO');
      expect(refs[0].canonical).toBe('EWO-014.19A.3');
    });

    it('detects EXEC-001', () => {
      const refs = detectReferences('Execute EXEC-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('EXEC');
    });

    it('detects REC-007', () => {
      const refs = detectReferences('Show REC-007');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('REC');
    });

    it('detects IDEA-001', () => {
      const refs = detectReferences('Review IDEA-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('IDEA');
    });

    it('detects INTENT-001', () => {
      const refs = detectReferences('Check INTENT-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('INTENT');
    });

    it('detects PLAN-001', () => {
      const refs = detectReferences('Show PLAN-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('PLAN');
    });

    it('detects ES-001', () => {
      const refs = detectReferences('Reference ES-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('ES');
    });

    it('detects AMD-001', () => {
      const refs = detectReferences('Check AMD-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('AMD');
    });

    it('detects VS-20260719-001', () => {
      const refs = detectReferences('Show VS-20260719-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('VS');
    });

    it('detects AUD-001', () => {
      const refs = detectReferences('Review AUD-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('AUD');
    });

    it('detects RC-001', () => {
      const refs = detectReferences('Show RC-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('RC');
    });

    it('detects ECR-001', () => {
      const refs = detectReferences('Review ECR-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('ECR');
    });

    it('detects TP-001', () => {
      const refs = detectReferences('Show TP-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('TP');
    });

    it('detects EIG-001', () => {
      const refs = detectReferences('Review EIG-001');
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('EIG');
    });

    it('detects multiple references', () => {
      const refs = detectReferences('Compare EWO-015 and EWO-016');
      expect(refs).toHaveLength(2);
    });

    it('deduplicates repeated references', () => {
      const refs = detectReferences('EWO-015 and EWO-015 again');
      expect(refs).toHaveLength(1);
    });

    it('returns empty array for no references', () => {
      const refs = detectReferences('What is the weather?');
      expect(refs).toHaveLength(0);
    });
  });

  // ─── B. Intent Detection ───────────────────────────────────────────────────
  describe('B. Intent Detection', () => {

    it('detects summarise intent for "What is EWO-015?"', () => {
      const refs = detectReferences('What is EWO-015?');
      expect(detectIntent('What is EWO-015?', refs)).toBe('summarise');
    });

    it('detects execute intent for "Execute EWO-015"', () => {
      const refs = detectReferences('Execute EWO-015');
      expect(detectIntent('Execute EWO-015', refs)).toBe('execute');
    });

    it('detects show_verification intent', () => {
      const text = 'Show me its verification';
      const refs = detectReferences(text);
      expect(detectIntent(text, refs)).toBe('show_verification');
    });

    it('detects show_plan intent', () => {
      const text = 'Show me its plan';
      const refs = detectReferences(text);
      expect(detectIntent(text, refs)).toBe('show_plan');
    });

    it('detects show_completion intent', () => {
      const text = 'Show the completion report';
      const refs = detectReferences(text);
      expect(detectIntent(text, refs)).toBe('show_completion');
    });

    it('detects compare intent', () => {
      const text = 'Compare EWO-015 and EWO-016';
      const refs = detectReferences(text);
      expect(detectIntent(text, refs)).toBe('compare');
    });

    it('detects general intent for plain questions', () => {
      const text = 'What is the weather?';
      const refs = detectReferences(text);
      expect(detectIntent(text, refs)).toBe('general');
    });
  });

  // ─── C. Routing Precedence (Requirement 3) ─────────────────────────────────
  describe('C. Routing Precedence', () => {

    it('routes EWO-015 to EIOS Engineering (Precedence 1)', () => {
      const refs = detectReferences('What is EWO-015?');
      const { domain, rule } = routeConversation('What is EWO-015?', refs, 'LLND Automate');
      expect(domain).toBe('eios-engineering');
      expect(rule).toBe('explicit-canonical-engineering-reference');
    });

    it('routes ewo-015 to EIOS Engineering (case insensitive)', () => {
      const refs = detectReferences('What is ewo-015?');
      const { domain } = routeConversation('What is ewo-015?', refs, 'LLND Automate');
      expect(domain).toBe('eios-engineering');
    });

    it('routes "Execute EWO-015" to EIOS Engineering', () => {
      const refs = detectReferences('Execute EWO-015');
      const { domain } = routeConversation('Execute EWO-015', refs, 'LLND Automate');
      expect(domain).toBe('eios-engineering');
    });

    it('routes "Show REC-007" to EIOS Engineering', () => {
      const refs = detectReferences('Show REC-007');
      const { domain } = routeConversation('Show REC-007', refs, 'LLND Automate');
      expect(domain).toBe('eios-engineering');
    });

    it('active LLND Automate workspace does NOT override an EWO reference', () => {
      const refs = detectReferences('What is EWO-015?');
      const { domain } = routeConversation('What is EWO-015?', refs, 'LLND Automate');
      expect(domain).toBe('eios-engineering');
      expect(domain).not.toBe('active-product');
    });

    it('routes explicit engineering intent without reference to EIOS Engineering (Precedence 2)', () => {
      const refs = detectReferences('Prepare execution for the latest EWO');
      const { domain, rule } = routeConversation('Prepare execution for the latest EWO', refs, 'LLND Automate');
      expect(domain).toBe('eios-engineering');
      expect(rule).toBe('explicit-engineering-action-intent');
    });

    it('routes general LLND Automate questions to active-product', () => {
      const refs = detectReferences('How does the assessment feature work?');
      const { domain } = routeConversation('How does the assessment feature work?', refs, 'LLND Automate');
      expect(domain).toBe('active-product');
    });

    it('routes candidate questions to candidate domain', () => {
      const refs = detectReferences('How do I enrol a candidate?');
      const { domain } = routeConversation('How do I enrol a candidate?', refs, 'LLND Automate');
      expect(domain).toBe('candidate');
    });

    it('routes admin questions to platform-admin domain', () => {
      const refs = detectReferences('How do I manage user roles?');
      const { domain } = routeConversation('How do I manage user roles?', refs, null);
      expect(domain).toBe('platform-admin');
    });

    it('routes general questions to general fallback', () => {
      const refs = detectReferences('Hello, how are you?');
      const { domain } = routeConversation('Hello, how are you?', refs, null);
      expect(domain).toBe('general');
    });

    it('routes project references to project domain (Precedence 3)', () => {
      const refs = detectReferences('Show me the roadmap for phase 12');
      const { domain } = routeConversation('Show me the roadmap for phase 12', refs, null);
      expect(domain).toBe('project');
    });
  });

  // ─── D. Engineering Reference Priority (Requirement 2) ─────────────────────
  describe('D. Engineering Reference Priority', () => {

    const engineeringRefTypes: EngineeringRefType[] = [
      'EWO', 'EXEC', 'ER', 'REC', 'IDEA', 'INTENT', 'PLAN',
      'ES', 'AMD', 'VS', 'AUD', 'RC', 'ECR', 'TP', 'EIG',
    ];

    for (const type of engineeringRefTypes) {
      it(`${type} reference routes to EIOS Engineering`, () => {
        const sample = type === 'VS' ? `${type}-20260719-001` : `${type}-001`;
        const refs = detectReferences(`What is ${sample}?`);
        expect(refs.length).toBeGreaterThan(0);
        const { domain } = routeConversation(`What is ${sample}?`, refs, 'LLND Automate');
        expect(domain).toBe('eios-engineering');
      });
    }
  });

  // ─── E. Conversation Focus Retention ───────────────────────────────────────
  describe('E. Conversation Focus Retention', () => {

    it('"Execute it" after EWO-015 focus retains EIOS Engineering via intent', () => {
      // "Execute it" has no reference but has engineering action intent
      const refs = detectReferences('Execute it');
      const { domain } = routeConversation('Execute it', refs, 'LLND Automate');
      expect(domain).toBe('eios-engineering');
    });

    it('"Show me its verification" retains EIOS Engineering via intent', () => {
      const refs = detectReferences('Show me its verification');
      const { domain } = routeConversation('Show me its verification', refs, 'LLND Automate');
      expect(domain).toBe('eios-engineering');
    });
  });

  // ─── F. No Regressions ──────────────────────────────────────────────────────
  describe('F. No Regressions', () => {

    it('general questions still use general fallback', () => {
      const refs = detectReferences('What is the meaning of life?');
      const { domain } = routeConversation('What is the meaning of life?', refs, null);
      expect(domain).toBe('general');
    });

    it('LLND Automate product questions still use active-product', () => {
      const refs = detectReferences('How does billing work?');
      const { domain } = routeConversation('How does billing work?', refs, 'LLND Automate');
      expect(domain).toBe('active-product');
    });

    it('candidate questions still use candidate domain', () => {
      const refs = detectReferences('How do I add a candidate?');
      const { domain } = routeConversation('How do I add a candidate?', refs, 'LLND Automate');
      expect(domain).toBe('candidate');
    });
  });
});

// Import type for the loop above
import type { EngineeringRefType } from '../lib/conversationContextRouter';
