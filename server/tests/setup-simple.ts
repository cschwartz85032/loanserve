/**
 * Simple Test Setup without RabbitMQ
 * For unit tests that don't need messaging infrastructure
 */

import { beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../db';
import { sql } from 'drizzle-orm';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

// Global test timeout
const TEST_TIMEOUT = 30000;

beforeAll(async () => {
  console.log('[TEST SETUP] Initializing simple test environment...');
  
  // Clear test data
  await cleanupTestData();
  
  console.log('[TEST SETUP] Test environment ready');
}, TEST_TIMEOUT);

afterAll(async () => {
  console.log('[TEST CLEANUP] Cleaning up test environment...');
  
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
export { cleanupTestData };