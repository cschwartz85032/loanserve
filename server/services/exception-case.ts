import { db } from '../db';
import { exceptionCases } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';

export type ExceptionCategory = 
  | 'ach_return' 
  | 'nsf' 
  | 'wire_recall' 
  | 'duplicate' 
  | 'dispute' 
  | 'reconcile_variance';

export type ExceptionSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ExceptionState = 'open' | 'pending' | 'resolved' | 'cancelled';

export interface ExceptionCase {
  id?: string;
  ingestionId?: string | null;
  paymentId?: string | null; // Changed to string for UUID
  category: ExceptionCategory;
  subcategory?: string | null;
  severity: ExceptionSeverity;
  state: ExceptionState;
  assignedTo?: string | null;
  aiRecommendation?: any;
  createdAt?: Date;
  resolvedAt?: Date | null;
}

export class ExceptionCaseService {
  /**
   * Create a new exception case
   */
  async createException(exception: ExceptionCase): Promise<ExceptionCase> {
    const [created] = await db
      .insert(exceptionCases)
      .values({
        ingestionId: exception.ingestionId,
        paymentId: exception.paymentId ? parseInt(exception.paymentId) : undefined, // Convert to int for DB until schema is fixed
        category: exception.category,
        subcategory: exception.subcategory,
        severity: exception.severity,
        state: exception.state || 'open',
        assignedTo: exception.assignedTo,
        aiRecommendation: exception.aiRecommendation
      })
      .returning();

    console.log(`[ExceptionCase] Created exception ${created.id}: category=${exception.category}, severity=${exception.severity}, state=${created.state}`);
    
    return {
      ...created,
      paymentId: created.paymentId?.toString() // Convert back to string for consistency
    } as ExceptionCase;
  }

  /**
   * Create an ACH return exception
   */
  async createAchReturnException(
    paymentId: string, // Changed to string
    returnCode: string,
    returnReason: string,
    amount: number
  ): Promise<ExceptionCase> {
    const severity = this.determineAchReturnSeverity(returnCode);
    
    return this.createException({
      paymentId,
      category: 'ach_return',
      subcategory: returnCode,
      severity,
      state: 'open',
      aiRecommendation: {
        returnCode,
        returnReason,
        amount,
        suggestedActions: this.getAchReturnSuggestedActions(returnCode),
        autoResolve: severity === 'low'
      }
    });
  }

  /**
   * Create an NSF (Non-Sufficient Funds) exception
   */
  async createNsfException(
    paymentId: string, // Changed to string
    amount: number,
    attemptCount: number
  ): Promise<ExceptionCase> {
    const severity: ExceptionSeverity = attemptCount > 2 ? 'high' : 'medium';
    
    return this.createException({
      paymentId,
      category: 'nsf',
      severity,
      state: 'open',
      aiRecommendation: {
        amount,
        attemptCount,
        suggestedActions: [
          'Contact customer for updated payment method',
          'Schedule retry after payday',
          'Offer payment plan if recurring NSF',
          attemptCount > 2 ? 'Consider account suspension' : 'Monitor for pattern'
        ],
        recommendedRetryDate: this.calculateRetryDate(attemptCount)
      }
    });
  }

  /**
   * Create a duplicate payment exception
   */
  async createDuplicateException(
    ingestionId: string,
    originalPaymentId: string, // Changed to string
    duplicateAmount: number
  ): Promise<ExceptionCase> {
    return this.createException({
      ingestionId,
      paymentId: originalPaymentId,
      category: 'duplicate',
      severity: 'medium',
      state: 'pending',
      aiRecommendation: {
        originalPaymentId,
        duplicateAmount,
        suggestedActions: [
          'Verify duplicate payment',
          'Refund if confirmed duplicate',
          'Update reconciliation records'
        ],
        autoResolve: false
      }
    });
  }

  /**
   * Create a wire recall exception
   */
  async createWireRecallException(
    paymentId: string, // Changed to string
    recallReason: string,
    amount: number
  ): Promise<ExceptionCase> {
    const severity = this.determineWireRecallSeverity(recallReason);
    
    return this.createException({
      paymentId,
      category: 'wire_recall',
      subcategory: recallReason,
      severity,
      state: 'pending',
      aiRecommendation: {
        recallReason,
        amount,
        suggestedActions: this.getWireRecallSuggestedActions(recallReason),
        requiresApproval: true
      }
    });
  }

  /**
   * Create a reconciliation variance exception
   */
  async createReconciliationVarianceException(
    expectedAmount: number,
    actualAmount: number,
    referenceId: string,
    source: string
  ): Promise<ExceptionCase> {
    const variance = Math.abs(expectedAmount - actualAmount);
    const severity: ExceptionSeverity = variance > 1000 ? 'high' : variance > 100 ? 'medium' : 'low';
    
    return this.createException({
      category: 'reconcile_variance',
      severity,
      state: 'open',
      aiRecommendation: {
        expectedAmount,
        actualAmount,
        variance,
        referenceId,
        source,
        suggestedActions: [
          'Review transaction details',
          'Check for timing differences',
          'Verify exchange rates if applicable',
          'Contact counterparty if needed'
        ]
      }
    });
  }

  /**
   * Get exception by ID
   */
  async getException(id: string): Promise<ExceptionCase | null> {
    const [exception] = await db
      .select()
      .from(exceptionCases)
      .where(eq(exceptionCases.id, id))
      .limit(1);

    if (!exception) return null;

    return {
      ...exception,
      paymentId: exception.paymentId?.toString() // Convert to string for consistency
    } as ExceptionCase;
  }

