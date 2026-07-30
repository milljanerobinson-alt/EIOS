// EWO-021R.1 — Canonical Investigation Schema
//
// The single source of truth for Investigation sections. Both the
// Investigation Workspace UI and the Copy Investigation exporter consume
// this schema. Adding a new section automatically renders in the UI and
// appears in the export — no duplicate layout knowledge required.
//
// Architecture:
//
//   Investigation UI ──▶ Canonical Investigation Schema
//                              │
//                    ┌─────────┴──────────┐
//                    ▼                    ▼
//              UI Rendering          Text Export
//                                        │
//                    ▼                   ▼
//              PDF Export (future)   AI Context (future)

import type { ReactNode } from 'react';
import type { IntegrityAlert } from './engineeringIntegrityService';
import type { EvidencePackage } from './evidencePackageService';
import type { EngineeringRecommendation } from './engineeringRecommendationEngine';
import type { EngineeringDecision, DecisionTimelineEvent } from './engineeringDecisionService';
import type { AuthoritativeLineageDetail, InvestigationEvidence, InvestigationAction } from './integrityInvestigation';
import { DECISION_LABELS, RELATIONSHIP_LABELS } from './engineeringDecisionService';
import { DOMAIN_LABELS } from './integrityDomainModel';
import { RESOLUTION_STATUS_LABELS, RESOLUTION_LIFECYCLE, type ResolutionStatus, type GovernedAction } from './engineeringIntelligenceWorkflow';
import type { GovernedResponse } from './governedResponse';

// ─── Schema Data Model ───────────────────────────────────────────────────────

export interface InvestigationSchemaData {
  alert: IntegrityAlert;
  evolvedTitle: string | null;
  executiveSummary: string;
  rootCause: string;
  affectedComponents: string[];
  evidence: InvestigationEvidence[];
  timeline: { timestamp: string; event: string }[];
  recommendedActions: InvestigationAction[];
  relatedEngineering: { ref: string; title: string; type: string }[];
  confidence: number;
  confidenceExplanation: string;
  evidencePackage: EvidencePackage | null;
  recommendation: EngineeringRecommendation | null;
  decision: EngineeringDecision | null;
  decisionTimeline: DecisionTimelineEvent[];
  authoritativeLineage: AuthoritativeLineageDetail | undefined;
  governedActions: GovernedAction[];
  resolutionStatus: ResolutionStatus;
  resolutionTimestamp: string | null;
  resolutionActor: string | null;
  resolutionMessage: string | null;
  governedResponseState: GovernedResponse | null;
  isReadOnly: boolean;
  governedResponseRef: string | null;
}

// ─── Section Registry ─────────────────────────────────────────────────────────

export interface InvestigationSection {
  id: string;
  label: string;
  isVisible: (data: InvestigationSchemaData) => boolean;
  serialize: (data: InvestigationSchemaData) => string[];
}

// ─── Serialization Helpers ───────────────────────────────────────────────────

const SEP = '───────────────────────────────────────────────────────────────';

function sectionHeader(label: string): string[] {
  return [SEP, label.toUpperCase(), SEP];
}

