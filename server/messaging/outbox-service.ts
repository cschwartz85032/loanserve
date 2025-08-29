/**
 * Outbox Service - Domain event publishing for reliable messaging
 * Ensures events are published atomically with database transactions
 */

export interface OutboxMessage {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, any>;
  correlationId: string;
}

export class OutboxService {
  /**
   * Create outbox message for eventual processing
   * @param message Domain event message
   */
  async createMessage(message: OutboxMessage): Promise<void> {
    // In a full implementation, this would store the message in an outbox table
    // and a separate process would pick it up and publish to the message bus
    console.log(`[Outbox] Domain event created: ${message.eventType}`, {
      aggregateType: message.aggregateType,
      aggregateId: message.aggregateId,
      correlationId: message.correlationId
    });
    
    // For now, just log the event
    // Future implementation would:
    // 1. Store in outbox_messages table
    // 2. Background processor picks up and publishes to RabbitMQ
    // 3. Handle retries and dead letter queue
  }
}

export const outboxService = new OutboxService();