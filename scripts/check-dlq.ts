#!/usr/bin/env tsx
import amqp from 'amqplib';

async function checkDLQ() {
  const cloudamqpUrl = process.env.CLOUDAMQP_URL || 'amqps://dakjacqm:KVYaHXxCWleHs9tHn1uvrpWwTlpLZt-o@duck.lmq.cloudamqp.com/dakjacqm';
  const connection = await amqp.connect(cloudamqpUrl);
  const channel = await connection.createChannel();
  
  try {
    const queues = ['dlq.payments', 'dlq.settlement', 'dlq.reconciliation'];
    for (const q of queues) {
      const info = await channel.checkQueue(q);
      console.log(`${q}: ${info.messageCount} messages`);
      
      // Try to get one message without consuming
      const msg = await channel.get(q, { noAck: false });
      if (msg) {
        console.log(`  - Sample message exists, rejecting back to queue`);
        channel.reject(msg, true); // Requeue it
      } else {
        console.log(`  - No messages found when trying to get`);
      }
    }
  } catch (e: any) {
    console.error('Error:', e.message);
  }
  
  await channel.close();
  await connection.close();
}

checkDLQ().catch(console.error);