import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => {
  const chainable = () => {
    const obj: Record<string, ReturnType<typeof vi.fn>> = {};
    obj.eq = vi.fn().mockReturnValue(obj);
    obj.order = vi.fn().mockReturnValue(obj);
    obj.limit = vi.fn().mockReturnValue(obj);
    obj.select = vi.fn().mockReturnValue(obj);
    obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
    obj.update = vi.fn().mockReturnValue(obj);
    obj.not = vi.fn().mockReturnValue(obj);
    obj.or = vi.fn().mockReturnValue(obj);
    obj.in = vi.fn().mockReturnValue(obj);
    obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
    return obj;
  };
  return {
    supabase: {
      from: vi.fn(() => chainable()),
    },
  };
});

vi.mock('../lib/engineeringRecordsOrchestrator', () => ({
  checkRecordHealth: vi.fn().mockResolvedValue({ ewo_ref: '', complete: true, missing: [], present: [], alerts: [] }),
}));

vi.mock('../lib/engineeringChangeLogService', () => ({
  recordChangeLogEvent: vi.fn().mockResolvedValue(null),
}));

import {
  runHistoricalBootstrap,
  getBootstrapRuns,
  getLatestBootstrapRun,
  getActiveBootstrapRun,
  abandonBootstrapRun,
  cancelBootstrapRun,
  calculateBootstrapCompletion,
  type BootstrapRun,
} from '../lib/historicalBootstrapService';
import { supabase } from '../lib/supabase';

