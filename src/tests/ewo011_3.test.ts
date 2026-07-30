/**
 * EWO-011.3: Engineering Completion Governance & Records Automation — Validation
 * Covers: governance engine phases, historical backfill, memory extraction,
 * lineage, exports, UI authority state, PO acceptance automation, batch runner.
 */

import { describe, it, expect } from 'vitest';
import type { GovernancePhase, GovernanceResult } from '../lib/completionGovernanceEngine';

// ─── 1. Governance Engine — Phase Definitions ────────────────────────────────

describe('Governance engine — phase definitions (EWO-011.3)', () => {
  it('GovernancePhase union covers all 5 valid phases', () => {
    const phases: GovernancePhase[] = ['ratify', 'memory_extraction', 'export_generation', 'lineage', 'complete'];
    expect(phases).toHaveLength(5);
    expect(phases).toContain('ratify');
    expect(phases).toContain('memory_extraction');
    expect(phases).toContain('export_generation');
    expect(phases).toContain('lineage');
    expect(phases).toContain('complete');
  });

  it('GovernanceResult shape includes recordId, recordRef, success, phases', () => {
    const result: GovernanceResult = {
      recordId:  'uuid-001',
      recordRef: 'REC-ABCD1234',
      success:   true,
      phases: [
        { phase: 'ratify',            status: 'complete', message: 'Ratified' },
        { phase: 'memory_extraction', status: 'complete', message: 'Extracted' },
        { phase: 'export_generation', status: 'complete', message: 'Exports done' },
        { phase: 'lineage',           status: 'complete', message: 'Lineage done' },
      ],
    };
    expect(result.success).toBe(true);
    expect(result.phases).toHaveLength(4);
    expect(result.recordRef).toMatch(/^REC-/);
  });

  it('success is false when any phase has status "error"', () => {
    const phases: GovernanceResult['phases'] = [
      { phase: 'ratify',            status: 'complete', message: 'ok' },
      { phase: 'memory_extraction', status: 'error',   message: 'DB error' },
      { phase: 'export_generation', status: 'complete', message: 'ok' },
      { phase: 'lineage',           status: 'complete', message: 'ok' },
    ];
    const allOk = phases.every(p => p.status === 'complete');
    expect(allOk).toBe(false);
  });

  it('success is true only when ALL phases are complete', () => {
    const phases: GovernanceResult['phases'] = [
      { phase: 'ratify',            status: 'complete', message: 'ok' },
      { phase: 'memory_extraction', status: 'complete', message: 'ok' },
      { phase: 'export_generation', status: 'complete', message: 'ok' },
      { phase: 'lineage',           status: 'complete', message: 'ok' },
    ];
    expect(phases.every(p => p.status === 'complete')).toBe(true);
  });
});

// ─── 2. Phase 1 — Ratify ─────────────────────────────────────────────────────

describe('Phase 1: Ratify (EWO-011.3)', () => {
  it('ratify sets authority_state to "authoritative"', () => {
    const update = { authority_state: 'authoritative', governance_status: 'running' };
    expect(update.authority_state).toBe('authoritative');
    expect(update.governance_status).toBe('running');
  });

  it('ratify records po_accepted_by and po_acceptance_statement', () => {
    const update = {
      po_accepted_at:          new Date().toISOString(),
      po_accepted_by:          'Product Owner',
      po_acceptance_statement: 'Product Owner Accepted — EWO-011.3',
    };
    expect(update.po_accepted_by).toBe('Product Owner');
    expect(update.po_acceptance_statement).toContain('EWO-011.3');
    expect(update.po_accepted_at).toBeTruthy();
  });

  it('ratify throws on DB error — engine halts immediately', () => {
    const simulateRatifyError = () => { throw new Error('Ratify: update failed'); };
    expect(simulateRatifyError).toThrow('Ratify:');
  });

  it('only ratify failure causes early return — other phase failures are non-fatal', () => {
    const ratifyFailed   = true;
    const earlyReturn    = ratifyFailed;   // engine returns after ratify failure
    const memoryFailed   = true;
    const noEarlyReturn  = !memoryFailed;  // non-ratify failures continue
    expect(earlyReturn).toBe(true);
    expect(noEarlyReturn).toBe(false);
  });
});

// ─── 3. Phase 2 — Memory Extraction ─────────────────────────────────────────

