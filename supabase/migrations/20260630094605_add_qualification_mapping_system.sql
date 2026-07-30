/*
# Qualification Mapping System

## Summary
Extends the qualifications table with ACSF mapping metadata and creates an internal
qualification mapping library that provides recommended default ACSF levels for
common Australian qualifications. When a qualification is imported from aXcelerate
the system can automatically apply a recommended mapping, eliminating manual setup.

## Changes

### qualifications table — New Columns
- mapping_status: current mapping state — one of:
    mapping_required     (no ACSF levels configured)
    default_mapping_applied (using the library recommendation, unchanged)
    custom_mapping       (admin has modified levels)
    review_required      (not reviewed within the review period)
- mapping_source: where the current mapping originated ('default' = library, 'custom' = admin, null = none)
- reviewed_at: timestamptz — when an admin last reviewed and approved this mapping
- reviewed_by: text — name or email of the reviewer
- internal_notes: text — freeform notes for internal RTO use
- mapping_version: integer — increments on each save for version tracking
- default_mapping_snapshot: jsonb — stores the library's recommended levels so the
    admin can always restore to the original recommendation

### qualification_mapping_library table — New Table
System-managed lookup table of recommended ACSF/DLSF levels for recognised Australian
qualifications. These are recommended defaults based on industry experience and best
practice. RTOs must review and confirm that mappings reflect their specific training
context before relying on them for compliance.

Columns:
- id uuid primary key
- code text unique — qualification code (e.g. BSB30120)
- name text — qualification name
- training_package text — training package name
- learning_level integer (1–5) — recommended Learning ACSF level
- reading_level integer (1–5) — recommended Reading ACSF level
- writing_level integer (1–5) — recommended Writing ACSF level
- oral_comm_level integer (1–5) — recommended Oral Communication ACSF level
- numeracy_level integer (1–5) — recommended Numeracy ACSF level
- digital_level integer (1–5) — recommended Digital Literacy level
- mapping_notes text — rationale or source notes
- last_updated timestamptz
- created_at timestamptz

### Security
- RLS enabled on qualification_mapping_library
- Staff (admin/trainer) may SELECT; only admin may INSERT/UPDATE/DELETE
- Existing qualification table RLS policies are unchanged

### Seed Data
Approximately 45 common Australian qualifications seeded with recommended ACSF levels.
INSERT ... ON CONFLICT DO NOTHING makes this migration safe to re-run.

### Important Notes
1. All new columns on qualifications are nullable with sensible defaults.
2. Existing qualification rows are unaffected by this migration — their mapping_status
   will be null until the admin views or edits them (treated as 'custom_mapping' in UI).
3. The mapping library is read-only from the perspective of the application code.
   It is owned by the LLN+D platform and updated via migrations only.
*/

-- ── Extend qualifications table ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'qualifications' AND column_name = 'mapping_status') THEN
    ALTER TABLE qualifications ADD COLUMN mapping_status text CHECK (mapping_status IN ('mapping_required','default_mapping_applied','custom_mapping','review_required'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'qualifications' AND column_name = 'mapping_source') THEN
    ALTER TABLE qualifications ADD COLUMN mapping_source text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'qualifications' AND column_name = 'reviewed_at') THEN
    ALTER TABLE qualifications ADD COLUMN reviewed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'qualifications' AND column_name = 'reviewed_by') THEN
    ALTER TABLE qualifications ADD COLUMN reviewed_by text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'qualifications' AND column_name = 'internal_notes') THEN
    ALTER TABLE qualifications ADD COLUMN internal_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'qualifications' AND column_name = 'mapping_version') THEN
    ALTER TABLE qualifications ADD COLUMN mapping_version integer NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'qualifications' AND column_name = 'default_mapping_snapshot') THEN
    ALTER TABLE qualifications ADD COLUMN default_mapping_snapshot jsonb;
  END IF;
END $$;

-- ── Create qualification_mapping_library ────────────────────────────────────

CREATE TABLE IF NOT EXISTS qualification_mapping_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  training_package text,
  learning_level integer CHECK (learning_level BETWEEN 1 AND 5),
  reading_level integer CHECK (reading_level BETWEEN 1 AND 5),
  writing_level integer CHECK (writing_level BETWEEN 1 AND 5),
  oral_comm_level integer CHECK (oral_comm_level BETWEEN 1 AND 5),
  numeracy_level integer CHECK (numeracy_level BETWEEN 1 AND 5),
  digital_level integer CHECK (digital_level BETWEEN 1 AND 5),
  mapping_notes text,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE qualification_mapping_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mapping_library_select_staff" ON qualification_mapping_library;
CREATE POLICY "mapping_library_select_staff" ON qualification_mapping_library FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer'))
  );

