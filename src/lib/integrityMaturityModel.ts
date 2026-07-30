// EWO-014.19A.7S — Platform Maturity Model for Engineering Integrity capabilities.
//
// Every capability reports one of: Operational, Degraded, Unavailable,
// Not Yet Implemented. The platform never classifies an unimplemented
// capability as an error — it clearly explains the state.

export type CapabilityMaturity =
  | 'operational'
  | 'degraded'
  | 'unavailable'
  | 'not_yet_implemented'
  | 'planned'
  | 'partially_implemented'
  | 'deprecated';

export interface CapabilityState {
  maturity: CapabilityMaturity;
  description: string;
  /** Why this state exists — grounded in engineering evidence, never invented */
  explanation: string;
  /** What the Product Owner should do next, if anything */
  recommendedAction: string | null;
  /** Whether this capability can be retried */
  retryable: boolean;
}

export interface IntegrityCapability {
  key: string;
  label: string;
  category: 'reconciliation' | 'scoring' | 'alerts' | 'lifecycle' | 'evidence' | 'diagnostics' | 'reporting';
  description: string;
  /** Function that returns the current state — must be grounded in real data */
  evaluate: (context: MaturityContext) => CapabilityState;
}

export interface MaturityContext {
  hasBaseline: boolean;
  latestAuditExists: boolean;
  allSourcesSucceeded: boolean;
  sourceCoverage: number;
  openAlertsCount: number;
  integrityScore: number;
  scoreEligible: boolean;
  stableResult: boolean;
  prematureClosures: number;
  ewoCount: number;
}

// ─── Maturity Display Configuration ─────────────────────────────────────────

