-- Step 23: Advanced Analytics Lakehouse & Business Intelligence
-- Comprehensive analytics warehouse with dimensional modeling for mortgage servicing

BEGIN;

-- Dimension Tables for Analytics Warehouse

-- Time Dimension for analytics queries
CREATE TABLE IF NOT EXISTS dim_time (
  time_key integer PRIMARY KEY,
  full_date date NOT NULL,
  year integer NOT NULL,
  quarter integer NOT NULL,
  month integer NOT NULL,
  month_name text NOT NULL,
  day integer NOT NULL,
  day_of_week integer NOT NULL,
  day_name text NOT NULL,
  week_of_year integer NOT NULL,
  is_weekend boolean NOT NULL DEFAULT false,
  is_holiday boolean NOT NULL DEFAULT false,
  business_day boolean NOT NULL DEFAULT true,
  fiscal_year integer NOT NULL,
  fiscal_quarter integer NOT NULL
);

-- Loan Dimension for analytics
CREATE TABLE IF NOT EXISTS dim_loan (
  loan_key uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL,
  loan_number text NOT NULL,
  product_type text NOT NULL,
  loan_purpose text,
  occupancy_type text,
  property_type text,
  geographic_region text,
  origination_channel text,
  risk_grade text,
  investor_name text,
  servicer_name text,
  current_status text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

-- Borrower Dimension for analytics
CREATE TABLE IF NOT EXISTS dim_borrower (
  borrower_key uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id uuid NOT NULL,
  credit_score_bucket text,
  income_bracket text,
  employment_type text,
  demographic_segment text,
  geographic_location text,
  customer_tenure_years integer,
  risk_profile text,
  communication_preference text,
  is_active boolean NOT NULL DEFAULT true,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

-- Service Performance Dimension
CREATE TABLE IF NOT EXISTS dim_service_performance (
  performance_key uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL,
  performance_tier text NOT NULL,
  sla_category text NOT NULL,
  quality_score decimal(5,2),
  automation_level text,
  cost_center text,
  is_active boolean NOT NULL DEFAULT true,
  created_date timestamptz NOT NULL DEFAULT now()
);

-- Fact Tables for Analytics

-- Loan Performance Fact Table
CREATE TABLE IF NOT EXISTS fact_loan_performance (
  fact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_key integer REFERENCES dim_time(time_key),
  loan_key uuid REFERENCES dim_loan(loan_key),
  borrower_key uuid REFERENCES dim_borrower(borrower_key),
  
  -- Financial Metrics (in minor units - cents)
  outstanding_balance_cents bigint NOT NULL,
  scheduled_payment_cents bigint NOT NULL,
  actual_payment_cents bigint NOT NULL,
  interest_payment_cents bigint NOT NULL,
  principal_payment_cents bigint NOT NULL,
  escrow_payment_cents bigint NOT NULL,
  late_fees_cents bigint NOT NULL DEFAULT 0,
  
  -- Performance Metrics
  days_delinquent integer NOT NULL DEFAULT 0,
  payment_status text NOT NULL,
  delinquency_bucket text,
  modification_status text,
  foreclosure_status text,
  
  -- Behavioral Metrics
  payment_method text,
  payment_timing_category text,
  contact_attempts integer NOT NULL DEFAULT 0,
  successful_contacts integer NOT NULL DEFAULT 0,
  
  -- Risk Metrics
  current_ltv decimal(5,4),
  payment_shock decimal(5,4),
  stress_test_result text,
  default_probability decimal(5,4),
  
  created_timestamp timestamptz NOT NULL DEFAULT now()
);

-- Service Operations Fact Table
CREATE TABLE IF NOT EXISTS fact_service_operations (
  fact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_key integer REFERENCES dim_time(time_key),
  loan_key uuid REFERENCES dim_loan(loan_key),
  performance_key uuid REFERENCES dim_service_performance(performance_key),
  
  -- Volume Metrics
  calls_received integer NOT NULL DEFAULT 0,
  calls_handled integer NOT NULL DEFAULT 0,
  emails_processed integer NOT NULL DEFAULT 0,
  documents_processed integer NOT NULL DEFAULT 0,
  payments_processed integer NOT NULL DEFAULT 0,
  
  -- Quality Metrics
  first_call_resolution_rate decimal(5,4),
  average_handle_time_seconds integer,
  customer_satisfaction_score decimal(3,2),
  error_rate decimal(5,4),
  sla_compliance_rate decimal(5,4),
  
  -- Cost Metrics (in minor units - cents)
  operational_cost_cents bigint NOT NULL DEFAULT 0,
  technology_cost_cents bigint NOT NULL DEFAULT 0,
  compliance_cost_cents bigint NOT NULL DEFAULT 0,
  third_party_cost_cents bigint NOT NULL DEFAULT 0,
  
  -- Efficiency Metrics
  automation_rate decimal(5,4),
  straight_through_processing_rate decimal(5,4),
  exception_rate decimal(5,4),
  rework_rate decimal(5,4),
  
  created_timestamp timestamptz NOT NULL DEFAULT now()
);

-- AI/ML Performance Fact Table
CREATE TABLE IF NOT EXISTS fact_ai_performance (
  fact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_key integer REFERENCES dim_time(time_key),
  
  -- AI Model Metrics
  model_name text NOT NULL,
  model_version text NOT NULL,
  operation_type text NOT NULL,
  
  -- Performance Metrics
  request_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  average_latency_ms integer NOT NULL,
  p95_latency_ms integer NOT NULL,
  p99_latency_ms integer NOT NULL,
  
  -- Quality Metrics
  average_confidence decimal(5,4),
  accuracy_rate decimal(5,4),
  precision_rate decimal(5,4),
  recall_rate decimal(5,4),
  f1_score decimal(5,4),
  
  -- Business Impact Metrics
  documents_processed integer NOT NULL DEFAULT 0,
  straight_through_rate decimal(5,4),
  manual_review_rate decimal(5,4),
  cost_savings_cents bigint NOT NULL DEFAULT 0,
  time_savings_minutes integer NOT NULL DEFAULT 0,
  
  -- Resource Metrics
  compute_cost_cents bigint NOT NULL DEFAULT 0,
  storage_cost_cents bigint NOT NULL DEFAULT 0,
  api_cost_cents bigint NOT NULL DEFAULT 0,
  
  created_timestamp timestamptz NOT NULL DEFAULT now()
);

-- Financial Performance Fact Table
CREATE TABLE IF NOT EXISTS fact_financial_performance (
  fact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_key integer REFERENCES dim_time(time_key),
  loan_key uuid REFERENCES dim_loan(loan_key),
  
  -- Revenue Metrics (in minor units - cents)
  servicing_fee_income_cents bigint NOT NULL DEFAULT 0,
  ancillary_income_cents bigint NOT NULL DEFAULT 0,
  late_fee_income_cents bigint NOT NULL DEFAULT 0,
  modification_fee_income_cents bigint NOT NULL DEFAULT 0,
  float_income_cents bigint NOT NULL DEFAULT 0,
  
  -- Cost Metrics (in minor units - cents)
  operational_expense_cents bigint NOT NULL DEFAULT 0,
  technology_expense_cents bigint NOT NULL DEFAULT 0,
  compliance_expense_cents bigint NOT NULL DEFAULT 0,
  loss_mitigation_expense_cents bigint NOT NULL DEFAULT 0,
  
  -- Portfolio Metrics
  portfolio_balance_cents bigint NOT NULL,
  weighted_average_coupon decimal(5,4),
  weighted_average_maturity integer,
  delinquency_rate decimal(5,4),
  default_rate decimal(5,4),
  
  -- Risk Metrics
  credit_loss_reserve_cents bigint NOT NULL DEFAULT 0,
  operational_risk_reserve_cents bigint NOT NULL DEFAULT 0,
  regulatory_capital_cents bigint NOT NULL DEFAULT 0,
  
  created_timestamp timestamptz NOT NULL DEFAULT now()
);

-- Predictive Analytics Results Table
CREATE TABLE IF NOT EXISTS fact_predictive_analytics (
  fact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_key integer REFERENCES dim_time(time_key),
  loan_key uuid REFERENCES dim_loan(loan_key),
  borrower_key uuid REFERENCES dim_borrower(borrower_key),
  
  -- Prediction Details
  model_name text NOT NULL,
  prediction_type text NOT NULL, -- 'default_risk', 'prepayment', 'delinquency', 'modification_success'
  prediction_horizon_days integer NOT NULL,
  prediction_confidence decimal(5,4) NOT NULL,
  
  -- Risk Predictions
  default_probability decimal(5,4),
  delinquency_probability decimal(5,4),
  prepayment_probability decimal(5,4),
  modification_success_probability decimal(5,4),
  
  -- Financial Predictions (in minor units - cents)
  predicted_loss_amount_cents bigint,
  predicted_recovery_amount_cents bigint,
  predicted_timeline_days integer,
  
  -- Action Recommendations
  recommended_action text,
  action_priority integer,
  estimated_benefit_cents bigint,
  implementation_cost_cents bigint,
  
  -- Model Performance
  model_accuracy decimal(5,4),
  model_drift_score decimal(5,4),
  feature_importance jsonb,
  
  created_timestamp timestamptz NOT NULL DEFAULT now(),
  prediction_date timestamptz NOT NULL DEFAULT now()
);

-- Indexes for Analytics Performance
CREATE INDEX IF NOT EXISTS idx_fact_loan_performance_time_loan 
ON fact_loan_performance (time_key, loan_key);

CREATE INDEX IF NOT EXISTS idx_fact_loan_performance_status_date 
ON fact_loan_performance (payment_status, created_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_fact_service_operations_time_performance 
ON fact_service_operations (time_key, performance_key);

CREATE INDEX IF NOT EXISTS idx_fact_ai_performance_model_time 
ON fact_ai_performance (model_name, time_key);

CREATE INDEX IF NOT EXISTS idx_fact_financial_performance_time_loan 
ON fact_financial_performance (time_key, loan_key);

CREATE INDEX IF NOT EXISTS idx_fact_predictive_analytics_model_date 
ON fact_predictive_analytics (model_name, prediction_date DESC);

-- Materialized Views for Common Analytics Queries

-- Daily Portfolio Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_portfolio_summary AS
SELECT 
  dt.full_date,
  COUNT(DISTINCT flp.loan_key) as total_loans,
  SUM(flp.outstanding_balance_cents) / 100.0 as total_balance,
  AVG(flp.outstanding_balance_cents) / 100.0 as average_balance,
  COUNT(*) FILTER (WHERE flp.days_delinquent > 0) as delinquent_loans,
  COUNT(*) FILTER (WHERE flp.days_delinquent > 30) as seriously_delinquent_loans,
  COUNT(*) FILTER (WHERE flp.days_delinquent > 90) as severely_delinquent_loans,
  AVG(flp.days_delinquent) as average_delinquency,
  SUM(flp.actual_payment_cents) / 100.0 as total_payments_received,
  SUM(flp.scheduled_payment_cents) / 100.0 as total_payments_scheduled
FROM fact_loan_performance flp
JOIN dim_time dt ON flp.time_key = dt.time_key
GROUP BY dt.full_date;

-- Monthly Service Performance Summary  
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_service_performance AS
SELECT 
  dt.year,
  dt.month,
  dt.month_name,
  AVG(fso.first_call_resolution_rate) as avg_fcr_rate,
  AVG(fso.customer_satisfaction_score) as avg_csat_score,
  AVG(fso.sla_compliance_rate) as avg_sla_compliance,
  SUM(fso.calls_received) as total_calls_received,
  SUM(fso.calls_handled) as total_calls_handled,
  SUM(fso.emails_processed) as total_emails_processed,
  SUM(fso.documents_processed) as total_documents_processed,
  AVG(fso.automation_rate) as avg_automation_rate
FROM fact_service_operations fso
JOIN dim_time dt ON fso.time_key = dt.time_key
GROUP BY dt.year, dt.month, dt.month_name;

COMMIT;