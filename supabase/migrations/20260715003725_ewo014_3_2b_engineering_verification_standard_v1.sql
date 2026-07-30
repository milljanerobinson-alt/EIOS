/*
# Engineering Verification Standard (EVS) v1.0 — EWO-014.3.2B

## Purpose
Introduces a permanent Engineering Verification Standard that every Engineering Work Order
must satisfy before it can be marked Engineering Complete. This becomes part of the EIOS
engineering constitution and governs every future EWO.

## Changes

### 1. New Table: `ewo_verification_gates`
Stores the state and evidence for each of the 5 mandatory verification gates per EWO.
- `id` — UUID primary key
- `ewo_id` — FK to `engineering_work_orders(id)` ON DELETE CASCADE
- `gate_key` — One of: build, functional, ui, data, constitutional
- `gate_label` — Human-readable label
- `gate_order` — Integer sort order (1-5)
- `status` — One of: not_started, in_progress, verified, failed (default: not_started)
- `evidence_summary` — Text summary of verification evidence
- `evidence_artefacts` — JSONB array of structured evidence (screenshots, test results, etc.)
- `verified_by` — Actor who verified
- `verified_at` — Timestamp of verification
- `failure_reason` — Text describing why the gate failed (nullable)
- `created_at` / `updated_at` — Timestamps

### 2. New Table: `ewo_verification_sessions`
Records each verification session attempt for audit purposes.
- `id` — UUID primary key
- `ewo_id` — FK to `engineering_work_orders(id)` ON DELETE CASCADE
- `session_ref` — Unique reference (VS-YYYYMMDD-NNN)
- `overall_status` — One of: not_started, in_progress, verified, not_verified (default: not_started)
- `gates_summary` — JSONB snapshot of all gate statuses at session completion
- `started_at` — When verification started
- `completed_at` — When verification completed (nullable)
- `started_by` — Actor who started the session

### 3. Column Addition: `engineering_work_orders`
- `verification_status` — TEXT, one of: not_started, in_progress, verified, not_verified (default: not_started)
- `verified_at` — TIMESTAMPTZ, when the EWO was verified (nullable)

### 4. New Table: `ecc_engineering_verification_standard`
Stores the EVS standard itself as a governed constitutional document.
- `id` — UUID primary key
- `version_number` — TEXT UNIQUE (e.g., '1.0')
- `status` — One of: draft, active, superseded, archived (default: draft)
- `title` — Standard title
- `body` — Full standard text
- `gates` — JSONB array of gate definitions
- `author` — Author
- `released_at` — Release timestamp
- `created_at` / `updated_at` — Timestamps

### 5. Seed Data
- Seeds EVS v1.0 as an active standard with 5 gate definitions
- Seeds EWO-014.3.2B as a work order for this standard

## Security
- RLS enabled on all new tables
- All authenticated users have full CRUD (consistent with existing EWO tables)

## Important Notes
1. The verification lifecycle is: Engineering Complete → Engineering Verification → Verified → Product Owner Review
2. An EWO cannot generate a completion report unless all 5 gates are verified
3. The `verification_status` column on `engineering_work_orders` is the canonical status
4. The `ewo_verification_gates` table stores per-gate evidence
5. The architecture supports future automated verification (screenshots, Playwright, etc.)
   via the `evidence_artefacts` JSONB field
*/

-- ============================================================
-- 1. Verification Standard Table
-- ============================================================

CREATE TABLE IF NOT EXISTS ecc_engineering_verification_standard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded', 'archived')),
  title text NOT NULL,
  body text,
  gates jsonb DEFAULT '[]'::jsonb,
  author text,
  released_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ecc_engineering_verification_standard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_verification_standard" ON ecc_engineering_verification_standard;
CREATE POLICY "select_verification_standard" ON ecc_engineering_verification_standard
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_verification_standard" ON ecc_engineering_verification_standard;
CREATE POLICY "insert_verification_standard" ON ecc_engineering_verification_standard
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_verification_standard" ON ecc_engineering_verification_standard;
CREATE POLICY "update_verification_standard" ON ecc_engineering_verification_standard
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_verification_standard" ON ecc_engineering_verification_standard;
CREATE POLICY "delete_verification_standard" ON ecc_engineering_verification_standard
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 2. Verification Gates Table
-- ============================================================

