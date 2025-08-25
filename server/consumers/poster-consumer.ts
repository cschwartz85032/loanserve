import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';
import { posterService } from '../services/poster-service';
import { PaymentEnvelope } from '../services/payment-envelope';
import { WaterfallResult } from '../services/rules-engine';

export class PosterConsumer {
  private readonly consumerTag = 'poster-consumer';
  private rabbitmqService = getEnhancedRabbitMQService();

  async start(): Promise<void> {
    console.log('[Poster] Starting poster consumer');

    try {
      await this.rabbitmqService.consume(
        {
          queue: 'q.post',
          consumerTag: this.consumerTag,
          prefetch: 10
        },
        async (envelope) => {
          const message = envelope.payload as {
            envelope: PaymentEnvelope;
            waterfall: WaterfallResult;
            postingDecision: { shouldPost: boolean; reason: string };
          };

          const { 
            envelope: paymentEnvelope, 
            waterfall, 
            postingDecision 
          } = message;

          console.log(`[Poster] Processing payment for loan ${paymentEnvelope.borrower?.loan_id}`);
          console.log(`[Poster] Posting decision: ${postingDecision.shouldPost} - ${postingDecision.reason}`);
          console.log(`[Poster] Allocation: F=${waterfall.xF}, I=${waterfall.xI}, P=${waterfall.xP}, E=${waterfall.xE}, S=${waterfall.suspense}`);

          try {
            // Post payment with transactional outbox
            const result = await posterService.postFromRulesEngine(
              paymentEnvelope,
              waterfall,
              postingDecision
            );

            if (result.posted) {
              console.log(`[Poster] ✓ Payment ${result.paymentId} posted successfully`);
              
              // Publish ledger.posted event
              await this.rabbitmqService.publish(
                {
                  message_id: envelope.message_id,
                  correlation_id: envelope.correlation_id,
                  schema: 'ledger.posted.v1',
                  payload: {
                    paymentId: result.paymentId,
                    envelope: paymentEnvelope,
                    waterfall,
                    timestamp: new Date().toISOString()
                  },
                  timestamp: new Date().toISOString()
                },
                {
                  exchange: 'x.ledger',
                  routingKey: 'ledger.posted'
                }
              );
            } else {
              console.log(`[Poster] Payment ${result.paymentId} already exists (idempotent)`);
            }

            return { success: true, paymentId: result.paymentId };
          } catch (error: any) {
            console.error('[Poster] Error posting payment:', error);
            
            // Publish to exception queue
            await this.rabbitmqService.publish(
              {
                message_id: envelope.message_id,
                correlation_id: envelope.correlation_id,
                schema: 'exception.posting.failed.v1',
                payload: {
                  envelope: paymentEnvelope,
                  waterfall,
                  postingDecision,
                  error: error.message,
                  timestamp: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
              },
              {
                exchange: 'x.exception',
                routingKey: 'exception.posting.failed'
              }
            );

            throw error;
          }
        }
      );

      console.log('[Poster] Consumer started successfully');
    } catch (error) {
      console.error('[Poster] Failed to start consumer:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('[Poster] Stopping poster consumer');
    await this.rabbitmqService.cancelConsumer(this.consumerTag);
    console.log('[Poster] Consumer stopped');
  }
}

// Export singleton instance
export const posterConsumer = new PosterConsumer();