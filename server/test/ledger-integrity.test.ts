/**
 * Ledger Integrity Acceptance Tests
 * Tests golden loan scenarios to verify balanced ledger and compliance
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../db';
import { LedgerOnlyOperationsService } from '../services/ledger-only-operations';
import { LedgerRepository } from '../db/ledger-repository';
import { auditService } from '../compliance/auditService';

describe('Ledger Integrity - Golden Loan Scenarios', () => {
  let ledgerService: LedgerOnlyOperationsService;
  let ledgerRepo: LedgerRepository;
  let testLoanId: number;

  beforeEach(async () => {
    // Setup test database
    await db.execute('BEGIN');
    
    // Create test loan
    const loanResult = await db.query(`
      INSERT INTO loans (
        loan_number, borrower_name, original_amount, 
        current_balance, interest_rate, status
      ) VALUES (
        'TEST-001', 'Test Borrower', 250000.00,
        250000.00, 5.50, 'active'
      ) RETURNING id
    `);
    testLoanId = loanResult.rows[0].id;
    
    // Initialize services
    ledgerRepo = new LedgerRepository(db);
    ledgerService = new LedgerOnlyOperationsService(ledgerRepo);
  });

  afterEach(async () => {
    await db.execute('ROLLBACK');
  });

  it('should maintain ledger balance through payment allocation', async () => {
    const correlationId = `test_payment_${Date.now()}`;
    const paymentAmount = BigInt(150000); // $1,500.00
    
    // Process payment allocation
    await ledgerService.processPaymentAllocation({
      loanId: testLoanId,
      correlationId,
      effectiveDate: '2025-08-29',
      schema: 'payment.allocation.test.v1',
      description: 'Test payment allocation',
      payment_amount_minor: paymentAmount,
      allocations: [
        { target: 'principal', amount_minor: BigInt(100000), account: `loan_receivable_${testLoanId}` },
        { target: 'interest', amount_minor: BigInt(30000), account: 'interest_receivable' },
        { target: 'escrow', amount_minor: BigInt(20000), account: 'escrow_liability' }
      ]
    });

    // Verify ledger balance
    const balanceResult = await db.query(`
      SELECT 
        SUM(debit_minor) as total_debit,
        SUM(credit_minor) as total_credit
      FROM general_ledger_entries gle
      JOIN general_ledger_events gev ON gle.event_id = gev.event_id
      WHERE gev.correlation_id = $1
    `, [correlationId]);

    const { total_debit, total_credit } = balanceResult.rows[0];
    expect(total_debit).toBe(total_credit);
    expect(total_debit).toBe(paymentAmount.toString());

    // Verify audit trail exists
    const auditResult = await db.query(`
      SELECT COUNT(*) as audit_count
      FROM compliance_audit_log
      WHERE correlation_id = $1
      AND event_type LIKE 'ACCOUNTING.%'
    `, [correlationId]);

    expect(Number(auditResult.rows[0].audit_count)).toBeGreaterThan(0);
  });

  it('should handle escrow disbursement with insufficient funds', async () => {
    const correlationId = `test_escrow_${Date.now()}`;
    const disbursementAmount = BigInt(120000); // $1,200.00
    const availableEscrow = BigInt(80000); // $800.00
    
    // Process escrow disbursement
    await ledgerService.processEscrowDisbursement({
      loanId: testLoanId,
      correlationId,
      effectiveDate: '2025-08-29',
      schema: 'escrow.disbursement.test.v1',
      description: 'Test escrow disbursement with advance',
      amount_minor: disbursementAmount,
      payee_name: 'Tax Authority',
      escrow_type: 'property_tax',
      available_escrow_minor: availableEscrow,
      disbursement_id: 'TEST-DISB-001'
    });

    // Verify advance is properly recorded
    const advanceResult = await db.query(`
      SELECT 
        SUM(CASE WHEN account_code = 'suspense' THEN debit_minor ELSE 0 END) as advance_amount,
        SUM(debit_minor) as total_debit,
        SUM(credit_minor) as total_credit
      FROM general_ledger_entries gle
      JOIN general_ledger_events gev ON gle.event_id = gev.event_id
      WHERE gev.correlation_id = $1
    `, [correlationId]);

    const { advance_amount, total_debit, total_credit } = advanceResult.rows[0];
    expect(total_debit).toBe(total_credit);
    expect(advance_amount).toBe((disbursementAmount - availableEscrow).toString());

    // Verify audit compliance
    const auditResult = await db.query(`
      SELECT event_type, description
      FROM compliance_audit_log
      WHERE correlation_id = $1
      ORDER BY created_at
    `, [correlationId]);

    expect(auditResult.rows.length).toBeGreaterThan(0);
    expect(auditResult.rows.some(row => 
      row.event_type === 'ESCROW.DISBURSEMENT_COMPLETED'
    )).toBe(true);
  });

  it('should derive balances from ledger entries only', async () => {
    // Create multiple transactions
    const transactions = [
      {
        correlationId: `test_principal_${Date.now()}`,
        amount: BigInt(100000),
        target: 'principal'
      },
      {
        correlationId: `test_interest_${Date.now()}`,
        amount: BigInt(15000),
        target: 'interest'
      },
      {
        correlationId: `test_escrow_${Date.now()}`,
        amount: BigInt(25000),
        target: 'escrow'
      }
    ];

    // Process each transaction
    for (const txn of transactions) {
      await ledgerService.processPaymentAllocation({
        loanId: testLoanId,
        correlationId: txn.correlationId,
        effectiveDate: '2025-08-29',
        schema: 'payment.allocation.test.v1',
        description: `Test ${txn.target} payment`,
        payment_amount_minor: txn.amount,
        allocations: [{
          target: txn.target,
          amount_minor: txn.amount,
          account: txn.target === 'escrow' ? 'escrow_liability' : 
                   txn.target === 'interest' ? 'interest_receivable' : 
                   `loan_receivable_${testLoanId}`
        }]
      });
    }

    // Get derived balances
    const balances = await ledgerService.getDerivedLoanBalances(testLoanId);

    // Verify balances are calculated correctly from ledger
    expect(balances.principal_minor).toBe(BigInt(-100000)); // Credits reduce receivable
    expect(balances.interest_minor).toBe(BigInt(-15000));
    expect(balances.escrow_minor).toBe(BigInt(25000)); // Credits increase liability

    // Verify no direct balance updates occurred
    const directUpdateResult = await db.query(`
      SELECT COUNT(*) as violation_count
      FROM compliance_audit_log
      WHERE event_type = 'ACCOUNTING.DIRECT_UPDATE_BLOCKED'
      AND entity_id = $1
    `, [testLoanId.toString()]);

    expect(Number(directUpdateResult.rows[0].violation_count)).toBe(0);
  });

  it('should enforce double-entry constraints', async () => {
    const correlationId = `test_constraint_${Date.now()}`;
    
    // Attempt unbalanced transaction (should fail)
    const unbalancedOperation = ledgerService.processPaymentAllocation({
      loanId: testLoanId,
      correlationId,
      effectiveDate: '2025-08-29',
      schema: 'payment.allocation.test.v1',
      description: 'Intentionally unbalanced test',
      payment_amount_minor: BigInt(100000),
      allocations: [
        { target: 'principal', amount_minor: BigInt(50000), account: `loan_receivable_${testLoanId}` }
        // Missing $500 allocation - should cause imbalance
      ]
    });

    await expect(unbalancedOperation).rejects.toThrow(/unbalanced/);
  });

  it('should prevent negative amounts in ledger entries', async () => {
    // Attempt negative amount (should fail at constraint level)
    const negativeOperation = async () => {
      await db.query(`
        INSERT INTO general_ledger_events (event_id, loan_id, effective_date, schema, correlation_id)
        VALUES ($1, $2, $3, $4, $5)
      `, ['test-negative', testLoanId, '2025-08-29', 'test.negative.v1', `negative_${Date.now()}`]);
      
      await db.query(`
        INSERT INTO general_ledger_entries (event_id, account_code, account_name, debit_minor, credit_minor)
        VALUES ($1, $2, $3, $4, $5)
      `, ['test-negative', 'cash', 'Cash Account', BigInt(-1000), BigInt(0)]);
    };

    await expect(negativeOperation()).rejects.toThrow(/check_no_negative_amounts/);
  });

  it('should require unique correlation IDs', async () => {
    const duplicateCorrelationId = `duplicate_${Date.now()}`;
    
    // First transaction should succeed
    await ledgerService.processPaymentAllocation({
      loanId: testLoanId,
      correlationId: duplicateCorrelationId,
      effectiveDate: '2025-08-29',
      schema: 'payment.allocation.test.v1',
      description: 'First transaction',
      payment_amount_minor: BigInt(100000),
      allocations: [{
        target: 'principal',
        amount_minor: BigInt(100000),
        account: `loan_receivable_${testLoanId}`
      }]
    });

    // Second transaction with same correlation ID should fail
    const duplicateOperation = ledgerService.processPaymentAllocation({
      loanId: testLoanId,
      correlationId: duplicateCorrelationId,
      effectiveDate: '2025-08-29',
      schema: 'payment.allocation.test.v1',
      description: 'Duplicate correlation ID',
      payment_amount_minor: BigInt(50000),
      allocations: [{
        target: 'interest',
        amount_minor: BigInt(50000),
        account: 'interest_receivable'
      }]
    });

    await expect(duplicateOperation).rejects.toThrow(/duplicate key value violates unique constraint/);
  });
});