CREATE TABLE IF NOT EXISTS ewo_verification_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id uuid NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  gate_key text NOT NULL CHECK (gate_key IN ('build', 'functional', 'ui', 'data', 'constitutional')),
  gate_label text NOT NULL,
  gate_order integer NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'verified', 'failed')),
  evidence_summary text,
  evidence_artefacts jsonb DEFAULT '[]'::jsonb,
  verified_by text,
  verified_at timestamptz,
  failure_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(ewo_id, gate_key)
);

CREATE INDEX IF NOT EXISTS idx_verification_gates_ewo ON ewo_verification_gates(ewo_id);
CREATE INDEX IF NOT EXISTS idx_verification_gates_status ON ewo_verification_gates(status);

ALTER TABLE ewo_verification_gates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_verification_gates" ON ewo_verification_gates;
CREATE POLICY "select_verification_gates" ON ewo_verification_gates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_verification_gates" ON ewo_verification_gates;
CREATE POLICY "insert_verification_gates" ON ewo_verification_gates
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_verification_gates" ON ewo_verification_gates;
CREATE POLICY "update_verification_gates" ON ewo_verification_gates
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_verification_gates" ON ewo_verification_gates;
CREATE POLICY "delete_verification_gates" ON ewo_verification_gates
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 3. Verification Sessions Table
-- ============================================================

CREATE TABLE IF NOT EXISTS ewo_verification_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id uuid NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  session_ref text UNIQUE NOT NULL,
  overall_status text NOT NULL DEFAULT 'not_started' CHECK (overall_status IN ('not_started', 'in_progress', 'verified', 'not_verified')),
  gates_summary jsonb DEFAULT '{}'::jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  started_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_ewo ON ewo_verification_sessions(ewo_id);

ALTER TABLE ewo_verification_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_verification_sessions" ON ewo_verification_sessions;
CREATE POLICY "select_verification_sessions" ON ewo_verification_sessions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_verification_sessions" ON ewo_verification_sessions;
CREATE POLICY "insert_verification_sessions" ON ewo_verification_sessions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_verification_sessions" ON ewo_verification_sessions;
CREATE POLICY "update_verification_sessions" ON ewo_verification_sessions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_verification_sessions" ON ewo_verification_sessions;
CREATE POLICY "delete_verification_sessions" ON ewo_verification_sessions
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 4. Add verification columns to engineering_work_orders
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN verification_status text DEFAULT 'not_started'
      CHECK (verification_status IN ('not_started', 'in_progress', 'verified', 'not_verified'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'verified_at'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN verified_at timestamptz;
  END IF;
END $$;

-- ============================================================
-- 5. Seed EVS v1.0 Standard
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ecc_engineering_verification_standard WHERE version_number = '1.0'
  ) THEN
    INSERT INTO ecc_engineering_verification_standard (version_number, status, title, body, gates, author, released_at)
    VALUES (
      '1.0',
      'active',
      'Engineering Verification Standard (EVS) v1.0',
      'Every Engineering Work Order must satisfy five mandatory verification gates before it can be marked Engineering Complete. The standard ensures that Engineering Completion Reports only represent functionality that has actually been verified.',
      jsonb_build_array(
        jsonb_build_object(
          'key', 'build',
          'label', 'Build Verification',
          'order', 1,
          'requirements', jsonb_build_array(
            'Project builds successfully',
            'Zero TypeScript errors',
            'Zero build errors',
            'Database migrations apply successfully',
            'No failed dependency compilation'
          )
        ),
        jsonb_build_object(
          'key', 'functional',
          'label', 'Functional Verification',
          'order', 2,
          'requirements', jsonb_build_array(
            'Happy path works',
            'State changes occur correctly',
            'Services execute correctly',
            'APIs return expected responses',
            'Audit records created',
            'Error handling works'
          )
        ),
        jsonb_build_object(
          'key', 'ui',
          'label', 'UI Verification',
          'order', 3,
          'requirements', jsonb_build_array(
            'Correct page rendered',
            'Correct component rendered',
            'Navigation reaches correct destination',
            'No legacy component still active',
            'Buttons execute expected workflow',
            'Required forms visible',
            'Screenshots captured for evidence'
          )
        ),
        jsonb_build_object(
          'key', 'data',
          'label', 'Data Verification',
          'order', 4,
          'requirements', jsonb_build_array(
            'Database records created correctly',
            'Immutable records preserved',
            'Foreign keys valid',
            'Rollback behaviour verified',
            'No orphaned records',
            'Lineage updated correctly'
          )
        ),
        jsonb_build_object(
          'key', 'constitutional',
          'label', 'Constitutional Verification',
          'order', 5,
          'requirements', jsonb_build_array(
            'Engineering Standards followed',
            'Governance requirements satisfied',
            'Evidence complete',
            'Audit trail complete',
            'Constitutional rules enforced'
          )
        )
      ),
      'AI Technical Director',
      now()
    );
  END IF;
END $$;

-- ============================================================
-- 6. Seed EWO-014.3.2B
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.3.2B'
  ) THEN
    INSERT INTO engineering_work_orders (
      ewo_ref, title, executive_summary, priority, risk_level, status, owner, engineering_objective
    ) VALUES (
      'EWO-014.3.2B',
      'Engineering Verification Standard (EVS) v1.0',
      'Introduce a permanent Engineering Verification Standard that every Engineering Work Order must satisfy before it can be marked Engineering Complete.',
      'high',
      'medium',
      'in_progress',
      'AI Technical Director',
      'Create the EVS constitutional standard, update the engineering lifecycle, add verification gates to EWO dashboard, and design for future automation.'
    );
  END IF;
