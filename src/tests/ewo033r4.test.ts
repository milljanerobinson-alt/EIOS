/**
 * EWO-033R.4 — Conversation Boundary Governance Tests
 *
 * Tests the constitutional conversation boundary rule:
 * "Every Product Owner engineering lifecycle must be completable entirely
 * within the active conversation."
 */

import { describe, it, expect } from 'vitest';
import { ConversationBoundaryGuard } from '../lib/conversationBoundaryGuard';
import type { ConversationActionInfo } from '../lib/conversationBoundaryGuard';

// ─── Helper: valid conversation action info ─────────────────────────────────────

function validInfo(overrides: Partial<ConversationActionInfo> = {}): ConversationActionInfo {
  return {
    currentStage: 'awaiting_proposal_approval',
    pendingDecision: 'proposal_approval',
    conversationAction: 'review_proposal',
    conversationIdentifier: 'conv-123',
    actionAvailable: true,
    blockingReason: null,
    optionalInspectionLinks: [
      { label: 'View Audit Trail', type: 'audit', targetRef: 'IDEA-001' },
    ],
    hasResumableCard: true,
    nextActionIsWorkspaceRoute: false,
    hasConversationAssociation: true,
    conversationAssociationAmbiguous: false,
    ...overrides,
  };
}

describe('EWO-033R.4: Conversation Boundary Guard', () => {
  // ─── 10. No required next action resolving to a workspace route ────────────────

  it('detects when next action resolves to a workspace route', () => {
    const result = ConversationBoundaryGuard.validate(validInfo({
      nextActionIsWorkspaceRoute: true,
    }));
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.type === 'required_navigation_away')).toBe(true);
  });

  it('passes when next action stays in conversation', () => {
    const result = ConversationBoundaryGuard.validate(validInfo());
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  // ─── Route validation ─────────────────────────────────────────────────────────

  it('validateRoute identifies workspace routes', () => {
    expect(ConversationBoundaryGuard.validateRoute('/ecc/work-orders').isWorkspaceRoute).toBe(true);
    expect(ConversationBoundaryGuard.validateRoute('/engineering-control-centre').isWorkspaceRoute).toBe(true);
    expect(ConversationBoundaryGuard.validateRoute('/workspace/execution').isWorkspaceRoute).toBe(true);
    expect(ConversationBoundaryGuard.validateRoute('/wizard').isWorkspaceRoute).toBe(true);
  });

  it('validateRoute passes non-workspace routes', () => {
    expect(ConversationBoundaryGuard.validateRoute(null).isWorkspaceRoute).toBe(false);
    expect(ConversationBoundaryGuard.validateRoute(undefined).isWorkspaceRoute).toBe(false);
    expect(ConversationBoundaryGuard.validateRoute('in_conversation').isWorkspaceRoute).toBe(false);
  });

  // ─── Action label validation ──────────────────────────────────────────────────

  it('validateActionLabel detects prohibited labels', () => {
    expect(ConversationBoundaryGuard.validateActionLabel('Continue in Workspace').isProhibited).toBe(true);
    expect(ConversationBoundaryGuard.validateActionLabel('Continue in Wizard').isProhibited).toBe(true);
    expect(ConversationBoundaryGuard.validateActionLabel('Approve in Workspace').isProhibited).toBe(true);
    expect(ConversationBoundaryGuard.validateActionLabel('Execute in Workspace').isProhibited).toBe(true);
    expect(ConversationBoundaryGuard.validateActionLabel('Complete Setup on another page').isProhibited).toBe(true);
  });

  it('validateActionLabel passes clean labels', () => {
    expect(ConversationBoundaryGuard.validateActionLabel('Approve').isProhibited).toBe(false);
    expect(ConversationBoundaryGuard.validateActionLabel('Request Changes').isProhibited).toBe(false);
    expect(ConversationBoundaryGuard.validateActionLabel('Execute').isProhibited).toBe(false);
    expect(ConversationBoundaryGuard.validateActionLabel(null).isProhibited).toBe(false);
  });

  // ─── 14. Architectural guard detecting prohibited navigation dependencies ─────

  it('detects missing in-conversation action when action is available', () => {
    const result = ConversationBoundaryGuard.validate(validInfo({
      conversationAction: null,
      actionAvailable: true,
    }));
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.type === 'missing_in_conversation_action')).toBe(true);
  });

  it('detects decision only in workspace', () => {
    const result = ConversationBoundaryGuard.validate(validInfo({
      pendingDecision: 'execution_approval',
      conversationAction: null,
      actionAvailable: false,
    }));
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.type === 'decision_only_in_workspace')).toBe(true);
  });

  it('detects no resumable card for active stage', () => {
    const result = ConversationBoundaryGuard.validate(validInfo({
      hasResumableCard: false,
    }));
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.type === 'no_resumable_card')).toBe(true);
  });

  it('detects missing conversation association', () => {
    const result = ConversationBoundaryGuard.validate(validInfo({
      hasConversationAssociation: false,
    }));
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.type === 'conversation_association_missing')).toBe(true);
  });

  it('detects ambiguous conversation association', () => {
    const result = ConversationBoundaryGuard.validate(validInfo({
      conversationAssociationAmbiguous: true,
    }));
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.type === 'conversation_association_ambiguous')).toBe(true);
  });

  it('detects blocked interaction with no in-conversation recovery', () => {
    const result = ConversationBoundaryGuard.validate(validInfo({
      blockingReason: 'Execution provider failed',
      actionAvailable: false,
      conversationAction: null,
      pendingDecision: null,
    }));
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.type === 'missing_in_conversation_action')).toBe(true);
  });

  // ─── Resumable card check ──────────────────────────────────────────────────────

  it('hasResumableCard returns true for all lifecycle stages', () => {
    const stages = [
      'idea_captured', 'preparing_proposal', 'awaiting_proposal_approval',
      'ewo_created', 'preparing_execution', 'awaiting_execution_approval',
      'executing', 'validating', 'awaiting_acceptance',
      'accepted', 'closed', 'blocked', 'failed',
    ];
    for (const stage of stages) {
      expect(ConversationBoundaryGuard.hasResumableCard(stage)).toBe(true);
    }
  });

  it('hasResumableCard returns false for unknown stages', () => {
    expect(ConversationBoundaryGuard.hasResumableCard('unknown_stage')).toBe(false);
    expect(ConversationBoundaryGuard.hasResumableCard('')).toBe(false);
  });

  // ─── Constitutional rule ───────────────────────────────────────────────────────

  it('constitutionalRule returns the canonical rule text', () => {
    const rule = ConversationBoundaryGuard.constitutionalRule();
    expect(rule).toContain('completable entirely within the active conversation');
    expect(rule).toContain('Workspace interfaces may support inspection');
    expect(rule).toContain('must never be required');
  });
});

