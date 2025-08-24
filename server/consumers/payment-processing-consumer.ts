/**
 * Payment Processing Consumer
 * Processes validated payments and applies to loan
 */

import { PoolClient } from 'pg';
import {
  PaymentEnvelope,
  PaymentData,
  PaymentState
} from '../messaging/payment-envelope';
import { IdempotencyService, createIdempotentHandler } from '../services/payment-idempotency';
import { PaymentAllocationEngine } from '../services/payment-allocation-engine';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { getMessageFactory } from '../messaging/message-factory';
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';

export class PaymentProcessingConsumer {
  private rabbitmq = getEnhancedRabbitMQService();
  private messageFactory = getMessageFactory();
  private allocationEngine = new PaymentAllocationEngine();

  /**
   * Main processing handler
   */
  async processPayment(
    envelope: PaymentEnvelope<PaymentData>,
    client: PoolClient
  ): Promise<void> {
    const { data } = envelope;
    console.log(`[Processing] Processing payment ${data.payment_id}`);

    try {
      // Log audit trail - Payment processing started
      await this.logAuditEvent(
        client,
        'payment_processing_started',
        {
          payment_id: data.payment_id,
          loan_id: data.loan_id,
          amount_cents: data.amount_cents,
          source: data.source,
          state: 'validated'
        }
      );

      // Update state to processing
      await this.updatePaymentState(
        client,
        data.payment_id,
        'validated',
        'processing'
      );

      // Get payment details
      const paymentResult = await client.query(
        'SELECT * FROM payment_transactions WHERE payment_id = $1',
        [data.payment_id]
      );

      if (paymentResult.rows.length === 0) {
        throw new Error(`Payment ${data.payment_id} not found`);
      }

      const payment = paymentResult.rows[0];
      const effectiveDate = new Date(payment.effective_date);

      // Log audit trail - Starting allocation
      await this.logAuditEvent(
        client,
        'payment_allocation_started',
        {
          payment_id: data.payment_id,
          loan_id: payment.loan_id,
          amount_cents: payment.amount_cents,
          effective_date: effectiveDate.toISOString()
        }
      );

      // Allocate payment
      const allocation = await this.allocationEngine.allocate(
        client,
        payment.loan_id,
        payment.amount_cents,
        effectiveDate,
        false // Not escrow-only
      );

      console.log(`[Processing] Allocated payment to ${allocation.allocations.length} targets`);

      // Log audit trail - Allocation completed
      await this.logAuditEvent(
        client,
        'payment_allocation_completed',
        {
          payment_id: data.payment_id,
          loan_id: payment.loan_id,
          allocations: allocation.allocations.map(a => ({
            target: a.target,
            amount_cents: a.amount_cents,
            account: a.account
          })),
          total_allocated: allocation.total_allocated,
          unapplied: allocation.unapplied
        }
      );

      // Post to general ledger
      await this.postToGeneralLedger(
        client,
        data.payment_id,
        payment.loan_id,
        payment.amount_cents,
        allocation,
        effectiveDate,
        payment.external_ref || data.payment_id
      );

      // Log audit trail - Posted to general ledger
      await this.logAuditEvent(
        client,
        'payment_posted_to_ledger',
        {
          payment_id: data.payment_id,
          loan_id: payment.loan_id,
          amount_cents: payment.amount_cents,
          ledger_entries: allocation.allocations.length + 1 // +1 for cash debit
        }
      );

      // Update loan balances
      await this.updateLoanBalances(
        client,
        payment.loan_id,
        allocation
      );

      // Log audit trail - Loan balances updated
      await this.logAuditEvent(
        client,
        'loan_balances_updated',
        {
          payment_id: data.payment_id,
          loan_id: payment.loan_id,
          updates: allocation.allocations.map(a => ({
            target: a.target,
            amount_cents: a.amount_cents
          }))
        }
      );

      // Update escrow if applicable
      const escrowAllocations = allocation.allocations.filter(
        a => a.target === 'escrow_shortage' || a.target === 'current_escrow'
      );

      if (escrowAllocations.length > 0) {
        await this.updateEscrowAccounts(
          client,
          payment.loan_id,
          data.payment_id,
          escrowAllocations,
          effectiveDate
        );
      }

      // Update state to posted_pending_settlement
      await this.updatePaymentState(
        client,
        data.payment_id,
        'processing',
        'posted_pending_settlement'
      );

      // Log audit trail - Payment processing completed
      await this.logAuditEvent(
        client,
        'payment_processing_completed',
        {
          payment_id: data.payment_id,
          loan_id: payment.loan_id,
          final_state: 'posted_pending_settlement',
          total_allocated: allocation.total_allocated,
          processing_timestamp: new Date().toISOString()
        }
      );

      // Emit processed event
      const processedEnvelope = this.messageFactory.createReply(envelope, {
        schema: `loanserve.payment.v1.processed`,
        data: {
          ...data,
          allocation,
          processing_timestamp: new Date().toISOString()
        }
      });

      await IdempotencyService.addToOutbox(
        client,
        { type: 'payment', id: data.payment_id },
        processedEnvelope,
        `payment.${data.source}.processed`
      );

      console.log(`[Processing] Payment ${data.payment_id} processed successfully`);

      // For wire payments, immediately settle
      if (data.source === 'wire') {
        await this.immediateSettle(client, data.payment_id);
      }

    } catch (error) {
      console.error(`[Processing] Error processing payment ${data.payment_id}:`, error);
      throw error;
    }
  }

