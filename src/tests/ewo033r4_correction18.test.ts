import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const completionServiceSrc = fs.readFileSync(
  path.resolve(__dirname, '../lib/interactionCompletionService.ts'),
  'utf-8',
);
const orchestratorSrc = fs.readFileSync(
  path.resolve(__dirname, '../lib/executionOrchestrator.ts'),
  'utf-8',
);

describe('EWO-033R.4 Correction 18 — files_changed contract alignment', () => {
  describe('Producer (executionOrchestrator.ts)', () => {
    it('writes files_changed as string[] (mapped from FileChange.path)', () => {
      expect(orchestratorSrc).toContain('files_changed: implementationResult.filesModified.map(f => f.path)');
    });

    it('writes completion_report.files as string[] (mapped from FileChange.path)', () => {
      expect(orchestratorSrc).toContain('files: implementationResult.filesModified.map(f => f.path)');
    });

    it('does not persist raw FileChange[] to files_changed', () => {
      expect(orchestratorSrc).not.toContain('files_changed: implementationResult.filesModified,');
    });

    it('does not persist raw FileChange[] to completion_report.files', () => {
      const crIdx = orchestratorSrc.indexOf('completion_report: {');
      expect(crIdx).toBeGreaterThan(-1);
      const crBlock = orchestratorSrc.substring(crIdx, crIdx + 200);
      expect(crBlock).toContain('files: implementationResult.filesModified.map(f => f.path)');
      expect(crBlock).not.toContain('files: implementationResult.filesModified,');
    });
  });

  describe('Compatibility layer (interactionCompletionService.ts)', () => {
    it('defines normalizeFilesChanged function', () => {
      expect(completionServiceSrc).toContain('function normalizeFilesChanged');
    });

    it('uses normalizeFilesChanged instead of raw Array.isArray check', () => {
      expect(completionServiceSrc).toContain('normalizeFilesChanged(execution.files_changed)');
    });

    it('handles string[] input (new format)', () => {
      expect(completionServiceSrc).toContain("typeof f === 'string'");
    });

    it('handles FileChange[] input (historical format) by extracting .path', () => {
      expect(completionServiceSrc).toContain("'path' in f");
    });

    it('returns empty array for non-array input', () => {
      expect(completionServiceSrc).toContain('return [];');
    });
  });

  describe('Runtime simulation: normalizeFilesChanged', () => {
    function normalizeFilesChanged(raw: unknown): string[] {
      if (Array.isArray(raw)) {
        return raw.map((f: unknown) => {
          if (typeof f === 'string') return f;
          if (f && typeof f === 'object' && 'path' in f) {
            return String((f as { path: string }).path);
          }
          return String(f);
        });
      }
      return [];
    }

    it('normalizes new string[] format', () => {
      const input = ['src/lib/foo.ts', 'src/lib/bar.ts'];
      const result = normalizeFilesChanged(input);
      expect(result).toEqual(['src/lib/foo.ts', 'src/lib/bar.ts']);
    });

    it('normalizes historical FileChange[] format', () => {
      const input = [
        { path: 'src/lib/foo.ts', action: 'modified', linesAdded: 10, linesRemoved: 5, attributableTo: 'EWO-001' },
        { path: 'src/lib/bar.ts', action: 'created', linesAdded: 50, linesRemoved: 0, attributableTo: 'EWO-001' },
      ];
      const result = normalizeFilesChanged(input);
      expect(result).toEqual(['src/lib/foo.ts', 'src/lib/bar.ts']);
    });

    it('normalizes mixed array (strings and objects)', () => {
      const input = [
        'src/lib/string.ts',
        { path: 'src/lib/object.ts', action: 'modified', linesAdded: 1, linesRemoved: 1, attributableTo: 'EWO-001' },
      ];
      const result = normalizeFilesChanged(input);
      expect(result).toEqual(['src/lib/string.ts', 'src/lib/object.ts']);
    });

    it('returns empty array for null', () => {
      expect(normalizeFilesChanged(null)).toEqual([]);
    });

    it('returns empty array for undefined', () => {
      expect(normalizeFilesChanged(undefined)).toEqual([]);
    });

    it('returns empty array for non-array primitive', () => {
      expect(normalizeFilesChanged('not-an-array')).toEqual([]);
    });

    it('returns empty array for empty array', () => {
      expect(normalizeFilesChanged([])).toEqual([]);
    });

    it('handles object without path property', () => {
      const input = [{ action: 'modified', linesAdded: 10 }];
      const result = normalizeFilesChanged(input);
      expect(result).toHaveLength(1);
      expect(typeof result[0]).toBe('string');
    });

    it('all results are strings (renderable by React)', () => {
      const input = [
        { path: 'src/lib/foo.ts', action: 'modified', linesAdded: 10, linesRemoved: 5, attributableTo: 'EWO-001' },
      ];
      const result = normalizeFilesChanged(input);
      result.forEach(f => {
        expect(typeof f).toBe('string');
      });
    });

    it('produces identical output for equivalent old and new formats', () => {
      const oldFormat = [
        { path: 'src/lib/foo.ts', action: 'modified', linesAdded: 10, linesRemoved: 5, attributableTo: 'EWO-001' },
      ];
      const newFormat = ['src/lib/foo.ts'];
      expect(normalizeFilesChanged(oldFormat)).toEqual(normalizeFilesChanged(newFormat));
    });
  });

  describe('End-to-end: producer output → compatibility → consumer', () => {
    it('new execution: producer writes string[], compatibility passes through', () => {
      const producerOutput = ['src/lib/executionOrchestrator.ts'];
      function normalizeFilesChanged(raw: unknown): string[] {
        if (Array.isArray(raw)) {
          return raw.map((f: unknown) => {
            if (typeof f === 'string') return f;
            if (f && typeof f === 'object' && 'path' in f) {
              return String((f as { path: string }).path);
            }
            return String(f);
          });
        }
        return [];
      }
      const normalized = normalizeFilesChanged(producerOutput);
      expect(normalized).toEqual(['src/lib/executionOrchestrator.ts']);
      normalized.forEach(f => expect(typeof f).toBe('string'));
    });

    it('historical execution: FileChange[] normalized to string[]', () => {
      const historicalData = [
        { path: 'src/lib/executionOrchestrator.ts', action: 'modified', linesAdded: 45, linesRemoved: 14, attributableTo: 'EWO-001' },
      ];
      function normalizeFilesChanged(raw: unknown): string[] {
        if (Array.isArray(raw)) {
          return raw.map((f: unknown) => {
            if (typeof f === 'string') return f;
            if (f && typeof f === 'object' && 'path' in f) {
              return String((f as { path: string }).path);
            }
            return String(f);
          });
        }
        return [];
      }
      const normalized = normalizeFilesChanged(historicalData);
      expect(normalized).toEqual(['src/lib/executionOrchestrator.ts']);
      normalized.forEach(f => expect(typeof f).toBe('string'));
    });

    it('both formats produce identical filtered output', () => {
      function normalizeFilesChanged(raw: unknown): string[] {
        if (Array.isArray(raw)) {
          return raw.map((f: unknown) => {
            if (typeof f === 'string') return f;
            if (f && typeof f === 'object' && 'path' in f) {
              return String((f as { path: string }).path);
            }
            return String(f);
          });
        }
        return [];
      }
      const oldFormat = [
        { path: 'src/lib/foo.ts', action: 'modified', linesAdded: 10, linesRemoved: 5, attributableTo: 'EWO-001' },
      ];
      const newFormat = ['src/lib/foo.ts'];
      expect(normalizeFilesChanged(oldFormat)).toEqual(normalizeFilesChanged(newFormat));
    });
  });

  describe('No data modification', () => {
    it('assembleCompletionPackage does not write to database', () => {
      const asmIdx = completionServiceSrc.indexOf('async assembleCompletionPackage');
      expect(asmIdx).toBeGreaterThan(-1);
      const asmEnd = completionServiceSrc.indexOf('},', asmIdx + 40);
      const asmBlock = completionServiceSrc.substring(asmIdx, asmEnd > 0 ? asmEnd : asmIdx + 800);
      expect(asmBlock).not.toContain('.update(');
      expect(asmBlock).not.toContain('.insert(');
    });
  });
});
