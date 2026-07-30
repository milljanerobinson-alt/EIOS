// EWO-021R.4 — Authoritative Investigation Export
//
// The canonical export is driven by the Investigation Schema (see
// investigationSchema.ts). This module provides:
//   1. A canonical export model builder that both PDF and AI Context consume
//   2. An export readiness gate that blocks incomplete exports
//   3. Backward-compatible legacy adapters
//
// The schema is the single source of truth. Both output paths (PDF and AI
// Context) must consume the same resolved InvestigationSchemaData produced
// by buildCanonicalExportModel(). No separately reconstructed state.

import { serializeInvestigation, serializeAIContext, type InvestigationSchemaData } from './investigationSchema';
import { buildGovernedResponse, type GovernedResponse } from './governedResponse';
import type { IntegrityAlert } from './engineeringIntegrityService';
import type { EvidencePackage } from './evidencePackageService';
import type { EngineeringRecommendation } from './engineeringRecommendationEngine';
import type { EngineeringDecision, DecisionTimelineEvent, AlertRelationship } from './engineeringDecisionService';
import type { AuthoritativeLineageDetail, InvestigationEvidence, InvestigationAction } from './integrityInvestigation';
import type { ResolutionStatus, GovernedAction } from './engineeringIntelligenceWorkflow';

// ─── Export Readiness ─────────────────────────────────────────────────────────

export interface ExportReadinessResult {
  ready: boolean;
  missing: string[];
  governedResponse: GovernedResponse | null;
}

export function checkExportReadiness(data: InvestigationSchemaData): ExportReadinessResult {
  const missing: string[] = [];

  if (!data.alert?.id) missing.push('investigation_identity');
  if (!data.evidencePackage) missing.push('evidence_package');
  if (!data.recommendation) missing.push('engineering_recommendation');
  if (!data.decision) missing.push('authoritative_decision');
  if (data.decisionTimeline.length === 0) missing.push('decision_timeline');

  if (missing.length > 0) {
    return {
      ready: false,
      missing,
      governedResponse: buildGovernedResponse('EIOS-EXPORT-001'),
    };
  }

  return { ready: true, missing: [], governedResponse: null };
}

// ─── Canonical Export Model ───────────────────────────────────────────────────
//
// Both PDF and AI Context must consume the same resolved model. This builder
// is the single construction site for export-ready InvestigationSchemaData.

export interface CanonicalExportInput {
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
}

export function buildCanonicalExportModel(input: CanonicalExportInput): InvestigationSchemaData {
  return {
    alert: input.alert,
    evolvedTitle: input.evolvedTitle,
    executiveSummary: input.executiveSummary,
    rootCause: input.rootCause,
    affectedComponents: input.affectedComponents,
    evidence: input.evidence,
    timeline: input.timeline,
    recommendedActions: input.recommendedActions,
    relatedEngineering: input.relatedEngineering,
    confidence: input.confidence,
    confidenceExplanation: input.confidenceExplanation,
    evidencePackage: input.evidencePackage,
    recommendation: input.recommendation,
    decision: input.decision,
    decisionTimeline: input.decisionTimeline,
    authoritativeLineage: input.authoritativeLineage,
    governedActions: input.governedActions,
    resolutionStatus: input.resolutionStatus,
    resolutionTimestamp: input.resolutionTimestamp,
    resolutionActor: input.resolutionActor,
    resolutionMessage: input.resolutionMessage,
    governedResponseState: input.governedResponseState,
    isReadOnly: input.isReadOnly,
    governedResponseRef: input.governedResponseState?.referenceCode ?? null,
  };
}

// ─── Legacy Export Data Shape (backward compatibility) ─────────────────────────

export interface InvestigationExportData {
  alert: IntegrityAlert;
  evolvedTitle: string | null;
  executiveSummary: string;
  rootCause: string;
  confidence: number;
  confidenceExplanation: string;
  evidence: InvestigationEvidence[];
  evidencePackage: EvidencePackage | null;
  recommendation: EngineeringRecommendation | null;
  decision: EngineeringDecision | null;
  timeline: DecisionTimelineEvent[];
  relationships: AlertRelationship[];
  relatedEngineering: { ref: string; title: string; type: string }[];
  governedResponseRef: string | null;
  resolutionStatus: string;
  resolutionTimestamp: string | null;
  resolutionActor: string | null;
  affectedComponents?: string[];
  timelineEvents?: { timestamp: string; event: string }[];
  recommendedActions?: InvestigationAction[];
  authoritativeLineage?: AuthoritativeLineageDetail;
  governedActions?: GovernedAction[];
  governedResponseState?: GovernedResponse | null;
  isReadOnly?: boolean;
}

function legacyToSchemaData(data: InvestigationExportData): InvestigationSchemaData {
  return {
    alert: data.alert,
    evolvedTitle: data.evolvedTitle,
    executiveSummary: data.executiveSummary,
    rootCause: data.rootCause,
    affectedComponents: data.affectedComponents ?? [],
    evidence: data.evidence,
    timeline: data.timelineEvents ?? [],
    recommendedActions: data.recommendedActions ?? [],
    relatedEngineering: data.relatedEngineering,
    confidence: data.confidence,
    confidenceExplanation: data.confidenceExplanation,
    evidencePackage: data.evidencePackage,
    recommendation: data.recommendation,
    decision: data.decision,
    decisionTimeline: data.timeline,
    authoritativeLineage: data.authoritativeLineage,
    governedActions: data.governedActions ?? [],
    resolutionStatus: data.resolutionStatus as ResolutionStatus,
    resolutionTimestamp: data.resolutionTimestamp,
    resolutionActor: data.resolutionActor,
    resolutionMessage: null,
    governedResponseState: data.governedResponseState ?? null,
    isReadOnly: data.isReadOnly ?? false,
    governedResponseRef: data.governedResponseRef,
  };
}

export function generateInvestigationExport(data: InvestigationExportData): string {
  const schemaData = legacyToSchemaData(data);
  return serializeInvestigation(schemaData);
}

export function generateAIContextExport(data: InvestigationExportData): string {
  const schemaData = legacyToSchemaData(data);
  return serializeAIContext(schemaData);
}
