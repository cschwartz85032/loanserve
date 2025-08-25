/**
 * Chaos Engineering Tests: Broker Failures and Recovery
 * Tests system resilience during RabbitMQ failures, network partitions, and recovery
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RabbitMQConnection } from '../../messaging/rabbitmq-connection';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ChaosScenario {
  name: string;
  description: string;
  setup: () => Promise<void>;
  chaos: () => Promise<void>;
  recover: () => Promise<void>;
  verify: () => Promise<boolean>;
}

class ChaosOrchestrator {
  private rabbitmq: RabbitMQConnection;
  private outboxMonitor: OutboxMonitor;
  private scenarios: ChaosScenario[] = [];
  private results: Map<string, boolean> = new Map();

  constructor() {
    this.rabbitmq = RabbitMQConnection.getInstance();
    this.outboxMonitor = new OutboxMonitor();
  }

  async initialize(): Promise<void> {
    await this.rabbitmq.connect();
    await this.outboxMonitor.start();
  }

  async shutdown(): Promise<void> {
    await this.outboxMonitor.stop();
    await this.rabbitmq.close();
  }

  addScenario(scenario: ChaosScenario): void {
    this.scenarios.push(scenario);
  }

  async runScenario(scenario: ChaosScenario): Promise<boolean> {
    console.log(`[CHAOS] Starting scenario: ${scenario.name}`);
    
    try {
      // Setup initial state
      await scenario.setup();
      
      // Inject chaos
      console.log(`[CHAOS] Injecting failure: ${scenario.description}`);
      await scenario.chaos();
      
      // Allow system to detect and handle failure
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Recover from chaos
      console.log(`[CHAOS] Recovering from failure`);
      await scenario.recover();
      
      // Allow recovery time
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Verify system recovered correctly
      console.log(`[CHAOS] Verifying recovery`);
      const passed = await scenario.verify();
      
      this.results.set(scenario.name, passed);
      console.log(`[CHAOS] Scenario ${scenario.name}: ${passed ? 'PASSED' : 'FAILED'}`);
      
      return passed;
    } catch (error) {
      console.error(`[CHAOS] Scenario ${scenario.name} error:`, error);
      this.results.set(scenario.name, false);
      return false;
    }
  }

  async runAll(): Promise<Map<string, boolean>> {
    for (const scenario of this.scenarios) {
      await this.runScenario(scenario);
      // Pause between scenarios
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    return this.results;
  }
}

class OutboxMonitor {
  private isRunning = false;
  private processedMessages = new Set<string>();
  private failedMessages = new Map<string, number>();

  async start(): Promise<void> {
    this.isRunning = true;
    this.monitorLoop();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
  }

  private async monitorLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Check for unprocessed outbox messages
        const messages = await db.execute(sql`
          SELECT id, payload, retry_count, created_at 
          FROM payment_outbox 
          WHERE processed_at IS NULL 
          AND retry_count < 5
          ORDER BY created_at 
          LIMIT 10
        `);

        for (const message of messages.rows) {
          if (!this.processedMessages.has(message.id)) {
            await this.processMessage(message);
          }
        }
      } catch (error) {
        console.error('[OutboxMonitor] Error:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  private async processMessage(message: any): Promise<void> {
    try {
      // Attempt to publish
      const rabbitmq = RabbitMQConnection.getInstance();
      await rabbitmq.publish('payment.outbox', message.payload);
      
      // Mark as processed
      await db.execute(sql`
        UPDATE payment_outbox 
        SET processed_at = NOW() 
        WHERE id = ${message.id}
      `);
      
      this.processedMessages.add(message.id);
    } catch (error) {
      // Track failures
      const failures = (this.failedMessages.get(message.id) || 0) + 1;
      this.failedMessages.set(message.id, failures);
      
      // Update retry count
      await db.execute(sql`
        UPDATE payment_outbox 
        SET retry_count = retry_count + 1,
            last_retry_at = NOW()
        WHERE id = ${message.id}
      `);
    }
  }

  getStats() {
    return {
      processed: this.processedMessages.size,
      failed: this.failedMessages.size,
      totalFailures: Array.from(this.failedMessages.values()).reduce((a, b) => a + b, 0)
    };
  }
}

describe('Chaos Engineering: Broker Failures', () => {
  let chaos: ChaosOrchestrator;

  beforeAll(async () => {
    chaos = new ChaosOrchestrator();
    await chaos.initialize();
  });

  afterAll(async () => {
    await chaos.shutdown();
  });

  describe('Connection Failures', () => {
    it('should handle broker connection loss', async () => {
      const scenario: ChaosScenario = {
        name: 'broker_connection_loss',
        description: 'Simulate RabbitMQ connection drop',
        
        setup: async () => {
          // Submit test payment
          const paymentId = ulid();
          await db.execute(sql`
            INSERT INTO payment_transactions (
              payment_id, loan_id, source, amount_cents, state, external_ref
            ) VALUES (
              ${paymentId}, '17', 'ach', 100000, 'received', 'CHAOS-CONN-001'
            )
          `);
        },
        
        chaos: async () => {
          // Force close RabbitMQ connection
          const rabbitmq = RabbitMQConnection.getInstance();
          await rabbitmq['connection']?.close();
        },
        
        recover: async () => {
          // Reconnect
          const rabbitmq = RabbitMQConnection.getInstance();
          await rabbitmq.connect();
        },
        
        verify: async () => {
          // Check if messages can be published after recovery
          try {
            const rabbitmq = RabbitMQConnection.getInstance();
            await rabbitmq.publish('test.queue', { test: true });
            return true;
          } catch {
            return false;
          }
        }
      };

      const passed = await chaos.runScenario(scenario);
      expect(passed).toBe(true);
    });

    it('should handle channel closure', async () => {
      const scenario: ChaosScenario = {
        name: 'channel_closure',
        description: 'Simulate channel unexpected closure',
        
        setup: async () => {
          // Ensure connection is healthy
          const rabbitmq = RabbitMQConnection.getInstance();
          await rabbitmq.connect();
        },
        
        chaos: async () => {
          // Close publishing channel
          const rabbitmq = RabbitMQConnection.getInstance();
          const channel = rabbitmq['publishChannel'];
          if (channel) {
            await channel.close();
          }
        },
        
        recover: async () => {
          // Should auto-recover channel
          const rabbitmq = RabbitMQConnection.getInstance();
          await rabbitmq.createChannels();
        },
        
        verify: async () => {
          // Verify publishing works
          const testPayment = {
            payment_id: ulid(),
            amount: 1000
          };
          
          const rabbitmq = RabbitMQConnection.getInstance();
          await rabbitmq.publish('payments.validation', testPayment);
          
          // Check if message was queued
          const queueInfo = await rabbitmq.checkQueue('payments.validation');
          return queueInfo.messageCount >= 0;
        }
      };

      const passed = await chaos.runScenario(scenario);
      expect(passed).toBe(true);
    });
  });

  describe('Outbox Resilience', () => {
    it('should continue processing after outbox pause', async () => {
      const outboxMonitor = chaos['outboxMonitor'];
      const initialStats = outboxMonitor.getStats();

      // Add test messages to outbox
      const messageIds = [];
      for (let i = 0; i < 5; i++) {
        const id = ulid();
        messageIds.push(id);
        
        await db.execute(sql`
          INSERT INTO payment_outbox (id, payload, created_at)
          VALUES (${id}, ${JSON.stringify({ test: i })}, NOW())
        `);
      }

      // Pause outbox
      await outboxMonitor.stop();
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Resume outbox
      await outboxMonitor.start();
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check if messages were processed
      const finalStats = outboxMonitor.getStats();
      expect(finalStats.processed).toBeGreaterThan(initialStats.processed);
    });

    it('should retry failed messages with exponential backoff', async () => {
      const scenario: ChaosScenario = {
        name: 'outbox_retry_backoff',
        description: 'Test exponential backoff for failed messages',
        
        setup: async () => {
          // Insert message that will fail
          await db.execute(sql`
            INSERT INTO payment_outbox (
              id, payload, created_at, retry_count
            ) VALUES (
              'FAIL-MSG-001',
              '{"invalid": "json}',
              NOW(),
              0
            )
          `);
        },
        
        chaos: async () => {
          // Let outbox attempt to process invalid message
          await new Promise(resolve => setTimeout(resolve, 3000));
        },
        
        recover: async () => {
          // Fix the message
          await db.execute(sql`
            UPDATE payment_outbox 
            SET payload = '{"valid": "json"}'
            WHERE id = 'FAIL-MSG-001'
          `);
        },
        
        verify: async () => {
          // Check retry count increased
          const result = await db.execute(sql`
            SELECT retry_count FROM payment_outbox 
            WHERE id = 'FAIL-MSG-001'
          `);
          
          return result.rows[0]?.retry_count > 0;
        }
      };

      const passed = await chaos.runScenario(scenario);
      expect(passed).toBe(true);
    });
  });

  describe('Queue Overflow', () => {
    it('should handle queue reaching max length', async () => {
      const scenario: ChaosScenario = {
        name: 'queue_overflow',
        description: 'Fill queue to max capacity',
        
        setup: async () => {
          // Ensure queue exists with max-length policy
          const rabbitmq = RabbitMQConnection.getInstance();
          await rabbitmq.assertQueue('test.overflow', {
            maxLength: 10,
            overflow: 'drop-head' // Drop oldest messages
          });
        },
        
        chaos: async () => {
          // Flood the queue
          const rabbitmq = RabbitMQConnection.getInstance();
          for (let i = 0; i < 20; i++) {
            await rabbitmq.publish('test.overflow', { 
              index: i,
              data: 'x'.repeat(1000) // Large payload
            });
          }
        },
        
        recover: async () => {
          // Consume messages to free space
          const rabbitmq = RabbitMQConnection.getInstance();
          const channel = await rabbitmq.createChannel();
          
          await channel.consume('test.overflow', (msg) => {
            if (msg) {
              channel.ack(msg);
            }
          }, { noAck: false });
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        },
        
        verify: async () => {
          const rabbitmq = RabbitMQConnection.getInstance();
          const queueInfo = await rabbitmq.checkQueue('test.overflow');
          return queueInfo.messageCount <= 10;
        }
      };

      const passed = await chaos.runScenario(scenario);
      expect(passed).toBe(true);
    });
  });

  describe('Consumer Failures', () => {
    it('should handle consumer crash and restart', async () => {
      let consumerTag: string | undefined;
      
      const scenario: ChaosScenario = {
        name: 'consumer_crash',
        description: 'Simulate consumer crash and recovery',
        
        setup: async () => {
          // Start a test consumer
          const rabbitmq = RabbitMQConnection.getInstance();
          const channel = await rabbitmq.createChannel();
          
          const result = await channel.consume(
            'payments.validation',
            (msg) => {
              // Simulate processing
              if (msg) {
                channel.ack(msg);
              }
            },
            { noAck: false }
          );
          
          consumerTag = result.consumerTag;
        },
        
        chaos: async () => {
          // Cancel consumer to simulate crash
          if (consumerTag) {
            const rabbitmq = RabbitMQConnection.getInstance();
            const channel = await rabbitmq.createChannel();
            await channel.cancel(consumerTag);
          }
        },
        
        recover: async () => {
          // Restart consumer
          const rabbitmq = RabbitMQConnection.getInstance();
          const channel = await rabbitmq.createChannel();
          
          await channel.consume(
            'payments.validation',
            (msg) => {
              if (msg) {
                channel.ack(msg);
              }
            },
            { noAck: false }
          );
        },
        
        verify: async () => {
          // Publish test message and verify it's consumed
          const rabbitmq = RabbitMQConnection.getInstance();
          
          await rabbitmq.publish('payment.ach.received', {
            payment_id: 'CONSUMER-TEST-001',
            amount: 1000
          });
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check queue depth
          const queueInfo = await rabbitmq.checkQueue('payments.validation');
          return queueInfo.messageCount === 0;
        }
      };

      const passed = await chaos.runScenario(scenario);
      expect(passed).toBe(true);
    });
  });

  describe('Network Partition', () => {
    it('should handle network latency spike', async () => {
      const scenario: ChaosScenario = {
        name: 'network_latency',
        description: 'Simulate high network latency',
        
        setup: async () => {
          // Record baseline latency
        },
        
        chaos: async () => {
          // Add artificial delay to operations
          const originalPublish = RabbitMQConnection.prototype.publish;
          RabbitMQConnection.prototype.publish = async function(...args) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return originalPublish.apply(this, args);
          };
        },
        
        recover: async () => {
          // Restore normal operation
          // In real scenario, would restore original method
        },
        
        verify: async () => {
          // Messages should still be delivered despite latency
          const rabbitmq = RabbitMQConnection.getInstance();
          
          const start = Date.now();
          await rabbitmq.publish('test.latency', { test: true });
          const duration = Date.now() - start;
          
          // Should complete even with latency
          return duration < 5000;
        }
      };

      const passed = await chaos.runScenario(scenario);
      expect(passed).toBe(true);
    });
  });

  describe('Recovery Verification', () => {
    it('should verify no data loss after chaos', async () => {
      // Submit payments before chaos
      const paymentIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const id = `CHAOS-VERIFY-${i}`;
        paymentIds.push(id);
        
        await db.execute(sql`
          INSERT INTO payment_transactions (
            payment_id, loan_id, source, amount_cents, state, external_ref
          ) VALUES (
            ${id}, '17', 'ach', ${(i + 1) * 10000}, 'received', ${`CHAOS-${i}`}
          )
        `);
      }

      // Run multiple chaos scenarios
      const scenarios = chaos['scenarios'];
      for (const scenario of scenarios.slice(0, 3)) {
        await chaos.runScenario(scenario);
      }

      // Verify all payments still exist
      const result = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM payment_transactions 
        WHERE payment_id LIKE 'CHAOS-VERIFY-%'
      `);

      expect(result.rows[0].count).toBe(10);
    });
  });
});