import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq, and, or, desc, asc, sql } from 'drizzle-orm';
import { createLogger } from './logger';

const logger = createLogger('Database');

// Common database query helpers
export class QueryBuilder {
  private db: any;
  
  constructor(db: any) {
    this.db = db;
  }
  
  // Generic find by ID
  async findById(table: any, id: number | string) {
    const timer = logger.startTimer(`Query ${table} by ID`);
    try {
      const result = await this.db
        .select()
        .from(table)
        .where(eq(table.id, id))
        .limit(1);
      
      return result[0] || null;
    } finally {
      timer();
    }
  }
  
  // Generic find many with pagination
  async findMany(
    table: any,
    options: {
      where?: any;
      orderBy?: any;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const timer = logger.startTimer(`Query ${table} findMany`);
    try {
      let query = this.db.select().from(table);
      
      if (options.where) {
        query = query.where(options.where);
      }
      
      if (options.orderBy) {
        query = query.orderBy(options.orderBy);
      }
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      if (options.offset) {
        query = query.offset(options.offset);
      }
      
      return await query;
    } finally {
      timer();
    }
  }
  
  // Count records
  async count(table: any, where?: any) {
    const timer = logger.startTimer(`Count ${table}`);
    try {
      let query = this.db
        .select({ count: sql<number>`count(*)` })
        .from(table);
      
      if (where) {
        query = query.where(where);
      }
      
      const result = await query;
      return result[0]?.count || 0;
    } finally {
      timer();
    }
  }
  
  // Soft delete helper
  async softDelete(table: any, id: number | string, deletedBy?: number) {
    const timer = logger.startTimer(`Soft delete ${table}`);
    try {
      const result = await this.db
        .update(table)
        .set({
          deletedAt: new Date(),
          deletedBy: deletedBy || null
        })
        .where(eq(table.id, id))
        .returning();
      
      return result[0];
    } finally {
      timer();
    }
  }
  
  // Batch insert with conflict handling
  async batchInsert(
    table: any,
    records: any[],
    onConflict?: 'ignore' | 'update'
  ) {
    const timer = logger.startTimer(`Batch insert ${table}`);
    try {
      if (records.length === 0) {
        return [];
      }
      
      let query = this.db.insert(table).values(records);
      
      if (onConflict === 'ignore') {
        query = query.onConflictDoNothing();
      } else if (onConflict === 'update') {
        query = query.onConflictDoUpdate({
          target: table.id,
          set: records[0] // Update with first record's values
        });
      }
      
      return await query.returning();
    } finally {
      timer();
    }
  }
  
  // Update with optimistic locking
  async updateWithLock(
    table: any,
    id: number | string,
    updates: any,
    expectedVersion?: number
  ) {
    const timer = logger.startTimer(`Update with lock ${table}`);
    try {
      const conditions = [eq(table.id, id)];
      
      if (expectedVersion !== undefined && table.version) {
        conditions.push(eq(table.version, expectedVersion));
      }
      
      const newVersion = expectedVersion !== undefined ? expectedVersion + 1 : undefined;
      const updateData = newVersion !== undefined
        ? { ...updates, version: newVersion }
        : updates;
      
      const result = await this.db
        .update(table)
        .set(updateData)
        .where(and(...conditions))
        .returning();
      
      if (result.length === 0) {
        throw new Error('Update failed: Record not found or version mismatch');
      }
      
      return result[0];
    } finally {
      timer();
    }
  }
}

// Transaction helpers
export async function runInTransaction<T>(
  pool: Pool,
  fn: (tx: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  const timer = logger.startTimer('Transaction');
  
  try {
    await client.query('BEGIN');
    const db = drizzle(client);
    const result = await fn(db);
    await client.query('COMMIT');
    logger.info('Transaction committed successfully');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', error);
    throw error;
  } finally {
    client.release();
    timer();
  }
}

// Batch processing helper
export async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];
  const totalBatches = Math.ceil(items.length / batchSize);
  
  logger.info(`Processing ${items.length} items in ${totalBatches} batches`);
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    
    logger.debug(`Processing batch ${batchNumber}/${totalBatches}`);
    
    try {
      const batchResults = await processor(batch);
      results.push(...batchResults);
    } catch (error) {
      logger.error(`Batch ${batchNumber} failed`, error);
      throw error;
    }
  }
  
  logger.logBatch('processing', items.length, results.length);
  return results;
}

// Retry on deadlock
export async function retryOnDeadlock<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // PostgreSQL deadlock detected error code
      if (error.code === '40P01' && attempt < maxRetries) {
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
        logger.warn(`Deadlock detected, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }
  
  throw lastError;
}

// Connection health check
export async function checkDatabaseHealth(pool: Pool): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    logger.error('Database health check failed', error);
    return false;
  }
}

// Query performance monitor
export function createQueryMonitor() {
  const queries: Map<string, { count: number; totalTime: number; avgTime: number }> = new Map();
  
  return {
    record: (queryName: string, duration: number) => {
      const existing = queries.get(queryName) || { count: 0, totalTime: 0, avgTime: 0 };
      existing.count++;
      existing.totalTime += duration;
      existing.avgTime = existing.totalTime / existing.count;
      queries.set(queryName, existing);
    },
    
    getStats: () => {
      return Array.from(queries.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.totalTime - a.totalTime);
    },
    
    reset: () => {
      queries.clear();
    }
  };
}