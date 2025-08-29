-- CRM Baseline Database Migrations
-- Fire-and-queue outbox pattern with DNC enforcement

-- Create outbox category enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbox_category') THEN
    CREATE TYPE outbox_category AS ENUM ('transactional', 'marketing');
  END IF;
END $$;

-- Create outbox_messages table for fire-and-queue pattern
CREATE TABLE IF NOT EXISTS public.outbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz,
  correlation_id text,
  category outbox_category NOT NULL DEFAULT 'transactional'
);

-- Indexes for outbox performance
CREATE INDEX IF NOT EXISTS idx_outbox_unpublished 
  ON public.outbox_messages (created_at) WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_category_unpublished
  ON public.outbox_messages (category) WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_retry
  ON public.outbox_messages (next_retry_at) WHERE published_at IS NULL AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_correlation
  ON public.outbox_messages (correlation_id);

-- Communication preferences table (Option A - separate table)
CREATE TABLE IF NOT EXISTS public.contact_comm_prefs (
  contact_id bigint PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  do_not_email boolean NOT NULL DEFAULT false,
  do_not_text boolean NOT NULL DEFAULT false,
  do_not_call boolean NOT NULL DEFAULT false,
  reason text,
  policy_basis text, -- e.g. "customer_request", "legal_block", "system"
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful read path view
CREATE OR REPLACE VIEW public.v_contact_comm_prefs AS
  SELECT c.id AS contact_id,
         COALESCE(p.do_not_email, false) AS do_not_email,
         COALESCE(p.do_not_text, false) AS do_not_text,
         COALESCE(p.do_not_call, false) AS do_not_call,
         p.reason,
         p.policy_basis,
         p.updated_by,
         p.updated_at
  FROM public.contacts c
  LEFT JOIN public.contact_comm_prefs p ON p.contact_id = c.id;

-- Email artifacts table for immutable storage
CREATE TABLE IF NOT EXISTS public.email_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  loan_id bigint,
  correlation_id text NOT NULL,
  rendered_subject text NOT NULL,
  rendered_body text NOT NULL,
  rendered_html text,
  recipient_list jsonb NOT NULL, -- ["to", "cc", "bcc"] arrays
  attachment_manifest jsonb, -- [{filename, hash, size}]
  template_id text,
  variables_used jsonb,
  content_hash text NOT NULL, -- SHA-256 of full content
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for artifact retrieval
CREATE INDEX IF NOT EXISTS idx_email_artifacts_event_id ON public.email_artifacts (event_id);
CREATE INDEX IF NOT EXISTS idx_email_artifacts_loan_id ON public.email_artifacts (loan_id);
CREATE INDEX IF NOT EXISTS idx_email_artifacts_correlation ON public.email_artifacts (correlation_id);
CREATE INDEX IF NOT EXISTS idx_email_artifacts_hash ON public.email_artifacts (content_hash);

-- Processed events table for idempotency
CREATE TABLE IF NOT EXISTS public.processed_events (
  message_id uuid PRIMARY KEY,
  event_type text NOT NULL,
  correlation_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  result_status text NOT NULL, -- 'success', 'failed', 'skipped'
  artifact_id uuid REFERENCES public.email_artifacts(id)
);

CREATE INDEX IF NOT EXISTS idx_processed_events_correlation ON public.processed_events (correlation_id);

-- Email templates table
CREATE TABLE IF NOT EXISTS public.email_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  html_template text,
  allowed_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default templates
INSERT INTO public.email_templates (id, name, description, subject_template, body_template, allowed_variables) 
VALUES 
  ('escrow-analysis-v1', 'Escrow Analysis Notice', 'Annual escrow analysis communication', 
   'Your {{LoanYear}} Escrow Analysis - Loan {{LoanNumber}}', 
   'Dear {{BorrowerName}},\n\nYour annual escrow analysis is complete for loan {{LoanNumber}}.\n\nBest regards,\nLoan Servicing Team',
   '["BorrowerName", "LoanNumber", "LoanYear", "EscrowAmount", "PropertyAddress"]'::jsonb),
  ('payment-reminder-v1', 'Payment Reminder', 'Monthly payment reminder', 
   'Payment Reminder - Loan {{LoanNumber}}',
   'Dear {{BorrowerName}},\n\nThis is a reminder that your payment of ${{PaymentAmount}} is due on {{DueDate}}.\n\nLoan Number: {{LoanNumber}}\nProperty: {{PropertyAddress}}\n\nThank you.',
   '["BorrowerName", "LoanNumber", "PaymentAmount", "DueDate", "PropertyAddress"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Backfill category for existing outbox messages
UPDATE public.outbox_messages
SET category = 'transactional'
WHERE category IS DISTINCT FROM 'transactional';

COMMENT ON TABLE public.outbox_messages IS 'Fire-and-queue outbox pattern for CRM communications';
COMMENT ON TABLE public.contact_comm_prefs IS 'Do Not Contact preferences with audit trail';
COMMENT ON TABLE public.email_artifacts IS 'Immutable storage for rendered email content';
COMMENT ON TABLE public.processed_events IS 'Idempotency tracking for message processing';
COMMENT ON TABLE public.email_templates IS 'Email templates with variable allow-lists';