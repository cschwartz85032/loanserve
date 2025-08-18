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
	"ownership_percentage" numeric(5, 2) NOT NULL,
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
ALTER TABLE "audit_logs" ADD COLUMN "loan_id" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "prepayment_expiration_date" date;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "borrower_name" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "borrower_company_name" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "borrower_email" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "borrower_phone" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "borrower_address" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "borrower_city" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "borrower_state" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "borrower_zip" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "borrower_ssn" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "borrower_income" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "trustee_name" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "trustee_company_name" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "trustee_phone" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "trustee_email" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "trustee_street_address" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "trustee_city" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "trustee_state" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "trustee_zip_code" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "beneficiary_name" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "beneficiary_company_name" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "beneficiary_phone" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "beneficiary_email" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "beneficiary_street_address" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "beneficiary_city" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "beneficiary_state" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "beneficiary_zip_code" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "escrow_company_name" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "escrow_number" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "escrow_company_phone" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "escrow_company_email" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "escrow_company_street_address" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "escrow_company_city" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "escrow_company_state" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "escrow_company_zip_code" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "loan_documents" jsonb;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "default_conditions" jsonb;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "insurance_requirements" jsonb;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "cross_default_parties" jsonb;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "closing_costs" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "down_payment" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "fee_templates" ADD CONSTRAINT "fee_templates_lender_id_users_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_fees" ADD CONSTRAINT "loan_fees_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_fees" ADD CONSTRAINT "loan_fees_waived_by_users_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_reversal_of_loan_ledger_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."loan_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_reversed_by_loan_ledger_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."loan_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_template_lender_idx" ON "fee_templates" USING btree ("lender_id");--> statement-breakpoint
CREATE INDEX "fee_template_default_idx" ON "fee_templates" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "investor_loan_idx" ON "investors" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investor_id_idx" ON "investors" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_active_idx" ON "investors" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "loan_fee_loan_idx" ON "loan_fees" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loan_fee_type_idx" ON "loan_fees" USING btree ("fee_type");--> statement-breakpoint
CREATE INDEX "loan_fee_due_date_idx" ON "loan_fees" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "ledger_loan_idx" ON "loan_ledger" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "ledger_date_idx" ON "loan_ledger" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "ledger_status_idx" ON "loan_ledger" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_type_idx" ON "loan_ledger" USING btree ("transaction_type");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;