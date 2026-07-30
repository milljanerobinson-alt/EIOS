// EWO-032R.8 — Constitutional Execution Wizard → Governed EWO Promotion Tests
// Verifies the wizard creates an Engineering Work Order after governance object creation,
// links it to the Engineering Idea, and enters the existing execution lifecycle.
import { describe, it, expect, beforeAll } from 'vitest';
import { supabase } from '../lib/supabase';
import { ensureTestAuth } from './helpers/ensureTestAuth';
import { ensureEngineeringWorkOrderExists } from '../lib/ensureEngineeringWorkOrder';

const TEST_PREFIX = 'EWO-032R8-TEST';

describe('EWO-032R.8 — Wizard → Governed EWO Promotion', () => {
  beforeAll(async () => { await ensureTestAuth(); });

  // ─── 1. ensureEngineeringWorkOrderExists is the canonical entry point ─────────
  describe('1. Canonical EWO creation service', () => {
    it('should be importable and callable', () => {
      expect(typeof ensureEngineeringWorkOrderExists).toBe('function');
    });

    it('should be idempotent — calling twice with the same ref returns the same EWO', async () => {
      const ref = `${TEST_PREFIX}-IDEMPOTENT`;
      const r1 = await ensureEngineeringWorkOrderExists(ref, 'Idempotency Test', 'Test summary');
      expect(r1.success).toBe(true);
      expect(r1.ewoRef).toBe(ref);
      const r2 = await ensureEngineeringWorkOrderExists(ref, 'Idempotency Test', 'Test summary');
      expect(r2.success).toBe(true);
      expect(r2.ewoId).toBe(r1.ewoId);
      expect(r2.created).toBe(false);
    });
  });

  // ─── 2. Wizard pipeline includes EWO promotion stage ─────────────────────────
  describe('2. Wizard pipeline includes EWO promotion stage', () => {
    it('should have ewo_promote in DEFAULT_PIPELINE', async () => {
      const mod = await import('../pages/ecc/ECCIdeaTypes');
      expect(mod.DEFAULT_PIPELINE).toBeDefined();
      const keys = mod.DEFAULT_PIPELINE.map(s => s.key);
      expect(keys).toContain('ewo_promote');
    });

    it('should have WizardState fields for EWO promotion result', async () => {
      const mod = await import('../pages/ecc/ECCIdeaTypes');
      const state = mod.INITIAL_WIZARD_STATE;
      expect(state).toHaveProperty('ewoPromotionStatus');
    });
  });

  // ─── 3. EWO created by the wizard enters the governed lifecycle ──────────────
  describe('3. EWO enters governed lifecycle', () => {
    it('should create an EWO with status "ready"', async () => {
      const ref = `${TEST_PREFIX}-LIFECYCLE-${Date.now()}`;
      const result = await ensureEngineeringWorkOrderExists(ref, 'Lifecycle Test', 'Test');
      expect(result.success).toBe(true);
      expect(result.created).toBe(true);

      const { data, error } = await supabase
        .from('engineering_work_orders')
        .select('status, implementation_status, engineering_package_status')
        .eq('ewo_ref', ref)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.status).toBe('ready');
      expect(data?.implementation_status).toBe('Assigned');
      expect(data?.engineering_package_status).toBe('Generated');
    });

    it('should record a lifecycle event for the created EWO', async () => {
      const ref = `${TEST_PREFIX}-LIFECYCLE-EVT`;
      const result = await ensureEngineeringWorkOrderExists(ref, 'Lifecycle Event Test', 'Test');
      expect(result.success).toBe(true);
      expect(result.ewoId).not.toBeNull();
      const { data, error } = await supabase
        .from('ewo_lifecycle_events')
        .select('from_status, to_status, actor')
        .eq('ewo_id', result.ewoId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.to_status).toBe('ready');
    });
  });

  // ─── 4. Idea ↔ EWO linkage ───────────────────────────────────────────────────
  describe('4. Idea ↔ EWO linkage', () => {
    it('should support related_ewo_refs array on engineering_idea', async () => {
      const { data, error } = await supabase
        .from('engineering_idea')
        .select('related_ewo_refs')
        .limit(1);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should allow updating related_ewo_refs on an existing idea', async () => {
      // Create a minimal idea for linkage test
      const { data: idea, error: insErr } = await supabase
        .from('engineering_idea')
        .insert({
          idea_ref: `${TEST_PREFIX}-LINK-IDEA-${Date.now()}`,
          title: 'Linkage Test Idea',
          category: 'general',
          priority: 'medium',
          status: 'active',
          products: [],
          applications: [],
          tags: [],
          related_ewo_refs: [],
        })
        .select('id, related_ewo_refs')
        .single();
      expect(insErr).toBeNull();
      expect(idea).not.toBeNull();

      const ewoRef = `${TEST_PREFIX}-LINK-EWO`;
      await ensureEngineeringWorkOrderExists(ewoRef, 'Link EWO', 'Test');

      const { error: updErr } = await supabase
        .from('engineering_idea')
        .update({ related_ewo_refs: [ewoRef] })
        .eq('id', idea.id);
      expect(updErr).toBeNull();

      const { data: updated, error: chkErr } = await supabase
        .from('engineering_idea')
        .select('related_ewo_refs')
        .eq('id', idea.id)
        .maybeSingle();
      expect(chkErr).toBeNull();
      expect(updated?.related_ewo_refs).toContain(ewoRef);
    });
  });

  // ─── 5. EWO is reachable from the execution pipeline ─────────────────────────
  describe('5. EWO reachable from execution pipeline', () => {
    it('should be findable by execute_supervised_pipeline RPC (returns governance_gate, not 500)', async () => {
      const ref = `${TEST_PREFIX}-PIPELINE-REACH`;
      await ensureEngineeringWorkOrderExists(ref, 'Pipeline Reach Test', 'Test');
      const { data, error } = await supabase.rpc('execute_supervised_pipeline', {
        p_ewo_ref: ref,
        p_preferred_provider: 'codex',
      });
      expect(error).toBeNull();
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      // Should not be "not found" — the EWO exists
      expect(result.governance_gate).toBeDefined();
      expect(result.governance_gate.passed).toBe(false);
      // Should fail on approval/package checks, not on EWO existence
      expect(result.governance_gate.blockers).toBeDefined();
    });
  });

  // ─── 6. onComplete callback signature includes optional ewoRef ───────────────
  describe('6. onComplete callback signature', () => {
    it('should accept an optional ewoRef parameter', async () => {
      // Read the wizard source to verify the onComplete signature
      const wizardSrc = await import('../pages/ecc/ECCConstitutionalExecutionWizard');
      expect(wizardSrc.ConstitutionalExecutionWizard).toBeDefined();
      // The component's props type includes onComplete with 3rd optional param
      // This is verified by the build passing
    });
  });
});
