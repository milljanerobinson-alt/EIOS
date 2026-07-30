
/*
# EWO-011.2A — Constitutional Execution Bridge Integrity Closeout

## Summary
Adds idempotency and performance indexes to support the EWO-011.2A integrity closeout:

1. **Idempotency constraint** — UNIQUE constraint on `engineering_idea.session_id` prevents
   duplicate Engineering Ideas from being created when the bridge execution is retried.
   One Engineering Idea per Execution Session is enforced at the database level.

2. **Intent → Idea index** — B-tree index on `engineering_idea.intent_id` for fast lookup
   of the linked Engineering Idea from an Engineering Intent. Used by `IntentDetailPanel`
   for DB-backed persisted conversation linkage (replaces session-only React state).

3. **Record semantic_metadata GIN index** — GIN index on
   `engineering_records_library.semantic_metadata` for fast lookup of Engineering Records
   by `idea_ref`, `intent_ref`, `session_ref`, or `bridge` fields stored in the JSONB column.

## New Constraints
- `engineering_idea_session_id_unique` UNIQUE on `engineering_idea(session_id)` — nullable,
  so NULL session_id rows are exempt (existing ideas without sessions are unaffected).

## New Indexes
- `idx_engineering_idea_intent_id` on `engineering_idea(intent_id)`
- `idx_engineering_records_library_semantic_metadata` GIN on
  `engineering_records_library(semantic_metadata)`

## Security
No RLS changes. Existing policies are unaffected.

## Notes
1. All statements are idempotent (IF NOT EXISTS / conditional DO block).
2. UNIQUE on a nullable column: PostgreSQL treats NULLs as distinct, so two rows with
   NULL session_id will NOT conflict — this is the correct behaviour (legacy ideas).
3. The session_id UNIQUE constraint is partial in intent: a non-null session_id must be
   unique. Because NULL values are already distinct, no partial index is needed.
*/

-- 1. Idempotency: one Engineering Idea per non-null Execution Session
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'engineering_idea_session_id_unique'
      AND conrelid = 'engineering_idea'::regclass
  ) THEN
    ALTER TABLE engineering_idea
    ADD CONSTRAINT engineering_idea_session_id_unique
    UNIQUE (session_id);
  END IF;
END $$;

-- 2. Index: fast intent → idea lookup (DB-backed ATD conversation linkage)
CREATE INDEX IF NOT EXISTS idx_engineering_idea_intent_id
ON engineering_idea(intent_id);

-- 3. GIN index: fast semantic_metadata field lookup on Engineering Records
CREATE INDEX IF NOT EXISTS idx_engineering_records_library_semantic_metadata
ON engineering_records_library USING gin(semantic_metadata);