function fmtTimestamp(ts: string | null): string {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

// ─── Section Definitions ─────────────────────────────────────────────────────

const sections: InvestigationSection[] = [
  {
    id: 'investigation_title',
    label: 'Investigation Title',
    isVisible: () => true,
    serialize: (d) => [
      `Investigation Title: ${d.evolvedTitle ?? d.alert.title ?? 'Untitled Investigation'}`,
      d.evolvedTitle && d.evolvedTitle !== d.alert.title
        ? `Original Title: ${d.alert.title}`
        : '',
    ].filter(Boolean),
  },
  {
    id: 'alert_reference',
    label: 'Alert Reference',
    isVisible: () => true,
    serialize: (d) => [
      `Alert Reference: ${d.alert.alert_ref ?? d.alert.normalised_reference ?? '—'}`,
      `Alert ID: ${d.alert.id}`,
      `Alert Type: ${d.alert.alert_type ?? '—'}`,
      `Severity: ${d.alert.severity ?? '—'}`,
      `Object Type: ${d.alert.object_type?.toUpperCase() ?? '—'}`,
      `Detected At: ${fmtTimestamp(d.alert.created_at)}`,
    ],
  },
  {
    id: 'executive_summary',
    label: 'Executive Summary',
    isVisible: () => true,
    serialize: (d) => [
      ...sectionHeader('Executive Summary'),
      d.executiveSummary || 'No executive summary available.',
    ],
  },
  {
    id: 'root_cause',
    label: 'Root Cause',
    isVisible: () => true,
    serialize: (d) => [
      ...sectionHeader('Root Cause'),
      d.rootCause || 'Root cause analysis not yet available.',
    ],
  },
  {
    id: 'affected_components',
    label: 'Affected Components',
    isVisible: (d) => d.affectedComponents.length > 0,
    serialize: (d) => [
      ...sectionHeader('Affected Components'),
      d.affectedComponents.length > 0
        ? d.affectedComponents.map(c => `  • ${c}`).join('\n')
        : 'None identified.',
    ],
  },
  {
    id: 'confidence',
    label: 'Confidence',
    isVisible: () => true,
    serialize: (d) => {
      const label = d.confidence >= 0.9 ? 'High' : d.confidence >= 0.7 ? 'Medium' : d.confidence >= 0.5 ? 'Low' : 'Very Low';
      return [
        ...sectionHeader('Confidence'),
        `Confidence Score: ${pct(d.confidence)} (${label})`,
        `Explanation: ${d.confidenceExplanation || 'Confidence assessment not available.'}`,
      ];
    },
  },
  {
    id: 'evidence',
    label: 'Evidence',
    isVisible: (d) => d.evidence.length > 0,
    serialize: (d) => {
      const lines = [...sectionHeader(`Evidence (${d.evidence.length})`)];
      if (d.evidence.length === 0) {
        lines.push('No evidence items collected.');
      } else {
        for (const ev of d.evidence) {
          lines.push(`  • [${ev.type.toUpperCase()}] ${ev.label}`);
          lines.push(`    Reference: ${ev.reference}`);
          if (ev.description) lines.push(`    Description: ${ev.description}`);
        }
      }
      return lines;
    },
  },
  {
    id: 'evidence_package',
    label: 'Evidence Package',
    isVisible: (d) => d.evidencePackage !== null && d.evidencePackage.evidence_items.length > 0,
    serialize: (d) => {
      const lines = [...sectionHeader(`Evidence Package (${d.evidencePackage!.evidence_items.length})`)];
      for (const item of d.evidencePackage!.evidence_items) {
        lines.push(`  • [${item.source_type}] ${item.source_table}`);
        lines.push(`    Field: ${item.field_name}`);
        if (item.field_value) lines.push(`    Value: ${item.field_value}`);
        lines.push(`    Object ID: ${item.object_id ?? 'N/A'}`);
        lines.push(`    Confidence: ${pct(item.confidence)}`);
        lines.push(`    Priority: ${item.evidence_priority}`);
        if (item.supports_conclusion) lines.push(`    Supports: Yes`);
        if (item.contradicts_conclusion) lines.push(`    Conflicts: Yes`);
        if (item.why_selected) lines.push(`    Why Selected: ${item.why_selected}`);
      }
      return lines;
    },
  },
  {
    id: 'conflicting_values',
    label: 'Conflicting Values',
    isVisible: (d) => d.evidencePackage !== null && d.evidencePackage.conflicts.length > 0,
    serialize: (d) => {
      const lines = [...sectionHeader(`Conflicting Values (${d.evidencePackage!.conflicts.length})`)];
      for (const conflict of d.evidencePackage!.conflicts) {
        lines.push(`  • ${conflict.conflict_summary}`);
        for (const val of conflict.values) {
          lines.push(`    ${val.source_type}: ${val.field_value} (${val.source_table} · ${val.field_name})`);
          if (conflict.canonical_candidate === val.field_value) lines.push(`      → Canonical Candidate`);
        }
        if (conflict.canonical_candidate) {
          lines.push(`    Canonical Candidate: ${conflict.canonical_candidate}`);
          if (conflict.canonical_reason) lines.push(`    Canonical Reason: ${conflict.canonical_reason}`);
        } else {
          lines.push(`    Product Owner review required — canonical value cannot be safely determined.`);
        }
      }
      return lines;
    },
  },
  {
    id: 'classification_explanation',
    label: 'Classification Explanation',
    isVisible: (d) => d.evidencePackage !== null,
    serialize: (d) => {
      const ce = d.evidencePackage!.classification_explanation;
      const lines = [...sectionHeader('Classification Explanation')];
      lines.push(`  Classification: ${ce.classification}`);
      lines.push(`  Why Chosen: ${ce.chosen_reason}`);
      if (ce.rejected_alternatives.length > 0) {
        lines.push('  Rejected Alternatives:');
        for (const alt of ce.rejected_alternatives) lines.push(`    • ${alt}`);
      }
      if (ce.authoritative_rules_applied.length > 0) {
        lines.push('  Authoritative Rules Applied:');
        for (const rule of ce.authoritative_rules_applied) lines.push(`    • ${rule}`);
      }
      return lines;
    },
  },
  {
    id: 'evidence_graph',
    label: 'Evidence Graph',
    isVisible: (d) => d.evidencePackage !== null && d.evidencePackage.evidence_graph.nodes.length > 0,
    serialize: (d) => {
      const graph = d.evidencePackage!.evidence_graph;
      const lines = [...sectionHeader('Evidence Graph')];
      for (const node of graph.nodes) {
        lines.push(`  • [${node.status.toUpperCase()}] ${node.reference} → ${node.label}`);
      }
      if (graph.edges.length > 0) {
        lines.push('  Edges:');
        for (const edge of graph.edges) {
          lines.push(`    ${edge.from} → ${edge.to}: ${edge.label}`);
        }
      }
      return lines;
    },
  },
  {
    id: 'primary_integrity_domain',
    label: 'Primary Integrity Domain',
    isVisible: (d) => d.recommendation !== null,
    serialize: (d) => {
      const rec = d.recommendation!;
      const lines = [...sectionHeader('Primary Integrity Domain')];
      lines.push(`  Domain: ${DOMAIN_LABELS[rec.primary_integrity_domain]}`);
      lines.push(`  Domain Match: ${rec.domain_match ? 'Yes' : 'No'}`);
      lines.push(`  Primary Subject: ${d.alert.normalised_reference ?? '—'}`);
      if (d.authoritativeLineage) {
        lines.push(`  Relationship Subject: ${d.authoritativeLineage.expectedParent}`);
      }
      lines.push(`  Secondary Findings: ${rec.secondary_findings.length}`);
      lines.push(`  Rejected Cross-Domain: ${rec.rejected_cross_domain_recommendations.length}`);
      return lines;
    },
  },
  {
    id: 'secondary_findings',
    label: 'Secondary Findings',
    isVisible: (d) => d.recommendation !== null && d.recommendation.secondary_findings.length > 0,
    serialize: (d) => {
      const rec = d.recommendation!;
      const lines = [...sectionHeader(`Secondary Findings (${rec.secondary_findings.length})`)];
      for (const f of rec.secondary_findings) {
        lines.push(`  • ${f.description}`);
        lines.push(`    Domain: ${DOMAIN_LABELS[f.domain]}`);
        lines.push(`    Field: ${f.field}`);
        lines.push(`    Recommendation: ${f.recommendation_label} (rejected)`);
        lines.push(`    Rejection Reason: ${f.rejection_reason}`);
      }
      return lines;
    },
  },
  {
    id: 'rejected_cross_domain',
    label: 'Rejected Cross-Domain Recommendations',
    isVisible: (d) => d.recommendation !== null && d.recommendation.rejected_cross_domain_recommendations.length > 0,
    serialize: (d) => {
      const rec = d.recommendation!;
      const lines = [...sectionHeader(`Rejected Cross-Domain Recommendations (${rec.rejected_cross_domain_recommendations.length})`)];
      for (const f of rec.rejected_cross_domain_recommendations) {
        lines.push(`  • ${f.recommendation_label}`);
        lines.push(`    Rejection Reason: ${f.rejection_reason}`);
      }
      return lines;
    },
  },
  {
    id: 'recovery_justification',
    label: 'Recovery Justification',
    isVisible: (d) => d.recommendation !== null,
    serialize: (d) => {
      const rec = d.recommendation!;
      const lines = [...sectionHeader('Recovery Justification')];
      lines.push(`  Status: ${(rec.recovery_justification ?? '').replace(/_/g, ' ')}`);
      lines.push(`  Reason: ${rec.recovery_justification_reason}`);
      lines.push(`  Investigation Stage: ${(rec.investigation_stage ?? '').replace(/_/g, ' ')}`);
      return lines;
    },
  },
  {
    id: 'separated_confidence_model',
    label: 'Separated Confidence Model',
    isVisible: (d) => d.recommendation !== null,
    serialize: (d) => {
      const rec = d.recommendation!;
      const lines = [...sectionHeader('Separated Confidence Model (BUG-006R.3)')];
      lines.push(`  Reference Classification Confidence: ${pct((rec.reference_classification_confidence ?? 0))} (pattern-match)`);
      lines.push(`  Evidence Confidence: ${pct(rec.evidence_confidence)} (authoritative sources)`);
      lines.push(`  Decision Confidence: ${pct((rec.decision_confidence ?? 0))} (recommendation)`);
      lines.push(`  Repair Confidence: ${pct(rec.repair_confidence)} (auto-repair suitability)`);
      if ((rec.reference_classification_confidence ?? 0) > 0.8 && rec.evidence_confidence < 0.3) {
        lines.push('  WARNING: High pattern-match confidence does not confirm the object existed.');
      }
      return lines;
    },
  },
  {
    id: 'canonical_decision',
    label: 'Canonical Decision',
    isVisible: (d) => d.evidencePackage !== null,
    serialize: (d) => {
      const cd = d.evidencePackage!.canonical_decision;
      const lines = [...sectionHeader('Canonical Decision')];
      if (cd.canonical_value) {
        lines.push(`  Canonical Value: ${cd.canonical_value}`);
        lines.push(`  Type: ${cd.canonical_object_type ?? '—'}`);
      } else {
        lines.push('  No canonical value determined — Product Owner review required.');
      }
      lines.push(`  Reasoning: ${cd.reasoning}`);
      lines.push(`  Supporting Evidence: ${cd.supporting_evidence_count}`);
      lines.push(`  Conflicting Evidence: ${cd.conflicting_evidence_count}`);
      lines.push(`  Confidence: ${pct(cd.confidence)}`);
      lines.push(`  PO Review Required: ${cd.po_review_required ? 'Yes' : 'No'}`);
      return lines;
    },
  },
  {
    id: 'runtime_diagnostics',
    label: 'Runtime Diagnostics',
    isVisible: (d) => d.evidencePackage !== null,
    serialize: (d) => {
      const rd = d.evidencePackage!.runtime_diagnostics;
      const lines = [...sectionHeader('Runtime Diagnostics')];
      lines.push(`  Sources Searched: ${rd.sources_searched.length}`);
      lines.push(`  Sources Contributing Evidence: ${rd.sources_contributing_evidence.length}`);
      lines.push(`  Supporting Evidence: ${rd.supporting_evidence_count}`);
      lines.push(`  Conflicting Evidence: ${rd.conflicting_evidence_count}`);
      lines.push(`  Authoritative Evidence: ${rd.authoritative_evidence_count}`);
      lines.push(`  Unknown Evidence: ${rd.unknown_evidence_count}`);
      lines.push(`  PO Decisions Required: ${rd.po_decisions_required}`);
      lines.push(`  Auto Repairs Possible: ${rd.automatic_repairs_possible}`);
      if (d.recommendation) {
        const rec = d.recommendation;
        lines.push('  Recommendation Diagnostics:');
        lines.push(`    Recommendations Generated: 1`);
        lines.push(`    Auto Repair Recommended: ${rec.auto_repair_suitability === 'recommended' || rec.auto_repair_suitability === 'safe' ? 'Yes' : 'No'}`);
        lines.push(`    PO Review Required: ${rec.po_review_required ? 'Yes' : 'No'}`);
        lines.push(`    Unsafe Repairs: ${rec.auto_repair_suitability === 'unsafe' ? 1 : 0}`);
        lines.push(`    Alternative Actions: ${rec.alternative_actions.length}`);
        lines.push(`    Rec. Confidence: ${pct(rec.recommendation_confidence)}`);
        lines.push('  Domain Fidelity Diagnostics:');
        lines.push(`    Primary Domain: ${DOMAIN_LABELS[rec.primary_integrity_domain]}`);
        lines.push(`    Recommendation Domain: ${DOMAIN_LABELS[rec.primary_integrity_domain]}`);
        lines.push(`    Domain Match: ${rec.domain_match ? 'true' : 'false'}`);
        lines.push(`    Rejected Cross-Domain: ${rec.rejected_cross_domain_recommendations.length}`);
      }
      return lines;
    },
  },
  {
    id: 'authoritative_engineering_decision',
    label: 'Authoritative Engineering Decision',
    isVisible: (d) => d.decision !== null,
    serialize: (d) => {
      const dec = d.decision!;
      const lines = [...sectionHeader('Authoritative Engineering Decision')];
      lines.push(`  Decision: ${dec.decision_title}`);
      lines.push(`  Decision Type: ${DECISION_LABELS[dec.decision_type]}`);
      lines.push(`  Decision Version: v${dec.decision_version}`);
      lines.push(`  Resolution Status: ${dec.resolution_status}`);
      lines.push(`  Primary Integrity Domain: ${DOMAIN_LABELS[dec.primary_integrity_domain]}`);
      lines.push(`  Relationship Type: ${RELATIONSHIP_LABELS[dec.relationship_type]}`);
      lines.push(`  Executive Summary: ${dec.executive_summary}`);
      lines.push(`  Decision Reasoning: ${dec.decision_reasoning}`);
      lines.push(`  Confidence: ${pct(dec.confidence)}`);
      lines.push(`  Confidence Explanation: ${dec.confidence_explanation}`);
      lines.push(`  Recommended Next Action: ${dec.recommended_next_action}`);
      if (dec.alternatives_rejected.length > 0) {
        lines.push('  Alternatives Rejected:');
        for (const alt of dec.alternatives_rejected) {
          lines.push(`    • ${DECISION_LABELS[alt.decision_type] ?? alt.decision_type}: ${alt.reason}`);
        }
      }
      if (dec.po_decision) {
        lines.push(`  Product Owner Decision: ${dec.po_decision}`);
        lines.push(`  Decision By: ${dec.po_decision_actor ?? '—'}`);
        lines.push(`  Decision At: ${fmtTimestamp(dec.po_decision_at)}`);
      }
      return lines;
    },
  },
  {
    id: 'engineering_assessment',
    label: 'Engineering Assessment',
    isVisible: (d) => d.recommendation !== null,
    serialize: (d) => {
      const rec = d.recommendation!;
      const lines = [...sectionHeader('Engineering Assessment')];
      lines.push('  Summary:');
      lines.push(`    ${rec.summary}`);
      lines.push('  Recommended Action:');
      lines.push(`    ${rec.recommended_action}`);
      lines.push(`    Type: ${rec.recommendation_type.replace(/_/g, ' ')}`);
      lines.push('  Engineering Reasoning:');
      lines.push(`    ${rec.engineering_reasoning}`);
      lines.push('  Confidence Summary:');
      lines.push(`    Evidence Confidence: ${pct(rec.evidence_confidence)}`);
      lines.push(`    Recommendation Confidence: ${pct(rec.recommendation_confidence)}`);
      lines.push(`    Repair Confidence: ${pct(rec.repair_confidence)}`);
      // BUG-006R.3: Separated confidence model
      lines.push(`    Reference Classification Confidence: ${pct((rec.reference_classification_confidence ?? 0))}`);
      lines.push(`    Decision Confidence: ${pct((rec.decision_confidence ?? 0))}`);
      lines.push(`    Recovery Justification: ${(rec.recovery_justification ?? '').replace(/_/g, ' ')}`);
      lines.push(`    Recovery Justification Reason: ${rec.recovery_justification_reason}`);
      lines.push(`    Investigation Stage: ${(rec.investigation_stage ?? '').replace(/_/g, ' ')}`);
      lines.push('  Risk:');
      lines.push(`    Level: ${rec.risk_level}`);
      lines.push(`    Reason: ${rec.risk_reason}`);
      lines.push('  Autonomous Repair Suitability:');
      lines.push(`    Suitability: ${rec.auto_repair_suitability}`);
      lines.push(`    Reason: ${rec.auto_repair_reason}`);
      lines.push('  Product Owner Review:');
      lines.push(`    Required: ${rec.po_review_required ? 'Yes — Product Owner must approve before action is taken.' : 'Not required — recommendation can proceed automatically.'}`);
      if (rec.po_review_required && rec.po_decision_options.length > 0) {
        lines.push(`    Decision Options: ${rec.po_decision_options.map(o => o.replace(/_/g, ' ')).join(', ')}`);
      }
      lines.push('  Expected Impact:');
      lines.push(`    ${rec.expected_impact}`);
      if (rec.alternative_actions.length > 0) {
        lines.push('  Alternative Actions:');
        for (const alt of rec.alternative_actions) {
          lines.push(`    • ${alt.action}`);
          lines.push(`      Trade-offs: ${alt.tradeoffs}`);
          lines.push(`      Risk: ${alt.risk_comparison}`);
          lines.push(`      Governance: ${alt.governance_implications}`);
          lines.push(`      Confidence: ${pct(alt.confidence)}`);
        }
      }
      if (rec.known_limitations.length > 0) {
        lines.push('  Known Limitations:');
        for (const lim of rec.known_limitations) lines.push(`    • ${lim}`);
      }
      return lines;
    },
  },
  {
    id: 'timeline',
    label: 'Timeline',
    isVisible: (d) => d.timeline.length > 0,
    serialize: (d) => {
      const lines = [...sectionHeader('Timeline')];
      for (const t of d.timeline) {
        lines.push(`  [${fmtTimestamp(t.timestamp)}] ${t.event}`);
      }
      return lines;
    },
  },
  {
    id: 'decision_timeline',
    label: 'Engineering Decision Timeline',
    isVisible: (d) => d.decisionTimeline.length > 0,
    serialize: (d) => {
      const lines = [...sectionHeader('Engineering Decision Timeline')];
      for (const event of d.decisionTimeline) {
        lines.push(`  [${fmtTimestamp(event.created_at)}] ${event.event_type.toUpperCase()}`);
        lines.push(`    ${event.event_summary}`);
        if (event.previous_decision_type && event.new_decision_type) {
          lines.push(`    Previous: ${event.previous_decision_type} → New: ${event.new_decision_type}`);
        }
        if (event.previous_confidence !== null && event.new_confidence !== null) {
          lines.push(`    Confidence: ${pct(event.previous_confidence)} → ${pct(event.new_confidence)}`);
        }
        lines.push(`    Actor: ${event.actor} (${event.actor_type})`);
      }
      return lines;
    },
  },
  {
    id: 'authoritative_lineage',
    label: 'Authoritative Lineage',
    isVisible: (d) => d.authoritativeLineage !== undefined,
    serialize: (d) => {
      const al = d.authoritativeLineage!;
      const lines = [...sectionHeader('Authoritative Lineage')];
      lines.push('  Child:');
      lines.push(`    Child Reference: ${al.childRef}`);
      lines.push(`    Recorded Parent: ${al.actualParent ?? 'null'}`);
      lines.push('  Expected Parent:');
      lines.push(`    Expected Parent Ref: ${al.expectedParent}`);
      lines.push('  Authoritative Existence:');
      lines.push(`    Classification: ${al.classification}`);
      lines.push(`    Authoritative Status: ${al.authoritativeStatus}`);
      lines.push(`    Source Type: ${al.sourceObjectType}`);
      lines.push(`    Historical Status: ${al.lifecycleOrHistoricalStatus ?? 'N/A'}`);
      lines.push(`    Lineage Satisfied: ${al.lineageSatisfied ? 'Yes' : 'No'}`);
      lines.push(`    Execution Permitted: ${al.executionPermitted ? 'Yes' : 'No'}`);
      if (al.governingEvidence) {
        lines.push('  Historical Explanation:');
        lines.push(`    ${al.governingEvidence}`);
      }
      if (al.auditConclusion) {
        lines.push('  Audit Conclusion:');
        lines.push(`    ${al.auditConclusion}`);
      }
      lines.push('  Relationship Assessment:');
      lines.push(`    ${al.resolutionReason}`);
      return lines;
    },
  },
  {
    id: 'related_engineering',
    label: 'Related Engineering',
    isVisible: (d) => d.relatedEngineering.length > 0,
    serialize: (d) => {
      const lines = [...sectionHeader(`Related Engineering (${d.relatedEngineering.length})`)];
      for (const re of d.relatedEngineering) {
        lines.push(`  • [${re.type}] ${re.ref}: ${re.title}`);
      }
      return lines;
    },
  },
  {
    id: 'resolution_lifecycle',
    label: 'Resolution Lifecycle',
    isVisible: (d) => d.resolutionStatus !== 'detected',
    serialize: (d) => {
      const lines = [...sectionHeader('Resolution Lifecycle')];
      lines.push(`  Current Status: ${RESOLUTION_STATUS_LABELS[d.resolutionStatus] ?? d.resolutionStatus}`);
      const currentIdx = RESOLUTION_LIFECYCLE.indexOf(d.resolutionStatus);
      lines.push(`  Lifecycle: ${RESOLUTION_LIFECYCLE.map((s, i) => i === currentIdx ? `[${RESOLUTION_STATUS_LABELS[s]}]` : RESOLUTION_STATUS_LABELS[s]).join(' → ')}`);
      if (d.resolutionTimestamp) lines.push(`  Resolution Timestamp: ${fmtTimestamp(d.resolutionTimestamp)}`);
      if (d.resolutionActor) lines.push(`  Resolution Actor: ${d.resolutionActor}`);
      return lines;
    },
  },
  {
    id: 'recommended_actions',
    label: 'Recommended Actions',
    isVisible: (d) => d.governedActions.length > 0 || (d.governedActions.length === 0 && d.recommendedActions.length > 0),
    serialize: (d) => {
      const lines = [...sectionHeader('Recommended Actions')];
      if (d.governedActions.length > 0) {
        for (const action of d.governedActions) {
          const status = action.available ? 'Available' : 'Unavailable';
          lines.push(`  • [${status}] ${action.label}`);
          if (action.requires_po_approval) lines.push(`    PO Approval Required: Yes`);
          if (!action.available && action.unavailable_reason) lines.push(`    Reason: ${action.unavailable_reason}`);
        }
      } else {
        for (const action of d.recommendedActions) {
          const status = action.available ? 'Available' : 'Unavailable';
          lines.push(`  • [${status}] ${action.label}`);
          if (!action.available && action.unavailableReason) lines.push(`    Reason: ${action.unavailableReason}`);
        }
      }
      return lines;
    },
  },
  {
    id: 'reference_codes',
    label: 'Reference Codes',
    isVisible: () => true,
    serialize: (d) => {
      const lines = [...sectionHeader('Reference Codes')];
      if (d.governedResponseRef) lines.push(`  Governed Response: ${d.governedResponseRef}`);
      if (d.governedResponseState) lines.push(`  Governed Response Code: ${d.governedResponseState.referenceCode}`);
      if (d.decision) lines.push(`  Decision ID: ${d.decision.id}`);
      if (d.alert.alert_ref) lines.push(`  Alert Ref: ${d.alert.alert_ref}`);
      return lines;
    },
  },
  {
    id: 'product_owner_guidance',
    label: 'Product Owner Guidance',
    isVisible: () => true,
    serialize: (d) => {
      const lines = [...sectionHeader('Product Owner Guidance')];
      if (d.decision) {
        if (d.decision.resolution_status === 'resolved') {
          lines.push('  This investigation has been resolved.');
          if (d.decision.po_decision) {
            lines.push(`  Product Owner Decision: ${d.decision.po_decision}`);
            lines.push(`  Decision By: ${d.decision.po_decision_actor ?? '—'}`);
            lines.push(`  Decision At: ${fmtTimestamp(d.decision.po_decision_at)}`);
          }
        } else if (d.decision.decision_type === 'product_owner_decision_required') {
          lines.push('  Product Owner decision is required to resolve this investigation.');
          lines.push(`  Recommended Action: ${d.decision.recommended_next_action}`);
        } else if (d.decision.decision_type === 'await_further_evidence') {
          lines.push('  Further evidence is required before a definitive decision can be made.');
        } else {
          lines.push(`  Current Decision: ${d.decision.decision_title}`);
          lines.push(`  Recommended Next Action: ${d.decision.recommended_next_action}`);
        }
      } else if (d.recommendation) {
        if (d.recommendation.po_review_required) {
          lines.push('  Product Owner review is required.');
          lines.push(`  Recommended Action: ${d.recommendation.recommended_action}`);
        } else {
          lines.push(`  Recommended Action: ${d.recommendation.recommended_action}`);
          lines.push('  No Product Owner review required.');
        }
      } else {
        lines.push('  Investigation is in progress. No decision has been generated yet.');
      }
      if (d.isReadOnly) {
        lines.push('  This investigation is read-only (resolved or archived).');
      }
      return lines;
    },
  },
];

// ─── Public API ──────────────────────────────────────────────────────────────

export function getVisibleSections(data: InvestigationSchemaData): InvestigationSection[] {
  return sections.filter(s => s.isVisible(data));
}

export function serializeInvestigation(data: InvestigationSchemaData): string {
  const lines: string[] = [];
  const topSep = '═══════════════════════════════════════════════════════════════';

  lines.push(topSep);
  lines.push('  ENGINEERING INVESTIGATION REPORT');
  lines.push(topSep);
  lines.push('');

  const visible = getVisibleSections(data);
  for (const section of visible) {
    const sectionLines = section.serialize(data);
    lines.push(...sectionLines);
    lines.push('');
  }

  lines.push(topSep);
  lines.push('  END OF ENGINEERING INVESTIGATION REPORT');
  lines.push(topSep);

  return lines.join('\n');
}

export function getSectionIds(): string[] {
  return sections.map(s => s.id);
}

export function getSectionLabels(): string[] {
  return sections.map(s => s.label);
}

// ─── AI Context Package ──────────────────────────────────────────────────────
//
// Purpose-built for AI consumption (ChatGPT, future AI systems).
// Contains complete engineering facts without visual formatting,
// decorative layout, or UI presentation elements. Optimised for
// reasoning rather than display.

export function serializeAIContext(data: InvestigationSchemaData): string {
  const lines: string[] = [];

  lines.push('ENGINEERING INVESTIGATION — AI CONTEXT PACKAGE');
  lines.push('='.repeat(60));
  lines.push('');

  // Core identity
  lines.push('IDENTITY');
  lines.push('-'.repeat(60));
  lines.push(`Investigation Title: ${data.evolvedTitle ?? data.alert.title ?? 'Untitled Investigation'}`);
  if (data.evolvedTitle && data.evolvedTitle !== data.alert.title) {
    lines.push(`Original Title: ${data.alert.title}`);
  }
  lines.push(`Alert Reference: ${data.alert.alert_ref ?? data.alert.normalised_reference ?? '—'}`);
  lines.push(`Alert ID: ${data.alert.id}`);
  lines.push(`Alert Type: ${data.alert.alert_type ?? '—'}`);
  lines.push(`Severity: ${data.alert.severity ?? '—'}`);
  lines.push(`Object Type: ${data.alert.object_type?.toUpperCase() ?? '—'}`);
  lines.push(`Detected At: ${fmtTimestamp(data.alert.created_at)}`);
  lines.push('');

  // Executive summary and root cause
  lines.push('EXECUTIVE SUMMARY');
  lines.push('-'.repeat(60));
  lines.push(data.executiveSummary || 'No executive summary available.');
  lines.push('');
  lines.push('ROOT CAUSE');
  lines.push('-'.repeat(60));
  lines.push(data.rootCause || 'Root cause analysis not yet available.');
  lines.push('');

  // Affected components
  if (data.affectedComponents.length > 0) {
    lines.push('AFFECTED COMPONENTS');
    lines.push('-'.repeat(60));
    for (const c of data.affectedComponents) lines.push(`- ${c}`);
    lines.push('');
  }

  // Confidence
  const confLabel = data.confidence >= 0.9 ? 'High' : data.confidence >= 0.7 ? 'Medium' : data.confidence >= 0.5 ? 'Low' : 'Very Low';
  lines.push('CONFIDENCE');
  lines.push('-'.repeat(60));
  lines.push(`Score: ${pct(data.confidence)} (${confLabel})`);
  lines.push(`Explanation: ${data.confidenceExplanation || 'Confidence assessment not available.'}`);
  lines.push('');

  // Evidence
  if (data.evidence.length > 0) {
    lines.push(`EVIDENCE (${data.evidence.length})`);
    lines.push('-'.repeat(60));
    for (const ev of data.evidence) {
      lines.push(`- Type: ${ev.type.toUpperCase()}`);
      lines.push(`  Label: ${ev.label}`);
      lines.push(`  Reference: ${ev.reference}`);
      if (ev.description) lines.push(`  Description: ${ev.description}`);
    }
    lines.push('');
  }

  // Evidence package
  if (data.evidencePackage && data.evidencePackage.evidence_items.length > 0) {
    lines.push(`EVIDENCE PACKAGE (${data.evidencePackage.evidence_items.length})`);
    lines.push('-'.repeat(60));
    for (const item of data.evidencePackage.evidence_items) {
      lines.push(`- Source: ${item.source_type} (${item.source_table})`);
      lines.push(`  Field: ${item.field_name}`);
      if (item.field_value) lines.push(`  Value: ${item.field_value}`);
      lines.push(`  Object ID: ${item.object_id ?? 'N/A'}`);
      lines.push(`  Confidence: ${pct(item.confidence)}`);
      lines.push(`  Priority: ${item.evidence_priority}`);
      if (item.supports_conclusion) lines.push(`  Supports: Yes`);
      if (item.contradicts_conclusion) lines.push(`  Conflicts: Yes`);
      if (item.why_selected) lines.push(`  Why Selected: ${item.why_selected}`);
    }
    lines.push('');
  }

  // Conflicting values
  if (data.evidencePackage && data.evidencePackage.conflicts.length > 0) {
    lines.push(`CONFLICTING VALUES (${data.evidencePackage.conflicts.length})`);
    lines.push('-'.repeat(60));
    for (const conflict of data.evidencePackage.conflicts) {
      lines.push(`- Conflict: ${conflict.conflict_summary}`);
      for (const val of conflict.values) {
        lines.push(`  ${val.source_type}: ${val.field_value} (${val.source_table}.${val.field_name})`);
        if (conflict.canonical_candidate === val.field_value) lines.push(`  ^ Canonical Candidate`);
      }
      if (conflict.canonical_candidate) {
        lines.push(`  Canonical Candidate: ${conflict.canonical_candidate}`);
        if (conflict.canonical_reason) lines.push(`  Canonical Reason: ${conflict.canonical_reason}`);
      } else {
        lines.push(`  Product Owner review required — canonical value cannot be safely determined.`);
      }
    }
    lines.push('');
  }

  // Classification explanation
  if (data.evidencePackage) {
    const ce = data.evidencePackage.classification_explanation;
    lines.push('CLASSIFICATION EXPLANATION');
    lines.push('-'.repeat(60));
    lines.push(`Classification: ${ce.classification}`);
    lines.push(`Why Chosen: ${ce.chosen_reason}`);
    if (ce.rejected_alternatives.length > 0) {
      lines.push('Rejected Alternatives:');
      for (const alt of ce.rejected_alternatives) lines.push(`- ${alt}`);
    }
    if (ce.authoritative_rules_applied.length > 0) {
      lines.push('Authoritative Rules Applied:');
      for (const rule of ce.authoritative_rules_applied) lines.push(`- ${rule}`);
    }
    lines.push('');
  }

  // Evidence graph
  if (data.evidencePackage && data.evidencePackage.evidence_graph.nodes.length > 0) {
    const graph = data.evidencePackage.evidence_graph;
    lines.push('EVIDENCE GRAPH');
    lines.push('-'.repeat(60));
    for (const node of graph.nodes) {
      lines.push(`- [${node.status.toUpperCase()}] ${node.reference} -> ${node.label}`);
    }
    if (graph.edges.length > 0) {
      lines.push('Edges:');
      for (const edge of graph.edges) {
        lines.push(`- ${edge.from} -> ${edge.to}: ${edge.label}`);
      }
    }
    lines.push('');
  }

  // Canonical decision
  if (data.evidencePackage) {
    const cd = data.evidencePackage.canonical_decision;
    lines.push('CANONICAL DECISION');
    lines.push('-'.repeat(60));
    if (cd.canonical_value) {
      lines.push(`Canonical Value: ${cd.canonical_value}`);
      lines.push(`Type: ${cd.canonical_object_type ?? '—'}`);
    } else {
      lines.push('No canonical value determined — Product Owner review required.');
    }
    lines.push(`Reasoning: ${cd.reasoning}`);
    lines.push(`Supporting Evidence: ${cd.supporting_evidence_count}`);
    lines.push(`Conflicting Evidence: ${cd.conflicting_evidence_count}`);
    lines.push(`Confidence: ${pct(cd.confidence)}`);
    lines.push(`PO Review Required: ${cd.po_review_required ? 'Yes' : 'No'}`);
    lines.push('');
  }

  // Runtime diagnostics
  if (data.evidencePackage) {
    const rd = data.evidencePackage.runtime_diagnostics;
    lines.push('RUNTIME DIAGNOSTICS');
    lines.push('-'.repeat(60));
    lines.push(`Sources Searched: ${rd.sources_searched.length}`);
    lines.push(`Sources Contributing Evidence: ${rd.sources_contributing_evidence.length}`);
    lines.push(`Supporting Evidence: ${rd.supporting_evidence_count}`);
    lines.push(`Conflicting Evidence: ${rd.conflicting_evidence_count}`);
    lines.push(`Authoritative Evidence: ${rd.authoritative_evidence_count}`);
    lines.push(`Unknown Evidence: ${rd.unknown_evidence_count}`);
    lines.push(`PO Decisions Required: ${rd.po_decisions_required}`);
    lines.push(`Auto Repairs Possible: ${rd.automatic_repairs_possible}`);
    lines.push('');
  }

  // Engineering assessment
  if (data.recommendation) {
    const rec = data.recommendation;
    lines.push('ENGINEERING ASSESSMENT');
    lines.push('-'.repeat(60));
    lines.push(`Summary: ${rec.summary}`);
    lines.push(`Recommended Action: ${rec.recommended_action}`);
    lines.push(`Action Type: ${rec.recommendation_type.replace(/_/g, ' ')}`);
    lines.push(`Engineering Reasoning: ${rec.engineering_reasoning}`);
    lines.push(`Evidence Confidence: ${pct(rec.evidence_confidence)}`);
    lines.push(`Recommendation Confidence: ${pct(rec.recommendation_confidence)}`);
    lines.push(`Repair Confidence: ${pct(rec.repair_confidence)}`);
    // BUG-006R.3: Separated confidence model
    lines.push(`Reference Classification Confidence: ${pct((rec.reference_classification_confidence ?? 0))}`);
    lines.push(`Decision Confidence: ${pct((rec.decision_confidence ?? 0))}`);
    lines.push(`Recovery Justification: ${(rec.recovery_justification ?? '').replace(/_/g, ' ')}`);
    lines.push(`Recovery Justification Reason: ${rec.recovery_justification_reason}`);
    lines.push(`Investigation Stage: ${(rec.investigation_stage ?? '').replace(/_/g, ' ')}`);
    lines.push(`Risk Level: ${rec.risk_level}`);
    lines.push(`Risk Reason: ${rec.risk_reason}`);
    lines.push(`Auto Repair Suitability: ${rec.auto_repair_suitability}`);
    lines.push(`Auto Repair Reason: ${rec.auto_repair_reason}`);
    lines.push(`PO Review Required: ${rec.po_review_required ? 'Yes' : 'No'}`);
    if (rec.po_review_required && rec.po_decision_options.length > 0) {
      lines.push(`PO Decision Options: ${rec.po_decision_options.map(o => o.replace(/_/g, ' ')).join(', ')}`);
    }
    lines.push(`Expected Impact: ${rec.expected_impact}`);
    if (rec.alternative_actions.length > 0) {
      lines.push('Alternative Actions:');
      for (const alt of rec.alternative_actions) {
        lines.push(`- ${alt.action}`);
        lines.push(`  Trade-offs: ${alt.tradeoffs}`);
        lines.push(`  Risk: ${alt.risk_comparison}`);
        lines.push(`  Governance: ${alt.governance_implications}`);
        lines.push(`  Confidence: ${pct(alt.confidence)}`);
      }
    }
    if (rec.known_limitations.length > 0) {
      lines.push('Known Limitations:');
      for (const lim of rec.known_limitations) lines.push(`- ${lim}`);
    }
    lines.push('');
  }

  // Authoritative engineering decision
  if (data.decision) {
    const dec = data.decision;
    lines.push('AUTHORITATIVE ENGINEERING DECISION');
    lines.push('-'.repeat(60));
    lines.push(`Decision: ${dec.decision_title}`);
    lines.push(`Decision Type: ${DECISION_LABELS[dec.decision_type]}`);
    lines.push(`Decision Version: v${dec.decision_version}`);
    lines.push(`Resolution Status: ${dec.resolution_status}`);
    lines.push(`Primary Integrity Domain: ${DOMAIN_LABELS[dec.primary_integrity_domain]}`);
    lines.push(`Relationship Type: ${RELATIONSHIP_LABELS[dec.relationship_type]}`);
    lines.push(`Executive Summary: ${dec.executive_summary}`);
    lines.push(`Decision Reasoning: ${dec.decision_reasoning}`);
    lines.push(`Confidence: ${pct(dec.confidence)}`);
    lines.push(`Confidence Explanation: ${dec.confidence_explanation}`);
    lines.push(`Recommended Next Action: ${dec.recommended_next_action}`);
    if (dec.alternatives_rejected.length > 0) {
      lines.push('Alternatives Rejected:');
      for (const alt of dec.alternatives_rejected) {
        lines.push(`- ${DECISION_LABELS[alt.decision_type] ?? alt.decision_type}: ${alt.reason}`);
      }
    }
    if (dec.po_decision) {
      lines.push(`PO Decision: ${dec.po_decision}`);
      lines.push(`Decision By: ${dec.po_decision_actor ?? '—'}`);
      lines.push(`Decision At: ${fmtTimestamp(dec.po_decision_at)}`);
    }
    lines.push('');
  }

  // Decision timeline
  if (data.decisionTimeline.length > 0) {
    lines.push('ENGINEERING DECISION TIMELINE');
    lines.push('-'.repeat(60));
    for (const event of data.decisionTimeline) {
      lines.push(`- [${fmtTimestamp(event.created_at)}] ${event.event_type.toUpperCase()}`);
      lines.push(`  ${event.event_summary}`);
      if (event.previous_decision_type && event.new_decision_type) {
        lines.push(`  Previous: ${event.previous_decision_type} -> New: ${event.new_decision_type}`);
      }
      if (event.previous_confidence !== null && event.new_confidence !== null) {
        lines.push(`  Confidence: ${pct(event.previous_confidence)} -> ${pct(event.new_confidence)}`);
      }
      lines.push(`  Actor: ${event.actor} (${event.actor_type})`);
    }
    lines.push('');
  }

  // Authoritative lineage
  if (data.authoritativeLineage) {
    const al = data.authoritativeLineage;
    lines.push('AUTHORITATIVE LINEAGE');
    lines.push('-'.repeat(60));
    lines.push(`Child Reference: ${al.childRef}`);
    lines.push(`Recorded Parent: ${al.actualParent ?? 'null'}`);
    lines.push(`Expected Parent: ${al.expectedParent}`);
    lines.push(`Classification: ${al.classification}`);
    lines.push(`Authoritative Status: ${al.authoritativeStatus}`);
    lines.push(`Source Type: ${al.sourceObjectType}`);
    lines.push(`Historical Status: ${al.lifecycleOrHistoricalStatus ?? 'N/A'}`);
    lines.push(`Lineage Satisfied: ${al.lineageSatisfied ? 'Yes' : 'No'}`);
    lines.push(`Execution Permitted: ${al.executionPermitted ? 'Yes' : 'No'}`);
    if (al.governingEvidence) lines.push(`Historical Explanation: ${al.governingEvidence}`);
    if (al.auditConclusion) lines.push(`Audit Conclusion: ${al.auditConclusion}`);
    lines.push(`Relationship Assessment: ${al.resolutionReason}`);
    lines.push('');
  }

  // Timeline
  if (data.timeline.length > 0) {
    lines.push('TIMELINE');
    lines.push('-'.repeat(60));
    for (const t of data.timeline) {
      lines.push(`- [${fmtTimestamp(t.timestamp)}] ${t.event}`);
    }
    lines.push('');
  }

  // Related engineering
  if (data.relatedEngineering.length > 0) {
    lines.push(`RELATED ENGINEERING (${data.relatedEngineering.length})`);
    lines.push('-'.repeat(60));
    for (const re of data.relatedEngineering) {
      lines.push(`- [${re.type}] ${re.ref}: ${re.title}`);
    }
    lines.push('');
  }

  // Resolution lifecycle
  if (data.resolutionStatus !== 'detected') {
    lines.push('RESOLUTION LIFECYCLE');
    lines.push('-'.repeat(60));
    lines.push(`Current Status: ${RESOLUTION_STATUS_LABELS[data.resolutionStatus] ?? data.resolutionStatus}`);
    if (data.resolutionTimestamp) lines.push(`Resolution Timestamp: ${fmtTimestamp(data.resolutionTimestamp)}`);
    if (data.resolutionActor) lines.push(`Resolution Actor: ${data.resolutionActor}`);
    lines.push('');
  }

  // Recommended actions
  if (data.governedActions.length > 0) {
    lines.push('RECOMMENDED ACTIONS');
    lines.push('-'.repeat(60));
    for (const action of data.governedActions) {
      lines.push(`- [${action.available ? 'Available' : 'Unavailable'}] ${action.label}`);
      if (action.requires_po_approval) lines.push(`  PO Approval Required: Yes`);
      if (!action.available && action.unavailable_reason) lines.push(`  Reason: ${action.unavailable_reason}`);
    }
    lines.push('');
  }

  // Reference codes
  lines.push('REFERENCE CODES');
  lines.push('-'.repeat(60));
  if (data.governedResponseRef) lines.push(`Governed Response: ${data.governedResponseRef}`);
  if (data.governedResponseState) lines.push(`Governed Response Code: ${data.governedResponseState.referenceCode}`);
  if (data.decision) lines.push(`Decision ID: ${data.decision.id}`);
  if (data.alert.alert_ref) lines.push(`Alert Ref: ${data.alert.alert_ref}`);
  lines.push('');

  // Product owner guidance
  lines.push('PRODUCT OWNER GUIDANCE');
  lines.push('-'.repeat(60));
  if (data.decision) {
    if (data.decision.resolution_status === 'resolved') {
      lines.push('This investigation has been resolved.');
      if (data.decision.po_decision) {
        lines.push(`PO Decision: ${data.decision.po_decision}`);
        lines.push(`Decision By: ${data.decision.po_decision_actor ?? '—'}`);
        lines.push(`Decision At: ${fmtTimestamp(data.decision.po_decision_at)}`);
      }
    } else if (data.decision.decision_type === 'product_owner_decision_required') {
      lines.push('Product Owner decision is required to resolve this investigation.');
      lines.push(`Recommended Action: ${data.decision.recommended_next_action}`);
    } else if (data.decision.decision_type === 'await_further_evidence') {
      lines.push('Further evidence is required before a definitive decision can be made.');
    } else {
      lines.push(`Current Decision: ${data.decision.decision_title}`);
      lines.push(`Recommended Next Action: ${data.decision.recommended_next_action}`);
    }
  } else if (data.recommendation) {
    if (data.recommendation.po_review_required) {
      lines.push('Product Owner review is required.');
      lines.push(`Recommended Action: ${data.recommendation.recommended_action}`);
    } else {
      lines.push(`Recommended Action: ${data.recommendation.recommended_action}`);
      lines.push('No Product Owner review required.');
    }
  } else {
    lines.push('Investigation is in progress. No decision has been generated yet.');
  }
  if (data.isReadOnly) {
    lines.push('This investigation is read-only (resolved or archived).');
  }
  lines.push('');

  lines.push('='.repeat(60));
  lines.push('END OF AI CONTEXT PACKAGE');
  lines.push('='.repeat(60));

  return lines.join('\n');
}
