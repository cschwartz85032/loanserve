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