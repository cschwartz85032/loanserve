/**
 * Escrow Forecast Consumer
 * 
 * Processes forecast generation requests from RabbitMQ
 */

import type { ConsumeMessage } from 'amqplib';
import { rabbitmqClient } from '../services/rabbitmq-unified';
import { EscrowForecastService } from './forecast-service';
import type { EscrowForecastRequest, EscrowForecastResponse, MessageEnvelope } from './types';

export class EscrowForecastConsumer {
  private forecastService: EscrowForecastService;
  private consumerTag: string = 'escrow-forecast-consumer';
  
  constructor() {
    this.forecastService = new EscrowForecastService();
  }
  
  async start(): Promise<void> {
    console.log('[EscrowForecast] Starting forecast consumer');
    
    const rabbitmq = rabbitmqClient;
    
    try {
      await rabbitmq.consume<EscrowForecastRequest>(
        'q.forecast.v2',
        this.handleMessage.bind(this),
        {
          prefetch: 10,
          consumerTag: this.consumerTag
        }
      );
      
      console.log('[EscrowForecast] Consumer started successfully');
    } catch (error) {
      console.error('[EscrowForecast] Failed to start consumer:', error);
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    console.log('[EscrowForecast] Stopping forecast consumer');
    await rabbitmqClient.cancelConsumer(this.consumerTag);
  }
  
  private async handleMessage(envelope: MessageEnvelope<EscrowForecastRequest>, message: ConsumeMessage): Promise<void> {
    const startTime = Date.now();
    const rabbitmq = rabbitmqClient;
    
    try {
      // Extract request from envelope
      const request = envelope.payload;
      
      console.log(`[EscrowForecast] Processing forecast request for loan ${request.loan_id}`);
      
      // Validate request
      if (!request.loan_id || !request.as_of_date || !request.correlation_id) {
        throw new Error('Invalid forecast request: missing required fields');
      }
      
      // Generate forecast
      const response = await this.forecastService.generateForecast(request);
      
      // Publish response to escrow.events exchange
      await rabbitmq.publishJSON(
        'escrow.events',
        'forecast.generated',
        response,
        {
          correlationId: request.correlation_id
        }
      );
      
      const duration = Date.now() - startTime;
      console.log(`[EscrowForecast] Forecast generated for loan ${request.loan_id} in ${duration}ms`);
      
      // Message is automatically acknowledged by the enhanced service on successful processing
      
    } catch (error) {
      console.error('[EscrowForecast] Error processing message:', error);
      
      // The enhanced service handles retries and DLQ automatically based on error classification
      throw error; // Re-throw to trigger the service's error handling
    }
  }
}