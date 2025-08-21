CREATE TYPE "public"."collection_status" AS ENUM('current', 'contact_made', 'promise_to_pay', 'arrangement_made', 'broken_promise', 'skip_trace', 'legal_review', 'foreclosure_initiated', 'charge_off_pending');--> statement-breakpoint
CREATE TYPE "public"."disbursement_payment_method" AS ENUM('check', 'ach', 'wire');--> statement-breakpoint
CREATE TYPE "public"."disbursement_status" AS ENUM('active', 'on_hold', 'suspended', 'cancelled', 'completed', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."disbursement_type" AS ENUM('taxes', 'insurance', 'hoa', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_category" AS ENUM('loan_application', 'loan_agreement', 'promissory_note', 'deed_of_trust', 'mortgage', 'security_agreement', 'ucc_filing', 'assignment', 'modification', 'forbearance_agreement', 'insurance_policy', 'tax_document', 'escrow_statement', 'title_report', 'appraisal', 'inspection', 'financial_statement', 'income_verification', 'closing_disclosure', 'settlement_statement', 'reconveyance', 'release', 'legal_notice', 'correspondence', 'servicing_transfer', 'compliance', 'other');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('individual', 'corporation', 'llc', 'partnership', 'trust', 'estate', 'government');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('once', 'daily', 'weekly', 'bi_weekly', 'semi_monthly', 'monthly', 'quarterly', 'semi_annual', 'annual');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('application', 'underwriting', 'approved', 'active', 'current', 'delinquent', 'default', 'forbearance', 'modification', 'foreclosure', 'reo', 'closed', 'paid_off', 'charged_off');--> statement-breakpoint
CREATE TYPE "public"."loan_type" AS ENUM('conventional', 'fha', 'va', 'usda', 'jumbo', 'portfolio', 'hard_money', 'bridge', 'construction', 'commercial', 'reverse_mortgage');--> statement-breakpoint
CREATE TYPE "public"."login_outcome" AS ENUM('succeeded', 'failed', 'locked');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('payment_due', 'payment_received', 'payment_failed', 'payment_late', 'document_required', 'document_received', 'escrow_shortage', 'escrow_surplus', 'escrow_analysis', 'insurance_expiring', 'tax_due', 'rate_change', 'maturity_approaching', 'system', 'legal', 'compliance');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('check', 'ach', 'wire', 'cash', 'credit_card', 'online');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('scheduled', 'pending', 'processing', 'completed', 'failed', 'reversed', 'partial', 'late', 'nsf', 'waived');--> statement-breakpoint
CREATE TYPE "public"."permission_level" AS ENUM('none', 'read', 'write', 'admin');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'urgent', 'critical');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('single_family', 'condo', 'townhouse', 'multi_family', 'manufactured', 'commercial', 'land', 'mixed_use');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('deposit', 'withdrawal', 'transfer', 'payment_principal', 'payment_interest', 'payment_escrow', 'payment_fee', 'payment_late_fee', 'insurance_premium', 'property_tax', 'hoa_fee', 'disbursement', 'adjustment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('lender', 'borrower', 'investor', 'escrow_officer', 'legal', 'servicer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'locked', 'suspended', 'disabled');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"loan_id" integer,
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
CREATE TABLE "auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" integer,
	"target_user_id" integer,
	"event_type" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"event_key" text,
	CONSTRAINT "auth_events_event_key_unique" UNIQUE("event_key")
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
	"credit_score_equifax" integer,
	"credit_score_experian" integer,
	"credit_score_transunion" integer,
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
CREATE TABLE "crm_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"activity_type" text NOT NULL,
	"activity_data" jsonb NOT NULL,
	"related_id" integer,
	"is_system" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"attendees" jsonb DEFAULT '[]'::jsonb,
	"reminder_minutes" integer DEFAULT 15,
	"status" text DEFAULT 'scheduled',
	"meeting_link" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"duration" integer,
	"outcome" text,
	"notes" text,
	"scheduled_for" timestamp,
	"completed_at" timestamp,
	"recording_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_collaborators" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb,
	"added_by" integer NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"title" text NOT NULL,
	"value" numeric(12, 2),
	"stage" text NOT NULL,
	"probability" integer DEFAULT 0,
	"expected_close_date" date,
	"actual_close_date" date,
	"lost_reason" text,
	"notes" text,
	"created_by" integer NOT NULL,
	"assigned_to" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"is_private" boolean DEFAULT false,
	"mentioned_users" jsonb DEFAULT '[]'::jsonb,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"assigned_to" integer,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium',
	"due_date" timestamp,
	"completed_at" timestamp,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"notes" text,
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
CREATE TABLE "escrow_advances" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"escrow_account_id" integer,
	"advance_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"repayment_months" integer DEFAULT 12 NOT NULL,
	"monthly_repayment" numeric(12, 2) NOT NULL,
	"outstanding_balance" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"paid_off_date" date,
	"run_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_disbursement_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"disbursement_id" integer NOT NULL,
	"loan_id" integer NOT NULL,
	"ledger_entry_id" integer,
	"payment_date" timestamp NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"check_number" text,
	"wire_confirmation" text,
	"ach_transaction_id" text,
	"status" "payment_status" DEFAULT 'scheduled' NOT NULL,
	"confirmation_number" text,
	"processed_by" integer,
	"processed_date" timestamp,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_disbursements" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"escrow_account_id" integer NOT NULL,
	"disbursement_type" "disbursement_type" NOT NULL,
	"description" text NOT NULL,
	"category" text,
	"payee_name" text NOT NULL,
	"payee_contact_name" text,
	"payee_phone" text,
	"payee_email" text,
	"payee_fax" text,
	"payee_street_address" text,
	"payee_city" text,
	"payee_state" text,
	"payee_zip_code" text,
	"parcel_number" text,
	"policy_number" text,
	"insured_name" text,
	"insurance_company_name" text,
	"policy_description" text,
	"policy_expiration_date" date,
	"coverage_amount" numeric(12, 2),
	"insurance_property_address" text,
	"insurance_property_city" text,
	"insurance_property_state" text,
	"insurance_property_zip_code" text,
	"agent_name" text,
	"agent_business_address" text,
	"agent_city" text,
	"agent_state" text,
	"agent_zip_code" text,
	"agent_phone" text,
	"agent_fax" text,
	"agent_email" text,
	"insurance_document_id" integer,
	"insurance_tracking" boolean DEFAULT true,
	"payment_method" "disbursement_payment_method" DEFAULT 'check' NOT NULL,
	"bank_account_number" text,
	"ach_routing_number" text,
	"wire_routing_number" text,
	"account_type" text,
	"bank_name" text,
	"wire_instructions" text,
	"remittance_address" text,
	"remittance_city" text,
	"remittance_state" text,
	"remittance_zip_code" text,
	"account_number" text,
	"reference_number" text,
	"frequency" "frequency" NOT NULL,
	"monthly_amount" numeric(10, 2),
	"annual_amount" numeric(10, 2) NOT NULL,
	"payment_amount" numeric(10, 2) NOT NULL,
	"first_due_date" date,
	"next_due_date" date NOT NULL,
	"last_paid_date" date,
	"specific_due_dates" jsonb,
	"status" "disbursement_status" DEFAULT 'active' NOT NULL,
	"is_on_hold" boolean DEFAULT false NOT NULL,
	"hold_reason" text,
	"hold_requested_by" text,
	"hold_date" timestamp,
	"auto_pay_enabled" boolean DEFAULT true,
	"days_before_due" integer DEFAULT 10,
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
CREATE TABLE "fee_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"lender_id" integer NOT NULL,
	"template_name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"fees" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "interest_accruals" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"accrual_date" date NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"day_count" integer NOT NULL,
	"day_count_convention" text NOT NULL,
	"interest_rate" numeric(8, 4) NOT NULL,
	"principal_balance" numeric(12, 2) NOT NULL,
	"daily_rate" numeric(12, 10) NOT NULL,
	"accrued_amount" numeric(12, 2) NOT NULL,
	"run_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_distributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"loan_id" integer NOT NULL,
	"investor_id" integer NOT NULL,
	"distribution_date" date NOT NULL,
	"ownership_percentage" numeric(8, 6) NOT NULL,
	"gross_amount" numeric(12, 2) NOT NULL,
	"principal_amount" numeric(12, 2) NOT NULL,
	"interest_amount" numeric(12, 2) NOT NULL,
	"fees_amount" numeric(12, 2) NOT NULL,
	"net_amount" numeric(12, 2) NOT NULL,
	"rounding_adjustment" numeric(6, 4) DEFAULT '0.00',
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investors" (
	"id" serial PRIMARY KEY NOT NULL,
	"investor_id" text NOT NULL,
	"loan_id" integer NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"ssn_or_ein" text,
	"email" text,
	"phone" text,
	"street_address" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"bank_name" text,
	"bank_street_address" text,
	"bank_city" text,
	"bank_state" text,
	"bank_zip_code" text,
	"account_number" text,
	"routing_number" text,
	"account_type" text,
	"ownership_percentage" numeric(8, 6) NOT NULL,
	"investment_amount" numeric(15, 2),
	"investment_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "investors_investor_id_unique" UNIQUE("investor_id")
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
	"ownership_percentage" numeric(8, 6),
	"signing_authority" boolean DEFAULT true,
	"liability_percentage" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_fees" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"fee_type" text NOT NULL,
	"fee_name" text NOT NULL,
	"fee_amount" numeric(10, 2) NOT NULL,
	"fee_percentage" numeric(5, 3),
	"frequency" text,
	"charge_date" date,
	"due_date" date,
	"paid_date" date,
	"waived" boolean DEFAULT false,
	"waived_by" integer,
	"waived_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"transaction_date" timestamp NOT NULL,
	"transaction_id" text NOT NULL,
	"description" text NOT NULL,
	"transaction_type" text NOT NULL,
	"category" text,
	"debit_amount" numeric(12, 2),
	"credit_amount" numeric(12, 2),
	"running_balance" numeric(12, 2) NOT NULL,
	"principal_balance" numeric(12, 2) NOT NULL,
	"interest_balance" numeric(12, 2) DEFAULT '0',
	"status" text DEFAULT 'posted' NOT NULL,
	"reversal_of" integer,
	"reversed_by" integer,
	"approval_required" boolean DEFAULT false,
	"approved_by" integer,
	"approval_date" timestamp,
	"approval_notes" text,
	"created_by" integer,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loan_ledger_transaction_id_unique" UNIQUE("transaction_id")
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
	"prepayment_expiration_date" date,
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
	"servicing_fee" numeric(10, 2),
	"servicing_fee_type" text DEFAULT 'percentage' NOT NULL,
	"late_charge" numeric(10, 2),
	"late_charge_type" text DEFAULT 'percentage' NOT NULL,
	"fee_payer" text,
	"grace_period_days" integer,
	"investor_loan_number" text,
	"pool_number" text,
	"hmda" boolean DEFAULT false,
	"hoepa" boolean DEFAULT false,
	"qm" boolean DEFAULT false,
	"borrower_name" text,
	"borrower_company_name" text,
	"borrower_email" text,
	"borrower_phone" text,
	"borrower_mobile" text,
	"borrower_photo" text,
	"borrower_address" text,
	"borrower_city" text,
	"borrower_state" text,
	"borrower_zip" text,
	"borrower_ssn" text,
	"borrower_income" numeric(15, 2),
	"credit_score_equifax" integer,
	"credit_score_experian" integer,
	"credit_score_transunion" integer,
	"co_borrower_name" text,
	"co_borrower_company_name" text,
	"co_borrower_email" text,
	"co_borrower_phone" text,
	"co_borrower_address" text,
	"co_borrower_city" text,
	"co_borrower_state" text,
	"co_borrower_zip" text,
	"co_borrower_ssn" text,
	"co_borrower_income" numeric(15, 2),
	"co_borrower_credit_score_equifax" integer,
	"co_borrower_credit_score_experian" integer,
	"co_borrower_credit_score_transunion" integer,
	"trustee_name" text,
	"trustee_company_name" text,
	"trustee_phone" text,
	"trustee_email" text,
	"trustee_street_address" text,
	"trustee_city" text,
	"trustee_state" text,
	"trustee_zip_code" text,
	"beneficiary_name" text,
	"beneficiary_company_name" text,
	"beneficiary_phone" text,
	"beneficiary_email" text,
	"beneficiary_street_address" text,
	"beneficiary_city" text,
	"beneficiary_state" text,
	"beneficiary_zip_code" text,
	"escrow_company_name" text,
	"escrow_number" text,
	"escrow_company_phone" text,
	"escrow_company_email" text,
	"escrow_company_street_address" text,
	"escrow_company_city" text,
	"escrow_company_state" text,
	"escrow_company_zip_code" text,
	"loan_documents" jsonb,
	"default_conditions" jsonb,
	"insurance_requirements" jsonb,
	"cross_default_parties" jsonb,
	"closing_costs" numeric(15, 2),
	"down_payment" numeric(15, 2),
	"hazard_insurance" numeric(10, 2),
	"property_taxes" numeric(10, 2),
	"hoa_fees" numeric(10, 2),
	"pmi_amount" numeric(10, 2),
	"property_tax" numeric(10, 2),
	"home_insurance" numeric(10, 2),
	"pmi" numeric(10, 2),
	"other_monthly" numeric(10, 2),
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loans_loan_number_unique" UNIQUE("loan_number")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer,
	"email_attempted" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"outcome" "login_outcome" NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "mfa_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"factor_id" integer,
	"challenge_id" text,
	"event_type" text NOT NULL,
	"event_details" jsonb DEFAULT '{}',
	"ip" text,
	"user_agent" text,
	"device_fingerprint" text,
	"success" boolean NOT NULL,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_backup_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp,
	"used_ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mfa_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"session_id" text,
	"factor_id" integer,
	"challenge_type" text NOT NULL,
	"action" text,
	"required_factors" integer DEFAULT 1,
	"completed_factors" integer DEFAULT 0,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 5,
	"last_attempt_at" timestamp,
	"locked_until" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp,
	"ip" text,
	"user_agent" text,
	"device_fingerprint" text,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "mfa_challenges_challenge_id_unique" UNIQUE("challenge_id")
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
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "payments_inbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_number" text,
	"value_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"borrower_id" integer,
	"loan_id" integer,
	"matched_by" text,
	"match_confidence" numeric(3, 2),
	"status" text DEFAULT 'unmatched' NOT NULL,
	"processed_at" timestamp,
	"processed_by_run_id" text,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_inbox_reference_number_unique" UNIQUE("reference_number")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource" text NOT NULL,
	"level" "permission_level" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"scope" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "servicing_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"loan_id" integer,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"valuation_date" date NOT NULL,
	"amount" numeric(12, 2),
	"principal" numeric(12, 2),
	"interest" numeric(12, 2),
	"escrow" numeric(12, 2),
	"fees" numeric(12, 2),
	"details" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicing_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text,
	"loan_id" integer,
	"severity" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"suggested_action" text,
	"due_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"metadata" jsonb DEFAULT '{}',
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
CREATE TABLE "servicing_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"valuation_date" date NOT NULL,
	"start_time" timestamp DEFAULT now() NOT NULL,
	"end_time" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"loans_processed" integer DEFAULT 0 NOT NULL,
	"total_loans" integer DEFAULT 0 NOT NULL,
	"events_created" integer DEFAULT 0 NOT NULL,
	"exceptions_created" integer DEFAULT 0 NOT NULL,
	"total_disbursed_beneficiary" numeric(12, 2) DEFAULT '0.00',
	"total_disbursed_investors" numeric(12, 2) DEFAULT '0.00',
	"reconciliation_status" text DEFAULT 'pending',
	"input_hash" text,
	"errors" text[],
	"dry_run" boolean DEFAULT false NOT NULL,
	"loan_ids" text[],
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "servicing_runs_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text
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
CREATE TABLE "user_ip_allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"label" text NOT NULL,
	"cidr" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"begins_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_mfa_factors" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"factor_type" text NOT NULL,
	"factor_name" text NOT NULL,
	"totp_secret" text,
	"totp_issuer" text DEFAULT 'LoanServe Pro',
	"totp_algorithm" text DEFAULT 'SHA1',
	"totp_digits" integer DEFAULT 6,
	"totp_period" integer DEFAULT 30,
	"phone_number" text,
	"email_address" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"last_used_at" timestamp,
	"trusted_devices" jsonb DEFAULT '[]',
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"enrolled_ip" text,
	"enrolled_user_agent" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" integer NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" integer,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
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
	"mfa_enabled" boolean DEFAULT false,
	"mfa_required" boolean DEFAULT false,
	"require_mfa_for_sensitive" boolean DEFAULT true,
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
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_calls" ADD CONSTRAINT "crm_calls_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_calls" ADD CONSTRAINT "crm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_collaborators" ADD CONSTRAINT "crm_collaborators_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_collaborators" ADD CONSTRAINT "crm_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_collaborators" ADD CONSTRAINT "crm_collaborators_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "escrow_advances" ADD CONSTRAINT "escrow_advances_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_advances" ADD CONSTRAINT "escrow_advances_escrow_account_id_escrow_accounts_id_fk" FOREIGN KEY ("escrow_account_id") REFERENCES "public"."escrow_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_advances" ADD CONSTRAINT "escrow_advances_run_id_servicing_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."servicing_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_disbursement_payments" ADD CONSTRAINT "escrow_disbursement_payments_disbursement_id_escrow_disbursements_id_fk" FOREIGN KEY ("disbursement_id") REFERENCES "public"."escrow_disbursements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_disbursement_payments" ADD CONSTRAINT "escrow_disbursement_payments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_disbursement_payments" ADD CONSTRAINT "escrow_disbursement_payments_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_disbursements" ADD CONSTRAINT "escrow_disbursements_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_disbursements" ADD CONSTRAINT "escrow_disbursements_escrow_account_id_escrow_accounts_id_fk" FOREIGN KEY ("escrow_account_id") REFERENCES "public"."escrow_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_disbursements" ADD CONSTRAINT "escrow_disbursements_insurance_document_id_documents_id_fk" FOREIGN KEY ("insurance_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_escrow_account_id_escrow_accounts_id_fk" FOREIGN KEY ("escrow_account_id") REFERENCES "public"."escrow_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_payee_id_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_templates" ADD CONSTRAINT "fee_templates_lender_id_users_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_guarantor_entity_id_borrower_entities_id_fk" FOREIGN KEY ("guarantor_entity_id") REFERENCES "public"."borrower_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_accruals" ADD CONSTRAINT "interest_accruals_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_accruals" ADD CONSTRAINT "interest_accruals_run_id_servicing_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."servicing_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_distributions" ADD CONSTRAINT "investor_distributions_run_id_servicing_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."servicing_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_distributions" ADD CONSTRAINT "investor_distributions_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_distributions" ADD CONSTRAINT "investor_distributions_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_proceedings" ADD CONSTRAINT "legal_proceedings_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_borrowers" ADD CONSTRAINT "loan_borrowers_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_borrowers" ADD CONSTRAINT "loan_borrowers_borrower_id_borrower_entities_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "public"."borrower_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_fees" ADD CONSTRAINT "loan_fees_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_fees" ADD CONSTRAINT "loan_fees_waived_by_users_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_reversal_of_loan_ledger_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."loan_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_reversed_by_loan_ledger_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."loan_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_lender_id_users_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_servicer_id_users_id_fk" FOREIGN KEY ("servicer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_audit_log" ADD CONSTRAINT "mfa_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_audit_log" ADD CONSTRAINT "mfa_audit_log_factor_id_user_mfa_factors_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."user_mfa_factors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_audit_log" ADD CONSTRAINT "mfa_audit_log_challenge_id_mfa_challenges_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."mfa_challenges"("challenge_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_factor_id_user_mfa_factors_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."user_mfa_factors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule" ADD CONSTRAINT "payment_schedule_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_schedule_id_payment_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."payment_schedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_inbox" ADD CONSTRAINT "payments_inbox_borrower_id_borrower_entities_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "public"."borrower_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_inbox" ADD CONSTRAINT "payments_inbox_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_inbox" ADD CONSTRAINT "payments_inbox_processed_by_run_id_servicing_runs_run_id_fk" FOREIGN KEY ("processed_by_run_id") REFERENCES "public"."servicing_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_events" ADD CONSTRAINT "servicing_events_run_id_servicing_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."servicing_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_events" ADD CONSTRAINT "servicing_events_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_exceptions" ADD CONSTRAINT "servicing_exceptions_run_id_servicing_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."servicing_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_exceptions" ADD CONSTRAINT "servicing_exceptions_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_exceptions" ADD CONSTRAINT "servicing_exceptions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_instructions" ADD CONSTRAINT "servicing_instructions_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_instructions" ADD CONSTRAINT "servicing_instructions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_instructions" ADD CONSTRAINT "servicing_instructions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicing_runs" ADD CONSTRAINT "servicing_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ip_allowlist" ADD CONSTRAINT "user_ip_allowlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mfa_factors" ADD CONSTRAINT "user_mfa_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_auth_events_occurred_at" ON "auth_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_auth_events_actor_user_id" ON "auth_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "idx_auth_events_target_user_id" ON "auth_events" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "idx_auth_events_event_type" ON "auth_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "borrower_entity_type_idx" ON "borrower_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "borrower_email_idx" ON "borrower_entities" USING btree ("email");--> statement-breakpoint
CREATE INDEX "borrower_ssn_idx" ON "borrower_entities" USING btree ("ssn");--> statement-breakpoint
CREATE INDEX "borrower_ein_idx" ON "borrower_entities" USING btree ("ein");--> statement-breakpoint
CREATE INDEX "collection_loan_idx" ON "collection_activities" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "collection_date_idx" ON "collection_activities" USING btree ("activity_date");--> statement-breakpoint
CREATE INDEX "collection_status_idx" ON "collection_activities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_activity_loan_idx" ON "crm_activity" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "crm_activity_user_idx" ON "crm_activity" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_activity_type_idx" ON "crm_activity" USING btree ("activity_type");--> statement-breakpoint
CREATE INDEX "crm_activity_created_at_idx" ON "crm_activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crm_appointments_loan_idx" ON "crm_appointments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "crm_appointments_start_time_idx" ON "crm_appointments" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "crm_appointments_status_idx" ON "crm_appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_calls_loan_idx" ON "crm_calls" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "crm_calls_user_idx" ON "crm_calls" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_calls_status_idx" ON "crm_calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_calls_scheduled_for_idx" ON "crm_calls" USING btree ("scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_collaborators_loan_user_idx" ON "crm_collaborators" USING btree ("loan_id","user_id");--> statement-breakpoint
CREATE INDEX "crm_collaborators_loan_idx" ON "crm_collaborators" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "crm_collaborators_user_idx" ON "crm_collaborators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_deals_loan_idx" ON "crm_deals" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "crm_deals_stage_idx" ON "crm_deals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "crm_deals_assigned_to_idx" ON "crm_deals" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "crm_notes_loan_idx" ON "crm_notes" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "crm_notes_user_idx" ON "crm_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_notes_created_at_idx" ON "crm_notes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crm_tasks_loan_idx" ON "crm_tasks" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "crm_tasks_assigned_to_idx" ON "crm_tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "crm_tasks_status_idx" ON "crm_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_tasks_due_date_idx" ON "crm_tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "document_loan_idx" ON "documents" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "document_borrower_idx" ON "documents" USING btree ("borrower_id");--> statement-breakpoint
CREATE INDEX "document_category_idx" ON "documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "document_uploaded_by_idx" ON "documents" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "document_date_idx" ON "documents" USING btree ("document_date");--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_account_number_idx" ON "escrow_accounts" USING btree ("account_number");--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_loan_idx" ON "escrow_accounts" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "escrow_active_idx" ON "escrow_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "escrow_advances_loan_id_idx" ON "escrow_advances" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "escrow_advances_status_idx" ON "escrow_advances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "escrow_payment_disbursement_idx" ON "escrow_disbursement_payments" USING btree ("disbursement_id");--> statement-breakpoint
CREATE INDEX "escrow_payment_loan_idx" ON "escrow_disbursement_payments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "escrow_payment_due_date_idx" ON "escrow_disbursement_payments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "escrow_payment_status_idx" ON "escrow_disbursement_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "escrow_disb_loan_idx" ON "escrow_disbursements" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "escrow_disb_account_idx" ON "escrow_disbursements" USING btree ("escrow_account_id");--> statement-breakpoint
CREATE INDEX "escrow_disb_type_idx" ON "escrow_disbursements" USING btree ("disbursement_type");--> statement-breakpoint
CREATE INDEX "escrow_disb_next_due_idx" ON "escrow_disbursements" USING btree ("next_due_date");--> statement-breakpoint
CREATE INDEX "escrow_disb_status_idx" ON "escrow_disbursements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "escrow_disb_hold_idx" ON "escrow_disbursements" USING btree ("is_on_hold");--> statement-breakpoint
CREATE INDEX "escrow_trans_account_idx" ON "escrow_transactions" USING btree ("escrow_account_id");--> statement-breakpoint
CREATE INDEX "escrow_trans_date_idx" ON "escrow_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "escrow_trans_type_idx" ON "escrow_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "fee_template_lender_idx" ON "fee_templates" USING btree ("lender_id");--> statement-breakpoint
CREATE INDEX "fee_template_default_idx" ON "fee_templates" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "guarantor_loan_idx" ON "guarantors" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "guarantor_entity_idx" ON "guarantors" USING btree ("guarantor_entity_id");--> statement-breakpoint
CREATE INDEX "insurance_loan_idx" ON "insurance_policies" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "insurance_property_idx" ON "insurance_policies" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "insurance_policy_number_idx" ON "insurance_policies" USING btree ("policy_number");--> statement-breakpoint
CREATE INDEX "insurance_expiration_idx" ON "insurance_policies" USING btree ("expiration_date");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_accrual" ON "interest_accruals" USING btree ("loan_id","accrual_date");--> statement-breakpoint
CREATE INDEX "interest_accruals_loan_id_idx" ON "interest_accruals" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "investor_distributions_loan_investor_idx" ON "investor_distributions" USING btree ("loan_id","investor_id");--> statement-breakpoint
CREATE INDEX "investor_distributions_run_id_idx" ON "investor_distributions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "investor_loan_idx" ON "investors" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investor_id_idx" ON "investors" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_active_idx" ON "investors" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "legal_loan_idx" ON "legal_proceedings" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "legal_type_idx" ON "legal_proceedings" USING btree ("proceeding_type");--> statement-breakpoint
CREATE INDEX "legal_case_idx" ON "legal_proceedings" USING btree ("case_number");--> statement-breakpoint
CREATE UNIQUE INDEX "loan_borrower_idx" ON "loan_borrowers" USING btree ("loan_id","borrower_id");--> statement-breakpoint
CREATE INDEX "loan_borrowers_loan_idx" ON "loan_borrowers" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loan_borrowers_borrower_idx" ON "loan_borrowers" USING btree ("borrower_id");--> statement-breakpoint
CREATE INDEX "loan_fee_loan_idx" ON "loan_fees" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loan_fee_type_idx" ON "loan_fees" USING btree ("fee_type");--> statement-breakpoint
CREATE INDEX "loan_fee_due_date_idx" ON "loan_fees" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "ledger_loan_idx" ON "loan_ledger" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "ledger_date_idx" ON "loan_ledger" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "ledger_status_idx" ON "loan_ledger" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_type_idx" ON "loan_ledger" USING btree ("transaction_type");--> statement-breakpoint
CREATE UNIQUE INDEX "loan_number_idx" ON "loans" USING btree ("loan_number");--> statement-breakpoint
CREATE INDEX "loan_status_idx" ON "loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "loan_property_idx" ON "loans" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "loan_maturity_idx" ON "loans" USING btree ("maturity_date");--> statement-breakpoint
CREATE INDEX "loan_next_payment_idx" ON "loans" USING btree ("next_payment_date");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_user_id" ON "login_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_attempted_at" ON "login_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_ip" ON "login_attempts" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "mfa_audit_log_user_id_idx" ON "mfa_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mfa_audit_log_event_type_idx" ON "mfa_audit_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "mfa_audit_log_created_at_idx" ON "mfa_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mfa_backup_codes_user_id_idx" ON "mfa_backup_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_backup_codes_code_hash_idx" ON "mfa_backup_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_challenges_challenge_id_idx" ON "mfa_challenges" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "mfa_challenges_user_id_idx" ON "mfa_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mfa_challenges_status_idx" ON "mfa_challenges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mfa_challenges_expires_at_idx" ON "mfa_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_is_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "notification_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notification_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_token" ON "password_reset_tokens" USING btree ("user_id","token_hash");--> statement-breakpoint
CREATE INDEX "idx_password_reset_tokens_user_id" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_password_reset_tokens_expires_at" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
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
CREATE INDEX "payments_inbox_loan_id_idx" ON "payments_inbox" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "payments_inbox_status_idx" ON "payments_inbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_inbox_value_date_idx" ON "payments_inbox" USING btree ("value_date");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_resource_level" ON "permissions" USING btree ("resource","level");--> statement-breakpoint
CREATE INDEX "property_apn_idx" ON "properties" USING btree ("apn");--> statement-breakpoint
CREATE INDEX "property_address_idx" ON "properties" USING btree ("address","city","state");--> statement-breakpoint
CREATE INDEX "property_type_idx" ON "properties" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX "idx_role_permissions_role_id" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_event_key" ON "servicing_events" USING btree ("valuation_date","event_key");--> statement-breakpoint
CREATE INDEX "servicing_events_loan_id_idx" ON "servicing_events" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "servicing_events_run_id_idx" ON "servicing_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "servicing_events_type_idx" ON "servicing_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "servicing_exceptions_loan_id_idx" ON "servicing_exceptions" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "servicing_exceptions_status_idx" ON "servicing_exceptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "servicing_exceptions_severity_idx" ON "servicing_exceptions" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "servicing_loan_idx" ON "servicing_instructions" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "servicing_type_idx" ON "servicing_instructions" USING btree ("instruction_type");--> statement-breakpoint
CREATE INDEX "servicing_active_idx" ON "servicing_instructions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_last_seen_at" ON "sessions" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_category_key_idx" ON "system_settings" USING btree ("category","key");--> statement-breakpoint
CREATE INDEX "task_assigned_to_idx" ON "tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "task_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "task_due_date_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "task_loan_idx" ON "tasks" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_cidr" ON "user_ip_allowlist" USING btree ("user_id","cidr");--> statement-breakpoint
CREATE INDEX "idx_user_ip_allowlist_user_id" ON "user_ip_allowlist" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_mfa_factors_user_id_idx" ON "user_mfa_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_mfa_factors_factor_type_idx" ON "user_mfa_factors" USING btree ("factor_type");--> statement-breakpoint
CREATE INDEX "user_mfa_factors_active_idx" ON "user_mfa_factors" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_user_roles_user_id" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_roles_role_id" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "user_active_idx" ON "users" USING btree ("is_active");