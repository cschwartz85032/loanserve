/**
 * Phase 3: Settlement Service
 * Handles payment settlement and external transaction processing
 */

import { db } from '../db/index.js';
import { payments, payment_external_transactions, expected_settlements, reconciliation_matches, reconciliation_exceptions } from '../../shared/schema.js';
import { enhancedRabbitMQ } from './rabbitmq-enhanced.js';
import { getMessageFactory } from '../messaging/message-factory.js';
import { eq, and, gte, lte, or, isNull, desc, asc, sql } from 'drizzle-orm';
import type { 
  BankTx, 
  ExpectedSettlement, 
  ReconciliationMatch, 
  ReconciliationException,
  Rail,
  Direction,
  ExtType,
  AchBatch,
  WireInstruction
} from '../types/settlement.js';

export class SettlementService {
  private messageFactory = getMessageFactory();

  /**
   * Create expected settlement record when payment is initiated
   */
  async createExpectedSettlement(payment: any): Promise<ExpectedSettlement> {
    const expected: ExpectedSettlement = {
      paymentId: payment.payment_id,
      loanId: payment.loan_id,
      method: this.determineRail(payment.payment_method),
      direction: 'inbound',
      amountCents: Math.round(payment.amount * 100),
      currency: 'USD',
      initiatedAt: new Date().toISOString(),
      effectiveDate: this.calculateEffectiveDate(payment.payment_method),
      extRefHint: payment.external_reference,
      state: 'pending'
    };

    const [created] = await db.insert(expected_settlements)
      .values(expected)
      .returning();

    // Publish to settlement topic
    await this.publishSettlementMessage('settlement.expected', created);

    return created;
  }

