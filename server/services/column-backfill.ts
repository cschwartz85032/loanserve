import { db } from '../db';
import { paymentIngestions } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { 
  ColumnWebhookEvent,
  deriveChannel,
  deriveReference,
  deriveLoanId,
  deriveAmountCents,
  deriveValueDate,
  deriveBorrowerName,
  sha256
} from './column-webhook';
import { 
  PaymentEnvelope, 
  computeIdemKey, 
  createPaymentEnvelope 
} from './payment-envelope';
import { publishWithRetry } from './rabbitmq-bootstrap';
import { randomUUID } from 'crypto';

// Column API client interface
interface IColumnApiClient {
  listEvents(params: {
    after?: string;
    before?: string;
    limit?: number;
  }): Promise<{
    events: ColumnWebhookEvent[];
    hasMore: boolean;
    nextCursor?: string;
  }>;
}

// Cursor storage for tracking progress
interface CursorStorage {
  service: string;
  cursor: string | null;
  lastUpdated: Date;
}

// Backfill worker configuration
export interface BackfillConfig {
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
  throttleDelayMs: number;
  apiKey: string;
  apiUrl?: string;
}

// Default configuration
const DEFAULT_CONFIG: Partial<BackfillConfig> = {
  batchSize: 200,
  maxRetries: 3,
  retryDelayMs: 1000,
  throttleDelayMs: 100,
  apiUrl: 'https://api.column.com/v1'
};

// Cursor management
export class CursorManager {
  private tableName = 'system_cursors';
  
  async getCursor(service: string): Promise<string | null> {
    try {
      const result = await db.execute(
        sql`SELECT cursor FROM ${sql.identifier(this.tableName)} 
            WHERE service = ${service} 
            LIMIT 1`
      );
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0].cursor as string;
      }
      return null;
    } catch (error) {
      console.log(`[CursorManager] No cursor found for ${service}, starting from beginning`);
      return null;
    }
  }
  
  async setCursor(service: string, cursor: string): Promise<void> {
    try {
      // Upsert cursor
      await db.execute(
        sql`INSERT INTO ${sql.identifier(this.tableName)} (service, cursor, last_updated)
            VALUES (${service}, ${cursor}, ${new Date()})
            ON CONFLICT (service) 
            DO UPDATE SET 
              cursor = EXCLUDED.cursor,
              last_updated = EXCLUDED.last_updated`
      );
      
      console.log(`[CursorManager] Updated cursor for ${service}: ${cursor.substring(0, 16)}...`);
    } catch (error) {
      console.error(`[CursorManager] Failed to update cursor:`, error);
      // Try to create table if it doesn't exist
      await this.createCursorTable();
      // Retry the update
      await this.setCursor(service, cursor);
    }
  }
  
  private async createCursorTable(): Promise<void> {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ${sql.identifier(this.tableName)} (
          service VARCHAR(100) PRIMARY KEY,
          cursor TEXT,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[CursorManager] Created cursor table');
    } catch (error) {
      console.error('[CursorManager] Failed to create cursor table:', error);
    }
  }
}

// Mock Column API client (replace with actual SDK when available)
export class ColumnApiClient implements IColumnApiClient {
  constructor(
    private apiKey: string,
    private apiUrl: string = 'https://api.column.com/v1'
  ) {}
  
