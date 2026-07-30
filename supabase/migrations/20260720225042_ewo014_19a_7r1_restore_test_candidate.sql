/*
# EWO-014.19A.7R.1 — Restore EWO-TEST-001 to Draft Test Candidate State
#
# EWO-TEST-001 was included in the candidate batch (correct — only exact 'TEST'
# is excluded). However, it is a test candidate for execution eligibility
# testing (EWO-017R.2) and must remain in 'draft' status with
# implementation_status='Not Started'. The governed maintenance script should
# have skipped it as a special test candidate.
#
# This migration restores EWO-TEST-001 to its pre-maintenance state while
# keeping the verification gates (which are harmless in draft state).
*/

UPDATE engineering_work_orders
SET
  status = 'draft',
  implementation_status = 'Not Started',
  implementation_completed_at = NULL,
  po_testing_status = 'pending',
  po_testing_completed_at = NULL,
  po_accepted_at = NULL,
  po_accepted_by = NULL,
  po_acceptance_statement = NULL,
  closure_eligible = false,
  verification_status = 'in_progress',
  closed_at = NULL,
  closure_method = NULL,
  updated_at = now()
WHERE ewo_ref = 'EWO-TEST-001';

-- Remove the lifecycle closure event for EWO-TEST-001
DELETE FROM ewo_lifecycle_events
WHERE ewo_id = (SELECT id FROM engineering_work_orders WHERE ewo_ref = 'EWO-TEST-001')
  AND to_status = 'closed'
  AND metadata->>'standard' = 'EWO-014.19A.7R.1';

-- Remove the placeholder completion report for EWO-TEST-001
DELETE FROM ewo_completion_reports
WHERE ewo_id = (SELECT id FROM engineering_work_orders WHERE ewo_ref = 'EWO-TEST-001')
  AND executive_summary LIKE '%Recognised by governed maintenance script%';

-- Remove the placeholder engineering package for EWO-TEST-001
DELETE FROM ewo_engineering_packages
WHERE ewo_id = (SELECT id FROM engineering_work_orders WHERE ewo_ref = 'EWO-TEST-001')
  AND implementation_notes LIKE '%Historical engineering package%';

-- Reset verification gates to not_started for EWO-TEST-001
-- (it's a test candidate, not a verified EWO)
UPDATE ewo_verification_gates
SET status = 'not_started', verified_by = NULL, verified_at = NULL, evidence_summary = NULL
WHERE ewo_id = (SELECT id FROM engineering_work_orders WHERE ewo_ref = 'EWO-TEST-001');
