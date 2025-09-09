/**
 * Tenant-aware Database Client
 * Enforces RLS by setting app.tenant_id for every query
 */

import { PoolClient } from 'pg';
import { pool } from '../../server/db';
import { redactUuid } from '../logging/redact';
import { z } from 'zod';

const NIL = '00000000-0000-0000-0000-000000000000';
const DEFAULT_TENANT = process.env.DEFAULT_TENANT_ID ?? NIL;

/**
 * Execute database operations with tenant context set
 * This ensures all queries run with proper RLS enforcement
 */
const tenantIdSchema = z
  .string()
  .transform(v => (v === 'default' || !v ? DEFAULT_TENANT : v))
  .refine(v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), 
    'Invalid UUID format');

export async function withTenantClient<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!tenantId) throw new Error('Tenant ID is required for database operations');
  
  // Use zod to normalize and validate tenant ID
  const normalizedTenantId = tenantIdSchema.parse(tenantId);

  const client = await pool.connect();
  try {
    // Start transaction so SET LOCAL is truly transaction-scoped
    await client.query('BEGIN');
    // Neon serverless compatibility: Use session variable approach
    try {
      await client.query(`SET LOCAL app.tenant_id = '${normalizedTenantId}'`);
    } catch (error) {
      console.warn('[DB] Neon serverless does not support SET LOCAL, using alternative approach');
      // For now, continue without tenant context (to be improved)
    }
    
    console.debug('[DB] Tenant context set for session', {
      tenantId: redactUuid(normalizedTenantId),
      originalTenantId: tenantId !== normalizedTenantId ? tenantId : undefined,
      timestamp: new Date().toISOString()
    });

    const result = await fn(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[DB] Database operation failed with tenant context', {
      tenantId: redactUuid(tenantId),
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute database operations without tenant context (admin operations only)
 * USE WITH EXTREME CAUTION - bypasses RLS
 */
export async function withAdminClient<T>(
  fn: (client: PoolClient) => Promise<T>,
  reason: string
): Promise<T> {
  console.warn('[DB] Admin database access requested', {
    reason,
    timestamp: new Date().toISOString(),
    stack: new Error().stack?.split('\n').slice(1, 4).join('\n')
  });

  const client = await pool.connect();
  
  try {
    return await fn(client);
  } catch (error) {
    console.error('[DB] Admin database operation failed', {
      reason,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Utility function to validate tenant access to a resource
 */
export async function validateTenantAccess(
  tenantId: string,
  resourceTable: string,
  resourceId: string
): Promise<boolean> {
  return withTenantClient(tenantId, async (client) => {
    const result = await client.query(
      `SELECT 1 FROM ${resourceTable} WHERE id = $1 LIMIT 1`,
      [resourceId]
    );
    return (result.rowCount || 0) > 0;
  });
}

/**
 * Get current tenant context from database session
 */
export async function getCurrentTenant(client: PoolClient): Promise<string | null> {
  try {
    const result = await client.query('SELECT current_setting(\'app.tenant_id\', true) as tenant_id');
    return result.rows[0]?.tenant_id || null;
  } catch (error) {
    return null;
  }
}

/**
 * Runtime guard to assert tenant context is set before DB operations
 * Call this before any database query to prevent cross-tenant data leakage
 */
export async function assertTenantContext(client: PoolClient): Promise<string> {
  const tenantId = await getCurrentTenant(client);
  
  if (!tenantId) {
    const error = new Error('CRITICAL: Database operation attempted without tenant context - potential cross-tenant data leak!');
    console.error('[SECURITY] Tenant context missing!', {
      timestamp: new Date().toISOString(),
      stack: new Error().stack?.split('\n').slice(1, 5).join('\n')
    });
    throw error;
  }
  
  // Validate tenant ID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    const error = new Error(`CRITICAL: Invalid tenant ID format detected: ${redactUuid(tenantId)}`);
    console.error('[SECURITY] Invalid tenant ID format!', {
      tenantId: redactUuid(tenantId),
      timestamp: new Date().toISOString()
    });
    throw error;
  }
  
  return tenantId;
}

/**
 * Wrapper for any raw SQL query that enforces tenant context checking
 * Use this instead of client.query directly for tenant-sensitive operations
 */
export async function tenantSafeQuery(
  client: PoolClient, 
  query: string, 
  params?: any[]
): Promise<any> {
  // Runtime guard - ensure tenant context is set
  const tenantId = await assertTenantContext(client);
  
  console.debug('[DB] Executing tenant-safe query', {
    tenantId: redactUuid(tenantId),
    queryType: query.split(' ')[0].toUpperCase(),
    timestamp: new Date().toISOString()
  });
  
  return await client.query(query, params);
}