  async listEvents(params: {
    after?: string;
    before?: string;
    limit?: number;
  }): Promise<{
    events: ColumnWebhookEvent[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    const url = new URL(`${this.apiUrl}/events`);
    
    if (params.after) url.searchParams.append('after', params.after);
    if (params.before) url.searchParams.append('before', params.before);
    if (params.limit) url.searchParams.append('limit', params.limit.toString());
    
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 429) {
      // Rate limited
      const retryAfter = response.headers.get('Retry-After');
      throw new RateLimitError(parseInt(retryAfter || '60'));
    }
    
    if (!response.ok) {
      throw new Error(`Column API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      events: data.data || [],
      hasMore: data.has_more || false,
      nextCursor: data.next_cursor
    };
  }
}

// Custom error for rate limiting
class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Rate limited, retry after ${retryAfterSeconds} seconds`);
    this.name = 'RateLimitError';
  }
}

// Normalize Column event to payment envelope
function normalizeColumnEvent(event: ColumnWebhookEvent): PaymentEnvelope {
  const channel = deriveChannel(event);
  const reference = deriveReference(event);
  const loanId = deriveLoanId(event);
  const amountCents = deriveAmountCents(event);
  const valueDate = deriveValueDate(event);
  const borrowerName = deriveBorrowerName(event);
  
  return createPaymentEnvelope({
    messageId: randomUUID(),
    correlationId: event.id,
    method: channel,
    reference,
    valueDate,
    amountCents,
    loanId,
    provider: 'column',
    batchId: event.batch_id,
    borrowerName,
    columnTransferId: event.data?.id,
    columnEventId: event.id
  });
}

// Insert if new ingestion (idempotent)
async function insertIfNewIngestion(envelope: PaymentEnvelope): Promise<boolean> {
  const idemKey = envelope.idempotency_key;
  
  try {
    // Check for existing ingestion
    const existing = await db
      .select()
      .from(paymentIngestions)
      .where(eq(paymentIngestions.idempotencyKey, idemKey))
      .limit(1);
    
    if (existing.length > 0) {
      console.log(`[Backfill] Duplicate event, skipping: ${idemKey.substring(0, 16)}...`);
      return false;
    }
    
    // Create raw payload for hash
    const rawPayload = JSON.stringify(envelope);
    const rawHash = sha256(Buffer.from(rawPayload));
    
    // Insert new ingestion
    await db.insert(paymentIngestions).values({
      idempotencyKey: idemKey,
      channel: envelope.source.channel,
      sourceReference: envelope.payment.reference,
      rawPayloadHash: rawHash,
      artifactUri: [],
      artifactHash: [],
      normalizedEnvelope: envelope as any,
      status: 'received'
    });
    
    console.log(`[Backfill] Created ingestion for event: ${envelope.external?.column_event_id}`);
    return true;
    
  } catch (error: any) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      console.log(`[Backfill] Race condition, event already processed: ${idemKey.substring(0, 16)}...`);
      return false;
    }
    throw error;
  }
}

// Publish to RabbitMQ
async function publishInbound(envelope: PaymentEnvelope, channel: string): Promise<void> {
  try {
    await publishWithRetry(
      'payments.inbound',
      channel,
      envelope,
      {
        confirmTimeout: 5000,
        messageId: envelope.message_id,
        correlationId: envelope.correlation_id
      },
      3
    );
    
    // Update ingestion status
    await db
      .update(paymentIngestions)
      .set({ status: 'published' })
      .where(eq(paymentIngestions.idempotencyKey, envelope.idempotency_key));
    
    console.log(`[Backfill] Published event to payments.inbound/${channel}: ${envelope.message_id}`);
  } catch (error) {
    console.error('[Backfill] Failed to publish event:', error);
    throw error;
  }
}

// Main backfill worker
export class ColumnBackfillWorker {
  private cursorManager: CursorManager;
  private columnClient: ColumnApiClient;
  private config: BackfillConfig;
  private isRunning = false;
  private shouldStop = false;
  
