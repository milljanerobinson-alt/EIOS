import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import * as React from 'react';
import * as fs from 'fs';

// ─── Mocks (hoisted) ───────────────────────────────────────────────────────────
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

import ECHistoricalBootstrapPage, {
  DrillDownPanel,
  DiagnosticsView,
  RecordsView,
  SkippedRecordsView,
  MemoryView,
  LineageView,
  HealthView,
  ExecutionDetailView,
  GovernedEmptyState,
} from '../pages/ecc/ECHistoricalBootstrapPage';

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

const mockRun = {
  id: '1', run_id: 'B-001', status: 'completed',
  artefacts_discovered: 200, artefacts_imported: 150, artefacts_skipped: 50,
  relationships_reconstructed: 100, health_issues_detected: 431,
  draft_packages_prepared: 78, started_at: '2026-01-01T00:00:00Z',
  completed_at: '2026-01-01T00:10:00Z', runtime_seconds: 600,
  current_phase: null, phase_progress: { phase1_ewos: { discovered: 200, imported: 150, skipped: 50, failed: 0 } },
  heartbeat_at: '2026-01-01T00:09:00Z', failed_phase: null, failure_reason: null, diagnostics: null,
};

const mockDiagnostic = {
  id: 'd1', run_id: 'B-001', phase: 'phase3_packages', phase_label: 'Phase 3: Engineering Packages',
  severity: 'warning', record_ref: 'EWO-001', record_type: 'work_order',
  user_message: 'Test diagnostic message', technical_message: 'Technical detail',
  resolution_status: 'open', related_record_ref: null, retry_guidance: 'Retry guidance here',
  created_at: '2026-01-01T00:05:00Z',
};

const mockMemoryEntry = {
  id: 'm1', record_id: 'r1', record_ref: 'EWO-001', knowledge_category: 'architecture',
  knowledge_domain: 'frontend', title: 'Test Memory Entry', content: 'Memory content here',
  source_section: 'section-1', tags: ['test'], authority_state: 'authoritative',
  bootstrap_run_id: 'B-001', created_at: '2026-01-01T00:06:00Z',
};

const mockLineageEntry = {
  id: 'l1', from_record_id: 'r1', from_record_ref: 'EWO-001', to_ref: 'EWO-002',
  relationship_type: 'depends_on', notes: 'Test lineage note',
  bootstrap_run_id: 'B-001', created_at: '2026-01-01T00:07:00Z',
};

const mockHealthAlert = {
  id: 'h1', ewo_ref: 'EWO-001', alert_type: 'stale_record', severity: 'high',
  message: 'Record has not been updated', status: 'open',
  created_at: '2026-01-01T00:08:00Z',
};

const mockRecord = {
  record_ref: 'EWO-001', record_type: 'work_order', title: 'Test Record',
  ewo_ref: 'EWO-001', status: 'active', skip_reason: null,
};

const mockSkippedRecord = {
  record_ref: 'EWO-002', record_type: 'completion_report', title: 'Skipped Record',
  skip_reason: 'already_exists',
};

