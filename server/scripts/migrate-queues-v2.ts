#!/usr/bin/env node
import * as amqplib from 'amqplib';
import { topologyManager } from '../messaging/topology.js';
import { 
  withAdminChannel, 
  assertQueueSafe, 
  bindQueueSafe, 
  checkQueue,
  deleteQueueIfEmpty 
} from '../messaging/channel-isolation.js';

const CLOUDAMQP_URL = process.env.CLOUDAMQP_URL || '';

interface MigrationResult {
  queue: string;
  status: 'migrated' | 'versioned' | 'skipped' | 'error';
  message: string;
}

/**
 * Normalize queue arguments for comparison
 */
function normalizeArgs(args: any): any {
  const normalized: any = {};
  
  // Convert all values to consistent types
  if (args['x-max-length'] !== undefined) {
    normalized['x-max-length'] = Number(args['x-max-length']);
  }
  if (args['x-message-ttl'] !== undefined) {
    normalized['x-message-ttl'] = Number(args['x-message-ttl']);
  }
  if (args['x-delivery-limit'] !== undefined) {
    normalized['x-delivery-limit'] = Number(args['x-delivery-limit']);
  }
  if (args['x-queue-mode'] !== undefined) {
    normalized['x-queue-mode'] = String(args['x-queue-mode']);
  }
  if (args['x-queue-type'] !== undefined) {
    normalized['x-queue-type'] = String(args['x-queue-type']);
  }
  if (args['x-dead-letter-exchange'] !== undefined) {
    normalized['x-dead-letter-exchange'] = String(args['x-dead-letter-exchange']);
  }
  
  return normalized;
}

/**
 * Check if queue arguments match
 */
function argumentsMatch(expected: any, actual: any): boolean {
  const normalizedExpected = normalizeArgs(expected || {});
  const normalizedActual = normalizeArgs(actual || {});
  
  const expectedKeys = Object.keys(normalizedExpected);
  const actualKeys = Object.keys(normalizedActual);
  
  // Check all expected keys are present with correct values
  for (const key of expectedKeys) {
    if (normalizedExpected[key] !== normalizedActual[key]) {
      return false;
    }
  }
  
  // Check for unexpected keys in actual (might be OK, but flag it)
  for (const key of actualKeys) {
    if (!(key in normalizedExpected)) {
      console.warn(`  Warning: Queue has unexpected argument ${key}=${normalizedActual[key]}`);
    }
  }
  
  return true;
}

/**
 * Migrate a single queue
 */
