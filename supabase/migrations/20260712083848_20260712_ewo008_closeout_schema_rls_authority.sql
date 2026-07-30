/*
# EWO-008 Closeout: Schema Enhancements, Append-Only RLS, PO Authority Model

## Summary
Constitutional closeout schema migration for EWO-008.

## Changes

### 1. engineering_records_library — authority and supersession columns
- authority_state: tracks whether a record is provisional, authoritative, non_authoritative, or superseded
- supersedes_record_id: FK to the record this one corrects/supersedes (append-only correction mechanism)
- correction_reason: why the superseded record was non-authoritative
- correcting_authority: who authorised the correction
- correction_timestamp: when the correction was recorded
- source_evidence: verifiable evidence backing this record
- po_accepted_at / po_accepted_by / po_acceptance_statement: PO acceptance fields

### 2. engineering_work_orders — PO authority lifecycle fields
- implementation_complete_at / ready_for_review_at: lifecycle tracking
- po_accepted_at / po_accepted_by / po_acceptance_statement / po_accepted_ewo_version / po_acceptance_conditions

### 3. engineering_automation_rules — idempotency and PO-authority
- requires_po_authority: flag that this rule's action requires PO acceptance before firing
- idempotency_key_template: template for computing unique key per execution

### 4. engineering_automation_events — idempotency and provenance
- idempotency_key: unique key preventing duplicate event processing (UNIQUE constraint)
- initiated_by: records who or what initiated each lifecycle transition

### 5. RLS — Append-Only Enforcement
- engineering_records_library: DROP UPDATE and DELETE policies (records are immutable once created)
- engineering_automation_events: DROP UPDATE and DELETE policies (events are immutable audit log)
- constitutional_documents: DROP DELETE policy (documents are permanent; amendments create new docs)

### 6. Automation rules correction
- RULE-001 (ewo_closed → create_library_record): DISABLED — only PO acceptance authorises a library record
- RULE-002: renamed to reflect PO-acceptance trigger, marked requires_po_authority=true

## Security Notes
- Ordinary authenticated users can no longer UPDATE or DELETE engineering_records_library rows
- Ordinary authenticated users can no longer UPDATE or DELETE engineering_automation_events rows
- Service-role (edge functions) bypasses RLS and can perform administrative corrections
- constitutional_documents has no DELETE policy — documents are permanent

## Important
This migration runs with elevated privileges. The UPDATE/DELETE policies being dropped
existed from the initial foundation migration and were placeholders. Removing them BEFORE
any user data is accepted as authoritative is the constitutionally safe correction window.
*/

-- ─── 1. engineering_records_library — authority/supersession columns ──────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='authority_state') THEN
    ALTER TABLE engineering_records_library ADD COLUMN authority_state text NOT NULL DEFAULT 'provisional';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='supersedes_record_id') THEN
    ALTER TABLE engineering_records_library ADD COLUMN supersedes_record_id uuid REFERENCES engineering_records_library(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='correction_reason') THEN
    ALTER TABLE engineering_records_library ADD COLUMN correction_reason text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='correcting_authority') THEN
    ALTER TABLE engineering_records_library ADD COLUMN correcting_authority text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='correction_timestamp') THEN
    ALTER TABLE engineering_records_library ADD COLUMN correction_timestamp timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='source_evidence') THEN
    ALTER TABLE engineering_records_library ADD COLUMN source_evidence text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='po_accepted_at') THEN
    ALTER TABLE engineering_records_library ADD COLUMN po_accepted_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='po_accepted_by') THEN
    ALTER TABLE engineering_records_library ADD COLUMN po_accepted_by text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='po_acceptance_statement') THEN
    ALTER TABLE engineering_records_library ADD COLUMN po_acceptance_statement text;
  END IF;
END $$;

