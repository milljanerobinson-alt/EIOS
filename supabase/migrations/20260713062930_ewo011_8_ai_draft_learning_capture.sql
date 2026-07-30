/*
# EWO-011.8 — AI Draft Learning Capture Schema

## Summary
Adds AI-assisted draft generation support to Engineering Analysis and Engineering Plan tables.
Each record now tracks the original AI-generated draft alongside the Product Owner's approved
version, enabling a learning feedback loop.

## Changes to `atd_engineering_analyses`
- `ai_draft_summary` (text): AI-generated summary draft, before PO editing
- `ai_draft_constitution_review` (text): AI-generated constitution review draft
- `ai_draft_architecture_notes` (text): AI-generated architecture notes draft
- `ai_draft_product_intelligence_notes` (text): AI-generated product intelligence draft
- `ai_draft_complexity_assessment` (text): AI-assessed complexity before PO confirmation
- `ai_confidence_score` (text): AI confidence level — high / medium / low
- `ai_confidence_explanation` (text): Human-readable explanation of the confidence score
- `ai_evidence` (jsonb): Supporting evidence used by AI — constitutional standards, related intents, knowledge records
- `ai_generated_at` (timestamptz): When the AI draft was generated
- `po_edits_made` (boolean): Whether the PO modified the AI draft before approval
- `original_ai_draft` (jsonb): Snapshot of the complete original AI draft payload for audit/learning
- `generation_count` (integer): How many times the AI draft was regenerated

## Changes to `atd_engineering_plans`
- `ai_draft_executive_summary` (text): AI-generated executive summary draft
- `ai_draft_engineering_strategy` (text): AI-generated strategy draft
- `ai_draft_recommended_approach` (text): AI-generated approach draft
- `ai_draft_estimated_effort` (text): AI-generated effort estimate draft
- `ai_confidence_score` (text): AI confidence level — high / medium / low
- `ai_confidence_explanation` (text): Human-readable explanation of the confidence score
- `ai_evidence` (jsonb): Supporting evidence used by AI
- `ai_generated_at` (timestamptz): When the AI draft was generated
- `po_edits_made` (boolean): Whether the PO modified the AI draft before approval
- `original_ai_draft` (jsonb): Snapshot of the complete original AI draft payload for audit/learning
- `generation_count` (integer): How many times the AI draft was regenerated

## Security
- RLS already enabled on both tables; no policy changes required (policies are inherited)

## Notes
1. All new columns are nullable — existing rows are unaffected.
2. `original_ai_draft` stores the full draft as JSON for future model fine-tuning.
3. `generation_count` is incremented each time the user clicks "Regenerate".
4. `po_edits_made` is set true when the approved field values differ from the ai_draft_ fields.
*/

-- ─── Engineering Analyses: AI draft columns ────────────────────────────────────

ALTER TABLE atd_engineering_analyses
  ADD COLUMN IF NOT EXISTS ai_draft_summary                  text,
  ADD COLUMN IF NOT EXISTS ai_draft_constitution_review      text,
  ADD COLUMN IF NOT EXISTS ai_draft_architecture_notes       text,
  ADD COLUMN IF NOT EXISTS ai_draft_product_intelligence_notes text,
  ADD COLUMN IF NOT EXISTS ai_draft_complexity_assessment    text CHECK (
    ai_draft_complexity_assessment IS NULL OR
    ai_draft_complexity_assessment IN ('low', 'medium', 'high', 'critical')
  ),
  ADD COLUMN IF NOT EXISTS ai_confidence_score               text CHECK (
    ai_confidence_score IS NULL OR
    ai_confidence_score IN ('high', 'medium', 'low')
  ),
  ADD COLUMN IF NOT EXISTS ai_confidence_explanation         text,
  ADD COLUMN IF NOT EXISTS ai_evidence                       jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_generated_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS po_edits_made                     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_ai_draft                 jsonb,
  ADD COLUMN IF NOT EXISTS generation_count                  integer DEFAULT 0;

-- ─── Engineering Plans: AI draft columns ──────────────────────────────────────

ALTER TABLE atd_engineering_plans
  ADD COLUMN IF NOT EXISTS ai_draft_executive_summary        text,
  ADD COLUMN IF NOT EXISTS ai_draft_engineering_strategy     text,
  ADD COLUMN IF NOT EXISTS ai_draft_recommended_approach     text,
  ADD COLUMN IF NOT EXISTS ai_draft_estimated_effort         text,
  ADD COLUMN IF NOT EXISTS ai_confidence_score               text CHECK (
    ai_confidence_score IS NULL OR
    ai_confidence_score IN ('high', 'medium', 'low')
  ),
  ADD COLUMN IF NOT EXISTS ai_confidence_explanation         text,
  ADD COLUMN IF NOT EXISTS ai_evidence                       jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_generated_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS po_edits_made                     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_ai_draft                 jsonb,
  ADD COLUMN IF NOT EXISTS generation_count                  integer DEFAULT 0;
