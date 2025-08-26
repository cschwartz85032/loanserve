import amqplib, { ConfirmChannel, Connection } from "amqplib";

// RabbitMQ Bootstrap Configuration
export interface RMQBootstrapConfig {
  url: string;
  retryAttempts?: number;
  retryDelay?: number;
  confirmTimeout?: number;
}

// Connection state
let connection: Connection | null = null;
let confirmChannel: ConfirmChannel | null = null;
let isReconnecting = false;

// Bootstrap RabbitMQ topology with exchanges, queues, and bindings
export async function bootstrapRMQ(url: string): Promise<{ conn: Connection; ch: ConfirmChannel }> {
  try {
    console.log('[RabbitMQ Bootstrap] Connecting to CloudAMQP...');
    
    // Create connection and confirm channel
    const conn = await amqplib.connect(url);
    const ch = await conn.createConfirmChannel() as ConfirmChannel;
    
    // Set prefetch for fair dispatch
    await ch.prefetch(1);
    
    console.log('[RabbitMQ Bootstrap] Creating topology...');
    
    // Quorum queue configuration for durability
    const quorum = { arguments: { "x-queue-type": "quorum" } };
    
    // ========================================
    // DECLARE EXCHANGES
    // ========================================
    
    // Inbound payments exchange - direct routing by payment method
    await ch.assertExchange("payments.inbound", "direct", { durable: true });
    
    // Validation exchange - topic routing for validation results
    await ch.assertExchange("payments.validation", "topic", { durable: true });
    
    // Events exchange - topic routing for payment events
    await ch.assertExchange("payments.events", "topic", { durable: true });
    
    // Saga exchange - topic routing for saga orchestration
    await ch.assertExchange("payments.saga", "topic", { durable: true });
    
    // Audit exchange - fanout for audit trail
    await ch.assertExchange("payments.audit", "fanout", { durable: true });
    
    // Dead letter exchange
    await ch.assertExchange("payments.dlq", "direct", { durable: true });
    
    // ========================================
    // PHASE 3: ESCROW SUBSYSTEM EXCHANGES
    // ========================================
    
    // Escrow saga exchange - topic routing for orchestration
    await ch.assertExchange("escrow.saga", "topic", { durable: true });
    
    // Escrow events exchange - topic routing for escrow events
    await ch.assertExchange("escrow.events", "topic", { durable: true });
    
    // Escrow dead letter exchange - direct routing for failed messages
    await ch.assertExchange("escrow.dlq", "direct", { durable: true });
    
    console.log('[RabbitMQ Bootstrap] Exchanges created including escrow subsystem');
    
    // ========================================
    // DECLARE QUEUES
    // ========================================
    
    // Validation queue - receives all inbound payments for validation
    // TEMPORARILY: Only assert durable, no quorum args to match existing CloudAMQP queue
    await ch.assertQueue("q.validate", { durable: true });
    
    // Classification queue - classifies validated payments
    // TEMPORARILY: Only assert durable, no quorum args to match existing CloudAMQP queue
    await ch.assertQueue("q.classify", { durable: true });
    
    // Rules posting queue - applies business rules
    // TEMPORARILY: Only assert durable, no quorum args to match existing CloudAMQP queue
    await ch.assertQueue("q.rules.post", { durable: true });
    
    // Poster queue - transactional posting with outbox
    // TEMPORARILY: Only assert durable, no quorum args to match existing CloudAMQP queue
    await ch.assertQueue("q.post", { durable: true });
    
    // Poster outbox queue - stages messages for posting
    // TEMPORARILY: Only assert durable, no quorum args to match existing CloudAMQP queue
    await ch.assertQueue("q.poster.outbox", { durable: true });
    
    // Outbox dispatch queue - dispatches outbox messages
    // TEMPORARILY: Only assert durable, no quorum args to match existing CloudAMQP queue
    await ch.assertQueue("q.outbox.dispatch", { durable: true });
    
    // Daily reconciliation queue
    // TEMPORARILY: Only assert durable, no quorum args to match existing CloudAMQP queue
    await ch.assertQueue("q.reconcile.daily", { durable: true });
    
    // Exception handling queue
    // TEMPORARILY: Only assert durable, no quorum args to match existing CloudAMQP queue
    await ch.assertQueue("q.exceptions", { durable: true });
    
    // Notifications queue
    // TEMPORARILY: Only assert durable, no quorum args to match existing CloudAMQP queue
    await ch.assertQueue("q.notifications", { durable: true });
    
    // Audit trail queue
    // TEMPORARILY: Only assert durable, no quorum args to match existing CloudAMQP queue
    await ch.assertQueue("q.audit", { durable: true });
    
    // Dead letter queue
    // TEMPORARILY: Only assert durable and TTL, no quorum args to match existing CloudAMQP queue
    await ch.assertQueue("q.dlq", { 
      durable: true,
      arguments: {
        "x-message-ttl": 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    });
    
    // ========================================
    // PHASE 3: ESCROW SUBSYSTEM QUEUES
    // ========================================
    
    // Escrow forecast queue
    await ch.assertQueue("q.forecast", { 
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "escrow.dlq",
        "x-dead-letter-routing-key": "forecast.failed"
      }
    });
    
    // Escrow disbursement scheduling queue
    await ch.assertQueue("q.schedule.disbursement", { 
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "escrow.dlq",
        "x-dead-letter-routing-key": "disbursement.failed"
      }
    });
    
    // Escrow analysis queue
    await ch.assertQueue("q.escrow.analysis", { 
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "escrow.dlq",
        "x-dead-letter-routing-key": "analysis.failed"
      }
    });
    
    // Escrow DLQ
    await ch.assertQueue("q.escrow.dlq", { 
      durable: true,
      arguments: {
        "x-message-ttl": 86400000 // 24 hours
      }
    });
    
    console.log('[RabbitMQ Bootstrap] Queues created including escrow subsystem');
    
    // ========================================
    // BIND QUEUES TO EXCHANGES
    // ========================================
    
    // Bind validation queue to all payment methods
    const paymentMethods = ["ach", "wire", "realtime", "check", "card", "paypal", "venmo", "book"];
    for (const method of paymentMethods) {
      await ch.bindQueue("q.validate", "payments.inbound", method);
    }
    
    // Bind classification queue to validation topic
    await ch.bindQueue("q.classify", "payments.validation", "payment.validated");
    
    // Bind rules posting to saga
    await ch.bindQueue("q.rules.post", "payments.saga", "saga.payment.start");
    
    // Bind poster queue to saga for final posting
    await ch.bindQueue("q.post", "payments.saga", "saga.payment.post");
    
    // Bind notifications to all payment events
    await ch.bindQueue("q.notifications", "payments.events", "payment.*");
    
    // Bind audit queue to audit exchange (fanout)
    await ch.bindQueue("q.audit", "payments.audit", "");
    
    // Bind exception queue to payment events
    await ch.bindQueue("q.exceptions", "payments.events", "payment.exception");
    await ch.bindQueue("q.exceptions", "payments.validation", "payment.failed");
    
    // Bind reconciliation queue to events
    await ch.bindQueue("q.reconcile.daily", "payments.events", "payment.posted");
    
    // Bind outbox queues
    await ch.bindQueue("q.poster.outbox", "payments.saga", "saga.ready.post");
    await ch.bindQueue("q.outbox.dispatch", "payments.saga", "saga.outbox.ready");
    
    // Bind DLQ
    await ch.bindQueue("q.dlq", "payments.dlq", "failed");
    
    // ========================================
    // PHASE 3: ESCROW SUBSYSTEM BINDINGS
    // ========================================
    
    // Bind escrow forecast queue
    await ch.bindQueue("q.forecast", "escrow.saga", "forecast.request");
    await ch.bindQueue("q.forecast", "escrow.saga", "forecast.retry");
    
    // Bind escrow disbursement queue
    await ch.bindQueue("q.schedule.disbursement", "escrow.saga", "disbursement.schedule");
    await ch.bindQueue("q.schedule.disbursement", "escrow.saga", "disbursement.retry");
    
    // Bind escrow analysis queue
    await ch.bindQueue("q.escrow.analysis", "escrow.saga", "analysis.request");
    await ch.bindQueue("q.escrow.analysis", "escrow.saga", "analysis.retry");
    
    // Bind escrow DLQ - catch all failures
    await ch.bindQueue("q.escrow.dlq", "escrow.dlq", "#");
    
    console.log('[RabbitMQ Bootstrap] Queue bindings created including escrow subsystem');
    
    // Store connection and channel
    connection = conn;
    confirmChannel = ch;
    
    // Set up error handlers
    setupErrorHandlers(conn, ch);
    
    console.log('[RabbitMQ Bootstrap] Topology setup complete');
    
    return { conn, ch };
  } catch (error) {
    console.error('[RabbitMQ Bootstrap] Failed to bootstrap:', error);
    throw error;
  }
}

