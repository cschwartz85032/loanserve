/**
 * Phase 4: Document Types
 */

export type Minor = bigint;
export type DocumentType = 'billing_statement' | 'escrow_analysis' | 'year_end_1098' | 'notice';

export interface BillingStatementPayload {
  loan_id: number;
  borrower: { name: string; mailing_address: string };
  statement_period: { start: string; end: string; due_date: string };
  previous_balance_minor: Minor;
  transactions: Array<{
    posted_at: string; 
    description: string;
    debit_minor?: Minor; 
    credit_minor?: Minor;
  }>;
  escrow_monthly_target_minor: Minor;
  total_due_minor: Minor;
  past_due_minor: Minor;
  late_fee_policy: { 
    grace_days: number; 
    amount_minor?: Minor; 
    percent_bps?: number;
  };
  messages?: string[];
}

export interface EscrowAnalysisDocPayload {
  loan_id: number;
  analysis_id: string;
  period_start: string; 
  period_end: string;
  annual_expected_minor: Minor;
  cushion_target_minor: Minor;
  current_balance_minor: Minor;
  shortage_minor: Minor;
  deficiency_minor: Minor;
  surplus_minor: Minor;
  new_monthly_target_minor: Minor;
  deficiency_recovery_monthly_minor: Minor;
  items: Array<{ 
    due_date: string; 
    type: string; 
    payee: string; 
    amount_minor: Minor;
  }>;
}

export interface YearEnd1098Payload {
  loan_id: number;
  tax_year: number;
  borrower: { 
    name: string; 
    mailing_address: string; 
    tin_last4?: string;
  };
  lender: { 
    name: string; 
    address: string; 
    tin_last4?: string;
  };
  interest_received_minor: Minor;
  mortgage_insurance_premiums_minor?: Minor;
  points_paid_minor?: Minor;
  property_address: string;
  account_number: string;
}

export interface NoticePayload {
  loan_id: number;
  notice_type: string;
  borrower: { 
    name: string; 
    mailing_address: string;
  };
  amount_due_minor?: Minor;
  days_late?: number;
  grace_period_end?: string;
  property_address: string;
  custom_fields?: Record<string, any>;
}

export interface RenderRequest<T> {
  type: DocumentType;
  template_id: string;
  payload: T;
}

export interface DocumentTemplate {
  template_id: string;
  type: DocumentType;
  jurisdiction?: string;
  version: number;
  engine: string;
  html_source: string;
  css_source: string;
  font_family: string;
  retired_at?: Date;
  created_at: Date;
}

export interface DocumentArtifact {
  doc_id: string;
  type: DocumentType;
  loan_id?: number;
  related_id?: string;
  period_start?: string;
  period_end?: string;
  tax_year?: number;
  template_id: string;
  payload_json: any;
  inputs_hash: string;
  pdf_hash: string;
  pdf_bytes: Buffer;
  size_bytes: number;
  created_at: Date;
  event_id?: string;
}

export interface NoticeSchedule {
  notice_id: string;
  loan_id: number;
  notice_template_id: string;
  trigger_code: string;
  params: Record<string, any>;
  scheduled_for: Date;
  status: 'scheduled' | 'sent' | 'canceled';
  sent_doc_id?: string;
  created_at: Date;
}