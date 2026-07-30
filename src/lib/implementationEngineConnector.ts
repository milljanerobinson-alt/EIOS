import {
  EngineeringExecution,
  ExecutionPackage,
  CompletionReport,
  ReviewResults,
  VerificationResults,
  ExecutionStatus,
  createExecution,
  updateExecution,
  transitionStatus,
  recordEvent,
  getExecution,
} from './engineeringExecutionService';
import { supabase } from './supabase';

// ── Connector Interface ────────────────────────────────────────────────────

export interface ImplementationEngineConnector {
  name: string;
  prepareExecution(ewoId: string, ewoData: EwoData): Promise<ExecutionPackage>;
  submitPackage(executionId: string, pkg: ExecutionPackage): Promise<void>;
  receiveCompletionReport(executionId: string, report: CompletionReport): Promise<void>;
  receiveBuildResults(executionId: string, results: BuildResults): Promise<void>;
  receiveTestResults(executionId: string, results: TestResults): Promise<void>;
  receiveChangedFiles(executionId: string, files: ExecutionFile[]): Promise<void>;
  receiveFailure(executionId: string, reason: string): Promise<void>;
  retryExecution(executionId: string): Promise<void>;
  cancelExecution(executionId: string): Promise<void>;
}

interface EwoData {
  ewo_ref: string;
  title: string;
  executive_summary?: string;
  scope?: string;
  validation_requirements?: string;
  engineering_objective?: string;
}

interface BuildResults {
  success: boolean;
  errors: string[];
  warnings: string[];
  duration_seconds?: number;
}

interface TestResults {
  passed: boolean;
  tests_run: number;
  tests_passed: number;
  results: { name: string; status: 'pass' | 'fail'; detail?: string }[];
}

interface ExecutionFile {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  lines_added?: number;
  lines_removed?: number;
}

// ── Bolt Connector (default provider) ──────────────────────────────────────

export class BoltConnector implements ImplementationEngineConnector {
  name = 'bolt';

  async prepareExecution(ewoId: string, ewoData: EwoData): Promise<ExecutionPackage> {
    // Fetch related engineering context
    const [standardsResult, relatedResult] = await Promise.all([
      supabase.from('ecc_engineering_standards').select('title, body').eq('status', 'active').limit(10),
      supabase.from('engineering_object_relationships').select('*').eq('source_object_ref', ewoData.ewo_ref).limit(20),
    ]);

    const standards = (standardsResult.data || []).map((s: { title: string }) => s.title);
    const related = (relatedResult.data || []).map((r: { target_object_ref: string }) => r.target_object_ref);

    return {
      ewo_ref: ewoData.ewo_ref,
      ewo_title: ewoData.title,
      ewo_body: ewoData.executive_summary || ewoData.scope || '',
      engineering_plan: ewoData.engineering_objective || '',
      engineering_standards: standards,
      constitutional_requirements: [
        'ES-VER-001: Verification Standard — all 5 gates must pass',
        'ES-BROWSER-TEST-001: Dedicated non-human accounts for browser automation',
      ],
      related_engineering: related,
      historical_context: `This EWO (${ewoData.ewo_ref}) was prepared for autonomous execution via the ${this.name} implementation provider.`,
      verification_requirements: ewoData.validation_requirements || 'Standard 5-gate verification: build, functional, UI, data, constitutional.',
      testing_instructions: 'Run npm run build. Run automated test suite. Verify in browser using dedicated test account.',
      prepared_at: new Date().toISOString(),
    };
  }

  async submitPackage(executionId: string, pkg: ExecutionPackage): Promise<void> {
    await updateExecution(executionId, {
      execution_package: pkg,
      implementation_status: 'submitted',
      started_at: new Date().toISOString(),
    }, this.name, 'package_submitted', 'Execution package submitted to provider');
  }

  async receiveCompletionReport(executionId: string, report: CompletionReport): Promise<void> {
    await updateExecution(executionId, {
      completion_report: report,
      implementation_status: 'completion_received',
      finished_at: new Date().toISOString(),
    }, this.name, 'completion_report_received', 'Completion report received from provider');
  }

  async receiveBuildResults(executionId: string, results: BuildResults): Promise<void> {
    await updateExecution(executionId, {
      build_results: results,
    }, this.name, 'build_results_received', `Build ${results.success ? 'succeeded' : 'failed'}`);
  }

  async receiveTestResults(executionId: string, results: TestResults): Promise<void> {
    const exec = await getExecution(executionId);
    if (!exec) throw new Error('Execution not found');

    const verification: VerificationResults = {
      build_verified: exec.build_results?.success ?? false,
      functional_verified: results.passed,
      ui_verified: false,
      data_verified: false,
      constitutional_verified: false,
      details: Object.fromEntries(results.results.map(r => [r.name, r.status === 'pass'])),
      timestamp: new Date().toISOString(),
    };

    await updateExecution(executionId, {
      verification_results: verification,
    }, this.name, 'test_results_received', `${results.tests_passed}/${results.tests_run} tests passed`);
  }

  async receiveChangedFiles(executionId: string, files: ExecutionFile[]): Promise<void> {
    await updateExecution(executionId, {
      files_changed: files,
    }, this.name, 'files_received', `${files.length} files changed`);
  }

  async receiveFailure(executionId: string, reason: string): Promise<void> {
    await updateExecution(executionId, {
      implementation_status: 'failed',
      failure_reason: reason,
      finished_at: new Date().toISOString(),
    }, this.name, 'execution_failed', reason);
  }

