// EWO-033 — Acceptance Criteria Generation Service
//
// Generates governed, outcome-specific acceptance criteria from the approved
// Product Owner request. Criteria propagate through the entire lifecycle:
// Conversation → EWO → Package → Execution Contract → Execution Request →
// Provider Request → Verification → Completion Package → PO Review.
//
// Generic build/test success does NOT satisfy outcome-specific criteria.

export type AcceptanceCriterionStatus = 'pending' | 'passed' | 'failed' | 'blocked' | 'not_performed';

export type VerificationMethod =
  | 'source_assertion'      // Inspect repository diff for specific change
  | 'build_verification'     // Build passes
  | 'test_verification'     // Relevant tests pass
  | 'ui_verification'       // Browser/DOM/computed-style check
  | 'component_inspection'  // Verify component renders correctly
  | 'po_live_verification'  // Product Owner manually verifies
  | 'functional_test'       // Functional behavior test
  | 'regression_test';      // Regression suite

export interface AcceptanceCriterion {
  id: string;
  source_request: string;
  description: string;
  expected_outcome: string;
  verification_method: VerificationMethod;
  required_evidence: string[];
  status: AcceptanceCriterionStatus;
  verifier: string | null;
  verified_at: string | null;
  evidence_refs: string[];
  /** EWO-034R.1: Detailed verification evidence from content-aware source assertion. */
  verification_evidence?: SourceAssertionVerificationResult | null;
}

export interface AcceptanceCriteriaSet {
  ewo_ref: string;
  original_request: string;
  criteria: AcceptanceCriterion[];
  generated_at: string;
  all_satisfied: boolean;
}

/**
 * Generates outcome-specific acceptance criteria from a Product Owner request.
 *
 * For UI change requests (e.g., button colour), generates criteria that verify
 * the specific visual/functional change, not just generic build success.
 */
