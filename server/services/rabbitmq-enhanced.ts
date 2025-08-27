/**
 * Enhanced RabbitMQ Service with Publisher Confirms and Connection Pooling
 */

import amqp from 'amqplib';
import { topologyManager } from '../messaging/topology.js';
import { MessageEnvelope, MessageMetadata } from '../../shared/messaging/envelope.js';
import { getMessageFactory } from '../messaging/message-factory.js';
import { ErrorClassifier, RetryTracker } from './rabbitmq-errors.js';
import { rabbitmqConfig } from './rabbitmq-config.js';

export interface PublishOptions {
  exchange: string;
  routingKey: string;
  persistent?: boolean;
  mandatory?: boolean;
  headers?: Record<string, any>;
  priority?: number;
  expiration?: string;
  correlationId?: string;
  replyTo?: string;
}

export interface ConsumeOptions {
  queue: string;
  prefetch?: number;
  noAck?: boolean;
  exclusive?: boolean;
  priority?: number;
  consumerTag?: string;
  consumerType?: string; // For identifying consumer type for prefetch config
}

export class EnhancedRabbitMQService {
  private publisherConnection: amqp.Connection | null = null;
  private consumerConnection: amqp.Connection | null = null;
  private publisherChannel: amqp.ConfirmChannel | null = null;
  private consumerChannels: Map<string, amqp.Channel> = new Map();
  private retryTracker = new RetryTracker(5); // Max 5 retries per message
  
  private url: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.url = process.env.CLOUDAMQP_URL || '';
    
    if (!this.url) {
      console.error('[RabbitMQ] CLOUDAMQP_URL not configured');
      return;
    }

