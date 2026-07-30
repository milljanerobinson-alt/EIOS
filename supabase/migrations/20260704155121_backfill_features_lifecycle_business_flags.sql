
-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: lifecycle_stage, release versions, and release dates for all features
-- All implemented features are 'live' (the platform is in production use)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE ecc_product_features SET
  lifecycle_stage       = 'live',
  first_release_version = release_version,
  current_release_version = release_version,
  first_release_date    = implementation_date,
  deployment_date       = implementation_date
WHERE status = 'implemented';

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: business_value from priority
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE ecc_product_features SET business_value =
  CASE priority
    WHEN 'critical' THEN 'critical'
    WHEN 'high'     THEN 'high'
    WHEN 'medium'   THEN 'medium'
    ELSE 'low'
  END;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: technical_complexity
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE ecc_product_features SET technical_complexity = 'medium'; -- safe default
UPDATE ecc_product_features SET technical_complexity = 'very_high'
  WHERE feature_id IN ('FEAT-032','FEAT-036','FEAT-070','FEAT-071','FEAT-073','FEAT-090','FEAT-101','FEAT-130','FEAT-132','FEAT-143');
UPDATE ecc_product_features SET technical_complexity = 'high'
  WHERE feature_id IN ('FEAT-010','FEAT-013','FEAT-017','FEAT-040','FEAT-042','FEAT-043','FEAT-072','FEAT-074','FEAT-080','FEAT-100','FEAT-150','FEAT-151');
UPDATE ecc_product_features SET technical_complexity = 'low'
  WHERE feature_id IN ('FEAT-006','FEAT-076','FEAT-081','FEAT-082','FEAT-119','FEAT-120','FEAT-121','FEAT-122','FEAT-123','FEAT-124','FEAT-125','FEAT-126');

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: compliance_critical and audit_critical flags
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE ecc_product_features SET compliance_critical = true
  WHERE category IN ('Compliance', 'Authentication')
     OR feature_id IN (
       'FEAT-005', -- RBAC
       'FEAT-015', -- Declaration Screen
       'FEAT-016', -- Abandonment Tracking
       'FEAT-019', -- Assessment Version History
       'FEAT-020', -- Assessment Validation
       'FEAT-037', -- ACSF Evidence Page
       'FEAT-044', -- Course Recommendation
       'FEAT-045', -- Trainer Override
       'FEAT-050', -- AI Support Plan Generation
       'FEAT-060', -- Intervention Case Management
       'FEAT-073', -- Axcelerate Write-Back Queue
       'FEAT-101', -- Complete Audit Trail
       'FEAT-151'  -- RLS
     );

UPDATE ecc_product_features SET audit_critical = true
  WHERE feature_id IN (
    'FEAT-005','FEAT-015','FEAT-016','FEAT-019',
    'FEAT-044','FEAT-045','FEAT-050','FEAT-060',
    'FEAT-073','FEAT-101'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: operational_risk
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE ecc_product_features SET operational_risk = 'low'; -- default
UPDATE ecc_product_features SET operational_risk = 'critical'
  WHERE feature_id IN ('FEAT-101','FEAT-151','FEAT-003','FEAT-150');
UPDATE ecc_product_features SET operational_risk = 'high'
  WHERE feature_id IN ('FEAT-073','FEAT-070','FEAT-080','FEAT-090','FEAT-040','FEAT-043');

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: customer_impact summaries
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE ecc_product_features SET customer_impact = 'Core assessment workflow — if broken, RTO cannot assess candidates'
  WHERE feature_id IN ('FEAT-010','FEAT-013','FEAT-014','FEAT-040');
UPDATE ecc_product_features SET customer_impact = 'Compliance evidence — if broken, RTO may fail ASQA audit'
  WHERE compliance_critical = true AND customer_impact IS NULL;
UPDATE ecc_product_features SET customer_impact = 'Administrative efficiency — reduces manual work for trainers'
  WHERE feature_id IN ('FEAT-017','FEAT-042','FEAT-050','FEAT-070','FEAT-071');
UPDATE ecc_product_features SET customer_impact = 'Revenue — if broken, RTO cannot subscribe or pay'
  WHERE feature_id IN ('FEAT-090','FEAT-091');

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: review_frequency
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE ecc_product_features SET review_frequency =
  CASE
    WHEN compliance_critical THEN 'quarterly'
    WHEN operational_risk IN ('critical','high') THEN 'monthly'
    ELSE 'biannual'
  END;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: regression_required for high-risk features
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE ecc_product_features SET regression_required = true
  WHERE priority IN ('critical','high')
     OR compliance_critical = true
     OR operational_risk IN ('critical','high');
