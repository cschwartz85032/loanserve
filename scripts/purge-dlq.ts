#!/usr/bin/env tsx

/**
 * Purge Dead Letter Queue
 * Removes all messages from specified DLQ
 */

import { getEnhancedRabbitMQService } from '../server/services/rabbitmq-enhanced.js';
import amqp from 'amqplib';
import chalk from 'chalk';

async function purgeDLQ(queueName: string = 'dlq.payments') {
  console.log(chalk.cyan.bold('\n🗑️ Dead Letter Queue Purge Tool\n'));
  
  const rabbitmq = getEnhancedRabbitMQService();
  
  // Wait for connection
  console.log(chalk.gray('Connecting to RabbitMQ...'));
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    // Get current stats
    const stats = await rabbitmq.getQueueStats(queueName);
    
    if (stats) {
      const messageCount = stats.messageCount;
      
      if (messageCount === 0) {
        console.log(chalk.green(`✅ ${queueName} is already empty\n`));
        process.exit(0);
      }
      
      console.log(chalk.yellow(`Found ${messageCount} message(s) in ${queueName}`));
      console.log(chalk.red('\n⚠️  WARNING: This will permanently delete all messages!\n'));
      
      // Connect directly to RabbitMQ to purge
      const url = process.env.CLOUDAMQP_URL;
      if (!url) {
        throw new Error('CLOUDAMQP_URL not configured');
      }
      
      const connection = await amqp.connect(url);
      const channel = await connection.createChannel();
      
      // Purge the queue
      await channel.purgeQueue(queueName);
      
      console.log(chalk.green(`\n✅ Successfully purged ${messageCount} message(s) from ${queueName}\n`));
      
      await channel.close();
      await connection.close();
      
      // Verify it's empty
      const newStats = await rabbitmq.getQueueStats(queueName);
      if (newStats) {
        console.log(chalk.gray(`Verification: ${queueName} now has ${newStats.messageCount} messages`));
      }
      
    } else {
      console.log(chalk.red(`❌ Could not get stats for ${queueName}`));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error purging queue:'), error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Get queue name from command line or use default
const queueName = process.argv[2] || 'dlq.payments';

// Run
purgeDLQ(queueName).catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});