/**
 * Payment waterfall allocator
 * Allocates payments according to configured bucket priority
 */

import type { BucketName, Outstanding, Allocation, Minor } from '../../shared/accounting-types';

/**
 * Allocates payment across buckets according to configured order
 * @param paymentMinor Payment amount to allocate
 * @param waterfall Ordered list of buckets
 * @param outstanding Outstanding amounts for each bucket
 * @returns Array of allocations
 */
export function allocatePayment(
  paymentMinor: bigint,
  waterfall: readonly BucketName[],
  outstanding: Outstanding
): Allocation[] {
  const allocations: Allocation[] = [];
  let remaining = paymentMinor;
  
  // Map bucket names to outstanding amounts
  const bucketAmounts: Record<BucketName, bigint> = {
    'fees_due': outstanding.feesDueMinor,
    'interest_past_due': outstanding.interestPastDueMinor,
    'interest_current': outstanding.interestCurrentMinor,
    'principal': outstanding.principalMinor,
    'escrow': outstanding.escrowMinor,
    'future': 0n // Future payments have no limit
  };
  
  // Allocate according to waterfall order
  for (const bucket of waterfall) {
    if (remaining <= 0n) break;
    
    const needed = bucket === 'future' 
      ? remaining // Future bucket takes all remaining
      : bucketAmounts[bucket] ?? 0n;
    
    const allocated = needed < remaining ? needed : remaining;
    
    if (allocated > 0n) {
      allocations.push({
        bucket,
        appliedMinor: allocated
      });
      remaining -= allocated;
    }
  }
  
  return allocations;
}

/**
 * Convert allocations to GL account postings
 * @param allocations Payment allocations
 * @returns Array of GL accounts and amounts for posting
 */
export function allocationsToPostings(
  allocations: Allocation[]
): Array<{ account: 'fees_receivable' | 'interest_receivable' | 'loan_principal' | 'escrow_liability' | 'suspense'; amountMinor: bigint; memo: string }> {
  const postings = [];
  
  for (const alloc of allocations) {
    switch (alloc.bucket) {
      case 'fees_due':
        postings.push({
          account: 'fees_receivable' as const,
          amountMinor: alloc.appliedMinor,
          memo: 'Fees paid'
        });
        break;
        
      case 'interest_past_due':
      case 'interest_current':
        postings.push({
          account: 'interest_receivable' as const,
          amountMinor: alloc.appliedMinor,
          memo: alloc.bucket === 'interest_past_due' ? 'Past due interest paid' : 'Current interest paid'
        });
        break;
        
      case 'principal':
        postings.push({
          account: 'loan_principal' as const,
          amountMinor: alloc.appliedMinor,
          memo: 'Principal reduction'
        });
        break;
        
      case 'escrow':
        postings.push({
          account: 'escrow_liability' as const,
          amountMinor: alloc.appliedMinor,
          memo: 'Escrow deposit'
        });
        break;
        
      case 'future':
        postings.push({
          account: 'suspense' as const,
          amountMinor: alloc.appliedMinor,
          memo: 'Prepayment / Future payment'
        });
        break;
    }
  }
  
  return postings;
}

/**
 * Calculate outstanding amounts from current balances
 * @param principalBalance Current principal balance
 * @param accruedInterest Total accrued interest
 * @param currentInterest Interest for current period
 * @param unpaidFees Total unpaid fees
 * @param escrowRequired Required escrow amount
 * @returns Outstanding amounts object
 */
export function calculateOutstanding(
  principalBalance: bigint,
  accruedInterest: bigint,
  currentInterest: bigint,
  unpaidFees: bigint,
  escrowRequired: bigint
): Outstanding {
  // Past due interest is total accrued minus current period
  const pastDueInterest = accruedInterest > currentInterest 
    ? accruedInterest - currentInterest 
    : 0n;
  
  return {
    feesDueMinor: unpaidFees,
    interestPastDueMinor: pastDueInterest,
    interestCurrentMinor: currentInterest,
    principalMinor: principalBalance,
    escrowMinor: escrowRequired
  };
}

