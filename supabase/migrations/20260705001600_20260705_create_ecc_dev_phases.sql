/*
# Development Programme — AI Technical Director

## Summary
Creates the `ecc_dev_phases` table — structured database of every development
phase for the LLN+D platform. The AI Technical Director reads this table to:
- Assess readiness of the current phase
- Recommend the next phase
- Generate complete Bolt-ready implementation plans automatically
- Track progress across the full product lifecycle

## New Table: ecc_dev_phases

Columns cover full phase lifecycle: objectives, tasks, acceptance criteria,
dependencies, status, priority, confidence, timing, related artefacts,
AI-generated bolt_prompt, and readiness_assessment.

## Security
- RLS enabled
- Admins: full CRUD
- Authenticated users: read-only

## Seed
Seeds 14 phases matching the known LLN+D implementation history plus
planned upcoming work. Phases 1-8 are marked complete. Phase 9 (this
feature) is in_progress. Phases 10-14 are planned/backlog.
*/

CREATE TABLE IF NOT EXISTS ecc_dev_phases (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_number          integer NOT NULL,
  title                 text NOT NULL,
  description           text,
  objectives            jsonb NOT NULL DEFAULT '[]',
  implementation_tasks  jsonb NOT NULL DEFAULT '[]',
  acceptance_criteria   jsonb NOT NULL DEFAULT '[]',
  dependencies          jsonb NOT NULL DEFAULT '[]',
  status                text NOT NULL DEFAULT 'backlog',
  priority              text NOT NULL DEFAULT 'medium',
  confidence            integer,
  estimated_build_time  text,
  estimated_risk        text DEFAULT 'medium',
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  reviewed_at           timestamptz,
  release_version       text,
  related_features      text[] DEFAULT '{}',
  related_docs          text[] DEFAULT '{}',
  related_db_objects    text[] DEFAULT '{}',
  related_api_endpoints text[] DEFAULT '{}',
  related_tests         text[] DEFAULT '{}',
  related_milestones    text[] DEFAULT '{}',
  notes                 text,
  bolt_prompt           text,
  readiness_assessment  jsonb,
  reviewed_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(phase_number)
);

ALTER TABLE ecc_dev_phases ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ecc_dev_phases_status       ON ecc_dev_phases(status);
CREATE INDEX IF NOT EXISTS idx_ecc_dev_phases_phase_number ON ecc_dev_phases(phase_number);

DROP POLICY IF EXISTS "admins_manage_dev_phases" ON ecc_dev_phases;
CREATE POLICY "admins_manage_dev_phases" ON ecc_dev_phases
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "authenticated_read_dev_phases" ON ecc_dev_phases;
CREATE POLICY "authenticated_read_dev_phases" ON ecc_dev_phases
  FOR SELECT TO authenticated
  USING (true);

-- ── Seed data ─────────────────────────────────────────────────────────────────

INSERT INTO ecc_dev_phases
  (phase_number, title, description, status, priority, estimated_risk, release_version,
   completed_at, objectives, acceptance_criteria, related_db_objects)
VALUES

(1, 'Foundation — Auth, Profiles, Assessments',
 'Core authentication, profile management, assessment engine with LLN and Digital Literacy question banks, invitation and token system, basic admin portal.',
 'complete', 'critical', 'low', '0.1.0', now() - interval '30 days',
 '["Supabase auth with email/password","Profile and role management","Assessment question banks for LLN and Digital","Invitation and secure token system","Basic admin portal"]',
 '["Candidates can receive assessment links","Students can complete assessments","Admins can view results"]',
 ARRAY['profiles','assessments','assessment_invitations','invitation_assessments','assessment_responses']),

