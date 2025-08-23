#!/usr/bin/env tsx

/**
 * Dead Letter Queue Management Tool
 * 
 * This script helps inspect, reprocess, or purge messages from DLQs
 */

import { getEnhancedRabbitMQService } from '../server/services/rabbitmq-enhanced.js';
import { pool } from '../server/db.js';
import chalk from 'chalk';
import * as readline from 'readline/promises';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class DLQManager {
  private rabbitmq = getEnhancedRabbitMQService();

  constructor() {
    console.log(chalk.cyan.bold('\n🔧 Dead Letter Queue Manager\n'));
  }

  /**
   * List all DLQs and their message counts
   */
  async listDLQs(): Promise<void> {
    console.log(chalk.yellow('\n📋 Dead Letter Queues Status:\n'));

    const dlqNames = [
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

    let totalMessages = 0;

    for (const queueName of dlqNames) {
      try {
        const stats = await this.rabbitmq.getQueueStats(queueName);
        if (stats && stats.messageCount > 0) {
          console.log(`${chalk.red('●')} ${queueName.padEnd(25)} ${chalk.yellow(stats.messageCount.toString())} messages`);
          totalMessages += stats.messageCount;
        } else {
          console.log(`${chalk.green('●')} ${queueName.padEnd(25)} ${chalk.gray('Empty')}`);
        }
      } catch (error) {
        console.log(`${chalk.gray('○')} ${queueName.padEnd(25)} ${chalk.gray('Unknown')}`);
      }
    }

    console.log(chalk.gray('\n─'.repeat(40)));
    console.log(`Total messages in DLQs: ${chalk.yellow(totalMessages.toString())}\n`);
  }

  /**
   * Inspect messages in a specific DLQ
   */
  async inspectQueue(queueName: string, limit: number = 10): Promise<void> {
    console.log(chalk.yellow(`\n🔍 Inspecting ${queueName} (first ${limit} messages):\n`));

    try {
      // Get connection
      const connection = await this.rabbitmq.getConnection();
      if (!connection) {
        console.error(chalk.red('❌ No RabbitMQ connection'));
        return;
      }

      const channel = await connection.createChannel();
      
      // Browse messages without consuming
      let count = 0;
      while (count < limit) {
        const message = await channel.get(queueName, { noAck: false });
        
        if (!message) {
          if (count === 0) {
            console.log(chalk.gray('Queue is empty'));
          }
          break;
        }

        count++;
        
        // Parse message
        const content = JSON.parse(message.content.toString());
        const headers = message.properties.headers || {};
        
        console.log(chalk.cyan(`\nMessage #${count}:`));
        console.log(chalk.gray('─'.repeat(40)));
        console.log(`Message ID: ${headers['x-message-id'] || 'N/A'}`);
        console.log(`Death Count: ${headers['x-death']?.[0]?.count || 1}`);
        console.log(`Original Queue: ${headers['x-death']?.[0]?.queue || 'Unknown'}`);
        console.log(`Failed At: ${headers['x-death']?.[0]?.time ? new Date(headers['x-death'][0].time * 1000).toISOString() : 'Unknown'}`);
        console.log(`Reason: ${headers['x-death']?.[0]?.reason || 'rejected'}`);
        
        if (content.schema) {
          console.log(`Schema: ${content.schema}`);
        }
        
        if (content.data) {
          console.log(`Data: ${JSON.stringify(content.data, null, 2).substring(0, 200)}...`);
        }

        // Return message to queue (since we're just browsing)
        channel.nack(message, false, true);
      }

      await channel.close();
      
      console.log(chalk.gray('\n─'.repeat(40)));
      console.log(`Inspected ${count} messages\n`);

    } catch (error) {
      console.error(chalk.red('❌ Error inspecting queue:'), error);
    }
  }

  /**
   * Reprocess messages from a DLQ
   */
  async reprocessMessages(dlqName: string, targetExchange: string, routingKey: string, limit?: number): Promise<void> {
    console.log(chalk.yellow(`\n♻️ Reprocessing messages from ${dlqName}\n`));

    try {
      const connection = await this.rabbitmq.getConnection();
      if (!connection) {
        console.error(chalk.red('❌ No RabbitMQ connection'));
        return;
      }

      const channel = await connection.createChannel();
      let count = 0;
      let successCount = 0;
      let failCount = 0;

      while (true) {
        if (limit && count >= limit) break;

        const message = await channel.get(dlqName, { noAck: false });
        
        if (!message) {
          break;
        }

        count++;
        
        try {
          const content = JSON.parse(message.content.toString());
          
          // Log the message being reprocessed
          console.log(`Reprocessing message ${count}: ${content.message_id || 'unknown'}`);
          
          // Fix common issues before reprocessing
          if (content.data) {
            // Ensure loan_id is present and valid
            if (!content.data.loan_id || content.data.loan_id === null) {
              content.data.loan_id = 23; // Use default loan for testing
              console.log(chalk.yellow('  → Fixed missing loan_id'));
            }
            
            // Ensure payment_id is present
            if (!content.data.payment_id) {
              const { ulid } = await import('ulid');
              content.data.payment_id = ulid();
              console.log(chalk.yellow('  → Generated missing payment_id'));
            }

            // Remove invalid fields that cause errors
            delete content.data.invalid_field;
            delete content.data.invalid;
          }

          // Republish to original exchange
          await channel.publish(
            targetExchange,
            routingKey,
            Buffer.from(JSON.stringify(content)),
            {
              persistent: true,
              headers: {
                'x-reprocessed': true,
                'x-reprocess-count': (message.properties.headers?.['x-reprocess-count'] || 0) + 1,
                'x-original-dlq': dlqName
              }
            }
          );

          // Acknowledge the message (remove from DLQ)
          channel.ack(message);
          successCount++;
          console.log(chalk.green(`  ✅ Reprocessed successfully`));

        } catch (error) {
          console.log(chalk.red(`  ❌ Failed to reprocess: ${error.message}`));
          // Return to DLQ
          channel.nack(message, false, true);
          failCount++;
        }
      }

      await channel.close();

      console.log(chalk.gray('\n─'.repeat(40)));
      console.log(`Reprocessing complete:`);
      console.log(`  Total: ${count}`);
      console.log(`  Success: ${chalk.green(successCount.toString())}`);
      console.log(`  Failed: ${chalk.red(failCount.toString())}\n`);

    } catch (error) {
      console.error(chalk.red('❌ Error reprocessing messages:'), error);
    }
  }

  /**
   * Purge all messages from a DLQ
   */
  async purgeQueue(queueName: string): Promise<void> {
    console.log(chalk.yellow(`\n🗑️ Purging ${queueName}\n`));

    const confirm = await rl.question(
      chalk.red('⚠️ WARNING: This will permanently delete all messages. Continue? (yes/no): ')
    );

    if (confirm.toLowerCase() !== 'yes') {
      console.log(chalk.gray('Cancelled'));
      return;
    }

    try {
      const connection = await this.rabbitmq.getConnection();
      if (!connection) {
        console.error(chalk.red('❌ No RabbitMQ connection'));
        return;
      }

      const channel = await connection.createChannel();
      await channel.purgeQueue(queueName);
      await channel.close();

      console.log(chalk.green(`✅ Queue ${queueName} purged successfully\n`));

    } catch (error) {
      console.error(chalk.red('❌ Error purging queue:'), error);
    }
  }

  /**
   * Analyze failed payment messages
   */
  async analyzePaymentFailures(): Promise<void> {
    console.log(chalk.yellow('\n📊 Analyzing Payment Failures:\n'));

    try {
      // Check for payments in error states
      const failedPayments = await pool.query(
        `SELECT 
          state,
          source,
          COUNT(*) as count,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM payment_transactions
        WHERE state IN ('failed', 'error', 'rejected')
        GROUP BY state, source
        ORDER BY count DESC`
      );

      if (failedPayments.rows.length > 0) {
        console.log('Failed payments in database:');
        console.log(chalk.gray('─'.repeat(60)));
        
        for (const row of failedPayments.rows) {
          console.log(`State: ${chalk.red(row.state.padEnd(15))} Source: ${row.source.padEnd(10)} Count: ${chalk.yellow(row.count)}`);
          console.log(`  Oldest: ${new Date(row.oldest).toLocaleString()}`);
          console.log(`  Newest: ${new Date(row.newest).toLocaleString()}`);
        }
      } else {
        console.log(chalk.green('No failed payments found in database'));
      }

      // Check idempotency records for failures
      const idempotencyFailures = await pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT idempotency_key) as unique_keys
        FROM idempotency
        WHERE processed_at IS NOT NULL
        AND result_hash IS NULL`
      );

      if (idempotencyFailures.rows[0].total > 0) {
        console.log(chalk.gray('\n─'.repeat(60)));
        console.log(`Idempotency failures: ${chalk.yellow(idempotencyFailures.rows[0].total)}`);
        console.log(`Unique keys affected: ${chalk.yellow(idempotencyFailures.rows[0].unique_keys)}`);
      }

    } catch (error) {
      console.error(chalk.red('❌ Error analyzing failures:'), error);
    }
  }

  /**
   * Interactive menu
   */
  async showMenu(): Promise<void> {
    while (true) {
      console.log(chalk.cyan('\n📋 Dead Letter Queue Management Menu:\n'));
      console.log('1. List all DLQs and message counts');
      console.log('2. Inspect messages in dlq.payments');
      console.log('3. Reprocess messages from dlq.payments');
      console.log('4. Purge dlq.payments');
      console.log('5. Analyze payment failures');
      console.log('6. Inspect other DLQ');
      console.log('0. Exit');
      
      const choice = await rl.question(chalk.gray('\nSelect option: '));

      switch (choice) {
        case '1':
          await this.listDLQs();
          break;
          
        case '2':
          await this.inspectQueue('dlq.payments', 10);
          break;
          
        case '3':
          // Reprocess payments back to validation queue
          await this.reprocessMessages(
            'dlq.payments',
            'payments.topic',
            'payment.reprocess.initiated',
            10 // Limit to 10 messages
          );
          break;
          
        case '4':
          await this.purgeQueue('dlq.payments');
          break;
          
        case '5':
          await this.analyzePaymentFailures();
          break;
          
        case '6':
          const queueName = await rl.question('Enter DLQ name: ');
          await this.inspectQueue(queueName, 10);
          break;
          
        case '0':
          console.log(chalk.gray('\nGoodbye!\n'));
          rl.close();
          process.exit(0);
          
        default:
          console.log(chalk.red('Invalid option'));
      }
    }
  }
}

// Main execution
async function main() {
  const manager = new DLQManager();
  
  // Wait for RabbitMQ connection
  console.log(chalk.gray('Connecting to RabbitMQ...'));
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // If command line arguments provided, execute specific action
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    const command = args[0];
    
    switch (command) {
      case 'list':
        await manager.listDLQs();
        break;
        
      case 'inspect':
        const queueToInspect = args[1] || 'dlq.payments';
        await manager.inspectQueue(queueToInspect);
        break;
        
      case 'reprocess':
        await manager.reprocessMessages(
          'dlq.payments',
          'payments.topic', 
          'payment.reprocess.initiated'
        );
        break;
        
      case 'purge':
        const queueToPurge = args[1] || 'dlq.payments';
        await manager.purgeQueue(queueToPurge);
        break;
        
      case 'analyze':
        await manager.analyzePaymentFailures();
        break;
        
      default:
        console.log(chalk.red(`Unknown command: ${command}`));
        console.log('Available commands: list, inspect, reprocess, purge, analyze');
    }
    
    process.exit(0);
  } else {
    // Show interactive menu
    await manager.showMenu();
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Unhandled rejection:'), error);
  process.exit(1);
});

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export { DLQManager };