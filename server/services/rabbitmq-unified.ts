import amqplib, { Connection, Channel, ConfirmChannel, Options, ConsumeMessage } from 'amqplib';
import os from 'os';
import { mqPublishTotal, mqConsumeTotal } from '../observability/prometheus-metrics';

/**
 * A high–level RabbitMQ client that manages a single connection per process.
 *
 * This client implements best practices:
 * – lazy connection and channel creation
 * – connection name identifies the service, hostname and process id
 * – long‑lived confirm channel for publishing with publisher confirms
 * – per‑consumer channels with configurable prefetch counts
 * – graceful reconnection with exponential backoff and bounded attempts
 * – graceful shutdown hooks on SIGINT/SIGTERM
 */
export class RabbitMQClient {
  private static _instance: RabbitMQClient | null = null;
  private conn: Connection | null = null;
  private publisherChannel: ConfirmChannel | null = null;
  private consumerChannels: Map<string, Channel> = new Map();
  private reconnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;
  private readonly heartbeat: number;
  private readonly url: string;
  
  // Connection tracking metrics
  private connectionStartTime: number = 0;
  private totalReconnects = 0;
  private isBlocked = false;

  private constructor() {
    this.url = process.env.CLOUDAMQP_URL || '';
    this.heartbeat = Number(process.env.RABBITMQ_HEARTBEAT || '30');
    this.maxReconnectAttempts = Number(process.env.RABBITMQ_MAX_RECONNECT_ATTEMPTS || '8');
    if (!this.url) {
      throw new Error('CLOUDAMQP_URL environment variable must be defined');
    }
  }

  /**
   * Returns the singleton client instance.
   */
  static getInstance(): RabbitMQClient {
    if (!this._instance) {
      this._instance = new RabbitMQClient();
      // Start initial connection attempt
      this._instance.connect().catch(err => {
        console.error('[RabbitMQ] Initial connection failed:', err);
      });
    }
    return this._instance;
  }

  /**
   * Lazily connect to the broker. If already connected, resolves immediately.
   */
  private async connect(): Promise<void> {
    if (this.conn) return;

    const connectionName = `${process.env.SERVICE_NAME || 'loanserve'}@${os.hostname()}#${process.pid}`;
    const conn = await amqplib.connect(this.url + `?heartbeat=${this.heartbeat}`, {
      clientProperties: {
        connection_name: connectionName,
      },
    } as Options.Connect);

    conn.on('error', (err) => {
      console.error('[RabbitMQ] connection error:', err);
    });
    conn.on('close', () => {
      console.warn('[RabbitMQ] connection closed');
      this.conn = null;
      this.publisherChannel = null;
      // Clear consumer channels; they will be recreated on next consume
      this.consumerChannels.clear();
      if (!this.reconnecting) {
        this.scheduleReconnect();
      }
    });
    conn.on('blocked', (reason) => {
      console.warn('[RabbitMQ] connection blocked:', reason);
      this.isBlocked = true;
    });
    conn.on('unblocked', () => {
      console.log('[RabbitMQ] connection unblocked');
      this.isBlocked = false;
    });

    this.conn = conn;
    this.connectionStartTime = Date.now();
    console.log(`[RabbitMQ] Connected as ${connectionName}`);
  }

  /**
   * Schedules a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect() {
    if (this.reconnecting) return;
    this.reconnecting = true;

    const attemptReconnect = async () => {
      try {
        await this.connect();
        this.reconnecting = false;
        this.reconnectAttempts = 0;
        console.log('[RabbitMQ] Reconnection successful');
      } catch (err) {
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error(`[RabbitMQ] max reconnect attempts (${this.maxReconnectAttempts}) reached; giving up`);
          this.reconnecting = false;
          return;
        }
        const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 60_000);
        console.warn(`[RabbitMQ] reconnect attempt ${this.reconnectAttempts} failed; retrying in ${delay}ms`);
        setTimeout(attemptReconnect, delay);
      }
    };
    setTimeout(attemptReconnect, 0);
  }

  /**
   * Lazily create or return the confirm channel used for publishing.
   */
  private async getPublisherChannel(): Promise<ConfirmChannel> {
    if (this.publisherChannel) return this.publisherChannel;
    await this.connect();
    const channel = await this.conn!.createConfirmChannel();
    channel.on('error', (err) => {
      console.error('[RabbitMQ] publisher channel error:', err);
      this.publisherChannel = null;
    });
    channel.on('close', () => {
      console.warn('[RabbitMQ] publisher channel closed');
      this.publisherChannel = null;
    });
    this.publisherChannel = channel;
    return channel;
  }

