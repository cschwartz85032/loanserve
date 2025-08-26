/**
 * Escrow Disbursement Service
 * 
 * Manages scheduling and posting of escrow disbursements
 */

import { pool } from '../db';
import { randomUUID } from 'crypto';
import { postEvent } from '../domain/posting';
import { PgLedgerRepository } from '../db/ledger-repository';
import type { LedgerRepository } from '../db/ledger-repository';
import type { 
  EscrowDisbursement, 
  EscrowDisbursementScheduleRequest,
  EscrowDisbursementScheduleResponse 
} from './types';

export class EscrowDisbursementService {
  private ledgerRepo: LedgerRepository;
  
  constructor(private db = pool) {
    this.ledgerRepo = new PgLedgerRepository(db);
  }
  
  /**
   * Schedule disbursements based on forecast
   */
  async scheduleDisbursements(
    request: EscrowDisbursementScheduleRequest
  ): Promise<EscrowDisbursementScheduleResponse> {
    const { loan_id, effective_date, correlation_id } = request;
    
    console.log(`[EscrowDisbursement] Scheduling disbursements for loan ${loan_id} effective ${effective_date}`);
    
    try {
      await this.db.query('BEGIN');
      
      // Get forecasted disbursements within the next 30 days
      const endDate = new Date(effective_date);
      endDate.setDate(endDate.getDate() + 30);
      
      const forecastResult = await this.db.query(`
        SELECT 
          ef.escrow_id,
          ef.due_date,
          ef.amount_minor,
          ei.type as escrow_type,
          ei.payee_name
        FROM escrow_forecast ef
        JOIN escrow_items ei ON ei.id = ef.escrow_id
        WHERE ef.loan_id = $1
          AND ef.due_date >= $2
          AND ef.due_date <= $3
          AND NOT EXISTS (
            SELECT 1 FROM escrow_disbursement ed
            WHERE ed.loan_id = ef.loan_id
              AND ed.escrow_id = ef.escrow_id
              AND ed.due_date = ef.due_date
              AND ed.status != 'canceled'
          )
        ORDER BY ef.due_date, ef.escrow_id
      `, [loan_id, effective_date, endDate.toISOString().split('T')[0]]);
      
      const scheduled: Array<{
        disb_id: string;
        escrow_id: number;
        due_date: string;
        amount_minor: string;
      }> = [];
      
      // Create disbursement records
      for (const forecast of forecastResult.rows) {
        const disb_id = randomUUID();
        
        await this.db.query(`
          INSERT INTO escrow_disbursement (
            disb_id,
            loan_id,
            escrow_id,
            due_date,
            amount_minor,
            status,
            scheduled_at
          ) VALUES ($1, $2, $3, $4, $5, 'scheduled', NOW())
        `, [
          disb_id,
          loan_id,
          forecast.escrow_id,
          forecast.due_date,
          forecast.amount_minor
        ]);
        
        scheduled.push({
          disb_id,
          escrow_id: forecast.escrow_id,
          due_date: forecast.due_date.toISOString().split('T')[0],
          amount_minor: forecast.amount_minor.toString()
        });
        
        console.log(`[EscrowDisbursement] Scheduled ${forecast.escrow_type} payment of $${(forecast.amount_minor / 100).toFixed(2)} to ${forecast.payee_name} on ${forecast.due_date}`);
      }
      
      await this.db.query('COMMIT');
      
      console.log(`[EscrowDisbursement] Scheduled ${scheduled.length} disbursements for loan ${loan_id}`);
      
      return {
        loan_id,
        scheduled,
        correlation_id
      };
      
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[EscrowDisbursement] Error scheduling disbursements:', error);
      throw error;
    }
  }
  
  /**
   * Process due disbursements
   */
  async processDueDisbursements(asOfDate: string): Promise<number> {
    console.log(`[EscrowDisbursement] Processing disbursements due as of ${asOfDate}`);
    
    let processedCount = 0;
    
    try {
      // Get all scheduled disbursements due today or earlier
      const dueResult = await this.db.query(`
        SELECT 
          ed.disb_id,
          ed.loan_id,
          ed.escrow_id,
          ed.due_date,
          ed.amount_minor,
          ei.type as escrow_type,
          ei.payee_name,
          l.loan_number,
          ea.balance as escrow_balance
        FROM escrow_disbursement ed
        JOIN escrow_items ei ON ei.id = ed.escrow_id
        JOIN loans l ON l.id = ed.loan_id
        JOIN escrow_accounts ea ON ea.loan_id = ed.loan_id
        WHERE ed.status = 'scheduled'
          AND ed.due_date <= $1
        ORDER BY ed.loan_id, ed.due_date
      `, [asOfDate]);
      
      // Process each disbursement
      for (const disb of dueResult.rows) {
        try {
          await this.postDisbursement(disb);
          processedCount++;
        } catch (error) {
          console.error(`[EscrowDisbursement] Failed to process disbursement ${disb.disb_id}:`, error);
          // Continue processing other disbursements
        }
      }
      
      console.log(`[EscrowDisbursement] Processed ${processedCount} disbursements`);
      
    } catch (error) {
      console.error('[EscrowDisbursement] Error processing due disbursements:', error);
      throw error;
    }
    
    return processedCount;
  }
  
