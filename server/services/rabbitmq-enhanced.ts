/**
 * Enhanced RabbitMQ Service with Publisher Confirms and Connection Pooling
 * 
 * Environment Variables for CloudAMQP Connection Management:
 * - RABBITMQ_MAX_CONNECTIONS: Maximum concurrent connections (default: 2, CloudAMQP limit: 30)
 * - RABBITMQ_IDLE_TIMEOUT_MS: Idle connection timeout in milliseconds (default: 300000 = 5 minutes)
 * - RABBITMQ_MAX_RECONNECT_ATTEMPTS: Maximum reconnection attempts (default: 8)
 * - CLOUDAMQP_URL: CloudAMQP connection string (required)
 * 
 * Connection Pool Features:
 * - Automatic connection reuse to prevent hitting CloudAMQP's 30 connection limit
 * - Idle timeout cleanup to release unused connections
 * - Connection limit enforcement with graceful fallback to existing connections
 * - Pool statistics and monitoring via getConnectionPoolStats()
 */

import amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { topologyManager } from '../messaging/topology.js';
import { MessageEnvelope, MessageMetadata } from '../../shared/messaging/envelope.js';
import { getMessageFactory } from '../messaging/message-factory.js';
import { ErrorClassifier, RetryTracker } from './rabbitmq-errors.js';
import { rabbitmqConfig } from './rabbitmq-config.js';
import { RabbitService } from '../messaging/rabbit.js';

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
  
  // ========================================
  // CONNECTION POOLING CONFIGURATION
  // ========================================
  private url: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = parseInt(process.env.RABBITMQ_MAX_RECONNECT_ATTEMPTS || '8');
  private reconnectDelay: number = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  // CloudAMQP Connection Limits Management
  private maxConcurrentConnections: number = parseInt(process.env.RABBITMQ_MAX_CONNECTIONS || '2');
  private activeConnectionCount: number = 0;
  private connectionReuse: boolean = true;
  private connectionPool: Map<string, amqp.Connection> = new Map();
  private channelPool: Map<string, amqp.Channel> = new Map();
  private idleTimeout: number = parseInt(process.env.RABBITMQ_IDLE_TIMEOUT_MS || '300000'); // 5 minutes
  private idleTimers: Map<string, NodeJS.Timeout> = new Map();

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
      console.log(`[RabbitMQ] Establishing connections (max: ${this.maxConcurrentConnections})...`);
      
      // Use pooled connections to respect CloudAMQP limits
      this.publisherConnection = await this.getPooledConnection('publisher');
      this.consumerConnection = await this.getPooledConnection('consumer');

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
      // Never retry topology on publisher channel - this causes channel failures
      // Log the error and continue - topology conflicts will be handled by versioned queues
      console.error('[RabbitMQ] Topology setup failed:', error.message);
      if (error.code === 406) {
        console.warn('[RabbitMQ] Queue argument conflict detected. Run npm run migrate-queues to fix.');
      }
      // Don't throw - allow the service to continue with partial topology
      // Critical queues will be created on-demand with correct arguments
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
    connectionPoolSize: number;
    channelPoolSize: number;
    activeConnections: number;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      publisherConnected: !!this.publisherConnection,
      consumerConnected: !!this.consumerConnection,
      activeConsumers: this.consumerChannels.size,
      connectionPoolSize: this.connectionPool.size,
      channelPoolSize: this.channelPool.size,
      activeConnections: this.activeConnectionCount,
    };
  }

  // ========================================
  // CONNECTION POOLING METHODS
  // ========================================

  /**
   * Get or create a reusable connection from the pool
   */
  private async getPooledConnection(purpose: string): Promise<amqp.Connection> {
    // Check if we can reuse an existing connection
    if (this.connectionReuse && this.connectionPool.has(purpose)) {
      const existingConnection = this.connectionPool.get(purpose)!;
      console.log(`[RabbitMQ] Reusing pooled connection for ${purpose}`);
      return existingConnection;
    }

    // Check connection limit before creating new connection
    if (this.activeConnectionCount >= this.maxConcurrentConnections) {
      console.warn(`[RabbitMQ] Connection limit reached (${this.maxConcurrentConnections}). Reusing existing connection.`);
      // Return the first available connection if we hit the limit
      const firstConnection = Array.from(this.connectionPool.values())[0];
      if (firstConnection) {
        return firstConnection;
      }
      throw new Error(`Connection limit of ${this.maxConcurrentConnections} exceeded and no connections available for reuse`);
    }

    // Create new connection
    const connection = await amqp.connect(this.url, {
      heartbeat: 30,
      connectionTimeout: 5000,
    });

    this.activeConnectionCount++;
    this.connectionPool.set(purpose, connection);
    
    // Setup idle timeout for automatic cleanup
    this.setupConnectionIdleTimeout(purpose);

    // Setup error handlers for pooled connection
    connection.on('error', (error) => {
      console.error(`[RabbitMQ] Pooled connection error for ${purpose}:`, error);
      this.releaseConnection(purpose);
    });

    connection.on('close', () => {
      console.log(`[RabbitMQ] Pooled connection closed for ${purpose}`);
      this.releaseConnection(purpose);
    });

    console.log(`[RabbitMQ] Created new pooled connection for ${purpose} (${this.activeConnectionCount}/${this.maxConcurrentConnections})`);
    return connection;
  }

  /**
   * Setup idle timeout for connection cleanup
   */
  private setupConnectionIdleTimeout(purpose: string): void {
    // Clear existing timer
    const existingTimer = this.idleTimers.get(purpose);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      console.log(`[RabbitMQ] Connection ${purpose} idle timeout reached, releasing...`);
      this.releaseConnection(purpose);
    }, this.idleTimeout);

    this.idleTimers.set(purpose, timer);
  }

  /**
   * Release a connection from the pool when no longer needed
   */
  async releaseConnection(purpose: string): Promise<void> {
    const connection = this.connectionPool.get(purpose);
    if (connection) {
      try {
        await connection.close();
        console.log(`[RabbitMQ] Released connection for ${purpose}`);
      } catch (error) {
        console.error(`[RabbitMQ] Error releasing connection for ${purpose}:`, error);
      }
      
      this.connectionPool.delete(purpose);
      this.activeConnectionCount = Math.max(0, this.activeConnectionCount - 1);
    }

    // Clear idle timer
    const timer = this.idleTimers.get(purpose);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(purpose);
    }
  }

  /**
   * Release unused connections when under memory pressure
   */
  async releaseUnusedConnections(): Promise<void> {
    const unusedConnections: string[] = [];
    
    // Find connections that haven't been used recently
    for (const [purpose] of this.connectionPool) {
      if (purpose !== 'publisher' && purpose !== 'consumer') {
        unusedConnections.push(purpose);
      }
    }

    // Release unused connections
    for (const purpose of unusedConnections) {
      await this.releaseConnection(purpose);
    }

    console.log(`[RabbitMQ] Released ${unusedConnections.length} unused connections`);
  }

  /**
   * Get connection pool statistics
   */
  getConnectionPoolStats(): {
    maxConnections: number;
    activeConnections: number;
    pooledConnections: number;
    utilizationPercent: number;
  } {
    const utilizationPercent = Math.round((this.activeConnectionCount / this.maxConcurrentConnections) * 100);
    
    return {
      maxConnections: this.maxConcurrentConnections,
      activeConnections: this.activeConnectionCount,
      pooledConnections: this.connectionPool.size,
      utilizationPercent,
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
   * Force disconnect all connections immediately (emergency cleanup)
   */
  async forceDisconnectAll(): Promise<void> {
    console.log('[RabbitMQ] FORCE DISCONNECT: Closing all connections immediately...');
    
    // Stop all reconnection attempts
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Reset connection tracking
    this.isConnected = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent further reconnection
    
    // Force close all connections without waiting
    const forceCloseConnection = async (conn: amqp.Connection, name: string) => {
      try {
        // Close without graceful shutdown
        if (conn && typeof conn.close === 'function') {
          conn.close();
          console.log(`[RabbitMQ] Force closed connection: ${name}`);
        }
      } catch (error) {
        console.log(`[RabbitMQ] Force closed connection: ${name} (with error, expected)`);
      }
    };
    
    // Force close all pooled connections
    for (const [purpose, connection] of this.connectionPool) {
      await forceCloseConnection(connection, `pooled-${purpose}`);
    }
    
    // Force close direct connections
    if (this.publisherConnection) {
      await forceCloseConnection(this.publisherConnection, 'publisher');
    }
    if (this.consumerConnection) {
      await forceCloseConnection(this.consumerConnection, 'consumer');
    }
    
    // Clear all data structures
    this.connectionPool.clear();
    this.channelPool.clear();
    this.consumerChannels.clear();
    this.idleTimers.clear();
    this.activeConnectionCount = 0;
    
    // Clear references
    this.publisherConnection = null;
    this.consumerConnection = null;
    this.publisherChannel = null;
    
    console.log('[RabbitMQ] FORCE DISCONNECT: All connections cleared');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[RabbitMQ] Shutting down with connection pool cleanup...');
    
    // Cancel reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Clear all idle timers
    for (const [purpose, timer] of this.idleTimers) {
      clearTimeout(timer);
      console.log(`[RabbitMQ] Cleared idle timer for ${purpose}`);
    }
    this.idleTimers.clear();

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

    // Close all pooled connections
    const connectionPurposes = Array.from(this.connectionPool.keys());
    for (const purpose of connectionPurposes) {
      await this.releaseConnection(purpose);
    }

    // Close any remaining direct connections
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

    // Clear channel pool
    for (const [channelId, channel] of this.channelPool) {
      try {
        await channel.close();
        console.log(`[RabbitMQ] Closed pooled channel: ${channelId}`);
      } catch (error) {
        console.error(`[RabbitMQ] Error closing pooled channel ${channelId}:`, error);
      }
    }
    this.channelPool.clear();

    // Reset state
    this.activeConnectionCount = 0;
    this.isConnected = false;
    
    const stats = this.getConnectionPoolStats();
    console.log('[RabbitMQ] Shutdown complete. Final connection stats:', stats);
  }
}

/**
 * Helper function to create a properly formatted message envelope
 * @param schema Message schema identifier (e.g., 'loanserve.v1.payment.processed')
 * @param data The actual payload data
 * @param partial Optional partial envelope properties to override defaults
 * @returns Complete MessageEnvelope with all required fields
 */
export function makeEnvelope<T>(
  schema: string,
  data: T,
  partial: Partial<MessageEnvelope<T>> = {}
): MessageEnvelope<T> {
  return {
    schema,
    message_id: uuidv4(),
    correlation_id: partial.correlation_id || uuidv4(),
    causation_id: partial.causation_id || uuidv4(),
    occurred_at: new Date().toISOString(),
    producer: process.env.SERVICE_NAME || 'loanserve',
    version: partial.version || 1,
    ...partial,
    data,
  };
}

/**
 * Convenience function to publish a message with automatic envelope wrapping
 * @param rabbit RabbitService instance
 * @param exchange Exchange name
 * @param routingKey Routing key
 * @param schema Message schema identifier
 * @param data Message payload data
 * @param opts Additional publish options (excluding exchange and routingKey)
 */
export async function publishMessage<T>(
  rabbit: RabbitService,
  exchange: string,
  routingKey: string,
  schema: string,
  data: T,
  opts?: Omit<PublishOptions, 'exchange' | 'routingKey'>
): Promise<void> {
  const envelope = makeEnvelope(schema, data, {
    correlation_id: opts?.correlationId,
    user_id: opts?.headers?.['x-user-id'] as string,
    trace_id: opts?.headers?.['x-trace-id'] as string,
  });

  await rabbit.publish(envelope, { 
    exchange, 
    routingKey, 
    ...opts 
  });
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