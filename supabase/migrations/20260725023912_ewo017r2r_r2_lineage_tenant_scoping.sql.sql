/*
# EWO-017R.2R R2 — Add tenant_id to conversation lineage tables
*/

ALTER TABLE ecc_conversation_artefact_links
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'anonymous';

ALTER TABLE eil_conversation_lineage
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'anonymous';

CREATE INDEX IF NOT EXISTS idx_artefact_links_tenant_conversation
  ON ecc_conversation_artefact_links (tenant_id, conversation_id);

CREATE INDEX IF NOT EXISTS idx_lineage_tenant_conversation
  ON eil_conversation_lineage (tenant_id, conversation_id);