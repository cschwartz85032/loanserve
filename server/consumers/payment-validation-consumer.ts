/**
 * Payment Validation Consumer
 * Validates incoming payments from all sources
 */

import { PoolClient } from 'pg';
import { ulid } from 'ulid';
import {
  PaymentEnvelope,
  PaymentData,
  ACHPaymentData,
  WirePaymentData,
  CheckPaymentData,
  PaymentState
} from '../messaging/payment-envelope';
import { IdempotencyService, createIdempotentHandler } from '../services/payment-idempotency';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { getMessageFactory } from '../messaging/message-factory';
import { db } from '../db';

export class PaymentValidationConsumer {
  private rabbitmq = getEnhancedRabbitMQService();
  private messageFactory = getMessageFactory();

  /**
   * Main validation handler
   */
  async validatePayment(
    envelope: PaymentEnvelope<PaymentData>,
    client: PoolClient
  ): Promise<void> {
    const { data } = envelope;
    console.log(`[Validation] Processing payment ${data.payment_id} from ${data.source}`);

    try {
      // Check idempotency
      const idempotencyKey = IdempotencyService.generateIdempotencyKey(
        data.source,
        data
      );

      // Check if payment already exists
      const existing = await client.query(
        'SELECT payment_id, state FROM payment_transactions WHERE idempotency_key = $1',
        [idempotencyKey]
      );

      if (existing.rows.length > 0) {
        console.log(`[Validation] Duplicate payment detected: ${existing.rows[0].payment_id}`);
        return;
      }

      // Insert payment record with 'received' state
      console.log(`[Validation] Inserting payment with loan_id: ${data.loan_id} (type: ${typeof data.loan_id})`);
      
      await client.query(`
        INSERT INTO payment_transactions (
          payment_id, loan_id, source, external_ref, amount_cents,
          currency, received_at, effective_date, state, idempotency_key,
          created_by, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        data.payment_id,
        String(data.loan_id),  // Convert to string for varchar field
        data.source,
        data.external_ref,
        data.amount_cents,
        data.currency || 'USD',
        new Date(),
        envelope.effective_date || new Date().toISOString().split('T')[0],
        'received' as PaymentState,
        idempotencyKey,
        envelope.producer,
        JSON.stringify(envelope.data)
      ]);

      // Log state transition
      await this.logStateTransition(
        client,
        data.payment_id,
        null,
        'received',
        'system',
        'Payment received'
      );

      // Validate based on source
      const isValid = await this.validateBySource(envelope, client);

      if (isValid) {
        // Update state to validated
        await this.updatePaymentState(
          client,
          data.payment_id,
          'received',
          'validated'
        );

        // Emit validated event
        const validatedEnvelope = this.messageFactory.createReply(envelope, {
          schema: `loanserve.payment.v1.validated`,
          data: {
            ...data,
            validation_timestamp: new Date().toISOString()
          }
        });

        await IdempotencyService.addToOutbox(
          client,
          { type: 'payment', id: data.payment_id },
          validatedEnvelope,
          `payment.${data.source}.validated`
        );

        console.log(`[Validation] Payment ${data.payment_id} validated successfully`);
      } else {
        // Update state to rejected
        await this.updatePaymentState(
          client,
          data.payment_id,
          'received',
          'rejected'
        );

        console.log(`[Validation] Payment ${data.payment_id} rejected`);
      }
    } catch (error) {
      console.error(`[Validation] Error processing payment ${data.payment_id}:`, error);
      throw error;
    }
  }

  /**
   * Validate based on payment source
   */
  private async validateBySource(
    envelope: PaymentEnvelope<PaymentData>,
    client: PoolClient
  ): Promise<boolean> {
    const { data } = envelope;

    // Check loan exists and is active
    const loanResult = await client.query(
      `SELECT id, status, payment_amount, accept_partial_payments 
       FROM loans WHERE id = $1`,
      [data.loan_id]
    );

    if (loanResult.rows.length === 0) {
      console.log(`[Validation] Loan ${data.loan_id} not found`);
      return false;
    }

    const loan = loanResult.rows[0];
    if (loan.status === 'paid_off' || loan.status === 'charged_off') {
      console.log(`[Validation] Loan ${data.loan_id} is ${loan.status}`);
      return false;
    }

    // Check if partial payments are accepted
    if (loan.accept_partial_payments === false) {
      const expectedPaymentCents = Math.round(parseFloat(loan.payment_amount) * 100);
      if (data.amount_cents < expectedPaymentCents) {
        console.log(`[Validation] Partial payment rejected. Received ${data.amount_cents} cents, expected ${expectedPaymentCents} cents`);
        return false;
      }
    }

    // Source-specific validation
    switch (data.source) {
      case 'ach':
        return await this.validateACH(envelope as PaymentEnvelope<ACHPaymentData>, client);
      
      case 'wire':
        return await this.validateWire(envelope as PaymentEnvelope<WirePaymentData>, client);
      
      case 'check':
      case 'lockbox':
        return await this.validateCheck(envelope as PaymentEnvelope<CheckPaymentData>, client);
      
      case 'card':
        return await this.validateCard(envelope, client);
      
      case 'cashier':
      case 'money_order':
        return await this.validateCashierCheck(envelope, client);
      
      default:
        console.log(`[Validation] Unknown payment source: ${data.source}`);
        return false;
    }
  }

  /**
   * Validate ACH payment
   */
  private async validateACH(
    envelope: PaymentEnvelope<ACHPaymentData>,
    client: PoolClient
  ): Promise<boolean> {
    const { data } = envelope;

    // Validate routing number format (9 digits)
    if (!/^\d{9}$/.test(data.routing_number)) {
      console.log(`[Validation] Invalid ACH routing number`);
      return false;
    }

    // Check for blacklisted accounts (simplified)
    // In production, this would check against a blacklist table

    // Set return window tracking
    const returnWindowDays = this.getACHReturnWindowDays(data.sec_code);
    const windowExpiresAt = new Date();
    windowExpiresAt.setDate(windowExpiresAt.getDate() + returnWindowDays);

    await client.query(`
      INSERT INTO ach_return_windows (
        payment_id, return_code_class, window_expires_at, probe_scheduled
      ) VALUES ($1, $2, $3, false)
    `, [
      data.payment_id,
      data.sec_code,
      windowExpiresAt
    ]);

    return true;
  }

  /**
   * Get ACH return window based on SEC code
   */
  private getACHReturnWindowDays(secCode: string): number {
    switch (secCode) {
      case 'PPD':
      case 'CCD':
        return 2; // 2 business days for most returns
      case 'WEB':
      case 'TEL':
        return 60; // Extended for unauthorized returns
      default:
        return 5; // Conservative default
    }
  }

  /**
   * Validate wire payment
   */
  private async validateWire(
    envelope: PaymentEnvelope<WirePaymentData>,
    client: PoolClient
  ): Promise<boolean> {
    const { data } = envelope;

    // Verify wire reference exists
    if (!data.wire_ref) {
      console.log(`[Validation] Missing wire reference`);
      return false;
    }

    // In production, would validate against bank advice
    // For now, accept all wires with valid reference

    return true;
  }

  /**
   * Validate check payment
   */
  private async validateCheck(
    envelope: PaymentEnvelope<CheckPaymentData>,
    client: PoolClient
  ): Promise<boolean> {
    const { data } = envelope;

    // Check for stale date (> 180 days old)
    const issueDate = new Date(data.issue_date);
    const daysSinceIssue = Math.floor(
      (new Date().getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceIssue > 180) {
      console.log(`[Validation] Check is stale-dated`);
      return false;
    }

    // Check for post-dated
    if (issueDate > new Date()) {
      console.log(`[Validation] Check is post-dated`);
      return false;
    }

    // Check for duplicate
    const duplicateCheck = await client.query(`
      SELECT payment_id FROM payment_transactions
      WHERE source IN ('check', 'lockbox')
        AND metadata->>'check_number' = $1
        AND metadata->>'payer_account' = $2
        AND amount_cents = $3
        AND state NOT IN ('rejected', 'reversed')
    `, [
      data.check_number,
      data.payer_account,
      data.amount_cents
    ]);

    if (duplicateCheck.rows.length > 0) {
      console.log(`[Validation] Duplicate check detected`);
      return false;
    }

    return true;
  }

  /**
   * Validate card payment
   */
  private async validateCard(
    envelope: PaymentEnvelope<PaymentData>,
    client: PoolClient
  ): Promise<boolean> {
    // In production, would validate with payment processor
    // Check if cards are allowed for this loan type
    
    // For now, accept card payments under $10,000
    if (envelope.data.amount_cents > 1000000) { // $10,000 in cents
      console.log(`[Validation] Card payment exceeds limit`);
      return false;
    }

    return true;
  }

  /**
   * Validate cashier's check or money order
   */
  private async validateCashierCheck(
    envelope: PaymentEnvelope<PaymentData>,
    client: PoolClient
  ): Promise<boolean> {
    // Cashier's checks and money orders are generally low risk
    // Minimal validation required
    
    return true;
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

    await this.logStateTransition(
      client,
      paymentId,
      fromState,
      toState,
      'system',
      `State changed from ${fromState} to ${toState}`
    );
  }

  /**
   * Log state transition
   */
  private async logStateTransition(
    client: PoolClient,
    paymentId: string,
    previousState: PaymentState | null,
    newState: PaymentState,
    actor: string,
    reason: string
  ): Promise<void> {
    await client.query(`
      INSERT INTO payment_state_transitions (
        payment_id, previous_state, new_state, occurred_at, actor, reason
      ) VALUES ($1, $2, $3, NOW(), $4, $5)
    `, [paymentId, previousState, newState, actor, reason]);
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    const handler = createIdempotentHandler(
      'payment-validation',
      this.validatePayment.bind(this)
    );

    await this.rabbitmq.consume(
      { 
        queue: 'payments.validation',
        prefetch: 10,
        consumerTag: 'payment-validation-consumer'
      },
      async (envelope: PaymentEnvelope<PaymentData>, msg) => {
        try {
          await handler(envelope);
          // Ack is handled automatically by enhanced service
        } catch (error) {
          console.error('[Validation] Error processing message:', error);
          throw error; // Enhanced service will handle nack
        }
      }
    );

    console.log('[Validation] Payment validation consumer started');
  }
}