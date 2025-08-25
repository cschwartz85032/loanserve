import { db } from '../db';
import { loans, payments, paymentEvents } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { PaymentEventService } from './payment-event';
import { randomUUID } from 'crypto';

// Waterfall allocation input interface
export interface WaterfallInput {
  amountCents: number;
  due: {
    fees: number;
    interest: number;
    principal: number;
    escrowShortage: number;
  };
  policy: {
    allowPrincipal: boolean;
    allowInterest: boolean;
    allowFees: boolean;
    allowEscrow: boolean;
    defaultLoan: boolean;
  };
}

// Waterfall allocation result
export interface WaterfallResult {
  xF: number;  // Allocated to fees
  xI: number;  // Allocated to interest
  xP: number;  // Allocated to principal
  xE: number;  // Allocated to escrow
  suspense: number;  // Remaining unallocated
}

// Rail types for posting triggers
export type PaymentRail = 
  | 'ach'
  | 'check'
  | 'wire'
  | 'realtime'
  | 'card'
  | 'paypal'
  | 'venmo'
  | 'zelle'
  | 'cash';

// Rail posting configuration
export interface RailPostingConfig {
  rail: PaymentRail;
  postOnEvents: string[];
  requiresSettlement: boolean;
  settlingTimeHours: number;
  autoPost: boolean;
}

// Posting decision result
export interface PostingDecision {
  shouldPost: boolean;
  reason: string;
  delayUntil?: Date;
  requiresManualReview: boolean;
}

// Rail configurations
const RAIL_CONFIGS: Record<PaymentRail, RailPostingConfig> = {
  ach: {
    rail: 'ach',
    postOnEvents: ['settled', 'cleared'],
    requiresSettlement: true,
    settlingTimeHours: 72,
    autoPost: true
  },
  check: {
    rail: 'check',
    postOnEvents: ['settled', 'cleared'],
    requiresSettlement: true,
    settlingTimeHours: 120,
    autoPost: true
  },
  wire: {
    rail: 'wire',
    postOnEvents: ['completed'],
    requiresSettlement: false,
    settlingTimeHours: 0,
    autoPost: true
  },
  realtime: {
    rail: 'realtime',
    postOnEvents: ['completed'],
    requiresSettlement: false,
    settlingTimeHours: 0,
    autoPost: true
  },
  card: {
    rail: 'card',
    postOnEvents: ['capture', 'settlement'],
    requiresSettlement: true,
    settlingTimeHours: 48,
    autoPost: true
  },
  paypal: {
    rail: 'paypal',
    postOnEvents: ['capture', 'settlement'],
    requiresSettlement: true,
    settlingTimeHours: 24,
    autoPost: true
  },
  venmo: {
    rail: 'venmo',
    postOnEvents: ['capture', 'settlement'],
    requiresSettlement: true,
    settlingTimeHours: 24,
    autoPost: true
  },
  zelle: {
    rail: 'zelle',
    postOnEvents: ['completed'],
    requiresSettlement: false,
    settlingTimeHours: 0,
    autoPost: true
  },
  cash: {
    rail: 'cash',
    postOnEvents: ['received'],
    requiresSettlement: false,
    settlingTimeHours: 0,
    autoPost: true
  }
};

export class RulesEngine {
  private paymentEventService: PaymentEventService;

  constructor() {
    this.paymentEventService = new PaymentEventService();
  }

  // Core waterfall allocation function
  applyWaterfall(w: WaterfallInput): WaterfallResult {
    let A = w.amountCents;
    
    // Apply allocations in order: Fees, Interest, Principal, Escrow
    const xF = w.policy.allowFees ? Math.min(A, w.due.fees) : 0;
    A -= xF;
    
    const xI = w.policy.allowInterest ? Math.min(A, w.due.interest) : 0;
    A -= xI;
    
    const xP = w.policy.allowPrincipal ? Math.min(A, w.due.principal) : 0;
    A -= xP;
    
    const xE = w.policy.allowEscrow ? Math.min(A, w.due.escrowShortage) : 0;
    A -= xE;
    
    const suspense = A;
    
    return { xF, xI, xP, xE, suspense };
  }

