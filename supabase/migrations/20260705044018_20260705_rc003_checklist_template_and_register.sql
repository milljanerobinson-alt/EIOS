/*
# RC-003: Seed Release Readiness Checklist Template and RC-003 Register Entry

## Summary
Seeds the standard Release Readiness Checklist template (CHK-001) that can be applied
to any future release candidate. Also registers RC-003 in the engineering register.

## Tables Modified
- ecc_checklist_templates: CHK-001 seeded
- ecc_checklist_template_items: 20 standard items seeded
- ecc_engineering_register: RC-003 entry added
- ecc_register_sequences: chk sequence added
*/

-- Register CHK sequence
INSERT INTO ecc_register_sequences (register_type, last_number)
VALUES ('chk', 0)
ON CONFLICT (register_type) DO NOTHING;

-- ─── Seed CHK-001 template ────────────────────────────────────────────────────

INSERT INTO ecc_checklist_templates (template_number, name, description, template_type, version, status, created_by)
VALUES (
  'CHK-001',
  'Standard Release Readiness Checklist',
  'The standard checklist applied to every release candidate before verification. Covers testing, documentation, security, deployment, compliance, and AI infrastructure. All mandatory items must pass or be formally deferred with evidence.',
  'release_readiness',
  1,
  'active',
  'Engineering Team'
)
ON CONFLICT (template_number) DO NOTHING;

-- ─── Seed checklist items ─────────────────────────────────────────────────────

DO $$
DECLARE
  tmpl_id uuid;
BEGIN
  SELECT id INTO tmpl_id FROM ecc_checklist_templates WHERE template_number = 'CHK-001';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM ecc_checklist_template_items WHERE template_id = tmpl_id) THEN RETURN; END IF;

  INSERT INTO ecc_checklist_template_items
    (template_id, sort_order, category, title, description, acceptance_criteria, item_type, allows_defer, allows_exception)
  VALUES
    (tmpl_id, 10,  'Testing',          'Formal test plan executed',                       'At least one test plan executed for this release with all suites run.',                                      'Test plan status = Completed.',                                                                            'mandatory',  false, false),
    (tmpl_id, 20,  'Testing',          'Test coverage ≥ 80%',                             'At least 80% of in-scope features have associated test cases that have been run.',                           'Coverage percentage in Testing Framework ≥ 80%.',                                                          'mandatory',  true,  true),
    (tmpl_id, 30,  'Testing',          'No critical defects open',                        'Zero open defects with severity = critical.',                                                                 'ecc_defects: open critical count = 0.',                                                                    'mandatory',  false, false),
    (tmpl_id, 40,  'Testing',          'No high defects open (or deferred with evidence)','All high-severity defects resolved or formally deferred with documented justification.',                      'All open high defects have deferred status with evidence recorded.',                                        'mandatory',  true,  true),
    (tmpl_id, 50,  'Testing',          'Regression suite passed',                         'Core regression test suite executed and passed for this release.',                                            'No failed regression test cases in latest test run.',                                                      'mandatory',  true,  true),
    (tmpl_id, 60,  'Documentation',    'All in-scope features documented',                'Every feature in this release has documentation status = documented or partial.',                             'No features with doc_status = undocumented for included features.',                                        'mandatory',  true,  true),
    (tmpl_id, 70,  'Documentation',    'Release notes written',                           'Release notes covering changes, known issues, and upgrade instructions written.',                             'RC record has non-empty release_notes field.',                                                             'mandatory',  false, false),
    (tmpl_id, 80,  'Documentation',    'Known issues documented',                         'Any known issues or deferred defects are documented in the release notes.',                                   'Deferred defects referenced in known_issues.',                                                             'mandatory',  false, false),
    (tmpl_id, 90,  'Security',         'No critical security findings open',              'Zero open audit findings with severity = critical in any approved audit.',                                    'ecc_audit_findings: open critical count = 0.',                                                             'mandatory',  false, false),
    (tmpl_id, 100, 'Security',         'RLS policies verified on new tables',             'All new tables have RLS enabled with appropriate policies.',                                                   'Every new table has RLS and 4 CRUD policies.',                                                             'mandatory',  false, false),
    (tmpl_id, 110, 'Deployment',       'Rollback plan documented',                        'A rollback procedure exists for this release.',                                                               'RC record has non-empty rollback_point or rollback_plan field.',                                            'mandatory',  true,  true),
    (tmpl_id, 120, 'Deployment',       'Database migrations reviewed',                    'All migrations reviewed for safety and idempotency.',                                                         'Migration SQL reviewed. No destructive operations.',                                                        'mandatory',  false, false),
    (tmpl_id, 130, 'Deployment',       'Build passes',                                    'npm run build completes with zero errors.',                                                                    'Build output shows 0 errors.',                                                                             'mandatory',  false, false),
    (tmpl_id, 140, 'Compliance',       'Engineering decision documented',                 'Audit engineering decision recorded covering development status, risk, and confidence.',                       'Latest approved audit has engineering_decision populated.',                                                 'mandatory',  false, false),
    (tmpl_id, 150, 'Compliance',       'All recommendations triaged',                     'Every audit recommendation has been assigned a status.',                                                      'All REC-nnn items have status != open or have owner + due_date.',                                          'mandatory',  false, false),
    (tmpl_id, 160, 'Compliance',       'Risk register reviewed',                          'All active engineering risks reviewed and current.',                                                          'No risk with updated_at > 30 days old without review note.',                                               'optional',   true,  true),
    (tmpl_id, 170, 'AI Infrastructure','AI provider configured and tested',               'At least one AI provider has a valid API key and passes connection test.',                                    'ai_provider_configs: has_api_key=true AND health_status=healthy.',                                          'conditional', true, true),
    (tmpl_id, 180, 'AI Infrastructure','AI cost within budget',                           'AI usage costs within projected budget range.',                                                               'Review AI usage dashboard — no unexpected cost spikes.',                                                    'optional',   true,  true),
    (tmpl_id, 190, 'Monitoring',       'Error tracking confirmed operational',            'Application error tracking confirmed active for production.',                                                  'Error monitoring tool shows recent activity.',                                                             'optional',   true,  true),
    (tmpl_id, 200, 'Monitoring',       'Edge functions health checked',                   'All deployed edge functions tested and returning expected responses.',                                         'Each edge function invoked with test payload and returned HTTP 200.',                                       'optional',   true,  true);

  UPDATE ecc_checklist_templates
  SET
    total_items     = (SELECT count(*) FROM ecc_checklist_template_items WHERE template_id = tmpl_id),
    mandatory_items = (SELECT count(*) FROM ecc_checklist_template_items WHERE template_id = tmpl_id AND item_type = 'mandatory')
  WHERE id = tmpl_id;
END $$;

-- ─── Register RC-003 in engineering register ──────────────────────────────────

INSERT INTO ecc_engineering_register
  (register_number, register_type, entity_id, entity_table, title, status)
VALUES
  ('RC-003', 'rel', gen_random_uuid(), 'ecc_release_candidates', 'Engineering Excellence — Stage 1 Engineering Foundations', 'active')
ON CONFLICT (register_number) DO NOTHING;
