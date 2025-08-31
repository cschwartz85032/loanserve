/**
 * Message Publisher Service
 * Wrapper around RabbitMQ for publishing events
 */

import { Pool, PoolClient } from 'pg';
import { rabbitmqClient, RabbitMQClient } from './rabbitmq-unified';
import { randomUUID } from 'crypto';

export interface PublishOptions {
  exchange: string;
  routingKey: string;
  message: any;
  correlationId?: string;
  priority?: number;
  persistent?: boolean;
}

export class MessagePublisher {
  private rabbitmq: RabbitMQClient | null = null;

  constructor(private pool: Pool) {}

  /**
   * Get or create RabbitMQ connection
   */
  private async getRabbitMQ(): Promise<RabbitMQClient> {
    if (!this.rabbitmq) {
      this.rabbitmq = rabbitmqClient;
    }
    return this.rabbitmq;
  }

  /**
   * Publish a message to RabbitMQ
   */
  async publish(options: PublishOptions): Promise<boolean> {
    try {
      const rabbitmq = await this.getRabbitMQ();
      
      const envelope = {
        message_id: randomUUID(),
        correlation_id: options.correlationId || randomUUID(),
        trace_id: randomUUID(),
        schema: `${options.exchange}.${options.routingKey}`,
        timestamp: new Date().toISOString(),
        source: 'loanserve-pro',
        priority: options.priority || 0,
        payload: options.message
      };

      return await rabbitmq.publish(envelope, {
        exchange: options.exchange,
        routingKey: options.routingKey,
        persistent: options.persistent !== false,
        mandatory: false,
        priority: options.priority || 0
      });
    } catch (error) {
      console.error(`[MessagePublisher] Failed to publish message:`, error);
      
      // Store in outbox for retry
      if (this.pool) {
        await this.storeInOutbox(options);
      }
      
      return false;
    }
  }

  /**
   * Store failed message in outbox for retry
   */
  private async storeInOutbox(options: PublishOptions): Promise<void> {
    try {
      await this.pool.query(`
        INSERT INTO outbox (
          exchange,
          routing_key,
          payload,
          correlation_id,
          priority,
          created_at,
          status,
          attempts
        ) VALUES ($1, $2, $3, $4, $5, NOW(), 'pending', 0)
      `, [
        options.exchange,
        options.routingKey,
        JSON.stringify(options.message),
        options.correlationId || randomUUID(),
        options.priority || 0
      ]);

      console.log('[MessagePublisher] Stored message in outbox for retry');
    } catch (error) {
      console.error('[MessagePublisher] Failed to store message in outbox:', error);
    }
  }

  /**
   * Publish message for specific domain events
   */
  async publishEvent(
    domain: string,
    event: string,
    payload: any,
    correlationId?: string
  ): Promise<boolean> {
    return this.publish({
      exchange: `${domain}.topic`,
      routingKey: `${domain}.${event}`,
      message: payload,
      correlationId
    });
  }
}