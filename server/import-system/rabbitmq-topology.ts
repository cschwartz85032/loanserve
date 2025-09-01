import { Channel, Connection } from "amqplib";
import { rabbitmqClient } from "../services/rabbitmq-unified";

export interface ImportTopology {
  exchanges: {
    imports: string;
    validation: string;
    mapping: string;
    qc: string;
    dlq: string;
  };
  queues: {
    // Import processing queues
    importReceived: string;
    validateMismo: string;
    validateCsv: string;
    validateJson: string;
    validatePdf: string;
    
    // PDF processing queues
    pdfOcr: string;
    pdfClassification: string;
    
    // Mapping queues
    mapCanonical: string;
    enrichData: string;
    
    // Quality control queues
    qcStart: string;
    qcReview: string;
    
    // Error and retry queues
    importErrors: string;
    retryQueue: string;
    dlq: string;
  };
}

// Define the import system topology
export const IMPORT_TOPOLOGY: ImportTopology = {
  exchanges: {
    imports: "imports.exchange.v2",
    validation: "imports.validation.v2",
    mapping: "imports.mapping.v2", 
    qc: "imports.qc.v2",
    dlq: "imports.dlq.v2"
  },
  queues: {
    // Import processing queues
    importReceived: "imports.received.v2",
    validateMismo: "imports.validate.mismo.v2",
    validateCsv: "imports.validate.csv.v2",
    validateJson: "imports.validate.json.v2",
    validatePdf: "imports.validate.pdf.v2",
    
    // PDF processing queues
    pdfOcr: "imports.pdf.ocr.v2",
    pdfClassification: "imports.pdf.classify.v2",
    
    // Mapping queues
    mapCanonical: "imports.map.canonical.v2",
    enrichData: "imports.enrich.data.v2",
    
    // Quality control queues
    qcStart: "imports.qc.start.v2",
    qcReview: "imports.qc.review.v2",
    
    // Error and retry queues
    importErrors: "imports.errors.v2",
    retryQueue: "imports.retry.v2",
    dlq: "imports.dlq.dead.v2"
  }
};

/**
 * Set up the complete import system RabbitMQ topology
 */
export async function setupImportTopology(): Promise<void> {
  try {
    console.log('[ImportTopology] Setting up exchanges and queues...');

    // Create exchanges
    await setupExchanges();
    
    // Create queues
    await setupQueues();
    
    // Create bindings
    await setupBindings();
    
    console.log('[ImportTopology] Topology setup complete');
  } catch (error) {
    console.error('[ImportTopology] Failed to setup topology:', error);
    throw error;
  }
}

/**
 * Create all exchanges for the import system
 */
async function setupExchanges(): Promise<void> {
  const { exchanges } = IMPORT_TOPOLOGY;
  
  // Get a channel from rabbitmqClient
  const channel = await getChannel();
  
  try {
    // Main imports exchange - routes to validation
    await channel.assertExchange(exchanges.imports, "topic", {
      durable: true
    });
    
    // Validation exchange - routes to format-specific validators
    await channel.assertExchange(exchanges.validation, "topic", {
      durable: true
    });
    
    // Mapping exchange - routes to mapping and enrichment
    await channel.assertExchange(exchanges.mapping, "topic", {
      durable: true
    });
    
    // Quality control exchange
    await channel.assertExchange(exchanges.qc, "topic", {
      durable: true
    });
    
    // Dead letter exchange for failed messages
    await channel.assertExchange(exchanges.dlq, "direct", {
      durable: true
    });
    
    console.log('[ImportTopology] Created exchanges');
  } finally {
    await channel.close();
  }
}

/**
 * Create all queues for the import system
 */
async function setupQueues(): Promise<void> {
  const { queues, exchanges } = IMPORT_TOPOLOGY;
  
  const channel = await getChannel();
  
  try {
    // Import received queue - entry point
    await channel.assertQueue(queues.importReceived, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": exchanges.dlq,
        "x-dead-letter-routing-key": "import.failed",
        "x-max-retries": 3
      }
    });
    
    // Format-specific validation queues
    await channel.assertQueue(queues.validateMismo, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": exchanges.dlq,
        "x-dead-letter-routing-key": "validation.failed",
        "x-max-retries": 2
      }
    });
    
    await channel.assertQueue(queues.validateCsv, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": exchanges.dlq,
        "x-dead-letter-routing-key": "validation.failed",
        "x-max-retries": 2
      }
    });
    
    await channel.assertQueue(queues.validateJson, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": exchanges.dlq,
        "x-dead-letter-routing-key": "validation.failed",
        "x-max-retries": 2
      }
    });
    
    await channel.assertQueue(queues.validatePdf, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": exchanges.dlq,
        "x-dead-letter-routing-key": "validation.failed",
        "x-max-retries": 2
      }
    });
    
    // PDF processing queues
    await channel.assertQueue(queues.pdfOcr, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": exchanges.dlq,
        "x-dead-letter-routing-key": "pdf.ocr.failed",
        "x-max-retries": 1
      }
    });
    
    await channel.assertQueue(queues.pdfClassification, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": exchanges.dlq,
        "x-dead-letter-routing-key": "pdf.classification.failed",
        "x-max-retries": 1
      }
    });
    
    // Mapping queues
    await channel.assertQueue(queues.mapCanonical, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": exchanges.dlq,
        "x-dead-letter-routing-key": "mapping.failed",
        "x-max-retries": 3
      }
    });
    
    await channel.assertQueue(queues.enrichData, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": exchanges.dlq,
        "x-dead-letter-routing-key": "enrichment.failed",
        "x-max-retries": 2
      }
    });
    
    // Quality control queues
    await channel.assertQueue(queues.qcStart, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": exchanges.dlq,
        "x-dead-letter-routing-key": "qc.failed"
      }
    });
    
    await channel.assertQueue(queues.qcReview, {
      durable: true,
      arguments: {
        "x-message-ttl": 7 * 24 * 60 * 60 * 1000, // 7 days for manual review
        "x-dead-letter-exchange": exchanges.dlq,
        "x-dead-letter-routing-key": "qc.expired"
      }
    });
    
    // Error handling queues
    await channel.assertQueue(queues.importErrors, {
      durable: true
    });
    
    await channel.assertQueue(queues.retryQueue, {
      durable: true,
      arguments: {
        "x-message-ttl": 30 * 60 * 1000, // 30 minute delay for retries
        "x-dead-letter-exchange": exchanges.imports,
        "x-dead-letter-routing-key": "retry.reprocess"
      }
    });
    
    // Dead letter queue
    await channel.assertQueue(queues.dlq, {
      durable: true
    });
    
    console.log('[ImportTopology] Created queues');
  } finally {
    await channel.close();
  }
}

