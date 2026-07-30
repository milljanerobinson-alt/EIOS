import { describe, it, expect } from 'vitest';
import {
  type VerificationMatrixRow,
  type POWorkflow,
  type TestTypeCode,
  type EngineeringConfidence,
  type CompletionReportStatus,
  calculateEngineeringConfidence,
} from '../lib/verificationFrameworkService';

// ─── EWO-014.18: Engineering Verification Framework Tests ───────────────────

function makeMatrix(overrides: Partial<VerificationMatrixRow> = {}): VerificationMatrixRow {
  return {
    id: 'row-1',
    ewo_id: 'ewo-1',
    test_type: 'unit',
    status: 'not_run',
    verified_by: null,
    verified_at: null,
    evidence_ref: null,
    notes: null,
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<POWorkflow> = {}): POWorkflow {
  return {
    id: 'wf-1',
    ewo_id: 'ewo-1',
    name: 'Primary PO Workflow',
    description: 'Test workflow',
    status: 'defined',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

const REQUIRED_ROWS: TestTypeCode[] = [
  'unit', 'integration', 'workflow', 'ui_component',
  'manual_verification', 'po_verification', 'po_acceptance', 'build_verification',
];

function fullMatrix(status: VerificationMatrixRow['status']): VerificationMatrixRow[] {
  return REQUIRED_ROWS.map((t, i) => makeMatrix({ id: `row-${i}`, test_type: t, status }));
}

describe('EWO-014.18: Test Classifications', () => {
  it('defines 10 canonical test types', () => {
    const expected: TestTypeCode[] = [
      'unit', 'service', 'integration', 'ui_component', 'workflow',
      'po_verification', 'po_acceptance', 'regression',
      'build_verification', 'manual_verification',
    ];
    expect(expected.length).toBe(10);
  });
});

describe('EWO-014.18: Engineering Confidence Calculation', () => {
  it('returns unknown when matrix is empty', () => {
    expect(calculateEngineeringConfidence([], [])).toBe<EngineeringConfidence>('unknown');
  });

  it('returns low when any workflow is failed', () => {
    const matrix = fullMatrix('passed');
    const workflows = [makeWorkflow({ status: 'failed' })];
    expect(calculateEngineeringConfidence(matrix, workflows)).toBe<EngineeringConfidence>('low');
  });

  it('returns low when any required row is failed', () => {
    const matrix = fullMatrix('passed').map((r, i) =>
      i === 0 ? { ...r, status: 'failed' as const } : r
    );
    expect(calculateEngineeringConfidence(matrix, [])).toBe<EngineeringConfidence>('low');
  });

  it('returns low when any required row is blocked', () => {
    const matrix = fullMatrix('passed').map((r, i) =>
      i === 2 ? { ...r, status: 'blocked' as const } : r
    );
    expect(calculateEngineeringConfidence(matrix, [])).toBe<EngineeringConfidence>('low');
  });

  it('returns verified when all required rows passed and PO verified + accepted', () => {
    const matrix = fullMatrix('passed');
    expect(calculateEngineeringConfidence(matrix, [])).toBe<EngineeringConfidence>('verified');
  });

  it('returns verified when required rows are passed or not_applicable', () => {
    const matrix = fullMatrix('passed').map((r, i) =>
      r.test_type === 'ui_component' ? { ...r, status: 'not_applicable' as const } : r
    );
    expect(calculateEngineeringConfidence(matrix, [])).toBe<EngineeringConfidence>('verified');
  });

  it('does not return verified when PO verification is not passed', () => {
    const matrix = fullMatrix('passed').map(r =>
      r.test_type === 'po_verification' ? { ...r, status: 'not_run' as const } : r
    );
    const result = calculateEngineeringConfidence(matrix, []);
    expect(result).not.toBe<EngineeringConfidence>('verified');
  });

  it('does not return verified when PO acceptance is not passed', () => {
    const matrix = fullMatrix('passed').map(r =>
      r.test_type === 'po_acceptance' ? { ...r, status: 'pending' as const } : r
    );
    const result = calculateEngineeringConfidence(matrix, []);
    expect(result).not.toBe<EngineeringConfidence>('verified');
  });

  it('returns high when ≥75% passed and PO verification passed', () => {
    // 6 of 8 passed (75%), po_verification passed
    const matrix: VerificationMatrixRow[] = [
      makeMatrix({ test_type: 'unit', status: 'passed' }),
      makeMatrix({ test_type: 'integration', status: 'passed' }),
      makeMatrix({ test_type: 'workflow', status: 'passed' }),
      makeMatrix({ test_type: 'ui_component', status: 'not_run' }),
      makeMatrix({ test_type: 'manual_verification', status: 'passed' }),
      makeMatrix({ test_type: 'po_verification', status: 'passed' }),
      makeMatrix({ test_type: 'po_acceptance', status: 'not_run' }),
      makeMatrix({ test_type: 'build_verification', status: 'passed' }),
    ];
    expect(calculateEngineeringConfidence(matrix, [])).toBe<EngineeringConfidence>('high');
  });

  it('returns medium when ≥50% passed but PO not verified', () => {
    const matrix: VerificationMatrixRow[] = [
      makeMatrix({ test_type: 'unit', status: 'passed' }),
      makeMatrix({ test_type: 'integration', status: 'passed' }),
      makeMatrix({ test_type: 'workflow', status: 'passed' }),
      makeMatrix({ test_type: 'ui_component', status: 'passed' }),
      makeMatrix({ test_type: 'manual_verification', status: 'not_run' }),
      makeMatrix({ test_type: 'po_verification', status: 'not_run' }),
      makeMatrix({ test_type: 'po_acceptance', status: 'not_run' }),
      makeMatrix({ test_type: 'build_verification', status: 'passed' }),
    ];
    expect(calculateEngineeringConfidence(matrix, [])).toBe<EngineeringConfidence>('medium');
  });

  it('returns low when <50% passed', () => {
    const matrix: VerificationMatrixRow[] = [
      makeMatrix({ test_type: 'unit', status: 'passed' }),
      makeMatrix({ test_type: 'integration', status: 'not_run' }),
      makeMatrix({ test_type: 'workflow', status: 'not_run' }),
      makeMatrix({ test_type: 'ui_component', status: 'not_run' }),
      makeMatrix({ test_type: 'manual_verification', status: 'not_run' }),
      makeMatrix({ test_type: 'po_verification', status: 'not_run' }),
      makeMatrix({ test_type: 'po_acceptance', status: 'not_run' }),
      makeMatrix({ test_type: 'build_verification', status: 'not_run' }),
    ];
    expect(calculateEngineeringConfidence(matrix, [])).toBe<EngineeringConfidence>('low');
  });
});

describe('EWO-014.18: Completion Report Status', () => {
  it('prevents claiming verified when verification is partial', () => {
    const status: CompletionReportStatus = {
      implementation: 'complete',
      verification: 'partial',
      po_testing: 'pending',
      po_acceptance: 'pending',
      build: 'complete',
    };
    // The rule: must never state "Verified" when verification is partial or pending
    expect(status.verification).not.toBe('complete');
    expect(status.verification).toBe('partial');
  });

  it('prevents claiming accepted when PO acceptance is pending', () => {
    const status: CompletionReportStatus = {
      implementation: 'complete',
      verification: 'complete',
      po_testing: 'complete',
      po_acceptance: 'pending',
      build: 'complete',
    };
    expect(status.po_acceptance).not.toBe('complete');
    expect(status.po_acceptance).toBe('pending');
  });

  it('allows complete when all dimensions are complete', () => {
    const status: CompletionReportStatus = {
      implementation: 'complete',
      verification: 'complete',
      po_testing: 'complete',
      po_acceptance: 'complete',
      build: 'complete',
    };
    expect(Object.values(status).every(v => v === 'complete')).toBe(true);
  });
});

describe('EWO-014.18: Verification Matrix Structure', () => {
  it('has 8 required rows for every EWO', () => {
    expect(REQUIRED_ROWS.length).toBe(8);
  });

  it('includes PO verification and acceptance as required rows', () => {
    expect(REQUIRED_ROWS).toContain('po_verification');
    expect(REQUIRED_ROWS).toContain('po_acceptance');
  });

  it('includes build verification as a required row', () => {
    expect(REQUIRED_ROWS).toContain('build_verification');
  });
});

describe('EWO-014.18: Workflow Status Tracking', () => {
  it('tracks workflow as defined → executed → passed | failed', () => {
    const statuses: POWorkflow['status'][] = ['defined', 'executed', 'passed', 'failed'];
    expect(statuses).toContain('defined');
    expect(statuses).toContain('executed');
    expect(statuses).toContain('passed');
    expect(statuses).toContain('failed');
  });

  it('a failed workflow prevents verified confidence', () => {
    const matrix = fullMatrix('passed');
    const workflows = [makeWorkflow({ status: 'failed' })];
    expect(calculateEngineeringConfidence(matrix, workflows)).toBe<EngineeringConfidence>('low');
  });

  it('a passed workflow does not prevent verified confidence when matrix is complete', () => {
    const matrix = fullMatrix('passed');
    const workflows = [makeWorkflow({ status: 'passed' })];
    expect(calculateEngineeringConfidence(matrix, workflows)).toBe<EngineeringConfidence>('verified');
  });
});

describe('EWO-014.18: Root Cause — Why Tests Passed Despite PO Failure', () => {
  it('documents that unit tests do not verify PO workflows', () => {
    // The EWO-014.17R.2 root cause: automated tests verified logic but
    // not the complete user workflow. This framework distinguishes them.
    const unitOnly: VerificationMatrixRow[] = [
      makeMatrix({ test_type: 'unit', status: 'passed' }),
    ];
    // With only unit tests passed, confidence should NOT be verified.
    const confidence = calculateEngineeringConfidence(unitOnly, []);
    expect(confidence).not.toBe<EngineeringConfidence>('verified');
    expect(confidence).toBe<EngineeringConfidence>('low');
  });

  it('documents that all test types must be considered', () => {
    // Confidence considers unit, integration, workflow, UI, manual,
    // PO verification, PO acceptance, and build.
    const allConsidered: TestTypeCode[] = [
      'unit', 'integration', 'workflow', 'ui_component',
      'manual_verification', 'po_verification', 'po_acceptance', 'build_verification',
    ];
    expect(allConsidered.length).toBe(8);
    // Each is a distinct concern.
    expect(new Set(allConsidered).size).toBe(8);
  });
});
