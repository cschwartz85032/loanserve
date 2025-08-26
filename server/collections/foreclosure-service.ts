/**
 * Foreclosure Pipeline Service
 * Manages foreclosure cases and milestones
 */

import { Pool, PoolClient } from 'pg';
import { CollectionsRepo } from './repo';
import { ForeclosureCase, ForeclosureMilestone, UUID } from './types';
import { MessagePublisher } from '../services/message-publisher';

export class ForeclosureService {
  private repo: CollectionsRepo;
  private publisher: MessagePublisher;

  constructor(private pool: Pool) {
    this.repo = new CollectionsRepo(pool);
    this.publisher = new MessagePublisher(pool);
  }

  /**
   * Open a foreclosure case for a loan
   */
  async openForeclosureCase(loanId: number): Promise<string | null> {
    return await this.repo.withTx(async (client) => {
      // Check if case already exists
      const existingResult = await client.query(`
        SELECT fc_id FROM foreclosure_case
        WHERE loan_id = $1 AND status = 'open'
        LIMIT 1
      `, [loanId]);

      if (existingResult.rows.length > 0) {
        console.log(`[Foreclosure] Case already open for loan ${loanId}`);
        return existingResult.rows[0].fc_id;
      }

      // Create new case
      const fcId = await this.repo.createForeclosureCase(client, loanId);

      if (fcId) {
        // Update collection case status
        await this.repo.upsertCollectionCase(client, {
          loan_id: loanId,
          status: 'foreclosure'
        });

        // Publish event
        await this.publisher.publish({
          exchange: 'foreclosure.events',
          routingKey: 'foreclosure.case.opened.v1',
          message: {
            fc_id: fcId,
            loan_id: loanId,
            opened_at: new Date().toISOString()
          },
          correlationId: `foreclosure:open:${fcId}`
        });

        console.log(`[Foreclosure] Opened case ${fcId} for loan ${loanId}`);
      }

      return fcId;
    });
  }

  /**
   * Record a foreclosure milestone
   */
  async recordMilestone(
    fcId: string,
    milestone: ForeclosureMilestone,
    meta?: Record<string, any>
  ): Promise<void> {
    await this.repo.withTx(async (client) => {
      // Verify case exists and is open
      const caseResult = await client.query(`
        SELECT loan_id, status FROM foreclosure_case
        WHERE fc_id = $1
      `, [fcId]);

      if (caseResult.rows.length === 0) {
        throw new Error(`Foreclosure case ${fcId} not found`);
      }

      if (caseResult.rows[0].status !== 'open') {
        throw new Error(`Foreclosure case ${fcId} is not open`);
      }

      const loanId = caseResult.rows[0].loan_id;

      // Record the milestone
      await this.repo.recordForeclosureMilestone(client, {
        fc_id: fcId,
        milestone,
        occurred_at: new Date(),
        meta: meta || {}
      });

      // Handle special milestones
      if (milestone === 'sale_completed' || milestone === 'reinstated' || milestone === 'redeemed') {
        await this.closeCase(client, fcId, milestone);
      }

      // Publish event
      await this.publisher.publish({
        exchange: 'foreclosure.events',
        routingKey: 'foreclosure.milestone.hit.v1',
        message: {
          fc_id: fcId,
          loan_id: loanId,
          milestone,
          meta
        },
        correlationId: `foreclosure:milestone:${fcId}:${milestone}`
      });

      console.log(`[Foreclosure] Recorded milestone ${milestone} for case ${fcId}`);
    });
  }

  /**
   * Send breach letter (first step in foreclosure)
   */
  async sendBreachLetter(loanId: number): Promise<void> {
    const fcId = await this.openForeclosureCase(loanId);
    if (fcId) {
      await this.recordMilestone(fcId, 'breach_letter_sent', {
        sent_date: new Date().toISOString()
      });
    }
  }

  /**
   * Refer case to attorney
   */
  async referToAttorney(fcId: string, attorneyId: string): Promise<void> {
    await this.recordMilestone(fcId, 'referral_to_attorney', {
      attorney_id: attorneyId,
      referral_date: new Date().toISOString()
    });
  }

  /**
   * Schedule foreclosure sale
   */
  async scheduleSale(fcId: string, saleDate: string, venue: string): Promise<void> {
    await this.recordMilestone(fcId, 'sale_scheduled', {
      sale_date: saleDate,
      venue
    });
  }

  private async closeCase(
    client: PoolClient,
    fcId: string,
    reason: ForeclosureMilestone
  ): Promise<void> {
    await client.query(`
      UPDATE foreclosure_case
      SET status = 'closed'
      WHERE fc_id = $1
    `, [fcId]);

    // Update collection case status
    const loanResult = await client.query(`
      SELECT loan_id FROM foreclosure_case WHERE fc_id = $1
    `, [fcId]);

    if (loanResult.rows.length > 0) {
      const status = reason === 'sale_completed' ? 'closed' : 'normal';
      await this.repo.upsertCollectionCase(client, {
        loan_id: loanResult.rows[0].loan_id,
        status
      });
    }

    console.log(`[Foreclosure] Closed case ${fcId} due to ${reason}`);
  }
}