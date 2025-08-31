/**
 * Proper Column Webhook Handler
 * Raw HMAC verification with normalized envelopes and idempotency
 */

import crypto from 'crypto';
import { rabbitmqClient } from '../rabbitmq-unified';
import { createCanonicalEnvelope } from '../../../packages/shared/messaging/envelope';

export interface ColumnWebhookEvent {
  id: string;
  type: string;
  occurred_at: string;
  resource: any;
  data?: any;
}

export class ColumnWebhookService {
  private readonly secret: string;

  constructor() {
    this.secret = process.env.COLUMN_WEBHOOK_SECRET || '';
    if (!this.secret) {
      console.warn('[ColumnWebhook] COLUMN_WEBHOOK_SECRET not configured - webhook verification disabled');
    }
  }

  /**
   * Verify webhook signature using raw HMAC verification
   */
  verifySignature(rawBody: Buffer, signature: string, timestamp: string): boolean {
    if (!this.secret) {
      console.warn('[ColumnWebhook] Webhook verification skipped - no secret configured');
      return true; // Allow webhook processing without verification in development
    }

    try {
      // Column sends signature as "sha256=<hash>"
      const [algorithm, providedHash] = signature.split('=');
      if (algorithm !== 'sha256') {
        return false;
      }

      // Create payload for verification (timestamp + raw body)
      const payload = timestamp + rawBody.toString('utf8');
      
      // Calculate expected hash
      const expectedHash = crypto
        .createHmac('sha256', this.secret)
        .update(payload, 'utf8')
        .digest('hex');

      // Use timing-safe comparison
      return crypto.timingSafeEqual(
        Buffer.from(providedHash, 'hex'),
        Buffer.from(expectedHash, 'hex')
      );
    } catch (error) {
      console.error('[ColumnWebhook] Signature verification error:', error);
      return false;
    }
  }

  /**
   * Process webhook event with idempotency protection
   */
  async processWebhook(
    rawBody: Buffer,
    signature: string,
    timestamp: string,
    correlationId?: string
  ): Promise<void> {
    // Verify signature
    if (!this.verifySignature(rawBody, signature, timestamp)) {
      throw new Error('Invalid webhook signature');
    }

    // Check timestamp to prevent replay attacks (5 minute window)
    const webhookTime = parseInt(timestamp);
    const currentTime = Date.now();
    if (Math.abs(currentTime - webhookTime) > 300000) {
      throw new Error('Webhook timestamp expired');
    }

    // Parse event
    const event: ColumnWebhookEvent = JSON.parse(rawBody.toString('utf8'));
    
    // Normalize event to canonical format
    const normalizedEvent = this.normalizeColumnEvent(event);
    
    // Create canonical envelope
    const envelope = createCanonicalEnvelope(
      normalizedEvent,
      `column.webhook.${event.type}.v1`,
      {
        idempotency_key: event.id, // Use Column's event ID for idempotency
        correlation_id: correlationId || `column-${event.id}`,
        producer: {
          service: 'column-webhook-handler',
          instance: process.env.HOSTNAME || 'unknown',
          version: '1.0.0'
        },
        trace_id: correlationId
      }
    );

    // Publish to RabbitMQ with proper routing
    const rabbitmq = getEnhancedRabbitMQService();
    
    await rabbitmq.publish(envelope, {
      exchange: 'payments.topic',
      routingKey: `payment.webhook.column.${event.type}`,
      persistent: true,
      headers: {
        'x-idempotency-key': event.id,
        'x-event-type': event.type,
        'x-source': 'column'
      }
    });

    console.log(`[ColumnWebhook] Processed event ${event.id} of type ${event.type}`);
  }

  /**
   * Normalize Column event to standard payment event format
   */
  private normalizeColumnEvent(event: ColumnWebhookEvent): any {
    const baseEvent = {
      external_id: event.id,
      event_type: event.type,
      occurred_at: event.occurred_at,
      source: 'column',
      resource: event.resource
    };

    // Add type-specific normalization
    switch (event.type) {
      case 'payment.settled':
        return {
          ...baseEvent,
          payment_data: {
            amount_cents: event.resource?.amount || 0,
            currency: event.resource?.currency || 'USD',
            status: 'settled',
            reference: event.resource?.reference_id,
            account_id: event.resource?.account_id
          }
        };

      case 'payment.failed':
        return {
          ...baseEvent,
          payment_data: {
            amount_cents: event.resource?.amount || 0,
            currency: event.resource?.currency || 'USD',
            status: 'failed',
            failure_reason: event.resource?.failure_reason,
            reference: event.resource?.reference_id
          }
        };

      case 'transfer.completed':
        return {
          ...baseEvent,
          transfer_data: {
            amount_cents: event.resource?.amount || 0,
            currency: event.resource?.currency || 'USD',
            status: 'completed',
            from_account: event.resource?.from_account_id,
            to_account: event.resource?.to_account_id,
            reference: event.resource?.reference_id
          }
        };

      default:
        return baseEvent;
    }
  }
}

// Export singleton instance
export const columnWebhookService = new ColumnWebhookService();