/**
 * Column Bank Webhook Adapter
 * 
 * Handles real-time Column Bank events via webhooks
 * Normalizes to payment envelopes and publishes to RabbitMQ
 * 
 * Per 25-Step Implementation Specification
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { paymentIngestions, paymentEvents, outboxMessages } from '@shared/schema';
import { PaymentEnvelopeNormalizer, PaymentEnvelopeValidator } from './payment-envelope';
import { getRabbitMQService } from './rabbitmq-enhanced';
import { eq } from 'drizzle-orm';

// ========================================
// WEBHOOK SECURITY
// ========================================

export class ColumnWebhookSecurity {
  private static readonly WEBHOOK_SECRET = process.env.COLUMN_WEBHOOK_SECRET || '';

  /**
   * Verify webhook signature from Column
   */
  static verifySignature(
    payload: string,
    signature: string,
    timestamp: string
  ): boolean {
    if (!this.WEBHOOK_SECRET) {
      console.error('[ColumnWebhook] No webhook secret configured');
      return false;
    }

    const message = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.WEBHOOK_SECRET)
      .update(message)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Prevent replay attacks by checking timestamp
   */
  static isTimestampValid(timestamp: string, maxAgeSeconds = 300): boolean {
    const webhookTime = parseInt(timestamp);
    const currentTime = Math.floor(Date.now() / 1000);
    
    return currentTime - webhookTime <= maxAgeSeconds;
  }
}

// ========================================
// WEBHOOK EVENT TYPES
// ========================================

export enum ColumnWebhookEventType {
  // Transfer events
  TRANSFER_CREATED = 'transfer.created',
  TRANSFER_UPDATED = 'transfer.updated',
  TRANSFER_COMPLETED = 'transfer.completed',
  TRANSFER_FAILED = 'transfer.failed',
  TRANSFER_CANCELLED = 'transfer.cancelled',
  
  // ACH specific
  ACH_TRANSFER_CREATED = 'ach_transfer.created',
  ACH_TRANSFER_COMPLETED = 'ach_transfer.completed',
  ACH_TRANSFER_RETURNED = 'ach_transfer.returned',
  
  // Wire specific  
  WIRE_TRANSFER_CREATED = 'wire_transfer.created',
  WIRE_TRANSFER_COMPLETED = 'wire_transfer.completed',
  WIRE_TRANSFER_FAILED = 'wire_transfer.failed',
  
  // Account events
  ACCOUNT_UPDATED = 'account.updated',
  ACCOUNT_BALANCE_CHANGED = 'account.balance_changed',
  
  // Entity events
  ENTITY_CREATED = 'entity.created',
  ENTITY_UPDATED = 'entity.updated',
}

// ========================================
// WEBHOOK PROCESSOR
// ========================================

export class ColumnWebhookProcessor {
  private rabbitMQ = getRabbitMQService();