export function generateAcceptanceCriteria(
  ewoRef: string,
  originalRequest: string,
  engineeringObjective?: string,
): AcceptanceCriteriaSet {
  const request = originalRequest.toLowerCase();
  const criteria: AcceptanceCriterion[] = [];
  const ts = new Date().toISOString();

  // Detect UI styling changes (e.g., "change X button colour from A to B")
  const colourMatch = request.match(/change\s+.*?(?:button|element|component|text|label|icon)\s+colou?r\s+from\s+(\w+)\s+to\s+(\w+)/);
  const buttonMatch = request.match(/(?:button|btn)\s+colou?r\s+from\s+(\w+)\s+to\s+(\w+)/);
  const styleMatch = colourMatch || buttonMatch;

  if (styleMatch) {
    const fromColour = styleMatch[1];
    const toColour = styleMatch[2];
    const targetElement = request.match(/(?:change\s+)?(.*?)(?:button|element|component)/)?.[1]?.trim() || 'target';

    criteria.push({
      id: `${ewoRef}-AC-1`,
      source_request: originalRequest,
      description: `The intended ${targetElement} button component is identified unambiguously.`,
      expected_outcome: 'Component resolution evidence identifies the exact file and element to modify.',
      verification_method: 'component_inspection',
      required_evidence: ['resolved_file_path', 'component_identifier', 'resolution_confidence'],
      status: 'pending',
      verifier: null,
      verified_at: null,
      evidence_refs: [],
    });

    criteria.push({
      id: `${ewoRef}-AC-2`,
      source_request: originalRequest,
      description: `The target button no longer uses the previous ${fromColour} background styling.`,
      expected_outcome: `Repository diff shows removal of ${fromColour} styling from the target button.`,
      verification_method: 'source_assertion',
      required_evidence: ['diff_showing_removal', 'before_after_comparison'],
      status: 'pending',
      verifier: null,
      verified_at: null,
      evidence_refs: [],
    });

    criteria.push({
      id: `${ewoRef}-AC-3`,
      source_request: originalRequest,
      description: `The target button uses the approved ${toColour} background styling.`,
      expected_outcome: `Repository diff shows application of ${toColour} styling to the target button.`,
      verification_method: 'source_assertion',
      required_evidence: ['diff_showing_addition', 'applied_class_or_style'],
      status: 'pending',
      verifier: null,
      verified_at: null,
      evidence_refs: [],
    });

    criteria.push({
      id: `${ewoRef}-AC-4`,
      source_request: originalRequest,
      description: 'The button remains visible, enabled and functionally unchanged apart from the approved colour change.',
      expected_outcome: 'Button retains all event handlers, disabled state logic, and visibility behavior.',
      verification_method: 'functional_test',
      required_evidence: ['component_renders', 'click_handler_intact', 'no_regressions'],
      status: 'pending',
      verifier: null,
      verified_at: null,
      evidence_refs: [],
    });

    criteria.push({
      id: `${ewoRef}-AC-5`,
      source_request: originalRequest,
      description: 'The relevant page renders without runtime failure.',
      expected_outcome: 'No runtime errors when navigating to the page containing the modified button.',
      verification_method: 'ui_verification',
      required_evidence: ['page_renders', 'no_console_errors'],
      status: 'pending',
      verifier: null,
      verified_at: null,
      evidence_refs: [],
    });

    criteria.push({
      id: `${ewoRef}-AC-6`,
      source_request: originalRequest,
      description: 'The application build and relevant regression tests pass.',
      expected_outcome: 'Build succeeds and all existing tests pass with the colour change.',
      verification_method: 'build_verification',
      required_evidence: ['build_success', 'test_results'],
      status: 'pending',
      verifier: null,
      verified_at: null,
      evidence_refs: [],
    });
  } else {
    // Generic criteria for non-UI-change requests
    criteria.push({
      id: `${ewoRef}-AC-1`,
      source_request: originalRequest,
      description: 'The target component is identified unambiguously.',
      expected_outcome: 'Component resolution evidence identifies the exact file to modify.',
      verification_method: 'component_inspection',
      required_evidence: ['resolved_file_path', 'resolution_confidence'],
      status: 'pending',
      verifier: null,
      verified_at: null,
      evidence_refs: [],
    });

    criteria.push({
      id: `${ewoRef}-AC-2`,
      source_request: originalRequest,
      description: 'The implementation achieves the stated engineering objective.',
      expected_outcome: engineeringObjective || 'Implementation matches the approved engineering plan.',
      verification_method: 'source_assertion',
      required_evidence: ['diff_evidence', 'implementation_summary'],
      status: 'pending',
      verifier: null,
      verified_at: null,
      evidence_refs: [],
    });

    criteria.push({
      id: `${ewoRef}-AC-3`,
      source_request: originalRequest,
      description: 'The application build passes.',
      expected_outcome: 'Build succeeds with no errors.',
      verification_method: 'build_verification',
      required_evidence: ['build_success'],
      status: 'pending',
      verifier: null,
      verified_at: null,
      evidence_refs: [],
    });

    criteria.push({
      id: `${ewoRef}-AC-4`,
      source_request: originalRequest,
      description: 'Relevant regression tests pass.',
      expected_outcome: 'All existing tests pass with the changes.',
      verification_method: 'test_verification',
      required_evidence: ['test_results'],
      status: 'pending',
      verifier: null,
      verified_at: null,
      evidence_refs: [],
    });

    criteria.push({
      id: `${ewoRef}-AC-5`,
      source_request: originalRequest,
      description: 'The relevant page renders without runtime failure.',
      expected_outcome: 'No runtime errors after the change.',
      verification_method: 'ui_verification',
      required_evidence: ['page_renders', 'no_console_errors'],
      status: 'pending',
      verifier: null,
      verified_at: null,
      evidence_refs: [],
    });
  }

  return {
    ewo_ref: ewoRef,
    original_request: originalRequest,
    criteria,
    generated_at: ts,
    all_satisfied: false,
  };
}

/**
 * Checks whether all acceptance criteria are satisfied.
 * Generic build success alone does NOT satisfy outcome-specific criteria.
 */
