import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import * as fs from 'fs';
import * as React from 'react';
import type { DuplicateIntelligenceResult } from '../lib/duplicateIntelligenceService';

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

import { ATDConversationPackage } from '../components/ATDConversationPackage';

// ─── Real-interface fixtures ──────────────────────────────────────────────────
// These use ONLY fields defined on DuplicateIntelligenceResult — no fabricated
// `findings` or `summary` fields, mirroring what analyseDuplicates() returns.

function makeResult(overrides: Partial<DuplicateIntelligenceResult> = {}): DuplicateIntelligenceResult {
  return {
    recordId: 'rec-001',
    hasFindings: true,
    recommendation: 'continue_existing',
    confidence: 95,
    explanationText: 'An active Engineering Intent with a matching title already exists.',
    recommendationLabel: 'Continue Existing Work',
    existingObject: { id: 'intent-123', ref: 'EWO-INT-001', lifecycleStatus: 'active' },
    analysedAt: '2026-07-27T00:00:00Z',
    ...overrides,
  };
}

const baseProps = {
  status: 'duplicate_found' as const,
  intent: null,
  analysisDraft: null,
  planDraft: null,
  analysis: null,
  plan: null,
  errorMessage: null,
  executionPreparationSteps: null,
  executionPipeline: null,
  executionResult: null,
  onDuplicateProceed: vi.fn(),
  onDuplicateContinueExisting: vi.fn(),
  onApproveAnalysis: vi.fn(),
  onRegenerateAnalysis: vi.fn(),
  onApprovePlan: vi.fn(),
  onRegeneratePlan: vi.fn(),
  onPrepareExecution: vi.fn(),
  onExecute: vi.fn(),
  onCreateAnother: vi.fn(),
};

