/**
 * Returns and Recalls Exception Handler
 * Automates compensations for NSF, ACH returns, wire recalls, disputes
 */

import { db } from '../db';
import { 
  payments,
  ledgerEntries,
  outboxMessages,
  paymentEvents,
  exceptionCases
} from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { ExceptionCaseService } from './exception-case';
import crypto from 'crypto';
import Decimal from 'decimal.js';

// ACH Return Codes Mapping
const ACH_RETURN_MAP: Record<string, { reason: string; severity: "medium"|"high"; action: "reverse"|"hold"|"dispute" }> = {
  R01: { reason: "Insufficient funds", severity: "medium", action: "reverse" },
  R02: { reason: "Account closed", severity: "high", action: "reverse" },
  R03: { reason: "No account/unable to locate", severity: "high", action: "reverse" },
  R04: { reason: "Invalid account number", severity: "high", action: "reverse" },
  R05: { reason: "Unauthorized debit to consumer account", severity: "high", action: "dispute" },
  R06: { reason: "Returned per ODFI request", severity: "medium", action: "reverse" },
  R07: { reason: "Authorization revoked by customer", severity: "high", action: "dispute" },
  R08: { reason: "Payment stopped", severity: "high", action: "reverse" },
  R09: { reason: "Uncollected funds", severity: "medium", action: "hold" },
  R10: { reason: "Customer advises not authorized", severity: "high", action: "dispute" },
  R11: { reason: "Check truncation entry return", severity: "medium", action: "reverse" },
  R12: { reason: "Account sold to another DFI", severity: "medium", action: "reverse" },
  R16: { reason: "Account frozen", severity: "high", action: "hold" },
  R20: { reason: "Non-transaction account", severity: "high", action: "reverse" },
  R29: { reason: "Corporate not authorized", severity: "high", action: "dispute" },
  R31: { reason: "Permissible return", severity: "medium", action: "reverse" }
};

// Wire Recall Codes
const WIRE_RECALL_MAP: Record<string, { reason: string; severity: "medium"|"high"; action: "reverse"|"hold"|"dispute" }> = {
  FRAUD: { reason: "Suspected fraud", severity: "high", action: "hold" },
  DUPLICATE: { reason: "Duplicate wire", severity: "high", action: "reverse" },
  INCORRECT_BENEFICIARY: { reason: "Incorrect beneficiary", severity: "high", action: "reverse" },
  INCORRECT_AMOUNT: { reason: "Incorrect amount", severity: "high", action: "hold" },
  CUSTOMER_REQUEST: { reason: "Customer requested cancellation", severity: "medium", action: "reverse" }
};

export class ReturnsHandler {
  private exceptionCaseService = new ExceptionCaseService();

  /**
   * Handle ACH return
   */
  async handleACHReturn(
    paymentId: string,
    returnCode: string,
    returnDate: Date,
    metadata?: any
  ): Promise<void> {
    const returnInfo = ACH_RETURN_MAP[returnCode];
    if (!returnInfo) {
      console.warn(`[ReturnsHandler] Unknown ACH return code: ${returnCode}`);
      await this.handleUnknownReturn(paymentId, returnCode, 'ACH');
      return;
    }

    console.log(`[ReturnsHandler] Processing ACH return ${returnCode} for payment ${paymentId}: ${returnInfo.reason}`);

    switch (returnInfo.action) {
      case 'reverse':
        await this.compensate(paymentId, returnInfo.reason, returnCode);
        break;
      case 'dispute':
        await this.openDispute(paymentId, returnInfo.reason, returnCode, returnInfo.severity);
        break;
      case 'hold':
        await this.holdPayment(paymentId, returnInfo.reason, returnCode);
        break;
    }

    // Log the return event
    await this.logReturnEvent(paymentId, 'ach_return', returnCode, returnInfo, returnDate, metadata);
  }

  /**
   * Handle wire recall
   */
  async handleWireRecall(
    paymentId: string,
    recallReason: string,
    recallDate: Date,
    metadata?: any
  ): Promise<void> {
    const recallInfo = WIRE_RECALL_MAP[recallReason] || {
      reason: recallReason,
      severity: "high" as const,
      action: "hold" as const
    };

    console.log(`[ReturnsHandler] Processing wire recall for payment ${paymentId}: ${recallInfo.reason}`);

    switch (recallInfo.action) {
      case 'reverse':
        await this.compensate(paymentId, recallInfo.reason, `WIRE_RECALL_${recallReason}`);
        break;
      case 'dispute':
        await this.openDispute(paymentId, recallInfo.reason, `WIRE_RECALL_${recallReason}`, recallInfo.severity);
        break;
      case 'hold':
        await this.holdPayment(paymentId, recallInfo.reason, `WIRE_RECALL_${recallReason}`);
        break;
    }

    // Log the recall event
    await this.logReturnEvent(paymentId, 'wire_recall', recallReason, recallInfo, recallDate, metadata);
  }

