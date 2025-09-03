/**
 * RabbitMQ Topology Initialization for AI Pipeline
 * Authoritative queue and exchange declarations with retry and DLQ support
 */

import * as amqp from 'amqplib';
import type { Channel } from "amqplib";

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
 * Declare a main queue with DLX routing to its .dlq,
 * a retry queue that dead-letters back to the main routing key after TTL,
 * and the .dlq queue bound on the DLX.
 */
export async function assertWithDlx(
  ch: Channel,
  exchange: string,         // producer exchange for this stage (topic)
  queue: string,            // main queue name (e.g., "loan.board.request.q")
  routingKey: string,       // main routing key (e.g., "request")
  options?: {
    mainTtlMs?: number;     // optional, when the stage wants a visible timeout
    retryTtlMs?: number;    // delay before returning from .retry to main
    quorum?: boolean;       // set quorum type for durability
  }
): Promise<void> {
  const mainTtlMs = options?.mainTtlMs ?? undefined;
  const retryTtlMs = options?.retryTtlMs ?? 15_000;
  const queueType = options?.quorum ? "quorum" : undefined;

  // application exchange and global DLX
  await ch.assertExchange(exchange, "topic", { durable: true });
  await ch.assertExchange("dlx", "topic", { durable: true });

  // main
  await ch.assertQueue(queue, {
    durable: true,
    arguments: {
      ...(queueType ? { "x-queue-type": queueType } : {}),
      ...(mainTtlMs ? { "x-message-ttl": mainTtlMs } : {}),
      "x-dead-letter-exchange": "dlx",
      "x-dead-letter-routing-key": `${queue}.dlq`
    }
  });
  await ch.bindQueue(queue, exchange, routingKey);

  // retry
  await ch.assertQueue(`${queue}.retry`, {
    durable: true,
    arguments: {
      ...(queueType ? { "x-queue-type": queueType } : {}),
      "x-dead-letter-exchange": exchange,
      "x-dead-letter-routing-key": routingKey,
      "x-message-ttl": retryTtlMs
    }
  });
  // Bind retry to DLX so producers can dead-letter into it when they want a delayed retry
  await ch.bindQueue(`${queue}.retry`, "dlx", `${queue}.retry`);

  // dead letter
  await ch.assertQueue(`${queue}.dlq`, {
    durable: true,
    arguments: {
      ...(queueType ? { "x-queue-type": queueType } : {})
    }
  });
  await ch.bindQueue(`${queue}.dlq`, "dlx", `${queue}.dlq`);
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
    // Servicing cycle exchange
    {
      name: 'svc.cycle',
      type: 'topic',
      options: {
        durable: true,
        autoDelete: false
      }
    },
    // Disbursement exchange
    {
      name: 'svc.disb',
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
    },

    // Servicing cycle queues
    {
      name: 'svc.cycle.tick.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'svc.cycle.tick.retry',
          'x-message-ttl': 300000, // 5 minutes for cycle tick
          'x-max-retries': 2
        }
      }
    },
    {
      name: 'svc.cycle.completed.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'svc.cycle.completed.retry',
          'x-message-ttl': 300000, // 5 minutes for cycle completion
          'x-max-retries': 2
        }
      }
    },

    // Disbursement queues
    {
      name: 'svc.disb.request.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'svc.disb.request.retry',
          'x-message-ttl': 600000, // 10 minutes for disbursement request
          'x-max-retries': 3
        }
      }
    },
    {
      name: 'svc.disb.completed.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.retry.v2',
          'x-dead-letter-routing-key': 'svc.disb.completed.retry',
          'x-message-ttl': 300000, // 5 minutes for disbursement completion
          'x-max-retries': 2
        }
      }
    },

    // RETRY QUEUES for loan boarding, servicing, and disbursements
    {
      name: 'loan.board.request.retry.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.dlq.v2',
          'x-dead-letter-routing-key': 'loan.board.request.failed',
          'x-message-ttl': 15000, // 15 seconds retry delay
          'x-queue-type': 'quorum'
        }
      }
    },
    {
      name: 'loan.board.completed.retry.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.dlq.v2',
          'x-dead-letter-routing-key': 'loan.board.completed.failed',
          'x-message-ttl': 15000,
          'x-queue-type': 'quorum'
        }
      }
    },
    {
      name: 'svc.cycle.tick.retry.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.dlq.v2',
          'x-dead-letter-routing-key': 'svc.cycle.tick.failed',
          'x-message-ttl': 15000,
          'x-queue-type': 'quorum'
        }
      }
    },
    {
      name: 'svc.cycle.completed.retry.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.dlq.v2',
          'x-dead-letter-routing-key': 'svc.cycle.completed.failed',
          'x-message-ttl': 15000,
          'x-queue-type': 'quorum'
        }
      }
    },
    {
      name: 'svc.disb.request.retry.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.dlq.v2',
          'x-dead-letter-routing-key': 'svc.disb.request.failed',
          'x-message-ttl': 30000, // 30 seconds for disbursements (more critical)
          'x-queue-type': 'quorum'
        }
      }
    },
    {
      name: 'svc.disb.completed.retry.q',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'ai.pipeline.dlq.v2',
          'x-dead-letter-routing-key': 'svc.disb.completed.failed',
          'x-message-ttl': 15000,
          'x-queue-type': 'quorum'
        }
      }
    },

    // DLQ QUEUES for loan boarding, servicing, and disbursements
    {
      name: 'loan.board.request.dlq.q',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 86400000 // 24 hours for manual investigation
        }
      }
    },
    {
      name: 'loan.board.completed.dlq.q',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 86400000
        }
      }
    },
    {
      name: 'svc.cycle.tick.dlq.q',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 86400000
        }
      }
    },
    {
      name: 'svc.cycle.completed.dlq.q',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 86400000
        }
      }
    },
    {
      name: 'svc.disb.request.dlq.q',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 86400000
        }
      }
    },
    {
      name: 'svc.disb.completed.dlq.q',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 86400000
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
    { queue: 'loan.board.request.q', exchange: 'loan.board', routingKey: 'request' },
    { queue: 'loan.board.completed.q', exchange: 'loan.board', routingKey: 'completed' },

    // Servicing cycle bindings
    { queue: 'svc.cycle.tick.q', exchange: 'svc.cycle', routingKey: 'tick' },
    { queue: 'svc.cycle.completed.q', exchange: 'svc.cycle', routingKey: 'completed' },

    // Disbursement bindings
    { queue: 'svc.disb.request.q', exchange: 'svc.disb', routingKey: 'request' },
    { queue: 'svc.disb.completed.q', exchange: 'svc.disb', routingKey: 'completed' },

    // RETRY BINDINGS for loan boarding, servicing, and disbursements
    { queue: 'loan.board.request.retry.q', exchange: 'ai.pipeline.retry.v2', routingKey: 'loan.board.request.retry' },
    { queue: 'loan.board.completed.retry.q', exchange: 'ai.pipeline.retry.v2', routingKey: 'loan.board.completed.retry' },
    { queue: 'svc.cycle.tick.retry.q', exchange: 'ai.pipeline.retry.v2', routingKey: 'svc.cycle.tick.retry' },
    { queue: 'svc.cycle.completed.retry.q', exchange: 'ai.pipeline.retry.v2', routingKey: 'svc.cycle.completed.retry' },
    { queue: 'svc.disb.request.retry.q', exchange: 'ai.pipeline.retry.v2', routingKey: 'svc.disb.request.retry' },
    { queue: 'svc.disb.completed.retry.q', exchange: 'ai.pipeline.retry.v2', routingKey: 'svc.disb.completed.retry' },

    // DLQ BINDINGS for loan boarding, servicing, and disbursements
    { queue: 'loan.board.request.dlq.q', exchange: 'ai.pipeline.dlq.v2', routingKey: 'loan.board.request.failed' },
    { queue: 'loan.board.completed.dlq.q', exchange: 'ai.pipeline.dlq.v2', routingKey: 'loan.board.completed.failed' },
    { queue: 'svc.cycle.tick.dlq.q', exchange: 'ai.pipeline.dlq.v2', routingKey: 'svc.cycle.tick.failed' },
    { queue: 'svc.cycle.completed.dlq.q', exchange: 'ai.pipeline.dlq.v2', routingKey: 'svc.cycle.completed.failed' },
    { queue: 'svc.disb.request.dlq.q', exchange: 'ai.pipeline.dlq.v2', routingKey: 'svc.disb.request.failed' },
    { queue: 'svc.disb.completed.dlq.q', exchange: 'ai.pipeline.dlq.v2', routingKey: 'svc.disb.completed.failed' }
  ]
};