  /**
   * Get exceptions by payment ID
   */
  async getExceptionsByPaymentId(paymentId: string): Promise<ExceptionCase[]> {
    const exceptions = await db
      .select()
      .from(exceptionCases)
      .where(eq(exceptionCases.paymentId, parseInt(paymentId))); // Convert to int for query

    return exceptions.map(e => ({
      ...e,
      paymentId: e.paymentId?.toString() // Convert back to string
    })) as ExceptionCase[];
  }

  /**
   * Get open exceptions
   */
  async getOpenExceptions(
    category?: ExceptionCategory,
    severity?: ExceptionSeverity
  ): Promise<ExceptionCase[]> {
    let query = db
      .select()
      .from(exceptionCases)
      .where(eq(exceptionCases.state, 'open'));

    if (category) {
      query = query.where(and(
        eq(exceptionCases.state, 'open'),
        eq(exceptionCases.category, category)
      ));
    }

    if (severity) {
      query = query.where(and(
        eq(exceptionCases.state, 'open'),
        eq(exceptionCases.severity, severity)
      ));
    }

    const exceptions = await query;
    
    return exceptions.map(e => ({
      ...e,
      paymentId: e.paymentId?.toString() // Convert to string
    })) as ExceptionCase[];
  }

  /**
   * Resolve exception
   */
  async resolveException(
    id: string,
    resolution?: string,
    resolvedBy?: string
  ): Promise<void> {
    await db
      .update(exceptionCases)
      .set({
        state: 'resolved',
        resolvedAt: new Date(),
        aiRecommendation: resolution ? 
          { resolution, resolvedBy } : 
          undefined
      })
      .where(eq(exceptionCases.id, id));

    console.log(`[ExceptionCase] Resolved exception ${id}`);
  }

  /**
   * Cancel exception
   */
  async cancelException(id: string, reason?: string): Promise<void> {
    await db
      .update(exceptionCases)
      .set({
        state: 'cancelled',
        aiRecommendation: reason ? { cancellationReason: reason } : undefined
      })
      .where(eq(exceptionCases.id, id));

    console.log(`[ExceptionCase] Cancelled exception ${id}`);
  }

  /**
   * Assign exception to user
   */
  async assignException(id: string, assignedTo: string): Promise<void> {
    await db
      .update(exceptionCases)
      .set({ assignedTo })
      .where(eq(exceptionCases.id, id));

    console.log(`[ExceptionCase] Assigned exception ${id} to ${assignedTo}`);
  }

  /**
   * Determine ACH return severity
   */
  private determineAchReturnSeverity(returnCode: string): ExceptionSeverity {
    // Critical codes that require immediate attention
    const criticalCodes = ['R02', 'R03', 'R04', 'R20']; // Account closed, no account, invalid account
    
    // High severity codes
    const highCodes = ['R05', 'R07', 'R10', 'R29', 'R16']; // Unauthorized, disputes
    
    // Medium severity codes
    const mediumCodes = ['R01', 'R06', 'R08', 'R09', 'R11', 'R12', 'R31']; // NSF, holds, etc
    
    if (criticalCodes.includes(returnCode)) return 'critical';
    if (highCodes.includes(returnCode)) return 'high';
    if (mediumCodes.includes(returnCode)) return 'medium';
    
    return 'low';
  }

  /**
   * Determine wire recall severity
   */
  private determineWireRecallSeverity(recallReason: string): ExceptionSeverity {
    const highSeverityReasons = ['FRAUD', 'INCORRECT_BENEFICIARY', 'DUPLICATE'];
    
    if (highSeverityReasons.includes(recallReason)) return 'high';
    
    return 'medium';
  }

  /**
   * Get ACH return suggested actions
   */
  private getAchReturnSuggestedActions(returnCode: string): string[] {
    const actionMap: Record<string, string[]> = {
      R01: ['Contact customer for updated payment method', 'Schedule retry after payday'],
      R02: ['Remove account from system', 'Request updated banking information'],
      R03: ['Verify account number', 'Contact customer for correct information'],
      R04: ['Correct account number', 'Verify with customer'],
      R05: ['Investigate authorization', 'Contact customer', 'File dispute response if valid'],
      R07: ['Stop future debits', 'Remove authorization', 'Contact customer'],
      R10: ['Provide proof of authorization', 'Stop future debits if unauthorized'],
      R29: ['Verify corporate authorization', 'Update authorization records']
    };

    return actionMap[returnCode] || ['Review return reason', 'Take appropriate action'];
  }

  /**
   * Get wire recall suggested actions
   */
  private getWireRecallSuggestedActions(recallReason: string): string[] {
    const actionMap: Record<string, string[]> = {
      FRAUD: ['Hold funds immediately', 'Investigate transaction', 'File SAR if confirmed'],
      DUPLICATE: ['Verify duplicate', 'Reverse if confirmed', 'Update records'],
      INCORRECT_BENEFICIARY: ['Verify beneficiary', 'Return funds', 'Update beneficiary records'],
      INCORRECT_AMOUNT: ['Verify correct amount', 'Adjust if needed', 'Document variance'],
      CUSTOMER_REQUEST: ['Verify request authenticity', 'Process cancellation', 'Document reason']
    };

    return actionMap[recallReason] || ['Review recall reason', 'Process according to policy'];
  }

  /**
   * Calculate retry date based on attempt count
   */
  private calculateRetryDate(attemptCount: number): string {
    const daysToAdd = Math.min(attemptCount * 3, 14); // Max 14 days
    const retryDate = new Date();
    retryDate.setDate(retryDate.getDate() + daysToAdd);
    return retryDate.toISOString().split('T')[0];
  }
}

// Export singleton instance
export const exceptionCaseService = new ExceptionCaseService();