
-- Subscription plans lookup table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  badge text,
  platform_fee_cents integer NOT NULL,
  included_assessments integer NOT NULL DEFAULT 50,
  additional_assessment_cents integer NOT NULL DEFAULT 150,
  features jsonb NOT NULL DEFAULT '[]',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO subscription_plans (id, name, description, badge, platform_fee_cents, included_assessments, additional_assessment_cents, features, sort_order) VALUES
('lln_only', 'LLN Only', 'Language, Literacy & Numeracy assessments', null, 7900, 50, 150,
  '["Unlimited admin users","Unlimited trainers","Unlimited campuses","ACSF mapped assessments","LLN reports","Support plans","AI-generated reports","Audit-ready evidence","50 completed learner assessments/month"]'::jsonb, 1),
('digital_only', 'Digital Only', 'Digital Capability assessments', null, 7900, 50, 150,
  '["Unlimited admin users","Unlimited trainers","Unlimited campuses","Digital capability assessments","Reports","Support plans","AI-generated reports","Audit-ready evidence","50 completed learner assessments/month"]'::jsonb, 2),
('lln_digital', 'LLN + Digital', 'Complete LLN and Digital Capability suite', 'Most Popular', 12900, 50, 150,
  '["Everything in LLN Only","Everything in Digital Only","Learner deduplication — same learner counts once across both assessments","50 completed learner assessments/month"]'::jsonb, 3)
ON CONFLICT (id) DO NOTHING;

-- Subscriptions (one per organisation/deployment)
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text REFERENCES subscription_plans(id),
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing','active','past_due','paused','cancelled','incomplete')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_payment_method_id text,
  payment_method_last4 text,
  payment_method_brand text,
  payment_method_exp_month integer,
  payment_method_exp_year integer,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  paused_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Billing usage periods (one row per subscription billing cycle)
CREATE TABLE IF NOT EXISTS billing_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  completed_learners integer NOT NULL DEFAULT 0,
  notified_75 boolean NOT NULL DEFAULT false,
  notified_90 boolean NOT NULL DEFAULT false,
  notified_100 boolean NOT NULL DEFAULT false,
  last_notification_milestone integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, period_start)
);

-- Billable learners (deduplication within a billing period)
CREATE TABLE IF NOT EXISTS billable_learners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id uuid NOT NULL REFERENCES billing_usage(id) ON DELETE CASCADE,
  invitation_id uuid,
  learner_email text NOT NULL,
  learner_name text,
  completed_lln boolean NOT NULL DEFAULT false,
  completed_digital boolean NOT NULL DEFAULT false,
  first_completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(billing_period_id, learner_email)
);

-- Billing events (Stripe webhook audit log + payment history)
CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE,
  event_type text NOT NULL,
  amount_cents integer,
  currency text DEFAULT 'aud',
  description text,
  invoice_url text,
  invoice_pdf text,
  payload jsonb,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE billable_learners ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Plans are readable by anyone (needed for public pricing page)
CREATE POLICY "plans_select_auth" ON subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans_select_anon" ON subscription_plans FOR SELECT TO anon USING (true);

-- Subscriptions: admin read/write
CREATE POLICY "sub_select" ON subscriptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "sub_insert" ON subscriptions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "sub_update" ON subscriptions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "sub_delete" ON subscriptions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Billing usage: admin read/write
CREATE POLICY "usage_select" ON billing_usage FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "usage_insert" ON billing_usage FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "usage_update" ON billing_usage FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "usage_delete" ON billing_usage FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Billable learners: admin read/write
CREATE POLICY "bl_select" ON billable_learners FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "bl_insert" ON billable_learners FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "bl_update" ON billable_learners FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "bl_delete" ON billable_learners FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Billing events: admin read only (writes come from service role via webhooks)
CREATE POLICY "be_select" ON billing_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- updated_at trigger (reuse or create)
CREATE OR REPLACE FUNCTION update_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER billing_usage_updated_at BEFORE UPDATE ON billing_usage
  FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

-- Function: get or create current billing period for a subscription
CREATE OR REPLACE FUNCTION get_or_create_billing_period(p_subscription_id uuid)
RETURNS uuid AS $$
DECLARE
  v_period_id uuid;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_sub subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_period_start := COALESCE(v_sub.current_period_start, date_trunc('month', now() AT TIME ZONE 'UTC'));
  v_period_end   := COALESCE(v_sub.current_period_end,   date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month');

  SELECT id INTO v_period_id
  FROM billing_usage
  WHERE subscription_id = p_subscription_id AND period_start = v_period_start;

  IF v_period_id IS NULL THEN
    INSERT INTO billing_usage (subscription_id, period_start, period_end)
    VALUES (p_subscription_id, v_period_start, v_period_end)
    RETURNING id INTO v_period_id;
  END IF;

  RETURN v_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: record a billable learner completion (handles deduplication)
CREATE OR REPLACE FUNCTION record_billable_completion(
  p_invitation_id uuid,
  p_learner_email text,
  p_learner_name text,
  p_assessment_type text
) RETURNS void AS $$
DECLARE
  v_sub_id  uuid;
  v_period_id uuid;
  v_learner_exists boolean;
BEGIN
  SELECT id INTO v_sub_id
  FROM subscriptions
  WHERE status IN ('trialing', 'active', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub_id IS NULL THEN RETURN; END IF;

  v_period_id := get_or_create_billing_period(v_sub_id);
  IF v_period_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS(
    SELECT 1 FROM billable_learners
    WHERE billing_period_id = v_period_id AND learner_email = lower(p_learner_email)
  ) INTO v_learner_exists;

  IF v_learner_exists THEN
    UPDATE billable_learners SET
      completed_lln     = completed_lln     OR (p_assessment_type = 'lln'),
      completed_digital = completed_digital OR (p_assessment_type = 'digital')
    WHERE billing_period_id = v_period_id AND learner_email = lower(p_learner_email);
  ELSE
    INSERT INTO billable_learners
      (billing_period_id, invitation_id, learner_email, learner_name, completed_lln, completed_digital)
    VALUES (
      v_period_id,
      p_invitation_id,
      lower(p_learner_email),
      p_learner_name,
      p_assessment_type = 'lln',
      p_assessment_type = 'digital'
    );

    UPDATE billing_usage
    SET completed_learners = completed_learners + 1, updated_at = now()
    WHERE id = v_period_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fire billing logic when invitation_assessment is marked complete
CREATE OR REPLACE FUNCTION trigger_billing_on_assessment_complete()
RETURNS TRIGGER AS $$
DECLARE
  v_email text;
  v_name  text;
  v_type  text;
BEGIN
  IF NEW.individual_status = 'completed'
     AND (OLD.individual_status IS DISTINCT FROM 'completed') THEN

    SELECT ai.candidate_email, ai.candidate_name
    INTO v_email, v_name
    FROM assessment_invitations ai
    WHERE ai.id = NEW.invitation_id;

    SELECT a.type INTO v_type
    FROM assessments a
    WHERE a.id = NEW.assessment_id;

    IF v_email IS NOT NULL AND v_type IS NOT NULL THEN
      PERFORM record_billable_completion(NEW.invitation_id, v_email, v_name, v_type);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS billing_completion_trigger ON invitation_assessments;
CREATE TRIGGER billing_completion_trigger
  AFTER UPDATE ON invitation_assessments
  FOR EACH ROW EXECUTE FUNCTION trigger_billing_on_assessment_complete();
