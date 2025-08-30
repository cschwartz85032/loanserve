import { Channel, ConsumeMessage } from 'amqplib';
import { MessageEnvelope } from '@shared/messaging/envelope';
import { createLogger } from './logger';
import { retryWithBackoff } from './api-helpers';

const logger = createLogger('Messaging');

export interface PublishOptions {
  exchange: string;
  routingKey: string;
  persistent?: boolean;
  priority?: number;
  expiration?: string;
  correlationId?: string;
  replyTo?: string;
}

export interface ConsumerOptions {
  queue: string;
  prefetch?: number;
  noAck?: boolean;
  exclusive?: boolean;
  priority?: number;
  arguments?: any;
}

// Standard message acknowledgment patterns
export class MessageHandler {
  constructor(
    private channel: Channel,
    private consumerName: string
  ) {}
  
  async ack(msg: ConsumeMessage) {
    logger.debug(`${this.consumerName} ACK message`, { 
      deliveryTag: msg.fields.deliveryTag 
    });
    this.channel.ack(msg);
  }
  
  async nack(msg: ConsumeMessage, requeue = false) {
    logger.warn(`${this.consumerName} NACK message`, { 
      deliveryTag: msg.fields.deliveryTag,
      requeue 
    });
    this.channel.nack(msg, false, requeue);
  }
  
  async reject(msg: ConsumeMessage, requeue = false) {
    logger.warn(`${this.consumerName} REJECT message`, { 
      deliveryTag: msg.fields.deliveryTag,
      requeue 
    });
    this.channel.reject(msg, requeue);
  }
  
  async handleRedelivery(msg: ConsumeMessage): Promise<boolean> {
    if (msg.fields.redelivered) {
      logger.warn(`${this.consumerName} Message redelivered, sending to DLQ`, {
        exchange: msg.fields.exchange,
        routingKey: msg.fields.routingKey
      });
      await this.nack(msg, false);
      return true;
    }
    return false;
  }
  
  async processWithRetry<T>(
    msg: ConsumeMessage,
    processor: (content: T) => Promise<void>,
    maxRetries = 3
  ) {
    try {
      const content = JSON.parse(msg.content.toString()) as T;
      
      // Check if already redelivered
      if (await this.handleRedelivery(msg)) {
        return;
      }
      
      // Process with retry logic
      await retryWithBackoff(
        () => processor(content),
        maxRetries
      );
      
      // Success - acknowledge
      await this.ack(msg);
      
    } catch (error) {
      logger.error(`${this.consumerName} Failed to process message`, error);
      
      // Determine if we should retry or send to DLQ
      const retryCount = parseInt(msg.properties.headers?.['x-retry-count'] || '0');
      
      if (retryCount < maxRetries) {
        // Requeue for retry with incremented count
        await this.publishRetry(msg, retryCount + 1);
        await this.ack(msg); // Ack original to prevent duplicate
      } else {
        // Max retries exceeded, send to DLQ
        await this.nack(msg, false);
      }
    }
  }
  
  private async publishRetry(msg: ConsumeMessage, retryCount: number) {
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30s
    
    logger.info(`${this.consumerName} Scheduling retry`, {
      retryCount,
      delayMs: delay
    });
    
    // Publish to delayed exchange with retry header
    this.channel.publish(
      msg.fields.exchange,
      msg.fields.routingKey,
      msg.content,
      {
        ...msg.properties,
        headers: {
          ...msg.properties.headers,
          'x-retry-count': retryCount,
          'x-delay': delay
        }
      }
    );
  }
}

// Common publisher patterns
export class MessagePublisher {
  constructor(
    private channel: Channel,
    private serviceName: string
  ) {}
  
  async publish<T>(
    envelope: MessageEnvelope<T>,
    options: PublishOptions
  ): Promise<boolean> {
    const timer = logger.startTimer(`${this.serviceName} publish`);
    
    try {
      const messageBuffer = Buffer.from(JSON.stringify(envelope));
      
      const publishOptions = {
        persistent: options.persistent ?? true,
        contentType: 'application/json',
        contentEncoding: 'utf-8',
        timestamp: Date.now(),
        messageId: envelope.message_id,
        correlationId: options.correlationId || envelope.correlation_id,
        replyTo: options.replyTo,
        priority: options.priority,
        expiration: options.expiration,
        headers: {
          'x-service': this.serviceName,
          'x-schema': envelope.schema,
          'x-timestamp': envelope.timestamp
        }
      };
      
      const success = this.channel.publish(
        options.exchange,
        options.routingKey,
        messageBuffer,
        publishOptions
      );
      
      if (success) {
        logger.debug(`${this.serviceName} Published message`, {
          exchange: options.exchange,
          routingKey: options.routingKey,
          messageId: envelope.message_id
        });
      } else {
        logger.warn(`${this.serviceName} Channel buffer full, message queued`);
      }
      
      return success;
    } finally {
      timer();
    }
  }
  
