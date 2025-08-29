/**
 * Zod schemas for runtime validation of message envelopes
 * Ensures type safety and prevents malformed messages from entering business logic
 */
import { z } from 'zod';

export const BaseEnvelopeSchema = z.object({
  schema: z.string(),
  message_id: z.string(),
  correlation_id: z.string(),
  causation_id: z.string().optional(),
  idempotency_key: z.string().optional(),
  tenant_id: z.string().optional(),
  user_id: z.string().optional(),
  occurred_at: z.string(),
  published_at: z.string().optional(),
  producer: z.string(),
  producer_instance: z.string().optional(),
  trace_id: z.string().optional(),
  span_id: z.string().optional(),
  version: z.number().optional(),
  retry_count: z.number().optional(),
  ttl: z.number().optional(),
  priority: z.number().optional(),
  headers: z.record(z.any()).optional(),
});

/**
 * Helper to build a complete envelope schema with typed data payload
 * @param dataSchema Zod schema for the data property
 * @returns Complete envelope schema with validated data
 */
export function buildEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return BaseEnvelopeSchema.extend({ data: dataSchema });
}

/**
 * Strictly typed envelope type for use with specific data schemas
 */
export type Envelope<T> = z.infer<typeof BaseEnvelopeSchema> & { data: T };

/**
 * Common data schemas for standard message types
 */
export const CommonDataSchemas = {
  // Payment-related schemas
  PaymentReceived: z.object({
    payment_id: z.string(),
    loan_id: z.string(),
    amount_minor: z.number(),
    source: z.string(),
    method: z.string(),
  }),

  PaymentProcessed: z.object({
    payment_id: z.string(),
    loan_id: z.string(),
    allocation: z.record(z.number()),
    balance_after: z.number(),
  }),

  // Document-related schemas
  DocumentUploaded: z.object({
    document_id: z.string(),
    loan_id: z.string(),
    file_path: z.string(),
    mime_type: z.string(),
    size_bytes: z.number(),
  }),

  DocumentAnalyzed: z.object({
    document_id: z.string(),
    loan_id: z.string(),
    classification: z.string(),
    confidence: z.number(),
    extracted_data: z.record(z.any()),
  }),

  // Escrow-related schemas
  EscrowDisbursementInitiated: z.object({
    loan_id: z.string(),
    disbursement_id: z.string(),
    amount_minor: z.number(),
    category: z.string(),
    due_date: z.string(),
  }),

  // Audit-related schemas
  AuditEvent: z.object({
    event_type: z.string(),
    resource_type: z.string(),
    resource_id: z.string(),
    actor_id: z.string(),
    changes: z.record(z.any()).optional(),
  }),

  // Notification schemas
  NotificationSend: z.object({
    recipient_id: z.string(),
    channel: z.enum(['email', 'sms', 'push']),
    template: z.string(),
    data: z.record(z.any()),
    priority: z.number().optional(),
  }),
} as const;