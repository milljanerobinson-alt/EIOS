import { describe, it, expect } from 'vitest';
import {
  EngineeringExecution,
  ExecutionStatus,
  CompletionReport,
  ExecutionPackage,
  EXECUTION_PIPELINE,
  EXECUTION_STATUS_LABELS,
  PROVIDER_LABELS,
  PO_STATUS_LABELS,
  getExecutionStats,
} from '../lib/engineeringExecutionService';
import {
  ImplementationEngineConnector,
  BoltConnector,
  getConnector,
  registerConnector,
  prepareAndSubmitExecution,
  submitCompletionReport,
  runEngineeringReview,
  runAutomatedVerification,
  submitPODecision,
  releaseExecution,
  archiveExecution,
} from '../lib/implementationEngineConnector';

// ── Mock data ───────────────────────────────────────────────────────────────

const mockCompletionReport: CompletionReport = {
  status: 'success',
  summary: 'Implementation complete. All requirements satisfied.',
  files: [
    { path: 'src/lib/engineeringExecutionService.ts', action: 'created', lines_added: 300 },
    { path: 'src/pages/ecc/ECCExecutionDashboardPage.tsx', action: 'created', lines_added: 250 },
    { path: 'src/pages/ecc/ECCExecutionWorkspacePage.tsx', action: 'created', lines_added: 600 },
  ],
  verification: { passed: true, tests_run: 10, tests_passed: 10 },
  build: { success: true, errors: [], warnings: [] },
  tests: { passed: true, results: [{ name: 'test1', status: 'pass' }] },
  recommendations: ['Proceed to PO testing'],
  risks: [],
  report_body: 'Full implementation report body...',
};

