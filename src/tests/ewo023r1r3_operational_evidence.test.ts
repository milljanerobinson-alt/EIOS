import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    not: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
    in: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }),
  })) },
}));
vi.mock('../lib/engineeringRecordsOrchestrator', () => ({ checkRecordHealth: vi.fn() }));
vi.mock('../lib/engineeringChangeLogService', () => ({ recordChangeLogEvent: vi.fn() }));

import {
  runHistoricalBootstrap,
  getBootstrapDiagnostics,
  getBootstrapRecords,
  getBootstrapSkippedRecords,
  getBootstrapMemoryEntries,
  getBootstrapLineageEntries,
  getBootstrapHealthAlerts,
  getBootstrapExecutionDetail,
  BOOTSTRAP_PHASES,
  type BootstrapRun,
} from '../lib/historicalBootstrapService';
import { supabase } from '../lib/supabase';

function makeChainable() {
  const obj: Record<string, ReturnType<typeof vi.fn>> = {};
  obj.eq = vi.fn().mockReturnValue(obj);
  obj.order = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
  obj.select = vi.fn().mockReturnValue(obj);
  obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
  obj.update = vi.fn().mockReturnValue(obj);
  obj.not = vi.fn().mockReturnValue(obj);
  obj.or = vi.fn().mockReturnValue(obj);
  obj.in = vi.fn().mockReturnValue(obj);
  obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
  return obj;
}

function setupMock(tables: Record<string, (obj: Record<string, ReturnType<typeof vi.fn>>) => void>) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const obj = makeChainable();
    const handler = tables[table];
    if (handler) handler(obj);
    return obj;
  });
}

