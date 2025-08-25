/**
 * Outbox Publisher Service
 * Polls the outbox table and publishes messages to RabbitMQ
 */

import { pool } from '../db';
import { getEnhancedRabbitMQService } from './rabbitmq-enhanced';
import { PaymentEnvelope } from '../messaging/payment-envelope';

export class OutboxPublisher {
  private isRunning = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds
  private readonly BATCH_SIZE = 100;
  private readonly MAX_RETRIES = 5;

  /**
   * Start the outbox publisher
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[OutboxPublisher] Already running');
      return;
    }

    console.log('[OutboxPublisher] Starting outbox publisher...');
    this.isRunning = true;

    // Start polling
    this.pollingInterval = setInterval(async () => {
      try {
        await this.processOutboxMessages();
      } catch (error) {
        console.error('[OutboxPublisher] Error processing outbox messages:', error);
      }
    }, this.POLLING_INTERVAL_MS);

    // Process immediately on start
    await this.processOutboxMessages();
  }

  /**
   * Stop the outbox publisher
   */
  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isRunning = false;
    console.log('[OutboxPublisher] Stopped');
  }

  /**
   * Process unpublished messages from the outbox
   */
  private async processOutboxMessages(): Promise<void> {
    const client = await pool.connect();
    
    try {
      // Begin transaction for batch processing
      await client.query('BEGIN');

      // Select unpublished messages that are ready for retry
      const result = await client.query(`
        SELECT id, aggregate_type, aggregate_id, schema, routing_key, 
               payload, headers, attempt_count
        FROM outbox
        WHERE published_at IS NULL
          AND attempt_count < $1
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        ORDER BY created_at
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      `, [this.MAX_RETRIES, this.BATCH_SIZE]);

      if (result.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      console.log(`[OutboxPublisher] Processing ${result.rows.length} messages`);

      const rabbitMQ = getEnhancedRabbitMQService();
      const processedIds: number[] = [];
      const failedMessages: { id: number; error: string }[] = [];

      // Process each message
      for (const row of result.rows) {
        try {
          const envelope = row.payload as PaymentEnvelope<any>;
          const headers = row.headers || {};

          // Publish to RabbitMQ
          await rabbitMQ.publish(
            'payments.topic',
            row.routing_key,
            envelope,
            { headers }
          );

          processedIds.push(row.id);
        } catch (error: any) {
          console.error(`[OutboxPublisher] Failed to publish message ${row.id}:`, error);
          failedMessages.push({
            id: row.id,
            error: error.message || 'Unknown error'
          });
        }
      }

      // Mark successfully published messages
      if (processedIds.length > 0) {
        await client.query(`
          UPDATE outbox
          SET published_at = NOW()
          WHERE id = ANY($1::int[])
        `, [processedIds]);
        
        console.log(`[OutboxPublisher] Published ${processedIds.length} messages`);
      }

      // Update failed messages with retry information
      for (const failed of failedMessages) {
        const nextRetry = this.calculateNextRetry(failed.id);
        await client.query(`
          UPDATE outbox
          SET attempt_count = attempt_count + 1,
              last_error = $1,
              next_retry_at = $2
          WHERE id = $3
        `, [failed.error, nextRetry, failed.id]);
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate next retry time using exponential backoff
   */
  private calculateNextRetry(attemptCount: number): Date {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
    const delayMs = Math.min(1000 * Math.pow(2, attemptCount), 60000); // Max 60 seconds
    return new Date(Date.now() + delayMs);
  }

  /**
   * Clean up old published messages (optional maintenance task)
   */
  async cleanupOldMessages(daysToKeep: number = 7): Promise<void> {
    const result = await pool.query(`
      DELETE FROM outbox
      WHERE published_at IS NOT NULL
        AND published_at < NOW() - INTERVAL '${daysToKeep} days'
    `);

    console.log(`[OutboxPublisher] Cleaned up ${result.rowCount} old messages`);
  }
}

// Singleton instance
let outboxPublisher: OutboxPublisher | null = null;

export function getOutboxPublisher(): OutboxPublisher {
  if (!outboxPublisher) {
    outboxPublisher = new OutboxPublisher();
  }
  return outboxPublisher;
}