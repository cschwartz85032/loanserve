// Re-export the canonical envelope from shared messaging
export type { MessageEnvelope, MessageMetadata, MessageSchema } from '../../shared/messaging/envelope';
export { MessagePriority, MessageSchemas } from '../../shared/messaging/envelope';

export const MandatoryHeaders = {
  MESSAGE_ID: "x-message-id",
  CORRELATION_ID: "x-correlation-id",
  SCHEMA: "x-schema",
  TRACE_ID: "x-trace-id"
} as const;