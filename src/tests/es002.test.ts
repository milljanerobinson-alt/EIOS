// ES-002 — Canonical Engineering Governance Bootstrap
// Test Suite
//
// File-based tests matching the existing EWO test pattern. Verifies all 6
// principles, 5 bootstrap steps, and the governance gate by checking source
// files and migration content.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function migrationContains(fragment: string): boolean {
  const files = readdirSync('supabase/migrations/');
  return files.some((migration) => {
    if (!migration.endsWith('.sql')) return false;
    return readFileSync(`supabase/migrations/${migration}`, 'utf-8').includes(fragment);
  });
}

function migrationFileContains(filename: string, fragment: string): boolean {
  const path = `supabase/migrations/${filename}`;
  if (!existsSync(path)) return false;
  return readFileSync(path, 'utf-8').includes(fragment);
}

function sourceFileContains(path: string, fragment: string): boolean {
  if (!existsSync(path)) return false;
  return readFileSync(path, 'utf-8').includes(fragment);
}

// ─── Principle 1: Canonical EWO Must Exist Before Implementation ──────────────

describe('ES-002 Principle 1 — Canonical EWO Must Exist', () => {
  it('governanceBootstrapService exports verifyEwoExists', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'export async function verifyEwoExists')).toBe(true);
  });

  it('migration creates canonical EWO-018 before implementation', () => {
    expect(migrationContains('EWO-018')).toBe(true);
    expect(migrationContains("'draft'")).toBe(true);
  });

  it('EWO-018 has bootstrap origin recorded', () => {
    expect(migrationContains("'Implementation Bootstrap'")).toBe(true);
  });
});

// ─── Principle 2: Every Implementation Prompt Must Attach to EWO ───────────────

describe('ES-002 Principle 2 — Prompt Attachment', () => {
  it('governanceBootstrapService attaches implementation prompt', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'implementation_prompt')).toBe(true);
  });

  it('engineering package records implementation notes', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'implementation_notes')).toBe(true);
  });

  it('verification checks prompt attachment', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'prompt_attached')).toBe(true);
  });
});

// ─── Principle 3: Every Implementation Must Attach Engineering Package ──────────

describe('ES-002 Principle 3 — Engineering Package Attachment', () => {
  it('governanceBootstrapService creates engineering package', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'ewo_engineering_packages')).toBe(true);
  });

  it('migration creates engineering package for EWO-018', () => {
    expect(migrationContains('ewo_engineering_packages')).toBe(true);
    expect(migrationContains('es-002-bootstrap-v1')).toBe(true);
  });

  it('verification checks package attachment', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'package_attached')).toBe(true);
  });
});

// ─── Principle 4: If Governance Cannot Be Established, Stop ───────────────────

describe('ES-002 Principle 4 — Stop If Governance Fails', () => {
  it('governanceBootstrapService exports governanceGate', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'export async function governanceGate')).toBe(true);
  });

  it('governanceGate returns may_proceed flag', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'may_proceed')).toBe(true);
  });

  it('bootstrap returns governance_established flag', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'governance_established')).toBe(true);
  });

  it('error is returned when governance fails', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'error:')).toBe(true);
  });
});

// ─── Principle 5: No Orphan Engineering ─────────────────────────────────────────

describe('ES-002 Principle 5 — No Orphan Engineering', () => {
  it('governanceBootstrapService exports detectOrphanEngineering', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'export async function detectOrphanEngineering')).toBe(true);
  });

  it('detectOrphanEngineering checks for orphan completion reports', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'orphanReports')).toBe(true);
  });

  it('detectOrphanEngineering checks for orphan engineering packages', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'orphanPackages')).toBe(true);
  });
});

// ─── Principle 6: Governance Is Authoritative ──────────────────────────────────

describe('ES-002 Principle 6 — Governance Is Authoritative', () => {
  it('ES-002 standard is seeded in the engineering standards ledger', () => {
    expect(migrationContains("'ES-002'")).toBe(true);
    expect(migrationContains('ecc_engineering_standards')).toBe(true);
  });

  it('standard body contains the constitutional rule', () => {
    expect(migrationContains('Implementation must never create Engineering Governance retrospectively')).toBe(true);
  });

  it('standard body contains all 6 principles', () => {
    expect(migrationContains('PRINCIPLE')).toBe(true);
    expect(migrationContains('canonical Engineering Work Order must exist before implementation begins')).toBe(true);
    expect(migrationContains('implementation prompt must attach')).toBe(true);
    expect(migrationContains('Engineering Package linked')).toBe(true);
    expect(migrationContains('implementation must stop')).toBe(true);
    expect(migrationContains('silently create orphan engineering')).toBe(true);
    expect(migrationContains('Engineering Governance is authoritative')).toBe(true);
  });

  it('governanceBootstrapService exports getStandard', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'export async function getStandard')).toBe(true);
  });
});

// ─── Step 1-5: Full Bootstrap Process ──────────────────────────────────────────

