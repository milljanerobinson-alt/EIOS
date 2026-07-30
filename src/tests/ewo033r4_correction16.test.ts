import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..');

function readSource(rel: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, rel), 'utf-8');
}

/**
 * EWO-033R.4 Correction 16 — Resolve Completion Report tests Contract Mismatch
 *
 * The orchestrator must write completion_report.tests as an array of
 * { name, status, detail } — not as { passed, results }.
 * The completion service must normalize both old (object) and new (array)
 * persisted formats into the canonical CompletionPackage.tests array.
 */
describe('EWO-033R.4 Correction 16 — Completion Report tests Contract', () => {

  // ─── Producer: executionOrchestrator.ts ──────────────────────────────────────

  describe('Producer: executionOrchestrator.ts', () => {
    const src = readSource('lib/executionOrchestrator.ts');

    it('writes tests as an array (not an object with passed/results)', () => {
      const testsIdx = src.indexOf('tests:');
      expect(testsIdx).toBeGreaterThan(-1);
      // Find the tests: line within the completion_report object
      const completionIdx = src.indexOf('completion_report:');
      expect(completionIdx).toBeGreaterThan(-1);
      const completionBlock = src.substring(completionIdx, completionIdx + 600);
      // Must contain tests: followed by a .map() call (array), not { passed:
      expect(completionBlock).toContain('tests:');
      expect(completionBlock).toMatch(/tests:.*\.map\(/);
      expect(completionBlock).not.toMatch(/tests:\s*\{\s*passed:/);
    });

    it('does not persist tests.passed', () => {
      const completionIdx = src.indexOf('completion_report:');
      const completionBlock = src.substring(completionIdx, completionIdx + 600);
      expect(completionBlock).not.toContain('tests.passed');
      expect(completionBlock).not.toMatch(/tests:\s*\{[^}]*passed/);
    });

    it('does not persist tests.results', () => {
      const completionIdx = src.indexOf('completion_report:');
      const completionBlock = src.substring(completionIdx, completionIdx + 600);
      expect(completionBlock).not.toContain('tests.results');
      expect(completionBlock).not.toMatch(/tests:\s*\{[^}]*results/);
    });

    it('maps pass → passed', () => {
      const testsIdx = src.indexOf("t.status === 'pass' ? 'passed'");
      expect(testsIdx).toBeGreaterThan(-1);
    });

    it('maps fail → failed', () => {
      const testsIdx = src.indexOf("t.status === 'fail' ? 'failed'");
      expect(testsIdx).toBeGreaterThan(-1);
    });

    it('maps skip → skipped (else branch)', () => {
      const testsIdx = src.indexOf("'skipped'");
      expect(testsIdx).toBeGreaterThan(-1);
    });

    it('includes name and detail in each test entry', () => {
      const completionIdx = src.indexOf('completion_report:');
      const completionBlock = src.substring(completionIdx, completionIdx + 600);
      expect(completionBlock).toContain('name: t.name');
      expect(completionBlock).toContain('detail: t.detail');
    });
  });

  // ─── Compatibility Layer: interactionCompletionService.ts ───────────────────

  describe('Compatibility layer: interactionCompletionService.ts', () => {
    const src = readSource('lib/interactionCompletionService.ts');

    it('defines normalizeTests function', () => {
      expect(src).toContain('function normalizeTests');
    });

    it('defines mapTestStatus function', () => {
      expect(src).toContain('function mapTestStatus');
    });

    it('handles Array.isArray for new format', () => {
      expect(src).toContain('Array.isArray(raw)');
    });

    it('handles old object format with results property', () => {
      expect(src).toContain("'results'");
      expect(src).toMatch(/'results'\s*in\s*raw/);
    });

    it('returns empty array as fallback', () => {
      expect(src).toMatch(/return\s*\[\s*\]/);
    });

    it('uses normalizeTests instead of raw as-cast', () => {
      expect(src).toContain('normalizeTests(');
      expect(src).not.toContain("?.tests as CompletionPackage['tests']) ?? []");
    });

    it('maps pass → passed in compatibility layer', () => {
      expect(src).toContain("status === 'pass' || status === 'passed'");
      expect(src).toContain("'passed'");
    });

    it('maps fail → failed in compatibility layer', () => {
      expect(src).toContain("status === 'fail' || status === 'failed'");
      expect(src).toContain("'failed'");
    });

    it('maps unknown status → skipped', () => {
      expect(src).toContain("'skipped'");
    });
  });

  // ─── Runtime Simulation: normalizeTests ─────────────────────────────────────

  describe('normalizeTests runtime behavior (simulated)', () => {
    // Replicate the normalizeTests logic for runtime testing
    function mapTestStatus(status: string): 'passed' | 'failed' | 'skipped' {
      if (status === 'pass' || status === 'passed') return 'passed';
      if (status === 'fail' || status === 'failed') return 'failed';
      return 'skipped';
    }

    function normalizeTests(raw: unknown): Array<{ name: string; status: 'passed' | 'failed' | 'skipped'; detail?: string }> {
      if (Array.isArray(raw)) {
        return raw.map((t: { name?: string; status?: string; detail?: string }) => ({
          name: t.name ?? 'Unknown test',
          status: mapTestStatus(t.status ?? 'skipped'),
          detail: t.detail,
        }));
      }
      if (raw && typeof raw === 'object' && 'results' in raw) {
        const results = (raw as { results: unknown }).results;
        if (Array.isArray(results)) {
          return results.map((t: { name?: string; status?: string; detail?: string }) => ({
            name: t.name ?? 'Unknown test',
            status: mapTestStatus(t.status ?? 'skipped'),
            detail: t.detail,
          }));
        }
      }
      return [];
    }

    it('normalizes old object format with populated results', () => {
      const oldFormat = {
        passed: true,
        results: [
          { name: 'test A', status: 'pass', detail: 'OK' },
          { name: 'test B', status: 'fail', detail: 'Assertion failed' },
        ],
      };
      const result = normalizeTests(oldFormat);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'test A', status: 'passed', detail: 'OK' });
      expect(result[1]).toEqual({ name: 'test B', status: 'failed', detail: 'Assertion failed' });
    });

    it('normalizes old object format with empty results', () => {
      const oldFormat = { passed: true, results: [] };
      const result = normalizeTests(oldFormat);
      expect(result).toEqual([]);
    });

    it('normalizes old object format with null results', () => {
      const oldFormat = { passed: false, results: null };
      const result = normalizeTests(oldFormat);
      expect(result).toEqual([]);
    });

    it('normalizes new array format', () => {
      const newFormat = [
        { name: 'test X', status: 'passed', detail: 'OK' },
        { name: 'test Y', status: 'failed', detail: 'Error' },
        { name: 'test Z', status: 'skipped', detail: undefined },
      ];
      const result = normalizeTests(newFormat);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: 'test X', status: 'passed', detail: 'OK' });
      expect(result[1]).toEqual({ name: 'test Y', status: 'failed', detail: 'Error' });
      expect(result[2]).toEqual({ name: 'test Z', status: 'skipped', detail: undefined });
    });

    it('normalizes new array format with old status values (pass/fail/skip)', () => {
      const mixedFormat = [
        { name: 'test 1', status: 'pass' },
        { name: 'test 2', status: 'fail' },
        { name: 'test 3', status: 'skip' },
      ];
      const result = normalizeTests(mixedFormat);
      expect(result).toHaveLength(3);
      expect(result[0].status).toBe('passed');
      expect(result[1].status).toBe('failed');
      expect(result[2].status).toBe('skipped');
    });

    it('returns empty array for null', () => {
      expect(normalizeTests(null)).toEqual([]);
    });

    it('returns empty array for undefined', () => {
      expect(normalizeTests(undefined)).toEqual([]);
    });

    it('returns empty array for non-object primitive', () => {
      expect(normalizeTests('string')).toEqual([]);
      expect(normalizeTests(42)).toEqual([]);
      expect(normalizeTests(true)).toEqual([]);
    });

    it('returns empty array for object without results property', () => {
      expect(normalizeTests({ foo: 'bar' })).toEqual([]);
    });

    it('returns empty array for object with non-array results', () => {
      expect(normalizeTests({ results: 'not an array' })).toEqual([]);
      expect(normalizeTests({ results: { nested: true } })).toEqual([]);
    });

    it('handles missing name in test entries (defaults to Unknown test)', () => {
      const oldFormat = { passed: true, results: [{ status: 'pass' }] };
      const result = normalizeTests(oldFormat);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Unknown test');
    });

    it('handles missing status in test entries (defaults to skipped)', () => {
      const oldFormat = { passed: true, results: [{ name: 'test A' }] };
      const result = normalizeTests(oldFormat);
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('skipped');
    });

    it('produces identical output for equivalent old and new formats', () => {
      const oldFormat = {
        passed: true,
        results: [
          { name: 'test A', status: 'pass', detail: 'OK' },
          { name: 'test B', status: 'fail', detail: 'Failed' },
        ],
      };
      const newFormat = [
        { name: 'test A', status: 'passed', detail: 'OK' },
        { name: 'test B', status: 'failed', detail: 'Failed' },
      ];
      const oldResult = normalizeTests(oldFormat);
      const newResult = normalizeTests(newFormat);
      expect(oldResult).toEqual(newResult);
    });

    it('all entries have .map() available (no crash)', () => {
      const oldFormat = { passed: true, results: [{ name: 'A', status: 'pass' }] };
      const result = normalizeTests(oldFormat);
      expect(() => result.map((t: { name: string; status: string }) => ({ name: t.name, status: t.status }))).not.toThrow();
    });
  });

  // ─── Orchestrator Producer Simulation ───────────────────────────────────────

  describe('Orchestrator producer simulation', () => {
    // Replicate the orchestrator's test mapping logic
    function mapTestStatus(status: string): 'pass' | 'fail' | 'skip' {
      return status as 'pass' | 'fail' | 'skip';
    }

    function produceTests(testResults: Array<{ name: string; status: 'pass' | 'fail' | 'skip'; detail?: string }>) {
      return testResults.map(t => ({
        name: t.name,
        status: t.status === 'pass' ? 'passed' : t.status === 'fail' ? 'failed' : 'skipped',
        detail: t.detail,
      }));
    }

    it('produces an array (not an object)', () => {
      const result = produceTests([{ name: 'test', status: 'pass' }]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('maps pass → passed', () => {
      const result = produceTests([{ name: 'test', status: 'pass' }]);
      expect(result[0].status).toBe('passed');
    });

    it('maps fail → failed', () => {
      const result = produceTests([{ name: 'test', status: 'fail' }]);
      expect(result[0].status).toBe('failed');
    });

    it('maps skip → skipped', () => {
      const result = produceTests([{ name: 'test', status: 'skip' }]);
      expect(result[0].status).toBe('skipped');
    });

    it('produces empty array for no test results', () => {
      const result = produceTests([]);
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('preserves name and detail', () => {
      const result = produceTests([{ name: 'my test', status: 'pass', detail: 'all good' }]);
      expect(result[0].name).toBe('my test');
      expect(result[0].detail).toBe('all good');
    });

    it('output is consumable by .map() without crash', () => {
      const result = produceTests([
        { name: 'A', status: 'pass' },
        { name: 'B', status: 'fail' },
        { name: 'C', status: 'skip' },
      ]);
      expect(() => result.map(t => ({ name: t.name, status: t.status }))).not.toThrow();
      expect(result.map(t => ({ name: t.name, status: t.status }))).toHaveLength(3);
    });
  });

  // ─── End-to-End: Producer → Compatibility Layer → Consumer ──────────────────

  describe('End-to-end: producer → compatibility layer → consumer', () => {
    // Simulate the full pipeline

    function produceTests(testResults: Array<{ name: string; status: 'pass' | 'fail' | 'skip'; detail?: string }>) {
      return testResults.map(t => ({
        name: t.name,
        status: t.status === 'pass' ? 'passed' : t.status === 'fail' ? 'failed' : 'skipped',
        detail: t.detail,
      }));
    }

    function mapTestStatus(status: string): 'passed' | 'failed' | 'skipped' {
      if (status === 'pass' || status === 'passed') return 'passed';
      if (status === 'fail' || status === 'failed') return 'failed';
      return 'skipped';
    }

    function normalizeTests(raw: unknown): Array<{ name: string; status: 'passed' | 'failed' | 'skipped'; detail?: string }> {
      if (Array.isArray(raw)) {
        return raw.map((t: { name?: string; status?: string; detail?: string }) => ({
          name: t.name ?? 'Unknown test',
          status: mapTestStatus(t.status ?? 'skipped'),
          detail: t.detail,
        }));
      }
      if (raw && typeof raw === 'object' && 'results' in raw) {
        const results = (raw as { results: unknown }).results;
        if (Array.isArray(results)) {
          return results.map((t: { name?: string; status?: string; detail?: string }) => ({
            name: t.name ?? 'Unknown test',
            status: mapTestStatus(t.status ?? 'skipped'),
            detail: t.detail,
          }));
        }
      }
      return [];
    }

    function filterCompletion(tests: Array<{ name: string; status: 'passed' | 'failed' | 'skipped'; detail?: string }>) {
      return tests.map(t => ({ name: t.name, status: t.status }));
    }

    it('new execution: producer → compatibility → filter renders without crash', () => {
      const testResults = [
        { name: 'unit test A', status: 'pass' as const, detail: 'OK' },
        { name: 'unit test B', status: 'fail' as const, detail: 'assertion error' },
        { name: 'integration test', status: 'skip' as const },
      ];
      // Producer writes array
      const persisted = produceTests(testResults);
      expect(Array.isArray(persisted)).toBe(true);
      // Compatibility layer reads it back
      const completion = normalizeTests(persisted);
      // Consumer filters it
      expect(() => filterCompletion(completion)).not.toThrow();
      const filtered = filterCompletion(completion);
      expect(filtered).toHaveLength(3);
      expect(filtered[0]).toEqual({ name: 'unit test A', status: 'passed' });
      expect(filtered[1]).toEqual({ name: 'unit test B', status: 'failed' });
      expect(filtered[2]).toEqual({ name: 'integration test', status: 'skipped' });
    });

    it('historical execution: old object → compatibility → filter renders without crash', () => {
      const oldPersisted = {
        passed: true,
        results: [
          { name: 'test A', status: 'pass', detail: 'OK' },
          { name: 'test B', status: 'fail', detail: 'error' },
        ],
      };
      // Compatibility layer reads old format
      const completion = normalizeTests(oldPersisted);
      // Consumer filters it
      expect(() => filterCompletion(completion)).not.toThrow();
      const filtered = filterCompletion(completion);
      expect(filtered).toHaveLength(2);
      expect(filtered[0]).toEqual({ name: 'test A', status: 'passed' });
      expect(filtered[1]).toEqual({ name: 'test B', status: 'failed' });
    });

    it('historical execution with empty results: old object → compatibility → filter', () => {
      const oldPersisted = { passed: true, results: [] };
      const completion = normalizeTests(oldPersisted);
      expect(() => filterCompletion(completion)).not.toThrow();
      expect(filterCompletion(completion)).toEqual([]);
    });

    it('both formats produce identical filtered output for equivalent data', () => {
      const oldFormat = {
        passed: true,
        results: [
          { name: 'test A', status: 'pass' },
          { name: 'test B', status: 'fail' },
          { name: 'test C', status: 'skip' },
        ],
      };
      const newFormat = produceTests([
        { name: 'test A', status: 'pass' },
        { name: 'test B', status: 'fail' },
        { name: 'test C', status: 'skip' },
      ]);
      const oldFiltered = filterCompletion(normalizeTests(oldFormat));
      const newFiltered = filterCompletion(normalizeTests(newFormat));
      expect(oldFiltered).toEqual(newFiltered);
    });
  });

  // ─── Database Evidence: Historical Records ──────────────────────────────────

  describe('Source code: no historical data modification', () => {
    const orchestratorSrc = readSource('lib/executionOrchestrator.ts');
    const completionSrc = readSource('lib/interactionCompletionService.ts');

    it('orchestrator does not contain old object format for tests', () => {
      const completionIdx = orchestratorSrc.indexOf('completion_report:');
      const completionBlock = orchestratorSrc.substring(completionIdx, completionIdx + 600);
      expect(completionBlock).not.toContain('passed:');
      expect(completionBlock).not.toContain('results: implementationResult.testResults');
    });

    it('assembleCompletionPackage does not modify persisted data', () => {
      // The assembleCompletionPackage function only reads and normalizes — no writes
      const asmIdx = completionSrc.indexOf('async assembleCompletionPackage');
      expect(asmIdx).toBeGreaterThan(-1);
      const asmEnd = completionSrc.indexOf('},', asmIdx + 40);
      const asmBlock = completionSrc.substring(asmIdx, asmEnd > 0 ? asmEnd : asmIdx + 800);
      expect(asmBlock).not.toContain('.update(');
      expect(asmBlock).not.toContain('.insert(');
    });
  });
});
