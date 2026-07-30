// EWO-021R.4 — Investigation PDF Renderer (Schema-Driven)
//
// Generates a human-readable, audit-ready PDF that closely mirrors the
// Investigation Workspace. The renderer is schema-driven: it iterates
// over getVisibleSections() from the canonical Investigation Schema and
// uses a renderer map keyed by section ID.
//
// BUG-004 changes:
//   - Governed layout engine replaces coordinate-based positioning
//   - Identity header rendered as a structured metadata grid
//   - Badge groups participate in layout flow (no absolute positioning)
//   - Dynamic row height calculation for all metadata rows
//   - Report body starts after identity block height + margin
//   - All layout primitives return rendered height

import jsPDF from 'jspdf';
import type { InvestigationSchemaData, InvestigationSection } from './investigationSchema';
export type { InvestigationSchemaData } from './investigationSchema';
import { getVisibleSections, getSectionIds } from './investigationSchema';
import { DECISION_LABELS, RELATIONSHIP_LABELS } from './engineeringDecisionService';
import { DOMAIN_LABELS } from './integrityDomainModel';
import { RESOLUTION_STATUS_LABELS } from './engineeringIntelligenceWorkflow';
import { checkExportReadiness, type ExportReadinessResult } from './investigationExportService';
import { buildGovernedResponse } from './governedResponse';

export const RENDERER_VERSION = 'EWO-021R.4';

// ─── Layout Constants ────────────────────────────────────────────────────────

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const MAX_Y = PAGE_HEIGHT - MARGIN;
const SECTION_GAP = 6;
const HEADER_HEIGHT = 20;
const HEADER_BOTTOM_MARGIN = 6;

const FONT = 'helvetica';

const COLOURS = {
  slate50: [248, 250, 252] as const,
  slate100: [241, 245, 249] as const,
  slate200: [226, 232, 240] as const,
  slate300: [203, 213, 225] as const,
  slate400: [148, 163, 184] as const,
  slate500: [100, 116, 139] as const,
  slate600: [71, 85, 105] as const,
  slate700: [51, 65, 85] as const,
  slate800: [30, 41, 59] as const,
  slate900: [15, 23, 42] as const,
  blue50: [239, 246, 255] as const,
  blue200: [191, 219, 254] as const,
  blue500: [59, 130, 246] as const,
  blue600: [37, 99, 235] as const,
  amber50: [255, 251, 235] as const,
  amber200: [252, 211, 77] as const,
  amber500: [245, 158, 11] as const,
  amber700: [180, 83, 9] as const,
  amber800: [146, 64, 14] as const,
  emerald50: [236, 253, 245] as const,
  emerald500: [16, 185, 129] as const,
  emerald600: [5, 150, 105] as const,
  red50: [254, 242, 242] as const,
  red200: [254, 202, 202] as const,
  red500: [239, 68, 68] as const,
  red600: [220, 38, 38] as const,
  white: [255, 255, 255] as const,
};

type Colour = readonly [number, number, number];

// ─── PDF Context ──────────────────────────────────────────────────────────────

interface PDFContext {
  doc: jsPDF;
  y: number;
}

interface CardLine {
  text: string;
  colour?: Colour;
  size?: number;
  style?: string;
}

// ─── Low-Level Helpers ─────────────────────────────────────────────────────────

function newPage(ctx: PDFContext): void {
  ctx.doc.addPage();
  ctx.y = MARGIN;
}

function ensureSpace(ctx: PDFContext, needed: number): void {
  if (ctx.y + needed > MAX_Y) newPage(ctx);
}

function setFont(doc: jsPDF, style: string = 'normal', size: number, font: string = FONT): void {
  doc.setFont(font, style);
  doc.setFontSize(size);
}

function setColour(doc: jsPDF, c: Colour): void {
  doc.setDrawColor(c[0], c[1], c[2]);
  doc.setFillColor(c[0], c[1], c[2]);
  doc.setTextColor(c[0], c[1], c[2]);
}

function drawRect(doc: jsPDF, x: number, y: number, w: number, h: number, fill: Colour, radius: number = 2): void {
  doc.setFillColor(fill[0], fill[1], fill[2]);
  doc.roundedRect(x, y, w, h, radius, radius, 'F');
}

