/**
 * Escrow Disbursement Consumer
 * 
 * Processes disbursement scheduling requests from RabbitMQ
 */

import type { ConsumeMessage } from 'amqplib';
import { getEnhancedRabbitMQService as getRabbitMQService } from '../services/rabbitmq-enhanced';
import { EscrowDisbursementService } from './disbursement-service';
import type { 
  EscrowDisbursementScheduleRequest, 
  EscrowDisbursementScheduleResponse,
  MessageEnvelope 
} from './types';

export class EscrowDisbursementConsumer {
  private disbursementService: EscrowDisbursementService;
  private consumerTag: string = 'escrow-disbursement-consumer';
  
  constructor() {
    this.disbursementService = new EscrowDisbursementService();
  }
  
  async start(): Promise<void> {
    console.log('[EscrowDisbursement] Starting disbursement consumer');
    
    const rabbitmq = getRabbitMQService();
    
    try {
      await rabbitmq.consume<EscrowDisbursementScheduleRequest>(
        {
          queue: 'q.schedule.disbursement.v2',
          prefetch: 10,
          consumerTag: this.consumerTag
        },
        this.handleMessage.bind(this)
      );
      
      console.log('[EscrowDisbursement] Consumer started successfully');
    } catch (error) {
      console.error('[EscrowDisbursement] Failed to start consumer:', error);
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    console.log('[EscrowDisbursement] Stopping disbursement consumer');
    const rabbitmq = getRabbitMQService();
    await rabbitmq.cancel(this.consumerTag);
  }
  
  private async handleMessage(envelope: MessageEnvelope<EscrowDisbursementScheduleRequest>, message: ConsumeMessage): Promise<void> {
    const startTime = Date.now();
    const rabbitmq = getRabbitMQService();
    
    try {
      // Extract request from envelope
      const request = envelope.payload;
      
      console.log(`[EscrowDisbursement] Processing schedule request for loan ${request.loan_id}`);
      
      // Validate request
      if (!request.loan_id || !request.effective_date || !request.correlation_id) {
        throw new Error('Invalid disbursement schedule request: missing required fields');
      }
      
      // Schedule disbursements
      const response = await this.disbursementService.scheduleDisbursements(request);
      
      // Publish response to escrow.events exchange
      await rabbitmq.publish({
        exchange: 'escrow.events',
        routingKey: 'disbursement.scheduled',
        message: response,
        options: {
          correlationId: request.correlation_id,
          persistent: true
        }
      });
      
      const duration = Date.now() - startTime;
      console.log(`[EscrowDisbursement] Scheduled ${response.scheduled_count} disbursements for loan ${request.loan_id} in ${duration}ms`);
      
      // Message is automatically acknowledged by the enhanced service on successful processing
      
    } catch (error) {
      console.error('[EscrowDisbursement] Error processing message:', error);
      
      // The enhanced service handles retries and DLQ automatically based on error classification
      throw error; // Re-throw to trigger the service's error handling
    }
  }
}