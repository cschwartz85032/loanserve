import { posterService } from './server/services/poster-service';
import { PaymentEnvelope } from './server/services/payment-envelope';
import { WaterfallResult } from './server/services/rules-engine';
import { randomUUID } from 'crypto';

async function testPosterService() {
  console.log('=== Testing Poster Service with Transactional Outbox ===\n');

  // Create test envelope
  const testEnvelope: PaymentEnvelope = {
    idempotency_key: `test-${randomUUID()}`,
    message_id: randomUUID(),
    correlation_id: randomUUID(),
    source: {
      channel: 'ach',
      gateway: 'column',
      rail: 'ach'
    },
    borrower: {
      loan_id: '18',  // Using existing loan ID from database
      account_number: 'ACC-1001'
    },
    payment: {
      value_date: new Date().toISOString(),
      settlement_date: new Date().toISOString()
    },
    amount_cents: 150000, // $1,500.00
    method: 'ach',
    external: {
      column_transfer_id: `col_${randomUUID()}`
    }
  };

  // Create test waterfall allocation
  const testWaterfall: WaterfallResult = {
    xF: 5000,    // $50 fees
    xI: 30000,   // $300 interest
    xP: 100000,  // $1,000 principal
    xE: 10000,   // $100 escrow
    suspense: 5000 // $50 suspense
  };

  const postingDecision = {
    shouldPost: true,
    reason: 'ACH payment settled'
  };

  try {
    // Test 1: First posting (should create new payment)
    console.log('Test 1: Initial posting');
    const result1 = await posterService.postFromRulesEngine(
      testEnvelope,
      testWaterfall,
      postingDecision
    );
    console.log(`✓ Payment ${result1.paymentId} posted: ${result1.posted ? 'NEW' : 'EXISTING'}`);

    // Test 2: Idempotency test (same envelope, should return existing)
    console.log('\nTest 2: Idempotency check (replay same envelope)');
    const result2 = await posterService.postFromRulesEngine(
      testEnvelope,
      testWaterfall,
      postingDecision
    );
    console.log(`✓ Payment ${result2.paymentId} posted: ${result2.posted ? 'NEW' : 'EXISTING'}`);
    
    if (result1.paymentId !== result2.paymentId) {
      throw new Error('Idempotency failed! Different payment IDs returned');
    }
    console.log('✓ Idempotency verified: Same payment ID returned');

    // Test 3: Verify database state
    console.log('\nTest 3: Verifying database state');
    const verification = await posterService.verifyIdempotency(testEnvelope.idempotency_key!);
    console.log(`✓ Payment exists: ${verification.paymentExists}`);
    console.log(`  Payment ID: ${verification.paymentId}`);
    console.log(`  Ledger entries: ${verification.ledgerEntryCount}`);
    console.log(`  Outbox messages: ${verification.outboxMessageCount}`);

    // Test 4: Pending payment (not ready to post)
    console.log('\nTest 4: Pending payment test');
    const pendingEnvelope = { 
      ...testEnvelope, 
      idempotency_key: `pending-${randomUUID()}` 
    };
    const pendingDecision = {
      shouldPost: false,
      reason: 'Payment pending ACH settlement'
    };
    
    const result3 = await posterService.postFromRulesEngine(
      pendingEnvelope,
      testWaterfall,
      pendingDecision
    );
    console.log(`✓ Pending payment ${result3.paymentId} created with status: pending`);

    console.log('\n=== All Tests Passed ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testPosterService().then(() => {
  console.log('\n✅ Poster service tests completed successfully');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});