function drawText(doc: jsPDF, text: string, x: number, y: number, colour: Colour = COLOURS.slate700, size: number = 10, style: string = 'normal'): void {
  setColour(doc, colour);
  setFont(doc, style, size);
  doc.text(text, x, y);
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

function getTextWidth(doc: jsPDF, text: string, size: number, style: string = 'normal'): number {
  setFont(doc, style, size);
  return doc.getTextWidth(text);
}

function fmtTimestamp(ts: string | null): string {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

// ─── Governed Layout Engine ────────────────────────────────────────────────────
//
// Layout primitives that participate in the vertical flow. Each primitive
// renders at ctx.y and advances ctx.y by its rendered height. No absolute
// positioning — every block returns its height for downstream consumers.

interface BadgeSpec {
  label: string;
  bg: Colour;
  textColour: Colour;
}

interface MetadataField {
  label: string;
  value: string;
}

/**
 * BadgeGroup: renders badges in a horizontal flow, wrapping to new rows
 * when the content width is exceeded. Returns total rendered height.
 */
function renderBadgeGroup(ctx: PDFContext, badges: BadgeSpec[], x: number, maxWidth: number): number {
  if (badges.length === 0) return 0;

  const badgeGap = 2;
  const badgeHeight = 5;
  const badgePadding = 3;
  const rowGap = 2;
  let totalHeight = 0;
  let currentX = x;
  let rowStartY = ctx.y;

  for (const badge of badges) {
    setFont(ctx.doc, 'bold', 7);
    const badgeW = getTextWidth(ctx.doc, badge.label, 7, 'bold') + badgePadding * 2;

    // Wrap to next row if this badge doesn't fit
    if (currentX + badgeW > x + maxWidth && currentX > x) {
      currentX = x;
      totalHeight += badgeHeight + rowGap;
      rowStartY += badgeHeight + rowGap;
      ensureSpace(ctx, badgeHeight + rowGap);
    }

    ensureSpace(ctx, badgeHeight);

    drawRect(ctx.doc, currentX, rowStartY, badgeW, badgeHeight, badge.bg, 1);
    setColour(ctx.doc, badge.textColour);
    setFont(ctx.doc, 'bold', 7);
    ctx.doc.text(badge.label, currentX + badgePadding, rowStartY + 3.5);

    currentX += badgeW + badgeGap;
  }

  totalHeight += badgeHeight;
  ctx.y = rowStartY + totalHeight;
  return totalHeight;
}

/**
 * MetadataGrid: renders a two-column grid of label/value pairs.
 * Each row calculates its height based on wrapped value text.
 * Returns total rendered height.
 */
function renderMetadataGrid(ctx: PDFContext, fields: MetadataField[], x: number, maxWidth: number): number {
  if (fields.length === 0) return 0;

  const colGap = 6;
  const colWidth = (maxWidth - colGap) / 2;
  const labelSize = 7;
  const valueSize = 9;
  const labelColour = COLOURS.slate400;
  const valueColour = COLOURS.slate700;
  const rowGap = 3;
  const labelValueGap = 1.5;
  let totalHeight = 0;

  for (let i = 0; i < fields.length; i += 2) {
    const leftField = fields[i];
    const rightField = fields[i + 1];

    // Calculate row height: max of left/right field heights
    let leftHeight = 0;
    let rightHeight = 0;

    // Left field
    if (leftField) {
      const leftValueLines = wrapText(ctx.doc, leftField.value, colWidth);
      leftHeight = labelValueGap + leftValueLines.length * 4;
    }

    // Right field
    if (rightField) {
      const rightValueLines = wrapText(ctx.doc, rightField.value, colWidth);
      rightHeight = labelValueGap + rightValueLines.length * 4;
    }

    const rowHeight = Math.max(leftHeight, rightHeight) + rowGap;
    ensureSpace(ctx, rowHeight);

    const rowY = ctx.y;

    // Render left field
    if (leftField) {
      drawText(ctx.doc, leftField.label.toUpperCase(), x, rowY, labelColour, labelSize, 'bold');
      setColour(ctx.doc, valueColour);
      setFont(ctx.doc, 'normal', valueSize);
      const leftValueLines = wrapText(ctx.doc, leftField.value, colWidth);
      let vy = rowY + labelValueGap + 3;
      for (const line of leftValueLines) {
        ctx.doc.text(line, x, vy);
        vy += 4;
      }
    }

    // Render right field
    if (rightField) {
      const rightX = x + colWidth + colGap;
      drawText(ctx.doc, rightField.label.toUpperCase(), rightX, rowY, labelColour, labelSize, 'bold');
      setColour(ctx.doc, valueColour);
      setFont(ctx.doc, 'normal', valueSize);
      const rightValueLines = wrapText(ctx.doc, rightField.value, colWidth);
      let vy = rowY + labelValueGap + 3;
      for (const line of rightValueLines) {
        ctx.doc.text(line, rightX, vy);
        vy += 4;
      }
    }

    ctx.y += rowHeight;
    totalHeight += rowHeight;
  }

  return totalHeight;
}

/**
 * IdentityHeader: renders the complete identity block (title, original ref,
 * timestamp, badges, metadata grid). Returns total rendered height.
 */
function renderIdentityHeader(ctx: PDFContext, data: InvestigationSchemaData): number {
  const startY = ctx.y;
  let height = 0;

  // ─── Title Row ──────────────────────────────────────────────────────────────
  const title = data.evolvedTitle ?? data.alert.title ?? 'Untitled Investigation';
  setColour(ctx.doc, COLOURS.slate900);
  setFont(ctx.doc, 'bold', 13);
  const titleLines = wrapText(ctx.doc, title, CONTENT_WIDTH - 40);
  let titleY = ctx.y + 5;
  for (const line of titleLines) {
    ensureSpace(ctx, 5);
    ctx.doc.text(line, MARGIN, titleY);
    titleY += 5;
    height += 5;
  }

  // Timestamp on the right side of the first title line
  const timestamp = new Date().toLocaleString();
  setColour(ctx.doc, COLOURS.slate400);
  setFont(ctx.doc, 'normal', 8);
  ctx.doc.text(timestamp, PAGE_WIDTH - MARGIN - getTextWidth(ctx.doc, timestamp, 8), startY + 5);

  // Original reference (if different from title)
  if (data.evolvedTitle && data.evolvedTitle !== data.alert.title) {
    ensureSpace(ctx, 4);
    drawText(ctx.doc, `Original: ${data.alert.title}`, MARGIN, ctx.y + height + 3, COLOURS.slate400, 8, 'italic');
    height += 4;
  }

  height += 3;
  ctx.y = startY + height;

  // ─── Badge Row ──────────────────────────────────────────────────────────────
  const badges: BadgeSpec[] = [];

  const sevLevel = (data.alert.severity ?? '') as string;
  if (data.alert.severity) {
    const sevColour = sevLevel === 'critical' ? COLOURS.red500 : sevLevel === 'high' ? COLOURS.amber500 : COLOURS.blue500;
    const sevTextColour = sevLevel === 'critical' ? COLOURS.white : sevLevel === 'high' ? COLOURS.amber800 : COLOURS.white;
    badges.push({ label: data.alert.severity.toUpperCase(), bg: sevColour, textColour: sevTextColour });
  }

  if (data.alert.object_type) {
    badges.push({ label: data.alert.object_type.toUpperCase(), bg: COLOURS.slate200, textColour: COLOURS.slate700 });
  }

  if (data.alert.alert_ref) {
    badges.push({ label: data.alert.alert_ref, bg: COLOURS.blue50, textColour: COLOURS.blue600 });
  }

  if (data.resolutionStatus !== 'detected') {
    const resColour = data.resolutionStatus === 'resolved' ? COLOURS.emerald500 : COLOURS.amber500;
    const resText = data.resolutionStatus === 'resolved' ? COLOURS.white : COLOURS.amber800;
    badges.push({ label: RESOLUTION_STATUS_LABELS[data.resolutionStatus] ?? data.resolutionStatus, bg: resColour, textColour: resText });
  }

  const badgeHeight = renderBadgeGroup(ctx, badges, MARGIN, CONTENT_WIDTH);
  height += badgeHeight + 3;
  ctx.y = startY + height;

  // ─── Metadata Grid ──────────────────────────────────────────────────────────
  const metadataFields: MetadataField[] = [
    { label: 'Alert Reference', value: data.alert.alert_ref ?? data.alert.normalised_reference ?? '—' },
    { label: 'Alert ID', value: data.alert.id },
    { label: 'Alert Type', value: data.alert.alert_type ?? '—' },
    { label: 'Severity', value: data.alert.severity ?? '—' },
    { label: 'Object Type', value: data.alert.object_type?.toUpperCase() ?? '—' },
    { label: 'Detected At', value: fmtTimestamp(data.alert.created_at) },
  ];

  const gridHeight = renderMetadataGrid(ctx, metadataFields, MARGIN, CONTENT_WIDTH);
  height += gridHeight;

  return height;
}

// ─── Section Rendering Helpers ─────────────────────────────────────────────────

function drawSectionHeader(ctx: PDFContext, label: string, count?: number): void {
  ensureSpace(ctx, 14);
  setColour(ctx.doc, COLOURS.slate500);
  setFont(ctx.doc, 'bold', 9);
  const text = count !== undefined ? `${label} (${count})` : label;
  ctx.doc.text(text.toUpperCase(), MARGIN, ctx.y);
  ctx.y += 6;
  setColour(ctx.doc, COLOURS.slate200);
  ctx.doc.setLineWidth(0.3);
  ctx.doc.line(MARGIN, ctx.y, MARGIN + CONTENT_WIDTH, ctx.y);
  ctx.y += 5;
}

function drawWrappedText(ctx: PDFContext, text: string, x: number, maxWidth: number, colour: Colour = COLOURS.slate700, size: number = 10, style: string = 'normal', lineHeight: number = 5): void {
  setColour(ctx.doc, colour);
  setFont(ctx.doc, style, size);
  const lines = wrapText(ctx.doc, text, maxWidth);
  for (const line of lines) {
    ensureSpace(ctx, lineHeight);
    ctx.doc.text(line, x, ctx.y);
    ctx.y += lineHeight;
  }
}

function drawConfidenceBar(ctx: PDFContext, confidence: number, label: string): void {
  ensureSpace(ctx, 12);
  const barWidth = CONTENT_WIDTH * 0.6;
  const barHeight = 3;
  const barX = MARGIN;
  const barY = ctx.y;

  drawRect(ctx.doc, barX, barY, barWidth, barHeight, COLOURS.slate100, 1);
  const fillColour = confidence >= 0.9 ? COLOURS.emerald500 : confidence >= 0.7 ? COLOURS.amber500 : COLOURS.red500;
  const fillWidth = Math.round(barWidth * confidence);
  drawRect(ctx.doc, barX, barY, fillWidth, barHeight, fillColour, 1);

  const textColour = confidence >= 0.9 ? COLOURS.emerald600 : confidence >= 0.7 ? COLOURS.amber700 : COLOURS.red600;
  drawText(ctx.doc, `${label} (${Math.round(confidence * 100)}%)`, barX + barWidth + 5, barY + 3, textColour, 9, 'bold');
  ctx.y += 8;
}

function drawCard(ctx: PDFContext, lines: CardLine[], bg: Colour = COLOURS.slate50, border?: Colour): void {
  const cardX = MARGIN;
  const cardW = CONTENT_WIDTH;
  const lineHeight = 4.5;
  const padding = 3;

  // Pre-calculate height accounting for wrapped lines
  let totalLines = 0;
  for (const line of lines) {
    const size = line.size ?? 9;
    const style = line.style ?? 'normal';
    setFont(ctx.doc, style, size);
    const wrapped = wrapText(ctx.doc, line.text, cardW - padding * 2);
    totalLines += wrapped.length;
  }

  const cardH = totalLines * lineHeight + padding * 2;
  ensureSpace(ctx, cardH + 2);
  const cardY = ctx.y;

  drawRect(ctx.doc, cardX, cardY, cardW, cardH, bg, 1.5);
  if (border) {
    setColour(ctx.doc, border);
    ctx.doc.setLineWidth(0.3);
    ctx.doc.roundedRect(cardX, cardY, cardW, cardH, 1.5, 1.5, 'D');
  }

  let textY = cardY + padding + 3;
  for (const line of lines) {
    const colour = line.colour ?? COLOURS.slate700;
    const size = line.size ?? 9;
    const style = line.style ?? 'normal';
    setColour(ctx.doc, colour);
    setFont(ctx.doc, style, size);
    const wrapped = wrapText(ctx.doc, line.text, cardW - padding * 2);
    for (const w of wrapped) {
      ctx.doc.text(w, cardX + padding, textY);
      textY += lineHeight;
    }
  }

  ctx.y = cardY + cardH + 2;
}

function drawKeyValue(ctx: PDFContext, key: string, value: string, keyColour: Colour = COLOURS.slate400, valueColour: Colour = COLOURS.slate700): void {
  ensureSpace(ctx, 5);
  setColour(ctx.doc, keyColour);
  setFont(ctx.doc, 'normal', 8);
  ctx.doc.text(key, MARGIN, ctx.y);
  setColour(ctx.doc, valueColour);
  setFont(ctx.doc, 'normal', 9);
  const valueLines = wrapText(ctx.doc, value, CONTENT_WIDTH - 35);
  ctx.doc.text(valueLines[0], MARGIN + 35, ctx.y);
  ctx.y += 4.5;
  for (let i = 1; i < valueLines.length; i++) {
    ensureSpace(ctx, 5);
    ctx.doc.text(valueLines[i], MARGIN + 35, ctx.y);
    ctx.y += 4.5;
  }
}

// ─── Section Renderer Map ─────────────────────────────────────────────────────

type SectionRenderer = (ctx: PDFContext, data: InvestigationSchemaData) => void;

const renderers: Record<string, SectionRenderer> = {

  // ─── Identity Header (governed layout) ──────────────────────────────────────
  // The investigation_title and alert_reference sections are rendered together
  // as a single identity header block. The renderers are registered separately
  // but the first (investigation_title) renders the full header and the second
  // (alert_reference) is a no-op since its content is part of the header.

  investigation_title: (ctx, data) => {
    const headerHeight = renderIdentityHeader(ctx, data);
    ctx.y += headerHeight + SECTION_GAP;
  },

  alert_reference: (_ctx, _data) => {
    // No-op: identity metadata is rendered by investigation_title's
    // renderIdentityHeader call. This prevents duplicate rendering.
  },

  executive_summary: (ctx, data) => {
    drawSectionHeader(ctx, 'Executive Summary');
    drawWrappedText(ctx, data.executiveSummary || 'No executive summary available.', MARGIN, CONTENT_WIDTH, COLOURS.slate700, 10, 'normal', 5);
    ctx.y += SECTION_GAP;
  },

  root_cause: (ctx, data) => {
    drawSectionHeader(ctx, 'Root Cause');
    drawWrappedText(ctx, data.rootCause || 'Root cause analysis not yet available.', MARGIN, CONTENT_WIDTH, COLOURS.slate700, 10, 'normal', 5);
    ctx.y += SECTION_GAP;
  },

  affected_components: (ctx, data) => {
    drawSectionHeader(ctx, 'Affected Components');
    let x = MARGIN;
    for (const c of data.affectedComponents) {
      setFont(ctx.doc, 'normal', 8);
      const w = getTextWidth(ctx.doc, c, 8) + 6;
      if (x + w > MARGIN + CONTENT_WIDTH) { x = MARGIN; ctx.y += 6; ensureSpace(ctx, 6); }
      drawRect(ctx.doc, x, ctx.y, w, 5, COLOURS.slate100, 1);
      drawText(ctx.doc, c, x + 3, ctx.y + 3.5, COLOURS.slate600, 8, 'normal');
      x += w + 2;
    }
    ctx.y += 8;
  },

  confidence: (ctx, data) => {
    drawSectionHeader(ctx, 'Confidence');
    const confLabel = data.confidence >= 0.9 ? 'High' : data.confidence >= 0.7 ? 'Medium' : data.confidence >= 0.5 ? 'Low' : 'Very Low';
    drawConfidenceBar(ctx, data.confidence, confLabel);
    drawWrappedText(ctx, data.confidenceExplanation || 'Confidence assessment not available.', MARGIN, CONTENT_WIDTH, COLOURS.slate500, 8, 'italic', 4);
    ctx.y += SECTION_GAP;
  },

  evidence: (ctx, data) => {
    drawSectionHeader(ctx, 'Evidence', data.evidence.length);
    for (const ev of data.evidence) {
      drawCard(ctx, [
        { text: `[${ev.type.toUpperCase()}] ${ev.label}`, colour: COLOURS.slate700, size: 9, style: 'bold' },
        { text: `Reference: ${ev.reference}`, colour: COLOURS.slate500, size: 8 },
        ...(ev.description ? [{ text: ev.description, colour: COLOURS.slate400, size: 8, style: 'italic' as const }] : []),
      ]);
    }
    ctx.y += SECTION_GAP;
  },

  evidence_package: (ctx, data) => {
    const ep = data.evidencePackage!;
    drawSectionHeader(ctx, 'Evidence Package', ep.evidence_items.length);
    for (const item of ep.evidence_items) {
      const lines: CardLine[] = [
        { text: `${item.source_type} — ${item.source_table}`, colour: COLOURS.slate700, size: 9, style: 'bold' },
        { text: `Field: ${item.field_name}`, colour: COLOURS.slate500, size: 8 },
      ];
      if (item.field_value) lines.push({ text: `Value: ${item.field_value}`, colour: COLOURS.slate700, size: 8 });
      lines.push({ text: `Object ID: ${item.object_id ?? 'N/A'}`, colour: COLOURS.slate500, size: 8 });
      lines.push({ text: `Confidence: ${pct(item.confidence)}  ·  Priority: ${item.evidence_priority}`, colour: COLOURS.slate600, size: 8 });
      if (item.supports_conclusion) lines.push({ text: 'Supports conclusion', colour: COLOURS.emerald600, size: 8, style: 'bold' });
      if (item.contradicts_conclusion) lines.push({ text: 'Conflicts with conclusion', colour: COLOURS.red600, size: 8, style: 'bold' });
      if (item.why_selected) lines.push({ text: item.why_selected, colour: COLOURS.slate400, size: 7, style: 'italic' });
      drawCard(ctx, lines, COLOURS.slate50, COLOURS.slate200);
    }
    ctx.y += SECTION_GAP;
  },

  conflicting_values: (ctx, data) => {
    const ep = data.evidencePackage!;
    drawSectionHeader(ctx, 'Conflicting Values', ep.conflicts.length);
    for (const conflict of ep.conflicts) {
      const lines: CardLine[] = [
        { text: conflict.conflict_summary, colour: COLOURS.amber800, size: 9, style: 'bold' },
      ];
      for (const val of conflict.values) {
        lines.push({ text: `${val.source_type}: ${val.field_value} (${val.source_table}.${val.field_name})`, colour: COLOURS.slate700, size: 8 });
        if (conflict.canonical_candidate === val.field_value) lines.push({ text: '  ^ Canonical Candidate', colour: COLOURS.emerald600, size: 7, style: 'bold' });
      }
      if (conflict.canonical_candidate) {
        lines.push({ text: `Canonical Candidate: ${conflict.canonical_candidate}`, colour: COLOURS.slate600, size: 8 });
        if (conflict.canonical_reason) lines.push({ text: conflict.canonical_reason, colour: COLOURS.slate500, size: 7, style: 'italic' });
      } else {
        lines.push({ text: 'Product Owner review required — canonical value cannot be safely determined.', colour: COLOURS.amber700, size: 8, style: 'bold' });
      }
      drawCard(ctx, lines, COLOURS.amber50, COLOURS.amber200);
    }
    ctx.y += SECTION_GAP;
  },

  classification_explanation: (ctx, data) => {
    const ce = data.evidencePackage!.classification_explanation;
    drawSectionHeader(ctx, 'Classification Explanation');
    drawCard(ctx, [
      { text: `Classification: ${ce.classification}`, colour: COLOURS.slate700, size: 9, style: 'bold' },
      { text: `Why Chosen: ${ce.chosen_reason}`, colour: COLOURS.slate600, size: 9 },
      ...(ce.rejected_alternatives.length > 0 ? [{ text: 'Rejected Alternatives:', colour: COLOURS.slate500, size: 8, style: 'bold' as const }] : []),
      ...ce.rejected_alternatives.map(a => ({ text: `  - ${a}`, colour: COLOURS.slate500, size: 8 })),
      ...(ce.authoritative_rules_applied.length > 0 ? [{ text: 'Authoritative Rules Applied:', colour: COLOURS.blue600, size: 8, style: 'bold' as const }] : []),
      ...ce.authoritative_rules_applied.map(r => ({ text: `  - ${r}`, colour: COLOURS.slate600, size: 8 })),
    ], COLOURS.blue50, COLOURS.blue200);
    ctx.y += SECTION_GAP;
  },

  evidence_graph: (ctx, data) => {
    const graph = data.evidencePackage!.evidence_graph;
    drawSectionHeader(ctx, 'Evidence Graph');
    for (const node of graph.nodes) {
      const dotColour = node.status === 'supporting' ? COLOURS.emerald500 : node.status === 'conflicting' ? COLOURS.red500 : node.status === 'missing' ? COLOURS.amber500 : COLOURS.slate300;
      ensureSpace(ctx, 5);
      ctx.doc.setFillColor(dotColour[0], dotColour[1], dotColour[2]);
      ctx.doc.circle(MARGIN + 1, ctx.y - 1, 1, 'F');
      drawText(ctx.doc, `${node.reference} → ${node.label}  [${node.status}]`, MARGIN + 4, ctx.y, COLOURS.slate700, 8);
      ctx.y += 5;
    }
    if (graph.edges.length > 0) {
      ctx.y += 2;
      drawText(ctx.doc, 'Edges:', MARGIN, ctx.y, COLOURS.slate500, 8, 'bold');
      ctx.y += 4;
      for (const edge of graph.edges) {
        drawText(ctx.doc, `  ${edge.from} → ${edge.to}: ${edge.label}`, MARGIN, ctx.y, COLOURS.slate600, 8, 'normal');
        ctx.y += 4;
      }
    }
    ctx.y += SECTION_GAP;
  },

  primary_integrity_domain: (ctx, data) => {
    const rec = data.recommendation!;
    drawSectionHeader(ctx, 'Primary Integrity Domain');
    drawCard(ctx, [
      { text: `Domain: ${DOMAIN_LABELS[rec.primary_integrity_domain]}`, colour: COLOURS.slate700, size: 9, style: 'bold' },
      { text: `Domain Match: ${rec.domain_match ? 'Yes' : 'No'}`, colour: COLOURS.slate600, size: 8 },
      { text: `Primary Subject: ${data.alert.normalised_reference ?? '—'}`, colour: COLOURS.slate600, size: 8 },
      ...(data.authoritativeLineage ? [{ text: `Relationship Subject: ${data.authoritativeLineage.expectedParent}`, colour: COLOURS.slate600, size: 8 }] : []),
      { text: `Secondary Findings: ${rec.secondary_findings.length}`, colour: COLOURS.slate500, size: 8 },
      { text: `Rejected Cross-Domain: ${rec.rejected_cross_domain_recommendations.length}`, colour: COLOURS.slate500, size: 8 },
    ]);
    ctx.y += SECTION_GAP;
  },

  secondary_findings: (ctx, data) => {
    const rec = data.recommendation!;
    drawSectionHeader(ctx, 'Secondary Findings', rec.secondary_findings.length);
    for (const f of rec.secondary_findings) {
      drawCard(ctx, [
        { text: f.description, colour: COLOURS.slate700, size: 9, style: 'bold' },
        { text: `Domain: ${DOMAIN_LABELS[f.domain]}  ·  Field: ${f.field}`, colour: COLOURS.slate500, size: 8 },
        { text: `Recommendation: ${f.recommendation_label} (rejected)`, colour: COLOURS.slate600, size: 8 },
        { text: `Rejection Reason: ${f.rejection_reason}`, colour: COLOURS.slate500, size: 8, style: 'italic' },
      ]);
    }
    ctx.y += SECTION_GAP;
  },

  rejected_cross_domain: (ctx, data) => {
    const rec = data.recommendation!;
    drawSectionHeader(ctx, 'Rejected Cross-Domain Recommendations', rec.rejected_cross_domain_recommendations.length);
    for (const f of rec.rejected_cross_domain_recommendations) {
      drawCard(ctx, [
        { text: f.recommendation_label, colour: COLOURS.slate700, size: 9, style: 'bold' },
        { text: `Rejection Reason: ${f.rejection_reason}`, colour: COLOURS.slate500, size: 8, style: 'italic' },
      ]);
    }
    ctx.y += SECTION_GAP;
  },

  canonical_decision: (ctx, data) => {
    const cd = data.evidencePackage!.canonical_decision;
    drawSectionHeader(ctx, 'Canonical Decision');
    const lines: CardLine[] = [];
    if (cd.canonical_value) {
      lines.push({ text: `Canonical Value: ${cd.canonical_value}`, colour: COLOURS.slate700, size: 9, style: 'bold' });
      lines.push({ text: `Type: ${cd.canonical_object_type ?? '—'}`, colour: COLOURS.slate500, size: 8 });
    } else {
      lines.push({ text: 'No canonical value determined — Product Owner review required.', colour: COLOURS.amber700, size: 9, style: 'bold' });
    }
    lines.push({ text: `Reasoning: ${cd.reasoning}`, colour: COLOURS.slate600, size: 8 });
    lines.push({ text: `Supporting Evidence: ${cd.supporting_evidence_count}  ·  Conflicting Evidence: ${cd.conflicting_evidence_count}`, colour: COLOURS.slate500, size: 8 });
    lines.push({ text: `Confidence: ${pct(cd.confidence)}  ·  PO Review Required: ${cd.po_review_required ? 'Yes' : 'No'}`, colour: COLOURS.slate600, size: 8 });
    drawCard(ctx, lines);
    ctx.y += SECTION_GAP;
  },

  runtime_diagnostics: (ctx, data) => {
    const rd = data.evidencePackage!.runtime_diagnostics;
    drawSectionHeader(ctx, 'Runtime Diagnostics');
    drawCard(ctx, [
      { text: `Sources Searched: ${rd.sources_searched.length}`, colour: COLOURS.slate600, size: 8 },
      { text: `Sources Contributing Evidence: ${rd.sources_contributing_evidence.length}`, colour: COLOURS.slate600, size: 8 },
      { text: `Supporting Evidence: ${rd.supporting_evidence_count}  ·  Conflicting Evidence: ${rd.conflicting_evidence_count}`, colour: COLOURS.slate600, size: 8 },
      { text: `Authoritative Evidence: ${rd.authoritative_evidence_count}  ·  Unknown Evidence: ${rd.unknown_evidence_count}`, colour: COLOURS.slate600, size: 8 },
      { text: `PO Decisions Required: ${rd.po_decisions_required}  ·  Auto Repairs Possible: ${rd.automatic_repairs_possible}`, colour: COLOURS.slate600, size: 8 },
    ]);
    ctx.y += SECTION_GAP;
  },

  authoritative_engineering_decision: (ctx, data) => {
    const dec = data.decision!;
    drawSectionHeader(ctx, 'Authoritative Engineering Decision');
    const lines: CardLine[] = [
      { text: dec.decision_title, colour: COLOURS.slate700, size: 10, style: 'bold' },
      { text: `Type: ${DECISION_LABELS[dec.decision_type]}  ·  Version: v${dec.decision_version}`, colour: COLOURS.slate500, size: 8 },
      { text: `Resolution Status: ${dec.resolution_status}`, colour: COLOURS.slate600, size: 8 },
      { text: `Domain: ${DOMAIN_LABELS[dec.primary_integrity_domain]}  ·  Relationship: ${RELATIONSHIP_LABELS[dec.relationship_type]}`, colour: COLOURS.slate500, size: 8 },
      { text: `Executive Summary: ${dec.executive_summary}`, colour: COLOURS.slate700, size: 9 },
      { text: `Decision Reasoning: ${dec.decision_reasoning}`, colour: COLOURS.slate600, size: 8 },
      { text: `Confidence: ${pct(dec.confidence)} — ${dec.confidence_explanation}`, colour: COLOURS.slate500, size: 8 },
      { text: `Recommended Next Action: ${dec.recommended_next_action}`, colour: COLOURS.slate700, size: 8, style: 'bold' },
    ];
    if (dec.alternatives_rejected.length > 0) {
      lines.push({ text: 'Alternatives Rejected:', colour: COLOURS.slate500, size: 8, style: 'bold' });
      for (const alt of dec.alternatives_rejected) {
        lines.push({ text: `  - ${DECISION_LABELS[alt.decision_type] ?? alt.decision_type}: ${alt.reason}`, colour: COLOURS.slate500, size: 8 });
      }
    }
    if (dec.po_decision) {
      lines.push({ text: `PO Decision: ${dec.po_decision}`, colour: COLOURS.emerald600, size: 9, style: 'bold' });
      lines.push({ text: `Decision By: ${dec.po_decision_actor ?? '—'}  ·  At: ${fmtTimestamp(dec.po_decision_at)}`, colour: COLOURS.slate500, size: 8 });
    }
    drawCard(ctx, lines, COLOURS.blue50, COLOURS.blue200);
    ctx.y += SECTION_GAP;
  },

  engineering_assessment: (ctx, data) => {
    const rec = data.recommendation!;
    drawSectionHeader(ctx, 'Engineering Assessment');
    const lines: CardLine[] = [
      { text: 'Summary', colour: COLOURS.slate500, size: 8, style: 'bold' },
      { text: rec.summary, colour: COLOURS.slate700, size: 9 },
      { text: 'Recommended Action', colour: COLOURS.slate500, size: 8, style: 'bold' },
      { text: rec.recommended_action, colour: COLOURS.slate700, size: 9 },
      { text: `Type: ${rec.recommendation_type.replace(/_/g, ' ')}`, colour: COLOURS.slate500, size: 8 },
      { text: 'Engineering Reasoning', colour: COLOURS.slate500, size: 8, style: 'bold' },
      { text: rec.engineering_reasoning, colour: COLOURS.slate600, size: 8 },
      { text: `Evidence Confidence: ${pct(rec.evidence_confidence)}  ·  Recommendation Confidence: ${pct(rec.recommendation_confidence)}  ·  Repair Confidence: ${pct(rec.repair_confidence)}`, colour: COLOURS.slate500, size: 8 },
      // BUG-006R.3: Separated confidence model
      { text: `Reference Classification Confidence: ${pct((rec.reference_classification_confidence ?? 0))} (pattern-match)  ·  Decision Confidence: ${pct((rec.decision_confidence ?? 0))}`, colour: COLOURS.slate500, size: 8 },
      { text: `Recovery Justification: ${(rec.recovery_justification ?? '').replace(/_/g, ' ')}  ·  Investigation Stage: ${(rec.investigation_stage ?? '').replace(/_/g, ' ')}`, colour: COLOURS.slate500, size: 8 },
      { text: `Risk: ${rec.risk_level} — ${rec.risk_reason}`, colour: COLOURS.slate600, size: 8 },
      { text: `Auto Repair Suitability: ${rec.auto_repair_suitability} — ${rec.auto_repair_reason}`, colour: COLOURS.slate600, size: 8 },
      { text: `PO Review Required: ${rec.po_review_required ? 'Yes — Product Owner must approve before action is taken.' : 'Not required — recommendation can proceed automatically.'}`, colour: rec.po_review_required ? COLOURS.amber700 : COLOURS.emerald600, size: 8, style: 'bold' },
      { text: `Expected Impact: ${rec.expected_impact}`, colour: COLOURS.slate700, size: 8 },
    ];
    if (rec.alternative_actions.length > 0) {
      lines.push({ text: 'Alternative Actions:', colour: COLOURS.slate500, size: 8, style: 'bold' });
      for (const alt of rec.alternative_actions) {
        lines.push({ text: `  - ${alt.action}`, colour: COLOURS.slate700, size: 8 });
        lines.push({ text: `    Trade-offs: ${alt.tradeoffs}`, colour: COLOURS.slate500, size: 7 });
        lines.push({ text: `    Risk: ${alt.risk_comparison}  ·  Governance: ${alt.governance_implications}  ·  Confidence: ${pct(alt.confidence)}`, colour: COLOURS.slate500, size: 7 });
      }
    }
    if (rec.known_limitations.length > 0) {
      lines.push({ text: 'Known Limitations:', colour: COLOURS.slate500, size: 8, style: 'bold' });
      for (const lim of rec.known_limitations) lines.push({ text: `  - ${lim}`, colour: COLOURS.slate500, size: 8 });
    }
    drawCard(ctx, lines);
    ctx.y += SECTION_GAP;
  },

  recovery_justification: (ctx, data) => {
    const rec = data.recommendation!;
    drawSectionHeader(ctx, 'Recovery Justification');
    const colour = rec.recovery_justification === 'justified' ? COLOURS.emerald600
      : rec.recovery_justification === 'blocked_pending_evidence' ? COLOURS.amber700
      : rec.recovery_justification === 'blocked_pending_po_decision' ? COLOURS.blue600 || COLOURS.slate600
      : COLOURS.slate600;
    drawCard(ctx, [
      { text: `Status: ${(rec.recovery_justification ?? '').replace(/_/g, ' ')}`, colour, size: 9, style: 'bold' },
      { text: rec.recovery_justification_reason ?? "", colour: COLOURS.slate600, size: 8 },
      { text: `Investigation Stage: ${(rec.investigation_stage ?? '').replace(/_/g, ' ')}`, colour: COLOURS.slate500, size: 8 },
    ]);
    ctx.y += SECTION_GAP;
  },

  separated_confidence_model: (ctx, data) => {
    const rec = data.recommendation!;
    drawSectionHeader(ctx, 'Separated Confidence Model (BUG-006R.3)');
    const lines: CardLine[] = [
      { text: `Reference Classification Confidence: ${pct((rec.reference_classification_confidence ?? 0))}`, colour: COLOURS.slate700, size: 8 },
      { text: '  (Pattern-match confidence — does not confirm the object existed)', colour: COLOURS.slate400, size: 7, style: 'italic' as const },
      { text: `Evidence Confidence: ${pct(rec.evidence_confidence)}`, colour: COLOURS.slate700, size: 8 },
      { text: '  (Authoritative source evidence)', colour: COLOURS.slate400, size: 7, style: 'italic' as const },
      { text: `Decision Confidence: ${pct((rec.decision_confidence ?? 0))}`, colour: COLOURS.slate700, size: 8 },
      { text: '  (Confidence in the recommendation)', colour: COLOURS.slate400, size: 7, style: 'italic' as const },
      { text: `Repair Confidence: ${pct(rec.repair_confidence)}`, colour: COLOURS.slate700, size: 8 },
      { text: '  (Auto-repair suitability)', colour: COLOURS.slate400, size: 7, style: 'italic' as const },
    ];
    if ((rec.reference_classification_confidence ?? 0) > 0.8 && rec.evidence_confidence < 0.3) {
      lines.push({ text: 'WARNING: High pattern-match confidence does not confirm the object existed. Evidence confidence is low.', colour: COLOURS.amber700, size: 8, style: 'bold' as const });
    }
    drawCard(ctx, lines);
    ctx.y += SECTION_GAP;
  },

  timeline: (ctx, data) => {
    drawSectionHeader(ctx, 'Timeline');
    for (const t of data.timeline) {
      ensureSpace(ctx, 5);
      const ts = t.timestamp ? new Date(t.timestamp).toLocaleString() : '—';
      drawText(ctx.doc, `[${ts}]`, MARGIN, ctx.y, COLOURS.slate400, 8, 'normal');
      drawWrappedText(ctx, t.event, MARGIN + 30, CONTENT_WIDTH - 30, COLOURS.slate700, 8, 'normal', 4);
      ctx.y += 2;
    }
    ctx.y += SECTION_GAP;
  },

  decision_timeline: (ctx, data) => {
    drawSectionHeader(ctx, 'Engineering Decision Timeline');
    for (const event of data.decisionTimeline) {
      const ts = event.created_at ? new Date(event.created_at).toLocaleString() : '—';
      drawCard(ctx, [
        { text: `[${ts}] ${event.event_type.toUpperCase()}`, colour: COLOURS.slate700, size: 8, style: 'bold' },
        { text: event.event_summary, colour: COLOURS.slate600, size: 8 },
        ...(event.previous_decision_type && event.new_decision_type ? [{ text: `Previous: ${event.previous_decision_type} → New: ${event.new_decision_type}`, colour: COLOURS.slate500, size: 7 }] : []),
        ...(event.previous_confidence !== null && event.new_confidence !== null ? [{ text: `Confidence: ${pct(event.previous_confidence)} → ${pct(event.new_confidence)}`, colour: COLOURS.slate500, size: 7 }] : []),
        { text: `Actor: ${event.actor} (${event.actor_type})`, colour: COLOURS.slate400, size: 7, style: 'italic' },
      ]);
    }
    ctx.y += SECTION_GAP;
  },

  authoritative_lineage: (ctx, data) => {
    const al = data.authoritativeLineage!;
    drawSectionHeader(ctx, 'Authoritative Lineage');
    drawCard(ctx, [
      { text: 'Child', colour: COLOURS.slate500, size: 8, style: 'bold' },
      { text: `  Child Reference: ${al.childRef}`, colour: COLOURS.slate700, size: 8 },
      { text: `  Recorded Parent: ${al.actualParent ?? 'null'}`, colour: COLOURS.slate600, size: 8 },
      { text: 'Expected Parent', colour: COLOURS.slate500, size: 8, style: 'bold' },
      { text: `  Expected Parent Ref: ${al.expectedParent}`, colour: COLOURS.slate700, size: 8 },
      { text: 'Authoritative Existence', colour: COLOURS.slate500, size: 8, style: 'bold' },
      { text: `  Classification: ${al.classification}`, colour: COLOURS.slate700, size: 8 },
      { text: `  Authoritative Status: ${al.authoritativeStatus}`, colour: COLOURS.slate600, size: 8 },
      { text: `  Source Type: ${al.sourceObjectType}`, colour: COLOURS.slate500, size: 8 },
      { text: `  Historical Status: ${al.lifecycleOrHistoricalStatus ?? 'N/A'}`, colour: COLOURS.slate500, size: 8 },
      { text: `  Lineage Satisfied: ${al.lineageSatisfied ? 'Yes' : 'No'}  ·  Execution Permitted: ${al.executionPermitted ? 'Yes' : 'No'}`, colour: COLOURS.slate600, size: 8 },
      ...(al.governingEvidence ? [{ text: `Historical Explanation: ${al.governingEvidence}`, colour: COLOURS.slate500, size: 7, style: 'italic' as const }] : []),
      ...(al.auditConclusion ? [{ text: `Audit Conclusion: ${al.auditConclusion}`, colour: COLOURS.slate500, size: 7, style: 'italic' as const }] : []),
      { text: `Relationship Assessment: ${al.resolutionReason}`, colour: COLOURS.slate700, size: 8 },
    ]);
    ctx.y += SECTION_GAP;
  },

  related_engineering: (ctx, data) => {
    drawSectionHeader(ctx, 'Related Engineering', data.relatedEngineering.length);
    for (const re of data.relatedEngineering) {
      drawCard(ctx, [
        { text: `[${re.type}] ${re.ref}: ${re.title}`, colour: COLOURS.slate700, size: 8 },
      ]);
    }
    ctx.y += SECTION_GAP;
  },

  resolution_lifecycle: (ctx, data) => {
    drawSectionHeader(ctx, 'Resolution Lifecycle');
    drawCard(ctx, [
      { text: `Current Status: ${RESOLUTION_STATUS_LABELS[data.resolutionStatus] ?? data.resolutionStatus}`, colour: COLOURS.slate700, size: 9, style: 'bold' },
      ...(data.resolutionTimestamp ? [{ text: `Resolution Timestamp: ${fmtTimestamp(data.resolutionTimestamp)}`, colour: COLOURS.slate500, size: 8 }] : []),
      ...(data.resolutionActor ? [{ text: `Resolution Actor: ${data.resolutionActor}`, colour: COLOURS.slate500, size: 8 }] : []),
    ]);
    ctx.y += SECTION_GAP;
  },

  recommended_actions: (ctx, data) => {
    drawSectionHeader(ctx, 'Recommended Actions');
    for (const action of data.governedActions) {
      const lines: CardLine[] = [
        { text: `[${action.available ? 'Available' : 'Unavailable'}] ${action.label}`, colour: COLOURS.slate700, size: 9, style: 'bold' },
      ];
      if (action.requires_po_approval) lines.push({ text: 'PO Approval Required: Yes', colour: COLOURS.amber700, size: 8 });
      if (!action.available && action.unavailable_reason) lines.push({ text: `Reason: ${action.unavailable_reason}`, colour: COLOURS.slate500, size: 8, style: 'italic' });
      drawCard(ctx, lines);
    }
    ctx.y += SECTION_GAP;
  },

  reference_codes: (ctx, data) => {
    drawSectionHeader(ctx, 'Reference Codes');
    if (data.governedResponseRef) drawKeyValue(ctx, 'Governed Response:', data.governedResponseRef);
    if (data.governedResponseState) drawKeyValue(ctx, 'Governed Response Code:', data.governedResponseState.referenceCode);
    if (data.decision) drawKeyValue(ctx, 'Decision ID:', data.decision.id);
    if (data.alert.alert_ref) drawKeyValue(ctx, 'Alert Ref:', data.alert.alert_ref);
    ctx.y += SECTION_GAP;
  },

  product_owner_guidance: (ctx, data) => {
    drawSectionHeader(ctx, 'Product Owner Guidance');
    const poLines: CardLine[] = [];
    if (data.decision) {
      if (data.decision.resolution_status === 'resolved') {
        poLines.push({ text: 'This investigation has been resolved.', colour: COLOURS.emerald600, size: 9, style: 'bold' });
        if (data.decision.po_decision) {
          poLines.push({ text: `Product Owner Decision: ${data.decision.po_decision}`, colour: COLOURS.slate700, size: 8 });
          poLines.push({ text: `Decision By: ${data.decision.po_decision_actor ?? '—'}`, colour: COLOURS.slate500, size: 8 });
          poLines.push({ text: `Decision At: ${fmtTimestamp(data.decision.po_decision_at)}`, colour: COLOURS.slate500, size: 8 });
        }
      } else if (data.decision.decision_type === 'product_owner_decision_required') {
        poLines.push({ text: 'Product Owner decision is required to resolve this investigation.', colour: COLOURS.amber700, size: 9, style: 'bold' });
        poLines.push({ text: `Recommended Action: ${data.decision.recommended_next_action}`, colour: COLOURS.slate700, size: 8 });
      } else if (data.decision.decision_type === 'await_further_evidence') {
        poLines.push({ text: 'Further evidence is required before a definitive decision can be made.', colour: COLOURS.amber700, size: 9, style: 'bold' });
      } else {
        poLines.push({ text: `Current Decision: ${data.decision.decision_title}`, colour: COLOURS.slate700, size: 8 });
        poLines.push({ text: `Recommended Next Action: ${data.decision.recommended_next_action}`, colour: COLOURS.slate700, size: 8 });
      }
    } else if (data.recommendation) {
      if (data.recommendation.po_review_required) {
        poLines.push({ text: 'Product Owner review is required.', colour: COLOURS.amber700, size: 9, style: 'bold' });
        poLines.push({ text: `Recommended Action: ${data.recommendation.recommended_action}`, colour: COLOURS.slate700, size: 8 });
      } else {
        poLines.push({ text: `Recommended Action: ${data.recommendation.recommended_action}`, colour: COLOURS.slate700, size: 8 });
        poLines.push({ text: 'No Product Owner review required.', colour: COLOURS.emerald600, size: 8 });
      }
    } else {
      poLines.push({ text: 'Investigation is in progress. No decision has been generated yet.', colour: COLOURS.slate500, size: 8, style: 'italic' });
    }
    if (data.isReadOnly) poLines.push({ text: 'This investigation is read-only (resolved or archived).', colour: COLOURS.slate500, size: 8, style: 'italic' });
    drawCard(ctx, poLines);
  },
};

// ─── Default Fallback Renderer ──────────────────────────────────────────────────

function defaultRenderer(ctx: PDFContext, section: InvestigationSection, data: InvestigationSchemaData): void {
  drawSectionHeader(ctx, section.label);
  const textLines = section.serialize(data);
  const contentLines = textLines
    .filter(l => !l.startsWith('───') && l.trim() !== '')
    .map(l => l.trim());

  if (contentLines.length > 0) {
    const cardLines: CardLine[] = contentLines.map(l => ({
      text: l,
      colour: COLOURS.slate600,
      size: 8,
    }));
    drawCard(ctx, cardLines);
  }
  ctx.y += SECTION_GAP;
}

// ─── Main PDF Generator ───────────────────────────────────────────────────────

export interface ExportDiagnostic {
  investigationRef: string;
  rendererVersion: string;
  visibleSectionCount: number;
  renderedSectionCount: number;
  fallbackRenderedCount: number;
  excludedSectionCount: number;
  failedSectionCount: number;
  failedSectionIds: string[];
  generatedTimestamp: string;
}

export interface PDFGenerationResult {
  doc: jsPDF;
  diagnostic: ExportDiagnostic;
}

export function generateInvestigationPDF(data: InvestigationSchemaData): jsPDF {
  return generateInvestigationPDFWithDiagnostic(data).doc;
}

export function generateInvestigationPDFWithDiagnostic(data: InvestigationSchemaData): PDFGenerationResult {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ctx: PDFContext = { doc, y: MARGIN };

  // ─── PDF Metadata (renderer version) ──────────────────────────────────────
  doc.setProperties({
    title: 'Engineering Investigation Report',
    subject: data.alert.alert_ref ?? data.alert.normalised_reference ?? 'investigation',
    creator: RENDERER_VERSION,
  });

  // ─── Report Header Bar ─────────────────────────────────────────────────────
  drawRect(doc, 0, 0, PAGE_WIDTH, HEADER_HEIGHT, COLOURS.slate900);
  setColour(doc, COLOURS.white);
  setFont(doc, 'bold', 14);
  doc.text('Engineering Investigation Report', MARGIN, 12);
  setFont(doc, 'normal', 8);
  doc.text(new Date().toLocaleString(), PAGE_WIDTH - MARGIN - 30, 12);

  // ─── Body starts after header + margin (dynamic) ───────────────────────────
  ctx.y = HEADER_HEIGHT + HEADER_BOTTOM_MARGIN;

  // ─── Schema-Driven Section Rendering ─────────────────────────────────────────
  const visibleSections = getVisibleSections(data);
  let renderedCount = 0;
  let fallbackCount = 0;
  let failedCount = 0;
  const failedIds: string[] = [];

  for (const section of visibleSections) {
    const renderer = renderers[section.id];
    try {
      if (renderer) {
        renderer(ctx, data);
        renderedCount++;
      } else {
        defaultRenderer(ctx, section, data);
        renderedCount++;
        fallbackCount++;
      }
    } catch (err) {
      failedCount++;
      failedIds.push(section.id);
      drawSectionHeader(ctx, section.label);
      drawCard(ctx, [
        { text: `[Export Error] Section '${section.id}' failed to render.`, colour: COLOURS.red600, size: 8, style: 'bold' },
        { text: `Reference: EIOS-EXPORT-002`, colour: COLOURS.slate500, size: 7 },
      ], COLOURS.red50, COLOURS.red200);
      ctx.y += SECTION_GAP;
    }
  }

  // ─── Footer ─────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setColour(doc, COLOURS.slate400);
    setFont(doc, 'normal', 7);
    doc.text(`Engineering Investigation Report — Page ${i} of ${pageCount}`, MARGIN, PAGE_HEIGHT - 8);
    doc.text(`Renderer: ${RENDERER_VERSION}  ·  Generated from canonical Investigation Runtime Model`, PAGE_WIDTH - MARGIN - 70, PAGE_HEIGHT - 8);
  }

  const diagnostic: ExportDiagnostic = {
    investigationRef: data.alert.alert_ref ?? data.alert.normalised_reference ?? data.alert.id,
    rendererVersion: RENDERER_VERSION,
    visibleSectionCount: visibleSections.length,
    renderedSectionCount: renderedCount,
    fallbackRenderedCount: fallbackCount,
    excludedSectionCount: 0,
    failedSectionCount: failedCount,
    failedSectionIds: failedIds,
    generatedTimestamp: new Date().toISOString(),
  };

  return { doc, diagnostic };
}

export interface DownloadResult {
  success: boolean;
  diagnostic: ExportDiagnostic | null;
  readiness: ExportReadinessResult | null;
}

export function downloadInvestigationPDF(data: InvestigationSchemaData, filename?: string): DownloadResult {
  const readiness = checkExportReadiness(data);
  if (!readiness.ready) {
    return { success: false, diagnostic: null, readiness };
  }

  const { doc, diagnostic } = generateInvestigationPDFWithDiagnostic(data);
  const ref = data.alert.alert_ref ?? data.alert.normalised_reference ?? 'investigation';
  const safeName = (filename ?? `investigation-${ref}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${safeName}.pdf`);
  return { success: true, diagnostic, readiness };
}

// ─── Layout Engine Exports (for testing) ──────────────────────────────────────

export function testRenderBadgeGroup(doc: jsPDF, badges: BadgeSpec[], x: number, maxWidth: number, startY: number): number {
  const ctx: PDFContext = { doc, y: startY };
  return renderBadgeGroup(ctx, badges, x, maxWidth);
}

export function testRenderMetadataGrid(doc: jsPDF, fields: MetadataField[], x: number, maxWidth: number, startY: number): number {
  const ctx: PDFContext = { doc, y: startY };
  return renderMetadataGrid(ctx, fields, x, maxWidth);
}

export function testRenderIdentityHeader(doc: jsPDF, data: InvestigationSchemaData, startY: number): number {
  const ctx: PDFContext = { doc, y: startY };
  return renderIdentityHeader(ctx, data);
}

export type { BadgeSpec, MetadataField };
