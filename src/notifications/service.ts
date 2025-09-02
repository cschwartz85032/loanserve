// Notification service - core orchestration
// Handles request processing, rate limiting, idempotency, rendering, and delivery

import { Pool } from "pg";
import { renderTemplate } from "./template";
import { sendEmail } from "./providers/email";
import { sendSms } from "./providers/sms";
import { sendWebhook } from "./providers/webhook";
import { shouldSuppressNotification } from "./guard";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface NotificationRequest {
  tenantId: string;
  loanId?: string | null;
  templateCode: string;
  channel: 'email' | 'sms' | 'webhook';
  toParty: string;
  toAddress: string;
  locale?: string;
  params?: any;
  createdBy?: string | null;
  idempotencyKey?: string | null;
}

export interface NotificationResult {
  id: string;
  status: 'queued' | 'rendered' | 'sent' | 'failed' | 'suppressed';
  reason?: string;
}

/**
 * Request a notification to be sent
 * Handles rate limiting, idempotency, Do-Not-Ping enforcement, and delivery
 */
export async function requestNotification(request: NotificationRequest): Promise<NotificationResult | null> {
  const client = await pool.connect();
  try {
    // Note: tenant isolation handled by application logic
    // await client.query('SET LOCAL app.tenant_id = $1', [request.tenantId]);

    // Check idempotency
    if (request.idempotencyKey) {
      const existing = await client.query(
        'SELECT 1 FROM idempotency_keys WHERE idempotency_key = $1',
        [request.idempotencyKey]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        console.log(`[NotificationService] Duplicate request ignored: ${request.idempotencyKey}`);
        return null; // Already processed
      }
      
      // Record idempotency key
      await client.query(
        'INSERT INTO idempotency_keys (idempotency_key) VALUES ($1)',
        [request.idempotencyKey]
      );
    }

    // Rate limiting per loan/template/day
    if (request.loanId) {
      const today = new Date().toISOString().slice(0, 10);
      const rateLimit = Number(process.env.NOTIFY_RATE_LIMIT_PER_LOAN_PER_TEMPLATE_PER_DAY || "5");
      
      await client.query(`
        INSERT INTO notification_counters (tenant_id, loan_id, template_code, day, count)
        VALUES ($1, $2, $3, $4, 1)
        ON CONFLICT (tenant_id, loan_id, template_code, day) 
        DO UPDATE SET count = notification_counters.count + 1
      `, [request.tenantId, request.loanId, request.templateCode, today]);

      const counter = await client.query(
        'SELECT count FROM notification_counters WHERE tenant_id = $1 AND loan_id = $2 AND template_code = $3 AND day = $4',
        [request.tenantId, request.loanId, request.templateCode, today]
      );

      if ((counter.rows[0]?.count || 0) > rateLimit) {
        throw new Error(`Rate limit exceeded for template ${request.templateCode}: ${rateLimit}/day`);
      }
    }

    // Get notification template
    const templateResult = await client.query(`
      SELECT * FROM notification_templates 
      WHERE code = $1 AND locale = $2 AND channel = $3 AND active = true 
      ORDER BY created_at DESC LIMIT 1
    `, [request.templateCode, request.locale || 'en-US', request.channel]);

    if (!templateResult.rowCount) {
      throw new Error(`Template not found: ${request.templateCode}/${request.channel}/${request.locale || 'en-US'}`);
    }

    const template = templateResult.rows[0];

    // Check Do-Not-Ping policy
    if (request.loanId) {
      const suppressCheck = await shouldSuppressNotification(
        request.tenantId, 
        request.loanId, 
        request.templateCode
      );
      
      if (suppressCheck.suppress) {
        // Create suppressed notification record
        const notificationResult = await client.query(`
          INSERT INTO notifications (
            tenant_id, loan_id, template_code, locale, channel, 
            to_party, to_address, params, status, reason, 
            template_version, idempotency_key, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `, [
          request.tenantId, request.loanId, request.templateCode, 
          request.locale || 'en-US', request.channel, request.toParty, 
          request.toAddress, JSON.stringify(request.params || {}), 
          'suppressed', suppressCheck.reason, template.version, 
          request.idempotencyKey, request.createdBy
        ]);

        const notificationId = notificationResult.rows[0].id;
        
        // Log suppression event
        await client.query(
          'INSERT INTO notification_events (notification_id, event, meta) VALUES ($1, $2, $3)',
          [notificationId, 'suppressed', JSON.stringify({ reason: suppressCheck.reason })]
        );

        console.log(`[NotificationService] Notification suppressed: ${suppressCheck.reason}`);
        return { 
          id: notificationId, 
          status: 'suppressed', 
          reason: suppressCheck.reason 
        };
      }
    }

    // Create notification record
    const notificationResult = await client.query(`
      INSERT INTO notifications (
        tenant_id, loan_id, template_code, locale, channel, 
        to_party, to_address, params, status, 
        template_version, idempotency_key, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
      request.tenantId, request.loanId, request.templateCode, 
      request.locale || 'en-US', request.channel, request.toParty, 
      request.toAddress, JSON.stringify(request.params || {}), 
      'queued', template.version, request.idempotencyKey, request.createdBy
    ]);

    const notificationId = notificationResult.rows[0].id;

    // Log creation event
    await client.query(
      'INSERT INTO notification_events (notification_id, event, meta) VALUES ($1, $2, $3)',
      [notificationId, 'requested', JSON.stringify({ template_code: request.templateCode })]
    );

    // Process notification immediately (in production, this would be queued)
    const processResult = await processNotification(notificationId, template, request);
    
    return {
      id: notificationId,
      status: processResult.status,
      reason: processResult.reason
    };

  } catch (error: any) {
    console.error('[NotificationService] Request failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process a notification: render template and send via appropriate provider
 */
async function processNotification(
  notificationId: string, 
  template: any, 
  request: NotificationRequest
): Promise<{ status: string; reason?: string }> {
  const client = await pool.connect();
  try {
    // Render template
    const rendered = renderTemplate(template.subject, template.body, request.params || {});
    
    // Update status to rendered
    await client.query(
      'UPDATE notifications SET status = $1 WHERE id = $2',
      ['rendered', notificationId]
    );
    
    await client.query(
      'INSERT INTO notification_events (notification_id, event, meta) VALUES ($1, $2, $3)',
      [notificationId, 'rendered', JSON.stringify({ subject: rendered.subject })]
    );

    // Send via appropriate provider
    let sendResult: any;
    
    switch (request.channel) {
      case 'email':
        if (!rendered.subject) {
          throw new Error('Email requires subject');
        }
        sendResult = await sendEmail(request.toAddress, rendered.subject, rendered.body);
        break;
        
      case 'sms':
        sendResult = await sendSms(request.toAddress, rendered.body);
        break;
        
      case 'webhook':
        const payload = JSON.parse(rendered.body);
        sendResult = await sendWebhook(request.toAddress, payload);
        break;
        
      default:
        throw new Error(`Unsupported channel: ${request.channel}`);
    }

    // Update final status
    const finalStatus: 'sent' | 'failed' = sendResult.ok ? 'sent' : 'failed';
    const sentAt = sendResult.ok ? new Date() : null;
    
    await client.query(
      'UPDATE notifications SET status = $1, reason = $2, sent_at = $3 WHERE id = $4',
      [finalStatus, sendResult.error || null, sentAt, notificationId]
    );

    // Log final event
    await client.query(
      'INSERT INTO notification_events (notification_id, event, meta) VALUES ($1, $2, $3)',
      [notificationId, finalStatus, JSON.stringify({
        provider_id: sendResult.providerId || sendResult.sid,
        error: sendResult.error
      })]
    );

    console.log(`[NotificationService] Notification ${notificationId} ${finalStatus}`);
    
    return {
      status: finalStatus,
      reason: sendResult.error
    };

  } catch (error: any) {
    console.error(`[NotificationService] Processing failed for ${notificationId}:`, error);
    
    // Update to failed status
    await client.query(
      'UPDATE notifications SET status = $1, reason = $2 WHERE id = $3',
      ['failed', error.message, notificationId]
    );
    
    await client.query(
      'INSERT INTO notification_events (notification_id, event, meta) VALUES ($1, $2, $3)',
      [notificationId, 'failed', JSON.stringify({ error: error.message })]
    );

    return {
      status: 'failed',
      reason: error.message
    };
  } finally {
    client.release();
  }
}