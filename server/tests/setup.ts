/**
 * Test Setup and Configuration
 * Initializes test environment, database, and RabbitMQ connections
 */

import { beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
process.env.CLOUDAMQP_URL = process.env.TEST_CLOUDAMQP_URL || process.env.CLOUDAMQP_URL;

// Global test timeout
const TEST_TIMEOUT = 30000;

// Initialize connections
let rabbitmq: any = null;

beforeAll(async () => {
  console.log('[TEST SETUP] Initializing test environment...');
  
  // Connect to RabbitMQ if tests need it
  if (process.env.CLOUDAMQP_URL) {
    try {
      rabbitmq = getEnhancedRabbitMQService();
      await rabbitmq.waitForConnection();
      console.log('[TEST SETUP] RabbitMQ connected');
    } catch (error) {
      console.warn('[TEST SETUP] RabbitMQ connection failed:', error);
    }
  }

  // Clear test data
  await cleanupTestData();
  
  console.log('[TEST SETUP] Test environment ready');
}, TEST_TIMEOUT);

afterAll(async () => {
  console.log('[TEST CLEANUP] Cleaning up test environment...');
  
  // Close RabbitMQ connection
  if (rabbitmq) {
    await rabbitmq.shutdown();
  }

  // Final cleanup
  await cleanupTestData();
  
  console.log('[TEST CLEANUP] Test environment cleaned up');
}, TEST_TIMEOUT);

beforeEach(async () => {
  // Clear test-specific data between tests
  await clearTestPayments();
});

/**
 * Clean up all test data
 */
async function cleanupTestData(): Promise<void> {
  try {
    // Clear test payments
    await db.execute(sql`
      DELETE FROM payment_distributions 
      WHERE payment_id LIKE 'TEST-%' 
         OR payment_id LIKE 'REPLAY-%' 
         OR payment_id LIKE 'CHAOS-%'
    `);
    
    await db.execute(sql`
      DELETE FROM payment_ledger 
      WHERE payment_id LIKE 'TEST-%' 
         OR payment_id LIKE 'REPLAY-%' 
         OR payment_id LIKE 'CHAOS-%'
    `);
    
    await db.execute(sql`
      DELETE FROM payment_state_transitions 
      WHERE payment_id LIKE 'TEST-%' 
         OR payment_id LIKE 'REPLAY-%' 
         OR payment_id LIKE 'CHAOS-%'
    `);
    
    await db.execute(sql`
      DELETE FROM payment_transactions 
      WHERE payment_id LIKE 'TEST-%' 
         OR payment_id LIKE 'REPLAY-%' 
         OR payment_id LIKE 'CHAOS-%'
         OR external_ref LIKE 'TEST-%'
         OR external_ref LIKE 'CHAOS-%'
    `);

    // Clear test outbox messages
    await db.execute(sql`
      DELETE FROM payment_outbox 
      WHERE id LIKE 'TEST-%' 
         OR id LIKE 'FAIL-MSG-%'
    `);

  } catch (error) {
    console.error('[TEST CLEANUP] Error cleaning test data:', error);
  }
}

/**
 * Clear test payment data
 */
async function clearTestPayments(): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM payment_transactions 
      WHERE external_ref LIKE 'TEST-%' 
         OR payment_id LIKE 'TEST-%'
    `);
  } catch (error) {
    // Ignore errors during cleanup
  }
}

// Export for use in tests
export { rabbitmq, cleanupTestData };