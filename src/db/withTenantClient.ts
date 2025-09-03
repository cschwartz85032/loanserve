/**
 * Tenant-aware Database Client
 * Enforces RLS by setting app.tenant_id for every query
 */

import { PoolClient } from 'pg';
import { pool } from '../../server/db';

/**
 * Execute database operations with tenant context set
 * This ensures all queries run with proper RLS enforcement
 */
export async function withTenantClient<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!tenantId) {
    throw new Error('Tenant ID is required for database operations');
  }

  // Validate tenant ID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId}`);
  }

  const client = await pool.connect();
  
  try {
    // Set tenant context for this session - this enforces RLS
    await client.query('SET LOCAL app.tenant_id = $1', [tenantId]);
    
    console.debug('[DB] Tenant context set for session', {
      tenantId,
      timestamp: new Date().toISOString()
    });

    // Execute the database operations with tenant context
    return await fn(client);
    
  } catch (error) {
    console.error('[DB] Database operation failed with tenant context', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    // Release the client back to the pool
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