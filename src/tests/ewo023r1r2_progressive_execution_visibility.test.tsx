import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectStall,
  computeEstimate,
  type PhaseDef,
} from '../components/ProgressiveExecutionTracker';
import {
  BOOTSTRAP_PHASES,
  calculateBootstrapCompletion,
  type BootstrapRun,
} from '../lib/historicalBootstrapService';
import * as fs from 'fs';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) })) },
}));
vi.mock('../lib/engineeringRecordsOrchestrator', () => ({ checkRecordHealth: vi.fn() }));
vi.mock('../lib/engineeringChangeLogService', () => ({ recordChangeLogEvent: vi.fn() }));

describe('EWO-023R.1R.2 — Progressive Execution Visibility Standard (ES-004)', () => {

  // ─── REQ-1: Engineering Standard ES-004 exists ──────────────────────────────

  describe('REQ-1 — ES-004 exists', () => {
    it('BOOTSTRAP_PHASES defines all 12 canonical phases', () => {
      expect(BOOTSTRAP_PHASES).toHaveLength(12);
      expect(BOOTSTRAP_PHASES[0].key).toBe('phase1_ewos');
      expect(BOOTSTRAP_PHASES[11].key).toBe('phase12_memory');
    });

    it('each phase has a key and label', () => {
      for (const phase of BOOTSTRAP_PHASES) {
        expect(phase.key).toBeTruthy();
        expect(phase.label).toBeTruthy();
        expect(phase.label).toContain('Phase');
      }
    });

    it('ProgressiveExecutionTracker component file exists', () => {
      expect(fs.existsSync('src/components/ProgressiveExecutionTracker.tsx')).toBe(true);
    });

    it('component exports ProgressiveExecutionTracker, detectStall, computeEstimate', () => {
      const content = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(content).toContain('export function ProgressiveExecutionTracker');
      expect(content).toContain('export function detectStall');
      expect(content).toContain('export function computeEstimate');
    });
  });

  // ─── REQ-3: Canonical Phase Display ──────────────────────────────────────────

  describe('REQ-3 — Canonical Phase Display', () => {
    it('all 12 phases are defined in canonical order', () => {
      const expectedKeys = [
        'phase1_ewos', 'phase2_completion_reports', 'phase3_packages',
        'phase4_change_log', 'phase5_timeline', 'phase6_standards',
        'phase7_constitutional', 'phase8_historical_refs', 'phase9_verifications',
        'phase10_lineage', 'phase11_health', 'phase12_memory',
      ];
      expect(BOOTSTRAP_PHASES.map(p => p.key)).toEqual(expectedKeys);
    });

    it('phase labels include phase numbers in sequence', () => {
      BOOTSTRAP_PHASES.forEach((phase, i) => {
        expect(phase.label).toContain(`Phase ${i + 1}`);
      });
    });
  });

  // ─── REQ-4: Live Summary Synchronisation ─────────────────────────────────────

  describe('REQ-4 — Live Summary Synchronisation', () => {
    it('component accepts summary with all required live fields', () => {
      const content = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(content).toContain('runtimeSeconds');
      expect(content).toContain('completionPct');
      expect(content).toContain('discovered');
      expect(content).toContain('imported');
      expect(content).toContain('skipped');
      expect(content).toContain('lineageLinks');
      expect(content).toContain('memoryEntries');
      expect(content).toContain('healthIssues');
    });
  });

  // ─── REQ-5: Active Phase Details ──────────────────────────────────────────────

  describe('REQ-5 — Active Phase Details', () => {
    it('PhaseDef includes discovered, imported, skipped, failed, elapsedMs', () => {
      const content = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(content).toContain('discovered');
      expect(content).toContain('imported');
      expect(content).toContain('skipped');
      expect(content).toContain('failed');
      expect(content).toContain('elapsedMs');
    });
  });

  // ─── REQ-6: Estimated Remaining Time ──────────────────────────────────────────

  describe('REQ-6 — Estimated Remaining Time', () => {
    it('computeEstimate returns high confidence with 3+ historical runs', () => {
      const estimate = computeEstimate(6, 12, 60, [120, 130, 110]);
      expect(estimate.confidence).toBe('high');
      expect(estimate.remainingSeconds).toBeGreaterThan(0);
      expect(estimate.estimatedCompletion).toBeTruthy();
    });

    it('computeEstimate returns medium confidence with 1 historical run', () => {
      const estimate = computeEstimate(3, 12, 30, [120]);
      expect(estimate.confidence).toBe('medium');
      expect(estimate.remainingSeconds).toBeGreaterThan(0);
    });

    it('computeEstimate falls back to current rate without historical data', () => {
      const estimate = computeEstimate(3, 12, 30, []);
      expect(estimate.confidence).toBe('medium');
      expect(estimate.remainingSeconds).toBeGreaterThan(0);
    });

    it('computeEstimate returns low confidence with few completed phases and no history', () => {
      const estimate = computeEstimate(1, 12, 10, []);
      expect(estimate.confidence).toBe('low');
      expect(estimate.remainingSeconds).toBeGreaterThan(0);
    });

    it('computeEstimate returns calculating when no phases completed', () => {
      const estimate = computeEstimate(0, 12, 5, []);
      expect(estimate.confidence).toBe('calculating');
      expect(estimate.remainingSeconds).toBeNull();
    });

    it('computeEstimate never invents estimates — returns null when unavailable', () => {
      const estimate = computeEstimate(0, 0, 0, []);
      expect(estimate.remainingSeconds).toBeNull();
    });
  });

  // ─── REQ-7: Heartbeat Improvements ─────────────────────────────────────────────

  describe('REQ-7 — Heartbeat Improvements', () => {
    it('component displays heartbeat indicator', () => {
      const content = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(content).toContain('heartbeatAgoSeconds');
      expect(content).toContain('Heart');
    });
  });

  // ─── REQ-8: Stall Detection ───────────────────────────────────────────────────

  describe('REQ-8 — Stall Detection', () => {
    it('detects stall when heartbeat exceeds 60 seconds', () => {
      const now = Date.now();
      const staleHeartbeat = new Date(now - 90_000).toISOString();
      const stall = detectStall(staleHeartbeat, 'phase1_ewos', now - 90_000, now);

      expect(stall).not.toBeNull();
      expect(stall!.stalled).toBe(true);
      expect(stall!.lastHeartbeatAgoSeconds).toBe(90);
      expect(stall!.currentPhase).toBe('phase1_ewos');
      expect(stall!.guidance).toBeTruthy();
    });

    it('does not detect stall when heartbeat is recent', () => {
      const now = Date.now();
      const recentHeartbeat = new Date(now - 5_000).toISOString();
      const stall = detectStall(recentHeartbeat, 'phase1_ewos', now - 5_000, now);

      expect(stall).toBeNull();
    });

    it('returns null when no heartbeat', () => {
      const stall = detectStall(null, 'phase1_ewos', null);
      expect(stall).toBeNull();
    });

    it('does not classify as failed — only warns', () => {
      const now = Date.now();
      const staleHeartbeat = new Date(now - 120_000).toISOString();
      const stall = detectStall(staleHeartbeat, 'phase1_ewos', now - 120_000, now);

      expect(stall).not.toBeNull();
      expect(stall!.stalled).toBe(true);
      // Guidance should mention recovery options, not failure
      expect(stall!.guidance).toContain('Cancel');
      expect(stall!.guidance).toContain('Abandon');
    });
  });

  // ─── REQ-9: Phase Performance Metrics ─────────────────────────────────────────

  describe('REQ-9 — Phase Performance Metrics', () => {
    it('service exports getBootstrapPhaseMetrics', () => {
      const content = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(content).toContain('export async function getBootstrapPhaseMetrics');
      expect(content).toContain('PhaseMetrics');
      expect(content).toContain('avgPhaseDurationSeconds');
      expect(content).toContain('historicalAverages');
    });
  });

  // ─── REQ-10: Reusable Execution Component ────────────────────────────────────

  describe('REQ-10 — Reusable Execution Component', () => {
    it('component is in src/components/ (shared location)', () => {
      expect(fs.existsSync('src/components/ProgressiveExecutionTracker.tsx')).toBe(true);
    });

    it('component accepts generic phase definitions (not bootstrap-specific)', () => {
      const content = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(content).toContain('PhaseDef');
      expect(content).toContain('ExecutionSummary');
      expect(content).toContain('EstimateInfo');
      expect(content).toContain('StallInfo');
    });

    it('component does not import bootstrap-specific code', () => {
      const content = fs.readFileSync('src/components/ProgressiveExecutionTracker.tsx', 'utf-8');
      expect(content).not.toContain('historicalBootstrapService');
      expect(content).not.toContain('BOOTSTRAP');
    });
  });

  // ─── REQ-11: Operator Experience ──────────────────────────────────────────────

  describe('REQ-11 — Operator Experience', () => {
    it('dashboard uses ProgressiveExecutionTracker component', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('ProgressiveExecutionTracker');
      expect(content).toContain('BOOTSTRAP_PHASES');
    });

    it('dashboard references ES-004', () => {
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).toContain('ES-004');
    });
  });

  // ─── REQ-12: No Regression ───────────────────────────────────────────────────

  describe('REQ-12 — No Regression', () => {
    it('calculateBootstrapCompletion still works', () => {
      const run: BootstrapRun = {
        id: '1', run_id: 'B1', status: 'completed',
        artefacts_discovered: 200, artefacts_imported: 150, artefacts_skipped: 50,
        relationships_reconstructed: 100, health_issues_detected: 3,
        draft_packages_prepared: 78, started_at: '2026-01-01T00:00:00Z',
        completed_at: '2026-01-01T00:10:00Z', runtime_seconds: 600,
        current_phase: null, phase_progress: null, heartbeat_at: null,
        failed_phase: null, failure_reason: null, diagnostics: null,
      };
      expect(calculateBootstrapCompletion(run)).toBe(100);
    });

    it('estimate confidence values are governed', () => {
      const validConfidences = ['high', 'medium', 'low', 'calculating', 'unavailable'];
      for (const completed of [0, 1, 3, 6, 12]) {
        for (const historical of [[], [100], [100, 110, 120]]) {
          const estimate = computeEstimate(completed, 12, 60, historical);
          expect(validConfidences).toContain(estimate.confidence);
        }
      }
    });

    it('service still has all bootstrap functions', () => {
      const content = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(content).toContain('export async function runHistoricalBootstrap');
      expect(content).toContain('export async function getBootstrapRuns');
      expect(content).toContain('export async function getLatestBootstrapRun');
      expect(content).toContain('export async function getActiveBootstrapRun');
      expect(content).toContain('export async function abandonBootstrapRun');
      expect(content).toContain('export async function cancelBootstrapRun');
      expect(content).toContain('export function calculateBootstrapCompletion');
    });

    it('service does not reference draft_knowledge_packages', () => {
      const content = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(content).not.toContain('draft_knowledge_packages');
    });

    it('service still uses engineering_memory and engineering_record_lineage', () => {
      const content = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(content).toContain('engineering_memory');
      expect(content).toContain('engineering_record_lineage');
    });
  });
});
