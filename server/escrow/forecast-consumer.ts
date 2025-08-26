/**
 * Escrow Forecast Consumer
 * 
 * Processes forecast generation requests from RabbitMQ
 */

import type { ConsumeMessage } from 'amqplib';
import { getEnhancedRabbitMQService as getRabbitMQService } from '../services/rabbitmq-enhanced';
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
    
    const rabbitmq = getRabbitMQService();
    
    try {
      await rabbitmq.consume<EscrowForecastRequest>(
        {
          queue: 'q.forecast',
          prefetch: 10,
          consumerTag: this.consumerTag
        },
        this.handleMessage.bind(this)
      );
      
      console.log('[EscrowForecast] Consumer started successfully');
    } catch (error) {
      console.error('[EscrowForecast] Failed to start consumer:', error);
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    console.log('[EscrowForecast] Stopping forecast consumer');
    const rabbitmq = getRabbitMQService();
    await rabbitmq.cancel(this.consumerTag);
  }
  
  private async handleMessage(envelope: MessageEnvelope<EscrowForecastRequest>, message: ConsumeMessage): Promise<void> {
    const startTime = Date.now();
    const rabbitmq = getRabbitMQService();
    
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
      await rabbitmq.publish({
        exchange: 'escrow.events',
        routingKey: 'forecast.generated',
        message: response,
        options: {
          correlationId: request.correlation_id,
          persistent: true
        }
      });
      
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