/*
# ECC Phase 2 — Relational Columns & Enhanced Fields

Adds missing fields to three existing ECC tables so that Backlog, Testing and Release records
can be fully linked to each other and carry the richer metadata required by the new
Product Backlog, Testing Centre, and Release Management specs.

## 1. ecc_backlog_items — new columns

| Column           | Type      | Purpose                                              |
|------------------|-----------|------------------------------------------------------|
| workstream       | text      | Business/engineering workstream (e.g. "Platform")   |
| milestone        | text      | Target milestone or sprint (e.g. "M1 — Auth")        |
| owner            | text      | Person responsible for this item                     |
| attachments      | text[]    | List of attachment URLs or file references           |
| linked_ai_ids    | uuid[]    | References to ecc_ai_journal entries                 |

Existing columns preserved: all.

## 2. ecc_testing_reports — new columns

| Column              | Type      | Purpose                                              |
|---------------------|-----------|------------------------------------------------------|
| objective           | text      | What this test session aims to verify                |
| edge_cases          | text      | Edge cases covered in this test run                  |
| screenshots         | text[]    | Screenshot URLs or file paths                        |
| linked_release_ids  | uuid[]    | References to ecc_releases rows                      |

Also extends the result value set to allow 'passed_with_observations'.

## 3. ecc_releases — new columns

| Column              | Type      | Purpose                                              |
|---------------------|-----------|------------------------------------------------------|
| name                | text      | Human-readable release name                          |
| scope               | text      | Scope description for this release                   |
| edge_functions      | text[]    | Edge functions deployed in this release              |
| ui_changes          | text[]    | UI change descriptions                               |
| risks               | text      | Known risks for this release                         |
| production_status   | text      | Current production state (default: pending)          |
| included_backlog_ids| uuid[]    | Backlog items shipped in this release                |
| linked_testing_ids  | uuid[]    | Testing reports covering this release                |

Also extends the status value set: draft, testing, ready, released, hotfix.

## Security

No new tables — no new RLS policies needed. All additions are non-destructive columns
with safe defaults. Existing data is untouched.
*/

-- ─── ecc_backlog_items ────────────────────────────────────────────────────────

ALTER TABLE ecc_backlog_items
  ADD COLUMN IF NOT EXISTS workstream    text,
  ADD COLUMN IF NOT EXISTS milestone     text,
  ADD COLUMN IF NOT EXISTS owner         text,
  ADD COLUMN IF NOT EXISTS attachments   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_ai_ids uuid[] DEFAULT '{}';

-- ─── ecc_testing_reports ─────────────────────────────────────────────────────

ALTER TABLE ecc_testing_reports
  ADD COLUMN IF NOT EXISTS objective          text,
  ADD COLUMN IF NOT EXISTS edge_cases         text,
  ADD COLUMN IF NOT EXISTS screenshots        text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_release_ids uuid[] DEFAULT '{}';

-- ─── ecc_releases ─────────────────────────────────────────────────────────────

ALTER TABLE ecc_releases
  ADD COLUMN IF NOT EXISTS name                 text,
  ADD COLUMN IF NOT EXISTS scope                text,
  ADD COLUMN IF NOT EXISTS edge_functions       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ui_changes           text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS risks                text,
  ADD COLUMN IF NOT EXISTS production_status    text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS included_backlog_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_testing_ids   uuid[] DEFAULT '{}';