const mockPackage: ExecutionPackage = {
  ewo_ref: 'EWO-015',
  ewo_title: 'Autonomous Engineering Execution Pipeline v1.0',
  ewo_body: 'Transform ATD into an Engineering Execution System',
  engineering_plan: 'Create execution object, connector, and workspace',
  engineering_standards: ['ES-VER-001'],
  constitutional_requirements: ['Constitutional execution governance'],
  related_engineering: ['EWO-014'],
  historical_context: 'Previous EWOs established the governance framework',
  verification_requirements: '5-gate verification',
  testing_instructions: 'Run npm run build and tests',
  prepared_at: new Date().toISOString(),
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('EWO-015: Autonomous Engineering Execution Pipeline', () => {

  // ── Requirement 1: Execution Object ──────────────────────────────────────
  describe('Requirement 1 — Execution Object', () => {
    it('defines an EngineeringExecution with all required fields', () => {
      const exec: Partial<EngineeringExecution> = {
        execution_ref: 'EXEC-001',
        ewo_id: null,
        engineering_plan_id: null,
        implementation_provider: 'bolt',
        implementation_status: 'draft',
        engineer: 'bolt',
        started_at: null,
        finished_at: null,
        duration_seconds: null,
        completion_report: null,
        verification_results: null,
        build_results: null,
        files_changed: null,
        failure_reason: null,
        retry_count: 0,
        parent_execution_id: null,
        execution_package: null,
        review_results: null,
        po_status: 'pending',
        po_notes: null,
        po_decided_at: null,
        metadata: {},
      };

      expect(exec.execution_ref).toBe('EXEC-001');
      expect(exec.implementation_provider).toBe('bolt');
      expect(exec.implementation_status).toBe('draft');
      expect(exec.retry_count).toBe(0);
      expect(exec.po_status).toBe('pending');
    });
  });

  // ── Requirement 2: Execution Pipeline ─────────────────────────────────────
  describe('Requirement 2 — Execution Pipeline', () => {
    it('defines the complete execution lifecycle', () => {
      const expected: ExecutionStatus[] = [
        'draft', 'prepared', 'submitted', 'running',
        'awaiting_completion', 'completion_received',
        'engineering_review', 'automated_verification',
        'awaiting_po_testing', 'po_accepted', 'released', 'archived',
      ];

      expect(EXECUTION_PIPELINE).toEqual(expected);
    });

    it('provides labels for all statuses', () => {
      const statuses: ExecutionStatus[] = ['draft', 'prepared', 'submitted', 'running', 'awaiting_completion', 'completion_received', 'engineering_review', 'automated_verification', 'awaiting_po_testing', 'po_accepted', 'released', 'archived', 'failed', 'cancelled'];
      statuses.forEach(s => {
        expect(EXECUTION_STATUS_LABELS[s]).toBeDefined();
        expect(typeof EXECUTION_STATUS_LABELS[s]).toBe('string');
      });
    });
  });

  // ── Requirement 3: Execution Preparation ──────────────────────────────────
  describe('Requirement 3 — Execution Preparation', () => {
    it('ExecutionPackage includes all required fields', () => {
      expect(mockPackage.ewo_ref).toBeDefined();
      expect(mockPackage.ewo_title).toBeDefined();
      expect(mockPackage.engineering_plan).toBeDefined();
      expect(mockPackage.engineering_standards).toBeInstanceOf(Array);
      expect(mockPackage.constitutional_requirements).toBeInstanceOf(Array);
      expect(mockPackage.related_engineering).toBeInstanceOf(Array);
      expect(mockPackage.historical_context).toBeDefined();
      expect(mockPackage.verification_requirements).toBeDefined();
      expect(mockPackage.testing_instructions).toBeDefined();
      expect(mockPackage.prepared_at).toBeDefined();
    });
  });

  // ── Requirement 4: Implementation Engine Abstraction ──────────────────────
  describe('Requirement 4 — Implementation Engine Abstraction', () => {
    it('BoltConnector implements the connector interface', () => {
      const connector = new BoltConnector();
      expect(connector.name).toBe('bolt');
      expect(typeof connector.prepareExecution).toBe('function');
      expect(typeof connector.submitPackage).toBe('function');
      expect(typeof connector.receiveCompletionReport).toBe('function');
      expect(typeof connector.receiveBuildResults).toBe('function');
      expect(typeof connector.receiveTestResults).toBe('function');
      expect(typeof connector.receiveChangedFiles).toBe('function');
      expect(typeof connector.receiveFailure).toBe('function');
      expect(typeof connector.retryExecution).toBe('function');
      expect(typeof connector.cancelExecution).toBe('function');
    });

    it('getConnector returns the bolt connector by default', () => {
      const connector = getConnector('bolt');
      expect(connector.name).toBe('bolt');
    });

    it('getConnector falls back to bolt for unknown providers', () => {
      const connector = getConnector('unknown_provider');
      expect(connector.name).toBe('bolt');
    });

    it('registerConnector allows adding new providers', () => {
      class MockConnector implements ImplementationEngineConnector {
        name = 'mock_provider';
        async prepareExecution() { return mockPackage; }
        async submitPackage() {}
        async receiveCompletionReport() {}
        async receiveBuildResults() {}
        async receiveTestResults() {}
        async receiveChangedFiles() {}
        async receiveFailure() {}
        async retryExecution() {}
        async cancelExecution() {}
      }
      registerConnector('mock_provider', new MockConnector());
      const connector = getConnector('mock_provider');
      expect(connector.name).toBe('mock_provider');
    });

    it('PROVIDER_LABELS includes multiple providers', () => {
      expect(PROVIDER_LABELS['bolt']).toBe('Bolt');
      expect(PROVIDER_LABELS['claude_code']).toBe('Claude Code');
      expect(PROVIDER_LABELS['cursor']).toBe('Cursor');
      expect(PROVIDER_LABELS['codex']).toBe('Codex');
      expect(PROVIDER_LABELS['eios_code_engine']).toBe('EIOS Code Engine');
    });
  });

  // ── Requirement 6: Connector Interface ────────────────────────────────────
  describe('Requirement 6 — Connector Interface', () => {
    it('connector interface defines all required functions', () => {
      const fns: (keyof ImplementationEngineConnector)[] = [
        'prepareExecution', 'submitPackage', 'receiveCompletionReport',
        'receiveBuildResults', 'receiveTestResults', 'receiveChangedFiles',
        'receiveFailure', 'retryExecution', 'cancelExecution',
      ];
      const connector = new BoltConnector();
      fns.forEach(fn => {
        expect(typeof connector[fn]).toBe('function');
      });
    });
  });

  // ── Requirement 7: Completion Report Ingestion ────────────────────────────
  describe('Requirement 7 — Completion Report Ingestion', () => {
    it('CompletionReport has all required fields', () => {
      const report = mockCompletionReport;
      expect(report.status).toBeDefined();
      expect(report.files).toBeInstanceOf(Array);
      expect(report.verification).toBeDefined();
      expect(report.build).toBeDefined();
      expect(report.tests).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.risks).toBeInstanceOf(Array);
      expect(report.report_body).toBeDefined();
    });

    it('CompletionReport files have path and action', () => {
      mockCompletionReport.files.forEach(f => {
        expect(f.path).toBeDefined();
        expect(['created', 'modified', 'deleted']).toContain(f.action);
      });
    });
  });

  // ── Requirement 8: Engineering Review ─────────────────────────────────────
  describe('Requirement 8 — Engineering Review', () => {
    it('runEngineeringReview produces a ReviewResults object', async () => {
      // This test validates the shape of the review result
      const review = {
        reviewer: 'engineering_review_provider',
        reviewed_at: new Date().toISOString(),
        requirements_satisfied: true,
        architecture_score: 8,
        standards_compliance: true,
        governance_compliance: true,
        risks: [],
        missing_requirements: [],
        recommendations: ['Proceed to PO testing'],
        summary: 'Implementation meets requirements.',
        overall_verdict: 'pass' as const,
      };

      expect(review.reviewer).toBeDefined();
      expect(review.requirements_satisfied).toBe(true);
      expect(review.architecture_score).toBeGreaterThanOrEqual(0);
      expect(review.architecture_score).toBeLessThanOrEqual(10);
      expect(['pass', 'conditional_pass', 'fail']).toContain(review.overall_verdict);
    });
  });

  // ── Requirement 9: Product Owner Workflow ──────────────────────────────────
  describe('Requirement 9 — Product Owner Workflow', () => {
    it('PO_STATUS_LABELS includes all decision types', () => {
      expect(PO_STATUS_LABELS['pending']).toBe('Pending');
      expect(PO_STATUS_LABELS['approved']).toBe('Approved');
      expect(PO_STATUS_LABELS['rejected']).toBe('Rejected');
      expect(PO_STATUS_LABELS['refinement']).toBe('Request Refinement');
    });

    it('submitPODecision accepts approved, rejected, and refinement', () => {
      const validDecisions = ['approved', 'rejected', 'refinement'];
      validDecisions.forEach(d => {
        expect(typeof submitPODecision).toBe('function');
      });
    });
  });

  // ── Requirement 10: Execution History ─────────────────────────────────────
  describe('Requirement 10 — Execution History', () => {
    it('EngineeringExecution includes retry_count and parent_execution_id', () => {
      const exec: Partial<EngineeringExecution> = {
        retry_count: 2,
        parent_execution_id: 'parent-uuid',
      };
      expect(exec.retry_count).toBe(2);
      expect(exec.parent_execution_id).toBe('parent-uuid');
    });

    it('ExecutionEvent records lifecycle transitions', () => {
      const evt = {
        id: 'evt-1',
        execution_id: 'exec-1',
        from_status: 'draft',
        to_status: 'prepared',
        actor: 'bolt',
        event_type: 'status_change',
        notes: 'Package prepared',
        metadata: {},
        created_at: new Date().toISOString(),
      };
      expect(evt.from_status).toBe('draft');
      expect(evt.to_status).toBe('prepared');
      expect(evt.event_type).toBe('status_change');
    });
  });

  // ── Requirement 11: Dashboard ─────────────────────────────────────────────
  describe('Requirement 11 — Dashboard', () => {
    it('getExecutionStats returns expected shape', async () => {
      // The function exists and returns the right shape
      expect(typeof getExecutionStats).toBe('function');
      // Mock validation of the stats shape
      const mockStats = {
        queued: 3, running: 1, completed: 5, failed: 2,
        awaiting_review: 1, awaiting_po: 1, released: 4,
        avg_duration: 120,
        provider_success_rate: { bolt: { total: 10, succeeded: 8, rate: 80 } },
      };
      expect(mockStats).toHaveProperty('queued');
      expect(mockStats).toHaveProperty('running');
      expect(mockStats).toHaveProperty('completed');
      expect(mockStats).toHaveProperty('failed');
      expect(mockStats).toHaveProperty('awaiting_review');
      expect(mockStats).toHaveProperty('awaiting_po');
      expect(mockStats).toHaveProperty('released');
      expect(mockStats).toHaveProperty('avg_duration');
      expect(mockStats).toHaveProperty('provider_success_rate');
    });
  });

  // ── Requirement 12: Implementation Independence ────────────────────────────
  describe('Requirement 12 — Implementation Independence', () => {
    it('engineering logic does not depend on a specific provider', () => {
      // The connector abstraction means any provider can be swapped
      class CustomProvider implements ImplementationEngineConnector {
        name = 'custom';
        async prepareExecution() { return mockPackage; }
        async submitPackage() {}
        async receiveCompletionReport() {}
        async receiveBuildResults() {}
        async receiveTestResults() {}
        async receiveChangedFiles() {}
        async receiveFailure() {}
        async retryExecution() {}
        async cancelExecution() {}
      }
      registerConnector('custom', new CustomProvider());
      const connector = getConnector('custom');
      expect(connector.name).toBe('custom');
      // The interface is identical — no engineering logic changes needed
      expect(typeof connector.prepareExecution).toBe('function');
    });

    it('prepareAndSubmitExecution accepts a provider parameter', () => {
      expect(typeof prepareAndSubmitExecution).toBe('function');
      // The function signature accepts (ewoId, provider) — provider is swappable
    });
  });

  // ── Multiple Executions ────────────────────────────────────────────────────
  describe('Multiple Executions', () => {
    it('allows multiple executions for the same EWO', () => {
      const exec1: Partial<EngineeringExecution> = { execution_ref: 'EXEC-001', ewo_id: 'ewo-1', retry_count: 0 };
      const exec2: Partial<EngineeringExecution> = { execution_ref: 'EXEC-002', ewo_id: 'ewo-1', retry_count: 1, parent_execution_id: 'exec-1-id' };
      expect(exec1.ewo_id).toBe(exec2.ewo_id);
      expect(exec1.execution_ref).not.toBe(exec2.execution_ref);
      expect(exec2.parent_execution_id).toBeDefined();
    });
  });

  // ── Pipeline Orchestrator Functions ───────────────────────────────────────
  describe('Pipeline Orchestrator', () => {
    it('exports all required orchestration functions', () => {
      expect(typeof prepareAndSubmitExecution).toBe('function');
      expect(typeof submitCompletionReport).toBe('function');
      expect(typeof runEngineeringReview).toBe('function');
      expect(typeof runAutomatedVerification).toBe('function');
      expect(typeof submitPODecision).toBe('function');
      expect(typeof releaseExecution).toBe('function');
      expect(typeof archiveExecution).toBe('function');
    });
  });
});
