
/*
# CONST-001-AMD-002: Platform Hierarchy, EIOS Model & Engineering Object Architecture

## Summary
This constitutional amendment establishes EIOS as the Engineering Intelligence
Operating System and the platform layer, redefines ATD and LLND Automate as
applications executing on EIOS, introduces a 5-level settings ownership hierarchy,
resolves the AI capability routing constitutional reference gap (CD-005-R1),
clarifies minimum navigation requirements, updates the canonical EWO lifecycle to
9 states (CD-011), and introduces Engineering Programme and Initiative as planned
constitutional objects.

## New Constitutional Documents
- CONST-001-AMD-002 in constitutional_documents (constitutional_amendment, ratified)

## New Engineering Records
- CONST-REC-AMD-002 in engineering_records_library (constitutional_document, authoritative)

## Decisions Introduced
- CD-008 (new): EIOS is the platform; ATD and LLND Automate are applications
- CD-009 (new): 5-level settings ownership hierarchy
- CD-005-R1 (supersedes CD-005): AI Capability Routing Service abstraction
- CD-011 (new): Canonical 9-state EWO lifecycle

## CONST-001 Sections Superseded
- Ch.2 product_hierarchy — superseded by platform_hierarchy_revised
- Ch.4 navigation_architecture — clarified by navigation_clarification
- Ch.6 settings_ownership — superseded by settings_ownership_revised
- Ch.8 engineering_lifecycle — superseded by engineering_lifecycle_revised
- Ch.10 records_library_architecture — extended by engineering_records_model
- CD-005 — superseded by CD-005-R1

## Not Modified
- CONST-001-AMD-001 decisions: CD-001-R1, CD-006-R1, CD-007-R1
- CD-002 (RLS on all tables)
- CD-003 (SECURITY DEFINER RPCs)
- CD-004 (engineering_records_library append-only)

## Security
- INSERT only — no existing records modified
- engineering_records_library: append-only (no UPDATE/DELETE RLS)
- constitutional_documents: no DELETE policy
*/

DO $$
DECLARE
  v_const001_id uuid;
  v_amd002_id   uuid;
