/*
# Reset Test Plan Library to Clean State

Removes all implementation-generated test plan content.

## What is removed
- All rows from ecc_test_plans (TP-001 and any other seeded plans)
- All rows from ecc_test_suites (cascade already handles children, but explicit for clarity)
- All rows from ecc_test_cases
- All rows from ecc_test_runs
- All rows from ecc_test_run_results
- All rows from ecc_tp001_executions
- All rows from ecc_tp001_results
- All rows from ecc_testing_reports

## What is preserved
- All table definitions and schema
- All RLS policies
- All indexes and constraints
- The ecc_register_sequences 'tp' entry (reset to 0 so next plan is TP-001)
- All other framework tables (ecc_test_library, ecc_feature_test_cases, ecc_feature_test_links)

## Result
The Test Plan library is empty and ready for the first manually designed engineering Test Plan.
*/

-- Clear execution and result data first (child tables)
DELETE FROM ecc_tp001_results;
DELETE FROM ecc_tp001_executions;
DELETE FROM ecc_test_run_results;
DELETE FROM ecc_testing_reports;

-- Clear test plan hierarchy (cascade handles suites/cases, but explicit is clearer)
DELETE FROM ecc_test_cases;
DELETE FROM ecc_test_suites;
DELETE FROM ecc_test_runs;
DELETE FROM ecc_test_plans;

-- Reset the auto-number sequence so the first manually created plan becomes TP-001
UPDATE ecc_register_sequences
SET last_number = 0
WHERE register_type = 'tp';