async function migrateQueue(
  conn: amqplib.Connection,
  queueDef: any
): Promise<MigrationResult> {
  const queueName = queueDef.name;
  
  console.log(`\nProcessing ${queueName}...`);
  
  try {
    // First, try to use the safe assertion to check for conflicts
    // This uses isolated channels to prevent connection crashes
    const check = await checkQueue(conn, queueName);
    
    if (!check.exists) {
      // Queue doesn't exist, create it with canonical args using channel isolation
      const result = await assertQueueSafe(conn, queueName, {
        durable: queueDef.durable ?? true,
        exclusive: queueDef.exclusive ?? false,
        autoDelete: queueDef.autoDelete ?? false,
        arguments: queueDef.arguments || {},
      });
      
      if (result.ok) {
        // Apply bindings
        if (queueDef.bindings) {
          for (const binding of queueDef.bindings) {
            await bindQueueSafe(conn, queueName, binding.exchange, binding.routingKey);
          }
        }
        return { queue: queueName, status: 'migrated', message: 'Created new queue with canonical args' };
      } else {
        return { queue: queueName, status: 'error', message: result.error?.message || 'Failed to create queue' };
      }
    }
    
    // Queue exists, try to assert with canonical args to check for conflicts
    // Using channel isolation to prevent connection crashes
    const assertResult = await assertQueueSafe(conn, queueName, {
      durable: queueDef.durable ?? true,
      exclusive: queueDef.exclusive ?? false,
      autoDelete: queueDef.autoDelete ?? false,
      arguments: queueDef.arguments || {},
    });
    
    if (assertResult.ok) {
      // No conflict, ensure bindings are correct
      if (queueDef.bindings) {
        for (const binding of queueDef.bindings) {
          await bindQueueSafe(conn, queueName, binding.exchange, binding.routingKey);
        }
      }
      return { queue: queueName, status: 'skipped', message: 'Queue already has correct arguments' };
    }
    
    if (assertResult.conflict) {
      // Queue has conflicting arguments
      const isEmpty = check.messageCount === 0 && check.consumerCount === 0;
      
      if (isEmpty) {
        // Queue is empty, can safely delete and recreate
        console.log(`  Queue is empty, deleting and recreating...`);
        
        // Store bindings before deletion
        const bindings = queueDef.bindings || [];
        
        // Delete the queue
        const deleteResult = await deleteQueueIfEmpty(conn, queueName);
        if (!deleteResult.deleted) {
          return { queue: queueName, status: 'error', message: `Failed to delete: ${deleteResult.reason}` };
        }
        
        // Recreate with canonical args
        const recreateResult = await assertQueueSafe(conn, queueName, {
          durable: queueDef.durable ?? true,
          exclusive: queueDef.exclusive ?? false,
          autoDelete: queueDef.autoDelete ?? false,
          arguments: queueDef.arguments,
        });
        
        if (recreateResult.ok) {
          // Restore bindings
          for (const binding of bindings) {
            await bindQueueSafe(conn, queueName, binding.exchange, binding.routingKey);
          }
          return { queue: queueName, status: 'migrated', message: 'Deleted and recreated with canonical args' };
        } else {
          return { queue: queueName, status: 'error', message: 'Failed to recreate queue' };
        }
      } else {
        // Queue is not empty, create versioned queue
        console.log(`  Queue has ${check.messageCount} messages and ${check.consumerCount} consumers`);
        console.log(`  Creating versioned queue ${queueName}.v2...`);
        
        const v2Name = `${queueName}.v2`;
        const v2Result = await assertQueueSafe(conn, v2Name, {
          durable: queueDef.durable ?? true,
          exclusive: queueDef.exclusive ?? false,
          autoDelete: queueDef.autoDelete ?? false,
          arguments: queueDef.arguments,
        });
        
        if (v2Result.ok) {
          // Apply same bindings to v2 queue
          if (queueDef.bindings) {
            for (const binding of queueDef.bindings) {
              await bindQueueSafe(conn, v2Name, binding.exchange, binding.routingKey);
            }
          }
          return { 
            queue: queueName, 
            status: 'versioned', 
            message: `Created ${v2Name} with canonical args. Update consumers to use .v2 queue` 
          };
        } else {
          return { queue: queueName, status: 'error', message: 'Failed to create .v2 queue' };
        }
      }
    }
    
    return { queue: queueName, status: 'error', message: 'Unexpected state' };
    
  } catch (error: any) {
    return { queue: queueName, status: 'error', message: error.message };
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log('🔧 Queue Migration Tool v2\n');
  
  if (!CLOUDAMQP_URL) {
    console.error('❌ CLOUDAMQP_URL environment variable not set');
    process.exit(1);
  }
  
  let conn: amqplib.Connection | null = null;
  
  try {
    // Connect to RabbitMQ
    console.log('Connecting to RabbitMQ...');
    conn = await amqplib.connect(CLOUDAMQP_URL);
    console.log('✅ Connected\n');
    
    // Get all queues from topology
    const queuesMap = topologyManager.getQueues();
    const results: MigrationResult[] = [];
    
    // Prioritize critical queues
    const priorityQueues = ['q.forecast', 'audit.events', 'q.escrow.dlq'];
    const allQueueNames = Array.from(queuesMap.keys());
    const otherQueues = allQueueNames.filter(q => !priorityQueues.includes(q));
    const orderedQueues = [...priorityQueues, ...otherQueues];
    
    // Process each queue
    for (const queueName of orderedQueues) {
      const queueDef = queuesMap.get(queueName);
      if (queueDef) {
        const result = await migrateQueue(conn, queueDef);
        results.push(result);
        
        if (result.status === 'migrated') {
          console.log(`✅ Migrated ${result.queue}`);
        } else if (result.status === 'versioned') {
          console.log(`⚠️  Versioned ${result.queue} -> ${result.queue}.v2`);
        } else if (result.status === 'skipped') {
          console.log(`⏭️  Skipped ${result.queue} (already correct)`);
        } else {
          console.log(`❌ Error with ${result.queue}: ${result.message}`);
        }
      }
    }
    
    // Summary
    console.log('\n=== Migration Summary ===');
    const migrated = results.filter(r => r.status === 'migrated');
    const versioned = results.filter(r => r.status === 'versioned');
    const skipped = results.filter(r => r.status === 'skipped');
    const errors = results.filter(r => r.status === 'error');
    
    console.log(`✅ Migrated: ${migrated.length} queues`);
    console.log(`⚠️  Versioned: ${versioned.length} queues (require consumer updates)`);
    console.log(`⏭️  Skipped: ${skipped.length} queues`);
    console.log(`❌ Errors: ${errors.length} queues`);
    
    if (versioned.length > 0) {
      console.log('\n⚠️  Action Required:');
      console.log('The following queues were versioned and require consumer updates:');
      for (const v of versioned) {
        console.log(`  - Update consumers of '${v.queue}' to use '${v.queue}.v2'`);
      }
    }
    
    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      for (const e of errors) {
        console.log(`  - ${e.queue}: ${e.message}`);
      }
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (conn) {
      await conn.close();
      console.log('\n✅ Connection closed');
    }
  }
}

// Run if executed directly
main().catch(console.error);