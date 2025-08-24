import { db } from '../db';
import { paymentEvents } from '@shared/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import crypto from 'crypto';

export interface PaymentEvent {
  id?: string;
  paymentId?: string | null;
  ingestionId?: string | null;
  type: string;
  eventTime?: Date;
  actorType: 'system' | 'human' | 'ai';
  actorId?: string | null;
  correlationId: string;
  data: any;
  prevEventHash?: string | null;
  eventHash?: string;
}

export class PaymentEventService {
  /**
   * Compute event hash using the specified formula
   */
  computeEventHash(
    prev: string | null, 
    data: object, 
    correlationId: string
  ): string {
    const payload = JSON.stringify({ prev, data, correlationId });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Create a new payment event with automatic hash chain
   */
  async createEvent(event: PaymentEvent): Promise<PaymentEvent> {
    // Validate actor type
    if (!['system', 'human', 'ai'].includes(event.actorType)) {
      throw new Error(`Invalid actor type: ${event.actorType}`);
    }

    // Get the previous event hash for this correlation
    const prevEventHash = await this.getPreviousEventHash(event.correlationId);
    
    // Compute the event hash
    const eventHash = this.computeEventHash(
      prevEventHash,
      event.data,
      event.correlationId
    );

    // Create the event
    const [created] = await db.insert(paymentEvents).values({
      paymentId: event.paymentId,
      ingestionId: event.ingestionId,
      type: event.type,
      eventTime: event.eventTime || new Date(),
      actorType: event.actorType,
      actorId: event.actorId,
      correlationId: event.correlationId,
      data: event.data,
      prevEventHash,
      eventHash
    }).returning();

    console.log(`[PaymentEvent] Created event: ${created.id} of type ${created.type} for correlation ${created.correlationId}`);
    return created as PaymentEvent;
  }

  /**
   * Get the hash of the most recent event for a correlation ID
   */
  async getPreviousEventHash(correlationId: string): Promise<string | null> {
    const [lastEvent] = await db
      .select({ eventHash: paymentEvents.eventHash })
      .from(paymentEvents)
      .where(eq(paymentEvents.correlationId, correlationId))
      .orderBy(desc(paymentEvents.eventTime))
      .limit(1);

    return lastEvent?.eventHash || null;
  }

  /**
   * Get all events for a correlation ID in chronological order
   */
  async getEventsByCorrelation(correlationId: string): Promise<PaymentEvent[]> {
    const events = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.correlationId, correlationId))
      .orderBy(asc(paymentEvents.eventTime));

