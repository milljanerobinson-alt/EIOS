/*
# EWO-043R: Record Constitutional Principle — Single Governed Pathway
*/

INSERT INTO po_identity_principles (principle_ref, title, principle_text, recorded_by, correlation_id)
VALUES (
  'PO-PRINCIPLE-003',
  'Single Governed Engineering Work Order Pathway',
  'A genuine Engineering Work Order shall have exactly one governed allocation pathway and exactly one governed creation pathway. Any additional pathway constitutes architectural drift.',
  'milljanerobinson@gmail.com',
  'EWO043R-CONSTITUTIONAL-PRINCIPLE'
)
ON CONFLICT (principle_ref) DO NOTHING;
