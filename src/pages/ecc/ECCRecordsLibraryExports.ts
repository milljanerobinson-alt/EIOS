import jsPDF from 'jspdf';
import type { EngineeringRecord } from './ECCRecordsLibraryTypes';
import { TYPE_CFG } from './ECCRecordsLibraryTypes';

// ─── Shared PDF helpers ───────────────────────────────────────────────────────

function makePdfDoc() {
  return new jsPDF({ unit: 'mm', format: 'a4' });
}

const W = 210, H = 297;

function drawCover(doc: jsPDF, record: EngineeringRecord, subtitle: string) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, H, 'F');
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 0, 6, H, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('ENGINEERING RECORDS — EIOS', 20, 55);
  doc.text(subtitle.toUpperCase(), 20, 62);

  doc.setFontSize(26);
  doc.setTextColor(248, 250, 252);
  doc.text(record.record_ref, 20, 78);

  const titleLines = doc.splitTextToSize(record.title, W - 40);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(titleLines, 20, 92);

  let y = 92 + titleLines.length * 7 + 14;
  const meta: [string, string][] = [
    ['Programme',  record.programme],
    ['Type',       TYPE_CFG[record.record_type]?.label ?? record.record_type],
    ['Authority',  record.authority_state ?? 'provisional'],
    ['Version',    `v${record.record_version}`],
  ];
  if (record.ewo_ref) meta.push(['EWO Reference', record.ewo_ref]);
  if (record.completion_date) meta.push(['Completion Date', record.completion_date]);
  meta.forEach(([lbl, val]) => {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(lbl, 20, y);
    doc.setTextColor(248, 250, 252);
    doc.text(val, 75, y);
    y += 7;
  });

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(7);
  doc.text('DERIVED EXPORT — canonical source: structured Engineering Record (CD-007-R1)', 20, H - 18);
}

type PdfCtx = { doc: jsPDF; y: number };

function addPageIfNeeded(ctx: PdfCtx, needed: number) {
  if (ctx.y + needed > H - 20) { ctx.doc.addPage(); ctx.y = 20; }
}

function drawHeading(ctx: PdfCtx, text: string) {
  addPageIfNeeded(ctx, 14);
  ctx.doc.setFillColor(220, 38, 38);
  ctx.doc.rect(15, ctx.y, 3, 7, 'F');
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(11);
  ctx.doc.setTextColor(15, 23, 42);
  ctx.doc.text(text, 22, ctx.y + 5.5);
  ctx.y += 13;
}

function drawBody(ctx: PdfCtx, text: string) {
  const lines = ctx.doc.splitTextToSize(text, W - 40);
  addPageIfNeeded(ctx, lines.length * 5.5 + 4);
  ctx.doc.setFont('helvetica', 'normal');
  ctx.doc.setFontSize(9);
  ctx.doc.setTextColor(51, 65, 85);
  ctx.doc.text(lines, 20, ctx.y);
  ctx.y += lines.length * 5.5 + 5;
}

function drawKV(ctx: PdfCtx, label: string, value: string) {
  addPageIfNeeded(ctx, 8);
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(8);
  ctx.doc.setTextColor(100, 116, 139);
  ctx.doc.text(label, 20, ctx.y);
  ctx.doc.setFont('helvetica', 'normal');
  ctx.doc.setTextColor(30, 41, 59);
  const vLines = ctx.doc.splitTextToSize(value, W - 80);
  ctx.doc.text(vLines, 70, ctx.y);
  ctx.y += Math.max(vLines.length * 5, 6) + 2;
}

function drawBullets(ctx: PdfCtx, items: string[]) {
  items.forEach(item => {
    const lines = ctx.doc.splitTextToSize(`• ${item}`, W - 44);
    addPageIfNeeded(ctx, lines.length * 5.2 + 2);
    ctx.doc.setFont('helvetica', 'normal');
    ctx.doc.setFontSize(9);
    ctx.doc.setTextColor(51, 65, 85);
    ctx.doc.text(lines, 22, ctx.y);
    ctx.y += lines.length * 5.2 + 2;
  });
  ctx.y += 3;
}

function addPageNumbers(doc: jsPDF, ref: string, version: number) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`${ref}  ·  v${version}  ·  ${i} / ${n}`, W / 2, H - 7, { align: 'center' });
  }
}

// ─── Export: Engineering Completion Report (full PDF) ─────────────────────────

