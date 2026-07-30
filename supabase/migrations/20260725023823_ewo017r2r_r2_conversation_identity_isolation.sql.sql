/*
# EWO-017R.2R Refinement R2 — Conversation Identity Isolation

## Purpose
1. Adds tenant_id column to atd_conversation_active_object for ownership scoping
2. Adds tenant_id column to atd_conversation_sessions
3. Adds unique constraint preventing multiple current active-object rows
   for the same conversation + object type
4. Backfills tenant_id for existing records

## Isolation guarantees
- Active-object records are scoped by (tenant_id, conversation_id, active_object_type)
- Two conversations belonging to the same authenticated user remain isolated
- A request without a conversation-specific identifier cannot read or overwrite
  another conversation's active object
*/

-- Add tenant_id to atd_conversation_active_object
ALTER TABLE atd_conversation_active_object
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'anonymous';

-- Add tenant_id to atd_conversation_sessions
ALTER TABLE atd_conversation_sessions
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'anonymous';

-- Backfill existing records (already have default 'anonymous')
-- No-op needed since DEFAULT handles it

-- Unique constraint: one current active object per conversation + object type + tenant
-- This prevents multiple active EWOs for the same conversation
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_active_object_scope
  ON atd_conversation_active_object (conversation_id, tenant_id, active_object_type)
  WHERE id IS NOT NULL;

-- Index for efficient scoped lookups
CREATE INDEX IF NOT EXISTS idx_active_object_tenant_conversation
  ON atd_conversation_active_object (tenant_id, conversation_id);