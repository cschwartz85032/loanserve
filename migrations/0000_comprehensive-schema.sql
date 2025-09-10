DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collection_status') THEN
    CREATE TYPE "public"."collection_status" AS ENUM(
      'current', 'contact_made', 'promise_to_pay', 'arrangement_made',
      'broken_promise', 'skip_trace', 'legal_review', 'foreclosure_initiated',
      'charge_off_pending'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."collection_status" ADD VALUE IF NOT EXISTS 'current';
      ALTER TYPE "public"."collection_status" ADD VALUE IF NOT EXISTS 'contact_made';
      ALTER TYPE "public"."collection_status" ADD VALUE IF NOT EXISTS 'promise_to_pay';
      ALTER TYPE "public"."collection_status" ADD VALUE IF NOT EXISTS 'arrangement_made';
      ALTER TYPE "public"."collection_status" ADD VALUE IF NOT EXISTS 'broken_promise';
      ALTER TYPE "public"."collection_status" ADD VALUE IF NOT EXISTS 'skip_trace';
      ALTER TYPE "public"."collection_status" ADD VALUE IF NOT EXISTS 'legal_review';
      ALTER TYPE "public"."collection_status" ADD VALUE IF NOT EXISTS 'foreclosure_initiated';
      ALTER TYPE "public"."collection_status" ADD VALUE IF NOT EXISTS 'charge_off_pending';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_category') THEN
    CREATE TYPE "public"."document_category" AS ENUM(
      'loan_application', 'loan_agreement', 'promissory_note', 'deed_of_trust', 'mortgage',
      'security_agreement', 'ucc_filing', 'assignment', 'modification', 'forbearance_agreement',
      'insurance_policy', 'tax_document', 'escrow_statement', 'title_report', 'appraisal',
      'inspection', 'financial_statement', 'income_verification', 'closing_disclosure',
      'settlement_statement', 'reconveyance', 'release', 'legal_notice', 'correspondence',
      'servicing_transfer', 'compliance', 'other'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'loan_application';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'loan_agreement';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'promissory_note';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'deed_of_trust';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'mortgage';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'security_agreement';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'ucc_filing';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'assignment';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'modification';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'forbearance_agreement';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'insurance_policy';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'tax_document';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'escrow_statement';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'title_report';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'appraisal';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'inspection';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'financial_statement';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'income_verification';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'closing_disclosure';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'settlement_statement';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'reconveyance';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'release';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'legal_notice';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'correspondence';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'servicing_transfer';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'compliance';
      ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'other';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type') THEN
    CREATE TYPE "public"."entity_type" AS ENUM(
      'individual', 'corporation', 'llc', 'partnership', 'trust', 'estate', 'government'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."entity_type" ADD VALUE IF NOT EXISTS 'individual';
      ALTER TYPE "public"."entity_type" ADD VALUE IF NOT EXISTS 'corporation';
      ALTER TYPE "public"."entity_type" ADD VALUE IF NOT EXISTS 'llc';
      ALTER TYPE "public"."entity_type" ADD VALUE IF NOT EXISTS 'partnership';
      ALTER TYPE "public"."entity_type" ADD VALUE IF NOT EXISTS 'trust';
      ALTER TYPE "public"."entity_type" ADD VALUE IF NOT EXISTS 'estate';
      ALTER TYPE "public"."entity_type" ADD VALUE IF NOT EXISTS 'government';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'frequency') THEN
    CREATE TYPE "public"."frequency" AS ENUM(
      'once', 'daily', 'weekly', 'bi_weekly', 'semi_monthly', 'monthly', 'quarterly', 'semi_annual', 'annual'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."frequency" ADD VALUE IF NOT EXISTS 'once';
      ALTER TYPE "public"."frequency" ADD VALUE IF NOT EXISTS 'daily';
      ALTER TYPE "public"."frequency" ADD VALUE IF NOT EXISTS 'weekly';
      ALTER TYPE "public"."frequency" ADD VALUE IF NOT EXISTS 'bi_weekly';
      ALTER TYPE "public"."frequency" ADD VALUE IF NOT EXISTS 'semi_monthly';
      ALTER TYPE "public"."frequency" ADD VALUE IF NOT EXISTS 'monthly';
      ALTER TYPE "public"."frequency" ADD VALUE IF NOT EXISTS 'quarterly';
      ALTER TYPE "public"."frequency" ADD VALUE IF NOT EXISTS 'semi_annual';
      ALTER TYPE "public"."frequency" ADD VALUE IF NOT EXISTS 'annual';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loan_status') THEN
    CREATE TYPE "public"."loan_status" AS ENUM(
      'application', 'underwriting', 'approved', 'active', 'current', 'delinquent',
      'default', 'forbearance', 'modification', 'foreclosure', 'reo', 'closed', 'paid_off', 'charged_off'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'application';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'underwriting';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'approved';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'active';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'current';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'delinquent';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'default';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'forbearance';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'modification';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'foreclosure';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'reo';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'closed';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'paid_off';
      ALTER TYPE "public"."loan_status" ADD VALUE IF NOT EXISTS 'charged_off';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loan_type') THEN
    CREATE TYPE "public"."loan_type" AS ENUM(
      'conventional', 'fha', 'va', 'usda', 'jumbo', 'portfolio', 'hard_money',
      'bridge', 'construction', 'commercial', 'reverse_mortgage'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."loan_type" ADD VALUE IF NOT EXISTS 'conventional';
      ALTER TYPE "public"."loan_type" ADD VALUE IF NOT EXISTS 'fha';
      ALTER TYPE "public"."loan_type" ADD VALUE IF NOT EXISTS 'va';
      ALTER TYPE "public"."loan_type" ADD VALUE IF NOT EXISTS 'usda';
      ALTER TYPE "public"."loan_type" ADD VALUE IF NOT EXISTS 'jumbo';
      ALTER TYPE "public"."loan_type" ADD VALUE IF NOT EXISTS 'portfolio';
      ALTER TYPE "public"."loan_type" ADD VALUE IF NOT EXISTS 'hard_money';
      ALTER TYPE "public"."loan_type" ADD VALUE IF NOT EXISTS 'bridge';
      ALTER TYPE "public"."loan_type" ADD VALUE IF NOT EXISTS 'construction';
      ALTER TYPE "public"."loan_type" ADD VALUE IF NOT EXISTS 'commercial';
      ALTER TYPE "public"."loan_type" ADD VALUE IF NOT EXISTS 'reverse_mortgage';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE "public"."notification_type" AS ENUM(
      'payment_due', 'payment_received', 'payment_failed', 'payment_late', 'document_required',
      'document_received', 'escrow_shortage', 'escrow_surplus', 'escrow_analysis', 'insurance_expiring',
      'tax_due', 'rate_change', 'maturity_approaching', 'system', 'legal', 'compliance'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'payment_due';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'payment_received';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'payment_failed';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'payment_late';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'document_required';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'document_received';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'escrow_shortage';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'escrow_surplus';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'escrow_analysis';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'insurance_expiring';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'tax_due';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'rate_change';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'maturity_approaching';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'system';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'legal';
      ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'compliance';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE "public"."payment_status" AS ENUM(
      'scheduled', 'pending', 'processing', 'completed', 'failed', 'reversed', 'partial', 'late', 'nsf', 'waived'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'scheduled';
      ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'pending';
      ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'processing';
      ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'completed';
      ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'failed';
      ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'reversed';
      ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'partial';
      ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'late';
      ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'nsf';
      ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'waived';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'priority') THEN
    CREATE TYPE "public"."priority" AS ENUM(
      'low', 'medium', 'high', 'urgent', 'critical'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."priority" ADD VALUE IF NOT EXISTS 'low';
      ALTER TYPE "public"."priority" ADD VALUE IF NOT EXISTS 'medium';
      ALTER TYPE "public"."priority" ADD VALUE IF NOT EXISTS 'high';
      ALTER TYPE "public"."priority" ADD VALUE IF NOT EXISTS 'urgent';
      ALTER TYPE "public"."priority" ADD VALUE IF NOT EXISTS 'critical';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'property_type') THEN
    CREATE TYPE "public"."property_type" AS ENUM(
      'single_family', 'condo', 'townhouse', 'multi_family', 'manufactured', 'commercial', 'land', 'mixed_use'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'single_family';
      ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'condo';
      ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'townhouse';
      ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'multi_family';
      ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'manufactured';
      ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'commercial';
      ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'land';
      ALTER TYPE "public"."property_type" ADD VALUE IF NOT EXISTS 'mixed_use';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
    CREATE TYPE "public"."transaction_type" AS ENUM(
      'deposit', 'withdrawal', 'transfer', 'payment_principal', 'payment_interest', 'payment_escrow',
      'payment_fee', 'payment_late_fee', 'insurance_premium', 'property_tax', 'hoa_fee',
      'disbursement', 'adjustment', 'refund'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'deposit';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'withdrawal';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'transfer';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'payment_principal';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'payment_interest';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'payment_escrow';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'payment_fee';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'payment_late_fee';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'insurance_premium';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'property_tax';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'hoa_fee';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'disbursement';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'adjustment';
      ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'refund';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE "public"."user_role" AS ENUM(
      'lender', 'borrower', 'investor', 'escrow_officer', 'legal', 'servicer', 'admin'
    );
  ELSE
    BEGIN
      ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'lender';
      ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'borrower';
      ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'investor';
      ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'escrow_officer';
      ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'legal';
      ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'servicer';
      ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'admin';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
--> statement-breakpoint
CREATE TABLE "audit_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer,
        "entity_type" text NOT NULL,
        "entity_id" integer NOT NULL,
        "action" text NOT NULL,
        "previous_values" jsonb,
        "new_values" jsonb,
        "changed_fields" text[],
        "ip_address" text,
        "user_agent" text,
        "session_id" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "borrower_entities" (
        "id" serial PRIMARY KEY NOT NULL,
        "entity_type" "entity_type" NOT NULL,
        "first_name" text,
        "last_name" text,
        "middle_name" text,
        "suffix" text,
        "date_of_birth" date,
        "ssn" text,
        "entity_name" text,
        "ein" text,
        "formation_date" date,
        "formation_state" text,
        "email" text,
        "phone" text,
        "mobile_phone" text,
        "fax" text,
        "website" text,
        "mailing_address" text,
        "mailing_address_2" text,
        "mailing_city" text,
        "mailing_state" text,
        "mailing_zip" text,
        "mailing_country" text DEFAULT 'USA',
        "credit_score" integer,
        "monthly_income" numeric(12, 2),
        "total_assets" numeric(15, 2),
        "total_liabilities" numeric(15, 2),
        "is_active" boolean DEFAULT true NOT NULL,
        "verification_status" text DEFAULT 'pending',
        "verification_date" timestamp,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_activities" (
        "id" serial PRIMARY KEY NOT NULL,
        "loan_id" integer NOT NULL,
        "activity_date" timestamp DEFAULT now() NOT NULL,
        "activity_type" text NOT NULL,
        "status" "collection_status" NOT NULL,
        "contact_method" text,
        "contact_person" text,
        "phone_number" text,
        "promise_date" date,
        "promise_amount" numeric(10, 2),
        "result" text,
        "next_action_date" date,
        "next_action" text,
        "notes" text NOT NULL,
        "performed_by" integer,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "category" "document_category" NOT NULL,
        "description" text,
        "template_content" text,
        "template_url" text,
        "variables" jsonb,
        "is_active" boolean DEFAULT true,
        "created_by" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
        "id" serial PRIMARY KEY NOT NULL,
        "loan_id" integer,
        "borrower_id" integer,
        "property_id" integer,
        "category" "document_category" NOT NULL,
        "document_type" text,
        "title" text NOT NULL,
        "description" text,
        "file_name" text NOT NULL,
        "file_size" integer,
        "mime_type" text,
        "storage_url" text NOT NULL,
        "thumbnail_url" text,
        "document_date" date,
        "recorded_date" date,
        "expiration_date" date,
        "recording_number" text,
        "book_number" text,
        "page_number" text,
        "instrument_number" text,
        "is_public" boolean DEFAULT false NOT NULL,
        "is_confidential" boolean DEFAULT false,
        "requires_signature" boolean DEFAULT false,
        "is_signed" boolean DEFAULT false,
        "version" integer DEFAULT 1 NOT NULL,
        "parent_document_id" integer,
        "is_current_version" boolean DEFAULT true,
        "uploaded_by" integer NOT NULL,
        "last_accessed_by" integer,
        "last_accessed_at" timestamp,
        "is_active" boolean DEFAULT true NOT NULL,
        "archived_date" timestamp,
        "archived_by" integer,
        "tags" text[],
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_accounts" (
        "id" serial PRIMARY KEY NOT NULL,
        "loan_id" integer NOT NULL,
        "account_number" text NOT NULL,
        "current_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
        "available_balance" numeric(12, 2) DEFAULT '0',
        "pending_deposits" numeric(12, 2) DEFAULT '0',
        "pending_disbursements" numeric(12, 2) DEFAULT '0',
        "monthly_payment" numeric(10, 2) DEFAULT '0',
        "minimum_balance" numeric(10, 2) DEFAULT '0',
        "cushion_amount" numeric(10, 2) DEFAULT '0',
        "target_balance" numeric(12, 2) DEFAULT '0',
        "projected_lowest_balance" numeric(12, 2),
        "projected_lowest_month" text,
        "shortage_amount" numeric(10, 2) DEFAULT '0',
        "surplus_amount" numeric(10, 2) DEFAULT '0',
        "shortage_spread_months" integer,
        "last_analysis_date" date,
        "next_analysis_date" date,
        "analysis_effective_date" date,
        "is_active" boolean DEFAULT true NOT NULL,
        "waived" boolean DEFAULT false,
        "waived_date" date,
        "waived_by" integer,
        "waived_reason" text,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "escrow_accounts_loan_id_unique" UNIQUE("loan_id"),
        CONSTRAINT "escrow_accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE "escrow_items" (
        "id" serial PRIMARY KEY NOT NULL,
        "escrow_account_id" integer NOT NULL,
        "item_type" text NOT NULL,
        "payee_id" integer NOT NULL,
        "description" text NOT NULL,
        "frequency" "frequency" NOT NULL,
        "annual_amount" numeric(10, 2) NOT NULL,
        "payment_amount" numeric(10, 2) NOT NULL,
        "first_due_date" date,
        "next_due_date" date,
        "last_paid_date" date,
        "account_number" text,
        "policy_number" text,
        "reference_number" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "auto_pay_enabled" boolean DEFAULT true,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_transactions" (
        "id" serial PRIMARY KEY NOT NULL,
        "escrow_account_id" integer NOT NULL,
        "escrow_item_id" integer,
        "transaction_date" timestamp NOT NULL,
        "effective_date" date NOT NULL,
        "transaction_type" "transaction_type" NOT NULL,
        "amount" numeric(10, 2) NOT NULL,
        "running_balance" numeric(12, 2) NOT NULL,
        "payee_id" integer,
        "check_number" text,
        "wire_confirmation" text,
        "reference_number" text,
        "payment_id" integer,
        "processed_by" integer,
        "approved_by" integer,
        "batch_id" text,
        "description" text NOT NULL,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guarantors" (
        "id" serial PRIMARY KEY NOT NULL,
        "loan_id" integer NOT NULL,
        "guarantor_entity_id" integer NOT NULL,
        "guarantee_amount" numeric(15, 2),
        "guarantee_percentage" numeric(5, 2),
        "guarantee_type" text,
        "start_date" date,
        "end_date" date,
        "is_active" boolean DEFAULT true,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_policies" (
        "id" serial PRIMARY KEY NOT NULL,
        "loan_id" integer,
        "property_id" integer NOT NULL,
        "policy_type" text NOT NULL,
        "insurance_company" text NOT NULL,
        "policy_number" text NOT NULL,
        "effective_date" date NOT NULL,
        "expiration_date" date NOT NULL,
        "coverage_amount" numeric(12, 2) NOT NULL,
        "deductible" numeric(10, 2),
        "annual_premium" numeric(10, 2) NOT NULL,
        "agent_name" text,
        "agent_phone" text,
        "agent_email" text,
        "is_escrow_paid" boolean DEFAULT false,
        "is_active" boolean DEFAULT true,
        "last_verified_date" date,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_proceedings" (
        "id" serial PRIMARY KEY NOT NULL,
        "loan_id" integer NOT NULL,
        "proceeding_type" text NOT NULL,
        "case_number" text,
        "court_name" text,
        "filing_date" date,
        "attorney_name" text,
        "attorney_firm" text,
        "attorney_phone" text,
        "attorney_email" text,
        "status" text NOT NULL,
        "status_date" date,
        "sale_date" date,
        "redemption_deadline" date,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_borrowers" (
        "id" serial PRIMARY KEY NOT NULL,
        "loan_id" integer NOT NULL,
        "borrower_id" integer NOT NULL,
        "borrower_type" text NOT NULL,
        "ownership_percentage" numeric(5, 2),
        "signing_authority" boolean DEFAULT true,
        "liability_percentage" numeric(5, 2),
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
        "id" serial PRIMARY KEY NOT NULL,
        "loan_number" text NOT NULL,
        "loan_type" "loan_type" NOT NULL,
        "loan_purpose" text,
        "lender_id" integer,
        "servicer_id" integer,
        "investor_id" integer,
        "property_id" integer NOT NULL,
        "original_amount" numeric(15, 2) NOT NULL,
        "principal_balance" numeric(15, 2) NOT NULL,
        "interest_rate" numeric(6, 4) NOT NULL,
        "rate_type" text NOT NULL,
        "index_type" text,
        "margin" numeric(6, 4),
        "rate_adjustment_frequency" integer,
        "rate_cap_initial" numeric(6, 4),
        "rate_cap_periodic" numeric(6, 4),
        "rate_cap_lifetime" numeric(6, 4),
        "rate_floor" numeric(6, 4),
        "loan_term" integer NOT NULL,
        "amortization_term" integer,
        "balloon_months" integer,
        "balloon_amount" numeric(15, 2),
        "prepayment_penalty" boolean DEFAULT false,
        "prepayment_penalty_term" integer,
        "prepayment_penalty_amount" numeric(10, 2),
        "application_date" date,
        "approval_date" date,
        "funding_date" date,
        "first_payment_date" date,
        "maturity_date" date NOT NULL,
        "next_payment_date" date,
        "last_payment_date" date,
        "payment_frequency" "frequency" DEFAULT 'monthly' NOT NULL,
        "payment_amount" numeric(10, 2) NOT NULL,
        "principal_and_interest" numeric(10, 2),
        "monthly_escrow" numeric(10, 2),
        "monthly_mi" numeric(10, 2),
        "original_ltv" numeric(5, 2),
        "current_ltv" numeric(5, 2),
        "combined_ltv" numeric(5, 2),
        "mi_required" boolean DEFAULT false,
        "mi_provider" text,
        "mi_certificate_number" text,
        "escrow_required" boolean DEFAULT false,
        "escrow_waived" boolean DEFAULT false,
        "status" "loan_status" NOT NULL,
        "status_date" timestamp DEFAULT now() NOT NULL,
        "status_reason" text,
        "delinquent_days" integer DEFAULT 0,
        "times_delinquent_30" integer DEFAULT 0,
        "times_delinquent_60" integer DEFAULT 0,
        "times_delinquent_90" integer DEFAULT 0,
        "foreclosure_date" date,
        "sale_date" date,
        "servicing_fee_rate" numeric(5, 4),
        "servicing_fee_amount" numeric(10, 2),
        "investor_loan_number" text,
        "pool_number" text,
        "hmda" boolean DEFAULT false,
        "hoepa" boolean DEFAULT false,
        "qm" boolean DEFAULT false,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "loans_loan_number_unique" UNIQUE("loan_number")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "type" "notification_type" NOT NULL,
        "priority" "priority" DEFAULT 'medium' NOT NULL,
        "title" text NOT NULL,
        "message" text NOT NULL,
        "related_entity_type" text,
        "related_entity_id" integer,
        "action_url" text,
        "is_read" boolean DEFAULT false NOT NULL,
        "read_at" timestamp,
        "is_archived" boolean DEFAULT false,
        "archived_at" timestamp,
        "scheduled_for" timestamp,
        "sent_at" timestamp,
        "email_sent" boolean DEFAULT false,
        "sms_sent" boolean DEFAULT false,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payees" (
        "id" serial PRIMARY KEY NOT NULL,
        "payee_type" text NOT NULL,
        "name" text NOT NULL,
        "contact_name" text,
        "phone" text,
        "fax" text,
        "email" text,
        "website" text,
        "address" text,
        "address_2" text,
        "city" text,
        "state" text,
        "zip_code" text,
        "country" text DEFAULT 'USA',
        "payment_method" text,
        "account_number" text,
        "routing_number" text,
        "wire_instructions" text,
        "tax_authority" boolean DEFAULT false,
        "tax_district" text,
        "naic_code" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "is_preferred" boolean DEFAULT false,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_schedule" (
        "id" serial PRIMARY KEY NOT NULL,
        "loan_id" integer NOT NULL,
        "payment_number" integer NOT NULL,
        "due_date" date NOT NULL,
        "principal_amount" numeric(10, 2) NOT NULL,
        "interest_amount" numeric(10, 2) NOT NULL,
        "escrow_amount" numeric(10, 2),
        "mi_amount" numeric(10, 2),
        "total_amount" numeric(10, 2) NOT NULL,
        "principal_balance" numeric(15, 2) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
        "id" serial PRIMARY KEY NOT NULL,
        "loan_id" integer NOT NULL,
        "schedule_id" integer,
        "payment_number" integer,
        "due_date" date,
        "received_date" timestamp,
        "effective_date" date NOT NULL,
        "scheduled_amount" numeric(10, 2),
        "total_received" numeric(10, 2) NOT NULL,
        "principal_amount" numeric(10, 2),
        "interest_amount" numeric(10, 2),
        "escrow_amount" numeric(10, 2),
        "mi_amount" numeric(10, 2),
        "late_fee_amount" numeric(8, 2),
        "other_fee_amount" numeric(8, 2),
        "payment_method" text,
        "check_number" text,
        "transaction_id" text,
        "confirmation_number" text,
        "status" "payment_status" NOT NULL,
        "nsf_count" integer DEFAULT 0,
        "reversal_reason" text,
        "processed_by" integer,
        "processed_date" timestamp,
        "batch_id" text,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
        "id" serial PRIMARY KEY NOT NULL,
        "property_type" "property_type" NOT NULL,
        "address" text NOT NULL,
        "address_2" text,
        "city" text NOT NULL,
        "state" text NOT NULL,
        "zip_code" text NOT NULL,
        "county" text,
        "country" text DEFAULT 'USA',
        "legal_description" text,
        "apn" text,
        "lot_number" text,
        "block_number" text,
        "subdivision" text,
        "year_built" integer,
        "square_feet" integer,
        "lot_size" numeric(10, 2),
        "bedrooms" integer,
        "bathrooms" numeric(3, 1),
        "stories" integer,
        "garage" boolean DEFAULT false,
        "garage_spaces" integer,
        "pool" boolean DEFAULT false,
        "purchase_price" numeric(15, 2),
        "purchase_date" date,
        "original_appraisal_value" numeric(15, 2),
        "original_appraisal_date" date,
        "current_value" numeric(15, 2),
        "current_value_date" date,
        "current_value_source" text,
        "annual_property_tax" numeric(10, 2),
        "annual_insurance" numeric(10, 2),
        "annual_hoa" numeric(10, 2),
        "tax_id" text,
        "occupancy_status" text,
        "rental_income" numeric(10, 2),
        "primary_residence" boolean DEFAULT false,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicing_instructions" (
        "id" serial PRIMARY KEY NOT NULL,
        "loan_id" integer NOT NULL,
        "instruction_type" text NOT NULL,
        "priority" "priority" DEFAULT 'medium',
        "effective_date" date NOT NULL,
        "expiration_date" date,
        "instructions" text NOT NULL,
        "is_active" boolean DEFAULT true,
        "created_by" integer,
        "approved_by" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
        "id" serial PRIMARY KEY NOT NULL,
        "category" text NOT NULL,
        "key" text NOT NULL,
        "value" jsonb NOT NULL,
        "description" text,
        "is_editable" boolean DEFAULT true,
        "updated_by" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "task_type" text NOT NULL,
        "priority" "priority" DEFAULT 'medium',
        "status" text NOT NULL,
        "loan_id" integer,
        "related_entity_type" text,
        "related_entity_id" integer,
        "assigned_to" integer,
        "assigned_by" integer,
        "assigned_date" timestamp,
        "due_date" timestamp,
        "started_date" timestamp,
        "completed_date" timestamp,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "username" text NOT NULL,
        "password" text NOT NULL,
        "email" text NOT NULL,
        "first_name" text NOT NULL,
        "last_name" text NOT NULL,
        "middle_name" text,
        "role" "user_role" NOT NULL,
        "phone" text,
        "mobile_phone" text,
        "fax" text,
        "address" text,
        "address_2" text,
        "city" text,
        "state" text,
        "zip_code" text,
        "country" text DEFAULT 'USA',
        "date_of_birth" date,
        "ssn" text,
        "employer_name" text,
        "employer_phone" text,
        "job_title" text,
        "years_employed" integer,
        "monthly_income" numeric(12, 2),
        "is_active" boolean DEFAULT true NOT NULL,
        "email_verified" boolean DEFAULT false NOT NULL,
        "two_factor_enabled" boolean DEFAULT false NOT NULL,
        "profile_image" text,
        "preferences" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "last_login" timestamp,
        "failed_login_attempts" integer DEFAULT 0,
        "locked_until" timestamp,
        CONSTRAINT "users_username_unique" UNIQUE("username"),
        CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_borrower_id_borrower_entities_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "public"."borrower_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_document_id_documents_id_fk" FOREIGN KEY ("parent_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_last_accessed_by_users_id_fk" FOREIGN KEY ("last_accessed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_accounts" ADD CONSTRAINT "escrow_accounts_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_accounts" ADD CONSTRAINT "escrow_accounts_waived_by_users_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_items" ADD CONSTRAINT "escrow_items_escrow_account_id_escrow_accounts_id_fk" FOREIGN KEY ("escrow_account_id") REFERENCES "public"."escrow_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_items" ADD CONSTRAINT "escrow_items_payee_id_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_escrow_account_id_escrow_accounts_id_fk" FOREIGN KEY ("escrow_account_id") REFERENCES "public"."escrow_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_escrow_item_id_escrow_items_id_fk" FOREIGN KEY ("escrow_item_id") REFERENCES "public"."escrow_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_payee_id_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_guarantor_entity_id_borrower_entities_id_fk" FOREIGN KEY ("guarantor_entity_id") REFERENCES "public"."borrower_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_proceedings" ADD CONSTRAINT "legal_proceedings_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_borrowers" ADD CONSTRAINT "loan_borrowers_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_borrowers" ADD CONSTRAINT "loan_borrowers_borrower_id_borrower_entities_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "public"."borrower_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_lender_id_users_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_servicer_id_users_id_fk" FOREIGN KEY ("servicer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule" ADD CONSTRAINT "payment_schedule_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_schedule_id_payment_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."payment_schedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_instructions" ADD CONSTRAINT "servicing_instructions_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_instructions" ADD CONSTRAINT "servicing_instructions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_instructions" ADD CONSTRAINT "servicing_instructions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "borrower_entity_type_idx" ON "borrower_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "borrower_email_idx" ON "borrower_entities" USING btree ("email");--> statement-breakpoint
CREATE INDEX "borrower_ssn_idx" ON "borrower_entities" USING btree ("ssn");--> statement-breakpoint
CREATE INDEX "borrower_ein_idx" ON "borrower_entities" USING btree ("ein");--> statement-breakpoint
CREATE INDEX "collection_loan_idx" ON "collection_activities" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "collection_date_idx" ON "collection_activities" USING btree ("activity_date");--> statement-breakpoint
CREATE INDEX "collection_status_idx" ON "collection_activities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_loan_idx" ON "documents" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "document_borrower_idx" ON "documents" USING btree ("borrower_id");--> statement-breakpoint
CREATE INDEX "document_category_idx" ON "documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "document_uploaded_by_idx" ON "documents" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "document_date_idx" ON "documents" USING btree ("document_date");--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_account_number_idx" ON "escrow_accounts" USING btree ("account_number");--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_loan_idx" ON "escrow_accounts" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "escrow_active_idx" ON "escrow_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "escrow_item_account_idx" ON "escrow_items" USING btree ("escrow_account_id");--> statement-breakpoint
CREATE INDEX "escrow_item_type_idx" ON "escrow_items" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "escrow_item_next_due_idx" ON "escrow_items" USING btree ("next_due_date");--> statement-breakpoint
CREATE INDEX "escrow_trans_account_idx" ON "escrow_transactions" USING btree ("escrow_account_id");--> statement-breakpoint
CREATE INDEX "escrow_trans_date_idx" ON "escrow_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "escrow_trans_type_idx" ON "escrow_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "guarantor_loan_idx" ON "guarantors" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "guarantor_entity_idx" ON "guarantors" USING btree ("guarantor_entity_id");--> statement-breakpoint
CREATE INDEX "insurance_loan_idx" ON "insurance_policies" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "insurance_property_idx" ON "insurance_policies" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "insurance_policy_number_idx" ON "insurance_policies" USING btree ("policy_number");--> statement-breakpoint
CREATE INDEX "insurance_expiration_idx" ON "insurance_policies" USING btree ("expiration_date");--> statement-breakpoint
CREATE INDEX "legal_loan_idx" ON "legal_proceedings" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "legal_type_idx" ON "legal_proceedings" USING btree ("proceeding_type");--> statement-breakpoint
CREATE INDEX "legal_case_idx" ON "legal_proceedings" USING btree ("case_number");--> statement-breakpoint
CREATE UNIQUE INDEX "loan_borrower_idx" ON "loan_borrowers" USING btree ("loan_id","borrower_id");--> statement-breakpoint
CREATE INDEX "loan_borrowers_loan_idx" ON "loan_borrowers" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loan_borrowers_borrower_idx" ON "loan_borrowers" USING btree ("borrower_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loan_number_idx" ON "loans" USING btree ("loan_number");--> statement-breakpoint
CREATE INDEX "loan_status_idx" ON "loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "loan_property_idx" ON "loans" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "loan_maturity_idx" ON "loans" USING btree ("maturity_date");--> statement-breakpoint
CREATE INDEX "loan_next_payment_idx" ON "loans" USING btree ("next_payment_date");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_is_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "notification_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notification_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payee_name_idx" ON "payees" USING btree ("name");--> statement-breakpoint
CREATE INDEX "payee_type_idx" ON "payees" USING btree ("payee_type");--> statement-breakpoint
CREATE INDEX "payee_active_idx" ON "payees" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_loan_payment_idx" ON "payment_schedule" USING btree ("loan_id","payment_number");--> statement-breakpoint
CREATE INDEX "schedule_due_date_idx" ON "payment_schedule" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "payment_loan_idx" ON "payments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "payment_due_date_idx" ON "payments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "payment_effective_date_idx" ON "payments" USING btree ("effective_date");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_batch_idx" ON "payments" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "property_apn_idx" ON "properties" USING btree ("apn");--> statement-breakpoint
CREATE INDEX "property_address_idx" ON "properties" USING btree ("address","city","state");--> statement-breakpoint
CREATE INDEX "property_type_idx" ON "properties" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX "servicing_loan_idx" ON "servicing_instructions" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "servicing_type_idx" ON "servicing_instructions" USING btree ("instruction_type");--> statement-breakpoint
CREATE INDEX "servicing_active_idx" ON "servicing_instructions" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_category_key_idx" ON "system_settings" USING btree ("category","key");--> statement-breakpoint
CREATE INDEX "task_assigned_to_idx" ON "tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "task_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "task_due_date_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "task_loan_idx" ON "tasks" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "user_active_idx" ON "users" USING btree ("is_active");