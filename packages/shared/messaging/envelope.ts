/**
 * Canonical Envelope Schema v1
 * Enterprise-grade message envelope with versioning, idempotency, and audit trails
 */

export interface CanonicalEnvelope<T = any> {
  // Message identification
  id: string;
  message_id: string;
  correlation_id: string;
  causation_id?: string;
  idempotency_key: string;
  
  // Schema and versioning
  schema: string;
  version: "v1";
  
  // Temporal information
  occurred_at: string;
  published_at?: string;
  
  // Producer information
  producer: {
    service: string;
    instance?: string;
    version?: string;
  };
  
  // Tracing and observability
  trace_id?: string;
  span_id?: string;
  
  // Tenant and user context
  tenant_id?: string;
  user_id?: string;
  
  // Message properties
  priority?: number;
  ttl?: number;
  retry_count?: number;
  
  // Headers for middleware
  headers?: Record<string, any>;
  
  // The actual message payload
  data: T;
}

// Helper function to create canonical envelopes
export function createCanonicalEnvelope<T>(
  data: T,
  schema: string,
  options: {
    id?: string;
    correlation_id?: string;
    idempotency_key?: string;
    producer: {
      service: string;
      instance?: string;
      version?: string;
    };
    user_id?: string;
    tenant_id?: string;
    trace_id?: string;
    priority?: number;
    ttl?: number;
  }
): CanonicalEnvelope<T> {
  const now = new Date().toISOString();
  const messageId = options.id || generateMessageId();
  
  return {
    id: messageId,
    message_id: messageId,
    correlation_id: options.correlation_id || generateCorrelationId(),
    idempotency_key: options.idempotency_key || generateIdempotencyKey(data, schema),
    schema,
    version: "v1",
    occurred_at: now,
    published_at: now,
    producer: options.producer,
    trace_id: options.trace_id,
    user_id: options.user_id,
    tenant_id: options.tenant_id,
    priority: options.priority,
    ttl: options.ttl,
    retry_count: 0,
    data
  };
}

// Utility functions
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function generateIdempotencyKey(data: any, schema: string): string {
  const crypto = require('crypto');
  const content = JSON.stringify({ data, schema, timestamp: Date.now() });
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 32);
}