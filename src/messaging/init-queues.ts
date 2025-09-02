/**
 * RabbitMQ Topology Initialization for AI Pipeline
 * Authoritative queue and exchange declarations with retry and DLQ support
 */

import * as amqp from 'amqplib';

export interface QueueTopology {
  exchanges: ExchangeDeclaration[];
  queues: QueueDeclaration[];
  bindings: BindingDeclaration[];
}

export interface ExchangeDeclaration {
  name: string;
  type: 'direct' | 'topic' | 'fanout' | 'headers';
  options: {
    durable: boolean;
    autoDelete?: boolean;
    internal?: boolean;
    arguments?: any;
  };
}

export interface QueueDeclaration {
  name: string;
  options: {
    durable: boolean;
    exclusive?: boolean;
    autoDelete?: boolean;
    arguments?: any;
  };
}

export interface BindingDeclaration {
  queue: string;
  exchange: string;
  routingKey: string;
  arguments?: any;
}

/**
 * AI Pipeline RabbitMQ Topology
 * Implements reliable message processing with retry and dead letter queues
 */
export const AI_PIPELINE_TOPOLOGY: QueueTopology = {
  exchanges: [
    // Main processing exchange
    {
      name: 'ai.pipeline.v2',
      type: 'topic',
      options: {
        durable: true,
        autoDelete: false
      }
    },
    // Retry exchange for failed messages
    {
      name: 'ai.pipeline.retry.v2',
      type: 'direct',
      options: {
        durable: true,
        autoDelete: false
      }
    },
    // Dead letter exchange for permanently failed messages
    {
      name: 'ai.pipeline.dlq.v2',
      type: 'direct',
      options: {
        durable: true,
        autoDelete: false
      }
    },
    // Loan boarding exchange
    {
      name: 'loan.board',
      type: 'topic',
      options: {
        durable: true,
        autoDelete: false
      }
    },
    // Monitoring and alerting exchange
    {
      name: 'ai.monitoring.v2',
      type: 'topic',
      options: {
        durable: true,
        autoDelete: false
      }
    }
  ],

  queues: [
    // Document intake and splitting
    {
      name: 'q.document.split.v2',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'document.split.retry',
          'x-message-ttl': 300000, // 5 minutes
          'x-max-retries': 3
        }
      }
    },
    {
      name: 'q.document.split.retry.v2',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.dlq.v2',
          'x-dead-letter-routing-key': 'document.split.failed',
          'x-message-ttl': 600000, // 10 minutes retry delay
          'x-delivery-limit': 3
        }
      }
    },
    {
      name: 'q.document.split.dlq.v2',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum' // For reliability
        }
      }
    },

    // OCR processing
    {
      name: 'q.document.ocr.v2',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'document.ocr.retry',
          'x-message-ttl': 600000, // 10 minutes for OCR
          'x-max-retries': 2
        }
      }
    },
    {
      name: 'q.document.ocr.retry.v2',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.dlq.v2',
          'x-dead-letter-routing-key': 'document.ocr.failed',
          'x-message-ttl': 1200000, // 20 minutes retry delay
          'x-delivery-limit': 2
        }
      }
    },
    {
      name: 'q.document.ocr.dlq.v2',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum'
        }
      }
    },

    // AI extraction
    {
      name: 'q.document.extract.v2',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'document.extract.retry',
          'x-message-ttl': 900000, // 15 minutes for AI extraction
          'x-max-retries': 3
        }
      }
    },
    {
      name: 'q.document.extract.retry.v2',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.dlq.v2',
          'x-dead-letter-routing-key': 'document.extract.failed',
          'x-message-ttl': 1800000, // 30 minutes retry delay
          'x-delivery-limit': 3
        }
      }
    },
    {
      name: 'q.document.extract.dlq.v2',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum'
        }
      }
    },

    // Quality control
    {
      name: 'q.loan.qc.v2',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'loan.qc.retry',
          'x-message-ttl': 300000, // 5 minutes for QC
          'x-max-retries': 2
        }
      }
    },
    {
      name: 'q.loan.qc.retry.v2',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.dlq.v2',
          'x-dead-letter-routing-key': 'loan.qc.failed',
          'x-message-ttl': 600000, // 10 minutes retry delay
          'x-delivery-limit': 2
        }
      }
    },
    {
      name: 'q.loan.qc.dlq.v2',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum'
        }
      }
    },

    // Conflict resolution
    {
      name: 'q.conflict.resolve.v2',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'conflict.resolve.retry',
          'x-message-ttl': 180000, // 3 minutes
          'x-max-retries': 1
        }
      }
    },
    {
      name: 'q.conflict.resolve.retry.v2',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.dlq.v2',
          'x-dead-letter-routing-key': 'conflict.resolve.failed',
          'x-message-ttl': 300000, // 5 minutes retry delay
          'x-delivery-limit': 1
        }
      }
    },
    {
      name: 'q.conflict.resolve.dlq.v2',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum'
        }
      }
    },

    // Monitoring and alerting
    {
      name: 'q.monitoring.metrics.v2',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-max-length': 10000 // Limit queue size
        }
      }
    },
    {
      name: 'q.monitoring.alerts.v2',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 86400000 // 24 hours
        }
      }
    },

    // Pipeline coordination
    {
      name: 'q.pipeline.status.v2',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum'
        }
      }
    },

    // Loan boarding queues
    {
      name: 'loan.finalize.completed.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'loan.finalize.completed.retry',
          'x-message-ttl': 300000, // 5 minutes for finalize completion
          'x-max-retries': 2
        }
      }
    },
    {
      name: 'loan.board.request.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'loan.board.request.retry',
          'x-message-ttl': 300000, // 5 minutes for boarding request
          'x-max-retries': 2
        }
      }
    },
    {
      name: 'loan.board.completed.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'loan.board.completed.retry',
          'x-message-ttl': 300000, // 5 minutes for boarding completion
          'x-max-retries': 2
        }
      }
    }
  ],

  bindings: [
    // Document processing bindings
    { queue: 'q.document.split.v2', exchange: 'ai.pipeline.v2', routingKey: 'document.split' },
    { queue: 'q.document.ocr.v2', exchange: 'ai.pipeline.v2', routingKey: 'document.ocr' },
    { queue: 'q.document.extract.v2', exchange: 'ai.pipeline.v2', routingKey: 'document.extract' },
    
    // QC and conflict resolution bindings
    { queue: 'q.loan.qc.v2', exchange: 'ai.pipeline.v2', routingKey: 'loan.qc' },
    { queue: 'q.conflict.resolve.v2', exchange: 'ai.pipeline.v2', routingKey: 'conflict.resolve' },

    // Retry bindings
    { queue: 'q.document.split.retry.v2', exchange: 'ai.pipeline.retry.v2', routingKey: 'document.split.retry' },
    { queue: 'q.document.ocr.retry.v2', exchange: 'ai.pipeline.retry.v2', routingKey: 'document.ocr.retry' },
    { queue: 'q.document.extract.retry.v2', exchange: 'ai.pipeline.retry.v2', routingKey: 'document.extract.retry' },
    { queue: 'q.loan.qc.retry.v2', exchange: 'ai.pipeline.retry.v2', routingKey: 'loan.qc.retry' },
    { queue: 'q.conflict.resolve.retry.v2', exchange: 'ai.pipeline.retry.v2', routingKey: 'conflict.resolve.retry' },

    // DLQ bindings
    { queue: 'q.document.split.dlq.v2', exchange: 'ai.pipeline.dlq.v2', routingKey: 'document.split.failed' },
    { queue: 'q.document.ocr.dlq.v2', exchange: 'ai.pipeline.dlq.v2', routingKey: 'document.ocr.failed' },
    { queue: 'q.document.extract.dlq.v2', exchange: 'ai.pipeline.dlq.v2', routingKey: 'document.extract.failed' },
    { queue: 'q.loan.qc.dlq.v2', exchange: 'ai.pipeline.dlq.v2', routingKey: 'loan.qc.failed' },
    { queue: 'q.conflict.resolve.dlq.v2', exchange: 'ai.pipeline.dlq.v2', routingKey: 'conflict.resolve.failed' },

    // Monitoring bindings
    { queue: 'q.monitoring.metrics.v2', exchange: 'ai.monitoring.v2', routingKey: 'metrics.*' },
    { queue: 'q.monitoring.alerts.v2', exchange: 'ai.monitoring.v2', routingKey: 'alert.*' },
    { queue: 'q.pipeline.status.v2', exchange: 'ai.monitoring.v2', routingKey: 'status.*' },

    // Loan boarding bindings
    { queue: 'loan.finalize.completed.q', exchange: 'loan.board', routingKey: 'finalize.completed' },
    { queue: 'loan.board.request.q', exchange: 'loan.board', routingKey: 'request' },
    { queue: 'loan.board.completed.q', exchange: 'loan.board', routingKey: 'completed' }
  ]
};

