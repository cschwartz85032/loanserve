/**
 * LoanServe Pro Message Envelope Standard
 * Enterprise messaging patterns with full traceability
 */

export interface MessageEnvelope<T = any> {
  // Message identification
  schema: string;                    // e.g., "loanserve.v1.payment.processed"
  message_id: string;                 // ULID for uniqueness
  correlation_id: string;             // UUID for request correlation
  causation_id: string;               // UUID for cause tracking
  idempotency_key?: string;           // Business-level deduplication key
  
  // Multi-tenancy and context
  tenant_id?: string;                 // For multi-tenant scenarios
  user_id?: string;                   // User who initiated the action
  
  // Temporal information
  occurred_at: string;                // RFC3339 timestamp
  published_at?: string;              // When message was published
  
  // Producer information
  producer: string;                   // service-name@version
  producer_instance?: string;         // Specific instance ID
  
  // Tracing
  trace_id?: string;                  // W3C trace context
  span_id?: string;                   // Span within trace
  
  // Message metadata
  version: number;                    // Message schema version
  retry_count?: number;               // Number of retry attempts
  ttl?: number;                       // Time to live in milliseconds
  priority?: number;                  // Message priority (0-10)
  
  // Headers for routing
  headers?: Record<string, string>;
  
  // The actual domain payload
  data: T;
}

export interface MessageMetadata {
  exchange: string;
  routing_key: string;
  queue?: string;
  persistent?: boolean;
  mandatory?: boolean;
  immediate?: boolean;
  expiration?: string;
  headers?: Record<string, any>;
}

export interface ConsumerContext {
  consumer_id: string;
  consumer_group?: string;
  attempt: number;
  max_retries: number;
  received_at: string;
  processing_started_at?: string;
  ack_deadline?: string;
}

export interface ProcessingResult {
  success: boolean;
  result_hash?: string;
  error?: string;
  should_retry?: boolean;
  retry_delay_ms?: number;
  dead_letter?: boolean;
}

// Schema definitions for validation
export const MessageSchemas = {
  // Servicing
  'loanserve.v1.servicing.task': 'ServicingTask',
  'loanserve.v1.servicing.completed': 'ServicingCompleted',
  
  // Payments
  'loanserve.v1.payment.received': 'PaymentReceived',
  'loanserve.v1.payment.validated': 'PaymentValidated',
  'loanserve.v1.payment.processed': 'PaymentProcessed',
  'loanserve.v1.payment.distributed': 'PaymentDistributed',
  'loanserve.v1.payment.failed': 'PaymentFailed',
  
  // Documents
  'loanserve.v1.document.uploaded': 'DocumentUploaded',
  'loanserve.v1.document.analyzing': 'DocumentAnalyzing',
  'loanserve.v1.document.analyzed': 'DocumentAnalyzed',
  'loanserve.v1.document.failed': 'DocumentFailed',
  
  // Notifications
  'loanserve.v1.notification.send': 'NotificationSend',
  'loanserve.v1.notification.sent': 'NotificationSent',
  'loanserve.v1.notification.failed': 'NotificationFailed',
  
  // Escrow
  'loanserve.v1.escrow.disbursement.initiated': 'EscrowDisbursementInitiated',
  'loanserve.v1.escrow.step.completed': 'EscrowStepCompleted',
  'loanserve.v1.escrow.step.failed': 'EscrowStepFailed',
  
  // Compliance
  'loanserve.v1.compliance.check': 'ComplianceCheck',
  'loanserve.v1.compliance.alert': 'ComplianceAlert',
  
  // Audit
  'loanserve.v1.audit.event': 'AuditEvent',
} as const;

export type MessageSchema = keyof typeof MessageSchemas;

// Type guards
export function isMessageEnvelope(obj: any): obj is MessageEnvelope {
  return obj 
    && typeof obj.schema === 'string'
    && typeof obj.message_id === 'string'
    && typeof obj.correlation_id === 'string'
    && typeof obj.occurred_at === 'string'
    && typeof obj.producer === 'string'
    && obj.data !== undefined;
}

// Priority levels
export enum MessagePriority {
  CRITICAL = 10,
  HIGH = 8,
  NORMAL = 5,
  LOW = 3,
  BATCH = 1
}

// Standard retry delays (ms)
export const RetryDelays = {
  IMMEDIATE: 0,
  SHORT: 5000,      // 5 seconds
  MEDIUM: 30000,    // 30 seconds
  LONG: 300000,     // 5 minutes
  EXPONENTIAL: (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 300000)
} as const;