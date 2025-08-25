#!/usr/bin/env tsx

/**
 * Test script for Returns Handler
 * Tests ACH returns, reversals, and dispute creation
 */

import { db } from './server/db';
import { payments, paymentEvents, ledgerEntries, exceptionCases, loans, properties, outboxMessages } from './shared/schema';
import { ReturnsHandler } from './server/services/returns-handler';
import { eq, and, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';

const returnsHandler = new ReturnsHandler();
let testLoanId: number;

async function setupTestLoan(): Promise<number> {
  // Create a test property first
  const [property] = await db.insert(properties).values({
    address: '123 Test Street',
    city: 'Test City',
    state: 'CA',
    zipCode: '12345',
    propertyType: 'single_family',
    occupancyStatus: 'owner_occupied',
    currentValue: '150000.00',
    purchasePrice: '140000.00',
    purchaseDate: new Date('2020-01-01')
  }).returning();
  console.log(`✅ Created test property: ${property.id}`);
  
  // Create a test loan with all required fields
  const [loan] = await db.insert(loans).values({
    loanNumber: 'TEST-' + Date.now(),
    loanType: 'conventional',
    propertyId: property.id,
    originalAmount: '100000.00',
    principalBalance: '95000.00',  
    currentBalance: '95000.00',
    interestRate: '5.50',
    rateType: 'fixed',
    loanTerm: 360,  // Required field
    term: 360,
    maturityDate: new Date('2054-01-01'),
    paymentAmount: '800.00',  // Required field
    status: 'active',
    paymentFrequency: 'monthly'
  }).returning();
  
  console.log(`✅ Created test loan: ${loan.id}`);
  return loan.id;
}

async function createTestPayment(): Promise<string> {
  // Create a test payment using the new UUID-based schema
  const [payment] = await db.insert(payments).values({
    loanId: testLoanId,
    effectiveDate: new Date(),
    totalReceived: '1500.00',
    paymentMethod: 'ach',
    status: 'completed',
    notes: 'Test payment for returns handler'
  }).returning();

  // Create ledger entries for the payment
  const correlationId = crypto.randomUUID();
  await db.insert(ledgerEntries).values([
    {
      paymentId: payment.id,
      entryDate: new Date().toISOString().split('T')[0], // date format
      accountType: 'asset',
      accountCode: 'cash',
      debitAmount: '1500.00',
      creditAmount: '0.00',
      description: 'Test payment received',
      correlationId,
      metadata: {
        referenceType: 'payment',
        referenceId: payment.id
      }
    },
    {
      paymentId: payment.id,
      entryDate: new Date().toISOString().split('T')[0], // date format
      accountType: 'revenue',
      accountCode: 'loan_principal',
      debitAmount: '0.00',
      creditAmount: '1500.00',
      description: 'Test payment applied',
      correlationId,
      metadata: {
        referenceType: 'payment',
        referenceId: payment.id
      }
    }
  ]);

  console.log(`✅ Created test payment: ${payment.id}`);
  return payment.id;
}

async function testR01Reversal() {
  console.log('\n=== Testing R01 (NSF) Reversal ===\n');
  
  const paymentId = await createTestPayment();
  
  // Process R01 return (NSF)
  await returnsHandler.handleACHReturn(paymentId, 'R01', new Date());
  
  // Verify payment was reversed
  const [payment] = await db.select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  
  console.log(`Payment status: ${payment.status}`);
  console.log(`Reversal notes: ${payment.notes}`);
  
  // Check for reversal event - now using UUID paymentId
  const events = await db.select()
    .from(paymentEvents)
    .where(eq(paymentEvents.paymentId, paymentId))
    .orderBy(desc(paymentEvents.eventTime));
  
  console.log('\nPayment Events:');
  events.forEach(event => {
    console.log(`  - ${event.type}: ${JSON.stringify(event.data)}`);
  });
  
  // Check for reversal ledger entries
  const reversalEntries = await db.select()
    .from(ledgerEntries)
    .where(sql`${ledgerEntries.metadata}->>'referenceId' = ${paymentId}`);
  
  console.log('\nLedger Entries:');
  reversalEntries.forEach(entry => {
    const type = entry.debitAmount !== '0.00' ? 'DEBIT' : 'CREDIT';
    const amount = entry.debitAmount !== '0.00' ? entry.debitAmount : entry.creditAmount;
    console.log(`  - ${entry.accountCode}: ${type} ${amount} - ${entry.description}`);
  });
  
  // Check outbox messages
  const outboxMsgs = await db.select()
    .from(outboxMessages)
    .where(
      and(
        eq(outboxMessages.aggregateType, 'payments'),
        eq(outboxMessages.aggregateId, paymentId)
      )
    );
  
  console.log('\nOutbox Messages:');
  outboxMsgs.forEach(msg => {
    console.log(`  - ${msg.eventType}: ${msg.status || 'pending'}`);
  });
  
  const hasReversal = events.some(e => e.type === 'payment.reversed');
  const hasReversalEntries = reversalEntries.some(e => 
    (e.metadata as any)?.referenceType === 'payment_reversal'
  );
  
  if (payment.status === 'reversed' && hasReversal && hasReversalEntries) {
    console.log('\n✅ R01 reversal test PASSED');
  } else {
    console.log('\n❌ R01 reversal test FAILED');
  }
}

async function testR10Dispute() {
  console.log('\n=== Testing R10 (Unauthorized) Dispute ===\n');
  
  const paymentId = await createTestPayment();
  
  // Process R10 return (Customer Advises Unauthorized)
  await returnsHandler.handleACHReturn(paymentId, 'R10', new Date());
  
  // Verify payment status
  const [payment] = await db.select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  
  console.log(`Payment status: ${payment.status}`);
  console.log(`Dispute notes: ${payment.notes}`);
  
  // Check for dispute case
  const [disputeCase] = await db.select()
    .from(exceptionCases)
    .where(
      and(
        eq(exceptionCases.entityId, paymentId),
        eq(exceptionCases.type, 'payment_dispute')
      )
    )
    .limit(1);
  
  if (disputeCase) {
    console.log('\nDispute Case Created:');
    console.log(`  - ID: ${disputeCase.id}`);
    console.log(`  - Severity: ${disputeCase.severity}`);
    console.log(`  - Description: ${disputeCase.description}`);
    console.log(`  - Status: ${disputeCase.status}`);
    console.log(`  - Metadata: ${JSON.stringify(disputeCase.metadata)}`);
  }
  
  if (payment.status === 'failed' && disputeCase && disputeCase.severity === 'high') {
    console.log('\n✅ R10 dispute test PASSED');
  } else {
    console.log('\n❌ R10 dispute test FAILED');
  }
}

async function testDoubleReversal() {
  console.log('\n=== Testing Double Reversal Prevention ===\n');
  
  const paymentId = await createTestPayment();
  
  // First reversal
  console.log('Performing first reversal...');
  await returnsHandler.handleACHReturn(paymentId, 'R01', new Date());
  
  // Attempt second reversal
  console.log('Attempting second reversal...');
  await returnsHandler.handleACHReturn(paymentId, 'R01', new Date());
  
  // Count reversal events - now using UUID paymentId
  const reversalEvents = await db.select()
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.paymentId, paymentId),
        eq(paymentEvents.type, 'payment.reversed')
      )
    );
  
  console.log(`Number of reversal events: ${reversalEvents.length}`);
  
  if (reversalEvents.length === 1) {
    console.log('\n✅ Double reversal prevention test PASSED');
  } else {
    console.log('\n❌ Double reversal prevention test FAILED');
  }
}

