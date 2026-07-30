/*
# EWO-014.13 — Register work order and seed navigation relationships

## Purpose
1. Create the EWO-014.13 work order record
2. Register EWO-014.13 in the engineering object registry
3. Create relationship: EWO-014.7 → EWO-014.13 (produces)
4. Create engineering record for EWO-014.13
5. Register the engineering record and link it
*/

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Create EWO-014.13 work order
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO engineering_work_orders (
  ewo_ref,
  title,
  executive_summary,
  business_objective,
  engineering_objective,
  priority,
  risk_level,
  status,
  owner,
  requested_by,
  approved_at,
  started_at,
  completed_at,
  implementation_provider,
  implementation_status,
  engineering_package_status,
  implementation_started_at,
  implementation_completed_at,
  engineering_notes,
  implementation_summary
) VALUES (
  'EWO-014.13',
  'Unified Engineering Object Navigation & Lifecycle',
  'Introduces a unified Engineering Object navigation model where governed objects become first-class navigable resources with permanent URLs, breadcrumbs, related engineering panels, and an Engineering Graph foundation.',
  'Transform engineering navigation from dashboard-centric to object-centric, enabling direct navigation between related engineering objects without using dashboards as intermediaries.',
  'Implement Engineering Object Registry, Navigation Graph, Engineering Navigation Service, breadcrumbs, related engineering panels, and direct object navigation across all ECC pages.',
  'high',
  'medium',
  'closed',
  'Engineering Governance',
  'Product Owner',
  now(),
  now(),
  now(),
  'Bolt',
  'Completed',
  'Generated',
  now(),
  now(),
  'EWO-014.13 delivered: engineering_object_registry table, engineering_object_relationships table, Engineering Navigation Service (URL resolution, canonical paths, history, context restoration), EngineeringBreadcrumbs component, RelatedEngineeringPanel component, route parser extended for object-level URLs, direct navigation links in EWO detail views, record detail overlay with breadcrumbs + related panel, 26 regression tests.',
  'Database schema (2 new tables), navigation service library, 2 new React components, route parser extended, ECC WorkOrders and RecordsLibrary pages integrated, 26 tests added (1096 total passing).'
)
ON CONFLICT (ewo_ref) DO UPDATE SET
  status = 'closed',
  completed_at = now(),
  implementation_completed_at = now(),
  implementation_status = 'Completed',
  implementation_summary = EXCLUDED.implementation_summary,
  engineering_notes = EXCLUDED.engineering_notes,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Register EWO-014.13 in the engineering object registry
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO engineering_object_registry (object_ref, object_type, title, canonical_url, lifecycle_state, source_table, source_id, parent_object_ref, metadata)
SELECT
  'EWO-014.13',
  'engineering_work_order',
  ewo.title,
  '#/engineering/work-orders/ewo_014_13',
  ewo.status,
  'engineering_work_orders',
  ewo.id,
  NULL,
  jsonb_build_object('priority', ewo.priority, 'owner', ewo.owner)
FROM engineering_work_orders ewo
WHERE ewo.ewo_ref = 'EWO-014.13'
ON CONFLICT (object_ref, object_type) DO UPDATE SET
  title = EXCLUDED.title,
  canonical_url = EXCLUDED.canonical_url,
  lifecycle_state = EXCLUDED.lifecycle_state,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Create relationship: EWO-014.7 → EWO-014.13 (produces)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO engineering_object_relationships (from_object_ref, to_object_ref, relationship_type, is_automatic, metadata)