BEGIN

  SELECT id INTO v_const001_id
  FROM constitutional_documents
  WHERE document_ref = 'CONST-001';

  INSERT INTO constitutional_documents (
    document_ref,
    title,
    document_type,
    version,
    status,
    programme,
    effective_from,
    supersedes_id,
    authored_by,
    sections,
    metadata
  ) VALUES (
    'CONST-001-AMD-002',
    'CONST-001 Amendment 002 — Platform Hierarchy, EIOS Model & Engineering Object Architecture',
    'constitutional_amendment',
    '1.0',
    'ratified',
    'ATD Engineering Programme',
    NOW(),
    v_const001_id,
    'EWO-008 Constitutional Closeout',
    jsonb_build_object(

      'amendment_purpose', jsonb_build_object(
        'order', 1,
        'title', 'Amendment Purpose',
        'content', 'CONST-001-AMD-002 addresses ten architectural clarifications identified during the EWO-008 constitutional closeout and pre-acceptance architectural review. It establishes EIOS as the Engineering Intelligence Operating System and the platform layer, redefines ATD and LLND Automate as applications executing on EIOS, introduces a 5-level settings ownership hierarchy, resolves the AI capability routing constitutional reference gap, clarifies minimum navigation requirements, updates the canonical EWO lifecycle to 9 states, and introduces Engineering Programme and Initiative as planned constitutional objects.',
        'supersedes_from_const001', jsonb_build_array(
          'Ch.2 product_hierarchy',
          'Ch.4 navigation_architecture (clarified)',
          'Ch.6 settings_ownership',
          'Ch.8 engineering_lifecycle',
          'Ch.10 records_library_architecture (extended)',
          'CD-005'
        ),
        'does_not_modify', jsonb_build_array(
          'CONST-001-AMD-001: CD-001-R1 platform persistence portability',
          'CONST-001-AMD-001: CD-006-R1 NULL organisation_id transitional constraint',
          'CONST-001-AMD-001: CD-007-R1 PDFs are derived representations',
          'CD-002: RLS on all tables without exception',
          'CD-003: SECURITY DEFINER RPCs for governance actions',
          'CD-004: engineering_records_library is append-only'
        ),
        'new_decisions', jsonb_build_array('CD-008', 'CD-009', 'CD-005-R1', 'CD-011')
      ),

      'platform_hierarchy_revised', jsonb_build_object(
        'order', 2,
        'title', 'Platform Hierarchy — EIOS as the Platform (Supersedes CONST-001 Ch.2)',
        'constitutional_decision', 'CD-008',
        'content', 'EIOS — the Engineering Intelligence Operating System — is the platform. EIOS is not a product built on a separate platform layer; EIOS IS the platform itself. All shared services, shared data, governance infrastructure, AI capability routing, and engineering memory belong to EIOS. ATD and LLND Automate are applications that execute on EIOS. Future products execute on EIOS.',
        'eios_definition', 'EIOS is the Engineering Intelligence Operating System. It is the unified platform layer that provides shared services to all applications. EIOS owns the following platform services: Identity, Authentication, AI Provider Abstraction, Memory, Governance, Engineering Records, Engineering Automation, Integrations, Feature Flags, Billing, Notifications, and Shared Storage.',
        'hierarchy_layers', jsonb_build_object(
          'EIOS', jsonb_build_object(
            'role', 'The Platform — Engineering Intelligence Operating System',
            'description', 'EIOS is the platform. It owns all shared platform services and provides them to all applications. EIOS is not a peer application.',
            'owns', jsonb_build_array(
              'Identity and Authentication',
              'AI Capability Routing Service',
              'Engineering Records Library',
              'Engineering Governance Infrastructure',
              'Engineering Automation Engine',
              'Feature Flags',
              'Billing',
              'Notifications',
              'External Integrations',
              'Shared Storage',
              'Memory and Knowledge Management'
            )
          ),
          'Shared_Platform_Services', jsonb_build_object(
            'role', 'Cross-application services provided by EIOS to all applications',
            'consumed_by', 'ATD, LLND Automate, and all future applications'
          ),
          'Applications', jsonb_build_object(
            'role', 'Independent products executing on EIOS that consume platform services',
            'current', jsonb_build_array(
              'ATD — Engineering Intelligence',
              'LLND Automate — LLN+D Compliance Platform'
            ),
            'future', 'Any future product must execute on EIOS and consume platform services. Future products must not duplicate platform services.'
          ),
          'Shared_Engineering_Objects', jsonb_build_object(
            'role', 'Cross-application engineering objects shared by all applications via EIOS',
            'examples', jsonb_build_array(
              'engineering_work_orders',
              'engineering_records_library',
              'ecc_engineering_standards',
              'constitutional_documents',
              'engineering_automation_rules',
              'engineering_automation_events'
            )
          )
        ),
        'explicit_boundary_rules', jsonb_build_array(
          'EIOS is the platform. ATD is NOT the platform.',
          'EIOS is the platform. LLND Automate is NOT the platform.',
          'Shared Platform Services belong to EIOS. No application owns a platform service.',
          'Applications consume platform services. Applications must never own, duplicate, or re-implement a platform service.',
          'Future products execute on EIOS and inherit all platform service guarantees.',
          'The Engineering Command Centre (ECC) is the operational surface of EIOS for platform engineering governance.'
        ),
        'supersedes', 'CONST-001 Ch.2 product_hierarchy — the three-layer model placing PLATFORM-CORE, ATD, LLND, and EIOS as parallel entities is superseded. EIOS is now the platform layer, not a peer product.'
      ),

      'application_model', jsonb_build_object(
        'order', 3,
        'title', 'Application Model — Independent Products Executing on EIOS',
        'content', 'Applications are independent products that execute on EIOS. Each application has a defined purpose, owns its application-specific data, and consumes EIOS platform services. No application owns platform services.',
        'applications', jsonb_build_object(
          'ATD', jsonb_build_object(
            'full_name', 'ATD — Architecture and Technology Decisions',
            'purpose', 'Engineering Intelligence. Intent capture, reasoning engine, plan governance, engineering work order lifecycle, engineering knowledge management, and the Engineering Command Centre.',
            'application_owned_tables', jsonb_build_array(
              'atd_engineering_intents',
              'atd_engineering_plans',
              'atd_plan_governance_decisions',
              'atd_knowledge_records',
              'atd_capabilities',
              'atd_capability_executions'
            ),
            'platform_services_consumed', jsonb_build_array(
              'AI Capability Routing Service',
              'Engineering Records Library',
              'Engineering Automation Engine',
              'Authentication',
              'Feature Flags'
            )
          ),
          'LLND_Automate', jsonb_build_object(
            'full_name', 'LLND Automate',
            'product_name', 'LLN+D',
            'purpose', 'LLN+D Compliance Platform. Assessment delivery, qualification mapping, ACSF evidence, candidate lifecycle, and Axcelerate integration for RTOs.',
            'application_owned_tables', jsonb_build_array(
              'assessment_invitations',
              'assessments',
              'assessment_responses',
              'qualifications',
              'qualification_mapping_library',
              'axcelerate_writeback_queue',
              'axcelerate_sync_log'
            ),
            'platform_services_consumed', jsonb_build_array(
              'Authentication',
              'Email Service',
              'Billing',
              'Notifications',
              'Feature Flags',
              'Shared Storage'
            )
          ),
          'Future_Applications', jsonb_build_object(
            'purpose', 'Products built on EIOS that consume platform services',
            'requirement', 'All future applications must execute on EIOS and consume EIOS platform services. Future applications must not duplicate or re-implement any platform service.',
            'onboarding', 'A constitutional amendment or approved EWO is required to register a new application on EIOS.'
          )
        )
      ),

      'settings_ownership_revised', jsonb_build_object(
        'order', 4,
        'title', 'Settings Ownership Model — 5-Level Hierarchy (Supersedes CONST-001 Ch.6)',
        'constitutional_decision', 'CD-009',
        'content', 'Settings are owned at five hierarchical scopes. Each scope may configure settings at its level. Settings inherit downward: platform settings apply to all applications, organisations, workspaces, and users unless overridden at a lower scope. Settings must never cross ownership boundaries upward.',
        'hierarchy', jsonb_build_object(
          'level_1_platform', jsonb_build_object(
            'scope', 'Platform',
            'owner', 'EIOS Platform Operator',
            'description', 'Settings that govern the entire platform and all applications running on it',
            'examples', jsonb_build_array('AI provider configuration', 'Feature flags', 'Platform security settings', 'Integration credentials', 'Cron secrets', 'Platform environment configuration'),
            'location', 'ECC > Platform Operations',
            'implementation_status', 'Partially implemented as flat settings table (key/value). No scope enforcement column. Technical debt.'
          ),
          'level_2_application', jsonb_build_object(
            'scope', 'Application',
            'owner', 'Application Administrator',
            'description', 'Settings that govern a specific application (ATD, LLND Automate, or future applications)',
            'examples', jsonb_build_array('ATD knowledge base configuration', 'LLND assessment configuration', 'Application-specific feature overrides'),
            'location', 'Application Settings',
            'implementation_status', 'Not yet partitioned from platform settings. Planned constitutional object. Requires a future EWO.'
          ),
          'level_3_organisation', jsonb_build_object(
            'scope', 'Organisation',
            'owner', 'Organisation Administrator',
            'description', 'Settings specific to a tenant organisation',
            'examples', jsonb_build_array('Organisation branding', 'Organisation name', 'RTO number', 'Notification preferences', 'Integration endpoints'),
            'location', 'Organisation Settings',
            'implementation_status', 'Partially implemented via org_branding and related keys in the flat settings table.'
          ),
          'level_4_workspace', jsonb_build_object(
            'scope', 'Workspace',
            'owner', 'Workspace Manager',
            'description', 'Settings specific to a workspace within an organisation (trainer, assessment, platform_admin)',
            'examples', jsonb_build_array('Workspace-specific UI preferences', 'Workspace access thresholds', 'Workspace notification routing'),
            'location', 'Workspace Settings',
            'implementation_status', 'Not yet implemented as a settings partition. Planned constitutional object. Requires a future EWO.'
          ),
          'level_5_user', jsonb_build_object(
            'scope', 'User',
            'owner', 'Individual User',
            'description', 'Settings personal to an individual user',
            'examples', jsonb_build_array('User profile details', 'Personal notification preferences', 'Display and accessibility preferences'),
            'location', 'User Profile',
            'implementation_status', 'Partially implemented via profiles table. Personal notification settings currently stored in flat settings table.'
          )
        ),
        'inheritance_model', 'Platform settings cascade downward through all scopes unless overridden. Application settings apply within the application scope. Organisation settings apply within the organisation. Workspace settings apply within the workspace. User settings apply only to the individual user.',
        'boundary_rule', 'Settings must never cross ownership boundaries upward. A user may not set an organisation-scoped setting. An application may not modify a platform-scoped setting.',
        'technical_debt', 'The current implementation uses a flat settings table (key, value, updated_at) with no scope enforcement. This is documented technical debt. The 5-level hierarchy is the constitutional target architecture. Migration to the hierarchical model requires a future EWO and does not block EWO-008 acceptance.',
        'supersedes', 'CONST-001 Ch.6 settings_ownership — the three-scope model (Platform, Product, User) is superseded by this 5-level hierarchy.'
      ),

      'engineering_records_model', jsonb_build_object(
        'order', 5,
        'title', 'Engineering Record as Canonical Engineering Object (Extends CONST-001 Ch.10)',
        'content', 'The Engineering Record stored in engineering_records_library is the canonical, permanent engineering object. Completion Reports are structured views of Engineering Records. PDFs are optional on-demand exports. The Engineering Record is the permanent engineering memory of the platform.',
        'canonical_hierarchy', jsonb_build_object(
          'Engineering_Record', jsonb_build_object(
            'role', 'Canonical permanent engineering object',
            'table', 'engineering_records_library',
            'immutability', 'Append-only. No UPDATE or DELETE RLS policies. Amendments create new records linked via supersedes_record_id.',
            'authority_states', jsonb_build_array('authoritative', 'provisional', 'non_authoritative', 'superseded')
          ),
          'Completion_Report', jsonb_build_object(
            'role', 'A derived structured representation of an Engineering Record of type completion_report',
            'stored_as', 'content JSONB field within the Engineering Record'
          ),
          'PDF_Export', jsonb_build_object(
            'role', 'An optional generated output derived from the Engineering Record on demand',
            'authority', 'PDFs are not the canonical source of truth. The Engineering Record is.',
            'governed_by', 'CD-007-R1 (rendering implementation may change by EWO)'
          )
        ),
        'reinforces', jsonb_build_array('CD-004: append-only guarantee', 'CD-007-R1: PDFs are derived representations')
      ),

      'engineering_object_hierarchy', jsonb_build_object(
        'order', 6,
        'title', 'Engineering Object Hierarchy',
        'content', 'The constitutional engineering object hierarchy defines the relationships between all engineering objects from the broadest programme scope to the foundational constitutional layer.',
        'hierarchy', jsonb_build_object(
          'Engineering_Programme', jsonb_build_object(
            'level', 1,
            'status', 'Planned Constitutional Object',
            'description', 'The broadest scope of engineering work. Groups related Engineering Initiatives under a common strategic objective. Not yet implemented as a database entity. Requires a future EWO.',
            'expected_table', 'engineering_programmes',
            'constitutional_authority', 'Declared by CONST-001-AMD-002. Implementation required by future EWO.'
          ),
          'Engineering_Initiative', jsonb_build_object(
            'level', 2,
            'status', 'Planned Constitutional Object',
            'description', 'A collection of related Engineering Work Orders pursuing a defined engineering goal within an Engineering Programme. Not yet implemented as a database entity. Requires a future EWO.',
            'expected_table', 'engineering_initiatives',
            'constitutional_authority', 'Declared by CONST-001-AMD-002. Implementation required by future EWO.'
          ),
          'Engineering_Work_Order', jsonb_build_object(
            'level', 3,
            'status', 'Implemented',
            'table', 'engineering_work_orders',
            'description', 'The primary unit of engineering delivery. A bounded piece of work with defined scope, 9-state lifecycle, and PO acceptance criteria.',
            'lifecycle', 'See CD-011'
          ),
          'Engineering_Record', jsonb_build_object(
            'level', 4,
            'status', 'Implemented',
            'table', 'engineering_records_library',
            'description', 'The canonical permanent record of completed engineering work. Created upon PO acceptance of an EWO via RULE-002. Append-only.'
          ),
          'Release', jsonb_build_object(
            'level', 5,
            'status', 'Implemented',
            'tables', jsonb_build_array('ecc_release_candidates', 'ecc_releases'),
            'description', 'A versioned collection of features delivered together and formally released.'
          ),
          'Feature', jsonb_build_object(
            'level', 6,
            'status', 'Implemented',
            'table', 'ecc_product_features',
            'description', 'An individual platform capability with tracked lifecycle, maturity, testing status, and evidence.'
          ),
          'Engineering_Standard', jsonb_build_object(
            'level', 7,
            'status', 'Implemented',
            'table', 'ecc_engineering_standards',
            'description', 'A platform-wide technical standard that constrains engineering decisions across all applications and features.'
          ),
          'Constitution', jsonb_build_object(
            'level', 8,
            'status', 'Implemented',
            'table', 'constitutional_documents',
            'description', 'The foundational governance layer. The supreme authority. Governs all engineering objects. Cannot be changed without a constitutional amendment.'
          )
        ),
        'relationship_rules', jsonb_build_array(
          'Engineering Programmes contain one or more Engineering Initiatives.',
          'Engineering Initiatives contain one or more Engineering Work Orders.',
          'Engineering Work Orders produce Engineering Records upon PO acceptance.',
          'Engineering Work Orders deliver Releases and Features.',
          'Releases contain Features.',
          'Features must conform to Engineering Standards.',
          'Engineering Standards must conform to the Constitution.',
          'The Constitution supersedes all other engineering objects.'
        )
      ),

      'engineering_lifecycle_revised', jsonb_build_object(
        'order', 7,
        'title', 'Engineering Work Order Lifecycle — 9 States (Supersedes CONST-001 Ch.8)',
        'constitutional_decision', 'CD-011',
        'content', 'The canonical EWO lifecycle has 9 states plus a cancelled terminal state. This supersedes the simplified 6-state lifecycle in CONST-001 Ch.8.',
        'lifecycle_states', jsonb_build_array(
          jsonb_build_object('state', 'draft',                    'order', 1, 'description', 'EWO created but not yet submitted', 'transitions_to', jsonb_build_array('submitted', 'cancelled')),
          jsonb_build_object('state', 'submitted',               'order', 2, 'description', 'EWO submitted for engineering review', 'transitions_to', jsonb_build_array('under_review', 'cancelled')),
          jsonb_build_object('state', 'under_review',            'order', 3, 'description', 'EWO under active engineering review', 'transitions_to', jsonb_build_array('approved', 'cancelled')),
          jsonb_build_object('state', 'approved',                'order', 4, 'description', 'EWO approved for implementation', 'transitions_to', jsonb_build_array('implementation_complete', 'cancelled')),
          jsonb_build_object('state', 'implementation_complete', 'order', 5, 'description', 'Engineer self-declares implementation complete', 'transitions_to', jsonb_build_array('ready_for_review')),
          jsonb_build_object('state', 'ready_for_review',        'order', 6, 'description', 'Implementation package submitted to Product Owner for acceptance review', 'transitions_to', jsonb_build_array('ewo_po_accepted')),
          jsonb_build_object('state', 'ewo_po_accepted',         'order', 7, 'description', 'Product Owner has formally accepted the EWO. Only an authorised PO action may set this state. System automation must not set this state. Triggers RULE-002 to create an authoritative Engineering Record.', 'authority', 'PO only', 'transitions_to', jsonb_build_array('closed')),
          jsonb_build_object('state', 'closed',                  'order', 8, 'description', 'EWO work is complete and PO-accepted', 'transitions_to', jsonb_build_array('archived')),
          jsonb_build_object('state', 'archived',                'order', 9, 'description', 'Terminal state. EWO permanently archived. Engineering Record exists in engineering_records_library.', 'transitions_to', jsonb_build_array())
        ),
        'cancelled_state', jsonb_build_object(
          'state', 'cancelled',
          'description', 'Terminal state. EWO cancelled at any point before implementation_complete. No Engineering Record is created.',
          'terminal', true
        ),
        'supersedes', 'CONST-001 Ch.8 ewo_statuses: open, in_progress, awaiting_review, closed, po_acceptance, cancelled'
      ),

      'ai_capability_routing_revised', jsonb_build_object(
        'order', 8,
        'title', 'AI Capability Routing Service (Supersedes CD-005)',
        'constitutional_decision', 'CD-005-R1',
        'content', 'The AI Capability Routing Service is the constitutional abstraction for all AI provider selection, routing, and fallback. The constitution defines the service contract and its requirements. It does not reference specific implementation tables or libraries. Implementation details may change by governed engineering decision without constitutional amendment.',
        'service_definition', jsonb_build_object(
          'name', 'AI Capability Routing Service',
          'purpose', 'Routes AI capability requests to configured providers with fallback, health monitoring, cost tracking, and capability-based selection',
          'constitutional_requirements', jsonb_build_array(
            'One or more AI providers may be configured at any time',
            'Exactly one provider must be designated as the default at any time',
            'Routing must fall back to the default when an explicit provider is unavailable or unhealthy',
            'All routing decisions must be logged for cost and audit purposes',
            'Provider configuration must be accessible to authorised platform operators only'
          )
        ),
        'current_approved_implementation', jsonb_build_object(
          'tables', jsonb_build_array('ai_provider_configs'),
          'libraries', jsonb_build_array('src/lib/aiProviderManager.ts', 'src/lib/aiCapabilityEngine.ts'),
          'note', 'The ai_capability_routes table referenced in original CD-005 was never implemented. The routing capability is fully satisfied by the ai_provider_configs table combined with the AIProviderManager library. This implementation is constitutionally valid under CD-005-R1.'
        ),
        'supersedes', 'CD-005: AI provider configuration uses the ai_provider_configs / ai_capability_routes tables. The ai_capability_routes table reference is removed from constitutional law.'
      ),

      'navigation_clarification', jsonb_build_object(
        'order', 9,
        'title', 'Navigation Architecture Clarification (Supersedes CONST-001 Ch.4)',
        'content', 'The constitutional navigation specification defines the MINIMUM REQUIRED sections of the Engineering Command Centre. It does not define every possible future section. Additional engineering sections may be added without constitutional amendment, provided they remain within the established navigation hierarchy.',
        'minimum_required_ecc_sections', jsonb_build_array(
          'dashboard — ATD / EIOS operational overview',
          'engineering-intents — intent capture and management',
          'engineering-plans — plan review and governance',
          'work-orders — EWO lifecycle management',
          'knowledge-base — engineering knowledge management',
          'decisions — architectural and governance decisions',
          'ai-providers — AI Capability Routing Service configuration',
          'reports-export — Engineering Records and completion reports',
          'constitution — constitutional documents and amendments',
          'records-library — Engineering Records Library',
          'automation — engineering automation rules and events'
        ),
        'extension_rule', 'Additional sections may be added to the Engineering Command Centre by EWO without constitutional amendment. The constitutional section list is a minimum, not a maximum. Extensions must remain within the established navigation hierarchy.',
        'url_navigation', jsonb_build_object(
          'status', 'Future Architectural Recommendation',
          'description', 'URL-based navigation state management is the recommended long-term architectural pattern for ECC deep-linkability. It is demoted from a constitutional requirement to a future architectural recommendation. The current React state-based navigation implementation is constitutionally acceptable.',
          'original_constitutional_requirement', 'Navigation state is managed in URL hash/path parameters, not component state, ensuring deep-linkability — CONST-001 Ch.4',
          'current_implementation', 'React useState in EngineeringControlCentrePage.tsx',
          'recommendation', 'Deliver URL-based navigation via a future EWO when ECC deep-linking becomes an operational requirement'
        ),
        'product_bar', jsonb_build_object(
          'description', 'The Product Bar represents the EIOS application context. It surfaces ATD, LLND Automate, and the EIOS Platform layer.',
          'contexts', jsonb_build_array('ATD — Engineering Intelligence', 'LLND Automate — Compliance Platform', 'Platform (EIOS) — Platform Operations')
        ),
        'supersedes', 'CONST-001 Ch.4 navigation_architecture — constitutional sections are now defined as minimum required, not exhaustive. URL navigation requirement demoted to recommendation.'
      ),

      'engineering_programme_object', jsonb_build_object(
        'order', 10,
        'title', 'Engineering Programme — Planned Constitutional Object',
        'status', 'Planned Constitutional Object',
        'content', 'The Engineering Programme is the broadest scope of engineering work organisation. This constitutional declaration establishes its purpose and expected implementation. No database tables are created by this amendment.',
        'engineering_programme', jsonb_build_object(
          'status', 'Planned Constitutional Object',
          'purpose', 'Groups related Engineering Initiatives under a common strategic objective. Provides programme-level reporting, governance, and context for all Engineering Work Orders within the programme.',
          'relationships', jsonb_build_object(
            'contains', 'One or more Engineering Initiatives',
            'context_for', 'All Engineering Work Orders within its Initiatives',
            'governed_by', 'Product Owner or Engineering Leadership',
            'tracked_in', 'Engineering Command Centre'
          ),
          'expected_implementation', jsonb_build_object(
            'table', 'engineering_programmes (not yet created)',
            'suggested_fields', jsonb_build_array(
              'programme_ref (e.g. PROG-001)',
              'title',
              'strategic_objective',
              'status',
              'owner',
              'start_date',
              'target_completion_date'
            ),
            'ewo_required', 'Yes. A dedicated EWO must be raised to create this table and link engineering_work_orders to it.'
          )
        ),
        'engineering_initiative', jsonb_build_object(
          'status', 'Planned Constitutional Object',
          'purpose', 'Groups related Engineering Work Orders pursuing a defined engineering goal within an Engineering Programme.',
          'expected_implementation', jsonb_build_object(
            'table', 'engineering_initiatives (not yet created)',
            'ewo_required', 'Yes. Same EWO as Engineering Programme or a follow-on EWO.'
          )
        ),
        'constitutional_note', 'Engineering Programme and Engineering Initiative are declared as constitutional objects by this amendment. They do not yet exist as database tables. No implementation is required before EWO-008 acceptance. Their declaration here establishes the constitutional hierarchy for future implementation.'
      ),

      'constitutional_decisions_summary', jsonb_build_object(
        'order', 11,
        'title', 'Constitutional Decisions — New and Revised',
        'CD_008', jsonb_build_object(
          'id', 'CD-008',
          'source', 'CONST-001-AMD-002',
          'status', 'New — Ratified',
          'decision', 'EIOS is the Engineering Intelligence Operating System and is the platform. ATD and LLND Automate are applications executing on EIOS. All shared platform services belong to EIOS. Applications consume platform services. Applications must never own, duplicate, or re-implement platform services. Future products execute on EIOS.',
          'rationale', 'The pre-acceptance architectural review identified that CONST-001 placed EIOS as a peer product alongside ATD and LLND Automate, which contradicted the intended architectural vision. This decision establishes the correct hierarchical relationship: EIOS is the platform, ATD and LLND Automate are applications.',
          'supersedes', 'CONST-001 Ch.2 three-layer model placing PLATFORM-CORE, ATD, LLND, and EIOS as parallel entities'
        ),
        'CD_009', jsonb_build_object(
          'id', 'CD-009',
          'source', 'CONST-001-AMD-002',
          'status', 'New — Ratified',
          'decision', 'Settings are owned at five hierarchical scopes: Platform, Application, Organisation, Workspace, User. Settings inherit downward. Settings must never cross ownership boundaries upward. Current flat implementation is acknowledged technical debt pending a future EWO.',
          'rationale', 'The original three-scope model had no scope enforcement and the implementation was a flat key-value table. The 5-level hierarchy provides the constitutional target and formally acknowledges the implementation gap.',
          'supersedes', 'CONST-001 Ch.6 settings_ownership three-scope model'
        ),
        'CD_005_R1', jsonb_build_object(
          'id', 'CD-005-R1',
          'source', 'CONST-001-AMD-002',
          'status', 'Revised — Supersedes CD-005',
          'decision', 'The AI Capability Routing Service is the constitutional abstraction for all AI provider selection, routing, and fallback. The constitution defines the service contract, not implementation tables. Current approved implementation: ai_provider_configs table + AIProviderManager library. Implementation may change by EWO without constitutional amendment.',
          'rationale', 'Original CD-005 referenced ai_capability_routes, a table that was not implemented. The constitutional reference to a non-existent artefact was identified in the pre-acceptance review. This revision removes the specific table reference and introduces the service abstraction.',
          'supersedes', 'CD-005: AI provider configuration uses the ai_provider_configs / ai_capability_routes tables'
        ),
        'CD_011', jsonb_build_object(
          'id', 'CD-011',
          'source', 'CONST-001-AMD-002',
          'status', 'New — Ratified',
          'decision', 'The canonical EWO lifecycle has 9 states: draft, submitted, under_review, approved, implementation_complete, ready_for_review, ewo_po_accepted, closed, archived. The cancelled state is a terminal exit from any pre-implementation state. Only an authorised Product Owner action may set ewo_po_accepted. System automation must not set this state.',
          'rationale', 'The 6-state lifecycle in CONST-001 Ch.8 did not reflect the implemented and constitutionally required lifecycle delivered by EWO-008. The 9-state lifecycle is now the canonical constitutional specification.',
          'supersedes', 'CONST-001 Ch.8 ewo_statuses: open, in_progress, awaiting_review, closed, po_acceptance, cancelled'
        )
      )

    ),
    jsonb_build_object(
      'ewo_ref', 'EWO-008',
      'ratified_at', NOW()::text,
      'review_source', 'EWO-008 Pre-Acceptance Constitutional Architecture Review',
      'decisions_introduced', jsonb_build_array('CD-008', 'CD-009', 'CD-005-R1', 'CD-011'),
      'sections_superseded', jsonb_build_array('CONST-001 Ch.2', 'CONST-001 Ch.4 (clarified)', 'CONST-001 Ch.6', 'CONST-001 Ch.8', 'CONST-001 Ch.10 (extended)', 'CD-005')
    )
  )
  RETURNING id INTO v_amd002_id;

  -- Insert corresponding engineering_records_library entry
  INSERT INTO engineering_records_library (
    record_ref,
    record_type,
    title,
    programme,
    ewo_ref,
    status,
    completion_date,
    content,
    version_number,
    generated_by,
    archived_at,
    authority_state,
    source_evidence
  ) VALUES (
    'CONST-001-AMD-002',
    'constitutional_document',
    'CONST-001 Amendment 002 — Platform Hierarchy, EIOS Model & Engineering Object Architecture',
    'ATD Engineering Programme',
    'EWO-008',
    'archived',
    CURRENT_DATE,
    jsonb_build_object(
      'executive_summary', 'CONST-001-AMD-002 establishes EIOS as the Engineering Intelligence Operating System and the platform layer, redefines ATD and LLND Automate as applications executing on EIOS, introduces a 5-level settings ownership hierarchy (CD-009), resolves the AI capability routing constitutional reference gap (CD-005-R1), clarifies minimum navigation requirements, updates the canonical EWO lifecycle to 9 states (CD-011), and declares Engineering Programme and Engineering Initiative as planned constitutional objects.',
      'decisions_introduced', jsonb_build_array(
        'CD-008: EIOS is the platform; ATD and LLND Automate are applications',
        'CD-009: 5-level settings ownership hierarchy (Platform, Application, Organisation, Workspace, User)',
        'CD-005-R1: AI Capability Routing Service abstraction supersedes CD-005',
        'CD-011: Canonical 9-state EWO lifecycle'
      ),
      'sections_superseded', jsonb_build_array(
        'CONST-001 Ch.2 product_hierarchy',
        'CONST-001 Ch.4 navigation_architecture (clarified)',
        'CONST-001 Ch.6 settings_ownership',
        'CONST-001 Ch.8 engineering_lifecycle',
        'CONST-001 Ch.10 records_library_architecture (extended)',
        'CONST-001 CD-005'
      ),
      'planned_constitutional_objects', jsonb_build_array(
        'Engineering Programme (engineering_programmes table — future EWO required)',
        'Engineering Initiative (engineering_initiatives table — future EWO required)'
      )
    ),
    1,
    'EWO-008 Constitutional Closeout',
    NOW(),
    'authoritative',
    'constitutional_documents table: CONST-001-AMD-002, document_type=constitutional_amendment, status=ratified. Source: EWO-008 pre-acceptance constitutional architecture review (2026-07-12).'
  );

END $$;