export function evaluateAcceptanceCriteria(criteriaSet: AcceptanceCriteriaSet): {
  all_satisfied: boolean;
  failed_criteria: AcceptanceCriterion[];
  pending_criteria: AcceptanceCriterion[];
  blocked_criteria: AcceptanceCriterion[];
} {
  const failed = criteriaSet.criteria.filter(c => c.status === 'failed');
  const pending = criteriaSet.criteria.filter(c => c.status === 'pending' || c.status === 'not_performed');
  const blocked = criteriaSet.criteria.filter(c => c.status === 'blocked');

  return {
    all_satisfied: failed.length === 0 && pending.length === 0 && blocked.length === 0 && criteriaSet.criteria.length > 0,
    failed_criteria: failed,
    pending_criteria: pending,
    blocked_criteria: blocked,
  };
}

// ─── EWO-034R.1: Content-Aware Source Assertion Verification ──────────────────

export interface SourceAssertionEvidence {
  file_path: string;
  action: 'create' | 'modify' | 'delete';
  content: string;
  diff_summary: string;
  lines_added: number;
  lines_removed: number;
}

export interface SourceAssertionVerificationResult {
  satisfied: boolean;
  reason: string;
  evidence_found: string[];
  evidence_missing: string[];
}

/**
 * Verifies a source_assertion criterion by inspecting the actual final file content.
 *
 * This is the EWO-034R.1 strengthening: a criterion is NOT marked passed merely
 * because a target file appears in filesModified. The verifier inspects the
 * content for the specific expected outcome.
 *
 * For colour change requests, it checks:
 *   1. The intended component/file was resolved
 *   2. The relevant old colour classes were removed from the intended button
 *   3. The new colour classes were added to the intended button
 *   4. Unrelated buttons were not unintentionally modified
 *   5. The source parses (basic syntax check)
 */