export function exportCompletionReport(record: EngineeringRecord) {
  const doc = makePdfDoc();
  drawCover(doc, record, 'Engineering Completion Report');
  doc.addPage();
  const ctx: PdfCtx = { doc, y: 20 };

  drawHeading(ctx, 'Identity');
  drawKV(ctx, 'Reference', record.record_ref);
  drawKV(ctx, 'Type', TYPE_CFG[record.record_type]?.label ?? record.record_type);
  drawKV(ctx, 'Programme', record.programme);
  drawKV(ctx, 'Authority', record.authority_state ?? 'provisional');
  if (record.ewo_ref) drawKV(ctx, 'EWO Reference', record.ewo_ref);
  if (record.completion_date) drawKV(ctx, 'Completion Date', record.completion_date);
  if (record.source_evidence) drawKV(ctx, 'Source Evidence', record.source_evidence);
  if (record.complexity) drawKV(ctx, 'Complexity', record.complexity);
  if (record.risk_rating) drawKV(ctx, 'Risk Rating', record.risk_rating);
  ctx.y += 4;

  const obj = record.engineering_objective;
  if (obj) {
    drawHeading(ctx, 'Engineering Objective');
    if (obj.original_objective) drawBody(ctx, obj.original_objective);
    if (obj.business_outcome) { drawKV(ctx, 'Business Outcome', obj.business_outcome); }
    if (obj.scope) drawKV(ctx, 'Scope', obj.scope);
  }

  const impl = record.implementation_summary;
  if (impl) {
    drawHeading(ctx, 'Implementation Summary');
    if (impl.executive_summary) drawBody(ctx, impl.executive_summary);
    if (impl.files_created?.length) drawKV(ctx, 'Files Created', impl.files_created.join(', '));
    if (impl.files_modified?.length) drawKV(ctx, 'Files Modified', impl.files_modified.join(', '));
    if (impl.database_changes?.length) { ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(100, 116, 139); ctx.doc.text('Database Changes', 20, ctx.y); ctx.y += 5; drawBullets(ctx, impl.database_changes); }
  }

  const val = record.validation_summary;
  if (val) {
    drawHeading(ctx, 'Validation');
    if (val.build_result) drawKV(ctx, 'Build', val.build_result);
    if (val.test_result) drawKV(ctx, 'Tests', val.test_result);
    if (val.constitutional_validation) drawKV(ctx, 'Constitutional', val.constitutional_validation);
    if (val.known_limitations?.length) { ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(100, 116, 139); ctx.doc.text('Known Limitations', 20, ctx.y); ctx.y += 5; drawBullets(ctx, val.known_limitations); }
  }

  const know = record.engineering_knowledge;
  if (know) {
    drawHeading(ctx, 'Engineering Knowledge');
    if (know.lessons_learned?.length) { ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(100, 116, 139); ctx.doc.text('Lessons Learned', 20, ctx.y); ctx.y += 5; drawBullets(ctx, know.lessons_learned); }
    if (know.architectural_decisions?.length) { ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(100, 116, 139); ctx.doc.text('Architectural Decisions', 20, ctx.y); ctx.y += 5; drawBullets(ctx, know.architectural_decisions); }
    if (know.future_recommendations?.length) { ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(100, 116, 139); ctx.doc.text('Future Recommendations', 20, ctx.y); ctx.y += 5; drawBullets(ctx, know.future_recommendations); }
  }

  if (record.po_accepted_at || record.po_acceptance_statement) {
    drawHeading(ctx, 'Product Owner Acceptance');
    if (record.po_accepted_at) drawKV(ctx, 'Accepted At', new Date(record.po_accepted_at).toLocaleDateString());
    if (record.po_accepted_by) drawKV(ctx, 'Accepted By', record.po_accepted_by);
    if (record.po_acceptance_statement) drawBody(ctx, `"${record.po_acceptance_statement}"`);
  }

  addPageNumbers(doc, record.record_ref, record.record_version);
  doc.save(`${record.record_ref}-v${record.record_version}-completion-report.pdf`);
}

// ─── Export: Executive Summary (single page PDF) ──────────────────────────────

