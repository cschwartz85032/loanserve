/**
 * Message Factory - Creates standardized message envelopes
 */

import { ulid } from 'ulid';
import { randomUUID } from 'crypto';
import { MessageEnvelope, MessageSchema, MessagePriority } from '../../shared/messaging/envelope.js';

export interface MessageFactoryOptions {
  producer: string;
  producer_instance?: string;
  tenant_id?: string;
  user_id?: string;
  trace_id?: string;
}

export class MessageFactory {
  private readonly options: MessageFactoryOptions;
  private readonly producer_version: string;

  constructor(options: MessageFactoryOptions) {
    this.options = options;
    // Get version from package.json or environment
    this.producer_version = process.env.APP_VERSION || '1.0.0';
  }

  /**
   * Create a new message envelope
   */
  createMessage<T>(
    schema: MessageSchema | string,
    data: T,
    options?: Partial<MessageEnvelope<T>>
  ): MessageEnvelope<T> {
    const now = new Date().toISOString();
    
    const envelope: MessageEnvelope<T> = {
      // Required fields
      schema,
      message_id: ulid(),
      correlation_id: options?.correlation_id || randomUUID(),
      causation_id: options?.causation_id || options?.correlation_id || randomUUID(),
      occurred_at: options?.occurred_at || now,
      producer: `${this.options.producer}@${this.producer_version}`,
      version: 1,
      data,
      
      // Optional fields from factory options
      ...(this.options.tenant_id && { tenant_id: this.options.tenant_id }),
      ...(this.options.user_id && { user_id: this.options.user_id }),
      ...(this.options.producer_instance && { producer_instance: this.options.producer_instance }),
      ...(this.options.trace_id && { trace_id: this.options.trace_id }),
      
      // Optional fields from message options
      ...(options?.idempotency_key && { idempotency_key: options.idempotency_key }),
      ...(options?.priority !== undefined && { priority: options.priority }),
      ...(options?.ttl && { ttl: options.ttl }),
      ...(options?.retry_count !== undefined && { retry_count: options.retry_count }),
      ...(options?.headers && { headers: options.headers }),
    };

    return envelope;
  }

  /**
   * Create a message with high priority
   */
  createCriticalMessage<T>(
    schema: MessageSchema | string,
    data: T,
    options?: Partial<MessageEnvelope<T>>
  ): MessageEnvelope<T> {
    return this.createMessage(schema, data, {
      ...options,
      priority: MessagePriority.CRITICAL,
    });
  }

  /**
   * Create a reply message maintaining correlation
   */
  createReply<T>(
    originalMessage: MessageEnvelope,
    schema: MessageSchema | string,
    data: T,
    options?: Partial<MessageEnvelope<T>>
  ): MessageEnvelope<T> {
    return this.createMessage(schema, data, {
      ...options,
      correlation_id: originalMessage.correlation_id,
      causation_id: originalMessage.message_id,
      trace_id: originalMessage.trace_id,
    });
  }

  /**
   * Create an error message for dead letter queue
   */
  createErrorMessage<T>(
    originalMessage: MessageEnvelope<T>,
    error: Error,
    retryable: boolean = false
  ): MessageEnvelope<any> {
    return this.createMessage('loanserve.v1.error', {
      original_message: originalMessage,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      retryable,
      failed_at: new Date().toISOString(),
    }, {
      correlation_id: originalMessage.correlation_id,
      causation_id: originalMessage.message_id,
      trace_id: originalMessage.trace_id,
    });
  }

  /**
   * Generate idempotency key for business operations
   */
  static generateIdempotencyKey(...parts: (string | number)[]): string {
    return parts.filter(Boolean).join('-');
  }

  /**
   * Parse message schema to extract domain and version
   */
  static parseSchema(schema: string): {
    domain: string;
    version: string;
    entity: string;
    action: string;
  } {
    const parts = schema.split('.');
    if (parts.length < 4) {
      throw new Error(`Invalid schema format: ${schema}`);
    }
    
    return {
      domain: parts[0],
      version: parts[1],
      entity: parts[2],
      action: parts.slice(3).join('.'),
    };
  }

  /**
   * Create batch of messages with same correlation
   */
  createBatch<T>(
    schema: MessageSchema | string,
    items: T[],
    options?: Partial<MessageEnvelope<T>>
  ): MessageEnvelope<T>[] {
    const correlation_id = randomUUID();
    
    return items.map(data => 
      this.createMessage(schema, data, {
        ...options,
        correlation_id,
        priority: options?.priority ?? MessagePriority.BATCH,
      })
    );
  }

  /**
   * Update factory context (e.g., after user login)
   */
  updateContext(updates: Partial<MessageFactoryOptions>): void {
    Object.assign(this.options, updates);
  }
}

// Singleton instance for the application
let defaultFactory: MessageFactory;

export function getMessageFactory(): MessageFactory {
  if (!defaultFactory) {
    defaultFactory = new MessageFactory({
      producer: 'loanserve-api',
      producer_instance: process.env.INSTANCE_ID || ulid(),
    });
  }
  return defaultFactory;
}

export function setMessageFactory(factory: MessageFactory): void {
  defaultFactory = factory;
}