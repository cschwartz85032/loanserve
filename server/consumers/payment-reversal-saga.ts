/**
 * Payment Reversal Saga
 * Orchestrates compensation for returned payments
 */

import { PoolClient } from 'pg';
import { ulid } from 'ulid';
import {
  PaymentEnvelope,
  PaymentData,
  PaymentState
} from '../messaging/payment-envelope';
import { IdempotencyService, createIdempotentHandler } from '../services/payment-idempotency';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { getMessageFactory } from '../messaging/message-factory';
import { db } from '../db';

interface ReversalData {
  payment_id: string;
  return_code?: string;
  return_reason: string;
  reversal_id: string;
}

export class PaymentReversalSaga {
  private rabbitmq = getEnhancedRabbitMQService();
  private messageFactory = getMessageFactory();

  /**
   * Execute reversal saga
   */
  async executeReversal(
    envelope: PaymentEnvelope<ReversalData>,
    client: PoolClient
  ): Promise<void> {
    const { payment_id, return_code, return_reason, reversal_id } = envelope.data;
    const sagaId = reversal_id || ulid();

    console.log(`[Reversal] Starting reversal saga ${sagaId} for payment ${payment_id}`);

    try {
      // Get payment details
      const paymentResult = await client.query(
        'SELECT * FROM payment_transactions WHERE payment_id = $1',
        [payment_id]
      );

      if (paymentResult.rows.length === 0) {
        throw new Error(`Payment ${payment_id} not found`);
      }

      const payment = paymentResult.rows[0];

      // Update payment state to returned
      await this.updatePaymentState(
        client,
        payment_id,
        payment.state,
        'returned',
        return_reason
      );

      // Step 1: Reverse loan ledger entries
      await this.reverseLoanLedger(client, payment_id, payment.loan_id);

      // Step 2: Reverse escrow contributions
      await this.reverseEscrow(client, payment_id, payment.loan_id);

      // Step 3: Create negative distributions (clawback)
      await this.createNegativeDistributions(client, payment_id, sagaId);

      // Step 4: Recompute interest and fees
      await this.recomputeInterestAndFees(client, payment.loan_id, payment.effective_date);

      // Step 5: Update loan status
      await this.updateLoanStatus(client, payment.loan_id);

      // Step 6: Send notifications
      await this.sendNotifications(client, payment_id, payment.loan_id, return_reason);

      // Update payment state to reversed
      await this.updatePaymentState(
        client,
        payment_id,
        'returned',
        'reversed',
        'Reversal completed'
      );

      // Emit reversal complete event
      const reversalCompleteEnvelope = this.messageFactory.createReply(envelope, {
        schema: 'loanserve.payment.v1.reversed',
        data: {
          payment_id,
          reversal_id: sagaId,
          reversal_timestamp: new Date().toISOString()
        }
      });

      await IdempotencyService.addToOutbox(
        client,
        { type: 'reversal', id: sagaId },
        reversalCompleteEnvelope,
        'payment.reversal.complete'
      );

      console.log(`[Reversal] Completed reversal saga ${sagaId} for payment ${payment_id}`);

    } catch (error) {
      console.error(`[Reversal] Error in reversal saga ${sagaId}:`, error);
      
      // Log failed reversal for manual intervention
      await client.query(`
        INSERT INTO payment_state_transitions (
          payment_id, previous_state, new_state, occurred_at, actor, reason, metadata
        ) VALUES ($1, $2, $3, NOW(), $4, $5, $6)
      `, [
        payment_id,
        'returned',
        'reversal_failed',
        'system',
        'Reversal saga failed',
        JSON.stringify({ error: error.message, saga_id: sagaId })
      ]);

      throw error;
    }
  }

  /**
   * Step 1: Reverse loan ledger entries
   */
  private async reverseLoanLedger(
    client: PoolClient,
    paymentId: string,
    loanId: string
  ): Promise<void> {
    console.log(`[Reversal] Reversing ledger entries for payment ${paymentId}`);

    // Get original ledger entries
    const originalEntries = await client.query(
      'SELECT * FROM payment_ledger WHERE payment_id = $1',
      [paymentId]
    );

    // Create mirror entries (swap debits and credits)
    for (const entry of originalEntries.rows) {
      await client.query(`
        INSERT INTO payment_ledger (
          loan_id, payment_id, account, debit_cents, credit_cents,
          pending, effective_date, created_at, reversal_of
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
      `, [
        loanId,
        paymentId,
        entry.account,
        entry.credit_cents, // Swap: credit becomes debit
        entry.debit_cents,  // Swap: debit becomes credit
        false, // Not pending
        entry.effective_date,
        entry.ledger_id // Link to original
      ]);
    }

    // Update loan balances
    const principalReversal = originalEntries.rows.find(
      e => e.account === 'principal_receivable'
    );
    
    if (principalReversal) {
      await client.query(
        'UPDATE loans SET principal_balance = principal_balance + $1 WHERE id = $2',
        [principalReversal.credit_cents / 100, loanId]
      );
    }

    const interestReversal = originalEntries.rows.find(
      e => e.account === 'interest_income'
    );
    
    if (interestReversal) {
      await client.query(
        'UPDATE loans SET accrued_interest = COALESCE(accrued_interest, 0) + $1 WHERE id = $2',
        [interestReversal.credit_cents / 100, loanId]
      );
    }
  }

