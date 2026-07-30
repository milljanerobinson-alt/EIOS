INSERT INTO engineering_work_orders (
  ewo_ref, title, status, engineering_classification,
  parent_ref, refinement_depth,
  business_objective, engineering_objective,
  priority, risk_level, estimated_effort,
  scope, engineering_notes,
  bootstrap_origin, bootstrap_reason
) VALUES (
  'EWO-017R.2R',
  'EWO-017R.2R — End-to-End Governed Engineering Continuation (Context-First Routing Refinement)',
  'in_progress',
  'Refinement',
  'EWO-017R.1',
  1,
  'Complete the end-to-end governed workflow so a real EIOS conversation request can establish or recover the active Engineering Work Order, resolve contextual wording, retrieve governed Engineering Analysis, produce a grounded expanded analysis, and return authoritative runtime diagnostics.',
  'Implement automatic active-object population, session/conversation continuity, Engineering Analysis retrieval integration, grounded analysis expansion, plan continuation, and extended runtime diagnostics through the deployed ChatGPT EIOS path.',
  'high',
  'medium',
  'medium',
  'Context-first routing pipeline completion, active-object population, session continuity, analysis retrieval, grounded expansion, plan continuation, extended diagnostics, end-to-end tests.',
  'Failed runtime audit: ATD-MCP-1784935021965-hvwfyg. Previous refinement (EWO-017R.2) established context-first routing foundation but did not complete end-to-end continuation capability.',
  'po_refinement',
  'Product Owner identified 5 acceptance blockers requiring end-to-end completion'
)
ON CONFLICT (ewo_ref) DO UPDATE SET
  status = 'in_progress',
  title = EXCLUDED.title,
  engineering_notes = EXCLUDED.engineering_notes,
  updated_at = now();