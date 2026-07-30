-- EWO-017 — MCP Capability Inspection Governance Refinement
-- Adds fields required for governed capability metadata inspection:
-- purpose, dependencies, supported_object_types, current_availability,
-- authentication_requirements

ALTER TABLE atd_connect_capabilities
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS dependencies jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS supported_object_types jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS current_availability text DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS authentication_requirements jsonb DEFAULT '{}'::jsonb;

-- Backfill purpose from description where purpose is null
UPDATE atd_connect_capabilities
SET purpose = description
WHERE purpose IS NULL;

-- Backfill supported_object_types from known capability definitions
UPDATE atd_connect_capabilities SET supported_object_types = '["engineering_record"]'::jsonb WHERE capability_id = 'engineering-records';
UPDATE atd_connect_capabilities SET supported_object_types = '["engineering_work_order"]'::jsonb WHERE capability_id = 'engineering-work-orders';
UPDATE atd_connect_capabilities SET supported_object_types = '["completion_report"]'::jsonb WHERE capability_id = 'completion-reports';
UPDATE atd_connect_capabilities SET supported_object_types = '["engineering_package"]'::jsonb WHERE capability_id = 'engineering-packages';
UPDATE atd_connect_capabilities SET supported_object_types = '["engineering_plan"]'::jsonb WHERE capability_id = 'engineering-plans';
UPDATE atd_connect_capabilities SET supported_object_types = '["memory_entry"]'::jsonb WHERE capability_id = 'memory';
UPDATE atd_connect_capabilities SET supported_object_types = '["knowledge_object"]'::jsonb WHERE capability_id = 'knowledge';
UPDATE atd_connect_capabilities SET supported_object_types = '["lineage_record"]'::jsonb WHERE capability_id = 'lineage';
UPDATE atd_connect_capabilities SET supported_object_types = '["platform_page"]'::jsonb WHERE capability_id = 'pages';
UPDATE atd_connect_capabilities SET supported_object_types = '["workspace"]'::jsonb WHERE capability_id = 'workspaces';
UPDATE atd_connect_capabilities SET supported_object_types = '["platform_service"]'::jsonb WHERE capability_id = 'services';
UPDATE atd_connect_capabilities SET supported_object_types = '["engineering_standard"]'::jsonb WHERE capability_id = 'standards';
UPDATE atd_connect_capabilities SET supported_object_types = '["constitutional_amendment"]'::jsonb WHERE capability_id = 'constitution';

-- Backfill dependencies from relationships where dependencies is empty
UPDATE atd_connect_capabilities
SET dependencies = relationships::jsonb
WHERE dependencies = '[]'::jsonb AND relationships IS NOT NULL AND jsonb_array_length(relationships) > 0;

-- Backfill authentication_requirements
UPDATE atd_connect_capabilities
SET authentication_requirements = '{"authentication": "required", "token_type": "jwt_anon_key", "persona": "atd or authenticated user"}'::jsonb
WHERE authentication_requirements = '{}'::jsonb;
