/*
# EWO-010: Engineering Execution Platform — Seed Data

## Purpose
Seeds foundational data for the Engineering Execution Platform:
- 1 initial capability profile (general-purpose AI engineering agent)
- 1 registered agent (EIOS AI Engineering Agent — vendor-neutral, not Bolt-coupled)
- 3 execution policies (quality gate, guardian, memory integration)
- 2 execution contracts (engineering quality contract, constitutional compliance contract)
- 1 execution context (EIOS primary development context)

## Notes
1. The registered agent is named "EIOS AI Engineering Agent" — no vendor lock-in.
2. Policies are seeded as advisory by default; guardian policy is strict.
3. All seed data is idempotent via ON CONFLICT DO NOTHING.
*/

-- ─── Capability Profile ───────────────────────────────────────────────────────

INSERT INTO execution_capability_profile (
  id, profile_name, capabilities, supported_languages, supported_frameworks,
  execution_modes, max_session_duration_minutes, supports_rollback,
  supports_guardian, supports_parallel_tasks, description
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'EIOS Full-Stack Engineering Agent',
  ARRAY[
    'code_generation', 'code_review', 'refactoring', 'testing', 'documentation',
    'database_migration', 'api_design', 'architecture_review', 'deployment',
    'debugging', 'performance_analysis', 'security_review'
  ],
  ARRAY['TypeScript', 'JavaScript', 'SQL', 'Markdown', 'JSON'],
  ARRAY['React', 'Vite', 'Supabase', 'Tailwind CSS', 'Vitest', 'jsPDF'],
  ARRAY['interactive', 'autonomous', 'supervised', 'review_only'],
  480,
  true,
  true,
  false,
  'Full-stack engineering capability profile for EIOS platform development. Supports TypeScript/React frontend, Supabase backend, testing, documentation, and architecture review.'
) ON CONFLICT (id) DO NOTHING;

-- ─── Engineering Agent Registration ──────────────────────────────────────────

INSERT INTO engineering_agent (
  id, agent_ref, name, vendor, version, agent_type, status, health,
  capability_profile_id, description, last_health_check_at, execution_count, metadata
) VALUES (
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'EIOS-AGENT-001',
  'EIOS AI Engineering Agent',
  'Anthropic (via Bolt)',
  'claude-3-7-sonnet',
  'full_stack',
  'active',
  'healthy',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Primary AI engineering agent for EIOS platform. Registered as a pluggable implementation — not constitutionally coupled. Vendor: Anthropic (accessed via Bolt execution environment).',
  now(),
  0,
  jsonb_build_object(
    'constitutional_compliance', true,
    'engineering_memory_integrated', true,
    'guardian_compatible', true,
    'registered_under_ewo', 'EWO-010',
    'note', 'Agent is pluggable. EIOS platform does not reference this vendor directly in constitutional objects.'
  )
) ON CONFLICT (agent_ref) DO NOTHING;

-- ─── Execution Policies ───────────────────────────────────────────────────────

INSERT INTO execution_policy (policy_ref, name, policy_type, description, rules, enforcement_level, applies_to, active, version)
VALUES
(
  'POL-001',
  'Engineering Quality Gate Policy',
  'quality',
  'All execution sessions must pass build and test validation before transitioning to completed state.',
  jsonb_build_array(
    jsonb_build_object('rule', 'build_must_pass', 'description', 'npm run build must succeed with zero errors'),
    jsonb_build_object('rule', 'tests_must_pass', 'description', 'npm run test must pass all test cases'),
    jsonb_build_object('rule', 'no_typescript_errors', 'description', 'TypeScript type checking must pass'),
    jsonb_build_object('rule', 'evidence_required', 'description', 'Build and test results must be recorded as execution evidence')
  ),
  'strict',
  ARRAY['execution_session', 'execution_task'],
  true,
  1
),
(
  'POL-002',
  'Engineering Guardian Review Policy',
  'guardian',
  'Sessions flagged as guardian_required must obtain guardian approval before transitioning to accepted state.',
  jsonb_build_array(
    jsonb_build_object('rule', 'guardian_review_mandatory', 'description', 'guardian_required=true sessions must pass through guardian_review state'),
    jsonb_build_object('rule', 'architectural_impact_triggers_review', 'description', 'Any session affecting architecture, security, or constitutional objects triggers guardian_required'),
    jsonb_build_object('rule', 'guardian_approval_recorded', 'description', 'guardian_approved_at must be set before state transitions to awaiting_product_owner or accepted')
  ),
  'strict',
  ARRAY['execution_session'],
  true,
  1
),
(
  'POL-003',
  'Engineering Memory Integration Policy',
  'memory',
  'All execution sessions must retrieve relevant engineering memory before execution and update engineering memory after completion.',
  jsonb_build_array(
    jsonb_build_object('rule', 'pre_execution_memory_retrieval', 'description', 'engineering_memory must be queried for relevant records, patterns, standards, and risks before execution begins'),
    jsonb_build_object('rule', 'post_execution_memory_update', 'description', 'Engineering Records, Knowledge, and Lineage must be updated after successful execution'),
    jsonb_build_object('rule', 'memory_integration_recorded', 'description', 'execution_memory_integration rows must be created for pre and post phases')
  ),
  'advisory',
  ARRAY['execution_session'],
  true,
  1
)
ON CONFLICT (policy_ref) DO NOTHING;

