// EWO-016 — Execution Eligibility Gate
// Evaluates whether an EWO is eligible for execution before preparing it.

import { supabase } from './supabase';
import type { EngineeringKnowledgePackage } from './engineeringReferenceResolver';

export interface EligibilityCheck {
  ewoRef: string;
  ewoId: string;
  eligible: boolean;
  blockers: EligibilityBlocker[];
  warnings: string[];
  implementationProvider: string;
  reviewProvider: string;
  checks: EligibilityCheckResult[];
}

export interface EligibilityBlocker {
  check: string;
  reason: string;
  governedAction: string;
}

export interface EligibilityCheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export async function evaluateExecutionEligibility(
  ewoId: string,
  ewoRef: string
): Promise<EligibilityCheck> {
  const blockers: EligibilityBlocker[] = [];
  const warnings: string[] = [];
  const checks: EligibilityCheckResult[] = [];

  // 1. EWO exists and is not archived/deleted
  const { data: ewo } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, implementation_status, verification_status, po_acceptance_notes, engineering_package_status, implementation_provider')
    .eq('id', ewoId)
    .maybeSingle();

  if (!ewo) {
    blockers.push({ check: 'EWO exists', reason: 'EWO not found', governedAction: 'Verify the EWO reference.' });
    checks.push({ name: 'EWO exists', passed: false, detail: 'Not found' });
    return { ewoRef, ewoId, eligible: false, blockers, warnings, implementationProvider: 'bolt', reviewProvider: 'openai', checks };
  }
  checks.push({ name: 'EWO exists', passed: true, detail: ewo.title });

  const isArchived = ewo.implementation_status === 'archived' || ewo.status === 'archived';
  const isDeleted = ewo.status === 'deleted' || ewo.status === 'cancelled';
  if (isArchived || isDeleted) {
    blockers.push({ check: 'Not archived/deleted', reason: `EWO is ${ewo.implementation_status || ewo.status}`, governedAction: 'Restore or reopen the EWO before execution.' });
  }
  checks.push({ name: 'Not archived/deleted', passed: !isArchived && !isDeleted, detail: `Status: ${ewo.status}` });

  // 2. Required Engineering Plan exists
  const hasPlan = !!ewo.engineering_package_status && ewo.engineering_package_status !== 'none';
  if (!hasPlan) {
    blockers.push({ check: 'Engineering Plan exists', reason: 'No engineering package linked to this EWO', governedAction: 'Generate an Engineering Plan via ATD before execution.' });
  }
  checks.push({ name: 'Engineering Plan exists', passed: hasPlan, detail: ewo.engineering_package_status || 'Missing' });

  // 3. Required approvals exist
  const hasApproval = ewo.status === 'approved' || ewo.status === 'in_progress' || ewo.implementation_status === 'in_progress';
  if (!hasApproval) {
    blockers.push({ check: 'Approvals exist', reason: `EWO status is ${ewo.status}`, governedAction: 'Obtain governance approval before execution.' });
  }
  checks.push({ name: 'Approvals exist', passed: hasApproval, detail: `Status: ${ewo.status}` });

  // 4. Requirements are complete — check if EWO has validation_requirements or scope
  const { data: ewoFull } = await supabase
    .from('engineering_work_orders')
    .select('scope, validation_requirements')
    .eq('id', ewoId)
    .maybeSingle();
  const requirementsComplete = !!(ewoFull && (ewoFull.scope || ewoFull.validation_requirements));
  if (!requirementsComplete) {
    blockers.push({ check: 'Requirements complete', reason: 'EWO lacks scope or validation requirements', governedAction: 'Complete the EWO scope and validation requirements.' });
  }
  checks.push({ name: 'Requirements complete', passed: requirementsComplete, detail: requirementsComplete ? 'Scope defined' : 'Missing scope' });

  // 5. Acceptance criteria exist — check verification standard
  const { data: verStandard } = await supabase
    .from('ecc_engineering_verification_standard')
    .select('id')
    .eq('status', 'active')
    .maybeSingle();
  const hasAcceptanceCriteria = !!verStandard;
  if (!hasAcceptanceCriteria) {
    warnings.push('No active verification standard found — acceptance criteria may be incomplete.');
  }
  checks.push({ name: 'Acceptance criteria exist', passed: hasAcceptanceCriteria, detail: hasAcceptanceCriteria ? 'Active standard found' : 'No active standard' });

  // 6. Dependencies are satisfied
  const { data: deps } = await supabase
    .from('engineering_object_relationships')
    .select('to_object_ref, relationship_type')
    .eq('from_object_ref', ewoRef)
    .eq('relationship_type', 'depends_on');
  let dependenciesSatisfied = true;
  if (deps && deps.length > 0) {
    for (const dep of deps) {
      if (dep.to_object_ref) {
        const { data: depEwo } = await supabase
          .from('engineering_work_orders')
          .select('status, implementation_status')
          .eq('ewo_ref', dep.to_object_ref)
          .maybeSingle();
        if (depEwo && depEwo.implementation_status !== 'released' && depEwo.status !== 'released') {
          dependenciesSatisfied = false;
          blockers.push({ check: 'Dependencies satisfied', reason: `Dependency ${dep.to_object_ref} is not released (status: ${depEwo.status})`, governedAction: 'Complete or release dependency before execution.' });
        }
      }
    }
  }
  checks.push({ name: 'Dependencies satisfied', passed: dependenciesSatisfied, detail: deps?.length ? `${deps.length} dependency(ies)` : 'No dependencies' });

  // 7. No blocking constitutional failure
  const { data: failedAmendments } = await supabase
    .from('constitutional_documents')
    .select('id, document_ref, title')
    .eq('status', 'failed')
    .limit(1);
  const noConstitutionalFailure = !failedAmendments || failedAmendments.length === 0;
  if (!noConstitutionalFailure) {
    blockers.push({ check: 'No constitutional failure', reason: 'Constitutional amendment in failed state', governedAction: 'Resolve constitutional failure before execution.' });
  }
  checks.push({ name: 'No constitutional failure', passed: noConstitutionalFailure, detail: noConstitutionalFailure ? 'None' : 'Failed amendment detected' });

  // 8. No conflicting active execution
  const { data: activeExecs } = await supabase
    .from('engineering_executions')
    .select('id, execution_ref, implementation_status')
    .eq('ewo_id', ewoId)
    .in('implementation_status', ['draft', 'prepared', 'submitted', 'running', 'awaiting_completion', 'completion_received', 'engineering_review', 'automated_verification', 'awaiting_po_testing']);
  const noConflictingExecution = !activeExecs || activeExecs.length === 0;
  if (!noConflictingExecution) {
    blockers.push({ check: 'No conflicting execution', reason: `Active execution ${activeExecs[0].execution_ref} exists (status: ${activeExecs[0].implementation_status})`, governedAction: 'Cancel or complete the existing execution before starting a new one.' });
  }
  checks.push({ name: 'No conflicting execution', passed: noConflictingExecution, detail: noConflictingExecution ? 'None' : `${activeExecs!.length} active` });

  // 9. Implementation provider is available
  const implementationProvider = ewo.implementation_provider || 'bolt';
  checks.push({ name: 'Implementation provider available', passed: true, detail: implementationProvider });

  // 10. Verification requirements are defined
  const { data: gates } = await supabase
    .from('ewo_verification_gates')
    .select('id')
    .eq('ewo_id', ewoId);
  const verificationDefined = !!(gates && gates.length > 0);
  if (!verificationDefined) {
    warnings.push('Verification gates not yet initialized — they will be created during execution.');
  }
  checks.push({ name: 'Verification requirements defined', passed: verificationDefined, detail: verificationDefined ? `${gates!.length} gates` : 'Will be initialized' });

  const eligible = blockers.length === 0;

  return {
    ewoRef,
    ewoId,
    eligible,
    blockers,
    warnings,
    implementationProvider,
    reviewProvider: 'openai',
    checks,
  };
}

// ─── Eligibility → Human-Readable Card ─────────────────────────────────────────

export function renderEligibilityCard(eligibility: EligibilityCheck): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════');
  lines.push('Execution Eligibility');
  lines.push('═══════════════════════════════════════════════');
  lines.push(`Engineering Work Order: ${eligibility.ewoRef}`);
  lines.push(`Execution Eligibility: ${eligibility.eligible ? 'Ready' : 'Blocked'}`);
  lines.push(`Implementation Provider: ${eligibility.implementationProvider}`);
  lines.push(`Review Provider: ${eligibility.reviewProvider}`);
  lines.push('');
  if (eligibility.blockers.length === 0) {
    lines.push('Blocking Issues: None');
  } else {
    lines.push('Blocking Issues:');
    for (const b of eligibility.blockers) {
      lines.push(`  • ${b.check}: ${b.reason}`);
      lines.push(`    → ${b.governedAction}`);
    }
  }
  if (eligibility.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of eligibility.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }
  lines.push('═══════════════════════════════════════════════');
  return lines.join('\n');
}
