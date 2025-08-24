const amqp = require('amqplib');

const CLOUDAMQP_URL = 'amqps://dakjacqm:KVYaHXxCWleHs9tHn1uvrpWwTlpLZt-o@duck.lmq.cloudamqp.com/dakjacqm';

async function testMinimalConsumer() {
  console.log('Starting minimal consumer test...\n');
  
  try {
    // Connect to RabbitMQ
    const connection = await amqp.connect(CLOUDAMQP_URL);
    console.log('✓ Connected to RabbitMQ');
    
    const channel = await connection.createChannel();
    console.log('✓ Channel created');
    
    // Create a test queue
    const testQueue = 'test.minimal.queue';
    await channel.assertQueue(testQueue, { durable: false });
    console.log(`✓ Queue '${testQueue}' created`);
    
    // Publish a test message
    const testMessage = {
      message_id: 'TEST-' + Date.now(),
      data: { test: true, timestamp: new Date().toISOString() }
    };
    
    channel.sendToQueue(testQueue, Buffer.from(JSON.stringify(testMessage)));
    console.log('✓ Test message published:', testMessage);
    
    // Set up consumer
    console.log('\n Setting up consumer...');
    let messageReceived = false;
    
    await channel.consume(testQueue, (msg) => {
      console.log('\n=== Message Received ===');
      if (!msg) {
        console.log('Null message received');
        return;
      }
      
      try {
        console.log('Raw content:', msg.content.toString());
        const parsed = JSON.parse(msg.content.toString());
        console.log('Parsed message:', parsed);
        messageReceived = true;
        
        // Acknowledge the message
        channel.ack(msg);
        console.log('✓ Message acknowledged');
      } catch (error) {
        console.error('Error processing message:', error);
        channel.nack(msg, false, false);
      }
    });
    
    console.log('✓ Consumer started');
    
    // Wait for message
    console.log('\nWaiting for message processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (messageReceived) {
      console.log('\n✓ Test PASSED - Message was successfully consumed');
    } else {
      console.log('\n✗ Test FAILED - Message was not consumed');
    }
    
    // Check queue status
    const queueInfo = await channel.checkQueue(testQueue);
    console.log(`\nQueue status - Messages: ${queueInfo.messageCount}, Consumers: ${queueInfo.consumerCount}`);
    
    // Clean up
    await channel.deleteQueue(testQueue);
    await channel.close();
    await connection.close();
    console.log('\n✓ Cleanup complete');
    
  } catch (error) {
    console.error('\n✗ Test failed with error:', error);
  }
}

// Run the test
testMinimalConsumer().catch(console.error);