/**
 * Escrow Analysis Consumer
 * 
 * Processes escrow analysis requests from RabbitMQ
 */

import type { ConsumeMessage } from 'amqplib';
import * as crypto from 'crypto';
import { rabbitmqClient } from '../services/rabbitmq-unified';
import { EscrowAnalysisService } from './analysis-service';
import type { EscrowAnalysisRequest, EscrowAnalysisResponse } from './types';
import type { MessageEnvelope } from '../messaging/contracts';

export class EscrowAnalysisConsumer {
  private analysisService: EscrowAnalysisService;
  private consumerTag: string = 'escrow-analysis-consumer';
  
  constructor() {
    this.analysisService = new EscrowAnalysisService();
  }
  
  async start(): Promise<void> {
    console.log('[EscrowAnalysis] Starting analysis consumer');
    
    const rabbitmq = rabbitmqClient;
    
    try {
      await rabbitmq.consume<EscrowAnalysisRequest>(
        'q.escrow.analysis.v2',
        this.handleMessage.bind(this),
        {
          prefetch: 5,
          consumerTag: this.consumerTag
        }
      );
      
      console.log('[EscrowAnalysis] Consumer started successfully');
    } catch (error) {
      console.error('[EscrowAnalysis] Failed to start consumer:', error);
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    console.log('[EscrowAnalysis] Stopping analysis consumer');
    // Consumer will be stopped when the service disconnects
  }
  
  private async handleMessage(envelope: MessageEnvelope<EscrowAnalysisRequest>, message: ConsumeMessage): Promise<void> {
    const startTime = Date.now();
    const rabbitmq = rabbitmqClient;
    
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
      const responseEnvelope: MessageEnvelope<EscrowAnalysisResponse> = {
        message_id: crypto.randomUUID(),
        schema: 'escrow.analysis.completed.v1',
        correlation_id: request.correlation_id,
        payload: response,
        timestamp: new Date().toISOString(),
        priority: 5
      };
      
      await rabbitmq.publishJSON(
        'escrow.events',
        'analysis.completed',
        responseEnvelope,
        {
          correlationId: request.correlation_id
        }
      );
      
      // Generate statement if requested
      if (request.generate_statement) {
        console.log(`[EscrowAnalysis] Generating statement for loan ${request.loan_id}`);
        
        const statementEnvelope: MessageEnvelope<any> = {
          message_id: crypto.randomUUID(),
          schema: 'escrow.statement.generate.v1',
          correlation_id: `${request.correlation_id}_statement`,
          payload: {
            loan_id: request.loan_id,
            analysis_id: response.analysis_id,
            as_of_date: request.as_of_date,
            correlation_id: `${request.correlation_id}_statement`
          },
          timestamp: new Date().toISOString(),
          priority: 5
        };
        
        await rabbitmq.publishJSON(
          'escrow.events',
          'statement.generate',
          statementEnvelope
        );
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