  /**
   * Post a single disbursement to the ledger
   */
  private async postDisbursement(disbursement: any): Promise<void> {
    const amountMinor = BigInt(disbursement.amount_minor);
    const escrowBalance = BigInt(Math.round(parseFloat(disbursement.escrow_balance) * 100));
    
    console.log(`[EscrowDisbursement] Posting ${disbursement.escrow_type} disbursement of $${(Number(amountMinor) / 100).toFixed(2)} for loan ${disbursement.loan_number}`);
    
    // Check if escrow account has sufficient funds
    const hasInsufficientFunds = escrowBalance < amountMinor;
    
    try {
      await this.db.query('BEGIN');
      
      // Post to ledger
      const { eventId } = await postEvent(this.ledgerRepo, {
        loanId: disbursement.loan_id,
        effectiveDate: disbursement.due_date.toISOString().split('T')[0],
        correlationId: `escrow_disb_${disbursement.disb_id}`,
        schema: 'escrow.disbursement.v1',
        currency: 'USD',
        lines: hasInsufficientFunds ? [
          // Advance from servicer
          {
            account: 'escrow_advances',
            debitMinor: amountMinor - escrowBalance,
            memo: `Escrow advance for ${disbursement.escrow_type} - ${disbursement.payee_name}`
          },
          {
            account: 'cash',
            creditMinor: amountMinor - escrowBalance,
            memo: `Advance funded for insufficient escrow`
          },
          // Use available escrow balance
          {
            account: 'escrow_liability',
            debitMinor: escrowBalance,
            memo: `${disbursement.escrow_type} payment to ${disbursement.payee_name}`
          },
          {
            account: 'cash',
            creditMinor: escrowBalance,
            memo: `Escrow disbursement`
          }
        ] : [
          // Normal disbursement from escrow
          {
            account: 'escrow_liability',
            debitMinor: amountMinor,
            memo: `${disbursement.escrow_type} payment to ${disbursement.payee_name}`
          },
          {
            account: 'cash',
            creditMinor: amountMinor,
            memo: `Escrow disbursement to ${disbursement.payee_name}`
          }
        ]
      });
      
      // Update disbursement status
      await this.db.query(`
        UPDATE escrow_disbursement
        SET status = 'posted',
            event_id = $1,
            posted_at = NOW()
        WHERE disb_id = $2
      `, [eventId, disbursement.disb_id]);
      
      // Update escrow account balance
      const newBalance = hasInsufficientFunds ? 0 : Number(escrowBalance - amountMinor) / 100;
      await this.db.query(`
        UPDATE escrow_accounts
        SET balance = $1,
            last_disbursement_date = $2
        WHERE loan_id = $3
      `, [newBalance, disbursement.due_date, disbursement.loan_id]);
      
      await this.db.query('COMMIT');
      
      console.log(`[EscrowDisbursement] Successfully posted disbursement ${disbursement.disb_id} with event ${eventId}`);
      
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }
  
  /**
   * Cancel a scheduled disbursement
   */
  async cancelDisbursement(disb_id: string, reason: string): Promise<void> {
    console.log(`[EscrowDisbursement] Canceling disbursement ${disb_id}: ${reason}`);
    
    await this.db.query(`
      UPDATE escrow_disbursement
      SET status = 'canceled',
          posted_at = NOW()
      WHERE disb_id = $1
        AND status = 'scheduled'
    `, [disb_id]);
  }
  
  /**
   * Get disbursement history for a loan
   */
  async getDisbursementHistory(loan_id: number): Promise<EscrowDisbursement[]> {
    const result = await this.db.query(`
      SELECT 
        disb_id,
        loan_id,
        escrow_id,
        due_date,
        amount_minor,
        status,
        event_id,
        scheduled_at,
        posted_at
      FROM escrow_disbursement
      WHERE loan_id = $1
      ORDER BY due_date DESC, escrow_id
    `, [loan_id]);
    
    return result.rows.map(row => ({
      disb_id: row.disb_id,
      loan_id: row.loan_id,
      escrow_id: row.escrow_id,
      due_date: row.due_date.toISOString().split('T')[0],
      amount_minor: BigInt(row.amount_minor),
      status: row.status,
      event_id: row.event_id,
      scheduled_at: row.scheduled_at,
      posted_at: row.posted_at
    }));
  }
}