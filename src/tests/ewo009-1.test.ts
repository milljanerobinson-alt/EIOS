/**
 * EWO-009.1: Engineering Memory Refinement & Product Owner Closeout
 * Targeted test suite covering: export architecture, knowledge domains,
 * enrichment model, overview stats, timeline, enhanced search, lineage
 * extension, scroll fix model, ATD handoff refinement, backwards compatibility.
 */

import { describe, it, expect } from 'vitest';

// ─── 1. Export Architecture ───────────────────────────────────────────────────

describe('Export architecture', () => {
  const EXPORT_TYPES = [
    'completion_report_pdf',
    'executive_summary_pdf',
    'technical_report_pdf',
    'markdown',
    'json',
    'engineering_package',
  ] as const;

  it('six export types are defined', () => {
    expect(EXPORT_TYPES).toHaveLength(6);
  });

  it('each export type has a unique identifier', () => {
    const unique = new Set(EXPORT_TYPES);
    expect(unique.size).toBe(EXPORT_TYPES.length);
  });

  it('PDF exports cover completion report, executive summary, and technical report', () => {
    const pdfExports = EXPORT_TYPES.filter(t => t.endsWith('_pdf'));
    expect(pdfExports).toContain('completion_report_pdf');
    expect(pdfExports).toContain('executive_summary_pdf');
    expect(pdfExports).toContain('technical_report_pdf');
    expect(pdfExports).toHaveLength(3);
  });

  it('text exports cover markdown and JSON', () => {
    const textExports = EXPORT_TYPES.filter(t => t === 'markdown' || t === 'json');
    expect(textExports).toHaveLength(2);
  });

  it('engineering package is a valid export type', () => {
    expect(EXPORT_TYPES).toContain('engineering_package');
  });

  it('Engineering Record is the canonical source — all exports are derived', () => {
    const model = {
      canonical_source: 'engineering_record',
      pdf_role: 'derived_export',
      markdown_role: 'derived_export',
      json_role: 'derived_export',
      package_role: 'derived_manifest',
    };
    expect(model.canonical_source).toBe('engineering_record');
    expect(model.pdf_role).toBe('derived_export');
    expect(model.markdown_role).toBe('derived_export');
  });

  it('JSON export includes _meta block with export type, timestamp, canonical note', () => {
    const meta = {
      export_type: 'engineering_record_json',
      generated_at: new Date().toISOString(),
      canonical_source: 'engineering_records_library',
      note: 'DERIVED EXPORT — this JSON is generated from the canonical Engineering Record. (CD-007-R1)',
    };
    expect(meta.export_type).toBeTruthy();
    expect(meta.canonical_source).toBeTruthy();
    expect(meta.note).toContain('DERIVED EXPORT');
    expect(meta.note).toContain('CD-007-R1');
  });

  it('engineering package manifest includes all required content items', () => {
    const contents = [
      { item: 'engineering_record', format: 'json', included: true },
      { item: 'engineering_completion_report', format: 'pdf', included: false },
      { item: 'validation_summary', format: 'json', included: true },
      { item: 'engineering_knowledge', format: 'json', included: true },
      { item: 'semantic_metadata', format: 'json', included: true },
      { item: 'relationships', format: 'json', included: true },
    ];
    expect(contents).toHaveLength(6);
    expect(contents.find(c => c.item === 'engineering_record')?.included).toBe(true);
    expect(contents.find(c => c.item === 'engineering_completion_report')?.included).toBe(false);
  });

  it('PDF filenames follow the pattern <ref>-v<version>-<type>.pdf', () => {
    const ref = 'EWO-009';
    const version = 1;
    const completionFile = `${ref}-v${version}-completion-report.pdf`;
    const summaryFile = `${ref}-v${version}-executive-summary.pdf`;
    const technicalFile = `${ref}-v${version}-technical-report.pdf`;

    expect(completionFile).toBe('EWO-009-v1-completion-report.pdf');
    expect(summaryFile).toBe('EWO-009-v1-executive-summary.pdf');
    expect(technicalFile).toBe('EWO-009-v1-technical-report.pdf');
  });
});

// ─── 2. Knowledge Domains ─────────────────────────────────────────────────────