  /**
   * Step 2: Reverse escrow contributions
   */
  private async reverseEscrow(
    client: PoolClient,
    paymentId: string,
    loanId: string
  ): Promise<void> {
    console.log(`[Reversal] Reversing escrow for payment ${paymentId}`);

    // Get escrow ledger entries
    const escrowEntries = await client.query(
      'SELECT * FROM escrow_ledger WHERE payment_id = $1',
      [paymentId]
    );

    for (const entry of escrowEntries.rows) {
      // Create reversal entry
      await client.query(`
        INSERT INTO escrow_ledger (
          loan_id, payment_id, category, debit_cents, credit_cents,
          effective_date, description, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        loanId,
        paymentId,
        entry.category,
        entry.credit_cents, // Swap
        entry.debit_cents,  // Swap
        entry.effective_date,
        `Reversal of payment ${paymentId}`
      ]);

      // Update escrow balance
      await client.query(
        `UPDATE escrow_accounts 
         SET balance_cents = balance_cents - $1,
             shortage_cents = shortage_cents + $1
         WHERE loan_id = $2 AND category = $3`,
        [entry.credit_cents, loanId, entry.category]
      );
    }
  }

  /**
   * Step 3: Create negative distributions
   */
  private async createNegativeDistributions(
    client: PoolClient,
    paymentId: string,
    sagaId: string
  ): Promise<void> {
    console.log(`[Reversal] Creating clawback distributions for payment ${paymentId}`);

    // Emit clawback event
    const clawbackEnvelope = this.messageFactory.create({
      schema: 'loanserve.distribution.v1.clawback',
      data: {
        payment_id: paymentId,
        reason: 'Payment returned',
        saga_id: sagaId
      }
    });

    await IdempotencyService.addToOutbox(
      client,
      { type: 'clawback', id: paymentId },
      clawbackEnvelope,
      'distribution.clawback'
    );
  }

  /**
   * Step 4: Recompute interest and fees
   */
  private async recomputeInterestAndFees(
    client: PoolClient,
    loanId: string,
    paymentEffectiveDate: string
  ): Promise<void> {
    console.log(`[Reversal] Recomputing interest and fees for loan ${loanId}`);

    // Get loan details
    const loanResult = await client.query(
      'SELECT * FROM loans WHERE id = $1',
      [loanId]
    );

    if (loanResult.rows.length === 0) return;

    const loan = loanResult.rows[0];
    const effectiveDate = new Date(paymentEffectiveDate);
    const today = new Date();

    // Check if payment reversal makes loan delinquent
    if (loan.next_payment_date && new Date(loan.next_payment_date) < today) {
      const daysLate = Math.floor(
        (today.getTime() - new Date(loan.next_payment_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Apply late fee if grace period exceeded (typically 15 days)
      if (daysLate > 15) {
        const lateFee = 50.00; // Example fixed late fee
        await client.query(
          'UPDATE loans SET late_fee_balance = COALESCE(late_fee_balance, 0) + $1 WHERE id = $2',
          [lateFee, loanId]
        );
      }
    }

    // Recompute next payment date
    await client.query(
      `UPDATE loans 
       SET next_payment_date = 
         CASE 
           WHEN last_payment_date IS NULL THEN first_payment_date
           WHEN payment_frequency = 'monthly' THEN last_payment_date + INTERVAL '1 month'
           WHEN payment_frequency = 'biweekly' THEN last_payment_date + INTERVAL '2 weeks'
           ELSE next_payment_date
         END
       WHERE id = $1`,
      [loanId]
    );
  }

  /**
   * Step 5: Update loan status
   */
  private async updateLoanStatus(
    client: PoolClient,
    loanId: string
  ): Promise<void> {
    console.log(`[Reversal] Updating loan status for ${loanId}`);

    // Check if loan is now delinquent
    const statusResult = await client.query(`
      SELECT 
        next_payment_date,
        CASE 
          WHEN next_payment_date < CURRENT_DATE - INTERVAL '30 days' THEN 'delinquent'
          WHEN next_payment_date < CURRENT_DATE THEN 'late'
          ELSE 'current'
        END as payment_status
      FROM loans
      WHERE id = $1
    `, [loanId]);

    if (statusResult.rows.length > 0) {
      const status = statusResult.rows[0].payment_status;
      
      await client.query(
        'UPDATE loans SET payment_status = $1 WHERE id = $2',
        [status, loanId]
      );
    }
  }

  /**
   * Step 6: Send notifications
   */
  private async sendNotifications(
    client: PoolClient,
    paymentId: string,
    loanId: string,
    reason: string
  ): Promise<void> {
    console.log(`[Reversal] Sending notifications for payment ${paymentId}`);

    // Get loan and borrower details
    const loanResult = await client.query(`
      SELECT l.loan_number, b.email, b.first_name, b.last_name
      FROM loans l
      JOIN loan_borrowers lb ON l.id = lb.loan_id
      JOIN borrowers b ON lb.borrower_id = b.borrower_id
      WHERE l.id = $1 AND lb.is_primary = true
    `, [loanId]);

    if (loanResult.rows.length === 0) return;

    const borrower = loanResult.rows[0];

    // Emit notification events
    const borrowerNotification = this.messageFactory.create({
      schema: 'loanserve.notification.v1.send',
      data: {
        recipient: borrower.email,
        template: 'payment_returned',
        variables: {
          first_name: borrower.first_name,
          last_name: borrower.last_name,
          loan_number: borrower.loan_number,
          payment_id: paymentId,
          return_reason: reason
        },
        channel: 'email',
        priority: 'high'
      }
    });

    await IdempotencyService.addToOutbox(
      client,
      { type: 'notification', id: ulid() },
      borrowerNotification,
      'notify.high.payment.email'
    );

    // Also send investor notifications
    const investorNotification = this.messageFactory.create({
      schema: 'loanserve.notification.v1.send',
      data: {
        loan_id: loanId,
        payment_id: paymentId,
        template: 'investor_payment_reversal',
        channel: 'dashboard',
        priority: 'normal'
      }
    });

    await IdempotencyService.addToOutbox(
      client,
      { type: 'notification', id: ulid() },
      investorNotification,
      'notify.normal.investor.dashboard'
    );
  }

  /**
   * Handle ACH returns specifically
   */
  async handleACHReturn(
    envelope: PaymentEnvelope<{
      payment_id: string;
      return_code: string;
      return_reason: string;
    }>,
    client: PoolClient
  ): Promise<void> {
    const { payment_id, return_code, return_reason } = envelope.data;
    console.log(`[Reversal] Handling ACH return ${return_code} for payment ${payment_id}`);

    // Retryable return codes
    const retryableReturns = ['R01', 'R09']; // NSF, Uncollected funds
    const permanentReturns = ['R02', 'R07', 'R10', 'R16']; // Closed, Revoked, Unauthorized, Frozen

    if (retryableReturns.includes(return_code)) {
      // Schedule retry
      console.log(`[Reversal] Return code ${return_code} is retryable`);
      
      // TODO: Implement retry logic
      // For now, just reverse the payment
    } else if (permanentReturns.includes(return_code)) {
      // Ban payment method
      console.log(`[Reversal] Return code ${return_code} is permanent - banning payment method`);
      
      // TODO: Implement payment method banning
    }

    // Execute reversal
    const reversalData: ReversalData = {
      payment_id,
      return_code,
      return_reason,
      reversal_id: ulid()
    };

    const reversalEnvelope = this.messageFactory.createReply(envelope, {
      schema: 'loanserve.payment.v1.reversal.requested',
      data: reversalData
    });

    await this.executeReversal(reversalEnvelope, client);
  }

  /**
   * Update payment state
   */
  private async updatePaymentState(
    client: PoolClient,
    paymentId: string,
    fromState: PaymentState,
    toState: PaymentState,
    reason: string
  ): Promise<void> {
    await client.query(
      'UPDATE payment_transactions SET state = $1 WHERE payment_id = $2',
      [toState, paymentId]
    );

    await client.query(`
      INSERT INTO payment_state_transitions (
        payment_id, previous_state, new_state, occurred_at, actor, reason
      ) VALUES ($1, $2, $3, NOW(), $4, $5)
    `, [paymentId, fromState, toState, 'system', reason]);
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    // General reversal handler
    const reversalHandler = createIdempotentHandler(
      'payment-reversal',
      this.executeReversal.bind(this)
    );

    await this.rabbitmq.consume(
      {
        queue: 'payments.reversal',
        prefetch: 5,
        consumerTag: 'payment-reversal-consumer'
      },
      async (envelope: PaymentEnvelope<ReversalData>, msg) => {
        try {
          await reversalHandler(envelope);
          // Ack is handled automatically by enhanced service
        } catch (error) {
          console.error('[Reversal] Error processing reversal:', error);
          throw error; // Enhanced service will handle nack
        }
      }
    );

    // ACH return handler
    const achReturnHandler = createIdempotentHandler(
      'ach-return',
      this.handleACHReturn.bind(this)
    );

    await this.rabbitmq.consume(
      {
        queue: 'payments.returned',
        prefetch: 5,
        consumerTag: 'ach-return-consumer'
      },
      async (envelope: PaymentEnvelope<{ payment_id: string; return_code: string; return_reason: string }>, msg) => {
        try {
          await achReturnHandler(envelope);
          // Ack is handled automatically by enhanced service
        } catch (error) {
          console.error('[Reversal] Error processing ACH return:', error);
          throw error; // Enhanced service will handle nack
        }
      }
    );

    console.log('[Reversal] Payment reversal saga started');
  }
}