export function exportExecutiveSummary(record: EngineeringRecord) {
  const doc = makePdfDoc();
  drawCover(doc, record, 'Executive Summary');
  doc.addPage();
  const ctx: PdfCtx = { doc, y: 20 };

  drawHeading(ctx, 'Executive Summary');
  const summary = record.implementation_summary?.executive_summary
    ?? (record.content?.executive_summary as string | undefined)
    ?? 'No executive summary recorded for this Engineering Record.';
  drawBody(ctx, summary);

  if (record.engineering_objective?.business_outcome) {
    drawHeading(ctx, 'Business Outcome');
    drawBody(ctx, record.engineering_objective.business_outcome);
  }
  if (record.engineering_objective?.scope) {
    drawHeading(ctx, 'Scope');
    drawBody(ctx, record.engineering_objective.scope);
  }
  if (record.validation_summary) {
    drawHeading(ctx, 'Validation Status');
    if (record.validation_summary.build_result) drawKV(ctx, 'Build', record.validation_summary.build_result);
    if (record.validation_summary.test_result) drawKV(ctx, 'Tests', record.validation_summary.test_result);
  }

  addPageNumbers(doc, record.record_ref, record.record_version);
  doc.save(`${record.record_ref}-v${record.record_version}-executive-summary.pdf`);
}

// ─── Export: Technical Report PDF ────────────────────────────────────────────

export function exportTechnicalReport(record: EngineeringRecord) {
  const doc = makePdfDoc();
  drawCover(doc, record, 'Technical Report');
  doc.addPage();
  const ctx: PdfCtx = { doc, y: 20 };

  drawHeading(ctx, 'Technical Identity');
  drawKV(ctx, 'Reference', record.record_ref);
  if (record.technologies?.length) drawKV(ctx, 'Technologies', record.technologies.join(', '));
  if (record.subsystems_affected?.length) drawKV(ctx, 'Subsystems Affected', record.subsystems_affected.join(', '));
  if (record.applications_affected?.length) drawKV(ctx, 'Applications Affected', record.applications_affected.join(', '));
  if (record.complexity) drawKV(ctx, 'Complexity', record.complexity);
  if (record.risk_rating) drawKV(ctx, 'Risk Rating', record.risk_rating);
  if (record.confidence) drawKV(ctx, 'Confidence', record.confidence);
  ctx.y += 4;

  const impl = record.implementation_summary;
  if (impl) {
    drawHeading(ctx, 'Implementation Detail');
    if (impl.files_created?.length) { ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(100, 116, 139); ctx.doc.text('Files Created', 20, ctx.y); ctx.y += 5; drawBullets(ctx, impl.files_created); }
    if (impl.files_modified?.length) { ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(100, 116, 139); ctx.doc.text('Files Modified', 20, ctx.y); ctx.y += 5; drawBullets(ctx, impl.files_modified); }
    if (impl.files_removed?.length) { ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(100, 116, 139); ctx.doc.text('Files Removed', 20, ctx.y); ctx.y += 5; drawBullets(ctx, impl.files_removed); }
    if (impl.database_changes?.length) { ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(100, 116, 139); ctx.doc.text('Database Changes', 20, ctx.y); ctx.y += 5; drawBullets(ctx, impl.database_changes); }
    if (impl.dependencies?.length) { ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(100, 116, 139); ctx.doc.text('Dependencies', 20, ctx.y); ctx.y += 5; drawBullets(ctx, impl.dependencies); }
  }

  const val = record.validation_summary;
  if (val) {
    drawHeading(ctx, 'Validation Results');
    if (val.build_result) drawKV(ctx, 'Build', val.build_result);
    if (val.test_result) drawKV(ctx, 'Tests', val.test_result);
    if (val.guardian_result) drawKV(ctx, 'Guardian', val.guardian_result);
    if (val.constitutional_validation) drawKV(ctx, 'Constitutional', val.constitutional_validation);
    if (val.known_limitations?.length) { ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(100, 116, 139); ctx.doc.text('Known Limitations', 20, ctx.y); ctx.y += 5; drawBullets(ctx, val.known_limitations); }
  }

  addPageNumbers(doc, record.record_ref, record.record_version);
  doc.save(`${record.record_ref}-v${record.record_version}-technical-report.pdf`);
}

// ─── Export: Markdown ─────────────────────────────────────────────────────────

