/*
# EWO-021 Stream Closeout & BUG-004 Acceptance

## Purpose
Record the governed closeout of the EWO-021 Investigation Export stream and
BUG-004 acceptance. Product Owner Acceptance was explicitly confirmed in
ChatGPT on 22 July 2026 after successful visual verification.

## Changes
1. Creates canonical engineering_work_orders records for:
   - EWO-021 (parent stream — closed)
   - EWO-021R.1 (previously accepted and closed — preserved)
   - EWO-021R.2 (accepted and closed)
   - EWO-021R.3 (superseded by EWO-021R.4 — NOT accepted)
   - EWO-021R.4 (accepted and closed)
   - BUG-004 (accepted and closed)
   - BUG-002 (created but remains open — no acceptance recorded)
   - EWO-022 (created as in_progress — this implementation)

2. Records Engineering Change Ledger events for acceptance, closure, supersession.

3. Records EWO lifecycle events for each work order.

## Security
No new tables. No RLS policy changes. All inserts into existing tables.

## Idempotency
All inserts guarded by WHERE NOT EXISTS. Safe to re-run.
*/

-- ─── 1. Create EWO records ───────────────────────────────────────────────────

-- EWO-021 (parent stream)
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  engineering_classification, product_owner, owner,
  closed_at, closed_by, closure_reason, closure_method,
  po_accepted_at, po_accepted_by, po_acceptance_statement,
  created_at, updated_at
)
SELECT
  'EWO-021', 'EWO-021 — Investigation Export Stream',
  'Authoritative investigation export (PDF + AI Context) with canonical schema-driven rendering, export-readiness gating, and governed layout engine.',
  'closed', 'high', 'medium',
  'Engineering', 'Product Owner', 'Engineering',
  '2026-07-22T12:00:00Z', 'Product Owner',
  'Investigation Export stream complete. All refinements accepted or superseded.',
  'Product Owner Acceptance',
  '2026-07-22T12:00:00Z', 'Product Owner',
  'EWO-021 Investigation Export stream accepted and closed. R.1 previously accepted. R.2 accepted. R.3 superseded by R.4. R.4 accepted. BUG-004 accepted.',
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-021');

-- EWO-021R.1 (previously accepted and closed — preserved)
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  engineering_classification, product_owner, owner, parent_ref,
  closed_at, closed_by, closure_reason, closure_method,
  po_accepted_at, po_accepted_by, po_acceptance_statement,
  created_at, updated_at
)
SELECT
  'EWO-021R.1', 'EWO-021R.1 — Canonical Investigation Schema',
  'Canonical investigation schema with section visibility, serialization, and AI context generation.',
  'closed', 'high', 'low',
  'Refinement', 'Product Owner', 'Engineering', 'EWO-021',
  '2026-07-08T12:00:00Z', 'Product Owner',
  'Previously accepted and closed.',
  'Product Owner Acceptance',
  '2026-07-08T12:00:00Z', 'Product Owner',
  'Previously accepted by Product Owner.',
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.1');

-- EWO-021R.2 (accepted and closed)
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  engineering_classification, product_owner, owner, parent_ref,
  closed_at, closed_by, closure_reason, closure_method,
  po_accepted_at, po_accepted_by, po_acceptance_statement,
  created_at, updated_at
)
SELECT
  'EWO-021R.2', 'EWO-021R.2 — PDF & AI Context Package',
  'Schema-driven PDF renderer and AI Context Package with canonical serialization. AI Context export contains complete canonical investigation information.',
  'closed', 'high', 'low',
  'Refinement', 'Product Owner', 'Engineering', 'EWO-021',
  '2026-07-22T12:00:00Z', 'Product Owner',
  'Product Owner Acceptance confirmed in ChatGPT on 22 July 2026. AI Context export verified with all canonical sections.',
  'Product Owner Acceptance',
  '2026-07-22T12:00:00Z', 'Product Owner',
  'AI Context export contains the complete canonical investigation information. Canonical decision information is present and correct. Evidence Package, Classification Explanation, Evidence Graph, Canonical Decision, Runtime Diagnostics, Engineering Assessment, Authoritative Engineering Decision, Decision Timeline and Product Owner Guidance were verified. No unresolved acceptance blocker remains.',
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.2');

-- EWO-021R.3 (superseded by EWO-021R.4 — NOT accepted)
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  engineering_classification, product_owner, owner, parent_ref,
  closed_at, closed_by, closure_reason, closure_method,
  created_at, updated_at
)
SELECT
  'EWO-021R.3', 'EWO-021R.3 — PDF Fidelity Refinement',
  'PDF fidelity refinement. Superseded by EWO-021R.4 which replaced the incomplete implementation with canonical runtime-path verification.',
  'closed', 'high', 'low',
  'Refinement', 'Product Owner', 'Engineering', 'EWO-021',
  '2026-07-22T12:00:00Z', 'Engineering',
  'Superseded by EWO-021R.4. EWO-021R.3 did not fully resolve the live PDF export path. Not independently accepted by Product Owner.',
  'Automated Governance',
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.3');