/**
 * Initialize RabbitMQ topology using recommended assertWithDlx pattern
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

    // Create global DLX exchange first
    await channel.assertExchange("dlx", "topic", { durable: true });
    console.log('[RabbitMQ] Created global DLX exchange');

    // Create monitoring exchange for error events
    await channel.assertExchange("ops.notifications", "topic", { durable: true });
    console.log('[RabbitMQ] Created ops.notifications exchange');

    // Loan boarding queues with standardized DLX pattern
    await assertWithDlx(channel, "loan.board", "loan.board.request.q", "request", { retryTtlMs: 15_000, quorum: true });
    await assertWithDlx(channel, "loan.board", "loan.board.completed.q", "completed", { retryTtlMs: 15_000, quorum: true });
    
    // Loan finalization queues (missing from old topology!)
    await assertWithDlx(channel, "loan.board", "loan.finalize.completed.q", "finalize.completed", { retryTtlMs: 15_000, quorum: true });

    // Servicing cycle queues
    await assertWithDlx(channel, "svc.cycle", "svc.cycle.tick.q", "tick", { retryTtlMs: 15_000, quorum: true });
    await assertWithDlx(channel, "svc.cycle", "svc.cycle.completed.q", "completed", { retryTtlMs: 15_000, quorum: true });

    // Disbursement queues
    await assertWithDlx(channel, "svc.disb", "svc.disb.request.q", "request", { retryTtlMs: 15_000, quorum: true });
    await assertWithDlx(channel, "svc.disb", "svc.disb.completed.q", "completed", { retryTtlMs: 15_000, quorum: true });

    // AI Pipeline queues with new pattern
    await assertWithDlx(channel, "ai.pipeline.v2", "q.document.split.v2", "document.split", { retryTtlMs: 30_000, quorum: true });
    await assertWithDlx(channel, "ai.pipeline.v2", "q.document.ocr.v2", "document.ocr", { retryTtlMs: 60_000, quorum: true });
    await assertWithDlx(channel, "ai.pipeline.v2", "q.document.extract.v2", "document.extract", { retryTtlMs: 120_000, quorum: true });
    await assertWithDlx(channel, "ai.pipeline.v2", "q.loan.qc.v2", "loan.qc", { retryTtlMs: 30_000, quorum: true });
    await assertWithDlx(channel, "ai.pipeline.v2", "q.conflict.resolve.v2", "conflict.resolve", { retryTtlMs: 15_000, quorum: true });

    // Monitoring queues (no retry needed for these)
    await channel.assertQueue("q.monitoring.metrics.v2", {
      durable: true,
      arguments: {
        "x-queue-type": "quorum",
        "x-max-length": 10000
      }
    });
    await channel.bindQueue("q.monitoring.metrics.v2", "ops.notifications", "metrics.*");

    await channel.assertQueue("q.monitoring.alerts.v2", {
      durable: true,
      arguments: {
        "x-queue-type": "quorum",
        "x-message-ttl": 86400000
      }
    });
    await channel.bindQueue("q.monitoring.alerts.v2", "ops.notifications", "alert.*");

    await channel.assertQueue("q.worker.errors", {
      durable: true,
      arguments: {
        "x-queue-type": "quorum"
      }
    });
    await channel.bindQueue("q.worker.errors", "ops.notifications", "worker.error");

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