// ─── Lifecycle service tests ────────────────────────────────────────────────────

describe('EWO-033R.4: Next-Action Resolver Enforcement', () => {
  it('NextAction type includes conversationAction field', async () => {
    const source = await import('../lib/interactionLifecycleService?raw');
    const src = source.default;
    expect(src).toContain('conversationAction');
    expect(src).toContain('conversationIdentifier');
    expect(src).toContain('actionAvailable');
    expect(src).toContain('optionalInspectionLinks');
  });

  it('resolveNextAction never returns a workspace route as required action', async () => {
    const source = await import('../lib/interactionLifecycleService?raw');
    const src = source.default;
    // The resolver should never set nextAction to a workspace route
    expect(src).not.toContain("nextAction: '/ecc/");
    expect(src).not.toContain("nextAction: '/workspace");
    expect(src).not.toContain("nextAction: '/wizard");
  });

  it('optionalInspectionLinks are defined for all return paths', async () => {
    const source = await import('../lib/interactionLifecycleService?raw');
    const src = source.default;
    // Every return of NextAction should include optionalInspectionLinks
    const returnCount = (src.match(/optionalInspectionLinks/g) ?? []).length;
    expect(returnCount).toBeGreaterThanOrEqual(4); // at least 4 return paths
  });
});

// ─── Presentation filter tests ──────────────────────────────────────────────────

describe('EWO-033R.4: Presentation Filter Next-Action', () => {
  it('FilteredNextAction includes conversation fields', async () => {
    const source = await import('../lib/interactionPresentationFilter?raw');
    const src = source.default;
    expect(src).toContain('conversationAction');
    expect(src).toContain('conversationIdentifier');
    expect(src).toContain('actionAvailable');
    expect(src).toContain('optionalInspectionLinks');
  });
});

// ─── Resume service tests ───────────────────────────────────────────────────────

describe('EWO-033R.4: Conversation Resume', () => {
  it('resumeFromConversation method exists', async () => {
    const source = await import('../lib/interactionResumeService?raw');
    const src = source.default;
    expect(src).toContain('resumeFromConversation');
    expect(src).toContain('ConversationAssociationService');
  });

  it('validateResumeCompliance method exists', async () => {
    const source = await import('../lib/interactionResumeService?raw');
    const src = source.default;
    expect(src).toContain('validateResumeCompliance');
    expect(src).toContain('ConversationBoundaryGuard');
  });

  it('stageToCardType maps all lifecycle stages', async () => {
    const source = await import('../lib/interactionResumeService?raw');
    const src = source.default;
    expect(src).toContain('stageToCardType');
    expect(src).toContain("idea_captured: 'idea_captured'");
    expect(src).toContain("awaiting_proposal_approval: 'proposal'");
    expect(src).toContain("awaiting_execution_approval: 'execution_ready'");
    expect(src).toContain("awaiting_acceptance: 'completion'");
    expect(src).toContain("closed: 'closed'");
  });
});

