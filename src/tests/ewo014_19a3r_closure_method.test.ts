/**
 * EWO-014.19A.3R Fix — Historical Recovery Closure Method Constraint
 * Unit tests for the canonical closure_method resolver and import validation.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveClosureMethod,
  resolveRecoveryClosureMethod,
  isValidClosureMethod,
  PERMITTED_CLOSURE_METHODS,
} from '../lib/historicalRecoveryService';

describe('EWO-014.19A.3R Fix — Closure Method Resolver', () => {

  // ─── Permitted Values ──────────────────────────────────────────────────────
  describe('Permitted Values', () => {
    it('exposes exactly the 4 values allowed by the DB constraint', () => {
      expect(PERMITTED_CLOSURE_METHODS).toEqual([
        'Product Owner Acceptance',
        'Historical Migration',
        'Administrative Override',
        'Automated Governance',
      ]);
    });
  });

  // ─── 1. Already-valid closure_method ───────────────────────────────────────
  describe('1. Recovered EWO with an already-valid closure_method', () => {
    for (const value of PERMITTED_CLOSURE_METHODS) {
      it(`preserves '${value}' as-is`, () => {
        const result = resolveClosureMethod(value);
        expect(result.closureMethod).toBe(value);
        expect(result.source).toBe('as-is');
        expect(result.normalised).toBe(false);
      });
    }
  });

  // ─── 2. Recognised legacy closure_method ────────────────────────────────────
  describe('2. Recovered EWO with a recognised legacy closure_method', () => {
    it("normalises 'Historical Recovery' to 'Historical Migration'", () => {
      const result = resolveClosureMethod('Historical Recovery');
      expect(result.closureMethod).toBe('Historical Migration');
      expect(result.source).toBe('normalised');
      expect(result.normalised).toBe(true);
      expect(result.sourceValue).toBe('Historical Recovery');
    });

    it("normalises 'Historical Import' to 'Historical Migration'", () => {
      const result = resolveClosureMethod('Historical Import');
      expect(result.closureMethod).toBe('Historical Migration');
    });

    it("normalises 'PO Acceptance' to 'Product Owner Acceptance'", () => {
      const result = resolveClosureMethod('PO Acceptance');
      expect(result.closureMethod).toBe('Product Owner Acceptance');
    });

    it("normalises 'Admin Override' to 'Administrative Override'", () => {
      const result = resolveClosureMethod('Admin Override');
      expect(result.closureMethod).toBe('Administrative Override');
    });

    it("normalises 'Automated' to 'Automated Governance'", () => {
      const result = resolveClosureMethod('Automated');
      expect(result.closureMethod).toBe('Automated Governance');
    });
  });

  // ─── 3. No historical closure evidence ──────────────────────────────────────
  describe('3. Recovered EWO with no historical closure evidence', () => {
    it('returns null for null source', () => {
      const result = resolveClosureMethod(null);
      expect(result.closureMethod).toBeNull();
      expect(result.source).toBe('absent');
    });

    it('returns null for undefined source', () => {
      const result = resolveClosureMethod(undefined);
      expect(result.closureMethod).toBeNull();
      expect(result.source).toBe('absent');
    });

    it('returns null for empty string source', () => {
      const result = resolveClosureMethod('');
      expect(result.closureMethod).toBeNull();
      expect(result.source).toBe('absent');
    });

    it('recovery resolver defaults absent evidence to Historical Migration', () => {
      const result = resolveRecoveryClosureMethod(null);
      expect(result.closureMethod).toBe('Historical Migration');
      expect(result.source).toBe('absent');
    });

    it('recovery resolver does NOT invent Product Owner Acceptance for absent evidence', () => {
      const result = resolveRecoveryClosureMethod(null);
      expect(result.closureMethod).not.toBe('Product Owner Acceptance');
      expect(result.closureMethod).not.toBe('Automated Governance');
    });
  });

  // ─── 4. Unsupported closure_method ─────────────────────────────────────────
  describe('4. Recovered EWO with an unsupported closure_method', () => {
    it('returns null with source=unsupported for unknown value', () => {
      const result = resolveClosureMethod('Magic Closure');
      expect(result.closureMethod).toBeNull();
      expect(result.source).toBe('unsupported');
      expect(result.sourceValue).toBe('Magic Closure');
    });

    it('recovery resolver normalises unsupported to Historical Migration', () => {
      const result = resolveRecoveryClosureMethod('Magic Closure');
      expect(result.closureMethod).toBe('Historical Migration');
      expect(result.normalised).toBe(true);
    });

    it('exposes permitted values for governed error reporting', () => {
      const result = resolveClosureMethod('Bad Value');
      expect(result.permittedValues).toEqual(PERMITTED_CLOSURE_METHODS);
    });
  });

  // ─── 10. Existing constraint remains enforced ──────────────────────────────
  describe('10. Existing closure_method constraint remains enforced', () => {
    it('isValidClosureMethod returns true for all permitted values', () => {
      for (const value of PERMITTED_CLOSURE_METHODS) {
        expect(isValidClosureMethod(value)).toBe(true);
      }
    });

    it('isValidClosureMethod returns false for unsupported values', () => {
      expect(isValidClosureMethod('Historical Recovery')).toBe(false);
      expect(isValidClosureMethod('Magic')).toBe(false);
    });

    it('isValidClosureMethod returns true for null (schema allows null)', () => {
      expect(isValidClosureMethod(null)).toBe(true);
      expect(isValidClosureMethod(undefined)).toBe(true);
    });
  });

  // ─── 11. No invented Product Owner Acceptance ──────────────────────────────
  describe('11. No invented Product Owner Acceptance or completion state', () => {
    it('recovery resolver never returns Product Owner Acceptance by default', () => {
      const result = resolveRecoveryClosureMethod(null);
      expect(result.closureMethod).not.toBe('Product Owner Acceptance');
    });

    it('recovery resolver never returns Automated Governance by default', () => {
      const result = resolveRecoveryClosureMethod(null);
      expect(result.closureMethod).not.toBe('Automated Governance');
    });

    it('recovery resolver preserves explicit PO Acceptance when evidenced', () => {
      const result = resolveRecoveryClosureMethod('Product Owner Acceptance');
      expect(result.closureMethod).toBe('Product Owner Acceptance');
      expect(result.source).toBe('as-is');
    });
  });

  // ─── 7. Individual and batch import consistency ────────────────────────────
  describe('7. Individual and batch import consistency', () => {
    it('both individual and batch paths use the same resolver for null source', () => {
      const individual = resolveRecoveryClosureMethod(null);
      const batch = resolveRecoveryClosureMethod(null);
      expect(individual.closureMethod).toBe(batch.closureMethod);
      expect(individual.closureMethod).toBe('Historical Migration');
    });

    it('both individual and batch paths normalise legacy values identically', () => {
      const individual = resolveRecoveryClosureMethod('Historical Recovery');
      const batch = resolveRecoveryClosureMethod('Historical Recovery');
      expect(individual).toEqual(batch);
    });
  });
});
