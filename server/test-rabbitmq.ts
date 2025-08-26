#!/usr/bin/env tsx
/**
 * Test script to verify RabbitMQ messaging infrastructure
 */

import { getEnhancedRabbitMQService } from './services/rabbitmq-enhanced.js';
import { v4 as uuidv4 } from 'uuid';

async function testRabbitMQ() {
  console.log('[Test] Starting RabbitMQ messaging test...');
  
  try {
    const rabbitmq = getEnhancedRabbitMQService();
    
    // Wait for connection
    console.log('[Test] Waiting for RabbitMQ connection...');
    await rabbitmq.waitForConnection();
    console.log('[Test] RabbitMQ connected');
    
    // Test publishing to remit.events exchange
    const testEvent = {
      eventType: 'remittance.test.v1',
      payload: {
        message: 'Test event for RabbitMQ infrastructure',
        timestamp: new Date().toISOString(),
        testId: uuidv4()
      },
      metadata: {
        correlationId: uuidv4(),
        timestamp: new Date().toISOString()
      }
    };
    
    console.log('[Test] Publishing test event to remit.events exchange...');
    const published = await rabbitmq.publish(
      {
        message_id: uuidv4(),
        correlation_id: testEvent.metadata.correlationId,
        causation_id: uuidv4(),
        schema: 'remittance.test.v1',
        priority: 5,
        data: testEvent.payload,
        trace_id: uuidv4(),
        occurred_at: new Date().toISOString(),
        producer: 'test-script',
        version: 1,
        headers: {
          'x-test': 'true',
          'x-timestamp': new Date().toISOString()
        }
      },
      {
        exchange: 'remit.events',
        routingKey: 'remit.test',
        persistent: true,
        mandatory: false
      }
    );
    
    if (published) {
      console.log('[Test] ✓ Event successfully published to remit.events');
    } else {
      console.log('[Test] ✗ Failed to publish event');
    }
    
    // Test cash.events exchange
    console.log('[Test] Publishing test event to cash.events exchange...');
    const cashPublished = await rabbitmq.publish(
      {
        message_id: uuidv4(),
        correlation_id: uuidv4(),
        causation_id: uuidv4(),
        schema: 'cash.test.v1',
        priority: 5,
        data: { test: 'cash management event' },
        trace_id: uuidv4(),
        occurred_at: new Date().toISOString(),
        producer: 'test-script',
        version: 1,
        headers: {}
      },
      {
        exchange: 'cash.events',
        routingKey: 'cash.test',
        persistent: true,
        mandatory: false
      }
    );
    
    if (cashPublished) {
      console.log('[Test] ✓ Event successfully published to cash.events');
    } else {
      console.log('[Test] ✗ Failed to publish cash event');
    }
    
    console.log('\n[Test] All tests completed successfully!');
    
    // Graceful shutdown
    await rabbitmq.shutdown();
    console.log('[Test] Connection closed');
    process.exit(0);
    
  } catch (error) {
    console.error('[Test] Error:', error);
    process.exit(1);
  }
}

// Run the test
testRabbitMQ().catch(error => {
  console.error('[Test] Fatal error:', error);
  process.exit(1);
});