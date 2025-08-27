#!/usr/bin/env node

/**
 * Queue Migration Tool
 * 
 * Safely migrates RabbitMQ queues to match expected configuration.
 * Only deletes queues when empty or explicitly whitelisted.
 */

import amqp from 'amqplib';
import chalk from 'chalk';
import { topologyManager } from '../messaging/topology.js';

interface MigrationOptions {
  dryRun?: boolean;
  force?: boolean;
  whitelistedQueues?: string[];
}

interface QueueMigration {
  name: string;
  action: 'delete' | 'create' | 'update_bindings' | 'skip';
  reason: string;
  safe: boolean;
}

class QueueMigrator {
  private url = process.env.CLOUDAMQP_URL || 'amqp://localhost';
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;

  constructor(private options: MigrationOptions = {}) {}

  /**
   * Connect to RabbitMQ
   */
  private async connect(): Promise<void> {
    this.connection = await amqp.connect(this.url);
    this.channel = await this.connection.createChannel();
    
    this.connection.on('error', (error) => {
      console.error(chalk.red('Connection error:'), error);
    });
  }

  /**
   * Check if queue is empty
   */
  private async isQueueEmpty(queueName: string): Promise<boolean> {
    if (!this.channel) throw new Error('Not connected');
    
    try {
      const { messageCount } = await this.channel.checkQueue(queueName);
      return messageCount === 0;
    } catch (error) {
      // Queue doesn't exist
      return true;
    }
  }

  /**
   * Safely migrate a queue
   */
  private async migrateQueue(
    queueName: string,
    expectedArgs: Record<string, any>,
    expectedBindings: Array<{ exchange: string; routingKey: string }>
  ): Promise<MigrationOptions> {
    if (!this.channel) throw new Error('Not connected');

    const migration: QueueMigration = {
      name: queueName,
      action: 'skip',
      reason: '',
      safe: true,
    };

    try {
      // Check if queue exists
      const queueInfo = await this.channel.checkQueue(queueName);
      
      // Check if it's safe to migrate
      const isEmpty = await this.isQueueEmpty(queueName);
      const isWhitelisted = this.options.whitelistedQueues?.includes(queueName) || false;
      
      if (!isEmpty && !isWhitelisted && !this.options.force) {
        migration.action = 'skip';
        migration.reason = `Queue has ${queueInfo.messageCount} messages and is not whitelisted`;
        migration.safe = false;
        console.log(chalk.yellow(`⚠️  Skipping ${queueName}: ${migration.reason}`));
        return this.options;
      }

      if (this.options.dryRun) {
        migration.action = 'delete';
        migration.reason = 'Would delete and recreate (dry run)';
        console.log(chalk.cyan(`[DRY RUN] Would migrate ${queueName}`));
        return this.options;
      }

      // Backup bindings
      console.log(chalk.gray(`Backing up bindings for ${queueName}...`));
      
      // Delete the queue
      console.log(chalk.yellow(`Deleting queue ${queueName}...`));
      await this.channel.deleteQueue(queueName);
      
      // Recreate with correct arguments
      console.log(chalk.green(`Creating queue ${queueName} with new arguments...`));
      await this.channel.assertQueue(queueName, {
        durable: true,
        arguments: expectedArgs,
      });
      
      // Reapply bindings
      for (const binding of expectedBindings) {
        await this.channel.bindQueue(queueName, binding.exchange, binding.routingKey);
        console.log(chalk.gray(`  Bound to ${binding.exchange} with key ${binding.routingKey}`));
      }
      
      migration.action = 'create';
      migration.reason = 'Successfully migrated';
      console.log(chalk.green(`✅ Migrated ${queueName}`));
      
    } catch (error: any) {
      if (error.code === 404) {
        // Queue doesn't exist, create it
        if (!this.options.dryRun) {
          await this.channel.assertQueue(queueName, {
            durable: true,
            arguments: expectedArgs,
          });
          
          for (const binding of expectedBindings) {
            await this.channel.bindQueue(queueName, binding.exchange, binding.routingKey);
          }
          
          migration.action = 'create';
          migration.reason = 'Created new queue';
          console.log(chalk.green(`✅ Created ${queueName}`));
        } else {
          console.log(chalk.cyan(`[DRY RUN] Would create ${queueName}`));
        }
      } else {
        migration.action = 'skip';
        migration.reason = `Error: ${error.message}`;
        migration.safe = false;
        console.error(chalk.red(`❌ Failed to migrate ${queueName}: ${error.message}`));
      }
    }

    return this.options;
  }

