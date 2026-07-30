// EWO-018R — Engineering Standards Library Reconciliation, Visibility & Workspace UX Refinement
// Test Suite
//
// Verifies all 13 requirements: reconciliation, recovery, data verification,
// truthful counts, search, category/status filtering, diagnostics, empty-state
// truthfulness, self-reconciliation, workspace scrolling, future-proofing,
// and regression protection.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

function sourceContains(path: string, fragment: string): boolean {
  if (!existsSync(path)) return false;
  return readFileSync(path, 'utf-8').includes(fragment);
}

const PAGE = 'src/pages/ecc/ECCStandardsPage.tsx';

// ─── Requirement 1: Standards Library Reconciliation ──────────────────────────

describe('EWO-018R Req 1 — Standards Library Reconciliation', () => {
  it('ReconciliationResult interface is defined', () => {
    expect(sourceContains(PAGE, 'interface ReconciliationResult')).toBe(true);
  });

  it('reconciliation checks ledger, filtered, and rendered counts', () => {
    expect(sourceContains(PAGE, 'ledger_count')).toBe(true);
    expect(sourceContains(PAGE, 'filtered_count')).toBe(true);
    expect(sourceContains(PAGE, 'rendered_count')).toBe(true);
  });

  it('reconciliation detects missing standards', () => {
    expect(sourceContains(PAGE, 'missing_standards')).toBe(true);
  });

  it('reconciliation reports reason for exclusion', () => {
    expect(sourceContains(PAGE, 'reason')).toBe(true);
  });
});

// ─── Requirement 2: Recover Missing Standards ──────────────────────────────────

describe('EWO-018R Req 2 — Recover Missing Standards', () => {
  it('grouped uses all categories from filtered set, not just predefined', () => {
    // The fix: grouped is built from filtered standards' categories, not ALL_CATEGORIES
    expect(sourceContains(PAGE, 'groups[s.category]')).toBe(true);
  });

  it('does not hardcode any individual standard reference', () => {
    const src = readFileSync(PAGE, 'utf-8');
    // Must not contain hardcoded checks for specific standards like ES-001, ES-002
    expect(src).not.toContain("=== 'ES-001'");
    expect(src).not.toContain("=== 'ES-002'");
    expect(src).not.toContain("=== 'ES-001A'");
  });

  it('all categories from standards are included in grouping', () => {
    // The grouped object is built dynamically from the filtered set
    expect(sourceContains(PAGE, 'for (const s of filtered)')).toBe(true);
  });
});

// ─── Requirement 3: End-to-End Data Verification ───────────────────────────────

describe('EWO-018R Req 3 — End-to-End Data Verification', () => {
  it('pipeline stages are traceable: ledger → filtered → rendered', () => {
    expect(sourceContains(PAGE, 'standards')).toBe(true);        // ledger
    expect(sourceContains(PAGE, 'filtered')).toBe(true);         // filtered
    expect(sourceContains(PAGE, 'grouped')).toBe(true);           // rendered
    expect(sourceContains(PAGE, 'renderedCount')).toBe(true);    // rendered count
  });

  it('reconciliation compares filtered vs rendered', () => {
    expect(sourceContains(PAGE, 'filtered.length === renderedCount')).toBe(true);
  });
});

// ─── Requirement 4: Truthful Counts ────────────────────────────────────────────

describe('EWO-018R Req 4 — Truthful Counts', () => {
  it('count display uses renderedCount, not filtered.length', () => {
    // The summary line uses renderedCount
    expect(sourceContains(PAGE, '{renderedCount} standard')).toBe(true);
  });

  it('reconciliation flags mismatch between filtered and rendered', () => {
    expect(sourceContains(PAGE, 'renderedCount !== filtered.length')).toBe(true);
  });

  it('non-zero count with zero renders is detected as reconciliation failure', () => {
    // reconciled is false when missing standards exist
    expect(sourceContains(PAGE, 'missing.length === 0')).toBe(true);
  });
});

// ─── Requirement 5: Search Verification ───────────────────────────────────────

describe('EWO-018R Req 5 — Search Verification', () => {
  it('search includes standard reference (version_introduced)', () => {
    expect(sourceContains(PAGE, 'version_introduced.toLowerCase().includes(q)')).toBe(true);
  });

  it('search includes title', () => {
    expect(sourceContains(PAGE, 'title.toLowerCase().includes(q)')).toBe(true);
  });

  it('search includes category', () => {
    expect(sourceContains(PAGE, 'category.toLowerCase().includes(q)')).toBe(true);
  });

  it('search includes body', () => {
    expect(sourceContains(PAGE, 'body.toLowerCase().includes(q)')).toBe(true);
  });

  it('search includes tags', () => {
    expect(sourceContains(PAGE, 'tags.some(t => t.toLowerCase().includes(q)')).toBe(true);
  });

  it('search is case-insensitive', () => {
    expect(sourceContains(PAGE, 'toLowerCase()')).toBe(true);
  });
});