export const MATURITY_DISPLAY: Record<CapabilityMaturity, { label: string; badge: string; dot: string; icon: string; description: string }> = {
  operational:           { label: 'Operational',           badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: 'CheckCircle2', description: 'Capability is operational and functioning within governed parameters.' },
  degraded:              { label: 'Degraded',              badge: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500',   icon: 'AlertTriangle', description: 'Capability is temporarily unavailable or operating with reduced fidelity.' },
  unavailable:           { label: 'Unavailable',          badge: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-500',  icon: 'AlertCircle', description: 'Capability is temporarily unavailable — runtime execution failed or configuration prevented operation.' },
  not_yet_implemented:   { label: 'Not Yet Implemented',   badge: 'bg-slate-100 text-slate-500 border-slate-200',     dot: 'bg-slate-400',   icon: 'Circle', description: 'Capability exists but has not yet been engineered. This is not an error.' },
  planned:               { label: 'Planned',               badge: 'bg-blue-50 text-blue-700 border-blue-200',         dot: 'bg-blue-400',    icon: 'Clock', description: 'Capability is planned for future implementation. No runtime behaviour is implied.' },
  partially_implemented: { label: 'Partially Implemented', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200',         dot: 'bg-cyan-500',    icon: 'Activity', description: 'Capability is partially implemented — some functionality is available.' },
  deprecated:            { label: 'Deprecated',             badge: 'bg-slate-50 text-slate-400 border-slate-200',      dot: 'bg-slate-300',   icon: 'Ban', description: 'Capability is deprecated and may be removed in a future release. disabled by configuration.' },
};

// ─── Capability Registry ─────────────────────────────────────────────────────
// Each capability is evaluated against real audit data. No capability is
// classified as an error when it has simply not been engineered yet.

export const INTEGRITY_CAPABILITIES: IntegrityCapability[] = [
  {
    key: 'historical_reconciliation',
    label: 'Historical Reconciliation',
    category: 'reconciliation',
    description: 'Multi-pass reconciliation of all authoritative engineering sources against the canonical EWO ledger.',
    evaluate: (ctx) => {
      if (!ctx.latestAuditExists) {
        return {
          maturity: 'not_yet_implemented',
          description: 'Historical reconciliation has not yet been run.',
          explanation: 'This capability exists but has not yet been executed. Run the first historical reconciliation to establish the integrity baseline.',
          recommendedAction: 'Run Historical Reconciliation',
          retryable: true,
        };
      }
      if (!ctx.allSourcesSucceeded) {
        return {
          maturity: 'degraded',
          description: 'One or more required sources failed to scan.',
          explanation: 'Reconciliation ran but did not complete successfully — some authoritative sources could not be scanned. Review the Source Completion Envelope for failure details.',
          recommendedAction: 'Review failed sources and re-run reconciliation',
          retryable: true,
        };
      }
      if (!ctx.stableResult) {
        return {
          maturity: 'degraded',
          description: 'Reconciliation has not reached a stable result.',
          explanation: 'The reconciliation loop is making repairs but has not yet converged on a stable state. Additional passes may be required.',
          recommendedAction: 'Re-run reconciliation until stable',
          retryable: true,
        };
      }
      return {
        maturity: 'operational',
        description: 'All required sources scanned successfully and reconciliation is stable.',
        explanation: 'The integrity baseline has been established and all authoritative sources reconcile against the canonical EWO ledger.',
        recommendedAction: null,
        retryable: false,
      };
    },
  },
  {
    key: 'integrity_scoring',
    label: 'Integrity Scoring',
    category: 'scoring',
    description: 'Truthful integrity score calculation based on reconciliation completeness and issue resolution.',
    evaluate: (ctx) => {
      if (!ctx.latestAuditExists) {
        return {
          maturity: 'not_yet_implemented',
          description: 'No integrity score has been calculated.',
          explanation: 'Scoring requires a completed reconciliation audit. Run the first historical reconciliation to generate a score.',
          recommendedAction: 'Run Historical Reconciliation',
          retryable: true,
        };
      }
      if (!ctx.scoreEligible) {
        return {
          maturity: 'degraded',
          description: 'Score is not eligible — prerequisites not met.',
          explanation: 'An integrity score exists but is not eligible because not all required sources succeeded or unresolved issues remain.',
          recommendedAction: 'Resolve open issues and ensure all sources succeed',
          retryable: true,
        };
      }
      return {
        maturity: 'operational',
        description: `Integrity score: ${ctx.integrityScore}% — eligible.`,
        explanation: 'The integrity score is eligible and reflects the current reconciled state of the engineering ledger.',
        recommendedAction: null,
        retryable: false,
      };
    },
  },
  {
    key: 'alert_management',
    label: 'Alert Management',
    category: 'alerts',
    description: 'Governed integrity alerts with classification, confidence, and resolution workflows.',
    evaluate: (ctx) => {
      if (!ctx.latestAuditExists) {
        return {
          maturity: 'not_yet_implemented',
          description: 'No alerts have been generated — no audit has been run.',
          explanation: 'Alert management requires at least one reconciliation audit to identify integrity issues.',
          recommendedAction: 'Run Historical Reconciliation',
          retryable: true,
        };
      }
      return {
        maturity: ctx.openAlertsCount > 0 ? 'degraded' : 'operational',
        description: ctx.openAlertsCount > 0
          ? `${ctx.openAlertsCount} open alert(s) require attention.`
          : 'No open alerts — all integrity issues resolved.',
        explanation: ctx.openAlertsCount > 0
          ? 'Open alerts indicate integrity issues that have been detected but not yet resolved or dismissed.'
          : 'All detected integrity issues have been resolved or dismissed.',
        recommendedAction: ctx.openAlertsCount > 0 ? 'Review and resolve open alerts' : null,
        retryable: false,
      };
    },
  },
  {
    key: 'lifecycle_truthfulness',
    label: 'Lifecycle Truthfulness',
    category: 'lifecycle',
    description: 'Verifies that closure requires Product Owner acceptance and distinguishes engineering completion from PO completion.',
    evaluate: (ctx) => {
      if (ctx.prematureClosures > 0) {
        return {
          maturity: 'degraded',
          description: `${ctx.prematureClosures} EWO(s) closed without PO acceptance.`,
          explanation: 'Premature closures detected — EWOs with status "closed" that are not closure eligible. Product Owner acceptance is required before closure.',
          recommendedAction: 'Review premature closures and restore to awaiting PO acceptance',
          retryable: false,
        };
      }
      return {
        maturity: 'operational',
        description: 'All closures are PO-accepted.',
        explanation: 'No premature closures detected. Every closed EWO has gone through the Product Owner acceptance workflow.',
        recommendedAction: null,
        retryable: false,
      };
    },
  },
  {
    key: 'source_coverage',
    label: 'Source Coverage',
    category: 'evidence',
    description: 'Coverage of all authoritative engineering sources during reconciliation scanning.',
    evaluate: (ctx) => {
      if (!ctx.latestAuditExists) {
        return {
          maturity: 'not_yet_implemented',
          description: 'No sources have been scanned.',
          explanation: 'Source coverage requires at least one reconciliation audit to scan the authoritative source tables.',
          recommendedAction: 'Run Historical Reconciliation',
          retryable: true,
        };
      }
      if (ctx.sourceCoverage < 100) {
        return {
          maturity: 'degraded',
          description: `${ctx.sourceCoverage}% source coverage — some sources failed.`,
          explanation: 'Not all required authoritative sources were scanned successfully. Review the Source Completion Envelope for failure details.',
          recommendedAction: 'Review failed sources',
          retryable: true,
        };
      }
      return {
        maturity: 'operational',
        description: '100% source coverage — all sources scanned.',
        explanation: 'All required authoritative sources were scanned successfully during the last reconciliation.',
        recommendedAction: null,
        retryable: false,
      };
    },
  },
  {
    key: 'runtime_diagnostics',
    label: 'Runtime Diagnostics',
    category: 'diagnostics',
    description: 'Runtime Diagnostic Envelopes for capturing authoritative runtime execution evidence.',
    evaluate: (_ctx) => ({
      maturity: 'planned',
      description: 'Runtime Diagnostic Envelopes are planned but not yet implemented.',
      explanation: 'This capability has not yet been engineered. Runtime diagnostics will capture authoritative runtime execution evidence for verification. No runtime behaviour is implied.',
      recommendedAction: null,
      retryable: false,
    }),
  },
  {
    key: 'completion_report_validation',
    label: 'Completion Report Validation',
    category: 'reporting',
    description: 'Cross-validation of completion reports against canonical EWO records.',
    evaluate: (ctx) => {
      if (!ctx.latestAuditExists) {
        return {
          maturity: 'not_yet_implemented',
          description: 'No completion reports have been validated.',
          explanation: 'Completion report validation requires at least one reconciliation audit.',
          recommendedAction: 'Run Historical Reconciliation',
          retryable: true,
        };
      }
      return {
        maturity: 'operational',
        description: 'Completion reports are validated during reconciliation.',
        explanation: 'Completion reports are cross-referenced against canonical EWO records during each reconciliation pass.',
        recommendedAction: null,
        retryable: false,
      };
    },
  },
  {
    key: 'auto_repair',
    label: 'Auto-Repair Engine',
    category: 'reconciliation',
    description: 'Automatic repair of eligible integrity issues during reconciliation passes.',
    evaluate: (ctx) => {
      if (!ctx.latestAuditExists) {
        return {
          maturity: 'not_yet_implemented',
          description: 'Auto-repair has not been executed.',
          explanation: 'Auto-repair runs during reconciliation passes. No audit has been run yet.',
          recommendedAction: 'Run Historical Reconciliation',
          retryable: true,
        };
      }
      return {
        maturity: 'operational',
        description: 'Auto-repair is active during reconciliation.',
        explanation: 'Eligible integrity issues are automatically repaired during each reconciliation pass.',
        recommendedAction: null,
        retryable: false,
      };
    },
  },
];

// ─── Maturity Summary ────────────────────────────────────────────────────────

export interface MaturitySummary {
  operational: number;
  degraded: number;
  unavailable: number;
  not_yet_implemented: number;
  planned: number;
  partially_implemented: number;
  deprecated: number;
  total: number;
}

export function evaluateAllCapabilities(ctx: MaturityContext): { capability: IntegrityCapability; state: CapabilityState }[] {
  return INTEGRITY_CAPABILITIES.map(capability => ({
    capability,
    state: capability.evaluate(ctx),
  }));
}

export function summariseMaturity(evaluations: { state: CapabilityState }[]): MaturitySummary {
  const summary: MaturitySummary = {
    operational: 0, degraded: 0, unavailable: 0, not_yet_implemented: 0,
    planned: 0, partially_implemented: 0, deprecated: 0, total: evaluations.length,
  };
  for (const { state } of evaluations) {
    summary[state.maturity]++;
  }
  return summary;
}