(2, 'Qualification & ACSF Mapping Engine',
 'Qualification library, ACSF requirements, unit-of-competency mapping, AI-powered foundation skills extraction, mapping evidence module.',
 'complete', 'critical', 'low', '0.2.0', now() - interval '25 days',
 '["Qualification management with LLN requirements","ACSF level mapping per qualification","Unit of competency library","AI extraction of ACSF levels from TGA unit descriptors"]',
 '["Qualifications display ACSF requirements","AI extracts foundation skills accurately","Mapping evidence is stored and auditable"]',
 ARRAY['qualifications','qualification_lln_requirements','qualification_acsf_requirements','uoc_acsf_library','qualification_uoc_mapping','acsf_mapping_evidence']),

(3, 'Candidate Management & Support Plans',
 'Full candidate management portal, support plan generation, intervention tracking, notification system.',
 'complete', 'high', 'low', '0.3.0', now() - interval '20 days',
 '["Candidate list with search and filters","Automated support plan generation","Intervention case management","Email notification triggers"]',
 '["Trainers can manage candidates","Support plans are generated automatically","Interventions can be tracked","Email notifications fire on key events"]',
 ARRAY['support_plans','interventions','notifications','audit_trail','lifecycle_events']),

(4, 'aXcelerate Integration — Full Stack',
 'Bidirectional aXcelerate integration: inbound sync, contact note write-back queue, webhook auto-provisioning, portfolio upload, bulk sync.',
 'complete', 'critical', 'low', '0.4.0', now() - interval '15 days',
 '["Inbound sync from aXcelerate contacts and courses","Contact note write-back for all LLN lifecycle events","Webhook endpoint for auto-provisioning","Portfolio upload to aXcelerate","Bulk sync pg_cron job"]',
 '["Contact notes appear in aXcelerate after quiz events","Webhook auto-creates candidates","Bulk sync keeps candidates in sync","Portfolio uploads succeed"]',
 ARRAY['axcelerate_sync_log','axcelerate_writeback_queue','axcelerate_inbound_sync_log']),

(5, 'Billing & Subscription Management',
 'Stripe integration: subscription tiers, checkout, customer portal, webhook handling, billing events log.',
 'complete', 'high', 'low', '0.5.0', now() - interval '12 days',
 '["Stripe checkout for plan selection","Customer portal for subscription management","Webhook handling for payment events","Billing events audit log"]',
 '["Users can subscribe via Stripe","Subscription status is tracked","Customer portal link works"]',
 ARRAY['billing_subscriptions','billing_events']),

(6, 'Engineering Command Centre — Internal Tooling',
 'Full ECC: product feature registry, roadmap, milestones, backlog, architecture decisions, documentation, testing, release centre, goals/epics, engineering standards.',
 'complete', 'high', 'low', '0.6.0', now() - interval '8 days',
 '["Product feature catalogue with metadata","Roadmap and milestone tracking","Architecture decision records","Documentation library","Release candidate management","Goals, epics, and backlog"]',
 '["Feature registry reflects real platform state","ADRs are documented","Releases tracked through RC workflow","Documentation library is populated"]',
 ARRAY['ecc_product_features','ecc_roadmap_items','ecc_milestones','ecc_phases','ecc_backlog_items','ecc_decisions','ecc_documentation','ecc_engineering_standards','ecc_release_candidates']),

(7, 'Command Centre AI — Engineering Assistant',
 'AI engineering assistant: product context, build planning, impact analysis, compliance audit, documentation generation, change record tracking, approval workflow.',
 'complete', 'high', 'low', '0.7.0', now() - interval '5 days',
 '["Engineering AI with full product context","Build planning mode","Impact analysis","Compliance audit mode","Change record auto-generation","Approval workflow (Analyse → Prepare → Approve → Apply)"]',
 '["AI answers questions about the platform","Build planning generates complete specs","Change records are persisted","Approval workflow enforces safety gate"]',
 ARRAY['cc_ai_conversations','cc_ai_messages','ecc_change_records','cc_ai_favourite_prompts']),

