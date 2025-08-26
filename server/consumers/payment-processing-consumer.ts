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

      // Allocate payment
      const allocation = await this.allocationEngine.allocate(
        client,
        payment.loan_id,
        payment.amount_cents,
        effectiveDate,
        false // Not escrow-only
      );

      console.log(`[Processing] Allocated payment to ${allocation.allocations.length} targets`);

      // Post to ledger (as pending)
      await this.postToLedger(
        client,
        data.payment_id,
        payment.loan_id,
        allocation,
        effectiveDate,
        true // pending
      );

      // Update loan balances
      await this.updateLoanBalances(
        client,
        payment.loan_id,
        allocation
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

      // Emit processed event
      const processedEnvelope = this.messageFactory.createReply(
        envelope,
        `loanserve.payment.v1.processed`,
        {
          ...data,
          allocation,
          processing_timestamp: new Date().toISOString()
        }
      );

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
   * Post allocations to ledger
   */
  private async postToLedger(
    client: PoolClient,
    paymentId: string,
    loanId: string,
    allocation: any,
    effectiveDate: Date,
    pending: boolean
  ): Promise<void> {
    // Credit cash account
    await client.query(`
      INSERT INTO payment_ledger (
        loan_id, payment_id, account, debit_cents, credit_cents,
        pending, effective_date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      loanId,
      paymentId,
      'cash',
      allocation.total_allocated,
      0,
      pending,
      effectiveDate
    ]);

    // Debit allocation accounts
    for (const alloc of allocation.allocations) {
      await client.query(`
        INSERT INTO payment_ledger (
          loan_id, payment_id, account, debit_cents, credit_cents,
          pending, effective_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        loanId,
        paymentId,
        alloc.account,
        0,
        alloc.amount_cents,
        pending,
        effectiveDate
      ]);
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
   * Start consuming messages
   */
  async start(): Promise<void> {
    const handler = createIdempotentHandler(
      'payment-processing',
      this.processPayment.bind(this)
    );

    // Hotfix: Create versioned queue to avoid argument conflicts
    // This avoids touching existing queues that were created with different arguments
    try {
      const amqp = await import('amqplib');
      const conn = await amqp.connect(process.env.CLOUDAMQP_URL || '');
      const channel = await conn.createChannel();
      
      // Assert exchange (idempotent)
      await channel.assertExchange('payments.topic', 'topic', { durable: true });
      
      // Create new versioned queue with canonical arguments
      await channel.assertQueue('q.payments.processing.v2', {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'payments.dlq',
          'x-delivery-limit': 6
        }
      });
      
      // Bind all validated payment routing keys
      await channel.bindQueue('q.payments.processing.v2', 'payments.topic', 'payment.card.validated');
      await channel.bindQueue('q.payments.processing.v2', 'payments.topic', 'payment.ach.validated');
      await channel.bindQueue('q.payments.processing.v2', 'payments.topic', 'payment.wire.validated');
      
      console.log('[Processing] Created and bound q.payments.processing.v2 with proper topology');
      await channel.close();
      await conn.close();
    } catch (error) {
      console.error('[Processing] Failed to setup queue:', error);
      // Continue anyway - setup might already be complete
    }

    await this.rabbitmq.consume(
      {
        queue: 'q.payments.processing.v2',  // Use the new versioned queue
        prefetch: 32,  // Increase prefetch for better throughput
        consumerTag: 'payment-processing-consumer'
      },
      async (envelope: PaymentEnvelope<PaymentData>, msg) => {
        console.log('[Processing] Received message from queue:', {
          message_id: envelope.message_id,
          schema: envelope.schema,
          payment_id: envelope.data?.payment_id
        });
        try {
          await handler(envelope);
          // Ack is handled automatically by enhanced service
        } catch (error) {
          console.error('[Processing] Error processing message:', error);
          throw error; // Enhanced service will handle nack
        }
      }
    );

    console.log('[Processing] Payment processing consumer started on q.payments.processing.v2');
  }
}