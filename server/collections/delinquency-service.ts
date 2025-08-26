/**
 * Delinquency Computation Service
 * Calculates days past due and delinquency buckets based on payment history
 */

import { Pool, PoolClient } from 'pg';
import { CollectionsRepo } from './repo';
import { DelinquencyStatus, DelinquencyBucket, Minor } from './types';
import { PgLedgerRepository } from '../db/ledger-repository';
import { MessagePublisher } from '../services/message-publisher';

export class DelinquencyService {
  private repo: CollectionsRepo;
  private ledgerRepo: PgLedgerRepository;
  private publisher: MessagePublisher;

  constructor(private pool: Pool) {
    this.repo = new CollectionsRepo(pool);
    this.ledgerRepo = new PgLedgerRepository(pool);
    this.publisher = new MessagePublisher(pool);
  }

  /**
   * Compute delinquency status for a loan as of a specific date
   */
  async computeDelinquency(
    loanId: number,
    asOfDate: string
  ): Promise<DelinquencyStatus> {
    return await this.repo.withTx(async (client) => {
      // Get the loan's payment schedule
      const scheduleResult = await client.query(`
        SELECT 
          ps.due_date,
          ps.principal_amount,
          ps.interest_amount,
          ps.escrow_amount,
          ps.total_amount,
          ps.payment_number
        FROM payment_schedules ps
        WHERE ps.loan_id = $1 
          AND ps.due_date <= $2
        ORDER BY ps.due_date ASC
      `, [loanId, asOfDate]);

      if (scheduleResult.rows.length === 0) {
        // No payments due yet
        return {
          loan_id: loanId,
          as_of_date: asOfDate,
          earliest_unpaid_due_date: undefined,
          unpaid_due_minor: 0n,
          dpd: 0,
          bucket: 'current'
        };
      }

      // Get all payments applied to this loan up to asOfDate
      const paymentsResult = await client.query(`
        SELECT 
          p.payment_id,
          p.effective_date,
          p.amount_minor,
          p.principal_applied_minor,
          p.interest_applied_minor,
          p.escrow_applied_minor,
          p.fees_applied_minor,
          p.allocated_to_date
        FROM payments p
        WHERE p.loan_id = $1 
          AND p.status = 'posted'
          AND p.effective_date <= $2
        ORDER BY p.effective_date ASC, p.payment_id ASC
      `, [loanId, asOfDate]);

      // Calculate cumulative scheduled amounts
      let totalScheduledPrincipal = 0n;
      let totalScheduledInterest = 0n;
      let totalScheduledEscrow = 0n;
      let totalScheduledFees = 0n;
      let earliestUnpaidDate: string | undefined;

      const scheduledByDueDate = new Map<string, {
        principal: bigint;
        interest: bigint;
        escrow: bigint;
        fees: bigint;
        total: bigint;
      }>();

      for (const row of scheduleResult.rows) {
        const principal = this.toBigInt(row.principal_amount);
        const interest = this.toBigInt(row.interest_amount);
        const escrow = this.toBigInt(row.escrow_amount || 0);
        const fees = 0n; // Will be added from fee assessments

        scheduledByDueDate.set(row.due_date.toISOString().split('T')[0], {
          principal,
          interest,
          escrow,
          fees,
          total: principal + interest + escrow + fees
        });

        totalScheduledPrincipal += principal;
        totalScheduledInterest += interest;
        totalScheduledEscrow += escrow;
        totalScheduledFees += fees;
      }

      // Add any assessed fees to the scheduled amounts
      const feeResult = await client.query(`
        SELECT 
          fa.due_date,
          SUM(fa.amount) as fee_amount
        FROM fee_assessments fa
        WHERE fa.loan_id = $1 
          AND fa.due_date <= $2
          AND fa.status = 'assessed'
        GROUP BY fa.due_date
      `, [loanId, asOfDate]);

      for (const row of feeResult.rows) {
        const dueDate = row.due_date.toISOString().split('T')[0];
        const feeAmount = this.toBigInt(row.fee_amount);
        
        if (scheduledByDueDate.has(dueDate)) {
          const scheduled = scheduledByDueDate.get(dueDate)!;
          scheduled.fees += feeAmount;
          scheduled.total += feeAmount;
        }
        totalScheduledFees += feeAmount;
      }

      // Calculate cumulative applied amounts
      let totalAppliedPrincipal = 0n;
      let totalAppliedInterest = 0n;
      let totalAppliedEscrow = 0n;
      let totalAppliedFees = 0n;

      for (const row of paymentsResult.rows) {
        totalAppliedPrincipal += BigInt(row.principal_applied_minor || 0);
        totalAppliedInterest += BigInt(row.interest_applied_minor || 0);
        totalAppliedEscrow += BigInt(row.escrow_applied_minor || 0);
        totalAppliedFees += BigInt(row.fees_applied_minor || 0);
      }

      // Calculate unpaid amounts
      const unpaidPrincipal = totalScheduledPrincipal > totalAppliedPrincipal 
        ? totalScheduledPrincipal - totalAppliedPrincipal : 0n;
      const unpaidInterest = totalScheduledInterest > totalAppliedInterest
        ? totalScheduledInterest - totalAppliedInterest : 0n;
      const unpaidEscrow = totalScheduledEscrow > totalAppliedEscrow
        ? totalScheduledEscrow - totalAppliedEscrow : 0n;
      const unpaidFees = totalScheduledFees > totalAppliedFees
        ? totalScheduledFees - totalAppliedFees : 0n;

      const totalUnpaid = unpaidPrincipal + unpaidInterest + unpaidEscrow + unpaidFees;

      // Find the earliest unpaid due date
      let cumulativeScheduled = 0n;
      let cumulativeApplied = totalAppliedPrincipal + totalAppliedInterest + 
                             totalAppliedEscrow + totalAppliedFees;

      for (const [dueDate, scheduled] of Array.from(scheduledByDueDate.entries()).sort()) {
        cumulativeScheduled += scheduled.total;
        
        if (cumulativeScheduled > cumulativeApplied) {
          earliestUnpaidDate = dueDate;
          break;
        }
      }

      // Calculate days past due
      let dpd = 0;
      let bucket: DelinquencyBucket = 'current';

      if (earliestUnpaidDate) {
        const asOf = new Date(asOfDate);
        const unpaidDate = new Date(earliestUnpaidDate);
        const diffTime = asOf.getTime() - unpaidDate.getTime();
        dpd = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

        // Determine bucket
        if (dpd === 0) {
          bucket = 'current';
        } else if (dpd <= 29) {
          bucket = 'dpd_1_29';
        } else if (dpd <= 59) {
          bucket = 'dpd_30_59';
        } else if (dpd <= 89) {
          bucket = 'dpd_60_89';
        } else {
          bucket = 'dpd_90_plus';
        }
      }

      const status: DelinquencyStatus = {
        loan_id: loanId,
        as_of_date: asOfDate,
        earliest_unpaid_due_date: earliestUnpaidDate,
        unpaid_due_minor: totalUnpaid,
        dpd,
        bucket
      };

      // Check if bucket changed from previous snapshot
      const previousResult = await client.query(`
        SELECT bucket FROM delinquency_snapshot
        WHERE loan_id = $1 AND as_of_date < $2
        ORDER BY as_of_date DESC
        LIMIT 1
      `, [loanId, asOfDate]);

      const previousBucket = previousResult.rows[0]?.bucket;

      // Save the delinquency status
      await this.repo.upsertDelinquency(client, status);

      // Publish event if bucket changed
      if (previousBucket && previousBucket !== bucket) {
        await this.publisher.publish({
          exchange: 'collections.events',
          routingKey: 'delinquency.status.changed.v1',
          message: {
            loan_id: loanId,
            as_of_date: asOfDate,
            previous_bucket: previousBucket,
            new_bucket: bucket,
            dpd,
            unpaid_amount_minor: totalUnpaid.toString()
          },
          correlationId: `delinquency:${loanId}:${asOfDate}`
        });
      }

      // Check if we need to open a foreclosure case
      if (bucket === 'dpd_90_plus' && (!previousBucket || previousBucket !== 'dpd_90_plus')) {
        await this.checkForeclosureTrigger(client, loanId);
      }

      return status;
    });
  }

