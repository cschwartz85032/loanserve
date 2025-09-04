import amqp, { ConsumeMessage } from 'amqplib';
import { withTenantClient } from '../db/withTenantClient';
import { recordProcessedMessage } from '../db/processedMessages';
import { dlq, retry } from './topology';
import { collectMetrics } from '../metrics/metrics';

export interface ConsumerOptions {
  queue: string;
  handler: (payload: any, helpers: { client: any, msg: ConsumeMessage }) => Promise<void>;
}

export async function startConsumer(conn: amqp.Connection, opts: ConsumerOptions) {
  const channel = await conn.createConfirmChannel();
  await channel.prefetch(5);

  channel.consume(opts.queue, async (msg) => {
    if (!msg) return;
    const startTime = Date.now();
    let status: 'success' | 'transient' | 'fatal' = 'success';

    try {
      const content = JSON.parse(msg.content.toString());
      const { messageId, tenantId } = content;
      if (!messageId || !tenantId) throw new Error('Missing messageId/tenantId');

      // Idempotency check
      const firstTime = await recordProcessedMessage(messageId, tenantId);
      if (!firstTime) {
        channel.ack(msg);
        collectMetrics(opts.queue, 'success', Date.now() - startTime);
        return;
      }

      // Execute handler in tenant context
      await withTenantClient(tenantId, async (client) => {
        await opts.handler(content, { client, msg });
      });

      channel.ack(msg);
    } catch (err: any) {
      console.error(`[${opts.queue}] error`, err);

      // Decide fatal vs transient
      const isFatal = err.message?.includes('schema') || err.message?.includes('invalid');
      status = isFatal ? 'fatal' : 'transient';

      const route = isFatal ? dlq(opts.queue) : retry(opts.queue, '10s');
      // Republishing to retry/dlq
      channel.publish('', route, msg.content, { persistent: true });
      channel.nack(msg, false, false);
    } finally {
      collectMetrics(opts.queue, status, Date.now() - startTime);
    }
  });
}