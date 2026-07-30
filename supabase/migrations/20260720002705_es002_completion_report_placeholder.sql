-- ES-002 completion report placeholder (title is NOT NULL)

INSERT INTO ewo_completion_reports (
  ewo_ref, ewo_id, title, executive_summary, build_result, created_at
)
SELECT
  'EWO-018',
  e.id,
  'EWO-018 — Canonical Engineering Governance Bootstrap Standard (ES-002)',
  'Pending implementation. ES-002 standard to be seeded into ecc_engineering_standards and enforced via governance bootstrap checks.',
  'pending',
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-018'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_completion_reports r WHERE r.ewo_ref = 'EWO-018'
  );