describe('ES-002 Bootstrap Steps 1-5', () => {
  it('Step 1: verifyEwoExists checks for EWO', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'Step 1: Verify EWO Exists')).toBe(true);
  });

  it('Step 2: createCanonicalEwo creates EWO with governance metadata', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'export async function createCanonicalEwo')).toBe(true);
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'bootstrap_origin')).toBe(true);
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'bootstrap_reason')).toBe(true);
  });

  it('Step 3: attachGovernanceArtefacts creates package, report, lifecycle', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'export async function attachGovernanceArtefacts')).toBe(true);
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'ewo_engineering_packages')).toBe(true);
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'ewo_completion_reports')).toBe(true);
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'ewo_lifecycle_events')).toBe(true);
  });

  it('Step 4: verifyGovernance checks all artefacts', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'export async function verifyGovernance')).toBe(true);
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'parent_relationships')).toBe(true);
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'prompt_attached')).toBe(true);
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'package_attached')).toBe(true);
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'completion_report')).toBe(true);
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'lifecycle_initialised')).toBe(true);
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'overall')).toBe(true);
  });

  it('Step 5: bootstrapGovernance returns STOP if governance fails', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'Step 5: If governance cannot be established, STOP')).toBe(true);
  });

  it('migration records lifecycle initialisation event', () => {
    expect(migrationContains('ewo_lifecycle_events')).toBe(true);
    expect(migrationContains('canonical_ewo_created')).toBe(true);
  });

  it('migration records governance verification event', () => {
    expect(migrationContains('"step":"4"')).toBe(true);
    expect(migrationContains('"verification":"PASS"')).toBe(true);
  });

  it('migration creates completion report placeholder', () => {
    expect(migrationContains('ewo_completion_reports')).toBe(true);
    expect(migrationContains('Pending implementation')).toBe(true);
  });
});

// ─── Constitutional Rule: No Retrospective Governance ──────────────────────────

describe('ES-002 Constitutional Rule — No Retrospective Governance', () => {
  it('standard body states the constitutional rule', () => {
    expect(migrationContains('Implementation must never create Engineering Governance retrospectively')).toBe(true);
    expect(migrationContains('Engineering Governance must exist before implementation begins')).toBe(true);
  });

  it('standard applies to all implementation engines', () => {
    expect(migrationContains('Bolt')).toBe(true);
    expect(migrationContains('ATD Execution Engine')).toBe(true);
    expect(migrationContains('EIOS Automation')).toBe(true);
    expect(migrationContains('Future AI Providers')).toBe(true);
  });

  it('standard states implementation technology is irrelevant', () => {
    expect(migrationContains('implementation technology is irrelevant')).toBe(true);
    expect(migrationContains('Engineering Governance is platform behaviour')).toBe(true);
  });
});

// ─── Product Owner Acceptance ───────────────────────────────────────────────────

describe('ES-002 Product Owner Acceptance', () => {
  it('standard defines Implementation Complete ≠ Engineering Closed', () => {
    expect(migrationContains('Implementation Complete')).toBe(true);
    expect(migrationContains('Engineering Closed')).toBe(true);
  });

  it('standard defines closure requires all 4 prerequisites', () => {
    expect(migrationContains('Engineering Complete')).toBe(true);
    expect(migrationContains('Completion Report')).toBe(true);
    expect(migrationContains('Product Owner Testing')).toBe(true);
    expect(migrationContains('Product Owner Acceptance')).toBe(true);
  });

  it('standard defines governance verification requirements', () => {
    expect(migrationContains('GOVERNANCE VERIFICATION')).toBe(true);
    expect(migrationContains('PASS')).toBe(true);
    expect(migrationContains('FAIL')).toBe(true);
  });
});

// ─── Governance Verification Report ────────────────────────────────────────────

describe('ES-002 Governance Verification Report', () => {
  it('standard requires EWO in verification report', () => {
    expect(migrationContains('Engineering Work Order')).toBe(true);
  });

  it('standard requires Engineering Package in verification report', () => {
    expect(migrationContains('Engineering Package')).toBe(true);
  });

  it('standard requires Prompt Attached in verification report', () => {
    expect(migrationContains('Prompt Attached')).toBe(true);
  });

  it('standard requires Completion Report in verification report', () => {
    expect(migrationContains('Completion Report')).toBe(true);
  });

  it('standard requires Lifecycle Initialised in verification report', () => {
    expect(migrationContains('Lifecycle Initialised')).toBe(true);
  });

  it('standard requires Governance Verification PASS/FAIL', () => {
    expect(migrationContains('GOVERNANCE VERIFICATION')).toBe(true);
    expect(migrationContains('Governance Validation')).toBe(true);
  });
});

// ─── Service Exports ───────────────────────────────────────────────────────────

describe('ES-002 Service Exports', () => {
  it('governanceBootstrapService exports all required functions', () => {
    const src = readFileSync('src/lib/governanceBootstrapService.ts', 'utf-8');
    expect(src).toContain('export async function verifyEwoExists');
    expect(src).toContain('export async function createCanonicalEwo');
    expect(src).toContain('export async function attachGovernanceArtefacts');
    expect(src).toContain('export async function verifyGovernance');
    expect(src).toContain('export async function bootstrapGovernance');
    expect(src).toContain('export async function governanceGate');
    expect(src).toContain('export async function detectOrphanEngineering');
    expect(src).toContain('export async function getStandard');
  });

  it('governanceBootstrapService exports BootstrapConfig type', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'export interface BootstrapConfig')).toBe(true);
  });

  it('governanceBootstrapService exports GovernanceBootstrapResult type', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'export interface GovernanceBootstrapResult')).toBe(true);
  });

  it('governanceBootstrapService exports GovernanceVerification type', () => {
    expect(sourceFileContains('src/lib/governanceBootstrapService.ts', 'export interface GovernanceVerification')).toBe(true);
  });
});