describe('EWO-032R.4 — DuplicateBanner Render Failure Regression', () => {

  // ─── REQ-7: no code reads result.findings ─────────────────────────────────────
  describe('REQ-7 — result.findings is no longer referenced', () => {
    it('component source does not reference result.findings', () => {
      const content = fs.readFileSync('src/components/ATDConversationPackage.tsx', 'utf-8');
      expect(content).not.toContain('result.findings');
    });

    it('component source does not reference result.summary', () => {
      const content = fs.readFileSync('src/components/ATDConversationPackage.tsx', 'utf-8');
      expect(content).not.toContain('result.summary');
    });

    it('component source references result.explanationText', () => {
      const content = fs.readFileSync('src/components/ATDConversationPackage.tsx', 'utf-8');
      expect(content).toContain('result.explanationText');
    });

    it('component source references result.hasFindings', () => {
      const content = fs.readFileSync('src/components/ATDConversationPackage.tsx', 'utf-8');
      expect(content).toContain('result.hasFindings');
    });

    it('component source references result.existingObject', () => {
      const content = fs.readFileSync('src/components/ATDConversationPackage.tsx', 'utf-8');
      expect(content).toContain('result.existingObject');
    });
  });

  // ─── REQ-2: real interface only ──────────────────────────────────────────────
  describe('REQ-2 — DuplicateIntelligenceResult uses the current real interface', () => {
    it('fixture uses only real interface fields', () => {
      const result = makeResult();
      expect(result).not.toHaveProperty('findings');
      expect(result).not.toHaveProperty('summary');
      expect(result).toHaveProperty('hasFindings');
      expect(result).toHaveProperty('explanationText');
      expect(result).toHaveProperty('existingObject');
      expect(result).toHaveProperty('recommendationLabel');
      expect(result).toHaveProperty('confidence');
    });
  });

  // ─── REQ-3: hasFindings=true with existingObject ──────────────────────────────
  describe('REQ-3 — hasFindings=true with existingObject renders without error', () => {
    it('renders DuplicateBanner without throwing', () => {
      const props = { ...baseProps, duplicateResult: makeResult() };
      expect(() => renderToString(React.createElement(ATDConversationPackage, props as any))).not.toThrow();
    });

    it('renders the existing object ref', () => {
      const props = { ...baseProps, duplicateResult: makeResult() };
      const html = renderToString(React.createElement(ATDConversationPackage, props as any));
      expect(html).toContain('EWO-INT-001');
    });

    it('renders the Open Existing button', () => {
      const props = { ...baseProps, duplicateResult: makeResult() };
      const html = renderToString(React.createElement(ATDConversationPackage, props as any));
      expect(html).toContain('Open Existing');
    });
  });

  // ─── REQ-4: hasFindings=false ─────────────────────────────────────────────────
  describe('REQ-4 — hasFindings=false renders without error', () => {
    it('renders without throwing', () => {
      const result = makeResult({
        hasFindings: false,
        recommendation: 'proceed',
        recommendationLabel: 'Proceed — No Duplicates Found',
        confidence: 0,
        existingObject: undefined,
      });
      const props = { ...baseProps, duplicateResult: result };
      expect(() => renderToString(React.createElement(ATDConversationPackage, props as any))).not.toThrow();
    });

    it('does not render the Open Existing button', () => {
      const result = makeResult({
        hasFindings: false,
        recommendation: 'proceed',
        recommendationLabel: 'Proceed — No Duplicates Found',
        confidence: 0,
        existingObject: undefined,
      });
      const props = { ...baseProps, duplicateResult: result };
      const html = renderToString(React.createElement(ATDConversationPackage, props as any));
      expect(html).not.toContain('Open Existing');
    });
  });

  // ─── REQ-5: hasFindings=true but no existingObject ────────────────────────────
  describe('REQ-5 — hasFindings=true with no existingObject renders safely', () => {
    it('renders without throwing', () => {
      const result = makeResult({
        hasFindings: true,
        existingObject: undefined,
      });
      const props = { ...baseProps, duplicateResult: result };
      expect(() => renderToString(React.createElement(ATDConversationPackage, props as any))).not.toThrow();
    });

    it('renders a safe fallback message', () => {
      const result = makeResult({
        hasFindings: true,
        existingObject: undefined,
      });
      const props = { ...baseProps, duplicateResult: result };
      const html = renderToString(React.createElement(ATDConversationPackage, props as any));
      expect(html).toContain('potential duplicate was detected');
    });
  });

  // ─── REQ-6: explanationText rendered instead of summary ───────────────────────
  describe('REQ-6 — explanationText is rendered instead of summary', () => {
    it('renders explanationText content', () => {
      const result = makeResult({ explanationText: 'A unique explanation for this test.' });
      const props = { ...baseProps, duplicateResult: result };
      const html = renderToString(React.createElement(ATDConversationPackage, props as any));
      expect(html).toContain('A unique explanation for this test.');
    });

    it('renders safely when explanationText is empty', () => {
      const result = makeResult({ explanationText: '' });
      const props = { ...baseProps, duplicateResult: result };
      expect(() => renderToString(React.createElement(ATDConversationPackage, props as any))).not.toThrow();
    });

    it('renders safely when explanationText is absent', () => {
      const result = makeResult({ explanationText: undefined } as any);
      const props = { ...baseProps, duplicateResult: result };
      expect(() => renderToString(React.createElement(ATDConversationPackage, props as any))).not.toThrow();
    });
  });

  // ─── REQ-5b: recommendationLabel / confidence absent ─────────────────────────
  describe('optional fields absent render safely', () => {
    it('renders safely when recommendationLabel is absent', () => {
      const result = makeResult({ recommendationLabel: undefined } as any);
      const props = { ...baseProps, duplicateResult: result };
      expect(() => renderToString(React.createElement(ATDConversationPackage, props as any))).not.toThrow();
    });

    it('renders safely when confidence is absent', () => {
      const result = makeResult({ confidence: undefined } as any);
      const props = { ...baseProps, duplicateResult: result };
      expect(() => renderToString(React.createElement(ATDConversationPackage, props as any))).not.toThrow();
    });
  });

  // ─── REQ-1 & REQ-8: transient duplicate_found renders without feature boundary ──
  describe('REQ-1/8 — duplicate_found transient state renders without crashing', () => {
    it('DuplicateBanner renders when status is duplicate_found', () => {
      const props = { ...baseProps, duplicateResult: makeResult() };
      expect(() => renderToString(React.createElement(ATDConversationPackage, props as any))).not.toThrow();
    });

    it('does not throw undefined.length exception for real-interface result', () => {
      // This reproduces the original crash: a real DuplicateIntelligenceResult
      // (no findings field) fed to DuplicateBanner during the transient state.
      const realResult: DuplicateIntelligenceResult = {
        recordId: 'rec-live',
        hasFindings: true,
        recommendation: 'continue_existing',
        confidence: 95,
        explanationText: 'Live orchestration detected a duplicate.',
        recommendationLabel: 'Continue Existing Work',
        existingObject: { id: 'live-intent', ref: 'EWO-LIVE-001', lifecycleStatus: 'active' },
        analysedAt: '2026-07-27T00:00:00Z',
      };
      const props = { ...baseProps, duplicateResult: realResult };
      expect(() => renderToString(React.createElement(ATDConversationPackage, props as any))).not.toThrow();
    });
  });

  // ─── REQ-9: ExecutionPreparationChecklist receives correct isExecuting prop ──
  describe('REQ-9 — ExecutionPreparationChecklist prop correction', () => {
    it('call site passes isExecuting (not isReady)', () => {
      const content = fs.readFileSync('src/components/ATDConversationPackage.tsx', 'utf-8');
      expect(content).toContain('isExecuting={isExecuting}');
      expect(content).not.toContain('isReady={isAwaitingExecution}');
    });
  });

  // ─── REQ-10: ExecutionCompleteCard receives full intent object ────────────────
  describe('REQ-10 — ExecutionCompleteCard prop correction', () => {
    it('call site passes intent object (not intentId)', () => {
      const content = fs.readFileSync('src/components/ATDConversationPackage.tsx', 'utf-8');
      expect(content).toContain('intent={intent}');
      expect(content).not.toContain('intentId={intent.id}');
    });
  });

  // ─── REQ-11: persisted conversation still renders ────────────────────────────
  describe('REQ-11 — reopening persisted conversation renders successfully', () => {
    it('renders the complete state without throwing', () => {
      // On reload the status is 'complete' with executionResult populated —
      // DuplicateBanner does not mount, the engineering review renders.
      const props = {
        ...baseProps,
        status: 'complete' as const,
        intent: {
          id: 'intent-001',
          intent_ref: 'EWO-INT-001',
          title: 'Fresh governed Codex canary engineering work order',
          lifecycle_status: 'active',
        } as any,
        executionResult: {
          ideaRef: 'EWO-IDEA-001',
          ideaId: 'idea-001',
          intentRef: 'EWO-INT-001',
          sessionRef: 'ses-001',
          recordRef: 'rec-001',
          pipeline: [],
        } as any,
      };
      expect(() => renderToString(React.createElement(ATDConversationPackage, props as any))).not.toThrow();
    });
  });
});
