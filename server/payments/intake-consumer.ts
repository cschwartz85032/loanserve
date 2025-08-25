/**
 * Payment intake consumer - Phase 2
 * Receives raw payment events and persists to intake table
 */

import { ConsumeMessage } from 'amqplib';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import { RabbitService } from '../messaging/rabbit';
import { PaymentsRepo } from './repo';
import { MessageEnvelope, PaymentReceived } from './types';

export class IntakeConsumer {
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
    console.log('[IntakeConsumer] Starting payment intake consumer');
    
    await this.rabbitService.consume(
      'q.payments.intake',
      async (msg: ConsumeMessage) => {
        await this.handleMessage(msg);
      },
      {
        consumerTag: 'intake-consumer',
        prefetch: Number(process.env.RABBIT_PREFETCH) || 10,
      }
    );
    
    console.log('[IntakeConsumer] Consumer started successfully');
  }
  
  private async handleMessage(msg: ConsumeMessage): Promise<void> {
    const startTime = Date.now();
    const messageId = msg.properties.messageId || 'unknown';
    
    try {
      // Parse message
      const envelope: MessageEnvelope<any> = JSON.parse(msg.content.toString());
      const rawPayload = envelope.payload;
      
      // Generate payment ID and idempotency key
      const paymentId = this.generateUUID();
      const idempotencyKey = this.generateIdempotencyKey(
        rawPayload.loan_id,
        rawPayload.gateway_txn_id,
        rawPayload.amount_minor || rawPayload.amount_cents,
        rawPayload.currency || 'USD',
        rawPayload.effective_date || new Date().toISOString().split('T')[0]
      );
      
      // Check for duplicate via idempotency key
      const existing = await this.repo.getIntakeByIdempotencyKey(idempotencyKey);
      if (existing) {
        console.log(`[IntakeConsumer] Duplicate payment detected: ${idempotencyKey}`);
        await this.rabbitService.ack(msg);
        return;
      }
      
      // Transform to PaymentReceived structure
      const payment: PaymentReceived = {
        payment_id: paymentId,
        loan_id: parseInt(rawPayload.loan_id),
        method: rawPayload.method || 'other',
        amount_minor: BigInt(rawPayload.amount_minor || rawPayload.amount_cents || 0),
        currency: 'USD',
        received_at: rawPayload.received_at || new Date().toISOString(),
        gateway_txn_id: rawPayload.gateway_txn_id,
        source: rawPayload.source || rawPayload.provider || 'unknown',
        idempotency_key: idempotencyKey,
        effective_date: rawPayload.effective_date || new Date().toISOString().split('T')[0],
      };
      
      // Store in database
      await this.repo.withTx(async (client) => {
        await this.repo.insertIntake(client, {
          ...payment,
          raw_payload: rawPayload,
        });
      });
      
      // Publish to validation queue
      const validationMessage: MessageEnvelope<PaymentReceived> = {
        headers: {
          'x-message-id': this.generateUUID(),
          'x-correlation-id': envelope.headers['x-correlation-id'] || paymentId,
          'x-schema': 'payment.received.v1',
          'x-trace-id': envelope.headers['x-trace-id'] || this.generateUUID(),
          'x-timestamp': new Date().toISOString(),
        },
        payload: payment,
      };
      
      await this.rabbitService.publish(
        'payments.validation',
        'received.v1',
        validationMessage
      );
      
      // Acknowledge message
      await this.rabbitService.ack(msg);
      
      const duration = Date.now() - startTime;
      console.log(`[IntakeConsumer] Payment ${paymentId} processed in ${duration}ms`);
      
    } catch (error) {
      console.error(`[IntakeConsumer] Error processing message ${messageId}:`, error);
      
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
  
  private generateUUID(): string {
    // Simple UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  private generateIdempotencyKey(
    loanId: string | number,
    gatewayTxnId: string,
    amountMinor: string | number | bigint,
    currency: string,
    effectiveDate: string
  ): string {
    const data = `${loanId}|${gatewayTxnId}|${amountMinor}|${currency}|${effectiveDate}`;
    return createHash('sha256').update(data).digest('hex');
  }
}