/**
 * Check if payment satisfies minimum required amount
 * @param paymentMinor Payment amount
 * @param minPaymentMinor Minimum required payment
 * @param waterfall Payment waterfall order
 * @param outstanding Outstanding amounts
 * @returns True if payment meets minimum requirement
 */
export function meetsMinimumPayment(
  paymentMinor: bigint,
  minPaymentMinor: bigint,
  waterfall: readonly BucketName[],
  outstanding: Outstanding
): boolean {
  // Calculate total required for non-principal buckets
  let requiredMinor = 0n;
  
  for (const bucket of waterfall) {
    if (bucket === 'principal' || bucket === 'future') continue;
    
    switch (bucket) {
      case 'fees_due':
        requiredMinor += outstanding.feesDueMinor;
        break;
      case 'interest_past_due':
        requiredMinor += outstanding.interestPastDueMinor;
        break;
      case 'interest_current':
        requiredMinor += outstanding.interestCurrentMinor;
        break;
      case 'escrow':
        requiredMinor += outstanding.escrowMinor;
        break;
    }
  }
  
  // Payment must cover at least the required amount or minimum, whichever is less
  const effectiveMinimum = requiredMinor < minPaymentMinor ? requiredMinor : minPaymentMinor;
  return paymentMinor >= effectiveMinimum;
}

/**
 * Calculate shortage amount if payment doesn't meet requirements
 * @param paymentMinor Payment amount
 * @param scheduledPaymentMinor Scheduled payment amount
 * @param waterfall Payment waterfall order
 * @param outstanding Outstanding amounts
 * @returns Shortage amount (0n if no shortage)
 */
export function calculateShortage(
  paymentMinor: bigint,
  scheduledPaymentMinor: bigint,
  waterfall: readonly BucketName[],
  outstanding: Outstanding
): bigint {
  // Allocate the payment
  const allocations = allocatePayment(paymentMinor, waterfall, outstanding);
  
  // Calculate what should have been paid
  let expectedPayment = 0n;
  
  // Add all non-principal, non-future outstanding amounts
  for (const bucket of waterfall) {
    if (bucket === 'future') break; // Stop at future bucket
    
    switch (bucket) {
      case 'fees_due':
        expectedPayment += outstanding.feesDueMinor;
        break;
      case 'interest_past_due':
        expectedPayment += outstanding.interestPastDueMinor;
        break;
      case 'interest_current':
        expectedPayment += outstanding.interestCurrentMinor;
        break;
      case 'escrow':
        expectedPayment += outstanding.escrowMinor;
        break;
      case 'principal':
        // For principal, use the scheduled amount minus what was already applied
        const principalApplied = allocations
          .filter(a => a.bucket === 'principal')
          .reduce((sum, a) => sum + a.appliedMinor, 0n);
        const principalExpected = scheduledPaymentMinor > expectedPayment 
          ? scheduledPaymentMinor - expectedPayment 
          : 0n;
        expectedPayment += principalExpected;
        break;
    }
  }
  
  // Shortage is the difference between expected and actual payment
  return expectedPayment > paymentMinor ? expectedPayment - paymentMinor : 0n;
}

/**
 * Determine if loan is delinquent based on outstanding amounts
 * @param outstanding Outstanding amounts
 * @returns True if loan has past due amounts
 */
export function isDelinquent(outstanding: Outstanding): boolean {
  return outstanding.interestPastDueMinor > 0n || outstanding.feesDueMinor > 0n;
}

/**
 * Calculate total amount due
 * @param outstanding Outstanding amounts
 * @param includeFullPrincipal Include full principal balance
 * @returns Total amount due
 */
export function calculateTotalDue(
  outstanding: Outstanding,
  includeFullPrincipal: boolean = false
): bigint {
  let total = outstanding.feesDueMinor +
              outstanding.interestPastDueMinor +
              outstanding.interestCurrentMinor +
              outstanding.escrowMinor;
  
  if (includeFullPrincipal) {
    total += outstanding.principalMinor;
  }
  
  return total;
}