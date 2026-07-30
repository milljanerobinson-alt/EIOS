import { describe, it, expect } from 'vitest';
import { normalizeFilesChanged } from '../lib/interactionCompletionService';

describe('EWO-033R.4 Correction 20 — render-site normalization of filesChanged', () => {
  describe('normalizeFilesChanged export', () => {
    it('is a named export from interactionCompletionService', () => {
      expect(typeof normalizeFilesChanged).toBe('function');
    });
  });

  describe('handles FileChange[] (historical persisted format)', () => {
    it('extracts .path from each FileChange object', () => {
      const fileChanges = [
        { path: 'src/lib/foo.ts', action: 'modified', linesAdded: 10, linesRemoved: 5, attributableTo: 'EWO-001' },
        { path: 'src/lib/bar.ts', action: 'created', linesAdded: 20, linesRemoved: 0, attributableTo: 'EWO-001' },
      ];
      const result = normalizeFilesChanged(fileChanges);
      expect(result).toEqual(['src/lib/foo.ts', 'src/lib/bar.ts']);
    });

    it('produces string[] — no objects remain', () => {
      const fileChanges = [
        { path: 'src/lib/foo.ts', action: 'modified', linesAdded: 10, linesRemoved: 5, attributableTo: 'EWO-001' },
      ];
      const result = normalizeFilesChanged(fileChanges);
      expect(typeof result[0]).toBe('string');
      expect(result[0]).not.toBeInstanceOf(Object);
    });

    it('matches the exact FileChange shape from the live error', () => {
      const liveErrorShape = [
        { path: 'src/lib/executionOrchestrator.ts', action: 'modified', linesAdded: 45, linesRemoved: 14, attributableTo: 'EWO-001' },
      ];
      const result = normalizeFilesChanged(liveErrorShape);
      expect(result).toEqual(['src/lib/executionOrchestrator.ts']);
      expect(typeof result[0]).toBe('string');
    });
  });

  describe('handles string[] (new format)', () => {
    it('passes through string[] unchanged', () => {
      const strings = ['src/lib/foo.ts', 'src/lib/bar.ts'];
      const result = normalizeFilesChanged(strings);
      expect(result).toEqual(strings);
    });
  });

  describe('handles edge cases', () => {
    it('returns [] for null', () => {
      expect(normalizeFilesChanged(null)).toEqual([]);
    });

    it('returns [] for undefined', () => {
      expect(normalizeFilesChanged(undefined)).toEqual([]);
    });

    it('returns [] for non-array', () => {
      expect(normalizeFilesChanged('not an array')).toEqual([]);
    });

    it('handles mixed array of strings and objects', () => {
      const mixed = [
        'src/lib/foo.ts',
        { path: 'src/lib/bar.ts', action: 'created', linesAdded: 5, linesRemoved: 0, attributableTo: 'EWO-002' },
      ];
      const result = normalizeFilesChanged(mixed);
      expect(result).toEqual(['src/lib/foo.ts', 'src/lib/bar.ts']);
    });

    it('handles empty array', () => {
      expect(normalizeFilesChanged([])).toEqual([]);
    });

    it('handles object without .path key', () => {
      const noPath = [{ action: 'modified' }];
      const result = normalizeFilesChanged(noPath);
      expect(result).toEqual(['[object Object]']);
      expect(typeof result[0]).toBe('string');
    });
  });

  describe('all results are string[] — safe for React rendering', () => {
    it('every element is a primitive string for FileChange[] input', () => {
      const fileChanges = [
        { path: 'a.ts', action: 'modified', linesAdded: 1, linesRemoved: 1, attributableTo: 'X' },
        { path: 'b.ts', action: 'created', linesAdded: 2, linesRemoved: 0, attributableTo: 'X' },
      ];
      const result = normalizeFilesChanged(fileChanges);
      result.forEach((item) => {
        expect(typeof item).toBe('string');
      });
    });

    it('every element is a primitive string for mixed input', () => {
      const mixed = [
        'a.ts',
        { path: 'b.ts', action: 'created', linesAdded: 1, linesRemoved: 0, attributableTo: 'X' },
      ];
      const result = normalizeFilesChanged(mixed);
      result.forEach((item) => {
        expect(typeof item).toBe('string');
      });
    });
  });
});

describe('EWO-033R.4 Correction 20 — render-site source audit', () => {
  it('CCAIProductManagerPage normalizes card.filesChanged before passing to CompletionCard', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../pages/ecc/CCAIProductManagerPage.tsx'),
      'utf-8',
    );
    expect(src).toContain('normalizeFilesChanged(card.filesChanged)');
    expect(src).toContain("import { normalizeFilesChanged } from '../../lib/interactionCompletionService'");
  });

  it('ECCExecutionWorkspacePage CompletionTab normalizes report.files', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../pages/ecc/ECCExecutionWorkspacePage.tsx'),
      'utf-8',
    );
    expect(src).toContain('normalizeFilesChanged(report.files)');
    expect(src).toContain("import { normalizeFilesChanged } from '../../lib/interactionCompletionService'");
    expect(src).not.toContain('f.action');
    expect(src).not.toContain('f.path');
  });

  it('engineeringReferenceResolver normalizes files_modified from ewo_completion_reports', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../lib/engineeringReferenceResolver.ts'),
      'utf-8',
    );
    expect(src).toContain('normalizeFilesChanged(reportData.files_modified)');
    expect(src).toContain("import { normalizeFilesChanged } from './interactionCompletionService'");
  });

  it('EngineeringInteractionCards renders {file} as text (no object-child risk)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/EngineeringInteractionCards.tsx'),
      'utf-8',
    );
    expect(src).toContain('{file}');
  });
});
