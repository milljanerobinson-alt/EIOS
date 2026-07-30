import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

describe('EWO-023R.1R.4 — Bootstrap UX Consolidation & Summary Evidence Consistency', () => {

  // ─── REQ-1: Remove Duplicate Dashboard ───────────────────────────────────────

  describe('REQ-1 — Remove Duplicate Dashboard', () => {
    it('Operational Evidence section is removed', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).not.toContain('Actionable Metrics Grid');
      expect(content).not.toContain('function ActionableMetric');
    });

    it('ActionableMetric component is removed', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).not.toContain('function ActionableMetric');
    });

    it('no duplicate metric cards exist outside ProgressiveExecutionTracker', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      // The page should not render metric cards directly — only via the tracker
      expect(content).not.toContain('ActionableMetric');
      expect(content).not.toContain('grid grid-cols-2 md:grid-cols-4 gap-3');
    });
  });

  // ─── REQ-2: Summary Cards Interactive ─────────────────────────────────────────

  describe('REQ-2 — Summary Cards Interactive', () => {
    it('ProgressiveExecutionTracker accepts onMetricClick prop', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('onMetricClick');
      expect(tracker).toContain('MetricKey');
    });

    it('SummaryCard renders as button when onClick is provided', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('interactive');
      expect(tracker).toContain('<button');
      expect(tracker).toContain('onClick={() => onClick!');
    });

    it('page passes handleMetricClick to ProgressiveExecutionTracker', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('onMetricClick={handleMetricClick}');
    });

    it('handleMetricClick maps all 8 metrics to drill-down types', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain("case 'runtime'");
      expect(content).toContain("case 'completion'");
      expect(content).toContain("case 'discovered'");
      expect(content).toContain("case 'imported'");
      expect(content).toContain("case 'skipped'");
      expect(content).toContain("case 'lineage'");
      expect(content).toContain("case 'memory'");
      expect(content).toContain("case 'health'");
    });

    it('SummaryCard has disabled state for zero-value metrics', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('disabled=');
      expect(tracker).toContain('opacity-50');
    });

    it('SummaryCard has aria-label for accessibility', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('aria-label');
    });

    it('SummaryCard has focus ring styles', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('focus:ring');
      expect(tracker).toContain('focus:outline-none');
    });
  });

  // ─── REQ-3: Single Source of Truth ───────────────────────────────────────────

  describe('REQ-3 — Single Source of Truth', () => {
    it('page has exactly one ProgressiveExecutionTracker instance', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const trackerCount = (content.match(/<ProgressiveExecutionTracker/g) || []).length;
      expect(trackerCount).toBe(1);
    });

    it('no separate metric grid or card section exists', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).not.toContain('grid grid-cols-2 md:grid-cols-4 gap-3');
    });
  });

  // ─── REQ-4: Summary/Detail Reconciliation ─────────────────────────────────────

  describe('REQ-4 — Summary/Detail Reconciliation', () => {
    it('drill-down state carries expectedCount', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('expectedCount');
    });

    it('handleMetricClick passes expectedCount from summary', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('summary.discovered');
      expect(content).toContain('summary.imported');
      expect(content).toContain('summary.skipped');
      expect(content).toContain('summary.lineageLinks');
      expect(content).toContain('summary.memoryEntries');
      expect(content).toContain('summary.healthIssues');
    });
  });

  // ─── REQ-5: Governed Empty States ─────────────────────────────────────────────

  describe('REQ-5 — Governed Empty States', () => {
    it('GovernedEmptyState component exists', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('GovernedEmptyState');
    });

    it('GovernedEmptyState shows expected count and explanation', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('expectedCount');
      expect(content).toContain('explanation');
      expect(content).toContain('reported by the bootstrap');
    });

    it('SkippedRecordsView shows governed explanation with count', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('skipped because they already existed');
      expect(content).toContain('skip count is preserved');
    });

    it('HealthView shows governed explanation with count', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('health issues');
      expect(content).toContain('issue count is preserved');
    });

    it('MemoryView shows governed explanation with count', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('memory entries');
      expect(content).toContain('bootstrap_run_id tag');
    });

    it('LineageView shows governed explanation with count', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('lineage links');
      expect(content).toContain('bootstrap_run_id tag');
    });

    it('DiagnosticsView shows governed explanation with count', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('diagnostic items');
      expect(content).toContain('warning count is preserved');
    });

    it('RecordsView shows governed explanation with count', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('records discovered');
      expect(content).toContain('bootstrap_run_id tag');
    });
  });

  // ─── REQ-6: Execution Details Unchanged ──────────────────────────────────────

  describe('REQ-6 — Execution Details Unchanged', () => {
    it('ExecutionDetailView still shows lifecycle', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('Lifecycle');
      expect(content).toContain('Started');
      expect(content).toContain('Completed');
      expect(content).toContain('Runtime');
    });

    it('ExecutionDetailView still shows phase statistics', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('Phase Statistics');
    });

    it('ExecutionDetailView still shows longest phase', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('Longest Phase');
    });

    it('ExecutionDetailView still shows heartbeat', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('heartbeat');
    });
  });

  // ─── REQ-7: Visual Hierarchy ─────────────────────────────────────────────────

  describe('REQ-7 — Visual Hierarchy', () => {
    it('page structure follows: Header → Tracker → Failure → History', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const headerIdx = content.indexOf('Historical Engineering Bootstrap');
      const trackerIdx = content.indexOf('onMetricClick={handleMetricClick}');
      const historyIdx = content.indexOf('Bootstrap History');

      expect(headerIdx).toBeGreaterThan(-1);
      expect(trackerIdx).toBeGreaterThan(headerIdx);
      expect(historyIdx).toBeGreaterThan(trackerIdx);
    });
  });

  // ─── REQ-8: Platform Standard ─────────────────────────────────────────────────

  describe('REQ-8 — Platform Standard', () => {
    it('ProgressiveExecutionTracker exports MetricKey type for reuse', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('export type MetricKey');
    });

    it('onMetricClick is optional (backward compatible)', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('onMetricClick?:');
    });
  });

  // ─── REQ-9: No Regression ────────────────────────────────────────────────────

  describe('REQ-9 — No Regression', () => {
    it('all drill-down types preserved', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain("'diagnostics'");
      expect(content).toContain("'records'");
      expect(content).toContain("'skipped'");
      expect(content).toContain("'memory'");
      expect(content).toContain("'lineage'");
      expect(content).toContain("'health'");
      expect(content).toContain("'execution'");
    });

    it('all drill-down views preserved', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('DiagnosticsView');
      expect(content).toContain('RecordsView');
      expect(content).toContain('SkippedRecordsView');
      expect(content).toContain('MemoryView');
      expect(content).toContain('LineageView');
      expect(content).toContain('HealthView');
      expect(content).toContain('ExecutionDetailView');
    });

    it('Bootstrap History with expandable entries preserved', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('expandedRun');
      expect(content).toContain('setExpandedRun');
      expect(content).toContain('EvidenceLink');
    });

    it('Bootstrap History evidence links pass expected counts', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('run.artefacts_discovered');
      expect(content).toContain('run.artefacts_skipped');
      expect(content).toContain('run.relationships_reconstructed');
      expect(content).toContain('run.health_issues_detected');
      expect(content).toContain('run.draft_packages_prepared');
    });

    it('drill-down panel with role dialog preserved', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('role="dialog"');
      expect(content).toContain('aria-modal="true"');
    });

    it('keyboard accessibility preserved (buttons, focus, aria)', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('<button');
      expect(tracker).toContain('focus:ring-2');
      expect(tracker).toContain('aria-label');
    });

    it('ProgressiveExecutionTracker still exports all original types', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('export function ProgressiveExecutionTracker');
      expect(tracker).toContain('export function detectStall');
      expect(tracker).toContain('export function computeEstimate');
      expect(tracker).toContain('export interface PhaseDef');
      expect(tracker).toContain('export interface ExecutionSummary');
      expect(tracker).toContain('export interface EstimateInfo');
      expect(tracker).toContain('export interface StallInfo');
      expect(tracker).toContain('export type MetricKey');
    });

    it('no unused imports remain in page', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      // These icons were only used by ActionableMetric which is now removed
      expect(content).not.toContain('Database');
      expect(content).not.toContain('Link2');
      expect(content).not.toContain('Gauge');
      expect(content).not.toContain('TrendingUp');
      expect(content).not.toContain('FileText');
    });
  });
});
