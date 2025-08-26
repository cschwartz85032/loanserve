--
-- PostgreSQL database dump
--

-- Dumped from database version 16.9 (84ade85)
-- Dumped by pg_dump version 16.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: ach_service_class; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ach_service_class AS ENUM (
    '200',
    '220',
    '225'
);


--
-- Name: ach_txn_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ach_txn_code AS ENUM (
    '22',
    '27',
    '32',
    '37'
);


--
-- Name: bank_stmt_format; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.bank_stmt_format AS ENUM (
    'bai2',
    'camt.053'
);


--
-- Name: bank_txn_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.bank_txn_type AS ENUM (
    'credit',
    'debit',
    'fee',
    'return'
);


--
-- Name: collection_case_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.collection_case_status AS ENUM (
    'normal',
    'soft',
    'hard',
    'pre_foreclosure',
    'foreclosure',
    'bankruptcy',
    'closed'
);


--
-- Name: collection_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.collection_status AS ENUM (
    'current',
    'contact_made',
    'promise_to_pay',
    'arrangement_made',
    'broken_promise',
    'skip_trace',
    'legal_review',
    'foreclosure_initiated',
    'charge_off_pending'
);


--
-- Name: compounding_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.compounding_method AS ENUM (
    'simple',
    'compound'
);


--
-- Name: day_count_convention; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.day_count_convention AS ENUM (
    'ACT_365F',
    'ACT_360',
    'US_30_360',
    'EURO_30_360',
    'ACT_ACT'
);


--
-- Name: delinquency_bucket; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.delinquency_bucket AS ENUM (
    'current',
    'dpd_1_29',
    'dpd_30_59',
    'dpd_60_89',
    'dpd_90_plus'
);


--
-- Name: disbursement_payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.disbursement_payment_method AS ENUM (
    'check',
    'ach',
    'wire'
);


--
-- Name: disbursement_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.disbursement_status AS ENUM (
    'active',
    'on_hold',
    'suspended',
    'cancelled',
    'completed',
    'terminated'
);


--
-- Name: disbursement_status_v2; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.disbursement_status_v2 AS ENUM (
    'scheduled',
    'posted',
    'canceled'
);


--
-- Name: disbursement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.disbursement_type AS ENUM (
    'taxes',
    'insurance',
    'hoa',
    'other'
);


--
-- Name: document_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_category AS ENUM (
    'loan_application',
    'loan_agreement',
    'promissory_note',
    'deed_of_trust',
    'mortgage',
    'security_agreement',
    'ucc_filing',
    'assignment',
    'modification',
    'forbearance_agreement',
    'insurance_policy',
    'tax_document',
    'escrow_statement',
    'title_report',
    'appraisal',
    'inspection',
    'financial_statement',
    'income_verification',
    'closing_disclosure',
    'settlement_statement',
    'reconveyance',
    'release',
    'legal_notice',
    'correspondence',
    'servicing_transfer',
    'compliance',
    'other'
);


--
-- Name: document_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_type AS ENUM (
    'billing_statement',
    'escrow_analysis',
    'year_end_1098',
    'notice'
);


--
-- Name: entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.entity_type AS ENUM (
    'individual',
    'corporation',
    'llc',
    'partnership',
    'trust',
    'estate',
    'government'
);


--
-- Name: escrow_type_v2; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.escrow_type_v2 AS ENUM (
    'tax',
    'hazard',
    'flood',
    'mip',
    'pmi',
    'hoa',
    'other'
);


--
-- Name: fee_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fee_code AS ENUM (
    'late',
    'nsf',
    'deferral',
    'extension',
    'other'
);


--
-- Name: foreclosure_milestone; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.foreclosure_milestone AS ENUM (
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


--
-- Name: frequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.frequency AS ENUM (
    'once',
    'daily',
    'weekly',
    'bi_weekly',
    'semi_monthly',
    'monthly',
    'quarterly',
    'semi_annual',
    'annual'
);


--
-- Name: gl_account; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gl_account AS ENUM (
    'loan_principal',
    'interest_receivable',
    'cash',
    'suspense',
    'fees_receivable',
    'escrow_liability',
    'investor_liability',
    'interest_income',
    'fee_income',
    'writeoff_expense',
    'servicing_expense',
    'escrow_advances',
    'escrow_refund_payable',
    'late_fee_income',
    'fee_expense',
    'nsf_fee_income'
);


--
-- Name: interest_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.interest_type AS ENUM (
    'fixed',
    'arm',
    'io_then_p_i',
    'interest_only'
);


--
-- Name: jurisdiction_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.jurisdiction_code AS ENUM (
    'US_AZ',
    'US_CA',
    'US_TX',
    'US_NY',
    'US_FL',
    'US_CO',
    'US_NV',
    'US_IL',
    'US_WA',
    'US_MA',
    'US_PA',
    'US_GA',
    'US_NC',
    'US_OH',
    'US_MI'
);


--
-- Name: loan_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.loan_status AS ENUM (
    'application',
    'underwriting',
    'approved',
    'active',
    'current',
    'delinquent',
    'default',
    'forbearance',
    'modification',
    'foreclosure',
    'reo',
    'closed',
    'paid_off',
    'charged_off'
);


--
-- Name: loan_status_v2; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.loan_status_v2 AS ENUM (
    'active',
    'matured',
    'paid_off',
    'defaulted',
    'charged_off',
    'in_modification',
    'bankruptcy',
    'foreclosure'
);


--
-- Name: loan_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.loan_type AS ENUM (
    'conventional',
    'fha',
    'va',
    'usda',
    'jumbo',
    'portfolio',
    'hard_money',
    'bridge',
    'construction',
    'commercial',
    'reverse_mortgage'
);


--
-- Name: login_outcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.login_outcome AS ENUM (
    'succeeded',
    'failed',
    'locked'
);


--
-- Name: notice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notice_status AS ENUM (
    'scheduled',
    'sent',
    'canceled'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'payment_due',
    'payment_received',
    'payment_failed',
    'payment_late',
    'document_required',
    'document_received',
    'escrow_shortage',
    'escrow_surplus',
    'escrow_analysis',
    'insurance_expiring',
    'tax_due',
    'rate_change',
    'maturity_approaching',
    'system',
    'legal',
    'compliance'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'check',
    'ach',
    'wire',
    'cash',
    'credit_card',
    'online'
);


--
-- Name: payment_method_v2; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method_v2 AS ENUM (
    'ach',
    'card',
    'wire',
    'check',
    'cash',
    'other'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'scheduled',
    'pending',
    'processing',
    'completed',
    'failed',
    'reversed',
    'partial',
    'late',
    'nsf',
    'waived'
);


--
-- Name: permission_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.permission_level AS ENUM (
    'none',
    'read',
    'write',
    'admin'
);


--
-- Name: plan_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.plan_status AS ENUM (
    'draft',
    'active',
    'completed',
    'defaulted',
    'canceled'
);


--
-- Name: plan_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.plan_type AS ENUM (
    'repayment',
    'deferral',
    'forbearance',
    'trial_mod'
);


--
-- Name: priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent',
    'critical'
);


--
-- Name: property_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.property_type AS ENUM (
    'single_family',
    'condo',
    'townhouse',
    'multi_family',
    'manufactured',
    'commercial',
    'land',
    'mixed_use'
);


--
-- Name: recon_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recon_status AS ENUM (
    'new',
    'investigating',
    'resolved',
    'written_off'
);


--
-- Name: remit_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.remit_status AS ENUM (
    'open',
    'locked',
    'file_generated',
    'sent',
    'settled',
    'closed'
);


--
-- Name: rounding_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rounding_mode AS ENUM (
    'half_away_from_zero',
    'half_even'
);


--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaction_type AS ENUM (
    'deposit',
    'withdrawal',
    'transfer',
    'payment_principal',
    'payment_interest',
    'payment_escrow',
    'payment_fee',
    'payment_late_fee',
    'insurance_premium',
    'property_tax',
    'hoa_fee',
    'disbursement',
    'adjustment',
    'refund'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'lender',
    'borrower',
    'investor',
    'escrow_officer',
    'legal',
    'servicer',
    'admin'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'invited',
    'active',
    'locked',
    'suspended',
    'disabled'
);