  constructor(config: Partial<BackfillConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config } as BackfillConfig;
    this.cursorManager = new CursorManager();
    this.columnClient = new ColumnApiClient(this.config.apiKey, this.config.apiUrl);
  }
  
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Backfill] Worker already running');
      return;
    }
    
    this.isRunning = true;
    this.shouldStop = false;
    
    console.log('[Backfill] Starting Column events backfill worker');
    
    try {
      await this.backfillSinceCursor();
    } catch (error) {
      console.error('[Backfill] Worker error:', error);
    } finally {
      this.isRunning = false;
    }
  }
  
  stop(): void {
    console.log('[Backfill] Stopping backfill worker');
    this.shouldStop = true;
  }
  
  private async backfillSinceCursor(): Promise<void> {
    let cursor = await this.cursorManager.getCursor('column_events');
    let consecutiveErrors = 0;
    
    console.log(`[Backfill] Starting from cursor: ${cursor || 'beginning'}`);
    
    while (!this.shouldStop) {
      try {
        // Fetch next page of events
        const page = await this.columnClient.listEvents({
          after: cursor || undefined,
          limit: this.config.batchSize
        });
        
        if (page.events.length === 0) {
          console.log('[Backfill] No more events to process');
          break;
        }
        
        console.log(`[Backfill] Processing ${page.events.length} events`);
        
        // Process each event
        let processedCount = 0;
        let skippedCount = 0;
        
        for (const event of page.events) {
          if (this.shouldStop) break;
          
          try {
            // Normalize and insert
            const envelope = normalizeColumnEvent(event);
            const isNew = await insertIfNewIngestion(envelope);
            
            if (isNew) {
              await publishInbound(envelope, envelope.source.channel);
              processedCount++;
            } else {
              skippedCount++;
            }
            
            // Update cursor to this event
            cursor = event.id;
            
          } catch (error) {
            console.error(`[Backfill] Failed to process event ${event.id}:`, error);
            // Continue with next event
          }
        }
        
        console.log(`[Backfill] Batch complete: ${processedCount} new, ${skippedCount} duplicates`);
        
        // Save cursor after each batch
        if (cursor) {
          await this.cursorManager.setCursor('column_events', cursor);
        }
        
        // Reset error counter on successful batch
        consecutiveErrors = 0;
        
        // Check if there are more pages
        if (!page.hasMore) {
          console.log('[Backfill] Reached end of events');
          break;
        }
        
        // Throttle to avoid rate limits
        if (this.config.throttleDelayMs > 0) {
          await this.delay(this.config.throttleDelayMs);
        }
        
      } catch (error) {
        consecutiveErrors++;
        
        if (error instanceof RateLimitError) {
          console.log(`[Backfill] Rate limited, waiting ${error.retryAfterSeconds}s`);
          await this.delay(error.retryAfterSeconds * 1000);
          consecutiveErrors = 0; // Don't count rate limits as errors
          continue;
        }
        
        console.error(`[Backfill] Error (attempt ${consecutiveErrors}/${this.config.maxRetries}):`, error);
        
        if (consecutiveErrors >= this.config.maxRetries) {
          console.error('[Backfill] Max retries reached, stopping');
          break;
        }
        
        // Exponential backoff
        const delay = this.config.retryDelayMs * Math.pow(2, consecutiveErrors - 1);
        console.log(`[Backfill] Retrying in ${delay}ms`);
        await this.delay(delay);
      }
    }
    
    console.log('[Backfill] Worker finished');
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Scheduled job runner
export async function runBackfillJob(): Promise<void> {
  const apiKey = process.env.COLUMN_API_KEY;
  
  if (!apiKey) {
    console.error('[Backfill] COLUMN_API_KEY not configured');
    return;
  }
  
  const worker = new ColumnBackfillWorker({
    apiKey,
    batchSize: 100,
    throttleDelayMs: 200,
    maxRetries: 5
  });
  
  await worker.start();
}

// Express endpoint to trigger manual backfill
export async function triggerBackfillHandler(req: any, res: any) {
  try {
    // Start backfill in background
    runBackfillJob().catch(error => {
      console.error('[Backfill] Job failed:', error);
    });
    
    res.json({
      success: true,
      message: 'Backfill job started in background'
    });
  } catch (error) {
    console.error('[Backfill] Failed to start job:', error);
    res.status(500).json({
      error: 'Failed to start backfill job'
    });
  }
}