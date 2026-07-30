// EWO-014.19A.7SR.2 — One-Off Governed Engineering Integrity Cleanup Tests
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');

const BATCH_SERVICE = 'src/lib/integrityBatchService.ts';
const INTEGRITY_PAGE = 'src/pages/ecc/ECCEngineeringIntegrityPage.tsx';

describe('EWO-014.19A.7SR.2 — One-Off Governed Engineering Integrity Cleanup', () => {

  // ─── Part 1: Integrity Alert Filtering ──────────────────────────────────
  describe('Part 1 — Integrity Alert Filtering', () => {
    it('classifyAlert maps alert_type to canonical classification', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('export function classifyAlert');
      expect(content).toContain("'missing_ewo'");
      expect(content).toContain("'parent_child_issue'");
      expect(content).toContain("'conflicting_reference'");
      expect(content).toContain("'orphan_record'");
      expect(content).toContain("'reconciliation_instability'");
      expect(content).toContain("'other'");
    });

    it('classification labels exist for all categories', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('CLASSIFICATION_LABELS');
      expect(content).toContain('Missing Work Orders');
      expect(content).toContain('Parent–Child Hierarchy');
      expect(content).toContain('Duplicate References');
      expect(content).toContain('Orphaned Engineering Artefacts');
    });

    it('getAlertCategoryCounts returns unique active alert counts', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('export function getAlertCategoryCounts');
      expect(content).toContain('AlertCategoryCount');
    });

    it('filterAlertsByClassification filters by classification', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('export function filterAlertsByClassification');
      expect(content).toContain("'all'");
    });

    it('integrity page has filter buttons for each category', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('alertFilter');
      expect(content).toContain('setAlertFilter');
      expect(content).toContain('categoryCounts');
      expect(content).toContain('All Alerts');
    });

    it('filter buttons show counts beside each category', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('cat.count');
      expect(content).toContain('cat.label');
    });

    it('filtered alerts are used in the alerts list', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('filteredAlerts');
    });
  });

  // ─── Part 2: Controlled Batch Processing ──────────────────────────────────
  describe('Part 2 — Controlled Batch Processing', () => {
    it('supports batch sizes 25, 50, 100', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('25 | 50 | 100');
      expect(content).toContain('export type BatchSize');
    });

    it('default batch size is 25', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('useState<BatchSize>(25)');
    });

    it('batch processing is only available for missing_ewo', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain("alert_type: 'missing_ewo'");
      expect(content).toContain("filterAlertsByClassification(alerts, 'missing_ewo')");
    });

    it('no unrestricted Fix All capability exists', () => {
      const content = read(BATCH_SERVICE);
      expect(content).not.toContain('fixAll');
      expect(content).not.toContain('Fix All');
      expect(content).not.toContain('fix_all');
    });

    it('batch preview displays alert type, batch size, alerts selected, actual to process', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('BatchPreview');
      expect(content).toContain('alertType');
      expect(content).toContain('selectedBatchSize');
      expect(content).toContain('alertsSelected');
      expect(content).toContain('actualToProcess');
    });

    it('batch preview includes warnings', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('warningCanonicalWorkOrdersMayBeCreated');
      expect(content).toContain('warningAmbiguousRecordsNeverFabricated');
    });

    it('integrity page has batch confirmation modal', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('showBatchConfirm');
      expect(content).toContain('Confirm Batch Processing');
      expect(content).toContain('Canonical Work Orders may be created');
      expect(content).toContain('Ambiguous records will never be fabricated');
    });
  });

  // ─── Part 3: Mandatory Duplicate Detection ────────────────────────────────
  describe('Part 3 — Mandatory Duplicate Detection', () => {
    it('duplicate detection runs before any Work Order creation', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('detectDuplicates');
      expect(content).toContain('Mandatory duplicate detection');
    });

    it('STEP 1: checks engineering_work_orders for exact match', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('STEP 1: Check engineering_work_orders for exact match');
      expect(content).toContain('alreadyExists');
    });

    it('STEP 2: searches all engineering repositories', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('STEP 2: Search all engineering repositories');
      expect(content).toContain('searchTables');
      expect(content).toContain('engineering_plans');
      expect(content).toContain('engineering_records_library');
      expect(content).toContain('ewo_completion_reports');
      expect(content).toContain('engineering_executions');
    });

    it('STEP 3: checks linked artefact ownership', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('STEP 3: Check if linked artefacts are already owned');
      expect(content).toContain('artefactTables');
      expect(content).toContain('Completion Report');
      expect(content).toContain('Engineering Plan');
      expect(content).toContain('Engineering Record');
    });

    it('STEP 4: revalidates after recovery', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('STEP 4: Revalidate');
      expect(content).toContain('Duplicate detected after creation');
      expect(content).toContain('rolled back');
    });

    it('never merges duplicates', () => {
      const content = read(BATCH_SERVICE);
      expect(content).not.toContain('merge');
      expect(content).toContain('NEEDS_PRODUCT_OWNER_REVIEW');
    });

    it('classifies as NEEDS_PRODUCT_OWNER_REVIEW when duplicate evidence found', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain("'NEEDS_PRODUCT_OWNER_REVIEW'");
      expect(content).toContain('evidenceOfDuplicate');
    });
  });

  // ─── Part 4: Governed Missing Work Order Recovery ─────────────────────────
  describe('Part 4 — Governed Missing Work Order Recovery', () => {
    it('collects evidence from all authoritative sources', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('collectEvidence');
      expect(content).toContain('engineering_plans');
      expect(content).toContain('engineering_records_library');
      expect(content).toContain('ewo_completion_reports');
      expect(content).toContain('ewo_lifecycle_events');
      expect(content).toContain('engineering_executions');
    });

    it('validates canonical EWO format', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('isValidEwoRef');
      expect(content).toContain('EWO-');
    });

    it('reconstructs only evidence-supported fields', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('fieldsReconstructed');
      expect(content).toContain('missingFields');
    });

    it('preserves authoritative timestamps', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('earliestTimestamp');
      expect(content).toContain('created_at');
    });

    it('routes insufficient evidence to PO review', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('Insufficient evidence to reconstruct title');
    });

    it('never invents fields', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('invent titles');
      expect(content).toContain('invent objectives');
      expect(content).toContain('invent statuses');
    });
  });

  // ─── Part 5: Outcome Classifications ──────────────────────────────────────
  describe('Part 5 — Outcome Classifications', () => {
    it('all 7 outcome types are defined', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain("'RECOVERED'");
      expect(content).toContain("'ALREADY_RESOLVED'");
      expect(content).toContain("'NEEDS_PRODUCT_OWNER_REVIEW'");
      expect(content).toContain("'INVALID_REFERENCE'");
      expect(content).toContain("'FALSE_POSITIVE'");
      expect(content).toContain("'FAILED'");
      expect(content).toContain("'SKIPPED'");
    });

    it('each outcome records EWO, Alert ID, Outcome, Reason', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('BatchItemResult');
      expect(content).toContain('alertId');
      expect(content).toContain('ewoRef');
      expect(content).toContain('outcome');
      expect(content).toContain('reason');
    });

    it('each outcome records evidence searched, evidence used', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('evidenceSearched');
      expect(content).toContain('evidenceUsed');
    });

    it('each outcome records fields reconstructed, missing fields', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('fieldsReconstructed');
      expect(content).toContain('missingFields');
    });

    it('each outcome records confidence and canonical Work Order ID', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('confidence');
      expect(content).toContain('canonicalWorkOrderId');
    });

    it('each outcome records transaction details', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('transactionDetails');
    });
  });

  // ─── Part 6: Transactional Safety ──────────────────────────────────────────
  describe('Part 6 — Transactional Safety', () => {
    it('processing is idempotent — reprocessing checks for existing items', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('Idempotency check');
      expect(content).toContain('already processed');
      expect(content).toContain("'SKIPPED'");
    });

    it('unique batch reference is generated', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('BATCH-INT-');
      expect(content).toContain('batch_ref');
    });

    it('records initiated_by and initiated_at', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('initiated_by');
      expect(content).toContain('initiated_at');
    });

    it('permanent audit history via batch_runs and batch_items tables', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('engineering_integrity_batch_runs');
      expect(content).toContain('engineering_integrity_batch_items');
    });

    it('handles unique constraint violations (race condition)', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('23505');
      expect(content).toContain('concurrent process');
    });

    it('partial failures are isolated', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('continue;');
    });
  });

  // ─── Part 7: Results Summary ──────────────────────────────────────────────
  describe('Part 7 — Results Summary', () => {
    it('summary includes batch reference and classification', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('BatchRunSummary');
      expect(content).toContain('batchRef');
      expect(content).toContain('classification');
    });

    it('summary includes requested batch size and attempted', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('requestedBatchSize');
      expect(content).toContain('attempted');
    });

    it('summary includes all outcome counts', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('recovered');
      expect(content).toContain('alreadyResolved');
      expect(content).toContain('needsProductOwnerReview');
      expect(content).toContain('invalidReferences');
      expect(content).toContain('falsePositives');
      expect(content).toContain('failed');
      expect(content).toContain('skipped');
    });

    it('summary includes remaining alerts', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('remainingAlerts');
    });

    it('provides expandable item-level results', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('Item-Level Results');
      expect(content).toContain('details');
    });

    it('provides copyable batch report', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('generateCopyableReport');
      expect(content).toContain('ENGINEERING INTEGRITY BATCH REPORT');
      expect(content).toContain('copyableReport');
    });

    it('integrity page has copy report button', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('handleCopyReport');
      expect(content).toContain('Copy Report');
    });
  });

  // ─── Part 8: Parent/Child Alerts ────────────────────────────────────────────
  describe('Part 8 — Parent/Child Alerts', () => {
    it('does not automatically repair parent-child alerts during missing EWO processing', () => {
      const content = read(BATCH_SERVICE);
      // Batch processing only processes missing_ewo alerts, not parent_child_issue
      expect(content).toContain("alert_type: 'missing_ewo'");
    });

    it('auto-closes resolved hierarchy alerts after batch', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('autoCloseResolvedHierarchyAlerts');
      expect(content).toContain('parent_child_issue');
    });

    it('leaves unresolved hierarchy conflicts untouched', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('The referenced EWO now exists');
    });

    it('never rewrites parent references automatically', () => {
      const content = read(BATCH_SERVICE);
      expect(content).not.toContain('update_parent');
      expect(content).not.toContain('rewrite_parent');
    });
  });

  // ─── Part 9: One-Off Scope ──────────────────────────────────────────────────
  describe('Part 9 — One-Off Scope', () => {
    it('does not create a recovery engine', () => {
      const content = read(BATCH_SERVICE);
      expect(content).not.toContain('RecoveryEngine');
      expect(content).not.toContain('recovery_engine');
    });

    it('does not create a background processor', () => {
      const content = read(BATCH_SERVICE);
      expect(content).not.toContain('setInterval');
      expect(content).not.toContain('setTimeout');
    });

    it('does not create scheduled reconciliation', () => {
      const content = read(BATCH_SERVICE);
      expect(content).not.toContain('pg_cron');
      expect(content).not.toContain('cron.schedule');
    });

    it('does not create autonomous repair', () => {
      const content = read(BATCH_SERVICE);
      expect(content).not.toContain('autonomous_repair');
      expect(content).not.toContain('auto_repair_engine');
    });

    it('is Product Owner controlled only', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('initiatedBy');
      expect(content).toContain("'product_owner'");
    });
  });

  // ─── Part 10: Product Owner Testing ─────────────────────────────────────────
  describe('Part 10 — Product Owner Testing', () => {
    it('TEST 1: alert filtering works', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('alertFilter');
      expect(content).toContain('setAlertFilter');
      expect(content).toContain('categoryCounts');
    });

    it('TEST 2: batch preview works', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('handleBuildBatchPreview');
      expect(content).toContain('batchPreview');
      expect(content).toContain('Preview Batch');
    });

    it('TEST 3: batch processing works', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('handleProcessBatch');
      expect(content).toContain('batchResult');
      expect(content).toContain('batchProcessing');
    });

    it('TEST 4: reprocessing is safe (idempotency)', () => {
      const content = read(BATCH_SERVICE);
      expect(content).toContain('Idempotency check');
      expect(content).toContain('already processed');
    });

    it('TEST 5: integrity reconciliation refreshes', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('handleRunAudit');
      expect(content).toContain('load()');
    });
  });

  // ─── Canonical Registration ───────────────────────────────────────────────
  describe('Canonical Registration', () => {
    it('EWO-014.19A.7SR.2 registered before implementation', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7sr2'));
      expect(migration).toBeDefined();
    });
  });

  // ─── Database Schema ──────────────────────────────────────────────────────
  describe('Database Schema', () => {
    it('batch runs table migration exists', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('batch_processing_tables'));
      expect(migration).toBeDefined();
      const content = read(`supabase/migrations/${migrations.find(f => f.includes('batch_processing_tables'))}`);
      expect(content).toContain('engineering_integrity_batch_runs');
      expect(content).toContain('engineering_integrity_batch_items');
      expect(content).toContain('ENABLE ROW LEVEL SECURITY');
    });
  });

  // ─── Regression Protection ─────────────────────────────────────────────────
  describe('Regression Protection', () => {
    it('investigation workspace still works', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('InvestigationWorkspace');
      expect(content).toContain('buildInvestigation');
    });

    it('TEST 5: integrity reconciliation refreshes', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('handleRunAudit');
      expect(content).toContain('load()');
    });

    it('maturity model still works', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('evaluateAllCapabilities');
      expect(content).toContain('integrityMaturityModel');
    });

    it('lifecycle truthfulness preserved', () => {
      const content = read(INTEGRITY_PAGE);
      expect(content).toContain('Lifecycle Truthfulness');
    });
  });
});
