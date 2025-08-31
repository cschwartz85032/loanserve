import { ConsumeMessage } from 'amqplib';
import { rulesEngine, PaymentRail, WaterfallInput } from '../services/rules-engine';
import { rabbitmqClient } from '../services/rabbitmq-unified';
import { PaymentEventService } from '../services/payment-event';
import { db } from '../db';
import { loans, payments } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { PaymentEnvelope } from '../services/payment-envelope';

export class RulesEngineConsumer {
  private consumerTag: string | null = null;
  private paymentEventService: PaymentEventService;
  private rabbitmq = rabbitmqClient;

  constructor() {
    this.paymentEventService = new PaymentEventService();
  }

  // Parse message content
  private parseMessage(msg: ConsumeMessage): any {
    try {
      const content = msg.content.toString();
      return JSON.parse(content);
    } catch (error) {
      console.error('[RulesEngine] Failed to parse message:', error);
      return null;
    }
  }

  // Get payment rail from envelope
  private getPaymentRail(envelope: PaymentEnvelope): PaymentRail {
    const methodMap: Record<string, PaymentRail> = {
      'ach': 'ach',
      'check': 'check',
      'wire': 'wire',
      'realtime': 'realtime',
      'card': 'card',
      'paypal': 'paypal',
      'venmo': 'venmo',
      'zelle': 'zelle',
      'cash': 'cash'
    };

    const method = envelope.method?.toLowerCase() || 'ach';
    return methodMap[method] || 'ach';
  }

  // Get event type from message
  private getEventType(message: any): string {
    // Could be from Column webhook events or payment status
    if (message.event?.type) {
      return message.event.type;
    }
    if (message.status) {
      return message.status;
    }
    return 'pending';
  }

  // Process payment through rules engine
  private async processPayment(envelope: PaymentEnvelope, policy: any, context: any): Promise<void> {
    const loanId = envelope.borrower?.loan_id;
    
    if (!loanId) {
      console.error('[RulesEngine] No loan ID in envelope');
      throw new Error('Missing loan ID');
    }

    try {
      // Get loan details
      const loan = await db
        .select()
        .from(loans)
        .where(eq(loans.id, parseInt(loanId)))
        .limit(1);

      if (loan.length === 0) {
        throw new Error(`Loan ${loanId} not found`);
      }

      const loanData = loan[0];

      // Calculate due amounts
      const due = await rulesEngine.calculateDueAmounts(parseInt(loanId));

      // Build waterfall input
      const waterfallInput: WaterfallInput = {
        amountCents: envelope.amount_cents,
        due,
        policy: {
          allowPrincipal: policy !== 'charged_off' && policy !== 'default',
          allowInterest: policy !== 'charged_off',
          allowFees: true,
          allowEscrow: policy !== 'default' && policy !== 'charged_off',
          defaultLoan: policy === 'default' || policy === 'charged_off'
        }
      };

      // Apply waterfall
      const allocation = rulesEngine.applyWaterfall(waterfallInput);

      // Validate result
      const isValid = rulesEngine.validateWaterfallResult(waterfallInput, allocation);
      
      if (!isValid) {
        console.error('[RulesEngine] Waterfall validation failed');
        throw new Error('Waterfall validation failed');
      }

      // Store in payment record if payment exists
      if (envelope.payment_id) {
        await rulesEngine.storeAllocation(
          parseInt(envelope.payment_id),
          allocation,
          envelope.correlation_id
        );
      }

      // Log event
      await this.paymentEventService.createEvent({
        type: 'rules.waterfall_applied',
        eventTime: new Date(),
        actorType: 'system',
        actorId: 'rules-engine-consumer',
        correlationId: envelope.correlation_id,
        data: {
          loanId,
          policy,
          waterfallInput,
          allocation,
          isValid
        }
      });

      // Publish to posting queue if should post
      const rail = this.getPaymentRail(envelope);
      const event = this.getEventType(context);
      const postingDecision = rulesEngine.getPostingDecision(rail, event);

      if (postingDecision.shouldPost) {
        await this.rabbitmq.publishJSON(
          'payments.topic',
          'payment.post',
          {
            env: envelope,
            allocation,
            postingDecision,
            context
          }
        );
        console.log('[RulesEngine] Published to posting queue');
      } else {
        console.log(`[RulesEngine] Not posting: ${postingDecision.reason}`);
        
        // If delayed, schedule for later
        if (postingDecision.delayUntil) {
          await this.scheduleDelayedPosting(envelope, allocation, postingDecision.delayUntil);
        }
        
        // If manual review required, create exception
        if (postingDecision.requiresManualReview) {
          await this.createManualReviewException(envelope, allocation, postingDecision);
        }
      }

    } catch (error) {
      console.error('[RulesEngine] Error processing payment:', error);
      throw error;
    }
  }