/**
 * Create bindings between exchanges and queues
 */
async function setupBindings(): Promise<void> {
  const { exchanges, queues } = IMPORT_TOPOLOGY;
  
  const channel = await getChannel();
  
  try {
    // Imports exchange bindings
    await channel.bindQueue(queues.importReceived, exchanges.imports, "import.received");
    await channel.bindQueue(queues.importReceived, exchanges.imports, "retry.reprocess");
    
    // Validation exchange bindings  
    await channel.bindQueue(queues.validateMismo, exchanges.validation, "validate.mismo");
    await channel.bindQueue(queues.validateCsv, exchanges.validation, "validate.csv");
    await channel.bindQueue(queues.validateJson, exchanges.validation, "validate.json");
    await channel.bindQueue(queues.validatePdf, exchanges.validation, "validate.pdf");
    
    // PDF processing bindings
    await channel.bindQueue(queues.pdfOcr, exchanges.validation, "pdf.ocr");
    await channel.bindQueue(queues.pdfClassification, exchanges.validation, "pdf.classify");
    
    // Mapping exchange bindings
    await channel.bindQueue(queues.mapCanonical, exchanges.mapping, "map.canonical");
    await channel.bindQueue(queues.enrichData, exchanges.mapping, "enrich.data");
    
    // Quality control bindings
    await channel.bindQueue(queues.qcStart, exchanges.qc, "qc.start");
    await channel.bindQueue(queues.qcReview, exchanges.qc, "qc.review");
    
    // Error bindings
    await channel.bindQueue(queues.importErrors, exchanges.dlq, "*.failed");
    await channel.bindQueue(queues.importErrors, exchanges.dlq, "*.expired");
    await channel.bindQueue(queues.dlq, exchanges.dlq, "#");
    
    console.log('[ImportTopology] Created bindings');
  } finally {
    await channel.close();
  }
}

/**
 * Get a channel from the rabbitmqClient for topology operations
 */
async function getChannel(): Promise<Channel> {
  // Ensure connection is established
  await rabbitmqClient.connect();
  
  // Get the connection and create a channel
  const connection = (rabbitmqClient as any).conn;
  if (!connection) {
    throw new Error('RabbitMQ connection not established');
  }
  
  return await connection.createChannel();
}

/**
 * Publish a message to the import system
 */
export async function publishImportMessage(
  routingKey: string,
  message: any,
  exchange: keyof ImportTopology['exchanges'] = 'imports'
): Promise<void> {
  const exchangeName = IMPORT_TOPOLOGY.exchanges[exchange];
  
  await rabbitmqClient.publishJSON(exchangeName, routingKey, message, {
    persistent: true,
    timestamp: Date.now(),
    messageId: `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    correlationId: message.correlationId || `import-${Date.now()}`
  });
  
  console.log(`[ImportTopology] Published message to ${exchangeName} with routing key: ${routingKey}`);
}

/**
 * Health check for import topology
 */
export async function checkImportTopologyHealth(): Promise<{
  healthy: boolean;
  exchanges: Record<string, boolean>;
  queues: Record<string, { messages: number; consumers: number }>;
}> {
  const channel = await getChannel();
  
  try {
    const result = {
      healthy: true,
      exchanges: {} as Record<string, boolean>,
      queues: {} as Record<string, { messages: number; consumers: number }>
    };
    
    // Check exchanges
    for (const [name, exchange] of Object.entries(IMPORT_TOPOLOGY.exchanges)) {
      try {
        await channel.checkExchange(exchange);
        result.exchanges[name] = true;
      } catch (error) {
        result.exchanges[name] = false;
        result.healthy = false;
      }
    }
    
    // Check queues
    for (const [name, queue] of Object.entries(IMPORT_TOPOLOGY.queues)) {
      try {
        const queueInfo = await channel.checkQueue(queue);
        result.queues[name] = {
          messages: queueInfo.messageCount,
          consumers: queueInfo.consumerCount
        };
      } catch (error) {
        result.queues[name] = { messages: -1, consumers: -1 };
        result.healthy = false;
      }
    }
    
    return result;
  } catch (error) {
    console.error('[ImportTopology] Health check failed:', error);
    return {
      healthy: false,
      exchanges: {},
      queues: {}
    };
  } finally {
    await channel.close();
  }
}