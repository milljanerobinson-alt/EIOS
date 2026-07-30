// EWO-024R.1 — ATD Connect: Health & Availability Service
// Every inspection endpoint returns health metrics.
// Missing information is reported rather than inferred.
// Health dimensions are separated where evidence supports them.

import type { HealthInfo } from './types';

export function computeHealth(params: {
  available: boolean;
  recordCount: number;
  expectedCount?: number;
  relationshipCount?: number;
  hasErrors?: boolean;
  hasWarnings?: boolean;
}): HealthInfo {
  const { available, recordCount, expectedCount, relationshipCount, hasErrors, hasWarnings } = params;

  const availability: HealthInfo['availability'] = available ? 'available' : 'unavailable';

  let health: HealthInfo['health'] = 'healthy';
  if (hasErrors) health = 'critical';
  else if (hasWarnings) health = 'warning';

  const inspectionConfidence = available ? Math.min(1, recordCount > 0 ? 0.9 : 0.5) : 0;

  const evidenceQuality = expectedCount !== undefined && expectedCount > 0
    ? Math.min(1, recordCount / expectedCount)
    : available ? (recordCount > 0 ? 0.8 : 0.3) : 0;

  const relationshipCompleteness = relationshipCount !== undefined
    ? Math.min(1, relationshipCount > 0 ? 0.8 : 0.2)
    : available ? 0.5 : 0;

  // EWO-024R.1: Separated health dimensions (only where evidence supports them)
  const operationalHealth: HealthInfo['health'] = hasErrors ? 'critical' : hasWarnings ? 'warning' : 'healthy';
  const inspectionAvailability: HealthInfo['availability'] = availability;
  const evidenceHealth: HealthInfo['health'] = evidenceQuality > 0.7 ? 'healthy' : evidenceQuality > 0.3 ? 'warning' : 'critical';
  const relationshipHealth: HealthInfo['health'] = relationshipCompleteness > 0.7 ? 'healthy' : relationshipCompleteness > 0.3 ? 'warning' : 'critical';

  return {
    availability,
    health,
    inspection_confidence: Math.round(inspectionConfidence * 100) / 100,
    evidence_quality: Math.round(evidenceQuality * 100) / 100,
    relationship_completeness: Math.round(relationshipCompleteness * 100) / 100,
    // Separated dimensions
    operational_health: operationalHealth,
    inspection_availability: inspectionAvailability,
    evidence_health: evidenceHealth,
    relationship_health: relationshipHealth,
    documentation_health: null, // Not inferred without evidence
    automated_test_health: null, // Not inferred without evidence
    engineering_confidence: available ? Math.round(inspectionConfidence * 100) / 100 : null,
  };
}

export function computeOverallHealth(healths: HealthInfo[]): HealthInfo {
  if (healths.length === 0) {
    return {
      availability: 'unavailable',
      health: 'critical',
      inspection_confidence: 0,
      evidence_quality: 0,
      relationship_completeness: 0,
    };
  }

  const anyUnavailable = healths.some(h => h.availability === 'unavailable');
  const anyCritical = healths.some(h => h.health === 'critical');
  const anyWarning = healths.some(h => h.health === 'warning');

  const avgConfidence = healths.reduce((sum, h) => sum + h.inspection_confidence, 0) / healths.length;
  const avgEvidence = healths.reduce((sum, h) => sum + h.evidence_quality, 0) / healths.length;
  const avgRelationship = healths.reduce((sum, h) => sum + h.relationship_completeness, 0) / healths.length;

  return {
    availability: anyUnavailable ? 'degraded' : 'available',
    health: anyCritical ? 'critical' : anyWarning ? 'warning' : 'healthy',
    inspection_confidence: Math.round(avgConfidence * 100) / 100,
    evidence_quality: Math.round(avgEvidence * 100) / 100,
    relationship_completeness: Math.round(avgRelationship * 100) / 100,
  };
}

export function governedEmptyHealth(): HealthInfo {
  return {
    availability: 'available',
    health: 'warning',
    inspection_confidence: 0.3,
    evidence_quality: 0,
    relationship_completeness: 0,
    operational_health: 'warning',
    inspection_availability: 'available',
    evidence_health: 'critical',
    relationship_health: 'critical',
    documentation_health: null,
    automated_test_health: null,
    engineering_confidence: null,
  };
}
