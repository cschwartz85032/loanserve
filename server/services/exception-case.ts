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
  paymentId?: number | null;
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
        paymentId: exception.paymentId,
        category: exception.category,
        subcategory: exception.subcategory,
        severity: exception.severity,
        state: exception.state || 'open',
        assignedTo: exception.assignedTo,
        aiRecommendation: exception.aiRecommendation
      })
      .returning();

    console.log(`[ExceptionCase] Created exception ${created.id}: category=${exception.category}, severity=${exception.severity}, state=${created.state}`);
    
    return created as ExceptionCase;
  }

  /**
   * Create an ACH return exception
   */
  async createAchReturnException(
    paymentId: number,
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
    paymentId: number,
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
    originalPaymentId: number,
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
          'Verify with payment processor',
          'Check for technical issues causing duplicates',
          'Initiate refund if confirmed duplicate',
          'Update idempotency controls'
        ],
        autoResolve: false
      }
    });
  }

  /**
   * Create a reconciliation variance exception
   */
  async createReconcileVarianceException(
    channel: string,
    variance: number,
    periodStart: string,
    periodEnd: string
  ): Promise<ExceptionCase> {
    const severity = this.determineVarianceSeverity(variance);
    
    return this.createException({
      category: 'reconcile_variance',
      subcategory: channel,
      severity,
      state: 'open',
      aiRecommendation: {
        channel,
        variance,
        periodStart,
        periodEnd,
        suggestedActions: [
          'Review bank statement for missing transactions',
          'Check for processing delays',
          'Verify system recording accuracy',
          'Investigate refunds or reversals',
          Math.abs(variance) > 10000 ? 'Escalate to finance team' : 'Document variance reason'
        ],
        requiresManualReview: Math.abs(variance) > 1000
      }
    });
  }

  /**
   * Update exception state
   */
  async updateExceptionState(
    id: string,
    state: ExceptionState,
    resolvedAt?: Date
  ): Promise<void> {
    await db
      .update(exceptionCases)
      .set({
        state,
        resolvedAt: resolvedAt || (state === 'resolved' ? new Date() : null)
      })
      .where(eq(exceptionCases.id, id));

    console.log(`[ExceptionCase] Updated exception ${id} state to ${state}`);
  }

  /**
   * Assign exception to user
   */
  async assignException(id: string, assignedTo: string): Promise<void> {
    await db
      .update(exceptionCases)
      .set({
        assignedTo,
        state: 'pending'
      })
      .where(eq(exceptionCases.id, id));

    console.log(`[ExceptionCase] Assigned exception ${id} to ${assignedTo}`);
  }

  /**
   * Get open exceptions by severity
   */
  async getOpenExceptionsBySeverity(severity?: ExceptionSeverity): Promise<ExceptionCase[]> {
    const conditions = [eq(exceptionCases.state, 'open')];
    if (severity) {
      conditions.push(eq(exceptionCases.severity, severity));
    }

    const results = await db
      .select()
      .from(exceptionCases)
      .where(and(...conditions))
      .orderBy(exceptionCases.createdAt);

    return results as ExceptionCase[];
  }

  /**
   * Get exceptions by category
   */
  async getExceptionsByCategory(category: ExceptionCategory): Promise<ExceptionCase[]> {
    const results = await db
      .select()
      .from(exceptionCases)
      .where(eq(exceptionCases.category, category))
      .orderBy(exceptionCases.createdAt);

    return results as ExceptionCase[];
  }

  /**
   * Determine ACH return severity based on return code
   */
  private determineAchReturnSeverity(returnCode: string): ExceptionSeverity {
    // R01 (Insufficient Funds), R09 (Uncollected Funds)
    if (['R01', 'R09'].includes(returnCode)) {
      return 'medium';
    }
    // R02 (Account Closed), R03 (No Account), R04 (Invalid Account)
    if (['R02', 'R03', 'R04'].includes(returnCode)) {
      return 'high';
    }
    // R05 (Unauthorized), R07 (Authorization Revoked), R08 (Payment Stopped)
    if (['R05', 'R07', 'R08', 'R10', 'R29'].includes(returnCode)) {
      return 'critical';
    }
    return 'low';
  }

  /**
   * Get suggested actions for ACH return codes
   */
  private getAchReturnSuggestedActions(returnCode: string): string[] {
    const actions: Record<string, string[]> = {
      'R01': ['Retry after payday', 'Contact customer for alternate payment'],
      'R02': ['Update account information', 'Request new payment method'],
      'R03': ['Verify account details', 'Contact customer immediately'],
      'R04': ['Correct account number', 'Verify with customer'],
      'R05': ['Obtain new authorization', 'Verify mandate status'],
      'R07': ['Stop future attempts', 'Contact customer for new authorization'],
      'R08': ['Do not retry', 'Contact customer for resolution'],
      'R09': ['Retry in 2 business days', 'Monitor account status'],
      'R10': ['Do not retry', 'Customer disputed - investigate'],
      'R29': ['Do not retry', 'Corporate customer not authorized']
    };
    
    return actions[returnCode] || ['Review return reason', 'Contact support'];
  }

  /**
   * Determine variance severity based on amount
   */
  private determineVarianceSeverity(variance: number): ExceptionSeverity {
    const absVariance = Math.abs(variance);
    
    if (absVariance < 100) {
      return 'low';
    } else if (absVariance < 1000) {
      return 'medium';
    } else if (absVariance < 10000) {
      return 'high';
    } else {
      return 'critical';
    }
  }

  /**
   * Calculate retry date based on attempt count
   */
  private calculateRetryDate(attemptCount: number): Date {
    const now = new Date();
    const daysToAdd = attemptCount <= 1 ? 3 : attemptCount <= 2 ? 7 : 14;
    now.setDate(now.getDate() + daysToAdd);
    return now;
  }
}