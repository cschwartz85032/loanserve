#!/usr/bin/env tsx

/**
 * Simple DLQ Inspector
 * Quick tool to check what's in the dead letter queues
 */

import { getEnhancedRabbitMQService } from '../server/services/rabbitmq-enhanced.js';
import chalk from 'chalk';

async function inspectDLQ() {
  const rabbitmq = getEnhancedRabbitMQService();
  
  console.log(chalk.cyan.bold('\n🔍 Dead Letter Queue Inspector\n'));
  
  // Wait for connection
  console.log(chalk.gray('Connecting to RabbitMQ...'));
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check all DLQs
  const dlqs = [
    'dlq.payments',
    'dlq.documents',
    'dlq.notifications',
    'dlq.settlement',
    'dlq.reconciliation',
    'dlq.compliance',
    'dlq.aml',
    'dlq.servicing.0',
    'dlq.servicing.1', 
    'dlq.servicing.2',
    'dlq.servicing.3',
    'dlq.servicing.4',
    'dlq.servicing.5',
    'dlq.servicing.6',
    'dlq.servicing.7'
  ];
  
  console.log(chalk.yellow('Dead Letter Queue Status:\n'));
  console.log(chalk.gray('Queue Name'.padEnd(30) + 'Messages'));
  console.log(chalk.gray('─'.repeat(50)));
  
  let totalMessages = 0;
  const problemQueues: { name: string; count: number }[] = [];
  
  for (const dlq of dlqs) {
    const stats = await rabbitmq.getQueueStats(dlq);
    if (stats) {
      const count = stats.messageCount;
      totalMessages += count;
      
      if (count > 0) {
        console.log(
          chalk.red('● ') + 
          dlq.padEnd(28) + 
          chalk.yellow(count.toString())
        );
        problemQueues.push({ name: dlq, count });
      } else {
        console.log(
          chalk.green('● ') + 
          dlq.padEnd(28) + 
          chalk.gray('0')
        );
      }
    }
  }
  
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`Total Messages in DLQs: ${chalk.yellow(totalMessages.toString())}\n`);
  
  if (problemQueues.length > 0) {
    console.log(chalk.red('\n⚠️  Found messages in dead letter queues!\n'));
    console.log('These are messages that failed processing and need attention:\n');
    
    for (const queue of problemQueues) {
      console.log(`  • ${queue.name}: ${queue.count} failed message(s)`);
    }
    
    console.log(chalk.gray('\nCommon reasons for DLQ messages:'));
    console.log(chalk.gray('  1. Missing or invalid loan_id'));
    console.log(chalk.gray('  2. Database connection issues'));
    console.log(chalk.gray('  3. Validation failures'));
    console.log(chalk.gray('  4. Consumer processing errors'));
    
    console.log(chalk.yellow('\n💡 To manage these messages:\n'));
    console.log('  1. Fix the underlying issue causing failures');
    console.log('  2. Reprocess messages: tsx scripts/reprocess-dlq.ts');
    console.log('  3. Purge if not needed: tsx scripts/purge-dlq.ts');
  } else {
    console.log(chalk.green('\n✅ All dead letter queues are empty - no failed messages!\n'));
  }
  
  // Check connection info
  const connInfo = rabbitmq.getConnectionInfo();
  console.log(chalk.cyan('\nConnection Information:'));
  console.log(`  Status: ${connInfo.connected ? chalk.green('Connected') : chalk.red('Disconnected')}`);
  console.log(`  Active Consumers: ${connInfo.activeConsumers}`);
  console.log(`  Reconnect Attempts: ${connInfo.reconnectAttempts}`);
  
  process.exit(0);
}

// Run
inspectDLQ().catch(error => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
});