/**
 * Late Fee Assessment Service
 * Manages late fee calculation and assessment based on policy rules
 */

import { Pool, PoolClient } from 'pg';
import { CollectionsRepo } from './repo';
import { LateFeeAssessment, Minor } from './types';
import { postEvent } from '../domain/posting';
import { PgLedgerRepository } from '../db/ledger-repository';
import { MessagePublisher } from '../services/message-publisher';
import { randomUUID } from 'crypto';

export class LateFeeService {
  private repo: CollectionsRepo;
  private ledgerRepo: PgLedgerRepository;
  private publisher: MessagePublisher;

  constructor(private pool: Pool) {
    this.repo = new CollectionsRepo(pool);
    this.ledgerRepo = new PgLedgerRepository(pool);
    this.publisher = new MessagePublisher(pool);
  }

  /**
   * Assess late fee for an installment if eligible
   */
  async assessLateFee(
    loanId: number,
    dueDate: string,
    asOfDate: string
  ): Promise<LateFeeAssessment | null> {
    return await this.repo.withTx(async (client) => {
      // Check if late fee already assessed for this period
      const alreadyAssessed = await this.repo.hasLateFeeForPeriod(loanId, dueDate);
      if (alreadyAssessed) {
        console.log(`[LateFee] Fee already assessed for loan ${loanId} period ${dueDate}`);
        return null;
      }

      // Get the fee template for the loan
      const templateResult = await client.query(`
        SELECT 
          ft.id as template_id,
          ft.fee_type,
          ft.fee_amount,
          ft.fee_percentage,
          ft.late_fee_grace_days,
          ft.late_fee_base,
          ft.late_fee_cap_minor,
          ft.lender_id
        FROM fee_templates ft
        JOIN loans l ON l.lender_id = ft.lender_id
        WHERE l.id = $1 
          AND ft.is_active = true
          AND ft.fee_type = 'late_fee'
        ORDER BY ft.created_at DESC
        LIMIT 1
      `, [loanId]);

      if (templateResult.rows.length === 0) {
        console.log(`[LateFee] No late fee template found for loan ${loanId}`);
        return null;
      }

      const template = templateResult.rows[0];
      const graceDays = template.late_fee_grace_days || 0;

      // Check if we're past the grace period
      const assessmentDate = new Date(dueDate);
      assessmentDate.setDate(assessmentDate.getDate() + graceDays);
      
      if (new Date(asOfDate) < assessmentDate) {
        console.log(`[LateFee] Still in grace period for loan ${loanId} period ${dueDate}`);
        return null;
      }

      // Get the scheduled amounts for the period
      const scheduleResult = await client.query(`
        SELECT 
          principal_amount,
          interest_amount,
          escrow_amount,
          total_amount
        FROM payment_schedules
        WHERE loan_id = $1 AND due_date = $2
      `, [loanId, dueDate]);

      if (scheduleResult.rows.length === 0) {
        console.log(`[LateFee] No schedule found for loan ${loanId} period ${dueDate}`);
        return null;
      }

      const schedule = scheduleResult.rows[0];

      // Calculate the base amount for fee assessment
      let baseAmount = 0n;
      const base = template.late_fee_base || 'scheduled_pi';
      
      switch (base) {
        case 'scheduled_pi':
          baseAmount = this.toBigInt(schedule.principal_amount) + 
                      this.toBigInt(schedule.interest_amount);
          break;
        case 'total_due':
          baseAmount = this.toBigInt(schedule.total_amount);
          break;
        case 'principal_only':
          baseAmount = this.toBigInt(schedule.principal_amount);
          break;
      }

      // Check if the installment has been fully paid
      const paymentResult = await client.query(`
        SELECT 
          SUM(principal_applied_minor) as principal_paid,
          SUM(interest_applied_minor) as interest_paid,
          SUM(escrow_applied_minor) as escrow_paid
        FROM payments
        WHERE loan_id = $1 
          AND allocated_to_date = $2
          AND status = 'posted'
      `, [loanId, dueDate]);

      const payment = paymentResult.rows[0];
      let totalPaid = 0n;

      switch (base) {
        case 'scheduled_pi':
          totalPaid = BigInt(payment.principal_paid || 0) + 
                     BigInt(payment.interest_paid || 0);
          break;
        case 'total_due':
          totalPaid = BigInt(payment.principal_paid || 0) + 
                     BigInt(payment.interest_paid || 0) +
                     BigInt(payment.escrow_paid || 0);
          break;
        case 'principal_only':
          totalPaid = BigInt(payment.principal_paid || 0);
          break;
      }

      if (totalPaid >= baseAmount) {
        console.log(`[LateFee] Installment fully paid for loan ${loanId} period ${dueDate}`);
        return null;
      }

      // Calculate late fee amount
      let feeAmount = 0n;

      if (template.fee_percentage && template.fee_percentage > 0) {
        // Percentage-based fee (in basis points)
        feeAmount = (baseAmount * BigInt(template.fee_percentage)) / 10000n;
      } else if (template.fee_amount && template.fee_amount > 0) {
        // Fixed amount fee
        feeAmount = this.toBigInt(template.fee_amount);
      }

      // Apply cap if configured
      if (template.late_fee_cap_minor && template.late_fee_cap_minor > 0) {
        const cap = BigInt(template.late_fee_cap_minor);
        if (feeAmount > cap) {
          feeAmount = cap;
        }
      }

      if (feeAmount === 0n) {
        console.log(`[LateFee] Calculated fee is zero for loan ${loanId} period ${dueDate}`);
        return null;
      }

      // Post the late fee to the ledger
      const correlationId = `latefee:${loanId}:${dueDate}`;
      const { eventId } = await postEvent(this.ledgerRepo, {
        loanId,
        effectiveDate: asOfDate,
        correlationId,
        schema: 'posting.late_fee.v1',
        currency: 'USD',
        lines: [
          {
            account: 'fees_receivable' as const,
            debitMinor: feeAmount,
            memo: `Late fee for payment due ${dueDate}`
          },
          {
            account: 'late_fee_income' as const,
            creditMinor: feeAmount,
            memo: `Late fee income for payment due ${dueDate}`
          }
        ]
      });

      // Record the assessment
      const assessment: LateFeeAssessment = {
        fee_id: randomUUID(),
        loan_id: loanId,
        period_due_date: dueDate,
        amount_minor: feeAmount,
        template_id: template.template_id,
        event_id: eventId
      };

      await this.repo.recordLateFee(client, assessment);

      // Also create a fee assessment record for tracking
      await client.query(`
        INSERT INTO fee_assessments (
          loan_id, due_date, fee_type, amount, status, created_at
        ) VALUES ($1, $2, 'late_fee', $3, 'assessed', NOW())
      `, [loanId, dueDate, (Number(feeAmount) / 100).toFixed(2)]);

      // Publish event
      await this.publisher.publish({
        exchange: 'collections.events',
        routingKey: 'latefee.assessed.v1',
        message: {
          fee_id: assessment.fee_id,
          loan_id: loanId,
          period_due_date: dueDate,
          amount_minor: feeAmount.toString(),
          template_id: template.template_id
        },
        correlationId
      });

      console.log(`[LateFee] Assessed fee of ${feeAmount} for loan ${loanId} period ${dueDate}`);
      return assessment;
    });
  }

