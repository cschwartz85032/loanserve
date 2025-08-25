export interface MessageEnvelope<T = unknown> {
  message_id: string;               // uuid v7
  schema: string;                   // e.g. "loanserve.payment.received.v1"
  trace_id?: string;                // OpenTelemetry trace id if available
  correlation_id: string;           // required
  priority?: number;                // 0..9
  timestamp_unix_ms: number;
  payload: T;
}

export const MandatoryHeaders = {
  MESSAGE_ID: "x-message-id",
  CORRELATION_ID: "x-correlation-id",
  SCHEMA: "x-schema",
  TRACE_ID: "x-trace-id"
} as const;