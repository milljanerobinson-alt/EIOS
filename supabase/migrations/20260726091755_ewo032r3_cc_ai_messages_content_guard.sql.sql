-- EWO-032R.3: Add CHECK constraint to prevent null/empty content on new conversational messages.
-- The content column is already NOT NULL. This adds an explicit CHECK to enforce
-- that normal user and assistant messages always have non-empty text.
-- Uses NOT VALID so existing 3 empty-string rows are not affected — only new inserts are checked.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cc_ai_messages_content_not_blank'
      AND conrelid = 'public.cc_ai_messages'::regclass
  ) THEN
    ALTER TABLE public.cc_ai_messages
      ADD CONSTRAINT cc_ai_messages_content_not_blank
      CHECK (content IS NOT NULL AND content != '')
      NOT VALID;
  END IF;
END $$;
