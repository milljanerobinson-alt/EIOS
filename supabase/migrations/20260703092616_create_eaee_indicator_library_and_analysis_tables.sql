-- ── ACSF Indicator Library ────────────────────────────────────────────────────
-- Individual ACSF performance indicators with trigger verbs for rule-based matching

CREATE TABLE IF NOT EXISTS acsf_indicator_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_type text NOT NULL CHECK (skill_type IN ('reading','writing','oral_communication','numeracy','learning')),
  level int NOT NULL CHECK (level BETWEEN 1 AND 5),
  indicator_code text NOT NULL UNIQUE,
  descriptor_text text NOT NULL,
  context_notes text,
  cognitive_demand text CHECK (cognitive_demand IN ('simple','embedded','complex')),
  trigger_verbs text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acsf_indicator_skill_level ON acsf_indicator_library (skill_type, level);
CREATE INDEX IF NOT EXISTS idx_acsf_indicator_trigger_verbs ON acsf_indicator_library USING GIN (trigger_verbs);

ALTER TABLE acsf_indicator_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acsf_indicator_library_select" ON acsf_indicator_library FOR SELECT TO authenticated USING (true);
CREATE POLICY "acsf_indicator_library_insert" ON acsf_indicator_library FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "acsf_indicator_library_update" ON acsf_indicator_library FOR UPDATE TO authenticated USING (true);

