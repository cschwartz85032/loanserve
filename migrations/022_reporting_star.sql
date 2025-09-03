-- Analytics Lakehouse: Star Schema for Reporting
BEGIN;

CREATE SCHEMA IF NOT EXISTS reporting;

-- === DIMENSION TABLES ===

-- Date dimension for time-based analysis
CREATE TABLE IF NOT EXISTS reporting.dim_date (
  d date PRIMARY KEY,
  y smallint NOT NULL,
  q smallint NOT NULL,
  m smallint NOT NULL,
  d_in_m smallint NOT NULL,
  dow smallint NOT NULL,
  is_busday boolean NOT NULL,
  week_of_year smallint NOT NULL,
  month_name text NOT NULL,
  quarter_name text NOT NULL
);

-- Populate date dimension for 30 years
INSERT INTO reporting.dim_date (d, y, q, m, d_in_m, dow, is_busday, week_of_year, month_name, quarter_name)
SELECT 
  d::date,
  EXTRACT(year FROM d)::smallint,
  EXTRACT(quarter FROM d)::smallint,
  EXTRACT(month FROM d)::smallint,
  EXTRACT(day FROM d)::smallint,
  EXTRACT(dow FROM d)::smallint,
  CASE WHEN EXTRACT(dow FROM d) IN (0,6) THEN false ELSE true END,
  EXTRACT(week FROM d)::smallint,
  TO_CHAR(d, 'Month'),
  'Q' || EXTRACT(quarter FROM d)::text
FROM generate_series(
  current_date - INTERVAL '30 years', 
  current_date + INTERVAL '5 years', 
  INTERVAL '1 day'
) s(d)
ON CONFLICT (d) DO NOTHING;

