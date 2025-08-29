/**
 * Outbox Dispatcher Service
 * Publishes outbox messages to RabbitMQ with confirms and exponential backoff
 */

import { db } from '../db';
import { outboxMessages } from '@shared/schema';
import { eq, sql, and, or, isNull, lt } from 'drizzle-orm';
import { getEnhancedRabbitMQService } from './rabbitmq-enhanced';
import { exceptionCaseService } from './exception-case';

const enhancedRabbitMQService = getEnhancedRabbitMQService();

// Configuration
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 500;
const BASE_BACKOFF_MS = 1000; // 1 second
const MAX_BACKOFF_MS = 60000; // 1 minute
const DISPATCHER_INTERVAL_MS = 5000; // Run every 5 seconds

export class OutboxDispatcher {
  private isRunning = false;
  private intervalHandle: NodeJS.Timeout | null = null;

  // Calculate exponential backoff with jitter
  private calculateBackoff(attemptCount: number): number {
    const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, attemptCount), MAX_BACKOFF_MS);
    // Add jitter (±25%)
    const jitter = backoff * 0.25 * (Math.random() - 0.5);
    return Math.round(backoff + jitter);
  }

  // Get unpublished messages ready for dispatch
  private async getUnpublishedRows(limit: number) {
    const now = new Date();
    
    // Get messages that:
    // 1. Have never been published (publishedAt is null)
    // 2. Haven't exceeded max attempts
    // 3. Are past their backoff period (nextRetryAt is null or in the past)
    const messages = await db
      .select()
      .from(outboxMessages)
      .where(
        and(
          isNull(outboxMessages.publishedAt),
          lt(outboxMessages.attemptCount, MAX_ATTEMPTS),
          or(
            isNull(outboxMessages.nextRetryAt),
            lt(outboxMessages.nextRetryAt, now)
          )
        )
      )
      .orderBy(sql`${outboxMessages.createdAt} ASC`)
      .limit(limit);

    return messages;
  }

  // Mark message as successfully published
  private async markPublished(messageId: string) {
    await db
      .update(outboxMessages)
      .set({
        publishedAt: new Date(),
        lastError: null
      })
      .where(eq(outboxMessages.id, messageId));
    
    console.log(`[OutboxDispatcher] Message ${messageId} published successfully`);
  }

  // Handle publish failure
  private async handlePublishFailure(messageId: string, error: Error) {
    const message = await db
      .select()
      .from(outboxMessages)
      .where(eq(outboxMessages.id, messageId))
      .limit(1);

    if (message.length === 0) return;

    const currentAttempts = message[0].attemptCount + 1;
    const nextRetryAt = new Date(Date.now() + this.calculateBackoff(currentAttempts));

    if (currentAttempts >= MAX_ATTEMPTS) {
      // Max attempts exceeded - send to DLQ and mark as failed
      await this.sendToDLQ(message[0], error);
      
      await db
        .update(outboxMessages)
        .set({
          attemptCount: currentAttempts,
          lastError: `Max attempts (${MAX_ATTEMPTS}) exceeded: ${error.message}`,
          nextRetryAt: null // Stop retrying
        })
        .where(eq(outboxMessages.id, messageId));

      // Open exception case
      await this.openExceptionCase(message[0], error);
      
      console.error(`[OutboxDispatcher] Message ${messageId} failed after ${MAX_ATTEMPTS} attempts, sent to DLQ`);
    } else {
      // Increment attempt count and set backoff
      await db
        .update(outboxMessages)
        .set({
          attemptCount: currentAttempts,
          lastError: error.message,
          nextRetryAt
        })
        .where(eq(outboxMessages.id, messageId));

      console.warn(`[OutboxDispatcher] Message ${messageId} failed (attempt ${currentAttempts}/${MAX_ATTEMPTS}), retrying at ${nextRetryAt.toISOString()}`);
    }
  }

  // Send failed message to DLQ
  private async sendToDLQ(message: any, error: Error) {
    try {
      const channel = await enhancedRabbitMQService.getChannel();
      if (!channel) {
        console.error('[OutboxDispatcher] No channel available for DLQ');
        return;
      }

      const dlqMessage = {
        originalMessage: message,
        failureReason: error.message,
        failedAt: new Date().toISOString(),
        attempts: message.attemptCount,
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        eventType: message.eventType
      };

      // Publish to DLQ exchange
      await channel.publish(
        'payments.dlq',
        message.eventType || 'unknown',
        Buffer.from(JSON.stringify(dlqMessage)),
        {
          persistent: true,
          timestamp: Date.now(),
          headers: {
            'x-failure-reason': error.message,
            'x-original-event-type': message.eventType,
            'x-aggregate-id': message.aggregateId,
            'x-attempts': message.attemptCount
          }
        }
      );

      console.log(`[OutboxDispatcher] Message ${message.id} sent to DLQ`);
    } catch (dlqError) {
      console.error('[OutboxDispatcher] Failed to send message to DLQ:', dlqError);
    }
  }

  // Open exception case for failed message
  private async openExceptionCase(message: any, error: Error) {
    // Log the exception case (in production, this would create a case in your case management system)
    console.error('[OutboxDispatcher] Opening exception case:', {
      messageId: message.id,
      eventType: message.eventType,
      aggregateType: message.aggregateType,
      aggregateId: message.aggregateId,
      failureReason: error.message,
      attempts: message.attemptCount,
      payload: message.payload
    });

    // In production, you would integrate with your case management system here
    // For example: await caseManagementService.createCase({...})
  }


  // Main dispatch loop
  async dispatchOutbox(): Promise<void> {
    try {
      // Get unpublished messages
      const messages = await this.getUnpublishedRows(BATCH_SIZE);
      
      if (messages.length === 0) {
        return; // No messages to process
      }

      console.log(`[OutboxDispatcher] Processing ${messages.length} messages`);

      // Process messages sequentially to maintain order
      for (const message of messages) {
        try {
          // Use the enhanced service to publish with confirms
          const envelope = {
            message_id: message.id,
            correlation_id: message.payload?.correlation_id || message.id,
            schema: '1.0',
            payload: message.payload,
            metadata: {
              aggregate_type: message.aggregateType,
              aggregate_id: message.aggregateId,
              event_type: message.eventType,
              source: 'outbox-dispatcher'
            },
            priority: 0,
            trace_id: message.payload?.trace_id || message.id
          };

          // Map events to exchanges and routing keys
          let exchange: string;
          let routingKey: string;

          if (message.eventType?.startsWith('payment.')) {
            exchange = 'payments.topic';
            routingKey = message.eventType;
          } else if (message.eventType?.startsWith('crm.email.')) {
            exchange = 'crm.email.topic';
            routingKey = message.eventType;
          } else {
            exchange = 'events.topic';
            routingKey = message.eventType || 'generic';
          }

          const success = await enhancedRabbitMQService.publish(envelope, {
            exchange,
            routingKey,
            persistent: true,
            mandatory: true,
            headers: {
              'x-aggregate-type': message.aggregateType,
              'x-aggregate-id': message.aggregateId,
              'x-event-type': message.eventType
            }
          });
          
          if (success) {
            await this.markPublished(message.id);
          } else {
            throw new Error('Publish returned false - message not confirmed');
          }
        } catch (error: any) {
          // Handle RabbitMQ not connected error gracefully
          if (error.message === 'RabbitMQ not connected') {
            console.log('[OutboxDispatcher] RabbitMQ not connected, will retry later');
            break; // Stop processing this batch
          }
          await this.handlePublishFailure(message.id, error);
        }
      }

      console.log(`[OutboxDispatcher] Batch processing complete`);
    } catch (error) {
      console.error('[OutboxDispatcher] Error in dispatch loop:', error);
    }
  }

  // Start the dispatcher
  start(): void {
    if (this.isRunning) {
      console.log('[OutboxDispatcher] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[OutboxDispatcher] Starting with interval:', DISPATCHER_INTERVAL_MS, 'ms');

    // Run immediately on start
    this.dispatchOutbox().catch(console.error);

    // Set up interval
    this.intervalHandle = setInterval(() => {
      this.dispatchOutbox().catch(console.error);
    }, DISPATCHER_INTERVAL_MS);
  }

  // Stop the dispatcher
  stop(): void {
    if (!this.isRunning) {
      console.log('[OutboxDispatcher] Not running');
      return;
    }

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.isRunning = false;
    console.log('[OutboxDispatcher] Stopped');
  }

  // Get dispatcher status
  getStatus(): { isRunning: boolean; interval: number; maxAttempts: number } {
    return {
      isRunning: this.isRunning,
      interval: DISPATCHER_INTERVAL_MS,
      maxAttempts: MAX_ATTEMPTS
    };
  }

  // Manually trigger dispatch (for testing or manual intervention)
  async triggerDispatch(): Promise<void> {
    console.log('[OutboxDispatcher] Manual dispatch triggered');
    await this.dispatchOutbox();
  }
}

// Export singleton instance
export const outboxDispatcher = new OutboxDispatcher();