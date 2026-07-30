/*
# EWO-022: Canonical EWO Registration & Lifecycle Assurance

## Summary
Adds missing canonical fields to `engineering_work_orders` for tracking
implementation source, originating prompt/conversation, refinement chain,
refinement depth, and created_by. These fields are required by EWO-022 to
ensure every EWO has a canonical ledger record with full provenance.

## New Columns on `engineering_work_orders`
1. `implementation_source` (text) — where implementation originated:
   'conversation', 'chatgpt_refinement', 'atd', 'historical_recovery',
   'manual', 'autonomous', 'bolt_refinement'
2. `originating_prompt_ref` (text) — reference to the originating prompt
3. `originating_conversation_ref` (text) — reference to originating conversation
4. `refinement_chain` (text[]) — ordered array of refinement refs (e.g., ['EWO-021','EWO-021R.5','EWO-021R.6'])
5. `refinement_depth` (integer, default 0) — depth in refinement hierarchy (0 = root)
6. `created_by` (text) — who created the canonical EWO record
7. `accepted_completion_report_id` (uuid) — link to the accepted completion report
8. `accepted_refinement_version` (text) — accepted refinement version
9. `accepted_implementation_version` (text) — accepted implementation version

## Security
No new tables. No RLS changes. Existing policies on `engineering_work_orders`
remain unchanged. All columns are nullable for backward compatibility.

## Notes
- All columns use IF NOT EXISTS for idempotency
- No data is deleted or modified
- Existing EWOs will have NULL for new columns, which is intentional
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'implementation_source') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN implementation_source text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'originating_prompt_ref') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN originating_prompt_ref text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'originating_conversation_ref') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN originating_conversation_ref text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'refinement_chain') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN refinement_chain text[] DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'refinement_depth') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN refinement_depth integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'created_by') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN created_by text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'accepted_completion_report_id') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN accepted_completion_report_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'accepted_refinement_version') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN accepted_refinement_version text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'accepted_implementation_version') THEN
    ALTER TABLE engineering_work_orders ADD COLUMN accepted_implementation_version text;
  END IF;
END $$;

-- Index for duplicate detection
CREATE INDEX IF NOT EXISTS idx_ewo_ref_unique ON engineering_work_orders (ewo_ref);
CREATE INDEX IF NOT EXISTS idx_ewo_parent_ref ON engineering_work_orders (parent_ref);
CREATE INDEX IF NOT EXISTS idx_ewo_implementation_source ON engineering_work_orders (implementation_source);
