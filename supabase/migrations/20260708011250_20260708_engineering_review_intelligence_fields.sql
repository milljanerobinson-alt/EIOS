/*
# Engineering Review Intelligence Engine — Schema Extension

## Purpose
Adds structured intelligence fields to ecc_engineering_reviews so the Engineering
Review Intelligence Engine can persist its modular analysis alongside every review.

## New Columns on ecc_engineering_reviews

### EIG Analysis
- eig_analysis (jsonb) — raw Engineering Intelligence Graph traversal result:
  entities_analysed, relationships_traversed, dependency_depth, connected_systems,
  impact_radius, graph_confidence, analysed_at

### Dependency Analysis
- dependency_analysis (jsonb) — resolved dependency map keyed by entity type,
  each entry: { id, name, type, relationship_type, nav_link? }[]

### Impact Analysis (structured)
- impact_analysis (jsonb) — structured impact: affected_systems[], affected_components[],
  affected_ui_pages[], affected_db_tables[], affected_api_endpoints[],
  affected_test_plans[], affected_releases[], complexity_score, effort_estimate,
  regression_risk, governance_impact, release_impact

### Risk Register
- risk_register (jsonb[]) — array of { description, likelihood, impact, severity,
  mitigation, owner, status }

### Traceability Chain
- traceability (jsonb) — full chain: mission → review → ewo → spec →
  implementation → test_plan → benchmark → audit → release,
  with missing_links[] flagged

### Implementation Plan
- implementation_plan (jsonb) — phases[], critical_path[], blocking_items[],
  prerequisites[], parallel_opportunities[]

### Release Readiness
- release_readiness (jsonb) — gates: ready_for_review, ready_for_po_approval,
  ready_for_implementation, ready_for_testing, ready_for_release;
  blockers[], missing_evidence[], outstanding_risks[]

### Testing Assessment
- testing_assessment (jsonb) — existing_plans[], missing_plans[],
  coverage_pct, regression_required, recommended_activities[]

### Documentation Assessment
- documentation_assessment (jsonb) — existing[], missing[], updates_required[],
  recommended_specs[]

### AI Reasoning
- ai_reasoning (jsonb) — sources_used{}, reasoning_summary, confidence_score,
  evidence_count

### Quality Score
- intelligence_quality_score (integer) — 0–100 composite quality score
- intelligence_quality_breakdown (jsonb) — per-dimension scores:
  traceability, dependency_coverage, impact_analysis, risk_assessment,
  governance_completeness, documentation_completeness, testing_completeness,
  ai_reasoning_quality, executive_clarity

### Executive Summary (structured)
- executive_brief (jsonb) — why_it_matters, business_value, engineering_value,
  risks[], effort_estimate, timeline, release_impact, recommendation, next_action

### Metadata
- intelligence_generated_at (timestamptz) — when intelligence was last computed
- intelligence_engine_version (text) — engine version for cache invalidation
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='eig_analysis') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN eig_analysis jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='dependency_analysis') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN dependency_analysis jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='impact_analysis') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN impact_analysis jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='risk_register') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN risk_register jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='traceability') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN traceability jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='implementation_plan') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN implementation_plan jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='release_readiness') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN release_readiness jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='testing_assessment') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN testing_assessment jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='documentation_assessment') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN documentation_assessment jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='ai_reasoning') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN ai_reasoning jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='intelligence_quality_score') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN intelligence_quality_score integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='intelligence_quality_breakdown') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN intelligence_quality_breakdown jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='executive_brief') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN executive_brief jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='intelligence_generated_at') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN intelligence_generated_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='intelligence_engine_version') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN intelligence_engine_version text;
  END IF;
END $$;