  // Validate waterfall result
  validateWaterfallResult(input: WaterfallInput, result: WaterfallResult): boolean {
    // Property 1: Conservation of cents
    const totalAllocated = result.xF + result.xI + result.xP + result.xE + result.suspense;
    if (totalAllocated !== input.amountCents) {
      console.error('[RulesEngine] Conservation of cents failed:', {
        input: input.amountCents,
        allocated: totalAllocated,
        difference: input.amountCents - totalAllocated
      });
      return false;
    }

    // Property 2: No negative components
    if (result.xF < 0 || result.xI < 0 || result.xP < 0 || result.xE < 0 || result.suspense < 0) {
      console.error('[RulesEngine] Negative component detected:', result);
      return false;
    }

    // Property 3: Allocations don't exceed dues
    if (result.xF > input.due.fees || 
        result.xI > input.due.interest || 
        result.xP > input.due.principal || 
        result.xE > input.due.escrowShortage) {
      console.error('[RulesEngine] Allocation exceeds due amount:', result);
      return false;
    }

    // Property 4: Policy compliance
    if (!input.policy.allowFees && result.xF > 0) return false;
    if (!input.policy.allowInterest && result.xI > 0) return false;
    if (!input.policy.allowPrincipal && result.xP > 0) return false;
    if (!input.policy.allowEscrow && result.xE > 0) return false;

    return true;
  }

  // Get policy based on loan status
  getPolicyForLoanStatus(loanStatus: string): WaterfallInput['policy'] {
    const policies: Record<string, WaterfallInput['policy']> = {
      current: {
        allowPrincipal: true,
        allowInterest: true,
        allowFees: true,
        allowEscrow: true,
        defaultLoan: false
      },
      delinquent: {
        allowPrincipal: true,
        allowInterest: true,
        allowFees: true,
        allowEscrow: true,
        defaultLoan: false
      },
      default: {
        allowPrincipal: false,
        allowInterest: true,
        allowFees: true,
        allowEscrow: false,
        defaultLoan: true
      },
      charged_off: {
        allowPrincipal: false,
        allowInterest: false,
        allowFees: true,
        allowEscrow: false,
        defaultLoan: true
      },
      forbearance: {
        allowPrincipal: false,
        allowInterest: false,
        allowFees: false,
        allowEscrow: true,
        defaultLoan: false
      }
    };

    return policies[loanStatus] || policies.current;
  }

  // Calculate due amounts for a loan
  async calculateDueAmounts(loanId: number): Promise<WaterfallInput['due']> {
    try {
      const loan = await db
        .select()
        .from(loans)
        .where(eq(loans.id, loanId))
        .limit(1);

      if (loan.length === 0) {
        throw new Error(`Loan ${loanId} not found`);
      }

      const loanData = loan[0];
      
      // Calculate based on loan data
      // These would normally come from complex calculations
      const monthlyPayment = parseFloat(loanData.paymentAmount || '0');
      const interestRate = parseFloat(loanData.interestRate || '0') / 100 / 12;
      const currentBalance = parseFloat(loanData.principalBalance || '0');
      
      const interestDue = Math.round(currentBalance * interestRate * 100);
      const principalDue = Math.round((monthlyPayment * 100) - interestDue);
      
      return {
        fees: 0, // Would calculate late fees, etc.
        interest: interestDue,
        principal: principalDue,
        escrowShortage: 0 // Would calculate from escrow analysis
      };
    } catch (error) {
      console.error('[RulesEngine] Error calculating due amounts:', error);
      throw error;
    }
  }

  // Determine if payment should post based on rail and event
  getPostingDecision(rail: PaymentRail, event: string, metadata?: any): PostingDecision {
    const config = RAIL_CONFIGS[rail];
    
    if (!config) {
      return {
        shouldPost: false,
        reason: `Unknown payment rail: ${rail}`,
        requiresManualReview: true
      };
    }

    // Check if event triggers posting
    const shouldPost = config.postOnEvents.includes(event);
    
    if (!shouldPost) {
      return {
        shouldPost: false,
        reason: `Rail ${rail} does not post on event ${event}. Posts on: ${config.postOnEvents.join(', ')}`,
        requiresManualReview: false
      };
    }

    // Check if settlement is required
    if (config.requiresSettlement && event !== 'settled' && event !== 'settlement') {
      const delayHours = config.settlingTimeHours;
      const delayUntil = new Date(Date.now() + delayHours * 60 * 60 * 1000);
      
      return {
        shouldPost: false,
        reason: `Rail ${rail} requires settlement. Waiting ${delayHours} hours.`,
        delayUntil,
        requiresManualReview: false
      };
    }

    // Auto-post if configured
    if (config.autoPost) {
      return {
        shouldPost: true,
        reason: `Rail ${rail} auto-posts on ${event}`,
        requiresManualReview: false
      };
    }

    return {
      shouldPost: false,
      reason: `Rail ${rail} requires manual review`,
      requiresManualReview: true
    };
  }

