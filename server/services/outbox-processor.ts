/**
 * Outbox Processor Service
 * Processes outbox messages and publishes them to RabbitMQ
 */

import { pool } from '../db';
import { getEnhancedRabbitMQService } from './rabbitmq-enhanced';
import { sql } from 'drizzle-orm';

export class OutboxProcessor {
  private rabbitmq = getEnhancedRabbitMQService();
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Start processing outbox messages
   */
  async start(intervalMs: number = 5000): Promise<void> {
    if (this.isRunning) {
      console.log('[OutboxProcessor] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[OutboxProcessor] Starting outbox processor...');

    // Process immediately on start
    await this.processOutbox();

    // Then process at intervals
    this.intervalId = setInterval(async () => {
      try {
        await this.processOutbox();
      } catch (error) {
        console.error('[OutboxProcessor] Error processing outbox:', error);
      }
    }, intervalMs);

    console.log(`[OutboxProcessor] Started with ${intervalMs}ms interval`);
  }

  /**
   * Stop processing
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('[OutboxProcessor] Stopped');
  }

  /**
   * Process pending outbox messages
   */
  private async processOutbox(): Promise<void> {
    let client;
    try {
      client = await pool.connect();
    } catch (error) {
      console.error('[OutboxProcessor] Failed to get database connection:', error);
      return;
    }
    
    try {
      // Begin transaction
      await client.query('BEGIN');

      // Get unpublished messages (up to 100 at a time)
      const result = await client.query(`
        SELECT id, aggregate_type, aggregate_id, schema, routing_key, 
               payload, headers
        FROM outbox
        WHERE published_at IS NULL
        ORDER BY created_at
        LIMIT 100
        FOR UPDATE SKIP LOCKED
      `);

      if (result.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      console.log(`[OutboxProcessor] Processing ${result.rows.length} messages`);

      // Process each message
      for (const row of result.rows) {
        try {
          // pg library returns JSONB columns as objects already
          const envelope = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          const headers = row.headers ? (typeof row.headers === 'string' ? JSON.parse(row.headers) : row.headers) : {};

          // Determine exchange based on routing key
          let exchange = 'payments.topic'; // Default
          
          if (row.routing_key.startsWith('document.')) {
            exchange = 'documents.direct';
          } else if (row.routing_key.startsWith('notification.')) {
            exchange = 'notifications.topic';
          } else if (row.routing_key.startsWith('escrow.')) {
            exchange = 'escrow.workflow';
          } else if (row.routing_key.startsWith('compliance.')) {
            exchange = 'compliance.topic';
          } else if (row.routing_key.startsWith('settlement.')) {
            exchange = 'settlement.topic';
          } else if (row.routing_key.startsWith('reconciliation.')) {
            exchange = 'reconciliation.topic';
          } else if (row.routing_key.startsWith('bank.')) {
            exchange = 'bank.topic';
          } else if (row.routing_key.startsWith('aml.')) {
            exchange = 'aml.topic';
          } else if (row.routing_key.startsWith('investor.')) {
            exchange = 'investor.direct';
          } else if (row.routing_key.startsWith('audit.')) {
            exchange = 'audit.topic';
          }

          // Publish to RabbitMQ
          await this.rabbitmq.publish(envelope, {
            exchange,
            routingKey: row.routing_key,
            persistent: true,
            headers
          });

          // Mark as published
          await client.query(
            'UPDATE outbox SET published_at = NOW() WHERE id = $1',
            [row.id]
          );

          console.log(`[OutboxProcessor] Published message ${row.id} to ${exchange}/${row.routing_key}`);
        } catch (error) {
          console.error(`[OutboxProcessor] Failed to publish message ${row.id}:`, error);
          // Continue with other messages
        }
      }

      // Commit transaction
      await client.query('COMMIT');

      // Clean up old published messages (older than 7 days)
      await client.query(`
        DELETE FROM outbox 
        WHERE published_at IS NOT NULL 
        AND published_at < NOW() - INTERVAL '7 days'
      `);

    } catch (error) {
      console.error('[OutboxProcessor] Transaction failed, rolling back:', error);
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[OutboxProcessor] Rollback failed:', rollbackError);
      }
      // Don't throw - just log and continue
    } finally {
      if (client) {
        try {
          client.release();
        } catch (releaseError) {
          console.error('[OutboxProcessor] Failed to release connection:', releaseError);
        }
      }
    }
  }
}