  /**
   * Process daily delinquency for all active loans
   */
  async processDailyDelinquency(asOfDate: string): Promise<number> {
    console.log(`[Delinquency] Processing daily delinquency for ${asOfDate}`);

    // Get all active loans
    const loansResult = await this.pool.query(`
      SELECT id FROM loans 
      WHERE status IN ('active', 'delinquent')
    `);

    let processedCount = 0;
    for (const loan of loansResult.rows) {
      try {
        await this.computeDelinquency(loan.id, asOfDate);
        processedCount++;
      } catch (error) {
        console.error(`[Delinquency] Error processing loan ${loan.id}:`, error);
      }
    }

    console.log(`[Delinquency] Processed ${processedCount} loans`);
    return processedCount;
  }

  private async checkForeclosureTrigger(client: PoolClient, loanId: number): Promise<void> {
    // Check if foreclosure case already exists
    const existingCase = await client.query(`
      SELECT fc_id FROM foreclosure_case
      WHERE loan_id = $1 AND status = 'open'
      LIMIT 1
    `, [loanId]);

    if (existingCase.rows.length === 0) {
      // Create foreclosure case
      const fcId = await this.repo.createForeclosureCase(client, loanId);
      
      if (fcId) {
        await this.publisher.publish({
          exchange: 'foreclosure.events',
          routingKey: 'foreclosure.case.opened.v1',
          message: {
            fc_id: fcId,
            loan_id: loanId,
            reason: '90_days_past_due'
          },
          correlationId: `foreclosure:${loanId}:${Date.now()}`
        });
      }
    }
  }

  private toBigInt(value: any): bigint {
    if (value === null || value === undefined) return 0n;
    if (typeof value === 'bigint') return value;
    if (typeof value === 'string') return BigInt(Math.round(parseFloat(value) * 100));
    if (typeof value === 'number') return BigInt(Math.round(value * 100));
    return 0n;
  }
}