-- EWO-021R.4 (accepted and closed)
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  engineering_classification, product_owner, owner, parent_ref,
  closed_at, closed_by, closure_reason, closure_method,
  po_accepted_at, po_accepted_by, po_acceptance_statement,
  created_at, updated_at
)
SELECT
  'EWO-021R.4', 'EWO-021R.4 — Investigation PDF Runtime Path Verification & Canonical Export Enforcement',
  'Canonical export model, export-readiness gating, renderer version diagnostic, and governed layout engine. PDF and Copy AI Context consume the same canonical export model.',
  'closed', 'high', 'low',
  'Refinement', 'Product Owner', 'Engineering', 'EWO-021',
  '2026-07-22T12:00:00Z', 'Product Owner',
  'Product Owner Acceptance confirmed in ChatGPT on 22 July 2026. PDF and AI Context verified. BUG-004 layout fix also resolved.',
  'Product Owner Acceptance',
  '2026-07-22T12:00:00Z', 'Product Owner',
  'PDF and Copy AI Context now consume the same canonical export model. Export-readiness gating prevents incomplete PDF generation. The generated PDF includes all required investigation sections. Product Owner Guidance correctly reflects Historical Root Accepted. Renderer evidence identifies EWO-021R.4. Runtime and content testing passed. The remaining visual layout defect was separated into BUG-004 and has now also been resolved.',
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.4');

-- BUG-004 (accepted and closed)
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  engineering_classification, product_owner, owner,
  closed_at, closed_by, closure_reason, closure_method,
  po_accepted_at, po_accepted_by, po_acceptance_statement,
  created_at, updated_at
)
SELECT
  'BUG-004', 'BUG-004 — Investigation PDF Identity Header & Layout Engine Refinement',
  'Governed layout engine replacing coordinate-based positioning. Identity header rendered as structured metadata grid. Badge groups participate in layout flow. Dynamic row height calculation.',
  'closed', 'high', 'low',
  'Bug', 'Product Owner', 'Engineering',
  '2026-07-22T12:00:00Z', 'Product Owner',
  'Product Owner Acceptance confirmed in ChatGPT on 22 July 2026. Visual verification of corrected Investigation PDF passed.',
  'Product Owner Acceptance',
  '2026-07-22T12:00:00Z', 'Product Owner',
  'Severity, object type, alert-reference and decision-status badges no longer overlap. Alert Reference and Alert ID occupy independent layout positions. Alert Type, Severity, Object Type and Detected At are readable. The full Alert ID renders without collision. Executive Summary begins beneath the completed identity block. Investigation content remains complete and unchanged. The resulting PDF is suitable as a permanent engineering record. The remaining large vertical gap was assessed as non-blocking.',
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'BUG-004');

-- BUG-002 (created but remains OPEN — no acceptance recorded)
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  engineering_classification, product_owner, owner,
  created_at, updated_at
)
SELECT
  'BUG-002', 'BUG-002 — Engineering Ledger Counters',
  'Engineering ledger counter accuracy. Passed Product Owner testing but NOT explicitly accepted as part of EWO-022 closeout instruction.',
  'in_progress', 'medium', 'low',
  'Bug', 'Product Owner', 'Engineering',
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'BUG-002');

-- EWO-022 (created as in_progress — this implementation)
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  engineering_classification, product_owner, owner,
  created_at, updated_at
)
SELECT
  'EWO-022', 'EWO-022 — Engineering Work Order Export & Audit',
  'Authoritative spreadsheet export for closed Engineering Work Orders. Audit and evidence-gathering capability for BUG-003 scope definition.',
  'in_progress', 'high', 'low',
  'Engineering', 'Product Owner', 'Engineering',
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-022');

-- ─── 2. Record EWO lifecycle events ──────────────────────────────────────────

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
SELECT id, 'po_acceptance', 'closed', 'Product Owner',
  'Product Owner Acceptance recorded. AI Context export verified.',
  '{"source": "ewo021_closeout", "acceptance_basis": "AI Context export contains complete canonical investigation information"}'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.2'
