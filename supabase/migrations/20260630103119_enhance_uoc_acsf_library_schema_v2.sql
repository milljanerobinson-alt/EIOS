
-- Step 1: Rename source → source_type
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='uoc_acsf_library' AND column_name='source') THEN
    ALTER TABLE uoc_acsf_library DROP CONSTRAINT IF EXISTS uoc_acsf_library_source_check;
    ALTER TABLE uoc_acsf_library RENAME COLUMN source TO source_type;
  END IF;
END $$;

ALTER TABLE uoc_acsf_library DROP CONSTRAINT IF EXISTS uoc_source_type_check;
ALTER TABLE uoc_acsf_library ADD CONSTRAINT uoc_source_type_check
  CHECK (source_type IN ('official', 'validated', 'inferred'));

-- Step 2: Add metadata columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='uoc_acsf_library' AND column_name='industry_tag') THEN
    ALTER TABLE uoc_acsf_library ADD COLUMN industry_tag text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='uoc_acsf_library' AND column_name='task_tags') THEN
    ALTER TABLE uoc_acsf_library ADD COLUMN task_tags text[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='uoc_acsf_library' AND column_name='complexity_indicators') THEN
    ALTER TABLE uoc_acsf_library ADD COLUMN complexity_indicators text[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='uoc_acsf_library' AND column_name='evidence_basis') THEN
    ALTER TABLE uoc_acsf_library ADD COLUMN evidence_basis text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='uoc_acsf_library' AND column_name='confidence') THEN
    ALTER TABLE uoc_acsf_library ADD COLUMN confidence text DEFAULT 'medium';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='uoc_acsf_library' AND column_name='last_updated') THEN
    ALTER TABLE uoc_acsf_library ADD COLUMN last_updated timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='uoc_acsf_library' AND column_name='acsf_mapping') THEN
    ALTER TABLE uoc_acsf_library ADD COLUMN acsf_mapping jsonb;
  END IF;
END $$;

ALTER TABLE uoc_acsf_library DROP CONSTRAINT IF EXISTS uoc_confidence_check;
ALTER TABLE uoc_acsf_library ADD CONSTRAINT uoc_confidence_check
  CHECK (confidence IN ('high', 'medium', 'low'));

-- Step 3: Populate acsf_mapping for existing rows
UPDATE uoc_acsf_library SET acsf_mapping = jsonb_build_object(
  'learning',  COALESCE(learning_level,  0),
  'reading',   COALESCE(reading_level,   0),
  'writing',   COALESCE(writing_level,   0),
  'oral',      COALESCE(oral_comm_level, 0),
  'numeracy',  COALESCE(numeracy_level,  0),
  'digital',   COALESCE(digital_level,   0)
) WHERE acsf_mapping IS NULL;

