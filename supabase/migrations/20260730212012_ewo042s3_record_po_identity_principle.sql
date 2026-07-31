/*
# EWO-042S.3: Record Product Owner Identity Principle

## Purpose
Records the Product Owner's long-term identity principle for future
architecture review. This principle states that a genuine Engineering Work
Order should have one stable human-readable engineering identity from
planning through implementation, verification, acceptance, closure,
archive, and knowledge extraction.

## New Table
- `po_identity_principles`
  - Records Product Owner governance principles for future architecture review.
  - Columns: id, principle_ref, title, principle_text, recorded_by,
    correlation_id, recorded_at, status

## Security
- RLS enabled, read for anon + authenticated, insert for authenticated.
*/

CREATE TABLE IF NOT EXISTS po_identity_principles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principle_ref text UNIQUE NOT NULL,
  title text NOT NULL,
  principle_text text NOT NULL,
  recorded_by text NOT NULL,
  correlation_id text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
);

ALTER TABLE po_identity_principles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_po_principles" ON po_identity_principles;
CREATE POLICY "anon_select_po_principles"
ON po_identity_principles FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_po_principles" ON po_identity_principles;
CREATE POLICY "authenticated_insert_po_principles"
ON po_identity_principles FOR INSERT
TO authenticated WITH CHECK (true);

-- Record the principle
INSERT INTO po_identity_principles (principle_ref, title, principle_text, recorded_by, correlation_id)
VALUES (
  'PO-PRINCIPLE-001',
  'Single Stable Engineering Identity',
  'A genuine Engineering Work Order should have one stable human-readable engineering identity from planning through implementation, verification, acceptance, closure, archive and knowledge extraction. The system must not intentionally maintain separate conversation and canonical EWO references for the same engineering work unless the Product Owner approves a documented governance reason.',
  'milljanerobinson@gmail.com',
  'EWO042S-CANONICAL-REF-CORRECTION'
)
ON CONFLICT (principle_ref) DO NOTHING;
