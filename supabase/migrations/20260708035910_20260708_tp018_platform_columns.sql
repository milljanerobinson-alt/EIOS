/*
# TP-018: Platform Layer Columns

Adds platform architecture classification columns to existing tables:

## Modified Tables

### ecc_conversation_intelligence
New columns for TP-018 platform layer classification:
  - platform_layer (text): core_platform | domain_module | infrastructure | mixed — which layer this conversation pertains to
  - affected_modules (text[]): slugs of ATD modules referenced in this conversation
  - reusable_knowledge (bool): whether the intelligence in this conversation is reusable across products
  - domain_knowledge (bool): whether the intelligence is LLN+D specific
  - future_platform_value (text): low | medium | high — assessed value for future platform extraction

### ecc_engineering_memory
New column for learning classification:
  - learning_classification (text): platform | domain | infrastructure | engineering_practice | commercial_platform | future_product

## Security
No new tables — existing RLS policies cover new columns automatically.

## Important Notes
1. All new columns are nullable with sensible defaults.
2. Uses IF NOT EXISTS pattern for idempotency (via DO $$ blocks).
3. Data backfill not required — columns populated on next indexing operation.
*/

-- ─── ecc_conversation_intelligence columns ────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_conversation_intelligence' AND column_name = 'platform_layer'
  ) THEN
    ALTER TABLE ecc_conversation_intelligence
      ADD COLUMN platform_layer text CHECK (platform_layer IN ('core_platform', 'domain_module', 'infrastructure', 'mixed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_conversation_intelligence' AND column_name = 'affected_modules'
  ) THEN
    ALTER TABLE ecc_conversation_intelligence ADD COLUMN affected_modules text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_conversation_intelligence' AND column_name = 'reusable_knowledge'
  ) THEN
    ALTER TABLE ecc_conversation_intelligence ADD COLUMN reusable_knowledge boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_conversation_intelligence' AND column_name = 'domain_knowledge'
  ) THEN
    ALTER TABLE ecc_conversation_intelligence ADD COLUMN domain_knowledge boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_conversation_intelligence' AND column_name = 'future_platform_value'
  ) THEN
    ALTER TABLE ecc_conversation_intelligence
      ADD COLUMN future_platform_value text DEFAULT 'low' CHECK (future_platform_value IN ('low', 'medium', 'high'));
  END IF;
END $$;

-- ─── ecc_engineering_memory learning_classification column ────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_engineering_memory' AND column_name = 'learning_classification'
  ) THEN
    ALTER TABLE ecc_engineering_memory
      ADD COLUMN learning_classification text DEFAULT 'engineering_practice'
        CHECK (learning_classification IN (
          'platform', 'domain', 'infrastructure',
          'engineering_practice', 'commercial_platform', 'future_product'
        ));
  END IF;
END $$;