-- Step 4: Trigger to keep acsf_mapping in sync
CREATE OR REPLACE FUNCTION uoc_acsf_library_sync_mapping()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.acsf_mapping := jsonb_build_object(
    'learning',  COALESCE(NEW.learning_level,  0),
    'reading',   COALESCE(NEW.reading_level,   0),
    'writing',   COALESCE(NEW.writing_level,   0),
    'oral',      COALESCE(NEW.oral_comm_level, 0),
    'numeracy',  COALESCE(NEW.numeracy_level,  0),
    'digital',   COALESCE(NEW.digital_level,   0)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uoc_acsf_mapping ON uoc_acsf_library;
CREATE TRIGGER trg_uoc_acsf_mapping
  BEFORE INSERT OR UPDATE ON uoc_acsf_library
  FOR EACH ROW EXECUTE FUNCTION uoc_acsf_library_sync_mapping();

-- Step 5: Indexes
CREATE INDEX IF NOT EXISTS idx_uoc_training_package ON uoc_acsf_library (training_package);
CREATE INDEX IF NOT EXISTS idx_uoc_confidence ON uoc_acsf_library (confidence);
CREATE INDEX IF NOT EXISTS idx_uoc_source_type ON uoc_acsf_library (source_type);
CREATE INDEX IF NOT EXISTS idx_uoc_task_tags ON uoc_acsf_library USING GIN (task_tags);
CREATE INDEX IF NOT EXISTS idx_uoc_acsf_mapping ON uoc_acsf_library USING GIN (acsf_mapping);

-- Step 6: Update BSB records metadata
UPDATE uoc_acsf_library SET
  industry_tag = 'Business Services',
  source_type = 'validated',
  confidence = 'high',
  evidence_basis = 'BSB Training Package performance evidence and knowledge requirements',
  last_updated = now()
WHERE training_package = 'BSB';

UPDATE uoc_acsf_library SET task_tags = ARRAY['document management','record keeping','file organisation'],
  complexity_indicators = ARRAY['procedural documentation','administrative systems']
WHERE uoc_code = 'BSBADT401';
UPDATE uoc_acsf_library SET task_tags = ARRAY['procurement','purchasing','supply chain analysis'],
  complexity_indicators = ARRAY['quantitative analysis','supplier evaluation','contract interpretation']
WHERE uoc_code = 'BSBOPS402';
UPDATE uoc_acsf_library SET task_tags = ARRAY['risk identification','risk register','mitigation planning'],
  complexity_indicators = ARRAY['complex risk frameworks','analytical reporting','compliance documentation']
WHERE uoc_code = 'BSBOPS504';
UPDATE uoc_acsf_library SET task_tags = ARRAY['policy development','compliance','procedure writing'],
  complexity_indicators = ARRAY['legislative interpretation','technical writing','stakeholder consultation']
WHERE uoc_code = 'BSBOPS505';
UPDATE uoc_acsf_library SET task_tags = ARRAY['customer service','complaint handling','service standards'],
  complexity_indicators = ARRAY['interpersonal communication','conflict resolution']
WHERE uoc_code = 'BSBOPS306';
UPDATE uoc_acsf_library SET task_tags = ARRAY['project planning','WBS','scheduling'],
  complexity_indicators = ARRAY['project documentation','timeline management','resource estimation']
WHERE uoc_code = 'BSBPMG430';
UPDATE uoc_acsf_library SET task_tags = ARRAY['project scope','stakeholder management','project documentation'],
  complexity_indicators = ARRAY['strategic planning','complex stakeholder reporting','scope management']
WHERE uoc_code = 'BSBPMG530';
UPDATE uoc_acsf_library SET task_tags = ARRAY['HR planning','workforce planning','resource allocation'],
  complexity_indicators = ARRAY['workforce analysis','legislative compliance','HR reporting']
WHERE uoc_code = 'BSBHRM413';
UPDATE uoc_acsf_library SET task_tags = ARRAY['recruitment','selection','onboarding'],
  complexity_indicators = ARRAY['selection documentation','assessment instruments','employment law']
WHERE uoc_code = 'BSBHRM415';
UPDATE uoc_acsf_library SET task_tags = ARRAY['performance management','appraisal','coaching'],
  complexity_indicators = ARRAY['performance frameworks','development planning','feedback documentation']
WHERE uoc_code = 'BSBHRM512';
UPDATE uoc_acsf_library SET task_tags = ARRAY['WHS legislation','hazard identification','incident reporting'],
  complexity_indicators = ARRAY['regulatory compliance','risk documentation','incident investigation']
WHERE uoc_code = 'BSBWHS411';
UPDATE uoc_acsf_library SET task_tags = ARRAY['WHS systems','safety management','compliance auditing'],
  complexity_indicators = ARRAY['systems thinking','audit reporting','legislative frameworks']
WHERE uoc_code = 'BSBWHS521';
UPDATE uoc_acsf_library SET task_tags = ARRAY['financial records','bookkeeping','accounts payable'],
  complexity_indicators = ARRAY['numerical accuracy','accounting software','ledger management']
WHERE uoc_code = 'BSBFIN301';
UPDATE uoc_acsf_library SET task_tags = ARRAY['budget preparation','variance analysis','financial reporting'],
  complexity_indicators = ARRAY['financial analysis','spreadsheet modelling','reporting standards']
WHERE uoc_code = 'BSBFIN401';
UPDATE uoc_acsf_library SET task_tags = ARRAY['team leadership','delegation','feedback'],
  complexity_indicators = ARRAY['leadership communication','team dynamics','performance coaching']
WHERE uoc_code = 'BSBLDR411';
UPDATE uoc_acsf_library SET task_tags = ARRAY['strategic leadership','change management','organisational culture'],
  complexity_indicators = ARRAY['strategic analysis','complex stakeholder engagement','organisational development']
WHERE uoc_code = 'BSBLDR601';

-- Step 7: Update CHC records metadata
UPDATE uoc_acsf_library SET
  industry_tag = 'Community Services',
  source_type = 'validated',
  confidence = 'high',
  evidence_basis = 'CHC Training Package unit descriptor and performance evidence requirements',
  last_updated = now()
WHERE training_package = 'CHC';

UPDATE uoc_acsf_library SET task_tags = ARRAY['person-centred care','individual support','dignity of risk'],
  complexity_indicators = ARRAY['care documentation','person-centred communication','support planning']
WHERE uoc_code = 'CHCAGE001';
UPDATE uoc_acsf_library SET task_tags = ARRAY['dementia care','behaviour support','cognitive assessment'],
  complexity_indicators = ARRAY['clinical documentation','specialist communication','behaviour analysis']
WHERE uoc_code = 'CHCAGE011';
UPDATE uoc_acsf_library SET task_tags = ARRAY['disability support','NDIS','individual planning'],
  complexity_indicators = ARRAY['NDIS documentation','support planning','rights-based practice']
WHERE uoc_code = 'CHCDIS001';
UPDATE uoc_acsf_library SET task_tags = ARRAY['supported decision making','advocacy','legal frameworks'],
  complexity_indicators = ARRAY['legislative interpretation','advocacy documentation','ethical practice']
WHERE uoc_code = 'CHCDIS002';
UPDATE uoc_acsf_library SET task_tags = ARRAY['community development','asset mapping','program facilitation'],
  complexity_indicators = ARRAY['community needs analysis','program reporting','stakeholder engagement']
WHERE uoc_code = 'CHCCOM003';
UPDATE uoc_acsf_library SET task_tags = ARRAY['case management','referral pathways','service coordination'],
  complexity_indicators = ARRAY['case notes','service system navigation','multi-agency coordination']
WHERE uoc_code = 'CHCCSM005';
UPDATE uoc_acsf_library SET task_tags = ARRAY['child development','play-based learning','observation'],
  complexity_indicators = ARRAY['developmental observation','learning documentation','family communication']
WHERE uoc_code = 'CHCECE001';
UPDATE uoc_acsf_library SET task_tags = ARRAY['early childhood curriculum','learning environments','documentation'],
  complexity_indicators = ARRAY['curriculum frameworks','documentation practices','reflective practice']
WHERE uoc_code = 'CHCECE017';
UPDATE uoc_acsf_library SET task_tags = ARRAY['safeguarding','mandatory reporting','risk assessment'],
  complexity_indicators = ARRAY['legislative obligations','risk documentation','inter-agency reporting']
WHERE uoc_code = 'CHCPRT001';
UPDATE uoc_acsf_library SET task_tags = ARRAY['trauma-informed practice','family support','cultural safety'],
  complexity_indicators = ARRAY['trauma frameworks','family assessment','culturally responsive documentation']
WHERE uoc_code = 'CHCFCS015';

-- Step 8: Update CPC records metadata
UPDATE uoc_acsf_library SET
  industry_tag = 'Construction',
  source_type = 'validated',
  confidence = 'high',
  evidence_basis = 'CPC Training Package performance evidence and technical knowledge requirements',
  last_updated = now()
WHERE training_package = 'CPC';

UPDATE uoc_acsf_library SET task_tags = ARRAY['site safety','PPE','induction'],
  complexity_indicators = ARRAY['safety signage','hazard communication','incident forms']
WHERE uoc_code = 'CPCCWHS1001';
UPDATE uoc_acsf_library SET task_tags = ARRAY['scaffolding','working at heights','load calculations'],
  complexity_indicators = ARRAY['technical drawings','load calculations','safety compliance']
WHERE uoc_code = 'CPCCLSF3001';
UPDATE uoc_acsf_library SET task_tags = ARRAY['carpentry','framing','structural timber'],
  complexity_indicators = ARRAY['plan reading','measurement','material specifications']
WHERE uoc_code = 'CPCCCA3003';
UPDATE uoc_acsf_library SET task_tags = ARRAY['bricklaying','mortar','wall construction'],
  complexity_indicators = ARRAY['technical drawings','measurement','material estimation']
WHERE uoc_code = 'CPCCBR3001';
UPDATE uoc_acsf_library SET task_tags = ARRAY['construction planning','scheduling','site management'],
  complexity_indicators = ARRAY['project documentation','cost estimation','regulatory compliance']
WHERE uoc_code = 'CPCCBC4001';

-- Step 9: Update SIT records metadata
UPDATE uoc_acsf_library SET
  industry_tag = 'Hospitality & Tourism',
  source_type = 'validated',
  confidence = 'high',
  evidence_basis = 'SIT Training Package unit descriptor and performance requirements',
  last_updated = now()
WHERE training_package = 'SIT';

UPDATE uoc_acsf_library SET task_tags = ARRAY['food hygiene','HACCP','food safety program'],
  complexity_indicators = ARRAY['food safety documentation','temperature records','regulatory compliance']
WHERE uoc_code = 'SITXFSA005';
UPDATE uoc_acsf_library SET task_tags = ARRAY['customer service','hospitality standards','complaint resolution'],
  complexity_indicators = ARRAY['service communication','complaint documentation','guest interaction']
WHERE uoc_code = 'SITXCCS007';
UPDATE uoc_acsf_library SET task_tags = ARRAY['RSA','alcohol service','harm minimisation'],
  complexity_indicators = ARRAY['legislative compliance','patron communication','refusal documentation']
WHERE uoc_code = 'SITHFAB002';
UPDATE uoc_acsf_library SET task_tags = ARRAY['front office','reservations','property management system'],
  complexity_indicators = ARRAY['booking systems','guest communication','financial transactions']
WHERE uoc_code = 'SITHFOF001';
UPDATE uoc_acsf_library SET task_tags = ARRAY['menu planning','kitchen operations','food costing'],
  complexity_indicators = ARRAY['cost calculations','menu documentation','supplier ordering']
WHERE uoc_code = 'SITHKOP009';

-- Step 10: Update ICT records metadata
UPDATE uoc_acsf_library SET
  industry_tag = 'Information Technology',
  source_type = 'validated',
  confidence = 'high',
  evidence_basis = 'ICT Training Package unit descriptor and technical performance requirements',
  last_updated = now()
WHERE training_package = 'ICT';

UPDATE uoc_acsf_library SET task_tags = ARRAY['PC support','hardware troubleshooting','helpdesk'],
  complexity_indicators = ARRAY['technical documentation','fault diagnosis','system specifications']
WHERE uoc_code = 'ICTICT213';
UPDATE uoc_acsf_library SET task_tags = ARRAY['network infrastructure','TCP/IP','LAN configuration'],
  complexity_indicators = ARRAY['network diagrams','technical specifications','configuration documentation']
WHERE uoc_code = 'ICTNWK529';
UPDATE uoc_acsf_library SET task_tags = ARRAY['cybersecurity','threat assessment','security controls'],
  complexity_indicators = ARRAY['risk frameworks','security documentation','technical analysis']
WHERE uoc_code = 'ICTCYS407';
UPDATE uoc_acsf_library SET task_tags = ARRAY['software testing','test plans','defect tracking'],
  complexity_indicators = ARRAY['test documentation','defect reporting','quality standards']
WHERE uoc_code = 'ICTSAS526';
UPDATE uoc_acsf_library SET task_tags = ARRAY['database design','SQL','data modelling'],
  complexity_indicators = ARRAY['entity relationship diagrams','SQL queries','data integrity constraints']
WHERE uoc_code = 'ICTDBS501';

-- Fallback: set complexity_indicators for any remaining records
UPDATE uoc_acsf_library SET
  complexity_indicators = CASE
    WHEN GREATEST(COALESCE(learning_level,0), COALESCE(reading_level,0), COALESCE(writing_level,0), COALESCE(numeracy_level,0)) >= 4
      THEN ARRAY['advanced technical language','complex document interpretation','multi-step analysis']
    WHEN GREATEST(COALESCE(learning_level,0), COALESCE(reading_level,0), COALESCE(writing_level,0)) >= 3
      THEN ARRAY['specialised terminology','report writing','procedural compliance']
    ELSE ARRAY['basic workplace communication','simple documentation','following instructions']
  END
WHERE complexity_indicators = '{}';
