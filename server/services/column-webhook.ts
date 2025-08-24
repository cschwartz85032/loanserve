import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { db } from '../db';
import { paymentIngestions, exceptionCases } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { PaymentEnvelope, PaymentMethod, computeIdemKey, createPaymentEnvelope } from './payment-envelope';
import { publishWithRetry } from './rabbitmq-bootstrap';
import crypto from 'crypto';

// Column webhook event types
export interface ColumnWebhookEvent {
  id: string;
  type: string;
  occurred_at: string;
  data?: {
    id?: string;
    amount?: number;
    reference_number?: string;
    bank_reference?: string;
    effective_date?: string;
    settlement_date?: string;
    account_id?: string;
    counterparty?: {
      name?: string;
      account_number?: string;
      routing_number?: string;
    };
    metadata?: Record<string, any>;
    status?: string;
    direction?: string;
  };
  batch_id?: string;
}

// HMAC signature verification
export function verifyHmac(signatureHeader: string | undefined, rawBody: Buffer, secret: string): boolean {
  if (!signatureHeader) {
    console.warn('[Column Webhook] Missing signature header');
    return false;
  }
  
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const signature = signatureHeader.toLowerCase().replace('sha256=', '');
    
    // Use timing-safe comparison to prevent timing attacks
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch (error) {
    console.error('[Column Webhook] HMAC verification error:', error);
    return false;
  }
}

// Derive payment channel from Column event
export function deriveChannel(event: ColumnWebhookEvent): PaymentMethod {
  const eventType = event.type?.toLowerCase() || '';
  
  if (eventType.includes('ach')) return 'ach';
  if (eventType.includes('wire')) return 'wire';
  if (eventType.includes('rtp') || eventType.includes('realtime')) return 'realtime';
  if (eventType.includes('check')) return 'check';
  if (eventType.includes('card')) return 'card';
  
  // Default to ACH for unknown types
  return 'ach';
}

// Derive payment reference
export function deriveReference(event: ColumnWebhookEvent): string {
  return event.data?.reference_number || 
         event.data?.bank_reference || 
         event.data?.id || 
         event.id;
}

// Derive loan ID from metadata or reference
export function deriveLoanId(event: ColumnWebhookEvent): string {
  // Check metadata first
  if (event.data?.metadata?.loan_id) {
    return event.data.metadata.loan_id;
  }
  
  // Try to extract from reference number (e.g., "LOAN-123-PAYMENT")
  const reference = deriveReference(event);
  const loanMatch = reference.match(/LOAN[- ]?(\w+)/i);
  if (loanMatch) {
    return loanMatch[1];
  }
  
  // Fallback to account ID or unknown
  return event.data?.account_id || 'UNKNOWN';
}

// Derive amount in cents
export function deriveAmountCents(event: ColumnWebhookEvent): number {
  const amount = event.data?.amount || 0;
  
  // Column amounts are typically in dollars, convert to cents
  if (amount < 10000) {
    // Likely in dollars if less than 10000
    return Math.round(amount * 100);
  }
  
  // Already in cents
  return Math.round(amount);
}

// Derive value date
export function deriveValueDate(event: ColumnWebhookEvent): string {
  const effectiveDate = event.data?.effective_date;
  const settlementDate = event.data?.settlement_date;
  const occurredAt = event.occurred_at;
  
  // Prefer effective date, then settlement date, then occurred date
  const dateStr = effectiveDate || settlementDate || occurredAt;
  
  // Ensure YYYY-MM-DD format
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
}

// Derive borrower name from counterparty
export function deriveBorrowerName(event: ColumnWebhookEvent): string | undefined {
  return event.data?.counterparty?.name;
}

// Calculate SHA256 hash of raw payload
export function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Publish normalized envelope to RabbitMQ
async function publishInbound(envelope: PaymentEnvelope, channel: PaymentMethod): Promise<void> {
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
      3 // Max retries
    );
    
    console.log(`[Column Webhook] Published envelope to payments.inbound/${channel}:`, envelope.message_id);
  } catch (error) {
    console.error('[Column Webhook] Failed to publish envelope:', error);
    throw error;
  }
}

