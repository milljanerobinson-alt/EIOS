/*
# EWO-014.11 — Engineering Completion Package Standardisation

## Purpose

Introduces ES-001B as a constitutional engineering standard. Every completed
Engineering Work Order shall return a complete Engineering Completion Package
using the governed 4-section structure:

  1. Engineering Completion Report
  2. Product Owner Testing
  3. Implementation Package
  4. Engineering Status

The package is implementation-engine neutral. Changing Implementation Engines
requires changing only the "Implementation Engine:" field without modifying
the package structure.

## Changes

### 1. Seeds ES-001B in ecc_engineering_standards
- Category: Governance
- Title: ES-001B: Engineering Completion Package Standard
- Tags: constitutional, completion-package, es-001b, ewo-014.11

## Security
- No new tables — uses existing ecc_engineering_standards.
- No RLS changes.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ecc_engineering_standards WHERE title = 'ES-001B: Engineering Completion Package Standard') THEN
    INSERT INTO ecc_engineering_standards (version_introduced, category, title, body, status, sort_order, tags)
    VALUES (
      'ES-001B',
      'Governance',
      'ES-001B: Engineering Completion Package Standard',
      'Every completed Engineering Work Order shall return a complete Engineering Completion Package as a single copyable block. The package shall contain four sections in order: (1) Engineering Completion Report — full completion report with reference, title, status, deliverables, verification, and confidence. (2) Product Owner Testing — test checklist with expected results and pass/fail for each test, plus acceptance criteria checkboxes. (3) Implementation Package — identifies the Implementation Engine, Implementation Status, and the complete Implementation Prompt for the next work order. (4) Engineering Status — shows Current EWO, Next EWO, Engineering Queue, and Overall Platform Status. The section previously named "NEXT ENGINEERING PROMPT" is replaced by "IMPLEMENTATION PACKAGE". The package shall not reference any specific implementation engine by name in its structure. The "Implementation Engine:" field identifies which engine consumed the work; changing engines requires changing only this field. The entire package shall be produced as one copyable block so users press Copy once. Future implementation engines shall comply with this standard automatically.',
      'active',
      102,
      ARRAY['constitutional', 'completion-package', 'es-001b', 'ewo-014.11']::text[]
    );
  END IF;
END $$;
