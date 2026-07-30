/*
# ECC Phase 3 — ADR, AI Journal & Documentation enhancements

Adds missing fields to three existing ECC tables so they can fully support
Architecture Decision Records (ADRs), the AI Collaboration Journal, and
the Documentation Library.

## 1. ecc_architecture_reviews — ADR fields

| Column             | Type      | Purpose                                              |
|--------------------|-----------|------------------------------------------------------|
| adr_number         | text      | Sequential ADR reference e.g. "ADR-001"              |
| context            | text      | Background / forces that drove the decision          |
| decision           | text      | The decision that was made                           |
| rationale          | text      | Why this option was chosen                           |
| consequences       | text      | What changes as a result                             |
| alternatives       | text      | Other options that were considered                   |
| implementation_date| date      | When the decision was implemented                    |
| linked_release_ids | uuid[]    | Releases associated with this ADR                    |
| status             | text      | proposed / accepted / deprecated / superseded        |

## 2. ecc_ai_journal — collaboration detail fields

| Column          | Type      | Purpose                                              |
|-----------------|-----------|------------------------------------------------------|
| db_migrations   | text[]    | Migrations applied during the session                |
| edge_functions  | text[]    | Edge functions deployed or modified                  |
| lessons_learned | text      | Key takeaways from the session                       |

## 3. ecc_documentation — library metadata and cross-links

| Column             | Type      | Purpose                                              |
|--------------------|-----------|------------------------------------------------------|
| author             | text      | Who wrote or owns this document                      |
| version            | text      | Document version e.g. "1.0", "2.3"                   |
| status             | text      | draft / published / archived (default draft)         |
| linked_backlog_ids | uuid[]    | Backlog items this document relates to               |
| linked_release_ids | uuid[]    | Releases this document covers                        |
| linked_adr_ids     | uuid[]    | ADRs this document references                        |

## Security

No new tables. All column additions are non-destructive with safe defaults.
Existing data is completely untouched.
*/

-- ─── ecc_architecture_reviews ─────────────────────────────────────────────────

ALTER TABLE ecc_architecture_reviews
  ADD COLUMN IF NOT EXISTS adr_number          text,
  ADD COLUMN IF NOT EXISTS context             text,
  ADD COLUMN IF NOT EXISTS decision            text,
  ADD COLUMN IF NOT EXISTS rationale           text,
  ADD COLUMN IF NOT EXISTS consequences        text,
  ADD COLUMN IF NOT EXISTS alternatives        text,
  ADD COLUMN IF NOT EXISTS implementation_date date,
  ADD COLUMN IF NOT EXISTS linked_release_ids  uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status              text NOT NULL DEFAULT 'proposed';

-- ─── ecc_ai_journal ───────────────────────────────────────────────────────────

ALTER TABLE ecc_ai_journal
  ADD COLUMN IF NOT EXISTS db_migrations  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS edge_functions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lessons_learned text;

-- ─── ecc_documentation ────────────────────────────────────────────────────────

ALTER TABLE ecc_documentation
  ADD COLUMN IF NOT EXISTS author             text,
  ADD COLUMN IF NOT EXISTS version            text,
  ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS linked_backlog_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_release_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_adr_ids     uuid[] NOT NULL DEFAULT '{}';
