#!/usr/bin/env tsx

/**
 * Test the Outbox Dispatcher with publisher confirms and backoff
 */

import { db } from './server/db';
import { outboxMessages } from './shared/schema';
import { outboxDispatcher } from './server/services/outbox-dispatcher';
import crypto from 'crypto';

async function createTestMessage() {
  const paymentId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  
  const message = {
    aggregateType: 'payment',
    aggregateId: paymentId,
    eventType: 'payment.posted',
    payload: {
      paymentId: paymentId,
      amount: 1500.00,
      timestamp: new Date().toISOString(),
      correlation_id: correlationId
    }
  };

  const result = await db.insert(outboxMessages).values(message).returning();
  console.log('Created test message:', result[0].id);
  return result[0];
}

async function testDispatcher() {
  console.log('\n=== Testing Outbox Dispatcher ===\n');

  try {
    // Create a test message
    const message = await createTestMessage();
    console.log('Test message created with ID:', message.id);

    // Start the dispatcher
    console.log('\nStarting outbox dispatcher...');
    outboxDispatcher.start();

    // Get status
    const status = outboxDispatcher.getStatus();
    console.log('Dispatcher status:', status);

    // Wait for a cycle to complete
    console.log('\nWaiting for dispatch cycle...');
    await new Promise(resolve => setTimeout(resolve, 6000));

    // Check if message was published
    const updatedMessage = await db
      .select()
      .from(outboxMessages)
      .where(eq(outboxMessages.id, message.id))
      .limit(1);

    if (updatedMessage[0]?.publishedAt) {
      console.log('✅ Message published successfully at:', updatedMessage[0].publishedAt);
    } else if (updatedMessage[0]?.lastError) {
      console.log('❌ Message failed with error:', updatedMessage[0].lastError);
      console.log('   Attempt count:', updatedMessage[0].attemptCount);
      console.log('   Next retry at:', updatedMessage[0].nextRetryAt);
    } else {
      console.log('⏳ Message still pending');
    }

    // Stop the dispatcher
    console.log('\nStopping dispatcher...');
    outboxDispatcher.stop();

  } catch (error) {
    console.error('Test failed:', error);
  }

  process.exit(0);
}

// Import eq for the query
import { eq } from 'drizzle-orm';

// Run the test
testDispatcher().catch(console.error);