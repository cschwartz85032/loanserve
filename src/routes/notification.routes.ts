// Notification API routes
// Provides endpoints for requesting notifications, checking status, and managing templates

import { Router } from "express";
import { requestNotification, type NotificationRequest } from "../notifications/service";
import { getNotificationWorker } from "../workers/NotificationWorker";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * POST /api/notifications/send
 * Send a notification request
 */
router.post('/send', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header required' });
    }

    const {
      loan_id,
      template_code,
      channel,
      to_party,
      to_address,
      locale,
      params,
      idempotency_key
    } = req.body;

    // Validate required fields
    if (!template_code || !channel || !to_party || !to_address) {
      return res.status(400).json({ 
        error: 'Missing required fields: template_code, channel, to_party, to_address' 
      });
    }

    // Validate channel
    if (!['email', 'sms', 'webhook'].includes(channel)) {
      return res.status(400).json({ 
        error: 'Invalid channel. Must be email, sms, or webhook' 
      });
    }

    const notificationRequest: NotificationRequest = {
      tenantId,
      loanId: loan_id || null,
      templateCode: template_code,
      channel,
      toParty: to_party,
      toAddress: to_address,
      locale: locale || 'en-US',
      params: params || {},
      createdBy: (req as any).user?.id || null,
      idempotencyKey: idempotency_key || null
    };

    console.log(`[NotificationRoutes] Notification request: ${template_code} -> ${to_address}`);
    
    const result = await requestNotification(notificationRequest);
    
    if (!result) {
      return res.status(409).json({ 
        error: 'Duplicate request (idempotency key already processed)' 
      });
    }

    res.status(202).json({
      notification_id: result.id,
      status: result.status,
      reason: result.reason
    });
  } catch (error: any) {
    console.error('[NotificationRoutes] Send notification failed:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

/**
 * GET /api/notifications/:id
 * Get notification status and details
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header required' });
    }

    const { id } = req.params;
    const client = await pool.connect();
    
    try {
      // Note: tenant isolation handled by application logic
      // await client.query('SET LOCAL app.tenant_id = $1', [tenantId]);
      
      const result = await client.query(`
        SELECT 
          n.*,
          COALESCE(
            json_agg(
              json_build_object(
                'event', ne.event,
                'meta', ne.meta,
                'timestamp', ne.ts
              ) ORDER BY ne.ts
            ) FILTER (WHERE ne.id IS NOT NULL),
            '[]'::json
          ) as events
        FROM notifications n
        LEFT JOIN notification_events ne ON n.id = ne.notification_id
        WHERE n.id = $1 AND n.tenant_id = $2
        GROUP BY n.id
      `, [id, tenantId]);

      if (!result.rowCount) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      const notification = result.rows[0];
      res.json({
        id: notification.id,
        template_code: notification.template_code,
        channel: notification.channel,
        to_party: notification.to_party,
        to_address: notification.to_address,
        status: notification.status,
        reason: notification.reason,
        created_at: notification.created_at,
        sent_at: notification.sent_at,
        events: notification.events
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[NotificationRoutes] Get notification failed:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

/**
 * GET /api/notifications/loans/:loanId
 * Get notifications for a specific loan
 */
router.get('/loans/:loanId', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header required' });
    }

    const { loanId } = req.params;
    const { status, limit = '50', offset = '0' } = req.query;
    
    const client = await pool.connect();
    
    try {
      // Note: tenant isolation handled by application logic
      // await client.query('SET LOCAL app.tenant_id = $1', [tenantId]);
      
      let query = `
        SELECT 
          id, template_code, channel, to_party, to_address,
          status, reason, created_at, sent_at
        FROM notifications 
        WHERE tenant_id = $1 AND loan_id = $2
      `;
      
      const params: any[] = [tenantId, loanId];
      
      if (status) {
        query += ' AND status = $3';
        params.push(status);
      }
      
      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(parseInt(limit as string), parseInt(offset as string));
      
      const result = await client.query(query, params);
      
      res.json({
        notifications: result.rows,
        total: result.rowCount,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[NotificationRoutes] Get loan notifications failed:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

/**
 * GET /api/notifications/templates
 * Get available notification templates
 */
router.get('/templates', async (req, res) => {
  try {
    const { channel, locale = 'en-US' } = req.query;
    
    const client = await pool.connect();
    
    try {
      let query = `
        SELECT code, channel, subject, version, active, created_at
        FROM notification_templates 
        WHERE locale = $1 AND active = true
      `;
      
      const params: any[] = [locale];
      
      if (channel) {
        query += ' AND channel = $2';
        params.push(channel);
      }
      
      query += ' ORDER BY code, channel';
      
      const result = await client.query(query, params);
      
      res.json({
        templates: result.rows
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[NotificationRoutes] Get templates failed:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

/**
 * GET /api/notifications/worker/status
 * Get notification worker status
 */
router.get('/worker/status', async (req, res) => {
  try {
    const worker = getNotificationWorker();
    if (!worker) {
      return res.json({ 
        isRunning: false, 
        error: 'Worker not initialized' 
      });
    }
    
    res.json(worker.getStatus());
  } catch (error: any) {
    console.error('[NotificationRoutes] Get worker status failed:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

/**
 * POST /api/notifications/preview
 * Preview notification template rendering
 */
router.post('/preview', async (req, res) => {
  try {
    const {
      template_code,
      channel,
      locale = 'en-US',
      params = {}
    } = req.body;

    if (!template_code || !channel) {
      return res.status(400).json({ 
        error: 'Missing required fields: template_code, channel' 
      });
    }

    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT subject, body, version
        FROM notification_templates 
        WHERE code = $1 AND channel = $2 AND locale = $3 AND active = true
        ORDER BY created_at DESC LIMIT 1
      `, [template_code, channel, locale]);

      if (!result.rowCount) {
        return res.status(404).json({ 
          error: `Template not found: ${template_code}/${channel}/${locale}` 
        });
      }

      const template = result.rows[0];
      
      // Import renderTemplate here to avoid circular dependencies
      const { renderTemplate } = await import('../notifications/template');
      const rendered = renderTemplate(template.subject, template.body, params);
      
      res.json({
        template_code,
        channel,
        locale,
        version: template.version,
        rendered: {
          subject: rendered.subject,
          body: rendered.body
        }
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[NotificationRoutes] Preview failed:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

export { router as notificationRouter };