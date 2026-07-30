import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..');

function readFile(rel: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, rel), 'utf-8');
}

function listFiles(dir: string, ext: string[]): string[] {
  const result: string[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (ext.some(e => entry.name.endsWith(e))) result.push(full);
    }
  }
  walk(dir);
  return result;
}

const SOURCE_FILES = listFiles(SRC_ROOT, ['.ts', '.tsx']).filter(f => !f.includes('correction12.test'));

describe('EWO-033R.4 Correction 12 — Schema Reference Audit', () => {

  describe('Task 1: ai_provider_configs column names', () => {
    it('no source file queries ai_provider_configs with provider_name column', () => {
      const violations: string[] = [];
      for (const file of SOURCE_FILES) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes("ai_provider_configs") && content.includes("provider_name")) {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('ai_provider_configs')) {
              for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 10); j++) {
                if (lines[j].includes('provider_name')) {
                  violations.push(`${file}:${j + 1}`);
                }
              }
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('no source file queries ai_provider_configs with is_active filter', () => {
      const violations: string[] = [];
      for (const file of SOURCE_FILES) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes("ai_provider_configs") && content.includes("is_active")) {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('ai_provider_configs')) {
              for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 10); j++) {
                if (lines[j].includes('is_active')) {
                  violations.push(`${file}:${j + 1}`);
                }
              }
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('executionReadinessValidator uses provider and is_enabled', () => {
      const content = readFile('lib/executionReadinessValidator.ts');
      expect(content).toContain(".eq('provider', provider)");
      expect(content).toContain(".eq('is_enabled', true)");
      expect(content).toContain("'id, provider, is_enabled'");
    });

    it('interactionExecutionService uses provider and is_enabled', () => {
      const content = readFile('lib/interactionExecutionService.ts');
      expect(content).toContain(".eq('provider', provider)");
      expect(content).toContain(".eq('is_enabled', true)");
      expect(content).toContain("'id, provider, is_enabled'");
    });

    it('codexCredentialService already uses canonical columns', () => {
      const content = readFile('lib/codex/codexCredentialService.ts');
      expect(content).toContain(".eq('provider', 'openai')");
      expect(content).toContain("'provider, is_enabled, has_api_key, health_status'");
    });

    it('aiProviderManager already uses canonical columns', () => {
      const content = readFile('lib/aiProviderManager.ts');
      expect(content).toContain(".eq('is_enabled', true)");
    });
  });

  describe('Task 2: product_features table name', () => {
    it('no source file references bare product_features table', () => {
      const violations: string[] = [];
      for (const file of SOURCE_FILES) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes("'product_features'") || content.includes('"product_features"')) {
          violations.push(file);
        }
      }
      expect(violations).toEqual([]);
    });

    it('constitutionalEngine uses ecc_product_features', () => {
      const content = readFile('lib/constitutionalEngine.ts');
      expect(content).toContain("'ecc_product_features'");
    });

    it('pisService uses ecc_product_features', () => {
      const content = readFile('lib/pisService.ts');
      expect(content).toContain("'ecc_product_features'");
    });

    it('eipService uses ecc_product_features', () => {
      const content = readFile('lib/eipService.ts');
      expect(content).toContain("'ecc_product_features'");
    });
  });

  describe('Task 3: engineering_standards table name', () => {
    it('no source file references bare engineering_standards table', () => {
      const violations: string[] = [];
      for (const file of SOURCE_FILES) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes("'engineering_standards'") || content.includes('"engineering_standards"')) {
          violations.push(file);
        }
      }
      expect(violations).toEqual([]);
    });

    it('constitutionalEngine uses ecc_engineering_standards', () => {
      const content = readFile('lib/constitutionalEngine.ts');
      expect(content).toContain("'ecc_engineering_standards'");
    });

    it('engineeringContextBuilder uses ecc_engineering_standards', () => {
      const content = readFile('lib/engineeringContextBuilder.ts');
      expect(content).toContain("'ecc_engineering_standards'");
    });

    it('engineeringIntelligenceRetrieval uses ecc_engineering_standards', () => {
      const content = readFile('lib/engineeringIntelligenceRetrieval.ts');
      expect(content).toContain("'ecc_engineering_standards'");
    });

    it('engineeringNavigationService uses ecc_engineering_standards', () => {
      const content = readFile('lib/engineeringNavigationService.ts');
      expect(content).toContain("'ecc_engineering_standards'");
    });

    it('ECCConstitutionalExecutionWizard uses ecc_engineering_standards', () => {
      const content = readFile('pages/ecc/ECCConstitutionalExecutionWizard.tsx');
      expect(content).toContain("'ecc_engineering_standards'");
    });

    it('atdConnect inspectionServices already uses ecc_engineering_standards', () => {
      const content = readFile('lib/atdConnect/inspectionServices.ts');
      expect(content).toContain("'ecc_engineering_standards'");
    });
  });

  describe('Task 3: engineering_standards column corrections', () => {
    it('constitutionalEngine does not use standard_ref or content columns', () => {
      const content = readFile('lib/constitutionalEngine.ts');
      const standardsSection = content.slice(
        content.indexOf('ecc_engineering_standards') - 200,
        content.indexOf('ecc_engineering_standards') + 500,
      );
      expect(standardsSection).not.toContain('standard_ref');
      expect(standardsSection).not.toContain('.content');
      expect(standardsSection).toContain("'id, title, body, status'");
    });

    it('engineeringContextBuilder does not use standard_ref or description', () => {
      const content = readFile('lib/engineeringContextBuilder.ts');
      const standardsSection = content.slice(
        content.indexOf('ecc_engineering_standards') - 200,
        content.indexOf('ecc_engineering_standards') + 500,
      );
      expect(standardsSection).not.toContain('standard_ref');
      expect(standardsSection).not.toContain('s.description');
      expect(standardsSection).toContain("'id, title, body, category'");
    });

    it('engineeringIntelligenceRetrieval does not use standard_ref or description', () => {
      const content = readFile('lib/engineeringIntelligenceRetrieval.ts');
      const standardsSection = content.slice(
        content.indexOf('ecc_engineering_standards') - 200,
        content.indexOf('ecc_engineering_standards') + 500,
      );
      expect(standardsSection).not.toContain('standard_ref');
      expect(standardsSection).not.toContain('s.description');
      expect(standardsSection).toContain("'id, title, body, created_at'");
    });
  });

  describe('Task 9: error-handling classifications unchanged', () => {
    it('executionReadinessValidator still classifies provider check as optional', () => {
      const content = readFile('lib/executionReadinessValidator.ts');
      expect(content).toContain("'optional'");
      expect(content).toContain("'Provider Available'");
    });

    it('interactionExecutionService still treats provider validation as best-effort', () => {
      const content = readFile('lib/interactionExecutionService.ts');
      expect(content).toContain('Non-fatal');
      expect(content).toContain('best-effort');
    });
  });

  describe('Task 10: production build includes corrected references', () => {
    const DIST_BUNDLE = path.resolve(__dirname, '../../dist/assets/index-lPnTA0G8.js');

    it('bundle contains ecc_engineering_standards', () => {
      if (!fs.existsSync(DIST_BUNDLE)) return; // skip if build not present
      const bundle = fs.readFileSync(DIST_BUNDLE, 'utf-8');
      expect(bundle).toContain('ecc_engineering_standards');
    });

    it('bundle contains is_enabled for ai_provider_configs', () => {
      if (!fs.existsSync(DIST_BUNDLE)) return;
      const bundle = fs.readFileSync(DIST_BUNDLE, 'utf-8');
      expect(bundle).toContain('is_enabled');
    });

    it('bundle does not contain stale engineering_standards query', () => {
      if (!fs.existsSync(DIST_BUNDLE)) return;
      const bundle = fs.readFileSync(DIST_BUNDLE, 'utf-8');
      expect(bundle).not.toContain("from('engineering_standards')");
      expect(bundle).not.toContain('from("engineering_standards")');
    });
  });
});
