/*
# Expand qualification mapping library

## Summary
Adds additional qualifications to the mapping library that were not included in
the initial seed. Includes BSB41419 (Certificate IV in Construction Safety Advisor)
which triggered this patch, plus other common qualifications that were missing.

## Added qualifications
- BSB41419 Certificate IV in Construction Safety Advisor
- BSB41419 maps as a BSB Cert IV with construction safety emphasis:
  higher numeracy and oral communication due to site safety consultation demands
- Additional BSB, CHC, CPC, SIT, HLT qualifications to improve coverage

All use INSERT ... ON CONFLICT DO NOTHING so safe to re-run.
*/

INSERT INTO qualification_mapping_library
  (code, name, training_package, learning_level, reading_level, writing_level, oral_comm_level, numeracy_level, digital_level, mapping_notes)
VALUES
  -- BSB — missing qualifications
  ('BSB41419', 'Certificate IV in Work Health and Safety', 'Business Services', 3, 3, 3, 3, 3, 3, 'WHS/OHS coordination role; requires strong reading of legislation and oral communication for safety consultation'),
  ('BSB41215', 'Certificate IV in Library and Information Services', 'Business Services', 3, 4, 3, 3, 2, 4, 'Information management and research focus; elevated reading and digital demands'),
  ('BSB30420', 'Certificate III in Library and Information Services', 'Business Services', 3, 3, 3, 3, 2, 3, 'Library support tasks; moderate digital and reading demands'),
  ('BSB80220', 'Graduate Certificate in Portfolio Management', 'Business Services', 5, 5, 5, 5, 4, 4, 'Executive-level strategic portfolio management'),
  ('BSB60420', 'Advanced Diploma of Leadership and Management', 'Business Services', 4, 4, 4, 4, 4, 4, 'Senior strategic leadership and complex management functions'),

  -- CHC — missing qualifications
  ('CHC40121', 'Certificate IV in Youth Work', 'Community Services', 3, 3, 3, 3, 2, 3, 'Case-managed youth support; documentation and oral advocacy demands'),
  ('CHC40221', 'Certificate IV in School Age Education and Care', 'Community Services', 3, 3, 3, 3, 2, 2, 'School-age care and education support role'),
  ('CHC50121', 'Diploma of Early Childhood Education and Care', 'Community Services', 4, 4, 4, 4, 3, 3, 'Educational leadership in early childhood settings'),
  ('CHC32015', 'Certificate III in Community Services', 'Community Services', 3, 3, 3, 3, 2, 2, 'Front-line community services delivery role'),
  ('CHC42021', 'Certificate IV in Community Services', 'Community Services', 3, 3, 3, 3, 2, 3, 'Case coordination and community program delivery'),

  -- HLT — missing qualifications
  ('HLT35015', 'Certificate III in Dental Assisting', 'Health', 3, 3, 3, 3, 2, 3, 'Clinical dental support; patient communication and documentation demands'),
  ('HLT37315', 'Certificate III in Pathology Collection', 'Health', 3, 3, 3, 3, 3, 3, 'Pathology specimen collection; accuracy and documentation demands'),
  ('HLT45015', 'Certificate IV in Dental Assisting', 'Health', 3, 3, 3, 3, 3, 3, 'Advanced clinical dental support with supervisory responsibility'),
  ('HLT52021', 'Diploma of Practice Management', 'Health', 4, 4, 4, 4, 4, 4, 'Healthcare practice operations management'),

  -- CPC — missing qualifications
  ('CPC40220', 'Certificate IV in Plumbing and Services', 'Construction, Plumbing and Services', 3, 3, 3, 3, 3, 3, 'Licensed plumbing work with supervisory and project planning responsibilities'),
  ('CPC30620', 'Certificate III in Roof Plumbing', 'Construction, Plumbing and Services', 3, 3, 2, 2, 3, 2, 'Specialist roof plumbing trade work'),
  ('CPCCDE3014', 'Certificate III in Demolition', 'Construction, Plumbing and Services', 3, 3, 2, 2, 3, 2, 'Demolition trade with strong safety documentation requirements'),

  -- SIT — missing qualifications
  ('SIT40622', 'Certificate IV in Leadership and Management (Hospitality)', 'Tourism, Travel and Hospitality', 3, 3, 3, 4, 3, 3, 'Hospitality team leadership and operational management'),
  ('SIT50122', 'Diploma of Travel and Tourism Management', 'Tourism, Travel and Hospitality', 4, 4, 4, 4, 3, 3, 'Travel operations management; customer communication and financial management demands'),
  ('SIT31122', 'Certificate III in Travel', 'Tourism, Travel and Hospitality', 3, 3, 3, 3, 2, 3, 'Travel agency and reservation work; communication and digital system demands'),

  -- AHC — agriculture/horticulture
  ('AHC20616', 'Certificate II in Horticulture', 'Agriculture, Horticulture and Conservation and Land Management', 2, 2, 2, 2, 2, 1, 'Entry-level horticulture tasks'),
  ('AHC30716', 'Certificate III in Horticulture', 'Agriculture, Horticulture and Conservation and Land Management', 3, 3, 2, 3, 3, 2, 'Skilled horticulture trade work'),
  ('AHC40116', 'Certificate IV in Agriculture', 'Agriculture, Horticulture and Conservation and Land Management', 3, 3, 3, 3, 3, 3, 'Agricultural management and supervisory role'),

  -- TLI — Transport and Logistics
  ('TLI21219', 'Certificate II in Warehousing Operations', 'Transport and Logistics', 2, 2, 2, 2, 2, 2, 'Warehouse and distribution centre operations'),
  ('TLI31219', 'Certificate III in Warehousing Operations', 'Transport and Logistics', 3, 3, 3, 3, 2, 2, 'Warehouse operations with supervisory and documentation demands'),
  ('TLI41819', 'Certificate IV in Logistics', 'Transport and Logistics', 3, 3, 3, 3, 3, 3, 'Logistics coordination and supply chain management')
ON CONFLICT (code) DO NOTHING;

-- Also update the mapping_status for any qualification that was imported
-- and has mapping_required status but now matches the library
-- (do this for any qual whose code appears in the library but has no requirements)
UPDATE qualifications q
SET mapping_status = 'default_mapping_applied',
    mapping_source = 'default'
WHERE q.mapping_status = 'mapping_required'
  AND EXISTS (
    SELECT 1 FROM qualification_mapping_library l
    WHERE UPPER(l.code) = UPPER(q.code)
  )
  AND NOT EXISTS (
    SELECT 1 FROM qualification_lln_requirements r
    WHERE r.qualification_id = q.id
  );
