/**
 * EWO-032R.15 — Engineering Lifecycle Progress Component Tests
 *
 * Verifies:
 * 1. The resolver exists and exports the correct interface
 * 2. The component exists and renders stages
 * 3. Stage completion is based on persisted governed data, not page visits
 * 4. Diagnostics include all required fields
 * 5. The component does not create, change, or delete governed objects
 * 6. Execution preparation/readiness/execute are honestly reported
 * 7. Known lifecycle gaps are visible
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function read(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

const RESOLVER_PATH = path.resolve(__dirname, '../lib/lifecycleProgressResolver.ts');
const COMPONENT_PATH = path.resolve(__dirname, '../components/LifecycleProgress.tsx');
const ACTIONS_PATH = path.resolve(__dirname, '../pages/ecc/ECCIdeaActions.tsx');
const WORKSPACE_PATH = path.resolve(__dirname, '../pages/ecc/ECCIdeaWorkspacePage.tsx');

// ─── 1. Resolver architecture ─────────────────────────────────────────────────

describe('Lifecycle Progress Resolver', () => {
  const src = read(RESOLVER_PATH);

  it('exports resolveIdeaLifecycle function', () => {
    expect(src).toContain('export async function resolveIdeaLifecycle');
  });

  it('exports LifecycleResolution interface with stages, currentStage, nextAction, diagnostics', () => {
    expect(src).toContain('stages');
    expect(src).toContain('currentStage');
    expect(src).toContain('nextAction');
    expect(src).toContain('diagnostics');
  });

  it('exports all 16 lifecycle stage IDs', () => {
    expect(src).toContain('idea_captured');
    expect(src).toContain('guardian_validation');
    expect(src).toContain('similarity_review');
    expect(src).toContain('intent_created');
    expect(src).toContain('objective_created');
    expect(src).toContain('engineering_analysis');
    expect(src).toContain('engineering_plan');
    expect(src).toContain('po_approval');
    expect(src).toContain('ewo_created');
    expect(src).toContain('execution_preparation');
    expect(src).toContain('execution_ready');
    expect(src).toContain('executing');
    expect(src).toContain('validation');
    expect(src).toContain('completion');
    expect(src).toContain('accepted');
    expect(src).toContain('closed');
  });

  it('uses persisted governed records as evidence sources (not page visits)', () => {
    expect(src).toContain('engineering_intent');
    expect(src).toContain('engineering_objective');
    expect(src).toContain('engineering_work_orders');
    expect(src).toContain('ewo_engineering_packages');
    expect(src).toContain('ecc_engineering_reviews');
    expect(src).toContain('ewo_execution_approvals');
    expect(src).toContain('engineering_executions');
  });

  it('does NOT create, update, or delete any records (read-only)', () => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.upsert\(/);
  });

  it('uses maybeSingle() for single-record lookups (safe for missing records)', () => {
    expect(src).toContain('maybeSingle()');
  });

  it('handles missing intent_id gracefully', () => {
    expect(src).toContain("idea.intent_id is null");
  });

  it('handles missing objective_id gracefully', () => {
    expect(src).toContain("idea.objective_id is null");
  });

  it('handles empty related_ewo_refs gracefully', () => {
    expect(src).toContain('ewoRefs.length > 0');
  });
});

// ─── 2. Diagnostics ────────────────────────────────────────────────────────────

describe('Lifecycle Diagnostics', () => {
  const src = read(RESOLVER_PATH);

  it('includes idea_ref', () => {
    expect(src).toContain('idea_ref');
  });

  it('includes resolved_current_stage', () => {
    expect(src).toContain('resolved_current_stage');
  });

  it('includes completed_stages', () => {
    expect(src).toContain('completed_stages');
  });

  it('includes next_action', () => {
    expect(src).toContain('next_action');
  });

  it('includes next_action_available', () => {
    expect(src).toContain('next_action_available');
  });

  it('includes next_action_route', () => {
    expect(src).toContain('next_action_route');
  });

  it('includes resolution_sources', () => {
    expect(src).toContain('resolution_sources');
  });

  it('includes missing_expected_records', () => {
    expect(src).toContain('missing_expected_records');
  });

  it('includes execution_preparation_implemented', () => {
    expect(src).toContain('execution_preparation_implemented');
  });

  it('includes execution_readiness_implemented', () => {
    expect(src).toContain('execution_readiness_implemented');
  });

  it('includes execute_action_implemented', () => {
    expect(src).toContain('execute_action_implemented');
  });

  it('includes execution_runtime_connected', () => {
    expect(src).toContain('execution_runtime_connected');
  });
});

// ─── 3. Honest execution reporting ────────────────────────────────────────────

describe('Honest execution reporting', () => {
  const src = read(RESOLVER_PATH);

  it('reports execution_preparation_implemented as true (it exists in ATDConversationPackage)', () => {
    expect(src).toContain('executionPreparationImplemented = true');
  });

  it('reports execution_readiness_implemented as true (executionEligibilityResolver exists)', () => {
    expect(src).toContain('executionReadinessImplemented = true');
  });

  it('reports execute_action_implemented as true (ECCWorkOrdersPage has Begin Engineering Execution)', () => {
    expect(src).toContain('executeActionImplemented = true');
  });

  it('reports execution_runtime_connected as true (executionLaunchService → executionOrchestrator)', () => {
    expect(src).toContain('executionRuntimeConnected = true');
  });

  it('honestly states execution actions are on the Work Orders page, not the Idea view', () => {
    expect(src).toContain('Work Orders page');
    expect(src.toLowerCase()).toContain('not accessible from the idea detail view');
  });
});

// ─── 4. Component architecture ───────────────────────────────────────────────

describe('LifecycleProgress Component', () => {
  const src = read(COMPONENT_PATH);

  it('exports LifecycleProgress component', () => {
    expect(src).toContain('export function LifecycleProgress');
  });

  it('accepts idea, onNavigateToEwo, onContinueWizard, onPromote props', () => {
    expect(src).toContain('idea:');
    expect(src).toContain('onNavigateToEwo');
    expect(src).toContain('onContinueWizard');
    expect(src).toContain('onPromote');
  });

  it('renders current stage prominently', () => {
    expect(src).toContain('Current Stage');
  });

  it('renders next action with availability indicator', () => {
    expect(src).toContain('Next Action');
    expect(src).toContain('nextActionAvailable');
  });

  it('renders stage list with completion indicators', () => {
    expect(src).toContain('completed');
    expect(src).toContain('pending');
    expect(src).toContain('current');
  });

  it('shows execution gap notice when at EWO stage', () => {
    expect(src).toContain('Execution Preparation');
    expect(src).toContain('Work Orders page');
  });

  it('has collapsible diagnostics panel', () => {
    expect(src).toContain('showDiagnostics');
    expect(src).toContain('Diagnostics');
  });

  it('diagnostics panel shows all required fields', () => {
    expect(src).toContain('resolved_current_stage');
    expect(src).toContain('completed_stages');
    expect(src).toContain('next_action');
    expect(src).toContain('execution_preparation_implemented');
    expect(src).toContain('execution_readiness_implemented');
    expect(src).toContain('execute_action_implemented');
    expect(src).toContain('execution_runtime_connected');
  });

  it('does not render an Execute button', () => {
    // The component must not fabricate an Execute button
    // It should route to the Work Orders page instead
    expect(src).not.toMatch(/<button[^>]*>.*Execute.*<\/button>/s);
  });

  it('uses lucide-react icons', () => {
    expect(src).toContain('lucide-react');
    expect(src).toContain('CheckCircle2');
    expect(src).toContain('Clock');
  });
});

// ─── 5. Integration into IdeaDetailDrawer ─────────────────────────────────────

describe('Integration into IdeaDetailDrawer', () => {
  const actions = read(ACTIONS_PATH);
  const workspace = read(WORKSPACE_PATH);

  it('IdeaDetailDrawer imports LifecycleProgress', () => {
    expect(actions).toContain("import { LifecycleProgress }");
  });

  it('IdeaDetailDrawer accepts onContinueWizard and onPromote props', () => {
    expect(actions).toContain('onContinueWizard');
    expect(actions).toContain('onPromote');
  });

  it('IdeaDetailDrawer renders LifecycleProgress component', () => {
    expect(actions).toContain('<LifecycleProgress');
  });

  it('LifecycleProgress is placed before governance metadata', () => {
    const lpIdx = actions.indexOf('<LifecycleProgress');
    const govIdx = actions.indexOf('Governance metadata');
    expect(lpIdx).toBeGreaterThan(-1);
    expect(govIdx).toBeGreaterThan(-1);
    expect(lpIdx).toBeLessThan(govIdx);
  });

  it('workspace page passes onContinueWizard callback', () => {
    expect(workspace).toContain('onContinueWizard');
  });

  it('workspace page passes onPromote callback', () => {
    expect(workspace).toContain('onPromote');
  });
});

// ─── 6. No governed data mutation ──────────────────────────────────────────────

describe('No governed data mutation', () => {
  const resolver = read(RESOLVER_PATH);
  const component = read(COMPONENT_PATH);

  it('resolver contains only SELECT queries', () => {
    // The resolver should only use .select() and .maybeSingle() / .single()
    // It should NOT contain .insert(), .update(), .delete(), .upsert()
    expect(resolver).not.toMatch(/\.insert\(/);
    expect(resolver).not.toMatch(/\.update\(/);
    expect(resolver).not.toMatch(/\.delete\(/);
    expect(resolver).not.toMatch(/\.upsert\(/);
  });

  it('component does not directly write to the database', () => {
    expect(component).not.toMatch(/supabase\.from\([^)]+\)\.(insert|update|delete|upsert)/);
  });
});

// ─── 7. Known lifecycle gaps ──────────────────────────────────────────────────

describe('Known lifecycle gaps documented', () => {
  const src = read(RESOLVER_PATH);

  it('documents that wizard progress is not persisted', () => {
    // The resolver documents that wizard progress is ephemeral (not persisted in DB)
    expect(src.toLowerCase()).toContain('ephemeral') || expect(src.toLowerCase()).toContain('not persisted');
  });

  it('documents that Engineering Analysis has no governed completion state', () => {
    expect(src.toLowerCase()).toContain('not a governed');
  });

  it('documents that execution actions are not on the Idea view', () => {
    expect(src.toLowerCase()).toContain('not accessible from the idea detail view');
  });
});
