/**
 * Admin API Management Routes
 * Provides admin interface for managing API clients and keys
 */

import { Router } from "express";
import { createApiClient } from "../publicapi/oauth";
import { createApiKey, cleanupRateLimitWindows } from "../publicapi/auth";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const adminApiRouter = Router();

// Middleware to require admin access
function requireAdmin(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Simple admin check - in production this would check roles/permissions
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
}

// Get tenant ID (simplified for now)
function getTenantId(req: any): string {
  return req.user?.tenantId || '00000000-0000-0000-0000-000000000001';
}

/**
 * API Client Management
 */
adminApiRouter.get("/admin/api-clients", requireAdmin, async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const c = await pool.connect();
    
    try {
      const result = await c.query(
        `SELECT id, client_id, client_name, scopes, active, created_at
         FROM api_clients 
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );

      res.json({ data: result.rows });
    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('Admin API clients error:', error);
    res.status(500).json({ error: 'Failed to retrieve API clients' });
  }
});

adminApiRouter.post("/admin/api-clients", requireAdmin, async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { clientName, scopes = ['read'] } = req.body;

    if (!clientName) {
      return res.status(400).json({ error: 'clientName is required' });
    }

    const { clientId, clientSecret } = await createApiClient(tenantId, clientName, scopes);

    res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      client_name: clientName,
      scopes,
      message: 'Store the client_secret securely - it will not be shown again'
    });
  } catch (error: any) {
    console.error('Create API client error:', error);
    res.status(500).json({ error: 'Failed to create API client' });
  }
});

adminApiRouter.patch("/admin/api-clients/:clientId", requireAdmin, async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { clientId } = req.params;
    const { active, scopes } = req.body;

    const c = await pool.connect();
    try {
      const updates = [];
      const values = [tenantId, clientId];
      let paramIndex = 3;

      if (typeof active === 'boolean') {
        updates.push(`active = $${paramIndex++}`);
        values.push(active);
      }

      if (Array.isArray(scopes)) {
        updates.push(`scopes = $${paramIndex++}`);
        values.push(scopes);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid updates provided' });
      }

      const result = await c.query(
        `UPDATE api_clients SET ${updates.join(', ')} 
         WHERE tenant_id = $1 AND client_id = $2
         RETURNING id, client_id, client_name, scopes, active`,
        values
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: 'API client not found' });
      }

      res.json({ data: result.rows[0] });
    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('Update API client error:', error);
    res.status(500).json({ error: 'Failed to update API client' });
  }
});

/**
 * API Key Management
 */
adminApiRouter.get("/admin/api-keys", requireAdmin, async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const c = await pool.connect();
    
    try {
      const result = await c.query(
        `SELECT id, key_id, label, expires_at, active, created_at
         FROM api_keys 
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );

      res.json({ data: result.rows });
    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('Admin API keys error:', error);
    res.status(500).json({ error: 'Failed to retrieve API keys' });
  }
});

adminApiRouter.post("/admin/api-keys", requireAdmin, async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { label, ttlDays } = req.body;

    if (!label) {
      return res.status(400).json({ error: 'label is required' });
    }

    const { keyId, apiKey } = await createApiKey(tenantId, label, ttlDays);

    res.status(201).json({
      key_id: keyId,
      api_key: apiKey,
      label,
      message: 'Store the api_key securely - it will not be shown again'
    });
  } catch (error: any) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

adminApiRouter.patch("/admin/api-keys/:keyId", requireAdmin, async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { keyId } = req.params;
    const { active } = req.body;

    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active (boolean) is required' });
    }

    const c = await pool.connect();
    try {
      const result = await c.query(
        `UPDATE api_keys SET active = $3 
         WHERE tenant_id = $1 AND key_id = $2
         RETURNING id, key_id, label, expires_at, active`,
        [tenantId, keyId, active]
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: 'API key not found' });
      }

      res.json({ data: result.rows[0] });
    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('Update API key error:', error);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

/**
 * Rate Limiting Management
 */
adminApiRouter.get("/admin/rate-limits", requireAdmin, async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const c = await pool.connect();
    
    try {
      const result = await c.query(
        `SELECT key_id, COUNT(*) as windows, SUM(count) as total_requests
         FROM api_rate 
         WHERE tenant_id = $1 AND window_start >= now() - interval '1 hour'
         GROUP BY key_id
         ORDER BY total_requests DESC`,
        [tenantId]
      );

      res.json({ data: result.rows });
    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('Rate limits error:', error);
    res.status(500).json({ error: 'Failed to retrieve rate limits' });
  }
});

adminApiRouter.post("/admin/rate-limits/cleanup", requireAdmin, async (req: any, res) => {
  try {
    await cleanupRateLimitWindows();
    res.json({ message: 'Rate limit windows cleaned up successfully' });
  } catch (error: any) {
    console.error('Rate limit cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup rate limits' });
  }
});

/**
 * API Usage Statistics
 */
adminApiRouter.get("/admin/api-usage", requireAdmin, async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { hours = 24 } = req.query;
    
    const c = await pool.connect();
    try {
      const result = await c.query(
        `SELECT 
           date_trunc('hour', window_start) as hour,
           SUM(count) as requests
         FROM api_rate 
         WHERE tenant_id = $1 AND window_start >= now() - interval '${parseInt(hours as string)} hours'
         GROUP BY date_trunc('hour', window_start)
         ORDER BY hour DESC`,
        [tenantId]
      );

      res.json({ data: result.rows });
    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('API usage error:', error);
    res.status(500).json({ error: 'Failed to retrieve API usage' });
  }
});