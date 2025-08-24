import { createHash } from 'crypto';

// Payment method types
export type PaymentMethod = "ach" | "wire" | "realtime" | "check" | "card" | "paypal" | "venmo" | "book";

// Common payment envelope schema
export interface PaymentEnvelope {
  schema: "loanserve.payments.v1";
  message_id: string;
  correlation_id: string;
  idempotency_key: string;
  occurred_at: string; // ISO 8601
  source: {
    channel: PaymentMethod;
    provider: string;
    batch_id?: string;
  };
  borrower: {
    loan_id: string;
    name?: string;
    external_ids?: Record<string, string>;
  };
  payment: {
    amount_cents: number;
    currency: "USD";
    method: PaymentMethod;
    value_date: string;        // yyyy-mm-dd
    reference: string;         // check number, transfer id, etc.
    details?: Record<string, unknown>;
  };
  artifacts: {
    type: string;
    uri: string;
    hash: string;
  }[];
  risk?: {
    flags?: string[];
    score?: number;
  };
  external?: {
    column_transfer_id?: string;
    column_event_id?: string;
    psp_id?: string;
  };
}

// Compute idempotency key from payment components
export function computeIdemKey(
  method: string,
  reference: string,
  valueDate: string,
  amountCents: number,
  loanId: string
): string {
  const s = `${method.toLowerCase()}|${reference.trim().toLowerCase()}|${valueDate}|${amountCents}|${loanId}`;
  return createHash("sha256").update(s).digest("hex");
}

// Create a payment envelope from components
export function createPaymentEnvelope(params: {
  messageId: string;
  correlationId: string;
  method: PaymentMethod;
  reference: string;
  valueDate: string;
  amountCents: number;
  loanId: string;
  provider: string;
  batchId?: string;
  borrowerName?: string;
  externalIds?: Record<string, string>;
  details?: Record<string, unknown>;
  artifacts?: Array<{ type: string; uri: string; hash: string }>;
  riskFlags?: string[];
  riskScore?: number;
  columnTransferId?: string;
  columnEventId?: string;
  pspId?: string;
}): PaymentEnvelope {
  const idempotencyKey = computeIdemKey(
    params.method,
    params.reference,
    params.valueDate,
    params.amountCents,
    params.loanId
  );

  return {
    schema: "loanserve.payments.v1",
    message_id: params.messageId,
    correlation_id: params.correlationId,
    idempotency_key: idempotencyKey,
    occurred_at: new Date().toISOString(),
    source: {
      channel: params.method,
      provider: params.provider,
      batch_id: params.batchId,
    },
    borrower: {
      loan_id: params.loanId,
      name: params.borrowerName,
      external_ids: params.externalIds,
    },
    payment: {
      amount_cents: params.amountCents,
      currency: "USD",
      method: params.method,
      value_date: params.valueDate,
      reference: params.reference,
      details: params.details,
    },
    artifacts: params.artifacts || [],
    risk: (params.riskFlags || params.riskScore) ? {
      flags: params.riskFlags,
      score: params.riskScore,
    } : undefined,
    external: (params.columnTransferId || params.columnEventId || params.pspId) ? {
      column_transfer_id: params.columnTransferId,
      column_event_id: params.columnEventId,
      psp_id: params.pspId,
    } : undefined,
  };
}

// Validate payment envelope
export function validatePaymentEnvelope(envelope: unknown): envelope is PaymentEnvelope {
  if (!envelope || typeof envelope !== 'object') {
    return false;
  }
  
  const e = envelope as any;
  
  // Check required fields
  if (e.schema !== "loanserve.payments.v1") return false;
  if (!e.message_id || typeof e.message_id !== 'string') return false;
  if (!e.correlation_id || typeof e.correlation_id !== 'string') return false;
  if (!e.idempotency_key || typeof e.idempotency_key !== 'string') return false;
  if (!e.occurred_at || typeof e.occurred_at !== 'string') return false;
  
  // Check source
  if (!e.source || typeof e.source !== 'object') return false;
  if (!e.source.channel || !isValidPaymentMethod(e.source.channel)) return false;
  if (!e.source.provider || typeof e.source.provider !== 'string') return false;
  
  // Check borrower
  if (!e.borrower || typeof e.borrower !== 'object') return false;
  if (!e.borrower.loan_id || typeof e.borrower.loan_id !== 'string') return false;
  
  // Check payment
  if (!e.payment || typeof e.payment !== 'object') return false;
  if (typeof e.payment.amount_cents !== 'number') return false;
  if (e.payment.currency !== 'USD') return false;
  if (!e.payment.method || !isValidPaymentMethod(e.payment.method)) return false;
  if (!e.payment.value_date || typeof e.payment.value_date !== 'string') return false;
  if (!e.payment.reference || typeof e.payment.reference !== 'string') return false;
  
  // Check artifacts array
  if (!Array.isArray(e.artifacts)) return false;
  
  return true;
}

function isValidPaymentMethod(method: string): method is PaymentMethod {
  return ["ach", "wire", "realtime", "check", "card", "paypal", "venmo", "book"].includes(method);
}

// Convert envelope to database payment record
export function envelopeToPaymentRecord(envelope: PaymentEnvelope) {
  return {
    idempotencyKey: envelope.idempotency_key,
    sourceChannel: envelope.source.channel,
    paymentMethod: envelope.payment.method,
    transactionId: envelope.payment.reference,
    batchId: envelope.source.batch_id,
    columnTransferId: envelope.external?.column_transfer_id,
    columnEventLastSeen: envelope.external?.column_event_id,
    // Convert cents to dollars for database storage
    totalReceived: (envelope.payment.amount_cents / 100).toFixed(2),
    effectiveDate: envelope.payment.value_date,
    metadata: {
      envelope_message_id: envelope.message_id,
      envelope_correlation_id: envelope.correlation_id,
      envelope_occurred_at: envelope.occurred_at,
      provider: envelope.source.provider,
      borrower_external_ids: envelope.borrower.external_ids,
      payment_details: envelope.payment.details,
      risk: envelope.risk,
      external: envelope.external,
    },
  };
}