// Set up error handlers for connection and channel
function setupErrorHandlers(conn: Connection, ch: ConfirmChannel) {
  // Handle connection errors
  conn.on('error', async (err) => {
    console.error('[RabbitMQ Bootstrap] Connection error:', err.message);
    connection = null;
    confirmChannel = null;
    await handleReconnect();
  });
  
  // Handle connection close
  conn.on('close', async () => {
    console.warn('[RabbitMQ Bootstrap] Connection closed');
    connection = null;
    confirmChannel = null;
    await handleReconnect();
  });
  
  // Handle channel errors
  ch.on('error', async (err) => {
    console.error('[RabbitMQ Bootstrap] Channel error:', err.message);
    confirmChannel = null;
    // Channel errors usually mean we need to recreate the channel
    if (connection) {
      try {
        const newCh = await connection.createConfirmChannel() as ConfirmChannel;
        confirmChannel = newCh;
        setupChannelErrorHandler(newCh);
        console.log('[RabbitMQ Bootstrap] Channel recreated');
      } catch (error) {
        console.error('[RabbitMQ Bootstrap] Failed to recreate channel:', error);
        await handleReconnect();
      }
    }
  });
  
  // Handle channel close
  ch.on('close', () => {
    console.warn('[RabbitMQ Bootstrap] Channel closed');
    confirmChannel = null;
  });
}

