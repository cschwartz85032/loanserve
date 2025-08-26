/**
 * Collections Repository
 * Handles database operations for delinquency, late fees, plans, and foreclosure
 */

import { Pool, PoolClient } from 'pg';
import { 
  DelinquencyStatus, 
  DelinquencySnapshot,
  LateFeeAssessment,
  CollectionCase,
  PlanHeader,
  PlanInstallment,
  PlanProgress,
  ForeclosureCase,
  ForeclosureEvent,
  UUID,
  Minor 
} from './types';

export class CollectionsRepo {
  constructor(private pool: Pool) {}

  async withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Delinquency operations
  async upsertDelinquency(
    client: PoolClient, 
    status: DelinquencyStatus, 
    schedulePlanId?: string
  ): Promise<void> {
    // Insert snapshot
    await client.query(`
      INSERT INTO delinquency_snapshot (
        loan_id, as_of_date, earliest_unpaid_due_date,
        unpaid_due_minor, dpd, bucket, schedule_plan_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (loan_id, as_of_date) 
      DO UPDATE SET
        earliest_unpaid_due_date = EXCLUDED.earliest_unpaid_due_date,
        unpaid_due_minor = EXCLUDED.unpaid_due_minor,
        dpd = EXCLUDED.dpd,
        bucket = EXCLUDED.bucket,
        schedule_plan_id = EXCLUDED.schedule_plan_id
    `, [
      status.loan_id,
      status.as_of_date,
      status.earliest_unpaid_due_date || null,
      status.unpaid_due_minor.toString(),
      status.dpd,
      status.bucket,
      schedulePlanId || null
    ]);

    // Update current status
    await client.query(`
      INSERT INTO delinquency_current (
        loan_id, as_of_date, earliest_unpaid_due_date,
        unpaid_due_minor, dpd, bucket
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (loan_id)
      DO UPDATE SET
        as_of_date = EXCLUDED.as_of_date,
        earliest_unpaid_due_date = EXCLUDED.earliest_unpaid_due_date,
        unpaid_due_minor = EXCLUDED.unpaid_due_minor,
        dpd = EXCLUDED.dpd,
        bucket = EXCLUDED.bucket,
        updated_at = NOW()
    `, [
      status.loan_id,
      status.as_of_date,
      status.earliest_unpaid_due_date || null,
      status.unpaid_due_minor.toString(),
      status.dpd,
      status.bucket
    ]);
  }

  async getDelinquencyHistory(
    loanId: number,
    startDate: string,
    endDate: string
  ): Promise<DelinquencySnapshot[]> {
    const result = await this.pool.query(`
      SELECT 
        snap_id, loan_id, as_of_date, earliest_unpaid_due_date,
        unpaid_due_minor, dpd, bucket, schedule_plan_id, created_at
      FROM delinquency_snapshot
      WHERE loan_id = $1 
        AND as_of_date BETWEEN $2 AND $3
      ORDER BY as_of_date DESC
    `, [loanId, startDate, endDate]);

    return result.rows.map(row => ({
      snap_id: row.snap_id,
      loan_id: row.loan_id,
      as_of_date: row.as_of_date.toISOString().split('T')[0],
      earliest_unpaid_due_date: row.earliest_unpaid_due_date?.toISOString().split('T')[0],
      unpaid_due_minor: BigInt(row.unpaid_due_minor),
      dpd: row.dpd,
      bucket: row.bucket,
      schedule_plan_id: row.schedule_plan_id,
      created_at: row.created_at
    }));
  }

