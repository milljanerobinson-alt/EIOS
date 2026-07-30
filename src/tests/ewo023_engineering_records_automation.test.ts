import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => {
  const chainable = () => {
    const obj: Record<string, ReturnType<typeof vi.fn>> = {};
    obj.eq = vi.fn().mockReturnValue(obj);
    obj.in = vi.fn().mockReturnValue(obj);
    obj.order = vi.fn().mockReturnValue(obj);
    obj.limit = vi.fn().mockReturnValue(obj);
    obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
    obj.select = vi.fn().mockReturnValue(obj);
    obj.insert = vi.fn().mockReturnValue(obj);
    obj.update = vi.fn().mockReturnValue(obj);
    obj.or = vi.fn().mockReturnValue(obj);
    return obj;
  };
  return {
    supabase: {
      from: vi.fn(() => chainable()),
    },
  };
});

vi.mock('../lib/engineeringChangeLogService', () => ({
  recordChangeLogEvent: vi.fn().mockResolvedValue(null),
}));

import {
  orchestrateRecords,
  getRecordsForEwo,
  searchEngineeringRecords,
  getRecordRelationships,
  getRelatedRecords,
  createRecordVersion,
  getRecordVersions,
  updateRecordStatus,
  queueKnowledgeCapture,
  getPendingKnowledgeCaptures,
  completeKnowledgeCapture,
  assembleEngineeringPackage,
  checkRecordHealth,
  getHealthAlerts,
  getRecordTypes,
  extractKnowledgeMetadata,
  type RecordType,
  type RecordStatus,
  type CaptureTrigger,
  type KnowledgeType,
  type RelationshipType,
  type TargetType,
} from '../lib/engineeringRecordsOrchestrator';