  /**
   * Compensate (reverse) a payment
   */
  async compensate(paymentId: string, reason: string, code?: string): Promise<void> {
    try {
      await db.transaction(async tx => {
        // Check if payment exists
        const [payment] = await tx.select()
          .from(payments)
          .where(eq(payments.id, paymentId))
          .limit(1);

        if (!payment) {
          // Payment not found - open exception case for orphan return
          await this.openOrphanReturnCase(paymentId, reason, code);
          throw new Error(`Payment not found: ${paymentId}`);
        }

        // Check for existing reversal to ensure idempotency
        const [existingReversal] = await tx.select()
          .from(paymentEvents)
          .where(
            and(
              eq(paymentEvents.paymentId, paymentId),
              eq(paymentEvents.type, 'payment.reversed')
            )
          )
          .limit(1);

        if (existingReversal) {
          console.log(`[ReturnsHandler] Payment ${paymentId} already reversed, skipping`);
          return;
        }

        // Get original ledger entries
        const originalEntries = await tx.select()
          .from(ledgerEntries)
          .where(
            and(
              sql`${ledgerEntries.metadata}->>'referenceType' = 'payment'`,
              sql`${ledgerEntries.metadata}->>'referenceId' = ${paymentId}`
            )
          );

        // Create reversal ledger entries
        const reversalEntries = this.createReversalLedgerEntries(originalEntries, paymentId, reason);
        if (reversalEntries.length > 0) {
          await tx.insert(ledgerEntries).values(reversalEntries);
        }

        // Update payment status
        await tx.update(payments)
          .set({ 
            status: 'reversed',
            notes: sql`COALESCE(notes, '') || '\nReversed: ' || ${code ?? reason} || ' at ' || ${new Date().toISOString()}`
          })
          .where(eq(payments.id, paymentId));

        // Create outbox message
        await tx.insert(outboxMessages).values({
          aggregateType: 'payments',
          aggregateId: paymentId,
          eventType: 'payment.reversed',
          payload: {
            payment_id: paymentId,
            reason,
            code,
            timestamp: new Date().toISOString()
          }
        });

        // Get previous event hash
        const prevHash = await this.getPrevEventHash(tx, paymentId);

        // Create payment event
        const correlationId = crypto.randomUUID();
        const eventData = { reason, code };
        const eventHash = this.computeEventHash(prevHash, eventData, correlationId);

        await tx.insert(paymentEvents).values({
          paymentId,
          type: 'payment.reversed',
          actorType: 'system',
          correlationId,
          data: eventData,
          prevEventHash: prevHash,
          eventHash
        });
      });

      console.log(`[ReturnsHandler] Successfully reversed payment ${paymentId}`);
    } catch (error) {
      console.error(`[ReturnsHandler] Error compensating payment ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Open a dispute case
   */
  private async openDispute(
    paymentId: string,
    reason: string,
    code: string,
    severity: "medium" | "high"
  ): Promise<void> {
    // Create exception case for dispute
    const severityMap = {
      'medium': 'medium' as const,
      'high': 'high' as const
    };
    
    await this.exceptionCaseService.createAchReturnException(
      paymentId,
      code,
      reason,
      0 // Amount will be fetched from payment record
    );

    // Update payment status to disputed (use 'failed' as closest status)
    await db.update(payments)
      .set({ 
        status: 'failed',
        notes: sql`COALESCE(notes, '') || '\nDisputed: ' || ${code} || ' - ' || ${reason}`
      })
      .where(eq(payments.id, paymentId));
  }

  /**
   * Hold a payment
   */
  private async holdPayment(
    paymentId: string,
    reason: string,
    code: string
  ): Promise<void> {
    await db.update(payments)
      .set({ 
        status: 'pending',
        notes: sql`COALESCE(notes, '') || '\nOn Hold: ' || ${code} || ' - ' || ${reason}`
      })
      .where(eq(payments.id, paymentId));

    // Create payment event
    await db.insert(paymentEvents).values({
      paymentId,
      type: 'payment.held',
      actorType: 'system',
      correlationId: crypto.randomUUID(),
      data: { reason, code }
    });
  }

  /**
   * Create reversal ledger entries
   */
  private createReversalLedgerEntries(
    originalEntries: any[],
    paymentId: string,
    reason: string
  ): any[] {
    const correlationId = crypto.randomUUID();
    return originalEntries.map(entry => ({
      paymentId,
      entryDate: new Date().toISOString().split('T')[0],
      accountType: entry.accountType,
      accountCode: entry.accountCode,
      debitAmount: entry.creditAmount, // Reverse the amounts
      creditAmount: entry.debitAmount, // Reverse the amounts
      description: `Reversal: ${reason}`,
      correlationId,
      metadata: {
        referenceType: 'payment_reversal',
        referenceId: paymentId,
        originalEntryId: entry.id,
        reversalReason: reason
      }
    }));
  }

  /**
   * Get previous event hash for a payment
   */
  private async getPrevEventHash(tx: any, paymentId: string): Promise<string | null> {
    const [lastEvent] = await tx.select()
      .from(paymentEvents)
      .where(eq(paymentEvents.paymentId, paymentId))
      .orderBy(desc(paymentEvents.eventTime))
      .limit(1);

    return lastEvent?.eventHash || null;
  }

  /**
   * Compute event hash
   */
  private computeEventHash(
    prevHash: string | null,
    data: any,
    correlationId: string
  ): string {
    const content = JSON.stringify({
      prevHash,
      data,
      correlationId,
      timestamp: new Date().toISOString()
    });

    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
  }

  /**
   * Handle orphan return (payment not found)
   */
  private async openOrphanReturnCase(
    paymentId: string,
    reason: string,
    code?: string
  ): Promise<void> {
    // Since payment doesn't exist, we can't use the standard exception service
    // We'll create a direct exception case
    await db.insert(exceptionCases).values({
      paymentId: undefined, // No valid payment
      category: 'ach_return',
      subcategory: 'orphan_return',
      severity: 'high',
      state: 'open',
      aiRecommendation: {
        paymentId,
        returnReason: reason,
        returnCode: code,
        orphanPayment: true,
        suggestedActions: [
          'Research payment in external systems',
          'Check for data entry errors',
          'Verify payment ID mapping',
          'Contact originator for clarification'
        ]
      }
    });
  }

  /**
   * Handle unknown return code
   */
  private async handleUnknownReturn(
    paymentId: string,
    code: string,
    type: 'ACH' | 'WIRE'
  ): Promise<void> {
    await db.insert(exceptionCases).values({
      paymentId: undefined,
      category: type === 'ACH' ? 'ach_return' : 'wire_recall',
      subcategory: `unknown_${code}`,
      severity: 'medium',
      state: 'open',
      aiRecommendation: {
        paymentId,
        returnCode: code,
        returnType: type,
        suggestedActions: [
          'Research return code definition',
          'Contact financial institution',
          'Update return code mapping',
          'Process manually if valid'
        ]
      }
    });
  }

  /**
   * Log return event
   */
  private async logReturnEvent(
    paymentId: string,
    eventType: string,
    code: string,
    info: any,
    returnDate: Date,
    metadata?: any
  ): Promise<void> {
    await db.insert(paymentEvents).values({
      paymentId,
      type: `return.${eventType}`,
      actorType: 'system',
      correlationId: crypto.randomUUID(),
      data: {
        code,
        reason: info.reason,
        severity: info.severity,
        action: info.action,
        returnDate: returnDate.toISOString(),
        metadata
      }
    });
  }

  /**
   * Simulate R01 return for testing
   */
  async simulateR01Return(paymentId: string): Promise<void> {
    console.log(`[ReturnsHandler] Simulating R01 return for payment ${paymentId}`);
    await this.handleACHReturn(
      paymentId,
      'R01',
      new Date(),
      { simulated: true }
    );
  }

  /**
   * Simulate R10 unauthorized return for testing
   */
  async simulateR10Return(paymentId: string): Promise<void> {
    console.log(`[ReturnsHandler] Simulating R10 unauthorized return for payment ${paymentId}`);
    await this.handleACHReturn(
      paymentId,
      'R10',
      new Date(),
      { simulated: true }
    );
  }
}

// Export singleton instance
export const returnsHandler = new ReturnsHandler();