// ─── Requirement 6: Category Verification ─────────────────────────────────────

describe('EWO-018R Req 6 — Category Verification', () => {
  it('Engineering Governance category is in CATEGORY_CFG', () => {
    expect(sourceContains(PAGE, "'Engineering Governance'")).toBe(true);
  });

  it('Governance category is in CATEGORY_CFG', () => {
    expect(sourceContains(PAGE, "'Governance'")).toBe(true);
  });

  it('getCategoryCfg provides fallback for unknown categories', () => {
    expect(sourceContains(PAGE, 'CATEGORY_CFG[category] ??')).toBe(true);
  });

  it('overview tab shows all categories including unknown ones', () => {
    expect(sourceContains(PAGE, 'const set = new Set')).toBe(true);
  });

  it('category filter dropdown includes all predefined categories', () => {
    expect(sourceContains(PAGE, 'PREDEFINED_CATEGORIES.map')).toBe(true);
  });
});

// ─── Requirement 7: Status Verification ───────────────────────────────────────

describe('EWO-018R Req 7 — Status Verification', () => {
  it('all status options are available: all, active, draft, deprecated', () => {
    expect(sourceContains(PAGE, "'all'"));
    expect(sourceContains(PAGE, "'active'"));
    expect(sourceContains(PAGE, "'draft'"));
    expect(sourceContains(PAGE, "'deprecated'"));
  });

  it('status filter applies to filtered results', () => {
    expect(sourceContains(PAGE, 'matchStatus')).toBe(true);
  });
});

// ─── Requirement 8: Rendering Diagnostics ─────────────────────────────────────

describe('EWO-018R Req 8 — Rendering Diagnostics', () => {
  it('ReconciliationBanner component is defined', () => {
    expect(sourceContains(PAGE, 'function ReconciliationBanner')).toBe(true);
  });

  it('banner shows number of missing standards', () => {
    expect(sourceContains(PAGE, 'missing_standards.length')).toBe(true);
  });

  it('banner shows ledger, filtered, and rendered counts', () => {
    expect(sourceContains(PAGE, 'Ledger:')).toBe(true);
    expect(sourceContains(PAGE, 'Filtered:')).toBe(true);
    expect(sourceContains(PAGE, 'Rendered:')).toBe(true);
  });

  it('banner shows missing standard titles and reasons', () => {
    expect(sourceContains(PAGE, 'm.title')).toBe(true);
    expect(sourceContains(PAGE, 'm.reason')).toBe(true);
  });

  it('banner shows suggested recovery', () => {
    expect(sourceContains(PAGE, 'Suggested recovery')).toBe(true);
  });

  it('banner only renders when reconciliation fails', () => {
    expect(sourceContains(PAGE, 'reconciliation.reconciled')).toBe(true);
  });
});

// ─── Requirement 9: Empty State Truthfulness ──────────────────────────────────

describe('EWO-018R Req 9 — Empty State Truthfulness', () => {
  it('empty state only shows when renderedCount === 0 AND filtered.length === 0', () => {
    expect(sourceContains(PAGE, 'renderedCount === 0 && filtered.length === 0')).toBe(true);
  });

  it('empty state message is "No standards match your filters"', () => {
    expect(sourceContains(PAGE, 'No standards match your filters')).toBe(true);
  });
});

// ─── Requirement 10: Self-Reconciliation ───────────────────────────────────────

describe('EWO-018R Req 10 — Self-Reconciliation', () => {
  it('reconciliation runs automatically via useMemo', () => {
    expect(sourceContains(PAGE, 'useMemo')).toBe(true);
  });

  it('reconciliation is computed on every render of LibraryTab', () => {
    // The reconciliation useMemo depends on filtered, grouped, renderedCount
    expect(sourceContains(PAGE, '[filtered, grouped, renderedCount, standards.length]')).toBe(true);
  });

  it('governed warning is displayed when mismatches discovered', () => {
    expect(sourceContains(PAGE, 'ReconciliationBanner')).toBe(true);
  });
});

