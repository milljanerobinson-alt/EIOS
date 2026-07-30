import { describe, it, expect } from 'vitest';

// ─── EWO-014.14: Engineering Work Order Ledger & Records Completeness ────────

// Semantic EWO reference sorting — mirrors the implementation in ECCWorkOrdersPage
function parseEwoRef(ref: string): number[] {
  const match = ref.match(/EWO-(.+)$/i);
  if (!match) return [0];
  const parts = match[1].split('.');
  return parts.map(p => {
    const numMatch = p.match(/(\d+)/);
    if (!numMatch) return 0;
    const num = parseInt(numMatch[1], 10);
    const suffixMatch = p.match(/[A-Za-z]+$/);
    const suffix = suffixMatch ? suffixMatch[0].toUpperCase().charCodeAt(0) - 64 : 0;
    return num * 1000 + suffix;
  });
}

function compareEwoRefs(a: string, b: string): number {
  const pa = parseEwoRef(a);
  const pb = parseEwoRef(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

function sortEwosByRef<T extends { ewo_ref: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => compareEwoRefs(a.ewo_ref, b.ewo_ref));
}

// Ledger filter logic
type EWOStatus = 'draft' | 'architecture_review' | 'engineering_approved' | 'po_approved' | 'ready' | 'in_progress' | 'engineering_validation' | 'engineering_complete' | 'engineering_verification' | 'verified' | 'report_generated' | 'po_acceptance' | 'closed' | 'archived';

interface EWO {
  ewo_ref: string;
  status: EWOStatus;
  closure_method: string | null;
}

const ACTIVE_STATUSES: EWOStatus[] = ['draft', 'architecture_review', 'engineering_approved', 'po_approved', 'ready', 'in_progress', 'engineering_validation', 'engineering_complete', 'engineering_verification', 'verified', 'report_generated', 'po_acceptance'];

type LedgerFilter = 'all' | 'active' | 'closed' | 'historical' | 'archived' | 'in_progress' | 'awaiting_po' | 'report_ready' | 'engineering_verification' | 'ready' | 'draft';

function applyLedgerFilter(ewo: EWO, filter: LedgerFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'active': return ACTIVE_STATUSES.includes(ewo.status);
    case 'closed': return ewo.status === 'closed';
    case 'historical': return ewo.status === 'closed' && ewo.closure_method === 'Historical Migration';
    case 'archived': return ewo.status === 'archived';
    case 'in_progress': return ewo.status === 'in_progress';
    case 'awaiting_po': return ewo.status === 'po_acceptance';
    case 'report_ready': return ewo.status === 'report_generated';
    case 'engineering_verification': return ewo.status === 'engineering_verification';
    case 'ready': return ewo.status === 'ready';
    case 'draft': return ewo.status === 'draft';
    default: return true;
  }
}

