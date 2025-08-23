/**
 * Enhanced Payment Message Envelope
 * Production-ready schema with full traceability
 */

export interface PaymentEnvelope<T = any> {
  // Core identification
  schema: string;                  // e.g. "loanserve.payment.v1.validated"
  message_id: string;              // ULID
  correlation_id: string;          // UUID for request correlation
  causation_id?: string;           // Original trigger message

  // Idempotency & tracing
  idempotency_key?: string;        // Business operation key
  trace_id?: string;               // W3C traceparent
  tenant_id?: string;              // Multi-tenant support

  // Timing
  occurred_at: string;             // ISO 8601
  expires_at?: string;             // TTL for time-sensitive operations

  // Source information
  producer: string;                // "svc-payments@1.4.2"
  payment_source?: PaymentSource;

  // Payment-specific dates
  effective_date?: string;         // When payment applies
  received_at?: string;            // When received by system
  settlement_due_by?: string;      // Expected settlement date

  // Saga orchestration
  saga_id?: string;                // Saga instance ID
  saga_step?: string;              // Current saga step

  // Payload
  data: T;
}

export type PaymentSource = 'ach' | 'wire' | 'check' | 'card' | 'lockbox' | 'cashier' | 'money_order';

export type PaymentState = 
  | 'received'
  | 'accepted_for_review'
  | 'validated'
  | 'posted_pending_settlement'
  | 'processing'
  | 'settled'
  | 'returned'
  | 'reversed'
  | 'rejected'
  | 'closed';

export interface PaymentData {
  payment_id: string;
  loan_id: string;
  amount_cents: number;
  currency: string;
  source: PaymentSource;
  external_ref?: string;
}

export interface ACHPaymentData extends PaymentData {
  source: 'ach';
  routing_number: string;
  account_number_masked: string;
  trace_number: string;
  company_batch_id?: string;
  originator_id?: string;
  sec_code: 'PPD' | 'CCD' | 'WEB' | 'TEL';
}

export interface WirePaymentData extends PaymentData {
  source: 'wire';
  wire_ref: string;
  sender_ref?: string;
  bank_ref?: string;
  originating_bank?: string;
}

export interface CheckPaymentData extends PaymentData {
  source: 'check';
  check_number: string;
  payer_account: string;
  issue_date: string;
  bank_name?: string;
  is_cashiers_check?: boolean;
}

export interface DistributionData {
  payment_id: string;
  distributions: Array<{
    investor_id: string;
    amount_cents: number;
    servicing_fee_cents: number;
    percentage: number;
  }>;
  total_distributed: number;
  servicing_fee_total: number;
}