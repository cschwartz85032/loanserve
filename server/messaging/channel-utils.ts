import * as amqplib from 'amqplib';

/**
 * Execute an operation on an isolated admin channel that auto-closes after completion.
 * This prevents channel failures from affecting other operations.
 */
export async function withAdminChannel<T>(
  conn: amqplib.Connection, 
  fn: (ch: amqplib.ConfirmChannel) => Promise<T>
): Promise<T> {
  const ch = await conn.createConfirmChannel();
  try {
    // Small prefetch for admin operations
    await ch.prefetch(1);
    return await fn(ch);
  } finally {
    try { 
      await ch.close(); 
    } catch {
      // Channel might already be closed, ignore
    }
  }
}

/**
 * Safely assert a queue with conflict handling.
 * Returns whether the queue was successfully declared.
 */
export async function assertQueueSafe(
  conn: amqplib.Connection, 
  queueName: string, 
  options: amqplib.Options.AssertQueue
): Promise<{ ok: boolean; conflict?: boolean; error?: any }> {
  return withAdminChannel(conn, async ch => {
    try {
      await ch.assertQueue(queueName, options);
      console.log(`[RabbitMQ] Queue declared: ${queueName}`);
      return { ok: true };
    } catch (err: any) {
      if (err?.code === 406) {
        console.warn(`⚠️  [RabbitMQ] Queue ${queueName} has conflicting arguments, skipping declaration`);
        return { ok: false, conflict: true };
      }
      console.error(`[RabbitMQ] Failed to declare queue ${queueName}:`, err);
      return { ok: false, error: err };
    }
  });
}

/**
 * Safely bind a queue to an exchange with conflict handling.
 */
export async function bindQueueSafe(
  conn: amqplib.Connection,
  queueName: string,
  exchange: string,
  routingKey: string,
  args?: any
): Promise<{ ok: boolean; conflict?: boolean; error?: any }> {
  return withAdminChannel(conn, async ch => {
    try {
      await ch.bindQueue(queueName, exchange, routingKey, args);
      console.log(`[RabbitMQ] Bound ${queueName} to ${exchange} with key ${routingKey}`);
      return { ok: true };
    } catch (err: any) {
      if (err?.code === 406 || err?.message?.includes('Channel closed')) {
        console.warn(`⚠️  [RabbitMQ] Bind failed for ${queueName}: queue might not exist due to prior conflict`);
        return { ok: false, conflict: true };
      }
      console.error(`[RabbitMQ] Failed to bind queue ${queueName}:`, err);
      return { ok: false, error: err };
    }
  });
}

/**
 * Safely assert an exchange.
 */
export async function assertExchangeSafe(
  conn: amqplib.Connection,
  exchangeName: string,
  type: string,
  options: amqplib.Options.AssertExchange
): Promise<{ ok: boolean; error?: any }> {
  return withAdminChannel(conn, async ch => {
    try {
      await ch.assertExchange(exchangeName, type, options);
      console.log(`[RabbitMQ] Exchange declared: ${exchangeName} (${type})`);
      return { ok: true };
    } catch (err: any) {
      console.error(`[RabbitMQ] Failed to declare exchange ${exchangeName}:`, err);
      return { ok: false, error: err };
    }
  });
}

/**
 * Check if a queue exists by attempting a passive declaration.
 */
export async function checkQueueExists(
  conn: amqplib.Connection,
  queueName: string
): Promise<boolean> {
  return withAdminChannel(conn, async ch => {
    try {
      await ch.checkQueue(queueName);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Normalize queue arguments for comparison.
 * Removes null/undefined values and converts numeric strings to numbers.
 */
export function normalizeQueueArgs(args: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(args || {})) {
    if (value === null || value === undefined) continue;
    
    // Convert string numbers to actual numbers for comparison
    if (typeof value === 'string' && !isNaN(Number(value))) {
      normalized[key] = Number(value);
    } else {
      normalized[key] = value;
    }
  }
  
  return normalized;
}

/**
 * Deep compare two objects for equality.
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  
  return true;
}