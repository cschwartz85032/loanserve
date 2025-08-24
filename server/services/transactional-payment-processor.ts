/**
 * Transactional Payment Processor
 * 
 * Ensures atomic consistency between CRM activity and accounting ledger.
 * This replaces the async message-based processing with transactional guarantees.
 */

import { pool } from '../db';
import type { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { ulid } from 'ulid';

export interface PaymentReceipt {
  paymentId: string;
  loanId: number;
  amount: number;
  source: 'manual' | 'ach' | 'wire' | 'check' | 'card';
  referenceNumber: string;
  effectiveDate: string;
  metadata?: Record<string, any>;
}

export interface PaymentAllocation {
  principal: number;
  interest: number;
  lateFees: number;
  escrow: number;
  other: number;
}

export class TransactionalPaymentProcessor {
  private static instance: TransactionalPaymentProcessor;

  static getInstance(): TransactionalPaymentProcessor {
    if (!this.instance) {
      this.instance = new TransactionalPaymentProcessor();
    }
    return this.instance;
  }

  /**
   * Process a payment with full transactional consistency
   * This ensures CRM activity and accounting ledger are ALWAYS in sync
   */
  async processPaymentTransactionally(payment: PaymentReceipt): Promise<{
    success: boolean;
    error?: string;
    ledgerEntries?: any[];
  }> {
    let client: PoolClient | null = null;
    
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      
      console.log(`[TransactionalProcessor] Processing payment ${payment.paymentId} atomically`);
      
      // 1. Record CRM activity
      const crmActivityId = await this.recordCRMActivity(client, payment);
      
      // 2. Calculate payment allocation
      const allocation = await this.calculateAllocation(client, payment);
      
      // 3. Create accounting ledger entries (in same transaction!)
      const ledgerEntries = await this.createLedgerEntries(client, payment, allocation);
      
      // 4. Update loan balances
      await this.updateLoanBalances(client, payment, allocation);
      
      // 5. Create audit trail
      await this.createAuditTrail(client, payment, allocation, crmActivityId, ledgerEntries);
      
      // 6. Update payment status to completed
      await this.updatePaymentStatus(client, payment.paymentId, 'completed');
      
      // COMMIT - Everything succeeds or nothing does
      await client.query('COMMIT');
      
      console.log(`[TransactionalProcessor] Successfully processed payment ${payment.paymentId} with ${ledgerEntries.length} ledger entries`);
      
      return {
        success: true,
        ledgerEntries
      };
      
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error(`[TransactionalProcessor] Failed to process payment ${payment.paymentId}:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Record CRM activity
   */
  private async recordCRMActivity(client: PoolClient, payment: PaymentReceipt): Promise<string> {
    const activityId = ulid();
    
    await client.query(`
      INSERT INTO crm_activities (
        id, entity_type, entity_id, activity_type, 
        description, metadata, created_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
    `, [
      activityId,
      'loan',
      payment.loanId,
      'payment_received',
      `Payment received: $${payment.amount.toFixed(2)} via ${payment.source}`,
      JSON.stringify({
        payment_id: payment.paymentId,
        amount: payment.amount,
        source: payment.source,
        reference: payment.referenceNumber,
        effective_date: payment.effectiveDate
      }),
      'system'
    ]);
    
    return activityId;
  }

  /**
   * Calculate payment allocation based on loan rules
   */
  private async calculateAllocation(client: PoolClient, payment: PaymentReceipt): Promise<PaymentAllocation> {
    // Get loan details and current balances
    const loanResult = await client.query(`
      SELECT 
        l.*,
        lb.current_principal,
        lb.current_interest,
        lb.total_late_fees,
        lb.current_escrow,
        lb.next_payment_due
      FROM loans l
      LEFT JOIN loan_balances lb ON lb.loan_id = l.id
      WHERE l.id = $1
    `, [payment.loanId]);
    
    if (loanResult.rows.length === 0) {
      throw new Error(`Loan ${payment.loanId} not found`);
    }
    
    const loan = loanResult.rows[0];
    let remainingAmount = payment.amount;
    
    const allocation: PaymentAllocation = {
      principal: 0,
      interest: 0,
      lateFees: 0,
      escrow: 0,
      other: 0
    };
    
    // Get payment allocation order (from loan or use default)
    const allocationOrder = loan.payment_allocation_order || [
      'late_fees',
      'interest', 
      'principal',
      'escrow'
    ];
    
    // Allocate payment according to order
    for (const component of allocationOrder) {
      if (remainingAmount <= 0) break;
      
      switch (component) {
        case 'late_fees':
          if (loan.total_late_fees > 0) {
            allocation.lateFees = Math.min(remainingAmount, loan.total_late_fees);
            remainingAmount -= allocation.lateFees;
          }
          break;
          
        case 'interest':
          if (loan.current_interest > 0) {
            allocation.interest = Math.min(remainingAmount, loan.current_interest);
            remainingAmount -= allocation.interest;
          }
          break;
          
        case 'principal':
          if (loan.current_principal > 0) {
            allocation.principal = Math.min(remainingAmount, loan.current_principal);
            remainingAmount -= allocation.principal;
          }
          break;
          
        case 'escrow':
          if (loan.current_escrow > 0) {
            allocation.escrow = Math.min(remainingAmount, loan.current_escrow);
            remainingAmount -= allocation.escrow;
          }
          break;
      }
    }
    
    // Any remaining goes to "other" (overpayment/prepayment)
    if (remainingAmount > 0) {
      allocation.other = remainingAmount;
    }
    
    return allocation;
  }

  /**
   * Create accounting ledger entries
   */
  private async createLedgerEntries(
    client: PoolClient,
    payment: PaymentReceipt,
    allocation: PaymentAllocation
  ): Promise<any[]> {
    const entries = [];
    const timestamp = new Date();
    
    // Create ledger entries for each allocated component
    const components = [
      { type: 'principal', amount: allocation.principal, account: '1100' },
      { type: 'interest', amount: allocation.interest, account: '4100' },
      { type: 'late_fee', amount: allocation.lateFees, account: '4200' },
      { type: 'escrow', amount: allocation.escrow, account: '2100' },
      { type: 'prepayment', amount: allocation.other, account: '2200' }
    ];
    
    for (const comp of components) {
      if (comp.amount > 0) {
        const entryId = uuidv4();
        
        await client.query(`
          INSERT INTO loan_ledger (
            id, loan_id, transaction_type, amount, balance,
            principal, interest, fees, escrow, other,
            reference_number, description, transaction_date,
            effective_date, created_at, created_by, gl_account_code
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, NOW(), $15, $16
          )
        `, [
          entryId,
          payment.loanId,
          'payment',
          comp.amount,
          0, // Balance will be calculated separately
          comp.type === 'principal' ? comp.amount : 0,
          comp.type === 'interest' ? comp.amount : 0,
          comp.type === 'late_fee' ? comp.amount : 0,
          comp.type === 'escrow' ? comp.amount : 0,
          comp.type === 'prepayment' ? comp.amount : 0,
          payment.referenceNumber,
          `Payment ${comp.type}: $${comp.amount.toFixed(2)}`,
          timestamp,
          payment.effectiveDate,
          'system',
          comp.account
        ]);
        
        entries.push({
          id: entryId,
          type: comp.type,
          amount: comp.amount,
          account: comp.account
        });
      }
    }
    
    return entries;
  }

  /**
   * Update loan balances
   */
  private async updateLoanBalances(
    client: PoolClient,
    payment: PaymentReceipt,
    allocation: PaymentAllocation
  ): Promise<void> {
    // Update or insert loan balances
    await client.query(`
      INSERT INTO loan_balances (
        loan_id, 
        current_principal,
        current_interest,
        total_late_fees,
        current_escrow,
        total_paid,
        last_payment_date,
        last_payment_amount,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (loan_id) DO UPDATE SET
        current_principal = GREATEST(0, loan_balances.current_principal - $9),
        current_interest = GREATEST(0, loan_balances.current_interest - $10),
        total_late_fees = GREATEST(0, loan_balances.total_late_fees - $11),
        current_escrow = GREATEST(0, loan_balances.current_escrow - $12),
        total_paid = loan_balances.total_paid + $13,
        last_payment_date = $14,
        last_payment_amount = $15,
        updated_at = NOW()
    `, [
      payment.loanId,
      0, // Will be reduced by UPDATE clause
      0,
      0,
      0,
      payment.amount,
      payment.effectiveDate,
      payment.amount,
      // UPDATE clause parameters
      allocation.principal,
      allocation.interest,
      allocation.lateFees,
      allocation.escrow,
      payment.amount,
      payment.effectiveDate,
      payment.amount
    ]);
  }

  /**
   * Create comprehensive audit trail
   */
  private async createAuditTrail(
    client: PoolClient,
    payment: PaymentReceipt,
    allocation: PaymentAllocation,
    crmActivityId: string,
    ledgerEntries: any[]
  ): Promise<void> {
    await client.query(`
      INSERT INTO audit_log (
        event_type, entity_type, entity_id, 
        details, created_at, created_by
      ) VALUES ($1, $2, $3, $4, NOW(), $5)
    `, [
      'payment_processed_transactionally',
      'payment',
      payment.paymentId,
      JSON.stringify({
        payment,
        allocation,
        crm_activity_id: crmActivityId,
        ledger_entries: ledgerEntries,
        processing_type: 'transactional',
        timestamp: new Date().toISOString()
      }),
      'system'
    ]);
  }

  /**
   * Update payment status
   */
  private async updatePaymentStatus(
    client: PoolClient,
    paymentId: string,
    status: string
  ): Promise<void> {
    // Update if payment_transactions table exists
    await client.query(`
      UPDATE payment_transactions 
      SET state = $2, updated_at = NOW()
      WHERE payment_id = $1
    `, [paymentId, status]).catch(() => {
      // Table might not exist in simpler setups
    });
  }

  /**
   * Reprocess stuck payments
   * This recovers payments that were recorded in CRM but never made it to accounting
   */
  async reprocessStuckPayments(): Promise<{
    processed: number;
    failed: number;
    errors: string[];
  }> {
    let client: PoolClient | null = null;
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    try {
      client = await pool.connect();
      
      // Find payments in CRM that don't have corresponding ledger entries
      const stuckPayments = await client.query(`
        SELECT DISTINCT
          ca.metadata->>'payment_id' as payment_id,
          CAST(ca.entity_id AS INTEGER) as loan_id,
          CAST(ca.metadata->>'amount' AS DECIMAL) as amount,
          ca.metadata->>'source' as source,
          ca.metadata->>'reference' as reference_number,
          ca.metadata->>'effective_date' as effective_date,
          ca.created_at
        FROM crm_activities ca
        WHERE ca.activity_type = 'payment_received'
          AND ca.created_at > NOW() - INTERVAL '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM loan_ledger ll
            WHERE ll.loan_id = ca.entity_id
              AND ll.reference_number = ca.metadata->>'reference'
              AND ll.transaction_type = 'payment'
          )
        ORDER BY ca.created_at DESC
      `);
      
      console.log(`[TransactionalProcessor] Found ${stuckPayments.rows.length} stuck payments to reprocess`);
      
      for (const stuck of stuckPayments.rows) {
        try {
          const payment: PaymentReceipt = {
            paymentId: stuck.payment_id || uuidv4(),
            loanId: stuck.loan_id,
            amount: parseFloat(stuck.amount),
            source: stuck.source || 'manual',
            referenceNumber: stuck.reference_number || `RECOVERY-${Date.now()}`,
            effectiveDate: stuck.effective_date || new Date().toISOString().split('T')[0],
            metadata: { recovered: true, original_activity_date: stuck.created_at }
          };
          
          console.log(`[TransactionalProcessor] Reprocessing stuck payment ${payment.paymentId} for loan ${payment.loanId}`);
          
          const result = await this.processPaymentTransactionally(payment);
          
          if (result.success) {
            results.processed++;
            console.log(`[TransactionalProcessor] Successfully recovered payment ${payment.paymentId}`);
          } else {
            results.failed++;
            results.errors.push(`Payment ${payment.paymentId}: ${result.error}`);
            console.error(`[TransactionalProcessor] Failed to recover payment ${payment.paymentId}: ${result.error}`);
          }
          
        } catch (error) {
          results.failed++;
          results.errors.push(`Payment ${stuck.payment_id}: ${error}`);
          console.error(`[TransactionalProcessor] Error recovering payment:`, error);
        }
      }
      
      // Log recovery results
      if (client) {
        await client.query(`
          INSERT INTO audit_log (
            event_type, entity_type, entity_id,
            details, created_at, created_by
          ) VALUES ($1, $2, $3, $4, NOW(), $5)
        `, [
          'stuck_payments_recovery',
          'system',
          'payment_processor',
          JSON.stringify(results),
          'system'
        ]);
      }
      
      return results;
      
    } catch (error) {
      console.error(`[TransactionalProcessor] Error in reprocessStuckPayments:`, error);
      results.errors.push(`Recovery process error: ${error}`);
      return results;
      
    } finally {
      if (client) {
        client.release();
      }
    }
  }
}