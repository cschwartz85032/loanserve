/**
 * Messaging Infrastructure Test Endpoints
 */

import { Router } from 'express';
import { getEnhancedRabbitMQService, EnhancedRabbitMQService } from '../services/rabbitmq-enhanced.js';
import { getMessageFactory } from '../messaging/message-factory.js';
import { createIdempotentHandler } from '../messaging/idempotent-consumer.js';
import { topologyManager } from '../messaging/rabbitmq-topology.js';
import { MessagePriority } from '../../shared/messaging/envelope.js';

const router = Router();

// Get topology information
router.get('/topology', async (req, res) => {
  try {
    const stats = topologyManager.getStats();
    const exchanges = topologyManager.getExchangeNames();
    const queues = topologyManager.getQueueNames();
    
    res.json({
      success: true,
      stats,
      exchanges,
      queues: queues.slice(0, 20), // Limit for display
      totalQueues: queues.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Test message publishing with envelope
router.post('/publish-test', async (req, res) => {
  try {
    const { exchange = 'payments.topic', routingKey = 'payment.test.received', data } = req.body;
    
    const rabbitmq = getEnhancedRabbitMQService();
    const factory = getMessageFactory();
    
    // Create a properly formatted message
    const envelope = factory.createMessage(
      'loanserve.v1.payment.received',
      data || {
        paymentId: 'PMT-' + Date.now(),
        amount: 1000.00,
        loanId: 'LN-TEST-001',
        type: 'ach',
        timestamp: new Date().toISOString(),
      },
      {
        priority: MessagePriority.NORMAL,
        ttl: 300000, // 5 minutes
      }
    );

    // Publish with confirms
    const published = await rabbitmq.publish(envelope, {
      exchange,
      routingKey,
      persistent: true,
    });

    res.json({
      success: true,
      message: 'Message published with envelope',
      messageId: envelope.message_id,
      correlationId: envelope.correlation_id,
      published,
    });
  } catch (error: any) {
    console.error('Publish test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Test batch publishing
router.post('/publish-batch', async (req, res) => {
  try {
    const { count = 10 } = req.body;
    
    const rabbitmq = getEnhancedRabbitMQService();
    const factory = getMessageFactory();
    
    // Create batch of messages
    const messages = factory.createBatch(
      'loanserve.v1.servicing.task',
      Array.from({ length: count }, (_, i) => ({
        taskId: `TASK-${Date.now()}-${i}`,
        loanId: `LN-${Math.floor(Math.random() * 100)}`,
        taskType: 'interest_accrual',
        dueDate: new Date().toISOString(),
      }))
    );

    // Calculate shards and publish
    const results = await Promise.all(
      messages.map(async (envelope) => {
        const loanId = envelope.data.loanId;
        const shard = EnhancedRabbitMQService.calculateShard(loanId, 8);
        
        return rabbitmq.publish(envelope, {
          exchange: 'servicing.direct',
          routingKey: `servicing.${shard}.interest`,
        });
      })
    );

    const successCount = results.filter(r => r).length;

    res.json({
      success: true,
      message: `Published ${successCount} of ${count} messages`,
      correlationId: messages[0].correlation_id,
    });
  } catch (error: any) {
    console.error('Batch publish error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Test idempotent consumer
router.post('/test-idempotent', async (req, res) => {
  try {
    const { messageId = 'test-' + Date.now() } = req.body;
    
    // Create an idempotent handler
    const handler = createIdempotentHandler(
      'test-consumer',
      async (data: any, context) => {
        console.log('Processing message:', data);
        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 100));
        return { processed: true, timestamp: Date.now() };
      }
    );

    const factory = getMessageFactory();
    const envelope = factory.createMessage(
      'loanserve.v1.test',
      { test: true, messageId },
      { message_id: messageId } // Force specific ID for testing
    );

    // Process the message twice to test idempotency
    const result1 = await handler(envelope);
    const result2 = await handler(envelope);

    res.json({
      success: true,
      message: 'Idempotency test completed',
      firstRun: result1,
      secondRun: result2,
      idempotent: result1.result_hash === result2.result_hash,
    });
  } catch (error: any) {
    console.error('Idempotency test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get queue statistics
router.get('/queue-stats/:queue', async (req, res) => {
  try {
    const { queue } = req.params;
    const rabbitmq = getEnhancedRabbitMQService();
    
    const stats = await rabbitmq.getQueueStats(queue);
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Queue not found or not accessible',
      });
    }

    res.json({
      success: true,
      queue: stats.queue,
      messageCount: stats.messageCount,
      consumerCount: stats.consumerCount,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get connection information
router.get('/connection-info', async (req, res) => {
  try {
    const rabbitmq = getEnhancedRabbitMQService();
    const info = rabbitmq.getConnectionInfo();
    
    res.json({
      success: true,
      connectionInfo: info,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Test consumer (starts a consumer for testing)
router.post('/start-test-consumer', async (req, res) => {
  try {
    const { queue = 'payments.validation' } = req.body;
    
    const rabbitmq = getEnhancedRabbitMQService();
    
    const consumerTag = await rabbitmq.consume(
      {
        queue,
        prefetch: 10,
        consumerTag: `test-consumer-${Date.now()}`,
      },
      async (envelope, msg) => {
        console.log(`[TestConsumer] Received message:`, {
          messageId: envelope.message_id,
          schema: envelope.schema,
          data: envelope.data,
        });
        
        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log(`[TestConsumer] Processed message ${envelope.message_id}`);
      }
    );

    res.json({
      success: true,
      message: 'Test consumer started',
      consumerTag,
      queue,
    });
  } catch (error: any) {
    console.error('Start consumer error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;