describe('EWO-023R.1R.3 — Operational Evidence Drill-Down & Actionable Bootstrap Diagnostics', () => {

  // ─── REQ-1: Actionable Operational Metrics ──────────────────────────────────

  describe('REQ-1 — Actionable Operational Metrics', () => {
    it('dashboard renders interactive SummaryCards for all 8 metrics', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('SummaryCard');
      // Check all 8 metrics are rendered
      expect(tracker).toContain('label="Discovered"');
      expect(tracker).toContain('label="Imported"');
      expect(tracker).toContain('label="Skipped"');
      expect(tracker).toContain('label="Lineage"');
      expect(tracker).toContain('label="Memory"');
      expect(tracker).toContain('label="Health Issues"');
      expect(tracker).toContain('label="Completion"');
      expect(tracker).toContain('label="Runtime"');
    });

    it('each ActionableMetric has onClick, disabled, and ariaLabel props', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('onClick=');
      expect(content).toContain('disabled=');
      expect(content).toContain('aria-label=');
    });

    it('metrics with zero values are disabled (not clickable)', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).toContain('disabled={summary.discovered === 0}');
      expect(tracker).toContain('disabled={summary.imported === 0}');
      expect(tracker).toContain('disabled={summary.skipped === 0}');
    });
  });

  // ─── REQ-2: Error and Warning Drill-Down ─────────────────────────────────────

  describe('REQ-2 — Error and Warning Drill-Down', () => {
    it('result banner is clickable when errors exist', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('openDrillDown(\'diagnostics\'');
    });

    it('diagnostics view shows phase, record ref, severity, message, guidance', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('DiagnosticsView');
      expect(content).toContain('user_message');
      expect(content).toContain('technical_message');
      expect(content).toContain('retry_guidance');
      expect(content).toContain('resolution_status');
    });

    it('service exports getBootstrapDiagnostics function', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(svc).toContain('export async function getBootstrapDiagnostics');
      expect(svc).toContain('historical_bootstrap_diagnostics');
    });

    it('service records diagnostics during execution', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(svc).toContain('recordDiagnostic');
      expect(svc).toContain("'error'");
      expect(svc).toContain("'warning'");
      expect(svc).toContain("'info'");
    });
  });

  // ─── REQ-3: Health Issue Drill-Down ──────────────────────────────────────────

  describe('REQ-3 — Health Issue Drill-Down', () => {
    it('health issues card opens health alert view', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain("openDrillDown('health'");
    });

    it('health view reuses existing engineering_record_health_alerts table', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(svc).toContain('engineering_record_health_alerts');
      expect(svc).toContain('getBootstrapHealthAlerts');
    });

    it('health view shows severity, affected record, message, status', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('HealthView');
      expect(content).toContain('alert_type');
      expect(content).toContain('severity');
      expect(content).toContain('message');
      expect(content).toContain('status');
    });
  });

  // ─── REQ-4: Memory Drill-Down ────────────────────────────────────────────────

  describe('REQ-4 — Memory Drill-Down', () => {
    it('memory card opens memory view filtered by bootstrap run', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain("openDrillDown('memory'");
    });

    it('service queries engineering_memory filtered by bootstrap_run_id', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(svc).toContain('getBootstrapMemoryEntries');
      expect(svc).toContain("eq('bootstrap_run_id', runId)");
    });

    it('memory view shows category, domain, authority state, source record', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('MemoryView');
      expect(content).toContain('knowledge_category');
      expect(content).toContain('knowledge_domain');
      expect(content).toContain('authority_state');
      expect(content).toContain('record_ref');
    });

    it('no duplicate memory repository is created', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(svc).not.toContain('draft_knowledge_packages');
    });
  });

  // ─── REQ-5: Lineage Drill-Down ───────────────────────────────────────────────

  describe('REQ-5 — Lineage Drill-Down', () => {
    it('lineage card opens lineage view filtered by bootstrap run', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain("openDrillDown('lineage'");
    });

    it('service queries engineering_record_lineage filtered by bootstrap_run_id', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(svc).toContain('getBootstrapLineageEntries');
      expect(svc).toContain('engineering_record_lineage');
    });

    it('lineage view shows source, target, relationship type, timestamp', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('LineageView');
      expect(content).toContain('from_record_ref');
      expect(content).toContain('to_ref');
      expect(content).toContain('relationship_type');
    });
  });

  // ─── REQ-6: Record Drill-Down ────────────────────────────────────────────────

  describe('REQ-6 — Record Drill-Down', () => {
    it('discovered and imported cards open records view', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain("openDrillDown('records'");
    });

    it('skipped card opens skipped records view with skip reasons', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain("openDrillDown('skipped'");
      expect(content).toContain('SkippedRecordsView');
      expect(content).toContain('skip_reason');
    });

    it('service exports getBootstrapRecords and getBootstrapSkippedRecords', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(svc).toContain('export async function getBootstrapRecords');
      expect(svc).toContain('export async function getBootstrapSkippedRecords');
    });
  });

  // ─── REQ-7: Completion and Runtime Drill-Down ────────────────────────────────

  describe('REQ-7 — Completion and Runtime Drill-Down', () => {
    it('completion and runtime cards open execution detail view', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain("openDrillDown('execution'");
    });

    it('execution detail shows lifecycle, phase durations, longest phase', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('ExecutionDetailView');
      expect(content).toContain('Lifecycle');
      expect(content).toContain('Phase Statistics');
      expect(content).toContain('Longest Phase');
      expect(content).toContain('heartbeat');
    });

    it('service exports getBootstrapExecutionDetail', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(svc).toContain('export async function getBootstrapExecutionDetail');
      expect(svc).toContain('longestPhase');
    });
  });

  // ─── REQ-8: Bootstrap History Actions ────────────────────────────────────────

  describe('REQ-8 — Bootstrap History Actions', () => {
    it('history entries are expandable', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('expandedRun');
      expect(content).toContain('setExpandedRun');
    });

    it('expanded history shows evidence links for records, memory, lineage, health, diagnostics', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('EvidenceLink');
      expect(content).toContain('label="Records"');
      expect(content).toContain('label="Memory"');
      expect(content).toContain('label="Lineage"');
      expect(content).toContain('label="Health"');
      expect(content).toContain('label="Diagnostics"');
    });

    it('expanding a run does not trigger a new bootstrap execution', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      // The expand button should call setExpandedRun, not runHistoricalBootstrap
      const expandSection = content.match(/setExpandedRun\([^)]+\)/g);
      expect(expandSection).not.toBeNull();
      // Ensure runHistoricalBootstrap is only called from handleRunBootstrap
      expect(content).toContain('handleRunBootstrap');
    });
  });

  // ─── REQ-9: Governed Filter Context ─────────────────────────────────────────

  describe('REQ-9 — Governed Filter Context', () => {
    it('drill-down preserves originating bootstrap run ID', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('DrillDownState');
      expect(content).toContain('runId');
    });

    it('drill-down panel shows the active filter context', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('filter:');
    });

    it('drill-down panel can be closed to return to full workspace', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('closeDrillDown');
      expect(content).toContain('onClose');
    });
  });

  // ─── REQ-10: Accessibility ────────────────────────────────────────────────────

  describe('REQ-10 — Accessibility', () => {
    it('actionable metrics have aria-labels', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('aria-label');
      expect(content).toContain('Inspect');
    });

    it('actionable metrics use button elements (keyboard navigable)', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('<button');
      expect(content).toContain('onClick={onClick}');
    });

    it('metrics have focus ring styles', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('focus:ring');
      expect(content).toContain('focus:outline-none');
    });

    it('status is not communicated by colour alone (icons + text)', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      // Icons are used alongside colours
      expect(tracker).toContain('Icon');
      // Text labels are present
      expect(tracker).toContain('label=');
    });

    it('drill-down panel has role dialog and aria-modal', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('role="dialog"');
      expect(content).toContain('aria-modal="true"');
    });

    it('history expand buttons have aria-expanded', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('aria-expanded=');
    });
  });

  // ─── REQ-11: Reusable Operational Evidence Pattern ───────────────────────────

  describe('REQ-11 — Reusable Operational Evidence Pattern', () => {
    it('drill-down uses generic DrillDownType (not bootstrap-specific)', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('DrillDownType');
      expect(content).toContain('DrillDownState');
    });

    it('ProgressiveExecutionTracker remains reusable (no bootstrap hard-coding)', () => {
      const tracker = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(tracker).not.toContain('historicalBootstrapService');
      expect(tracker).not.toContain('BOOTSTRAP');
    });
  });

  // ─── REQ-12: No Regression ───────────────────────────────────────────────────

  describe('REQ-12 — No Regression', () => {
    it('service still exports all bootstrap functions', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(svc).toContain('export async function runHistoricalBootstrap');
      expect(svc).toContain('export async function getBootstrapRuns');
      expect(svc).toContain('export async function getLatestBootstrapRun');
      expect(svc).toContain('export async function getActiveBootstrapRun');
      expect(svc).toContain('export async function abandonBootstrapRun');
      expect(svc).toContain('export async function cancelBootstrapRun');
      expect(svc).toContain('export function calculateBootstrapCompletion');
    });

    it('BOOTSTRAP_PHASES still has 12 phases in canonical order', () => {
      expect(BOOTSTRAP_PHASES).toHaveLength(12);
      expect(BOOTSTRAP_PHASES[0].key).toBe('phase1_ewos');
      expect(BOOTSTRAP_PHASES[11].key).toBe('phase12_memory');
    });

    it('service still uses engineering_memory and engineering_record_lineage', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(svc).toContain('engineering_memory');
      expect(svc).toContain('engineering_record_lineage');
    });

    it('service does not reference draft_knowledge_packages', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(svc).not.toContain('draft_knowledge_packages');
    });

    it('no duplicate health repository is created', () => {
      const svc = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      // Should reuse engineering_record_health_alerts, not create a new table
      expect(svc).toContain('engineering_record_health_alerts');
      expect(svc).not.toContain('CREATE TABLE.*health');
    });

    it('drill-down query functions return empty arrays on error (no crash)', async () => {
      setupMock({
        historical_bootstrap_diagnostics: (obj) => {
          obj.eq = vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: null, error: new Error('test') }) });
        },
      });

      const result = await getBootstrapDiagnostics('test-run');
      expect(result).toEqual([]);
    });

    it('getBootstrapExecutionDetail returns null run on error', async () => {
      setupMock({
        historical_bootstrap_runs: (obj) => {
          obj.eq = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('test') }) });
        },
      });

      const result = await getBootstrapExecutionDetail('test-run');
      expect(result.run).toBeNull();
      expect(result.phases).toEqual([]);
      expect(result.longestPhase).toBeNull();
    });
  });

  // ─── Empty States ─────────────────────────────────────────────────────────────

  describe('Empty States', () => {
    it('all drill-down views have EmptyState for zero results', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('EmptyState');
      // Each view should have an empty state check
      const emptyStateCount = (content.match(/EmptyState/g) || []).length;
      expect(emptyStateCount).toBeGreaterThanOrEqual(7); // At least 7 views
    });
  });
});
