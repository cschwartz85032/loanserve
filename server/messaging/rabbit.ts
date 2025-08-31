import amqp, { ConfirmChannel, Connection, ConsumeMessage } from "amqplib";
import { z } from "zod";
import { AppConfig } from "../bootstrap/config";
import { currentCorrelationId } from "../bootstrap/logger";
import { MandatoryHeaders, MessageEnvelope } from "./contracts";
import { MessageEnvelope as SharedMessageEnvelope } from "../../shared/messaging/envelope";
import { buildEnvelopeSchema } from "../../shared/messaging/envelope-schema";
import { topologyManager } from "./topology"; // existing

export interface PublishOptions {
  exchange: string;
  routingKey: string;
  persistent?: boolean;      // defaults true
  mandatory?: boolean;       // defaults false
  headers?: Record<string, unknown>;
  priority?: number;
  expiration?: string;
  correlationId?: string;
  replyTo?: string;
}

export interface ConsumeOptions {
  queue: string;
  prefetch?: number;         // default from cfg.rabbitPrefetch
  noAck?: boolean;           // default false
  exclusive?: boolean;
  consumerTag?: string;
}

export class RabbitService {
  private cfg: AppConfig;
  private pubConn: Connection | null = null;
  private conConn: Connection | null = null;
  private pubCh: ConfirmChannel | null = null;

  constructor(cfg: AppConfig) { this.cfg = cfg; }

  async connect(): Promise<void> {
    const { amqpUrl, rabbitHeartbeatSec } = this.cfg;
    this.pubConn = await amqp.connect(amqpUrl, { heartbeat: rabbitHeartbeatSec });
    this.conConn = await amqp.connect(amqpUrl, { heartbeat: rabbitHeartbeatSec });
    this.pubConn.on("error", () => this.scheduleReconnect());
    this.conConn.on("error", () => this.scheduleReconnect());
    this.pubCh = await this.pubConn.createConfirmChannel();
    await topologyManager.applyTopology(this.pubCh);
    await this.setPrefetch(this.cfg.rabbitPrefetch);
  }

  private async setPrefetch(n: number) {
    const ch = await this.conConn!.createChannel();
    await ch.prefetch(n);
    ch.close();
  }

  private reconnecting = false;
  private attempts = 0;

  private scheduleReconnect() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    const doReconnect = async () => {
      try {
        if (this.pubCh) { try { await this.pubCh.close(); } catch {} }
        if (this.pubConn) { try { await this.pubConn.close(); } catch {} }
        if (this.conConn) { try { await this.conConn.close(); } catch {} }
        this.pubConn = this.conConn = this.pubCh = null;
        await this.connect();
        this.reconnecting = false;
        this.attempts = 0;
      } catch {
        this.attempts++;
        
        // Honor max reconnect attempts to prevent infinite loops
        if (this.attempts >= this.cfg.rabbitReconnectMax) {
          console.error(`[RabbitMQ] Max reconnection attempts (${this.cfg.rabbitReconnectMax}) reached, giving up`);
          this.reconnecting = false;
          return;
        }
        
        const delay = Math.min(this.cfg.rabbitReconnectBaseMs * Math.pow(1.5, this.attempts), 60000);
        console.log(`[RabbitMQ] Scheduling reconnection attempt ${this.attempts + 1} in ${delay}ms`);
        setTimeout(doReconnect, delay);
      }
    };
    setTimeout(doReconnect, 0);
  }

  async publish<T>(envelope: MessageEnvelope<T>, opts: PublishOptions): Promise<void> {
    if (!this.pubCh) throw new Error("Publisher channel not available");
    const buf = Buffer.from(JSON.stringify(envelope));
    const headers = {
      ...opts.headers,
      [MandatoryHeaders.MESSAGE_ID]: envelope.message_id,
      [MandatoryHeaders.CORRELATION_ID]: envelope.correlation_id,
      [MandatoryHeaders.SCHEMA]: envelope.schema,
      [MandatoryHeaders.TRACE_ID]: envelope.trace_id
    };
    await new Promise<void>((resolve, reject) => {
      this.pubCh!.publish(
        opts.exchange,
        opts.routingKey,
        buf,
        {
          persistent: opts.persistent ?? true,
          mandatory: opts.mandatory ?? false,
          headers,
          priority: opts.priority ?? envelope.priority,
          expiration: opts.expiration,
          correlationId: opts.correlationId ?? envelope.correlation_id,
          replyTo: opts.replyTo,
          timestamp: new Date(envelope.occurred_at).getTime()
        },
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  /**
   * Consume messages with runtime validation using Zod schemas
   * @param opts Consume options including queue and prefetch settings
   * @param dataSchema Zod schema for validating the message data payload
   * @param handler Message handler function
   * @returns Consumer tag
   */
  async consume<T>(opts: ConsumeOptions, dataSchema: z.ZodType<T>, handler: (env: SharedMessageEnvelope<T>, raw: ConsumeMessage) => Promise<void>): Promise<string> {
    if (!this.conConn) throw new Error("Consumer connection not available");
    const ch = await this.conConn.createChannel();
    await ch.prefetch(opts.prefetch ?? this.cfg.rabbitPrefetch);
    const envelopeSchema = buildEnvelopeSchema(dataSchema);
    
    const { consumerTag } = await ch.consume(opts.queue, async (msg) => {
      if (!msg) return;
      try {
        // Parse and validate the entire envelope with typed data
        const rawEnvelope = JSON.parse(msg.content.toString());
        const validatedEnvelope = envelopeSchema.parse(rawEnvelope);
        
        await handler(validatedEnvelope as SharedMessageEnvelope<T>, msg);
        if (!opts.noAck) ch.ack(msg);
      } catch (err) {
        console.error('[Rabbit] Message processing failed:', err);
        
        // If it's a validation error, log details and decide on retry strategy
        if (err instanceof z.ZodError) {
          console.error('[Rabbit] Envelope validation failed:', {
            queue: opts.queue,
            errors: err.errors,
            rawMessage: msg.content.toString().substring(0, 500) // First 500 chars for debugging
          });
        }
        
        // Reject message with requeue logic
        const redelivered = msg.fields.redelivered;
        ch.nack(msg, false, !redelivered); // Don't requeue if already redelivered once
      }
    }, { noAck: opts.noAck ?? false, exclusive: opts.exclusive ?? false, consumerTag: opts.consumerTag });

    return consumerTag;
  }

  async shutdown(): Promise<void> {
    console.log('[RabbitService] Shutting down...');
    
    // Stop reconnection attempts
    this.reconnecting = false;
    this.attempts = this.cfg.rabbitReconnectMax; // Prevent further reconnections
    
    try { 
      if (this.pubCh) {
        await this.pubCh.close(); 
        console.log('[RabbitService] Publisher channel closed');
      }
    } catch (e) {
      console.log('[RabbitService] Publisher channel close error (expected)');
    }
    
    try { 
      if (this.pubConn) {
        await this.pubConn.close(); 
        console.log('[RabbitService] Publisher connection closed');
      }
    } catch (e) {
      console.log('[RabbitService] Publisher connection close error (expected)');
    }
    
    try { 
      if (this.conConn) {
        await this.conConn.close(); 
        console.log('[RabbitService] Consumer connection closed');
      }
    } catch (e) {
      console.log('[RabbitService] Consumer connection close error (expected)');
    }
    
    this.pubCh = null; 
    this.pubConn = null; 
    this.conConn = null;
    
    console.log('[RabbitService] Shutdown complete');
  }
}