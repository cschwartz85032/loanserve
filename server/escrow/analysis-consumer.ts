/**
 * Escrow Analysis Consumer
 * 
 * Processes escrow analysis requests from RabbitMQ
 */

import type { ConsumeMessage } from 'amqplib';
import { getEnhancedRabbitMQService as getRabbitMQService } from '../services/rabbitmq-enhanced';
import { EscrowAnalysisService } from './analysis-service';
import type { EscrowAnalysisRequest, EscrowAnalysisResponse, MessageEnvelope } from './types';

export class EscrowAnalysisConsumer {
  private analysisService: EscrowAnalysisService;
  private consumerTag: string = 'escrow-analysis-consumer';
  
  constructor() {
    this.analysisService = new EscrowAnalysisService();
  }
  
  async start(): Promise<void> {
    console.log('[EscrowAnalysis] Starting analysis consumer');
    
    const rabbitmq = getRabbitMQService();
    
    try {
      await rabbitmq.consume<EscrowAnalysisRequest>(
        {
          queue: 'q.escrow.analysis',
          prefetch: 5, // Lower prefetch for analysis operations
          consumerTag: this.consumerTag
        },
        this.handleMessage.bind(this)
      );
      
      console.log('[EscrowAnalysis] Consumer started successfully');
    } catch (error) {
      console.error('[EscrowAnalysis] Failed to start consumer:', error);
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    console.log('[EscrowAnalysis] Stopping analysis consumer');
    const rabbitmq = getRabbitMQService();
    await rabbitmq.cancel(this.consumerTag);
  }
  
  private async handleMessage(envelope: MessageEnvelope<EscrowAnalysisRequest>, message: ConsumeMessage): Promise<void> {
    const startTime = Date.now();
    const rabbitmq = getRabbitMQService();
    
    try {
      // Extract request from envelope
      const request = envelope.payload;
      
      console.log(`[EscrowAnalysis] Processing analysis request for loan ${request.loan_id}`);
      
      // Validate request
      if (!request.loan_id || !request.as_of_date || !request.correlation_id) {
        throw new Error('Invalid analysis request: missing required fields');
      }
      
      // Perform analysis
      const response = await this.analysisService.performAnalysis(request);
      
      // Publish response to escrow.events exchange
      await rabbitmq.publish({
        exchange: 'escrow.events',
        routingKey: 'analysis.completed',
        message: response,
        options: {
          correlationId: request.correlation_id,
          persistent: true
        }
      });
      
      // Generate statement if requested
      if (request.generate_statement) {
        console.log(`[EscrowAnalysis] Generating statement for loan ${request.loan_id}`);
        
        await rabbitmq.publish({
          exchange: 'escrow.events',
          routingKey: 'statement.generate',
          message: {
            loan_id: request.loan_id,
            analysis_id: response.analysis_id,
            as_of_date: request.as_of_date,
            correlation_id: `${request.correlation_id}_statement`
          },
          options: {
            persistent: true
          }
        });
      }
      
      const duration = Date.now() - startTime;
      console.log(`[EscrowAnalysis] Analysis completed for loan ${request.loan_id} in ${duration}ms`);
      
      // Message is automatically acknowledged by the enhanced service on successful processing
      
    } catch (error) {
      console.error('[EscrowAnalysis] Error processing message:', error);
      
      // The enhanced service handles retries and DLQ automatically based on error classification
      throw error; // Re-throw to trigger the service's error handling
    }
  }
}