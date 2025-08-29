/**
 * Audit Helper - Atomic write and audit operations
 * Ensures all database writes include proper audit trails with correlation IDs
 */

import { PoolClient } from '@neondatabase/serverless';
import { complianceAudit } from '../compliance/auditService';

export interface AuditParams {
  actorId: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  loanId?: string;
  payloadJson?: Record<string, any>;
  correlationId: string;
  description?: string;
  req?: any; // Express request object for IP and user agent
}

/**
 * Execute a database operation and record audit entry atomically
 * @param client Database client with transaction support
 * @param action The database operation to perform
 * @param audit Function to create audit entry after successful operation
 * @returns Result of the database operation
 */
export async function auditAndRun<T>(
  client: PoolClient,
  action: () => Promise<T>,
  audit: (result: T) => Promise<void>
): Promise<T> {
  try {
    await client.query('BEGIN');
    const res = await action();
    await audit(res);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

/**
 * Set request context for database triggers
 * @param client Database client
 * @param actorId User performing the action
 * @param correlationId Request correlation ID
 */
export async function setRequestContext(
  client: PoolClient,
  actorId: string,
  correlationId: string
): Promise<void> {
  await client.query('SELECT set_config($1, $2, true)', ['app.actor_id', actorId]);
  await client.query('SELECT set_config($1, $2, true)', ['app.correlation_id', correlationId]);
}

/**
 * Helper to create standardized audit events
 * @param client Database client
 * @param params Audit parameters
 */
export async function createAuditEvent(
  client: PoolClient, 
  params: AuditParams
): Promise<void> {
  try {
    const correlationId = await complianceAudit.logEvent({
      eventType: params.eventType,
      actorType: params.actorId && params.actorId !== 'system' ? 'user' : 'system',
      actorId: params.actorId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      loanId: params.loanId ? parseInt(params.loanId) : undefined,
      description: params.description || `${params.eventType} operation`,
      // Support both direct payload and structured field changes
      previousValues: params.payloadJson?.oldValues || params.payloadJson?.previousValues,
      newValues: params.payloadJson?.newValues || params.payloadJson,
      changedFields: params.payloadJson?.changedFields,
      // Capture request context for audit trail
      ipAddr: params.req?.ip,
      userAgent: params.req?.get?.('user-agent'),
      metadata: {
        correlationId: params.correlationId,
        // Preserve original payload for backward compatibility
        originalPayload: params.payloadJson
      }
    });
    
    console.log(`[Audit] Created audit event ${params.eventType} with correlation ID: ${correlationId}`);
  } catch (error) {
    console.error(`[Audit] Failed to create audit event ${params.eventType}:`, error);
    // Don't throw - audit failure shouldn't break business operations
  }
}