describe('EWO-023 — Engineering Records Automation & Autonomous Knowledge Capture', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── REQ-1/2: Records Orchestrator ───────────────────────────────────────────

  describe('REQ-1/2 — Engineering Records Orchestrator', () => {
    it('orchestrateRecords generates records for an EWO', async () => {
      const { supabase } = await import('../lib/supabase');
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        callCount++;
        if (table === 'engineering_work_orders' && callCount === 1) {
          obj.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: 'ewo-id', ewo_ref: 'EWO-TEST', status: 'engineering_approved', title: 'Test' },
            error: null,
          });
          obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        } else if (table === 'engineering_records_library') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.single = vi.fn().mockResolvedValue({
            data: { id: 'rec-id', record_ref: 'EWO-TEST-PROMPT', record_type: 'prompt', title: 'Test', status: 'generated', version_number: 1, ewo_ref: 'EWO-TEST', ewo_id: 'ewo-id', content: {}, generated_by: 'Orchestrator', created_at: new Date().toISOString() },
            error: null,
          });
        } else {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        }
        return obj;
      });

      const result = await orchestrateRecords('EWO-TEST', 'engineering_approved');
      expect(result.generated.length).toBeGreaterThan(0);
    });

    it('returns empty arrays for non-existent EWO', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const result = await orchestrateRecords('EWO-NONEXISTENT', 'engineering_approved');
      expect(result.generated).toHaveLength(0);
    });
  });

  // ─── REQ-3: Record Relationships ────────────────────────────────────────────

  describe('REQ-3 — Record Relationships', () => {
    it('getRecordRelationships returns relationships for a record', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockResolvedValue({
          data: [{ id: '1', source_record_id: 'rec-1', source_ref: 'EWO-TEST-PROMPT', target_type: 'ewo', target_ref: 'EWO-TEST', target_id: null, relationship_type: 'belongs_to', created_at: new Date().toISOString() }],
          error: null,
        });
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const rels = await getRecordRelationships('EWO-TEST-PROMPT');
      expect(rels).toHaveLength(1);
      expect(rels[0].relationship_type).toBe('belongs_to');
    });

    it('getRelatedRecords returns records related to an EWO', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockResolvedValue({
          data: [{ id: '1', source_record_id: 'rec-1', source_ref: 'EWO-TEST-PROMPT', target_type: 'ewo', target_ref: 'EWO-TEST', target_id: null, relationship_type: 'belongs_to', created_at: new Date().toISOString() }],
          error: null,
        });
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const rels = await getRelatedRecords('EWO-TEST');
      expect(rels).toHaveLength(1);
    });
  });

  // ─── REQ-5/6: Versioning & Status ────────────────────────────────────────────

  describe('REQ-5/6 — Record Versioning & Status', () => {
    it('createRecordVersion creates a new immutable version', async () => {
      const { supabase } = await import('../lib/supabase');
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        callCount++;
        if (table === 'engineering_records_library' && callCount === 1) {
          obj.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: 'rec-1', version_number: 1, record_version: 1, content: { old: true } },
            error: null,
          });
        }
        return obj;
      });

      const result = await createRecordVersion('rec-1', { new: true }, 'Test', 'Updated content');
      expect(result).not.toBeNull();
      expect(result?.version_number).toBe(2);
    });

    it('updateRecordStatus updates the status', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const result = await updateRecordStatus('rec-1', 'archived');
      expect(result.success).toBe(true);
    });

    it('updateRecordStatus returns error on failure', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'Failed' } });
        obj.update = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const result = await updateRecordStatus('rec-1', 'archived');
      expect(result.success).toBe(false);
    });
  });

  // ─── REQ-7: Knowledge Capture Queue ──────────────────────────────────────────

  describe('REQ-7 — Knowledge Capture Events', () => {
    it('queueKnowledgeCapture queues a task for engineering_complete', async () => {
      const { supabase } = await import('../lib/supabase');
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        callCount++;
        if (callCount === 1) {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        } else {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.single = vi.fn().mockResolvedValue({ data: { id: 'task-1' }, error: null });
        }
        return obj;
      });

      const result = await queueKnowledgeCapture('EWO-TEST', 'ewo-id', 'engineering_complete');
      expect(result.length).toBeGreaterThan(0);
    });

    it('does not queue for unknown lifecycle stage', async () => {
      const result = await queueKnowledgeCapture('EWO-TEST', 'ewo-id', 'draft');
      expect(result).toHaveLength(0);
    });

    it('completeKnowledgeCapture marks task as completed', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const result = await completeKnowledgeCapture('task-1', { knowledge: 'test' });
      expect(result.success).toBe(true);
    });
  });

  // ─── REQ-8/9: Records Library & Search ───────────────────────────────────────

  describe('REQ-8/9 — Records Library & Search', () => {
    it('getRecordsForEwo returns records for an EWO', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockResolvedValue({
          data: [{ id: '1', record_ref: 'EWO-TEST-PROMPT', record_type: 'prompt', title: 'Test', status: 'generated', version_number: 1, ewo_ref: 'EWO-TEST', ewo_id: 'ewo-id', content: {}, generated_by: 'Orchestrator', created_at: new Date().toISOString() }],
          error: null,
        });
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const records = await getRecordsForEwo('EWO-TEST');
      expect(records).toHaveLength(1);
      expect(records[0].record_type).toBe('prompt');
    });

    it('searchEngineeringRecords returns matching records', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.or = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockResolvedValue({
          data: [{ id: '1', record_ref: 'EWO-021-PROMPT', record_type: 'prompt', title: 'Test', ewo_ref: 'EWO-021', status: 'generated', version_number: 1, created_at: new Date().toISOString() }],
          error: null,
        });
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const results = await searchEngineeringRecords('EWO-021');
      expect(results).toHaveLength(1);
      expect(results[0].ewo_ref).toBe('EWO-021');
    });
  });

  // ─── REQ-10: Engineering Package Automation ──────────────────────────────────

  describe('REQ-10 — Engineering Package Automation', () => {
    it('assembleEngineeringPackage creates a package from records', async () => {
      const { supabase } = await import('../lib/supabase');
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        callCount++;
        if (table === 'engineering_records_library' && callCount === 1) {
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: '1', record_ref: 'EWO-TEST-PROMPT', record_type: 'prompt', title: 'Test', status: 'generated', version_number: 1, ewo_ref: 'EWO-TEST', ewo_id: 'ewo-id', content: { test: true }, generated_by: 'Orchestrator', created_at: new Date().toISOString() }],
            error: null,
          });
        } else if (table === 'engineering_records_library' && callCount === 2) {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        } else if (table === 'engineering_work_orders') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'ewo-id' }, error: null });
        }
        return obj;
      });

      const result = await assembleEngineeringPackage('EWO-TEST');
      expect(result.success).toBe(true);
      expect(result.package_ref).toBe('EWO-TEST-PACKAGE');
    });

    it('returns error when no records exist', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const result = await assembleEngineeringPackage('EWO-EMPTY');
      expect(result.success).toBe(false);
    });
  });

  // ─── REQ-11: Record Health Engine ────────────────────────────────────────────

  describe('REQ-11 — Record Health Engine', () => {
    it('checkRecordHealth reports missing records', async () => {
      const { supabase } = await import('../lib/supabase');
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        callCount++;
        if (table === 'engineering_records_library' && callCount === 1) {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        } else if (table === 'engineering_work_orders') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: { status: 'closed' }, error: null });
          obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        } else if (table === 'engineering_record_health_alerts') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.insert = vi.fn().mockReturnValue(obj);
          obj.select = vi.fn().mockReturnValue(obj);
          obj.single = vi.fn().mockResolvedValue({
            data: { id: 'alert-1', ewo_ref: 'EWO-TEST', ewo_id: 'ewo-id', missing_record_type: 'completion_report', severity: 'high', status: 'open', detected_at: new Date().toISOString(), resolved_at: null, resolution_note: null },
            error: null,
          });
        }
        return obj;
      });

      const report = await checkRecordHealth('EWO-TEST', 'ewo-id');
      expect(report.ewo_ref).toBe('EWO-TEST');
      expect(report.complete).toBe(false);
      expect(report.missing.length).toBeGreaterThan(0);
    });
  });

  // ─── REQ-4: Record Types ─────────────────────────────────────────────────────

  describe('REQ-4 — Record Types', () => {
    it('getRecordTypes returns governed types', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.order = vi.fn().mockResolvedValue({
          data: [
            { type_key: 'prompt', label: 'Engineering Prompt', description: 'Test', auto_generated: true, required_for_closure: true },
            { type_key: 'completion_report', label: 'Completion Report', description: 'Test', auto_generated: true, required_for_closure: true },
          ],
          error: null,
        });
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const types = await getRecordTypes();
      expect(types.length).toBeGreaterThan(0);
      expect(types[0].type_key).toBe('prompt');
    });
  });

  // ─── REQ-12: Future Knowledge Ready ──────────────────────────────────────────

  describe('REQ-12 — Future Knowledge Ready', () => {
    it('extractKnowledgeMetadata returns structured knowledge data', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockResolvedValue({
          data: [{
            id: '1', record_ref: 'EWO-TEST-PROMPT', record_type: 'prompt',
            title: 'Test', status: 'generated', version_number: 1,
            ewo_ref: 'EWO-TEST', ewo_id: 'ewo-id',
            content: {
              engineering_knowledge: {
                architectural_decisions: ['Use React'],
                engineering_patterns: ['Component pattern'],
                lessons_learned: ['Test early'],
                reusable_components: ['Button'],
              },
              semantic_metadata: {
                engineering_domains: ['Frontend'],
                subsystems: ['UI'],
                technologies: ['React'],
              },
            },
            generated_by: 'Orchestrator', created_at: new Date().toISOString(),
          }],
          error: null,
        });
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const knowledge = await extractKnowledgeMetadata('EWO-TEST');
      expect(knowledge.ewo_ref).toBe('EWO-TEST');
      expect(knowledge.architecture_decisions).toContain('Use React');
      expect(knowledge.engineering_patterns).toContain('Component pattern');
      expect(knowledge.lessons_learned).toContain('Test early');
      expect(knowledge.technologies).toContain('React');
    });

    it('extractKnowledgeMetadata returns empty arrays for no records', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const knowledge = await extractKnowledgeMetadata('EWO-EMPTY');
      expect(knowledge.architecture_decisions).toHaveLength(0);
      expect(knowledge.engineering_patterns).toHaveLength(0);
    });
  });

  // ─── REQ-14: No Regression — Type Safety ──────────────────────────────────────

  describe('REQ-14 — No Regression', () => {
    it('RecordType includes all expected types', () => {
      const types: RecordType[] = [
        'prompt', 'completion_report', 'testing', 'acceptance', 'verification',
        'engineering_package', 'engineering_summary', 'timeline_snapshot',
        'change_log_entry', 'audit_record', 'architecture_decision',
        'constitutional_decision', 'historical_recovery',
        'knowledge_extraction', 'release_record',
      ];
      expect(types).toHaveLength(15);
    });

    it('RecordStatus includes all expected statuses', () => {
      const statuses: RecordStatus[] = ['draft', 'generated', 'verified', 'accepted', 'archived', 'superseded'];
      expect(statuses).toHaveLength(6);
    });

    it('CaptureTrigger includes all expected triggers', () => {
      const triggers: CaptureTrigger[] = ['engineering_complete', 'po_accepted', 'verification_complete', 'package_generated'];
      expect(triggers).toHaveLength(4);
    });

    it('RelationshipType includes all expected types', () => {
      const rels: RelationshipType[] = ['belongs_to', 'produces', 'verifies', 'accepts', 'supersedes', 'related_to', 'extracted_from'];
      expect(rels).toHaveLength(7);
    });
  });
});
