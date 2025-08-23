#!/usr/bin/env tsx
import amqp from 'amqplib';

async function testDLQ() {
  console.log('[DLQ Test] Starting DLQ test...');
  
  // Connect directly to CloudAMQP
  const cloudamqpUrl = process.env.CLOUDAMQP_URL || 'amqps://dakjacqm:KVYaHXxCWleHs9tHn1uvrpWwTlpLZt-o@duck.lmq.cloudamqp.com/dakjacqm';
  
  const connection = await amqp.connect(cloudamqpUrl);
  const channel = await connection.createChannel();
  
  console.log('[DLQ Test] Connected to CloudAMQP');

  // Send some test messages directly to DLQs
  const testMessages = [
    {
      type: 'payment_failure',
      error: 'Loan ID not found in database',
      originalPayload: {
        loanId: 'INVALID-LOAN-999',
        amount: 1000,
        paymentDate: new Date().toISOString()
      },
      timestamp: Date.now()
    },
    {
      type: 'validation_error',
      error: 'Payment amount exceeds loan balance',
      originalPayload: {
        loanId: 'LN1755658942531',
        amount: 999999,
        paymentDate: new Date().toISOString()
      },
      timestamp: Date.now()
    },
    {
      type: 'processing_timeout',
      error: 'Payment processing timed out after 30 seconds',
      originalPayload: {
        loanId: 'LN1755658942531',
        amount: 500,
        paymentDate: new Date().toISOString()
      },
      timestamp: Date.now()
    }
  ];

  console.log('[DLQ Test] Sending test messages to DLQs...');

  // Send to different DLQs
  const dlqQueues = ['dlq.payments', 'dlq.settlement', 'dlq.reconciliation'];
  
  for (const [index, message] of testMessages.entries()) {
    const queueName = dlqQueues[index % dlqQueues.length];
    
    try {
      await channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          messageId: `test-msg-${Date.now()}-${index}`,
          timestamp: Date.now(),
          headers: {
            'x-death': [{
              count: 3,
              exchange: 'payments.topic',
              queue: queueName.replace('dlq.', ''),
              reason: 'rejected',
              'routing-keys': [queueName.replace('dlq.', '')],
              time: new Date()
            }],
            'x-original-error': message.error,
            'x-retry-count': 3
          }
        }
      );
      
      console.log(`[DLQ Test] ✓ Sent message to ${queueName}`);
    } catch (error) {
      console.error(`[DLQ Test] Failed to send to ${queueName}:`, error);
    }
  }

  console.log('[DLQ Test] Test messages sent successfully!');
  console.log('[DLQ Test] You can now inspect them in the Queue Monitor > Dead Letter Queues tab');
  
  // Give time for messages to be confirmed
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Close connection
  await channel.close();
  await connection.close();
  
  process.exit(0);
}

testDLQ().catch(error => {
  console.error('[DLQ Test] Error:', error);
  process.exit(1);
});