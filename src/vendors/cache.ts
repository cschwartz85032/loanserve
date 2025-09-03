/**
 * Vendor response caching service with TTL and audit logging
 * Provides centralized caching for all vendor integrations
 */

import { Pool } from "pg";
import dayjs from "dayjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Retrieve cached vendor response if still valid
 */
export async function getCache(tenantId: string, vendor: string, key: string): Promise<any | null> {
  const c = await pool.connect();
  
  try {
    await c.query(`SET LOCAL app.tenant_id=$1`, [tenantId]);
    
    const result = await c.query(
      `SELECT payload, expires_at FROM vendor_cache 
       WHERE vendor=$1 AND key=$2 AND expires_at > now()`,
      [vendor, key]
    );
    
    return result.rows[0]?.payload || null;
  } finally {
    c.release();
  }
}

/**
 * Store vendor response in cache with TTL
 */
export async function putCache(
  tenantId: string,
  loanId: string | null,
  vendor: string,
  key: string,
  payload: any,
  ttlMin: number
): Promise<void> {
  const c = await pool.connect();
  
  try {
    await c.query(`SET LOCAL app.tenant_id=$1`, [tenantId]);
    
    const expiresAt = dayjs().add(ttlMin, 'minute').toISOString();
    
    await c.query(
      `INSERT INTO vendor_cache (tenant_id, loan_id, vendor, key, payload, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, vendor, key) 
       DO UPDATE SET 
         payload = EXCLUDED.payload,
         expires_at = EXCLUDED.expires_at,
         cached_at = now()`,
      [tenantId, loanId, vendor, key, JSON.stringify(payload), expiresAt]
    );
  } finally {
    c.release();
  }
}

/**
 * Log vendor API call for audit and monitoring
 */
export async function auditVendor(
  tenantId: string,
  loanId: string | null,
  vendor: string,
  endpoint: string,
  status: number,
  req: any,
  res: any,
  latencyMs: number
): Promise<void> {
  const c = await pool.connect();
  
  try {
    await c.query(`SET LOCAL app.tenant_id=$1`, [tenantId]);
    
    await c.query(
      `INSERT INTO vendor_audit (tenant_id, loan_id, vendor, endpoint, status, req, res, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId,
        loanId,
        vendor,
        endpoint,
        status,
        JSON.stringify(req || {}),
        JSON.stringify(res || {}),
        latencyMs
      ]
    );
  } finally {
    c.release();
  }
}