-- ── EAEE Analysis Tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eaee_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  qualification_id uuid,
  qualification_code text NOT NULL,
  qualification_name text NOT NULL,
  aqf_level text,
  training_package text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','rejected')),
  version int NOT NULL DEFAULT 1,
  reading_level int CHECK (reading_level BETWEEN 0 AND 5),
  writing_level int CHECK (writing_level BETWEEN 0 AND 5),
  oral_level int CHECK (oral_level BETWEEN 0 AND 5),
  numeracy_level int CHECK (numeracy_level BETWEEN 0 AND 5),
  learning_level int CHECK (learning_level BETWEEN 0 AND 5),
  reading_confidence numeric CHECK (reading_confidence BETWEEN 0 AND 1),
  writing_confidence numeric CHECK (writing_confidence BETWEEN 0 AND 1),
  oral_confidence numeric CHECK (oral_confidence BETWEEN 0 AND 1),
  numeracy_confidence numeric CHECK (numeracy_confidence BETWEEN 0 AND 1),
  learning_confidence numeric CHECK (learning_confidence BETWEEN 0 AND 1),
  analysis_data jsonb NOT NULL DEFAULT '{}',
  units_analysed int DEFAULT 0,
  indicators_matched int DEFAULT 0,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eaee_feature_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES eaee_analyses(id) ON DELETE CASCADE,
  skill_type text NOT NULL,
  supported_level int NOT NULL,
  unit_code text NOT NULL,
  unit_title text,
  section_ref text DEFAULT 'Unit Descriptor',
  excerpt text NOT NULL,
  matched_indicator_code text,
  matched_indicator_descriptor text,
  feature_type text DEFAULT 'task_pattern',
  trigger_word text,
  reasoning_note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eaee_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES eaee_analyses(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_name text,
  action text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE eaee_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE eaee_feature_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE eaee_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eaee_analyses_select" ON eaee_analyses FOR SELECT TO authenticated USING (true);
CREATE POLICY "eaee_analyses_insert" ON eaee_analyses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eaee_analyses_update" ON eaee_analyses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "eaee_analyses_delete" ON eaee_analyses FOR DELETE TO authenticated USING (true);

CREATE POLICY "eaee_feature_evidence_select" ON eaee_feature_evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY "eaee_feature_evidence_insert" ON eaee_feature_evidence FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eaee_feature_evidence_delete" ON eaee_feature_evidence FOR DELETE TO authenticated USING (true);

CREATE POLICY "eaee_audit_log_select" ON eaee_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "eaee_audit_log_insert" ON eaee_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- ── Seed ACSF Indicator Library ────────────────────────────────────────────────
-- 3–4 indicators per level per skill (levels 1–5, 5 skills = ~75 indicators)
-- trigger_verbs are matched against uoc_acsf_library.task_tags and complexity_indicators

INSERT INTO acsf_indicator_library (skill_type,level,indicator_code,descriptor_text,context_notes,cognitive_demand,trigger_verbs) VALUES

-- ── Reading ──
('reading',1,'R1.01','Locates a single item of clearly stated information in a very short familiar text','Simple, direct texts only','simple',ARRAY['label','sign','notice','basic','simple']),
('reading',1,'R1.02','Recognises familiar words and symbols in everyday and workplace contexts','Symbols, logos, common signs','simple',ARRAY['identify','recognise','symbol','form','sign']),
('reading',1,'R1.03','Follows a short, familiar sequence of written instructions','Step-by-step tasks with direct language','simple',ARRAY['follow','instruction','step','simple','procedure']),

('reading',2,'R2.01','Locates two or three items of information in familiar, short workplace texts','Familiar contexts and predictable formats','simple',ARRAY['locate','information','form','workplace','record']),
('reading',2,'R2.02','Interprets simply worded texts in familiar workplace contexts','Limited vocabulary complexity','simple',ARRAY['interpret','instruction','workplace','procedure','document']),
('reading',2,'R2.03','Understands the main idea in short workplace documents','Direct, plain-language documents','simple',ARRAY['understand','workplace','message','text','communication']),
('reading',2,'R2.04','Follows written procedures in familiar work tasks','Procedures with clear formatting and direct language','simple',ARRAY['procedure','follow','task','instruction','service']),

('reading',3,'R3.01','Locates and integrates several items of information in moderately complex texts','May require cross-referencing multiple sections','embedded',ARRAY['documentation','compliance','policies','records','multiple']),
('reading',3,'R3.02','Interprets embedded information in texts of moderate complexity','Meaning not always stated directly','embedded',ARRAY['interpret','embedded','technical','specialised','procedures']),
('reading',3,'R3.03','Understands specialised vocabulary in workplace documents','Domain-specific language required','embedded',ARRAY['specialised','technical','vocabulary','legislative','terminology']),
('reading',3,'R3.04','Reads and responds to moderately complex written workplace texts','Regulatory, policy and technical documents','embedded',ARRAY['regulatory','analytical','reporting','legislative','contract']),

('reading',4,'R4.01','Analyses complex texts where information is embedded and implied','Requires inference and critical reading skills','complex',ARRAY['analyse','complex','critical','strategic','analytical reporting']),
('reading',4,'R4.02','Evaluates information from multiple complex sources','Synthesises across reports, policy, legislation','complex',ARRAY['evaluate','multiple','sources','policy','frameworks']),
('reading',4,'R4.03','Interprets technical, regulatory and legislative documentation','Advanced domain knowledge required','complex',ARRAY['legislative interpretation','compliance','regulatory','technical writing','contract interpretation']),
('reading',4,'R4.04','Synthesises information from a range of complex organisational texts','Strategic planning and executive-level documents','complex',ARRAY['synthesise','strategic','stakeholder consultation','governance','organisational']),

('reading',5,'R5.01','Critically evaluates highly complex specialised texts for bias and assumptions','Expert-level domain literacy required','complex',ARRAY['critical','evaluate','highly complex','strategic','executive']),
('reading',5,'R5.02','Analyses the ideological, political or ethical dimensions of complex texts','Evaluates discourse and underlying assumptions','complex',ARRAY['strategic leadership','governance','policy development','organisational development','critical']),
('reading',5,'R5.03','Synthesises and evaluates information across diverse complex sources','Leadership and governance level reading','complex',ARRAY['strategic','governance','synthesis','complex','executive leadership']),

-- ── Writing ──
('writing',1,'W1.01','Writes familiar words and short phrases in simple formats','Labels, names, simple forms','simple',ARRAY['label','form','basic','simple','write']),
('writing',1,'W1.02','Completes simple forms with personal and familiar information','Pre-formatted templates with clear prompts','simple',ARRAY['form','complete','record','basic','personal']),

('writing',2,'W2.01','Writes short familiar texts using simple vocabulary in workplace contexts','Routine notes, forms, messages','simple',ARRAY['write','document','record','form','note']),
('writing',2,'W2.02','Completes workplace forms, logs and templates accurately','Structured formats with predictable fields','simple',ARRAY['form','template','log','record','complete']),
('writing',2,'W2.03','Produces short written messages and basic workplace records','Safety observations, handover notes','simple',ARRAY['message','record','communication','workplace','note']),

('writing',3,'W3.01','Produces workplace documents using appropriate format and structure','Reports, procedures, instructions','embedded',ARRAY['documentation','report','procedure','structure','format']),
('writing',3,'W3.02','Writes using specialised workplace vocabulary accurately','Technical and domain-specific language','embedded',ARRAY['specialised','technical writing','documentation','procedure','vocabulary']),
('writing',3,'W3.03','Drafts procedures, instructions and workplace reports','Clear sequencing and logical organisation','embedded',ARRAY['procedure','report','instruction','procedural documentation','administrative']),
('writing',3,'W3.04','Organises information logically in workplace documents','Headings, sections, referencing','embedded',ARRAY['record keeping','document management','administrative systems','file organisation','organise']),

('writing',4,'W4.01','Produces complex reports and formal business documents','Analytical, technical and strategic reports','complex',ARRAY['analytical reporting','formal','business','report','compliance documentation']),
('writing',4,'W4.02','Writes policy documents, complex procedures and regulatory submissions','Legislative and governance-level writing','complex',ARRAY['policy development','policy','regulatory','technical writing','legislative']),
('writing',4,'W4.03','Adapts writing style and register for different audiences and purposes','Tailors communication for strategic stakeholders','complex',ARRAY['stakeholder consultation','communication','professional','stakeholder management','audience']),
('writing',4,'W4.04','Produces detailed analytical, evaluative and strategic texts','Performance reports, strategic plans','complex',ARRAY['analytical','evaluative','strategic planning','assessment','performance frameworks']),

('writing',5,'W5.01','Produces highly complex specialist texts for strategic and governance purposes','Board papers, policy submissions, governance documents','complex',ARRAY['strategic','governance','policy development','organisational development','executive']),
('writing',5,'W5.02','Writes authoritative texts that shape organisational direction','Strategic roadmaps, frameworks, standards','complex',ARRAY['strategic leadership','governance','complex stakeholder reporting','systems thinking','organisational']),

-- ── Oral Communication ──
('oral_communication',1,'OC1.01','Participates in very short, familiar conversations with support','Greetings, simple requests, direct responses','simple',ARRAY['basic','greeting','simple','direct','verbal']),
('oral_communication',1,'OC1.02','Responds to simple direct questions and spoken instructions','Familiar routine tasks only','simple',ARRAY['respond','simple','instruction','direct','question']),

('oral_communication',2,'OC2.01','Participates in short conversations in familiar workplace contexts','Routine interactions with co-workers and customers','simple',ARRAY['customer service','service','workplace','interact','communicate']),
('oral_communication',2,'OC2.02','Asks and answers questions to complete familiar work tasks','Requesting clarification, checking information','simple',ARRAY['question','customer','communication','interaction','patron']),
('oral_communication',2,'OC2.03','Gives and follows simple verbal instructions in the workplace','Step-by-step task instructions','simple',ARRAY['verbal','instruction','follow','communication','service']),

('oral_communication',3,'OC3.01','Participates in conversations on a range of workplace topics','Meetings, briefings, professional discussions','embedded',ARRAY['communication','workplace','interpersonal','professional','discussion']),
('oral_communication',3,'OC3.02','Explains procedures and gives clear instructions to others','Training delivery, coaching, inductions','embedded',ARRAY['explain','procedure','training','facilitate','instruction']),
('oral_communication',3,'OC3.03','Manages complaints and difficult workplace interactions','De-escalation and resolution skills','embedded',ARRAY['complaint','conflict resolution','customer service','negotiation','interpersonal']),
('oral_communication',3,'OC3.04','Participates effectively in group discussions and team meetings','Contributes to planning and problem-solving','embedded',ARRAY['meeting','discussion','group','team leadership','participation']),

('oral_communication',4,'OC4.01','Leads meetings, workshops and facilitates group discussions','Structured facilitation of complex agendas','complex',ARRAY['facilitate','lead','stakeholder','meeting','engagement']),
('oral_communication',4,'OC4.02','Presents complex information to diverse professional audiences','Formal presentations and briefings','complex',ARRAY['presentation','complex stakeholder reporting','stakeholder','consultation','audience']),
('oral_communication',4,'OC4.03','Negotiates outcomes in complex or sensitive workplace situations','Employment relations, contracts, high-stakes decisions','complex',ARRAY['negotiation','complex stakeholder','engagement','strategic','employment']),

('oral_communication',5,'OC5.01','Leads complex negotiations, mediations and high-stakes discussions','Board-level negotiations and external representation','complex',ARRAY['strategic leadership','negotiation','governance','executive','leadership']),
('oral_communication',5,'OC5.02','Represents the organisation authoritatively in formal external contexts','Media, government, sector leadership roles','complex',ARRAY['strategic','governance','representation','complex stakeholder','organisational development']),

-- ── Numeracy ──
('numeracy',1,'N1.01','Performs simple counting and basic addition and subtraction','Familiar, everyday quantities','simple',ARRAY['count','basic','simple','quantity','number']),
('numeracy',1,'N1.02','Reads and interprets simple numbers and amounts in everyday contexts','Prices, times, basic measurements','simple',ARRAY['number','amount','basic','measure','simple']),

('numeracy',2,'N2.01','Performs calculations using whole numbers in familiar workplace tasks','Timesheets, stock counts, basic financial transactions','simple',ARRAY['calculate','number','financial records','record','transaction']),
('numeracy',2,'N2.02','Reads and interprets simple graphs and tables','Bar charts, timetables, simple data tables','simple',ARRAY['graph','table','data','record','chart']),
('numeracy',2,'N2.03','Measures and estimates in familiar workplace tasks','Length, weight, volume in standard units','simple',ARRAY['measure','estimate','calculate','material','quantity']),

('numeracy',3,'N3.01','Performs calculations involving fractions, decimals and percentages','Costing, discounts, ratios','embedded',ARRAY['calculate','percentage','financial records','bookkeeping','numeracy']),
('numeracy',3,'N3.02','Interprets and analyses numerical data in workplace contexts','Variance reports, production data, financial summaries','embedded',ARRAY['analyse','financial','numerical accuracy','data','bookkeeping']),
('numeracy',3,'N3.03','Uses measurement and spatial reasoning in technical workplace tasks','Construction, engineering, technical drawings','embedded',ARRAY['measurement','load calculations','material estimation','technical','calculation']),
('numeracy',3,'N3.04','Reads and interprets workplace charts, tables and statistical information','Workplace reports and dashboards','embedded',ARRAY['financial records','data','statistical','reporting','budget']),

('numeracy',4,'N4.01','Applies statistical analysis and complex calculations in professional contexts','Business analytics, research, risk modelling','complex',ARRAY['financial analysis','statistical','quantitative analysis','modelling','analytical']),
('numeracy',4,'N4.02','Interprets and uses complex financial data for decision-making','Budgeting, forecasting, financial reporting','complex',ARRAY['financial reporting','budget preparation','variance analysis','financial analysis','accounting software']),
('numeracy',4,'N4.03','Uses mathematical modelling and estimation in strategic planning','Cost-benefit analysis, project costing','complex',ARRAY['modelling','spreadsheet modelling','quantitative','cost estimation','project costing']),

('numeracy',5,'N5.01','Applies advanced statistical and mathematical methods to complex problems','Research design, advanced analytics','complex',ARRAY['advanced','statistical','complex analysis','strategic','modelling']),
('numeracy',5,'N5.02','Evaluates complex quantitative arguments and recommends strategic action','Board-level financial and strategic numeracy','complex',ARRAY['evaluate','quantitative analysis','strategic','governance','complex risk frameworks']),

-- ── Learning ──
('learning',1,'L1.01','Responds to familiar, routine learning tasks with direct support','Highly scaffolded environments','simple',ARRAY['basic','simple','familiar','routine','support']),
('learning',1,'L1.02','Follows simple step-by-step learning instructions','Structured, direct instruction only','simple',ARRAY['follow','instruction','step','simple','guided']),

('learning',2,'L2.01','Completes familiar learning tasks with some independence','Routine workplace tasks with occasional guidance','simple',ARRAY['workplace','task','procedure','complete','training']),
('learning',2,'L2.02','Identifies own learning needs in familiar contexts','Basic self-awareness of skill gaps','simple',ARRAY['identify','learning','needs','self','familiar']),
('learning',2,'L2.03','Uses familiar strategies to complete workplace learning tasks','Applying known methods and approaches','simple',ARRAY['apply','strategy','task','workplace','procedure']),

('learning',3,'L3.01','Applies learning strategies across a range of workplace contexts','Adapts approach to different situations','embedded',ARRAY['apply','learning','professional development','reflective practice','transfer']),
('learning',3,'L3.02','Self-manages learning and actively seeks feedback on performance','Independent learner with feedback-seeking behaviour','embedded',ARRAY['self-management','feedback','performance management','coaching','development planning']),
('learning',3,'L3.03','Transfers knowledge and skills to new or unfamiliar workplace situations','Generalises learning to novel tasks','embedded',ARRAY['transfer','apply','problem-solving','workplace','task management']),
('learning',3,'L3.04','Uses reflective practice to identify improvement opportunities','Portfolio evidence, reflective journals','embedded',ARRAY['reflective practice','improvement','feedback','learning documentation','observation']),

('learning',4,'L4.01','Develops and implements individual and team learning plans','Performance management and development systems','complex',ARRAY['development planning','performance management','HR planning','workforce planning','training']),
('learning',4,'L4.02','Mentors, coaches and facilitates others in complex workplace tasks','Leadership and talent development roles','complex',ARRAY['coaching','mentoring','leadership','team leadership','performance frameworks']),
('learning',4,'L4.03','Applies critical reflection to evaluate and improve professional practice','Complex reflective analysis and practice improvement','complex',ARRAY['critical','reflective practice','professional development','analytical','evaluation']),

('learning',5,'L5.01','Leads organisational learning and knowledge management systems','Enterprise-level learning strategy','complex',ARRAY['strategic','knowledge management','organisational development','leadership','systems thinking']),
('learning',5,'L5.02','Designs and evaluates complex organisational learning frameworks','Workforce development strategy and learning architecture','complex',ARRAY['strategic leadership','design','evaluate','complex','organisational development'])

ON CONFLICT (indicator_code) DO NOTHING;