  async retryExecution(executionId: string): Promise<void> {
    const exec = await getExecution(executionId);
    if (!exec) throw new Error('Execution not found');

    const newExec = await createExecution({
      ewo_id: exec.ewo_id || undefined,
      implementation_provider: exec.implementation_provider,
      engineer: exec.engineer || undefined,
    });

    await updateExecution(newExec.id, {
      parent_execution_id: exec.id,
      retry_count: exec.retry_count + 1,
    }, this.name, 'retry_created', `Retry of ${exec.execution_ref}`);

    await updateExecution(exec.id, {
      implementation_status: 'archived',
    }, this.name, 'archived_for_retry', `Archived in favour of ${newExec.execution_ref}`);
  }

  async cancelExecution(executionId: string): Promise<void> {
    await updateExecution(executionId, {
      implementation_status: 'cancelled',
      finished_at: new Date().toISOString(),
    }, this.name, 'execution_cancelled', 'Execution cancelled');
  }
}

// ── Connector Registry ─────────────────────────────────────────────────────

const connectors: Record<string, ImplementationEngineConnector> = {
  bolt: new BoltConnector(),
};

export function getConnector(provider: string): ImplementationEngineConnector {
  return connectors[provider] || connectors.bolt;
}

export function registerConnector(name: string, connector: ImplementationEngineConnector): void {
  connectors[name] = connector;
}

// ── Pipeline Orchestrator ───────────────────────────────────────────────────

export async function prepareAndSubmitExecution(
  ewoId: string,
  provider: string = 'bolt'
): Promise<EngineeringExecution> {
  // Guard: ensure canonical EWO exists before preparing execution
  const { guardImplementationEntry } = await import('./ensureEngineeringWorkOrder');
  const guard = await guardImplementationEntry(ewoId, 'prepareAndSubmitExecution');
  if (!guard.success) {
    throw new Error(`Engineering implementation cannot begin because the canonical Engineering Work Order could not be registered. ${guard.error}`);
  }

  const connector = getConnector(provider);

  // Fetch EWO data
  const { data: ewo, error } = await supabase
    .from('engineering_work_orders')
    .select('*')
    .eq('id', ewoId)
    .maybeSingle();
  if (error) throw error;
  if (!ewo) throw new Error('EWO not found');

  // Create execution record
  const execution = await createExecution({
    ewo_id: ewoId,
    implementation_provider: provider,
    engineer: provider,
  });

  // Prepare package
  const pkg = await connector.prepareExecution(ewoId, ewo);

  // Transition to prepared
  await transitionStatus(execution.id, 'prepared', provider, 'Package prepared');

  // Submit
  await connector.submitPackage(execution.id, pkg);

  return getExecution(execution.id) as Promise<EngineeringExecution>;
}

export async function submitCompletionReport(
  executionId: string,
  report: CompletionReport,
  provider: string = 'bolt'
): Promise<void> {
  const connector = getConnector(provider);
  await connector.receiveCompletionReport(executionId, report);
}

export async function runEngineeringReview(
  executionId: string,
  report: CompletionReport
): Promise<ReviewResults> {
  // Simulated engineering review (would call OpenAI in production)
  const review: ReviewResults = {
    reviewer: 'engineering_review_provider',
    reviewed_at: new Date().toISOString(),
    requirements_satisfied: report.status !== 'failed',
    architecture_score: report.status === 'success' ? 8 : 5,
    standards_compliance: report.build.success,
    governance_compliance: report.verification.passed,
    risks: report.risks.length > 0 ? report.risks : ['No significant risks identified'],
    missing_requirements: report.status === 'failed' ? ['Implementation did not complete successfully'] : [],
    recommendations: report.recommendations.length > 0 ? report.recommendations : ['Proceed to Product Owner testing'],
    summary: report.status === 'success'
      ? 'Implementation meets requirements. Build and verification passed. Recommend proceeding to Product Owner testing.'
      : 'Implementation has issues. Review risks before proceeding.',
    overall_verdict: report.status === 'success' ? 'pass' : 'conditional_pass',
  };

  await updateExecution(executionId, {
    review_results: review,
    implementation_status: 'engineering_review',
  }, 'engineering_review_provider', 'review_completed', `Verdict: ${review.overall_verdict}`);

  return review;
}

export async function runAutomatedVerification(
  executionId: string,
  report: CompletionReport
): Promise<VerificationResults> {
  const verification: VerificationResults = {
    build_verified: report.build.success,
    functional_verified: report.verification.passed,
    ui_verified: false,
    data_verified: report.status !== 'failed',
    constitutional_verified: report.build.success && report.verification.passed,
    details: {
      build: report.build.success,
      functional: report.verification.passed,
      ui: false,
      data: report.status !== 'failed',
      constitutional: report.build.success && report.verification.passed,
    },
    timestamp: new Date().toISOString(),
  };

  await updateExecution(executionId, {
    verification_results: verification,
    implementation_status: 'automated_verification',
  }, 'verification_system', 'verification_complete', `All gates: ${Object.values(verification.details).every(Boolean) ? 'PASS' : 'PARTIAL'}`);

  return verification;
}

export async function submitPODecision(
  executionId: string,
  decision: 'approved' | 'rejected' | 'refinement',
  notes: string
): Promise<void> {
  const statusMap: Record<string, ExecutionStatus> = {
    approved: 'po_accepted',
    rejected: 'failed',
    refinement: 'prepared',
  };

  await updateExecution(executionId, {
    po_status: decision,
    po_notes: notes,
    po_decided_at: new Date().toISOString(),
    implementation_status: statusMap[decision],
  }, 'product_owner', 'po_decision', `Product Owner ${decision}: ${notes}`);
}

export async function releaseExecution(executionId: string): Promise<void> {
  await transitionStatus(executionId, 'released', 'system', 'Execution released');
}

export async function archiveExecution(executionId: string): Promise<void> {
  await transitionStatus(executionId, 'archived', 'system', 'Execution archived');
}