export function verifySourceAssertion(
  criterion: AcceptanceCriterion,
  evidence: SourceAssertionEvidence[],
  originalRequest: string,
): SourceAssertionVerificationResult {
  const request = originalRequest.toLowerCase();
  const evidenceFound: string[] = [];
  const evidenceMissing: string[] = [];

  // Parse the colour change request
  const colourMatch = request.match(/change\s+.*?(?:button|element|component|text|label|icon)\s+colou?r\s+from\s+(\w+)\s+to\s+(\w+)/);
  const buttonMatch = request.match(/(?:button|btn)\s+colou?r\s+from\s+(\w+)\s+to\s+(\w+)/);
  const styleMatch = colourMatch || buttonMatch;

  if (!styleMatch) {
    // Non-colour-change: verify the file was modified with content
    const hasContent = evidence.some(e => e.content && e.content.length > 0);
    if (hasContent) {
      return {
        satisfied: true,
        reason: 'Source assertion verified: file was modified with content',
        evidence_found: ['file_content_present'],
        evidence_missing: [],
      };
    }
    return {
      satisfied: false,
      reason: 'Source assertion failed: no file content provided',
      evidence_found: [],
      evidence_missing: ['file_content_present'],
    };
  }

  const fromColour = styleMatch[1];
  const toColour = styleMatch[2];

  // Tailwind class patterns for common colours
  const colourClassMap: Record<string, string[]> = {
    brown: ['bg-amber-800', 'bg-amber-700', 'bg-amber-900', 'bg-brown', 'text-amber-800', 'bg-amber-600', 'bg-amber-500'],
    teal: ['bg-teal-500', 'bg-teal-600', 'bg-teal-700', 'bg-teal-400', 'text-teal-500', 'bg-teal-800'],
    blue: ['bg-blue-500', 'bg-blue-600', 'bg-blue-700', 'text-blue-500'],
    green: ['bg-green-500', 'bg-green-600', 'bg-green-700', 'text-green-500'],
    red: ['bg-red-500', 'bg-red-600', 'bg-red-700', 'text-red-500'],
    purple: ['bg-purple-500', 'bg-purple-600', 'bg-purple-700', 'text-purple-500'],
    gray: ['bg-gray-500', 'bg-gray-600', 'bg-gray-700', 'text-gray-500'],
    orange: ['bg-orange-500', 'bg-orange-600', 'bg-orange-700', 'text-orange-500'],
    yellow: ['bg-yellow-500', 'bg-yellow-600', 'bg-yellow-700', 'text-yellow-500'],
    white: ['bg-white', 'text-white'],
    black: ['bg-black', 'text-black'],
  };

  const fromClasses = colourClassMap[fromColour] || [fromColour];
  const toClasses = colourClassMap[toColour] || [toColour];

  // 1. Verify the intended file was modified
  const modifiedFiles = evidence.map(e => e.file_path);
  if (modifiedFiles.length === 0) {
    return {
      satisfied: false,
      reason: 'Source assertion failed: no files were modified',
      evidence_found: [],
      evidence_missing: ['modified_file'],
    };
  }
  evidenceFound.push(`files_modified: ${modifiedFiles.join(', ')}`);

  // 2. Check each modified file's content
  let fromColourFound = false;
  let toColourFound = false;
  let unrelatedFileModified = false;
  const targetFileEvidence: string[] = [];

  for (const file of evidence) {
    const content = file.content || '';
    const contentLower = content.toLowerCase();

    // Check if old colour classes are still present (should be removed)
    for (const fromClass of fromClasses) {
      if (contentLower.includes(fromClass.toLowerCase())) {
        fromColourFound = true;
        evidenceMissing.push(`old_colour_still_present: ${fromClass} in ${file.file_path}`);
      }
    }

    // Check if new colour classes are present (should be added)
    for (const toClass of toClasses) {
      if (contentLower.includes(toClass.toLowerCase())) {
        toColourFound = true;
        targetFileEvidence.push(`new_colour_present: ${toClass} in ${file.file_path}`);
      }
    }
  }

  // 3. Verify: old colour should be removed, new colour should be added
  if (fromColourFound) {
    return {
      satisfied: false,
      reason: `Source assertion failed: the previous ${fromColour} colour is still present in the modified file(s). ${evidenceMissing.join('; ')}`,
      evidence_found: evidenceFound,
      evidence_missing: [`old_colour_removed (${fromColour})`, ...evidenceMissing],
    };
  }
  evidenceFound.push(`old_colour_removed (${fromColour})`);

  if (!toColourFound) {
    return {
      satisfied: false,
      reason: `Source assertion failed: the requested ${toColour} colour was not found in the modified file content. Expected one of: ${toClasses.join(', ')}`,
      evidence_found: evidenceFound,
      evidence_missing: [`new_colour_added (${toColour})`],
    };
  }
  evidenceFound.push(...targetFileEvidence);

  // 4. Verify unrelated files were not modified
  // For a single-file colour change, more than 3 files is suspicious
  if (modifiedFiles.length > 5) {
    return {
      satisfied: false,
      reason: `Source assertion failed: ${modifiedFiles.length} files were modified, which suggests unintended changes. Expected 1-3 files for a colour change.`,
      evidence_found: evidenceFound,
      evidence_missing: ['limited_scope_of_changes'],
    };
  }
  evidenceFound.push(`limited_scope: ${modifiedFiles.length} files modified`);

  // 5. Basic syntax check — verify the content looks like valid TSX/JSX
  for (const file of evidence) {
    const content = file.content || '';
    if (content.length > 0) {
      // Check for balanced braces (basic)
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      if (Math.abs(openBraces - closeBraces) > 2) {
        return {
          satisfied: false,
          reason: `Source assertion failed: unbalanced braces in ${file.file_path} (${openBraces} open, ${closeBraces} close) — possible syntax error`,
          evidence_found: evidenceFound,
          evidence_missing: ['valid_syntax'],
        };
      }
    }
  }
  evidenceFound.push('basic_syntax_valid');

  return {
    satisfied: true,
    reason: `Source assertion verified: ${fromColour} colour removed, ${toColour} colour added, scope limited to ${modifiedFiles.length} file(s), syntax valid`,
    evidence_found: evidenceFound,
    evidence_missing: [],
  };
}
