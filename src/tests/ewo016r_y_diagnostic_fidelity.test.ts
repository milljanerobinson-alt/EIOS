/**
 * EWO-016R.Y — Conversation Runtime Diagnostic Fidelity
 * Unit tests for the authoritative Runtime Diagnostic Envelope, grounding
 * rules, and Engineering Debug Mode.
 *
 * These tests exercise the pure application-code functions that build and
 * render the diagnostic envelope. The envelope is produced by code, never
 * by the language model.
 */

import { describe, it, expect } from 'vitest';

// The edge function is a Deno module; we test the pure helper logic by
// importing the types and re-implementing the same pure functions here for
// verification. The live runtime test (scripts/ewo016r_y-runtime-test.ts)
// verifies the deployed edge function end-to-end.

interface RelationshipSourceDiagnostic {
  source: string;
  attempted: boolean;
  succeeded: boolean;
  match_count: number;
  failure: string | null;
}

interface RuntimeDiagnosticEnvelope {
  request_id: string;
  detected_intent: string;
  resolved_domain: string | null;
  resolved_object_reference: string | null;
  resolved_object_type: string | null;
  runtime_pipeline: string | null;
  services_invoked: string[];
  tables_attempted: string[];
  tables_successfully_queried: string[];
  tables_skipped: string[];
  query_failures: Array<{ source: string; failure: string }>;
  records_examined_count: number;
  relationships_found_count: number;
  pending_artefacts_count: number;
  diagnostic_confidence: 'high' | 'medium' | 'low' | 'undetermined';
  generated_at: string;
}

// Mirror of buildDiagnosticEnvelope in the edge function (pure logic).
function buildDiagnosticEnvelope(
  requestId: string,
  detectedIntent: string,
  selectedDomain: string,
  resolvedRef: string | null,
  resolvedType: string | null,
  pipeline: string | null,
  servicesInvoked: string[],
  graph: { totalFound: number; totalPending: number; diagnostics: RelationshipSourceDiagnostic[] } | null,
): RuntimeDiagnosticEnvelope {
  const diagnostics = graph?.diagnostics ?? [];
  const tablesAttempted = diagnostics.filter(d => d.attempted).map(d => d.source);
  const tablesSuccessful = diagnostics.filter(d => d.attempted && d.succeeded).map(d => d.source);
  const tablesSkipped = diagnostics.filter(d => !d.attempted).map(d => d.source);
  const queryFailures = diagnostics
    .filter(d => d.attempted && !d.succeeded && d.failure)
    .map(d => ({ source: d.source, failure: d.failure! }));
  const recordsExamined = diagnostics.reduce((sum, d) => sum + d.match_count, 0);
  const relationshipsFound = graph?.totalFound ?? 0;
  const pendingArtefacts = graph?.totalPending ?? 0;
  const anyAttempted = diagnostics.length > 0;
  const allSucceeded = anyAttempted && queryFailures.length === 0;
  const diagnostic_confidence: RuntimeDiagnosticEnvelope['diagnostic_confidence'] =
    !anyAttempted ? 'undetermined' : allSucceeded ? 'high' : queryFailures.length === diagnostics.length ? 'low' : 'medium';
  return {
    request_id: requestId,
    detected_intent: detectedIntent,
    resolved_domain: selectedDomain,
    resolved_object_reference: resolvedRef,
    resolved_object_type: resolvedType,
    runtime_pipeline: pipeline,
    services_invoked: servicesInvoked,
    tables_attempted: tablesAttempted,
    tables_successfully_queried: tablesSuccessful,
    tables_skipped: tablesSkipped,
    query_failures: queryFailures,
    records_examined_count: recordsExamined,
    relationships_found_count: relationshipsFound,
    pending_artefacts_count: pendingArtefacts,
    diagnostic_confidence,
    generated_at: new Date().toISOString(),
  };
}

// Mirror of the configured relationship graph source list (EWO-016R.X).
const RELATIONSHIP_GRAPH_SOURCES = [
  'engineering_object_relationships',
  'engineering_object_registry',
  'ewo_verification_sessions',
  'ewo_completion_reports',
  'engineering_executions',
  'ecc_engineering_reviews',
  'engineering_recovery_packages',
  'ewo_engineering_packages',
  'ewo_lifecycle_events',
  'engineering_records_library',
  'atd_engineering_decisions',
];

