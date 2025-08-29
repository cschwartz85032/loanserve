/**
 * Double-entry ledger posting service
 * All postings must go through this module to enforce idempotency and balance
 */

import { randomUUID } from 'crypto';
import type { GLAccount, Minor, LedgerEntry } from '../../shared/accounting-types';
import type { LedgerRepository } from '../db/ledger-repository';

export type PostingLine = {
  account: GLAccount;
  debitMinor?: bigint;
  creditMinor?: bigint;
  memo?: string;
};

export interface PostEventArgs {
  loanId: number;
  effectiveDate: string;     // ISO date
  correlationId: string;     // required, unique
  schema: string;            // e.g., "posting.payment.v1"
  currency: 'USD' | 'EUR' | 'GBP';
  lines: PostingLine[];      // must balance
}

/**
 * Posts a balanced double-entry event atomically
 * @param repo Ledger repository instance
 * @param args Posting event arguments
 * @returns Object with eventId
 * @throws Error if unbalanced or duplicate correlationId
 */
export async function postEvent(
  repo: LedgerRepository, 
  args: PostEventArgs
): Promise<{ eventId: string }> {
  const eventId = randomUUID();
  
  // Start transaction
  await repo.begin();
  
  try {
    // Create the event
    await repo.createEvent({
      eventId,
      loanId: args.loanId,
      effectiveDate: args.effectiveDate,
      schema: args.schema,
      correlationId: args.correlationId
    });
    
    // Track totals for balance check
    let debitSum = 0n;
    let creditSum = 0n;
    
    // Add each entry
    for (const line of args.lines) {
      // Validate line has exactly one of debit or credit
      const hasDebit = line.debitMinor !== undefined && line.debitMinor > 0n;
      const hasCredit = line.creditMinor !== undefined && line.creditMinor > 0n;
      
      if (hasDebit && hasCredit) {
        throw new Error('Each line must have either debit OR credit, not both');
      }
      if (!hasDebit && !hasCredit) {
        throw new Error('Each line must have either debit or credit');
      }
      
      // Check for negative amounts
      if ((line.debitMinor ?? 0n) < 0n || (line.creditMinor ?? 0n) < 0n) {
        throw new Error('Negative amounts not allowed');
      }
      
      // Track totals
      debitSum += line.debitMinor ?? 0n;
      creditSum += line.creditMinor ?? 0n;
      
      // Add the entry
      await repo.addEntry({
        eventId,
        loanId: args.loanId,
        account: line.account,
        debitMinor: line.debitMinor,
        creditMinor: line.creditMinor,
        currency: args.currency,
        memo: line.memo
      });
    }
    
    // Verify balance
    if (debitSum !== creditSum) {
      throw new Error(`Event unbalanced: debit=${debitSum} credit=${creditSum}`);
    }
    
    if (debitSum === 0n) {
      throw new Error('Event has no entries or zero amounts');
    }
    
    // Finalize the event (runs stored procedure to double-check balance)
    await repo.finalizeEvent(eventId);
    
    // Commit transaction
    await repo.commit();
    
    // Log audit event for every ledger operation (Phase 9 requirement)
    try {
      const { auditService, COMPLIANCE_EVENTS } = await import('../compliance/auditService');
      await auditService.logEvent({
        eventType: COMPLIANCE_EVENTS.ACCOUNTING.LEDGER_EVENT_CREATED,
        entityType: 'loan',
        entityId: args.loanId.toString(),
        correlationId: args.correlationId,
        description: `Ledger event created: ${args.schema}`,
        details: {
          event_id: eventId,
          schema: args.schema,
          effective_date: args.effectiveDate,
          currency: args.currency,
          line_count: args.lines.length,
          debit_total: debitSum.toString(),
          credit_total: creditSum.toString()
        }
      });
    } catch (auditError) {
      // Don't fail the transaction for audit issues, but log the problem
      console.error('[PostEvent] Audit logging failed:', auditError);
    }
    
    return { eventId };
    
  } catch (error) {
    // Rollback on any error
    await repo.rollback();
    throw error;
  }
}

/**
 * Post a payment received
 * @param repo Ledger repository
 * @param loanId Loan ID
 * @param amountMinor Payment amount in minor units
 * @param effectiveDate Effective date of payment
 * @param correlationId Unique correlation ID
 * @param allocations How payment was allocated
 */
export async function postPaymentReceived(
  repo: LedgerRepository,
  loanId: number,
  amountMinor: bigint,
  effectiveDate: string,
  correlationId: string,
  allocations: Array<{ account: GLAccount; amountMinor: bigint; memo?: string }>
): Promise<{ eventId: string }> {
  const lines: PostingLine[] = [];
  
  // Debit cash for total payment
  lines.push({
    account: 'cash',
    debitMinor: amountMinor,
    memo: 'Payment received'
  });
  
  // Credit each allocation
  for (const alloc of allocations) {
    if (alloc.amountMinor > 0n) {
      lines.push({
        account: alloc.account,
        creditMinor: alloc.amountMinor,
        memo: alloc.memo
      });
    }
  }
  
  return postEvent(repo, {
    loanId,
    effectiveDate,
    correlationId,
    schema: 'posting.payment.v1',
    currency: 'USD',
    lines
  });
}

/**
 * Post interest accrual
 * @param repo Ledger repository
 * @param loanId Loan ID
 * @param interestMinor Interest amount in minor units
 * @param effectiveDate Effective date of accrual
 * @param correlationId Unique correlation ID
 */
