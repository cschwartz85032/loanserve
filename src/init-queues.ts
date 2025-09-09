import amqp from 'amqplib';
import { Exchanges, Queues, retry, dlq, declareTopology } from './queues/topology';
import { initEtlConsumers } from './queues/etl/etl-consumer';
import { startEtlScheduler, stopEtlScheduler } from './queues/etl/etl-scheduler';

const retryDelays = ['10s', '1m', '5m']; // define delays

async function assertQueue(channel: amqp.Channel, queue: string) {
  await channel.assertQueue(queue, { durable: true });
}

let globalConnection: amqp.Connection | null = null;

export async function initQueues() {
  const rabbitmqUrl = process.env.CLOUDAMQP_URL || process.env.RABBITMQ_URL || 'amqp://localhost';
  const conn: amqp.Connection = await amqp.connect(rabbitmqUrl);
  globalConnection = conn;
  const channel = await conn.createChannel();

  console.log('[Queue Init] Initializing legacy queue system...');

  // Declare legacy exchanges
  await channel.assertExchange(Exchanges.COMMANDS, 'direct', { durable: true });
  await channel.assertExchange(Exchanges.EVENTS,   'topic',  { durable: true });

  // Legacy queue setup (preserve backwards compatibility)
  const legacyQueues = [
    Queues.Import, Queues.Ocr, Queues.Datapoint, Queues.Conflict,
    Queues.Disbursement, Queues.Escrow, Queues.Ucdp, Queues.Flood,
    Queues.Hoi, Queues.Title
  ];

  // For each legacy queue, declare primary + retry + DLQ
  for (const queue of legacyQueues) {
    await channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': dlq(queue),
      },
    });
    // Bind primary queue to its exchange/routing key
    await channel.bindQueue(queue, Exchanges.COMMANDS, queue);

    // Declare retry queues with TTL
    for (const delay of retryDelays) {
      const [value, unit] = delay.match(/(\d+)(s|m)/)!.slice(1);
      const ttl = Number(value) * (unit === 's' ? 1000 : 60_000);
      const retryQueue = retry(queue, delay);
      await channel.assertQueue(retryQueue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': queue,
          'x-message-ttl': ttl,
        },
      });
    }

    // Declare DLQ
    await channel.assertQueue(dlq(queue), { durable: true });
  }

  console.log('[Queue Init] Legacy queues initialized');

  // Initialize modern queue topology (additive, no breaking changes)
  console.log('[Queue Init] Initializing modern queue system...');
  await declareTopology(channel);
  console.log('[Queue Init] Modern topology declared');

  // Create publish function for consumers
  const publishFunction = async (exchange: string, routingKey: string, message: any) => {
    const messageBuffer = Buffer.from(JSON.stringify(message));
    await channel.publish(exchange, routingKey, messageBuffer, {
      persistent: true,
      messageId: message.correlationId,
      correlationId: message.correlationId,
      timestamp: Date.now(),
      headers: {
        tenantId: message.tenantId,
        schemaVersion: message.schemaVersion
      }
    });
  };

  // Initialize modern ETL consumers (replaces timer-based ETL)
  await initEtlConsumers(conn as any, publishFunction);
  console.log('[Queue Init] ETL consumers initialized');

  // Start ETL scheduler (replaces setInterval timer)
  startEtlScheduler(publishFunction);
  console.log('[Queue Init] ETL scheduler started');

  console.log('[Queue Init] ✅ Both legacy and modern queue systems initialized');

  // Keep connection open for consumers
  // await channel.close();
  // await conn.close();

  // Graceful shutdown handling
  process.on('SIGINT', async () => {
    console.log('[Queue Init] Shutting down gracefully...');
    stopEtlScheduler();
    if (channel) await channel.close();
    if (conn) await conn.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('[Queue Init] Shutting down gracefully...');
    stopEtlScheduler();
    if (channel) await channel.close();
    if (conn) await conn.close();
    process.exit(0);
  });
}

if (require.main === module) {
  initQueues().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}