  /**
   * Post payment to general ledger (loan_ledger table)
   */
  private async postToGeneralLedger(
    client: PoolClient,
    paymentId: string,
    loanId: string,
    totalAmountCents: number,
    allocation: any,
    effectiveDate: Date,
    externalRef: string
  ): Promise<void> {
    // Get current loan balances for running balance calculation
    const loanResult = await client.query(
      'SELECT principal_balance, accrued_interest FROM loans WHERE id = $1',
      [loanId]
    );
    const loan = loanResult.rows[0];
    
    // Post each allocation to the general ledger
    for (const alloc of allocation.allocations) {
      let transactionType: string;
      let category: string | null = null;
      let description: string;
      
      // Map allocation target to transaction type and description
      switch (alloc.target) {
        case 'late_fees':
          transactionType = 'fee';
          category = 'late_fee';
          description = `Late fee payment received - ${alloc.target}`;
          break;
        case 'accrued_interest':
          transactionType = 'interest';
          category = 'servicing';
          description = `Interest payment received`;
          break;
        case 'scheduled_principal':
          transactionType = 'principal';
          category = 'servicing';
          description = `Principal payment received`;
          break;
        case 'escrow_shortage':
        case 'current_escrow':
          transactionType = 'escrow';
          category = 'servicing';
          description = `Escrow payment received - ${alloc.target}`;
          break;
        case 'unapplied_funds':
          transactionType = 'payment';
          category = 'unapplied';
          description = `Unapplied funds from payment`;
          break;
        default:
          transactionType = 'payment';
          description = `Payment allocation - ${alloc.target}`;
      }
      
      // Calculate new balances after this allocation
      const newPrincipalBalance = alloc.target === 'scheduled_principal' 
        ? parseFloat(loan.principal_balance) - (alloc.amount_cents / 100)
        : parseFloat(loan.principal_balance);
      
      const newInterestBalance = alloc.target === 'accrued_interest'
        ? Math.max(0, parseFloat(loan.accrued_interest || '0') - (alloc.amount_cents / 100))
        : parseFloat(loan.accrued_interest || '0');
      
      // Insert ledger entry
      await client.query(`
        INSERT INTO loan_ledger (
          loan_id, transaction_date, transaction_id, description,
          transaction_type, category, credit_amount, debit_amount,
          running_balance, principal_balance, interest_balance,
          status, created_by, notes, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      `, [
        loanId,
        effectiveDate,
        `PAYMENT-${paymentId}-${alloc.target}`,
        description,
        transactionType,
        category,
        (alloc.amount_cents / 100).toFixed(2), // Credit (payment received)
        null, // No debit
        newPrincipalBalance.toFixed(2), // Running balance = principal balance
        newPrincipalBalance.toFixed(2),
        newInterestBalance.toFixed(2),
        'posted',
        null, // System user
        `Payment ${externalRef} - Allocated ${(alloc.amount_cents / 100).toFixed(2)} to ${alloc.target}`,
        JSON.stringify({
          payment_id: paymentId,
          allocation_target: alloc.target,
          amount_cents: alloc.amount_cents,
          external_ref: externalRef
        })
      ]);
      
      // Update loan balances for next iteration
      loan.principal_balance = newPrincipalBalance.toString();
      loan.accrued_interest = newInterestBalance.toString();
    }
  }