(8, 'Centralised AI Provider Service',
 'Platform-managed AI provider. Shared AIService module, usage logging, response caching, extended settings UI. Customers never need their own API keys.',
 'complete', 'high', 'low', '0.8.0', now() - interval '1 hour',
 '["Shared AIService Deno module","AI usage logging with cost estimation","Response caching","Extended Settings UI","Refactored AI edge functions"]',
 '["Customers never enter API keys","All AI calls route through AIService","Usage is logged","Settings UI shows provider and usage"]',
 ARRAY['ai_usage_log','ai_response_cache']),

(9, 'AI Technical Director & Development Programme',
 'Evolve the Command Centre into a self-managing engineering programme. Structured development phases database. AI Technical Director assesses readiness, recommends next phases, generates Bolt-ready implementation plans automatically.',
 'in_progress', 'critical', 'medium', '0.9.0', NULL,
 '["ecc_dev_phases table for all development phases","Technical Director AI with readiness assessment","Automatic next-phase recommendation","Execute Next Phase generates Bolt-ready prompt","Development Programme UI with CRUD","Knowledge integration across all ECC sources"]',
 '["Development phases stored as structured records","AI assesses current phase readiness with pass/fail checklist","AI recommends next phase with reasoning","Execute Next Phase produces usable Bolt prompt","User approval required before any implementation","Phase status tracked automatically"]',
 ARRAY['ecc_dev_phases','ai_usage_log']),

(10, 'Student Experience — Enhanced Portal',
 'Improved student-facing quiz portal: progress indicators, accessibility improvements, mobile optimisation, enhanced declaration flow.',
 'planned', 'high', 'medium', '1.0.0', NULL,
 '["Improved progress bar and section indicators","WCAG 2.1 AA accessibility","Optimised mobile layout","Enhanced declaration screen","Graceful offline handling"]',
 '["Quiz is fully usable on mobile","All elements are keyboard accessible","Declaration screen complies with requirements"]',
 ARRAY[]::text[]),

(11, 'Compliance & Reporting Module',
 'ASQA compliance dashboard, automated gap detection, report generation, evidence packaging, compliance calendar.',
 'planned', 'critical', 'high', '1.1.0', NULL,
 '["ASQA compliance dashboard with gap analysis","Automated compliance checks","Report generation (PDF/CSV)","Evidence packaging for audits","Compliance calendar"]',
 '["Compliance gaps are surfaced automatically","Reports can be exported","Evidence bundles can be generated"]',
 ARRAY[]::text[]),

(12, 'Multi-Tenant & Organisation Management',
 'Full multi-tenancy: organisation isolation, sub-accounts, trainer management, custom branding, org-level analytics.',
 'planned', 'high', 'high', '1.2.0', NULL,
 '["Organisation table with data isolation","Sub-account and trainer management","Custom branding per organisation","Organisation-level analytics"]',
 '["Each org sees only their data","Trainers access only their organisation","Branding applies in student portal"]',
 ARRAY[]::text[]),

(13, 'AI Qualification Mapping Assistant',
 'AI-powered qualification-to-ACSF mapping: gap analysis, suggested mappings, confidence scores, bulk import.',
 'backlog', 'high', 'medium', '1.3.0', NULL,
 '["AI suggests ACSF mappings from qualification descriptors","Gap analysis between current and target levels","Mapping confidence scores","Bulk qualification import with AI pre-mapping"]',
 '["AI-suggested mappings achieve >80% acceptance","Gap analysis is actionable","Confidence scores are calibrated"]',
 ARRAY[]::text[]),

(14, 'Advanced Analytics & Insights',
 'Platform analytics: cohort analysis, intervention effectiveness, time-to-completion trends, ACSF outcome distributions.',
 'backlog', 'medium', 'low', '1.4.0', NULL,
 '["Cohort analysis by qualification and intake","Intervention effectiveness tracking","Time-to-completion distributions","ACSF outcome heat maps"]',
 '["Analytics load within 3 seconds","Cohort comparisons are meaningful","Data is exportable"]',
 ARRAY[]::text[])

ON CONFLICT (phase_number) DO NOTHING;
