-- EWO-028R.1: Register inspectKnowledgeExtraction as a governed operation
-- on the engineering-work-orders capability.

UPDATE atd_connect_capabilities
SET supported_operations = (
  CASE
    WHEN supported_operations @? '$.inspectKnowledgeExtraction' THEN supported_operations
    ELSE supported_operations || '["inspectKnowledgeExtraction"]'::jsonb
  END
),
updated_at = now()
WHERE capability_id = 'engineering-work-orders';
