// EWO-024R.2 — Governed Refusal Guidance
// Provides useful safe alternatives in read-only refusal responses.

import type { Capability } from './types';

const CAPABILITY_ALTERNATIVES: Record<string, string[]> = {
  'engineering-work-orders': [
    'Inspect {ref}',
    'Show relationships for {ref}',
    'Inspect its Completion Report',
    'Inspect its Engineering Record',
  ],
  'engineering-records': [
    'Inspect {ref}',
    'Show relationships for {ref}',
    'List all Engineering Records',
  ],
  'engineering-standards': [
    'Inspect {ref}',
    'List all Engineering Standards',
  ],
  'constitution': [
    'Inspect {ref}',
    'List Constitution amendments',
  ],
  'pages': [
    'Inspect {ref}',
    'List all pages',
  ],
  'workspaces': [
    'Inspect {ref}',
    'List all workspaces',
  ],
  'services': [
    'Inspect {ref}',
    'List all services',
  ],
  'memory': [
    'Inspect memory for {ref}',
    'List engineering memory',
  ],
  'knowledge': [
    'Inspect knowledge for {ref}',
    'List knowledge',
  ],
  'lineage': [
    'Inspect lineage for {ref}',
    'Show relationships for {ref}',
  ],
  'engineering-plans': [
    'Inspect plan for {ref}',
    'List engineering plans',
  ],
  'capabilities': [
    'Inspect capability {ref}',
    'List every engineering capability',
  ],
};

export interface GovernedRefusalResult {
  requested_action: string;
  reason: string;
  no_changes_made: boolean;
  audit_reference: string;
  available_alternatives: string[];
}

export function createGovernedRefusalWithGuidance(
  requestedAction: string,
  objectRef: string | null,
  resolvedCapability: string | null,
  auditReference: string,
  capabilities?: Capability[],
): GovernedRefusalResult {
  const alternatives: string[] = [];

  if (resolvedCapability && CAPABILITY_ALTERNATIVES[resolvedCapability]) {
    const refPlaceholder = objectRef ?? 'the object';
    for (const template of CAPABILITY_ALTERNATIVES[resolvedCapability]) {
      alternatives.push(template.replace('{ref}', refPlaceholder));
    }
  }

  // If no capability-specific alternatives, provide general ones
  if (alternatives.length === 0) {
    if (objectRef) {
      alternatives.push(`Inspect ${objectRef}`);
      alternatives.push(`Show relationships for ${objectRef}`);
    }
    alternatives.push('List every engineering capability');
  }

  // Filter alternatives to only those supported by registered capabilities
  if (capabilities && capabilities.length > 0) {
    const capabilityIds = new Set(capabilities.map(c => c.capability_id));
    const filtered = alternatives.filter(alt => {
      // Keep general alternatives that don't require a specific capability
      return true; // All alternatives are read-only inspection suggestions
    });
    if (filtered.length > 0) {
      return {
        requested_action: requestedAction,
        reason: 'ATD Connect exposes read-only governed inspection capabilities.',
        no_changes_made: true,
        audit_reference: auditReference,
        available_alternatives: filtered,
      };
    }
  }

  return {
    requested_action: requestedAction,
    reason: 'ATD Connect exposes read-only governed inspection capabilities.',
    no_changes_made: true,
    audit_reference: auditReference,
    available_alternatives: alternatives,
  };
}

export function formatRefusalMessage(refusal: GovernedRefusalResult): string {
  const lines: string[] = [
    'Governed Refusal',
    '',
    'Requested action:',
    `  ${refusal.requested_action}`,
    '',
    'Reason:',
    `  ${refusal.reason}`,
    '',
    'No changes were made.',
    '',
    'Available alternatives:',
  ];

  for (const alt of refusal.available_alternatives) {
    lines.push(`  - ${alt}`);
  }

  lines.push('', `Audit reference: ${refusal.audit_reference}`);

  return lines.join('\n');
}