/**
 * Initialize RabbitMQ topology
 */
export async function initializeAIPipelineTopology(connectionUrl: string): Promise<void> {
  console.log('[RabbitMQ] Initializing AI Pipeline topology...');
  
  let connection: amqp.Connection | null = null;
  let channel: amqp.Channel | null = null;

  try {
    // Connect to RabbitMQ
    connection = await amqp.connect(connectionUrl);
    channel = await connection.createChannel();

    console.log('[RabbitMQ] Connected and channel created');

    // Create exchanges
    for (const exchange of AI_PIPELINE_TOPOLOGY.exchanges) {
      await channel.assertExchange(exchange.name, exchange.type, exchange.options);
      console.log(`[RabbitMQ] Created exchange: ${exchange.name}`);
    }

    // Create queues
    for (const queue of AI_PIPELINE_TOPOLOGY.queues) {
      await channel.assertQueue(queue.name, queue.options);
      console.log(`[RabbitMQ] Created queue: ${queue.name}`);
    }

    // Create bindings
    for (const binding of AI_PIPELINE_TOPOLOGY.bindings) {
      await channel.bindQueue(binding.queue, binding.exchange, binding.routingKey, binding.arguments);
      console.log(`[RabbitMQ] Created binding: ${binding.queue} -> ${binding.exchange}#${binding.routingKey}`);
    }

    console.log('[RabbitMQ] AI Pipeline topology initialization complete');

  } catch (error) {
    console.error('[RabbitMQ] Failed to initialize topology:', error);
    throw error;
  } finally {
    // Clean up connections
    if (channel) {
      try {
        await channel.close();
      } catch (error) {
        console.warn('[RabbitMQ] Error closing channel:', error);
      }
    }
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.warn('[RabbitMQ] Error closing connection:', error);
      }
    }
  }
}

