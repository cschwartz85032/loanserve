-- Add new enums for escrow disbursement management
CREATE TYPE "disbursement_type" AS ENUM('taxes', 'insurance', 'hoa', 'other');
CREATE TYPE "payment_method" AS ENUM('check', 'ach', 'wire', 'cash', 'credit_card', 'online');
CREATE TYPE "disbursement_status" AS ENUM('active', 'on_hold', 'suspended', 'cancelled', 'completed');

-- Create escrow_disbursements table
CREATE TABLE IF NOT EXISTS "escrow_disbursements" (
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
	"payment_method" "payment_method" DEFAULT 'check' NOT NULL,
	"account_number" text,
	"routing_number" text,
	"account_type" text,
	"bank_name" text,
	"wire_instructions" text,
	"remittance_address" text,
	"remittance_city" text,
	"remittance_state" text,
	"remittance_zip_code" text,
	"account_number_2" text,
	"reference_number" text,
	"frequency" "frequency" NOT NULL,
	"monthly_amount" numeric(10,2),
	"annual_amount" numeric(10,2) NOT NULL,
	"payment_amount" numeric(10,2) NOT NULL,
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

-- Create escrow_disbursement_payments table
CREATE TABLE IF NOT EXISTS "escrow_disbursement_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"disbursement_id" integer NOT NULL,
	"loan_id" integer NOT NULL,
	"ledger_entry_id" integer,
	"payment_date" timestamp NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(10,2) NOT NULL,
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

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "escrow_disbursements" ADD CONSTRAINT "escrow_disbursements_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "escrow_disbursements" ADD CONSTRAINT "escrow_disbursements_escrow_account_id_escrow_accounts_id_fk" FOREIGN KEY ("escrow_account_id") REFERENCES "escrow_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "escrow_disbursement_payments" ADD CONSTRAINT "escrow_disbursement_payments_disbursement_id_escrow_disbursements_id_fk" FOREIGN KEY ("disbursement_id") REFERENCES "escrow_disbursements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "escrow_disbursement_payments" ADD CONSTRAINT "escrow_disbursement_payments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "escrow_disbursement_payments" ADD CONSTRAINT "escrow_disbursement_payments_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "escrow_disbursement_payments" ADD CONSTRAINT "escrow_disbursement_payments_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "escrow_disb_loan_idx" ON "escrow_disbursements" ("loan_id");
CREATE INDEX IF NOT EXISTS "escrow_disb_account_idx" ON "escrow_disbursements" ("escrow_account_id");
CREATE INDEX IF NOT EXISTS "escrow_disb_type_idx" ON "escrow_disbursements" ("disbursement_type");
CREATE INDEX IF NOT EXISTS "escrow_disb_next_due_idx" ON "escrow_disbursements" ("next_due_date");
CREATE INDEX IF NOT EXISTS "escrow_disb_status_idx" ON "escrow_disbursements" ("status");
CREATE INDEX IF NOT EXISTS "escrow_disb_hold_idx" ON "escrow_disbursements" ("is_on_hold");

CREATE INDEX IF NOT EXISTS "escrow_payment_disbursement_idx" ON "escrow_disbursement_payments" ("disbursement_id");
CREATE INDEX IF NOT EXISTS "escrow_payment_loan_idx" ON "escrow_disbursement_payments" ("loan_id");
CREATE INDEX IF NOT EXISTS "escrow_payment_due_date_idx" ON "escrow_disbursement_payments" ("due_date");
CREATE INDEX IF NOT EXISTS "escrow_payment_status_idx" ON "escrow_disbursement_payments" ("status");