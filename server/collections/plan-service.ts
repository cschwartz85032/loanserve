/**
 * Payment Plan Management Service
 * Handles repayment, deferral, and forbearance plans
 */

import { Pool, PoolClient } from 'pg';
import { CollectionsRepo } from './repo';
import { PlanHeader, PlanInstallment, PlanStatus, PlanType, Minor, UUID } from './types';
import { MessagePublisher } from '../services/message-publisher';
import { randomUUID } from 'crypto';

export class PlanService {
  private repo: CollectionsRepo;
  private publisher: MessagePublisher;

  constructor(private pool: Pool) {
    this.repo = new CollectionsRepo(pool);
    this.publisher = new MessagePublisher(pool);
  }

  /**
   * Create a new payment plan
   */
  async createPlan(
    loanId: number,
    type: PlanType,
    installments: Array<{ due_date: string; amount: number }>,
    createdBy: string,
    startsOn?: string
  ): Promise<string> {
    return await this.repo.withTx(async (client) => {
      // Check for existing active plan
      const existingPlan = await this.repo.getActivePlan(loanId);
      if (existingPlan) {
        throw new Error(`Loan ${loanId} already has an active plan`);
      }

      // Calculate plan dates
      const startDate = startsOn || installments[0]?.due_date;
      const endDate = installments[installments.length - 1]?.due_date;

      // Create plan header
      const planId = await this.repo.createPlan(client, {
        loan_id: loanId,
        type,
        status: 'draft',
        starts_on: startDate,
        ends_on: endDate,
        created_by: createdBy
      });

      // Create plan schedule
      const scheduleItems = installments.map((inst, index) => ({
        installment_no: index + 1,
        due_date: inst.due_date,
        amount_minor: BigInt(Math.round(inst.amount * 100))
      }));

      await this.repo.addPlanSchedule(client, planId, scheduleItems);

      // Publish event
      await this.publisher.publish({
        exchange: 'collections.events',
        routingKey: 'plan.created.v1',
        message: {
          plan_id: planId,
          loan_id: loanId,
          type,
          installment_count: installments.length,
          total_amount: installments.reduce((sum, inst) => sum + inst.amount, 0)
        },
        correlationId: `plan:create:${planId}`
      });

      console.log(`[Plan] Created ${type} plan ${planId} for loan ${loanId}`);
      return planId;
    });
  }

  /**
   * Activate a draft plan
   */
  async activatePlan(planId: string): Promise<void> {
    await this.repo.withTx(async (client) => {
      // Get plan details
      const planResult = await client.query(`
        SELECT loan_id, type, status
        FROM plan_header
        WHERE plan_id = $1
      `, [planId]);

      if (planResult.rows.length === 0) {
        throw new Error(`Plan ${planId} not found`);
      }

      const plan = planResult.rows[0];
      if (plan.status !== 'draft') {
        throw new Error(`Plan ${planId} is not in draft status`);
      }

      // Update status
      await this.repo.updatePlanStatus(client, planId, 'active');

      // Publish event
      await this.publisher.publish({
        exchange: 'collections.events',
        routingKey: 'plan.status.changed.v1',
        message: {
          plan_id: planId,
          loan_id: plan.loan_id,
          previous_status: 'draft',
          new_status: 'active'
        },
        correlationId: `plan:activate:${planId}`
      });

      console.log(`[Plan] Activated plan ${planId}`);
    });
  }

  /**
   * Apply payment to plan installments
   */
  async applyPaymentToPlan(
    planId: string,
    amount: Minor,
    eventId: string
  ): Promise<void> {
    await this.repo.withTx(async (client) => {
      // Get unpaid installments in order
      const installmentsResult = await client.query(`
        SELECT 
          ps.installment_no,
          ps.due_date,
          ps.amount_minor,
          pp.paid_minor,
          pp.status
        FROM plan_schedule ps
        JOIN plan_progress pp ON 
          pp.plan_id = ps.plan_id AND 
          pp.installment_no = ps.installment_no
        WHERE ps.plan_id = $1
          AND pp.status != 'paid'
        ORDER BY ps.installment_no
      `, [planId]);

      let remainingAmount = amount;
      const updatedInstallments: number[] = [];

      for (const inst of installmentsResult.rows) {
        if (remainingAmount === 0n) break;

        const scheduledAmount = BigInt(inst.amount_minor);
        const paidAmount = BigInt(inst.paid_minor || 0);
        const unpaidAmount = scheduledAmount - paidAmount;

        const applyAmount = remainingAmount > unpaidAmount ? unpaidAmount : remainingAmount;
        const newPaidAmount = paidAmount + applyAmount;

        await this.repo.updatePlanProgress(
          client,
          planId,
          inst.installment_no,
          newPaidAmount,
          eventId
        );

        updatedInstallments.push(inst.installment_no);
        remainingAmount -= applyAmount;
      }

      // Check if all installments are now paid
      const unpaidResult = await client.query(`
        SELECT COUNT(*) as unpaid_count
        FROM plan_progress
        WHERE plan_id = $1 AND status != 'paid'
      `, [planId]);

      if (unpaidResult.rows[0].unpaid_count === '0') {
        await this.completePlan(client, planId);
      }

      console.log(`[Plan] Applied payment of ${amount} to plan ${planId}`);
    });
  }

  /**
   * Check for missed plan installments
   */
  async checkMissedInstallments(asOfDate: string): Promise<void> {
    const missedResult = await this.pool.query(`
      SELECT DISTINCT
        ph.plan_id,
        ph.loan_id,
        ph.type
      FROM plan_header ph
      JOIN plan_progress pp ON pp.plan_id = ph.plan_id
      WHERE ph.status = 'active'
        AND pp.due_date < $1
        AND pp.status IN ('pending', 'partial')
    `, [asOfDate]);

    for (const row of missedResult.rows) {
      await this.defaultPlan(row.plan_id, 'missed_payment');
    }
  }

  private async completePlan(client: PoolClient, planId: string): Promise<void> {
    await this.repo.updatePlanStatus(client, planId, 'completed');

    await this.publisher.publish({
      exchange: 'collections.events',
      routingKey: 'plan.status.changed.v1',
      message: {
        plan_id: planId,
        previous_status: 'active',
        new_status: 'completed'
      },
      correlationId: `plan:complete:${planId}`
    });

    console.log(`[Plan] Completed plan ${planId}`);
  }

  private async defaultPlan(planId: string, reason: string): Promise<void> {
    await this.repo.withTx(async (client) => {
      await this.repo.updatePlanStatus(client, planId, 'defaulted');

      await this.publisher.publish({
        exchange: 'collections.events',
        routingKey: 'plan.status.changed.v1',
        message: {
          plan_id: planId,
          previous_status: 'active',
          new_status: 'defaulted',
          reason
        },
        correlationId: `plan:default:${planId}`
      });

      console.log(`[Plan] Defaulted plan ${planId} due to ${reason}`);
    });
  }
}