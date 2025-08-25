/**
 * Daily Reconciler Service
 * Ensures SOR (System of Record) equals bank truth and heals gaps
 */

import { db } from '../db';
import { 
  payments, 
  reconciliations,
  exceptionCases,
  outboxMessages
} from '@shared/schema';
import { eq, and, between, sql, sum } from 'drizzle-orm';
import { ColumnBankService } from './column-bank-service';
import { ExceptionCaseService } from './exception-case';
import crypto from 'crypto';
import Decimal from 'decimal.js';

interface ReconciliationResult {
  channel: string;
  periodStart: Date;
  periodEnd: Date;
  bankTotal: number;
  sorTotal: number;
  variance: number;
  status: 'balanced' | 'variance';
  missingIdentifiers?: string[];
  excessIdentifiers?: string[];
}

interface SettlementSummary {
  date: string;
  credits: number;
  debits: number;
  netTotal: number;
  transactionCount: number;
  transactions?: Array<{
    id: string;
    amount: number;
    type: 'credit' | 'debit';
    reference?: string;
  }>;
}

export class DailyReconcilerService {
  private columnBankService: ColumnBankService;
  private exceptionCaseService: ExceptionCaseService;

  constructor() {
    this.columnBankService = new ColumnBankService();
    this.exceptionCaseService = new ExceptionCaseService();
  }

  /**
   * Run daily reconciliation for a specific date
   */
  async reconcileDay(date: Date = new Date()): Promise<ReconciliationResult[]> {
    console.log(`[DailyReconciler] Starting daily reconciliation for ${date.toISOString().split('T')[0]}`);
    
    // Set time boundaries for the day
    const periodStart = new Date(date);
    periodStart.setHours(0, 0, 0, 0);
    
    const periodEnd = new Date(date);
    periodEnd.setHours(23, 59, 59, 999);

    const results: ReconciliationResult[] = [];

    // Reconcile each channel
    const channels = ['ach', 'wire', 'column'];
    
    for (const channel of channels) {
      try {
        const result = await this.reconcileChannel(channel, periodStart, periodEnd);
        results.push(result);
      } catch (error) {
        console.error(`[DailyReconciler] Error reconciling ${channel}:`, error);
        // Create critical exception for reconciliation failure
        await this.createReconciliationFailureException(channel, periodStart, error);
      }
    }

    return results;
  }

