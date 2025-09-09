/**
 * Payment Processing Consumer - Phase 2: Async Queue-Based Payments
 * Handles payment processing, waterfall allocation, and ledger updates
 */

import type { Connection, Channel, ConsumeMessage } from 'amqplib';
import { createEnvelope, validateMessage } from '../../messaging/envelope-helpers';
import { Exchanges, ROUTING_KEYS } from '../topology';
import { z } from 'zod';
import { db } from '../../../server/db';
import { payments, loanLedger, escrowAccounts } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';

// Payment processing message schema
export const PaymentProcessingSchema = z.object({
  payment_id: z.string(),
  loan_id: z.number(),
  source: z.enum(['ach', 'wire', 'check', 'card', 'cash']),
  amount_cents: z.number().positive(),
  currency: z.string().default('USD'),
  
  // ACH-specific fields
  account_number_masked: z.string().optional(),
  routing_number_masked: z.string().optional(),
  account_type: z.enum(['checking', 'savings']).optional(),
  sec_code: z.enum(['PPD', 'CCD', 'WEB', 'TEL']).optional(),
  trace_number: z.string().optional(),
  
  // Wire fields
  wire_ref: z.string().optional(),
  sender_ref: z.string().optional(),
  
  // Check fields
  check_number: z.string().optional(),
  payer_account: z.string().optional(),
  
  // Card fields
  card_last_four: z.string().optional(),
  card_type: z.string().optional(),
  auth_code: z.string().optional(),
  
  // Common fields
  external_ref: z.string().optional(),
  processor_ref: z.string().optional(),
  submitted_by: z.number().optional(), // User ID
  submitted_at: z.string().optional()
});

export type PaymentProcessingMessage = z.infer<typeof PaymentProcessingSchema>;

/**
 * Payment Waterfall Allocation Strategy
 * Distributes payment across fees, interest, principal, and escrow
 */
async function allocatePayment(loanId: number, amountCents: number, paymentId: string) {
  console.log(`[Payment] Allocating payment ${paymentId} for loan ${loanId}: $${amountCents/100}`);
  
  // TODO: Get loan terms and current balances
  // For now, implement simple allocation strategy
  const allocation = {
    late_fees: Math.min(amountCents, 2500), // Max $25 late fees
    interest: Math.min(amountCents - 2500, Math.round(amountCents * 0.3)),
    principal: Math.max(0, amountCents - 2500 - Math.round(amountCents * 0.3) - Math.round(amountCents * 0.1)),
    escrow: Math.round(amountCents * 0.1)
  };
  
  // Create ledger entries for each allocation
  const ledgerEntries = [];
  
  if (allocation.late_fees > 0) {
    ledgerEntries.push({
      id: ulid(),
      loanId,
      entryType: 'payment_late_fees' as const,
      amount: (allocation.late_fees / 100).toString(),
      description: `Late fee payment - ${paymentId}`,
      paymentId,
      createdAt: new Date(),
      balance: '0' // Will be calculated
    });
  }
  
  if (allocation.interest > 0) {
    ledgerEntries.push({
      id: ulid(),
      loanId,
      entryType: 'payment_interest' as const,
      amount: (allocation.interest / 100).toString(),
      description: `Interest payment - ${paymentId}`,
      paymentId,
      createdAt: new Date(),
      balance: '0'
    });
  }
  
  if (allocation.principal > 0) {
    ledgerEntries.push({
      id: ulid(),
      loanId,
      entryType: 'payment_principal' as const,
      amount: (allocation.principal / 100).toString(),
      description: `Principal payment - ${paymentId}`,
      paymentId,
      createdAt: new Date(),
      balance: '0'
    });
  }
  
  if (allocation.escrow > 0) {
    // Credit escrow account
    ledgerEntries.push({
      id: ulid(),
      loanId,
      entryType: 'escrow_credit' as const,
      amount: (allocation.escrow / 100).toString(),
      description: `Escrow credit - ${paymentId}`,
      paymentId,
      createdAt: new Date(),
      balance: '0'
    });
    
    // Update escrow account balance
    await db.update(escrowAccounts)
      .set({
        currentBalance: (Number((await db.select().from(escrowAccounts).where(eq(escrowAccounts.loanId, loanId)))[0]?.currentBalance || '0') + allocation.escrow / 100).toString()
      })
      .where(eq(escrowAccounts.loanId, loanId));
  }
  
  // Insert all ledger entries
  if (ledgerEntries.length > 0) {
    await db.insert(loanLedger).values(ledgerEntries);
  }
  
  console.log(`[Payment] Allocation complete:`, allocation);
  return allocation;
}