    return events as PaymentEvent[];
  }

  /**
   * Get all events for a payment ID in chronological order
   */
  async getEventsByPaymentId(paymentId: string): Promise<PaymentEvent[]> {
    const events = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.paymentId, paymentId))
      .orderBy(asc(paymentEvents.eventTime));

    return events as PaymentEvent[];
  }

  /**
   * Verify the hash chain integrity for a correlation ID
   */
  async verifyHashChain(correlationId: string): Promise<{
    valid: boolean;
    discontinuityAt?: number;
    expectedHash?: string;
    actualHash?: string;
    totalEvents: number;
  }> {
    const events = await this.getEventsByCorrelation(correlationId);
    
    if (events.length === 0) {
      return { valid: true, totalEvents: 0 };
    }

    let prevHash: string | null = null;
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      
      // Check if the stored prevEventHash matches our tracking
      if (event.prevEventHash !== prevHash) {
        console.error(`[PaymentEvent] Hash chain discontinuity at event ${i} (${event.id})`);
        console.error(`  Expected prevEventHash: ${prevHash}`);
        console.error(`  Actual prevEventHash: ${event.prevEventHash}`);
        
        return {
          valid: false,
          discontinuityAt: i,
          expectedHash: prevHash,
          actualHash: event.prevEventHash || undefined,
          totalEvents: events.length
        };
      }

      // Compute what the hash should be
      const expectedHash = this.computeEventHash(
        prevHash,
        event.data,
        event.correlationId
      );

      // Check if computed hash matches stored hash
      if (event.eventHash !== expectedHash) {
        console.error(`[PaymentEvent] Hash mismatch at event ${i} (${event.id})`);
        console.error(`  Expected hash: ${expectedHash}`);
        console.error(`  Actual hash: ${event.eventHash}`);
        
        return {
          valid: false,
          discontinuityAt: i,
          expectedHash,
          actualHash: event.eventHash || undefined,
          totalEvents: events.length
        };
      }

      prevHash = event.eventHash || null;
    }

    console.log(`[PaymentEvent] Hash chain verified for correlation ${correlationId}: ${events.length} events`);
    return { valid: true, totalEvents: events.length };
  }

  /**
   * Rebuild the hash chain for a correlation ID and return terminal hash
   */
  async rebuildHashChain(correlationId: string): Promise<{
    terminalHash: string | null;
    eventCount: number;
    hashes: string[];
  }> {
    const events = await this.getEventsByCorrelation(correlationId);
    
    if (events.length === 0) {
      return { terminalHash: null, eventCount: 0, hashes: [] };
    }

    const hashes: string[] = [];
    let prevHash: string | null = null;
    
    for (const event of events) {
      const hash = this.computeEventHash(
        prevHash,
        event.data,
        event.correlationId
      );
      hashes.push(hash);
      prevHash = hash;
    }

    console.log(`[PaymentEvent] Rebuilt hash chain for correlation ${correlationId}: ${events.length} events`);
    return {
      terminalHash: prevHash,
      eventCount: events.length,
      hashes
    };
  }

  /**
   * Create a system event for automatic tracking
   */
  async createSystemEvent(
    type: string,
    data: any,
    correlationId: string,
    paymentId?: string,
    ingestionId?: string
  ): Promise<PaymentEvent> {
    return this.createEvent({
      type,
      data,
      correlationId,
      paymentId,
      ingestionId,
      actorType: 'system',
      actorId: 'payment-pipeline'
    });
  }

  /**
   * Create a human event for manual actions
   */
  async createHumanEvent(
    type: string,
    data: any,
    correlationId: string,
    userId: string,
    paymentId?: string,
    ingestionId?: string
  ): Promise<PaymentEvent> {
    return this.createEvent({
      type,
      data,
      correlationId,
      paymentId,
      ingestionId,
      actorType: 'human',
      actorId: userId
    });
  }

  /**
   * Create an AI event for AI-assisted actions
   */
  async createAIEvent(
    type: string,
    data: any,
    correlationId: string,
    aiModel: string,
    paymentId?: string,
    ingestionId?: string
  ): Promise<PaymentEvent> {
    return this.createEvent({
      type,
      data,
      correlationId,
      paymentId,
      ingestionId,
      actorType: 'ai',
      actorId: aiModel
    });
  }

  /**
   * Flag hash chain discontinuity (for verification jobs)
   */
  async flagDiscontinuity(
    correlationId: string,
    eventIndex: number,
    expectedHash: string | null,
    actualHash: string | null
  ): Promise<void> {
    console.error(`[PaymentEvent] HASH CHAIN DISCONTINUITY DETECTED!`);
    console.error(`  Correlation ID: ${correlationId}`);
    console.error(`  Event Index: ${eventIndex}`);
    console.error(`  Expected Hash: ${expectedHash}`);
    console.error(`  Actual Hash: ${actualHash}`);
    
    // In production, this would trigger alerts and notifications
    // Could also create an exception case or audit event
    
    // Create an audit event about the discontinuity
    await this.createSystemEvent(
      'hash_chain.discontinuity_detected',
      {
        correlationId,
        eventIndex,
        expectedHash,
        actualHash,
        detectedAt: new Date().toISOString()
      },
      crypto.randomUUID() // New correlation for the audit event itself
    );
  }
}