  // Apply rules to payment and determine allocation
  async applyRulesToPayment(paymentId: number, rail: PaymentRail, event: string): Promise<{
    allocation: WaterfallResult | null;
    postingDecision: PostingDecision;
    validationPassed: boolean;
  }> {
    try {
      // Get payment details
      const payment = await db
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);

      if (payment.length === 0) {
        throw new Error(`Payment ${paymentId} not found`);
      }

      const paymentData = payment[0];
      const loanId = paymentData.loanId;

      if (!loanId) {
        throw new Error(`Payment ${paymentId} has no associated loan`);
      }

      // Get loan details
      const loan = await db
        .select()
        .from(loans)
        .where(eq(loans.id, loanId))
        .limit(1);

      if (loan.length === 0) {
        throw new Error(`Loan ${loanId} not found`);
      }

      const loanData = loan[0];

      // Get posting decision
      const postingDecision = this.getPostingDecision(rail, event);

      if (!postingDecision.shouldPost) {
        return {
          allocation: null,
          postingDecision,
          validationPassed: true
        };
      }

      // Calculate due amounts
      const due = await this.calculateDueAmounts(loanId);

      // Get policy based on loan status
      const policy = this.getPolicyForLoanStatus(loanData.status || 'current');

      // Create waterfall input
      const waterfallInput: WaterfallInput = {
        amountCents: Math.round(parseFloat(paymentData.totalReceived) * 100),
        due,
        policy
      };

      // Apply waterfall
      const allocation = this.applyWaterfall(waterfallInput);

      // Validate result
      const validationPassed = this.validateWaterfallResult(waterfallInput, allocation);

      if (!validationPassed) {
        console.error('[RulesEngine] Waterfall validation failed for payment:', paymentId);
      }

      // Log rule application event
      await this.paymentEventService.createEvent({
        type: 'rules.applied',
        eventTime: new Date(),
        actorType: 'system',
        actorId: 'rules-engine',
        correlationId: randomUUID(),
        data: {
          paymentId,
          rail,
          event,
          waterfallInput,
          allocation,
          postingDecision,
          validationPassed
        }
      });

      return {
        allocation,
        postingDecision,
        validationPassed
      };

    } catch (error) {
      console.error('[RulesEngine] Error applying rules:', error);
      throw error;
    }
  }

  // Store allocation result in payment record
  async storeAllocation(
    paymentId: number,
    allocation: WaterfallResult,
    correlationId: string
  ): Promise<void> {
    try {
      // Update the payment record with allocation amounts
      await db
        .update(payments)
        .set({
          principalAmount: (allocation.xP / 100).toFixed(2),
          interestAmount: (allocation.xI / 100).toFixed(2),
          escrowAmount: (allocation.xE / 100).toFixed(2),
          otherFeeAmount: (allocation.xF / 100).toFixed(2),
          suspenseAmount: (allocation.suspense / 100).toFixed(2),
          aiSuggestedAllocation: {
            fees: allocation.xF,
            interest: allocation.xI,
            principal: allocation.xP,
            escrow: allocation.xE,
            suspense: allocation.suspense,
            correlationId
          },
          updatedAt: new Date()
        })
        .where(eq(payments.id, paymentId));

      console.log(`[RulesEngine] Stored allocation for payment ${paymentId}`);
    } catch (error) {
      console.error('[RulesEngine] Error storing allocation:', error);
      throw error;
    }
  }

  // Property test: Conservation of cents
  testConservationOfCents(iterations: number = 1000): boolean {
    console.log(`[RulesEngine] Running conservation of cents test (${iterations} iterations)`);
    
    for (let i = 0; i < iterations; i++) {
      // Generate random test case
      const input: WaterfallInput = {
        amountCents: Math.floor(Math.random() * 1000000),
        due: {
          fees: Math.floor(Math.random() * 10000),
          interest: Math.floor(Math.random() * 50000),
          principal: Math.floor(Math.random() * 100000),
          escrowShortage: Math.floor(Math.random() * 20000)
        },
        policy: {
          allowFees: Math.random() > 0.2,
          allowInterest: Math.random() > 0.1,
          allowPrincipal: Math.random() > 0.1,
          allowEscrow: Math.random() > 0.3,
          defaultLoan: Math.random() > 0.8
        }
      };

      const result = this.applyWaterfall(input);
      const total = result.xF + result.xI + result.xP + result.xE + result.suspense;

      if (total !== input.amountCents) {
        console.error(`[RulesEngine] Test failed at iteration ${i}:`, {
          input: input.amountCents,
          output: total,
          difference: input.amountCents - total
        });
        return false;
      }

      // Also check no negative values
      if (result.xF < 0 || result.xI < 0 || result.xP < 0 || result.xE < 0 || result.suspense < 0) {
        console.error(`[RulesEngine] Negative value at iteration ${i}:`, result);
        return false;
      }
    }

    console.log(`[RulesEngine] All ${iterations} tests passed`);
    return true;
  }
}

// Export singleton instance
export const rulesEngine = new RulesEngine();