/**
 * Process payment message
 */
async function processPaymentMessage(message: PaymentProcessingMessage, publishEvent: Function): Promise<void> {
  console.log(`[Payment Consumer] Processing payment: ${message.payment_id}`);
  
  try {
    // Create payment record
    const payment = {
      id: message.payment_id,
      loanId: message.loan_id,
      amount: (message.amount_cents / 100).toString(),
      source: message.source,
      status: 'processing' as const,
      externalRef: message.external_ref,
      processorRef: message.processor_ref,
      submittedAt: message.submitted_at ? new Date(message.submitted_at) : new Date(),
      submittedBy: message.submitted_by || 1, // Default system user
      
      // Source-specific fields
      accountNumberMasked: message.account_number_masked,
      routingNumberMasked: message.routing_number_masked,
      accountType: message.account_type,
      secCode: message.sec_code,
      traceNumber: message.trace_number,
      wireRef: message.wire_ref,
      senderRef: message.sender_ref,
      checkNumber: message.check_number,
      payerAccount: message.payer_account,
      cardLastFour: message.card_last_four,
      cardType: message.card_type,
      authCode: message.auth_code
    };
    
    await db.insert(payments).values(payment);
    console.log(`[Payment Consumer] Payment record created: ${message.payment_id}`);
    
    // Perform waterfall allocation
    await allocatePayment(message.loan_id, message.amount_cents, message.payment_id);
    
    // Update payment status to processed
    await db.update(payments)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(payments.id, message.payment_id));
    
    console.log(`[Payment Consumer] Payment processed successfully: ${message.payment_id}`);
    
    // Publish payment processed event
    const processedEvent = createEnvelope({
      tenantId: 'default',
      correlationId: ulid(),
      payload: {
        eventType: 'payment.processed',
        payment_id: message.payment_id,
        loan_id: message.loan_id,
        amount_cents: message.amount_cents,
        source: message.source,
        processed_at: new Date().toISOString()
      }
    });
    
    await publishEvent(Exchanges.Events, 'payment.processed', processedEvent);
    
  } catch (error) {
    console.error(`[Payment Consumer] Error processing payment ${message.payment_id}:`, error);
    
    // Update payment status to failed
    await db.update(payments)
      .set({ status: 'failed', errorMessage: error.message })
      .where(eq(payments.id, message.payment_id));
    
    // Publish payment failed event
    const failedEvent = createEnvelope({
      tenantId: 'default',
      correlationId: ulid(),
      payload: {
        eventType: 'payment.failed',
        payment_id: message.payment_id,
        loan_id: message.loan_id,
        error: error.message,
        failed_at: new Date().toISOString()
      }
    });
    
    await publishEvent(Exchanges.Events, 'payment.failed', failedEvent);
    
    throw error; // Re-throw to trigger retry mechanism
  }
}

/**
 * Initialize payment processing consumer
 */
export async function initPaymentConsumer(connection: Connection, publishEvent: Function): Promise<void> {
  const channel = await connection.createChannel();
  
  // Set prefetch count for controlled processing
  await channel.prefetch(1);
  
  console.log('[Payment Consumer] Initializing payment processing consumer...');
  
  // Consume payment processing messages
  await channel.consume(ROUTING_KEYS.PAYMENT_PROCESS, async (msg: ConsumeMessage | null) => {
    if (!msg) return;
    
    try {
      const envelope = JSON.parse(msg.content.toString());
      const message = validateMessage(envelope, PaymentProcessingSchema);
      
      console.log(`[Payment Consumer] Received payment processing message:`, {
        correlationId: envelope.correlationId,
        paymentId: message.payment_id,
        loanId: message.loan_id,
        amount: message.amount_cents
      });
      
      await processPaymentMessage(message, publishEvent);
      
      channel.ack(msg);
      console.log(`[Payment Consumer] Payment processing completed: ${message.payment_id}`);
      
    } catch (error) {
      console.error('[Payment Consumer] Error processing message:', error);
      
      // Check retry count and either retry or send to DLQ
      const retryCount = (msg.properties.headers?.['x-retry-count'] || 0) as number;
      
      if (retryCount < 3) {
        // Reject and retry
        channel.nack(msg, false, false); // Send to retry queue
        console.log(`[Payment Consumer] Message rejected for retry (attempt ${retryCount + 1})`);
      } else {
        // Send to DLQ after max retries
        channel.nack(msg, false, false); // Send to DLQ
        console.log(`[Payment Consumer] Message sent to DLQ after ${retryCount + 1} attempts`);
      }
    }
  });
  
  console.log('[Payment Consumer] ✅ Payment processing consumer initialized');
}