export async function postInterestAccrual(
  repo: LedgerRepository,
  loanId: number,
  interestMinor: bigint,
  effectiveDate: string,
  correlationId: string
): Promise<{ eventId: string }> {
  return postEvent(repo, {
    loanId,
    effectiveDate,
    correlationId,
    schema: 'posting.accrual.v1',
    currency: 'USD',
    lines: [
      {
        account: 'interest_receivable',
        debitMinor: interestMinor,
        memo: 'Daily interest accrual'
      },
      {
        account: 'interest_income',
        creditMinor: interestMinor,
        memo: 'Interest earned'
      }
    ]
  });
}

/**
 * Post fee assessment
 * @param repo Ledger repository
 * @param loanId Loan ID
 * @param feeMinor Fee amount in minor units
 * @param feeType Type of fee (late, nsf, etc.)
 * @param effectiveDate Effective date of fee
 * @param correlationId Unique correlation ID
 */
export async function postFeeAssessment(
  repo: LedgerRepository,
  loanId: number,
  feeMinor: bigint,
  feeType: string,
  effectiveDate: string,
  correlationId: string
): Promise<{ eventId: string }> {
  return postEvent(repo, {
    loanId,
    effectiveDate,
    correlationId,
    schema: 'posting.fee.v1',
    currency: 'USD',
    lines: [
      {
        account: 'fees_receivable',
        debitMinor: feeMinor,
        memo: `${feeType} fee assessed`
      },
      {
        account: 'fee_income',
        creditMinor: feeMinor,
        memo: `${feeType} fee income`
      }
    ]
  });
}

/**
 * Post escrow payment
 * @param repo Ledger repository
 * @param loanId Loan ID
 * @param escrowMinor Escrow amount in minor units
 * @param payee Escrow payee
 * @param effectiveDate Effective date
 * @param correlationId Unique correlation ID
 */
export async function postEscrowPayment(
  repo: LedgerRepository,
  loanId: number,
  escrowMinor: bigint,
  payee: string,
  effectiveDate: string,
  correlationId: string
): Promise<{ eventId: string }> {
  return postEvent(repo, {
    loanId,
    effectiveDate,
    correlationId,
    schema: 'posting.escrow.v1',
    currency: 'USD',
    lines: [
      {
        account: 'escrow_liability',
        debitMinor: escrowMinor,
        memo: `Escrow payment to ${payee}`
      },
      {
        account: 'cash',
        creditMinor: escrowMinor,
        memo: `Payment to ${payee}`
      }
    ]
  });
}

/**
 * Post loan origination (initial funding)
 * @param repo Ledger repository
 * @param loanId Loan ID
 * @param principalMinor Loan amount in minor units
 * @param effectiveDate Origination date
 * @param correlationId Unique correlation ID
 */
export async function postLoanOrigination(
  repo: LedgerRepository,
  loanId: number,
  principalMinor: bigint,
  effectiveDate: string,
  correlationId: string
): Promise<{ eventId: string }> {
  return postEvent(repo, {
    loanId,
    effectiveDate,
    correlationId,
    schema: 'posting.origination.v1',
    currency: 'USD',
    lines: [
      {
        account: 'loan_principal',
        debitMinor: principalMinor,
        memo: 'Loan origination - principal balance'
      },
      {
        account: 'cash',
        creditMinor: principalMinor,
        memo: 'Loan funding disbursement'
      }
    ]
  });
}

/**
 * Post charge-off
 * @param repo Ledger repository
 * @param loanId Loan ID
 * @param amountMinor Charge-off amount in minor units
 * @param effectiveDate Effective date
 * @param correlationId Unique correlation ID
 */
export async function postChargeOff(
  repo: LedgerRepository,
  loanId: number,
  amountMinor: bigint,
  effectiveDate: string,
  correlationId: string,
  reason: string = 'Loan charged off'
): Promise<{ eventId: string }> {
  return postEvent(repo, {
    loanId,
    effectiveDate,
    correlationId,
    schema: 'posting.chargeoff.v1',
    currency: 'USD',
    lines: [
      {
        account: 'writeoff_expense',
        debitMinor: amountMinor,
        memo: reason
      },
      {
        account: 'loan_principal',
        creditMinor: amountMinor,
        memo: 'Principal written off'
      }
    ]
  });
}

/**
 * Reverse a previously posted event (creates a reversing entry)
 * @param repo Ledger repository
 * @param originalEventId Event ID to reverse
 * @param effectiveDate Reversal date
 * @param correlationId Unique correlation ID for reversal
 * @param reason Reason for reversal
 */
export async function reverseEvent(
  repo: LedgerRepository,
  originalEventId: string,
  effectiveDate: string,
  correlationId: string,
  reason: string
): Promise<{ eventId: string }> {
  // Get original event entries
  const originalEntries = await repo.getEventEntries(originalEventId);
  
  if (originalEntries.length === 0) {
    throw new Error(`Event ${originalEventId} not found`);
  }
  
  // Create reversing entries (swap debits and credits)
  const lines: PostingLine[] = originalEntries.map(entry => ({
    account: entry.account,
    debitMinor: entry.creditMinor, // Swap
    creditMinor: entry.debitMinor, // Swap
    memo: `Reversal: ${reason}`
  }));
  
  return postEvent(repo, {
    loanId: originalEntries[0].loanId,
    effectiveDate,
    correlationId,
    schema: 'posting.reversal.v1',
    currency: 'USD',
    lines
  });
}