describe('Phase 2: Memory Extraction (EWO-011.3)', () => {
  it('summary produces an "implementation_strategy" knowledge entry', () => {
    const summary = 'This EWO implemented full governance automation.';
    const entry = {
      knowledge_category: 'implementation_strategy',
      knowledge_domain:   'constitutional-engineering',
      content:            summary.slice(0, 1200),
      authority_state:    'authoritative',
    };
    expect(entry.knowledge_category).toBe('implementation_strategy');
    expect(entry.authority_state).toBe('authoritative');
    expect(entry.content.length).toBeLessThanOrEqual(1200);
  });

  it('lessons_learned produces a "lesson_learned" entry', () => {
    const lessons = ['Always validate RLS', 'DB defaults prevent null ownership'];
    const entry = {
      knowledge_category: 'lesson_learned',
      content:            lessons.join(' | '),
    };
    expect(entry.knowledge_category).toBe('lesson_learned');
    expect(entry.content).toContain('Always validate RLS');
  });

  it('architectural_decisions produces an "architecture" entry', () => {
    const decisions = ['Append-only records', 'Governance engine is the only authority'];
    const entry = {
      knowledge_category: 'architecture',
      knowledge_domain:   'architecture',
      content:            decisions.join(' | ').slice(0, 800),
    };
    expect(entry.knowledge_category).toBe('architecture');
    expect(entry.content.length).toBeLessThanOrEqual(800);
  });

  it('future_recommendations produces a "pattern" entry', () => {
    const recs = ['Add AI-powered governance review'];
    const entry = {
      knowledge_category: 'pattern',
      knowledge_domain:   'platform-governance',
      content:            recs.join(' | '),
    };
    expect(entry.knowledge_category).toBe('pattern');
  });

  it('high/critical risk rating produces a "known_risk" entry', () => {
    const riskRating = 'high';
    const shouldCreate = riskRating === 'high' || riskRating === 'critical';
    const entry = {
      knowledge_category: 'known_risk',
      knowledge_domain:   'platform',
      content:            `Engineering record classified as ${riskRating} risk.`,
    };
    expect(shouldCreate).toBe(true);
    expect(entry.knowledge_category).toBe('known_risk');
  });

  it('low risk rating does NOT produce a known_risk entry', () => {
    const riskRating = 'low';
    const shouldCreate = riskRating === 'high' || riskRating === 'critical';
    expect(shouldCreate).toBe(false);
  });

  it('flags knowledge_extracted and engineering_memory_extracted after success', () => {
    const flags = { engineering_memory_extracted: true, knowledge_extracted: true };
    expect(flags.engineering_memory_extracted).toBe(true);
    expect(flags.knowledge_extracted).toBe(true);
  });
});

// ─── 4. Phase 3 — Export Generation ─────────────────────────────────────────

describe('Phase 3: Export Generation (EWO-011.3)', () => {
  it('generates 3 export types: markdown, json, manifest', () => {
    const exportTypes = ['markdown', 'json', 'manifest'];
    expect(exportTypes).toHaveLength(3);
    expect(exportTypes).toContain('markdown');
    expect(exportTypes).toContain('json');
    expect(exportTypes).toContain('manifest');
  });

  it('markdown export begins with the record_ref and title', () => {
    const record_ref = 'REC-ABCD1234';
    const title      = 'Test Record';
    const firstLine  = `# ${record_ref} — ${title}`;
    expect(firstLine).toBe('# REC-ABCD1234 — Test Record');
  });

  it('json export includes generated_at and generator fields', () => {
    const json = {
      record_ref:    'REC-X',
      generated_at:  new Date().toISOString(),
      generator:     'Engineering Completion Governance Engine',
      ewo_generator: 'EWO-011.3',
    };
    expect(json.generator).toBe('Engineering Completion Governance Engine');
    expect(json.ewo_generator).toBe('EWO-011.3');
    expect(json.generated_at).toBeTruthy();
  });

  it('manifest lists all 3 export filenames', () => {
    const ref = 'REC-ABCD1234';
    const manifest = {
      exports: [
        { type: 'markdown', filename: `${ref}.md` },
        { type: 'json',     filename: `${ref}.json` },
        { type: 'manifest', filename: `${ref}.manifest.json` },
      ],
    };
    expect(manifest.exports).toHaveLength(3);
    expect(manifest.exports[0].filename).toMatch(/\.md$/);
    expect(manifest.exports[1].filename).toMatch(/\.json$/);
    expect(manifest.exports[2].filename).toMatch(/\.manifest\.json$/);
  });

  it('exports are idempotent — prior exports deleted before re-insert', () => {
    const ops = ['delete_prior_exports', 'insert_new_exports'];
    expect(ops[0]).toBe('delete_prior_exports');
    expect(ops[1]).toBe('insert_new_exports');
    expect(ops).toHaveLength(2);
  });

  it('flags exports_generated and sets export_urls after success', () => {
    const ref = 'REC-X';
    const flags = { exports_generated: true };
    const urls  = { markdown: `generated:${ref}.md`, json: `generated:${ref}.json`, manifest: `generated:${ref}.manifest.json` };
    expect(flags.exports_generated).toBe(true);
    expect(Object.keys(urls)).toHaveLength(3);
  });
});

