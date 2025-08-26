BEGIN;

-- Create delinquency_bucket if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delinquency_bucket') THEN
    CREATE TYPE delinquency_bucket AS ENUM ('current','dpd_1_29','dpd_30_59','dpd_60_89','dpd_90_plus');
  END IF;
END $$;

-- Create collection_case_status if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collection_case_status') THEN
    CREATE TYPE collection_case_status AS ENUM ('normal','soft','hard','pre_foreclosure','foreclosure','bankruptcy','closed');
  END IF;
END $$;

-- Create plan_type if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_type') THEN
    CREATE TYPE plan_type AS ENUM ('repayment','deferral','forbearance','trial_mod');
  END IF;
END $$;

-- Create plan_status if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_status') THEN
    CREATE TYPE plan_status AS ENUM ('draft','active','completed','defaulted','canceled');
  END IF;
END $$;

-- Create foreclosure_milestone if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'foreclosure_milestone') THEN
    CREATE TYPE foreclosure_milestone AS ENUM (
      'breach_letter_sent',
      'referral_to_attorney',
      'notice_of_default_recorded',
      'lis_pendens_filed',
      'sale_scheduled',
      'sale_postponed',
      'sale_completed',
      'reinstated',
      'redeemed',
      'eviction_started',
      'eviction_completed',
      'case_closed'
    );
  END IF;
END $$;

-- extend GL accounts if missing (check if exists first)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'late_fee_income' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'gl_account')) THEN
    ALTER TYPE gl_account ADD VALUE 'late_fee_income';
  END IF;
END $$;

COMMIT;