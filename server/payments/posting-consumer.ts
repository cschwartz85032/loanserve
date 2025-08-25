/**
 * Payment posting consumer - Phase 2
 * Posts validated payments to the ledger using AccountingService
 */

import { ConsumeMessage } from 'amqplib';
import { Pool } from 'pg';
import { RabbitService } from '../messaging/rabbit';
import { PaymentsRepo } from './repo';
import { AccountingService } from '../services/accounting-service';
import { MessageEnvelope, PaymentValidated, PaymentPosted, PaymentFailed, Allocation } from './types';

export class PostingConsumer {
  private repo: PaymentsRepo;
  private rabbitService: RabbitService;
  private accountingService: AccountingService;
  
  constructor(
    private pool: Pool,
    rabbitService: RabbitService
  ) {
    this.repo = new PaymentsRepo(pool);
    this.rabbitService = rabbitService;
    this.accountingService = new AccountingService(process.env.DATABASE_URL!);
  }
  
  async start(): Promise<void> {
    console.log('[PostingConsumer] Starting payment posting consumer');
    
    await this.rabbitService.consume(
      'q.payments.validated',
      async (msg: ConsumeMessage) => {
        await this.handleMessage(msg);
      },
      {
        consumerTag: 'posting-consumer',
        prefetch: Number(process.env.RABBIT_PREFETCH) || 5,
      }
    );
    
    console.log('[PostingConsumer] Consumer started successfully');
  }
  
  private async handleMessage(msg: ConsumeMessage): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Parse message
      const envelope: MessageEnvelope<PaymentValidated> = JSON.parse(msg.content.toString());
      const payment = envelope.payload;
      
      // Post payment to ledger
      const postingResult = await this.postPayment(payment);
      
      if (postingResult.success) {
        // Store posting result
        await this.repo.withTx(async (client) => {
          await this.repo.insertPosting(client, postingResult.posted!);
          
          // Add to outbox
          await this.repo.addToOutbox(
            client,
            'payment.posted.v1',
            postingResult.posted
          );
        });
        
        // Publish posted event
        const postedMessage: MessageEnvelope<PaymentPosted> = {
          headers: {
            'x-message-id': this.generateUUID(),
            'x-correlation-id': envelope.headers['x-correlation-id'],
            'x-schema': 'payment.posted.v1',
            'x-trace-id': envelope.headers['x-trace-id'],
            'x-timestamp': new Date().toISOString(),
          },
          payload: postingResult.posted!,
        };
        
        await this.rabbitService.publish(
          'payments.events',
          'payment.posted.v1',
          postedMessage
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
            reason: postingResult.error || 'Failed to post payment',
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
      console.log(`[PostingConsumer] Payment ${payment.payment_id} posted in ${duration}ms`);
      
    } catch (error) {
      console.error('[PostingConsumer] Error processing message:', error);
      
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
  
  private async postPayment(payment: PaymentValidated): Promise<{
    success: boolean;
    posted?: PaymentPosted;
    error?: string;
  }> {
    try {
      // Apply payment using accounting service
      const result = await this.accountingService.processPayment(
        payment.loan_id,
        Number(payment.amount_minor) / 100, // Convert minor units to dollars
        payment.effective_date,
        payment.payment_id // Use payment ID as gateway transaction ID
      );
      
      // Transform result to PaymentPosted
      const allocations: Allocation[] = [];
      
      // Map allocations from result
      for (const alloc of result.allocations) {
        if (alloc.bucket === 'fees' && alloc.amountCents > 0) {
          allocations.push({
            bucket: 'fees_due',
            amount_minor: BigInt(alloc.amountCents),
          });
        } else if (alloc.bucket === 'interest_past_due' && alloc.amountCents > 0) {
          allocations.push({
            bucket: 'interest_past_due',
            amount_minor: BigInt(alloc.amountCents),
          });
        } else if (alloc.bucket === 'interest_current' && alloc.amountCents > 0) {
          allocations.push({
            bucket: 'interest_current',
            amount_minor: BigInt(alloc.amountCents),
          });
        } else if (alloc.bucket === 'principal' && alloc.amountCents > 0) {
          allocations.push({
            bucket: 'principal',
            amount_minor: BigInt(alloc.amountCents),
          });
        } else if (alloc.bucket === 'escrow' && alloc.amountCents > 0) {
          allocations.push({
            bucket: 'escrow',
            amount_minor: BigInt(alloc.amountCents),
          });
        }
      }
      
      // Get current balances from ledger
      const balances = await this.pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN account_id = 'loan_principal' THEN balance_minor ELSE 0 END), 0) as principal_minor,
          COALESCE(SUM(CASE WHEN account_id = 'interest_receivable' THEN balance_minor ELSE 0 END), 0) as interest_receivable_minor,
          COALESCE(SUM(CASE WHEN account_id = 'escrow_liability' THEN balance_minor ELSE 0 END), 0) as escrow_liability_minor,
          COALESCE(SUM(CASE WHEN account_id = 'fees_receivable' THEN balance_minor ELSE 0 END), 0) as fees_receivable_minor
        FROM ledger_balance 
        WHERE entity_type = 'loan' AND entity_id = $1
      `, [payment.loan_id]);
      
      const posted: PaymentPosted = {
        payment_id: payment.payment_id,
        loan_id: payment.loan_id,
        event_id: result.eventId,
        effective_date: payment.effective_date,
        applied: allocations,
        new_balances: {
          principal_minor: BigInt(balances.rows[0]?.principal_minor || 0),
          interest_receivable_minor: BigInt(balances.rows[0]?.interest_receivable_minor || 0),
          escrow_liability_minor: BigInt(balances.rows[0]?.escrow_liability_minor || 0),
          fees_receivable_minor: BigInt(balances.rows[0]?.fees_receivable_minor || 0),
          cash_minor: BigInt(0),
        },
      };
      
      return {
        success: true,
        posted,
      };
      
    } catch (error) {
      console.error('[PostingConsumer] Error posting payment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}