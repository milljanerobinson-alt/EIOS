
-- Re-create ADR-001
INSERT INTO ecc_architecture_reviews (
  adr_number, title, review_type, review_date, status,
  context, decision, rationale, consequences, summary, reviewer
) VALUES (
  'ADR-001',
  'Engineering & Operations Centre Core Architecture',
  'architecture',
  '2026-07-04',
  'accepted',
  'The Engineering & Operations Centre (EOC) has evolved from a simple implementation tracker into a full-featured Engineering Operating System (EOS). The platform now manages the complete software engineering lifecycle for LLN+D: from strategic vision through product roadmap, milestones, phases, release candidates, testing, documentation, and production deployment. A stable, documented architectural foundation is required before further feature development proceeds.',
  'The Engineering & Operations Centre core architecture is considered stable as of EOC v1.0. Future enhancements should extend the platform rather than fundamentally redesign it. Major architectural changes require a new ADR documenting the rationale, benefits, risks, migration strategy, backwards compatibility implications, and impact on engineering history. Routine enhancements — including reports, dashboards, automation, integrations, workflow improvements, and UI enhancements — do NOT require an architectural ADR.',
  'The EOC has organically grown into a professional Engineering Operating System. Documenting the architectural baseline at v1.0 ensures: (1) engineering history is preserved through every future iteration, (2) new engineers can understand the system immediately, (3) platform governance is enforced through ADRs for structural changes, and (4) the hierarchy — Product → Vision → Roadmap → Milestone → Phase → Release Candidate → Release — becomes the permanent operating model.',
  'All future engineering work on LLN+D must be traceable through the EOC hierarchy. Emergency production hotfixes may bypass the standard workflow but must be retrospectively documented. The EOC becomes the single source of truth for: Product Vision, Product Roadmap, Milestones, Phases, Backlog, ADRs, AI Journals, Documentation, Testing, Release Management, Engineering Reports, and Audit History.',
  'Establishes the EOC as a stable v1.0 Engineering Operating System. Defines the permanent engineering hierarchy. Mandates ADRs for structural changes. Preserves all engineering history from Phases 1–3.',
  'Engineering Team'
);

-- Fix RC-003 document title — revert the "Workflow Automation" addition, restore to original
UPDATE ecc_documentation
SET title = 'EOC Phase Completion Report — Phase 3 (v0.3)'
WHERE id = 'aa8f8279-47d9-4c3f-a013-790611c346a1';
