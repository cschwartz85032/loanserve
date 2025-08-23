#!/usr/bin/env tsx

/**
 * Clean up test queue with stuck messages
 */

import amqp from 'amqplib';
import chalk from 'chalk';

async function cleanupQueues() {
  console.log(chalk.cyan.bold('\n🧹 Cleaning up test queues\n'));
  
  const url = process.env.CLOUDAMQP_URL;
  if (!url) {
    throw new Error('CLOUDAMQP_URL not configured');
  }
  
  try {
    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();
    
    // List of test queues to delete
    const testQueues = [
      'traffic-test-1755989259553',  // The queue with 59k messages
      'test-traffic-queue'
    ];
    
    for (const queue of testQueues) {
      try {
        const result = await channel.deleteQueue(queue);
        console.log(chalk.green(`✅ Deleted queue: ${queue} (had ${result.messageCount} messages)`));
      } catch (error: any) {
        if (error.code === 404) {
          console.log(chalk.gray(`Queue ${queue} doesn't exist`));
        } else {
          console.error(chalk.red(`Error deleting ${queue}:`, error.message));
        }
      }
    }
    
    // Check all queues for stuck messages
    console.log(chalk.yellow('\n📊 Checking main queues for stuck messages:\n'));
    
    const mainQueues = [
      'payments.validation',
      'payments.processing',
      'payments.distribution',
      'documents.analysis.request',
      'notifications.email',
      'reconciliation.match',
      'settlement.ach.settle'
    ];
    
    for (const queue of mainQueues) {
      try {
        const info = await channel.checkQueue(queue);
        if (info.messageCount > 0) {
          console.log(chalk.yellow(`⚠️  ${queue}: ${info.messageCount} messages (${info.consumerCount} consumers)`));
        } else {
          console.log(chalk.green(`✓ ${queue}: Empty`));
        }
      } catch (error) {
        // Queue doesn't exist
      }
    }
    
    await channel.close();
    await connection.close();
    
    console.log(chalk.cyan('\n✨ Cleanup complete! CloudAMQP should now show normal activity.\n'));
    
  } catch (error) {
    console.error(chalk.red('Error:'), error);
  }
  
  process.exit(0);
}

// Run
cleanupQueues().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});