  /**
   * Reconcile a specific payment channel
   */
  private async reconcileChannel(
    channel: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<ReconciliationResult> {
    console.log(`[DailyReconciler] Reconciling ${channel} for period ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

    // Get bank settlement summary
    const bankSummary = await this.getBankSettlementSummary(channel, periodStart);
    
    // Get SOR (System of Record) totals
    const sorSummary = await this.getSORSummary(channel, periodStart, periodEnd);
    
    // Calculate variance
    const variance = new Decimal(bankSummary.netTotal).minus(sorSummary.total).toNumber();
    
    // Find missing/excess identifiers
    const { missing, excess } = await this.findDiscrepancies(
      bankSummary.transactions || [],
      sorSummary.paymentIds
    );

    const result: ReconciliationResult = {
      channel,
      periodStart,
      periodEnd,
      bankTotal: bankSummary.netTotal,
      sorTotal: sorSummary.total,
      variance,
      status: Math.abs(variance) < 0.01 ? 'balanced' : 'variance',
      missingIdentifiers: missing,
      excessIdentifiers: excess
    };

    // Store reconciliation record
    await this.storeReconciliation(result);

    // Handle variance
    if (result.status === 'variance') {
      await this.handleVariance(result);
    } else {
      await this.handleBalanced(result);
    }

    return result;
  }

  /**
   * Get bank settlement summary from Column Bank
   */
  private async getBankSettlementSummary(
    channel: string,
    date: Date
  ): Promise<SettlementSummary> {
    if (channel === 'column' || channel === 'ach') {
      try {
        // Query Column Bank for settlement summary
        const dateStr = date.toISOString().split('T')[0];
        const summary = await this.columnBankService.getSettlementSummary(dateStr);
        
        return {
          date: dateStr,
          credits: summary.credits || 0,
          debits: summary.debits || 0,
          netTotal: (summary.credits || 0) - (summary.debits || 0),
          transactionCount: summary.transactionCount || 0,
          transactions: summary.transactions
        };
      } catch (error) {
        console.error(`[DailyReconciler] Error fetching Column settlement summary:`, error);
        // Return zero summary if Column API fails
        return {
          date: date.toISOString().split('T')[0],
          credits: 0,
          debits: 0,
          netTotal: 0,
          transactionCount: 0
        };
      }
    }
    
    // For wire or other channels, return placeholder
    // In production, this would query the respective bank APIs
    return {
      date: date.toISOString().split('T')[0],
      credits: 0,
      debits: 0,
      netTotal: 0,
      transactionCount: 0
    };
  }

  /**
   * Get SOR (System of Record) summary from database
   */
  private async getSORSummary(
    channel: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{ total: number; paymentIds: string[] }> {
    // Query completed payments in the time window
    const sorPayments = await db
      .select({
        id: payments.id,
        amount: payments.totalReceived,
        status: payments.status,
        effectiveDate: payments.effectiveDate
      })
      .from(payments)
      .where(
        and(
          between(payments.effectiveDate, 
            periodStart.toISOString().split('T')[0],
            periodEnd.toISOString().split('T')[0]
          ),
          eq(payments.status, 'completed'),
          eq(payments.sourceChannel, channel)
        )
      );

    // Calculate total
    const total = sorPayments.reduce((sum, payment) => {
      return sum + parseFloat(payment.amount || '0');
    }, 0);

    return {
      total,
      paymentIds: sorPayments.map(p => p.id)
    };
  }

  /**
   * Find discrepancies between bank and SOR
   */
  private async findDiscrepancies(
    bankTransactions: Array<{ id: string; reference?: string }>,
    sorPaymentIds: string[]
  ): Promise<{ missing: string[]; excess: string[] }> {
    const bankRefs = new Set(bankTransactions.map(t => t.reference || t.id));
    const sorRefs = new Set(sorPaymentIds);

    // Missing in SOR (present in bank but not in SOR)
    const missing = Array.from(bankRefs).filter(ref => !sorRefs.has(ref));
    
    // Excess in SOR (present in SOR but not in bank)
    const excess = Array.from(sorRefs).filter(ref => !bankRefs.has(ref));

    return { missing, excess };
  }

  /**
   * Store reconciliation result in database
   */
  private async storeReconciliation(result: ReconciliationResult): Promise<void> {
    await db
      .insert(reconciliations)
      .values({
        channel: result.channel,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        bankTotal: result.bankTotal.toString(),
        sorTotal: result.sorTotal.toString(),
        variance: result.variance.toString(),
        status: result.status,
        metadata: {
          missingIdentifiers: result.missingIdentifiers,
          excessIdentifiers: result.excessIdentifiers,
          reconciledAt: new Date().toISOString()
        }
      })
      .onConflictDoUpdate({
        target: [reconciliations.channel, reconciliations.periodStart],
        set: {
          bankTotal: result.bankTotal.toString(),
          sorTotal: result.sorTotal.toString(),
          variance: result.variance.toString(),
          status: result.status,
          metadata: {
            missingIdentifiers: result.missingIdentifiers,
            excessIdentifiers: result.excessIdentifiers,
            reconciledAt: new Date().toISOString()
          },
          updatedAt: new Date()
        }
      });
  }

  /**
   * Handle variance case - create exceptions and publish events
   */
  private async handleVariance(result: ReconciliationResult): Promise<void> {
    console.log(`[DailyReconciler] Variance detected for ${result.channel}: $${result.variance}`);

    // Create exception case
    await this.exceptionCaseService.createReconciliationVarianceException(
      result.sorTotal,
      result.bankTotal,
      `${result.channel}_${result.periodStart.toISOString().split('T')[0]}`,
      result.channel
    );

    // Publish discrepancy event
    await db.insert(outboxMessages).values({
      aggregateType: 'reconciliation',
      aggregateId: crypto.randomUUID(),
      eventType: 'payment.reconciled.discrepancy',
      payload: {
        channel: result.channel,
        date: result.periodStart.toISOString().split('T')[0],
        bankTotal: result.bankTotal,
        sorTotal: result.sorTotal,
        variance: result.variance,
        missingIdentifiers: result.missingIdentifiers,
        excessIdentifiers: result.excessIdentifiers
      }
    });

    // Create backfill requests for missing payments
    if (result.missingIdentifiers && result.missingIdentifiers.length > 0) {
      for (const missingId of result.missingIdentifiers) {
        await this.createBackfillRequest(missingId, result.channel, result.periodStart);
      }
    }
  }

  /**
   * Handle balanced case - publish success event
   */
  private async handleBalanced(result: ReconciliationResult): Promise<void> {
    console.log(`[DailyReconciler] Reconciliation balanced for ${result.channel} on ${result.periodStart.toISOString().split('T')[0]}`);

    // Publish success event
    await db.insert(outboxMessages).values({
      aggregateType: 'reconciliation',
      aggregateId: crypto.randomUUID(),
      eventType: 'payment.reconciled.ok',
      payload: {
        channel: result.channel,
        date: result.periodStart.toISOString().split('T')[0],
        total: result.bankTotal,
        transactionCount: result.missingIdentifiers?.length || 0
      }
    });
  }

  /**
   * Create backfill request for missing payment
   */
  private async createBackfillRequest(
    identifier: string,
    channel: string,
    date: Date
  ): Promise<void> {
    console.log(`[DailyReconciler] Creating backfill request for ${identifier}`);

    await db.insert(outboxMessages).values({
      aggregateType: 'backfill',
      aggregateId: identifier,
      eventType: 'backfill.requested',
      payload: {
        identifier,
        channel,
        date: date.toISOString().split('T')[0],
        reason: 'missing_in_sor',
        requestedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Create exception for reconciliation failure
   */
  private async createReconciliationFailureException(
    channel: string,
    date: Date,
    error: any
  ): Promise<void> {
    await db.insert(exceptionCases).values({
      category: 'reconcile_variance',
      subcategory: 'reconciliation_failure',
      severity: 'critical',
      state: 'open',
      aiRecommendation: {
        channel,
        date: date.toISOString().split('T')[0],
        error: error.message || 'Unknown error',
        suggestedActions: [
          'Check bank API connectivity',
          'Verify credentials are valid',
          'Review error logs for details',
          'Manually run reconciliation when fixed'
        ]
      }
    });
  }

  /**
   * Run reconciliation for date range
   */
  async reconcileDateRange(startDate: Date, endDate: Date): Promise<ReconciliationResult[]> {
    const results: ReconciliationResult[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayResults = await this.reconcileDay(new Date(currentDate));
      results.push(...dayResults);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return results;
  }

  /**
   * Get reconciliation status for a date
   */
  async getReconciliationStatus(
    channel: string,
    date: Date
  ): Promise<ReconciliationResult | null> {
    const periodStart = new Date(date);
    periodStart.setHours(0, 0, 0, 0);
    
    const periodEnd = new Date(date);
    periodEnd.setHours(23, 59, 59, 999);

    const [record] = await db
      .select()
      .from(reconciliations)
      .where(
        and(
          eq(reconciliations.channel, channel),
          eq(reconciliations.periodStart, periodStart)
        )
      )
      .limit(1);

    if (!record) return null;

    return {
      channel: record.channel,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd,
      bankTotal: parseFloat(record.bankTotal),
      sorTotal: parseFloat(record.sorTotal),
      variance: parseFloat(record.variance),
      status: record.status as 'balanced' | 'variance',
      missingIdentifiers: record.metadata?.missingIdentifiers as string[] || [],
      excessIdentifiers: record.metadata?.excessIdentifiers as string[] || []
    };
  }
}

// Export singleton instance
export const dailyReconciler = new DailyReconcilerService();