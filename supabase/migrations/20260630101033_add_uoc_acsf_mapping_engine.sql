/*
# ACSF Auto-Mapping Engine — Schema

## Summary
Adds the Unit of Competency (UoC) level ACSF mapping infrastructure. This is the
"brain" of the auto-mapping engine: rather than mapping at the qualification level,
the system maps each individual unit and rolls the results up to form the
qualification-level ACSF profile.

## Changes

### qualifications table — New Columns
- confidence_score: 'high' | 'medium' | 'low' — reliability of the auto-mapping
- mapping_method: how the current mapping was produced
    qualification_library = matched directly to the qual-level library (existing)
    uoc_direct = all UoCs found in the UoC library
    uoc_hybrid = mix of direct UoC matches and inference
    uoc_inferred = all UoCs inferred (no direct matches)
    manual = human set directly
- needs_review: boolean flag; auto-set when confidence is low or ACSF demands are high
- review_reason: human-readable explanation of why review is needed
- uoc_count: total UoC codes processed in the last mapping run
- uoc_matched: UoC codes that had a direct library match

### uoc_acsf_library — New Table
Unit-of-Competency level ACSF mapping library. Each row maps a single Australian
UoC code to recommended minimum ACSF/DLSF levels for all 6 skills.
This is the primary source of truth for the inference engine.
Sourced from industry experience, validation practice, and ACSF best practice.

Columns: uoc_code (unique), uoc_title, training_package,
         learning_level, reading_level, writing_level, oral_comm_level,
         numeracy_level, digital_level, source, created_at

### qualification_mapping_logs — New Table
Full audit trail of every ACSF mapping computation. Stores what UoCs were used,
how each was resolved (direct/inferred), the result, confidence, method, and
any review flags. Essential for compliance evidence.

### Security
All new tables have RLS enabled. Staff read the libraries; only the service role
(edge function) can write mapping logs.
*/

-- ── Extend qualifications ────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='qualifications' AND column_name='confidence_score') THEN
    ALTER TABLE qualifications ADD COLUMN confidence_score text CHECK (confidence_score IN ('high','medium','low'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='qualifications' AND column_name='mapping_method') THEN
    ALTER TABLE qualifications ADD COLUMN mapping_method text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='qualifications' AND column_name='needs_review') THEN
    ALTER TABLE qualifications ADD COLUMN needs_review boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='qualifications' AND column_name='review_reason') THEN
    ALTER TABLE qualifications ADD COLUMN review_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='qualifications' AND column_name='uoc_count') THEN
    ALTER TABLE qualifications ADD COLUMN uoc_count integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='qualifications' AND column_name='uoc_matched') THEN
    ALTER TABLE qualifications ADD COLUMN uoc_matched integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ── UoC ACSF Library ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uoc_acsf_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uoc_code text UNIQUE NOT NULL,
  uoc_title text NOT NULL,
  training_package text NOT NULL,
  learning_level integer CHECK (learning_level BETWEEN 1 AND 5),
  reading_level integer CHECK (reading_level BETWEEN 1 AND 5),
  writing_level integer CHECK (writing_level BETWEEN 1 AND 5),
  oral_comm_level integer CHECK (oral_comm_level BETWEEN 1 AND 5),
  numeracy_level integer CHECK (numeracy_level BETWEEN 1 AND 5),
  digital_level integer CHECK (digital_level BETWEEN 1 AND 5),
  source text NOT NULL DEFAULT 'inferred' CHECK (source IN ('inferred','validated')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE uoc_acsf_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uoc_library_select_staff" ON uoc_acsf_library;
CREATE POLICY "uoc_library_select_staff" ON uoc_acsf_library FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer'))
  );

-- ── Qualification Mapping Logs ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qualification_mapping_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qualification_id uuid REFERENCES qualifications(id) ON DELETE CASCADE,
  triggered_by text NOT NULL DEFAULT 'system',
  uoc_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  uoc_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_levels jsonb,
  confidence_score text,
  method text,
  uoc_count integer DEFAULT 0,
  uoc_matched integer DEFAULT 0,
  needs_review boolean DEFAULT false,
  review_reason text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE qualification_mapping_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mapping_logs_select_staff" ON qualification_mapping_logs;
CREATE POLICY "mapping_logs_select_staff" ON qualification_mapping_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer'))
  );

-- ── Seed the UoC ACSF Library ─────────────────────────────────────────────────
-- Columns: uoc_code, uoc_title, training_package,
--          learning, reading, writing, oral_comm, numeracy, digital, source

