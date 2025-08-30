/**
 * Payment processing types - Phase 2
 */

export type UUID = string;
export type Minor = bigint;

export type PaymentMethod = 'ach'|'card'|'wire'|'check'|'cash'|'other';

export interface PaymentReceived {
  payment_id: UUID;
  loan_id: number;  // Changed from UUID to match our schema
  method: PaymentMethod;
  amount_minor: Minor;
  currency: 'USD';
  received_at: string;       // ISO datetime
  gateway_txn_id: string;
  source: string;            // provider code
  idempotency_key: string;   // 64 hex chars
  effective_date: string;    // ISO date
}

export interface PaymentValidated {
  payment_id: UUID;
  loan_id: number;  // Changed from UUID to match our schema
  amount_minor: Minor;
  currency: 'USD';
  effective_date: string;
  allocation_hints: Record<string, unknown>;
}

export interface Allocation { 
  bucket: 'fees_due'|'interest_past_due'|'interest_current'|'principal'|'escrow'|'future'; 
  amount_minor: Minor; 
}

export interface PaymentPosted {
  payment_id: UUID;
  loan_id: number;  // Changed from UUID to match our schema
  event_id: UUID;
  effective_date: string;
  applied: Allocation[];
  new_balances: {
    principal_minor: Minor;
    interest_receivable_minor: Minor;
    escrow_liability_minor: Minor;
    fees_receivable_minor: Minor;
    cash_minor: Minor;
  };
}

export interface PaymentFailed {
  payment_id: UUID;
  loan_id: number;  // Changed from UUID to match our schema
  reason: string;
  retry_after?: number; // seconds
}

// Message envelope from Phase 0
export interface MessageEnvelope<T> {
  headers: {
    'x-message-id': string;
    'x-correlation-id': string;
    'x-schema': string;
    'x-trace-id': string;
    'x-timestamp'?: string;
  };
  payload: T;
}

// Enhanced ACH payment types with PII masking (Phase 2)
export interface SecureACHPaymentData {
  payment_id: string;
  loan_id: number;
  source: 'ach';
  amount_cents: number;
  currency: 'USD';
  account_number_masked: string;
  routing_number_masked: string;
  account_type: 'checking' | 'savings';
  sec_code: 'PPD' | 'CCD' | 'WEB' | 'TEL';
  trace_number?: string;
  external_ref?: string;
  processor_ref?: string;
}

// Payment redaction utility functions
export function redactPayment(data: any): any {
  const redacted = { ...data };
  
  if (data.account_number) {
    redacted.account_number_masked = maskAccountNumber(data.account_number);
    delete redacted.account_number;
  }
  
  if (data.routing_number) {
    redacted.routing_number_masked = maskRoutingNumber(data.routing_number);
    delete redacted.routing_number;
  }
  
  if (data.trace_number === undefined) {
    redacted.trace_number = generateTraceNumber();
  }
  
  return redacted;
}

export function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length < 4) return accountNumber;
  const visibleDigits = accountNumber.slice(-4);
  const maskedLength = Math.max(4, accountNumber.length - 4);
  return '*'.repeat(maskedLength) + visibleDigits;
}

export function maskRoutingNumber(routingNumber: string): string {
  if (routingNumber.length !== 9) return routingNumber;
  return '*****' + routingNumber.slice(-4);
}

export function generateTraceNumber(): string {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 6);
  return `ACH${timestamp}${random}`.toUpperCase();
}