// Main webhook processor
export async function processColumnWebhook(
  rawBody: Buffer,
  signature: string | undefined,
  webhookSecret: string
): Promise<{ success: boolean; error?: string; ingestionId?: string }> {
  // Verify HMAC signature
  if (!verifyHmac(signature, rawBody, webhookSecret)) {
    return { success: false, error: 'Invalid signature' };
  }
  
  const rawHash = sha256(rawBody);
  
  try {
    // Parse event
    const event = JSON.parse(rawBody.toString('utf8')) as ColumnWebhookEvent;
    
    // Derive payment information
    const channel = deriveChannel(event);
    const reference = deriveReference(event);
    const loanId = deriveLoanId(event);
    const amountCents = deriveAmountCents(event);
    const valueDate = deriveValueDate(event);
    const borrowerName = deriveBorrowerName(event);
    
    // Compute idempotency key
    const idemKey = computeIdemKey(channel, reference, valueDate, amountCents, loanId);
    
    console.log(`[Column Webhook] Processing event ${event.id}:`, {
      channel,
      reference,
      loanId,
      amountCents,
      valueDate,
      idemKey: idemKey.substring(0, 16) + '...'
    });
    
    // Transaction to persist and publish
    const result = await db.transaction(async tx => {
      // Insert ingestion record (no-op if duplicate)
      const [ingestion] = await tx
        .insert(paymentIngestions)
        .values({
          idempotencyKey: idemKey,
          channel,
          sourceReference: reference,
          rawPayloadHash: rawHash,
          artifactUri: [],
          artifactHash: [],
          normalizedEnvelope: null,
          status: 'received'
        })
        .onConflictDoNothing({ target: paymentIngestions.idempotencyKey })
        .returning();
      
      if (!ingestion) {
        console.log(`[Column Webhook] Duplicate webhook for idempotency key: ${idemKey}`);
        return { duplicate: true, ingestionId: null };
      }
      
      // Create normalized envelope
      const envelope: PaymentEnvelope = createPaymentEnvelope({
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
      
      // Publish to RabbitMQ
      await publishInbound(envelope, channel);
      
      // Update ingestion status
      await tx
        .update(paymentIngestions)
        .set({
          normalizedEnvelope: envelope as any,
          status: 'published'
        })
        .where(eq(paymentIngestions.idempotencyKey, idemKey));
      
      return { duplicate: false, ingestionId: ingestion.id };
    });
    
    if (result.duplicate) {
      return { success: true, error: 'Duplicate webhook (no-op)' };
    }
    
    return { success: true, ingestionId: result.ingestionId || undefined };
    
  } catch (error) {
    console.error('[Column Webhook] Processing error:', error);
    
    // Create exception case for manual review
    try {
      await db.insert(exceptionCases).values({
        category: 'webhook_parse',
        severity: 'high',
        state: 'open',
        subcategory: 'column_webhook_error',
        aiRecommendation: {
          rawHash,
          rawBody: rawBody.toString('base64'),
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          error: String(error)
        }
      });
      
      console.log('[Column Webhook] Created exception case for manual review');
    } catch (dbError) {
      console.error('[Column Webhook] Failed to create exception case:', dbError);
    }
    
    // Return 200 to Column to prevent retries but indicate internal error
    return { success: true, error: 'Internal processing error (exception created)' };
  }
}

// Express route handler
export async function columnWebhookHandler(req: any, res: any) {
  const signature = req.header('Column-Signature') || req.header('column-signature');
  const webhookSecret = process.env.COLUMN_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('[Column Webhook] COLUMN_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  
  // Ensure we have raw body
  const rawBody = Buffer.isBuffer(req.body) 
    ? req.body 
    : Buffer.from(req.body || '', 'utf8');
  
  if (rawBody.length === 0) {
    return res.status(400).json({ error: 'Empty request body' });
  }
  
  // Process webhook
  const result = await processColumnWebhook(rawBody, signature, webhookSecret);
  
  if (!result.success && result.error === 'Invalid signature') {
    return res.status(401).send('bad signature');
  }
  
  // Always return 200 to Column for valid signatures
  res.status(200).json({ 
    success: result.success,
    message: result.error || 'Webhook processed',
    ingestionId: result.ingestionId
  });
}