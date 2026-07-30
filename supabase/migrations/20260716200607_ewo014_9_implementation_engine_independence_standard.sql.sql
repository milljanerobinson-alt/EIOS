/*
# EWO-014.9 — Implementation Engine Independence Standard (ES-001A)

## Purpose

Introduces ES-001A as a constitutional engineering standard. Engineering
Standards shall describe required engineering behaviour, not behaviour for a
specific implementation engine. This ensures every standard remains valid
regardless of whether implementation is performed by Bolt, ATD Execution
Engine, OpenAI, Claude, Gemini, or future implementation engines.

This migration also records the governance decision in the constitutional
documents table as a constitutional amendment (CONST-001-AMD-005).

## Changes

### 1. Seeds ES-001A in ecc_engineering_standards
- Category: Architecture
- Title: ES-001A: Implementation Engine Independence
- Tags: constitutional, engine-independence, es-001a, ewo-014.9

### 2. Seeds CONST-001-AMD-005 in constitutional_documents
- 4 structured sections: executive_summary, principles, scope, governance_decision

## Security
- No new tables — uses existing ecc_engineering_standards and constitutional_documents.
- No RLS changes.

## Important Notes
1. Existing Engineering Standards remain valid — no mass rewrite required.
2. When a standard is amended, superseded, versioned, or reviewed, its wording
   shall be upgraded to implementation-engine-neutral language.
3. The selected Implementation Engine is responsible for complying with all
   applicable Engineering Standards prior to, during, and after implementation.
*/

-- ═══════════════════════════════════════════════════════════════════════
-- 1. SEED ES-001A IN ENGINEERING STANDARDS
-- ═══════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ecc_engineering_standards WHERE title = 'ES-001A: Implementation Engine Independence') THEN
    INSERT INTO ecc_engineering_standards (version_introduced, category, title, body, status, sort_order, tags)
    VALUES (
      'ES-001A',
      'Architecture',
      'ES-001A: Implementation Engine Independence',
      'Engineering Standards shall describe required engineering behaviour. Engineering Standards shall not reference specific implementation platforms unless the behaviour is inherently platform-specific. The selected Implementation Engine is responsible for complying with all applicable Engineering Standards prior to implementation, during implementation, and during validation. Engineering Standards are platform governance. Implementation Engines consume the standards. They are not the subject of the standards. Existing Engineering Standards remain valid. No mass rewrite is required. When an Engineering Standard is amended, superseded, versioned, or reviewed, its wording shall be upgraded to implementation-engine-neutral language. All future engineering prompts shall use implementation-engine-neutral terminology (e.g. "The Implementation Engine shall..." rather than naming a specific engine) unless the prompt genuinely describes engine-specific functionality.',
      'active',
      101,
      ARRAY['constitutional', 'engine-independence', 'es-001a', 'ewo-014.9']::text[]
    );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. SEED CONSTITUTIONAL AMENDMENT CONST-001-AMD-005
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_const_001_id uuid;
BEGIN
  SELECT id INTO v_const_001_id FROM constitutional_documents WHERE document_ref = 'CONST-001' LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM constitutional_documents WHERE document_ref = 'CONST-001-AMD-005') THEN
    INSERT INTO constitutional_documents (
      id, document_ref, title, document_type, version, status,
      programme, effective_from, supersedes_id, authored_by, sections, metadata
    ) VALUES (
      gen_random_uuid(),
      'CONST-001-AMD-005',
      'Implementation Engine Independence Standard (ES-001A)',
      'standard',
      '1.0',
      'active',
      'EIOS Platform',
      now(),
      v_const_001_id,
      'EWO-014.9',
      jsonb_build_object(
        'executive_summary', jsonb_build_object(
          'order', 1, 'title', 'Executive Summary',
          'content', 'Engineering Standards define engineering behaviour. They shall not define behaviour for a specific implementation engine. This ensures every Engineering Standard remains valid regardless of whether implementation is performed by Bolt, ATD Execution Engine, OpenAI, Claude, Gemini, or future implementation engines without requiring future rewrites.',
          'key_principles', jsonb_build_array(
            'Engineering Standards shall describe required engineering behaviour',
            'Engineering Standards shall not reference specific implementation platforms unless the behaviour is inherently platform-specific',
            'The selected Implementation Engine is responsible for complying with all applicable Engineering Standards prior to implementation, during implementation, and during validation',
            'Engineering Standards are platform governance — Implementation Engines consume the standards, they are not the subject of the standards'
          )
        ),
        'principles', jsonb_build_object(
          'order', 2, 'title', 'Principles',
          'content', 'The standard establishes the separation between engineering governance and implementation execution.',
          'rules', jsonb_build_array(
            'Engineering Standards shall use implementation-engine-neutral terminology',
            'Future engineering prompts shall use neutral terms such as "The Implementation Engine shall..." rather than naming a specific engine',
            'Prompts may reference a specific engine only when genuinely describing engine-specific functionality',
            'The Implementation Engine is responsible for complying with all applicable Engineering Standards'
          )
        ),
        'scope', jsonb_build_object(
          'order', 3, 'title', 'Scope',
          'content', 'This standard applies to all Engineering Standards, engineering prompt templates, and prompt generation within EIOS.',
          'applies_to', jsonb_build_array('Engineering Standards', 'Master Prompt Templates', 'Prompt Generation', 'Engineering Governance Documentation'),
          'backward_compatibility', 'Existing Engineering Standards remain valid. No mass rewrite is required. When a standard is amended, superseded, versioned, or reviewed, its wording shall be upgraded to implementation-engine-neutral language.'
        ),
        'governance_decision', jsonb_build_object(
          'order', 4, 'title', 'Governance Decision',
          'content', 'Recorded within Engineering Governance. Engineering Standards are platform governance. Implementation Engines consume the standards. They are not the subject of the standards.',
          'decision', 'Engineering Standards shall transition from implementation-specific language to implementation-engine-neutral language',
          'reason', 'Engineering Standards are platform governance. Implementation Engines consume the standards. They are not the subject of the standards.',
          'ewo_ref', 'EWO-014.9'
        )
      ),
      jsonb_build_object(
        'ewo_ref', 'EWO-014.9',
        'total_sections', 4,
        'classification', 'Constitutional Standard',
        'amendment_procedure', 'Constitutional amendment requiring EWO registration',
        'governed_products', jsonb_build_array('EIOS Platform', 'Engineering Control Centre', 'ATD Workspace'),
        'supersedes_standard', 'None (new standard)'
      )
    );
  END IF;
END $$;