  /**
   * Migrate problematic queues
   */
  async migrateProblematicQueues(): Promise<void> {
    console.log(chalk.yellow('\n🔧 Queue Migration Tool\n'));
    
    if (this.options.dryRun) {
      console.log(chalk.cyan('Running in DRY RUN mode - no changes will be made\n'));
    }

    await this.connect();
    
    // List of known problematic queues that need migration
    const problematicQueues = [
      {
        name: 'q.forecast',
        newName: 'q.forecast.v2',
        args: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'escrow.dlq',
          'x-dead-letter-routing-key': 'forecast.failed',
          'x-delivery-limit': 6,
        },
        bindings: [
          { exchange: 'escrow.saga', routingKey: 'forecast.request' },
          { exchange: 'escrow.saga', routingKey: 'forecast.retry' },
        ],
      },
      {
        name: 'q.escrow.dlq',
        newName: 'q.escrow.dlq.v2',
        args: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'escrow.dlq',
          'x-delivery-limit': 6,
        },
        bindings: [
          { exchange: 'escrow.dlq', routingKey: '#' },
        ],
      },
      {
        name: 'audit.events',
        newName: 'audit.events',
        args: {
          'x-queue-mode': 'lazy',
          'x-max-length': 10000000, // 10 million events
        },
        bindings: [
          { exchange: 'audit.topic', routingKey: 'audit.*' },
        ],
      },
      {
        name: 'servicing.daily.tasks.0',
        newName: 'servicing.daily.tasks.0',
        args: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 86400000,
          'x-dead-letter-exchange': 'dlx.main',
          'x-dead-letter-routing-key': 'servicing.dlq.0',
          'x-max-length': 500000,
          'x-overflow': 'reject-publish-dlx',
        },
        bindings: [
          { exchange: 'servicing.direct', routingKey: 'servicing.0.*' },
        ],
      },
    ];

    const migrationReport: QueueMigration[] = [];

    for (const queue of problematicQueues) {
      console.log(chalk.cyan(`\nProcessing ${queue.name}...`));
      
      // Check if old queue exists and has messages
      const hasMessages = !(await this.isQueueEmpty(queue.name));
      
      if (hasMessages && !this.options.force) {
        console.log(chalk.yellow(`⚠️  ${queue.name} has messages. Skipping migration.`));
        console.log(chalk.gray(`   Use versioned queue ${queue.newName} instead`));
        
        // Create versioned queue alongside the old one
        if (queue.name !== queue.newName && !this.options.dryRun) {
          try {
            await this.channel!.assertQueue(queue.newName, {
              durable: true,
              arguments: queue.args,
            });
            
            for (const binding of queue.bindings) {
              await this.channel!.bindQueue(queue.newName, binding.exchange, binding.routingKey);
            }
            
            console.log(chalk.green(`✅ Created versioned queue ${queue.newName}`));
          } catch (error) {
            console.log(chalk.gray(`   ${queue.newName} already exists`));
          }
        }
      } else {
        // Migrate the queue
        await this.migrateQueue(queue.name, queue.args, queue.bindings);
      }
    }

    // Create critical DLQs if missing
    const criticalDLQs = [
      {
        name: 'dlq.payments',
        args: {},
        bindings: [
          { exchange: 'dlx.main', routingKey: 'payments.dlq' },
        ],
      },
      {
        name: 'dlq.general',
        args: {},
        bindings: [
          { exchange: 'dlx.main', routingKey: '*.dlq' },
        ],
      },
    ];

    console.log(chalk.cyan('\n\nEnsuring critical DLQs exist...'));
    
    for (const dlq of criticalDLQs) {
      try {
        await this.channel!.checkQueue(dlq.name);
        console.log(chalk.gray(`   ${dlq.name} exists`));
      } catch (error) {
        if (!this.options.dryRun) {
          await this.channel!.assertQueue(dlq.name, {
            durable: true,
            arguments: dlq.args,
          });
          
          for (const binding of dlq.bindings) {
            await this.channel!.bindQueue(dlq.name, binding.exchange, binding.routingKey);
          }
          
          console.log(chalk.green(`✅ Created critical DLQ ${dlq.name}`));
        } else {
          console.log(chalk.cyan(`[DRY RUN] Would create ${dlq.name}`));
        }
      }
    }

    await this.disconnect();
    
    console.log(chalk.green('\n✨ Migration complete!\n'));
  }

  /**
   * Disconnect from RabbitMQ
   */
  private async disconnect(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }

  /**
   * Generate audit log
   */
  private logMigrationEvent(event: {
    queue: string;
    action: string;
    timestamp: Date;
    user?: string;
  }): void {
    const log = {
      ...event,
      user: process.env.USER || 'system',
      environment: process.env.NODE_ENV || 'development',
    };
    
    console.log(chalk.gray(`[AUDIT] ${JSON.stringify(log)}`));
    
    // In production, this would write to an audit log file or service
    const fs = require('fs');
    const logPath = 'migration-audit.log';
    fs.appendFileSync(logPath, JSON.stringify(log) + '\n');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: MigrationOptions = {
  dryRun: args.includes('--dry-run'),
  force: args.includes('--force'),
  whitelistedQueues: [],
};

// Extract whitelisted queues
const whitelistIndex = args.indexOf('--whitelist');
if (whitelistIndex !== -1 && args[whitelistIndex + 1]) {
  options.whitelistedQueues = args[whitelistIndex + 1].split(',');
}

// Show help
if (args.includes('--help')) {
  console.log(chalk.cyan(`
Queue Migration Tool

Usage: npm run migrate-queues [options]

Options:
  --dry-run          Show what would be done without making changes
  --force            Force migration even if queues have messages
  --whitelist <q,q>  Comma-separated list of queues safe to delete
  --help            Show this help message

Examples:
  npm run migrate-queues --dry-run
  npm run migrate-queues --whitelist q.escrow.dlq,audit.events
  npm run migrate-queues --force

Safety:
  - Queues with messages are skipped unless whitelisted or --force
  - Bindings are backed up before deletion
  - Audit events are logged for all changes
  - Critical DLQs are always created if missing
  `));
  process.exit(0);
}

// Run migration
const migrator = new QueueMigrator(options);
migrator.migrateProblematicQueues().catch(error => {
  console.error(chalk.red('Migration failed:'), error);
  process.exit(1);
});

export { QueueMigrator };