  /**
   * Process bank transaction file (BAI2, MT940, etc.)
   */
  async processBankFile(fileContent: string, format: string): Promise<void> {
    console.log(`[Settlement] Processing ${format} bank file`);

    // Parse transactions based on format
    const transactions = await this.parseBankFile(fileContent, format);
    
    // Store external transactions
    for (const tx of transactions) {
      await this.processExternalTransaction(tx);
    }

    // Trigger reconciliation
    await this.publishReconciliationMessage('bank.file.processed', {
      format,
      transactionCount: transactions.length,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Process individual external transaction
   */
  async processExternalTransaction(tx: BankTx): Promise<void> {
    try {
      // Check for duplicate
      const existing = await db.select()
        .from(payment_external_transactions)
        .where(eq(payment_external_transactions.external_transaction_id, tx.extTxId))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[Settlement] Duplicate transaction ${tx.extTxId}, skipping`);
        return;
      }

      // Store transaction
      const [stored] = await db.insert(payment_external_transactions)
        .values({
          external_transaction_id: tx.extTxId,
          rail: tx.method,
          transaction_type: tx.type,
          amount_cents: tx.amountCents,
          currency: tx.currency,
          posted_at: new Date(tx.postedAt),
          bank_account_token: tx.bankAccountToken,
          external_reference: tx.extReference,
          counterparty_name: tx.counterparty,
          memo: tx.memo,
          bank_file_id: tx.fileId,
          raw_metadata: tx.rawMeta,
          status: 'ingested'
        })
        .returning();

      // Publish for reconciliation
      await this.publishReconciliationMessage('match.required', stored);

    } catch (error) {
      console.error('[Settlement] Error processing external transaction:', error);
      await this.publishSettlementMessage('settlement.error', {
        extTxId: tx.extTxId,
        error: error.message
      });
    }
  }

  /**
   * Reconcile external transaction with expected settlement
   */
  async reconcileTransaction(extTxId: string): Promise<void> {
    const tx = await db.select()
      .from(payment_external_transactions)
      .where(eq(payment_external_transactions.external_transaction_id, extTxId))
      .limit(1);

    if (tx.length === 0) {
      throw new Error(`External transaction ${extTxId} not found`);
    }

    const transaction = tx[0];

    // Find matching expected settlement
    const candidates = await this.findMatchCandidates(transaction);

    if (candidates.length === 0) {
      // Create exception for unmatched credit
      await this.createReconciliationException({
        kind: 'unmatched_credit',
        extTxId,
        openedAt: new Date().toISOString(),
        state: 'open'
      });
      return;
    }

    // Score and match
    const bestMatch = await this.scoreCandidates(transaction, candidates);

    if (bestMatch.score >= 0.95) {
      // Auto-confirm high confidence matches
      await this.confirmMatch(extTxId, bestMatch.expectId, bestMatch.score, 'auto_confirmed');
    } else if (bestMatch.score >= 0.70) {
      // Queue for manual review
      await this.createMatch(extTxId, bestMatch.expectId, bestMatch.score, 'manual_pending');
    } else {
      // Too low confidence - create exception
      await this.createReconciliationException({
        kind: 'unmatched_credit',
        extTxId,
        openedAt: new Date().toISOString(),
        state: 'open'
      });
    }
  }

  /**
   * Find potential matches for external transaction
   */
  private async findMatchCandidates(tx: any): Promise<any[]> {
    // Match window: posted date +/- 5 days
    const windowStart = new Date(tx.posted_at);
    windowStart.setDate(windowStart.getDate() - 5);
    const windowEnd = new Date(tx.posted_at);
    windowEnd.setDate(windowEnd.getDate() + 5);

    return await db.select()
      .from(expected_settlements)
      .where(and(
        eq(expected_settlements.state, 'pending'),
        eq(expected_settlements.amount_cents, tx.amount_cents),
        gte(expected_settlements.effective_date, windowStart.toISOString()),
        lte(expected_settlements.effective_date, windowEnd.toISOString())
      ));
  }

  /**
   * Score match candidates
   */
  private async scoreCandidates(tx: any, candidates: any[]): Promise<{ expectId: number; score: number }> {
    let bestMatch = { expectId: 0, score: 0 };

    for (const candidate of candidates) {
      let score = 0;

      // Amount match (40%)
      if (tx.amount_cents === candidate.amount_cents) {
        score += 0.4;
      }

      // Date proximity (30%)
      const daysDiff = Math.abs(
        (new Date(tx.posted_at).getTime() - new Date(candidate.effective_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff <= 1) {
        score += 0.3;
      } else if (daysDiff <= 3) {
        score += 0.2;
      } else if (daysDiff <= 5) {
        score += 0.1;
      }

      // Reference match (20%)
      if (tx.external_reference && candidate.external_reference_hint) {
        if (tx.external_reference === candidate.external_reference_hint) {
          score += 0.2;
        } else if (tx.external_reference.includes(candidate.external_reference_hint) ||
                   candidate.external_reference_hint.includes(tx.external_reference)) {
          score += 0.1;
        }
      }

      // Rail match (10%)
      if (tx.rail === candidate.rail) {
        score += 0.1;
      }

      if (score > bestMatch.score) {
        bestMatch = { expectId: candidate.expected_settlement_id, score };
      }
    }

    return bestMatch;
  }

  /**
   * Confirm a reconciliation match
   */
  private async confirmMatch(extTxId: string, expectId: number, score: number, status: string): Promise<void> {
    await db.transaction(async (trx) => {
      // Create match record
      await trx.insert(reconciliation_matches)
        .values({
          external_transaction_id: extTxId,
          expected_settlement_id: expectId,
          score,
          matched_at: new Date(),
          matching_strategy: score === 1.0 ? 'deterministic_ref' : 'fuzzy_window',
          status
        });

      // Update expected settlement
      await trx.update(expected_settlements)
        .set({ 
          state: 'settled',
          settled_at: new Date().toISOString()
        })
        .where(eq(expected_settlements.expected_settlement_id, expectId));

      // Update external transaction
      await trx.update(payment_external_transactions)
        .set({ 
          status: 'matched',
          matched_expected_id: expectId
        })
        .where(eq(payment_external_transactions.external_transaction_id, extTxId));

      // Update payment status
      const expected = await trx.select()
        .from(expected_settlements)
        .where(eq(expected_settlements.expected_settlement_id, expectId))
        .limit(1);

      if (expected.length > 0) {
        await trx.update(payments)
          .set({ 
            status: 'completed',
            settled_at: new Date()
          })
          .where(eq(payments.payment_id, expected[0].payment_id));
      }
    });

    // Publish settlement confirmed event
    await this.publishSettlementMessage('settlement.confirmed', {
      extTxId,
      expectId,
      score,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Create reconciliation match for review
   */
  private async createMatch(extTxId: string, expectId: number, score: number, status: string): Promise<void> {
    await db.insert(reconciliation_matches)
      .values({
        external_transaction_id: extTxId,
        expected_settlement_id: expectId,
        score,
        matched_at: new Date(),
        matching_strategy: 'fuzzy_window',
        status
      });

    // Publish for manual review
    await this.publishReconciliationMessage('review.required', {
      extTxId,
      expectId,
      score
    });
  }

  /**
   * Create reconciliation exception
   */
  private async createReconciliationException(exception: ReconciliationException): Promise<void> {
    await db.insert(reconciliation_exceptions)
      .values({
        exception_type: exception.kind,
        external_transaction_id: exception.extTxId,
        expected_settlement_id: exception.expectId,
        opened_at: new Date(exception.openedAt),
        state: exception.state
      });

    // Publish exception event
    await this.publishReconciliationMessage('exception.created', exception);
  }

  /**
   * Generate ACH batch for outbound payments
   */
  async generateAchBatch(direction: 'debit' | 'credit'): Promise<AchBatch> {
    // Get pending ACH payments
    const pending = await db.select()
      .from(payments)
      .where(and(
        eq(payments.payment_method, 'ach'),
        eq(payments.status, 'pending'),
        eq(payments.direction, direction === 'debit' ? 'payment' : 'disbursement')
      ))
      .limit(100); // NACHA limit per batch

    const batch: AchBatch = {
      entries: [],
      effectiveDate: this.getNextBusinessDay().toISOString(),
      serviceClass: direction,
      companyName: process.env.COMPANY_NAME || 'LoanServe Pro',
      companyId: process.env.COMPANY_TAX_ID || '00-0000000',
      entryDescription: direction === 'debit' ? 'LOAN PMT' : 'DISBURSMT'
    };

    for (const payment of pending) {
      // Get bank account details (would need to join with borrower bank accounts)
      batch.entries.push({
        amount: payment.amount,
        accountNumber: payment.bank_account_number || '', // encrypted
        routingNumber: payment.bank_routing_number || '', // encrypted
        accountType: 'checking',
        name: payment.payer_name || '',
        addenda: payment.payment_id.substring(0, 10),
        traceNumber: this.generateTraceNumber()
      });

      // Create expected settlement
      await this.createExpectedSettlement(payment);
    }

    // Save batch for submission
    const batchId = await this.saveAchBatch(batch);
    batch.batchId = batchId;

    // Publish to bank adapter
    await this.publishSettlementMessage('ach.batch.ready', batch);

    return batch;
  }

  /**
   * Handle ACH return
   */
  async handleAchReturn(returnData: any): Promise<void> {
    const { originalTraceNumber, returnCode, returnReason } = returnData;

    // Find original payment
    const payment = await this.findPaymentByTrace(originalTraceNumber);
    if (!payment) {
      console.error(`[Settlement] Payment not found for ACH return ${originalTraceNumber}`);
      return;
    }

    // Update payment status
    await db.update(payments)
      .set({
        status: 'returned',
        return_code: returnCode,
        return_reason: returnReason,
        returned_at: new Date()
      })
      .where(eq(payments.payment_id, payment.payment_id));

    // Check if retryable
    const retryableCodes = ['R01', 'R09']; // NSF, uncollected funds
    if (retryableCodes.includes(returnCode)) {
      // Schedule retry
      await this.schedulePaymentRetry(payment.payment_id, returnCode);
    } else {
      // Create exception for non-retryable return
      await this.createReconciliationException({
        kind: 'ach_return',
        paymentId: payment.payment_id,
        returnCode,
        openedAt: new Date().toISOString(),
        state: 'open'
      });
    }

    // Publish return event
    await this.publishSettlementMessage('ach.return.processed', {
      paymentId: payment.payment_id,
      returnCode,
      returnReason
    });
  }

  /**
   * Helper methods
   */
  private determineRail(method: string): Rail {
    const railMap: Record<string, Rail> = {
      'ach': 'ach',
      'wire': 'wire',
      'check': 'check',
      'card': 'card',
      'rtp': 'rtp'
    };
    return railMap[method.toLowerCase()] || 'ach';
  }

  private calculateEffectiveDate(method: string): string {
    const now = new Date();
    const daysToAdd = method === 'wire' ? 0 : method === 'ach' ? 2 : 3;
    const effectiveDate = this.addBusinessDays(now, daysToAdd);
    return effectiveDate.toISOString();
  }

  private addBusinessDays(date: Date, days: number): Date {
    const result = new Date(date);
    let daysAdded = 0;
    
    while (daysAdded < days) {
      result.setDate(result.getDate() + 1);
      if (result.getDay() !== 0 && result.getDay() !== 6) {
        daysAdded++;
      }
    }
    
    return result;
  }

  private getNextBusinessDay(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
      tomorrow.setDate(tomorrow.getDate() + 1);
    }
    
    return tomorrow;
  }

  private generateTraceNumber(): string {
    return Date.now().toString(36).toUpperCase();
  }

  private async saveAchBatch(batch: AchBatch): Promise<string> {
    // Implementation would save to database
    return `BATCH-${Date.now()}`;
  }

  private async findPaymentByTrace(traceNumber: string): Promise<any> {
    // Implementation would search payments by trace number
    return null;
  }

  private async schedulePaymentRetry(paymentId: string, returnCode: string): Promise<void> {
    // Implementation would schedule retry based on return code
    console.log(`[Settlement] Scheduling retry for payment ${paymentId} (${returnCode})`);
  }

  private async parseBankFile(content: string, format: string): Promise<BankTx[]> {
    // Implementation would parse based on format (BAI2, MT940, etc.)
    console.log(`[Settlement] Parsing ${format} file`);
    return [];
  }

  /**
   * Messaging helpers
   */
  private async publishSettlementMessage(routingKey: string, data: any): Promise<void> {
    const envelope = this.messageFactory.createMessage('settlement', data, { routingKey });
    await enhancedRabbitMQ.publish(envelope, {
      exchange: 'settlement.topic',
      routingKey
    });
  }

  private async publishReconciliationMessage(routingKey: string, data: any): Promise<void> {
    const envelope = this.messageFactory.createMessage('reconciliation', data, { routingKey });
    await enhancedRabbitMQ.publish(envelope, {
      exchange: 'reconciliation.topic',
      routingKey
    });
  }
}

export const settlementService = new SettlementService();