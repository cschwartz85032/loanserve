-- Manual test data for Step 15 Monthly Servicing Cycle
-- This creates a test servicing account and schedule to verify the cycle works

-- Insert test servicing account
INSERT INTO svc_accounts (
  tenant_id, 
  loan_id, 
  state, 
  open_date, 
  first_payment_date, 
  maturity_date, 
  note_amount, 
  interest_rate, 
  amort_term_months, 
  payment_frequency, 
  pmt_principal_interest, 
  grace_days,
  day_count,
  escrow_required,
  activated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001', -- tenant_id
  17, -- Use first active loan
  'Active',
  '2024-01-01',
  '2024-02-01', 
  '2054-01-01',
  450000.00,
  0.0675, -- 6.75%
  360, -- 30 year
  'Monthly',
  2847.15, -- P&I payment
  15, -- grace days
  'Actual/360',
  false,
  NOW()
) ON CONFLICT (loan_id) DO NOTHING;

-- Insert test payment schedule (current installment)
INSERT INTO svc_schedule (
  tenant_id,
  loan_id,
  installment_no,
  due_date,
  principal_due,
  interest_due,
  escrow_due,
  total_due,
  principal_balance_after,
  paid,
  paid_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  17,
  13, -- 13th payment (Jan 2025)
  '2025-01-01', -- Past due for testing late fees
  2343.90,
  503.25,
  0.00,
  2847.15,
  447656.10, -- Balance after payment
  false,
  NULL
) ON CONFLICT (loan_id, installment_no) DO NOTHING;

-- Insert another installment (current month)
INSERT INTO svc_schedule (
  tenant_id,
  loan_id,
  installment_no,
  due_date,
  principal_due,
  interest_due,
  escrow_due,
  total_due,
  principal_balance_after,
  paid,
  paid_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  17,
  14, -- 14th payment (Feb 2025) 
  '2025-02-01', -- Current month
  2357.03,
  490.12,
  0.00,
  2847.15,
  445299.07, -- Balance after payment 
  false,
  NULL
) ON CONFLICT (loan_id, installment_no) DO NOTHING;