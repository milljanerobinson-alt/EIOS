import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import * as fs from 'fs';
import * as React from 'react';

// ─── Mocks must be hoisted above component import ──────────────────────────────
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    })),
  },
}));

vi.mock('../lib/engineeringRecordsOrchestrator', () => ({ checkRecordHealth: vi.fn() }));
vi.mock('../lib/engineeringChangeLogService', () => ({ recordChangeLogEvent: vi.fn() }));

const mockBootstrapRun = {
  id: '1',
  run_id: 'B-001',
  status: 'completed',
  artefacts_discovered: 200,
  artefacts_imported: 150,
  artefacts_skipped: 50,
  relationships_reconstructed: 100,
  health_issues_detected: 431,
  draft_packages_prepared: 78,
  started_at: '2026-01-01T00:00:00Z',
  completed_at: '2026-01-01T00:10:00Z',
  runtime_seconds: 600,
  current_phase: null,
  phase_progress: {
    phase1_ewos: { discovered: 200, imported: 150, skipped: 50, failed: 0 },
  },
  heartbeat_at: null,
  failed_phase: null,
  failure_reason: null,
  diagnostics: null,
};

const mockFailedRun = {
  ...mockBootstrapRun,
  run_id: 'B-002',
  status: 'failed',
  failed_phase: 'phase3_packages',
  failure_reason: 'Test failure',
  health_issues_detected: 5,
};

const mockActiveRun = {
  ...mockBootstrapRun,
  run_id: 'B-ACTIVE',
  status: 'running',
  current_phase: 'phase3_packages',
  started_at: new Date(Date.now() - 30_000).toISOString(),
  heartbeat_at: new Date(Date.now() - 5_000).toISOString(),
  completed_at: null,
  runtime_seconds: null,
};

const { serviceMocks } = vi.hoisted(() => {
  const m = {
    runHistoricalBootstrap: vi.fn(),
    getBootstrapRuns: vi.fn(),
    getLatestBootstrapRun: vi.fn(),
    getActiveBootstrapRun: vi.fn(),
    abandonBootstrapRun: vi.fn(),
    cancelBootstrapRun: vi.fn(),
    calculateBootstrapCompletion: vi.fn(() => 100),
    getBootstrapPhaseMetrics: vi.fn(),
    getBootstrapDiagnostics: vi.fn(),
    getBootstrapRecords: vi.fn(),
    getBootstrapSkippedRecords: vi.fn(),
    getBootstrapMemoryEntries: vi.fn(),
    getBootstrapLineageEntries: vi.fn(),
    getBootstrapHealthAlerts: vi.fn(),
    getBootstrapExecutionDetail: vi.fn(),
    BOOTSTRAP_PHASES: [
      { key: 'phase1_ewos', label: 'Phase 1: Engineering Work Orders' },
      { key: 'phase2_completion_reports', label: 'Phase 2: Completion Reports' },
      { key: 'phase3_packages', label: 'Phase 3: Engineering Packages' },
      { key: 'phase4_change_log', label: 'Phase 4: Change Log' },
      { key: 'phase5_timeline', label: 'Phase 5: Timeline' },
      { key: 'phase6_standards', label: 'Phase 6: Standards' },
      { key: 'phase7_constitutional', label: 'Phase 7: Constitutional' },
      { key: 'phase8_historical_refs', label: 'Phase 8: Historical References' },
      { key: 'phase9_verifications', label: 'Phase 9: Verifications' },
      { key: 'phase10_lineage', label: 'Phase 10: Lineage' },
      { key: 'phase11_health', label: 'Phase 11: Health' },
      { key: 'phase12_memory', label: 'Phase 12: Memory' },
    ],
  };
  return { serviceMocks: m };
});

vi.mock('../lib/historicalBootstrapService', () => serviceMocks);

import ECHistoricalBootstrapPage from '../pages/ecc/ECHistoricalBootstrapPage';