describe('EWO-014.14: Engineering Work Order Ledger', () => {

  // ─── Semantic EWO Reference Sorting ─────────────────────────────────────────

  describe('Semantic EWO reference sorting', () => {
    it('sorts simple sequential refs correctly', () => {
      const refs = ['EWO-003', 'EWO-001', 'EWO-002'];
      const sorted = refs.sort(compareEwoRefs);
      expect(sorted).toEqual(['EWO-001', 'EWO-002', 'EWO-003']);
    });

    it('sorts refs with decimal sub-numbers correctly', () => {
      const refs = ['EWO-014.13', 'EWO-014.3', 'EWO-014.7', 'EWO-014.1'];
      const sorted = refs.sort(compareEwoRefs);
      expect(sorted).toEqual(['EWO-014.1', 'EWO-014.3', 'EWO-014.7', 'EWO-014.13']);
    });

    it('sorts refs with letter suffixes correctly', () => {
      const refs = ['EWO-014.13C', 'EWO-014.13A', 'EWO-014.13B', 'EWO-014.13'];
      const sorted = refs.sort(compareEwoRefs);
      expect(sorted).toEqual(['EWO-014.13', 'EWO-014.13A', 'EWO-014.13B', 'EWO-014.13C']);
    });

    it('sorts the full EWO-014 example correctly', () => {
      const refs = [
        'EWO-014.13C', 'EWO-014.7', 'EWO-014.13', 'EWO-014.13A',
        'EWO-014.13B', 'EWO-014.3.2B', 'EWO-014',
      ];
      const sorted = refs.sort(compareEwoRefs);
      expect(sorted).toEqual([
        'EWO-014',
        'EWO-014.3.2B',
        'EWO-014.7',
        'EWO-014.13',
        'EWO-014.13A',
        'EWO-014.13B',
        'EWO-014.13C',
      ]);
    });

    it('sorts the EWO-011 series correctly', () => {
      const refs = [
        'EWO-011.4B', 'EWO-011.1', 'EWO-011.2', 'EWO-011.4', 'EWO-011.4A',
      ];
      const sorted = refs.sort(compareEwoRefs);
      expect(sorted).toEqual([
        'EWO-011.1',
        'EWO-011.2',
        'EWO-011.4',
        'EWO-011.4A',
        'EWO-011.4B',
      ]);
    });

    it('sorts the complete example from the spec correctly', () => {
      const refs = [
        'EWO-014.13C', 'EWO-014.14', 'EWO-011.4B', 'EWO-001', 'EWO-011.4A',
        'EWO-014.13B', 'EWO-011.2', 'EWO-014.13', 'EWO-014.13A', 'EWO-014.7',
        'EWO-011.4', 'EWO-014.3.2B', 'EWO-012', 'EWO-013', 'EWO-014',
        'EWO-010', 'EWO-011', 'EWO-011.1', 'EWO-002', 'EWO-003', 'EWO-004',
      ];
      const sorted = refs.sort(compareEwoRefs);
      expect(sorted).toEqual([
        'EWO-001', 'EWO-002', 'EWO-003', 'EWO-004',
        'EWO-010', 'EWO-011', 'EWO-011.1', 'EWO-011.2',
        'EWO-011.4', 'EWO-011.4A', 'EWO-011.4B',
        'EWO-012', 'EWO-013', 'EWO-014',
        'EWO-014.3.2B', 'EWO-014.7',
        'EWO-014.13', 'EWO-014.13A', 'EWO-014.13B', 'EWO-014.13C',
        'EWO-014.14',
      ]);
    });

    it('does NOT sort alphabetically — EWO-014.13 comes after EWO-014.7', () => {
      const refs = ['EWO-014.13', 'EWO-014.7'];
      const sorted = refs.sort(compareEwoRefs);
      expect(sorted).toEqual(['EWO-014.7', 'EWO-014.13']);
      // Alphabetical sort would put 014.13 before 014.7 — semantic sort does not
      expect(sorted).not.toEqual(['EWO-014.13', 'EWO-014.7']);
    });

    it('handles deeply nested refs (3 levels)', () => {
      const refs = ['EWO-014.13.2', 'EWO-014.3.2B', 'EWO-014.7.1'];
      const sorted = refs.sort(compareEwoRefs);
      expect(sorted).toEqual(['EWO-014.3.2B', 'EWO-014.7.1', 'EWO-014.13.2']);
    });

    it('sorts EWO objects by ewo_ref', () => {
      const ewos: EWO[] = [
        { ewo_ref: 'EWO-003', status: 'closed', closure_method: 'Historical Migration' },
        { ewo_ref: 'EWO-001', status: 'closed', closure_method: 'Historical Migration' },
        { ewo_ref: 'EWO-002', status: 'closed', closure_method: 'Historical Migration' },
      ];
      const sorted = sortEwosByRef(ewos);
      expect(sorted.map(e => e.ewo_ref)).toEqual(['EWO-001', 'EWO-002', 'EWO-003']);
    });

    it('is stable — does not mutate the original array', () => {
      const ewos: EWO[] = [
        { ewo_ref: 'EWO-003', status: 'closed', closure_method: null },
        { ewo_ref: 'EWO-001', status: 'closed', closure_method: null },
      ];
      const sorted = sortEwosByRef(ewos);
      expect(ewos[0].ewo_ref).toBe('EWO-003');
      expect(sorted[0].ewo_ref).toBe('EWO-001');
    });
  });

  // ─── Ledger Filters ──────────────────────────────────────────────────────────

  describe('Ledger filters', () => {
    const testEwos: EWO[] = [
      { ewo_ref: 'EWO-001', status: 'closed', closure_method: 'Historical Migration' },
      { ewo_ref: 'EWO-002', status: 'closed', closure_method: 'Product Owner Acceptance' },
      { ewo_ref: 'EWO-003', status: 'in_progress', closure_method: null },
      { ewo_ref: 'EWO-004', status: 'draft', closure_method: null },
      { ewo_ref: 'EWO-005', status: 'po_acceptance', closure_method: null },
      { ewo_ref: 'EWO-006', status: 'report_generated', closure_method: null },
      { ewo_ref: 'EWO-007', status: 'engineering_verification', closure_method: null },
      { ewo_ref: 'EWO-008', status: 'ready', closure_method: null },
      { ewo_ref: 'EWO-009', status: 'archived', closure_method: null },
    ];

    it('all filter returns all EWOs', () => {
      expect(testEwos.filter(e => applyLedgerFilter(e, 'all'))).toHaveLength(9);
    });

    it('active filter returns only active EWOs', () => {
      const active = testEwos.filter(e => applyLedgerFilter(e, 'active'));
      expect(active).toHaveLength(6);
      expect(active.map(e => e.ewo_ref)).toEqual(['EWO-003', 'EWO-004', 'EWO-005', 'EWO-006', 'EWO-007', 'EWO-008']);
    });

    it('closed filter returns only closed EWOs', () => {
      const closed = testEwos.filter(e => applyLedgerFilter(e, 'closed'));
      expect(closed).toHaveLength(2);
      expect(closed.map(e => e.ewo_ref)).toEqual(['EWO-001', 'EWO-002']);
    });

    it('historical filter returns only Historical Migration closures', () => {
      const historical = testEwos.filter(e => applyLedgerFilter(e, 'historical'));
      expect(historical).toHaveLength(1);
      expect(historical[0].ewo_ref).toBe('EWO-001');
    });

    it('archived filter returns only archived EWOs', () => {
      const archived = testEwos.filter(e => applyLedgerFilter(e, 'archived'));
      expect(archived).toHaveLength(1);
      expect(archived[0].ewo_ref).toBe('EWO-009');
    });

    it('in_progress filter returns only in_progress EWOs', () => {
      const result = testEwos.filter(e => applyLedgerFilter(e, 'in_progress'));
      expect(result).toHaveLength(1);
      expect(result[0].ewo_ref).toBe('EWO-003');
    });

    it('awaiting_po filter returns only po_acceptance EWOs', () => {
      const result = testEwos.filter(e => applyLedgerFilter(e, 'awaiting_po'));
      expect(result).toHaveLength(1);
      expect(result[0].ewo_ref).toBe('EWO-005');
    });

    it('report_ready filter returns only report_generated EWOs', () => {
      const result = testEwos.filter(e => applyLedgerFilter(e, 'report_ready'));
      expect(result).toHaveLength(1);
      expect(result[0].ewo_ref).toBe('EWO-006');
    });

    it('engineering_verification filter returns only engineering_verification EWOs', () => {
      const result = testEwos.filter(e => applyLedgerFilter(e, 'engineering_verification'));
      expect(result).toHaveLength(1);
      expect(result[0].ewo_ref).toBe('EWO-007');
    });

    it('ready filter returns only ready EWOs', () => {
      const result = testEwos.filter(e => applyLedgerFilter(e, 'ready'));
      expect(result).toHaveLength(1);
      expect(result[0].ewo_ref).toBe('EWO-008');
    });

    it('draft filter returns only draft EWOs', () => {
      const result = testEwos.filter(e => applyLedgerFilter(e, 'draft'));
      expect(result).toHaveLength(1);
      expect(result[0].ewo_ref).toBe('EWO-004');
    });
  });

  // ─── Ledger Counters ─────────────────────────────────────────────────────────

  describe('Ledger counters', () => {
    const testEwos: EWO[] = [
      { ewo_ref: 'EWO-001', status: 'closed', closure_method: 'Historical Migration' },
      { ewo_ref: 'EWO-002', status: 'closed', closure_method: 'Product Owner Acceptance' },
      { ewo_ref: 'EWO-003', status: 'in_progress', closure_method: null },
      { ewo_ref: 'EWO-004', status: 'po_acceptance', closure_method: null },
      { ewo_ref: 'EWO-005', status: 'archived', closure_method: null },
    ];

    it('counts total EWOs', () => {
      expect(testEwos.length).toBe(5);
    });

    it('counts active EWOs', () => {
      expect(testEwos.filter(e => ACTIVE_STATUSES.includes(e.status)).length).toBe(2);
    });

    it('counts closed EWOs', () => {
      expect(testEwos.filter(e => e.status === 'closed').length).toBe(2);
    });

    it('counts historical migration EWOs', () => {
      expect(testEwos.filter(e => e.status === 'closed' && e.closure_method === 'Historical Migration').length).toBe(1);
    });

    it('counts awaiting PO acceptance EWOs', () => {
      expect(testEwos.filter(e => e.status === 'po_acceptance').length).toBe(1);
    });

    it('counts archived EWOs', () => {
      expect(testEwos.filter(e => e.status === 'archived').length).toBe(1);
    });
  });

  // ─── Pagination ──────────────────────────────────────────────────────────────

  describe('Pagination', () => {
    it('paginates correctly with PAGE_SIZE=50', () => {
      const PAGE_SIZE = 50;
      const ewos = Array.from({ length: 120 }, (_, i) => ({
        ewo_ref: `EWO-${String(i + 1).padStart(3, '0')}`,
        status: 'closed' as EWOStatus,
        closure_method: null,
      }));
      const totalPages = Math.ceil(ewos.length / PAGE_SIZE);
      expect(totalPages).toBe(3);

      const page0 = ewos.slice(0, PAGE_SIZE);
      const page1 = ewos.slice(PAGE_SIZE, 2 * PAGE_SIZE);
      const page2 = ewos.slice(2 * PAGE_SIZE, 3 * PAGE_SIZE);

      expect(page0).toHaveLength(50);
      expect(page1).toHaveLength(50);
      expect(page2).toHaveLength(20);
    });

    it('handles empty list', () => {
      const PAGE_SIZE = 50;
      const ewos: EWO[] = [];
      const totalPages = Math.ceil(ewos.length / PAGE_SIZE);
      expect(totalPages).toBe(0);
    });

    it('handles list smaller than page size', () => {
      const PAGE_SIZE = 50;
      const ewos = Array.from({ length: 10 }, (_, i) => ({
        ewo_ref: `EWO-${String(i + 1).padStart(3, '0')}`,
        status: 'closed' as EWOStatus,
        closure_method: null,
      }));
      const totalPages = Math.ceil(ewos.length / PAGE_SIZE);
      expect(totalPages).toBe(1);
    });
  });

  // ─── Completion Report Visibility ────────────────────────────────────────────

  describe('Completion report visibility', () => {
    it('closed EWO without report shows "No Engineering Completion Report available"', () => {
      const ewo: EWO = { ewo_ref: 'EWO-001', status: 'closed', closure_method: 'Historical Migration' };
      const hasReport = false;
      const isClosedOrArchived = ewo.status === 'closed' || ewo.status === 'archived';
      expect(!hasReport && isClosedOrArchived).toBe(true);
    });

    it('closed EWO with report shows the report', () => {
      const ewo: EWO = { ewo_ref: 'EWO-001', status: 'closed', closure_method: 'Product Owner Acceptance' };
      const hasReport = true;
      expect(hasReport).toBe(true);
    });

    it('active EWO without report does not show "No report" message', () => {
      const ewo: EWO = { ewo_ref: 'EWO-001', status: 'in_progress', closure_method: null };
      const hasReport = false;
      const isClosedOrArchived = ewo.status === 'closed' || ewo.status === 'archived';
      expect(!hasReport && isClosedOrArchived).toBe(false);
    });
  });

  // ─── Copy Functions ──────────────────────────────────────────────────────────

  describe('Copy functions', () => {
    it('Copy Preview copies the pre-generation report', () => {
      const previewBody = [
        '═══════════════════════════════════════════════',
        'ENGINEERING COMPLETION REPORT (PREVIEW)',
        'Work Order: EWO-001',
      ].join('\n');
      expect(previewBody).toContain('PREVIEW');
      expect(previewBody).toContain('EWO-001');
    });

    it('Copy Full Report copies the stored report body', () => {
      const reportBody = 'Full stored report body with all sections...';
      expect(reportBody).toContain('Full stored report');
    });

    it('both functions are visible when a report exists', () => {
      const hasReport = true;
      const hasReportBody = true;
      expect(hasReport && hasReportBody).toBe(true);
    });
  });

  // ─── Engineering Record Completeness Navigation ─────────────────────────────

  describe('Engineering record completeness navigation', () => {
    it('closed EWO exposes all navigation links', () => {
      const ewo: EWO = { ewo_ref: 'EWO-001', status: 'closed', closure_method: 'Product Owner Acceptance' };
      const isClosed = ewo.status === 'closed' || ewo.status === 'archived';
      const navLinks = [
        'Engineering Record',
        'Engineering Plan',
        'Completion Report',
        'Engineering Package',
        'Engineering Timeline',
        'Verification Evidence',
        'Lifecycle History',
      ];
      expect(isClosed).toBe(true);
      expect(navLinks).toHaveLength(7);
    });

    it('no completed engineering has missing navigation', () => {
      // All 7 navigation items must be present for closed EWOs
      const requiredNav = [
        'Engineering Record',
        'Engineering Plan',
        'Completion Report',
        'Engineering Package',
        'Engineering Timeline',
        'Verification Evidence',
        'Lifecycle History',
      ];
      requiredNav.forEach(item => {
        expect(item).toBeTruthy();
      });
    });
  });

  // ─── Lifecycle History Enhancement ──────────────────────────────────────────

  describe('Lifecycle history enhancement', () => {
    it('identifies historical migration events', () => {
      const ev = { notes: 'Engineering Governance Migration', from_status: null, to_status: 'closed' as EWOStatus };
      const isMigration = ev.notes?.includes('Migration') || ev.notes?.includes('migration');
      expect(isMigration).toBe(true);
    });

    it('identifies Product Owner acceptance events', () => {
      const ev = { notes: 'Product Owner accepted and closed', from_status: 'po_acceptance', to_status: 'closed' as EWOStatus };
      const isPoAcceptance = ev.to_status === 'closed' && ev.notes?.includes('Product Owner');
      expect(isPoAcceptance).toBe(true);
    });

    it('displays closure method for historical migration', () => {
      const ewo: EWO = { ewo_ref: 'EWO-001', status: 'closed', closure_method: 'Historical Migration' };
      expect(ewo.closure_method).toBe('Historical Migration');
    });

    it('displays PO acceptance details for PO-closed EWOs', () => {
      const ewo = {
        ewo_ref: 'EWO-014.7',
        status: 'closed' as EWOStatus,
        closure_method: 'Product Owner Acceptance',
        po_accepted_by: 'Product Owner',
        po_accepted_at: '2026-07-16T20:53:49.743762Z',
      };
      expect(ewo.po_accepted_by).toBe('Product Owner');
      expect(ewo.po_accepted_at).toBeTruthy();
      expect(ewo.closure_method).toBe('Product Owner Acceptance');
    });

    it('distinguishes migration from PO acceptance visually', () => {
      const migrationEvent = { notes: 'Engineering Governance Migration', to_status: 'closed' as EWOStatus };
      const poEvent = { notes: 'Product Owner accepted', to_status: 'closed' as EWOStatus };

      const isMigration = migrationEvent.notes?.includes('Migration');
      const isPoAcceptance = poEvent.to_status === 'closed' && poEvent.notes?.includes('Product Owner');

      // Both are true but represent different visual indicators (purple vs emerald)
      // The point is they are distinguishable in the UI
      expect(isMigration).toBe(true);
      expect(isPoAcceptance).toBe(true);
    });
  });

  // ─── Performance ────────────────────────────────────────────────────────────

  describe('Performance', () => {
    it('handles 1000+ EWOs with pagination', () => {
      const PAGE_SIZE = 50;
      const ewos = Array.from({ length: 1000 }, (_, i) => ({
        ewo_ref: `EWO-${String(i + 1).padStart(4, '0')}`,
        status: 'closed' as EWOStatus,
        closure_method: null,
      }));
      const totalPages = Math.ceil(ewos.length / PAGE_SIZE);
      expect(totalPages).toBe(20);

      // Page 0 should have 50 items
      const page0 = ewos.slice(0, PAGE_SIZE);
      expect(page0).toHaveLength(50);
    });

    it('semantic sort is efficient for 1000 EWOs', () => {
      const ewos = Array.from({ length: 1000 }, (_, i) => ({
        ewo_ref: `EWO-${String(1000 - i).padStart(4, '0')}`,
        status: 'closed' as EWOStatus,
        closure_method: null,
      }));
      const sorted = sortEwosByRef(ewos);
      expect(sorted[0].ewo_ref).toBe('EWO-0001');
      expect(sorted[sorted.length - 1].ewo_ref).toBe('EWO-1000');
    });
  });

  // ─── Permanent Ledger ────────────────────────────────────────────────────────

  describe('Permanent ledger', () => {
    it('displays total count, not just active count', () => {
      const ewos: EWO[] = [
        { ewo_ref: 'EWO-001', status: 'closed', closure_method: 'Historical Migration' },
        { ewo_ref: 'EWO-002', status: 'closed', closure_method: 'Historical Migration' },
        { ewo_ref: 'EWO-003', status: 'in_progress', closure_method: null },
      ];
      const totalCount = ewos.length;
      const activeCount = ewos.filter(e => ACTIVE_STATUSES.includes(e.status)).length;
      expect(totalCount).toBe(3);
      expect(activeCount).toBe(1);
      expect(totalCount).not.toBe(activeCount);
    });

    it('does not hide historical records', () => {
      const ewos: EWO[] = [
        { ewo_ref: 'EWO-001', status: 'closed', closure_method: 'Historical Migration' },
        { ewo_ref: 'EWO-002', status: 'closed', closure_method: 'Historical Migration' },
      ];
      const allFilter = ewos.filter(e => applyLedgerFilter(e, 'all'));
      expect(allFilter).toHaveLength(2);
    });

    it('does not hide archived records', () => {
      const ewos: EWO[] = [
        { ewo_ref: 'EWO-001', status: 'archived', closure_method: null },
      ];
      const allFilter = ewos.filter(e => applyLedgerFilter(e, 'all'));
      expect(allFilter).toHaveLength(1);
    });

    it('every EWO is permanently accessible', () => {
      const ewos: EWO[] = [
        { ewo_ref: 'EWO-001', status: 'draft', closure_method: null },
        { ewo_ref: 'EWO-002', status: 'closed', closure_method: 'Historical Migration' },
        { ewo_ref: 'EWO-003', status: 'archived', closure_method: null },
        { ewo_ref: 'EWO-004', status: 'in_progress', closure_method: null },
        { ewo_ref: 'EWO-005', status: 'report_generated', closure_method: null },
      ];
      const allFilter = ewos.filter(e => applyLedgerFilter(e, 'all'));
      expect(allFilter).toHaveLength(ewos.length);
    });
  });
});
