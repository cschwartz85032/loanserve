#!/usr/bin/env tsx

/**
 * Traffic Generator for Queue System
 * Generates realistic message traffic to demonstrate throughput
 */

import { getEnhancedRabbitMQService } from '../server/services/rabbitmq-enhanced.js';
import chalk from 'chalk';

async function generateTraffic() {
  const rabbitmq = getEnhancedRabbitMQService();
  
  console.log(chalk.cyan.bold('\n🚀 Starting Traffic Generator\n'));
  console.log(chalk.gray('Connecting to RabbitMQ...'));
  
  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  let messageCount = 0;
  let errorCount = 0;
  const startTime = Date.now();
  
  // Generate different types of messages
  const messageTypes = [
    {
      exchange: 'payments.topic',
      routingKey: 'payment.validate',
      generateData: () => ({
        loan_id: Math.floor(Math.random() * 100) + 1,
        amount: Math.random() * 10000,
        payment_date: new Date().toISOString(),
        payment_method: ['ACH', 'WIRE', 'CHECK'][Math.floor(Math.random() * 3)],
        reference_number: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      })
    },
    {
      exchange: 'payments.topic',
      routingKey: 'payment.process',
      generateData: () => ({
        loan_id: Math.floor(Math.random() * 100) + 1,
        payment_id: `PMT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        amount: Math.random() * 10000,
        status: 'PENDING',
        processed_at: new Date().toISOString()
      })
    },
    {
      exchange: 'documents.direct',
      routingKey: 'document.upload',
      generateData: () => ({
        loan_id: Math.floor(Math.random() * 100) + 1,
        document_id: `DOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        document_type: ['LOAN_APPLICATION', 'DEED_OF_TRUST', 'NOTE', 'INSURANCE'][Math.floor(Math.random() * 4)],
        file_name: `document_${Date.now()}.pdf`,
        file_size: Math.floor(Math.random() * 5000000),
        uploaded_by: 'test-user',
        uploaded_at: new Date().toISOString()
      })
    },
    {
      exchange: 'notifications.topic',
      routingKey: 'notification.email',
      generateData: () => ({
        type: 'EMAIL',
        recipient: `user${Math.floor(Math.random() * 100)}@example.com`,
        subject: 'Payment Received',
        template: 'payment_confirmation',
        data: {
          amount: Math.random() * 10000,
          date: new Date().toISOString()
        }
      })
    },
    {
      exchange: 'servicing.direct',
      routingKey: `servicing.${Math.floor(Math.random() * 8)}.task`,
      generateData: () => ({
        loan_id: Math.floor(Math.random() * 100) + 1,
        task_type: ['INTEREST_ACCRUAL', 'FEE_ASSESSMENT', 'ESCROW_ANALYSIS'][Math.floor(Math.random() * 3)],
        scheduled_date: new Date().toISOString(),
        priority: Math.floor(Math.random() * 3)
      })
    },
    {
      exchange: 'settlement.topic',
      routingKey: 'ach.settlement.initiate',
      generateData: () => ({
        settlement_id: `STL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        amount: Math.random() * 50000,
        bank_account: `****${Math.floor(Math.random() * 10000)}`,
        settlement_date: new Date().toISOString(),
        type: 'ACH_CREDIT'
      })
    },
    {
      exchange: 'reconciliation.topic',
      routingKey: 'match.payment',
      generateData: () => ({
        transaction_id: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        amount: Math.random() * 10000,
        reference: `REF-${Math.floor(Math.random() * 1000000)}`,
        source: ['BANK_FILE', 'MANUAL_ENTRY', 'API'][Math.floor(Math.random() * 3)],
        matched: Math.random() > 0.3
      })
    }
  ];
  
  console.log(chalk.green('✅ Connected! Starting message generation...\n'));
  console.log(chalk.yellow('Press Ctrl+C to stop\n'));
  
  // Status display interval
  const statusInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = messageCount / elapsed;
    console.log(chalk.cyan(`📊 Stats: ${messageCount} messages sent | ${errorCount} errors | ${rate.toFixed(2)} msg/s`));
  }, 5000);
  
  // Generate continuous traffic
  const generateBatch = async () => {
    const promises = [];
    
    // Send batches of messages
    for (let i = 0; i < 20; i++) {
      const msgType = messageTypes[Math.floor(Math.random() * messageTypes.length)];
      
      promises.push(
        rabbitmq.publish({
          exchange: msgType.exchange,
          routingKey: msgType.routingKey,
          message: msgType.generateData()
        }).then(() => {
          messageCount++;
        }).catch((error) => {
          errorCount++;
          if (errorCount % 100 === 0) {
            console.error(chalk.red(`Error publishing message: ${error.message}`));
          }
        })
      );
    }
    
    await Promise.all(promises);
  };
  
  // Continuous generation with controlled rate
  while (true) {
    await generateBatch();
    // Small delay to control rate (adjust for higher/lower throughput)
    await new Promise(resolve => setTimeout(resolve, 50)); // 50ms = ~400 msg/s theoretical max
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Shutting down traffic generator...'));
  process.exit(0);
});

// Run
generateTraffic().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});