describe('EWO-023R.1R.4 — Initialization Order & Runtime Render Regression Test', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getBootstrapPhaseMetrics.mockResolvedValue({
      historicalAverages: [],
      avgPhaseDurationSeconds: {},
    });
    serviceMocks.getBootstrapDiagnostics.mockResolvedValue([]);
    serviceMocks.getBootstrapRecords.mockResolvedValue([]);
    serviceMocks.getBootstrapSkippedRecords.mockResolvedValue([]);
    serviceMocks.getBootstrapMemoryEntries.mockResolvedValue([]);
    serviceMocks.getBootstrapLineageEntries.mockResolvedValue([]);
    serviceMocks.getBootstrapHealthAlerts.mockResolvedValue([]);
    serviceMocks.getBootstrapExecutionDetail.mockResolvedValue(null);
  });

  // ─── REQ-4/5: Real component render (SSR) — no TDZ errors ───────────────────

  describe('REQ-5 — Component Render (no TDZ errors)', () => {

    it('renders with no active run and empty history (no TDZ error)', () => {
      serviceMocks.getBootstrapRuns.mockResolvedValue([]);
      serviceMocks.getLatestBootstrapRun.mockResolvedValue(null);
      serviceMocks.getActiveBootstrapRun.mockResolvedValue(null);

      // renderToString executes the full component function synchronously
      expect(() => renderToString(React.createElement(ECHistoricalBootstrapPage))).not.toThrow();
    });

    it('renders with a completed latest run (no TDZ error)', () => {
      serviceMocks.getBootstrapRuns.mockResolvedValue([mockBootstrapRun]);
      serviceMocks.getLatestBootstrapRun.mockResolvedValue(mockBootstrapRun);
      serviceMocks.getActiveBootstrapRun.mockResolvedValue(null);

      // SSR renders synchronously — initial state has latestRun=null, but the
      // component must not throw a TDZ error during render or effect setup
      expect(() => renderToString(React.createElement(ECHistoricalBootstrapPage))).not.toThrow();
    });

    it('renders with a failed latest run (no TDZ error)', () => {
      serviceMocks.getBootstrapRuns.mockResolvedValue([mockFailedRun]);
      serviceMocks.getLatestBootstrapRun.mockResolvedValue(mockFailedRun);
      serviceMocks.getActiveBootstrapRun.mockResolvedValue(null);

      expect(() => renderToString(React.createElement(ECHistoricalBootstrapPage))).not.toThrow();
    });

    it('renders with an active run (no TDZ error)', () => {
      serviceMocks.getBootstrapRuns.mockResolvedValue([mockActiveRun]);
      serviceMocks.getLatestBootstrapRun.mockResolvedValue(mockActiveRun);
      serviceMocks.getActiveBootstrapRun.mockResolvedValue(mockActiveRun);

      expect(() => renderToString(React.createElement(ECHistoricalBootstrapPage))).not.toThrow();
    });

    it('summary cards render as interactive buttons when displayRun is present', () => {
      // Verify via source that summary cards have button elements with aria-labels
      // (SSR can't resolve async data, so we verify the component structure statically)
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('<button');
      expect(tracker).toContain('aria-label');
      expect(tracker).toContain('Inspect');
      expect(tracker).toContain('metricKey');
      expect(tracker).toContain('onClick={() => onClick!');
    });

    it('no duplicate Operational Evidence card section exists in rendered output', () => {
      serviceMocks.getBootstrapRuns.mockResolvedValue([mockBootstrapRun]);
      serviceMocks.getLatestBootstrapRun.mockResolvedValue(mockBootstrapRun);
      serviceMocks.getActiveBootstrapRun.mockResolvedValue(null);

      const html = renderToString(React.createElement(ECHistoricalBootstrapPage));
      // Should not have ActionableMetric or a second metric grid
      expect(html).not.toContain('ActionableMetric');
      // The page subtitle mentions "Operational Evidence Drill-Down" which is fine —
      // we're checking there's no separate card section with that title
      const operationalCardCount = (html.match(/Operational Evidence<\/h2>/g) || []).length;
      expect(operationalCardCount).toBe(0);
    });

    it('Bootstrap History section renders', () => {
      serviceMocks.getBootstrapRuns.mockResolvedValue([mockBootstrapRun]);
      serviceMocks.getLatestBootstrapRun.mockResolvedValue(mockBootstrapRun);
      serviceMocks.getActiveBootstrapRun.mockResolvedValue(null);

      const html = renderToString(React.createElement(ECHistoricalBootstrapPage));
      expect(html).toContain('Bootstrap History');
    });
  });

  // ─── REQ-1: Static audit — no remaining TDZ references ─────────────────────

  describe('REQ-1 — No remaining pre-initialization references', () => {

    it('handleMetricClick is declared after displayRun and summary', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const displayRunIdx = content.indexOf('const displayRun =');
      const summaryIdx = content.indexOf('const summary:');
      const handleMetricClickIdx = content.indexOf('const handleMetricClick');

      expect(displayRunIdx).toBeGreaterThan(-1);
      expect(summaryIdx).toBeGreaterThan(displayRunIdx);
      expect(handleMetricClickIdx).toBeGreaterThan(summaryIdx);
    });

    it('openDrillDown is declared after displayRun', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const displayRunIdx = content.indexOf('const displayRun =');
      const openDrillDownIdx = content.indexOf('const openDrillDown = useCallback');

      expect(openDrillDownIdx).toBeGreaterThan(displayRunIdx);
    });

    it('all useMemo hooks are declared before consuming callbacks', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const lastMemoIdx = content.lastIndexOf('useMemo(');
      const firstCallbackIdx = content.indexOf('const openDrillDown = useCallback');

      expect(firstCallbackIdx).toBeGreaterThan(lastMemoIdx);
    });

    it('phases memo is declared before estimate memo (which consumes it)', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const phasesIdx = content.indexOf('const phases:');
      const estimateIdx = content.indexOf('const estimate:');

      expect(estimateIdx).toBeGreaterThan(phasesIdx);
    });

    it('liveRuntime is declared before summary memo (which consumes it)', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const liveRuntimeIdx = content.indexOf('const liveRuntime =');
      const summaryIdx = content.indexOf('const summary:');

      expect(summaryIdx).toBeGreaterThan(liveRuntimeIdx);
    });

    it('displayRun is declared before any useMemo', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const displayRunIdx = content.indexOf('const displayRun =');
      const firstMemoIdx = content.indexOf('useMemo(');

      expect(firstMemoIdx).toBeGreaterThan(displayRunIdx);
    });

    it('isActive is declared before estimate and stall memos (which consume it)', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const isActiveIdx = content.indexOf('const isActive =');
      const estimateIdx = content.indexOf('const estimate:');
      const stallIdx = content.indexOf('const stall:');

      expect(estimateIdx).toBeGreaterThan(isActiveIdx);
      expect(stallIdx).toBeGreaterThan(isActiveIdx);
    });

    it('heartbeatAgo is declared after displayRun', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const displayRunIdx = content.indexOf('const displayRun =');
      const heartbeatIdx = content.indexOf('const heartbeatAgo =');

      expect(heartbeatIdx).toBeGreaterThan(displayRunIdx);
    });
  });
});
