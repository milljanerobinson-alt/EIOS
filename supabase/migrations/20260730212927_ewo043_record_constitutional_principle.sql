/*
# EWO-043: Record Constitutional Engineering Identity Principle

## Purpose
Records the constitutional principle that a genuine Engineering Work Order
shall possess one immutable identity from governed planning through permanent
archive. This supersedes the previous planning-versus-canonical model.
*/

INSERT INTO po_identity_principles (principle_ref, title, principle_text, recorded_by, correlation_id)
VALUES (
  'PO-PRINCIPLE-002',
  'Immutable Engineering Work Order Identity',
  'A genuine Engineering Work Order shall possess one immutable Engineering Work Order identity from governed planning through permanent archive. The planning reference IS the canonical reference. The system must not intentionally create separate planning and canonical EWO references for the same engineering work. This principle supersedes the previous planning-versus-canonical identity model.',
  'milljanerobinson@gmail.com',
  'EWO043-CONSTITUTIONAL-PRINCIPLE'
)
ON CONFLICT (principle_ref) DO NOTHING;