  async publishBatch<T>(
    envelopes: MessageEnvelope<T>[],
    options: PublishOptions
  ): Promise<{ successful: number; failed: number }> {
    const results = { successful: 0, failed: 0 };
    
    for (const envelope of envelopes) {
      try {
        const success = await this.publish(envelope, options);
        if (success) {
          results.successful++;
        } else {
          results.failed++;
        }
      } catch (error) {
        logger.error(`${this.serviceName} Failed to publish batch message`, error);
        results.failed++;
      }
    }
    
    logger.logBatch(
      `${this.serviceName} batch publish`,
      envelopes.length,
      results.successful,
      results.failed
    );
    
    return results;
  }
}

// Consumer setup helper
export async function setupConsumer(
  channel: Channel,
  options: ConsumerOptions,
  handler: (msg: ConsumeMessage) => Promise<void>
): Promise<void> {
  const { queue, prefetch = 10, noAck = false } = options;
  
  // Set QoS
  await channel.prefetch(prefetch);
  
  // Queue assertion removed - queues must be defined in OptimizedTopologyManager
  // to ensure single source of truth and prevent 406 PRECONDITION_FAILED errors
  
  // Start consuming
  await channel.consume(
    queue,
    async (msg) => {
      if (!msg) return;
      
      const timer = logger.startTimer(`Process message from ${queue}`);
      try {
        await handler(msg);
      } catch (error) {
        logger.error(`Error processing message from ${queue}`, error);
      } finally {
        timer();
      }
    },
    { noAck, ...options }
  );
  
  logger.info(`Consumer started on queue: ${queue}`, { prefetch });
}

// Dead letter queue handler
export async function setupDLQHandler(
  channel: Channel,
  dlqName: string,
  processor: (content: any, headers: any) => Promise<void>
): Promise<void> {
  await setupConsumer(
    channel,
    { queue: dlqName, prefetch: 1 },
    async (msg) => {
      const content = JSON.parse(msg.content.toString());
      const headers = msg.properties.headers;
      
      logger.warn(`Processing DLQ message from ${dlqName}`, {
        originalExchange: headers['x-death']?.[0]?.exchange,
        originalQueue: headers['x-death']?.[0]?.queue,
        deathCount: headers['x-death']?.[0]?.count
      });
      
      try {
        await processor(content, headers);
        channel.ack(msg);
      } catch (error) {
        logger.error(`Failed to process DLQ message`, error);
        // Don't requeue DLQ messages
        channel.nack(msg, false, false);
      }
    }
  );
}

// Circuit breaker for messaging
export class MessagingCircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold = 5,
    private timeout = 60000 // 1 minute
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should be reset
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed > this.timeout) {
        this.state = 'half-open';
        this.failures = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      
      // Success - reset failures
      if (this.state === 'half-open') {
        this.state = 'closed';
      }
      this.failures = 0;
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
        logger.error('Circuit breaker opened due to failures', {
          failures: this.failures,
          threshold: this.threshold
        });
      }
      
      throw error;
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Message batching helper
export class MessageBatcher<T> {
  private batch: T[] = [];
  private timer?: NodeJS.Timeout;
  
  constructor(
    private processor: (batch: T[]) => Promise<void>,
    private maxSize = 100,
    private maxWaitMs = 5000
  ) {}
  
  async add(item: T): Promise<void> {
    this.batch.push(item);
    
    if (this.batch.length >= this.maxSize) {
      await this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.maxWaitMs);
    }
  }
  
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    
    if (this.batch.length === 0) return;
    
    const itemsToProcess = [...this.batch];
    this.batch = [];
    
    try {
      await this.processor(itemsToProcess);
    } catch (error) {
      logger.error('Batch processing failed', error);
      // Optionally re-add failed items to batch
      this.batch.unshift(...itemsToProcess);
      throw error;
    }
  }
}

// Message deduplication helper
export class MessageDeduplicator {
  private seen = new Map<string, number>();
  private cleanupInterval: NodeJS.Timer;
  
  constructor(
    private ttlMs = 60000, // 1 minute default
    private cleanupIntervalMs = 10000 // 10 seconds
  ) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }
  
  isDuplicate(messageId: string): boolean {
    const now = Date.now();
    const seenAt = this.seen.get(messageId);
    
    if (seenAt && now - seenAt < this.ttlMs) {
      return true;
    }
    
    this.seen.set(messageId, now);
    return false;
  }
  
  private cleanup() {
    const now = Date.now();
    const expired: string[] = [];
    
    for (const [id, timestamp] of this.seen.entries()) {
      if (now - timestamp > this.ttlMs) {
        expired.push(id);
      }
    }
    
    for (const id of expired) {
      this.seen.delete(id);
    }
    
    if (expired.length > 0) {
      logger.debug(`Cleaned up ${expired.length} expired message IDs`);
    }
  }
  
  destroy() {
    clearInterval(this.cleanupInterval);
    this.seen.clear();
  }
}