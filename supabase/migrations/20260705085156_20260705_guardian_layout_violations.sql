-- Add layout violations tracking to Architecture Guardian reviews
ALTER TABLE architecture_guardian_reviews
  ADD COLUMN IF NOT EXISTS layout_violations jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS layout_severity text CHECK (layout_severity IN ('none', 'low', 'medium', 'high', 'critical')) DEFAULT 'none';