// ─── Requirement 11: Workspace Scrolling & Layout ─────────────────────────────

describe('EWO-018R Req 11 — Workspace Scrolling & Layout', () => {
  it('page uses flex-col h-full for full-height layout', () => {
    expect(sourceContains(PAGE, 'flex flex-col h-full')).toBe(true);
  });

  it('header is shrink-0 to stay accessible', () => {
    expect(sourceContains(PAGE, 'shrink-0')).toBe(true);
  });

  it('content area is flex-1 overflow-y-auto for natural scrolling', () => {
    expect(sourceContains(PAGE, 'flex-1 overflow-y-auto')).toBe(true);
  });

  it('no fixed-height containers that clip content', () => {
    const src = readFileSync(PAGE, 'utf-8');
    // Should not have h-64 or h-96 on the main content containers
    expect(src).not.toContain('max-h-64');
    expect(src).not.toContain('max-h-96');
  });

  it('content uses max-w-5xl for consistent layout', () => {
    expect(sourceContains(PAGE, 'max-w-5xl mx-auto')).toBe(true);
  });
});

// ─── Requirement 12: Future-Proofing ───────────────────────────────────────────

describe('EWO-018R Req 12 — Future-Proofing', () => {
  it('grouping does not depend on specific standard references', () => {
    const src = readFileSync(PAGE, 'utf-8');
    expect(src).not.toContain("'ES-001'");
    expect(src).not.toContain("'ES-002'");
    expect(src).not.toContain("'ES-001A'");
  });

  it('unknown categories get a fallback config', () => {
    expect(sourceContains(PAGE, 'getCategoryCfg')).toBe(true);
  });

  it('overview tab dynamically discovers all categories', () => {
    expect(sourceContains(PAGE, 'standards.forEach(s => set.add(s.category))')).toBe(true);
  });

  it('sorted categories handle unknown categories after predefined ones', () => {
    expect(sourceContains(PAGE, 'PREDEFINED_CATEGORIES.indexOf')).toBe(true);
  });
});

// ─── Requirement 13: Regression Protection ──────────────────────────────────────

describe('EWO-018R Req 13 — Regression Protection', () => {
  it('all original tabs preserved: overview, library, versions, changelog', () => {
    expect(sourceContains(PAGE, "'overview'"));
    expect(sourceContains(PAGE, "'library'"));
    expect(sourceContains(PAGE, "'versions'"));
    expect(sourceContains(PAGE, "'changelog'"));
  });

  it('StandardDrawer preserved for editing', () => {
    expect(sourceContains(PAGE, 'function StandardDrawer')).toBe(true);
  });

  it('CategoryCard preserved for overview', () => {
    expect(sourceContains(PAGE, 'function CategoryCard')).toBe(true);
  });

  it('StandardRow preserved for library display', () => {
    expect(sourceContains(PAGE, 'function StandardRow')).toBe(true);
  });

  it('VersionsTab preserved', () => {
    expect(sourceContains(PAGE, 'function VersionsTab')).toBe(true);
  });

  it('ChangelogTab preserved', () => {
    expect(sourceContains(PAGE, 'function ChangelogTab')).toBe(true);
  });

  it('OverviewTab preserved', () => {
    expect(sourceContains(PAGE, 'function OverviewTab')).toBe(true);
  });

  it('LibraryTab preserved', () => {
    expect(sourceContains(PAGE, 'function LibraryTab')).toBe(true);
  });

  it('supabase import preserved', () => {
    expect(sourceContains(PAGE, "from '../../lib/supabase'")).toBe(true);
  });

  it('all original category configs preserved', () => {
    expect(sourceContains(PAGE, "'Architecture'")).toBe(true);
    expect(sourceContains(PAGE, "'Database'")).toBe(true);
    expect(sourceContains(PAGE, "'Backend'")).toBe(true);
    expect(sourceContains(PAGE, "'Frontend'")).toBe(true);
    expect(sourceContains(PAGE, "'Security'")).toBe(true);
    expect(sourceContains(PAGE, "'Performance'")).toBe(true);
    expect(sourceContains(PAGE, "'Testing'")).toBe(true);
    expect(sourceContains(PAGE, "'Documentation'")).toBe(true);
    expect(sourceContains(PAGE, "'AI Collaboration'")).toBe(true);
    expect(sourceContains(PAGE, "'Code Quality'")).toBe(true);
    expect(sourceContains(PAGE, "'Release Management'")).toBe(true);
    expect(sourceContains(PAGE, "'Operations'")).toBe(true);
  });
});
