/**
 * Idempotent Consumer Wrapper
 * Ensures exactly-once message processing semantics
 */

import crypto from 'crypto';
import { db } from '../db.js';
import { MessageEnvelope, ProcessingResult, ConsumerContext } from '../../shared/messaging/envelope.js';

export interface IdempotentConsumerOptions {
  consumer_id: string;
  consumer_group?: string;
  max_retries?: number;
  cleanup_after_days?: number;
}

export class IdempotentConsumer {
  private readonly options: Required<IdempotentConsumerOptions>;

  constructor(options: IdempotentConsumerOptions) {
    this.options = {
      consumer_group: 'default',
      max_retries: 3,
      cleanup_after_days: 30,
      ...options,
    };
  }

  /**
   * Process a message with idempotency guarantee
   */
  async processMessage<T, R>(
    envelope: MessageEnvelope<T>,
    handler: (data: T, context: ConsumerContext) => Promise<R>
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const context: ConsumerContext = {
      consumer_id: this.options.consumer_id,
      consumer_group: this.options.consumer_group,
      attempt: envelope.retry_count || 1,
      max_retries: this.options.max_retries,
      received_at: new Date().toISOString(),
      processing_started_at: new Date().toISOString(),
    };

    try {
      // Check if message was already processed
      const alreadyProcessed = await this.checkProcessed(envelope.message_id);
      
      if (alreadyProcessed) {
        console.log(`[IdempotentConsumer] Message ${envelope.message_id} already processed by ${this.options.consumer_id}`);
        return {
          success: true,
          result_hash: alreadyProcessed.result_hash,
        };
      }

      // Process the message
      const result = await handler(envelope.data, context);
      
      // Generate result hash
      const resultHash = this.hashResult(result);
      
      // Record successful processing
      await this.recordProcessed(envelope.message_id, resultHash, result);
      
      // Record metrics
      await this.recordMetrics(
        envelope.schema,
        true,
        Date.now() - startTime,
        envelope.retry_count || 0
      );

      return {
        success: true,
        result_hash: resultHash,
      };
    } catch (error: any) {
      console.error(`[IdempotentConsumer] Error processing message ${envelope.message_id}:`, error);
      
      // Record metrics for failure
      await this.recordMetrics(
        envelope.schema,
        false,
        Date.now() - startTime,
        envelope.retry_count || 0
      );

      // Determine if we should retry
      const shouldRetry = this.shouldRetry(error, context.attempt);
      
      return {
        success: false,
        error: error.message,
        should_retry: shouldRetry,
        retry_delay_ms: this.getRetryDelay(context.attempt),
        dead_letter: !shouldRetry && context.attempt >= this.options.max_retries,
      };
    }
  }

  /**
   * Check if a message was already processed
   */
  private async checkProcessed(messageId: string): Promise<{
    result_hash: string;
    result_data: any;
  } | null> {
    const result = await db.execute(`
      SELECT result_hash, result_data 
      FROM consumer_inbox 
      WHERE consumer = $1 AND message_id = $2
    `, [this.options.consumer_id, messageId]);

    if (result.rows.length > 0) {
      return {
        result_hash: result.rows[0].result_hash || '',
        result_data: result.rows[0].result_data,
      };
    }

    return null;
  }

  /**
   * Record that a message was processed
   */
  private async recordProcessed(
    messageId: string,
    resultHash: string,
    resultData: any
  ): Promise<void> {
    await db.execute(`
      INSERT INTO consumer_inbox (consumer, message_id, result_hash, result_data, processed_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (consumer, message_id) DO NOTHING
    `, [
      this.options.consumer_id,
      messageId,
      resultHash,
      JSON.stringify(resultData),
    ]);
  }

  /**
   * Record processing metrics
   */
  private async recordMetrics(
    schema: string,
    success: boolean,
    processingTimeMs: number,
    retryCount: number
  ): Promise<void> {
    await db.execute(`
      INSERT INTO message_metrics (
        schema_name, consumer, processed_at, processing_time_ms, 
        success, retry_count
      )
      VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5)
    `, [
      schema,
      this.options.consumer_id,
      processingTimeMs,
      success,
      retryCount,
    ]);
  }

  /**
   * Generate a hash of the processing result
   */
  private hashResult(result: any): string {
    const json = JSON.stringify(result);
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  /**
   * Determine if we should retry based on error type
   */
  private shouldRetry(error: any, attempt: number): boolean {
    // Don't retry if we've exceeded max attempts
    if (attempt >= this.options.max_retries) {
      return false;
    }

    // Don't retry validation errors
    if (error.code === 'VALIDATION_ERROR' || error.code === 'BAD_REQUEST') {
      return false;
    }

    // Don't retry business logic errors
    if (error.code === 'BUSINESS_ERROR' || error.code === 'INVARIANT_VIOLATION') {
      return false;
    }

    // Retry transient errors
    if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT' || error.code === 'SERVICE_UNAVAILABLE') {
      return true;
    }

    // Retry database errors
    if (error.code === 'DATABASE_ERROR' || error.code === 'DEADLOCK') {
      return true;
    }

    // Default: retry unknown errors
    return true;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private getRetryDelay(attempt: number): number {
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 300000; // 5 minutes
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Cleanup old processed messages
   */
  async cleanup(): Promise<number> {
    const result = await db.execute(`
      DELETE FROM consumer_inbox 
      WHERE consumer = $1 
        AND processed_at < CURRENT_TIMESTAMP - INTERVAL '${this.options.cleanup_after_days} days'
      RETURNING message_id
    `, [this.options.consumer_id]);

    const deletedCount = result.rows.length;
    if (deletedCount > 0) {
      console.log(`[IdempotentConsumer] Cleaned up ${deletedCount} old messages for ${this.options.consumer_id}`);
    }

    return deletedCount;
  }

  /**
   * Get processing statistics
   */
  async getStats(hours: number = 24): Promise<{
    total_processed: number;
    success_rate: number;
    avg_processing_time_ms: number;
    retry_rate: number;
  }> {
    const result = await db.execute(`
      SELECT 
        COUNT(*) as total_processed,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
        AVG(processing_time_ms) as avg_processing_time_ms,
        SUM(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END) as retry_count
      FROM message_metrics
      WHERE consumer = $1
        AND processed_at > CURRENT_TIMESTAMP - INTERVAL '${hours} hours'
    `, [this.options.consumer_id]);

    const stats = result.rows[0];
    return {
      total_processed: stats?.total_processed || 0,
      success_rate: stats?.total_processed > 0 
        ? (stats.success_count / stats.total_processed) * 100 
        : 0,
      avg_processing_time_ms: stats?.avg_processing_time_ms || 0,
      retry_rate: stats?.total_processed > 0
        ? (stats.retry_count / stats.total_processed) * 100
        : 0,
    };
  }
}

/**
 * Create an idempotent consumer for a specific handler
 */
export function createIdempotentHandler<T, R>(
  consumerId: string,
  handler: (data: T, context: ConsumerContext) => Promise<R>,
  options?: Partial<IdempotentConsumerOptions>
): (envelope: MessageEnvelope<T>) => Promise<ProcessingResult> {
  const consumer = new IdempotentConsumer({
    consumer_id: consumerId,
    ...options,
  });

  return (envelope: MessageEnvelope<T>) => consumer.processMessage(envelope, handler);
}