  /**
   * Publish a message to an exchange with routing key.
   * Waits for publisher confirm or rejects on error.
   */
  async publish(exchange: string, routingKey: string, content: Buffer, options?: Options.Publish): Promise<void> {
    const ch = await this.getPublisherChannel();
    
    // Increment metrics counter
    try {
      mqPublishTotal.inc({ exchange, routing_key: routingKey });
    } catch (error) {
      console.warn('[RabbitMQ] Failed to increment publish metric:', error);
    }
    
    await new Promise<void>((resolve, reject) => {
      ch.publish(
        exchange,
        routingKey,
        content,
        {
          persistent: true,
          mandatory: true,
          ...options,
        },
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  /**
   * Publish JSON payload to an exchange with routing key.
   */
  async publishJSON(exchange: string, routingKey: string, payload: unknown, options?: Options.Publish): Promise<void> {
    const buffer = Buffer.from(JSON.stringify(payload));
    await this.publish(exchange, routingKey, buffer, {
      contentType: 'application/json',
      ...options,
    });
  }

  /**
   * Lazily create or return a channel for a consumer.
   * Each consumerTag gets its own channel with prefetch.
   */
  private async getConsumerChannel(consumerTag: string, prefetch?: number): Promise<Channel> {
    const existing = this.consumerChannels.get(consumerTag);
    if (existing) return existing;
    await this.connect();
    const ch = await this.conn!.createChannel();
    const pCount = prefetch ?? Number(process.env.RABBITMQ_PREFETCH || '10');
    await ch.prefetch(pCount);
    ch.on('error', (err) => {
      console.error(`[RabbitMQ] consumer channel (${consumerTag}) error:`, err);
      this.consumerChannels.delete(consumerTag);
    });
    ch.on('close', () => {
      console.warn(`[RabbitMQ] consumer channel (${consumerTag}) closed`);
      this.consumerChannels.delete(consumerTag);
    });
    this.consumerChannels.set(consumerTag, ch);
    return ch;
  }

  /**
   * Start consuming messages from a queue.
   *
   * The handler is called with the raw ConsumeMessage and the parsed JSON body.
   * It should return a Promise; if it throws, the message is nacked without requeue.
   */
  async consume<T>(
    queue: string,
    handler: (msg: T, raw: ConsumeMessage, ch: Channel) => Promise<void>,
    opts?: { prefetch?: number; consumerTag?: string; noAck?: boolean; exclusive?: boolean }
  ): Promise<string> {
    const tag = opts?.consumerTag ?? queue;
    const ch = await this.getConsumerChannel(tag, opts?.prefetch);
    const { consumerTag } = await ch.consume(
      queue,
      async (msg) => {
        if (!msg) return;
        
        // Increment metrics counter
        try {
          mqConsumeTotal.inc({ queue });
        } catch (error) {
          console.warn('[RabbitMQ] Failed to increment consume metric:', error);
        }
        
        try {
          const body = JSON.parse(msg.content.toString());
          await handler(body, msg, ch);
          if (!opts?.noAck) ch.ack(msg);
        } catch (err) {
          console.error(`[RabbitMQ] error handling message on ${queue}:`, err);
          ch.nack(msg, false, false); // drop to DLQ on failure
        }
      },
      {
        noAck: opts?.noAck ?? false,
        exclusive: opts?.exclusive ?? false,
        consumerTag: tag,
      }
    );
    return consumerTag;
  }

  /**
   * Cancel an active consumer by tag.
   */
  async cancelConsumer(tag: string): Promise<void> {
    const ch = this.consumerChannels.get(tag);
    if (ch) {
      try {
        await ch.cancel(tag);
        await ch.close();
      } catch (err) {
        console.error(`[RabbitMQ] error cancelling consumer (${tag}):`, err);
      }
      this.consumerChannels.delete(tag);
    }
  }

  /**
   * Create an admin channel for one-off operations like queue management.
   */
  async withAdminChannel<T>(operation: (channel: Channel) => Promise<T>): Promise<T> {
    await this.connect();
    const ch = await this.conn!.createChannel();
    try {
      return await operation(ch);
    } finally {
      await ch.close();
    }
  }

  /**
   * Get connection statistics.
   */
  getConnectionStats() {
    return {
      connected: !!this.conn,
      publisherChannelActive: !!this.publisherChannel,
      consumerChannels: this.consumerChannels.size,
      reconnecting: this.reconnecting,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Get connection information for monitoring/debugging.
   */
  async getConnectionInfo() {
    // Try to connect if not already connected (for monitoring)
    if (!this.conn && !this.reconnecting) {
      try {
        await this.connect();
      } catch (error) {
        console.error('[RabbitMQ] Connection attempt failed during monitoring check:', error);
      }
    }
    
    return {
      connected: !!this.conn,
      reconnectAttempts: this.reconnectAttempts,
      totalReconnects: this.totalReconnects,
      publisherConnected: !!this.publisherChannel,
      consumerConnected: this.consumerChannels.size > 0,
      activeConsumers: this.consumerChannels.size,
      uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0,
      isBlocked: this.isBlocked,
    };
  }

  /**
   * Get queue statistics for monitoring
   */
  async getQueueStats(queueName: string) {
    try {
      await this.connect();
      const ch = await this.conn!.createChannel();
      try {
        const queueInfo = await ch.checkQueue(queueName);
        return {
          queue: queueName,
          messageCount: queueInfo.messageCount,
          consumerCount: queueInfo.consumerCount,
        };
      } finally {
        try {
          await ch.close();
        } catch (closeError) {
          console.error('[RabbitMQ] Error closing stats channel:', closeError);
        }
      }
    } catch (error) {
      console.error(`[RabbitMQ] Failed to get queue stats for ${queueName}:`, error);
      return null;
    }
  }

  /**
   * Get DLQ channel for Dead Letter Queue operations
   */
  async getDLQChannel(): Promise<Channel | null> {
    try {
      await this.connect();
      return await this.conn!.createChannel();
    } catch (error) {
      console.error('[RabbitMQ] Failed to create DLQ channel:', error);
      return null;
    }
  }

  /**
   * Gracefully close channels and connection.
   */
  async shutdown(): Promise<void> {
    console.log('[RabbitMQ] Starting graceful shutdown...');
    
    // Close consumer channels
    for (const [tag, ch] of this.consumerChannels) {
      try {
        await ch.close();
      } catch (err) {
        console.error(`[RabbitMQ] Error closing consumer channel ${tag}:`, err);
      }
    }
    this.consumerChannels.clear();

    // Close publisher channel
    if (this.publisherChannel) {
      try {
        await this.publisherChannel.close();
      } catch (err) {
        console.error('[RabbitMQ] Error closing publisher channel:', err);
      }
      this.publisherChannel = null;
    }

    // Close connection
    if (this.conn) {
      try {
        await this.conn.close();
      } catch (err) {
        console.error('[RabbitMQ] Error closing connection:', err);
      }
      this.conn = null;
    }
    
    console.log('[RabbitMQ] Graceful shutdown complete');
  }
}

// Export singleton instance
export const rabbitmqClient = RabbitMQClient.getInstance();

// Attach graceful shutdown handlers
['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig as NodeJS.Signals, async () => {
    try {
      await rabbitmqClient.shutdown();
    } finally {
      process.exit(0);
    }
  });
});

/**
 * Convenience helper to publish JSON objects.
 */
export async function publishJSON(
  exchange: string,
  routingKey: string,
  payload: unknown,
  options?: Options.Publish
): Promise<void> {
  await rabbitmqClient.publishJSON(exchange, routingKey, payload, options);
}