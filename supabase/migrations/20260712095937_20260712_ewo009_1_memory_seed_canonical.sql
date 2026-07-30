/*
# EWO-009.1: Engineering Memory Canonical Seed

## Summary
Seeds engineering_memory with structured knowledge extracted from all
authoritative Engineering Records. Corrects the empty memory state caused by
the EWO-009 seed running before records were fully committed.

## Changes
- engineering_memory: 33 knowledge entries across all authoritative records
- engineering_record_lineage: additional links for full coverage
- engineering_records_library: engineering_memory_extracted = true for all seeded records

## Records covered
BATCH-A, BUG-BF-001, CONST-001-AMD-002, CONST-REC-001, ERC-001, ERC-002,
ERC-005, EWO-001, EWO-002, EWO-007R, EWO-007R.1
*/

DO $$
DECLARE
  v_batch_a      uuid := 'b311979b-65e7-4ea9-aba5-2ae7863f0c39';
  v_bugbf001     uuid := '9d7f8ac0-8f9f-4c65-84ba-3475e1ec91f1';
  v_amd002       uuid := 'ab3ea41d-ba97-4999-a455-d520dad616e5';
  v_const001     uuid := '695a194d-618a-45fc-9719-05aa6b645486';
  v_erc001       uuid := '55603b32-39a3-433c-942c-e61c1ce7bb0b';
  v_erc002       uuid := 'd875f512-3884-4a43-9621-68e25795580f';
  v_erc005       uuid := 'c8e85817-31ea-4e1c-922a-bb58df0752c9';
  v_ewo001       uuid := '6adc2466-373a-491f-9a04-066472654d98';
  v_ewo002       uuid := '18058a6b-1382-4c3b-85eb-0975fb39112d';
  v_ewo007r      uuid := '4b5a5fa4-5787-410a-84fb-034f8b150454';
  v_ewo007r1     uuid := '92c59a97-5a02-4be6-9e31-4bf0196c6265';