  /**
   * Update loan balances based on allocation
   */
  private async updateLoanBalances(
    client: PoolClient,
    loanId: string,
    allocation: any
  ): Promise<void> {
    for (const alloc of allocation.allocations) {
      switch (alloc.target) {
        case 'scheduled_principal':
          await client.query(
            'UPDATE loans SET principal_balance = principal_balance - $1 WHERE id = $2',
            [alloc.amount_cents / 100, loanId]
          );
          break;

        case 'late_fees':
          // Update late fee balance
          await client.query(
            'UPDATE loans SET late_fee_balance = GREATEST(0, COALESCE(late_fee_balance, 0) - $1) WHERE id = $2',
            [alloc.amount_cents / 100, loanId]
          );
          break;

        case 'accrued_interest':
          // Update accrued interest
          await client.query(
            'UPDATE loans SET accrued_interest = GREATEST(0, COALESCE(accrued_interest, 0) - $1) WHERE id = $2',
            [alloc.amount_cents / 100, loanId]
          );
          break;
      }
    }

    // Update next payment date
    await client.query(
      `UPDATE loans 
       SET last_payment_date = CURRENT_DATE,
           next_payment_date = CASE 
             WHEN payment_frequency = 'monthly' THEN CURRENT_DATE + INTERVAL '1 month'
             WHEN payment_frequency = 'biweekly' THEN CURRENT_DATE + INTERVAL '2 weeks'
             ELSE next_payment_date
           END
       WHERE id = $1`,
      [loanId]
    );
  }

  /**
   * Update escrow accounts
   */
  private async updateEscrowAccounts(
    client: PoolClient,
    loanId: string,
    paymentId: string,
    escrowAllocations: any[],
    effectiveDate: Date
  ): Promise<void> {
    for (const alloc of escrowAllocations) {
      // Simplified - in production would distribute across categories
      const category = 'tax'; // Would be determined by business rules

      // Update balance
      await client.query(
        `UPDATE escrow_accounts 
         SET balance_cents = balance_cents + $1,
             shortage_cents = GREATEST(0, shortage_cents - $1)
         WHERE loan_id = $2 AND category = $3`,
        [alloc.amount_cents, loanId, category]
      );

      // Record in escrow ledger
      await client.query(`
        INSERT INTO escrow_ledger (
          loan_id, payment_id, category, debit_cents, credit_cents,
          effective_date, description, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        loanId,
        paymentId,
        category,
        0,
        alloc.amount_cents,
        effectiveDate,
        `Payment allocation - ${alloc.target}`
      ]);
    }
  }

  /**
   * Immediately settle wire payments
   */
  private async immediateSettle(
    client: PoolClient,
    paymentId: string
  ): Promise<void> {
    // Update to settled
    await this.updatePaymentState(
      client,
      paymentId,
      'posted_pending_settlement',
      'settled'
    );

    // Convert pending ledger entries to final
    await client.query(
      'UPDATE payment_ledger SET pending = false WHERE payment_id = $1',
      [paymentId]
    );

    // Emit settled event
    const settledEnvelope = this.messageFactory.create({
      schema: 'loanserve.payment.v1.settled',
      data: {
        payment_id: paymentId,
        settlement_timestamp: new Date().toISOString()
      }
    });

    await IdempotencyService.addToOutbox(
      client,
      { type: 'payment', id: paymentId },
      settledEnvelope,
      'payment.wire.settled'
    );
  }

  /**
   * Update payment state
   */
  private async updatePaymentState(
    client: PoolClient,
    paymentId: string,
    fromState: PaymentState,
    toState: PaymentState
  ): Promise<void> {
    await client.query(
      'UPDATE payment_transactions SET state = $1 WHERE payment_id = $2 AND state = $3',
      [toState, paymentId, fromState]
    );

    await client.query(`
      INSERT INTO payment_state_transitions (
        payment_id, previous_state, new_state, occurred_at, actor, reason
      ) VALUES ($1, $2, $3, NOW(), $4, $5)
    `, [paymentId, fromState, toState, 'system', `State changed from ${fromState} to ${toState}`]);
  }

  /**
   * Log audit event for payment processing decisions
   */
  private async logAuditEvent(
    client: PoolClient,
    eventType: string,
    details: any
  ): Promise<void> {
    await client.query(`
      INSERT INTO auth_events (
        id, occurred_at, event_type, details, event_key
      ) VALUES ($1, NOW(), $2, $3, $4)
    `, [
      uuidv4(),
      `payment.${eventType}`,
      JSON.stringify(details),
      `payment_${details.payment_id}_${eventType}_${Date.now()}`
    ]);
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    const handler = createIdempotentHandler(
      'payment-processing',
      this.processPayment.bind(this)
    );

    await this.rabbitmq.consume(
      {
        queue: 'payments.processing',
        prefetch: 10,
        consumerTag: 'payment-processing-consumer'
      },
      async (envelope: PaymentEnvelope<PaymentData>, msg) => {
        try {
          await handler(envelope);
          // Ack is handled automatically by enhanced service
        } catch (error) {
          console.error('[Processing] Error processing message:', error);
          throw error; // Enhanced service will handle nack
        }
      }
    );

    console.log('[Processing] Payment processing consumer started');
  }
}