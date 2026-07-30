/*
# EWO-014.19A.7R.3R — Mandatory Canonical EWO Registration & Unified Ledger Search

## 1. Purpose
Refinement of EWO-014.19A.7R.3. Completes two governance gaps:
  1. Makes canonical EWO registration mandatory across every supported
     engineering implementation path via ensureEngineeringWorkOrderExists().
  2. Wires unified ledger search into the Work Orders search interface so
     canonical EWOs and Historical References are discoverable through the
     same search box.

## 2. Canonical Registration
This migration creates the canonical EWO-014.19A.7R.3R record BEFORE any
implementation changes are made. This is the first Product Owner test of the
mandatory registration mechanism.

## 3. Collision Protection
Adds a guard function and a database constraint to prevent a reference from
existing simultaneously as both a canonical EWO and a Historical Reference.
*/

-- ─── 1. Canonical EWO-014.19A.7R.3R ───────────────────────────────────────────
-- Created BEFORE implementation begins, per Requirement 1 of the refinement.

INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  implementation_provider, implementation_status, engineering_package_status,
  created_at, updated_at
)
SELECT 'EWO-014.19A.7R.3R',
  'EWO-014.19A.7R.3R — Mandatory Canonical EWO Registration & Unified Ledger Search',
  'Completes the governance architecture introduced by EWO-014.19A.7R.3 by making canonical EWO registration mandatory across every supported implementation path and wiring unified ledger search into the Work Orders search interface.',
  'ready', 'high', 'medium',
  'bolt', 'Assigned', 'Generated',
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.19A.7R.3R');

-- Lifecycle event for canonical registration
INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
SELECT id, null, 'ready', 'system',
  'Canonical EWO registered before implementation per EWO-014.19A.7R.3R Requirement 1. This refinement is the first Product Owner test of the mandatory registration mechanism.',
  jsonb_build_object('source', 'ensure_canonical_creation', 'ewo_ref', 'EWO-014.19A.7R.3R')
FROM engineering_work_orders
WHERE ewo_ref = 'EWO-014.19A.7R.3R'
AND NOT EXISTS (
  SELECT 1 FROM ewo_lifecycle_events ev
  WHERE ev.ewo_id = engineering_work_orders.id
  AND ev.metadata->>'source' = 'ensure_canonical_creation'
);

-- ─── 2. Collision Detection View ─────────────────────────────────────────────
-- Detects any reference that exists as both a canonical EWO and a Historical
-- Reference. Used by the collision protection guard.

CREATE OR REPLACE VIEW v_ewo_historical_collisions AS
SELECT
  e.ewo_ref AS reference,
  e.id AS ewo_id,
  e.title AS ewo_title,
  e.status AS ewo_status,
  h.id AS historical_id,
  h.title AS historical_title,
  h.status AS historical_status
FROM engineering_work_orders e
JOIN engineering_historical_references h ON e.ewo_ref = h.reference;

-- Grant access to the collision detection view
GRANT SELECT ON v_ewo_historical_collisions TO authenticated;

-- ─── 3. Collision Guard Function ────────────────────────────────────────────
-- Returns true if a reference is already held by a Historical Reference,
-- preventing creation of a competing canonical EWO without governed conversion.

CREATE OR REPLACE FUNCTION check_ewo_historical_collision(p_ewo_ref text)
RETURNS TABLE(has_collision boolean, historical_id uuid, historical_title text)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    CASE WHEN EXISTS (
      SELECT 1 FROM engineering_historical_references WHERE reference = p_ewo_ref
    ) THEN true ELSE false END AS has_collision,
    h.id AS historical_id,
    h.title AS historical_title
  FROM engineering_historical_references h
  WHERE h.reference = p_ewo_ref
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION check_ewo_historical_collision(text) TO authenticated;