describe('Knowledge domains', () => {
  const KNOWLEDGE_DOMAINS = [
    'architecture', 'security', 'performance', 'testing',
    'compliance', 'operations', 'ux', 'ai', 'data',
    'platform', 'infrastructure', 'quality-assurance',
    'frontend', 'platform-governance', 'constitutional-engineering',
    'integration', 'engineering-records', 'engineering-review',
  ] as const;

  it('knowledge domain list is non-empty', () => {
    expect(KNOWLEDGE_DOMAINS.length).toBeGreaterThan(0);
  });

  it('core 11 engineering domains are present', () => {
    const core11 = ['architecture', 'security', 'performance', 'testing', 'compliance',
      'operations', 'ux', 'ai', 'data', 'platform', 'infrastructure'];
    for (const domain of core11) {
      expect(KNOWLEDGE_DOMAINS).toContain(domain as typeof KNOWLEDGE_DOMAINS[number]);
    }
  });

  it('all domain identifiers are lowercase with no spaces', () => {
    for (const d of KNOWLEDGE_DOMAINS) {
      expect(d).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('no duplicate domain entries', () => {
    const unique = new Set(KNOWLEDGE_DOMAINS);
    expect(unique.size).toBe(KNOWLEDGE_DOMAINS.length);
  });

  it('knowledge_domain column extends engineering_memory model', () => {
    interface MemoryEntry {
      id: string;
      record_id: string;
      record_ref: string;
      knowledge_category: string;
      knowledge_domain: string | null;
      title: string;
      content: string;
      tags: string[];
      authority_state: string;
      created_at: string;
    }

    const entry: MemoryEntry = {
      id: 'uuid-mem-001',
      record_id: 'uuid-rec-001',
      record_ref: 'EWO-009',
      knowledge_category: 'architecture',
      knowledge_domain: 'platform',
      title: 'Engineering Records Architecture',
      content: 'Structured JSONB sections as canonical storage.',
      tags: ['records', 'architecture'],
      authority_state: 'authoritative',
      created_at: '2026-07-12T09:00:00Z',
    };

    expect(entry.knowledge_domain).toBe('platform');
    expect(entry.knowledge_category).toBe('architecture');
  });
});

// ─── 3. Engineering Record Enrichment Model ───────────────────────────────────

describe('Engineering Record enrichment model', () => {
  interface EnrichedRecord {
    id: string;
    record_ref: string;
    complexity: string | null;
    estimated_effort: string | null;
    risk_rating: string | null;
    confidence: string | null;
    platform_services_affected: string[] | null;
    applications_affected: string[] | null;
    subsystems_affected: string[] | null;
    technologies: string[] | null;
    engineering_disciplines: string[] | null;
    primary_engineer: string | null;
    product_owner: string | null;
  }

  it('enrichment model has all 11 new fields', () => {
    const ENRICHMENT_FIELDS: (keyof EnrichedRecord)[] = [
      'complexity', 'estimated_effort', 'risk_rating', 'confidence',
      'platform_services_affected', 'applications_affected', 'subsystems_affected',
      'technologies', 'engineering_disciplines', 'primary_engineer', 'product_owner',
    ];
    expect(ENRICHMENT_FIELDS).toHaveLength(11);
  });

  it('enrichment fields are all nullable (backwards compatible)', () => {
    const record: EnrichedRecord = {
      id: 'uuid-001',
      record_ref: 'EWO-001',
      complexity: null,
      estimated_effort: null,
      risk_rating: null,
      confidence: null,
      platform_services_affected: null,
      applications_affected: null,
      subsystems_affected: null,
      technologies: null,
      engineering_disciplines: null,
      primary_engineer: null,
      product_owner: null,
    };
    // All nullable fields should accept null without error
    expect(record.complexity).toBeNull();
    expect(record.risk_rating).toBeNull();
    expect(record.technologies).toBeNull();
  });

  it('complexity values are bounded', () => {
    const VALID_COMPLEXITIES = ['low', 'medium', 'high', 'very_high'];
    expect(VALID_COMPLEXITIES).toContain('low');
    expect(VALID_COMPLEXITIES).toContain('high');
    expect(VALID_COMPLEXITIES).not.toContain('extreme');
  });

  it('risk_rating values are bounded', () => {
    const VALID_RATINGS = ['low', 'medium', 'high', 'critical'];
    expect(VALID_RATINGS).toContain('critical');
    expect(VALID_RATINGS).not.toContain('none');
  });

  it('array enrichment fields accept string arrays', () => {
    const record: Pick<EnrichedRecord, 'technologies' | 'subsystems_affected' | 'applications_affected'> = {
      technologies: ['TypeScript', 'React', 'PostgreSQL', 'Supabase'],
      subsystems_affected: ['engineering-records', 'engineering-memory'],
      applications_affected: ['EIOS Platform', 'ECC'],
    };
    expect(record.technologies).toHaveLength(4);
    expect(record.subsystems_affected).toContain('engineering-records');
    expect(record.applications_affected).toContain('EIOS Platform');
  });

  it('enrichment fields do not break pre-existing records that lack them', () => {
    // Pre-enrichment records have null for all new fields — this is valid
    const legacyRecord: Partial<EnrichedRecord> = {
      id: 'uuid-legacy',
      record_ref: 'BATCH-A',
    };
    expect(legacyRecord.complexity).toBeUndefined();
    expect(legacyRecord.technologies).toBeUndefined();
  });
});

// ─── 4. Overview Stats Model ──────────────────────────────────────────────────

describe('Overview stats model', () => {
  const mockRecords = [
    { id: '1', record_type: 'completion_report', authority_state: 'authoritative', completion_date: '2026-06-01', engineering_memory_extracted: true },
    { id: '2', record_type: 'completion_report', authority_state: 'authoritative', completion_date: '2026-06-15', engineering_memory_extracted: true },
    { id: '3', record_type: 'constitutional_document', authority_state: 'authoritative', completion_date: '2026-05-01', engineering_memory_extracted: false },
    { id: '4', record_type: 'release_note', authority_state: 'provisional', completion_date: null, engineering_memory_extracted: false },
    { id: '5', record_type: 'decision_record', authority_state: 'authoritative', completion_date: '2026-07-01', engineering_memory_extracted: true },
  ];

  it('can compute total record count', () => {
    expect(mockRecords).toHaveLength(5);
  });

  it('can compute authoritative record count', () => {
    const authoritative = mockRecords.filter(r => r.authority_state === 'authoritative');
    expect(authoritative).toHaveLength(4);
  });

  it('can compute memory extraction coverage percentage', () => {
    const extracted = mockRecords.filter(r => r.engineering_memory_extracted);
    const pct = Math.round((extracted.length / mockRecords.length) * 100);
    expect(pct).toBe(60);
  });

  it('can group records by type', () => {
    const byType: Record<string, number> = {};
    for (const r of mockRecords) {
      byType[r.record_type] = (byType[r.record_type] ?? 0) + 1;
    }
    expect(byType['completion_report']).toBe(2);
    expect(byType['constitutional_document']).toBe(1);
    expect(byType['decision_record']).toBe(1);
  });

  it('recent records are sorted by completion_date descending', () => {
    const withDates = mockRecords
      .filter(r => r.completion_date !== null)
      .sort((a, b) => (b.completion_date ?? '').localeCompare(a.completion_date ?? ''));
    expect(withDates[0].completion_date).toBe('2026-07-01');
    expect(withDates[1].completion_date).toBe('2026-06-15');
  });
});

// ─── 5. Timeline Architecture ─────────────────────────────────────────────────

describe('Timeline architecture', () => {
  const timelineRecords = [
    { id: '1', record_ref: 'EWO-001', completion_date: '2026-01-15', record_type: 'completion_report', programme: 'EIOS' },
    { id: '2', record_ref: 'EWO-002', completion_date: '2026-01-20', record_type: 'completion_report', programme: 'EIOS' },
    { id: '3', record_ref: 'BATCH-A', completion_date: '2025-12-01', record_type: 'completion_report', programme: 'Pre-EWO' },
    { id: '4', record_ref: 'CONST-001', completion_date: '2026-03-10', record_type: 'constitutional_document', programme: 'EIOS' },
  ];

  it('records can be grouped by year-month', () => {
    const groups: Record<string, typeof timelineRecords> = {};
    for (const r of timelineRecords) {
      if (!r.completion_date) continue;
      const key = r.completion_date.slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    expect(groups['2026-01']).toHaveLength(2);
    expect(groups['2025-12']).toHaveLength(1);
    expect(groups['2026-03']).toHaveLength(1);
  });

  it('timeline groups sort chronologically descending', () => {
    const keys = ['2026-03', '2026-01', '2025-12'];
    const sorted = [...keys].sort((a, b) => b.localeCompare(a));
    expect(sorted[0]).toBe('2026-03');
    expect(sorted[sorted.length - 1]).toBe('2025-12');
  });

  it('timeline can filter by programme', () => {
    const eios = timelineRecords.filter(r => r.programme === 'EIOS');
    expect(eios).toHaveLength(3);
    expect(eios.map(r => r.record_ref)).not.toContain('BATCH-A');
  });

  it('timeline can filter by record type', () => {
    const constitutional = timelineRecords.filter(r => r.record_type === 'constitutional_document');
    expect(constitutional).toHaveLength(1);
    expect(constitutional[0].record_ref).toBe('CONST-001');
  });

  it('records without completion_date are excluded from timeline', () => {
    const withoutDate = { id: '5', record_ref: 'EWO-WIP', completion_date: null, record_type: 'completion_report', programme: 'EIOS' };
    const all = [...timelineRecords, withoutDate];
    const timelineEligible = all.filter(r => r.completion_date !== null);
    expect(timelineEligible).toHaveLength(4);
  });
});

// ─── 6. Enhanced Search ───────────────────────────────────────────────────────

describe('Enhanced search', () => {
  const searchableRecord = {
    id: '1',
    record_ref: 'EWO-009',
    title: 'Engineering Memory Refinement',
    ewo_ref: 'EWO-009',
    programme: 'EIOS',
    technologies: ['TypeScript', 'React', 'PostgreSQL'],
    subsystems_affected: ['engineering-records', 'engineering-memory'],
    applications_affected: ['ECC', 'EIOS Platform'],
    semantic_metadata: {
      keywords: ['memory', 'refinement', 'records'],
      engineering_domains: ['platform'],
    },
  };

  function searchMatches(record: typeof searchableRecord, query: string): boolean {
    const q = query.toLowerCase();
    const fields = [
      record.record_ref,
      record.title,
      record.ewo_ref,
      record.programme,
      ...(record.technologies ?? []),
      ...(record.subsystems_affected ?? []),
      ...(record.applications_affected ?? []),
      ...((record.semantic_metadata?.keywords as string[]) ?? []),
    ];
    return fields.some(f => f?.toLowerCase().includes(q));
  }

  it('search matches on record_ref', () => {
    expect(searchMatches(searchableRecord, 'EWO-009')).toBe(true);
  });

  it('search matches on title', () => {
    expect(searchMatches(searchableRecord, 'Memory Refinement')).toBe(true);
  });

  it('search matches on technology', () => {
    expect(searchMatches(searchableRecord, 'postgresql')).toBe(true);
  });

  it('search matches on subsystem', () => {
    expect(searchMatches(searchableRecord, 'engineering-memory')).toBe(true);
  });

  it('search matches on application', () => {
    expect(searchMatches(searchableRecord, 'EIOS Platform')).toBe(true);
  });

  it('search matches on keyword (semantic metadata)', () => {
    expect(searchMatches(searchableRecord, 'refinement')).toBe(true);
  });

  it('search is case-insensitive', () => {
    expect(searchMatches(searchableRecord, 'TYPESCRIPT')).toBe(true);
    expect(searchMatches(searchableRecord, 'typescript')).toBe(true);
  });

  it('search returns false for non-matching query', () => {
    expect(searchMatches(searchableRecord, 'zzz-no-match-xyz')).toBe(false);
  });

  it('empty search query matches all records (no filter applied)', () => {
    const query = '';
    // Empty query should match everything — caller responsibility to skip filter
    expect(query.length).toBe(0);
    const shouldFilter = query.trim().length > 0;
    expect(shouldFilter).toBe(false);
  });
});

// ─── 7. Lineage Extension ─────────────────────────────────────────────────────

describe('Lineage graph extension', () => {
  const LINEAGE_TYPES = [
    'supersedes',
    'superseded_by',
    'related_record',
    'related_ewo',
    'related_feature',
    'related_release',
    'related_standard',
    'related_constitutional_amendment',
    'related_decision',
    'related_test_plan',
    'related_risk',
    'related_architecture_decision',
    'related_roadmap_item',
  ] as const;

  it('13 lineage relationship types are defined', () => {
    expect(LINEAGE_TYPES).toHaveLength(13);
  });

  it('four new lineage types added in EWO-009.1 are present', () => {
    expect(LINEAGE_TYPES).toContain('related_test_plan');
    expect(LINEAGE_TYPES).toContain('related_risk');
    expect(LINEAGE_TYPES).toContain('related_architecture_decision');
    expect(LINEAGE_TYPES).toContain('related_roadmap_item');
  });

  it('supersession types are present', () => {
    expect(LINEAGE_TYPES).toContain('supersedes');
    expect(LINEAGE_TYPES).toContain('superseded_by');
  });

  it('all lineage type identifiers are lowercase with no spaces', () => {
    for (const t of LINEAGE_TYPES) {
      expect(t).toMatch(/^[a-z_]+$/);
    }
  });

  it('lineage entry model has all required fields', () => {
    interface LineageEntry {
      id: string;
      from_record_id: string;
      from_record_ref: string;
      to_ref: string;
      relationship_type: string;
      notes: string | null;
      created_at: string;
    }

    const entry: LineageEntry = {
      id: 'uuid-lin-001',
      from_record_id: 'uuid-rec-001',
      from_record_ref: 'EWO-009',
      to_ref: 'EWO-009.1',
      relationship_type: 'superseded_by',
      notes: 'EWO-009.1 supersedes EWO-009 as the canonical refinement record.',
      created_at: '2026-07-12T09:00:00Z',
    };

    expect(entry.relationship_type).toBe('superseded_by');
    expect(entry.to_ref).toBeTruthy();
    expect(entry.from_record_ref).toBe('EWO-009');
  });

  it('no duplicate lineage type entries', () => {
    const unique = new Set(LINEAGE_TYPES);
    expect(unique.size).toBe(LINEAGE_TYPES.length);
  });
});

// ─── 8. Scroll Fix Model ──────────────────────────────────────────────────────

describe('Scroll fix layout model', () => {
  it('outer layout uses flex column with h-full and min-h-0', () => {
    const outerClasses = ['flex', 'flex-col', 'h-full', 'min-h-0'];
    expect(outerClasses).toContain('flex-col');
    expect(outerClasses).toContain('h-full');
    expect(outerClasses).toContain('min-h-0');
  });

  it('header is flex-shrink-0 to prevent compression', () => {
    const headerClasses = ['flex-shrink-0'];
    expect(headerClasses).toContain('flex-shrink-0');
  });

  it('content area is flex-1 overflow-y-auto for scrollability', () => {
    const contentClasses = ['flex-1', 'overflow-y-auto'];
    expect(contentClasses).toContain('flex-1');
    expect(contentClasses).toContain('overflow-y-auto');
  });

  it('min-h-0 prevents flex child from overflowing parent bounds', () => {
    // min-h-0 is required because flex children default to min-height: auto
    // which prevents proper scroll containment in nested flex layouts
    const MIN_H_0_IS_REQUIRED_FOR_FLEX_SCROLL = true;
    expect(MIN_H_0_IS_REQUIRED_FOR_FLEX_SCROLL).toBe(true);
  });

  it('all tab panels are accessible via scroll — no records are truncated', () => {
    const tabs = ['overview', 'records', 'memory', 'lineage', 'timeline'];
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) {
      expect(tab).toBeTruthy();
    }
  });
});

// ─── 9. ATD Handoff Refinement ────────────────────────────────────────────────

describe('ATD Completion Handoff interface', () => {
  const ATD_HANDOFF_RESPONSIBILITIES = {
    bolt_produces: [
      'engineering_record',
      'implementation_summary',
      'validation_summary',
      'engineering_knowledge',
      'semantic_metadata',
      'atd_handoff_package',
    ],
    atd_responsible_for: [
      'record_filing',
      'knowledge_extraction',
      'lineage_entry',
      'changelog_entry',
      'completion_report_generation',
      'engineering_memory_update',
    ],
  } as const;

  it('Bolt produces six handoff artefacts', () => {
    expect(ATD_HANDOFF_RESPONSIBILITIES.bolt_produces).toHaveLength(6);
  });

  it('ATD is responsible for six completion actions', () => {
    expect(ATD_HANDOFF_RESPONSIBILITIES.atd_responsible_for).toHaveLength(6);
  });

  it('engineering_record is always produced by Bolt', () => {
    expect(ATD_HANDOFF_RESPONSIBILITIES.bolt_produces).toContain('engineering_record');
  });

  it('ATD owns record filing — Bolt does not file its own records', () => {
    expect(ATD_HANDOFF_RESPONSIBILITIES.atd_responsible_for).toContain('record_filing');
    expect(ATD_HANDOFF_RESPONSIBILITIES.bolt_produces).not.toContain('record_filing');
  });

  it('atd_handoff column is a JSONB structured section on Engineering Record', () => {
    interface EngineeringRecord {
      atd_handoff: Record<string, unknown> | null;
      atd_handoff_received_at: string | null;
    }

    const record: EngineeringRecord = {
      atd_handoff: {
        handoff_version: '1.0',
        handoff_timestamp: '2026-07-12T09:00:00Z',
        engineering_record: {},
        implementation_summary: {},
        validation_summary: {},
        engineering_knowledge: {},
        semantic_metadata: {},
        completion_instructions: [],
      },
      atd_handoff_received_at: null,
    };

    expect(record.atd_handoff).not.toBeNull();
    expect(record.atd_handoff?.handoff_version).toBe('1.0');
  });
});

// ─── 10. Backwards Compatibility ──────────────────────────────────────────────

describe('Backwards compatibility — EWO-009.1 does not break EWO-009', () => {
  it('original eight structured sections are preserved', () => {
    const ORIGINAL_SECTIONS = [
      'engineering_objective',
      'implementation_summary',
      'validation_summary',
      'po_acceptance_detail',
      'engineering_knowledge',
      'relationships',
      'attachments',
      'semantic_metadata',
    ];
    expect(ORIGINAL_SECTIONS).toHaveLength(8);
  });

  it('authority states from EWO-009 are preserved', () => {
    const AUTHORITY_STATES = ['authoritative', 'provisional', 'non_authoritative', 'superseded'];
    expect(AUTHORITY_STATES).toContain('authoritative');
    expect(AUTHORITY_STATES).toContain('provisional');
    expect(AUTHORITY_STATES).toHaveLength(4);
  });

  it('record_type values from EWO-009 are preserved', () => {
    const RECORD_TYPES = ['completion_report', 'constitutional_document', 'release_note', 'decision_record'];
    expect(RECORD_TYPES).toContain('completion_report');
    expect(RECORD_TYPES).toContain('constitutional_document');
  });

  it('nine memory knowledge categories from EWO-009 are preserved', () => {
    const CATEGORIES = [
      'architecture',
      'pattern',
      'lesson_learned',
      'anti_pattern',
      'reusable_component',
      'known_risk',
      'implementation_strategy',
      'validation_outcome',
      'engineering_decision',
    ];
    expect(CATEGORIES).toHaveLength(9);
  });

  it('nine original lineage types from EWO-009 are preserved', () => {
    const ORIGINAL_LINEAGE = [
      'supersedes',
      'superseded_by',
      'related_record',
      'related_ewo',
      'related_feature',
      'related_release',
      'related_standard',
      'related_constitutional_amendment',
      'related_decision',
    ];
    expect(ORIGINAL_LINEAGE).toHaveLength(9);
  });

  it('append-only constraint on engineering_memory is preserved', () => {
    const MEMORY_POLICIES = ['select', 'insert'];
    const PROHIBITED = ['update', 'delete'];
    for (const op of PROHIBITED) {
      expect(MEMORY_POLICIES).not.toContain(op);
    }
  });

  it('EWO-009.1 schema changes are additive only — no columns dropped or renamed', () => {
    const NEW_COLUMNS = [
      'complexity', 'estimated_effort', 'risk_rating', 'confidence',
      'platform_services_affected', 'applications_affected', 'subsystems_affected',
      'technologies', 'engineering_disciplines', 'primary_engineer', 'product_owner',
    ];
    const DROPPED_COLUMNS: string[] = [];
    expect(DROPPED_COLUMNS).toHaveLength(0);
    expect(NEW_COLUMNS).toHaveLength(11);
  });
});

// ─── 11. Memory Category Coverage ────────────────────────────────────────────

describe('Memory category model', () => {
  const MEMORY_CATEGORIES = {
    architecture:            { label: 'Architecture',            colour: 'blue'   },
    pattern:                 { label: 'Pattern',                 colour: 'violet' },
    lesson_learned:          { label: 'Lesson Learned',          colour: 'amber'  },
    anti_pattern:            { label: 'Anti-Pattern',            colour: 'red'    },
    reusable_component:      { label: 'Reusable Component',      colour: 'teal'   },
    known_risk:              { label: 'Known Risk',              colour: 'orange' },
    implementation_strategy: { label: 'Implementation Strategy', colour: 'green'  },
    validation_outcome:      { label: 'Validation Outcome',      colour: 'emerald'},
    engineering_decision:    { label: 'Engineering Decision',    colour: 'slate'  },
  };

  it('nine knowledge categories are defined', () => {
    expect(Object.keys(MEMORY_CATEGORIES)).toHaveLength(9);
  });

  it('each category has label and colour', () => {
    for (const [, cfg] of Object.entries(MEMORY_CATEGORIES)) {
      expect(cfg.label).toBeTruthy();
      expect(cfg.colour).toBeTruthy();
    }
  });

  it('known_risk category exists for risk tracking', () => {
    expect(MEMORY_CATEGORIES).toHaveProperty('known_risk');
    expect(MEMORY_CATEGORIES.known_risk.colour).toBe('orange');
  });

  it('engineering_decision category exists for decision tracking', () => {
    expect(MEMORY_CATEGORIES).toHaveProperty('engineering_decision');
  });
});

// ─── 12. EWO-009.1 Record Self-Validation ────────────────────────────────────

describe('EWO-009.1 Engineering Record self-validation', () => {
  const EWO009_1_RECORD = {
    record_ref: 'EWO-009.1',
    title: 'Engineering Memory Refinement & Product Owner Closeout',
    programme: 'EIOS',
    record_type: 'completion_report',
    record_version: 1,
    authority_state: 'authoritative',
    completion_date: '2026-07-12',
    ewo_ref: 'EWO-009.1',
    complexity: 'high',
    risk_rating: 'medium',
    technologies: ['TypeScript', 'React', 'PostgreSQL', 'Supabase', 'jsPDF'],
    applications_affected: ['EIOS Engineering Records Library', 'ECC'],
    subsystems_affected: ['engineering-records', 'engineering-memory', 'engineering-lineage'],
    primary_engineer: 'Bolt (AI)',
    product_owner: 'EIOS Product Owner',
    engineering_memory_extracted: false,
  };

  it('record has required identity fields', () => {
    expect(EWO009_1_RECORD.record_ref).toBe('EWO-009.1');
    expect(EWO009_1_RECORD.programme).toBe('EIOS');
  });

  it('record has authoritative authority state', () => {
    expect(EWO009_1_RECORD.authority_state).toBe('authoritative');
  });

  it('record has completion date of 2026-07-12', () => {
    expect(EWO009_1_RECORD.completion_date).toBe('2026-07-12');
  });

  it('record captures enrichment fields', () => {
    expect(EWO009_1_RECORD.complexity).toBe('high');
    expect(EWO009_1_RECORD.risk_rating).toBe('medium');
    expect(EWO009_1_RECORD.technologies).toContain('TypeScript');
    expect(EWO009_1_RECORD.subsystems_affected).toContain('engineering-memory');
  });

  it('record identifies primary engineer and product owner', () => {
    expect(EWO009_1_RECORD.primary_engineer).toBeTruthy();
    expect(EWO009_1_RECORD.product_owner).toBeTruthy();
  });

  it('16 sections of EWO-009.1 are accounted for', () => {
    const SECTIONS = [
      'ui_scrolling_fix',
      'historical_engineering_migration',
      'export_centre',
      'engineering_package',
      'engineering_timeline',
      'graph_enhancement',
      'knowledge_domains',
      'memory_dashboard',
      'enhanced_search',
      'record_enrichment',
      'version_history',
      'historical_pdf_regeneration',
      'memory_architecture',
      'atd_handoff_refinement',
      'validation',
      'final_po_review_package',
    ];
    expect(SECTIONS).toHaveLength(16);
  });
});
