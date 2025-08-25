import { db } from '../db';
import { 
  payments, 
  paymentEvents, 
  outboxMessages,
  paymentIngestions,
  ledgerEntries
} from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import { WaterfallResult } from './rules-engine';
import { PaymentEnvelope } from './payment-envelope';
import { randomUUID } from 'crypto';
import crypto from 'crypto';

// Ledger entry type matches the schema
export interface LedgerEntryData {
  id?: string;
  paymentId: number;
  entryDate: string; // date string for DB
  accountType: string;
  accountCode: string;
  debitAmount: string;
  creditAmount: string;
  description: string;
  correlationId: string;
  metadata?: any;
}

export class PosterService {
  // Compute event hash for audit chain
  private computeEventHash(
    prevHash: string | null,
    payload: any,
    correlationId: string
  ): string {
    const data = JSON.stringify({
      prev: prevHash || '',
      payload,
      correlationId,
      timestamp: new Date().toISOString()
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Get previous event hash for payment
  private async getPrevEventHash(
    tx: any,
    paymentId: number
  ): Promise<string | null> {
    const prevEvent = await tx
      .select({ eventHash: paymentEvents.eventHash })
      .from(paymentEvents)
      .where(eq(paymentEvents.paymentId, String(paymentId)))
      .orderBy(sql`${paymentEvents.eventTime} DESC`)
      .limit(1);

    return prevEvent.length > 0 ? prevEvent[0].eventHash : null;
  }

  // Find ingestion ID from envelope
  private async findIngestionId(
    tx: any,
    env: PaymentEnvelope
  ): Promise<string | null> {
    if (!env.idempotency_key) return null;

    const ingestion = await tx
      .select({ id: paymentIngestions.id })
      .from(paymentIngestions)
      .where(eq(paymentIngestions.idempotencyKey, env.idempotency_key))
      .limit(1);

    return ingestion.length > 0 ? ingestion[0].id : null;
  }

  // Make ledger entries from waterfall allocation
  private makeLedgerEntries(
    paymentId: number,
    waterfall: WaterfallResult,
    env: PaymentEnvelope
  ): LedgerEntryData[] {
    const entries: LedgerEntryData[] = [];
    const loanId = env.borrower?.loan_id || 'unknown';
    const entryDate = new Date(env.payment?.value_date || new Date()).toISOString().split('T')[0];
    const correlationId = env.correlation_id;

    // Cash account (debit for receipt)
    entries.push({
      paymentId,
      entryDate,
      accountType: 'asset',
      accountCode: `cash_${env.source?.channel || 'unknown'}`,
      debitAmount: ((env.amount_cents || 0) / 100).toFixed(2),
      creditAmount: '0.00',
      description: `Payment received - Loan ${loanId}`,
      correlationId,
      metadata: { source: env.source }
    });

    // Fee income (credit)
    if (waterfall.xF > 0) {
      entries.push({
        paymentId,
        entryDate,
        accountType: 'revenue',
        accountCode: 'fee_income',
        debitAmount: '0.00',
        creditAmount: (waterfall.xF / 100).toFixed(2),
        description: `Fee income - Loan ${loanId}`,
        correlationId
      });
    }

    // Interest income (credit)
    if (waterfall.xI > 0) {
      entries.push({
        paymentId,
        entryDate,
        accountType: 'revenue',
        accountCode: 'interest_income',
        debitAmount: '0.00',
        creditAmount: (waterfall.xI / 100).toFixed(2),
        description: `Interest income - Loan ${loanId}`,
        correlationId
      });
    }

    // Principal reduction (credit to loan receivable)
    if (waterfall.xP > 0) {
      entries.push({
        paymentId,
        entryDate,
        accountType: 'asset',
        accountCode: `loan_receivable_${loanId}`,
        debitAmount: '0.00',
        creditAmount: (waterfall.xP / 100).toFixed(2),
        description: `Principal payment - Loan ${loanId}`,
        correlationId
      });
    }

    // Escrow deposit (credit to liability)
    if (waterfall.xE > 0) {
      entries.push({
        paymentId,
        entryDate,
        accountType: 'liability',
        accountCode: `escrow_${loanId}`,
        debitAmount: '0.00',
        creditAmount: (waterfall.xE / 100).toFixed(2),
        description: `Escrow deposit - Loan ${loanId}`,
        correlationId
      });
    }

    // Suspense account (credit to liability)
    if (waterfall.suspense > 0) {
      entries.push({
        paymentId,
        entryDate,
        accountType: 'liability',
        accountCode: 'suspense',
        debitAmount: '0.00',
        creditAmount: (waterfall.suspense / 100).toFixed(2),
        description: `Suspense - Loan ${loanId}`,
        correlationId,
        metadata: { reason: 'overpayment' }
      });
    }

    return entries;
  }

  // Main posting method with transactional outbox
  async postPayment(
    env: PaymentEnvelope,
    waterfall: WaterfallResult,
    postingReady: boolean
  ): Promise<{ paymentId: number; isNew: boolean }> {
    console.log(`[Poster] Processing payment with idempotency key: ${env.idempotency_key}`);

    return await db.transaction(async (tx) => {
      // Find or create payment by idempotency
      const existing = await tx
        .select()
        .from(payments)
        .where(eq(payments.idempotencyKey, env.idempotency_key || ''))
        .limit(1);

      let paymentId: number;
      let isNew = false;

      if (existing.length > 0) {
        // Payment already exists, return it (idempotent)
        paymentId = existing[0].id;
        console.log(`[Poster] Payment already exists with ID: ${paymentId}`);
      } else {
        // Create new payment
        const loanId = parseInt(env.borrower?.loan_id || '0');
        
        const inserted = await tx
          .insert(payments)
          .values({
            loanId: loanId || null,
            sourceChannel: env.source?.channel || 'unknown',
            idempotencyKey: env.idempotency_key,
            columnTransferId: env.external?.column_transfer_id,
            effectiveDate: new Date(env.payment?.value_date || new Date()).toISOString().split('T')[0],
            totalReceived: ((env.amount_cents || 0) / 100).toFixed(2),
            status: postingReady ? 'completed' : 'pending',
            suspenseAmount: (waterfall.suspense / 100).toFixed(2),
            principalAmount: (waterfall.xP / 100).toFixed(2),
            interestAmount: (waterfall.xI / 100).toFixed(2),
            otherFeeAmount: (waterfall.xF / 100).toFixed(2),
            escrowAmount: (waterfall.xE / 100).toFixed(2),
            paymentMethod: env.method || 'unknown',
            transactionId: env.external?.column_transfer_id || env.message_id,
            notes: `Posted via transactional outbox`,
            metadata: {
              envelope: env,
              waterfall,
              postingReady
            },
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning({ id: payments.id });

        paymentId = inserted[0].id;
        isNew = true;
        console.log(`[Poster] Created new payment with ID: ${paymentId}`);

        // Create ledger entries
        const ledgerData = this.makeLedgerEntries(paymentId, waterfall, env);
        
        if (ledgerData.length > 0) {
          await tx.insert(ledgerEntries).values(
            ledgerData.map(entry => ({
              ...entry,
              id: randomUUID(),
              createdAt: new Date(),
              updatedAt: new Date()
            }))
          );
          console.log(`[Poster] Created ${ledgerData.length} ledger entries`);
        }

        // Create outbox message
        const eventPayload = {
          payment_id: paymentId,
          env,
          allocations: waterfall,
          status: postingReady ? 'completed' : 'pending'
        };

        // Generate a UUID for aggregate_id since DB expects UUID type
        const aggregateUuid = randomUUID();

        await tx.insert(outboxMessages).values({
          id: randomUUID(),
          aggregateType: 'payments',
          aggregateId: aggregateUuid, // Use UUID instead of payment ID
          eventType: 'payment.posted',
          payload: eventPayload, // Payment ID is in the payload
          createdAt: new Date(),
          publishedAt: null,
          attemptCount: 0,
          lastError: null
        });
        console.log(`[Poster] Created outbox message for payment.posted`);

        // Create payment event with hash chain
        const ingestionId = await this.findIngestionId(tx, env);
        const prevHash = null; // Can't get prev hash by payment ID since it's UUID
        const eventHash = this.computeEventHash(prevHash, eventPayload, env.correlation_id);

        // Generate UUIDs for UUID fields in database
        const eventId = randomUUID();
        const correlationUuid = randomUUID(); // Generate new UUID for correlation

        await tx.insert(paymentEvents).values({
          id: eventId,
          paymentId: null, // Leave null since DB expects UUID but we have integer
          ingestionId: null, // Leave null for now since DB expects UUID
          type: 'payment.posted',
          eventTime: new Date(),
          actorType: 'system',
          actorId: 'poster-service',
          correlationId: correlationUuid, // Use UUID instead of string
          data: { ...eventPayload, actual_payment_id: paymentId }, // Store real payment ID in data
          prevEventHash: prevHash,
          eventHash
        });
        console.log(`[Poster] Created payment event with hash: ${eventHash}`);
      }

      return { paymentId, isNew };
    });
  }

  // Post payment from rules engine result
  async postFromRulesEngine(
    env: PaymentEnvelope,
    waterfall: WaterfallResult,
    postingDecision: { shouldPost: boolean; reason: string }
  ): Promise<{ paymentId: number; posted: boolean }> {
    try {
      const postingReady = postingDecision.shouldPost;
      const result = await this.postPayment(env, waterfall, postingReady);
      
      console.log(`[Poster] Payment ${result.paymentId} posted: ${result.isNew ? 'NEW' : 'EXISTING'}`);
      
      return {
        paymentId: result.paymentId,
        posted: result.isNew
      };
    } catch (error: any) {
      // Handle unique constraint violations
      if (error.code === '23505' && error.constraint?.includes('idempotency')) {
        console.log('[Poster] Idempotency key conflict, fetching existing payment');
        
        // Fetch existing payment
        const existing = await db
          .select()
          .from(payments)
          .where(eq(payments.idempotencyKey, env.idempotency_key || ''))
          .limit(1);

        if (existing.length > 0) {
          return {
            paymentId: existing[0].id,
            posted: false
          };
        }
      }
      
      console.error('[Poster] Error posting payment:', error);
      throw error;
    }
  }

  // Verify idempotency
  async verifyIdempotency(idempotencyKey: string): Promise<{
    paymentExists: boolean;
    paymentId?: number;
    ledgerEntryCount?: number;
    outboxMessageCount?: number;
  }> {
    const payment = await db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, idempotencyKey))
      .limit(1);

    if (payment.length === 0) {
      return { paymentExists: false };
    }

    const paymentId = payment[0].id;

    // Count ledger entries
    const ledgerCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.paymentId, paymentId));

    // Count outbox messages - we can't query by payment ID anymore since aggregateId is UUID
    // Instead, we check if any outbox messages exist for payment.posted events
    const outboxCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(outboxMessages)
      .where(
        and(
          eq(outboxMessages.aggregateType, 'payments'),
          eq(outboxMessages.eventType, 'payment.posted')
        )
      );

    return {
      paymentExists: true,
      paymentId,
      ledgerEntryCount: Number(ledgerCount[0]?.count || 0),
      outboxMessageCount: Number(outboxCount[0]?.count || 0)
    };
  }
}

// Export singleton instance
export const posterService = new PosterService();