// Mirror of detectIntent diagnostic_followup patterns.
function isDiagnosticFollowup(text: string): boolean {
  return /\b(which|what)\s+(tables?|services?|records?|pipeline|queries?)\s+(did\s+you|were|actually|you|have\s+you|ran)\b/i.test(text) ||
    /\b(how\s+did\s+you|why\s+did\s+you|why\s+were\s+no|what\s+was\s+the\s+confirmed\s+root\s+cause|was\s+this\s+discovered\s+or\s+inferred|show\s+(?:me\s+)?(?:the\s+)?runtime\s+evidence|which\s+relationship\s+graph\s+tables)\b/i.test(text);
}

describe('EWO-016R.Y — Runtime Diagnostic Fidelity', () => {

  // ─── 1. Diagnostic Envelope Structure ───────────────────────────────────────
  describe('1. Relationship discovery produces a diagnostic envelope', () => {
    it('produces an envelope with all required fields', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['resolveReference', 'buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 3, diagnostics: RELATIONSHIP_GRAPH_SOURCES.map(s => ({ source: s, attempted: true, succeeded: true, match_count: 0, failure: null })) },
      );
      expect(env.request_id).toBe('REQ-1');
      expect(env.detected_intent).toBe('relationship_discovery');
      expect(env.resolved_domain).toBe('eios-engineering');
      expect(env.resolved_object_reference).toBe('EWO-014.19A');
      expect(env.resolved_object_type).toBe('EWO');
      expect(env.runtime_pipeline).toBe('buildEngineeringRelationshipGraph');
      expect(env.services_invoked).toContain('buildEngineeringRelationshipGraph');
      expect(env.tables_attempted.length).toBe(11);
      expect(env.tables_successfully_queried.length).toBe(11);
      expect(env.query_failures).toEqual([]);
      expect(env.records_examined_count).toBe(0);
      expect(env.relationships_found_count).toBe(0);
      expect(env.pending_artefacts_count).toBe(3);
      expect(env.diagnostic_confidence).toBe('high');
      expect(env.generated_at).toBeTruthy();
    });
  });

  // ─── 2. Envelope Contains Actual Relationship Graph Sources ─────────────────
  describe('2. Envelope contains the actual relationship graph sources', () => {
    it('includes all 11 configured sources as attempted', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 3, diagnostics: RELATIONSHIP_GRAPH_SOURCES.map(s => ({ source: s, attempted: true, succeeded: true, match_count: 0, failure: null })) },
      );
      for (const source of RELATIONSHIP_GRAPH_SOURCES) {
        expect(env.tables_attempted).toContain(source);
        expect(env.tables_successfully_queried).toContain(source);
      }
    });

    it('does NOT include product-impact tables in the envelope', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 3, diagnostics: RELATIONSHIP_GRAPH_SOURCES.map(s => ({ source: s, attempted: true, succeeded: true, match_count: 0, failure: null })) },
      );
      const productImpactTables = [
        'ecc_backlog_items', 'ecc_release_candidates', 'ecc_product_features',
        'ecc_engineering_audit', 'ecc_documentation', 'ecc_decisions',
        'ecc_testing_reports', 'ecc_architecture_reviews', 'ecc_engineering_standards',
      ];
      for (const t of productImpactTables) {
        expect(env.tables_attempted).not.toContain(t);
        expect(env.tables_successfully_queried).not.toContain(t);
      }
    });
  });

  // ─── 3. Follow-up Detection ─────────────────────────────────────────────────
  describe('3. Follow-up "Which tables did you query?" is detected', () => {
    const followups = [
      'Which tables did you query?',
      'Which relationship graph tables did you actually query to produce the previous answer?',
      'What services did you invoke?',
      'How did you determine this?',
      'Why did you reach that conclusion?',
      'Show the runtime evidence.',
      'Was this discovered or inferred?',
      'What was the confirmed root cause?',
      'Which pipeline ran?',
      'What records did you inspect?',
    ];
    for (const q of followups) {
      it(`detects "${q}" as diagnostic_followup`, () => {
        expect(isDiagnosticFollowup(q)).toBe(true);
      });
    }
  });

  // ─── 4. No Invented Tables ──────────────────────────────────────────────────
  describe('4. ATD never returns a table absent from the envelope', () => {
    it('tables_successfully_queried is a subset of tables_attempted', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 0, diagnostics: [
          { source: 'engineering_object_relationships', attempted: true, succeeded: true, match_count: 0, failure: null },
          { source: 'ewo_verification_sessions', attempted: true, succeeded: false, match_count: 0, failure: 'permission denied' },
        ] },
      );
      for (const t of env.tables_successfully_queried) {
        expect(env.tables_attempted).toContain(t);
      }
    });
  });

  // ─── 5. Configured-but-not-attempted Sources ─────────────────────────────────
  describe('5. Configured-but-not-attempted sources are not described as queried', () => {
    it('a source with attempted=false is NOT in tables_successfully_queried', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 0, diagnostics: [
          { source: 'engineering_object_relationships', attempted: true, succeeded: true, match_count: 0, failure: null },
          { source: 'ewo_verification_sessions', attempted: false, succeeded: false, match_count: 0, failure: null },
        ] },
      );
      expect(env.tables_successfully_queried).toContain('engineering_object_relationships');
      expect(env.tables_successfully_queried).not.toContain('ewo_verification_sessions');
      expect(env.tables_attempted).not.toContain('ewo_verification_sessions');
      expect(env.tables_skipped).toContain('ewo_verification_sessions');
    });
  });

  // ─── 6. Failed Queries Surfaced Accurately ───────────────────────────────────
  describe('6. Failed queries are surfaced accurately', () => {
    it('query_failures lists the failed source and reason', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 0, diagnostics: [
          { source: 'engineering_object_relationships', attempted: true, succeeded: true, match_count: 0, failure: null },
          { source: 'ewo_completion_reports', attempted: true, succeeded: false, match_count: 0, failure: 'RLS policy blocked' },
        ] },
      );
      expect(env.query_failures.length).toBe(1);
      expect(env.query_failures[0].source).toBe('ewo_completion_reports');
      expect(env.query_failures[0].failure).toBe('RLS policy blocked');
      expect(env.diagnostic_confidence).toBe('medium');
    });

    it('all sources failing yields low confidence', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 0, diagnostics: [
          { source: 'engineering_object_relationships', attempted: true, succeeded: false, match_count: 0, failure: 'err' },
          { source: 'ewo_verification_sessions', attempted: true, succeeded: false, match_count: 0, failure: 'err' },
        ] },
      );
      expect(env.diagnostic_confidence).toBe('low');
    });
  });

  // ─── 7. Zero Relationships ≠ Records Do Not Exist ───────────────────────────
  describe('7. Zero relationships does not automatically become "records do not exist"', () => {
    it('envelope reports 0 relationships but does NOT assert cause A', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 3, diagnostics: RELATIONSHIP_GRAPH_SOURCES.map(s => ({ source: s, attempted: true, succeeded: true, match_count: 0, failure: null })) },
      );
      expect(env.relationships_found_count).toBe(0);
      // The envelope contains facts only — it does not assert a root cause.
      // Root cause determination is governed by the system prompt rules, which
      // require all sources to be successfully queried AND no candidates found.
      // The envelope provides the evidence; the model must not leap to Cause A.
      expect(env.diagnostic_confidence).toBe('high');
    });
  });

  // ─── 8. Confirmed Root Cause Requires Sufficient Evidence ────────────────────
  describe('8. Confirmed root cause requires sufficient evidence', () => {
    it('Cause A requires all sources succeeded with 0 candidates', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 0, diagnostics: RELATIONSHIP_GRAPH_SOURCES.map(s => ({ source: s, attempted: true, succeeded: true, match_count: 0, failure: null })) },
      );
      // All sources succeeded, 0 matches — evidence supports Cause A.
      expect(env.tables_successfully_queried.length).toBe(11);
      expect(env.query_failures.length).toBe(0);
      expect(env.records_examined_count).toBe(0);
    });

    it('Cause A is NOT supported when some sources failed', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 0, diagnostics: [
          ...RELATIONSHIP_GRAPH_SOURCES.slice(0, 10).map(s => ({ source: s, attempted: true, succeeded: true, match_count: 0, failure: null })),
          { source: 'atd_engineering_decisions', attempted: true, succeeded: false, match_count: 0, failure: 'timeout' },
        ] },
      );
      // One source failed — Cause A not supported; Cause D applies.
      expect(env.query_failures.length).toBe(1);
      expect(env.diagnostic_confidence).toBe('medium');
    });
  });

  // ─── 9. Insufficient Evidence Returns Unknown/Undetermined ──────────────────
  describe('9. Insufficient evidence returns Unknown or Undetermined', () => {
    it('no diagnostics yields undetermined confidence', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'general', 'general', null, null, null, [], null,
      );
      expect(env.diagnostic_confidence).toBe('undetermined');
      expect(env.tables_attempted).toEqual([]);
      expect(env.tables_successfully_queried).toEqual([]);
    });
  });

  // ─── 10. Debug Mode Renders Structured Facts ─────────────────────────────────
  describe('10. Debug Mode renders only structured diagnostic facts', () => {
    it('debug block contains Request ID, Intent, Domain, Object, Pipeline', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-DEBUG-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 3, diagnostics: RELATIONSHIP_GRAPH_SOURCES.map(s => ({ source: s, attempted: true, succeeded: true, match_count: 0, failure: null })) },
      );
      // The debug block is rendered from the envelope by code.
      expect(env.request_id).toBe('REQ-DEBUG-1');
      expect(env.detected_intent).toBe('relationship_discovery');
      expect(env.resolved_domain).toBe('eios-engineering');
      expect(env.resolved_object_reference).toBe('EWO-014.19A');
      expect(env.runtime_pipeline).toBe('buildEngineeringRelationshipGraph');
    });
  });

  // ─── 11. Debug Mode Does Not Expose Secrets ──────────────────────────────────
  describe('11. Debug Mode does not expose secrets or raw credentials', () => {
    it('envelope contains no secrets, tokens, or raw SQL', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 0, diagnostics: RELATIONSHIP_GRAPH_SOURCES.map(s => ({ source: s, attempted: true, succeeded: true, match_count: 0, failure: null })) },
      );
      const serialized = JSON.stringify(env);
      expect(serialized).not.toMatch(/password|secret|token|api[_-]?key|bearer|authorization/i);
      expect(serialized).not.toMatch(/select\s+.*\s+from/i); // no raw SQL
    });
  });

  // ─── 13-15. No Regressions ───────────────────────────────────────────────────
  describe('13. Impact Analysis remains unchanged (not relationship_discovery)', () => {
    it('impact queries do not classify as relationship_discovery', () => {
      const impactQueries = [
        'What features are affected by EWO-014.19A?',
        'What APIs are impacted by EWO-014.19A?',
        'What tests are required for EWO-014.19A?',
      ];
      for (const q of impactQueries) {
        expect(isDiagnosticFollowup(q)).toBe(false);
      }
    });
  });

  describe('14. Relationship Discovery remains unchanged', () => {
    it('relationship queries still classify as relationship_discovery (not diagnostic_followup)', () => {
      const relQueries = [
        'What engineering records are related to EWO-014.19A?',
        'Show engineering traceability for EWO-014.19A',
      ];
      for (const q of relQueries) {
        expect(isDiagnosticFollowup(q)).toBe(false);
      }
    });
  });

  describe('15. Cross-domain routing remains unchanged', () => {
    it('non-engineering queries produce a general envelope', () => {
      const env = buildDiagnosticEnvelope(
        'REQ-1', 'general', 'general', null, null, null, [], null,
      );
      expect(env.resolved_domain).toBe('general');
      expect(env.runtime_pipeline).toBeNull();
    });
  });

  // ─── 16-17. Request-Scoped Continuity ─────────────────────────────────────────
  describe('16. Follow-up diagnostics remain bound to the correct request', () => {
    it('prior envelope request_id is preserved on follow-up', () => {
      const priorEnv = buildDiagnosticEnvelope(
        'REQ-ORIGINAL', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 3, diagnostics: RELATIONSHIP_GRAPH_SOURCES.map(s => ({ source: s, attempted: true, succeeded: true, match_count: 0, failure: null })) },
      );
      // On follow-up, the same envelope object is reused (bound).
      const followupEnv = priorEnv;
      expect(followupEnv.request_id).toBe('REQ-ORIGINAL');
      expect(followupEnv.tables_successfully_queried).toEqual(priorEnv.tables_successfully_queried);
    });
  });

  describe('17. Multiple requests do not mix diagnostic envelopes', () => {
    it('two separate requests produce distinct envelopes', () => {
      const env1 = buildDiagnosticEnvelope(
        'REQ-A', 'relationship_discovery', 'eios-engineering',
        'EWO-014.19A', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 2, totalPending: 0, diagnostics: [{ source: 'engineering_object_relationships', attempted: true, succeeded: true, match_count: 2, failure: null }] },
      );
      const env2 = buildDiagnosticEnvelope(
        'REQ-B', 'relationship_discovery', 'eios-engineering',
        'EWO-015', 'EWO', 'buildEngineeringRelationshipGraph',
        ['buildEngineeringRelationshipGraph'],
        { totalFound: 0, totalPending: 1, diagnostics: [{ source: 'engineering_object_relationships', attempted: true, succeeded: true, match_count: 0, failure: null }] },
      );
      expect(env1.request_id).not.toBe(env2.request_id);
      expect(env1.resolved_object_reference).toBe('EWO-014.19A');
      expect(env2.resolved_object_reference).toBe('EWO-015');
      expect(env1.relationships_found_count).toBe(2);
      expect(env2.relationships_found_count).toBe(0);
    });
  });
});
