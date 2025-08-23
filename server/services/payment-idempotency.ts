/**
 * Idempotency Service with Inbox/Outbox Pattern
 * Ensures exactly-once processing and transactional event publishing
 */

import { PoolClient } from 'pg';
import { db } from '../db/index.js';
import { PaymentEnvelope } from '../messaging/payment-envelope.js';
import { ulid } from 'ulid';
import * as crypto from 'crypto';

export class IdempotencyService {
  /**
   * Check if a message has been processed by this consumer
   */
  static async checkProcessed(
    consumer: string,
    messageId: string,
    client?: PoolClient
  ): Promise<{ processed: boolean; resultHash?: string }> {
    const query = `
      SELECT result_hash 
      FROM inbox 
      WHERE consumer = $1 AND message_id = $2
    `;
    
    const result = client 
      ? await client.query(query, [consumer, messageId])
      : await db.execute(query, [consumer, messageId]);
    
    if (result.rows.length > 0) {
      return { 
        processed: true, 
        resultHash: result.rows[0].result_hash 
      };
    }
    
    return { processed: false };
  }

  /**
   * Record message as processed
   */
  static async recordProcessed(
    consumer: string,
    messageId: string,
    resultHash: string,
    client: PoolClient
  ): Promise<void> {
    await client.query(
      `INSERT INTO inbox (consumer, message_id, result_hash, processed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (consumer, message_id) DO NOTHING`,
      [consumer, messageId, resultHash]
    );
  }

  /**
   * Add event to outbox for publishing after transaction commits
   */
  static async addToOutbox(
    client: PoolClient,
    aggregate: { type: string; id: string },
    envelope: PaymentEnvelope<any>,
    routingKey: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO outbox (
        aggregate_type, aggregate_id, schema, routing_key, 
        payload, headers, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        aggregate.type,
        aggregate.id,
        envelope.schema,
        routingKey,
        JSON.stringify(envelope),
        JSON.stringify({
          'x-message-id': envelope.message_id,
          'x-correlation-id': envelope.correlation_id,
          'x-idempotency-key': envelope.idempotency_key
        })
      ]
    );
  }

  /**
   * Generate idempotency key for payment source
   */
  static generateIdempotencyKey(source: string, data: any): string {
    switch (source) {
      case 'ach':
        return `ach:${data.trace_number}:${data.company_batch_id}:${data.originator_id}`;
      
      case 'wire':
        return `wire:${data.wire_ref}:${data.amount_cents}:${data.effective_date}`;
      
      case 'check':
        return `check:${data.check_number}:${data.payer_account}:${data.amount_cents}:${data.issue_date}`;
      
      case 'card':
        return `card:${data.transaction_id}:${data.merchant_ref}`;
      
      case 'lockbox':
        return `lockbox:${data.lockbox_id}:${data.item_number}`;
      
      default:
        return `${source}:${ulid()}`;
    }
  }

  /**
   * Create result hash for caching
   */
  static createResultHash(result: any): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(result))
      .digest('hex');
  }
}

/**
 * Idempotent handler wrapper
 */
export function createIdempotentHandler<T, R>(
  consumer: string,
  handler: (envelope: PaymentEnvelope<T>, client: PoolClient) => Promise<R>
) {
  return async (envelope: PaymentEnvelope<T>): Promise<R | null> => {
    // Check if already processed
    const { processed, resultHash } = await IdempotencyService.checkProcessed(
      consumer,
      envelope.message_id
    );

    if (processed) {
      console.log(`[${consumer}] Message ${envelope.message_id} already processed`);
      return null;
    }

    // Process in transaction
    const client = await (db as any).pool.connect();
    try {
      await client.query('BEGIN');

      // Double-check in transaction (handles race conditions)
      const recheck = await IdempotencyService.checkProcessed(
        consumer,
        envelope.message_id,
        client
      );

      if (recheck.processed) {
        await client.query('ROLLBACK');
        return null;
      }

      // Execute handler
      const result = await handler(envelope, client);

      // Record as processed
      const hash = IdempotencyService.createResultHash(result);
      await IdempotencyService.recordProcessed(
        consumer,
        envelope.message_id,
        hash,
        client
      );

      await client.query('COMMIT');
      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
}