--
-- Name: acquire_loan_lock(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acquire_loan_lock(p_loan_id character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Use advisory lock on hash of loan_id
  PERFORM pg_advisory_lock(hashtext(p_loan_id));
END;
$$;


--
-- Name: get_loan_balances(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_loan_balances(p_loan_id integer) RETURNS TABLE(principal_minor numeric, interest_receivable_minor numeric, escrow_liability_minor numeric, fees_receivable_minor numeric, cash_minor numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN account = 'loan_principal' THEN debit_minor - credit_minor ELSE 0 END), 0) AS principal_minor,
    COALESCE(SUM(CASE WHEN account = 'interest_receivable' THEN debit_minor - credit_minor ELSE 0 END), 0) AS interest_receivable_minor,
    COALESCE(SUM(CASE WHEN account = 'escrow_liability' THEN credit_minor - debit_minor ELSE 0 END), 0) AS escrow_liability_minor,
    COALESCE(SUM(CASE WHEN account = 'fees_receivable' THEN debit_minor - credit_minor ELSE 0 END), 0) AS fees_receivable_minor,
    COALESCE(SUM(CASE WHEN account = 'cash' THEN debit_minor - credit_minor ELSE 0 END), 0) AS cash_minor
  FROM ledger_entry
  WHERE loan_id = p_loan_id
    AND event_id IN (SELECT event_id FROM ledger_event WHERE finalized_at IS NOT NULL);
END;
$$;


--
-- Name: release_loan_lock(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_loan_lock(p_loan_id character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM pg_advisory_unlock(hashtext(p_loan_id));
END;
$$;


--
-- Name: sp_finalize_ledger_event(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sp_finalize_ledger_event(p_event_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  tot_debit NUMERIC(20,0);
  tot_credit NUMERIC(20,0);
  is_final TIMESTAMPTZ;
BEGIN
  SELECT finalized_at INTO is_final FROM ledger_event WHERE event_id = p_event_id FOR UPDATE;
  IF is_final IS NOT NULL THEN
    RAISE EXCEPTION 'Event % already finalized', p_event_id;
  END IF;

  SELECT COALESCE(SUM(debit_minor),0), COALESCE(SUM(credit_minor),0)
  INTO tot_debit, tot_credit
  FROM ledger_entry WHERE event_id = p_event_id;

  IF tot_debit IS NULL OR tot_credit IS NULL OR tot_debit = 0 OR tot_credit = 0 THEN
    RAISE EXCEPTION 'Event % has no entries', p_event_id;
  END IF;

  IF tot_debit <> tot_credit THEN
    RAISE EXCEPTION 'Event % is unbalanced: debit % credit %', p_event_id, tot_debit, tot_credit;
  END IF;

  UPDATE ledger_event SET finalized_at = now() WHERE event_id = p_event_id;
END;
$$;


--
-- Name: trg_forbid_after_finalize(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_forbid_after_finalize() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE f TIMESTAMPTZ;
BEGIN
  SELECT finalized_at INTO f FROM ledger_event WHERE event_id = NEW.event_id;
  IF f IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot insert ledger_entry into finalized event %', NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: accounts_chart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts_chart (
    account character varying(50) NOT NULL,
    account_type character varying(20) NOT NULL,
    CONSTRAINT accounts_chart_account_type_check CHECK (((account_type)::text = ANY ((ARRAY['asset'::character varying, 'liability'::character varying, 'income'::character varying, 'expense'::character varying, 'equity'::character varying])::text[])))
);


--
-- Name: ach_batch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ach_batch (
    ach_batch_id uuid DEFAULT gen_random_uuid() NOT NULL,
    bank_acct_id uuid NOT NULL,
    service_class public.ach_service_class NOT NULL,
    company_id text NOT NULL,
    company_name text NOT NULL,
    effective_entry_date date NOT NULL,
    created_by text NOT NULL,
    total_entries integer DEFAULT 0 NOT NULL,
    total_amount_minor numeric(20,0) DEFAULT 0 NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ach_batch_status_check CHECK ((status = ANY (ARRAY['open'::text, 'sealed'::text, 'filed'::text, 'settled'::text, 'failed'::text])))
);


--
-- Name: ach_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ach_entry (
    ach_entry_id uuid DEFAULT gen_random_uuid() NOT NULL,
    ach_batch_id uuid NOT NULL,
    loan_id integer,
    txn_code public.ach_txn_code NOT NULL,
    rdfi_routing text NOT NULL,
    dda_account_mask text NOT NULL,
    amount_minor numeric(20,0) NOT NULL,
    trace_number text,
    addenda text,
    idempotency_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ach_entry_amount_minor_check CHECK ((amount_minor > (0)::numeric))
);


--
-- Name: ach_return; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ach_return (
    ach_return_id uuid DEFAULT gen_random_uuid() NOT NULL,
    ach_entry_id uuid NOT NULL,
    return_code text NOT NULL,
    return_date date NOT NULL,
    amount_minor numeric(20,0) NOT NULL,
    addenda text,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ach_return_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ach_return_windows (
    payment_id character varying(50) NOT NULL,
    return_code_class character varying(20) NOT NULL,
    window_expires_at timestamp with time zone NOT NULL,
    probe_scheduled boolean DEFAULT false
);


--
-- Name: allocation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allocation_rules (
    loan_id character varying(50) NOT NULL,
    priority integer NOT NULL,
    target character varying(50) NOT NULL,
    enabled boolean DEFAULT true,
    CONSTRAINT chk_allocation_target CHECK (((target)::text = ANY ((ARRAY['late_fees'::character varying, 'accrued_interest'::character varying, 'scheduled_principal'::character varying, 'escrow_shortage'::character varying, 'current_escrow'::character varying, 'unapplied_funds'::character varying])::text[])))
);


--
-- Name: aml_screenings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aml_screenings (
    screening_id bigint NOT NULL,
    subject_kind text NOT NULL,
    subject_id text NOT NULL,
    name text NOT NULL,
    dob date,
    address text,
    result text NOT NULL,
    score numeric(5,2) NOT NULL,
    screened_at timestamp with time zone DEFAULT now() NOT NULL,
    details_json jsonb
);


--
-- Name: aml_screenings_screening_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aml_screenings_screening_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aml_screenings_screening_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aml_screenings_screening_id_seq OWNED BY public.aml_screenings.screening_id;


--
-- Name: attorney; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attorney (
    attorney_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    phone text
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    event_id character varying(50) NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    object_kind text NOT NULL,
    object_id text NOT NULL,
    payload jsonb NOT NULL,
    prev_hash bytea,
    curr_hash bytea NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer,
    entity_type text NOT NULL,
    entity_id integer NOT NULL,
    action text NOT NULL,
    previous_values jsonb,
    new_values jsonb,
    changed_fields text[],
    ip_address text,
    user_agent text,
    session_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    loan_id integer
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: auth_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id integer,
    target_user_id integer,
    event_type text NOT NULL,
    ip inet,
    user_agent text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    event_key text,
    CONSTRAINT valid_event_type CHECK ((event_type = ANY (ARRAY['user_created'::text, 'user_updated'::text, 'user_deleted'::text, 'role_assigned'::text, 'role_revoked'::text, 'login_succeeded'::text, 'login_failed'::text, 'account_locked'::text, 'account_unlocked'::text, 'password_reset_requested'::text, 'password_reset_completed'::text, 'ip_allow_added'::text, 'ip_allow_removed'::text, 'permission_matrix_changed'::text, 'settings_changed'::text, 'session_created'::text, 'session_revoked'::text, 'pii_unmasked'::text, 'permission_granted'::text, 'permission_denied'::text, 'api_request'::text, 'payment.manual.submitted'::text, 'payment.manual.error'::text, 'payment.submitted'::text, 'payment.processed'::text, 'payment.failed'::text, 'payment.reversed'::text])))
);


--
-- Name: TABLE auth_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.auth_events IS 'Immutable audit log for all authentication and authorization events';


--
-- Name: COLUMN auth_events.actor_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_events.actor_user_id IS 'User performing the action, null for anonymous events';


--
-- Name: COLUMN auth_events.target_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_events.target_user_id IS 'User affected by the action';


--
-- Name: COLUMN auth_events.event_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_events.event_key IS 'Unique key for idempotency';


--
-- Name: bank_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_account (
    bank_acct_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    bank_id text NOT NULL,
    account_number_mask text NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    type text NOT NULL,
    gl_cash_account public.gl_account DEFAULT 'cash'::public.gl_account NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bank_account_type_check CHECK ((type = ANY (ARRAY['operating'::text, 'custodial_p_i'::text, 'escrow'::text, 'fees'::text])))
);


--
-- Name: bank_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_files (
    file_id bigint NOT NULL,
    source_system text NOT NULL,
    format text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    business_date date NOT NULL,
    sha256 bytea NOT NULL,
    row_count integer NOT NULL,
    status text DEFAULT 'ingested'::text NOT NULL,
    error_reason text
);


--
-- Name: bank_files_file_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_files_file_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_files_file_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_files_file_id_seq OWNED BY public.bank_files.file_id;


--
-- Name: bank_statement_file; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_statement_file (
    stmt_file_id uuid DEFAULT gen_random_uuid() NOT NULL,
    bank_acct_id uuid NOT NULL,
    format public.bank_stmt_format NOT NULL,
    as_of_date date NOT NULL,
    raw_bytes bytea NOT NULL,
    file_hash character(64) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bank_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_transactions (
    ext_tx_id text NOT NULL,
    file_id bigint,
    bank_account text NOT NULL,
    posted_at timestamp with time zone NOT NULL,
    amount_cents bigint NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    type text NOT NULL,
    method text NOT NULL,
    ext_reference text,
    counterparty text,
    memo text
);


--
-- Name: bank_txn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_txn (
    bank_txn_id uuid DEFAULT gen_random_uuid() NOT NULL,
    stmt_file_id uuid NOT NULL,
    bank_acct_id uuid NOT NULL,
    posted_date date NOT NULL,
    value_date date,
    amount_minor numeric(20,0) NOT NULL,
    type public.bank_txn_type NOT NULL,
    bank_ref text,
    description text,
    matched boolean DEFAULT false NOT NULL,
    matched_event_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: borrower_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.borrower_entities (
    id integer NOT NULL,
    entity_type public.entity_type NOT NULL,
    first_name text,
    last_name text,
    middle_name text,
    suffix text,
    date_of_birth date,
    ssn text,
    entity_name text,
    ein text,
    formation_date date,
    formation_state text,
    email text,
    phone text,
    mobile_phone text,
    fax text,
    website text,
    mailing_address text,
    mailing_address_2 text,
    mailing_city text,
    mailing_state text,
    mailing_zip text,
    mailing_country text DEFAULT 'USA'::text,
    credit_score integer,
    monthly_income numeric(12,2),
    total_assets numeric(15,2),
    total_liabilities numeric(15,2),
    is_active boolean DEFAULT true NOT NULL,
    verification_status text DEFAULT 'pending'::text,
    verification_date timestamp without time zone,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: borrower_entities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.borrower_entities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: borrower_entities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.borrower_entities_id_seq OWNED BY public.borrower_entities.id;


--
-- Name: cash_match_candidate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_match_candidate (
    candidate_id uuid DEFAULT gen_random_uuid() NOT NULL,
    bank_txn_id uuid NOT NULL,
    event_id uuid,
    score integer NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: collection_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_activities (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    activity_date timestamp without time zone DEFAULT now() NOT NULL,
    activity_type text NOT NULL,
    status public.collection_status NOT NULL,
    contact_method text,
    contact_person text,
    phone_number text,
    promise_date date,
    promise_amount numeric(10,2),
    result text,
    next_action_date date,
    next_action text,
    notes text NOT NULL,
    performed_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: collection_activities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.collection_activities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: collection_activities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.collection_activities_id_seq OWNED BY public.collection_activities.id;


--
-- Name: collection_case; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_case (
    case_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    status public.collection_case_status DEFAULT 'normal'::public.collection_case_status NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone
);


--
-- Name: consumer_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumer_inbox (
    consumer character varying(100) NOT NULL,
    message_id character varying(255) NOT NULL,
    processed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    result_hash character varying(64),
    result_data jsonb
);


--
-- Name: crm_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_activity (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    user_id integer NOT NULL,
    activity_type text NOT NULL,
    activity_data jsonb NOT NULL,
    related_id integer,
    is_system boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_activity_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_activity_id_seq OWNED BY public.crm_activity.id;


--
-- Name: crm_appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_appointments (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    created_by integer NOT NULL,
    title text NOT NULL,
    description text,
    location text,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone NOT NULL,
    attendees jsonb DEFAULT '[]'::jsonb,
    reminder_minutes integer DEFAULT 15,
    status text DEFAULT 'scheduled'::text,
    meeting_link text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_appointments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_appointments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_appointments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_appointments_id_seq OWNED BY public.crm_appointments.id;


--
-- Name: crm_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_calls (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    user_id integer NOT NULL,
    contact_name text NOT NULL,
    contact_phone text NOT NULL,
    direction text NOT NULL,
    status text NOT NULL,
    duration integer,
    outcome text,
    notes text,
    scheduled_for timestamp without time zone,
    completed_at timestamp without time zone,
    recording_url text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_calls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_calls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_calls_id_seq OWNED BY public.crm_calls.id;


--
-- Name: crm_collaborators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_collaborators (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    user_id integer NOT NULL,
    role text NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb,
    added_by integer NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp without time zone
);


--
-- Name: crm_collaborators_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_collaborators_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_collaborators_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_collaborators_id_seq OWNED BY public.crm_collaborators.id;


--
-- Name: crm_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_deals (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    title text NOT NULL,
    value numeric(12,2),
    stage text NOT NULL,
    probability integer DEFAULT 0,
    expected_close_date date,
    actual_close_date date,
    lost_reason text,
    notes text,
    created_by integer NOT NULL,
    assigned_to integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_deals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_deals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_deals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_deals_id_seq OWNED BY public.crm_deals.id;


--
-- Name: crm_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_notes (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    user_id integer NOT NULL,
    content text NOT NULL,
    is_private boolean DEFAULT false,
    mentioned_users jsonb DEFAULT '[]'::jsonb,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_notes_id_seq OWNED BY public.crm_notes.id;


--
-- Name: crm_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_tasks (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    created_by integer NOT NULL,
    assigned_to integer,
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    priority text DEFAULT 'medium'::text,
    due_date timestamp without time zone,
    completed_at timestamp without time zone,
    tags jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_tasks_id_seq OWNED BY public.crm_tasks.id;


--
-- Name: currency_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currency_codes (
    code character(3) NOT NULL
);


--
-- Name: dead_letter_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dead_letter_messages (
    id integer NOT NULL,
    queue_name character varying(200) NOT NULL,
    message_id character varying(26),
    correlation_id uuid,
    envelope jsonb NOT NULL,
    error_message text,
    error_count integer DEFAULT 1,
    first_failed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_failed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at timestamp with time zone,
    resolution_notes text
);


--
-- Name: dead_letter_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dead_letter_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dead_letter_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dead_letter_messages_id_seq OWNED BY public.dead_letter_messages.id;


--
-- Name: delinquency_current; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delinquency_current (
    loan_id integer NOT NULL,
    as_of_date date NOT NULL,
    earliest_unpaid_due_date date,
    unpaid_due_minor numeric(20,0) DEFAULT 0 NOT NULL,
    dpd integer DEFAULT 0 NOT NULL,
    bucket public.delinquency_bucket NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: delinquency_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delinquency_snapshot (
    snap_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    as_of_date date NOT NULL,
    earliest_unpaid_due_date date,
    unpaid_due_minor numeric(20,0) DEFAULT 0 NOT NULL,
    dpd integer DEFAULT 0 NOT NULL,
    bucket public.delinquency_bucket NOT NULL,
    schedule_plan_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_artifact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_artifact (
    doc_id uuid DEFAULT gen_random_uuid() NOT NULL,
    type public.document_type NOT NULL,
    loan_id integer,
    related_id uuid,
    period_start date,
    period_end date,
    tax_year integer,
    template_id uuid NOT NULL,
    payload_json jsonb NOT NULL,
    inputs_hash character(64) NOT NULL,
    pdf_hash character(64) NOT NULL,
    pdf_bytes bytea,
    size_bytes integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_id uuid
);


--
-- Name: document_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_template (
    template_id uuid DEFAULT gen_random_uuid() NOT NULL,
    type public.document_type NOT NULL,
    jurisdiction public.jurisdiction_code,
    version integer NOT NULL,
    engine text NOT NULL,
    html_source text NOT NULL,
    css_source text NOT NULL,
    font_family text DEFAULT 'DejaVu Sans'::text NOT NULL,
    retired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_template_engine_check CHECK ((engine = 'handlebars-html'::text))
);


--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_templates (
    id integer NOT NULL,
    name text NOT NULL,
    category public.document_category NOT NULL,
    description text,
    template_content text,
    template_url text,
    variables jsonb,
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: document_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_templates_id_seq OWNED BY public.document_templates.id;


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id integer NOT NULL,
    loan_id integer,
    borrower_id integer,
    property_id integer,
    category public.document_category NOT NULL,
    document_type text,
    title text NOT NULL,
    description text,
    file_name text NOT NULL,
    file_size integer,
    mime_type text,
    storage_url text NOT NULL,
    thumbnail_url text,
    document_date date,
    recorded_date date,
    expiration_date date,
    recording_number text,
    book_number text,
    page_number text,
    instrument_number text,
    is_public boolean DEFAULT false NOT NULL,
    is_confidential boolean DEFAULT false,
    requires_signature boolean DEFAULT false,
    is_signed boolean DEFAULT false,
    version integer DEFAULT 1 NOT NULL,
    parent_document_id integer,
    is_current_version boolean DEFAULT true,
    uploaded_by integer NOT NULL,
    last_accessed_by integer,
    last_accessed_at timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    archived_date timestamp without time zone,
    archived_by integer,
    tags text[],
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    notes text
);


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;


--
-- Name: email_template_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_template_folders (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    parent_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: email_template_folders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_template_folders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_template_folders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_template_folders_id_seq OWNED BY public.email_template_folders.id;


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id integer NOT NULL,
    folder_id integer,
    name character varying(255) NOT NULL,
    subject text,
    body text,
    is_shared boolean DEFAULT false,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    template_key character varying(100),
    format character varying(20) DEFAULT 'markdown'::character varying,
    flags jsonb,
    trigger jsonb,
    tokens jsonb,
    is_active boolean DEFAULT true
);


--
-- Name: email_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_templates_id_seq OWNED BY public.email_templates.id;


--
-- Name: escrow_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_accounts (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    account_number text NOT NULL,
    current_balance numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    available_balance numeric(12,2) DEFAULT '0'::numeric,
    pending_deposits numeric(12,2) DEFAULT '0'::numeric,
    pending_disbursements numeric(12,2) DEFAULT '0'::numeric,
    monthly_payment numeric(10,2) DEFAULT '0'::numeric,
    minimum_balance numeric(10,2) DEFAULT '0'::numeric,
    cushion_amount numeric(10,2) DEFAULT '0'::numeric,
    target_balance numeric(12,2) DEFAULT '0'::numeric,
    projected_lowest_balance numeric(12,2),
    projected_lowest_month text,
    shortage_amount numeric(10,2) DEFAULT '0'::numeric,
    surplus_amount numeric(10,2) DEFAULT '0'::numeric,
    shortage_spread_months integer,
    last_analysis_date date,
    next_analysis_date date,
    analysis_effective_date date,
    is_active boolean DEFAULT true NOT NULL,
    waived boolean DEFAULT false,
    waived_date date,
    waived_by integer,
    waived_reason text,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: escrow_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.escrow_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: escrow_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.escrow_accounts_id_seq OWNED BY public.escrow_accounts.id;


--
-- Name: escrow_advances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_advances (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    escrow_account_id integer,
    advance_date date NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text NOT NULL,
    repayment_months integer DEFAULT 12 NOT NULL,
    monthly_repayment numeric(12,2) NOT NULL,
    outstanding_balance numeric(12,2) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    paid_off_date date,
    run_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT escrow_advances_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paid'::text, 'written_off'::text])))
);


--
-- Name: escrow_advances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.escrow_advances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: escrow_advances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.escrow_advances_id_seq OWNED BY public.escrow_advances.id;


--
-- Name: escrow_analysis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_analysis (
    analysis_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    as_of_date date NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    annual_expected_minor numeric(20,0) NOT NULL,
    cushion_target_minor numeric(20,0) NOT NULL,
    current_balance_minor numeric(20,0) NOT NULL,
    shortage_minor numeric(20,0) DEFAULT 0 NOT NULL,
    deficiency_minor numeric(20,0) DEFAULT 0 NOT NULL,
    surplus_minor numeric(20,0) DEFAULT 0 NOT NULL,
    new_monthly_target_minor numeric(20,0) NOT NULL,
    deficiency_recovery_monthly_minor numeric(20,0) DEFAULT 0 NOT NULL,
    version integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: escrow_analysis_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_analysis_item (
    analysis_id uuid NOT NULL,
    escrow_id integer NOT NULL,
    forecast_due_date date NOT NULL,
    forecast_amount_minor numeric(20,0) NOT NULL
);


--
-- Name: escrow_disbursement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_disbursement (
    disb_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    escrow_id integer NOT NULL,
    due_date date NOT NULL,
    amount_minor numeric(20,0) NOT NULL,
    status public.disbursement_status_v2 DEFAULT 'scheduled'::public.disbursement_status_v2 NOT NULL,
    event_id uuid,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    posted_at timestamp with time zone,
    CONSTRAINT escrow_disbursement_amount_minor_check CHECK ((amount_minor > (0)::numeric))
);


--
-- Name: escrow_disbursement_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_disbursement_payments (
    id integer NOT NULL,
    disbursement_id integer NOT NULL,
    loan_id integer NOT NULL,
    ledger_entry_id integer,
    payment_date timestamp without time zone NOT NULL,
    due_date date NOT NULL,
    amount numeric(10,2) NOT NULL,
    payment_method public.payment_method NOT NULL,
    check_number text,
    wire_confirmation text,
    ach_transaction_id text,
    status public.payment_status DEFAULT 'scheduled'::public.payment_status NOT NULL,
    confirmation_number text,
    processed_by integer,
    processed_date timestamp without time zone,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: escrow_disbursement_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.escrow_disbursement_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: escrow_disbursement_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.escrow_disbursement_payments_id_seq OWNED BY public.escrow_disbursement_payments.id;


--
-- Name: escrow_disbursements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_disbursements (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    escrow_account_id integer NOT NULL,
    disbursement_type public.disbursement_type NOT NULL,
    description text NOT NULL,
    category text,
    payee_name text NOT NULL,
    payee_contact_name text,
    payee_phone text,
    payee_email text,
    payee_fax text,
    payee_street_address text,
    payee_city text,
    payee_state text,
    payee_zip_code text,
    payment_method public.disbursement_payment_method DEFAULT 'check'::public.disbursement_payment_method NOT NULL,
    account_number text,
    routing_number text,
    account_type text,
    bank_name text,
    wire_instructions text,
    remittance_address text,
    remittance_city text,
    remittance_state text,
    remittance_zip_code text,
    account_number_2 text,
    reference_number text,
    frequency public.frequency NOT NULL,
    monthly_amount numeric(10,2),
    annual_amount numeric(10,2) NOT NULL,
    payment_amount numeric(10,2) NOT NULL,
    first_due_date date,
    next_due_date date NOT NULL,
    last_paid_date date,
    specific_due_dates jsonb,
    status public.disbursement_status DEFAULT 'active'::public.disbursement_status NOT NULL,
    is_on_hold boolean DEFAULT false NOT NULL,
    hold_reason text,
    hold_requested_by text,
    hold_date timestamp without time zone,
    auto_pay_enabled boolean DEFAULT true,
    days_before_due integer DEFAULT 10,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    parcel_number text,
    policy_number text,
    bank_account_number text,
    ach_routing_number text,
    wire_routing_number text,
    insured_name text,
    insurance_company_name text,
    policy_description text,
    policy_expiration_date date,
    coverage_amount numeric(12,2),
    insurance_property_address text,
    insurance_property_city text,
    insurance_property_state text,
    insurance_property_zip_code text,
    agent_name text,
    agent_business_address text,
    agent_city text,
    agent_state text,
    agent_zip_code text,
    agent_phone text,
    agent_fax text,
    agent_email text,
    insurance_document_id integer,
    insurance_tracking boolean DEFAULT true
);


--
-- Name: escrow_disbursements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.escrow_disbursements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: escrow_disbursements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.escrow_disbursements_id_seq OWNED BY public.escrow_disbursements.id;


--
-- Name: escrow_forecast; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_forecast (
    forecast_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    escrow_id integer NOT NULL,
    due_date date NOT NULL,
    amount_minor numeric(20,0) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT escrow_forecast_amount_minor_check CHECK ((amount_minor > (0)::numeric))
);


--
-- Name: escrow_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_items (
    id integer NOT NULL,
    escrow_account_id integer NOT NULL,
    item_type text NOT NULL,
    payee_id integer NOT NULL,
    description text NOT NULL,
    frequency public.frequency NOT NULL,
    annual_amount numeric(10,2) NOT NULL,
    payment_amount numeric(10,2) NOT NULL,
    first_due_date date,
    next_due_date date,
    last_paid_date date,
    account_number text,
    policy_number text,
    reference_number text,
    is_active boolean DEFAULT true NOT NULL,
    auto_pay_enabled boolean DEFAULT true,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: escrow_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.escrow_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: escrow_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.escrow_items_id_seq OWNED BY public.escrow_items.id;


--
-- Name: escrow_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_ledger (
    ledger_id bigint NOT NULL,
    loan_id character varying(50) NOT NULL,
    payment_id character varying(50),
    category character varying(20) NOT NULL,
    debit_cents bigint DEFAULT 0 NOT NULL,
    credit_cents bigint DEFAULT 0 NOT NULL,
    effective_date date NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_escrow_one_sided CHECK ((((debit_cents > 0) AND (credit_cents = 0)) OR ((credit_cents > 0) AND (debit_cents = 0))))
);


--
-- Name: escrow_ledger_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.escrow_ledger_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: escrow_ledger_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.escrow_ledger_ledger_id_seq OWNED BY public.escrow_ledger.ledger_id;


--
-- Name: escrow_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_policy (
    policy_id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_code text NOT NULL,
    jurisdiction public.jurisdiction_code NOT NULL,
    cushion_months smallint NOT NULL,
    shortage_amortization_months smallint NOT NULL,
    deficiency_amortization_months smallint NOT NULL,
    surplus_refund_threshold_minor numeric(20,0) DEFAULT 5000 NOT NULL,
    collect_surplus_as_reduction boolean DEFAULT true NOT NULL,
    pay_when_insufficient boolean DEFAULT true NOT NULL,
    rounding public.rounding_mode DEFAULT 'half_away_from_zero'::public.rounding_mode NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT escrow_policy_cushion_months_check CHECK (((cushion_months >= 0) AND (cushion_months <= 2))),
    CONSTRAINT escrow_policy_deficiency_amortization_months_check CHECK (((deficiency_amortization_months >= 1) AND (deficiency_amortization_months <= 24))),
    CONSTRAINT escrow_policy_shortage_amortization_months_check CHECK (((shortage_amortization_months >= 1) AND (shortage_amortization_months <= 24)))
);


--
-- Name: escrow_statement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_statement (
    analysis_id uuid NOT NULL,
    document_hash text NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: escrow_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_transactions (
    id integer NOT NULL,
    escrow_account_id integer NOT NULL,
    escrow_item_id integer,
    transaction_date timestamp without time zone NOT NULL,
    effective_date date NOT NULL,
    transaction_type public.transaction_type NOT NULL,
    amount numeric(10,2) NOT NULL,
    running_balance numeric(12,2) NOT NULL,
    payee_id integer,
    check_number text,
    wire_confirmation text,
    reference_number text,
    payment_id integer,
    processed_by integer,
    approved_by integer,
    batch_id text,
    description text NOT NULL,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: escrow_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.escrow_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: escrow_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.escrow_transactions_id_seq OWNED BY public.escrow_transactions.id;


--
-- Name: exception_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exception_cases (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(50) DEFAULT 'payment'::character varying NOT NULL,
    entity_id character varying(255) NOT NULL,
    type character varying(100) NOT NULL,
    severity character varying(20) NOT NULL,
    status character varying(50) DEFAULT 'open'::character varying NOT NULL,
    description text NOT NULL,
    metadata jsonb,
    assigned_to integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp with time zone,
    resolution_notes text,
    CONSTRAINT exception_cases_severity_check CHECK (((severity)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[])))
);


--
-- Name: expected_settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expected_settlements (
    expect_id bigint NOT NULL,
    payment_id character varying(50) NOT NULL,
    loan_id character varying(50) NOT NULL,
    method text NOT NULL,
    direction text NOT NULL,
    amount_cents bigint NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    initiated_at timestamp with time zone NOT NULL,
    effective_date date NOT NULL,
    ext_ref_hint text,
    state text DEFAULT 'pending'::text NOT NULL
);


--
-- Name: expected_settlements_expect_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expected_settlements_expect_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expected_settlements_expect_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expected_settlements_expect_id_seq OWNED BY public.expected_settlements.expect_id;


--
-- Name: fee_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_policy (
    policy_id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_code text,
    jurisdiction public.jurisdiction_code NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    late_fee_type text NOT NULL,
    late_fee_amount_minor numeric(20,0) DEFAULT 0 NOT NULL,
    late_fee_percent_bps integer DEFAULT 0 NOT NULL,
    late_fee_grace_days integer DEFAULT 0 NOT NULL,
    nsf_fee_minor numeric(20,0) DEFAULT 0 NOT NULL,
    deferral_fee_minor numeric(20,0) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_policy_late_fee_type_check CHECK ((late_fee_type = ANY (ARRAY['amount'::text, 'percent'::text])))
);


--
-- Name: fee_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_templates (
    id integer NOT NULL,
    lender_id integer NOT NULL,
    template_name text NOT NULL,
    description text,
    is_default boolean DEFAULT false,
    fees jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    late_fee_base text DEFAULT 'scheduled_pi'::text,
    late_fee_cap_minor numeric(20,0) DEFAULT NULL::numeric,
    CONSTRAINT fee_templates_late_fee_base_check CHECK ((late_fee_base = ANY (ARRAY['scheduled_pi'::text, 'total_due'::text, 'principal_only'::text])))
);


--
-- Name: fee_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_templates_id_seq OWNED BY public.fee_templates.id;


--
-- Name: foreclosure_case; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foreclosure_case (
    fc_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    case_opened_at timestamp with time zone DEFAULT now() NOT NULL,
    attorney_id uuid,
    status text DEFAULT 'open'::text NOT NULL,
    CONSTRAINT foreclosure_case_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: foreclosure_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foreclosure_event (
    fc_id uuid NOT NULL,
    milestone public.foreclosure_milestone NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: gateway_provider; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gateway_provider (
    provider_code text NOT NULL,
    display_name text NOT NULL
);


--
-- Name: guarantors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guarantors (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    guarantor_entity_id integer NOT NULL,
    guarantee_amount numeric(15,2),
    guarantee_percentage numeric(5,2),
    guarantee_type text,
    start_date date,
    end_date date,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: guarantors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guarantors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guarantors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guarantors_id_seq OWNED BY public.guarantors.id;


--
-- Name: idempotency_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_key (
    event_type text NOT NULL,
    key text NOT NULL,
    seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox (
    consumer character varying(255) NOT NULL,
    message_id character varying(255) NOT NULL,
    result_hash character varying(64),
    processed_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: insurance_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_policies (
    id integer NOT NULL,
    loan_id integer,
    property_id integer NOT NULL,
    policy_type text NOT NULL,
    insurance_company text NOT NULL,
    policy_number text NOT NULL,
    effective_date date NOT NULL,
    expiration_date date NOT NULL,
    coverage_amount numeric(12,2) NOT NULL,
    deductible numeric(10,2),
    annual_premium numeric(10,2) NOT NULL,
    agent_name text,
    agent_phone text,
    agent_email text,
    is_escrow_paid boolean DEFAULT false,
    is_active boolean DEFAULT true,
    last_verified_date date,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: insurance_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.insurance_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: insurance_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.insurance_policies_id_seq OWNED BY public.insurance_policies.id;


--
-- Name: interest_accruals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interest_accruals (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    accrual_date date NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    day_count integer NOT NULL,
    day_count_convention text NOT NULL,
    interest_rate numeric(8,4) NOT NULL,
    principal_balance numeric(12,2) NOT NULL,
    daily_rate numeric(12,10) NOT NULL,
    accrued_amount numeric(12,2) NOT NULL,
    run_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: interest_accruals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.interest_accruals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: interest_accruals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.interest_accruals_id_seq OWNED BY public.interest_accruals.id;


--
-- Name: investor_contract; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_contract (
    contract_id uuid DEFAULT gen_random_uuid() NOT NULL,
    investor_id text NOT NULL,
    product_code text NOT NULL,
    method text NOT NULL,
    remittance_day smallint NOT NULL,
    cutoff_day smallint NOT NULL,
    custodial_bank_acct_id uuid NOT NULL,
    servicer_fee_bps integer DEFAULT 0 NOT NULL,
    late_fee_split_bps integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text,
    CONSTRAINT check_contract_status CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text]))),
    CONSTRAINT investor_contract_cutoff_day_check CHECK (((cutoff_day >= 1) AND (cutoff_day <= 31))),
    CONSTRAINT investor_contract_method_check CHECK ((method = ANY (ARRAY['scheduled_p_i'::text, 'actual_cash'::text, 'scheduled_p_i_with_interest_shortfall'::text]))),
    CONSTRAINT investor_contract_remittance_day_check CHECK (((remittance_day >= 1) AND (remittance_day <= 31)))
);


--
-- Name: investor_distributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_distributions (
    id integer NOT NULL,
    run_id text NOT NULL,
    loan_id integer NOT NULL,
    investor_id integer NOT NULL,
    distribution_date date NOT NULL,
    ownership_percentage numeric(8,6) NOT NULL,
    gross_amount numeric(12,2) NOT NULL,
    principal_amount numeric(12,2) NOT NULL,
    interest_amount numeric(12,2) NOT NULL,
    fees_amount numeric(12,2) NOT NULL,
    net_amount numeric(12,2) NOT NULL,
    rounding_adjustment numeric(6,4) DEFAULT 0.00,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT investor_distributions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text, 'paid'::text, 'failed'::text])))
);


--
-- Name: investor_distributions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.investor_distributions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: investor_distributions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.investor_distributions_id_seq OWNED BY public.investor_distributions.id;


--
-- Name: investor_position_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_position_versions (
    version_id character varying(26) NOT NULL,
    loan_id character varying(50) NOT NULL,
    effective_from date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(100)
);


--
-- Name: investor_position_versions_resolved; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.investor_position_versions_resolved AS
 SELECT loan_id,
    version_id,
    effective_from,
    lead(effective_from) OVER (PARTITION BY loan_id ORDER BY effective_from) AS effective_to
   FROM public.investor_position_versions ipv;


--
-- Name: investor_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_positions (
    version_id character varying(26) NOT NULL,
    investor_id character varying(50) NOT NULL,
    pct_bps integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_pct_bps CHECK (((pct_bps >= 0) AND (pct_bps <= 10000)))
);


--
-- Name: investor_waterfall_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_waterfall_rule (
    rule_id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    rank smallint NOT NULL,
    bucket text NOT NULL,
    cap_minor numeric(20,0),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT investor_waterfall_rule_bucket_check CHECK ((bucket = ANY (ARRAY['interest'::text, 'principal'::text, 'late_fees'::text, 'escrow'::text, 'recoveries'::text])))
);


--
-- Name: investors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investors (
    id integer NOT NULL,
    investor_id text NOT NULL,
    loan_id integer NOT NULL,
    entity_type public.entity_type NOT NULL,
    name text NOT NULL,
    contact_name text,
    email text,
    phone text,
    street_address text,
    city text,
    state text,
    zip_code text,
    bank_name text,
    bank_street_address text,
    bank_city text,
    bank_state text,
    bank_zip_code text,
    account_number text,
    routing_number text,
    account_type text,
    ownership_percentage numeric(8,6) NOT NULL,
    investment_amount numeric(15,2),
    investment_date date,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    ssn_or_ein text
);


--
-- Name: investors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.investors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: investors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.investors_id_seq OWNED BY public.investors.id;


--
-- Name: irs_1098_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.irs_1098_records (
    record_id bigint NOT NULL,
    tax_year integer NOT NULL,
    borrower_id text NOT NULL,
    loan_id text NOT NULL,
    interest_paid_cents bigint NOT NULL,
    mortgage_ins_cents bigint DEFAULT 0,
    points_paid_cents bigint DEFAULT 0,
    prepared_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'prepared'::text NOT NULL
);


--
-- Name: irs_1098_records_record_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.irs_1098_records_record_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: irs_1098_records_record_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.irs_1098_records_record_id_seq OWNED BY public.irs_1098_records.record_id;


--
-- Name: late_fee_assessment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.late_fee_assessment (
    fee_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    period_due_date date NOT NULL,
    assessed_at timestamp with time zone DEFAULT now() NOT NULL,
    amount_minor numeric(20,0) NOT NULL,
    template_id integer NOT NULL,
    event_id uuid NOT NULL,
    CONSTRAINT late_fee_assessment_amount_minor_check CHECK ((amount_minor > (0)::numeric))
);


--
-- Name: ledger_entries_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_entries_legacy (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    payment_id character varying(36) NOT NULL,
    entry_date date NOT NULL,
    account_type text NOT NULL,
    account_code text NOT NULL,
    debit_amount numeric(18,2) DEFAULT 0 NOT NULL,
    credit_amount numeric(18,2) DEFAULT 0 NOT NULL,
    description text NOT NULL,
    correlation_id character varying(36) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb
);


--
-- Name: ledger_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_entry (
    entry_id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    loan_id integer NOT NULL,
    account public.gl_account NOT NULL,
    debit_minor numeric(20,0) DEFAULT 0 NOT NULL,
    credit_minor numeric(20,0) DEFAULT 0 NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ledger_entry_check CHECK ((((debit_minor > (0)::numeric) AND (credit_minor = (0)::numeric)) OR ((credit_minor > (0)::numeric) AND (debit_minor = (0)::numeric)) OR ((debit_minor = (0)::numeric) AND (credit_minor = (0)::numeric))))
);


--
-- Name: ledger_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_event (
    event_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    effective_date date NOT NULL,
    schema text NOT NULL,
    correlation_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finalized_at timestamp with time zone
);


--
-- Name: legal_proceedings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_proceedings (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    proceeding_type text NOT NULL,
    case_number text,
    court_name text,
    filing_date date,
    attorney_name text,
    attorney_firm text,
    attorney_phone text,
    attorney_email text,
    status text NOT NULL,
    status_date date,
    sale_date date,
    redemption_deadline date,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: legal_proceedings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.legal_proceedings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: legal_proceedings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.legal_proceedings_id_seq OWNED BY public.legal_proceedings.id;


--
-- Name: lender_entity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lender_entity (
    lender_id uuid DEFAULT gen_random_uuid() NOT NULL,
    legal_name text NOT NULL,
    tin text NOT NULL,
    mailing_address jsonb NOT NULL,
    servicing_address jsonb,
    logo_url text,
    contact_phone text,
    contact_email text,
    nmls_number text,
    state_license jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: loan_accounting_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_accounting_config (
    loan_id integer NOT NULL,
    product_code text,
    jurisdiction public.jurisdiction_code DEFAULT 'US_CA'::public.jurisdiction_code NOT NULL,
    servicing_type text DEFAULT 'primary'::text NOT NULL,
    lien_position smallint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT loan_accounting_config_lien_position_check CHECK (((lien_position >= 1) AND (lien_position <= 5)))
);


--
-- Name: loan_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_balances (
    loan_id integer NOT NULL,
    current_principal numeric(15,2) DEFAULT 0,
    current_interest numeric(15,2) DEFAULT 0,
    total_late_fees numeric(15,2) DEFAULT 0,
    current_escrow numeric(15,2) DEFAULT 0,
    total_paid numeric(15,2) DEFAULT 0,
    last_payment_date date,
    last_payment_amount numeric(15,2),
    next_payment_due date,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: loan_borrowers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_borrowers (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    borrower_id integer NOT NULL,
    borrower_type text NOT NULL,
    ownership_percentage numeric(8,6),
    signing_authority boolean DEFAULT true,
    liability_percentage numeric(5,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: loan_borrowers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loan_borrowers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loan_borrowers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loan_borrowers_id_seq OWNED BY public.loan_borrowers.id;


--
-- Name: loan_fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_fees (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    fee_type text NOT NULL,
    fee_name text NOT NULL,
    fee_amount numeric(10,2) NOT NULL,
    fee_percentage numeric(5,3),
    frequency text,
    charge_date date,
    due_date date,
    paid_date date,
    waived boolean DEFAULT false,
    waived_by integer,
    waived_reason text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: loan_fees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loan_fees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loan_fees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loan_fees_id_seq OWNED BY public.loan_fees.id;


--
-- Name: loan_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_ledger (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    transaction_date date NOT NULL,
    transaction_id character varying(255) NOT NULL,
    description text NOT NULL,
    transaction_type character varying(50) NOT NULL,
    category character varying(100),
    debit_amount numeric(12,2),
    credit_amount numeric(12,2),
    running_balance numeric(12,2) NOT NULL,
    principal_balance numeric(12,2),
    interest_balance numeric(12,2),
    reference_transaction_id character varying(255),
    status character varying(50) DEFAULT 'posted'::character varying NOT NULL,
    approved_by integer,
    approved_at timestamp without time zone,
    approval_notes text,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reversal_of integer,
    reversed_by integer,
    approval_required boolean DEFAULT false,
    approval_date timestamp without time zone,
    metadata jsonb
);


--
-- Name: loan_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loan_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loan_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loan_ledger_id_seq OWNED BY public.loan_ledger.id;


--
-- Name: loan_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_terms (
    terms_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    interest_type public.interest_type NOT NULL,
    nominal_rate_bps integer NOT NULL,
    index_name text,
    index_margin_bps integer DEFAULT 0,
    rate_cap_up_bps integer DEFAULT 0,
    rate_cap_down_bps integer DEFAULT 0,
    compounding public.compounding_method NOT NULL,
    day_count public.day_count_convention NOT NULL,
    first_payment_date date NOT NULL,
    term_months integer NOT NULL,
    scheduled_payment_minor numeric(20,0),
    interest_only_months integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT loan_terms_nominal_rate_bps_check CHECK ((nominal_rate_bps >= 0)),
    CONSTRAINT loan_terms_term_months_check CHECK ((term_months > 0))
);


--
-- Name: loans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loans (
    id integer NOT NULL,
    loan_number text NOT NULL,
    loan_type public.loan_type NOT NULL,
    loan_purpose text,
    lender_id integer,
    servicer_id integer,
    investor_id integer,
    property_id integer NOT NULL,
    original_amount numeric(15,2) NOT NULL,
    principal_balance numeric(15,2) NOT NULL,
    interest_rate numeric(6,4) NOT NULL,
    rate_type text NOT NULL,
    index_type text,
    margin numeric(6,4),
    rate_adjustment_frequency integer,
    rate_cap_initial numeric(6,4),
    rate_cap_periodic numeric(6,4),
    rate_cap_lifetime numeric(6,4),
    rate_floor numeric(6,4),
    loan_term integer NOT NULL,
    amortization_term integer,
    balloon_months integer,
    balloon_amount numeric(15,2),
    prepayment_penalty boolean DEFAULT false,
    prepayment_penalty_term integer,
    prepayment_penalty_amount numeric(10,2),
    application_date date,
    approval_date date,
    funding_date date,
    first_payment_date date,
    maturity_date date NOT NULL,
    next_payment_date date,
    last_payment_date date,
    payment_frequency public.frequency DEFAULT 'monthly'::public.frequency NOT NULL,
    payment_amount numeric(10,2) NOT NULL,
    principal_and_interest numeric(10,2),
    monthly_escrow numeric(10,2),
    monthly_mi numeric(10,2),
    original_ltv numeric(5,2),
    current_ltv numeric(5,2),
    combined_ltv numeric(5,2),
    mi_required boolean DEFAULT false,
    mi_provider text,
    mi_certificate_number text,
    escrow_required boolean DEFAULT false,
    escrow_waived boolean DEFAULT false,
    status public.loan_status NOT NULL,
    status_date timestamp without time zone DEFAULT now() NOT NULL,
    status_reason text,
    delinquent_days integer DEFAULT 0,
    times_delinquent_30 integer DEFAULT 0,
    times_delinquent_60 integer DEFAULT 0,
    times_delinquent_90 integer DEFAULT 0,
    foreclosure_date date,
    sale_date date,
    investor_loan_number text,
    pool_number text,
    hmda boolean DEFAULT false,
    hoepa boolean DEFAULT false,
    qm boolean DEFAULT false,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    prepayment_expiration_date date,
    borrower_name text,
    borrower_email text,
    borrower_phone text,
    borrower_address text,
    borrower_city text,
    borrower_state text,
    borrower_zip text,
    borrower_ssn text,
    borrower_income numeric(15,2),
    trustee_name text,
    trustee_street_address text,
    trustee_city text,
    trustee_state text,
    trustee_zip_code text,
    beneficiary_name text,
    beneficiary_street_address text,
    beneficiary_city text,
    beneficiary_state text,
    beneficiary_zip_code text,
    loan_documents jsonb,
    default_conditions jsonb,
    insurance_requirements jsonb,
    cross_default_parties jsonb,
    closing_costs numeric(15,2),
    down_payment numeric(15,2),
    trustee_phone text,
    trustee_email text,
    beneficiary_phone text,
    beneficiary_email text,
    escrow_company_name text,
    escrow_company_street_address text,
    escrow_company_city text,
    escrow_company_state text,
    escrow_company_zip_code text,
    escrow_company_phone text,
    escrow_company_email text,
    borrower_company_name text,
    trustee_company_name text,
    beneficiary_company_name text,
    escrow_number text,
    credit_score_equifax integer,
    credit_score_experian integer,
    credit_score_transunion integer,
    co_borrower_name text,
    co_borrower_company_name text,
    co_borrower_email text,
    co_borrower_phone text,
    co_borrower_address text,
    co_borrower_city text,
    co_borrower_state text,
    co_borrower_zip text,
    co_borrower_ssn text,
    co_borrower_income numeric(15,2),
    co_borrower_credit_score_equifax integer,
    co_borrower_credit_score_experian integer,
    co_borrower_credit_score_transunion integer,
    hazard_insurance numeric(10,2),
    property_taxes numeric(10,2),
    hoa_fees numeric(10,2),
    pmi_amount numeric(10,2),
    servicing_fee_type text,
    late_charge numeric(10,2),
    late_charge_type text,
    fee_payer text,
    grace_period_days integer,
    other_monthly numeric(10,2),
    property_tax numeric(10,2),
    home_insurance numeric(10,2),
    pmi numeric(10,2),
    servicing_fee numeric(10,2),
    borrower_mobile text,
    borrower_photo text,
    accept_partial_payments boolean DEFAULT true,
    payment_allocation_order jsonb,
    interest_calculation_method character varying(50),
    borrower_tin character varying(20),
    co_borrower_tin character varying(20),
    payment_due_day integer
);


--
-- Name: loans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loans_id_seq OWNED BY public.loans.id;


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id integer,
    email_attempted public.citext,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    ip inet,
    user_agent text,
    outcome public.login_outcome NOT NULL,
    reason text
);


--
-- Name: TABLE login_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.login_attempts IS 'Login attempt tracking for rate limiting and forensics';


--
-- Name: message_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_metrics (
    id integer NOT NULL,
    schema_name character varying(200) NOT NULL,
    consumer character varying(100) NOT NULL,
    processed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processing_time_ms integer,
    success boolean NOT NULL,
    retry_count integer DEFAULT 0,
    metadata jsonb
);


--
-- Name: message_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.message_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: message_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.message_metrics_id_seq OWNED BY public.message_metrics.id;


--
-- Name: mfa_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfa_audit_log (
    id integer NOT NULL,
    user_id integer NOT NULL,
    factor_id integer,
    challenge_id text,
    event_type text NOT NULL,
    event_details jsonb DEFAULT '{}'::jsonb,
    ip text,
    user_agent text,
    device_fingerprint text,
    success boolean NOT NULL,
    failure_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: mfa_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mfa_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mfa_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mfa_audit_log_id_seq OWNED BY public.mfa_audit_log.id;


--
-- Name: mfa_backup_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfa_backup_codes (
    id integer NOT NULL,
    user_id integer NOT NULL,
    code_hash text NOT NULL,
    used_at timestamp without time zone,
    used_ip text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp without time zone
);


--
-- Name: mfa_backup_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mfa_backup_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mfa_backup_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mfa_backup_codes_id_seq OWNED BY public.mfa_backup_codes.id;


--
-- Name: mfa_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfa_challenges (
    id integer NOT NULL,
    challenge_id text NOT NULL,
    user_id integer NOT NULL,
    session_id text,
    factor_id integer,
    challenge_type text NOT NULL,
    action text,
    required_factors integer DEFAULT 1,
    completed_factors integer DEFAULT 0,
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 5,
    last_attempt_at timestamp without time zone,
    locked_until timestamp without time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    verified_at timestamp without time zone,
    ip text,
    user_agent text,
    device_fingerprint text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    CONSTRAINT mfa_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['login'::text, 'step_up'::text, 'enrollment'::text]))),
    CONSTRAINT mfa_challenges_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text, 'expired'::text])))
);


--
-- Name: mfa_challenges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mfa_challenges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mfa_challenges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mfa_challenges_id_seq OWNED BY public.mfa_challenges.id;


--
-- Name: notice_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notice_schedule (
    notice_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    notice_template_id uuid NOT NULL,
    trigger_code text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    status public.notice_status DEFAULT 'scheduled'::public.notice_status NOT NULL,
    sent_doc_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notice_template_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notice_template_v2 (
    notice_template_id uuid DEFAULT gen_random_uuid() NOT NULL,
    jurisdiction public.jurisdiction_code,
    code text NOT NULL,
    version integer NOT NULL,
    engine text NOT NULL,
    html_source text NOT NULL,
    css_source text NOT NULL,
    subject text NOT NULL,
    retired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notice_template_v2_engine_check CHECK ((engine = 'handlebars-html'::text))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type public.notification_type NOT NULL,
    priority public.priority DEFAULT 'medium'::public.priority NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    related_entity_type text,
    related_entity_id integer,
    action_url text,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp without time zone,
    is_archived boolean DEFAULT false,
    archived_at timestamp without time zone,
    scheduled_for timestamp without time zone,
    sent_at timestamp without time zone,
    email_sent boolean DEFAULT false,
    sms_sent boolean DEFAULT false,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox (
    id integer NOT NULL,
    aggregate_type character varying(100) NOT NULL,
    aggregate_id character varying(255) NOT NULL,
    schema character varying(200) NOT NULL,
    routing_key character varying(255) NOT NULL,
    payload jsonb NOT NULL,
    headers jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    published_at timestamp without time zone,
    retry_count integer DEFAULT 0,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    next_retry_at timestamp with time zone
);


--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_events (
    event_id character varying(26) NOT NULL,
    exchange character varying(100) NOT NULL,
    routing_key character varying(200) NOT NULL,
    payload jsonb NOT NULL,
    headers jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    published_at timestamp with time zone,
    publish_attempts integer DEFAULT 0,
    last_error text,
    metadata jsonb
);


--
-- Name: outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outbox_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outbox_id_seq OWNED BY public.outbox.id;


--
-- Name: outbox_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_messages (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    aggregate_type character varying(100) NOT NULL,
    aggregate_id character varying(255) NOT NULL,
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    retry_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone,
    error_message text
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id integer NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE password_reset_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.password_reset_tokens IS 'Secure tokens for password reset flow';


--
-- Name: payees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payees (
    id integer NOT NULL,
    payee_type text NOT NULL,
    name text NOT NULL,
    contact_name text,
    phone text,
    fax text,
    email text,
    website text,
    address text,
    address_2 text,
    city text,
    state text,
    zip_code text,
    country text DEFAULT 'USA'::text,
    payment_method text,
    account_number text,
    routing_number text,
    wire_instructions text,
    tax_authority boolean DEFAULT false,
    tax_district text,
    naic_code text,
    is_active boolean DEFAULT true NOT NULL,
    is_preferred boolean DEFAULT false,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: payees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payees_id_seq OWNED BY public.payees.id;


--
-- Name: payment_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ingestion_id uuid NOT NULL,
    type text NOT NULL,
    uri text NOT NULL,
    sha256 text NOT NULL,
    size_bytes bigint,
    mime text,
    source_metadata jsonb
);


--
-- Name: payment_distributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_distributions (
    distribution_id bigint NOT NULL,
    payment_id character varying(50) NOT NULL,
    investor_id character varying(50) NOT NULL,
    amount_cents bigint NOT NULL,
    servicing_fee_cents bigint DEFAULT 0 NOT NULL,
    tranche character varying(20),
    effective_date date NOT NULL,
    status character varying(20) NOT NULL,
    clawback_id character varying(50),
    CONSTRAINT chk_distrib_status CHECK (((status)::text = ANY ((ARRAY['calculated'::character varying, 'posted'::character varying, 'clawback_pending'::character varying, 'clawback_netted'::character varying, 'receivable'::character varying])::text[])))
);


--
-- Name: payment_distributions_distribution_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_distributions_distribution_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_distributions_distribution_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_distributions_distribution_id_seq OWNED BY public.payment_distributions.distribution_id;


--
-- Name: payment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_events (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    payment_id character varying(36),
    ingestion_id character varying(36),
    type text NOT NULL,
    event_time timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actor_type text NOT NULL,
    actor_id text,
    correlation_id character varying(36) NOT NULL,
    data jsonb NOT NULL,
    prev_event_hash text,
    event_hash text NOT NULL,
    CONSTRAINT payment_events_actor_type_check CHECK ((actor_type = ANY (ARRAY['system'::text, 'human'::text, 'ai'::text])))
);


--
-- Name: payment_ingestion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_ingestion (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    source character varying(50) NOT NULL,
    external_id character varying(255),
    raw_data jsonb NOT NULL,
    parsed_data jsonb,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    error_message text,
    ingested_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone,
    metadata jsonb
);


--
-- Name: payment_ingestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_ingestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    channel text NOT NULL,
    source_reference text,
    raw_payload_hash text NOT NULL,
    artifact_uri text[] DEFAULT '{}'::text[] NOT NULL,
    artifact_hash text[] DEFAULT '{}'::text[] NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    normalized_envelope jsonb NOT NULL,
    status text NOT NULL,
    CONSTRAINT payment_ingestions_status_check CHECK ((status = ANY (ARRAY['received'::text, 'normalized'::text, 'published'::text])))
);


--
-- Name: payment_intake; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_intake (
    payment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    method public.payment_method NOT NULL,
    amount_minor numeric(20,0) NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    received_at timestamp with time zone NOT NULL,
    gateway_txn_id text NOT NULL,
    source_provider text NOT NULL,
    idempotency_key text NOT NULL,
    effective_date date NOT NULL,
    raw_payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_intake_amount_minor_check CHECK ((amount_minor > (0)::numeric))
);


--
-- Name: payment_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_ledger (
    ledger_id bigint NOT NULL,
    loan_id character varying(50) NOT NULL,
    payment_id character varying(50) NOT NULL,
    account character varying(50) NOT NULL,
    debit_cents bigint DEFAULT 0 NOT NULL,
    credit_cents bigint DEFAULT 0 NOT NULL,
    pending boolean DEFAULT true NOT NULL,
    effective_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reversal_of bigint,
    CONSTRAINT chk_one_sided CHECK ((((debit_cents > 0) AND (credit_cents = 0)) OR ((credit_cents > 0) AND (debit_cents = 0))))
);


--
-- Name: payment_ledger_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_ledger_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_ledger_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_ledger_ledger_id_seq OWNED BY public.payment_ledger.ledger_id;


--
-- Name: payment_posting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_posting (
    payment_id uuid NOT NULL,
    event_id uuid NOT NULL,
    applied jsonb NOT NULL,
    new_balances jsonb NOT NULL,
    posted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_schedule (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    payment_number integer NOT NULL,
    due_date date NOT NULL,
    principal_amount numeric(10,2) NOT NULL,
    interest_amount numeric(10,2) NOT NULL,
    escrow_amount numeric(10,2),
    mi_amount numeric(10,2),
    total_amount numeric(10,2) NOT NULL,
    principal_balance numeric(15,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_schedule_id_seq OWNED BY public.payment_schedule.id;


--
-- Name: payment_state_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_state_transitions (
    id bigint NOT NULL,
    payment_id character varying(50) NOT NULL,
    previous_state character varying(30),
    new_state character varying(30) NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor text,
    reason text,
    metadata jsonb
);


--
-- Name: payment_state_transitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_state_transitions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_state_transitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_state_transitions_id_seq OWNED BY public.payment_state_transitions.id;


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    payment_id character varying(36) NOT NULL,
    loan_id character varying(50) NOT NULL,
    source character varying(20) NOT NULL,
    external_ref character varying(100),
    amount_cents bigint NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    received_at timestamp with time zone NOT NULL,
    effective_date date NOT NULL,
    state character varying(30) NOT NULL,
    idempotency_key character varying(200) NOT NULL,
    created_by character varying(100),
    metadata jsonb,
    CONSTRAINT chk_positive_amount CHECK ((amount_cents > 0)),
    CONSTRAINT chk_source_valid CHECK (((source)::text = ANY ((ARRAY['ach'::character varying, 'wire'::character varying, 'check'::character varying, 'card'::character varying, 'lockbox'::character varying, 'cashier'::character varying, 'money_order'::character varying])::text[]))),
    CONSTRAINT chk_state_valid CHECK (((state)::text = ANY ((ARRAY['received'::character varying, 'accepted_for_review'::character varying, 'validated'::character varying, 'posted_pending_settlement'::character varying, 'processing'::character varying, 'settled'::character varying, 'returned'::character varying, 'reversed'::character varying, 'rejected'::character varying, 'closed'::character varying])::text[])))
);


--
-- Name: payment_validation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_validation (
    payment_id uuid NOT NULL,
    is_valid boolean NOT NULL,
    reason text,
    allocation_hints jsonb,
    validated_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_date date NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    schedule_id integer,
    payment_number integer,
    due_date date,
    received_date date,
    effective_date date NOT NULL,
    principal_amount numeric(18,2) DEFAULT 0,
    interest_amount numeric(18,2) DEFAULT 0,
    escrow_amount numeric(18,2) DEFAULT 0,
    fee_amount numeric(18,2) DEFAULT 0,
    total_amount numeric(18,2) DEFAULT 0,
    total_received numeric(18,2) DEFAULT 0 NOT NULL,
    unapplied_amount numeric(18,2) DEFAULT 0,
    payment_method character varying(50),
    reference_number character varying(100),
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    updated_by integer,
    is_partial boolean DEFAULT false,
    is_overpayment boolean DEFAULT false,
    reversal_reason text,
    reversed_payment_id character varying(36),
    reversal_date date,
    service_fee_amount numeric(18,2) DEFAULT 0,
    late_fee_amount numeric(18,2) DEFAULT 0,
    nsf_fee_amount numeric(18,2) DEFAULT 0,
    other_fee_amount numeric(18,2) DEFAULT 0,
    suspense_amount numeric(18,2) DEFAULT 0,
    principal_balance_after numeric(18,2),
    interest_balance_after numeric(18,2),
    escrow_balance_after numeric(18,2),
    fee_balance_after numeric(18,2),
    suspense_balance_after numeric(18,2),
    batch_id character varying(100),
    lockbox_id character varying(100),
    payment_source character varying(50),
    applied_by integer,
    applied_at timestamp with time zone,
    post_date date,
    nsf_count integer DEFAULT 0,
    reapply_count integer DEFAULT 0
);


--
-- Name: payments_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments_inbox (
    id integer NOT NULL,
    reference_number text,
    value_date date NOT NULL,
    amount numeric(12,2) NOT NULL,
    borrower_id integer,
    loan_id integer,
    matched_by text,
    match_confidence numeric(3,2),
    status text DEFAULT 'unmatched'::text NOT NULL,
    processed_at timestamp without time zone,
    processed_by_run_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_inbox_status_check CHECK ((status = ANY (ARRAY['unmatched'::text, 'matched'::text, 'processed'::text, 'suspense'::text, 'rejected'::text])))
);


--
-- Name: payments_inbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_inbox_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_inbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_inbox_id_seq OWNED BY public.payments_inbox.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    resource text NOT NULL,
    level public.permission_level NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.permissions IS 'Available permissions for resources';


--
-- Name: COLUMN permissions.resource; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.permissions.resource IS 'Resource name like Users, Loans, Payments, etc.';


--
-- Name: COLUMN permissions.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.permissions.level IS 'Access level for the resource';


--
-- Name: plan_header; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_header (
    plan_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    type public.plan_type NOT NULL,
    status public.plan_status DEFAULT 'draft'::public.plan_status NOT NULL,
    starts_on date NOT NULL,
    ends_on date,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plan_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_progress (
    plan_id uuid NOT NULL,
    installment_no integer NOT NULL,
    due_date date NOT NULL,
    paid_minor numeric(20,0) DEFAULT 0 NOT NULL,
    last_payment_event uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT plan_progress_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'partial'::text, 'paid'::text, 'missed'::text])))
);


--
-- Name: plan_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_schedule (
    plan_id uuid NOT NULL,
    installment_no integer NOT NULL,
    due_date date NOT NULL,
    amount_minor numeric(20,0) NOT NULL,
    CONSTRAINT plan_schedule_amount_minor_check CHECK ((amount_minor >= (0)::numeric)),
    CONSTRAINT plan_schedule_installment_no_check CHECK ((installment_no >= 1))
);


--
-- Name: product_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_policy (
    product_code text NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    rounding public.rounding_mode DEFAULT 'half_away_from_zero'::public.rounding_mode NOT NULL,
    default_day_count public.day_count_convention DEFAULT 'ACT_365F'::public.day_count_convention NOT NULL,
    default_compounding public.compounding_method DEFAULT 'simple'::public.compounding_method NOT NULL,
    min_payment_minor numeric(20,0) DEFAULT 0 NOT NULL,
    payment_waterfall jsonb DEFAULT '["fees_due", "interest_past_due", "interest_current", "principal", "escrow", "future"]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.properties (
    id integer NOT NULL,
    property_type public.property_type NOT NULL,
    address text NOT NULL,
    address_2 text,
    city text NOT NULL,
    state text NOT NULL,
    zip_code text NOT NULL,
    county text,
    country text DEFAULT 'USA'::text,
    legal_description text,
    apn text,
    lot_number text,
    block_number text,
    subdivision text,
    year_built integer,
    square_feet integer,
    lot_size numeric(10,2),
    bedrooms integer,
    bathrooms numeric(3,1),
    stories integer,
    garage boolean DEFAULT false,
    garage_spaces integer,
    pool boolean DEFAULT false,
    purchase_price numeric(15,2),
    purchase_date date,
    original_appraisal_value numeric(15,2),
    original_appraisal_date date,
    current_value numeric(15,2),
    current_value_date date,
    current_value_source text,
    annual_property_tax numeric(10,2),
    annual_insurance numeric(10,2),
    annual_hoa numeric(10,2),
    tax_id text,
    occupancy_status text,
    rental_income numeric(10,2),
    primary_residence boolean DEFAULT false,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: properties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: properties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.properties_id_seq OWNED BY public.properties.id;


--
-- Name: recon_exception; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recon_exception (
    recon_id uuid DEFAULT gen_random_uuid() NOT NULL,
    bank_txn_id uuid NOT NULL,
    variance_minor numeric(20,0) NOT NULL,
    status public.recon_status DEFAULT 'new'::public.recon_status NOT NULL,
    assigned_to text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reconciliation_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_exceptions (
    exc_id bigint NOT NULL,
    kind text NOT NULL,
    ext_tx_id text,
    expect_id bigint,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    state text DEFAULT 'open'::text NOT NULL,
    resolution text,
    resolved_at timestamp with time zone
);


--
-- Name: reconciliation_exceptions_exc_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reconciliation_exceptions_exc_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reconciliation_exceptions_exc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reconciliation_exceptions_exc_id_seq OWNED BY public.reconciliation_exceptions.exc_id;


--
-- Name: reconciliation_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_matches (
    match_id bigint NOT NULL,
    ext_tx_id text,
    expect_id bigint,
    score numeric(5,2) NOT NULL,
    matched_at timestamp with time zone DEFAULT now() NOT NULL,
    strategy text NOT NULL,
    status text NOT NULL,
    reviewer text
);


--
-- Name: reconciliation_matches_match_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reconciliation_matches_match_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reconciliation_matches_match_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reconciliation_matches_match_id_seq OWNED BY public.reconciliation_matches.match_id;


--
-- Name: reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    bank_total numeric(18,2) DEFAULT 0 NOT NULL,
    sor_total numeric(18,2) DEFAULT 0 NOT NULL,
    variance numeric(18,2) DEFAULT 0 NOT NULL,
    status text NOT NULL,
    details jsonb,
    CONSTRAINT reconciliations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'balanced'::text, 'variance'::text])))
);


--
-- Name: remittance_cycle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remittance_cycle (
    cycle_id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status public.remit_status DEFAULT 'open'::public.remit_status NOT NULL,
    total_principal_minor numeric(20,0) DEFAULT 0 NOT NULL,
    total_interest_minor numeric(20,0) DEFAULT 0 NOT NULL,
    total_fees_minor numeric(20,0) DEFAULT 0 NOT NULL,
    servicer_fee_minor numeric(20,0) DEFAULT 0 NOT NULL,
    investor_due_minor numeric(20,0) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settlement_date date
);


--
-- Name: remittance_export; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remittance_export (
    export_id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    format text NOT NULL,
    file_hash character(64) NOT NULL,
    bytes bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT remittance_export_format_check CHECK ((format = ANY (ARRAY['csv'::text, 'xml'::text])))
);


--
-- Name: remittance_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remittance_item (
    item_id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    loan_id integer,
    principal_minor numeric(20,0) DEFAULT 0 NOT NULL,
    interest_minor numeric(20,0) DEFAULT 0 NOT NULL,
    fees_minor numeric(20,0) DEFAULT 0 NOT NULL,
    investor_share_minor numeric(20,0) DEFAULT 0 NOT NULL,
    servicer_fee_minor numeric(20,0) DEFAULT 0 NOT NULL
);


--
-- Name: remittance_recon_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remittance_recon_snapshot (
    snapshot_id character varying(26) NOT NULL,
    cycle_id character varying(26) NOT NULL,
    period_start timestamp without time zone NOT NULL,
    period_end timestamp without time zone NOT NULL,
    remit_investor_share_minor bigint NOT NULL,
    remit_servicer_fee_minor bigint NOT NULL,
    remit_total_minor bigint NOT NULL,
    gl_investor_payable_minor bigint NOT NULL,
    gl_servicer_income_minor bigint NOT NULL,
    gl_total_minor bigint NOT NULL,
    diff_investor_minor bigint NOT NULL,
    diff_servicer_minor bigint NOT NULL,
    diff_total_minor bigint NOT NULL,
    is_balanced boolean NOT NULL,
    variance_threshold_minor bigint DEFAULT 0,
    reconciled_at timestamp without time zone DEFAULT now(),
    reconciled_by character varying(100),
    notes text
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    scope jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE role_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.role_permissions IS 'Permissions assigned to roles';


--
-- Name: COLUMN role_permissions.scope; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.role_permissions.scope IS 'Optional attribute-based constraints for future use';


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT valid_role_name CHECK ((name = ANY (ARRAY['admin'::text, 'title'::text, 'legal'::text, 'lender'::text, 'borrower'::text, 'investor'::text, 'regulator'::text])))
);


--
-- Name: TABLE roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.roles IS 'System roles defining access levels';


--
-- Name: COLUMN roles.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.name IS 'Role identifier, must be one of predefined values';


--
-- Name: saga_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saga_states (
    saga_id uuid NOT NULL,
    saga_type character varying(100) NOT NULL,
    current_step character varying(100) NOT NULL,
    state jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    error_message text,
    metadata jsonb
);


--
-- Name: saga_step_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saga_step_history (
    id integer NOT NULL,
    saga_id uuid NOT NULL,
    step_name character varying(100) NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp with time zone,
    input_data jsonb,
    output_data jsonb,
    error_message text,
    idempotency_key character varying(200)
);


--
-- Name: saga_step_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saga_step_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saga_step_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saga_step_history_id_seq OWNED BY public.saga_step_history.id;


--
-- Name: schedule_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_plan (
    plan_id uuid DEFAULT gen_random_uuid() NOT NULL,
    loan_id integer NOT NULL,
    terms_id uuid NOT NULL,
    version integer NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT false NOT NULL
);


--
-- Name: schedule_row; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_row (
    plan_id uuid NOT NULL,
    period_no integer NOT NULL,
    due_date date NOT NULL,
    scheduled_principal_minor numeric(20,0) DEFAULT 0 NOT NULL,
    scheduled_interest_minor numeric(20,0) DEFAULT 0 NOT NULL,
    escrow_target_minor numeric(20,0) DEFAULT 0 NOT NULL,
    fee_target_minor numeric(20,0) DEFAULT 0 NOT NULL,
    CONSTRAINT schedule_row_period_no_check CHECK ((period_no >= 1))
);


--
-- Name: servicing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicing_events (
    id integer NOT NULL,
    run_id text NOT NULL,
    event_key text NOT NULL,
    event_type text NOT NULL,
    loan_id integer,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    valuation_date date NOT NULL,
    amount numeric(12,2),
    principal numeric(12,2),
    interest numeric(12,2),
    escrow numeric(12,2),
    fees numeric(12,2),
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT servicing_events_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text, 'pending'::text])))
);


--
-- Name: servicing_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.servicing_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: servicing_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.servicing_events_id_seq OWNED BY public.servicing_events.id;


--
-- Name: servicing_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicing_exceptions (
    id integer NOT NULL,
    run_id text,
    loan_id integer,
    severity text NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    suggested_action text,
    due_date date,
    status text DEFAULT 'open'::text NOT NULL,
    resolved_by integer,
    resolved_at timestamp without time zone,
    resolution_notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT servicing_exceptions_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT servicing_exceptions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'escalated'::text])))
);


--
-- Name: servicing_exceptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.servicing_exceptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: servicing_exceptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.servicing_exceptions_id_seq OWNED BY public.servicing_exceptions.id;


--
-- Name: servicing_instructions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicing_instructions (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    instruction_type text NOT NULL,
    priority public.priority DEFAULT 'medium'::public.priority,
    effective_date date NOT NULL,
    expiration_date date,
    instructions text NOT NULL,
    is_active boolean DEFAULT true,
    created_by integer,
    approved_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: servicing_instructions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.servicing_instructions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: servicing_instructions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.servicing_instructions_id_seq OWNED BY public.servicing_instructions.id;


--
-- Name: servicing_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicing_runs (
    id integer NOT NULL,
    run_id text NOT NULL,
    valuation_date date NOT NULL,
    start_time timestamp without time zone DEFAULT now() NOT NULL,
    end_time timestamp without time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    loans_processed integer DEFAULT 0 NOT NULL,
    total_loans integer DEFAULT 0 NOT NULL,
    events_created integer DEFAULT 0 NOT NULL,
    exceptions_created integer DEFAULT 0 NOT NULL,
    total_disbursed_beneficiary numeric(12,2) DEFAULT 0.00,
    total_disbursed_investors numeric(12,2) DEFAULT 0.00,
    reconciliation_status text DEFAULT 'pending'::text,
    input_hash text,
    errors text[],
    dry_run boolean DEFAULT false NOT NULL,
    loan_ids text[],
    created_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT servicing_runs_reconciliation_status_check CHECK ((reconciliation_status = ANY (ARRAY['pending'::text, 'balanced'::text, 'imbalanced'::text]))),
    CONSTRAINT servicing_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: servicing_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.servicing_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: servicing_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.servicing_runs_id_seq OWNED BY public.servicing_runs.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer,
    sid character varying(255),
    sess json NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    ip text,
    user_agent text,
    revoked_at timestamp with time zone,
    revoke_reason text,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: settlement_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_windows (
    rail text NOT NULL,
    min_hours integer NOT NULL,
    max_hours integer NOT NULL,
    cutoff_time time without time zone NOT NULL,
    business_days boolean DEFAULT true,
    retry_config jsonb
);


--
-- Name: system_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_alerts (
    id integer NOT NULL,
    severity character varying(20) NOT NULL,
    component character varying(100) NOT NULL,
    message text NOT NULL,
    details jsonb,
    acknowledged boolean DEFAULT false,
    acknowledged_by character varying(100),
    acknowledged_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_alerts_severity_check CHECK (((severity)::text = ANY ((ARRAY['INFO'::character varying, 'WARNING'::character varying, 'ERROR'::character varying, 'CRITICAL'::character varying])::text[])))
);


--
-- Name: system_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_alerts_id_seq OWNED BY public.system_alerts.id;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id integer NOT NULL,
    category text NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    is_editable boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by integer
);


--
-- Name: TABLE system_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_settings IS 'System-wide configuration settings';


--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    task_type text NOT NULL,
    priority public.priority DEFAULT 'medium'::public.priority,
    status text NOT NULL,
    loan_id integer,
    related_entity_type text,
    related_entity_id integer,
    assigned_to integer,
    assigned_by integer,
    assigned_date timestamp without time zone,
    due_date timestamp without time zone,
    started_date timestamp without time zone,
    completed_date timestamp without time zone,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tasks_id_seq OWNED BY public.tasks.id;


--
-- Name: user_ip_allowlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ip_allowlist (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id integer NOT NULL,
    label text NOT NULL,
    cidr cidr NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    begins_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    ip_address text,
    description text,
    last_used_at timestamp with time zone,
    use_count integer DEFAULT 0,
    metadata jsonb
);


--
-- Name: TABLE user_ip_allowlist; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_ip_allowlist IS 'IP address restrictions for users';


--
-- Name: COLUMN user_ip_allowlist.cidr; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ip_allowlist.cidr IS 'IPv4 or IPv6 CIDR notation for allowed IPs';


--
-- Name: user_mfa_factors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_mfa_factors (
    id integer NOT NULL,
    user_id integer NOT NULL,
    factor_type text NOT NULL,
    factor_name text NOT NULL,
    totp_secret text,
    totp_issuer text DEFAULT 'LoanServe Pro'::text,
    totp_algorithm text DEFAULT 'SHA1'::text,
    totp_digits integer DEFAULT 6,
    totp_period integer DEFAULT 30,
    phone_number text,
    email_address text,
    verified boolean DEFAULT false NOT NULL,
    verified_at timestamp without time zone,
    last_used_at timestamp without time zone,
    trusted_devices jsonb DEFAULT '[]'::jsonb,
    enrolled_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    enrolled_ip text,
    enrolled_user_agent text,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT user_mfa_factors_factor_type_check CHECK ((factor_type = ANY (ARRAY['totp'::text, 'sms'::text, 'email'::text])))
);


--
-- Name: user_mfa_factors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_mfa_factors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_mfa_factors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_mfa_factors_id_seq OWNED BY public.user_mfa_factors.id;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id integer NOT NULL,
    role_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by integer
);


--
-- Name: TABLE user_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_roles IS 'User role assignments using RBAC system. This replaces the legacy role enum column.';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    email text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    middle_name text,
    phone text,
    mobile_phone text,
    fax text,
    address text,
    address_2 text,
    city text,
    state text,
    zip_code text,
    country text DEFAULT 'USA'::text,
    date_of_birth date,
    ssn text,
    employer_name text,
    employer_phone text,
    job_title text,
    years_employed integer,
    monthly_income numeric(12,2),
    is_active boolean DEFAULT true NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    two_factor_enabled boolean DEFAULT false NOT NULL,
    profile_image text,
    preferences jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    last_login timestamp without time zone,
    failed_login_attempts integer DEFAULT 0,
    locked_until timestamp without time zone,
    status public.user_status DEFAULT 'active'::public.user_status NOT NULL,
    last_login_at timestamp with time zone,
    last_login_ip inet,
    failed_login_count integer DEFAULT 0 NOT NULL,
    password_updated_at timestamp with time zone,
    mfa_enabled boolean DEFAULT false,
    mfa_required boolean DEFAULT false,
    require_mfa_for_sensitive boolean DEFAULT true
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: aml_screenings screening_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aml_screenings ALTER COLUMN screening_id SET DEFAULT nextval('public.aml_screenings_screening_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: bank_files file_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_files ALTER COLUMN file_id SET DEFAULT nextval('public.bank_files_file_id_seq'::regclass);


--
-- Name: borrower_entities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.borrower_entities ALTER COLUMN id SET DEFAULT nextval('public.borrower_entities_id_seq'::regclass);


--
-- Name: collection_activities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_activities ALTER COLUMN id SET DEFAULT nextval('public.collection_activities_id_seq'::regclass);


--
-- Name: crm_activity id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activity ALTER COLUMN id SET DEFAULT nextval('public.crm_activity_id_seq'::regclass);


--
-- Name: crm_appointments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_appointments ALTER COLUMN id SET DEFAULT nextval('public.crm_appointments_id_seq'::regclass);


--
-- Name: crm_calls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_calls ALTER COLUMN id SET DEFAULT nextval('public.crm_calls_id_seq'::regclass);


--
-- Name: crm_collaborators id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_collaborators ALTER COLUMN id SET DEFAULT nextval('public.crm_collaborators_id_seq'::regclass);


--
-- Name: crm_deals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals ALTER COLUMN id SET DEFAULT nextval('public.crm_deals_id_seq'::regclass);


--
-- Name: crm_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_notes ALTER COLUMN id SET DEFAULT nextval('public.crm_notes_id_seq'::regclass);


--
-- Name: crm_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks ALTER COLUMN id SET DEFAULT nextval('public.crm_tasks_id_seq'::regclass);


--
-- Name: dead_letter_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dead_letter_messages ALTER COLUMN id SET DEFAULT nextval('public.dead_letter_messages_id_seq'::regclass);


--
-- Name: document_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates ALTER COLUMN id SET DEFAULT nextval('public.document_templates_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);


--
-- Name: email_template_folders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_template_folders ALTER COLUMN id SET DEFAULT nextval('public.email_template_folders_id_seq'::regclass);


--
-- Name: email_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates ALTER COLUMN id SET DEFAULT nextval('public.email_templates_id_seq'::regclass);


--
-- Name: escrow_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_accounts ALTER COLUMN id SET DEFAULT nextval('public.escrow_accounts_id_seq'::regclass);


--
-- Name: escrow_advances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_advances ALTER COLUMN id SET DEFAULT nextval('public.escrow_advances_id_seq'::regclass);


--
-- Name: escrow_disbursement_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursement_payments ALTER COLUMN id SET DEFAULT nextval('public.escrow_disbursement_payments_id_seq'::regclass);


--
-- Name: escrow_disbursements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursements ALTER COLUMN id SET DEFAULT nextval('public.escrow_disbursements_id_seq'::regclass);


--
-- Name: escrow_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_items ALTER COLUMN id SET DEFAULT nextval('public.escrow_items_id_seq'::regclass);


--
-- Name: escrow_ledger ledger_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_ledger ALTER COLUMN ledger_id SET DEFAULT nextval('public.escrow_ledger_ledger_id_seq'::regclass);


--
-- Name: escrow_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions ALTER COLUMN id SET DEFAULT nextval('public.escrow_transactions_id_seq'::regclass);


--
-- Name: expected_settlements expect_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expected_settlements ALTER COLUMN expect_id SET DEFAULT nextval('public.expected_settlements_expect_id_seq'::regclass);


--
-- Name: fee_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_templates ALTER COLUMN id SET DEFAULT nextval('public.fee_templates_id_seq'::regclass);


--
-- Name: guarantors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guarantors ALTER COLUMN id SET DEFAULT nextval('public.guarantors_id_seq'::regclass);


--
-- Name: insurance_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies ALTER COLUMN id SET DEFAULT nextval('public.insurance_policies_id_seq'::regclass);


--
-- Name: interest_accruals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_accruals ALTER COLUMN id SET DEFAULT nextval('public.interest_accruals_id_seq'::regclass);


--
-- Name: investor_distributions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_distributions ALTER COLUMN id SET DEFAULT nextval('public.investor_distributions_id_seq'::regclass);


--
-- Name: investors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investors ALTER COLUMN id SET DEFAULT nextval('public.investors_id_seq'::regclass);


--
-- Name: irs_1098_records record_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.irs_1098_records ALTER COLUMN record_id SET DEFAULT nextval('public.irs_1098_records_record_id_seq'::regclass);


--
-- Name: legal_proceedings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_proceedings ALTER COLUMN id SET DEFAULT nextval('public.legal_proceedings_id_seq'::regclass);


--
-- Name: loan_borrowers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_borrowers ALTER COLUMN id SET DEFAULT nextval('public.loan_borrowers_id_seq'::regclass);


--
-- Name: loan_fees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_fees ALTER COLUMN id SET DEFAULT nextval('public.loan_fees_id_seq'::regclass);


--
-- Name: loan_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_ledger ALTER COLUMN id SET DEFAULT nextval('public.loan_ledger_id_seq'::regclass);


--
-- Name: loans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans ALTER COLUMN id SET DEFAULT nextval('public.loans_id_seq'::regclass);


--
-- Name: message_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_metrics ALTER COLUMN id SET DEFAULT nextval('public.message_metrics_id_seq'::regclass);


--
-- Name: mfa_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_audit_log ALTER COLUMN id SET DEFAULT nextval('public.mfa_audit_log_id_seq'::regclass);


--
-- Name: mfa_backup_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_backup_codes ALTER COLUMN id SET DEFAULT nextval('public.mfa_backup_codes_id_seq'::regclass);


--
-- Name: mfa_challenges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_challenges ALTER COLUMN id SET DEFAULT nextval('public.mfa_challenges_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox ALTER COLUMN id SET DEFAULT nextval('public.outbox_id_seq'::regclass);


--
-- Name: payees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payees ALTER COLUMN id SET DEFAULT nextval('public.payees_id_seq'::regclass);


--
-- Name: payment_distributions distribution_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_distributions ALTER COLUMN distribution_id SET DEFAULT nextval('public.payment_distributions_distribution_id_seq'::regclass);


--
-- Name: payment_ledger ledger_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_ledger ALTER COLUMN ledger_id SET DEFAULT nextval('public.payment_ledger_ledger_id_seq'::regclass);


--
-- Name: payment_schedule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_schedule ALTER COLUMN id SET DEFAULT nextval('public.payment_schedule_id_seq'::regclass);


--
-- Name: payment_state_transitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_state_transitions ALTER COLUMN id SET DEFAULT nextval('public.payment_state_transitions_id_seq'::regclass);


--
-- Name: payments_inbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments_inbox ALTER COLUMN id SET DEFAULT nextval('public.payments_inbox_id_seq'::regclass);


--
-- Name: properties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties ALTER COLUMN id SET DEFAULT nextval('public.properties_id_seq'::regclass);


--
-- Name: reconciliation_exceptions exc_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_exceptions ALTER COLUMN exc_id SET DEFAULT nextval('public.reconciliation_exceptions_exc_id_seq'::regclass);


--
-- Name: reconciliation_matches match_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_matches ALTER COLUMN match_id SET DEFAULT nextval('public.reconciliation_matches_match_id_seq'::regclass);


--
-- Name: saga_step_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saga_step_history ALTER COLUMN id SET DEFAULT nextval('public.saga_step_history_id_seq'::regclass);


--
-- Name: servicing_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_events ALTER COLUMN id SET DEFAULT nextval('public.servicing_events_id_seq'::regclass);


--
-- Name: servicing_exceptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_exceptions ALTER COLUMN id SET DEFAULT nextval('public.servicing_exceptions_id_seq'::regclass);


--
-- Name: servicing_instructions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_instructions ALTER COLUMN id SET DEFAULT nextval('public.servicing_instructions_id_seq'::regclass);


--
-- Name: servicing_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_runs ALTER COLUMN id SET DEFAULT nextval('public.servicing_runs_id_seq'::regclass);


--
-- Name: system_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_alerts ALTER COLUMN id SET DEFAULT nextval('public.system_alerts_id_seq'::regclass);


--
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


--
-- Name: tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks ALTER COLUMN id SET DEFAULT nextval('public.tasks_id_seq'::regclass);


--
-- Name: user_mfa_factors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_mfa_factors ALTER COLUMN id SET DEFAULT nextval('public.user_mfa_factors_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: accounts_chart accounts_chart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_chart
    ADD CONSTRAINT accounts_chart_pkey PRIMARY KEY (account);


--
-- Name: ach_batch ach_batch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_batch
    ADD CONSTRAINT ach_batch_pkey PRIMARY KEY (ach_batch_id);


--
-- Name: ach_entry ach_entry_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_entry
    ADD CONSTRAINT ach_entry_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: ach_entry ach_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_entry
    ADD CONSTRAINT ach_entry_pkey PRIMARY KEY (ach_entry_id);


--
-- Name: ach_entry ach_entry_trace_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_entry
    ADD CONSTRAINT ach_entry_trace_number_key UNIQUE (trace_number);


--
-- Name: ach_return ach_return_ach_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_return
    ADD CONSTRAINT ach_return_ach_entry_id_key UNIQUE (ach_entry_id);


--
-- Name: ach_return ach_return_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_return
    ADD CONSTRAINT ach_return_pkey PRIMARY KEY (ach_return_id);


--
-- Name: ach_return_windows ach_return_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_return_windows
    ADD CONSTRAINT ach_return_windows_pkey PRIMARY KEY (payment_id);


--
-- Name: allocation_rules allocation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_rules
    ADD CONSTRAINT allocation_rules_pkey PRIMARY KEY (loan_id, priority);


--
-- Name: aml_screenings aml_screenings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aml_screenings
    ADD CONSTRAINT aml_screenings_pkey PRIMARY KEY (screening_id);


--
-- Name: attorney attorney_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attorney
    ADD CONSTRAINT attorney_pkey PRIMARY KEY (attorney_id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (event_id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_events auth_events_event_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_events
    ADD CONSTRAINT auth_events_event_key_key UNIQUE (event_key);


--
-- Name: auth_events auth_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_events
    ADD CONSTRAINT auth_events_pkey PRIMARY KEY (id);


--
-- Name: bank_account bank_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_account
    ADD CONSTRAINT bank_account_pkey PRIMARY KEY (bank_acct_id);


--
-- Name: bank_files bank_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_files
    ADD CONSTRAINT bank_files_pkey PRIMARY KEY (file_id);


--
-- Name: bank_files bank_files_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_files
    ADD CONSTRAINT bank_files_sha256_key UNIQUE (sha256);


--
-- Name: bank_statement_file bank_statement_file_bank_acct_id_as_of_date_file_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_file
    ADD CONSTRAINT bank_statement_file_bank_acct_id_as_of_date_file_hash_key UNIQUE (bank_acct_id, as_of_date, file_hash);


--
-- Name: bank_statement_file bank_statement_file_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_file
    ADD CONSTRAINT bank_statement_file_pkey PRIMARY KEY (stmt_file_id);


--
-- Name: bank_transactions bank_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_pkey PRIMARY KEY (ext_tx_id);


--
-- Name: bank_txn bank_txn_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_txn
    ADD CONSTRAINT bank_txn_pkey PRIMARY KEY (bank_txn_id);


--
-- Name: borrower_entities borrower_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.borrower_entities
    ADD CONSTRAINT borrower_entities_pkey PRIMARY KEY (id);


--
-- Name: cash_match_candidate cash_match_candidate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_match_candidate
    ADD CONSTRAINT cash_match_candidate_pkey PRIMARY KEY (candidate_id);


--
-- Name: collection_activities collection_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_activities
    ADD CONSTRAINT collection_activities_pkey PRIMARY KEY (id);


--
-- Name: collection_case collection_case_loan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_case
    ADD CONSTRAINT collection_case_loan_id_key UNIQUE (loan_id);


--
-- Name: collection_case collection_case_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_case
    ADD CONSTRAINT collection_case_pkey PRIMARY KEY (case_id);


--
-- Name: consumer_inbox consumer_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumer_inbox
    ADD CONSTRAINT consumer_inbox_pkey PRIMARY KEY (consumer, message_id);


--
-- Name: crm_activity crm_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activity
    ADD CONSTRAINT crm_activity_pkey PRIMARY KEY (id);


--
-- Name: crm_appointments crm_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_appointments
    ADD CONSTRAINT crm_appointments_pkey PRIMARY KEY (id);


--
-- Name: crm_calls crm_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_calls
    ADD CONSTRAINT crm_calls_pkey PRIMARY KEY (id);


--
-- Name: crm_collaborators crm_collaborators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_collaborators
    ADD CONSTRAINT crm_collaborators_pkey PRIMARY KEY (id);


--
-- Name: crm_deals crm_deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_pkey PRIMARY KEY (id);


--
-- Name: crm_notes crm_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_notes
    ADD CONSTRAINT crm_notes_pkey PRIMARY KEY (id);


--
-- Name: crm_tasks crm_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_pkey PRIMARY KEY (id);


--
-- Name: currency_codes currency_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_codes
    ADD CONSTRAINT currency_codes_pkey PRIMARY KEY (code);


--
-- Name: dead_letter_messages dead_letter_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dead_letter_messages
    ADD CONSTRAINT dead_letter_messages_pkey PRIMARY KEY (id);


--
-- Name: delinquency_current delinquency_current_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delinquency_current
    ADD CONSTRAINT delinquency_current_pkey PRIMARY KEY (loan_id);


--
-- Name: delinquency_snapshot delinquency_snapshot_loan_id_as_of_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delinquency_snapshot
    ADD CONSTRAINT delinquency_snapshot_loan_id_as_of_date_key UNIQUE (loan_id, as_of_date);


--
-- Name: delinquency_snapshot delinquency_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delinquency_snapshot
    ADD CONSTRAINT delinquency_snapshot_pkey PRIMARY KEY (snap_id);


--
-- Name: document_artifact document_artifact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_artifact
    ADD CONSTRAINT document_artifact_pkey PRIMARY KEY (doc_id);


--
-- Name: document_artifact document_artifact_type_loan_id_period_start_period_end_tax__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_artifact
    ADD CONSTRAINT document_artifact_type_loan_id_period_start_period_end_tax__key UNIQUE (type, loan_id, period_start, period_end, tax_year);


--
-- Name: document_template document_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template
    ADD CONSTRAINT document_template_pkey PRIMARY KEY (template_id);


--
-- Name: document_template document_template_type_jurisdiction_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template
    ADD CONSTRAINT document_template_type_jurisdiction_version_key UNIQUE (type, jurisdiction, version);


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: email_template_folders email_template_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_template_folders
    ADD CONSTRAINT email_template_folders_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_template_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_template_key_key UNIQUE (template_key);


--
-- Name: escrow_accounts escrow_accounts_account_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_accounts
    ADD CONSTRAINT escrow_accounts_account_number_unique UNIQUE (account_number);


--
-- Name: escrow_accounts escrow_accounts_loan_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_accounts
    ADD CONSTRAINT escrow_accounts_loan_id_unique UNIQUE (loan_id);


--
-- Name: escrow_accounts escrow_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_accounts
    ADD CONSTRAINT escrow_accounts_pkey PRIMARY KEY (id);


--
-- Name: escrow_advances escrow_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_advances
    ADD CONSTRAINT escrow_advances_pkey PRIMARY KEY (id);


--
-- Name: escrow_analysis_item escrow_analysis_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_analysis_item
    ADD CONSTRAINT escrow_analysis_item_pkey PRIMARY KEY (analysis_id, escrow_id, forecast_due_date);


--
-- Name: escrow_analysis escrow_analysis_loan_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_analysis
    ADD CONSTRAINT escrow_analysis_loan_id_version_key UNIQUE (loan_id, version);


--
-- Name: escrow_analysis escrow_analysis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_analysis
    ADD CONSTRAINT escrow_analysis_pkey PRIMARY KEY (analysis_id);


--
-- Name: escrow_disbursement escrow_disbursement_loan_id_escrow_id_due_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursement
    ADD CONSTRAINT escrow_disbursement_loan_id_escrow_id_due_date_key UNIQUE (loan_id, escrow_id, due_date);


--
-- Name: escrow_disbursement_payments escrow_disbursement_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursement_payments
    ADD CONSTRAINT escrow_disbursement_payments_pkey PRIMARY KEY (id);


--
-- Name: escrow_disbursement escrow_disbursement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursement
    ADD CONSTRAINT escrow_disbursement_pkey PRIMARY KEY (disb_id);


--
-- Name: escrow_disbursements escrow_disbursements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursements
    ADD CONSTRAINT escrow_disbursements_pkey PRIMARY KEY (id);


--
-- Name: escrow_forecast escrow_forecast_loan_id_escrow_id_due_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_forecast
    ADD CONSTRAINT escrow_forecast_loan_id_escrow_id_due_date_key UNIQUE (loan_id, escrow_id, due_date);


--
-- Name: escrow_forecast escrow_forecast_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_forecast
    ADD CONSTRAINT escrow_forecast_pkey PRIMARY KEY (forecast_id);


--
-- Name: escrow_items escrow_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_items
    ADD CONSTRAINT escrow_items_pkey PRIMARY KEY (id);


--
-- Name: escrow_ledger escrow_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_ledger
    ADD CONSTRAINT escrow_ledger_pkey PRIMARY KEY (ledger_id);


--
-- Name: escrow_policy escrow_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_policy
    ADD CONSTRAINT escrow_policy_pkey PRIMARY KEY (policy_id);


--
-- Name: escrow_policy escrow_policy_product_code_jurisdiction_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_policy
    ADD CONSTRAINT escrow_policy_product_code_jurisdiction_key UNIQUE (product_code, jurisdiction);


--
-- Name: escrow_statement escrow_statement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_statement
    ADD CONSTRAINT escrow_statement_pkey PRIMARY KEY (analysis_id);


--
-- Name: escrow_transactions escrow_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_pkey PRIMARY KEY (id);


--
-- Name: exception_cases exception_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_cases
    ADD CONSTRAINT exception_cases_pkey PRIMARY KEY (id);


--
-- Name: expected_settlements expected_settlements_payment_id_method_direction_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expected_settlements
    ADD CONSTRAINT expected_settlements_payment_id_method_direction_key UNIQUE (payment_id, method, direction);


--
-- Name: expected_settlements expected_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expected_settlements
    ADD CONSTRAINT expected_settlements_pkey PRIMARY KEY (expect_id);


--
-- Name: fee_policy fee_policy_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_policy
    ADD CONSTRAINT fee_policy_no_overlap EXCLUDE USING gist (product_code WITH =, jurisdiction WITH =, daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[)'::text) WITH &&);


--
-- Name: fee_policy fee_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_policy
    ADD CONSTRAINT fee_policy_pkey PRIMARY KEY (policy_id);


--
-- Name: fee_templates fee_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_templates
    ADD CONSTRAINT fee_templates_pkey PRIMARY KEY (id);


--
-- Name: foreclosure_case foreclosure_case_loan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foreclosure_case
    ADD CONSTRAINT foreclosure_case_loan_id_key UNIQUE (loan_id);


--
-- Name: foreclosure_case foreclosure_case_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foreclosure_case
    ADD CONSTRAINT foreclosure_case_pkey PRIMARY KEY (fc_id);


--
-- Name: foreclosure_event foreclosure_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foreclosure_event
    ADD CONSTRAINT foreclosure_event_pkey PRIMARY KEY (fc_id, milestone);


--
-- Name: gateway_provider gateway_provider_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_provider
    ADD CONSTRAINT gateway_provider_pkey PRIMARY KEY (provider_code);


--
-- Name: guarantors guarantors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guarantors
    ADD CONSTRAINT guarantors_pkey PRIMARY KEY (id);


--
-- Name: idempotency_key idempotency_key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_key
    ADD CONSTRAINT idempotency_key_pkey PRIMARY KEY (event_type, key);


--
-- Name: inbox inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox
    ADD CONSTRAINT inbox_pkey PRIMARY KEY (consumer, message_id);


--
-- Name: insurance_policies insurance_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_pkey PRIMARY KEY (id);


--
-- Name: interest_accruals interest_accruals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_accruals
    ADD CONSTRAINT interest_accruals_pkey PRIMARY KEY (id);


--
-- Name: investor_contract investor_contract_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_contract
    ADD CONSTRAINT investor_contract_pkey PRIMARY KEY (contract_id);


--
-- Name: investor_distributions investor_distributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_distributions
    ADD CONSTRAINT investor_distributions_pkey PRIMARY KEY (id);


--
-- Name: investor_position_versions investor_position_versions_loan_id_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_position_versions
    ADD CONSTRAINT investor_position_versions_loan_id_effective_from_key UNIQUE (loan_id, effective_from);


--
-- Name: investor_position_versions investor_position_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_position_versions
    ADD CONSTRAINT investor_position_versions_pkey PRIMARY KEY (version_id);


--
-- Name: investor_positions investor_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_positions
    ADD CONSTRAINT investor_positions_pkey PRIMARY KEY (version_id, investor_id);


--
-- Name: investor_waterfall_rule investor_waterfall_rule_contract_id_rank_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_waterfall_rule
    ADD CONSTRAINT investor_waterfall_rule_contract_id_rank_key UNIQUE (contract_id, rank);


--
-- Name: investor_waterfall_rule investor_waterfall_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_waterfall_rule
    ADD CONSTRAINT investor_waterfall_rule_pkey PRIMARY KEY (rule_id);


--
-- Name: investors investors_investor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investors
    ADD CONSTRAINT investors_investor_id_key UNIQUE (investor_id);


--
-- Name: investors investors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investors
    ADD CONSTRAINT investors_pkey PRIMARY KEY (id);


--
-- Name: irs_1098_records irs_1098_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.irs_1098_records
    ADD CONSTRAINT irs_1098_records_pkey PRIMARY KEY (record_id);


--
-- Name: late_fee_assessment late_fee_assessment_loan_id_period_due_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.late_fee_assessment
    ADD CONSTRAINT late_fee_assessment_loan_id_period_due_date_key UNIQUE (loan_id, period_due_date);


--
-- Name: late_fee_assessment late_fee_assessment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.late_fee_assessment
    ADD CONSTRAINT late_fee_assessment_pkey PRIMARY KEY (fee_id);


--
-- Name: ledger_entries_legacy ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries_legacy
    ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: ledger_entry ledger_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entry
    ADD CONSTRAINT ledger_entry_pkey PRIMARY KEY (entry_id);


--
-- Name: ledger_event ledger_event_correlation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_event
    ADD CONSTRAINT ledger_event_correlation_id_key UNIQUE (correlation_id);


--
-- Name: ledger_event ledger_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_event
    ADD CONSTRAINT ledger_event_pkey PRIMARY KEY (event_id);


--
-- Name: legal_proceedings legal_proceedings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_proceedings
    ADD CONSTRAINT legal_proceedings_pkey PRIMARY KEY (id);


--
-- Name: lender_entity lender_entity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lender_entity
    ADD CONSTRAINT lender_entity_pkey PRIMARY KEY (lender_id);


--
-- Name: loan_accounting_config loan_accounting_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_accounting_config
    ADD CONSTRAINT loan_accounting_config_pkey PRIMARY KEY (loan_id);


--
-- Name: loan_balances loan_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_balances
    ADD CONSTRAINT loan_balances_pkey PRIMARY KEY (loan_id);


--
-- Name: loan_borrowers loan_borrowers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_borrowers
    ADD CONSTRAINT loan_borrowers_pkey PRIMARY KEY (id);


--
-- Name: loan_fees loan_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_fees
    ADD CONSTRAINT loan_fees_pkey PRIMARY KEY (id);


--
-- Name: loan_ledger loan_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_ledger
    ADD CONSTRAINT loan_ledger_pkey PRIMARY KEY (id);


--
-- Name: loan_ledger loan_ledger_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_ledger
    ADD CONSTRAINT loan_ledger_transaction_id_key UNIQUE (transaction_id);


--
-- Name: loan_terms loan_terms_loan_id_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_terms
    ADD CONSTRAINT loan_terms_loan_id_effective_from_key UNIQUE (loan_id, effective_from);


--
-- Name: loan_terms loan_terms_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_terms
    ADD CONSTRAINT loan_terms_no_overlap EXCLUDE USING gist (loan_id WITH =, daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[)'::text) WITH &&);


--
-- Name: loan_terms loan_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_terms
    ADD CONSTRAINT loan_terms_pkey PRIMARY KEY (terms_id);


--
-- Name: loans loans_loan_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_loan_number_unique UNIQUE (loan_number);


--
-- Name: loans loans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: message_metrics message_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_metrics
    ADD CONSTRAINT message_metrics_pkey PRIMARY KEY (id);


--
-- Name: mfa_audit_log mfa_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_audit_log
    ADD CONSTRAINT mfa_audit_log_pkey PRIMARY KEY (id);


--
-- Name: mfa_backup_codes mfa_backup_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_backup_codes
    ADD CONSTRAINT mfa_backup_codes_pkey PRIMARY KEY (id);


--
-- Name: mfa_challenges mfa_challenges_challenge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_challenges
    ADD CONSTRAINT mfa_challenges_challenge_id_key UNIQUE (challenge_id);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: notice_schedule notice_schedule_loan_id_notice_template_id_scheduled_for_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notice_schedule
    ADD CONSTRAINT notice_schedule_loan_id_notice_template_id_scheduled_for_key UNIQUE (loan_id, notice_template_id, scheduled_for);


--
-- Name: notice_schedule notice_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notice_schedule
    ADD CONSTRAINT notice_schedule_pkey PRIMARY KEY (notice_id);


--
-- Name: notice_template_v2 notice_template_v2_code_jurisdiction_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notice_template_v2
    ADD CONSTRAINT notice_template_v2_code_jurisdiction_version_key UNIQUE (code, jurisdiction, version);


--
-- Name: notice_template_v2 notice_template_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notice_template_v2
    ADD CONSTRAINT notice_template_v2_pkey PRIMARY KEY (notice_template_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (event_id);


--
-- Name: outbox_messages outbox_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_messages
    ADD CONSTRAINT outbox_messages_pkey PRIMARY KEY (id);


--
-- Name: outbox outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox
    ADD CONSTRAINT outbox_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_token_hash_key UNIQUE (user_id, token_hash);


--
-- Name: payees payees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payees
    ADD CONSTRAINT payees_pkey PRIMARY KEY (id);


--
-- Name: payment_artifacts payment_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_artifacts
    ADD CONSTRAINT payment_artifacts_pkey PRIMARY KEY (id);


--
-- Name: payment_distributions payment_distributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_distributions
    ADD CONSTRAINT payment_distributions_pkey PRIMARY KEY (distribution_id);


--
-- Name: payment_events payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_pkey PRIMARY KEY (id);


--
-- Name: payment_ingestion payment_ingestion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_ingestion
    ADD CONSTRAINT payment_ingestion_pkey PRIMARY KEY (id);


--
-- Name: payment_ingestions payment_ingestions_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_ingestions
    ADD CONSTRAINT payment_ingestions_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: payment_ingestions payment_ingestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_ingestions
    ADD CONSTRAINT payment_ingestions_pkey PRIMARY KEY (id);


--
-- Name: payment_intake payment_intake_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_intake
    ADD CONSTRAINT payment_intake_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: payment_intake payment_intake_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_intake
    ADD CONSTRAINT payment_intake_pkey PRIMARY KEY (payment_id);


--
-- Name: payment_intake payment_intake_source_provider_gateway_txn_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_intake
    ADD CONSTRAINT payment_intake_source_provider_gateway_txn_id_key UNIQUE (source_provider, gateway_txn_id);


--
-- Name: payment_ledger payment_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_ledger
    ADD CONSTRAINT payment_ledger_pkey PRIMARY KEY (ledger_id);


--
-- Name: payment_posting payment_posting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_posting
    ADD CONSTRAINT payment_posting_pkey PRIMARY KEY (payment_id);


--
-- Name: payment_schedule payment_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_schedule
    ADD CONSTRAINT payment_schedule_pkey PRIMARY KEY (id);


--
-- Name: payment_state_transitions payment_state_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_state_transitions
    ADD CONSTRAINT payment_state_transitions_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (payment_id);


--
-- Name: payment_validation payment_validation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_validation
    ADD CONSTRAINT payment_validation_pkey PRIMARY KEY (payment_id);


--
-- Name: payments_inbox payments_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments_inbox
    ADD CONSTRAINT payments_inbox_pkey PRIMARY KEY (id);


--
-- Name: payments_inbox payments_inbox_reference_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments_inbox
    ADD CONSTRAINT payments_inbox_reference_number_key UNIQUE (reference_number);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_resource_level_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_resource_level_key UNIQUE (resource, level);


--
-- Name: plan_header plan_header_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_header
    ADD CONSTRAINT plan_header_pkey PRIMARY KEY (plan_id);


--
-- Name: plan_progress plan_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_progress
    ADD CONSTRAINT plan_progress_pkey PRIMARY KEY (plan_id, installment_no);


--
-- Name: plan_schedule plan_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_schedule
    ADD CONSTRAINT plan_schedule_pkey PRIMARY KEY (plan_id, installment_no);


--
-- Name: plan_schedule plan_schedule_plan_id_due_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_schedule
    ADD CONSTRAINT plan_schedule_plan_id_due_date_key UNIQUE (plan_id, due_date);


--
-- Name: product_policy product_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_policy
    ADD CONSTRAINT product_policy_pkey PRIMARY KEY (product_code);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: recon_exception recon_exception_bank_txn_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recon_exception
    ADD CONSTRAINT recon_exception_bank_txn_id_key UNIQUE (bank_txn_id);


--
-- Name: recon_exception recon_exception_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recon_exception
    ADD CONSTRAINT recon_exception_pkey PRIMARY KEY (recon_id);


--
-- Name: reconciliation_exceptions reconciliation_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_exceptions
    ADD CONSTRAINT reconciliation_exceptions_pkey PRIMARY KEY (exc_id);


--
-- Name: reconciliation_matches reconciliation_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_matches
    ADD CONSTRAINT reconciliation_matches_pkey PRIMARY KEY (match_id);


--
-- Name: reconciliations reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_pkey PRIMARY KEY (id);


--
-- Name: remittance_cycle remittance_cycle_contract_id_period_start_period_end_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittance_cycle
    ADD CONSTRAINT remittance_cycle_contract_id_period_start_period_end_key UNIQUE (contract_id, period_start, period_end);


--
-- Name: remittance_cycle remittance_cycle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittance_cycle
    ADD CONSTRAINT remittance_cycle_pkey PRIMARY KEY (cycle_id);


--
-- Name: remittance_export remittance_export_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittance_export
    ADD CONSTRAINT remittance_export_pkey PRIMARY KEY (export_id);


--
-- Name: remittance_item remittance_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittance_item
    ADD CONSTRAINT remittance_item_pkey PRIMARY KEY (item_id);


--
-- Name: remittance_recon_snapshot remittance_recon_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittance_recon_snapshot
    ADD CONSTRAINT remittance_recon_snapshot_pkey PRIMARY KEY (snapshot_id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: saga_states saga_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saga_states
    ADD CONSTRAINT saga_states_pkey PRIMARY KEY (saga_id);


--
-- Name: saga_step_history saga_step_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saga_step_history
    ADD CONSTRAINT saga_step_history_pkey PRIMARY KEY (id);


--
-- Name: saga_step_history saga_step_history_saga_id_step_name_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saga_step_history
    ADD CONSTRAINT saga_step_history_saga_id_step_name_idempotency_key_key UNIQUE (saga_id, step_name, idempotency_key);


--
-- Name: schedule_plan schedule_plan_loan_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_plan
    ADD CONSTRAINT schedule_plan_loan_id_version_key UNIQUE (loan_id, version);


--
-- Name: schedule_plan schedule_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_plan
    ADD CONSTRAINT schedule_plan_pkey PRIMARY KEY (plan_id);


--
-- Name: schedule_row schedule_row_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_row
    ADD CONSTRAINT schedule_row_pkey PRIMARY KEY (plan_id, period_no);


--
-- Name: servicing_events servicing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_events
    ADD CONSTRAINT servicing_events_pkey PRIMARY KEY (id);


--
-- Name: servicing_exceptions servicing_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_exceptions
    ADD CONSTRAINT servicing_exceptions_pkey PRIMARY KEY (id);


--
-- Name: servicing_instructions servicing_instructions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_instructions
    ADD CONSTRAINT servicing_instructions_pkey PRIMARY KEY (id);


--
-- Name: servicing_runs servicing_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_runs
    ADD CONSTRAINT servicing_runs_pkey PRIMARY KEY (id);


--
-- Name: servicing_runs servicing_runs_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_runs
    ADD CONSTRAINT servicing_runs_run_id_key UNIQUE (run_id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: sessions sessions_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey1 PRIMARY KEY (id);


--
-- Name: sessions sessions_sid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_sid_key UNIQUE (sid);


--
-- Name: settlement_windows settlement_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_windows
    ADD CONSTRAINT settlement_windows_pkey PRIMARY KEY (rail);


--
-- Name: system_alerts system_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_alerts
    ADD CONSTRAINT system_alerts_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: user_ip_allowlist user_ip_allowlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ip_allowlist
    ADD CONSTRAINT user_ip_allowlist_pkey PRIMARY KEY (id);


--
-- Name: user_ip_allowlist user_ip_allowlist_user_id_cidr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ip_allowlist
    ADD CONSTRAINT user_ip_allowlist_user_id_cidr_key UNIQUE (user_id, cidr);


--
-- Name: user_mfa_factors user_mfa_factors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_mfa_factors
    ADD CONSTRAINT user_mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: audit_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_created_at_idx ON public.audit_logs USING btree (created_at);


--
-- Name: audit_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_entity_idx ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: audit_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_user_idx ON public.audit_logs USING btree (user_id);


--
-- Name: borrower_ein_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX borrower_ein_idx ON public.borrower_entities USING btree (ein);


--
-- Name: borrower_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX borrower_email_idx ON public.borrower_entities USING btree (email);


--
-- Name: borrower_entity_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX borrower_entity_type_idx ON public.borrower_entities USING btree (entity_type);


--
-- Name: borrower_ssn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX borrower_ssn_idx ON public.borrower_entities USING btree (ssn);


--
-- Name: collection_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_date_idx ON public.collection_activities USING btree (activity_date);


--
-- Name: collection_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_loan_idx ON public.collection_activities USING btree (loan_id);


--
-- Name: collection_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_status_idx ON public.collection_activities USING btree (status);


--
-- Name: crm_activity_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_activity_created_at_idx ON public.crm_activity USING btree (created_at);


--
-- Name: crm_activity_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_activity_loan_idx ON public.crm_activity USING btree (loan_id);


--
-- Name: crm_activity_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_activity_type_idx ON public.crm_activity USING btree (activity_type);


--
-- Name: crm_activity_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_activity_user_idx ON public.crm_activity USING btree (user_id);


--
-- Name: crm_appointments_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_appointments_loan_idx ON public.crm_appointments USING btree (loan_id);


--
-- Name: crm_appointments_start_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_appointments_start_time_idx ON public.crm_appointments USING btree (start_time);


--
-- Name: crm_appointments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_appointments_status_idx ON public.crm_appointments USING btree (status);


--
-- Name: crm_calls_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_calls_loan_idx ON public.crm_calls USING btree (loan_id);


--
-- Name: crm_calls_scheduled_for_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_calls_scheduled_for_idx ON public.crm_calls USING btree (scheduled_for);


--
-- Name: crm_calls_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_calls_status_idx ON public.crm_calls USING btree (status);


--
-- Name: crm_calls_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_calls_user_idx ON public.crm_calls USING btree (user_id);


--
-- Name: crm_collaborators_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_collaborators_loan_idx ON public.crm_collaborators USING btree (loan_id);


--
-- Name: crm_collaborators_loan_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX crm_collaborators_loan_user_idx ON public.crm_collaborators USING btree (loan_id, user_id);


--
-- Name: crm_collaborators_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_collaborators_user_idx ON public.crm_collaborators USING btree (user_id);


--
-- Name: crm_deals_assigned_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_deals_assigned_to_idx ON public.crm_deals USING btree (assigned_to);


--
-- Name: crm_deals_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_deals_loan_idx ON public.crm_deals USING btree (loan_id);


--
-- Name: crm_deals_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_deals_stage_idx ON public.crm_deals USING btree (stage);


--
-- Name: crm_notes_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_notes_created_at_idx ON public.crm_notes USING btree (created_at);


--
-- Name: crm_notes_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_notes_loan_idx ON public.crm_notes USING btree (loan_id);


--
-- Name: crm_notes_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_notes_user_idx ON public.crm_notes USING btree (user_id);


--
-- Name: crm_tasks_assigned_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_assigned_to_idx ON public.crm_tasks USING btree (assigned_to);


--
-- Name: crm_tasks_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_due_date_idx ON public.crm_tasks USING btree (due_date);


--
-- Name: crm_tasks_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_loan_idx ON public.crm_tasks USING btree (loan_id);


--
-- Name: crm_tasks_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_status_idx ON public.crm_tasks USING btree (status);


--
-- Name: document_borrower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_borrower_idx ON public.documents USING btree (borrower_id);


--
-- Name: document_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_category_idx ON public.documents USING btree (category);


--
-- Name: document_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_date_idx ON public.documents USING btree (document_date);


--
-- Name: document_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_loan_idx ON public.documents USING btree (loan_id);


--
-- Name: document_uploaded_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_uploaded_by_idx ON public.documents USING btree (uploaded_by);


--
-- Name: escrow_account_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX escrow_account_number_idx ON public.escrow_accounts USING btree (account_number);


--
-- Name: escrow_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_active_idx ON public.escrow_accounts USING btree (is_active);


--
-- Name: escrow_advances_loan_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_advances_loan_id_idx ON public.escrow_advances USING btree (loan_id);


--
-- Name: escrow_advances_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_advances_status_idx ON public.escrow_advances USING btree (status);


--
-- Name: escrow_analysis_as_of_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_analysis_as_of_date_idx ON public.escrow_analysis USING btree (as_of_date);


--
-- Name: escrow_analysis_item_analysis_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_analysis_item_analysis_idx ON public.escrow_analysis_item USING btree (analysis_id);


--
-- Name: escrow_analysis_item_escrow_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_analysis_item_escrow_idx ON public.escrow_analysis_item USING btree (escrow_id);


--
-- Name: escrow_analysis_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_analysis_loan_idx ON public.escrow_analysis USING btree (loan_id);


--
-- Name: escrow_disb_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_disb_account_idx ON public.escrow_disbursements USING btree (escrow_account_id);


--
-- Name: escrow_disb_hold_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_disb_hold_idx ON public.escrow_disbursements USING btree (is_on_hold);


--
-- Name: escrow_disb_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_disb_loan_idx ON public.escrow_disbursements USING btree (loan_id);


--
-- Name: escrow_disb_next_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_disb_next_due_idx ON public.escrow_disbursements USING btree (next_due_date);


--
-- Name: escrow_disb_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_disb_status_idx ON public.escrow_disbursements USING btree (status);


--
-- Name: escrow_disb_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_disb_type_idx ON public.escrow_disbursements USING btree (disbursement_type);


--
-- Name: escrow_disbursement_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_disbursement_due_date_idx ON public.escrow_disbursement USING btree (due_date);


--
-- Name: escrow_disbursement_escrow_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_disbursement_escrow_idx ON public.escrow_disbursement USING btree (escrow_id);


--
-- Name: escrow_disbursement_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_disbursement_loan_idx ON public.escrow_disbursement USING btree (loan_id);


--
-- Name: escrow_disbursement_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_disbursement_status_idx ON public.escrow_disbursement USING btree (status);


--
-- Name: escrow_forecast_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_forecast_due_date_idx ON public.escrow_forecast USING btree (due_date);


--
-- Name: escrow_forecast_escrow_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_forecast_escrow_idx ON public.escrow_forecast USING btree (escrow_id);


--
-- Name: escrow_forecast_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_forecast_loan_idx ON public.escrow_forecast USING btree (loan_id);


--
-- Name: escrow_item_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_item_account_idx ON public.escrow_items USING btree (escrow_account_id);


--
-- Name: escrow_item_next_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_item_next_due_idx ON public.escrow_items USING btree (next_due_date);


--
-- Name: escrow_item_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_item_type_idx ON public.escrow_items USING btree (item_type);


--
-- Name: escrow_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX escrow_loan_idx ON public.escrow_accounts USING btree (loan_id);


--
-- Name: escrow_payment_disbursement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_payment_disbursement_idx ON public.escrow_disbursement_payments USING btree (disbursement_id);


--
-- Name: escrow_payment_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_payment_due_date_idx ON public.escrow_disbursement_payments USING btree (due_date);


--
-- Name: escrow_payment_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_payment_loan_idx ON public.escrow_disbursement_payments USING btree (loan_id);


--
-- Name: escrow_payment_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_payment_status_idx ON public.escrow_disbursement_payments USING btree (status);


--
-- Name: escrow_policy_jurisdiction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_policy_jurisdiction_idx ON public.escrow_policy USING btree (jurisdiction);


--
-- Name: escrow_policy_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_policy_product_idx ON public.escrow_policy USING btree (product_code);


--
-- Name: escrow_trans_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_trans_account_idx ON public.escrow_transactions USING btree (escrow_account_id);


--
-- Name: escrow_trans_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_trans_date_idx ON public.escrow_transactions USING btree (transaction_date);


--
-- Name: escrow_trans_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escrow_trans_type_idx ON public.escrow_transactions USING btree (transaction_type);


--
-- Name: fee_template_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_template_default_idx ON public.fee_templates USING btree (is_default);


--
-- Name: fee_template_lender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_template_lender_idx ON public.fee_templates USING btree (lender_id);


--
-- Name: guarantor_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guarantor_entity_idx ON public.guarantors USING btree (guarantor_entity_id);


--
-- Name: guarantor_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guarantor_loan_idx ON public.guarantors USING btree (loan_id);


--
-- Name: idx_1098_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_1098_year ON public.irs_1098_records USING btree (tax_year, borrower_id);


--
-- Name: idx_ach_batch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ach_batch_status ON public.ach_batch USING btree (status, created_at);


--
-- Name: idx_ach_entry_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ach_entry_batch ON public.ach_entry USING btree (ach_batch_id);


--
-- Name: idx_ach_entry_trace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ach_entry_trace ON public.ach_entry USING btree (trace_number) WHERE (trace_number IS NOT NULL);


--
-- Name: idx_ach_windows_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ach_windows_expires ON public.ach_return_windows USING btree (window_expires_at) WHERE (probe_scheduled = false);


--
-- Name: idx_aml_result; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aml_result ON public.aml_screenings USING btree (result, screened_at);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_log USING btree (action, occurred_at);


--
-- Name: idx_auth_events_actor_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_events_actor_user_id ON public.auth_events USING btree (actor_user_id);


--
-- Name: idx_auth_events_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_events_composite ON public.auth_events USING btree (event_type, occurred_at DESC);


--
-- Name: idx_auth_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_events_event_type ON public.auth_events USING btree (event_type);


--
-- Name: idx_auth_events_occurred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_events_occurred_at ON public.auth_events USING btree (occurred_at DESC);


--
-- Name: idx_auth_events_target_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_events_target_user_id ON public.auth_events USING btree (target_user_id);


--
-- Name: idx_bank_tx_posted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_tx_posted ON public.bank_transactions USING btree (posted_at);


--
-- Name: idx_bank_txn_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_txn_event ON public.bank_txn USING btree (matched_event_id) WHERE (matched_event_id IS NOT NULL);


--
-- Name: idx_bank_txn_matched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_txn_matched ON public.bank_txn USING btree (matched, bank_acct_id, posted_date);


--
-- Name: idx_cash_match_bank_txn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_match_bank_txn ON public.cash_match_candidate USING btree (bank_txn_id, score DESC);


--
-- Name: idx_consumer_inbox_processed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumer_inbox_processed_at ON public.consumer_inbox USING btree (processed_at);


--
-- Name: idx_dead_letter_messages_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dead_letter_messages_unresolved ON public.dead_letter_messages USING btree (queue_name, resolved_at) WHERE (resolved_at IS NULL);


--
-- Name: idx_delinquency_snapshot_loan_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delinquency_snapshot_loan_date ON public.delinquency_snapshot USING btree (loan_id, as_of_date DESC);


--
-- Name: idx_distrib_investor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distrib_investor ON public.payment_distributions USING btree (investor_id, status);


--
-- Name: idx_distrib_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distrib_payment ON public.payment_distributions USING btree (payment_id);


--
-- Name: idx_document_artifact_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_artifact_hash ON public.document_artifact USING btree (inputs_hash, pdf_hash);


--
-- Name: idx_document_artifact_loan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_artifact_loan ON public.document_artifact USING btree (loan_id, type, period_start, period_end);


--
-- Name: idx_email_template_folders_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_template_folders_parent ON public.email_template_folders USING btree (parent_id);


--
-- Name: idx_email_templates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_active ON public.email_templates USING btree (is_active);


--
-- Name: idx_email_templates_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_folder ON public.email_templates USING btree (folder_id);


--
-- Name: idx_email_templates_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_key ON public.email_templates USING btree (template_key);


--
-- Name: idx_exc_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exc_state ON public.reconciliation_exceptions USING btree (state, opened_at);


--
-- Name: idx_exception_cases_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exception_cases_entity ON public.exception_cases USING btree (entity_type, entity_id);


--
-- Name: idx_exception_cases_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exception_cases_status ON public.exception_cases USING btree (status);


--
-- Name: idx_expect_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expect_state ON public.expected_settlements USING btree (state, initiated_at);


--
-- Name: idx_foreclosure_case_loan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foreclosure_case_loan ON public.foreclosure_case USING btree (loan_id);


--
-- Name: idx_inbox_consumer_message; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inbox_consumer_message ON public.inbox USING btree (consumer, message_id);


--
-- Name: idx_inbox_processed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbox_processed_at ON public.inbox USING btree (processed_at);


--
-- Name: idx_late_fee_assessment_loan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_late_fee_assessment_loan ON public.late_fee_assessment USING btree (loan_id, period_due_date);


--
-- Name: idx_ledger_entries_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_entries_correlation ON public.ledger_entries_legacy USING btree (correlation_id);


--
-- Name: idx_ledger_entries_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_entries_date ON public.ledger_entries_legacy USING btree (entry_date);


--
-- Name: idx_ledger_entries_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_entries_payment ON public.ledger_entries_legacy USING btree (payment_id);


--
-- Name: idx_ledger_entry_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_entry_account ON public.ledger_entry USING btree (account);


--
-- Name: idx_ledger_entry_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_entry_event ON public.ledger_entry USING btree (event_id);


--
-- Name: idx_ledger_entry_loan_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_entry_loan_date ON public.ledger_entry USING btree (loan_id, created_at);


--
-- Name: idx_ledger_event_correlation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_event_correlation_id ON public.ledger_event USING btree (correlation_id);


--
-- Name: idx_ledger_event_effective_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_event_effective_date ON public.ledger_event USING btree (effective_date);


--
-- Name: idx_ledger_event_loan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_event_loan_id ON public.ledger_event USING btree (loan_id);


--
-- Name: idx_loan_balances_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loan_balances_updated ON public.loan_balances USING btree (updated_at);


--
-- Name: idx_loan_terms_loan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loan_terms_loan_id ON public.loan_terms USING btree (loan_id);


--
-- Name: idx_login_attempts_attempted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_attempts_attempted_at ON public.login_attempts USING btree (attempted_at DESC);


--
-- Name: idx_login_attempts_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_attempts_ip ON public.login_attempts USING btree (ip);


--
-- Name: idx_login_attempts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_attempts_user_id ON public.login_attempts USING btree (user_id);


--
-- Name: idx_match_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_match_status ON public.reconciliation_matches USING btree (status, score DESC);


--
-- Name: idx_message_metrics_aggregate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_metrics_aggregate ON public.message_metrics USING btree (schema_name, consumer, processed_at);


--
-- Name: idx_notice_schedule_loan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notice_schedule_loan ON public.notice_schedule USING btree (loan_id, status);


--
-- Name: idx_notice_schedule_status_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notice_schedule_status_time ON public.notice_schedule USING btree (status, scheduled_for) WHERE (status = 'scheduled'::public.notice_status);


--
-- Name: idx_outbox_aggregate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_aggregate ON public.outbox USING btree (aggregate_type, aggregate_id);


--
-- Name: idx_outbox_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_created_at ON public.outbox USING btree (created_at);


--
-- Name: idx_outbox_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_events_created ON public.outbox_events USING btree (created_at);


--
-- Name: idx_outbox_events_unpublished; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_events_unpublished ON public.outbox_events USING btree (published_at) WHERE (published_at IS NULL);


--
-- Name: idx_outbox_messages_aggregate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_messages_aggregate ON public.outbox_messages USING btree (aggregate_type, aggregate_id);


--
-- Name: idx_outbox_messages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_messages_status ON public.outbox_messages USING btree (status);


--
-- Name: idx_outbox_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_retry ON public.outbox USING btree (published_at, next_retry_at);


--
-- Name: idx_outbox_unpublished; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_unpublished ON public.outbox USING btree (published_at) WHERE (published_at IS NULL);


--
-- Name: idx_password_reset_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_expires_at ON public.password_reset_tokens USING btree (expires_at) WHERE (used_at IS NULL);


--
-- Name: idx_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_payment_artifacts_ingestion_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_artifacts_ingestion_type ON public.payment_artifacts USING btree (ingestion_id, type);


--
-- Name: idx_payment_events_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_events_correlation ON public.payment_events USING btree (correlation_id);


--
-- Name: idx_payment_events_payment_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_events_payment_time ON public.payment_events USING btree (payment_id, event_time);


--
-- Name: idx_payment_ingestion_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_ingestion_type ON public.payment_ingestion USING btree (id, status);


--
-- Name: idx_payment_ingestions_channel_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_ingestions_channel_received ON public.payment_ingestions USING btree (channel, received_at);


--
-- Name: idx_payment_intake_gateway; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_intake_gateway ON public.payment_intake USING btree (source_provider, gateway_txn_id);


--
-- Name: idx_payment_intake_loan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_intake_loan_id ON public.payment_intake USING btree (loan_id);


--
-- Name: idx_payment_intake_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_intake_received_at ON public.payment_intake USING btree (received_at);


--
-- Name: idx_payment_ledger_loan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_ledger_loan ON public.payment_ledger USING btree (loan_id, effective_date);


--
-- Name: idx_payment_ledger_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_ledger_payment ON public.payment_ledger USING btree (payment_id);


--
-- Name: idx_payment_ledger_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_ledger_pending ON public.payment_ledger USING btree (pending) WHERE (pending = true);


--
-- Name: idx_payment_transitions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_transitions ON public.payment_state_transitions USING btree (payment_id, occurred_at);


--
-- Name: idx_payment_tx_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_tx_effective ON public.payment_transactions USING btree (effective_date);


--
-- Name: idx_payment_tx_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_tx_idempotency ON public.payment_transactions USING btree (idempotency_key);


--
-- Name: idx_payment_tx_loan_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_tx_loan_state ON public.payment_transactions USING btree (loan_id, state, received_at);


--
-- Name: idx_payment_tx_source_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_tx_source_ref ON public.payment_transactions USING btree (source, external_ref) WHERE (external_ref IS NOT NULL);


--
-- Name: idx_payments_effective_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_effective_date ON public.payments USING btree (effective_date);


--
-- Name: idx_payments_loan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_loan_id ON public.payments USING btree (loan_id);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_plan_header_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_plan_header_active ON public.plan_header USING btree (loan_id) WHERE (status = 'active'::public.plan_status);


--
-- Name: idx_plan_header_loan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_header_loan ON public.plan_header USING btree (loan_id, status);


--
-- Name: idx_recon_exception_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recon_exception_status ON public.recon_exception USING btree (status, created_at);


--
-- Name: idx_reconciliations_channel_period; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reconciliations_channel_period ON public.reconciliations USING btree (channel, period_start, period_end);


--
-- Name: idx_role_permissions_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_permissions_role_id ON public.role_permissions USING btree (role_id);


--
-- Name: idx_saga_states_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saga_states_active ON public.saga_states USING btree (saga_type, current_step) WHERE ((completed_at IS NULL) AND (failed_at IS NULL));


--
-- Name: idx_saga_step_history_saga; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saga_step_history_saga ON public.saga_step_history USING btree (saga_id, started_at);


--
-- Name: idx_schedule_plan_loan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_plan_loan_id ON public.schedule_plan USING btree (loan_id);


--
-- Name: idx_sessions_last_seen_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_last_seen_at ON public.sessions USING btree (last_seen_at DESC);


--
-- Name: idx_sessions_sid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sessions_sid ON public.sessions USING btree (sid);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- Name: idx_system_alerts_component; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_alerts_component ON public.system_alerts USING btree (component);


--
-- Name: idx_system_alerts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_alerts_created ON public.system_alerts USING btree (created_at DESC);


--
-- Name: idx_system_alerts_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_alerts_severity ON public.system_alerts USING btree (severity);


--
-- Name: idx_system_alerts_unacknowledged; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_alerts_unacknowledged ON public.system_alerts USING btree (acknowledged) WHERE (acknowledged = false);


--
-- Name: idx_user_ip_allowlist_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_ip_allowlist_expires_at ON public.user_ip_allowlist USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_user_ip_allowlist_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_ip_allowlist_user_id ON public.user_ip_allowlist USING btree (user_id) WHERE (is_active = true);


--
-- Name: idx_user_roles_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role_id ON public.user_roles USING btree (role_id);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status) WHERE (status <> 'disabled'::public.user_status);


--
-- Name: insurance_expiration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insurance_expiration_idx ON public.insurance_policies USING btree (expiration_date);


--
-- Name: insurance_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insurance_loan_idx ON public.insurance_policies USING btree (loan_id);


--
-- Name: insurance_policy_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insurance_policy_number_idx ON public.insurance_policies USING btree (policy_number);


--
-- Name: insurance_property_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insurance_property_idx ON public.insurance_policies USING btree (property_id);


--
-- Name: interest_accruals_loan_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interest_accruals_loan_id_idx ON public.interest_accruals USING btree (loan_id);


--
-- Name: investor_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_active_idx ON public.investors USING btree (is_active);


--
-- Name: investor_distributions_loan_investor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_distributions_loan_investor_idx ON public.investor_distributions USING btree (loan_id, investor_id);


--
-- Name: investor_distributions_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_distributions_run_id_idx ON public.investor_distributions USING btree (run_id);


--
-- Name: investor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX investor_id_idx ON public.investors USING btree (investor_id);


--
-- Name: investor_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investor_loan_idx ON public.investors USING btree (loan_id);


--
-- Name: legal_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX legal_case_idx ON public.legal_proceedings USING btree (case_number);


--
-- Name: legal_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX legal_loan_idx ON public.legal_proceedings USING btree (loan_id);


--
-- Name: legal_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX legal_type_idx ON public.legal_proceedings USING btree (proceeding_type);


--
-- Name: loan_borrower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX loan_borrower_idx ON public.loan_borrowers USING btree (loan_id, borrower_id);


--
-- Name: loan_borrowers_borrower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_borrowers_borrower_idx ON public.loan_borrowers USING btree (borrower_id);


--
-- Name: loan_borrowers_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_borrowers_loan_idx ON public.loan_borrowers USING btree (loan_id);


--
-- Name: loan_fee_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_fee_due_date_idx ON public.loan_fees USING btree (due_date);


--
-- Name: loan_fee_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_fee_loan_idx ON public.loan_fees USING btree (loan_id);


--
-- Name: loan_fee_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_fee_type_idx ON public.loan_fees USING btree (fee_type);


--
-- Name: loan_maturity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_maturity_idx ON public.loans USING btree (maturity_date);


--
-- Name: loan_next_payment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_next_payment_idx ON public.loans USING btree (next_payment_date);


--
-- Name: loan_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX loan_number_idx ON public.loans USING btree (loan_number);


--
-- Name: loan_property_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_property_idx ON public.loans USING btree (property_id);


--
-- Name: loan_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_status_idx ON public.loans USING btree (status);


--
-- Name: mfa_audit_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfa_audit_log_created_at_idx ON public.mfa_audit_log USING btree (created_at);


--
-- Name: mfa_audit_log_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfa_audit_log_event_type_idx ON public.mfa_audit_log USING btree (event_type);


--
-- Name: mfa_audit_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfa_audit_log_user_id_idx ON public.mfa_audit_log USING btree (user_id);


--
-- Name: mfa_backup_codes_code_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mfa_backup_codes_code_hash_idx ON public.mfa_backup_codes USING btree (code_hash);


--
-- Name: mfa_backup_codes_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfa_backup_codes_user_id_idx ON public.mfa_backup_codes USING btree (user_id);


--
-- Name: mfa_challenges_challenge_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mfa_challenges_challenge_id_idx ON public.mfa_challenges USING btree (challenge_id);


--
-- Name: mfa_challenges_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfa_challenges_expires_at_idx ON public.mfa_challenges USING btree (expires_at);


--
-- Name: mfa_challenges_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfa_challenges_status_idx ON public.mfa_challenges USING btree (status);


--
-- Name: mfa_challenges_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfa_challenges_user_id_idx ON public.mfa_challenges USING btree (user_id);


--
-- Name: notification_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_created_idx ON public.notifications USING btree (created_at);


--
-- Name: notification_is_read_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_is_read_idx ON public.notifications USING btree (is_read);


--
-- Name: notification_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_type_idx ON public.notifications USING btree (type);


--
-- Name: notification_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_user_idx ON public.notifications USING btree (user_id);


--
-- Name: payee_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payee_active_idx ON public.payees USING btree (is_active);


--
-- Name: payee_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payee_name_idx ON public.payees USING btree (name);


--
-- Name: payee_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payee_type_idx ON public.payees USING btree (payee_type);


--
-- Name: payments_inbox_loan_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_inbox_loan_id_idx ON public.payments_inbox USING btree (loan_id);


--
-- Name: payments_inbox_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_inbox_status_idx ON public.payments_inbox USING btree (status);


--
-- Name: payments_inbox_value_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_inbox_value_date_idx ON public.payments_inbox USING btree (value_date);


--
-- Name: property_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX property_address_idx ON public.properties USING btree (address, city, state);


--
-- Name: property_apn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX property_apn_idx ON public.properties USING btree (apn);


--
-- Name: property_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX property_type_idx ON public.properties USING btree (property_type);


--
-- Name: schedule_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_due_date_idx ON public.payment_schedule USING btree (due_date);


--
-- Name: schedule_loan_payment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX schedule_loan_payment_idx ON public.payment_schedule USING btree (loan_id, payment_number);


--
-- Name: servicing_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX servicing_active_idx ON public.servicing_instructions USING btree (is_active);


--
-- Name: servicing_events_loan_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX servicing_events_loan_id_idx ON public.servicing_events USING btree (loan_id);


--
-- Name: servicing_events_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX servicing_events_run_id_idx ON public.servicing_events USING btree (run_id);


--
-- Name: servicing_events_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX servicing_events_type_idx ON public.servicing_events USING btree (event_type);


--
-- Name: servicing_exceptions_loan_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX servicing_exceptions_loan_id_idx ON public.servicing_exceptions USING btree (loan_id);


--
-- Name: servicing_exceptions_severity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX servicing_exceptions_severity_idx ON public.servicing_exceptions USING btree (severity);


--
-- Name: servicing_exceptions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX servicing_exceptions_status_idx ON public.servicing_exceptions USING btree (status);


--
-- Name: servicing_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX servicing_loan_idx ON public.servicing_instructions USING btree (loan_id);


--
-- Name: servicing_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX servicing_type_idx ON public.servicing_instructions USING btree (instruction_type);


--
-- Name: settings_category_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX settings_category_key_idx ON public.system_settings USING btree (category, key);


--
-- Name: task_assigned_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_assigned_to_idx ON public.tasks USING btree (assigned_to);


--
-- Name: task_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_due_date_idx ON public.tasks USING btree (due_date);


--
-- Name: task_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_loan_idx ON public.tasks USING btree (loan_id);


--
-- Name: task_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_status_idx ON public.tasks USING btree (status);


--
-- Name: unique_accrual; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_accrual ON public.interest_accruals USING btree (loan_id, accrual_date);


--
-- Name: unique_event_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_event_key ON public.servicing_events USING btree (valuation_date, event_key);


--
-- Name: user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_active_idx ON public.users USING btree (is_active);


--
-- Name: user_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_email_idx ON public.users USING btree (email);


--
-- Name: user_mfa_factors_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_mfa_factors_active_idx ON public.user_mfa_factors USING btree (is_active);


--
-- Name: user_mfa_factors_factor_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_mfa_factors_factor_type_idx ON public.user_mfa_factors USING btree (factor_type);


--
-- Name: user_mfa_factors_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_mfa_factors_user_id_idx ON public.user_mfa_factors USING btree (user_id);


--
-- Name: ledger_entry ledger_entry_forbid_after_finalize; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ledger_entry_forbid_after_finalize BEFORE INSERT ON public.ledger_entry FOR EACH ROW EXECUTE FUNCTION public.trg_forbid_after_finalize();


--
-- Name: roles update_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_ip_allowlist update_user_ip_allowlist_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_ip_allowlist_updated_at BEFORE UPDATE ON public.user_ip_allowlist FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ach_batch ach_batch_bank_acct_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_batch
    ADD CONSTRAINT ach_batch_bank_acct_id_fkey FOREIGN KEY (bank_acct_id) REFERENCES public.bank_account(bank_acct_id);


--
-- Name: ach_entry ach_entry_ach_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_entry
    ADD CONSTRAINT ach_entry_ach_batch_id_fkey FOREIGN KEY (ach_batch_id) REFERENCES public.ach_batch(ach_batch_id) ON DELETE CASCADE;


--
-- Name: ach_entry ach_entry_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_entry
    ADD CONSTRAINT ach_entry_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: ach_return ach_return_ach_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_return
    ADD CONSTRAINT ach_return_ach_entry_id_fkey FOREIGN KEY (ach_entry_id) REFERENCES public.ach_entry(ach_entry_id);


--
-- Name: ach_return_windows ach_return_windows_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ach_return_windows
    ADD CONSTRAINT ach_return_windows_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payment_transactions(payment_id);


--
-- Name: audit_logs audit_logs_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: audit_logs audit_logs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: auth_events auth_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_events
    ADD CONSTRAINT auth_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id);


--
-- Name: auth_events auth_events_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_events
    ADD CONSTRAINT auth_events_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id);


--
-- Name: bank_statement_file bank_statement_file_bank_acct_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_file
    ADD CONSTRAINT bank_statement_file_bank_acct_id_fkey FOREIGN KEY (bank_acct_id) REFERENCES public.bank_account(bank_acct_id);


--
-- Name: bank_transactions bank_transactions_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.bank_files(file_id);


--
-- Name: bank_txn bank_txn_bank_acct_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_txn
    ADD CONSTRAINT bank_txn_bank_acct_id_fkey FOREIGN KEY (bank_acct_id) REFERENCES public.bank_account(bank_acct_id);


--
-- Name: bank_txn bank_txn_stmt_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_txn
    ADD CONSTRAINT bank_txn_stmt_file_id_fkey FOREIGN KEY (stmt_file_id) REFERENCES public.bank_statement_file(stmt_file_id) ON DELETE CASCADE;


--
-- Name: cash_match_candidate cash_match_candidate_bank_txn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_match_candidate
    ADD CONSTRAINT cash_match_candidate_bank_txn_id_fkey FOREIGN KEY (bank_txn_id) REFERENCES public.bank_txn(bank_txn_id) ON DELETE CASCADE;


--
-- Name: collection_activities collection_activities_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_activities
    ADD CONSTRAINT collection_activities_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: collection_activities collection_activities_performed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_activities
    ADD CONSTRAINT collection_activities_performed_by_users_id_fk FOREIGN KEY (performed_by) REFERENCES public.users(id);


--
-- Name: collection_case collection_case_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_case
    ADD CONSTRAINT collection_case_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: crm_activity crm_activity_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activity
    ADD CONSTRAINT crm_activity_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: crm_activity crm_activity_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activity
    ADD CONSTRAINT crm_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: crm_appointments crm_appointments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_appointments
    ADD CONSTRAINT crm_appointments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: crm_appointments crm_appointments_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_appointments
    ADD CONSTRAINT crm_appointments_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: crm_calls crm_calls_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_calls
    ADD CONSTRAINT crm_calls_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: crm_calls crm_calls_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_calls
    ADD CONSTRAINT crm_calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: crm_collaborators crm_collaborators_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_collaborators
    ADD CONSTRAINT crm_collaborators_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id);


--
-- Name: crm_collaborators crm_collaborators_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_collaborators
    ADD CONSTRAINT crm_collaborators_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: crm_collaborators crm_collaborators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_collaborators
    ADD CONSTRAINT crm_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: crm_deals crm_deals_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: crm_deals crm_deals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: crm_deals crm_deals_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: crm_notes crm_notes_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_notes
    ADD CONSTRAINT crm_notes_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: crm_notes crm_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_notes
    ADD CONSTRAINT crm_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: crm_tasks crm_tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: crm_tasks crm_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: crm_tasks crm_tasks_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: delinquency_current delinquency_current_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delinquency_current
    ADD CONSTRAINT delinquency_current_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: delinquency_snapshot delinquency_snapshot_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delinquency_snapshot
    ADD CONSTRAINT delinquency_snapshot_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: document_artifact document_artifact_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_artifact
    ADD CONSTRAINT document_artifact_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE SET NULL;


--
-- Name: document_artifact document_artifact_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_artifact
    ADD CONSTRAINT document_artifact_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.document_template(template_id);


--
-- Name: document_templates document_templates_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: documents documents_archived_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_archived_by_users_id_fk FOREIGN KEY (archived_by) REFERENCES public.users(id);


--
-- Name: documents documents_borrower_id_borrower_entities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_borrower_id_borrower_entities_id_fk FOREIGN KEY (borrower_id) REFERENCES public.borrower_entities(id);


--
-- Name: documents documents_last_accessed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_last_accessed_by_users_id_fk FOREIGN KEY (last_accessed_by) REFERENCES public.users(id);


--
-- Name: documents documents_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: documents documents_parent_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_parent_document_id_documents_id_fk FOREIGN KEY (parent_document_id) REFERENCES public.documents(id);


--
-- Name: documents documents_property_id_properties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: documents documents_uploaded_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_users_id_fk FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: email_template_folders email_template_folders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_template_folders
    ADD CONSTRAINT email_template_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: email_template_folders email_template_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_template_folders
    ADD CONSTRAINT email_template_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.email_template_folders(id) ON DELETE CASCADE;


--
-- Name: email_templates email_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: email_templates email_templates_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.email_template_folders(id) ON DELETE SET NULL;


--
-- Name: escrow_accounts escrow_accounts_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_accounts
    ADD CONSTRAINT escrow_accounts_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: escrow_accounts escrow_accounts_waived_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_accounts
    ADD CONSTRAINT escrow_accounts_waived_by_users_id_fk FOREIGN KEY (waived_by) REFERENCES public.users(id);


--
-- Name: escrow_advances escrow_advances_escrow_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_advances
    ADD CONSTRAINT escrow_advances_escrow_account_id_fkey FOREIGN KEY (escrow_account_id) REFERENCES public.escrow_accounts(id);


--
-- Name: escrow_advances escrow_advances_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_advances
    ADD CONSTRAINT escrow_advances_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: escrow_advances escrow_advances_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_advances
    ADD CONSTRAINT escrow_advances_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.servicing_runs(run_id);


--
-- Name: escrow_analysis_item escrow_analysis_item_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_analysis_item
    ADD CONSTRAINT escrow_analysis_item_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.escrow_analysis(analysis_id) ON DELETE CASCADE;


--
-- Name: escrow_analysis_item escrow_analysis_item_escrow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_analysis_item
    ADD CONSTRAINT escrow_analysis_item_escrow_id_fkey FOREIGN KEY (escrow_id) REFERENCES public.escrow_items(id) ON DELETE CASCADE;


--
-- Name: escrow_analysis escrow_analysis_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_analysis
    ADD CONSTRAINT escrow_analysis_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: escrow_disbursement escrow_disbursement_escrow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursement
    ADD CONSTRAINT escrow_disbursement_escrow_id_fkey FOREIGN KEY (escrow_id) REFERENCES public.escrow_disbursements(id);


--
-- Name: escrow_disbursement escrow_disbursement_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursement
    ADD CONSTRAINT escrow_disbursement_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: escrow_disbursement_payments escrow_disbursement_payments_disbursement_id_escrow_disbursemen; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursement_payments
    ADD CONSTRAINT escrow_disbursement_payments_disbursement_id_escrow_disbursemen FOREIGN KEY (disbursement_id) REFERENCES public.escrow_disbursements(id);


--
-- Name: escrow_disbursement_payments escrow_disbursement_payments_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursement_payments
    ADD CONSTRAINT escrow_disbursement_payments_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: escrow_disbursement_payments escrow_disbursement_payments_processed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursement_payments
    ADD CONSTRAINT escrow_disbursement_payments_processed_by_users_id_fk FOREIGN KEY (processed_by) REFERENCES public.users(id);


--
-- Name: escrow_disbursements escrow_disbursements_escrow_account_id_escrow_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursements
    ADD CONSTRAINT escrow_disbursements_escrow_account_id_escrow_accounts_id_fk FOREIGN KEY (escrow_account_id) REFERENCES public.escrow_accounts(id);


--
-- Name: escrow_disbursements escrow_disbursements_insurance_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursements
    ADD CONSTRAINT escrow_disbursements_insurance_document_id_fkey FOREIGN KEY (insurance_document_id) REFERENCES public.documents(id);


--
-- Name: escrow_disbursements escrow_disbursements_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_disbursements
    ADD CONSTRAINT escrow_disbursements_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: escrow_forecast escrow_forecast_escrow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_forecast
    ADD CONSTRAINT escrow_forecast_escrow_id_fkey FOREIGN KEY (escrow_id) REFERENCES public.escrow_disbursements(id);


--
-- Name: escrow_forecast escrow_forecast_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_forecast
    ADD CONSTRAINT escrow_forecast_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: escrow_items escrow_items_escrow_account_id_escrow_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_items
    ADD CONSTRAINT escrow_items_escrow_account_id_escrow_accounts_id_fk FOREIGN KEY (escrow_account_id) REFERENCES public.escrow_accounts(id);


--
-- Name: escrow_items escrow_items_payee_id_payees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_items
    ADD CONSTRAINT escrow_items_payee_id_payees_id_fk FOREIGN KEY (payee_id) REFERENCES public.payees(id);


--
-- Name: escrow_policy escrow_policy_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_policy
    ADD CONSTRAINT escrow_policy_product_code_fkey FOREIGN KEY (product_code) REFERENCES public.product_policy(product_code);


--
-- Name: escrow_statement escrow_statement_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_statement
    ADD CONSTRAINT escrow_statement_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.escrow_analysis(analysis_id) ON DELETE CASCADE;


--
-- Name: escrow_transactions escrow_transactions_approved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: escrow_transactions escrow_transactions_escrow_account_id_escrow_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_escrow_account_id_escrow_accounts_id_fk FOREIGN KEY (escrow_account_id) REFERENCES public.escrow_accounts(id);


--
-- Name: escrow_transactions escrow_transactions_escrow_item_id_escrow_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_escrow_item_id_escrow_items_id_fk FOREIGN KEY (escrow_item_id) REFERENCES public.escrow_items(id);


--
-- Name: escrow_transactions escrow_transactions_payee_id_payees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_payee_id_payees_id_fk FOREIGN KEY (payee_id) REFERENCES public.payees(id);


--
-- Name: escrow_transactions escrow_transactions_processed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_processed_by_users_id_fk FOREIGN KEY (processed_by) REFERENCES public.users(id);


--
-- Name: exception_cases exception_cases_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_cases
    ADD CONSTRAINT exception_cases_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: fee_policy fee_policy_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_policy
    ADD CONSTRAINT fee_policy_product_code_fkey FOREIGN KEY (product_code) REFERENCES public.product_policy(product_code);


--
-- Name: fee_templates fee_templates_lender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_templates
    ADD CONSTRAINT fee_templates_lender_id_fkey FOREIGN KEY (lender_id) REFERENCES public.users(id);


--
-- Name: payment_distributions fk_distrib_payment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_distributions
    ADD CONSTRAINT fk_distrib_payment FOREIGN KEY (payment_id) REFERENCES public.payment_transactions(payment_id);


--
-- Name: escrow_ledger fk_escrow_ledger_payment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_ledger
    ADD CONSTRAINT fk_escrow_ledger_payment FOREIGN KEY (payment_id) REFERENCES public.payment_transactions(payment_id);


--
-- Name: investor_positions fk_ip_version; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_positions
    ADD CONSTRAINT fk_ip_version FOREIGN KEY (version_id) REFERENCES public.investor_position_versions(version_id) ON DELETE CASCADE;


--
-- Name: payment_ledger fk_ledger_account; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_ledger
    ADD CONSTRAINT fk_ledger_account FOREIGN KEY (account) REFERENCES public.accounts_chart(account);


--
-- Name: payment_ledger fk_ledger_payment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_ledger
    ADD CONSTRAINT fk_ledger_payment FOREIGN KEY (payment_id) REFERENCES public.payment_transactions(payment_id);


--
-- Name: payment_ledger fk_ledger_reversal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_ledger
    ADD CONSTRAINT fk_ledger_reversal FOREIGN KEY (reversal_of) REFERENCES public.payment_ledger(ledger_id);


--
-- Name: payment_transactions fk_payment_tx_currency; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT fk_payment_tx_currency FOREIGN KEY (currency) REFERENCES public.currency_codes(code);


--
-- Name: foreclosure_case foreclosure_case_attorney_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foreclosure_case
    ADD CONSTRAINT foreclosure_case_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.attorney(attorney_id);


--
-- Name: foreclosure_case foreclosure_case_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foreclosure_case
    ADD CONSTRAINT foreclosure_case_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: foreclosure_event foreclosure_event_fc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foreclosure_event
    ADD CONSTRAINT foreclosure_event_fc_id_fkey FOREIGN KEY (fc_id) REFERENCES public.foreclosure_case(fc_id) ON DELETE CASCADE;


--
-- Name: guarantors guarantors_guarantor_entity_id_borrower_entities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guarantors
    ADD CONSTRAINT guarantors_guarantor_entity_id_borrower_entities_id_fk FOREIGN KEY (guarantor_entity_id) REFERENCES public.borrower_entities(id);


--
-- Name: guarantors guarantors_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guarantors
    ADD CONSTRAINT guarantors_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: insurance_policies insurance_policies_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: insurance_policies insurance_policies_property_id_properties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: interest_accruals interest_accruals_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_accruals
    ADD CONSTRAINT interest_accruals_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: interest_accruals interest_accruals_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_accruals
    ADD CONSTRAINT interest_accruals_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.servicing_runs(run_id);


--
-- Name: investor_contract investor_contract_custodial_bank_acct_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_contract
    ADD CONSTRAINT investor_contract_custodial_bank_acct_id_fkey FOREIGN KEY (custodial_bank_acct_id) REFERENCES public.bank_account(bank_acct_id);


--
-- Name: investor_contract investor_contract_investor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_contract
    ADD CONSTRAINT investor_contract_investor_id_fkey FOREIGN KEY (investor_id) REFERENCES public.investors(investor_id);


--
-- Name: investor_contract investor_contract_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_contract
    ADD CONSTRAINT investor_contract_product_code_fkey FOREIGN KEY (product_code) REFERENCES public.product_policy(product_code);


--
-- Name: investor_distributions investor_distributions_investor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_distributions
    ADD CONSTRAINT investor_distributions_investor_id_fkey FOREIGN KEY (investor_id) REFERENCES public.investors(id);


--
-- Name: investor_distributions investor_distributions_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_distributions
    ADD CONSTRAINT investor_distributions_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: investor_distributions investor_distributions_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_distributions
    ADD CONSTRAINT investor_distributions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.servicing_runs(run_id);


--
-- Name: investor_waterfall_rule investor_waterfall_rule_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_waterfall_rule
    ADD CONSTRAINT investor_waterfall_rule_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.investor_contract(contract_id) ON DELETE CASCADE;


--
-- Name: investors investors_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investors
    ADD CONSTRAINT investors_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: late_fee_assessment late_fee_assessment_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.late_fee_assessment
    ADD CONSTRAINT late_fee_assessment_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: late_fee_assessment late_fee_assessment_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.late_fee_assessment
    ADD CONSTRAINT late_fee_assessment_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.fee_templates(id);


--
-- Name: ledger_entries_legacy ledger_entries_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries_legacy
    ADD CONSTRAINT ledger_entries_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: ledger_entry ledger_entry_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entry
    ADD CONSTRAINT ledger_entry_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.ledger_event(event_id) ON DELETE CASCADE;


--
-- Name: ledger_entry ledger_entry_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entry
    ADD CONSTRAINT ledger_entry_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: ledger_event ledger_event_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_event
    ADD CONSTRAINT ledger_event_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: legal_proceedings legal_proceedings_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_proceedings
    ADD CONSTRAINT legal_proceedings_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: loan_accounting_config loan_accounting_config_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_accounting_config
    ADD CONSTRAINT loan_accounting_config_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: loan_accounting_config loan_accounting_config_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_accounting_config
    ADD CONSTRAINT loan_accounting_config_product_code_fkey FOREIGN KEY (product_code) REFERENCES public.product_policy(product_code);


--
-- Name: loan_balances loan_balances_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_balances
    ADD CONSTRAINT loan_balances_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: loan_borrowers loan_borrowers_borrower_id_borrower_entities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_borrowers
    ADD CONSTRAINT loan_borrowers_borrower_id_borrower_entities_id_fk FOREIGN KEY (borrower_id) REFERENCES public.borrower_entities(id);


--
-- Name: loan_borrowers loan_borrowers_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_borrowers
    ADD CONSTRAINT loan_borrowers_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: loan_fees loan_fees_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_fees
    ADD CONSTRAINT loan_fees_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: loan_fees loan_fees_waived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_fees
    ADD CONSTRAINT loan_fees_waived_by_fkey FOREIGN KEY (waived_by) REFERENCES public.users(id);


--
-- Name: loan_ledger loan_ledger_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_ledger
    ADD CONSTRAINT loan_ledger_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: loan_ledger loan_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_ledger
    ADD CONSTRAINT loan_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: loan_ledger loan_ledger_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_ledger
    ADD CONSTRAINT loan_ledger_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: loan_ledger loan_ledger_reversal_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_ledger
    ADD CONSTRAINT loan_ledger_reversal_of_fkey FOREIGN KEY (reversal_of) REFERENCES public.loan_ledger(id);


--
-- Name: loan_ledger loan_ledger_reversed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_ledger
    ADD CONSTRAINT loan_ledger_reversed_by_fkey FOREIGN KEY (reversed_by) REFERENCES public.loan_ledger(id);


--
-- Name: loan_terms loan_terms_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_terms
    ADD CONSTRAINT loan_terms_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: loans loans_investor_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_investor_id_users_id_fk FOREIGN KEY (investor_id) REFERENCES public.users(id);


--
-- Name: loans loans_lender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_lender_id_users_id_fk FOREIGN KEY (lender_id) REFERENCES public.users(id);


--
-- Name: loans loans_property_id_properties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: loans loans_servicer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_servicer_id_users_id_fk FOREIGN KEY (servicer_id) REFERENCES public.users(id);


--
-- Name: login_attempts login_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: mfa_audit_log mfa_audit_log_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_audit_log
    ADD CONSTRAINT mfa_audit_log_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.mfa_challenges(challenge_id);


--
-- Name: mfa_audit_log mfa_audit_log_factor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_audit_log
    ADD CONSTRAINT mfa_audit_log_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES public.user_mfa_factors(id);


--
-- Name: mfa_audit_log mfa_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_audit_log
    ADD CONSTRAINT mfa_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: mfa_backup_codes mfa_backup_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_backup_codes
    ADD CONSTRAINT mfa_backup_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_factor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_challenges
    ADD CONSTRAINT mfa_challenges_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES public.user_mfa_factors(id);


--
-- Name: mfa_challenges mfa_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_challenges
    ADD CONSTRAINT mfa_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: notice_schedule notice_schedule_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notice_schedule
    ADD CONSTRAINT notice_schedule_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: notice_schedule notice_schedule_notice_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notice_schedule
    ADD CONSTRAINT notice_schedule_notice_template_id_fkey FOREIGN KEY (notice_template_id) REFERENCES public.notice_template_v2(notice_template_id);


--
-- Name: notice_schedule notice_schedule_sent_doc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notice_schedule
    ADD CONSTRAINT notice_schedule_sent_doc_id_fkey FOREIGN KEY (sent_doc_id) REFERENCES public.document_artifact(doc_id);


--
-- Name: notifications notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_artifacts payment_artifacts_ingestion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_artifacts
    ADD CONSTRAINT payment_artifacts_ingestion_id_fkey FOREIGN KEY (ingestion_id) REFERENCES public.payment_ingestions(id) ON DELETE CASCADE;


--
-- Name: payment_events payment_events_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: payment_intake payment_intake_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_intake
    ADD CONSTRAINT payment_intake_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: payment_intake payment_intake_source_provider_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_intake
    ADD CONSTRAINT payment_intake_source_provider_fkey FOREIGN KEY (source_provider) REFERENCES public.gateway_provider(provider_code);


--
-- Name: payment_posting payment_posting_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_posting
    ADD CONSTRAINT payment_posting_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.ledger_event(event_id) ON DELETE RESTRICT;


--
-- Name: payment_posting payment_posting_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_posting
    ADD CONSTRAINT payment_posting_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payment_intake(payment_id) ON DELETE CASCADE;


--
-- Name: payment_schedule payment_schedule_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_schedule
    ADD CONSTRAINT payment_schedule_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: payment_state_transitions payment_state_transitions_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_state_transitions
    ADD CONSTRAINT payment_state_transitions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payment_transactions(payment_id);


--
-- Name: payment_validation payment_validation_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_validation
    ADD CONSTRAINT payment_validation_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payment_intake(payment_id) ON DELETE CASCADE;


--
-- Name: payments payments_applied_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES public.users(id);


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payments_inbox payments_inbox_borrower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments_inbox
    ADD CONSTRAINT payments_inbox_borrower_id_fkey FOREIGN KEY (borrower_id) REFERENCES public.borrower_entities(id);


--
-- Name: payments_inbox payments_inbox_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments_inbox
    ADD CONSTRAINT payments_inbox_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: payments_inbox payments_inbox_processed_by_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments_inbox
    ADD CONSTRAINT payments_inbox_processed_by_run_id_fkey FOREIGN KEY (processed_by_run_id) REFERENCES public.servicing_runs(run_id);


--
-- Name: payments payments_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: payments payments_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.payment_schedule(id);


--
-- Name: payments payments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: plan_header plan_header_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_header
    ADD CONSTRAINT plan_header_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: plan_progress plan_progress_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_progress
    ADD CONSTRAINT plan_progress_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plan_header(plan_id) ON DELETE CASCADE;


--
-- Name: plan_schedule plan_schedule_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_schedule
    ADD CONSTRAINT plan_schedule_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plan_header(plan_id) ON DELETE CASCADE;


--
-- Name: recon_exception recon_exception_bank_txn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recon_exception
    ADD CONSTRAINT recon_exception_bank_txn_id_fkey FOREIGN KEY (bank_txn_id) REFERENCES public.bank_txn(bank_txn_id) ON DELETE CASCADE;


--
-- Name: reconciliation_exceptions reconciliation_exceptions_expect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_exceptions
    ADD CONSTRAINT reconciliation_exceptions_expect_id_fkey FOREIGN KEY (expect_id) REFERENCES public.expected_settlements(expect_id);


--
-- Name: reconciliation_exceptions reconciliation_exceptions_ext_tx_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_exceptions
    ADD CONSTRAINT reconciliation_exceptions_ext_tx_id_fkey FOREIGN KEY (ext_tx_id) REFERENCES public.bank_transactions(ext_tx_id);


--
-- Name: reconciliation_matches reconciliation_matches_expect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_matches
    ADD CONSTRAINT reconciliation_matches_expect_id_fkey FOREIGN KEY (expect_id) REFERENCES public.expected_settlements(expect_id);


--
-- Name: reconciliation_matches reconciliation_matches_ext_tx_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_matches
    ADD CONSTRAINT reconciliation_matches_ext_tx_id_fkey FOREIGN KEY (ext_tx_id) REFERENCES public.bank_transactions(ext_tx_id);


--
-- Name: remittance_cycle remittance_cycle_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittance_cycle
    ADD CONSTRAINT remittance_cycle_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.investor_contract(contract_id) ON DELETE CASCADE;


--
-- Name: remittance_export remittance_export_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittance_export
    ADD CONSTRAINT remittance_export_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.remittance_cycle(cycle_id) ON DELETE CASCADE;


--
-- Name: remittance_item remittance_item_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittance_item
    ADD CONSTRAINT remittance_item_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.remittance_cycle(cycle_id) ON DELETE CASCADE;


--
-- Name: remittance_item remittance_item_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittance_item
    ADD CONSTRAINT remittance_item_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: saga_step_history saga_step_history_saga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saga_step_history
    ADD CONSTRAINT saga_step_history_saga_id_fkey FOREIGN KEY (saga_id) REFERENCES public.saga_states(saga_id) ON DELETE CASCADE;


--
-- Name: schedule_plan schedule_plan_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_plan
    ADD CONSTRAINT schedule_plan_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: schedule_plan schedule_plan_terms_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_plan
    ADD CONSTRAINT schedule_plan_terms_id_fkey FOREIGN KEY (terms_id) REFERENCES public.loan_terms(terms_id) ON DELETE CASCADE;


--
-- Name: schedule_row schedule_row_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_row
    ADD CONSTRAINT schedule_row_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.schedule_plan(plan_id) ON DELETE CASCADE;


--
-- Name: servicing_events servicing_events_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_events
    ADD CONSTRAINT servicing_events_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: servicing_events servicing_events_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_events
    ADD CONSTRAINT servicing_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.servicing_runs(run_id);


--
-- Name: servicing_exceptions servicing_exceptions_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_exceptions
    ADD CONSTRAINT servicing_exceptions_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: servicing_exceptions servicing_exceptions_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_exceptions
    ADD CONSTRAINT servicing_exceptions_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id);


--
-- Name: servicing_exceptions servicing_exceptions_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_exceptions
    ADD CONSTRAINT servicing_exceptions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.servicing_runs(run_id);


--
-- Name: servicing_instructions servicing_instructions_approved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_instructions
    ADD CONSTRAINT servicing_instructions_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: servicing_instructions servicing_instructions_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_instructions
    ADD CONSTRAINT servicing_instructions_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: servicing_instructions servicing_instructions_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_instructions
    ADD CONSTRAINT servicing_instructions_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: servicing_runs servicing_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicing_runs
    ADD CONSTRAINT servicing_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: tasks tasks_assigned_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_by_users_id_fk FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: tasks tasks_assigned_to_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_users_id_fk FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: tasks tasks_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id);


--
-- Name: user_ip_allowlist user_ip_allowlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ip_allowlist
    ADD CONSTRAINT user_ip_allowlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_mfa_factors user_mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_mfa_factors
    ADD CONSTRAINT user_mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