AND NOT EXISTS (
  SELECT 1 FROM ewo_lifecycle_events e
  JOIN engineering_work_orders w ON e.ewo_id = w.id
  WHERE w.ewo_ref = 'EWO-021R.2' AND e.to_status = 'closed'
);

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
SELECT id, 'report_generated', 'closed', 'Engineering',
  'Superseded by EWO-021R.4. Did not fully resolve the live PDF export path.',
  '{"source": "ewo021_closeout", "superseded_by": "EWO-021R.4", "closure_method": "supersession"}'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.3'
AND NOT EXISTS (
  SELECT 1 FROM ewo_lifecycle_events e
  JOIN engineering_work_orders w ON e.ewo_id = w.id
  WHERE w.ewo_ref = 'EWO-021R.3' AND e.to_status = 'closed'
);

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
SELECT id, 'po_acceptance', 'closed', 'Product Owner',
  'Product Owner Acceptance recorded. PDF and AI Context verified. BUG-004 layout fix also resolved.',
  '{"source": "ewo021_closeout", "acceptance_basis": "PDF and AI Context consume same canonical export model. Export-readiness gating verified."}'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.4'
AND NOT EXISTS (
  SELECT 1 FROM ewo_lifecycle_events e
  JOIN engineering_work_orders w ON e.ewo_id = w.id
  WHERE w.ewo_ref = 'EWO-021R.4' AND e.to_status = 'closed'
);

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
SELECT id, 'po_acceptance', 'closed', 'Product Owner',
  'Product Owner Acceptance recorded. Visual verification of corrected Investigation PDF passed.',
  '{"source": "bug004_acceptance", "acceptance_basis": "No overlapping badges. Independent layout positions. Executive Summary beneath identity block."}'
FROM engineering_work_orders WHERE ewo_ref = 'BUG-004'
AND NOT EXISTS (
  SELECT 1 FROM ewo_lifecycle_events e
  JOIN engineering_work_orders w ON e.ewo_id = w.id
  WHERE w.ewo_ref = 'BUG-004' AND e.to_status = 'closed'
);

-- ─── 3. Record Engineering Change Ledger events ─────────────────────────────

-- EWO-021R.2 PO Acceptance
INSERT INTO engineering_change_log (change_type, object_type, object_id, object_ref, ewo_ref, summary, description, actor_type, actor, linked_artefacts, recording_source, created_at)
SELECT 'approved', 'product_owner_approval', id, 'EWO-021R.2', 'EWO-021R.2',
  'Product Owner Acceptance: EWO-021R.2 — PDF & AI Context Package',
  'AI Context export contains the complete canonical investigation information. All canonical sections verified.',
  'human', 'Product Owner',
  '["EWO-021R.2"]', 'live', '2026-07-22T12:00:00Z'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.2'
AND NOT EXISTS (
  SELECT 1 FROM engineering_change_log WHERE ewo_ref = 'EWO-021R.2' AND change_type = 'approved'
);

-- EWO-021R.2 Closure
INSERT INTO engineering_change_log (change_type, object_type, object_id, object_ref, ewo_ref, summary, description, actor_type, actor, linked_artefacts, recording_source, created_at)
SELECT 'closed', 'engineering_work_order', id, 'EWO-021R.2', 'EWO-021R.2',
  'EWO-021R.2 closed after Product Owner Acceptance',
  'Lifecycle transition: po_acceptance → closed. Closure method: Product Owner Acceptance.',
  'human', 'Product Owner',
  '["EWO-021R.2"]', 'live', '2026-07-22T12:00:00Z'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.2'
AND NOT EXISTS (
  SELECT 1 FROM engineering_change_log WHERE ewo_ref = 'EWO-021R.2' AND change_type = 'closed'
);

-- EWO-021R.3 Supersession
INSERT INTO engineering_change_log (change_type, object_type, object_id, object_ref, ewo_ref, summary, description, actor_type, actor, linked_artefacts, recording_source, created_at)
SELECT 'closed', 'engineering_work_order', id, 'EWO-021R.3', 'EWO-021R.3',
  'EWO-021R.3 superseded by EWO-021R.4',
  'EWO-021R.3 did not fully resolve the live PDF export path. EWO-021R.4 replaced the incomplete implementation with canonical runtime-path verification, export-readiness enforcement and a single export model used by both PDF and AI Context. Not independently accepted by Product Owner.',
  'system', 'Engineering',
  '["EWO-021R.4"]', 'live', '2026-07-22T12:00:00Z'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.3'
AND NOT EXISTS (
  SELECT 1 FROM engineering_change_log WHERE ewo_ref = 'EWO-021R.3' AND change_type = 'closed'
);

