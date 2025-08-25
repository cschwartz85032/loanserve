import * as amqp from 'amqplib';

/**
 * @deprecated DO NOT USE - This basic RabbitMQ service lacks publisher confirms and is unsafe for payment processing.
 * Use EnhancedRabbitMQService or InstrumentedRabbitMQService instead.
 * 
 * Critical issues with this service:
 * - No publisher confirms (message loss possible)
 * - Single connection for both publishing and consuming (anti-pattern)
 * - No proper error recovery for critical failures
 * - Not suitable for financial transactions
 */
export class RabbitMQService {
  private connection: any = null;
  private channel: any = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000; // 5 seconds

  constructor(private connectionUrl: string) {
    console.warn('[DEPRECATION WARNING] RabbitMQService is deprecated. Use EnhancedRabbitMQService for payment processing.');
  }

  async connect(): Promise<void> {
    if (this.connection && !this.isConnectionClosed()) {
      return; // Already connected
    }

    if (this.isConnecting) {
      return; // Connection attempt in progress
    }

    try {
      this.isConnecting = true;
      console.log('[RabbitMQ] Connecting to CloudAMQP...');
      
      this.connection = await amqp.connect(this.connectionUrl);
      this.channel = await this.connection.createChannel();
      
      // Set up connection event handlers
      this.connection.on('error', this.handleConnectionError.bind(this));
      this.connection.on('close', this.handleConnectionClose.bind(this));
      
      this.reconnectAttempts = 0;
      console.log('[RabbitMQ] Successfully connected to CloudAMQP');
    } catch (error) {
      console.error('[RabbitMQ] Connection failed:', error);
      this.handleConnectionError(error as Error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private isConnectionClosed(): boolean {
    try {
      // Try to access connection properties to see if it's still alive
      return !this.connection || (this.connection as any).connection?.stream?.destroyed === true;
    } catch {
      return true;
    }
  }

  private async handleConnectionError(error: Error): Promise<void> {
    console.error('[RabbitMQ] Connection error:', error.message);
    this.connection = null;
    this.channel = null;
    await this.scheduleReconnect();
  }

  private async handleConnectionClose(): Promise<void> {
    console.warn('[RabbitMQ] Connection closed');
    this.connection = null;
    this.channel = null;
    await this.scheduleReconnect();
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[RabbitMQ] Max reconnection attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`[RabbitMQ] Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('[RabbitMQ] Reconnection failed:', error);
      }
    }, delay);
  }

  async ensureConnected(): Promise<void> {
    if (!this.connection || !this.channel || this.isConnectionClosed()) {
      await this.connect();
    }
  }

  async publish(exchange: string, routingKey: string, message: any, options?: any): Promise<boolean> {
    try {
      await this.ensureConnected();
      
      if (!this.channel) {
        throw new Error('No channel available');
      }

      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      return this.channel.publish(exchange, routingKey, messageBuffer, {
        persistent: true,
        timestamp: Date.now(),
        ...options
      });
    } catch (error) {
      console.error('[RabbitMQ] Publish failed:', error);
      throw error;
    }
  }

  async sendToQueue(queue: string, message: any, options?: any): Promise<boolean> {
    try {
      await this.ensureConnected();
      
      if (!this.channel) {
        throw new Error('No channel available');
      }

      // Ensure queue exists
      await this.channel.assertQueue(queue, { durable: true });
      
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      return this.channel.sendToQueue(queue, messageBuffer, {
        persistent: true,
        timestamp: Date.now(),
        ...options
      });
    } catch (error) {
      console.error('[RabbitMQ] Send to queue failed:', error);
      throw error;
    }
  }

  async consume(queue: string, callback: (message: any) => Promise<void>, options?: any): Promise<string> {
    try {
      await this.ensureConnected();
      
      if (!this.channel) {
        throw new Error('No channel available');
      }

      // Ensure queue exists
      await this.channel.assertQueue(queue, { durable: true });
      
      const result = await this.channel.consume(queue, async (msg: any) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            await callback(content);
            this.channel?.ack(msg);
          } catch (error) {
            console.error('[RabbitMQ] Message processing failed:', error);
            this.channel?.nack(msg, false, false); // Send to dead letter queue
          }
        }
      }, { noAck: false, ...options });

      return result.consumerTag;
    } catch (error) {
      console.error('[RabbitMQ] Consume failed:', error);
      throw error;
    }
  }

  async createExchange(exchange: string, type: 'direct' | 'topic' | 'fanout' | 'headers' = 'direct', options?: any): Promise<void> {
    try {
      await this.ensureConnected();
      
      if (!this.channel) {
        throw new Error('No channel available');
      }

      await this.channel.assertExchange(exchange, type, { durable: true, ...options });
      console.log(`[RabbitMQ] Exchange '${exchange}' created/verified`);
    } catch (error) {
      console.error('[RabbitMQ] Create exchange failed:', error);
      throw error;
    }
  }

  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    try {
      await this.ensureConnected();
      
      if (!this.channel) {
        throw new Error('No channel available');
      }

      await this.channel.assertQueue(queue, { durable: true });
      await this.channel.bindQueue(queue, exchange, routingKey);
      console.log(`[RabbitMQ] Queue '${queue}' bound to exchange '${exchange}' with routing key '${routingKey}'`);
    } catch (error) {
      console.error('[RabbitMQ] Bind queue failed:', error);
      throw error;
    }
  }

  async getConnectionInfo(): Promise<any> {
    await this.ensureConnected();
    
    return {
      connected: !!this.connection && !this.isConnectionClosed(),
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      console.log('[RabbitMQ] Connection closed gracefully');
    } catch (error) {
      console.error('[RabbitMQ] Error closing connection:', error);
    }
  }
}

// Singleton instance
let rabbitmqService: RabbitMQService | null = null;

/**
 * @deprecated DO NOT USE - Use getEnhancedRabbitMQService() from './rabbitmq-enhanced' instead
 * This function returns a basic service without publisher confirms which is unsafe for payment processing
 */
export function getRabbitMQService(): RabbitMQService {
  console.warn('[DEPRECATION WARNING] getRabbitMQService() is deprecated and unsafe for payment processing. Use getEnhancedRabbitMQService() instead.');
  
  if (!rabbitmqService) {
    const connectionUrl = process.env.CLOUDAMQP_URL;
    
    if (!connectionUrl) {
      throw new Error('CLOUDAMQP_URL environment variable is required');
    }
    
    rabbitmqService = new RabbitMQService(connectionUrl);
  }
  
  return rabbitmqService;
}

/**
 * @deprecated DO NOT USE - Use getEnhancedRabbitMQService from './rabbitmq-enhanced' instead
 */
export default getRabbitMQService;