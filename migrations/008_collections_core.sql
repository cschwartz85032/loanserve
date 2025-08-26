BEGIN;

-- daily snapshot of delinquency state
CREATE TABLE delinquency_snapshot (
  snap_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  earliest_unpaid_due_date DATE,
  unpaid_due_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  dpd INTEGER NOT NULL DEFAULT 0,
  bucket delinquency_bucket NOT NULL,
  schedule_plan_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loan_id, as_of_date)
);

-- fast lookup for current status
CREATE TABLE delinquency_current (
  loan_id INTEGER PRIMARY KEY REFERENCES loans(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  earliest_unpaid_due_date DATE,
  unpaid_due_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  dpd INTEGER NOT NULL DEFAULT 0,
  bucket delinquency_bucket NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- late fee rules extension
ALTER TABLE fee_templates
  ADD COLUMN IF NOT EXISTS late_fee_base TEXT DEFAULT 'scheduled_pi' CHECK (late_fee_base IN ('scheduled_pi','total_due','principal_only')),
  ADD COLUMN IF NOT EXISTS late_fee_cap_minor NUMERIC(20,0) DEFAULT NULL;

-- prevent duplicate assessments
CREATE TABLE late_fee_assessment (
  fee_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  period_due_date DATE NOT NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  amount_minor NUMERIC(20,0) NOT NULL CHECK (amount_minor > 0),
  template_id INTEGER NOT NULL REFERENCES fee_templates(id),
  event_id UUID NOT NULL,
  UNIQUE (loan_id, period_due_date)
);

-- collection case envelope
CREATE TABLE collection_case (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id INTEGER UNIQUE NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  status collection_case_status NOT NULL DEFAULT 'normal',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- repayment/deferral/forbearance plan
CREATE TABLE plan_header (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  type plan_type NOT NULL,
  status plan_status NOT NULL DEFAULT 'draft',
  starts_on DATE NOT NULL,
  ends_on DATE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active plan per loan
CREATE UNIQUE INDEX idx_plan_header_active ON plan_header(loan_id) WHERE status = 'active';

CREATE TABLE plan_schedule (
  plan_id UUID NOT NULL REFERENCES plan_header(plan_id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL CHECK (installment_no>=1),
  due_date DATE NOT NULL,
  amount_minor NUMERIC(20,0) NOT NULL CHECK (amount_minor>=0),
  PRIMARY KEY (plan_id, installment_no),
  UNIQUE (plan_id, due_date)
);

-- progress tracking per installment
CREATE TABLE plan_progress (
  plan_id UUID NOT NULL REFERENCES plan_header(plan_id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL,
  due_date DATE NOT NULL,
  paid_minor NUMERIC(20,0) NOT NULL DEFAULT 0,
  last_payment_event UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','paid','missed')),
  PRIMARY KEY (plan_id, installment_no)
);

-- legal partners (attorney firms)
CREATE TABLE attorney (
  attorney_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT
);

-- foreclosure case and milestones
CREATE TABLE foreclosure_case (
  fc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  case_opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attorney_id UUID REFERENCES attorney(attorney_id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  UNIQUE (loan_id)
);

CREATE TABLE foreclosure_event (
  fc_id UUID NOT NULL REFERENCES foreclosure_case(fc_id) ON DELETE CASCADE,
  milestone foreclosure_milestone NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (fc_id, milestone)
);

-- Create indexes for performance
CREATE INDEX idx_delinquency_snapshot_loan_date ON delinquency_snapshot(loan_id, as_of_date DESC);
CREATE INDEX idx_late_fee_assessment_loan ON late_fee_assessment(loan_id, period_due_date);
CREATE INDEX idx_plan_header_loan ON plan_header(loan_id, status);
CREATE INDEX idx_foreclosure_case_loan ON foreclosure_case(loan_id);

COMMIT;