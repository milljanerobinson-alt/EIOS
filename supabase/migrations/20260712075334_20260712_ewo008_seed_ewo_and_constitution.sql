/*
# EWO-008 Seed: EWO Record + CONST-001 Constitutional Document

## Summary
Seeds the foundational data for EWO-008 (Platform Architecture & Engineering Workflow v1.0).

## Changes
1. Inserts EWO-008 into `engineering_work_orders` using correct column names (ewo_ref, executive_summary, etc.)
2. Inserts CONST-001 into `constitutional_documents` with all 15 sections as structured JSONB

## Notes
- Uses INSERT ... ON CONFLICT DO NOTHING for idempotency
- Column names verified against live schema
*/

-- ── 1. Seed EWO-008 ──────────────────────────────────────────────────────────

INSERT INTO engineering_work_orders (
  ewo_ref, title, status, priority,
  executive_summary, business_objective, engineering_objective,
  scope, validation_requirements, owner, requested_by,
  started_at, created_at, updated_at
)
VALUES (
  'EWO-008',
  'Platform Architecture & Engineering Workflow v1.0',
  'in_progress',
  'critical',
  'Constitutional architecture EWO establishing the permanent governing structure of the ATD platform. Produces CONST-001 — the constitutional document covering product hierarchy, workspace architecture, navigation, access, settings ownership, shared services, engineering lifecycle, automation specifications, records library, and implementation roadmap.',
  'Consolidate all organic architectural decisions into a single constitutional governance document that governs ATD, LLND Automate, EIOS, and all future products. Establish engineering automation foundations and the records library to enable automated lifecycle management.',
  'Architecture-only EWO. Produce CONST-001 stored in constitutional_documents. Create foundation tables (constitutional_documents, engineering_records_library, engineering_automation_rules, engineering_automation_events). Seed records library with all prior completion reports. Configure default automation rules.',
  'Platform architecture documentation, foundation table creation, records library seeding, automation rules configuration. No new customer-facing features.',
  'CONST-001 approved and stored; all 4 foundation tables operational; records library seeded with 8 prior reports; default automation rules configured; ECCConstitutionPage and ECCRecordsLibraryPage live in ECC.',
  'Platform Engineering',
  'ATD Engineering',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (ewo_ref) DO NOTHING;

-- ── 2. Seed CONST-001 ─────────────────────────────────────────────────────────

INSERT INTO constitutional_documents (
  document_ref, title, document_type, version, status,
  programme, effective_from, authored_by, sections, metadata
)
VALUES (
  'CONST-001',
  'Platform Architecture & Engineering Workflow v1.0',
  'constitutional_architecture',
  '1.0',
  'ratified',
  'Cross-Platform',
  NOW(),
  'ATD Engineering',
  jsonb_build_object(

    'executive_summary', jsonb_build_object(
      'order', 1,
      'title', 'Executive Architecture Summary',
      'content', 'The ATD platform is a multi-product engineering command centre operating across three products: ATD (core engineering governance), LLND Automate (compliance workflow automation), and EIOS (enterprise intelligence and operating system). Each product is independently deployable but shares a common platform core providing authentication, organisation management, feature flags, AI capability routing, and engineering governance. This constitutional document establishes the permanent architectural decisions, engineering workflow standards, and platform governance model that all current and future products must conform to. It supersedes all prior ad-hoc architectural decisions and serves as the governing reference for all future Engineering Work Orders.',
      'key_principles', jsonb_build_array(
        'Single Responsibility: each product domain owns its own data model and UI boundaries',
        'Shared Platform Core: auth, organisations, AI routing, and governance are cross-product concerns',
        'Append-Only Audit: all engineering decisions, plans, and governance actions are immutable records',
        'Constitutional Governance: all architectural changes require a constitutional amendment via a new CONST document',
        'Engineering Automation First: lifecycle events drive automated record creation, not manual processes'
      )
    ),

    'product_hierarchy', jsonb_build_object(
      'order', 2,
      'title', 'Product Hierarchy',
      'content', 'The platform operates a three-layer product hierarchy. Layer 1 is the Platform Core — shared services including authentication (Supabase Auth), organisation management, feature flags, AI capability engine, and the Engineering Command Centre (ECC). Layer 2 is the Product Suite — ATD (Architecture & Technology Decision governance), LLND Automate (compliance workflow automation), and EIOS (enterprise intelligence operating system). Layer 3 is the Delivery Surface — tenant workspaces, product-specific dashboards, and user-facing feature modules.',
      'products', jsonb_build_array(
        jsonb_build_object('ref', 'PLATFORM-CORE', 'name', 'Platform Core', 'description', 'Shared authentication, organisations, AI routing, feature flags, ECC', 'owner', 'Platform Engineering'),
        jsonb_build_object('ref', 'ATD', 'name', 'ATD — Architecture & Technology Decisions', 'description', 'Engineering governance, intent capture, reasoning engine, plan approval, EWO lifecycle', 'owner', 'Engineering Governance'),
        jsonb_build_object('ref', 'LLND', 'name', 'LLND Automate', 'description', 'Compliance framework automation, gap analysis, workflow orchestration', 'owner', 'Compliance Engineering'),
        jsonb_build_object('ref', 'EIOS', 'name', 'EIOS — Enterprise Intelligence Operating System', 'description', 'Enterprise data aggregation, intelligence layer, operating dashboards', 'owner', 'Intelligence Engineering')
      )
    ),

    'workspace_architecture', jsonb_build_object(
      'order', 3,
      'title', 'Workspace Architecture',
      'content', 'Each organisation receives a logical workspace — an isolated data boundary within the shared Supabase instance. Workspace isolation is enforced at the RLS layer using organisation_id predicates. All tenant-scoped tables carry an organisation_id column (uuid, nullable). NULL organisation_id denotes the platform operator workspace (single-tenant mode). A non-null organisation_id denotes a customer tenant workspace. The get_caller_org_id() RPC function returns the caller''s organisation_id; in single-tenant mode it returns NULL. All RLS predicates use the pattern: organisation_id IS NULL OR organisation_id = get_caller_org_id().',
      'isolation_model', jsonb_build_object(
        'strategy', 'Row-Level Security with organisation_id predicate',
        'single_tenant_value', 'NULL — matches IS NULL check',
        'multi_tenant_value', 'UUID — matches equality check',
        'enforcement_function', 'get_caller_org_id()',
        'rls_predicate_pattern', 'organisation_id IS NULL OR organisation_id = get_caller_org_id()'
      )
    ),

    'navigation_architecture', jsonb_build_object(
      'order', 4,
      'title', 'Navigation Architecture',
      'content', 'The platform uses a two-tier navigation model. Tier 1 is the Product Bar — a persistent left rail showing the current product context (ATD, LLND Automate, EIOS, Platform). Tier 2 is the Section Navigator — a product-specific sidebar showing sections within the current product. The Engineering Command Centre (ECC) is accessible from all products and renders as a full-height overlay. Navigation state is managed in URL hash/path parameters, not component state, ensuring deep-linkability.',
      'ecc_sections', jsonb_build_array(
        'dashboard', 'engineering-intents', 'engineering-plans', 'work-orders',
        'knowledge-base', 'decisions', 'ai-providers', 'reports-export',
        'constitution', 'records-library', 'automation'
      )
    ),

    'access_architecture', jsonb_build_object(
      'order', 5,
      'title', 'Access Architecture',
      'content', 'Access control uses a three-tier model: (1) Authentication — Supabase Auth email/password, session managed by the Supabase client. (2) Authorisation — RLS policies on all tables enforce ownership and organisation boundaries. (3) Feature Access — the features table and product_features table gate product-level feature availability. Engineering governance actions (approve/reject plans) are restricted to authenticated users. The governance RPC functions (approve_engineering_plan, reject_engineering_plan) run as SECURITY DEFINER to enforce transactional atomicity while respecting caller identity.',
      'rpc_security_model', jsonb_build_object(
        'governance_rpcs', 'SECURITY DEFINER — atomic lock + write, caller identity via auth.uid()',
        'read_queries', 'SECURITY INVOKER — standard RLS enforcement',
        'service_role', 'Edge functions only — never exposed to client'
      )
    ),

    'settings_ownership', jsonb_build_object(
      'order', 6,
      'title', 'Settings Ownership Model',
      'content', 'Settings are partitioned by ownership scope. Platform settings (AI provider configuration, feature flags, organisation management) are owned by the platform operator and accessible via the ECC. Product settings (ATD knowledge base, LLND framework configuration, EIOS intelligence sources) are owned by the product administrator within each product. User settings (profile, notifications, display preferences) are owned by individual users. Settings never cross ownership boundaries.',
      'ownership_scopes', jsonb_build_array(
        jsonb_build_object('scope', 'Platform', 'owner', 'Platform Operator', 'location', 'ECC > Settings'),
        jsonb_build_object('scope', 'Product', 'owner', 'Product Administrator', 'location', 'Product Settings'),
        jsonb_build_object('scope', 'User', 'owner', 'Individual User', 'location', 'User Profile')
      )
    ),

    'shared_platform_services', jsonb_build_object(
      'order', 7,
      'title', 'Shared Platform Services Architecture',
      'content', 'The platform provides six shared services consumed by all products: (1) AI Capability Engine — routes requests to configured AI providers with fallback, logging, and cost tracking. (2) Feature Flag Service — gates feature availability per product and release phase. (3) Knowledge Management — atd_knowledge_records stores versioned engineering knowledge shared across the reasoning engine and all products. (4) Engineering Governance — the full ATD governance stack (intents, plans, decisions, EWOs) is a shared service. (5) Engineering Records Library — immutable archive of all completion reports, constitutional documents, and engineering artefacts. (6) Engineering Automation Engine — event-driven automation triggered by EWO lifecycle transitions.',
      'services', jsonb_build_array(
        'AI Capability Engine', 'Feature Flag Service', 'Knowledge Management',
        'Engineering Governance', 'Engineering Records Library', 'Engineering Automation Engine'
      )
    ),

    'engineering_lifecycle', jsonb_build_object(
      'order', 8,
      'title', 'Engineering Lifecycle Specification',
      'content', 'All engineering work follows the standard lifecycle: (1) Intent Capture — status: captured. (2) Reasoning — ATD Reasoning Engine analyses intent and generates a structured plan — status: analysing → awaiting_approval. (3) Plan Governance — reviewed and approved or rejected — approved: awaiting_approval → approved; rejected: awaiting_approval → rejected. (4) EWO Creation — approved plans generate EWOs — status: open. (5) Implementation — open → in_progress → awaiting_review → closed. (6) PO Acceptance — status: po_acceptance. (7) Archival — automated via lifecycle automation into engineering_records_library.',
      'intent_statuses', jsonb_build_array('captured', 'analysing', 'awaiting_approval', 'approved', 'rejected'),
      'plan_statuses', jsonb_build_array('draft', 'awaiting_approval', 'approved', 'rejected', 'superseded'),
      'ewo_statuses', jsonb_build_array('open', 'in_progress', 'awaiting_review', 'closed', 'po_acceptance', 'cancelled')
    ),

    'engineering_automation', jsonb_build_object(
      'order', 9,
      'title', 'Engineering Automation Specification',
      'content', 'The engineering automation engine is event-driven. Events are generated by database triggers on engineering_work_orders (trg_ewo_lifecycle_automation). Events are stored in engineering_automation_events. The automation engine processes pending events by matching them against configured rules in engineering_automation_rules. Each rule specifies a trigger_event, optional trigger_condition (JSONB match), action_type, and action_config. Rules are ordered by execution_order and can be enabled/disabled independently. All event processing is fully auditable.',
      'trigger_events', jsonb_build_array('ewo_closed', 'ewo_po_accepted', 'plan_approved', 'plan_rejected', 'intent_captured'),
      'action_types', jsonb_build_array('create_library_record', 'send_notification', 'update_analytics', 'create_changelog_entry', 'trigger_webhook')
    ),

    'records_library_architecture', jsonb_build_object(
      'order', 10,
      'title', 'Engineering Records Library Architecture',
      'content', 'The engineering_records_library is a permanent append-only archive of all engineering artefacts. Record types: completion_report, constitutional_document, release_note, decision_record. Each record carries a record_ref (e.g. ERC-001), links back to the originating EWO or CONST document, stores full content as JSONB, and records the pdf_filename. Records are never deleted or mutated after creation — amendments create new records with an incremented version_number.',
      'record_types', jsonb_build_array('completion_report', 'constitutional_document', 'release_note', 'decision_record'),
      'immutability_guarantee', 'Records are append-only. No UPDATE or DELETE policies exist on engineering_records_library. Amendments create new version records.'
    ),

    'event_automation_framework', jsonb_build_object(
      'order', 11,
      'title', 'Event Automation Framework',
      'content', 'Architecture: (1) Trigger — database trigger fires on engineering_work_orders status changes. (2) Event Record — trigger writes to engineering_automation_events (immutable audit log). (3) Rule Matching — automation processor queries engineering_automation_rules for matching enabled rules. (4) Action Execution — processor executes the action_type with action_config. (5) Result Recording — processor updates the event record with status (processed/failed) and result JSONB.',
      'pipeline_stages', jsonb_build_array('trigger', 'event_record', 'rule_matching', 'action_execution', 'result_recording')
    ),

    'constitutional_decisions', jsonb_build_object(
      'order', 12,
      'title', 'Constitutional Decisions',
      'content', 'The following architectural decisions are constitutionally established and cannot be changed without a formal constitutional amendment (new CONST document superseding this one).',
      'decisions', jsonb_build_array(
        jsonb_build_object('id', 'CD-001', 'decision', 'Supabase is the sole database and authentication provider', 'rationale', 'Provisioned, integrated, and proven across all EWOs. Changing would require full data migration.'),
        jsonb_build_object('id', 'CD-002', 'decision', 'All tables have RLS enabled with no exceptions', 'rationale', 'Security by default. Any table without RLS is a security gap regardless of frontend access controls.'),
        jsonb_build_object('id', 'CD-003', 'decision', 'Engineering governance actions use SECURITY DEFINER RPCs', 'rationale', 'Atomic transactional governance. Client-side multi-step transactions cannot be made atomic or safe.'),
        jsonb_build_object('id', 'CD-004', 'decision', 'The engineering_records_library is append-only', 'rationale', 'Immutable audit trail for engineering artefacts. Amendments create new version records.'),
        jsonb_build_object('id', 'CD-005', 'decision', 'AI provider configuration uses the ai_provider_configs / ai_capability_routes tables', 'rationale', 'Multi-provider routing, fallback, and cost tracking require a configurable routing layer.'),
        jsonb_build_object('id', 'CD-006', 'decision', 'organisation_id IS NULL denotes the platform operator in single-tenant mode', 'rationale', 'NULL-based single-tenant compatibility avoids schema changes when moving to multi-tenant.'),
        jsonb_build_object('id', 'CD-007', 'decision', 'jsPDF is the PDF generation library (client-side only)', 'rationale', 'No server-side PDF generation infrastructure required. All PDF generation happens in the browser.')
      )
    ),

    'risks', jsonb_build_object(
      'order', 13,
      'title', 'Architectural Risks',
      'content', 'Identified architectural risks at the time of CONST-001 ratification.',
      'risks', jsonb_build_array(
        jsonb_build_object('id', 'R-001', 'risk', 'Single Supabase instance', 'severity', 'medium', 'mitigation', 'Monitor connection limits; implement connection pooling via PgBouncer when needed'),
        jsonb_build_object('id', 'R-002', 'risk', 'Client-side PDF generation performance with large documents', 'severity', 'low', 'mitigation', 'Implement pagination and lazy generation; move to edge function if documents exceed 50 pages'),
        jsonb_build_object('id', 'R-003', 'risk', 'get_caller_org_id() returns NULL in single-tenant — multi-tenant migration requires data backfill', 'severity', 'medium', 'mitigation', 'All tenant columns default NULL; backfill is a single UPDATE per table when org UUIDs are assigned'),
        jsonb_build_object('id', 'R-004', 'risk', 'Engineering automation events processed synchronously may block EWO updates', 'severity', 'low', 'mitigation', 'Trigger writes event record only; processing is async via edge function or scheduled job'),
        jsonb_build_object('id', 'R-005', 'risk', 'AI provider API key rotation requires secret update in Supabase Edge Functions', 'severity', 'medium', 'mitigation', 'Document key rotation procedure; add key-expiry monitoring')
      )
    ),

    'recommendations', jsonb_build_object(
      'order', 14,
      'title', 'Recommendations',
      'content', 'Recommended next engineering actions following ratification of CONST-001.',
      'recommendations', jsonb_build_array(
        'Implement the engineering automation event processor (edge function) to process engineering_automation_events',
        'Add monitoring and alerting for failed automation events',
        'Build the LLND Automate product module as the first new product using this constitutional architecture',
        'Implement the EIOS intelligence layer using shared platform services',
        'Add a constitutional amendment workflow to the ECC for future CONST document creation',
        'Establish a quarterly architecture review cycle to assess constitutional decisions',
        'Implement connection pooling when concurrent user count exceeds 50'
      )
    ),

    'implementation_roadmap', jsonb_build_object(
      'order', 15,
      'title', 'Implementation Roadmap',
      'content', 'The implementation roadmap for CONST-001 deliverables across EWO-008 phases.',
      'phases', jsonb_build_array(
        jsonb_build_object(
          'phase', 1, 'name', 'Foundation Tables & Triggers',
          'deliverables', jsonb_build_array('constitutional_documents', 'engineering_records_library', 'engineering_automation_rules', 'engineering_automation_events', 'ewo_lifecycle_automation_trigger'),
          'status', 'complete'
        ),
        jsonb_build_object(
          'phase', 2, 'name', 'CONST-001 Seed & EWO-008 Record',
          'deliverables', jsonb_build_array('EWO-008 in engineering_work_orders', 'CONST-001 in constitutional_documents'),
          'status', 'complete'
        ),
        jsonb_build_object(
          'phase', 3, 'name', 'Records Library Seed',
          'deliverables', jsonb_build_array('8 prior completion reports in engineering_records_library'),
          'status', 'planned'
        ),
        jsonb_build_object(
          'phase', 4, 'name', 'Automation Rules Seed',
          'deliverables', jsonb_build_array('Default automation rules for ewo_closed and ewo_po_accepted events'),
          'status', 'planned'
        ),
        jsonb_build_object(
          'phase', 5, 'name', 'ECC UI',
          'deliverables', jsonb_build_array('ECCConstitutionPage.tsx', 'ECCRecordsLibraryPage.tsx', 'ECC nav wiring'),
          'status', 'planned'
        )
      )
    )

  ),
  jsonb_build_object(
    'ewo_ref', 'EWO-008',
    'total_sections', 15,
    'classification', 'constitutional',
    'amendment_procedure', 'Requires new CONST document superseding this one, ratified via engineering governance process',
    'governed_products', jsonb_build_array('ATD', 'LLND Automate', 'EIOS', 'Platform Core')
  )
)
ON CONFLICT (document_ref) DO NOTHING;
