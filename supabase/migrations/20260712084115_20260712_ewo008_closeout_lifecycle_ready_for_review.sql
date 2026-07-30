/*
# EWO-008 Closeout: Lifecycle State — Ready for Product Owner Review

## Summary
Sets EWO-008 to 'ready_for_review' lifecycle state and records implementation
completion timestamp. This is the final pre-PO-acceptance state.

## Authority Note
Only a Product Owner may transition EWO-008 from ready_for_review to po_accepted.
The system will never assign this transition automatically.
*/

UPDATE engineering_work_orders
SET
  status = 'ready_for_review',
  implementation_complete_at = '2026-07-12 08:00:00+00',
  ready_for_review_at = NOW(),
  engineering_notes = COALESCE(engineering_notes, '') ||
    E'\n\n[2026-07-12] EWO-008 implementation complete. Constitutional closeout performed: ' ||
    'historical record integrity verified and corrected, append-only RLS enforced, PO authority model established, ' ||
    'CONST-001-AMD-001 ratified (CD-001/CD-006/CD-007 refined). Ready for Product Owner Review.',
  updated_at = NOW()
WHERE ewo_ref = 'EWO-008';

-- Update RULE-002: set requires_po_authority explicitly
UPDATE engineering_automation_rules
SET requires_po_authority = true,
    updated_at = NOW()
WHERE rule_ref = 'RULE-002';