async function testOrphanReturn() {
  console.log('\n=== Testing Orphan Return Handling ===\n');
  
  // Generate a fake UUID
  const fakePaymentId = crypto.randomUUID();
  
  try {
    // Attempt to reverse non-existent payment
    await returnsHandler.handleACHReturn(fakePaymentId, 'R01', new Date());
  } catch (error) {
    console.log(`Expected error caught: ${(error as Error).message}`);
  }
  
  // Check for orphan return case
  const [orphanCase] = await db.select()
    .from(exceptionCases)
    .where(
      and(
        eq(exceptionCases.entityId, fakePaymentId),
        eq(exceptionCases.type, 'orphan_return')
      )
    )
    .limit(1);
  
  if (orphanCase) {
    console.log('\nOrphan Return Case Created:');
    console.log(`  - ID: ${orphanCase.id}`);
    console.log(`  - Severity: ${orphanCase.severity}`);
    console.log(`  - Description: ${orphanCase.description}`);
    console.log('\n✅ Orphan return test PASSED');
  } else {
    console.log('\n❌ Orphan return test FAILED');
  }
}

async function testWireRecall() {
  console.log('\n=== Testing Wire Recall (FRAUD) ===\n');
  
  // Create a wire payment
  const [payment] = await db.insert(payments).values({
    loanId: testLoanId,
    effectiveDate: new Date(),
    totalReceived: '250000.00',
    paymentMethod: 'wire',
    status: 'completed',
    notes: 'Test wire payment for recall'
  }).returning();
  
  console.log(`Created wire payment: ${payment.id}`);
  
  // Process wire recall for fraud
  await returnsHandler.handleWireRecall(payment.id, 'FRAUD', new Date());
  
  // Verify payment was reversed
  const [recalledPayment] = await db.select()
    .from(payments)
    .where(eq(payments.id, payment.id))
    .limit(1);
  
  console.log(`Wire payment status: ${recalledPayment.status}`);
  console.log(`Recall notes: ${recalledPayment.notes}`);
  
  // Check for reversal event
  const events = await db.select()
    .from(paymentEvents)
    .where(eq(paymentEvents.paymentId, payment.id))
    .orderBy(desc(paymentEvents.eventTime));
  
  console.log('\nWire Recall Events:');
  events.forEach(event => {
    console.log(`  - ${event.type}: ${JSON.stringify(event.data)}`);
  });
  
  if (recalledPayment.status === 'reversed') {
    console.log('\n✅ Wire recall test PASSED');
  } else {
    console.log('\n❌ Wire recall test FAILED');
  }
}

async function runTests() {
  console.log('🚀 Starting Returns Handler Tests\n');
  
  try {
    // Setup test loan first
    testLoanId = await setupTestLoan();
    
    await testR01Reversal();
    await testR10Dispute();
    await testDoubleReversal();
    await testOrphanReturn();
    await testWireRecall();
    
    console.log('\n✨ All tests completed!\n');
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    process.exit(0);
  }
}

// Run tests
runTests();