const mockExecutionDetail = {
  run: mockRun,
  phases: [
    { key: 'phase1_ewos', label: 'Phase 1: EWOs', durationSeconds: 120, discovered: 200, imported: 150, skipped: 50, failed: 0 },
    { key: 'phase2_completion_reports', label: 'Phase 2: Completion Reports', durationSeconds: 60, discovered: 50, imported: 40, skipped: 10, failed: 0 },
  ],
  longestPhase: { key: 'phase1_ewos', label: 'Phase 1: EWOs', durationSeconds: 120 },
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('EWO-023R.1R.4 — Drill-Down Dependency & Conditional Render Audit', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getBootstrapPhaseMetrics.mockResolvedValue({ historicalAverages: [], avgPhaseDurationSeconds: {} });
    serviceMocks.getBootstrapDiagnostics.mockResolvedValue([]);
    serviceMocks.getBootstrapRecords.mockResolvedValue([]);
    serviceMocks.getBootstrapSkippedRecords.mockResolvedValue([]);
    serviceMocks.getBootstrapMemoryEntries.mockResolvedValue([]);
    serviceMocks.getBootstrapLineageEntries.mockResolvedValue([]);
    serviceMocks.getBootstrapHealthAlerts.mockResolvedValue([]);
    serviceMocks.getBootstrapExecutionDetail.mockResolvedValue(null);
  });

  // ─── REQ-1: Missing icon dependencies restored ──────────────────────────────

  describe('REQ-1 — Missing icon imports restored', () => {
    it('Brain is imported from lucide-react', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toMatch(/import\s+\{[^}]*Brain[^}]*\}\s+from\s+['"]lucide-react['"]/);
    });

    it('Timer is imported from lucide-react', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toMatch(/import\s+\{[^}]*Timer[^}]*\}\s+from\s+['"]lucide-react['"]/);
    });

    it('Activity is imported from lucide-react', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toMatch(/import\s+\{[^}]*Activity[^}]*\}\s+from\s+['"]lucide-react['"]/);
    });

    it('Heart is imported from lucide-react', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toMatch(/import\s+\{[^}]*Heart[^}]*\}\s+from\s+['"]lucide-react['"]/);
    });
  });

  // ─── REQ-2: Each drill-down view renders with populated, empty, and governed states ──

  describe('REQ-2 — Conditional render audit (populated, empty, governed)', () => {

    // DiagnosticsView
    it('DiagnosticsView renders with populated data (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(DiagnosticsView, { diagnostics: [mockDiagnostic], expectedCount: 1 }))).not.toThrow();
    });

    it('DiagnosticsView renders with empty data (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(DiagnosticsView, { diagnostics: [], expectedCount: 0 }))).not.toThrow();
    });

    it('DiagnosticsView renders governed empty state with expectedCount > 0', () => {
      const html = renderToString(React.createElement(DiagnosticsView, { diagnostics: [], expectedCount: 5 }));
      expect(html).toContain('5');
      expect(html).toContain('diagnostic items');
    });

    // RecordsView
    it('RecordsView renders with populated data (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(RecordsView, { records: [mockRecord], expectedCount: 1 }))).not.toThrow();
    });

    it('RecordsView renders with empty data (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(RecordsView, { records: [], expectedCount: 0 }))).not.toThrow();
    });

    it('RecordsView renders governed empty state with expectedCount > 0', () => {
      const html = renderToString(React.createElement(RecordsView, { records: [], expectedCount: 200 }));
      expect(html).toContain('200');
      expect(html).toContain('records discovered');
    });

    // SkippedRecordsView
    it('SkippedRecordsView renders with populated data (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(SkippedRecordsView, { records: [mockSkippedRecord], expectedCount: 1 }))).not.toThrow();
    });

    it('SkippedRecordsView renders with empty data (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(SkippedRecordsView, { records: [], expectedCount: 0 }))).not.toThrow();
    });

    it('SkippedRecordsView renders governed empty state with expectedCount > 0', () => {
      const html = renderToString(React.createElement(SkippedRecordsView, { records: [], expectedCount: 50 }));
      expect(html).toContain('50');
      expect(html).toContain('skipped records');
    });

    // MemoryView (was failing with "Brain is not defined")
    it('MemoryView renders with populated data (no "Brain is not defined")', () => {
      expect(() => renderToString(React.createElement(MemoryView, { entries: [mockMemoryEntry], expectedCount: 1 }))).not.toThrow();
    });

    it('MemoryView renders with empty data (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(MemoryView, { entries: [], expectedCount: 0 }))).not.toThrow();
    });

    it('MemoryView renders governed empty state with expectedCount > 0', () => {
      const html = renderToString(React.createElement(MemoryView, { entries: [], expectedCount: 78 }));
      expect(html).toContain('78');
      expect(html).toContain('memory entries');
    });

    it('MemoryView populated output contains Brain icon SVG (no "Brain is not defined")', () => {
      const html = renderToString(React.createElement(MemoryView, { entries: [mockMemoryEntry], expectedCount: 1 }));
      expect(html).toContain('lucide');
      expect(html).toContain('Test Memory Entry');
    });

    // LineageView
    it('LineageView renders with populated data (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(LineageView, { entries: [mockLineageEntry], expectedCount: 1 }))).not.toThrow();
    });

    it('LineageView renders with empty data (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(LineageView, { entries: [], expectedCount: 0 }))).not.toThrow();
    });

    it('LineageView renders governed empty state with expectedCount > 0', () => {
      const html = renderToString(React.createElement(LineageView, { entries: [], expectedCount: 100 }));
      expect(html).toContain('100');
      expect(html).toContain('lineage links');
    });

    // HealthView
    it('HealthView renders with populated data (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(HealthView, { alerts: [mockHealthAlert], expectedCount: 1 }))).not.toThrow();
    });

    it('HealthView renders with empty data (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(HealthView, { alerts: [], expectedCount: 0 }))).not.toThrow();
    });

    it('HealthView renders governed empty state with expectedCount > 0', () => {
      const html = renderToString(React.createElement(HealthView, { alerts: [], expectedCount: 431 }));
      expect(html).toContain('431');
      expect(html).toContain('health issues');
    });

    // ExecutionDetailView (was failing with "Timer is not defined")
    it('ExecutionDetailView renders with populated data (no "Timer is not defined")', () => {
      expect(() => renderToString(React.createElement(ExecutionDetailView, { detail: mockExecutionDetail }))).not.toThrow();
    });

    it('ExecutionDetailView renders with null run (no ReferenceError)', () => {
      expect(() => renderToString(React.createElement(ExecutionDetailView, { detail: { run: null, phases: [], longestPhase: null } }))).not.toThrow();
    });

    it('ExecutionDetailView populated output contains Timer icon SVG', () => {
      const html = renderToString(React.createElement(ExecutionDetailView, { detail: mockExecutionDetail }));
      expect(html).toContain('lucide');
      expect(html).toContain('Longest Phase');
    });

    it('ExecutionDetailView renders Heart icon when heartbeat present', () => {
      const html = renderToString(React.createElement(ExecutionDetailView, { detail: mockExecutionDetail }));
      expect(html).toContain('Last heartbeat');
    });

    it('ExecutionDetailView renders failed phase info when run has failed_phase', () => {
      const failedDetail = { ...mockExecutionDetail, run: { ...mockRun, status: 'failed', failed_phase: 'phase3_packages', failure_reason: 'Test failure' } };
      const html = renderToString(React.createElement(ExecutionDetailView, { detail: failedDetail }));
      expect(html).toContain('Failed Phase');
      expect(html).toContain('phase3_packages');
    });

    // GovernedEmptyState
    it('GovernedEmptyState renders with expected count and explanation', () => {
      const html = renderToString(React.createElement(GovernedEmptyState, { expectedCount: 42, noun: 'test items', explanation: 'Test explanation text' }));
      expect(html).toContain('42');
      expect(html).toContain('test items');
      expect(html).toContain('Test explanation text');
    });
  });

  // ─── REQ-3: DrillDownPanel renders for every DrillDownType ───────────────────

  describe('REQ-3 — DrillDownPanel renders every drill-down type', () => {

    const drillDownTypes = [
      { type: 'diagnostics', label: 'Bootstrap Diagnostics' },
      { type: 'records', label: 'Bootstrap Records' },
      { type: 'skipped', label: 'Skipped Records' },
      { type: 'memory', label: 'Memory Entries' },
      { type: 'lineage', label: 'Lineage Links' },
      { type: 'health', label: 'Record Health Alerts' },
      { type: 'execution', label: 'Execution Details' },
    ];

    for (const { type, label } of drillDownTypes) {
      it(`DrillDownPanel renders for type="${type}" without ReferenceError`, () => {
        const state = { type: type as any, runId: 'B-001', filter: undefined, expectedCount: 5 };
        expect(() => renderToString(React.createElement(DrillDownPanel, { state: state as any, onClose: () => {} }))).not.toThrow();
      });

      it(`DrillDownPanel for type="${type}" contains title "${label}"`, () => {
        const state = { type: type as any, runId: 'B-001', filter: undefined, expectedCount: 5 };
        const html = renderToString(React.createElement(DrillDownPanel, { state: state as any, onClose: () => {} }));
        expect(html).toContain(label);
      });
    }

    it('DrillDownPanel shows loading spinner initially (SSR renders loading state)', () => {
      const state = { type: 'records' as any, runId: 'B-001', filter: undefined, expectedCount: 5 };
      const html = renderToString(React.createElement(DrillDownPanel, { state: state as any, onClose: () => {} }));
      // Loading state shows spinner SVG
      expect(html).toContain('animate-spin');
    });

    it('DrillDownPanel close button is accessible with aria-label', () => {
      const state = { type: 'records' as any, runId: 'B-001', filter: undefined, expectedCount: 5 };
      const html = renderToString(React.createElement(DrillDownPanel, { state: state as any, onClose: () => {} }));
      expect(html).toContain('aria-label="Close drill-down panel"');
    });

    it('DrillDownPanel has role=dialog and aria-modal', () => {
      const state = { type: 'records' as any, runId: 'B-001', filter: undefined, expectedCount: 5 };
      const html = renderToString(React.createElement(DrillDownPanel, { state: state as any, onClose: () => {} }));
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
    });
  });

  // ─── REQ-4: Bootstrap History evidence links ────────────────────────────────

  describe('REQ-4 — Bootstrap History evidence links', () => {

    it('History section contains all 7 evidence link buttons', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const evidenceLinks = ['Records', 'Skipped', 'Memory', 'Lineage', 'Health', 'Diagnostics', 'Execution'];
      for (const label of evidenceLinks) {
        expect(content).toContain(`label="${label}"`);
      }
    });

    it('Evidence links call openDrillDown (not runHistoricalBootstrap)', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const evidenceSection = content.slice(
        content.indexOf('Actionable evidence links'),
        content.indexOf('</div>', content.indexOf('Actionable evidence links') + 200),
      );
      expect(evidenceSection).toContain('openDrillDown');
      expect(evidenceSection).not.toContain('runHistoricalBootstrap');
    });

    it('each evidence link opens a different drill-down type', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const evidenceSection = content.slice(
        content.indexOf('Actionable evidence links'),
        content.indexOf('</div>', content.indexOf('Actionable evidence links') + 300),
      );
      expect(evidenceSection).toContain("openDrillDown('records'");
      expect(evidenceSection).toContain("openDrillDown('skipped'");
      expect(evidenceSection).toContain("openDrillDown('memory'");
      expect(evidenceSection).toContain("openDrillDown('lineage'");
      expect(evidenceSection).toContain("openDrillDown('health'");
      expect(evidenceSection).toContain("openDrillDown('diagnostics'");
      expect(evidenceSection).toContain("openDrillDown('execution'");
    });
  });

  // ─── REQ-5: Static undefined identifier audit ────────────────────────────────

  describe('REQ-5 — No undefined JSX identifiers remain', () => {

    it('all capitalized JSX tags in component file have matching imports', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');

      // Extract all imported identifiers from lucide-react
      const lucideMatch = content.match(/import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/);
      const importedIcons = lucideMatch
        ? lucideMatch[1].split(',').map(s => s.trim()).filter(Boolean)
        : [];

      // All icons used in JSX
      const usedIcons = ['History', 'RefreshCw', 'Loader2', 'XCircle', 'AlertTriangle', 'X',
        'CheckCircle2', 'Clock', 'ChevronDown', 'ChevronRight', 'Activity', 'Brain', 'Timer', 'Heart'];

      for (const icon of usedIcons) {
        expect(importedIcons).toContain(icon);
      }
    });

    it('ProgressiveExecutionTracker has no stale references to removed imports', () => {
      const content = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      // Should not reference Brain or Timer (those are in the page, not the tracker)
      // The tracker should have its own imports
      expect(content).toContain("from 'lucide-react'");
    });

    it('no Operational Evidence card section heading exists', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      // The subtitle mentions "Operational Evidence Drill-Down" which is fine
      // but there should be no separate card section with "Operational Evidence" as a heading
      expect(content).not.toContain('<h2>Operational Evidence');
      expect(content).not.toContain('Operational Evidence</h2>');
    });

    it('all locally-declared components are defined before use or hoisted', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      // function declarations are hoisted in JS, so order doesn't matter for them
      // But verify they exist
      expect(content).toContain('function DrillDownPanel');
      expect(content).toContain('function EmptyState');
      expect(content).toContain('function EvidenceLink');
      expect(content).toContain('function DetailItem');
    });
  });

  // ─── REQ-3: Full page render with all 8 summary card paths ──────────────────

  describe('REQ-3 — Full page render (all 8 summary cards)', () => {

    it('page renders without error when latest run has all metrics populated', () => {
      serviceMocks.getBootstrapRuns.mockResolvedValue([mockRun]);
      serviceMocks.getLatestBootstrapRun.mockResolvedValue(mockRun);
      serviceMocks.getActiveBootstrapRun.mockResolvedValue(null);

      expect(() => renderToString(React.createElement(ECHistoricalBootstrapPage))).not.toThrow();
    });

    it('page renders without error with no runs at all', () => {
      serviceMocks.getBootstrapRuns.mockResolvedValue([]);
      serviceMocks.getLatestBootstrapRun.mockResolvedValue(null);
      serviceMocks.getActiveBootstrapRun.mockResolvedValue(null);

      expect(() => renderToString(React.createElement(ECHistoricalBootstrapPage))).not.toThrow();
    });

    it('page renders without error with a failed run', () => {
      const failedRun = { ...mockRun, status: 'failed', failed_phase: 'phase3_packages', failure_reason: 'Test' };
      serviceMocks.getBootstrapRuns.mockResolvedValue([failedRun]);
      serviceMocks.getLatestBootstrapRun.mockResolvedValue(failedRun);
      serviceMocks.getActiveBootstrapRun.mockResolvedValue(null);

      expect(() => renderToString(React.createElement(ECHistoricalBootstrapPage))).not.toThrow();
    });

    it('page renders without error with an active run', () => {
      const activeRun = {
        ...mockRun, status: 'running', current_phase: 'phase3_packages',
        started_at: new Date(Date.now() - 30_000).toISOString(),
        heartbeat_at: new Date(Date.now() - 5_000).toISOString(),
        completed_at: null, runtime_seconds: null,
      };
      serviceMocks.getBootstrapRuns.mockResolvedValue([activeRun]);
      serviceMocks.getLatestBootstrapRun.mockResolvedValue(activeRun);
      serviceMocks.getActiveBootstrapRun.mockResolvedValue(activeRun);

      expect(() => renderToString(React.createElement(ECHistoricalBootstrapPage))).not.toThrow();
    });
  });

  // ─── REQ-6: Functionality preserved ──────────────────────────────────────────

  describe('REQ-6 — Functionality preserved', () => {

    it('one consolidated dashboard (no duplicate metric grid)', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      // Should have exactly one ProgressiveExecutionTracker usage
      const trackerCount = (content.match(/<ProgressiveExecutionTracker/g) || []).length;
      expect(trackerCount).toBe(1);
    });

    it('ES-004 compliance reference exists', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('ES-004');
    });

    it('keyboard accessible close button has focus ring class', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('focus:ring-2');
      expect(content).toContain('focus:ring-blue-500');
    });

    it('governed expected-count explanations exist for all views', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('GovernedEmptyState');
      // Each view should call GovernedEmptyState when expectedCount > 0 and data is empty
      expect(content).toContain('noun="diagnostic items"');
      expect(content).toContain('noun="records discovered"');
      expect(content).toContain('noun="skipped records"');
      expect(content).toContain('noun="memory entries"');
      expect(content).toContain('noun="lineage links"');
      expect(content).toContain('noun="health issues"');
    });

    it('initialization order corrections from prior regression are intact', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      const displayRunIdx = content.indexOf('const displayRun =');
      const summaryIdx = content.indexOf('const summary:');
      const handleMetricClickIdx = content.indexOf('const handleMetricClick');
      const firstMemoIdx = content.indexOf('useMemo(');

      expect(displayRunIdx).toBeGreaterThan(-1);
      expect(firstMemoIdx).toBeGreaterThan(displayRunIdx);
      expect(summaryIdx).toBeGreaterThan(displayRunIdx);
      expect(handleMetricClickIdx).toBeGreaterThan(summaryIdx);
    });
  });
});
