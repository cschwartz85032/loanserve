/**
 * Payment validator consumer - Phase 2
 * Validates payment data and determines allocation strategy
 */

import { ConsumeMessage } from 'amqplib';
import { Pool } from 'pg';
import { RabbitService } from '../messaging/rabbit';
import { PaymentsRepo } from './repo';
import { MessageEnvelope, PaymentReceived, PaymentValidated, PaymentFailed } from './types';

export class ValidatorConsumer {
  private repo: PaymentsRepo;
  private rabbitService: RabbitService;
  
  constructor(
    private pool: Pool,
    rabbitService: RabbitService
  ) {
    this.repo = new PaymentsRepo(pool);
    this.rabbitService = rabbitService;
  }
  
  async start(): Promise<void> {
    console.log('[ValidatorConsumer] Starting payment validator consumer');
    
    await this.rabbitService.consume(
      'q.payments.received',
      async (msg: ConsumeMessage) => {
        await this.handleMessage(msg);
      },
      {
        consumerTag: 'validator-consumer',
        prefetch: Number(process.env.RABBIT_PREFETCH) || 10,
      }
    );
    
    console.log('[ValidatorConsumer] Consumer started successfully');
  }
  
  private async handleMessage(msg: ConsumeMessage): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Parse message
      const envelope: MessageEnvelope<PaymentReceived> = JSON.parse(msg.content.toString());
      const payment = envelope.payload;
      
      // Validate payment
      const validation = await this.validatePayment(payment);
      
      // Store validation result
      await this.repo.withTx(async (client) => {
        await this.repo.upsertValidation(client, {
          payment_id: payment.payment_id,
          is_valid: validation.is_valid,
          reason: validation.reason,
          effective_date: payment.effective_date,
          allocation_hints: validation.allocation_hints,
        });
      });
      
      if (validation.is_valid) {
        // Publish validated event
        const validatedMessage: MessageEnvelope<PaymentValidated> = {
          headers: {
            'x-message-id': this.generateUUID(),
            'x-correlation-id': envelope.headers['x-correlation-id'],
            'x-schema': 'payment.validated.v1',
            'x-trace-id': envelope.headers['x-trace-id'],
            'x-timestamp': new Date().toISOString(),
          },
          payload: {
            payment_id: payment.payment_id,
            loan_id: payment.loan_id,
            amount_minor: payment.amount_minor,
            currency: payment.currency,
            effective_date: payment.effective_date,
            allocation_hints: validation.allocation_hints,
          },
        };
        
        await this.rabbitService.publish(
          'payments.saga',
          'validated.v1',
          validatedMessage
        );
      } else {
        // Publish failure event
        const failedMessage: MessageEnvelope<PaymentFailed> = {
          headers: {
            'x-message-id': this.generateUUID(),
            'x-correlation-id': envelope.headers['x-correlation-id'],
            'x-schema': 'payment.failed.v1',
            'x-trace-id': envelope.headers['x-trace-id'],
            'x-timestamp': new Date().toISOString(),
          },
          payload: {
            payment_id: payment.payment_id,
            loan_id: payment.loan_id,
            reason: validation.reason || 'Validation failed',
            retry_after: validation.retry_after,
          },
        };
        
        await this.rabbitService.publish(
          'payments.events',
          'payment.failed.v1',
          failedMessage
        );
      }
      
      // Acknowledge message
      await this.rabbitService.ack(msg);
      
      const duration = Date.now() - startTime;
      console.log(`[ValidatorConsumer] Payment ${payment.payment_id} validated in ${duration}ms`);
      
    } catch (error) {
      console.error('[ValidatorConsumer] Error processing message:', error);
      
      // Check if redelivered
      const redelivered = msg.fields.redelivered;
      if (redelivered) {
        // Send to DLQ
        await this.rabbitService.nack(msg, false, false);
      } else {
        // Retry
        await this.rabbitService.nack(msg, false, true);
      }
    }
  }
  
  private async validatePayment(payment: PaymentReceived): Promise<{
    is_valid: boolean;
    reason?: string;
    allocation_hints: any;
    retry_after?: number;
  }> {
    // Check loan exists
    const loanResult = await this.pool.query(
      'SELECT id, status, original_amount FROM loans WHERE id = $1',
      [payment.loan_id]
    );
    
    if (loanResult.rows.length === 0) {
      return {
        is_valid: false,
        reason: `Loan ${payment.loan_id} not found`,
        allocation_hints: {},
      };
    }
    
    const loan = loanResult.rows[0];
    
    // Check loan status
    if (loan.status === 'paid_off' || loan.status === 'charged_off') {
      return {
        is_valid: false,
        reason: `Loan ${payment.loan_id} is ${loan.status}`,
        allocation_hints: {},
      };
    }
    
    // Check amount is positive
    if (payment.amount_minor <= 0n) {
      return {
        is_valid: false,
        reason: 'Payment amount must be positive',
        allocation_hints: {},
      };
    }
    
    // Check currency
    if (payment.currency !== 'USD') {
      return {
        is_valid: false,
        reason: `Unsupported currency: ${payment.currency}`,
        allocation_hints: {},
      };
    }
    
    // Check effective date is not in future
    const effectiveDate = new Date(payment.effective_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (effectiveDate > today) {
      return {
        is_valid: false,
        reason: 'Effective date cannot be in the future',
        allocation_hints: {},
        retry_after: Math.ceil((effectiveDate.getTime() - today.getTime()) / 1000),
      };
    }
    
    // Payment is valid - determine allocation hints
    const allocation_hints: any = {};
    
    // Check if this is a scheduled payment amount
    const scheduleResult = await this.pool.query(`
      SELECT sr.scheduled_principal_minor + sr.scheduled_interest_minor as total_scheduled
      FROM schedule_row sr
      JOIN schedule_plan sp ON sp.plan_id = sr.plan_id
      WHERE sp.loan_id = $1 AND sp.active = true
        AND sr.due_date <= $2::date
      ORDER BY sr.due_date DESC
      LIMIT 1
    `, [payment.loan_id, payment.effective_date]);
    
    if (scheduleResult.rows.length > 0) {
      const scheduledAmount = BigInt(scheduleResult.rows[0].total_scheduled);
      if (payment.amount_minor === scheduledAmount) {
        allocation_hints.payment_type = 'scheduled';
      } else if (payment.amount_minor > scheduledAmount) {
        allocation_hints.payment_type = 'overpayment';
      } else {
        allocation_hints.payment_type = 'partial';
      }
    }
    
    return {
      is_valid: true,
      allocation_hints,
    };
  }
  
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}