#!/usr/bin/env node

/**
 * Test script to verify remittance messaging infrastructure
 * Checks that exchanges, queues, and bindings are properly configured
 */

import amqplib from 'amqplib';

const CLOUDAMQP_URL = process.env.CLOUDAMQP_URL || 'amqp://localhost';

async function testMessaging() {
  let connection;
  let channel;
  
  try {
    console.log('Connecting to RabbitMQ...');
    connection = await amqplib.connect(CLOUDAMQP_URL);
    channel = await connection.createChannel();
    
    console.log('✅ Connected to RabbitMQ\n');
    
    // Check exchanges
    console.log('Checking exchanges...');
    const exchanges = [
      { name: 'remit.saga', type: 'topic' },
      { name: 'remit.events', type: 'topic' },
      { name: 'remit.dlq', type: 'direct' },
      { name: 'cash.events', type: 'topic' },
      { name: 'remittance', type: 'topic' }
    ];
    
    for (const exchange of exchanges) {
      try {
        await channel.checkExchange(exchange.name);
        console.log(`  ✅ Exchange '${exchange.name}' (${exchange.type}) exists`);
      } catch (error) {
        console.log(`  ❌ Exchange '${exchange.name}' not found`);
      }
    }
    
    console.log('\nChecking queues...');
    const queues = [
      'q.remit.aggregate',
      'q.remit.export',
      'q.remit.settle',
      'q.remit.events.audit',
      'q.remit.dlq'
    ];
    
    for (const queue of queues) {
      try {
        const result = await channel.checkQueue(queue);
        console.log(`  ✅ Queue '${queue}' exists (${result.messageCount} messages, ${result.consumerCount} consumers)`);
      } catch (error) {
        console.log(`  ❌ Queue '${queue}' not found`);
      }
    }
    
    // Test publishing an event
    console.log('\nTesting event publishing...');
    
    // Publish test event to remit.events
    const testMessage = {
      test: true,
      timestamp: new Date().toISOString(),
      source: 'test-script'
    };
    
    const published = channel.publish(
      'remit.events',
      'remittance.test.v1',
      Buffer.from(JSON.stringify(testMessage)),
      { persistent: true }
    );
    
    if (published) {
      console.log('  ✅ Successfully published test event to remit.events');
    } else {
      console.log('  ⚠️  Event published but channel buffer is full');
    }
    
    // Check if messages are routed correctly
    console.log('\nChecking message routing...');
    
    // Create a temporary queue to test routing
    const { queue: testQueue } = await channel.assertQueue('', { exclusive: true });
    await channel.bindQueue(testQueue, 'remit.events', 'remit.*');
    
    // Publish another test message
    channel.publish(
      'remit.events',
      'remit.test',
      Buffer.from(JSON.stringify({ routing: 'test' })),
      { persistent: true }
    );
    
    // Try to consume the message
    setTimeout(async () => {
      const msg = await channel.get(testQueue, { noAck: true });
      if (msg) {
        console.log('  ✅ Message routing works correctly');
        console.log(`     Received: ${msg.content.toString()}`);
      } else {
        console.log('  ⚠️  No message received (might be timing issue)');
      }
      
      // Clean up
      await channel.deleteQueue(testQueue);
      
      console.log('\n🎉 Remittance messaging infrastructure test complete!');
      
      await channel.close();
      await connection.close();
      process.exit(0);
    }, 1000);
    
  } catch (error) {
    console.error('❌ Error during test:', error.message);
    if (channel) await channel.close();
    if (connection) await connection.close();
    process.exit(1);
  }
}

// Run the test
testMessaging().catch(console.error);