/**
 * Message Contract - Uniform envelope for all queue messages
 * Provides tenant isolation, tracing, and exactly-once semantics
 */

export type Envelope<T> = {
  messageId: string;      // For consumer compatibility
  tenantId: string;
  correlationId: string; // end-to-end tracing
  causationId?: string;  // parent correlation ID
  idempotencyKey: string; // for exactly-once-in-practice
  actor?: { 
    userId?: string; 
    service?: string; 
  };
  occurredAt: string; // ISO timestamp
  schemaVersion: 1;
  payload: T;
};

/**
 * ETL-specific message payloads
 */
export interface EtlSchedulePayload {
  window: string; // e.g., 'last_5m', 'daily'
  jobTypes?: string[]; // optional filter for specific ETL jobs
}

export interface EtlJobPayload {
  shardKey: string; // unique identifier for this shard
  jobType: 'loan_performance' | 'service_operations' | 'ai_performance';
  timeWindow: {
    start: string;
    end: string;
  };
  parameters: Record<string, any>; // job-specific parameters
}

/**
 * Loan operation payloads
 */
export interface LoanCreatePayload {
  loanData: Record<string, any>; // validated loan data
}

export interface LoanUpdatePayload {
  loanId: string;
  updates: Record<string, any>;
}

/**
 * Payment operation payloads  
 */
export interface PaymentProcessPayload {
  paymentId: string;
  amount: number;
  paymentMethod: string;
}

export interface PaymentAllocatePayload {
  paymentId: string;
  allocationRules: Record<string, any>;
}

/**
 * Status tracking payloads
 */
export interface StatusUpdatePayload {
  resourceType: string; // 'loan', 'payment', 'etl_job'
  resourceId: string;
  status: string;
  progress?: number; // 0-100 percentage
  message?: string;
  metadata?: Record<string, any>;
}