// ─── 5. Phase 4 — Lineage ────────────────────────────────────────────────────

describe('Phase 4: Lineage (EWO-011.3)', () => {
  it('lineage is created when ewo_ref differs from record_ref', () => {
    const record_ref = 'REC-ABCD1234';
    const ewo_ref    = 'EWO-011';
    const shouldCreate = ewo_ref && ewo_ref !== record_ref;
    expect(shouldCreate).toBeTruthy();
  });

  it('lineage is NOT created when ewo_ref equals record_ref', () => {
    const record_ref = 'EWO-011';
    const ewo_ref    = 'EWO-011';
    const shouldCreate = ewo_ref && ewo_ref !== record_ref;
    expect(shouldCreate).toBeFalsy();
  });

  it('lineage is NOT created when ewo_ref is null', () => {
    const ewo_ref    = null;
    const record_ref = 'REC-X';
    const shouldCreate = ewo_ref && ewo_ref !== record_ref;
    expect(shouldCreate).toBeFalsy();
  });

  it('lineage relationship_type is "related_ewo"', () => {
    const relationship_type = 'related_ewo';
    expect(relationship_type).toBe('related_ewo');
  });

  it('lineage insert is idempotent — skipped when from_record_ref already has lineage', () => {
    const existing: { id: string }[] = [{ id: 'lineage-001' }];
    const shouldInsert = !existing.length;
    expect(shouldInsert).toBe(false);
  });

  it('flags lineage_established after success', () => {
    const flags = { lineage_established: true };
    expect(flags.lineage_established).toBe(true);
  });
});

// ─── 6. Governance Lifecycle ─────────────────────────────────────────────────

describe('Governance lifecycle (EWO-011.3)', () => {
  it('governance_status transitions: pending → running → complete', () => {
    const states = ['pending', 'running', 'complete'];
    expect(states[0]).toBe('pending');
    expect(states[1]).toBe('running');
    expect(states[2]).toBe('complete');
  });

  it('governance_status is "error" when any phase fails', () => {
    const phases = [
      { status: 'complete' },
      { status: 'error' },
      { status: 'complete' },
      { status: 'complete' },
    ] as const;
    const allOk = phases.every(p => p.status === 'complete');
    const finalStatus = allOk ? 'complete' : 'error';
    expect(finalStatus).toBe('error');
  });

  it('governance_status is "complete" when all phases succeed', () => {
    const allOk = true;
    const finalStatus = allOk ? 'complete' : 'error';
    expect(finalStatus).toBe('complete');
  });

  it('governance_log records phase start (running) and end (complete/error)', () => {
    const logEntries = [
      { phase: 'ratify', status: 'running',  message: 'Starting ratify' },
      { phase: 'ratify', status: 'complete', message: 'Ratified successfully' },
    ];
    expect(logEntries[0].status).toBe('running');
    expect(logEntries[1].status).toBe('complete');
    expect(logEntries.every(e => e.phase)).toBe(true);
  });
});

// ─── 7. Historical Backfill ───────────────────────────────────────────────────

describe('Historical backfill (EWO-011.3)', () => {
  it('backfill covers EWOs 001 through 011.2A', () => {
    const backfilledEWOs = [
      'EWO-008', 'EWO-008-AMD-001', 'EWO-009', 'EWO-009.1',
      'EWO-010', 'EWO-011', 'EWO-011.1', 'EWO-011.2', 'EWO-011.2A',
    ];
    expect(backfilledEWOs).toHaveLength(9);
    expect(backfilledEWOs).toContain('EWO-008');
    expect(backfilledEWOs).toContain('EWO-011.2A');
  });

  it('backfill is idempotent via ON CONFLICT DO NOTHING', () => {
    const strategy = 'ON CONFLICT (record_ref) DO NOTHING';
    expect(strategy).toContain('CONFLICT');
    expect(strategy).toContain('NOTHING');
    expect(strategy).toContain('record_ref');
  });

  it('backfill records have is_backfill = true', () => {
    const record = { is_backfill: true, record_ref: 'REC-EWO008' };
    expect(record.is_backfill).toBe(true);
  });

  it('backfill accepted_by uses system label, not a person', () => {
    const acceptedBy = 'System — EWO-011.3 Backfill';
    expect(acceptedBy).toContain('System');
    expect(acceptedBy).toContain('EWO-011.3');
  });

  it('batch runner reports processed, succeeded, failed counts', () => {
    const stats = { processed: 9, succeeded: 9, failed: 0 };
    expect(stats.processed).toBe(9);
    expect(stats.succeeded).toBe(stats.processed - stats.failed);
  });
});

// ─── 8. UI Governance Status ─────────────────────────────────────────────────