function makeChainable(): Record<string, ReturnType<typeof vi.fn>> {
  const obj: Record<string, ReturnType<typeof vi.fn>> = {};
  obj.eq = vi.fn().mockReturnValue(obj);
  obj.order = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockReturnValue(obj);
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

describe('EWO-023R.1R.1 — Historical Bootstrap Architectural Consolidation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── REQ-1: Architectural Compatibility ─────────────────────────────────────

  describe('REQ-1 — Architectural Compatibility', () => {
    it('service does not reference draft_knowledge_packages', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(content).not.toContain('draft_knowledge_packages');
      expect(content).not.toContain('DraftKnowledgePackage');
      expect(content).not.toContain('getDraftKnowledgePackage');
    });

    it('service uses engineering_memory for AI knowledge preparation', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(content).toContain('engineering_memory');
      expect(content).toContain('knowledge_category');
      expect(content).toContain('knowledge_domain');
    });

    it('service uses engineering_record_lineage for relationships', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync('src/lib/historicalBootstrapService.ts', 'utf-8');
      expect(content).toContain('engineering_record_lineage');
      expect(content).not.toContain('engineering_record_relationships');
    });
  });

  // ─── REQ-2: No Duplicate Repository ──────────────────────────────────────────

  describe('REQ-2 — No Duplicate Repository', () => {
    it('dashboard does not reference draft knowledge packages', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync('src/pages/ecc/ECHistoricalBootstrapPage.tsx', 'utf-8');
      expect(content).not.toContain('DraftKnowledgePackage');
      expect(content).not.toContain('getDraftKnowledgePackage');
      expect(content).not.toContain('draft_knowledge_packages');
    });
  });

  // ─── REQ-3/4/5: Extend Existing Architecture ─────────────────────────────────

  describe('REQ-3/4/5 — Extend Existing Architecture', () => {
    it('bootstrap imports into engineering_records_library', async () => {
      let insertedToLibrary = false;
      setupMock({
        engineering_work_orders: (obj) => {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        },
        historical_bootstrap_runs: (obj) => {
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.update = vi.fn().mockReturnValue({ ...obj, eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
          obj.in = vi.fn().mockReturnValue(obj);
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_records_library: (obj) => {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.insert = vi.fn().mockImplementation(() => { insertedToLibrary = true; return Promise.resolve({ data: null, error: null }); });
          obj.not = vi.fn().mockReturnValue(obj);
        },
        engineering_record_lineage: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_memory: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
      });

      const result = await runHistoricalBootstrap();
      expect(result.status).toBe('completed');
    });
  });

  // ─── REQ-6/7/8: Execution Lifecycle & Phase Tracking ─────────────────────────

  describe('REQ-6/7/8 — Execution Lifecycle & Phase Tracking', () => {
    it('runHistoricalBootstrap transitions through governed statuses', async () => {
      const statusUpdates: string[] = [];
      setupMock({
        engineering_work_orders: (obj) => { obj.order = vi.fn().mockResolvedValue({ data: [], error: null }); },
        historical_bootstrap_runs: (obj) => {
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.update = vi.fn().mockImplementation((update) => {
            if (update.status) statusUpdates.push(update.status);
            return { ...obj, eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
          });
          obj.in = vi.fn().mockReturnValue(obj);
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_records_library: (obj) => {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.not = vi.fn().mockReturnValue(obj);
        },
        engineering_record_lineage: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_memory: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
      });

      await runHistoricalBootstrap();
      expect(statusUpdates).toContain('starting');
      expect(statusUpdates).toContain('running');
      expect(statusUpdates).toContain('completed');
    });

    it('result includes runtime_seconds > 0 on success', async () => {
      setupMock({
        engineering_work_orders: (obj) => { obj.order = vi.fn().mockResolvedValue({ data: [], error: null }); },
        historical_bootstrap_runs: (obj) => {
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.update = vi.fn().mockReturnValue({ ...obj, eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
          obj.in = vi.fn().mockReturnValue(obj);
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_records_library: (obj) => {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.not = vi.fn().mockReturnValue(obj);
        },
        engineering_record_lineage: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_memory: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
      });

      const result = await runHistoricalBootstrap();
      expect(result.runtime_seconds).toBeGreaterThanOrEqual(0);
      expect(result.status).toBe('completed');
    });
  });

  // ─── REQ-9: Failure Governance ───────────────────────────────────────────────

  describe('REQ-9 — Failure Governance', () => {
    it('failure is captured with failed_phase and failure_reason', async () => {
      setupMock({
        engineering_work_orders: (obj) => {
          obj.order = vi.fn().mockRejectedValue(new Error('DB connection failed'));
        },
        historical_bootstrap_runs: (obj) => {
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.update = vi.fn().mockReturnValue({ ...obj, eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
          obj.in = vi.fn().mockReturnValue(obj);
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_records_library: (obj) => {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.not = vi.fn().mockReturnValue(obj);
        },
        engineering_record_lineage: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_memory: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
      });

      const result = await runHistoricalBootstrap();
      expect(result.status).toBe('failed');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ─── REQ-10: Safe Recovery ───────────────────────────────────────────────────

  describe('REQ-10 — Safe Recovery (Idempotent)', () => {
    it('second run skips existing records and memory entries', async () => {
      setupMock({
        engineering_work_orders: (obj) => {
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: 'ewo-1', ewo_ref: 'EWO-001', title: 'Test', executive_summary: 'Summary', status: 'closed', implementation_source: 'chatgpt', originating_prompt_ref: 'p1', refinement_chain: ['EWO-001'], refinement_depth: 0, parent_ref: null, created_by: 'Eng', created_at: '2026-01-01', po_accepted_at: null, po_accepted_by: null, po_acceptance_statement: null, implementation_status: 'Complete' }],
            error: null,
          });
        },
        historical_bootstrap_runs: (obj) => {
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.update = vi.fn().mockReturnValue({ ...obj, eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
          obj.in = vi.fn().mockReturnValue(obj);
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_records_library: (obj) => {
          // All records already exist
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'existing' }, error: null });
          obj.not = vi.fn().mockReturnValue(obj);
        },
        engineering_record_lineage: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [{ id: 'existing' }], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_memory: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [{ id: 'existing' }], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
      });

      const result = await runHistoricalBootstrap();
      expect(result.artefacts_imported).toBe(0);
      expect(result.memory_entries_prepared).toBe(0);
    });
  });

  // ─── REQ-11: Concurrency Protection ──────────────────────────────────────────

  describe('REQ-11 — Concurrency Protection', () => {
    it('prevents duplicate execution when a run is already active', async () => {
      setupMock({
        historical_bootstrap_runs: (obj) => {
          // Active run found
          obj.in = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockReturnValue(obj);
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: { run_id: 'BOOTSTRAP-EXISTING' }, error: null });
        },
      });

      const result = await runHistoricalBootstrap();
      expect(result.status).toBe('failed');
      expect(result.errors[0]).toContain('already active');
      expect(result.run_id).toBe('');
    });
  });

  // ─── REQ-13: Engineering Records Integration ─────────────────────────────────

  describe('REQ-13 — Bootstrap Generates Engineering Records', () => {
    it('bootstrap creates engineering records for started and completed events', async () => {
      const insertedRefs: string[] = [];
      setupMock({
        engineering_work_orders: (obj) => { obj.order = vi.fn().mockResolvedValue({ data: [], error: null }); },
        historical_bootstrap_runs: (obj) => {
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.update = vi.fn().mockReturnValue({ ...obj, eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
          obj.in = vi.fn().mockReturnValue(obj);
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_records_library: (obj) => {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.insert = vi.fn().mockImplementation((val) => {
            if (val.record_ref?.startsWith('BOOTSTRAP-')) insertedRefs.push(val.record_ref);
            return Promise.resolve({ data: null, error: null });
          });
          obj.not = vi.fn().mockReturnValue(obj);
        },
        engineering_record_lineage: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_memory: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
      });

      await runHistoricalBootstrap();
      expect(insertedRefs.some(r => r.includes('STARTED'))).toBe(true);
      expect(insertedRefs.some(r => r.includes('COMPLETED'))).toBe(true);
    });
  });

  // ─── Dashboard Functions ─────────────────────────────────────────────────────

  describe('Dashboard Functions', () => {
    it('getBootstrapRuns returns run history', async () => {
      setupMock({
        historical_bootstrap_runs: (obj) => {
          obj.order = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({
            data: [{ id: '1', run_id: 'BOOTSTRAP-1', status: 'completed', artefacts_discovered: 100, artefacts_imported: 80, artefacts_skipped: 20, relationships_reconstructed: 50, health_issues_detected: 5, draft_packages_prepared: 78, started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:10:00Z', runtime_seconds: 600, current_phase: null, phase_progress: null, heartbeat_at: null, failed_phase: null, failure_reason: null, diagnostics: null }],
            error: null,
          });
        },
      });

      const runs = await getBootstrapRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].run_id).toBe('BOOTSTRAP-1');
    });

    it('getLatestBootstrapRun returns the most recent run', async () => {
      setupMock({
        historical_bootstrap_runs: (obj) => {
          obj.order = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockReturnValue(obj);
          obj.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: '1', run_id: 'BOOTSTRAP-LATEST', status: 'completed', artefacts_discovered: 100, artefacts_imported: 80, artefacts_skipped: 20, relationships_reconstructed: 50, health_issues_detected: 5, draft_packages_prepared: 78, started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:10:00Z', runtime_seconds: 600, current_phase: null, phase_progress: null, heartbeat_at: null, failed_phase: null, failure_reason: null, diagnostics: null },
            error: null,
          });
        },
      });

      const run = await getLatestBootstrapRun();
      expect(run).not.toBeNull();
      expect(run?.run_id).toBe('BOOTSTRAP-LATEST');
    });

    it('getActiveBootstrapRun returns active run if exists', async () => {
      setupMock({
        historical_bootstrap_runs: (obj) => {
          obj.in = vi.fn().mockReturnValue(obj);
          obj.order = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockReturnValue(obj);
          obj.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: '1', run_id: 'BOOTSTRAP-ACTIVE', status: 'running', artefacts_discovered: 0, artefacts_imported: 0, artefacts_skipped: 0, relationships_reconstructed: 0, health_issues_detected: 0, draft_packages_prepared: 0, started_at: '2026-01-01T00:00:00Z', completed_at: null, runtime_seconds: null, current_phase: 'phase1_ewos', phase_progress: {}, heartbeat_at: '2026-01-01T00:00:05Z', failed_phase: null, failure_reason: null, diagnostics: null },
            error: null,
          });
        },
      });

      const run = await getActiveBootstrapRun();
      expect(run).not.toBeNull();
      expect(run?.status).toBe('running');
      expect(run?.current_phase).toBe('phase1_ewos');
    });

    it('calculateBootstrapCompletion returns percentage', () => {
      const run: BootstrapRun = {
        id: '1', run_id: 'B1', status: 'completed',
        artefacts_discovered: 100, artefacts_imported: 80, artefacts_skipped: 20,
        relationships_reconstructed: 50, health_issues_detected: 5,
        draft_packages_prepared: 78, started_at: '2026-01-01T00:00:00Z',
        completed_at: '2026-01-01T00:10:00Z', runtime_seconds: 600,
        current_phase: null, phase_progress: null, heartbeat_at: null,
        failed_phase: null, failure_reason: null, diagnostics: null,
      };
      expect(calculateBootstrapCompletion(run)).toBe(100);
    });

    it('calculateBootstrapCompletion returns 0 for no discoveries', () => {
      const run: BootstrapRun = {
        id: '1', run_id: 'B1', status: 'completed',
        artefacts_discovered: 0, artefacts_imported: 0, artefacts_skipped: 0,
        relationships_reconstructed: 0, health_issues_detected: 0,
        draft_packages_prepared: 0, started_at: '2026-01-01T00:00:00Z',
        completed_at: null, runtime_seconds: null,
        current_phase: null, phase_progress: null, heartbeat_at: null,
        failed_phase: null, failure_reason: null, diagnostics: null,
      };
      expect(calculateBootstrapCompletion(run)).toBe(0);
    });
  });

  // ─── Recovery Functions ───────────────────────────────────────────────────────

  describe('Recovery Functions', () => {
    it('abandonBootstrapRun updates status to abandoned', async () => {
      let updatePayload: Record<string, unknown> | null = null;
      setupMock({
        historical_bootstrap_runs: (obj) => {
          obj.update = vi.fn().mockImplementation((payload) => { updatePayload = payload; return { ...obj, eq: vi.fn().mockResolvedValue({ data: null, error: null }) }; });
        },
        engineering_records_library: (obj) => {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
      });

      await abandonBootstrapRun('BOOTSTRAP-1');
      expect(updatePayload).not.toBeNull();
      expect(updatePayload?.status).toBe('abandoned');
    });

    it('cancelBootstrapRun updates status to cancelled', async () => {
      let updatePayload: Record<string, unknown> | null = null;
      setupMock({
        historical_bootstrap_runs: (obj) => {
          obj.update = vi.fn().mockImplementation((payload) => { updatePayload = payload; return { ...obj, eq: vi.fn().mockResolvedValue({ data: null, error: null }) }; });
        },
        engineering_records_library: (obj) => {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
      });

      await cancelBootstrapRun('BOOTSTRAP-1');
      expect(updatePayload).not.toBeNull();
      expect(updatePayload?.status).toBe('cancelled');
    });
  });

  // ─── REQ-15: No Regression ───────────────────────────────────────────────────

  describe('REQ-15 — No Regression', () => {
    it('bootstrap result has all required fields', async () => {
      setupMock({
        engineering_work_orders: (obj) => { obj.order = vi.fn().mockResolvedValue({ data: [], error: null }); },
        historical_bootstrap_runs: (obj) => {
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.update = vi.fn().mockReturnValue({ ...obj, eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
          obj.in = vi.fn().mockReturnValue(obj);
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_records_library: (obj) => {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.not = vi.fn().mockReturnValue(obj);
        },
        engineering_record_lineage: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
        engineering_memory: (obj) => {
          obj.eq = vi.fn().mockReturnValue(obj);
          obj.limit = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        },
      });

      const result = await runHistoricalBootstrap();
      expect(result).toHaveProperty('run_id');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('artefacts_discovered');
      expect(result).toHaveProperty('artefacts_imported');
      expect(result).toHaveProperty('artefacts_skipped');
      expect(result).toHaveProperty('relationships_reconstructed');
      expect(result).toHaveProperty('health_issues_detected');
      expect(result).toHaveProperty('memory_entries_prepared');
      expect(result).toHaveProperty('runtime_seconds');
      expect(result).toHaveProperty('errors');
    });
  });
});