// Set up error handler for a channel
function setupChannelErrorHandler(ch: ConfirmChannel) {
  ch.on('error', async (err) => {
    console.error('[RabbitMQ Bootstrap] Channel error:', err.message);
    confirmChannel = null;
  });
  
  ch.on('close', () => {
    console.warn('[RabbitMQ Bootstrap] Channel closed');
    confirmChannel = null;
  });
}

// Handle reconnection with exponential backoff
async function handleReconnect() {
  if (isReconnecting) {
    return; // Already reconnecting
  }
  
  isReconnecting = true;
  let retryCount = 0;
  const maxRetries = 5;
  const baseDelay = 1000; // 1 second
  
  while (retryCount < maxRetries) {
    const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
    console.log(`[RabbitMQ Bootstrap] Reconnecting in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      const url = process.env.CLOUDAMQP_URL || process.env.AMQP_URL || 'amqp://localhost';
      const result = await bootstrapRMQ(url);
      connection = result.conn;
      confirmChannel = result.ch;
      isReconnecting = false;
      console.log('[RabbitMQ Bootstrap] Reconnection successful');
      return;
    } catch (error) {
      console.error('[RabbitMQ Bootstrap] Reconnection failed:', error);
      retryCount++;
    }
  }
  
  isReconnecting = false;
  console.error('[RabbitMQ Bootstrap] Max reconnection attempts reached');
}

// Publish with confirms and retry
export async function publishWithConfirm(
  exchange: string,
  routingKey: string,
  message: any,
  options?: any
): Promise<boolean> {
  if (!confirmChannel) {
    throw new Error('No confirm channel available');
  }
  
  const messageBuffer = Buffer.from(JSON.stringify(message));
  const timeout = options?.confirmTimeout || 5000; // 5 second default
  
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout;
    
    // Set up timeout
    timer = setTimeout(() => {
      reject(new Error(`Publish confirm timeout after ${timeout}ms`));
    }, timeout);
    
    // Publish with confirm
    confirmChannel!.publish(
      exchange,
      routingKey,
      messageBuffer,
      {
        persistent: true,
        timestamp: Date.now(),
        ...options
      },
      (err, ok) => {
        clearTimeout(timer);
        
        if (err) {
          console.error('[RabbitMQ Bootstrap] Publish confirm error:', err);
          reject(err);
        } else {
          resolve(true);
        }
      }
    );
  });
}

// Publish with retry and exponential backoff
export async function publishWithRetry(
  exchange: string,
  routingKey: string,
  message: any,
  options?: any,
  maxRetries: number = 3
): Promise<boolean> {
  let retryCount = 0;
  const baseDelay = 100; // 100ms
  
  while (retryCount <= maxRetries) {
    try {
      return await publishWithConfirm(exchange, routingKey, message, options);
    } catch (error) {
      if (retryCount === maxRetries) {
        console.error('[RabbitMQ Bootstrap] Max publish retries reached');
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
      console.warn(`[RabbitMQ Bootstrap] Publish failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      retryCount++;
      
      // Check if we need to reconnect
      if (!confirmChannel) {
        await handleReconnect();
      }
    }
  }
  
  return false;
}

// Get current connection and channel
export function getConnection(): { conn: Connection | null; ch: ConfirmChannel | null } {
  return { conn: connection, ch: confirmChannel };
}

// Close connection gracefully
export async function closeConnection(): Promise<void> {
  try {
    if (confirmChannel) {
      await confirmChannel.close();
      confirmChannel = null;
    }
    
    if (connection) {
      await connection.close();
      connection = null;
    }
    
    console.log('[RabbitMQ Bootstrap] Connection closed gracefully');
  } catch (error) {
    console.error('[RabbitMQ Bootstrap] Error closing connection:', error);
  }
}