/*
# EWO-014.11R1: Update ES-001B Engineering Completion Package Standard

1. Purpose
   Refine the Engineering Completion Package Standard (ES-001B) to incorporate
   governance, auditability, and Product Owner workflow improvements introduced
   by EWO-014.11R1.

2. Changes
   - Updates the `body` of the existing ES-001B standard in
     `ecc_engineering_standards` to include:
     a. Product Owner test results no longer pre-populated as PASS —
        replaced with blank checkboxes (☐ PASS / ☐ FAIL) and Comments field.
     b. New "Verification Evidence" subsection in the Engineering Completion
        Report summarising migrations, deployments, build, TypeScript,
        automated testing, runtime verification, deployment verification,
        and verification confidence.
     c. Engineering Status replaced with governed lifecycle fields:
        Implementation, Verification, Acceptance, Release, Learning,
        Next Engineering.
     d. Implementation Package expanded with Implementation Engine,
        Implementation Version, Implementation Date, Implementation Status,
        Next Engineering Work Order, and Implementation Prompt.
     e. Next Engineering Work Order summary (Reference, Title, Priority,
        Status) added before the Implementation Prompt.
     f. Single copyable block requirement reinforced.
   - Increments the `updated_at` timestamp.

3. Security
   - No new tables created.
   - No RLS policy changes.
   - This is a data-only update to an existing standards record.

4. Important Notes
   - This migration is idempotent: re-running it will simply re-apply the
     same standard body text.
   - The standard ID (a78e8f96-912a-4d2c-b323-f47588876619) is fixed and
     was established by the original ES-001B seed migration.
*/

UPDATE ecc_engineering_standards
SET
  body = 'Every completed Engineering Work Order shall return a complete Engineering Completion Package as a single copyable block. The package shall contain four sections in order: (1) Engineering Completion Report — full completion report with reference, title, status, deliverables, verification, and a Verification Evidence subsection summarising database migrations, edge function deployments, build results, TypeScript compilation, automated testing, runtime verification, deployment verification, and verification confidence. (2) Product Owner Testing — test checklist with expected results. The Implementation Engine shall NOT pre-populate test results. Each test shall present blank checkboxes: ☐ PASS and ☐ FAIL, plus a Comments field. The Product Owner is solely responsible for recording testing outcomes. The Implementation Engine may recommend expected results but shall never mark tests as passed. Acceptance criteria shall use unchecked checkboxes ([ ]). (3) Implementation Package — identifies the Implementation Engine (implementation-engine neutral), Implementation Version, Implementation Date, Implementation Status, Next Engineering Work Order, a Next Engineering Work Order Summary (Reference, Title, Priority, Status), and the complete Implementation Prompt for the next work order. (4) Engineering Status — uses governed lifecycle fields: Implementation, Verification, Acceptance, Release, Learning, and Next Engineering. Each field shall reflect the actual engineering lifecycle stage. The entire package shall be produced as one copyable block so users press Copy once. No section may be returned separately. No additional engineering artefacts shall exist outside the package. The package shall not reference any specific implementation engine by name in its structure. The "Implementation Engine:" field identifies which engine consumed the work; changing engines requires changing only this field. Future implementation engines shall comply with this standard automatically.',
  updated_at = now()
WHERE version_introduced = 'ES-001B'
  AND title = 'ES-001B: Engineering Completion Package Standard';