  /**
   * Process late fees for all eligible installments
   */
  async processDailyLateFees(asOfDate: string): Promise<number> {
    console.log(`[LateFee] Processing late fees for ${asOfDate}`);

    // Find all installments that are eligible for late fee assessment
    const eligibleResult = await this.pool.query(`
      SELECT DISTINCT
        ps.loan_id,
        ps.due_date,
        ft.late_fee_grace_days
      FROM payment_schedules ps
      JOIN loans l ON l.id = ps.loan_id
      JOIN fee_templates ft ON ft.lender_id = l.lender_id
      LEFT JOIN late_fee_assessment lfa ON 
        lfa.loan_id = ps.loan_id AND 
        lfa.period_due_date = ps.due_date
      WHERE l.status IN ('active', 'delinquent')
        AND ft.fee_type = 'late_fee'
        AND ft.is_active = true
        AND ps.due_date + INTERVAL '1 day' * COALESCE(ft.late_fee_grace_days, 0) <= $1
        AND lfa.fee_id IS NULL
      ORDER BY ps.loan_id, ps.due_date
    `, [asOfDate]);

    let assessedCount = 0;
    for (const row of eligibleResult.rows) {
      try {
        const result = await this.assessLateFee(
          row.loan_id,
          row.due_date.toISOString().split('T')[0],
          asOfDate
        );
        if (result) {
          assessedCount++;
        }
      } catch (error) {
        console.error(`[LateFee] Error assessing fee for loan ${row.loan_id}:`, error);
      }
    }

    console.log(`[LateFee] Assessed ${assessedCount} late fees`);
    return assessedCount;
  }

  private toBigInt(value: any): bigint {
    if (value === null || value === undefined) return 0n;
    if (typeof value === 'bigint') return value;
    if (typeof value === 'string') return BigInt(Math.round(parseFloat(value) * 100));
    if (typeof value === 'number') return BigInt(Math.round(value * 100));
    return 0n;
  }
}