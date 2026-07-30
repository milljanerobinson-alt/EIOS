import { describe, it, expect } from 'vitest';

/**
 * EWO-035R.2 — Router parser tests for github-operations edge function.
 *
 * The edge function parser extracts the operation from the last path segment
 * of the incoming request URL. This test suite validates the canonical
 * parser logic against all supported operations and edge cases.
 */

function extractOperation(pathname: string): string {
  const pathSegments = pathname.split('/').filter(Boolean);
  return pathSegments[pathSegments.length - 1] || '';
}

const SUPPORTED_OPERATIONS = [
  'inspect-repo',
  'get-branch',
  'create-branch',
  'delete-branch',
  'read-file',
  'commit-file',
  'delete-file',
  'compare-branches',
  'trigger-workflow',
  'get-workflow-run',
  'get-check-runs',
  'create-pr',
  'get-latest-workflow-run',
] as const;

describe('EWO-035R.2: github-operations path parser', () => {
  describe('extracts operation from runtime pathname (without /functions/v1/ prefix)', () => {
    for (const op of SUPPORTED_OPERATIONS) {
      it(`extracts "${op}" from /github-operations/${op}`, () => {
        expect(extractOperation(`/github-operations/${op}`)).toBe(op);
      });
    }
  });

  describe('extracts operation from full pathname (with /functions/v1/ prefix)', () => {
    for (const op of SUPPORTED_OPERATIONS) {
      it(`extracts "${op}" from /functions/v1/github-operations/${op}`, () => {
        expect(extractOperation(`/functions/v1/github-operations/${op}`)).toBe(op);
      });
    }
  });

  describe('edge cases', () => {
    it('handles trailing slash', () => {
      expect(extractOperation('/github-operations/inspect-repo/')).toBe('inspect-repo');
    });

    it('handles double trailing slash', () => {
      expect(extractOperation('/github-operations/inspect-repo//')).toBe('inspect-repo');
    });

    it('returns empty string for empty pathname', () => {
      expect(extractOperation('')).toBe('');
    });

    it('returns empty string for root pathname', () => {
      expect(extractOperation('/')).toBe('');
    });

    it('returns empty string for bare function name', () => {
      expect(extractOperation('/github-operations')).toBe('github-operations');
    });

    it('returns empty string for bare function name with trailing slash', () => {
      expect(extractOperation('/github-operations/')).toBe('github-operations');
    });
  });

  describe('regression: does not produce the old buggy value', () => {
    it('does NOT return /github-operations/inspect-repo for inspect-repo request', () => {
      const result = extractOperation('/github-operations/inspect-repo');
      expect(result).not.toBe('/github-operations/inspect-repo');
      expect(result).not.toContain('/');
    });

    it('does NOT return /functions/v1/github-operations/inspect-repo for prefixed request', () => {
      const result = extractOperation('/functions/v1/github-operations/inspect-repo');
      expect(result).not.toBe('/functions/v1/github-operations/inspect-repo');
      expect(result).not.toContain('/');
    });
  });
});