  /**
   * Process incoming webhook from Column
   */
  async processWebhook(webhook: {
    id: string;
    type: string;
    data: any;
    created_at: string;
  }): Promise<{
    success: boolean;
    paymentIngestionId?: string;
    error?: string;
  }> {
    console.log(`[ColumnWebhook] Processing ${webhook.type} webhook ${webhook.id}`);

    try {
      // Check if this is a payment-related webhook
      if (!this.isPaymentWebhook(webhook.type)) {
        console.log(`[ColumnWebhook] Skipping non-payment webhook ${webhook.type}`);
        return { success: true }; // Successfully processed, but no payment to ingest
      }

      // Normalize to payment envelope
      const envelope = PaymentEnvelopeNormalizer.fromColumnWebhook(webhook);
      if (!envelope) {
        return { 
          success: false, 
          error: 'Failed to normalize webhook to payment envelope' 
        };
      }

      // Validate envelope
      const validation = PaymentEnvelopeValidator.validate(envelope);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`
        };
      }

      // Store in payment_ingestions table with UUID
      const [ingestion] = await db.insert(paymentIngestions).values({
        idempotencyKey: envelope.idempotencyKey,
        channel: 'column_webhook',
        rawPayload: webhook,
        normalizedEnvelope: envelope,
        columnTransferId: webhook.data.id,
        status: 'pending',
        loanId: envelope.loanId,
        amountCents: envelope.amountCents,
        valueDate: envelope.valueDate,
        receivedAt: new Date(webhook.created_at),
      }).returning();

      // Create payment event with hash chain
      await this.createPaymentEvent(ingestion.id, {
        eventType: 'WEBHOOK_RECEIVED',
        eventData: {
          webhookType: webhook.type,
          columnTransferId: webhook.data.id,
          amount: envelope.amountCents / 100,
        },
        actorId: 'column_webhook_adapter',
      });

      // Add to outbox for RabbitMQ publishing
      await db.insert(outboxMessages).values({
        aggregateId: ingestion.id,
        aggregateType: 'payment_ingestion',
        eventType: 'payment.ingested',
        payload: {
          ingestionId: ingestion.id,
          envelope,
          webhookType: webhook.type,
        },
        destination: 'rabbitmq',
        status: 'pending',
      });

      // Publish to RabbitMQ
      await this.publishToRabbitMQ(ingestion.id, envelope, webhook);

      // Update ingestion status
      await db.update(paymentIngestions)
        .set({ 
          status: 'processing',
          processedAt: new Date() 
        })
        .where(eq(paymentIngestions.id, ingestion.id));

      console.log(`[ColumnWebhook] Successfully processed webhook ${webhook.id} -> ingestion ${ingestion.id}`);
      return { 
        success: true, 
        paymentIngestionId: ingestion.id 
      };

    } catch (error) {
      console.error('[ColumnWebhook] Processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if webhook is payment-related
   */
  private isPaymentWebhook(type: string): boolean {
    const paymentTypes = [
      ColumnWebhookEventType.TRANSFER_COMPLETED,
      ColumnWebhookEventType.TRANSFER_FAILED,
      ColumnWebhookEventType.ACH_TRANSFER_COMPLETED,
      ColumnWebhookEventType.ACH_TRANSFER_RETURNED,
      ColumnWebhookEventType.WIRE_TRANSFER_COMPLETED,
      ColumnWebhookEventType.WIRE_TRANSFER_FAILED,
    ];
    
    return paymentTypes.includes(type as ColumnWebhookEventType);
  }

  /**
   * Create hash-chained payment event
   */
  private async createPaymentEvent(
    paymentIngestionId: string,
    event: {
      eventType: string;
      eventData: any;
      actorId: string;
      confidenceScore?: number;
    }
  ): Promise<void> {
    // Get previous event hash for chaining
    const [previousEvent] = await db
      .select({ eventHash: paymentEvents.eventHash })
      .from(paymentEvents)
      .orderBy(paymentEvents.createdAt)
      .limit(1);

    const prevHash = previousEvent?.eventHash || '0'.repeat(64);
    
    // Calculate event hash
    const eventContent = JSON.stringify({
      paymentIngestionId,
      ...event,
      prevHash,
      timestamp: new Date().toISOString(),
    });
    
    const eventHash = crypto
      .createHash('sha256')
      .update(eventContent)
      .digest('hex');

    // Insert event
    await db.insert(paymentEvents).values({
      paymentIngestionId,
      eventType: event.eventType,
      eventData: event.eventData,
      actorId: event.actorId,
      confidenceScore: event.confidenceScore?.toString(),
      prevEventHash: prevHash,
      eventHash,
    });
  }

  /**
   * Publish payment to RabbitMQ for processing
   */
  private async publishToRabbitMQ(
    ingestionId: string,
    envelope: any,
    webhook: any
  ): Promise<void> {
    try {
      // Publish to validation queue
      await this.rabbitMQ.publishToQueue('payments.validation', {
        ingestionId,
        envelope,
        source: 'column_webhook',
        webhookType: webhook.type,
        timestamp: new Date().toISOString(),
      });

      // Also publish to payments.events exchange for event sourcing
      await this.rabbitMQ.publishToExchange('payments.events', 'payment.webhook.received', {
        ingestionId,
        webhookId: webhook.id,
        webhookType: webhook.type,
        columnTransferId: webhook.data.id,
        amount: envelope.amountCents / 100,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('[ColumnWebhook] Failed to publish to RabbitMQ:', error);
      throw error;
    }
  }

  /**
   * Handle ACH return webhook
   */
  async handleACHReturn(webhook: {
    id: string;
    data: {
      id: string;
      return_code: string;
      return_reason: string;
      original_transfer_id: string;
    };
    created_at: string;
  }): Promise<void> {
    console.log(`[ColumnWebhook] Processing ACH return ${webhook.data.return_code}`);

    // Find original payment
    const [originalIngestion] = await db
      .select()
      .from(paymentIngestions)
      .where(eq(paymentIngestions.columnTransferId, webhook.data.original_transfer_id))
      .limit(1);

    if (!originalIngestion) {
      console.error(`[ColumnWebhook] Original transfer not found: ${webhook.data.original_transfer_id}`);
      return;
    }

    // Create return event
    await this.createPaymentEvent(originalIngestion.id, {
      eventType: 'ACH_RETURNED',
      eventData: {
        returnCode: webhook.data.return_code,
        returnReason: webhook.data.return_reason,
        originalTransferId: webhook.data.original_transfer_id,
      },
      actorId: 'column_webhook_adapter',
    });

    // Publish return event to RabbitMQ
    await this.rabbitMQ.publishToExchange('payments.events', 'payment.ach.returned', {
      ingestionId: originalIngestion.id,
      returnCode: webhook.data.return_code,
      returnReason: webhook.data.return_reason,
      timestamp: new Date().toISOString(),
    });

    // Update payment status
    await db.update(paymentIngestions)
      .set({ 
        status: 'returned',
        errorMessage: `ACH Return: ${webhook.data.return_code} - ${webhook.data.return_reason}`,
        updatedAt: new Date()
      })
      .where(eq(paymentIngestions.id, originalIngestion.id));
  }
}

// ========================================
// EXPRESS MIDDLEWARE
// ========================================

export class ColumnWebhookMiddleware {
  /**
   * Express middleware for handling Column webhooks
   */
  static async handleWebhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Get signature headers
      const signature = req.headers['column-signature'] as string;
      const timestamp = req.headers['column-timestamp'] as string;

      if (!signature || !timestamp) {
        res.status(401).json({ error: 'Missing webhook signature headers' });
        return;
      }

      // Verify timestamp to prevent replay attacks
      if (!ColumnWebhookSecurity.isTimestampValid(timestamp)) {
        res.status(401).json({ error: 'Webhook timestamp too old' });
        return;
      }

      // Verify signature
      const payload = JSON.stringify(req.body);
      if (!ColumnWebhookSecurity.verifySignature(payload, signature, timestamp)) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }

      // Process webhook
      const processor = new ColumnWebhookProcessor();
      const webhook = {
        id: req.body.id || crypto.randomUUID(),
        type: req.body.type,
        data: req.body.data,
        created_at: req.body.created_at || new Date().toISOString(),
      };

      // Handle specific webhook types
      if (webhook.type === ColumnWebhookEventType.ACH_TRANSFER_RETURNED) {
        await processor.handleACHReturn(webhook);
      } else {
        const result = await processor.processWebhook(webhook);
        
        if (!result.success) {
          console.error('[ColumnWebhook] Processing failed:', result.error);
          res.status(500).json({ error: result.error });
          return;
        }
      }

      // Return success
      res.status(200).json({ 
        success: true,
        message: 'Webhook processed successfully'
      });

    } catch (error) {
      console.error('[ColumnWebhook] Middleware error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      });
    }
  }

  /**
   * Test endpoint for webhook (development only)
   */
  static async testWebhook(
    req: Request,
    res: Response
  ): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Test endpoint disabled in production' });
      return;
    }

    const processor = new ColumnWebhookProcessor();
    const testWebhook = {
      id: `test_${Date.now()}`,
      type: ColumnWebhookEventType.ACH_TRANSFER_COMPLETED,
      data: {
        id: `col_transfer_${Date.now()}`,
        amount: 1500.00,
        currency: 'USD',
        status: 'completed',
        counterparty_name: 'Test Payer',
      },
      created_at: new Date().toISOString(),
    };

    const result = await processor.processWebhook(testWebhook);
    res.json(result);
  }
}