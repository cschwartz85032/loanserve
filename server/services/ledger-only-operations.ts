/**
 * Ledger-Only Operations Service
 * 
 * Enforces that ALL monetary effects go through the ledger exclusively.
 * Prohibits direct balance updates to maintain double-entry integrity.
 * Every operation is audited with correlation IDs for Phase 9 compliance.
 */

import { randomUUID } from 'crypto';
import { postEvent, PostEventArgs } from '../domain/posting';
import type { LedgerRepository } from '../db/ledger-repository';
import { auditService, COMPLIANCE_EVENTS } from '../compliance/auditService';

export interface LedgerOnlyOperation {
  loanId: number;
  correlationId: string;
  effectiveDate: string;
  schema: string;
  description: string;
  userId?: number;
  metadata?: Record<string, any>;
}

export interface EscrowDisbursementOperation extends LedgerOnlyOperation {
  amount_minor: bigint;
  payee_name: string;
  escrow_type: string;
  available_escrow_minor: bigint;
  disbursement_id: string;
}

export interface PaymentAllocationOperation extends LedgerOnlyOperation {
  payment_amount_minor: bigint;
  allocations: Array<{
    target: string;
    amount_minor: bigint;
    account: string;
  }>;
}

export interface FeeAssessmentOperation extends LedgerOnlyOperation {
  fee_amount_minor: bigint;
  fee_type: string;
  fee_description: string;
}

export class LedgerOnlyOperationsService {
  constructor(private ledgerRepo: LedgerRepository) {}

