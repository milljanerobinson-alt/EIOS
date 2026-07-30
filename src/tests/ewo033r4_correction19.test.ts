import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const adapterSrc = fs.readFileSync(
  path.resolve(__dirname, '../lib/interactionChannelAdapter.ts'),
  'utf-8',
);

describe('EWO-033R.4 Correction 19 — conversation association updates on completion decisions', () => {
  describe('handleCompletionMessage signature', () => {
    it('accepts conversationId in context', () => {
      expect(adapterSrc).toContain('context: { userId?: string; ideaId: string; conversationId?: string }');
    });
  });

  describe('Accept path updates conversation association to closed', () => {
    it('calls ConversationAssociationService.findCanonical after successful accept', () => {
      const acceptIdx = adapterSrc.indexOf('acceptCompletion(executionId');
      expect(acceptIdx).toBeGreaterThan(-1);
      const acceptBlock = adapterSrc.substring(acceptIdx, acceptIdx + 500);
      expect(acceptBlock).toContain('result.success');
      expect(acceptBlock).toContain('ConversationAssociationService.findCanonical');
      expect(acceptBlock).toContain("updateStage(assoc.id, 'closed'");
    });
  });

  describe('Reject path updates conversation association to failed', () => {
    it('calls ConversationAssociationService.updateStage with failed after reject', () => {
      const rejectIdx = adapterSrc.indexOf('rejectCompletion(executionId');
      expect(rejectIdx).toBeGreaterThan(-1);
      const rejectBlock = adapterSrc.substring(rejectIdx, rejectIdx + 500);
      expect(rejectBlock).toContain('result.success');
      expect(rejectBlock).toContain("updateStage(assoc.id, 'failed'");
    });
  });

  describe('Refinement path updates conversation association to preparing_execution', () => {
    it('calls ConversationAssociationService.updateStage with preparing_execution after refinement', () => {
      const refineIdx = adapterSrc.indexOf('requestRefinement(executionId');
      expect(refineIdx).toBeGreaterThan(-1);
      const refineBlock = adapterSrc.substring(refineIdx, refineIdx + 500);
      expect(refineBlock).toContain('result.success');
      expect(refineBlock).toContain("updateStage(assoc.id, 'preparing_execution'");
    });
  });

  describe('All three paths guard on result.success', () => {
    it('accept path guards on result.success before updating association', () => {
      const acceptIdx = adapterSrc.indexOf('acceptCompletion(executionId');
      const acceptBlock = adapterSrc.substring(acceptIdx, acceptIdx + 500);
      expect(acceptBlock).toContain('if (result.success)');
    });

    it('reject path guards on result.success before updating association', () => {
      const rejectIdx = adapterSrc.indexOf('rejectCompletion(executionId');
      const rejectBlock = adapterSrc.substring(rejectIdx, rejectIdx + 500);
      expect(rejectBlock).toContain('if (result.success)');
    });

    it('refinement path guards on result.success before updating association', () => {
      const refineIdx = adapterSrc.indexOf('requestRefinement(executionId');
      const refineBlock = adapterSrc.substring(refineIdx, refineIdx + 500);
      expect(refineBlock).toContain('if (result.success)');
    });
  });

  describe('All three paths guard assoc existence', () => {
    it('accept path checks assoc before calling updateStage', () => {
      const acceptIdx = adapterSrc.indexOf('acceptCompletion(executionId');
      const acceptBlock = adapterSrc.substring(acceptIdx, acceptIdx + 500);
      expect(acceptBlock).toContain('if (assoc)');
    });

    it('reject path checks assoc before calling updateStage', () => {
      const rejectIdx = adapterSrc.indexOf('rejectCompletion(executionId');
      const rejectBlock = adapterSrc.substring(rejectIdx, rejectIdx + 500);
      expect(rejectBlock).toContain('if (assoc)');
    });

    it('refinement path checks assoc before calling updateStage', () => {
      const refineIdx = adapterSrc.indexOf('requestRefinement(executionId');
      const refineBlock = adapterSrc.substring(refineIdx, refineIdx + 500);
      expect(refineBlock).toContain('if (assoc)');
    });
  });
});
