/**
 * Queue Administration Service
 * Provides administrative operations for RabbitMQ queues
 */

import { rabbitmqClient } from './rabbitmq-unified';

export interface QueueAdminOperations {
  name: string;
  operations: {
    purge: boolean;
    delete: boolean;
    migrate: boolean;
    bindToExchange: boolean;
  };
}

export interface DLQMigrationOptions {
  sourceQueue: string;
  targetQueue: string;
  maxMessages?: number;
  preserveOriginal?: boolean;
}

export class QueueAdminService {
  private static _instance: QueueAdminService | null = null;

  static getInstance(): QueueAdminService {
    if (!this._instance) {
      this._instance = new QueueAdminService();
    }
    return this._instance;
  }

  /**
   * Purge all messages from a Dead Letter Queue
   */
  async purgeDLQ(queueName: string): Promise<{ purgedCount: number }> {
    if (!queueName.startsWith('dlq.')) {
      throw new Error('Queue name must start with dlq. for safety');
    }

    try {
      const result = await rabbitmqClient.purgeQueue(queueName);
      console.log(`[QueueAdmin] Purged ${result.messageCount} messages from ${queueName}`);
      
      return { purgedCount: result.messageCount };
    } catch (error) {
      console.error(`[QueueAdmin] Failed to purge queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Migrate messages from DLQ back to the original queue
   */
  async migrateDLQMessages(options: DLQMigrationOptions): Promise<{ migratedCount: number }> {
    const { sourceQueue, targetQueue, maxMessages = 100, preserveOriginal = false } = options;

    if (!sourceQueue.startsWith('dlq.')) {
      throw new Error('Source queue must be a DLQ (start with dlq.)');
    }

    let migratedCount = 0;
    const maxRetries = 3;

    try {
      console.log(`[QueueAdmin] Starting migration from ${sourceQueue} to ${targetQueue}`);

      for (let i = 0; i < maxMessages; i++) {
        const message = await rabbitmqClient.getMessage(sourceQueue, { noAck: false });
        
        if (!message) {
          // No more messages
          break;
        }

        let success = false;
        let retries = 0;

        while (!success && retries < maxRetries) {
          try {
            // Republish to target queue
            await rabbitmqClient.publishToQueue(targetQueue, message.content, {
              ...message.properties,
              headers: {
                ...message.properties.headers,
                'x-dlq-migration': Date.now(),
                'x-dlq-source': sourceQueue,
              },
            });

            // Only acknowledge if publish was successful
            await rabbitmqClient.ackMessage(message);
            success = true;
            migratedCount++;
          } catch (error) {
            retries++;
            console.warn(`[QueueAdmin] Retry ${retries}/${maxRetries} for message migration:`, error);
            
            if (retries >= maxRetries) {
              // Nack the message to put it back in DLQ
              await rabbitmqClient.nackMessage(message, false, true);
              throw error;
            }
          }
        }
      }

      console.log(`[QueueAdmin] Successfully migrated ${migratedCount} messages from ${sourceQueue} to ${targetQueue}`);
      return { migratedCount };

    } catch (error) {
      console.error(`[QueueAdmin] Migration failed after ${migratedCount} messages:`, error);
      throw error;
    }
  }

  /**
   * Get queue information for admin operations
   */
  async getQueueInfo(queueName: string): Promise<{
    exists: boolean;
    messageCount?: number;
    consumerCount?: number;
    isDLQ: boolean;
    canPurge: boolean;
    canMigrate: boolean;
  }> {
    try {
      const info = await rabbitmqClient.getQueueInfo(queueName);
      const isDLQ = queueName.startsWith('dlq.');
      
      return {
        exists: true,
        messageCount: info.messageCount,
        consumerCount: info.consumerCount,
        isDLQ,
        canPurge: isDLQ && info.messageCount > 0,
        canMigrate: isDLQ && info.messageCount > 0,
      };
    } catch (error) {
      return {
        exists: false,
        isDLQ: queueName.startsWith('dlq.'),
        canPurge: false,
        canMigrate: false,
      };
    }
  }

  /**
   * List all DLQs with message counts
   */
  async listDLQs(): Promise<Array<{
    name: string;
    messageCount: number;
    consumerCount: number;
    canPurge: boolean;
    canMigrate: boolean;
  }>> {
    try {
      const allQueues = await rabbitmqClient.listQueues();
      const dlqs = allQueues.filter(q => q.name.startsWith('dlq.'));
      
      return dlqs.map(dlq => ({
        name: dlq.name,
        messageCount: dlq.messages,
        consumerCount: dlq.consumers,
        canPurge: dlq.messages > 0,
        canMigrate: dlq.messages > 0,
      }));
    } catch (error) {
      console.error('[QueueAdmin] Failed to list DLQs:', error);
      return [];
    }
  }

  /**
   * Emergency queue operations - use with caution
   */
  async emergencyPurgeAll(queuePrefix: string = 'dlq.'): Promise<{ 
    purgedQueues: string[];
    totalMessagesPurged: number; 
  }> {
    if (!queuePrefix.startsWith('dlq.')) {
      throw new Error('Emergency purge only allowed for DLQ queues');
    }

    const purgedQueues: string[] = [];
    let totalMessagesPurged = 0;

    try {
      const dlqs = await this.listDLQs();
      
      for (const dlq of dlqs) {
        if (dlq.messageCount > 0) {
          const result = await this.purgeDLQ(dlq.name);
          purgedQueues.push(dlq.name);
          totalMessagesPurged += result.purgedCount;
        }
      }

      console.log(`[QueueAdmin] Emergency purge completed: ${purgedQueues.length} queues, ${totalMessagesPurged} messages`);
      
      return { purgedQueues, totalMessagesPurged };
    } catch (error) {
      console.error('[QueueAdmin] Emergency purge failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const queueAdminService = QueueAdminService.getInstance();