-- ─── Execution Contracts ─────────────────────────────────────────────────────

INSERT INTO execution_contract (contract_ref, name, contract_type, scope, obligations, constraints, acceptance_criteria, active, version)
VALUES
(
  'CTR-001',
  'EIOS Engineering Quality Contract',
  'quality',
  'All execution sessions operating within the EIOS Engineering Execution Platform',
  jsonb_build_array(
    jsonb_build_object('obligation', 'Build passes before completion'),
    jsonb_build_object('obligation', 'All tests pass before completion'),
    jsonb_build_object('obligation', 'Evidence is recorded for all validation steps'),
    jsonb_build_object('obligation', 'Engineering Record is produced for completed sessions'),
    jsonb_build_object('obligation', 'Engineering Memory is updated post-completion')
  ),
  jsonb_build_array(
    jsonb_build_object('constraint', 'No production deployments without guardian approval'),
    jsonb_build_object('constraint', 'No schema changes without migration record'),
    jsonb_build_object('constraint', 'No data destruction operations')
  ),
  jsonb_build_array(
    jsonb_build_object('criterion', 'npm run build exits with code 0'),
    jsonb_build_object('criterion', 'npm run test reports 0 failures'),
    jsonb_build_object('criterion', 'Engineering Record exists with authority_state = authoritative'),
    jsonb_build_object('criterion', 'Engineering Memory updated with extracted knowledge')
  ),
  true,
  1
),
(
  'CTR-002',
  'EIOS Constitutional Compliance Contract',
  'constitutional',
  'All engineering execution within the EIOS platform',
  jsonb_build_array(
    jsonb_build_object('obligation', 'Constitutional constraints are honoured in all execution'),
    jsonb_build_object('obligation', 'CONST-001-AMD-002 platform hierarchy is respected'),
    jsonb_build_object('obligation', 'Engineering Constitution CD-007-R1 canonical source principle is maintained'),
    jsonb_build_object('obligation', 'No vendor lock-in introduced at constitutional level')
  ),
  jsonb_build_array(
    jsonb_build_object('constraint', 'Engineering agents are pluggable — no constitutional coupling to specific vendors'),
    jsonb_build_object('constraint', 'Execution platform serves EIOS — not any single agent provider'),
    jsonb_build_object('constraint', 'Constitutional documents cannot be overridden by execution contracts')
  ),
  jsonb_build_array(
    jsonb_build_object('criterion', 'No direct vendor references in constitutional objects'),
    jsonb_build_object('criterion', 'Engineering Record is canonical — derived exports are not canonical'),
    jsonb_build_object('criterion', 'Execution platform versioning follows Engineering Object Model Standard')
  ),
  true,
  1
)
ON CONFLICT (contract_ref) DO NOTHING;

-- ─── Primary Execution Context ────────────────────────────────────────────────

INSERT INTO execution_context (
  context_ref, name, repository, branch, application, product, environment,
  risk_level, policies, contracts
) VALUES (
  'CTX-EIOS-001',
  'EIOS Primary Development Context',
  'eios-platform',
  'main',
  'EIOS Engineering Control Centre',
  'EIOS Platform',
  'development',
  'medium',
  jsonb_build_array('POL-001', 'POL-002', 'POL-003'),
  jsonb_build_array('CTR-001', 'CTR-002')
) ON CONFLICT (context_ref) DO NOTHING;
