import { db } from '../db';
import { outboxMessages } from '@shared/schema';
import { eq, isNull, and, lte } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { getEnhancedRabbitMQService } from '../rabbitmq/enhanced-rabbitmq-service';

export interface OutboxMessage {
  id?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: any;
  createdAt?: Date;
  publishedAt?: Date | null;
  attemptCount?: number;
  lastError?: string | null;
}

export class OutboxService {
  /**
   * Create an outbox message within a transaction
   * This ensures the message is only created if the transaction commits
   */
  async createMessage(
    message: OutboxMessage,
    trx?: typeof db
  ): Promise<OutboxMessage> {
    const dbContext = trx || db;
    
    const [created] = await dbContext.insert(outboxMessages).values({
      aggregateType: message.aggregateType,
      aggregateId: message.aggregateId,
      eventType: message.eventType,
      payload: message.payload,
      attemptCount: 0
    }).returning();

    console.log(`[Outbox] Created message: ${created.id} for ${message.aggregateType}/${message.aggregateId} event: ${message.eventType}`);
    return created as OutboxMessage;
  }

  /**
   * Poll for unpublished messages
   * Returns messages ordered by creation time (oldest first)
   */
  async pollUnpublishedMessages(limit: number = 100): Promise<OutboxMessage[]> {
    const messages = await db
      .select()
      .from(outboxMessages)
      .where(isNull(outboxMessages.publishedAt))
      .orderBy(outboxMessages.createdAt)
      .limit(limit);

    return messages as OutboxMessage[];
  }

  /**
   * Mark a message as published
   */
  async markPublished(messageId: string): Promise<void> {
    await db
      .update(outboxMessages)
      .set({
        publishedAt: new Date(),
        lastError: null
      })
      .where(eq(outboxMessages.id, messageId));

    console.log(`[Outbox] Marked message ${messageId} as published`);
  }

  /**
   * Record a publish attempt failure
   */
  async recordFailure(messageId: string, error: string): Promise<void> {
    const [message] = await db
      .select({ attemptCount: outboxMessages.attemptCount })
      .from(outboxMessages)
      .where(eq(outboxMessages.id, messageId));

    if (!message) {
      console.error(`[Outbox] Message ${messageId} not found`);
      return;
    }

    await db
      .update(outboxMessages)
      .set({
        attemptCount: (message.attemptCount || 0) + 1,
        lastError: error
      })
      .where(eq(outboxMessages.id, messageId));

    console.error(`[Outbox] Failed to publish message ${messageId}: ${error}`);
  }

  /**
   * Get messages that have failed but can be retried
   */
  async getRetryableMessages(maxAttempts: number = 3): Promise<OutboxMessage[]> {
    const messages = await db
      .select()
      .from(outboxMessages)
      .where(
        and(
          isNull(outboxMessages.publishedAt),
          lte(outboxMessages.attemptCount, maxAttempts)
        )
      )
      .orderBy(outboxMessages.createdAt);

    return messages as OutboxMessage[];
  }

  /**
   * Transactional helper: Create payment and outbox message together
   * This ensures both are created atomically
   */
  async createPaymentWithEvent(
    paymentData: any,
    eventType: string,
    eventPayload: any
  ): Promise<{ paymentId: string; outboxMessageId: string }> {
    return await db.transaction(async (trx) => {
      // Simulate creating a payment (would use actual payment table)
      const paymentId = crypto.randomUUID();
      
      // Create outbox message in same transaction
      const outboxMessage = await this.createMessage({
        aggregateType: 'payments',
        aggregateId: paymentId,
        eventType,
        payload: {
          ...eventPayload,
          paymentId,
          timestamp: new Date().toISOString()
        }
      }, trx);

      console.log(`[Outbox] Created payment ${paymentId} with outbox message ${outboxMessage.id} in transaction`);
      
      return {
        paymentId,
        outboxMessageId: outboxMessage.id!
      };
    });
  }

  /**
   * Process and publish messages to RabbitMQ
   */
  async processOutboxMessages(): Promise<number> {
    const messages = await this.pollUnpublishedMessages();
    let publishedCount = 0;

    for (const message of messages) {
      try {
        // Map event type to RabbitMQ routing
        const routingKey = this.getRoutingKey(message.eventType);
        const exchange = this.getExchange(message.aggregateType);

        // Publish to RabbitMQ
        await rabbitmqService.publishMessage(
          exchange,
          routingKey,
          message.payload
        );

        // Mark as published
        await this.markPublished(message.id!);
        publishedCount++;
        
        console.log(`[Outbox] Published message ${message.id} to ${exchange}/${routingKey}`);
      } catch (error: any) {
        await this.recordFailure(message.id!, error.message);
        console.error(`[Outbox] Failed to publish message ${message.id}:`, error);
      }
    }

    if (publishedCount > 0) {
      console.log(`[Outbox] Successfully published ${publishedCount} messages`);
    }

    return publishedCount;
  }

  /**
   * Map event types to RabbitMQ routing keys
   */
  private getRoutingKey(eventType: string): string {
    const mappings: Record<string, string> = {
      'payment.posted': 'payment.posted',
      'payment.validated': 'payment.validated',
      'payment.reversed': 'payment.reversed',
      'payment.distributed': 'payment.distributed'
    };

    return mappings[eventType] || eventType;
  }

  /**
   * Map aggregate types to RabbitMQ exchanges
   */
  private getExchange(aggregateType: string): string {
    const mappings: Record<string, string> = {
      'payments': 'payments.topic',
      'settlements': 'settlement.topic',
      'reconciliations': 'reconciliation.topic'
    };

    return mappings[aggregateType] || 'events.topic';
  }

  /**
   * Clean up old published messages
   */
  async cleanupPublishedMessages(daysToKeep: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await db
      .delete(outboxMessages)
      .where(
        and(
          lte(outboxMessages.publishedAt, cutoffDate),
          // Only delete if actually published
          eq(isNull(outboxMessages.publishedAt), false) as SQL<boolean>
        )
      );

    console.log(`[Outbox] Cleaned up old messages older than ${cutoffDate.toISOString()}`);
    return 0; // Drizzle doesn't return count directly
  }
}