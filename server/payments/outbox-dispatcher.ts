/**
 * Outbox dispatcher - Phase 2
 * Publishes unpublished events from outbox table
 */

import { Pool } from 'pg';
import { RabbitService } from '../messaging/rabbit';
import { PaymentsRepo } from './repo';
import { MessageEnvelope } from './types';

export class OutboxDispatcher {
  private repo: PaymentsRepo;
  private rabbitService: RabbitService;
  private intervalId?: NodeJS.Timeout;
  private isRunning = false;
  
  constructor(
    private pool: Pool,
    rabbitService: RabbitService
  ) {
    this.repo = new PaymentsRepo(pool);
    this.rabbitService = rabbitService;
  }
  
  async start(): Promise<void> {
    console.log('[OutboxDispatcher] Starting outbox dispatcher');
    
    // Process immediately on start
    await this.processOutbox();
    
    // Then process every 5 seconds
    this.intervalId = setInterval(async () => {
      if (!this.isRunning) {
        await this.processOutbox();
      }
    }, 5000);
    
    console.log('[OutboxDispatcher] Dispatcher started successfully');
  }
  
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.log('[OutboxDispatcher] Dispatcher stopped');
  }
  
  private async processOutbox(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      // Get unpublished events
      const events = await this.repo.getUnpublishedOutbox(100);
      
      if (events.length === 0) {
        return;
      }
      
      console.log(`[OutboxDispatcher] Processing ${events.length} unpublished events`);
      
      let publishedCount = 0;
      let errorCount = 0;
      
      for (const event of events) {
        try {
          // Determine exchange and routing key based on topic
          const { exchange, routingKey } = this.getRoutingInfo(event.topic);
          
          // Create message envelope
          const envelope: MessageEnvelope<any> = {
            headers: {
              'x-message-id': this.generateUUID(),
              'x-correlation-id': event.payload_json.payment_id || this.generateUUID(),
              'x-schema': event.topic,
              'x-trace-id': this.generateUUID(),
              'x-timestamp': new Date().toISOString(),
            },
            payload: event.payload_json,
          };
          
          // Publish to RabbitMQ
          await this.rabbitService.publish(exchange, routingKey, envelope);
          
          // Mark as published
          await this.repo.markOutboxPublished(event.event_id);
          
          publishedCount++;
          
        } catch (error) {
          console.error(`[OutboxDispatcher] Error publishing event ${event.event_id}:`, error);
          errorCount++;
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(
        `[OutboxDispatcher] Processed ${publishedCount} events (${errorCount} errors) in ${duration}ms`
      );
      
    } catch (error) {
      console.error('[OutboxDispatcher] Error processing outbox:', error);
    } finally {
      this.isRunning = false;
    }
  }
  
  private getRoutingInfo(topic: string): { exchange: string; routingKey: string } {
    // Map topics to exchanges and routing keys
    switch (topic) {
      case 'payment.received.v1':
        return { exchange: 'payments.validation', routingKey: 'received.v1' };
      
      case 'payment.validated.v1':
        return { exchange: 'payments.saga', routingKey: 'validated.v1' };
      
      case 'payment.posted.v1':
        return { exchange: 'payments.events', routingKey: 'payment.posted.v1' };
      
      case 'payment.failed.v1':
        return { exchange: 'payments.events', routingKey: 'payment.failed.v1' };
      
      default:
        // Default to events exchange
        return { exchange: 'payments.events', routingKey: topic };
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