  // Schedule delayed posting
  private async scheduleDelayedPosting(
    envelope: PaymentEnvelope,
    allocation: any,
    delayUntil: Date
  ): Promise<void> {
    // Calculate delay in milliseconds
    const delayMs = delayUntil.getTime() - Date.now();
    
    // Use RabbitMQ delayed message plugin or schedule job
    console.log(`[RulesEngine] Scheduling posting for ${delayUntil.toISOString()}`);
    
    // For now, just log - would implement actual scheduling
    await this.paymentEventService.createEvent({
      type: 'rules.posting_delayed',
      eventTime: new Date(),
      actorType: 'system',
      actorId: 'rules-engine-consumer',
      correlationId: envelope.correlation_id,
      data: {
        envelope,
        allocation,
        delayUntil: delayUntil.toISOString(),
        delayMs
      }
    });
  }

  // Create manual review exception
  private async createManualReviewException(
    envelope: PaymentEnvelope,
    allocation: any,
    postingDecision: any
  ): Promise<void> {
    await this.paymentEventService.createEvent({
      type: 'rules.manual_review_required',
      eventTime: new Date(),
      actorType: 'system',
      actorId: 'rules-engine-consumer',
      correlationId: envelope.correlation_id,
      data: {
        envelope,
        allocation,
        postingDecision,
        reason: postingDecision.reason
      }
    });
  }

  // Start consumer
  async start(): Promise<void> {
    console.log('[RulesEngine] Starting rules engine consumer');

    // The queue and bindings are created by the topology manager
    // Consume from the rules posting queue
    const consumerTag = await this.rabbitmq.consume(
      'q.rules.post',
      async (message: any, msg: any) => {
        if (!msg) return;

        const startTime = Date.now();

        try {
          // Message contains envelope, policy, and context
          const { env: envelope, policy, context } = message;

          if (!envelope || !policy) {
            console.error('[RulesEngine] Invalid message format');
            return;
          }

          console.log(`[RulesEngine] Processing payment with policy: ${policy}`);

          // Process through rules engine
          await this.processPayment(envelope, policy, context);

          const duration = Date.now() - startTime;
          console.log(`[RulesEngine] Processed in ${duration}ms`);

        } catch (error: any) {
          console.error('[RulesEngine] Processing error:', error);

          // Check if temporary error
          if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.log('[RulesEngine] Temporary error, message will be redelivered');
            throw error; // Throw to trigger requeue
          } else {
            // Permanent error, log it (will be sent to DLQ)
            console.error('[RulesEngine] Permanent error:', error);
          }
        }
      },
      {
        prefetch: 10,
        consumerTag: 'rules-engine-consumer'
      }
    );

    this.consumerTag = consumerTag;
    console.log('[RulesEngine] Consumer started successfully');
  }

  // Stop consumer
  async stop(): Promise<void> {
    if (this.consumerTag) {
      await this.rabbitmq.cancelConsumer(this.consumerTag);
      this.consumerTag = null;
      console.log('[RulesEngine] Consumer stopped');
    }
  }
}