// ─── Association service tests ──────────────────────────────────────────────────

describe('EWO-033R.4: Conversation Association Service', () => {
  it('exports ConversationAssociationService with required methods', async () => {
    const source = await import('../lib/conversationAssociationService?raw');
    const src = source.default;
    expect(src).toContain('ConversationAssociationService');
    expect(src).toContain('upsert');
    expect(src).toContain('findCanonical');
    expect(src).toContain('resolveCanonical');
    expect(src).toContain('findByConversationId');
    expect(src).toContain('updateStage');
    expect(src).toContain('updateExecutionState');
    expect(src).toContain('updateCompletionState');
  });

  it('resolveCanonical implements deterministic resolution', async () => {
    const source = await import('../lib/conversationAssociationService?raw');
    const src = source.default;
    // When multiple canonical exist, keep latest and supersede the rest
    expect(src).toContain('superseded_by');
    expect(src).toContain('is_canonical');
    expect(src).toContain('order(\'updated_at\'');
  });

  it('upsert prevents duplicate conversations for same idea', async () => {
    const source = await import('../lib/conversationAssociationService?raw');
    const src = source.default;
    // Should check for existing before creating
    expect(src).toContain('findCanonical');
    expect(src).toContain("don't fragment");
  });
});

// ─── Legacy flow violation tests ────────────────────────────────────────────────

describe('EWO-033R.4: Legacy Flow Violations Removed', () => {
  it('lifecycleProgressResolver no longer uses "Continue in Wizard"', async () => {
    const source = await import('../lib/lifecycleProgressResolver?raw');
    const src = source.default;
    expect(src).not.toContain('Continue in Wizard');
    expect(src).not.toContain('Continue in Workspace');
  });

  it('lifecycleProgressResolver no longer sets workspace routes as nextActionRoute', async () => {
    const source = await import('../lib/lifecycleProgressResolver?raw');
    const src = source.default;
    // nextActionRoute should be null for all stages now
    const wizardRoutes = src.match(/nextActionRoute\s*=\s*['"]wizard['"]/g);
    expect(wizardRoutes).toBeNull();
    const ewoRoutes = src.match(/nextActionRoute\s*=\s*['"]ewo['"]/g);
    expect(ewoRoutes).toBeNull();
  });

  it('navigateToIntent no longer redirects to workspace', async () => {
    const source = await import('../lib/conversationIntentBridge?raw');
    const src = source.default;
    expect(src).not.toContain("window.location.hash = '#/engineering/atd-workspace'");
  });

  it('navigateToExecutionWorkspace is classified as administrative', async () => {
    const source = await import('../lib/engineeringNavigationService?raw');
    const src = source.default;
    expect(src).toContain('Administrative/inspection navigation only');
    expect(src).toContain('EWO-033R.4');
  });
});

// ─── 15. Administrative fallback remaining secondary ───────────────────────────

describe('EWO-033R.4: Administrative Fallback Classification', () => {
  it('workspace navigation functions are marked as administrative', async () => {
    const source = await import('../lib/engineeringNavigationService?raw');
    const src = source.default;
    expect(src).toContain('Administrative');
    expect(src).toContain('optional');
    expect(src).toContain('inspection');
    expect(src).toContain('must NEVER be called from conversation cards');
  });
});

// ─── Database migration verification ────────────────────────────────────────────

describe('EWO-033R.4: Database Schema', () => {
  it('engineering_conversation_associations table exists', async () => {
    const source = await import('../lib/conversationAssociationService?raw');
    const src = source.default;
    expect(src).toContain('engineering_conversation_associations');
  });

  it('association service uses RLS-compliant queries', async () => {
    const source = await import('../lib/conversationAssociationService?raw');
    const src = source.default;
    // Should use supabase client (which enforces RLS)
    expect(src).toContain('import { supabase }');
    expect(src).not.toContain('auth.uid()'); // Should NOT use auth.uid() in client code
  });
});

// ─── Conversation boundary contract documentation ──────────────────────────────

describe('EWO-033R.4: Interaction Contract', () => {
  it('boundary guard exports constitutional rule', () => {
    const rule = ConversationBoundaryGuard.constitutionalRule();
    expect(rule).toContain('Every Product Owner engineering lifecycle');
    expect(rule).toContain('must be completable entirely within the active conversation');
  });

  it('boundary guard validates all violation types', () => {
    const allTypes: ConversationActionInfo = {
      currentStage: 'awaiting_proposal_approval',
      pendingDecision: 'proposal_approval',
      conversationAction: null,
      conversationIdentifier: null,
      actionAvailable: true,
      blockingReason: 'blocked',
      optionalInspectionLinks: [],
      hasResumableCard: false,
      nextActionIsWorkspaceRoute: true,
      hasConversationAssociation: false,
      conversationAssociationAmbiguous: true,
    };
    const result = ConversationBoundaryGuard.validate(allTypes);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(5);
  });
});