INSERT INTO uoc_acsf_library
  (uoc_code, uoc_title, training_package, learning_level, reading_level, writing_level, oral_comm_level, numeracy_level, digital_level, source)
VALUES
  -- ── BSB — Business Services ──────────────────────────────────────────────
  ('BSBWRT311', 'Write simple documents', 'BSB', 3, 3, 3, 2, 2, 2, 'validated'),
  ('BSBWRT411', 'Write complex documents', 'BSB', 4, 4, 4, 3, 2, 3, 'validated'),
  ('BSBCMM211', 'Apply communication skills', 'BSB', 2, 2, 2, 3, 1, 2, 'inferred'),
  ('BSBCMM311', 'Communicate in the workplace', 'BSB', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('BSBCMM412', 'Lead difficult conversations', 'BSB', 3, 3, 3, 4, 2, 2, 'inferred'),
  ('BSBTEC201', 'Use business software applications', 'BSB', 2, 2, 2, 2, 2, 3, 'validated'),
  ('BSBTEC301', 'Design and produce business documents', 'BSB', 3, 3, 3, 2, 2, 3, 'validated'),
  ('BSBTEC401', 'Design and produce complex text documents', 'BSB', 4, 4, 4, 3, 2, 4, 'validated'),
  ('BSBOPS201', 'Work effectively in business environments', 'BSB', 2, 2, 2, 2, 2, 2, 'inferred'),
  ('BSBOPS304', 'Deliver and monitor service to customers', 'BSB', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('BSBOPS305', 'Process customer complaints', 'BSB', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('BSBOPS401', 'Coordinate business operational plans', 'BSB', 3, 3, 3, 3, 3, 3, 'inferred'),
  ('BSBOPS502', 'Manage business operational plans', 'BSB', 4, 4, 4, 4, 3, 3, 'inferred'),
  ('BSBFIN201', 'Process financial documents', 'BSB', 2, 2, 2, 2, 3, 2, 'validated'),
  ('BSBFIN301', 'Process financial transactions and extract interim reports', 'BSB', 3, 3, 3, 2, 3, 3, 'validated'),
  ('BSBFIN401', 'Report on financial activity', 'BSB', 3, 3, 3, 3, 4, 3, 'validated'),
  ('BSBFIN501', 'Manage budgets and financial plans', 'BSB', 4, 4, 4, 3, 4, 4, 'inferred'),
  ('BSBPMG430', 'Undertake project work', 'BSB', 3, 3, 3, 3, 3, 3, 'inferred'),
  ('BSBLDR301', 'Communicate with influence', 'BSB', 3, 3, 3, 4, 2, 2, 'inferred'),
  ('BSBLDR411', 'Demonstrate leadership in the workplace', 'BSB', 3, 3, 3, 4, 3, 3, 'inferred'),
  ('BSBLDR511', 'Develop and use emotional intelligence', 'BSB', 4, 4, 4, 4, 2, 3, 'inferred'),
  ('BSBHRM412', 'Support employee and industrial relations', 'BSB', 3, 3, 3, 3, 2, 3, 'inferred'),
  ('BSBHRM525', 'Manage recruitment and onboarding', 'BSB', 4, 4, 4, 4, 3, 3, 'inferred'),
  ('BSBPEF301', 'Organise personal work priorities', 'BSB', 3, 3, 3, 2, 2, 2, 'inferred'),
  ('BSBPEF401', 'Manage personal health and wellbeing', 'BSB', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('BSBWHS211', 'Contribute to the health and safety of self and others', 'BSB', 2, 2, 2, 2, 2, 2, 'inferred'),
  ('BSBWHS311', 'Assist with maintaining workplace safety', 'BSB', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('BSBWHS411', 'Implement and monitor WHS policies, procedures and programs', 'BSB', 3, 3, 3, 3, 3, 3, 'inferred'),
  ('BSBSUS211', 'Participate in sustainable work practices', 'BSB', 2, 2, 2, 2, 2, 2, 'inferred'),
  ('BSBSUS411', 'Implement and monitor environmentally sustainable work practices', 'BSB', 3, 3, 3, 3, 3, 3, 'inferred'),
  ('BSBXCM301', 'Engage in workplace communication', 'BSB', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('BSBINS301', 'Research information', 'BSB', 3, 3, 3, 2, 2, 3, 'inferred'),
  ('BSBINS401', 'Analyse and present research information', 'BSB', 4, 4, 4, 3, 3, 3, 'inferred'),
  ('BSBMKG435', 'Analyse consumer behaviour', 'BSB', 3, 3, 3, 3, 3, 3, 'inferred'),

  -- ── CHC — Community Services ─────────────────────────────────────────────
  ('CHCCOM005', 'Communicate and work in health or community services', 'CHC', 3, 3, 3, 3, 2, 2, 'validated'),
  ('CHCADV001', 'Facilitate the interests and rights of clients', 'CHC', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('CHCLEG001', 'Work legally and ethically', 'CHC', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('CHCDIV001', 'Work with diverse people', 'CHC', 3, 3, 3, 3, 2, 2, 'validated'),
  ('CHCAGE001', 'Facilitate the empowerment of older people', 'CHC', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('CHCAGE011', 'Provide support to people living with dementia', 'CHC', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('CHCCCS011', 'Meet personal support needs', 'CHC', 2, 2, 2, 2, 1, 1, 'inferred'),
  ('CHCCCS031', 'Provide individualised support', 'CHC', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('CHCECE030', 'Support healthy safety and wellbeing of children', 'CHC', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('CHCECE054', 'Encourage understanding of childrens agency', 'CHC', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('CHCECE024', 'Design and implement the curriculum to foster childrens learning', 'CHC', 4, 4, 4, 4, 3, 3, 'inferred'),
  ('CHCDIS002', 'Follow established person-centred behaviour supports', 'CHC', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('CHCDIS010', 'Provide specialist support to people with disability', 'CHC', 3, 3, 3, 3, 2, 2, 'inferred'),
  ('CHCPRT001', 'Identify and respond to children at risk', 'CHC', 3, 3, 3, 3, 2, 3, 'inferred'),
  ('CHCCSM005', 'Develop, facilitate and review case management plans', 'CHC', 4, 4, 4, 4, 3, 3, 'inferred'),
  ('HLTWHS002', 'Follow safe work practices for direct client care', 'HLT', 2, 2, 2, 2, 2, 2, 'inferred'),
  ('HLTINF006', 'Apply basic principles and practices of infection prevention and control', 'HLT', 2, 2, 2, 2, 1, 2, 'inferred'),
  ('HLTAID009', 'Provide cardiopulmonary resuscitation', 'HLT', 2, 2, 2, 2, 1, 1, 'inferred'),
  ('HLTAAP001', 'Confirm physical health status', 'HLT', 3, 3, 3, 3, 3, 2, 'inferred'),

  -- ── CPC — Construction ───────────────────────────────────────────────────
  ('CPCCWHS1001', 'Prepare to work safely in the construction industry', 'CPC', 2, 2, 1, 2, 2, 1, 'validated'),
  ('CPCCCM2001', 'Read and interpret plans and specifications', 'CPC', 3, 3, 2, 2, 3, 2, 'validated'),
  ('CPCCCM2006', 'Apply basic levelling procedures', 'CPC', 2, 2, 2, 2, 3, 1, 'inferred'),
  ('CPCCCM3001', 'Carry out concreting to simple forms', 'CPC', 3, 3, 2, 2, 3, 2, 'inferred'),
  ('CPCCBC4001', 'Apply building codes and standards to the construction process', 'CPC', 4, 4, 3, 3, 3, 3, 'validated'),
  ('CPCCBC4002', 'Manage subcontractors and employees in building and construction', 'CPC', 3, 3, 3, 3, 3, 3, 'inferred'),
  ('CPCCBC4003', 'Select and prepare a construction contract', 'CPC', 4, 4, 4, 3, 3, 3, 'inferred'),
  ('CPCCBC4010', 'Apply structural principles to residential constructions', 'CPC', 4, 4, 3, 3, 4, 3, 'inferred'),
  ('CPCCCA3001', 'Carry out general carpentry work', 'CPC', 3, 3, 2, 2, 3, 2, 'inferred'),
  ('CPCCCA3005', 'Install windows and doors', 'CPC', 3, 3, 2, 2, 3, 2, 'inferred'),
  ('CPCPWT3011', 'Carry out wet area waterproofing', 'CPC', 3, 3, 2, 2, 3, 2, 'inferred'),

  -- ── SIT — Hospitality & Tourism ──────────────────────────────────────────
  ('SITHCCC023', 'Use food preparation equipment', 'SIT', 2, 2, 2, 2, 2, 2, 'inferred'),
  ('SITHCCC027', 'Prepare dishes using basic methods of cookery', 'SIT', 2, 2, 2, 2, 2, 2, 'validated'),
  ('SITHCCC041', 'Produce cakes, pastries and breads', 'SIT', 2, 2, 2, 2, 2, 2, 'inferred'),
  ('SITHKOP009', 'Clean kitchen premises and equipment', 'SIT', 2, 2, 1, 2, 1, 1, 'inferred'),
  ('SITXCOM010', 'Manage conflict', 'SIT', 3, 3, 3, 4, 2, 2, 'validated'),
  ('SITXFIN009', 'Manage finances within a budget', 'SIT', 3, 3, 3, 3, 4, 3, 'validated'),
  ('SITXFIN011', 'Manage physical assets', 'SIT', 3, 3, 3, 3, 3, 3, 'inferred'),
  ('SITXHRM009', 'Lead and manage people', 'SIT', 3, 3, 3, 4, 3, 3, 'inferred'),
  ('SITXMGT004', 'Monitor work operations', 'SIT', 3, 3, 3, 3, 3, 3, 'inferred'),
  ('SITHFAB025', 'Prepare and serve non-alcoholic beverages', 'SIT', 2, 2, 2, 2, 2, 2, 'inferred'),
  ('SITHFAB021', 'Provide responsible service of alcohol', 'SIT', 2, 2, 2, 3, 1, 2, 'inferred'),
  ('SITHIND004', 'Work effectively in hospitality service', 'SIT', 2, 2, 2, 3, 1, 2, 'inferred'),
  ('SITXWHS004', 'Establish and maintain a safe and secure workplace', 'SIT', 3, 3, 3, 3, 2, 2, 'inferred'),

  -- ── TAE — Training & Education ───────────────────────────────────────────
  ('TAEDES401', 'Design and develop learning programs', 'TAE', 4, 4, 4, 4, 3, 3, 'validated'),
  ('TAEDES402', 'Design and develop assessment tools', 'TAE', 4, 4, 4, 4, 3, 4, 'validated'),
  ('TAEDEL401', 'Plan, organise and deliver group-based learning', 'TAE', 4, 4, 4, 4, 3, 3, 'validated'),
  ('TAEDEL301', 'Provide work skill instruction', 'TAE', 3, 3, 3, 4, 3, 3, 'validated'),
  ('TAEASS401', 'Plan assessment activities and processes', 'TAE', 4, 4, 4, 4, 3, 3, 'validated'),
  ('TAEASS402', 'Assess competence', 'TAE', 4, 4, 4, 4, 3, 3, 'validated'),
  ('TAEASS403', 'Participate in assessment validation', 'TAE', 4, 4, 4, 4, 3, 4, 'validated'),
  ('TAEASS502', 'Design and develop assessment tools', 'TAE', 4, 4, 4, 4, 3, 4, 'validated'),

  -- ── FNS — Financial Services ─────────────────────────────────────────────
  ('FNSACC321', 'Process financial transactions and extract interim reports', 'FNS', 3, 3, 3, 2, 4, 3, 'validated'),
  ('FNSACC322', 'Administer subsidiary accounts and ledgers', 'FNS', 3, 3, 3, 2, 4, 3, 'inferred'),
  ('FNSACC411', 'Prepare financial reports', 'FNS', 3, 3, 3, 3, 4, 4, 'validated'),
  ('FNSACC413', 'Make decisions in a legal context', 'FNS', 4, 4, 4, 3, 3, 3, 'inferred'),
  ('FNSPAY501', 'Process payroll', 'FNS', 3, 3, 3, 2, 4, 4, 'validated'),
  ('FNSTPB401', 'Complete business activity and instalment activity statements', 'FNS', 3, 3, 3, 2, 4, 4, 'validated'),
  ('FNSTPB402', 'Establish and maintain payroll systems', 'FNS', 3, 3, 3, 2, 4, 4, 'inferred'),

  -- ── ICT — Information & Communications Technology ───────────────────────
  ('ICTICT302', 'Install and optimise operating system software', 'ICT', 3, 3, 3, 2, 3, 4, 'inferred'),
  ('ICTICT305', 'Establish and maintain client user liaison', 'ICT', 3, 3, 3, 3, 3, 4, 'inferred'),
  ('ICTSAS401', 'Provide first level remote help desk support', 'ICT', 3, 3, 3, 3, 3, 4, 'inferred'),
  ('ICTDBS401', 'Maintain database systems', 'ICT', 3, 3, 3, 2, 3, 5, 'inferred'),
  ('ICTNWK529', 'Install and manage complex ICT networks', 'ICT', 4, 4, 4, 3, 4, 5, 'inferred')
ON CONFLICT (uoc_code) DO NOTHING;
