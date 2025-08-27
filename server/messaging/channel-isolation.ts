import * as amqp from 'amqplib';

/**
 * Execute a function with an isolated admin channel that auto-closes
 * This prevents one failed declaration from cascading to other operations
 */
export async function withAdminChannel<T>(
  conn: amqp.Connection,
  fn: (ch: amqp.ConfirmChannel) => Promise<T>
): Promise<T> {
  const ch = await conn.createConfirmChannel();
  try {
    // Small prefetch for admin operations
    await ch.prefetch(1);
    return await fn(ch);
  } finally {
    try {
      await ch.close();
    } catch (err) {
      // Channel may already be closed, that's OK
    }
  }
}

/**
 * Safely assert a queue with conflict handling
 */
export async function assertQueueSafe(
  conn: amqp.Connection,
  name: string,
  options: amqp.Options.AssertQueue
): Promise<{ ok: boolean; conflict?: boolean; error?: any }> {
  return withAdminChannel(conn, async (ch) => {
    try {
      await ch.assertQueue(name, options);
      console.log(`[RabbitMQ] Queue declared: ${name}`);
      return { ok: true };
    } catch (err: any) {
      if (err?.code === 406) {
        console.warn(
          `⚠️  [RabbitMQ] CRITICAL: Queue ${name} skipped due to argument conflict!
   This queue exists with different arguments and cannot be declared.
   Run 'npm run migrate-queues' to safely migrate conflicting queues.`
        );
        return { ok: false, conflict: true, error: err };
      }
      throw err;
    }
  });
}

/**
 * Safely bind a queue to an exchange with conflict handling
 */
export async function bindQueueSafe(
  conn: amqp.Connection,
  queueName: string,
  exchange: string,
  routingKey: string
): Promise<{ ok: boolean; conflict?: boolean; error?: any }> {
  return withAdminChannel(conn, async (ch) => {
    try {
      await ch.bindQueue(queueName, exchange, routingKey);
      console.log(`[RabbitMQ] Bound ${queueName} to ${exchange} with key ${routingKey}`);
      return { ok: true };
    } catch (err: any) {
      if (err?.code === 406 || err?.code === 404) {
        console.warn(`[RabbitMQ] Failed to bind ${queueName}: ${err.message}`);
        return { ok: false, conflict: true, error: err };
      }
      throw err;
    }
  });
}

/**
 * Safely assert an exchange
 */
export async function assertExchangeSafe(
  conn: amqp.Connection,
  name: string,
  type: string,
  options: amqp.Options.AssertExchange
): Promise<{ ok: boolean; error?: any }> {
  return withAdminChannel(conn, async (ch) => {
    try {
      await ch.assertExchange(name, type, options);
      console.log(`[RabbitMQ] Exchange declared: ${name} (${type})`);
      return { ok: true };
    } catch (err: any) {
      console.error(`[RabbitMQ] Failed to declare exchange ${name}: ${err.message}`);
      return { ok: false, error: err };
    }
  });
}

/**
 * Check if a queue exists and get its definition
 */
export async function checkQueue(
  conn: amqp.Connection,
  name: string
): Promise<{ exists: boolean; messageCount?: number; consumerCount?: number }> {
  return withAdminChannel(conn, async (ch) => {
    try {
      const result = await ch.checkQueue(name);
      return {
        exists: true,
        messageCount: result.messageCount,
        consumerCount: result.consumerCount,
      };
    } catch (err: any) {
      if (err?.code === 404) {
        return { exists: false };
      }
      throw err;
    }
  });
}

/**
 * Delete a queue if it exists and is empty
 */
export async function deleteQueueIfEmpty(
  conn: amqp.Connection,
  name: string
): Promise<{ deleted: boolean; reason?: string }> {
  return withAdminChannel(conn, async (ch) => {
    try {
      const check = await checkQueue(conn, name);
      if (!check.exists) {
        return { deleted: false, reason: 'Queue does not exist' };
      }
      
      if (check.messageCount && check.messageCount > 0) {
        return { deleted: false, reason: `Queue has ${check.messageCount} messages` };
      }
      
      if (check.consumerCount && check.consumerCount > 0) {
        return { deleted: false, reason: `Queue has ${check.consumerCount} consumers` };
      }
      
      await ch.deleteQueue(name);
      console.log(`[RabbitMQ] Deleted empty queue: ${name}`);
      return { deleted: true };
    } catch (err: any) {
      console.error(`[RabbitMQ] Failed to delete queue ${name}: ${err.message}`);
      return { deleted: false, reason: err.message };
    }
  });
}