  /**
   * Process escrow disbursement using ONLY ledger entries
   * Replaces direct balance updates with ledger-derived balances
   */
  async processEscrowDisbursement(operation: EscrowDisbursementOperation): Promise<{ eventId: string }> {
    const correlationId = operation.correlationId || `escrow_disb_${operation.disbursement_id}_${randomUUID()}`;
    
    // Log audit event BEFORE ledger operation
    await auditService.logEvent({
      eventType: COMPLIANCE_EVENTS.ESCROW.DISBURSEMENT_COMPLETED,
      entityType: 'loan',
      entityId: operation.loanId.toString(),
      userId: operation.userId,
      correlationId,
      description: `Escrow disbursement processing: ${operation.escrow_type} - ${operation.payee_name}`,
      details: {
        amount_minor: operation.amount_minor.toString(),
        available_escrow_minor: operation.available_escrow_minor.toString(),
        payee_name: operation.payee_name,
        escrow_type: operation.escrow_type,
        disbursement_id: operation.disbursement_id,
        requires_advance: operation.available_escrow_minor < operation.amount_minor
      },
      metadata: operation.metadata
    });

    const hasInsufficientFunds = operation.available_escrow_minor < operation.amount_minor;
    
    // Create balanced ledger entries ONLY - no direct balance updates
    const postingArgs: PostEventArgs = {
      loanId: operation.loanId,
      effectiveDate: operation.effectiveDate,
      correlationId,
      schema: operation.schema,
      currency: 'USD',
      lines: hasInsufficientFunds ? [
        // Advance from servicer (track via suspense)
        {
          account: 'suspense',
          debitMinor: operation.amount_minor - operation.available_escrow_minor,
          memo: `Escrow advance for ${operation.escrow_type} - ${operation.payee_name}`
        },
        {
          account: 'cash',
          creditMinor: operation.amount_minor - operation.available_escrow_minor,
          memo: 'Advance funded for insufficient escrow'
        },
        // Use available escrow balance
        {
          account: 'escrow_liability',
          debitMinor: operation.available_escrow_minor,
          memo: `${operation.escrow_type} payment to ${operation.payee_name}`
        },
        {
          account: 'cash',
          creditMinor: operation.available_escrow_minor,
          memo: 'Escrow disbursement'
        }
      ] : [
        // Normal disbursement from escrow
        {
          account: 'escrow_liability',
          debitMinor: operation.amount_minor,
          memo: `${operation.escrow_type} payment to ${operation.payee_name}`
        },
        {
          account: 'cash',
          creditMinor: operation.amount_minor,
          memo: `Escrow disbursement to ${operation.payee_name}`
        }
      ]
    };

    try {
      const result = await postEvent(this.ledgerRepo, postingArgs);
      
      // Log successful completion
      await auditService.logEvent({
        eventType: COMPLIANCE_EVENTS.ACCOUNTING.LEDGER_EVENT_CREATED,
        entityType: 'loan',
        entityId: operation.loanId.toString(),
        userId: operation.userId,
        correlationId,
        description: `Ledger event created for escrow disbursement: ${result.eventId}`,
        details: {
          event_id: result.eventId,
          disbursement_id: operation.disbursement_id,
          amount_minor: operation.amount_minor.toString(),
          schema: operation.schema
        }
      });

      return result;
    } catch (error) {
      // Log failure
      await auditService.logEvent({
        eventType: COMPLIANCE_EVENTS.ACCOUNTING.LEDGER_ERROR,
        entityType: 'loan',
        entityId: operation.loanId.toString(),
        userId: operation.userId,
        correlationId,
        description: `Ledger operation failed for escrow disbursement`,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          disbursement_id: operation.disbursement_id,
          amount_minor: operation.amount_minor.toString()
        }
      });
      throw error;
    }
  }

  /**
   * Process payment allocation using ONLY ledger entries
   */
  async processPaymentAllocation(operation: PaymentAllocationOperation): Promise<{ eventId: string }> {
    const correlationId = operation.correlationId || `payment_alloc_${randomUUID()}`;
    
    // Log audit event
    await auditService.logEvent({
      eventType: COMPLIANCE_EVENTS.PAYMENT.ALLOCATED,
      entityType: 'loan',
      entityId: operation.loanId.toString(),
      userId: operation.userId,
      correlationId,
      description: `Payment allocation processing: $${Number(operation.payment_amount_minor) / 100}`,
      details: {
        payment_amount_minor: operation.payment_amount_minor.toString(),
        allocations: operation.allocations.map(a => ({
          target: a.target,
          amount_minor: a.amount_minor.toString(),
          account: a.account
        }))
      }
    });

    // Build balanced ledger entries from allocations
    const lines = [];
    
    // Cash receipt
    lines.push({
      account: 'cash',
      debitMinor: operation.payment_amount_minor,
      memo: `Payment received - Loan ${operation.loanId}`
    });

    // Allocation lines
    for (const allocation of operation.allocations) {
      lines.push({
        account: allocation.account,
        creditMinor: allocation.amount_minor,
        memo: `Payment allocation to ${allocation.target}`
      });
    }

    const result = await postEvent(this.ledgerRepo, {
      loanId: operation.loanId,
      effectiveDate: operation.effectiveDate,
      correlationId,
      schema: operation.schema,
      currency: 'USD',
      lines
    });

    // Log completion
    await auditService.logEvent({
      eventType: COMPLIANCE_EVENTS.ACCOUNTING.LEDGER_EVENT_CREATED,
      entityType: 'loan',
      entityId: operation.loanId.toString(),
      userId: operation.userId,
      correlationId,
      description: `Ledger event created for payment allocation: ${result.eventId}`,
      details: { event_id: result.eventId }
    });

    return result;
  }

  /**
   * Process fee assessment using ONLY ledger entries
   */
  async processFeeAssessment(operation: FeeAssessmentOperation): Promise<{ eventId: string }> {
    const correlationId = operation.correlationId || `fee_assess_${randomUUID()}`;
    
    // Log audit event
    await auditService.logEvent({
      eventType: COMPLIANCE_EVENTS.FEE.ASSESSED,
      entityType: 'loan',
      entityId: operation.loanId.toString(),
      userId: operation.userId,
      correlationId,
      description: `Fee assessment: ${operation.fee_type} - $${Number(operation.fee_amount_minor) / 100}`,
      details: {
        fee_amount_minor: operation.fee_amount_minor.toString(),
        fee_type: operation.fee_type,
        fee_description: operation.fee_description
      }
    });

    const result = await postEvent(this.ledgerRepo, {
      loanId: operation.loanId,
      effectiveDate: operation.effectiveDate,
      correlationId,
      schema: operation.schema,
      currency: 'USD',
      lines: [
        {
          account: `loan_receivable_${operation.loanId}`,
          debitMinor: operation.fee_amount_minor,
          memo: operation.fee_description
        },
        {
          account: 'fee_income',
          creditMinor: operation.fee_amount_minor,
          memo: `${operation.fee_type} fee assessed`
        }
      ]
    });

    // Log completion
    await auditService.logEvent({
      eventType: COMPLIANCE_EVENTS.ACCOUNTING.LEDGER_EVENT_CREATED,
      entityType: 'loan',
      entityId: operation.loanId.toString(),
      userId: operation.userId,
      correlationId,
      description: `Ledger event created for fee assessment: ${result.eventId}`,
      details: { 
        event_id: result.eventId,
        fee_type: operation.fee_type,
        fee_amount_minor: operation.fee_amount_minor.toString()
      }
    });

    return result;
  }

  /**
   * Get derived balance from ledger entries (never stored balances)
   * This replaces direct balance reads with calculated values
   */
  async getDerivedEscrowBalance(loanId: number): Promise<bigint> {
    // Calculate balance from ledger entries only
    const result = await this.ledgerRepo.query(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN account_code LIKE 'escrow%' THEN credit_minor - debit_minor
          ELSE 0
        END
      ), 0) as balance_minor
      FROM general_ledger_entries gle
      JOIN general_ledger_events gev ON gle.event_id = gev.event_id
      WHERE gev.loan_id = $1
    `, [loanId]);
    
    return BigInt(result.rows[0]?.balance_minor || 0);
  }

  /**
   * Get derived loan balances from ledger entries only
   */
  async getDerivedLoanBalances(loanId: number): Promise<{
    principal_minor: bigint;
    interest_minor: bigint;
    fees_minor: bigint;
    escrow_minor: bigint;
  }> {
    const result = await this.ledgerRepo.query(`
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN account_code LIKE 'loan_receivable_%' THEN debit_minor - credit_minor
            ELSE 0
          END
        ), 0) as principal_minor,
        COALESCE(SUM(
          CASE 
            WHEN account_code = 'interest_receivable' THEN debit_minor - credit_minor
            ELSE 0
          END
        ), 0) as interest_minor,
        COALESCE(SUM(
          CASE 
            WHEN account_code = 'fee_receivable' THEN debit_minor - credit_minor
            ELSE 0
          END
        ), 0) as fees_minor,
        COALESCE(SUM(
          CASE 
            WHEN account_code LIKE 'escrow%' THEN credit_minor - debit_minor
            ELSE 0
          END
        ), 0) as escrow_minor
      FROM general_ledger_entries gle
      JOIN general_ledger_events gev ON gle.event_id = gev.event_id
      WHERE gev.loan_id = $1
    `, [loanId]);
    
    const row = result.rows[0] || {};
    return {
      principal_minor: BigInt(row.principal_minor || 0),
      interest_minor: BigInt(row.interest_minor || 0),
      fees_minor: BigInt(row.fees_minor || 0),
      escrow_minor: BigInt(row.escrow_minor || 0)
    };
  }
}