DROP POLICY IF EXISTS "mapping_library_insert_admin" ON qualification_mapping_library;
CREATE POLICY "mapping_library_insert_admin" ON qualification_mapping_library FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "mapping_library_update_admin" ON qualification_mapping_library;
CREATE POLICY "mapping_library_update_admin" ON qualification_mapping_library FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "mapping_library_delete_admin" ON qualification_mapping_library;
CREATE POLICY "mapping_library_delete_admin" ON qualification_mapping_library FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── Seed the mapping library ─────────────────────────────────────────────────
-- Columns: code, name, training_package, learning, reading, writing, oral_comm, numeracy, digital, notes

INSERT INTO qualification_mapping_library
  (code, name, training_package, learning_level, reading_level, writing_level, oral_comm_level, numeracy_level, digital_level, mapping_notes)
VALUES
  -- Foundation Skills
  ('FSK10219', 'Certificate I in Skills for Vocational Pathways', 'Foundation Skills', 2, 2, 1, 2, 2, 1, 'Entry-level foundation skills for vocational pathways'),
  ('FSK20119', 'Certificate II in Skills for Work and Vocational Pathways', 'Foundation Skills', 2, 2, 2, 2, 2, 2, 'Developing foundation skills for work contexts'),

  -- Business Services (BSB)
  ('BSB10120', 'Certificate I in Business', 'Business Services', 2, 2, 1, 2, 2, 1, 'Entry-level business support role'),
  ('BSB20120', 'Certificate II in Business', 'Business Services', 2, 2, 2, 2, 2, 2, 'Administrative and business support tasks'),
  ('BSB30120', 'Certificate III in Business', 'Business Services', 3, 3, 3, 3, 2, 3, 'Broad range of business support and clerical tasks'),
  ('BSB40120', 'Certificate IV in Business', 'Business Services', 3, 3, 3, 3, 3, 3, 'Complex business tasks; supervisory responsibility'),
  ('BSB50120', 'Diploma of Business', 'Business Services', 4, 4, 4, 4, 3, 3, 'Operational management and complex business functions'),
  ('BSB40420', 'Certificate IV in Human Resource Management', 'Business Services', 3, 3, 3, 3, 3, 3, 'HR coordination and policy application'),
  ('BSB50320', 'Diploma of Human Resource Management', 'Business Services', 4, 4, 4, 4, 3, 4, 'Strategic HR management and workforce planning'),
  ('BSB40520', 'Certificate IV in Leadership and Management', 'Business Services', 3, 3, 3, 3, 3, 3, 'Team leadership and operational management'),
  ('BSB50420', 'Diploma of Leadership and Management', 'Business Services', 4, 4, 4, 4, 3, 4, 'Strategic leadership and complex project management'),
  ('BSB60120', 'Advanced Diploma of Business', 'Business Services', 4, 4, 4, 4, 4, 4, 'Senior management and strategic business operations'),
  ('BSB80120', 'Graduate Diploma of Management (Learning)', 'Business Services', 5, 5, 5, 5, 4, 4, 'Senior strategic management at graduate level'),

  -- Training and Education (TAE)
  ('TAE40122', 'Certificate IV in Training and Assessment', 'Training and Education', 4, 4, 4, 4, 3, 3, 'Design and deliver training; conduct assessment; requires strong written and oral communication'),
  ('TAE50122', 'Diploma of Vocational Education and Training', 'Training and Education', 4, 4, 4, 4, 3, 4, 'RTO management and advanced VET practice'),

  -- Community Services (CHC)
  ('CHC22015', 'Certificate II in Community Services', 'Community Services', 2, 2, 2, 2, 2, 2, 'Entry-level community support work'),
  ('CHC30121', 'Certificate III in Early Childhood Education and Care', 'Community Services', 3, 3, 3, 3, 2, 2, 'Care and education of children 0–5 years'),
  ('CHC33021', 'Certificate III in Individual Support', 'Community Services', 3, 3, 3, 3, 2, 2, 'Aged care / disability support — direct service delivery'),
  ('CHC43121', 'Certificate IV in Disability Support', 'Community Services', 3, 3, 3, 3, 3, 3, 'Complex disability support with coordination duties'),
  ('CHC43015', 'Certificate IV in Ageing Support', 'Community Services', 3, 3, 3, 3, 2, 3, 'Complex aged care with supervisory responsibility'),
  ('CHC52021', 'Diploma of Community Services', 'Community Services', 4, 4, 4, 4, 3, 3, 'Case management, coordination and community service delivery'),
  ('CHC50321', 'Diploma of Child, Youth and Family Intervention', 'Community Services', 4, 4, 4, 4, 3, 3, 'Complex case management for children and families at risk'),
  ('CHC62015', 'Advanced Diploma of Community Sector Management', 'Community Services', 4, 4, 4, 4, 3, 4, 'Senior management in community services organisations'),

  -- Construction (CPC)
  ('CPC10120', 'Certificate I in Construction', 'Construction, Plumbing and Services', 2, 2, 1, 2, 2, 1, 'Basic trades entry; site safety and manual tasks'),
  ('CPC20120', 'Certificate II in Construction', 'Construction, Plumbing and Services', 2, 2, 2, 2, 2, 2, 'Trades support and construction labouring'),
  ('CPC30220', 'Certificate III in Carpentry', 'Construction, Plumbing and Services', 3, 3, 2, 2, 3, 2, 'Residential and light commercial carpentry work'),
  ('CPC30320', 'Certificate III in Concreting', 'Construction, Plumbing and Services', 3, 3, 2, 2, 3, 2, 'Concrete structures and finishing'),
  ('CPC40120', 'Certificate IV in Building and Construction (Building)', 'Construction, Plumbing and Services', 4, 4, 3, 3, 4, 3, 'Residential building supervision and project coordination'),
  ('CPC50220', 'Diploma of Building and Construction (Building)', 'Construction, Plumbing and Services', 4, 4, 4, 3, 4, 3, 'Low-rise commercial and complex residential building management'),

  -- Hospitality and Tourism (SIT)
  ('SIT20322', 'Certificate II in Hospitality', 'Tourism, Travel and Hospitality', 2, 2, 2, 2, 2, 2, 'Entry-level front-of-house and guest service roles'),
  ('SIT20422', 'Certificate II in Kitchen Operations', 'Tourism, Travel and Hospitality', 2, 2, 2, 2, 2, 1, 'Basic food preparation and kitchen support'),
  ('SIT30622', 'Certificate III in Hospitality', 'Tourism, Travel and Hospitality', 3, 3, 3, 3, 2, 2, 'Service-oriented hospitality roles with guest interaction'),
  ('SIT30821', 'Certificate III in Commercial Cookery', 'Tourism, Travel and Hospitality', 3, 3, 3, 3, 3, 2, 'Full commercial kitchen operation; menu costing and planning'),
  ('SIT40521', 'Certificate IV in Kitchen Management', 'Tourism, Travel and Hospitality', 3, 3, 3, 3, 3, 3, 'Kitchen supervision; rostering and cost control'),
  ('SIT50422', 'Diploma of Hospitality Management', 'Tourism, Travel and Hospitality', 4, 4, 4, 4, 3, 3, 'Hospitality operations management'),

  -- Health (HLT)
  ('HLT23221', 'Certificate II in Health Support Services', 'Health', 2, 2, 2, 2, 2, 2, 'Hospital and health facility support roles'),
  ('HLT33115', 'Certificate III in Health Support Services', 'Health', 3, 3, 3, 3, 2, 2, 'Broader health support with clinical environment exposure'),
  ('HLT33221', 'Certificate III in Allied Health Assistance', 'Health', 3, 3, 3, 3, 3, 2, 'Allied health assistant under professional supervision'),
  ('HLT54121', 'Diploma of Nursing', 'Health', 4, 4, 4, 4, 3, 3, 'Enrolled nurse practice under registered nurse supervision'),

  -- Finance (FNS)
  ('FNS30122', 'Certificate III in Accounts Administration', 'Financial Services', 3, 3, 3, 3, 3, 3, 'Accounts payable/receivable and financial processing'),
  ('FNS40222', 'Certificate IV in Accounting and Bookkeeping', 'Financial Services', 3, 3, 3, 3, 4, 3, 'Bookkeeping, BAS, payroll and financial reporting'),
  ('FNS50222', 'Diploma of Accounting', 'Financial Services', 4, 4, 4, 4, 4, 4, 'Management accounting and complex financial functions'),

  -- ICT
  ('ICT30120', 'Certificate III in Information Technology', 'Information and Communications Technology', 3, 3, 3, 3, 3, 4, 'IT technical support and helpdesk operations'),
  ('ICT40120', 'Certificate IV in Information Technology', 'Information and Communications Technology', 3, 3, 3, 3, 3, 5, 'Advanced IT technical work and systems configuration'),
  ('ICT50220', 'Diploma of Information Technology', 'Information and Communications Technology', 4, 4, 4, 4, 3, 5, 'IT project coordination and systems analysis'),

  -- Sport and Recreation (SIS)
  ('SIS20419', 'Certificate II in Sport and Recreation', 'Sport, Fitness and Recreation', 2, 2, 2, 2, 2, 2, 'Entry-level sport and recreation support'),
  ('SIS30321', 'Certificate III in Fitness', 'Sport, Fitness and Recreation', 3, 3, 3, 3, 2, 3, 'Personal training and group exercise delivery'),
  ('SIS40221', 'Certificate IV in Fitness', 'Sport, Fitness and Recreation', 3, 3, 3, 3, 3, 3, 'Advanced fitness training and program design'),

  -- Queensland-specific
  ('30616QLD', 'Certificate IV in English for Further Study', 'Queensland', 3, 3, 3, 3, 3, 3, 'Academic English for higher education or vocational training entry')
ON CONFLICT (code) DO NOTHING;