/**
 * Get queue topology for programmatic access
 */
export function getAIPipelineTopology(): QueueTopology {
  return AI_PIPELINE_TOPOLOGY;
}

/**
 * Validate topology configuration
 */
export function validateTopology(topology: QueueTopology): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check that all binding queues exist
  const queueNames = new Set(topology.queues.map(q => q.name));
  const exchangeNames = new Set(topology.exchanges.map(e => e.name));

  for (const binding of topology.bindings) {
    if (!queueNames.has(binding.queue)) {
      errors.push(`Binding references non-existent queue: ${binding.queue}`);
    }
    if (!exchangeNames.has(binding.exchange)) {
      errors.push(`Binding references non-existent exchange: ${binding.exchange}`);
    }
  }

  // Check for required DLQ configuration
  const mainQueues = topology.queues.filter(q => !q.name.includes('retry') && !q.name.includes('dlq'));
  for (const queue of mainQueues) {
    if (!queue.options.arguments || !queue.options.arguments['x-dead-letter-exchange']) {
      errors.push(`Queue ${queue.name} missing dead letter exchange configuration`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Health check for RabbitMQ topology
 */
export async function healthCheckTopology(connectionUrl: string): Promise<{
  isHealthy: boolean;
  details: {
    connection: boolean;
    exchanges: string[];
    queues: string[];
    missingComponents: string[];
  };
}> {
  let connection: amqp.Connection | null = null;
  let channel: amqp.Channel | null = null;

  const details = {
    connection: false,
    exchanges: [] as string[],
    queues: [] as string[],
    missingComponents: [] as string[]
  };

  try {
    connection = await amqp.connect(connectionUrl);
    channel = await connection.createChannel();
    details.connection = true;

    // Check exchanges exist
    for (const exchange of AI_PIPELINE_TOPOLOGY.exchanges) {
      try {
        await channel.checkExchange(exchange.name);
        details.exchanges.push(exchange.name);
      } catch (error) {
        details.missingComponents.push(`exchange:${exchange.name}`);
      }
    }

    // Check queues exist
    for (const queue of AI_PIPELINE_TOPOLOGY.queues) {
      try {
        await channel.checkQueue(queue.name);
        details.queues.push(queue.name);
      } catch (error) {
        details.missingComponents.push(`queue:${queue.name}`);
      }
    }

    return {
      isHealthy: details.missingComponents.length === 0,
      details
    };

  } catch (error) {
    console.error('[RabbitMQ] Health check failed:', error);
    return {
      isHealthy: false,
      details
    };
  } finally {
    if (channel) {
      try {
        await channel.close();
      } catch (error) {
        console.warn('[RabbitMQ] Error closing health check channel:', error);
      }
    }
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.warn('[RabbitMQ] Error closing health check connection:', error);
      }
    }
  }
}