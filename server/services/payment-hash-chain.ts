/**
 * Payment Events Hash Chain
 * 
 * Implements cryptographic hash chaining for immutable audit trail
 * Each event contains hash of previous event, creating tamper-evident log
 * 
 * Per 25-Step Implementation Specification
 */

import crypto from 'crypto';
import { db } from '../db';
import { paymentEvents, type PaymentEvent } from '@shared/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';

// ========================================
// HASH CHAIN CORE
// ========================================

export class PaymentHashChain {
  private static readonly HASH_ALGORITHM = 'sha256';
  private static readonly GENESIS_HASH = '0'.repeat(64);

  /**
   * Calculate hash for an event
   */
  static calculateEventHash(params: {
    paymentIngestionId: string;
    eventType: string;
    eventData: any;
    actorId: string;
    prevEventHash: string;
    timestamp: string;
  }): string {
    const canonical = this.canonicalizeEventData(params);
    
    return crypto
      .createHash(this.HASH_ALGORITHM)
      .update(canonical)
      .digest('hex');
  }

  /**
   * Canonicalize event data for consistent hashing
   */
  private static canonicalizeEventData(data: any): string {
    // Sort keys to ensure consistent ordering
    const sortedData = this.sortObjectKeys(data);
    
    // Use deterministic JSON stringification
    return JSON.stringify(sortedData, null, 0);
  }

  /**
   * Recursively sort object keys for deterministic serialization
   */
  private static sortObjectKeys(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sortObjectKeys(item));
    
    return Object.keys(obj)
      .sort()
      .reduce((sorted: any, key) => {
        sorted[key] = this.sortObjectKeys(obj[key]);
        return sorted;
      }, {});
  }

  /**
   * Get the hash of the most recent event
   */
  static async getLatestEventHash(): Promise<string> {
    const [latestEvent] = await db
      .select({ eventHash: paymentEvents.eventHash })
      .from(paymentEvents)
      .orderBy(desc(paymentEvents.createdAt))
      .limit(1);

    return latestEvent?.eventHash || this.GENESIS_HASH;
  }

  /**
   * Create a new hash-chained event
   */
  static async createChainedEvent(params: {
    paymentIngestionId: string;
    eventType: string;
    eventData: any;
    actorId: string;
    confidenceScore?: number;
  }): Promise<PaymentEvent> {
    // Get previous event hash
    const prevEventHash = await this.getLatestEventHash();
    
    // Calculate new event hash
    const timestamp = new Date().toISOString();
    const eventHash = this.calculateEventHash({
      ...params,
      prevEventHash,
      timestamp,
    });

    // Insert event with hash chain
    const [newEvent] = await db.insert(paymentEvents).values({
      paymentIngestionId: params.paymentIngestionId,
      eventType: params.eventType,
      eventData: params.eventData,
      actorId: params.actorId,
      confidenceScore: params.confidenceScore?.toString(),
      prevEventHash,
      eventHash,
    }).returning();

    console.log(`[HashChain] Created event ${params.eventType} with hash ${eventHash.substring(0, 8)}...`);
    
    return newEvent;
  }

  /**
   * Verify the integrity of the hash chain
   */
  static async verifyChainIntegrity(
    startEventId?: string,
    endEventId?: string
  ): Promise<{
    isValid: boolean;
    brokenLinks: Array<{
      eventId: string;
      expectedHash: string;
      actualHash: string;
    }>;
    totalEvents: number;
  }> {
    // Fetch events in chronological order
    let query = db
      .select()
      .from(paymentEvents)
      .orderBy(paymentEvents.createdAt);

    // TODO: Add filtering by event ID range if provided
    
    const events = await query;
    const brokenLinks: Array<{
      eventId: string;
      expectedHash: string;
      actualHash: string;
    }> = [];

    let expectedPrevHash = this.GENESIS_HASH;
    
    for (const event of events) {
      // Verify previous hash link
      if (event.prevEventHash !== expectedPrevHash) {
        brokenLinks.push({
          eventId: event.id,
          expectedHash: expectedPrevHash,
          actualHash: event.prevEventHash || 'null',
        });
      }

      // Recalculate hash to verify integrity
      const recalculatedHash = this.calculateEventHash({
        paymentIngestionId: event.paymentIngestionId,
        eventType: event.eventType,
        eventData: event.eventData,
        actorId: event.actorId || '',
        prevEventHash: event.prevEventHash || '',
        timestamp: event.createdAt.toISOString(),
      });

      if (recalculatedHash !== event.eventHash) {
        brokenLinks.push({
          eventId: event.id,
          expectedHash: recalculatedHash,
          actualHash: event.eventHash,
        });
      }

      // Update expected hash for next iteration
      expectedPrevHash = event.eventHash;
    }

    return {
      isValid: brokenLinks.length === 0,
      brokenLinks,
      totalEvents: events.length,
    };
  }

  /**
   * Get chain of events for a payment ingestion
   */
  static async getEventChain(
    paymentIngestionId: string
  ): Promise<PaymentEvent[]> {
    return await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.paymentIngestionId, paymentIngestionId))
      .orderBy(paymentEvents.createdAt);
  }

  /**
   * Export event chain for audit
   */
  static async exportEventChain(
    startDate: Date,
    endDate: Date
  ): Promise<{
    metadata: {
      startDate: string;
      endDate: string;
      totalEvents: number;
      chainValid: boolean;
      exportedAt: string;
      exportHash: string;
    };
    events: Array<{
      id: string;
      paymentIngestionId: string;
      eventType: string;
      eventData: any;
      actorId: string | null;
      confidenceScore: string | null;
      prevEventHash: string | null;
      eventHash: string;
      createdAt: string;
    }>;
  }> {
    // Fetch events in date range
    const events = await db
      .select()
      .from(paymentEvents)
      .where(
        and(
          paymentEvents.createdAt >= startDate,
          paymentEvents.createdAt <= endDate
        )
      )
      .orderBy(paymentEvents.createdAt);

    // Verify chain integrity
    const integrity = await this.verifyChainIntegrity();

    // Prepare export data
    const exportData = events.map(event => ({
      id: event.id,
      paymentIngestionId: event.paymentIngestionId,
      eventType: event.eventType,
      eventData: event.eventData,
      actorId: event.actorId,
      confidenceScore: event.confidenceScore,
      prevEventHash: event.prevEventHash,
      eventHash: event.eventHash,
      createdAt: event.createdAt.toISOString(),
    }));

    // Calculate export hash for tamper detection
    const exportHash = crypto
      .createHash(this.HASH_ALGORITHM)
      .update(JSON.stringify(exportData))
      .digest('hex');

    return {
      metadata: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalEvents: events.length,
        chainValid: integrity.isValid,
        exportedAt: new Date().toISOString(),
        exportHash,
      },
      events: exportData,
    };
  }
}

