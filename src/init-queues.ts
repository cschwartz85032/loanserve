import amqp from 'amqplib';
import { Exchanges, Queues, retry, dlq } from './queues/topology';

const retryDelays = ['10s', '1m', '5m']; // define delays

async function assertQueue(channel: amqp.Channel, queue: string) {
  await channel.assertQueue(queue, { durable: true });
}

export async function initQueues() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL!);
  const channel = await conn.createChannel();

  // Declare exchanges
  await channel.assertExchange(Exchanges.COMMANDS, 'direct', { durable: true });
  await channel.assertExchange(Exchanges.EVENTS,   'topic',  { durable: true });

  // For each queue, declare primary + retry + DLQ
  for (const queue of Object.values(Queues)) {
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

  await channel.close();
  await conn.close();
}

if (require.main === module) {
  initQueues().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}