END $$;

-- ============================================================
-- 7. RPC: Initialize verification gates for an EWO
-- ============================================================

CREATE OR REPLACE FUNCTION initialize_ewo_verification_gates(p_ewo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO ewo_verification_gates (ewo_id, gate_key, gate_label, gate_order, status)
  VALUES
    (p_ewo_id, 'build',         'Build Verification',         1, 'not_started'),
    (p_ewo_id, 'functional',    'Functional Verification',    2, 'not_started'),
    (p_ewo_id, 'ui',            'UI Verification',             3, 'not_started'),
    (p_ewo_id, 'data',          'Data Verification',           4, 'not_started'),
    (p_ewo_id, 'constitutional','Constitutional Verification', 5, 'not_started')
  ON CONFLICT (ewo_id, gate_key) DO NOTHING;

  UPDATE engineering_work_orders
  SET verification_status = 'in_progress', updated_at = now()
  WHERE id = p_ewo_id AND verification_status = 'not_started';
END;
$$;

-- ============================================================
-- 8. RPC: Update a verification gate
-- ============================================================

CREATE OR REPLACE FUNCTION update_ewo_verification_gate(
  p_ewo_id uuid,
  p_gate_key text,
  p_status text,
  p_evidence_summary text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL,
  p_verified_by text DEFAULT 'platform'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_all_verified boolean;
BEGIN
  UPDATE ewo_verification_gates
  SET
    status = p_status,
    evidence_summary = COALESCE(p_evidence_summary, evidence_summary),
    failure_reason = p_failure_reason,
    verified_by = CASE WHEN p_status = 'verified' THEN p_verified_by ELSE verified_by END,
    verified_at = CASE WHEN p_status = 'verified' THEN now() ELSE verified_at END,
    updated_at = now()
  WHERE ewo_id = p_ewo_id AND gate_key = p_gate_key;

  -- Check if all gates are verified
  SELECT bool_and(status = 'verified') INTO v_all_verified
  FROM ewo_verification_gates
  WHERE ewo_id = p_ewo_id;

  IF v_all_verified THEN
    UPDATE engineering_work_orders
    SET verification_status = 'verified', verified_at = now(), updated_at = now()
    WHERE id = p_ewo_id;
  ELSE
    -- If any gate failed, mark as not_verified
    IF EXISTS (
      SELECT 1 FROM ewo_verification_gates
      WHERE ewo_id = p_ewo_id AND status = 'failed'
    ) THEN
      UPDATE engineering_work_orders
      SET verification_status = 'not_verified', updated_at = now()
      WHERE id = p_ewo_id;
    ELSE
      UPDATE engineering_work_orders
      SET verification_status = 'in_progress', updated_at = now()
      WHERE id = p_ewo_id AND verification_status != 'verified';
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- 9. RPC: Get verification summary for an EWO
-- ============================================================

CREATE OR REPLACE FUNCTION get_ewo_verification_summary(p_ewo_id uuid)
RETURNS TABLE(
  gate_key text,
  gate_label text,
  gate_order integer,
  status text,
  evidence_summary text,
  verified_by text,
  verified_at timestamptz,
  failure_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.gate_key,
    g.gate_label,
    g.gate_order,
    g.status,
    g.evidence_summary,
    g.verified_by,
    g.verified_at,
    g.failure_reason
  FROM ewo_verification_gates g
  WHERE g.ewo_id = p_ewo_id
  ORDER BY g.gate_order;
END;
$$;
