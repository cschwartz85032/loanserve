/**
 * API Key Authentication and Rate Limiting
 * Provides HMAC-based API key authentication with tenant-scoped rate limiting
 */

import { Pool } from "pg";
import { createHmac, randomUUID } from "crypto";
import dayjs from "dayjs";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Generate a new API key
 */
export async function createApiKey(
  tenantId: string,
  label: string,
  ttlDays: number = Number(process.env.API_KEY_TTL_DAYS) || 365
): Promise<{ keyId: string; apiKey: string }> {
  const keyId = `key_${randomUUID().replace(/-/g, '')}`;
  const apiKey = randomUUID();
  const keyHash = await bcrypt.hash(apiKey, 12);
  const expiresAt = dayjs().add(ttlDays, 'day').toISOString();

  const c = await pool.connect();
  try {
    await c.query(
      `INSERT INTO api_keys (tenant_id, label, key_id, key_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, label, keyId, keyHash, expiresAt]
    );

    return { keyId, apiKey };
  } finally {
    c.release();
  }
}

/**
 * Verify API key HMAC signature
 */
export async function verifyApiKeySignature(
  keyId: string,
  signature: string,
  timestamp: string,
  method: string,
  path: string,
  body: string = ''
): Promise<{ valid: boolean; tenantId?: string; keyData?: any }> {
  const c = await pool.connect();
  try {
    // Get API key
    const result = await c.query(
      `SELECT * FROM api_keys WHERE key_id=$1 AND active=true AND expires_at > now()`,
      [keyId]
    );

    if (!result.rowCount) {
      return { valid: false };
    }

    const keyData = result.rows[0];

    // Reconstruct the signature
    const payload = `${timestamp}.${method}.${path}.${body}`;
    const expectedSignature = createHmac('sha256', keyData.key_hash)
      .update(payload)
      .digest('hex');

    const valid = signature === expectedSignature;
    
    return { 
      valid, 
      tenantId: valid ? keyData.tenant_id : undefined,
      keyData: valid ? keyData : undefined
    };
  } finally {
    c.release();
  }
}

/**
 * Check rate limit for API key
 */
export async function checkRateLimit(
  tenantId: string,
  keyId: string,
  maxRequests: number = Number(process.env.RATE_LIMIT_REQ_PER_MIN) || 600,
  windowMinutes: number = 1
): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
  const c = await pool.connect();
  try {
    const windowStart = dayjs().startOf('minute').toISOString();
    const windowEnd = dayjs().add(windowMinutes, 'minute').startOf('minute').toISOString();

    // Get current count for this window
    const countResult = await c.query(
      `SELECT COALESCE(SUM(count), 0) as total_count 
       FROM api_rate 
       WHERE tenant_id=$1 AND key_id=$2 AND window_start >= $3 AND window_start < $4`,
      [tenantId, keyId, windowStart, windowEnd]
    );

    const currentCount = parseInt(countResult.rows[0].total_count);
    const allowed = currentCount < maxRequests;
    const remaining = Math.max(0, maxRequests - currentCount - 1);

    if (allowed) {
      // Increment counter
      await c.query(
        `INSERT INTO api_rate (tenant_id, key_id, window_start, count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (tenant_id, key_id, window_start)
         DO UPDATE SET count = api_rate.count + 1`,
        [tenantId, keyId, windowStart]
      );
    }

    const resetTime = dayjs(windowStart).add(windowMinutes, 'minute').toDate();

    return { allowed, remaining, resetTime };
  } finally {
    c.release();
  }
}

/**
 * Clean up old rate limit windows
 */
export async function cleanupRateLimitWindows(): Promise<void> {
  const c = await pool.connect();
  try {
    const cutoff = dayjs().subtract(1, 'hour').toISOString();
    await c.query(
      `DELETE FROM api_rate WHERE window_start < $1`,
      [cutoff]
    );
  } finally {
    c.release();
  }
}

/**
 * API Key authentication middleware
 */
export function apiKeyAuth(req: any, res: any, next: any) {
  const keyId = req.headers['x-api-key-id'];
  const signature = req.headers['x-api-signature'];
  const timestamp = req.headers['x-api-timestamp'];

  if (!keyId || !signature || !timestamp) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'API key authentication required'
    });
  }

  // Check timestamp (prevent replay attacks)
  const now = Date.now();
  const requestTime = parseInt(timestamp);
  const timeDiff = Math.abs(now - requestTime);
  
  if (timeDiff > 300000) { // 5 minutes
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Request timestamp too old'
    });
  }

  // Verify signature
  const body = req.body ? JSON.stringify(req.body) : '';
  
  verifyApiKeySignature(keyId, signature, timestamp, req.method, req.path, body)
    .then(async ({ valid, tenantId, keyData }) => {
      if (!valid) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Invalid API key signature'
        });
      }

      // Check rate limit
      const rateLimit = await checkRateLimit(tenantId!, keyId);
      
      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'rate_limited',
          message: 'Rate limit exceeded',
          reset_time: rateLimit.resetTime
        });
      }

      // Add tenant context to request
      req.tenant = { id: tenantId };
      req.apiKey = keyData;
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': Math.floor(rateLimit.resetTime.getTime() / 1000).toString()
      });

      next();
    })
    .catch(error => {
      console.error('API key auth error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Authentication service error'
      });
    });
}