-- Loan dimension with key attributes
CREATE TABLE IF NOT EXISTS reporting.dim_loan (
  loan_sk bigserial PRIMARY KEY,
  loan_id uuid UNIQUE NOT NULL,
  loan_number text,
  borrower_name text,
  property_city text,
  property_state text,
  property_zip text,
  program_code text,
  investor_id uuid,
  loan_purpose text,
  property_type text,
  occupancy_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Investor dimension
CREATE TABLE IF NOT EXISTS reporting.dim_investor (
  investor_sk bigserial PRIMARY KEY,
  investor_id uuid UNIQUE NOT NULL,
  investor_name text,
  delivery_type text,
  active boolean,
  remittance_frequency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- User dimension for audit and activity tracking
CREATE TABLE IF NOT EXISTS reporting.dim_user (
  user_sk bigserial PRIMARY KEY,
  user_id uuid UNIQUE NOT NULL,
  username text,
  email text,
  role text,
  department text,
  active boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- === FACT TABLES ===

-- Transaction facts (payments, disbursements, adjustments)
CREATE TABLE IF NOT EXISTS reporting.fact_txn (
  txn_sk bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  user_id uuid,
  d date NOT NULL REFERENCES reporting.dim_date(d),
  type text NOT NULL,                      -- PAYMENT|DISBURSEMENT|ADJUSTMENT|FEE|BOARDING
  amount numeric(18,2) NOT NULL,
  alloc_principal numeric(18,2) NOT NULL DEFAULT 0,
  alloc_interest numeric(18,2) NOT NULL DEFAULT 0,
  alloc_escrow numeric(18,2) NOT NULL DEFAULT 0,
  alloc_fees numeric(18,2) NOT NULL DEFAULT 0,
  payment_method text,
  ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Quality control facts
CREATE TABLE IF NOT EXISTS reporting.fact_qc (
  qc_sk bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  rule_code text NOT NULL,
  rule_category text,
  severity text NOT NULL,                  -- critical|high|medium|low
  status text NOT NULL,                    -- open|resolved|waived
  resolution_notes text,
  assigned_user_id uuid,
  d date NOT NULL REFERENCES reporting.dim_date(d),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Export/delivery facts
CREATE TABLE IF NOT EXISTS reporting.fact_export (
  export_sk bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  template text NOT NULL,                  -- fannie|freddie|custom|mismo
  status text NOT NULL,                    -- queued|running|succeeded|failed
  file_size_bytes bigint,
  processing_time_ms integer,
  error_message text,
  d date NOT NULL REFERENCES reporting.dim_date(d),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Notification facts
CREATE TABLE IF NOT EXISTS reporting.fact_notify (
  notify_sk bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  loan_id uuid NULL,
  template_code text NOT NULL,
  channel text NOT NULL,                   -- email|sms|mail|portal
  status text NOT NULL,                    -- queued|rendered|sent|failed|suppressed
  delivery_time_ms integer,
  recipient_count integer DEFAULT 1,
  d date NOT NULL REFERENCES reporting.dim_date(d),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Servicing snapshot facts (daily loan balances and status)
CREATE TABLE IF NOT EXISTS reporting.fact_servicing (
  svc_sk bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  d date NOT NULL REFERENCES reporting.dim_date(d),
  upb numeric(18,2) NOT NULL,
  escrow_balance numeric(18,2) NOT NULL DEFAULT 0,
  delinquency_dpd integer NOT NULL DEFAULT 0,
  delinquency_bucket text NOT NULL DEFAULT '0+',
  payment_due numeric(18,2) DEFAULT 0,
  interest_rate numeric(8,5),
  maturity_date date,
  next_payment_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Investor remittance facts
CREATE TABLE IF NOT EXISTS reporting.fact_remit (
  remit_sk bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  investor_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  remit_period_start date NOT NULL,
  remit_period_end date NOT NULL,
  d date NOT NULL REFERENCES reporting.dim_date(d),
  principal numeric(18,2) NOT NULL DEFAULT 0,
  interest numeric(18,2) NOT NULL DEFAULT 0,
  escrow numeric(18,2) NOT NULL DEFAULT 0,
  svc_fee numeric(18,2) NOT NULL DEFAULT 0,
  strip_io numeric(18,2) NOT NULL DEFAULT 0,
  net numeric(18,2) NOT NULL DEFAULT 0,
  participation_pct numeric(7,4),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Document processing facts
CREATE TABLE IF NOT EXISTS reporting.fact_document (
  doc_sk bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  document_type text NOT NULL,
  processing_status text NOT NULL,         -- uploaded|processing|completed|failed
  ai_confidence_score numeric(5,4),
  extraction_count integer DEFAULT 0,
  validation_errors integer DEFAULT 0,
  processing_time_ms integer,
  file_size_bytes bigint,
  d date NOT NULL REFERENCES reporting.dim_date(d),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- === HELPER VIEWS (Source Data Adapters) ===

-- Loan dimension source view
CREATE OR REPLACE VIEW reporting.v_dim_loan_source AS
SELECT 
  lc.id AS loan_id,
  MAX(CASE WHEN key='LoanNumber' THEN normalized_value ELSE NULL END) AS loan_number,
  MAX(CASE WHEN key='BorrowerFullName' THEN normalized_value ELSE NULL END) AS borrower_name,
  MAX(CASE WHEN key='PropertyCity' THEN normalized_value ELSE NULL END) AS property_city,
  MAX(CASE WHEN key='PropertyState' THEN normalized_value ELSE NULL END) AS property_state,
  MAX(CASE WHEN key='PropertyZip' THEN normalized_value ELSE NULL END) AS property_zip,
  MAX(CASE WHEN key='ProgramCode' THEN normalized_value ELSE NULL END) AS program_code,
  MAX(CASE WHEN key='LoanPurpose' THEN normalized_value ELSE NULL END) AS loan_purpose,
  MAX(CASE WHEN key='PropertyType' THEN normalized_value ELSE NULL END) AS property_type,
  MAX(CASE WHEN key='OccupancyType' THEN normalized_value ELSE NULL END) AS occupancy_type,
  lc.assigned_investor_id AS investor_id
FROM loan_candidates lc
LEFT JOIN loan_datapoints ldp ON ldp.loan_id = lc.id
GROUP BY lc.id, lc.assigned_investor_id;

-- User dimension source view
CREATE OR REPLACE VIEW reporting.v_dim_user_source AS
SELECT 
  id::uuid AS user_id,
  username,
  email,
  'user' AS role,  -- Could be enhanced with actual role data
  'operations' AS department,  -- Could be enhanced with actual department data
  TRUE AS active
FROM users;

-- === ANALYTICAL VIEWS ===

-- Loan portfolio summary
CREATE OR REPLACE VIEW reporting.v_portfolio_summary AS
SELECT 
  dl.loan_number,
  dl.borrower_name,
  dl.property_state,
  dl.program_code,
  di.investor_name,
  fs.upb,
  fs.escrow_balance,
  fs.delinquency_bucket,
  fs.d AS snapshot_date
FROM reporting.fact_servicing fs
JOIN reporting.dim_loan dl ON dl.loan_id = fs.loan_id
LEFT JOIN reporting.dim_investor di ON di.investor_id = dl.investor_id
WHERE fs.d = (SELECT MAX(d) FROM reporting.fact_servicing WHERE loan_id = fs.loan_id);

-- Monthly transaction summary
CREATE OR REPLACE VIEW reporting.v_monthly_activity AS
SELECT 
  dd.y AS year,
  dd.m AS month,
  dd.month_name,
  ft.type AS transaction_type,
  COUNT(*) AS transaction_count,
  SUM(ft.amount) AS total_amount,
  SUM(ft.alloc_principal) AS total_principal,
  SUM(ft.alloc_interest) AS total_interest,
  SUM(ft.alloc_escrow) AS total_escrow,
  SUM(ft.alloc_fees) AS total_fees
FROM reporting.fact_txn ft
JOIN reporting.dim_date dd ON dd.d = ft.d
GROUP BY dd.y, dd.m, dd.month_name, ft.type
ORDER BY dd.y DESC, dd.m DESC, ft.type;

-- QC performance dashboard
CREATE OR REPLACE VIEW reporting.v_qc_dashboard AS
SELECT 
  dd.y AS year,
  dd.m AS month,
  fq.severity,
  fq.status,
  COUNT(*) AS defect_count,
  COUNT(*) FILTER (WHERE fq.status = 'resolved') AS resolved_count,
  COUNT(*) FILTER (WHERE fq.status = 'open') AS open_count,
  ROUND(
    COUNT(*) FILTER (WHERE fq.status = 'resolved')::numeric / 
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS resolution_rate_pct
FROM reporting.fact_qc fq
JOIN reporting.dim_date dd ON dd.d = fq.d
GROUP BY dd.y, dd.m, fq.severity, fq.status
ORDER BY dd.y DESC, dd.m DESC, fq.severity;

-- Investor remittance summary
CREATE OR REPLACE VIEW reporting.v_remittance_summary AS
SELECT 
  di.investor_name,
  dd.y AS year,
  dd.m AS month,
  COUNT(DISTINCT fr.loan_id) AS loan_count,
  SUM(fr.principal) AS total_principal,
  SUM(fr.interest) AS total_interest,
  SUM(fr.escrow) AS total_escrow,
  SUM(fr.svc_fee) AS total_svc_fee,
  SUM(fr.net) AS total_net_remittance
FROM reporting.fact_remit fr
JOIN reporting.dim_date dd ON dd.d = fr.d
JOIN reporting.dim_investor di ON di.investor_id = fr.investor_id
GROUP BY di.investor_name, dd.y, dd.m
ORDER BY dd.y DESC, dd.m DESC, di.investor_name;

-- === INDEXES FOR PERFORMANCE ===

-- Fact table indexes
CREATE INDEX IF NOT EXISTS idx_fact_txn_date_loan ON reporting.fact_txn(d, loan_id);
CREATE INDEX IF NOT EXISTS idx_fact_txn_type ON reporting.fact_txn(type);
CREATE INDEX IF NOT EXISTS idx_fact_qc_status_severity ON reporting.fact_qc(status, severity);
CREATE INDEX IF NOT EXISTS idx_fact_servicing_date_loan ON reporting.fact_servicing(d, loan_id);
CREATE INDEX IF NOT EXISTS idx_fact_remit_investor_date ON reporting.fact_remit(investor_id, d);
CREATE INDEX IF NOT EXISTS idx_fact_export_status ON reporting.fact_export(status);
CREATE INDEX IF NOT EXISTS idx_fact_notify_channel_status ON reporting.fact_notify(channel, status);
CREATE INDEX IF NOT EXISTS idx_fact_document_type_status ON reporting.fact_document(document_type, processing_status);

-- Dimension table indexes
CREATE INDEX IF NOT EXISTS idx_dim_loan_investor ON reporting.dim_loan(investor_id);
CREATE INDEX IF NOT EXISTS idx_dim_loan_program ON reporting.dim_loan(program_code);
CREATE INDEX IF NOT EXISTS idx_dim_investor_active ON reporting.dim_investor(active);

COMMIT;