-- ─── 2. engineering_work_orders — PO authority lifecycle fields ───────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_work_orders' AND column_name='implementation_complete_at') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN implementation_complete_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_work_orders' AND column_name='ready_for_review_at') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN ready_for_review_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_work_orders' AND column_name='po_accepted_at') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN po_accepted_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_work_orders' AND column_name='po_accepted_by') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN po_accepted_by text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_work_orders' AND column_name='po_acceptance_statement') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN po_acceptance_statement text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_work_orders' AND column_name='po_accepted_ewo_version') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN po_accepted_ewo_version text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_work_orders' AND column_name='po_acceptance_conditions') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN po_acceptance_conditions text;
  END IF;
END $$;

-- ─── 3. engineering_automation_rules — idempotency and authority fields ───────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_automation_rules' AND column_name='requires_po_authority') THEN
    ALTER TABLE engineering_automation_rules ADD COLUMN requires_po_authority boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_automation_rules' AND column_name='idempotency_key_template') THEN
    ALTER TABLE engineering_automation_rules ADD COLUMN idempotency_key_template text;
  END IF;
END $$;

-- ─── 4. engineering_automation_events — idempotency and provenance ────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_automation_events' AND column_name='initiated_by') THEN
    ALTER TABLE engineering_automation_events ADD COLUMN initiated_by text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_automation_events' AND column_name='idempotency_key') THEN
    ALTER TABLE engineering_automation_events ADD COLUMN idempotency_key text;
  END IF;
END $$;

-- Unique constraint on idempotency_key (non-null only) for replay protection
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename='engineering_automation_events' AND indexname='idx_auto_events_idempotency_key'
  ) THEN
    CREATE UNIQUE INDEX idx_auto_events_idempotency_key
      ON engineering_automation_events (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- ─── 5. RLS — Append-Only enforcement ────────────────────────────────────────

-- engineering_records_library: drop UPDATE and DELETE (append-only)
DROP POLICY IF EXISTS "auth_update_erl" ON engineering_records_library;
DROP POLICY IF EXISTS "auth_delete_erl" ON engineering_records_library;

-- engineering_automation_events: drop UPDATE and DELETE (immutable audit log)
DROP POLICY IF EXISTS "auth_update_auto_events" ON engineering_automation_events;
DROP POLICY IF EXISTS "auth_delete_auto_events" ON engineering_automation_events;
-- Note: there was no DELETE policy on events from original migration — this is a no-op but safe

-- constitutional_documents: drop DELETE (documents are permanent; amendments create new docs)
DROP POLICY IF EXISTS "auth_delete_const_docs" ON constitutional_documents;

-- ─── 6. Automation rules correction ──────────────────────────────────────────

-- RULE-001: disable — closing an EWO must NOT create an authoritative library record.
-- Only PO acceptance (ewo_po_accepted) authorises creation of an authoritative record.
UPDATE engineering_automation_rules
SET
  is_enabled = false,
  requires_po_authority = false,
  description = 'DISABLED — superseded by RULE-002. Closing an EWO does not create an authoritative library record. Only Product Owner acceptance authorises authoritative record creation. This rule is retained for audit lineage but must not be re-enabled without constitutional review.',
  idempotency_key_template = 'ewo_closed:{source_ref}:{record_type}:v{version}',
  updated_at = NOW()
WHERE rule_ref = 'RULE-001';

-- RULE-002: update to reflect PO-authority requirement and add idempotency
UPDATE engineering_automation_rules
SET
  name = 'Create Authoritative Engineering Record on PO Acceptance',
  description = 'Creates an authoritative engineering_records_library entry when a Product Owner accepts an EWO (ewo_po_accepted event). This is the SOLE automation rule that produces authoritative engineering records. Product Owner Accepted is the canonical event that authorises record creation. Idempotency key prevents duplicate records from replayed events.',
  requires_po_authority = true,
  idempotency_key_template = 'ewo_po_accepted:{source_ref}:v{version}',
  action_config = jsonb_build_object(
    'record_type', 'completion_report',
    'status', 'authoritative',
    'authority_state', 'authoritative',
    'requires_po_accepted_status', true,
    'idempotency_check', true,
    'include_po_acceptance_data', true,
    'include_ewo_content', true
  ),
  updated_at = NOW()
WHERE rule_ref = 'RULE-002';
