/**
 * Audit Helper - Atomic write and audit operations
 * Ensures all database writes include proper audit trails with correlation IDs
 */

import { PoolClient } from '@neondatabase/serverless';
import { complianceAudit } from '../compliance/auditService';
import type { Request } from 'express';

/**
 * Extract real user IP address from request, handling proxy headers
 */
export function getRealUserIP(req: Request): string {
  // Check common proxy headers in order of preference
  const xForwardedFor = req.headers['x-forwarded-for'];
  const xRealIP = req.headers['x-real-ip'];
  const xClientIP = req.headers['x-client-ip'];
  const cfConnectingIP = req.headers['cf-connecting-ip']; // Cloudflare
  
  // X-Forwarded-For can contain multiple IPs, get the first (original client)
  if (xForwardedFor) {
    const forwarded = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
    const firstIP = forwarded.split(',')[0]?.trim();
    if (firstIP && !isPrivateIP(firstIP)) {
      return firstIP;
    }
  }
  
  // Try other proxy headers
  if (xRealIP && typeof xRealIP === 'string' && !isPrivateIP(xRealIP)) {
    return xRealIP;
  }
  
  if (xClientIP && typeof xClientIP === 'string' && !isPrivateIP(xClientIP)) {
    return xClientIP;
  }
  
  if (cfConnectingIP && typeof cfConnectingIP === 'string' && !isPrivateIP(cfConnectingIP)) {
    return cfConnectingIP;
  }
  
  // Fallback to req.ip (which may be proxy IP)
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Check if IP address is private/internal (RFC 1918)
 */
function isPrivateIP(ip: string): boolean {
  const privateRanges = [
    /^10\./,           // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12
    /^192\.168\./,     // 192.168.0.0/16
    /^127\./,          // 127.0.0.0/8 (localhost)
    /^169\.254\./,     // 169.254.0.0/16 (link-local)
    /^::1$/,           // IPv6 localhost
    /^fc00:/,          // IPv6 unique local
    /^fe80:/           // IPv6 link-local
  ];
  
  return privateRanges.some(range => range.test(ip));
}

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
      ipAddr: params.req ? getRealUserIP(params.req) : undefined,
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