  async getCurrentDelinquency(loanId: number): Promise<DelinquencyStatus | null> {
    const result = await this.pool.query(`
      SELECT 
        loan_id, as_of_date, earliest_unpaid_due_date,
        unpaid_due_minor, dpd, bucket
      FROM delinquency_current
      WHERE loan_id = $1
    `, [loanId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      loan_id: row.loan_id,
      as_of_date: row.as_of_date.toISOString().split('T')[0],
      earliest_unpaid_due_date: row.earliest_unpaid_due_date?.toISOString().split('T')[0],
      unpaid_due_minor: BigInt(row.unpaid_due_minor),
      dpd: row.dpd,
      bucket: row.bucket
    };
  }

  // Late fee operations
  async recordLateFee(
    client: PoolClient,
    assessment: LateFeeAssessment
  ): Promise<void> {
    await client.query(`
      INSERT INTO late_fee_assessment (
        fee_id, loan_id, period_due_date,
        amount_minor, template_id, event_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (loan_id, period_due_date) DO NOTHING
    `, [
      assessment.fee_id,
      assessment.loan_id,
      assessment.period_due_date,
      assessment.amount_minor.toString(),
      assessment.template_id,
      assessment.event_id
    ]);
  }

  async hasLateFeeForPeriod(
    loanId: number,
    periodDueDate: string
  ): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT 1 FROM late_fee_assessment
      WHERE loan_id = $1 AND period_due_date = $2
      LIMIT 1
    `, [loanId, periodDueDate]);
    
    return result.rows.length > 0;
  }

  // Collection case operations
  async upsertCollectionCase(
    client: PoolClient,
    caseData: Partial<CollectionCase>
  ): Promise<CollectionCase> {
    const result = await client.query(`
      INSERT INTO collection_case (loan_id, status)
      VALUES ($1, $2)
      ON CONFLICT (loan_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        closed_at = CASE 
          WHEN EXCLUDED.status = 'closed' THEN NOW()
          ELSE collection_case.closed_at
        END
      RETURNING *
    `, [caseData.loan_id, caseData.status || 'normal']);

    return result.rows[0];
  }

  // Payment plan operations
  async createPlan(
    client: PoolClient,
    header: Omit<PlanHeader, 'plan_id' | 'created_at' | 'updated_at'>
  ): Promise<string> {
    const result = await client.query(`
      INSERT INTO plan_header (
        loan_id, type, status, starts_on, ends_on, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING plan_id
    `, [
      header.loan_id,
      header.type,
      header.status,
      header.starts_on,
      header.ends_on || null,
      header.created_by
    ]);

    return result.rows[0].plan_id;
  }

  async addPlanSchedule(
    client: PoolClient,
    planId: string,
    installments: Array<Omit<PlanInstallment, 'plan_id'>>
  ): Promise<void> {
    for (const inst of installments) {
      await client.query(`
        INSERT INTO plan_schedule (
          plan_id, installment_no, due_date, amount_minor
        ) VALUES ($1, $2, $3, $4)
      `, [
        planId,
        inst.installment_no,
        inst.due_date,
        inst.amount_minor.toString()
      ]);

      // Initialize progress tracking
      await client.query(`
        INSERT INTO plan_progress (
          plan_id, installment_no, due_date, paid_minor, status
        ) VALUES ($1, $2, $3, 0, 'pending')
      `, [
        planId,
        inst.installment_no,
        inst.due_date
      ]);
    }
  }

  async updatePlanProgress(
    client: PoolClient,
    planId: string,
    installmentNo: number,
    paidAmount: Minor,
    eventId?: string
  ): Promise<void> {
    const result = await client.query(`
      SELECT amount_minor FROM plan_schedule
      WHERE plan_id = $1 AND installment_no = $2
    `, [planId, installmentNo]);

    if (result.rows.length === 0) return;

    const scheduledAmount = BigInt(result.rows[0].amount_minor);
    const status = paidAmount >= scheduledAmount ? 'paid' :
                   paidAmount > 0n ? 'partial' : 'pending';

    await client.query(`
      UPDATE plan_progress
      SET paid_minor = $1,
          status = $2,
          last_payment_event = COALESCE($3, last_payment_event)
      WHERE plan_id = $4 AND installment_no = $5
    `, [
      paidAmount.toString(),
      status,
      eventId || null,
      planId,
      installmentNo
    ]);
  }

  async updatePlanStatus(
    client: PoolClient,
    planId: string,
    status: PlanStatus
  ): Promise<void> {
    await client.query(`
      UPDATE plan_header
      SET status = $1, updated_at = NOW()
      WHERE plan_id = $2
    `, [status, planId]);
  }

  async getActivePlan(loanId: number): Promise<PlanHeader | null> {
    const result = await this.pool.query(`
      SELECT * FROM plan_header
      WHERE loan_id = $1 AND status = 'active'
      LIMIT 1
    `, [loanId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      plan_id: row.plan_id,
      loan_id: row.loan_id,
      type: row.type,
      status: row.status,
      starts_on: row.starts_on.toISOString().split('T')[0],
      ends_on: row.ends_on?.toISOString().split('T')[0],
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  // Foreclosure operations
  async createForeclosureCase(
    client: PoolClient,
    loanId: number
  ): Promise<string> {
    const result = await client.query(`
      INSERT INTO foreclosure_case (loan_id, status)
      VALUES ($1, 'open')
      ON CONFLICT (loan_id) DO NOTHING
      RETURNING fc_id
    `, [loanId]);

    return result.rows.length > 0 ? result.rows[0].fc_id : null;
  }

  async recordForeclosureMilestone(
    client: PoolClient,
    event: ForeclosureEvent
  ): Promise<void> {
    await client.query(`
      INSERT INTO foreclosure_event (
        fc_id, milestone, occurred_at, meta
      ) VALUES ($1, $2, NOW(), $3)
      ON CONFLICT (fc_id, milestone) DO NOTHING
    `, [
      event.fc_id,
      event.milestone,
      JSON.stringify(event.meta || {})
    ]);

    // Update attorney if milestone is referral
    if (event.milestone === 'referral_to_attorney' && event.meta?.attorney_id) {
      await client.query(`
        UPDATE foreclosure_case
        SET attorney_id = $1
        WHERE fc_id = $2
      `, [event.meta.attorney_id, event.fc_id]);
    }
  }
}