export function exportMarkdown(record: EngineeringRecord) {
  const lines: string[] = [];
  const h = (n: number, t: string) => lines.push(`${'#'.repeat(n)} ${t}\n`);
  const kv = (k: string, v: string) => lines.push(`**${k}:** ${v}  `);
  const bullets = (items: string[]) => items.forEach(i => lines.push(`- ${i}`));
  const br = () => lines.push('');

  h(1, `${record.record_ref} — ${record.title}`);
  br();
  kv('Record Reference', record.record_ref);
  kv('Record Type', TYPE_CFG[record.record_type]?.label ?? record.record_type);
  kv('Programme', record.programme);
  kv('Authority State', record.authority_state ?? 'provisional');
  kv('Version', `v${record.record_version}`);
  if (record.ewo_ref) kv('EWO Reference', record.ewo_ref);
  if (record.completion_date) kv('Completion Date', record.completion_date);
  if (record.complexity) kv('Complexity', record.complexity);
  if (record.risk_rating) kv('Risk Rating', record.risk_rating);
  br();

  const obj = record.engineering_objective;
  if (obj) {
    h(2, 'Engineering Objective');
    if (obj.original_objective) { lines.push(obj.original_objective); br(); }
    if (obj.business_outcome) kv('Business Outcome', obj.business_outcome);
    if (obj.scope) kv('Scope', obj.scope);
    br();
  }

  const impl = record.implementation_summary;
  if (impl) {
    h(2, 'Implementation Summary');
    if (impl.executive_summary) { lines.push(impl.executive_summary); br(); }
    if (impl.files_created?.length) { h(3, 'Files Created'); bullets(impl.files_created); br(); }
    if (impl.files_modified?.length) { h(3, 'Files Modified'); bullets(impl.files_modified); br(); }
    if (impl.database_changes?.length) { h(3, 'Database Changes'); bullets(impl.database_changes); br(); }
  }

  const val = record.validation_summary;
  if (val) {
    h(2, 'Validation');
    if (val.build_result) kv('Build', val.build_result);
    if (val.test_result) kv('Tests', val.test_result);
    if (val.constitutional_validation) kv('Constitutional', val.constitutional_validation);
    if (val.known_limitations?.length) { br(); h(3, 'Known Limitations'); bullets(val.known_limitations); }
    br();
  }

  const know = record.engineering_knowledge;
  if (know) {
    h(2, 'Engineering Knowledge');
    if (know.lessons_learned?.length) { h(3, 'Lessons Learned'); bullets(know.lessons_learned); br(); }
    if (know.architectural_decisions?.length) { h(3, 'Architectural Decisions'); bullets(know.architectural_decisions); br(); }
    if (know.future_recommendations?.length) { h(3, 'Future Recommendations'); bullets(know.future_recommendations); br(); }
  }

  const meta = record.semantic_metadata;
  if (meta) {
    h(2, 'Semantic Metadata');
    if (meta.keywords?.length) kv('Keywords', meta.keywords.join(', '));
    if (meta.engineering_domains?.length) kv('Engineering Domains', meta.engineering_domains.join(', '));
    if (meta.subsystems?.length) kv('Subsystems', meta.subsystems.join(', '));
    br();
  }

  lines.push('---');
  lines.push('> **DERIVED EXPORT** — The structured Engineering Record is the canonical source of truth.');
  lines.push('> This Markdown export is generated from the canonical record. (CD-007-R1)');

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${record.record_ref}-v${record.record_version}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Export: JSON ─────────────────────────────────────────────────────────────

export function exportJson(record: EngineeringRecord) {
  const payload = {
    _meta: {
      export_type: 'engineering_record_json',
      generated_at: new Date().toISOString(),
      canonical_source: 'engineering_records_library',
      note: 'DERIVED EXPORT — this JSON is generated from the canonical Engineering Record. (CD-007-R1)',
    },
    ...record,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${record.record_ref}-v${record.record_version}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Export: Engineering Package (JSON manifest) ──────────────────────────────

export function exportEngineeringPackage(record: EngineeringRecord) {
  const manifest = {
    package_type: 'engineering_package',
    package_version: '1.0',
    generated_at: new Date().toISOString(),
    manifest: {
      record_ref: record.record_ref,
      record_version: record.record_version,
      title: record.title,
      authority_state: record.authority_state,
      ewo_ref: record.ewo_ref,
      completion_date: record.completion_date,
    },
    contents: [
      { item: 'engineering_record', format: 'json', included: true },
      { item: 'engineering_completion_report', format: 'pdf', included: false, note: 'Generate via PDF export' },
      { item: 'validation_summary', format: 'json', included: true },
      { item: 'engineering_knowledge', format: 'json', included: true },
      { item: 'semantic_metadata', format: 'json', included: true },
      { item: 'relationships', format: 'json', included: true },
    ],
    engineering_record: record,
    validation_summary: record.validation_summary ?? {},
    engineering_knowledge: record.engineering_knowledge ?? {},
    semantic_metadata: record.semantic_metadata ?? {},
    relationships: record.relationships ?? {},
    canonical_note: 'DERIVED EXPORT — structured Engineering Record is canonical. (CD-007-R1)',
    future_note: 'Full ZIP packaging (including PDF, build logs, attachments) is planned for a future EWO.',
  };

  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${record.record_ref}-v${record.record_version}-package.json`;
  a.click();
  URL.revokeObjectURL(url);
}