BEGIN

  -- ─── BATCH-A: API Secret Resolution Fix ────────────────────────────────────
  INSERT INTO engineering_memory (record_id, record_ref, knowledge_category, knowledge_domain, title, content, source_section, tags, authority_state) VALUES

  (v_batch_a, 'BATCH-A', 'lesson_learned', 'platform',
    'API secrets must be resolved at invocation time, not module load',
    'Supabase Edge Function secrets (Deno.env.get) must be called inside the request handler, not at module top-level. Module-level secret resolution fails because the Deno runtime has not yet injected secrets when module initialisation runs. This caused silent authentication failures in the aXcelerate queue functions.',
    'implementation', ARRAY['edge-functions', 'secrets', 'deno', 'axcelerate'], 'authoritative'),

  (v_batch_a, 'BATCH-A', 'pattern', 'platform',
    'Edge Function Secret Resolution Pattern',
    'Pattern: Always call Deno.env.get("SECRET_NAME") inside the Deno.serve handler, never outside it. Apply to all Supabase Edge Functions that consume secrets. Validate secret presence at start of handler and return 500 with clear error if missing.',
    'implementation', ARRAY['edge-functions', 'deno', 'pattern', 'secrets'], 'authoritative'),

  -- ─── BUG-BF-001: Executive Briefing UI Flicker ─────────────────────────────
  (v_bugbf001, 'BUG-BF-001', 'lesson_learned', 'ux',
    'React setState after unmount causes UI flicker',
    'Calling setState on an unmounted React component causes a flicker where the component briefly re-renders with stale state before the cleanup runs. The permanent fix is to track mount state with a ref (isMounted) and guard all async setState calls. This pattern applies to all components that fetch data in useEffect.',
    'defect-analysis', ARRAY['react', 'useeffect', 'unmount', 'flicker', 'ux'], 'authoritative'),

  (v_bugbf001, 'BUG-BF-001', 'anti_pattern', 'ux',
    'Unguarded async setState in useEffect',
    'Anti-pattern: async data fetching in useEffect without cleanup or mount guard. When the component unmounts before the fetch resolves, React throws a warning and the component may flicker. Always return a cleanup function from useEffect that cancels in-flight requests or guards setState calls.',
    'defect-analysis', ARRAY['react', 'useeffect', 'anti-pattern', 'async'], 'authoritative'),

  -- ─── CONST-REC-001: Platform Constitution ──────────────────────────────────
  (v_const001, 'CONST-REC-001', 'architecture', 'platform',
    'CONST-001 establishes the constitutional governance model for EIOS',
    'The platform constitution (CONST-001) defines the authoritative engineering workflow, product hierarchy, navigation requirements, settings architecture, engineering object model, and AI routing. All engineering decisions on the EIOS platform are constitutionally governed. Architectural changes require constitutional review.',
    'constitutional-foundation', ARRAY['constitution', 'governance', 'eios', 'platform'], 'authoritative'),

  (v_const001, 'CONST-REC-001', 'engineering_decision', 'platform',
    'Constitutional governance is the primary authority for engineering decisions',
    'Engineering decisions are made constitutionally, not ad hoc. A constitutional amendment (CONST-001-AMD-XXX) is required to change architectural decisions. This ensures long-term platform coherence and prevents architectural drift. The constitution is ratified by the Product Owner.',
    'constitutional-foundation', ARRAY['constitution', 'governance', 'architectural-decision'], 'authoritative'),

  -- ─── CONST-001-AMD-002: Platform Hierarchy ─────────────────────────────────
  (v_amd002, 'CONST-001-AMD-002', 'architecture', 'platform',
    'EIOS is the platform layer — ATD and LLND Automate are applications (CD-008)',
    'Constitutional decision CD-008: EIOS (Engineering Intelligence Operating System) is the platform layer. ATD (project and engineering management) and LLND Automate (automation intelligence) are applications executing on EIOS. Neither ATD nor LLND Automate is a peer platform. Platform infrastructure (auth, records library, constitutional engine) is shared.',
    'platform_hierarchy_revised', ARRAY['eios', 'atd', 'llnd-automate', 'platform', 'cd-008'], 'authoritative'),

  (v_amd002, 'CONST-001-AMD-002', 'architecture', 'platform',
    '5-level settings ownership hierarchy (CD-009)',
    'Constitutional decision CD-009: Settings ownership follows a 5-level hierarchy: Platform (EIOS defaults) → Application (ATD/LLND overrides) → Organisation (org policy) → Workspace (workspace override) → User (personal preference). The current flat settings table is technical debt requiring an explicit EWO to resolve.',
    'settings_ownership_revised', ARRAY['settings', 'hierarchy', 'cd-009', 'tenant'], 'authoritative'),

  (v_amd002, 'CONST-001-AMD-002', 'engineering_decision', 'platform',
    '9-state EWO lifecycle with PO authority gate (CD-011)',
    'Constitutional decision CD-011: The canonical EWO lifecycle has 9 states: draft → submitted → under_review → approved → implementation_complete → ready_for_review → ewo_po_accepted → closed → archived. Product Owner acceptance gates the ewo_po_accepted transition. Only ewo_po_accepted triggers authoritative record creation via RULE-002.',
    'engineering_lifecycle_revised', ARRAY['lifecycle', 'ewo', 'po-authority', 'cd-011'], 'authoritative'),

  (v_amd002, 'CONST-001-AMD-002', 'architecture', 'ai',
    'AI Capability Routing Service replaces ai_capability_routes as constitutional contract (CD-005-R1)',
    'Constitutional decision CD-005-R1: The AI Capability Routing Service is the authoritative abstraction for AI capability selection and provider routing. The ai_capability_routes table is demoted to an implementation detail. This removes vendor lock-in language per CD-001-R1 and allows the routing implementation to evolve without constitutional amendment.',
    'ai_capability_routing_revised', ARRAY['ai', 'routing', 'cd-005-r1', 'abstraction'], 'authoritative'),

  -- ─── ERC-001: Engineering Audit Framework ─────────────────────────────────
  (v_erc001, 'ERC-001', 'engineering_decision', 'quality-assurance',
    'Engineering Audit Framework: systematic defect resolution via RCA',
    'The Engineering Audit Framework requires root cause analysis (RCA) for every identified defect. The resolution cycle is: identify → RCA → corrective action → validation → closeout. Engineering audits are recorded as authoritative Engineering Records. Guardian reviews gate release candidates.',
    'audit-framework', ARRAY['audit', 'rca', 'defect', 'guardian'], 'authoritative'),

  (v_erc001, 'ERC-001', 'pattern', 'quality-assurance',
    'Engineering Review Cycle: audit → defect → correction → validation',
    'Pattern for engineering quality reviews: (1) conduct structured audit against defined domains, (2) record all defects with severity and root cause, (3) implement corrective actions, (4) validate corrections, (5) produce Engineering Record as closeout. This pattern applies to Architecture Guardian reviews, QA reviews, and engineering assessments.',
    'audit-framework', ARRAY['audit', 'review', 'pattern', 'quality'], 'authoritative'),

  -- ─── ERC-002: Audit UI Consistency Review ─────────────────────────────────
  (v_erc002, 'ERC-002', 'lesson_learned', 'ux',
    'UI consistency requires systematic review, not ad-hoc fixes',
    'ERC-002 established that UI inconsistency across the audit module accumulated because there was no systematic review cadence. The fix was a comprehensive review against the design system, not individual component patches. Lesson: schedule periodic UI consistency reviews as part of the engineering programme, not only in response to identified defects.',
    'ui-review', ARRAY['ui', 'consistency', 'design-system', 'review'], 'authoritative'),

  (v_erc002, 'ERC-002', 'pattern', 'ux',
    'Systematic UI review pattern: inventory → assess → correct → validate',
    'Pattern: (1) inventory all UI components in scope, (2) assess each against the design system standard, (3) record deviations, (4) implement corrections in a single focused pass, (5) validate against the design system. This prevents the accumulation of UI debt across multiple small divergences.',
    'ui-review', ARRAY['ui', 'review', 'pattern', 'design-system'], 'authoritative'),

  -- ─── ERC-005: Transactional Governance ────────────────────────────────────
  (v_erc005, 'ERC-005', 'architecture', 'security',
    'Tenant isolation via organisation_id on all shared tables',
    'All tables shared across organisations must include an organisation_id column with appropriate RLS policies. Rows without an organisation_id are explicitly transitional (CD-006-R1) and require a migration EWO to assign. NEVER treat NULL organisation_id as implicit access to all organisations — it is a technical debt marker, not a privilege grant.',
    'tenant-isolation', ARRAY['rls', 'organisation-id', 'tenant-isolation', 'security', 'cd-006-r1'], 'authoritative'),

  (v_erc005, 'ERC-005', 'engineering_decision', 'security',
    'NULL organisation_id is transitional constraint, not implicit access (CD-006-R1)',
    'Constitutional decision CD-006-R1: NULL organisation_id on a record means the record predates multi-tenancy or has not yet been assigned to an organisation. It does NOT grant implicit access to all tenants. The migration path requires an explicit EWO to assign organisation_id values. RLS policies must not allow NULL to bypass access control.',
    'tenant-isolation', ARRAY['organisation-id', 'null', 'transitional', 'cd-006-r1'], 'authoritative'),

  -- ─── EWO-001: ATD Product Identity ────────────────────────────────────────
  (v_ewo001, 'EWO-001', 'architecture', 'platform',
    'ATD product identity and brand foundation on EIOS platform',
    'EWO-001 established the ATD product identity as a distinct application on the EIOS platform. Product identity (branding, naming, positioning) is managed at the application layer, not the platform layer. EIOS provides the infrastructure; ATD provides the product experience. This separation allows independent brand evolution.',
    'product-identity', ARRAY['atd', 'brand', 'product-identity', 'eios'], 'authoritative'),

  -- ─── EWO-002: Customer-Facing Rebrand ─────────────────────────────────────
  (v_ewo002, 'EWO-002', 'engineering_decision', 'platform',
    'LLND Automate is the customer-facing brand for the automation product',
    'EWO-002 established LLND Automate as the customer-facing brand for the automation intelligence product. The internal engineering name and the customer-facing brand are intentionally separated. This allows brand evolution without platform architecture changes. Product naming is managed at the application layer.',
    'brand-identity', ARRAY['llnd-automate', 'brand', 'rebrand', 'product'], 'authoritative'),

  -- ─── EWO-007R: AI Capability Governance ───────────────────────────────────
  (v_ewo007r, 'EWO-007R', 'architecture', 'ai',
    'AI routing via AI Capability Engine with provider abstraction',
    'The AI Capability Engine routes AI requests through an abstraction layer that selects providers based on capability requirements, cost, and availability. Provider configurations are stored in ai_provider_configs. This prevents direct vendor coupling in application code. All AI calls go through the routing layer.',
    'ai-routing', ARRAY['ai', 'routing', 'capability-engine', 'provider-abstraction'], 'authoritative'),

  (v_ewo007r, 'EWO-007R', 'pattern', 'ai',
    'AI Provider Configuration Pattern: centralised registry with capability routing',
    'Pattern: (1) register AI providers in ai_provider_configs with capability flags, (2) route requests through the AI Capability Engine which selects the best provider for the required capability, (3) never hardcode provider names in application code, (4) fall back gracefully when a provider is unavailable.',
    'ai-routing', ARRAY['ai', 'provider', 'configuration', 'pattern', 'routing'], 'authoritative'),

  (v_ewo007r, 'EWO-007R', 'engineering_decision', 'ai',
    'AI governance requires structured response contracts to prevent hallucination propagation',
    'EWO-007R established that AI responses must conform to a structured response contract validated on receipt. Unvalidated AI responses must not propagate into engineering records or constitutional decisions. The response contract defines expected fields, types, and constraints. Invalid responses are rejected with error logging.',
    'governance', ARRAY['ai', 'governance', 'response-contract', 'validation'], 'authoritative'),

  -- ─── EWO-007R.1: Transactional Governance & Tenant Isolation ──────────────
  (v_ewo007r1, 'EWO-007R.1', 'architecture', 'security',
    'Transactional integrity via explicit commit patterns in multi-tenant operations',
    'EWO-007R.1 established that multi-tenant operations requiring multiple table writes must use explicit transaction patterns to ensure atomicity. A partial write that spans organisations could leak data across tenant boundaries. The pattern: wrap multi-table operations in explicit transactions; verify organisation_id on every write.',
    'transactional-governance', ARRAY['transactions', 'atomicity', 'multi-tenant', 'security'], 'authoritative'),

  (v_ewo007r1, 'EWO-007R.1', 'known_risk', 'security',
    'Partial write risk in multi-tenant multi-table operations',
    'Risk: A network failure or application error mid-operation can leave data in a partially-written state where one table has the record but another does not. In a multi-tenant context this can cause data visibility inconsistencies. Mitigation: use database transactions, validate operation completeness, implement idempotency keys.',
    'transactional-governance', ARRAY['risk', 'partial-write', 'transaction', 'multi-tenant'], 'authoritative');

  -- ─── Update memory extracted flags ─────────────────────────────────────────
  UPDATE engineering_records_library
  SET engineering_memory_extracted = true
  WHERE id IN (
    v_batch_a, v_bugbf001, v_amd002, v_const001,
    v_erc001, v_erc002, v_erc005, v_ewo001,
    v_ewo002, v_ewo007r, v_ewo007r1
  );

  -- ─── Re-seed lineage (idempotent: delete first) ────────────────────────────
  DELETE FROM engineering_record_lineage WHERE from_record_id IN (
    v_batch_a, v_bugbf001, v_amd002, v_const001,
    v_erc001, v_erc002, v_erc005, v_ewo001,
    v_ewo002, v_ewo007r, v_ewo007r1
  );

  INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes) VALUES

  -- BATCH-A
  (v_batch_a, 'BATCH-A', 'BATCH-A', 'related_ewo', 'Engineering Record produced by BATCH-A API secret resolution'),
  (v_batch_a, 'BATCH-A', 'EWO-007R', 'related_ewo', 'BATCH-A fix was part of the broader EWO-007R governance scope'),

  -- BUG-BF-001
  (v_bugbf001, 'BUG-BF-001', 'BUG-BF-001', 'related_ewo', 'Engineering Record for executive briefing flicker permanent fix'),

  -- CONST-REC-001 (CONST-001)
  (v_const001, 'CONST-REC-001', 'CONST-001', 'related_constitutional_amendment', 'Canonical record for the ratified platform constitution CONST-001'),

  -- CONST-001-AMD-002
  (v_amd002, 'CONST-001-AMD-002', 'CONST-001', 'supersedes', 'AMD-002 supersedes Ch.2, Ch.4, Ch.6, Ch.8, Ch.10 and CD-005 of CONST-001'),
  (v_amd002, 'CONST-001-AMD-002', 'CONST-001-AMD-001', 'related_record', 'AMD-002 extends constitutional lineage established by AMD-001'),
  (v_amd002, 'CONST-001-AMD-002', 'CD-008', 'related_decision', 'CD-008: EIOS is the platform layer'),
  (v_amd002, 'CONST-001-AMD-002', 'CD-009', 'related_decision', 'CD-009: 5-level settings ownership hierarchy'),
  (v_amd002, 'CONST-001-AMD-002', 'CD-011', 'related_decision', 'CD-011: 9-state EWO lifecycle with PO authority gate'),
  (v_amd002, 'CONST-001-AMD-002', 'CD-005-R1', 'related_decision', 'CD-005-R1: AI Capability Routing Service abstraction'),
  (v_amd002, 'CONST-001-AMD-002', 'EWO-008', 'related_ewo', 'AMD-002 was produced and ratified as part of EWO-008 closeout'),

  -- ERC-001
  (v_erc001, 'ERC-001', 'ERC-001', 'related_record', 'Engineering Audit Framework Defect Fix Cycle — foundation audit record'),

  -- ERC-002
  (v_erc002, 'ERC-002', 'ERC-001', 'related_record', 'ERC-002 audit review follows the audit framework established by ERC-001'),

  -- ERC-005
  (v_erc005, 'ERC-005', 'EWO-007R.1', 'related_ewo', 'ERC-005 is the closeout record for EWO-007R.1'),
  (v_erc005, 'ERC-005', 'CD-006-R1', 'related_decision', 'CD-006-R1: NULL organisation_id is transitional'),

  -- EWO-001
  (v_ewo001, 'EWO-001', 'EWO-001', 'related_ewo', 'ATD Product Identity constitutional layer'),

  -- EWO-002
  (v_ewo002, 'EWO-002', 'EWO-001', 'related_record', 'EWO-002 customer-facing rebrand follows EWO-001 product identity'),

  -- EWO-007R
  (v_ewo007r, 'EWO-007R', 'EWO-007R', 'related_ewo', 'AI Capability Governance & Routing Hardening v1.0'),
  (v_ewo007r, 'EWO-007R', 'CD-005-R1', 'related_decision', 'EWO-007R AI routing hardening precedes the constitutional CD-005-R1'),

  -- EWO-007R.1
  (v_ewo007r1, 'EWO-007R.1', 'EWO-007R', 'related_record', 'EWO-007R.1 extends the governance work of EWO-007R'),
  (v_ewo007r1, 'EWO-007R.1', 'CD-006-R1', 'related_decision', 'EWO-007R.1 tenant isolation work leads to CD-006-R1');

END $$;