-- EWO-021R.4 PO Acceptance
INSERT INTO engineering_change_log (change_type, object_type, object_id, object_ref, ewo_ref, summary, description, actor_type, actor, linked_artefacts, recording_source, created_at)
SELECT 'approved', 'product_owner_approval', id, 'EWO-021R.4', 'EWO-021R.4',
  'Product Owner Acceptance: EWO-021R.4 — Investigation PDF Runtime Path Verification & Canonical Export Enforcement',
  'PDF and Copy AI Context now consume the same canonical export model. Export-readiness gating prevents incomplete PDF generation. The generated PDF includes all required investigation sections. Product Owner Guidance correctly reflects Historical Root Accepted. Renderer evidence identifies EWO-021R.4. Runtime and content testing passed. BUG-004 layout fix also resolved.',
  'human', 'Product Owner',
  '["EWO-021R.4", "BUG-004"]', 'live', '2026-07-22T12:00:00Z'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.4'
AND NOT EXISTS (
  SELECT 1 FROM engineering_change_log WHERE ewo_ref = 'EWO-021R.4' AND change_type = 'approved'
);

-- EWO-021R.4 Closure
INSERT INTO engineering_change_log (change_type, object_type, object_id, object_ref, ewo_ref, summary, description, actor_type, actor, linked_artefacts, recording_source, created_at)
SELECT 'closed', 'engineering_work_order', id, 'EWO-021R.4', 'EWO-021R.4',
  'EWO-021R.4 closed after Product Owner Acceptance',
  'Lifecycle transition: po_acceptance → closed. Closure method: Product Owner Acceptance.',
  'human', 'Product Owner',
  '["EWO-021R.4"]', 'live', '2026-07-22T12:00:00Z'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-021R.4'
AND NOT EXISTS (
  SELECT 1 FROM engineering_change_log WHERE ewo_ref = 'EWO-021R.4' AND change_type = 'closed'
);

-- BUG-004 PO Acceptance
INSERT INTO engineering_change_log (change_type, object_type, object_id, object_ref, ewo_ref, summary, description, actor_type, actor, linked_artefacts, recording_source, created_at)
SELECT 'approved', 'product_owner_approval', id, 'BUG-004', 'BUG-004',
  'Product Owner Acceptance: BUG-004 — Investigation PDF Identity Header & Layout Engine Refinement',
  'Severity, object type, alert-reference and decision-status badges no longer overlap. Alert Reference and Alert ID occupy independent layout positions. Executive Summary begins beneath the completed identity block. Investigation content remains complete and unchanged. The resulting PDF is suitable as a permanent engineering record.',
  'human', 'Product Owner',
  '["BUG-004", "EWO-021R.4"]', 'live', '2026-07-22T12:00:00Z'
FROM engineering_work_orders WHERE ewo_ref = 'BUG-004'
AND NOT EXISTS (
  SELECT 1 FROM engineering_change_log WHERE ewo_ref = 'BUG-004' AND change_type = 'approved'
);

-- BUG-004 Closure
INSERT INTO engineering_change_log (change_type, object_type, object_id, object_ref, ewo_ref, summary, description, actor_type, actor, linked_artefacts, recording_source, created_at)
SELECT 'closed', 'engineering_work_order', id, 'BUG-004', 'BUG-004',
  'BUG-004 closed after Product Owner Acceptance',
  'Lifecycle transition: po_acceptance → closed. Closure method: Product Owner Acceptance.',
  'human', 'Product Owner',
  '["BUG-004"]', 'live', '2026-07-22T12:00:00Z'
FROM engineering_work_orders WHERE ewo_ref = 'BUG-004'
AND NOT EXISTS (
  SELECT 1 FROM engineering_change_log WHERE ewo_ref = 'BUG-004' AND change_type = 'closed'
);

-- EWO-021 Stream Closure Summary
INSERT INTO engineering_change_log (change_type, object_type, object_id, object_ref, ewo_ref, summary, description, actor_type, actor, linked_artefacts, recording_source, created_at)
SELECT 'closed', 'engineering_work_order', id, 'EWO-021', 'EWO-021',
  'EWO-021 Investigation Export stream closed',
  'Stream closeout: EWO-021R.1 previously accepted and closed. EWO-021R.2 accepted and closed. EWO-021R.3 superseded by EWO-021R.4 (not independently accepted). EWO-021R.4 accepted and closed. BUG-004 accepted and closed. No duplicate acceptance or closure events created. BUG-002 remains open.',
  'human', 'Product Owner',
  '["EWO-021R.1", "EWO-021R.2", "EWO-021R.3", "EWO-021R.4", "BUG-004"]', 'live', '2026-07-22T12:00:00Z'
FROM engineering_work_orders WHERE ewo_ref = 'EWO-021'
AND NOT EXISTS (
  SELECT 1 FROM engineering_change_log WHERE ewo_ref = 'EWO-021' AND change_type = 'closed'
);
