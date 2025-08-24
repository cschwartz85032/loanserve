import { db } from '../db';
import { paymentIngestions } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import type { InsertPaymentIngestion, PaymentIngestion } from '../../shared/schema';

export interface PaymentIngestionData {
  channel: string; // ach|wire|realtime|check|card|paypal|venmo|book
  sourceReference?: string;
  rawPayload: any;
  normalizedEnvelope: any;
  artifactUris?: string[];
  artifactHashes?: string[];
  // For idempotency key calculation
  method: string;
  normalizedReference: string;
  valueDate: string;
  amountCents: number;
  loanId: number;
}

export class PaymentIngestionService {
  /**
   * Calculate idempotency key according to the rule:
   * sha256(lower(method) || '|' || normalized_reference || '|' || value_date || '|' || amount_cents || '|' || loan_id)
   */
  static calculateIdempotencyKey(data: {
    method: string;
    normalizedReference: string;
    valueDate: string;
    amountCents: number;
    loanId: number;
  }): string {
    const keyString = [
      data.method.toLowerCase(),
      data.normalizedReference,
      data.valueDate,
      data.amountCents.toString(),
      data.loanId.toString()
    ].join('|');
    
    return createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Calculate SHA256 hash of raw payload
   */
  static calculatePayloadHash(payload: any): string {
    const payloadString = typeof payload === 'string' 
      ? payload 
      : JSON.stringify(payload);
    
    return createHash('sha256').update(payloadString).digest('hex');
  }

  /**
   * Persist idempotent ingress for payment signals
   * Returns existing row if duplicate idempotency key is found
   */
  async persistIngestion(data: PaymentIngestionData): Promise<PaymentIngestion> {
    const idempotencyKey = PaymentIngestionService.calculateIdempotencyKey({
      method: data.channel,
      normalizedReference: data.sourceReference || '',
      valueDate: data.valueDate,
      amountCents: data.amountCents,
      loanId: data.loanId
    });

    const rawPayloadHash = PaymentIngestionService.calculatePayloadHash(data.rawPayload);

    // Check for existing ingestion with same idempotency key
    const existing = await db
      .select()
      .from(paymentIngestions)
      .where(eq(paymentIngestions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[PaymentIngestion] Duplicate idempotency key found: ${idempotencyKey}`);
      return existing[0];
    }

    // Validate normalized envelope JSON
    if (!data.normalizedEnvelope || typeof data.normalizedEnvelope !== 'object') {
      throw new Error('Invalid normalized JSON: normalizedEnvelope must be a valid object');
    }

    // Create new ingestion record
    const newIngestion: Partial<InsertPaymentIngestion> = {
      idempotencyKey,
      channel: data.channel,
      sourceReference: data.sourceReference,
      rawPayloadHash,
      artifactUri: data.artifactUris || [],
      artifactHash: data.artifactHashes || [],
      normalizedEnvelope: data.normalizedEnvelope,
      status: 'received'
    };

    try {
      const [created] = await db
        .insert(paymentIngestions)
        .values(newIngestion as any)
        .returning();

      console.log(`[PaymentIngestion] Created new ingestion: ${created.id}`);
      return created;
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === '23505' && error.constraint === 'payment_ingestions_idempotency_key_unique') {
        // Race condition - another process inserted the same idempotency key
        const existing = await db
          .select()
          .from(paymentIngestions)
          .where(eq(paymentIngestions.idempotencyKey, idempotencyKey))
          .limit(1);
        
        if (existing.length > 0) {
          console.log(`[PaymentIngestion] Race condition handled, returning existing: ${idempotencyKey}`);
          return existing[0];
        }
      }
      throw error;
    }
  }

  /**
   * Update ingestion status
   */
  async updateStatus(
    id: string, 
    status: 'received' | 'normalized' | 'published'
  ): Promise<PaymentIngestion | null> {
    const [updated] = await db
      .update(paymentIngestions)
      .set({ status })
      .where(eq(paymentIngestions.id, id))
      .returning();

    return updated || null;
  }

  /**
   * Get ingestion by ID
   */
  async getById(id: string): Promise<PaymentIngestion | null> {
    const [ingestion] = await db
      .select()
      .from(paymentIngestions)
      .where(eq(paymentIngestions.id, id))
      .limit(1);

    return ingestion || null;
  }

  /**
   * Get ingestion by idempotency key
   */
  async getByIdempotencyKey(key: string): Promise<PaymentIngestion | null> {
    const [ingestion] = await db
      .select()
      .from(paymentIngestions)
      .where(eq(paymentIngestions.idempotencyKey, key))
      .limit(1);

    return ingestion || null;
  }

  /**
   * List ingestions by channel
   */
  async listByChannel(
    channel: string, 
    limit: number = 100
  ): Promise<PaymentIngestion[]> {
    return await db
      .select()
      .from(paymentIngestions)
      .where(eq(paymentIngestions.channel, channel))
      .orderBy(paymentIngestions.receivedAt)
      .limit(limit);
  }
}

// Export singleton instance
export const paymentIngestionService = new PaymentIngestionService();