// ========================================
// EVENT TYPES
// ========================================

export enum PaymentEventType {
  // Ingestion events
  PAYMENT_INGESTED = 'PAYMENT_INGESTED',
  WEBHOOK_RECEIVED = 'WEBHOOK_RECEIVED',
  MANUAL_ENTRY = 'MANUAL_ENTRY',
  
  // Validation events
  VALIDATION_STARTED = 'VALIDATION_STARTED',
  VALIDATION_PASSED = 'VALIDATION_PASSED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  DUPLICATE_DETECTED = 'DUPLICATE_DETECTED',
  
  // AI events
  AI_ANALYSIS_STARTED = 'AI_ANALYSIS_STARTED',
  AI_ANALYSIS_COMPLETED = 'AI_ANALYSIS_COMPLETED',
  AI_CONFIDENCE_LOW = 'AI_CONFIDENCE_LOW',
  AI_MANUAL_REVIEW_REQUIRED = 'AI_MANUAL_REVIEW_REQUIRED',
  
  // Processing events
  PROCESSING_STARTED = 'PROCESSING_STARTED',
  LOAN_MATCHED = 'LOAN_MATCHED',
  ALLOCATION_CALCULATED = 'ALLOCATION_CALCULATED',
  LEDGER_POSTED = 'LEDGER_POSTED',
  PROCESSING_COMPLETED = 'PROCESSING_COMPLETED',
  
  // Settlement events
  SETTLEMENT_INITIATED = 'SETTLEMENT_INITIATED',
  COLUMN_TRANSFER_CREATED = 'COLUMN_TRANSFER_CREATED',
  SETTLEMENT_COMPLETED = 'SETTLEMENT_COMPLETED',
  SETTLEMENT_FAILED = 'SETTLEMENT_FAILED',
  
  // Return/reversal events
  ACH_RETURNED = 'ACH_RETURNED',
  PAYMENT_REVERSED = 'PAYMENT_REVERSED',
  REFUND_INITIATED = 'REFUND_INITIATED',
  CHARGEBACK_RECEIVED = 'CHARGEBACK_RECEIVED',
  
