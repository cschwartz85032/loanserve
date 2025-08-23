#!/usr/bin/env tsx

/**
 * Simple Traffic Generator
 * Generates message traffic directly to CloudAMQP
 */

import amqp from 'amqplib';
import chalk from 'chalk';

async function generateTraffic() {
  console.log(chalk.cyan.bold('\n🚀 Starting Simple Traffic Generator\n'));
  
  const url = process.env.CLOUDAMQP_URL;
  if (!url) {
    throw new Error('CLOUDAMQP_URL not configured');
  }
  
  const connection = await amqp.connect(url);
  const channel = await connection.createConfirmChannel();
  
  let messageCount = 0;
  let errorCount = 0;
  const startTime = Date.now();
  
  console.log(chalk.green('✅ Connected to CloudAMQP!\n'));
  console.log(chalk.yellow('Generating traffic... Press Ctrl+C to stop\n'));
  
  // Message templates
  const messageTypes = [
    {
      exchange: 'payments.topic',
      routingKey: 'payment.validate',
      generateMessage: () => ({
        loan_id: Math.floor(Math.random() * 100) + 1,
        amount: Math.random() * 10000,
        payment_date: new Date().toISOString(),
        payment_method: ['ACH', 'WIRE', 'CHECK'][Math.floor(Math.random() * 3)]
      })
    },
    {
      exchange: 'payments.topic',
      routingKey: 'payment.process',
      generateMessage: () => ({
        payment_id: `PMT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        amount: Math.random() * 10000,
        status: 'PENDING'
      })
    },
    {
      exchange: 'documents.direct',
      routingKey: 'document.upload',
      generateMessage: () => ({
        loan_id: Math.floor(Math.random() * 100) + 1,
        document_id: `DOC-${Date.now()}`,
        document_type: 'LOAN_APPLICATION',
        file_size: Math.floor(Math.random() * 5000000)
      })
    },
    {
      exchange: 'notifications.topic',
      routingKey: 'notification.email',
      generateMessage: () => ({
        type: 'EMAIL',
        recipient: `user${Math.floor(Math.random() * 100)}@example.com`,
        subject: 'Payment Notification',
        template: 'payment_confirmation'
      })
    },
    {
      exchange: 'servicing.direct',
      routingKey: 'servicing.0.task',
      generateMessage: () => ({
        loan_id: Math.floor(Math.random() * 100) + 1,
        task_type: 'INTEREST_ACCRUAL',
        scheduled_date: new Date().toISOString()
      })
    },
    {
      exchange: 'servicing.direct',
      routingKey: 'servicing.1.task',
      generateMessage: () => ({
        loan_id: Math.floor(Math.random() * 100) + 1,
        task_type: 'FEE_ASSESSMENT',
        scheduled_date: new Date().toISOString()
      })
    },
    {
      exchange: 'settlement.topic',
      routingKey: 'ach.settlement.initiate',
      generateMessage: () => ({
        settlement_id: `STL-${Date.now()}`,
        amount: Math.random() * 50000,
        type: 'ACH_CREDIT'
      })
    },
    {
      exchange: 'reconciliation.topic',
      routingKey: 'match.payment',
      generateMessage: () => ({
        transaction_id: `TXN-${Date.now()}`,
        amount: Math.random() * 10000,
        matched: Math.random() > 0.3
      })
    }
  ];
  
  // Status display
  const statusInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = messageCount / elapsed;
    console.log(chalk.cyan(`📊 Stats: ${messageCount} messages | ${rate.toFixed(1)} msg/s | ${errorCount} errors`));
  }, 5000);
  
  // Generate messages continuously
  while (true) {
    const promises = [];
    
    // Send batch of messages
    for (let i = 0; i < 50; i++) {
      const msgType = messageTypes[Math.floor(Math.random() * messageTypes.length)];
      const message = Buffer.from(JSON.stringify(msgType.generateMessage()));
      
      promises.push(
        new Promise((resolve) => {
          channel.publish(
            msgType.exchange,
            msgType.routingKey,
            message,
            { persistent: true },
            (err) => {
              if (err) {
                errorCount++;
              } else {
                messageCount++;
              }
              resolve(null);
            }
          );
        })
      );
    }
    
    await Promise.all(promises);
    await channel.waitForConfirms();
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\n👋 Shutting down...'));
  process.exit(0);
});

// Run
generateTraffic().catch(error => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
});