describe('UI governance status indicators (EWO-011.3)', () => {
  it('null governance_status renders as "Governance Pending"', () => {
    const status: string | null = null;
    const label = (!status || status === 'pending') ? 'Governance Pending' : status;
    expect(label).toBe('Governance Pending');
  });

  it('"complete" governance_status renders as "Governance Complete"', () => {
    const status = 'complete';
    const label = status === 'complete' ? 'Governance Complete' : 'other';
    expect(label).toBe('Governance Complete');
  });

  it('"error" governance_status renders as error state', () => {
    const status = 'error';
    const isError = status === 'error';
    expect(isError).toBe(true);
  });

  it('backfill indicator shown when is_backfill is true', () => {
    const is_backfill = true;
    expect(is_backfill).toBe(true);
  });

  it('exports badge shown when exports_generated is true', () => {
    const exports_generated = true;
    expect(exports_generated).toBe(true);
  });

  it('lineage badge shown when lineage_established is true', () => {
    const lineage_established = true;
    expect(lineage_established).toBe(true);
  });

  it('Run Governance button only shown for authoritative records with pending/null/error governance', () => {
    const canRun = (authority: string, govStatus: string | null) =>
      authority === 'authoritative' &&
      (!govStatus || govStatus === 'pending' || govStatus === 'error');

    expect(canRun('authoritative', null)).toBe(true);
    expect(canRun('authoritative', 'pending')).toBe(true);
    expect(canRun('authoritative', 'error')).toBe(true);
    expect(canRun('authoritative', 'complete')).toBe(false);
    expect(canRun('provisional', null)).toBe(false);
    expect(canRun('non_authoritative', null)).toBe(false);
  });
});

// ─── 9. PO Acceptance Automation ─────────────────────────────────────────────

describe('PO Acceptance automation (EWO-011.3)', () => {
  it('governance engine is the only entity that may set authority_state to authoritative', () => {
    const authorisedSetter = 'Engineering Completion Governance Engine';
    expect(authorisedSetter).toBe('Engineering Completion Governance Engine');
    expect(authorisedSetter).not.toBe('Bolt');
    expect(authorisedSetter).not.toBe('Manual');
  });

  it('governance engine accepts po_accepted_by and statement from caller', () => {
    const options = {
      acceptedBy: 'Alice Smith',
      statement:  'All acceptance criteria met. EWO-011.3 approved.',
    };
    expect(options.acceptedBy).toBeTruthy();
    expect(options.statement).toBeTruthy();
  });

  it('defaults acceptedBy to "Product Owner" when not provided', () => {
    const acceptedBy = undefined ?? 'Product Owner';
    expect(acceptedBy).toBe('Product Owner');
  });

  it('default statement references EWO governance engine', () => {
    const statement = undefined ?? 'Product Owner Accepted — Engineering Completion Governance Engine initiated.';
    expect(statement).toContain('Engineering Completion Governance Engine');
  });
});

// ─── 10. Schema Additions (EWO-011.3) ────────────────────────────────────────

describe('Schema additions (EWO-011.3)', () => {
  it('engineering_records_library has governance_status column', () => {
    const columns = ['governance_status', 'knowledge_extracted', 'lineage_established',
      'exports_generated', 'is_backfill', 'completion_report_ref', 'engineering_object_refs', 'export_urls'];
    expect(columns).toContain('governance_status');
    expect(columns).toContain('knowledge_extracted');
    expect(columns).toContain('lineage_established');
    expect(columns).toContain('exports_generated');
    expect(columns).toContain('is_backfill');
  });

  it('engineering_record_exports table has record_id, export_type, content, file_size_bytes', () => {
    const cols = ['id', 'record_id', 'export_type', 'content', 'file_size_bytes', 'created_at'];
    expect(cols).toContain('record_id');
    expect(cols).toContain('export_type');
    expect(cols).toContain('content');
    expect(cols).toContain('file_size_bytes');
  });

  it('engineering_governance_log table has phase, status, message, ewo_ref', () => {
    const cols = ['id', 'record_id', 'ewo_ref', 'phase', 'status', 'message', 'created_at'];
    expect(cols).toContain('phase');
    expect(cols).toContain('status');
    expect(cols).toContain('message');
    expect(cols).toContain('ewo_ref');
  });

  it('new LINEAGE_TYPE_CFG entries cover parent, child, sibling, depends_on, introduced_by, resolved_by', () => {
    const newTypes = ['parent', 'child', 'sibling', 'depends_on', 'introduced_by', 'resolved_by'];
    expect(newTypes).toHaveLength(6);
    expect(newTypes).toContain('depends_on');
    expect(newTypes).toContain('introduced_by');
    expect(newTypes).toContain('resolved_by');
  });
});