  // Reconciliation events
  RECONCILIATION_MATCHED = 'RECONCILIATION_MATCHED',
  RECONCILIATION_VARIANCE = 'RECONCILIATION_VARIANCE',
  MANUAL_RECONCILIATION = 'MANUAL_RECONCILIATION',
  
  // Exception events
  EXCEPTION_RAISED = 'EXCEPTION_RAISED',
  EXCEPTION_ASSIGNED = 'EXCEPTION_ASSIGNED',
  EXCEPTION_RESOLVED = 'EXCEPTION_RESOLVED',
  EXCEPTION_ESCALATED = 'EXCEPTION_ESCALATED',
  
  // Audit events
  MANUAL_OVERRIDE = 'MANUAL_OVERRIDE',
  SYSTEM_ADJUSTMENT = 'SYSTEM_ADJUSTMENT',
  COMPLIANCE_FLAG = 'COMPLIANCE_FLAG',
}

// ========================================
// EVENT BUILDER
// ========================================

export class PaymentEventBuilder {
  private paymentIngestionId: string;
  private actorId: string;

  constructor(paymentIngestionId: string, actorId: string) {
    this.paymentIngestionId = paymentIngestionId;
    this.actorId = actorId;
  }

  /**
   * Log payment ingestion
   */
  async logIngestion(data: {
    channel: string;
    amount: number;
    loanId?: number;
    idempotencyKey: string;
  }): Promise<PaymentEvent> {
    return PaymentHashChain.createChainedEvent({
      paymentIngestionId: this.paymentIngestionId,
      eventType: PaymentEventType.PAYMENT_INGESTED,
      eventData: data,
      actorId: this.actorId,
    });
  }

  /**
   * Log validation result
   */
  async logValidation(data: {
    isValid: boolean;
    errors?: string[];
    warnings?: string[];
    aiConfidence?: number;
  }): Promise<PaymentEvent> {
    return PaymentHashChain.createChainedEvent({
      paymentIngestionId: this.paymentIngestionId,
      eventType: data.isValid 
        ? PaymentEventType.VALIDATION_PASSED 
        : PaymentEventType.VALIDATION_FAILED,
      eventData: data,
      actorId: this.actorId,
      confidenceScore: data.aiConfidence,
    });
  }

  /**
   * Log AI analysis
   */
  async logAIAnalysis(data: {
    model: string;
    confidence: number;
    suggestedAction: string;
    analysis: any;
  }): Promise<PaymentEvent> {
    const eventType = data.confidence >= 0.9 
      ? PaymentEventType.AI_ANALYSIS_COMPLETED
      : data.confidence >= 0.6
        ? PaymentEventType.AI_CONFIDENCE_LOW
        : PaymentEventType.AI_MANUAL_REVIEW_REQUIRED;

    return PaymentHashChain.createChainedEvent({
      paymentIngestionId: this.paymentIngestionId,
      eventType,
      eventData: data,
      actorId: `ai_${data.model}`,
      confidenceScore: data.confidence,
    });
  }

  /**
   * Log processing milestone
   */
  async logProcessing(data: {
    step: string;
    result: any;
    duration?: number;
  }): Promise<PaymentEvent> {
    const eventTypeMap: Record<string, PaymentEventType> = {
      'started': PaymentEventType.PROCESSING_STARTED,
      'loan_matched': PaymentEventType.LOAN_MATCHED,
      'allocation_calculated': PaymentEventType.ALLOCATION_CALCULATED,
      'ledger_posted': PaymentEventType.LEDGER_POSTED,
      'completed': PaymentEventType.PROCESSING_COMPLETED,
    };

    return PaymentHashChain.createChainedEvent({
      paymentIngestionId: this.paymentIngestionId,
      eventType: eventTypeMap[data.step] || PaymentEventType.PROCESSING_STARTED,
      eventData: data,
      actorId: this.actorId,
    });
  }

  /**
   * Log exception
   */
  async logException(data: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    details: any;
  }): Promise<PaymentEvent> {
    return PaymentHashChain.createChainedEvent({
      paymentIngestionId: this.paymentIngestionId,
      eventType: PaymentEventType.EXCEPTION_RAISED,
      eventData: data,
      actorId: this.actorId,
    });
  }

  /**
   * Log manual override
   */
  async logManualOverride(data: {
    field: string;
    oldValue: any;
    newValue: any;
    reason: string;
    authorizedBy: string;
  }): Promise<PaymentEvent> {
    return PaymentHashChain.createChainedEvent({
      paymentIngestionId: this.paymentIngestionId,
      eventType: PaymentEventType.MANUAL_OVERRIDE,
      eventData: data,
      actorId: data.authorizedBy,
    });
  }
}