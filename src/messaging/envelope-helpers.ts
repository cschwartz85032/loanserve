/**
 * Helper functions for creating and handling message envelopes
 */

import { randomUUID } from 'crypto';
import { Envelope } from '../types/messages';

/**
 * Create a standardized envelope for queue messages
 */
export function createEnvelope<T>(params: {
  tenantId: string;
  payload: T;
  correlationId?: string;
  causationId?: string;
  idempotencyKey?: string;
  actor?: { userId?: string; service?: string };
}): Envelope<T> {
  return {
    tenantId: params.tenantId,
    correlationId: params.correlationId || randomUUID(),
    causationId: params.causationId,
    idempotencyKey: params.idempotencyKey || randomUUID(),
    actor: params.actor,
    occurredAt: new Date().toISOString(),
    schemaVersion: 1,
    payload: params.payload
  };
}

/**
 * Generate tenant-aware routing key
 */
export function createRoutingKey(tenantId: string, action: string): string {
  return `tenant.${tenantId}.${action}`;
}

/**
 * Generate deterministic idempotency key for ETL jobs
 */
export function createEtlIdempotencyKey(
  tenantId: string, 
  jobType: string, 
  timeWindow: string
): string {
  return `etl:${tenantId}:${jobType}:${timeWindow}`;
}

/**
 * Create date-based key for ETL scheduling
 */
export function createDateKey(date?: Date): string {
  const d = date || new Date();
  return d.toISOString().split('T')[0]; // YYYY-MM-DD format
}