    // Start connection process
    this.connect();
  }

  /**
   * Establish connections and setup topology
   */
  private async connect(): Promise<void> {
    try {
      console.log('[RabbitMQ] Establishing connections...');
      
      // Create publisher connection with confirms
      this.publisherConnection = await amqp.connect(this.url, {
        heartbeat: 30,
        connectionTimeout: 5000,
      });
      
      // Create consumer connection
      this.consumerConnection = await amqp.connect(this.url, {
        heartbeat: 30,
        connectionTimeout: 5000,
      });

      // Setup connection error handlers
      this.setupConnectionHandlers(this.publisherConnection, 'publisher');
      this.setupConnectionHandlers(this.consumerConnection, 'consumer');

      // Create publisher channel with confirms
      this.publisherChannel = await this.publisherConnection.createConfirmChannel();
      
      // Apply topology
      await this.setupTopology();
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      console.log('[RabbitMQ] Successfully connected and topology applied');
      
      // Log topology stats
      const stats = topologyManager.getStats();
      console.log('[RabbitMQ] Topology stats:', stats);
      
    } catch (error) {
      console.error('[RabbitMQ] Connection failed:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Setup connection error handlers
   */
  private setupConnectionHandlers(connection: amqp.Connection, type: string): void {
    connection.on('error', (error) => {
      console.error(`[RabbitMQ] ${type} connection error:`, error);
      this.isConnected = false;
      this.scheduleReconnect();
    });

    connection.on('close', () => {
      console.log(`[RabbitMQ] ${type} connection closed`);
      this.isConnected = false;
      this.scheduleReconnect();
    });
  }

  /**
   * Setup message topology with safe channel operations
   */
  private async setupTopology(): Promise<void> {
    if (!this.publisherConnection) {
      throw new Error('Publisher connection not available for topology setup');
    }
    
    try {
      // Create a dedicated admin channel for topology setup
      // This prevents the main publisher channel from being closed on conflicts
      const adminChannel = await this.publisherConnection.createConfirmChannel();
      
      try {
        // Apply topology with versioned queues to avoid conflicts
        await topologyManager.applyTopology(adminChannel);
        console.log('[RabbitMQ] Topology setup complete using admin channel');
      } finally {
        // Always close the admin channel after use
        await adminChannel.close().catch(() => {});
      }
    } catch (error: any) {
      // Fallback to publisher channel if admin channel fails
      if (this.publisherChannel && error.code !== 406) {
        console.log('[RabbitMQ] Retrying topology setup with publisher channel');
        await topologyManager.applyTopology(this.publisherChannel);
      } else {
        throw error;
      }
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[RabbitMQ] Max reconnection attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      60000 // Max 1 minute
    );

    console.log(`[RabbitMQ] Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, delay);
  }

  /**
   * Publish a message with confirms
   */
  async publish<T>(
    envelope: MessageEnvelope<T>,
    options: PublishOptions
  ): Promise<boolean> {
    if (!this.isConnected || !this.publisherChannel) {
      throw new Error('RabbitMQ not connected');
    }

    const messageBuffer = Buffer.from(JSON.stringify(envelope));
    
    const publishOptions: amqp.Options.Publish = {
      persistent: options.persistent ?? true,
      mandatory: options.mandatory ?? false,
      headers: {
        ...options.headers,
        'x-message-id': envelope.message_id,
        'x-correlation-id': envelope.correlation_id,
        'x-schema': envelope.schema,
        'x-trace-id': envelope.trace_id,
      },
      priority: options.priority ?? envelope.priority,
      expiration: options.expiration,
      correlationId: options.correlationId ?? envelope.correlation_id,
      replyTo: options.replyTo,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      if (!this.publisherChannel) {
        return reject(new Error('Publisher channel not available'));
      }

      this.publisherChannel.publish(
        options.exchange,
        options.routingKey,
        messageBuffer,
        publishOptions,
        (err, ok) => {
          if (err) {
            console.error('[RabbitMQ] Publish error:', err);
            reject(err);
          } else {
            resolve(true);
          }
        }
      );
    });
  }

  /**
   * Publish multiple messages as a batch
   */
  async publishBatch<T>(
    envelopes: MessageEnvelope<T>[],
    options: PublishOptions
  ): Promise<boolean[]> {
    const results = await Promise.allSettled(
      envelopes.map(envelope => this.publish(envelope, options))
    );

    return results.map(result => result.status === 'fulfilled' && result.value);
  }

  /**
   * Create a consumer channel with specific prefetch
   */
  async createConsumerChannel(consumerId: string, prefetch?: number, consumerType?: string): Promise<amqp.Channel> {
    if (!this.consumerConnection) {
      throw new Error('Consumer connection not available');
    }

    let channel = this.consumerChannels.get(consumerId);
    
    if (!channel) {
      // Get configured prefetch if not explicitly provided
      let actualPrefetch = prefetch;
      if (actualPrefetch === undefined && consumerType) {
        actualPrefetch = await this.getConfiguredPrefetch(consumerType);
      }
      actualPrefetch = actualPrefetch ?? 10; // Default fallback
      
      channel = await this.consumerConnection.createChannel();
      await channel.prefetch(actualPrefetch);
      this.consumerChannels.set(consumerId, channel);
      
      console.log(`[RabbitMQ] Created consumer channel for ${consumerId} with prefetch ${actualPrefetch}`);
      
      channel.on('error', (error) => {
        console.error(`[RabbitMQ] Consumer channel error for ${consumerId}:`, error);
        this.consumerChannels.delete(consumerId);
      });
      
      channel.on('close', () => {
        console.log(`[RabbitMQ] Consumer channel closed for ${consumerId}`);
        this.consumerChannels.delete(consumerId);
      });
    }

    return channel;
  }

  /**
   * Get configured prefetch for a consumer type
   */
  private async getConfiguredPrefetch(consumerType: string): Promise<number> {
    try {
      // Map consumer types to config keys
      const configKey = consumerType.toLowerCase().replace(/-/g, '_');
      const config = await rabbitmqConfig.getConfig();
      
      // Check if this consumer type exists in config
      if (configKey in config) {
        return config[configKey as keyof typeof config] as number;
      }
      
      // Return default if not found
      return config.default;
    } catch (error) {
      console.error(`[RabbitMQ] Failed to get prefetch config for ${consumerType}:`, error);
      return 10; // Fallback default
    }
  }

  /**
   * Consume messages from a queue
   */
  async consume<T>(
    options: ConsumeOptions,
    handler: (envelope: MessageEnvelope<T>, msg: amqp.ConsumeMessage) => Promise<void>
  ): Promise<string> {
    const channel = await this.createConsumerChannel(
      options.consumerTag || options.queue,
      options.prefetch,
      options.consumerType
    );

    const { consumerTag } = await channel.consume(
      options.queue,
      async (msg) => {
        if (!msg) return;

        let envelope: MessageEnvelope<T>;
        try {
          envelope = JSON.parse(msg.content.toString()) as MessageEnvelope<T>;
        } catch (parseError) {
          console.error('[RabbitMQ] Failed to parse message:', parseError);
          if (!options.noAck) {
            // Malformed message - send straight to DLQ
            channel.nack(msg, false, false);
          }
          return;
        }

        const messageId = envelope.message_id || msg.properties.messageId || String(Date.now());

        try {
          await handler(envelope, msg);
          
          if (!options.noAck) {
            channel.ack(msg);
            this.retryTracker.clear(messageId);
          }
        } catch (error) {
          // Classify the error
          const classifiedError = ErrorClassifier.classify(error);
          console.error(`[RabbitMQ] Message processing error (${classifiedError.constructor.name}):`, classifiedError.message);
          
          if (!options.noAck) {
            // Check if we should retry
            const shouldRetry = this.retryTracker.shouldRetry(messageId, classifiedError);
            
            if (shouldRetry && classifiedError.isRetryable) {
              // Requeue for retry
              console.log(`[RabbitMQ] Requeueing message ${messageId} for retry (transient error)`);
              channel.nack(msg, false, true);
              
              // Add delay header for next attempt if supported
              if (classifiedError.retryAfterMs && msg.properties.headers) {
                msg.properties.headers['x-retry-after'] = classifiedError.retryAfterMs;
              }
            } else {
              // Send to DLQ - either permanent error or max retries reached
              const reason = classifiedError.isRetryable 
                ? 'max retries exceeded' 
                : 'permanent error';
              console.log(`[RabbitMQ] Sending message ${messageId} to DLQ (${reason})`);
              channel.nack(msg, false, false);
              this.retryTracker.clear(messageId);
            }
          }
        }
      },
      {
        noAck: options.noAck ?? false,
        exclusive: options.exclusive ?? false,
        priority: options.priority,
        consumerTag: options.consumerTag,
      }
    );

    console.log(`[RabbitMQ] Consumer started: ${consumerTag} on queue ${options.queue}`);
    return consumerTag;
  }

  /**
   * Cancel a consumer
   */
  async cancelConsumer(consumerTag: string): Promise<void> {
    const channel = this.consumerChannels.get(consumerTag);
    if (channel) {
      await channel.cancel(consumerTag);
      await channel.close();
      this.consumerChannels.delete(consumerTag);
      console.log(`[RabbitMQ] Consumer cancelled: ${consumerTag}`);
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<amqp.Replies.AssertQueue | null> {
    if (!this.publisherChannel) {
      return null;
    }

    try {
      const queueInfo = await this.publisherChannel.checkQueue(queueName);
      return queueInfo;
    } catch (error) {
      console.error(`[RabbitMQ] Failed to get queue stats for ${queueName}:`, error);
      return null;
    }
  }

  /**
   * Purge a queue (danger!)
   */
  async purgeQueue(queueName: string): Promise<number> {
    if (!this.publisherChannel) {
      throw new Error('Publisher channel not available');
    }

    const result = await this.publisherChannel.purgeQueue(queueName);
    console.log(`[RabbitMQ] Purged ${result.messageCount} messages from ${queueName}`);
    return result.messageCount;
  }

  /**
   * Get connection status
   */
  getConnectionInfo(): {
    connected: boolean;
    reconnectAttempts: number;
    publisherConnected: boolean;
    consumerConnected: boolean;
    activeConsumers: number;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      publisherConnected: !!this.publisherConnection,
      consumerConnected: !!this.consumerConnection,
      activeConsumers: this.consumerChannels.size,
    };
  }

  /**
   * Wait for connection to be ready
   */
  async waitForConnection(maxWaitMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (!this.isConnected) {
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(`RabbitMQ connection timeout after ${maxWaitMs}ms`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('[RabbitMQ] Connection ready');
  }

  /**
   * Calculate shard for loan-based routing
   */
  static calculateShard(loanId: string | number, shardCount: number = 8): number {
    // Simple FNV-1a hash implementation
    let hash = 2166136261;
    const str = String(loanId);
    
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    
    return Math.abs(hash) % shardCount;
  }

  /**
   * Get a channel for DLQ operations
   */
  async getDLQChannel(): Promise<amqp.Channel | null> {
    if (!this.consumerConnection) {
      return null;
    }
    
    // Create a dedicated channel for DLQ operations
    try {
      const channel = await this.consumerConnection.createChannel();
      return channel;
    } catch (error) {
      console.error('[RabbitMQ] Failed to create DLQ channel:', error);
      return null;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[RabbitMQ] Shutting down...');
    
    // Cancel reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close consumer channels
    for (const [tag, channel] of this.consumerChannels) {
      try {
        await channel.close();
        console.log(`[RabbitMQ] Closed consumer channel: ${tag}`);
      } catch (error) {
        console.error(`[RabbitMQ] Error closing consumer channel ${tag}:`, error);
      }
    }
    this.consumerChannels.clear();

    // Close publisher channel
    if (this.publisherChannel) {
      try {
        await this.publisherChannel.close();
        console.log('[RabbitMQ] Closed publisher channel');
      } catch (error) {
        console.error('[RabbitMQ] Error closing publisher channel:', error);
      }
    }

    // Close connections
    if (this.publisherConnection) {
      try {
        await this.publisherConnection.close();
        console.log('[RabbitMQ] Closed publisher connection');
      } catch (error) {
        console.error('[RabbitMQ] Error closing publisher connection:', error);
      }
    }

    if (this.consumerConnection) {
      try {
        await this.consumerConnection.close();
        console.log('[RabbitMQ] Closed consumer connection');
      } catch (error) {
        console.error('[RabbitMQ] Error closing consumer connection:', error);
      }
    }

    this.isConnected = false;
    console.log('[RabbitMQ] Shutdown complete');
  }
}

// Export singleton instance
let enhancedService: EnhancedRabbitMQService | null = null;

export function getEnhancedRabbitMQService(): EnhancedRabbitMQService {
  if (!enhancedService) {
    enhancedService = new EnhancedRabbitMQService();
  }
  return enhancedService;
}

// Graceful shutdown on process termination
process.on('SIGTERM', async () => {
  if (enhancedService) {
    await enhancedService.shutdown();
  }
});

process.on('SIGINT', async () => {
  if (enhancedService) {
    await enhancedService.shutdown();
  }
});