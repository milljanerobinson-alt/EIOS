
-- Standardise documentation titles and version field to consistent format:
-- Title: "EOC Phase Completion Report — [Phase Description] (v[X.X])"
-- Version: always prefixed with "v"

UPDATE ecc_documentation
SET
  title   = 'EOC Phase Completion Report — Phase 1 Foundation (v0.1)',
  version = 'v0.1'
WHERE id = '531b310c-1ae7-4d5c-9e91-a9b886b7d25f';

UPDATE ecc_documentation
SET
  title   = 'EOC Phase Completion Report — Phase 2 Engineering Knowledge (v0.2)',
  version = 'v0.2'
WHERE id = 'ecbdf1bc-d137-4249-b8dd-205a1b436889';

UPDATE ecc_documentation
SET
  title   = 'EOC Phase Completion Report — Phase 3 Workflow Automation (v0.3)'
WHERE id = 'aa8f8279-47d9-4c3f-a013-790611c346a1';
