import amqp, { ConfirmChannel, Connection, ConsumeMessage } from "amqplib";
import { AppConfig } from "../bootstrap/config";
import { currentCorrelationId } from "../bootstrap/logger";
import { MandatoryHeaders, MessageEnvelope } from "./contracts";
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
        const delay = Math.min(this.cfg.rabbitReconnectBaseMs * Math.pow(1.5, this.attempts), 60000);
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
          timestamp: envelope.timestamp_unix_ms
        },
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  async consume<T>(opts: ConsumeOptions, handler: (env: MessageEnvelope<T>, raw: ConsumeMessage) => Promise<void>): Promise<string> {
    if (!this.conConn) throw new Error("Consumer connection not available");
    const ch = await this.conConn.createChannel();
    await ch.prefetch(opts.prefetch ?? this.cfg.rabbitPrefetch);
    const { consumerTag } = await ch.consume(opts.queue, async (msg) => {
      if (!msg) return;
      try {
        const env = JSON.parse(msg.content.toString()) as MessageEnvelope<T>;
        await handler(env, msg);
        if (!opts.noAck) ch.ack(msg);
      } catch (err) {
        const redelivered = msg.fields.redelivered;
        ch.nack(msg, false, !redelivered);
      }
    }, { noAck: opts.noAck ?? false, exclusive: opts.exclusive ?? false, consumerTag: opts.consumerTag });

    return consumerTag;
  }

  async shutdown(): Promise<void> {
    try { if (this.pubCh) await this.pubCh.close(); } catch {}
    try { if (this.pubConn) await this.pubConn.close(); } catch {}
    try { if (this.conConn) await this.conConn.close(); } catch {}
    this.pubCh = null; this.pubConn = null; this.conConn = null;
  }
}