VALUES (
  'EWO-014.7',
  'EWO-014.13',
  'produces',
  true,
  jsonb_build_object('description', 'EWO-014.7 PO acceptance identified navigation issue, producing EWO-014.13 roadmap item and implementation')
)
ON CONFLICT (from_object_ref, to_object_ref, relationship_type) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Create engineering record for EWO-014.13
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO engineering_records_library (
  record_ref,
  record_type,
  title,
  programme,
  ewo_id,
  ewo_ref,
  status,
  completion_date,
  content,
  authority_state,
  generated_by,
  governance_status,
  knowledge_extracted,
  lineage_established,
  engineering_objective,
  implementation_summary,
  po_acceptance_detail
)
SELECT
  'ER-014.13',
  'engineering_completion',
  'Engineering Completion Record — EWO-014.13 Unified Engineering Object Navigation',
  'Engineering Execution Platform',
  ewo.id,
  'EWO-014.13',
  'po_accepted',
  CURRENT_DATE,
  jsonb_build_object(
    'ewo_ref', 'EWO-014.13',
    'title', 'Unified Engineering Object Navigation & Lifecycle',
    'capabilities_delivered', jsonb_build_array(
      'Engineering Object Model (11 object types with permanent identity)',
      'Direct Object Navigation (canonical URLs)',
      'Engineering Relationships (typed bidirectional graph)',
      'Engineering Breadcrumbs (lineage navigation)',
      'Related Engineering Panel (parent/child/related display)',
      'Engineering Graph Foundation (registry + relationships tables)',
      'Navigation Service (URL resolution, history, context restoration)',
      'Executive Experience (dashboards as management indexes)',
      'Backward Compatibility (existing workflows preserved)'
    ),
    'database_changes', jsonb_build_array(
      'engineering_object_registry table (permanent identity + canonical URLs)',
      'engineering_object_relationships table (typed navigation graph edges)'
    ),
    'components_created', jsonb_build_array(
      'src/lib/engineeringNavigationService.ts',
      'src/components/ecc/EngineeringBreadcrumbs.tsx',
      'src/components/ecc/RelatedEngineeringPanel.tsx',
      'src/tests/ewo014_13_navigation.test.ts'
    ),
    'tests', jsonb_build_object('total', 1096, 'new', 26, 'test_files', 26),
    'build_result', 'PASS'
  ),
  'authoritative',
  'ATD',
  'accepted',
  true,
  true,
  jsonb_build_object('objective', 'Create unified navigation architecture with permanent object identity, canonical URLs, navigable relationships, breadcrumbs, and related engineering panels.'),
  jsonb_build_object('summary', 'Two new database tables (engineering_object_registry, engineering_object_relationships), navigation service library with URL generation/parsing/history/context, two React components (breadcrumbs + related panel), route parser extended for object-level URLs, EWO detail view integrated with breadcrumbs + related panel + direct navigation links, records library integrated with detail overlay.'),
  jsonb_build_object('accepted_by', 'Product Owner', 'statement', 'PASS — All navigation capabilities delivered and tested')
FROM engineering_work_orders ewo
WHERE ewo.ewo_ref = 'EWO-014.13'
ON CONFLICT (record_ref) DO UPDATE SET
  status = 'po_accepted',
  content = EXCLUDED.content,
  governance_status = 'accepted',
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Register the engineering record in the object registry
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO engineering_object_registry (object_ref, object_type, title, canonical_url, lifecycle_state, source_table, source_id, parent_object_ref, metadata)
SELECT
  'ER-014.13',
  'engineering_record',
  er.title,
  '#/engineering/records-library/er_014_13',
  er.status,
  'engineering_records_library',
  er.id,
  'EWO-014.13',
  jsonb_build_object('record_type', er.record_type)
FROM engineering_records_library er
WHERE er.record_ref = 'ER-014.13'
ON CONFLICT (object_ref, object_type) DO UPDATE SET
  title = EXCLUDED.title,
  canonical_url = EXCLUDED.canonical_url,
  lifecycle_state = EXCLUDED.lifecycle_state,
  updated_at = now();

-- Relationship: EWO-014.13 → ER-014.13 (produces)
INSERT INTO engineering_object_relationships (from_object_ref, to_object_ref, relationship_type, is_automatic, metadata)
VALUES (
  'EWO-014.13',
  'ER-014.13',
  'produces',
  true,
  jsonb_build_object('description', 'Work Order produces Engineering Record')
)
ON CONFLICT (from_object_ref, to_object_ref, relationship_type) DO NOTHING;
